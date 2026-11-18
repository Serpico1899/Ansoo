// Correction submission, review, and application. Plan 07 / spec 9.1.
//
// Approval never mutates canonical data. Application is a separate authorized
// action that revalidates the allowlist, uses CAS on the target version, writes
// a ledger row, and commits target + correction + audit in one transaction.
import type { Db, MongoClient } from "lesan";
import { ObjectId } from "lesan";
import {
  CORRECTION_APPLICATION_RESULTS,
  CORRECTION_STATUSES,
  CORRECTION_SUBMISSION_KINDS,
  type CorrectionApplicationResult,
  type CorrectionOperation,
  type CorrectionStatus,
  type CorrectionSubmissionKind,
  type CorrectionTargetType,
  HARD_CAPS,
  SECURITY_LIMITS,
} from "../domain/constants.ts";
import { createEntityRegistry, ReferenceError } from "../identity/registry.ts";
import { invalidatePublicProjections } from "../research/invalidation.ts";
import { appendAuditEvent } from "./audit.ts";
import {
  assertNoUnknownKeys,
  type GovernanceActor,
  GovernanceError,
  loadActor,
  parseObjectId,
  RateLimitError,
  requireRoles,
  requireString,
  REVIEW_ROLES,
  startOfUtcDay,
  versionOf,
} from "./common.ts";
import {
  buildCorrectionPatch,
  currentValueForProposal,
  isCorrectionTargetType,
  validateCorrectionProposal,
} from "./correctionPolicy.ts";

type CorrectionRecord = Record<string, unknown> & { _id: ObjectId };

export type CorrectionTargetRef = { type: CorrectionTargetType; id: ObjectId };

export type PublicCorrectionNotice = {
  correctedAt: Date;
  reason: string;
  previousWording: string;
  auditEventId: ObjectId;
  correctionId: ObjectId;
  target: CorrectionTargetRef;
  action: "PUBLIC_WORDING_CHANGED" | "RETRACTED";
  fieldKey?: string;
};

const SUBMIT_KEYS = [
  "db",
  "target",
  "submissionKind",
  "proposedChange",
  "reason",
  "evidenceReferences",
  "idempotencyKey",
  "clientIpHash",
  "actor",
  "now",
] as const;
const ASSIGN_KEYS = [
  "db",
  "correctionId",
  "assignedTo",
  "expectedVersion",
  "actor",
  "now",
] as const;
const DECIDE_KEYS = [
  "db",
  "correctionId",
  "status",
  "decisionReason",
  "expectedVersion",
  "actor",
  "now",
] as const;
const WITHDRAW_KEYS = ["db", "correctionId", "expectedVersion", "actor", "now"] as const;
const APPLY_KEYS = [
  "db",
  "client",
  "correctionId",
  "expectedVersion",
  "expectedTargetVersion",
  "idempotencyKey",
  "actor",
  "now",
  "afterTargetWrite",
] as const;

const EVIDENCE_REF_KEYS = ["sourceSnapshotId", "assetId", "url", "note"] as const;
const TERMINAL_STATUSES: readonly CorrectionStatus[] = ["APPROVED", "REJECTED", "WITHDRAWN"];

function assertSubmissionKind(value: unknown): CorrectionSubmissionKind {
  if (
    typeof value !== "string" ||
    !(CORRECTION_SUBMISSION_KINDS as readonly string[]).includes(value)
  ) {
    throw new GovernanceError("INVALID_SUBMISSION_KIND", "unknown correction submission kind");
  }
  return value as CorrectionSubmissionKind;
}

function assertStatus(value: unknown): CorrectionStatus {
  if (typeof value !== "string" || !(CORRECTION_STATUSES as readonly string[]).includes(value)) {
    throw new GovernanceError("INVALID_CORRECTION_STATUS", "unknown correction status");
  }
  return value as CorrectionStatus;
}

function assertTarget(
  target: unknown,
): { type: CorrectionTargetType; id: ObjectId } {
  if (target === null || typeof target !== "object" || Array.isArray(target)) {
    throw new GovernanceError("INVALID_CORRECTION_TARGET", "target must be an object");
  }
  const value = target as { type?: unknown; id?: unknown };
  if (!isCorrectionTargetType(value.type)) {
    throw new GovernanceError("INVALID_CORRECTION_TARGET", "unknown correction target type");
  }
  return {
    type: value.type,
    id: parseObjectId(value.id, "INVALID_CORRECTION_TARGET", "target.id"),
  };
}

