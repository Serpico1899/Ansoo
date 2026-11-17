// Plan 04 - merge tombstone, CAS, audit, and never-rewrite-history (I15, S20).
import { assertEquals, assertRejects } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";
import { mergeEntity, MergeError, unmergeEntity } from "../../utils/identity/merge.ts";
import { validateAuditEvent } from "../../models/auditEvent.ts";

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function seedUser(h: Harness, roles: string[], status = "ACTIVE") {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("users").insertOne({
    _id,
    authProvider: "LOCAL",
    authSubject: `subject-${_id}`,
    displayName: "Actor",
    roles,
    trustLevel: "REGULAR",
    accountStatus: status,
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  return _id;
}

async function seedBrand(h: Harness, overrides: Record<string, unknown> = {}) {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("brands").insertOne({
    _id,
    name: `Brand ${_id}`,
    normalizedName: `brand ${_id}`,
    matchKey: `brand${_id}`,
    aliases: [],
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return _id;
}

async function seedProduct(h: Harness, identifiers: Array<Record<string, unknown>>) {
  const _id = new ObjectId();
  const now = new Date();
  await h.db.collection("products").insertOne({
    _id,
    name: `Product ${_id}`,
    normalizedName: `product ${_id}`,
    matchKey: `product${_id}`,
    identifiers,
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
  name: "merge: tombstone, audit, and historical references are never rewritten",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan04_merge");
    try {
      const actorId = await seedUser(h, ["MODERATOR"]);
      const survivor = await seedBrand(h, {
        name: "Survivor",
        normalizedName: "survivor",
        matchKey: "survivor",
      });
      const duplicate = await seedBrand(h, {
        name: "Duplicate",
        normalizedName: "duplicate",
        matchKey: "duplicate",
      });
      const relationshipId = new ObjectId();
      await h.db.collection("relationships").insertOne({
        _id: relationshipId,
        subject: { type: "BRAND", id: duplicate },
        object: { type: "ORGANIZATION", id: new ObjectId() },
        predicate: "OWNS",
        recordLifecycle: "ACTIVE",
        version: 7,
      });
      const beforeRelationship = await h.db.collection("relationships").findOne({
        _id: relationshipId,
      });

      const result = await mergeEntity({
        db: h.db,
        client: h.client,
        entityType: "BRAND",
        sourceId: duplicate,
        targetId: survivor,
        expectedVersion: 1,
        reason: "Same official brand",
        actor: { type: "USER", id: actorId },
        now: new Date(),
      });

      const source = await h.db.collection("brands").findOne({ _id: duplicate });
      assertEquals(source?.lifecycle, "MERGED");
      assertEquals(source?.mergedIntoId?.toString(), survivor.toString());
      assertEquals(source?.version, 2);
      const afterRelationship = await h.db.collection("relationships").findOne({
        _id: relationshipId,
      });
      assertEquals(afterRelationship, beforeRelationship);

      assertEquals(result.auditIds.length, 1);
      const audit = await h.db.collection("audit_events").findOne({ _id: result.auditIds[0] });
      assertEquals(audit?.action, "ENTITY_MERGED");
      assertEquals(audit?.target.type, "BRAND");
      assertEquals(audit?.target.id.toString(), duplicate.toString());
      assertEquals(audit?.targetVersionBefore, 1);
      assertEquals(audit?.targetVersionAfter, 2);
      validateAuditEvent(audit);

      await unmergeEntity({
        db: h.db,
        client: h.client,
        entityType: "BRAND",
        sourceId: duplicate,
        expectedVersion: 2,
        reason: "Wrong merge",
        actor: { type: "USER", id: actorId },
        now: new Date(),
      });
      const restored = await h.db.collection("brands").findOne({ _id: duplicate });
      assertEquals(restored?.lifecycle, "ACTIVE");
      assertEquals(restored?.mergedIntoId, undefined);
      assertEquals(restored?.version, 3);
      const audit2 = await h.db.collection("audit_events").findOne({ action: "ENTITY_UNMERGED" });
      assertEquals(audit2?.target.id.toString(), duplicate.toString());
      validateAuditEvent(audit2);
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "merge: contradictory official identifiers, CAS, self-merge, and authorization fail closed",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan04_merge_negative");
    try {
      const moderator = await seedUser(h, ["MODERATOR"]);
      const contributor = await seedUser(h, ["CONTRIBUTOR"]);
      const now = new Date();

      await t.step("contradictory GTINs block a product merge", async () => {
        const first = await seedProduct(h, [{
          scheme: "GTIN",
          normalizedValue: "00000000000001",
          status: "VERIFIED",
        }]);
        const second = await seedProduct(h, [{
          scheme: "GTIN",
          normalizedValue: "00000000000002",
          status: "VERIFIED",
        }]);
        const error = await assertRejects(
          () =>
            mergeEntity({
              db: h.db,
              client: h.client,
              entityType: "PRODUCT",
              sourceId: first,
              targetId: second,
              expectedVersion: 1,
              reason: "merge",
              actor: { type: "USER", id: moderator },
              now,
            }),
          MergeError,
        ) as MergeError;
        assertEquals(error.code, "CONTRADICTORY_IDENTIFIERS");
      });

      await t.step("stale expected version is a CAS conflict", async () => {
        const source = await seedBrand(h);
        const target = await seedBrand(h);
        const error = await assertRejects(
          () =>
            mergeEntity({
              db: h.db,
              client: h.client,
              entityType: "BRAND",
              sourceId: source,
              targetId: target,
              expectedVersion: 2,
              reason: "merge",
              actor: { type: "USER", id: moderator },
              now,
            }),
          MergeError,
        ) as MergeError;
        assertEquals(error.code, "VERSION_CONFLICT");
        assertEquals(
          (await h.db.collection("brands").findOne({ _id: source }))?.lifecycle,
          "ACTIVE",
        );
      });

      await t.step("source and target may not be the same identity", async () => {
        const source = await seedBrand(h);
        const error = await assertRejects(
          () =>
            mergeEntity({
              db: h.db,
              client: h.client,
              entityType: "BRAND",
              sourceId: source,
              targetId: source,
              expectedVersion: 1,
              reason: "merge",
              actor: { type: "USER", id: moderator },
              now,
            }),
          MergeError,
        ) as MergeError;
        assertEquals(error.code, "SELF_MERGE");
      });

      await t.step("a contributor may not merge identities", async () => {
        const source = await seedBrand(h);
        const target = await seedBrand(h);
        const error = await assertRejects(
          () =>
            mergeEntity({
              db: h.db,
              client: h.client,
              entityType: "BRAND",
              sourceId: source,
              targetId: target,
              expectedVersion: 1,
              reason: "merge",
              actor: { type: "USER", id: contributor },
              now,
            }),
          MergeError,
        ) as MergeError;
        assertEquals(error.code, "FORBIDDEN");
      });

      await t.step("target of a different type is rejected", async () => {
        const source = await seedBrand(h);
        const orgId = new ObjectId();
        await h.db.collection("organizations").insertOne({
          _id: orgId,
          name: "Org",
          normalizedName: "org",
          matchKey: "org",
          kind: "LEGAL_ENTITY",
          aliases: [],
          identifiers: [],
          lifecycle: "ACTIVE",
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        const error = await assertRejects(
          () =>
            mergeEntity({
              db: h.db,
              client: h.client,
              entityType: "BRAND",
              sourceId: source,
              targetId: orgId,
              expectedVersion: 1,
              reason: "merge",
              actor: { type: "USER", id: moderator },
              now,
            }),
          MergeError,
        ) as MergeError;
        assertEquals(error.code, "TARGET_NOT_FOUND");
      });
    } finally {
      await h.close();
    }
  },
});
