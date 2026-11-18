// Relationship graph-edge domain services. Spec 6, S06, S07, I11.
//
// An edge is immutable in its endpoints. A new owner is a new edge; closing an
// edge changes validity.validTo only. canonicalKey is a duplicate suggestion
// helper, never a unique key.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { assertCharacterCap } from "../domain/caps.ts";
import {
  DATE_PRECISIONS,
  FINDING_RECORD_LIFECYCLE,
  OWNERSHIP_BASES,
  PREDICATE_MATRIX,
  PREDICATE_REGISTRY_VERSION,
  PUBLICATION_STATUSES,
  RELATIONSHIP_ENDPOINT_TYPES,
  RELATIONSHIP_PREDICATES,
  type RelationshipPredicate,
  type Sensitivity,
} from "../domain/constants.ts";
import { createEntityRegistry } from "../identity/registry.ts";
import {
  addRevisionPreview,
  appendAudit,
  assertNoUnknownKeys,
  getFinding,
  requireRoles,
  requireString,
  type ResearchActor,
  ResearchError,
} from "./common.ts";
import { classifyRelationshipSensitivity, resolveSensitivity } from "./sensitivity.ts";

export type RelationshipEndpoint = {
  type: "PRODUCT" | "BRAND" | "ORGANIZATION";
  id: ObjectId;
};

export type RelationshipContext = {
  marketCountryCode?: string;
  jurisdiction?: string;
  ownership?: {
    sharePercentage?: number;
    basis?: "DIRECT" | "INDIRECT" | "VOTING_RIGHTS" | "OTHER_DOCUMENTED";
    notes?: string;
  };
  notes?: string;
};

export type RelationshipValidity = {
  validFrom?: Date | null;
  validTo?: Date | null;
  datePrecision: "EXACT" | "MONTH" | "YEAR" | "APPROXIMATE" | "UNKNOWN";
};

const CREATE_KEYS = [
  "db",
  "subject",
  "predicate",
  "object",
  "validity",
  "context",
  "sensitivity",
  "publicWording",
  "actor",
  "now",
] as const;
const CONTEXT_KEYS = ["marketCountryCode", "jurisdiction", "ownership", "notes"] as const;
const OWNERSHIP_KEYS = ["sharePercentage", "basis", "notes"] as const;
const VALIDITY_KEYS = ["validFrom", "validTo", "datePrecision"] as const;
const UPDATE_KEYS = ["validity", "context", "sensitivity", "publicWording"] as const;

function refType(value: unknown, path: string): RelationshipEndpoint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ResearchError("INVALID_RELATIONSHIP_ENDPOINT", `${path} must be an object`);
  }
  const ref = value as Record<string, unknown>;
  assertNoUnknownKeys(ref, ["type", "id"], "INVALID_RELATIONSHIP_ENDPOINT", path);
  if (
    typeof ref.type !== "string" ||
    !(RELATIONSHIP_ENDPOINT_TYPES as readonly string[]).includes(ref.type)
  ) {
    throw new ResearchError("INVALID_RELATIONSHIP_ENDPOINT", `${path}.type is not an endpoint`);
  }
  const id = ref.id instanceof ObjectId
    ? ref.id
    : typeof ref.id === "string" && /^[a-f0-9]{24}$/i.test(ref.id)
    ? new ObjectId(ref.id)
    : null;
  if (!id) throw new ResearchError("INVALID_RELATIONSHIP_ENDPOINT", `${path}.id is invalid`);
  return { type: ref.type as RelationshipEndpoint["type"], id };
}

function dateValue(value: unknown, path: string): Date | null {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  throw new ResearchError("INVALID_VALIDITY", `${path} must be a date or null`);
}

