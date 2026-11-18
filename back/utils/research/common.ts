// Shared research-service plumbing for Plan 05.
//
// Findings are written through one authorized, version-checked, audited path.
// Audit summaries stay flat; no service accepts a collection/model name.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { HARD_CAPS, type HardCapKey } from "../domain/constants.ts";
import { CapExceededError } from "../domain/caps.ts";

export type ResearchActor = {
  type: "USER" | "SYSTEM" | "SERVICE";
  id?: ObjectId;
};

export type FindingType = "RELATIONSHIP" | "CLAIM";
export type FindingTarget = { type: FindingType; id: ObjectId };

export const FINDING_COLLECTION = {
  RELATIONSHIP: "relationships",
  CLAIM: "claims",
} as const;

export const EDIT_ROLES = ["RESEARCHER", "RESEARCH_REVIEWER", "MODERATOR", "ADMIN"] as const;
export const ASSESS_ROLES = [
  "RESEARCHER",
  "RESEARCH_REVIEWER",
  "LEGAL_REVIEWER",
  "MODERATOR",
  "ADMIN",
] as const;
export const REVIEW_ROLES = [
  "RESEARCH_REVIEWER",
  "LEGAL_REVIEWER",
  "MODERATOR",
  "ADMIN",
] as const;
export const PUBLISH_ROLES = ["MODERATOR", "ADMIN"] as const;
export const LEGAL_ROLES = ["LEGAL_REVIEWER", "ADMIN"] as const;
export const ADMIN_ROLES = ["ADMIN"] as const;

export class ResearchError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}

export type ActorWithRoles = ResearchActor & { roles: string[] };

export async function loadActor(db: Db, actor: ResearchActor): Promise<ActorWithRoles> {
  if (actor.type !== "USER") return { ...actor, roles: [] };
  if (!actor.id) throw new ResearchError("FORBIDDEN", "user actor requires an id", 403);
  const user = await db.collection("users").findOne({ _id: actor.id });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new ResearchError("FORBIDDEN", "actor is not an active user", 403);
  }
  const roles = Array.isArray(user.roles) ? user.roles.map(String) : [];
  return { ...actor, roles };
}

export function hasAnyRole(actor: ActorWithRoles, roles: readonly string[]): boolean {
  return roles.some((role) => actor.roles.includes(role));
}

export async function requireRoles(
  db: Db,
  actor: ResearchActor,
  roles: readonly string[],
  message: string,
): Promise<ActorWithRoles> {
  const loaded = await loadActor(db, actor);
  if (loaded.type === "USER" && !hasAnyRole(loaded, roles)) {
    throw new ResearchError("FORBIDDEN", message, 403);
  }
  return loaded;
}

export function actorId(actor: ResearchActor): ObjectId | undefined {
  return actor.id;
}

export async function getFinding(
  db: Db,
  target: FindingTarget,
): Promise<Record<string, unknown> & { _id: ObjectId }> {
  if (!(target.type in FINDING_COLLECTION)) {
    throw new ResearchError("UNKNOWN_FINDING_TYPE", "unknown finding type");
  }
  const doc = await db.collection(FINDING_COLLECTION[target.type]).findOne({ _id: target.id });
  if (!doc) throw new ResearchError("NOT_FOUND", "finding does not exist", 404);
  return doc as Record<string, unknown> & { _id: ObjectId };
}

export async function appendAudit(
  db: Db,
  input: {
    action: string;
    target: FindingTarget;
    actor: ResearchActor;
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

export function assertCap(path: HardCapKey, actual: number): void {
  if (actual > HARD_CAPS[path]) {
    throw new CapExceededError("CAP_EXCEEDED", path, HARD_CAPS[path], actual);
  }
}

export function addRevisionPreview(
  existing: unknown,
  input: {
    version: number;
    changedAt: Date;
    changedBy?: ObjectId;
    reason: string;
    changedFields: string[];
  },
): Record<string, unknown>[] {
  const previews = Array.isArray(existing)
    ? existing.filter((item) => item && typeof item === "object") as Record<string, unknown>[]
    : [];
  const next = [{
    version: input.version,
    changedAt: input.changedAt,
    ...(input.changedBy ? { changedBy: input.changedBy } : {}),
    reason: input.reason,
    changedFields: input.changedFields,
  }, ...previews];
  return next.slice(0, HARD_CAPS.recentRevisionPreview);
}

export function requireString(value: unknown, code: string, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ResearchError(code, message);
  }
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
    throw new ResearchError(code, `${path} must be an object`);
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowed.includes(key)) {
      throw new ResearchError(code, `${path}.${key} is not allowed`, 422, {
        path: `${path}.${key}`,
      });
    }
  }
}

export function versionAfter(doc: Record<string, unknown>): number {
  return Number(doc.version ?? 0);
}
