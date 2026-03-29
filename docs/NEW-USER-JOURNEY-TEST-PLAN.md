# ForgeOS — New User Journey: Complete Browser Test Plan

## Who You Are

You are **Alex Chen**, a hardware startup founder. You're building a smart irrigation controller for smallholder farmers in East Africa. You've just raised a small pre-seed round, have a 3-person team, and need to turn your idea into a fundable, manufacturable product. You found ForgeOS and signed up.

This test plan simulates your first 5 days using ForgeOS. You will visit every page, add real content, test every feature, and report anything that breaks, looks wrong, or confuses you.

---

## Instructions for the Tester

1. **Execute every step in order.** Each day builds on the previous day's data.
2. **Take a screenshot** at every point marked with a camera icon.
3. **Add real content** — don't use placeholder text. Use the persona and product described above.
4. **Report every issue** using this format:
   - Step number (e.g., D1-S3.2)
   - What you expected
   - What actually happened
   - Screenshot
   - Browser console errors (DevTools → Console)
5. **Fix bugs as you find them.** After fixing, re-test the failing step and continue.
6. **Use Chrome desktop** (1440×900) as primary. Spot-check mobile (375×812) at the end of each day.

---

## DAY 1: Arrival — Setting Up Your Foundry

*Goal: Navigate every page in the ME and PLAN sections, set up your profile, upload a business plan, and create your first strategic objectives.*

### Session 1: First Login & Orientation

**D1-S1.1** Open ForgeOS and log in as a Founder
- Navigate to the login page
- Sign in with test credentials
- **Verify:** Redirects to `/today` (or onboarding flow if first time)
- **Verify:** Sidebar is visible with 5 sections: ME, PLAN, CASH BURN, WORKSHOP, MARKETPLACE
- 📸 Screenshot: Today page after login

**D1-S1.2** Explore the Today page (`/today`)
- **Verify:** Page loads with personalized greeting
- **Verify:** Shows daily focus items, tasks, or getting-started prompts
- **Verify:** Specialist briefing appears at top (Sage or similar)
- **Verify:** No error banners or broken components
- 📸 Screenshot: Full Today page

**D1-S1.3** Visit My Profile (`/my-profile`)
- Click "My Profile" in sidebar under ME
- **Verify:** Profile page loads with your name, role, avatar
- **Verify:** Editable fields are present (name, bio, etc.)
- Edit your bio: `Hardware founder building smart agriculture technology for East Africa. Previously led R&D at a climate tech startup. Mechanical engineer by training.`
- Save changes
- **Verify:** Toast confirms save
- **Verify:** Bio persists on reload
- 📸 Screenshot: Profile page with bio

**D1-S1.4** Visit Comms (`/updates`)
- Click "Comms" in sidebar
- **Verify:** Activity feed or messaging interface loads
- **Verify:** No errors — may show empty state if no messages yet
- 📸 Screenshot: Comms page

**D1-S1.5** Visit Time Tracking (`/time`)
- Click "Time" in sidebar
- **Verify:** Weekly time grid loads (Mon-Sun)
- **Verify:** Entry form or empty state visible
- Log a time entry:
  - Date: today
  - Hours: 2
  - Description: `Research irrigation sensor suppliers`
  - Category/Project: any available option
- Save the entry
- **Verify:** Entry appears in the grid
- 📸 Screenshot: Time page with entry

**D1-S1.6** Visit Google Apps (`/google-apps`)
- Click "Google Apps" in sidebar
- **Verify:** Page loads (may show integration prompt or connected state)
- 📸 Screenshot: Google Apps page

### Session 2: Strategy & Planning

**D1-S2.1** Visit the Plan section intro (`/plan`)
- Click the PLAN section header
- **Verify:** Section intro page loads with overview of planning tools
- 📸 Screenshot: Plan intro page

**D1-S2.2** Visit Strategy (`/strategy`)
- Click "Strategy" in sidebar
- **Verify:** Strategy page loads with upload prompt or existing strategy
- Upload a business plan PDF (use any relevant document, or create a simple one)
  - If no PDF available, skip upload and proceed
- **Verify:** If uploaded, analysis begins processing
- 📸 Screenshot: Strategy page

