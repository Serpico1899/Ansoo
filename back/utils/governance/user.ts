// User roles, trust, status, and privacy boundaries. Plan 07 / spec 9.2.
//
// PII lives only in users. Roles are authorization; trustLevel is not. Audit
// rows keep only actor.id, so account deletion never mutates the audit stream.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import {
  ACCOUNT_STATUSES,
  type AccountStatus,
  TRUST_LEVELS,
  type TrustLevel,
  USER_ROLES,
  type UserRole,
} from "../domain/constants.ts";
import { appendAuditEvent } from "./audit.ts";
import {
  ADMIN_ROLES,
  assertNoUnknownKeys,
  type GovernanceActor,
  GovernanceError,
  hasAnyRole,
  loadActor,
  MODERATION_ROLES,
  requireRoles,
  versionOf,
} from "./common.ts";

type UserRecord = Record<string, unknown> & { _id: ObjectId };

const ROLE_KEYS = ["db", "userId", "roles", "expectedVersion", "actor", "now"] as const;
const TRUST_KEYS = ["db", "userId", "trustLevel", "expectedVersion", "actor", "now"] as const;
const STATUS_KEYS = ["db", "userId", "accountStatus", "expectedVersion", "actor", "now"] as const;
const PURGE_KEYS = ["db", "userId", "expectedVersion", "actor", "now"] as const;

async function getUser(db: Db, userId: ObjectId): Promise<UserRecord> {
  const doc = await db.collection("users").findOne({ _id: userId });
  if (!doc) throw new GovernanceError("NOT_FOUND", "user does not exist", 404);
  return doc as UserRecord;
}

function validateRoles(value: unknown): UserRole[] {
  if (!Array.isArray(value)) {
    throw new GovernanceError("INVALID_USER_ROLE", "roles must be an array");
  }
  const roles: UserRole[] = [];
  const seen = new Set<string>();
  for (const role of value) {
    if (typeof role !== "string" || !(USER_ROLES as readonly string[]).includes(role)) {
      throw new GovernanceError("INVALID_USER_ROLE", "unknown user role", 422, { role });
    }
    if (seen.has(role)) {
      throw new GovernanceError("DUPLICATE_ROLE", "roles must be unique", 422, { role });
    }
    seen.add(role);
    roles.push(role as UserRole);
  }
  return roles;
}

function validateTrustLevel(value: unknown): TrustLevel {
  if (typeof value !== "string" || !(TRUST_LEVELS as readonly string[]).includes(value)) {
    throw new GovernanceError("INVALID_TRUST_LEVEL", "unknown trust level");
  }
  return value as TrustLevel;
}

function validateAccountStatus(value: unknown): AccountStatus {
  if (typeof value !== "string" || !(ACCOUNT_STATUSES as readonly string[]).includes(value)) {
    throw new GovernanceError("INVALID_ACCOUNT_STATUS", "unknown account status");
  }
  return value as AccountStatus;
}

