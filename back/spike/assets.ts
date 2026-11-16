// Disposable asset provider and untrusted-URL hardening.
//
// Asset bytes go to a local provider. MongoDB stores metadata only. Uploads
// are quarantined until validation, EXIF is stripped before public use, and
// public views never expose the storage object key.
import { type Db, ObjectId } from "lesan";

export const ASSET_MAX_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

export class AssetError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AssetError";
  }
}

export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d &&
    bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 &&
    bytes[2] === 0x46 && bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46
  ) {
    return "application/pdf";
  }
  return null;
}

export function assertUpload(input: {
  bytes: Uint8Array;
  declaredMime: string;
  fileName: string;
}) {
  if (input.bytes.byteLength === 0) {
    throw new AssetError("EMPTY", "empty upload");
  }
  if (input.bytes.byteLength > ASSET_MAX_BYTES) {
    throw new AssetError("TOO_LARGE", "upload exceeds size limit");
  }
  const actual = sniffMime(input.bytes);
  if (!actual) throw new AssetError("UNKNOWN_MIME", "bytes do not match an allowed type");
  if (!ALLOWED_MIME.has(actual)) {
    throw new AssetError("MIME_NOT_ALLOWED", "MIME type is not allowed");
  }
  if (actual !== input.declaredMime) {
    throw new AssetError("MIME_MISMATCH", "declared MIME does not match bytes");
  }
  const extension = input.fileName.toLowerCase().split(".").pop() ?? "";
  const allowedExtensions: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/gif": ["gif"],
    "image/webp": ["webp"],
    "application/pdf": ["pdf"],
  };
  if (!allowedExtensions[actual]?.includes(extension)) {
    throw new AssetError("EXTENSION_MISMATCH", "file extension does not match bytes");
  }
  return { mimeType: actual, byteSize: input.bytes.byteLength };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Removes JPEG APP1/Exif segments. This is a small, best-effort stripper for
// the spike; production should use a maintained metadata library.
export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return bytes;
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    if (marker === 0xda) {
      out.push(...bytes.slice(i));
      break;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const segment = bytes.slice(i, i + 2 + length);
    const isExif = marker === 0xe1 &&
      String.fromCharCode(...segment.slice(4, 8)) === "Exif";
    if (!isExif) out.push(...segment);
    i += 2 + length;
  }
  return new Uint8Array(out);
}

export async function storeLocalAsset(db: Db, input: {
  root: string;
  bytes: Uint8Array;
  declaredMime: string;
  fileName: string;
  uploadedBy: string;
  visibility?: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "REDACTED";
}) {
  assertUpload(input);
  const hash = await sha256Hex(input.bytes);
  const objectKey = `${crypto.randomUUID()}.bin`;
  await Deno.mkdir(input.root, { recursive: true });
  await Deno.writeFile(`${input.root}/${objectKey}`, input.bytes, {
    createNew: true,
  });

  const now = new Date();
  const asset = {
    _id: new ObjectId(),
    storage: { provider: "LOCAL_DEV", bucket: "spike", objectKey },
    originalFileName: input.fileName,
    safeDisplayName: input.fileName.replace(/[^\w.\- ]/g, "_"),
    mimeType: sniffMime(input.bytes)!,
    byteSize: input.bytes.byteLength,
    sha256: hash,
    processingStatus: "QUARANTINED",
    visibility: input.visibility ?? "RESTRICTED",
    uploadedBy: input.uploadedBy,
    uploadedAt: now,
    malwareScan: { status: "PENDING" },
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: input.uploadedBy,
    updatedBy: input.uploadedBy,
    recordLifecycle: "ACTIVE",
  };
  await db.collection("assets").insertOne(asset);
  return asset;
}

