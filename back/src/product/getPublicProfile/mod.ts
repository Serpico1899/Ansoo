import type { ApiOptions } from "../../../utils/api/types.ts";
import { registerActionDefinition } from "../../../utils/api/registry.ts";
import type { ActionDeps } from "../../deps.ts";
import { getPublicProfile } from "./getPublicProfile.fn.ts";
import { getPublicProfileValidator } from "./getPublicProfile.val.ts";

export function setupGetPublicProfile(core: ApiOptions["core"], _deps: ActionDeps): void {
  registerActionDefinition(core, {
    schema: "products",
    actName: "getPublicProfile",
    validator: getPublicProfileValidator,
    access: { kind: "GUEST" },
    fn: getPublicProfile,
  });
}
