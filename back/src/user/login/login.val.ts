import { object, optional, string, unknown } from "lesan";

export const loginValidator = object({
  set: object({
    providerToken: string(),
  }),
  get: optional(unknown()),
});
