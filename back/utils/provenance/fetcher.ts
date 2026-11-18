// SSRF-safe capture fetcher. Spec 12, S29.
//
// HTTPS only, port 443 only, no credentials, no ambient cookies. DNS is
// resolved and every address is validated; the connection is pinned to the
// validated address. Every redirect repeats URL, DNS, and address validation.
import { ProvenanceError } from "./common.ts";
import { SECURITY_LIMITS } from "../domain/constants.ts";

export type DnsResolver = (hostname: string) => Promise<string[]>;

export type FetchTransport = (input: {
  url: URL;
  address: string;
  signal: AbortSignal;
}) => Promise<{
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
}>;

export type SafeFetchResult = {
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  bytes: Uint8Array;
  redirects: number;
};

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata.google.com",
]);

function parseIpv4(input: string): number[] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    octets.push(value);
  }
  return octets;
}

function blockedIpv4(octets: number[]): boolean {
  const [a, b, c] = octets;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224;
}

function parseIpv6(input: string): number[] | null {
  let value = input.toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = parseIpv4(value.slice(lastColon + 1));
    if (!ipv4) return null;
    value = `${value.slice(0, lastColon)}:${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${
      ((ipv4[2] << 8) | ipv4[3]).toString(16)
    }`;
  }
  const pieces = value.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  const groups = [...left, ...right];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
  }
  const missing = 8 - groups.length;
  if (pieces.length === 1 && missing !== 0) return null;
  if (pieces.length === 2 && missing < 1) return null;
  const full = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((group) => parseInt(group, 16));
  if (full.length !== 8) return null;
  const bytes: number[] = [];
  for (const group of full) {
    bytes.push((group >> 8) & 0xff, group & 0xff);
  }
  return bytes;
}

function blockedIpv6(bytes: number[]): boolean {
  const allZero = bytes.every((byte) => byte === 0);
  if (allZero) return true;
  const loopback = bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1;
  if (loopback) return true;
  if ((bytes[0] & 0xfe) === 0xfc) return true;
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true;
  if (bytes[0] === 0xff) return true;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true;
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x02) return true;
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return true;
  const mapped = bytes.slice(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff && bytes[11] === 0xff;
  if (mapped) return blockedIpv4([bytes[12], bytes[13], bytes[14], bytes[15]]);
  const nat64 = bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b;
  if (nat64) return true;
  return false;
}

export function isForbiddenAddress(address: string): boolean {
  const ipv4 = parseIpv4(address);
  if (ipv4) return blockedIpv4(ipv4);
  const ipv6 = parseIpv6(address);
  if (ipv6) return blockedIpv6(ipv6);
  return true;
}

function hostnameWithoutBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

export function validateCaptureUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProvenanceError("INVALID_URL", "capture URL is malformed");
  }
  if (url.protocol !== "https:") {
    throw new ProvenanceError("INSECURE_URL", "capture requires HTTPS");
  }
  if (url.port && url.port !== "443") {
    throw new ProvenanceError("FORBIDDEN_PORT", "capture requires port 443");
  }
  if (url.username || url.password) {
    throw new ProvenanceError(
      "URL_CREDENTIALS_FORBIDDEN",
      "capture URL must not contain credentials",
    );
  }
  const hostname = hostnameWithoutBrackets(url.hostname.toLowerCase());
  if (
    BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") || hostname.endsWith(".internal")
  ) {
    throw new ProvenanceError("SSRF_BLOCKED", "capture hostname is not public", 422, {
      reason: "BLOCKED_HOSTNAME",
    });
  }
  if (parseIpv4(hostname) || parseIpv6(hostname)) {
    if (isForbiddenAddress(hostname)) {
      throw new ProvenanceError("SSRF_BLOCKED", "capture address is not public", 422, {
        reason: "FORBIDDEN_ADDRESS",
      });
    }
  }
  return url;
}

