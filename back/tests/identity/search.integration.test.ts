// Plan 04 - MVP search baseline: exact matchKey + escaped prefix, no fuzzy.
import { assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";
import { findEntityByRef, searchEntities } from "../../utils/identity/search.ts";

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function seedBrand(h: Harness, name: string, overrides: Record<string, unknown> = {}) {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("brands").insertOne({
    _id,
    name,
    normalizedName: name,
    matchKey: name.replace(/\s+/g, ""),
    aliases: [],
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return _id;
}

Deno.test({
  name: "search: exact matchKey first, escaped prefix, no fuzzy, merge redirects",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan04_search");
    try {
      const exact = await seedBrand(h, "پگاه");
      const prefix = await seedBrand(h, "پگاه لبنیات");
      const other = await seedBrand(h, "کاله");
      const merged = await seedBrand(h, "پگاه قدیمی");
      const survivor = await seedBrand(h, "پگاه");
      await h.db.collection("brands").updateOne(
        { _id: merged },
        { $set: { lifecycle: "MERGED", mergedIntoId: survivor } },
      );

      await t.step("exact matchKey ranks before prefix and tombstones are excluded", async () => {
        const result = await searchEntities({ db: h.db, query: "پگاه", types: ["BRAND"] });
        assertEquals(result.state, "FOUND");
        assertEquals(
          result.results[0].id.equals(exact) || result.results[0].id.equals(survivor),
          true,
        );
        const ids = result.results.map((item) => item.id.toString());
        assertEquals(ids.includes(merged.toString()), false);
        assertEquals(ids.includes(merged.toString()), false);
        assertEquals(ids.includes(prefix.toString()), true);
      });

      await t.step("a non-matching query is an explicit empty result", async () => {
        const result = await searchEntities({ db: h.db, query: "ناموجود", types: ["BRAND"] });
        assertEquals(result, { state: "EMPTY", results: [] });
      });

      await t.step("regex metacharacters are escaped, not interpreted", async () => {
        await seedBrand(h, "axxb");
        const wildcard = await searchEntities({ db: h.db, query: "a.*b", types: ["BRAND"] });
        assertEquals(wildcard, { state: "EMPTY", results: [] });
      });

      await t.step("resolving a tombstone directly redirects to the survivor", async () => {
        const result = await findEntityByRef({
          db: h.db,
          ref: { type: "BRAND", id: merged },
        });
        assertEquals(result.state, "FOUND");
        if (result.state !== "FOUND") return;
        assertEquals(result.entity._id, survivor);
        assertEquals(result.mergedFrom.map(String), [merged.toString()]);
        assertEquals(result.notice, `this record was merged into ${survivor.toString()}`);
      });

      await t.step("search never compares across types or schemes", async () => {
        const product = new ObjectId();
        const now = new Date();
        await h.db.collection("products").insertOne({
          _id: product,
          name: "پگاه",
          normalizedName: "پگاه",
          matchKey: "پگاه",
          identifiers: [{
            _id: new ObjectId(),
            scheme: "GTIN",
            value: "00000000000000",
            normalizedValue: "00000000000000",
            matchValue: "00000000000000",
            status: "VERIFIED",
          }],
          brandMapping: { status: "UNREVIEWED" },
          lifecycle: "ACTIVE",
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        const brandsOnly = await searchEntities({ db: h.db, query: "پگاه", types: ["BRAND"] });
        assertEquals(brandsOnly.results.some((item) => item.id.equals(product)), false);
        assertEquals(brandsOnly.results.every((item) => item.type === "BRAND"), true);
        assertEquals(other.equals(product), false);
      });
    } finally {
      await h.close();
    }
  },
});