async function resolveTarget(
  db: Db,
  target: { type: CorrectionTargetType; id: ObjectId },
): Promise<{ type: CorrectionTargetType; id: ObjectId }> {
  const registry = createEntityRegistry(db);
  try {
    const resolved = await registry.resolve("correction.target", target);
    return { type: resolved.ref.type as CorrectionTargetType, id: resolved.ref.id };
  } catch (error) {
    if (error instanceof ReferenceError) {
      throw new GovernanceError(error.code, error.message, error.status);
    }
    throw error;
  }
}

async function validateEvidenceReferences(
  db: Db,
  value: unknown,
): Promise<Record<string, unknown>[]> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new GovernanceError("INVALID_EVIDENCE_REFERENCE", "evidenceReferences must be an array");
  }
  if (value.length > HARD_CAPS.evidenceReferences) {
    throw new GovernanceError("CAP_EXCEEDED", "too many evidence references", 422, {
      path: "evidenceReferences",
      cap: HARD_CAPS.evidenceReferences,
      actual: value.length,
    });
  }
  const result: Record<string, unknown>[] = [];
  for (const [index, item] of value.entries()) {
    assertNoUnknownKeys(
      item,
      EVIDENCE_REF_KEYS,
      "INVALID_EVIDENCE_REFERENCE",
      `evidenceReferences[${index}]`,
    );
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new GovernanceError(
        "INVALID_EVIDENCE_REFERENCE",
        "evidence reference must be an object",
      );
    }
    const record = item as Record<string, unknown>;
    const locators = ["sourceSnapshotId", "assetId", "url", "note"].filter((key) =>
      record[key] !== undefined
    );
    if (locators.length === 0) {
      throw new GovernanceError(
        "INVALID_EVIDENCE_REFERENCE",
        "each evidence reference needs a snapshot, asset, URL, or note",
      );
    }
    const normalized: Record<string, unknown> = {};
    if (record.sourceSnapshotId !== undefined) {
      const snapshotId = parseObjectId(
        record.sourceSnapshotId,
        "INVALID_EVIDENCE_REFERENCE",
        "sourceSnapshotId",
      );
      if (
        await db.collection("source_snapshots").countDocuments({ _id: snapshotId }, {
          limit: 1,
        }) !== 1
      ) {
        throw new GovernanceError("NOT_FOUND", "evidence snapshot does not exist", 404);
      }
      normalized.sourceSnapshotId = snapshotId;
    }
    if (record.assetId !== undefined) {
      const assetId = parseObjectId(record.assetId, "INVALID_EVIDENCE_REFERENCE", "assetId");
      if (await db.collection("assets").countDocuments({ _id: assetId }, { limit: 1 }) !== 1) {
        throw new GovernanceError("NOT_FOUND", "evidence asset does not exist", 404);
      }
      normalized.assetId = assetId;
    }
    if (record.url !== undefined) {
      if (typeof record.url !== "string") {
        throw new GovernanceError("INVALID_EVIDENCE_REFERENCE", "evidence URL must be a string");
      }
      let url: URL;
      try {
        url = new URL(record.url);
      } catch {
        throw new GovernanceError("INVALID_EVIDENCE_REFERENCE", "evidence URL is invalid");
      }
      if (url.protocol !== "https:") {
        throw new GovernanceError("INSECURE_EVIDENCE_URL", "evidence URL must use HTTPS");
      }
      normalized.url = url.toString();
    }
    if (record.note !== undefined) {
      normalized.note = requireString(
        record.note,
        "INVALID_EVIDENCE_REFERENCE",
        "evidence note is required",
        { maxLength: 4_000 },
      );
    }
    result.push(normalized);
  }
  return result;
}

async function assertQuotas(
  db: Db,
  actor: GovernanceActor,
  clientIpHash: string | undefined,
  now: Date,
): Promise<void> {
  if (actor.type !== "USER" || !actor.id) return;
  const day = startOfUtcDay(now);
  const userCount = await db.collection("corrections").countDocuments({
    submittedBy: actor.id,
    submittedAt: { $gte: day },
  });
  if (userCount >= SECURITY_LIMITS.correctionsPerUserPerDay) {
    throw new RateLimitError(
      "daily correction quota exceeded",
      "correctionsPerUserPerDay",
      SECURITY_LIMITS.correctionsPerUserPerDay,
      userCount + 1,
    );
  }
  if (clientIpHash) {
    const ipCount = await db.collection("corrections").countDocuments({
      submissionIpHash: clientIpHash,
      submittedAt: { $gte: day },
    });
    if (ipCount >= SECURITY_LIMITS.correctionsPerIpPerDay) {
      throw new RateLimitError(
        "daily correction quota exceeded",
        "correctionsPerIpPerDay",
        SECURITY_LIMITS.correctionsPerIpPerDay,
        ipCount + 1,
      );
    }
  }
}

