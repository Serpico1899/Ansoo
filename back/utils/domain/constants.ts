// Shared v3.1 domain vocabulary.
//
// This is the single place where closed enums, endpoint allowlists, audit actions,
// caps, and registry mappings are declared. Every constant names the spec section
// it comes from. Do not fork these values in models, validators, or projections.
//
// Canonical contract: ../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md

import type { ObjectId } from "lesan";

// 4.1 - Closed entity registry (LOCKED)
export const ENTITY_TYPES = [
  "PRODUCT",
  "BRAND",
  "ORGANIZATION",
  "RELATIONSHIP",
  "CLAIM",
  "SOURCE",
  "SOURCE_SNAPSHOT",
  "ASSET",
  "CORRECTION",
  "USER",
] as const;
export type EntityType = typeof ENTITY_TYPES[number];

export type EntityRef<T extends EntityType = EntityType> = { type: T; id: ObjectId };

export const RELATIONSHIP_ENDPOINT_TYPES = ["PRODUCT", "BRAND", "ORGANIZATION"] as const;
export type RelationshipEndpointType = typeof RELATIONSHIP_ENDPOINT_TYPES[number];

export const CLAIM_ABOUT_TYPES = ["PRODUCT", "BRAND", "ORGANIZATION", "RELATIONSHIP"] as const;
export type ClaimAboutType = typeof CLAIM_ABOUT_TYPES[number];

export const CORRECTION_TARGET_TYPES = [
  "PRODUCT",
  "BRAND",
  "ORGANIZATION",
  "RELATIONSHIP",
  "CLAIM",
  "SOURCE",
  "SOURCE_SNAPSHOT",
] as const;
export type CorrectionTargetType = typeof CORRECTION_TARGET_TYPES[number];

// AuditTargetType is EntityType: all ten, including USER and ASSET (4.1).
export const AUDIT_TARGET_TYPES = ENTITY_TYPES;
export type AuditTargetType = EntityType;

// Server-controlled type -> collection mapping. Never accept a client model,
// collection, or Mongo path; resolve through this registry (4.1, 15.2).
export const ENTITY_COLLECTION = {
  PRODUCT: "products",
  BRAND: "brands",
  ORGANIZATION: "organizations",
  RELATIONSHIP: "relationships",
  CLAIM: "claims",
  SOURCE: "sources",
  SOURCE_SNAPSHOT: "source_snapshots",
  ASSET: "assets",
  CORRECTION: "corrections",
  USER: "users",
} as const satisfies Record<EntityType, string>;

// 6.2 - Five-predicate registry (LOCKED)
export const RELATIONSHIP_PREDICATES = [
  "OWNS",
  "CONTROLS",
  "MANUFACTURES",
  "DISTRIBUTES",
  "IMPORTS_TO_MARKET",
] as const;
export type RelationshipPredicate = typeof RELATIONSHIP_PREDICATES[number];

export const PREDICATE_REGISTRY_VERSION = 1;

export type PredicateRule = {
  subjectTypes: readonly RelationshipEndpointType[];
  objectTypes: readonly RelationshipEndpointType[];
  requiredContext: readonly string[];
  inverseLabel: string;
};

export const PREDICATE_MATRIX = {
  OWNS: {
    subjectTypes: ["ORGANIZATION"],
    objectTypes: ["ORGANIZATION", "BRAND"],
    requiredContext: [],
    inverseLabel: "owned by",
  },
  CONTROLS: {
    subjectTypes: ["ORGANIZATION"],
    objectTypes: ["ORGANIZATION", "BRAND"],
    requiredContext: ["ownership.basis"],
    inverseLabel: "controlled by",
  },
  MANUFACTURES: {
    subjectTypes: ["ORGANIZATION"],
    objectTypes: ["PRODUCT"],
    requiredContext: [],
    inverseLabel: "manufactured by",
  },
  DISTRIBUTES: {
    subjectTypes: ["ORGANIZATION"],
    objectTypes: ["PRODUCT", "BRAND"],
    requiredContext: ["marketCountryCode"],
    inverseLabel: "distributed by",
  },
  IMPORTS_TO_MARKET: {
    subjectTypes: ["ORGANIZATION"],
    objectTypes: ["PRODUCT"],
    requiredContext: ["marketCountryCode"],
    inverseLabel: "imported by",
  },
} as const satisfies Record<RelationshipPredicate, PredicateRule>;

