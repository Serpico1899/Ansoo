// Evidence assessment. Spec 10.3, I02, I05, S21.
//
// The outcome is a statement about the evidence, never a negative boolean.
// assessedBy is always the authenticated principal and can never equal the author.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { assertCharacterCap } from "../domain/caps.ts";
import {
  EVIDENCE_ASSESSMENT_OUTCOMES,
  type EvidenceAssessmentOutcome,
  LIMITATION_CODES,
  type LimitationCode,
} from "../domain/constants.ts";
import {
  addRevisionPreview,
  appendAudit,
  ASSESS_ROLES,
  type FindingTarget,
  getFinding,
  requireRoles,
  requireString,
  type ResearchActor,
  ResearchError,
} from "./common.ts";
import { evaluateEvidence } from "./evidence.ts";

export async function assessFinding(input: {
  db: Db;
  targetType: "RELATIONSHIP" | "CLAIM";
  targetId: ObjectId;
  outcome: EvidenceAssessmentOutcome;
  summary?: string;
  methodologyVersion: string;
  limitations: LimitationCode[];
  publicWording?: string;
  disputeBasis?: string;
  expectedVersion: number;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ version: number; auditIds: ObjectId[] }> {
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, ASSESS_ROLES, "actor may not assess evidence");
  if (input.actor.type === "USER" && !input.actor.id) {
    throw new ResearchError("ASSESSOR_REQUIRED", "assessment requires a principal id", 403);
  }
  if (!(EVIDENCE_ASSESSMENT_OUTCOMES as readonly string[]).includes(input.outcome)) {
    throw new ResearchError("UNKNOWN_ASSESSMENT_OUTCOME", "unknown assessment outcome");
  }
  const methodologyVersion = requireString(
    input.methodologyVersion,
    "METHODOLOGY_REQUIRED",
    "methodologyVersion is required",
  );
  if (!Array.isArray(input.limitations)) {
    throw new ResearchError("INVALID_LIMITATION", "limitations must be an array");
  }
  for (const limitation of input.limitations) {
    if (!(LIMITATION_CODES as readonly string[]).includes(limitation)) {
      throw new ResearchError("INVALID_LIMITATION", `unknown limitation ${String(limitation)}`);
    }
  }

  const target: FindingTarget = { type: input.targetType, id: input.targetId };
  const doc = await getFinding(input.db, target);
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  if (input.actor.id && doc.createdBy && String(input.actor.id) === String(doc.createdBy)) {
    throw new ResearchError("SELF_ASSESSMENT", "the author cannot assess their own finding", 403);
  }

  const evidence = await evaluateEvidence(input.db, doc.evidence, doc.sensitivity as never);
  const requiresEvidence = input.outcome === "SUPPORTED" || input.outcome === "PARTIALLY_SUPPORTED";
  if (requiresEvidence && evidence.count === 0) {
    throw new ResearchError(
      "INSUFFICIENT_EVIDENCE",
      "assessment requires at least one evidence link",
    );
  }
  if (input.outcome === "SUPPORTED" && !evidence.minimumOk) {
    throw new ResearchError(
      "INSUFFICIENT_EVIDENCE",
      "evidence does not meet the minimum for this sensitivity",
      422,
      {
        sensitivity: String(doc.sensitivity),
        independentSources: evidence.independentSources,
        verifiedSnapshots: evidence.verifiedSnapshots,
        officialSources: evidence.officialCount,
      },
    );
  }

  let summary = input.summary;
  if (input.outcome === "DISPUTED") {
    const stances = new Set(evidence.entries.map((entry) => entry.stance));
    const hasConflictingEvidence = stances.has("SUPPORTS") && stances.has("CONTRADICTS");
    const basis = input.disputeBasis?.trim();
    if (!hasConflictingEvidence && !basis) {
      throw new ResearchError(
        "DISPUTE_REQUIRES_CONFLICTING_EVIDENCE",
        "DISPUTED needs contradicting evidence or a documented conflicting interpretation",
      );
    }
    if (basis) summary = summary ? `${summary} ${basis}` : basis;
  }

  const existingWording = typeof doc.publicWording === "string" ? doc.publicWording : "";
  let publicWording: string | undefined;
  if (input.publicWording !== undefined) {
    assertCharacterCap("publicWording", input.publicWording);
    publicWording = input.publicWording;
  }
  if (input.outcome === "PARTIALLY_SUPPORTED" && !(publicWording ?? existingWording).trim()) {
    throw new ResearchError(
      "PUBLIC_WORDING_REQUIRED",
      "PARTIALLY_SUPPORTED requires narrowed public wording",
    );
  }

  const nextVersion = version + 1;
  const assessment = {
    outcome: input.outcome,
    ...(summary ? { summary } : {}),
    assessedAt: now,
    ...(input.actor.id ? { assessedBy: input.actor.id } : {}),
    methodologyVersion,
    limitations: input.limitations,
  };
  const changedFields = ["assessment"];
  if (publicWording !== undefined) changedFields.push("publicWording");
  const update = await input.db.collection(
    input.targetType === "RELATIONSHIP" ? "relationships" : "claims",
  )
    .updateOne(
      { _id: input.targetId, version: input.expectedVersion },
      {
        $set: {
          assessment,
          ...(publicWording === undefined ? {} : { publicWording }),
          updatedAt: now,
          ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
          recentRevisionPreview: addRevisionPreview(doc.recentRevisionPreview, {
            version: nextVersion,
            changedAt: now,
            changedBy: input.actor.id,
            reason: `assessment: ${input.outcome}`,
            changedFields,
          }),
        },
        $inc: { version: 1 },
      },
    );
  if (update.modifiedCount !== 1) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }

  const before = (doc.assessment ?? {}) as Record<string, unknown>;
  const auditIds = [
    await appendAudit(input.db, {
      action: "ASSESSMENT_RECORDED",
      target,
      actor: input.actor,
      targetVersionBefore: version,
      targetVersionAfter: nextVersion,
      beforeSummary: { outcome: String(before.outcome ?? "NOT_ASSESSED") },
      afterSummary: { outcome: input.outcome, methodologyVersion },
      changedPaths: ["assessment"],
      reason: `assessment: ${input.outcome}`,
      now,
    }),
  ];
  if (publicWording !== undefined && publicWording !== existingWording) {
    auditIds.push(
      await appendAudit(input.db, {
        action: "PUBLIC_WORDING_CHANGED",
        target,
        actor: input.actor,
        targetVersionBefore: version,
        targetVersionAfter: nextVersion,
        beforeSummary: { publicWording: existingWording },
        afterSummary: { publicWording },
        changedPaths: ["publicWording"],
        reason: "assessment narrowed public wording",
        now,
      }),
    );
  }
  return { version: nextVersion, auditIds };
}

export function assessRelationship(
  input: Omit<Parameters<typeof assessFinding>[0], "targetType">,
) {
  return assessFinding({ ...input, targetType: "RELATIONSHIP" });
}

export function assessClaim(
  input: Omit<Parameters<typeof assessFinding>[0], "targetType">,
) {
  return assessFinding({ ...input, targetType: "CLAIM" });
}