async function detectFlood(
  db: Db,
  target: CorrectionTargetRef | undefined,
  actor: GovernanceActor,
  now: Date,
): Promise<boolean> {
  if (!target || actor.type !== "USER" || !actor.id) return false;
  const submitters = await db.collection("corrections").distinct("submittedBy", {
    "target.type": target.type,
    "target.id": target.id,
    submittedAt: { $gte: new Date(now.getTime() - 60 * 60 * 1000) },
  });
  const distinct = submitters.map(String);
  if (distinct.includes(actor.id.toString())) return false;
  return distinct.length >= 2;
}

function submissionDoc(input: {
  target?: CorrectionTargetRef;
  submissionKind: CorrectionSubmissionKind;
  proposedChange?: unknown;
  reason: string;
  evidenceReferences: Record<string, unknown>[];
  submittedBy: ObjectId;
  clientIpHash?: string;
  idempotencyKey: string;
  now: Date;
}): CorrectionRecord {
  return {
    _id: new ObjectId(),
    ...(input.target ? { target: input.target } : {}),
    submissionKind: input.submissionKind,
    ...(input.proposedChange === undefined ? {} : { proposedChange: input.proposedChange }),
    reason: input.reason,
    evidenceReferences: input.evidenceReferences,
    submittedBy: input.submittedBy,
    submittedAt: input.now,
    ...(input.clientIpHash ? { submissionIpHash: input.clientIpHash } : {}),
    idempotencyKey: input.idempotencyKey,
    status: "PENDING",
    review: {},
    schemaVersion: 1,
    version: 1,
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.submittedBy,
  };
}

