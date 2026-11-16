// Fail-fast configuration check.
//
// Usage: deno task config:check
// Prints a redacted summary when configuration is valid; exits 1 with every
// collected issue when it is not.

import { ConfigError, loadConfig } from "../utils/config.ts";

try {
  const config = loadConfig();
  console.log(
    JSON.stringify(
      {
        ok: true,
        env: config.env,
        port: config.port,
        mongodb: config.mongoUrlRedacted,
        dbName: config.dbName,
        corsOrigins: config.corsOrigins,
        assetProvider: config.asset.provider,
        assetMaxBytes: config.asset.maxBytes,
      },
      null,
      2,
    ),
  );
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    Deno.exit(1);
  }
  throw error;
}
