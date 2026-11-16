# Architecture Spike Report - Deno + Lesan + MongoDB

Date: 2026-11-15
Plan: `docs/plans/01-architecture-spike.md`
Status: **Complete with constraints; go for the first read-only slice**

## 1. Environment

| Component | Version / configuration |
|---|---|
| Deno | 2.4.5 (TypeScript 5.8.3) |
| Lesan | `jsr:@hemedani/lesan@0.2.3` |
| MongoDB | 8.0.13 (local `mongod`, port 27019) |
| Database | Throwaway per-test databases (`ansoo_spike_*`) |
| Asset provider | Local filesystem under `/tmp/opencode/ansoo-spike-assets` |
| Auth | HS256 JWT via `djwt`; token in the `token` header, no `Bearer` |

The machine has a broken system MongoDB instance and no sudo. A local instance was used:

```bash
mongod --dbpath /tmp/opencode/ansoo-mongo --port 27019 --bind_ip 127.0.0.1 \
  --logpath /tmp/opencode/ansoo-mongo.log --fork
```

Proxy environment variables break localhost access in this workspace; commands were run with
`env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy` and curl with
`--noproxy '*'`.

Verification commands and final result:

```bash
cd back
deno task fmt:check   # Checked 26 files
deno task lint        # Checked 26 files
deno task check       # Checked mod.ts
deno task test        # ok | 10 passed (73 steps) | 0 failed (1m42s)

cd ../front
pnpm typecheck        # tsc --noEmit, exit 0
```

`deno task check` type-checks only `mod.ts`; `deno task test` type-checks all spike tests and services.
Both passed. Raw outputs are archived under `docs/reports/evidence/01-architecture-spike/`
(`verification.log`, `test.log`, `benchmark.log`, `http-smoke.log`).

## 2. Results by task

