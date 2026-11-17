// organizations - corporate groups, legal entities, public bodies, non-profits, retailers.
// Spec 5.3. A group and its legal entities are separate documents.

import { array, assert, date, enums, object, objectIdValidation, optional, string } from "lesan";
import { assertDocumentCaps } from "../utils/domain/caps.ts";
import {
  IDENTIFIER_STATUSES,
  ORGANIZATION_IDENTIFIER_SCHEMES,
  ORGANIZATION_KINDS,
} from "../utils/domain/constants.ts";
import {
  aliasStruct,
  cappedArray,
  docMetaFields,
  documentStruct,
  identityProvenanceStruct,
  localizedNameStruct,
  mergeableFields,
} from "./shared.ts";

export const organizationIdentifierStruct = object({
  _id: objectIdValidation,
  scheme: enums(ORGANIZATION_IDENTIFIER_SCHEMES),
  value: string(),
  normalizedValue: string(),
  jurisdiction: optional(string()),
  issuer: optional(string()),
  status: enums(IDENTIFIER_STATUSES),
  sourceSnapshotIds: optional(array(objectIdValidation)),
});

export const organizationLegalProfileStruct = object({
  jurisdiction: optional(string()),
  legalForm: optional(string()),
  incorporationDate: optional(date()),
  registeredAddress: optional(string()),
});

export const organizationFields = {
  name: string(),
  normalizedName: string(),
  matchKey: string(),
  localizedNames: optional(cappedArray(localizedNameStruct, "localizedNames")),
  kind: enums(ORGANIZATION_KINDS),
  aliases: cappedArray(aliasStruct, "aliases"),
  identifiers: cappedArray(organizationIdentifierStruct, "identifiers"),
  legalProfile: optional(organizationLegalProfileStruct),
  website: optional(string()),
  operatingCountryCodes: optional(array(string())),
  identityProvenance: optional(identityProvenanceStruct),
  description: optional(string()),
  ...mergeableFields(),
  ...docMetaFields(),
};

export const organizationStruct = documentStruct(organizationFields);

export function validateOrganization(doc: unknown): void {
  assertDocumentCaps("organizations", doc);
  assert(doc, organizationStruct);
}
