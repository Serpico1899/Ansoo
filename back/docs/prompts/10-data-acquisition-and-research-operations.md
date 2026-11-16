# Agent Prompt - Execute Plan 10 (Data Acquisition and Research Operations)

Read `README.md` here, then `../plans/10-data-acquisition-and-research-operations.md`, spec Sections
18-19, 21-24, and `../methodology.md`.

## Mission

Prove the platform can acquire defensible data at acceptable cost: install and validate the toolchain,
enforce the aggregator-vs-primary rule, run 10 brands, measure minutes per edge, and produce the research
operations artifacts.

## Sequence

1. **Tooling:** install the relevant `iran-mcp` servers; record versions/commands; validate read-only
   queries; document terms, caps, pacing, and fallbacks.
2. **Tier rule:** map outputs to acquisition tiers; Tier E is lead-only; primary artifact required for
   evidence; no derived-dataset republishing; honor licenses.
3. **10 brands:** discover owner -> official notice -> capture Asset + Snapshot + hash -> Codal if listed ->
   draft Relationship with context/validity/sensitivity/evidence -> gate/right of reply when ready.
4. **Measure:** researcher-minutes per edge; failure modes; unknowns; blocked policy questions.
5. **Targets:** 100 Products, 20 Brands, 20 defensible edges; apply >60-minute Go/No-Go rule.
6. **Scanner factory:** unknown-GTIN contribution flow; honest "we don't know yet" answer; seed 30
   high-turnover brands in one category.
7. **Operations:** draft methodology, funding/independence, symmetric standards, team roles, safety/legal
   counsel gate.
8. **Audit/report:** provenance manifest, 10% hash spot-check, no real data in repo; write
   `../reports/10-data-acquisition-and-research-operations.md`.

## Do Not

- Do not circumvent caps, captchas, authentication, or paywalls.
- Do not cite aggregator output as evidence.
- Do not republish a derived dataset as original.
- Do not invent dates, ownership, origin, or legal status.
- Do not publish sensitive findings before legal review.
- Do not commit real/restricted data; synthetic seeds must be fictional.

## Evidence Required

- Tool versions and sample read-only outputs.
- Per-brand research log with artifact paths and minutes.
- Tier assignment for every evidence item.
- Hash spot-check log.
- Targets and Go/No-Go table.
- Draft public artifacts with owners.

## Stop Conditions

Stop if access would require circumvention, if a license forbids the use, if legal review is unavailable for
a sensitive finding, or if the measured cost blows the 60-minute Go/No-Go threshold.
