// Shared v3.1 embedded contracts.
//
// These are the only definitions of DocMeta, Mergeable, Validity, identity
// helpers, and Section 10 contracts. Models and action validators import them
// instead of duplicating shapes or caps.

import {
  array,
  boolean,
  date,
  enums,
  literal,
  nullable,
  number,
  object,
  objectIdValidation,
  optional,
  pattern,
  record,
  refine,
  string,
  union,
  unknown,
} from "lesan";
import type { Struct } from "lesan";
import { assertCharacterCap } from "../utils/domain/caps.ts";
import {
  AUDIT_ACTOR_TYPES,
  type CharacterCapKey,
  CLAIM_DECLARATION_SURFACES,
  CLAIM_MARKET_CHANNELS,
  CLAIM_OBSERVATION_BASES,
  CLAIM_STATEMENT_CHANNELS,
  DATE_PRECISIONS,
  EVIDENCE_STANCES,
  HARD_CAPS,
  type HardCapKey,
  LIMITATION_CODES,
  MALWARE_SCAN_RESULTS,
  ORG_RESPONSE_PUBLICATION_STATUSES,
  ORG_RESPONSE_RECEIVED_VIA,
  OWNERSHIP_BASES,
  PUBLICATION_GATE_RESULTS,
  PUBLICATION_GATE_VERSION,
  PUBLICATION_STATUSES,
  RECORD_LIFECYCLE,
  REPRESENTATIVE_VERIFICATION_STATUSES,
  RESEARCH_NOTE_VISIBILITIES,
  REVIEW_PRIORITIES,
  REVIEW_WORKFLOW_STATUSES,
  SENSITIVITY_LEVELS,
  SOLICITATION_CHANNELS,
  SOLICITATION_OUTCOMES,
} from "../utils/domain/constants.ts";
import { assertKnownCategoryCode } from "../utils/domain/taxonomy.ts";

// deno-lint-ignore no-explicit-any
export function documentStruct<T extends Record<string, Struct<any, any>>>(fields: T) {
  return object({ _id: optional(objectIdValidation), ...fields });
}

export function docMetaFields() {
  return {
    schemaVersion: number(),
    version: number(),
    createdAt: date(),
    updatedAt: date(),
    createdBy: optional(objectIdValidation),
    updatedBy: optional(objectIdValidation),
  };
}

export function mergeableFields() {
  return {
    lifecycle: enums(RECORD_LIFECYCLE),
    mergedIntoId: optional(objectIdValidation),
    mergedAt: optional(date()),
    mergedBy: optional(objectIdValidation),
    mergeReason: optional(string()),
  };
}

export const validityStruct = object({
  validFrom: optional(nullable(date())),
  validTo: optional(nullable(date())),
  datePrecision: enums(DATE_PRECISIONS),
});

export const sensitivityStruct = enums(SENSITIVITY_LEVELS);

export const aliasStruct = object({
  _id: objectIdValidation,
  value: string(),
  normalizedValue: string(),
  matchKey: string(),
  locale: optional(string()),
  sourceSnapshotId: optional(objectIdValidation),
});

export const localizedNameStruct = object({
  locale: string(),
  value: string(),
});

export const identityProvenanceStruct = object({
  sourceSnapshotIds: optional(array(objectIdValidation)),
  lastVerifiedAt: optional(date()),
  verifiedBy: optional(objectIdValidation),
});

export function cappedArray<T>(item: Struct<T>, path: HardCapKey): Struct<T[]> {
  return refine(
    array(item),
    `cap_${path}`,
    (value: T[]) =>
      value.length <= HARD_CAPS[path] ? true : `CAP_EXCEEDED:${path}:${HARD_CAPS[path]}`,
  );
}

export function cappedString(path: CharacterCapKey) {
  return refine(
    string(),
    `cap_${path}`,
    (value: string) => {
      try {
        assertCharacterCap(path, value);
        return true;
      } catch {
        return `CAP_EXCEEDED:${path}`;
      }
    },
  );
}

export const categoryCodeStruct = refine(
  string(),
  "known_category_code",
  (value: string) => {
    try {
      assertKnownCategoryCode(value);
      return true;
    } catch {
      return "UNKNOWN_CATEGORY_CODE";
    }
  },
);

export const captureMetadataStruct = optional(unknown());

export const entityRefStruct = (types: readonly string[]) =>
  object({
    type: enums(types),
    id: objectIdValidation,
  });

export const evidenceLinkStruct = object({
  _id: objectIdValidation,
  sourceSnapshotId: objectIdValidation,
  stance: enums(EVIDENCE_STANCES),
  locator: optional(object({
    page: optional(number()),
    section: optional(string()),
    paragraph: optional(string()),
    timestamp: optional(string()),
    urlFragment: optional(string()),
  })),
  excerpt: optional(cappedString("excerpt")),
  rationale: optional(cappedString("rationale")),
  addedBy: objectIdValidation,
  addedAt: date(),
  reviewedBy: optional(objectIdValidation),
  reviewedAt: optional(date()),
});

export const reviewWorkflowStruct = object({
  status: enums(REVIEW_WORKFLOW_STATUSES),
  assignedTo: optional(objectIdValidation),
  priority: enums(REVIEW_PRIORITIES),
  openedAt: optional(date()),
  lastActionAt: optional(date()),
  closedAt: optional(date()),
});

