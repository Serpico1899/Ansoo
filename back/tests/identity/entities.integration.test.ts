// Plan 04 - S01 Create Brand, S02 Product with Brand relation, pure rename.
import { assertEquals, assertRejects } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";
import {
  createBrand,
  createOrganization,
  createProduct,
  IdentityWriteError,
  updateIdentityName,
} from "../../utils/identity/entities.ts";
import { setBrandMapping } from "../../utils/identity/brandMapping.ts";
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

Deno.test({
  name: "S01/S02 identity creation: normalization, brand relation snapshot, rename CAS",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan04_entities");
    try {
      const researcher = await seedUser(h, ["RESEARCHER"]);
      const contributor = await seedUser(h, ["CONTRIBUTOR"]);
      const actor = { type: "USER" as const, id: researcher };

      await t.step("S01 brand creation normalizes the two keys and audits", async () => {
        const created = await createBrand({
          db: h.db,
          name: "شركت پگاه ايران",
          aliases: ["پگاه"],
          actor,
        });
        const raw = await h.db.collection("brands").findOne({ _id: created.id });
        assertEquals(raw?.name, "شركت پگاه ايران");
        assertEquals(raw?.normalizedName, "شرکت پگاه ایران");
        assertEquals(raw?.matchKey, "شرکتپگاهایران");
        assertEquals(raw?.aliases[0].normalizedValue, "پگاه");
        assertEquals(raw?.lifecycle, "ACTIVE");
        assertEquals(raw?.version, 1);
        const audit = await h.db.collection("audit_events").findOne({ _id: created.auditId });
        assertEquals(audit?.action, "ENTITY_CREATED");
        validateAuditEvent(audit);
      });

      await t.step("S02 a product resolves through its brand relation snapshot", async () => {
        const brand = await createBrand({ db: h.db, name: "کاله", actor });
        const product = await createProduct({
          db: h.db,
          name: "کاله ۱۲۳",
          identifiers: [{ scheme: "GTIN", value: "0006381333935" }],
          actor,
        });
        await setBrandMapping({
          db: h.db,
          models: h.models,
          productId: product.id,
          status: "VERIFIED",
          candidateBrandId: brand.id,
          expectedVersion: 1,
          reason: "Package label",
          actor,
        });

        const stored = await h.db.collection("products").findOne({ _id: product.id });
        assertEquals(stored?.normalizedName, "کاله 123");
        assertEquals(stored?.matchKey, "کاله123");
        assertEquals(stored?.identifiers[0].value, "0006381333935");
        assertEquals(stored?.identifiers[0].matchValue, "00006381333935");
        assertEquals(stored?.brand._id.toString(), brand.id.toString());
        assertEquals(stored?.brand.name, "کاله");
        const brandRaw = await h.db.collection("brands").findOne({ _id: brand.id });
        assertEquals(brandRaw?.productsPreview[0]._id.toString(), product.id.toString());
      });

      await t.step("organization creation keeps identity kinds separate", async () => {
        const org = await createOrganization({
          db: h.db,
          name: "شركت پگاه",
          kind: "LEGAL_ENTITY",
          actor,
        });
        const raw = await h.db.collection("organizations").findOne({ _id: org.id });
        assertEquals(raw?.kind, "LEGAL_ENTITY");
        assertEquals(raw?.normalizedName, "شرکت پگاه");
        assertEquals(raw?.identifiers, []);
      });

      await t.step("rename re-normalizes and enforces CAS", async () => {
        const brand = await createBrand({ db: h.db, name: "Old Brand", actor });
        const renamed = await updateIdentityName({
          db: h.db,
          entityType: "BRAND",
          id: brand.id,
          name: "شركت پگاه ايران",
          expectedVersion: 1,
          reason: "Official name",
          actor,
        });
        assertEquals(renamed.version, 2);
        const raw = await h.db.collection("brands").findOne({ _id: brand.id });
        assertEquals(raw?.normalizedName, "شرکت پگاه ایران");
        assertEquals(raw?.matchKey, "شرکتپگاهایران");

        const stale = await assertRejects(
          () =>
            updateIdentityName({
              db: h.db,
              entityType: "BRAND",
              id: brand.id,
              name: "Stale",
              expectedVersion: 1,
              reason: "stale",
              actor,
            }),
          IdentityWriteError,
        ) as IdentityWriteError;
        assertEquals(stale.code, "VERSION_CONFLICT");
      });

      await t.step("a contributor may not create identities", async () => {
        const error = await assertRejects(
          () =>
            createBrand({
              db: h.db,
              name: "Blocked",
              actor: { type: "USER", id: contributor },
            }),
          IdentityWriteError,
        ) as IdentityWriteError;
        assertEquals(error.code, "FORBIDDEN");
      });
    } finally {
      await h.close();
    }
  },
});
