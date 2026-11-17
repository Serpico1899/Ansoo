// claims - research propositions not adequately represented by a typed edge.
// Spec 7. Exactly three claim types and three structured-value shapes.

import { assert, date, enums, nullable, number, object, optional, refine, string } from "lesan";
import type { Struct } from "lesan";
import { assertDocumentCaps, DomainValidationError } from "../utils/domain/caps.ts";
import {
  CLAIM_ABOUT_TYPES,
  CLAIM_TYPES,
  DATE_PRECISIONS,
  FINDING_RECORD_LIFECYCLE,
  RELATIONSHIP_ENDPOINT_TYPES,
} from "../utils/domain/constants.ts";
import {
  cappedArray,
  cappedString,
  claimStructuredValueStruct,
  docMetaFields,
  documentStruct,
  entityRefStruct,
  evidenceAssessmentStruct,
  evidenceLinkStruct,
  localizedNameStruct,
  organizationResponseStruct,
  publicationGateStruct,
  publicationStateStruct,
  researchNoteStruct,
  responseSolicitationStruct,
  reviewWorkflowStruct,
  revisionPreviewStruct,
  sensitivityStruct,
} from "./shared.ts";

export const claimScopeStruct = object({
  marketCountryCode: optional(string()),
  jurisdiction: optional(string()),
  validFrom: optional(nullable(date())),
  validTo: optional(nullable(date())),
  datePrecision: optional(enums(DATE_PRECISIONS)),
});

export const claimFields = {
  about: entityRefStruct(CLAIM_ABOUT_TYPES),
  relatedEntities: optional(cappedArray(
    entityRefStruct(RELATIONSHIP_ENDPOINT_TYPES),
    "relatedEntities",
  )),
  claimType: enums(CLAIM_TYPES),
  claimTypeRegistryVersion: number(),
  statement: cappedString("statement"),
  publicWording: optional(cappedString("publicWording")),
  localizedStatements: optional(cappedArray(localizedNameStruct, "localizedNames")),
  structuredValue: claimStructuredValueStruct,
  scope: optional(claimScopeStruct),
  sensitivity: sensitivityStruct,
  recordLifecycle: enums(FINDING_RECORD_LIFECYCLE),
  review: reviewWorkflowStruct,
  assessment: evidenceAssessmentStruct,
  publication: publicationStateStruct,
  publicationGate: optional(publicationGateStruct),
  evidence: cappedArray(evidenceLinkStruct, "evidence"),
  organizationResponses: cappedArray(organizationResponseStruct, "organizationResponses"),
  responseSolicitations: cappedArray(responseSolicitationStruct, "responseSolicitations"),
  researchNotes: cappedArray(researchNoteStruct, "researchNotes"),
  recentRevisionPreview: cappedArray(revisionPreviewStruct, "recentRevisionPreview"),
  recordedAt: date(),
  ...docMetaFields(),
};

export function validateClaimTypeMatch(doc: unknown): void {
  if (doc === null || typeof doc !== "object") {
    throw new DomainValidationError("INVALID_CLAIM", "claim must be an object");
  }
  const value = doc as { claimType?: string; structuredValue?: { claimType?: string } };
  if (!value.claimType || !(CLAIM_TYPES as readonly string[]).includes(value.claimType)) {
    throw new DomainValidationError(
      "UNKNOWN_CLAIM_TYPE",
      `claimType ${String(value.claimType)} is not in the v3.1 registry`,
    );
  }
  if (value.structuredValue?.claimType !== value.claimType) {
    throw new DomainValidationError(
      "CLAIM_TYPE_MISMATCH",
      "structuredValue.claimType must equal claimType",
      { claimType: value.claimType, structuredValueType: value.structuredValue?.claimType },
    );
  }
}

export const claimStruct = refine(
  documentStruct(claimFields) as unknown as Struct<unknown, unknown>,
  "claim_type_match",
  (value: unknown) => {
    try {
      validateClaimTypeMatch(value);
      return true;
    } catch (error) {
      return (error as Error).message;
    }
  },
);

export function validateClaim(doc: unknown): void {
  assertDocumentCaps("claims", doc);
  assert(doc, claimStruct);
}
