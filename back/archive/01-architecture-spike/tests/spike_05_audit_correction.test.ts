// Spike task 8: append-only audit and safe correction application.
import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, seedEntity, seedUser } from "../spike/harness.ts";
import { CorrectionError } from "../spike/correction.ts";

async function expectCorrectionCode(
  fn: () => Promise<unknown>,
  code: string,
) {
  try {
    await fn();
  } catch (error) {
    if (error instanceof CorrectionError) {
      assertEquals(error.code, code);
      return;
    }
    throw error;
  }
  throw new Error(`expected CorrectionError code ${code}`);
}

Deno.test({
  name: "spike: audit is append-only and corrections apply exactly once",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_audit");
    try {
      const userId = await seedUser(h, { roles: ["MODERATOR"] });
      const productId = await seedEntity(h, "product", {
        name: "Original Name",
        version: 1,
      });

      await t.step("audit writes redact secrets and group by request", async () => {
        const eventId = await h.audit.appendAudit({
          actor: { type: "user", id: userId },
          action: "UPDATE",
          target: { type: "product", id: productId },
          requestId: "req-1",
          correlationId: "corr-1",
          targetVersionBefore: 1,
          targetVersionAfter: 2,
          changedPaths: ["name"],
          beforeSummary: {
            name: "Original Name",
            email: "person@example.invalid",
            phone: "+989120000000",
            token: "secret-token",
            storage: { objectKey: "private/key" },
            nested: { authSubject: "subject-1", safe: "ok" },
          },
          afterSummary: { name: "New Name" },
          reason: "test",
        });
        assert(eventId);
        const raw = await h.db.collection("audit_events").findOne({
          _id: new ObjectId(eventId),
        })!;
        assertEquals(raw!.beforeSummary.email, "[REDACTED]");
        assertEquals(raw!.beforeSummary.phone, "[REDACTED]");
        assertEquals(raw!.beforeSummary.token, "[REDACTED]");
        assertEquals(raw!.beforeSummary.storage, "[REDACTED]");
        assertEquals(raw!.beforeSummary.nested.authSubject, "[REDACTED]");
        assertEquals(raw!.beforeSummary.nested.safe, "ok");
        assertEquals(raw!.version, 1);
        assertEquals((await h.audit.listForRequest("req-1")).length, 1);
      });

      await t.step("no service-level audit mutation path exists", () => {
        assertEquals(
          Object.keys(h.audit).sort(),
          ["appendAudit", "listForRequest", "listForTarget", "updateOrDelete"],
        );
        assertThrows(
          () => h.audit.updateOrDelete(),
          Error,
          "append-only",
        );
      });

      const makeCorrection = async (
        proposedChange: Record<string, unknown>,
        targetType = "product",
        targetId = productId,
      ) => {
        const id = new ObjectId();
        const now = new Date();
        await h.db.collection("corrections").insertOne({
          _id: id,
          target: { type: targetType, id: targetId },
          submissionKind: "CORRECTION",
          proposedChange,
          reason: "Fix a typo",
          submittedBy: userId,
          submittedAt: now,
          status: "SUBMITTED",
          review: { status: "QUEUED" },
          recordLifecycle: "ACTIVE",
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        return id.toString();
      };

      await t.step("approval does not apply the proposal", async () => {
        const correctionId = await makeCorrection({
          fieldKey: "name",
          operation: "SET",
          proposedValue: "Corrected Name",
        });
        const result = await h.corrections.approve({
          correctionId,
          actor: { type: "user", id: userId },
          requestId: "req-approve",
        });
        assertEquals(result, { approved: true, applied: false });
        const correction = await h.db.collection("corrections").findOne({
          _id: new ObjectId(correctionId),
        })!;
        assertEquals(correction!.status, "APPROVED");
        const product = await h.db.collection("products").findOne({
          _id: new ObjectId(productId),
        })!;
        assertEquals(product!.name, "Original Name");
      });

      let appliedCorrectionId = "";
      await t.step("application is version-checked and audited", async () => {
        appliedCorrectionId = await makeCorrection({
          fieldKey: "name",
          operation: "SET",
          proposedValue: "Corrected Name",
        });
        await h.corrections.approve({
          correctionId: appliedCorrectionId,
          actor: { type: "user", id: userId },
          requestId: "req-approve-2",
        });
        const result = await h.corrections.apply({
          correctionId: appliedCorrectionId,
          actor: { type: "user", id: userId },
          expectedVersion: 1,
          idempotencyKey: "idem-1",
          requestId: "req-apply",
        });
        assertEquals(result.applied, true);
        assertEquals(result.resultVersion, 2);
        const product = await h.db.collection("products").findOne({
          _id: new ObjectId(productId),
        })!;
        assertEquals(product!.name, "Corrected Name");
        assertEquals(product!.version, 2);
        const events = await h.db.collection("audit_events").find({
          "target.id": productId,
          action: "CORRECTION_APPLY",
        }).toArray();
        assertEquals(events.length, 1);
        assertEquals(events[0].targetVersionBefore, 1);
        assertEquals(events[0].targetVersionAfter, 2);
      });

      await t.step("second application is idempotent or a controlled conflict", async () => {
        const again = await h.corrections.apply({
          correctionId: appliedCorrectionId,
          actor: { type: "user", id: userId },
          expectedVersion: 1,
          idempotencyKey: "idem-1",
          requestId: "req-apply-2",
        });
        assertEquals(again.idempotent, true);
        assertEquals(again.applied, false);
        await expectCorrectionCode(
          () =>
            h.corrections.apply({
              correctionId: appliedCorrectionId,
              actor: { type: "user", id: userId },
              expectedVersion: 1,
              idempotencyKey: "idem-other",
              requestId: "req-apply-3",
            }),
          "ALREADY_APPLIED",
        );
      });

      await t.step("stale expected version is rejected", async () => {
        const correctionId = await makeCorrection({
          fieldKey: "name",
          operation: "SET",
          proposedValue: "Stale Write",
        });
        await h.corrections.approve({
          correctionId,
          actor: { type: "user", id: userId },
          requestId: "req-stale-approve",
        });
        await expectCorrectionCode(
          () =>
            h.corrections.apply({
              correctionId,
              actor: { type: "user", id: userId },
              expectedVersion: 1,
              idempotencyKey: "idem-stale",
              requestId: "req-stale",
            }),
          "VERSION_CONFLICT",
        );
      });

      await t.step("arbitrary patches and fields are rejected", async () => {
        for (
          const proposedChange of [
            { fieldKey: "$where", operation: "SET", proposedValue: "1" },
            { fieldKey: "__proto__.x", operation: "SET", proposedValue: "1" },
            { fieldKey: "name; db.dropDatabase()", operation: "SET", proposedValue: "x" },
            { fieldKey: "contentHash", operation: "SET", proposedValue: "x" },
            { fieldKey: "name", operation: "ADD", proposedValue: "x" },
          ]
        ) {
          const correctionId = await makeCorrection(proposedChange);
          await h.corrections.approve({
            correctionId,
            actor: { type: "user", id: userId },
            requestId: `req-invalid-${crypto.randomUUID()}`,
          });
          await assertRejects(
            () =>
              h.corrections.apply({
                correctionId,
                actor: { type: "user", id: userId },
                expectedVersion: 1,
                idempotencyKey: `idem-${crypto.randomUUID()}`,
                requestId: `req-invalid-apply-${crypto.randomUUID()}`,
              }),
            CorrectionError,
          );
        }
      });

      await t.step("idempotency key is required", async () => {
        const correctionId = await makeCorrection({
          fieldKey: "name",
          operation: "SET",
          proposedValue: "No Key",
        });
        await h.corrections.approve({
          correctionId,
          actor: { type: "user", id: userId },
          requestId: "req-no-key-approve",
        });
        await expectCorrectionCode(
          () =>
            h.corrections.apply({
              correctionId,
              actor: { type: "user", id: userId },
              expectedVersion: 1,
              idempotencyKey: "",
              requestId: "req-no-key",
            }),
          "IDEMPOTENCY_KEY_REQUIRED",
        );
      });
    } finally {
      await h.close();
    }
  },
});
