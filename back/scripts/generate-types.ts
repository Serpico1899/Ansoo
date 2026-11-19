// Reproducible Lesan type generation for backend and frontend consumers.
//
// Usage: deno task types
// The generated declaration is written to back/declarations and copied into the
// frontend. Never hand-edit either copy.
import type { Db } from "lesan";
import { lesan } from "lesan";
import { registerModels } from "../models/mod.ts";
import { registerActions } from "../src/mod.ts";
import type { AppConfig } from "../utils/config.ts";

const core = lesan();
registerModels(core);
registerActions(core, {
  db: undefined as unknown as Db,
  config: undefined as unknown as AppConfig,
});
await core.generateSchemTypes();

const source = new URL("../declarations/selectInp.ts", import.meta.url);
const target = new URL("../../front/src/types/declarations/selectInp.ts", import.meta.url);
await Deno.mkdir(new URL(".", target), { recursive: true });
await Deno.copyFile(source, target);
console.log("Generated declarations/selectInp.ts and copied it to the frontend.");
