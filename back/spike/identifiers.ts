// Exact identifier normalization and resolution.
//
// Values stay strings so leading zeroes survive. A GS1 prefix is never used to
// infer country, ownership, nationality, or legal/ethical status.
import { type Db } from "lesan";

export const IDENTIFIER_SCHEMES = {
  GTIN_8: { length: 8, kind: "gtin" },
  GTIN_12: { length: 12, kind: "gtin" },
  GTIN_13: { length: 13, kind: "gtin" },
  GTIN_14: { length: 14, kind: "gtin" },
  ISBN_13: { length: 13, kind: "ean" },
} as const;

export type IdentifierScheme = keyof typeof IDENTIFIER_SCHEMES;

export type ResolutionOutcome =
  | "MATCH"
  | "NOT_FOUND"
  | "AMBIGUOUS"
  | "DISPUTED"
  | "UNVERIFIED"
  | "RETIRED";

export class IdentifierError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "IdentifierError";
  }
}

export function gtinCheckDigit(body: string): number {
  let sum = 0;
  let weight = 3;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(value: string, length: number): boolean {
  if (!new RegExp(`^\\d{${length}}$`).test(value)) return false;
  const body = value.slice(0, -1);
  return gtinCheckDigit(body) === Number(value.at(-1));
}

export function normalizeIdentifier(
  scheme: string,
  raw: string,
): { scheme: IdentifierScheme; normalizedValue: string } {
  if (!(scheme in IDENTIFIER_SCHEMES)) {
    throw new IdentifierError("UNKNOWN_SCHEME", "unsupported identifier scheme");
  }
  if (typeof raw !== "string") {
    throw new IdentifierError("INVALID_VALUE", "identifier value must be a string");
  }
  const digits = raw.replace(/[\s-]/g, "");
  const definition = IDENTIFIER_SCHEMES[scheme as IdentifierScheme];

  if (definition.kind === "gtin") {
    if (!isValidGtin(digits, definition.length)) {
      throw new IdentifierError(
        "INVALID_GTIN",
        `value is not a valid ${scheme}`,
      );
    }
  } else if (definition.kind === "ean") {
    if (!/^\d{13}$/.test(digits) || !isValidGtin(digits, 13)) {
      throw new IdentifierError("INVALID_EAN", "value is not a valid ISBN-13");
    }
  }

  return { scheme: scheme as IdentifierScheme, normalizedValue: digits };
}

export interface Resolution {
  outcome: ResolutionOutcome;
  productId?: string;
  candidates?: string[];
}

export async function resolveIdentifier(
  db: Db,
  input: { scheme: string; value: string; jurisdiction?: string },
): Promise<Resolution> {
  const { scheme, normalizedValue } = normalizeIdentifier(input.scheme, input.value);

  // Keys inside $elemMatch are relative to the array element.
  const match: Record<string, unknown> = {
    scheme,
    normalizedValue,
  };
  if (input.jurisdiction !== undefined) {
    match.jurisdiction = input.jurisdiction;
  }

  const docs = await db.collection("products").find(
    { identifiers: { $elemMatch: match } },
    { projection: { _id: 1, "identifiers.$": 1 } },
  ).limit(20).toArray();

  if (docs.length === 0) return { outcome: "NOT_FOUND" };
  if (docs.length > 1) {
    return { outcome: "AMBIGUOUS", candidates: docs.map((d) => d._id.toString()) };
  }

  const doc = docs[0];
  const identifier = (doc.identifiers as Array<Record<string, unknown>>)[0];
  const status = identifier.status;
  if (status === "DISPUTED") {
    return { outcome: "DISPUTED", productId: doc._id.toString() };
  }
  if (status === "UNVERIFIED") {
    return { outcome: "UNVERIFIED", productId: doc._id.toString() };
  }
  if (status === "RETIRED") {
    return { outcome: "RETIRED", productId: doc._id.toString() };
  }
  return { outcome: "MATCH", productId: doc._id.toString() };
}

// The GS1 prefix is metadata only. This function exists to make the forbidden
// inference explicit and testable; it never returns a country or ownership.
export function gs1PrefixMetadata(value: string): {
  prefix: string;
  inference: "FORBIDDEN";
} {
  return { prefix: value.slice(0, 3), inference: "FORBIDDEN" };
}

export function normalizeSearchName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/\s+/g, " ")
    .trim();
}