**D1-S2.3** Visit Knowledge Vault (`/knowledge`)
- Click "Knowledge" in sidebar
- **Verify:** Knowledge page loads
- **Verify:** Shows either onboarding/empty state or existing notes
- If empty, add a knowledge note:
  - Title: `East African Irrigation Market Research`
  - Content: `The smallholder irrigation market in East Africa is growing at 15% annually. Key barriers: cost of equipment, lack of technical support, unreliable power supply. Solar-powered solutions have 3x adoption rate vs grid-connected alternatives. Main competitors: Jain Irrigation (India), Netafim (Israel), SunCulture (Kenya).`
- Save the note
- **Verify:** Note appears in the vault
- 📸 Screenshot: Knowledge page with note

**D1-S2.4** Visit Objectives (`/new-objectives`)
- Click "Objectives" in sidebar
- **Verify:** Objectives page loads
- Create 3 objectives:
  1. `Validate product-market fit with 10 pilot farmers by Q3 2026`
     - Description: `Deploy prototypes to 10 smallholder farmers in Kenya's Rift Valley. Measure water savings, crop yield improvement, and user satisfaction over 3 months.`
  2. `Achieve £3M Series A-ready fundability score by Q4 2026`
     - Description: `Build a product with strong margins (>60%), validated market demand, and manufacturing readiness. Target overall fundability score of 75+.`
  3. `Reduce unit COGS below £25 through design optimization`
     - Description: `Iterate on housing design (3D print vs injection mould), component selection, and PCB layout to hit target manufacturing cost.`
- **Verify:** All 3 objectives appear in the list
- **Verify:** Each has a progress indicator
- 📸 Screenshot: Objectives page with 3 objectives

**D1-S2.5** Visit Tasks (`/new-tasks`)
- Click "Tasks" in sidebar
- **Verify:** Task board or list loads
- Create 5 tasks linked to your objectives:
  1. `Source soil moisture sensor suppliers` — linked to Objective 3
  2. `Design solar charging circuit` — linked to Objective 3
  3. `Research Kenya agriculture subsidies` — linked to Objective 1
  4. `Draft investor pitch deck outline` — linked to Objective 2
  5. `Contact SunCulture for competitive analysis` — linked to Objective 1
- **Verify:** All 5 tasks appear
- **Verify:** Each shows its linked objective
- Mark task 3 as complete
- **Verify:** Task shows completed state (green checkmark)
- 📸 Screenshot: Tasks page with 5 tasks

**D1-S2.6** Visit Reports (`/reports`)
- Click "Reports" in sidebar
- **Verify:** Reports page loads
- **Verify:** Shows report generation options (weekly update, board pack, etc.)
- Generate a weekly update report if possible
- 📸 Screenshot: Reports page

**D1-S2.7** Visit Red Team (`/red-team`)
- Click "Red Team" in sidebar
- **Verify:** Red Team page loads
- Run a red team debate on: `Should we target smallholder farmers directly or sell through agricultural cooperatives?`
- Wait for the debate to complete (may take 30-60 seconds)
- **Verify:** Multiple LLM perspectives shown
- **Verify:** Synthesis or verdict appears
- 📸 Screenshot: Red Team with debate results

### Session 3: Day 1 Mobile Check

**D1-S3.1** Resize browser to mobile (375×812) or use device emulation
- Navigate to `/today`
- **Verify:** Bottom navigation bar visible with Today, Comms, Tasks, and "+" button
- **Verify:** "More" drawer opens when tapped
- **Verify:** All 5 sections visible in the drawer
- Tap through: Strategy, Objectives, Tasks
- **Verify:** Each page renders without horizontal overflow
- 📸 Screenshot: Mobile today page + mobile drawer open

---

## DAY 2: Money — Setting Up Finances

*Goal: Set up Cash Burn, add costs and revenue, explore P&L, and discover investors.*

### Session 1: Cash Burn Setup

**D2-S1.1** Visit Cash Burn overview (`/cash-burn`)
- Click CASH BURN section header or "Cash Burn" link
- **Verify:** Cash Burn page loads with scenario panel
- **Verify:** Finn (Finance) specialist briefing appears at top
- Set opening balance: `75000` (£75,000 — your pre-seed funding)
- **Verify:** Runway calculation updates
- 📸 Screenshot: Cash Burn overview

