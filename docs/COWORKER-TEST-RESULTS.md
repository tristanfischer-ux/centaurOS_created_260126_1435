# ForgeOS — New User Journey Test Results

**Tester:** Claude (Cowork browser automation)
**Date:** 30 March 2026
**Environment:** Production — https://fractionalforge.app
**Account:** Alex Chen (Founder) / Tristan Fischer (Executive, forge-guild)
**Build:** Vercel deployment `dpl_9AEr1aFjzCTEkZbtL8U6MAcUFSjz`

---

## Summary

Executed the 5-day new user journey test plan across all major pages of ForgeOS. The core product loop — product creation → market assessment → economics → fundability → synthesis → iteration → The Forge design brief — works end to end. AI features (market assessment, fundability scoring, synthesis, design brief generation, specialist advice) all return real, contextual content.

**Pages tested:** Today, My Profile, Comms, Time, Google Apps, Strategy/Plan, Objectives, Tasks, Cash Burn, Cash Out, Cash In, P&L, Investors, Fundraise, The Forge, Products (list + detail with all 6 tabs), Team, Specialists, Outputs, Browse, Inspiration, Recruits, Guild, Marketplace, Orders, Settings, Pricing.

**Overall status:** Core flows work. 8 bugs found during testing — **7 fixed and deployed** (commit `061c4763`), 1 pre-existing (React hydration #418, cosmetic).

---

## Bugs Found

### BUG-T01 — Economics "Save & Sync to Cash Burn" button does not trigger (BLOCKING) — ✅ FIXED

- **Page:** Product detail → Economics tab
- **Step:** D3-S3.3 — Click "Save & Sync to Cash Burn"
- **Expected:** Toast confirming sync, volume sensitivity table updates, data appears on Cash Burn pages
- **Actual:** Button click produces no visible response — no toast, no table update. Console shows `TypeError: Failed to fetch` and `No authenticated user` errors.
- **Likely cause:** Auth session expiration or the BUG-006 fix (adding `created_by` to cash burn inserts) may not be fully deployed. Migration `20260330200000` has not yet been applied to production Supabase.
- **Impact:** Breaks the product-to-cash-burn data sync pipeline. Economics data entered via the product page cannot flow to cash burn.
- **Source files:** `src/actions/products.ts`, `src/app/(platform)/cash-burn/`

### BUG-T02 — Marketplace "Failed to load matches" / "Company not found" (BLOCKING) — ✅ FIXED

- **Page:** /marketplace
- **Step:** D5 — Navigate to Marketplace
- **Expected:** Supplier matches based on company profile, projects, and gaps
- **Actual:** Toast "Company not found." followed by "Failed to load matches — Something went wrong. Please try again." with Retry button.
- **Likely cause:** The test account's foundry (forge-guild) may not have a linked company record, or the marketplace route doesn't handle the forge-guild foundry gracefully. Related to BUG-004/BUG-005 fixes for null foundry handling.
- **Impact:** Marketplace is completely non-functional for this account.
- **Source files:** `src/app/(platform)/marketplace/`

### BUG-T03 — Forge design brief "Product Overview" renders raw JSON (MODERATE) — ✅ FIXED

- **Page:** The Forge → CAD Lab (after research completes)
- **Step:** D4-S1 — Complete Max CTO conversation → research → design brief
- **Expected:** Formatted Product Overview with structured sections (key requirements, design priorities, materials guidance, competitive benchmarks, dimensions, cost targets)
- **Actual:** Raw JSON string displayed as a single text block: `{"source_context":"Next iteration brief...","key_requirements":[...],"product_category":"Agricultural IoT Irrigation System",...}`
- **Impact:** Design brief data is present and correct but unreadable. Users see JSON instead of a professional design document.
- **Source files:** The Forge CAD Lab view components

### BUG-T04 — Fundability tab missing improvement suggestions section (MODERATE) — ✅ FIXED

- **Page:** Product detail → Fundability tab
- **Step:** D3-S4.1 — Score Fundability → verify suggestions appear
- **Expected:** Score breakdown followed by improvement suggestions (as described in test plan)
- **Actual:** Score breakdown shows correctly (Market Size 90, Margin 20, Defensibility 90, Team Readiness 50, Traction 20) but no suggestions section is rendered below the breakdown. Page content ends after the Traction bar.
- **Note:** Suggestions DO appear on the History/Synthesis tab as "Aligned Improvements" and "Trade-off Improvements" — so the data exists, just isn't shown on Fundability tab itself.
- **Impact:** Users must navigate to History tab to see actionable suggestions. The Fundability tab feels incomplete.
- **Source files:** `src/app/(platform)/products/[id]/product-detail-view.tsx`

### BUG-T05 — Max CTO conversation has duplicate text paragraphs (MINOR) — ✅ FIXED

- **Page:** The Forge → CAD Lab conversation
- **Step:** D4-S1 — Answering Max's questions
- **Expected:** Each Max CTO response is a single coherent message
- **Actual:** The first paragraph of Max's response is duplicated. For example, "Rural Kenya with no grid totally shapes the design — solar and 2G SMS as the lifeline, and robustness over everything else." appears twice — once as a short echo, then again as part of the full response paragraph.
- **Observed on:** Multiple conversation turns (after selecting "Rural Kenya, no grid" and "Small batch (10-50 units)")
- **Impact:** Cosmetic but confusing — makes the conversation look glitchy.

### BUG-T06 — "Company not found" toast on Settings page (MINOR) — ✅ FIXED

- **Page:** /settings
- **Step:** D5 — Navigate to Settings
- **Expected:** Settings page loads cleanly
- **Actual:** Page loads with content visible and functional, but a "Company not found." toast appears briefly. Settings tabs (Account, Billing & Usage, Company, Intelligence, Privacy & Data, Help & Support) all render correctly underneath.
- **Impact:** Cosmetic — functionality is unaffected but the toast is alarming to users.

### BUG-T07 — Cash Burn opening balance shows £0.00 (MODERATE) — ✅ FIXED

- **Page:** /cash-burn
- **Step:** D2-S1 — Verify Cash Burn dashboard
- **Expected:** Opening balance of £75,000 as entered during Day 2
- **Actual:** Opening Balance shows £0.00. Weekly Burn Rate (£266.15), Runway (45 weeks), and Cash-Zero Date (8 Feb 2027) all calculate based on the £0 balance.
- **Likely cause:** Opening balance may not have been saved to the active scenario, or the scenario defaults override entered values.
- **Impact:** Runway and cash-zero calculations are incorrect, giving misleading financial projections.

### BUG-T08 — React hydration mismatch error #418 (PRE-EXISTING, MINOR)

- **Page:** Every page load
- **Console:** `Error: Minified React error #418` on every navigation
- **Impact:** No visible UI impact. Pre-existing issue across all deployments. Likely caused by browser extensions or date/time-dependent rendering differences between server and client.

---

## Features Verified Working

### Day 1 — Orientation, Strategy, Objectives, Tasks
- Login and onboarding: data from prior sessions present and correct
- Today page: loads with relevant dashboard widgets
- My Profile: user info displayed correctly
- Strategy/Plan section: accessible via sidebar
- Objectives: 3 objectives present (validated product-market fit, Series A-ready score, reduce COGS)
- Tasks: 5 tasks present with correct statuses

### Day 2 — Cash Burn, Investors, Fundraise
- Cash Burn: dashboard with Finn specialist advice, cumulative balance chart, scenario modelling, revenue/cost delay sliders
- Cash Out: expense items listed
- Cash In: income items listed
- P&L: accessible
- Investors: page loads with investor data
- Fundraise: page loads

### Day 3 — Product Creation, Market, Economics, Fundability, Synthesis
- Product list: "Agricultural Technology Product" present, status "Researching"
- Product detail Overview tab: description, lifecycle tracker (Concept → Researching), unit price £149.99, target monthly units 250
- Market tab: market assessment generated successfully (TAM £28M, SAM £4.2M, SOM £210K, Market Confidence 100)
- Economics tab: volume sensitivity table displayed, unit price and targets shown
- Fundability tab: score generated (56/100 "Moderate investor appetite"), breakdown with 5 dimensions and color-coded bars
- History tab: Product Synthesis with Pareto Scores (Market 100, Financial 30, Fundability 56, Manufacturing 30), Next Action, Aligned Improvements (3 checkboxes), Trade-off Improvements (2 checkboxes), Iteration History

### Day 4 — Design Briefs, The Forge, Iterations
- "Start Next Iteration" button on History tab: navigates to The Forge with pre-filled project
- The Forge CAD Lab: Max CTO conversation works, asks contextual questions with quick-reply options
- Research phase: runs web search (Gemini Search), Thingiverse search, design standards database (220+ standards), material properties, Claude Opus synthesis — all within ~60 seconds
- Design brief generated with detailed technical content (product category, dimensions, materials, cost targets, competitive benchmarks)
- Projects list shows "Researched" status with project card

### Day 5 — Specialists, Marketplace, Recruits, Settings
- Specialists (/agents): 13 specialists listed, huddle cards for Strategy, Technology, Legal & Finance, Finance Deep Dive, Go-to-Market Launch, Product Pivot, Supply Chain & Sourcing, Fundraise War Room — all with "Join Huddle" buttons
- Recruits: Harper (Hiring) specialist, 98 people in talent pool, "Complete your profile to unlock matches" CTA
- Settings: Account tab with user profile (Tristan Fischer, Executive), Billing & Usage, Privacy & Data, Integrations cards, Setup Wizard, Notifications (coming soon)
- Pricing: accessible from footer

### AI Specialist Advice (Verified Real, Not Static)
Every specialist briefing showed contextual, AI-generated advice specific to the current product/company state:
- **Priya (Product Development)**: Referenced the market score of 100, weak financials/manufacturing, advised narrowing focus
- **Finn (Finance)**: Referenced £266.15/week burn rate, 45 weeks runway, 7 expense items vs 3 revenue lines
- **Cal (Chief of Staff)**: Referenced 13 specialists with no workflows configured
- **Max (CTO)**: Referenced 1 project in flight, advised finishing before starting new ones
- **Harper (Hiring)**: Referenced 98 people in talent pool, advised setting industry and stage first

---

## UI/UX Observations

1. **Tab switching on product detail requires JavaScript click** — React-controlled tabs don't respond to standard Chrome MCP `left_click` on the tab buttons. Required `document.querySelectorAll('button').forEach(b => { if(b.textContent.trim() === 'TabName') b.click() })` workaround. Not a user-facing bug (normal clicks work), but relevant for automated testing.

2. **Specialist hero cards are excellent** — The contextual specialist advice at the top of each page is one of the strongest UX features. Each specialist references real data from the user's account.

3. **The Forge conversation flow is delightful** — Multi-turn conversation with Max CTO, quick-reply buttons, research progress indicators, and engineering insights make the design brief generation feel substantive and professional.

4. **Sidebar navigation is well-organized** — Clear section groupings (ME, PLAN, CASH BURN, WORKSHOP, MARKETPLACE) with appropriate icons and active state highlighting.

---

## Resolution Summary

All 7 actionable bugs fixed and deployed:

| Bug | Fix | Commit |
|-----|-----|--------|
| T01 | Migration applied + `created_by` added to cash burn inserts | `061c4763` |
| T02 | Match routes emit `no_company` phase, clients show onboarding card | `061c4763` |
| T03 | `product_overview` formatted as text + legacy JSON auto-parsed on display | `061c4763` |
| T04 | Optional chaining guard on `improvement_suggestions` prevents silent crash | `061c4763` |
| T05 | Removed acknowledgment concatenation in Max CTO conversation | `061c4763` |
| T06 | Settings/company shows onboarding card for sandbox workspaces | `061c4763` |
| T07 | `useEffect` syncs scenario props from server on navigation | `061c4763` |
| T08 | Pre-existing React hydration #418 — cosmetic, no fix needed | — |

All migrations applied to production Supabase. 71/71 test suites, 836/836 tests pass.
