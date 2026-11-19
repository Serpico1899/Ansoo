// Public profile assembly contract. Spec 14.2 and 14.3 (LOCKED).
//
// The public profile is an allowlisted assembly, never a raw projection of a
// canonical document. There is deliberately no score, verdict, badge, rating,
// or legal/ethical conclusion field.
import type { ObjectId } from "lesan";
import type {
  ClaimType,
  EvidenceAssessmentOutcome,
  LimitationCode,
  RelationshipPredicate,
  SolicitationOutcome,
} from "../domain/constants.ts";
import type { ResolutionResult } from "../identity/resolution.ts";

export type PublicScope = "PRODUCT" | "BRAND" | "ORGANIZATION";

export type PublicCounterparty = {
  type: "PRODUCT" | "BRAND" | "ORGANIZATION";
  id: ObjectId;
  name: string;
};

export type PublicInheritedFrom = {
  type: "PRODUCT" | "BRAND" | "ORGANIZATION";
  id: ObjectId;
  name: string;
};

export type PublicValidity = {
  validFrom: Date | null;
  validTo: Date | null;
  datePrecision: "EXACT" | "MONTH" | "YEAR" | "APPROXIMATE" | "UNKNOWN";
};

export type PublicEvidenceView = {
  sourceTitle: string;
  publisherName?: string;
  capturedAt: Date;
  publishedAt?: Date | null;
  excerpt?: string;
  locator?: Record<string, unknown>;
  stance: "SUPPORTS" | "CONTRADICTS" | "CONTEXTUALIZES" | "NEUTRAL";
  publicSourceUrl?: string;
  isRedacted: boolean;
};

export type PublicResponseView = {
  organizationName: string;
  responseText: string;
  submittedAt: Date;
  representativeVerified: boolean;
};

export type PublicCorrectionNotice = {
  correctedAt: Date;
  reason: string;
  previousWording: string;
  auditEventId: ObjectId;
};

export type PublicRightOfReply = {
  solicited: boolean;
  outcome?: SolicitationOutcome;
  deadline?: Date;
};

export type PublicFindingView = {
  findingId: ObjectId;
  findingKind: "RELATIONSHIP" | "CLAIM";
  scope: PublicScope;
  inheritedFrom?: PublicInheritedFrom;
  predicate?: RelationshipPredicate;
  claimType?: ClaimType;
  publicWording: string;
  counterparties: PublicCounterparty[];
  validity: PublicValidity;
  assessmentOutcome: EvidenceAssessmentOutcome;
  limitations: LimitationCode[];
  publishedAt: Date;
  lastReviewedAt?: Date;
  evidence: PublicEvidenceView[];
  organizationResponses: PublicResponseView[];
  rightOfReply: PublicRightOfReply;
  correctionNotice?: PublicCorrectionNotice;
};

export type PublicProductIdentity = {
  id: ObjectId;
  name: string;
  packaging?: Record<string, unknown>;
  identifiersApprovedForDisplay: Array<{ scheme: string; value: string }>;
  brandMappingStatus: string;
  categoryCode?: string;
};

export type PublicBrandView = { id: ObjectId; name: string };

export type PublicUnknown = { code: string; message: string };

export type PublicProductProfile = {
  resolution: ResolutionResult;
  product?: PublicProductIdentity;
  brand?: PublicBrandView;
  findings: PublicFindingView[];
  unknowns: PublicUnknown[];
  noUniversalScore: true;
  builtAt: Date;
};

export type PublicSourceVersions = Record<string, string>;

// Codes are part of the public contract. Never turn an unknown into a false or
// a negative conclusion; these codes describe gaps, not findings.
export const PUBLIC_UNKNOWN_CODES = {
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  AMBIGUOUS_IDENTIFIER: "AMBIGUOUS_IDENTIFIER",
  UNVERIFIED_IDENTIFIER: "UNVERIFIED_IDENTIFIER",
  UNRESOLVED_DISPUTE: "UNRESOLVED_DISPUTE",
  MERGED_IDENTITY_REDIRECT: "MERGED_IDENTITY_REDIRECT",
  MISSING_BRAND: "MISSING_BRAND",
  NO_PUBLISHED_FINDINGS: "NO_PUBLISHED_FINDINGS",
  MISSING_EVIDENCE: "MISSING_EVIDENCE",
  EVIDENCE_WITHHELD: "EVIDENCE_WITHHELD",
  MISSING_VALIDITY_DATES: "MISSING_VALIDITY_DATES",
  CONTRIBUTION_GUIDANCE: "CONTRIBUTION_GUIDANCE",
  INCOMPLETE_PROFILE: "INCOMPLETE_PROFILE",
} as const;

export const PUBLIC_PROFILE_LIMITATIONS = [
  "A relationship or barcode does not by itself establish a legal or ethical conclusion.",
  "Unknown dates remain unknown; validTo null does not prove a statement is current.",
  "Findings are shown with their scope; Organization findings appear only through a published Brand edge.",
  "This profile separates identity, assessment, and publication states; it is not a verdict.",
] as const;

export const PUBLIC_PROFILE_SCHEMA_VERSION = 1;

const VERDICT_PHRASES = [
  "is unethical",
  "is ethical",
  "is illegal",
  "is legal",
  "should boycott",
  "boycott this",
  "guilty of",
  "proven false",
  "definitely safe",
  "definitely unsafe",
] as const;

export function assertNoUniversalVerdictWording(value: unknown): void {
  const visit = (node: unknown): void => {
    if (typeof node === "string") {
      const lower = node.toLowerCase();
      for (const phrase of VERDICT_PHRASES) {
        if (lower.includes(phrase)) {
          throw new Error(`public profile wording implies a universal verdict: ${phrase}`);
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node === null || typeof node !== "object" || node instanceof Date) return;
    for (const item of Object.values(node as Record<string, unknown>)) visit(item);
  };
  visit(value);
}

export function assertNoUniversalScore(value: unknown): void {
  const forbidden = new Set(["score", "verdict", "badge", "rating", "boycott"]);
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node === null || typeof node !== "object" || node instanceof Date) return;
    for (const [key, item] of Object.entries(node as Record<string, unknown>)) {
      if (forbidden.has(key.toLowerCase())) {
        throw new Error(`public profile contains forbidden field: ${key}`);
      }
      visit(item);
    }
  };
  visit(value);
}
