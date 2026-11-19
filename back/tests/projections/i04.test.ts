// Plan 08 / I04 / S14 - no role or projection request exposes internal data.
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import { USER_ROLES } from "../../utils/domain/constants.ts";
import {
  CANONICAL_COLLECTIONS,
  type CanonicalCollection,
  FIELD_CLASSIFICATION,
  projectDocument,
  type ProjectionLevel,
  projectionLevelForRoles,
  publicCitation,
  publicClaimView,
  publicProductView,
} from "../../utils/projections/mod.ts";

const RANK: Record<ProjectionLevel, number> = { PUBLIC: 0, RESEARCH: 1, ADMIN: 2 };

const SENTINEL = "INTERNAL_SENTINEL";

function buildDoc(collection: CanonicalCollection): Record<string, unknown> {
  const map = FIELD_CLASSIFICATION[collection];
  const doc: Record<string, unknown> = {};
  const paths = Object.keys(map).sort();
  for (const path of paths) {
    const parts = path.split(".");
    let cursor = doc;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof cursor[part] !== "object" || cursor[part] === null) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = `${SENTINEL}:${path}`;
  }
  return doc;
}

const ROLE_MATRIX = [
  { label: "GUEST", roles: [] as const },
  ...USER_ROLES.map((role) => ({ label: role, roles: [role] as const })),
];

