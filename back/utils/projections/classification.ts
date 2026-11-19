// Plan 08 - explicit three-level field classification.
//
// Every canonical source field maps to exactly one level. Nested keys are
// listed only when they are stricter than their parent. A top-level field with
// no classification fails closed instead of being copied by accident.
import { ObjectId } from "lesan";

export const PROJECTION_LEVELS = ["PUBLIC", "RESEARCH", "ADMIN"] as const;
export type ProjectionLevel = typeof PROJECTION_LEVELS[number];

export const PROJECTION_RANK: Record<ProjectionLevel, number> = {
  PUBLIC: 0,
  RESEARCH: 1,
  ADMIN: 2,
};

export const CANONICAL_COLLECTIONS = [
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
] as const;

export type CanonicalCollection = typeof CANONICAL_COLLECTIONS[number];

type FieldMap = Record<string, ProjectionLevel>;

export class UnclassifiedFieldError extends Error {
  constructor(readonly collection: string, readonly path: string) {
    super(`unclassified projection field: ${collection}.${path}`);
    this.name = "UnclassifiedFieldError";
  }
}

export const FIELD_CLASSIFICATION: Record<CanonicalCollection, FieldMap> = {
  assets: {
    _id: "PUBLIC",
    storage: "ADMIN",
    originalFileName: "ADMIN",
    safeDisplayName: "PUBLIC",
    mimeType: "PUBLIC",
    byteSize: "PUBLIC",
    sha256: "PUBLIC",
    processingStatus: "PUBLIC",
    visibility: "PUBLIC",
    uploadedBy: "ADMIN",
    uploadedAt: "PUBLIC",
    malwareScan: "ADMIN",
    exifStripped: "ADMIN",
    retentionUntil: "ADMIN",
    legalHold: "ADMIN",
    purgedAt: "ADMIN",
    lifecycle: "PUBLIC",
    version: "ADMIN",
    schemaVersion: "ADMIN",
  },
  audit_events: {
    _id: "ADMIN",
    eventSchemaVersion: "ADMIN",
    actor: "ADMIN",
    action: "ADMIN",
    target: "ADMIN",
    requestId: "ADMIN",
    correlationId: "ADMIN",
    idempotencyKey: "ADMIN",
    targetVersionBefore: "ADMIN",
    targetVersionAfter: "ADMIN",
    changedPaths: "ADMIN",
    beforeSummary: "ADMIN",
    afterSummary: "ADMIN",
    reason: "ADMIN",
    occurredAt: "ADMIN",
  },
  brands: {
    _id: "PUBLIC",
    name: "PUBLIC",
    normalizedName: "PUBLIC",
    matchKey: "RESEARCH",
    localizedNames: "PUBLIC",
    aliases: "PUBLIC",
    "aliases._id": "RESEARCH",
    "aliases.matchKey": "RESEARCH",
    "aliases.sourceSnapshotId": "RESEARCH",
    description: "PUBLIC",
    website: "PUBLIC",
    logoAssetId: "RESEARCH",
    identityProvenance: "RESEARCH",
    "identityProvenance.sourceSnapshotIds": "RESEARCH",
    "identityProvenance.verifiedBy": "RESEARCH",
    lifecycle: "PUBLIC",
    mergedIntoId: "RESEARCH",
    mergedAt: "RESEARCH",
    mergedBy: "ADMIN",
    mergeReason: "RESEARCH",
    schemaVersion: "RESEARCH",
    version: "RESEARCH",
    createdAt: "PUBLIC",
    updatedAt: "RESEARCH",
    createdBy: "RESEARCH",
    updatedBy: "ADMIN",
    productsPreview: "RESEARCH",
  },
  claims: {
    _id: "PUBLIC",
    about: "PUBLIC",
    relatedEntities: "PUBLIC",
    claimType: "PUBLIC",
    claimTypeRegistryVersion: "RESEARCH",
    statement: "PUBLIC",
    publicWording: "PUBLIC",
    localizedStatements: "PUBLIC",
    structuredValue: "PUBLIC",
    scope: "PUBLIC",
    sensitivity: "RESEARCH",
    recordLifecycle: "PUBLIC",
    review: "RESEARCH",
    assessment: "PUBLIC",
    "assessment.assessedBy": "RESEARCH",
    publication: "PUBLIC",
    "publication.decidedBy": "RESEARCH",
    "publication.decidedAt": "RESEARCH",
    publicationGate: "RESEARCH",
    evidence: "PUBLIC",
    "evidence.sourceSnapshotId": "RESEARCH",
    "evidence.addedBy": "RESEARCH",
    "evidence.reviewedBy": "RESEARCH",
    organizationResponses: "PUBLIC",
    "organizationResponses.sourceSnapshotId": "RESEARCH",
    "organizationResponses.attachmentAssetIds": "RESEARCH",
    "organizationResponses.reviewedBy": "RESEARCH",
    "organizationResponses.representativeVerification.basis": "RESEARCH",
    "organizationResponses.representativeVerification.reviewedBy": "RESEARCH",
    responseSolicitations: "RESEARCH",
    researchNotes: "RESEARCH",
    recentRevisionPreview: "RESEARCH",
    "recentRevisionPreview.changedBy": "RESEARCH",
    recordedAt: "PUBLIC",
    schemaVersion: "RESEARCH",
    version: "RESEARCH",
    createdAt: "RESEARCH",
    updatedAt: "RESEARCH",
    createdBy: "RESEARCH",
    updatedBy: "ADMIN",
  },
  corrections: {
    _id: "RESEARCH",
    target: "RESEARCH",
    submissionKind: "RESEARCH",
    proposedChange: "ADMIN",
    reason: "RESEARCH",
    evidenceReferences: "ADMIN",
    submittedBy: "ADMIN",
    submittedAt: "RESEARCH",
    submissionIpHash: "ADMIN",
    idempotencyKey: "ADMIN",
    status: "RESEARCH",
    review: "RESEARCH",
    application: "RESEARCH",
    schemaVersion: "ADMIN",
    version: "ADMIN",
    createdAt: "ADMIN",
    updatedAt: "ADMIN",
    createdBy: "ADMIN",
    updatedBy: "ADMIN",
  },
  organizations: {
    _id: "PUBLIC",
    name: "PUBLIC",
    normalizedName: "PUBLIC",
    matchKey: "RESEARCH",
    localizedNames: "PUBLIC",
    kind: "PUBLIC",
    aliases: "PUBLIC",
    "aliases._id": "RESEARCH",
    "aliases.matchKey": "RESEARCH",
    "aliases.sourceSnapshotId": "RESEARCH",
    identifiers: "PUBLIC",
    "identifiers._id": "RESEARCH",
    "identifiers.sourceSnapshotIds": "RESEARCH",
    legalProfile: "PUBLIC",
    "legalProfile.registeredAddress": "ADMIN",
    website: "PUBLIC",
    operatingCountryCodes: "PUBLIC",
    identityProvenance: "RESEARCH",
    "identityProvenance.sourceSnapshotIds": "RESEARCH",
    "identityProvenance.verifiedBy": "RESEARCH",
    description: "PUBLIC",
    lifecycle: "PUBLIC",
    mergedIntoId: "RESEARCH",
    mergedAt: "RESEARCH",
    mergedBy: "ADMIN",
    mergeReason: "RESEARCH",
    schemaVersion: "RESEARCH",
    version: "RESEARCH",
    createdAt: "PUBLIC",
    updatedAt: "RESEARCH",
    createdBy: "RESEARCH",
    updatedBy: "ADMIN",
  },
  products: {
    _id: "PUBLIC",
    name: "PUBLIC",
    normalizedName: "PUBLIC",
    matchKey: "RESEARCH",
    localizedNames: "PUBLIC",
    description: "PUBLIC",
    identifiers: "PUBLIC",
    "identifiers._id": "RESEARCH",
    "identifiers.matchValue": "RESEARCH",
    "identifiers.sourceSnapshotIds": "RESEARCH",
    categoryCode: "PUBLIC",
    brandMapping: "PUBLIC",
    "brandMapping.candidateBrandId": "RESEARCH",
    "brandMapping.rationale": "RESEARCH",
    "brandMapping.reviewedBy": "RESEARCH",
    "brandMapping.evidenceSnapshotIds": "RESEARCH",
    identityProvenance: "RESEARCH",
    "identityProvenance.sourceSnapshotIds": "RESEARCH",
    "identityProvenance.verifiedBy": "RESEARCH",
    packaging: "PUBLIC",
    attributes: "PUBLIC",
    "attributes.sourceSnapshotId": "RESEARCH",
    brand: "PUBLIC",
    lifecycle: "PUBLIC",
    mergedIntoId: "RESEARCH",
    mergedAt: "RESEARCH",
    mergedBy: "ADMIN",
    mergeReason: "RESEARCH",
    schemaVersion: "RESEARCH",
    version: "RESEARCH",
    createdAt: "PUBLIC",
    updatedAt: "RESEARCH",
    createdBy: "RESEARCH",
    updatedBy: "ADMIN",
  },
  relationships: {
    _id: "PUBLIC",
    subject: "PUBLIC",
    predicate: "PUBLIC",
    predicateRegistryVersion: "RESEARCH",
    object: "PUBLIC",
    context: "PUBLIC",
    "context.notes": "RESEARCH",
    "context.ownership.notes": "RESEARCH",
    validity: "PUBLIC",
    sensitivity: "RESEARCH",
    recordLifecycle: "PUBLIC",
    review: "RESEARCH",
    assessment: "PUBLIC",
    "assessment.assessedBy": "RESEARCH",
    publication: "PUBLIC",
    "publication.decidedBy": "RESEARCH",
    "publication.decidedAt": "RESEARCH",
    publicationGate: "RESEARCH",
    publicWording: "PUBLIC",
    evidence: "PUBLIC",
    "evidence.sourceSnapshotId": "RESEARCH",
    "evidence.addedBy": "RESEARCH",
    "evidence.reviewedBy": "RESEARCH",
    organizationResponses: "PUBLIC",
    "organizationResponses.sourceSnapshotId": "RESEARCH",
    "organizationResponses.attachmentAssetIds": "RESEARCH",
    "organizationResponses.reviewedBy": "RESEARCH",
    "organizationResponses.representativeVerification.basis": "RESEARCH",
    "organizationResponses.representativeVerification.reviewedBy": "RESEARCH",
    responseSolicitations: "RESEARCH",
    researchNotes: "RESEARCH",
    recentRevisionPreview: "RESEARCH",
    "recentRevisionPreview.changedBy": "RESEARCH",
    canonicalKey: "RESEARCH",
    recordedAt: "PUBLIC",
    schemaVersion: "RESEARCH",
    version: "RESEARCH",
    createdAt: "RESEARCH",
    updatedAt: "RESEARCH",
    createdBy: "RESEARCH",
    updatedBy: "ADMIN",
  },
  source_snapshots: {
    _id: "PUBLIC",
    titleAtCapture: "PUBLIC",
    canonicalUrlAtCapture: "PUBLIC",
    publishedAt: "PUBLIC",
    retrievedAt: "PUBLIC",
    contentHash: "PUBLIC",
    hashAlgorithm: "PUBLIC",
    mimeType: "PUBLIC",
    byteSize: "PUBLIC",
    assetId: "RESEARCH",
    captureMethod: "RESEARCH",
    acquisitionTier: "RESEARCH",
    capturedBy: "RESEARCH",
    captureMetadata: "RESEARCH",
    supersedesSnapshotId: "RESEARCH",
    supersededBySnapshotId: "RESEARCH",
    redaction: "RESEARCH",
    source: "PUBLIC",
    lifecycle: "PUBLIC",
    schemaVersion: "PUBLIC",
    createdAt: "PUBLIC",
  },
  sources: {
    _id: "PUBLIC",
    title: "PUBLIC",
    canonicalUrl: "PUBLIC",
    sourceType: "PUBLIC",
    publisherName: "PUBLIC",
    publisherOrganizationId: "PUBLIC",
    publisherVerified: "PUBLIC",
    language: "PUBLIC",
    countryCode: "PUBLIC",
    jurisdiction: "PUBLIC",
    access: "PUBLIC",
    usageTerms: "PUBLIC",
    licenseCode: "PUBLIC",
    attributionRequired: "PUBLIC",
    lifecycle: "PUBLIC",
    lastCapturedAt: "RESEARCH",
    schemaVersion: "RESEARCH",
    version: "RESEARCH",
    createdAt: "PUBLIC",
    updatedAt: "RESEARCH",
    createdBy: "RESEARCH",
    updatedBy: "ADMIN",
    recentSnapshotsPreview: "RESEARCH",
  },
  users: {
    _id: "ADMIN",
    authProvider: "ADMIN",
    authSubject: "ADMIN",
    email: "ADMIN",
    emailNormalized: "ADMIN",
    phone: "ADMIN",
    displayName: "ADMIN",
    preferredLocale: "ADMIN",
    roles: "ADMIN",
    trustLevel: "ADMIN",
    accountStatus: "ADMIN",
    lastActiveAt: "ADMIN",
    schemaVersion: "ADMIN",
    version: "ADMIN",
    createdAt: "ADMIN",
    updatedAt: "ADMIN",
    createdBy: "ADMIN",
    updatedBy: "ADMIN",
  },
};

