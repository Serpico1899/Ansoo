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
  outcome: "ACTIVE" | "MERGED" | "NOT_FOUND";
  product: { _id?: string; name?: string; brand?: { _id?: string; name?: string } | null } | null;
  claims: Array<{
    _id?: string;
    statement?: string;
    assessment?: { outcome?: string };
    publication?: { status?: string };
  }>;
  relationships: Array<{
    _id?: string;
    predicate?: string;
    assessment?: { outcome?: string };
    publication?: { status?: string };
  }>;
  unknowns: string[];
  limitations: string[];
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
