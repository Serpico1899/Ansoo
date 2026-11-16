// Disposable test harness. Creates an isolated database per test module.
import { lesan, MongoClient, ObjectId } from "lesan";
import { createAuditService } from "./audit.ts";
import { SPIKE_JWT_SECRET, SPIKE_MONGO_URI } from "./config.ts";
import { createCorrectionService } from "./correction.ts";
import { createSpikeIndexes } from "./indexes.ts";
import { createSpikeModels } from "./models.ts";
import { createRegistry } from "./registry.ts";
import { createStatusService } from "./status.ts";

export async function createHarness(dbName: string) {
  const client = new MongoClient(SPIKE_MONGO_URI);
  await client.connect();
  const db = client.db(dbName);
  await db.dropDatabase();

  const core = lesan();
  core.odm.setDb(db);
  const models = createSpikeModels(core);
  const registry = createRegistry(db);
  const audit = createAuditService(db, models, registry);
  const corrections = createCorrectionService(db, registry, audit);
  const status = createStatusService(db, audit);
  await createSpikeIndexes(db);

  return {
    client,
    db,
    core,
    models,
    registry,
    audit,
    corrections,
    status,
    jwtSecret: SPIKE_JWT_SECRET,
    async close() {
      await client.close();
    },
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;

export async function seedUser(
  h: Harness,
  input: {
    displayName?: string;
    roles?: string[];
    trustLevel?: number;
    accountStatus?: "ACTIVE" | "SUSPENDED" | "CLOSED";
  } = {},
) {
  const now = new Date();
  const result = await h.db.collection("users").insertOne({
    authProvider: "LOCAL",
    authSubject: crypto.randomUUID(),
    email: `${crypto.randomUUID()}@example.invalid`,
    displayName: input.displayName ?? "Spike User",
    preferredLocale: "en",
    roles: input.roles ?? ["CONTRIBUTOR"],
    trustLevel: input.trustLevel ?? 0,
    accountStatus: input.accountStatus ?? "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    recordLifecycle: "ACTIVE",
  });
  return result.insertedId.toString();
}

type RefType =
  | "product"
  | "brand"
  | "category"
  | "organization"
  | "relationship"
  | "claim"
  | "source"
  | "source_snapshot";

export async function seedEntity(
  h: Harness,
  type: RefType,
  overrides: Record<string, unknown> = {},
) {
  const now = new Date();
  const base: Record<string, Record<string, unknown>> = {
    brand: {
      name: "Acme",
      normalizedName: "acme",
      recordLifecycle: "ACTIVE",
    },
    category: {
      code: `CAT-${crypto.randomUUID()}`,
      name: "Home",
      normalizedName: "home",
      parentCategoryId: null,
      ancestorIds: [],
      depth: 0,
      sortOrder: 0,
      taxonomyVersion: 1,
      recordLifecycle: "ACTIVE",
    },
    organization: {
      name: "Acme Holdings",
      normalizedName: "acme holdings",
      kind: "CORPORATE_GROUP",
      operatingCountryCodes: ["IR"],
      recordLifecycle: "ACTIVE",
    },
    product: {
      name: "Acme Soap",
      normalizedName: "acme soap",
      identifiers: [{
        scheme: "GTIN_13",
        value: "4006381333931",
        normalizedValue: "4006381333931",
        status: "VERIFIED",
      }],
      brandMapping: { state: "CONFIRMED" },
      recordLifecycle: "ACTIVE",
    },
    relationship: null as unknown as Record<string, unknown>,
    claim: null as unknown as Record<string, unknown>,
    source: {
      title: "Register entry",
      canonicalUrl: "https://example.com/register/1",
      sourceType: "GOVERNMENT_REGISTRY",
      access: "PUBLIC",
      recordLifecycle: "ACTIVE",
    },
    source_snapshot: {
      titleAtCapture: "Register entry",
      canonicalUrlAtCapture: "https://example.com/register/1",
      retrievedAt: now,
      contentHash: crypto.randomUUID(),
      hashAlgorithm: "SHA-256",
      mimeType: "text/html",
      byteSize: 100,
      captureMethod: "URL_FETCH",
      acquisitionTier: "PRIMARY",
      recordLifecycle: "ACTIVE",
    },
  };

  const collection = `${type}s`.replace("categorys", "categories");
  const doc = {
    _id: ObjectId.createFromHexString(
      crypto.randomUUID().replace(/-/g, "").slice(0, 24),
    ),
    ...(base[type] ?? {}),
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  await h.db.collection(collection).insertOne(doc);
  return doc._id.toString();
}
