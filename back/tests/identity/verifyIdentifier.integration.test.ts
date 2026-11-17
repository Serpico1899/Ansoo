// Plan 04 - identifier writes: strings, leading zeros, transitions, audit, caps.
import { assertEquals, assertRejects } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";
import {
  IdentifierWriteError,
  verifyProductIdentifier,
} from "../../utils/identity/verifyIdentifier.ts";
import { IdentifierError } from "../../utils/identity/identifier.ts";
import { validateAuditEvent } from "../../models/auditEvent.ts";

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function seedUser(h: Harness, roles: string[]) {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("users").insertOne({
    _id,
    authProvider: "LOCAL",
    authSubject: `subject-${_id}`,
    displayName: "Actor",
    roles,
    trustLevel: "REGULAR",
    accountStatus: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  return _id;
}

async function seedProduct(h: Harness) {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("products").insertOne({
    _id,
    name: "Product",
    normalizedName: "product",
    matchKey: "product",
    identifiers: [],
    brandMapping: { status: "UNREVIEWED" },
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  return _id;
}

Deno.test({
  name: "verifyIdentifier: leading zeros, status transition, audit, and negative cases",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan04_verify_identifier");
    try {
      const researcher = await seedUser(h, ["RESEARCHER"]);
      const contributor = await seedUser(h, ["CONTRIBUTOR"]);
      const product = await seedProduct(h);
      const actor = { type: "USER" as const, id: researcher };
      const value = "0006381333935";

      await t.step("adds a GTIN string with a 14-digit lookup value", async () => {
        const result = await verifyProductIdentifier({
          db: h.db,
          productId: product,
          scheme: "GTIN",
          value,
          status: "UNVERIFIED",
          expectedVersion: 1,
          reason: "Scanned package",
          actor,
        });
        assertEquals(result.created, true);
        assertEquals(result.version, 2);
        const raw = await h.db.collection("products").findOne({ _id: product });
        const identifier = raw?.identifiers[0];
        assertEquals(identifier.value, value);
        assertEquals(typeof identifier.value, "string");
        assertEquals(identifier.normalizedValue, value);
        assertEquals(identifier.matchValue, "00006381333935");
        assertEquals(identifier.status, "UNVERIFIED");
        const audit = await h.db.collection("audit_events").findOne({ _id: result.auditId });
        assertEquals(audit?.action, "IDENTIFIER_ADDED");
        validateAuditEvent(audit);
      });

      await t.step("moves UNVERIFIED to VERIFIED without losing the raw value", async () => {
        const result = await verifyProductIdentifier({
          db: h.db,
          productId: product,
          scheme: "GTIN",
          value,
          status: "VERIFIED",
          expectedVersion: 2,
          reason: "Registry confirmed",
          actor,
        });
        assertEquals(result.created, false);
        const raw = await h.db.collection("products").findOne({ _id: product });
        assertEquals(raw?.identifiers.length, 1);
        assertEquals(raw?.identifiers[0].value, value);
        assertEquals(raw?.identifiers[0].status, "VERIFIED");
        const audit = await h.db.collection("audit_events").findOne({ _id: result.auditId });
        assertEquals(audit?.action, "IDENTIFIER_STATUS_CHANGED");
        validateAuditEvent(audit);
      });

      await t.step("a retired identifier is terminal", async () => {
        await verifyProductIdentifier({
          db: h.db,
          productId: product,
          scheme: "GTIN",
          value,
          status: "RETIRED",
          expectedVersion: 3,
          reason: "Withdrawn",
          actor,
        });
        const error = await assertRejects(
          () =>
            verifyProductIdentifier({
              db: h.db,
              productId: product,
              scheme: "GTIN",
              value,
              status: "VERIFIED",
              expectedVersion: 4,
              reason: "Reactivate",
              actor,
            }),
          IdentifierError,
        ) as IdentifierError;
        assertEquals(error.code, "INVALID_STATUS_TRANSITION");
      });

      await t.step("invalid GTIN and blocked schemes fail before write", async () => {
        const invalid = await assertRejects(
          () =>
            verifyProductIdentifier({
              db: h.db,
              productId: product,
              scheme: "GTIN",
              value: "0006381333936",
              status: "UNVERIFIED",
              expectedVersion: 4,
              reason: "bad",
              actor,
            }),
          IdentifierError,
        ) as IdentifierError;
        assertEquals(invalid.code, "INVALID_GTIN");

        const blocked = await assertRejects(
          () =>
            verifyProductIdentifier({
              db: h.db,
              productId: product,
              scheme: "SKU",
              value: "ABC-1",
              status: "UNVERIFIED",
              expectedVersion: 4,
              reason: "blocked",
              actor,
            }),
          IdentifierError,
        ) as IdentifierError;
        assertEquals(blocked.code, "UNSUPPORTED_SCHEME");
      });

      await t.step("stale version and a contributor fail closed", async () => {
        const stale = await assertRejects(
          () =>
            verifyProductIdentifier({
              db: h.db,
              productId: product,
              scheme: "GTIN",
              value: "00000000000017",
              status: "UNVERIFIED",
              expectedVersion: 2,
              reason: "stale",
              actor,
            }),
          IdentifierWriteError,
        ) as IdentifierWriteError;
        assertEquals(stale.code, "VERSION_CONFLICT");

        const forbidden = await assertRejects(
          () =>
            verifyProductIdentifier({
              db: h.db,
              productId: product,
              scheme: "GTIN",
              value: "00000000000017",
              status: "UNVERIFIED",
              expectedVersion: 4,
              reason: "forbidden",
              actor: { type: "USER", id: contributor },
            }),
          IdentifierWriteError,
        ) as IdentifierWriteError;
        assertEquals(forbidden.code, "FORBIDDEN");
      });
    } finally {
      await h.close();
    }
  },
});
