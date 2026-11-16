// Disposable JWT auth and server-derived authorization for the spike.
//
// The token travels in the `token` header (no `Bearer` prefix). Roles are
// loaded from the users collection on every request. Any role/trustLevel claim
// in the token is ignored.
import { create, getNumericDate, type Payload, verify } from "djwt";
import { type Db, ObjectId } from "lesan";
import { ROLES } from "./models.ts";

export type Role = (typeof ROLES)[number];

export interface AuthUser {
  _id: string;
  displayName: string;
  roles: Role[];
  trustLevel: number;
  accountStatus: "ACTIVE" | "SUSPENDED" | "CLOSED";
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

const encoder = new TextEncoder();

export async function importJwtKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signUserToken(
  userId: string,
  secret: string,
  extraClaims: Record<string, unknown> = {},
  expiresInSeconds = 3600,
): Promise<string> {
  const key = await importJwtKey(secret);
  const payload: Payload = {
    sub: userId,
    exp: getNumericDate(expiresInSeconds),
    iat: getNumericDate(0),
    ...extraClaims,
  };
  return await create({ alg: "HS256", typ: "JWT" }, payload, key);
}

export function readTokenHeader(headers: Headers): string | null {
  const token = headers.get("token");
  if (!token) return null;
  if (token.startsWith("Bearer ")) {
    throw new AuthError(401, "token header must not use the Bearer prefix");
  }
  return token;
}

export async function loadAuthUser(
  db: Db,
  headers: Headers,
  secret: string,
): Promise<AuthUser | null> {
  const token = readTokenHeader(headers);
  if (!token) return null;

  let payload: Payload;
  try {
    payload = await verify(token, await importJwtKey(secret));
  } catch {
    throw new AuthError(401, "invalid or expired token");
  }

  if (typeof payload.sub !== "string" || !/^[a-f0-9]{24}$/i.test(payload.sub)) {
    throw new AuthError(401, "token subject is not a user id");
  }

  const user = await db.collection("users").findOne({
    _id: new ObjectId(payload.sub),
  });
  if (!user) throw new AuthError(401, "token subject no longer exists");
  if (user.accountStatus !== "ACTIVE") {
    throw new AuthError(403, "account is not active");
  }

  return {
    _id: user._id.toString(),
    displayName: String(user.displayName),
    roles: Array.isArray(user.roles) ? (user.roles as Role[]) : [],
    trustLevel: Number(user.trustLevel ?? 0),
    accountStatus: user.accountStatus,
  };
}

export function hasRole(user: AuthUser | null, role: Role): boolean {
  return !!user && user.roles.includes(role);
}

export function isStaff(user: AuthUser | null): boolean {
  return !!user && user.roles.some((role) => role !== "CONTRIBUTOR");
}

export function requireRole(user: AuthUser | null, ...roles: Role[]): AuthUser {
  if (!user) throw new AuthError(401, "authentication required");
  if (!roles.some((role) => user.roles.includes(role))) {
    throw new AuthError(403, "insufficient role");
  }
  return user;
}

// Authorization matrix used by the spike. `GUEST` is the absence of a user.
export const AUTH_MATRIX = {
  publicProfileRead: ["GUEST", ...ROLES],
  publicSearch: ["GUEST", ...ROLES],
  researchQueueRead: ["RESEARCHER", "LEGAL_REVIEWER", "MODERATOR", "ADMIN"],
  researchQueueWrite: ["RESEARCHER", "MODERATOR", "ADMIN"],
  legalReview: ["LEGAL_REVIEWER", "ADMIN"],
  publicationDecision: ["MODERATOR", "ADMIN"],
  correctionReview: ["RESEARCHER", "MODERATOR", "ADMIN"],
  auditRead: ["MODERATOR", "ADMIN"],
  userAdministration: ["ADMIN"],
  privateAssetRead: ["RESEARCHER", "LEGAL_REVIEWER", "MODERATOR", "ADMIN"],
} as const;

export function can(
  user: AuthUser | null,
  capability: keyof typeof AUTH_MATRIX,
): boolean {
  const allowed = AUTH_MATRIX[capability] as readonly string[];
  if (allowed.includes("GUEST") && !user) return true;
  if (!user) return false;
  return user.roles.some((role) => allowed.includes(role));
}

export function requireCapability(
  user: AuthUser | null,
  capability: keyof typeof AUTH_MATRIX,
): void {
  if (!can(user, capability)) {
    throw new AuthError(user ? 403 : 401, "capability denied");
  }
}
