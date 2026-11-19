// Independent review and publication state machines. Spec 10.2, 10.4, 16.1.
//
// One transition patches one status dimension. Publication never rewrites
// review, assessment, or recordLifecycle.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import {
  PUBLICATION_STATUSES,
  type PublicationStatus,
  REVIEW_WORKFLOW_STATUSES,
  type ReviewWorkflowStatus,
} from "../domain/constants.ts";
import {
  addRevisionPreview,
  appendAudit,
  EDIT_ROLES,
  type FindingType,
  getFinding,
  PUBLISH_ROLES,
  requireRoles,
  requireString,
  type ResearchActor,
  ResearchError,
} from "./common.ts";
import { invalidatePublicProjections, type ProjectionInvalidationHook } from "./invalidation.ts";
import { requestRebuildsForFinding } from "../publicProfile/readModel.ts";

const PUBLICATION_TRANSITIONS: Record<PublicationStatus, readonly PublicationStatus[]> = {
  DRAFT: ["PENDING_REVIEW", "WITHHELD"],
  PENDING_REVIEW: ["DRAFT", "PUBLISHED", "WITHHELD"],
  PUBLISHED: ["WITHHELD", "RETRACTED"],
  WITHHELD: ["DRAFT", "PENDING_REVIEW", "PUBLISHED"],
  RETRACTED: ["PENDING_REVIEW"],
};

export async function transitionReview(input: {
  db: Db;
  targetType: FindingType;
  targetId: ObjectId;
  to: ReviewWorkflowStatus;
  assignedTo?: ObjectId;
  expectedVersion: number;
  reason: string;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId }> {
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, EDIT_ROLES, "actor may not change review status");
  if (!(REVIEW_WORKFLOW_STATUSES as readonly string[]).includes(input.to)) {
    throw new ResearchError("UNKNOWN_REVIEW_STATUS", "unknown review status");
  }
  const reason = requireString(
    input.reason,
    "REASON_REQUIRED",
    "review transition requires a reason",
  );
  const doc = await getFinding(input.db, { type: input.targetType, id: input.targetId });
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const review = (doc.review ?? {}) as Record<string, unknown>;
  const from = String(review.status ?? "NOT_QUEUED");
  if (from === input.to) {
    throw new ResearchError("INVALID_REVIEW_TRANSITION", `review is already ${input.to}`, 409);
  }

  const nextVersion = version + 1;
  const set: Record<string, unknown> = {
    "review.status": input.to,
    "review.lastActionAt": now,
    updatedAt: now,
    ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
    recentRevisionPreview: addRevisionPreview(doc.recentRevisionPreview, {
      version: nextVersion,
      changedAt: now,
      changedBy: input.actor.id,
      reason,
      changedFields: ["review.status", ...(input.assignedTo ? ["review.assignedTo"] : [])],
    }),
  };
  if (input.assignedTo) set["review.assignedTo"] = input.assignedTo;
  if (!review.openedAt && from === "NOT_QUEUED") set["review.openedAt"] = now;
  if (input.to === "CLOSED") set["review.closedAt"] = now;

  const update = await input.db.collection(
    input.targetType === "RELATIONSHIP" ? "relationships" : "claims",
  )
    .updateOne(
      { _id: input.targetId, version: input.expectedVersion },
      { $set: set, $inc: { version: 1 } },
    );
  if (update.modifiedCount !== 1) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const auditId = await appendAudit(input.db, {
    action: "REVIEW_STATUS_CHANGED",
    target: { type: input.targetType, id: input.targetId },
    actor: input.actor,
    targetVersionBefore: version,
    targetVersionAfter: nextVersion,
    beforeSummary: { reviewStatus: from },
    afterSummary: { reviewStatus: input.to },
    changedPaths: ["review.status", ...(input.assignedTo ? ["review.assignedTo"] : [])],
    reason,
    now,
  });
  return { version: nextVersion, auditId };
}

function assertPublicationTransition(
  from: PublicationStatus,
  to: PublicationStatus,
): void {
  if (!(PUBLICATION_STATUSES as readonly string[]).includes(to)) {
    throw new ResearchError("UNKNOWN_PUBLICATION_STATUS", "unknown publication status");
  }
  if (from === to || !PUBLICATION_TRANSITIONS[from].includes(to)) {
    throw new ResearchError(
      "INVALID_PUBLICATION_TRANSITION",
      `publication cannot move from ${from} to ${to}`,
      409,
    );
  }
}

function gateIsCurrent(doc: Record<string, unknown>): boolean {
  const gate = doc.publicationGate as Record<string, unknown> | undefined;
  if (!gate || gate.result !== "PASS" || gate.sensitivity !== doc.sensitivity) return false;
  const evaluatedAt = new Date(gate.evaluatedAt as string | Date);
  const updatedAt = new Date(doc.updatedAt as string | Date);
  return !Number.isNaN(evaluatedAt.getTime()) && evaluatedAt.getTime() >= updatedAt.getTime();
}

