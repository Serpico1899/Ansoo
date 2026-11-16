// Spike task 10: asset validation/storage and SSRF hardening.
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, seedUser } from "../spike/harness.ts";
import {
  assertSafeResolvedHost,
  assertSafeUrl,
  assertUpload,
  ASSET_MAX_BYTES,
  AssetError,
  fetchSafely,
  markAssetClean,
  publicAssetView,
  sha256Hex,
  signAssetUrl,
  sniffMime,
  storeLocalAsset,
  stripJpegExif,
  verifyAssetUrl,
} from "../spike/assets.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 1, 2, 3, 4]);
const PNG = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  0x00,
  0x00,
]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

async function expectAssetCode(fn: () => unknown | Promise<unknown>, code: string) {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof AssetError)) throw error;
    assertEquals(error.code, code);
    return;
  }
  throw new Error(`expected AssetError ${code}`);
}

Deno.test({
  name: "spike: assets stay quarantined and URL fetching is SSRF-hardened",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_assets");
    const root = "/tmp/opencode/ansoo-spike-assets";
    try {
      const userId = await seedUser(h, { roles: ["RESEARCHER"] });

      await t.step("MIME sniffing uses bytes, not the client claim", async () => {
        assertEquals(sniffMime(JPEG), "image/jpeg");
        assertEquals(sniffMime(PNG), "image/png");
        assertEquals(sniffMime(PDF), "application/pdf");
        assertEquals(sniffMime(new TextEncoder().encode("<html>")), null);

        assertEquals(
          assertUpload({ bytes: JPEG, declaredMime: "image/jpeg", fileName: "scan.jpg" }),
          { mimeType: "image/jpeg", byteSize: JPEG.byteLength },
        );
        await expectAssetCode(
          () => assertUpload({ bytes: JPEG, declaredMime: "image/png", fileName: "scan.png" }),
          "MIME_MISMATCH",
        );
        await expectAssetCode(
          () => assertUpload({ bytes: JPEG, declaredMime: "image/jpeg", fileName: "scan.png" }),
          "EXTENSION_MISMATCH",
        );
        await expectAssetCode(
          () =>
            assertUpload({
              bytes: new TextEncoder().encode("<svg onload=alert(1)>"),
              declaredMime: "image/jpeg",
              fileName: "x.jpg",
            }),
          "UNKNOWN_MIME",
        );
        await expectAssetCode(
          () =>
            assertUpload({
              bytes: new Uint8Array(),
              declaredMime: "image/jpeg",
              fileName: "x.jpg",
            }),
          "EMPTY",
        );
        const huge = new Uint8Array(ASSET_MAX_BYTES + 1);
        huge.set(JPEG);
        await expectAssetCode(
          () => assertUpload({ bytes: huge, declaredMime: "image/jpeg", fileName: "x.jpg" }),
          "TOO_LARGE",
        );
      });

      await t.step("asset bytes go to storage and Mongo holds only metadata", async () => {
        const asset = await storeLocalAsset(h.db, {
          root,
          bytes: JPEG,
          declaredMime: "image/jpeg",
          fileName: "../../etc/passwd.jpg",
          uploadedBy: userId,
        });
        assertEquals(asset.processingStatus, "QUARANTINED");
        assertEquals(asset.malwareScan.status, "PENDING");
        assertEquals(asset.visibility, "RESTRICTED");
        assertEquals(asset.sha256, await sha256Hex(JPEG));
        assert(asset.storage.objectKey.endsWith(".bin"));

        const storedBytes = await Deno.readFile(
          `${root}/${asset.storage.objectKey}`,
        );
        assertEquals(storedBytes, JPEG);

        const raw = (await h.db.collection("assets").findOne({
          _id: asset._id,
        }))!;
        const serialized = JSON.stringify(raw);
        assertEquals(serialized.includes("base64"), false);
        assertEquals("bytes" in raw, false);
        assert(serialized.length < 4096);

        await expectAssetCode(() => publicAssetView(raw), "NOT_CLEAN");
        await markAssetClean(h.db, asset._id.toString(), "PUBLIC");
        const view = publicAssetView(
          (await h.db.collection("assets").findOne({ _id: asset._id }))!,
        );
        assertEquals("storage" in view, false);
        assertEquals(JSON.stringify(view).includes("objectKey"), false);
      });

      await t.step("a cleaned asset that is not public stays hidden", async () => {
        const asset = await storeLocalAsset(h.db, {
          root,
          bytes: PNG,
          declaredMime: "image/png",
          fileName: "internal.png",
          uploadedBy: userId,
        });
        await markAssetClean(h.db, asset._id.toString(), "INTERNAL");
        const raw = (await h.db.collection("assets").findOne({
          _id: asset._id,
        }))!;
        await expectAssetCode(() => publicAssetView(raw), "NOT_PUBLIC");
      });

      await t.step("EXIF is stripped before public use", () => {
        const segmentPayload = new TextEncoder().encode("Exif\u0000\u0000GPSLatitude=35.6");
        const length = segmentPayload.byteLength + 2;
        const exif = new Uint8Array([
          0xff,
          0xe1,
          (length >> 8) & 0xff,
          length & 0xff,
          ...segmentPayload,
          0xff,
          0xd9,
        ]);
        const withExif = new Uint8Array([0xff, 0xd8, ...exif]);
        assert(new TextDecoder().decode(withExif).includes("GPSLatitude"));
        const stripped = stripJpegExif(withExif);
        assertEquals(
          new TextDecoder().decode(stripped).includes("GPSLatitude"),
          false,
        );
        assertEquals([...stripped.slice(0, 2)], [0xff, 0xd8]);
      });

      await t.step("asset URLs are signed and expire", async () => {
        const secret = "asset-url-secret";
        const id = new ObjectId().toString();
        const expiresAt = Date.now() + 60_000;
        const url = await signAssetUrl(secret, id, expiresAt);
        const signature = new URL(url, "https://local.invalid").searchParams.get("sig")!;
        assertEquals(await verifyAssetUrl(secret, id, expiresAt, signature), true);
        assertEquals(
          await verifyAssetUrl(secret, id, expiresAt, signature.slice(0, -1) + "0"),
          false,
        );
        assertEquals(
          await verifyAssetUrl(secret, new ObjectId().toString(), expiresAt, signature),
          false,
        );
        assertEquals(
          await verifyAssetUrl(secret, id, Date.now() - 1, signature),
          false,
        );
      });

      await t.step("literal private hosts and schemes are blocked", async () => {
        const blocked: Array<[string, string]> = [
          ["http://example.com/", "SSRF_HTTPS_REQUIRED"],
          ["https://localhost/", "SSRF_HOST"],
          ["https://app.localhost/", "SSRF_HOST"],
          ["https://printer.internal/", "SSRF_HOST"],
          ["https://metadata.google.internal/", "SSRF_HOST"],
          ["https://127.0.0.1/", "SSRF_IP"],
          ["https://10.1.2.3/", "SSRF_IP"],
          ["https://172.16.0.1/", "SSRF_IP"],
          ["https://192.168.1.1/", "SSRF_IP"],
          ["https://169.254.169.254/latest/meta-data/", "SSRF_IP"],
          ["https://100.64.0.1/", "SSRF_IP"],
          ["https://0.0.0.0/", "SSRF_IP"],
          ["https://[::1]/", "SSRF_IP"],
          ["https://[fe80::1]/", "SSRF_IP"],
          ["https://[fc00::1]/", "SSRF_IP"],
          ["https://user:pass@example.com/", "SSRF_CREDENTIALS"],
          ["https://example.com:8443/", "SSRF_PORT"],
        ];
        for (const [url, code] of blocked) {
          await expectAssetCode(() => assertSafeUrl(url), code);
        }
        assertEquals(assertSafeUrl("https://example.com/a").hostname, "example.com");
        assertEquals(assertSafeUrl("https://example.com:443/a").port, "");
      });

      await t.step("DNS is resolved and revalidated", async () => {
        const url = assertSafeUrl("https://example.com/");
        await assertSafeResolvedHost(url, () => Promise.resolve(["93.184.216.34"]));
        await expectAssetCode(
          () => assertSafeResolvedHost(url, () => Promise.resolve(["127.0.0.1"])),
          "SSRF_DNS_IP",
        );
        await expectAssetCode(
          () => assertSafeResolvedHost(url, () => Promise.resolve([])),
          "SSRF_DNS",
        );
        // Integer/encoded IP form is not blocked lexically, so resolution must
        // catch it.
        await expectAssetCode(
          () =>
            assertSafeResolvedHost(
              new URL("https://2130706433/"),
              () => Promise.resolve(["127.0.0.1"]),
            ),
          "SSRF_DNS_IP",
        );
      });

      await t.step("redirects and bodies are capped and credentials are omitted", async () => {
        const seen: Array<{ url: string; init: RequestInit }> = [];
        const fakeFetch =
          (routes: Record<string, () => Response>) => (url: string, init: RequestInit) => {
            seen.push({ url, init });
            const route = routes[url];
            if (!route) {
              return Promise.reject(new Error(`unexpected fetch ${url}`));
            }
            return Promise.resolve(route());
          };

        const publicResolve = () => Promise.resolve(["93.184.216.34"]);

        const redirectToMetadata = fakeFetch({
          "https://example.com/": () =>
            new Response(null, {
              status: 302,
              headers: { location: "http://169.254.169.254/latest/meta-data/" },
            }),
        });
        await expectAssetCode(
          () =>
            fetchSafely("https://example.com/", {
              resolve: publicResolve,
              fetch: redirectToMetadata,
            }),
          "SSRF_HTTPS_REQUIRED",
        );
        assertEquals(seen[0].init.credentials, "omit");
        assertEquals(seen[0].init.redirect, "manual");
        assertEquals(
          JSON.stringify(seen[0].init.headers),
          JSON.stringify({ "user-agent": "AnsooSpike/0.1" }),
        );

        const redirectToLoopback = fakeFetch({
          "https://example.com/": () =>
            new Response(null, {
              status: 301,
              headers: { location: "https://127.0.0.1/" },
            }),
        });
        await expectAssetCode(
          () =>
            fetchSafely("https://example.com/", {
              resolve: publicResolve,
              fetch: redirectToLoopback,
            }),
          "SSRF_IP",
        );

        const redirectDns = fakeFetch({
          "https://example.com/": () =>
            new Response(null, {
              status: 303,
              headers: { location: "https://rebind.example.net/" },
            }),
        });
        await expectAssetCode(
          () =>
            fetchSafely("https://example.com/", {
              resolve: (host) =>
                Promise.resolve(
                  host === "example.com" ? ["93.184.216.34"] : ["10.0.0.5"],
                ),
              fetch: redirectDns,
            }),
          "SSRF_DNS_IP",
        );

        const tooMany = fakeFetch({
          "https://example.com/": () =>
            new Response(null, {
              status: 302,
              headers: { location: "https://example.com/" },
            }),
        });
        await expectAssetCode(
          () =>
            fetchSafely("https://example.com/", {
              resolve: publicResolve,
              fetch: tooMany,
              maxRedirects: 2,
            }),
          "SSRF_TOO_MANY_REDIRECTS",
        );

        const large = fakeFetch({
          "https://example.com/": () => new Response(new Uint8Array(64), { status: 200 }),
        });
        await expectAssetCode(
          () =>
            fetchSafely("https://example.com/", {
              resolve: publicResolve,
              fetch: large,
              maxBytes: 32,
            }),
          "RESPONSE_TOO_LARGE",
        );

        const ok = await fetchSafely("https://example.com/", {
          resolve: publicResolve,
          fetch: fakeFetch({
            "https://example.com/": () =>
              new Response(JPEG, {
                status: 200,
                headers: { "content-type": "image/jpeg" },
              }),
          }),
        });
        assertEquals(ok.status, 200);
        assertEquals(ok.bytes, JPEG);
        assertEquals(ok.contentType, "image/jpeg");
      });
    } finally {
      await h.close();
      await Deno.remove(root, { recursive: true }).catch(() => {});
    }
  },
});
