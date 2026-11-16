// Server-controlled registry for every polymorphic reference.
//
// A client never supplies a collection name, model name, Mongo path, or
// operator. It supplies exactly {type, id}; this module decides whether that
// type is allowed in that field and whether the target exists.
import { type Db, ObjectId } from "lesan";

export const ENTITY_COLLECTIONS = {
  product: "products",
  brand: "brands",
  category: "categories",
  organization: "organizations",
  relationship: "relationships",
  claim: "claims",
  source: "sources",
  source_snapshot: "source_snapshots",
  correction: "corrections",
  asset: "assets",
  user: "users",
  audit_event: "audit_events",
} as const;

export type EntityType = keyof typeof ENTITY_COLLECTIONS;

export interface EntityRef {
  type: EntityType;
  id: string;
}

export type RefField =
  | "relationship.subject"
  | "relationship.object"
  | "claim.about"
  | "claim.relatedEntities"
  | "correction.target"
  | "audit.target"
  | "evidence.sourceSnapshotId"
  | "organizationResponse.respondingOrganizationId"
  | "asset.reference"
  | "user.reference";

const ALLOWED: Record<RefField, readonly EntityType[]> = {
  "relationship.subject": ["product", "brand", "organization", "category"],
  "relationship.object": ["product", "brand", "organization", "category"],
  "claim.about": [
    "product",
    "brand",
    "organization",
    "category",
    "relationship",
  ],
  "claim.relatedEntities": [
    "product",
    "brand",
    "organization",
    "category",
    "relationship",
  ],
  "correction.target": [
    "product",
    "brand",
    "category",
    "organization",
    "relationship",
    "claim",
    "source",
    "source_snapshot",
  ],
  "audit.target": [
    "product",
    "brand",
    "category",
    "organization",
    "relationship",
    "claim",
    "source",
    "source_snapshot",
    "correction",
    "asset",
    "user",
  ],
  "evidence.sourceSnapshotId": ["source_snapshot"],
  "organizationResponse.respondingOrganizationId": ["organization"],
  "asset.reference": ["asset"],
  "user.reference": ["user"],
};

export class ReferenceError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ReferenceError";
  }
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function assertPlainRef(input: unknown): EntityRef {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ReferenceError("INVALID_REFERENCE", "reference must be an object");
  }
  const keys = Object.keys(input as Record<string, unknown>).sort();
  if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "type") {
    throw new ReferenceError(
      "INVALID_REFERENCE",
      "reference must contain exactly {type, id}",
    );
  }
  const { type, id } = input as Record<string, unknown>;
  if (typeof type !== "string" || !(type in ENTITY_COLLECTIONS)) {
    throw new ReferenceError("UNKNOWN_TYPE", "unknown reference type");
  }
  if (typeof id !== "string" || !OBJECT_ID.test(id)) {
    throw new ReferenceError("INVALID_ID", "reference id must be a 24-hex id");
  }
  return { type: type as EntityType, id };
}

export function assertAllowed(field: RefField, input: unknown): EntityRef {
  const reference = assertPlainRef(input);
  if (!ALLOWED[field].includes(reference.type)) {
    throw new ReferenceError(
      "TYPE_NOT_ALLOWED",
      `${reference.type} is not allowed for ${field}`,
    );
  }
  return reference;
}

export function createRegistry(db: Db) {
  const collectionFor = (type: EntityType): string => {
    if (!(type in ENTITY_COLLECTIONS)) {
      throw new ReferenceError("UNKNOWN_TYPE", "unknown reference type");
    }
    return ENTITY_COLLECTIONS[type];
  };

  const exists = async (
    type: EntityType,
    id: string,
  ): Promise<boolean> => {
    const doc = await db.collection(collectionFor(type)).findOne(
      { _id: new ObjectId(id) },
      { projection: { _id: 1 } },
    );
    return doc !== null;
  };

  const resolve = async (field: RefField, input: unknown) => {
    const reference = assertAllowed(field, input);
    const doc = await db.collection(collectionFor(reference.type)).findOne(
      { _id: new ObjectId(reference.id) },
    );
    if (!doc) {
      throw new ReferenceError(
        "NOT_FOUND",
        `${reference.type} reference target does not exist`,
      );
    }
    return { type: reference.type, id: reference.id, doc };
  };

  return { collectionFor, exists, resolve };
}

export type Registry = ReturnType<typeof createRegistry>;
