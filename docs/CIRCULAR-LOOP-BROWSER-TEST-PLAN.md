# Circular Optimization Loop — Browser Test Plan

## Context

The Product Intelligence Layer connects four previously isolated systems in ForgeOS: The Forge (CAD Lab), Cash Burn (finance), Strategy (business planning), and Investors (fundraising) through a new "Products" entity. A circular optimization loop allows founders to iterate on product designs until they're profitable, manufacturable, market-validated, and investor-attractive.

This test plan exercises every feature end-to-end in the browser. Execute in order — each test builds on the previous one's data.

---

## Prerequisites

- Logged in as a **Founder** or **Executive** role
- Access to a foundry with at least one CAD Lab project (ideally completed with cost estimates)
- ANTHROPIC_API_KEY configured (required for AI-powered features)
- Dev server running (`npm run dev`)

---

## PHASE 1: Products Page — Empty State

### T1.1 Navigate to Products
1. Click **Products** in the sidebar under WORKSHOP
2. **Verify:** Page loads with orange accent bar + "Products" heading
3. **Verify:** Priya (Product Development) specialist briefing appears at top
4. **Verify:** Briefing mentions "no products" or getting started
5. **Verify:** "Discuss with Priya" chip is visible
6. **Verify:** Empty state shows "No products yet" message
7. **Verify:** Three creation flow cards appear at bottom:
   - "From The Forge" — enabled, has orange arrow icon
   - "From a Market Idea" — enabled, has orange arrow icon (NOT "Coming soon")
   - "From Your Business Plan" — enabled, has orange arrow icon (NOT "Coming soon")

**Screenshot:** Take a full-page screenshot.

---

## PHASE 2: Create Product from Market Idea

### T2.1 Open Market Idea Dialog
1. Click the "From a Market Idea" card
2. **Verify:** Dialog opens with a form
3. **Verify:** Form has fields for target market (textarea) and problem (textarea)
4. **Verify:** Cancel button works (closes dialog)

### T2.2 Create Product
1. Reopen the dialog
2. Fill in:
   - Target market: `Smallholder farmers (2-10 hectares) in East Africa growing maize, beans, and coffee`
   - Problem: `Manual irrigation wastes water, requires constant presence, and produces inconsistent yields. Farmers lose 30-40% of potential harvest to poor water management.`
   - Industry (if field exists): `Agricultural Technology`
3. Click Submit / Create
4. **Verify:** Toast shows "Product created — running market assessment..."
5. **Verify:** Navigates to `/products/[id]` — the new product detail page
6. **Verify:** Product name appears in the header (should be something like "Agricultural Technology Product")

**Screenshot:** Product detail page immediately after creation.

### T2.3 Verify Product Detail — Overview Tab
1. **Verify:** Tab bar shows: Overview, Market, Economics, Fundability, History
2. **Verify:** All tabs are clickable (none locked with a Lock icon except possibly Financials)
3. **Verify:** Priya briefing appears at top with product-specific content
4. **Verify:** Lifecycle indicator shows "Concept"
5. **Verify:** Description shows the market + problem text you entered

**Screenshot:** Overview tab.

### T2.4 Check Market Assessment Auto-Trigger
1. Click the **Market** tab
2. **Verify:** Market assessment is either:
   - Loading (spinner, "Assessing market...")
   - Already populated (TAM, SAM, SOM values exist)
   - Shows "Assess Market" button if auto-trigger hasn't completed yet
3. If it shows "Assess Market" button, click it and wait 10-15 seconds
4. **Verify:** Assessment data populates:
   - TAM, SAM, SOM with £ values
   - Target customer description
   - Customer segments table (at least 1 segment)
   - Competitive landscape (at least 1 competitor)
   - Pricing analysis with recommended price
   - Risks and opportunities lists
5. **Verify:** All fields show "AI Estimated" amber badge (not yet validated)

**Screenshot:** Market tab with full assessment data.

### T2.5 Validate Market Data
1. Edit the TAM field — change the number
2. **Verify:** Badge changes from "AI Estimated" to "Validated" (green)
3. Click "Save Assessment"
4. **Verify:** Toast confirms save
5. Reload the page
6. **Verify:** Changed TAM value persists, badge still shows "Validated"

