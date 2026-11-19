// Lesan action registry.
//
// Every action follows the triad <action>/mod.ts, <action>.<fn>.ts and
// <action>.<val>.ts. Registration attaches the server-side access policy; the
// dispatcher enforces it before validation and before the action runs.
import type { ApiOptions } from "../utils/api/types.ts";
import type { ActionDeps } from "./deps.ts";
import { setupAuditEventGets } from "./auditEvent/gets/mod.ts";
import { setupGetResearch } from "./claim/getResearch/mod.ts";
import { setupGetPublicProfile } from "./product/getPublicProfile/mod.ts";
import { setupGetMe } from "./user/getMe/mod.ts";
import { setupLogin } from "./user/login/mod.ts";

export function registerActions(core: ApiOptions["core"], deps: ActionDeps): void {
  setupGetPublicProfile(core, deps);
  setupGetResearch(core, deps);
  setupAuditEventGets(core, deps);
  setupLogin(core, deps);
  setupGetMe(core, deps);
}
