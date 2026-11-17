// Lesan model registry for the eleven canonical v3.1 collections.
//
// Exactly two fixed-schema Lesan relations exist:
//   Product.brand -> Brand (single, optional)
//   SourceSnapshot.source -> Source (single, required)
// Everything else is a plain typed ObjectId reference resolved by the server.

import { lesan } from "lesan";
import { assetFields } from "./asset.ts";
import { auditEventFields } from "./auditEvent.ts";
import { brandFields } from "./brand.ts";
import { claimFields } from "./claim.ts";
import { correctionFields } from "./correction.ts";
import { organizationFields } from "./organization.ts";
import { productFields } from "./product.ts";
import { relationshipFields } from "./relationship.ts";
import { sourceFields } from "./source.ts";
import { sourceSnapshotFields } from "./sourceSnapshot.ts";
import { userFields } from "./user.ts";

export type LesanCore = ReturnType<typeof lesan>;

export const MODEL_NAMES = [
  "assets",
  "audit_events",
  "brands",
  "claims",
  "corrections",
  "organizations",
  "products",
  "relationships",
  "source_snapshots",
  "sources",
  "users",
] as const;

export type ModelName = typeof MODEL_NAMES[number];

export type RelationDeclaration = {
  parent: ModelName;
  name: string;
  target: ModelName;
  type: "single" | "multiple";
  optional: boolean;
  reverse: {
    name: string;
    type: "single" | "multiple";
    limit: number;
    sort: { field: string; order: "asc" | "desc" };
  };
};

export const RELATION_DECLARATIONS = [
  {
    parent: "products",
    name: "brand",
    target: "brands",
    type: "single",
    optional: true,
    reverse: {
      name: "productsPreview",
      type: "multiple",
      limit: 20,
      sort: { field: "updatedAt", order: "desc" },
    },
  },
  {
    parent: "source_snapshots",
    name: "source",
    target: "sources",
    type: "single",
    optional: false,
    reverse: {
      name: "recentSnapshotsPreview",
      type: "multiple",
      limit: 10,
      sort: { field: "retrievedAt", order: "desc" },
    },
  },
] as const satisfies readonly RelationDeclaration[];

const brandRelationExcludes = [
  "aliases",
  "localizedNames",
  "description",
  "website",
  "logoAssetId",
  "identityProvenance",
  "mergedIntoId",
  "mergedAt",
  "mergedBy",
  "mergeReason",
  "schemaVersion",
  "version",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
];

export function buildModels(core: LesanCore) {
  const users = core.odm.newModel("users", userFields, {});
  const brands = core.odm.newModel("brands", brandFields, {});
  const organizations = core.odm.newModel("organizations", organizationFields, {});
  const sources = core.odm.newModel("sources", sourceFields, {});
  const assets = core.odm.newModel("assets", assetFields, {});

  const products = core.odm.newModel("products", productFields, {
    brand: {
      schemaName: "brands",
      type: "single",
      optional: true,
      excludes: brandRelationExcludes,
      relatedRelations: {
        productsPreview: {
          type: "multiple",
          limit: 20,
          sort: { field: "updatedAt", order: "desc" },
        },
      },
    },
  });

  const sourceSnapshots = core.odm.newModel("source_snapshots", sourceSnapshotFields, {
    source: {
      schemaName: "sources",
      type: "single",
      optional: false,
      relatedRelations: {
        recentSnapshotsPreview: {
          type: "multiple",
          limit: 10,
          sort: { field: "retrievedAt", order: "desc" },
        },
      },
    },
  });

  const relationships = core.odm.newModel("relationships", relationshipFields, {});
  const claims = core.odm.newModel("claims", claimFields, {});
  const corrections = core.odm.newModel("corrections", correctionFields, {});
  const auditEvents = core.odm.newModel("audit_events", auditEventFields, {});

  return {
    users,
    brands,
    organizations,
    sources,
    assets,
    products,
    sourceSnapshots,
    relationships,
    claims,
    corrections,
    auditEvents,
  };
}

export type Models = ReturnType<typeof buildModels>;

export function registerModels(core: LesanCore): Models {
  return buildModels(core);
}