function leakedAboveLevel(
  value: unknown,
  collection: CanonicalCollection,
  level: ProjectionLevel,
  path = "",
): string | null {
  if (typeof value === "string" && value.startsWith(SENTINEL)) {
    const fieldPath = value.slice(SENTINEL.length + 1);
    const classified = FIELD_CLASSIFICATION[collection][fieldPath];
    return classified !== undefined && RANK[classified] > RANK[level]
      ? `${path} -> ${fieldPath}`
      : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = leakedAboveLevel(value[i], collection, level, `${path}[${i}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, item] of Object.entries(value)) {
      const found = leakedAboveLevel(item, collection, level, path ? `${path}.${key}` : key);
      if (found) return found;
    }
  }
  return null;
}

Deno.test("I04: role x collection x internal field matrix keeps every cell closed", () => {
  for (const collection of CANONICAL_COLLECTIONS) {
    const doc = buildDoc(collection);
    for (const { label, roles } of ROLE_MATRIX) {
      const level = projectionLevelForRoles(roles);
      const projected = projectDocument(collection, doc, level);
      const leaked = leakedAboveLevel(projected, collection, level);
      assertEquals(leaked, null, `${label} leaked ${collection}: ${leaked}`);
    }
  }
});

Deno.test("I04: guests and contributors are public, reviewers research, admins admin", () => {
  assertEquals(projectionLevelForRoles([]), "PUBLIC");
  assertEquals(projectionLevelForRoles(["CONTRIBUTOR"]), "PUBLIC");
  for (const role of ["RESEARCHER", "RESEARCH_REVIEWER", "LEGAL_REVIEWER", "MODERATOR"]) {
    assertEquals(
      projectionLevelForRoles([role as typeof USER_ROLES[number]]),
      "RESEARCH",
      role,
    );
  }
  assertEquals(projectionLevelForRoles(["ADMIN"]), "ADMIN");
  assertEquals(projectionLevelForRoles(["ADMIN", "CONTRIBUTOR"]), "ADMIN");
});

Deno.test("I04: public views never expose research notes, PII, roles, or private assets", () => {
  const claim = {
    _id: new ObjectId(),
    statement: "Made in Iran",
    claimType: "PRODUCT_ORIGIN",
    structuredValue: { claimType: "PRODUCT_ORIGIN" },
    recordLifecycle: "ACTIVE",
    sensitivity: "HIGH_RISK",
    assessment: { outcome: "SUPPORTED", methodologyVersion: "v1", limitations: [] },
    publication: { status: "PUBLISHED", decidedBy: new ObjectId() },
    researchNotes: [{ _id: new ObjectId(), body: "do not leak", visibility: "INTERNAL_RESEARCH" }],
    evidence: [{
      _id: new ObjectId(),
      sourceSnapshotId: new ObjectId(),
      stance: "SUPPORTS",
      addedBy: new ObjectId(),
      addedAt: new Date(),
      excerpt: "public excerpt",
    }],
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const publicClaim = publicClaimView(claim, []);
  assert(publicClaim !== null);
  assertEquals(publicClaim.evidence, []);

  const snapshot = {
    _id: new ObjectId(),
    recordLifecycle: "ACTIVE",
    lifecycle: "ACTIVE",
    retrievedAt: new Date(),
    contentHash: "a".repeat(64),
  };
  const source = {
    _id: new ObjectId(),
    title: "Register",
    sourceType: "OFFICIAL_REGISTER",
    access: "PUBLIC",
    lifecycle: "ACTIVE",
    recordLifecycle: "ACTIVE",
  };
  const citation = publicCitation({ snapshot, source, asset: null });
  const visible = publicClaimView(claim, [citation]);
  assert(visible !== null);
  assertEquals(JSON.stringify(visible).includes("do not leak"), false);
  assertEquals(JSON.stringify(visible).includes("decidedBy"), false);
  assertEquals(JSON.stringify(visible).includes("addedBy"), false);
  assertEquals(JSON.stringify(visible).includes("sourceSnapshotId"), false);
  assertEquals(JSON.stringify(visible).includes("HIGH_RISK"), false);
  assertEquals(JSON.stringify(visible).includes("roles"), false);
  assertEquals(JSON.stringify(visible).includes("score"), false);
});

Deno.test("I04: published claims cannot reveal restricted sources or private assets", () => {
  const restrictedSource = {
    _id: new ObjectId(),
    title: "Paywalled",
    sourceType: "NEWS",
    access: "RESTRICTED",
    lifecycle: "ACTIVE",
  };
  const snapshot = {
    _id: new ObjectId(),
    recordLifecycle: "ACTIVE",
    lifecycle: "ACTIVE",
    retrievedAt: new Date(),
    contentHash: "b".repeat(64),
  };
  let error: { code?: string } | undefined;
  try {
    publicCitation({ snapshot, source: restrictedSource, asset: null });
  } catch (caught) {
    error = caught as { code?: string };
  }
  assert(error, "restricted source must not produce a public citation");
  assertEquals(error?.code, "RESTRICTED_SOURCE");

  const publicSource = { ...restrictedSource, access: "PUBLIC" };
  const privateAsset = {
    _id: new ObjectId(),
    visibility: "PRIVATE",
    processingStatus: "CLEAN",
    lifecycle: "ACTIVE",
  };
  try {
    publicCitation({ snapshot, source: publicSource, asset: privateAsset });
  } catch (caught) {
    error = caught as { code?: string };
  }
  assertEquals(error?.code, "PRIVATE_ASSET");

  const quarantined = { ...privateAsset, visibility: "PUBLIC", processingStatus: "QUARANTINED" };
  try {
    publicCitation({ snapshot, source: publicSource, asset: quarantined });
  } catch (caught) {
    error = caught as { code?: string };
  }
  assertEquals(error?.code, "UNSAFE_ASSET");
});

Deno.test("I04: merged tombstones expose a redirect but not internal merge metadata", () => {
  const target = new ObjectId();
  const product = {
    _id: new ObjectId(),
    name: "Old Product",
    normalizedName: "old product",
    matchKey: "internal",
    identifiers: [],
    brandMapping: { status: "UNMAPPED" },
    lifecycle: "MERGED",
    mergedIntoId: target,
    mergedAt: new Date(),
    mergedBy: new ObjectId(),
    mergeReason: "duplicate",
    schemaVersion: 1,
    version: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const view = publicProductView(product);
  assertEquals(view.outcome, "MERGED");
  assertEquals(view.product?.mergedIntoId, target.toString());
  assertEquals(JSON.stringify(view).includes("mergedBy"), false);
  assertEquals(JSON.stringify(view).includes("mergeReason"), false);
});

Deno.test("I04: retracted and unpublished findings are absent from public views", () => {
  const base = {
    _id: new ObjectId(),
    statement: "Claim",
    claimType: "PRODUCT_ORIGIN",
    structuredValue: { claimType: "PRODUCT_ORIGIN" },
    recordLifecycle: "ACTIVE",
    sensitivity: "HIGH_RISK",
    assessment: { outcome: "SUPPORTED", methodologyVersion: "v1", limitations: [] },
    publication: { status: "RETRACTED" },
    researchNotes: [],
    evidence: [],
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  assertEquals(publicClaimView(base, []), null);
  assertEquals(
    publicClaimView({ ...base, publication: { status: "DRAFT" } }, []),
    null,
  );
});