**D2-S1.2** Add Cash Out items (`/cash-burn/cash-out`)
- Click "Cash Out" in sidebar
- **Verify:** Page loads with Fixed Costs and Variable Costs sections
- Add these monthly fixed costs:
  1. `Office rent` — £800/month — category: rent
  2. `Team salaries (3 people)` — £9,000/month — category: salaries
  3. `Cloud infrastructure` — £150/month — category: cloud_infrastructure
  4. `Insurance` — £120/month — category: insurance
  5. `Accounting` — £200/month — category: accounting
- Add these variable costs:
  6. `Prototyping materials` — £500/month — category: prototyping
  7. `Component samples` — £300/month — category: hardware_components
- **Verify:** All 7 items appear in correct sections (fixed vs variable)
- **Verify:** Weekly and monthly totals update
- 📸 Screenshot: Cash Out page with all items

**D2-S1.3** Add Cash In items (`/cash-burn/cash-in`)
- Click "Cash In" in sidebar
- **Verify:** Page loads with income sections
- Add:
  1. `Pre-seed equity` — £75,000 — one-time — source: equity
  2. `Innovate UK Grant` — £50,000 — one-time — source: government_grant — probability: 40%
  3. `Consulting revenue` — £2,000/month — source: revenue
- **Verify:** All items appear
- **Verify:** Probability shows on the grant (40%)
- 📸 Screenshot: Cash In page with items

**D2-S1.4** Check Cash Burn runway
- Navigate back to `/cash-burn`
- **Verify:** Runway calculation shows weeks remaining
- **Verify:** Burn area chart populated with data
- **Verify:** Stacked bar chart shows Cash In vs Cash Out
- **Verify:** Expense Breakdown donut chart shows categories
- **Verify:** Weekly table shows projections
- Test the scenario panel:
  - Create a new scenario: "Optimistic" with 5% revenue growth
  - **Verify:** Charts update when switching scenarios
- 📸 Screenshot: Cash Burn with charts and data

**D2-S1.5** Check P&L (`/cash-burn/pnl`)
- Click "P&L" in sidebar
- **Verify:** Income Statement tab shows revenue vs expenses
- **Verify:** Three tabs visible: Income Statement, Balance Sheet, Product P&L
- Click "Product P&L" tab
- **Verify:** Shows "Unattributed" section (no products yet) or empty state
- Toggle between Weekly and Monthly periods
- **Verify:** Numbers recalculate correctly
- 📸 Screenshot: P&L page

### Session 2: Investors & Fundraising

**D2-S2.1** Browse Investors (`/investors`)
- Click "Investors" in sidebar
- **Verify:** Investor directory loads with grid of investor cards
- **Verify:** Each card shows: firm name, location, fund size, stage focus, sectors
- **Verify:** Match score badges appear on cards
- **Verify:** Filter panel works (try filtering by stage: "Seed")
- **Verify:** Search works (search for "hardware" or "climate")
- Click on an investor card
- **Verify:** Investor detail page loads with full profile
- Go back to the directory
- Shortlist 3 investors (click heart icon)
- **Verify:** Hearts fill in orange
- 📸 Screenshot: Investor directory with cards

**D2-S2.2** Check Fundraise Dashboard (`/fundraise`)
- Click "Fundraise" in sidebar
- **Verify:** Fundraise page loads with pipeline overview
- **Verify:** Shortlisted investors appear
- **Verify:** Coverage analysis or outreach tracking visible
- Note: "Product Readiness" card won't appear yet (no products scored)
- 📸 Screenshot: Fundraise dashboard

### Session 3: Day 2 Summary Check

**D2-S3.1** Return to Today page (`/today`)
- **Verify:** Today page now shows recent activity (tasks completed, items added)
- **Verify:** Specialist briefing references your financial data
- 📸 Screenshot: Updated Today page

---

## DAY 3: Product — The Circular Optimization Loop

*Goal: Create your first product, run market assessment, set economics, score fundability, and start the optimization loop.*

### Session 1: Create Product from Market Idea

**D3-S1.1** Navigate to Products (`/products`)
- Click "Products" under WORKSHOP in sidebar
- **Verify:** Products page loads with Priya briefing
- **Verify:** Empty state with 3 creation flow cards
- 📸 Screenshot: Empty products page

