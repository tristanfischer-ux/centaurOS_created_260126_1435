# Searching the raw scraped pages — proposal (v2, revised)

> Tristan, 2026-04-28: *"What is the best solution in terms of the user being able to find the needle in the haystack?"*
>
> Revised 17:30 BST after confirming no raw page data survives for investors today.

## TL;DR

The best architecture for needle-in-haystack search is **hybrid retrieval with rank fusion + LLM re-rank**. Pick-one-of-three (FTS or vectors or both as parallel signals) is wrong — for the needle case you want **all three retrieval signals plus a final LLM pass on the top-50 candidates**.

## What's a needle, and what catches each kind

| Needle type | Example | Caught by |
|---|---|---|
| Exact string | "ISO 13485", "G99 EREC", postcode, model number | Postgres FTS only — embeddings blur exact strings |
| Semantic equivalent | "battery" → "lithium-ion energy storage" | Vector embeddings — FTS misses synonyms |
| Conceptual narrative | "founder previously sold a co. to Cisco" | Per-page embeddings — likely on /about, gets lost in firm-level summary |
| Multi-condition | "ISO 14001 AND >50 employees AND UK" | Structured filters layered on top of retrieval |
| Distinguishing nuance | "battery cell *manufacturer*, not distributor" | LLM re-rank on top candidates |

A single retrieval method systematically misses one class. The whole-stack approach catches the union.

## Architecture — recommended (the hybrid stack)

```
User query
  ├─ Postgres FTS over raw page text   →  ranked list A   (exact strings, boolean)
  ├─ Vector cosine over per-page       →  ranked list B   (granular semantic match)
  ├─ Vector cosine over per-listing    →  ranked list C   (whole-firm fit, what we have today)
  └─ Structured filters                →  hard filter set D
                                              ↓
                              Reciprocal Rank Fusion (RRF)
                                              ↓
                              Top 50 candidates (intersect with D)
                                              ↓
                              LLM re-rank with the user's exact query
                                              ↓
                              Final top 10 with match-reason snippets
```

**RRF** is the load-bearing piece. Formula: `score = Σ(1 / (k + rank_in_each_list))`. Rows that rank well in *multiple* signals win. A row that's 7th by FTS and 3rd by vector beats a row that's 1st by FTS but invisible to vector. This catches needles whose evidence is split across modalities.

**LLM re-rank** turns "top 50 plausibly relevant" into "top 10 actually relevant" and surfaces *why* — gold for the user. V4-Flash or Gemini Flash Lite cost ~$0.0003 per re-rank pass.

## Confirmed state of the raw page data — 2026-04-28 audit

### Supplier side (Nightshift)

| | Status |
|---|---|
| Raw page HTML + visible text + image / PDF metadata stored | ✓ in `company_raw_pages` table in `~/Library/Application Support/com.tauri.dev/nightshift.db` |
| BFS crawl per supplier domain, up to 50 pages, ≤2 MB each | ✓ |
| Visible to ForgeOS today | **✗** — only LLM-extracted structured fields are pushed via `35-nightshift-push-updates.py` |
| Engineering required | Push pipeline change + new ForgeOS table + indices |

**Estimated row volume:** ~20K suppliers × ~30 pages average = ~600K page rows.

### Investor side (Forge Capital)

| | Status |
|---|---|
| Raw page text retained anywhere | **✗ — confirmed by 2026-04-28 audit** |
| Brave search snippets retained | ✗ — only the 5 query strings + count + timestamp survive in `sources_json` |
| Investor's own website body retained after scrape | ✗ — fetch → extract → structured fields → discard |
| Engineering required | Add retention to scrape pipeline + RE-SCRAPE all 13K investors before Phase A |

**Estimated row volume after backfill:** ~13K investors × ~10 pages average (own site + portfolio + Brave-result hits if we choose to fetch them) = ~130K page rows.

### Combined target volume

~730K page rows. Storage:
- Page text (compressed): ~3-5 GB
- Per-page vector(1536): ~4.5 GB
- Postgres FTS index: ~1-2 GB
- Total: ~8-12 GB on Supabase

## Phasing (cost-aware)

### Phase 0 — investor re-scrape with retention (PREREQUISITE for investor side)

Add `investor_raw_pages` table mirroring Nightshift's design. Modify `research/17-unified-pipeline.py` (or a sibling) to write the raw HTML + visible text to that table during the scrape. Then re-scrape all 13K investors.

- LLM cost: £0 (httpx + Brave-cached page fetches)
- Brave cost: £0 if we don't re-do search queries; ~£250 one-off if we do
- Engineering: ~10 hours

