// Plan 04 - identifier normalization (I13, spec 13.2).
import { assertEquals, assertThrows } from "@std/assert";
import {
  gs1PrefixMetadata,
  IdentifierError,
  identifierKey,
  normalizeOrganizationIdentifier,
  normalizeProductIdentifier,
  validateIdentifierStatusTransition,
} from "../../utils/identity/identifier.ts";

function expectCode(fn: () => unknown, code: string): IdentifierError {
  const error = assertThrows(fn, IdentifierError);
  assertEquals(error.code, code);
  return error;
}

Deno.test("identifier: GTIN strips separators and preserves leading zeros", () => {
  assertEquals(
    normalizeProductIdentifier("GTIN", "000 6381-333935"),
    {
      scheme: "GTIN",
      value: "0006381333935",
      normalizedValue: "0006381333935",
      matchValue: "00006381333935",
    },
  );
  assertEquals(
    normalizeProductIdentifier("GTIN", "96385074"),
    {
      scheme: "GTIN",
      value: "96385074",
      normalizedValue: "96385074",
      matchValue: "00000096385074",
    },
  );
});

Deno.test("identifier: GTIN accepts 8/12/13/14 digits and rejects bad check digits", () => {
  const valid = ["96385074", "036000291452", "4006381333931", "00012345600012"];
  for (const value of valid) normalizeProductIdentifier("GTIN", value);
  for (const bad of ["4006381333932", "400638133393", "40063813339310", "400638133393x"]) {
    expectCode(() => normalizeProductIdentifier("GTIN", bad), "INVALID_GTIN");
  }
});

Deno.test("identifier: unknown or unruled schemes fail closed", () => {
  expectCode(() => normalizeProductIdentifier("UPC_A" as "GTIN", "012345678905"), "UNKNOWN_SCHEME");
  for (const scheme of ["NATIONAL_ID", "REGISTRATION_NUMBER", "LEI", "TAX_ID"] as const) {
    expectCode(
      () => normalizeOrganizationIdentifier(scheme, "0000000000"),
      "UNSUPPORTED_SCHEME",
    );
  }
});

Deno.test("identifier: different schemes are never compared", () => {
  assertEquals(identifierKey({ scheme: "GTIN", normalizedValue: "123" }), "GTIN|123");
  assertThrows(
    () =>
      identifierKey({
        scheme: "UPC_A" as never,
        normalizedValue: "123",
      }),
    IdentifierError,
  );
  assertEquals(
    identifierKey({ scheme: "GTIN", normalizedValue: "123" }) ===
      identifierKey({ scheme: "SKU", normalizedValue: "123" }),
    false,
  );
});

Deno.test("identifier: status transitions are explicit and RETIRED is terminal", () => {
  validateIdentifierStatusTransition("UNVERIFIED", "VERIFIED");
  validateIdentifierStatusTransition("UNVERIFIED", "DISPUTED");
  validateIdentifierStatusTransition("VERIFIED", "DISPUTED");
  validateIdentifierStatusTransition("DISPUTED", "VERIFIED");
  validateIdentifierStatusTransition("VERIFIED", "RETIRED");
  validateIdentifierStatusTransition("VERIFIED", "VERIFIED");
  expectCode(
    () => validateIdentifierStatusTransition("RETIRED", "VERIFIED"),
    "INVALID_STATUS_TRANSITION",
  );
  expectCode(
    () => validateIdentifierStatusTransition("VERIFIED", "UNVERIFIED"),
    "INVALID_STATUS_TRANSITION",
  );
});

Deno.test("identifier: GS1 prefix is metadata only, never country/ownership inference", () => {
  assertEquals(gs1PrefixMetadata("4006381333931"), {
    prefix: "400",
    inference: "FORBIDDEN",
  });
  const result = normalizeProductIdentifier("GTIN", "4006381333931");
  assertEquals("country" in result, false);
  assertEquals("nationality" in result, false);
  assertEquals("ownerId" in result, false);
});