// 7.2 - Three-type registry and structured-value discriminants (LOCKED)
export const CLAIM_TYPES = ["MARKET_PRESENCE", "PRODUCT_ORIGIN", "OFFICIAL_STATEMENT"] as const;
export type ClaimType = typeof CLAIM_TYPES[number];

export const CLAIM_TYPE_REGISTRY_VERSION = 1;

export const CLAIM_MARKET_CHANNELS = ["RETAIL", "ONLINE", "WHOLESALE", "UNKNOWN"] as const;
export type ClaimMarketChannel = typeof CLAIM_MARKET_CHANNELS[number];

export const CLAIM_OBSERVATION_BASES = [
  "OFFICIAL_LIST",
  "RETAILER_LISTING",
  "PACKAGE_LABEL",
  "REPORTED",
] as const;
export type ClaimObservationBasis = typeof CLAIM_OBSERVATION_BASES[number];

export const CLAIM_DECLARATION_SURFACES = [
  "PACKAGE",
  "OFFICIAL_REGISTRY",
  "COMPANY_STATEMENT",
] as const;
export type ClaimDeclarationSurface = typeof CLAIM_DECLARATION_SURFACES[number];

export const CLAIM_STATEMENT_CHANNELS = [
  "PRESS_RELEASE",
  "SOCIAL",
  "INTERVIEW",
  "FILING",
  "OTHER_DOCUMENTED",
] as const;
export type ClaimStatementChannel = typeof CLAIM_STATEMENT_CHANNELS[number];

export const CLAIM_STRUCTURED_VALUE_CONTRACT = {
  MARKET_PRESENCE: {
    required: ["marketCountryCode", "observationBasis"],
    optional: ["channel"],
  },
  PRODUCT_ORIGIN: {
    required: ["declaredOriginCountryCode", "declarationSurface"],
    optional: ["conflictsWithSnapshotId"],
  },
  OFFICIAL_STATEMENT: {
    required: ["speakingOrganizationId", "statementDatePrecision", "channel"],
    optional: ["statementDate"],
  },
} as const satisfies Record<
  ClaimType,
  { required: readonly string[]; optional: readonly string[] }
>;

// 4.2 - Time
export const DATE_PRECISIONS = ["EXACT", "MONTH", "YEAR", "APPROXIMATE", "UNKNOWN"] as const;
export type DatePrecision = typeof DATE_PRECISIONS[number];

// 4.4 / 4.6 - Identity lifecycle
export const SENSITIVITY_LEVELS = ["ROUTINE", "SENSITIVE", "HIGH_RISK"] as const;
export type Sensitivity = typeof SENSITIVITY_LEVELS[number];

export const RECORD_LIFECYCLE = ["ACTIVE", "INACTIVE", "ARCHIVED", "MERGED"] as const;
export type RecordLifecycle = typeof RECORD_LIFECYCLE[number];

// Relationship and Claim records only use the finding subset (6.1, 7.1).
export const FINDING_RECORD_LIFECYCLE = ["ACTIVE", "ARCHIVED"] as const;
export type FindingRecordLifecycle = typeof FINDING_RECORD_LIFECYCLE[number];

export const MERGE_MAX_DEPTH = 5;

// 10.1 - EvidenceLink stance. Stance belongs to the link, not the Source.
export const EVIDENCE_STANCES = ["SUPPORTS", "CONTRADICTS", "CONTEXTUALIZES", "NEUTRAL"] as const;
export type EvidenceStance = typeof EVIDENCE_STANCES[number];

// 10.2 - ReviewWorkflow
export const REVIEW_WORKFLOW_STATUSES = [
  "NOT_QUEUED",
  "QUEUED",
  "IN_REVIEW",
  "NEEDS_INFORMATION",
  "READY_FOR_DECISION",
  "CLOSED",
] as const;
export type ReviewWorkflowStatus = typeof REVIEW_WORKFLOW_STATUSES[number];

export const REVIEW_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type ReviewPriority = typeof REVIEW_PRIORITIES[number];

