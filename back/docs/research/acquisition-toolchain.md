# Acquisition Toolchain

**Status:** Validated for transport and tool discovery (2026-11-21). Data queries remain capped by
site terms.
**Plan:** 10
**Contract:** `../../../CONSUMER_TRANSPARENCY_DOMAIN_SPEC_v3.1.md` Sections 18.1, 18.5
**Scope:** The ten `iran-mcp` servers named in the plan. This document records versions, install
commands, observed limits, and production fallbacks. It is not a licence to scrape.

## 1. Licence and version ruling

Spec Section 18.1 describes `iran-mcp` as MIT. On 2026-11-17 the upstream author relicensed the
current releases under **PolyForm Noncommercial 1.0.0**. The README states that versions published
before the relicense remain MIT. To keep the toolchain usable without a commercial licence and to
match the spec's MIT statement, this work pins the **last MIT release of each package**.

| Package | Pinned | Released (UTC) | Licence | Wheel SHA-256 |
|---|---:|---|---|---|
| `rasmio-mcp` | 0.2.0 | 2026-11-06T19:42:38Z | MIT | `0474f2ce0c6bd9b1579d9b95922c0332f74b2b97944009bebe59eee7bb9d17fb` |
| `codal-mcp` | 0.2.1 | 2026-11-11T20:10:28Z | MIT | `a3d7b54e1b974549319bb3cd9ac3067cd7f6575fb226c5b755a0c5dd927b6a70` |
| `iran-tax-mcp` | 0.2.0 | 2026-11-06T19:38:24Z | MIT | `873fe7a659aa42cc53ac0396b400689a9a29af73b40f752743b90fc219931fb7` |
| `rrk-mcp` | 0.2.0 | 2026-11-06T19:42:46Z | MIT | `eb9b97e890f44c0ab75a01af459f8ef7fade6bf9126e625b0823219bd474da44` |
| `qavanin-mcp` | 0.2.1 | 2026-11-11T20:10:32Z | MIT | `6b95966edd0e1785921e7393f68792cab8d28cccdb4a396623d74837de9e17c2` |
| `digikala-mcp` | 0.6.1 | 2026-11-11T20:14:25Z | MIT | `5dd8256b7309420b5e551e6c9f97215efff91a2e494f695b6954b1a77c851e46` |
| `torob-mcp` | 0.2.1 | 2026-11-11T20:10:37Z | MIT | `c563d87b3106297b0480ef5575f24779b9eb215e5b74bf2238ce49b40e8820fc` |
| `okala-mcp` | 0.4.0 | 2026-11-06T19:41:26Z | MIT | `6c75ec3e614c18bed520bd67ae8a29b81b845eb463e059a53ba40d75a4020928` |
| `tsetmc-mcp` | 0.2.0 | 2026-11-06T19:44:34Z | MIT | `89746555a29414e575db3e90d5dd9ed7d0b1b19b4f44a036ade35d535232071d` |
| `iran-news-mcp` | 0.3.0 | 2026-11-06T19:38:08Z | MIT | `42f895da594c4bd07493bae6461d6f5eb5521ae53f87762e46a753b9ee5a42dc` |

**Consequence:** Do not upgrade blindly. Current releases (`rasmio-mcp` 0.2.1, `codal-mcp` 0.2.3,
and the matching latest tags) require a commercial licence for company, paid-product, or client use.
A commercial deployment must either keep these MIT pins, obtain a commercial licence, or replace the
server with an official/primary path.

## 2. Reproducible install

The host had no `uv`, `uvx`, `pip`, or `pipx`. `uv` 0.13.9 was downloaded into a temporary
directory, verified against its published SHA-256, and used with an isolated cache. Nothing was
installed into the repository or the user profile.

```bash
TOOLS=/tmp/ansoo-plan10-tools
mkdir -p "$TOOLS"
curl -sSL -o "$TOOLS/uv.tar.gz" \
  https://github.com/astral-sh/uv/releases/download/0.13.9/uv-x86_64-unknown-linux-gnu.tar.gz
echo 'a7fbaff2b9a271d85c1bdb540941090fd1ce011797b4abeb48e4dcd39c2471d5  uv.tar.gz' \
  | sha256sum -c -
tar xzf "$TOOLS/uv.tar.gz" -C "$TOOLS"
export UV_CACHE_DIR="$TOOLS/uv-cache"
```

Run a server as a stdio MCP process:

```bash
"$TOOLS/uv-x86_64-unknown-linux-gnu/uvx" --from 'rasmio-mcp==0.2.0' rasmio-mcp
```

Repeat with each pinned pair in the table. Python 3.10+ is required. No API key or account is used.

## 3. Transport validation

Each server was started, initialized over MCP, and asked for `tools/list`. It was then sent one
small read-only query. Raw responses were not committed; only status and shape are recorded.

