// Plan 09 - public profile assembly, inheritance, read model, and retraction.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { ObjectId } from "lesan";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";
import { getPublicProfile } from "../../src/product/getPublicProfile/getPublicProfile.fn.ts";
import { loadConfig } from "../../utils/config.ts";
import { assemblePublicProfile, stableStringify } from "../../utils/publicProfile/assemble.ts";
import {
  ensureReadModelIndexes,
  getFreshProfile,
  getProfileRecord,
  rebuildAllProfiles,
  rebuildProfile,
  repairPublicProfiles,
  requestRebuildsForEntity,
  requestRebuildsForFinding,
} from "../../utils/publicProfile/readModel.ts";
import {
  invalidatePublicProjections,
  retractFinding,
  SURFACE_REPAIR_COLLECTION,
} from "../../utils/research/mod.ts";
import {
  createInMemoryPublicSurface,
  registerPublicSurface,
  resetPublicSurfaces,
} from "../../utils/publicProfile/surfaces.ts";
import { PUBLIC_UNKNOWN_CODES } from "../../utils/publicProfile/types.ts";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const CONFIG = loadConfig({
  ENV: "test",
  MONGO_URL: "mongodb://127.0.0.1:27019/?replicaSet=rs0",
  DB_NAME: "ansoo_plan09_profile",
  JWT_SECRET: "session-secret-".padEnd(48, "s"),
  JWT_ISSUER: "ansoo-api",
  JWT_AUDIENCE: "ansoo-front",
  AUTH_ASSERTION_SECRET: "assertion-secret-".padEnd(48, "a"),
  AUTH_ASSERTION_ISSUER: "ansoo-idp",
  AUTH_ASSERTION_AUDIENCE: "ansoo-api",
});

const NOW = new Date("2026-08-01T12:00:00.000Z");
const GTIN = "0006381333935";

function identifier(value = GTIN, status = "VERIFIED", extra: Record<string, unknown> = {}) {
  return {
    _id: new ObjectId(),
    scheme: "GTIN",
    value,
    normalizedValue: value,
    matchValue: value.padStart(14, "0"),
    status,
    ...extra,
  };
}

async function seedEntity(
  h: Harness,
  collection: string,
  doc: Record<string, unknown>,
) {
  const _id = new ObjectId();
  await h.db.collection(collection).insertOne({
    _id,
    schemaVersion: 1,
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...doc,
  });
  return _id;
}

