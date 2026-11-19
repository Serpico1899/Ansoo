// Request authentication and login.
//
// The `token` header is the only accepted credential channel. Roles, trust, and
// account status always come from the database on the current request.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import type { AppConfig } from "../config.ts";
import { TRUST_LEVELS, USER_ROLES, type UserRole } from "../domain/constants.ts";
import { type AuthActor, AuthError } from "./capabilities.ts";
import { createSessionToken, JwtError, verifyAssertionToken, verifySessionToken } from "./jwt.ts";

const BEARER_PATTERN = /^Bearer\s/i;

export function readTokenHeader(headers: Headers): string | null {
  const token = headers.get("token");
  if (token === null) return null;
  if (BEARER_PATTERN.test(token)) {
    throw new AuthError(
      "UNAUTHENTICATED",
      "token header must not use the Bearer prefix",
      401,
    );
  }
  if (token.trim() === "") {
    throw new AuthError("UNAUTHENTICATED", "token header is empty", 401);
  }
  return token;
}

function rolesOf(user: Record<string, unknown>): UserRole[] {
  if (!Array.isArray(user.roles)) return [];
  const roles = user.roles.filter((role): role is UserRole =>
    typeof role === "string" && (USER_ROLES as readonly string[]).includes(role)
  );
  return [...new Set(roles)];
}

function trustLevelOf(user: Record<string, unknown>): AuthActor["trustLevel"] {
  return typeof user.trustLevel === "string" &&
      (TRUST_LEVELS as readonly string[]).includes(user.trustLevel)
    ? user.trustLevel as AuthActor["trustLevel"]
    : "NEW";
}

function actorOf(user: Record<string, unknown>): AuthActor {
  const _id = user._id as ObjectId;
  return {
    id: _id.toString(),
    roles: rolesOf(user),
    trustLevel: trustLevelOf(user),
    accountStatus: user.accountStatus as AuthActor["accountStatus"],
    ...(typeof user.displayName === "string" ? { displayName: user.displayName } : {}),
    ...(typeof user.preferredLocale === "string" ? { preferredLocale: user.preferredLocale } : {}),
  };
}

function assertActive(user: Record<string, unknown> | null): Record<string, unknown> {
  if (user === null) {
    throw new AuthError("UNAUTHENTICATED", "token subject no longer exists", 401);
  }
  if (user.accountStatus !== "ACTIVE") {
    throw new AuthError("FORBIDDEN", "account is not active", 403);
  }
  return user;
}

export async function authenticateRequest(input: {
  db: Db;
  headers: Headers;
  config: AppConfig;
}): Promise<AuthActor | null> {
  const token = readTokenHeader(input.headers);
  if (token === null) return null;

  let userId: string;
  try {
    ({ userId } = await verifySessionToken(token, input.config));
  } catch (error) {
    if (error instanceof JwtError) {
      throw new AuthError("UNAUTHENTICATED", "invalid or expired token", 401);
    }
    throw error;
  }

  const user = await input.db.collection("users").findOne({ _id: new ObjectId(userId) });
  return actorOf(assertActive(user as Record<string, unknown> | null));
}

export async function loginWithAssertion(input: {
  db: Db;
  config: AppConfig;
  providerToken: string;
}): Promise<{ token: string; expiresInSeconds: number; user: AuthActor }> {
  if (input.config.authAssertion.secret === undefined) {
    throw new AuthError("AUTH_LOGIN_DISABLED", "login is not configured", 503);
  }

  let assertion: { subject: string; provider: string };
  try {
    assertion = await verifyAssertionToken(input.providerToken, input.config);
  } catch (error) {
    if (error instanceof JwtError) {
      throw new AuthError("UNAUTHENTICATED", "invalid provider assertion", 401);
    }
    throw error;
  }

  const user = await input.db.collection("users").findOne({
    authProvider: assertion.provider,
    authSubject: assertion.subject,
  });
  const active = actorOf(assertActive(user as Record<string, unknown> | null));
  const token = await createSessionToken(active.id, input.config);
  return { token, expiresInSeconds: input.config.jwtExpiresInSeconds, user: active };
}
