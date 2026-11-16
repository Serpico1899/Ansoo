# Agent Prompt - Execute Plan 01 (Architecture Spike)

You are executing `../plans/01-architecture-spike.md` for the Ansoo backend. Your job is to produce
evidence and decisions, not a production feature. Read the full plan before doing anything.

## Read First

1. `../../../CONSUMER_TRANSPARENCY_FINAL_ERD.md` - authoritative domain baseline.
2. `../summary.md` - condensed model, relation boundaries, status matrix, open questions.
3. `../plans/01-architecture-spike.md` - the plan you are executing.
4. `../../AGENTS.md` - critical backend rules.
5. `../../../AGENTS.md` - repository-wide rules.

## Mission

Prove that Deno + Lesan 0.2.3 + MongoDB can implement the ERD baseline without violating its invariants.
Answer the spike questions with reproducible evidence. Record decisions. Do not guess.

## Hard Constraints

- **No production feature work.** Spike code is disposable and must not be merged as the production
  architecture.
- **No silent decisions.** If an open question cannot be answered with evidence, record it as blocked with
  the evidence gathered and the options considered.
- **No arbitrary database patches.** Do not build a generic `$set`/`fieldKey` applier.
- **No client-trusted authorization.** Roles and ownership come from the database, never from the payload.
- **No relation shortcuts.** Use only the three approved Lesan relations: `Product.brand`,
  `Product.category`, `SourceSnapshot.source`. Everything else is a validated typed reference.
- **No reverse-list assumptions.** A limited reverse relation is a preview, never an authoritative count or
  list.
- **No public leaks.** Public projections are allowlists. Test deep client-requested projections.
- **No asset bytes in MongoDB.** Use the local provider for the spike and store metadata only.
- **No secrets in the repository.** Use `.env`, never commit credentials.
- **No `git reset`.** Do not force-push or rewrite history.

## Working Method

1. **Start a spike branch or isolated throwaway path.** Keep production `models/`, `src/`, and `utils/`
   clean unless a decision has been made. If you must add spike files to the repo, mark them clearly and
   remove them before handoff.
2. **Work task by task in plan order.** Do not skip the relation and audit tests to build UI or broad CRUD.
3. **For each task, record:**
   - the exact command or playground request;
   - the observed behavior;
   - the expected behavior from the ERD;
   - a pass/fail/blocked result;
   - the evidence location.
4. **Test negative cases.** Missing target, wrong endpoint type, deleted relation, double application,
   unauthorized read, deep projection, restricted asset, SSRF URL, malformed identifier.
5. **Measure before claiming performance.** Use `explain("executionStats")` and representative seed data.
6. **Update the decision table** in `../summary.md` as decisions become evidence-backed. Do not mark a
   decision final without evidence.
7. **Stop and ask** when a decision changes the domain model, public wording, legal position, or
   authorization policy. Do not encode a policy choice that the team has not approved.

## Task Checklist

- [x] Bootstrap Lesan, MongoDB, playground, type generation.
- [x] Determine schema/collection naming and document metadata conventions.
- [x] Prove Product -> Brand relation behavior and reverse preview bounds.
- [x] Prove Product -> Category relation behavior plus tree service rules.
- [x] Prove SourceSnapshot -> Source relation, snapshot immutability, and asset separation.
- [x] Build and test the polymorphic reference registry.
- [x] Prove independent status dimensions and an allowlisted public projection.
- [x] Prove append-only audit and safe correction approval/application.
- [x] Prove server-derived auth/roles and the public/research split.
- [x] Prove asset validation, quarantine, visibility, and SSRF hardening.
- [x] Prove exact identifier resolution with explicit non-match outcomes.
- [x] Benchmark core queries, indexes, and BSON size.
- [x] Verify the generated frontend contract with a minimal server action.
- [x] Complete the decision gate and write the go/no-go recommendation.

## Expected Outputs

Produce a concise report with these sections:

1. **Environment** - Deno, Lesan, MongoDB versions; database name; commands used.
2. **Results by task** - pass/fail/blocked, observed behavior, evidence.
3. **Decision table** - completed rows with the chosen option, evidence, and follow-up.
4. **Open/blocked questions** - the exact question, why it is blocked, options, owner.
5. **Performance and BSON evidence** - query, index used, p50/p95, documents examined, document size.
6. **Security negative tests** - what was attempted and the result.
7. **Go/no-go recommendation** - proceed, proceed with constraints, or change architecture.
8. **First production slice** - the smallest end-to-end workflow you recommend, with tests.
9. **Files changed** - spike files, docs, and cleanup status.

## Verification Before Reporting Success

Run and paste the relevant output:

```bash
cd back
deno task fmt:check
deno task lint
deno task check
deno task test
```

If a command cannot run, say so explicitly. Do not claim a test passed without its output. Do not claim a
decision is final without evidence. Do not report "done" if any acceptance criterion is unproven.

## Stop Conditions

Stop and request human input if:

- Lesan cannot represent a required domain invariant without a workaround that changes the ERD.
- A relation or deletion behavior risks data loss.
- A public projection cannot be made safe with the available primitives.
- An open question requires a legal, editorial, or authorization policy decision.
- The chosen collection-naming strategy would require a fragile global mapping layer.
- The spike exceeds the timebox without answering the core questions.
