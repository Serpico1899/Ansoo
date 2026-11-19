import { object, optional, refine, string, unknown } from "lesan";
import type { Struct } from "lesan";

export const getPublicProfileValidator = refine(
  object({
    set: object({
      id: optional(string()),
      gtin: optional(string()),
      scheme: optional(string()),
      value: optional(string()),
      jurisdiction: optional(string()),
      issuer: optional(string()),
    }),
    get: optional(unknown()),
  }) as unknown as Struct<unknown, unknown>,
  "public_profile_lookup",
  (value: unknown) => {
    const set = (value as {
      set?: {
        id?: string;
        gtin?: string;
        scheme?: string;
        value?: string;
        jurisdiction?: string;
        issuer?: string;
      };
    }).set;
    const hasId = set?.id !== undefined;
    const hasGtin = set?.gtin !== undefined;
    const hasScheme = set?.scheme !== undefined;
    const hasValue = set?.value !== undefined;
    if (set?.jurisdiction !== undefined && !hasScheme) return "jurisdiction requires scheme";
    if (set?.issuer !== undefined && !hasScheme) return "issuer requires scheme";
    const identifierPair = hasScheme && hasValue;
    const count = Number(hasId) + Number(hasGtin) + Number(identifierPair);
    if (count !== 1) return "exactly one of id, gtin, or scheme+value is required";
    if (hasScheme !== hasValue) return "scheme and value must be supplied together";
    return true;
  },
);