export async function submitCorrection(input: {
  db: Db;
  target?: { type: CorrectionTargetType; id: ObjectId };
  submissionKind: CorrectionSubmissionKind;
  proposedChange?: unknown;
  reason: string;
  evidenceReferences?: unknown;
  idempotencyKey: string;
  clientIpHash?: string;
  actor: GovernanceActor;
  now?: Date;
}): Promise<{
  correctionId: ObjectId;
  version: number;
  status: CorrectionStatus;
  idempotentReplay: boolean;
  floodSuspected: boolean;
  auditId?: ObjectId;
}> {
  assertNoUnknownKeys(input, SUBMIT_KEYS, "UNKNOWN_CORRECTION_FIELD");
  const now = input.now ?? new Date();
  const loaded = await loadActor(input.db, input.actor);
  if (loaded.type !== "USER" || !loaded.id) {
    throw new GovernanceError(
      "FORBIDDEN",
      "corrections require an authenticated user",
      403,
    );
  }
  const submissionKind = assertSubmissionKind(input.submissionKind);
  const reason = requireString(input.reason, "REASON_REQUIRED", "reason is required", {
    maxLength: 2_000,
  });
  const idempotencyKey = requireString(
    input.idempotencyKey,
    "IDEMPOTENCY_KEY_REQUIRED",
    "idempotencyKey is required",
    { maxLength: 200 },
  );
  const clientIpHash = input.clientIpHash === undefined
    ? undefined
    : requireString(input.clientIpHash, "INVALID_IP_HASH", "clientIpHash is invalid", {
      maxLength: 200,
    });
  if (clientIpHash && !/^[a-f0-9]{32,128}$/i.test(clientIpHash)) {
    throw new GovernanceError("INVALID_IP_HASH", "clientIpHash must be a hex HMAC");
  }

  const existing = await input.db.collection("corrections").findOne({
    submittedBy: loaded.id,
    idempotencyKey,
  });
  if (existing) {
    return {
      correctionId: existing._id as ObjectId,
      version: versionOf(existing),
      status: existing.status as CorrectionStatus,
      idempotentReplay: true,
      floodSuspected: false,
    };
  }

  let target: CorrectionTargetRef | undefined;
  let proposedChange: unknown;
  if (submissionKind === "ADD_MISSING") {
    if (input.target !== undefined) {
      throw new GovernanceError(
        "INVALID_CORRECTION_TARGET",
        "ADD_MISSING must not carry an existing target",
      );
    }
    const proposal = input.proposedChange as
      | { proposedEntity?: { type?: unknown; id?: unknown } }
      | undefined;
    if (!proposal?.proposedEntity) {
      throw new GovernanceError(
        "INVALID_CORRECTION_PROPOSAL",
        "ADD_MISSING requires a proposedEntity",
      );
    }
    if (
      typeof proposal.proposedEntity.type !== "string" ||
      !["PRODUCT", "BRAND", "ORGANIZATION"].includes(proposal.proposedEntity.type)
    ) {
      throw new GovernanceError("INVALID_CORRECTION_TARGET", "invalid proposedEntity type");
    }
    const registry = createEntityRegistry(input.db);
    try {
      const resolved = await registry.resolve("relationship.object", proposal.proposedEntity);
      proposedChange = {
        proposedEntity: { type: resolved.ref.type, id: resolved.ref.id },
      };
    } catch (error) {
      if (error instanceof ReferenceError) {
        throw new GovernanceError(error.code, error.message, error.status);
      }
      throw error;
    }
  } else {
    if (input.target === undefined) {
      throw new GovernanceError("INVALID_CORRECTION_TARGET", "target is required");
    }
    target = await resolveTarget(input.db, assertTarget(input.target));
    if (submissionKind === "CORRECT_EXISTING" && input.proposedChange === undefined) {
      throw new GovernanceError(
        "INVALID_CORRECTION_PROPOSAL",
        "CORRECT_EXISTING requires a proposedChange",
      );
    }
    if (input.proposedChange !== undefined) {
      if (!target) throw new GovernanceError("INVALID_CORRECTION_TARGET", "target is required");
      proposedChange = validateCorrectionProposal(target.type, input.proposedChange);
    }
  }

  const evidenceReferences = await validateEvidenceReferences(input.db, input.evidenceReferences);
  await assertQuotas(input.db, loaded, clientIpHash, now);
  const floodSuspected = await detectFlood(input.db, target, loaded, now);
  const doc = submissionDoc({
    target,
    submissionKind,
    proposedChange,
    reason,
    evidenceReferences,
    submittedBy: loaded.id,
    clientIpHash,
    idempotencyKey,
    now,
  });
  await input.db.collection("corrections").insertOne(doc);
  const auditId = await appendAuditEvent(input.db, {
    action: "CORRECTION_SUBMITTED",
    target: { type: "CORRECTION", id: doc._id },
    actor: input.actor,
    targetVersionBefore: 0,
    targetVersionAfter: 1,
    afterSummary: {
      submissionKind,
      targetType: target?.type ?? null,
      floodSuspected,
    },
    changedPaths: ["submissionKind", "proposedChange", "reason", "evidenceReferences"],
    now,
  });
  return {
    correctionId: doc._id,
    version: 1,
    status: "PENDING",
    idempotentReplay: false,
    floodSuspected,
    auditId,
  };
}

async function getCorrection(db: Db, correctionId: ObjectId): Promise<CorrectionRecord> {
  const doc = await db.collection("corrections").findOne({ _id: correctionId });
  if (!doc) throw new GovernanceError("NOT_FOUND", "correction does not exist", 404);
  return doc as CorrectionRecord;
}

export async function assignCorrection(input: {
  db: Db;
  correctionId: ObjectId;
  assignedTo: ObjectId;
  expectedVersion: number;
  actor: GovernanceActor;
  now?: Date;
}): Promise<
  { correctionId: ObjectId; version: number; status: CorrectionStatus; auditId: ObjectId }
