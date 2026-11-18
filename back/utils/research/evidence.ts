// Evidence aggregation for the sensitivity matrix and PublicationGate.
// EvidenceLink is pinned to a SourceSnapshot; independence is a property of
// publisher AND origin, never a count of links.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { createEntityRegistry } from "../identity/registry.ts";

export type EvidenceEntry = {
  snapshotId: ObjectId;
  sourceId: ObjectId;
  sourceType: string;
  acquisitionTier: string;
  access: string;
  publisherKey: string | null;
  originKey: string | null;
  official: boolean;
  officialRegistry: boolean;
  publisherVerified: boolean;
  stance: string;
};

export type EvidenceEvaluation = {
  count: number;
  entries: EvidenceEntry[];
  invalidSnapshotIds: ObjectId[];
  verifiedSnapshots: number;
  officialCount: number;
  officialRegistrySnapshots: number;
  independentSources: number;
  evidenceCountOk: boolean;
  independentSourcesOk: boolean;
  minimumOk: boolean;
};

function normalizedKey(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.trim().toLowerCase();
}

function hostOf(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const OFFICIAL_TYPES = [
  "OFFICIAL_REGISTRY",
  "GOVERNMENT_DOCUMENT",
  "LEGAL_INSTRUMENT",
] as const;

export async function evaluateEvidence(
  db: Db,
  links: unknown,
  sensitivity: "ROUTINE" | "SENSITIVE" | "HIGH_RISK",
): Promise<EvidenceEvaluation> {
  const list = Array.isArray(links) ? links : [];
  const registry = createEntityRegistry(db);
  const seen = new Set<string>();
  const entries: EvidenceEntry[] = [];
  const invalidSnapshotIds: ObjectId[] = [];

  for (const raw of list) {
    if (raw === null || typeof raw !== "object") {
      invalidSnapshotIds.push(new ObjectId());
      continue;
    }
    const link = raw as Record<string, unknown>;
    const snapshotId = link.sourceSnapshotId instanceof ObjectId
      ? link.sourceSnapshotId
      : typeof link.sourceSnapshotId === "string" && /^[a-f0-9]{24}$/i.test(link.sourceSnapshotId)
      ? new ObjectId(link.sourceSnapshotId)
      : null;
    if (!snapshotId) {
      invalidSnapshotIds.push(new ObjectId());
      continue;
    }
    if (seen.has(snapshotId.toString())) continue;
    seen.add(snapshotId.toString());

    let snapshot: Record<string, unknown> & { _id: ObjectId };
    try {
      const resolved = await registry.resolve("evidence.sourceSnapshotId", {
        type: "SOURCE_SNAPSHOT",
        id: snapshotId,
      });
      snapshot = resolved.doc;
    } catch {
      invalidSnapshotIds.push(snapshotId);
      continue;
    }
    if (snapshot.lifecycle !== "AVAILABLE") {
      invalidSnapshotIds.push(snapshotId);
      continue;
    }
    const embeddedSource = snapshot.source && typeof snapshot.source === "object"
      ? snapshot.source as Record<string, unknown>
      : undefined;
    const sourceId = embeddedSource?._id instanceof ObjectId ? embeddedSource._id : undefined;
    if (!sourceId) {
      invalidSnapshotIds.push(snapshotId);
      continue;
    }
    const source = await db.collection("sources").findOne({ _id: sourceId });
    if (!source || source.lifecycle === "ARCHIVED") {
      invalidSnapshotIds.push(snapshotId);
      continue;
    }
    const publisherKey = normalizedKey(source.publisherOrganizationId) ??
      normalizedKey(source.publisherName);
    const originKey = hostOf(source.canonicalUrl);
    const sourceType = String(source.sourceType ?? "");
    const acquisitionTier = String(snapshot.acquisitionTier ?? "");
    const publisherVerified = source.publisherVerified === true;
    const officialRegistry = sourceType === "OFFICIAL_REGISTRY" &&
      (acquisitionTier === "A_OFFICIAL_MACHINE_READABLE" ||
        acquisitionTier === "B_OFFICIAL_PUBLIC_LOOKUP") &&
      publisherVerified;
    const official = (OFFICIAL_TYPES as readonly string[]).includes(sourceType) ||
      officialRegistry;
    entries.push({
      snapshotId,
      sourceId,
      sourceType,
      acquisitionTier,
      access: String(source.access ?? ""),
      publisherKey,
      originKey,
      official,
      officialRegistry,
      publisherVerified,
      stance: String(link.stance ?? ""),
    });
  }

  const verifiedSnapshots = entries.filter((entry) => entry.publisherVerified).length;
  const officialCount = entries.filter((entry) => entry.official).length;
  const officialRegistrySnapshots = entries.filter((entry) => entry.officialRegistry).length;
  const independentEligible = entries.filter((entry) => entry.publisherKey && entry.originKey);
  const uniquePublishers = new Set(independentEligible.map((entry) => entry.publisherKey));
  const uniqueOrigins = new Set(independentEligible.map((entry) => entry.originKey));
  const independentSources = Math.min(uniquePublishers.size, uniqueOrigins.size);

  const evidenceCountOk = entries.length >= 1;
  const independentSourcesOk = sensitivity === "ROUTINE"
    ? true
    : (independentSources >= 2 || officialRegistrySnapshots >= 1);
  const minimumOk = sensitivity === "ROUTINE"
    ? verifiedSnapshots >= 1
    : sensitivity === "SENSITIVE"
    ? independentSourcesOk
    : independentSources >= 2 && officialCount >= 1;

  return {
    count: entries.length,
    entries,
    invalidSnapshotIds,
    verifiedSnapshots,
    officialCount,
    officialRegistrySnapshots,
    independentSources,
    evidenceCountOk,
    independentSourcesOk,
    minimumOk,
  };
}