export function validateValidity(value: unknown): RelationshipValidity {
  assertNoUnknownKeys(value, VALIDITY_KEYS, "UNKNOWN_RELATIONSHIP_FIELD", "validity");
  if (value === undefined) {
    throw new ResearchError("INVALID_VALIDITY", "validity is required");
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.datePrecision !== "string" ||
    !(DATE_PRECISIONS as readonly string[]).includes(input.datePrecision)
  ) {
    throw new ResearchError("INVALID_VALIDITY", "validity.datePrecision is invalid");
  }
  const validFrom = dateValue(input.validFrom, "validity.validFrom");
  const validTo = dateValue(input.validTo, "validity.validTo");
  if (validFrom && validTo && validTo.getTime() < validFrom.getTime()) {
    throw new ResearchError("INVALID_VALIDITY", "validity.validTo precedes validFrom");
  }
  return {
    validFrom,
    validTo,
    datePrecision: input.datePrecision as RelationshipValidity["datePrecision"],
  };
}

export function validateContext(value: unknown): RelationshipContext | undefined {
  if (value === undefined) return undefined;
  assertNoUnknownKeys(value, CONTEXT_KEYS, "UNKNOWN_RELATIONSHIP_FIELD", "context");
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ResearchError("INVALID_RELATIONSHIP_CONTEXT", "context must be an object");
  }
  const input = value as Record<string, unknown>;
  for (const key of ["marketCountryCode", "jurisdiction", "notes"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "string") {
      throw new ResearchError("INVALID_RELATIONSHIP_CONTEXT", `context.${key} must be a string`);
    }
  }
  let ownership: RelationshipContext["ownership"];
  if (input.ownership !== undefined) {
    assertNoUnknownKeys(
      input.ownership,
      OWNERSHIP_KEYS,
      "UNKNOWN_RELATIONSHIP_FIELD",
      "context.ownership",
    );
    const raw = input.ownership as Record<string, unknown>;
    if (
      raw.sharePercentage !== undefined &&
      (typeof raw.sharePercentage !== "number" ||
        !Number.isFinite(raw.sharePercentage) ||
        raw.sharePercentage < 0 ||
        raw.sharePercentage > 100)
    ) {
      throw new ResearchError(
        "INVALID_RELATIONSHIP_CONTEXT",
        "ownership.sharePercentage is invalid",
      );
    }
    if (
      raw.basis !== undefined &&
      (typeof raw.basis !== "string" || !(OWNERSHIP_BASES as readonly string[]).includes(raw.basis))
    ) {
      throw new ResearchError("INVALID_RELATIONSHIP_CONTEXT", "ownership.basis is invalid");
    }
    if (raw.notes !== undefined && typeof raw.notes !== "string") {
      throw new ResearchError("INVALID_RELATIONSHIP_CONTEXT", "ownership.notes must be a string");
    }
    if (Object.keys(raw).length > 0) ownership = raw as RelationshipContext["ownership"];
  }
  return {
    ...(input.marketCountryCode === undefined
      ? {}
      : { marketCountryCode: String(input.marketCountryCode) }),
    ...(input.jurisdiction === undefined ? {} : { jurisdiction: String(input.jurisdiction) }),
    ...(ownership ? { ownership } : {}),
    ...(input.notes === undefined ? {} : { notes: String(input.notes) }),
  };
}

function validateMatrix(
  predicate: string,
  subject: RelationshipEndpoint,
  object: RelationshipEndpoint,
  context: RelationshipContext | undefined,
): asserts predicate is RelationshipPredicate {
  if (!(RELATIONSHIP_PREDICATES as readonly string[]).includes(predicate)) {
    throw new ResearchError("UNKNOWN_PREDICATE", `predicate ${predicate} is not in the registry`);
  }
  const rule = PREDICATE_MATRIX[predicate as RelationshipPredicate];
  if (!(rule.subjectTypes as readonly string[]).includes(subject.type)) {
    throw new ResearchError(
      "INVALID_RELATIONSHIP_ENDPOINT",
      `${predicate} subject must be ${rule.subjectTypes.join(", ")}`,
    );
  }
  if (!(rule.objectTypes as readonly string[]).includes(object.type)) {
    throw new ResearchError(
      "INVALID_RELATIONSHIP_ENDPOINT",
      `${predicate} object must be ${rule.objectTypes.join(", ")}`,
    );
  }
  for (const required of rule.requiredContext) {
    if (required === "ownership.basis" && !context?.ownership?.basis) {
      throw new ResearchError(
        "MISSING_RELATIONSHIP_CONTEXT",
        `${predicate} requires ownership.basis`,
      );
    }
    if (required === "marketCountryCode" && !context?.marketCountryCode) {
      throw new ResearchError(
        "MISSING_RELATIONSHIP_CONTEXT",
        `${predicate} requires marketCountryCode`,
      );
    }
  }
}

