# Raw-Pages Phase 0 + Phase A — Tracker

> Per CLAUDE.md tracking-document mandate. Authorised by Tristan 2026-04-28 17:35 BST: "yes do o and a".
>
> Reference: `RAW-PAGES-SEARCH-PROPOSAL-20260428.md` (recommended hybrid stack — FTS + per-page vectors + RRF + LLM re-rank). This tracker covers Phase 0 (investor retention prerequisite) and Phase A (FTS only, both sides). Phase B/C/D are explicitly out of scope.

## Goal

The user can search "ISO 13485 medical injection moulding" against fractionalforge.app and find suppliers + investors whose raw scraped page text contains those terms — even when the structured-fields embedding misses them. **Catches the exact-string class of needles. Free in LLM cost.**

## Success criteria

| # | Criterion | Met? | Evidence |
|---|---|---|---|
| S1 | `investor_raw_pages` table exists in local SQLite | ☐ | |
| S2 | Retention scrape pipeline written + smoke-tested on 5 investors | ☐ | |
| S3 | All 13K investors re-scraped with page retention | ☐ | |
| S4 | `marketplace_listing_pages` table exists in ForgeOS Supabase + indices | ☐ | |
| S5 | Investor pages pushed to ForgeOS | ☐ | |
| S6 | RPC `match_listings_pages_fts` deployed + callable | ☐ | |
| S7 | `searchInvestors` runs FTS in parallel with vector | ☐ | |
| S8 | Browser test: needle query surfaces a match that today's search misses | ☐ | |
| S9 | No regression on existing investor search | ☐ | |
| S10 | Supplier-side Phase A documented as deferred + reasons | ☐ | |
| S11 | Cumulative session cost ≤ £1 (mostly storage) | ☐ | |

## Abort criteria

- Re-scrape rate-limited or banned by >10% of investor websites → STOP, document, surface
- Vercel production build breaks → STOP, fix or revert, do not proceed to next phase
- Any data corruption in marketplace_listings or investors tables → STOP immediately
- Cumulative cost > £2 → STOP, justify before continuing

## Phases

### Phase 0a — investor_raw_pages schema (local SQLite) ☐

**Steps:**
1. Define schema mirroring Nightshift's `company_raw_pages` shape but adapted for local SQLite (no BLOB compression initially — keep it simple).
2. Apply via `sqlite3` against `~/.forge-capital/forge-capital.db`.
3. Verify with `.schema investor_raw_pages` + `.indices investor_raw_pages`.

**Schema:**
```sql
CREATE TABLE investor_raw_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_text TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  scraped_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (investor_id, url)
);
CREATE INDEX idx_irp_investor ON investor_raw_pages(investor_id);
CREATE INDEX idx_irp_scraped_at ON investor_raw_pages(scraped_at);
```

### Phase 0b — retention scrape pipeline ☐

**Steps:**
1. New file `research/55-scrape-investors-retain-pages.py`.
2. Reuses BS4 + httpx pattern from `research/50-monthly-refresh-investors.py`.
3. For each investor: fetch home page, extract internal links within registrable domain, BFS up to 10 pages total per investor. Store visible-text per page.
4. Concurrency: 10 fetches in parallel.
5. Polite throttle: 100ms between fetches per host. 15s timeout.
6. Skip URLs with `last_check_status` already 'dead_website', 'no_website', etc.
7. Smoke-test with `--limit 5`.

**Selection of pages per investor (depth):**
- Home page
- Up to 9 additional pages discovered via internal links
- Filter out paths matching `/privacy /terms /cookies /careers /contact` (low-value boilerplate)
- Prioritise paths matching `/portfolio /team /thesis /about /investments /investor /strategy`

### Phase 0c — re-scrape all investors ☐

**Steps:**
1. Verify the script works on `--limit 50` first.
2. Run unbounded — `nohup python3 research/55-scrape-investors-retain-pages.py > ~/.forge-capital/retention-scrape-2026-04-28.log 2>&1 &`.
3. Estimated wall time: 13K investors × 10 pages × ~500ms / 10-way concurrency ≈ ~1.8 hours.
4. Background watcher to notify when done.
5. Verify `SELECT COUNT(*) FROM investor_raw_pages` ≈ 80-100K rows after run (some investors will have <10 pages, some sites will be dead).

### Phase Aa — marketplace_listing_pages in ForgeOS ☐

**Steps:**
1. Use `mcp__claude_ai_Supabase__apply_migration` to apply the migration.
2. RLS: same shape as `marketplace_listings` (public read, service-role write).

