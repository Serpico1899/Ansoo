// Plan 07 - Correction submission, review, and safe application (S12, S13, S17).
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import {
  applyCorrection,
  assignCorrection,
  decideCorrection,
  submitCorrection,
  withdrawCorrection,
} from "../../utils/governance/mod.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

async function actor(
  h: Awaited<ReturnType<typeof createHarness>>,
  roles: string[] = ["CONTRIBUTOR"],
) {
  const _id = new ObjectId();
  await h.db.collection("users").insertOne({
    _id,
    authProvider: "test",
    authSubject: `subject-${_id}`,
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

async function product(h: Awaited<ReturnType<typeof createHarness>>, name = "Original") {
  const _id = new ObjectId();
  await h.db.collection("products").insertOne({
    _id,
    name,
    normalizedName: name.toLowerCase(),
    matchKey: name.toLowerCase(),
    identifiers: [],
    brandMapping: { status: "UNREVIEWED" },
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return _id;
}

async function publishedClaim(h: Awaited<ReturnType<typeof createHarness>>) {
  const _id = new ObjectId();
  await h.db.collection("claims").insertOne({
    _id,
    about: { type: "PRODUCT", id: new ObjectId() },
    claimType: "OFFICIAL_STATEMENT",
    statement: "Original statement",
    publicWording: "Original public wording",
    recordLifecycle: "ACTIVE",
    publication: { status: "PUBLISHED" },
    review: { status: "CLOSED", priority: "NORMAL" },
    structuredValue: {
      claimType: "OFFICIAL_STATEMENT",
      speakingOrganizationId: new ObjectId(),
      statementDatePrecision: "UNKNOWN",
      channel: "PRESS_RELEASE",
    },
    evidence: [],
    organizationResponses: [],
    responseSolicitations: [],
    researchNotes: [],
    recentRevisionPreview: [],
    sensitivity: "ROUTINE",
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    schemaVersion: 1,
  });
  const profileId = new ObjectId();
  await h.db.collection("product_public_profiles").insertOne({
    _id: profileId,
    productId: new ObjectId(),
    claims: [{ findingId: _id }],
    relationships: [],
  });
  return { id: _id, profileId };
}

async function rejection(promise: Promise<unknown>): Promise<{
  code: string;
  status?: number;
  details?: Record<string, unknown>;
}> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; status?: number; details?: Record<string, unknown> };
  }
  throw new Error("expected rejection");
}

function nameChange(value = "Corrected") {
  return { fieldKey: "name", operation: "SET" as const, proposedValue: value };
}

Deno.test({
  name: "corrections: submit, review, and apply are separate and audited",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan07_corrections");
    try {
      const submitter = await actor(h);
      const reviewer = await actor(h, ["RESEARCH_REVIEWER"]);
      const moderator = await actor(h, ["MODERATOR"]);
      const other = await actor(h);
      const selfReviewer = await actor(h, ["RESEARCH_REVIEWER"]);
      const productId = await product(h);
      const now = new Date("2026-06-01T00:00:00Z");

      await t.step("S12 rejects unknown target, field, operation, and value shapes", async () => {
        assertEquals(
          (await rejection(submitCorrection({
            db: h.db,
            target: { type: "PRODUCT", id: new ObjectId() },
            submissionKind: "CORRECT_EXISTING",
            proposedChange: nameChange(),
            reason: "Missing target",
            idempotencyKey: "missing-target",
            actor: submitter,
          }))).code,
          "NOT_FOUND",
        );
        for (
          const proposedChange of [
            { fieldKey: "name.first", operation: "SET" as const, proposedValue: "x" },
            { fieldKey: "unknown", operation: "SET" as const, proposedValue: "x" },
            { fieldKey: "name", operation: "PATCH" as never, proposedValue: "x" },
            { fieldKey: "name", operation: "SET" as const, proposedValue: { $set: "x" } },
            { fieldKey: "description", operation: "SET" as const, proposedValue: ["x"] },
          ]
        ) {
          const error = await rejection(submitCorrection({
            db: h.db,
            target: { type: "PRODUCT", id: productId },
            submissionKind: "CORRECT_EXISTING",
            proposedChange,
            reason: "Bad proposal",
            idempotencyKey: `bad-${Math.random()}`,
            actor: submitter,
          }));
          assert(
            ["UNKNOWN_CORRECTION_FIELD", "INVALID_CORRECTION_OPERATION", "INVALID_CORRECTION_VALUE"]
              .includes(error.code),
            `unexpected ${error.code}`,
          );
        }
      });

      let correctionId = new ObjectId();
      let correctionVersion = 0;
      let targetVersion = 1;

      await t.step("submits an allowlisted proposal and is idempotent per submitter", async () => {
        const submitted = await submitCorrection({
          db: h.db,
          target: { type: "PRODUCT", id: productId },
          submissionKind: "CORRECT_EXISTING",
          proposedChange: nameChange(),
          reason: "The package label confirms the name.",
          evidenceReferences: [{ note: "Front label photo reviewed" }],
          idempotencyKey: "correction-1",
          actor: submitter,
          now,
        });
        correctionId = submitted.correctionId;
        correctionVersion = submitted.version;
        assertEquals(submitted.status, "PENDING");
        assertEquals(submitted.idempotentReplay, false);
        const duplicate = await submitCorrection({
          db: h.db,
          target: { type: "PRODUCT", id: productId },
          submissionKind: "CORRECT_EXISTING",
          proposedChange: nameChange(),
          reason: "The package label confirms the name.",
          idempotencyKey: "correction-1",
          actor: submitter,
          now,
        });
        assertEquals(duplicate.correctionId.toString(), correctionId.toString());
        assertEquals(duplicate.idempotentReplay, true);
        assertEquals(
          await h.db.collection("corrections").countDocuments({ submittedBy: submitter.id }),
          1,
        );
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            action: "CORRECTION_SUBMITTED",
            "target.id": correctionId,
          }),
          1,
        );
      });

      await t.step("enforces per-user and per-IP daily quotas with a 429 envelope", async () => {
        const limited = await actor(h);
        for (let index = 0; index < 10; index++) {
          await h.db.collection("corrections").insertOne({
            _id: new ObjectId(),
            target: { type: "PRODUCT", id: productId },
            submissionKind: "REPORT_ISSUE",
            reason: "seeded quota",
            evidenceReferences: [],
            submittedBy: limited.id,
            submittedAt: now,
            idempotencyKey: `seeded-${index}`,
            status: "PENDING",
            review: {},
            schemaVersion: 1,
            version: 1,
            createdAt: now,
            updatedAt: now,
          });
        }
        const userQuota = await rejection(submitCorrection({
          db: h.db,
          target: { type: "PRODUCT", id: productId },
          submissionKind: "REPORT_ISSUE",
          reason: "one too many",
          idempotencyKey: "quota-user",
          actor: limited,
          now,
        }));
        assertEquals(userQuota.code, "RATE_LIMITED");
        assertEquals(userQuota.status, 429);

        const ipUser = await actor(h);
        for (let index = 0; index < 30; index++) {
          await h.db.collection("corrections").insertOne({
            _id: new ObjectId(),
            target: { type: "PRODUCT", id: await product(h, `IP seed ${index}`) },
            submissionKind: "REPORT_ISSUE",
            reason: "seeded ip quota",
            evidenceReferences: [],
            submittedBy: new ObjectId(),
            submittedAt: now,
            submissionIpHash: "a".repeat(64),
            idempotencyKey: `ip-seeded-${index}`,
            status: "PENDING",
            review: {},
            schemaVersion: 1,
            version: 1,
            createdAt: now,
            updatedAt: now,
          });
        }
        const ipQuota = await rejection(submitCorrection({
          db: h.db,
          target: { type: "PRODUCT", id: productId },
          submissionKind: "REPORT_ISSUE",
          reason: "ip one too many",
          idempotencyKey: "quota-ip",
          clientIpHash: "a".repeat(64),
          actor: ipUser,
          now,
        }));
        assertEquals(ipQuota.code, "RATE_LIMITED");
        assertEquals(ipQuota.status, 429);
      });

      await t.step("flags coordinated dispute floods without auto-penalizing", async () => {
        const third = await actor(h);
        const second = await actor(h);
        const floodTarget = await product(h, "Flood target");
        for (const [index, user] of [other, second].entries()) {
          await submitCorrection({
            db: h.db,
            target: { type: "PRODUCT", id: floodTarget },
            submissionKind: "REPORT_ISSUE",
            reason: `coordinated ${index}`,
            idempotencyKey: `flood-${index}`,
            actor: user,
            now,
          });
        }
        const flagged = await submitCorrection({
          db: h.db,
          target: { type: "PRODUCT", id: floodTarget },
          submissionKind: "REPORT_ISSUE",
          reason: "coordinated third",
          idempotencyKey: "flood-2",
          actor: third,
          now,
        });
        assertEquals(flagged.floodSuspected, true);
        assertEquals(flagged.status, "PENDING");
      });

      await t.step("submission does not mutate the target", async () => {
        const doc = await h.db.collection("products").findOne({ _id: productId });
        assertEquals(doc?.name, "Original");
        assertEquals(doc?.version, 1);
      });

      await t.step("only reviewers decide, and the submitter cannot self-approve", async () => {
        assertEquals(
          (await rejection(decideCorrection({
            db: h.db,
            correctionId,
            status: "APPROVED",
            decisionReason: "ok",
            expectedVersion: correctionVersion,
            actor: submitter,
          }))).code,
          "FORBIDDEN",
        );
        const own = await submitCorrection({
          db: h.db,
          target: { type: "PRODUCT", id: productId },
          submissionKind: "REPORT_ISSUE",
          reason: "self-review attempt",
          idempotencyKey: "self-review",
          actor: selfReviewer,
          now,
        });
        assertEquals(
          (await rejection(decideCorrection({
            db: h.db,
            correctionId: own.correctionId,
            status: "APPROVED",
            decisionReason: "self",
            expectedVersion: own.version,
            actor: selfReviewer,
          }))).code,
          "SELF_APPROVAL",
        );
        const assigned = await assignCorrection({
          db: h.db,
          correctionId,
          assignedTo: reviewer.id!,
          expectedVersion: correctionVersion,
          actor: moderator,
          now,
        });
        correctionVersion = assigned.version;
        assertEquals(assigned.status, "IN_REVIEW");
      });

      await t.step("approval changes review metadata only, never the target", async () => {
        const before = await h.db.collection("products").findOne({ _id: productId });
        const approved = await decideCorrection({
          db: h.db,
          correctionId,
          status: "APPROVED",
          decisionReason: "Evidence is sufficient.",
          expectedVersion: correctionVersion,
          actor: moderator,
          now,
        });
        correctionVersion = approved.version;
        assertEquals(approved.status, "APPROVED");
        const after = await h.db.collection("products").findOne({ _id: productId });
        assertEquals(after?.name, before?.name);
        assertEquals(after?.version, before?.version);
        const correction = await h.db.collection("corrections").findOne({ _id: correctionId });
        assertEquals(correction?.status, "APPROVED");
        assertEquals(correction?.review.decisionReason, "Evidence is sufficient.");
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            action: "CORRECTION_REVIEWED",
            "target.id": correctionId,
            "afterSummary.decision": "APPROVED",
          }),
          1,
        );
      });

      await t.step("S13 rejects a stale target version and records FAILED", async () => {
        const stale = await rejection(applyCorrection({
          db: h.db,
          client: h.client,
          correctionId,
          expectedVersion: correctionVersion,
          expectedTargetVersion: targetVersion + 99,
          idempotencyKey: "apply-stale",
          actor: moderator,
          now,
        }));
        assertEquals(stale.code, "VERSION_CONFLICT");
        assertEquals(stale.status, 409);
        const correction = await h.db.collection("corrections").findOne({ _id: correctionId });
        assertEquals(correction?.application?.result, "FAILED");
        assertEquals(correction?.application?.targetVersionBefore, targetVersion);
        correctionVersion = Number(stale.details?.correctionVersion);
      });

      await t.step("re-applies the approved proposal through CAS and audits it", async () => {
        const applied = await applyCorrection({
          db: h.db,
          client: h.client,
          correctionId,
          expectedVersion: correctionVersion,
          expectedTargetVersion: targetVersion,
          idempotencyKey: "apply-1",
          actor: moderator,
          now,
        });
        assertEquals(applied.result, "APPLIED");
        assertEquals(applied.idempotentReplay, false);
        correctionVersion = applied.correctionVersion;
        targetVersion = applied.targetVersionAfter;
        const doc = await h.db.collection("products").findOne({ _id: productId });
        assertEquals(doc?.name, "Corrected");
        assertEquals(doc?.normalizedName, "corrected");
        assertEquals(doc?.matchKey, "corrected");
        assertEquals(doc?.version, targetVersion);
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            action: "CORRECTION_APPLIED",
            "target.id": productId,
            "targetVersionAfter": targetVersion,
          }),
          1,
        );
      });

      await t.step("repeated application is idempotent and never double-writes", async () => {
        const replay = await applyCorrection({
          db: h.db,
          client: h.client,
          correctionId,
          expectedVersion: correctionVersion,
          expectedTargetVersion: targetVersion,
          idempotencyKey: "apply-1",
          actor: moderator,
        });
        assertEquals(replay.idempotentReplay, true);
        assertEquals(replay.targetVersionAfter, targetVersion);
        const doc = await h.db.collection("products").findOne({ _id: productId });
        assertEquals(doc?.version, targetVersion);
        assertEquals(
          (await rejection(applyCorrection({
            db: h.db,
            client: h.client,
            correctionId,
            expectedVersion: correctionVersion,
            expectedTargetVersion: targetVersion,
            idempotencyKey: "apply-2",
            actor: moderator,
          }))).code,
          "ALREADY_APPLIED",
        );
      });

      await t.step("S17 failure after target write rolls back and can be repaired", async () => {
        const secondCorrection = await submitCorrection({
          db: h.db,
          target: { type: "PRODUCT", id: productId },
          submissionKind: "CORRECT_EXISTING",
          proposedChange: nameChange("Repaired"),
          reason: "A second correction",
          idempotencyKey: "correction-2",
          actor: submitter,
          now,
        });
        const approved = await decideCorrection({
          db: h.db,
          correctionId: secondCorrection.correctionId,
          status: "APPROVED",
          decisionReason: "Approved for repair test",
          expectedVersion: secondCorrection.version,
          actor: moderator,
          now,
        });
        const failed = await rejection(applyCorrection({
          db: h.db,
          client: h.client,
          correctionId: secondCorrection.correctionId,
          expectedVersion: approved.version,
          expectedTargetVersion: targetVersion,
          idempotencyKey: "apply-failpoint",
          actor: moderator,
          now,
          afterTargetWrite: () => {
            throw new Error("injected crash after target write");
          },
        }));
        assertEquals(failed.code, "INJECTED_FAILURE");
        const target = await h.db.collection("products").findOne({ _id: productId });
        assertEquals(target?.name, "Corrected");
        assertEquals(target?.version, targetVersion);
        const correction = await h.db.collection("corrections").findOne({
          _id: secondCorrection.correctionId,
        });
        assertEquals(correction?.status, "APPROVED");
        assertEquals(correction?.application, undefined);

        const repaired = await applyCorrection({
          db: h.db,
          client: h.client,
          correctionId: secondCorrection.correctionId,
          expectedVersion: approved.version,
          expectedTargetVersion: targetVersion,
          idempotencyKey: "apply-repair",
          actor: moderator,
          now,
        });
        assertEquals(repaired.result, "APPLIED");
        targetVersion = repaired.targetVersionAfter;
        const repairedDoc = await h.db.collection("products").findOne({ _id: productId });
        assertEquals(repairedDoc?.name, "Repaired");
        assertEquals(repairedDoc?.version, targetVersion);
      });

      await t.step(
        "published public wording changes emit a notice and purge profiles",
        async () => {
          const claim = await publishedClaim(h);
          const submitted = await submitCorrection({
            db: h.db,
            target: { type: "CLAIM", id: claim.id },
            submissionKind: "CORRECT_EXISTING",
            proposedChange: {
              fieldKey: "publicWording",
              operation: "SET",
              proposedValue: "Corrected public wording",
            },
            reason: "The published wording misstates the source.",
            idempotencyKey: "claim-wording-1",
            actor: submitter,
            now,
          });
          const approved = await decideCorrection({
            db: h.db,
            correctionId: submitted.correctionId,
            status: "APPROVED",
            decisionReason: "Wording correction accepted",
            expectedVersion: submitted.version,
            actor: moderator,
            now,
          });
          const applied = await applyCorrection({
            db: h.db,
            client: h.client,
            correctionId: submitted.correctionId,
            expectedVersion: approved.version,
            expectedTargetVersion: 1,
            idempotencyKey: "claim-wording-apply",
            actor: moderator,
            now,
          });
          assertEquals(applied.notice?.action, "PUBLIC_WORDING_CHANGED");
          assertEquals(applied.notice?.previousWording, "Original public wording");
          assertEquals(applied.notice?.reason, "The published wording misstates the source.");
          assertEquals(applied.notice?.auditEventId instanceof ObjectId, true);
          const stored = await h.db.collection("corrections").findOne({
            _id: submitted.correctionId,
          });
          assertEquals(stored?.publicNotice?.previousWording, "Original public wording");
          assertEquals(stored?.publicNotice?.reason, "The published wording misstates the source.");
          assertEquals(stored?.publicNotice?.auditEventId instanceof ObjectId, true);
          assertEquals(
            await h.db.collection("product_public_profiles").countDocuments({
              _id: claim.profileId,
            }),
            0,
          );
        },
      );

      await t.step("withdrawal is submitter-only and only before a terminal decision", async () => {
        const pending = await submitCorrection({
          db: h.db,
          target: { type: "PRODUCT", id: productId },
          submissionKind: "REPORT_ISSUE",
          reason: "withdraw me",
          idempotencyKey: "withdraw-1",
          actor: submitter,
          now,
        });
        assertEquals(
          (await rejection(withdrawCorrection({
            db: h.db,
            correctionId: pending.correctionId,
            expectedVersion: pending.version,
            actor: other,
          }))).code,
          "FORBIDDEN",
        );
        const withdrawn = await withdrawCorrection({
          db: h.db,
          correctionId: pending.correctionId,
          expectedVersion: pending.version,
          actor: submitter,
          now,
        });
        assertEquals(withdrawn.status, "WITHDRAWN");
        assertEquals(
          (await rejection(decideCorrection({
            db: h.db,
            correctionId: pending.correctionId,
            status: "APPROVED",
            decisionReason: "too late",
            expectedVersion: withdrawn.version,
            actor: moderator,
          }))).code,
          "INVALID_CORRECTION_TRANSITION",
        );
      });
    } finally {
      await h.close();
    }
  },
});
