// Append-only audit repository. Plan 07 / spec 9.3 (I09).
//
// There is deliberately no update or delete method. Every append validates a
// closed action, a registry-resolved target, a flat per-action summary, and
// redaction rules before the document reaches MongoDB.
import type { Db } from "lesan";
import { type ClientSession, ObjectId } from "lesan";
import { validateAuditEvent } from "../../models/auditEvent.ts";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_SUMMARY_FORBIDDEN_KEYS,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditTargetType,
  type EntityType,
} from "../domain/constants.ts";
import { createEntityRegistry, ReferenceError } from "../identity/registry.ts";
import {
  assertNoUnknownKeys,
  type AuditInput,
  type GovernanceActor,
  GovernanceError,
  parseOptionalDate,
  requireString,
  versionOf,
} from "./common.ts";

export type AuditSummary = Record<string, string | number | boolean | null>;

// Deny by default. Every closed action names the flat keys it may summarize.
export const AUDIT_SUMMARY_ALLOWLIST: Record<AuditAction, readonly string[]> = {
  ENTITY_CREATED: ["name", "lifecycle", "kind"],
  ENTITY_UPDATED: ["name", "lifecycle", "access", "canonicalKey", "publicWording", "claimType"],
  ENTITY_ARCHIVED: ["lifecycle", "name"],
  ENTITY_MERGED: ["lifecycle", "mergedIntoId", "version"],
  ENTITY_UNMERGED: ["lifecycle", "mergedIntoId"],
  IDENTIFIER_ADDED: ["scheme", "normalizedValue", "status"],
  IDENTIFIER_STATUS_CHANGED: ["scheme", "normalizedValue", "status"],
  BRAND_MAPPING_REVIEWED: ["status", "candidateBrandId", "verifiedBrandId"],
  BRAND_RELATION_CHANGED: ["status", "brandId"],
  RELATIONSHIP_CREATED: ["predicate", "subjectType", "objectType", "sensitivity", "overlap"],
  RELATIONSHIP_CLOSED: ["validTo", "recordLifecycle"],
  CLAIM_CREATED: ["claimType", "sensitivity", "aboutType"],
  REVIEW_STATUS_CHANGED: ["reviewStatus", "legalSignOff", "legalSignOffBy"],
  ASSESSMENT_RECORDED: ["outcome", "methodologyVersion", "publicWording"],
  PUBLICATION_GATE_EVALUATED: ["result", "failures", "gateVersion"],
  PUBLICATION_CHANGED: ["publicationStatus"],
  PUBLIC_WORDING_CHANGED: ["publicWording"],
  FINDING_RETRACTED: ["publicationStatus", "previousPublicationStatus"],
  GATE_WAIVER_GRANTED: ["check", "reason"],
  EVIDENCE_ADDED: ["evidenceCount", "stance"],
  EVIDENCE_REMOVED: ["evidenceCount", "stance"],
  EVIDENCE_REVIEWED: ["evidenceCount", "stance"],
  SOURCE_CREATED: [
    "sourceType",
    "access",
    "lifecycle",
    "publisherVerified",
    "attributionRequired",
    "licenseCode",
  ],
  SNAPSHOT_CREATED: [
    "hashAlgorithm",
    "captureMethod",
    "acquisitionTier",
    "lifecycle",
    "byteSize",
    "hasAsset",
  ],
  SNAPSHOT_SUPERSEDED: ["supersedesSnapshotId"],
  SNAPSHOT_REDACTED: ["method", "originalRetained", "contentHash"],
  SOLICITATION_SENT: ["solicitationCount", "channel", "outcome", "responseDeadline"],
  SOLICITATION_OUTCOME_RECORDED: ["outcome"],
  ORG_RESPONSE_ADDED: ["responseCount", "publicationStatus"],
  ORG_RESPONSE_PUBLICATION_CHANGED: ["publicationStatus"],
  ASSET_UPLOADED: ["mimeType", "byteSize", "processingStatus", "visibility", "exifStripped"],
  ASSET_SCAN_COMPLETED: ["processingStatus", "scanResult"],
  ASSET_PURGED: ["lifecycle", "byteSize", "previousLifecycle"],
  CORRECTION_SUBMITTED: ["submissionKind", "targetType", "floodSuspected"],
  CORRECTION_REVIEWED: ["status", "assignedTo", "reviewedBy", "decision"],
  CORRECTION_APPLIED: ["result", "fieldKey", "operation"],
  USER_ROLES_CHANGED: ["roleCount", "roles"],
  USER_TRUST_CHANGED: ["trustLevel"],
  USER_STATUS_CHANGED: ["accountStatus"],
  USER_PII_PURGED: ["accountStatus"],
};

