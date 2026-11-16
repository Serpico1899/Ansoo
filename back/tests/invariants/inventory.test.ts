// CI check: every v3.1 invariant I01-I15 has exactly one named test.
//
// This guards against an invariant being deleted, renamed, or silently skipped.

import { assert, assertEquals } from "@std/assert";
import { INVARIANT_IDS, INVARIANTS } from "./inventory.ts";

Deno.test({
  name: "invariant inventory is complete, unique, and mapped",
  async fn() {
    const expected = Array.from(
      { length: 15 },
      (_, index) => `I${String(index + 1).padStart(2, "0")}`,
    );
    assertEquals(INVARIANT_IDS, expected, "inventory must contain I01-I15 in order");
    assertEquals(new Set(INVARIANT_IDS).size, 15, "invariant IDs must be unique");

    for (const invariant of INVARIANTS) {
      assert(invariant.title.trim().length > 0, `${invariant.id} needs a title`);
      assert(invariant.implementedBy.length > 0, `${invariant.id} needs an implementing plan`);
      for (const plan of invariant.implementedBy) {
        assert(
          Number.isInteger(plan) && plan >= 3 && plan <= 9,
          `${invariant.id} references an out-of-range plan: ${plan}`,
        );
      }
      assert(invariant.scenarios.length > 0, `${invariant.id} needs at least one scenario`);
      for (const scenario of invariant.scenarios) {
        assert(
          /^S(0[1-9]|[12]\d|30)$/.test(scenario),
          `${invariant.id} references an invalid scenario: ${scenario}`,
        );
      }
      if (invariant.foundation === "blocked") {
        assert(
          invariant.blockedBy !== undefined && invariant.blockedBy.trim().length > 0,
          `${invariant.id} is blocked but names no blocker`,
        );
      }
    }

    const source = await Deno.readTextFile(
      new URL("./invariants.test.ts", import.meta.url),
    );
    const registered = [...source.matchAll(/"(I\d{2}) - /g)].map((match) => match[1]);
    assertEquals(
      [...new Set(registered)].sort(),
      [...INVARIANT_IDS].sort(),
      "every invariant must have one named Deno.test",
    );
    assertEquals(
      registered.length,
      new Set(registered).size,
      "each invariant may have only one registered test",
    );
    assert(!registered.includes("I16"), "no invariant above I15 is allowed");
  },
});
