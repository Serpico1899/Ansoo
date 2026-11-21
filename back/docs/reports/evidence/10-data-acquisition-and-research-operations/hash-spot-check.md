# Hash Spot-Check

**Date:** 2026-11-21
**Manifest:** `provenance-manifest.tsv`
**Sample:** all 28 manifest entries (100%; the plan requires at least 10%)
**Method:** for each row, recompute `sha256sum`, recompute `wc -c`, compare both to the manifest.

## Result

| Check | Result |
|---|---|
| Files hashed | 28 |
| Hash matches | 28 |
| Byte-size matches | 28 |
| Missing files | 0 |
| Mismatches | 0 |
| Secret/credential scan of evidence logs | Pass; environment shows versions only |
| Real source bytes in the repository | None |
| Personal data in the repository | None; brand log uses public brand and company names only, no IDs or contact data |

## Scope note

The manifest covers the code, tests, plans, reports, research policy documents, verification logs,
and this spot-check record. The manifest does not hash itself (a file cannot contain its own hash). There are **zero** captured primary-source research artifacts (gazette PDFs,
Codal filings, receipts), because the pipeline stopped at the missing primary-source path. A 10%
sample of zero artifacts is zero; the check is not omitted, it has nothing to sample. The manifest
check above is the complete check of everything that does exist.

## Reproduce

```bash
cd back
manifest=docs/reports/evidence/10-data-acquisition-and-research-operations/provenance-manifest.tsv
while IFS=$'\t' read -r sha bytes path; do
  [ "$sha" = "sha256" ] && continue
  [ "$(sha256sum "$path" | cut -d' ' -f1)" = "$sha" ] || echo "MISMATCH $path"
  [ "$(wc -c <"$path")" = "$bytes" ] || echo "SIZE MISMATCH $path"
done < "$manifest"
```
