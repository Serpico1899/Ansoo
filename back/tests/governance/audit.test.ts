// Plan 07 - Append-only audit repository (I09), redaction, and DB privilege spec.
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import {
  appendAuditEvent,
  AUDIT_SUMMARY_ALLOWLIST,
  auditRepository,
  listAuditEvents,
} from "../../utils/governance/audit.ts";
import { AUDIT_ACTIONS, type AuditAction } from "../../utils/domain/constants.ts";
import { AUDIT_APP_PRIVILEGES, auditRoleSpec } from "../../utils/governance/auditPrivileges.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

async function actor(h: Awaited<ReturnType<typeof createHarness>>, roles = ["ADMIN"]) {
  const _id = new ObjectId();
  await h.db.collection("users").insertOne({
    _id,
    accountStatus: "ACTIVE",
    roles,
    trustLevel: "REGULAR",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { type: "USER" as const, id: _id };
}

async function product(h: Awaited<ReturnType<typeof createHarness>>) {
  const _id = new ObjectId();
  await h.db.collection("products").insertOne({
    _id,
    name: "Audit Product",
    normalizedName: "audit product",
    matchKey: "auditproduct",
    identifiers: [],
    brandMapping: { status: "UNREVIEWED" },
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return _id;
}

async function rejection(promise: Promise<unknown>): Promise<{ code: string; status?: number }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; status?: number };
  }
  throw new Error("expected rejection");
}

Deno.test({
  name: "I09 - AuditEvent is append-only",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan07_audit");
    try {
      const writer = await actor(h);
      const productId = await product(h);

      await t.step("appends and lists through the closed repository", async () => {
        assertEquals(Object.keys(auditRepository).sort(), ["append", "list"]);
        const auditId = await appendAuditEvent(h.db, {
          action: "ENTITY_UPDATED",
          target: { type: "PRODUCT", id: productId },
          actor: writer,
          targetVersionBefore: 1,
          targetVersionAfter: 2,
          beforeSummary: { name: "Old" },
          afterSummary: { name: "New" },
          changedPaths: ["name"],
          requestId: "req-1",
          correlationId: "corr-1",
          now: new Date("2026-05-01T00:00:00Z"),
        });
        const rows = await listAuditEvents(h.db, {
          target: { type: "PRODUCT", id: productId },
          action: "ENTITY_UPDATED",
        });
        assertEquals(rows.length, 1);
        assertEquals(rows[0]._id.toString(), auditId.toString());
        assertEquals(rows[0].requestId, "req-1");
        assertEquals(rows[0].correlationId, "corr-1");
      });

      await t.step("rejects unknown actions and unregistered targets", async () => {
        assertEquals(
          (await rejection(appendAuditEvent(h.db, {
            action: "CREATE" as AuditAction,
            target: { type: "PRODUCT", id: productId },
            actor: writer,
          }))).code,
          "INVALID_AUDIT_ACTION",
        );
        assertEquals(
          (await rejection(appendAuditEvent(h.db, {
            action: "ENTITY_UPDATED",
            target: { type: "PRODUCT", id: new ObjectId() },
            actor: writer,
          }))).code,
          "NOT_FOUND",
        );
        assertEquals(
          (await rejection(appendAuditEvent(h.db, {
            action: "ENTITY_UPDATED",
            target: { type: "CATEGORY" as "PRODUCT", id: productId },
            actor: writer,
          }))).code,
          "UNKNOWN_TYPE",
        );
      });

      await t.step("rejects nested, array, forbidden-key, and secret summaries", async () => {
        for (
          const summary of [
            { name: { value: 1 } },
            { name: ["a"] },
            { email: "person@example.test" },
            { name: "token=super-secret" },
            { name: "contact person@example.test" },
            { name: "Authorization: Bearer abc.def.ghi" },
            { name: "mongodb://user:password@db.example.test" },
          ]
        ) {
          const error = await rejection(appendAuditEvent(h.db, {
            action: "ENTITY_UPDATED",
            target: { type: "PRODUCT", id: productId },
            actor: writer,
            afterSummary: summary as unknown as Record<string, string>,
          }));
          assert(
            ["INVALID_AUDIT_SUMMARY", "AUDIT_SUMMARY_FORBIDDEN_KEY", "AUDIT_SECRET_REDACTED"]
              .includes(error.code),
            `unexpected code ${error.code}`,
          );
        }
      });

      await t.step("rejects non-allowlisted summary keys per action", async () => {
        const error = await rejection(appendAuditEvent(h.db, {
          action: "ENTITY_UPDATED",
          target: { type: "PRODUCT", id: productId },
          actor: writer,
          afterSummary: { passwordHash: "x" },
        }));
        assertEquals(error.code, "AUDIT_SUMMARY_FORBIDDEN_KEY");
        const unknown = await rejection(appendAuditEvent(h.db, {
          action: "ENTITY_UPDATED",
          target: { type: "PRODUCT", id: productId },
          actor: writer,
          afterSummary: { unrelated: "x" },
        }));
        assertEquals(unknown.code, "AUDIT_SUMMARY_KEY_NOT_ALLOWED");
      });

      await t.step("every closed action has an explicit summary allowlist", () => {
        assertEquals(Object.keys(AUDIT_SUMMARY_ALLOWLIST).sort(), [...AUDIT_ACTIONS].sort());
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test("audit: production role denies update and delete at the DB layer", () => {
  const auditPrivilege = AUDIT_APP_PRIVILEGES.find((item) =>
    item.resource.collection === "audit_events"
  );
  assert(auditPrivilege);
  assertEquals([...auditPrivilege.actions].sort(), ["find", "insert"]);
  assert(!auditPrivilege.actions.includes("update" as never));
  assert(!auditPrivilege.actions.includes("remove" as never));
  const role = auditRoleSpec("ansoo");
  const roleAudit = role.privileges.find((item) => item.resource.collection === "audit_events");
  assert(roleAudit);
  assertEquals([...roleAudit.actions].sort(), ["find", "insert"]);
});