export async function resolvePublicAddresses(
  hostname: string,
  resolver: DnsResolver,
): Promise<string[]> {
  let addresses: string[];
  try {
    addresses = await resolver(hostnameWithoutBrackets(hostname));
  } catch {
    throw new ProvenanceError(
      "DNS_RESOLUTION_FAILED",
      "capture hostname could not be resolved",
      502,
    );
  }
  const unique = [...new Set(addresses.filter((address) => typeof address === "string"))];
  if (unique.length === 0) {
    throw new ProvenanceError(
      "DNS_RESOLUTION_FAILED",
      "capture hostname resolved to no addresses",
      502,
    );
  }
  for (const address of unique) {
    if (isForbiddenAddress(address)) {
      throw new ProvenanceError(
        "SSRF_BLOCKED",
        "capture hostname resolves to a private address",
        422,
        {
          reason: "DNS_PRIVATE_ADDRESS",
        },
      );
    }
  }
  return unique;
}

export const defaultDnsResolver: DnsResolver = async (hostname) => {
  const addresses: string[] = [];
  for (const record of ["A", "AAAA"] as const) {
    try {
      const values = await Deno.resolveDns(hostname, record);
      addresses.push(...values);
    } catch {
      // A missing AAAA record is normal.
    }
  }
  return addresses;
};

