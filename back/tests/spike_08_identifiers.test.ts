// Spike task 11: exact identifier resolution with no inference.
import { assertEquals } from "@std/assert";
import { createHarness, seedEntity } from "../spike/harness.ts";
import {
  gs1PrefixMetadata,
  gtinCheckDigit,
  IdentifierError,
  normalizeIdentifier,
  normalizeSearchName,
  resolveIdentifier,
} from "../spike/identifiers.ts";

const GTIN_13 = "4006381333931";
const GTIN_8 = "96385074";
const ISBN_13 = "9780306406157";

function makeGtin(body: string): string {
  return body + gtinCheckDigit(body);
}

async function expectIdentifierCode(
  fn: () => unknown | Promise<unknown>,
  code: string,
) {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof IdentifierError)) throw error;
    assertEquals(error.code, code);
    return;
  }
  throw new Error(`expected IdentifierError ${code}`);
}

Deno.test({
  name: "spike: identifier resolution is exact and never infers from a GS1 prefix",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_identifiers");
    try {
      await t.step("normalization validates check digits and preserves strings", async () => {
        assertEquals(
          normalizeIdentifier("GTIN_13", "400 6381-333931"),
          { scheme: "GTIN_13", normalizedValue: GTIN_13 },
        );
        assertEquals(
          normalizeIdentifier("GTIN_8", "00000000").normalizedValue,
          "00000000",
        );
        assertEquals(
          normalizeIdentifier("ISBN_13", ISBN_13).normalizedValue,
          ISBN_13,
        );
        const fourteen = makeGtin("0001234560001");
        assertEquals(
          normalizeIdentifier("GTIN_14", fourteen).normalizedValue,
          fourteen,
        );

        await expectIdentifierCode(
          () => normalizeIdentifier("GTIN_13", "4006381333932"),
          "INVALID_GTIN",
        );
        await expectIdentifierCode(
          () => normalizeIdentifier("GTIN_13", "400638133393"),
          "INVALID_GTIN",
        );
        await expectIdentifierCode(
          () => normalizeIdentifier("GTIN_13", "400638133393x"),
          "INVALID_GTIN",
        );
        await expectIdentifierCode(
          () => normalizeIdentifier("ISBN_13", "9780306406158"),
          "INVALID_EAN",
        );
        await expectIdentifierCode(
          () => normalizeIdentifier("UPC_A", "012345678905"),
          "UNKNOWN_SCHEME",
        );
      });

      await t.step("a verified identifier resolves exactly once", async () => {
        const productId = await seedEntity(h, "product", {
          identifiers: [{
            scheme: "GTIN_13",
            value: GTIN_13,
            normalizedValue: GTIN_13,
            status: "VERIFIED",
          }],
        });
        assertEquals(
          await resolveIdentifier(h.db, { scheme: "GTIN_13", value: GTIN_13 }),
          { outcome: "MATCH", productId },
        );
        assertEquals(
          await resolveIdentifier(h.db, {
            scheme: "GTIN_13",
            value: "400 6381 333931",
          }),
          { outcome: "MATCH", productId },
        );
      });

      await t.step("statuses are reported, not hidden", async () => {
        const cases: Array<[string, string]> = [
          ["UNVERIFIED", "UNVERIFIED"],
          ["DISPUTED", "DISPUTED"],
          ["RETIRED", "RETIRED"],
        ];
        for (const [index, [status, outcome]] of cases.entries()) {
          const value = makeGtin(`4000000900${String(index).padStart(2, "0")}`);
          const resolved = await resolveIdentifier(h.db, {
            scheme: "GTIN_13",
            value,
          });
          assertEquals(resolved.outcome, "NOT_FOUND");
          const productId = await seedEntity(h, "product", {
            identifiers: [{
              scheme: "GTIN_13",
              value,
              normalizedValue: value,
              status,
            }],
          });
          const after = await resolveIdentifier(h.db, {
            scheme: "GTIN_13",
            value,
          });
          assertEquals(after.outcome, outcome);
          assertEquals(after.productId, productId);
        }
      });

      await t.step("duplicate identifiers are ambiguous, not guessed", async () => {
        const value = makeGtin("400000000001");
        const first = await seedEntity(h, "product", {
          identifiers: [{
            scheme: "GTIN_13",
            value,
            normalizedValue: value,
            status: "VERIFIED",
          }],
        });
        const second = await seedEntity(h, "product", {
          identifiers: [{
            scheme: "GTIN_13",
            value,
            normalizedValue: value,
            status: "VERIFIED",
          }],
        });
        const resolved = await resolveIdentifier(h.db, {
          scheme: "GTIN_13",
          value,
        });
        assertEquals(resolved.outcome, "AMBIGUOUS");
        assertEquals(new Set(resolved.candidates!).size, 2);
        assertEquals(resolved.candidates!.includes(first), true);
        assertEquals(resolved.candidates!.includes(second), true);
        assertEquals("productId" in resolved, false);
      });

      await t.step("jurisdiction narrows an otherwise ambiguous value", async () => {
        const value = makeGtin("400000000002");
        const iran = await seedEntity(h, "product", {
          identifiers: [{
            scheme: "GTIN_13",
            value,
            normalizedValue: value,
            jurisdiction: "IR",
            status: "VERIFIED",
          }],
        });
        await seedEntity(h, "product", {
          identifiers: [{
            scheme: "GTIN_13",
            value,
            normalizedValue: value,
            jurisdiction: "DE",
            status: "VERIFIED",
          }],
        });
        assertEquals(
          (await resolveIdentifier(h.db, { scheme: "GTIN_13", value })).outcome,
          "AMBIGUOUS",
        );
        assertEquals(
          await resolveIdentifier(h.db, {
            scheme: "GTIN_13",
            value,
            jurisdiction: "IR",
          }),
          { outcome: "MATCH", productId: iran },
        );
        assertEquals(
          (await resolveIdentifier(h.db, {
            scheme: "GTIN_13",
            value,
            jurisdiction: "FR",
          })).outcome,
          "NOT_FOUND",
        );
      });

      await t.step("scheme and leading zeroes are part of identity", async () => {
        const productId = await seedEntity(h, "product", {
          identifiers: [{
            scheme: "GTIN_8",
            value: "00000000",
            normalizedValue: "00000000",
            status: "VERIFIED",
          }],
        });
        assertEquals(
          await resolveIdentifier(h.db, { scheme: "GTIN_8", value: "0 000 0000" }),
          { outcome: "MATCH", productId },
        );
        assertEquals(
          (await resolveIdentifier(h.db, {
            scheme: "GTIN_13",
            value: "0000000000000",
          })).outcome,
          "NOT_FOUND",
        );
        assertEquals(
          (await resolveIdentifier(h.db, {
            scheme: "ISBN_13",
            value: "0000000000000",
          })).outcome,
          "NOT_FOUND",
        );
      });

      await t.step("a product may hold several identifiers", async () => {
        const productId = await seedEntity(h, "product", {
          identifiers: [
            {
              scheme: "GTIN_13",
              value: GTIN_13,
              normalizedValue: GTIN_13,
              status: "VERIFIED",
            },
            {
              scheme: "GTIN_8",
              value: GTIN_8,
              normalizedValue: GTIN_8,
              status: "VERIFIED",
            },
          ],
        });
        assertEquals(
          await resolveIdentifier(h.db, { scheme: "GTIN_8", value: GTIN_8 }),
          { outcome: "MATCH", productId },
        );
      });

      await t.step("an invalid identifier is rejected, not resolved", async () => {
        await expectIdentifierCode(
          () => resolveIdentifier(h.db, { scheme: "GTIN_13", value: "4006381333932" }),
          "INVALID_GTIN",
        );
      });

      await t.step("GS1 prefix is metadata, never an inference", async () => {
        await seedEntity(h, "product", {
          identifiers: [{
            scheme: "GTIN_13",
            value: GTIN_13,
            normalizedValue: GTIN_13,
            status: "VERIFIED",
          }],
        });
        const otherSamePrefix = makeGtin("400638133399");
        assertEquals(
          (await resolveIdentifier(h.db, {
            scheme: "GTIN_13",
            value: otherSamePrefix,
          })).outcome,
          "NOT_FOUND",
        );
        const metadata = gs1PrefixMetadata(GTIN_13);
        assertEquals(metadata, { prefix: "400", inference: "FORBIDDEN" });
        assertEquals("country" in metadata, false);
        assertEquals("organizationId" in metadata, false);
      });

      await t.step("name search normalization is stable across widths", () => {
        assertEquals(normalizeSearchName("  Acme   Soap  "), "acme soap");
        assertEquals(normalizeSearchName("ＡＣＭＥ　ＳＯＡＰ"), "acme soap");
        assertEquals(normalizeSearchName("ACME\tSOAP"), "acme soap");
      });
    } finally {
      await h.close();
    }
  },
});
