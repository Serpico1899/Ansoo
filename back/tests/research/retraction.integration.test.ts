// Plan 05 - Retraction, read-model invalidation, and bounded revision previews (S24).
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import {
  addRevisionPreview,
  createRelationshipEdge,
  retractFinding,
} from "../../utils/research/mod.ts";
import { HARD_CAPS } from "../../utils/domain/constants.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

async function actor(h: Awaited<ReturnType<typeof createHarness>>, roles: string[]) {
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

async function org(h: Awaited<ReturnType<typeof createHarness>>, name: string) {
  const _id = new ObjectId();
  await h.db.collection("organizations").insertOne({
    _id,
    name,
    normalizedName: name.toLowerCase(),
    matchKey: name.toLowerCase(),
    kind: "LEGAL_ENTITY",
    aliases: [],
    identifiers: [],
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return _id;
}

async function rejection(promise: Promise<unknown>): Promise<{ code: string; status: number }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; status: number };
  }
  throw new Error("expected rejection");
}

Deno.test({
  name: "retraction: synchronous public read-model purge and append-only audit (S24)",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan05_retraction");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const publisher = await actor(h, ["MODERATOR"]);
      const created = await createRelationshipEdge({
        db: h.db,
        subject: { type: "ORGANIZATION", id: await org(h, "Parent") },
        predicate: "OWNS",
        object: { type: "ORGANIZATION", id: await org(h, "Child") },
        validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
        actor: author,
      });
      await h.db.collection("relationships").updateOne(
        { _id: created.id },
        {
          $set: {
            publication: {
              status: "PUBLISHED",
              reason: "seeded",
              decidedBy: publisher.id,
              decidedAt: new Date(),
              publishedAt: new Date(),
            },
          },
        },
      );
      const profileId = new ObjectId();
      const unrelatedProfileId = new ObjectId();
      await h.db.collection("product_public_profiles").insertMany([
        {
          _id: profileId,
          productId: new ObjectId(),
          relationships: [{ findingId: created.id }],
          claims: [],
        },
        {
          _id: unrelatedProfileId,
          productId: new ObjectId(),
          relationships: [{ findingId: new ObjectId() }],
          claims: [],
        },
      ]);

      await t.step("rejects unauthorized retraction without purging", async () => {
        const forbidden = await rejection(retractFinding({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          expectedVersion: created.version,
          reason: "not my call",
          actor: author,
        }));
        assertEquals(forbidden.code, "FORBIDDEN");
        assertEquals(forbidden.status, 403);
        assertEquals(
          await h.db.collection("product_public_profiles").countDocuments({ _id: profileId }),
          1,
        );
      });

      await t.step("purges affected profiles and records FINDING_RETRACTED", async () => {
        const result = await retractFinding({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          expectedVersion: created.version,
          reason: "source superseded",
          actor: publisher,
        });
        assertEquals(result.from, "PUBLISHED");
        assertEquals(result.version, created.version + 1);
        const doc = await h.db.collection("relationships").findOne({ _id: created.id });
        assert(doc);
        assertEquals(doc.publication.status, "RETRACTED");
        assertEquals(doc.publication.retractionReason, "source superseded");
        assert(doc.publication.retractedAt);
        assertEquals(
          await h.db.collection("product_public_profiles").countDocuments({ _id: profileId }),
          0,
        );
        assertEquals(
          await h.db.collection("product_public_profiles").countDocuments({
            _id: unrelatedProfileId,
          }),
          1,
        );
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            "target.id": created.id,
            action: "FINDING_RETRACTED",
          }),
          1,
        );
      });

      await t.step("a retracted finding is not returned as published", async () => {
        const doc = await h.db.collection("relationships").findOne({ _id: created.id });
        assertEquals(doc!.publication.status === "PUBLISHED", false);
        const again = await rejection(retractFinding({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          expectedVersion: resultVersion(doc),
          reason: "retry",
          actor: publisher,
        }));
        assertEquals(again.code, "INVALID_PUBLICATION_TRANSITION");
      });
    } finally {
      await h.close();
    }
  },
});

function resultVersion(doc: Record<string, unknown> | null): number {
  return Number(doc?.version ?? 0);
}

Deno.test("retraction: revision preview is capped and newest first", () => {
  const previews: Record<string, unknown>[] = [];
  for (let version = 1; version <= HARD_CAPS.recentRevisionPreview + 5; version++) {
    previews.splice(
      0,
      previews.length,
      ...addRevisionPreview(previews, {
        version,
        changedAt: new Date(2026, 0, version),
        reason: `change ${version}`,
        changedFields: ["publication.status"],
      }),
    );
  }
  const bounded = addRevisionPreview(previews, {
    version: 999,
    changedAt: new Date(),
    reason: "latest",
    changedFields: ["publication.status"],
  });
  assertEquals(bounded.length, HARD_CAPS.recentRevisionPreview);
  assertEquals(bounded[0].version, 999);
  assertEquals(bounded[1].version, HARD_CAPS.recentRevisionPreview + 5);
});
