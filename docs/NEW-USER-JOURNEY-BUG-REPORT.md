# ForgeOS New User Journey — Bug Report

**Tester:** Automated (Claude, acting as Alex Chen — hardware startup founder)
**Date:** 30 March 2026
**Browser:** Chrome desktop via Chrome MCP
**User:** Tristan Fischer (a929f669-6638-4118-9854-2a573faec9e1), foundry: forge-guild
**Environment:** Production (fractionalforge.app)

---

## Summary

Executed the 5-day NEW-USER-JOURNEY-TEST-PLAN.md across all major pages and features. Out of ~35 test steps, 28 passed fully, 4 passed partially, and 3 were blocked by the same root-cause bug (BUG-004). Six distinct bugs were found, two of which are blockers.

| ID | Severity | Title | Status |
|--------|----------|-------|--------|
| BUG-001 | Medium | time_entries RLS prevents logging time | Open |
| BUG-002 | High | tasks INSERT RLS violation for forge-guild users | Fixed |
| BUG-003 | **Blocker** | notify_agent_sweep trigger uses invalid 'Done' enum | Fix created, not applied |
| BUG-004 | **Blocker** | "Unable to verify usage limits" blocks all AI features | Open |
| BUG-005 | Medium | "For You" tabs show "Company not found" for forge-guild users | Open |
| BUG-006 | Low | Product economics "Sync to Cash Burn" fails | Open |

---

## BUG-001: time_entries RLS prevents logging time

- **Step:** D1-S1.5 (Time page)
- **Expected:** User can log time entries
- **Actual:** RLS policy blocks INSERT on time_entries because the user lacks a foundry_membership row that satisfies the policy
- **Root cause:** User is in forge-guild (shared foundry) but foundry_memberships-based RLS requires a matching membership row. The membership was missing or the policy was too restrictive.
- **Impact:** Time tracking unusable for forge-guild users
- **Console errors:** RLS violation on time_entries INSERT

---

## BUG-002: tasks INSERT RLS violation for forge-guild users (FIXED)

- **Step:** D1-S2.5 (Create tasks)
- **Expected:** User can create tasks under their objectives
- **Actual:** "new row violates row-level security policy for table tasks" error
- **Root cause:** Missing foundry_membership for the user in forge-guild. The tasks INSERT RLS policy requires the user's foundry_id to appear in foundry_memberships.
- **Fix applied:** Added foundry_membership via Supabase service_role API:
  ```
  POST /rest/v1/foundry_memberships
  { user_id, foundry_id: "forge-guild", role: "Founder", is_primary: true }
  ```
- **Status:** Fixed. All 5 tasks created successfully after fix.

---

## BUG-003: notify_agent_sweep trigger uses invalid 'Done' enum (BLOCKER)

- **Step:** D1-S2.5 (Mark task complete)
- **Expected:** Marking a task as "Completed" succeeds
- **Actual:** "invalid input value for enum task_status: 'Done'" error on ANY task UPDATE that touches status or end_date columns
- **Root cause:** The `notify_agent_sweep()` trigger function (migration `20260213400001_agent_sweep_triggers.sql`, lines 74-75) references `'Done'` which is not a valid `task_status` enum value. The correct value is `'Completed'`. This trigger fires on `AFTER UPDATE OF end_date, status ON public.tasks`, meaning it blocks ALL task updates — not just completion.
- **Fix created:** Migration file `supabase/migrations/20260330100000_fix_agent_sweep_done_enum.sql` which:
  1. Replaces `'Done'` with `'Completed'` in notify_agent_sweep
  2. Adds UPDATE RLS policy for tasks using foundry_memberships
- **Status:** Fix created but NOT applied to production. Requires `supabase db push` or direct SQL execution.
- **Impact:** Blocks all task status changes and any update to task end_date. This is a critical blocker for the entire task management workflow.

---

## BUG-004: "Unable to verify usage limits" blocks all AI features (BLOCKER)

- **Steps:** D1-S2.6 (Reports), D3-S1.3 (Market Assessment), D3-Economics (Score Fundability would also be blocked)
- **Expected:** AI-powered features (report generation, market assessment, fundability scoring) work
- **Actual:** Toast error: "Unable to verify usage limits. Please try again shortly." — blocks ALL AI generation features
- **Root cause:** The usage limits verification endpoint is failing. This appears to be a backend/billing issue rather than a frontend bug. Possibly the user's plan (Explorer — Free, 0/50) has a verification endpoint that is unreachable or returns an error.
- **Impact:** Blocks report generation, market assessment, fundability scoring, and likely other AI specialist features. This is the most impactful blocker as it prevents users from experiencing ForgeOS's core AI value proposition.
- **Affected pages:** /plan (Reports tab), /products/[id] (Market tab, Fundability tab), potentially any AI generation feature

---

## BUG-005: "For You" tabs show "Company not found" for forge-guild users

