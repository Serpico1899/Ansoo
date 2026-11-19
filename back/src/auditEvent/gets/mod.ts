import type { ApiOptions } from "../../../utils/api/types.ts";
import { registerActionDefinition } from "../../../utils/api/registry.ts";
import type { ActionDeps } from "../../deps.ts";
import { gets } from "./gets.fn.ts";
import { getsValidator } from "./gets.val.ts";

export function setupAuditEventGets(core: ApiOptions["core"], _deps: ActionDeps): void {
  registerActionDefinition(core, {
    schema: "auditEvents",
    actName: "gets",
    validator: getsValidator,
    access: { kind: "CAPABILITY", capability: "READ_AUDIT" },
    fn: gets,
  });
}
