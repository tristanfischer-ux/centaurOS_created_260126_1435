# ForgeOS Circular Optimization Loop — Implementation Prompt Sequence

## Origin

This document was created from a multi-LLM architectural debate (Claude Sonnet as Software Architect, GPT-4o as VC Partner, Gemini as Manufacturing Expert), synthesised into a 7-stage loop with concrete implementation prompts.

The raw debate output is preserved at `docs/MULTI-LLM-DEBATE-RAW.md`.

## How to Use This Document

Execute each prompt in order. Each prompt builds on the previous one's output. After executing each prompt, verify the checklist before proceeding. If verification fails, fix before moving to the next prompt.

The prompts are designed to be run in Claude Code (this terminal). Each one tells you what to build, what files to modify, and how to verify.

---

## THE 7-STAGE LOOP

```
[1] Technical Feasibility → [2] Market Validation → [3] Unit Economics →
[4] Fundability → [5] Cross-System Synthesis → [6] Founder Gate →
[7] Constraint-Aware Redesign → [back to 1 or EXIT]
```

---

## PROMPT 1: Iteration State Object + Design Briefs Table

### What to Build
Create the data infrastructure for tracking iterations and generating design briefs.

### Prompt
```
Create:

1. New migration `supabase/migrations/20260329300000_iteration_tracking.sql`:
   - `product_iterations` table: id, product_id FK, iteration_number,
     pareto_scores JSONB (market, financial, fundability, manufacturing),
     changes_made JSONB, hypothesis text, outcome text,
     convergence_delta float, created_at
   - `design_briefs` table: id, product_id FK, foundry_id,
     brief_content JSONB (target_cost, target_weight, materials_guidance,
     manufacturing_constraints, competitive_benchmarks, design_priorities,
     certification_requirements),
     source text ('market_assessment' | 'fundability_suggestion' | 'manual'),
     status text ('draft' | 'reviewed' | 'sent_to_forge'),
     cad_lab_project_id uuid (set when converted to Forge project),
     reviewed_by text (specialist who reviewed),
     created_at, updated_at

2. TypeScript types in `src/types/product.ts`:
   - ProductIteration interface
   - DesignBrief interface
   - IterationPareto interface { market: number, financial: number,
     fundability: number, manufacturing: number }

3. Server actions in `src/actions/products.ts`:
   - createIteration(productId, scores, changes, hypothesis)
   - getIterationHistory(productId) → ordered list
   - createDesignBrief(productId, content, source)
   - updateDesignBrief(briefId, updates)
   - convertBriefToForge(briefId) → creates CAD Lab project from brief
```

### Verify
- [ ] `npx supabase db push` succeeds
- [ ] `npx tsc --noEmit` passes
- [ ] Can create an iteration record via server action
- [ ] Can create a design brief via server action

---

## PROMPT 2: Market-First Entry Flow (Stage 2 → Stage 1)

### What to Build
The reverse flow: founder describes a market opportunity, system generates a design brief.

### Prompt
```
Build the market-first product creation flow:

1. Enable the "From a Market Idea" card on /products (remove "Coming soon"):
   - Opens a dialog/wizard with:
     Step 1: "Describe your target market" (textarea)
     Step 2: "What problem does your product solve?" (textarea)
     Step 3: "What industry?" (dropdown) + "What stage?" (dropdown)
   - On submit: creates a product in 'concept' lifecycle

2. After product creation, auto-trigger market assessment (existing
   generateMarketAssessment) with the market description as context.

3. After assessment completes, generate a design brief:
   - New server action: generateDesignBriefFromAssessment(productId)
   - Uses Priya (Product Lead) + Fang (VP Manufacturing) as specialists
   - Input: market assessment (TAM, pricing, competitors, segments)
   - Output: design brief with target cost, weight, materials,
     manufacturing constraints, competitive benchmarks
   - Saves to design_briefs table with source='market_assessment'

4. Show the brief on the product detail page (new section or tab)
   - Editable card showing all brief fields
   - "Send to Forge" button that calls convertBriefToForge:
     - Creates a new CAD Lab project
     - Pre-populates subject from brief
     - Links back to product via cad_lab_project_id
     - Navigates to /the-forge/cad-lab/[newProjectId]

5. Create the first iteration record:
   - iteration_number: 1
   - pareto_scores from market assessment
   - hypothesis: "Initial design from market opportunity"
```

