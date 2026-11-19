// Ansoo backend entry point.
//
// Startup is fail-fast: configuration, Mongo connectivity, model registration,
// indexes, and server-derived action policies are established before listening.

import { lesan, MongoClient } from "lesan";
import { createIndexes } from "./models/indexes.ts";
import { registerModels } from "./models/mod.ts";
import { registerActions } from "./src/mod.ts";
import { createApi } from "./utils/api/mod.ts";
import { loadConfig } from "./utils/config.ts";

const config = loadConfig();
const client = new MongoClient(config.mongoUrl);
await client.connect();

try {
  const db = client.db(config.dbName);
  const core = lesan();
  core.odm.setDb(db);
  registerModels(core);
  await createIndexes(db);
  registerActions(core, { db, config });

  if (Deno.env.get("GENERATE_TYPES") === "1") {
    await core.generateSchemTypes();
  }

  const api = createApi({ core, db, config });
  console.error(
    `Ansoo API listening on port ${config.port} (env=${config.env}, db=${config.dbName})`,
  );
  await api.serve({
    port: config.port,
    ...(config.corsOrigins.length === 0 ? {} : { cors: config.corsOrigins }),
  });
} finally {
  await client.close();
}
