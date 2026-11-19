// Plan 08 - every registered action is documented with its access policy and test.
import { assert, assertEquals } from "@std/assert";
import { lesan } from "lesan";
import type { Db } from "lesan";
import { registerActions } from "../../src/mod.ts";
import { ACTION_INVENTORY, registeredActionKeys } from "../../utils/api/mod.ts";
import type { AppConfig } from "../../utils/config.ts";

Deno.test("actions: registered actions match the documented inventory", () => {
  const core = lesan();
  registerActions(core, {
    db: undefined as unknown as Db,
    config: undefined as unknown as AppConfig,
  });

  const registered = new Set(registeredActionKeys());
  assertEquals(registered.size, 5);
  for (const key of registered) {
    const entry = ACTION_INVENTORY.find((item) => item.action === key);
    assert(entry !== undefined, `${key} is missing from ACTION_INVENTORY`);
    assert(entry.implemented, `${key} is marked unimplemented`);
  }
  for (const entry of ACTION_INVENTORY.filter((item) => item.implemented)) {
    assert(registered.has(entry.action), `${entry.action} is documented but not registered`);
  }
});
