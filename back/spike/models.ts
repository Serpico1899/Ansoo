// Disposable Lesan models for the architecture spike.
//
// Only the three approved fixed-schema relations are declared:
//   products.brand, products.category, source_snapshots.source
// Everything else is a typed reference and is validated by spike/registry.ts.
import {
  array,
  boolean,
  date,
  enums,
  lesan,
  number,
  object,
  optional,
  string,
  type as structType,
  unknown,
} from "lesan";

export const LIFECYCLE = ["ACTIVE", "ARCHIVED"] as const;
export const REVIEW_STATUS = [
  "NOT_QUEUED",
  "QUEUED",
  "IN_REVIEW",
  "NEEDS_INFORMATION",
  "READY_FOR_DECISION",
  "CLOSED",
] as const;
export const ASSESSMENT_OUTCOME = [
  "NOT_ASSESSED",
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "NOT_SUPPORTED",
  "DISPUTED",
  "INCONCLUSIVE",
] as const;
export const PUBLICATION_STATUS = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "WITHHELD",
  "RETRACTED",
] as const;
export const ROLES = [
  "CONTRIBUTOR",
  "RESEARCHER",
  "LEGAL_REVIEWER",
  "MODERATOR",
  "ADMIN",
] as const;
export const ENTITY_TYPES = [
  "product",
  "brand",
  "category",
  "organization",
  "relationship",
  "claim",
  "source",
  "source_snapshot",
  "correction",
  "asset",
  "user",
] as const;

export const ref = structType({ type: string(), id: string() });

const timestamps = () => ({
  schemaVersion: number(),
  version: number(),
  createdAt: date(),
  updatedAt: optional(date()),
  createdBy: optional(string()),
  updatedBy: optional(string()),
});

const lifecycle = () => ({ recordLifecycle: enums(LIFECYCLE) });

const review = () =>
  object({
    status: enums(REVIEW_STATUS),
    assignedTo: optional(string()),
    priority: optional(number()),
  });

const assessment = () =>
  object({
    outcome: enums(ASSESSMENT_OUTCOME),
    summary: optional(string()),
    assessedBy: optional(string()),
  });

const publication = () =>
  object({
    status: enums(PUBLICATION_STATUS),
    decidedBy: optional(string()),
    publishedAt: optional(date()),
    withheldReason: optional(string()),
    visibility: optional(enums(["PUBLIC", "INTERNAL", "RESTRICTED"] as const)),
  });

const evidenceLink = () =>
  object({
    sourceSnapshotId: string(),
    stance: enums(["SUPPORTS", "CONTRADICTS", "CONTEXTUALIZES", "NEUTRAL"] as const),
    locator: optional(string()),
    excerpt: optional(string()),
    rationale: optional(string()),
    reviewerId: optional(string()),
  });

const organizationResponse = () =>
  object({
    respondingOrganizationId: string(),
    statement: string(),
    receivedAt: date(),
    authorityVerified: boolean(),
    publication: optional(publication()),
  });

const researchNote = () =>
  object({
    body: string(),
    authorId: string(),
    createdAt: date(),
    visibility: enums(["INTERNAL", "LEGAL", "ADMIN"] as const),
  });

const revisionPreview = () =>
  object({
    version: number(),
    changedPaths: array(string()),
    changedAt: date(),
    changedBy: optional(string()),
  });

export type SpikeModels = ReturnType<typeof createSpikeModels>;

