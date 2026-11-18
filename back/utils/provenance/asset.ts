// Asset metadata, quarantine, MIME inspection, and metadata hygiene. Spec 8.3, 12.
//
// Bytes live in an object store. Mongo holds metadata only. Object keys never
// leave the server, and quarantined or rejected bytes are never served.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import {
  ASSET_VISIBILITY,
  type AssetLifecycle,
  type AssetVisibility,
  MALWARE_SCAN_RESULTS,
  type MalwareScanResult,
  SECURITY_LIMITS,
} from "../domain/constants.ts";
import {
  appendAudit,
  assertNoUnknownKeys,
  getDocument,
  parseDate,
  type ProvenanceActor,
  ProvenanceError,
  requireRoles,
  REVIEW_ROLES,
  UPLOAD_ROLES,
} from "./common.ts";
import type { ObjectStorageProvider } from "./provider.ts";

const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "text/plain": ["txt"],
};

const CREATE_KEYS = [
  "db",
  "provider",
  "bytes",
  "declaredMimeType",
  "originalFileName",
  "safeDisplayName",
  "visibility",
  "exifReviewed",
  "retentionUntil",
  "actor",
  "now",
] as const;
const SCAN_KEYS = [
  "db",
  "assetId",
  "result",
  "engine",
  "expectedVersion",
  "actor",
  "now",
] as const;
const VISIBILITY_KEYS = [
  "db",
  "assetId",
  "visibility",
  "expectedVersion",
  "reason",
  "actor",
  "now",
] as const;
const PURGE_KEYS = ["db", "provider", "assetId", "reason", "actor", "now"] as const;

export type AssetInput = {
  db: Db;
  provider: ObjectStorageProvider;
  bytes: Uint8Array;
  declaredMimeType: string;
  originalFileName?: string;
  safeDisplayName?: string;
  visibility?: string;
  exifReviewed?: boolean;
  retentionUntil?: Date;
  actor: ProvenanceActor;
  now?: Date;
};

export type AssetRecord = Record<string, unknown> & { _id: ObjectId };

function startsWith(bytes: Uint8Array, values: number[]): boolean {
  if (bytes.length < values.length) return false;
  return values.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.slice(start, start + length));
}

export function sniffMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.includes("\0")) return "text/plain";
  } catch {
    return null;
  }
  return null;
}

function extensionOf(name: string | undefined): string | undefined {
  if (!name || !name.includes(".")) return undefined;
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

export function assertAcceptedMime(
  bytes: Uint8Array,
  declaredMimeType: string,
  originalFileName?: string,
): string {
  const sniffed = sniffMimeType(bytes);
  if (!sniffed) {
    throw new ProvenanceError("UNSUPPORTED_MIME", "bytes are not an allowed document type");
  }
  if (!(declaredMimeType in MIME_EXTENSIONS)) {
    throw new ProvenanceError("UNSUPPORTED_MIME", "declared MIME type is not allowed");
  }
  if (sniffed !== declaredMimeType) {
    throw new ProvenanceError("MIME_MISMATCH", "declared MIME does not match the bytes", 422, {
      sniffed,
    });
  }
  const extension = extensionOf(originalFileName);
  if (originalFileName && !extension) {
    throw new ProvenanceError("EXTENSION_MISMATCH", "uploaded file must have an extension");
  }
  if (extension && !MIME_EXTENSIONS[declaredMimeType].includes(extension)) {
    throw new ProvenanceError("EXTENSION_MISMATCH", "file extension does not match the MIME type");
  }
  return sniffed;
}

export function hasExifMetadata(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (marker === 0xe1 || marker === 0xed) return true;
      if (marker === 0xda) break;
      offset += 2 + length;
    }
    return false;
  }
  if (mimeType === "image/png") {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) | bytes[offset + 3];
      const type = ascii(bytes, offset + 4, 4);
      if (type === "eXIf" || type === "tEXt" || type === "iTXt" || type === "zTXt") return true;
      if (type === "IEND") break;
      offset += 12 + length;
    }
    return false;
  }
  return false;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function assertUploadQuota(db: Db, actor: ProvenanceActor, now: Date): Promise<void> {
  if (actor.type !== "USER" || !actor.id) return;
  const count = await db.collection("assets").countDocuments({
    uploadedBy: actor.id,
    uploadedAt: { $gte: startOfUtcDay(now) },
  });
  if (count >= SECURITY_LIMITS.uploadsPerDay) {
    throw new ProvenanceError("CAP_EXCEEDED", "daily upload cap exceeded", 422, {
      path: "uploadsPerDay",
      cap: SECURITY_LIMITS.uploadsPerDay,
      actual: count + 1,
    });
  }
}

