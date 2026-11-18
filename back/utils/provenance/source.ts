// Source identity services. Spec 8.1, 18.3.
//
// A Source is an identity, not a capture. It has no reliability score and no
// latestSnapshotId pointer; lastCapturedAt is maintained from snapshots.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import {
  SOURCE_ACCESS,
  SOURCE_LIFECYCLE,
  SOURCE_TYPES,
  type SourceAccess,
  type SourceLifecycle,
  type SourceType,
} from "../domain/constants.ts";
import { canonicalizeUrl, UrlCanonicalizationError } from "../identity/url.ts";
import {
  appendAudit,
  assertNoUnknownKeys,
  EDIT_ROLES,
  getDocument,
  optionalString,
  type ProvenanceActor,
  ProvenanceError,
  requireRoles,
  requireString,
} from "./common.ts";

const CREATE_KEYS = [
  "db",
  "title",
  "canonicalUrl",
  "sourceType",
  "publisherName",
  "publisherOrganizationId",
  "publisherVerified",
  "language",
  "countryCode",
  "jurisdiction",
  "access",
  "usageTerms",
  "licenseCode",
  "attributionRequired",
  "lifecycle",
  "actor",
  "now",
] as const;
const UPDATE_KEYS = [
  "db",
  "id",
  "expectedVersion",
  "patch",
  "reason",
  "actor",
  "now",
] as const;
const PATCH_KEYS = [
  "title",
  "canonicalUrl",
  "sourceType",
  "publisherName",
  "publisherOrganizationId",
  "publisherVerified",
  "language",
  "countryCode",
  "jurisdiction",
  "access",
  "usageTerms",
  "licenseCode",
  "attributionRequired",
  "lifecycle",
] as const;

function oneOf<T extends readonly string[]>(
  values: T,
  value: unknown,
  code: string,
  path: string,
): T[number] {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new ProvenanceError(code, `${path} is not a supported value`);
  }
  return value as T[number];
}

function booleanValue(value: unknown, code: string, path: string): boolean {
  if (typeof value !== "boolean") throw new ProvenanceError(code, `${path} must be a boolean`);
  return value;
}

function urlValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ProvenanceError("INVALID_URL", "canonicalUrl must be a string");
  }
  try {
    return canonicalizeUrl(value);
  } catch (error) {
    if (error instanceof UrlCanonicalizationError) {
      throw new ProvenanceError(error.code, error.message);
    }
    throw error;
  }
}

async function assertPublisherOrganization(db: Db, value: unknown): Promise<ObjectId | undefined> {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  const id = value instanceof ObjectId
    ? value
    : typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)
    ? new ObjectId(value)
    : null;
  if (!id) throw new ProvenanceError("INVALID_PUBLISHER", "publisherOrganizationId is invalid");
  const organization = await db.collection("organizations").findOne({ _id: id });
  if (!organization) {
    throw new ProvenanceError("NOT_FOUND", "publisher organization does not exist", 404);
  }
  if (organization.lifecycle === "ARCHIVED" || organization.lifecycle === "MERGED") {
    throw new ProvenanceError("INVALID_PUBLISHER", "publisher organization is not active", 409);
  }
  return id;
}

function assertDatasetLicense(sourceType: SourceType, licenseCode: string | undefined): void {
  if (sourceType === "DATASET" && !licenseCode) {
    throw new ProvenanceError(
      "LICENSE_REQUIRED",
      "DATASET sources require a licenseCode and attribution decision",
    );
  }
}

export type SourceInput = {
  db: Db;
  title: string;
  canonicalUrl?: string;
  sourceType: string;
  publisherName?: string;
  publisherOrganizationId?: ObjectId | string;
  publisherVerified?: boolean;
  language?: string;
  countryCode?: string;
  jurisdiction?: string;
  access?: string;
  usageTerms?: string;
  licenseCode?: string;
  attributionRequired?: boolean;
  lifecycle?: string;
  actor: ProvenanceActor;
  now?: Date;
};

