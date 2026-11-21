# Scanner-as-Catalog-Factory: Contribution Flow

**Status:** Draft specification (2026-11-21). Not implemented.
**Plan:** 10, task 5
**Contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` Sections 18.6, 5.1, 10.1, 12
**Invariants:** I02 (`UNKNOWN != FALSE`), I12 (no universal verdict), barcode inference is forbidden.

## 1. Principle

`NOT_FOUND` is not an error. It is the moment a person can contribute the first document for a
product. The answer must be honest:

> We don't know this barcode yet. If you send a photo of the package, it becomes this product's first
> document. A person will review it. We will not guess the owner, origin, or legal status from the
> barcode.

The contribution is a **catalog candidate**, not a published finding.

## 2. Resolve and branch

1. Normalize the scanned value to a GTIN (8, 12, 13, or 14 digits). Reject check-digit failures and
   non-GTIN values with a clear message.
2. Look up the identifier in `products`.
3. If found and published, return the profile.
4. If found but not published, return an honest "under review" state. Do not expose drafts.
5. If not found, return `NOT_FOUND` with a contribution action. Never return a guessed product,
   owner, country of origin, or ethical/legal status.

## 3. Contribution capture

Required:

- A photo of the package front, including the brand as printed.
- A photo of the barcode area, so the GTIN is visible.
- The typed brand name as it appears on the package.
- The locale of the package (`fa`, `ar`, `en`, or other) if the user can tell.

Optional:

- A receipt or store context. If provided, redact payment data before storage.
- A photo of the ingredient or origin label, if the user wants to help.

Client and server rules:

- Upload bytes to object storage through the asset path. Never base64 in MongoDB.
- Enforce size, MIME, and extension allowlists; inspect bytes, not just headers.
- Quarantine until scanning and validation complete. Strip or review EXIF and personal data.
- Keep the asset private. Serve only short-lived authorized URLs to moderators.
- Record the upload as an `ASSET_UPLOADED` audit event. Do not put image bytes or object keys in the
  audit summary.
- Treat every contributed image as untrusted input.

## 4. Provisional records

A contribution may create a provisional catalog candidate using existing collections only:

- `products`: one record with the normalized GTIN, `lifecycle: INACTIVE`, `brandMapping.status:
  UNREVIEWED`, and the package snapshot in the identifier's `sourceSnapshotIds`.
- `assets` / `source_snapshots`: the package and barcode photos with hashes, retrieval time,
  capture method `UPLOAD`, and tier `E_RESEARCH_OR_COMMUNITY`.
- `audit_events`: `ENTITY_CREATED` with a `CONTRIBUTION` reason and a correlation id for the review
  batch. Do not add a new audit action.

There is no contribution/submission collection among the eleven canonical collections. Do not invent
one. If a durable queue is required, it is a technical read-model or an external queue outside the
canonical schema, and it needs an ADR.

## 5. Evidence rule and the gap

A contributed photo is a user-originated primary capture, but the current five acquisition tiers
have no distinct class for it. Under the enforced rule it is `E_RESEARCH_OR_COMMUNITY`, which is
**lead-only** and cannot enter `evidence[]` or pass the publication gate.

Therefore:

- A contributed photo can create a provisional Product and identify a brand candidate.
- It cannot by itself support a published `MANUFACTURES`, `OWNS`, `CONTROLS`, `DISTRIBUTES`, or
  `IMPORTS_TO_MARKET` finding.
- A moderator may use it to open a research task. Publication still needs a primary official artifact
  or a spec-approved provenance class for moderated user captures.

This is a deliberate stop, not a workaround. Do not relabel a user photo as Tier B or A to make it
publishable. The spec owners must decide whether a moderated user capture becomes a new evidence
class; until then, the scanner is a catalog and research-lead factory, not a publication shortcut.

## 6. Moderation and evidence requirements

| Stage | Requirement | Who |
|---|---|---|
| Intake | GTIN valid, two images present, no malware, MIME and size valid | Automated |
| Triage | Brand text matches package; no duplicate GTIN conflict | Contributor/Moderator |
| Identity | Brand candidate exists or is created with a public label | Researcher |
| Product | Name, net content, package type, variant recorded from the package | Researcher |
| Publication | A primary artifact outside the user upload, or a spec-approved tier | Reviewer |
| Sensitive assertion | Four-eyes, gate, right of reply, legal review where required | Reviewer/Legal |

Reject or quarantine when: the barcode is unreadable, the images disagree, the brand is not visible,
the product is a restricted item, the upload contains personal data, or the GTIN already belongs to a
different product and the conflict cannot be resolved.

## 7. First category

**Recommendation: dairy** (milk, yogurt, cheese, cream, ice cream). Reasons:

- High turnover and repeated scans.
- Barcode printed on almost every unit.
- Concentrated brand set, so 30 brands cover a large share of shelves.
- Package labels carry brand, net content, and sometimes manufacturer/importer text.
- Some owners are listed companies, so a Codal path may corroborate a finding.

Do not seed real brands until the licensed primary-source path and the contribution evidence rule
exist. Synthetic seed records must be clearly fictional and must not use real brand names or real
GTINs.

## 8. Public answer matrix

| State | Public answer |
|---|---|
| Found and published | Full profile with separated identity, relationships, claims, evidence, publication, unknowns, and limitations. |
| Found, under review | "We have a candidate for this barcode but it is not published yet." No draft details. |
| Not found | "We don't know this barcode yet. Your photo can become its first document." |
| Invalid barcode | "That does not look like a valid GTIN. Check the digits or send a photo." |
| Contribution received | "Thank you. A person will review it. This is not a published finding." |
