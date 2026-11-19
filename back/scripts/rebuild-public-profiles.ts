// Rebuild the derived public profile read model from canonical collections.
//
// Usage:
//   deno task read-model:rebuild
//   deno task read-model:repair
import { MongoClient } from "lesan";
import { loadConfig } from "../utils/config.ts";
import {
  ensureReadModelIndexes,
  rebuildAllProfiles,
  repairPublicProfiles,
} from "../utils/publicProfile/readModel.ts";

const config = loadConfig();
const client = new MongoClient(config.mongoUrl);
await client.connect();
try {
  const db = client.db(config.dbName);
  await ensureReadModelIndexes(db);
  if (Deno.args.includes("--repair")) {
    const result = await repairPublicProfiles({ db });
    console.log(JSON.stringify({ mode: "repair", ...result }));
  } else {
    const result = await rebuildAllProfiles({ db });
    console.log(JSON.stringify({ mode: "rebuild", ...result }));
  }
} finally {
  await client.close();
}
