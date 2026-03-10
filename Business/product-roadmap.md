# ForgeOS — Product Roadmap: The Forge Pipeline Upgrade

**Date**: 5 March 2026
**Owner**: Tristan Fischer
**Status**: Proposed — priorities validated, implementation planning needed

---

## Strategic Context

The Forge's current pipeline uses Claude to generate CadQuery Python, which Modal.com executes to produce STL/STEP files. This works for simple parametric geometry but has a fundamental limitation: Claude doesn't have spatial reasoning. It writes code that happens to produce geometry, but it can't "see" shapes. Complex geometry comes out wrong, and the refinement loop is just prompt-engineering around a model that can't reason about 3D space.

Purpose-built APIs now exist that solve this at the model architecture level. The roadmap below replaces the weakest link (geometry generation) while keeping what works (the stage-based pipeline, Three.js viewer, specialist AI layer, marketplace integration).

---

## Priority 1: Zoo.dev Integration (Critical Path)

**What**: Replace CadQuery-based CAD generation with Zoo.dev's ML API (ML-ephant) for manufacturing-grade STEP output.

**Zoo.dev has two APIs — we need the ML API first:**
- **ML API (ML-ephant)** — text-to-CAD generation + iteration. Takes a text prompt, returns a STEP file. Also has a refinement endpoint for iterating on existing models with follow-up prompts. This directly replaces Claude → CadQuery → Modal.com.
- **Design API (KittyCAD)** — lower-level geometry engine for file conversion, B-rep operations, GPU rendering. The ML API calls this under the hood. Only needed directly if building a parametric editor into The Forge later.

**Why this is the #1 priority**: The ML API has a geometry engine behind the model — it's not an LLM writing code, it's a purpose-trained system that understands B-rep geometry natively. This is the difference between "demo that works for cubes" and "manufacturing tool that works for real parts."

**Output**: Parametric B-rep STEP files. The ML API also supports iteration — send a follow-up prompt referencing an existing model to refine it, which maps directly to The Forge's conversational refinement UX.

**Architecture decision — KCL vs CadQuery in the workbench**:

The existing CAD Workbench (Monaco editor, parameter extraction, conversational refinement) is built around CadQuery Python. Two options:

- **(a) Treat Zoo output as black-box STEP** — skip the code editing UX, just show the 3D preview and let users refine via natural language prompts back to Zoo. Simpler, probably right for v1. Users care about the part, not the code.
- **(b) Expose KCL in the editor** — full parametric editing capability, but requires learning/supporting a new language in the workbench.

**Recommendation**: Option (a) for initial integration. Keep the CadQuery editor as an "advanced mode" fallback for users who want code-level control. Revisit KCL editor support based on user demand.

**Integration points**:
- The Forge → Build stage: Zoo.dev API replaces Claude + CadQuery as primary generation path
- Conversational refinement: User feedback → re-prompt Zoo.dev (not Claude writing CadQuery fixes)
- Three.js viewer: Unchanged — still renders the STEP/STL output
- Specialist layer: Max (CTO) and Fang (VP Manufacturing) provide contextual guidance on top of Zoo output

**Cost**: $0.0083/second ($0.50/min). 20 free minutes included ($10 balance). At ~2 min per generation, that's ~$1/model. Professional tier usage (10-20 CAD models/month) = $10-20/user/month — ~5-11% of the £149/mo subscription (at current exchange rates). Acceptable.

**API endpoints to integrate**:
- `POST /ai/text-to-cad/{output_format}` — primary generation (text prompt + desired format → STEP file)
- `POST /ml/text-to-cad/multi-file/iteration` — refinement (existing model + follow-up prompt → updated STEP). Note: the single-file `/ml/text-to-cad/iteration` endpoint is **deprecated** (checked March 2026 — verify current status) — Zoo has moved to multi-file iteration, indicating assembly-level support
- `GET /ws/ml/copilot` — websocket for conversational Zookeeper agent (potential integration for advanced users)
- `POST /ml/kcl/completions` — KCL code completions (future: if exposing KCL editor in The Forge)
- Client libraries available in Python, TypeScript, Go, Rust

**Success criteria**: Zoo.dev output for 10 representative hardware components (enclosure, bracket, gear, heat sink, PCB mount, phone case, drone frame, sensor housing, connector plate, handle) is measurably better than current CadQuery pipeline in: geometric accuracy, surface quality, manufacturing readiness.

---

## Priority 2: DFM Analysis — Dashnode or CoLab (High Leverage)

**What**: Automated Design for Manufacturability checking after CAD generation, before costing.

**Why this is #2**: The specialist review stage (Claude reviewing its own CAD work) catches design intent issues but fundamentally cannot catch real manufacturing problems. It doesn't know if a wall is too thin for CNC, if a draft angle is missing for injection moulding, or if an undercut makes a part unmoldable. A DFM engine working on an actual STEP file catches what Claude never could.

**This directly addresses validated pain points**: The "FCC Surprise" and "CM Rework Loop" scenarios from the PRD — where founders discover manufacturing issues late and expensively — are exactly what automated DFM prevents.

**APIs to evaluate**:
- **Dashnode.ai** — real-time DFM analysis for CNC, milling, turning, sheet metal
- **CoLab AutoReview** — AI analysis with automated markups citing manufacturing standards
- **Fictiv** — DFM + quoting combined (overlaps with Priority 3)

**Integration points**:
- The Forge → Analysis stage: DFM report auto-generated after every STEP file creation
- Severity ratings feed into Fang (VP Manufacturing) for contextual "here's what this means for your project" guidance
- DFM issues create actionable fix suggestions that loop back to Zoo.dev for geometry revision
- DFM pass/fail gates the Procurement stage — can't generate an RFQ for an unmanufacturable part

