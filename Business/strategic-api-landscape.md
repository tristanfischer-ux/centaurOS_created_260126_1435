# Strategic Brief: API Landscape & The Forge Pipeline Upgrade

**Date**: 5 March 2026
**Source**: Image-to-CAD prototyping session (Claude.ai conversation, 5 March 2026)
**Status**: Strategic intelligence — requires evaluation and prioritisation

> **Note:** Priority ordering in this analysis differs from the product roadmap. See product-roadmap.md for the authoritative priority sequence.

---

## Context

A prototyping session attempted to build an image-to-3D-CAD pipeline using Claude's vision API + CadQuery. The experiment produced progressively better results but confirmed that LLM-generated CAD code from image descriptions cannot compete with purpose-built neural 3D reconstruction tools. The session exposed a critical insight: **ForgeOS's CAD Lab ("The Forge") is currently using a first-principles approach (Claude → CadQuery → Modal.com) where purpose-built APIs now exist that would dramatically improve output quality and reduce development effort.**

The conversation surfaced a complete API landscape that maps directly onto ForgeOS's generate → analyse → evaluate → modify → manufacture pipeline.

---

## Key Finding: The Forge's Pipeline Has Five Gaps

ForgeOS currently handles Stage 1 (text → CadQuery → STL/STEP via Modal.com) with a bespoke pipeline. This works for simple parametric geometry but struggles with complex shapes, visual accuracy, and manufacturing readiness. Five API categories would close these gaps:

### Gap 1: Image/Text → 3D Mesh (Visual Prototyping)

**Current state**: No image-to-3D capability. Text-to-CAD via Claude + CadQuery produces basic parametric geometry only.

**APIs identified**:

- **Meshy API** — Image or text prompt → textured 3D mesh (FBX/GLB/OBJ). Credit-based pricing, Pro tier required for API access. Strong for rapid visualisation. Has both image-to-3D and text-to-3D endpoints.
- **Tripo3D API** — Similar capability, claims faster generation times. Worth benchmarking head-to-head against Meshy on hardware components specifically.

**Strategic value for ForgeOS**: These would power a "quick look" feature in The Forge's Concept stage — founders upload a sketch or photo of a competing product and get an explorable 3D mesh within seconds. This is the "wow moment" that demos well and converts free users.

**Limitation**: Output is triangle meshes, not parametric STEP files. Good for visualisation and 3D printing, not for CNC manufacturing or parametric editing.

### Gap 2: Text → Parametric CAD (Manufacturing-Ready)

**Current state**: Claude generates CadQuery Python → Modal.com executes → STL/STEP returned. Works for basic shapes but produces crude geometry for complex assemblies.

**API identified**:

- **Zoo.dev** offers two APIs that work together:
  - **ML API (ML-ephant)** — Text prompt → parametric B-rep STEP file. Also has an iteration endpoint for refining existing models with follow-up prompts. This is the direct CadQuery replacement.
  - **Design API (KittyCAD)** — Lower-level geometry engine for file conversion, B-rep operations, GPU rendering. The ML API calls this under the hood. Only needed directly for building a parametric editor or file conversion utilities.
- **Pricing**: $0.0083/second ($0.50/min) after 20 free minutes ($10 balance). Client libraries for Python, TypeScript, Go, Rust.

**Strategic value for ForgeOS**: This is the single highest-impact integration. The ML API does what ForgeOS's current CadQuery pipeline attempts — but with a purpose-trained geometry model rather than a general LLM writing Python. The output is proper parametric B-rep geometry that a CNC machine can work from directly. The iteration endpoint maps directly to The Forge's existing conversational refinement UX.

**Integration approach**: Replace The Forge's Build stage generation path. User describes a component → ML API generates the STEP file → Three.js renders it → user sends refinement prompts → ML API iteration endpoint updates the model. Keep CadQuery/Modal.com as advanced/fallback mode.

**Cost implications**: At ~$1 per generation (2 min × $0.50/min) and assuming Professional tier users generate 10-20 CAD models/month, that's $10-20/user/month — well within margin. The 20 free minutes ($10 balance) cover evaluation and Free tier users.

### Gap 3: DFM Analysis (Design for Manufacturability)

**Current state**: The Forge's Analysis stage has FEA/stress tools and quality scorecards, but no automated DFM checking against real manufacturing constraints.

