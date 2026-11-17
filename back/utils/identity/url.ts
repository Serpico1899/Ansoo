// URL canonicalization for source matching. Spec 13.3.
//
// Canonical equality is suggestive only; it is never an automatic Source merge.
// Policy: lowercase host, remove default port, fragment, and tracking params;
// IDN to punycode; remove one trailing slash except at the root.

const TRACKING_PARAMS = new Set(["gclid", "fbclid"]);

export class UrlCanonicalizationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "UrlCanonicalizationError";
  }
}

export function canonicalizeUrl(raw: string): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new UrlCanonicalizationError("INVALID_URL", "URL must be a non-empty string");
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UrlCanonicalizationError("INVALID_URL", "URL is malformed");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UrlCanonicalizationError("UNSUPPORTED_SCHEME", "only HTTP(S) URLs are supported");
  }
  if (url.username || url.password) {
    throw new UrlCanonicalizationError("INVALID_URL", "URL must not contain credentials");
  }

  const params = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) continue;
    params.append(key, value);
  }

  url.hash = "";
  url.search = params.toString();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
