// Plan 06 - SSRF-safe capture fetcher matrix (S29).
import { assert, assertEquals, assertRejects } from "@std/assert";
import {
  type DnsResolver,
  type FetchTransport,
  isForbiddenAddress,
  safeFetchUrl,
  validateCaptureUrl,
} from "../../utils/provenance/fetcher.ts";
import { ProvenanceError } from "../../utils/provenance/common.ts";

Deno.test("fetcher: URL scheme, port, credentials, and literal-address blocks", () => {
  assertEquals(validateCaptureUrl("https://example.com/a").hostname, "example.com");
  const cases: Array<[string, string]> = [
    ["http://example.com/", "INSECURE_URL"],
    ["ftp://example.com/", "INSECURE_URL"],
    ["https://example.com:8443/", "FORBIDDEN_PORT"],
    ["https://user:pass@example.com/", "URL_CREDENTIALS_FORBIDDEN"],
    ["https://localhost/", "SSRF_BLOCKED"],
    ["https://foo.localhost/", "SSRF_BLOCKED"],
    ["https://metadata.google.internal/", "SSRF_BLOCKED"],
    ["https://127.0.0.1/", "SSRF_BLOCKED"],
    ["https://10.0.0.1/", "SSRF_BLOCKED"],
    ["https://169.254.169.254/latest/meta-data/", "SSRF_BLOCKED"],
    ["https://[::1]/", "SSRF_BLOCKED"],
    ["https://[fc00::1]/", "SSRF_BLOCKED"],
  ];
  for (const [url, code] of cases) {
    try {
      validateCaptureUrl(url);
      throw new Error(`expected ${url} to be rejected`);
    } catch (error) {
      assertEquals((error as ProvenanceError).code, code);
    }
  }
});

Deno.test("fetcher: address classifier covers IPv4, IPv6, and mapped forms", () => {
  assertEquals(isForbiddenAddress("8.8.8.8"), false);
  assertEquals(isForbiddenAddress("2606:4700:4700::1111"), false);
  for (
    const address of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "198.18.0.1",
      "203.0.113.9",
      "224.0.0.1",
      "::",
      "::1",
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "not-an-ip",
    ]
  ) {
    assertEquals(isForbiddenAddress(address), true, address);
  }
});

function resolver(map: Record<string, string[]>): DnsResolver {
  return (hostname) => Promise.resolve(map[hostname] ?? []);
}

type HandlerResult = {
  status: number;
  headers?: Record<string, string>;
  bytes?: Uint8Array;
};

function transport(
  handler: (url: URL, address: string) => HandlerResult,
): FetchTransport {
  return ({ url, address }) => {
    const result = handler(url, address);
    return Promise.resolve({
      status: result.status,
      headers: result.headers ?? {},
      bytes: result.bytes ?? new Uint8Array(),
    });
  };
}

Deno.test("fetcher: private DNS answers are rejected before transport", async () => {
  let called = false;
  await assertRejects(
    () =>
      safeFetchUrl({
        url: "https://private.example/",
        resolver: resolver({ "private.example": ["10.0.0.8"] }),
        transport: transport(() => {
          called = true;
          return { status: 200 };
        }),
      }),
    ProvenanceError,
    "private address",
  );
  assertEquals(called, false);
});

Deno.test("fetcher: redirects revalidate DNS, address, and scheme", async () => {
  const t = transport((url) => {
    if (url.hostname === "start.example") {
      return { status: 302, headers: { location: "https://rebind.example/final" } };
    }
    return { status: 200, bytes: new TextEncoder().encode("ok") };
  });
  const rebinding: DnsResolver = (hostname) =>
    Promise.resolve(hostname === "start.example" ? ["93.184.216.34"] : ["127.0.0.1"]);
  await assertRejects(
    () => safeFetchUrl({ url: "https://start.example/", resolver: rebinding, transport: t }),
    ProvenanceError,
    "private address",
  );

  await assertRejects(
    () =>
      safeFetchUrl({
        url: "https://start.example/",
        resolver: resolver({ "start.example": ["93.184.216.34"] }),
        transport: transport(() => ({
          status: 301,
          headers: { location: "http://insecure.example/" },
        })),
      }),
    ProvenanceError,
    "HTTPS",
  );

  await assertRejects(
    () =>
      safeFetchUrl({
        url: "https://start.example/",
        resolver: resolver({ "start.example": ["93.184.216.34"] }),
        transport: transport(() => ({
          status: 302,
          headers: { location: "https://start.example/" },
        })),
      }),
    ProvenanceError,
    "loop",
  );
});

Deno.test("fetcher: caps redirects, size, timeout, and non-2xx responses", async () => {
  let hop = 0;
  const redirecting = transport(() => ({
    status: 302,
    headers: { location: `https://hop${++hop}.example/` },
  }));
  await assertRejects(
    () =>
      safeFetchUrl({
        url: "https://hop0.example/",
        resolver: (hostname) => Promise.resolve([`93.184.216.${hostname.length % 200 + 1}`]),
        transport: redirecting,
      }),
    ProvenanceError,
    "redirect cap",
  );

  await assertRejects(
    () =>
      safeFetchUrl({
        url: "https://big.example/",
        resolver: resolver({ "big.example": ["93.184.216.34"] }),
        transport: transport(() => ({ status: 200, bytes: new Uint8Array(11) })),
        maxBytes: 10,
      }),
    ProvenanceError,
    "byte cap",
  );

  await assertRejects(
    () =>
      safeFetchUrl({
        url: "https://slow.example/",
        resolver: resolver({ "slow.example": ["93.184.216.34"] }),
        transport: ({ signal }) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        timeoutMs: 5,
      }),
    ProvenanceError,
    "timed out",
  );

  await assertRejects(
    () =>
      safeFetchUrl({
        url: "https://missing.example/",
        resolver: resolver({ "missing.example": ["93.184.216.34"] }),
        transport: transport(() => ({ status: 404 })),
      }),
    ProvenanceError,
    "HTTP 404",
  );
});

Deno.test("fetcher: success pins the validated address and reports redirects", async () => {
  const seen: Array<[string, string]> = [];
  const bytes = new TextEncoder().encode("captured");
  const result = await safeFetchUrl({
    url: "https://start.example/",
    resolver: resolver({
      "start.example": ["93.184.216.34"],
      "final.example": ["93.184.216.35"],
    }),
    transport: transport((url, address): HandlerResult => {
      seen.push([url.hostname, address]);
      if (url.hostname === "start.example") {
        return { status: 302, headers: { location: "https://final.example/page" } };
      }
      return { status: 200, headers: { "content-type": "text/plain" }, bytes };
    }),
  });
  assertEquals(seen, [
    ["start.example", "93.184.216.34"],
    ["final.example", "93.184.216.35"],
  ]);
  assertEquals(result.redirects, 1);
  assertEquals(result.finalUrl, "https://final.example/page");
  assert(result.bytes.byteLength > 0);
});
