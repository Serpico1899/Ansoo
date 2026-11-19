import { object, optional, refine, string, unknown } from "lesan";
import type { Struct } from "lesan";

export const getPublicProfileValidator = refine(
  object({
    set: object({
      id: optional(string()),
      gtin: optional(string()),
    }),
    get: optional(unknown()),
  }) as unknown as Struct<unknown, unknown>,
  "public_profile_lookup",
  (value: unknown) => {
    const set = (value as { set?: { id?: string; gtin?: string } }).set;
    const hasId = set?.id !== undefined;
    const hasGtin = set?.gtin !== undefined;
    return hasId !== hasGtin ? true : "exactly one of id or gtin is required";
  },
);
