// Category-code taxonomy loading contract.
//
// v3.1 spec 2.3: Product stores `categoryCode: string`; there is no Category
// collection. The taxonomy is a versioned JSON file in this repository.
//
// Taxonomy content is populated by research work (plan 10), not by this plan.
// An empty node list is valid and means no category codes are accepted yet.

export const TAXONOMY_SCHEMA_VERSION = 1;
export const TAXONOMY_DEFAULT_PATH = new URL("../../taxonomy.v1.json", import.meta.url);

export type TaxonomyNode = {
  code: string;
  parentCode?: string;
  labels: Record<string, string>;
};

export type Taxonomy = {
  schemaVersion: number;
  version: string;
  nodes: readonly TaxonomyNode[];
};

export class TaxonomyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxonomyError";
  }
}

function fail(message: string): never {
  throw new TaxonomyError(message);
}

function parseNode(raw: unknown, index: number): TaxonomyNode {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail(`nodes[${index}] must be an object`);
  }
  const node = raw as Record<string, unknown>;

  const code = node.code;
  if (typeof code !== "string" || code.trim().length === 0) {
    fail(`nodes[${index}].code must be a non-empty string`);
  }

  const parentCode = node.parentCode;
  if (
    parentCode !== undefined && (typeof parentCode !== "string" || parentCode.trim().length === 0)
  ) {
    fail(`nodes[${index}].parentCode must be a non-empty string when present`);
  }

  const labels = node.labels;
  if (typeof labels !== "object" || labels === null || Array.isArray(labels)) {
    fail(`nodes[${index}].labels must be an object`);
  }
  const parsedLabels: Record<string, string> = {};
  for (const [locale, label] of Object.entries(labels as Record<string, unknown>)) {
    if (typeof label !== "string" || label.trim().length === 0) {
      fail(`nodes[${index}].labels.${locale} must be a non-empty string`);
    }
    parsedLabels[locale] = label;
  }
  if (Object.keys(parsedLabels).length === 0) {
    fail(`nodes[${index}].labels must contain at least one locale`);
  }

  return parentCode === undefined
    ? { code, labels: parsedLabels }
    : { code, parentCode, labels: parsedLabels };
}

export function parseTaxonomy(raw: unknown): Taxonomy {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("taxonomy must be an object");
  }
  const doc = raw as Record<string, unknown>;

  if (doc.schemaVersion !== TAXONOMY_SCHEMA_VERSION) {
    fail(`schemaVersion must be ${TAXONOMY_SCHEMA_VERSION}`);
  }
  if (typeof doc.version !== "string" || doc.version.trim().length === 0) {
    fail("version must be a non-empty string");
  }
  if (!Array.isArray(doc.nodes)) {
    fail("nodes must be an array");
  }

  const nodes = doc.nodes.map(parseNode);
  const byCode = new Map<string, TaxonomyNode>();

  for (const node of nodes) {
    if (byCode.has(node.code)) {
      fail(`duplicate category code: ${node.code}`);
    }
    byCode.set(node.code, node);
  }

  for (const node of nodes) {
    if (node.parentCode === undefined) continue;
    if (node.parentCode === node.code) {
      fail(`category ${node.code} cannot be its own parent`);
    }
    if (!byCode.has(node.parentCode)) {
      fail(`category ${node.code} references missing parent ${node.parentCode}`);
    }
  }

  // Cycle detection over parent pointers.
  const state = new Map<string, "visiting" | "done">();
  const visit = (code: string): void => {
    const current = state.get(code);
    if (current === "done") return;
    if (current === "visiting") fail(`cycle detected at category ${code}`);
    state.set(code, "visiting");
    const parent = byCode.get(code)?.parentCode;
    if (parent !== undefined) visit(parent);
    state.set(code, "done");
  };
  for (const node of nodes) visit(node.code);

  return Object.freeze({
    schemaVersion: TAXONOMY_SCHEMA_VERSION,
    version: doc.version,
    nodes: Object.freeze(nodes),
  });
}

export async function loadTaxonomy(
  path: string | URL = TAXONOMY_DEFAULT_PATH,
): Promise<Taxonomy> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (error) {
    fail(`cannot read taxonomy at ${String(path)}: ${(error as Error).message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    fail(`taxonomy is not valid JSON: ${(error as Error).message}`);
  }

  return parseTaxonomy(raw);
}

export function categoryCodeSet(taxonomy: Taxonomy): ReadonlySet<string> {
  return new Set(taxonomy.nodes.map((node) => node.code));
}

export function isKnownCategoryCode(taxonomy: Taxonomy, code: string): boolean {
  return taxonomy.nodes.some((node) => node.code === code);
}
