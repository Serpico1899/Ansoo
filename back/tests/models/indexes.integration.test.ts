// Plan 03 - named-query index verification with explain("executionStats").
import { assert, assertEquals } from "@std/assert";
import { BSON, ObjectId } from "lesan";
import { createIndexes, INDEX_DEFINITIONS, INDEX_QUERIES } from "../../models/indexes.ts";
import { MODEL_NAMES } from "../../models/mod.ts";
import { createHarness, MONGO_ENABLED } from "./harness.ts";

function sampleDocs() {
  const brandId = new ObjectId();
  const productId = new ObjectId();
  const orgId = new ObjectId();
  const sourceId = new ObjectId();
  const userId = new ObjectId();
  const now = new Date("2026-04-01T00:00:00Z");
  return {
    ids: { brandId, productId, orgId, sourceId, userId },
    docs: {
      products: [{
        _id: productId,
        name: "Sample Product",
        normalizedName: "sample product",
        matchKey: "sampleproduct",
        identifiers: [{
          scheme: "GTIN",
          normalizedValue: "0006381333931",
          matchValue: "0006381333931",
          jurisdiction: "IR",
        }],
        brand: { _id: brandId, name: "Sample Brand" },
        categoryCode: "sample.category",
        lifecycle: "ACTIVE",
        updatedAt: now,
      }],
      brands: [{
        _id: brandId,
        name: "Sample Brand",
        matchKey: "samplebrand",
        aliases: [{ value: "Sample", normalizedValue: "sample", matchKey: "sample" }],
        lifecycle: "ACTIVE",
        updatedAt: now,
      }],
      organizations: [{
        _id: orgId,
        name: "Sample Org",
        matchKey: "sampleorg",
        identifiers: [{
          scheme: "NATIONAL_ID",
          normalizedValue: "123",
        }],
        kind: "LEGAL_ENTITY",
        lifecycle: "ACTIVE",
        updatedAt: now,
      }],
      relationships: [{
        subject: { type: "ORGANIZATION", id: orgId },
        predicate: "OWNS",
        object: { type: "BRAND", id: brandId },
        recordLifecycle: "ACTIVE",
        review: { status: "QUEUED", assignedTo: userId },
        publication: { status: "DRAFT" },
        context: { marketCountryCode: "IR" },
        evidence: [{
          sourceSnapshotId: new ObjectId(),
          stance: "SUPPORTS",
          excerpt: "evidence excerpt",
          rationale: "because",
        }],
        organizationResponses: [],
        researchNotes: [],
        recordedAt: now,
        updatedAt: now,
      }],
      claims: [{
        about: { type: "PRODUCT", id: productId },
        claimType: "MARKET_PRESENCE",
        recordLifecycle: "ACTIVE",
        review: { status: "QUEUED", assignedTo: userId },
        publication: { status: "DRAFT" },
        context: { marketCountryCode: "IR" },
        structuredValue: {
          claimType: "MARKET_PRESENCE",
          marketCountryCode: "IR",
          observationBasis: "OFFICIAL_LIST",
        },
        statement: "sold in Iran",
        evidence: [],
        organizationResponses: [],
        recordedAt: now,
        updatedAt: now,
      }],
      sources: [{
        _id: sourceId,
        title: "Registry",
        canonicalUrl: "https://example.test/registry",
        sourceType: "OFFICIAL_REGISTRY",
        lifecycle: "ACTIVE",
        updatedAt: now,
      }],
      source_snapshots: [{
        source: { _id: sourceId, title: "Registry" },
        retrievedAt: now,
        contentHash: "a".repeat(64),
        lifecycle: "AVAILABLE",
      }],
      corrections: [{
        target: { type: "PRODUCT", id: productId },
        status: "PENDING",
        submittedBy: userId,
        submittedAt: now,
        application: { idempotencyKey: "apply-1" },
      }],
      audit_events: [{
        target: { type: "PRODUCT", id: productId },
        actor: { type: "USER", id: userId },
        action: "ENTITY_CREATED",
        correlationId: "corr-1",
        occurredAt: now,
      }],
      assets: [],
      users: [],
    },
    now,
  };
}

