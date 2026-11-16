// Correction approval and application.
//
// Approval is not application. Application is a dedicated domain action with:
// - a strict per-target field allowlist,
// - an operation allowlist,
// - an expected target version,
// - an idempotency key,
// - an atomic version-checked update,
// - an audit event.
import { type Db, ObjectId } from "lesan";
import type { AuditService } from "./audit.ts";
import type { Registry } from "./registry.ts";

export class CorrectionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "CorrectionError";
  }
}

type Operation = "SET" | "UNSET" | "ADD" | "REMOVE";

interface FieldRule {
  operations: Operation[];
  validate?: (value: unknown) => boolean;
}

const nonEmptyString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0;
const isLifecycle = (value: unknown) =>
  value === "ACTIVE" || value === "ARCHIVED";

// Deliberately small during the spike. Production rules are a policy decision.
export const CORRECTION_ALLOWLIST: Record<string, Record<string, FieldRule>> = {
  product: {
    name: { operations: ["SET"], validate: nonEmptyString },
    normalizedName: { operations: ["SET"], validate: nonEmptyString },
    "brandMapping.state": {
      operations: ["SET"],
      validate: (value) =>
        ["CONFIRMED", "UNVERIFIED", "CONFLICTING", "NONE"].includes(
          value as string,
        ),
    },
    recordLifecycle: { operations: ["SET"], validate: isLifecycle },
  },
  brand: {
    name: { operations: ["SET"], validate: nonEmptyString },
    normalizedName: { operations: ["SET"], validate: nonEmptyString },
    recordLifecycle: { operations: ["SET"], validate: isLifecycle },
  },
  category: {
    name: { operations: ["SET"], validate: nonEmptyString },
    normalizedName: { operations: ["SET"], validate: nonEmptyString },
    sortOrder: {
      operations: ["SET"],
      validate: (value) => typeof value === "number" && Number.isFinite(value),
    },
    recordLifecycle: { operations: ["SET"], validate: isLifecycle },
  },
  organization: {
    name: { operations: ["SET"], validate: nonEmptyString },
    normalizedName: { operations: ["SET"], validate: nonEmptyString },
    recordLifecycle: { operations: ["SET"], validate: isLifecycle },
  },
  relationship: {
    "validity.validTo": {
      operations: ["SET", "UNSET"],
      validate: (value) => value instanceof Date,
    },
    recordLifecycle: { operations: ["SET"], validate: isLifecycle },
  },
  claim: {
    statement: { operations: ["SET"], validate: nonEmptyString },
    recordLifecycle: { operations: ["SET"], validate: isLifecycle },
  },
  source: {
    title: { operations: ["SET"], validate: nonEmptyString },
    canonicalUrl: { operations: ["SET"], validate: nonEmptyString },
    recordLifecycle: { operations: ["SET"], validate: isLifecycle },
  },
  source_snapshot: {
    // Content identity is immutable. Only audited metadata may be corrected.
    "captureMetadata.finalUrl": {
      operations: ["SET"],
      validate: nonEmptyString,
    },
    recordLifecycle: { operations: ["SET"], validate: isLifecycle },
  },
};

const FORBIDDEN_FIELD_PARTS = ["$", "__proto__", "constructor", "prototype"];

function assertFieldKey(targetType: string, fieldKey: string) {
  if (
    typeof fieldKey !== "string" || fieldKey.length === 0 ||
    FORBIDDEN_FIELD_PARTS.some((part) => fieldKey.includes(part))
  ) {
    throw new CorrectionError("INVALID_FIELD", "fieldKey is not allowed");
  }
  const rule = CORRECTION_ALLOWLIST[targetType]?.[fieldKey];
  if (!rule) {
    throw new CorrectionError(
      "FIELD_NOT_ALLOWED",
      `${fieldKey} is not an allowed correction field for ${targetType}`,
    );
  }
  return rule;
}

function assertOperation(rule: FieldRule, operation: Operation, value: unknown) {
  if (!rule.operations.includes(operation)) {
    throw new CorrectionError(
      "OPERATION_NOT_ALLOWED",
      `operation ${operation} is not allowed for this field`,
    );
  }
  if (operation === "SET" && rule.validate && !rule.validate(value)) {
    throw new CorrectionError("INVALID_VALUE", "proposedValue is invalid");
  }
}

export function planCorrection(
  targetType: string,
  proposedChange: {
    fieldKey: string;
    operation: Operation;
    proposedValue?: unknown;
  },
): Record<string, unknown> {
  const rule = assertFieldKey(targetType, proposedChange.fieldKey);
  assertOperation(rule, proposedChange.operation, proposedChange.proposedValue);

  if (proposedChange.operation === "SET") {
    return { $set: { [proposedChange.fieldKey]: proposedChange.proposedValue } };
  }
  if (proposedChange.operation === "UNSET") {
    return { $unset: { [proposedChange.fieldKey]: "" } };
  }
  throw new CorrectionError(
    "OPERATION_NOT_ALLOWED",
    `${proposedChange.operation} is not implemented during the spike`,
  );
}

