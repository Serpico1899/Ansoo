// Plan 03 - Lesan relation boundary: exactly two fixed-schema relations.
import { assert, assertEquals, assertRejects } from "@std/assert";
import { ObjectId } from "lesan";
import { isRelationAbsent } from "../../models/shared.ts";
import { createHarness, MONGO_ENABLED } from "./harness.ts";

function brandDoc(name: string, updatedAt = new Date()) {
  return {
    name,
    normalizedName: name.toLowerCase(),
    matchKey: name.toLowerCase().replace(/\s+/g, ""),
    aliases: [],
    lifecycle: "ACTIVE" as const,
    schemaVersion: 1,
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

function productDoc(name: string, updatedAt = new Date()) {
  return {
    name,
    normalizedName: name.toLowerCase(),
    matchKey: name.toLowerCase().replace(/\s+/g, ""),
    identifiers: [],
    brandMapping: { status: "UNREVIEWED" as const },
    lifecycle: "ACTIVE" as const,
    schemaVersion: 1,
    version: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

function sourceDoc(title: string) {
  return {
    title,
    sourceType: "OFFICIAL_REGISTRY" as const,
    publisherVerified: true,
    access: "PUBLIC" as const,
    attributionRequired: false,
    lifecycle: "ACTIVE" as const,
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function snapshotDoc(retrievedAt: Date) {
  return {
    retrievedAt,
    contentHash: "a".repeat(64),
    hashAlgorithm: "SHA256" as const,
    captureMethod: "CRAWLER" as const,
    acquisitionTier: "A_OFFICIAL_MACHINE_READABLE" as const,
    lifecycle: "AVAILABLE" as const,
    schemaVersion: 1,
    createdAt: retrievedAt,
  };
}

Deno.test({
  name: "relations: Product.brand snapshot and bounded Brand.productsPreview",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan03_relations");
    try {
      const brand = await h.models.brands.insertOne({
        doc: brandDoc("Acme", new Date("2026-01-01T00:00:00Z")),
      });
      assert(brand);
      const brandId = brand._id as ObjectId;

      await t.step("optional brand may be absent", async () => {
        const withoutBrand = await h.models.products.insertOne({
          doc: productDoc("No Brand"),
        });
        assert(withoutBrand);
        const raw = await h.db.collection("products").findOne({
          _id: withoutBrand._id as ObjectId,
        });
        assert(isRelationAbsent(raw?.brand));
      });

      await t.step("brand snapshot embeds identity fields and excludes aliases", async () => {
        const product = await h.models.products.insertOne({
          doc: productDoc("With Brand"),
          relations: {
            brand: {
              _ids: brandId,
              relatedRelations: { productsPreview: true },
            },
          },
        });
        assert(product);
        const raw = await h.db.collection("products").findOne({
          _id: product._id as ObjectId,
        });
        assertEquals(raw?.brand._id.toString(), brandId.toString());
        assertEquals(raw?.brand.name, "Acme");
        assertEquals("aliases" in (raw?.brand ?? {}), false);
        const reverse = await h.db.collection("brands").findOne({ _id: brandId });
        assertEquals(reverse?.productsPreview.length, 1);
      });

      await t.step("reverse preview is limited to 20 and not authoritative", async () => {
        const previewBrand = await h.models.brands.insertOne({
          doc: brandDoc("Preview Brand"),
        });
        assert(previewBrand);
        const previewBrandId = previewBrand._id as ObjectId;
        const base = new Date("2026-02-01T00:00:00Z").getTime();
        let latestId: ObjectId | undefined;
        for (let index = 0; index < 25; index++) {
          const product = await h.models.products.insertOne({
            doc: productDoc(`Preview Product ${index}`, new Date(base + index * 1000)),
            relations: {
              brand: {
                _ids: previewBrandId,
                relatedRelations: { productsPreview: true },
              },
            },
          });
          assert(product);
          latestId = product._id as ObjectId;
        }
        const raw = await h.db.collection("brands").findOne({ _id: previewBrandId });
        assertEquals(raw?.productsPreview.length, 20);
        assertEquals(raw?.productsPreview[0]._id.toString(), latestId!.toString());
        assertEquals(
          await h.db.collection("products").countDocuments({ "brand._id": previewBrandId }),
          25,
        );
      });

      await t.step("relation snapshots are stale until refreshed through the API", async () => {
        const product = await h.models.products.insertOne({
          doc: productDoc("Stale Product"),
          relations: {
            brand: {
              _ids: brandId,
              relatedRelations: { productsPreview: true },
            },
          },
        });
        assert(product);
        await h.db.collection("brands").updateOne(
          { _id: brandId },
          { $set: { name: "Acme Renamed" } },
        );
        const stale = await h.db.collection("products").findOne({
          _id: product._id as ObjectId,
        });
        assertEquals(stale?.brand.name, "Acme");

        await h.models.products.addRelation({
          filters: { _id: product._id as ObjectId },
          relations: {
            brand: {
              _ids: brandId,
              relatedRelations: { productsPreview: true },
            },
          },
          replace: true,
        });
        const refreshed = await h.db.collection("products").findOne({
          _id: product._id as ObjectId,
        });
        assertEquals(refreshed?.brand.name, "Acme Renamed");
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "relations: SourceSnapshot.source is required and reverse preview is limited to 10",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan03_snapshot_relations");
    try {
      const source = await h.models.sources.insertOne({
        doc: sourceDoc("Registry"),
      });
      assert(source);
      const sourceId = source._id as ObjectId;

      await t.step("required source relation cannot be omitted", async () => {
        await assertRejects(
          async () => {
            await h.models.sourceSnapshots.insertOne({ doc: snapshotDoc(new Date()) });
          },
          Error,
          "can not find this relatation",
        );
      });

      await t.step("reverse preview is limited to 10, newest first", async () => {
        const base = new Date("2026-03-01T00:00:00Z").getTime();
        let latestId: ObjectId | undefined;
        for (let index = 0; index < 12; index++) {
          const snapshot = await h.models.sourceSnapshots.insertOne({
            doc: snapshotDoc(new Date(base + index * 1000)),
            relations: {
              source: {
                _ids: sourceId,
                relatedRelations: { recentSnapshotsPreview: true },
              },
            },
          });
          assert(snapshot);
          latestId = snapshot._id as ObjectId;
        }
        const raw = await h.db.collection("sources").findOne({ _id: sourceId });
        assertEquals(raw?.recentSnapshotsPreview.length, 10);
        assertEquals(raw?.recentSnapshotsPreview[0]._id.toString(), latestId!.toString());
        assertEquals(
          await h.db.collection("source_snapshots").countDocuments({ "source._id": sourceId }),
          12,
        );
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "relations: removed single relation is represented as {} and treated as absent",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan03_relation_removal");
    try {
      const brand = await h.models.brands.insertOne({ doc: brandDoc("Remove Brand") });
      assert(brand);
      const brandId = brand._id as ObjectId;
      const product = await h.models.products.insertOne({
        doc: productDoc("Remove Product"),
        relations: {
          brand: { _ids: brandId, relatedRelations: { productsPreview: true } },
        },
      });
      assert(product);
      await h.models.products.removeRelation({
        filters: { _id: product._id as ObjectId },
        relations: {
          brand: { _ids: brandId, relatedRelations: { productsPreview: true } },
        },
      });
      const raw = await h.db.collection("products").findOne({
        _id: product._id as ObjectId,
      });
      assertEquals(raw?.brand, {});
      assert(isRelationAbsent(raw?.brand));
    } finally {
      await h.close();
    }
  },
});
