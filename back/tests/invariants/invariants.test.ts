// v3.1 invariant harness: one named test per invariant I01-I15.
//
// Foundation-level invariants are enforced now by the shared vocabulary.
// Later-plan invariants stay registered with an explicit blocker so the harness
// cannot silently pass or disappear. `inventory.test.ts` fails if any ID is
// missing, duplicated, or unmapped.

import { assert, assertEquals } from "@std/assert";
import * as domain from "../../utils/domain/constants.ts";
import { assertCompleteClassification } from "../../utils/projections/mod.ts";

// Literal names let the CI inventory check prove every ID is registered. Keep
// these aligned with tests/invariants/inventory.ts.
const TEST_NAMES = {
  I01: "I01 - Product, Brand, and Organization are distinct identity types",
  I02: "I02 - UNKNOWN is not FALSE and NOT_SUPPORTED is not a negative boolean",
  I03: "I03 - Review, assessment, publication, legal, and campaign statuses stay separate",
  I04: "I04 - Public projections never return internal data",
  I12: "I12 - No universal score, color, badge, or verdict is produced",
  I14: "I14 - Array caps are enforced in validators with 422, never silent discard",
} as const;

Deno.test({
  name: TEST_NAMES.I01,
  fn() {
    const types = domain.ENTITY_TYPES as readonly string[];
    assertEquals(new Set(types).size, types.length, "entity types must be unique");
    assertEquals(
      Object.keys(domain.ENTITY_COLLECTION).sort(),
      [...types].sort(),
      "every entity type must map to exactly one canonical collection",
    );
    assert(!types.includes("OWNER"), "OWNER is not an identity type");
    assert(!types.includes("IMPORTER"), "Importer is a role, not an identity type");
    assert(
      !(Object.values(domain.ENTITY_COLLECTION) as readonly string[]).includes("categories"),
      "there is no categories collection in v3.1",
    );
    assert(
      !(domain.RELATIONSHIP_ENDPOINT_TYPES as readonly string[]).includes("IMPORTER"),
      "Relationship endpoints are PRODUCT, BRAND, ORGANIZATION only",
    );
    assert(
      !(domain.PRODUCT_ATTRIBUTE_KEYS as readonly string[]).includes("OWNER"),
      "Product has no owner attribute; ownership is a Relationship",
    );
  },
});

Deno.test({
  name: TEST_NAMES.I02,
  fn() {
    const outcomes = domain.EVIDENCE_ASSESSMENT_OUTCOMES as readonly string[];
    for (const forbidden of ["TRUE", "FALSE", "YES", "NO"]) {
      assert(!outcomes.includes(forbidden), `assessment outcome must not be ${forbidden}`);
    }
    assert(outcomes.includes("NOT_SUPPORTED"));
    assert(outcomes.includes("NOT_ASSESSED"));
    for (const helper of ["assessmentOutcomeToBoolean", "isFalse", "isTrue", "asBoolean"]) {
      assert(!(helper in domain), `no boolean-negation helper may exist: ${helper}`);
    }
  },
});

Deno.test({
  name: TEST_NAMES.I03,
  fn() {
    const dimensions = [
      domain.REVIEW_WORKFLOW_STATUSES,
      domain.EVIDENCE_ASSESSMENT_OUTCOMES,
      domain.PUBLICATION_STATUSES,
      domain.RECORD_LIFECYCLE,
    ] as const;
    for (let i = 0; i < dimensions.length; i++) {
      for (let j = i + 1; j < dimensions.length; j++) {
        const overlap = dimensions[i].filter((value) =>
          (dimensions[j] as readonly string[]).includes(value)
        );
        assertEquals(overlap, [], "status dimensions must not share value sets");
      }
    }
    assert(!("verdict" in domain), "no combined verdict field may exist");
    assert(!("findingBadge" in domain), "no combined badge field may exist");
  },
});

Deno.test({
  name: TEST_NAMES.I14,
  fn() {
    const cap = domain.HARD_CAPS.identifiers;
    assertEquals(domain.hardCapViolation("identifiers", cap), null);
    const violation = domain.hardCapViolation("identifiers", cap + 1);
    assertEquals(violation?.status, 422);
    assertEquals(violation?.code, "CAP_EXCEEDED");
    assertEquals(violation?.cap, cap);
    assertEquals(violation?.actual, cap + 1);
  },
});

Deno.test({
  name: TEST_NAMES.I04,
  fn() {
    assertCompleteClassification();
  },
});

Deno.test({
  name: TEST_NAMES.I12,
  fn() {
    const forbiddenValues = new Set(["SCORE", "VERDICT", "BADGE", "COLOR", "RATING", "BOYCOTT"]);
    for (const [name, value] of Object.entries(domain)) {
      assert(
        !/^(score|verdict|badge|rating|boycott)/i.test(name),
        `no score-like export may exist: ${name}`,
      );
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item !== "string") continue;
          assert(
            !forbiddenValues.has(item),
            `no score-like enum value may exist: ${item}`,
          );
        }
      }
    }
    assert(
      (domain.PUBLICATION_GATE_CHECKS as readonly string[]).includes("noScoreOk"),
      "the publication gate must explicitly require no score",
    );
  },
});
