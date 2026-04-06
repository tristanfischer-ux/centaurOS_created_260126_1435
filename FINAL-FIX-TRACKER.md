# Final Fix Tracker — 7 Remaining Items

## Rules for this session
1. Fix each item completely before moving to the next
2. After each fix: verify via Supabase API query or code trace (not just tsc)
3. Mark done ONLY after verification passes
4. If something fails, investigate root cause before retrying

---

## Item 1: Portfolio Deduplication
- [ ] Change searchPortfolioCompanies to GROUP BY company_name
- [ ] Return unique companies with investor_count
- [ ] Update PortfolioDirectoryTab to show "X investors" badge
- [ ] Tab count shows unique company count (not row count)
- [ ] VERIFY: query returns ~61K unique companies not ~89K rows

## Item 2: Full Portfolio Push (correct mapping)
- [ ] Fix SQL quoting in push script inline runner
- [ ] Run portfolio push with paginated mapping (7,084 listings)
- [ ] VERIFY: curl Supabase count shows ~85K rows

## Item 3: Loading Speed — Supabase RPC
- [ ] Create migration: get_investor_overview_stats() RPC function
- [ ] Replace paginated fetch in getInvestorStats with single RPC call
- [ ] Push migration, regen types
- [ ] VERIFY: stats load in <2s instead of 50s+

## Item 4: Verify 8 Deployed Fixes
- [ ] Contacts tab: trace searchContacts code path with admin client
- [ ] Portfolio count: confirm header and overview show same number
- [ ] Heart on left: read COLUMN_HEADERS order confirms position 0
- [ ] Donut chart legend: read JSX confirms Legend component exists
- [ ] Geographic chart: read region derivation confirms country extraction
- [ ] Stage label: read STAGE_LABELS map confirms pre_seed→Pre-Seed
- [ ] PPTX accept: read accept attr confirms MIME types added
- [ ] Investor inline in portfolio: read JSX confirms no separate column

## Item 5: For You / InvestorMatchView
- [ ] Read InvestorMatchView to understand what triggers 0 matches
- [ ] If it requires subscription: make scoring work without subscription
- [ ] If it requires company profile: check what profile fields are needed
- [ ] VERIFY: trace the code path to confirm it will produce results

## Item 6: Supplier Page Upgrade
- [ ] Read Nightshift dashboard HTML to catalog all sections
- [ ] Compare against ForgeOS marketplace detail dialog
- [ ] Add table view to marketplace (matching investor table pattern)
- [ ] Add missing sections from Nightshift dashboard
- [ ] VERIFY: all Nightshift fields visible in ForgeOS

## Item 7: Key People Org Filter
- [ ] Read the regex filter in getInvestorContacts
- [ ] Test against known problem names ("Angel Capital Association", etc.)
- [ ] VERIFY: query with filter returns only actual people
