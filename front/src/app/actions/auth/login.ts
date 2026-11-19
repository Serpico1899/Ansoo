"use server";

import type { ReqType } from "@/types/declarations/selectInp";

type Login = ReqType["main"]["users"]["login"];

export type LoginEnvelope =
  | {
    success: true;
    body: {
      token: string;
      expiresInSeconds: number;
      user: { _id: string; displayName?: string; preferredLocale?: string; roles: string[] };
    };
  }
  | {
    success: false;
    body: { error: { code: string; message: string; requestId?: string } };
  };

export async function login(
  set: Login["set"],
): Promise<LoginEnvelope> {
  const response = await fetch(`${process.env.ANSOO_API_URL}/lesan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      model: "users",
      act: "login",
      details: { set },
    }),
  });
  return (await response.json()) as LoginEnvelope;
}
