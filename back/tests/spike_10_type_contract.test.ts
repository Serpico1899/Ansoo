// Spike tasks 1 and 13: type generation and frontend contract shape.
import { assert, assertEquals, assertThrows } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, seedEntity, seedUser } from "../spike/harness.ts";
import { registerSpikeActions } from "../spike/lesan_actions.ts";
import { FrontendApiError, localeMessages, tokenHeaders } from "../spike/frontend_contract.ts";

Deno.test({
  name: "spike: generated types and the frontend contract are usable",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_types");
    try {
      const userId = await seedUser(h, { roles: ["RESEARCHER"] });
      registerSpikeActions(h.core, h.db);

      const brandId = await seedEntity(h, "brand", { name: "Public Brand" });
      const productId = await seedEntity(h, "product", {
        name: "Public Soap",
        normalizedName: "public soap",
        brand: {
          _id: brandId,
          name: "Public Brand",
          normalizedName: "public brand",
          recordLifecycle: "ACTIVE",
        },
      });
      const now = new Date();
      await h.db.collection("claims").insertOne({
        _id: new ObjectId(),
        about: { type: "product", id: productId },
        claimType: "PRODUCT_ORIGIN",
        statement: "Made in Iran",
        scope: { marketCountryCode: "IR" },
        review: { status: "CLOSED" },
        assessment: { outcome: "SUPPORTED" },
        publication: { status: "PUBLISHED", visibility: "PUBLIC" },
        researchNotes: [{
          body: "private research",
          authorId: userId,
          createdAt: now,
          visibility: "INTERNAL",
        }],
        recordedAt: now,
        recordLifecycle: "ACTIVE",
        schemaVersion: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      await h.db.collection("claims").insertOne({
        _id: new ObjectId(),
        about: { type: "product", id: productId },
        claimType: "PRODUCT_ORIGIN",
        statement: "Draft claim",
        review: { status: "QUEUED" },
        assessment: { outcome: "NOT_ASSESSED" },
        publication: { status: "PENDING_REVIEW", visibility: "INTERNAL" },
        recordedAt: now,
        recordLifecycle: "ACTIVE",
        schemaVersion: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      await t.step("type generation emits ReqType for custom actions", async () => {
        await h.core.generateSchemTypes();
        const generated = await Deno.readTextFile(
          new URL("../declarations/selectInp.ts", import.meta.url),
        );
        for (
          const expected of [
            "export type ReqType",
            "getPublicProfile",
            "searchPublic",
            "listForProduct",
            "DeepPartial",
            "lesanApi",
            "productsSchema",
            "brandsInp",
            "productsInp",
          ]
        ) {
          assert(generated.includes(expected), `missing ${expected}`);
        }
        assert(generated.includes("products:"), "products service missing");
        assert(generated.includes("claims:"), "claims service missing");
      });

      await t.step("generated declarations include validator fields", async () => {
        const generated = await Deno.readTextFile(
          new URL("../declarations/selectInp.ts", import.meta.url),
        );
        assert(generated.includes("gtin"), "gtin validator field missing");
        assert(generated.includes("productId"), "productId validator field missing");
        assert(generated.includes("PUBLISHED"), "claim status union missing");
      });

      await t.step("the generated action returns an allowlisted profile", async () => {
        const act = h.core.acts.getMainAct("products", "getPublicProfile")!;
        const result = await act.fn({
          service: "main",
          model: "products",
          act: "getPublicProfile",
          details: { set: { gtin: "4006381333931" }, get: { profile: true } },
        });
        assertEquals(result.outcome, "MATCH");
        assertEquals(result.profile.product._id.toString(), productId);
        assertEquals(result.profile.claims.length, 1);
        assertEquals(result.profile.claims[0].statement, "Made in Iran");
        const serialized = JSON.stringify(result);
        assertEquals(serialized.includes("private research"), false);
        assertEquals(serialized.includes("sourceSnapshotIds"), false);
        assertEquals("verdict" in result.profile, false);
      });

      await t.step("the claims action keeps assessment and publication separate", async () => {
        const act = h.core.acts.getMainAct("claims", "listForProduct")!;
        const claims = await act.fn({
          service: "main",
          model: "claims",
          act: "listForProduct",
          details: { set: { productId, publication: "PUBLISHED" }, get: {} },
        });
        assertEquals(claims.length, 1);
        assertEquals(claims[0].assessment.outcome, "SUPPORTED");
        assertEquals(claims[0].publication.status, "PUBLISHED");
        assertEquals("researchNotes" in claims[0], false);
      });

      await t.step("locale message placeholders wrap, not replace, the data", () => {
        const profile = {
          relationships: [{}, {}],
          claims: [{}],
          unknowns: ["Ownership before 2010 is unknown."],
          relationshipsState: "PUBLISHED",
          claimsState: "WITHHELD",
        };
        const translations = {
          productProfile: "Product profile",
          relationships: "{count} relationships",
          claims: "{count} claims",
          statusAssessment: "Assessment",
          statusPublication: "Publication",
          unknowns: "Unknowns",
        };
        assertEquals(
          localeMessages({ locale: "en", translations, profile })
            .relationshipSummary,
          "2 relationships",
        );
        assertEquals(
          localeMessages({ locale: "fa", translations, profile })
            .claimSummary,
          "1 claims",
        );
        assertEquals(
          localeMessages({ locale: "ar", translations, profile })
            .dimensions.claims,
          "WITHHELD",
        );
      });

      await t.step("token header and error envelope are client-safe", () => {
        assertEquals(tokenHeaders("abc"), { token: "abc" });
        assertThrows(
          () => tokenHeaders("Bearer abc"),
          FrontendApiError,
          "Bearer",
        );
        const error = new FrontendApiError("NOT_FOUND", "missing", "req-1");
        assertEquals(error.code, "NOT_FOUND");
        assertEquals(error.requestId, "req-1");
      });
    } finally {
      await h.close();
    }
  },
});
