# Ansoo - Consumer Transparency Platform

## What This Repository Is

Ansoo lets a consumer resolve a product identifier (scan or manual search) to a transparent product profile:
identity, brand, category code, organizations, time-aware relationships, published claims, evidence,
sources, organization responses, corrections, and unknowns. It must never reduce this to a single opaque
ethical, legal, or boycott score.

**Current status: scaffold only.** The canonical domain contract is
`CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1). It supersedes v1/v2 and the old
`CONSUMER_TRANSPARENCY_FINAL_ERD.md` as domain authority; see
`back/docs/adr/0001-v3.1-single-canonical-spec.md`. Backend work follows plans 02-11 in
`back/docs/plans/`. The visual reference is `Example Design page/`.

## Architecture

| Layer | Technology |
|---|---|
| Backend | Deno + Lesan 0.2.3 (MongoDB ODM/API framework) + djwt |
| Database | MongoDB (single-node replica set in development) |
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (base-ui) + next-intl + Zustand + React Hook Form + Zod |
| Asset bytes | Object storage (S3-compatible in production, local provider in development) |
| Mongo asset data | Metadata, hashes, visibility, processing state only |

## Repository Layout

```
Ansoo/
├── AGENTS.md                          # This file
├── CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md # Canonical domain contract
├── CONSUMER_TRANSPARENCY_FINAL_ERD.md # Historical v1/v2 baseline only
├── Example Design page/               # UI/visual reference mockups
├── ignore-scripts/                    # Local scratch scripts; never committed
├── back/
│   ├── AGENTS.md                      # Critical backend rules
│   ├── deno.json                      # Deno tasks/imports
│   ├── mod.ts                         # Entry point (scaffold)
│   ├── models/                        # One Lesan model file per collection
│   ├── src/                           # One folder per model/action
│   ├── utils/                         # Shared domain services, vocabulary, config
│   ├── scripts/                       # Reproducible dev/verification scripts
│   ├── archive/                       # Historical spike code; never production-imported
│   ├── taxonomy.v1.json               # Category-code taxonomy (no Category collection)
│   ├── docs/                          # README, summary, ADRs, plans, prompts, reports
│   └── tests/                         # Invariant, domain, and infrastructure tests
└── front/
    ├── AGENTS.md                      # Critical frontend rules
    ├── package.json
    ├── docs/
    ├── prompts/
    └── src/
        ├── app/                       # Public, auth, research, actions
        ├── components/                # ui, layout, form, providers, domain
        ├── lib/                       # API client, auth, server-action helpers
        ├── stores/                    # Zustand
        ├── hooks/
        ├── i18n/messages/             # Locale message catalogs
        └── types/declarations/        # Generated Lesan declarations
```

## Commands

```bash
# Backend
cd back
deno task db:dev       # single-node MongoDB replica set
deno task dev          # watch mode
deno task fmt
deno task lint
deno task check
deno task test
deno task config:check
deno task types

# Frontend
cd front
pnpm install           # pnpm only
pnpm dev
pnpm typecheck
pnpm lint
pnpm build
```

Backend playground: `http://localhost:1370/playground` after the server is implemented.
Frontend: `http://localhost:3000`. Environment examples live in `back/.env.example` and
`front/.env.local.example`.

## Scripting Conventions

- Any ad-hoc script (data entry, migration, automation, or one-off verification) belongs in
  `ignore-scripts/` at the project root, never in `back/scripts/`, `front/`, or a source directory.
- `ignore-scripts/` is git-ignored; do not force-add it. A script that must be reviewed, shared, or
  rerun belongs in `back/scripts/` (with a Deno task) or `front/package.json` instead.
- Run temporary scripts from the project root, for example
  `python3 ignore-scripts/_someScript.py`.
- Do not put secrets, tokens, private personal data, or restricted source content in scratch scripts.

## Domain Pillars

1. **Identity** - Product, Brand, Organization. Product uses `categoryCode` from `taxonomy.v1.json`;
   there is no Category collection in the MVP.
2. **Relationships** - directed, typed, scoped, time-aware graph edges.
3. **Research** - Claims, contextual EvidenceLinks, SourceSnapshots, review workflow, evidence assessment,
   publication gate and decision.
4. **Accountability** - Corrections, Organization Responses, Users, append-only Audit Events.

Core collections (exactly 11): `products`, `brands`, `organizations`, `relationships`, `claims`, `sources`,
`source_snapshots`, `assets`, `corrections`, `users`, `audit_events`. The only derived collection is the
technical `product_public_profiles` read model, which is never a source of truth.

## Non-Negotiable Domain Rules

