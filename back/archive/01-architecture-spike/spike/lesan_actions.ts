// Disposable Lesan actions used to prove request/response and type generation.
//
// These actions are deliberately thin: they validate input with superstruct and
// return allowlisted public data. Domain rules live in the dedicated spike
// services and would move into production actions later.
import type { Db } from "lesan";
import { boolean, enums, number, object, optional, string } from "lesan";
import type { lesan } from "lesan";
import { buildPublicProductProfile } from "./projection.ts";
import { normalizeIdentifier, normalizeSearchName } from "./identifiers.ts";

type Core = ReturnType<typeof lesan>;

const PUBLIC_CLAIM_STATUSES = ["PUBLISHED", "WITHHELD", "RETRACTED"] as const;

function publicProductSummary(doc: Record<string, any>) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    normalizedName: doc.normalizedName,
    brandMapping: doc.brandMapping,
    brand: doc.brand?._id
      ? { id: doc.brand._id.toString(), name: doc.brand.name }
      : null,
    category: doc.category?._id
      ? { id: doc.category._id.toString(), name: doc.category.name }
      : null,
    identifiers: (doc.identifiers ?? []).map((identifier: any) => ({
      scheme: identifier.scheme,
      value: identifier.value,
      status: identifier.status,
    })),
    recordLifecycle: doc.recordLifecycle,
  };
}

export function registerSpikeActions(core: Core, db: Db) {
  core.acts.setAct({
    schema: "products",
    actName: "getPublicProfile",
    validator: object({
      set: object({ gtin: string() }),
      get: optional(object({
        profile: optional(boolean()),
        claims: optional(boolean()),
      })),
    }),
    fn: async (body: any) => {
      const { scheme, normalizedValue } = normalizeIdentifier(
        "GTIN_13",
        body.details.set.gtin,
      );
      const product = await db.collection("products").findOne({
        identifiers: { $elemMatch: { scheme, normalizedValue } },
      });
      if (!product) return { outcome: "NOT_FOUND", profile: null };

      const claims = await db.collection("claims").find({
        "about.type": "product",
        "about.id": product._id.toString(),
        "publication.status": "PUBLISHED",
      }).limit(50).toArray();
      const relationships = await db.collection("relationships").find({
        "subject.type": "product",
        "subject.id": product._id.toString(),
        "publication.status": "PUBLISHED",
      }).limit(50).toArray();

      return {
        outcome: "MATCH",
        profile: buildPublicProductProfile({
          product,
          relationships,
          claims,
          unknowns: [],
        }),
      };
    },
  });

  core.acts.setAct({
    schema: "products",
    actName: "searchPublic",
    validator: object({
      set: object({
        query: string(),
        limit: optional(number()),
      }),
      get: optional(object({ name: optional(boolean()) })),
    }),
    fn: async (body: any) => {
      const query = normalizeSearchName(body.details.set.query);
      const limit = Math.min(Number(body.details.set.limit ?? 10), 20);
      const docs = await db.collection("products").find({
        normalizedName: { $regex: `^${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` },
        recordLifecycle: "ACTIVE",
      }).sort({ normalizedName: 1 }).limit(limit).toArray();
      return docs.map(publicProductSummary);
    },
  });

  core.acts.setAct({
    schema: "claims",
    actName: "listForProduct",
    validator: object({
      set: object({
        productId: string(),
        publication: optional(enums(PUBLIC_CLAIM_STATUSES)),
      }),
      get: optional(object({
        statement: optional(boolean()),
        outcome: optional(boolean()),
      })),
    }),
    fn: async (body: any) => {
      const filter: Record<string, unknown> = {
        "about.type": "product",
        "about.id": body.details.set.productId,
        "publication.status": body.details.set.publication ?? "PUBLISHED",
      };
      const docs = await db.collection("claims").find(filter).limit(50).toArray();
      return docs.map((doc: any) => ({
        id: doc._id.toString(),
        statement: doc.statement,
        scope: doc.scope,
        assessment: { outcome: doc.assessment?.outcome },
        publication: { status: doc.publication?.status },
      }));
    },
  });
}
