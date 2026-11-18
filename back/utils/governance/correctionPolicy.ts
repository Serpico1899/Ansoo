// The correction field/operation allowlist. Plan 07 / spec 9.1 (I10).
//
// Submit and apply both call this module. A correction can never name a Mongo
// path, operator, collection, or arbitrary JSON patch. Relation operations are
// recognized by the model but deliberately have no allowlisted field here:
// graph changes belong to the dedicated relationship actions.
import {
  CORRECTION_OPERATIONS,
  CORRECTION_TARGET_TYPES,
  type CorrectionOperation,
  type CorrectionTargetType,
} from "../domain/constants.ts";
import { assertKnownCategoryCode } from "../domain/taxonomy.ts";
import { matchKey, normalizeName } from "../identity/normalize.ts";
import { GovernanceError } from "./common.ts";

export type CorrectionProposal = {
  fieldKey: string;
  operation: CorrectionOperation;
  proposedValue?: unknown;
  proposedEntity?: { type: string; id: import("lesan").ObjectId };
};

export type PolicyField = {
  key: string;
  operations: readonly CorrectionOperation[];
  maxLength: number;
};

export const CORRECTION_FIELD_ALLOWLIST: Record<
  CorrectionTargetType,
  readonly PolicyField[]
> = {
  PRODUCT: [
    { key: "name", operations: ["SET"], maxLength: 200 },
    { key: "description", operations: ["SET", "UNSET"], maxLength: 4_000 },
    { key: "categoryCode", operations: ["SET"], maxLength: 200 },
  ],
  BRAND: [
    { key: "name", operations: ["SET"], maxLength: 200 },
    { key: "description", operations: ["SET", "UNSET"], maxLength: 4_000 },
    { key: "website", operations: ["SET", "UNSET"], maxLength: 2_048 },
  ],
  ORGANIZATION: [
    { key: "name", operations: ["SET"], maxLength: 200 },
    { key: "description", operations: ["SET", "UNSET"], maxLength: 4_000 },
    { key: "website", operations: ["SET", "UNSET"], maxLength: 2_048 },
  ],
  RELATIONSHIP: [
    { key: "publicWording", operations: ["SET"], maxLength: 2_000 },
  ],
  CLAIM: [
    { key: "publicWording", operations: ["SET"], maxLength: 2_000 },
  ],
  SOURCE: [
    { key: "title", operations: ["SET"], maxLength: 300 },
  ],
  SOURCE_SNAPSHOT: [],
};

const PROPOSAL_KEYS = ["fieldKey", "operation", "proposedValue", "proposedEntity"] as const;

export function isCorrectionTargetType(value: unknown): value is CorrectionTargetType {
  return typeof value === "string" &&
    (CORRECTION_TARGET_TYPES as readonly string[]).includes(value);
}

export function isCorrectionOperation(value: unknown): value is CorrectionOperation {
  return typeof value === "string" &&
    (CORRECTION_OPERATIONS as readonly string[]).includes(value);
}

function findField(targetType: CorrectionTargetType, fieldKey: string): PolicyField | undefined {
  return CORRECTION_FIELD_ALLOWLIST[targetType].find((field) => field.key === fieldKey);
}

function validateStringValue(
  targetType: CorrectionTargetType,
  field: PolicyField,
  value: unknown,
): string {
  if (typeof value !== "string") {
    throw new GovernanceError(
      "INVALID_CORRECTION_VALUE",
      `${field.key} must be a string`,
      422,
      { targetType, fieldKey: field.key },
    );
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new GovernanceError(
      "INVALID_CORRECTION_VALUE",
      `${field.key} must not be empty; use UNSET for an optional field`,
      422,
      { targetType, fieldKey: field.key },
    );
  }
  if (trimmed.length > field.maxLength) {
    throw new GovernanceError(
      "CAP_EXCEEDED",
      `${field.key} is too long`,
      422,
      { targetType, fieldKey: field.key, cap: field.maxLength, actual: trimmed.length },
    );
  }
  if (field.key === "categoryCode") {
    try {
      assertKnownCategoryCode(trimmed);
    } catch {
      throw new GovernanceError("UNKNOWN_CATEGORY_CODE", "unknown category code", 422, {
        fieldKey: field.key,
      });
    }
  }
  if (field.key === "website") {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new Error("unsupported scheme");
      }
    } catch {
      throw new GovernanceError("INVALID_CORRECTION_VALUE", "website must be an HTTP(S) URL");
    }
  }
  return trimmed;
}