// 10.3 - EvidenceAssessment
export const EVIDENCE_ASSESSMENT_OUTCOMES = [
  "NOT_ASSESSED",
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "NOT_SUPPORTED",
  "DISPUTED",
  "INCONCLUSIVE",
] as const;
export type EvidenceAssessmentOutcome = typeof EVIDENCE_ASSESSMENT_OUTCOMES[number];

export const LIMITATION_CODES = [
  "SELF_REPORTED",
  "SINGLE_SOURCE",
  "OUTDATED",
  "TRANSLATED",
  "PAYWALLED",
  "UNVERIFIED_PUBLISHER",
  "PARTIAL_SCOPE",
  "INDIRECT_INFERENCE",
  "SECONDARY_REPORTING",
] as const;
export type LimitationCode = typeof LIMITATION_CODES[number];

// 10.4 - PublicationState. v3.1 has no cross-product access-scope field.
export const PUBLICATION_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "PUBLISHED",
  "WITHHELD",
  "RETRACTED",
] as const;
export type PublicationStatus = typeof PUBLICATION_STATUSES[number];

// 10.5 - PublicationGate
export const PUBLICATION_GATE_VERSION = "1";
export const PUBLICATION_GATE_RESULTS = ["PASS", "FAIL"] as const;
export type PublicationGateResult = typeof PUBLICATION_GATE_RESULTS[number];

export const PUBLICATION_GATE_CHECKS = [
  "evidenceCountOk",
  "independentSourcesOk",
  "assessmentOk",
  "fourEyesOk",
  "legalSignOffOk",
  "rightOfReplyOk",
  "publicWordingOk",
  "sourceAccessOk",
  "noScoreOk",
] as const;
export type PublicationGateCheck = typeof PUBLICATION_GATE_CHECKS[number];

export const WAIVABLE_GATE_CHECKS = ["rightOfReplyOk", "independentSourcesOk"] as const;
export const NON_WAIVABLE_GATE_CHECKS = ["fourEyesOk", "legalSignOffOk"] as const;

// 10.7 - ResponseSolicitation
export const SOLICITATION_CHANNELS = [
  "OFFICIAL_EMAIL",
  "OFFICIAL_FORM",
  "REGISTERED_MAIL",
  "PUBLIC_CONTACT",
  "OTHER",
] as const;
export type SolicitationChannel = typeof SOLICITATION_CHANNELS[number];

export const SOLICITATION_OUTCOMES = [
  "PENDING",
  "RESPONDED",
  "NO_RESPONSE",
  "DECLINED",
  "UNDELIVERABLE",
] as const;
export type SolicitationOutcome = typeof SOLICITATION_OUTCOMES[number];

export const DEFAULT_RESPONSE_DEADLINE_DAYS = 14;

// 10.8 - OrganizationResponse
export const ORG_RESPONSE_RECEIVED_VIA = [
  "OFFICIAL_EMAIL",
  "OFFICIAL_FORM",
  "PUBLIC_STATEMENT",
  "OTHER",
] as const;
export type OrgResponseReceivedVia = typeof ORG_RESPONSE_RECEIVED_VIA[number];

export const REPRESENTATIVE_VERIFICATION_STATUSES = ["UNVERIFIED", "VERIFIED", "DISPUTED"] as const;
export type RepresentativeVerificationStatus = typeof REPRESENTATIVE_VERIFICATION_STATUSES[number];

export const ORG_RESPONSE_PUBLICATION_STATUSES = [
  "INTERNAL",
  "PUBLIC_PENDING",
  "PUBLIC",
  "REDACTED",
] as const;
export type OrgResponsePublicationStatus = typeof ORG_RESPONSE_PUBLICATION_STATUSES[number];

// 10.9 - ResearchNote
export const RESEARCH_NOTE_VISIBILITIES = [
  "INTERNAL_RESEARCH",
  "LEGAL_REVIEW",
  "ADMIN_ONLY",
] as const;
export type ResearchNoteVisibility = typeof RESEARCH_NOTE_VISIBILITIES[number];

// 5.1 - Product identity
export const PRODUCT_IDENTIFIER_SCHEMES = [
  "GTIN",
  "IR_PRODUCT_ID",
  "IR_TRACKING_ID",
  "TAX_PRODUCT_SERVICE_ID",
  "HS_CODE",
  "IRC",
  "TTAC_UID",
  "SKU",
] as const;
export type ProductIdentifierScheme = typeof PRODUCT_IDENTIFIER_SCHEMES[number];

