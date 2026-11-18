// Retention scheduler hook. Plan 07 / spec 12.
//
// No default retention period is invented here. Only assets explicitly marked
// DELETED_PENDING_PURGE with an elapsed retentionUntil are purged; legal hold
// always wins and audit/snapshots are never touched.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import { purgeAsset } from "../provenance/asset.ts";
import type { ObjectStorageProvider } from "../provenance/provider.ts";
import type { GovernanceActor } from "./common.ts";

export async function purgeExpiredAssets(input: {
  db: Db;
  provider: ObjectStorageProvider;
  now?: Date;
  actor?: GovernanceActor;
}): Promise<{ purged: string[]; skipped: number }> {
  const now = input.now ?? new Date();
  const actor = input.actor ?? { type: "SYSTEM" as const };
  const candidates = await input.db.collection("assets").find({
    lifecycle: "DELETED_PENDING_PURGE",
    retentionUntil: { $lte: now },
    legalHold: { $ne: true },
    purgedAt: { $exists: false },
  }).toArray();

  const purged: string[] = [];
  let skipped = 0;
  for (const candidate of candidates) {
    try {
      await purgeAsset({
        db: input.db,
        provider: input.provider,
        assetId: candidate._id as ObjectId,
        reason: "retention period elapsed",
        actor,
        now,
      });
      purged.push((candidate._id as ObjectId).toString());
    } catch {
      skipped += 1;
    }
  }
  return { purged, skipped };
}
