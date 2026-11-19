import { ApiError } from "../../../utils/api/mod.ts";
import type { ActionContext } from "../../../utils/api/types.ts";
import { publicUserSelfView } from "../../../utils/projections/mod.ts";

export function getMe(
  _body: unknown,
  context: ActionContext,
): unknown {
  if (context.auth === null) {
    throw new ApiError(401, "UNAUTHENTICATED", "authentication required");
  }
  return { user: publicUserSelfView(context.auth) };
}
