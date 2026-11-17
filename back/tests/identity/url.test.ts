// Plan 04 - URL canonicalization (spec 13.3). Equality is suggestive only.
import { assertEquals, assertThrows } from "@std/assert";
import { canonicalizeUrl, UrlCanonicalizationError } from "../../utils/identity/url.ts";

Deno.test("url: lowercases host, removes default port and fragment", () => {
  assertEquals(
    canonicalizeUrl("HTTPS://Example.COM:443/a/b/?utm_source=x&gclid=y#frag"),
    "https://example.com/a/b",
  );
  assertEquals(canonicalizeUrl("http://Example.com:80/"), "http://example.com/");
});

Deno.test("url: strips tracking parameters and keeps meaningful query values", () => {
  assertEquals(
    canonicalizeUrl("https://example.com/x?utm_medium=a&id=42&fbclid=z&utm_campaign=q"),
    "https://example.com/x?id=42",
  );
  assertEquals(
    canonicalizeUrl("https://example.com/x?id=42&page=2"),
    "https://example.com/x?id=42&page=2",
  );
});

Deno.test("url: trailing slash policy removes one slash except at the root", () => {
  assertEquals(canonicalizeUrl("https://example.com/path/"), "https://example.com/path");
  assertEquals(canonicalizeUrl("https://example.com/path//"), "https://example.com/path/");
  assertEquals(canonicalizeUrl("https://example.com/"), "https://example.com/");
});

Deno.test("url: internationalized hosts become punycode", () => {
  assertEquals(
    canonicalizeUrl("https://münich.example/straße"),
    "https://xn--mnich-kva.example/stra%C3%9Fe",
  );
});

Deno.test("url: non-http schemes and malformed URLs are rejected", () => {
  assertThrows(() => canonicalizeUrl("javascript:alert(1)"), UrlCanonicalizationError);
  assertThrows(() => canonicalizeUrl("ftp://example.com/a"), UrlCanonicalizationError);
  assertThrows(() => canonicalizeUrl("not a url"), UrlCanonicalizationError);
});
