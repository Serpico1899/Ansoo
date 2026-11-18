// PublicationGate. Spec 10.5-10.7, I06, S22.
//
// The gate is a recorded evaluation, not a formality. Publication can only read
// a current PASS. Four-eyes and legal sign-off are never waivable.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import {
  PUBLICATION_GATE_VERSION,
  type PublicationGateCheck,
  WAIVABLE_GATE_CHECKS,
} from "../domain/constants.ts";
import {
  addRevisionPreview,
  appendAudit,
  type FindingType,
  getFinding,
  LEGAL_ROLES,
  PUBLISH_ROLES,
  requireRoles,
  requireString,
  type ResearchActor,
  ResearchError,
} from "./common.ts";
import { evaluateEvidence } from "./evidence.ts";

export type GateWaiverInput = { check: string; reason: string };

export type PublicationGate = {
  gateVersion: string;
  evaluatedAt: Date;
  sensitivity: string;
  checks: Record<PublicationGateCheck, boolean>;
  result: "PASS" | "FAIL";
  failures: string[];
  waivers: Array<{
    check: string;
    reason: string;
    approvedBy: ObjectId;
    approvedAt: Date;
  }>;
};

const FORBIDDEN_SCORE_KEYS = [
  "score",
  "verdict",
  "boycott",
  "ethicalScore",
  "overallRating",
] as const;

function hasForbiddenScoreField(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenScoreField(item, seen));
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if ((FORBIDDEN_SCORE_KEYS as readonly string[]).includes(key)) return true;
    if (hasForbiddenScoreField(nested, seen)) return true;
  }
  return false;
}

function solicitationQualifies(solicitation: unknown, now: Date): boolean {
  if (solicitation === null || typeof solicitation !== "object") return false;
  const item = solicitation as Record<string, unknown>;
  if (item.outcome === "RESPONDED" || item.outcome === "DECLINED") return true;
  if (item.outcome !== "NO_RESPONSE" && item.outcome !== "UNDELIVERABLE") return false;
  const deadline = item.responseDeadline ? new Date(item.responseDeadline as string | Date) : null;
  return Boolean(
    deadline && !Number.isNaN(deadline.getTime()) && deadline.getTime() <= now.getTime(),
  );
}

export function rightOfReplySatisfied(doc: Record<string, unknown>, now: Date): boolean {
  if (doc.sensitivity === "ROUTINE") return true;
  const solicitations = Array.isArray(doc.responseSolicitations) ? doc.responseSolicitations : [];
  return solicitations.some((item) => solicitationQualifies(item, now));
}

async function hasLegalSignOff(
  db: Db,
  target: { type: FindingType; id: ObjectId },
): Promise<boolean> {
  const event = await db.collection("audit_events").findOne(
    {
      "target.type": target.type,
      "target.id": target.id,
      action: "REVIEW_STATUS_CHANGED",
      changedPaths: "legalSignOff",
      "afterSummary.legalSignOff": true,
    },
    { sort: { occurredAt: -1 } },
  );
  return Boolean(event);
}

export async function recordLegalSignOff(input: {
  db: Db;
  targetType: FindingType;
  targetId: ObjectId;
  reason: string;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ auditId: ObjectId }> {
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, LEGAL_ROLES, "actor may not sign off legal review");
  const reason = requireString(input.reason, "REASON_REQUIRED", "legal sign-off requires a reason");
  await getFinding(input.db, { type: input.targetType, id: input.targetId });
  const auditId = await appendAudit(input.db, {
    action: "REVIEW_STATUS_CHANGED",
    target: { type: input.targetType, id: input.targetId },
    actor: input.actor,
    beforeSummary: { legalSignOff: false },
    afterSummary: {
      legalSignOff: true,
      legalSignOffBy: input.actor.id ? input.actor.id.toString() : input.actor.type,
    },
    changedPaths: ["legalSignOff"],
    reason,
    now,
  });
  return { auditId };
}

function validateWaivers(
  waivers: GateWaiverInput[] | undefined,
  actor: ResearchActor,
  roles: string[],
): GateWaiverInput[] {
  if (waivers === undefined) return [];
  if (!Array.isArray(waivers)) {
    throw new ResearchError("INVALID_WAIVERS", "waivers must be an array");
  }
  if (waivers.length === 0) return [];
  if (actor.type !== "USER" || !actor.id || !roles.includes("ADMIN")) {
    throw new ResearchError("FORBIDDEN", "gate waivers require an ADMIN principal", 403);
  }
  const seen = new Set<string>();
  for (const waiver of waivers) {
    if (waiver === null || typeof waiver !== "object") {
      throw new ResearchError("INVALID_WAIVERS", "waiver must be an object");
    }
    if (!(WAIVABLE_GATE_CHECKS as readonly string[]).includes(waiver.check)) {
      throw new ResearchError(
        "NON_WAIVABLE_GATE_CHECK",
        `${waiver.check} may never be waived`,
      );
    }
    if (seen.has(waiver.check)) {
      throw new ResearchError("DUPLICATE_WAIVER", `${waiver.check} is waived twice`);
    }
    seen.add(waiver.check);
    if (typeof waiver.reason !== "string" || waiver.reason.trim() === "") {
      throw new ResearchError("WAIVER_REASON_REQUIRED", "a waiver requires a written reason");
    }
  }
  return waivers;
}