**D3-S1.2** Create product from market idea
- Click "From a Market Idea"
- **Verify:** Dialog opens with form fields
- Fill in:
  - Target market: `Smallholder farmers (2-10 hectares) in Kenya, Tanzania, and Uganda growing maize, beans, and coffee. 2.5 million farms in our addressable market.`
  - Problem: `Manual irrigation wastes 40% of water, requires constant physical presence, and produces inconsistent yields. Farmers lose 30-40% of potential harvest to poor water management. Existing smart controllers cost £200+ and need grid power — out of reach for most smallholders.`
  - Industry: `Agricultural Technology`
- Click Create
- **Verify:** Toast says "Product created — running market assessment..."
- **Verify:** Navigates to product detail page
- 📸 Screenshot: Product detail page immediately after creation

**D3-S1.3** Verify Overview tab
- **Verify:** Product name in header with lifecycle badge ("Concept")
- **Verify:** Priya briefing at top with product-specific narrative
- **Verify:** Description shows your market + problem text
- **Verify:** Tab bar: Overview, Market, Economics, Fundability, History
- Edit the product name to `AquaSmart Controller`
- **Verify:** Name updates

### Session 2: Market Assessment

**D3-S2.1** Check Market tab
- Click "Market" tab
- **Verify:** Market assessment is either loading or already populated (auto-triggered)
- If it shows "Assess Market" button, click it
- Wait 10-15 seconds
- **Verify:** Full assessment appears:
  - TAM, SAM, SOM with £ values
  - Target customer description
  - Customer segments table (at least 2 segments)
  - Competitive landscape (at least 2 competitors)
  - Pricing analysis with recommended price range
  - Market risks list
  - Market opportunities list
- **Verify:** All fields show "AI Estimated" amber badges
- 📸 Screenshot: Full market assessment

**D3-S2.2** Validate market data
- Edit the TAM value — change to a number you believe is correct
- **Verify:** Badge changes to "Validated" (green)
- Add a customer segment: `Agricultural cooperatives` with size: 5000, willingness to pay: 15000
- Add a competitor: `SunCulture` with price: £250, strengths: `Solar-native, Kenya presence`, weaknesses: `Expensive, no soil sensors`
- Click "Save Assessment"
- **Verify:** Toast confirms save
- Reload the page, check Market tab
- **Verify:** All changes persisted
- 📸 Screenshot: Market tab with validated data

### Session 3: Economics

**D3-S3.1** Set pricing on Economics tab
- Click "Economics" tab
- Enter unit price: `75` (£75)
- Enter target monthly units: `200`
- Click "Save & Sync to Cash Burn"
- **Verify:** Toast says "Pricing saved & synced to Cash Burn"
- **Verify:** Volume Sensitivity table appears:
  - Row 1: 100 units (50% of target)
  - Row 2: 200 units (100% of target)
  - Row 3: 400 units (200% of target)
- **Verify:** Each row shows revenue, COGS, gross profit
- **Verify:** Profitable rows in green, loss rows in red
- 📸 Screenshot: Economics tab with volume sensitivity

**D3-S3.2** Verify Cash Burn sync
- Navigate to `/cash-burn/cash-in`
- **Verify:** New revenue item exists: "AquaSmart Controller Revenue" — ~£15,000/month
- **Verify:** Item has product badge
- Navigate to `/cash-burn/cash-out`
- **Verify:** New COGS item exists: "AquaSmart Controller COGS"
- **Verify:** Item has product badge
- Navigate to `/cash-burn`
- **Verify:** Runway has changed (new revenue and costs factored in)
- 📸 Screenshot: Cash In with product revenue item

**D3-S3.3** Test product filter on Cash In
- On `/cash-burn/cash-in`
- **Verify:** "Filter by product:" dropdown appears
- Select "AquaSmart Controller"
- **Verify:** Only the product revenue item shows
- Select "Unattributed"
- **Verify:** Only non-product items show
- Select "All"
- **Verify:** All items show
- 📸 Screenshot: Cash In filtered by product

**D3-S3.4** Test product filter on Cash Out
- On `/cash-burn/cash-out`
- **Verify:** Same filter dropdown exists
- Test same filter flow
- 📸 Screenshot: Cash Out filtered by product