async function updateVersioned(
  db: Db,
  userId: ObjectId,
  expectedVersion: number,
  update: Record<string, unknown>,
  now: Date,
  actor: GovernanceActor,
): Promise<UserRecord> {
  const updated = await db.collection("users").updateOne(
    { _id: userId, version: expectedVersion },
    {
      ...update,
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new GovernanceError("VERSION_CONFLICT", "user version did not match", 409);
  }
  return {
    ...(await getUser(db, userId)),
    updatedAt: now,
    ...(actor.id ? { updatedBy: actor.id } : {}),
    version: expectedVersion + 1,
  } as UserRecord;
}

export async function setUserRoles(input: {
  db: Db;
  userId: ObjectId;
  roles: UserRole[];
  expectedVersion: number;
  actor: GovernanceActor;
  now?: Date;
}): Promise<{ userId: ObjectId; roles: UserRole[]; version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, ROLE_KEYS, "UNKNOWN_USER_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, ADMIN_ROLES, "actor may not change user roles");
  const roles = validateRoles(input.roles);
  const user = await getUser(input.db, input.userId);
  if (user.accountStatus === "CLOSED") {
    throw new GovernanceError("USER_CLOSED", "closed users cannot receive roles", 409);
  }
  await updateVersioned(
    input.db,
    input.userId,
    input.expectedVersion,
    {
      $set: {
        roles,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
    },
    now,
    input.actor,
  );
  const auditId = await appendAuditEvent(input.db, {
    action: "USER_ROLES_CHANGED",
    target: { type: "USER", id: input.userId },
    actor: input.actor,
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    afterSummary: { roleCount: roles.length, roles: roles.join(",") },
    changedPaths: ["roles"],
    reason: "role assignment",
    now,
  });
  return { userId: input.userId, roles, version: input.expectedVersion + 1, auditId };
}

export async function setUserTrustLevel(input: {
  db: Db;
  userId: ObjectId;
  trustLevel: TrustLevel;
  expectedVersion: number;
  actor: GovernanceActor;
  now?: Date;
}): Promise<{ userId: ObjectId; trustLevel: TrustLevel; version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, TRUST_KEYS, "UNKNOWN_USER_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, MODERATION_ROLES, "actor may not change trust levels");
  const trustLevel = validateTrustLevel(input.trustLevel);
  const user = await getUser(input.db, input.userId);
  if (user.accountStatus === "CLOSED") {
    throw new GovernanceError("USER_CLOSED", "closed users cannot change trust level", 409);
  }
  await updateVersioned(
    input.db,
    input.userId,
    input.expectedVersion,
    {
      $set: {
        trustLevel,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
    },
    now,
    input.actor,
  );
  const auditId = await appendAuditEvent(input.db, {
    action: "USER_TRUST_CHANGED",
    target: { type: "USER", id: input.userId },
    actor: input.actor,
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    afterSummary: { trustLevel },
    changedPaths: ["trustLevel"],
    reason: "trust level change",
    now,
  });
  return { userId: input.userId, trustLevel, version: input.expectedVersion + 1, auditId };
}

export async function setUserAccountStatus(input: {
  db: Db;
  userId: ObjectId;
  accountStatus: AccountStatus;
  expectedVersion: number;
  actor: GovernanceActor;
  now?: Date;
}): Promise<{
  userId: ObjectId;
  accountStatus: AccountStatus;
  version: number;
  auditId: ObjectId;
}> {
  assertNoUnknownKeys(input, STATUS_KEYS, "UNKNOWN_USER_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(
    input.db,
    input.actor,
    MODERATION_ROLES,
    "actor may not change account status",
  );
  const accountStatus = validateAccountStatus(input.accountStatus);
  await getUser(input.db, input.userId);
  await updateVersioned(
    input.db,
    input.userId,
    input.expectedVersion,
    {
      $set: {
        accountStatus,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
    },
    now,
    input.actor,
  );
  const auditId = await appendAuditEvent(input.db, {
    action: "USER_STATUS_CHANGED",
    target: { type: "USER", id: input.userId },
    actor: input.actor,
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    afterSummary: { accountStatus },
    changedPaths: ["accountStatus"],
    reason: "account status change",
    now,
  });
  return { userId: input.userId, accountStatus, version: input.expectedVersion + 1, auditId };
}

export async function purgeUserPii(input: {
  db: Db;
  userId: ObjectId;
  expectedVersion: number;
  actor: GovernanceActor;
  now?: Date;
}): Promise<
  { userId: ObjectId; accountStatus: AccountStatus; version: number; auditId: ObjectId }
> {
  assertNoUnknownKeys(input, PURGE_KEYS, "UNKNOWN_USER_FIELD");
  const now = input.now ?? new Date();
  const actor = await loadActor(input.db, input.actor);
  if (actor.type !== "USER" || !actor.id) {
    throw new GovernanceError("FORBIDDEN", "PII purge requires a user actor", 403);
  }
  if (!actor.id.equals(input.userId) && !hasAnyRole(actor, ADMIN_ROLES)) {
    throw new GovernanceError("FORBIDDEN", "only the account owner or an ADMIN may purge PII", 403);
  }
  const user = await getUser(input.db, input.userId);
  if (user.accountStatus === "CLOSED" && String(user.authSubject).startsWith("purged:")) {
    return {
      userId: input.userId,
      accountStatus: "CLOSED",
      version: versionOf(user),
      auditId: new ObjectId(),
    };
  }
  const updated = await input.db.collection("users").updateOne(
    { _id: input.userId, version: input.expectedVersion },
    {
      $set: {
        authProvider: "deleted",
        authSubject: `purged:${input.userId.toString()}`,
        roles: [],
        trustLevel: "NEW",
        accountStatus: "CLOSED",
        updatedAt: now,
        updatedBy: actor.id,
      },
      $unset: {
        email: "",
        emailNormalized: "",
        phone: "",
        displayName: "",
        preferredLocale: "",
        lastActiveAt: "",
      },
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new GovernanceError("VERSION_CONFLICT", "user version did not match", 409);
  }
  const auditId = await appendAuditEvent(input.db, {
    action: "USER_PII_PURGED",
    target: { type: "USER", id: input.userId },
    actor: input.actor,
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    afterSummary: { accountStatus: "CLOSED" },
    changedPaths: [
      "email",
      "emailNormalized",
      "phone",
      "displayName",
      "preferredLocale",
      "authSubject",
      "roles",
      "accountStatus",
    ],
    reason: "account deletion",
    now,
  });
  return {
    userId: input.userId,
    accountStatus: "CLOSED",
    version: input.expectedVersion + 1,
    auditId,
  };
}

export function publicUserView(doc: Record<string, unknown>): { _id: unknown } {
  return { _id: doc._id };
}
