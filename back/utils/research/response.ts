// Right of reply and organization responses. Spec 10.7-10.8, S11, S23.
//
// A solicitation is an effort, not an answer. A response is an attributed
// position: it never edits the finding, its assessment, or its publication.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { assertCharacterCap } from "../domain/caps.ts";
import {
  DEFAULT_RESPONSE_DEADLINE_DAYS,
  ORG_RESPONSE_PUBLICATION_STATUSES,
  ORG_RESPONSE_RECEIVED_VIA,
  type OrgResponsePublicationStatus,
  type OrgResponseReceivedVia,
  REPRESENTATIVE_VERIFICATION_STATUSES,
  type RepresentativeVerificationStatus,
  SOLICITATION_CHANNELS,
  SOLICITATION_OUTCOMES,
  type SolicitationChannel,
  type SolicitationOutcome,
} from "../domain/constants.ts";
import { createEntityRegistry } from "../identity/registry.ts";
import {
  appendAudit,
  assertNoUnknownKeys,
  type FindingTarget,
  getFinding,
  requireRoles,
  requireString,
  type ResearchActor,
  ResearchError,
  REVIEW_ROLES,
} from "./common.ts";

type Solicitation = {
  _id: ObjectId;
  organizationId: ObjectId;
  channel: SolicitationChannel;
  sentAt: Date;
  sentBy: ObjectId;
  assertionsSummary: string;
  responseDeadline: Date;
  outcome: SolicitationOutcome;
  outcomeAt?: Date;
  proofAssetId?: ObjectId;
  responseId?: ObjectId;
};

type OrganizationResponse = {
  _id: ObjectId;
  respondingOrganizationId: ObjectId;
  responseText: string;
  submittedAt: Date;
  receivedVia: OrgResponseReceivedVia;
  sourceSnapshotId?: ObjectId;
  attachmentAssetIds?: ObjectId[];
  representativeVerification: {
    status: RepresentativeVerificationStatus;
    basis?: string;
    reviewedBy?: ObjectId;
    reviewedAt?: Date;
  };
  publicationStatus: OrgResponsePublicationStatus;
  reviewedBy?: ObjectId;
  reviewedAt?: Date;
  solicitationId?: ObjectId;
};

const CREATE_SOLICITATION_KEYS = [
  "db",
  "targetType",
  "targetId",
  "organizationId",
  "channel",
  "assertionsSummary",
  "sentAt",
  "responseDeadline",
  "proofAssetId",
  "actor",
  "now",
] as const;
const OUTCOME_KEYS = [
  "db",
  "targetType",
  "targetId",
  "solicitationId",
  "outcome",
  "responseId",
  "reason",
  "expectedVersion",
  "actor",
  "now",
] as const;
const CREATE_RESPONSE_KEYS = [
  "db",
  "targetType",
  "targetId",
  "respondingOrganizationId",
  "responseText",
  "receivedVia",
  "sourceSnapshotId",
  "attachmentAssetIds",
  "representativeVerification",
  "publicationStatus",
  "solicitationId",
  "submittedAt",
  "expectedVersion",
  "actor",
  "now",
] as const;
const PUBLICATION_KEYS = [
  "db",
  "targetType",
  "targetId",
  "responseId",
  "status",
  "expectedVersion",
  "reason",
  "actor",
  "now",
] as const;

function parseDate(value: unknown, code: string, path: string): Date | undefined {
  if (value === undefined) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  throw new ResearchError(code, `${path} must be a date`);
}

function parseId(value: unknown, code: string, path: string): ObjectId {
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)) return new ObjectId(value);
  throw new ResearchError(code, `${path} must be an ObjectId`, 404);
}

function solicitationsOf(doc: Record<string, unknown>): Solicitation[] {
  return Array.isArray(doc.responseSolicitations)
    ? doc.responseSolicitations as Solicitation[]
    : [];
}

function responsesOf(doc: Record<string, unknown>): OrganizationResponse[] {
  return Array.isArray(doc.organizationResponses)
    ? doc.organizationResponses as OrganizationResponse[]
    : [];
}

function findSolicitation(doc: Record<string, unknown>, id: ObjectId): Solicitation {
  const solicitation = solicitationsOf(doc).find((item) => item._id.equals(id));
  if (!solicitation) {
    throw new ResearchError("SOLICITATION_NOT_FOUND", "solicitation does not exist", 404);
  }
  return solicitation;
}

