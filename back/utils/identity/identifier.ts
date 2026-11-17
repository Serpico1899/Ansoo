// Identifier normalization. Spec 13.2 and 5.1/5.3.
//
// Values are strings: leading zeros survive. GTIN is fully validated. All other
// schemes fail closed until authoritative scheme rules are supplied.
import {
  IDENTIFIER_STATUSES,
  type IdentifierStatus,
  ORGANIZATION_IDENTIFIER_SCHEMES,
  PRODUCT_IDENTIFIER_SCHEMES,
} from "../domain/constants.ts";

export class IdentifierError extends Error {
  constructor(
    readonly code:
      | "UNKNOWN_SCHEME"
      | "UNSUPPORTED_SCHEME"
      | "INVALID_VALUE"
      | "INVALID_GTIN"
      | "INVALID_STATUS_TRANSITION",
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = "IdentifierError";
  }
}

export type ProductIdentifierScheme = typeof PRODUCT_IDENTIFIER_SCHEMES[number];
export type OrganizationIdentifierScheme = typeof ORGANIZATION_IDENTIFIER_SCHEMES[number];

export type NormalizedProductIdentifier = {
  scheme: "GTIN";
  value: string;
  normalizedValue: string;
  matchValue: string;
};

export function gtinCheckDigit(body: string): number {
  let sum = 0;
  let weight = 3;
  for (let index = body.length - 1; index >= 0; index--) {
    sum += Number(body[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(value: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(value)) return false;
  return gtinCheckDigit(value.slice(0, -1)) === Number(value.at(-1));
}

function assertScheme<T extends string>(
  scheme: string,
  supported: readonly T[],
): asserts scheme is T {
  if (!(supported as readonly string[]).includes(scheme)) {
    throw new IdentifierError("UNKNOWN_SCHEME", `unsupported identifier scheme: ${scheme}`);
  }
}

export function normalizeProductIdentifier(
  scheme: string,
  raw: string,
): NormalizedProductIdentifier {
  assertScheme(scheme, PRODUCT_IDENTIFIER_SCHEMES);
  if (typeof raw !== "string") {
    throw new IdentifierError("INVALID_VALUE", "identifier value must be a string");
  }
  if (scheme !== "GTIN") {
    throw new IdentifierError(
      "UNSUPPORTED_SCHEME",
      `scheme ${scheme} is blocked until its character and checksum rules are supplied`,
    );
  }
  const value = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(value) || !isValidGtin(value)) {
    throw new IdentifierError("INVALID_GTIN", "value is not a valid GTIN");
  }
  return {
    scheme: "GTIN",
    value,
    normalizedValue: value,
    matchValue: value.padStart(14, "0"),
  };
}

export function normalizeOrganizationIdentifier(
  scheme: string,
  _raw: string,
): never {
  assertScheme(scheme, ORGANIZATION_IDENTIFIER_SCHEMES);
  throw new IdentifierError(
    "UNSUPPORTED_SCHEME",
    `scheme ${scheme} is blocked until its character and checksum rules are supplied`,
  );
}

export function identifierKey(input: {
  scheme: ProductIdentifierScheme | OrganizationIdentifierScheme;
  normalizedValue: string;
}): string {
  if (
    !(PRODUCT_IDENTIFIER_SCHEMES as readonly string[]).includes(input.scheme) &&
    !(ORGANIZATION_IDENTIFIER_SCHEMES as readonly string[]).includes(input.scheme)
  ) {
    throw new IdentifierError("UNKNOWN_SCHEME", `unsupported identifier scheme: ${input.scheme}`);
  }
  return `${input.scheme}|${input.normalizedValue}`;
}

const ALLOWED_TRANSITIONS: Record<IdentifierStatus, readonly IdentifierStatus[]> = {
  UNVERIFIED: ["UNVERIFIED", "VERIFIED", "DISPUTED", "RETIRED"],
  VERIFIED: ["VERIFIED", "DISPUTED", "RETIRED"],
  DISPUTED: ["DISPUTED", "VERIFIED", "RETIRED"],
  RETIRED: ["RETIRED"],
};

export function validateIdentifierStatusTransition(
  from: IdentifierStatus,
  to: IdentifierStatus,
): void {
  if (!IDENTIFIER_STATUSES.includes(from) || !IDENTIFIER_STATUSES.includes(to)) {
    throw new IdentifierError("INVALID_VALUE", "unknown identifier status");
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new IdentifierError(
      "INVALID_STATUS_TRANSITION",
      `cannot move identifier from ${from} to ${to}`,
    );
  }
}

export function gs1PrefixMetadata(value: string): {
  prefix: string;
  inference: "FORBIDDEN";
} {
  return { prefix: value.slice(0, 3), inference: "FORBIDDEN" };
}