export const PRODUCT_ATTRIBUTE_KEYS = [
  "DECLARED_ORIGIN",
  "INGREDIENTS_TEXT",
  "MANUFACTURER_ON_PACKAGE",
  "IMPORTER_ON_PACKAGE",
  "NET_CONTENT_TEXT",
] as const;
export type ProductAttributeKey = typeof PRODUCT_ATTRIBUTE_KEYS[number];

export const BRAND_MAPPING_STATUSES = [
  "UNREVIEWED",
  "CANDIDATE",
  "VERIFIED",
  "DISPUTED",
  "REJECTED",
] as const;
export type BrandMappingStatus = typeof BRAND_MAPPING_STATUSES[number];

// 5.3 - Organization identity
export const ORGANIZATION_IDENTIFIER_SCHEMES = [
  "NATIONAL_ID",
  "REGISTRATION_NUMBER",
  "LEI",
  "TAX_ID",
] as const;
export type OrganizationIdentifierScheme = typeof ORGANIZATION_IDENTIFIER_SCHEMES[number];

export const ORGANIZATION_KINDS = [
  "CORPORATE_GROUP",
  "LEGAL_ENTITY",
  "GOVERNMENT_BODY",
  "PUBLIC_INSTITUTION",
  "NON_PROFIT",
  "RETAILER",
  "OTHER",
] as const;
export type OrganizationKind = typeof ORGANIZATION_KINDS[number];

export const IDENTIFIER_STATUSES = ["UNVERIFIED", "VERIFIED", "DISPUTED", "RETIRED"] as const;
export type IdentifierStatus = typeof IDENTIFIER_STATUSES[number];

export const OWNERSHIP_BASES = ["DIRECT", "INDIRECT", "VOTING_RIGHTS", "OTHER_DOCUMENTED"] as const;
export type OwnershipBasis = typeof OWNERSHIP_BASES[number];

// 8.1 - Sources
export const SOURCE_TYPES = [
  "OFFICIAL_REGISTRY",
  "GOVERNMENT_DOCUMENT",
  "LEGAL_INSTRUMENT",
  "COMPANY_DOCUMENT",
  "RESEARCH_REPORT",
  "NEWS",
  "ACADEMIC",
  "DATASET",
  "OTHER",
] as const;
export type SourceType = typeof SOURCE_TYPES[number];

export const SOURCE_ACCESS = ["PUBLIC", "RESTRICTED", "INTERNAL"] as const;
export type SourceAccess = typeof SOURCE_ACCESS[number];

export const SOURCE_LIFECYCLE = ["ACTIVE", "UNAVAILABLE", "ARCHIVED"] as const;
export type SourceLifecycle = typeof SOURCE_LIFECYCLE[number];

// 8.2 - Immutable source snapshots
export const ACQUISITION_TIERS = [
  "A_OFFICIAL_MACHINE_READABLE",
  "B_OFFICIAL_PUBLIC_LOOKUP",
  "C_OFFICIAL_AUTHENTICATED_ACCESS",
  "D_FORMAL_INFORMATION_REQUEST",
  "E_RESEARCH_OR_COMMUNITY",
] as const;
export type AcquisitionTier = typeof ACQUISITION_TIERS[number];

export const CAPTURE_METHODS = ["MANUAL", "CRAWLER", "API", "UPLOAD"] as const;
export type CaptureMethod = typeof CAPTURE_METHODS[number];

export const HASH_ALGORITHMS = ["SHA256"] as const;
export type HashAlgorithm = typeof HASH_ALGORITHMS[number];

export const SNAPSHOT_LIFECYCLE = ["AVAILABLE", "UNAVAILABLE", "ARCHIVED"] as const;
export type SnapshotLifecycle = typeof SNAPSHOT_LIFECYCLE[number];

export const REDACTION_METHODS = ["PIXEL", "TEXT_REMOVAL", "PAGE_REMOVAL"] as const;
export type RedactionMethod = typeof REDACTION_METHODS[number];

// 8.3 - Assets
export const ASSET_STORAGE_PROVIDERS = ["S3_COMPATIBLE", "LOCAL_DEV"] as const;
export type AssetStorageProvider = typeof ASSET_STORAGE_PROVIDERS[number];