export async function createSource(input: SourceInput): Promise<{
  id: ObjectId;
  version: number;
  auditId: ObjectId;
}> {
  assertNoUnknownKeys(input, CREATE_KEYS, "UNKNOWN_SOURCE_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(
    input.db,
    input.actor,
    EDIT_ROLES,
    "actor may not create sources",
  );
  const title = requireString(input.title, "TITLE_REQUIRED", "title is required");
  const sourceType = oneOf(SOURCE_TYPES, input.sourceType, "INVALID_SOURCE_TYPE", "sourceType");
  const access = oneOf(SOURCE_ACCESS, input.access ?? "PUBLIC", "INVALID_SOURCE_ACCESS", "access");
  const lifecycle = oneOf(
    SOURCE_LIFECYCLE,
    input.lifecycle ?? "ACTIVE",
    "INVALID_SOURCE_LIFECYCLE",
    "lifecycle",
  );
  const publisherVerified = input.publisherVerified === undefined
    ? false
    : booleanValue(input.publisherVerified, "INVALID_SOURCE", "publisherVerified");
  const attributionRequired = input.attributionRequired === undefined
    ? false
    : booleanValue(input.attributionRequired, "INVALID_SOURCE", "attributionRequired");
  const licenseCode = optionalString(input.licenseCode, "INVALID_SOURCE", "licenseCode");
  assertDatasetLicense(sourceType, licenseCode);
  const canonicalUrl = urlValue(input.canonicalUrl);
  const publisherOrganizationId = await assertPublisherOrganization(
    input.db,
    input.publisherOrganizationId,
  );

  const _id = new ObjectId();
  const doc = {
    _id,
    title,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    sourceType,
    ...(input.publisherName ? { publisherName: input.publisherName } : {}),
    ...(publisherOrganizationId ? { publisherOrganizationId } : {}),
    publisherVerified,
    ...(input.language ? { language: input.language } : {}),
    ...(input.countryCode ? { countryCode: input.countryCode } : {}),
    ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
    access,
    ...(input.usageTerms ? { usageTerms: input.usageTerms } : {}),
    ...(licenseCode ? { licenseCode } : {}),
    attributionRequired,
    lifecycle,
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...(input.actor.id ? { createdBy: input.actor.id, updatedBy: input.actor.id } : {}),
  };
  await input.db.collection("sources").insertOne(doc);
  const auditId = await appendAudit(input.db, {
    action: "SOURCE_CREATED",
    target: { type: "SOURCE", id: _id },
    actor: input.actor,
    targetVersionBefore: 0,
    targetVersionAfter: 1,
    afterSummary: {
      sourceType,
      access,
      lifecycle,
      publisherVerified,
      attributionRequired,
      licenseCode: licenseCode ?? null,
    },
    changedPaths: ["title", "sourceType", "access", "lifecycle"],
    now,
  });
  return { id: _id, version: 1, auditId };
}

export async function updateSource(input: {
  db: Db;
  id: ObjectId;
  expectedVersion: number;
  patch: Record<string, unknown>;
  reason: string;
  actor: ProvenanceActor;
  now?: Date;
}): Promise<{ id: ObjectId; version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, UPDATE_KEYS, "UNKNOWN_SOURCE_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(input.db, input.actor, EDIT_ROLES, "actor may not update sources");
  const reason = requireString(input.reason, "REASON_REQUIRED", "source update requires a reason");
  for (const key of Object.keys(input.patch)) {
    if (!(PATCH_KEYS as readonly string[]).includes(key)) {
      throw new ProvenanceError("FORBIDDEN_SOURCE_FIELD", `${key} is not a source field`);
    }
  }
  if (Object.keys(input.patch).length === 0) {
    throw new ProvenanceError("EMPTY_PATCH", "source update patch is empty");
  }
  const doc = await getDocument(input.db, "sources", input.id, "source");
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ProvenanceError("VERSION_CONFLICT", "source version did not match", 409);
  }

  const next: Record<string, unknown> = {};
  for (
    const key of [
      "title",
      "publisherName",
      "language",
      "countryCode",
      "jurisdiction",
      "usageTerms",
    ] as const
  ) {
    if (input.patch[key] !== undefined) next[key] = String(input.patch[key]);
  }
  if (input.patch.canonicalUrl !== undefined) {
    next.canonicalUrl = urlValue(input.patch.canonicalUrl);
  }
  if (input.patch.sourceType !== undefined) {
    next.sourceType = oneOf(
      SOURCE_TYPES,
      input.patch.sourceType,
      "INVALID_SOURCE_TYPE",
      "sourceType",
    );
  }
  if (input.patch.access !== undefined) {
    next.access = oneOf(SOURCE_ACCESS, input.patch.access, "INVALID_SOURCE_ACCESS", "access");
  }
  if (input.patch.lifecycle !== undefined) {
    next.lifecycle = oneOf(
      SOURCE_LIFECYCLE,
      input.patch.lifecycle,
      "INVALID_SOURCE_LIFECYCLE",
      "lifecycle",
    );
  }
  if (input.patch.publisherVerified !== undefined) {
    next.publisherVerified = booleanValue(
      input.patch.publisherVerified,
      "INVALID_SOURCE",
      "publisherVerified",
    );
  }
  if (input.patch.attributionRequired !== undefined) {
    next.attributionRequired = booleanValue(
      input.patch.attributionRequired,
      "INVALID_SOURCE",
      "attributionRequired",
    );
  }
  if (input.patch.licenseCode !== undefined) next.licenseCode = String(input.patch.licenseCode);
  if (input.patch.publisherOrganizationId !== undefined) {
    next.publisherOrganizationId = await assertPublisherOrganization(
      input.db,
      input.patch.publisherOrganizationId,
    );
  }
  const sourceType = (next.sourceType ?? doc.sourceType) as SourceType;
  const licenseCode = (next.licenseCode ?? doc.licenseCode) as string | undefined;
  assertDatasetLicense(sourceType, licenseCode);

  const nextVersion = version + 1;
  const update = await input.db.collection("sources").updateOne(
    { _id: input.id, version: input.expectedVersion },
    {
      $set: {
        ...next,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
      $inc: { version: 1 },
    },
  );
  if (update.modifiedCount !== 1) {
    throw new ProvenanceError("VERSION_CONFLICT", "source version did not match", 409);
  }
  const auditId = await appendAudit(input.db, {
    action: "ENTITY_UPDATED",
    target: { type: "SOURCE", id: input.id },
    actor: input.actor,
    targetVersionBefore: version,
    targetVersionAfter: nextVersion,
    beforeSummary: { lifecycle: String(doc.lifecycle), access: String(doc.access) },
    afterSummary: {
      lifecycle: String(next.lifecycle ?? doc.lifecycle),
      access: String(next.access ?? doc.access),
    },
    changedPaths: Object.keys(next),
    reason,
    now,
  });
  return { id: input.id, version: nextVersion, auditId };
}