async function seedProfile(h: Harness) {
  const brandId = await seedEntity(h, "brands", {
    name: "Acme",
    normalizedName: "acme",
    matchKey: "acme",
    aliases: [],
    lifecycle: "ACTIVE",
  });
  const orgId = await seedEntity(h, "organizations", {
    name: "Acme Holding",
    normalizedName: "acme holding",
    matchKey: "acmeholding",
    kind: "LEGAL_ENTITY",
    aliases: [],
    identifiers: [],
    lifecycle: "ACTIVE",
  });
  const hiddenOrgId = await seedEntity(h, "organizations", {
    name: "Hidden Org",
    normalizedName: "hidden org",
    matchKey: "hiddenorg",
    kind: "LEGAL_ENTITY",
    aliases: [],
    identifiers: [],
    lifecycle: "ACTIVE",
  });
  const downstreamOrgId = await seedEntity(h, "organizations", {
    name: "Downstream Org",
    normalizedName: "downstream org",
    matchKey: "downstreamorg",
    kind: "LEGAL_ENTITY",
    aliases: [],
    identifiers: [],
    lifecycle: "ACTIVE",
  });

  const productId = await seedEntity(h, "products", {
    name: "Acme Soap",
    normalizedName: "acme soap",
    matchKey: "acmesoap",
    identifiers: [
      identifier(),
      identifier("00000000000307", "UNVERIFIED"),
    ],
    brandMapping: { status: "MAPPED", candidateBrandId: brandId },
    brand: { _id: brandId, name: "Acme" },
    packaging: { netContentValue: 250, netContentUnit: "g" },
    categoryCode: "household.cleaning.soap",
    lifecycle: "ACTIVE",
  });

  const snapshotId = await seedEntity(h, "source_snapshots", {
    titleAtCapture: "Acme registry entry",
    canonicalUrlAtCapture: "https://registry.example/acme",
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    retrievedAt: new Date("2026-07-02T00:00:00.000Z"),
    contentHash: "a".repeat(64),
    hashAlgorithm: "SHA_256",
    captureMethod: "HTTP_FETCH",
    acquisitionTier: "PRIMARY",
    source: {
      _id: await seedEntity(h, "sources", {
        title: "Official Registry",
        canonicalUrl: "https://registry.example",
        sourceType: "OFFICIAL_REGISTER",
        publisherName: "Registry Office",
        publisherVerified: true,
        access: "PUBLIC",
        attributionRequired: false,
        lifecycle: "ACTIVE",
      }),
    },
    lifecycle: "AVAILABLE",
  });

  const evidence = [{
    _id: new ObjectId(),
    sourceSnapshotId: snapshotId,
    stance: "SUPPORTS",
    excerpt: "Acme Holding owns Acme.",
    addedBy: new ObjectId(),
    addedAt: NOW,
  }];

  const productClaimId = await seedEntity(h, "claims", {
    about: { type: "PRODUCT", id: productId },
    claimType: "PRODUCT_ORIGIN",
    claimTypeRegistryVersion: 1,
    statement: "Package declares Iran.",
    publicWording: "The package declares an origin of Iran.",
    structuredValue: {
      claimType: "PRODUCT_ORIGIN",
      declaredOriginCountryCode: "IR",
      declarationSurface: "PACKAGE",
    },
    recordLifecycle: "ACTIVE",
    assessment: {
      outcome: "SUPPORTED",
      methodologyVersion: "v1",
      limitations: ["SELF_REPORTED"],
      assessedAt: new Date("2026-07-03T00:00:00.000Z"),
    },
    publication: {
      status: "PUBLISHED",
      publishedAt: new Date("2026-07-04T00:00:00.000Z"),
      decidedBy: new ObjectId(),
      decidedAt: new Date("2026-07-04T00:00:00.000Z"),
    },
    review: { status: "CLOSED", priority: "NORMAL", lastActionAt: NOW },
    evidence,
    organizationResponses: [],
    responseSolicitations: [],
    researchNotes: [{
      _id: new ObjectId(),
      authorId: new ObjectId(),
      body: "PRIVATE RESEARCH NOTE",
      visibility: "INTERNAL_RESEARCH",
      createdAt: NOW,
    }],
    recordedAt: NOW,
  });

  const brandClaimId = await seedEntity(h, "claims", {
    about: { type: "BRAND", id: brandId },
    claimType: "MARKET_PRESENCE",
    claimTypeRegistryVersion: 1,
    statement: "Acme is sold in Iran.",
    publicWording: "Acme products are reported as present in the Iranian market.",
    structuredValue: {
      claimType: "MARKET_PRESENCE",
      marketCountryCode: "IR",
      observationBasis: "RETAILER_LISTING",
    },
    recordLifecycle: "ACTIVE",
    assessment: { outcome: "PARTIALLY_SUPPORTED", methodologyVersion: "v1", limitations: [] },
    publication: {
      status: "PUBLISHED",
      publishedAt: new Date("2026-07-05T00:00:00.000Z"),
    },
    review: { status: "CLOSED", priority: "NORMAL" },
    evidence,
    organizationResponses: [],
    responseSolicitations: [],
    recordedAt: NOW,
  });

  const orgClaimId = await seedEntity(h, "claims", {
    about: { type: "ORGANIZATION", id: orgId },
    claimType: "OFFICIAL_STATEMENT",
    claimTypeRegistryVersion: 1,
    statement: "Acme Holding made a statement.",
    publicWording: "Acme Holding published a statement about the product.",
    structuredValue: {
      claimType: "OFFICIAL_STATEMENT",
      speakingOrganizationId: orgId,
      statementDatePrecision: "UNKNOWN",
      channel: "PRESS_RELEASE",
    },
    recordLifecycle: "ACTIVE",
    assessment: { outcome: "SUPPORTED", methodologyVersion: "v1", limitations: [] },
    publication: {
      status: "PUBLISHED",
      publishedAt: new Date("2026-07-06T00:00:00.000Z"),
    },
    review: { status: "CLOSED", priority: "NORMAL" },
    evidence,
    organizationResponses: [],
    responseSolicitations: [],
    recordedAt: NOW,
  });

  const hiddenClaimId = await seedEntity(h, "claims", {
    about: { type: "ORGANIZATION", id: hiddenOrgId },
    claimType: "OFFICIAL_STATEMENT",
    claimTypeRegistryVersion: 1,
    statement: "Hidden statement",
    publicWording: "HIDDEN ORG CLAIM",
    structuredValue: {
      claimType: "OFFICIAL_STATEMENT",
      speakingOrganizationId: hiddenOrgId,
      statementDatePrecision: "UNKNOWN",
      channel: "PRESS_RELEASE",
    },
    recordLifecycle: "ACTIVE",
    assessment: { outcome: "SUPPORTED", methodologyVersion: "v1", limitations: [] },
    publication: { status: "PUBLISHED", publishedAt: NOW },
    review: { status: "CLOSED", priority: "NORMAL" },
    evidence: [],
    organizationResponses: [],
    responseSolicitations: [],
    recordedAt: NOW,
  });

  const edgeId = await seedEntity(h, "relationships", {
    subject: { type: "ORGANIZATION", id: orgId },
    predicate: "OWNS",
    predicateRegistryVersion: 1,
    object: { type: "BRAND", id: brandId },
    validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
    recordLifecycle: "ACTIVE",
    assessment: { outcome: "SUPPORTED", methodologyVersion: "v1", limitations: [] },
    publication: {
      status: "PUBLISHED",
      publishedAt: new Date("2026-07-07T00:00:00.000Z"),
    },
    review: { status: "CLOSED", priority: "NORMAL" },
    publicWording: "Acme Holding owns the Acme brand.",
    evidence,
    organizationResponses: [{
      _id: new ObjectId(),
      respondingOrganizationId: orgId,
      responseText: "We confirm the ownership record.",
      submittedAt: NOW,
      receivedVia: "OFFICIAL_EMAIL",
      representativeVerification: { status: "VERIFIED" },
      publicationStatus: "PUBLIC",
    }],
    responseSolicitations: [{
      _id: new ObjectId(),
      organizationId: orgId,
      channel: "OFFICIAL_EMAIL",
      sentAt: NOW,
      sentBy: new ObjectId(),
      assertionsSummary: "Please respond.",
      responseDeadline: new Date("2026-08-15T00:00:00.000Z"),
      outcome: "RESPONDED",
    }],
    researchNotes: [],
    recordedAt: NOW,
  });

  const hiddenEdgeId = await seedEntity(h, "relationships", {
    subject: { type: "ORGANIZATION", id: hiddenOrgId },
    predicate: "OWNS",
    predicateRegistryVersion: 1,
    object: { type: "BRAND", id: brandId },
    validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
    recordLifecycle: "ACTIVE",
    assessment: { outcome: "SUPPORTED", methodologyVersion: "v1", limitations: [] },
    publication: { status: "DRAFT" },
    review: { status: "QUEUED", priority: "NORMAL" },
    evidence: [],
    organizationResponses: [],
    responseSolicitations: [],
    recordedAt: NOW,
  });

  const downstreamEdgeId = await seedEntity(h, "relationships", {
    subject: { type: "ORGANIZATION", id: orgId },
    predicate: "OWNS",
    predicateRegistryVersion: 1,
    object: { type: "ORGANIZATION", id: downstreamOrgId },
    validity: { validFrom: null, validTo: null, datePrecision: "UNKNOWN" },
    recordLifecycle: "ACTIVE",
    assessment: { outcome: "SUPPORTED", methodologyVersion: "v1", limitations: [] },
    publication: { status: "PUBLISHED", publishedAt: NOW },
    review: { status: "CLOSED", priority: "NORMAL" },
    publicWording: "MULTI HOP OWNERSHIP CONCLUSION",
    evidence: [],
    organizationResponses: [],
    responseSolicitations: [],
    recordedAt: NOW,
  });

  await seedEntity(h, "corrections", {
    target: { type: "CLAIM", id: productClaimId },
    submissionKind: "CORRECT_EXISTING",
    reason: "The previous wording overstated the source.",
    submittedBy: new ObjectId(),
    submittedAt: NOW,
    idempotencyKey: "public-notice-1",
    status: "APPROVED",
    review: {},
    application: {
      appliedAt: NOW,
      result: "APPLIED",
      idempotencyKey: "public-notice-apply",
    },
    publicNotice: {
      correctedAt: NOW,
      reason: "The previous wording overstated the source.",
      previousWording: "The package definitely proves Iranian origin.",
      auditEventId: new ObjectId(),
    },
  });

  return {
    productId,
    brandId,
    orgId,
    hiddenOrgId,
    downstreamOrgId,
    productClaimId,
    brandClaimId,
    orgClaimId,
    hiddenClaimId,
    edgeId,
    hiddenEdgeId,
    downstreamEdgeId,
    snapshotId,
  };
}

