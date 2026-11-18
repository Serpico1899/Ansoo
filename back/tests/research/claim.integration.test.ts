// Plan 05 - Claims, closed claim types, and the Claim/Relationship boundary lint.
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import { addClaim, updateClaim } from "../../utils/research/mod.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

async function actor(
  h: Awaited<ReturnType<typeof createHarness>>,
  roles: string[] = ["RESEARCHER"],
) {
  const _id = new ObjectId();
  await h.db.collection("users").insertOne({
    _id,
    accountStatus: "ACTIVE",
    roles,
    trustLevel: "REGULAR",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { type: "USER" as const, id: _id };
}

async function identity(
  h: Awaited<ReturnType<typeof createHarness>>,
  collection: "products" | "brands" | "organizations",
  name: string,
) {
  const _id = new ObjectId();
  await h.db.collection(collection).insertOne({
    _id,
    name,
    normalizedName: name.toLowerCase(),
    matchKey: name.toLowerCase(),
    ...(collection === "products"
      ? { identifiers: [], brandMapping: { status: "UNREVIEWED" } }
      : {}),
    ...(collection === "organizations"
      ? { kind: "LEGAL_ENTITY", aliases: [], identifiers: [] }
      : {}),
    ...(collection === "brands" ? { aliases: [] } : {}),
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return _id;
}

async function rejection(
  promise: Promise<unknown>,
): Promise<{ code: string; status: number; details?: Record<string, unknown> }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; status: number; details?: Record<string, unknown> };
  }
  throw new Error("expected rejection");
}

function marketPresence(country = "IR") {
  return {
    claimType: "MARKET_PRESENCE",
    marketCountryCode: country,
    channel: "RETAIL",
    observationBasis: "OFFICIAL_LIST",
  };
}

Deno.test({
  name: "claim: three closed types, registry resolution, and audit",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan05_claim");
    try {
      const owner = await actor(h);
      const productId = await identity(h, "products", "Product");
      const orgId = await identity(h, "organizations", "Organization");

      await t.step("adds MARKET_PRESENCE with default ROUTINE sensitivity", async () => {
        const result = await addClaim({
          db: h.db,
          about: { type: "PRODUCT", id: productId },
          claimType: "MARKET_PRESENCE",
          statement: "The product is sold in Iranian retail.",
          structuredValue: marketPresence(),
          actor: owner,
        });
        assertEquals(result.version, 1);
        const doc = await h.db.collection("claims").findOne({ _id: result.id });
        assert(doc);
        assertEquals(doc.claimTypeRegistryVersion, 1);
        assertEquals(doc.sensitivity, "ROUTINE");
        assertEquals(doc.recordLifecycle, "ACTIVE");
        assertEquals(doc.publication.status, "DRAFT");
        assertEquals(doc.assessment.outcome, "NOT_ASSESSED");
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": result.id, action: "CLAIM_CREATED" }),
          1,
        );
      });

      await t.step(
        "accepts PRODUCT_ORIGIN and OFFICIAL_STATEMENT only with their shapes",
        async () => {
          const origin = await addClaim({
            db: h.db,
            about: { type: "PRODUCT", id: productId },
            claimType: "PRODUCT_ORIGIN",
            statement: "The package declares origin Iran.",
            structuredValue: {
              claimType: "PRODUCT_ORIGIN",
              declaredOriginCountryCode: "IR",
              declarationSurface: "PACKAGE",
            },
            actor: owner,
          });
          const originDoc = await h.db.collection("claims").findOne({ _id: origin.id });
          assertEquals(originDoc?.sensitivity, "SENSITIVE");

          const statement = await addClaim({
            db: h.db,
            about: { type: "ORGANIZATION", id: orgId },
            claimType: "OFFICIAL_STATEMENT",
            statement: "The organization stated it owns the brand.",
            structuredValue: {
              claimType: "OFFICIAL_STATEMENT",
              speakingOrganizationId: orgId,
              statementDate: null,
              statementDatePrecision: "UNKNOWN",
              channel: "PRESS_RELEASE",
            },
            actor: owner,
          });
          const statementDoc = await h.db.collection("claims").findOne({ _id: statement.id });
          assertEquals(statementDoc?.sensitivity, "SENSITIVE");
        },
      );

      await t.step("rejects OTHER_* and unknown claim types", async () => {
        const other = await rejection(addClaim({
          db: h.db,
          about: { type: "PRODUCT", id: productId },
          claimType: "OTHER_REVIEWED_TYPE",
          statement: "Anything",
          structuredValue: { claimType: "OTHER_REVIEWED_TYPE" },
          actor: owner,
        }));
        assertEquals(other.code, "UNKNOWN_CLAIM_TYPE");

        const mismatch = await rejection(addClaim({
          db: h.db,
          about: { type: "PRODUCT", id: productId },
          claimType: "PRODUCT_ORIGIN",
          statement: "Mismatch",
          structuredValue: marketPresence(),
          actor: owner,
        }));
        assertEquals(mismatch.code, "CLAIM_TYPE_MISMATCH");
      });

      await t.step("relatedEntities are capped and resolved through the registry", async () => {
        const entities = Array.from({ length: 10 }, () => ({
          type: "ORGANIZATION",
          id: orgId,
        }));
        const deduped = await rejection(addClaim({
          db: h.db,
          about: { type: "PRODUCT", id: productId },
          claimType: "MARKET_PRESENCE",
          statement: "Duplicate related entity",
          structuredValue: marketPresence(),
          relatedEntities: entities,
          actor: owner,
        }));
        assertEquals(deduped.status, 422);

        const tooMany = await rejection(addClaim({
          db: h.db,
          about: { type: "PRODUCT", id: productId },
          claimType: "MARKET_PRESENCE",
          statement: "Too many related entities",
          structuredValue: marketPresence(),
          relatedEntities: Array.from({ length: 11 }, () => ({
            type: "BRAND",
            id: new ObjectId(),
          })),
          actor: owner,
        }));
        assertEquals(tooMany.status, 422);

        const missing = await rejection(addClaim({
          db: h.db,
          about: { type: "PRODUCT", id: productId },
          claimType: "MARKET_PRESENCE",
          statement: "Missing related entity",
          structuredValue: marketPresence(),
          relatedEntities: [{ type: "ORGANIZATION", id: new ObjectId() }],
          actor: owner,
        }));
        assertEquals(missing.status, 404);
      });

      await t.step("caps statement and public wording at 2,000 characters", async () => {
        const ok = await addClaim({
          db: h.db,
          about: { type: "PRODUCT", id: productId },
          claimType: "MARKET_PRESENCE",
          statement: "x".repeat(2_000),
          publicWording: "y".repeat(2_000),
          structuredValue: marketPresence(),
          actor: owner,
        });
        assertEquals(ok.version, 1);
        const tooLong = await rejection(addClaim({
          db: h.db,
          about: { type: "PRODUCT", id: productId },
          claimType: "MARKET_PRESENCE",
          statement: "x".repeat(2_001),
          structuredValue: marketPresence(),
          actor: owner,
        }));
        assertEquals(tooLong.status, 422);
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "claim: boundary lint returns 409 USE_RELATIONSHIP_INSTEAD",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan05_claim_lint");
    try {
      const owner = await actor(h);
      const productId = await identity(h, "products", "Product");
      const parent = await identity(h, "organizations", "Parent");
      const child = await identity(h, "organizations", "Child");

      const byType = await rejection(addClaim({
        db: h.db,
        about: { type: "ORGANIZATION", id: child },
        claimType: "OWNS",
        statement: "Parent owns Child.",
        structuredValue: {
          claimType: "OWNS",
          subjectId: parent,
          objectId: child,
        },
        actor: owner,
      }));
      assertEquals(byType.status, 409);
      assertEquals(byType.code, "USE_RELATIONSHIP_INSTEAD");
      assert(byType.details?.suggestedPayload);

      const byShape = await rejection(addClaim({
        db: h.db,
        about: { type: "PRODUCT", id: productId },
        claimType: "MARKET_PRESENCE",
        statement: "Parent owns Child.",
        structuredValue: {
          claimType: "MARKET_PRESENCE",
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: child },
        },
        actor: owner,
      }));
      assertEquals(byShape.status, 409);
      assertEquals(byShape.code, "USE_RELATIONSHIP_INSTEAD");
      assertEquals(
        await h.db.collection("claims").countDocuments({}),
        0,
      );
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "claim: pure updates are CAS-guarded and cannot change identity",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan05_claim_update");
    try {
      const owner = await actor(h);
      const productId = await identity(h, "products", "Product");
      const created = await addClaim({
        db: h.db,
        about: { type: "PRODUCT", id: productId },
        claimType: "MARKET_PRESENCE",
        statement: "The product is sold in Iranian retail.",
        structuredValue: marketPresence(),
        actor: owner,
      });

      const rewrite = await rejection(updateClaim({
        db: h.db,
        id: created.id,
        expectedVersion: 1,
        patch: { about: { type: "ORGANIZATION", id: new ObjectId() } },
        reason: "rewrite",
        actor: owner,
      }));
      assertEquals(rewrite.code, "FORBIDDEN_CLAIM_FIELD");

      const updated = await updateClaim({
        db: h.db,
        id: created.id,
        expectedVersion: 1,
        patch: {
          statement: "The product is sold in Iranian retail and online.",
          publicWording: "Sold in Iran.",
        },
        reason: "narrow wording",
        actor: owner,
      });
      assertEquals(updated.version, 2);
      const doc = await h.db.collection("claims").findOne({ _id: created.id });
      assertEquals(doc?.publicWording, "Sold in Iran.");
      assertEquals(
        await h.db.collection("audit_events")
          .countDocuments({ "target.id": created.id, action: "PUBLIC_WORDING_CHANGED" }),
        1,
      );

      const stale = await rejection(updateClaim({
        db: h.db,
        id: created.id,
        expectedVersion: 1,
        patch: { statement: "stale" },
        reason: "stale",
        actor: owner,
      }));
      assertEquals(stale.code, "VERSION_CONFLICT");
      assertEquals(stale.status, 409);
    } finally {
      await h.close();
    }
  },
});
