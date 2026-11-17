// v3.1 hard-cap and closed-write enforcement.
//
// Superstruct attaches these checks to shared fields so the generated API and
// domain actions reject excess data instead of slicing it. Every over-limit
// path is a 422 CAP_EXCEEDED (or DUPLICATE_VALUE) error; nothing is discarded.

import {
  CAPTURE_METADATA_ALLOWED_KEYS,
  CAPTURE_METADATA_MAX_DEPTH,
  CAPTURE_METADATA_MAX_KEYS,
  CHARACTER_CAPS,
  type CharacterCapKey,
  HARD_CAPS,
  type HardCapKey,
} from "./constants.ts";

export type CapErrorCode = "CAP_EXCEEDED" | "DUPLICATE_VALUE";

export class CapExceededError extends Error {
  readonly status = 422 as const;

  constructor(
    readonly code: CapErrorCode,
    readonly path: string,
    readonly cap: number,
    readonly actual: number,
    message?: string,
  ) {
    super(
      message ??
        `${code}: ${path} exceeds ${cap} (actual ${actual})`,
    );
    this.name = "CapExceededError";
  }
}

export class DomainValidationError extends Error {
  readonly status = 422 as const;

  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainValidationError";
  }
}

export function assertHardCap(path: HardCapKey, actual: number): void {
  const cap = HARD_CAPS[path];
  if (actual > cap) {
    throw new CapExceededError("CAP_EXCEEDED", path, cap, actual);
  }
}

export function assertCharacterCap(path: CharacterCapKey, value: string): void {
  const cap = CHARACTER_CAPS[path];
  if (value.length > cap) {
    throw new CapExceededError("CAP_EXCEEDED", path, cap, value.length);
  }
}

export function assertUniqueBy<T>(
  items: readonly T[],
  path: string,
  keyOf: (item: T) => string,
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) {
      throw new CapExceededError(
        "DUPLICATE_VALUE",
        path,
        items.length,
        items.length,
        `DUPLICATE_VALUE: ${path} contains duplicate ${key}`,
      );
    }
    seen.add(key);
  }
}

function metadataDepth(value: unknown, depth: number): number {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return depth;
  let max = depth;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    max = Math.max(max, metadataDepth(nested, depth + 1));
  }
  return max;
}

function assertPrimitiveLeaves(value: unknown, path: string): void {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    throw new CapExceededError(
      "CAP_EXCEEDED",
      path,
      CAPTURE_METADATA_MAX_DEPTH,
      CAPTURE_METADATA_MAX_DEPTH + 1,
      `CAP_EXCEEDED: ${path} may not contain arrays`,
    );
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (!(CAPTURE_METADATA_ALLOWED_KEYS as readonly string[]).includes(key)) {
        throw new CapExceededError(
          "CAP_EXCEEDED",
          path,
          CAPTURE_METADATA_ALLOWED_KEYS.length,
          CAPTURE_METADATA_ALLOWED_KEYS.length + 1,
          `CAP_EXCEEDED: ${path}.${key} is not an allowlisted captureMetadata key`,
        );
      }
      assertPrimitiveLeaves(nested, `${path}.${key}`);
    }
    return;
  }
  throw new CapExceededError(
    "CAP_EXCEEDED",
    path,
    CAPTURE_METADATA_MAX_DEPTH,
    CAPTURE_METADATA_MAX_DEPTH + 1,
    `CAP_EXCEEDED: ${path} is not a scalar metadata value`,
  );
}

export function assertCaptureMetadata(value: unknown): void {
  if (value === undefined) return;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainValidationError(
      "INVALID_CAPTURE_METADATA",
      "captureMetadata must be an object",
    );
  }
  const record = value as Record<string, unknown>;
  const keyCount = Object.keys(record).length;
  if (keyCount > CAPTURE_METADATA_MAX_KEYS) {
    throw new CapExceededError(
      "CAP_EXCEEDED",
      "captureMetadata",
      CAPTURE_METADATA_MAX_KEYS,
      keyCount,
    );
  }
  const depth = metadataDepth(record, 1);
  if (depth > CAPTURE_METADATA_MAX_DEPTH) {
    throw new CapExceededError(
      "CAP_EXCEEDED",
      "captureMetadata",
      CAPTURE_METADATA_MAX_DEPTH,
      depth,
    );
  }
  for (const key of Object.keys(record)) {
    if (!(CAPTURE_METADATA_ALLOWED_KEYS as readonly string[]).includes(key)) {
      throw new CapExceededError(
        "CAP_EXCEEDED",
        "captureMetadata",
        CAPTURE_METADATA_ALLOWED_KEYS.length,
        CAPTURE_METADATA_ALLOWED_KEYS.length + 1,
        `CAP_EXCEEDED: captureMetadata.${key} is not allowlisted`,
      );
    }
  }
  assertPrimitiveLeaves(record, "captureMetadata");
}

