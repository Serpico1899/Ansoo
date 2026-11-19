// Fail-fast runtime configuration.
//
// Rules:
// - Required configuration is listed explicitly; missing values throw.
// - A placeholder, short, or default JWT secret is never accepted.
// - Development uses a single-node replica set so transaction behavior matches
//   production; a non-replica-set MongoDB URL is rejected outside `test`.
// - Never log secrets. `redactMongoUrl` removes credentials.

import { ASSET_STORAGE_PROVIDERS } from "./domain/constants.ts";

export type AppEnv = "development" | "test" | "production";

export type AppConfig = {
  env: AppEnv;
  port: number;
  corsOrigins: readonly string[];
  mongoUrl: string;
  mongoUrlRedacted: string;
  dbName: string;
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  jwtIssuer?: string;
  jwtAudience?: string;
  authAssertion: {
    secret?: string;
    issuer?: string;
    audience?: string;
  };
  asset: {
    provider: typeof ASSET_STORAGE_PROVIDERS[number];
    localRoot: string;
    bucket?: string;
    region?: string;
    endpoint?: string;
    maxBytes: number;
  };
  acquisition: {
    proxyUrl?: string;
    fetcherMaxRedirects: number;
    fetcherTimeoutMs: number;
    fetcherMaxBytes: number;
  };
};

export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid configuration:\n- ${issues.join("\n- ")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

const ENVS: readonly AppEnv[] = ["development", "test", "production"];
const PLACEHOLDER_SECRETS = new Set([
  "",
  "replace-with-a-long-random-secret",
  "change-me",
  "changeme",
  "secret",
  "dev-secret",
  "test-secret",
]);

const MIN_SECRET_LENGTH = 32;
const ASSET_MAX_BYTES_DEFAULT = 20 * 1024 * 1024;

function parseInteger(
  issues: string[],
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) {
    issues.push(`${name} must be an integer`);
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    issues.push(`${name} must be between ${min} and ${max}`);
    return fallback;
  }
  return value;
}

export function redactMongoUrl(url: string): string {
  return url.replace(/\/\/([^/@]+)@/, "//***:***@");
}

function optionalNonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function parseMongoReplicaSet(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get("replicaSet") ?? undefined;
  } catch {
    return undefined;
  }
}

