// Claim domain services. Spec 7, 7.3. Exactly three claim types; edge-shaped
// propositions are redirected to a Relationship instead of being stored.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { validateClaim } from "../../models/claim.ts";
import { assertCharacterCap } from "../domain/caps.ts";
import {
  CLAIM_ABOUT_TYPES,
  CLAIM_DECLARATION_SURFACES,
  CLAIM_MARKET_CHANNELS,
  CLAIM_OBSERVATION_BASES,
  CLAIM_STATEMENT_CHANNELS,
  CLAIM_STRUCTURED_VALUE_CONTRACT,
  CLAIM_TYPE_REGISTRY_VERSION,
  CLAIM_TYPES,
  type ClaimType,
  DATE_PRECISIONS,
  FINDING_RECORD_LIFECYCLE,
  PUBLICATION_STATUSES,
  RELATIONSHIP_ENDPOINT_TYPES,
  RELATIONSHIP_PREDICATES,
  type Sensitivity,
} from "../domain/constants.ts";
import { createEntityRegistry } from "../identity/registry.ts";
import {
  addRevisionPreview,
  appendAudit,
  assertCap,
  assertNoUnknownKeys,
  getFinding,
  requireRoles,
  requireString,
  type ResearchActor,
  ResearchError,
} from "./common.ts";
import { classifyClaimSensitivity, resolveSensitivity } from "./sensitivity.ts";

export type EntityEndpointInput = { type: string; id: ObjectId | string };

type ClaimInput = {
  db: Db;
  about: EntityEndpointInput;
  relatedEntities?: EntityEndpointInput[];
  claimType: string;
  statement: string;
  publicWording?: string;
  localizedStatements?: Array<{ locale: string; value: string }>;
  structuredValue: Record<string, unknown>;
  scope?: Record<string, unknown>;
  sensitivity?: Sensitivity;
  actor: ResearchActor;
  now?: Date;
};

const CLAIM_KEYS = [
  "db",
  "about",
  "relatedEntities",
  "claimType",
  "statement",
  "publicWording",
  "localizedStatements",
  "structuredValue",
  "scope",
  "sensitivity",
  "actor",
  "now",
] as const;
const SCOPE_KEYS = [
  "marketCountryCode",
  "jurisdiction",
  "validFrom",
  "validTo",
  "datePrecision",
] as const;
const UPDATE_KEYS = [
  "statement",
  "publicWording",
  "localizedStatements",
  "structuredValue",
  "scope",
  "relatedEntities",
  "sensitivity",
] as const;

const CLAIM_TYPE_KEYS: Record<ClaimType, readonly string[]> = {
  MARKET_PRESENCE: ["claimType", "marketCountryCode", "channel", "observationBasis"],
  PRODUCT_ORIGIN: [
    "claimType",
    "declaredOriginCountryCode",
    "declarationSurface",
    "conflictsWithSnapshotId",
  ],
  OFFICIAL_STATEMENT: [
    "claimType",
    "speakingOrganizationId",
    "statementDate",
    "statementDatePrecision",
    "channel",
  ],
};

function parseId(value: unknown): ObjectId {
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)) return new ObjectId(value);
  throw new ResearchError("INVALID_REFERENCE", "reference id is invalid");
}

function endpoint(
  value: unknown,
  path: string,
  allowed: readonly string[],
): { type: string; id: ObjectId } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ResearchError("INVALID_REFERENCE", `${path} must be an object`);
  }
  const ref = value as Record<string, unknown>;
  assertNoUnknownKeys(ref, ["type", "id"], "INVALID_REFERENCE", path);
  if (typeof ref.type !== "string" || !allowed.includes(ref.type)) {
    throw new ResearchError("INVALID_REFERENCE", `${path}.type is not allowed`);
  }
  return { type: ref.type, id: parseId(ref.id) };
}

function parseDate(value: unknown, path: string): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  throw new ResearchError("INVALID_CLAIM_SCOPE", `${path} must be a date or null`);
}