**APIs identified**:

- **Dashnode.ai** — Upload CAD file → real-time DFM analysis flagging issues for CNC, milling, turning, sheet metal. API-accessible.
- **Fictiv** — Upload CAD → interactive quote with DFM issue highlighting (wall thickness, draft angles, tolerances, material suitability).
- **CoLab AutoReview** — AI analysis of 3D CAD models for manufacturability, geometry, design intent. Automated markups citing relevant standards.

**Strategic value for ForgeOS**: This directly addresses one of the validated pain points from the PRD — "The CM Rework Loop" pattern where founders discover manufacturing issues late. Automated DFM analysis after every CAD generation catches problems before they become expensive. This differentiates ForgeOS from generic CAD tools.

**Integration approach**: After The Forge generates or imports a STEP file → automatically run DFM analysis → surface issues in the Analysis stage with severity ratings and fix suggestions → feed issues back to the AI specialist (Fang, VP Manufacturing) for contextual guidance.

### Gap 4: Instant Manufacturing Quoting

**Current state**: The Forge's Procurement stage generates RFQs and broadcasts to marketplace suppliers. But founders have no baseline for what things should cost before engaging suppliers.

**APIs identified**:

- **Xometry API** — Upload STEP files → instant price estimates and lead times across CNC, 3D printing, sheet metal, injection moulding. ML-powered quoting engine.
- **Protolabs** — Automated DFM analysis with instant quoting. Graphic representation of problem areas.
- **Hubs (Protolabs Network)** — Similar instant quoting capability.

**Strategic value for ForgeOS**: Instant cost estimation transforms The Forge from a design tool into a business planning tool. Founders can iterate on designs and immediately see cost implications — "if I change this tolerance, it saves £2.40 per unit" or "switching from CNC to injection moulding breaks even at 500 units." This feeds directly into Finn (Finance AI specialist) for unit economics modelling.

**Integration approach**: After CAD generation + DFM check → auto-quote via Xometry API → present cost breakdown in the Procurement stage → allow "what if" cost modelling (change material, quantity, process) → compare API quote against marketplace supplier quotes.

### Gap 5: Geometric Search (Find Existing Parts)

**Current state**: The Forge integrates with Thingiverse for model search/discovery. This is limited to hobbyist/maker models.

**API identified**:

- **Thangs (Physna)** — Upload a 3D model → geometric deep learning search across millions of models from commercial suppliers and component catalogues. Finds where a part could be used, or what off-the-shelf parts match.

**Strategic value for ForgeOS**: This could short-circuit the entire generate-manufacture loop. Before a founder spends time and money generating custom CAD and getting quotes, search for whether a commercially available part already exists that does the job. This aligns with the "Engineering Truth First" philosophy from the monetisation docs — the platform should find the cheapest/fastest path to a working product, even if that means not using ForgeOS's own CAD generation.

**Integration approach**: After concept definition → Thangs search for existing components → present "buy vs. build" comparison → if building, proceed to CAD generation. Also useful in the Mashup stage for finding compatible sub-components.

---

## The Upgraded Pipeline

```
Founder describes product concept
    ↓
[Thangs] Search for existing parts/components → Buy vs. Build decision
    ↓ (if building)
[Meshy/Tripo3D] Quick visual prototype from sketch/photo → "Does this look right?"
    ↓ (confirmed)
[Zoo.dev] Generate parametric STEP file from refined description
    ↓
[Dashnode/CoLab] Automated DFM analysis → flag issues before quoting
    ↓
[Claude + CadQuery] Fix DFM issues iteratively (current pipeline, repurposed for fixes)
    ↓
[Xometry] Instant cost estimate → unit economics modelling with Finn
    ↓
[Marketplace] Broadcast RFQ to vetted suppliers → compare against Xometry baseline
    ↓
Manufacturing order placed via marketplace with Stripe escrow
```

This pipeline turns The Forge from a CAD generation tool into a full concept-to-manufacture decision engine. Each stage adds intelligence that the next stage builds on. The existing CadQuery/Modal.com pipeline doesn't get thrown away — it becomes the iteration/fix engine rather than the primary generation engine.

---

## Cost Model (Preliminary)

