// Immutable SourceSnapshot capture and redaction lineage. Spec 8.2, I08, S09.
//
// A capture is a new document. Content identity fields are never patched. A
// metadata correction creates a new snapshot that supersedes the old one.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { assertCaptureMetadata } from "../domain/caps.ts";
import {
  ACQUISITION_TIERS,
  CAPTURE_METHODS,
  REDACTION_METHODS,
  SNAPSHOT_LIFECYCLE,
} from "../domain/constants.ts";
import { createEntityRegistry } from "../identity/registry.ts";
import {
  appendAudit,
  assertNoUnknownKeys,
  EDIT_ROLES,
  getDocument,
  parseDate,
  parseObjectId,
  type ProvenanceActor,
  ProvenanceError,
  requireRoles,
  requireString,
} from "./common.ts";
import { createAsset, sha256Hex, sniffMimeType } from "./asset.ts";
import type { ObjectStorageProvider } from "./provider.ts";
import { touchSourceLastCapturedAt } from "./source.ts";

const CAPTURE_KEYS = [
  "db",
  "provider",
  "sourceId",
  "bytes",
  "assetId",
  "contentHash",
  "retrievedAt",
  "titleAtCapture",
  "canonicalUrlAtCapture",
  "publishedAt",
  "captureMethod",
  "acquisitionTier",
  "captureMetadata",
  "supersedesSnapshotId",
  "originalFileName",
  "lifecycle",
  "actor",
  "now",
] as const;
const REDACTION_KEYS = [
  "db",
  "snapshotId",
  "redactedAssetId",
  "reason",
  "method",
  "actor",
  "now",
] as const;

export type SnapshotRecord = Record<string, unknown> & { _id: ObjectId };

function oneOf<T extends readonly string[]>(
  values: T,
  value: unknown,
  code: string,
  path: string,
): T[number] {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new ProvenanceError(code, `${path} is not a supported value`);
  }
  return value as T[number];
}

function optionalDateOrNull(value: unknown, path: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const parsed = parseDate(value, "INVALID_DATE", path);
  return parsed ?? null;
}