function validateScope(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  assertNoUnknownKeys(value, SCOPE_KEYS, "INVALID_CLAIM_SCOPE", "scope");
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ResearchError("INVALID_CLAIM_SCOPE", "scope must be an object");
  }
  const input = value as Record<string, unknown>;
  if (input.marketCountryCode !== undefined && typeof input.marketCountryCode !== "string") {
    throw new ResearchError("INVALID_CLAIM_SCOPE", "scope.marketCountryCode must be a string");
  }
  if (input.jurisdiction !== undefined && typeof input.jurisdiction !== "string") {
    throw new ResearchError("INVALID_CLAIM_SCOPE", "scope.jurisdiction must be a string");
  }
  if (
    input.datePrecision !== undefined &&
    (typeof input.datePrecision !== "string" ||
      !(DATE_PRECISIONS as readonly string[]).includes(input.datePrecision))
  ) {
    throw new ResearchError("INVALID_CLAIM_SCOPE", "scope.datePrecision is invalid");
  }
  return {
    ...(input.marketCountryCode === undefined
      ? {}
      : { marketCountryCode: input.marketCountryCode }),
    ...(input.jurisdiction === undefined ? {} : { jurisdiction: input.jurisdiction }),
    ...(input.validFrom === undefined
      ? {}
      : { validFrom: parseDate(input.validFrom, "scope.validFrom") }),
    ...(input.validTo === undefined ? {} : { validTo: parseDate(input.validTo, "scope.validTo") }),
    ...(input.datePrecision === undefined ? {} : { datePrecision: input.datePrecision }),
  };
}

function relationshipShape(input: Record<string, unknown>): Record<string, unknown> | null {
  const claimType = input.claimType;
  const structured = input.structuredValue;
  const structuredType = structured && typeof structured === "object"
    ? (structured as Record<string, unknown>).claimType
    : undefined;
  const named = [claimType, structuredType].find(
    (value) =>
      typeof value === "string" && (
        (RELATIONSHIP_PREDICATES as readonly string[]).includes(value) ||
        value === "OWNERSHIP" || value === "SUBSIDIARY_OF"
      ),
  );
  const shape = structured && typeof structured === "object"
    ? structured as Record<string, unknown>
    : undefined;
  const hasEdgeFields = Boolean(
    shape && ("subject" in shape || "object" in shape || "predicate" in shape),
  );
  if (!named && !hasEdgeFields) return null;
  const subject = (shape?.subject ?? input.about) as Record<string, unknown> | undefined;
  const predicate = (shape?.predicate ?? named ?? "OWNS") as string;
  const object = shape?.object as Record<string, unknown> | undefined;
  return {
    subject,
    predicate,
    object,
    ...(shape?.context ? { context: shape.context } : {}),
  };
}

