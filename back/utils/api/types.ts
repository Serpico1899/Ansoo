// Plan 08 - action registration contract.
import type { Db, Struct } from "lesan";
import type { AppConfig } from "../config.ts";
import type { AuthActor, Capability, UploadCapability } from "../auth/capabilities.ts";
import type { RateLimitPolicy } from "../auth/rateLimit.ts";

export type AccessPolicy =
  | { kind: "GUEST" }
  | { kind: "AUTHENTICATED" }
  | { kind: "CAPABILITY"; capability: Capability | UploadCapability };

export type ActionContext = {
  auth: AuthActor | null;
  requestId: string;
  correlationId?: string;
  ip: string;
  now: Date;
  db: Db;
  config: AppConfig;
};

export type ActionBody = {
  service?: string;
  model: string;
  act: string;
  details: Record<string, unknown>;
};

export type ActionFn = (
  body: ActionBody & { details: Record<string, unknown> },
  context: ActionContext,
) => unknown | Promise<unknown>;

export type ActionDefinition = {
  schema: string;
  actName: string;
  // deno-lint-ignore no-explicit-any
  validator: Struct<any, any>;
  access: AccessPolicy;
  rateLimit?: RateLimitPolicy;
  fn: ActionFn;
};

export type ApiOptions = {
  core: {
    acts: {
      setAct: (input: {
        schema: string;
        actName: string;
        // deno-lint-ignore no-explicit-any
        validator: Struct<any, any>;
        fn: () => never;
      }) => unknown;
    };
  };
  db: Db;
  config: AppConfig;
  now?: () => Date;
};

export const ACTION_INVENTORY = [
  {
    action: "products.getPublicProfile",
    implemented: true,
    plan: "08/09",
    access: "GUEST",
    tests:
      "tests/api/dispatch.integration.test.ts; tests/publicProfile/profile.integration.test.ts",
  },
  {
    action: "claims.getResearch",
    implemented: true,
    plan: "08",
    access: "READ_RESEARCH",
    tests: "tests/api/dispatch.integration.test.ts",
  },
  {
    action: "auditEvents.gets",
    implemented: true,
    plan: "08",
    access: "READ_AUDIT",
    tests: "tests/api/dispatch.integration.test.ts",
  },
  {
    action: "users.login",
    implemented: true,
    plan: "08",
    access: "GUEST + rate limit",
    tests: "tests/auth/jwt.integration.test.ts; tests/api/dispatch.integration.test.ts",
  },
  {
    action: "users.getMe",
    implemented: true,
    plan: "08",
    access: "authenticated",
    tests: "tests/api/dispatch.integration.test.ts",
  },
  {
    action: "corrections.submit",
    implemented: false,
    plan: "07/08",
    access: "SUBMIT_CORRECTION",
    tests: "tests/governance/corrections.integration.test.ts",
  },
  {
    action: "products.searchPublic",
    implemented: false,
    plan: "09",
    access: "GUEST",
    tests: "planned",
  },
  {
    action: "relationships.getPublic",
    implemented: false,
    plan: "09",
    access: "GUEST",
    tests: "planned",
  },
  {
    action: "assets.upload",
    implemented: false,
    plan: "08/10",
    access: "UPLOAD_EVIDENCE_ASSET / UPLOAD_RESPONSE_ASSET",
    tests: "planned",
  },
  {
    action: "users.setRoles",
    implemented: false,
    plan: "07/08",
    access: "MANAGE_USERS",
    tests: "tests/governance/users.integration.test.ts",
  },
] as const;
