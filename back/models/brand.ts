// brands - market-facing brand identity. Spec 5.2.
//
// No owner field exists on Brand. Ownership/control is a Relationship edge.

import { assert, objectIdValidation, optional, string } from "lesan";
import { assertDocumentCaps } from "../utils/domain/caps.ts";
import {
  aliasStruct,
  cappedArray,
  docMetaFields,
  documentStruct,
  identityProvenanceStruct,
  localizedNameStruct,
  mergeableFields,
} from "./shared.ts";

export const brandFields = {
  name: string(),
  normalizedName: string(),
  matchKey: string(),
  localizedNames: optional(cappedArray(localizedNameStruct, "localizedNames")),
  aliases: cappedArray(aliasStruct, "aliases"),
  description: optional(string()),
  website: optional(string()),
  logoAssetId: optional(objectIdValidation),
  identityProvenance: optional(identityProvenanceStruct),
  ...mergeableFields(),
  ...docMetaFields(),
};

export const brandStruct = documentStruct(brandFields);

export function validateBrand(doc: unknown): void {
  assertDocumentCaps("brands", doc);
  assert(doc, brandStruct);
}
