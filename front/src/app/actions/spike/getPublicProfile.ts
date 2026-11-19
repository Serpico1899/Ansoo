"use server";

import type { ReqType } from "@/types/declarations/selectInp";

type GetPublicProfile = ReqType["main"]["products"]["getPublicProfile"];

export type ApiEnvelope<T> =
  | { success: true; body: T; requestId?: string }
  | {
    success: false;
    body: {
      error: {
        code: string;
        message: string;
        requestId?: string;
        fields?: Record<string, string>;
        retryAfterSeconds?: number;
      };
    };
  };

export type PublicProfilePayload = {
  resolution:
    | { state: "FOUND"; productId: string; confidence: "EXACT" }
    | { state: "NOT_FOUND" }
    | { state: "AMBIGUOUS"; candidates: Array<{ productId: string; reason: string }> }
    | { state: "DISPUTED"; productId: string; disputeNote: string }
    | { state: "UNVERIFIED"; productId: string };
  product?: {
    id: string;
    name: string;
    packaging?: Record<string, unknown>;
    identifiersApprovedForDisplay: Array<{ scheme: string; value: string }>;
    brandMappingStatus: string;
    categoryCode?: string;
  };
  brand?: { id: string; name: string };
  findings: Array<{
    findingId: string;
    findingKind: "RELATIONSHIP" | "CLAIM";
    scope: "PRODUCT" | "BRAND" | "ORGANIZATION";
    inheritedFrom?: { type: "BRAND" | "ORGANIZATION"; id: string; name: string };
    predicate?: string;
    claimType?: string;
    publicWording: string;
    assessmentOutcome: string;
    limitations: string[];
    publishedAt: string;
    evidence: Array<{
      sourceTitle: string;
      publisherName?: string;
      stance: string;
      isRedacted: boolean;
    }>;
    organizationResponses: Array<{
      organizationName: string;
      responseText: string;
      representativeVerified: boolean;
    }>;
    correctionNotice?: {
      correctedAt: string;
      reason: string;
      previousWording: string;
    };
  }>;
  unknowns: Array<{ code: string; message: string }>;
  noUniversalScore: true;
  builtAt: string;
};

export async function getPublicProfile(
  set: GetPublicProfile["set"],
): Promise<ApiEnvelope<PublicProfilePayload>> {
  const token = process.env.ANSOO_API_TOKEN;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) {
    if (token.startsWith("Bearer ")) {
      return {
        success: false,
        body: {
          error: {
            code: "UNAUTHENTICATED",
            message: "send token without Bearer",
          },
        },
      };
    }
    headers.token = token;
  }

  const response = await fetch(`${process.env.ANSOO_API_URL}/lesan`, {
    method: "POST",
    headers,
    cache: "no-store",
    body: JSON.stringify({
      model: "products",
      act: "getPublicProfile",
      details: { set },
    }),
  });
  return (await response.json()) as ApiEnvelope<PublicProfilePayload>;
}
