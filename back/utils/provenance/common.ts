// Shared provenance-service plumbing for Plan 06.
//
// Bytes live outside MongoDB. Every material write is authorized, version-safe,
// and audited. Audit summaries contain no object keys, URLs with credentials,
// or private personal data.
import type { Db } from "lesan";
import { ObjectId } from "lesan";

export type ProvenanceActor = {
  type: "USER" | "SYSTEM" | "SERVICE";
  id?: ObjectId;
};

export type AuditTarget = {
  type:
    | "SOURCE"
    | "SOURCE_SNAPSHOT"
    | "ASSET"
    | "RELATIONSHIP"
    | "CLAIM";
  id: ObjectId;
};

export const EDIT_ROLES = ["RESEARCHER", "RESEARCH_REVIEWER", "MODERATOR", "ADMIN"] as const;
export const REVIEW_ROLES = [
  "RESEARCH_REVIEWER",
  "LEGAL_REVIEWER",
  "MODERATOR",
  "ADMIN",
] as const;
export const UPLOAD_ROLES = [
  "CONTRIBUTOR",
  "RESEARCHER",
  "RESEARCH_REVIEWER",
  "MODERATOR",
  "ADMIN",
] as const;

export class ProvenanceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProvenanceError";
  }
}

export type ActorWithRoles = ProvenanceActor & { roles: string[] };

export async function loadActor(db: Db, actor: ProvenanceActor): Promise<ActorWithRoles> {
  if (actor.type !== "USER") return { ...actor, roles: [] };
  if (!actor.id) throw new ProvenanceError("FORBIDDEN", "user actor requires an id", 403);
  const user = await db.collection("users").findOne({ _id: actor.id });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new ProvenanceError("FORBIDDEN", "actor is not an active user", 403);
  }
  const roles = Array.isArray(user.roles) ? user.roles.map(String) : [];
  return { ...actor, roles };
}

export function hasAnyRole(actor: ActorWithRoles, roles: readonly string[]): boolean {
  return roles.some((role) => actor.roles.includes(role));
}

export async function requireRoles(
  db: Db,
  actor: ProvenanceActor,
  roles: readonly string[],
  message: string,
): Promise<ActorWithRoles> {
  const loaded = await loadActor(db, actor);
  if (loaded.type === "USER" && !hasAnyRole(loaded, roles)) {
    throw new ProvenanceError("FORBIDDEN", message, 403);
  }
  return loaded;
}

export function requireString(value: unknown, code: string, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProvenanceError(code, message);
  }
  return value;
}

export function optionalString(value: unknown, code: string, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ProvenanceError(code, `${path} must be a string`);
  return value;
}

export function assertNoUnknownKeys(
  value: unknown,
  allowed: readonly string[],
  code: string,
  path = "input",
): void {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ProvenanceError(code, `${path} must be an object`);
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowed.includes(key)) {
      throw new ProvenanceError(code, `${path}.${key} is not allowed`, 422, {
        path: `${path}.${key}`,
      });
    }
  }
}

export function parseObjectId(value: unknown, code: string, path: string): ObjectId {
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)) return new ObjectId(value);
  throw new ProvenanceError(code, `${path} must be an ObjectId`, 404);
}

export function parseDate(value: unknown, code: string, path: string): Date | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  throw new ProvenanceError(code, `${path} must be a date`);
}

export async function appendAudit(
  db: Db,
  input: {
    action: string;
    target: AuditTarget;
    actor: ProvenanceActor;
    targetVersionBefore?: number;
    targetVersionAfter?: number;
    beforeSummary?: Record<string, string | number | boolean | null>;
    afterSummary?: Record<string, string | number | boolean | null>;
    changedPaths?: string[];
    reason?: string;
    now: Date;
    requestId?: string;
    correlationId?: string;
    idempotencyKey?: string;
  },
): Promise<ObjectId> {
  const _id = new ObjectId();
  await db.collection("audit_events").insertOne({
    _id,
    eventSchemaVersion: 1,
    actor: input.actor.id
      ? { type: input.actor.type, id: input.actor.id }
      : { type: input.actor.type },
    action: input.action,
    target: { type: input.target.type, id: input.target.id },
    ...(input.targetVersionBefore === undefined
      ? {}
      : { targetVersionBefore: input.targetVersionBefore }),
    ...(input.targetVersionAfter === undefined
      ? {}
      : { targetVersionAfter: input.targetVersionAfter }),
    beforeSummary: input.beforeSummary ?? {},
    afterSummary: input.afterSummary ?? {},
    changedPaths: input.changedPaths ?? [],
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
    occurredAt: input.now,
  });
  return _id;
}

export async function getDocument(
  db: Db,
  collection: string,
  id: ObjectId,
  label: string,
): Promise<Record<string, unknown> & { _id: ObjectId }> {
  const doc = await db.collection(collection).findOne({ _id: id });
  if (!doc) throw new ProvenanceError("NOT_FOUND", `${label} does not exist`, 404);
  return doc as Record<string, unknown> & { _id: ObjectId };
}
