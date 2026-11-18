// Plan 07 - User roles, trust, status, PII purge, and public projections.
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import {
  publicUserView,
  purgeUserPii,
  setUserAccountStatus,
  setUserRoles,
  setUserTrustLevel,
} from "../../utils/governance/mod.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

async function user(
  h: Awaited<ReturnType<typeof createHarness>>,
  roles: string[],
  overrides: Record<string, unknown> = {},
) {
  const _id = new ObjectId();
  await h.db.collection("users").insertOne({
    _id,
    authProvider: "test",
    authSubject: `subject-${_id}`,
    email: `${_id}@example.test`,
    emailNormalized: `${_id}@example.test`,
    phone: "+15550000000",
    displayName: "Private Person",
    preferredLocale: "fa",
    accountStatus: "ACTIVE",
    roles,
    trustLevel: "REGULAR",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return { type: "USER" as const, id: _id };
}

async function rejection(promise: Promise<unknown>): Promise<{ code: string; status?: number }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; status?: number };
  }
  throw new Error("expected rejection");
}

Deno.test({
  name: "users: roles, trust, status, and PII purge are authorized and audited",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan07_users");
    try {
      const admin = await user(h, ["ADMIN"]);
      const moderator = await user(h, ["MODERATOR"]);
      const target = await user(h, ["CONTRIBUTOR"]);
      const trusted = await user(h, [], { trustLevel: "TRUSTED" });
      const now = new Date("2026-07-01T00:00:00Z");

      await t.step("roles require ADMIN and are validated against the closed enum", async () => {
        assertEquals(
          (await rejection(setUserRoles({
            db: h.db,
            userId: target.id!,
            roles: ["RESEARCHER"],
            expectedVersion: 1,
            actor: moderator,
          }))).code,
          "FORBIDDEN",
        );
        const updated = await setUserRoles({
          db: h.db,
          userId: target.id!,
          roles: ["RESEARCHER", "RESEARCH_REVIEWER"],
          expectedVersion: 1,
          actor: admin,
          now,
        });
        assertEquals(updated.version, 2);
        assertEquals(updated.roles, ["RESEARCHER", "RESEARCH_REVIEWER"]);
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            action: "USER_ROLES_CHANGED",
            "target.id": target.id,
          }),
          1,
        );
        assertEquals(
          (await rejection(setUserRoles({
            db: h.db,
            userId: target.id!,
            roles: ["SUPERADMIN" as "ADMIN"],
            expectedVersion: updated.version,
            actor: admin,
          }))).code,
          "INVALID_USER_ROLE",
        );
      });

      await t.step("trust is not authorization and never bypasses roles", async () => {
        assertEquals(
          (await rejection(setUserRoles({
            db: h.db,
            userId: trusted.id!,
            roles: ["ADMIN"],
            expectedVersion: 1,
            actor: trusted,
          }))).code,
          "FORBIDDEN",
        );
        const changed = await setUserTrustLevel({
          db: h.db,
          userId: target.id!,
          trustLevel: "TRUSTED",
          expectedVersion: 2,
          actor: admin,
          now,
        });
        assertEquals(changed.trustLevel, "TRUSTED");
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            action: "USER_TRUST_CHANGED",
            "target.id": target.id,
          }),
          1,
        );
      });

      await t.step("status changes are moderated and suspended users cannot act", async () => {
        assertEquals(
          (await rejection(setUserAccountStatus({
            db: h.db,
            userId: trusted.id!,
            accountStatus: "SUSPENDED",
            expectedVersion: 1,
            actor: trusted,
          }))).code,
          "FORBIDDEN",
        );
        const suspended = await setUserAccountStatus({
          db: h.db,
          userId: trusted.id!,
          accountStatus: "SUSPENDED",
          expectedVersion: 1,
          actor: moderator,
          now,
        });
        assertEquals(suspended.accountStatus, "SUSPENDED");
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            action: "USER_STATUS_CHANGED",
            "target.id": trusted.id,
          }),
          1,
        );
      });

      await t.step("PII purge leaves a tombstone and never mutates audit", async () => {
        const beforeAudit = await h.db.collection("audit_events").countDocuments();
        const purged = await purgeUserPii({
          db: h.db,
          userId: target.id!,
          expectedVersion: 3,
          actor: admin,
          now,
        });
        assertEquals(purged.accountStatus, "CLOSED");
        const doc = await h.db.collection("users").findOne({ _id: target.id });
        assert(doc);
        assertEquals(doc.email, undefined);
        assertEquals(doc.emailNormalized, undefined);
        assertEquals(doc.phone, undefined);
        assertEquals(doc.displayName, undefined);
        assertEquals(doc.preferredLocale, undefined);
        assertEquals(doc.roles, []);
        assert(String(doc.authSubject).startsWith("purged:"));
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            action: "USER_PII_PURGED",
            "target.id": target.id,
          }),
          1,
        );
        assertEquals(await h.db.collection("audit_events").countDocuments(), beforeAudit + 1);
        const purgeAudit = await h.db.collection("audit_events").findOne({
          action: "USER_PII_PURGED",
          "target.id": target.id,
        });
        assert(purgeAudit);
        const text = JSON.stringify(purgeAudit);
        assert(!text.includes("@example.test"));
        assert(!text.includes("+15550000000"));
        assert(!text.includes("Private Person"));
      });

      await t.step("public projection never exposes PII or roles", () => {
        const projected = publicUserView({
          _id: target.id,
          email: "private@example.test",
          phone: "+15550000000",
          authSubject: "subject",
          roles: ["ADMIN"],
          displayName: "Private Person",
        });
        assertEquals(Object.keys(projected), ["_id"]);
        assertEquals(projected._id, target.id);
      });
    } finally {
      await h.close();
    }
  },
});