const EMBEDDED_COLLECTIONS: Partial<
  Record<CanonicalCollection, Record<string, CanonicalCollection>>
> = {
  products: { brand: "brands" },
  source_snapshots: { source: "sources" },
};

function levelAt(
  map: FieldMap,
  path: string,
): ProjectionLevel | undefined {
  let current = path;
  while (true) {
    const found = map[current];
    if (found !== undefined) return found;
    const dot = current.lastIndexOf(".");
    if (dot < 0) return undefined;
    current = current.slice(0, dot);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value) || value instanceof Date || value instanceof ObjectId) {
    return false;
  }
  return true;
}

function projectValue(
  value: unknown,
  collection: CanonicalCollection,
  path: string,
  level: ProjectionLevel,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => projectValue(item, collection, path, level));
  }
  if (!isPlainObject(value)) return value;

  const map = FIELD_CLASSIFICATION[collection];
  const embedded = EMBEDDED_COLLECTIONS[collection] ?? {};
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const childCollection = embedded[key];
    const fieldPath = path === "" ? key : `${path}.${key}`;
    const fieldLevel = levelAt(map, fieldPath);
    if (fieldLevel === undefined) {
      throw new UnclassifiedFieldError(collection, fieldPath);
    }
    if (PROJECTION_RANK[fieldLevel] > PROJECTION_RANK[level]) continue;
    output[key] = childCollection === undefined
      ? projectValue(item, collection, fieldPath, level)
      : projectValue(item, childCollection, "", level);
  }
  return output;
}

export function projectDocument<T>(
  collection: CanonicalCollection,
  doc: T,
  level: ProjectionLevel,
): T {
  return projectValue(doc, collection, "", level) as T;
}

export function projectionLevelForRoles(roles: readonly string[]): ProjectionLevel {
  if (roles.includes("ADMIN")) return "ADMIN";
  if (
    roles.some((role) =>
      ["RESEARCHER", "RESEARCH_REVIEWER", "LEGAL_REVIEWER", "MODERATOR"].includes(role)
    )
  ) {
    return "RESEARCH";
  }
  return "PUBLIC";
}

export function assertCompleteClassification(): void {
  for (const collection of CANONICAL_COLLECTIONS) {
    const map = FIELD_CLASSIFICATION[collection];
    if (map._id === undefined) {
      throw new UnclassifiedFieldError(collection, "_id");
    }
    for (const [path, level] of Object.entries(map)) {
      if (!PROJECTION_LEVELS.includes(level)) {
        throw new Error(`invalid projection level for ${collection}.${path}`);
      }
      if (/^(score|verdict|badge|rating|boycott)/i.test(path.split(".").at(-1) ?? "")) {
        throw new Error(`score-like projection field: ${collection}.${path}`);
      }
    }
  }
}
