// Spike task 7: independent status dimensions and public projections.
import { assert, assertEquals, assertThrows } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, seedUser } from "../spike/harness.ts";
import { buildPublicProductProfile, publicCitation } from "../spike/projection.ts";
import { assertNoUniversalVerdict } from "../spike/status.ts";

Deno.test({
  name: "spike: status dimensions stay independent and public projection is safe",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async (t) => {
    const h = await createHarness("ansoo_spike_status");
    try {
      const userId = await seedUser(h, { roles: ["RESEARCHER"] });
      const now = new Date();

      const makeRelationship = async (
        outcome: string,
        publication: string,
        extra: Record<string, unknown> = {},
      ) => {
        const id = new ObjectId();
        await h.db.collection("relationships").insertOne({
          _id: id,
          subject: { type: "organization", id: new ObjectId().toString() },
          predicate: "OWNS",
          predicateRegistryVersion: 1,
          object: { type: "organization", id: new ObjectId().toString() },
          context: { marketCountryCode: "IR" },
          validity: {},
          review: { status: "CLOSED" },
          assessment: { outcome },
          publication: { status: publication },
          canonicalKey: `k-${id}`,
          recordedAt: now,
          recordLifecycle: "ACTIVE",
          schemaVersion: 1,
          version: 1,
          createdAt: now,
          updatedAt: now,
          ...extra,
        });
        return id.toString();
      };

      await t.step("one dimension changes without collapsing the others", async () => {
        const id = await makeRelationship("SUPPORTED", "WITHHELD");
        await h.status.assess({
          kind: "relationship",
          id,
          actor: { type: "user", id: userId },
          requestId: "req-assess",
          expectedVersion: 1,
          outcome: "SUPPORTED",
          summary: "Evidence reviewed",
        });
        let raw = await h.db.collection("relationships").findOne({
          _id: new ObjectId(id),
        })!;
        assertEquals(raw!.assessment.outcome, "SUPPORTED");
        assertEquals(raw!.publication.status, "WITHHELD");

        await h.status.publish({
          kind: "relationship",
          id,
          actor: { type: "user", id: userId },
          requestId: "req-publish",
          expectedVersion: 2,
        });
        raw = await h.db.collection("relationships").findOne({
          _id: new ObjectId(id),
        })!;
        assertEquals(raw!.assessment.outcome, "SUPPORTED");
        assertEquals(raw!.publication.status, "PUBLISHED");

        await h.status.assess({
          kind: "relationship",
          id,
          actor: { type: "user", id: userId },
          requestId: "req-reassess",
          expectedVersion: 3,
          outcome: "NOT_SUPPORTED",
        });
        raw = await h.db.collection("relationships").findOne({
          _id: new ObjectId(id),
        })!;
        assertEquals(raw!.assessment.outcome, "NOT_SUPPORTED");
        assertEquals(raw!.publication.status, "PUBLISHED");
      });

      await t.step("SUPPORTED+WITHHELD and NOT_SUPPORTED+PUBLISHED are queryable", async () => {
        await makeRelationship("SUPPORTED", "WITHHELD");
        const supportedWithheld = await h.status.countByDimensions(
          "relationship",
          {
            "assessment.outcome": "SUPPORTED",
            "publication.status": "WITHHELD",
          },
        );
        assertEquals(supportedWithheld, 1);
        const notSupportedPublished = await h.status.countByDimensions(
          "relationship",
          {
            "assessment.outcome": "NOT_SUPPORTED",
            "publication.status": "PUBLISHED",
          },
        );
        assertEquals(notSupportedPublished, 1);
      });

      await t.step("state transitions write audit events", async () => {
        const events = await h.db.collection("audit_events").find({
          "target.type": "relationship",
        }).toArray();
        assertEquals(events.length >= 3, true);
        assertEquals(
          events.some((event) => event.action === "PUBLISH"),
          true,
        );
      });

      const productId = new ObjectId();
      const brandId = new ObjectId();
      const categoryId = new ObjectId();
      const relationshipId = new ObjectId();
      const claimId = new ObjectId();

      await h.db.collection("products").insertOne({
        _id: productId,
        name: "Public Soap",
        normalizedName: "public soap",
        identifiers: [{
          scheme: "GTIN_13",
          value: "4006381333931",
          normalizedValue: "4006381333931",
          status: "VERIFIED",
          sourceSnapshotIds: [new ObjectId().toString()],
        }],
        brandMapping: { state: "CONFIRMED" },
        brand: {
          _id: brandId,
          name: "Brand",
          normalizedName: "brand",
          internalNotes: [{
            body: "private",
            authorId: userId,
            createdAt: now,
            visibility: "INTERNAL",
          }],
        },
        category: {
          _id: categoryId,
          code: "CAT-1",
          name: "Home",
          normalizedName: "home",
          depth: 0,
          taxonomyVersion: 1,
        },
        recordLifecycle: "ACTIVE",
        schemaVersion: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      await h.db.collection("relationships").insertOne({
        _id: relationshipId,
        subject: { type: "brand", id: brandId.toString() },
        predicate: "OWNS",
        predicateRegistryVersion: 1,
        object: { type: "organization", id: new ObjectId().toString() },
        context: { marketCountryCode: "IR" },
        validity: {},
        review: { status: "CLOSED", assignedTo: userId },
        assessment: { outcome: "SUPPORTED" },
        publication: { status: "PUBLISHED", visibility: "PUBLIC" },
        evidence: [{
          sourceSnapshotId: new ObjectId().toString(),
          stance: "SUPPORTS",
          locator: "p.1",
          excerpt: "public excerpt",
          rationale: "public rationale",
          reviewerId: userId,
        }],
        organizationResponses: [
          {
            respondingOrganizationId: new ObjectId().toString(),
            statement: "published response",
            receivedAt: now,
            authorityVerified: true,
            publication: { status: "PUBLISHED" },
          },
          {
            respondingOrganizationId: new ObjectId().toString(),
            statement: "draft response",
            receivedAt: now,
            authorityVerified: false,
            publication: { status: "DRAFT" },
          },
        ],
        researchNotes: [{
          body: "secret research",
          authorId: userId,
          createdAt: now,
          visibility: "INTERNAL",
        }],
        canonicalKey: "public",
        recordedAt: now,
        recordLifecycle: "ACTIVE",
        schemaVersion: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      await h.db.collection("claims").insertOne({
        _id: claimId,
        about: { type: "product", id: productId.toString() },
        claimType: "PRODUCT_ORIGIN",
        statement: "Made in Iran",
        scope: { marketCountryCode: "IR" },
        review: { status: "CLOSED" },
        assessment: { outcome: "SUPPORTED" },
        publication: { status: "WITHHELD", visibility: "INTERNAL" },
        researchNotes: [{ body: "private", authorId: userId, createdAt: now, visibility: "LEGAL" }],
        recordedAt: now,
        recordLifecycle: "ACTIVE",
        schemaVersion: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      await t.step("deep client projection cannot leak private fields", async () => {
        const product = (await h.db.collection("products").findOne({
          _id: productId,
        }))!;
        const relationships = await h.db.collection("relationships").find({
          "subject.id": brandId.toString(),
        }).toArray();
        const claims = await h.db.collection("claims").find({
          "about.id": productId.toString(),
        }).toArray();

        // The builder takes no client `get`. A deep request therefore cannot
        // widen the response.
        const clientGet = {
          brand: { name: 1, internalNotes: 1 },
          identifiers: { sourceSnapshotIds: 1 },
          researchNotes: 1,
        };
        assertEquals(Object.keys(clientGet).includes("researchNotes"), true);
        const profile = buildPublicProductProfile({
          product,
          relationships,
          claims,
          unknowns: ["Ownership before 2010 is unknown."],
        });

        const serialized = JSON.stringify(profile);
        for (
          const forbidden of [
            "secret research",
            "private",
            "reviewerId",
            "sourceSnapshotIds",
            "internalNotes",
            "researchNotes",
            "objectKey",
          ]
        ) {
          assertEquals(
            serialized.includes(forbidden),
            false,
            `public profile leaked ${forbidden}`,
          );
        }
        assertEquals(profile.claims.length, 0);
        assertEquals(profile.relationships.length, 1);
        assertEquals(profile.relationships[0].organizationResponses.length, 1);
        assertEquals("verdict" in profile, false);
        assertNoUniversalVerdict(profile as unknown as Record<string, unknown>);
        assert(profile.relationships[0].assessment.outcome === "SUPPORTED");
        assert(profile.relationships[0].publication.status === "PUBLISHED");
      });

      await t.step("a published finding cannot publish a restricted source", () => {
        const snapshot = { recordLifecycle: "ACTIVE", contentHash: "hash", retrievedAt: now };
        const restrictedSource = {
          access: "RESTRICTED",
          recordLifecycle: "ACTIVE",
          title: "Restricted",
          sourceType: "COURT_RECORD",
          canonicalUrl: "https://example.com/restricted",
        };
        assertThrows(
          () => publicCitation({ snapshot, source: restrictedSource }),
          Error,
          "not public",
        );
        const publicSource = { ...restrictedSource, access: "PUBLIC" };
        assertEquals(
          publicCitation({ snapshot, source: publicSource }).sourceTitle,
          "Restricted",
        );
      });
    } finally {
      await h.close();
    }
  },
});
