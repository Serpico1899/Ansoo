// Canonical invariant inventory for v3.1.
//
// The spec (Section 1) requires each invariant to have an automated test named
// after its ID. This inventory is the single map from invariant to the plans
// that will enforce it and the scenarios that verify it.
//
// `foundation` means the rule is expressible at the vocabulary level in plan 02.
// `blocked` means the enforcing domain action/read model lands in a later plan;
// the test remains registered with an explicit blocker instead of silently
// passing.

export type InvariantRecord = {
  id: string;
  title: string;
  implementedBy: readonly number[];
  scenarios: readonly string[];
  foundation: "enforced" | "blocked";
  blockedBy?: string;
};

export const INVARIANTS: readonly InvariantRecord[] = [
  {
    id: "I01",
    title: "Product, Brand, and Organization are distinct identity types",
    implementedBy: [3, 5, 8, 9],
    scenarios: ["S01", "S05", "S06", "S14"],
    foundation: "enforced",
  },
  {
    id: "I02",
    title: "UNKNOWN is not FALSE and NOT_SUPPORTED is not a negative boolean",
    implementedBy: [3, 5, 8, 9],
    scenarios: ["S10", "S15"],
    foundation: "enforced",
  },
  {
    id: "I03",
    title: "Review, assessment, publication, legal, and campaign statuses stay separate",
    implementedBy: [3, 5, 8, 9],
    scenarios: ["S14", "S15"],
    foundation: "enforced",
  },
  {
    id: "I04",
    title: "Public projections never return internal data",
    implementedBy: [8, 9],
    scenarios: ["S14", "S19"],
    foundation: "blocked",
    blockedBy: "Plan 08: role x internal-field projection matrix",
  },
  {
    id: "I05",
    title: "SUPPORTED requires evidence and an assessor other than the creator",
    implementedBy: [5, 7],
    scenarios: ["S21"],
    foundation: "blocked",
    blockedBy: "Plan 05: assessment action and evidence enforcement",
  },
  {
    id: "I06",
    title: "PUBLISHED requires a passing publication gate",
    implementedBy: [5, 7],
    scenarios: ["S22"],
    foundation: "blocked",
    blockedBy: "Plan 05: publication state machine and gate",
  },
  {
    id: "I07",
    title: "SENSITIVE and HIGH_RISK findings require author, assessor, and publisher separation",
    implementedBy: [5, 7],
    scenarios: ["S22", "S23"],
    foundation: "blocked",
    blockedBy: "Plan 05: four-eyes gate enforcement",
  },
  {
    id: "I08",
    title: "SourceSnapshot content identity is immutable",
    implementedBy: [6],
    scenarios: ["S09"],
    foundation: "blocked",
    blockedBy: "Plan 06: snapshot capture and repository",
  },
  {
    id: "I09",
    title: "AuditEvent is append-only",
    implementedBy: [7],
    scenarios: ["S07", "S13"],
    foundation: "blocked",
    blockedBy: "Plan 07: append-only audit repository",
  },
  {
    id: "I10",
    title: "Corrections never apply a raw patch",
    implementedBy: [7],
    scenarios: ["S12"],
    foundation: "blocked",
    blockedBy: "Plan 07: allowlisted correction application",
  },
  {
    id: "I11",
    title: "No transitive ownership or control inference without written methodology",
    implementedBy: [9],
    scenarios: ["S14", "S19"],
    foundation: "blocked",
    blockedBy: "Plan 09: public profile assembly",
  },
  {
    id: "I12",
    title: "No universal score, color, badge, or verdict is produced",
    implementedBy: [3, 5, 8, 9],
    scenarios: ["S14", "S19"],
    foundation: "enforced",
  },
  {
    id: "I13",
    title: "Identifiers are strings and leading zeros are preserved",
    implementedBy: [4],
    scenarios: ["S19", "S25"],
    foundation: "blocked",
    blockedBy: "Plan 04: identifier normalization and resolution",
  },
  {
    id: "I14",
    title: "Array caps are enforced in validators with 422, never silent discard",
    implementedBy: [3],
    scenarios: ["S26"],
    foundation: "blocked",
    blockedBy: "Plan 03: model validators",
  },
  {
    id: "I15",
    title: "Identity merge is tombstone plus redirect; historical references are never rewritten",
    implementedBy: [4],
    scenarios: ["S20"],
    foundation: "blocked",
    blockedBy: "Plan 04: merge and redirect resolver",
  },
];

export const INVARIANT_IDS: readonly string[] = INVARIANTS.map((invariant) => invariant.id);