const SECRET_PATTERNS: readonly RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/i,
  /\b(?:token|password|passwd|secret|api[_-]?key|authorization)\s*[:=]\s*\S+/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  /mongodb(?:\+srv)?:\/\/[^\s]+@/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/,
];

const LIST_KEYS = [
  "target",
  "actor",
  "action",
  "correlationId",
  "requestId",
  "from",
  "to",
  "limit",
] as const;

const APPEND_KEYS = [
  "action",
  "target",
  "actor",
  "targetVersionBefore",
  "targetVersionAfter",
  "beforeSummary",
  "afterSummary",
  "changedPaths",
  "reason",
  "requestId",
  "correlationId",
  "idempotencyKey",
  "now",
  "session",
] as const;

function isAuditAction(value: unknown): value is AuditAction {
  return typeof value === "string" && (AUDIT_ACTIONS as readonly string[]).includes(value);
}

function secretInString(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function assertNoSecret(value: string, path: string): void {
  if (secretInString(value)) {
    throw new GovernanceError(
      "AUDIT_SECRET_REDACTED",
      `${path} contains a value that looks like a secret or personal identifier`,
      422,
      { path },
    );
  }
}

export function assertAuditSummaryForAction(
  action: AuditAction,
  summary: unknown,
  field: string,
): void {
  if (summary === undefined) return;
  if (summary === null || typeof summary !== "object" || Array.isArray(summary)) {
    throw new GovernanceError("INVALID_AUDIT_SUMMARY", `${field} must be a flat object`);
  }
  const allowed = AUDIT_SUMMARY_ALLOWLIST[action];
  for (const [key, value] of Object.entries(summary as Record<string, unknown>)) {
    if ((AUDIT_SUMMARY_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      throw new GovernanceError(
        "AUDIT_SUMMARY_FORBIDDEN_KEY",
        `${field} must not contain ${key}`,
        422,
        { key },
      );
    }
    if (!allowed.includes(key)) {
      throw new GovernanceError(
        "AUDIT_SUMMARY_KEY_NOT_ALLOWED",
        `${field}.${key} is not allowlisted for ${action}`,
        422,
        { action, key },
      );
    }
    if (value === null) continue;
    if (typeof value === "string") {
      assertNoSecret(value, `${field}.${key}`);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") continue;
    throw new GovernanceError(
      "INVALID_AUDIT_SUMMARY",
      `${field}.${key} must be a primitive value`,
      422,
      { key },
    );
  }
}

function assertIdentifier(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  const text = requireString(value, `INVALID_${path.toUpperCase()}`, `${path} is required`, {
    maxLength: 200,
  });
  if (hasControlCharacter(text)) {
    throw new GovernanceError(
      `INVALID_${path.toUpperCase()}`,
      `${path} contains control characters`,
    );
  }
  return text;
}

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function validateVersion(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new GovernanceError("INVALID_AUDIT_VERSION", `${path} must be a non-negative integer`);
  }
  return Number(value);
}

async function validateTarget(
  db: Db,
  target: unknown,
): Promise<{ type: AuditTargetType; id: ObjectId }> {
  if (target === null || typeof target !== "object" || Array.isArray(target)) {
    throw new GovernanceError("INVALID_AUDIT_TARGET", "target must be an object");
  }
  const keys = Object.keys(target as Record<string, unknown>).sort();
  if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "type") {
    throw new GovernanceError("INVALID_AUDIT_TARGET", "target must contain exactly {type, id}");
  }
  const { type, id } = target as { type: unknown; id: unknown };
  if (typeof type !== "string" || !(AUDIT_TARGET_TYPES as readonly string[]).includes(type)) {
    throw new GovernanceError("UNKNOWN_TYPE", "unknown audit target type", 422);
  }
  const registry = createEntityRegistry(db);
  try {
    const resolved = await registry.resolve(
      "audit.target",
      { type: type as EntityType, id },
      { allowArchived: true, followMerges: false },
    );
    return { type: type as AuditTargetType, id: resolved.ref.id };
  } catch (error) {
    if (error instanceof ReferenceError) {
      throw new GovernanceError(error.code, error.message, error.status);
    }
    throw error;
  }
}

function validateActor(actor: unknown): GovernanceActor {
  if (actor === null || typeof actor !== "object" || Array.isArray(actor)) {
    throw new GovernanceError("INVALID_AUDIT_ACTOR", "actor must be an object");
  }
  const value = actor as { type?: unknown; id?: unknown };
  if (
    typeof value.type !== "string" ||
    !(AUDIT_ACTOR_TYPES as readonly string[]).includes(value.type)
  ) {
    throw new GovernanceError("INVALID_AUDIT_ACTOR", "unknown audit actor type");
  }
  if (value.id !== undefined) {
    if (!(value.id instanceof ObjectId)) {
      throw new GovernanceError("INVALID_AUDIT_ACTOR", "actor.id must be an ObjectId");
    }
    if (value.type !== "USER") {
      throw new GovernanceError("INVALID_AUDIT_ACTOR", "only USER actors may carry an id");
    }
  }
  if (value.type === "USER" && value.id === undefined) {
    throw new GovernanceError("INVALID_AUDIT_ACTOR", "USER actors require an id");
  }
  return {
    type: value.type as GovernanceActor["type"],
    ...(value.id ? { id: value.id } : {}),
  };
}

async function assertUserActorExists(db: Db, actor: GovernanceActor): Promise<void> {
  if (actor.type !== "USER" || !actor.id) return;
  const exists = await db.collection("users").countDocuments({ _id: actor.id }, { limit: 1 });
  if (exists !== 1) {
    throw new GovernanceError("NOT_FOUND", "audit actor does not exist", 404);
  }
}

export async function appendAuditEvent(
  db: Db,
  input: Omit<AuditInput, "db"> & { session?: ClientSession },
): Promise<ObjectId> {
  assertNoUnknownKeys(input, APPEND_KEYS, "UNKNOWN_AUDIT_FIELD");
  if (!isAuditAction(input.action)) {
    throw new GovernanceError("INVALID_AUDIT_ACTION", "unknown audit action");
  }
  const target = await validateTarget(db, input.target);
  const actor = validateActor(input.actor);
  await assertUserActorExists(db, actor);
  assertAuditSummaryForAction(input.action, input.beforeSummary, "beforeSummary");
  assertAuditSummaryForAction(input.action, input.afterSummary, "afterSummary");
  if (input.reason !== undefined) {
    assertNoSecret(
      requireString(input.reason, "INVALID_AUDIT_REASON", "reason is required", {
        maxLength: 2_000,
      }),
      "reason",
    );
  }
  const changedPaths = input.changedPaths ?? [];
  if (!Array.isArray(changedPaths) || changedPaths.length > 50) {
    throw new GovernanceError("INVALID_CHANGED_PATHS", "changedPaths must be a bounded array");
  }
  for (const path of changedPaths) {
    if (typeof path !== "string" || path.trim() === "" || path.length > 200 || path.includes("$")) {
      throw new GovernanceError("INVALID_CHANGED_PATHS", "changedPaths entries must be safe paths");
    }
  }
  const requestId = assertIdentifier(input.requestId, "requestId");
  const correlationId = assertIdentifier(input.correlationId, "correlationId");
  const idempotencyKey = assertIdentifier(input.idempotencyKey, "idempotencyKey");
  const now = input.now ?? new Date();
  const session = (input as { session?: ClientSession }).session;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new GovernanceError("INVALID_AUDIT_DATE", "occurredAt must be a valid Date");
  }

  const event = {
    _id: new ObjectId(),
    eventSchemaVersion: 1,
    actor: actor.id ? { type: actor.type, id: actor.id } : { type: actor.type },
    action: input.action,
    target: { type: target.type, id: target.id },
    ...(requestId === undefined ? {} : { requestId }),
    ...(correlationId === undefined ? {} : { correlationId }),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(validateVersion(input.targetVersionBefore, "targetVersionBefore") === undefined
      ? {}
      : { targetVersionBefore: input.targetVersionBefore }),
    ...(validateVersion(input.targetVersionAfter, "targetVersionAfter") === undefined
      ? {}
      : { targetVersionAfter: input.targetVersionAfter }),
    changedPaths,
    beforeSummary: input.beforeSummary ?? {},
    afterSummary: input.afterSummary ?? {},
    ...(input.reason === undefined ? {} : { reason: input.reason.trim() }),
    occurredAt: now,
  };
  validateAuditEvent(event);
  await db.collection("audit_events").insertOne(event, session ? { session } : {});
  return event._id;
}

