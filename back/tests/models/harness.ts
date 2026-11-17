// Shared Mongo harness for Plan 03 model/index verification.
import { lesan, MongoClient } from "lesan";
import { buildModels, type Models } from "../../models/mod.ts";

export const MONGO_ENABLED = Deno.env.get("RUN_MONGO_TESTS") === "1";
export const MONGO_URL = Deno.env.get("MONGO_URL") ??
  "mongodb://127.0.0.1:27019/?replicaSet=rs0";

export async function createHarness(name: string) {
  const client = new MongoClient(MONGO_URL);
  await client.connect();
  const db = client.db(name);
  await db.dropDatabase();
  const core = lesan();
  core.odm.setDb(db);
  const models: Models = buildModels(core);
  return {
    client,
    db,
    models,
    async close() {
      await db.dropDatabase();
      await client.close();
    },
  };
}
