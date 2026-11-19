// corrections - submitted correction/completion/retraction proposals. Spec 9.1.
//
// Approval is not application. No raw patch is applied from this document.

import {
  assert,
  date,
  enums,
  number,
  object,
  objectIdValidation,
  optional,
  refine,
  string,
  unknown,
} from "lesan";
import type { Struct } from "lesan";
import { assertDocumentCaps, DomainValidationError } from "../utils/domain/caps.ts";
import {
  CORRECTION_APPLICATION_RESULTS,
  CORRECTION_OPERATIONS,
  CORRECTION_STATUSES,
  CORRECTION_SUBMISSION_KINDS,
  CORRECTION_TARGET_TYPES,
  RELATIONSHIP_ENDPOINT_TYPES,
} from "../utils/domain/constants.ts";
import { cappedArray, docMetaFields, documentStruct, entityRefStruct } from "./shared.ts";

export const correctionEvidenceReferenceStruct = object({
  sourceSnapshotId: optional(objectIdValidation),
  assetId: optional(objectIdValidation),
  url: optional(string()),
  note: optional(string()),
});

export const correctionReviewStruct = object({
  assignedTo: optional(objectIdValidation),
  reviewedBy: optional(objectIdValidation),
  reviewedAt: optional(date()),
  decisionReason: optional(string()),
});

export const correctionApplicationStruct = object({
  appliedAt: optional(date()),
  appliedBy: optional(objectIdValidation),
  targetVersionBefore: optional(number()),
  targetVersionAfter: optional(number()),
  result: enums(CORRECTION_APPLICATION_RESULTS),
  failureReason: optional(string()),
  idempotencyKey: string(),
});

export const publicCorrectionNoticeStruct = object({
  correctedAt: date(),
  reason: string(),
  previousWording: string(),
  auditEventId: objectIdValidation,
});

export const correctionFields = {
  target: optional(entityRefStruct(CORRECTION_TARGET_TYPES)),
  submissionKind: enums(CORRECTION_SUBMISSION_KINDS),
  proposedChange: optional(object({
    fieldKey: string(),
    operation: enums(CORRECTION_OPERATIONS),
    proposedValue: optional(unknown()),
    proposedEntity: optional(entityRefStruct(RELATIONSHIP_ENDPOINT_TYPES)),
  })),
  reason: string(),
  evidenceReferences: cappedArray(correctionEvidenceReferenceStruct, "evidenceReferences"),
  submittedBy: objectIdValidation,
  submittedAt: date(),
  // Caller-supplied HMAC of the client IP. Never the raw address; used only
  // for the per-IP daily quota in Plan 07.
  submissionIpHash: optional(string()),
  idempotencyKey: string(),
  status: enums(CORRECTION_STATUSES),
  review: correctionReviewStruct,
  application: optional(correctionApplicationStruct),
  publicNotice: optional(publicCorrectionNoticeStruct),
  ...docMetaFields(),
};

function validateTargetRule(doc: unknown): true | string {
  if (doc === null || typeof doc !== "object") return "correction must be an object";
  const value = doc as { target?: unknown; submissionKind?: string };
  if (value.target === undefined && value.submissionKind !== "ADD_MISSING") {
    return "target is required unless submissionKind is ADD_MISSING";
  }
  return true;
}

export const correctionStruct = refine(
  documentStruct(correctionFields) as unknown as Struct<unknown, unknown>,
  "correction_target_rule",
  validateTargetRule,
);

export function validateCorrection(doc: unknown): void {
  assertDocumentCaps("corrections", doc);
  assert(doc, correctionStruct);
  const value = doc as { target?: unknown; submissionKind?: string };
  if (value.target !== undefined && value.submissionKind === "ADD_MISSING") {
    throw new DomainValidationError(
      "INVALID_CORRECTION_TARGET",
      "ADD_MISSING must not carry an existing target",
    );
  }
}
