// Plan 08 - stable envelope, pre-act authorization, strict validation, no leakage.
import { assert, assertEquals } from "@std/assert";
import { lesan, ObjectId } from "lesan";
import { buildModels } from "../../models/mod.ts";
import { registerActions } from "../../src/mod.ts";
import { createApi } from "../../utils/api/mod.ts";
import { createSessionToken } from "../../utils/auth/mod.ts";
import { loadConfig } from "../../utils/config.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

const CONFIG = loadConfig({
  ENV: "test",
  MONGO_URL: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
  DB_NAME: "ansoo_plan08_api",
  JWT_SECRET: "session-secret-".padEnd(48, "s"),
  JWT_ISSUER: "ansoo-api",
  JWT_AUDIENCE: "ansoo-front",
  AUTH_ASSERTION_SECRET: "assertion-secret-".padEnd(48, "a"),
  AUTH_ASSERTION_ISSUER: "ansoo-idp",
  AUTH_ASSERTION_AUDIENCE: "ansoo-api",
});

type Envelope = {
  success: boolean;
  // Test-only envelope: actions return different payloads per step.
  // deno-lint-ignore no-explicit-any
  body: any;
  requestId?: string;
};

async function request(
  api: ReturnType<typeof createApi>,
  body: unknown,
  token?: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; json: Envelope }> {
  const headers = new Headers({ "content-type": "application/json", ...extraHeaders });
  if (token !== undefined) headers.set("token", token);
  const response = await api.handle(
    new Request("http://api.test/lesan", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, json: await response.json() as Envelope };
}

async function seedUser(
  h: Awaited<ReturnType<typeof createHarness>>,
  roles: string[],
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const _id = new ObjectId();
  await h.db.collection("users").insertOne({
    _id,
    authProvider: "external",
    authSubject: `subject-${_id}`,
    email: `${_id}@example.test`,
    phone: "+15550000000",
    displayName: "Private Person",
    preferredLocale: "fa",
    roles,
    trustLevel: "NEW",
    accountStatus: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return { id: _id.toString() };
}

Deno.test({
  name: "api: auth, capability, envelope, projections, and strict validation",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan08_dispatch");
    try {
      const core = lesan();
      core.odm.setDb(h.db);
      buildModels(core);
      registerActions(core, { db: h.db, config: CONFIG });
      const api = createApi({ core, db: h.db, config: CONFIG });

      const researcher = await seedUser(h, ["RESEARCHER"]);
      const contributor = await seedUser(h, ["CONTRIBUTOR"]);
      const moderator = await seedUser(h, ["MODERATOR"]);
      const suspended = await seedUser(h, ["ADMIN"], { accountStatus: "SUSPENDED" });
      const token = {
        researcher: await createSessionToken(researcher.id, CONFIG),
        contributor: await createSessionToken(contributor.id, CONFIG),
        moderator: await createSessionToken(moderator.id, CONFIG),
        suspended: await createSessionToken(suspended.id, CONFIG),
      };

      const productId = new ObjectId();
      const claimId = new ObjectId();
      await h.db.collection("products").insertOne({
        _id: productId,
        name: "Public Soap",
        normalizedName: "public soap",
        matchKey: "public soap|",
        identifiers: [{
          _id: new ObjectId(),
          scheme: "GTIN",
          value: "0123456789012",
          normalizedValue: "0123456789012",
          status: "VERIFIED",
          sourceSnapshotIds: [new ObjectId()],
        }],
        brandMapping: { status: "UNMAPPED" },
        lifecycle: "ACTIVE",
        schemaVersion: 1,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await h.db.collection("claims").insertOne({
        _id: claimId,
        about: { type: "PRODUCT", id: productId },
        claimType: "PRODUCT_ORIGIN",
        claimTypeRegistryVersion: 1,
        statement: "Declared made in Iran",
        structuredValue: { claimType: "PRODUCT_ORIGIN", declaredOriginCountryCode: "IR" },
        recordLifecycle: "ACTIVE",
        assessment: {
          outcome: "SUPPORTED",
          methodologyVersion: "v1",
          limitations: [],
          assessedBy: new ObjectId(),
        },
        publication: { status: "PUBLISHED", decidedBy: new ObjectId() },
        evidence: [],
        organizationResponses: [],
        researchNotes: [{
          _id: new ObjectId(),
          authorId: new ObjectId(),
          body: "private research note",
          visibility: "INTERNAL_RESEARCH",
          createdAt: new Date(),
        }],
        recentRevisionPreview: [],
        recordedAt: new Date(),
        schemaVersion: 1,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await t.step("guests may read public data; deep get cannot widen it", async () => {
        const deepGet = {
          model: "products",
          act: "getPublicProfile",
          details: {
            set: { id: productId.toString() },
            get: { researchNotes: true, email: true, roles: true, score: true },
          },
        };
        const { status, json } = await request(api, deepGet);
        assertEquals(status, 200);
        assertEquals(json.success, true);
        assertEquals(json.body.product.name, "Public Soap");
        assertEquals(json.body.claims.length, 1);
        const raw = JSON.stringify(json);
        assertEquals(raw.includes("private research note"), false);
        assertEquals(raw.includes("assessedBy"), false);
        assertEquals(raw.includes("decidedBy"), false);
        assertEquals(raw.includes("sourceSnapshotIds"), false);
        assertEquals(raw.includes("score"), false);
      });

      await t.step("valid GTIN resolves the same public projection", async () => {
        const { status, json } = await request(api, {
          model: "products",
          act: "getPublicProfile",
          details: { set: { gtin: "0123456789012" } },
        });
        assertEquals(status, 200);
        assertEquals(json.body.product.name, "Public Soap");
        assertEquals(json.body.claims.length, 1);
      });

      await t.step("ambiguous id plus GTIN is rejected", async () => {
        const { status, json } = await request(api, {
          model: "products",
          act: "getPublicProfile",
          details: { set: { id: productId.toString(), gtin: "0123456789012" } },
        });
        assertEquals(status, 422);
        assertEquals(json.body.error.code, "VALIDATION_ERROR");
      });

      await t.step("invalid GTIN is a sanitized validation error", async () => {
        const { status, json } = await request(api, {
          model: "products",
          act: "getPublicProfile",
          details: { set: { gtin: "not-a-gtin" } },
        });
        assertEquals(status, 422);
        assertEquals(json.body.error.code, "VALIDATION_ERROR");
        assertEquals(JSON.stringify(json).includes("not-a-gtin"), false);
      });

      await t.step("suspended accounts are denied before the action runs", async () => {
        const { status, json } = await request(
          api,
          {
            model: "products",
            act: "getPublicProfile",
            details: { set: { id: productId.toString() } },
          },
          token.suspended,
        );
        assertEquals(status, 403);
        assertEquals(json.body.error.code, "FORBIDDEN");
      });

      await t.step("Bearer prefix and malformed tokens are 401", async () => {
        for (const value of [`Bearer ${token.researcher}`, "not-a-jwt"]) {
          const { status, json } = await request(
            api,
            { model: "users", act: "getMe", details: { set: {} } },
            value,
          );
          assertEquals(status, 401);
          assertEquals(json.body.error.code, "UNAUTHENTICATED");
        }
      });

      await t.step("research reads require a DB-derived role", async () => {
        const body = {
          model: "claims",
          act: "getResearch",
          details: { set: { id: claimId.toString() }, get: { researchNotes: true } },
        };
        const guest = await request(api, body);
        assertEquals(guest.status, 401);
        const weak = await request(api, body, token.contributor);
        assertEquals(weak.status, 403);
        assertEquals(weak.json.body.error.code, "FORBIDDEN");
        const strong = await request(api, body, token.researcher);
        assertEquals(strong.status, 200);
        assertEquals(strong.json.body.claim.researchNotes.length, 1);
        assertEquals(strong.json.body.claim.researchNotes[0].body, "private research note");
      });

      await t.step("audit reads are limited to legal, moderator, and admin", async () => {
        const body = { model: "auditEvents", act: "gets", details: { set: { limit: 5 } } };
        assertEquals((await request(api, body, token.researcher)).status, 403);
        assertEquals((await request(api, body, token.moderator)).status, 200);
      });

      await t.step("getMe returns a safe self projection only", async () => {
        const { status, json } = await request(
          api,
          { model: "users", act: "getMe", details: { set: {} } },
          token.contributor,
        );
        assertEquals(status, 200);
        assertEquals(json.body.user._id, contributor.id);
        assertEquals(json.body.user.roles, ["CONTRIBUTOR"]);
        const raw = JSON.stringify(json);
        assertEquals(raw.includes("@example.test"), false);
        assertEquals(raw.includes("+1555"), false);
        assertEquals(raw.includes("authSubject"), false);
        assertEquals(raw.includes("trustLevel"), false);
      });

      await t.step("unknown actions are 404 and never list registered names", async () => {
        const { status, json } = await request(api, {
          model: "products",
          act: "rawMongoQuery",
          details: { set: {} },
        });
        assertEquals(status, 404);
        assertEquals(json.body.error.code, "NOT_FOUND");
        const raw = JSON.stringify(json);
        assertEquals(raw.includes("getPublicProfile"), false);
        assertEquals(raw.includes("claims"), false);
      });

      await t.step(
        "validators reject unknown keys and opaque paths without echoing values",
        async () => {
          const oversized = await request(api, {
            model: "products",
            act: "getPublicProfile",
            details: { set: { id: "x".repeat(1_100_000) } },
          });
          assertEquals(oversized.status, 422);
          assertEquals(oversized.json.body.error.code, "VALIDATION_ERROR");

          const extra = await request(api, {
            model: "products",
            act: "getPublicProfile",
            details: { set: { id: productId.toString(), $where: "0; drop" } },
          });
          assertEquals(extra.status, 422);
          assertEquals(extra.json.body.error.code, "VALIDATION_ERROR");
          const raw = JSON.stringify(extra);
          assertEquals(raw.includes("$where"), false);
          assertEquals(raw.includes("drop"), false);

          const invalid = await request(api, {
            model: "claims",
            act: "getResearch",
            details: { set: { id: "not-an-object-id" } },
          }, token.researcher);
          assertEquals(invalid.status, 422);
          assertEquals(invalid.json.body.error.code, "VALIDATION_ERROR");
          assertEquals(JSON.stringify(invalid).includes("not-an-object-id"), false);
        },
      );

      await t.step("request ids are accepted or generated and returned", async () => {
        const supplied = await request(
          api,
          {
            model: "products",
            act: "getPublicProfile",
            details: { set: { id: productId.toString() } },
          },
          undefined,
          { "x-request-id": "req_test_123" },
        );
        assertEquals(supplied.json.requestId, "req_test_123");
        const generated = await request(api, {
          model: "products",
          act: "getPublicProfile",
          details: { set: { id: productId.toString() } },
        });
        assert(generated.json.requestId && generated.json.requestId.length > 10);
      });

      await t.step("login is rate limited with the stable 429 envelope", async () => {
        let response = { status: 0, json: {} as Envelope };
        for (let i = 0; i < 10; i++) {
          response = await request(api, {
            model: "users",
            act: "login",
            details: { set: { providerToken: "bad-token" } },
          });
          assertEquals(response.status, 401);
        }
        response = await request(api, {
          model: "users",
          act: "login",
          details: { set: { providerToken: "bad-token" } },
        });
        assertEquals(response.status, 429);
        assertEquals(response.json.body.error.code, "RATE_LIMITED");
        assert(response.json.body.error.retryAfterSeconds > 0);
      });
    } finally {
      await h.close();
    }
  },
});
