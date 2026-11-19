// Public read-model invalidation hook. Spec 10.9, S24.
//
// Plan 09 owns the read model. A retraction must remove the finding from the
// canonical source, every affected read-model document, and each registered
// public surface before the operation is reported as done.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import type { FindingType } from "./common.ts";
import { profileIdsForFinding, READ_MODEL_COLLECTION } from "../publicProfile/readModel.ts";
import { purgePublicSurfaces, type SurfaceTiming } from "../publicProfile/surfaces.ts";

export type ProjectionInvalidationInput = {
  db: Db;
  targetType: FindingType;
  targetId: ObjectId;
  reason: string;
  now: Date;
};

export type ProjectionInvalidationResult = {
  productIds: ObjectId[];
  surfaceTimings: SurfaceTiming[];
};

export type ProjectionInvalidationHook = (
  input: ProjectionInvalidationInput,
) => Promise<void | ProjectionInvalidationResult>;

export const SURFACE_REPAIR_COLLECTION = "public_profile_surface_repairs";

export const defaultProjectionInvalidation: ProjectionInvalidationHook = async (input) => {
  const productIds = await profileIdsForFinding(input.db, input.targetType, input.targetId);
  const legacyFilter = {
    $or: [
      { "payload.findings.findingId": input.targetId },
      { "findings.findingId": input.targetId },
      { "payload.findings.id": input.targetId },
      { "findings.id": input.targetId },
      { "claims.findingId": input.targetId },
      { "claims.id": input.targetId },
      { "relationships.findingId": input.targetId },
      { "relationships.id": input.targetId },
      { findingIds: input.targetId },
    ],
  };
  await input.db.collection(READ_MODEL_COLLECTION).deleteMany(legacyFilter);

  let surfaceTimings: SurfaceTiming[] = [];
  try {
    surfaceTimings = await purgePublicSurfaces({
      findingId: input.targetId,
      productIds,
      reason: input.reason,
      now: input.now,
    });
  } catch (error) {
    await input.db.collection(SURFACE_REPAIR_COLLECTION).insertOne({
      _id: new ObjectId(),
      targetType: input.targetType,
      targetId: input.targetId,
      productIds,
      reason: input.reason,
      status: "PENDING",
      error: error instanceof Error ? error.message : String(error),
      failedAt: input.now,
      attempts: 1,
    });
    throw error;
  }
  return { productIds, surfaceTimings };
};

export async function invalidatePublicProjections(
  input: ProjectionInvalidationInput & { hook?: ProjectionInvalidationHook },
): Promise<void | ProjectionInvalidationResult> {
  return await (input.hook ?? defaultProjectionInvalidation)({
    db: input.db,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    now: input.now,
  });
}