function assertStructuredValue(
  claimType: ClaimType,
  value: unknown,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ResearchError("INVALID_CLAIM_STRUCTURED_VALUE", "structuredValue must be an object");
  }
  const structured = value as Record<string, unknown>;
  if (structured.claimType !== claimType) {
    throw new ResearchError(
      "CLAIM_TYPE_MISMATCH",
      "structuredValue.claimType must equal claimType",
    );
  }
  assertNoUnknownKeys(
    structured,
    CLAIM_TYPE_KEYS[claimType],
    "UNKNOWN_CLAIM_STRUCTURED_FIELD",
    "structuredValue",
  );
  const contract = CLAIM_STRUCTURED_VALUE_CONTRACT[claimType];
  for (const required of contract.required) {
    if (structured[required] === undefined) {
      throw new ResearchError(
        "MISSING_CLAIM_STRUCTURED_FIELD",
        `${claimType} requires structuredValue.${required}`,
      );
    }
  }
  if (
    claimType === "MARKET_PRESENCE" &&
    structured.observationBasis !== undefined &&
    !(CLAIM_OBSERVATION_BASES as readonly string[]).includes(String(structured.observationBasis))
  ) {
    throw new ResearchError("INVALID_CLAIM_STRUCTURED_VALUE", "observationBasis is invalid");
  }
  if (
    claimType === "MARKET_PRESENCE" &&
    structured.channel !== undefined &&
    !(CLAIM_MARKET_CHANNELS as readonly string[]).includes(String(structured.channel))
  ) {
    throw new ResearchError("INVALID_CLAIM_STRUCTURED_VALUE", "channel is invalid");
  }
  if (
    claimType === "PRODUCT_ORIGIN" &&
    structured.declarationSurface !== undefined &&
    !(CLAIM_DECLARATION_SURFACES as readonly string[]).includes(
      String(structured.declarationSurface),
    )
  ) {
    throw new ResearchError("INVALID_CLAIM_STRUCTURED_VALUE", "declarationSurface is invalid");
  }
  if (
    claimType === "OFFICIAL_STATEMENT" &&
    structured.channel !== undefined &&
    !(CLAIM_STATEMENT_CHANNELS as readonly string[]).includes(String(structured.channel))
  ) {
    throw new ResearchError("INVALID_CLAIM_STRUCTURED_VALUE", "channel is invalid");
  }
  if (
    claimType === "OFFICIAL_STATEMENT" &&
    structured.statementDatePrecision !== undefined &&
    !(DATE_PRECISIONS as readonly string[]).includes(String(structured.statementDatePrecision))
  ) {
    throw new ResearchError("INVALID_CLAIM_STRUCTURED_VALUE", "statementDatePrecision is invalid");
  }
  return structured;
}

function domainError(error: unknown): never {
  const candidate = error as { code?: string; status?: number; message?: string };
  if (candidate.code) {
    throw new ResearchError(
      candidate.code,
      candidate.message ?? candidate.code,
      candidate.status ?? 422,
    );
  }
  throw error;
}

async function resolveRelated(
  db: Db,
  related: unknown,
): Promise<Array<{ type: string; id: ObjectId }>> {
  if (related === undefined) return [];
  if (!Array.isArray(related)) {
    throw new ResearchError("INVALID_REFERENCE", "relatedEntities must be an array");
  }
  assertCap("relatedEntities", related.length);
  const refs = related.map((item, index) =>
    endpoint(item, `relatedEntities[${index}]`, RELATIONSHIP_ENDPOINT_TYPES)
  );
  const registry = createEntityRegistry(db);
  const resolved = [];
  for (let index = 0; index < refs.length; index++) {
    const item = await registry.resolve("claim.relatedEntities", refs[index]);
    resolved.push(item.ref);
  }
  return resolved;
}

async function resolveStructured(
  db: Db,
  claimType: ClaimType,
  structured: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const registry = createEntityRegistry(db);
  if (claimType === "OFFICIAL_STATEMENT") {
    const resolved = await registry.resolve("organizationResponse.respondingOrganizationId", {
      type: "ORGANIZATION",
      id: structured.speakingOrganizationId,
    });
    return { ...structured, speakingOrganizationId: resolved.doc._id };
  }
  if (claimType === "PRODUCT_ORIGIN" && structured.conflictsWithSnapshotId !== undefined) {
    const resolved = await registry.resolve("evidence.sourceSnapshotId", {
      type: "SOURCE_SNAPSHOT",
      id: structured.conflictsWithSnapshotId,
    });
    return { ...structured, conflictsWithSnapshotId: resolved.doc._id };
  }
  return structured;
}

