// Plan 05 - Independent status dimensions and the publication truth table (I03, I06).
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import {
  createRelationshipEdge,
  transitionPublication,
  transitionReview,
} from "../../utils/research/mod.ts";
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

async function seedGate(
  h: Awaited<ReturnType<typeof createHarness>>,
  id: ObjectId,
  version: number,
  result: "PASS" | "FAIL",
  sensitivity: "ROUTINE" | "SENSITIVE" | "HIGH_RISK",
) {
  const now = new Date();
  await h.db.collection("relationships").updateOne(
    { _id: id, version },
    {
      $set: {
        publicationGate: {
          gateVersion: "1",
          evaluatedAt: now,
          sensitivity,
          checks: {
            evidenceCountOk: true,
            independentSourcesOk: true,
            assessmentOk: true,
            fourEyesOk: true,
            legalSignOffOk: true,
            rightOfReplyOk: true,
            publicWordingOk: true,
            sourceAccessOk: true,
            noScoreOk: true,
          },
          result,
          failures: result === "PASS" ? [] : ["assessmentOk"],
          waivers: [],
        },
        updatedAt: now,
      },
      $inc: { version: 1 },
    },
  );
  return version + 1;
}

Deno.test({
  name: "status: review, assessment, publication stay independent",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan05_status");
    try {
      const researcher = await actor(h, ["RESEARCHER"]);
      const reviewer = await actor(h, ["RESEARCH_REVIEWER"]);
      const parent = await org(h, "Parent");
      const child = await org(h, "Child");
      const created = await createRelationshipEdge({
        db: h.db,
        subject: { type: "ORGANIZATION", id: parent },
        predicate: "OWNS",
        object: { type: "ORGANIZATION", id: child },
        validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
        actor: researcher,
      });

      await t.step("review transitions touch review only and are audited", async () => {
        const queued = await transitionReview({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "QUEUED",
          assignedTo: reviewer.id,
          expectedVersion: 1,
          reason: "queue for review",
          actor: researcher,
        });
        assertEquals(queued.version, 2);
        const doc = await h.db.collection("relationships").findOne({ _id: created.id });
        assert(doc);
        assertEquals(doc.review.status, "QUEUED");
        assertEquals(doc.review.assignedTo.toString(), reviewer.id!.toString());
        assertEquals(doc.assessment.outcome, "NOT_ASSESSED");
        assertEquals(doc.publication.status, "DRAFT");
        assertEquals(doc.recordLifecycle, "ACTIVE");

        const ready = await transitionReview({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "READY_FOR_DECISION",
          expectedVersion: queued.version,
          reason: "ready",
          actor: reviewer,
        });
        const readyDoc = await h.db.collection("relationships").findOne({ _id: created.id });
        assertEquals(readyDoc?.review.status, "READY_FOR_DECISION");
        assertEquals(readyDoc?.publication.status, "DRAFT");
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            "target.id": created.id,
            action: "REVIEW_STATUS_CHANGED",
          }),
          2,
        );
        const stale = await rejection(transitionReview({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "IN_REVIEW",
          expectedVersion: ready.version - 1,
          reason: "stale",
          actor: reviewer,
        }));
        assertEquals(stale.code, "VERSION_CONFLICT");
      });

      await t.step("DRAFT cannot jump straight to PUBLISHED", async () => {
        const invalid = await rejection(transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "PUBLISHED",
          expectedVersion: 3,
          reason: "skip review",
          actor: await actor(h, ["MODERATOR"]),
        }));
        assertEquals(invalid.code, "INVALID_PUBLICATION_TRANSITION");
        assertEquals(invalid.status, 409);
      });

      await t.step("DRAFT -> PENDING_REVIEW is allowed and changes only publication", async () => {
        const pending = await transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "PENDING_REVIEW",
          expectedVersion: 3,
          reason: "submit for decision",
          actor: researcher,
        });
        const doc = await h.db.collection("relationships").findOne({ _id: created.id });
        assertEquals(doc?.publication.status, "PENDING_REVIEW");
        assertEquals(doc?.review.status, "READY_FOR_DECISION");
        assertEquals(doc?.assessment.outcome, "NOT_ASSESSED");
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            "target.id": created.id,
            action: "PUBLICATION_CHANGED",
          }),
          1,
        );
        assertEquals(pending.version, 4);
      });

      await t.step("PUBLISHED without a PASS gate is rejected", async () => {
        const noGate = await rejection(transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "PUBLISHED",
          expectedVersion: 4,
          reason: "publish",
          actor: await actor(h, ["MODERATOR"]),
        }));
        assertEquals(noGate.code, "PUBLICATION_GATE_REQUIRED");
        assertEquals(noGate.status, 409);

        const failedVersion = await seedGate(h, created.id, 4, "FAIL", "SENSITIVE");
        const failed = await rejection(transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "PUBLISHED",
          expectedVersion: failedVersion,
          reason: "publish",
          actor: await actor(h, ["MODERATOR"]),
        }));
        assertEquals(failed.code, "PUBLICATION_GATE_REQUIRED");
      });

      await t.step("PUBLISHED requires a publisher role and four distinct eyes", async () => {
        const failingVersion = await seedGate(h, created.id, 5, "PASS", "SENSITIVE");
        const researcherPublish = await rejection(transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "PUBLISHED",
          expectedVersion: failingVersion,
          reason: "publish",
          actor: researcher,
        }));
        assertEquals(researcherPublish.code, "FORBIDDEN");

        const publisher = await actor(h, ["MODERATOR"]);
        const sameAsAuthor = await rejection(transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "PUBLISHED",
          expectedVersion: failingVersion,
          reason: "publish",
          actor: publisher,
        }));
        assertEquals(sameAsAuthor.code, "FOUR_EYES_REQUIRED");
        assertEquals(sameAsAuthor.status, 403);
      });

      await t.step("withholding and re-review follow the truth table", async () => {
        const withheld = await transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "WITHHELD",
          expectedVersion: 6,
          reason: "restricted source",
          actor: researcher,
        });
        assertEquals(withheld.version, 7);
        const withheldDraft = await transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "DRAFT",
          expectedVersion: 7,
          reason: "back to draft",
          actor: researcher,
        });
        assertEquals(withheldDraft.version, 8);

        const pending = await transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "PENDING_REVIEW",
          expectedVersion: 8,
          reason: "re-review",
          actor: researcher,
        });
        assertEquals(pending.version, 9);

        const pendingRetract = await rejection(transitionPublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: created.id,
          to: "RETRACTED",
          expectedVersion: 9,
          reason: "not from pending",
          actor: await actor(h, ["MODERATOR"]),
        }));
        assertEquals(pendingRetract.code, "INVALID_PUBLICATION_TRANSITION");
      });
    } finally {
      await h.close();
    }
  },
});
