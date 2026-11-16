// Spike task 9: JWT auth, server-derived roles, and capability matrix.
import { assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, seedUser } from "../spike/harness.ts";
import {
  AuthError,
  can,
  loadAuthUser,
  requireCapability,
  requireRole,
  signUserToken,
} from "../spike/auth.ts";

async function expectAuthError(
  fn: () => Promise<unknown>,
  status: number,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    assertEquals(error.status, status);
    return;
  }
  throw new Error(`expected AuthError ${status}`);
}

function headersWith(token?: string) {
  const headers = new Headers();
  if (token) headers.set("token", token);
  return headers;
}

Deno.test({
  name: "spike: auth derives roles from the database and guests stay public-only",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_auth");
    try {
      const secret = h.jwtSecret;

      await t.step("guests may read public surfaces only", async () => {
        const guest = await loadAuthUser(h.db, headersWith(), secret);
        assertEquals(guest, null);
        assertEquals(can(guest, "publicProfileRead"), true);
        assertEquals(can(guest, "publicSearch"), true);
        for (
          const capability of [
            "researchQueueRead",
            "researchQueueWrite",
            "legalReview",
            "publicationDecision",
            "correctionReview",
            "auditRead",
            "userAdministration",
            "privateAssetRead",
          ] as const
        ) {
          assertEquals(can(guest, capability), false, capability);
        }
        try {
          requireCapability(guest, "researchQueueRead");
          throw new Error("expected denial");
        } catch (error) {
          assertEquals(error instanceof AuthError, true);
          assertEquals((error as AuthError).status, 401);
        }
      });

      await t.step("the token header rejects the Bearer prefix", async () => {
        await expectAuthError(
          () => loadAuthUser(h.db, headersWith("Bearer abc.def.ghi"), secret),
          401,
        );
      });

      const contributorId = await seedUser(h, {
        roles: ["CONTRIBUTOR"],
        trustLevel: 1,
      });
      const contributorToken = await signUserToken(contributorId, secret);

      await t.step("roles come from the database, not token claims", async () => {
        // A client-inflated token claims ADMIN. The database says CONTRIBUTOR.
        const inflated = await signUserToken(contributorId, secret, {
          roles: ["ADMIN"],
          trustLevel: 99,
        });
        const user = await loadAuthUser(h.db, headersWith(inflated), secret);
        assertEquals(user!.roles, ["CONTRIBUTOR"]);
        assertEquals(user!.trustLevel, 1);
        assertEquals(can(user, "userAdministration"), false);
        assertEquals(can(user, "auditRead"), false);
        assertEquals(can(user, "publicProfileRead"), true);
      });

      await t.step("trustLevel is not authorization", async () => {
        const trustedId = await seedUser(h, {
          roles: ["CONTRIBUTOR"],
          trustLevel: 100,
        });
        const token = await signUserToken(trustedId, secret);
        const user = await loadAuthUser(h.db, headersWith(token), secret);
        assertEquals(can(user, "auditRead"), false);
        assertEquals(can(user, "publicationDecision"), false);
      });

      await t.step("bad signature, expired token, and bad subject fail", async () => {
        const wrongSecret = "not-the-spike-secret";
        const wrong = await signUserToken(contributorId, wrongSecret);
        await expectAuthError(
          () => loadAuthUser(h.db, headersWith(wrong), secret),
          401,
        );
        const expired = await signUserToken(contributorId, secret, {}, -10);
        await expectAuthError(
          () => loadAuthUser(h.db, headersWith(expired), secret),
          401,
        );
        const badSubject = await signUserToken("not-an-object-id", secret);
        await expectAuthError(
          () => loadAuthUser(h.db, headersWith(badSubject), secret),
          401,
        );
        const missingUser = await signUserToken(
          new ObjectId().toString(),
          secret,
        );
        await expectAuthError(
          () => loadAuthUser(h.db, headersWith(missingUser), secret),
          401,
        );
      });

      await t.step("suspended and closed accounts are denied", async () => {
        for (const accountStatus of ["SUSPENDED", "CLOSED"] as const) {
          const userId = await seedUser(h, { roles: ["ADMIN"], accountStatus });
          const token = await signUserToken(userId, secret);
          await expectAuthError(
            () => loadAuthUser(h.db, headersWith(token), secret),
            403,
          );
        }
      });

      await t.step("capability matrix is role-separated", async () => {
        const researcherId = await seedUser(h, { roles: ["RESEARCHER"] });
        const legalId = await seedUser(h, { roles: ["LEGAL_REVIEWER"] });
        const moderatorId = await seedUser(h, { roles: ["MODERATOR"] });
        const adminId = await seedUser(h, { roles: ["ADMIN"] });

        const researcher = await loadAuthUser(
          h.db,
          headersWith(await signUserToken(researcherId, secret)),
          secret,
        );
        const legal = await loadAuthUser(
          h.db,
          headersWith(await signUserToken(legalId, secret)),
          secret,
        );
        const moderator = await loadAuthUser(
          h.db,
          headersWith(await signUserToken(moderatorId, secret)),
          secret,
        );
        const admin = await loadAuthUser(
          h.db,
          headersWith(await signUserToken(adminId, secret)),
          secret,
        );

        assertEquals(can(researcher, "researchQueueRead"), true);
        assertEquals(can(researcher, "researchQueueWrite"), true);
        assertEquals(can(researcher, "legalReview"), false);
        assertEquals(can(researcher, "publicationDecision"), false);
        assertEquals(can(researcher, "auditRead"), false);

        assertEquals(can(legal, "legalReview"), true);
        assertEquals(can(legal, "researchQueueRead"), true);
        assertEquals(can(legal, "researchQueueWrite"), false);
        assertEquals(can(legal, "publicationDecision"), false);

        assertEquals(can(moderator, "publicationDecision"), true);
        assertEquals(can(moderator, "auditRead"), true);
        assertEquals(can(moderator, "legalReview"), false);
        assertEquals(can(moderator, "userAdministration"), false);

        for (
          const capability of Object.keys(
            (await import("../spike/auth.ts")).AUTH_MATRIX,
          ) as Array<Parameters<typeof can>[1]>
        ) {
          assertEquals(can(admin, capability), true, capability);
        }
      });

      await t.step("requireRole distinguishes anonymous from under-privileged", async () => {
        const contributor = await loadAuthUser(
          h.db,
          headersWith(contributorToken),
          secret,
        );
        try {
          requireRole(null, "MODERATOR");
          throw new Error("expected denial");
        } catch (error) {
          assertEquals((error as AuthError).status, 401);
        }
        try {
          requireRole(contributor, "MODERATOR");
          throw new Error("expected denial");
        } catch (error) {
          assertEquals((error as AuthError).status, 403);
        }
        assertEquals(requireRole(contributor, "CONTRIBUTOR")._id, contributorId);
      });

      await t.step("public surfaces remain open to every role", async () => {
        for (
          const roles of [
            ["CONTRIBUTOR"],
            ["RESEARCHER"],
            ["LEGAL_REVIEWER"],
            ["MODERATOR"],
            ["ADMIN"],
          ]
        ) {
          const userId = await seedUser(h, { roles });
          const user = await loadAuthUser(
            h.db,
            headersWith(await signUserToken(userId, secret)),
            secret,
          );
          assertEquals(can(user, "publicProfileRead"), true, roles.join());
          assertEquals(can(user, "publicSearch"), true, roles.join());
        }
      });
    } finally {
      await h.close();
    }
  },
});
