// products - exact trade item / packaging configuration. Spec 5.1.
//
// Product.brand is the only identity relation; it is declared in models/mod.ts
// because Lesan owns the embedded snapshot. No category relation exists.

import {
  array,
  assert,
  boolean,
  date,
  enums,
  nullable,
  number,
  object,
  objectIdValidation,
  optional,
  string,
  union,
} from "lesan";
import { assertDocumentCaps } from "../utils/domain/caps.ts";
import {
  BRAND_MAPPING_STATUSES,
  IDENTIFIER_STATUSES,
  PRODUCT_ATTRIBUTE_KEYS,
  PRODUCT_IDENTIFIER_SCHEMES,
} from "../utils/domain/constants.ts";
import {
  cappedArray,
  categoryCodeStruct,
  docMetaFields,
  documentStruct,
  identityProvenanceStruct,
  localizedNameStruct,
  mergeableFields,
} from "./shared.ts";

export const productIdentifierStruct = object({
  _id: objectIdValidation,
  scheme: enums(PRODUCT_IDENTIFIER_SCHEMES),
  value: string(),
  normalizedValue: string(),
  matchValue: optional(string()),
  jurisdiction: optional(string()),
  issuer: optional(string()),
  status: enums(IDENTIFIER_STATUSES),
  sourceSnapshotIds: optional(array(objectIdValidation)),
  validFrom: optional(nullable(date())),
  validTo: optional(nullable(date())),
});

export const productAttributeStruct = object({
  key: enums(PRODUCT_ATTRIBUTE_KEYS),
  value: union([string(), number(), boolean()]),
  unit: optional(string()),
  locale: optional(string()),
  sourceSnapshotId: optional(objectIdValidation),
});

export const productBrandMappingStruct = object({
  status: enums(BRAND_MAPPING_STATUSES),
  candidateBrandId: optional(objectIdValidation),
  rationale: optional(string()),
  reviewedAt: optional(date()),
  reviewedBy: optional(objectIdValidation),
  evidenceSnapshotIds: optional(array(objectIdValidation)),
});

export const productPackagingStruct = object({
  netContentValue: optional(number()),
  netContentUnit: optional(string()),
  packCount: optional(number()),
  packageType: optional(string()),
  variant: optional(string()),
});

export const productFields = {
  name: string(),
  normalizedName: string(),
  matchKey: string(),
  localizedNames: optional(cappedArray(localizedNameStruct, "localizedNames")),
  description: optional(string()),
  identifiers: cappedArray(productIdentifierStruct, "identifiers"),
  categoryCode: optional(categoryCodeStruct),
  brandMapping: productBrandMappingStruct,
  identityProvenance: optional(identityProvenanceStruct),
  packaging: optional(productPackagingStruct),
  attributes: optional(cappedArray(productAttributeStruct, "attributes")),
  ...mergeableFields(),
  ...docMetaFields(),
};

export const productStruct = documentStruct(productFields);

export function validateProduct(doc: unknown): void {
  assertDocumentCaps("products", doc);
  assert(doc, productStruct);
}
