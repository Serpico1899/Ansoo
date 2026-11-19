// Plan 08 - one registry maps every action to its server-side access policy.
import type { ActionDefinition, ApiOptions } from "./types.ts";

const DEFINITIONS = new Map<string, ActionDefinition>();

export function actionKey(schema: string, actName: string): string {
  return `${schema}.${actName}`;
}

export function registerActionDefinition(
  core: ApiOptions["core"],
  definition: ActionDefinition,
): void {
  DEFINITIONS.set(actionKey(definition.schema, definition.actName), definition);
  core.acts.setAct({
    schema: definition.schema,
    actName: definition.actName,
    validator: definition.validator,
    fn: () => {
      throw new Error("direct action invocation is disabled; use the dispatcher");
    },
  });
}

export function getActionDefinition(key: string): ActionDefinition | undefined {
  return DEFINITIONS.get(key);
}

export function actionDefinitions(): readonly ActionDefinition[] {
  return [...DEFINITIONS.values()];
}

export function registeredActionKeys(): readonly string[] {
  return [...DEFINITIONS.keys()].sort();
}