export async function evaluatePublicationGate(input: {
  db: Db;
  targetType: FindingType;
  targetId: ObjectId;
  expectedVersion: number;
  actor: ResearchActor;
  waivers?: GateWaiverInput[];
  now?: Date;
}): Promise<{ version: number; gate: PublicationGate; auditIds: ObjectId[] }> {
  const now = input.now ?? new Date();
  const loadedActor = await requireRoles(
    input.db,
    input.actor,
    PUBLISH_ROLES,
    "actor may not evaluate the publication gate",
  );
  const waivers = validateWaivers(input.waivers, input.actor, loadedActor.roles);
  const target = { type: input.targetType, id: input.targetId };
  const doc = await getFinding(input.db, target);
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }

  const sensitivity = String(doc.sensitivity) as "ROUTINE" | "SENSITIVE" | "HIGH_RISK";
  const evidence = await evaluateEvidence(input.db, doc.evidence, sensitivity);
  const assessment = (doc.assessment ?? {}) as Record<string, unknown>;
  const outcome = String(assessment.outcome ?? "NOT_ASSESSED");
  const publicWording = typeof doc.publicWording === "string" ? doc.publicWording.trim() : "";
  const author = doc.createdBy ? String(doc.createdBy) : "";
  const assessor = assessment.assessedBy ? String(assessment.assessedBy) : "";
  const publisher = input.actor.id ? String(input.actor.id) : "";
  const legalSignOff = sensitivity !== "HIGH_RISK" || await hasLegalSignOff(input.db, target);

  const independentOk = sensitivity === "ROUTINE"
    ? true
    : sensitivity === "SENSITIVE"
    ? (evidence.independentSources >= 2 || evidence.officialRegistrySnapshots >= 1)
    : (evidence.independentSources >= 2 && evidence.officialCount >= 1);

  const checks: Record<PublicationGateCheck, boolean> = {
    evidenceCountOk: evidence.count >= 1 &&
      (sensitivity !== "ROUTINE" || evidence.verifiedSnapshots >= 1),
    independentSourcesOk: independentOk,
    assessmentOk: outcome === "SUPPORTED" ||
      (outcome === "PARTIALLY_SUPPORTED" && publicWording !== ""),
    fourEyesOk: sensitivity === "ROUTINE"
      ? Boolean(author && assessor && author !== assessor)
      : Boolean(
        author && assessor && publisher &&
          author !== assessor && author !== publisher && assessor !== publisher,
      ),
    legalSignOffOk: legalSignOff,
    rightOfReplyOk: rightOfReplySatisfied(doc, now),
    publicWordingOk: publicWording !== "",
    sourceAccessOk: evidence.entries.length > 0 &&
      evidence.invalidSnapshotIds.length === 0 &&
      evidence.entries.every((entry) => entry.access === "PUBLIC"),
    noScoreOk: !hasForbiddenScoreField(doc),
  };

  const waived = new Set(waivers.map((waiver) => waiver.check));
  const failures = (Object.entries(checks) as Array<[PublicationGateCheck, boolean]>)
    .filter(([check, passed]) => !passed && !waived.has(check))
    .map(([check]) => check);
  const result = failures.length === 0 ? "PASS" : "FAIL";

  const gate: PublicationGate = {
    gateVersion: PUBLICATION_GATE_VERSION,
    evaluatedAt: now,
    sensitivity,
    checks,
    result,
    failures,
    waivers: waivers.map((waiver) => ({
      check: waiver.check,
      reason: waiver.reason.trim(),
      approvedBy: input.actor.id!,
      approvedAt: now,
    })),
  };

  const nextVersion = version + 1;
  const update = await input.db.collection(
    input.targetType === "RELATIONSHIP" ? "relationships" : "claims",
  )
    .updateOne(
      { _id: input.targetId, version: input.expectedVersion },
      {
        $set: {
          publicationGate: gate,
          updatedAt: now,
          ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
          recentRevisionPreview: addRevisionPreview(doc.recentRevisionPreview, {
            version: nextVersion,
            changedAt: now,
            changedBy: input.actor.id,
            reason: `publication gate: ${result}`,
            changedFields: ["publicationGate"],
          }),
        },
        $inc: { version: 1 },
      },
    );
  if (update.modifiedCount !== 1) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }

  const auditIds: ObjectId[] = [];
  for (const waiver of gate.waivers) {
    auditIds.push(
      await appendAudit(input.db, {
        action: "GATE_WAIVER_GRANTED",
        target,
        actor: input.actor,
        targetVersionBefore: version,
        targetVersionAfter: nextVersion,
        beforeSummary: { check: waiver.check },
        afterSummary: { check: waiver.check, reason: waiver.reason },
        changedPaths: ["publicationGate.waivers"],
        reason: waiver.reason,
        now,
      }),
    );
  }
  auditIds.push(
    await appendAudit(input.db, {
      action: "PUBLICATION_GATE_EVALUATED",
      target,
      actor: input.actor,
      targetVersionBefore: version,
      targetVersionAfter: nextVersion,
      beforeSummary: {
        result: String(
          (doc.publicationGate as Record<string, unknown> | undefined)?.result ?? "NONE",
        ),
      },
      afterSummary: { result, failures: failures.join(","), gateVersion: PUBLICATION_GATE_VERSION },
      changedPaths: ["publicationGate"],
      reason: `publication gate: ${result}`,
      now,
    }),
  );
  return { version: nextVersion, gate, auditIds };
}