export async function addClaim(input: ClaimInput): Promise<{
  id: ObjectId;
  version: number;
  auditId: ObjectId;
}> {
  assertNoUnknownKeys(input, CLAIM_KEYS, "UNKNOWN_CLAIM_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, [
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ], "actor may not create claims");
  const reasonShape = relationshipShape(input as unknown as Record<string, unknown>);
  if (reasonShape) {
    throw new ResearchError(
      "USE_RELATIONSHIP_INSTEAD",
      "this proposition is a typed relationship edge; create a Relationship instead",
      409,
      { suggestedPayload: reasonShape },
    );
  }
  if (!(CLAIM_TYPES as readonly string[]).includes(input.claimType)) {
    throw new ResearchError(
      "UNKNOWN_CLAIM_TYPE",
      `claimType ${input.claimType} is not in the registry`,
    );
  }
  const claimType = input.claimType as ClaimType;
  const about = endpoint(input.about, "about", CLAIM_ABOUT_TYPES);
  const registry = createEntityRegistry(input.db);
  const resolvedAbout = await registry.resolve("claim.about", about);
  const related = await resolveRelated(input.db, input.relatedEntities);
  const structured = await resolveStructured(
    input.db,
    claimType,
    assertStructuredValue(claimType, input.structuredValue),
  );
  const statement = requireString(input.statement, "INVALID_CLAIM", "statement is required");
  assertCharacterCap("statement", statement);
  if (input.publicWording !== undefined) {
    assertCharacterCap("publicWording", input.publicWording);
  }
  if (input.localizedStatements !== undefined) {
    assertCap("localizedNames", input.localizedStatements.length);
  }
  const scope = validateScope(input.scope);
  let sensitivity: Sensitivity;
  try {
    sensitivity = resolveSensitivity(classifyClaimSensitivity(claimType), input.sensitivity);
  } catch (error) {
    throw new ResearchError((error as Error).message, "sensitivity cannot be lowered");
  }

  const _id = new ObjectId();
  const doc = {
    _id,
    about: resolvedAbout.ref,
    ...(related.length ? { relatedEntities: related } : {}),
    claimType,
    claimTypeRegistryVersion: CLAIM_TYPE_REGISTRY_VERSION,
    statement,
    ...(input.publicWording === undefined ? {} : { publicWording: input.publicWording }),
    ...(input.localizedStatements?.length
      ? { localizedStatements: input.localizedStatements }
      : {}),
    structuredValue: structured,
    ...(scope && Object.keys(scope).length ? { scope } : {}),
    sensitivity,
    recordLifecycle: FINDING_RECORD_LIFECYCLE[0],
    review: { status: "NOT_QUEUED", priority: "NORMAL" },
    assessment: { outcome: "NOT_ASSESSED", methodologyVersion: "1", limitations: [] },
    publication: { status: PUBLICATION_STATUSES[0] },
    evidence: [],
    organizationResponses: [],
    responseSolicitations: [],
    researchNotes: [],
    recentRevisionPreview: [],
    recordedAt: now,
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(input.actor.id ? { createdBy: input.actor.id, updatedBy: input.actor.id } : {}),
  };
  try {
    validateClaim(doc);
  } catch (error) {
    domainError(error);
  }
  await input.db.collection("claims").insertOne(doc);
  const auditId = await appendAudit(input.db, {
    action: "CLAIM_CREATED",
    target: { type: "CLAIM", id: _id },
    actor: input.actor,
    targetVersionBefore: 0,
    targetVersionAfter: 1,
    beforeSummary: {},
    afterSummary: { claimType, sensitivity, aboutType: resolvedAbout.ref.type },
    changedPaths: ["about", "claimType", "statement", "structuredValue", "sensitivity"],
    now,
  });
  return { id: _id, version: 1, auditId };
}