const DOC_ARRAY_CAPS: Record<string, Record<string, HardCapKey>> = {
  products: {
    identifiers: "identifiers",
    localizedNames: "localizedNames",
    attributes: "attributes",
  },
  brands: {
    aliases: "aliases",
    localizedNames: "localizedNames",
  },
  organizations: {
    aliases: "aliases",
    localizedNames: "localizedNames",
    identifiers: "identifiers",
  },
  relationships: {
    evidence: "evidence",
    organizationResponses: "organizationResponses",
    responseSolicitations: "responseSolicitations",
    researchNotes: "researchNotes",
    recentRevisionPreview: "recentRevisionPreview",
  },
  claims: {
    relatedEntities: "relatedEntities",
    localizedStatements: "localizedNames",
    evidence: "evidence",
    organizationResponses: "organizationResponses",
    responseSolicitations: "responseSolicitations",
    researchNotes: "researchNotes",
    recentRevisionPreview: "recentRevisionPreview",
  },
  corrections: {
    evidenceReferences: "evidenceReferences",
  },
};

const DOC_UNIQUE_KEYS: Record<
  string,
  Record<string, (item: Record<string, unknown>) => string>
> = {
  products: {
    identifiers: (item) =>
      `${String(item.scheme)}|${String(item.normalizedValue)}|${String(item.jurisdiction ?? "")}`,
    localizedNames: (item) => String(item.locale),
    attributes: (item) => `${String(item.key)}|${String(item.locale ?? "")}`,
  },
  brands: {
    aliases: (item) => String(item.matchKey),
    localizedNames: (item) => String(item.locale),
  },
  organizations: {
    aliases: (item) => String(item.matchKey),
    localizedNames: (item) => String(item.locale),
    identifiers: (item) =>
      `${String(item.scheme)}|${String(item.normalizedValue)}|${String(item.jurisdiction ?? "")}`,
  },
  claims: {
    relatedEntities: (item) => `${String(item.type)}|${String(item.id)}`,
    localizedStatements: (item) => String(item.locale),
    recentRevisionPreview: (item) => String(item.version),
  },
  corrections: {
    evidenceReferences: (item) =>
      `${String(item.sourceSnapshotId ?? "")}|${String(item.assetId ?? "")}|${
        String(item.url ?? "")
      }`,
  },
};

const CHARACTER_KEYS: Record<string, CharacterCapKey> = {
  excerpt: "excerpt",
  statement: "statement",
  publicWording: "publicWording",
  rationale: "rationale",
  responseText: "responseText",
  body: "noteBody",
};

function walk(value: unknown, visit: (key: string, value: unknown) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    visit(key, nested);
    walk(nested, visit);
  }
}

export function assertDocumentCaps(collection: string, doc: unknown): void {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new DomainValidationError("INVALID_DOCUMENT", "document must be an object");
  }
  const record = doc as Record<string, unknown>;

  for (const [field, capKey] of Object.entries(DOC_ARRAY_CAPS[collection] ?? {})) {
    const value = record[field];
    if (!Array.isArray(value)) continue;
    assertHardCap(capKey, value.length);
    const uniqueKey = DOC_UNIQUE_KEYS[collection]?.[field];
    if (uniqueKey) {
      assertUniqueBy(
        value as Record<string, unknown>[],
        field,
        uniqueKey,
      );
    }
  }

  if (collection === "source_snapshots") {
    assertCaptureMetadata(record.captureMetadata);
  }

  walk(record, (key, value) => {
    if (typeof value !== "string") return;
    const capKey = CHARACTER_KEYS[key];
    if (capKey) assertCharacterCap(capKey, value);
  });
}

export const FORBIDDEN_PATCH_FIELDS = ["version", "_id", "createdAt", "createdBy"] as const;

export function assertUpdatePatch(patch: Record<string, unknown>): void {
  for (const field of FORBIDDEN_PATCH_FIELDS) {
    if (field in patch) {
      throw new DomainValidationError(
        "FORBIDDEN_PATCH_FIELD",
        `patch must never contain ${field}`,
        { field },
      );
    }
  }
}