export function loadConfig(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): AppConfig {
  const issues: string[] = [];

  const appEnv = (env.ENV ?? "development").trim() as AppEnv;
  if (!ENVS.includes(appEnv)) {
    issues.push(`ENV must be one of ${ENVS.join(", ")}`);
  }

  const mongoUrl = (env.MONGO_URL ?? "").trim();
  if (mongoUrl === "") {
    issues.push("MONGO_URL is required");
  } else if (!/^mongodb(\+srv)?:\/\//.test(mongoUrl)) {
    issues.push("MONGO_URL must start with mongodb:// or mongodb+srv://");
  } else if (appEnv !== "test") {
    const isSrv = mongoUrl.startsWith("mongodb+srv://");
    if (!isSrv && parseMongoReplicaSet(mongoUrl) === undefined) {
      issues.push(
        "MONGO_URL must include replicaSet=<name> (or use mongodb+srv://); development requires a replica set",
      );
    }
  }

  const dbName = (env.DB_NAME ?? "").trim();
  if (dbName === "") {
    issues.push("DB_NAME is required");
  } else if (!/^[A-Za-z0-9_-]{1,63}$/.test(dbName)) {
    issues.push("DB_NAME must be 1-63 characters of letters, digits, underscore, or hyphen");
  }

  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.trim() === "") {
    issues.push("JWT_SECRET is required");
  } else if (PLACEHOLDER_SECRETS.has(jwtSecret)) {
    issues.push("JWT_SECRET must not be a placeholder or default value");
  } else if (jwtSecret.length < MIN_SECRET_LENGTH) {
    issues.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }

  const jwtIssuer = optionalNonEmpty(env.JWT_ISSUER);
  const jwtAudience = optionalNonEmpty(env.JWT_AUDIENCE);
  const assertionSecret = optionalNonEmpty(env.AUTH_ASSERTION_SECRET);
  if (assertionSecret !== undefined) {
    if (PLACEHOLDER_SECRETS.has(assertionSecret)) {
      issues.push("AUTH_ASSERTION_SECRET must not be a placeholder or default value");
    } else if (assertionSecret.length < MIN_SECRET_LENGTH) {
      issues.push(`AUTH_ASSERTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
    }
  }
  const assertionIssuer = optionalNonEmpty(env.AUTH_ASSERTION_ISSUER);
  const assertionAudience = optionalNonEmpty(env.AUTH_ASSERTION_AUDIENCE);

  const port = parseInteger(issues, "APP_PORT", env.APP_PORT, 1370, 1, 65535);
  const jwtExpiresInSeconds = parseInteger(
    issues,
    "JWT_EXPIRES_IN_SECONDS",
    env.JWT_EXPIRES_IN_SECONDS,
    604_800,
    60,
    31_536_000,
  );
  const assetMaxBytes = parseInteger(
    issues,
    "ASSET_MAX_BYTES",
    env.ASSET_MAX_BYTES,
    ASSET_MAX_BYTES_DEFAULT,
    1,
    100 * 1024 * 1024,
  );
  const fetcherMaxRedirects = parseInteger(
    issues,
    "ACQUISITION_FETCH_MAX_REDIRECTS",
    env.ACQUISITION_FETCH_MAX_REDIRECTS,
    3,
    0,
    10,
  );
  const fetcherTimeoutMs = parseInteger(
    issues,
    "ACQUISITION_FETCH_TIMEOUT_MS",
    env.ACQUISITION_FETCH_TIMEOUT_MS,
    10_000,
    1_000,
    60_000,
  );
  const fetcherMaxBytes = parseInteger(
    issues,
    "ACQUISITION_FETCH_MAX_BYTES",
    env.ACQUISITION_FETCH_MAX_BYTES,
    10 * 1024 * 1024,
    1024,
    50 * 1024 * 1024,
  );

  const provider = (env.ASSET_STORAGE_PROVIDER ?? "LOCAL_DEV").trim();
  if (!ASSET_STORAGE_PROVIDERS.includes(provider as typeof ASSET_STORAGE_PROVIDERS[number])) {
    issues.push(`ASSET_STORAGE_PROVIDER must be one of ${ASSET_STORAGE_PROVIDERS.join(", ")}`);
  }

  const localRoot = (env.ASSET_LOCAL_ROOT ?? "./uploads").trim();
  if (provider === "LOCAL_DEV" && localRoot === "") {
    issues.push("ASSET_LOCAL_ROOT is required for the LOCAL_DEV asset provider");
  }

  const bucket = (env.ASSET_BUCKET ?? "").trim();
  if (provider === "S3_COMPATIBLE" && bucket === "") {
    issues.push("ASSET_BUCKET is required for the S3_COMPATIBLE asset provider");
  }

  const corsOrigins = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  for (const origin of corsOrigins) {
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== origin) {
        issues.push(`CORS_ORIGINS entry must be an origin without a path: ${origin}`);
      }
    } catch {
      issues.push(`CORS_ORIGINS entry is not a valid URL: ${origin}`);
    }
  }

  const proxyUrl = (env.ACQUISITION_PROXY_URL ?? "").trim();
  if (proxyUrl !== "") {
    try {
      new URL(proxyUrl);
    } catch {
      issues.push("ACQUISITION_PROXY_URL must be a valid URL");
    }
  }

  if (issues.length > 0) throw new ConfigError(issues);

  return {
    env: appEnv,
    port,
    corsOrigins,
    mongoUrl,
    mongoUrlRedacted: redactMongoUrl(mongoUrl),
    dbName,
    jwtSecret,
    jwtExpiresInSeconds,
    ...(jwtIssuer === undefined ? {} : { jwtIssuer }),
    ...(jwtAudience === undefined ? {} : { jwtAudience }),
    authAssertion: {
      ...(assertionSecret === undefined ? {} : { secret: assertionSecret }),
      ...(assertionIssuer === undefined ? {} : { issuer: assertionIssuer }),
      ...(assertionAudience === undefined ? {} : { audience: assertionAudience }),
    },
    asset: {
      provider: provider as typeof ASSET_STORAGE_PROVIDERS[number],
      localRoot,
      ...(bucket === "" ? {} : { bucket }),
      ...(env.ASSET_REGION ? { region: env.ASSET_REGION } : {}),
      ...(env.ASSET_ENDPOINT ? { endpoint: env.ASSET_ENDPOINT } : {}),
      maxBytes: assetMaxBytes,
    },
    acquisition: {
      ...(proxyUrl === "" ? {} : { proxyUrl }),
      fetcherMaxRedirects,
      fetcherTimeoutMs,
      fetcherMaxBytes,
    },
  };
}
