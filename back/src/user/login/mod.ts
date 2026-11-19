import type { ApiOptions } from "../../../utils/api/types.ts";
import { registerActionDefinition } from "../../../utils/api/registry.ts";
import type { ActionDeps } from "../../deps.ts";
import { login } from "./login.fn.ts";
import { loginValidator } from "./login.val.ts";

export function setupLogin(core: ApiOptions["core"], _deps: ActionDeps): void {
  registerActionDefinition(core, {
    schema: "users",
    actName: "login",
    validator: loginValidator,
    access: { kind: "GUEST" },
    rateLimit: { limit: 10, windowSeconds: 900, scope: "IP" },
    fn: login,
  });
}
