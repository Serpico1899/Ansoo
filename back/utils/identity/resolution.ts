// Product resolution contract. Spec 13.4 and 5.1.
//
// Resolution is exact: scheme + normalized value + applicable jurisdiction.
// It never infers a Product from a Brand, category, barcode prefix, or name
// similarity, and it never chooses arbitrarily between candidates.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { normalizeProductIdentifier } from "./identifier.ts";
import { createEntityRegistry } from "./registry.ts";

export type ResolutionResult =
  | { state: "FOUND"; productId: ObjectId; confidence: "EXACT" }
  | { state: "NOT_FOUND" }
  | { state: "AMBIGUOUS"; candidates: Array<{ productId: ObjectId; reason: string }> }
  | { state: "DISPUTED"; productId: ObjectId; disputeNote: string }
  | { state: "UNVERIFIED"; productId: ObjectId };

type Decision =
  | { kind: "FOUND"; productId: ObjectId }
  | { kind: "DISPUTED"; productId: ObjectId; disputeNote: string }
  | { kind: "UNVERIFIED"; productId: ObjectId };

export async function resolveProduct(input: {
  db: Db;
  scheme: string;
  value: string;
  jurisdiction?: string;
  issuer?: string;
}): Promise<ResolutionResult> {
  const normalized = normalizeProductIdentifier(input.scheme, input.value);
  const scope = {
    ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
    ...(input.issuer ? { issuer: input.issuer } : {}),
  };

  const docs = await input.db.collection("products").find({
    $or: [
      {
        identifiers: {
          $elemMatch: { scheme: normalized.scheme, matchValue: normalized.matchValue, ...scope },
        },
      },
      {
        identifiers: {
          $elemMatch: {
            scheme: normalized.scheme,
            normalizedValue: normalized.normalizedValue,
            ...scope,
          },
        },
      },
    ],
  }).limit(50).toArray();

  const registry = createEntityRegistry(input.db);
  const decisions = new Map<string, Decision>();

  for (const doc of docs) {
    const matched = (Array.isArray(doc.identifiers) ? doc.identifiers : []).filter(
      (identifier: Record<string, unknown>) => {
        if (identifier.scheme !== normalized.scheme) return false;
        if (
          identifier.matchValue !== normalized.matchValue &&
          identifier.normalizedValue !== normalized.normalizedValue
        ) return false;
        if (input.jurisdiction && identifier.jurisdiction !== input.jurisdiction) return false;
        if (input.issuer && identifier.issuer !== input.issuer) return false;
        return true;
      },
    );
    const live = matched.filter((identifier) => identifier.status !== "RETIRED");
    if (live.length === 0) continue;

    let productId = doc._id as ObjectId;
    try {
      const resolved = await registry.resolve("audit.target", {
        type: "PRODUCT",
        id: productId,
      });
      productId = resolved.doc._id;
    } catch {
      continue;
    }

    const disputed = live.find((identifier) => identifier.status === "DISPUTED");
    const verified = live.some((identifier) => identifier.status === "VERIFIED");
    const previous = decisions.get(productId.toString());

    if (disputed || previous?.kind === "DISPUTED") {
      decisions.set(productId.toString(), {
        kind: "DISPUTED",
        productId,
        disputeNote: "identifier status is DISPUTED",
      });
    } else if (verified) {
      decisions.set(productId.toString(), { kind: "FOUND", productId });
    } else if (previous?.kind !== "FOUND") {
      decisions.set(productId.toString(), { kind: "UNVERIFIED", productId });
    }
  }

  const values = [...decisions.values()];
  if (values.length === 0) return { state: "NOT_FOUND" };
  if (values.length > 1) {
    return {
      state: "AMBIGUOUS",
      candidates: values.map((decision) => ({
        productId: decision.productId,
        reason: decision.kind === "FOUND" ? "VERIFIED" : decision.kind,
      })),
    };
  }

  const only = values[0];
  if (only.kind === "FOUND") {
    return { state: "FOUND", productId: only.productId, confidence: "EXACT" };
  }
  if (only.kind === "DISPUTED") {
    return { state: "DISPUTED", productId: only.productId, disputeNote: only.disputeNote };
  }
  return { state: "UNVERIFIED", productId: only.productId };
}
