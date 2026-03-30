# Prompt for Claude Coworker — Execute Full Browser Test

## Your Mission

You are testing ForgeOS, a platform for hardware startups. Open Chrome and execute the complete 5-day new user journey test plan at `docs/NEW-USER-JOURNEY-TEST-PLAN.md` in this repo.

You have browser and computer control. You will click through every page, enter real data, test every feature, take screenshots, and fix any bugs you find.

## Setup

1. Open Chrome and navigate to **https://fractionalforge.app** (production) or **http://localhost:3000** (if dev server is running)
2. Log in with the Founder test account (check `.env.local` for `TEST_FOUNDER_EMAIL` and `TEST_FOUNDER_PASSWORD`)
3. If you hit onboarding flows, complete them — don't skip

## How to Execute

Open `docs/NEW-USER-JOURNEY-TEST-PLAN.md` and execute every step from Day 1 through Day 5 **in order**. Each day builds on the previous day's data.

### What "execute" means:
- **Navigate** to the page specified
- **Click** buttons, fill forms, enter the exact data described in each step
- **Verify** every "Verify:" checkpoint — confirm the expected behaviour actually happens
- **Screenshot** at every point marked with a camera icon — save to `e2e/screenshots/coworker/`
- **Wait** for AI operations (market assessment, fundability scoring, synthesis) — they take 5-15 seconds
- **Report** any failures using the bug template at the bottom of the test plan

### Critical paths to test thoroughly:
1. **Day 3: The circular loop** — Create product from market idea → market assessment → economics → fundability → synthesis → iteration tracking. This is the most important flow.
2. **Day 4: Design briefs** — Apply a fundability suggestion → Max CTO review dialog → send to Forge → verify iteration. This closes the loop.
3. **Cash Burn integration** — After setting product pricing, verify the "By Product" toggle on the Cash Burn donut chart works, and the product filter dropdowns on Cash In/Out pages work.

### Data to enter (use this exactly):

**Product (Day 3):**
- Target market: `Smallholder farmers (2-10 hectares) in Kenya, Tanzania, and Uganda growing maize, beans, and coffee. 2.5 million farms in our addressable market.`
- Problem: `Manual irrigation wastes 40% of water, requires constant physical presence, and produces inconsistent yields. Farmers lose 30-40% of potential harvest to poor water management. Existing smart controllers cost £200+ and need grid power — out of reach for most smallholders.`
- Industry: `Agricultural Technology`
- Product name (edit after creation): `AquaSmart Controller`
- Unit price: `75` (£75)
- Target monthly units: `200`

**Cash Burn (Day 2):**
- Opening balance: `75000` (£75,000)
- Fixed costs: Office rent £800, Salaries £9000, Cloud £150, Insurance £120, Accounting £200
- Variable costs: Prototyping £500, Components £300
- Cash in: Pre-seed equity £75,000 (one-time), Innovate UK Grant £50,000 (one-time, 40% probability), Consulting £2,000/month

**Objectives (Day 1):**
1. `Validate product-market fit with 10 pilot farmers by Q3 2026`
2. `Achieve £3M Series A-ready fundability score by Q4 2026`
3. `Reduce unit COGS below £25 through design optimization`

**Tasks (Day 1):**
1. `Source soil moisture sensor suppliers`
2. `Design solar charging circuit`
3. `Research Kenya agriculture subsidies`
4. `Draft investor pitch deck outline`
5. `Contact SunCulture for competitive analysis`

### When you find a bug:
1. Take a screenshot
2. Check the browser console (DevTools → Console) for errors
3. Note the step number, expected vs actual behaviour
4. **Fix the bug in the codebase** — read the relevant source file (listed in the test plan), understand the issue, and edit the code
5. Verify the fix works by retesting the step
6. Commit the fix with a descriptive message
7. Continue testing

### When AI features take too long:
- Market assessment: up to 15 seconds
- Fundability scoring: up to 10 seconds
- Synthesis: up to 15 seconds
- Design brief generation: up to 15 seconds
- Max CTO review: up to 10 seconds
- If any takes >30 seconds, check the browser console for errors

### After completing all 5 days:
1. Write a summary of all bugs found and fixed in `docs/COWORKER-TEST-RESULTS.md`
2. List any features that don't work as expected
3. List any UI issues (misalignment, wrong colours, clipped text, etc.)
4. Commit all fixes and the test results
5. Push to main

### Key source files for debugging:
- Product detail: `src/app/(platform)/products/[id]/product-detail-view.tsx`
- Product list: `src/app/(platform)/products/product-list-view.tsx`
- Server actions: `src/actions/products.ts`
- Types: `src/types/product.ts`
- Investor matching: `src/lib/investor-match.ts`
- Cash Burn: `src/app/(platform)/cash-burn/cash-burn-view.tsx`
- Cash In: `src/app/(platform)/cash-burn/cash-in/cash-in-view.tsx`
- Cash Out: `src/app/(platform)/cash-burn/cash-out/cash-out-view.tsx`
- P&L: `src/app/(platform)/cash-burn/pnl/pnl-view.tsx`
- Fundraise: `src/app/(platform)/fundraise/fundraise-view.tsx`
- Merge dialog: `src/components/strategy/merge-review-dialog.tsx`

### The standard:
Every page should load without errors. Every feature should work. Every specialist briefing should show real AI-generated advice (not static fallback text). The circular loop should flow naturally from product creation to iteration. If something doesn't delight you, fix it.