function normalizedScope(context: RelationshipContext | undefined): string {
  if (!context) return "none";
  const parts: string[] = [];
  if (context.marketCountryCode) {
    parts.push(`market:${context.marketCountryCode.trim().toLowerCase()}`);
  }
  if (context.jurisdiction) parts.push(`jurisdiction:${context.jurisdiction.trim().toLowerCase()}`);
  if (context.ownership?.basis) {
    parts.push(
      `ownership:${context.ownership.basis}${
        context.ownership.sharePercentage === undefined
          ? ""
          : `@${context.ownership.sharePercentage}`
      }`,
    );
  }
  return parts.length ? parts.join(";") : "none";
}

export function canonicalRelationshipKey(input: {
  subject: RelationEndpointInput;
  predicate: string;
  object: RelationEndpointInput;
  context?: RelationshipContext;
}): string {
  const subject = refType(input.subject, "subject");
  const object = refType(input.object, "object");
  return [
    subject.type,
    subject.id.toString(),
    input.predicate,
    object.type,
    object.id.toString(),
    normalizedScope(input.context),
  ].join("|");
}

type RelationEndpointInput = { type: string; id: ObjectId | string };

function interval(doc: Record<string, unknown>): [number, number] {
  const validity = (doc.validity ?? {}) as Record<string, unknown>;
  return [
    validity.validFrom
      ? new Date(validity.validFrom as string | Date).getTime()
      : Number.NEGATIVE_INFINITY,
    validity.validTo
      ? new Date(validity.validTo as string | Date).getTime()
      : Number.POSITIVE_INFINITY,
  ];
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

async function findOverlapping(
  db: Db,
  object: RelationshipEndpoint,
  predicate: string,
  validity: RelationshipValidity,
): Promise<ObjectId[]> {
  const candidates = await db.collection("relationships").find({
    "object.type": object.type,
    "object.id": object.id,
    predicate,
    recordLifecycle: "ACTIVE",
  }).toArray();
  const next: [number, number] = [
    validity.validFrom ? validity.validFrom.getTime() : Number.NEGATIVE_INFINITY,
    validity.validTo ? validity.validTo.getTime() : Number.POSITIVE_INFINITY,
  ];
  return candidates
    .filter((doc) => overlaps(interval(doc as Record<string, unknown>), next))
    .map((doc) => doc._id as ObjectId);
}

export async function createRelationshipEdge(input: {
  db: Db;
  subject: RelationEndpointInput;
  predicate: string;
  object: RelationEndpointInput;
  validity: RelationshipValidity;
  context?: Record<string, unknown>;
  sensitivity?: Sensitivity;
  publicWording?: string;
  actor: ResearchActor;
  now?: Date;
}): Promise<{
  id: ObjectId;
  version: number;
  canonicalKey: string;
  overlapFlag: { relationshipIds: ObjectId[] };
  auditId: ObjectId;
}> {
  assertNoUnknownKeys(input, CREATE_KEYS, "UNKNOWN_RELATIONSHIP_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, [
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ], "actor may not create findings");
  const subject = refType(input.subject, "subject");
  const object = refType(input.object, "object");
  const context = validateContext(input.context);
  validateMatrix(input.predicate, subject, object, context);
  const validity = validateValidity(input.validity);

  const registry = createEntityRegistry(input.db);
  const resolvedSubject = await registry.resolve("relationship.subject", subject);
  const resolvedObject = await registry.resolve("relationship.object", object);

  let sensitivity: Sensitivity;
  try {
    sensitivity = resolveSensitivity(
      classifyRelationshipSensitivity(input.predicate),
      input.sensitivity,
    );
  } catch (error) {
    const code = (error as Error).message;
    throw new ResearchError(code, `sensitivity cannot be lowered for ${input.predicate}`);
  }

  if (input.publicWording !== undefined) {
    assertCharacterCap("publicWording", input.publicWording);
  }
  const canonicalKey = canonicalRelationshipKey({
    subject: resolvedSubject.ref as RelationshipEndpoint,
    predicate: input.predicate,
    object: resolvedObject.ref as RelationshipEndpoint,
    context,
  });
  const overlapIds = await findOverlapping(
    input.db,
    resolvedObject.ref as RelationshipEndpoint,
    input.predicate,
    validity,
  );

  const _id = new ObjectId();
  const doc = {
    _id,
    subject: resolvedSubject.ref,
    predicate: input.predicate,
    predicateRegistryVersion: PREDICATE_REGISTRY_VERSION,
    object: resolvedObject.ref,
    ...(context ? { context } : {}),
    validity,
    sensitivity,
    recordLifecycle: FINDING_RECORD_LIFECYCLE[0],
    review: { status: "NOT_QUEUED", priority: "NORMAL" },
    assessment: { outcome: "NOT_ASSESSED", methodologyVersion: "1", limitations: [] },
    publication: { status: PUBLICATION_STATUSES[0] },
    ...(input.publicWording === undefined ? {} : { publicWording: input.publicWording }),
    evidence: [],
    organizationResponses: [],
    responseSolicitations: [],
    researchNotes: [],
    recentRevisionPreview: [],
    canonicalKey,
    recordedAt: now,
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(input.actor.id ? { createdBy: input.actor.id, updatedBy: input.actor.id } : {}),
  };
  await input.db.collection("relationships").insertOne(doc);
  const auditId = await appendAudit(input.db, {
    action: "RELATIONSHIP_CREATED",
    target: { type: "RELATIONSHIP", id: _id },
    actor: input.actor,
    targetVersionBefore: 0,
    targetVersionAfter: 1,
    beforeSummary: {},
    afterSummary: {
      predicate: input.predicate,
      subjectType: resolvedSubject.ref.type,
      objectType: resolvedObject.ref.type,
      sensitivity,
      overlap: overlapIds.length > 0,
    },
    changedPaths: ["subject", "predicate", "object", "validity", "sensitivity"],
    now,
  });

  return {
    id: _id,
    version: 1,
    canonicalKey,
    overlapFlag: { relationshipIds: overlapIds },
    auditId,
  };
}

