// Compile-time and runtime exhaustiveness for the shared v3.1 vocabulary.

import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  assertNever,
  AUDIT_ACTIONS,
  AUDIT_SUMMARY_FORBIDDEN_KEYS,
  CAP_EXCEEDED_CODE,
  CAP_EXCEEDED_STATUS,
  CAPTURE_METADATA_MAX_DEPTH,
  CAPTURE_METADATA_MAX_KEYS,
  CHARACTER_CAPS,
  CLAIM_TYPES,
  type ClaimType,
  CORRECTION_APPLICATION_RESULTS,
  CORRECTION_OPERATIONS,
  CORRECTION_STATUSES,
  CORRECTION_SUBMISSION_KINDS,
  ENTITY_COLLECTION,
  ENTITY_TYPES,
  type EntityType,
  EVIDENCE_ASSESSMENT_OUTCOMES,
  FINDING_RECORD_LIFECYCLE,
  HARD_CAPS,
  hardCapViolation,
  LIMITATION_CODES,
  NON_WAIVABLE_GATE_CHECKS,
  ORGANIZATION_IDENTIFIER_SCHEMES,
  ORGANIZATION_KINDS,
  PREDICATE_MATRIX,
  PRODUCT_ATTRIBUTE_KEYS,
  PRODUCT_IDENTIFIER_SCHEMES,
  PUBLICATION_GATE_CHECKS,
  PUBLICATION_STATUSES,
  RECORD_LIFECYCLE,
  RELATIONSHIP_ENDPOINT_TYPES,
  RELATIONSHIP_PREDICATES,
  type RelationshipPredicate,
  REVIEW_WORKFLOW_STATUSES,
  SECURITY_LIMITS,
  SENSITIVITY_LEVELS,
  SOURCE_TYPES,
  USER_ROLES,
  WAIVABLE_GATE_CHECKS,
} from "../../utils/domain/constants.ts";

// Compile-time exhaustiveness: adding an EntityType, predicate, or claim type
// without updating these switches is a type error.
function entityTypeLabel(type: EntityType): string {
  switch (type) {
    case "PRODUCT":
    case "BRAND":
    case "ORGANIZATION":
    case "RELATIONSHIP":
    case "CLAIM":
    case "SOURCE":
    case "SOURCE_SNAPSHOT":
    case "ASSET":
    case "CORRECTION":
    case "USER":
      return type;
    default:
      return assertNever(type);
  }
}

function predicateLabel(predicate: RelationshipPredicate): string {
  switch (predicate) {
    case "OWNS":
    case "CONTROLS":
    case "MANUFACTURES":
    case "DISTRIBUTES":
    case "IMPORTS_TO_MARKET":
      return PREDICATE_MATRIX[predicate].inverseLabel;
    default:
      return assertNever(predicate);
  }
}

function claimTypeLabel(claimType: ClaimType): string {
  switch (claimType) {
    case "MARKET_PRESENCE":
    case "PRODUCT_ORIGIN":
    case "OFFICIAL_STATEMENT":
      return claimType;
    default:
      return assertNever(claimType);
  }
}

Deno.test("closed entity registry is exactly v3.1 Section 4.1", () => {
  assertEquals(ENTITY_TYPES, [
    "PRODUCT",
    "BRAND",
    "ORGANIZATION",
    "RELATIONSHIP",
    "CLAIM",
    "SOURCE",
    "SOURCE_SNAPSHOT",
    "ASSET",
    "CORRECTION",
    "USER",
  ]);
  assertEquals(ENTITY_TYPES.map(entityTypeLabel), [...ENTITY_TYPES]);
  assertEquals(ENTITY_COLLECTION, {
    PRODUCT: "products",
    BRAND: "brands",
    ORGANIZATION: "organizations",
    RELATIONSHIP: "relationships",
    CLAIM: "claims",
    SOURCE: "sources",
    SOURCE_SNAPSHOT: "source_snapshots",
    ASSET: "assets",
    CORRECTION: "corrections",
    USER: "users",
  });
  assert(!(Object.values(ENTITY_COLLECTION) as readonly string[]).includes("categories"));
});

Deno.test("per-field endpoint allowlists are exact", () => {
  assertEquals(RELATIONSHIP_ENDPOINT_TYPES, ["PRODUCT", "BRAND", "ORGANIZATION"]);
  assertEquals(CLAIM_TYPES.length, 3);
});