**D3-S3.5** Test "By Product" toggle on Cash Burn overview
- Navigate to `/cash-burn`
- Find the Expense Breakdown donut chart
- **Verify:** "By Category" toggle button visible in top-right of chart
- Click it
- **Verify:** Text changes to "By Product"
- **Verify:** Chart title changes to "Expenses by Product"
- **Verify:** Shows "AquaSmart Controller" and "Unattributed" segments
- Click again to toggle back
- 📸 Screenshot: Donut chart in "By Product" mode

**D3-S3.6** Check Product P&L
- Navigate to `/cash-burn/pnl`
- Click "Product P&L" tab
- **Verify:** Shows AquaSmart Controller with Revenue, COGS, Gross Profit, Margin %
- **Verify:** Shows "Unattributed" section for other items
- 📸 Screenshot: Product P&L tab

### Session 4: Fundability

**D3-S4.1** Score fundability
- Navigate back to product detail → Fundability tab
- Click "Score Fundability"
- Wait 5-10 seconds
- **Verify:** Overall score appears (0-100) with colour:
  - Green if >70, Amber if 45-70, Red if <45
- **Verify:** Investor appetite badge (Strong/Moderate/Weak)
- **Verify:** 5 sub-score bars with labels and weights:
  - Market Size (25%)
  - Margin (25%)
  - Defensibility (20%)
  - Team Readiness (15%)
  - Traction (15%)
- **Verify:** 2-3 improvement suggestions with actionable text
- **Verify:** Each suggestion has "Apply to Design Brief" button (enabled, not disabled)
- 📸 Screenshot: Full fundability tab

**D3-S4.2** Check auto-synthesis
- Click **History** tab
- **Verify:** Synthesis has auto-triggered (Pareto score bars visible)
- **Verify:** Four bars: market, financial, fundability, manufacturing
- **Verify:** "Next Action" callout with specific advice
- If no synthesis, click "Run Synthesis" and wait
- 📸 Screenshot: History tab with synthesis

### Session 5: Fundraise Integration Check

**D3-S5.1** Check Product Readiness on Fundraise
- Navigate to `/fundraise`
- **Verify:** "Product Readiness" card now appears (you have a scored product)
- **Verify:** Shows fundability score and investor appetite
- **Verify:** Links to your product
- 📸 Screenshot: Fundraise with Product Readiness card

**D3-S5.2** Check investor match scores
- Navigate to `/investors`
- **Verify:** Some investor cards may show "Product Fit" or "Partial Fit" badges
- **Verify:** Match scores may have shifted (Product Readiness dimension now active)
- 📸 Screenshot: Investor cards (look for Product Fit badges)

---

## DAY 4: Engineering — The Forge & Design Briefs

*Goal: Apply a fundability suggestion to create a design brief, review with Max CTO, send to Forge, and start a new iteration.*

### Session 1: Fundability → Design Brief

**D4-S1.1** Apply suggestion to design brief
- Navigate to your product → Fundability tab
- Click "Apply to Design Brief" on the first improvement suggestion
- **Verify:** Loading spinner on the button
- Wait 5-10 seconds
- **Verify:** Dialog opens: "Review Design Brief"
- **Verify:** "Max is reviewing feasibility..." loading indicator appears
- Wait a few more seconds
- **Verify:** Max CTO review section appears with:
  - "Feasible" (green) or "Concerns" (amber) badge
  - Written assessment (2-4 sentences)
- **Verify:** Brief content shows:
  - Target Cost
  - Key Requirements
  - Design Priorities
  - Manufacturing Constraints
- 📸 Screenshot: Brief review dialog with Max's review

**D4-S1.2** Approve and send to Forge
- Click "Approve & Send to Forge"
- **Verify:** Loading spinner ("Sending to Forge...")
- **Verify:** Toast: "Design brief approved and sent to The Forge"
- **Verify:** Navigates to The Forge / CAD Lab
- 📸 Screenshot: The Forge with new project

**D4-S1.3** Check iteration recorded
- Navigate back to product → History tab
- **Verify:** New iteration exists (iteration 2)
- **Verify:** Shows the suggestion as hypothesis
- **Verify:** Convergence status badge (probably "Improving")
- **Verify:** Before/after comparison card appears (if 2+ iterations)
- 📸 Screenshot: History tab with iteration 2

### Session 2: The Forge Exploration

