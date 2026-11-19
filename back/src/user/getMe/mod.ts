import type { ApiOptions } from "../../../utils/api/types.ts";
import { registerActionDefinition } from "../../../utils/api/registry.ts";
import type { ActionDeps } from "../../deps.ts";
import { getMe } from "./getMe.fn.ts";
import { getMeValidator } from "./getMe.val.ts";

export function setupGetMe(core: ApiOptions["core"], _deps: ActionDeps): void {
  registerActionDefinition(core, {
    schema: "users",
    actName: "getMe",
    validator: getMeValidator,
    access: { kind: "AUTHENTICATED" },
    fn: getMe,
  });
}
