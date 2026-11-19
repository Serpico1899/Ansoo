import { object, optional, unknown } from "lesan";

export const getMeValidator = object({
  set: object({}),
  get: optional(unknown()),
});