### Verify
- [ ] "From a Market Idea" button works (not "Coming soon")
- [ ] Market description → product creation → auto-assessment
- [ ] Design brief generated from assessment
- [ ] "Send to Forge" creates CAD Lab project
- [ ] Iteration #1 recorded

---

## PROMPT 3: Business Plan Entry Flow (Strategy → Products)

### What to Build
Extract products from uploaded business plans and create them in the system.

### Prompt
```
Build the business plan product entry flow:

1. Enable the "From Your Business Plan" card on /products.
   Links to /strategy with a banner: "Upload a business plan to extract products"

2. In the Strategy page's merge review dialog
   (src/components/strategy/merge-review-dialog.tsx):
   - Add a "Products" tab alongside existing Objectives/Hiring/Funding tabs
   - Show extracted products from businessPlanAnalysis.products[]
   - Each product card shows: name, description, target market, revenue model
   - Adopt/Skip toggles for each product (same pattern as objectives)
   - On "Apply": adopted products call createProduct() for each

3. After product creation from business plan:
   - Set lifecycle to 'concept'
   - Link business_plan_analysis_id on the product
   - Auto-trigger market assessment with the extracted description

4. Navigate user to /products after applying
```

### Verify
- [ ] "From Your Business Plan" links to strategy page
- [ ] Business plan upload extracts products (check analyze.ts changes from Phase 4)
- [ ] Merge dialog shows Products tab with adopt/skip
- [ ] Adopted products appear in /products list
- [ ] Market assessment auto-triggers

---

## PROMPT 4: Fundability → Design Brief (Stage 4 → Stage 7 → Stage 1)

### What to Build
Close the loop: fundability suggestions become actionable design briefs.

### Prompt
```
Make "Apply to Design Brief" functional on the Fundability tab:

1. In product-detail-view.tsx, find the disabled "Apply to Design Brief"
   buttons on improvement suggestions. Enable them.

2. On click:
   - Call new server action: generateDesignBriefFromSuggestion(productId, suggestion)
   - Input: the suggestion text + current product data + current design specs
   - Uses Fang (VP Manufacturing) to translate business requirement into
     engineering constraints
   - Example: suggestion "Switch from injection molding to sheet metal"
     → brief with: target_process: 'sheet_metal',
       max_cost_per_unit: current_cogs * 0.6,
       maintain_specs: [existing tolerances, weight limits]
   - Saves design brief with source='fundability_suggestion'

3. After brief generation, show a review dialog:
   - Max (CTO) provides a feasibility assessment (Sonnet call)
   - Shows the brief content + Max's review
   - Founder can approve/reject/modify
   - On approve: "Send to Forge" creates new CAD Lab project

4. Create new iteration record:
   - Increment iteration_number
   - Log the fundability suggestion that triggered it
   - Set hypothesis from the suggestion

5. When the new Forge project completes:
   - Auto-sync COGS back to product unit_economics
   - Auto-trigger market reassessment (prices may need updating)
   - Auto-trigger fundability re-scoring
   - Create iteration record with new Pareto scores
```

### Verify
- [ ] "Apply to Design Brief" button works (not disabled)
- [ ] Brief generated from suggestion
- [ ] Max feasibility review appears
- [ ] "Send to Forge" creates linked project
- [ ] Iteration recorded with correct number

---

## PROMPT 5: Cross-System Synthesis (Stage 5)

### What to Build
The synthesis engine that identifies trade-offs and finds aligned improvements.

### Prompt
```
Build the cross-system synthesis:

1. New server action: synthesizeProductStatus(productId)
   - Fetches: market assessment, unit economics, fundability score,
     linked CAD project (DFM data if available), iteration history
   - Calls Sonnet with ALL data, asking for:
     a) Current Pareto scores [market 0-100, financial 0-100,
        fundability 0-100, manufacturing 0-100]
     b) Active trade-offs (where improving X degrades Y)
     c) Type A improvements (aligned — improve multiple dimensions)
     d) Type B improvements (trade-offs — need founder decision)
     e) Whether current state is a local optimum or needs restructuring
     f) Single most important next action
   - Save Pareto scores to current iteration

2. Add "Synthesis" view to product detail:
   - Show current Pareto as a radar/spider chart (4 axes)
   - Show iteration history as a line chart (Pareto scores over time)
   - List Type A improvements with "Apply" buttons
   - List Type B improvements with trade-off explanation
   - Convergence indicator: "Improving" / "Plateauing" / "Stuck"

3. The synthesis should run automatically after:
   - Market assessment completes
   - Fundability scoring completes
   - Economics tab pricing saved
   - New CAD project design completes

4. Store synthesis results in a new JSONB column on products:
   product_synthesis JSONB
```

