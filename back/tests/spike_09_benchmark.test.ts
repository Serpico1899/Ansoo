// Spike task 12: representative data, index usage, latency, and BSON size.
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness } from "../spike/harness.ts";
import {
  explainStats,
  largeRelationshipSize,
  measureLatency,
  representativeRelationshipSize,
  seedBenchmark,
} from "../spike/benchmark.ts";
import { resolveIdentifier } from "../spike/identifiers.ts";

Deno.test({
  name: "spike: representative queries use indexes and documents stay small",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_benchmark");
    try {
      const data = await seedBenchmark(h.db, {
        products: 2_000,
        brands: 200,
        categories: 100,
        organizations: 300,
        relationships: 5_000,
        snapshots: 5_000,
        sources: 500,
        claims: 1_000,
        corrections: 500,
        auditEvents: 3_000,
        users: 20,
      });

      await t.step("seed volumes are present", async () => {
        assertEquals(await h.db.collection("products").countDocuments(), 2_000);
        assertEquals(
          await h.db.collection("relationships").countDocuments(),
          5_000,
        );
        assertEquals(
          await h.db.collection("source_snapshots").countDocuments(),
          5_000,
        );
      });

      await t.step("identifier resolution uses the identifier index", async () => {
        const stats = await explainStats(
          h.db.collection("products").find({
            identifiers: {
              $elemMatch: {
                scheme: "GTIN_13",
                normalizedValue: data.sampleGtin,
              },
            },
          }),
        );
        assertEquals(stats.collectionScan, false);
        assertEquals(stats.indexName, "products_identifier");
        assert(stats.totalDocsExamined <= 2, JSON.stringify(stats));

        const resolved = await resolveIdentifier(h.db, {
          scheme: "GTIN_13",
          value: data.sampleGtin,
        });
        assertEquals(resolved.outcome, "MATCH");
        assertEquals(resolved.productId, data.productIds[0].toString());
      });

      await t.step("brand product listing uses its compound index", async () => {
        const brandId = data.brandIds[0];
        const stats = await explainStats(
          h.db.collection("products").find({
            "brand._id": brandId,
            recordLifecycle: "ACTIVE",
          }).sort({ normalizedName: 1 }),
        );
        assertEquals(stats.collectionScan, false);
        assertEquals(stats.indexName, "products_brand_lifecycle_name");
        assert(stats.totalDocsExamined <= 20, JSON.stringify(stats));
      });

      await t.step("relationship endpoint and queue queries use indexes", async () => {
        const subjectStats = await explainStats(
          h.db.collection("relationships").find({
            "subject.type": "brand",
            "subject.id": data.brandIds[1].toString(),
            predicate: "OWNS",
            recordLifecycle: "ACTIVE",
          }),
        );
        assertEquals(subjectStats.collectionScan, false);
        assertEquals(subjectStats.indexName, "rel_subject_predicate");

        const queueStats = await explainStats(
          h.db.collection("relationships").find({
            "review.status": "QUEUED",
          }).sort({ updatedAt: -1 }),
        );
        assertEquals(queueStats.collectionScan, false);
        assertEquals(queueStats.indexName, "rel_review_queue");
      });

      await t.step("claim, snapshot, correction, and audit queries use indexes", async () => {
        const claimStats = await explainStats(
          h.db.collection("claims").find({
            "about.type": "product",
            "about.id": data.productIds[3].toString(),
            recordLifecycle: "ACTIVE",
          }),
        );
        assertEquals(claimStats.collectionScan, false);
        assertEquals(claimStats.indexName, "claims_about_type");

        const snapshotStats = await explainStats(
          h.db.collection("source_snapshots").find({
            "source._id": data.sourceIds[1],
          }).sort({ retrievedAt: -1 }),
        );
        assertEquals(snapshotStats.collectionScan, false);
        assertEquals(snapshotStats.indexName, "snapshots_source_retrieved");

        const correctionStats = await explainStats(
          h.db.collection("corrections").find({
            status: "SUBMITTED",
          }).sort({ submittedAt: -1 }),
        );
        assertEquals(correctionStats.collectionScan, false);
        assertEquals(correctionStats.indexName, "corrections_status_date");

        const auditStats = await explainStats(
          h.db.collection("audit_events").find({
            "target.type": "product",
            "target.id": data.productIds[5].toString(),
          }).sort({ occurredAt: -1 }),
        );
        assertEquals(auditStats.collectionScan, false);
        assertEquals(auditStats.indexName, "audit_target_date");

        const categoryStats = await explainStats(
          h.db.collection("categories").find({
            parentCategoryId: data.categoryIds[20].toString(),
          }).sort({ sortOrder: 1 }),
        );
        assertEquals(categoryStats.collectionScan, false);
        assertEquals(categoryStats.indexName, "categories_parent_sort");
      });

      await t.step("identifier latency stays acceptable", async () => {
        const latency = await measureLatency(
          () =>
            resolveIdentifier(h.db, {
              scheme: "GTIN_13",
              value: data.sampleGtin,
            }),
          30,
        );
        assertEquals(latency.runs, 30);
        assert(latency.p50 > 0);
        assert(latency.p95 < 200, `p95 ${latency.p95.toFixed(1)}ms`);
      });

      await t.step("embedded relationship documents stay far below BSON 16 MiB", () => {
        const representative = representativeRelationshipSize();
        assert(representative < 256 * 1024, `${representative} bytes`);
        const at1000 = largeRelationshipSize(1_000);
        const at5000 = largeRelationshipSize(5_000);
        const at15000 = largeRelationshipSize(15_000);
        assert(at1000 < at5000 && at5000 < at15000);
        console.log("BSON sizes", {
          representative,
          at1000,
          at5000,
          at15000,
          limit: 16 * 1024 * 1024,
        });
        assertEquals(new ObjectId(data.productIds[0]).toString().length, 24);
      });
    } finally {
      await h.close();
    }
  },
});
