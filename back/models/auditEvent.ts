// audit_events - append-only accountability stream. Spec 9.3.
//
// No mutable metadata, no update/delete path, and summaries are flat+redacted.

import { array, assert, date, enums, number, optional, string } from "lesan";
import { assertDocumentCaps, DomainValidationError } from "../utils/domain/caps.ts";
import {
  AUDIT_ACTIONS,
  AUDIT_SUMMARY_FORBIDDEN_KEYS,
  AUDIT_TARGET_TYPES,
} from "../utils/domain/constants.ts";
import { auditActorStruct, documentStruct, entityRefStruct, flatSummaryStruct } from "./shared.ts";

export const auditEventFields = {
  eventSchemaVersion: number(),
  actor: auditActorStruct,
  action: enums(AUDIT_ACTIONS),
  target: entityRefStruct(AUDIT_TARGET_TYPES),
  requestId: optional(string()),
  correlationId: optional(string()),
  idempotencyKey: optional(string()),
  targetVersionBefore: optional(number()),
  targetVersionAfter: optional(number()),
  changedPaths: optional(array(string())),
  beforeSummary: optional(flatSummaryStruct),
  afterSummary: optional(flatSummaryStruct),
  reason: optional(string()),
  occurredAt: date(),
};

export const auditEventStruct = documentStruct(auditEventFields);

export function assertAuditSummary(summary: unknown): void {
  if (summary === undefined) return;
  if (summary === null || typeof summary !== "object" || Array.isArray(summary)) {
    throw new DomainValidationError(
      "INVALID_AUDIT_SUMMARY",
      "audit summary must be a flat object",
    );
  }
  for (const [key, value] of Object.entries(summary as Record<string, unknown>)) {
    if ((AUDIT_SUMMARY_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      throw new DomainValidationError(
        "AUDIT_SUMMARY_FORBIDDEN_KEY",
        `audit summary must not contain ${key}`,
        { key },
      );
    }
    if (
      value !== null &&
      !["string", "number", "boolean"].includes(typeof value)
    ) {
      throw new DomainValidationError(
        "INVALID_AUDIT_SUMMARY",
        `audit summary value for ${key} must be flat and primitive`,
        { key },
      );
    }
  }
}

export function validateAuditEvent(doc: unknown): void {
  assertDocumentCaps("audit_events", doc);
  const value = doc as { beforeSummary?: unknown; afterSummary?: unknown };
  assertAuditSummary(value.beforeSummary);
  assertAuditSummary(value.afterSummary);
  assert(doc, auditEventStruct);
}