export async function captureSnapshot(input: {
  db: Db;
  provider: ObjectStorageProvider;
  sourceId: ObjectId | string;
  bytes?: Uint8Array;
  assetId?: ObjectId | string;
  contentHash?: string;
  retrievedAt: Date | string;
  titleAtCapture?: string;
  canonicalUrlAtCapture?: string;
  publishedAt?: Date | string | null;
  captureMethod: string;
  acquisitionTier: string;
  captureMetadata?: Record<string, unknown>;
  supersedesSnapshotId?: ObjectId | string;
  originalFileName?: string;
  lifecycle?: string;
  actor: ProvenanceActor;
  now?: Date;
}): Promise<{
  snapshotId: ObjectId;
  assetId?: ObjectId;
  contentHash: string;
  auditIds: ObjectId[];
}> {
  assertNoUnknownKeys(input, CAPTURE_KEYS, "UNKNOWN_SNAPSHOT_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, EDIT_ROLES, "actor may not capture snapshots");
  const sourceId = parseObjectId(input.sourceId, "INVALID_SOURCE", "sourceId");
  const source = await getDocument(input.db, "sources", sourceId, "source");
  if (source.lifecycle === "ARCHIVED") {
    throw new ProvenanceError("SOURCE_ARCHIVED", "cannot capture against an archived source", 409);
  }
  const retrievedAt = parseDate(input.retrievedAt, "INVALID_DATE", "retrievedAt");
  if (!retrievedAt) throw new ProvenanceError("INVALID_DATE", "retrievedAt is required");
  const captureMethod = oneOf(
    CAPTURE_METHODS,
    input.captureMethod,
    "INVALID_CAPTURE_METHOD",
    "captureMethod",
  );
  const acquisitionTier = oneOf(
    ACQUISITION_TIERS,
    input.acquisitionTier,
    "INVALID_ACQUISITION_TIER",
    "acquisitionTier",
  );
  const lifecycle = oneOf(
    SNAPSHOT_LIFECYCLE,
    input.lifecycle ?? "AVAILABLE",
    "INVALID_SNAPSHOT_LIFECYCLE",
    "lifecycle",
  );
  assertCaptureMetadata(input.captureMetadata);

  let supersedesSnapshotId: ObjectId | undefined;
  if (input.supersedesSnapshotId !== undefined) {
    supersedesSnapshotId = parseObjectId(
      input.supersedesSnapshotId,
      "INVALID_SUPERSEDES",
      "supersedesSnapshotId",
    );
    const previous = await getDocument(
      input.db,
      "source_snapshots",
      supersedesSnapshotId,
      "superseded snapshot",
    );
    if (
      String((previous.source as Record<string, unknown> | undefined)?._id) !== sourceId.toString()
    ) {
      throw new ProvenanceError(
        "SUPERSEDES_SOURCE_MISMATCH",
        "superseded snapshot belongs to another source",
      );
    }
  }

  const bytes = input.bytes;
  let assetId: ObjectId | undefined;
  let contentHash: string;
  let mimeType: string | undefined;
  let byteSize: number | undefined;
  if (bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
      throw new ProvenanceError("INVALID_BYTES", "capture bytes are required");
    }
    const sniffed = sniffMimeType(bytes);
    if (!sniffed) {
      throw new ProvenanceError(
        "UNSUPPORTED_MIME",
        "capture bytes are not an allowed document type",
      );
    }
    contentHash = await sha256Hex(bytes);
    mimeType = sniffed;
    byteSize = bytes.byteLength;
    const asset = await createAsset({
      db: input.db,
      provider: input.provider,
      bytes,
      declaredMimeType: sniffed,
      originalFileName: input.originalFileName,
      visibility: "RESEARCH_ONLY",
      actor: input.actor,
      now,
    });
    assetId = asset.assetId;
  } else {
    if (input.contentHash === undefined && input.assetId === undefined && !supersedesSnapshotId) {
      throw new ProvenanceError(
        "CONTENT_REQUIRED",
        "capture requires bytes, an asset, or a superseded snapshot",
      );
    }
    let baseHash = input.contentHash;
    let baseAssetId = input.assetId === undefined
      ? undefined
      : parseObjectId(input.assetId, "INVALID_ASSET", "assetId");
    let baseMime: string | undefined;
    let baseSize: number | undefined;
    if (supersedesSnapshotId) {
      const previous = await getDocument(
        input.db,
        "source_snapshots",
        supersedesSnapshotId,
        "superseded snapshot",
      );
      baseHash = baseHash ?? String(previous.contentHash);
      baseAssetId = baseAssetId ?? (previous.assetId as ObjectId | undefined);
      baseMime = previous.mimeType as string | undefined;
      baseSize = previous.byteSize as number | undefined;
    }
    if (baseAssetId) {
      const registry = createEntityRegistry(input.db);
      const resolved = await registry.resolve("asset.reference", {
        type: "ASSET",
        id: baseAssetId,
      });
      const asset = resolved.doc;
      if (!baseHash) baseHash = String(asset.sha256);
      if (String(asset.sha256) !== String(baseHash)) {
        throw new ProvenanceError("HASH_MISMATCH", "snapshot hash does not match the asset bytes");
      }
      baseMime = baseMime ?? String(asset.mimeType);
      baseSize = baseSize ?? Number(asset.byteSize);
    }
    if (!baseHash || !/^[a-f0-9]{64}$/.test(baseHash)) {
      throw new ProvenanceError("INVALID_CONTENT_HASH", "contentHash must be a SHA-256 hex digest");
    }
    contentHash = baseHash;
    assetId = baseAssetId;
    mimeType = baseMime;
    byteSize = baseSize;
  }

  const snapshotId = new ObjectId();
  const publishedAt = optionalDateOrNull(input.publishedAt, "publishedAt");
  const doc = {
    _id: snapshotId,
    source: { _id: sourceId, title: String(source.title) },
    ...(input.titleAtCapture ? { titleAtCapture: input.titleAtCapture } : {}),
    ...(input.canonicalUrlAtCapture ? { canonicalUrlAtCapture: input.canonicalUrlAtCapture } : {}),
    ...(publishedAt === undefined ? {} : { publishedAt }),
    retrievedAt,
    contentHash,
    hashAlgorithm: "SHA256",
    ...(mimeType ? { mimeType } : {}),
    ...(byteSize === undefined ? {} : { byteSize }),
    ...(assetId ? { assetId } : {}),
    captureMethod,
    acquisitionTier,
    ...(input.actor.id ? { capturedBy: input.actor.id } : {}),
    ...(input.captureMetadata ? { captureMetadata: input.captureMetadata } : {}),
    ...(supersedesSnapshotId ? { supersedesSnapshotId } : {}),
    lifecycle,
    schemaVersion: 1,
    createdAt: now,
  };
  await input.db.collection("source_snapshots").insertOne(doc);
  await touchSourceLastCapturedAt(input.db, sourceId, retrievedAt);
  const auditIds = [
    await appendAudit(input.db, {
      action: "SNAPSHOT_CREATED",
      target: { type: "SOURCE_SNAPSHOT", id: snapshotId },
      actor: input.actor,
      afterSummary: {
        hashAlgorithm: "SHA256",
        captureMethod,
        acquisitionTier,
        lifecycle,
        byteSize: byteSize ?? null,
        hasAsset: Boolean(assetId),
      },
      changedPaths: ["contentHash", "retrievedAt", "source", "lifecycle"],
      now,
    }),
  ];
  if (supersedesSnapshotId) {
    auditIds.push(
      await appendAudit(input.db, {
        action: "SNAPSHOT_SUPERSEDED",
        target: { type: "SOURCE_SNAPSHOT", id: snapshotId },
        actor: input.actor,
        afterSummary: { supersedesSnapshotId: supersedesSnapshotId.toString() },
        changedPaths: ["supersedesSnapshotId"],
        now,
      }),
    );
  }
  return { snapshotId, assetId, contentHash, auditIds };
}