| Task | Result | Observed behavior | Evidence |
|---|---|---|---|
| Bootstrap, playground, type generation | Pass | Server starts, playground responds with HTTP 200, actions are callable over HTTP, `generateSchemTypes()` writes `declarations/selectInp.ts` | `tests/spike_01...`, `tests/spike_10...`, `spike/serve_smoke.ts`, `/tmp/opencode/spike_http_smoke.sh` |
| Collection/schema naming | Pass | Lesan used the exact snake_case `schema` names (`source_snapshots`, `audit_events`) with no mapping layer; camelCase `sourceSnapshot` did not appear | `tests/spike_01...` step 1 |
| Document metadata | Pass | `_id` is emitted for parent and embedded relation snapshots; pure child fields are embedded; `excludes` removes internal fields | `tests/spike_01...` steps 2-3, `spike/models.ts` |
| Product -> Brand relation | Pass | Optional relation; absent means no `brand`; present means embedded snapshot with `_id`; replacement updates both sides; stale snapshot until replaced | `tests/spike_01...` steps 2-6 |
| Reverse preview bounds | Pass with constraint | `productsPreview` returned 5 for 7 products; full list required an owning-collection query; preview is not a count | `tests/spike_01...` step 5 |
| Product -> Category and tree | Pass | Parent/depth/ancestor updates on subtree move; cycle rejected before write | `tests/spike_02...` steps 1-2, `spike/category.ts` |
| SourceSnapshot -> Source | Pass | Source is required; reverse preview bounded; changed capture becomes a new snapshot | `tests/spike_02...` steps 3-4 and 6 |
| Snapshot immutability | Pass | `contentHash` correction is rejected; only capture metadata and lifecycle are allowlisted | `spike/correction.ts`, `tests/spike_05...` step 6 |
| Asset separation | Pass | Bytes went to the local provider; Mongo held hash, MIME, size, and state only; no `bytes`/`content` field | `tests/spike_02...` step 5, `tests/spike_07...` step 2 |
| Polymorphic reference registry | Pass | Writes and reads require exactly `{type, id}`; unknown types, extra keys, malformed ids, missing targets, type/field mismatches, and client collection names are rejected | `tests/spike_03...` all steps, `spike/registry.ts` |
| Independent status dimensions | Pass | Changing `review.status` did not change assessment or publication; `SUPPORTED+WITHHELD` and `NOT_SUPPORTED+PUBLISHED` were independently queryable | `tests/spike_04...` steps 1-3, `spike/status.ts` |
| Public projection allowlist | Pass | Deep client `get` request could not widen the response; research notes, reviewer ids, private keys, and restricted snapshot ids were absent; no verdict field | `tests/spike_04...` step 4, `tests/spike_10...` step 3, `spike/projection.ts` |
| Restricted sources | Pass | A published finding did not make a restricted source citable; citations enforce snapshot/source/asset visibility independently | `tests/spike_04...` step 5, `publicCitation` |
| Append-only audit | Pass at service layer | Redaction of email, phone, token, storage key, and auth subject; request grouping; no update/delete API | `tests/spike_05...` steps 1-2, `spike/audit.ts` |
| Correction approval vs application | Pass | Approval set `APPROVED` without changing the target; application required `APPROVED`, expected version, and idempotency key; one audit event | `tests/spike_05...` steps 3-4 |
| Correction negative cases | Pass | Second application was idempotent with the same key and `ALREADY_APPLIED` with a different key; stale version rejected; arbitrary fields, operators, and operations rejected | `tests/spike_05...` steps 5-8 |
| Auth and roles | Pass at module layer | Guest = public only; roles loaded from DB each request; inflated token claims ignored; `trustLevel` not authorization; suspended/closed denied; 401 vs 403 separated | `tests/spike_06...` all steps, `spike/auth.ts` |
| Token header | Pass | `Bearer ...` in `token` was rejected with 401; bad signature, expired token, bad subject, and deleted user rejected | `tests/spike_06...` steps 2 and 5 |
| Capability matrix | Pass | Researcher writes research but cannot publish or read audit; legal reviewer reviews but does not write research; moderator publishes and reads audit; admin all; public surfaces open to every role | `tests/spike_06...` steps 7-9 |
| Asset validation | Pass | MIME sniffed from bytes, declared MIME and extension must match, size/type allowlists enforced, quarantine until clean | `tests/spike_07...` steps 1-2 |
| Asset visibility and URLs | Pass | Non-public or non-clean asset hidden; EXIF stripped; HMAC URL expires and rejects tampering; object key never returned | `tests/spike_07...` steps 3-5 |
| SSRF hardening | Pass with constraint | HTTPS and port 443 only; credentials rejected; private/reserved/link-local/loopback/metadata IPs blocked; DNS resolved and revalidated on every redirect; redirects capped; body capped; credentials omitted | `tests/spike_07...` steps 6-8, `spike/assets.ts` |
| Identifier normalization/resolution | Pass | Check digits validated; values stay strings; scheme and leading zeroes preserved; statuses returned; duplicates ambiguous; jurisdiction narrows; invalid rejected; GS1 prefix never infers origin/ownership | `tests/spike_08...` all steps, `spike/identifiers.ts` |
| Search baseline | Pass, limited scope | NFKC, lowercase, whitespace-collapsed, escaped prefix regex over `normalizedName`; no fuzzy matching | `tests/spike_08...` step 10 |
| Query plans and latency | Pass | All eight core query shapes used named indexes with no collection scan; p95 well below targets | `tests/spike_09...`, Section 5 |
| BSON growth | Pass with required caps | Representative relationship 23.8 KB; 1,000 evidence links 1.1 MB; 5,000 5.5 MB; 15,000 16.6 MB (over 16 MiB) | Section 5, `spike/benchmark.ts` |
| Frontend contract | Pass | Generated `ReqType` includes custom actions and validator fields; a Next.js server action imported it and `pnpm typecheck` passed; locale placeholders wrap rather than replace data | `tests/spike_10...`, `../front/src/app/actions/spike/getPublicProfile.ts` |

HTTP smoke evidence: playground returned HTTP 200 and `POST /lesan` returned an allowlisted `MATCH` profile
without private fields. The smoke request did not exercise auth pre-acts; see the constraints.

