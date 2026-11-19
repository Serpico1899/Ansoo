// Plan 08 - one server-side capability matrix.
//
// `roles` is authorization. `trustLevel` is deliberately absent from this file:
// it never grants a capability. Guests are represented by the absence of a user.
import type { AccountStatus, TrustLevel, UserRole } from "../domain/constants.ts";
import { USER_ROLES } from "../domain/constants.ts";

export type GuestRole = "GUEST";
export type MatrixRole = GuestRole | UserRole;

export const CAPABILITIES = [
  "READ_PUBLIC",
  "SUBMIT_CORRECTION",
  "READ_RESEARCH",
  "CREATE_RESEARCH",
  "ADD_EVIDENCE",
  "ASSESS_EVIDENCE",
  "REVIEW_CORRECTION",
  "PUBLISH_FINDING",
  "LEGAL_SIGN_OFF",
  "READ_AUDIT",
  "MANAGE_USERS",
] as const;

export type Capability = typeof CAPABILITIES[number];

export const UPLOAD_CAPABILITIES = {
  UPLOAD_EVIDENCE_ASSET: [
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "LEGAL_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ],
  UPLOAD_RESPONSE_ASSET: [
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "LEGAL_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ],
} as const satisfies Record<string, readonly UserRole[]>;

export type UploadCapability = keyof typeof UPLOAD_CAPABILITIES;

export const CAPABILITY_MATRIX = {
  READ_PUBLIC: ["GUEST", ...USER_ROLES],
  SUBMIT_CORRECTION: [...USER_ROLES],
  READ_RESEARCH: [
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "LEGAL_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ],
  CREATE_RESEARCH: ["RESEARCHER", "RESEARCH_REVIEWER", "MODERATOR", "ADMIN"],
  ADD_EVIDENCE: [
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "LEGAL_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ],
  ASSESS_EVIDENCE: [
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "LEGAL_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ],
  REVIEW_CORRECTION: [
    "RESEARCH_REVIEWER",
    "LEGAL_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ],
  PUBLISH_FINDING: ["MODERATOR", "ADMIN"],
  LEGAL_SIGN_OFF: ["LEGAL_REVIEWER", "ADMIN"],
  READ_AUDIT: ["LEGAL_REVIEWER", "MODERATOR", "ADMIN"],
  MANAGE_USERS: ["ADMIN"],
} as const satisfies Record<Capability, readonly MatrixRole[]>;

export type AuthActor = {
  id: string;
  roles: UserRole[];
  trustLevel: TrustLevel;
  accountStatus: AccountStatus;
  displayName?: string;
  preferredLocale?: string;
};

export class AuthError extends Error {
  constructor(
    readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "AUTH_LOGIN_DISABLED",
    message: string,
    readonly status: 401 | 403 | 503,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function hasCapability(
  actor: AuthActor | null,
  capability: Capability | UploadCapability,
): boolean {
  if (actor !== null && actor.accountStatus !== "ACTIVE") return false;
  const allowed = capability in UPLOAD_CAPABILITIES
    ? UPLOAD_CAPABILITIES[capability as UploadCapability]
    : CAPABILITY_MATRIX[capability as Capability];
  if (actor === null) return (allowed as readonly string[]).includes("GUEST");
  return actor.roles.some((role) => (allowed as readonly string[]).includes(role));
}

export function requireCapability(
  actor: AuthActor | null,
  capability: Capability | UploadCapability,
): void {
  if (actor !== null && actor.accountStatus !== "ACTIVE") {
    throw new AuthError("FORBIDDEN", "account is not active", 403);
  }
  if (hasCapability(actor, capability)) return;
  if (actor === null) {
    throw new AuthError("UNAUTHENTICATED", "authentication required", 401);
  }
  throw new AuthError("FORBIDDEN", "capability denied", 403);
}