export async function endRelationshipEdge(input: {
  db: Db;
  id: ObjectId;
  expectedVersion: number;
  validTo: Date;
  reason: string;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ id: ObjectId; version: number; auditId: ObjectId }> {
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, [
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ], "actor may not close findings");
  const reason = requireString(input.reason, "REASON_REQUIRED", "ending an edge requires a reason");
  const validTo = dateValue(input.validTo, "validTo");
  if (!validTo) throw new ResearchError("INVALID_VALIDITY", "validTo is required");
  const doc = await getFinding(input.db, { type: "RELATIONSHIP", id: input.id });
  const validity = doc.validity as Record<string, unknown> | undefined;
  if (validity?.validTo) {
    throw new ResearchError("RELATIONSHIP_ALREADY_ENDED", "relationship already has validTo", 409);
  }
  if (validity?.validFrom) {
    const from = new Date(validity.validFrom as string | Date);
    if (validTo.getTime() < from.getTime()) {
      throw new ResearchError("INVALID_VALIDITY", "validTo precedes validFrom");
    }
  }

  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "relationship version did not match", 409);
  }
  const nextVersion = version + 1;
  const updated = await input.db.collection("relationships").updateOne(
    { _id: input.id, version: input.expectedVersion, "validity.validTo": null },
    {
      $set: {
        "validity.validTo": validTo,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
        recentRevisionPreview: addRevisionPreview(doc.recentRevisionPreview, {
          version: nextVersion,
          changedAt: now,
          changedBy: input.actor.id,
          reason,
          changedFields: ["validity.validTo"],
        }),
      },
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new ResearchError("VERSION_CONFLICT", "relationship version did not match", 409);
  }
  const auditId = await appendAudit(input.db, {
    action: "RELATIONSHIP_CLOSED",
    target: { type: "RELATIONSHIP", id: input.id },
    actor: input.actor,
    targetVersionBefore: version,
    targetVersionAfter: nextVersion,
    beforeSummary: { validTo: null, recordLifecycle: String(doc.recordLifecycle) },
    afterSummary: { validTo: validTo.toISOString(), recordLifecycle: String(doc.recordLifecycle) },
    changedPaths: ["validity.validTo"],
    reason,
    now,
  });
  return { id: input.id, version: nextVersion, auditId };
}