## 3. Decision table

These decisions are appended to `docs/summary.md` in abbreviated form.

| Decision | Result | Evidence | Follow-up |
|---|---|---|---|
| Lesan schema/collection naming | Use the exact canonical snake_case names as Lesan schema keys; no mapping layer | `listCollections` showed `source_snapshots`, `audit_events`; no camelCase collection | Keep canonical names in production models; action/model names may be camelCase |
| Single relation snapshot shape | Embedded pure child fields plus `_id`; internal fields excluded; absent relation has no key, removed relation may be `{}` | `tests/spike_01...` steps 2-4 | Always treat `{}`/missing `_id` as absent; never infer presence from `{}` |
| Reverse preview behavior/limits | `relatedRelations` is a bounded preview controlled by `limit`; it is not a count or authoritative list | 5 previews for 7 products; 5 for 7 snapshots; owning query returned 7 | Name every reverse field `*Preview`; forbid previews in exports/counts |
| `updateRelations` semantics | `addRelation` with `replace: true` replaces the snapshot and updates both sides; re-adding without replace errors; `removeRelation` leaves `{}` | `tests/spike_01...` steps 3-4 and 6 | Wrap all relation changes in domain actions with audit and explicit expected state |
| Deletion/`hardCascade` policy | Do not use `hardCascade`; delete children first; parent deletion is refused while dependents exist | `tests/spike_01...` step 7 | Default to archive/`recordLifecycle`; explicit reviewed hard-delete runbook only |
| Type generation contract | Usable: emits `ReqType`, per-model schemas/inputs, custom action signatures, and validator fields | `tests/spike_10...`, `declarations/selectInp.ts`, front typecheck | Regenerate after production model/action names stabilize; never hand-edit generated types |
| Optimistic concurrency | Atomic filter on `_id` + `expectedVersion` with `$inc`-equivalent version bump; stale writes fail; sequential idempotency works | `tests/spike_05...` steps 4-5 | Add a unique idempotency ledger and prove concurrent double-apply before production corrections |
| Index declaration/verification | Declare named indexes and verify with `explain("executionStats")`; no collection scans | `tests/spike_09...`, Section 5 | Re-verify on production-like data and after every query change |
| Polymorphic reference registry | Only server-controlled `{type, id}`; per-field endpoint allowlists; existence checked on write and read | `tests/spike_03...` | Centralize in production; never accept collection/model/path/operator from clients |
| Snapshot immutability | Content identity fields are not correctable or replaceable; changed content creates a new snapshot | `tests/spike_02...` step 6, `tests/spike_05...` step 6 | Enforce at service and DB privilege layers; no bytes in Mongo |
| Audit append-only enforcement | Service exposes append/list only; updates/deletes throw; secrets redacted | `tests/spike_05...` steps 1-2 | Production DB user must lack update/delete on `audit_events`; add retention/export policy later |
| Correction application/idempotency | Approval is separate; apply is allowlisted, version-checked, keyed, and audited; sequential repeat is safe | `tests/spike_05...` steps 3-8 | Concurrency and crash-window behavior remain a production hardening item |
| Auth/roles/public split | Roles from DB, token claims ignored, `trustLevel` not authorization, guests public-only, token header without `Bearer` | `tests/spike_06...` | Wire into Lesan `preAct` using request headers and add HTTP-level auth tests |
| Asset storage/scanning | Bytes outside Mongo; metadata only; quarantine, MIME sniffing, EXIF stripping, signed URLs | `tests/spike_07...` steps 1-5 | Replace local provider and spike EXIF code with object storage and a maintained scanner/library |
| SSRF hardening | HTTPS/443, credential-free, private/reserved IP blocks, DNS revalidation, redirect/body caps | `tests/spike_07...` steps 6-8 | Pin the resolved IP at connect time or use a hardened dispatcher to close DNS-rebinding TOCTOU |
| Identifier normalization | Exact scheme-specific normalization with check digits; strings preserved; explicit outcomes | `tests/spike_08...` | Confirm first schemes/issuers; do not infer from GS1 prefix |
| Search baseline | Normalized prefix search only; no fuzzy matching or typo tolerance in MVP | `tests/spike_08...` step 10 | Add fuzzy/FTS only with a measured read model |
| BSON growth thresholds | Representative 23.8 KB; 1,000 links 1.1 MB; 15,000 links 16.6 MB; cap is required | Section 5 | Cap embedded evidence at 500 links (~0.55 MB) and split before 1 MiB; revisit with real data |

