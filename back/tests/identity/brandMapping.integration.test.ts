// Plan 04 - brand mapping workflow. Candidate never leaks as verified (5.2).
import { assertEquals, assertRejects } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";
import { BrandMappingError, setBrandMapping } from "../../utils/identity/brandMapping.ts";
import { validateAuditEvent } from "../../models/auditEvent.ts";

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function seedUser(h: Harness, roles: string[]) {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("users").insertOne({
    _id,
    authProvider: "LOCAL",
    authSubject: `subject-${_id}`,
    displayName: "Actor",
    roles,
    trustLevel: "REGULAR",
    accountStatus: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  return _id;
}

async function seedBrand(h: Harness, name: string) {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("brands").insertOne({
    _id,
    name,
    normalizedName: name.toLowerCase(),
    matchKey: name.toLowerCase(),
    aliases: [],
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  return _id;
}

async function seedProduct(h: Harness) {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("products").insertOne({
    _id,
    name: "Product",
    normalizedName: "product",
    matchKey: "product",
    identifiers: [],
    brandMapping: { status: "UNREVIEWED" },
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  return _id;
}

Deno.test({
  name: "brand mapping: only VERIFIED populates Product.brand, history is audited",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan04_brand_mapping");
    try {
      const researcher = await seedUser(h, ["RESEARCHER"]);
      const contributor = await seedUser(h, ["CONTRIBUTOR"]);
      const brandA = await seedBrand(h, "Brand A");
      const brandB = await seedBrand(h, "Brand B");
      const product = await seedProduct(h);
      const actor = { type: "USER" as const, id: researcher };

      await t.step("a candidate does not populate the brand relation", async () => {
        const result = await setBrandMapping({
          db: h.db,
          models: h.models,
          productId: product,
          status: "CANDIDATE",
          candidateBrandId: brandA,
          expectedVersion: 1,
          reason: "Looks like Brand A",
          actor,
        });
        assertEquals(result.version, 2);
        const raw = await h.db.collection("products").findOne({ _id: product });
        assertEquals(raw?.brandMapping.status, "CANDIDATE");
        assertEquals(raw?.brandMapping.candidateBrandId.toString(), brandA.toString());
        assertEquals(raw?.brand, undefined);
      });

      await t.step("VERIFIED sets Product.brand through the relation API", async () => {
        await setBrandMapping({
          db: h.db,
          models: h.models,
          productId: product,
          status: "VERIFIED",
          candidateBrandId: brandA,
          expectedVersion: 2,
          reason: "Confirmed on package",
          actor,
        });
        const raw = await h.db.collection("products").findOne({ _id: product });
        assertEquals(raw?.brandMapping.status, "VERIFIED");
        assertEquals(raw?.brand._id.toString(), brandA.toString());
        assertEquals(raw?.brand.name, "Brand A");
      });

      await t.step("a later dispute removes the verified relation", async () => {
        await setBrandMapping({
          db: h.db,
          models: h.models,
          productId: product,
          status: "DISPUTED",
          candidateBrandId: brandA,
          expectedVersion: 3,
          reason: "Conflicting package evidence",
          actor,
        });
        const raw = await h.db.collection("products").findOne({ _id: product });
        assertEquals(raw?.brandMapping.status, "DISPUTED");
        assertEquals(raw?.brand, {});
        const oldBrand = await h.db.collection("brands").findOne({ _id: brandA });
        assertEquals((oldBrand?.productsPreview ?? []).length, 0);
      });

      await t.step("a different verified brand replaces the relation", async () => {
        await setBrandMapping({
          db: h.db,
          models: h.models,
          productId: product,
          status: "VERIFIED",
          candidateBrandId: brandB,
          expectedVersion: 4,
          reason: "Corrected mapping",
          actor,
        });
        const raw = await h.db.collection("products").findOne({ _id: product });
        assertEquals(raw?.brand._id.toString(), brandB.toString());
        assertEquals(raw?.brand.name, "Brand B");
        const oldBrand = await h.db.collection("brands").findOne({ _id: brandA });
        assertEquals((oldBrand?.productsPreview ?? []).length, 0);
        const newBrand = await h.db.collection("brands").findOne({ _id: brandB });
        assertEquals(newBrand?.productsPreview.length, 1);
        assertEquals(newBrand?.productsPreview[0]._id.toString(), product.toString());
      });

      await t.step("every review writes a valid AuditEvent", async () => {
        const audits = await h.db.collection("audit_events")
          .find({ action: "BRAND_MAPPING_REVIEWED" }).toArray();
        assertEquals(audits.length, 4);
        for (const audit of audits) validateAuditEvent(audit);
      });

      await t.step("a contributor may not review a mapping", async () => {
        const error = await assertRejects(
          () =>
            setBrandMapping({
              db: h.db,
              models: h.models,
              productId: product,
              status: "UNREVIEWED",
              expectedVersion: 5,
              reason: "reset",
              actor: { type: "USER", id: contributor },
            }),
          BrandMappingError,
        ) as BrandMappingError;
        assertEquals(error.code, "FORBIDDEN");
      });

      await t.step("stale version is a CAS conflict", async () => {
        const error = await assertRejects(
          () =>
            setBrandMapping({
              db: h.db,
              models: h.models,
              productId: product,
              status: "REJECTED",
              candidateBrandId: brandB,
              expectedVersion: 2,
              reason: "stale",
              actor,
            }),
          BrandMappingError,
        ) as BrandMappingError;
        assertEquals(error.code, "VERSION_CONFLICT");
      });

      await t.step("VERIFIED without a candidate and unknown brands fail closed", async () => {
        const missing = await assertRejects(
          () =>
            setBrandMapping({
              db: h.db,
              models: h.models,
              productId: product,
              status: "VERIFIED",
              expectedVersion: 5,
              reason: "missing",
              actor,
            }),
          BrandMappingError,
        ) as BrandMappingError;
        assertEquals(missing.code, "MISSING_CANDIDATE");

        const unknown = await assertRejects(
          () =>
            setBrandMapping({
              db: h.db,
              models: h.models,
              productId: product,
              status: "VERIFIED",
              candidateBrandId: new ObjectId(),
              expectedVersion: 5,
              reason: "missing brand",
              actor,
            }),
          BrandMappingError,
        ) as BrandMappingError;
        assertEquals(unknown.code, "BRAND_NOT_FOUND");
      });
    } finally {
      await h.close();
    }
  },
});