export function createSpikeModels(core: ReturnType<typeof lesan>) {
  const users = core.odm.newModel("users", {
    authProvider: string(),
    authSubject: string(),
    email: optional(string()),
    phone: optional(string()),
    displayName: string(),
    preferredLocale: enums(["en", "fa", "ar"] as const),
    roles: array(enums(ROLES)),
    trustLevel: number(),
    accountStatus: enums(["ACTIVE", "SUSPENDED", "CLOSED"] as const),
    lastActiveAt: optional(date()),
    ...timestamps(),
  }, {});

  const brands = core.odm.newModel("brands", {
    name: string(),
    normalizedName: string(),
    aliases: optional(array(object({
      value: string(),
      normalizedValue: string(),
      locale: optional(string()),
    }))),
    website: optional(string()),
    logoAssetId: optional(string()),
    internalNotes: optional(array(researchNote())),
    ...lifecycle(),
    ...timestamps(),
  }, {});

  const categories = core.odm.newModel("categories", {
    code: string(),
    name: string(),
    normalizedName: string(),
    localizedNames: optional(array(object({
      locale: string(),
      value: string(),
    }))),
    parentCategoryId: optional(string()),
    ancestorIds: array(string()),
    depth: number(),
    sortOrder: number(),
    taxonomyVersion: number(),
    ...lifecycle(),
    ...timestamps(),
  }, {});

  const organizations = core.odm.newModel("organizations", {
    name: string(),
    normalizedName: string(),
    kind: enums([
      "CORPORATE_GROUP",
      "LEGAL_ENTITY",
      "PUBLIC_BODY",
      "NON_PROFIT",
      "RETAILER",
      "OTHER_REVIEWED",
    ] as const),
    aliases: optional(array(object({
      value: string(),
      normalizedValue: string(),
    }))),
    identifiers: optional(array(object({
      scheme: string(),
      value: string(),
      normalizedValue: string(),
      jurisdiction: optional(string()),
    }))),
    operatingCountryCodes: optional(array(string())),
    internalNotes: optional(array(researchNote())),
    ...lifecycle(),
    ...timestamps(),
  }, {});

  const sources = core.odm.newModel("sources", {
    title: string(),
    canonicalUrl: string(),
    sourceType: enums([
      "GOVERNMENT_REGISTRY",
      "COMPANY_STATEMENT",
      "NEWS_ARTICLE",
      "NGO_REPORT",
      "COURT_RECORD",
      "OTHER_REVIEWED",
    ] as const),
    publisherName: optional(string()),
    publisherOrganizationId: optional(string()),
    language: optional(string()),
    countryCode: optional(string()),
    jurisdiction: optional(string()),
    access: enums(["PUBLIC", "RESTRICTED", "PAYWALLED"] as const),
    usageTerms: optional(string()),
    lastCapturedAt: optional(date()),
    ...lifecycle(),
    ...timestamps(),
  }, {});

  const assets = core.odm.newModel("assets", {
    storage: object({
      provider: enums(["LOCAL_DEV", "S3_COMPATIBLE"] as const),
      bucket: string(),
      objectKey: string(),
    }),
    originalFileName: string(),
    safeDisplayName: string(),
    mimeType: string(),
    byteSize: number(),
    sha256: string(),
    processingStatus: enums([
      "QUARANTINED",
      "SCANNING",
      "CLEAN",
      "REJECTED",
    ] as const),
    visibility: enums(["PUBLIC", "INTERNAL", "RESTRICTED", "REDACTED"] as const),
    uploadedBy: optional(string()),
    uploadedAt: date(),
    malwareScan: optional(object({
      status: enums(["PENDING", "CLEAN", "INFECTED", "FAILED"] as const),
      scanner: optional(string()),
      scannedAt: optional(date()),
    })),
    ...lifecycle(),
    ...timestamps(),
  }, {});

  const products = core.odm.newModel("products", {
    name: string(),
    normalizedName: string(),
    localizedNames: optional(array(object({
      locale: string(),
      value: string(),
    }))),
    identifiers: array(object({
      scheme: string(),
      value: string(),
      normalizedValue: string(),
      jurisdiction: optional(string()),
      issuer: optional(string()),
      status: enums(["VERIFIED", "UNVERIFIED", "DISPUTED", "RETIRED"] as const),
      sourceSnapshotIds: optional(array(string())),
      validFrom: optional(date()),
      validTo: optional(date()),
    })),
    brandMapping: object({
      state: enums(["CONFIRMED", "UNVERIFIED", "CONFLICTING", "NONE"] as const),
      summary: optional(string()),
    }),
    packaging: optional(object({
      format: optional(string()),
      quantity: optional(number()),
      unit: optional(string()),
    })),
    attributes: optional(array(object({
      key: string(),
      value: string(),
    }))),
    mergedIntoProductId: optional(string()),
    ...lifecycle(),
    ...timestamps(),
  }, {
    brand: {
      schemaName: "brands",
      type: "single",
      optional: true,
      excludes: ["internalNotes"],
      relatedRelations: {
        productsPreview: {
          type: "multiple",
          limit: 5,
          sort: { field: "updatedAt", order: "desc" },
        },
      },
    },
    category: {
      schemaName: "categories",
      type: "single",
      optional: true,
      relatedRelations: {
        productsPreview: {
          type: "multiple",
          limit: 5,
          sort: { field: "updatedAt", order: "desc" },
        },
      },
    },
  });

  const sourceSnapshots = core.odm.newModel("source_snapshots", {
    titleAtCapture: string(),
    canonicalUrlAtCapture: string(),
    publishedAt: optional(date()),
    retrievedAt: date(),
    contentHash: string(),
    hashAlgorithm: enums(["SHA-256"] as const),
    mimeType: string(),
    byteSize: number(),
    assetId: optional(string()),
    captureMethod: enums(["MANUAL_UPLOAD", "URL_FETCH", "API_IMPORT"] as const),
    acquisitionTier: enums(["PRIMARY", "SECONDARY", "TERTIARY"] as const),
    capturedBy: optional(string()),
    captureMetadata: optional(object({
      httpStatus: optional(number()),
      finalUrl: optional(string()),
      userAgent: optional(string()),
    })),
    ...lifecycle(),
    ...timestamps(),
  }, {
    source: {
      schemaName: "sources",
      type: "single",
      optional: false,
      relatedRelations: {
        recentSnapshotsPreview: {
          type: "multiple",
          limit: 5,
          sort: { field: "retrievedAt", order: "desc" },
        },
      },
    },
  });

  const relationships = core.odm.newModel("relationships", {
    subject: ref,
    predicate: enums([
      "OWNS",
      "CONTROLS",
      "SUBSIDIARY_OF",
      "MANUFACTURES",
      "DISTRIBUTES",
      "IMPORTS_TO_MARKET",
      "EXPORTS_TO_MARKET",
      "SUPPLIES",
      "OPERATES",
    ] as const),
    predicateRegistryVersion: number(),
    object: ref,
    context: object({
      marketCountryCode: optional(string()),
      productCategoryCode: optional(string()),
    }),
    validity: object({
      validFrom: optional(date()),
      validTo: optional(date()),
    }),
    review: review(),
    assessment: assessment(),
    publication: publication(),
    evidence: optional(array(evidenceLink())),
    organizationResponses: optional(array(organizationResponse())),
    researchNotes: optional(array(researchNote())),
    recentRevisionPreview: optional(array(revisionPreview())),
    canonicalKey: string(),
    recordedAt: date(),
    ...lifecycle(),
    ...timestamps(),
  }, {});

  const claims = core.odm.newModel("claims", {
    about: ref,
    relatedEntities: optional(array(ref)),
    claimType: enums([
      "MARKET_PRESENCE",
      "PRODUCT_ORIGIN",
      "MANUFACTURING_LOCATION",
      "CORPORATE_ACTIVITY",
      "OFFICIAL_STATEMENT",
      "PRODUCT_ATTRIBUTE",
      "OTHER_REVIEWED_TYPE",
    ] as const),
    statement: string(),
    localizedStatements: optional(array(object({
      locale: string(),
      statement: string(),
    }))),
    structuredValue: optional(unknown()),
    scope: object({
      marketCountryCode: optional(string()),
      validFrom: optional(date()),
      validTo: optional(date()),
    }),
    review: review(),
    assessment: assessment(),
    publication: publication(),
    evidence: optional(array(evidenceLink())),
    organizationResponses: optional(array(organizationResponse())),
    researchNotes: optional(array(researchNote())),
    recordedAt: date(),
    ...lifecycle(),
    ...timestamps(),
  }, {});

  const corrections = core.odm.newModel("corrections", {
    target: optional(ref),
    submissionKind: enums([
      "CORRECTION",
      "COMPLETION",
      "CHALLENGE",
      "RETRACTION",
      "MISSING_ENTITY",
    ] as const),
    proposedChange: object({
      fieldKey: string(),
      operation: enums(["SET", "UNSET", "ADD", "REMOVE"] as const),
      proposedValue: optional(unknown()),
    }),
    reason: string(),
    evidenceReferences: optional(array(string())),
    submittedBy: string(),
    submittedAt: date(),
    status: enums([
      "SUBMITTED",
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
      "APPLIED",
      "WITHDRAWN",
    ] as const),
    review: review(),
    application: optional(object({
      appliedAt: date(),
      appliedBy: string(),
      resultVersion: number(),
      idempotencyKey: string(),
    })),
    ...lifecycle(),
    ...timestamps(),
  }, {});

  const auditEvents = core.odm.newModel("audit_events", {
    eventSchemaVersion: number(),
    actor: ref,
    action: enums([
      "CREATE",
      "UPDATE",
      "RELATION_CHANGE",
      "PUBLISH",
      "RETRACT",
      "CORRECTION_SUBMIT",
      "CORRECTION_APPROVE",
      "CORRECTION_APPLY",
      "PERMISSION_CHANGE",
      "ASSET_CHANGE",
    ] as const),
    target: ref,
    requestId: string(),
    correlationId: optional(string()),
    targetVersionBefore: optional(number()),
    targetVersionAfter: optional(number()),
    changedPaths: array(string()),
    beforeSummary: optional(unknown()),
    afterSummary: optional(unknown()),
    reason: optional(string()),
    occurredAt: date(),
    ...timestamps(),
    // Audit events are append-only; version is always 1.
  }, {});

  return {
    users,
    brands,
    categories,
    organizations,
    sources,
    assets,
    products,
    sourceSnapshots,
    relationships,
    claims,
    corrections,
    auditEvents,
  };
}
