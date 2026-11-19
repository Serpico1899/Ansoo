import { ObjectId } from "lesan";
import { ApiError } from "../../../utils/api/mod.ts";
import type { ActionBody, ActionContext } from "../../../utils/api/types.ts";
import { projectDocument } from "../../../utils/projections/mod.ts";

export async function getResearch(
  body: ActionBody & { details: Record<string, unknown> },
  context: ActionContext,
): Promise<unknown> {
  const set = body.details.set as { id?: unknown };
  if (typeof set.id !== "string" || !/^[a-f0-9]{24}$/i.test(set.id)) {
    throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
  }
  const claim = await context.db.collection("claims").findOne({ _id: new ObjectId(set.id) });
  if (claim === null) throw new ApiError(404, "NOT_FOUND", "not found");
  return {
    claim: projectDocument("claims", claim as Record<string, unknown>, "RESEARCH"),
  };
}
