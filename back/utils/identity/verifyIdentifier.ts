// Identifier mutation action. Spec 5.1 and 13.2.
//
// Adds an identifier or changes its status with CAS, cap enforcement, and an
// append-only AuditEvent. Values stay strings; leading zeros survive.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { assertHardCap } from "../domain/caps.ts";
import { IDENTIFIER_STATUSES, type IdentifierStatus } from "../domain/constants.ts";
import { normalizeProductIdentifier, validateIdentifierStatusTransition } from "./identifier.ts";
import { createEntityRegistry } from "./registry.ts";

export type IdentifierActor = {
  type: "USER" | "SYSTEM" | "SERVICE";
  id?: ObjectId;
};

export class IdentifierWriteError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "PRODUCT_NOT_FOUND"
      | "VERSION_CONFLICT"
      | "DUPLICATE_IDENTIFIER"
      | "INVALID_STATUS",
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = "IdentifierWriteError";
  }
}

const WRITE_ROLES = ["RESEARCHER", "RESEARCH_REVIEWER", "MODERATOR", "ADMIN"] as const;

async function assertAuthorized(db: Db, actor: IdentifierActor): Promise<void> {
  if (actor.type !== "USER") return;
  if (!actor.id) throw new IdentifierWriteError("FORBIDDEN", "user actor requires an id", 403);
  const user = await db.collection("users").findOne({ _id: actor.id });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new IdentifierWriteError("FORBIDDEN", "actor is not an active user", 403);
  }
  const roles = Array.isArray(user.roles) ? user.roles as string[] : [];
  if (!WRITE_ROLES.some((role) => roles.includes(role))) {
    throw new IdentifierWriteError("FORBIDDEN", "actor may not change identifiers", 403);
  }
}

export async function verifyProductIdentifier(input: {
  db: Db;
  productId: ObjectId;
  scheme: string;
  value: string;
  status: IdentifierStatus;
  jurisdiction?: string;
  issuer?: string;
  sourceSnapshotIds?: ObjectId[];
  expectedVersion: number;
  reason: string;
  actor: IdentifierActor;
  now?: Date;
}): Promise<{
  productId: ObjectId;
  identifierId: ObjectId;
  status: IdentifierStatus;
  version: number;
  auditId: ObjectId;
  created: boolean;
}> {
  const now = input.now ?? new Date();
  if (!IDENTIFIER_STATUSES.includes(input.status)) {
    throw new IdentifierWriteError("INVALID_STATUS", "unknown identifier status", 422);
  }
  await assertAuthorized(input.db, input.actor);

  const normalized = normalizeProductIdentifier(input.scheme, input.value);
  for (const snapshotId of input.sourceSnapshotIds ?? []) {
    const registry = createEntityRegistry(input.db);
    await registry.resolve("evidence.sourceSnapshotId", {
      type: "SOURCE_SNAPSHOT",
      id: snapshotId,
    });
  }

  const product = await input.db.collection("products").findOne({ _id: input.productId });
  if (!product) throw new IdentifierWriteError("PRODUCT_NOT_FOUND", "product does not exist", 404);

  const identifiers = Array.isArray(product.identifiers)
    ? product.identifiers as Array<Record<string, unknown>>
    : [];
  const scopeKey = `${normalized.scheme}|${normalized.normalizedValue}|${input.jurisdiction ?? ""}`;
  const existingIndex = identifiers.findIndex((identifier) =>
    `${String(identifier.scheme)}|${String(identifier.normalizedValue)}|${
      String(identifier.jurisdiction ?? "")
    }` === scopeKey
  );

  const created = existingIndex === -1;
  if (created) assertHardCap("identifiers", identifiers.length + 1);

  let identifierId: ObjectId;
  let previousStatus: IdentifierStatus | undefined;
  let nextIdentifiers: Array<Record<string, unknown>>;

  if (created) {
    identifierId = new ObjectId();
    nextIdentifiers = [
      ...identifiers,
      {
        _id: identifierId,
        scheme: normalized.scheme,
        value: normalized.value,
        normalizedValue: normalized.normalizedValue,
        matchValue: normalized.matchValue,
        ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
        ...(input.issuer ? { issuer: input.issuer } : {}),
        status: input.status,
        ...(input.sourceSnapshotIds?.length ? { sourceSnapshotIds: input.sourceSnapshotIds } : {}),
      },
    ];
  } else {
    const existing = identifiers[existingIndex];
    identifierId = existing._id as ObjectId;
    previousStatus = existing.status as IdentifierStatus;
    validateIdentifierStatusTransition(previousStatus, input.status);
    nextIdentifiers = identifiers.map((identifier, index) =>
      index === existingIndex
        ? {
          ...identifier,
          status: input.status,
          ...(input.issuer ? { issuer: input.issuer } : {}),
          ...(input.sourceSnapshotIds?.length
            ? { sourceSnapshotIds: input.sourceSnapshotIds }
            : {}),
        }
        : identifier
    );
  }

  const updated = await input.db.collection("products").updateOne(
    {
      _id: input.productId,
      version: input.expectedVersion,
      lifecycle: { $ne: "MERGED" },
    },
    {
      $set: {
        identifiers: nextIdentifiers,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new IdentifierWriteError("VERSION_CONFLICT", "product version did not match", 409);
  }

  const audit = {
    _id: new ObjectId(),
    eventSchemaVersion: 1,
    actor: input.actor.id
      ? { type: input.actor.type, id: input.actor.id }
      : { type: input.actor.type },
    action: created ? "IDENTIFIER_ADDED" : "IDENTIFIER_STATUS_CHANGED",
    target: { type: "PRODUCT", id: input.productId },
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    beforeSummary: {
      scheme: normalized.scheme,
      normalizedValue: normalized.normalizedValue,
      status: previousStatus ?? "",
    },
    afterSummary: {
      scheme: normalized.scheme,
      normalizedValue: normalized.normalizedValue,
      status: input.status,
    },
    changedPaths: created ? ["identifiers"] : ["identifiers.status"],
    reason: input.reason,
    occurredAt: now,
  };
  await input.db.collection("audit_events").insertOne(audit);

  return {
    productId: input.productId,
    identifierId,
    status: input.status,
    version: input.expectedVersion + 1,
    auditId: audit._id,
    created,
  };
}
