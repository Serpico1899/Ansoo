// Plan 04 - locked Persian normalization vectors (S25) and properties.
import { assertEquals, assertNotEquals } from "@std/assert";
import { matchKey, normalizeName } from "../../utils/identity/normalize.ts";

const VECTORS = [
  ["شركت پگاه ايران", "شرکت پگاه ایران", "شرکتپگاهایران"],
  ["شرکت پگاه‌ایران", "شرکت پگاه ایران", "شرکتپگاهایران"],
  ["پگاه  ", "پگاه", "پگاه"],
  ["کاله ۱۲۳", "کاله 123", "کاله123"],
  ["ميهن", "میهن", "میهن"],
  ["دامدارانِ", "دامداران", "دامداران"],
] as const;

Deno.test("normalization: all six mandatory vectors pass exactly", () => {
  for (const [input, normalized, key] of VECTORS) {
    assertEquals(normalizeName(input), normalized, `normalizedName: ${input}`);
    assertEquals(matchKey(input), key, `matchKey: ${input}`);
  }
});

Deno.test("normalization: idempotent for both keys", () => {
  for (const [input] of VECTORS) {
    assertEquals(normalizeName(normalizeName(input)), normalizeName(input));
    assertEquals(matchKey(matchKey(input)), matchKey(input));
  }
});

Deno.test("normalization: whitespace variants are invariant", () => {
  const variants = [
    "شرکت پگاه ایران",
    "شرکت\tپگاه\nایران",
    "  شرکت   پگاه  ایران  ",
    "شرکت\u200Cپگاه ایران",
  ];
  const normalized = new Set(variants.map(normalizeName));
  const keys = new Set(variants.map(matchKey));
  assertEquals(normalized.size, 1);
  assertEquals(keys.size, 1);
  assertEquals([...normalized][0], "شرکت پگاه ایران");
});

Deno.test("normalization: Persian and Arabic digits fold to ASCII", () => {
  assertEquals(normalizeName("۱۲۳٤٥٦٧٨٩٠"), "1234567890");
  assertEquals(normalizeName("کاله ۱۲۳"), "کاله 123");
  assertEquals(matchKey("کاله-۱۲۳"), "کاله123");
});

Deno.test("normalization: scripts and punctuation never merge accidentally", () => {
  assertNotEquals(matchKey("product"), matchKey("پروداکت"));
  assertNotEquals(matchKey("abc"), matchKey("ابج"));
  assertEquals(matchKey("A.B, C!"), "abc");
  assertEquals(matchKey("  a\tb  "), "ab");
});
