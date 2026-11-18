// Plan 05 - Right of reply, solicitation outcomes, and organization responses (S23, S11).
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import {
  addOrganizationResponse,
  createRelationshipEdge,
  createResponseSolicitation,
  recordSolicitationOutcome,
  rightOfReplySatisfied,
  setOrganizationResponsePublication,
} from "../../utils/research/mod.ts";
import { DEFAULT_RESPONSE_DEADLINE_DAYS, HARD_CAPS } from "../../utils/domain/constants.ts";
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

async function asset(
  h: Awaited<ReturnType<typeof createHarness>>,
  visibility: "PRIVATE" | "RESEARCH_ONLY" | "PUBLIC_APPROVED",
  processingStatus = "READY",
) {
  const _id = new ObjectId();
  await h.db.collection("assets").insertOne({
    _id,
    storage: { provider: "LOCAL_DEV", objectKey: `assets/${_id}` },
    mimeType: "application/pdf",
    byteSize: 10,
    sha256: "a".repeat(64),
    processingStatus,
    visibility,
    uploadedAt: new Date(),
    exifStripped: true,
    legalHold: false,
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
  });
  return _id;
}

async function rejection(
  promise: Promise<unknown>,
): Promise<{ code: string; status: number; path?: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; status: number; path?: string };
  }
  throw new Error("expected rejection");
}

async function finding(
  h: Awaited<ReturnType<typeof createHarness>>,
  author: { type: "USER"; id: ObjectId },
) {
  const parent = await org(h, `Parent ${Math.random()}`);
  const child = await org(h, `Child ${Math.random()}`);
  const created = await createRelationshipEdge({
    db: h.db,
    subject: { type: "ORGANIZATION", id: parent },
    predicate: "OWNS",
    object: { type: "ORGANIZATION", id: child },
    validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
    actor: author,
  });
  return { id: created.id, version: created.version, parent, child };
}

Deno.test({
  name: "response: right-of-reply truth table blocks SENSITIVE publication (S23)",
  ignore: false,
  fn() {
    const now = new Date("2026-11-17T12:00:00Z");
    const future = new Date("2026-11-24T12:00:00Z");
    const past = new Date("2026-11-10T12:00:00Z");
    const base = { sensitivity: "SENSITIVE", responseSolicitations: [] };
    assertEquals(rightOfReplySatisfied(base, now), false);
    assertEquals(rightOfReplySatisfied({ ...base, sensitivity: "ROUTINE" }, now), true);
    assertEquals(
      rightOfReplySatisfied({
        ...base,
        responseSolicitations: [{ outcome: "PENDING", responseDeadline: past }],
      }, now),
      false,
    );
    assertEquals(
      rightOfReplySatisfied({
        ...base,
        responseSolicitations: [{ outcome: "NO_RESPONSE", responseDeadline: future }],
      }, now),
      false,
    );
    assertEquals(
      rightOfReplySatisfied({
        ...base,
        responseSolicitations: [{ outcome: "NO_RESPONSE", responseDeadline: past }],
      }, now),
      true,
    );
    assertEquals(
      rightOfReplySatisfied({
        ...base,
        responseSolicitations: [{
          outcome: "RESPONDED",
          responseDeadline: future,
          responseId: new ObjectId(),
        }],
      }, now),
      true,
    );
    assertEquals(
      rightOfReplySatisfied({
        ...base,
        responseSolicitations: [{ outcome: "DECLINED", responseDeadline: future }],
      }, now),
      true,
    );
    assertEquals(
      rightOfReplySatisfied({
        ...base,
        responseSolicitations: [{ outcome: "UNDELIVERABLE", responseDeadline: past }],
      }, now),
      true,
    );
  },
});

