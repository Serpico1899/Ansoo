// Plan 08 - every canonical field is classified into exactly one projection level.
import { assert, assertEquals, assertThrows } from "@std/assert";
import { assetFields } from "../../models/asset.ts";
import { auditEventFields } from "../../models/auditEvent.ts";
import { brandFields } from "../../models/brand.ts";
import { claimFields } from "../../models/claim.ts";
import { correctionFields } from "../../models/correction.ts";
import { organizationFields } from "../../models/organization.ts";
import { productFields } from "../../models/product.ts";
import { relationshipFields } from "../../models/relationship.ts";
import { sourceFields } from "../../models/source.ts";
import { sourceSnapshotFields } from "../../models/sourceSnapshot.ts";
import { userFields } from "../../models/user.ts";
import {
  assertCompleteClassification,
  type CanonicalCollection,
  FIELD_CLASSIFICATION,
  projectDocument,
  PROJECTION_LEVELS,
  type ProjectionLevel,
} from "../../utils/projections/mod.ts";

const RELATION_FIELDS: Record<string, readonly string[]> = {
  products: ["brand"],
  source_snapshots: ["source"],
  brands: ["productsPreview"],
  sources: ["recentSnapshotsPreview"],
};

const MODEL_FIELDS: Record<string, Record<string, unknown>> = {
  assets: assetFields,
  audit_events: auditEventFields,
  brands: brandFields,
  claims: claimFields,
  corrections: correctionFields,
  organizations: organizationFields,
  products: productFields,
  relationships: relationshipFields,
  source_snapshots: sourceSnapshotFields,
  sources: sourceFields,
  users: userFields,
};

const RANK: Record<ProjectionLevel, number> = { PUBLIC: 0, RESEARCH: 1, ADMIN: 2 };

function collectKeys(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectKeys(item, prefix));
  if (value === null || typeof value !== "object" || value instanceof Date) return [];
  if (value.constructor && value.constructor.name === "ObjectId") return [];
  return Object.keys(value as Record<string, unknown>).flatMap((
    key,
  ) => [
    `${prefix}${key}`,
    ...collectKeys((value as Record<string, unknown>)[key], `${prefix}${key}.`),
  ]);
}

function topLevel(map: Record<string, ProjectionLevel>): string[] {
  return Object.keys(map).filter((key) => !key.includes(".")).sort();
}

Deno.test("projections: every model field is classified at a known level", () => {
  assertCompleteClassification();
  assertEquals(Object.keys(FIELD_CLASSIFICATION).sort(), Object.keys(MODEL_FIELDS).sort());
  for (const [collection, fields] of Object.entries(MODEL_FIELDS)) {
    const key = collection as CanonicalCollection;
    assertEquals(
      topLevel(FIELD_CLASSIFICATION[key]),
      ["_id", ...Object.keys(fields), ...(RELATION_FIELDS[collection] ?? [])].sort(),
      collection,
    );
    for (const level of Object.values(FIELD_CLASSIFICATION[key])) {
      assert(
        (PROJECTION_LEVELS as readonly string[]).includes(level),
        `${collection} has invalid level`,
      );
    }
  }
});

function collectStructPaths(struct: unknown, prefix = ""): string[] {
  if (struct === null || typeof struct !== "object") return [];
  const value = struct as { type?: string; schema?: unknown };
  const type = value.type;
  if (type === "object" && value.schema !== null && typeof value.schema === "object") {
    return Object.entries(value.schema as Record<string, unknown>).flatMap(([key, child]) => {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      return [path, ...collectStructPaths(child, path)];
    });
  }
  if (type === "optional" || type === "nullable" || type === "array") {
    return collectStructPaths(value.schema, prefix);
  }
  if (type === "union" && Array.isArray(value.schema)) {
    return value.schema.flatMap((child) => collectStructPaths(child, prefix));
  }
  return [];
}

function hasClassification(map: Record<string, ProjectionLevel>, path: string): boolean {
  let current = path;
  while (true) {
    if (map[current] !== undefined) return true;
    const dot = current.lastIndexOf(".");
    if (dot < 0) return false;
    current = current.slice(0, dot);
  }
}

Deno.test("projections: every nested model field is covered by a classification", () => {
  for (const [collection, fields] of Object.entries(MODEL_FIELDS)) {
    const map = FIELD_CLASSIFICATION[collection as CanonicalCollection];
    const nested = Object.entries(fields).flatMap(([key, struct]) => [
      key,
      ...collectStructPaths(struct, key),
    ]);
    for (const path of nested) {
      assert(
        hasClassification(map, path),
        `${collection}.${path} is not classified`,
      );
    }
  }
});

Deno.test("projections: unclassified fields fail closed", () => {
  const doc = { _id: "x", name: "Product", mysteryInternalField: "secret" };
  assertThrows(
    () => projectDocument("products", doc, "ADMIN"),
    Error,
    "unclassified",
  );
});

Deno.test("projections: nested path overrides remove internal subfields", () => {
  const doc = {
    _id: "p1",
    name: "Soap",
    normalizedName: "soap",
    matchKey: "secret-match-key",
    identifiers: [{
      scheme: "GTIN_13",
      value: "0123456789012",
      normalizedValue: "0123456789012",
      status: "VERIFIED",
      sourceSnapshotIds: ["restricted-snapshot"],
    }],
    brandMapping: {
      status: "CONFIRMED",
      candidateBrandId: "candidate",
      rationale: "internal rationale",
      reviewedBy: "reviewer",
      evidenceSnapshotIds: ["private"],
    },
    identityProvenance: { sourceSnapshotIds: ["private"] },
    lifecycle: "ACTIVE",
  };
  const publicDoc = projectDocument("products", doc, "PUBLIC");
  const keys = collectKeys(publicDoc);
  assert(!keys.includes("matchKey"));
  assert(!keys.includes("identifiers.sourceSnapshotIds"));
  assert(!keys.includes("brandMapping.candidateBrandId"));
  assert(!keys.includes("brandMapping.rationale"));
  assert(!keys.includes("identityProvenance"));
  assertEquals((publicDoc as { name: string }).name, "Soap");

  const researchDoc = projectDocument("products", doc, "RESEARCH");
  assert(collectKeys(researchDoc).includes("matchKey"));
  assert(collectKeys(researchDoc).includes("identifiers.sourceSnapshotIds"));
});

Deno.test("projections: levels are monotonic and no public document exposes score", () => {
  const doc = {
    _id: "p1",
    name: "Soap",
    normalizedName: "soap",
    matchKey: "m",
    identifiers: [],
    brandMapping: { status: "UNMAPPED" },
    lifecycle: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    schemaVersion: 1,
    version: 1,
  };
  const levels: ProjectionLevel[] = ["PUBLIC", "RESEARCH", "ADMIN"];
  const keys = levels.map((level) => collectKeys(projectDocument("products", doc, level)));
  for (let i = 1; i < keys.length; i++) {
    for (const key of keys[i - 1]) {
      assert(keys[i].includes(key), `${levels[i]} drops ${levels[i - 1]} field ${key}`);
    }
  }
  for (const key of keys[0]) {
    assert(!/score|verdict|badge|rating/i.test(key), `public key ${key} is score-like`);
  }
  assertEquals(RANK.PUBLIC < RANK.RESEARCH && RANK.RESEARCH < RANK.ADMIN, true);
});
