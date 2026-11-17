// Plan 04 - closed polymorphic reference registry and merge-following (S20).
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";
import { createEntityRegistry, ReferenceError } from "../../utils/identity/registry.ts";

async function seed(
  db: Awaited<ReturnType<typeof createHarness>>["db"],
  collection: string,
  overrides: Record<string, unknown> = {},
) {
  const _id = new ObjectId();
  const base = {
    _id,
    name: `entity-${_id}`,
    lifecycle: "ACTIVE",
    mergedIntoId: undefined,
    version: 1,
  };
  await db.collection(collection).insertOne({ ...base, ...overrides, _id });
  return _id;
}

async function expectCode(fn: () => Promise<unknown>, code: string): Promise<ReferenceError> {
  const error = await assertRejects(fn, ReferenceError) as ReferenceError;
  assertEquals(error.code, code);
  return error;
}

Deno.test({
  name: "registry: only closed {type,id} refs with per-field allowlists are accepted",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan04_registry_refs");
    try {
      const registry = createEntityRegistry(h.db);
      const id = new ObjectId();
      assertEquals(
        registry.assertRef("relationship.subject", { type: "ORGANIZATION", id }),
        { type: "ORGANIZATION", id },
      );
      assertThrows(
        () =>
          registry.assertRef(
            "relationship.subject",
            { type: "ORGANIZATION", id, collection: "orgs" } as never,
          ),
        ReferenceError,
      );
      assertThrows(
        () => registry.assertRef("relationship.subject", { type: "AUDIT_EVENT", id } as never),
        ReferenceError,
      );
      assertThrows(
        () => registry.assertRef("relationship.subject", { type: "USER", id }),
        ReferenceError,
      );
      assertThrows(
        () =>
          registry.assertRef("relationship.subject", { type: "ORGANIZATION", id: "x" as never }),
        ReferenceError,
      );
      const error = assertThrows(
        () => registry.assertRef("audit.target", { type: "UNKNOWN", id } as never),
        ReferenceError,
      ) as ReferenceError;
      assertEquals(error.code, "UNKNOWN_TYPE");
      const wrongField = assertThrows(
        () => registry.assertRef("relationship.subject", { type: "USER", id }),
        ReferenceError,
      ) as ReferenceError;
      assertEquals(wrongField.code, "TYPE_NOT_ALLOWED");
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "registry: existence and lifecycle distinguish missing, archived, and wrong type",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan04_registry_lifecycle");
    try {
      const registry = createEntityRegistry(h.db);
      const active = await seed(h.db, "brands");
      const archived = await seed(h.db, "brands", { lifecycle: "ARCHIVED" });

      await t.step("active target resolves", async () => {
        const resolved = await registry.resolve("claim.about", { type: "BRAND", id: active });
        assertEquals(resolved.doc._id.toString(), active.toString());
        assertEquals(resolved.mergedFrom.length, 0);
      });

      await t.step("missing target is NOT_FOUND", async () => {
        await expectCode(
          () => registry.resolve("claim.about", { type: "BRAND", id: new ObjectId() }),
          "NOT_FOUND",
        );
      });

      await t.step("archived target is ARCHIVED", async () => {
        await expectCode(
          () => registry.resolve("claim.about", { type: "BRAND", id: archived }),
          "ARCHIVED",
        );
      });

      await t.step("a ref to another type is a wrong-type error", async () => {
        const org = await seed(h.db, "organizations", { kind: "LEGAL_ENTITY" });
        await expectCode(
          () => registry.resolve("evidence.sourceSnapshotId", { type: "ORGANIZATION", id: org }),
          "TYPE_NOT_ALLOWED",
        );
      });

      await t.step("collection/model/path/operator inputs are rejected", async () => {
        await expectCode(
          () =>
            registry.resolve("claim.about", { type: "BRAND", id: active, path: "$where" } as never),
          "INVALID_REFERENCE",
        );
        await expectCode(
          () => registry.resolve("claim.about", { type: "brands", id: active } as never),
          "UNKNOWN_TYPE",
        );
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "registry: merge chains follow at most five hops and cycles raise an admin flag",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan04_registry_merge");
    try {
      const registry = createEntityRegistry(h.db);

      await t.step("chain follows to the survivor", async () => {
        const survivor = await seed(h.db, "brands");
        const middle = await seed(h.db, "brands", { lifecycle: "MERGED", mergedIntoId: survivor });
        const first = await seed(h.db, "brands", { lifecycle: "MERGED", mergedIntoId: middle });
        const resolved = await registry.resolve("claim.about", { type: "BRAND", id: first });
        assertEquals(resolved.doc._id.toString(), survivor.toString());
        assertEquals(resolved.mergedFrom.map(String), [first.toString(), middle.toString()]);
      });

      await t.step("cycle denies resolution with an admin flag", async () => {
        const a = new ObjectId();
        const b = new ObjectId();
        await h.db.collection("brands").insertMany([
          { _id: a, name: "a", lifecycle: "MERGED", mergedIntoId: b },
          { _id: b, name: "b", lifecycle: "MERGED", mergedIntoId: a },
        ]);
        const error = await expectCode(
          () => registry.resolve("claim.about", { type: "BRAND", id: a }),
          "MERGE_CYCLE",
        );
        assertEquals(error.adminFlag?.code, "MERGE_CYCLE");
      });

      await t.step("a chain longer than five hops is denied and flagged", async () => {
        const ids = Array.from({ length: 7 }, () => new ObjectId());
        await h.db.collection("brands").insertMany(ids.map((_id, index) => ({
          _id,
          name: `chain-${index}`,
          lifecycle: index === ids.length - 1 ? "ACTIVE" : "MERGED",
          mergedIntoId: index === ids.length - 1 ? undefined : ids[index + 1],
        })));
        const error = await expectCode(
          () => registry.resolve("claim.about", { type: "BRAND", id: ids[0] }),
          "MERGE_DEPTH_EXCEEDED",
        );
        assertEquals(error.adminFlag?.code, "MERGE_DEPTH_EXCEEDED");
      });
    } finally {
      await h.close();
    }
  },
});
