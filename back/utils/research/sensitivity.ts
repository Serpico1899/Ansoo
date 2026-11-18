// Sensitivity classification and minimum-evidence rules. Spec 10.6.
import {
  PREDICATE_MATRIX,
  type RelationshipPredicate,
  type Sensitivity,
} from "../domain/constants.ts";

export function classifyRelationshipSensitivity(predicate: RelationshipPredicate): Sensitivity {
  return predicate === "MANUFACTURES" ? "ROUTINE" : "SENSITIVE";
}

export function classifyClaimSensitivity(claimType: string): Sensitivity {
  return claimType === "MARKET_PRESENCE" ? "ROUTINE" : "SENSITIVE";
}

export const SENSITIVITY_RANK: Record<Sensitivity, number> = {
  ROUTINE: 0,
  SENSITIVE: 1,
  HIGH_RISK: 2,
};

export function resolveSensitivity(
  baseline: Sensitivity,
  requested: unknown,
): Sensitivity {
  if (requested === undefined || requested === null) return baseline;
  if (requested !== "ROUTINE" && requested !== "SENSITIVE" && requested !== "HIGH_RISK") {
    throw new Error("INVALID_SENSITIVITY");
  }
  if (SENSITIVITY_RANK[requested] < SENSITIVITY_RANK[baseline]) {
    throw new Error("SENSITIVITY_DOWNGRADE");
  }
  return requested;
}

export function predicateAllowsObject(
  predicate: RelationshipPredicate,
  objectType: string,
): boolean {
  return (PREDICATE_MATRIX[predicate].objectTypes as readonly string[]).includes(objectType);
}