export async function touchSourceLastCapturedAt(
  db: Db,
  sourceId: ObjectId,
  retrievedAt: Date,
): Promise<void> {
  const source = await db.collection("sources").findOne({ _id: sourceId });
  if (!source) throw new ProvenanceError("NOT_FOUND", "source does not exist", 404);
  const current = source.lastCapturedAt ? new Date(source.lastCapturedAt as string | Date) : null;
  if (current && current.getTime() >= retrievedAt.getTime()) return;
  await db.collection("sources").updateOne(
    { _id: sourceId, ...(current ? { lastCapturedAt: source.lastCapturedAt } : {}) },
    { $set: { lastCapturedAt: retrievedAt } },
  );
}

export async function getSource(input: {
  db: Db;
  id: ObjectId;
  includeRecentSnapshots?: boolean;
  snapshotLimit?: number;
}): Promise<Record<string, unknown> & { recentSnapshotsPreview?: Record<string, unknown>[] }> {
  const doc = await getDocument(input.db, "sources", input.id, "source");
  if (!input.includeRecentSnapshots) return doc;
  const limit = Math.min(Math.max(input.snapshotLimit ?? 10, 1), 10);
  const preview = await input.db.collection("source_snapshots").find(
    { "source._id": input.id },
    {
      projection: {
        _id: 1,
        retrievedAt: 1,
        contentHash: 1,
        mimeType: 1,
        byteSize: 1,
        lifecycle: 1,
      },
      sort: { retrievedAt: -1 },
      limit,
    },
  ).toArray();
  return { ...doc, recentSnapshotsPreview: preview as Record<string, unknown>[] };
}

export async function listSources(input: {
  db: Db;
  sourceType?: string;
  access?: string;
  lifecycle?: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const filter: Record<string, unknown> = {};
  if (input.sourceType) {
    filter.sourceType = oneOf(SOURCE_TYPES, input.sourceType, "INVALID_SOURCE_TYPE", "sourceType");
  }
  if (input.access) {
    filter.access = oneOf(SOURCE_ACCESS, input.access, "INVALID_SOURCE_ACCESS", "access");
  }
  if (input.lifecycle) {
    filter.lifecycle = oneOf(
      SOURCE_LIFECYCLE,
      input.lifecycle,
      "INVALID_SOURCE_LIFECYCLE",
      "lifecycle",
    );
  }
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
  return await input.db.collection("sources").find(filter, { limit, sort: { updatedAt: -1 } })
    .toArray() as Record<string, unknown>[];
}

export type { SourceAccess, SourceLifecycle, SourceType };