---

## PHASE 3: Economics Tab

### T3.1 Set Pricing
1. Click **Economics** tab
2. Enter unit price: `75.00` (£75)
3. Enter target monthly units: `200`
4. Click "Save & Sync to Cash Burn"
5. **Verify:** Toast says "Pricing saved & synced to Cash Burn"
6. **Verify:** Volume Sensitivity table appears with 3 rows (50%, 100%, 200% of target)
7. **Verify:** Each row shows monthly revenue, monthly COGS, gross profit
8. **Verify:** Profitable rows show green, loss rows show red

**Screenshot:** Economics tab with volume sensitivity.

### T3.2 Verify Cash Burn Sync
1. Navigate to `/cash-burn/cash-in`
2. **Verify:** A new revenue item exists with the product name and monthly amount (~£15,000 = 200 × £75)
3. Navigate to `/cash-burn/cash-out`
4. **Verify:** A new COGS item exists with the product name
5. **Verify:** Both items have a product badge (small outline badge with product name)

**Screenshot:** Cash In page showing product-tagged revenue item.

### T3.3 Verify Auto-Synthesis After Economics
1. Go back to the product detail page
2. Click **History** tab
3. **Verify:** Synthesis may have auto-triggered (check if Pareto scores appear)
4. If no synthesis yet, that's OK — we'll trigger it in Phase 5

---

## PHASE 4: Fundability Scoring

### T4.1 Score Fundability
1. Click **Fundability** tab
2. Click "Score Fundability"
3. **Verify:** Loading spinner appears
4. Wait 5-10 seconds
5. **Verify:** Score appears (0-100) with colour coding:
   - \>70: green
   - 45-70: amber
   - <45: red
6. **Verify:** Investor appetite badge: "Strong" / "Moderate" / "Weak"
7. **Verify:** 5 sub-scores with progress bars:
   - Market Size
   - Margin
   - Defensibility
   - Team Readiness
   - Traction
8. **Verify:** 2-3 improvement suggestions appear with actionable text

**Screenshot:** Fundability tab with scores and suggestions.

### T4.2 Verify Auto-Synthesis After Fundability
1. Click **History** tab
2. **Verify:** Synthesis has auto-triggered — Pareto scores should appear
3. **Verify:** Four bars visible: market, financial, fundability, manufacturing
4. **Verify:** "Next Action" callout box with specific advice
5. **Verify:** Toast appeared saying "Synthesis updated" at some point

---

## PHASE 5: History Tab — Synthesis & Iterations

### T5.1 Run Synthesis (if not already done)
1. Click **History** tab
2. If no synthesis data, click "Run Synthesis"
3. Wait 10-15 seconds
4. **Verify:** Pareto Scores section shows 4 horizontal bars:
   - Market (0-100)
   - Financial (0-100)
   - Fundability (0-100)
   - Manufacturing (0-100)
5. **Verify:** Each bar is colour-coded (green >70, amber 45-70, red <45)
6. **Verify:** "Next Action" box has orange accent with specific, actionable text

**Screenshot:** History tab synthesis view.

### T5.2 Check Type A Improvements
1. **Verify:** "Aligned Improvements" section exists with 1-4 items
2. **Verify:** Each has a checkbox
3. **Verify:** Label says "(improve multiple dimensions)"
4. Click a checkbox
5. **Verify:** Checkbox fills in, item border colour changes

### T5.3 Check Type B Improvements
1. **Verify:** "Trade-off Improvements" section exists with 1-3 items
2. **Verify:** Label says "(require founder decision)"
3. **Verify:** Each has a checkbox
4. Click a checkbox

### T5.4 Verify "Start Next Iteration" Button
1. With at least 1 checkbox selected:
2. **Verify:** "Start Next Iteration (N improvements)" button appears at bottom
3. **Verify:** Button shows the count of selected improvements
4. **Do NOT click yet** — we'll test this in Phase 7

### T5.5 Check Iteration History
1. Scroll down to "Iteration History" card
2. **Verify:** At least 1 iteration exists (from product creation)
3. **Verify:** Each iteration shows:
   - Iteration number
   - Date
   - Mini Pareto bars (4 tiny coloured bars)
   - Convergence status badge (Initial/Improving/etc)
   - Hypothesis text
