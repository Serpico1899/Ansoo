// Shared governance-service plumbing for Plan 07.
//
// Governance writes are authorized, version-checked where relevant, and audited.
// Error codes are stable so the API layer can map them without parsing text.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import type { AuditAction } from "../domain/constants.ts";

export type GovernanceActor = {
  type: "USER" | "SYSTEM" | "SERVICE";
  id?: ObjectId;
};

export type ActorWithRoles = GovernanceActor & { roles: string[] };

export const MODERATION_ROLES = ["MODERATOR", "ADMIN"] as const;
export const REVIEW_ROLES = [
  "RESEARCH_REVIEWER",
  "LEGAL_REVIEWER",
  "MODERATOR",
  "ADMIN",
] as const;
export const ADMIN_ROLES = ["ADMIN"] as const;
export const CONTRIBUTOR_ROLES = [
  "CONTRIBUTOR",
  "RESEARCHER",
  "RESEARCH_REVIEWER",
  "LEGAL_REVIEWER",
  "MODERATOR",
  "ADMIN",
] as const;

export class GovernanceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GovernanceError";
  }
}

export class RateLimitError extends GovernanceError {
  constructor(
    message: string,
    readonly path: string,
    readonly cap: number,
    readonly actual: number,
    readonly retryAfterSeconds = 86_400,
  ) {
    super("RATE_LIMITED", message, 429, {
      path,
      cap,
      actual,
      retryAfterSeconds,
      error: {
        code: "RATE_LIMITED",
        message,
        path,
        cap,
        actual,
        retryAfterSeconds,
      },
    });
    this.name = "RateLimitError";
  }
}

export async function loadActor(
  db: Db,
  actor: GovernanceActor,
): Promise<ActorWithRoles> {
  if (actor.type !== "USER") return { ...actor, roles: [] };
  if (!actor.id) throw new GovernanceError("FORBIDDEN", "user actor requires an id", 403);
  const user = await db.collection("users").findOne({ _id: actor.id });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new GovernanceError("FORBIDDEN", "actor is not an active user", 403);
  }
  return {
    ...actor,
    roles: Array.isArray(user.roles) ? user.roles.map(String) : [],
  };
}

export function hasAnyRole(actor: ActorWithRoles, roles: readonly string[]): boolean {
  return roles.some((role) => actor.roles.includes(role));
}

export async function requireRoles(
  db: Db,
  actor: GovernanceActor,
  roles: readonly string[],
  message: string,
): Promise<ActorWithRoles> {
  const loaded = await loadActor(db, actor);
  if (loaded.type === "USER" && !hasAnyRole(loaded, roles)) {
    throw new GovernanceError("FORBIDDEN", message, 403);
  }
  return loaded;
}

export function requireString(
  value: unknown,
  code: string,
  message: string,
  options: { maxLength?: number; minLength?: number } = {},
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GovernanceError(code, message);
  }
  const trimmed = value.trim();
  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new GovernanceError(code, message);
  }
  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new GovernanceError("CAP_EXCEEDED", `${message} is too long`, 422, {
      path: "string",
      cap: options.maxLength,
      actual: trimmed.length,
    });
  }
  return trimmed;
}

export function optionalString(
  value: unknown,
  code: string,
  path: string,
  maxLength = 4_000,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new GovernanceError(code, `${path} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new GovernanceError("CAP_EXCEEDED", `${path} is too long`, 422, {
      path,
      cap: maxLength,
      actual: trimmed.length,
    });
  }
  return trimmed;
}

export function assertNoUnknownKeys(
  value: unknown,
  allowed: readonly string[],
  code: string,
  path = "input",
): void {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GovernanceError(code, `${path} must be an object`);
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowed.includes(key)) {
      throw new GovernanceError(code, `${path}.${key} is not allowed`, 422, {
        path: `${path}.${key}`,
      });
    }
  }
}

export function parseObjectId(value: unknown, code: string, path: string): ObjectId {
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)) {
    return new ObjectId(value);
  }
  throw new GovernanceError(code, `${path} must be an ObjectId`, 422);
}

export function parseOptionalObjectId(
  value: unknown,
  code: string,
  path: string,
): ObjectId | undefined {
  if (value === undefined || value === null) return undefined;
  return parseObjectId(value, code, path);
}

export function parseOptionalDate(
  value: unknown,
  code: string,
  path: string,
): Date | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  throw new GovernanceError(code, `${path} must be a valid date`);
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function versionOf(doc: Record<string, unknown>): number {
  return Number(doc.version ?? 0);
}

export type AuditInput = {
  db: Db;
  action: AuditAction;
  target: { type: string; id: ObjectId };
  actor: GovernanceActor;
  targetVersionBefore?: number;
  targetVersionAfter?: number;
  beforeSummary?: Record<string, string | number | boolean | null>;
  afterSummary?: Record<string, string | number | boolean | null>;
  changedPaths?: string[];
  reason?: string;
  requestId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  now?: Date;
};
