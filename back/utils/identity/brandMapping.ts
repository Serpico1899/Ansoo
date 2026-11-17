// Brand mapping workflow. Spec 5.2.
//
// candidateBrandId is a proposal. Only a VERIFIED mapping may populate the
// Product.brand relation; every review is version-checked and audited.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import type { Models } from "../../models/mod.ts";
import { BRAND_MAPPING_STATUSES, type BrandMappingStatus } from "../domain/constants.ts";
import { createEntityRegistry } from "./registry.ts";

export type BrandMappingActor = {
  type: "USER" | "SYSTEM" | "SERVICE";
  id?: ObjectId;
};

export class BrandMappingError extends Error {
  constructor(
    readonly code:
      | "FORBIDDEN"
      | "INVALID_STATUS"
      | "PRODUCT_NOT_FOUND"
      | "BRAND_NOT_FOUND"
      | "MISSING_CANDIDATE"
      | "VERSION_CONFLICT",
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = "BrandMappingError";
  }
}

const REVIEW_ROLES = ["RESEARCHER", "RESEARCH_REVIEWER", "MODERATOR", "ADMIN"] as const;

async function assertAuthorized(db: Db, actor: BrandMappingActor): Promise<void> {
  if (actor.type !== "USER") return;
  if (!actor.id) throw new BrandMappingError("FORBIDDEN", "user actor requires an id", 403);
  const user = await db.collection("users").findOne({ _id: actor.id });
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new BrandMappingError("FORBIDDEN", "actor is not an active user", 403);
  }
  const roles = Array.isArray(user.roles) ? user.roles as string[] : [];
  if (!REVIEW_ROLES.some((role) => roles.includes(role))) {
    throw new BrandMappingError("FORBIDDEN", "actor may not review brand mappings", 403);
  }
}

export async function setBrandMapping(input: {
  db: Db;
  models: Models;
  productId: ObjectId;
  status: BrandMappingStatus;
  candidateBrandId?: ObjectId;
  expectedVersion: number;
  reason: string;
  evidenceSnapshotIds?: ObjectId[];
  actor: BrandMappingActor;
  now?: Date;
}): Promise<{ productId: ObjectId; version: number; auditId: ObjectId }> {
  const now = input.now ?? new Date();
  if (!(BRAND_MAPPING_STATUSES as readonly string[]).includes(input.status)) {
    throw new BrandMappingError("INVALID_STATUS", "unknown brand mapping status");
  }
  if (input.status !== "UNREVIEWED" && !input.candidateBrandId) {
    throw new BrandMappingError("MISSING_CANDIDATE", "brand mapping requires a candidate");
  }
  await assertAuthorized(input.db, input.actor);

  const product = await input.db.collection("products").findOne({ _id: input.productId });
  if (!product) throw new BrandMappingError("PRODUCT_NOT_FOUND", "product does not exist", 404);

  let verifiedBrandId: ObjectId | undefined;
  if (input.status === "VERIFIED") {
    const registry = createEntityRegistry(input.db);
    try {
      const resolved = await registry.resolve("audit.target", {
        type: "BRAND",
        id: input.candidateBrandId!,
      });
      verifiedBrandId = resolved.doc._id;
    } catch {
      throw new BrandMappingError("BRAND_NOT_FOUND", "brand does not exist or is not live", 404);
    }
  }

  const mapping = {
    status: input.status,
    ...(input.candidateBrandId ? { candidateBrandId: input.candidateBrandId } : {}),
    ...(input.reason ? { rationale: input.reason } : {}),
    ...(input.evidenceSnapshotIds?.length
      ? { evidenceSnapshotIds: input.evidenceSnapshotIds }
      : {}),
    ...(input.status !== "UNREVIEWED" && input.actor.id
      ? { reviewedAt: now, reviewedBy: input.actor.id }
      : {}),
  };
  const previous = (product.brandMapping ?? {}) as Record<string, unknown>;
  const previousRelation = product.brand && typeof product.brand === "object"
    ? (product.brand as Record<string, unknown>)
    : undefined;

  const updated = await input.db.collection("products").updateOne(
    { _id: input.productId, version: input.expectedVersion, lifecycle: { $ne: "MERGED" } },
    {
      $set: {
        brandMapping: mapping,
        updatedAt: now,
        ...(input.actor.id ? { updatedBy: input.actor.id } : {}),
      },
      $inc: { version: 1 },
    },
  );
  if (updated.modifiedCount !== 1) {
    throw new BrandMappingError("VERSION_CONFLICT", "product version did not match", 409);
  }

  if (input.status === "VERIFIED") {
    if (previousRelation?._id) {
      await input.models.products.removeRelation({
        filters: { _id: input.productId },
        relations: {
          brand: {
            _ids: previousRelation._id as ObjectId,
            relatedRelations: { productsPreview: true },
          },
        },
      });
    }
    if (previousRelation) {
      // Lesan 0.2.3 leaves an empty {} placeholder after removeRelation and
      // then refuses to add the single relation. Clear only that placeholder;
      // the relation itself is still written through addRelation.
      await input.db.collection("products").updateOne(
        { _id: input.productId },
        { $unset: { brand: "" } },
      );
    }
    await input.models.products.addRelation({
      filters: { _id: input.productId },
      relations: {
        brand: {
          _ids: verifiedBrandId!,
          relatedRelations: { productsPreview: true },
        },
      },
    });
  } else if (previousRelation?._id) {
    await input.models.products.removeRelation({
      filters: { _id: input.productId },
      relations: {
        brand: {
          _ids: previousRelation._id as ObjectId,
          relatedRelations: { productsPreview: true },
        },
      },
    });
  }

  const audit = {
    _id: new ObjectId(),
    eventSchemaVersion: 1,
    actor: input.actor.id
      ? { type: input.actor.type, id: input.actor.id }
      : { type: input.actor.type },
    action: "BRAND_MAPPING_REVIEWED",
    target: { type: "PRODUCT", id: input.productId },
    targetVersionBefore: input.expectedVersion,
    targetVersionAfter: input.expectedVersion + 1,
    beforeSummary: {
      status: String(previous.status ?? "UNREVIEWED"),
      candidateBrandId: String(previous.candidateBrandId ?? ""),
    },
    afterSummary: {
      status: input.status,
      candidateBrandId: String(input.candidateBrandId ?? ""),
      verifiedBrandId: String(verifiedBrandId ?? ""),
    },
    changedPaths: ["brandMapping.status", "brandMapping.candidateBrandId", "brand"],
    reason: input.reason,
    occurredAt: now,
  };
  await input.db.collection("audit_events").insertOne(audit);

  return { productId: input.productId, version: input.expectedVersion + 1, auditId: audit._id };
}
