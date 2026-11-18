// Plan 07 - Every closed audit action has an owning service and a named test.
import { assertEquals } from "@std/assert";
import { AUDIT_ACTIONS } from "../../utils/domain/constants.ts";
import { AUDIT_ACTION_COVERAGE } from "../../utils/governance/auditCoverage.ts";

Deno.test("audit coverage: every mutation action is mapped and tested", () => {
  assertEquals(Object.keys(AUDIT_ACTION_COVERAGE).sort(), [...AUDIT_ACTIONS].sort());
  for (const [action, coverage] of Object.entries(AUDIT_ACTION_COVERAGE)) {
    if (!coverage.service.trim()) throw new Error(`${action} has no owning service`);
    if (!coverage.test.trim()) throw new Error(`${action} has no audit test`);
    if (coverage.plan < 3 || coverage.plan > 9) {
      throw new Error(`${action} names an invalid plan ${coverage.plan}`);
    }
  }
});

Deno.test("audit coverage: governance actions are covered by Plan 07 tests", () => {
  const governance = [
    "CORRECTION_SUBMITTED",
    "CORRECTION_REVIEWED",
    "CORRECTION_APPLIED",
    "USER_ROLES_CHANGED",
    "USER_TRUST_CHANGED",
    "USER_STATUS_CHANGED",
    "USER_PII_PURGED",
  ] as const;
  for (const action of governance) {
    assertEquals(AUDIT_ACTION_COVERAGE[action].plan, 7);
  }
});
