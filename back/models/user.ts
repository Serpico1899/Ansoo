// users - consumer/contributor and internal staff accounts. Spec 9.2.
//
// All PII lives here. roles is authorization; trustLevel is not.

import { array, assert, date, enums, optional, string } from "lesan";
import { assertDocumentCaps } from "../utils/domain/caps.ts";
import { ACCOUNT_STATUSES, TRUST_LEVELS, USER_ROLES } from "../utils/domain/constants.ts";
import { docMetaFields, documentStruct } from "./shared.ts";

export const userFields = {
  authProvider: string(),
  authSubject: string(),
  email: optional(string()),
  emailNormalized: optional(string()),
  phone: optional(string()),
  displayName: optional(string()),
  preferredLocale: optional(string()),
  roles: array(enums(USER_ROLES)),
  trustLevel: enums(TRUST_LEVELS),
  accountStatus: enums(ACCOUNT_STATUSES),
  lastActiveAt: optional(date()),
  ...docMetaFields(),
};

export const userStruct = documentStruct(userFields);

export function validateUser(doc: unknown): void {
  assertDocumentCaps("users", doc);
  assert(doc, userStruct);
}
