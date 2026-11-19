import { object, optional, string, unknown } from "lesan";

export const getResearchValidator = object({
  set: object({
    id: string(),
  }),
  get: optional(unknown()),
});
