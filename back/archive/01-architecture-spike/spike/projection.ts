// Explicit public projections.
//
// A client-supplied `get` never selects these fields. These builders are the
// only way a public response is produced.
import type { Document } from "lesan";

const PUBLIC_PRODUCT_KEYS = [
  "_id",
  "name",
  "normalizedName",
  "localizedNames",
  "brandMapping",
  "packaging",
  "attributes",
  "recordLifecycle",
] as const;

function pick<T extends Record<string, unknown>>(
  doc: T,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in doc) out[key] = doc[key];
  }
  return out;
}

function publicIdentifiers(identifiers: unknown): unknown[] {
  if (!Array.isArray(identifiers)) return [];
  return identifiers.map((identifier) => {
    const value = identifier as Record<string, unknown>;
    return {
      scheme: value.scheme,
      value: value.value,
      normalizedValue: value.normalizedValue,
      jurisdiction: value.jurisdiction,
      issuer: value.issuer,
      status: value.status,
      validFrom: value.validFrom,
      validTo: value.validTo,
      // sourceSnapshotIds intentionally omitted: they can reveal restricted sources.
    };
  });
}

export function publicBrand(brand: unknown) {
  if (!brand || typeof brand !== "object" || Array.isArray(brand)) return null;
  const doc = brand as Record<string, unknown>;
  return {
    _id: doc._id,
    name: doc.name,
    normalizedName: doc.normalizedName,
    aliases: doc.aliases ?? [],
    website: doc.website,
    // internalNotes deliberately omitted.
  };
}

export function publicCategory(category: unknown) {
  if (!category || typeof category !== "object" || Array.isArray(category)) {
    return null;
  }
  const doc = category as Record<string, unknown>;
  return {
    _id: doc._id,
    code: doc.code,
    name: doc.name,
    normalizedName: doc.normalizedName,
    depth: doc.depth,
    taxonomyVersion: doc.taxonomyVersion,
    // ancestorIds and internal taxonomy details omitted from the public view.
  };
}

function publicEvidence(evidence: unknown): unknown[] {
  if (!Array.isArray(evidence)) return [];
  return evidence.map((item) => {
    const doc = item as Record<string, unknown>;
    return {
      stance: doc.stance,
      locator: doc.locator,
      excerpt: doc.excerpt,
      rationale: doc.rationale,
      // reviewerId and raw sourceSnapshotId omitted; citations resolved separately.
    };
  });
}

function publicResponses(responses: unknown): unknown[] {
  if (!Array.isArray(responses)) return [];
  return responses
    .filter((item) => {
      const pub = (item as Record<string, unknown>).publication as
        | Record<string, unknown>
        | undefined;
      return !pub || pub.status === "PUBLISHED";
    })
    .map((item) => {
      const doc = item as Record<string, unknown>;
      return {
        respondingOrganizationId: doc.respondingOrganizationId,
        statement: doc.statement,
        receivedAt: doc.receivedAt,
        authorityVerified: doc.authorityVerified,
      };
    });
}

export function publicRelationship(doc: Document) {
  return {
    _id: doc._id,
    subject: doc.subject,
    predicate: doc.predicate,
    object: doc.object,
    context: doc.context,
    validity: doc.validity,
    assessment: { outcome: doc.assessment?.outcome },
    publication: { status: doc.publication?.status },
    evidence: publicEvidence(doc.evidence),
    organizationResponses: publicResponses(doc.organizationResponses),
    // researchNotes omitted.
  };
}

export function publicClaim(doc: Document) {
  return {
    _id: doc._id,
    about: doc.about,
    claimType: doc.claimType,
    statement: doc.statement,
    localizedStatements: doc.localizedStatements ?? [],
    scope: doc.scope,
    assessment: { outcome: doc.assessment?.outcome },
    publication: { status: doc.publication?.status },
    evidence: publicEvidence(doc.evidence),
    organizationResponses: publicResponses(doc.organizationResponses),
    // researchNotes omitted.
  };
}

export interface PublicProfileInput {
  product: Document;
  relationships?: Document[];
  claims?: Document[];
  unknowns?: string[];
  conflicts?: string[];
}

export function buildPublicProductProfile(input: PublicProfileInput) {
  const product = input.product;
  const relationships = (input.relationships ?? [])
    .filter((doc) =>
      doc.publication?.status === "PUBLISHED" &&
      doc.recordLifecycle === "ACTIVE"
    )
    .map(publicRelationship);
  const claims = (input.claims ?? [])
    .filter((doc) =>
      doc.publication?.status === "PUBLISHED" &&
      doc.recordLifecycle === "ACTIVE"
    )
    .map(publicClaim);

  return {
    product: {
      ...pick(product, PUBLIC_PRODUCT_KEYS),
      identifiers: publicIdentifiers(product.identifiers),
      brand: publicBrand(product.brand),
      category: publicCategory(product.category),
    },
    relationships,
    claims,
    unknowns: input.unknowns ?? [],
    conflicts: input.conflicts ?? [],
    limitations: [
      "A relationship or barcode does not by itself establish a legal or ethical conclusion.",
      "Unknown dates remain unknown; validTo null does not prove a statement is current.",
    ],
    // No universal verdict field exists by design.
  };
}

// A published finding does not make a restricted capture public. Citations are
// guarded independently of the finding's publication status.
export function publicCitation(input: {
  snapshot: Record<string, unknown>;
  source: Record<string, unknown>;
  asset?: Record<string, unknown> | null;
}) {
  if (input.snapshot.recordLifecycle !== "ACTIVE") {
    throw new Error("citation snapshot is not active");
  }
  if (input.source.access !== "PUBLIC") {
    throw new Error("citation source is not public");
  }
  if (input.source.recordLifecycle !== "ACTIVE") {
    throw new Error("citation source is not active");
  }
  if (input.asset) {
    if (input.asset.visibility !== "PUBLIC") {
      throw new Error("citation asset is not public");
    }
    if (input.asset.processingStatus !== "CLEAN") {
      throw new Error("citation asset is not cleared");
    }
  }
  return {
    sourceTitle: input.source.title,
    sourceType: input.source.sourceType,
    canonicalUrl: input.source.canonicalUrl,
    retrievedAt: input.snapshot.retrievedAt,
    contentHash: input.snapshot.contentHash,
  };
}