**D4-S2.1** Visit The Forge (`/the-forge`)
- Click "The Forge" in sidebar
- **Verify:** Forge landing page loads with:
  - Max (CTO) banner or briefing
  - "Start from a description" card
  - Recent projects grid (including the one from the design brief)
- **Verify:** New project from design brief appears in grid
- 📸 Screenshot: The Forge landing page

**D4-S2.2** Start a new Forge project from description
- Click "Start designing" on the "Start from a description" card
- **Verify:** CAD Lab page opens with description input
- Enter: `Solar-powered smart irrigation controller. IP65 enclosure housing a custom PCB with soil moisture sensor input, cellular modem, and solar charge controller. Target weight under 500g, target cost under £25 per unit.`
- Submit and follow the pipeline through:
  - Research phase
  - Build phase
  - Review phase
- **Verify:** Each phase shows progress and generates content
- Note: This may take several minutes. Observe the pipeline stages.
- 📸 Screenshot: CAD Lab during generation

**D4-S2.3** Explore CAD Lab sub-tools
- If a project exists at sufficient stage, explore:
  - **Specify** tab — module specs, specialist review, costings
  - **Source** tab — supplier matching
  - **Procurement** tab — RFQ management
- **Verify:** Each sub-tool loads without errors
- 📸 Screenshot: One CAD Lab sub-tool

### Session 3: Next Iteration

**D4-S3.1** Run fresh synthesis
- Navigate to product → History tab
- Click "Re-synthesize"
- Wait for completion
- **Verify:** Updated Pareto scores
- **Verify:** Type A improvements listed (aligned — improve multiple dimensions)
- **Verify:** Type B improvements listed (trade-offs)

**D4-S3.2** Start next iteration
- Select 1-2 improvements (checkboxes)
- **Verify:** "Start Next Iteration (N improvements)" button appears
- Click it
- **Verify:** Loading spinner ("Starting next iteration...")
- Wait 10-15 seconds
- **Verify:** Toast: "Next iteration started — new Forge project created"
- **Verify:** Navigates to Forge

**D4-S3.3** Check iteration results
- Navigate back to product → History tab
- **Verify:** Iteration 3 exists
- **Verify:** Before/after comparison shows deltas for all 4 dimensions
- **Verify:** Either celebration (green) or warning (amber) banner appears
- **Verify:** Convergence badge visible
- 📸 Screenshot: History tab with 3 iterations and comparison

---

## DAY 5: Polish — Specialists, Marketplace & Full Circle

*Goal: Use AI specialists, explore the marketplace, promote a Forge project to a product, and complete the loop.*

### Session 1: AI Specialists

**D5-S1.1** Visit Specialists (`/agents`)
- Click "Specialists" in sidebar under WORKSHOP
- **Verify:** 13 AI specialists listed with names, roles, and avatars
- **Verify:** Each has a "Brief" or "Chat" action
- Brief a specialist:
  - Select Priya (Product Development)
  - Ask: `What's the competitive landscape for smart irrigation in East Africa? Who are the main players and what are their weaknesses?`
  - Wait for response
- **Verify:** Specialist responds with relevant, specific content
- 📸 Screenshot: Specialist chat with Priya

**D5-S1.2** Visit Outputs (`/agents/artifacts`)
- Click "Outputs" in sidebar
- **Verify:** Any generated documents/deliverables appear
- 📸 Screenshot: Outputs page

**D5-S1.3** Visit Browse (`/browse`)
- Click "Browse" in sidebar
- **Verify:** Web browsing interface loads
- Search for something relevant: `smart irrigation controller market size Africa`
- **Verify:** Search works and specialist can discuss results
- 📸 Screenshot: Browse page

**D5-S1.4** Visit Inspiration (`/learn`)
- Click "Inspiration" in sidebar
- **Verify:** Techniques and tutorials page loads
- **Verify:** Content categories visible
- Browse a technique or tutorial
- 📸 Screenshot: Inspiration page

### Session 2: Marketplace & Team

**D5-S2.1** Visit Team (`/team`)
- Click "Team" in sidebar
- **Verify:** Team page loads
- Add a team member:
  - Name: `James Ochieng`
  - Role: `Lead Electronics Engineer`
  - Email: any test email
- **Verify:** Team member appears in list
- 📸 Screenshot: Team page with member

