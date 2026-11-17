// Plan 04 - resolution contract (S19). NOT_FOUND is a valid answer, never arbitrary.
import { assertEquals, assertRejects } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";
import { resolveProduct } from "../../utils/identity/resolution.ts";
import { IdentifierError } from "../../utils/identity/identifier.ts";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const GTIN_A = "0006381333935";
const GTIN_B = "00000000000000";
const GTIN_C = "00000000000024";

async function seedProduct(
  h: Harness,
  identifiers: Array<Record<string, unknown>>,
  overrides: Record<string, unknown> = {},
) {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("products").insertOne({
    _id,
    name: `Product ${_id}`,
    normalizedName: `product ${_id}`,
    matchKey: `product${_id}`,
    identifiers,
    brandMapping: { status: "UNREVIEWED" },
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return _id;
}

function gtin(
  value: string,
  status = "VERIFIED",
  extra: Record<string, unknown> = {},
) {
  return {
    _id: new ObjectId(),
    scheme: "GTIN",
    value,
    normalizedValue: value,
    matchValue: value.padStart(14, "0"),
    status,
    ...extra,
  };
}

Deno.test({
  name: "resolveProduct: exact, not found, ambiguous, jurisdiction, leading zeros",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan04_resolution");
    try {
      const exact = await seedProduct(h, [gtin(GTIN_A)]);
      const leading = await seedProduct(h, [gtin(GTIN_B)]);
      const jurisdictionIr = await seedProduct(h, [
        gtin(GTIN_C, "VERIFIED", { jurisdiction: "IR" }),
      ]);
      const jurisdictionTr = await seedProduct(h, [
        gtin(GTIN_C, "VERIFIED", { jurisdiction: "TR" }),
      ]);

      await t.step("exact verified identifier is FOUND", async () => {
        const result = await resolveProduct({ db: h.db, scheme: "GTIN", value: GTIN_A });
        assertEquals(result, { state: "FOUND", productId: exact, confidence: "EXACT" });
      });

      await t.step("unknown identifier is NOT_FOUND, not an error", async () => {
        const result = await resolveProduct({ db: h.db, scheme: "GTIN", value: "00000000000031" });
        assertEquals(result, { state: "NOT_FOUND" });
      });

      await t.step("leading-zero GTIN resolves by matchValue", async () => {
        const result = await resolveProduct({ db: h.db, scheme: "GTIN", value: "0000000000000" });
        assertEquals(result, { state: "FOUND", productId: leading, confidence: "EXACT" });
      });

      await t.step("jurisdiction narrows the exact lookup", async () => {
        const narrowed = await resolveProduct({
          db: h.db,
          scheme: "GTIN",
          value: GTIN_C,
          jurisdiction: "IR",
        });
        assertEquals(narrowed, { state: "FOUND", productId: jurisdictionIr, confidence: "EXACT" });
        const missing = await resolveProduct({
          db: h.db,
          scheme: "GTIN",
          value: GTIN_C,
          jurisdiction: "DE",
        });
        assertEquals(missing, { state: "NOT_FOUND" });

        const unscoped = await resolveProduct({ db: h.db, scheme: "GTIN", value: GTIN_C });
        assertEquals(unscoped.state, "AMBIGUOUS");
        if (unscoped.state !== "AMBIGUOUS") return;
        assertEquals(
          new Set(unscoped.candidates.map((item) => item.productId.toString())),
          new Set([
            jurisdictionIr.toString(),
            jurisdictionTr.toString(),
          ]),
        );
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "resolveProduct: ambiguity, disputes, unverified, retired, and merge redirect",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan04_resolution_states");
    try {
      const SHARED = "00000000000109";
      const first = await seedProduct(h, [gtin(SHARED)]);
      const second = await seedProduct(h, [gtin(SHARED)]);
      const disputedId = await seedProduct(h, [gtin("00000000000208", "DISPUTED")]);
      const unverifiedId = await seedProduct(h, [gtin("00000000000307", "UNVERIFIED")]);
      await seedProduct(h, [gtin("00000000000406", "RETIRED")]);
      const survivor = await seedProduct(h, [gtin("00000000000505")]);
      const merged = await seedProduct(h, [gtin("00000000000604")]);
      await h.db.collection("products").updateOne(
        { _id: merged },
        { $set: { lifecycle: "MERGED", mergedIntoId: survivor } },
      );

      await t.step("two verified products for one identifier are AMBIGUOUS", async () => {
        const result = await resolveProduct({ db: h.db, scheme: "GTIN", value: SHARED });
        assertEquals(result.state, "AMBIGUOUS");
        if (result.state !== "AMBIGUOUS") return;
        assertEquals(result.candidates.length, 2);
        assertEquals(
          new Set(result.candidates.map((c) => c.productId.toString())),
          new Set([
            first.toString(),
            second.toString(),
          ]),
        );
        assertEquals(result.candidates.every((c) => c.reason === "VERIFIED"), true);
      });

      await t.step("a disputed identifier returns DISPUTED with a note", async () => {
        const result = await resolveProduct({ db: h.db, scheme: "GTIN", value: "00000000000208" });
        assertEquals(result.state, "DISPUTED");
        if (result.state !== "DISPUTED") return;
        assertEquals(result.productId, disputedId);
        assertEquals(typeof result.disputeNote, "string");
      });

      await t.step("an unverified identifier returns UNVERIFIED", async () => {
        const result = await resolveProduct({ db: h.db, scheme: "GTIN", value: "00000000000307" });
        assertEquals(result, { state: "UNVERIFIED", productId: unverifiedId });
      });

      await t.step("retired identifiers do not resolve", async () => {
        const result = await resolveProduct({ db: h.db, scheme: "GTIN", value: "00000000000406" });
        assertEquals(result, { state: "NOT_FOUND" });
      });

      await t.step("a merged tombstone redirects to the survivor", async () => {
        const result = await resolveProduct({ db: h.db, scheme: "GTIN", value: "00000000000604" });
        assertEquals(result, { state: "FOUND", productId: survivor, confidence: "EXACT" });
      });

      await t.step("invalid check digits fail before query", async () => {
        const error = await assertRejects(
          () => resolveProduct({ db: h.db, scheme: "GTIN", value: "0006381333936" }),
          IdentifierError,
        ) as IdentifierError;
        assertEquals(error.code, "INVALID_GTIN");
      });
    } finally {
      await h.close();
    }
  },
});
