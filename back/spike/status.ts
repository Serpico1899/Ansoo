// Independent status dimensions for findings (relationships and claims).
//
// recordLifecycle, review.status, assessment.outcome, and publication.status
// are separate questions. Each domain action touches exactly one dimension.
import { type Db, ObjectId } from "lesan";
import type { AuditService } from "./audit.ts";

export class StatusError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "StatusError";
  }
}

const COLLECTION = { relationship: "relationships", claim: "claims" } as const;
type FindingKind = keyof typeof COLLECTION;

async function updateDimension(
  db: Db,
  audit: AuditService,
  input: {
    kind: FindingKind;
    id: string;
    actor: { type: "user"; id: string };
    requestId: string;
    expectedVersion: number;
    set: Record<string, unknown>;
    action: "UPDATE" | "PUBLISH" | "RETRACT";
    changedPaths: string[];
    reason?: string;
  },
) {
  const result = await db.collection(COLLECTION[input.kind]).findOneAndUpdate(
    { _id: new ObjectId(input.id), version: input.expectedVersion },
    {
      $set: {
        ...input.set,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
        updatedBy: input.actor.id,
      },
    },
    { returnDocument: "after" },
  );
  if (!result) {
    throw new StatusError("VERSION_CONFLICT", "finding version changed");
  }

  await audit.appendAudit({
    actor: input.actor,
    action: input.action,
    target: { type: input.kind, id: input.id },
    requestId: input.requestId,
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    changedPaths: input.changedPaths,
    beforeSummary: { version: input.expectedVersion },
    afterSummary: { version: input.expectedVersion + 1, ...input.set },
    reason: input.reason,
  });

  return result;
}

export function createStatusService(db: Db, audit: AuditService) {
  const assess = (
    input: {
      kind: FindingKind;
      id: string;
      actor: { type: "user"; id: string };
      requestId: string;
      expectedVersion: number;
      outcome: string;
      summary?: string;
    },
  ) =>
    updateDimension(db, audit, {
      ...input,
      set: {
        "assessment.outcome": input.outcome,
        "assessment.summary": input.summary,
        "assessment.assessedBy": input.actor.id,
      },
      action: "UPDATE",
      changedPaths: ["assessment.outcome", "assessment.summary"],
    });

  const publish = (
    input: {
      kind: FindingKind;
      id: string;
      actor: { type: "user"; id: string };
      requestId: string;
      expectedVersion: number;
    },
  ) =>
    updateDimension(db, audit, {
      ...input,
      set: {
        "publication.status": "PUBLISHED",
        "publication.decidedBy": input.actor.id,
        "publication.publishedAt": new Date(),
        "publication.visibility": "PUBLIC",
      },
      action: "PUBLISH",
      changedPaths: ["publication.status"],
    });

  const withhold = (
    input: {
      kind: FindingKind;
      id: string;
      actor: { type: "user"; id: string };
      requestId: string;
      expectedVersion: number;
      reason: string;
    },
  ) =>
    updateDimension(db, audit, {
      ...input,
      set: {
        "publication.status": "WITHHELD",
        "publication.decidedBy": input.actor.id,
        "publication.withheldReason": input.reason,
      },
      action: "UPDATE",
      changedPaths: ["publication.status", "publication.withheldReason"],
      reason: input.reason,
    });

  const retract = (
    input: {
      kind: FindingKind;
      id: string;
      actor: { type: "user"; id: string };
      requestId: string;
      expectedVersion: number;
      reason: string;
    },
  ) =>
    updateDimension(db, audit, {
      ...input,
      set: {
        "publication.status": "RETRACTED",
        "publication.decidedBy": input.actor.id,
        "publication.withheldReason": input.reason,
      },
      action: "RETRACT",
      changedPaths: ["publication.status"],
      reason: input.reason,
    });

  const countByDimensions = async (
    kind: FindingKind,
    filter: Record<string, unknown>,
  ) => await db.collection(COLLECTION[kind]).countDocuments(filter);

  return { assess, publish, withhold, retract, countByDimensions };
}

export type StatusService = ReturnType<typeof createStatusService>;

export function assertNoUniversalVerdict(profile: Record<string, unknown>): void {
  const forbidden = [
    "verdict",
    "score",
    "ethicalScore",
    "legalVerdict",
    "boycott",
    "overallStatus",
  ];
  for (const key of forbidden) {
    if (key in profile) {
      throw new Error(`public profile must not contain universal verdict field: ${key}`);
    }
  }
}