**Success criteria**: Catches ≥80% of the manufacturability issues that would currently be discovered only when a CM reviews the RFQ.

---

## Priority 3: Xometry Quoting API (Precise Costing)

**What**: Instant manufacturing quotes from real STEP files — CNC, 3D printing, sheet metal, injection moulding.

**Why this is #3 (not #1)**: The current Haiku-based AI cost estimator serves a different purpose — it gives ballpark costs from diagnostic answers alone, no STEP file needed. It's the "should I even pursue this?" filter. Xometry needs an actual STEP file and gives precise per-unit pricing. These aren't competing — they're sequential stages.

**Pipeline position**:
```
Concept stage → AI estimate (Haiku, from text description) → "Worth pursuing?"
    ↓ yes
Build stage → Zoo.dev generates STEP → DFM check (Dashnode)
    ↓ passes
Procurement stage → Xometry API quote (from STEP) → "Real cost at X units"
    ↓
Compare against marketplace supplier quotes
```

**Integration points**:
- The Forge → Procurement stage: "Get Instant Quote" button alongside "Broadcast RFQ"
- What-if modelling: change material, quantity, process → see cost impact immediately
- Feeds Finn (Finance specialist) for unit economics and margin analysis
- Xometry quote serves as baseline when evaluating marketplace supplier responses

**Cost**: Xometry quoting API is free (they monetise when users place orders). Potential for referral revenue if ForgeOS users place orders through the integration.

**Success criteria**: Quotes returned in <30 seconds, pricing within 15% of final order cost for standard processes.

---

## Priority 4: Meshy/Tripo3D (3D Visualisation)

**What**: Image or text → textured 3D mesh for rapid visual prototyping.

**Why this is lower priority**: The existing hero image pipeline (Opus crafting visual descriptions → DALL-E rendering) already serves the visualisation purpose well for the Concept stage. Meshy/Tripo would add explorable 3D preview on top — genuinely useful for spatial understanding, but not critical path.

**When it becomes higher priority**: If user research shows that founders struggle with 2D hero images and need rotatable 3D to make design decisions, or if a "wow moment" 3D preview significantly improves free → paid conversion.

**Integration point**: The Forge → Concept stage, parallel to hero image generation. "See it in 3D" button alongside the blueprint images.

---

## Priority 5: Thangs Geometric Search (Sub-Component Sourcing)

**What**: Upload a 3D model → find commercially available parts that match or are similar.

**Why this is lowest priority**: Thangs has a narrower sweet spot than initially assessed. It's strong for standard mechanical components — bearings, brackets, enclosures, fasteners, connectors. But ForgeOS's core use case is novel product designs, where off-the-shelf alternatives don't exist for the primary assembly. Thangs won't short-circuit the generate step for most users.

**Where it adds value**: Sub-component search during the Sourcing stage. "You designed a custom mounting bracket — here are three off-the-shelf alternatives that would work and cost 60% less." This is a cost optimisation tool, not a generation replacement.

**Integration point**: The Forge → Procurement stage, as a "Find Existing Parts" option for individual components within an assembly.

---

## What Stays the Same

- **Stage-based pipeline architecture** (Concept → Build → Analysis → Review → Procurement → Templates) — this is sound
- **Three.js viewer** — still renders whatever STEP/STL the APIs produce
- **Specialist AI layer** — Max, Fang, Chase, Finn still provide contextual interpretation of API outputs
- **Marketplace + Stripe escrow** — still handles the actual commerce
- **AI cost estimation (Haiku)** — stays as the early-stage "ballpark" tool; Xometry adds precision later
- **CadQuery/Modal.com** — kept as advanced mode / fallback, not thrown away
- **Hero image generation** (Opus → DALL-E) — stays for Concept stage visualisation

---

## The Transformative Combination

Zoo.dev + Dashnode alone would upgrade the pipeline from "AI writes code that might produce geometry" to "purpose-built model produces parametric STEP → real DFM validation." That's the leap from demo to manufacturing tool.

Adding Xometry quoting on top means founders go from idea → manufacturing-ready STEP → verified manufacturable → priced and quoted — in one session, in one platform. No other tool does this.

---

## Implementation Sequence

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **Evaluate** | 1-2 weeks | Sign up for Zoo.dev, Dashnode, Xometry. Benchmark Zoo.dev against CadQuery on 10 test components. Assess DFM output quality. |
| **Integrate Zoo.dev** | 2-3 weeks | New Build stage backend, STEP-only viewer mode, natural language refinement loop. Keep CadQuery as fallback. |
| **Integrate Dashnode** | 1-2 weeks | Post-generation DFM check, severity ratings, fix suggestions, Analysis stage integration. |
| **Integrate Xometry** | 1-2 weeks | Instant quote button in Procurement, what-if modelling, cost comparison with marketplace quotes. |
| **Polish & test** | 1-2 weeks | End-to-end pipeline testing, cost monitoring, usage metering, tier gating. |
| **Total** | 6-10 weeks | Full upgraded pipeline live |

---

## Open Questions

1. **Zoo.dev rate limits and reliability** — is the API production-ready for a SaaS platform with multiple concurrent users?
2. **KCL ecosystem maturity** — if we ever move to option (b) (exposing KCL in the editor), is the language stable enough?
3. **Dashnode vs CoLab vs Fictiv** — which DFM tool has the best API, broadest process coverage, and most actionable output?
4. **Pricing tier adjustment** — do current tier limits (20/100/500/10000 AI tasks) need recalibration given the higher per-task API cost?
5. **Xometry revenue share** — is there a referral or affiliate programme that could offset integration costs?
