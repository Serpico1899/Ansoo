// assets - metadata and lifecycle for bytes stored outside MongoDB. Spec 8.3.
//
// Asset bytes never enter MongoDB. Object keys are internal and never public.

import {
  assert,
  boolean,
  date,
  enums,
  number,
  object,
  objectIdValidation,
  optional,
  string,
} from "lesan";
import { assertDocumentCaps } from "../utils/domain/caps.ts";
import {
  ASSET_LIFECYCLE,
  ASSET_PROCESSING_STATUSES,
  ASSET_STORAGE_PROVIDERS,
  ASSET_VISIBILITY,
} from "../utils/domain/constants.ts";
import { documentStruct, malwareScanStruct, sha256Struct } from "./shared.ts";

export const assetStorageStruct = object({
  provider: enums(ASSET_STORAGE_PROVIDERS),
  bucket: optional(string()),
  objectKey: string(),
});

export const assetFields = {
  storage: assetStorageStruct,
  originalFileName: optional(string()),
  safeDisplayName: optional(string()),
  mimeType: string(),
  byteSize: number(),
  sha256: sha256Struct,
  processingStatus: enums(ASSET_PROCESSING_STATUSES),
  visibility: enums(ASSET_VISIBILITY),
  uploadedBy: optional(objectIdValidation),
  uploadedAt: date(),
  malwareScan: optional(malwareScanStruct),
  exifStripped: boolean(),
  retentionUntil: optional(date()),
  legalHold: boolean(),
  lifecycle: enums(ASSET_LIFECYCLE),
  version: number(),
  schemaVersion: number(),
};

export const assetStruct = documentStruct(assetFields);

export function validateAsset(doc: unknown): void {
  assertDocumentCaps("assets", doc);
  assert(doc, assetStruct);
}