### Phase A — full-text search (cheap, immediate-value)

Push raw pages from Nightshift + Forge Capital → ForgeOS. Add new tables `marketplace_listing_pages` (suppliers) + reuse same shape for investors. Postgres-native FTS via `tsvector` + GIN index.

Add a new RPC `match_listings_pages_fts(query)` that returns listing IDs whose pages contain query keywords. Wire as a parallel call in `searchSuppliers` / `searchInvestors`.

- LLM cost: £0
- Storage: ~3-5 GB text + indices
- Engineering: ~6 hours
- **Catches needles:** exact strings, postcodes, certifications, model numbers, boolean queries

### Phase B — per-page vector embeddings (semantic match against page-level content)

Embed every retained page (~730K rows) at 1536 dims. Add HNSW index. Add a new RPC `match_listings_pages_v2(query_embedding, ...)` that returns listing IDs ranked by best-page cosine.

- LLM cost: ~$10 one-off + ~$1/month for new content
- Storage: ~4.5 GB vectors
- Engineering: ~12 hours
- **Catches needles:** semantic equivalents, narrative references, page-specific topics that didn't survive the LLM extraction

### Phase C — Reciprocal Rank Fusion + structured filters

Add a SQL function `rrf_merge(query, filters)` that runs FTS + per-page vector + per-listing vector in parallel, RRFs the rankings, applies filters, returns top 50.

- LLM cost: £0
- Engineering: ~8 hours

### Phase D — LLM re-rank on top 50

Add a server action `rerankListings(query, candidates[])` that takes the top 50 + the user's exact query, feeds to V4-Flash or Gemini Flash Lite asking "for each, score 0-100 how closely it matches and give a one-line reason." Replace UI's match-reason text with the LLM's snippet.

- LLM cost: ~$0.0003 per query × ~1,000 queries/month = **~$0.30/month**
- Engineering: ~6 hours
- **Catches needles:** distinguishing nuance, intent vs surface match, multi-clause user queries

## Real total cost — full stack

| Line | Cost |
|---|---|
| Investor re-scrape + retention engineering (Phase 0) | ~10 hours engineering, £0 LLM |
| Per-page embeddings, one-off (Phase B) | ~$10 |
| Storage on Supabase, ongoing | ~$5/month |
| LLM re-rank, ongoing (Phase D) | ~$0.30/month |
| Engineering total (Phases 0 → D) | ~40-45 hours |
| **First-month total** | **~$15** |
| **Steady state** | **~$5-10/month** |

Cheaper than I priced the architectures in v1 of this proposal because RRF is free Postgres SQL and LLM re-rank uses only V4-Flash on top 50.

## What this proposal does NOT do

- Display changes — pages are searchable, not visible. Card UI unchanged.
- Replacing the existing per-listing structured-fields embedding (already shipped today; stays as one of the three retrieval signals).
- Building Architecture 3 from v1 of this proposal (per-page vector for everything-with-no-curation) — superseded by Phase B which embeds the same set but adds RRF + re-rank for quality.
- Migrating Nightshift sync to live in Rust (separately tracked at `nightshift/SUPPLIER-MONTHLY-REFRESH-SPEC.md`).

## Recommended sequencing

1. **Next session:** Phase 0 (investor retention) + Phase A (FTS, both sides). Free, ~16 engineering hours, immediate gain on exact-string needles.
2. **Session after:** Phase B (per-page embeddings, both sides). ~$10 + 12 engineering hours.
3. **Session after that:** Phase C + D (RRF + LLM re-rank). ~$0.30/month + 14 engineering hours. **This is the step that converts good search into "the founder feels they could find anyone."**

Don't run any of this concurrently with the supplier re-embed currently in flight — it needs OpenAI quota headroom first and we just exhausted the budget.

## What you and I should each do

**You:**
- Review this proposal and decide whether to authorise Phase 0 + A as a single chunk for the next session
- Optionally top up OpenAI again before Phase B is started so we don't crash mid-run again
- Decide whether the re-scrape of 13K investors should also re-do Brave searches (£250 one-off) or skip those (~free, just re-fetch the investors' own websites)

**Me, after authorisation:**
- Build a per-phase tracker document at the engine-fixes-wip repo root before starting code
- Implement bottom-up: schema + migration first, retention pipeline next, retrieval RPCs last
- Smoke-test each phase end-to-end with agent-browser against fractionalforge.app before declaring done

---

*Generated by main thread (Opus 4.7), revised 2026-04-28 17:30 BST after audit confirmed no raw page data survives for investors. Proposal only — no code shipped.*
