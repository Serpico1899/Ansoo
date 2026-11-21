# Toolchain Validation Evidence

**Date:** 2026-11-21
**Host:** `uname -srm` recorded in `environment.log`
**uv:** 0.13.9, downloaded from the official GitHub release and verified against
`a7fbaff2b9a271d85c1bdb540941090fd1ce011797b4abeb48e4dcd39c2471d5`
**Cache:** `/tmp/ansoo-plan10-tools/uv-cache` (not in git, not in the user profile)
**Network:** direct; no proxy used
**Data:** one small read-only probe per server. Raw responses were not stored.

## MCP initialize and tools/list

| Server | Version | Server info | Tools | Init |
|---|---|---:|---:|---|
| `rasmio-mcp` | 0.2.0 | Rasmio Company Registry | 8 | OK |
| `codal-mcp` | 0.2.1 | Codal (کدال) Disclosures | 5 | OK |
| `iran-tax-mcp` | 0.2.0 | Iran Tax | 6 | OK |
| `rrk-mcp` | 0.2.0 | Official Gazette of Iran | 5 | OK |
| `qavanin-mcp` | 0.2.1 | Qavanin | 7 | OK |
| `digikala-mcp` | 0.6.1 | Digikala | 23 | OK |
| `torob-mcp` | 0.2.1 | Torob | 26 | OK |
| `okala-mcp` | 0.4.0 | Okala | 16 | OK |
| `tsetmc-mcp` | 0.2.0 | TSETMC Tehran Stock Exchange | 8 | OK |
| `iran-news-mcp` | 0.3.0 | Iran News RSS | 6 | OK |

## Read-only probes

| Server | Probe | Observed shape | Result | Latency |
|---|---|---|---|---:|
| `rasmio-mcp` | `rs_options(what=brand_classes)` | 45 Nice classes | OK | 2.0 s |
| `codal-mcp` | `cd_letter_types()` | 11 disclosure categories | OK | 1.8 s |
| `iran-tax-mcp` | `tx_activity_codes(query="نرم افزار", limit=1)` | One 1404 activity row | OK | 3.3 s |
| `rrk-mcp` | `rk_law_filters(query="دیوان")` | Groups and approvers | OK | 6.6 s |
| `qavanin-mcp` | `qv_lookup(kind=status)` | 7 status values | OK | 1.3 s |
| `digikala-mcp` | `dk_suggest(query="هدفون")` | Suggestions and categories | OK | 1.6 s |
| `torob-mcp` | `tb_suggest(text="لپ")` | 8 suggestions | OK | 1.5 s |
| `okala-mcp` | `ok_locate(address="میدان ونک", city="تهران")` | Geocoding candidates | OK | 2.6 s |
| `tsetmc-mcp` | `ts_indices(limit=1)` | Market snapshot and one index | OK | 1.7 s |
| `iran-news-mcp` | `nw_list_sources()` | 10 sources | OK | 1.3 s |

## Failure modes

No transport failure occurred. The following operational failures are known from upstream
documentation and were not induced:

- Rasmio anonymous company-profile cap (about 5 per IP every 4 days).
- Codal HTTP 429 and up-to-one-hour IP block after a burst.
- Codal and tax sites often refusing foreign IPs.
- Torob HTTP 490 bot challenge and one-hour block.
- Rasmio full ad archive, parent/subsidiary data, and relationship graph requiring a subscription.
- `rrk-mcp` not covering company registration notices.

## Boundary

This evidence proves the packages install, initialize, list tools, and answer one read-only probe.
It does not prove field completeness, currentness, or permission to collect at scale.