export async function getSnapshot(db: Db, id: ObjectId): Promise<SnapshotRecord> {
  return await getDocument(db, "source_snapshots", id, "snapshot");
}

const CONTENT_IDENTITY_FIELDS = [
  "contentHash",
  "hashAlgorithm",
  "assetId",
  "retrievedAt",
  "source",
  "captureMethod",
  "acquisitionTier",
  "mimeType",
  "byteSize",
] as const;

export async function updateSnapshotContent(input: {
  db: Db;
  snapshotId: ObjectId;
  patch: Record<string, unknown>;
}): Promise<never> {
  await Promise.resolve();
  for (const key of Object.keys(input.patch)) {
    if ((CONTENT_IDENTITY_FIELDS as readonly string[]).includes(key)) {
      throw new ProvenanceError(
        "SNAPSHOT_IMMUTABLE",
        `${key} is part of snapshot content identity; create a superseding snapshot`,
        409,
        { field: key },
      );
    }
  }
  throw new ProvenanceError(
    "SNAPSHOT_IMMUTABLE",
    "snapshots cannot be updated; create a superseding snapshot",
    409,
  );
}

export async function redactSnapshot(input: {
  db: Db;
  snapshotId: ObjectId;
  redactedAssetId: ObjectId | string;
  reason: string;
  method: string;
  actor: ProvenanceActor;
  now?: Date;
}): Promise<{
  snapshotId: ObjectId;
  redactedAssetId: ObjectId;
  contentHash: string;
  auditId: ObjectId;
}> {
  assertNoUnknownKeys(input, REDACTION_KEYS, "UNKNOWN_REDACTION_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, EDIT_ROLES, "actor may not redact snapshots");
  const reason = requireString(input.reason, "REASON_REQUIRED", "redaction requires a reason");
  const method = oneOf(REDACTION_METHODS, input.method, "INVALID_REDACTION_METHOD", "method");
  const snapshot = await getSnapshot(input.db, input.snapshotId);
  if (snapshot.redaction) {
    throw new ProvenanceError(
      "ALREADY_REDACTED",
      "snapshot already has a redacted derivative",
      409,
    );
  }
  if (!snapshot.assetId) {
    throw new ProvenanceError(
      "ORIGINAL_ASSET_REQUIRED",
      "redaction requires a retained original asset",
    );
  }
  const registry = createEntityRegistry(input.db);
  const original = await registry.resolve("asset.reference", {
    type: "ASSET",
    id: snapshot.assetId as ObjectId,
  });
  const derivativeId = parseObjectId(
    input.redactedAssetId,
    "INVALID_ASSET",
    "redactedAssetId",
  );
  const derivative = await registry.resolve("asset.reference", {
    type: "ASSET",
    id: derivativeId,
  });
  if (
    derivative.doc.processingStatus !== "READY" || derivative.doc.visibility !== "PUBLIC_APPROVED"
  ) {
    throw new ProvenanceError(
      "INVALID_REDACTED_ASSET",
      "redacted derivative must be ready and public-approved",
    );
  }

  if (original.doc.visibility !== "PRIVATE") {
    await input.db.collection("assets").updateOne(
      { _id: original.ref.id },
      { $set: { visibility: "PRIVATE" }, $inc: { version: 1 } },
    );
  }
  const redaction = {
    redactedAssetId: derivativeId,
    reason,
    redactedAt: now,
    ...(input.actor.id ? { redactedBy: input.actor.id } : {}),
    method,
    originalRetained: true as const,
  };
  if (!input.actor.id) {
    throw new ProvenanceError("FORBIDDEN", "redaction requires a user actor", 403);
  }
  await input.db.collection("source_snapshots").updateOne(
    { _id: input.snapshotId, redaction: { $exists: false } },
    { $set: { redaction } },
  );
  const auditId = await appendAudit(input.db, {
    action: "SNAPSHOT_REDACTED",
    target: { type: "SOURCE_SNAPSHOT", id: input.snapshotId },
    actor: input.actor,
    afterSummary: {
      method,
      originalRetained: true,
      contentHash: String(snapshot.contentHash),
    },
    changedPaths: ["redaction"],
    reason,
    now,
  });
  return {
    snapshotId: input.snapshotId,
    redactedAssetId: derivativeId,
    contentHash: String(snapshot.contentHash),
    auditId,
  };
}

export function snapshotDisclosure(snapshot: Record<string, unknown>): {
  contentHash: string;
  isRedacted: boolean;
  servedAssetId?: ObjectId;
  originalRetained: boolean;
} {
  const redaction = snapshot.redaction as Record<string, unknown> | undefined;
  return {
    contentHash: String(snapshot.contentHash),
    isRedacted: Boolean(redaction),
    ...(redaction?.redactedAssetId
      ? { servedAssetId: redaction.redactedAssetId as ObjectId }
      : snapshot.assetId
      ? { servedAssetId: snapshot.assetId as ObjectId }
      : {}),
    originalRetained: redaction ? redaction.originalRetained === true : Boolean(snapshot.assetId),
  };
}
