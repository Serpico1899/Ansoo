// Plan 03 - product, brand, and organization persistence contracts.
import { assert, assertEquals, assertThrows } from "@std/assert";
import { ObjectId } from "lesan";
import { accepts } from "./assertions.ts";
import { brandFields, brandStruct, validateBrand } from "../../models/brand.ts";
import { organizationFields, organizationStruct } from "../../models/organization.ts";
import { productFields, productStruct, validateProduct } from "../../models/product.ts";
import { CapExceededError } from "../../utils/domain/caps.ts";
import { HARD_CAPS } from "../../utils/domain/constants.ts";

function productDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Product",
    normalizedName: "test product",
    matchKey: "testproduct",
    identifiers: [{
      _id: new ObjectId(),
      scheme: "GTIN",
      value: "0006381333931",
      normalizedValue: "0006381333931",
      status: "UNVERIFIED",
    }],
    brandMapping: { status: "UNREVIEWED" },
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function brandDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: "Acme",
    normalizedName: "acme",
    matchKey: "acme",
    aliases: [],
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

Deno.test("identity: product fields match spec 5.1 and reject ownership/score fields", () => {
  const valid = productDoc();
  assert(accepts(productStruct, valid));
  const fields = Object.keys(productFields);
  for (
    const required of [
      "name",
      "normalizedName",
      "matchKey",
      "identifiers",
      "categoryCode",
      "brandMapping",
      "identityProvenance",
      "packaging",
      "attributes",
      "lifecycle",
    ]
  ) {
    assert(fields.includes(required), `missing product field ${required}`);
  }
  for (const forbidden of ["ownerId", "score", "verdict", "brand", "recordLifecycle"]) {
    assert(!fields.includes(forbidden), `product must not have ${forbidden}`);
  }
  assert(!accepts(productStruct, { ...valid, ownerId: new ObjectId() }));
  assert(!accepts(productStruct, { ...valid, score: 99 }));
});

Deno.test("identity: product identifier cap is enforced at boundary and over limit", () => {
  const identifiers = Array.from({ length: HARD_CAPS.identifiers }, (_, index) => ({
    _id: new ObjectId(),
    scheme: "SKU",
    value: String(index).padStart(6, "0"),
    normalizedValue: String(index).padStart(6, "0"),
    status: "UNVERIFIED",
  }));
  validateProduct(productDoc({ identifiers }));
  const error = assertThrows(
    () => validateProduct(productDoc({ identifiers: [...identifiers, identifiers[0]] })),
    CapExceededError,
  );
  assertEquals(error.status, 422);
  assertEquals(error.code, "CAP_EXCEEDED");
  assertEquals(error.path, "identifiers");

  const duplicate = assertThrows(
    () => validateProduct(productDoc({ identifiers: [identifiers[0], identifiers[0]] })),
    CapExceededError,
  );
  assertEquals(duplicate.code, "DUPLICATE_VALUE");
});

Deno.test("identity: localizedNames and typed attributes obey caps and closed keys", () => {
  const names = Array.from({ length: HARD_CAPS.localizedNames }, (_, index) => ({
    locale: `l${index}`,
    value: `name ${index}`,
  }));
  validateProduct(productDoc({ localizedNames: names }));
  assertThrows(
    () =>
      validateProduct(productDoc({
        localizedNames: [...names, { locale: "extra", value: "extra" }],
      })),
    CapExceededError,
  );

  const attributes = Array.from({ length: HARD_CAPS.attributes }, (_, index) => ({
    key: "NET_CONTENT_TEXT",
    value: `${index} g`,
    locale: `l${index}`,
  }));
  validateProduct(productDoc({ attributes }));
  assertThrows(
    () => validateProduct(productDoc({ attributes: [...attributes, attributes[0]] })),
    CapExceededError,
  );
  assert(
    !accepts(
      productStruct,
      productDoc({
        attributes: [{ key: "ARBITRARY_KEY", value: "x" }],
      }),
    ),
  );
  assert(
    !accepts(
      productStruct,
      productDoc({
        attributes: [{ key: "NET_CONTENT_TEXT", value: { nested: true } }],
      }),
    ),
  );
});

Deno.test("identity: brand has no owner field and aliases are capped", () => {
  assert(accepts(brandStruct, brandDoc()));
  const fields = Object.keys(brandFields);
  for (const forbidden of ["ownerId", "owner", "parentOrganizationId", "recordLifecycle"]) {
    assert(!fields.includes(forbidden), `brand must not have ${forbidden}`);
  }
  assert(!accepts(brandStruct, { ...brandDoc(), ownerId: new ObjectId() }));

  const aliases = Array.from({ length: HARD_CAPS.aliases }, (_, index) => ({
    _id: new ObjectId(),
    value: `Alias ${index}`,
    normalizedValue: `alias ${index}`,
    matchKey: `alias${index}`,
  }));
  validateBrand(brandDoc({ aliases }));
  assertThrows(
    () => validateBrand(brandDoc({ aliases: [...aliases, aliases[0]] })),
    CapExceededError,
  );
});

Deno.test("identity: organizations keep kind, legal profile, and capped aliases", () => {
  const org = {
    name: "Acme Holdings",
    normalizedName: "acme holdings",
    matchKey: "acmeholdings",
    kind: "CORPORATE_GROUP",
    aliases: [],
    identifiers: [],
    legalProfile: { jurisdiction: "IR", registeredAddress: "private" },
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  assert(accepts(organizationStruct, org));
  assert(!accepts(organizationStruct, { ...org, kind: "IMPORTER" }));
  assert(!accepts(organizationStruct, { ...org, ownerId: new ObjectId() }));
  const fields = Object.keys(organizationFields);
  for (const forbidden of ["ownerId", "recordLifecycle", "score"]) {
    assert(!fields.includes(forbidden), `organization must not have ${forbidden}`);
  }
});

Deno.test("identity: categoryCode must exist in taxonomy.v1.json", () => {
  assert(accepts(productStruct, productDoc()));
  assert(!accepts(productStruct, productDoc({ categoryCode: "NOT_IN_TAXONOMY" })));
  assertThrows(() => validateProduct(productDoc({ categoryCode: "NOT_IN_TAXONOMY" })), Error);
});

Deno.test("identity: multi-brand and multi-category are not representable", () => {
  assert(!accepts(productStruct, productDoc({ brandIds: [new ObjectId()] })));
  assert(!accepts(productStruct, productDoc({ categoryCodes: ["a", "b"] })));
});