async function readAll(
  conn: Deno.Conn,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const buffer = new Uint8Array(16 * 1024);
  while (true) {
    if (signal.aborted) throw new ProvenanceError("FETCH_TIMEOUT", "capture timed out", 504);
    const read = await conn.read(buffer);
    if (read === null) break;
    total += read;
    if (total > limit + 64 * 1024) {
      throw new ProvenanceError("RESPONSE_TOO_LARGE", "capture response exceeds the byte cap", 413);
    }
    chunks.push(buffer.slice(0, read));
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function decodeChunked(bytes: Uint8Array, limit: number): Uint8Array {
  const output: number[] = [];
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset < bytes.length) {
    const lineEnd = bytes.indexOf(0x0d, offset);
    if (lineEnd < 0) break;
    const sizeLine = decoder.decode(bytes.slice(offset, lineEnd)).split(";")[0].trim();
    const size = parseInt(sizeLine, 16);
    if (!Number.isFinite(size)) {
      throw new ProvenanceError("INVALID_RESPONSE", "capture response has invalid chunking", 502);
    }
    offset = lineEnd + 2;
    if (size === 0) break;
    if (output.length + size > limit) {
      throw new ProvenanceError("RESPONSE_TOO_LARGE", "capture response exceeds the byte cap", 413);
    }
    for (let index = 0; index < size; index++) output.push(bytes[offset + index]);
    offset += size + 2;
  }
  return new Uint8Array(output);
}

function parseResponse(raw: Uint8Array, maxBytes: number): {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
} {
  const marker = new Uint8Array([0x0d, 0x0a, 0x0d, 0x0a]);
  let headerEnd = -1;
  outer: for (let index = 0; index + marker.length <= raw.length; index++) {
    for (let part = 0; part < marker.length; part++) {
      if (raw[index + part] !== marker[part]) continue outer;
    }
    headerEnd = index;
    break;
  }
  if (headerEnd < 0) {
    throw new ProvenanceError("INVALID_RESPONSE", "capture response has no headers", 502);
  }
  const text = new TextDecoder().decode(raw.slice(0, headerEnd));
  const lines = text.split("\r\n");
  const status = Number(lines[0]?.split(" ")[1]);
  if (!Number.isInteger(status)) {
    throw new ProvenanceError("INVALID_RESPONSE", "capture response has no status", 502);
  }
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  let body: Uint8Array = raw.slice(headerEnd + marker.length);
  const length = headers["content-length"] ? Number(headers["content-length"]) : undefined;
  if (length !== undefined && Number.isFinite(length)) {
    if (length > maxBytes) {
      throw new ProvenanceError("RESPONSE_TOO_LARGE", "capture response exceeds the byte cap", 413);
    }
    body = body.slice(0, length);
  }
  if (headers["transfer-encoding"]?.toLowerCase().includes("chunked")) {
    body = decodeChunked(body, maxBytes);
  }
  if (body.byteLength > maxBytes) {
    throw new ProvenanceError("RESPONSE_TOO_LARGE", "capture response exceeds the byte cap", 413);
  }
  return { status, headers, body };
}

export const denoPinnedTransport: FetchTransport = async ({ url, address, signal }) => {
  const conn = await Deno.connect({ hostname: address, port: 443 });
  let tls: Deno.TlsConn;
  try {
    tls = await Deno.startTls(conn, { hostname: hostnameWithoutBrackets(url.hostname) });
  } catch (error) {
    try {
      conn.close();
    } catch {
      // already closed
    }
    throw error;
  }
  try {
    const request = [
      `GET ${url.pathname}${url.search} HTTP/1.1`,
      `Host: ${url.host}`,
      "Connection: close",
      "Accept-Encoding: identity",
      "User-Agent: AnsooCapture/1.0",
      "",
      "",
    ].join("\r\n");
    await tls.write(new TextEncoder().encode(request));
    const raw = await readAll(tls, SECURITY_LIMITS.fetcherMaxBytes, signal);
    const parsed = parseResponse(raw, SECURITY_LIMITS.fetcherMaxBytes);
    return { status: parsed.status, headers: parsed.headers, bytes: parsed.body };
  } finally {
    try {
      tls.close();
    } catch {
      // already closed
    }
  }
};

function withTimeout<T>(
  promise: Promise<T>,
  controller: AbortController,
  timeoutMs: number,
): Promise<T> {
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return promise.catch((error) => {
    if (controller.signal.aborted) {
      throw new ProvenanceError("FETCH_TIMEOUT", "capture timed out", 504);
    }
    throw error;
  }).finally(() => clearTimeout(timer));
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  return headers[name.toLowerCase()];
}

export async function safeFetchUrl(input: {
  url: string;
  resolver?: DnsResolver;
  transport?: FetchTransport;
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<SafeFetchResult> {
  const resolver = input.resolver ?? defaultDnsResolver;
  const transport = input.transport ?? denoPinnedTransport;
  const maxRedirects = input.maxRedirects ?? SECURITY_LIMITS.fetcherMaxRedirects;
  const timeoutMs = input.timeoutMs ?? SECURITY_LIMITS.fetcherTimeoutMs;
  const maxBytes = input.maxBytes ?? SECURITY_LIMITS.fetcherMaxBytes;
  let current = validateCaptureUrl(input.url);
  const visited = new Set<string>([current.toString()]);
  let redirects = 0;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const addresses = await resolvePublicAddresses(current.hostname, resolver);
    const controller = new AbortController();
    const response = await withTimeout(
      transport({ url: current, address: addresses[0], signal: controller.signal }),
      controller,
      timeoutMs,
    );
    if (response.status >= 300 && response.status < 400) {
      const location = headerValue(response.headers, "location");
      if (!location) {
        throw new ProvenanceError("INVALID_REDIRECT", "redirect has no location", 502);
      }
      if (redirects >= maxRedirects) {
        throw new ProvenanceError("TOO_MANY_REDIRECTS", "capture exceeded the redirect cap", 422);
      }
      const next = validateCaptureUrl(new URL(location, current).toString());
      if (visited.has(next.toString())) {
        throw new ProvenanceError("REDIRECT_LOOP", "capture redirect loop detected", 422);
      }
      visited.add(next.toString());
      current = next;
      redirects++;
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ProvenanceError("HTTP_ERROR", `capture returned HTTP ${response.status}`, 502, {
        status: response.status,
      });
    }
    if (response.bytes.byteLength > maxBytes) {
      throw new ProvenanceError("RESPONSE_TOO_LARGE", "capture response exceeds the byte cap", 413);
    }
    return {
      finalUrl: current.toString(),
      status: response.status,
      headers: response.headers,
      bytes: response.bytes,
      redirects,
    };
  }
  throw new ProvenanceError("TOO_MANY_REDIRECTS", "capture exceeded the redirect cap", 422);
}
