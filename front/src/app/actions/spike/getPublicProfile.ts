"use server";

import type { ReqType } from "@/types/declarations/selectInp";

type GetPublicProfile = ReqType["main"]["products"]["getPublicProfile"];

export type ApiEnvelope<T> =
  | { success: true; body: T }
  | { success: false; body: { code: string; message: string; requestId?: string } };

export type PublicProfilePayload = {
  outcome: "MATCH" | "NOT_FOUND";
  profile: {
    product: { _id?: string; name: string; brand: { _id?: string; name: string } | null };
    relationships: Array<{
      _id?: string;
      predicate: string;
      assessment: { outcome?: string };
      publication: { status?: string };
    }>;
    claims: Array<{
      _id?: string;
      statement: string;
      assessment: { outcome?: string };
      publication: { status?: string };
    }>;
    unknowns: string[];
  } | null;
};

export async function getPublicProfile(
  set: GetPublicProfile["set"],
): Promise<ApiEnvelope<PublicProfilePayload>> {
  const token = process.env.ANSOO_API_TOKEN;
  if (!token) {
    return { success: false, body: { code: "CONFIG", message: "backend token missing" } };
  }
  if (token.startsWith("Bearer ")) {
    return {
      success: false,
      body: { code: "INVALID_TOKEN_HEADER", message: "send token without Bearer" },
    };
  }
  const response = await fetch(`${process.env.ANSOO_API_URL}/lesan`, {
    method: "POST",
    headers: { "content-type": "application/json", token },
    cache: "no-store",
    body: JSON.stringify({
      model: "products",
      act: "getPublicProfile",
      details: { set, get: { profile: true } },
    }),
  });
  if (!response.ok) {
    return {
      success: false,
      body: { code: `HTTP_${response.status}`, message: "backend request failed" },
    };
  }
  return (await response.json()) as ApiEnvelope<PublicProfilePayload>;
}
