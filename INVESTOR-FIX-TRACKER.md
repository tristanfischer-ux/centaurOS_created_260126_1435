# Investor Page Fix Tracker

## Issue Status

### 1. Stats showing 1,000 instead of 7,329
- [x] Root cause: PostgREST max_rows=1000 caps ANY request regardless of .limit()
- [x] Fix: paginated fetch with .range() in getInvestorStats
- [x] Cache key bumped to v4-paginated
- [x] Header counts now use direct count queries (not cached stats)
- [ ] VERIFY: check deployed page shows 7,329

### 2. "For You" tab shows 0 matches
- [x] Root cause: InvestorMatchView was not being rendered (replaced by forYouContent)
- [x] Fix: forYouContent now includes BOTH search hero AND InvestorMatchView
- [ ] VERIFY: InvestorMatchView fires SSE call and shows results

### 3. Portfolio count 14,448 vs 92,915
- [x] Root cause: mapping query hit 1000-row limit (found 846 of 7,084 listings)
- [x] Fix: paginated mapping in push script
- [x] Full push running now (investors + portfolio with correct mapping)
- [ ] VERIFY: check Supabase count after push completes

### 4. Contact count 45,847 vs 49,212
- [x] Root cause: push only pushes contacts for quality >= 3 investors
- [x] Decision: gap is by design (quality gate) — documented

### 5. Key People showing organizations
- [x] Fix: regex filter in getInvestorContacts excluding LLP, Ltd, Association, etc.
- [ ] VERIFY: check specific investor detail modal

### 6. Chart data quality
- [x] Stage normalization: pre-seed→Pre-Seed, series-a→Series A, etc.
- [x] Sector dedup: fintech/FinTech/Fintech→FinTech
- [ ] VERIFY: check deployed charts show clean labels

### 7. Lessons learned
- [x] 5 rules added to tasks/lessons.md
- [x] CLAUDE.md updated with "Do What Was Asked" section

## Pending: Full push completion
The push script is running. After it completes:
- Verify portfolio count via Supabase REST API
- Should be ~85K+ (89,370 total minus ~5K for unmapped investors)