4. **Verify:** Timeline has a vertical line connecting iterations

**Screenshot:** Full History tab with synthesis + iterations.

---

## PHASE 6: Fundability → Design Brief → Forge

### T6.1 Apply Suggestion to Design Brief
1. Click **Fundability** tab
2. Find the improvement suggestions
3. Click "Apply to Design Brief" on the first suggestion
4. **Verify:** Loading spinner appears on the button
5. Wait 5-10 seconds
6. **Verify:** Dialog opens titled "Review Design Brief"

### T6.2 Verify Max CTO Review
1. In the dialog:
2. **Verify:** "Max is reviewing feasibility..." loading indicator appears (or has already completed)
3. Wait a few seconds
4. **Verify:** "Max (CTO) Review" section appears with:
   - A "Feasible" (green) or "Concerns" (amber) badge
   - Max's written assessment (2-4 sentences)
5. **Verify:** Brief content shows below with:
   - Target Cost
   - Key Requirements
   - Design Priorities
   - Manufacturing Constraints

**Screenshot:** Brief review dialog with Max's review visible.

### T6.3 Approve and Send to Forge
1. Click "Approve & Send to Forge"
2. **Verify:** Loading spinner on button ("Sending to Forge...")
3. **Verify:** Toast says "Design brief approved and sent to The Forge"
4. **Verify:** Navigates to The Forge / CAD Lab page
5. **Verify:** A new project exists (linked to your product)

### T6.4 Verify Iteration Created
1. Navigate back to your product (`/products/[id]`)
2. Click **History** tab
3. **Verify:** A new iteration exists (iteration 2)
4. **Verify:** It shows the fundability suggestion as the hypothesis
5. **Verify:** Convergence delta indicator shows (+ or - number)

---

## PHASE 7: Start Next Iteration

### T7.1 Run Fresh Synthesis
1. On the **History** tab, click "Re-synthesize"
2. Wait for completion
3. Select 1-2 improvements (checkboxes)

### T7.2 Click Start Next Iteration
1. Click "Start Next Iteration (N improvements)"
2. **Verify:** Loading spinner ("Starting next iteration...")
3. Wait 10-15 seconds (generates brief + sends to Forge)
4. **Verify:** Toast says "Next iteration started — new Forge project created"
5. **Verify:** Navigates to Forge/CAD Lab

