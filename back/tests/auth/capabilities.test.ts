// Plan 08 - capability matrix and server-derived authorization.
import { assert, assertEquals } from "@std/assert";
import {
  type AuthActor,
  CAPABILITIES,
  type Capability,
  CAPABILITY_MATRIX,
  hasCapability,
  requireCapability,
  UPLOAD_CAPABILITIES,
} from "../../utils/auth/mod.ts";
import { USER_ROLES, type UserRole } from "../../utils/domain/constants.ts";

function actor(roles: UserRole[], overrides: Partial<AuthActor> = {}): AuthActor {
  return {
    id: "507f1f77bcf86cd799439011",
    roles,
    trustLevel: "NEW",
    accountStatus: "ACTIVE",
    ...overrides,
  };
}

function denied(actorValue: AuthActor | null, capability: Capability): number | undefined {
  try {
    requireCapability(actorValue, capability);
  } catch (error) {
    return (error as { status?: number }).status;
  }
  return undefined;
}

Deno.test("capabilities: every role can read public data and guests are public-only", () => {
  assertEquals(CAPABILITY_MATRIX.READ_PUBLIC.includes("GUEST"), true);
  for (const role of USER_ROLES) {
    assert(hasCapability(actor([role]), "READ_PUBLIC"), role);
  }
  assert(hasCapability(null, "READ_PUBLIC"));
  for (const capability of CAPABILITIES.filter((item) => item !== "READ_PUBLIC")) {
    assertEquals(hasCapability(null, capability), false, capability);
    assertEquals(denied(null, capability), 401, capability);
  }
});

Deno.test("capabilities: baseline matrix matches the approved plan", () => {
  const expected: Record<Capability, readonly string[]> = {
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
  };
  assertEquals(Object.keys(CAPABILITY_MATRIX).sort(), Object.keys(expected).sort());
  for (const [capability, roles] of Object.entries(expected)) {
    assertEquals(
      [...CAPABILITY_MATRIX[capability as Capability]].sort(),
      [...roles].sort(),
      capability,
    );
  }
  assertEquals(
    Object.keys(UPLOAD_CAPABILITIES).sort(),
    ["UPLOAD_EVIDENCE_ASSET", "UPLOAD_RESPONSE_ASSET"],
  );
});

Deno.test("capabilities: every role x capability cell obeys the matrix", () => {
  for (const capability of CAPABILITIES) {
    for (const role of USER_ROLES) {
      const expected = (CAPABILITY_MATRIX[capability] as readonly string[]).includes(role);
      assertEquals(hasCapability(actor([role]), capability), expected, `${role} ${capability}`);
      assertEquals(denied(actor([role]), capability), expected ? undefined : 403);
    }
  }
  for (const [capability, roles] of Object.entries(UPLOAD_CAPABILITIES)) {
    for (const role of USER_ROLES) {
      const expected = (roles as readonly string[]).includes(role);
      assertEquals(
        hasCapability(actor([role]), capability as keyof typeof UPLOAD_CAPABILITIES),
        expected,
        `${role} ${capability}`,
      );
    }
  }
});

Deno.test("capabilities: denials are 403 and trustLevel never grants access", () => {
  const contributor = actor(["CONTRIBUTOR"]);
  assertEquals(denied(contributor, "PUBLISH_FINDING"), 403);
  assertEquals(denied(contributor, "READ_AUDIT"), 403);
  assertEquals(denied(contributor, "CREATE_RESEARCH"), 403);
  assertEquals(denied(contributor, "SUBMIT_CORRECTION"), undefined);

  const trusted = actor(["CONTRIBUTOR"], { trustLevel: "TRUSTED" });
  assertEquals(hasCapability(trusted, "PUBLISH_FINDING"), false);
  assertEquals(denied(trusted, "MANAGE_USERS"), 403);

  const suspended = actor(["ADMIN"], { accountStatus: "SUSPENDED" });
  assertEquals(denied(suspended, "READ_PUBLIC"), 403);
  assertEquals(denied(suspended, "MANAGE_USERS"), 403);
});

Deno.test("capabilities: uploads are a separate policy from research writes", () => {
  const legal = actor(["LEGAL_REVIEWER"]);
  assertEquals(hasCapability(legal, "ADD_EVIDENCE"), true);
  assertEquals(hasCapability(legal, "CREATE_RESEARCH"), false);
  assertEquals(hasCapability(legal, "UPLOAD_EVIDENCE_ASSET"), true);

  const contributor = actor(["CONTRIBUTOR"]);
  assertEquals(hasCapability(contributor, "UPLOAD_EVIDENCE_ASSET"), false);
  assertEquals(hasCapability(contributor, "UPLOAD_RESPONSE_ASSET"), false);

  assertEquals(CAPABILITY_MATRIX.READ_PUBLIC.includes("TRUSTED" as UserRole), false);
});
