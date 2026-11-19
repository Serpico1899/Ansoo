// Public profile assembly. Spec 14.1-14.3, S19, I02, I11, I12.
//
// Every read starts here, never with a raw canonical document. Scope labels are
// explicit; Organization findings require a published Brand edge and the walk
// stops after two hops (Product -> Brand -> Organization).
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import {
  PUBLIC_PROFILE_LIMITATIONS,
  PUBLIC_UNKNOWN_CODES,
  type PublicBrandView,
  type PublicCorrectionNotice,
  type PublicCounterparty,
  type PublicEvidenceView,
  type PublicFindingView,
  type PublicInheritedFrom,
  type PublicProductIdentity,
  type PublicProductProfile,
  type PublicResponseView,
  type PublicRightOfReply,
  type PublicScope,
  type PublicSourceVersions,
  type PublicUnknown,
  type PublicValidity,
} from "./types.ts";
import type { ResolutionResult } from "../identity/resolution.ts";

type Doc = Record<string, unknown> & { _id?: ObjectId };
type FindingKind = "RELATIONSHIP" | "CLAIM";
type Candidate = {
  doc: Doc;
  kind: FindingKind;
  scope: PublicScope;
  inheritedFrom?: PublicInheritedFrom;
};

export type AssemblyResult = {
  profile: PublicProductProfile;
  sourceVersions: PublicSourceVersions;
  used: Doc[];
};

const SCOPE_RANK: Record<PublicScope, number> = {
  PRODUCT: 0,
  BRAND: 1,
  ORGANIZATION: 2,
};
const MAX_FINDINGS = 200;
const MAX_RESPONSES = 20;
const MAX_EVIDENCE = 50;

