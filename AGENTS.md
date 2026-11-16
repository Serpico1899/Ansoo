# Ansoo - Consumer Transparency Platform

## What This Repository Is

Ansoo lets a consumer resolve a product identifier (scan or manual search) to a transparent product profile:
identity, brand, category, organizations, time-aware relationships, published claims, evidence, sources,
organization responses, corrections, and unknowns. It must never reduce this to a single opaque
ethical, legal, or boycott score.

**Current status: scaffold only.** There is no application code yet. The canonical domain baseline is
`CONSUMER_TRANSPARENCY_FINAL_ERD.md`. Treat it as a proposed baseline that must be validated through the
Architecture Spike before production lock-in. The visual reference is `Example Design page/`.

## Architecture

| Layer | Technology |
|---|---|
| Backend | Deno + Lesan 0.2.3 (MongoDB ODM/API framework) + djwt |
| Database | MongoDB |
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui (base-ui) + next-intl + Zustand + React Hook Form + Zod |
| Asset bytes | Object storage (S3-compatible in production, local provider in development) |
| Mongo asset data | Metadata, hashes, visibility, processing state only |

## Repository Layout

```
Ansoo/
├── AGENTS.md                         # This file
├── CONSUMER_TRANSPARENCY_FINAL_ERD.md # Domain baseline (read before any domain work)
├── Example Design page/               # UI/visual reference mockups
├── ignore-scripts/                    # Local scratch scripts; never committed
├── back/
│   ├── AGENTS.md                      # Critical backend rules
│   ├── deno.json                      # Deno tasks/imports
│   ├── mod.ts                         # Entry point (scaffold)
│   ├── models/                        # One Lesan model file per collection
│   ├── src/                           # One folder per model/action
│   ├── utils/                         # Shared domain services and guards
│   ├── docs/
│   │   ├── summary.md                 # Condensed domain + scaffold summary
│   │   ├── plans/01-architecture-spike.md
│   │   └── prompts/01-architecture-spike.md
│   └── tests/
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
deno task dev          # watch mode
deno task fmt
deno task lint
deno task check
deno task test

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

## Domain Pillars

1. **Identity** - Product, Brand, Category, Organization.
2. **Relationships** - directed, typed, scoped, time-aware graph edges.
3. **Research** - Claims, contextual EvidenceLinks, SourceSnapshots, review workflow, evidence assessment, publication decision.
4. **Accountability** - Corrections, Organization Responses, Users, append-only Audit Events.

Core collections: `products`, `brands`, `categories`, `organizations`, `relationships`, `claims`,
`sources`, `source_snapshots`, `assets`, `corrections`, `users`, `audit_events`.

## Non-Negotiable Domain Rules

1. **Product is not Brand. Brand is not Organization.** A corporate group and its legal entities are separate Organization documents.
2. **Relationships are independent graph edges, not fields.** Ownership/control/manufacturing/import/distribution changes create a new edge; never rewrite an old edge's subject to represent a new owner. Corrections increment the edge version and create an Audit Event.
3. **Source is not SourceSnapshot.** A Source is an identity; each changed capture is a new immutable Snapshot with its own hash, retrieval time, and Asset.
4. **Status dimensions never collapse.** `recordLifecycle`, `review.status`, `assessment.outcome`, and `publication.status` answer different questions. `SUPPORTED` does not mean `PUBLISHED`; `NOT_SUPPORTED` does not mean `FALSE`.
5. **No arbitrary database patches.** Correction `fieldKey`/`operation`/`proposedValue` must be allowlisted and applied through dedicated domain actions with version checks, idempotency, and an Audit Event. Approval is not application.
6. **Audit Events are append-only.** Never update or delete them. Redact secrets and personal data.
7. **Public projections are explicit.** Never leak emails, phones, internal roles, research notes, unreviewed submissions, restricted sources, or private asset keys through client-requested projections.
8. **Lesan Relations only where fixed-schema:** Product -> Brand, Product -> Category, SourceSnapshot -> Source. Polymorphic endpoints/targets use typed ObjectId references validated by a server-controlled registry.
9. **Reverse relation arrays are previews.** Any limited reverse relation is a bounded window, never the authoritative list, count, export, or research corpus. Query the owning collection.
10. **Localization is first-class.** Store canonical values plus localized display values. Persian (`fa`) and Arabic (`ar`) are RTL; English (`en`) is LTR; keep the model extensible. Store dates in UTC and localize display; never guess unknown dates.
11. **Barcode/GTIN inference is forbidden.** A GS1 prefix or barcode allocation must not infer manufacturing country, nationality, ownership, or legal/ethical status.
12. **No universal verdict.** The product profile shows separate identity, relationship, claim, evidence, limitation, and publication states. Legal and campaign modules are future, reviewed features.

## Working Agreement

- Read `CONSUMER_TRANSPARENCY_FINAL_ERD.md` and `back/docs/summary.md` before domain work.
- No feature implementation without the Architecture Spike or an approved plan.
- Keep frontend business logic thin; backend domain services enforce authorization, validation, history, and audit.
- Do not add libraries or frameworks not already planned without checking `package.json`/`deno.json` and the ERD.
- Do not implement production features in the scaffold phase.
- Any ad-hoc script belongs in `ignore-scripts/` (git-ignored).

## Documentation Index

- `back/docs/summary.md` - condensed domain model, relation boundaries, status matrix, open questions.
- `back/docs/plans/01-architecture-spike.md` - first executable plan: prove the Lesan/MongoDB baseline.
- `back/docs/prompts/01-architecture-spike.md` - agent prompt for executing plan 01.
- `back/AGENTS.md` - critical Lesan, security, and domain-model rules.
- `front/AGENTS.md` - routing, i18n/RTL, server actions, and public-profile UI rules.

## Git Conventions

When explicitly asked to commit, use conventional commit messages with a scope
(`feat`, `fix`, `refactor`, `docs`, `test`, `chore`). Group changes into logical atomic commits.
**Never use `git reset`** - it has caused data loss in this workspace's history. Do not force-push or
amend unless explicitly requested.
