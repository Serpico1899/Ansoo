// Fail-fast configuration tests. No real secrets, no environment mutation.

import { assert, assertEquals, assertThrows } from "@std/assert";
import { ConfigError, loadConfig, redactMongoUrl } from "../../utils/config.ts";

const SECRET = "a".repeat(48);

function validEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    ENV: "development",
    MONGO_URL: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
    DB_NAME: "ansoo",
    JWT_SECRET: SECRET,
    ...overrides,
  };
}

function issuesOf(env: Record<string, string | undefined>): readonly string[] {
  try {
    loadConfig(env);
  } catch (error) {
    assert(error instanceof ConfigError);
    return error.issues;
  }
  throw new Error("expected ConfigError");
}

Deno.test("valid development configuration loads with redacted URL", () => {
  const config = loadConfig(validEnv());
  assertEquals(config.env, "development");
  assertEquals(config.dbName, "ansoo");
  assertEquals(config.port, 1370);
  assertEquals(config.asset.provider, "LOCAL_DEV");
  assertEquals(config.asset.maxBytes, 20 * 1024 * 1024);
  assertEquals(config.mongoUrlRedacted, "mongodb://127.0.0.1:27019/?replicaSet=rs0");
  assert(!config.mongoUrlRedacted.includes("JWT_SECRET"));
});

Deno.test("missing required configuration is reported together", () => {
  const issues = issuesOf({ ENV: "development" });
  assert(issues.some((issue) => issue.includes("MONGO_URL is required")));
  assert(issues.some((issue) => issue.includes("DB_NAME is required")));
  assert(issues.some((issue) => issue.includes("JWT_SECRET is required")));
});

Deno.test("placeholder and short JWT secrets are rejected", () => {
  for (const secret of ["replace-with-a-long-random-secret", "change-me", "short"]) {
    const issues = issuesOf(validEnv({ JWT_SECRET: secret }));
    assert(
      issues.some((issue) => issue.includes("JWT_SECRET")),
      `expected JWT_SECRET rejection for ${secret}`,
    );
  }
});

Deno.test("non-replica-set MongoDB is rejected outside test", () => {
  const issues = issuesOf(validEnv({ MONGO_URL: "mongodb://127.0.0.1:27017" }));
  assert(issues.some((issue) => issue.includes("replicaSet")));

  const testConfig = loadConfig(
    validEnv({ ENV: "test", MONGO_URL: "mongodb://127.0.0.1:27017" }),
  );
  assertEquals(testConfig.env, "test");

  const srvConfig = loadConfig(validEnv({ MONGO_URL: "mongodb+srv://cluster.example/ansoo" }));
  assertEquals(srvConfig.env, "development");
});

Deno.test("asset provider configuration fails fast when incomplete", () => {
  const issues = issuesOf(validEnv({ ASSET_STORAGE_PROVIDER: "S3_COMPATIBLE" }));
  assert(issues.some((issue) => issue.includes("ASSET_BUCKET is required")));

  const config = loadConfig(
    validEnv({
      ASSET_STORAGE_PROVIDER: "S3_COMPATIBLE",
      ASSET_BUCKET: "ansoo-assets",
      ASSET_REGION: "eu-central-1",
    }),
  );
  assertEquals(config.asset.provider, "S3_COMPATIBLE");
  assertEquals(config.asset.bucket, "ansoo-assets");
  assertEquals(config.asset.region, "eu-central-1");
});

Deno.test("invalid numeric and CORS values are rejected", () => {
  const issues = issuesOf(
    validEnv({
      APP_PORT: "70000",
      JWT_EXPIRES_IN_SECONDS: "nope",
      CORS_ORIGINS: "http://localhost:3000/path",
    }),
  );
  assert(issues.some((issue) => issue.includes("APP_PORT")));
  assert(issues.some((issue) => issue.includes("JWT_EXPIRES_IN_SECONDS")));
  assert(issues.some((issue) => issue.includes("CORS_ORIGINS")));
});

Deno.test("Mongo credentials are redacted", () => {
  assertEquals(
    redactMongoUrl("mongodb://user:pass@example.test:27017/ansoo?replicaSet=rs0"),
    "mongodb://***:***@example.test:27017/ansoo?replicaSet=rs0",
  );
  assertThrows(() => loadConfig(validEnv({ DB_NAME: "bad/name" })), ConfigError);
});