export async function listAuditEvents(
  db: Db,
  query: {
    target?: { type: AuditTargetType; id: ObjectId };
    actor?: { type: GovernanceActor["type"]; id?: ObjectId };
    action?: AuditAction;
    correlationId?: string;
    requestId?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  } = {},
): Promise<Array<Record<string, unknown> & { _id: ObjectId }>> {
  assertNoUnknownKeys(query, LIST_KEYS, "UNKNOWN_AUDIT_QUERY");
  const filter: Record<string, unknown> = {};
  if (query.target !== undefined) {
    const target = await validateTarget(db, query.target);
    filter["target.type"] = target.type;
    filter["target.id"] = target.id;
  }
  if (query.actor !== undefined) {
    const actor = validateActor(query.actor);
    filter["actor.type"] = actor.type;
    if (actor.id) filter["actor.id"] = actor.id;
  }
  if (query.action !== undefined) {
    if (!isAuditAction(query.action)) {
      throw new GovernanceError("INVALID_AUDIT_ACTION", "unknown audit action");
    }
    filter.action = query.action;
  }
  const correlationId = assertIdentifier(query.correlationId, "correlationId");
  if (correlationId) filter.correlationId = correlationId;
  const requestId = assertIdentifier(query.requestId, "requestId");
  if (requestId) filter.requestId = requestId;
  const from = parseOptionalDate(query.from, "INVALID_AUDIT_QUERY", "from");
  const to = parseOptionalDate(query.to, "INVALID_AUDIT_QUERY", "to");
  if (from || to) {
    filter.occurredAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
  }
  const limit = query.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new GovernanceError("INVALID_AUDIT_QUERY", "limit must be an integer from 1 to 100");
  }
  return await db.collection("audit_events")
    .find(filter)
    .sort({ occurredAt: -1, _id: -1 })
    .limit(limit)
    .toArray() as Array<Record<string, unknown> & { _id: ObjectId }>;
}

// The only supported surface. No update, delete, replace, or bulk mutation.
export const auditRepository = Object.freeze({
  append: appendAuditEvent,
  list: listAuditEvents,
});

export function auditTargetVersion(doc: Record<string, unknown>): number {
  return versionOf(doc);
}