export function createCorrectionService(
  db: Db,
  registry: Registry,
  audit: AuditService,
) {
  const approve = async (input: {
    correctionId: string;
    actor: { type: "user"; id: string };
    requestId: string;
  }) => {
    const correction = await db.collection("corrections").findOne({
      _id: new ObjectId(input.correctionId),
    });
    if (!correction) {
      throw new CorrectionError("NOT_FOUND", "correction does not exist");
    }
    if (correction.status !== "SUBMITTED" && correction.status !== "UNDER_REVIEW") {
      throw new CorrectionError("INVALID_STATE", "correction is not reviewable");
    }

    // Approval does not apply the proposal.
    await db.collection("corrections").updateOne(
      { _id: correction._id },
      {
        $set: {
          status: "APPROVED",
          "review.status": "CLOSED",
          updatedAt: new Date(),
          updatedBy: input.actor.id,
          version: Number(correction.version) + 1,
        },
      },
    );

    await audit.appendAudit({
      actor: input.actor,
      action: "CORRECTION_APPROVE",
      target: { type: "correction", id: input.correctionId },
      requestId: input.requestId,
      targetVersionBefore: Number(correction.version),
      targetVersionAfter: Number(correction.version) + 1,
      changedPaths: ["status", "review.status"],
      beforeSummary: { status: correction.status, review: correction.review },
      afterSummary: { status: "APPROVED", review: { status: "CLOSED" } },
      reason: "correction approved without application",
    });

    return { approved: true, applied: false };
  };

  const apply = async (input: {
    correctionId: string;
    actor: { type: "user"; id: string };
    expectedVersion: number;
    idempotencyKey: string;
    requestId: string;
    correlationId?: string;
  }) => {
    const correction = await db.collection("corrections").findOne({
      _id: new ObjectId(input.correctionId),
    });
    if (!correction) {
      throw new CorrectionError("NOT_FOUND", "correction does not exist");
    }

    if (correction.status === "APPLIED") {
      if (correction.application?.idempotencyKey === input.idempotencyKey) {
        return { applied: false, idempotent: true, resultVersion: correction.application.resultVersion };
      }
      throw new CorrectionError(
        "ALREADY_APPLIED",
        "correction was applied with a different idempotency key",
      );
    }
    if (correction.status !== "APPROVED") {
      throw new CorrectionError(
        "NOT_APPROVED",
        "correction must be approved before application",
      );
    }
    if (!input.idempotencyKey) {
      throw new CorrectionError("IDEMPOTENCY_KEY_REQUIRED", "idempotency key required");
    }
    if (!correction.target) {
      throw new CorrectionError("NO_TARGET", "correction has no target");
    }

    const target = await registry.resolve("correction.target", correction.target);
    const targetType = correction.target.type as string;
    const update = planCorrection(targetType, correction.proposedChange as any);

    const filter = {
      _id: new ObjectId(correction.target.id),
      version: input.expectedVersion,
    };
    const updateDoc = {
      ...update,
      $set: {
        ...(update.$set as Record<string, unknown> ?? {}),
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
        updatedBy: input.actor.id,
      },
    };
    const result = await db.collection(target.type === "source_snapshot"
      ? "source_snapshots"
      : registry.collectionFor(target.type as any))
      .findOneAndUpdate(filter, updateDoc, { returnDocument: "after" });

    if (!result) {
      throw new CorrectionError(
        "VERSION_CONFLICT",
        "target version changed or target no longer exists",
      );
    }

    await db.collection("corrections").updateOne(
      { _id: correction._id, status: "APPROVED" },
      {
        $set: {
          status: "APPLIED",
          application: {
            appliedAt: new Date(),
            appliedBy: input.actor.id,
            resultVersion: input.expectedVersion + 1,
            idempotencyKey: input.idempotencyKey,
          },
          updatedAt: new Date(),
          updatedBy: input.actor.id,
          version: Number(correction.version) + 1,
        },
      },
    );

    await audit.appendAudit({
      actor: input.actor,
      action: "CORRECTION_APPLY",
      target: { type: targetType, id: correction.target.id },
      requestId: input.requestId,
      correlationId: input.correlationId ?? input.correctionId,
      targetVersionBefore: input.expectedVersion,
      targetVersionAfter: input.expectedVersion + 1,
      changedPaths: [correction.proposedChange.fieldKey],
      beforeSummary: { [correction.proposedChange.fieldKey]: (target.doc as any)[correction.proposedChange.fieldKey] },
      afterSummary: { [correction.proposedChange.fieldKey]: correction.proposedChange.proposedValue },
      reason: correction.reason,
    });

    return {
      applied: true,
      idempotent: false,
      resultVersion: input.expectedVersion + 1,
    };
  };

  return { approve, apply };
}

export type CorrectionService = ReturnType<typeof createCorrectionService>;
