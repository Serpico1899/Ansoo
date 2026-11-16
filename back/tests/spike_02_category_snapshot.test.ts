// Spike tasks 4-5: Category tree and SourceSnapshot -> Source.
import { assertEquals, assertRejects } from "@std/assert";
import { ObjectId } from "lesan";
import { explainStats } from "../spike/benchmark.ts";
import { moveCategory } from "../spike/category.ts";
import { createHarness, seedEntity, seedUser } from "../spike/harness.ts";

Deno.test({
  name: "spike: category tree and SourceSnapshot->Source behavior",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_snapshot");
    try {
      const userId = await seedUser(h);

      const schema = h.core.schemas.getSchema("categories");
      assertEquals(Object.keys(schema.relations).length, 0);
      assertEquals("categories" in schema.relations, false);

      const makeCategory = async (
        name: string,
        parent?: string,
        ancestorIds: string[] = [],
      ) => {
        const id = ObjectId.createFromHexString(
          crypto.randomUUID().replace(/-/g, "").slice(0, 24),
        );
        const now = new Date();
        await h.db.collection("categories").insertOne({
          _id: id,
          code: `CAT-${name}`,
          name,
          normalizedName: name.toLowerCase(),
          parentCategoryId: parent ?? null,
          ancestorIds,
          depth: ancestorIds.length,
          sortOrder: 0,
          taxonomyVersion: 1,
          recordLifecycle: "ACTIVE",
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        return id.toString();
      };

      const rootA = await makeCategory("Root A");
      const rootB = await makeCategory("Root B");
      const child = await makeCategory("Child", rootA, [rootA]);
      const grandchild = await makeCategory("Grandchild", child, [rootA, child]);

      await t.step("subtree move updates ancestors and depth", async () => {
        const result = await moveCategory(h.db, child, rootB);
        assertEquals(result.moved.length, 2);
        const movedChild = await h.db.collection("categories").findOne({
          _id: new ObjectId(child),
        })!;
        const movedGrandchild = await h.db.collection("categories").findOne({
          _id: new ObjectId(grandchild),
        })!;
        assertEquals(movedChild!.ancestorIds, [rootB]);
        assertEquals(movedChild!.depth, 1);
        assertEquals(movedGrandchild!.ancestorIds, [rootB, child]);
        assertEquals(movedGrandchild!.depth, 2);
      });

      await t.step("cycle is rejected", async () => {
        await assertRejects(
          async () => await moveCategory(h.db, rootB, grandchild),
          Error,
          "descendant",
        );
        await assertRejects(
          async () => await moveCategory(h.db, child, child),
          Error,
          "own parent",
        );
      });

      await t.step("required snapshot source relation", async () => {
        await assertRejects(
          async () => {
            await h.models.sourceSnapshots.insertOne({
              doc: {
                titleAtCapture: "No source",
                canonicalUrlAtCapture: "https://example.com/no-source",
                retrievedAt: new Date(),
                contentHash: "x",
                hashAlgorithm: "SHA-256",
                mimeType: "text/html",
                byteSize: 1,
                captureMethod: "URL_FETCH",
                acquisitionTier: "PRIMARY",
                recordLifecycle: "ACTIVE",
                schemaVersion: 1,
                version: 1,
                createdAt: new Date(),
              },
            });
          },
          Error,
          "can not find this relatation",
        );
      });

      const sourceId = await seedEntity(h, "source");

      await t.step("reverse preview is bounded; full history is a query", async () => {
        for (let i = 0; i < 7; i++) {
          await h.models.sourceSnapshots.insertOne({
            doc: {
              titleAtCapture: `Capture ${i}`,
              canonicalUrlAtCapture: "https://example.com/register/1",
              retrievedAt: new Date(Date.UTC(2026, 0, 1 + i)),
              contentHash: `hash-${i}`,
              hashAlgorithm: "SHA-256",
              mimeType: "text/html",
              byteSize: 100 + i,
              captureMethod: "URL_FETCH",
              acquisitionTier: "PRIMARY",
              recordLifecycle: "ACTIVE",
              schemaVersion: 1,
              version: 1,
              createdAt: new Date(),
            },
            relations: {
              source: {
                _ids: new ObjectId(sourceId),
                relatedRelations: { recentSnapshotsPreview: true },
              },
            },
          });
        }

        const source = await h.db.collection("sources").findOne({
          _id: new ObjectId(sourceId),
        })!;
        assertEquals(source!.recentSnapshotsPreview.length, 5);
        assertEquals(
          source!.recentSnapshotsPreview[0].titleAtCapture,
          "Capture 6",
        );

        const cursor = h.db.collection("source_snapshots")
          .find({ "source._id": new ObjectId(sourceId) })
          .sort({ retrievedAt: -1 });
        const stats = await explainStats(
          cursor as unknown as {
            explain: (verbosity: "executionStats") => Promise<unknown>;
          },
        );
        assertEquals(stats.collectionScan, false);
        assertEquals(stats.indexName, "snapshots_source_retrieved");
        assertEquals(
          await h.db.collection("source_snapshots").countDocuments({
            "source._id": new ObjectId(sourceId),
          }),
          7,
        );
      });

      await t.step("metadata-only asset reference; no bytes in MongoDB", async () => {
        const png = new Uint8Array([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a,
          0x00,
          0x00,
          0x00,
          0x0d,
        ]);
        const { sha256Hex, storeLocalAsset } = await import("../spike/assets.ts");
        const hash = await sha256Hex(png);
        const asset = await storeLocalAsset(h.db, {
          root: "/tmp/opencode/ansoo-spike-assets",
          bytes: png,
          declaredMime: "image/png",
          fileName: "capture.png",
          uploadedBy: userId,
          visibility: "RESTRICTED",
        });
        assertEquals(asset.sha256, hash);
        assertEquals(asset.byteSize, png.byteLength);
        const stored = await h.db.collection("assets").findOne({
          _id: asset._id,
        })!;
        assertEquals("bytes" in stored!, false);
        assertEquals("content" in stored!, false);
      });

      await t.step("a changed source creates a new snapshot", async () => {
        const first = await h.models.sourceSnapshots.insertOne({
          doc: {
            titleAtCapture: "Version 1",
            canonicalUrlAtCapture: "https://example.com/register/1",
            retrievedAt: new Date(Date.UTC(2026, 1, 1)),
            contentHash: "content-v1",
            hashAlgorithm: "SHA-256",
            mimeType: "text/html",
            byteSize: 10,
            captureMethod: "URL_FETCH",
            acquisitionTier: "PRIMARY",
            recordLifecycle: "ACTIVE",
            schemaVersion: 1,
            version: 1,
            createdAt: new Date(),
          },
          relations: { source: { _ids: new ObjectId(sourceId) } },
        });
        const second = await h.models.sourceSnapshots.insertOne({
          doc: {
            titleAtCapture: "Version 2",
            canonicalUrlAtCapture: "https://example.com/register/1",
            retrievedAt: new Date(Date.UTC(2026, 1, 2)),
            contentHash: "content-v2",
            hashAlgorithm: "SHA-256",
            mimeType: "text/html",
            byteSize: 20,
            captureMethod: "URL_FETCH",
            acquisitionTier: "PRIMARY",
            recordLifecycle: "ACTIVE",
            schemaVersion: 1,
            version: 1,
            createdAt: new Date(),
          },
          relations: { source: { _ids: new ObjectId(sourceId) } },
        });
        const firstRaw = await h.db.collection("source_snapshots").findOne({
          _id: (first as { _id: ObjectId })._id,
        })!;
        assertEquals(firstRaw!.contentHash, "content-v1");
        assertEquals(
          (second as { _id: ObjectId })._id.toString() ===
            (first as { _id: ObjectId })._id.toString(),
          false,
        );
      });
    } finally {
      await h.close();
    }
  },
});
