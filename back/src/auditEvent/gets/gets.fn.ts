import type { ActionBody, ActionContext } from "../../../utils/api/types.ts";
import { projectDocument } from "../../../utils/projections/mod.ts";

export async function gets(
  body: ActionBody & { details: Record<string, unknown> },
  context: ActionContext,
): Promise<unknown> {
  const set = body.details.set as { limit?: number };
  const limit = Math.min(Math.max(Math.trunc(set.limit ?? 20), 1), 100);
  const events = await context.db.collection("audit_events")
    .find({})
    .sort({ occurredAt: -1 })
    .limit(limit)
    .toArray();
  return {
    events: events.map((event) =>
      projectDocument("audit_events", event as Record<string, unknown>, "ADMIN")
    ),
  };
}