- **Steps:** D2-S2.1 (Investors "For You"), D5-Marketplace (Recruits "For You")
- **Expected:** "For You" matching shows personalized investor/recruit recommendations
- **Actual:** Toast: "Company not found" + "Failed to load matches" error with Retry button
- **Root cause:** The "For You" matching algorithm requires a company profile (foundry with company data like industry, stage, etc.). Users in the shared `forge-guild` foundry don't have this data because forge-guild is a shared workspace, not a company-specific foundry.
- **Workaround:** The "Browse All" tab works correctly (tested with 1,235 investor firms on Investors page)
- **Impact:** Medium — users can still browse all investors/recruits but lose personalized matching. This primarily affects users who signed up without creating their own foundry (executives, apprentices who fall into forge-guild).
- **Recommendation:** Either (a) gracefully degrade the "For You" tab to show a message like "Complete your company profile to get personalized matches" with a link to settings, or (b) ensure all new users get their own sandbox foundry (the setup-new-user.ts code already does this for new signups, but existing forge-guild users are affected).

---

## BUG-006: Product economics "Sync to Cash Burn" fails

- **Step:** D3-Economics (Save & Sync to Cash Burn)
- **Expected:** Saving unit price and target volume syncs the revenue projection to Cash Burn module
- **Actual:** Toast: "Saved pricing, but sync failed: Failed to sync financial items"
- **Root cause:** The pricing data saved correctly to the product (volume sensitivity table populated), but the cross-module sync to cash_in_items failed. Likely an RLS issue on cash_in_items or a missing foundry_id in the sync payload.
- **Impact:** Low — product economics data is saved and displayed correctly. The sync to Cash Burn is a convenience feature; users can manually add revenue items in Cash In.

---

## Test Results Summary

### Day 1: Arrival — Setting Up Your Foundry

| Step | Description | Result |
|------|-------------|--------|
| D1-S1.1 | Login & Today page | PASS |
| D1-S1.2 | Today page exploration | PASS |
| D1-S1.3 | My Profile | PASS |
| D1-S1.4 | Comms page | PASS |
| D1-S1.5 | Time tracking | PARTIAL (BUG-001) |
| D1-S1.6 | Google Apps | PASS |
| D1-S2.1 | Business plan upload | PASS |
| D1-S2.2 | Company purpose | PASS |
| D1-S2.3 | Knowledge notes | PASS |
| D1-S2.4 | Objectives (3 created) | PASS |
| D1-S2.5 | Tasks (5 created) | PARTIAL (BUG-002 fixed, BUG-003 blocks completion) |
| D1-S2.6 | Reports page | BLOCKED (BUG-004) |
| D1-S2.7 | Red Team Debate | PASS |

### Day 2: Money — Cash Burn, Investors, Fundraise

| Step | Description | Result |
|------|-------------|--------|
| D2-S1.1 | Cash Burn overview, opening balance | PASS |
| D2-S1.2 | Cash Out (7 cost items) | PASS |
| D2-S1.3 | Cash In (3 revenue items) | PASS |
| D2-S1.4 | Cash Burn runway (45 weeks) | PASS |
| D2-S1.5 | P&L (3 tabs, waterfall chart) | PASS |
| D2-S2.1 | Investors (Browse All + shortlist) | PARTIAL (BUG-005 on For You) |
| D2-S2.2 | Fundraise Dashboard | PASS |
| D2-S3.1 | Today page review | PASS |

### Day 3: Product — Circular Optimization Loop

| Step | Description | Result |
|------|-------------|--------|
| D3-S1.1 | The Forge (CAD Lab) | PARTIAL (Max typing indicator stuck >25s) |
| D3-S1.2 | Products page (1 demo product) | PASS |
| D3-S1.3 | Product detail — Overview tab | PASS |
| D3-S1.4 | Product detail — Market tab | BLOCKED (BUG-004) |
| D3-S1.5 | Product detail — Economics tab | PARTIAL (BUG-006 sync fail) |
| D3-S1.6 | Product detail — Fundability tab | PASS (UI loads, scoring untested) |

### Day 4: Engineering — Team & Specialists

| Step | Description | Result |
|------|-------------|--------|
| D4-S1.1 | Team page (Orbit view) | PASS |
| D4-S1.2 | Specialists (AI Team huddles) | PASS |
| D4-S1.3 | Outputs (Deliverables) | PASS |
| D4-S1.4 | Browse (Co-browsing) | PASS |

### Day 5: Polish — Inspiration & Marketplace

| Step | Description | Result |
|------|-------------|--------|
| D5-S1.1 | Inspiration (78 techniques) | PASS |
| D5-S1.2 | Marketplace — Recruits | PARTIAL (BUG-005 on For You) |

---

## Recommendations

1. **Apply BUG-003 fix immediately** — the migration file exists at `supabase/migrations/20260330100000_fix_agent_sweep_done_enum.sql`. Run `supabase db push` or execute the SQL directly against production. This unblocks all task management.

2. **Investigate BUG-004 urgently** — the usage limits verification is blocking ALL AI features. This is the core value proposition of ForgeOS. Check the billing/subscription endpoint and ensure the Explorer Free tier allows basic AI operations.

3. **Ensure new users get sandbox foundries** — the `setup-new-user.ts` code already creates personal sandbox foundries for executives/apprentices. Verify this works for all signup paths. Existing forge-guild users may need a migration to move them into personal sandboxes.

4. **Add graceful degradation for "For You" tabs** — when company profile data is missing, show a helpful message instead of an error.

5. **Fix Cash Burn sync** — investigate why the product economics → cash_in_items sync fails. Likely an RLS or payload issue.
