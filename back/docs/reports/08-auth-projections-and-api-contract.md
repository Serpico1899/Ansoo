# Plan 08 - Auth, Projections, and API Contract

**Status:** Complete (2026-11-19) **Plan:** `../plans/08-auth-projections-and-api-contract.md`
**Canonical contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md`

## 1. Environment

| Item     | Value                                                           |
| -------- | --------------------------------------------------------------- |
| OS       | Linux 7.0.0-43-generic x86_64                                   |
| Deno     | 2.4.5 (V8 13.7, TypeScript 5.8.3)                               |
| Lesan    | `jsr:@hemedani/lesan@^0.2.3`                                    |
| MongoDB  | 8.0.13, single-node replica set `rs0` on port 27019             |
| Database | Test harness per suite; `ansoo_plan08_auth`, `ansoo_plan08_api` |
| Frontend | Next.js 16 / TypeScript, `pnpm typecheck` and `pnpm lint`       |

Environment and command evidence: `evidence/08-auth-projections-and-api-contract/`.

## 2. Results by Task

| Task                                       | Result | Evidence                                                                |
| ------------------------------------------ | ------ | ----------------------------------------------------------------------- |
| 1. Authentication                          | Pass   | `tests/auth/jwt.integration.test.ts`                                    |
| 2. Capability matrix                       | Pass   | `tests/auth/capabilities.test.ts`                                       |
| 3. Error envelope                          | Pass   | `tests/api/errors.test.ts`                                              |
| 4. Projection levels                       | Pass   | `tests/projections/classification.test.ts`                              |
| 5. I04 role x field matrix                 | Pass   | `tests/projections/i04.test.ts`                                         |
| 6. Action triad and validators             | Pass   | `tests/api/dispatch.integration.test.ts`, `tests/api/inventory.test.ts` |
| 7. Generated contract and frontend handoff | Pass   | generated declarations + frontend typecheck                             |
| 8. Tests and report                        | Pass   | full suite below                                                        |

### Authentication

- Session JWTs are HS256 with a mandatory non-placeholder secret of at least 32 characters.
- Tokens carry identity claims only. The `users` document is reloaded on every request; roles, trust
  level, and account status come from that document.
- The `token` header is the only credential channel. `Bearer <jwt>` is rejected with `401`.
- Signature, expiry, optional issuer/audience, a 24-hex subject, and user existence are validated.
- Missing/deleted users are `401`; suspended/closed accounts are `403`.
- Guests may call public actions without a token. No guest scan history is stored because no history
  collection or action exists.
- `users.login` exchanges a provider assertion for a session token and is rate-limited per remote
  IP. The assertion secret is optional; when absent, login fails closed with
  `503 AUTH_LOGIN_DISABLED`.
- Audit role/status changes remain owned by Plan 07 and are not duplicated here. Tokens and
  assertion values are never logged.

### Capability Matrix

One matrix in `utils/auth/capabilities.ts` is used by one pre-act helper, `requireCapability`. The
baseline matrix matches the plan exactly. `trustLevel` is not referenced by authorization code.
Upload policies (`UPLOAD_EVIDENCE_ASSET`, `UPLOAD_RESPONSE_ASSET`) are separate from research
capabilities. Tests iterate every role x every capability cell (including uploads) and assert both
allow and deny outcomes.

### Error Envelope

Failures return:

```json
{
  "success": false,
  "body": {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "validation failed",
      "requestId": "...",
      "fields": { "path": "..." }
    }
  }
}
```

`requestId` is also returned in `x-request-id`. Codes are stable: `UNAUTHENTICATED`, `FORBIDDEN`,
`NOT_FOUND`, `CONFLICT`, `INVALID_TRANSITION`, `USE_RELATIONSHIP_INSTEAD`, `VALIDATION_ERROR`,
`CAP_EXCEEDED`, `RATE_LIMITED`, `INTERNAL`, plus `AUTH_LOGIN_DISABLED`. Messages are fixed safe
strings. Validation paths are identifier-only; opaque keys, operators, values, stack traces, paths,
collection names, and model names are never echoed. Unknown exceptions become `500 INTERNAL`.

### Projection Levels

`utils/projections/classification.ts` classifies every canonical collection field as `PUBLIC`,
`RESEARCH`, or `ADMIN`; unknown fields fail closed. Nested keys are classified only when stricter
than their parent. Lookup-only values (`matchKey`, `identifiers.matchValue`, alias lookup keys,
internal IDs) are `RESEARCH` even when their parent object is public.

Public views (`utils/projections/views.ts`) enforce:

- only `ACTIVE` records and `PUBLISHED` findings;
- no `researchNotes`, reviewer/decider IDs, private asset keys, restricted sources, roles, PII, or
  security metadata;
- public citations require an active snapshot, a `PUBLIC` source, and (when present) a `PUBLIC`,
  active, `CLEAN` asset;
- published findings do not unlock restricted snapshots or private assets;
- merged products expose only a tombstone and redirect target;
- retracted and unpublished findings return `null`;
- no `score`, verdict, badge, color, or combined conclusion exists in any projection.

Actions use these builders and ignore client `get`/`select` shapes. `getPublicProfile` accepts only
an ObjectId or a normalized GTIN; it never accepts a collection name, Mongo path, or operator.

### Action Triad

Implemented actions:

| Action                      | Access          | Rate limit       | Tests                       |
| --------------------------- | --------------- | ---------------- | --------------------------- |
| `products.getPublicProfile` | GUEST           | -                | dispatch integration        |
| `claims.getResearch`        | `READ_RESEARCH` | -                | dispatch integration        |
| `auditEvents.gets`          | `READ_AUDIT`    | -                | dispatch integration        |
| `users.login`               | GUEST           | 10 / 15 min / IP | auth + dispatch integration |
| `users.getMe`               | AUTHENTICATED   | -                | dispatch integration        |

Each action has `mod.ts` registration, `<action>.fn.ts`, and `<action>.val.ts`. Validators reject
unknown keys, wrong types, oversized bodies, and invalid identifiers. The dispatcher applies auth,
capability, request/correlation IDs, and rate limiting before invoking the action. Direct Lesan
action invocation is disabled by registering a throwing function.

`ACTION_INVENTORY` documents registered and planned actions. A test fails if a registered action is
missing from the inventory or an implemented inventory entry is not registered.

### Generated Contract

`deno task types` generated `back/declarations/selectInp.ts` and copied it to
`front/src/types/declarations/selectInp.ts`. The generated `ReqType` includes all five registered
actions and their `set` shapes. Frontend server actions `getPublicProfile` and `login` consume
`ReqType` directly.

## 3. Decisions

1. **Roles are database-derived on every request.** Token role/trust claims are ignored. This is
   required by I04 and by Plan 08 acceptance.
2. **The capability matrix is the baseline in the plan, not a final legal/product policy.** Plan 08
   says the final policy requires product/legal approval; no ADR was invented to freeze it. Future
   changes must be recorded in an ADR.
3. **The rate limiter is in-process and deterministic for development/tests.** A shared store is
   required before multi-instance production deployment; the dispatcher contract already accepts a
   single `check`.
4. **Remote IP comes from the server connection, not `x-real-ip`.** Client-supplied forwarding
   headers are not trusted for rate-limit identity.
5. **Projection `get` is accepted but ignored.** It is preserved so Lesan-generated requests remain
   compatible; it never widens the server allowlist.
6. **Public projection views are primitives, not the final profile.** Plan 09 owns profile assembly,
   inheritance, the read model, and retraction rebuilds.

## 4. Measurements

- Full backend suite: 143 tests passed, 155 steps, 0 failed, 9 intentionally ignored duplicate
  invariant tests, in 1m11s.
- I04 matrix: 11 canonical collections x 7 role groups (guest + 6 roles) = 77 cells passed.
- Generated declarations: 22,606 bytes, identical in backend and frontend.
- Request body cap: 1,000,000 bytes; oversized bodies return `422` before action execution.
- Login rate limit: 10 requests per 900 seconds per remote IP, `429` with `retryAfterSeconds`.
- No latency or index performance claim is made by Plan 08.

## 5. Security Negative Tests

| Attempt                                             | Result                                       |
| --------------------------------------------------- | -------------------------------------------- |
| Token with inflated `roles: ["ADMIN"]` / trust      | Roles ignored; DB roles used                 |
| `Bearer <jwt>`                                      | `401 UNAUTHENTICATED`                        |
| Expired token                                       | `401`                                        |
| Wrong signature                                     | `401`                                        |
| Wrong issuer/audience                               | `401`                                        |
| Malformed / unknown-user subject                    | `401`                                        |
| Missing, suspended, or closed account               | `401` / `403`                                |
| Guest research read                                 | `401`                                        |
| Contributor publish/audit/manage-user capability    | `403`                                        |
| Trusted contributor                                 | No capability grant                          |
| Client deep `get` for notes/PII/roles/score         | Ignored; absent from response                |
| Search result for restricted source/private asset   | Blocked or omitted                           |
| Merged tombstone                                    | Redirect only; merge actor/reason hidden     |
| Retracted/unpublished finding                       | Omitted                                      |
| Unknown action name / collection name               | `404`, no registry listing                   |
| Validator unknown key / `$where` / invalid ObjectId | `422`, values not echoed                     |
| Oversized body                                      | `422`                                        |
| Login burst                                         | `429` with stable envelope and `retry-after` |
| Direct Lesan action call                            | Throws; dispatcher is the only path          |

## 6. Blocked / Open Items

- **Shared rate-limit store:** needed before horizontal production scaling. Owner: backend/platform.
  Consequence: per-instance limits only today.
- **Production identity provider:** login currently exchanges a trusted provider assertion. Provider
  selection, key rotation, and account provisioning remain future work.
- **Final capability policy:** baseline matrix requires product/legal approval. Consequence: changes
  must be reviewed and recorded in an ADR.
- **Public profile assembly:** Plan 09. This plan provides primitives and a minimal action, not
  final profile inheritance or read-model rebuild behavior.

## 7. Files Changed

Production:

- `utils/auth/{jwt,capabilities,rateLimit,actor,mod}.ts`
- `utils/projections/{classification,views,mod}.ts`
- `utils/api/{errors,types,registry,dispatch,mod}.ts`
- `utils/config.ts`, `utils/mod.ts`
- `src/{mod,deps}.ts`
- `src/user/{login,getMe}/`, `src/product/getPublicProfile/`, `src/claim/getResearch/`,
  `src/auditEvent/gets/`
- `mod.ts`, `scripts/generate-types.ts`
- `declarations/selectInp.ts`, `front/src/types/declarations/selectInp.ts`
- `front/src/app/actions/spike/getPublicProfile.ts`, `front/src/app/actions/auth/login.ts`
- `.env.example`, `front/.env.local.example`

Tests and docs:

- `tests/auth/`, `tests/api/`, `tests/projections/`
- `tests/invariants/{inventory,invariants.test}.ts`
- This report and `evidence/08-auth-projections-and-api-contract/`
- Plan status, summary, documentation index, and report index

Cleanup: no production feature was implemented outside Plan 08. No scratch script, secret, token, or
restricted content was committed.

## 8. Verification

Run from `back/` unless noted:

| Command                              | Result                                     | Evidence                    |
| ------------------------------------ | ------------------------------------------ | --------------------------- |
| `deno task fmt:check`                | 143 files checked                          | `fmt.log`                   |
| `deno task lint`                     | 142 files checked, no issues               | `lint.log`                  |
| `deno task check`                    | Entry points checked                       | `check.log`                 |
| `deno task types`                    | Generated and copied declarations          | `types.log`                 |
| `RUN_MONGO_TESTS=1 deno task test`   | 143 passed, 155 steps, 0 failed, 9 ignored | `tests.log`                 |
| `deno task start` + `GET /health`    | 1371 listening; `200 {"status":"ok"}`      | `startup.log`, `health.log` |
| `deno task config:check` (valid env) | `ok: true`                                 | `config-check.log`          |
| `cd ../front && pnpm typecheck`      | Pass, no output                            | `front-typecheck.log`       |
| `cd ../front && pnpm lint`           | Pass, no output                            | `front-lint.log`            |

The 9 ignored tests are duplicate invariant entries that are already covered by their named suites;
they are intentionally skipped to avoid double-running the same checks.
