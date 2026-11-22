// Plan 05 - Sensitivity matrix, minimum evidence, and assessment rules (I02, I05, S21).
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import { assessFinding, createRelationshipEdge } from "../../utils/research/mod.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

async function actor(h: Awaited<ReturnType<typeof createHarness>>, roles: string[]) {
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

async function source(
  h: Awaited<ReturnType<typeof createHarness>>,
  input: {
    title: string;
    publisherName: string;
    canonicalUrl: string;
    sourceType?: string;
    publisherVerified?: boolean;
    access?: string;
  },
) {
  const _id = new ObjectId();
  await h.db.collection("sources").insertOne({
    _id,
    title: input.title,
    canonicalUrl: input.canonicalUrl,
    sourceType: input.sourceType ?? "NEWS",
    publisherName: input.publisherName,
    publisherVerified: input.publisherVerified ?? true,
    access: input.access ?? "PUBLIC",
    attributionRequired: false,
    lifecycle: "ACTIVE",
    schemaVersion: 1,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return _id;
}

async function snapshot(
  h: Awaited<ReturnType<typeof createHarness>>,
  sourceId: ObjectId,
  title: string,
  tier = "A_OFFICIAL_MACHINE_READABLE",
) {
  const _id = new ObjectId();
  await h.db.collection("source_snapshots").insertOne({
    _id,
    source: { _id: sourceId, title },
    retrievedAt: new Date(),
    contentHash: "a".repeat(64),
    hashAlgorithm: "SHA256",
    captureMethod: "CRAWLER",
    acquisitionTier: tier,
    lifecycle: "AVAILABLE",
    schemaVersion: 1,
    createdAt: new Date(),
  });
  return _id;
}

function evidenceLink(snapshotId: ObjectId, addedBy: ObjectId, stance = "SUPPORTS") {
  return {
    _id: new ObjectId(),
    sourceSnapshotId: snapshotId,
    stance,
    addedBy,
    addedAt: new Date(),
  };
}

async function attachEvidence(
  h: Awaited<ReturnType<typeof createHarness>>,
  id: ObjectId,
  evidence: unknown[],
) {
  const doc = await h.db.collection("relationships").findOne({ _id: id });
  assert(doc);
  await h.db.collection("relationships").updateOne(
    { _id: id, version: doc.version },
    {
      $set: { evidence, updatedAt: new Date() },
      $inc: { version: 1 },
    },
  );
  return Number(doc.version) + 1;
}

Deno.test({
  name: "I05 - SUPPORTED requires evidence and an assessor other than the creator",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan05_assessment");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const assessor = await actor(h, ["RESEARCH_REVIEWER"]);
      const parent = await org(h, "Parent");
      const child = await org(h, "Child");
      const productId = await product(h, "Product");

      const edge = await createRelationshipEdge({
        db: h.db,
        subject: { type: "ORGANIZATION", id: parent },
        predicate: "OWNS",
        object: { type: "ORGANIZATION", id: child },
        validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
        actor: author,
      });

      const self = await rejection(assessFinding({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: edge.id,
        outcome: "SUPPORTED",
        methodologyVersion: "1",
        limitations: [],
        expectedVersion: 1,
        actor: author,
      }));
      assertEquals(self.code, "SELF_ASSESSMENT");
      assertEquals(self.status, 403);

      const noEvidence = await rejection(assessFinding({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: edge.id,
        outcome: "SUPPORTED",
        methodologyVersion: "1",
        limitations: [],
        expectedVersion: 1,
        actor: assessor,
      }));
      assertEquals(noEvidence.code, "INSUFFICIENT_EVIDENCE");

      await t.step(
        "SENSITIVE needs two independent sources or one official registry snapshot",
        async () => {
          const oneNewsSource = await source(h, {
            title: "One report",
            publisherName: "One Publisher",
            canonicalUrl: "https://one.example/story",
          });
          const oneSnapshot = await snapshot(h, oneNewsSource, "One report");
          const version = await attachEvidence(h, edge.id, [
            evidenceLink(oneSnapshot, author.id!),
          ]);
          const insufficient = await rejection(assessFinding({
            db: h.db,
            targetType: "RELATIONSHIP",
            targetId: edge.id,
            outcome: "SUPPORTED",
            methodologyVersion: "1",
            limitations: ["SINGLE_SOURCE"],
            expectedVersion: version,
            actor: assessor,
          }));
          assertEquals(insufficient.code, "INSUFFICIENT_EVIDENCE");

          const secondSource = await source(h, {
            title: "Second report",
            publisherName: "Second Publisher",
            canonicalUrl: "https://two.example/story",
          });
          const secondSnapshot = await snapshot(h, secondSource, "Second report");
          const twoVersion = await attachEvidence(h, edge.id, [
            evidenceLink(oneSnapshot, author.id!),
            evidenceLink(secondSnapshot, author.id!),
          ]);
          const supported = await assessFinding({
            db: h.db,
            targetType: "RELATIONSHIP",
            targetId: edge.id,
            outcome: "SUPPORTED",
            methodologyVersion: "1",
            limitations: [],
            expectedVersion: twoVersion,
            actor: assessor,
          });
          const doc = await h.db.collection("relationships").findOne({ _id: edge.id });
          assertEquals(doc?.assessment.outcome, "SUPPORTED");
          assertEquals(doc?.assessment.assessedBy.toString(), assessor.id!.toString());
          assertEquals(doc?.publication.status, "DRAFT");
          assertEquals(doc?.review.status, "NOT_QUEUED");
          assertEquals(doc?.recordLifecycle, "ACTIVE");
          assertEquals(
            await h.db.collection("audit_events")
              .countDocuments({ "target.id": edge.id, action: "ASSESSMENT_RECORDED" }),
            1,
          );
          assertEquals(supported.version, twoVersion + 1);
        },
      );

      await t.step("republications of one wire are one source", async () => {
        const sharedPublisher = "Wire Service";
        const s1 = await source(h, {
          title: "Wire original",
          publisherName: sharedPublisher,
          canonicalUrl: "https://a.example/wire",
        });
        const s2 = await source(h, {
          title: "Wire reprint",
          publisherName: sharedPublisher,
          canonicalUrl: "https://b.example/wire",
        });
        const n1 = await snapshot(h, s1, "Wire original");
        const n2 = await snapshot(h, s2, "Wire reprint");
        const secondEdge = await createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: await org(h, "Other Child") },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          actor: author,
        });
        const version = await attachEvidence(h, secondEdge.id, [
          evidenceLink(n1, author.id!),
          evidenceLink(n2, author.id!),
        ]);
        const rejected = await rejection(assessFinding({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: secondEdge.id,
          outcome: "SUPPORTED",
          methodologyVersion: "1",
          limitations: [],
          expectedVersion: version,
          actor: assessor,
        }));
        assertEquals(rejected.code, "INSUFFICIENT_EVIDENCE");
      });

      await t.step("one official registry snapshot satisfies SENSITIVE evidence", async () => {
        const registry = await source(h, {
          title: "Official registry",
          publisherName: "Official Registry",
          canonicalUrl: "https://registry.example/entity/1",
          sourceType: "OFFICIAL_REGISTRY",
        });
        const registrySnapshot = await snapshot(h, registry, "Official registry");
        const thirdEdge = await createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "OWNS",
          object: { type: "ORGANIZATION", id: await org(h, "Registry Child") },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          actor: author,
        });
        const version = await attachEvidence(h, thirdEdge.id, [
          evidenceLink(registrySnapshot, author.id!),
        ]);
        const assessed = await assessFinding({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: thirdEdge.id,
          outcome: "SUPPORTED",
          methodologyVersion: "1",
          limitations: [],
          expectedVersion: version,
          actor: assessor,
        });
        assertEquals(assessed.version, version + 1);
      });

      await t.step("ROUTINE needs one verified snapshot", async () => {
        const labelSource = await source(h, {
          title: "Package label capture",
          publisherName: "Ansoo",
          canonicalUrl: "https://ansoo.example/captures/1",
          sourceType: "COMPANY_DOCUMENT",
        });
        const labelSnapshot = await snapshot(h, labelSource, "Package label");
        const manufactures = await createRelationshipEdge({
          db: h.db,
          subject: { type: "ORGANIZATION", id: parent },
          predicate: "MANUFACTURES",
          object: { type: "PRODUCT", id: productId },
          validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
          actor: author,
        });
        const version = await attachEvidence(h, manufactures.id, [
          evidenceLink(labelSnapshot, author.id!),
        ]);
        const routine = await assessFinding({
          db: h.db,
          targetType: "RELATIONSHIP",
          targetId: manufactures.id,
          outcome: "SUPPORTED",
          methodologyVersion: "1",
          limitations: [],
          expectedVersion: version,
          actor: assessor,
        });
        assertEquals(routine.version, version + 1);
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "assessment: HIGH_RISK, partial wording, dispute basis, and neutral NOT_SUPPORTED",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan05_assessment_rules");
    try {
      const author = await actor(h, ["RESEARCHER"]);
      const assessor = await actor(h, ["RESEARCH_REVIEWER"]);
      const parent = await org(h, "Parent");
      const child = await org(h, "Child");

      const highRisk = await createRelationshipEdge({
        db: h.db,
        subject: { type: "ORGANIZATION", id: parent },
        predicate: "CONTROLS",
        object: { type: "ORGANIZATION", id: child },
        context: { ownership: { basis: "VOTING_RIGHTS" } },
        validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
        sensitivity: "HIGH_RISK",
        actor: author,
      });
      const s1 = await source(h, {
        title: "Independent report",
        publisherName: "Independent News",
        canonicalUrl: "https://news.example/1",
      });
      const s2 = await source(h, {
        title: "Official filing",
        publisherName: "Official Registry",
        canonicalUrl: "https://registry.example/2",
        sourceType: "OFFICIAL_REGISTRY",
      });
      const otherNews = await source(h, {
        title: "Second independent report",
        publisherName: "Another News",
        canonicalUrl: "https://another.example/2",
      });
      const n1 = await snapshot(h, s1, "Independent report");
      const n2 = await snapshot(h, s2, "Official filing");
      const otherNewsSnapshot = await snapshot(h, otherNews, "Second independent report");
      const noOfficialVersion = await attachEvidence(h, highRisk.id, [
        evidenceLink(n1, author.id!),
        evidenceLink(otherNewsSnapshot, author.id!),
      ]);
      const noOfficial = await rejection(assessFinding({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: highRisk.id,
        outcome: "SUPPORTED",
        methodologyVersion: "1",
        limitations: [],
        expectedVersion: noOfficialVersion,
        actor: assessor,
      }));
      assertEquals(noOfficial.code, "INSUFFICIENT_EVIDENCE");

      const version = await attachEvidence(h, highRisk.id, [
        evidenceLink(n1, author.id!),
        evidenceLink(n2, author.id!),
      ]);
      const highRiskAssessed = await assessFinding({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: highRisk.id,
        outcome: "SUPPORTED",
        methodologyVersion: "1",
        limitations: [],
        expectedVersion: version,
        actor: assessor,
      });
      assertEquals(highRiskAssessed.version, version + 1);

      const partialEdge = await createRelationshipEdge({
        db: h.db,
        subject: { type: "ORGANIZATION", id: parent },
        predicate: "OWNS",
        object: { type: "ORGANIZATION", id: await org(h, "Partial Child") },
        validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
        actor: author,
      });
      const p1 = await source(h, {
        title: "Partial one",
        publisherName: "Publisher A",
        canonicalUrl: "https://a.example/partial",
      });
      const p2 = await source(h, {
        title: "Partial two",
        publisherName: "Publisher B",
        canonicalUrl: "https://b.example/partial",
      });
      const pn1 = await snapshot(h, p1, "Partial one");
      const pn2 = await snapshot(h, p2, "Partial two");
      const pversion = await attachEvidence(h, partialEdge.id, [
        evidenceLink(pn1, author.id!),
        evidenceLink(pn2, author.id!),
      ]);
      const noWording = await rejection(assessFinding({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: partialEdge.id,
        outcome: "PARTIALLY_SUPPORTED",
        methodologyVersion: "1",
        limitations: ["PARTIAL_SCOPE"],
        expectedVersion: pversion,
        actor: assessor,
      }));
      assertEquals(noWording.code, "PUBLIC_WORDING_REQUIRED");

      const withWording = await assessFinding({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: partialEdge.id,
        outcome: "PARTIALLY_SUPPORTED",
        publicWording: "Ownership is documented for part of the period.",
        methodologyVersion: "1",
        limitations: ["PARTIAL_SCOPE"],
        expectedVersion: pversion,
        actor: assessor,
      });
      assertEquals(withWording.version, pversion + 1);
      const partialDoc = await h.db.collection("relationships").findOne({ _id: partialEdge.id });
      assertEquals(partialDoc?.publicWording, "Ownership is documented for part of the period.");
      assertEquals(
        await h.db.collection("audit_events")
          .countDocuments({ "target.id": partialEdge.id, action: "PUBLIC_WORDING_CHANGED" }),
        1,
      );

      const disputedEdge = await createRelationshipEdge({
        db: h.db,
        subject: { type: "ORGANIZATION", id: parent },
        predicate: "OWNS",
        object: { type: "ORGANIZATION", id: await org(h, "Disputed Child") },
        validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
        actor: author,
      });
      const d1 = await source(h, {
        title: "Supporting filing",
        publisherName: "Publisher C",
        canonicalUrl: "https://c.example/dispute",
      });
      const d2 = await source(h, {
        title: "Contradicting filing",
        publisherName: "Publisher D",
        canonicalUrl: "https://d.example/dispute",
      });
      const dn1 = await snapshot(h, d1, "Supporting filing");
      const dn2 = await snapshot(h, d2, "Contradicting filing");
      const dversion = await attachEvidence(h, disputedEdge.id, [
        evidenceLink(dn1, author.id!, "SUPPORTS"),
        evidenceLink(dn2, author.id!, "CONTRADICTS"),
      ]);
      const disputed = await assessFinding({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: disputedEdge.id,
        outcome: "DISPUTED",
        methodologyVersion: "1",
        limitations: [],
        expectedVersion: dversion,
        actor: assessor,
      });
      assertEquals(disputed.version, dversion + 1);

      const neutralEdge = await createRelationshipEdge({
        db: h.db,
        subject: { type: "ORGANIZATION", id: parent },
        predicate: "OWNS",
        object: { type: "ORGANIZATION", id: await org(h, "Neutral Child") },
        validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
        actor: author,
      });
      const n1neutral = await source(h, {
        title: "Neutral source",
        publisherName: "Publisher E",
        canonicalUrl: "https://e.example/neutral",
      });
      const nn1 = await snapshot(h, n1neutral, "Neutral source");
      const nversion = await attachEvidence(h, neutralEdge.id, [
        evidenceLink(nn1, author.id!),
      ]);
      await assessFinding({
        db: h.db,
        targetType: "RELATIONSHIP",
        targetId: neutralEdge.id,
        outcome: "NOT_SUPPORTED",
        methodologyVersion: "1",
        limitations: ["SINGLE_SOURCE"],
        expectedVersion: nversion,
        actor: assessor,
      });
      const neutralDoc = await h.db.collection("relationships").findOne({ _id: neutralEdge.id });
      assert(neutralDoc);
      assertEquals(neutralDoc.assessment.outcome, "NOT_SUPPORTED");
      for (const forbidden of ["isFalse", "false", "negated", "oppositeProven"]) {
        assertEquals(forbidden in neutralDoc, false, `${forbidden} must not exist`);
      }
      assertEquals(neutralDoc.publication.status, "DRAFT");
    } finally {
      await h.close();
    }
  },
});
