// Taxonomy contract: code validation with no Category collection.

import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  categoryCodeSet,
  isKnownCategoryCode,
  loadTaxonomy,
  parseTaxonomy,
  TAXONOMY_DEFAULT_PATH,
  TAXONOMY_SCHEMA_VERSION,
  TaxonomyError,
} from "../../utils/domain/taxonomy.ts";

const VALID = {
  schemaVersion: 1,
  version: "v1-test",
  nodes: [
    { code: "FOOD", labels: { en: "Food", fa: "خوراک" } },
    { code: "DAIRY", parentCode: "FOOD", labels: { en: "Dairy" } },
  ],
};

Deno.test("the repository taxonomy file loads with schema version 1", async () => {
  const taxonomy = await loadTaxonomy();
  assertEquals(taxonomy.schemaVersion, TAXONOMY_SCHEMA_VERSION);
  assertEquals(typeof taxonomy.version, "string");
  assert(Array.isArray(taxonomy.nodes));
  assertEquals(TAXONOMY_DEFAULT_PATH.pathname.endsWith("/taxonomy.v1.json"), true);
});

Deno.test("valid taxonomy codes are known and parent links resolve", () => {
  const taxonomy = parseTaxonomy(VALID);
  assertEquals(categoryCodeSet(taxonomy), new Set(["FOOD", "DAIRY"]));
  assert(isKnownCategoryCode(taxonomy, "FOOD"));
  assert(!isKnownCategoryCode(taxonomy, "UNKNOWN_CODE"));
});

Deno.test("duplicate, missing-parent, self-parent, and cyclic codes are rejected", () => {
  assertThrows(
    () =>
      parseTaxonomy({
        schemaVersion: 1,
        version: "v1",
        nodes: [
          { code: "A", labels: { en: "A" } },
          { code: "A", labels: { en: "A again" } },
        ],
      }),
    TaxonomyError,
    "duplicate category code",
  );

  assertThrows(
    () =>
      parseTaxonomy({
        schemaVersion: 1,
        version: "v1",
        nodes: [{ code: "A", parentCode: "MISSING", labels: { en: "A" } }],
      }),
    TaxonomyError,
    "missing parent",
  );

  assertThrows(
    () =>
      parseTaxonomy({
        schemaVersion: 1,
        version: "v1",
        nodes: [{ code: "A", parentCode: "A", labels: { en: "A" } }],
      }),
    TaxonomyError,
    "own parent",
  );

  assertThrows(
    () =>
      parseTaxonomy({
        schemaVersion: 1,
        version: "v1",
        nodes: [
          { code: "A", parentCode: "B", labels: { en: "A" } },
          { code: "B", parentCode: "A", labels: { en: "B" } },
        ],
      }),
    TaxonomyError,
    "cycle detected",
  );
});

Deno.test("taxonomy structure requires labels and a known schema version", () => {
  assertThrows(
    () => parseTaxonomy({ schemaVersion: 2, version: "v2", nodes: [] }),
    TaxonomyError,
    "schemaVersion must be 1",
  );
  assertThrows(
    () =>
      parseTaxonomy({
        schemaVersion: 1,
        version: "v1",
        nodes: [{ code: "A", labels: {} }],
      }),
    TaxonomyError,
    "at least one locale",
  );
});
