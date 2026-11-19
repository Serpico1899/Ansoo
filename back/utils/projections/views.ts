// Plan 08 - allowlisted Public / Research / Admin views.
//
// These builders are the only way an API action should return canonical data.
// A published finding never unlocks a restricted source or private asset.
import { ObjectId } from "lesan";
import type { AuthActor } from "../auth/capabilities.ts";
import {
  type CanonicalCollection,
  projectDocument,
  type ProjectionLevel,
} from "./classification.ts";

export class ProjectionError extends Error {
  constructor(
    readonly code:
      | "INACTIVE_SNAPSHOT"
      | "RESTRICTED_SOURCE"
      | "PRIVATE_ASSET"
      | "UNSAFE_ASSET",
    message: string,
  ) {
    super(message);
    this.name = "ProjectionError";
  }
}

type Doc = Record<string, unknown>;

export type PublicCitation = {
  sourceSnapshotId: string;
  sourceTitle: string;
  sourceType: string;
  canonicalUrl?: string;
  retrievedAt?: Date;
  contentHash?: string;
};

function idOf(value: unknown): string | null {
  if (value instanceof ObjectId) return value.toString();
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function isActive(doc: Doc): boolean {
  return doc.recordLifecycle === "ACTIVE" ||
    (doc.recordLifecycle === undefined && doc.lifecycle === "ACTIVE");
}

export function publicCitation(input: {
  snapshot: Doc;
  source: Doc;
  asset?: Doc | null;
}): PublicCitation {
  if (!isActive(input.snapshot) || input.snapshot.lifecycle === "INACTIVE") {
    throw new ProjectionError("INACTIVE_SNAPSHOT", "citation snapshot is not active");
  }
  if (input.source.access !== "PUBLIC" || !isActive(input.source)) {
    throw new ProjectionError("RESTRICTED_SOURCE", "citation source is not public");
  }
  if (input.asset) {
    if (input.asset.visibility !== "PUBLIC" || !isActive(input.asset)) {
      throw new ProjectionError("PRIVATE_ASSET", "citation asset is not public");
    }
    if (input.asset.processingStatus !== "CLEAN") {
      throw new ProjectionError("UNSAFE_ASSET", "citation asset is not cleared");
    }
  }
  const snapshotId = idOf(input.snapshot._id);
  if (snapshotId === null) {
    throw new ProjectionError("INACTIVE_SNAPSHOT", "citation snapshot id is missing");
  }
  return {
    sourceSnapshotId: snapshotId,
    sourceTitle: String(input.source.title ?? ""),
    sourceType: String(input.source.sourceType ?? ""),
    ...(typeof input.source.canonicalUrl === "string"
      ? { canonicalUrl: input.source.canonicalUrl }
      : {}),
    ...(input.snapshot.retrievedAt instanceof Date
      ? { retrievedAt: input.snapshot.retrievedAt }
      : {}),
    ...(typeof input.snapshot.contentHash === "string"
      ? { contentHash: input.snapshot.contentHash }
      : {}),
  };
}

function citationIds(citations: readonly PublicCitation[]): Set<string> {
  return new Set(citations.map((citation) => citation.sourceSnapshotId));
}

function publicResponses(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.filter((response) => {
    const doc = response as Doc;
    return doc.publicationStatus === "PUBLIC";
  });
}

function publicFindingDoc(
  doc: Doc,
  citations: readonly PublicCitation[],
): Doc {
  const allowed = citationIds(citations);
  const evidence = Array.isArray(doc.evidence)
    ? doc.evidence.filter((link) => {
      const sourceSnapshotId = idOf((link as Doc).sourceSnapshotId);
      return sourceSnapshotId !== null && allowed.has(sourceSnapshotId);
    })
    : [];
  return {
    ...doc,
    evidence,
    organizationResponses: publicResponses(doc.organizationResponses),
  };
}

export function publicClaimView(
  doc: Doc | null,
  citations: readonly PublicCitation[],
): Doc | null {
  if (doc === null) return null;
  if (!isActive(doc) || (doc.publication as Doc | undefined)?.status !== "PUBLISHED") {
    return null;
  }
  return projectDocument("claims", publicFindingDoc(doc, citations), "PUBLIC");
}

export function publicRelationshipView(
  doc: Doc | null,
  citations: readonly PublicCitation[],
): Doc | null {
  if (doc === null) return null;
  if (!isActive(doc) || (doc.publication as Doc | undefined)?.status !== "PUBLISHED") {
    return null;
  }
  return projectDocument(
    "relationships",
    publicFindingDoc(doc, citations),
    "PUBLIC",
  );
}

export function publicProductView(doc: Doc | null): {
  outcome: "ACTIVE" | "MERGED" | "NOT_FOUND";
  product: Doc | null;
  redirectTo?: string;
} {
  if (doc === null) return { outcome: "NOT_FOUND", product: null };
  const mergedIntoId = idOf(doc.mergedIntoId);
  if (doc.lifecycle === "MERGED" && mergedIntoId !== null) {
    return {
      outcome: "MERGED",
      product: {
        _id: idOf(doc._id),
        lifecycle: "MERGED",
        mergedIntoId,
      },
      redirectTo: mergedIntoId,
    };
  }
  if (doc.lifecycle !== "ACTIVE") return { outcome: "NOT_FOUND", product: null };
  return {
    outcome: "ACTIVE",
    product: projectDocument("products", doc, "PUBLIC"),
  };
}

export function publicAssetView(doc: Doc | null): Doc | null {
  if (doc === null) return null;
  if (
    doc.visibility !== "PUBLIC" ||
    doc.processingStatus !== "CLEAN" ||
    doc.lifecycle !== "ACTIVE"
  ) {
    return null;
  }
  return projectDocument("assets", doc, "PUBLIC");
}

export function publicCorrectionNotice(input: {
  correction: Doc;
  auditEventId: unknown;
  previousWording: string;
  correctedAt?: Date;
}): Doc {
  return {
    correctionId: idOf(input.correction._id),
    target: input.correction.target,
    correctedAt: input.correctedAt ?? new Date(),
    reason: String(input.correction.reason ?? ""),
    previousWording: input.previousWording,
    auditEventId: idOf(input.auditEventId),
  };
}

export function publicUserSelfView(actor: AuthActor): Doc {
  return {
    _id: actor.id,
    ...(actor.displayName === undefined ? {} : { displayName: actor.displayName }),
    ...(actor.preferredLocale === undefined ? {} : { preferredLocale: actor.preferredLocale }),
    roles: actor.roles,
  };
}

export function projectAtLevel(
  collection: CanonicalCollection,
  doc: Doc | null,
  level: ProjectionLevel,
): Doc | null {
  if (doc === null) return null;
  return projectDocument(collection, doc, level);
}
