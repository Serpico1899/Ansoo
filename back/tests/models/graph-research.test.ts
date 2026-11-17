// Plan 03 - relationship matrix and claim structured-value contracts.
import { assert, assertEquals, assertThrows } from "@std/assert";
import { ObjectId } from "lesan";
import { accepts } from "./assertions.ts";
import { claimStruct, validateClaim } from "../../models/claim.ts";
import { relationshipStruct, validateRelationshipMatrix } from "../../models/relationship.ts";
import { CapExceededError } from "../../utils/domain/caps.ts";
import { CLAIM_TYPES, HARD_CAPS, RELATIONSHIP_PREDICATES } from "../../utils/domain/constants.ts";

const org = { type: "ORGANIZATION", id: new ObjectId() };
const brand = { type: "BRAND", id: new ObjectId() };
const product = { type: "PRODUCT", id: new ObjectId() };

function relationshipDoc(overrides: Record<string, unknown> = {}) {
  return {
    subject: org,
    predicate: "OWNS",
    predicateRegistryVersion: 1,
    object: brand,
    validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
    sensitivity: "SENSITIVE",
    recordLifecycle: "ACTIVE",
    review: { status: "NOT_QUEUED", priority: "NORMAL" },
    assessment: {
      outcome: "NOT_ASSESSED",
      methodologyVersion: "1",
      limitations: [],
    },
    publication: { status: "DRAFT" },
    evidence: [],
    organizationResponses: [],
    responseSolicitations: [],
    researchNotes: [],
    recentRevisionPreview: [],
    recordedAt: new Date(),
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function claimDoc(overrides: Record<string, unknown> = {}) {
  return {
    about: product,
    claimType: "MARKET_PRESENCE",
    claimTypeRegistryVersion: 1,
    statement: "The product is sold in Iran.",
    structuredValue: {
      claimType: "MARKET_PRESENCE",
      marketCountryCode: "IR",
      observationBasis: "OFFICIAL_LIST",
      channel: "RETAIL",
    },
    sensitivity: "ROUTINE",
    recordLifecycle: "ACTIVE",
    review: { status: "NOT_QUEUED", priority: "NORMAL" },
    assessment: {
      outcome: "NOT_ASSESSED",
      methodologyVersion: "1",
      limitations: [],
    },
    publication: { status: "DRAFT" },
    evidence: [],
    organizationResponses: [],
    responseSolicitations: [],
    researchNotes: [],
    recentRevisionPreview: [],
    recordedAt: new Date(),
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

Deno.test("graph: exactly five predicates and three claim types are representable", () => {
  assertEquals([...RELATIONSHIP_PREDICATES], [
    "OWNS",
    "CONTROLS",
    "MANUFACTURES",
    "DISTRIBUTES",
    "IMPORTS_TO_MARKET",
  ]);
  assertEquals([...CLAIM_TYPES], ["MARKET_PRESENCE", "PRODUCT_ORIGIN", "OFFICIAL_STATEMENT"]);
});

Deno.test("graph: relationship endpoint matrix and required context are enforced", () => {
  assert(accepts(relationshipStruct, relationshipDoc()));
  assert(accepts(
    relationshipStruct,
    relationshipDoc({
      predicate: "CONTROLS",
      context: { ownership: { basis: "VOTING_RIGHTS" } },
    }),
  ));
  assert(accepts(
    relationshipStruct,
    relationshipDoc({
      predicate: "MANUFACTURES",
      object: product,
    }),
  ));
  assert(accepts(
    relationshipStruct,
    relationshipDoc({
      predicate: "DISTRIBUTES",
      object: product,
      context: { marketCountryCode: "IR" },
    }),
  ));
  assert(accepts(
    relationshipStruct,
    relationshipDoc({
      predicate: "IMPORTS_TO_MARKET",
      object: product,
      context: { marketCountryCode: "IR" },
    }),
  ));

  assert(!accepts(relationshipStruct, relationshipDoc({ predicate: "SUBSIDIARY_OF" })));
  assert(!accepts(relationshipStruct, relationshipDoc({ subject: brand })));
  assert(
    !accepts(
      relationshipStruct,
      relationshipDoc({
        predicate: "CONTROLS",
        context: {},
      }),
    ),
  );
  assert(
    !accepts(
      relationshipStruct,
      relationshipDoc({
        subject: org,
        predicate: "MANUFACTURES",
        object: brand,
      }),
    ),
  );
  assert(
    !accepts(
      relationshipStruct,
      relationshipDoc({
        predicate: "DISTRIBUTES",
        object: product,
      }),
    ),
  );
  assert(
    !accepts(
      relationshipStruct,
      relationshipDoc({
        predicate: "IMPORTS_TO_MARKET",
        object: brand,
        context: { marketCountryCode: "IR" },
      }),
    ),
  );
});

Deno.test("graph: matrix helper returns a stable domain error", () => {
  const error = assertThrows(
    () => validateRelationshipMatrix(relationshipDoc({ predicate: "SUBSIDIARY_OF" })),
    Error,
  );
  assertEquals(error.name, "DomainValidationError");
});

Deno.test("research: each claim type has an exhaustive structured value", () => {
  assert(accepts(claimStruct, claimDoc()));
  assert(accepts(
    claimStruct,
    claimDoc({
      claimType: "PRODUCT_ORIGIN",
      structuredValue: {
        claimType: "PRODUCT_ORIGIN",
        declaredOriginCountryCode: "IR",
        declarationSurface: "PACKAGE",
      },
    }),
  ));
  assert(accepts(
    claimStruct,
    claimDoc({
      claimType: "OFFICIAL_STATEMENT",
      structuredValue: {
        claimType: "OFFICIAL_STATEMENT",
        speakingOrganizationId: new ObjectId(),
        statementDate: null,
        statementDatePrecision: "UNKNOWN",
        channel: "PRESS_RELEASE",
      },
    }),
  ));

  assert(!accepts(claimStruct, claimDoc({ claimType: "MANUFACTURING_LOCATION" })));
  assert(
    !accepts(
      claimStruct,
      claimDoc({
        structuredValue: { claimType: "OTHER_REVIEWED_TYPE" },
      }),
    ),
  );
  assert(
    !accepts(
      claimStruct,
      claimDoc({
        claimType: "PRODUCT_ORIGIN",
        structuredValue: {
          claimType: "MARKET_PRESENCE",
          marketCountryCode: "IR",
          observationBasis: "OFFICIAL_LIST",
        },
      }),
    ),
  );
});

Deno.test("research: claim caps and character limits are enforced", () => {
  const relatedEntities = Array.from({ length: HARD_CAPS.relatedEntities }, () => ({
    type: "ORGANIZATION",
    id: new ObjectId(),
  }));
  validateClaim(claimDoc({ relatedEntities }));

  const error = assertThrows(
    () =>
      validateClaim(claimDoc({
        relatedEntities: [...relatedEntities, { type: "BRAND", id: new ObjectId() }],
      })),
    CapExceededError,
  );
  assertEquals(error.status, 422);
  assertEquals(error.code, "CAP_EXCEEDED");
  assertEquals(error.path, "relatedEntities");

  validateClaim(claimDoc({ statement: "x".repeat(2_000) }));
  assertThrows(
    () => validateClaim(claimDoc({ statement: "x".repeat(2_001) })),
    CapExceededError,
  );
  assertThrows(
    () => validateClaim(claimDoc({ publicWording: "x".repeat(2_001) })),
    CapExceededError,
  );
});
