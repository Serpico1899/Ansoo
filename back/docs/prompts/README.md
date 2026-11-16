# Execution Prompts

Each active plan has one matching prompt in this directory. A prompt is the entry point for an agent
executing that plan; the plan remains the source of truth for tasks and acceptance criteria.

## Standard Read Order

1. `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` - canonical domain contract.
2. `../plans/00-roadmap.md` - sequence, dependencies, gates.
3. `../plans/NN-<name>.md` - the plan being executed.
4. `../summary.md` - condensed domain reference.
5. `../adr/` - accepted decisions and the rule that new decisions need an ADR.
6. `../../AGENTS.md` and `../../../AGENTS.md` - execution rules.

## Universal Hard Constraints

- **Read before writing.** Read the repository, installed versions from `deno.lock`, existing models,
  actions, and tests. Never write a Lesan/MongoDB API from memory.
- **No silent decisions.** If an open question blocks work, record it with options and an owner; do not
  encode a default.
- **Exactly 11 domain collections.** No `categories`, `evidence_items`, `verification_cases`, or
  speculative aggregates. The only derived collection is the technical `product_public_profiles` read
  model, and it is never a source of truth.
- **Exactly 2 Lesan relations.** `Product.brand` and `SourceSnapshot.source`; everything else is a
  registry-validated typed reference.
- **Exactly 5 predicates and 3 claim types.** No `OTHER_*` escape hatch.
- **No arbitrary database patch.** Corrections go through the allowlisted domain action only.
- **No client-trusted authorization.** Roles come from the database, never token claims or payload.
- **No public leak.** Public projections are server-side allowlists; test deep client projections.
- **No verdict.** No score, badge, single legal/ethical conclusion, or transitive ownership inference.
- **No reverse-list assumptions.** A `*Preview` is bounded and never a count or authoritative list.
- **No `hardCascade`.** Archive by default; delete children first.
- **No secrets or real restricted data in the repository.** Use `.env` and an internal environment.
- **No `git reset`, force-push, or history rewrite.** Do not commit unless explicitly asked.
- **Caps are validators.** Exceeding a cap -> `422 CAP_EXCEEDED`, never silent discard.
- **Dates are UTC BSON `Date`.** `validTo: null` is not proof of current truth.
- **Snapshots are immutable.** Changed content is a new snapshot; hash the original bytes.
- **Audit is append-only.** No update or delete path.

## Working Method

1. Produce a short pre-flight delta: current state, installed versions, what the plan changes.
2. Work tasks in order; do not skip invariant/negative tests to build broad CRUD.
3. For each task record command, observed behavior, expected behavior, pass/fail/blocked, evidence path.
4. Test negative and boundary cases, not only happy paths.
5. Measure before claiming performance; use `explain("executionStats")` and representative data.
6. Update the plan checkboxes only when the evidence exists.
7. Stop and ask when the plan would change the domain model, public wording, legal position, or
   authorization policy.

## Standard Outputs

Every prompt produces:

1. A report at `../reports/NN-<name>.md` with environment, results, evidence, decisions, and blockers.
2. Updated plan checkbox status.
3. New/updated ADRs for any decision outside the spec.
4. Verification output from `deno task fmt:check`, `lint`, `check`, `test` (and `pnpm` checks when the
   frontend contract is touched).

## Verification Before Claiming Success

```bash
cd back
deno task fmt:check
deno task lint
deno task check
deno task test
```

If a command cannot run, say exactly why. Do not claim a test passed without its output. Do not claim a
decision is final without evidence.

## Stop Conditions

Stop and request human input if:

- A required invariant cannot be enforced without changing the domain model.
- A Lesan behavior risks data loss or cannot meet the relation boundary.
- A public projection cannot be made safe.
- An open question requires product, research, editorial, legal, or security policy.
- Real/restricted data would enter the repository.
- The plan exceeds its scope or uncovers a missing prerequisite.
