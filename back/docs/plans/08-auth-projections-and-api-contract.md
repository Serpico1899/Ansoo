# Plan 08 - Auth, Projections, and API Contract (v3.1)

**Status:** Complete (2026-11-19)
**Depends on:** 03, 07
**Feeds:** 09 (public profile), frontend generated types
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`
**Roadmap:** `00-roadmap.md`

## Purpose

Enforce server-derived authorization, build the three projection levels, and lock the API/type
contract that the frontend consumes. This plan makes I04 executable: no role, no projection request,
and no deep `get` may expose internal data.

## Non-Goals

- No production identity provider, password reset, email delivery, or account lifecycle UX.
- No client-trusted roles or projection widening.
- No public profile assembly logic; plan 09 builds the profile from these primitives.
- No legal/campaign authorization model.

## Pre-Flight

- [x] Read spec Sections 4, 9.2, 12, 15, 24.
- [x] Confirm users/roles/status from plan 07 and audit coverage.
- [x] Confirm the installed Lesan pre-act API and request/response contract.
- [x] Confirm type generation is reproducible and accepted by the frontend.

## Tasks

### 1. Authentication

- [x] Implement JWT login/verification with `djwt`; use a strong secret from env, never a default.
- [x] Token is read from the `token` header only; reject `Bearer <jwt>`.
- [x] Validate signature, expiry, issuer/audience if configured, and subject.
- [x] Load the user and roles from the database on every request; never trust token role claims.
- [x] Reject missing/deleted users, suspended/closed accounts, and malformed subjects.
- [x] Separate `401` (unauthenticated) from `403` (authenticated but unauthorized).
- [x] Guests may search/scan public data without an account.
- [x] Do not store scan history server-side for guests.
- [x] Rate-limit login and sensitive auth endpoints with a consistent error shape.
- [x] Audit role/status changes (owned by plan 07); never log tokens or credentials.

**Exit:** DB-derived roles are enforced; inflated token claims are ignored; guests are public-only.

### 2. Capability matrix

Implement one server-side capability check used by every action's pre-act. Do not duplicate role
logic.

Baseline matrix (final policy requires product/legal approval; record changes in an ADR):

| Capability                   | CONTRIBUTOR | RESEARCHER | RESEARCH_REVIEWER | LEGAL_REVIEWER | MODERATOR | ADMIN |
| ---------------------------- | ----------- | ---------- | ----------------- | -------------- | --------- | ----- |
| Read public profile/search   | yes         | yes        | yes               | yes            | yes       | yes   |
| Submit correction            | yes         | yes        | yes               | yes            | yes       | yes   |
| Create/edit research records | no          | yes        | yes               | no             | yes       | yes   |
| Add evidence                 | no          | yes        | yes               | yes            | yes       | yes   |
| Assess evidence              | no          | yes        | yes               | yes            | yes       | yes   |
| Approve/assign corrections   | no          | no         | yes               | yes            | yes       | yes   |
| Publish/retract findings     | no          | no         | no                | no             | yes       | yes   |
| Legal sign-off               | no          | no         | no                | yes            | no        | yes   |
| Read audit events            | no          | no         | no                | yes            | yes       | yes   |
| Manage users/roles           | no          | no         | no                | no             | no        | yes   |

- [x] Enforce that `trustLevel` never grants a capability.
- [x] Enforce that a suspended/closed account is denied even with a valid token.
- [x] Enforce upload/asset capabilities separately from research capabilities.
- [x] Write negative tests for every capability x role combination that must fail.

**Exit:** authorization is server-derived, centralized, and tested; no action trusts the client.

### 3. Error envelope

- [x] Define one error shape: code, message, optional field errors, requestId/correlationId.
- [x] Use stable codes for `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`,
      `409 INVALID_TRANSITION`, `409 USE_RELATIONSHIP_INSTEAD`, `422 VALIDATION_ERROR`,
      `422 CAP_EXCEEDED`, `429 RATE_LIMITED`, `500 INTERNAL`.
- [x] Never include stack traces, database paths, model names, secrets, or private data.
- [x] Ensure validation errors identify fields without echoing sensitive values.
- [x] Add tests for the error shape across auth, validation, conflict, and gate failures.

**Exit:** the frontend can branch on stable codes; errors never leak internals.

### 4. Projection levels

Build explicit server-side allowlist builders. `selectStruct` types the output; it never grants
access.

- [x] **Public**: identity, public identifiers, brand mapping state, published findings, public
      evidence, public responses, limitations, unknowns, correction notices. No research notes,
      reviewer IDs, private asset keys, restricted sources, roles, PII, or security metadata.
- [x] **Research**: adds internal research fields required by reviewers, evidence locators, source
      access details, moderation state, and assignment. Still excludes secrets and PII outside the
      researcher's need.
- [x] **Admin**: adds security/audit metadata needed for administration. Never returns raw secrets
      or full documents when a summary suffices.
- [x] Every field must be classified into exactly one level; add a test that fails on an
      unclassified field.
- [x] Never return `researchNotes` in a public projection under any role (I04).
- [x] A published finding does not make a restricted snapshot or private asset public.
- [x] No projection returns `score`, a badge, a verdict, or a combined legal/ethical conclusion
      (I12).

**Exit:** the projection classification is complete and machine-checkable.

### 5. I04 role x field matrix

- [x] Build a matrix of every role (including guest) x every internal field.
- [x] Test each cell: public fields present where expected; internal fields absent for weak roles.
- [x] Attempt deep client-requested `get`/`select` projections and confirm they cannot widen the
      allowlist.
- [x] Test merged tombstones, retracted findings, restricted sources, private assets, and
      unpublished research.
- [x] Record the matrix and results in the report.

**Exit:** I04 and S14 pass for every role x field combination.

### 6. Action triad and validators

- [x] Keep the three-file pattern: `mod.ts` (registration/preActs), `<action>.fn.ts`,
      `<action>.val.ts`.
- [x] Validators are strict: reject unknown keys, wrong types, over-cap arrays, invalid enums, and
      forbidden fields (`version`, `_id`, `createdAt`, `createdBy` in patches).
- [x] Projections are explicit, not client-controlled.
- [x] Pre-acts load auth context, capability, rate limit, and request id.
- [x] Actions return the stable error envelope.
- [x] Actions never accept a collection/model name, Mongo path, or operator from the client.
- [x] Document the action inventory and map each to its plan and tests.

**Exit:** every action follows the triad and has authorization + validation + projection tests.

### 7. Generated contract and frontend handoff

- [x] Generate declarations from production models/actions after names stabilize.
- [x] Confirm the generated `ReqType` includes custom actions, validators, and union shapes.
- [x] Add a minimal frontend server action check that consumes the generated types (not production
      UI).
- [x] Confirm the token header, error envelope, and projection types are usable.
- [x] Confirm locale placeholders wrap data rather than replacing it; no hardcoded public copy.
- [x] Never hand-edit generated declarations.

**Exit:** frontend typecheck passes against the generated contract; no direct backend fetch or
private field.

### 8. Tests and report

- [x] Tests: I04, I12, S14, auth/login/role/status, error envelope, deep projection,
      merged/retracted cases.
- [x] Negative tests: token with inflated roles, `Bearer` prefix, expired/wrong-signature token,
      guest research access, contributor publish, weak-role audit access, client-supplied collection
      name.
- [x] Write `reports/08-auth-projections-and-api-contract.md`.

## Deliverables

1. JWT auth with DB-derived roles and guest public access.
2. Central capability matrix and pre-act enforcement.
3. Stable error envelope.
4. Public/Research/Admin projection builders with complete field classification.
5. I04 role x field matrix evidence.
6. Generated contract and frontend handoff check.
7. `reports/08-auth-projections-and-api-contract.md`.

## Acceptance Criteria

1. Roles come from the database; token claims are ignored.
2. `token` header works without `Bearer`; malformed auth returns 401.
3. `trustLevel` never authorizes an action.
4. I04 and S14 pass for every role x internal field.
5. No public projection contains research notes, PII, roles, private keys, restricted sources, or a
   score.
6. Generated types are consumed by the frontend without manual duplication.

## Verification Commands

```bash
cd back
deno task fmt:check
deno task lint
deno task check
deno task test

cd ../front
pnpm typecheck
pnpm lint
```

## Risks and Mitigations

| Risk                               | Mitigation                                            |
| ---------------------------------- | ----------------------------------------------------- |
| Client projection widens access    | Server-side allowlist; deep projection negative tests |
| Token claims become authorization  | Load roles from DB every request                      |
| Capability logic duplicated        | One matrix, one pre-act helper                        |
| Field classification is incomplete | Compile/test failure for unclassified fields          |
| Error messages leak internals      | Stable codes + sanitized messages + tests             |