### Verify
- [ ] Synthesis generates Pareto scores
- [ ] Radar chart renders with 4 axes
- [ ] Iteration history chart shows score progression
- [ ] Type A and Type B improvements listed
- [ ] Convergence indicator works

---

## PROMPT 6: Investor Matching Integration (Stage 4 enhancement)

### What to Build
Make investor matching aware of product data.

### Prompt
```
Integrate product intelligence into investor matching:

1. In src/lib/investor-match.ts, modify calculateMatchScore():
   - Add new scoring dimension: "Product Readiness" (0-15 points)
   - If the foundry has products with fundability scores:
     * Best product margin_score > 70: +5 points
     * Best product market_size_score > 70: +5 points
     * Best product traction_score > 50: +5 points
   - If no products: 0 points (doesn't penalize)
   - Reduce existing dimension weights to accommodate (total stays 100)

2. On the Investors page, add a "Product Fit" badge to investor cards
   when the user has products:
   - Green if product's target market overlaps investor's sectors
   - Amber if partial overlap
   - Hidden if no products

3. On the Fundraise dashboard:
   - Add "Product Readiness" card showing:
     * Best product's overall fundability score
     * Lifecycle stage
     * Key improvement needed
   - Link to /products/[id]/fundability tab

4. Fetch products in the investor page server component and pass to
   the client components that need product data.
```

### Verify
- [ ] Investor match scores change when product data exists
- [ ] "Product Fit" badge appears on investor cards
- [ ] Fundraise dashboard shows Product Readiness card

---

## PROMPT 7: Product P&L + Cash Burn Integration (Stage 3 enhancement)

### What to Build
Product-level financial views in Cash Burn.

### Prompt
```
Build product-aware financial views:

1. P&L page — add "Product P&L" tab:
   - Filter cash_in_items and cash_out_items by product_id
   - Show income statement per product (revenue, COGS, gross profit)
   - Show "Unattributed" section for items without product_id
   - Reuse existing IncomeStatementTable component with filtered data

2. Cash Burn overview — add "By Product" toggle:
   - When toggled, group the burn chart by product
   - Each product is a different color in the stacked chart
   - Unattributed items shown in grey

3. Cash Out / Cash In pages:
   - Show product name badge on items that have product_id
   - Filter dropdown: "All" | "Product X" | "Product Y" | "Unattributed"

4. Volume sensitivity from Economics tab should also appear in the
   Cash Burn view when viewing a product's items.
```

### Verify
- [ ] "Product P&L" tab shows per-product breakdown
- [ ] "By Product" toggle on Cash Burn overview works
- [ ] Product badges appear on tagged items
- [ ] Filter by product works on Cash In/Cash Out

---

## PROMPT 8: Iteration History + Convergence Detection (Stage 5+6)

### What to Build
Track progress across iterations and detect when to stop.

### Prompt
```
Build the iteration tracking system:

1. Enable the "History" tab on product detail:
   - Timeline view showing each iteration with:
     * Iteration number and date
     * Pareto scores (radar chart mini)
     * What changed (from changes_made JSONB)
     * The hypothesis tested
     * The outcome
   - Show convergence trend: are scores improving, flat, or declining?

2. Convergence detection logic:
   - After each synthesis (Prompt 5), compare current Pareto to previous
   - If ALL dimensions improved: "Strong progress"
   - If SOME improved, none declined: "Moderate progress"
   - If improvement < 5% on ALL dimensions: "Plateauing — consider pivot"
   - If ANY dimension declined: "Regression — review last change"
   - If 3+ iterations with < 5% total improvement: "Converged — good enough
     or fundamental change needed"

3. Priya's briefing on the product page should reference iteration progress:
   - "Iteration 3: you've improved fundability by 22 points since version 1.
     Margins are the last barrier — Fang suggests sheet metal could close the gap."

4. Add convergence status to the product list page:
   - Badge: "Improving" (green) / "Plateauing" (amber) / "Converged" (blue)
```

