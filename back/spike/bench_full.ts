// Disposable full-volume benchmark for the spike evidence pack.
import { createHarness } from "./harness.ts";
import {
  explainStats,
  largeRelationshipSize,
  measureLatency,
  representativeRelationshipSize,
  seedBenchmark,
} from "./benchmark.ts";
import { resolveIdentifier } from "./identifiers.ts";

const h = await createHarness("ansoo_spike_fullbench");
const data = await seedBenchmark(h.db);
const count = await h.db.collection("products").countDocuments();
const relCount = await h.db.collection("relationships").countDocuments();
console.log("VOLUMES", {
  products: count,
  relationships: relCount,
  snapshots: await h.db.collection("source_snapshots").countDocuments(),
  auditEvents: await h.db.collection("audit_events").countDocuments(),
});

const queries: Array<[string, () => any]> = [
  [
    "identifier",
    () =>
      h.db.collection("products").find({
        identifiers: { $elemMatch: { scheme: "GTIN_13", normalizedValue: data.sampleGtin } },
      }),
  ],
  [
    "brandProducts",
    () =>
      h.db.collection("products").find({
        "brand._id": data.brandIds[0],
        recordLifecycle: "ACTIVE",
      }).sort({ normalizedName: 1 }).limit(20),
  ],
  [
    "relationshipSubject",
    () =>
      h.db.collection("relationships").find({
        "subject.type": "brand",
        "subject.id": data.brandIds[0].toString(),
        recordLifecycle: "ACTIVE",
      }).limit(20),
  ],
  [
    "reviewQueue",
    () =>
      h.db.collection("relationships").find({ "review.status": "QUEUED" })
        .sort({ updatedAt: -1 }).limit(20),
  ],
  [
    "claimsAbout",
    () =>
      h.db.collection("claims").find({
        "about.type": "product",
        "about.id": data.productIds[0].toString(),
        recordLifecycle: "ACTIVE",
      }).limit(20),
  ],
  [
    "snapshotHistory",
    () =>
      h.db.collection("source_snapshots").find({ "source._id": data.sourceIds[1] })
        .sort({ retrievedAt: -1 }).limit(20),
  ],
  [
    "correctionQueue",
    () =>
      h.db.collection("corrections").find({ status: "SUBMITTED" })
        .sort({ submittedAt: -1 }).limit(20),
  ],
  [
    "auditTarget",
    () =>
      h.db.collection("audit_events").find({
        "target.type": "product",
        "target.id": data.productIds[0].toString(),
      }).sort({ occurredAt: -1 }).limit(20),
  ],
];

for (const [name, make] of queries) {
  const stats = await explainStats(make());
  console.log("EXPLAIN", name, stats);
}

console.log("LATENCY identifier", await measureLatency(
  () => resolveIdentifier(h.db, { scheme: "GTIN_13", value: data.sampleGtin }),
  30,
));
console.log("LATENCY brandProducts", await measureLatency(
  () => h.db.collection("products").find({
    "brand._id": data.brandIds[0],
    recordLifecycle: "ACTIVE",
  }).sort({ normalizedName: 1 }).limit(20).toArray(),
  30,
));
console.log("LATENCY reviewQueue", await measureLatency(
  () => h.db.collection("relationships").find({ "review.status": "QUEUED" })
    .sort({ updatedAt: -1 }).limit(20).toArray(),
  30,
));
console.log("BSON", {
  representative: representativeRelationshipSize(),
  at1000: largeRelationshipSize(1_000),
  at5000: largeRelationshipSize(5_000),
  at15000: largeRelationshipSize(15_000),
  limit: 16 * 1024 * 1024,
});
await h.close();
