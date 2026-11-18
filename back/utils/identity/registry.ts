// Closed polymorphic reference registry. Spec 4.1, 15.2.
//
// A client supplies exactly {type, id}. This module chooses the collection,
// checks the field allowlist, verifies existence and lifecycle, and follows
// merge tombstones with a depth bound and cycle detection.
import type { Db } from "lesan";
import { ObjectId } from "lesan";
import {
  AUDIT_TARGET_TYPES,
  CLAIM_ABOUT_TYPES,
  CORRECTION_TARGET_TYPES,
  ENTITY_COLLECTION,
  ENTITY_TYPES,
  type EntityType,
  MERGE_MAX_DEPTH,
  RELATIONSHIP_ENDPOINT_TYPES,
} from "../domain/constants.ts";

export type EntityRefField =
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

const FIELD_ALLOWLIST: Record<EntityRefField, readonly EntityType[]> = {
  "relationship.subject": RELATIONSHIP_ENDPOINT_TYPES,
  "relationship.object": RELATIONSHIP_ENDPOINT_TYPES,
  "claim.about": CLAIM_ABOUT_TYPES,
  "claim.relatedEntities": RELATIONSHIP_ENDPOINT_TYPES,
  "correction.target": CORRECTION_TARGET_TYPES,
  "audit.target": AUDIT_TARGET_TYPES,
  "evidence.sourceSnapshotId": ["SOURCE_SNAPSHOT"],
  "organizationResponse.respondingOrganizationId": ["ORGANIZATION"],
  "asset.reference": ["ASSET"],
  "user.reference": ["USER"],
};

export type EntityRef<T extends EntityType = EntityType> = { type: T; id: ObjectId };

export type AdminFlag = {
  code: "MERGE_CYCLE" | "MERGE_DEPTH_EXCEEDED";
  entityType: EntityType;
  entityId: string;
};

export class ReferenceError extends Error {
  constructor(
    readonly code:
      | "INVALID_REFERENCE"
      | "UNKNOWN_TYPE"
      | "TYPE_NOT_ALLOWED"
      | "INVALID_ID"
      | "NOT_FOUND"
      | "ARCHIVED"
      | "MERGE_CYCLE"
      | "MERGE_DEPTH_EXCEEDED"
      | "MERGE_CHAIN_BROKEN",
    message: string,
    readonly status = 422,
    readonly adminFlag?: AdminFlag,
  ) {
    super(message);
    this.name = "ReferenceError";
  }
}

function parseId(value: unknown): ObjectId {
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && /^[a-f0-9]{24}$/i.test(value)) {
    return new ObjectId(value);
  }
  throw new ReferenceError("INVALID_ID", "reference id must be a 24-hex id or ObjectId");
}

export type ResolvedReference = {
  ref: EntityRef;
  doc: Record<string, unknown> & { _id: ObjectId };
  mergedFrom: ObjectId[];
};

export function createEntityRegistry(db: Db) {
  const collectionFor = (type: EntityType): string => {
    if (!(ENTITY_TYPES as readonly string[]).includes(type)) {
      throw new ReferenceError("UNKNOWN_TYPE", "unknown reference type");
    }
    return ENTITY_COLLECTION[type];
  };

  const assertRef = <F extends EntityRefField>(
    field: F,
    input: unknown,
  ): EntityRef => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw new ReferenceError("INVALID_REFERENCE", "reference must be an object");
    }
    const keys = Object.keys(input as Record<string, unknown>).sort();
    if (keys.length !== 2 || keys[0] !== "id" || keys[1] !== "type") {
      throw new ReferenceError("INVALID_REFERENCE", "reference must contain exactly {type, id}");
    }
    const { type, id } = input as Record<string, unknown>;
    if (typeof type !== "string" || !(ENTITY_TYPES as readonly string[]).includes(type)) {
      throw new ReferenceError("UNKNOWN_TYPE", "unknown reference type");
    }
    const allowed = FIELD_ALLOWLIST[field];
    if (!allowed.includes(type as EntityType)) {
      throw new ReferenceError(
        "TYPE_NOT_ALLOWED",
        `${type} is not allowed for ${field}`,
      );
    }
    return { type: type as EntityType, id: parseId(id) };
  };

  const resolve = async <F extends EntityRefField>(
    field: F,
    input: unknown,
    options: { allowArchived?: boolean; followMerges?: boolean } = {},
  ): Promise<ResolvedReference> => {
    const reference = assertRef(field, input);
    let currentId = reference.id;
    const seen = new Set<string>();
    const mergedFrom: ObjectId[] = [];

    for (let depth = 0; depth <= MERGE_MAX_DEPTH; depth++) {
      const key = currentId.toString();
      if (seen.has(key)) {
        throw new ReferenceError(
          "MERGE_CYCLE",
          "merge chain contains a cycle",
          409,
          { code: "MERGE_CYCLE", entityType: reference.type, entityId: key },
        );
      }
      seen.add(key);

      const doc = await db.collection(collectionFor(reference.type)).findOne({ _id: currentId });
      if (!doc) {
        throw new ReferenceError(
          "NOT_FOUND",
          `${reference.type} reference target does not exist`,
          404,
        );
      }

      const lifecycle = (doc.lifecycle ?? doc.recordLifecycle) as string | undefined;
      if (lifecycle === "ARCHIVED" && options.allowArchived !== true) {
        throw new ReferenceError("ARCHIVED", `${reference.type} reference target is archived`, 409);
      }
      if (lifecycle === "MERGED" && options.followMerges === false) {
        return {
          ref: { type: reference.type, id: currentId },
          doc: doc as Record<string, unknown> & { _id: ObjectId },
          mergedFrom,
        };
      }
      if (lifecycle === "MERGED") {
        if (!doc.mergedIntoId) {
          throw new ReferenceError(
            "MERGE_CHAIN_BROKEN",
            `${reference.type} is MERGED without mergedIntoId`,
            409,
          );
        }
        const next = parseId(doc.mergedIntoId);
        if (depth === MERGE_MAX_DEPTH) {
          throw new ReferenceError(
            "MERGE_DEPTH_EXCEEDED",
            `merge chain exceeds ${MERGE_MAX_DEPTH} hops`,
            409,
            { code: "MERGE_DEPTH_EXCEEDED", entityType: reference.type, entityId: key },
          );
        }
        mergedFrom.push(currentId);
        currentId = next;
        continue;
      }

      return {
        ref: { type: reference.type, id: currentId },
        doc: doc as Record<string, unknown> & { _id: ObjectId },
        mergedFrom,
      };
    }

    throw new ReferenceError(
      "MERGE_DEPTH_EXCEEDED",
      `merge chain exceeds ${MERGE_MAX_DEPTH} hops`,
      409,
      { code: "MERGE_DEPTH_EXCEEDED", entityType: reference.type, entityId: currentId.toString() },
    );
  };

  return { assertRef, resolve, collectionFor };
}

export type EntityRegistry = ReturnType<typeof createEntityRegistry>;
