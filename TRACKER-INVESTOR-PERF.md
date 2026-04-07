# Investor Filtering Performance + Intelligence Enrichment — Tracker

**Created:** 2026-04-07
**Request:** Fix slow investor filtering (minutes instead of seconds) + add social media / news intelligence enrichment

---

## Phase 1: Fix Critical Investor Filtering Performance

### Root Causes Identified
1. **No index on `marketplace_listings.category`** — every query does a full table scan (80K+ rows)
2. **JSONB sort over-fetches 2000 rows** — fetches all matching rows to sort by quality/fund_size, even if showing only 24
3. **Semantic search re-fetches full rows then filters client-side** — RPC returns minimal columns, then code re-fetches 200 rows and filters in JS
4. **Missing composite indexes** — no (category, data_quality_score) or similar for common queries

### Fixes Planned
- [ ] Migration: Add `category` index + composite indexes on marketplace_listings
- [ ] Migration: Create `search_investors_sorted` RPC that handles JSONB sorting at DB level
- [ ] Migration: Update `match_marketplace_listings` to accept category filter and return attributes
- [ ] Update `investors.ts` keyword path to use DB-level sorting RPC
- [ ] Update `investors.ts` semantic path to push filters to DB query
- [ ] Verify filter by min quality 7 doesn't over-fetch

---

## Phase 2: Red Team #1

- [ ] Review all query paths for edge cases
- [ ] Check for SQL injection / filter injection
- [ ] Check type coercion, pagination, race conditions
- [ ] Fix all findings

---

## Phase 3: Social Media / News Intelligence

- [ ] Design intel enrichment approach
- [ ] Migration: `investor_intelligence` table
- [ ] Server action + API route for intelligence
- [ ] UI: Intel Preview column + detail dialog enrichment

---

## Phases 4-5: Red Teams #2 and #3

- [ ] Full system review
- [ ] Final security + performance audit
