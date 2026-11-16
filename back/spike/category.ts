// Category tree service. parentCategoryId/ancestorIds/depth are ordinary
// reference fields, not a Lesan self-relation.
import { type Db, ObjectId } from "lesan";

export class CategoryError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "CategoryError";
  }
}

export interface CategoryNode {
  _id: ObjectId;
  parentCategoryId?: string | null;
  ancestorIds: string[];
  depth: number;
  [key: string]: unknown;
}

export function validateCategory(node: CategoryNode, byId: Map<string, CategoryNode>) {
  if (node.depth !== node.ancestorIds.length) {
    throw new CategoryError("INVALID_DEPTH", "depth must equal ancestorIds.length");
  }
  if (new Set(node.ancestorIds).size !== node.ancestorIds.length) {
    throw new CategoryError("DUPLICATE_ANCESTOR", "ancestorIds contains duplicates");
  }
  if (node.parentCategoryId) {
    const parent = byId.get(node.parentCategoryId);
    if (!parent) throw new CategoryError("MISSING_PARENT", "parent category is missing");
    if (node.ancestorIds.at(-1) !== node.parentCategoryId) {
      throw new CategoryError(
        "INVALID_ANCESTRY",
        "last ancestor must be the parent category",
      );
    }
    if (node.ancestorIds.includes(node._id.toString())) {
      throw new CategoryError("CYCLE", "category cannot be its own ancestor");
    }
  } else if (node.ancestorIds.length !== 0) {
    throw new CategoryError("INVALID_ANCESTRY", "root category cannot have ancestors");
  }
}

export async function loadTree(db: Db): Promise<Map<string, CategoryNode>> {
  const docs = await db.collection("categories").find({}).toArray();
  const byId = new Map<string, CategoryNode>();
  for (const doc of docs) {
    byId.set(doc._id.toString(), doc as unknown as CategoryNode);
  }
  for (const node of byId.values()) validateCategory(node, byId);
  return byId;
}

export async function moveCategory(
  db: Db,
  categoryId: string,
  newParentId: string | null,
): Promise<{ updated: number; moved: string[] }> {
  const byId = await loadTree(db);
  const node = byId.get(categoryId);
  if (!node) throw new CategoryError("NOT_FOUND", "category does not exist");
  if (newParentId === categoryId) {
    throw new CategoryError("CYCLE", "category cannot be its own parent");
  }

  let newAncestors: string[] = [];
  if (newParentId) {
    const parent = byId.get(newParentId);
    if (!parent) throw new CategoryError("MISSING_PARENT", "new parent does not exist");
    if (parent.ancestorIds.includes(categoryId)) {
      throw new CategoryError("CYCLE", "new parent is a descendant of this category");
    }
    newAncestors = [...parent.ancestorIds, newParentId];
  }

  const oldAncestors = node.ancestorIds;
  const descendants = [...byId.values()].filter((candidate) =>
    candidate.ancestorIds.includes(categoryId)
  );
  const affected = [node, ...descendants];
  const now = new Date();

  const operations = affected.map((candidate) => {
    const suffix = candidate._id.toString() === categoryId
      ? []
      : candidate.ancestorIds.slice(oldAncestors.length + 1);
    const ancestorIds = candidate._id.toString() === categoryId
      ? newAncestors
      : [...newAncestors, categoryId, ...suffix];
    return {
      updateOne: {
        filter: { _id: candidate._id },
        update: {
          $set: {
            parentCategoryId: candidate._id.toString() === categoryId
              ? newParentId
              : candidate.parentCategoryId,
            ancestorIds,
            depth: ancestorIds.length,
            updatedAt: now,
            version: Number((candidate as any).version ?? 1) + 1,
          },
        },
      },
    };
  });

  if (operations.length > 0) {
    await db.collection("categories").bulkWrite(operations);
  }

  return {
    updated: operations.length,
    moved: affected.map((candidate) => candidate._id.toString()),
  };
}
