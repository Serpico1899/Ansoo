// Plan 08 - JWT mechanics, DB-derived roles, and account status enforcement.
import { assert, assertEquals } from "@std/assert";
import { create, getNumericDate } from "djwt";
import { ObjectId } from "lesan";
import {
  authenticateRequest,
  AuthError,
  createAssertionToken,
  createSessionToken,
  loginWithAssertion,
} from "../../utils/auth/mod.ts";
import { loadConfig } from "../../utils/config.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

const CONFIG = loadConfig({
  ENV: "test",
  MONGO_URL: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
  DB_NAME: "ansoo_plan08_auth",
  JWT_SECRET: "session-secret-".padEnd(48, "s"),
  JWT_ISSUER: "ansoo-api",
  JWT_AUDIENCE: "ansoo-front",
  AUTH_ASSERTION_SECRET: "assertion-secret-".padEnd(48, "a"),
  AUTH_ASSERTION_ISSUER: "ansoo-idp",
  AUTH_ASSERTION_AUDIENCE: "ansoo-api",
});

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function seedUser(
  h: Harness,
  overrides: Record<string, unknown> = {},
): Promise<{ _id: ObjectId; id: string }> {
  const _id = new ObjectId();
  await h.db.collection("users").insertOne({
    _id,
    authProvider: "external",
    authSubject: `subject-${_id}`,
    email: `${_id}@example.test`,
    displayName: "Test Person",
    preferredLocale: "en",
    roles: ["CONTRIBUTOR"],
    trustLevel: "NEW",
    accountStatus: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return { _id, id: _id.toString() };
}

function headers(token?: string): Headers {
  const value = new Headers();
  if (token !== undefined) value.set("token", token);
  return value;
}

async function rejection(promise: Promise<unknown>): Promise<AuthError> {
  try {
    await promise;
  } catch (error) {
    assert(error instanceof AuthError, "expected AuthError");
    return error;
  }
  throw new Error("expected rejection");
}

Deno.test({
  name: "auth: tokens carry identity only; roles and status come from the database",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan08_auth_jwt");
    try {
      const contributor = await seedUser(h, { roles: ["CONTRIBUTOR"] });
      const researcher = await seedUser(h, { roles: ["RESEARCHER"] });
      const suspended = await seedUser(h, {
        roles: ["ADMIN"],
        accountStatus: "SUSPENDED",
      });
      const closed = await seedUser(h, {
        roles: ["ADMIN"],
        accountStatus: "CLOSED",
      });

      await t.step("valid token authenticates with DB roles", async () => {
        const token = await createSessionToken(researcher.id, CONFIG);
        const actor = await authenticateRequest({
          db: h.db,
          headers: headers(token),
          config: CONFIG,
        });
        assertEquals(actor?.id, researcher.id);
        assertEquals(actor?.roles, ["RESEARCHER"]);
        assertEquals(actor?.accountStatus, "ACTIVE");
      });

      await t.step("inflated token claims are ignored", async () => {
        const token = await createSessionToken(contributor.id, CONFIG, {
          claims: {
            roles: ["ADMIN"],
            trustLevel: "TRUSTED",
            accountStatus: "ACTIVE",
          },
        });
        const actor = await authenticateRequest({
          db: h.db,
          headers: headers(token),
          config: CONFIG,
        });
        assertEquals(actor?.roles, ["CONTRIBUTOR"]);
        assertEquals(actor?.trustLevel, "NEW");
      });

      await t.step("Bearer prefix is rejected", async () => {
        const token = await createSessionToken(contributor.id, CONFIG);
        const error = await rejection(
          authenticateRequest({ db: h.db, headers: headers(`Bearer ${token}`), config: CONFIG }),
        );
        assertEquals(error.code, "UNAUTHENTICATED");
        assertEquals(error.status, 401);
      });

      await t.step("missing, malformed, expired, and wrong-signature tokens fail 401", async () => {
        assertEquals(
          await authenticateRequest({ db: h.db, headers: headers(), config: CONFIG }),
          null,
        );
        const malformed = await rejection(
          authenticateRequest({ db: h.db, headers: headers("not-a-jwt"), config: CONFIG }),
        );
        assertEquals(malformed.status, 401);

        const expired = await createSessionToken(contributor.id, CONFIG, {
          expiresInSeconds: -10,
        });
        assertEquals(
          (await rejection(
            authenticateRequest({ db: h.db, headers: headers(expired), config: CONFIG }),
          )).status,
          401,
        );

        const wrongConfig = loadConfig({
          ENV: "test",
          MONGO_URL: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
          DB_NAME: "x",
          JWT_SECRET: "another-secret-".padEnd(48, "x"),
          JWT_ISSUER: "ansoo-api",
          JWT_AUDIENCE: "ansoo-front",
        });
        const wrong = await createSessionToken(contributor.id, wrongConfig);
        assertEquals(
          (await rejection(
            authenticateRequest({ db: h.db, headers: headers(wrong), config: CONFIG }),
          )).status,
          401,
        );
      });

      await t.step("issuer, audience, subject, and user existence are validated", async () => {
        const wrongIssuerConfig = loadConfig({
          ENV: "test",
          MONGO_URL: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
          DB_NAME: "x",
          JWT_SECRET: "session-secret-".padEnd(48, "s"),
          JWT_ISSUER: "someone-else",
          JWT_AUDIENCE: "ansoo-front",
        });
        const noIssuer = await createSessionToken(contributor.id, wrongIssuerConfig);
        assertEquals(
          (await rejection(
            authenticateRequest({ db: h.db, headers: headers(noIssuer), config: CONFIG }),
          )).status,
          401,
        );

        const wrongAudienceConfig = loadConfig({
          ENV: "test",
          MONGO_URL: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
          DB_NAME: "x",
          JWT_SECRET: "session-secret-".padEnd(48, "s"),
          JWT_ISSUER: "ansoo-api",
          JWT_AUDIENCE: "other-app",
        });
        const badAudience = await createSessionToken(contributor.id, wrongAudienceConfig);
        assertEquals(
          (await rejection(
            authenticateRequest({ db: h.db, headers: headers(badAudience), config: CONFIG }),
          )).status,
          401,
        );

        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(CONFIG.jwtSecret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const notAUser = await create(
          { alg: "HS256", typ: "JWT" },
          {
            sub: "not-an-object-id",
            iss: "ansoo-api",
            aud: "ansoo-front",
            exp: getNumericDate(60),
          },
          key,
        );
        assertEquals(
          (await rejection(
            authenticateRequest({ db: h.db, headers: headers(notAUser), config: CONFIG }),
          )).status,
          401,
        );

        const missing = await createSessionToken(new ObjectId().toString(), CONFIG);
        assertEquals(
          (await rejection(
            authenticateRequest({ db: h.db, headers: headers(missing), config: CONFIG }),
          )).status,
          401,
        );
      });

      await t.step("suspended and closed accounts are denied even with a valid token", async () => {
        for (const user of [suspended, closed]) {
          const token = await createSessionToken(user.id, CONFIG);
          const error = await rejection(
            authenticateRequest({ db: h.db, headers: headers(token), config: CONFIG }),
          );
          assertEquals(error.status, 403);
          assertEquals(error.code, "FORBIDDEN");
        }
      });

      await t.step("login exchanges a provider assertion for a session token", async () => {
        const providerToken = await createAssertionToken(
          { sub: `subject-${researcher._id}`, provider: "external" },
          CONFIG,
        );
        const session = await loginWithAssertion({
          db: h.db,
          config: CONFIG,
          providerToken,
        });
        assert(session.token.length > 20);
        assertEquals(session.user.roles, ["RESEARCHER"]);
        const actor = await authenticateRequest({
          db: h.db,
          headers: headers(session.token),
          config: CONFIG,
        });
        assertEquals(actor?.id, researcher.id);
      });

      await t.step(
        "login rejects bad assertions, unknown users, and disabled providers",
        async () => {
          const unknown = await createAssertionToken(
            { sub: "unknown-provider-subject", provider: "external" },
            CONFIG,
          );
          assertEquals(
            (await rejection(
              loginWithAssertion({ db: h.db, config: CONFIG, providerToken: unknown }),
            )).status,
            401,
          );

          const wrongAudienceConfig = loadConfig({
            ENV: "test",
            MONGO_URL: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
            DB_NAME: "x",
            JWT_SECRET: "session-secret-".padEnd(48, "s"),
            AUTH_ASSERTION_SECRET: "assertion-secret-".padEnd(48, "a"),
            AUTH_ASSERTION_AUDIENCE: "other",
          });
          const wrongAudience = await createAssertionToken(
            { sub: `subject-${researcher._id}`, provider: "external" },
            wrongAudienceConfig,
          );
          assertEquals(
            (await rejection(
              loginWithAssertion({ db: h.db, config: CONFIG, providerToken: wrongAudience }),
            )).status,
            401,
          );

          const disabled = loadConfig({
            ENV: "test",
            MONGO_URL: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
            DB_NAME: "x",
            JWT_SECRET: "session-secret-".padEnd(48, "s"),
          });
          const error = await rejection(
            loginWithAssertion({ db: h.db, config: disabled, providerToken: "anything" }),
          );
          assertEquals(error.code, "AUTH_LOGIN_DISABLED");
          assertEquals(error.status, 503);
        },
      );
    } finally {
      await h.close();
    }
  },
});