function findResponse(doc: Record<string, unknown>, id: ObjectId): OrganizationResponse {
  const response = responsesOf(doc).find((item) => item._id.equals(id));
  if (!response) {
    throw new ResearchError("RESPONSE_NOT_FOUND", "organization response does not exist", 404);
  }
  return response;
}

function isSafeAttachment(asset: Record<string, unknown>): boolean {
  return asset.visibility === "PUBLIC_APPROVED" &&
    asset.processingStatus === "READY" &&
    asset.lifecycle === "ACTIVE" &&
    asset.legalHold !== true &&
    asset.exifStripped !== false;
}

async function resolveSafeAttachments(
  db: Db,
  input: unknown,
): Promise<ObjectId[] | undefined> {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) {
    throw new ResearchError("INVALID_ATTACHMENTS", "attachmentAssetIds must be an array");
  }
  const registry = createEntityRegistry(db);
  const ids: ObjectId[] = [];
  for (const [index, value] of input.entries()) {
    const id = parseId(value, "INVALID_ATTACHMENTS", `attachmentAssetIds[${index}]`);
    const resolved = await registry.resolve("asset.reference", { type: "ASSET", id });
    if (!isSafeAttachment(resolved.doc)) {
      throw new ResearchError(
        "UNSAFE_ATTACHMENT",
        `attachment ${id.toString()} is not public-approved and ready`,
        422,
        { path: `attachmentAssetIds[${index}]` },
      );
    }
    ids.push(resolved.ref.id);
  }
  return ids;
}

function validateRepresentative(
  value: unknown,
  reviewedBy: ObjectId | undefined,
  now: Date,
): OrganizationResponse["representativeVerification"] {
  if (value === undefined) return { status: "UNVERIFIED" };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ResearchError(
      "INVALID_REPRESENTATIVE_VERIFICATION",
      "representativeVerification must be an object",
    );
  }
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (key !== "status" && key !== "basis") {
      throw new ResearchError(
        "INVALID_REPRESENTATIVE_VERIFICATION",
        `representativeVerification.${key} is not allowed`,
      );
    }
  }
  const status = requireString(
    input.status,
    "INVALID_REPRESENTATIVE_VERIFICATION",
    "representativeVerification.status is required",
  );
  if (!(REPRESENTATIVE_VERIFICATION_STATUSES as readonly string[]).includes(status)) {
    throw new ResearchError("INVALID_REPRESENTATIVE_VERIFICATION", "unknown representative status");
  }
  if (input.basis !== undefined && typeof input.basis !== "string") {
    throw new ResearchError("INVALID_REPRESENTATIVE_VERIFICATION", "basis must be a string");
  }
  const verified = status !== "UNVERIFIED";
  return {
    status: status as RepresentativeVerificationStatus,
    ...(input.basis === undefined ? {} : { basis: String(input.basis) }),
    ...(verified && reviewedBy ? { reviewedBy, reviewedAt: now } : {}),
  };
}

function validatePublicationStatus(value: unknown): OrgResponsePublicationStatus {
  if (value === undefined) return ORG_RESPONSE_PUBLICATION_STATUSES[0];
  if (
    typeof value !== "string" ||
    !(ORG_RESPONSE_PUBLICATION_STATUSES as readonly string[]).includes(value)
  ) {
    throw new ResearchError("INVALID_RESPONSE_PUBLICATION", "unknown response publication status");
  }
  return value as OrgResponsePublicationStatus;
}

