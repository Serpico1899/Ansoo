// Plan 05 - PublicationGate, waivers, legal sign-off, and I06/S22.
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import {
  assessFinding,
  createRelationshipEdge,
  evaluatePublicationGate,
  recordLegalSignOff,
  transitionPublication,
  updateRelationship,
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

async function source(
  h: Awaited<ReturnType<typeof createHarness>>,
  input: {
    title: string;
    publisherName: string;
    canonicalUrl: string;
    sourceType?: string;
    access?: string;
  },
) {
  const _id = new ObjectId();
  await h.db.collection("sources").insertOne({
    _id,
    title: input.title,
    canonicalUrl: input.canonicalUrl,
    sourceType: input.sourceType ?? "NEWS",
    publisherName: input.publisherName,
    publisherVerified: true,
    access: input.access ?? "PUBLIC",
    attributionRequired: false,
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return _id;
}

async function snapshot(
  h: Awaited<ReturnType<typeof createHarness>>,
  sourceId: ObjectId,
  title: string,
) {
  const _id = new ObjectId();
  await h.db.collection("source_snapshots").insertOne({
    _id,
    source: { _id: sourceId, title },
    retrievedAt: new Date(),
    contentHash: "a".repeat(64),
    hashAlgorithm: "SHA256",
    captureMethod: "CRAWLER",
    acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
    lifecycle: "AVAILABLE",
    schemaVersion: 1,
    createdAt: new Date(),
  });
  return _id;
}

function evidenceLink(snapshotId: ObjectId, addedBy: ObjectId) {
  return {
    _id: new ObjectId(),
    sourceSnapshotId: snapshotId,
    stance: "SUPPORTS",
    addedBy,
    addedAt: new Date(),
  };
}

async function attachEvidence(
  h: Awaited<ReturnType<typeof createHarness>>,
  id: ObjectId,
  evidence: unknown[],
) {
  const doc = await h.db.collection("relationships").findOne({ _id: id });
  assert(doc);
  await h.db.collection("relationships").updateOne(
    { _id: id, version: doc.version },
    { $set: { evidence, updatedAt: new Date() }, $inc: { version: 1 } },
  );
  return Number(doc.version) + 1;
}

async function attachSolicitation(
  h: Awaited<ReturnType<typeof createHarness>>,
  id: ObjectId,
  organizationId: ObjectId,
  sentBy: ObjectId,
  outcome: string,
  deadline: Date,
) {
  const doc = await h.db.collection("relationships").findOne({ _id: id });
  assert(doc);
  await h.db.collection("relationships").updateOne(
    { _id: id, version: doc.version },
    {
      $set: {
        responseSolicitations: [{
          _id: new ObjectId(),
          organizationId,
          channel: "OFFICIAL_EMAIL",
          sentAt: new Date(deadline.getTime() - 14 * 86_400_000),
          sentBy,
          assertionsSummary: "Please respond to the ownership assertion.",
          responseDeadline: deadline,
          outcome,
          outcomeAt: outcome === "PENDING" ? undefined : deadline,
        }],
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
  );
  return Number(doc.version) + 1;
}

async function sensitiveFinding(
  h: Awaited<ReturnType<typeof createHarness>>,
  options: {
    author: { type: "USER"; id: ObjectId };
    assessor: { type: "USER"; id: ObjectId };
    publicWording?: string;
    restrictedSource?: boolean;
    solicitation?: "NONE" | "PENDING" | "NO_RESPONSE";
    sensitivity?: "SENSITIVE" | "HIGH_RISK";
  },
) {
  const parent = await org(h, `Parent ${Math.random()}`);
  const child = await org(h, `Child ${Math.random()}`);
  const created = await createRelationshipEdge({
    db: h.db,
    subject: { type: "ORGANIZATION", id: parent },
    predicate: options.sensitivity === "HIGH_RISK" ? "CONTROLS" : "OWNS",
    object: { type: "ORGANIZATION", id: child },
    context: options.sensitivity === "HIGH_RISK"
      ? { ownership: { basis: "VOTING_RIGHTS" } }
      : undefined,
    validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
    sensitivity: options.sensitivity,
    ...(options.publicWording ? { publicWording: options.publicWording } : {}),
    actor: options.author,
  });
  const s1 = await source(h, {
    title: "Independent report",
    publisherName: "News One",
    canonicalUrl: "https://news-one.example/a",
  });
  const s2 = await source(h, {
    title: "Official filing",
    publisherName: "Official Registry",
    canonicalUrl: "https://registry.example/b",
    sourceType: "OFFICIAL_REGISTRY",
    access: options.restrictedSource ? "RESTRICTED" : "PUBLIC",
  });
  const n1 = await snapshot(h, s1, "Independent report");
  const n2 = await snapshot(h, s2, "Official filing");
  let version = await attachEvidence(h, created.id, [
    evidenceLink(n1, options.author.id),
    evidenceLink(n2, options.author.id),
  ]);
  if (options.solicitation && options.solicitation !== "NONE") {
    version = await attachSolicitation(
      h,
      created.id,
      parent,
      options.author.id,
      options.solicitation,
      options.solicitation === "PENDING"
        ? new Date(Date.now() + 7 * 86_400_000)
        : new Date(Date.now() - 86_400_000),
    );
  }
  const assessed = await assessFinding({
    db: h.db,
    targetType: "RELATIONSHIP",
    targetId: created.id,
    outcome: "SUPPORTED",
    methodologyVersion: "1",
    limitations: [],
    expectedVersion: version,
    actor: options.assessor,
  });
  return { id: created.id, version: assessed.version, authority: parent };
}

Deno.test({
  name: "gate: PASS stores every check, is audited, and allows publication",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan05_gate");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const assessor = await actor(h, ["RESEARCH_REVIEWER"]);
      const publisher = await actor(h, ["MODERATOR"]);
      const finding = await sensitiveFinding(h, {
        author,
        assessor,
        publicWording: "The parent organization owns the child.",
        solicitation: "NO_RESPONSE",
      });

      const pending = await transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        to: "PENDING_REVIEW",
        expectedVersion: finding.version,
        reason: "ready for decision",
        actor: author,
      });

      const evaluated = await evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        expectedVersion: pending.version,
        actor: publisher,
      });
      assertEquals(evaluated.gate.gateVersion, "1");
      assertEquals(evaluated.gate.sensitivity, "SENSITIVE");
      assertEquals(evaluated.gate.result, "PASS");
      assertEquals(evaluated.gate.failures, []);
      assertEquals(evaluated.gate.checks.noScoreOk, true);
      assertEquals(evaluated.gate.checks.rightOfReplyOk, true);
      assertEquals(evaluated.gate.checks.fourEyesOk, true);
      assertEquals(evaluated.gate.checks.sourceAccessOk, true);
      assertEquals(
        await h.db.collection("audit_events").countDocuments({
          "target.id": finding.id,
          action: "PUBLICATION_GATE_EVALUATED",
        }),
        1,
      );

      const published = await transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        to: "PUBLISHED",
        expectedVersion: evaluated.version,
        reason: "gate pass",
        actor: publisher,
      });
      assertEquals(published.version, evaluated.version + 1);
      const doc = await h.db.collection("relationships").findOne({ _id: finding.id });
      assertEquals(doc?.publication.status, "PUBLISHED");
      assertEquals(doc?.publication.decidedBy.toString(), publisher.id!.toString());
      assert(doc?.publication.publishedAt);
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "gate: any failed check blocks publication (S22)",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan05_gate_fail");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const assessor = await actor(h, ["RESEARCH_REVIEWER"]);
      const publisher = await actor(h, ["MODERATOR"]);
      const finding = await sensitiveFinding(h, {
        author,
        assessor,
        solicitation: "NO_RESPONSE",
      });
      const pending = await transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        to: "PENDING_REVIEW",
        expectedVersion: finding.version,
        reason: "ready",
        actor: author,
      });
      const evaluated = await evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        expectedVersion: pending.version,
        actor: publisher,
      });
      assertEquals(evaluated.gate.result, "FAIL");
      assertEquals(evaluated.gate.failures.includes("publicWordingOk"), true);
      const blocked = await rejection(transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        to: "PUBLISHED",
        expectedVersion: evaluated.version,
        reason: "force",
        actor: publisher,
      }));
      assertEquals(blocked.code, "PUBLICATION_GATE_REQUIRED");

      const noReply = await sensitiveFinding(h, {
        author,
        assessor,
        publicWording: "Public wording.",
        solicitation: "PENDING",
      });
      const pendingTwo = await transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: noReply.id,
        to: "PENDING_REVIEW",
        expectedVersion: noReply.version,
        reason: "ready",
        actor: author,
      });
      const gateTwo = await evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: noReply.id,
        expectedVersion: pendingTwo.version,
        actor: publisher,
      });
      assertEquals(gateTwo.gate.result, "FAIL");
      assertEquals(gateTwo.gate.failures.includes("rightOfReplyOk"), true);
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "gate: waivers are narrow, ADMIN-only, reasoned, and audited",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan05_gate_waiver");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const assessor = await actor(h, ["RESEARCH_REVIEWER"]);
      const moderator = await actor(h, ["MODERATOR"]);
      const admin = await actor(h, ["ADMIN"]);
      const finding = await sensitiveFinding(h, {
        author,
        assessor,
        publicWording: "Public wording.",
        solicitation: "NONE",
      });
      const pending = await transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        to: "PENDING_REVIEW",
        expectedVersion: finding.version,
        reason: "ready",
        actor: author,
      });

      const nonAdmin = await rejection(evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        expectedVersion: pending.version,
        actor: moderator,
        waivers: [{ check: "rightOfReplyOk", reason: "Organization has no contact channel." }],
      }));
      assertEquals(nonAdmin.code, "FORBIDDEN");
      assertEquals(nonAdmin.status, 403);

      const noReason = await rejection(evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        expectedVersion: pending.version,
        actor: admin,
        waivers: [{ check: "rightOfReplyOk", reason: " " }],
      }));
      assertEquals(noReason.code, "WAIVER_REASON_REQUIRED");

      const nonWaivable = await rejection(evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        expectedVersion: pending.version,
        actor: admin,
        waivers: [{ check: "fourEyesOk", reason: "convenience" }],
      }));
      assertEquals(nonWaivable.code, "NON_WAIVABLE_GATE_CHECK");

      const legalWaiver = await rejection(evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        expectedVersion: pending.version,
        actor: admin,
        waivers: [{ check: "legalSignOffOk", reason: "convenience" }],
      }));
      assertEquals(legalWaiver.code, "NON_WAIVABLE_GATE_CHECK");

      const waived = await evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        expectedVersion: pending.version,
        actor: admin,
        waivers: [{ check: "rightOfReplyOk", reason: "Organization has no contact channel." }],
      });
      assertEquals(waived.gate.result, "PASS");
      assertEquals(waived.gate.checks.rightOfReplyOk, false);
      assertEquals(waived.gate.failures.includes("rightOfReplyOk"), false);
      assertEquals(waived.gate.waivers.length, 1);
      assertEquals(
        await h.db.collection("audit_events").countDocuments({
          "target.id": finding.id,
          action: "GATE_WAIVER_GRANTED",
        }),
        1,
      );
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "gate: HIGH_RISK legal sign-off is required and non-waivable (I07)",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan05_gate_legal");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const assessor = await actor(h, ["RESEARCH_REVIEWER"]);
      const publisher = await actor(h, ["MODERATOR"]);
      const legal = await actor(h, ["LEGAL_REVIEWER"]);
      const finding = await sensitiveFinding(h, {
        author,
        assessor,
        publicWording: "Control relationship is documented.",
        solicitation: "NO_RESPONSE",
        sensitivity: "HIGH_RISK",
      });
      const pending = await transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        to: "PENDING_REVIEW",
        expectedVersion: finding.version,
        reason: "ready",
        actor: author,
      });

      const missingLegal = await evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        expectedVersion: pending.version,
        actor: publisher,
      });
      assertEquals(missingLegal.gate.result, "FAIL");
      assertEquals(missingLegal.gate.failures.includes("legalSignOffOk"), true);

      const notLegal = await rejection(recordLegalSignOff({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        reason: "reviewed",
        actor: publisher,
      }));
      assertEquals(notLegal.code, "FORBIDDEN");

      await recordLegalSignOff({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        reason: "legal review completed",
        actor: legal,
      });

      const signed = await evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: finding.id,
        expectedVersion: missingLegal.version,
        actor: publisher,
      });
      assertEquals(signed.gate.checks.legalSignOffOk, true);
      assertEquals(signed.gate.result, "PASS");
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "gate: restricted sources and stale gates block publication",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan05_gate_source");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const assessor = await actor(h, ["RESEARCH_REVIEWER"]);
      const publisher = await actor(h, ["MODERATOR"]);
      const restricted = await sensitiveFinding(h, {
        author,
        assessor,
        publicWording: "Public wording.",
        solicitation: "NO_RESPONSE",
        restrictedSource: true,
      });
      const pending = await transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: restricted.id,
        to: "PENDING_REVIEW",
        expectedVersion: restricted.version,
        reason: "ready",
        actor: author,
      });
      const gate = await evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: restricted.id,
        expectedVersion: pending.version,
        actor: publisher,
      });
      assertEquals(gate.gate.checks.sourceAccessOk, false);
      assertEquals(gate.gate.result, "FAIL");

      const pass = await sensitiveFinding(h, {
        author,
        assessor,
        publicWording: "Public wording.",
        solicitation: "NO_RESPONSE",
      });
      const pendingTwo = await transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: pass.id,
        to: "PENDING_REVIEW",
        expectedVersion: pass.version,
        reason: "ready",
        actor: author,
      });
      const passGate = await evaluatePublicationGate({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: pass.id,
        expectedVersion: pendingTwo.version,
        actor: publisher,
      });
      assertEquals(passGate.gate.result, "PASS");

      await updateRelationship({
        db: h.db,
        id: pass.id,
        expectedVersion: passGate.version,
        patch: { publicWording: "Materially changed public wording." },
        reason: "wording changed after gate",
        actor: author,
      });
      const stale = await rejection(transitionPublication({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: pass.id,
        to: "PUBLISHED",
        expectedVersion: passGate.version + 1,
        reason: "stale gate",
        actor: publisher,
      }));
      assertEquals(stale.code, "PUBLICATION_GATE_REQUIRED");
    } finally {
      await h.close();
    }
  },
});
