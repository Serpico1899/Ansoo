# Ansoo Frontend - Next.js

## Purpose

The frontend turns a scanned or manually entered product identifier into a transparent product profile and
provides the research workspace for internal staff. It must show identity, relationships, claims, evidence,
sources, responses, corrections, and unknowns separately. It must never present a single opaque ethical,
legal, or boycott score.

**Status: scaffold only.** The canonical contract is
`../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` (CT-DOMAIN-SPEC v3.1). Do not implement production pages until
the relevant backend plan in `../back/docs/plans/` is complete and its API contract exists.

## Next.js Version Warning

This is **Next.js 16**. APIs, conventions, and file structure can differ from older training data. Before
writing code, read the relevant guide under `node_modules/next/dist/docs/` and follow the installed version.
Do not copy patterns from Next.js 13/14/15 examples without checking.

## Stack

| Concern | Technology |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui with **base-ui** primitives |
| i18n | next-intl; default `fa` (RTL), also `en` (LTR) and `ar` (RTL), extensible |
| State | Zustand |
| Forms | React Hook Form + Zod |
| Theming | next-themes |
| API | Server Actions only (never direct client fetch to the backend) |
| Auth | JWT in an `httpOnly` cookie; sent to the backend as header `token` (no `Bearer`) |
| Types | Generated Lesan declarations in `src/types/declarations` |
| Package manager | **pnpm only** |

## Visual Reference

`../Example Design page/` contains the design mockups. Derive a coherent visual language from them; do not
ship generic SaaS defaults, arbitrary gradients, or disconnected component styles. Reuse tokens and
components instead of page-specific one-offs. Dark/light/system theming must work without a flash of the
wrong theme, and decorative motion must respect `prefers-reduced-motion`.

## Code Structure

```
src/
├── app/
│   ├── (public)/              # about, how-it-works, methodology, corrections, privacy, terms
│   ├── (auth)/login/
│   ├── search/                # manual identifier/name search
│   ├── scan/                  # camera/barcode entry and resolution states
│   ├── products/[id]/         # public product profile
│   ├── brands/[id]/
│   ├── organizations/[id]/
│   ├── sources/[id]/
│   ├── relationships/[id]/
│   ├── claims/[id]/
│   ├── research/              # internal research workspace
│   │   ├── queue/
│   │   ├── products/ brands/ organizations/
│   │   ├── relationships/ claims/ sources/ snapshots/
│   │   ├── assets/ corrections/ users/ audit-events/
│   └── actions/               # Server Actions, one folder per backend model
├── components/
│   ├── ui/                    # shadcn/base-ui primitives
│   ├── layout/                # shells, navigation, headers
│   ├── form/                  # reusable form fields and validation display
│   ├── providers/             # theme, intl, query/state providers
│   └── domain/                # product, relationship, claim, evidence components
├── lib/                       # api client, auth, server-action helpers, formatting
├── stores/                    # Zustand
├── hooks/
├── i18n/messages/             # per-locale message catalogs
└── types/declarations/        # generated Lesan declarations
```

## Internationalization and RTL

- `fa` is the default locale; `en` and `ar` are supported. Keep the locale list extensible.
- Every user-facing string comes from `next-intl` messages. Never hardcode copy in components.
- Set `dir="rtl"` for `fa` and `ar`, `dir="ltr"` for `en`. Do not assume a global direction.
- Use logical CSS properties (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`) and logical Tailwind
  utilities. Never use physical `left`/`right` positioning for layout.
- Some base-ui primitives default to LTR. Pass `dir` explicitly when a primitive renders its own
  direction-sensitive UI.
- Format numbers, dates, and currency with `Intl`/next-intl formatters. Store and transport UTC dates;
  never guess unknown dates. Persian display may use Jalali formatting without changing stored values.
- Canonical values and localized display values are separate. Do not overwrite canonical data with a
  translation.

## Public Product Profile

The profile is a set of explicit, separately labeled sections, not a verdict:

1. Product identity, identifiers approved for display, and brand-mapping state.
2. Accepted brand and category code, or a clear "not verified" state. There is no Category collection.
3. Relationships with predicate, market/jurisdiction, validity dates, and evidence state.
4. Published claims with exact wording, scope, assessment outcome, and publication status.
5. Evidence and source citations with capture/update dates and access limitations.
6. Organization responses, attributed as positions.
7. Unknowns, conflicting evidence, and limitations.
8. Legal/campaign modules only when a reviewed module exists. Never infer them from a barcode or graph.

A scan result must support `NOT_FOUND`, `AMBIGUOUS`, `DISPUTED`, and `UNVERIFIED`. Never force a match.
Status dimensions must remain separate in the UI; do not reduce them to a badge that implies a universal
conclusion.

## Server Actions and Data Access

- Server Actions are the only backend communication path. Do not fetch the backend from client components.
- Keep actions thin: forward a typed request, handle errors, and return `{ success, body }`.
- Read the token from the `httpOnly` cookie server-side and send it as the `token` header.
- Never trust client-supplied roles, ownership, scope, or public flags. The backend derives authorization.
- Use the generated `ReqType`/`DeepPartial` declarations for request and projection types.
- Be explicit with `get` projections; never request everything by default.
- Handle null/error responses before rendering.
- Follow the Lesan action shape used by the backend (`service`, `model`, `act`, `details`). Confirm the
  exact generated client shape during the spike; do not guess it.

## UI Rules

- Server Components by default. Add `"use client"` only for state, effects, browser APIs, or event
  handlers.
- Keep domain logic out of components. Formatting and presentation only.
- Use shadcn/base-ui primitives; do not introduce a second component library.
- Every interactive element needs a visible focus state and an accessible label.
- Loading, empty, error, and partial-data states are required, not optional.
- Research-only data must be visually and structurally separated from public data.
- Never render untrusted HTML. Sanitize any source excerpt or organization response before display.
- Use `next/image` and lazy-load heavy client-only components.

## Environment and Commands

Variables live in `.env.local`:

- `NEXT_PUBLIC_BACKEND_URL` - backend origin, default `http://localhost:1370`
- `NEXT_PUBLIC_APP_URL` - app origin, default `http://localhost:3000`

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm build
```

The backend must be running for real data. Playground: `http://localhost:1370/playground`.

## Before Writing Frontend Code

1. Read the v3.1 spec and the approved plan for the feature.
2. Check the installed Next.js 16 docs for any routing/rendering API you use.
3. Confirm the backend action and generated types exist; do not invent endpoints.
4. Add all copy to every supported locale catalog.
5. Verify RTL/LTR, keyboard navigation, focus, loading/empty/error states, and reduced motion.
6. Run `pnpm typecheck` and `pnpm lint`; do not report success before they pass.
