// Reproducible Lesan type generation.
//
// Usage: deno task types
// Model registration lives in models/mod.ts. Plan 03 adds the eleven v3.1
// models; until then this generates an empty ReqType with no domain fields.

import { lesan } from "lesan";
import { registerModels } from "../models/mod.ts";

const core = lesan();
registerModels(core);
await core.generateSchemTypes();
console.log("Generated declarations/selectInp.ts from models/mod.ts.");