### Verify
- [ ] History tab shows iteration timeline
- [ ] Convergence detection produces correct status
- [ ] Priya references iteration progress in briefings
- [ ] Convergence badges appear on product list

---

## PROMPT 9: The Autonomous "Next Iteration" Button

### What to Build
One-click iteration that synthesises all suggestions into a new design cycle.

### Prompt
```
Build the "Start Next Iteration" feature:

1. On the product detail Synthesis view, add a "Start Next Iteration" button
   that appears when Type A improvements exist or the founder has approved
   Type B trade-offs.

2. On click:
   a) Gather all approved improvements from the synthesis
   b) Call generateDesignBriefFromSynthesis(productId, improvements[])
      - Combines all improvement actions into one coherent design brief
      - Prioritizes by expected impact
      - Includes constraints from previous iterations (things that worked)
   c) Max reviews the brief (auto Sonnet call, shown to user)
   d) On founder approval:
      - Creates new Forge project from brief
      - Creates new iteration record with hypothesis
      - Advances product lifecycle appropriately
   e) When Forge completes: auto-triggers the full reassessment chain:
      COGS sync → Market reassess → Economics recalc → Fundability rescore
      → Synthesis → Present results

3. The system should present the results of the new iteration alongside
   the previous one: "Here's how version 3 compares to version 2"
   - Pareto comparison (before/after for each dimension)
   - Net improvement or regression per dimension
   - Updated convergence status

4. If the new iteration IMPROVED all dimensions:
   - Celebration state: "All dimensions improved! Consider one more
     iteration or declare this product ready."

5. If the new iteration REGRESSED on any dimension:
   - Warning state: "Margins improved but fundability dropped. The
     cost reduction may have introduced a scalability concern. Review
     the trade-off before proceeding."
```

### Verify
- [ ] "Start Next Iteration" button appears when improvements exist
- [ ] Brief generated from synthesis improvements
- [ ] Max review shown
- [ ] Forge project created on approval
- [ ] Auto-reassessment chain fires on completion
- [ ] Before/after comparison shown
- [ ] Convergence status updates correctly

---

## PROMPT 10: Integration Test — Full Loop

### What to Build
End-to-end validation of the complete circular loop.

### Prompt
```
Create a comprehensive integration test that exercises the full loop:

1. Create a test script at scripts/test-circular-loop.ts that:

   a) Entry: Create product from market idea
      "Smart irrigation controller for smallholder farmers in Sub-Saharan Africa"

   b) Stage 2: Auto market assessment
      - Verify TAM/SAM/SOM generated
      - Verify pricing analysis exists

   c) Stage 1: Generate design brief from assessment
      - Verify target cost, weight, materials constraints
      - Convert to Forge project (mock the CAD generation)
      - Seed COGS from mock estimates

   d) Stage 3: Set pricing, sync to Cash Burn
      - Verify revenue + COGS items created
      - Verify volume sensitivity computed

   e) Stage 4: Score fundability
      - Verify 5 sub-scores
      - Verify improvement suggestions generated

   f) Stage 5: Run synthesis
      - Verify Pareto scores computed
      - Verify Type A/B improvements identified

   g) Stage 7: Apply top suggestion → new design brief
      - Verify iteration #2 created
      - Verify brief incorporates suggestion

   h) Verify iteration history shows 2 entries
   i) Verify convergence status

   j) Compare iteration 1 vs iteration 2 Pareto scores
      - At least one dimension should improve

2. This test should be runnable from terminal and produce a clear
   pass/fail report. It can use the Supabase service role key for
   database access and the Anthropic API for AI calls.
```

### Verify
- [ ] Full loop executes without errors
- [ ] All stages produce expected outputs
- [ ] Iteration 2 shows measurable improvement over iteration 1
- [ ] Convergence detection works across iterations
- [ ] All data persists correctly in database

---

## Success Criteria for the Complete System

The circular optimization loop is **done** when a founder can:

1. Start with nothing more than "I want to build smart irrigation controllers for African farmers"
2. Get a market assessment, design brief, and engineering project created automatically
3. See the product's scores across market/financial/fundability/manufacturing
4. Click "Start Next Iteration" and get a redesigned version that's measurably better
5. Repeat until all four Pareto dimensions exceed 70/100
6. At that point, the system says: "This product is ready. Your best-fit investors are [X, Y, Z]. Your runway at current pricing is [N months]. Here's your pitch deck structure."

That's the vision. These 10 prompts build it.
