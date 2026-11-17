// MVP search baseline. Spec 13.5.
//
// Exact matchKey plus escaped prefix on normalizedName. No fuzzy matching,
// stemming, typo tolerance, or cross-collection borrowing. Merged tombstones
// are excluded from normal results and redirect when addressed directly.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { ENTITY_COLLECTION, type EntityType } from "../domain/constants.ts";
import { matchKey, normalizeName } from "./normalize.ts";
import { createEntityRegistry } from "./registry.ts";

export type SearchEntityType = "PRODUCT" | "BRAND" | "ORGANIZATION";
export type SearchResult = {
  type: SearchEntityType;
  id: ObjectId;
  name: string;
  normalizedName: string;
  matchKey: string;
};

const SEARCH_TYPES: readonly SearchEntityType[] = ["PRODUCT", "BRAND", "ORGANIZATION"];
const MAX_LIMIT = 50;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertTypes(types: readonly string[]): asserts types is readonly SearchEntityType[] {
  for (const type of types) {
    if (!(SEARCH_TYPES as readonly string[]).includes(type)) {
      throw new Error(`unsupported search entity type: ${type}`);
    }
  }
}

export async function searchEntities(input: {
  db: Db;
  query: string;
  types?: readonly SearchEntityType[];
  limit?: number;
}): Promise<{ state: "FOUND" | "EMPTY"; results: SearchResult[] }> {
  const types = input.types ?? SEARCH_TYPES;
  assertTypes(types);
  const limit = Math.max(1, Math.min(input.limit ?? 20, MAX_LIMIT));
  const normalized = normalizeName(input.query ?? "");
  const key = matchKey(input.query ?? "");
  if (!normalized && !key) return { state: "EMPTY", results: [] };

  const prefix = new RegExp(`^${escapeRegex(normalized)}`);
  const results: SearchResult[] = [];

  for (const type of types) {
    const collection = ENTITY_COLLECTION[type];
    const docs = await input.db.collection(collection).find({
      lifecycle: "ACTIVE",
      $or: [
        ...(key ? [{ matchKey: key }] : []),
        ...(normalized ? [{ normalizedName: prefix }] : []),
      ],
    }).limit(limit).toArray();

    for (const doc of docs) {
      results.push({
        type,
        id: doc._id as ObjectId,
        name: String(doc.name),
        normalizedName: String(doc.normalizedName),
        matchKey: String(doc.matchKey),
      });
    }
  }

  results.sort((left, right) => {
    const leftExact = left.matchKey === key ? 0 : 1;
    const rightExact = right.matchKey === key ? 0 : 1;
    if (leftExact !== rightExact) return leftExact - rightExact;
    if (left.type !== right.type) return left.type.localeCompare(right.type);
    return left.name.localeCompare(right.name);
  });

  const seen = new Set<string>();
  const deduped = results.filter((item) => {
    const identity = `${item.type}|${item.id}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).slice(0, limit);

  return deduped.length === 0
    ? { state: "EMPTY", results: [] }
    : { state: "FOUND", results: deduped };
}

export async function findEntityByRef(input: {
  db: Db;
  ref: { type: string; id: ObjectId | string };
}): Promise<
  | {
    state: "FOUND";
    entity: Record<string, unknown> & { _id: ObjectId };
    mergedFrom: ObjectId[];
    notice?: string;
  }
  | { state: "NOT_FOUND" }
> {
  const type = input.ref.type as EntityType;
  if (!SEARCH_TYPES.includes(type as SearchEntityType)) return { state: "NOT_FOUND" };
  const registry = createEntityRegistry(input.db);
  try {
    const resolved = await registry.resolve("audit.target", input.ref);
    return {
      state: "FOUND",
      entity: resolved.doc,
      mergedFrom: resolved.mergedFrom,
      ...(resolved.mergedFrom.length > 0
        ? { notice: `this record was merged into ${resolved.doc._id.toString()}` }
        : {}),
    };
  } catch {
    return { state: "NOT_FOUND" };
  }
}