export async function createResponseSolicitation(input: {
  db: Db;
  targetType: FindingTarget["type"];
  targetId: ObjectId;
  organizationId: ObjectId | string;
  channel: string;
  assertionsSummary: string;
  sentAt?: Date;
  responseDeadline?: Date;
  proofAssetId?: ObjectId | string;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ solicitationId: ObjectId; version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, CREATE_SOLICITATION_KEYS, "UNKNOWN_SOLICITATION_FIELD");
  const now = input.now ?? new Date();
  const loaded = await requireRoles(
    input.db,
    input.actor,
    ["RESEARCHER", "RESEARCH_REVIEWER", "MODERATOR", "ADMIN"],
    "actor may not solicit a response",
  );
  if (!loaded.id) throw new ResearchError("FORBIDDEN", "solicitation requires a user actor", 403);
  if (
    typeof input.channel !== "string" ||
    !(SOLICITATION_CHANNELS as readonly string[]).includes(input.channel)
  ) {
    throw new ResearchError("INVALID_SOLICITATION_CHANNEL", "unknown solicitation channel");
  }
  const assertionsSummary = requireString(
    input.assertionsSummary,
    "ASSERTIONS_REQUIRED",
    "assertionsSummary is required",
  );
  const sentAt = parseDate(input.sentAt, "INVALID_SENT_AT", "sentAt") ?? now;
  const deadline = parseDate(
    input.responseDeadline,
    "INVALID_RESPONSE_DEADLINE",
    "responseDeadline",
  ) ?? new Date(sentAt.getTime() + DEFAULT_RESPONSE_DEADLINE_DAYS * 86_400_000);
  if (deadline.getTime() <= sentAt.getTime()) {
    throw new ResearchError("INVALID_RESPONSE_DEADLINE", "responseDeadline must follow sentAt");
  }

  const registry = createEntityRegistry(input.db);
  const organization = await registry.resolve("organizationResponse.respondingOrganizationId", {
    type: "ORGANIZATION",
    id: parseId(input.organizationId, "INVALID_ORGANIZATION", "organizationId"),
  });
  let proofAssetId: ObjectId | undefined;
  if (input.proofAssetId !== undefined) {
    const proof = await registry.resolve("asset.reference", {
      type: "ASSET",
      id: parseId(input.proofAssetId, "INVALID_ASSET", "proofAssetId"),
    });
    proofAssetId = proof.ref.id;
  }

  const target = { type: input.targetType, id: input.targetId };
  const doc = await getFinding(input.db, target);
  if (solicitationsOf(doc).length + 1 > 10) {
    throw new ResearchError("CAP_EXCEEDED", "responseSolicitations cap exceeded", 422, {
      path: "responseSolicitations",
      cap: 10,
    });
  }

  const solicitationId = new ObjectId();
  const solicitation: Solicitation = {
    _id: solicitationId,
    organizationId: organization.ref.id,
    channel: input.channel as SolicitationChannel,
    sentAt,
    sentBy: loaded.id,
    assertionsSummary,
    responseDeadline: deadline,
    outcome: "PENDING",
    ...(proofAssetId ? { proofAssetId } : {}),
  };
  const collection = input.db.collection(
    input.targetType === "RELATIONSHIP" ? "relationships" : "claims",
  );
  const updated = await collection.findOneAndUpdate(
    {
      _id: input.targetId,
      version: Number(doc.version ?? 0),
      $expr: { $lt: [{ $size: "$responseSolicitations" }, 10] },
    },
    {
      $set: {
        responseSolicitations: [...solicitationsOf(doc), solicitation],
        updatedAt: now,
        ...(loaded.id ? { updatedBy: loaded.id } : {}),
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );
  if (!updated) {
    const current = await getFinding(input.db, target);
    if (solicitationsOf(current).length >= 10) {
      throw new ResearchError("CAP_EXCEEDED", "responseSolicitations cap exceeded", 422, {
        path: "responseSolicitations",
        cap: 10,
      });
    }
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const version = Number(updated.version ?? 0);
  const auditId = await appendAudit(input.db, {
    action: "SOLICITATION_SENT",
    target,
    actor: input.actor,
    targetVersionBefore: version - 1,
    targetVersionAfter: version,
    beforeSummary: { solicitationCount: version > 0 ? solicitationsOf(doc).length : 0 },
    afterSummary: {
      solicitationCount: solicitationsOf(updated as Record<string, unknown>).length,
      channel: solicitation.channel,
      outcome: solicitation.outcome,
      responseDeadline: solicitation.responseDeadline.toISOString(),
    },
    changedPaths: ["responseSolicitations"],
    now,
  });
  return { solicitationId, version, auditId };
}

export async function recordSolicitationOutcome(input: {
  db: Db;
  targetType: FindingTarget["type"];
  targetId: ObjectId;
  solicitationId: ObjectId | string;
  outcome: string;
  responseId?: ObjectId | string;
  reason: string;
  expectedVersion: number;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, OUTCOME_KEYS, "UNKNOWN_SOLICITATION_FIELD");
  const now = input.now ?? new Date();
  await requireRoles(
    input.db,
    input.actor,
    ["RESEARCHER", "RESEARCH_REVIEWER", "MODERATOR", "ADMIN"],
    "actor may not record a solicitation outcome",
  );
  if (
    typeof input.outcome !== "string" ||
    !(SOLICITATION_OUTCOMES as readonly string[]).includes(input.outcome)
  ) {
    throw new ResearchError("INVALID_SOLICITATION_OUTCOME", "unknown solicitation outcome");
  }
  if (input.outcome === "PENDING") {
    throw new ResearchError("INVALID_SOLICITATION_OUTCOME", "PENDING is the initial state");
  }
  const reason = requireString(input.reason, "REASON_REQUIRED", "an outcome requires a reason");
  const target = { type: input.targetType, id: input.targetId };
  const doc = await getFinding(input.db, target);
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const solicitationId = parseId(input.solicitationId, "SOLICITATION_NOT_FOUND", "solicitationId");
  const solicitation = findSolicitation(doc, solicitationId);
  if (solicitation.outcome === input.outcome && !input.responseId) {
    throw new ResearchError("SOLICITATION_ALREADY_RECORDED", "outcome is already recorded", 409);
  }

  let responseId: ObjectId | undefined;
  if (input.outcome === "RESPONDED") {
    const raw = input.responseId ?? solicitation.responseId;
    if (!raw) {
      throw new ResearchError("RESPONSE_REQUIRED", "RESPONDED requires a linked response");
    }
    responseId = parseId(raw, "RESPONSE_NOT_FOUND", "responseId");
    const response = findResponse(doc, responseId);
    if (!response.respondingOrganizationId.equals(solicitation.organizationId)) {
      throw new ResearchError("SOLICITATION_ORG_MISMATCH", "response organization does not match");
    }
  }

  const nextVersion = version + 1;
  const update = await input.db.collection(
    input.targetType === "RELATIONSHIP" ? "relationships" : "claims",
  ).updateOne(
    { _id: input.targetId, version: input.expectedVersion },
    {
      $set: {
        "responseSolicitations.$[item].outcome": input.outcome,
        "responseSolicitations.$[item].outcomeAt": now,
        ...(responseId ? { "responseSolicitations.$[item].responseId": responseId } : {}),
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
      $inc: { version: 1 },
    },
    { arrayFilters: [{ "item._id": solicitationId }] },
  );
  if (update.modifiedCount !== 1) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const auditId = await appendAudit(input.db, {
    action: "SOLICITATION_OUTCOME_RECORDED",
    target,
    actor: input.actor,
    targetVersionBefore: version,
    targetVersionAfter: nextVersion,
    beforeSummary: { outcome: solicitation.outcome },
    afterSummary: { outcome: input.outcome },
    changedPaths: responseId ? ["outcome", "responseId"] : ["outcome"],
    reason,
    now,
  });
  return { version: nextVersion, auditId };
}

export async function addOrganizationResponse(input: {
  db: Db;
  targetType: FindingTarget["type"];
  targetId: ObjectId;
  respondingOrganizationId: ObjectId | string;
  responseText: string;
  receivedVia: string;
  sourceSnapshotId?: ObjectId | string;
  attachmentAssetIds?: Array<ObjectId | string>;
  representativeVerification?: Record<string, unknown>;
  publicationStatus?: string;
  solicitationId?: ObjectId | string;
  submittedAt?: Date;
  expectedVersion: number;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ responseId: ObjectId; version: number; auditIds: ObjectId[] }> {
  assertNoUnknownKeys(input, CREATE_RESPONSE_KEYS, "UNKNOWN_RESPONSE_FIELD");
  const now = input.now ?? new Date();
  const loaded = await requireRoles(
    input.db,
    input.actor,
    ["RESEARCHER", "RESEARCH_REVIEWER", "MODERATOR", "ADMIN"],
    "actor may not record an organization response",
  );
  const responseText = requireString(
    input.responseText,
    "RESPONSE_TEXT_REQUIRED",
    "responseText is required",
  );
  assertCharacterCap("responseText", responseText);
  if (
    typeof input.receivedVia !== "string" ||
    !(ORG_RESPONSE_RECEIVED_VIA as readonly string[]).includes(input.receivedVia)
  ) {
    throw new ResearchError("INVALID_RESPONSE_CHANNEL", "unknown response channel");
  }
  const publicationStatus = validatePublicationStatus(input.publicationStatus);
  const reviewed = publicationStatus === "PUBLIC" || publicationStatus === "REDACTED";
  if (reviewed) {
    await requireRoles(input.db, input.actor, REVIEW_ROLES, "actor may not publish a response");
  }
  const representative = validateRepresentative(
    input.representativeVerification,
    loaded.id,
    now,
  );
  if (representative.status !== "UNVERIFIED") {
    await requireRoles(
      input.db,
      input.actor,
      REVIEW_ROLES,
      "actor may not verify a representative",
    );
  }

  const target = { type: input.targetType, id: input.targetId };
  const doc = await getFinding(input.db, target);
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const registry = createEntityRegistry(input.db);
  const organization = await registry.resolve("organizationResponse.respondingOrganizationId", {
    type: "ORGANIZATION",
    id: parseId(input.respondingOrganizationId, "INVALID_ORGANIZATION", "respondingOrganizationId"),
  });
  let sourceSnapshotId: ObjectId | undefined;
  if (input.sourceSnapshotId !== undefined) {
    const snapshot = await registry.resolve("evidence.sourceSnapshotId", {
      type: "SOURCE_SNAPSHOT",
      id: parseId(input.sourceSnapshotId, "INVALID_SNAPSHOT", "sourceSnapshotId"),
    });
    sourceSnapshotId = snapshot.ref.id;
  }
  const attachmentAssetIds = await resolveSafeAttachments(input.db, input.attachmentAssetIds);

  const solicitationId = input.solicitationId === undefined
    ? undefined
    : parseId(input.solicitationId, "SOLICITATION_NOT_FOUND", "solicitationId");
  let solicitation: Solicitation | undefined;
  if (solicitationId) {
    solicitation = findSolicitation(doc, solicitationId);
    if (!solicitation.organizationId.equals(organization.ref.id)) {
      throw new ResearchError("SOLICITATION_ORG_MISMATCH", "response organization does not match");
    }
    if (solicitation.responseId) {
      throw new ResearchError(
        "SOLICITATION_ALREADY_ANSWERED",
        "solicitation already has a response",
        409,
      );
    }
  }
  if (responsesOf(doc).length + 1 > 20) {
    throw new ResearchError("CAP_EXCEEDED", "organizationResponses cap exceeded", 422, {
      path: "organizationResponses",
      cap: 20,
    });
  }

  const responseId = new ObjectId();
  const response: OrganizationResponse = {
    _id: responseId,
    respondingOrganizationId: organization.ref.id,
    responseText,
    submittedAt: parseDate(input.submittedAt, "INVALID_SUBMITTED_AT", "submittedAt") ?? now,
    receivedVia: input.receivedVia as OrgResponseReceivedVia,
    ...(sourceSnapshotId ? { sourceSnapshotId } : {}),
    ...(attachmentAssetIds ? { attachmentAssetIds } : {}),
    representativeVerification: representative,
    publicationStatus,
    ...(reviewed && loaded.id ? { reviewedBy: loaded.id, reviewedAt: now } : {}),
    ...(solicitationId ? { solicitationId } : {}),
  };
  const nextVersion = version + 1;
  const responses = [...responsesOf(doc), response];
  const solicitations = solicitationsOf(doc).map((item) =>
    solicitationId && item._id.equals(solicitationId)
      ? { ...item, outcome: "RESPONDED" as SolicitationOutcome, outcomeAt: now, responseId }
      : item
  );
  const update = await input.db.collection(
    input.targetType === "RELATIONSHIP" ? "relationships" : "claims",
  ).findOneAndUpdate(
    {
      _id: input.targetId,
      version: input.expectedVersion,
      $expr: { $lt: [{ $size: "$organizationResponses" }, 20] },
    },
    {
      $set: {
        organizationResponses: responses,
        ...(solicitationId ? { responseSolicitations: solicitations } : {}),
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
      $inc: { version: 1 },
    },
    { returnDocument: "after" },
  );
  if (!update) {
    const current = await getFinding(input.db, target);
    if (responsesOf(current).length >= 20) {
      throw new ResearchError("CAP_EXCEEDED", "organizationResponses cap exceeded", 422, {
        path: "organizationResponses",
        cap: 20,
      });
    }
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }

  const auditIds = [
    await appendAudit(input.db, {
      action: "ORG_RESPONSE_ADDED",
      target,
      actor: input.actor,
      targetVersionBefore: version,
      targetVersionAfter: nextVersion,
      beforeSummary: { responseCount: responsesOf(doc).length },
      afterSummary: {
        responseCount: responsesOf(update as Record<string, unknown>).length,
        publicationStatus,
      },
      changedPaths: solicitationId
        ? ["organizationResponses", "responseSolicitations"]
        : ["organizationResponses"],
      now,
    }),
  ];
  if (solicitation) {
    auditIds.push(
      await appendAudit(input.db, {
        action: "SOLICITATION_OUTCOME_RECORDED",
        target,
        actor: input.actor,
        targetVersionBefore: version,
        targetVersionAfter: nextVersion,
        beforeSummary: { outcome: solicitation.outcome },
        afterSummary: { outcome: "RESPONDED" },
        changedPaths: ["outcome", "responseId"],
        reason: "response received",
        now,
      }),
    );
  }
  return { responseId, version: nextVersion, auditIds };
}

export async function setOrganizationResponsePublication(input: {
  db: Db;
  targetType: FindingTarget["type"];
  targetId: ObjectId;
  responseId: ObjectId | string;
  status: string;
  expectedVersion: number;
  reason: string;
  actor: ResearchActor;
  now?: Date;
}): Promise<{ version: number; auditId: ObjectId }> {
  assertNoUnknownKeys(input, PUBLICATION_KEYS, "UNKNOWN_RESPONSE_FIELD");
  const now = input.now ?? new Date();
  const loaded = await requireRoles(
    input.db,
    input.actor,
    REVIEW_ROLES,
    "actor may not review an organization response",
  );
  const status = validatePublicationStatus(input.status);
  const reason = requireString(
    input.reason,
    "REASON_REQUIRED",
    "a status change requires a reason",
  );
  const target = { type: input.targetType, id: input.targetId };
  const doc = await getFinding(input.db, target);
  const version = Number(doc.version ?? 0);
  if (version !== input.expectedVersion) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const responseId = parseId(input.responseId, "RESPONSE_NOT_FOUND", "responseId");
  const response = findResponse(doc, responseId);

  if (status === "PUBLIC") {
    const registry = createEntityRegistry(input.db);
    for (const [index, id] of (response.attachmentAssetIds ?? []).entries()) {
      const resolved = await registry.resolve("asset.reference", { type: "ASSET", id });
      if (!isSafeAttachment(resolved.doc)) {
        throw new ResearchError(
          "UNSAFE_ATTACHMENT",
          `attachment ${id.toString()} is not public-approved and ready`,
          422,
          { path: `attachmentAssetIds[${index}]` },
        );
      }
    }
  }

  const nextVersion = version + 1;
  const update = await input.db.collection(
    input.targetType === "RELATIONSHIP" ? "relationships" : "claims",
  )
    .updateOne(
      { _id: input.targetId, version: input.expectedVersion },
      {
        $set: {
          "organizationResponses.$[item].publicationStatus": status,
          ...(loaded.id
            ? {
              "organizationResponses.$[item].reviewedBy": loaded.id,
              "organizationResponses.$[item].reviewedAt": now,
            }
            : {}),
          updatedAt: now,
          ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
        },
        $inc: { version: 1 },
      },
      { arrayFilters: [{ "item._id": responseId }] },
    );
  if (update.modifiedCount !== 1) {
    throw new ResearchError("VERSION_CONFLICT", "finding version did not match", 409);
  }
  const auditId = await appendAudit(input.db, {
    action: "ORG_RESPONSE_PUBLICATION_CHANGED",
    target,
    actor: input.actor,
    targetVersionBefore: version,
    targetVersionAfter: nextVersion,
    beforeSummary: { publicationStatus: response.publicationStatus },
    afterSummary: { publicationStatus: status },
    changedPaths: ["organizationResponses.publicationStatus"],
    reason,
    now,
  });
  return { version: nextVersion, auditId };
}
