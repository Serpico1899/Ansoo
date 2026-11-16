# Agent Prompt - Execute Plan 08 (Auth, Projections, and API Contract)

Read `README.md` here, then `../plans/08-auth-projections-and-api-contract.md`, spec Sections 4, 9.2, 12,
15, and plan 07.

## Mission

Enforce server-derived authorization and build Public/Research/Admin projections that cannot be widened by
a client. Lock the error envelope and generated frontend contract.

## Sequence

1. **Auth:** `djwt` verification; `token` header only; no `Bearer`; strong env secret; DB user/roles every
   request; token claims ignored; 401 vs 403; suspended/closed denied; guests public-only; no guest history.
2. **Capabilities:** one matrix and one pre-act helper; proposed role capabilities; `trustLevel` never
   grants; upload capabilities separate; negative tests.
3. **Errors:** stable envelope/codes; no stack traces, paths, model names, secrets, or private data.
4. **Projections:** explicit Public/Research/Admin allowlists; classify every field; no research notes,
   PII, roles, private keys, restricted sources, security metadata, or score; published finding does not
   unlock restricted evidence.
5. **I04 matrix:** every role/guest x every internal field; deep client projection attempts; merged,
   retracted, restricted cases.
6. **Action triad:** mod/fn/val; strict validators; pre-acts for auth/capability/rate limit/request id;
   stable errors; no client collection/model/path/operator.
7. **Contract:** regenerate declarations, consume in a minimal frontend action, `pnpm typecheck`, no
   hand-edited types, locale placeholders.
8. **Tests/report:** I04, I12, S14 and auth negatives; write
   `../reports/08-auth-projections-and-api-contract.md`.

## Do Not

- Do not trust token roles, `trustLevel`, or client projection requests.
- Do not return research notes publicly under any role.
- Do not leak restricted sources/private assets through a published finding.
- Do not add a score/verdict field.
- Do not hand-maintain duplicate frontend types.

## Evidence Required

- Token/role/status negative tests.
- Capability matrix tests.
- Full I04 role x field matrix.
- Deep-projection attack results.
- Generated contract + frontend typecheck.
- Verification logs.

## Stop Conditions

Stop if a capability policy decision is required, if a field cannot be classified safely, or if Lesan
pre-acts cannot enforce auth consistently.
