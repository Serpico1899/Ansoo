// Identity creation and pure name updates. Spec 5.1-5.3 and 13.1.
//
// Names are normalized on write. Identifiers are strings and never inferred.
// Creation and rename write AuditEvents; there is no automatic merge here.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { assertHardCap, assertUniqueBy } from "../domain/caps.ts";
import {
  ENTITY_COLLECTION,
  type EntityType,
  IDENTIFIER_STATUSES,
  ORGANIZATION_KINDS,
  type OrganizationKind,
} from "../domain/constants.ts";
import { normalizeProductIdentifier } from "./identifier.ts";
import { matchKey, normalizeName } from "./normalize.ts";
import { createEntityRegistry } from "./registry.ts";

export type IdentityActor = {
  type: "USER" | "SYSTEM" | "SERVICE";
  id?: ObjectId;
};

export class IdentityWriteError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "INVALID_NAME" | "NOT_FOUND" | "VERSION_CONFLICT",
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = "IdentityWriteError";
  }
}

const WRITE_ROLES = ["RESEARCHER", "RESEARCH_REVIEWER", "MODERATOR", "ADMIN"] as const;

async function assertAuthorized(db: Db, actor: IdentityActor): Promise<void> {
  if (actor.type !== "USER") return;
  if (!actor.id) throw new IdentityWriteError("FORBIDDEN", "user actor requires an id", 403);
  const user = await db.collection("users").findOne({ _id: actor.id });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new IdentityWriteError("FORBIDDEN", "actor is not an active user", 403);
  }
  const roles = Array.isArray(user.roles) ? user.roles as string[] : [];
  if (!WRITE_ROLES.some((role) => roles.includes(role))) {
    throw new IdentityWriteError("FORBIDDEN", "actor may not write identities", 403);
  }
}

function normalizedFields(
  name: string,
): { name: string; normalizedName: string; matchKey: string } {
  if (typeof name !== "string" || name.trim() === "") {
    throw new IdentityWriteError("INVALID_NAME", "name is required");
  }
  const normalizedName = normalizeName(name);
  const key = matchKey(name);
  if (!normalizedName || !key) {
    throw new IdentityWriteError("INVALID_NAME", "name contains no searchable characters");
  }
  return { name, normalizedName, matchKey: key };
}

function aliasDocs(aliases: string[] | undefined) {
  return (aliases ?? []).map((value) => ({
    _id: new ObjectId(),
    value,
    normalizedValue: normalizeName(value),
    matchKey: matchKey(value),
  }));
}

function meta(now: Date, actor: IdentityActor) {
  return {
    schemaVersion: 1,
    version: 1,
    lifecycle: "ACTIVE" as const,
    createdAt: now,
    updatedAt: now,
    ...(actor.id ? { createdBy: actor.id, updatedBy: actor.id } : {}),
  };
}

function auditCreated(
  entityType: EntityType,
  id: ObjectId,
  name: string,
  actor: IdentityActor,
  now: Date,
) {
  return {
    _id: new ObjectId(),
    eventSchemaVersion: 1,
    actor: actor.id ? { type: actor.type, id: actor.id } : { type: actor.type },
    action: "ENTITY_CREATED",
    target: { type: entityType, id },
    targetVersionBefore: 0,
    targetVersionAfter: 1,
    beforeSummary: {},
    afterSummary: { name },
    changedPaths: ["name"],
    occurredAt: now,
  };
}

export async function createBrand(input: {
  db: Db;
  name: string;
  localizedNames?: Array<{ locale: string; value: string }>;
  aliases?: string[];
  website?: string;
  actor: IdentityActor;
  now?: Date;
}): Promise<{ id: ObjectId; version: number; auditId: ObjectId }> {
  const now = input.now ?? new Date();
  await assertAuthorized(input.db, input.actor);
  const names = normalizedFields(input.name);
  const aliases = aliasDocs(input.aliases);
  assertHardCap("aliases", aliases.length);
  assertUniqueBy(aliases, "aliases", (item) => item.matchKey);
  assertHardCap("localizedNames", input.localizedNames?.length ?? 0);

  const _id = new ObjectId();
  const audit = auditCreated("BRAND", _id, names.name, input.actor, now);
  await input.db.collection("brands").insertOne({
    _id,
    ...names,
    aliases,
    ...(input.localizedNames?.length ? { localizedNames: input.localizedNames } : {}),
    ...(input.website ? { website: input.website } : {}),
    ...meta(now, input.actor),
  });
  await input.db.collection("audit_events").insertOne(audit);
  return { id: _id, version: 1, auditId: audit._id };
}