Deno.test("exactly five predicates with the spec matrix", () => {
  assertEquals(RELATIONSHIP_PREDICATES, [
    "OWNS",
    "CONTROLS",
    "MANUFACTURES",
    "DISTRIBUTES",
    "IMPORTS_TO_MARKET",
  ]);
  assertEquals(RELATIONSHIP_PREDICATES.map(predicateLabel), [
    "owned by",
    "controlled by",
    "manufactured by",
    "distributed by",
    "imported by",
  ]);
  assertEquals(PREDICATE_MATRIX.OWNS.subjectTypes, ["ORGANIZATION"]);
  assertEquals(PREDICATE_MATRIX.OWNS.objectTypes, ["ORGANIZATION", "BRAND"]);
  assertEquals(PREDICATE_MATRIX.CONTROLS.requiredContext, ["ownership.basis"]);
  assertEquals(PREDICATE_MATRIX.MANUFACTURES.objectTypes, ["PRODUCT"]);
  assertEquals(PREDICATE_MATRIX.DISTRIBUTES.requiredContext, ["marketCountryCode"]);
  assertEquals(PREDICATE_MATRIX.IMPORTS_TO_MARKET.objectTypes, ["PRODUCT"]);
  assert(
    !(RELATIONSHIP_PREDICATES as readonly string[]).includes("SUBSIDIARY_OF"),
    "SUBSIDIARY_OF is a derived label, not a predicate",
  );
});

Deno.test("exactly three claim types, no OTHER escape hatch", () => {
  assertEquals(CLAIM_TYPES, ["MARKET_PRESENCE", "PRODUCT_ORIGIN", "OFFICIAL_STATEMENT"]);
  assertEquals(CLAIM_TYPES.map(claimTypeLabel), [...CLAIM_TYPES]);
  for (const type of CLAIM_TYPES) {
    assert(!type.startsWith("OTHER"), `OTHER claim type is forbidden: ${type}`);
  }
});

Deno.test("status domains are declared separately and closure is exact", () => {
  assertEquals(RECORD_LIFECYCLE, ["ACTIVE", "INACTIVE", "ARCHIVED", "MERGED"]);
  assertEquals(FINDING_RECORD_LIFECYCLE, ["ACTIVE", "ARCHIVED"]);
  assertEquals(REVIEW_WORKFLOW_STATUSES, [
    "NOT_QUEUED",
    "QUEUED",
    "IN_REVIEW",
    "NEEDS_INFORMATION",
    "READY_FOR_DECISION",
    "CLOSED",
  ]);
  assertEquals(EVIDENCE_ASSESSMENT_OUTCOMES, [
    "NOT_ASSESSED",
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "NOT_SUPPORTED",
    "DISPUTED",
    "INCONCLUSIVE",
  ]);
  assertEquals(PUBLICATION_STATUSES, [
    "DRAFT",
    "PENDING_REVIEW",
    "PUBLISHED",
    "WITHHELD",
    "RETRACTED",
  ]);
  assertEquals(SENSITIVITY_LEVELS, ["ROUTINE", "SENSITIVE", "HIGH_RISK"]);
  assertEquals(LIMITATION_CODES.length, 9);
  assert(!(PUBLICATION_STATUSES as readonly string[]).includes("TRUE"));
  assert(!(EVIDENCE_ASSESSMENT_OUTCOMES as readonly string[]).includes("FALSE"));
});

Deno.test("publication gate checks and waivers match v3.1 Section 10.5", () => {
  assertEquals(PUBLICATION_GATE_CHECKS, [
    "evidenceCountOk",
    "independentSourcesOk",
    "assessmentOk",
    "fourEyesOk",
    "legalSignOffOk",
    "rightOfReplyOk",
    "publicWordingOk",
    "sourceAccessOk",
    "noScoreOk",
  ]);
  assertEquals(WAIVABLE_GATE_CHECKS, ["rightOfReplyOk", "independentSourcesOk"]);
  assertEquals(NON_WAIVABLE_GATE_CHECKS, ["fourEyesOk", "legalSignOffOk"]);
});