## 4. Open/blocked questions (ERD Section 18)

Technical questions are answered. Policy questions are deliberately blocked; they must not be encoded as
silent defaults.

| # | Question | Disposition | Owner |
|---|---|---|---|
| 1 | More than one primary Brand? | Blocked: domain/product policy. Model can support one embedded primary brand today; multiple would need a mapping/edge model. | Product/domain owner |
| 2 | One primary Category, secondary memberships? | Blocked: product policy. One embedded primary category works; secondary membership needs a separate reference/edge. | Product/domain owner |
| 3 | First identifier schemes and issuers | Partially answered: GTIN-8/12/13/14 and ISBN-13 normalize with the same check-digit logic; only GTIN-13 was exercised. Issuers are policy. | Product + data sourcing |
| 4 | Exact predicate meanings, inverse wording, endpoint types | Blocked: domain vocabulary. Registry shows how to enforce per-field endpoint allowlists. | Domain/research owner |
| 5 | Overlapping same-predicate edges with different sources/markets | Blocked: research policy. The edge model supports it; it needs a rule. | Research owner |
| 6 | Minimum evidence for `SUPPORTED` | Blocked: research/editorial policy. Status dimensions are independent and can carry the rule. | Research/editorial lead |
| 7 | Who assesses and who publishes/retracts | Partially answered technically: capability matrix proposed; final role policy needs approval | Research + legal + product |
| 8 | Can one review cover multiple findings? | Blocked: workflow policy. No `review_cases` aggregate was built; relationships/claims carry their own workflow. | Research owner |
| 9 | Per-parent evidence/response/note limits | Answered as a technical starting point: cap evidence at 500 (~0.55 MB); split at 1 MiB; cap responses/notes similarly | Backend + research |
| 10 | Asset public/internal/restricted/redacted and retention | Partially answered: four visibility values and clean/quarantine states work; retention policy blocked | Legal + security |
| 11 | Localization strategy | Partially answered: canonical + localized display fields shown in projections and placeholders; full catalog policy blocked | Product + frontend |
| 12 | Official Iranian identifiers and access | Blocked: legal/sourcing. No source is assumed. | Legal + data sourcing |
| 13 | Source types/authority and capture rules | Blocked: research policy. SourceType enum and capture flow exist; no reliability score was added. | Research owner |
| 14 | Public wording per assessment outcome | Blocked: editorial/legal. Spike uses outcome values without public prose. | Editorial + legal |
| 15 | Legal review before sensitive claims | Blocked: legal policy. Capability matrix separates legal review but does not define thresholds. | Legal |

## 5. Performance and BSON evidence

Dataset: 10,000 products, 50,000 relationships, 50,000 snapshots, 5,000 claims, 20,000 audit events.
Script: `spike/bench_full.ts`; output `/tmp/opencode/spike_full_bench.log`.

| Query | Index | Stage | Keys examined | Docs examined | Returned | p50 | p95 |
|---|---|---|---|---|---|---|---|
| Identifier by GTIN | `products_identifier` | FETCH | 1 | 1 | 1 | 1.40 ms | 2.41 ms |
| Brand product list | `products_brand_lifecycle_name` | LIMIT | 20 | 20 | 20 | 1.74 ms | 2.55 ms |
| Relationship subject | `rel_subject_predicate` | LIMIT | 20 | 20 | 20 | - | - |
| Research queue | `rel_review_queue` | LIMIT | 20 | 20 | 20 | 2.33 ms | 3.75 ms |
| Claims about product | `claims_about_type` | LIMIT | 2 | 1 | 1 | - | - |
| Snapshot history | `snapshots_source_retrieved` | LIMIT | 10 | 10 | 10 | - | - |
| Correction queue | `corrections_status_date` | LIMIT | 20 | 20 | 20 | - | - |
| Audit by target | `audit_target_date` | LIMIT | 1 | 1 | 1 | - | - |