export async function createOrganization(input: {
  db: Db;
  name: string;
  kind: OrganizationKind;
  localizedNames?: Array<{ locale: string; value: string }>;
  aliases?: string[];
  website?: string;
  actor: IdentityActor;
  now?: Date;
}): Promise<{ id: ObjectId; version: number; auditId: ObjectId }> {
  const now = input.now ?? new Date();
  if (!ORGANIZATION_KINDS.includes(input.kind)) {
    throw new IdentityWriteError("INVALID_NAME", "unknown organization kind");
  }
  await assertAuthorized(input.db, input.actor);
  const names = normalizedFields(input.name);
  const aliases = aliasDocs(input.aliases);
  assertHardCap("aliases", aliases.length);
  assertUniqueBy(aliases, "aliases", (item) => item.matchKey);
  assertHardCap("localizedNames", input.localizedNames?.length ?? 0);

  const _id = new ObjectId();
  const audit = auditCreated("ORGANIZATION", _id, names.name, input.actor, now);
  await input.db.collection("organizations").insertOne({
    _id,
    ...names,
    kind: input.kind,
    aliases,
    identifiers: [],
    ...(input.localizedNames?.length ? { localizedNames: input.localizedNames } : {}),
    ...(input.website ? { website: input.website } : {}),
    ...meta(now, input.actor),
  });
  await input.db.collection("audit_events").insertOne(audit);
  return { id: _id, version: 1, auditId: audit._id };
}

export async function createProduct(input: {
  db: Db;
  name: string;
  localizedNames?: Array<{ locale: string; value: string }>;
  identifiers?: Array<{
    scheme: string;
    value: string;
    status?: string;
    jurisdiction?: string;
    issuer?: string;
    sourceSnapshotIds?: ObjectId[];
  }>;
  actor: IdentityActor;
  now?: Date;
}): Promise<{ id: ObjectId; version: number; auditId: ObjectId }> {
  const now = input.now ?? new Date();
  await assertAuthorized(input.db, input.actor);
  const names = normalizedFields(input.name);
  const identifiers = (input.identifiers ?? []).map((item) => {
    const normalized = normalizeProductIdentifier(item.scheme, item.value);
    const status = item.status ?? "UNVERIFIED";
    if (!IDENTIFIER_STATUSES.includes(status as typeof IDENTIFIER_STATUSES[number])) {
      throw new IdentityWriteError("INVALID_NAME", "unknown identifier status");
    }
    return {
      _id: new ObjectId(),
      scheme: normalized.scheme,
      value: normalized.value,
      normalizedValue: normalized.normalizedValue,
      matchValue: normalized.matchValue,
      ...(item.jurisdiction ? { jurisdiction: item.jurisdiction } : {}),
      ...(item.issuer ? { issuer: item.issuer } : {}),
      status,
      ...(item.sourceSnapshotIds?.length ? { sourceSnapshotIds: item.sourceSnapshotIds } : {}),
    };
  });
  assertHardCap("identifiers", identifiers.length);
  assertUniqueBy(
    identifiers,
    "identifiers",
    (item) => `${item.scheme}|${item.normalizedValue}|${item.jurisdiction ?? ""}`,
  );
  assertHardCap("localizedNames", input.localizedNames?.length ?? 0);

  const _id = new ObjectId();
  const audit = auditCreated("PRODUCT", _id, names.name, input.actor, now);
  await input.db.collection("products").insertOne({
    _id,
    ...names,
    identifiers,
    brandMapping: { status: "UNREVIEWED" },
    ...(input.localizedNames?.length ? { localizedNames: input.localizedNames } : {}),
    ...meta(now, input.actor),
  });
  await input.db.collection("audit_events").insertOne(audit);
  return { id: _id, version: 1, auditId: audit._id };
}

export async function updateIdentityName(input: {
  db: Db;
  entityType: Extract<EntityType, "PRODUCT" | "BRAND" | "ORGANIZATION">;
  id: ObjectId;
  name: string;
  expectedVersion: number;
  reason: string;
  actor: IdentityActor;
  now?: Date;
}): Promise<{ id: ObjectId; version: number; auditId: ObjectId }> {
  const now = input.now ?? new Date();
  await assertAuthorized(input.db, input.actor);
  const names = normalizedFields(input.name);
  const collection = ENTITY_COLLECTION[input.entityType];
  const existing = await input.db.collection(collection).findOne({ _id: input.id });
  if (!existing) throw new IdentityWriteError("NOT_FOUND", "identity does not exist", 404);

  const updated = await input.db.collection(collection).updateOne(
    { _id: input.id, version: input.expectedVersion, lifecycle: { $ne: "MERGED" } },
    {
      $set: {
        ...names,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new IdentityWriteError("VERSION_CONFLICT", "identity version did not match", 409);
  }

  const audit = {
    _id: new ObjectId(),
    eventSchemaVersion: 1,
    actor: input.actor.id
      ? { type: input.actor.type, id: input.actor.id }
      : { type: input.actor.type },
    action: "ENTITY_UPDATED",
    target: { type: input.entityType, id: input.id },
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    beforeSummary: { name: String(existing.name) },
    afterSummary: { name: names.name },
    changedPaths: ["name", "normalizedName", "matchKey"],
    reason: input.reason,
    occurredAt: now,
  };
  await input.db.collection("audit_events").insertOne(audit);
  return { id: input.id, version: input.expectedVersion + 1, auditId: audit._id };
}

export async function getIdentity(input: {
  db: Db;
  ref: { type: EntityType; id: ObjectId };
}): Promise<Record<string, unknown> & { _id: ObjectId } | null> {
  try {
    const registry = createEntityRegistry(input.db);
    const resolved = await registry.resolve("audit.target", input.ref);
    return resolved.doc;
  } catch {
    return null;
  }
}
