// source_snapshots - immutable captures of a Source at a point in time. Spec 8.2.
//
// No version and no mutable updatedAt. A metadata correction is a new document.

import {
  assert,
  date,
  enums,
  literal,
  nullable,
  number,
  object,
  objectIdValidation,
  optional,
  string,
} from "lesan";
import { assertDocumentCaps } from "../utils/domain/caps.ts";
import {
  ACQUISITION_TIERS,
  CAPTURE_METHODS,
  HASH_ALGORITHMS,
  REDACTION_METHODS,
  SNAPSHOT_LIFECYCLE,
} from "../utils/domain/constants.ts";
import { capturedContentHashStruct, captureMetadataStruct, documentStruct } from "./shared.ts";

export const redactionStruct = object({
  redactedAssetId: objectIdValidation,
  reason: string(),
  redactedAt: date(),
  redactedBy: objectIdValidation,
  method: enums(REDACTION_METHODS),
  originalRetained: literal(true),
});

export const sourceSnapshotFields = {
  titleAtCapture: optional(string()),
  canonicalUrlAtCapture: optional(string()),
  publishedAt: optional(nullable(date())),
  retrievedAt: date(),
  contentHash: capturedContentHashStruct,
  hashAlgorithm: enums(HASH_ALGORITHMS),
  mimeType: optional(string()),
  byteSize: optional(number()),
  assetId: optional(objectIdValidation),
  captureMethod: enums(CAPTURE_METHODS),
  acquisitionTier: enums(ACQUISITION_TIERS),
  capturedBy: optional(objectIdValidation),
  captureMetadata: captureMetadataStruct,
  supersedesSnapshotId: optional(objectIdValidation),
  supersededBySnapshotId: optional(objectIdValidation),
  redaction: optional(redactionStruct),
  lifecycle: enums(SNAPSHOT_LIFECYCLE),
  schemaVersion: number(),
  createdAt: date(),
};

export const sourceSnapshotStruct = documentStruct(sourceSnapshotFields);

export function validateSourceSnapshot(doc: unknown): void {
  assertDocumentCaps("source_snapshots", doc);
  assert(doc, sourceSnapshotStruct);
}
