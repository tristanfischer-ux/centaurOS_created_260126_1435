# Product Intelligence Layer — Browser Test Plan

## Prerequisites
- Logged in as a Founder or Executive
- At least one CAD Lab project exists (ideally one with completed design + cost estimates)
- Access to Cash Burn pages with some existing data

---

## Test Suite 1: Products Page — Empty State

### T1.1 Navigate to Products
1. Click "Products" in the Workshop sidebar section
2. **Expected:** Products page loads with Priya BriefingHero at top
3. **Expected:** Empty state shows 3 creation flow cards:
   - "From The Forge" (enabled, links to /the-forge)
   - "From a Market Idea" (disabled, "Coming soon")
   - "From Your Business Plan" (disabled, "Coming soon")
4. **Expected:** Page header has orange accent bar + "Products" title

### T1.2 Priya's Briefing
1. Wait 3-5 seconds for the live briefing to load
2. **Expected:** Priya's BriefingHero shows a qualitative narrative (not static fallback)
3. **Expected:** Narrative mentions product count (0) and suggests getting started
4. **Expected:** "Discuss with Priya" chip is visible

---

## Test Suite 2: Promote from Forge

### T2.1 Navigate to The Forge
1. Go to /the-forge
2. Find a completed or in-progress CAD Lab project
3. **Expected:** "Promote to Product" button visible on eligible project cards
4. **Expected:** Button NOT visible on projects already linked to a product

### T2.2 Promote a Project
1. Click "Promote to Product" on an eligible project
2. **Expected:** Button shows loading state (spinner)
3. **Expected:** Toast confirms "Product created"
4. **Expected:** Navigates to /products/[new-id]
5. **Expected:** Product name matches CAD project name
6. **Expected:** Lifecycle is "Prototyping"
7. **Expected:** Unit economics card shows COGS from CAD Lab estimates

### T2.3 Prevent Duplicate Promotion
1. Go back to /the-forge
2. **Expected:** The promoted project NO LONGER shows "Promote to Product" button
3. Try promoting the same project via direct API (if possible)
4. **Expected:** Error: "Product already exists for this project"

---

## Test Suite 3: Product Detail — Overview Tab

### T3.1 View Product Detail
1. Navigate to /products/[id]
2. **Expected:** Page header shows product name + lifecycle badge
3. **Expected:** Priya BriefingHero loads with product-specific narrative
4. **Expected:** Tab bar shows: Overview, Market, Economics, Fundability (+ locked History)

### T3.2 Edit Description
1. Click "Edit" button on description
2. Enter a new description
3. Click "Save"
4. **Expected:** Description updates, toast confirms
5. **Expected:** Description persists on page reload

### T3.3 Lifecycle Indicator
1. View the lifecycle progress bar
2. **Expected:** Current stage is highlighted (e.g., "Prototyping" for promoted products)
3. **Expected:** Completed stages show as filled, future stages as empty

### T3.4 Linked CAD Project Card
1. If product was promoted from Forge, check the CAD Lab link card
2. **Expected:** Shows project name + link to /the-forge/cad-lab/[projectId]
3. Click the link
4. **Expected:** Navigates to the correct CAD Lab project

---

## Test Suite 4: Economics Tab

### T4.1 Enter Pricing
1. Click "Economics" tab
2. Enter unit price: £49.99
3. Enter target monthly units: 100
4. Click "Save & Sync to Cash Burn"
5. **Expected:** Toast confirms pricing saved
6. **Expected:** Toast confirms financial sync

### T4.2 Verify Volume Sensitivity
1. After saving pricing, check the Volume Sensitivity table
2. **Expected:** 3 rows: 50 units, 100 units, 200 units
3. **Expected:** Each row shows monthly revenue, monthly COGS, monthly gross profit, annual gross profit
4. **Expected:** Profitable rows show green text, loss rows show red
5. **Expected:** COGS per unit matches the Overview tab's unit economics card

### T4.3 Verify Cash Burn Sync
1. Navigate to /cash-burn/cash-in
2. **Expected:** A new revenue item exists: "[Product Name] Revenue" with monthly amount = £4,999
3. **Expected:** Item has a product tag visible (if product dropdown shows product name)
4. Navigate to /cash-burn/cash-out
5. **Expected:** A new COGS item exists: "[Product Name] COGS" with monthly amount from cost estimates × 100

### T4.4 Re-sync After Price Change
1. Go back to /products/[id] → Economics tab
2. Change unit price to £59.99
3. Click "Save & Sync to Cash Burn"
4. Navigate to /cash-burn/cash-in
5. **Expected:** The revenue item is UPDATED (not duplicated) to £5,999/month

---

## Test Suite 5: Market Assessment

### T5.1 Trigger Assessment
1. Go to /products/[id] → Market tab
2. **Expected:** Empty state with "Assess Market" button
3. Click "Assess Market"
4. **Expected:** Button shows loading spinner
5. **Expected:** After 5-15 seconds, assessment data populates:
   - TAM, SAM, SOM with £ values
   - Target customer description
   - Customer segments table
   - Competitive landscape table
   - Pricing analysis
   - Risks and opportunities lists
6. **Expected:** All fields show "AI Estimated" amber badge

### T5.2 Validate a Data Point
1. Edit the TAM field (change the number)
2. **Expected:** Badge changes from "AI Estimated" to "Validated" (green)
3. Edit a competitor's price point
4. **Expected:** That competitor's row shows "Validated" badge

