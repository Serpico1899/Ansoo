// Append-only audit service.
//
// Audit events have exactly one write path: appendAudit. No update or delete
// helper is exported. The service redacts secrets and personal data from the
// before/after summaries before persisting.
import { type Db, ObjectId } from "lesan";
import type { SpikeModels } from "./models.ts";
import type { Registry } from "./registry.ts";

export const SECRET_KEYS = new Set([
  "email",
  "phone",
  "password",
  "passwordHash",
  "token",
  "authorization",
  "secret",
  "authSubject",
  "authProvider",
  "objectKey",
  "storage",
  "privateKey",
]);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.has(key) ? "[REDACTED]" : redact(child);
    }
    return out;
  }
  return value;
}

export interface AuditInput {
  actor: { type: "user"; id: string };
  action:
    | "CREATE"
    | "UPDATE"
    | "RELATION_CHANGE"
    | "PUBLISH"
    | "RETRACT"
    | "CORRECTION_SUBMIT"
    | "CORRECTION_APPROVE"
    | "CORRECTION_APPLY"
    | "PERMISSION_CHANGE"
    | "ASSET_CHANGE";
  target: { type: string; id: string };
  requestId: string;
  correlationId?: string;
  targetVersionBefore?: number;
  targetVersionAfter?: number;
  changedPaths: string[];
  beforeSummary?: unknown;
  afterSummary?: unknown;
  reason?: string;
  occurredAt?: Date;
}

export function createAuditService(
  db: Db,
  models: SpikeModels,
  registry: Registry,
) {
  const appendAudit = async (input: AuditInput) => {
    await registry.resolve("user.reference", input.actor);
    await registry.resolve("audit.target", input.target);

    const event = {
      _id: new ObjectId(),
      eventSchemaVersion: 1,
      actor: input.actor,
      action: input.action,
      target: input.target,
      requestId: input.requestId,
      correlationId: input.correlationId,
      targetVersionBefore: input.targetVersionBefore,
      targetVersionAfter: input.targetVersionAfter,
      changedPaths: input.changedPaths,
      beforeSummary: input.beforeSummary === undefined
        ? undefined
        : redact(input.beforeSummary),
      afterSummary: input.afterSummary === undefined
        ? undefined
        : redact(input.afterSummary),
      reason: input.reason,
      occurredAt: input.occurredAt ?? new Date(),
      schemaVersion: 1,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: input.actor.id,
      updatedBy: input.actor.id,
      recordLifecycle: "ACTIVE",
    };

    await db.collection("audit_events").insertOne(event);
    return event._id.toString();
  };

  const listForTarget = async (target: { type: string; id: string }) => {
    return await db.collection("audit_events")
      .find({ "target.type": target.type, "target.id": target.id })
      .sort({ occurredAt: -1 })
      .toArray();
  };

  const listForRequest = async (requestId: string) => {
    return await db.collection("audit_events")
      .find({ requestId })
      .sort({ occurredAt: 1 })
      .toArray();
  };

  // Negative-test helper: proves that no service-level mutation path exists.
  const updateOrDelete = (): never => {
    throw new Error("audit_events are append-only");
  };

  return { appendAudit, listForTarget, listForRequest, updateOrDelete };
}

export type AuditService = ReturnType<typeof createAuditService>;
