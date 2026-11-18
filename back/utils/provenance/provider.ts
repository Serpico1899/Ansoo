// Object-storage provider interface. Spec 8.3, 12.
//
// MongoDB stores metadata only. Object keys are internal and never exposed to
// clients. LOCAL_DEV is for development; S3_COMPATIBLE is configuration-bound.
import { ProvenanceError } from "./common.ts";

export type StoredObject = {
  provider: "LOCAL_DEV" | "S3_COMPATIBLE";
  bucket?: string;
  objectKey: string;
};

export interface ObjectStorageProvider {
  readonly provider: "LOCAL_DEV" | "S3_COMPATIBLE";
  put(input: { key: string; bytes: Uint8Array; contentType?: string }): Promise<void>;
  get(input: { key: string }): Promise<Uint8Array>;
  delete(input: { key: string }): Promise<void>;
}

function assertSafeKey(key: string): string {
  if (
    !key || key.startsWith("/") || key.includes("..") || key.includes("\\") || key.includes("\0")
  ) {
    throw new ProvenanceError("INVALID_OBJECT_KEY", "object key is not safe");
  }
  return key;
}

export function createLocalStorageProvider(root: string): ObjectStorageProvider {
  const base = root.replace(/\/+$/, "");
  return {
    provider: "LOCAL_DEV",
    async put({ key, bytes }) {
      const safe = assertSafeKey(key);
      const path = `${base}/${safe}`;
      const slash = path.lastIndexOf("/");
      if (slash > 0) await Deno.mkdir(path.slice(0, slash), { recursive: true });
      await Deno.writeFile(path, bytes);
    },
    async get({ key }) {
      try {
        return await Deno.readFile(`${base}/${assertSafeKey(key)}`);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          throw new ProvenanceError("OBJECT_NOT_FOUND", "stored object does not exist", 404);
        }
        throw error;
      }
    },
    async delete({ key }) {
      try {
        await Deno.remove(`${base}/${assertSafeKey(key)}`);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
    },
  };
}

export type S3CompatibleConfig = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function hmac(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const raw = typeof key === "string" ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
}

function encodePath(value: string): string {
  return value.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function signedRequest(
  config: S3CompatibleConfig,
  method: string,
  key: string,
  body: Uint8Array | null,
): Promise<Response> {
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== "https:") {
    throw new ProvenanceError("INSECURE_STORAGE_ENDPOINT", "S3 endpoint must use HTTPS");
  }
  const url = new URL(
    `${endpoint.origin}${endpoint.pathname.replace(/\/+$/, "")}/${
      encodeURIComponent(config.bucket)
    }/${encodePath(assertSafeKey(key))}`,
  );
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256(body ?? new Uint8Array());
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(config.sessionToken ? { "x-amz-security-token": config.sessionToken } : {}),
  };
  const headerNames = Object.keys(headers).sort();
  const canonicalHeaders = headerNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = headerNames.join(";");
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256(canonicalRequest),
  ].join("\n");
  const dateKey = await hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = await hmac(dateKey, config.region);
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return await fetch(url, {
    method,
    headers,
    body: body ?? undefined,
  });
}

export function createS3CompatibleProvider(config: S3CompatibleConfig): ObjectStorageProvider {
  for (const field of ["endpoint", "bucket", "region", "accessKeyId", "secretAccessKey"] as const) {
    if (!config[field]) {
      throw new ProvenanceError(
        "STORAGE_NOT_CONFIGURED",
        `S3-compatible storage requires ${field}`,
      );
    }
  }
  return {
    provider: "S3_COMPATIBLE",
    async put({ key, bytes, contentType }) {
      const response = await signedRequest(config, "PUT", key, bytes);
      if (!response.ok) {
        throw new ProvenanceError(
          "STORAGE_WRITE_FAILED",
          "object storage rejected the upload",
          502,
        );
      }
      if (contentType) await response.body?.cancel();
    },
    async get({ key }) {
      const response = await signedRequest(config, "GET", key, null);
      if (response.status === 404) {
        throw new ProvenanceError("OBJECT_NOT_FOUND", "stored object does not exist", 404);
      }
      if (!response.ok) {
        throw new ProvenanceError("STORAGE_READ_FAILED", "object storage rejected the read", 502);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    async delete({ key }) {
      const response = await signedRequest(config, "DELETE", key, null);
      if (!response.ok && response.status !== 404) {
        throw new ProvenanceError(
          "STORAGE_DELETE_FAILED",
          "object storage rejected the delete",
          502,
        );
      }
    },
  };
}