**D5-S2.2** Visit Recruits (`/recruits`)
- Click "Recruits" under MARKETPLACE
- **Verify:** Recruits directory loads with fractional executive listings
- Search for: `hardware engineer`
- **Verify:** Search results appear
- 📸 Screenshot: Recruits page

**D5-S2.3** Visit Guild (`/guild`)
- Click "Guild" in sidebar
- **Verify:** Community hub loads with events or networking
- 📸 Screenshot: Guild page

**D5-S2.4** Visit Marketplace (`/marketplace`)
- Click "Marketplace" in sidebar
- **Verify:** Marketplace loads with listings (suppliers, services, products)
- Browse listings, click on one
- **Verify:** Detail page loads with supplier info
- 📸 Screenshot: Marketplace page + a detail page

**D5-S2.5** Visit Marketplace Orders (`/marketplace-orders`)
- Click "Orders" in sidebar
- **Verify:** Orders page loads (may be empty)
- 📸 Screenshot: Orders page

### Session 3: Promote from Forge & Full Circle

**D5-S3.1** Promote a Forge project to Product
- Navigate to `/the-forge`
- Find a completed or in-progress project
- **Verify:** "Promote to Product" button visible on eligible projects
- Click "Promote to Product"
- **Verify:** Toast: "Product created"
- **Verify:** Navigates to new product detail page
- **Verify:** Product has COGS pre-seeded from CAD Lab estimates
- **Verify:** Lifecycle is "Prototyping"
- 📸 Screenshot: New product from Forge promotion

**D5-S3.2** Full circle — second product
- Set pricing on the new product (Economics tab)
- Run market assessment (Market tab)
- Score fundability (Fundability tab)
- Check History tab for synthesis
- **Verify:** The entire loop works on a second product
- 📸 Screenshot: Second product's History tab

### Session 4: Settings & Configuration

**D5-S4.1** Visit Settings (`/settings`)
- Click "Settings" at bottom of sidebar
- **Verify:** Settings page loads
- Check each sub-page:
  - Account (`/settings/account`)
  - Company (`/settings/company`)
  - Billing (`/settings/billing`)
  - Integrations (`/settings/integrations`)
  - Privacy (`/settings/privacy`)
  - Audit Log (`/settings/audit-log`)
  - AI Settings (`/settings/intelligence`)
  - Standards (`/settings/standards`)
- **Verify:** Each page loads without errors
- Update company name to `AquaSmart Technologies`
- **Verify:** Change saves and persists
- 📸 Screenshot: Settings page

**D5-S4.2** Visit Pricing (`/pricing`)
- Click "Pricing" at bottom of sidebar
- **Verify:** Pricing page loads with plan options
- 📸 Screenshot: Pricing page

### Session 5: Business Plan Product Extraction

**D5-S5.1** Upload a business plan to extract products
- Navigate to `/products`
- Click "From Your Business Plan"
- **Verify:** Navigates to `/strategy`
- Upload a PDF business plan that mentions products
- Wait for analysis
- Click "Review & Apply"
- **Verify:** Merge dialog opens with "Products" tab
- Click "Products" tab
- **Verify:** Extracted products appear with name, description
- Adopt at least one product
- Click "Apply"
- **Verify:** Toast confirms creation
- **Verify:** Navigates to `/products`
- **Verify:** New product appears in the list
- 📸 Screenshot: Products page with multiple products

### Session 6: Final Verification — Products List

**D5-S6.1** Check products list with all products
- Navigate to `/products`
- **Verify:** All products appear as cards with:
  - Product name
  - Lifecycle badge (Concept, Prototyping, etc.)
  - COGS and margin summary (if set)
  - Convergence badge (Improving/Plateauing/Converged) — if iterations exist
- **Verify:** Priya briefing at top references product count
- 📸 Screenshot: Products page with all products

**D5-S6.2** Delete a test product
- Click into a product you want to delete
- Click Delete on the detail page
- Confirm deletion
- **Verify:** Redirects to `/products`
- **Verify:** Product removed from list
- Navigate to `/cash-burn/cash-in`
- **Verify:** Product-tagged items still exist but product badge removed

### Session 7: Mobile Spot-Check

**D5-S7.1** Mobile verification (375×812)
- Navigate through these pages on mobile:
  - `/today`
  - `/products`
  - `/products/[id]` (tap through tabs)
  - `/cash-burn`
  - `/investors`
  - `/the-forge`