function assertFourEyes(doc: Record<string, unknown>, actor: ResearchActor): void {
  if (doc.sensitivity !== "SENSITIVE" && doc.sensitivity !== "HIGH_RISK") return;
  const assessment = (doc.assessment ?? {}) as Record<string, unknown>;
  const author = doc.createdBy ? String(doc.createdBy) : "";
  const assessor = assessment.assessedBy ? String(assessment.assessedBy) : "";
  const publisher = actor.id ? String(actor.id) : "";
  if (!author || !assessor || !publisher) {
    throw new ResearchError(
      "FOUR_EYES_REQUIRED",
      "author, assessor, and publisher are required",
      403,
    );
  }
  if (author === assessor || author === publisher || assessor === publisher) {
    throw new ResearchError(
      "FOUR_EYES_REQUIRED",
      "author, assessor, and publisher must be distinct for SENSITIVE/HIGH_RISK findings",
      403,
    );
  }
}

export async function transitionPublication(input: {
  db: Db;
  targetType: FindingType;
  targetId: ObjectId;
  to: PublicationStatus;
  expectedVersion: number;
  reason: string;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId; from: PublicationStatus }> {
  const now = input.now ?? new Date();
  const isDecision = input.to === "PUBLISHED" || input.to === "RETRACTED";
  await requireRoles(
    input.db,
    input.actor,
    isDecision ? PUBLISH_ROLES : EDIT_ROLES,
    isDecision ? "actor may not publish or retract findings" : "actor may not change publication",
  );
  const reason = requireString(
    input.reason,
    "REASON_REQUIRED",
    "publication transition requires a reason",
  );
  const doc = await getFinding(input.db, { type: input.targetType, id: input.targetId });
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const publication = (doc.publication ?? {}) as Record<string, unknown>;
  const from = String(publication.status ?? "DRAFT") as PublicationStatus;
  assertPublicationTransition(from, input.to);

  if (input.to === "PUBLISHED") {
    if (!gateIsCurrent(doc)) {
      throw new ResearchError(
        "PUBLICATION_GATE_REQUIRED",
        "PUBLISHED requires a current PASS publication gate",
        409,
      );
    }
    assertFourEyes(doc, input.actor);
  }

  const nextVersion = version + 1;
  const nextPublication: Record<string, unknown> = {
    ...publication,
    status: input.to,
    reason,
    ...(input.actor.id ? { decidedBy: input.actor.id } : {}),
    decidedAt: now,
    ...(input.to === "PUBLISHED" ? { publishedAt: now } : {}),
    ...(input.to === "RETRACTED" ? { retractedAt: now, retractionReason: reason } : {}),
  };
  const update = await input.db.collection(
    input.targetType === "RELATIONSHIP" ? "relationships" : "claims",
  )
    .updateOne(
      { _id: input.targetId, version: input.expectedVersion, "publication.status": from },
      {
        $set: {
          publication: nextPublication,
          updatedAt: now,
          ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
          recentRevisionPreview: addRevisionPreview(doc.recentRevisionPreview, {
            version: nextVersion,
            changedAt: now,
            changedBy: input.actor.id,
            reason,
            changedFields: ["publication.status"],
          }),
        },
        $inc: { version: 1 },
      },
    );
  if (update.modifiedCount !== 1) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const auditId = await appendAudit(input.db, {
    action: input.to === "RETRACTED" ? "FINDING_RETRACTED" : "PUBLICATION_CHANGED",
    target: { type: input.targetType, id: input.targetId },
    actor: input.actor,
    targetVersionBefore: version,
    targetVersionAfter: nextVersion,
    beforeSummary: { publicationStatus: from },
    afterSummary: { publicationStatus: input.to },
    changedPaths: ["publication.status"],
    reason,
    now,
  });
  await requestRebuildsForFinding({
    db: input.db,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: `publication:${from}->${input.to}`,
    now,
  });
  return { version: nextVersion, auditId, from };
}

export async function retractFinding(input: {
  db: Db;
  targetType: FindingType;
  targetId: ObjectId;
  expectedVersion: number;
  reason: string;
  actor: ResearchActor;
  invalidationHook?: ProjectionInvalidationHook;
  now?: Date;
}): Promise<{
  version: number;
  auditId: ObjectId;
  from: PublicationStatus;
  surfaceTimings: Array<{
    surface: string;
    productIds: string[];
    findingId: string;
    startedAt: Date;
    completedAt: Date;
    durationMs: number;
  }>;
}> {
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, PUBLISH_ROLES, "actor may not retract findings");
  const reason = requireString(input.reason, "REASON_REQUIRED", "retraction requires a reason");
  const doc = await getFinding(input.db, { type: input.targetType, id: input.targetId });
  if (Number(doc.version ?? 0) !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const publication = (doc.publication ?? {}) as Record<string, unknown>;
  if (publication.status !== "PUBLISHED") {
    throw new ResearchError(
      "INVALID_PUBLICATION_TRANSITION",
      `publication cannot move from ${publication.status} to RETRACTED`,
      409,
    );
  }
  const transition = await transitionPublication({
    db: input.db,
    targetType: input.targetType,
    targetId: input.targetId,
    to: "RETRACTED",
    expectedVersion: input.expectedVersion,
    reason,
    actor: input.actor,
    now,
  });
  const invalidation = await invalidatePublicProjections({
    db: input.db,
    targetType: input.targetType,
    targetId: input.targetId,
    reason,
    now,
    hook: input.invalidationHook,
  });
  return {
    ...transition,
    surfaceTimings: invalidation?.surfaceTimings ?? [],
  };
}
