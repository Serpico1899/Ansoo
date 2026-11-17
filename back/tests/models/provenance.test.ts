// Plan 03 - source, immutable snapshot, and asset contracts.
import { assert, assertThrows } from "@std/assert";
import { ObjectId } from "lesan";
import { accepts } from "./assertions.ts";
import { assetFields, assetStruct, validateAsset } from "../../models/asset.ts";
import { sourceFields, sourceStruct } from "../../models/source.ts";
import { sourceSnapshotStruct, validateSourceSnapshot } from "../../models/sourceSnapshot.ts";
import { assertCaptureMetadata, CapExceededError } from "../../utils/domain/caps.ts";
import {
  CAPTURE_METADATA_ALLOWED_KEYS,
  CAPTURE_METADATA_MAX_KEYS,
} from "../../utils/domain/constants.ts";

const hash = "a".repeat(64);

function sourceDoc(overrides: Record<string, unknown> = {}) {
  return {
    title: "Official registry",
    sourceType: "OFFICIAL_REGISTRY",
    publisherVerified: true,
    access: "PUBLIC",
    attributionRequired: false,
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function snapshotDoc(overrides: Record<string, unknown> = {}) {
  return {
    retrievedAt: new Date(),
    contentHash: hash,
    hashAlgorithm: "SHA256",
    captureMethod: "CRAWLER",
    acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
    lifecycle: "AVAILABLE",
    schemaVersion: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

function assetDoc(overrides: Record<string, unknown> = {}) {
  return {
    storage: { provider: "LOCAL_DEV", objectKey: "assets/a" },
    mimeType: "application/pdf",
    byteSize: 1024,
    sha256: hash,
    processingStatus: "QUARANTINED",
    visibility: "PRIVATE",
    uploadedAt: new Date(),
    exifStripped: false,
    legalHold: false,
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    ...overrides,
  };
}

Deno.test("provenance: source has no latest snapshot pointer or reliability score", () => {
  assert(accepts(sourceStruct, sourceDoc()));
  const fields = Object.keys(sourceFields);
  for (const forbidden of ["latestSnapshotId", "reliabilityScore", "score", "lastSnapshotId"]) {
    assert(!fields.includes(forbidden), `source must not have ${forbidden}`);
  }
  assert(!accepts(sourceStruct, sourceDoc({ latestSnapshotId: new ObjectId() })));
  assert(!accepts(sourceStruct, sourceDoc({ reliabilityScore: 0.9 })));
  assert(!accepts(sourceStruct, sourceDoc({ lifecycle: "MERGED" })));
});

Deno.test("provenance: snapshot is immutable and hashes original bytes", () => {
  assert(accepts(sourceSnapshotStruct, snapshotDoc()));
  assert(!accepts(sourceSnapshotStruct, snapshotDoc({ contentHash: "not-a-sha256" })));
  assert(!accepts(sourceSnapshotStruct, snapshotDoc({ hashAlgorithm: "MD5" })));
  assert(!accepts(sourceSnapshotStruct, snapshotDoc({ version: 1 })));
  assert(!accepts(sourceSnapshotStruct, snapshotDoc({ updatedAt: new Date() })));
  assert(accepts(
    sourceSnapshotStruct,
    snapshotDoc({
      captureMetadata: { httpStatus: 200, finalUrl: "https://example.test/" },
    }),
  ));
  validateSourceSnapshot(snapshotDoc({
    captureMetadata: { httpStatus: 200, finalUrl: "https://example.test/" },
  }));
});

Deno.test("provenance: asset carries metadata only, never bytes", () => {
  assert(accepts(assetStruct, assetDoc()));
  const fields = Object.keys(assetFields);
  for (const forbidden of ["bytes", "base64", "content", "data", "body"]) {
    assert(!fields.includes(forbidden), `asset must not have ${forbidden}`);
  }
  assert(!accepts(assetStruct, assetDoc({ bytes: "AAAA" })));
  assert(!accepts(assetStruct, assetDoc({ sha256: "abc" })));
  assert(!accepts(assetStruct, assetDoc({ processingStatus: "CLEAN" })));
  assert(!accepts(assetStruct, assetDoc({ visibility: "PUBLIC" })));
  validateAsset(assetDoc());
});

Deno.test("provenance: captureMetadata allowlist, key cap, and depth are enforced", () => {
  const allowed = Object.fromEntries(
    CAPTURE_METADATA_ALLOWED_KEYS.slice(0, CAPTURE_METADATA_MAX_KEYS).map((key, index) => [
      key,
      index,
    ]),
  );
  assertCaptureMetadata(allowed);
  assertThrows(
    () =>
      assertCaptureMetadata({
        ...Object.fromEntries(
          CAPTURE_METADATA_ALLOWED_KEYS.slice(0, CAPTURE_METADATA_MAX_KEYS - 1).map((
            key,
            index,
          ) => [key, index]),
        ),
        extraKey: 1,
      }),
    CapExceededError,
  );

  const tooMany = Object.fromEntries([
    ...CAPTURE_METADATA_ALLOWED_KEYS.slice(0, CAPTURE_METADATA_MAX_KEYS).map((key, index) => [
      key,
      index,
    ]),
    ["extraKey", 1],
  ]);
  assertThrows(() => assertCaptureMetadata(tooMany), CapExceededError);
  assertThrows(
    () => assertCaptureMetadata({ httpStatus: { nested: { tooDeep: true } } }),
    CapExceededError,
  );
});