Deno.test("audit actions are the exact Section 9.3 allowlist", () => {
  const expected = [
    "ENTITY_CREATED",
    "ENTITY_UPDATED",
    "ENTITY_ARCHIVED",
    "ENTITY_MERGED",
    "ENTITY_UNMERGED",
    "IDENTIFIER_ADDED",
    "IDENTIFIER_STATUS_CHANGED",
    "BRAND_MAPPING_REVIEWED",
    "BRAND_RELATION_CHANGED",
    "RELATIONSHIP_CREATED",
    "RELATIONSHIP_CLOSED",
    "CLAIM_CREATED",
    "REVIEW_STATUS_CHANGED",
    "ASSESSMENT_RECORDED",
    "PUBLICATION_GATE_EVALUATED",
    "PUBLICATION_CHANGED",
    "PUBLIC_WORDING_CHANGED",
    "FINDING_RETRACTED",
    "GATE_WAIVER_GRANTED",
    "EVIDENCE_ADDED",
    "EVIDENCE_REMOVED",
    "EVIDENCE_REVIEWED",
    "SOURCE_CREATED",
    "SNAPSHOT_CREATED",
    "SNAPSHOT_SUPERSEDED",
    "SNAPSHOT_REDACTED",
    "SOLICITATION_SENT",
    "SOLICITATION_OUTCOME_RECORDED",
    "ORG_RESPONSE_ADDED",
    "ORG_RESPONSE_PUBLICATION_CHANGED",
    "ASSET_UPLOADED",
    "ASSET_SCAN_COMPLETED",
    "ASSET_PURGED",
    "CORRECTION_SUBMITTED",
    "CORRECTION_REVIEWED",
    "CORRECTION_APPLIED",
    "USER_ROLES_CHANGED",
    "USER_TRUST_CHANGED",
    "USER_STATUS_CHANGED",
    "USER_PII_PURGED",
  ];
  assertEquals(AUDIT_ACTIONS as readonly string[], expected);
  assertEquals(new Set(AUDIT_ACTIONS).size, AUDIT_ACTIONS.length);
  assert(!(AUDIT_ACTIONS as readonly string[]).includes("OTHER"));
  assert((AUDIT_SUMMARY_FORBIDDEN_KEYS as readonly string[]).includes("email"));
  assert((AUDIT_SUMMARY_FORBIDDEN_KEYS as readonly string[]).includes("authSubject"));
});

Deno.test("hard caps match v3.1 Section 4.5 and fail with 422", () => {
  assertEquals(HARD_CAPS, {
    identifiers: 20,
    aliases: 50,
    localizedNames: 10,
    attributes: 40,
    evidence: 50,
    organizationResponses: 20,
    responseSolicitations: 10,
    researchNotes: 100,
    recentRevisionPreview: 20,
    relatedEntities: 10,
    evidenceReferences: 10,
  });
  assertEquals(CHARACTER_CAPS, {
    excerpt: 2_000,
    statement: 2_000,
    publicWording: 2_000,
    rationale: 2_000,
    responseText: 10_000,
    noteBody: 4_000,
  });
  assertEquals(CAPTURE_METADATA_MAX_KEYS, 20);
  assertEquals(CAPTURE_METADATA_MAX_DEPTH, 2);
  assertEquals(hardCapViolation("evidence", 50), null);
  assertEquals(hardCapViolation("evidence", 51), {
    status: CAP_EXCEEDED_STATUS,
    code: CAP_EXCEEDED_CODE,
    path: "evidence",
    cap: 50,
    actual: 51,
  });
});

Deno.test("identifier, source, asset, response, correction, and user vocabularies are closed", () => {
  assertEquals(PRODUCT_IDENTIFIER_SCHEMES.length, 8);
  assert((PRODUCT_IDENTIFIER_SCHEMES as readonly string[]).includes("GTIN"));
  assert((PRODUCT_IDENTIFIER_SCHEMES as readonly string[]).includes("TTAC_UID"));
  assertEquals(ORGANIZATION_IDENTIFIER_SCHEMES, [
    "NATIONAL_ID",
    "REGISTRATION_NUMBER",
    "LEI",
    "TAX_ID",
  ]);
  assertEquals(PRODUCT_ATTRIBUTE_KEYS.length, 5);
  assertEquals(ORGANIZATION_KINDS.length, 7);
  assertEquals(SOURCE_TYPES.length, 9);
  assertEquals(USER_ROLES, [
    "CONTRIBUTOR",
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "LEGAL_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ]);
  assertEquals(CORRECTION_SUBMISSION_KINDS.length, 4);
  assertEquals(CORRECTION_STATUSES.length, 6);
  assertEquals(CORRECTION_OPERATIONS, ["SET", "UNSET", "ADD_RELATIONSHIP", "END_RELATIONSHIP"]);
  assertEquals(CORRECTION_APPLICATION_RESULTS, ["APPLIED", "FAILED", "NOT_APPLICABLE"]);
  assertEquals(SECURITY_LIMITS.publicProfileMaxHops, 2);
  assertEquals(SECURITY_LIMITS.fetcherMaxRedirects, 3);
});

Deno.test("assertNever throws on an unexpected runtime value", () => {
  assertThrows(
    () => assertNever("UNEXPECTED" as never),
    Error,
    "Unexpected value: UNEXPECTED",
  );
});