> {
  assertNoUnknownKeys(input, ASSIGN_KEYS, "UNKNOWN_CORRECTION_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, REVIEW_ROLES, "actor may not assign corrections");
  const assignment = await input.db.collection("users").countDocuments(
    { _id: input.assignedTo, accountStatus: "ACTIVE" },
    { limit: 1 },
  );
  if (assignment !== 1) {
    throw new GovernanceError("NOT_FOUND", "assignee is not an active user", 404);
  }
  const correction = await getCorrection(input.db, input.correctionId);
  if (TERMINAL_STATUSES.includes(correction.status as CorrectionStatus)) {
    throw new GovernanceError(
      "INVALID_CORRECTION_TRANSITION",
      "correction is already decided",
      409,
    );
  }
  const updated = await input.db.collection("corrections").updateOne(
    {
      _id: input.correctionId,
      version: input.expectedVersion,
      status: { $nin: TERMINAL_STATUSES },
    },
    {
      $set: {
        status: "IN_REVIEW",
        "review.assignedTo": input.assignedTo,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new GovernanceError("VERSION_CONFLICT", "correction version did not match", 409);
  }
  const auditId = await appendAuditEvent(input.db, {
    action: "CORRECTION_REVIEWED",
    target: { type: "CORRECTION", id: input.correctionId },
    actor: input.actor,
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    beforeSummary: { status: String(correction.status) },
    afterSummary: { status: "IN_REVIEW", assignedTo: input.assignedTo.toString() },
    changedPaths: ["status", "review.assignedTo"],
    now,
  });
  return {
    correctionId: input.correctionId,
    version: input.expectedVersion + 1,
    status: "IN_REVIEW",
    auditId,
  };
}

export async function decideCorrection(input: {
  db: Db;
  correctionId: ObjectId;
  status: CorrectionStatus;
  decisionReason: string;
  expectedVersion: number;
  actor: GovernanceActor;
  now?: Date;
}): Promise<
  { correctionId: ObjectId; version: number; status: CorrectionStatus; auditId: ObjectId }
> {
  assertNoUnknownKeys(input, DECIDE_KEYS, "UNKNOWN_CORRECTION_FIELD");
  const now = input.now ?? new Date();
  const status = assertStatus(input.status);
  if (!["IN_REVIEW", "NEEDS_INFORMATION", "APPROVED", "REJECTED"].includes(status)) {
    throw new GovernanceError("INVALID_CORRECTION_STATUS", "status is not a review decision");
  }
  await requireRoles(input.db, input.actor, REVIEW_ROLES, "actor may not decide corrections");
  const correction = await getCorrection(input.db, input.correctionId);
  if (TERMINAL_STATUSES.includes(correction.status as CorrectionStatus)) {
    throw new GovernanceError(
      "INVALID_CORRECTION_TRANSITION",
      "correction is already decided",
      409,
    );
  }
  if (
    status === "APPROVED" &&
    input.actor.type === "USER" &&
    input.actor.id?.equals(correction.submittedBy as ObjectId)
  ) {
    throw new GovernanceError(
      "SELF_APPROVAL",
      "the submitter cannot approve their own correction",
      403,
    );
  }
  const decisionReason = requireString(
    input.decisionReason,
    "DECISION_REASON_REQUIRED",
    "decisionReason is required",
    { maxLength: 2_000 },
  );
  const updated = await input.db.collection("corrections").updateOne(
    {
      _id: input.correctionId,
      version: input.expectedVersion,
      status: { $nin: TERMINAL_STATUSES },
    },
    {
      $set: {
        status,
        "review.reviewedBy": input.actor.id,
        "review.reviewedAt": now,
        "review.decisionReason": decisionReason,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new GovernanceError("VERSION_CONFLICT", "correction version did not match", 409);
  }
  const auditId = await appendAuditEvent(input.db, {
    action: "CORRECTION_REVIEWED",
    target: { type: "CORRECTION", id: input.correctionId },
    actor: input.actor,
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    beforeSummary: { status: String(correction.status) },
    afterSummary: {
      status,
      ...(input.actor.id ? { reviewedBy: input.actor.id.toString() } : {}),
      decision: status,
    },
    changedPaths: ["status", "review.reviewedBy", "review.reviewedAt", "review.decisionReason"],
    now,
  });
  return { correctionId: input.correctionId, version: input.expectedVersion + 1, status, auditId };
}

export async function withdrawCorrection(input: {
  db: Db;
  correctionId: ObjectId;
  expectedVersion: number;
  actor: GovernanceActor;
  now?: Date;
}): Promise<
  { correctionId: ObjectId; version: number; status: CorrectionStatus; auditId: ObjectId }
> {
  assertNoUnknownKeys(input, WITHDRAW_KEYS, "UNKNOWN_CORRECTION_FIELD");
  const now = input.now ?? new Date();
  const loaded = await loadActor(input.db, input.actor);
  if (loaded.type !== "USER" || !loaded.id) {
    throw new GovernanceError("FORBIDDEN", "withdrawal requires a user actor", 403);
  }
  const correction = await getCorrection(input.db, input.correctionId);
  if (!loaded.id.equals(correction.submittedBy as ObjectId)) {
    throw new GovernanceError("FORBIDDEN", "only the submitter may withdraw", 403);
  }
  if (TERMINAL_STATUSES.includes(correction.status as CorrectionStatus)) {
    throw new GovernanceError(
      "INVALID_CORRECTION_TRANSITION",
      "correction is already decided",
      409,
    );
  }
  const updated = await input.db.collection("corrections").updateOne(
    {
      _id: input.correctionId,
      version: input.expectedVersion,
      status: { $nin: TERMINAL_STATUSES },
    },
    {
      $set: { status: "WITHDRAWN", updatedAt: now, updatedBy: loaded.id },
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new GovernanceError("VERSION_CONFLICT", "correction version did not match", 409);
  }
  const auditId = await appendAuditEvent(input.db, {
    action: "CORRECTION_REVIEWED",
    target: { type: "CORRECTION", id: input.correctionId },
    actor: input.actor,
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    beforeSummary: { status: String(correction.status) },
    afterSummary: { status: "WITHDRAWN" },
    changedPaths: ["status"],
    now,
  });
  return {
    correctionId: input.correctionId,
    version: input.expectedVersion + 1,
    status: "WITHDRAWN",
    auditId,
  };
}

function applicationResult(value: unknown): CorrectionApplicationResult | undefined {
  return typeof value === "string" &&
      (CORRECTION_APPLICATION_RESULTS as readonly string[]).includes(value)
    ? value as CorrectionApplicationResult
    : undefined;
}

async function recordFailure(input: {
  db: Db;
  correction: CorrectionRecord;
  expectedVersion: number;
  expectedTargetVersion: number;
  idempotencyKey: string;
  result: CorrectionApplicationResult;
  failureReason: string;
  operation?: CorrectionOperation;
  fieldKey?: string;
  actor: GovernanceActor;
  now: Date;
}): Promise<number> {
  const application = {
    appliedAt: input.now,
    ...(input.actor.id ? { appliedBy: input.actor.id } : {}),
    targetVersionBefore: input.expectedTargetVersion,
    targetVersionAfter: input.expectedTargetVersion,
    result: input.result,
    failureReason: input.failureReason,
    idempotencyKey: input.idempotencyKey,
  };
  const updated = await input.db.collection("corrections").updateOne(
    { _id: input.correction._id, version: input.expectedVersion, status: "APPROVED" },
    {
      $set: {
        application,
        updatedAt: input.now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) return input.expectedVersion;
  await appendAuditEvent(input.db, {
    action: "CORRECTION_APPLIED",
    target: input.correction.target
      ? {
        type: (input.correction.target as CorrectionTargetRef).type,
        id: (input.correction.target as CorrectionTargetRef).id,
      }
      : { type: "CORRECTION", id: input.correction._id },
    actor: input.actor,
    targetVersionBefore: input.expectedTargetVersion,
    targetVersionAfter: input.expectedTargetVersion,
    afterSummary: {
      result: input.result,
      ...(input.fieldKey ? { fieldKey: input.fieldKey } : {}),
      ...(input.operation ? { operation: input.operation } : {}),
    },
    changedPaths: [],
    now: input.now,
  });
  return input.expectedVersion + 1;
}

export type ApplyCorrectionResult = {
  correctionId: ObjectId;
  result: CorrectionApplicationResult;
  idempotentReplay: boolean;
  correctionVersion: number;
  targetVersionBefore: number;
  targetVersionAfter: number;
  notice?: PublicCorrectionNotice;
};

export async function applyCorrection(input: {
  db: Db;
  client: MongoClient;
  correctionId: ObjectId;
  expectedVersion: number;
  expectedTargetVersion: number;
  idempotencyKey: string;
  actor: GovernanceActor;
  now?: Date;
  afterTargetWrite?: () => void;
}): Promise<ApplyCorrectionResult> {
  assertNoUnknownKeys(input, APPLY_KEYS, "UNKNOWN_CORRECTION_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, REVIEW_ROLES, "actor may not apply corrections");
  const idempotencyKey = requireString(
    input.idempotencyKey,
    "IDEMPOTENCY_KEY_REQUIRED",
    "idempotencyKey is required",
    { maxLength: 200 },
  );
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new GovernanceError("INVALID_CORRECTION_VERSION", "expectedVersion is invalid");
  }
  if (!Number.isSafeInteger(input.expectedTargetVersion) || input.expectedTargetVersion < 1) {
    throw new GovernanceError("INVALID_TARGET_VERSION", "expectedTargetVersion is invalid");
  }

  const existingKey = await input.db.collection("corrections").findOne({
    "application.idempotencyKey": idempotencyKey,
  });
  if (existingKey) {
    if (!(existingKey._id as ObjectId).equals(input.correctionId)) {
      throw new GovernanceError(
        "IDEMPOTENCY_KEY_CONFLICT",
        "idempotency key belongs to another correction",
        409,
      );
    }
    const application = existingKey.application as Record<string, unknown>;
    return {
      correctionId: input.correctionId,
      result: applicationResult(application.result) ?? "FAILED",
      idempotentReplay: true,
      correctionVersion: versionOf(existingKey),
      targetVersionBefore: Number(application.targetVersionBefore ?? 0),
      targetVersionAfter: Number(application.targetVersionAfter ?? 0),
    };
  }

  const correction = await getCorrection(input.db, input.correctionId);
  if (
    correction.application !== undefined &&
    applicationResult((correction.application as Record<string, unknown>).result) !== "FAILED"
  ) {
    throw new GovernanceError("ALREADY_APPLIED", "correction has already been applied", 409);
  }
  if (correction.status !== "APPROVED") {
    throw new GovernanceError(
      "INVALID_CORRECTION_TRANSITION",
      "correction must be APPROVED before application",
      409,
    );
  }
  const target = correction.target as CorrectionTargetRef | undefined;
  if (!target) {
    const correctionVersion = await recordFailure({
      db: input.db,
      correction,
      expectedVersion: input.expectedVersion,
      expectedTargetVersion: input.expectedTargetVersion,
      idempotencyKey,
      result: "NOT_APPLICABLE",
      failureReason: "targetless correction requires manual handling",
      actor: input.actor,
      now,
    });
    return {
      correctionId: input.correctionId,
      result: "NOT_APPLICABLE",
      idempotentReplay: false,
      correctionVersion,
      targetVersionBefore: input.expectedTargetVersion,
      targetVersionAfter: input.expectedTargetVersion,
    };
  }
  const proposal = correction.proposedChange === undefined
    ? undefined
    : validateCorrectionProposal(target.type, correction.proposedChange);
  if (!proposal) {
    const correctionVersion = await recordFailure({
      db: input.db,
      correction,
      expectedVersion: input.expectedVersion,
      expectedTargetVersion: input.expectedTargetVersion,
      idempotencyKey,
      result: "NOT_APPLICABLE",
      failureReason: "correction has no automated change",
      actor: input.actor,
      now,
    });
    return {
      correctionId: input.correctionId,
      result: "NOT_APPLICABLE",
      idempotentReplay: false,
      correctionVersion,
      targetVersionBefore: input.expectedTargetVersion,
      targetVersionAfter: input.expectedTargetVersion,
    };
  }

  const collection = collectionFor(target.type);
  let result: CorrectionApplicationResult = "FAILED";
  let correctionVersion = input.expectedVersion;
  let targetVersionBefore = input.expectedTargetVersion;
  let targetVersionAfter = input.expectedTargetVersion;
  let notice: PublicCorrectionNotice | undefined;
  let versionConflict = false;
  let failureMessage = "";

  const session = input.client.startSession();
  try {
    await session.withTransaction(async () => {
      const currentCorrection = await input.db.collection("corrections").findOne(
        { _id: input.correctionId },
        { session },
      ) as CorrectionRecord | null;
      if (!currentCorrection) {
        throw new GovernanceError("NOT_FOUND", "correction does not exist", 404);
      }
      if (versionOf(currentCorrection) !== input.expectedVersion) {
        throw new GovernanceError("VERSION_CONFLICT", "correction version did not match", 409);
      }
      if (
        currentCorrection.application !== undefined &&
        applicationResult((currentCorrection.application as Record<string, unknown>).result) !==
          "FAILED"
      ) {
        throw new GovernanceError("ALREADY_APPLIED", "correction has already been applied", 409);
      }
      if (currentCorrection.status !== "APPROVED") {
        throw new GovernanceError(
          "INVALID_CORRECTION_TRANSITION",
          "correction must be APPROVED before application",
          409,
        );
      }
      const targetDoc = await input.db.collection(collection).findOne(
        { _id: target.id },
        { session },
      ) as Record<string, unknown> | null;
      if (!targetDoc) {
        throw new GovernanceError("NOT_FOUND", "correction target does not exist", 404);
      }
      targetVersionBefore = versionOf(targetDoc);
      targetVersionAfter = targetVersionBefore;
      if (targetVersionBefore !== input.expectedTargetVersion) {
        versionConflict = true;
        failureMessage = "target version did not match";
        throw new GovernanceError("VERSION_CONFLICT", "target version did not match", 409);
      }

      const current = currentValueForProposal(targetDoc, proposal);
      const noOp = proposal.operation === "UNSET"
        ? current === undefined || current === null
        : current === proposal.proposedValue;
      const patch = buildCorrectionPatch({
        proposal,
        now,
        actorId: input.actor.id,
      });
      if (noOp) {
        result = "NOT_APPLICABLE";
      } else {
        const update: Record<string, unknown> = {
          ...(Object.keys(patch.set).length ? { $set: patch.set } : {}),
          ...(Object.keys(patch.unset).length ? { $unset: patch.unset } : {}),
          $inc: { version: 1 },
        };
        const updated = await input.db.collection(collection).updateOne(
          { _id: target.id, version: input.expectedTargetVersion },
          update,
          { session },
        );
        if (updated.modifiedCount !== 1) {
          versionConflict = true;
          failureMessage = "target version did not match";
          throw new GovernanceError("VERSION_CONFLICT", "target version did not match", 409);
        }
        targetVersionAfter = input.expectedTargetVersion + 1;
        result = "APPLIED";
        input.afterTargetWrite?.();
      }

      const application = {
        appliedAt: now,
        ...(input.actor.id ? { appliedBy: input.actor.id } : {}),
        targetVersionBefore,
        targetVersionAfter,
        result,
        ...(failureMessage ? { failureReason: failureMessage } : {}),
        idempotencyKey,
      };
      const correctionUpdate = await input.db.collection("corrections").updateOne(
        {
          _id: input.correctionId,
          version: input.expectedVersion,
          status: "APPROVED",
          $or: [{ application: { $exists: false } }, { "application.result": "FAILED" }],
        },
        {
          $set: {
            application,
            updatedAt: now,
            ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
          },
          $inc: { version: 1 },
        },
        { session },
      );
      if (correctionUpdate.modifiedCount !== 1) {
        throw new GovernanceError("ALREADY_APPLIED", "correction was applied concurrently", 409);
      }
      correctionVersion = input.expectedVersion + 1;
      const correctionAuditId = await appendAuditEvent(input.db, {
        action: "CORRECTION_APPLIED",
        target: { type: target.type, id: target.id },
        actor: input.actor,
        targetVersionBefore,
        targetVersionAfter,
        afterSummary: {
          result,
          fieldKey: proposal.fieldKey,
          operation: proposal.operation,
        },
        changedPaths: patch.changedPaths,
        correlationId: `correction:${input.correctionId}`,
        now,
        session,
      });

      if (result === "APPLIED" && (target.type === "CLAIM" || target.type === "RELATIONSHIP")) {
        const publication = targetDoc.publication as Record<string, unknown> | undefined;
        if (publication?.status === "PUBLISHED" && proposal.fieldKey === "publicWording") {
          notice = {
            correctedAt: now,
            reason: String(correction.reason),
            previousWording: String(targetDoc.publicWording ?? ""),
            auditEventId: correctionAuditId,
            correctionId: input.correctionId,
            target,
            action: "PUBLIC_WORDING_CHANGED",
            fieldKey: proposal.fieldKey,
          };
        }
      }
    });
  } catch (error) {
    if (versionConflict) {
      const recorded = await recordFailure({
        db: input.db,
        correction,
        expectedVersion: input.expectedVersion,
        expectedTargetVersion: targetVersionBefore,
        idempotencyKey,
        result: "FAILED",
        failureReason: failureMessage,
        operation: proposal.operation,
        fieldKey: proposal.fieldKey,
        actor: input.actor,
        now,
      });
      throw new GovernanceError(
        "VERSION_CONFLICT",
        "target version did not match",
        409,
        { correctionVersion: recorded },
      );
    }
    if (error instanceof GovernanceError) throw error;
    throw new GovernanceError(
      "INJECTED_FAILURE",
      "application transaction aborted",
      500,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    await session.endSession();
  }

  if (notice) {
    await invalidatePublicProjections({
      db: input.db,
      targetType: notice.target.type as "CLAIM" | "RELATIONSHIP",
      targetId: notice.target.id,
      reason: "correction applied",
      now,
    });
  }
  return {
    correctionId: input.correctionId,
    result,
    idempotentReplay: false,
    correctionVersion,
    targetVersionBefore,
    targetVersionAfter,
    ...(notice ? { notice } : {}),
  };
}

function collectionFor(type: CorrectionTargetType): string {
  switch (type) {
    case "PRODUCT":
      return "products";
    case "BRAND":
      return "brands";
    case "ORGANIZATION":
      return "organizations";
    case "RELATIONSHIP":
      return "relationships";
    case "CLAIM":
      return "claims";
    case "SOURCE":
      return "sources";
    case "SOURCE_SNAPSHOT":
      return "source_snapshots";
  }
}