All eight query shapes reported `collectionScan: false`. Latency targets were identifier <100 ms,
product/brand/category/relationship <200 ms, research queue <300 ms; measured p95 is far below them.

Index finding: a queue index of `{status, assignedTo, updatedAt}` cannot serve a global
`status + sort(updatedAt)` queue because the unconstrained middle key forces a scan of all status keys
(observed 8,334 keys for 20 results). The verified design uses two indexes:
`{status, updatedAt}` for the global queue and `{status, assignedTo, updatedAt}` for an assignee queue.
The same split applies to claims.

BSON measurements (synthetic evidence links of roughly 1 KB each):

| Embedded evidence links | Document size |
|---|---|
| Representative | 23,785 B (23.8 KB) |
| 1,000 | 1,107,927 B (1.1 MB) |
| 5,000 | 5,543,927 B (5.5 MB) |
| 15,000 | 16,638,927 B (16.6 MB) |
| Hard MongoDB limit | 16,777,216 B (16 MiB) |

Recommendation: cap a parent at 500 embedded evidence links (~0.55 MB), require a deliberate split design
before 1 MiB, and never permit 15,000-link aggregates.

## 6. Security negative tests

| Attempt | Result |
|---|---|
| Guest reads research queue/corrections/audit/private asset | Denied (401) |
| Token with inflated `ADMIN`/`trustLevel: 99` claims | DB `CONTRIBUTOR` roles used; admin capabilities denied |
| Trusted `CONTRIBUTOR` with high trust level tries to publish/read audit | Denied |
| `Bearer <jwt>` in `token` header | 401 |
| Wrong signature, expired token, non-ObjectId subject, deleted user | 401 |
| Suspended or closed account | 403 |
| Client deep `get` asks for `internalNotes`, `researchNotes`, `sourceSnapshotIds` | Not returned; allowlisted builder ignores client projection |
| Published finding cites restricted source | Rejected; citation checks source and asset visibility |
| Audit update/delete service call | Throws `append-only` |
| Correction `$where`, `__proto__`, `name; db.dropDatabase()`, forbidden field, unsupported operation | Rejected |
| Correction applied twice with different idempotency key | `ALREADY_APPLIED` |
| Correction applied with stale expected version | `VERSION_CONFLICT` |
| Correction application without idempotency key | `IDEMPOTENCY_KEY_REQUIRED` |
| Declared MIME mismatch, wrong extension, unknown MIME, empty/oversized upload | Rejected |
| Non-public or non-clean asset view | Rejected; storage key omitted |
| Temporary asset URL tampered or expired | Rejected |
| `http://`, non-443 port, URL credentials, `localhost`, private/link-local/loopback/metadata IPv4 and IPv6 | Rejected |
| Host resolves to private IP; redirect to metadata endpoint | Rejected after DNS revalidation |
| Redirect loop, oversized body, ambient credentials | Redirect/body caps enforced; `credentials: "omit"` |
| Duplicate identifier | `AMBIGUOUS` with candidate ids, never guessed |
| Invalid GTIN check digit | Rejected before query |
| GS1 prefix requested as country/ownership inference | No inference API; prefix is metadata only |

Known security limits to close in production:

1. DNS-rebinding TOCTOU remains possible between resolution check and socket connect; pin the resolved IP
   or use a dispatcher that does so.
2. Audit and snapshot immutability are enforced in the service layer; production DB privileges must also
   deny update/delete on `audit_events` and content fields.
3. Auth was proven as a module, not wired into Lesan `preAct` over HTTP in this spike.
4. Correction application has a crash window between target update and correction status/audit write;
   production needs a transaction or an idempotent ledger with a unique key.
