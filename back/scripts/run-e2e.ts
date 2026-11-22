// Plan 11 - reproducible HTTP E2E harness.
//
// Drops a dedicated database, seeds canonical documents, starts the real server
// with test-only configuration, and runs http/e2e.hurl against it. No secret is
// committed: JWT and assertion secrets are generated per run.
import { MongoClient, ObjectId } from "lesan";
import { createIndexes } from "../models/indexes.ts";
import { ensureReadModelIndexes, rebuildProfile } from "../utils/publicProfile/readModel.ts";
import { createAssertionToken } from "../utils/auth/jwt.ts";
import { loadConfig } from "../utils/config.ts";

const NOW = new Date("2026-08-01T12:00:00.000Z");
const MONGO_URL = Deno.env.get("MONGO_URL") ?? "mongodb://127.0.0.1:27019/?replicaSet=rs0";
const DB_NAME = Deno.env.get("E2E_DB_NAME") ?? "ansoo_e2e";
const PORT = Number(Deno.env.get("E2E_PORT") ?? "1371");
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PROVIDER = "ansoo-e2e-idp";

const BACK_ROOT = new URL("../", import.meta.url).pathname;
const HURL_FILE = new URL("../http/e2e.hurl", import.meta.url).pathname;
const MOD_FILE = new URL("../mod.ts", import.meta.url).pathname;

const ID = {
  admin: oid(101),
  contributor: oid(102),
  researcher: oid(103),
  moderator: oid(104),
  suspended: oid(105),
  brand: oid(201),
  organization: oid(202),
  product: oid(301),
  survivor: oid(302),
  merged: oid(303),
  ambiguousA: oid(304),
  ambiguousB: oid(305),
  disputed: oid(306),
  source: oid(402),
  snapshot: oid(401),
  productClaim: oid(501),
  brandClaim: oid(502),
  organizationClaim: oid(503),
  ownershipEdge: oid(601),
  correction: oid(701),
  auditRecent: oid(801),
  auditOlder: oid(802),
} as const;

const GTIN = "0006381333935";
const UNVERIFIED_GTIN = "00000000000307";
const AMBIGUOUS_GTIN = "00000000000109";
const DISPUTED_GTIN = "00000000000208";
const MERGED_GTIN = "00000000000604";

function oid(value: number): ObjectId {
  return new ObjectId(value.toString(16).padStart(24, "0"));
}

function secret(): string {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}

function identifier(value: string, status = "VERIFIED") {
  return {
    _id: new ObjectId(),
    scheme: "GTIN",
    value,
    normalizedValue: value,
    matchValue: value.padStart(14, "0"),
    status,
  };
}