function visibilityValue(value: unknown): AssetVisibility {
  if (value === undefined) return "PRIVATE";
  if (typeof value !== "string" || !(ASSET_VISIBILITY as readonly string[]).includes(value)) {
    throw new ProvenanceError("INVALID_VISIBILITY", "unknown asset visibility");
  }
  return value as AssetVisibility;
}

function objectKey(sha256: string, extension: string): string {
  return `assets/${sha256.slice(0, 2)}/${sha256}/${crypto.randomUUID()}.${extension}`;
}

export async function createAsset(input: AssetInput): Promise<{
  assetId: ObjectId;
  deduplicated: boolean;
  sha256: string;
  version: number;
  auditId?: ObjectId;
}> {
  assertNoUnknownKeys(input, CREATE_KEYS, "UNKNOWN_ASSET_FIELD");
  const now = input.now ?? new Date();
  const loaded = await requireRoles(
    input.db,
    input.actor,
    UPLOAD_ROLES,
    "actor may not upload assets",
  );
  const bytes = input.bytes;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new ProvenanceError("INVALID_BYTES", "asset bytes are required");
  }
  if (bytes.byteLength > SECURITY_LIMITS.uploadMaxBytes) {
    throw new ProvenanceError("CAP_EXCEEDED", "upload exceeds the byte cap", 422, {
      path: "byteSize",
      cap: SECURITY_LIMITS.uploadMaxBytes,
      actual: bytes.byteLength,
    });
  }
  const mimeType = assertAcceptedMime(bytes, input.declaredMimeType, input.originalFileName);
  const extension = extensionOf(input.originalFileName) ??
    (MIME_EXTENSIONS[mimeType][0] as string);
  const sha256 = await sha256Hex(bytes);
  const visibility = visibilityValue(input.visibility);
  const metadataPresent = hasExifMetadata(bytes, mimeType);
  const exifReviewed = input.exifReviewed === true;
  if (exifReviewed) {
    await requireRoles(input.db, input.actor, REVIEW_ROLES, "actor may not review EXIF metadata");
  }
  const exifStripped = !metadataPresent || exifReviewed;
  if (visibility === "PUBLIC_APPROVED") {
    await requireRoles(input.db, input.actor, REVIEW_ROLES, "actor may not approve public assets");
    if (!exifStripped) {
      throw new ProvenanceError("EXIF_REVIEW_REQUIRED", "public assets require EXIF review");
    }
  }

  await assertUploadQuota(input.db, input.actor, now);
  const existing = await input.db.collection("assets").findOne({
    sha256,
    lifecycle: { $ne: "DELETED_PENDING_PURGE" },
  });
  if (existing) {
    return {
      assetId: existing._id as ObjectId,
      deduplicated: true,
      sha256,
      version: Number(existing.version ?? 0),
    };
  }

  const key = objectKey(sha256, extension);
  await input.provider.put({ key, bytes, contentType: mimeType });
  const assetId = new ObjectId();
  const retentionUntil = parseDate(input.retentionUntil, "INVALID_RETENTION", "retentionUntil");
  const doc = {
    _id: assetId,
    storage: {
      provider: input.provider.provider,
      ...(input.provider.provider === "S3_COMPATIBLE"
        ? { bucket: Deno.env.get("S3_BUCKET") ?? "assets" }
        : {}),
      objectKey: key,
    },
    ...(input.originalFileName ? { originalFileName: input.originalFileName } : {}),
    ...(input.safeDisplayName ? { safeDisplayName: input.safeDisplayName } : {}),
    mimeType,
    byteSize: bytes.byteLength,
    sha256,
    processingStatus: "QUARANTINED",
    visibility,
    ...(loaded.id ? { uploadedBy: loaded.id } : {}),
    uploadedAt: now,
    exifStripped,
    ...(retentionUntil ? { retentionUntil } : {}),
    legalHold: false,
    lifecycle: "ACTIVE",
    version: 1,
    schemaVersion: 1,
  };
  await input.db.collection("assets").insertOne(doc);
  const auditId = await appendAudit(input.db, {
    action: "ASSET_UPLOADED",
    target: { type: "ASSET", id: assetId },
    actor: input.actor,
    targetVersionBefore: 0,
    targetVersionAfter: 1,
    afterSummary: {
      mimeType,
      byteSize: bytes.byteLength,
      processingStatus: "QUARANTINED",
      visibility,
      exifStripped,
    },
    changedPaths: ["storage", "mimeType", "sha256", "processingStatus", "visibility"],
    now,
  });
  return { assetId, deduplicated: false, sha256, version: 1, auditId };
}