5. Rate limiting, CSRF for cookie-based flows, secret rotation, and malware scanning are out of spike scope.

## 7. Go/no-go recommendation

**Go, with constraints, for a read-only identity/profile slice.**

The architecture can represent the ERD baseline without changing it: the three approved relations work,
polymorphic references can be registry-validated, statuses stay independent, public projections can be
allowlisted, audit/corrections can be made accountable, and core reads are index-backed with ample headroom.

Constraints before production lock-in:

1. Keep exact canonical collection names; do not add a global mapping layer.
2. Never trust client `get` projections; every public response is an explicit allowlist.
3. Treat removed relations (`{}`) as absent; change relations only through audited domain actions.
4. Do not use `hardCascade`; archive by default.
5. Implement corrections with a real idempotency ledger/transaction and prove concurrent double-apply.
6. Enforce audit append-only at the database privilege layer as well as in code.
7. Cap embedded arrays (evidence 500; responses/notes by the same order) and split before 1 MiB.
8. Wire DB-derived auth into Lesan pre-acts and test the full HTTP path, including error envelopes.
9. Replace the local asset provider and spike EXIF code; pin DNS at connect time for SSRF safety.
10. Do not infer country, ownership, or legal status from identifiers, barcodes, or corporate structure.
11. Resolve the policy questions in Section 4 before exposing assessments or sensitive claims publicly.

Do not proceed to write-heavy research workflows until questions 4-8, 10, 13-15 have owners and recorded
answers.

## 8. First production slice

**Identity resolution and a read-only public product profile.**

Scope:

- Models: `products`, `brands`, `categories`, `sources`, `source_snapshots`, `assets` (metadata), with only
  the three approved relations.
- Read actions: resolve an exact identifier; fetch an allowlisted public profile; prefix name search.
- Status fields carried separately: record lifecycle, review, assessment, publication; no verdict.
- Indexes: identifier, brand/category lifecycle listing, source snapshot history; verified with `explain`.
- Frontend: generated contract consumed by a server action; locale placeholders wrap data.

Tests:

1. Exact match, not found, ambiguous duplicate, invalid check digit, jurisdiction narrowing, leading zeroes.
2. GS1 prefix never produces country/ownership.
3. Public profile excludes research notes, private user fields, restricted sources, asset keys, reviewer ids.
4. Deep client projection attempt cannot widen the response.
5. Unpublished or non-public relationships/claims are absent; each status is visible independently.
6. Restricted citation is rejected even when the finding is published.
7. Guest reads public profile; research/audit surfaces return 401/403.
8. `explain` proves the identifier and listing indexes with no collection scan.
9. Type generation and frontend typecheck pass.

Deliberately excluded from the first slice: corrections, publication workflow, research writes, asset
upload/scanning, organization responses, and legal/campaign modules.

## 9. Files changed and cleanup status

Spike code is isolated under `back/spike/` and `back/tests/spike_*.test.ts` and is clearly marked
disposable. It has **not** been merged into `models/`, `src/`, or `utils/`, and no production feature was
implemented.

- `back/spike/*.ts`: disposable models, services, registry, auth, audit, corrections, projection,
  identifiers, assets/SSRF, indexes, benchmark, harness, type-contract actions, HTTP smoke server.
- `back/tests/spike_01..10_*.test.ts`: 73 passing steps.
- `back/declarations/selectInp.ts`: generated by the spike; regenerate from production models later.
- `back/docs/reports/01-architecture-spike.md`: this report.
- `back/docs/summary.md`: decision table updated with evidence and links.
- `front/src/types/declarations/selectInp.ts`: copied contract for the frontend check; replace with the
  production-generated file.
- `front/src/app/actions/spike/getPublicProfile.ts`: throwaway frontend contract check; remove or replace
  when the real action lands.

Cleanup before merging documentation or starting production: delete `back/spike/`, `back/tests/spike_*`,
the generated spike declaration, and the frontend spike action, or move them to an explicitly archived
location. No git repository exists in `back/`, so a spike branch was not available; isolation is by path.
