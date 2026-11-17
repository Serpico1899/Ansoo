// Plan 03 - corrections, users, and append-only audit contracts.
import { assert, assertEquals, assertThrows } from "@std/assert";
import { ObjectId } from "lesan";
import { accepts } from "./assertions.ts";
import {
  assertAuditSummary,
  auditEventStruct,
  validateAuditEvent,
} from "../../models/auditEvent.ts";
import { correctionStruct, validateCorrection } from "../../models/correction.ts";
import { userStruct } from "../../models/user.ts";
import {
  assertUpdatePatch,
  CapExceededError,
  DomainValidationError,
} from "../../utils/domain/caps.ts";
import { HARD_CAPS, USER_ROLES } from "../../utils/domain/constants.ts";

const target = { type: "PRODUCT", id: new ObjectId() };
const actor = { type: "USER", id: new ObjectId() };

function correctionDoc(overrides: Record<string, unknown> = {}) {
  return {
    target,
    submissionKind: "CORRECT_EXISTING",
    proposedChange: { fieldKey: "name", operation: "SET", proposedValue: "Corrected" },
    reason: "The package label confirms the name.",
    evidenceReferences: [],
    submittedBy: new ObjectId(),
    submittedAt: new Date(),
    idempotencyKey: "correction-1",
    status: "PENDING",
    review: {},
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function auditDoc(overrides: Record<string, unknown> = {}) {
  return {
    eventSchemaVersion: 1,
    actor,
    action: "ENTITY_CREATED",
    target,
    changedPaths: ["name"],
    beforeSummary: { name: "old" },
    afterSummary: { name: "new", active: true, count: 1, note: null },
    occurredAt: new Date(),
    ...overrides,
  };
}

Deno.test("governance: correction target is optional only for ADD_MISSING", () => {
  assert(accepts(correctionStruct, correctionDoc()));
  assert(accepts(
    correctionStruct,
    correctionDoc({
      target: undefined,
      submissionKind: "ADD_MISSING",
      proposedChange: undefined,
    }),
  ));
  assert(!accepts(correctionStruct, correctionDoc({ submissionKind: "OTHER_REVIEWED" })));
  assert(
    !accepts(
      correctionStruct,
      correctionDoc({
        proposedChange: { fieldKey: "name", operation: "PATCH", proposedValue: "x" },
      }),
    ),
  );
  assert(
    !accepts(correctionStruct, correctionDoc({ target: { type: "USER", id: new ObjectId() } })),
  );
});

Deno.test("governance: correction evidence reference cap is enforced", () => {
  const evidenceReferences = Array.from({ length: HARD_CAPS.evidenceReferences }, (_, index) => ({
    sourceSnapshotId: new ObjectId(),
    note: `ref ${index}`,
  }));
  validateCorrection(correctionDoc({ evidenceReferences }));
  const error = assertThrows(
    () =>
      validateCorrection(correctionDoc({
        evidenceReferences: [
          ...evidenceReferences,
          { url: "https://example.test" },
        ],
      })),
    CapExceededError,
  );
  assertEquals(error.status, 422);
  assertEquals(error.path, "evidenceReferences");
});

Deno.test("governance: users have exactly six roles and trust is separate", () => {
  assertEquals([...USER_ROLES], [
    "CONTRIBUTOR",
    "RESEARCHER",
    "RESEARCH_REVIEWER",
    "LEGAL_REVIEWER",
    "MODERATOR",
    "ADMIN",
  ]);
  const user = {
    authProvider: "local",
    authSubject: "subject-1",
    roles: ["CONTRIBUTOR"],
    trustLevel: "NEW",
    accountStatus: "PENDING",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  assert(accepts(userStruct, user));
  assert(!accepts(userStruct, { ...user, roles: ["SUPERADMIN"] }));
  assert(!accepts(userStruct, { ...user, trustLevel: "ADMIN" }));
  assert(!accepts(userStruct, { ...user, roles: ["ADMIN"], trustLevel: "ADMIN" }));
});

Deno.test("governance: audit summaries are flat and redact forbidden keys", () => {
  assertAuditSummary({ name: "Ansoo", count: 1, active: true, note: null });
  assertThrows(() => assertAuditSummary({ nested: { value: 1 } }), DomainValidationError);
  assertThrows(() => assertAuditSummary({ list: ["a"] }), DomainValidationError);
  for (
    const key of ["email", "phone", "authSubject", "passwordHash", "registeredAddress", "token"]
  ) {
    assertThrows(
      () => assertAuditSummary({ [key]: "secret" }),
      DomainValidationError,
      key,
    );
  }
});

Deno.test("governance: audit events are append-only in shape", () => {
  assert(accepts(auditEventStruct, auditDoc()));
  validateAuditEvent(auditDoc());
  assert(!accepts(auditEventStruct, auditDoc({ version: 1 })));
  assert(!accepts(auditEventStruct, auditDoc({ action: "CREATE" })));
  assertThrows(
    () => validateAuditEvent(auditDoc({ beforeSummary: { nested: { value: 1 } } })),
    DomainValidationError,
  );
});

Deno.test("governance: forbidden update patch fields are rejected", () => {
  for (const field of ["version", "_id", "createdAt", "createdBy"]) {
    const error = assertThrows(
      () => assertUpdatePatch({ [field]: "x" }),
      DomainValidationError,
    );
    assertEquals(error.status, 422);
  }
  assertUpdatePatch({ name: "new", updatedAt: new Date() });
});