export async function completeAssetScan(input: {
  db: Db;
  assetId: ObjectId;
  result: string;
  engine?: string;
  expectedVersion: number;
  actor: ProvenanceActor;
  now?: Date;
}): Promise<{ assetId: ObjectId; processingStatus: string; version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, SCAN_KEYS, "UNKNOWN_ASSET_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, REVIEW_ROLES, "actor may not complete an asset scan");
  if (!(MALWARE_SCAN_RESULTS as readonly string[]).includes(input.result)) {
    throw new ProvenanceError("INVALID_SCAN_RESULT", "unknown malware scan result");
  }
  const doc = await getDocument(input.db, "assets", input.assetId, "asset");
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ProvenanceError("VERSION_CONFLICT", "asset version did not match", 409);
  }
  if (doc.lifecycle !== "ACTIVE") {
    throw new ProvenanceError("ASSET_NOT_ACTIVE", "asset is not active", 409);
  }
  const processingStatus = input.result === "CLEAN"
    ? "READY"
    : input.result === "INFECTED"
    ? "REJECTED"
    : "QUARANTINED";
  const nextVersion = version + 1;
  const update = await input.db.collection("assets").updateOne(
    { _id: input.assetId, version: input.expectedVersion },
    {
      $set: {
        processingStatus,
        malwareScan: {
          ...(input.engine ? { engine: input.engine } : {}),
          result: input.result as MalwareScanResult,
          scannedAt: now,
        },
      },
      $inc: { version: 1 },
    },
  );
  if (update.modifiedCount !== 1) {
    throw new ProvenanceError("VERSION_CONFLICT", "asset version did not match", 409);
  }
  const auditId = await appendAudit(input.db, {
    action: "ASSET_SCAN_COMPLETED",
    target: { type: "ASSET", id: input.assetId },
    actor: input.actor,
    targetVersionBefore: version,
    targetVersionAfter: nextVersion,
    beforeSummary: { processingStatus: String(doc.processingStatus) },
    afterSummary: { processingStatus, scanResult: input.result },
    changedPaths: ["processingStatus", "malwareScan"],
    now,
  });
  return { assetId: input.assetId, processingStatus, version: nextVersion, auditId };
}

