# Product Intelligence Layer — Gap Analysis

## The Vision

A **circular optimization loop** where a founder iterates through:

```
Idea → Product Design → Market Assessment → Financial Model → Fundability Score
  ↑                                                                    |
  └────── "Not good enough" → Specific suggestions → Redesign ────────┘
```

The loop runs until the product is: massively profitable, manufacturable, has huge investor appetite, and has great economics. The system guides each iteration with specific, data-driven feedback.

## What We Built (Honest Assessment)

### ✅ Working End-to-End
- **Products table**: Bridge entity connecting all systems
- **Promote from Forge**: CAD Lab project → Product with seeded COGS
- **Economics tab**: Price/volume → auto-sync to Cash Burn (revenue + COGS items)
- **Market Assessment**: Sonnet-powered, co-created with validation tracking
- **Fundability Scoring**: 5 weighted sub-scores + Haiku improvement suggestions
- **Business plan product extraction**: Products parsed from uploaded plans (data only)
- **Red team hardened**: FK constraints, foundry isolation, duplicate prevention, error checking

### ⚠️ Scaffolded But Not Functional
- **"From a Market Idea"**: Button exists, says "Coming soon"
- **"From Your Business Plan"**: Button exists, says "Coming soon"
- **"Apply to Design Brief"**: Buttons on fundability suggestions, disabled
- **Product P&L tab**: Planned in Phase 2, never built
- **Cash Burn "By Product" toggle**: Planned in Phase 2, never built

### ❌ Not Built At All
- **Market → Design Brief → Forge**: The reverse flow doesn't exist
- **Investor matching ↔ Products**: `calculateMatchScore` is unchanged
- **Fundraise dashboard product readiness**: Never added
- **Iteration tracking**: No history of "version 1 scored 45, version 2 scored 62"
- **The autonomous loop**: No system guidance saying "here's what to change next, reassess when ready"
- **Design briefs table**: Schema designed but never created
- **Cross-system triggers**: No automatic re-scoring when design changes

## The Critical Missing Pieces (in priority order)

### 1. The Reverse Flow: Fundability → Design Brief → Forge
**Why it matters**: This is the ENTIRE point of the circular loop. Without it, the system is one-directional. You assess a product but can't act on the suggestions.

**What's needed**:
- `design_briefs` table (schema already designed in the plan)
- "Apply to Design Brief" becomes functional — takes a fundability suggestion and generates a design brief with target specs (cost target, material constraints, manufacturing process change)
- Brief-to-Forge conversion: create a new CAD Lab project pre-populated with the brief's requirements
- Max (CTO) feasibility review on the brief before it enters the pipeline

### 2. Market-First Entry Flow
**Why it matters**: Many founders start with "I think there's an opportunity in X" not "I've already designed a widget." This is probably the more common entry point.

**What's needed**:
- User describes target market/customer/problem
- Priya generates a market assessment from the description
- Assessment feeds into a design brief: "To serve this market, you need a product that costs under £X, weighs under Y kg, and handles Z"
- Brief becomes a Forge project

### 3. Investor Matching Integration
**Why it matters**: The fundability score exists but doesn't actually change investor matching. A product with 85/100 fundability and 40% margins should rank differently with investors than one with 30/100 and 5% margins.

**What's needed**:
- Extend `calculateMatchScore()` in `investor-match.ts` to factor in best product's margin score, market size score, and traction score
- Add "Product Fit" indicator on investor cards
- Fundraise dashboard shows aggregate product readiness

### 4. Product P&L + Cash Burn Integration
**Why it matters**: The Economics tab creates Cash Burn items, but there's no way to see product-specific financials in the P&L page or Cash Burn overview.

**What's needed**:
- P&L page "Product P&L" tab filtering by product_id
- Cash Burn overview "By Product" toggle
- Revenue/cost breakdown per product

### 5. Iteration History + Loop Guidance
**Why it matters**: Without tracking iterations, the founder can't see progress. "Version 1 scored 45, version 2 scored 62, version 3 scored 78" is motivating and directional.

**What's needed**:
- History tab on product detail showing: each assessment, each score, each design revision
- A "loop status" indicator: "3 iterations, improving" or "2 iterations, stuck on margins"
- Priya's briefing should reference iteration progress: "You've improved 17 points since your first assessment — margins are the last barrier"

### 6. The Autonomous Loop
**Why it matters**: This is the endgame — the system proactively guides the founder through iterations without them having to figure out what to do next.

**What's needed**:
- After scoring, the system automatically identifies the weakest dimension
- Generates a specific action plan: "Reduce COGS by switching from CNC to sheet metal (Fang's suggestion), then increase price to £X (Priya's market data supports this)"
- One-click "Start next iteration" that creates a new design brief incorporating all suggestions
- When the Forge design completes, auto-assess and auto-score
- Dashboard showing the optimization trajectory

## How The Systems Should Talk To Each Other

```
┌─────────────────────────────────────────────────────────────────┐
│                        STRATEGY                                  │
│  Business Plan → extracts products → creates Product entities    │
│  Objectives → can reference products as goals                    │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        PRODUCTS (Hub)                            │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│  │ Market   │──→│ Economics│──→│Fundabilty│──→│ Design   │    │
│  │Assessment│   │          │   │ Score    │   │ Brief    │    │
│  └──────────┘   └──────────┘   └──────────┘   └────┬─────┘    │
│       ↑                                              │          │
│       │              ITERATION LOOP                  │          │
│       └──────────────────────────────────────────────┘          │
└──────┬──────────────┬──────────────────┬────────────────────────┘
       │              │                  │
       ▼              ▼                  ▼
┌──────────┐   ┌──────────────┐   ┌──────────────┐
│THE FORGE │   │  CASH BURN   │   │  INVESTORS   │
│          │   │              │   │              │
│CAD Lab   │   │Revenue items │   │Match scoring │
│project   │◄──│COGS items    │   │factors in    │
│linked to │   │Product P&L   │   │product margin│
│product   │   │By-product    │   │market size   │
│          │   │breakdown     │   │traction      │
└──────────┘   └──────────────┘   └──────────────┘
```

## What I'd Build Next (If Continuing)

### Immediate (closes the loop):
1. **Design briefs**: Enable "Apply to Design Brief" → generate brief from suggestion → review → send to Forge
2. **Market-first wizard**: Description → Assessment → Brief → Forge
3. **Business plan product merge**: Merge dialog "Products" tab → adopt extracted products

### Short term (makes the data flow):
4. **Investor matching integration**: Product signals in `calculateMatchScore`
5. **Product P&L tab**: Filter CashIn/CashOut by product_id
6. **Cash Burn "By Product" toggle**

### Medium term (enables iteration):
7. **Iteration history**: Track each assessment/score as versions
8. **Loop status dashboard**: Show optimization trajectory
9. **Auto-reassess**: When Forge design updates, auto-refresh market + fundability

### Long term (autonomous loop):
10. **One-click "Next Iteration"**: Synthesize all suggestions → brief → Forge
11. **Convergence detection**: System recognises when metrics are plateauing
12. **Multi-product portfolio optimization**: Balance across products