Deno.test({
  name: "response: solicitation deadline, proof, outcomes, and caps",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan05_solicitation");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const f = await finding(h, author);
      const proof = await asset(h, "PRIVATE");

      await t.step("defaults the deadline to sentAt + 14 days and audits", async () => {
        const sentAt = new Date("2026-11-01T09:00:00Z");
        const result = await createResponseSolicitation({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          organizationId: f.parent,
          channel: "OFFICIAL_EMAIL",
          assertionsSummary: "Respond to the ownership assertion.",
          proofAssetId: proof,
          sentAt,
          actor: author,
        });
        const doc = await h.db.collection("relationships").findOne({ _id: f.id });
        assert(doc);
        const solicitation = doc.responseSolicitations[0];
        assertEquals(
          new Date(solicitation.responseDeadline).toISOString(),
          new Date(sentAt.getTime() + DEFAULT_RESPONSE_DEADLINE_DAYS * 86_400_000).toISOString(),
        );
        assertEquals(solicitation.outcome, "PENDING");
        assertEquals(solicitation.proofAssetId.toString(), proof.toString());
        assertEquals(result.version, 2);
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": f.id, action: "SOLICITATION_SENT" }),
          1,
        );
      });

      await t.step("records each outcome with CAS and audit", async () => {
        const doc = await h.db.collection("relationships").findOne({ _id: f.id });
        const solicitationId = doc!.responseSolicitations[0]._id as ObjectId;
        const recorded = await recordSolicitationOutcome({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          solicitationId,
          outcome: "NO_RESPONSE",
          expectedVersion: 2,
          reason: "deadline elapsed",
          actor: author,
        });
        assertEquals(recorded.version, 3);
        const updated = await h.db.collection("relationships").findOne({ _id: f.id });
        assertEquals(updated?.responseSolicitations[0].outcome, "NO_RESPONSE");
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            "target.id": f.id,
            action: "SOLICITATION_OUTCOME_RECORDED",
          }),
          1,
        );
        const stale = await rejection(recordSolicitationOutcome({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          solicitationId,
          outcome: "DECLINED",
          expectedVersion: 2,
          reason: "stale",
          actor: author,
        }));
        assertEquals(stale.code, "VERSION_CONFLICT");
      });

      await t.step("rejects missing organizations and invalid deadlines", async () => {
        const missingOrg = await rejection(createResponseSolicitation({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          organizationId: new ObjectId(),
          channel: "OFFICIAL_EMAIL",
          assertionsSummary: "Question",
          actor: author,
        }));
        assertEquals(missingOrg.status, 404);

        const badDeadline = await rejection(createResponseSolicitation({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          organizationId: f.parent,
          channel: "OFFICIAL_EMAIL",
          assertionsSummary: "Question",
          sentAt: new Date("2026-11-10T00:00:00Z"),
          responseDeadline: new Date("2026-11-09T00:00:00Z"),
          actor: author,
        }));
        assertEquals(badDeadline.code, "INVALID_RESPONSE_DEADLINE");
      });

      await t.step("caps responseSolicitations at 10", async () => {
        for (let index = 0; index < 9; index++) {
          await createResponseSolicitation({
            db: h.db,
            targetType: "RELATIONSHIP",
            targetId: f.id,
            organizationId: f.parent,
            channel: "OFFICIAL_EMAIL",
            assertionsSummary: `Question ${index}`,
            actor: author,
          });
          assertEquals(
            (await h.db.collection("relationships").findOne({ _id: f.id }))!
              .responseSolicitations.length <= HARD_CAPS.responseSolicitations,
            true,
          );
        }
        const overflow = await rejection(createResponseSolicitation({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          organizationId: f.parent,
          channel: "OFFICIAL_EMAIL",
          assertionsSummary: "One too many",
          actor: author,
        }));
        assertEquals(overflow.code, "CAP_EXCEEDED");
        assertEquals(overflow.status, 422);
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "response: attributed response links to solicitation and never changes assessment",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan05_response");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const reviewer = await actor(h, ["RESEARCH_REVIEWER"]);
      const f = await finding(h, author);
      const sent = await createResponseSolicitation({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: f.id,
        organizationId: f.parent,
        channel: "OFFICIAL_FORM",
        assertionsSummary: "Respond to the ownership assertion.",
        actor: author,
      });
      const doc = await h.db.collection("relationships").findOne({ _id: f.id });
      const solicitationId = doc!.responseSolicitations[0]._id as ObjectId;

      await t.step("links the response and marks the solicitation RESPONDED", async () => {
        const publicAsset = await asset(h, "PUBLIC_APPROVED");
        const result = await addOrganizationResponse({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          respondingOrganizationId: f.parent,
          responseText: "We do not own that entity.",
          receivedVia: "OFFICIAL_FORM",
          attachmentAssetIds: [publicAsset],
          solicitationId,
          expectedVersion: sent.version,
          actor: author,
        });
        const updated = await h.db.collection("relationships").findOne({ _id: f.id });
        assert(updated);
        assertEquals(result.version, sent.version + 1);
        assertEquals(updated.organizationResponses.length, 1);
        const response = updated.organizationResponses[0];
        assertEquals(response.publicationStatus, "INTERNAL");
        assertEquals(response.solicitationId.toString(), solicitationId.toString());
        assertEquals(response.representativeVerification.status, "UNVERIFIED");
        const solicitation = updated.responseSolicitations.find(
          (item: { _id: ObjectId }) => item._id.equals(solicitationId),
        );
        assertEquals(solicitation.outcome, "RESPONDED");
        assertEquals(solicitation.responseId.toString(), response._id.toString());
        assertEquals(updated.assessment.outcome, "NOT_ASSESSED");
        assertEquals(updated.publication.status, "DRAFT");
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": f.id, action: "ORG_RESPONSE_ADDED" }),
          1,
        );
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": f.id, action: "SOLICITATION_OUTCOME_RECORDED" }),
          1,
        );
      });

      await t.step("caps responseText and rejects unsafe public attachments", async () => {
        const tooLong = await rejection(addOrganizationResponse({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          respondingOrganizationId: f.parent,
          responseText: "x".repeat(10_001),
          receivedVia: "OFFICIAL_FORM",
          expectedVersion: 3,
          actor: author,
        }));
        assertEquals(tooLong.code, "CAP_EXCEEDED");

        const privateAsset = await asset(h, "PRIVATE");
        const unsafe = await rejection(addOrganizationResponse({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          respondingOrganizationId: f.parent,
          responseText: "See attachment.",
          receivedVia: "OFFICIAL_FORM",
          attachmentAssetIds: [privateAsset],
          publicationStatus: "PUBLIC",
          expectedVersion: 3,
          actor: reviewer,
        }));
        assertEquals(unsafe.code, "UNSAFE_ATTACHMENT");
      });

      await t.step("PUBLIC requires reviewer approval and safe assets", async () => {
        const doc = await h.db.collection("relationships").findOne({ _id: f.id });
        const responseId = doc!.organizationResponses[0]._id as ObjectId;
        const researcher = await rejection(setOrganizationResponsePublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          responseId,
          status: "PUBLIC",
          expectedVersion: 3,
          reason: "publish response",
          actor: author,
        }));
        assertEquals(researcher.code, "FORBIDDEN");

        const published = await setOrganizationResponsePublication({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          responseId,
          status: "PUBLIC",
          expectedVersion: 3,
          reason: "reviewed response",
          actor: reviewer,
        });
        assertEquals(published.version, 4);
        const updated = await h.db.collection("relationships").findOne({ _id: f.id });
        const response = updated!.organizationResponses[0];
        assertEquals(response.publicationStatus, "PUBLIC");
        assertEquals(response.reviewedBy.toString(), reviewer.id!.toString());
        assertEquals(updated!.assessment.outcome, "NOT_ASSESSED");
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            "target.id": f.id,
            action: "ORG_RESPONSE_PUBLICATION_CHANGED",
          }),
          1,
        );
      });

      await t.step("VERIFIED representative authority requires a reviewer", async () => {
        const doc = await h.db.collection("relationships").findOne({ _id: f.id });
        const responseId = doc!.organizationResponses[0]._id as ObjectId;
        const selfVerify = await rejection(addOrganizationResponse({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: f.id,
          respondingOrganizationId: f.parent,
          responseText: "Second response.",
          receivedVia: "OFFICIAL_FORM",
          representativeVerification: { status: "VERIFIED", basis: "signed letter" },
          expectedVersion: 4,
          actor: author,
        }));
        assertEquals(selfVerify.code, "FORBIDDEN");
        assert(responseId);
      });
    } finally {
      await h.close();
    }
  },
});
