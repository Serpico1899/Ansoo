// relationships - directed, typed, scoped, time-aware graph edges. Spec 6.
//
// subject/object are plain typed references, never Lesan relations.

import { assert, date, enums, number, object, optional, refine, string } from "lesan";
import type { Struct } from "lesan";
import { assertDocumentCaps, DomainValidationError } from "../utils/domain/caps.ts";
import {
  FINDING_RECORD_LIFECYCLE,
  PREDICATE_MATRIX,
  RELATIONSHIP_ENDPOINT_TYPES,
  RELATIONSHIP_PREDICATES,
} from "../utils/domain/constants.ts";
import {
  cappedArray,
  cappedString,
  docMetaFields,
  documentStruct,
  entityRefStruct,
  evidenceAssessmentStruct,
  evidenceLinkStruct,
  organizationResponseStruct,
  ownershipStruct,
  publicationGateStruct,
  publicationStateStruct,
  researchNoteStruct,
  responseSolicitationStruct,
  reviewWorkflowStruct,
  revisionPreviewStruct,
  sensitivityStruct,
  validityStruct,
} from "./shared.ts";

export const relationshipContextStruct = object({
  marketCountryCode: optional(string()),
  jurisdiction: optional(string()),
  ownership: optional(ownershipStruct),
  notes: optional(string()),
});

export const relationshipFields = {
  subject: entityRefStruct(RELATIONSHIP_ENDPOINT_TYPES),
  predicate: enums(RELATIONSHIP_PREDICATES),
  predicateRegistryVersion: number(),
  object: entityRefStruct(RELATIONSHIP_ENDPOINT_TYPES),
  context: optional(relationshipContextStruct),
  validity: validityStruct,
  sensitivity: sensitivityStruct,
  recordLifecycle: enums(FINDING_RECORD_LIFECYCLE),
  review: reviewWorkflowStruct,
  assessment: evidenceAssessmentStruct,
  publication: publicationStateStruct,
  publicationGate: optional(publicationGateStruct),
  publicWording: optional(cappedString("publicWording")),
  evidence: cappedArray(evidenceLinkStruct, "evidence"),
  organizationResponses: cappedArray(organizationResponseStruct, "organizationResponses"),
  responseSolicitations: cappedArray(responseSolicitationStruct, "responseSolicitations"),
  researchNotes: cappedArray(researchNoteStruct, "researchNotes"),
  recentRevisionPreview: cappedArray(revisionPreviewStruct, "recentRevisionPreview"),
  canonicalKey: optional(string()),
  recordedAt: date(),
  ...docMetaFields(),
};

type RelationshipShape = {
  subject?: { type?: string };
  predicate?: string;
  object?: { type?: string };
  context?: {
    marketCountryCode?: string;
    ownership?: { basis?: string };
  };
};

function hasRequiredContext(
  doc: RelationshipShape,
  required: string,
): boolean {
  if (required === "ownership.basis") return Boolean(doc.context?.ownership?.basis);
  if (required === "marketCountryCode") return Boolean(doc.context?.marketCountryCode);
  return false;
}

export function validateRelationshipMatrix(doc: unknown): void {
  if (doc === null || typeof doc !== "object") {
    throw new DomainValidationError("INVALID_RELATIONSHIP", "relationship must be an object");
  }
  const value = doc as RelationshipShape;
  const predicate = value.predicate;
  if (!predicate || !(predicate in PREDICATE_MATRIX)) {
    throw new DomainValidationError(
      "UNKNOWN_PREDICATE",
      `predicate ${String(predicate)} is not in the v3.1 registry`,
    );
  }
  const rule = PREDICATE_MATRIX[predicate as keyof typeof PREDICATE_MATRIX];
  const subjectType = value.subject?.type;
  const objectType = value.object?.type;
  if (!subjectType || !(rule.subjectTypes as readonly string[]).includes(subjectType)) {
    throw new DomainValidationError(
      "INVALID_RELATIONSHIP_ENDPOINT",
      `${predicate} subject must be one of ${rule.subjectTypes.join(", ")}`,
      { endpoint: "subject", actual: subjectType },
    );
  }
  if (!objectType || !(rule.objectTypes as readonly string[]).includes(objectType)) {
    throw new DomainValidationError(
      "INVALID_RELATIONSHIP_ENDPOINT",
      `${predicate} object must be one of ${rule.objectTypes.join(", ")}`,
      { endpoint: "object", actual: objectType },
    );
  }
  for (const required of rule.requiredContext) {
    if (!hasRequiredContext(value, required)) {
      throw new DomainValidationError(
        "MISSING_RELATIONSHIP_CONTEXT",
        `${predicate} requires context.${required}`,
        { required },
      );
    }
  }
}

export const relationshipStruct = refine(
  documentStruct(relationshipFields) as unknown as Struct<unknown, unknown>,
  "relationship_matrix",
  (value: unknown) => {
    try {
      validateRelationshipMatrix(value);
      return true;
    } catch (error) {
      return (error as Error).message;
    }
  },
);

export function validateRelationship(doc: unknown): void {
  assertDocumentCaps("relationships", doc);
  assert(doc, relationshipStruct);
}