function idOf(value: unknown): ObjectId | null {
  return value instanceof ObjectId ? value : null;
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  return null;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function dateIso(value: unknown): string | null {
  const date = dateOf(value);
  return date === null ? null : date.toISOString();
}

export function sourceVersionOf(doc: Doc): string {
  if (typeof doc.contentHash === "string" && doc.contentHash.length > 0) {
    return `hash:${doc.contentHash}`;
  }
  const version = Number(doc.version ?? 0);
  const stamp = dateIso(doc.updatedAt) ?? dateIso(doc.createdAt) ?? dateIso(doc.retrievedAt) ??
    dateIso(doc.recordedAt) ?? "static";
  return `v:${Number.isFinite(version) ? version : 0}:${stamp}`;
}

function timestampOf(value: unknown): number {
  const date = dateOf(value);
  return date === null ? 0 : date.getTime();
}

// builtAt is the canonical-state watermark, not the wall-clock rebuild time.
// S30 requires a full rebuild from the same canonical state to be byte-identical,
// so the payload may not embed an ever-changing clock value.
function canonicalBuiltAt(used: Doc[]): Date {
  let latest = 0;
  const nested = [
    "publication.publishedAt",
    "publication.decidedAt",
    "assessment.assessedAt",
    "review.lastActionAt",
    "application.appliedAt",
    "publicNotice.correctedAt",
  ];
  for (const doc of used) {
    for (const key of ["updatedAt", "createdAt", "retrievedAt", "recordedAt"]) {
      latest = Math.max(latest, timestampOf(doc[key]));
    }
    for (const path of nested) {
      const [head, tail] = path.split(".");
      const parent = (doc[head] ?? {}) as Doc;
      latest = Math.max(latest, timestampOf(parent[tail]));
    }
  }
  return new Date(latest);
}

function versionKey(collection: string, doc: Doc): string | null {
  const id = idOf(doc._id);
  return id === null ? null : `${collection}:${id.toString()}`;
}

function buildSourceVersions(used: Doc[]): PublicSourceVersions {
  const versions: PublicSourceVersions = {};
  for (const item of used) {
    const id = idOf(item._id);
    if (id === null) continue;
    const collection = String(item.__publicCollection ?? "");
    if (collection === "") continue;
    const key = versionKey(collection, item);
    if (key !== null) versions[key] = sourceVersionOf(item);
  }
  return Object.fromEntries(
    Object.entries(versions).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value instanceof ObjectId) return JSON.stringify(value.toString());
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${
    entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")
  }}`;
}

function nameOf(doc: Doc | null): string {
  if (doc === null) return "Unknown";
  return stringOf(doc.name) ?? stringOf(doc.title) ?? stringOf(doc.displayName) ?? "Unknown";
}

function counterparty(type: PublicCounterparty["type"], doc: Doc | null, id: ObjectId) {
  return { type, id, name: nameOf(doc) } satisfies PublicCounterparty;
}

function inheritedFrom(
  type: PublicInheritedFrom["type"],
  doc: Doc | null,
  id: ObjectId,
): PublicInheritedFrom {
  return { type, id, name: nameOf(doc) };
}

function validityOf(doc: Doc): PublicValidity {
  const raw = (doc.validity ?? doc.scope ?? {}) as Record<string, unknown>;
  const precision = stringOf(raw.datePrecision);
  return {
    validFrom: dateOf(raw.validFrom),
    validTo: dateOf(raw.validTo),
    datePrecision: precision === "EXACT" || precision === "MONTH" || precision === "YEAR" ||
        precision === "APPROXIMATE"
      ? precision
      : "UNKNOWN",
  };
}

function publicWordingOf(doc: Doc, kind: FindingKind): string {
  const wording = stringOf(doc.publicWording);
  if (wording !== undefined) return wording;
  if (kind === "CLAIM") return stringOf(doc.statement) ?? "Statement not available.";
  const predicate = stringOf(doc.predicate) ?? "UNKNOWN";
  return `A ${predicate.replaceAll("_", " ").toLowerCase()} relationship is recorded.`;
}

function publicUrl(source: Doc | null, snapshot: Doc): string | undefined {
  const captured = stringOf(snapshot.canonicalUrlAtCapture);
  const canonical = source === null ? undefined : stringOf(source.canonicalUrl);
  return captured ?? canonical;
}

function isPublicSource(source: Doc | null): boolean {
  if (source === null) return false;
  if (source.access !== "PUBLIC") return false;
  return source.lifecycle === "ACTIVE" || source.recordLifecycle === "ACTIVE";
}

function isPublicAsset(asset: Doc | null): boolean {
  if (asset === null) return true;
  return asset.visibility === "PUBLIC" &&
    asset.processingStatus === "CLEAN" &&
    asset.lifecycle === "ACTIVE" &&
    asset.legalHold !== true;
}

async function evidenceFor(
  db: Db,
  doc: Doc,
  used: Doc[],
  unknowns: PublicUnknown[],
  findingId: ObjectId,
): Promise<PublicEvidenceView[]> {
  const links = Array.isArray(doc.evidence) ? doc.evidence as Doc[] : [];
  const views: PublicEvidenceView[] = [];
  for (const link of links.slice(0, MAX_EVIDENCE)) {
    const snapshotId = idOf(link.sourceSnapshotId);
    if (snapshotId === null) {
      unknowns.push({
        code: PUBLIC_UNKNOWN_CODES.EVIDENCE_WITHHELD,
        message:
          `Evidence for finding ${findingId.toString()} is withheld because its snapshot reference is invalid.`,
      });
      continue;
    }
    const snapshot = await db.collection("source_snapshots").findOne({ _id: snapshotId });
    if (!snapshot || snapshot.lifecycle !== "AVAILABLE") {
      unknowns.push({
        code: PUBLIC_UNKNOWN_CODES.EVIDENCE_WITHHELD,
        message:
          `Evidence for finding ${findingId.toString()} is withheld because its capture is unavailable.`,
      });
      continue;
    }
    used.push({ ...snapshot, __publicCollection: "source_snapshots" });
    const sourceId = idOf((snapshot.source as Doc | undefined)?._id);
    const source = sourceId === null
      ? null
      : await db.collection("sources").findOne({ _id: sourceId });
    if (!isPublicSource(source as Doc | null)) {
      unknowns.push({
        code: PUBLIC_UNKNOWN_CODES.EVIDENCE_WITHHELD,
        message:
          `Evidence for finding ${findingId.toString()} is withheld because its source is not public.`,
      });
      continue;
    }
    used.push({ ...(source as Doc), __publicCollection: "sources" });
    const assetId = idOf(snapshot.assetId);
    if (assetId !== null) {
      const asset = await db.collection("assets").findOne({ _id: assetId });
      if (!isPublicAsset(asset as Doc | null)) {
        unknowns.push({
          code: PUBLIC_UNKNOWN_CODES.EVIDENCE_WITHHELD,
          message:
            `Evidence for finding ${findingId.toString()} is withheld because its asset is not public.`,
        });
        continue;
      }
      used.push({ ...(asset as Doc), __publicCollection: "assets" });
    }
    const sourceDoc = source as Doc;
    views.push({
      sourceTitle: stringOf(sourceDoc.title) ?? stringOf(snapshot.titleAtCapture) ??
        "Untitled source",
      ...(stringOf(sourceDoc.publisherName)
        ? { publisherName: String(sourceDoc.publisherName) }
        : {}),
      capturedAt: dateOf(snapshot.retrievedAt) ?? new Date(0),
      publishedAt: dateOf(snapshot.publishedAt),
      ...(stringOf(link.excerpt) ? { excerpt: String(link.excerpt) } : {}),
      ...(link.locator && typeof link.locator === "object"
        ? { locator: link.locator as Record<string, unknown> }
        : {}),
      stance: (stringOf(link.stance) ?? "NEUTRAL") as PublicEvidenceView["stance"],
      ...(publicUrl(sourceDoc, snapshot)
        ? { publicSourceUrl: publicUrl(sourceDoc, snapshot) }
        : {}),
      isRedacted: snapshot.redaction !== undefined && snapshot.redaction !== null,
    });
  }
  if (links.length > MAX_EVIDENCE) {
    unknowns.push({
      code: PUBLIC_UNKNOWN_CODES.EVIDENCE_WITHHELD,
      message:
        `Some evidence for finding ${findingId.toString()} is withheld by the public evidence cap.`,
    });
  }
  return views;
}

async function responsesFor(
  db: Db,
  doc: Doc,
  used: Doc[],
): Promise<PublicResponseView[]> {
  const responses = Array.isArray(doc.organizationResponses)
    ? doc.organizationResponses as Doc[]
    : [];
  const views: PublicResponseView[] = [];
  for (const response of responses.slice(0, MAX_RESPONSES)) {
    if (response.publicationStatus !== "PUBLIC") continue;
    const orgId = idOf(response.respondingOrganizationId);
    const org = orgId === null
      ? null
      : await db.collection("organizations").findOne({ _id: orgId });
    if (orgId !== null && org) used.push({ ...org, __publicCollection: "organizations" });
    const verification = (response.representativeVerification ?? {}) as Doc;
    views.push({
      organizationName: org === null ? "Organization" : nameOf(org as Doc),
      responseText: stringOf(response.responseText) ?? "",
      submittedAt: dateOf(response.submittedAt) ?? new Date(0),
      representativeVerified: verification.status === "VERIFIED",
    });
  }
  return views;
}

function rightOfReplyFor(doc: Doc): PublicRightOfReply {
  const solicitations = Array.isArray(doc.responseSolicitations)
    ? doc.responseSolicitations as Doc[]
    : [];
  if (solicitations.length === 0) return { solicited: false };
  const latest = solicitations.reduce((left, right) => {
    const leftAt = dateOf(left.sentAt)?.getTime() ?? 0;
    const rightAt = dateOf(right.sentAt)?.getTime() ?? 0;
    return rightAt >= leftAt ? right : left;
  });
  return {
    solicited: true,
    ...(stringOf(latest.outcome)
      ? { outcome: latest.outcome as PublicRightOfReply["outcome"] }
      : {}),
    ...(dateOf(latest.responseDeadline)
      ? { deadline: dateOf(latest.responseDeadline) as Date }
      : {}),
  };
}

async function correctionNoticeFor(
  db: Db,
  kind: FindingKind,
  findingId: ObjectId,
  used: Doc[],
): Promise<PublicCorrectionNotice | undefined> {
  const corrections = await db.collection("corrections").find({
    "target.type": kind,
    "target.id": findingId,
    "application.result": "APPLIED",
  }).sort({ "application.appliedAt": -1 }).limit(5).toArray();
  for (const correction of corrections) {
    const notice = (correction.publicNotice ?? {}) as Doc;
    if (
      !(notice.correctedAt instanceof Date) ||
      !(notice.auditEventId instanceof ObjectId) ||
      typeof notice.reason !== "string" ||
      typeof notice.previousWording !== "string"
    ) continue;
    used.push({ ...correction, __publicCollection: "corrections" });
    return {
      correctedAt: notice.correctedAt,
      reason: notice.reason,
      previousWording: notice.previousWording,
      auditEventId: notice.auditEventId,
    };
  }
  return undefined;
}

async function entityName(
  db: Db,
  type: string,
  id: ObjectId,
  used: Doc[],
): Promise<string> {
  const collection = type === "PRODUCT"
    ? "products"
    : type === "BRAND"
    ? "brands"
    : type === "ORGANIZATION"
    ? "organizations"
    : type === "RELATIONSHIP"
    ? "relationships"
    : type === "CLAIM"
    ? "claims"
    : null;
  if (collection === null) return "Unknown";
  const doc = await db.collection(collection).findOne({ _id: id });
  if (!doc) return "Unknown";
  used.push({ ...doc, __publicCollection: collection });
  if (collection === "relationships") {
    const predicate = stringOf(doc.predicate) ?? "RELATIONSHIP";
    return predicate.replaceAll("_", " ").toLowerCase();
  }
  if (collection === "claims") {
    return stringOf(doc.publicWording) ?? stringOf(doc.statement) ??
      "Claim";
  }
  return nameOf(doc as Doc);
}

async function counterpartiesFor(
  db: Db,
  doc: Doc,
  kind: FindingKind,
  used: Doc[],
): Promise<PublicCounterparty[]> {
  if (kind === "RELATIONSHIP") {
    const refs = [doc.subject, doc.object].filter((item) => item && typeof item === "object");
    const values: PublicCounterparty[] = [];
    for (const raw of refs as Doc[]) {
      const type = raw.type as PublicCounterparty["type"];
      const id = idOf(raw.id);
      if (id === null) continue;
      values.push(counterparty(type, { name: await entityName(db, type, id, used) } as Doc, id));
    }
    return values;
  }
  const refs = [doc.about, ...(Array.isArray(doc.relatedEntities) ? doc.relatedEntities : [])]
    .filter((item) => item && typeof item === "object") as Doc[];
  const values: PublicCounterparty[] = [];
  for (const raw of refs) {
    const type = raw.type as PublicCounterparty["type"];
    const id = idOf(raw.id);
    if (id === null || (type as string) === "RELATIONSHIP") continue;
    values.push(counterparty(type, { name: await entityName(db, type, id, used) } as Doc, id));
  }
  return values;
}

async function findingView(
  db: Db,
  candidate: Candidate,
  used: Doc[],
  unknowns: PublicUnknown[],
): Promise<PublicFindingView> {
  const { doc, kind, scope, inheritedFrom: source } = candidate;
  const findingId = doc._id as ObjectId;
  used.push({ ...doc, __publicCollection: kind === "CLAIM" ? "claims" : "relationships" });
  const assessment = (doc.assessment ?? {}) as Doc;
  const publication = (doc.publication ?? {}) as Doc;
  const review = (doc.review ?? {}) as Doc;
  const correctionNotice = await correctionNoticeFor(db, kind, findingId, used);
  return {
    findingId,
    findingKind: kind,
    scope,
    ...(source ? { inheritedFrom: source } : {}),
    ...(kind === "RELATIONSHIP" && stringOf(doc.predicate)
      ? { predicate: doc.predicate as PublicFindingView["predicate"] }
      : {}),
    ...(kind === "CLAIM" && stringOf(doc.claimType)
      ? { claimType: doc.claimType as PublicFindingView["claimType"] }
      : {}),
    publicWording: publicWordingOf(doc, kind),
    counterparties: await counterpartiesFor(db, doc, kind, used),
    validity: validityOf(doc),
    assessmentOutcome: (stringOf(assessment.outcome) ??
      "NOT_ASSESSED") as PublicFindingView["assessmentOutcome"],
    limitations: Array.isArray(assessment.limitations)
      ? assessment.limitations.map(String) as PublicFindingView["limitations"]
      : [],
    publishedAt: dateOf(publication.publishedAt) ?? dateOf(publication.decidedAt) ??
      dateOf(doc.updatedAt) ?? new Date(0),
    ...(dateOf(review.lastActionAt) ?? dateOf(assessment.assessedAt)
      ? { lastReviewedAt: (dateOf(review.lastActionAt) ?? dateOf(assessment.assessedAt)) as Date }
      : {}),
    evidence: await evidenceFor(db, doc, used, unknowns, findingId),
    organizationResponses: await responsesFor(db, doc, used),
    rightOfReply: rightOfReplyFor(doc),
    ...(correctionNotice ? { correctionNotice } : {}),
  };
}

function isPublishedActive(doc: Doc): boolean {
  const publication = (doc.publication ?? {}) as Doc;
  const lifecycle = doc.recordLifecycle ?? doc.lifecycle;
  return publication.status === "PUBLISHED" && lifecycle === "ACTIVE";
}

function addUnknown(unknowns: PublicUnknown[], code: string, message: string): void {
  if (!unknowns.some((item) => item.code === code && item.message === message)) {
    unknowns.push({ code, message });
  }
}

function scopeForCandidate(
  kind: FindingKind,
  doc: Doc,
  productId: ObjectId,
  brandId: ObjectId | null,
  orgIds: ReadonlySet<string>,
): PublicScope | null {
  if (kind === "CLAIM") {
    const about = (doc.about ?? {}) as Doc;
    const id = idOf(about.id);
    if (id === null) return null;
    if (about.type === "PRODUCT" && id.equals(productId)) return "PRODUCT";
    if (about.type === "BRAND" && brandId !== null && id.equals(brandId)) return "BRAND";
    if (about.type === "ORGANIZATION" && orgIds.has(id.toString())) return "ORGANIZATION";
    return null;
  }
  const subject = (doc.subject ?? {}) as Doc;
  const object = (doc.object ?? {}) as Doc;
  const subjectId = idOf(subject.id);
  const objectId = idOf(object.id);
  if (subjectId === null || objectId === null) return null;
  const ends = [
    { type: subject.type, id: subjectId },
    { type: object.type, id: objectId },
  ];
  if (ends.some((end) => end.type === "PRODUCT" && end.id.equals(productId))) return "PRODUCT";
  if (brandId !== null && ends.some((end) => end.type === "BRAND" && end.id.equals(brandId))) {
    return "BRAND";
  }
  if (ends.some((end) => end.type === "ORGANIZATION" && orgIds.has(end.id.toString()))) {
    return "ORGANIZATION";
  }
  return null;
}

function inheritedFor(
  scope: PublicScope,
  brandDoc: Doc | null,
  brandId: ObjectId | null,
  orgDoc: Doc | null,
  orgId: ObjectId | null,
): PublicInheritedFrom | undefined {
  if (scope === "PRODUCT") return undefined;
  if (scope === "BRAND" && brandId !== null) {
    return inheritedFrom("BRAND", brandDoc, brandId);
  }
  if (scope === "ORGANIZATION" && orgId !== null) {
    return inheritedFrom("ORGANIZATION", orgDoc, orgId);
  }
  return undefined;
}

async function productFindings(
  db: Db,
  productId: ObjectId,
  brandId: ObjectId | null,
  brandDoc: Doc | null,
  orgIds: ReadonlySet<string>,
  orgDocs: ReadonlyMap<string, Doc>,
  used: Doc[],
  unknowns: PublicUnknown[],
): Promise<PublicFindingView[]> {
  const brandFilter = brandId === null ? [] : [{ "about.type": "BRAND", "about.id": brandId }];
  const orgIdList = [...orgIds].map((id) => new ObjectId(id));
  const relationshipFilters: Doc[] = [
    { "subject.type": "PRODUCT", "subject.id": productId },
    { "object.type": "PRODUCT", "object.id": productId },
  ];
  if (brandId !== null) {
    relationshipFilters.push(
      { "subject.type": "BRAND", "subject.id": brandId },
      { "object.type": "BRAND", "object.id": brandId },
    );
  }
  if (orgIdList.length > 0) {
    relationshipFilters.push(
      { "subject.type": "ORGANIZATION", "subject.id": { $in: orgIdList } },
      { "object.type": "ORGANIZATION", "object.id": { $in: orgIdList } },
    );
  }
  const claimFilters: Doc[] = [
    { "about.type": "PRODUCT", "about.id": productId },
    ...brandFilter,
  ];
  if (orgIdList.length > 0) {
    claimFilters.push({ "about.type": "ORGANIZATION", "about.id": { $in: orgIdList } });
  }

  const claims = await db.collection("claims").find({
    $or: claimFilters,
    "publication.status": "PUBLISHED",
    recordLifecycle: "ACTIVE",
  }).limit(MAX_FINDINGS).toArray();
  const relationships = await db.collection("relationships").find({
    $or: relationshipFilters,
    "publication.status": "PUBLISHED",
    recordLifecycle: "ACTIVE",
  }).limit(MAX_FINDINGS).toArray();

  const candidates: Candidate[] = [];
  for (const claim of claims) {
    const scope = scopeForCandidate(
      "CLAIM",
      claim as Doc,
      productId,
      brandId,
      orgIds,
    );
    if (scope === null) continue;
    const orgId = scope === "ORGANIZATION" ? idOf(((claim.about ?? {}) as Doc).id) : null;
    const orgDoc = orgId === null ? null : orgDocs.get(orgId.toString()) ?? null;
    candidates.push({
      doc: claim as Doc,
      kind: "CLAIM",
      scope,
      inheritedFrom: inheritedFor(scope, brandDoc, brandId, orgDoc, orgId),
    });
  }
  for (const relationship of relationships) {
    const doc = relationship as Doc;
    // An Organization-to-Organization edge is a third hop from the Product and
    // must never become an ultimate-ownership conclusion (I11).
    const subject = (doc.subject ?? {}) as Doc;
    const object = (doc.object ?? {}) as Doc;
    const orgToOrg = subject.type === "ORGANIZATION" && object.type === "ORGANIZATION";
    const scope = orgToOrg ? null : scopeForCandidate(
      "RELATIONSHIP",
      doc,
      productId,
      brandId,
      orgIds,
    );
    if (scope === null) continue;
    const orgId = scope === "ORGANIZATION"
      ? [subject, object].find((end) => end.type === "ORGANIZATION")?.id as ObjectId | undefined ??
        null
      : null;
    const orgDoc = orgId === null ? null : orgDocs.get(orgId.toString()) ?? null;
    candidates.push({
      doc,
      kind: "RELATIONSHIP",
      scope,
      inheritedFrom: inheritedFor(scope, brandDoc, brandId, orgDoc, orgId),
    });
  }

  // Claims about an included relationship are part of that finding's context.
  const includedRelationshipIds = candidates
    .filter((candidate) => candidate.kind === "RELATIONSHIP")
    .map((candidate) => candidate.doc._id as ObjectId);
  if (includedRelationshipIds.length > 0) {
    const relatedClaims = await db.collection("claims").find({
      "about.type": "RELATIONSHIP",
      "about.id": { $in: includedRelationshipIds },
      "publication.status": "PUBLISHED",
      recordLifecycle: "ACTIVE",
    }).limit(MAX_FINDINGS).toArray();
    for (const claim of relatedClaims) {
      const aboutId = idOf(((claim.about ?? {}) as Doc).id);
      const parent = candidates.find((candidate) =>
        candidate.kind === "RELATIONSHIP" && aboutId !== null &&
        candidate.doc._id instanceof ObjectId && candidate.doc._id.equals(aboutId)
      );
      if (!parent) continue;
      candidates.push({
        doc: claim as Doc,
        kind: "CLAIM",
        scope: parent.scope,
        inheritedFrom: parent.inheritedFrom,
      });
    }
  }

  const byId = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (!isPublishedActive(candidate.doc)) continue;
    const id = idOf(candidate.doc._id);
    if (id === null) continue;
    const key = `${candidate.kind}:${id.toString()}`;
    const existing = byId.get(key);
    if (existing === undefined || SCOPE_RANK[candidate.scope] < SCOPE_RANK[existing.scope]) {
      byId.set(key, candidate);
    }
  }

  const views: PublicFindingView[] = [];
  for (
    const candidate of [...byId.values()].sort((left, right) => {
      const leftAt = dateIso((left.doc.publication as Doc | undefined)?.publishedAt) ?? "";
      const rightAt = dateIso((right.doc.publication as Doc | undefined)?.publishedAt) ?? "";
      if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
      return String(left.doc._id).localeCompare(String(right.doc._id));
    })
  ) {
    const view = await findingView(db, candidate, used, unknowns);
    if (view.evidence.length === 0) {
      addUnknown(
        unknowns,
        PUBLIC_UNKNOWN_CODES.MISSING_EVIDENCE,
        `Finding ${view.findingId.toString()} has no publicly accessible evidence.`,
      );
    }
    if (!view.validity.validFrom && !view.validity.validTo) {
      addUnknown(
        unknowns,
        PUBLIC_UNKNOWN_CODES.MISSING_VALIDITY_DATES,
        `Finding ${view.findingId.toString()} has no recorded validity dates; its current status is unknown.`,
      );
    }
    views.push(view);
  }
  return views;
}

async function brandAndOrganizations(
  db: Db,
  product: Doc,
  used: Doc[],
  unknowns: PublicUnknown[],
): Promise<{
  brandId: ObjectId | null;
  brandDoc: Doc | null;
  orgIds: Set<string>;
  orgDocs: Map<string, Doc>;
}> {
  const embeddedBrand = (product.brand ?? {}) as Doc;
  const brandId = idOf(embeddedBrand._id);
  if (brandId === null) {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.MISSING_BRAND,
      "This product is not yet mapped to a brand; brand-level findings cannot be shown.",
    );
    return { brandId: null, brandDoc: null, orgIds: new Set(), orgDocs: new Map() };
  }
  const brandDoc = await db.collection("brands").findOne({ _id: brandId });
  if (!brandDoc) {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.MISSING_BRAND,
      "The mapped brand record is unavailable; brand-level findings cannot be shown.",
    );
    return { brandId, brandDoc: null, orgIds: new Set(), orgDocs: new Map() };
  }
  used.push({ ...brandDoc, __publicCollection: "brands" });

  // Exactly one further hop: Brand <-> Organization through a published edge.
  const edges = await db.collection("relationships").find({
    $or: [
      { "subject.type": "BRAND", "subject.id": brandId },
      { "object.type": "BRAND", "object.id": brandId },
    ],
    "publication.status": "PUBLISHED",
    recordLifecycle: "ACTIVE",
  }).limit(50).toArray();
  const orgIds = new Set<string>();
  const orgDocs = new Map<string, Doc>();
  for (const edge of edges) {
    const doc = edge as Doc;
    const subject = (doc.subject ?? {}) as Doc;
    const object = (doc.object ?? {}) as Doc;
    const other = subject.type === "ORGANIZATION"
      ? subject
      : object.type === "ORGANIZATION"
      ? object
      : null;
    if (!other) continue;
    const orgId = idOf(other.id);
    if (orgId === null || orgIds.has(orgId.toString())) continue;
    const org = await db.collection("organizations").findOne({ _id: orgId });
    if (!org) continue;
    orgIds.add(orgId.toString());
    orgDocs.set(orgId.toString(), org as Doc);
    used.push({ ...org, __publicCollection: "organizations" });
  }
  return { brandId, brandDoc: brandDoc as Doc, orgIds, orgDocs };
}

export async function assemblePublicProfile(input: {
  db: Db;
  resolution: ResolutionResult;
  now?: Date;
}): Promise<AssemblyResult> {
  const unknowns: PublicUnknown[] = [];
  const used: Doc[] = [];
  const base: PublicProductProfile = {
    resolution: input.resolution,
    findings: [],
    unknowns,
    noUniversalScore: true,
    builtAt: new Date(0),
  };

  if (input.resolution.state === "NOT_FOUND") {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.PRODUCT_NOT_FOUND,
      "No product matches this identifier.",
    );
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.CONTRIBUTION_GUIDANCE,
      "You can contribute a package photo or the brand printed on the package to create the first record.",
    );
    return { profile: base, sourceVersions: {}, used };
  }
  if (input.resolution.state === "AMBIGUOUS") {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.AMBIGUOUS_IDENTIFIER,
      "More than one product matches this identifier; choose a candidate rather than guessing.",
    );
    return { profile: base, sourceVersions: {}, used };
  }

  const productId = input.resolution.productId;
  if (input.resolution.state === "DISPUTED") {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.UNRESOLVED_DISPUTE,
      `This identifier is disputed: ${input.resolution.disputeNote}`,
    );
  }
  if (input.resolution.state === "UNVERIFIED") {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.UNVERIFIED_IDENTIFIER,
      "This identifier has not been verified; the identity is provisional.",
    );
  }

  const product = await input.db.collection("products").findOne({ _id: productId });
  if (!product) {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.PRODUCT_NOT_FOUND,
      "The resolved product record is unavailable.",
    );
    return { profile: base, sourceVersions: {}, used };
  }
  used.push({ ...product, __publicCollection: "products" });
  const productDoc = product as Doc;

  if (productDoc.lifecycle === "MERGED") {
    const survivorId = idOf(productDoc.mergedIntoId);
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.MERGED_IDENTITY_REDIRECT,
      survivorId === null
        ? "This product was merged into another identity."
        : `This product was merged; use product ${survivorId.toString()} instead.`,
    );
  }

  const identifiers = Array.isArray(productDoc.identifiers) ? productDoc.identifiers as Doc[] : [];
  const approved = identifiers.filter((identifier) =>
    identifier.status === "VERIFIED" && typeof identifier.scheme === "string" &&
    typeof identifier.value === "string"
  ).slice(0, 20).map((identifier) => ({
    scheme: String(identifier.scheme),
    value: String(identifier.value),
  }));
  if (identifiers.some((identifier) => identifier.status === "DISPUTED")) {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.UNRESOLVED_DISPUTE,
      "At least one identifier for this product is disputed.",
    );
  }
  if (identifiers.some((identifier) => identifier.status === "UNVERIFIED")) {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.UNVERIFIED_IDENTIFIER,
      "At least one identifier for this product is unverified.",
    );
  }
  const brandMapping = (productDoc.brandMapping ?? {}) as Doc;
  const productView: PublicProductIdentity = {
    id: productId,
    name: stringOf(productDoc.name) ?? "Unnamed product",
    ...(productDoc.packaging && typeof productDoc.packaging === "object"
      ? { packaging: productDoc.packaging as Record<string, unknown> }
      : {}),
    identifiersApprovedForDisplay: approved,
    brandMappingStatus: stringOf(brandMapping.status) ?? "UNREVIEWED",
    ...(stringOf(productDoc.categoryCode) ? { categoryCode: String(productDoc.categoryCode) } : {}),
  };
  base.product = productView;

  const { brandId, brandDoc, orgIds, orgDocs } = await brandAndOrganizations(
    input.db,
    productDoc,
    used,
    unknowns,
  );
  if (brandId !== null && brandDoc !== null) {
    base.brand = {
      id: brandId,
      name: nameOf(brandDoc),
    } satisfies PublicBrandView;
  }

  const findings = await productFindings(
    input.db,
    productId,
    brandId,
    brandDoc,
    orgIds,
    orgDocs,
    used,
    unknowns,
  );
  base.findings = findings;
  if (findings.length === 0) {
    addUnknown(
      unknowns,
      PUBLIC_UNKNOWN_CODES.NO_PUBLISHED_FINDINGS,
      "No reviewed findings have been published for this product yet.",
    );
  }

  return {
    profile: { ...base, builtAt: canonicalBuiltAt(used) },
    sourceVersions: buildSourceVersions(used),
    used,
  };
}

export const PUBLIC_PROFILE_DISCLAIMERS = PUBLIC_PROFILE_LIMITATIONS;