- **Verify:** No horizontal overflow on any page
- **Verify:** Bottom nav bar always visible
- **Verify:** All interactive elements are tap-friendly (min 44px)
- **Verify:** Modals/dialogs fit the screen
- 📸 Screenshot: One mobile page per section

---

## Summary Checklist

### Pages Visited (check off each one)

**ME Section:**
- [ ] `/today` — Today
- [ ] `/my-profile` — My Profile (edited bio)
- [ ] `/updates` — Comms
- [ ] `/time` — Time (logged an entry)
- [ ] `/google-apps` — Google Apps

**PLAN Section:**
- [ ] `/plan` — Plan intro
- [ ] `/strategy` — Strategy (uploaded business plan)
- [ ] `/knowledge` — Knowledge (added a note)
- [ ] `/new-objectives` — Objectives (created 3)
- [ ] `/new-tasks` — Tasks (created 5, completed 1)
- [ ] `/reports` — Reports (generated one)
- [ ] `/red-team` — Red Team (ran a debate)

**CASH BURN Section:**
- [ ] `/cash-burn` — Cash Burn overview (set balance, tested scenarios, By Product toggle)
- [ ] `/cash-burn/cash-out` — Cash Out (added 7 items, tested product filter)
- [ ] `/cash-burn/cash-in` — Cash In (added 3 items, tested product filter)
- [ ] `/cash-burn/pnl` — P&L (checked Product P&L tab)
- [ ] `/investors` — Investors (browsed, searched, shortlisted 3)
- [ ] `/investors/[id]` — Investor detail
- [ ] `/fundraise` — Fundraise (checked Product Readiness card)

**WORKSHOP Section:**
- [ ] `/the-forge` — The Forge (viewed projects)
- [ ] `/the-forge/cad-lab` — CAD Lab (started a project)
- [ ] `/products` — Products (created from market idea + from Forge promotion)
- [ ] `/products/[id]` — Product detail (all 5 tabs tested)
- [ ] `/team` — Team (added a member)
- [ ] `/agents` — Specialists (briefed Priya)
- [ ] `/agents/artifacts` — Outputs
- [ ] `/browse` — Browse
- [ ] `/learn` — Inspiration

**MARKETPLACE Section:**
- [ ] `/recruits` — Recruits (searched)
- [ ] `/guild` — Guild
- [ ] `/marketplace` — Marketplace (browsed)
- [ ] `/marketplace/[id]` — Marketplace item detail
- [ ] `/marketplace-orders` — Orders

**OTHER:**
- [ ] `/settings` — Settings (all sub-pages)
- [ ] `/pricing` — Pricing

### Features Tested

- [ ] Product creation from Market Idea
- [ ] Product creation from Forge promotion
- [ ] Product creation from Business Plan
- [ ] Market assessment (auto-trigger + manual)
- [ ] Market data validation (badges change)
- [ ] Economics pricing + volume sensitivity
- [ ] Cash Burn sync (revenue + COGS items created)
- [ ] Cash Burn "By Product" donut toggle
- [ ] Cash In/Out product filter dropdown
- [ ] Product P&L tab
- [ ] Fundability scoring + sub-scores
- [ ] "Apply to Design Brief" from suggestion
- [ ] Max CTO feasibility review in dialog
- [ ] "Send to Forge" from brief
- [ ] Synthesis (Pareto bars, Type A/B improvements)
- [ ] "Start Next Iteration" button
- [ ] Iteration timeline with mini Pareto bars
- [ ] Convergence badges on product list
- [ ] Before/after iteration comparison
- [ ] Celebration/warning state after iteration
- [ ] Product Readiness card on Fundraise
- [ ] Product Fit badges on investor cards
- [ ] Product readiness milestone (if all scores >70)
- [ ] Mobile navigation and responsiveness

---

## Reporting Template

For each bug found, create an entry:

```
### Bug [number]: [short title]
- **Step:** D[day]-S[session].[step]
- **Expected:** [what should happen]
- **Actual:** [what actually happened]
- **Screenshot:** [attached]
- **Console errors:** [paste any red errors from browser DevTools]
- **Severity:** Critical / High / Medium / Low
- **Fix applied:** [Yes/No — describe if yes]
```
