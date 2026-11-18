// Plan 07 - Retention-aware asset purge, legal hold, and audit.
import { assertEquals } from "@std/assert";
import { ObjectId } from "lesan";
import { createLocalStorageProvider, purgeAsset } from "../../utils/provenance/mod.ts";
import { purgeExpiredAssets } from "../../utils/governance/mod.ts";
import { createHarness, MONGO_ENABLED } from "../models/harness.ts";

async function asset(
  h: Awaited<ReturnType<typeof createHarness>>,
  provider: ReturnType<typeof createLocalStorageProvider>,
  key: string,
  lifecycle: string,
  retentionUntil: Date | undefined,
  legalHold = false,
  extra: Record<string, unknown> = {},
) {
  const _id = new ObjectId();
  await provider.put({ key, bytes: new TextEncoder().encode("bytes") });
  await h.db.collection("assets").insertOne({
    _id,
    storage: { provider: "LOCAL_DEV", objectKey: key },
    mimeType: "text/plain",
    byteSize: 5,
    sha256: "a".repeat(64),
    processingStatus: "READY",
    visibility: "PRIVATE",
    uploadedAt: new Date("2026-01-01T00:00:00Z"),
    exifStripped: true,
    ...(retentionUntil ? { retentionUntil } : {}),
    legalHold,
    lifecycle,
    version: 1,
    schemaVersion: 1,
    ...extra,
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
  name: "retention: purge is legal-hold aware, due-date aware, and audited",
  ignore: !MONGO_ENABLED,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    const h = await createHarness("ansoo_plan07_retention");
    const root = await Deno.makeTempDir({ prefix: "ansoo-plan07-retention-" });
    const provider = createLocalStorageProvider(root);
    try {
      const now = new Date("2026-08-01T00:00:00Z");
      const due = await asset(
        h,
        provider,
        "due.txt",
        "DELETED_PENDING_PURGE",
        new Date("2026-07-01T00:00:00Z"),
      );
      const future = await asset(
        h,
        provider,
        "future.txt",
        "DELETED_PENDING_PURGE",
        new Date("2026-09-01T00:00:00Z"),
      );
      const held = await asset(
        h,
        provider,
        "held.txt",
        "DELETED_PENDING_PURGE",
        new Date("2026-07-01T00:00:00Z"),
        true,
      );
      const already = await asset(
        h,
        provider,
        "already.txt",
        "DELETED_PENDING_PURGE",
        new Date("2026-07-01T00:00:00Z"),
        false,
        { purgedAt: new Date("2026-07-02T00:00:00Z") },
      );
      const active = await asset(h, provider, "active.txt", "ACTIVE", undefined);

      await t.step("explicit purge refuses before retentionUntil", async () => {
        const error = await rejection(purgeAsset({
          db: h.db,
          provider,
          assetId: future,
          reason: "too early",
          actor: { type: "SYSTEM" },
          now,
        }));
        assertEquals(error.code, "RETENTION_NOT_ELAPSED");
        assertEquals(error.status, 409);
      });

      await t.step("scheduler purges only due, non-held, unpurged assets", async () => {
        const result = await purgeExpiredAssets({
          db: h.db,
          provider,
          now,
          actor: { type: "SYSTEM" },
        });
        assertEquals(result.purged, [due.toString()]);
        assertEquals(result.skipped, 0);
        const dueDoc = await h.db.collection("assets").findOne({ _id: due });
        assertEquals(dueDoc?.purgedAt instanceof Date, true);
        assertEquals(dueDoc?.lifecycle, "DELETED_PENDING_PURGE");
        const futureDoc = await h.db.collection("assets").findOne({ _id: future });
        assertEquals(futureDoc?.purgedAt, undefined);
        const heldDoc = await h.db.collection("assets").findOne({ _id: held });
        assertEquals(heldDoc?.purgedAt, undefined);
        const alreadyDoc = await h.db.collection("assets").findOne({ _id: already });
        assertEquals((alreadyDoc?.purgedAt as Date).toISOString(), "2026-07-02T00:00:00.000Z");
        const activeDoc = await h.db.collection("assets").findOne({ _id: active });
        assertEquals(activeDoc?.purgedAt, undefined);
        assertEquals(
          await h.db.collection("audit_events").countDocuments({
            action: "ASSET_PURGED",
            "target.id": due,
          }),
          1,
        );
      });

      await t.step("a second run is a no-op", async () => {
        const result = await purgeExpiredAssets({
          db: h.db,
          provider,
          now,
          actor: { type: "SYSTEM" },
        });
        assertEquals(result.purged, []);
      });

      await t.step("held bytes remain readable", async () => {
        const bytes = await provider.get({ key: "held.txt" });
        assertEquals(new TextDecoder().decode(bytes), "bytes");
      });
    } finally {
      await h.close();
      await Deno.remove(root, { recursive: true }).catch(() => {});
    }
  },
});