export async function updateRelationship(input: {
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
  ], "actor may not update findings");
  for (const key of Object.keys(input.patch)) {
    if (!(UPDATE_KEYS as readonly string[]).includes(key)) {
      throw new ResearchError("FORBIDDEN_RELATIONSHIP_FIELD", `${key} is not a pure update field`);
    }
  }
  if (Object.keys(input.patch).length === 0) {
    throw new ResearchError("EMPTY_PATCH", "update patch is empty");
  }
  const reason = requireString(input.reason, "REASON_REQUIRED", "update requires a reason");
  const doc = await getFinding(input.db, { type: "RELATIONSHIP", id: input.id });
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "relationship version did not match", 409);
  }

  const next: Record<string, unknown> = {};
  if (input.patch.validity !== undefined) next.validity = validateValidity(input.patch.validity);
  if (input.patch.context !== undefined) next.context = validateContext(input.patch.context);
  if (input.patch.publicWording !== undefined) {
    if (typeof input.patch.publicWording !== "string") {
      throw new ResearchError("INVALID_PUBLIC_WORDING", "publicWording must be a string");
    }
    assertCharacterCap("publicWording", input.patch.publicWording);
    next.publicWording = input.patch.publicWording;
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

  const mergedContext = (next.context ?? doc.context) as RelationshipContext | undefined;
  const mergedValidity = (next.validity ?? doc.validity) as RelationshipValidity;
  validateMatrix(
    String(doc.predicate),
    doc.subject as RelationshipEndpoint,
    doc.object as RelationshipEndpoint,
    mergedContext,
  );
  validateValidity(mergedValidity);

  const nextVersion = version + 1;
  const changedFields = Object.keys(next);
  const canonicalKey = canonicalRelationshipKey({
    subject: doc.subject as RelationshipEndpoint,
    predicate: String(doc.predicate),
    object: doc.object as RelationshipEndpoint,
    context: mergedContext,
  });
  const update = await input.db.collection("relationships").updateOne(
    { _id: input.id, version: input.expectedVersion },
    {
      $set: {
        ...next,
        canonicalKey,
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
    throw new ResearchError("VERSION_CONFLICT", "relationship version did not match", 409);
  }

  const auditIds = [
    await appendAudit(input.db, {
      action: "ENTITY_UPDATED",
      target: { type: "RELATIONSHIP", id: input.id },
      actor: input.actor,
      targetVersionBefore: version,
      targetVersionAfter: nextVersion,
      beforeSummary: { canonicalKey: String(doc.canonicalKey ?? "") },
      afterSummary: { canonicalKey },
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
        target: { type: "RELATIONSHIP", id: input.id },
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
