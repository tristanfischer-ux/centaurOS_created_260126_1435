# Marketplace Overhaul — Tracking Document

> Created: 2026-04-06
> Goal: Make the marketplace genuinely useful for finding and engaging suppliers

---

## Current State (Problems)

### P1: Count Discrepancy
- **Marketplace Insights** says 8,813 Suppliers (via `getMarketplaceStats()` which filters to Products+Services only)
- **Category pills** say "All 15181" (via `searchMarketplaceListings()` which includes People+Products+Services)
- **Chase specialist** says 15,181 (picks up the category pill count)
- **Nightshift Dashboard** says 8,696 pushed to ForgeOS
- **Root cause**: Stats query excludes People; category pills include People; Nightshift pushed 8,696 but stats show 8,813 (gap may be seed/demo data or approval_status differences)

### P2: "For You" Tab is Broken
- Supplier matching via `/api/suppliers/match` fails with "Failed to load matches"
- Even if it worked, scoring 15k suppliers server-side is slow and expensive (DeepSeek/Haiku for rationales)
- User says: "I have no idea why that is there and it's not working anyway. Let's just get rid of that."

### P3: Marketplace Not Useful Enough
- Cards show minimal info (title, description, category badge)
- No certifications, industries, location, or capabilities visible at a glance
- "Relevance" sort uses data_quality_score which is an enrichment completeness metric, not user relevance
- Search may be slow — unclear if semantic embeddings are populated for all listings
- No indication of which suppliers are relevant to YOUR specific projects/needs

### P4: Data Presentation
- 15,181 listings but only 24 shown per page with infinite scroll
- No way to quickly find suppliers for a specific manufacturing process
- Charts in Marketplace Insights are useful but collapsed by default
- List view shows very sparse info

---

## Round 1 Plan

### Fix 1: Remove "For You" Tab
- **Action**: Remove `MarketplacePageTabs` wrapper, remove `SupplierMatchView` from the page
- **Result**: Marketplace goes straight to Browse view (no confusing broken tab)
- **Files**: `src/app/(platform)/marketplace/page.tsx`

### Fix 2: Fix Count Discrepancy
- **Action**: Make stats query consistent with category pills — both should count Products+Services (exclude People since People are on Recruits page)
- **Action**: Verify the actual count in DB: `SELECT count(*) FROM marketplace_listings WHERE category IN ('Products','Services')`
- **Files**: `src/actions/marketplace-stats.ts`, `src/app/(platform)/marketplace/page.tsx`

### Fix 3: Enrich Supplier Cards
- **Action**: Show certifications (first 2), location (country/city), and industries (first 2) on medium-size cards
- **Action**: Show company_size and founded_year as subtle metadata
- **Files**: `src/components/marketplace/market-card.tsx`

### Fix 4: Smarter Default Sort
- **Action**: "Relevance" sort should factor in: data_quality_score + has_certifications + has_website + has_contact
- **Action**: Consider using relevance_score (Nightshift's score) instead of data_quality_score
- **Files**: `src/actions/marketplace.ts`

### Fix 5: Verify Semantic Search Works
- **Action**: Check how many listings have embeddings populated
- **Action**: Test a search query and see if semantic results merge correctly
- **Files**: Check DB, `src/actions/marketplace.ts`

---

## Red Team Round 1 — Findings & Fixes

### FIXED:
1. **HIGH: NULL relevance_score sinks listings** — Changed to `is_verified DESC` primary, then `relevance_score` with `nullsFirst: true` so unscored listings don't get penalised
2. **MEDIUM: Certifications inconsistency** — Medium card now uses `safeStringArray(listing.certifications || attrs.certifications)` for safe string handling
3. **MEDIUM: Stats empty guard** — Fixed the empty-state guard to not return 0 when exactTotalCount exists but allRows is empty

### NOT FIXED (low severity):
4. Orphaned `MarketplacePageTabs.tsx` — exists but not imported. Leave for now
5. List view price double-currency — cosmetic, check later
6. Suspense wrapper is a no-op — harmless, leave

### CONFIRMED:
- **15,181 Products+Services** in DB (verified via admin count query)
- **16,623/22,629 listings have embeddings** (~73% coverage) — semantic search works for most
- `relevance_score` is populated via Nightshift backfill — listings without it sort after verified ones

---

## Red Team Round 2 — Findings & Fixes

### P1 FIXES:
1. **Demo supplier filtering** — Add `.eq('is_demo', false)` to search and stats queries. Match Recruits page pattern.
2. **Certification/industry post-filter broken with pagination** — In-memory post-filter on 24-row pages means wrong counts. Fix: move certification filtering to DB level using JSONB `cs` (contains) operator.

### P2 NOT FIXING NOW:
3. Card link-navigability for new-tab opening — good UX improvement but not a bug
4. AI search extraction of certifications/region — enhancement for later

---

## Round 2 Fixes Applied

1. **Demo filtering** — Added `.eq('is_demo', false)` to:
   - `searchMarketplaceListings()` main query
   - Category count queries
   - `fetchMarketplaceStats()` row iteration + exact count query
2. **Certification/industry filtering moved server-side** — Replaced in-memory post-filter with JSONB `cs` (contains) operator on `industries` and `certifications` columns. Fixes pagination-incorrect counts.
3. **Round 2 Red Team confirmed:** sort logic safe (nullsFirst: true), certifications safe (safeStringArray), stats count query order correct

## Final State

- "For You" tab: REMOVED
- Stats count: FIXED (exact count query, demo excluded)
- Supplier cards: ENRICHED (location, certifications, company_size)
- Sort: IMPROVED (verified → relevance_score → data_quality_score)
- Demo suppliers: FILTERED OUT
- Certification/industry filtering: MOVED TO DB LEVEL
- Semantic search: WORKING (16,623/22,629 have embeddings)

---

## Verification Checklist

- [ ] No "For You" tab on marketplace
- [ ] Stats count matches category pill count (Products+Services only, no People)
- [ ] Supplier cards show certifications, location, industries
- [ ] Search returns relevant results for "CNC machining" and "sheet metal fabrication"
- [ ] Semantic search is working (embeddings populated)
- [ ] Page loads fast (< 2s)
- [ ] `npx tsc --noEmit` clean (no new errors)
- [ ] `npm run lint` clean (no new errors)