| Server | Tools | Read-only probe | Observed result |
|---|---:|---|---|
| `rasmio-mcp` | 8 | `rs_options(what=brand_classes)` | 45 Nice classes returned |
| `codal-mcp` | 5 | `cd_letter_types()` | 11 disclosure categories returned |
| `iran-tax-mcp` | 6 | `tx_activity_codes(query="نرم افزار", limit=1)` | One 1404 activity row returned |
| `rrk-mcp` | 5 | `rk_law_filters(query="دیوان")` | Law groups and approvers returned |
| `qavanin-mcp` | 7 | `qv_lookup(kind=status)` | Seven status values returned |
| `digikala-mcp` | 23 | `dk_suggest(query="هدفون")` | Suggestions and categories returned |
| `torob-mcp` | 26 | `tb_suggest(text="لپ")` | Suggestions returned |
| `okala-mcp` | 16 | `ok_locate(address="میدان ونک", city="تهران")` | Geocoding candidates returned |
| `tsetmc-mcp` | 8 | `ts_indices(limit=1)` | Market snapshot and one index returned |
| `iran-news-mcp` | 6 | `nw_list_sources()` | Ten Persian news sources returned |

All ten initialized and answered the probe. Transport is reproducible; field-level completeness is
not established. A single probe per server is evidence of reachability, not of data quality.

## 4. Terms, caps, and pacing

These are the observed upstream statements. They are operational limits, not suggestions.

| Server | Limit / condition | Required behaviour |
|---|---|---|
| `rasmio-mcp` | Anonymous users get about **5 company profiles per IP every 4 days**. Parent/subsidiary data, full ad archive, risk reports, and the relationship graph are subscriber-only. Search and brand/people lookups continue after the profile cap. | Use search for leads. Never rotate IPs or clear cookies to extend the cap. Buy a subscription for profiles. Cite `rrk.ir`, not Rasmio, as evidence. |
| `codal-mcp` | One request at a time, at least **2 seconds** apart. A burst returns HTTP 429 and a captcha, then blocks the IP for up to an hour. Codal often answers only Iranian IPs. Optional `CODAL_MCP_PROXY`. | Run on Iranian infrastructure or a licensed Iranian proxy. Reuse cached results. Stop on 429. Never solve captchas. |
| `iran-tax-mcp` | First broad goods search takes 15-30 seconds, then caches for an hour. Tax sites often refuse foreign IPs. Optional `IRAN_TAX_MCP_PROXY`. | Use an Iranian exit. Keep broad queries rare. |
| `rrk-mcp` | Read-only laws, regulations, and court rulings. It explicitly does **not** provide company registration notices. Optional `RRK_MCP_PROXY`. | Do not treat it as a gazette-notice search. Use it for legal instruments only. |
| `qavanin-mcp` | Solves the site's cookie challenge. Optional `QAVANIN_MCP_PROXY`. No documented cap. | Keep request rates reasonable; no bulk export. |
| `digikala-mcp` | Unofficial public endpoints; vendor may change or block. | Discovery only. No evidence citation. Keep rates low. |
| `torob-mcp` | One call at a time with ~2 s plus jitter. HTTP 490 bot challenge blocks the IP for an hour or more. Optional `TOROB_MCP_PROXY`. | Discovery only. Never use browser fallback to defeat a challenge in this project. |
| `okala-mcp` | Optional browser extra clears bot checks. Login is optional and unnecessary for catalog reads. | Do not use the browser fallback to bypass a challenge. Discovery only. |
| `tsetmc-mcp` | Some networks receive HTTP 403; rate limits are unknown. Optional `TSETMC_MCP_PROXY`. | Corroboration only. Keep requests reasonable. |
| `iran-news-mcp` | Reply capped around 15-25 KB; reasonable rates requested. Optional `IRAN_NEWS_MCP_PROXY`. | Source discovery only; the article page is the primary artifact. |

## 5. Required production fallback

Every one of these servers is an unofficial scraper of an undocumented endpoint. Each may break
without notice. A production acquisition path must not depend on any single server.

1. **Primary path:** an official API, a licensed registry subscription, or a formal information
   request. Capture the returned document or page, not the server's JSON summary.
2. **Secondary path:** a manual researcher opens the official page in a controlled browser profile,
   saves the PDF/HTML, and records the retrieval time, URL, and SHA-256.
3. **Fallback path:** the scraper may discover a lead or a URL. It may not be the cited artifact.
4. **Failure path:** if a cap, captcha, 401/403/429, or paywall appears, stop. Record the blocker and
   escalate. Do not rotate identities, bypass the gate, or automate a challenge.

## 6. What this validation does not prove

- It does not prove that every tool returns complete or current data.
- It does not prove that a search result is a trademark, an owner, or a current relationship.
- It does not authorise bulk collection, redistribution, or publication of aggregator data.
- It does not substitute for legal review of source terms, database rights, or personal data.

The acquisition-tier policy is in `acquisition-tier-policy.md`.