1. **Product is not Brand. Brand is not Organization.** A corporate group and its legal entities are separate Organization documents.
2. **Relationships are independent graph edges, not fields.** Ownership/control/manufacturing/import/distribution changes create a new edge; never rewrite an old edge's subject to represent a new owner. Corrections increment the edge version and create an Audit Event.
3. **Source is not SourceSnapshot.** A Source is an identity; each changed capture is a new immutable Snapshot with its own hash, retrieval time, and Asset.
4. **Status dimensions never collapse.** `recordLifecycle`, `review.status`, `assessment.outcome`, and `publication.status` answer different questions. `SUPPORTED` does not mean `PUBLISHED`; `NOT_SUPPORTED` does not mean `FALSE`.
5. **No arbitrary database patches.** Correction `fieldKey`/`operation`/`proposedValue` must be allowlisted and applied through dedicated domain actions with version checks, idempotency, and an Audit Event.
6. **Audit Events are append-only.** Never update or delete them. Redact secrets and personal data.
7. **Public projections are explicit.** Never leak emails, phones, internal roles, research notes, unreviewed submissions, restricted sources, or private asset keys through client-requested projections.
8. **Lesan Relations only where fixed-schema:** exactly `Product.brand` -> Brand and `SourceSnapshot.source` -> Source. Polymorphic endpoints/targets use typed ObjectId references validated by a server-controlled registry.
9. **Reverse relation arrays are previews.** Any limited reverse relation is a bounded window, never the authoritative list, count, export, or research corpus. Query the owning collection.
10. **Localization is first-class.** Store canonical values plus localized display values. Persian (`fa`) and Arabic (`ar`) are RTL; English (`en`) is LTR; keep the model extensible. Store dates in UTC and localize display; never guess unknown dates.
11. **Barcode/GTIN inference is forbidden.** A GS1 prefix or barcode allocation must not infer manufacturing country, nationality, ownership, or legal/ethical status.
12. **No universal verdict.** The product profile shows separate identity, relationship, claim, evidence, limitation, and publication states. Legal and campaign modules are future, reviewed features.
13. **Arrays have hard caps.** Exceeding a cap is `422 CAP_EXCEEDED`, never a silent discard or `$slice`.

## Working Agreement

- Read `CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` and `back/docs/summary.md` before domain work.
- No feature implementation outside the approved plans in `back/docs/plans/`.
- Keep frontend business logic thin; backend domain services enforce authorization, validation, history, and audit.
- Do not add libraries or frameworks not already planned without checking `package.json`/`deno.json` and the spec.
- Do not implement production features in the scaffold phase.
- Do not silently answer the six open decisions in spec Section 22.

## Documentation Index

- `CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` - canonical domain contract; wins every conflict.
- `back/docs/README.md` - documentation entry point and status.
- `back/docs/summary.md` - the only condensed v3.1 domain reference.
- `back/docs/adr/` - accepted decisions; ADR-0001 establishes v3.1 authority.
- `back/docs/plans/00-roadmap.md` - delivery sequence, dependencies, gates.
- `back/docs/plans/02-11` - executable backend plans; `back/docs/prompts/` mirrors them.
- `back/docs/reports/` - evidence packs, including the historical spike report.
- `back/AGENTS.md` - critical Lesan, security, and domain-model rules.
- `front/AGENTS.md` - routing, i18n/RTL, server actions, and public-profile UI rules.

## Git Conventions

When I say `git commit` please do the following. If I have not said `git commit`, do not commit.

```
Please act as an expert Git commit assistant. Your task is to carefully review the recent project changes (e.g., via git diff or staged files) and generate a series of clear, conventional commit messages following best practices. Use Gitmoji emojis at the start of each commit message to make them more expressive and readable (e.g., :sparkles: for new features, :bug: for fixes).
Key guidelines:
Conventional structure: Each commit message should start with a Gitmoji, followed by a type (e.g., feat, fix, refactor, docs, test, chore), a scope in parentheses if applicable (e.g., (ui)), a colon, and a concise description. Include a body if needed for more details, and reference issues if relevant.
Grouping: Break changes into logical, atomic commits. Group related files or changes together (e.g., one commit for UI updates, another for bug fixes), rather than lumping everything into a single commit. Avoid overly large or unrelated groupings.
Execution: Directly output and execute the necessary Git shell commands (e.g., git add for specific files, followed by git commit -m "message") to apply these commits. Do not ask for confirmation, additional input, or perform unrelated actions like rebasing, squashing, or amending existing commits. Only create new commits on the current branch.
Best practices: Ensure messages are imperative, concise (aim for ~72 characters or fewer for the subject), and descriptive. Focus on what changed and why, not how.
Additional notes:
- Use present tense for the subject line (e.g., "Add feature" not "Added feature")
- Be specific about what was changed (e.g., "Fix user login validation" rather than just "Fix bug")
- When making breaking changes, indicate this with an exclamation mark after the type (e.g., "feat!: Remove deprecated API endpoint")
- Reference issue numbers if applicable (e.g., "fix(auth): Resolve login issue #123")
- For multiple related changes, create separate commits for each logical change
- When updating dependencies, mention the specific packages (e.g., "chore(deps): Update react and react-dom to v18")
- For documentation changes, be clear about what documentation was added or updated
- When changing configuration files, explain the purpose of the changes
Proceed step-by-step: First, analyze the changes, then propose the grouped commits, and finally execute the Git commands in sequence.
```

⚠️ **WARNING**: Under no circumstances should you ever use the `git reset` command when performing git
operations, as it can permanently erase work that took days to complete. This command has caused
significant data loss in the past and should be avoided entirely.

Never commit secrets, unintended generated artifacts, or scratch scripts.
