// Public read-model invalidation hook. Spec 10.9, S24.
//
// Plan 09 owns the read model. This module exposes the synchronous purge that a
// retraction must complete before the change is reported as done.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import type { FindingType } from "./common.ts";

export type ProjectionInvalidationInput = {
  db: Db;
  targetType: FindingType;
  targetId: ObjectId;
  reason: string;
  now: Date;
};

export type ProjectionInvalidationHook = (
  input: ProjectionInvalidationInput,
) => Promise<void>;

const FINDING_REFERENCE_PATHS = [
  "relationships.findingId",
  "relationships.id",
  "claims.findingId",
  "claims.id",
  "findingIds",
] as const;

export const defaultProjectionInvalidation: ProjectionInvalidationHook = async (input) => {
  await input.db.collection("product_public_profiles").deleteMany({
    $or: FINDING_REFERENCE_PATHS.map((path) => ({ [path]: input.targetId })),
  });
};

export async function invalidatePublicProjections(
  input: ProjectionInvalidationInput & { hook?: ProjectionInvalidationHook },
): Promise<void> {
  await (input.hook ?? defaultProjectionInvalidation)({
    db: input.db,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    now: input.now,
  });
}
