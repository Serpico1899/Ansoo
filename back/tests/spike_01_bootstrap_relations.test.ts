// Spike tasks 1-3: bootstrap, collection naming, Product -> Brand relation.
import { assert, assertEquals, assertRejects } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, seedUser } from "../spike/harness.ts";
import { explainStats } from "../spike/benchmark.ts";

Deno.test({
  name: "spike: bootstrap, naming, and Product->Brand relation behavior",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_relations");
    try {
      const userId = await seedUser(h);

      await t.step("collection names are exact schema names", async () => {
        const brand = await h.models.brands.insertOne({
          doc: {
            name: "Acme",
            normalizedName: "acme",
            recordLifecycle: "ACTIVE",
            schemaVersion: 1,
            version: 1,
            createdAt: new Date(),
            createdBy: userId,
          },
        });
        assert(brand);
        const collections = (await h.db.listCollections().toArray())
          .map((c) => c.name).sort();
        for (
          const name of [
            "audit_events",
            "brands",
            "categories",
            "corrections",
            "products",
            "source_snapshots",
            "sources",
          ]
        ) {
          assert(
            collections.includes(name),
            `expected canonical collection ${name}, got ${collections.join(",")}`,
          );
        }
        assertEquals(collections.includes("sourceSnapshot"), false);
      });

      const brand = await h.models.brands.insertOne({
        doc: {
          name: "Acme",
          normalizedName: "acme",
          internalNotes: [{
            body: "private research note",
            authorId: userId,
            createdAt: new Date(),
            visibility: "INTERNAL",
          }],
          recordLifecycle: "ACTIVE",
          schemaVersion: 1,
          version: 1,
          createdAt: new Date(),
        },
      });
      const brandId = (brand as { _id: ObjectId })._id;

      const insertProduct = async (name: string, brand?: ObjectId) => {
        return await h.models.products.insertOne({
          doc: {
            name,
            normalizedName: name.toLowerCase(),
            identifiers: [{
              scheme: "GTIN_13",
              value: "4006381333931",
              normalizedValue: "4006381333931",
              status: "VERIFIED",
            }],
            brandMapping: { state: "CONFIRMED" },
            recordLifecycle: "ACTIVE",
            schemaVersion: 1,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          relations: brand
            ? {
              brand: {
                _ids: brand,
                relatedRelations: { productsPreview: true },
              },
            }
            : undefined,
          projection: { name: 1, brand: 1 },
        });
      };

      await t.step("optional relation and snapshot shape", async () => {
        const withoutBrand = await insertProduct("No Brand Product");
        assertEquals((withoutBrand as { brand?: unknown }).brand, undefined);

        const withBrand = await insertProduct("With Brand Product", brandId);
        const raw = await h.db.collection("products").findOne({
          _id: (withBrand as { _id: ObjectId })._id,
        })!;
        assertEquals(raw!.brand._id.toString(), brandId.toString());
        assertEquals(raw!.brand.name, "Acme");
        assertEquals(raw!.brand.normalizedName, "acme");
        assertEquals("internalNotes" in raw!.brand, false);
        assertEquals("_id" in raw!.brand, true);
      });

      await t.step("replacement updates both sides", async () => {
        const replaceFrom = await h.models.brands.insertOne({
          doc: {
            name: "Replace From",
            normalizedName: "replace from",
            recordLifecycle: "ACTIVE",
            schemaVersion: 1,
            version: 1,
            createdAt: new Date(),
          },
        });
        const other = await h.models.brands.insertOne({
          doc: {
            name: "Other",
            normalizedName: "other",
            recordLifecycle: "ACTIVE",
            schemaVersion: 1,
            version: 1,
            createdAt: new Date(),
          },
        });
        const product = await insertProduct(
          "Replace Me",
          (replaceFrom as { _id: ObjectId })._id,
        );
        await h.models.products.addRelation({
          filters: { _id: (product as { _id: ObjectId })._id },
          relations: {
            brand: {
              _ids: (other as { _id: ObjectId })._id,
              relatedRelations: { productsPreview: true },
            },
          },
          replace: true,
        });
        const raw = await h.db.collection("products").findOne({
          _id: (product as { _id: ObjectId })._id,
        })!;
        assertEquals(raw!.brand.name, "Other");
        const oldBrand = await h.db.collection("brands").findOne({
          _id: (replaceFrom as { _id: ObjectId })._id,
        })!;
        assertEquals(oldBrand!.productsPreview.length, 0);
      });

      await t.step("removal leaves an empty object; treat {} as absent", async () => {
        const product = await insertProduct("Remove Me", brandId);
        await h.models.products.removeRelation({
          filters: { _id: (product as { _id: ObjectId })._id },
          relations: {
            brand: {
              _ids: new ObjectId(brandId),
              relatedRelations: { productsPreview: true },
            },
          },
        });
        const raw = await h.db.collection("products").findOne({
          _id: (product as { _id: ObjectId })._id,
        })!;
        assertEquals(raw!.brand, {});
        assertEquals(raw!.brand?._id, undefined);
      });

      await t.step("reverse preview is bounded and not authoritative", async () => {
        const previewBrand = await h.models.brands.insertOne({
          doc: {
            name: "Preview Brand",
            normalizedName: "preview brand",
            recordLifecycle: "ACTIVE",
            schemaVersion: 1,
            version: 1,
            createdAt: new Date(),
          },
        });
        for (let i = 0; i < 7; i++) {
          await insertProduct(`Preview Product ${i}`, (previewBrand as { _id: ObjectId })._id);
        }
        const raw = await h.db.collection("brands").findOne({
          _id: (previewBrand as { _id: ObjectId })._id,
        })!;
        assertEquals(raw!.productsPreview.length, 5);
        assertEquals(
          await h.db.collection("products").countDocuments({
            "brand._id": (previewBrand as { _id: ObjectId })._id,
          }),
          7,
        );
        const authoritative = await h.models.products.find({
          filters: { "brand._id": (previewBrand as { _id: ObjectId })._id },
          options: { sort: { name: 1 }, limit: 20 },
        }).toArray();
        assertEquals(authoritative.length, 7);
      });

      await t.step("embedded brand _id uses the declared index", async () => {
        const cursor = h.db.collection("products").find({
          "brand._id": brandId,
          recordLifecycle: "ACTIVE",
        }).sort({ normalizedName: 1 }).limit(20);
        const stats = await explainStats(
          cursor as unknown as {
            explain: (verbosity: "executionStats") => Promise<unknown>;
          },
        );
        assertEquals(stats.collectionScan, false);
        assertEquals(stats.indexName, "products_brand_lifecycle_name");
      });

      await t.step("relation snapshot is stale until refreshed", async () => {
        const product = await insertProduct("Stale Snapshot", brandId);
        await h.db.collection("brands").updateOne(
          { _id: brandId },
          { $set: { name: "Acme Renamed" } },
        );
        const stale = await h.db.collection("products").findOne({
          _id: (product as { _id: ObjectId })._id,
        })!;
        assertEquals(stale!.brand.name, "Acme");
        await h.models.products.addRelation({
          filters: { _id: (product as { _id: ObjectId })._id },
          relations: {
            brand: {
              _ids: new ObjectId(brandId),
              relatedRelations: { productsPreview: true },
            },
          },
          replace: true,
        });
        const refreshed = await h.db.collection("products").findOne({
          _id: (product as { _id: ObjectId })._id,
        })!;
        assertEquals(refreshed!.brand.name, "Acme Renamed");
      });

      await t.step("deletion refuses while dependents exist", async () => {
        await assertRejects(
          async () => {
            await h.models.brands.deleteOne({ filter: { _id: brandId } });
          },
          Error,
          "clear below relations",
        );
        assert(await h.db.collection("brands").findOne({ _id: brandId }));
      });
    } finally {
      await h.close();
    }
  },
});
