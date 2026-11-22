// Plan 06 - Sources, immutable snapshots, assets, redaction, delivery, purge.
import { assert, assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import {
  captureSnapshot,
  clientAssetView,
  completeAssetScan,
  createAsset,
  createLocalStorageProvider,
  createSignedAssetUrl,
  createSource,
  getAssetInternal,
  getSnapshot,
  getSource,
  purgeAsset,
  redactSnapshot,
  resolveSignedAsset,
  setAssetVisibility,
  sha256Hex,
  snapshotDisclosure,
  updateSnapshotContent,
  verifySignedAssetUrl,
} from "../../utils/provenance/mod.ts";
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

async function rejection(
  promise: Promise<unknown>,
): Promise<{ code: string; status: number; details?: Record<string, unknown> }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; status: number; details?: Record<string, unknown> };
  }
  throw new Error("expected rejection");
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function publicAsset(
  h: Awaited<ReturnType<typeof createHarness>>,
  provider: ReturnType<typeof createLocalStorageProvider>,
  reviewer: { type: "USER"; id: ObjectId },
  body: string,
  now: Date,
): Promise<{ id: ObjectId; version: number }> {
  const created = await createAsset({
    db: h.db,
    provider,
    bytes: text(body),
    declaredMimeType: "text/plain",
    originalFileName: "capture.txt",
    visibility: "PUBLIC_APPROVED",
    actor: reviewer,
    now,
  });
  const scanned = await completeAssetScan({
    db: h.db,
    assetId: created.assetId,
    result: "CLEAN",
    engine: "test-scanner",
    expectedVersion: created.version,
    actor: reviewer,
    now,
  });
  return { id: created.assetId, version: scanned.version };
}