### T7.3 Verify Celebration or Warning State
1. Navigate back to product → History tab
2. **Verify:** New iteration appears (iteration 3)
3. **Verify:** Either:
   - **Green celebration banner:** "All dimensions improved!" (if all Pareto scores went up)
   - **Amber warning banner:** "[dimension] regressed..." (if any score dropped)
   - **Neither** (if scores haven't been recomputed yet — this is expected)

### T7.4 Verify Before/After Comparison
1. **Verify:** "Progress: Iteration 1 vs 3" card appears
2. **Verify:** Shows 4 dimension deltas with + or - and colour coding
3. **Verify:** Green for improved, red for regressed, grey for unchanged

**Screenshot:** History tab showing 3+ iterations with comparison.

---

## PHASE 8: Product Readiness Milestone

### T8.1 Check Readiness (if scores are high enough)
1. If any synthesis shows all 4 Pareto scores ≥70:
2. **Verify:** Green banner appears: "This product is ready."
3. **Verify:** Shows all 4 scores in large green text
4. **Verify:** Two buttons: "Find best-fit investors" and "Review runway"
5. Click "Find best-fit investors" → should navigate to `/investors`
6. Go back, click "Review runway" → should navigate to `/cash-burn`

*Note: Reaching all scores ≥70 requires multiple iterations with good data. If scores are low, this milestone won't appear — that's correct.*

---

## PHASE 9: Cash Burn Integration

### T9.1 Product P&L Tab
1. Navigate to `/cash-burn/pnl`
2. **Verify:** Three tabs visible: "Income Statement", "Balance Sheet", "Product P&L"
3. Click "Product P&L"
4. **Verify:** Shows per-product breakdown with:
   - Product name
   - Revenue
   - COGS
   - Gross Profit
   - Margin %
5. **Verify:** "Unattributed" section for items without product_id

**Screenshot:** Product P&L tab.

### T9.2 By Product Toggle
1. Navigate to `/cash-burn`
2. Find the "Expense Breakdown" donut chart
3. **Verify:** "By Category" toggle button appears in top-right of the chart
4. Click the toggle
5. **Verify:** Text changes to "By Product"
6. **Verify:** Chart title changes to "Expenses by Product"
7. **Verify:** Chart shows product names instead of categories
8. Click again to toggle back
9. **Verify:** Returns to category view

**Screenshot:** Donut chart in "By Product" mode.

### T9.3 Product Filter on Cash In
1. Navigate to `/cash-burn/cash-in`
2. **Verify:** "Filter by product:" dropdown appears (only if products exist)
3. Select your product name from the dropdown
4. **Verify:** Only items tagged to that product are shown
5. Select "Unattributed"
6. **Verify:** Only items without a product are shown
7. Select "All"
8. **Verify:** All items shown again

### T9.4 Product Filter on Cash Out
1. Navigate to `/cash-burn/cash-out`
2. **Verify:** Same "Filter by product:" dropdown appears
3. Test the same filter flow as T9.3

---

## PHASE 10: Investor Integration

### T10.1 Product Readiness on Fundraise
1. Navigate to `/fundraise`
2. **Verify:** "Product Readiness" card appears (if you have scored products)
3. **Verify:** Shows best product's fundability score
4. **Verify:** Shows investor appetite badge
5. **Verify:** Links to the product detail page

**Screenshot:** Fundraise page with Product Readiness card.

### T10.2 Product Fit Badges on Investors
1. Navigate to `/investors`
2. Browse investor cards
3. **Verify:** Some cards show "Product Fit" (green) or "Partial Fit" (amber) badges
   - This depends on overlap between your product sectors and investor sectors
   - If no overlap exists, no badges appear — that's correct
4. **Verify:** No cards show broken/error states

### T10.3 Match Score Impact
1. Compare match scores before and after having products
2. **Verify:** Investors with sector overlap to your product may have slightly higher scores
   - Product Readiness adds up to 15 points to the match score
   - Only applies when product has fundability sub-scores above thresholds

---

## PHASE 11: Business Plan Flow

### T11.1 Business Plan Product Extraction
1. Navigate to `/strategy`
2. Upload a business plan (PDF) that mentions products
3. Wait for analysis to complete
4. Click "Review & Apply"
5. **Verify:** Merge dialog has a "Products" tab
6. Click the "Products" tab
7. **Verify:** Extracted products appear with name, description, target market
8. **Verify:** Adopt/Skip toggles work
9. Adopt at least one product
10. Click "Apply"
11. **Verify:** Toast confirms products created
12. **Verify:** Navigates to `/products`
13. **Verify:** Adopted products appear in the product list

### T11.2 Auto Market Assessment
1. Click into one of the adopted products
2. Click **Market** tab
3. **Verify:** Market assessment is loading or already populated (auto-triggered on creation)

---

## PHASE 12: Forge Completion Auto-Sync

### T12.1 Complete a Forge Project
1. If you have a CAD Lab project linked to a product that has cost estimates:
2. Navigate to the product detail page
3. **Verify:** On page load, if the Forge project has new cost data:
   - Toast appears: "COGS updated from Forge (£X.XX)"
   - Unit economics update automatically
   - Fundability may auto-rescore
   - Synthesis may auto-update

*Note: This requires a CAD Lab project to actually complete and have new cost estimates since the last sync. Hard to test without going through the full Forge pipeline.*

---

## PHASE 13: Priya Iteration Awareness

### T13.1 Check Priya's Briefing References Iterations
1. Navigate to a product with 2+ iterations
2. **Verify:** Priya's briefing at the top references iteration progress
   - Should mention iteration number or convergence status
   - May say something like "You've improved by X points since version 1"
3. **Verify:** Briefing content is product-specific (not generic)

---

## PHASE 14: Edge Cases

### T14.1 Product with No Data
1. Create a product from "From a Market Idea" with minimal info (just a name)
2. Navigate to each tab
3. **Verify:** Each tab shows appropriate empty state (no crashes)
4. **Verify:** Fundability scoring still works (produces lower scores)

### T14.2 Delete Product
1. On product detail, click Delete
2. Confirm deletion
3. **Verify:** Redirects to `/products`
4. **Verify:** Product no longer in list
5. Navigate to `/cash-burn/cash-in`
6. **Verify:** Product-tagged items still exist but no longer show product badge (product_id set to NULL)

### T14.3 Multiple Products
1. Create 2-3 products
2. Navigate to `/products`
3. **Verify:** All products appear as cards with:
   - Product name
   - Lifecycle badge
   - Unit economics summary (if set)
   - Convergence badge (if iterations exist): "Improving" (green) / "Plateauing" (amber) / "Converged" (blue)

### T14.4 Concurrent Operations
1. Open product detail in two browser tabs
2. Run "Score Fundability" in both simultaneously
3. **Verify:** No duplicate scores created
4. **Verify:** No error — one may fail gracefully

---

## Pass / Fail Checklist

| # | Test | Pass | Notes |
|---|------|------|-------|
| T1.1 | Products page loads | | |
| T2.1 | Market Idea dialog opens | | |
| T2.2 | Product created from idea | | |
| T2.3 | Overview tab renders | | |
| T2.4 | Market assessment auto-triggers | | |
| T2.5 | Market data validation works | | |
| T3.1 | Pricing saved + volume sensitivity | | |
| T3.2 | Cash Burn items created | | |
| T4.1 | Fundability scores generated | | |
| T4.2 | Auto-synthesis after fundability | | |
| T5.1 | Synthesis Pareto bars render | | |
| T5.2 | Type A improvements shown | | |
| T5.3 | Type B improvements shown | | |
| T5.4 | "Start Next Iteration" button | | |
| T5.5 | Iteration timeline renders | | |
| T6.1 | Apply suggestion → brief generated | | |
| T6.2 | Max CTO review appears | | |
| T6.3 | Brief approved → Forge project | | |
| T6.4 | Iteration recorded | | |
| T7.2 | Next iteration creates Forge project | | |
| T7.3 | Celebration/warning state | | |
| T7.4 | Before/after comparison | | |
| T9.1 | Product P&L tab | | |
| T9.2 | By Product donut toggle | | |
| T9.3 | Cash In product filter | | |
| T9.4 | Cash Out product filter | | |
| T10.1 | Product Readiness on Fundraise | | |
| T10.2 | Product Fit badges on investors | | |
| T11.1 | Business plan product extraction | | |
| T13.1 | Priya references iterations | | |
| T14.1 | Empty product — no crashes | | |
| T14.2 | Delete product | | |
| T14.3 | Multiple products + badges | | |

---

## What to Report

For each test that **fails**, report:
1. The test number (e.g., T6.2)
2. What you expected
3. What actually happened
4. Screenshot of the issue
5. Browser console errors (if any — open DevTools → Console tab)

For issues that are **visual bugs** (misalignment, wrong colours, clipped text), take a screenshot and note:
- Which element is wrong
- What it should look like
- Browser and viewport size

---

## Key Files (for debugging)

- Product list page: `src/app/(platform)/products/product-list-view.tsx`
- Product detail page: `src/app/(platform)/products/[id]/product-detail-view.tsx`
- Server actions: `src/actions/products.ts`
- Types: `src/types/product.ts`
- Investor matching: `src/lib/investor-match.ts`
- Cash Burn overview: `src/app/(platform)/cash-burn/cash-burn-view.tsx`
- Cash In view: `src/app/(platform)/cash-burn/cash-in/cash-in-view.tsx`
- Cash Out view: `src/app/(platform)/cash-burn/cash-out/cash-out-view.tsx`
- P&L view: `src/app/(platform)/cash-burn/pnl/pnl-view.tsx`
- Fundraise view: `src/app/(platform)/fundraise/fundraise-view.tsx`
- Investor card: `src/app/(platform)/investors/components/InvestorCard.tsx`
- Merge dialog: `src/components/strategy/merge-review-dialog.tsx`
- Integration test: `scripts/test-circular-loop.ts`
