# Agent Prompt - Execute Plan 09 (Public Profile, Read Model, and Vertical Slice)

Read `README.md` here, then `../plans/09-public-profile-read-model-and-vertical-slice.md`, spec Sections
12, 14, 20 (S19/S24/S30), and plans 04-08.

## Mission

Deliver the public product profile: honest resolution, separated identity/findings/evidence/unknowns, the
rebuildable `product_public_profiles` read model, and the synchronous retraction path.

## Sequence

1. **Contract:** implement Section 14.2 types exactly; product/brand/finding/evidence/response/correction
   notice/unknowns; `noUniversalScore: true`; no score/verdict field.
2. **Inheritance:** Product direct; Brand inherited with visible scope + `inheritedFrom`; Organization only
   through a published edge; max 2 hops; deduplicate by finding id.
3. **Profile action:** identifier or id -> resolution + profile; preserve all resolution states; `NOT_FOUND`
   useful; `AMBIGUOUS` candidates; merged redirect; retracted absent/marked; p95 < 400 ms.
4. **Read model:** `product_public_profiles` keyed by productId; payload + `sourceVersions`; rebuild on
   publication/evidence/merge/brand-relation/retraction; outbox/repair; full rebuild command; S30
   byte-identical.
5. **Retraction:** synchronous canonical -> read model -> cache/CDN -> search index; idempotent; audited;
   p95 < 60 s; survive rebuild.
6. **Unknowns/limitations:** explicit codes/messages; never unknown -> false or unsupported -> negative.
7. **S19:** seed/load representative data; scan GTIN; test leading zero, ambiguous, not-found, disputed,
   brand inheritance, 2-hop org finding, no internal fields; measure and record environment.
8. **Tests/report:** S19, S24, S30, I02/I04/I11/I12; write
   `../reports/09-public-profile-read-model-and-vertical-slice.md`.

## Do Not

- Do not collapse findings into a score or verdict.
- Do not traverse multi-hop ownership.
- Do not return retracted findings as published.
- Do not let a stale read model survive a retraction.
- Do not claim p95 without measuring on representative data.

## Evidence Required

- S19 end-to-end transcript or test.
- p95 latency with hardware/versions/payload.
- S24 per-surface retraction timing.
- S30 byte-identical rebuild comparison.
- Inheritance and unknown tests.
- Verification logs.

## Stop Conditions

Stop if public wording or inheritance policy is undefined, if the read model cannot be rebuilt
deterministically, or if retraction cannot reach every public surface.
