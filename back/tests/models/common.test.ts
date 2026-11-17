// Plan 03 - common v3.1 document types, shared contracts, and model registry.
import { assert, assertEquals, assertThrows } from "@std/assert";
import { ObjectId } from "lesan";
import { accepts } from "./assertions.ts";
import {
  aliasStruct,
  docMetaFields,
  identityProvenanceStruct,
  localizedNameStruct,
  mergeableFields,
  sensitivityStruct,
  validityStruct,
} from "../../models/shared.ts";
import { MODEL_NAMES, RELATION_DECLARATIONS } from "../../models/mod.ts";
import { auditEventFields } from "../../models/auditEvent.ts";
import { sourceSnapshotFields } from "../../models/sourceSnapshot.ts";
import { assertKnownCategoryCode, getDefaultTaxonomy } from "../../utils/domain/taxonomy.ts";

Deno.test("common: DocMeta and Mergeable shapes are declared once", () => {
  assertEquals(
    Object.keys(docMetaFields()).sort(),
    ["createdAt", "createdBy", "schemaVersion", "updatedAt", "updatedBy", "version"],
  );
  assertEquals(
    Object.keys(mergeableFields()).sort(),
    ["lifecycle", "mergeReason", "mergedAt", "mergedBy", "mergedIntoId"],
  );
});

Deno.test("common: Validity is half-open with explicit unknown precision", () => {
  assert(accepts(validityStruct, {
    validFrom: null,
    validTo: null,
    datePrecision: "UNKNOWN",
  }));
  assert(accepts(validityStruct, {
    validFrom: new Date("2020-01-01T00:00:00Z"),
    validTo: null,
    datePrecision: "EXACT",
  }));
  assert(!accepts(validityStruct, { validFrom: null, validTo: null }));
  assert(!accepts(validityStruct, { validFrom: null, validTo: null, datePrecision: "SOMETIME" }));
});

Deno.test("common: Alias, LocalizedName, IdentityProvenance, and Sensitivity", () => {
  assert(accepts(aliasStruct, {
    _id: new ObjectId(),
    value: "Acme",
    normalizedValue: "acme",
    matchKey: "acme",
  }));
  assert(
    !accepts(aliasStruct, {
      _id: new ObjectId(),
      value: "Acme",
      normalizedValue: "acme",
    }),
  );
  assert(accepts(localizedNameStruct, { locale: "fa", value: "آکمی" }));
  assert(!accepts(localizedNameStruct, { locale: "fa" }));
  assert(accepts(identityProvenanceStruct, {
    sourceSnapshotIds: [new ObjectId()],
    lastVerifiedAt: new Date(),
    verifiedBy: new ObjectId(),
  }));
  for (const level of ["ROUTINE", "SENSITIVE", "HIGH_RISK"]) {
    assert(accepts(sensitivityStruct, level));
  }
  assert(!accepts(sensitivityStruct, "MEDIUM"));
});

Deno.test("common: snapshots and audit events carry no mutable metadata", () => {
  for (const forbidden of ["version", "updatedAt", "updatedBy"]) {
    assert(!(forbidden in sourceSnapshotFields), `source snapshot must not have ${forbidden}`);
  }
  assert("schemaVersion" in sourceSnapshotFields);
  assert("createdAt" in sourceSnapshotFields);

  for (const forbidden of ["version", "schemaVersion", "createdAt", "updatedAt", "createdBy"]) {
    assert(!(forbidden in auditEventFields), `audit event must not have ${forbidden}`);
  }
});

Deno.test("common: categoryCode is validated against the taxonomy file", () => {
  assertEquals(getDefaultTaxonomy().nodes.length, 0);
  assertThrows(
    () => assertKnownCategoryCode("NOT_IN_TAXONOMY"),
    Error,
    "UNKNOWN_CATEGORY_CODE",
  );
});

Deno.test("common: exactly eleven models and exactly two relations", () => {
  assertEquals(MODEL_NAMES, [
    "assets",
    "audit_events",
    "brands",
    "claims",
    "corrections",
    "organizations",
    "products",
    "relationships",
    "source_snapshots",
    "sources",
    "users",
  ]);
  assertEquals(
    RELATION_DECLARATIONS.map((relation) => `${relation.parent}.${relation.name}`).sort(),
    ["products.brand", "source_snapshots.source"],
  );
  const brandRelation = RELATION_DECLARATIONS.find((relation) => relation.parent === "products")!;
  assertEquals(brandRelation, {
    parent: "products",
    name: "brand",
    target: "brands",
    type: "single",
    optional: true,
    reverse: {
      name: "productsPreview",
      type: "multiple",
      limit: 20,
      sort: { field: "updatedAt", order: "desc" },
    },
  });
  const sourceRelation = RELATION_DECLARATIONS.find((relation) =>
    relation.parent === "source_snapshots"
  )!;
  assertEquals(sourceRelation, {
    parent: "source_snapshots",
    name: "source",
    target: "sources",
    type: "single",
    optional: false,
    reverse: {
      name: "recentSnapshotsPreview",
      type: "multiple",
      limit: 10,
      sort: { field: "retrievedAt", order: "desc" },
    },
  });
  assert(!(MODEL_NAMES as readonly string[]).includes("categories"));
  assert(!(MODEL_NAMES as readonly string[]).includes("evidence_items"));
  assert(!(MODEL_NAMES as readonly string[]).includes("verification_cases"));
  assert(!(MODEL_NAMES as readonly string[]).includes("review_cases"));
});