function planText(explain: Record<string, unknown>): string {
  return JSON.stringify(explain.queryPlanner);
}

async function listIndexes(
  db: Awaited<ReturnType<typeof createHarness>>["db"],
  collection: string,
): Promise<Array<{ name?: string; unique?: boolean; sparse?: boolean }>> {
  try {
    return await db.collection(collection).indexes();
  } catch (error) {
    if ((error as { code?: number }).code === 26) return [];
    throw error;
  }
}

Deno.test({
  name: "indexes: every declared index supports its named query with IXSCAN",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan03_indexes");
    try {
      const { docs } = sampleDocs();
      for (const [collection, collectionDocs] of Object.entries(docs)) {
        if (collectionDocs.length === 0) continue;
        await h.db.collection(collection).insertMany(collectionDocs);
      }
      await createIndexes(h.db);

      await t.step("declared indexes exist", async () => {
        for (const [collection, definitions] of Object.entries(INDEX_DEFINITIONS)) {
          const indexes = await listIndexes(h.db, collection);
          const names = new Set(indexes.map((index) => index.name));
          for (const definition of definitions) {
            assert(names.has(definition.name), `${collection} missing ${definition.name}`);
          }
        }
      });

      await t.step("only the allowed unique indexes exist", async () => {
        const uniqueIndexes: string[] = [];
        for (const collection of MODEL_NAMES) {
          const indexes = await listIndexes(h.db, collection);
          for (const index of indexes) {
            if (index.name === "_id_") continue;
            if (index.unique) uniqueIndexes.push(`${collection}.${index.name}`);
          }
        }
        assertEquals(uniqueIndexes.sort(), [
          "corrections.corrections_application_idempotency",
        ]);
        const index = (await listIndexes(h.db, "corrections")).find((candidate) =>
          candidate.name === "corrections_application_idempotency"
        );
        assert(index);
        assertEquals(index.unique, true);
        assertEquals(index.sparse, true);
      });

      await t.step("each named query returns an IXSCAN plan", async () => {
        const evidence: Array<{ index: string; query: string; used: string }> = [];
        for (const query of INDEX_QUERIES) {
          let cursor = h.db.collection(query.collection).find(query.filter);
          if (query.sort) cursor = cursor.sort(query.sort);
          cursor = cursor.hint(query.indexName);
          const explain = await cursor.explain("executionStats") as Record<string, unknown>;
          const plan = planText(explain);
          assert(
            plan.includes("IXSCAN"),
            `${query.indexName} did not use IXSCAN: ${plan}`,
          );
          assert(
            plan.includes(query.indexName),
            `${query.indexName} not named in plan: ${plan}`,
          );
          assert(!plan.includes("COLLSCAN"), `${query.indexName} performed COLLSCAN`);
          evidence.push({
            index: query.indexName,
            query: query.purpose,
            used: query.indexName,
          });
        }
        console.log(`PLAN03_INDEX_EVIDENCE ${JSON.stringify(evidence)}`);
      });

      await t.step("representative Relationship/Claim BSON stays far below 1 MiB", () => {
        const { docs } = sampleDocs();
        const sizes = {
          relationship: BSON.calculateObjectSize(docs.relationships[0]),
          claim: BSON.calculateObjectSize(docs.claims[0]),
        };
        assert(sizes.relationship > 0);
        assert(sizes.claim > 0);
        assert(sizes.relationship < 1024 * 1024);
        assert(sizes.claim < 1024 * 1024);
        console.log(`PLAN03_BSON_SIZES ${JSON.stringify(sizes)}`);
      });
    } finally {
      await h.close();
    }
  },
});
