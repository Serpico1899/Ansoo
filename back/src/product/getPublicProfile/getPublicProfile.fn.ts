import { ObjectId } from "lesan";
import { ApiError } from "../../../utils/api/mod.ts";
import type { ActionBody, ActionContext } from "../../../utils/api/types.ts";
import { normalizeProductIdentifier } from "../../../utils/identity/mod.ts";
import {
  publicClaimView,
  publicProductView,
  publicRelationshipView,
} from "../../../utils/projections/mod.ts";

const LIMITATIONS = [
  "A relationship or barcode does not by itself establish a legal or ethical conclusion.",
  "Unknown dates remain unknown; validTo null does not prove a statement is current.",
];

function objectId(value: unknown): ObjectId {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) {
    throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
  }
  return new ObjectId(value);
}

export async function getPublicProfile(
  body: ActionBody & { details: Record<string, unknown> },
  context: ActionContext,
): Promise<unknown> {
  const set = body.details.set as { id?: string; gtin?: string };
  let product: Record<string, unknown> | null = null;

  if (set.id !== undefined) {
    product = await context.db.collection("products").findOne({ _id: objectId(set.id) });
  } else if (set.gtin !== undefined) {
    let normalized: string;
    try {
      normalized = normalizeProductIdentifier("GTIN", set.gtin).normalizedValue;
    } catch {
      throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
    }
    product = await context.db.collection("products").findOne({
      identifiers: {
        $elemMatch: { scheme: "GTIN", normalizedValue: normalized },
      },
      lifecycle: { $in: ["ACTIVE", "MERGED"] },
    });
  }

  const view = publicProductView(product as Record<string, unknown> | null);
  if (view.outcome !== "ACTIVE" || view.product === null) {
    return { ...view, claims: [], relationships: [], unknowns: [], limitations: LIMITATIONS };
  }

  const productId = (product as { _id: ObjectId })._id;
  const claims = await context.db.collection("claims").find({
    "about.type": "PRODUCT",
    "about.id": productId,
    "publication.status": "PUBLISHED",
    recordLifecycle: "ACTIVE",
  }).limit(50).toArray();
  const relationships = await context.db.collection("relationships").find({
    "subject.type": "PRODUCT",
    "subject.id": productId,
    "publication.status": "PUBLISHED",
    recordLifecycle: "ACTIVE",
  }).limit(50).toArray();

  return {
    ...view,
    claims: claims
      .map((claim) => publicClaimView(claim as Record<string, unknown>, []))
      .filter((claim) => claim !== null),
    relationships: relationships
      .map((relationship) => publicRelationshipView(relationship as Record<string, unknown>, []))
      .filter((relationship) => relationship !== null),
    unknowns: [],
    limitations: LIMITATIONS,
  };
}