export async function markAssetClean(
  db: Db,
  assetId: string,
  visibility: "PUBLIC" | "INTERNAL" | "RESTRICTED" | "REDACTED",
) {
  const result = await db.collection("assets").findOneAndUpdate(
    { _id: new ObjectId(assetId), processingStatus: "QUARANTINED" },
    {
      $set: {
        processingStatus: "CLEAN",
        visibility,
        "malwareScan.status": "CLEAN",
        "malwareScan.scannedAt": new Date(),
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );
  if (!result) throw new AssetError("INVALID_STATE", "asset is not quarantined");
  return result;
}

export function publicAssetView(asset: Record<string, unknown>) {
  if (asset.processingStatus !== "CLEAN") {
    throw new AssetError("NOT_CLEAN", "asset is not cleared for public use");
  }
  if (asset.visibility !== "PUBLIC") {
    throw new AssetError("NOT_PUBLIC", "asset is not public");
  }
  if ((asset.malwareScan as Record<string, unknown> | undefined)?.status !== "CLEAN") {
    throw new AssetError("NOT_SCANNED", "asset has not passed scanning");
  }
  return {
    _id: asset._id,
    safeDisplayName: asset.safeDisplayName,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    sha256: asset.sha256,
    // storage/objectKey deliberately omitted.
  };
}

export async function signAssetUrl(
  secret: string,
  assetId: string,
  expiresAt: number,
): Promise<string> {
  const payload = `${assetId}.${expiresAt}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sig = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `/assets/${assetId}?expires=${expiresAt}&sig=${sig}`;
}

export async function verifyAssetUrl(
  secret: string,
  assetId: string,
  expiresAt: number,
  signature: string,
  now = Date.now(),
): Promise<boolean> {
  if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
  const expected = await signAssetUrl(secret, assetId, expiresAt);
  const expectedSig = new URL(expected, "https://local.invalid").searchParams.get("sig")!;
  if (signature.length !== expectedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expectedSig.charCodeAt(i);
  }
  return diff === 0;
}

// --- SSRF hardening -------------------------------------------------------

export interface HostResolver {
  (hostname: string): Promise<string[]>;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value.includes(":")) {
    if (value === "::1" || value === "::") return true;
    if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
    if (value.startsWith("::ffff:")) return isPrivateIpv4(value.slice(7));
    return false;
  }
  return isPrivateIpv4(value);
}

export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AssetError("SSRF_INVALID_URL", "invalid URL");
  }
  if (url.protocol !== "https:") {
    throw new AssetError("SSRF_HTTPS_REQUIRED", "only HTTPS is allowed");
  }
  if (url.username || url.password) {
    throw new AssetError("SSRF_CREDENTIALS", "URL credentials are not allowed");
  }
  if (url.port && url.port !== "443") {
    throw new AssetError("SSRF_PORT", "only port 443 is allowed");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" || host.endsWith(".localhost") ||
    host.endsWith(".internal") || host === "metadata.google.internal"
  ) {
    throw new AssetError("SSRF_HOST", "host is not allowed");
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && isPrivateIp(host)) {
    throw new AssetError("SSRF_IP", "private/reserved IP is not allowed");
  }
  if (host.includes(":") && isPrivateIp(host)) {
    throw new AssetError("SSRF_IP", "private/reserved IP is not allowed");
  }
  return url;
}

export async function assertSafeResolvedHost(url: URL, resolve: HostResolver) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    if (isPrivateIp(host)) {
      throw new AssetError("SSRF_DNS_IP", "literal private/reserved IP is not allowed");
    }
    return;
  }
  const addresses = await resolve(host);
  if (addresses.length === 0) {
    throw new AssetError("SSRF_DNS", "host did not resolve");
  }
  for (const address of addresses) {
    if (isPrivateIp(address)) {
      throw new AssetError("SSRF_DNS_IP", "host resolves to a private/reserved IP");
    }
  }
}

export async function fetchSafely(
  rawUrl: string,
  options: {
    resolve: HostResolver;
    fetch?: (url: string, init: RequestInit) => Promise<Response>;
    maxRedirects?: number;
    maxBytes?: number;
    timeoutMs?: number;
  },
): Promise<{ url: string; status: number; bytes: Uint8Array; contentType: string | null }> {
  const doFetch = options.fetch ?? fetch;
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? ASSET_MAX_BYTES;
  let url = assertSafeUrl(rawUrl);
  await assertSafeResolvedHost(url, options.resolve);

  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    const response = await doFetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      credentials: "omit",
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      headers: { "user-agent": "AnsooSpike/0.1" },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new AssetError("SSRF_REDIRECT", "redirect without location");
      url = assertSafeUrl(new URL(location, url).toString());
      await assertSafeResolvedHost(url, options.resolve);
      continue;
    }

    if (!response.ok) {
      throw new AssetError("FETCH_STATUS", `upstream status ${response.status}`);
    }

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AssetError("RESPONSE_TOO_LARGE", "response exceeds size cap");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      url: url.toString(),
      status: response.status,
      bytes,
      contentType: response.headers.get("content-type"),
    };
  }

  throw new AssetError("SSRF_TOO_MANY_REDIRECTS", "redirect limit exceeded");
}