export function validateCorrectionProposal(
  targetType: CorrectionTargetType,
  proposal: unknown,
): CorrectionProposal {
  if (proposal === null || typeof proposal !== "object" || Array.isArray(proposal)) {
    throw new GovernanceError("INVALID_CORRECTION_PROPOSAL", "proposedChange must be an object");
  }
  for (const key of Object.keys(proposal as Record<string, unknown>)) {
    if (!(PROPOSAL_KEYS as readonly string[]).includes(key)) {
      throw new GovernanceError(
        "INVALID_CORRECTION_PROPOSAL",
        `proposedChange.${key} is not allowed`,
      );
    }
  }
  const value = proposal as Record<string, unknown>;
  if (typeof value.fieldKey !== "string" || value.fieldKey.trim() === "") {
    throw new GovernanceError("UNKNOWN_CORRECTION_FIELD", "fieldKey is required");
  }
  const fieldKey = value.fieldKey.trim();
  const field = findField(targetType, fieldKey);
  if (!field) {
    throw new GovernanceError(
      "UNKNOWN_CORRECTION_FIELD",
      `${fieldKey} is not allowlisted for ${targetType}`,
      422,
      { targetType, fieldKey },
    );
  }
  if (!isCorrectionOperation(value.operation)) {
    throw new GovernanceError("INVALID_CORRECTION_OPERATION", "unknown correction operation");
  }
  if (!field.operations.includes(value.operation)) {
    throw new GovernanceError(
      "INVALID_CORRECTION_OPERATION",
      `${value.operation} is not allowed for ${targetType}.${fieldKey}`,
      422,
      { targetType, fieldKey, operation: value.operation },
    );
  }
  if (value.proposedEntity !== undefined) {
    throw new GovernanceError(
      "INVALID_CORRECTION_PROPOSAL",
      "proposedEntity is only valid for relationship operations, which are not enabled",
    );
  }
  if (value.operation === "UNSET") {
    if (value.proposedValue !== undefined) {
      throw new GovernanceError(
        "INVALID_CORRECTION_VALUE",
        "UNSET must not carry a proposedValue",
      );
    }
    return { fieldKey, operation: value.operation };
  }
  const proposedValue = validateStringValue(targetType, field, value.proposedValue);
  return { fieldKey, operation: value.operation, proposedValue };
}

export type CorrectionPatch = {
  set: Record<string, unknown>;
  unset: Record<string, string>;
  changedPaths: string[];
};

export function buildCorrectionPatch(input: {
  proposal: CorrectionProposal;
  now: Date;
  actorId?: import("lesan").ObjectId;
}): CorrectionPatch {
  const { proposal, now, actorId } = input;
  const common = {
    updatedAt: now,
    ...(actorId ? { updatedBy: actorId } : {}),
  };
  if (proposal.operation === "UNSET") {
    return {
      set: common,
      unset: { [proposal.fieldKey]: "" },
      changedPaths: [proposal.fieldKey],
    };
  }
  const value = proposal.proposedValue;
  if (proposal.fieldKey === "name") {
    const name = value as string;
    return {
      set: {
        name,
        normalizedName: normalizeName(name),
        matchKey: matchKey(name),
        ...common,
      },
      unset: {},
      changedPaths: ["name", "normalizedName", "matchKey"],
    };
  }
  return {
    set: { [proposal.fieldKey]: value, ...common },
    unset: {},
    changedPaths: [proposal.fieldKey],
  };
}

export function currentValueForProposal(
  doc: Record<string, unknown>,
  proposal: CorrectionProposal,
): unknown {
  return doc[proposal.fieldKey];
}
