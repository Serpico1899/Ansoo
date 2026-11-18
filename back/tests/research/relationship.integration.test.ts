// Plan 05 - Relationship graph edges (S06, S07, S13, I11).
import { assert, assertEquals, assertRejects } from "@std/assert";
import { ObjectId } from "lesan";
import {
  canonicalRelationshipKey,
  createRelationshipEdge,
  endRelationshipEdge,
  updateRelationship,
} from "../../utils/research/mod.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

async function actor(
  h: Awaited<ReturnType<typeof createHarness>>,
  roles: string[] = ["RESEARCHER"],
) {
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

async function org(h: Awaited<ReturnType<typeof createHarness>>, name: string) {
  const _id = new ObjectId();
  await h.db.collection("organizations").insertOne({
    _id,
    name,
    normalizedName: name.toLowerCase(),
    matchKey: name.toLowerCase(),
    kind: "LEGAL_ENTITY",
    aliases: [],
    identifiers: [],
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return _id;
}

async function brand(h: Awaited<ReturnType<typeof createHarness>>, name: string) {
  const _id = new ObjectId();
  await h.db.collection("brands").insertOne({
    _id,
    name,
    normalizedName: name.toLowerCase(),
    matchKey: name.toLowerCase(),
    aliases: [],
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return _id;
}

async function product(h: Awaited<ReturnType<typeof createHarness>>, name: string) {
  const _id = new ObjectId();
  await h.db.collection("products").insertOne({
    _id,
    name,
    normalizedName: name.toLowerCase(),
    matchKey: name.toLowerCase(),
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

async function rejection(promise: Promise<unknown>): Promise<{ code: string; status: number }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; status: number };
  }
  throw new Error("expected rejection");
}

Deno.test({
  name: "relationship: S06 endpoint matrix, context, and forbidden rewrites",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan05_relationship");
    try {
      const owner = await actor(h);
      const parent = await org(h, "Parent");
      const child = await org(h, "Child");
      const brandId = await brand(h, "Brand");
      const productId = await product(h, "Product");
      const newOwner = await org(h, "New Owner");

      await t.step("creates a directed OWNS edge with registry fields and audit", async () => {
        const result = await createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: child },
          validity: {
            validFrom: new Date("2019-01-01T00:00:00Z"),
            validTo: null,
            datePrecision: "EXACT",
          },
          context: { ownership: { sharePercentage: 50, basis: "DIRECT" } },
          actor: owner,
        });
        assertEquals(result.version, 1);
        const doc = await h.db.collection("relationships").findOne({ _id: result.id });
        assert(doc);
        assertEquals(doc.predicateRegistryVersion, 1);
        assertEquals(doc.recordLifecycle, "ACTIVE");
        assertEquals(doc.publication.status, "DRAFT");
        assertEquals(doc.sensitivity, "SENSITIVE");
        assertEquals(
          doc.canonicalKey,
          canonicalRelationshipKey({
            subject: { type: "ORGANIZATION", id: parent },
            predicate: "OWNS",
            object: { type: "ORGANIZATION", id: child },
            context: { ownership: { sharePercentage: 50, basis: "DIRECT" } },
          }),
        );
        assertEquals(typeof doc.recordedAt, "object");
        const audits = await h.db.collection("audit_events")
          .countDocuments({ "target.id": result.id, action: "RELATIONSHIP_CREATED" });
        assertEquals(audits, 1);
      });

      await t.step("rejects incompatible endpoints", async () => {
        const brandSubject = await rejection(createRelationshipEdge({
          db: h.db,
          subject: { type: "BRAND", id: brandId },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: child },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          actor: owner,
        }));
        assertEquals(brandSubject.status, 422);
        assertEquals(brandSubject.code, "INVALID_RELATIONSHIP_ENDPOINT");

        const wrongObject = await rejection(createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "MANUFACTURES",
          object: { type: "BRAND", id: brandId },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          actor: owner,
        }));
        assertEquals(wrongObject.code, "INVALID_RELATIONSHIP_ENDPOINT");

        const subsidiary = await rejection(createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "SUBSIDIARY_OF",
          object: { type: "ORGANIZATION", id: child },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          actor: owner,
        }));
        assertEquals(subsidiary.code, "UNKNOWN_PREDICATE");
      });

      await t.step("requires CONTROLS basis and market context", async () => {
        const controls = await rejection(createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "CONTROLS",
          object: { type: "ORGANIZATION", id: child },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          actor: owner,
        }));
        assertEquals(controls.code, "MISSING_RELATIONSHIP_CONTEXT");

        const imports = await rejection(createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "IMPORTS_TO_MARKET",
          object: { type: "PRODUCT", id: productId },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          actor: owner,
        }));
        assertEquals(imports.code, "MISSING_RELATIONSHIP_CONTEXT");
      });

      await t.step("rejects extra keys instead of storing untyped context", async () => {
        const extra = await rejection(createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: child },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          context: { marketCountryCode: "IR", ownerName: "smuggled" } as Record<string, unknown>,
          actor: owner,
        }));
        assertEquals(extra.code, "UNKNOWN_RELATIONSHIP_FIELD");
      });

      await t.step("S07 endEdge sets validTo but never recordLifecycle", async () => {
        const created = await createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: child },
          validity: {
            validFrom: new Date("2019-01-01T00:00:00Z"),
            validTo: null,
            datePrecision: "EXACT",
          },
          actor: owner,
        });
        const ended = await endRelationshipEdge({
          db: h.db,
          id: created.id,
          expectedVersion: created.version,
          validTo: new Date("2023-01-01T00:00:00Z"),
          reason: "Ownership transferred",
          actor: owner,
        });
        assertEquals(ended.version, 2);
        const doc = await h.db.collection("relationships").findOne({ _id: created.id });
        assert(doc);
        assertEquals(doc.validity.validTo.toISOString(), "2023-01-01T00:00:00.000Z");
        assertEquals(doc.recordLifecycle, "ACTIVE");
        assertEquals(doc.publication.status, "DRAFT");
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": created.id, action: "RELATIONSHIP_CLOSED" }),
          1,
        );
        const closedAgain = await rejection(endRelationshipEdge({
          db: h.db,
          id: created.id,
          expectedVersion: ended.version,
          validTo: new Date("2024-01-01T00:00:00Z"),
          reason: "again",
          actor: owner,
        }));
        assertEquals(closedAgain.code, "RELATIONSHIP_ALREADY_ENDED");
      });

      await t.step(
        "owner change is a new edge; pure updates cannot rewrite endpoints",
        async () => {
          const first = await createRelationshipEdge({
            db: h.db,
            subject: { type: "ORGANIZATION", id: parent },
            predicate: "OWNS",
            object: { type: "ORGANIZATION", id: child },
            validity: {
              validFrom: new Date("2019-01-01T00:00:00Z"),
              validTo: new Date("2023-01-01T00:00:00Z"),
              datePrecision: "EXACT",
            },
            actor: owner,
          });
          const second = await createRelationshipEdge({
            db: h.db,
            subject: { type: "ORGANIZATION", id: newOwner },
            predicate: "OWNS",
            object: { type: "ORGANIZATION", id: child },
            validity: {
              validFrom: new Date("2023-01-01T00:00:00Z"),
              validTo: null,
              datePrecision: "EXACT",
            },
            actor: owner,
          });
          assertEquals(second.overlapFlag.relationshipIds.includes(first.id), false);
          const old = await h.db.collection("relationships").findOne({ _id: first.id });
          assertEquals(old?.subject.id.toString(), parent.toString());

          const rewrite = await rejection(updateRelationship({
            db: h.db,
            id: first.id,
            expectedVersion: 1,
            patch: { subject: { type: "ORGANIZATION", id: newOwner } },
            reason: "rewrite history",
            actor: owner,
          }));
          assertEquals(rewrite.code, "FORBIDDEN_RELATIONSHIP_FIELD");

          const updated = await updateRelationship({
            db: h.db,
            id: first.id,
            expectedVersion: 1,
            patch: {
              validity: {
                validFrom: new Date("2019-01-01T00:00:00Z"),
                validTo: new Date("2022-01-01T00:00:00Z"),
                datePrecision: "EXACT",
              },
            },
            reason: "source correction",
            actor: owner,
          });
          assertEquals(updated.version, 2);
          const stale = await rejection(updateRelationship({
            db: h.db,
            id: first.id,
            expectedVersion: 1,
            patch: { validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" } },
            reason: "stale",
            actor: owner,
          }));
          assertEquals(stale.code, "VERSION_CONFLICT");
          assertEquals(stale.status, 409);
        },
      );

      await t.step("overlap is a review flag, never a rejection", async () => {
        const shared = await org(h, "Joint Venture");
        const a = await createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: shared },
          validity: {
            validFrom: new Date("2020-01-01T00:00:00Z"),
            validTo: null,
            datePrecision: "EXACT",
          },
          context: { ownership: { sharePercentage: 50, basis: "DIRECT" } },
          actor: owner,
        });
        const b = await createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: newOwner },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: shared },
          validity: {
            validFrom: new Date("2020-01-01T00:00:00Z"),
            validTo: null,
            datePrecision: "EXACT",
          },
          context: { ownership: { sharePercentage: 50, basis: "DIRECT" } },
          actor: owner,
        });
        assertEquals(b.overlapFlag.relationshipIds.some((id: ObjectId) => id.equals(a.id)), true);
        assertEquals(
          await h.db.collection("relationships").countDocuments({ "object.id": shared }),
          2,
        );
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "relationship: canonical key normalizes context and is not unique",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan05_relationship_key");
    try {
      const owner = await actor(h);
      const parent = await org(h, "Parent");
      const distributedBrand = await brand(h, "Distributed Brand");
      const one = await createRelationshipEdge({
        db: h.db,
        subject: { type: "ORGANIZATION", id: parent },
        predicate: "DISTRIBUTES",
        object: { type: "BRAND", id: distributedBrand },
        validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
        context: { marketCountryCode: "ir", jurisdiction: " IR " },
        actor: owner,
      });
      const two = await createRelationshipEdge({
        db: h.db,
        subject: { type: "ORGANIZATION", id: parent },
        predicate: "DISTRIBUTES",
        object: { type: "BRAND", id: distributedBrand },
        validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
        context: { marketCountryCode: "IR", jurisdiction: "ir" },
        actor: owner,
      });
      const docs = await h.db.collection("relationships").find({
        _id: { $in: [one.id, two.id] },
      }).toArray();
      assertEquals(docs.length, 2);
      assertEquals(docs[0].canonicalKey, docs[1].canonicalKey);
      await assertRejects(
        async () => {
          await h.db.collection("relationships").createIndex({ canonicalKey: 1 }, { unique: true });
        },
        Error,
      );
    } finally {
      await h.close();
    }
  },
});