export const evidenceAssessmentStruct = object({
  outcome: enums([
    "NOT_ASSESSED",
    "SUPPORTED",
    "PARTIALLY_SUPPORTED",
    "NOT_SUPPORTED",
    "DISPUTED",
    "INCONCLUSIVE",
  ]),
  summary: optional(string()),
  assessedAt: optional(date()),
  assessedBy: optional(objectIdValidation),
  methodologyVersion: string(),
  limitations: array(enums(LIMITATION_CODES)),
});

export const publicationStateStruct = object({
  status: enums(PUBLICATION_STATUSES),
  decidedBy: optional(objectIdValidation),
  decidedAt: optional(date()),
  publishedAt: optional(date()),
  retractedAt: optional(date()),
  retractionReason: optional(string()),
  reason: optional(string()),
});

export const publicationGateStruct = object({
  gateVersion: literal(PUBLICATION_GATE_VERSION),
  evaluatedAt: date(),
  sensitivity: sensitivityStruct,
  checks: object({
    evidenceCountOk: boolean(),
    independentSourcesOk: boolean(),
    assessmentOk: boolean(),
    fourEyesOk: boolean(),
    legalSignOffOk: boolean(),
    rightOfReplyOk: boolean(),
    publicWordingOk: boolean(),
    sourceAccessOk: boolean(),
    noScoreOk: boolean(),
  }),
  result: enums(PUBLICATION_GATE_RESULTS),
  failures: array(string()),
  waivers: array(object({
    check: string(),
    reason: string(),
    approvedBy: objectIdValidation,
    approvedAt: date(),
  })),
});

export const responseSolicitationStruct = object({
  _id: objectIdValidation,
  organizationId: objectIdValidation,
  channel: enums(SOLICITATION_CHANNELS),
  sentAt: date(),
  sentBy: objectIdValidation,
  assertionsSummary: string(),
  responseDeadline: date(),
  outcome: enums(SOLICITATION_OUTCOMES),
  outcomeAt: optional(date()),
  proofAssetId: optional(objectIdValidation),
  responseId: optional(objectIdValidation),
});

export const organizationResponseStruct = object({
  _id: objectIdValidation,
  respondingOrganizationId: objectIdValidation,
  responseText: cappedString("responseText"),
  submittedAt: date(),
  receivedVia: enums(ORG_RESPONSE_RECEIVED_VIA),
  sourceSnapshotId: optional(objectIdValidation),
  attachmentAssetIds: optional(array(objectIdValidation)),
  representativeVerification: object({
    status: enums(REPRESENTATIVE_VERIFICATION_STATUSES),
    basis: optional(string()),
    reviewedBy: optional(objectIdValidation),
    reviewedAt: optional(date()),
  }),
  publicationStatus: enums(ORG_RESPONSE_PUBLICATION_STATUSES),
  reviewedBy: optional(objectIdValidation),
  reviewedAt: optional(date()),
  solicitationId: optional(objectIdValidation),
});

export const researchNoteStruct = object({
  _id: objectIdValidation,
  authorId: objectIdValidation,
  body: cappedString("noteBody"),
  visibility: enums(RESEARCH_NOTE_VISIBILITIES),
  createdAt: date(),
  updatedAt: optional(date()),
});

export const revisionPreviewStruct = object({
  version: number(),
  changedAt: date(),
  changedBy: optional(objectIdValidation),
  reason: string(),
  changedFields: array(string()),
});

export const publicCorrectionNoticeStruct = object({
  correctedAt: date(),
  reason: string(),
  previousWording: string(),
  auditEventId: objectIdValidation,
});

export const claimStructuredValueStruct = union([
  object({
    claimType: literal("MARKET_PRESENCE"),
    marketCountryCode: string(),
    channel: optional(enums(CLAIM_MARKET_CHANNELS)),
    observationBasis: enums(CLAIM_OBSERVATION_BASES),
  }),
  object({
    claimType: literal("PRODUCT_ORIGIN"),
    declaredOriginCountryCode: string(),
    declarationSurface: enums(CLAIM_DECLARATION_SURFACES),
    conflictsWithSnapshotId: optional(objectIdValidation),
  }),
  object({
    claimType: literal("OFFICIAL_STATEMENT"),
    speakingOrganizationId: objectIdValidation,
    statementDate: optional(nullable(date())),
    statementDatePrecision: enums(DATE_PRECISIONS),
    channel: enums(CLAIM_STATEMENT_CHANNELS),
  }),
]);

export const capturedContentHashStruct = pattern(string(), /^[a-f0-9]{64}$/);

export const sha256Struct = pattern(string(), /^[a-f0-9]{64}$/);

export const ownershipStruct = object({
  sharePercentage: optional(number()),
  basis: optional(enums(OWNERSHIP_BASES)),
  notes: optional(string()),
});

export const malwareScanStruct = object({
  engine: optional(string()),
  result: enums(MALWARE_SCAN_RESULTS),
  scannedAt: date(),
});

export function isRelationAbsent(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object") return true;
  return !("_id" in value) || (value as { _id?: unknown })._id === undefined;
}

export const flatSummaryValueStruct = union([
  string(),
  number(),
  boolean(),
  literal(null),
]);

export const flatSummaryStruct = record(string(), flatSummaryValueStruct);

export const auditActorStruct = object({
  type: enums(AUDIT_ACTOR_TYPES),
  id: optional(objectIdValidation),
});