### T5.3 Add/Remove Data
1. Click "Add Segment" in customer segments
2. **Expected:** New empty row appears
3. Fill in name, size, willingness to pay
4. Click "Add Competitor"
5. **Expected:** New empty row appears
6. Click "Save Assessment"
7. **Expected:** Toast confirms save
8. **Expected:** Data persists on page reload

### T5.4 Lifecycle Update
1. After assessment completes, check the lifecycle
2. **Expected:** Lifecycle changed from "Concept" or "Prototyping" to "Researching"

---

## Test Suite 6: Fundability Scoring

### T6.1 Score Without Market Assessment
1. Create a new product (no market assessment, no pricing)
2. Go to Fundability tab
3. Click "Score Fundability"
4. **Expected:** Score generates with low scores for market size (no TAM) and margin (no pricing)
5. **Expected:** Improvement suggestions appear

### T6.2 Score With Full Data
1. Go to a product with market assessment + pricing set
2. Click "Score Fundability"
3. **Expected:** Score is higher (reflecting available data)
4. **Expected:** 5 sub-scores shown with progress bars
5. **Expected:** Investor appetite badge: "strong" / "moderate" / "weak"
6. **Expected:** 2-3 improvement suggestions with actionable text

### T6.3 Score Colour Coding
1. **Expected:** Score > 70 shows green
2. **Expected:** Score 45-70 shows amber
3. **Expected:** Score < 45 shows red
4. **Expected:** Each sub-score bar is independently colour-coded

---

## Test Suite 7: Cash Burn Integration

### T7.1 Product Dropdown on CashIn Form
1. Navigate to /cash-burn/cash-in
2. Click "Add Item" (or "Quick Setup")
3. In the add dialog, **Expected:** "Product (optional)" dropdown visible
4. Select a product from the dropdown
5. Fill in other fields and save
6. **Expected:** Item created with product association

### T7.2 Product Dropdown on CashOut Form
1. Navigate to /cash-burn/cash-out
2. Click "Add Item"
3. **Expected:** "Product (optional)" dropdown visible
4. Select a product, fill in fields, save
5. **Expected:** Item created with product association

### T7.3 No Dropdown When No Products
1. If the account has zero products, open the add dialog
2. **Expected:** No product dropdown shown (hidden, not empty)

---

## Test Suite 8: The Forge Integration

### T8.1 Promote Button Eligibility
1. Navigate to /the-forge
2. **Expected:** Projects at stages `interface_ready`, `generated`, or `complete` show "Promote to Product" button
3. **Expected:** Projects at `draft` or `researched` do NOT show the button
4. **Expected:** Already-promoted projects do NOT show the button

### T8.2 Error Handling
1. If all projects are already promoted, **Expected:** no Promote buttons visible
2. Rapid double-click on Promote button
3. **Expected:** Only one product created (button disables during operation)

---

## Test Suite 9: Cross-System Flow (End-to-End)

### T9.1 Full Design-First Flow
1. Have a completed CAD Lab project with cost estimates
2. Promote to Product → verify COGS seeded
3. Set pricing (£50/unit, 200 units/month) → verify Cash Burn sync
4. Run Market Assessment → verify TAM/SAM/SOM populated
5. Validate some data points → verify badges change
6. Score Fundability → verify scores reflect real data
7. Navigate to Cash Burn → verify product-tagged revenue + COGS items exist
8. Navigate to P&L → verify product contributes to overall financials

### T9.2 Delete Product Flow
1. On product detail, click Delete
2. Confirm deletion
3. **Expected:** Redirects to /products
4. **Expected:** Product no longer in list
5. Navigate to Cash Burn
6. **Expected:** Product-tagged items have product_id set to NULL (items still exist but untagged)

---

## Test Suite 10: Edge Cases

### T10.1 Zero Pricing
1. Set unit price to £0 in Economics tab
2. **Expected:** Volume sensitivity shows £0 revenue but positive COGS
3. **Expected:** Gross profit is negative (red)

### T10.2 Very Large Numbers
1. Set TAM to £1,000,000,000,000 (£1 trillion)
2. **Expected:** Number displays correctly with formatting
3. **Expected:** No JavaScript overflow errors

### T10.3 Empty Product Name
1. Try to create a product with empty name
2. **Expected:** Error message shown
3. Try to update product name to empty/whitespace
4. **Expected:** Error message shown

### T10.4 Market Assessment with Minimal Product Data
1. Create a product with just a name (no description, no CAD link)
2. Run Market Assessment
3. **Expected:** Assessment still generates (using name + industry context)
4. **Expected:** Results have lower confidence indicators

### T10.5 Concurrent Pricing Saves
1. Open product Economics tab in two browser tabs
2. Set different prices in each tab
3. Click "Save & Sync" in both tabs simultaneously
4. **Expected:** No duplicate Cash Burn items created
5. **Expected:** One save wins, the other may fail gracefully

---

## Notes for Manual Testing

- **AI-dependent tests** (T5.1, T5.3, T6.1, T6.2): These require ANTHROPIC_API_KEY to be configured. If the API is unavailable, the assessment/scoring returns null gracefully and the fallback message shows.
- **Cross-foundry security tests**: Create a second test foundry and verify products from foundry A are not visible in foundry B.
- **Performance**: Monitor Vercel function durations for market assessment (~15s expected) and fundability scoring (~5s expected). If either times out, check the Vercel Pro `maxDuration` setting.
