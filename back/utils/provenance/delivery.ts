// Short-lived signed asset delivery. Spec 8.3, 12.
//
// The URL contains an asset id, an expiry, and an HMAC. It never contains a
// bucket, object key, or internal path. Every request rechecks asset state.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { ProvenanceError } from "./common.ts";
import { getAssetInternal, isAssetDeliverable, sha256Hex } from "./asset.ts";
import type { ObjectStorageProvider } from "./provider.ts";

const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signature(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message))));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function requireSecret(secret: string): string {
  if (!secret || secret.length < 16) {
    throw new ProvenanceError(
      "SIGNING_SECRET_REQUIRED",
      "asset URL signing secret is not configured",
    );
  }
  return secret;
}

export async function createSignedAssetUrl(input: {
  db: Db;
  assetId: ObjectId;
  secret: string;
  ttlSeconds?: number;
  now?: Date;
  basePath?: string;
}): Promise<{ url: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const secret = requireSecret(input.secret);
  const ttl = Math.min(Math.max(input.ttlSeconds ?? 300, 1), 3600);
  const asset = await getAssetInternal(input.db, input.assetId);
  if (!isAssetDeliverable(asset, now)) {
    throw new ProvenanceError("ASSET_NOT_DELIVERABLE", "asset is not approved for delivery", 403);
  }
  const expires = Math.floor(now.getTime() / 1000) + ttl;
  const sig = await signature(secret, `${input.assetId.toString()}.${expires}`);
  const basePath = (input.basePath ?? "/assets").replace(/\/+$/, "");
  return {
    url: `${basePath}/${input.assetId.toString()}?expires=${expires}&sig=${sig}`,
    expiresAt: new Date(expires * 1000),
  };
}

export async function verifySignedAssetUrl(input: {
  db: Db;
  assetId: ObjectId;
  expires: string | number;
  sig: string;
  secret: string;
  now?: Date;
}): Promise<{ assetId: ObjectId; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const secret = requireSecret(input.secret);
  const expires = Number(input.expires);
  if (!Number.isInteger(expires) || expires <= 0) {
    throw new ProvenanceError("INVALID_SIGNATURE", "signed URL is invalid", 403);
  }
  if (expires * 1000 <= now.getTime()) {
    throw new ProvenanceError("URL_EXPIRED", "signed URL has expired", 403);
  }
  const expected = await signature(secret, `${input.assetId.toString()}.${expires}`);
  if (!constantTimeEqual(expected, input.sig)) {
    throw new ProvenanceError("INVALID_SIGNATURE", "signed URL signature is invalid", 403);
  }
  const asset = await getAssetInternal(input.db, input.assetId);
  if (!isAssetDeliverable(asset, now)) {
    throw new ProvenanceError(
      "ASSET_NOT_DELIVERABLE",
      "asset is no longer approved for delivery",
      403,
    );
  }
  return { assetId: input.assetId, expiresAt: new Date(expires * 1000) };
}

export async function resolveSignedAsset(input: {
  db: Db;
  provider: ObjectStorageProvider;
  assetId: ObjectId;
  expires: string | number;
  sig: string;
  secret: string;
  now?: Date;
}): Promise<{ assetId: ObjectId; bytes: Uint8Array; mimeType: string; expiresAt: Date }> {
  const verified = await verifySignedAssetUrl(input);
  const asset = await getAssetInternal(input.db, verified.assetId);
  const storage = asset.storage as Record<string, unknown>;
  const bytes = await input.provider.get({ key: String(storage.objectKey) });
  if (await sha256Hex(bytes) !== String(asset.sha256)) {
    throw new ProvenanceError(
      "ASSET_HASH_MISMATCH",
      "stored bytes do not match asset metadata",
      500,
    );
  }
  return {
    assetId: verified.assetId,
    bytes,
    mimeType: String(asset.mimeType),
    expiresAt: verified.expiresAt,
  };
}