export const ASSET_PROCESSING_STATUSES = ["QUARANTINED", "SCANNING", "READY", "REJECTED"] as const;
export type AssetProcessingStatus = typeof ASSET_PROCESSING_STATUSES[number];

export const ASSET_VISIBILITY = ["PRIVATE", "RESEARCH_ONLY", "PUBLIC_APPROVED"] as const;
export type AssetVisibility = typeof ASSET_VISIBILITY[number];

export const ASSET_LIFECYCLE = ["ACTIVE", "ARCHIVED", "DELETED_PENDING_PURGE"] as const;
export type AssetLifecycle = typeof ASSET_LIFECYCLE[number];

export const MALWARE_SCAN_RESULTS = ["CLEAN", "INFECTED", "ERROR"] as const;
export type MalwareScanResult = typeof MALWARE_SCAN_RESULTS[number];

// 9.1 - Corrections
export const CORRECTION_SUBMISSION_KINDS = [
  "CORRECT_EXISTING",
  "ADD_MISSING",
  "RETRACT",
  "REPORT_ISSUE",
] as const;
export type CorrectionSubmissionKind = typeof CORRECTION_SUBMISSION_KINDS[number];

export const CORRECTION_STATUSES = [
  "PENDING",
  "IN_REVIEW",
  "NEEDS_INFORMATION",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type CorrectionStatus = typeof CORRECTION_STATUSES[number];

export const CORRECTION_OPERATIONS = [
  "SET",
  "UNSET",
  "ADD_RELATIONSHIP",
  "END_RELATIONSHIP",
] as const;
export type CorrectionOperation = typeof CORRECTION_OPERATIONS[number];

export const CORRECTION_APPLICATION_RESULTS = [
  "APPLIED",
  "FAILED",
  "NOT_APPLICABLE",
] as const;
export type CorrectionApplicationResult = typeof CORRECTION_APPLICATION_RESULTS[number];

// 9.2 - Users. RESEARCH_REVIEWER is required to enforce I05/I07.
export const USER_ROLES = [
  "CONTRIBUTOR",
  "RESEARCHER",
  "RESEARCH_REVIEWER",
  "LEGAL_REVIEWER",
  "MODERATOR",
  "ADMIN",
] as const;
export type UserRole = typeof USER_ROLES[number];

export const TRUST_LEVELS = ["NEW", "REGULAR", "TRUSTED"] as const;
export type TrustLevel = typeof TRUST_LEVELS[number];

export const ACCOUNT_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"] as const;
export type AccountStatus = typeof ACCOUNT_STATUSES[number];

// 9.3 - Audit actions (LOCKED enumerated allowlist; unknown actions are denied)
export const AUDIT_ACTIONS = [
  // identity
  "ENTITY_CREATED",
  "ENTITY_UPDATED",
  "ENTITY_ARCHIVED",
  "ENTITY_MERGED",
  "ENTITY_UNMERGED",
  "IDENTIFIER_ADDED",
  "IDENTIFIER_STATUS_CHANGED",
  "BRAND_MAPPING_REVIEWED",
  "BRAND_RELATION_CHANGED",
  // findings
  "RELATIONSHIP_CREATED",
  "RELATIONSHIP_CLOSED",
  "CLAIM_CREATED",
  "REVIEW_STATUS_CHANGED",
  "ASSESSMENT_RECORDED",
  "PUBLICATION_GATE_EVALUATED",
  "PUBLICATION_CHANGED",
  "PUBLIC_WORDING_CHANGED",
  "FINDING_RETRACTED",
  "GATE_WAIVER_GRANTED",
  // evidence & responses
  "EVIDENCE_ADDED",
  "EVIDENCE_REMOVED",
  "EVIDENCE_REVIEWED",
  "SOURCE_CREATED",
  "SNAPSHOT_CREATED",
  "SNAPSHOT_SUPERSEDED",
  "SNAPSHOT_REDACTED",
  "SOLICITATION_SENT",
  "SOLICITATION_OUTCOME_RECORDED",
  "ORG_RESPONSE_ADDED",
  "ORG_RESPONSE_PUBLICATION_CHANGED",
  // assets
  "ASSET_UPLOADED",
  "ASSET_SCAN_COMPLETED",
  "ASSET_PURGED",
  // governance
  "CORRECTION_SUBMITTED",
  "CORRECTION_REVIEWED",
  "CORRECTION_APPLIED",
  "USER_ROLES_CHANGED",
  "USER_TRUST_CHANGED",
  "USER_STATUS_CHANGED",
  "USER_PII_PURGED",
] as const;
export type AuditAction = typeof AUDIT_ACTIONS[number];

// Values that must never appear in an AuditEvent before/after summary (9.3).
export const AUDIT_SUMMARY_FORBIDDEN_KEYS = [
  "email",
  "phone",
  "authSubject",
  "passwordHash",
  "registeredAddress",
  "researchNotes",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "objectKey",
] as const;

export const AUDIT_ACTOR_TYPES = ["USER", "SYSTEM", "SERVICE"] as const;
export type AuditActorType = typeof AUDIT_ACTOR_TYPES[number];

// 4.5 - Hard caps (LOCKED - enforced in validators, never silently sliced)
export const HARD_CAPS = {
  identifiers: 20,
  aliases: 50,
  localizedNames: 10,
  attributes: 40,
  evidence: 50,
  organizationResponses: 20,
  responseSolicitations: 10,
  researchNotes: 100,
  recentRevisionPreview: 20,
  relatedEntities: 10,
  evidenceReferences: 10,
} as const;
export type HardCapKey = keyof typeof HARD_CAPS;

export const CHARACTER_CAPS = {
  excerpt: 2_000,
  statement: 2_000,
  publicWording: 2_000,
  rationale: 2_000,
  responseText: 10_000,
  noteBody: 4_000,
} as const;
export type CharacterCapKey = keyof typeof CHARACTER_CAPS;

export const CAPTURE_METADATA_MAX_KEYS = 20;
export const CAPTURE_METADATA_MAX_DEPTH = 2;

// 4.5 / 8.2 - captureMetadata is a bounded, allowlisted diagnostic record.
// Unknown fetcher/processor keys are rejected instead of silently stored.
export const CAPTURE_METADATA_ALLOWED_KEYS = [
  "httpStatus",
  "requestedUrl",
  "finalUrl",
  "contentType",
  "contentLength",
  "encoding",
  "filename",
  "pageCount",
  "userAgent",
  "redirectCount",
  "fetchedAt",
  "etag",
  "lastModified",
  "language",
  "title",
  "author",
  "publishedAt",
  "archiveUrl",
  "warcRecordId",
  "warcDigest",
] as const;
export type CaptureMetadataKey = typeof CAPTURE_METADATA_ALLOWED_KEYS[number];

export const CAP_EXCEEDED_STATUS = 422 as const;
export const CAP_EXCEEDED_CODE = "CAP_EXCEEDED" as const;
export const CONFLICT_STATUS = 409 as const;
export const FORBIDDEN_STATUS = 403 as const;
export const USE_RELATIONSHIP_INSTEAD_CODE = "USE_RELATIONSHIP_INSTEAD" as const;

export type CapViolation = {
  status: typeof CAP_EXCEEDED_STATUS;
  code: typeof CAP_EXCEEDED_CODE;
  path: HardCapKey;
  cap: number;
  actual: number;
};

export function exceedsHardCap(path: HardCapKey, actual: number): boolean {
  return actual > HARD_CAPS[path];
}

export function hardCapViolation(path: HardCapKey, actual: number): CapViolation | null {
  return exceedsHardCap(path, actual)
    ? {
      status: CAP_EXCEEDED_STATUS,
      code: CAP_EXCEEDED_CODE,
      path,
      cap: HARD_CAPS[path],
      actual,
    }
    : null;
}

// 12 - Security, abuse, and public-profile limits referenced by plans 06-09.
export const SECURITY_LIMITS = {
  uploadMaxBytes: 20 * 1024 * 1024,
  uploadsPerDay: 5,
  correctionsPerUserPerDay: 10,
  correctionsPerIpPerDay: 30,
  fetcherMaxRedirects: 3,
  fetcherTimeoutMs: 10_000,
  fetcherMaxBytes: 10 * 1024 * 1024,
  publicProfileMaxHops: 2,
  retractionP95Seconds: 60,
} as const;

export function isOneOf<T extends readonly string[]>(
  values: T,
  candidate: string,
): candidate is T[number] {
  return (values as readonly string[]).includes(candidate);
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
