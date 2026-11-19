import type { ApiOptions } from "../../../utils/api/types.ts";
import { registerActionDefinition } from "../../../utils/api/registry.ts";
import type { ActionDeps } from "../../deps.ts";
import { getResearch } from "./getResearch.fn.ts";
import { getResearchValidator } from "./getResearch.val.ts";

export function setupGetResearch(core: ApiOptions["core"], _deps: ActionDeps): void {
  registerActionDefinition(core, {
    schema: "claims",
    actName: "getResearch",
    validator: getResearchValidator,
    access: { kind: "CAPABILITY", capability: "READ_RESEARCH" },
    fn: getResearch,
  });
}
