// Plan 06 - Evidence links pinned to snapshots, restricted citations, review.
import { assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import {
  addEvidence,
  addRelationshipEvidence,
  captureSnapshot,
  createLocalStorageProvider,
  createSource,
  removeEvidence,
  removeRelationshipEvidence,
  reviewEvidence,
  reviewRelationshipEvidence,
} from "../../utils/provenance/mod.ts";
import { addClaim, createRelationshipEdge } from "../../utils/research/mod.ts";
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

async function rejection(promise: Promise<unknown>): Promise<{ code: string; status: number }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; status: number };
  }
  throw new Error("expected rejection");
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

Deno.test({
  name: "provenance: evidence lifecycle, caps, restricted citation, and audit",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan06_evidence");
    const root = await Deno.makeTempDir({ prefix: "ansoo-plan06-evidence-" });
    const provider = createLocalStorageProvider(root);
    try {
      const researcher = await actor(h);
      const reviewer = await actor(h, ["RESEARCH_REVIEWER"]);
      const contributor = await actor(h, ["CONTRIBUTOR"]);

      const productId = new ObjectId();
      await h.db.collection("products").insertOne({
        _id: productId,
        name: "Product",
        normalizedName: "product",
        matchKey: "product",
        identifiers: [],
        brandMapping: { status: "UNREVIEWED" },
        lifecycle: "ACTIVE",
        schemaVersion: 1,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const claim = await addClaim({
        db: h.db,
        about: { type: "PRODUCT", id: productId },
        claimType: "MARKET_PRESENCE",
        statement: "The product is sold in Iran.",
        structuredValue: {
          claimType: "MARKET_PRESENCE",
          marketCountryCode: "IR",
          channel: "RETAIL",
          observationBasis: "OFFICIAL_LIST",
        },
        actor: researcher,
      });

      const publicSource = await createSource({
        db: h.db,
        title: "Public source",
        canonicalUrl: "https://news.example/item",
        sourceType: "NEWS",
        publisherName: "News",
        publisherVerified: true,
        actor: researcher,
      });
      const restrictedSource = await createSource({
        db: h.db,
        title: "Restricted source",
        canonicalUrl: "https://restricted.example/item",
        sourceType: "NEWS",
        publisherName: "Restricted",
        publisherVerified: true,
        access: "RESTRICTED",
        actor: researcher,
      });

      const snapshotOne = await captureSnapshot({
        db: h.db,
        provider,
        sourceId: publicSource.id,
        bytes: text("public evidence one"),
        retrievedAt: new Date("2026-02-01T00:00:00Z"),
        captureMethod: "CRAWLER",
        acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
        actor: researcher,
      });
      const snapshotTwo = await captureSnapshot({
        db: h.db,
        provider,
        sourceId: publicSource.id,
        bytes: text("public evidence two"),
        retrievedAt: new Date("2026-02-02T00:00:00Z"),
        captureMethod: "CRAWLER",
        acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
        actor: researcher,
      });
      const restrictedSnapshot = await captureSnapshot({
        db: h.db,
        provider,
        sourceId: restrictedSource.id,
        bytes: text("restricted evidence"),
        retrievedAt: new Date("2026-02-03T00:00:00Z"),
        captureMethod: "MANUAL",
        acquisitionTier: "E_RESEARCH_OR_COMMUNITY",
        actor: researcher,
      });

      await t.step("adds evidence through a versioned, audited update", async () => {
        const added = await addEvidence({
          db: h.db,
          claimId: claim.id,
          snapshotId: snapshotOne.snapshotId,
          stance: "SUPPORTS",
          excerpt: "Sells in Iran.",
          actor: researcher,
          expectedVersion: claim.version,
          now: new Date("2026-02-04T00:00:00Z"),
        });
        assertEquals(added.version, 2);
        const doc = await h.db.collection("claims").findOne({ _id: claim.id });
        assertEquals(doc?.version, 2);
        assertEquals(doc?.evidence.length, 1);
        assertEquals(
          doc?.evidence[0].sourceSnapshotId.toString(),
          snapshotOne.snapshotId.toString(),
        );
        assertEquals(doc?.evidence[0].addedBy.toString(), researcher.id!.toString());
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": claim.id, action: "EVIDENCE_ADDED" }),
          1,
        );
      });

      await t.step("rejects duplicates, version races, and unauthorized actors", async () => {
        assertEquals(
          (await rejection(addEvidence({
            db: h.db,
            claimId: claim.id,
            snapshotId: snapshotOne.snapshotId,
            stance: "SUPPORTS",
            actor: researcher,
            expectedVersion: 2,
          }))).code,
          "DUPLICATE_EVIDENCE",
        );
        assertEquals(
          (await rejection(addEvidence({
            db: h.db,
            claimId: claim.id,
            snapshotId: snapshotTwo.snapshotId,
            stance: "CONTRADICTS",
            actor: researcher,
            expectedVersion: 1,
          }))).code,
          "VERSION_CONFLICT",
        );
        assertEquals(
          (await rejection(addEvidence({
            db: h.db,
            claimId: claim.id,
            snapshotId: snapshotTwo.snapshotId,
            stance: "CONTRADICTS",
            actor: contributor,
            expectedVersion: 2,
          }))).code,
          "FORBIDDEN",
        );
      });

      await t.step("rejects restricted-source citations without recording a link", async () => {
        const error = await rejection(addEvidence({
          db: h.db,
          claimId: claim.id,
          snapshotId: restrictedSnapshot.snapshotId,
          stance: "SUPPORTS",
          actor: researcher,
          expectedVersion: 2,
        }));
        assertEquals(error.code, "RESTRICTED_CITATION");
        assertEquals(error.status, 422);
        const doc = await h.db.collection("claims").findOne({ _id: claim.id });
        assertEquals(doc?.version, 2);
        assertEquals(doc?.evidence.length, 1);
      });

      await t.step("reviews stance and removes links with audit", async () => {
        const second = await addEvidence({
          db: h.db,
          claimId: claim.id,
          snapshotId: snapshotTwo.snapshotId,
          stance: "CONTRADICTS",
          rationale: "Different shelf report.",
          actor: researcher,
          expectedVersion: 2,
          now: new Date("2026-02-05T00:00:00Z"),
        });
        assertEquals(second.version, 3);
        const firstLink = (await h.db.collection("claims").findOne({ _id: claim.id }))
          ?.evidence.find((item: Record<string, unknown>) =>
            String(item.sourceSnapshotId) === snapshotOne.snapshotId.toString()
          );
        const reviewed = await reviewEvidence({
          db: h.db,
          claimId: claim.id,
          evidenceId: firstLink._id,
          stance: "CONTEXTUALIZES",
          actor: reviewer,
          expectedVersion: 3,
          note: "clarified scope",
          now: new Date("2026-02-06T00:00:00Z"),
        });
        assertEquals(reviewed.version, 4);
        const reviewedDoc = await h.db.collection("claims").findOne({ _id: claim.id });
        const reviewedLink = reviewedDoc?.evidence.find((item: Record<string, unknown>) =>
          String(item._id) === String(firstLink._id)
        );
        assertEquals(reviewedLink.stance, "CONTEXTUALIZES");
        assertEquals(reviewedLink.reviewedBy.toString(), reviewer.id!.toString());
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": claim.id, action: "EVIDENCE_REVIEWED" }),
          1,
        );

        await removeEvidence({
          db: h.db,
          claimId: claim.id,
          evidenceId: second.evidenceId,
          actor: researcher,
          expectedVersion: 4,
          reason: "superseded",
          now: new Date("2026-02-07T00:00:00Z"),
        });
        const finalDoc = await h.db.collection("claims").findOne({ _id: claim.id });
        assertEquals(finalDoc?.version, 5);
        assertEquals(finalDoc?.evidence.length, 1);
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": claim.id, action: "EVIDENCE_REMOVED" }),
          1,
        );
      });

      await t.step("supports Relationship evidence with the same pinned lifecycle", async () => {
        const orgIds: ObjectId[] = [];
        for (const name of ["Parent Org", "Child Org"]) {
          const id = new ObjectId();
          await h.db.collection("organizations").insertOne({
            _id: id,
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
          orgIds.push(id);
        }
        const edge = await createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: orgIds[0] },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: orgIds[1] },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          context: { ownership: { sharePercentage: 51, basis: "DIRECT" } },
          actor: researcher,
        });
        const added = await addRelationshipEvidence({
          db: h.db,
          relationshipId: edge.id,
          snapshotId: snapshotOne.snapshotId,
          stance: "SUPPORTS",
          actor: researcher,
          now: new Date("2026-02-09T00:00:00Z"),
        });
        assertEquals(added.version, 2);
        const link = (await h.db.collection("relationships").findOne({ _id: edge.id }))
          ?.evidence[0];
        const reviewed = await reviewRelationshipEvidence({
          db: h.db,
          relationshipId: edge.id,
          evidenceId: link._id,
          stance: "CONTEXTUALIZES",
          actor: reviewer,
          expectedVersion: 2,
          now: new Date("2026-02-10T00:00:00Z"),
        });
        assertEquals(reviewed.version, 3);
        const removed = await removeRelationshipEvidence({
          db: h.db,
          relationshipId: edge.id,
          evidenceId: link._id,
          actor: researcher,
          expectedVersion: 3,
          reason: "replaced",
          now: new Date("2026-02-11T00:00:00Z"),
        });
        assertEquals(removed.version, 4);
        const doc = await h.db.collection("relationships").findOne({ _id: edge.id });
        assertEquals(doc?.evidence.length, 0);
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": edge.id, action: "EVIDENCE_ADDED" }),
          1,
        );
      });

      await t.step("allows commutative concurrent appends under the cap", async () => {
        const third = await captureSnapshot({
          db: h.db,
          provider,
          sourceId: publicSource.id,
          bytes: text("public evidence three"),
          retrievedAt: new Date("2026-02-12T00:00:00Z"),
          captureMethod: "CRAWLER",
          acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
          actor: researcher,
        });
        await Promise.all([
          addEvidence({
            db: h.db,
            claimId: claim.id,
            snapshotId: snapshotTwo.snapshotId,
            stance: "CONTRADICTS",
            actor: researcher,
          }),
          addEvidence({
            db: h.db,
            claimId: claim.id,
            snapshotId: third.snapshotId,
            stance: "SUPPORTS",
            actor: researcher,
          }),
        ]);
        const doc = await h.db.collection("claims").findOne({ _id: claim.id });
        assertEquals(doc?.version, 7);
        assertEquals(doc?.evidence.length, 3);
        assertEquals(
          new Set(
            doc?.evidence.map((item: Record<string, unknown>) => String(item.sourceSnapshotId)),
          ).size,
          3,
        );
      });
    } finally {
      await h.close();
      await Deno.remove(root, { recursive: true }).catch(() => {});
    }
  },
});
