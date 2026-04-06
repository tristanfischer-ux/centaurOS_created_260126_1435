# Investor Page Fix Tracker

## Outstanding Issues (all must be fixed)

### 1. Stats showing 1,000 instead of 7,329
- [ ] Root cause: verify the `.limit(20000)` + cache key v3 is actually working
- [ ] Query Supabase directly to confirm actual count
- [ ] If admin client has its own limit, fix that too
- [ ] Verify deployed output shows correct number

### 2. "For You" tab shows 0 matches
- [ ] Read InvestorMatchView.tsx to understand the flow
- [ ] Identify why it returns 0 (subscription gating? API error?)
- [ ] Fix it so it works for all authenticated users
- [ ] Verify it actually shows matches after fix

### 3. Portfolio count 14,448 vs 92,915
- [ ] Root cause: mapping query only found 846 listings
- [ ] Run full investor push first, THEN portfolio push with all mappings
- [ ] Verify final count in Supabase matches expectation

### 4. Contact count 45,847 vs 49,212
- [ ] Root cause: push only pushes contacts for quality >= 3 investors
- [ ] Decide: lower threshold or accept gap and document
- [ ] Verify the count

### 5. Key People showing organizations
- [ ] Filter out non-people entries in getInvestorContacts query
- [ ] Add heuristic: exclude names containing "LLP", "Ltd", "Association", "Chamber", etc.
- [ ] Verify with specific example (Golden Seeds investor)

### 6. Overview chart data from stale cache
- [ ] Verify charts use fresh data after cache key change
- [ ] Check sector dedup working (no "FinTech" + "fintech" + "Fintech")
- [ ] Check stage normalization working

### 7. Lessons learned → CLAUDE.md rules
- [ ] Add rule: "Never flag an issue without fixing it"
- [ ] Add rule: "Compilation is not verification — test the deployed feature"
- [ ] Add rule: "When asked for N iterations, do N numbered iterations with findings AND fixes"