async function callProfile(
  h: Harness,
  set: {
    id?: string;
    gtin?: string;
    scheme?: string;
    value?: string;
    jurisdiction?: string;
    issuer?: string;
  },
) {
  return await getPublicProfile(
    { model: "products", act: "getPublicProfile", details: { set } },
    {
      auth: null,
      requestId: "test",
      ip: "127.0.0.1",
      now: NOW,
      db: h.db,
      config: CONFIG,
    },
  ) as Record<string, unknown> & {
    findings: Array<Record<string, unknown>>;
    unknowns: Array<{ code: string; message: string }>;
  };
}

Deno.test({
  name: "public profile: inheritance is labeled, bounded, and deduplicated (I11/S19)",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan09_inheritance");
    try {
      const seed = await seedProfile(h);
      const assembled = await assemblePublicProfile({
        db: h.db,
        resolution: { state: "FOUND", productId: seed.productId, confidence: "EXACT" },
        now: NOW,
      });
      const profile = assembled.profile;

      await t.step("product, brand, and connected organization findings are separated", () => {
        assertEquals(profile.noUniversalScore, true);
        assertEquals(profile.product?.name, "Acme Soap");
        assertEquals(profile.brand?.name, "Acme");
        const byId = new Map(profile.findings.map((finding) => [
          String(finding.findingId),
          finding,
        ]));
        assertEquals(byId.get(String(seed.productClaimId))?.scope, "PRODUCT");
        assertEquals(byId.get(String(seed.brandClaimId))?.scope, "BRAND");
        assertEquals(byId.get(String(seed.orgClaimId))?.scope, "ORGANIZATION");
        assertEquals(
          (byId.get(String(seed.brandClaimId))?.inheritedFrom as Record<string, unknown>).name,
          "Acme",
        );
        assertEquals(byId.get(String(seed.edgeId))?.scope, "BRAND");
      });

      await t.step("one organization hop is allowed and a third hop is not", () => {
        assertEquals(
          profile.findings.some((f) => String(f.findingId) === String(seed.orgClaimId)),
          true,
        );
        assertEquals(
          profile.findings.some((f) => String(f.findingId) === String(seed.downstreamEdgeId)),
          false,
        );
        assertEquals(
          JSON.stringify(profile).includes("MULTI HOP OWNERSHIP CONCLUSION"),
          false,
        );
      });

      await t.step("an organization without a published edge is excluded", () => {
        assertEquals(
          profile.findings.some((f) => String(f.findingId) === String(seed.hiddenClaimId)),
          false,
        );
        assertEquals(
          profile.findings.some((f) => String(f.findingId) === String(seed.hiddenEdgeId)),
          false,
        );
      });

      await t.step("evidence, responses, reply state, and unknowns are explicit", () => {
        const edge = profile.findings.find((f) => String(f.findingId) === String(seed.edgeId))!;
        assertEquals((edge.evidence as unknown[]).length, 1);
        assertEquals((edge.organizationResponses as unknown[]).length, 1);
        assertEquals(
          (edge.organizationResponses as Array<Record<string, unknown>>)[0].representativeVerified,
          true,
        );
        assertEquals((edge.rightOfReply as Record<string, unknown>).outcome, "RESPONDED");
        assert(
          profile.unknowns.some((item) =>
            item.code === PUBLIC_UNKNOWN_CODES.MISSING_VALIDITY_DATES
          ),
        );
        assert(
          profile.unknowns.some((item) => item.code === PUBLIC_UNKNOWN_CODES.UNVERIFIED_IDENTIFIER),
        );
      });

      await t.step("a published correction notice is attached to the finding", () => {
        const productFinding = profile.findings.find((finding) =>
          String(finding.findingId) === String(seed.productClaimId)
        )!;
        const notice = productFinding.correctionNotice as Record<string, unknown>;
        assertEquals(notice.previousWording, "The package definitely proves Iranian origin.");
        assertEquals(notice.reason, "The previous wording overstated the source.");
        assert(notice.auditEventId instanceof ObjectId);
      });

      await t.step(
        "conflicting evidence stays separate and an evidence gap is explicit",
        async () => {
          const link = (stance: string) => ({
            _id: new ObjectId(),
            sourceSnapshotId: seed.snapshotId,
            stance,
            excerpt: `Evidence ${stance.toLowerCase()}.`,
            addedBy: new ObjectId(),
            addedAt: NOW,
          });
          const conflictingId = await seedEntity(h, "claims", {
            about: { type: "PRODUCT", id: seed.productId },
            claimType: "PRODUCT_ORIGIN",
            claimTypeRegistryVersion: 1,
            statement: "Sources disagree on origin.",
            publicWording: "Sources disagree about the declared origin.",
            structuredValue: {
              claimType: "PRODUCT_ORIGIN",
              declaredOriginCountryCode: "IR",
              declarationSurface: "PACKAGE",
            },
            recordLifecycle: "ACTIVE",
            assessment: {
              outcome: "DISPUTED",
              methodologyVersion: "v1",
              limitations: ["CONFLICTING_EVIDENCE"],
            },
            publication: { status: "PUBLISHED", publishedAt: NOW },
            review: { status: "CLOSED", priority: "NORMAL" },
            evidence: [link("SUPPORTS"), link("CONTRADICTS")],
            organizationResponses: [],
            responseSolicitations: [],
            recordedAt: NOW,
          });
          const noEvidenceId = await seedEntity(h, "claims", {
            about: { type: "PRODUCT", id: seed.productId },
            claimType: "PRODUCT_ORIGIN",
            claimTypeRegistryVersion: 1,
            statement: "No evidence captured.",
            publicWording: "No public evidence is available for this finding.",
            structuredValue: {
              claimType: "PRODUCT_ORIGIN",
              declaredOriginCountryCode: "IR",
              declarationSurface: "PACKAGE",
            },
            recordLifecycle: "ACTIVE",
            assessment: { outcome: "NOT_ASSESSED", methodologyVersion: "v1", limitations: [] },
            publication: { status: "PUBLISHED", publishedAt: NOW },
            review: { status: "CLOSED", priority: "NORMAL" },
            evidence: [],
            organizationResponses: [],
            responseSolicitations: [],
            recordedAt: NOW,
          });
          const expanded = await assemblePublicProfile({
            db: h.db,
            resolution: { state: "FOUND", productId: seed.productId, confidence: "EXACT" },
            now: NOW,
          });
          const conflicting = expanded.profile.findings.find((finding) =>
            String(finding.findingId) === String(conflictingId)
          )!;
          assertEquals(conflicting.assessmentOutcome, "DISPUTED");
          assertEquals(
            [...new Set(conflicting.evidence.map((item) => item.stance))].sort(),
            ["CONTRADICTS", "SUPPORTS"],
          );
          const noEvidence = expanded.profile.findings.find((finding) =>
            String(finding.findingId) === String(noEvidenceId)
          )!;
          assertEquals(noEvidence.evidence.length, 0);
          assert(
            expanded.profile.unknowns.some((item) =>
              item.code === PUBLIC_UNKNOWN_CODES.MISSING_EVIDENCE
            ),
          );
          assertFalse(JSON.stringify(expanded.profile).includes('"score"'));
          assertFalse(JSON.stringify(expanded.profile).includes('"verdict"'));
        },
      );

      await t.step("restricted source evidence is withheld with an explicit unknown", async () => {
        const snapshot = await h.db.collection("source_snapshots").findOne({
          _id: seed.snapshotId,
        });
        const sourceId = ((snapshot?.source ?? {}) as Record<string, unknown>)._id as ObjectId;
        await h.db.collection("sources").updateOne(
          { _id: sourceId },
          { $set: { access: "RESTRICTED" } },
        );
        const restricted = await assemblePublicProfile({
          db: h.db,
          resolution: { state: "FOUND", productId: seed.productId, confidence: "EXACT" },
          now: NOW,
        });
        const edge = restricted.profile.findings.find((finding) =>
          String(finding.findingId) === String(seed.edgeId)
        )!;
        assertEquals(edge.evidence.length, 0);
        assert(
          restricted.profile.unknowns.some((item) =>
            item.code === PUBLIC_UNKNOWN_CODES.EVIDENCE_WITHHELD
          ),
        );
      });

      await t.step("no internal field, reviewer id, private note, or score leaks", () => {
        const raw = JSON.stringify(profile);
        for (
          const forbidden of [
            "PRIVATE RESEARCH NOTE",
            "decidedBy",
            "assessedBy",
            "sourceSnapshotId",
            "score",
            "verdict",
            "badge",
          ]
        ) {
          assertFalse(raw.includes(forbidden), forbidden);
        }
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "public profile action: honest resolution states and merged redirect",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan09_resolution");
    try {
      const seed = await seedProfile(h);
      const survivor = await seedEntity(h, "products", {
        name: "Survivor",
        normalizedName: "survivor",
        matchKey: "survivor",
        identifiers: [],
        brandMapping: { status: "UNMAPPED" },
        lifecycle: "ACTIVE",
      });
      const merged = await seedEntity(h, "products", {
        name: "Old Name",
        normalizedName: "old name",
        matchKey: "oldname",
        identifiers: [identifier("00000000000604")],
        brandMapping: { status: "UNMAPPED" },
        lifecycle: "MERGED",
        mergedIntoId: survivor,
      });
      const disputed = await seedEntity(h, "products", {
        name: "Disputed",
        normalizedName: "disputed",
        matchKey: "disputed",
        identifiers: [identifier("00000000000208", "DISPUTED")],
        brandMapping: { status: "UNMAPPED" },
        lifecycle: "ACTIVE",
      });
      await seedEntity(h, "products", {
        name: "Duplicate A",
        normalizedName: "duplicate a",
        matchKey: "duplicatea",
        identifiers: [identifier("00000000000109")],
        brandMapping: { status: "UNMAPPED" },
        lifecycle: "ACTIVE",
      });
      await seedEntity(h, "products", {
        name: "Duplicate B",
        normalizedName: "duplicate b",
        matchKey: "duplicateb",
        identifiers: [identifier("00000000000109")],
        brandMapping: { status: "UNMAPPED" },
        lifecycle: "ACTIVE",
      });

      await t.step("FOUND returns the profile", async () => {
        const profile = await callProfile(h, { id: seed.productId.toString() });
        assertEquals((profile.resolution as Record<string, unknown>).state, "FOUND");
        assertEquals((profile.product as Record<string, unknown>).name, "Acme Soap");
      });

      await t.step("NOT_FOUND is useful, not an error", async () => {
        const profile = await callProfile(h, { gtin: "00000000000031" });
        assertEquals((profile.resolution as Record<string, unknown>).state, "NOT_FOUND");
        assert(
          profile.unknowns.some((item) => item.code === PUBLIC_UNKNOWN_CODES.CONTRIBUTION_GUIDANCE),
        );
      });

      await t.step("AMBIGUOUS returns candidates and never chooses one", async () => {
        const profile = await callProfile(h, { gtin: "00000000000109" });
        const resolution = profile.resolution as Record<string, unknown>;
        assertEquals(resolution.state, "AMBIGUOUS");
        assertEquals((resolution.candidates as unknown[]).length, 2);
        assertEquals(profile.product, undefined);
      });

      await t.step("DISPUTED is first class", async () => {
        const profile = await callProfile(h, { gtin: "00000000000208" });
        assertEquals((profile.resolution as Record<string, unknown>).state, "DISPUTED");
        assert(
          profile.unknowns.some((item) => item.code === PUBLIC_UNKNOWN_CODES.UNRESOLVED_DISPUTE),
        );
      });

      await t.step("UNVERIFIED is first class", async () => {
        const profile = await callProfile(h, { gtin: "00000000000307" });
        assertEquals((profile.resolution as Record<string, unknown>).state, "UNVERIFIED");
      });

      await t.step("a merged id redirects with a notice and the survivor profile", async () => {
        const profile = await callProfile(h, { id: merged.toString() });
        assertEquals((profile.resolution as Record<string, unknown>).state, "FOUND");
        assertEquals((profile.product as Record<string, unknown>).name, "Survivor");
        assert(
          profile.unknowns.some((item) =>
            item.code === PUBLIC_UNKNOWN_CODES.MERGED_IDENTITY_REDIRECT
          ),
        );
        assertEquals((profile.resolution as Record<string, unknown>).productId, survivor);
      });

      await t.step("invalid identifiers are sanitized", async () => {
        let status = 0;
        try {
          await callProfile(h, { gtin: "not-a-gtin" });
        } catch (error) {
          status = (error as { status: number }).status;
        }
        assertEquals(status, 422);
      });

      await t.step("disputed product id remains disputed through the id path", async () => {
        const profile = await callProfile(h, { id: disputed.toString() });
        assertEquals((profile.resolution as Record<string, unknown>).state, "DISPUTED");
      });

      await t.step("S19 scan of a leading-zero GTIN resolves to the same profile", async () => {
        const profile = await callProfile(h, { gtin: GTIN });
        assertEquals((profile.resolution as Record<string, unknown>).state, "FOUND");
        assertEquals((profile.product as Record<string, unknown>).name, "Acme Soap");
        assertEquals((profile.findings as unknown[]).length > 0, true);
        console.log(JSON.stringify({
          scenario: "S19-scan",
          input: `gtin:${GTIN}`,
          resolution: "FOUND",
          findings: (profile.findings as unknown[]).length,
          unknowns: profile.unknowns.length,
        }));
      });

      await t.step("an absent brand is an explicit unknown, not a fabricated match", async () => {
        const unbranded = await seedEntity(h, "products", {
          name: "Unbranded",
          normalizedName: "unbranded",
          matchKey: "unbranded",
          identifiers: [],
          brandMapping: { status: "UNMAPPED" },
          lifecycle: "ACTIVE",
        });
        const profile = await callProfile(h, { id: unbranded.toString() });
        assertEquals(profile.brand, undefined);
        assert(
          profile.unknowns.some((item) => item.code === PUBLIC_UNKNOWN_CODES.MISSING_BRAND),
        );
        assert(
          profile.unknowns.some((item) => item.code === PUBLIC_UNKNOWN_CODES.NO_PUBLISHED_FINDINGS),
        );
      });

      await t.step("an explicit scheme and value resolve like a scan", async () => {
        const profile = await callProfile(h, { scheme: "GTIN", value: GTIN });
        assertEquals((profile.resolution as Record<string, unknown>).state, "FOUND");
        assertEquals((profile.product as Record<string, unknown>).name, "Acme Soap");
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "read model: S30 byte-identical rebuild, repair queue, and freshness",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan09_readmodel");
    try {
      const seed = await seedProfile(h);
      await ensureReadModelIndexes(h.db);
      const first = await rebuildProfile({ db: h.db, productId: seed.productId, now: NOW });
      await h.db.collection("product_public_profiles").deleteMany({});
      const rebuiltAt = new Date("2026-08-02T00:00:00.000Z");
      const second = await rebuildProfile({
        db: h.db,
        productId: seed.productId,
        now: rebuiltAt,
      });
      const firstBytes = new TextEncoder().encode(stableStringify(first.payload));
      const secondBytes = new TextEncoder().encode(stableStringify(second.payload));
      const digest = async (bytes: Uint8Array) =>
        [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map((value) => value.toString(16).padStart(2, "0")).join("");
      assertEquals(stableStringify(first.payload), stableStringify(second.payload));
      assertEquals(stableStringify(first.sourceVersions), stableStringify(second.sourceVersions));
      assertEquals(first.payload.builtAt, second.payload.builtAt);
      console.log(JSON.stringify({
        scenario: "S30",
        byteIdentical: true,
        firstBytes: firstBytes.byteLength,
        secondBytes: secondBytes.byteLength,
        firstSha256: await digest(firstBytes),
        secondSha256: await digest(secondBytes),
        sourceVersionKeys: Object.keys(first.sourceVersions).length,
      }));
      assertEquals(first._id.equals(seed.productId), true);

      await t.step("sourceVersions are ordered and detect stale payloads", () => {
        const keys = Object.keys(first.sourceVersions);
        assertEquals(keys, [...keys].sort());
        assert(keys.some((key) => key.startsWith("products:")));
        assert(keys.some((key) => key.startsWith("brands:")));
        assert(keys.some((key) => key.startsWith("claims:")));
      });

      await t.step("a stale read model is detected and rebuilt on read", async () => {
        await h.db.collection("products").updateOne(
          { _id: seed.productId },
          {
            $set: { name: "Renamed Soap", updatedAt: new Date("2026-08-02T00:00:00.000Z") },
            $inc: { version: 1 },
          },
        );
        const fresh = await getFreshProfile({
          db: h.db,
          productId: seed.productId,
          now: new Date("2026-08-02T00:00:00.000Z"),
        });
        assertEquals(fresh.rebuilt, true);
        assertEquals(fresh.record.payload.product?.name, "Renamed Soap");
      });

      await t.step("rebuild-all is repeatable", async () => {
        const summary = await rebuildAllProfiles({ db: h.db, now: NOW });
        assertEquals(summary.rebuilt, 1);
        assertEquals(summary.failed, 0);
      });

      await t.step("a missed rebuild is queued and repaired", async () => {
        await h.db.collection("product_public_profiles").deleteMany({});
        await requestRebuildsForFinding({
          db: h.db,
          targetType: "CLAIM",
          targetId: seed.brandClaimId,
          reason: "test publication change",
          now: NOW,
        });
        const repaired = await repairPublicProfiles({ db: h.db, now: NOW });
        assertEquals(repaired.repaired, 1);
        assertEquals(repaired.failed, 0);
        assertEquals((await getProfileRecord(h.db, seed.productId)) !== null, true);
      });

      await t.step("a brand-relation change queues every product of the brand", async () => {
        const ids = await requestRebuildsForEntity({
          db: h.db,
          entityType: "BRAND",
          entityId: seed.brandId,
          reason: "brand relation changed",
          now: NOW,
        });
        assertEquals(ids.map(String).includes(seed.productId.toString()), true);
        assertEquals(
          await h.db.collection("public_profile_rebuild_queue").countDocuments({
            productId: seed.productId,
            status: "PENDING",
          }),
          1,
        );
      });

      await t.step("the unique productId index exists", async () => {
        const indexes = await h.db.collection("product_public_profiles").indexes();
        const unique = indexes.find((index) => index.name === "product_public_profiles_productId");
        assert(unique);
        assertEquals(unique.unique, true);
      });
    } finally {
      await h.close();
    }
  },
});

Deno.test({
  name: "retraction: S24 synchronous read-model and surface purge, no resurrection",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan09_retraction");
    resetPublicSurfaces();
    const surface = createInMemoryPublicSurface("cache-cdn");
    const searchSurface = createInMemoryPublicSurface("search-index");
    const unregister = registerPublicSurface(surface.surface);
    const unregisterSearch = registerPublicSurface(searchSurface.surface);
    try {
      const seed = await seedProfile(h);
      await rebuildProfile({ db: h.db, productId: seed.productId, now: NOW });
      surface.seed({
        productId: seed.productId.toString(),
        findingIds: [seed.brandClaimId.toString()],
        payload: { stale: true },
      });
      searchSurface.seed({
        productId: seed.productId.toString(),
        findingIds: [seed.brandClaimId.toString()],
        payload: { search: true },
      });
      const publisherId = await seedEntity(h, "users", {
        accountStatus: "ACTIVE",
        roles: ["MODERATOR"],
        trustLevel: "REGULAR",
      });
      const claim = await h.db.collection("claims").findOne({ _id: seed.brandClaimId });

      await t.step("retraction deletes the read model and purges surfaces", async () => {
        const startedAt = performance.now();
        const retraction = await retractFinding({
          db: h.db,
          targetType: "CLAIM",
          targetId: seed.brandClaimId,
          expectedVersion: Number(claim!.version ?? 0),
          reason: "source superseded",
          actor: { type: "USER", id: publisherId },
          now: NOW,
        });
        const elapsed = performance.now() - startedAt;
        assert(elapsed < 60_000);
        console.log(JSON.stringify({
          scenario: "S24",
          query: "retractFinding -> read model -> cache/CDN -> search index",
          endToEndMs: Number(elapsed.toFixed(2)),
          surfaces: retraction.surfaceTimings.map((timing) => ({
            surface: timing.surface,
            durationMs: timing.durationMs,
          })),
        }));
        assertEquals(await getProfileRecord(h.db, seed.productId), null);
        assertEquals(surface.cache.size, 0);
        assertEquals(surface.searchIndex.get(seed.productId.toString()), []);
        assertEquals(searchSurface.cache.size, 0);
        assertEquals(searchSurface.searchIndex.get(seed.productId.toString()), []);
      });

      await t.step("rebuild cannot resurrect a retracted finding", async () => {
        const record = await rebuildProfile({ db: h.db, productId: seed.productId, now: NOW });
        const ids = record.payload.findings.map((finding) => finding.findingId.toString());
        assertEquals(ids.includes(seed.brandClaimId.toString()), false);
        assertEquals(JSON.stringify(record).includes("HIDDEN ORG CLAIM"), false);
      });

      await t.step("the retraction is audited", async () => {
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            "target.id": seed.brandClaimId,
            action: "FINDING_RETRACTED",
          }),
          1,
        );
      });
    } finally {
      unregister();
      unregisterSearch();
      resetPublicSurfaces();
      await h.close();
    }
  },
});

Deno.test({
  name: "retraction: a failed surface purge leaves a visible repair record",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan09_surface_repair");
    resetPublicSurfaces();
    const unregister = registerPublicSurface({
      name: "broken-cdn",
      purge() {
        throw new Error("cdn purge failed");
      },
    });
    try {
      const seed = await seedProfile(h);
      await rebuildProfile({ db: h.db, productId: seed.productId, now: NOW });
      let failed = false;
      try {
        await invalidatePublicProjections({
          db: h.db,
          targetType: "CLAIM",
          targetId: seed.productClaimId,
          reason: "forced failure",
          now: NOW,
        });
      } catch {
        failed = true;
      }
      assertEquals(failed, true);
      const repair = await h.db.collection(SURFACE_REPAIR_COLLECTION).findOne({
        targetId: seed.productClaimId,
      });
      assert(repair);
      assertEquals(repair.status, "PENDING");
      assertEquals(repair.error, "cdn purge failed");
    } finally {
      unregister();
      resetPublicSurfaces();
      await h.close();
    }
  },
});

Deno.test({
  name: "S19: warm public profile p95 stays under 400 ms on the seeded profile",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const h = await createHarness("ansoo_plan09_latency");
    try {
      const seed = await seedProfile(h);
      await rebuildProfile({ db: h.db, productId: seed.productId, now: NOW });
      const samples: number[] = [];
      let payloadBytes = 0;
      for (let index = 0; index < 60; index++) {
        const startedAt = performance.now();
        const profile = await callProfile(h, { id: seed.productId.toString() });
        samples.push(performance.now() - startedAt);
        payloadBytes = new TextEncoder().encode(JSON.stringify(profile)).byteLength;
      }
      samples.sort((left, right) => left - right);
      const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
      const buildInfo = await h.db.admin().command({ buildInfo: 1 });
      console.log(JSON.stringify({
        scenario: "S19",
        query: "products.getPublicProfile by id (read model hit)",
        samples: samples.length,
        p50Ms: Number(samples[Math.floor(samples.length * 0.5)].toFixed(2)),
        p95Ms: Number(p95.toFixed(2)),
        payloadBytes,
        platform: `${Deno.build.os} ${Deno.build.arch}`,
        deno: Deno.version.deno,
        mongo: buildInfo.version,
        lesan: "0.2.3",
        documents: {
          products: await h.db.collection("products").countDocuments(),
          claims: await h.db.collection("claims").countDocuments(),
          relationships: await h.db.collection("relationships").countDocuments(),
          sources: await h.db.collection("sources").countDocuments(),
          snapshots: await h.db.collection("source_snapshots").countDocuments(),
        },
      }));
      assertEquals(p95 < 400, true, `p95 ${p95.toFixed(2)}ms`);
    } finally {
      await h.close();
    }
  },
});