export async function setAssetVisibility(input: {
  db: Db;
  assetId: ObjectId;
  visibility: string;
  expectedVersion: number;
  reason: string;
  actor: ProvenanceActor;
  now?: Date;
}): Promise<{ assetId: ObjectId; version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, VISIBILITY_KEYS, "UNKNOWN_ASSET_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, REVIEW_ROLES, "actor may not change asset visibility");
  const visibility = visibilityValue(input.visibility);
  if (typeof input.reason !== "string" || input.reason.trim() === "") {
    throw new ProvenanceError("REASON_REQUIRED", "visibility change requires a reason");
  }
  const doc = await getDocument(input.db, "assets", input.assetId, "asset");
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ProvenanceError("VERSION_CONFLICT", "asset version did not match", 409);
  }
  if (visibility === "PUBLIC_APPROVED") {
    if (doc.processingStatus !== "READY") {
      throw new ProvenanceError("ASSET_NOT_READY", "public asset must be READY", 409);
    }
    if ((doc.malwareScan as Record<string, unknown> | undefined)?.result !== "CLEAN") {
      throw new ProvenanceError("ASSET_NOT_CLEAN", "public asset must have a CLEAN scan", 409);
    }
    if (doc.exifStripped !== true) {
      throw new ProvenanceError("EXIF_REVIEW_REQUIRED", "public asset requires EXIF review");
    }
  }
  const nextVersion = version + 1;
  const update = await input.db.collection("assets").updateOne(
    { _id: input.assetId, version: input.expectedVersion },
    { $set: { visibility }, $inc: { version: 1 } },
  );
  if (update.modifiedCount !== 1) {
    throw new ProvenanceError("VERSION_CONFLICT", "asset version did not match", 409);
  }
  const auditId = await appendAudit(input.db, {
    action: "ENTITY_UPDATED",
    target: { type: "ASSET", id: input.assetId },
    actor: input.actor,
    targetVersionBefore: version,
    targetVersionAfter: nextVersion,
    beforeSummary: { visibility: String(doc.visibility) },
    afterSummary: { visibility },
    changedPaths: ["visibility"],
    reason: input.reason,
    now,
  });
  return { assetId: input.assetId, version: nextVersion, auditId };
}

export async function purgeAsset(input: {
  db: Db;
  provider: ObjectStorageProvider;
  assetId: ObjectId;
  reason: string;
  actor: ProvenanceActor;
  now?: Date;
}): Promise<{ assetId: ObjectId; auditId: ObjectId }> {
  assertNoUnknownKeys(input, PURGE_KEYS, "UNKNOWN_ASSET_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, ["ADMIN"], "actor may not purge assets");
  const doc = await getDocument(input.db, "assets", input.assetId, "asset");
  if (doc.legalHold === true) {
    throw new ProvenanceError("LEGAL_HOLD", "legal hold blocks asset purge", 409);
  }
  const storage = doc.storage as Record<string, unknown>;
  await input.provider.delete({ key: String(storage.objectKey) });
  await input.db.collection("assets").updateOne(
    { _id: input.assetId, legalHold: { $ne: true } },
    { $set: { lifecycle: "DELETED_PENDING_PURGE" }, $inc: { version: 1 } },
  );
  const auditId = await appendAudit(input.db, {
    action: "ASSET_PURGED",
    target: { type: "ASSET", id: input.assetId },
    actor: input.actor,
    targetVersionBefore: Number(doc.version ?? 0),
    targetVersionAfter: Number(doc.version ?? 0) + 1,
    beforeSummary: { lifecycle: String(doc.lifecycle) },
    afterSummary: { lifecycle: "DELETED_PENDING_PURGE" },
    changedPaths: ["lifecycle"],
    reason: input.reason,
    now,
  });
  return { assetId: input.assetId, auditId };
}

export async function getAssetInternal(db: Db, id: ObjectId): Promise<AssetRecord> {
  return await getDocument(db, "assets", id, "asset");
}

export function clientAssetView(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    _id: doc._id,
    mimeType: doc.mimeType,
    byteSize: doc.byteSize,
    sha256: doc.sha256,
    processingStatus: doc.processingStatus,
    visibility: doc.visibility,
    exifStripped: doc.exifStripped,
    lifecycle: doc.lifecycle,
    uploadedAt: doc.uploadedAt,
  };
}

export async function getAssetMetadata(
  db: Db,
  id: ObjectId,
): Promise<Record<string, unknown>> {
  return clientAssetView(await getAssetInternal(db, id));
}

export function isAssetDeliverable(doc: Record<string, unknown>, _now: Date): boolean {
  const scan = doc.malwareScan as Record<string, unknown> | undefined;
  return doc.processingStatus === "READY" &&
    doc.visibility === "PUBLIC_APPROVED" &&
    doc.lifecycle === "ACTIVE" &&
    doc.exifStripped === true &&
    scan?.result === "CLEAN";
}

export type { AssetLifecycle, AssetVisibility };
