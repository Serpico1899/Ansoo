import { loginWithAssertion } from "../../../utils/auth/mod.ts";
import { ApiError } from "../../../utils/api/mod.ts";
import type { ActionBody, ActionContext } from "../../../utils/api/types.ts";

export async function login(
  body: ActionBody & { details: Record<string, unknown> },
  context: ActionContext,
): Promise<unknown> {
  const set = body.details.set as { providerToken?: unknown };
  if (typeof set.providerToken !== "string") {
    throw new ApiError(422, "VALIDATION_ERROR", "validation failed");
  }
  return await loginWithAssertion({
    db: context.db,
    config: context.config,
    providerToken: set.providerToken,
  });
}
