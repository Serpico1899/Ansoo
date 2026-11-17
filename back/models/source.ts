// sources - identity of an information source, not a particular capture. Spec 8.1.
//
// No latestSnapshotId pointer and no universal reliability score exist.

import { assert, boolean, date, enums, objectIdValidation, optional, string } from "lesan";
import { assertDocumentCaps } from "../utils/domain/caps.ts";
import { SOURCE_ACCESS, SOURCE_LIFECYCLE, SOURCE_TYPES } from "../utils/domain/constants.ts";
import { docMetaFields, documentStruct } from "./shared.ts";

export const sourceFields = {
  title: string(),
  canonicalUrl: optional(string()),
  sourceType: enums(SOURCE_TYPES),
  publisherName: optional(string()),
  publisherOrganizationId: optional(objectIdValidation),
  publisherVerified: boolean(),
  language: optional(string()),
  countryCode: optional(string()),
  jurisdiction: optional(string()),
  access: enums(SOURCE_ACCESS),
  usageTerms: optional(string()),
  licenseCode: optional(string()),
  attributionRequired: boolean(),
  lifecycle: enums(SOURCE_LIFECYCLE),
  lastCapturedAt: optional(date()),
  ...docMetaFields(),
};

export const sourceStruct = documentStruct(sourceFields);

export function validateSource(doc: unknown): void {
  assertDocumentCaps("sources", doc);
  assert(doc, sourceStruct);
}