Deno.test({
  name: "I08 - SourceSnapshot content identity is immutable",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan06_capture");
    const root = await Deno.makeTempDir({ prefix: "ansoo-plan06-" });
    const provider = createLocalStorageProvider(root);
    try {
      const researcher = await actor(h);
      const reviewer = await actor(h, ["RESEARCH_REVIEWER"]);
      const contributor = await actor(h, ["CONTRIBUTOR"]);
      const admin = await actor(h, ["ADMIN"]);

      const source = await createSource({
        db: h.db,
        title: "Example Registry",
        canonicalUrl: "https://example.com/registry",
        sourceType: "OFFICIAL_REGISTRY",
        publisherName: "Example Registry",
        publisherVerified: true,
        actor: researcher,
        now: new Date("2026-01-01T00:00:00Z"),
      });
      let sourceVersion = source.version;

      await t.step("enforces source roles, URL canonicalization, and DATASET license", async () => {
        assertEquals(
          (await rejection(createSource({
            db: h.db,
            title: "Nope",
            sourceType: "NEWS",
            actor: contributor,
          }))).code,
          "FORBIDDEN",
        );
        assertEquals(
          (await rejection(createSource({
            db: h.db,
            title: "Dataset",
            sourceType: "DATASET",
            actor: researcher,
          }))).code,
          "LICENSE_REQUIRED",
        );
        const stored = await h.db.collection("sources").findOne({ _id: source.id });
        assertEquals(stored?.canonicalUrl, "https://example.com/registry");
        assertEquals(stored?.lastCapturedAt ?? null, null);
      });

      const firstBytes = text("first capture");
      const first = await captureSnapshot({
        db: h.db,
        provider,
        sourceId: source.id,
        bytes: firstBytes,
        retrievedAt: new Date("2026-01-02T00:00:00Z"),
        titleAtCapture: "Registry page",
        canonicalUrlAtCapture: "https://example.com/registry",
        captureMethod: "CRAWLER",
        acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
        captureMetadata: { httpStatus: 200 },
        actor: researcher,
      });

      await t.step(
        "captures an immutable snapshot with a hash and RESEARCH_ONLY asset",
        async () => {
          const doc = await getSnapshot(h.db, first.snapshotId);
          assertEquals(doc.contentHash, await sha256Hex(firstBytes));
          assertEquals(doc.lifecycle, "AVAILABLE");
          assertEquals(doc.assetId?.toString(), first.assetId?.toString());
          const asset = await getAssetInternal(h.db, first.assetId!);
          assertEquals(asset.visibility, "RESEARCH_ONLY");
          assertEquals(asset.processingStatus, "QUARANTINED");
          assertEquals((asset.storage as Record<string, unknown>).objectKey ? true : false, true);
          assert(!JSON.stringify(clientAssetView(asset)).includes("objectKey"));
          assertEquals(
            await h.db.collection("audit_events")
              .countDocuments({ "target.id": first.snapshotId, action: "SNAPSHOT_CREATED" }),
            1,
          );
        },
      );

      await t.step("records lastCapturedAt and a bounded recent snapshot preview", async () => {
        const view = await getSource({
          db: h.db,
          id: source.id,
          includeRecentSnapshots: true,
          snapshotLimit: 1,
        });
        assertEquals(
          new Date(view.lastCapturedAt as Date).toISOString(),
          "2026-01-02T00:00:00.000Z",
        );
        assertEquals(view.recentSnapshotsPreview?.length, 1);

        const updated = await h.db.collection("sources").updateOne(
          { _id: source.id },
          { $inc: { version: 1 } },
        );
        assertEquals(updated.modifiedCount, 1);
        sourceVersion += 1;

        const second = await captureSnapshot({
          db: h.db,
          provider,
          sourceId: source.id,
          bytes: text("second capture"),
          retrievedAt: new Date("2026-01-03T00:00:00Z"),
          captureMethod: "CRAWLER",
          acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
          actor: researcher,
        });
        const preview = await getSource({
          db: h.db,
          id: source.id,
          includeRecentSnapshots: true,
          snapshotLimit: 1,
        });
        assertEquals(
          preview.recentSnapshotsPreview?.[0]._id?.toString(),
          second.snapshotId.toString(),
        );
      });

      await t.step("rejects content-identity patches and keeps the original hash", async () => {
        const before = await getSnapshot(h.db, first.snapshotId);
        const error = await rejection(updateSnapshotContent({
          db: h.db,
          snapshotId: first.snapshotId,
          patch: { contentHash: "b".repeat(64), retrievedAt: new Date() },
        }));
        assertEquals(error.code, "SNAPSHOT_IMMUTABLE");
        assertEquals(error.status, 409);
        const after = await getSnapshot(h.db, first.snapshotId);
        assertEquals(after.contentHash, before.contentHash);
        assertEquals(after.retrievedAt, before.retrievedAt);
      });

      await t.step("creates a superseding snapshot without mutating the previous one", async () => {
        const before = await getSnapshot(h.db, first.snapshotId);
        const correction = await captureSnapshot({
          db: h.db,
          provider,
          sourceId: source.id,
          supersedesSnapshotId: first.snapshotId,
          retrievedAt: new Date("2026-01-04T00:00:00Z"),
          captureMethod: "MANUAL",
          acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
          actor: researcher,
        });
        const next = await getSnapshot(h.db, correction.snapshotId);
        assertEquals(next.contentHash, before.contentHash);
        assertEquals(next.supersedesSnapshotId?.toString(), first.snapshotId.toString());
        const unchanged = await getSnapshot(h.db, first.snapshotId);
        assertEquals(unchanged.supersedesSnapshotId ?? null, null);
        assertEquals(unchanged.contentHash, before.contentHash);
      });

      await t.step("redacts through a retained original and a public derivative", async () => {
        const derivative = await publicAsset(
          h,
          provider,
          reviewer,
          "redacted derivative",
          new Date("2026-01-05T00:00:00Z"),
        );
        const redacted = await redactSnapshot({
          db: h.db,
          snapshotId: first.snapshotId,
          redactedAssetId: derivative.id,
          reason: "remove personal data",
          method: "TEXT_REMOVAL",
          actor: reviewer,
        });
        assertEquals(redacted.contentHash, first.contentHash);
        const original = await getAssetInternal(h.db, first.assetId!);
        assertEquals(original.visibility, "PRIVATE");
        const snapshot = await getSnapshot(h.db, first.snapshotId);
        assertEquals((snapshot.redaction as Record<string, unknown>).originalRetained, true);
        const disclosure = snapshotDisclosure(snapshot);
        assertEquals(disclosure.isRedacted, true);
        assertEquals(disclosure.contentHash, first.contentHash);
        assertEquals(disclosure.servedAssetId?.toString(), derivative.id.toString());
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": first.snapshotId, action: "SNAPSHOT_REDACTED" }),
          1,
        );
        assertEquals(
          (await rejection(redactSnapshot({
            db: h.db,
            snapshotId: first.snapshotId,
            redactedAssetId: derivative.id,
            reason: "again",
            method: "TEXT_REMOVAL",
            actor: reviewer,
          }))).code,
          "ALREADY_REDACTED",
        );
      });

      await t.step(
        "signed delivery rejects expiry, tampering, and visibility changes",
        async () => {
          const deliverable = await publicAsset(
            h,
            provider,
            reviewer,
            "deliverable bytes",
            new Date("2026-01-06T00:00:00Z"),
          );
          const secret = "test-secret-value-123456";
          const signed = await createSignedAssetUrl({
            db: h.db,
            assetId: deliverable.id,
            secret,
            ttlSeconds: 60,
            now: new Date("2026-01-06T00:01:00Z"),
          });
          assert(signed.url.includes(`/assets/${deliverable.id.toString()}?`));
          assert(!signed.url.includes("objectKey"));
          const parts = new URL(`https://local${signed.url}`).searchParams;
          const served = await resolveSignedAsset({
            db: h.db,
            provider,
            assetId: deliverable.id,
            expires: parts.get("expires")!,
            sig: parts.get("sig")!,
            secret,
            now: new Date("2026-01-06T00:01:30Z"),
          });
          assertEquals(new TextDecoder().decode(served.bytes), "deliverable bytes");

          assertEquals(
            (await rejection(verifySignedAssetUrl({
              db: h.db,
              assetId: deliverable.id,
              expires: parts.get("expires")!,
              sig: parts.get("sig")!,
              secret,
              now: new Date("2026-01-06T00:02:01Z"),
            }))).code,
            "URL_EXPIRED",
          );
          const tampered = parts.get("sig")![0] === "a"
            ? `b${parts.get("sig")!.slice(1)}`
            : `a${parts.get("sig")!.slice(1)}`;
          assertEquals(
            (await rejection(verifySignedAssetUrl({
              db: h.db,
              assetId: deliverable.id,
              expires: parts.get("expires")!,
              sig: tampered,
              secret,
              now: new Date("2026-01-06T00:01:30Z"),
            }))).code,
            "INVALID_SIGNATURE",
          );

          const asset = await getAssetInternal(h.db, deliverable.id);
          await setAssetVisibility({
            db: h.db,
            assetId: deliverable.id,
            visibility: "PRIVATE",
            expectedVersion: Number(asset.version),
            reason: "takedown",
            actor: reviewer,
            now: new Date("2026-01-06T00:01:45Z"),
          });
          assertEquals(
            (await rejection(verifySignedAssetUrl({
              db: h.db,
              assetId: deliverable.id,
              expires: parts.get("expires")!,
              sig: parts.get("sig")!,
              secret,
              now: new Date("2026-01-06T00:01:50Z"),
            }))).code,
            "ASSET_NOT_DELIVERABLE",
          );

          await setAssetVisibility({
            db: h.db,
            assetId: deliverable.id,
            visibility: "PUBLIC_APPROVED",
            expectedVersion: Number(asset.version) + 1,
            reason: "restore",
            actor: reviewer,
            now: new Date("2026-01-06T00:01:55Z"),
          });
          await h.db.collection("assets").updateOne(
            { _id: deliverable.id },
            { $set: { legalHold: true } },
          );
          const held = await verifySignedAssetUrl({
            db: h.db,
            assetId: deliverable.id,
            expires: parts.get("expires")!,
            sig: parts.get("sig")!,
            secret,
            now: new Date("2026-01-06T00:01:56Z"),
          });
          assertEquals(held.assetId.toString(), deliverable.id.toString());
          assertEquals(
            (await rejection(purgeAsset({
              db: h.db,
              provider,
              assetId: deliverable.id,
              reason: "cleanup",
              actor: admin,
            }))).code,
            "LEGAL_HOLD",
          );
        },
      );

      await t.step(
        "rejects MIME mismatch, oversized uploads, and quarantined delivery",
        async () => {
          assertEquals(
            (await rejection(createAsset({
              db: h.db,
              provider,
              bytes: text("not a pdf"),
              declaredMimeType: "application/pdf",
              originalFileName: "doc.pdf",
              actor: researcher,
            }))).code,
            "MIME_MISMATCH",
          );
          assertEquals(
            (await rejection(createAsset({
              db: h.db,
              provider,
              bytes: new Uint8Array(20 * 1024 * 1024 + 1),
              declaredMimeType: "text/plain",
              actor: researcher,
            }))).code,
            "CAP_EXCEEDED",
          );
          const quarantined = await createAsset({
            db: h.db,
            provider,
            bytes: text("quarantined bytes"),
            declaredMimeType: "text/plain",
            actor: researcher,
            now: new Date("2026-01-09T00:00:00Z"),
          });
          assertEquals(
            (await rejection(createSignedAssetUrl({
              db: h.db,
              assetId: quarantined.assetId,
              secret: "test-secret-value-123456",
            }))).code,
            "ASSET_NOT_DELIVERABLE",
          );
        },
      );

      await t.step(
        "rejects snapshot/asset hash mismatch and redaction without an original",
        async () => {
          const assetBytes = text("hash mismatch asset");
          const asset = await createAsset({
            db: h.db,
            provider,
            bytes: assetBytes,
            declaredMimeType: "text/plain",
            actor: researcher,
            now: new Date("2026-01-10T00:00:00Z"),
          });
          assertEquals(
            (await rejection(captureSnapshot({
              db: h.db,
              provider,
              sourceId: source.id,
              assetId: asset.assetId,
              contentHash: "c".repeat(64),
              retrievedAt: new Date("2026-01-10T00:00:00Z"),
              captureMethod: "CRAWLER",
              acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
              actor: researcher,
            }))).code,
            "HASH_MISMATCH",
          );

          const hashOnly = await captureSnapshot({
            db: h.db,
            provider,
            sourceId: source.id,
            contentHash: "d".repeat(64),
            retrievedAt: new Date("2026-01-11T00:00:00Z"),
            captureMethod: "CRAWLER",
            acquisitionTier: "A_OFFICIAL_MACHINE_READABLE",
            actor: researcher,
          });
          assertEquals(
            (await rejection(redactSnapshot({
              db: h.db,
              snapshotId: hashOnly.snapshotId,
              redactedAssetId: asset.assetId,
              reason: "cannot redact",
              method: "TEXT_REMOVAL",
              actor: reviewer,
            }))).code,
            "ORIGINAL_ASSET_REQUIRED",
          );
        },
      );

      await t.step("detects stored-byte tampering on signed delivery", async () => {
        const asset = await publicAsset(
          h,
          provider,
          reviewer,
          "integrity bytes",
          new Date("2026-01-12T00:00:00Z"),
        );
        const secret = "test-secret-value-123456";
        const signed = await createSignedAssetUrl({
          db: h.db,
          assetId: asset.id,
          secret,
          now: new Date("2026-01-12T00:01:00Z"),
        });
        const params = new URL(`https://local${signed.url}`).searchParams;
        const doc = await getAssetInternal(h.db, asset.id);
        await provider.put({
          key: String((doc.storage as Record<string, unknown>).objectKey),
          bytes: text("tampered"),
        });
        assertEquals(
          (await rejection(resolveSignedAsset({
            db: h.db,
            provider,
            assetId: asset.id,
            expires: params.get("expires")!,
            sig: params.get("sig")!,
            secret,
            now: new Date("2026-01-12T00:01:30Z"),
          }))).code,
          "ASSET_HASH_MISMATCH",
        );
      });

      await t.step("daily upload quota uses the shared 429 envelope", async () => {
        const quotaUser = await actor(h, ["CONTRIBUTOR"]);
        const today = new Date();
        for (let i = 0; i < 5; i++) {
          await h.db.collection("assets").insertOne({
            uploadedBy: quotaUser.id,
            uploadedAt: today,
          });
        }
        const quota = await rejection(createAsset({
          db: h.db,
          provider,
          bytes: text("quota bytes"),
          declaredMimeType: "text/plain",
          actor: quotaUser,
          now: today,
        }));
        assertEquals(quota.code, "RATE_LIMITED");
        assertEquals(quota.status, 429);
        assertEquals(
          (quota.details?.error as Record<string, unknown> | undefined)?.path,
          "uploadsPerDay",
        );
      });

      await t.step("purge removes bytes and leaves a tombstone", async () => {
        const disposable = await publicAsset(
          h,
          provider,
          reviewer,
          "purge me",
          new Date("2026-01-07T00:00:00Z"),
        );
        const before = await getAssetInternal(h.db, disposable.id);
        const key = String((before.storage as Record<string, unknown>).objectKey);
        await purgeAsset({
          db: h.db,
          provider,
          assetId: disposable.id,
          reason: "retention",
          actor: admin,
          now: new Date("2026-01-08T00:00:00Z"),
        });
        const after = await getAssetInternal(h.db, disposable.id);
        assertEquals(after.lifecycle, "DELETED_PENDING_PURGE");
        let missing = false;
        try {
          await provider.get({ key });
        } catch {
          missing = true;
        }
        assertEquals(missing, true);
        assertEquals(
          await h.db.collection("audit_events")
            .countDocuments({ "target.id": disposable.id, action: "ASSET_PURGED" }),
          1,
        );
      });
    } finally {
      await h.close();
      await Deno.remove(root, { recursive: true }).catch(() => {});
    }
  },
});