**Schema:**
```sql
CREATE TABLE marketplace_listing_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  url text NOT NULL,
  page_text text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', page_text)) STORED,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, url)
);
CREATE INDEX idx_mlp_listing ON marketplace_listing_pages(listing_id);
CREATE INDEX idx_mlp_search_vector ON marketplace_listing_pages USING gin(search_vector);
```

### Phase Ab — push investor pages to ForgeOS ☐

**Steps:**
1. New file `research/14e-push-investor-pages.py`.
2. Read `investor_raw_pages` from local SQLite.
3. Map `investor_id` (local SQLite int) → `marketplace_listings.id` (ForgeOS uuid) via `attributes->>'forge_capital_id'` or `attributes->>'forge_capital_investor_id'`.
4. Skip pages with `page_text` < 200 chars.
5. Truncate-and-rebuild pattern via a SQL function `truncate_marketplace_listing_pages_for_investors()` (mirror investor_portfolio_companies fix).
6. Bulk insert in batches of 100 via PostgREST.

### Phase Ad — match_listings_pages_fts RPC ☐

**Steps:**
1. Apply migration with the function definition.
2. SECURITY DEFINER, GRANT EXECUTE TO authenticated.
3. Test from `mcp__claude_ai_Supabase__execute_sql` with a known query.

**Function:**
```sql
CREATE OR REPLACE FUNCTION public.match_listings_pages_fts(
  p_query text,
  p_category text DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  listing_id uuid,
  best_rank real,
  page_count int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    mlp.listing_id,
    MAX(ts_rank_cd(mlp.search_vector, websearch_to_tsquery('english', p_query)))::real AS best_rank,
    COUNT(*)::int AS page_count
  FROM marketplace_listing_pages mlp
  JOIN marketplace_listings ml ON ml.id = mlp.listing_id
  WHERE mlp.search_vector @@ websearch_to_tsquery('english', p_query)
    AND (p_category IS NULL OR ml.category = p_category::marketplace_category)
  GROUP BY mlp.listing_id
  ORDER BY best_rank DESC
  LIMIT p_limit;
$$;
```

### Phase Ae — wire FTS into searchInvestors ☐

**Steps:**
1. Edit `src/actions/investors.ts:searchInvestorsCore`.
2. Add a `Promise.all` step alongside the existing v2 vector RPC: also call `match_listings_pages_fts(query, 'Finance', 200)`.
3. Naive merge: union the two ID sets. For listings only in FTS results, fetch their attributes via PostgREST. For listings in both, sum (cosine_score + normalised_ts_rank).
4. Re-rank by combined score, keep existing pillar-bar logic.
5. Document the merge as "naive Phase A" — Phase C replaces with RRF.

(Supplier side `searchSuppliers` deferred — see Phase A verify task #42.)

### Phase A verify ☐

**Steps:**
1. agent-browser navigate /investors.
2. Search a needle query: "ISO 13485 medical device". Pre-fix the structured-fields embedding misses this for most investors (no thesis_summary/sector_focus directly mentions it). Post-fix the FTS path catches investors whose pages mention it.
3. Screenshot. Compare to a baseline.
4. Document supplier-side deferral with concrete reasons in the tracker.

## Cost ledger (running)

| Line | Amount |
|---|---|
| OpenAI embeddings | £0 (Phase A is FTS only, no embeddings) |
| Brave Search API | £0 (Phase 0c re-fetches investor websites only, not Brave queries) |
| Vercel | £0 |
| Storage on Supabase | ~£0.50/month for ~3-5 GB |
| **Cumulative** | **£0 today** |

## Files touched (load-bearing)

To be filled as work proceeds.

## Score card

| Metric | Before | After Phase A | Target |
|---|---|---|---|
| `investor_raw_pages` rows | 0 | TBD | ~80-100K |
| `marketplace_listing_pages` rows | (table doesn't exist) | TBD | matches `investor_raw_pages` minus sub-200-char pages |
| Needle query "ISO 13485 medical": match count | TBD baseline | TBD | ≥1 match where today's search returns 0 |

## Out of scope (deferred to next session)

- Supplier-side Phase A data push. Nightshift's `nightshift.db` is hot under the Tauri app; reading `company_raw_pages` requires read-only snapshot OR the Rust-in-Tauri pipeline. Spec at `nightshift/SUPPLIER-MONTHLY-REFRESH-SPEC.md`.
- Phase B (per-page embeddings).
- Phase C (RRF SQL function).
- Phase D (LLM re-rank).
- Re-doing Brave searches for investors. Phase 0c only re-fetches the investor's own website.

## Lessons learned (filed at session end)

(empty — to be populated)