| API | Per-Use Cost | Estimated Usage (Pro User/Month) | Monthly Cost/User |
|-----|-------------|----------------------------------|-------------------|
| Meshy/Tripo3D | ~$0.10-0.50/generation | 5-10 visualisations | $0.50-5.00 |
| Zoo.dev | ~$1.00/generation | 3-8 CAD models | $3.00-8.00 |
| Dashnode/CoLab | TBD (likely $0.50-2.00/check) | 3-8 DFM checks | $1.50-16.00 |
| Xometry | Free for quoting | 5-15 quotes | $0.00 |
| Thangs | TBD (pricing not yet published) | 2-5 searches | TBD (pricing not yet published) |
| **Total incremental API cost** | | | **~$5-30/user/month** |

At the Professional tier (£149/mo ≈ $190/mo), this represents 3-16% of revenue — well within the target gross margin of >70%. The Startup tier (£49/mo ≈ $62/mo) is tighter at 8-48%, suggesting API-intensive features should be gated to Professional+ or metered.

---

## Strategic Implications

### For Product Roadmap
1. **Zoo.dev integration is the #1 priority** — it directly upgrades the core value proposition (concept to manufacturing-ready STEP) with minimal architectural change
2. **Meshy/Tripo3D is the #2 priority** — it creates the visual "wow moment" for demos and onboarding
3. **Xometry quoting is #3** — it turns cost estimation from manual to instant and creates a defensible data advantage
4. **DFM analysis is #4** — differentiates from generic CAD but requires the CAD generation to be good first
5. **Thangs geometric search is #5** — high value but less urgent; the marketplace already partially serves this need

### For Business Model
- API costs need to be modelled into the pricing tiers. Current pricing may need adjustment for API-heavy users.
- Consider usage-based pricing for CAD generation (e.g., "5 CAD models/month on Startup, 50 on Professional, unlimited on Enterprise")
- Xometry/Protolabs partnerships could become a revenue source — referral fees or embedded quoting commissions
- The "buy vs. build" recommendation (via Thangs) could drive marketplace GMV

### For Competitive Positioning
- No other platform integrates AI advisory + parametric CAD generation + DFM analysis + instant quoting + marketplace in one flow
- This pipeline creates genuine lock-in — each stage's data feeds the next, making it hard for competitors to replicate individual pieces
- The specialist AI layer (Fang, Max, Chase) wrapping these APIs adds interpretation and context that raw API access doesn't provide

### For Fundraising
- The upgraded pipeline story is significantly more compelling for investors: "We orchestrate 5+ specialised AI/manufacturing APIs into a single workflow that takes hardware founders from idea to purchase order"
- Partnership deals with Zoo.dev, Xometry, Thangs would validate the platform thesis
- Each API integration is a clear milestone that de-risks the technology and can be demonstrated

---

## Immediate Actions

1. **Evaluate Zoo.dev API** — sign up for free tier, test with 5-10 representative hardware components, benchmark output quality against current CadQuery pipeline
2. **Evaluate Meshy API** — test image-to-3D with real product photos, assess mesh quality for The Forge's visualisation needs
3. **Get Xometry API access** — test quoting API with existing STEP files from The Forge
4. **Architecture review** — map how these APIs integrate with The Forge's current stage-based architecture without breaking the existing flow
5. **Pricing model update** — model API costs at each tier and determine whether current pricing absorbs the cost or needs adjustment

---

## What We Learned About Our Own Pipeline

The prototyping session also validated some things about the current CadQuery approach:

**Strengths to keep**:
- CadQuery produces parametric STEP files (not just meshes) — this is the right output format for manufacturing
- Modal.com execution is fast and reliable for running Python code
- The stage-based pipeline (Concept → Build → Analysis → Review → Procurement) is architecturally sound

**Weaknesses confirmed**:
- Claude generating CadQuery from text descriptions struggles with complex geometry, organic shapes, and accurate proportions
- No visual feedback loop — the system can't compare its output against a reference and iterate
- No DFM awareness — geometry is valid CadQuery but may not be manufacturable
- No cost awareness — founders design without knowing cost implications until they get supplier quotes weeks later

The upgraded pipeline addresses all four weaknesses by using specialised APIs where they exist and reserving Claude + CadQuery for the iteration/fix step where LLM flexibility is genuinely the right tool.