export async function updateClaim(input: {
  db: Db;
  id: ObjectId;
  expectedVersion: number;
  patch: Record<string, unknown>;
  reason: string;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ id: ObjectId; version: number; auditIds: ObjectId[] }> {
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, [
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ], "actor may not update claims");
  for (const key of Object.keys(input.patch)) {
    if (!(UPDATE_KEYS as readonly string[]).includes(key)) {
      throw new ResearchError("FORBIDDEN_CLAIM_FIELD", `${key} is not a pure claim field`);
    }
  }
  if (Object.keys(input.patch).length === 0) {
    throw new ResearchError("EMPTY_PATCH", "update patch is empty");
  }
  const reason = requireString(input.reason, "REASON_REQUIRED", "update requires a reason");
  const doc = await getFinding(input.db, { type: "CLAIM", id: input.id });
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "claim version did not match", 409);
  }
  const claimType = doc.claimType as ClaimType;
  const next: Record<string, unknown> = {};

  if (input.patch.statement !== undefined) {
    next.statement = requireString(input.patch.statement, "INVALID_CLAIM", "statement is required");
    assertCharacterCap("statement", next.statement as string);
  }
  if (input.patch.publicWording !== undefined) {
    if (typeof input.patch.publicWording !== "string") {
      throw new ResearchError("INVALID_PUBLIC_WORDING", "publicWording must be a string");
    }
    assertCharacterCap("publicWording", input.patch.publicWording);
    next.publicWording = input.patch.publicWording;
  }
  if (input.patch.localizedStatements !== undefined) {
    if (!Array.isArray(input.patch.localizedStatements)) {
      throw new ResearchError("INVALID_CLAIM", "localizedStatements must be an array");
    }
    assertCap("localizedNames", input.patch.localizedStatements.length);
    next.localizedStatements = input.patch.localizedStatements;
  }
  if (input.patch.scope !== undefined) {
    next.scope = validateScope(input.patch.scope);
  }
  if (input.patch.relatedEntities !== undefined) {
    next.relatedEntities = await resolveRelated(input.db, input.patch.relatedEntities);
  }
  if (input.patch.structuredValue !== undefined) {
    const shape = relationshipShape({
      ...doc,
      structuredValue: input.patch.structuredValue,
    });
    if (shape) {
      throw new ResearchError(
        "USE_RELATIONSHIP_INSTEAD",
        "this proposition is a typed relationship edge; create a Relationship instead",
        409,
        { suggestedPayload: shape },
      );
    }
    next.structuredValue = await resolveStructured(
      input.db,
      claimType,
      assertStructuredValue(claimType, input.patch.structuredValue),
    );
  }
  if (input.patch.sensitivity !== undefined) {
    try {
      next.sensitivity = resolveSensitivity(
        doc.sensitivity as Sensitivity,
        input.patch.sensitivity,
      );
    } catch (error) {
      throw new ResearchError((error as Error).message, "sensitivity cannot be lowered");
    }
  }

  const nextVersion = version + 1;
  const nextDoc = {
    ...doc,
    ...next,
    version: nextVersion,
    updatedAt: now,
  };
  try {
    validateClaim(nextDoc);
  } catch (error) {
    domainError(error);
  }
  const changedFields = Object.keys(next);
  const update = await input.db.collection("claims").updateOne(
    { _id: input.id, version: input.expectedVersion },
    {
      $set: {
        ...next,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
        recentRevisionPreview: addRevisionPreview(doc.recentRevisionPreview, {
          version: nextVersion,
          changedAt: now,
          changedBy: input.actor.id,
          reason,
          changedFields,
        }),
      },
      $inc: { version: 1 },
    },
  );
  if (update.modifiedCount !== 1) {
    throw new ResearchError("VERSION_CONFLICT", "claim version did not match", 409);
  }
  const auditIds = [
    await appendAudit(input.db, {
      action: "ENTITY_UPDATED",
      target: { type: "CLAIM", id: input.id },
      actor: input.actor,
      targetVersionBefore: version,
      targetVersionAfter: nextVersion,
      beforeSummary: { claimType, statement: String(doc.statement ?? "") },
      afterSummary: { claimType, statement: String(next.statement ?? doc.statement ?? "") },
      changedPaths: changedFields,
      reason,
      now,
    }),
  ];
  if (
    input.patch.publicWording !== undefined &&
    input.patch.publicWording !== doc.publicWording
  ) {
    auditIds.push(
      await appendAudit(input.db, {
        action: "PUBLIC_WORDING_CHANGED",
        target: { type: "CLAIM", id: input.id },
        actor: input.actor,
        targetVersionBefore: version,
        targetVersionAfter: nextVersion,
        beforeSummary: { publicWording: String(doc.publicWording ?? "") },
        afterSummary: { publicWording: String(input.patch.publicWording) },
        changedPaths: ["publicWording"],
        reason,
        now,
      }),
    );
  }
  return { id: input.id, version: nextVersion, auditIds };
}
