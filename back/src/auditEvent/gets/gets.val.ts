import { number, object, optional, unknown } from "lesan";

export const getsValidator = object({
  set: object({
    limit: optional(number()),
  }),
  get: optional(unknown()),
});