function user(id: ObjectId, subject: string, roles: string[], accountStatus = "ACTIVE") {
  return {
    _id: id,
    authProvider: PROVIDER,
    authSubject: subject,
    email: `${subject}@e2e.example`,
    phone: "+15550001000",
    displayName: `${subject} E2E`,
    preferredLocale: "en",
    roles,
    trustLevel: "NEW",
    accountStatus,
    schemaVersion: 1,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function base(id: ObjectId, extra: Record<string, unknown> = {}) {
  return {
    _id: id,
    schemaVersion: 1,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

async function seed(db: ReturnType<MongoClient["db"]>): Promise<void> {
  await db.dropDatabase();
  await createIndexes(db);
  await ensureReadModelIndexes(db);

  await db.collection("users").insertMany([
    user(ID.admin, "admin", ["ADMIN"]),
    user(ID.contributor, "contributor", ["CONTRIBUTOR"]),
    user(ID.researcher, "researcher", ["RESEARCHER"]),
    user(ID.moderator, "moderator", ["MODERATOR"]),
    user(ID.suspended, "suspended", ["ADMIN"], "SUSPENDED"),
  ]);

  await db.collection("brands").insertOne(base(ID.brand, {
    name: "Acme",
    normalizedName: "acme",
    matchKey: "acme",
    aliases: [],
    lifecycle: "ACTIVE",
  }));

  await db.collection("organizations").insertMany([
    base(ID.organization, {
      name: "Acme Holding",
      normalizedName: "acme holding",
      matchKey: "acmeholding",
      kind: "LEGAL_ENTITY",
      aliases: [],
      identifiers: [],
      lifecycle: "ACTIVE",
    }),
  ]);

  await db.collection("products").insertMany([
    base(ID.product, {
      name: "Acme Soap",
      normalizedName: "acme soap",
      matchKey: "acmesoap",
      identifiers: [
        identifier(GTIN),
        identifier(UNVERIFIED_GTIN, "UNVERIFIED"),
      ],
      brandMapping: { status: "MAPPED", candidateBrandId: ID.brand },
      brand: { _id: ID.brand, name: "Acme" },
      packaging: { netContentValue: 250, netContentUnit: "g" },
      categoryCode: "household.cleaning.soap",
      lifecycle: "ACTIVE",
    }),
    base(ID.survivor, {
      name: "Survivor",
      normalizedName: "survivor",
      matchKey: "survivor",
      identifiers: [],
      brandMapping: { status: "UNMAPPED" },
      lifecycle: "ACTIVE",
    }),
    base(ID.merged, {
      name: "Old Name",
      normalizedName: "old name",
      matchKey: "oldname",
      identifiers: [identifier(MERGED_GTIN)],
      brandMapping: { status: "UNMAPPED" },
      lifecycle: "MERGED",
      mergedIntoId: ID.survivor,
    }),
    base(ID.ambiguousA, {
      name: "Duplicate A",
      normalizedName: "duplicate a",
      matchKey: "duplicatea",
      identifiers: [identifier(AMBIGUOUS_GTIN)],
      brandMapping: { status: "UNMAPPED" },
      lifecycle: "ACTIVE",
    }),
    base(ID.ambiguousB, {
      name: "Duplicate B",
      normalizedName: "duplicate b",
      matchKey: "duplicateb",
      identifiers: [identifier(AMBIGUOUS_GTIN)],
      brandMapping: { status: "UNMAPPED" },
      lifecycle: "ACTIVE",
    }),
    base(ID.disputed, {
      name: "Disputed",
      normalizedName: "disputed",
      matchKey: "disputed",
      identifiers: [identifier(DISPUTED_GTIN, "DISPUTED")],
      brandMapping: { status: "UNMAPPED" },
      lifecycle: "ACTIVE",
    }),
  ]);

  await db.collection("sources").insertOne(base(ID.source, {
    title: "Official Registry",
    canonicalUrl: "https://registry.example",
    sourceType: "OFFICIAL_REGISTER",
    publisherName: "Registry Office",
    publisherVerified: true,
    access: "PUBLIC",
    attributionRequired: false,
    lifecycle: "ACTIVE",
  }));

  await db.collection("source_snapshots").insertOne(base(ID.snapshot, {
    titleAtCapture: "Acme registry entry",
    canonicalUrlAtCapture: "https://registry.example/acme",
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    retrievedAt: new Date("2026-07-02T00:00:00.000Z"),
    contentHash: "a".repeat(64),
    hashAlgorithm: "SHA_256",
    captureMethod: "HTTP_FETCH",
    acquisitionTier: "PRIMARY",
    source: { _id: ID.source },
    lifecycle: "AVAILABLE",
  }));

  const evidence = [{
    _id: new ObjectId(),
    sourceSnapshotId: ID.snapshot,
    stance: "SUPPORTS",
    excerpt: "Acme Holding owns Acme.",
    addedBy: ID.researcher,
    addedAt: NOW,
  }];

  await db.collection("claims").insertMany([
    base(ID.productClaim, {
      about: { type: "PRODUCT", id: ID.product },
      claimType: "PRODUCT_ORIGIN",
      claimTypeRegistryVersion: 1,
      statement: "Package declares Iran.",
      publicWording: "The package declares an origin of Iran.",
      structuredValue: {
        claimType: "PRODUCT_ORIGIN",
        declaredOriginCountryCode: "IR",
        declarationSurface: "PACKAGE",
      },
      recordLifecycle: "ACTIVE",
      assessment: {
        outcome: "SUPPORTED",
        methodologyVersion: "v1",
        limitations: ["SELF_REPORTED"],
        assessedAt: new Date("2026-07-03T00:00:00.000Z"),
        assessedBy: ID.researcher,
      },
      publication: {
        status: "PUBLISHED",
        publishedAt: new Date("2026-07-04T00:00:00.000Z"),
        decidedBy: ID.moderator,
        decidedAt: new Date("2026-07-04T00:00:00.000Z"),
      },
      review: { status: "CLOSED", priority: "NORMAL", lastActionAt: NOW },
      evidence,
      organizationResponses: [],
      responseSolicitations: [],
      researchNotes: [{
        _id: new ObjectId(),
        authorId: ID.researcher,
        body: "PRIVATE RESEARCH NOTE",
        visibility: "INTERNAL_RESEARCH",
        createdAt: NOW,
      }],
      recordedAt: NOW,
    }),
    base(ID.brandClaim, {
      about: { type: "BRAND", id: ID.brand },
      claimType: "MARKET_PRESENCE",
      claimTypeRegistryVersion: 1,
      statement: "Acme is sold in Iran.",
      publicWording: "Acme products are reported as present in the Iranian market.",
      structuredValue: {
        claimType: "MARKET_PRESENCE",
        marketCountryCode: "IR",
        observationBasis: "RETAILER_LISTING",
      },
      recordLifecycle: "ACTIVE",
      assessment: { outcome: "PARTIALLY_SUPPORTED", methodologyVersion: "v1", limitations: [] },
      publication: {
        status: "PUBLISHED",
        publishedAt: new Date("2026-07-05T00:00:00.000Z"),
      },
      review: { status: "CLOSED", priority: "NORMAL" },
      evidence,
      organizationResponses: [],
      responseSolicitations: [],
      recordedAt: NOW,
    }),
    base(ID.organizationClaim, {
      about: { type: "ORGANIZATION", id: ID.organization },
      claimType: "OFFICIAL_STATEMENT",
      claimTypeRegistryVersion: 1,
      statement: "Acme Holding made a statement.",
      publicWording: "Acme Holding published a statement about the product.",
      structuredValue: {
        claimType: "OFFICIAL_STATEMENT",
        speakingOrganizationId: ID.organization,
        statementDatePrecision: "UNKNOWN",
        channel: "PRESS_RELEASE",
      },
      recordLifecycle: "ACTIVE",
      assessment: { outcome: "SUPPORTED", methodologyVersion: "v1", limitations: [] },
      publication: {
        status: "PUBLISHED",
        publishedAt: new Date("2026-07-06T00:00:00.000Z"),
      },
      review: { status: "CLOSED", priority: "NORMAL" },
      evidence,
      organizationResponses: [],
      responseSolicitations: [],
      recordedAt: NOW,
    }),
  ]);

  await db.collection("relationships").insertOne(base(ID.ownershipEdge, {
    subject: { type: "ORGANIZATION", id: ID.organization },
    predicate: "OWNS",
    predicateRegistryVersion: 1,
    object: { type: "BRAND", id: ID.brand },
    validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
    recordLifecycle: "ACTIVE",
    assessment: { outcome: "SUPPORTED", methodologyVersion: "v1", limitations: [] },
    publication: {
      status: "PUBLISHED",
      publishedAt: new Date("2026-07-07T00:00:00.000Z"),
    },
    review: { status: "CLOSED", priority: "NORMAL" },
    publicWording: "Acme Holding owns the Acme brand.",
    evidence,
    organizationResponses: [],
    responseSolicitations: [],
    researchNotes: [],
    recordedAt: NOW,
  }));

  await db.collection("corrections").insertOne(base(ID.correction, {
    target: { type: "CLAIM", id: ID.productClaim },
    submissionKind: "CORRECT_EXISTING",
    reason: "The previous wording overstated the source.",
    submittedBy: ID.contributor,
    submittedAt: NOW,
    idempotencyKey: "e2e-correction-1",
    status: "APPROVED",
    review: {},
    application: {
      appliedAt: NOW,
      result: "APPLIED",
      idempotencyKey: "e2e-correction-apply-1",
    },
    publicNotice: {
      correctedAt: NOW,
      reason: "The previous wording overstated the source.",
      previousWording: "The package definitely proves Iranian origin.",
      auditEventId: ID.auditRecent,
    },
  }));

  await db.collection("audit_events").insertMany([
    {
      _id: ID.auditRecent,
      eventSchemaVersion: 1,
      actor: { type: "USER", id: ID.admin },
      action: "CORRECTION_APPLIED",
      target: { type: "CLAIM", id: ID.productClaim },
      requestId: "e2e-audit-request-1",
      correlationId: "e2e-correction-flow",
      idempotencyKey: "e2e-correction-apply-1",
      targetVersionBefore: 1,
      targetVersionAfter: 2,
      changedPaths: ["publicWording"],
      beforeSummary: { publicWording: "Unreviewed wording." },
      afterSummary: { publicWording: "The package declares an origin of Iran." },
      reason: "Approved correction applied.",
      occurredAt: new Date("2026-07-10T00:00:00.000Z"),
    },
    {
      _id: ID.auditOlder,
      eventSchemaVersion: 1,
      actor: { type: "SYSTEM", id: "seed" },
      action: "PUBLICATION_RETRACTED",
      target: { type: "CLAIM", id: ID.brandClaim },
      requestId: "e2e-audit-request-2",
      targetVersionBefore: 2,
      targetVersionAfter: 3,
      changedPaths: ["publication.status"],
      beforeSummary: { status: "PUBLISHED" },
      afterSummary: { status: "RETRACTED" },
      reason: "E2E seed history.",
      occurredAt: new Date("2026-07-09T00:00:00.000Z"),
    },
  ]);

  const record = await rebuildProfile({ db, productId: ID.product, now: NOW });
  if (record.payload.product?.name !== "Acme Soap") {
    throw new Error("E2E read model did not build the primary product");
  }
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`server did not become healthy at ${BASE_URL}/health`);
}

async function main(): Promise<void> {
  if (!DB_NAME.toLowerCase().includes("e2e")) {
    throw new Error("E2E_DB_NAME must contain 'e2e'; the runner drops this database");
  }
  const portProbe = Deno.listen({ hostname: "127.0.0.1", port: PORT });
  portProbe.close();

  const tempDir = await Deno.makeTempDir({ prefix: "ansoo-e2e-" });
  const uploadRoot = `${tempDir}/uploads`;
  await Deno.mkdir(uploadRoot, { recursive: true });
  const varsPath = `${tempDir}/vars.env`;

  const jwtSecret = secret();
  const assertionSecret = secret();
  const config = loadConfig({
    ENV: "development",
    MONGO_URL,
    DB_NAME,
    APP_PORT: String(PORT),
    JWT_SECRET: jwtSecret,
    JWT_ISSUER: "ansoo-api",
    JWT_AUDIENCE: "ansoo-front",
    AUTH_ASSERTION_SECRET: assertionSecret,
    AUTH_ASSERTION_ISSUER: PROVIDER,
    AUTH_ASSERTION_AUDIENCE: "ansoo-api",
    CORS_ORIGINS: "http://localhost:3000",
    ASSET_STORAGE_PROVIDER: "LOCAL_DEV",
    ASSET_LOCAL_ROOT: uploadRoot,
  });

  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(DB_NAME);

  try {
    await seed(db);

    const assertions = {
      admin: await createAssertionToken({ sub: "admin", provider: PROVIDER }, config),
      contributor: await createAssertionToken(
        { sub: "contributor", provider: PROVIDER },
        config,
      ),
      researcher: await createAssertionToken({ sub: "researcher", provider: PROVIDER }, config),
      moderator: await createAssertionToken({ sub: "moderator", provider: PROVIDER }, config),
      suspended: await createAssertionToken({ sub: "suspended", provider: PROVIDER }, config),
    };

    // Quote every value: Hurl infers unquoted numeric literals as numbers and
    // strips leading zeros from ObjectIds and GTINs.
    const vars: Record<string, string> = {
      baseUrl: BASE_URL,
      adminAssertion: assertions.admin,
      contributorAssertion: assertions.contributor,
      researcherAssertion: assertions.researcher,
      moderatorAssertion: assertions.moderator,
      suspendedAssertion: assertions.suspended,
      productId: ID.product.toString(),
      survivorId: ID.survivor.toString(),
      disputedId: ID.disputed.toString(),
      mergedId: ID.merged.toString(),
      claimId: ID.productClaim.toString(),
      auditRecentId: ID.auditRecent.toString(),
    };
    await Deno.writeTextFile(
      varsPath,
      Object.entries(vars).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") +
        "\n",
    );

    const server = new Deno.Command("deno", {
      args: ["run", "--allow-all", MOD_FILE],
      cwd: BACK_ROOT,
      env: {
        ENV: config.env,
        MONGO_URL: config.mongoUrl,
        DB_NAME: config.dbName,
        APP_PORT: String(config.port),
        JWT_SECRET: config.jwtSecret,
        JWT_ISSUER: config.jwtIssuer ?? "",
        JWT_AUDIENCE: config.jwtAudience ?? "",
        AUTH_ASSERTION_SECRET: config.authAssertion.secret ?? "",
        AUTH_ASSERTION_ISSUER: config.authAssertion.issuer ?? "",
        AUTH_ASSERTION_AUDIENCE: config.authAssertion.audience ?? "",
        CORS_ORIGINS: config.corsOrigins.join(","),
        ASSET_STORAGE_PROVIDER: config.asset.provider,
        ASSET_LOCAL_ROOT: config.asset.localRoot,
      },
      stdout: "null",
      stderr: "inherit",
    }).spawn();

    try {
      await waitForHealth();
      const hurl = new Deno.Command("hurl", {
        args: [
          "--test",
          ...(Deno.env.get("E2E_VERBOSE") === "1" ? ["--very-verbose"] : []),
          "--variables-file",
          varsPath,
          HURL_FILE,
        ],
        cwd: BACK_ROOT,
        stdout: "inherit",
        stderr: "inherit",
      }).spawn();
      const status = await hurl.status;
      if (!status.success) {
        throw new Error(`hurl exited with code ${status.code}`);
      }
    } finally {
      try {
        server.kill("SIGTERM");
      } catch {
        // Already exited.
      }
      await server.status;
    }
  } finally {
    await db.dropDatabase();
    await client.close();
    await Deno.remove(tempDir, { recursive: true });
  }
}

try {
  await main();
  console.log("E2E suite passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exit(1);
}
