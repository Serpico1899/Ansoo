// Spike task 6: polymorphic reference registry.
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, seedEntity } from "../spike/harness.ts";
import { ReferenceError } from "../spike/registry.ts";

async function expectCode(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
  } catch (error) {
    if (error instanceof ReferenceError) {
      assertEquals(error.code, code);
      return;
    }
    throw error;
  }
  throw new Error(`expected ReferenceError code ${code}`);
}

Deno.test({
  name: "spike: polymorphic reference registry rejects unvalidated references",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_registry");
    try {
      const productId = await seedEntity(h, "product");
      const brandId = await seedEntity(h, "brand");
      const orgId = await seedEntity(h, "organization");
      const snapshotId = await seedEntity(h, "source_snapshot", {
        contentHash: "hash",
      });
      const sourceId = await seedEntity(h, "source");

      await t.step("valid refs resolve on write and read paths", async () => {
        const resolved = await h.registry.resolve("relationship.subject", {
          type: "product",
          id: productId,
        });
        assertEquals(resolved.type, "product");
        assertEquals(resolved.doc._id.toString(), productId);

        const readAgain = await h.registry.resolve("relationship.subject", {
          type: "product",
          id: productId,
        });
        assertEquals(readAgain.doc._id.toString(), productId);
      });

      await t.step("unknown types and shapes are rejected", async () => {
        await expectCode(
          () =>
            h.registry.resolve("claim.about", {
              type: "Product",
              id: productId,
            }),
          "UNKNOWN_TYPE",
        );
        await expectCode(
          () =>
            h.registry.resolve("claim.about", {
              type: "product",
              id: productId,
              collection: "products",
            }),
          "INVALID_REFERENCE",
        );
        await expectCode(
          () =>
            h.registry.resolve("claim.about", {
              type: "product",
              id: productId,
              $where: "1 == 1",
            }),
          "INVALID_REFERENCE",
        );
        await expectCode(
          () =>
            h.registry.resolve("claim.about", {
              type: "products",
              id: productId,
            }),
          "UNKNOWN_TYPE",
        );
        await expectCode(
          () =>
            h.registry.resolve("claim.about", {
              type: "product",
              id: "not-an-object-id",
            }),
          "INVALID_ID",
        );
      });

      await t.step("type/id mismatches and missing targets are rejected", async () => {
        await expectCode(
          () =>
            h.registry.resolve("relationship.subject", {
              type: "product",
              id: brandId,
            }),
          "NOT_FOUND",
        );
        await expectCode(
          () =>
            h.registry.resolve("relationship.subject", {
              type: "product",
              id: ObjectId.createFromHexString("aaaaaaaaaaaaaaaaaaaaaaaa")
                .toString(),
            }),
          "NOT_FOUND",
        );
      });

      await t.step("per-field endpoint allowlists are enforced", async () => {
        await expectCode(
          () =>
            h.registry.resolve("evidence.sourceSnapshotId", {
              type: "product",
              id: productId,
            }),
          "TYPE_NOT_ALLOWED",
        );
        await expectCode(
          () =>
            h.registry.resolve(
              "organizationResponse.respondingOrganizationId",
              { type: "brand", id: brandId },
            ),
          "TYPE_NOT_ALLOWED",
        );
        const evidence = await h.registry.resolve(
          "evidence.sourceSnapshotId",
          { type: "source_snapshot", id: snapshotId },
        );
        assertEquals(evidence.type, "source_snapshot");
        const response = await h.registry.resolve(
          "organizationResponse.respondingOrganizationId",
          { type: "organization", id: orgId },
        );
        assertEquals(response.type, "organization");
      });

      await t.step("correction and audit target registries are explicit", async () => {
        const now = new Date();
        const relationshipId = new ObjectId();
        await h.db.collection("relationships").insertOne({
          _id: relationshipId,
          subject: { type: "organization", id: orgId },
          predicate: "OWNS",
          predicateRegistryVersion: 1,
          object: { type: "organization", id: orgId },
          context: {},
          validity: {},
          review: { status: "NOT_QUEUED" },
          assessment: { outcome: "NOT_ASSESSED" },
          publication: { status: "DRAFT" },
          canonicalKey: "k",
          recordedAt: now,
          recordLifecycle: "ACTIVE",
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        const claimId = new ObjectId();
        await h.db.collection("claims").insertOne({
          _id: claimId,
          about: { type: "organization", id: orgId },
          claimType: "OTHER_REVIEWED_TYPE",
          statement: "s",
          scope: {},
          review: { status: "NOT_QUEUED" },
          assessment: { outcome: "NOT_ASSESSED" },
          publication: { status: "DRAFT" },
          recordedAt: now,
          recordLifecycle: "ACTIVE",
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        const allowed: Array<[string, string]> = [
          ["product", productId],
          ["brand", brandId],
          ["organization", orgId],
          ["relationship", relationshipId.toString()],
          ["claim", claimId.toString()],
          ["source", sourceId],
          ["source_snapshot", snapshotId],
        ];
        for (const [type, id] of allowed) {
          const resolved = await h.registry.resolve("correction.target", {
            type,
            id,
          });
          assertEquals(resolved.type, type);
        }
        const auditTarget = await h.registry.resolve("audit.target", {
          type: "claim",
          id: claimId.toString(),
        });
        assertEquals(auditTarget.type, "claim");
      });

      await t.step("a persisted reference never carries a client collection", async () => {
        const about = await h.registry.resolve("claim.about", {
          type: "product",
          id: productId,
        });
        const now = new Date();
        await h.db.collection("claims").insertOne({
          _id: new ObjectId(),
          about: { type: about.type, id: about.id },
          claimType: "PRODUCT_ATTRIBUTE",
          statement: "Validated reference",
          scope: {},
          review: { status: "NOT_QUEUED" },
          assessment: { outcome: "NOT_ASSESSED" },
          publication: { status: "DRAFT" },
          recordedAt: now,
          recordLifecycle: "ACTIVE",
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        const raw = await h.db.collection("claims").findOne({
          "about.id": productId,
        })!;
        assert(raw);
        assertEquals(Object.keys(raw!.about).sort(), ["id", "type"]);
        assertEquals(raw!.about.type, "product");
      });
    } finally {
      await h.close();
    }
  },
});
