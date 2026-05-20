# Iter-9 Strategic Plan v2 — Council-Revised

**Status:** Council-validated draft. Supersedes v1 (`ITER9-STRATEGIC-PLAN-DRAFT.md`).
**Council:** Grok 4.3 + Opus 4.7 + Gemini 3.5 Flash + GPT-5.5 (4 of 4 landed, $0.30 total).

## What v1 got right
- W1 (Deterministic tools) as the foundation — all 4 agreed.
- Move from probabilistic generation to tool-grounded engineering.
- Surface trade-offs in CAPEX/OPEX/Reliability not speed/cost/quality.

## What v1 got wrong (council convergence)

**1. Missing W0 — Canonical Object Model.** All 4 council members flag this. Tristan asked specifically about "real-world objects, reasoning, logic" — v1 jumped to tools without a typed object graph. Without W0, tools answer local questions but the chain still assembles nonsense.

**2. Missing W7 — In-Context Learning via curated exemplar packs.** 3 of 4 want this separate (Opus says embed in W3; 3 say its own workstream). Generic RAG ≠ engineering exemplars.

**3. W6 should be SPLIT into W6-lite (regression harness, foundational) and W6-full (continuous learning, last).** GPT-5.5 strong on this: "Without [the harness], W1/W3/W5 can silently improve VF while breaking BESS/heat pumps."

**4. Tools must be IN-FLIGHT during Phase 1 (function-calling), not just post-hoc verification.** Gemini: "The generator must use `psychrometrics.calc` to *determine* the airflow, not guess the airflow and get corrected later."

**5. W3 (MoE) cost claim was wrong.** I claimed 8 specialists cheaper than 4 generics; actual cost with realistic Opus/GPT-5.5 rates is ~$2/run (similar to current). The case is QUALITY not cost.

**6. W2 (Multimodal) overestimated in value, underestimated in effort.** Vision LLMs can catch class/category mismatches (cabinet vs container) but can't catch refrigerant charge, COP, voltage drop. Effort to curate 20 classes is months, not weeks.

**7. Tiered rollout missing.** 20 classes are not equal — BESS mature, VF was missing K10. Start with 2-3 classes, scale once pattern proven.

**8. Online vs offline path separation missing.** Current ~30-min run. New workstreams can push to 45-90 min without aggressive caching + parallelism. Hard rule: online path = cached/parallel/deterministic; offline path = telemetry/distillation/learning.

---

## Revised workstream catalogue

### W6-lite — Regression harness + golden briefs (FOUNDATIONAL)
**Why first:** without a way to measure regressions, every other workstream silently breaks something.
- 5 golden briefs per top-3 class (VF, BESS, heatpump-residential) = 15 briefs total
- Expected invariants per brief: envelope category, fan feasibility, dehumidification range, LED W/m², BoM cost band, supplier category, render category
- Diff-on-commit: PDF outputs structurally compared (gate-pass counts, BoM total within envelope, manual-review badge counts, performance card warnings)
- Effort: 1 week (mostly brief authoring + invariant capture)
- Cost: ~$1 per regression suite run × ~50 runs/week = $50/week

### W0 — Canonical Object Model (NEW)
**The piece v1 missed.** Tristan's "real-world objects, reasoning, logic" question — answered properly.
- Per product class, a typed object graph: `archetype → modules → components → interfaces → constraints`
- VF example (council convergence on these names):
  - `grow_chamber`, `racking`, `LED_array`, `air_handling_unit`, `dehumidification_loop`, `nutrient_reservoir`, `irrigation_manifold`, `control_panel`, `fire_detection`, `drainage`
- Each object has: dimensions, mass, power, flow, thermal load, service clearances, interfaces, valid suppliers, valid standards, allowed archetypes
- Current `class-priors.ts` / `class-connections.ts` / etc. become VIEWS over this single typed model, not separate scattered registries
- Effort: 2 weeks for 3 classes (VF + BESS + heatpump)
- Cost: zero recurring (data structure, not LLM calls)

### W1 — Deterministic engineering tools
**Narrowed from v1.** Council all say 8 tools at once = fantasy. Start with 2-3, validate the pattern.
- Week-1 scope: `psychrometrics.calc`, `fan_curve.evaluate`, `voltage_drop.cable` (3 tools, 3 classes covered)
- **Critical change**: tools called via OpenAI function-calling at Phase 1 (Generator) AND in Phase 2 gates. Generator REQUESTS the airflow calculation — doesn't guess and get corrected.
- Caching: by `(tool, inputs-hash)` — same input → same output, no re-compute
- Provenance: every tool returns `{value, source, uncertainty}` — no "fake determinism"
- Effort: 2-3 days per tool × 3 tools = ~1.5 weeks
- Cost: zero recurring (subprocess calls)

### W4 — Adversarial dev (moves up to position 4)
**Why earlier than v1:** every W0/W1 change risks regression; adversarial must protect early commits, not arrive late.
- Steel-man + red-team only on changes to: arithmetic gates, class registries, Engine B, physics critic, object model
- Paired with W6-lite regression tests — adversarial review supplements, doesn't replace
- Effort: 2-3 days infrastructure
- Cost: $0.40 per critical commit

### W3 — Mixture of Domain Experts
**Quality not cost.** Replace generic R1-R4 with domain specialists.
- 8 specialists per the v1 roster (HVAC, Electrical, Fluid, Compliance, Safety, BoM/Cost, Suppliers, Structural)
- Each specialist gets W0 object graph + W1 tool outputs + W7 exemplar pack as context
- Mediation round when 2 specialists disagree
- **Cost reality**: ~$2/run vs current ~$2.50/run — comparable, not cheaper. Justification is QUALITY.
- Effort: ~1.5 weeks (per-domain prompts + orchestration)

### W7 — In-Context Learning via curated exemplar packs (NEW)
**3 of 4 council members wanted this separate.**
- Per class/archetype, a small curated pack: 2-3 golden reports, 3-5 known-good module decompositions, accepted BoM patterns, rejected failure examples, supplier examples, standards anchors
- Retrieved by `(class, envelope, scale)` similarity at chain start
- Injected as explicit "gold-standard" templates into Generator + each specialist's context
- NOT generic RAG — curated, class-specific, refreshed quarterly
- Effort: 1 day per class × 3 classes = 0.5 week
- Cost: low (vector index storage + retrieval)

### W5 — Pattern distillation (refined)
**Statistical significance was missing in v1.**
- Need ≥20 runs per class for meaningful distillation
- Only fires on telemetry that includes: tool calls (not just LLM outputs), expert disagreements, user override signals
- Quarterly batch — diffs proposed for human review, not auto-merged
- Effort: 1 week
- Cost: low (batch compute)

### W2 — Multimodal reference grounding (scoped down)
**3 classes initial, not 20.** Tristan was right to ask about this but council right that mass curation is the failure mode.
- 3 classes only: VF, BESS, heatpump-residential. Each = 8-12 annotated reference images.
- Used ONLY for class/category mismatch detection (cabinet vs container), NOT engineering correctness
- Effort: 1-2 weeks (image curation is slow, need supplier permissions where applicable)
- Cost: $0.20 per chain run

### W6-full — Continuous learning (LAST, careful)
**GPT-5.5: "Engineering systems should not auto-learn into production."**
- Telemetry: ALL chain runs write structured telemetry (Phase durations, gate pass/fail, council findings, cost, render time, tool calls, expert disagreements)
- Drift detection: weekly digest to Tristan — "VF gate-pass rate dropped from 87% to 74%, BESS BoM drifted +18% WoW"
- User-signal capture: brief revisions, supplier overrides, cost-band manual edits — flagged for review, NOT auto-applied
- **Human-approved changes only.** No automatic registry mutation.
- Effort: 2-3 weeks (telemetry + drift + dashboards)

---

## Council-Revised Sequencing

| # | Workstream | Effort | Recurring cost | Why this order |
|---|---|---|---|---|
| 1 | **W6-lite** (regression harness + 15 golden briefs) | 1 week | $50/week CI | **Foundation — without this, every other change silently breaks things** |
| 2 | **W0** (Canonical Object Model — 3 classes) | 2 weeks | zero | Answers Tristan's "real-world objects" question. Upstream of tools. |
| 3 | **W1** (3 tools, function-calling at Phase 1) | 1.5 weeks | zero | Closes physics-hallucination class. Tools called IN-FLIGHT not post-hoc. |
| 4 | **W4** (Adversarial dev) | 0.5 week | $5-10/week | Cheap insurance. Protects W0/W1 commits. |
| 5 | **W3** (Mixture of experts) | 1.5 weeks | similar to current | Specialists fight for their corner. Use W0 + W1 + W7 as context. |
| 6 | **W7** (Curated exemplar packs — 3 classes) | 0.5 week | low | Per-class gold-standard templates injected into Generator + experts. |
| 7 | **W5** (Pattern distillation, ≥20 runs/class) | 1 week | low | Quarterly batch. Human-reviewed diffs only. |
| 8 | **W2** (Multimodal — 3 classes only) | 1-2 weeks | $0.20/run | Class/category mismatch only. Not engineering correctness. |
| 9 | **W6-full** (Continuous learning + drift) | 2-3 weeks | mid | Human-approved changes only. |

**Total to "auto-improving but human-gated":** ~12 weeks.

**Week 1 deliverable** (single workstream, concrete):

> Build VF object graph schema (W0 micro) + 5 golden VF briefs (W6-lite micro) + `psychrometrics.calc` tool (W1 micro). Run current chain against the 5 briefs, capture baseline metrics. This delivers the first regression measurement + the first piece of tool grounding + the first slice of the object model — all in one concrete vertical slice.

---

## Hard rules from council

1. **Online vs offline separation** — online chain run path stays <20 min eventually; W5/W6 run in batch
2. **Class maturity matrix** — track per-class status (object graph completeness, tool coverage, price calibration, supplier catalogue, standards confidence, golden brief count). Don't treat 20 classes equally.
3. **Tools called IN-FLIGHT** at Phase 1 via function-calling, not post-hoc verification
4. **Tool provenance** — every tool returns `{value, source, uncertainty}` — no "fake determinism"
5. **No auto-mutation into production** — W5/W6 propose diffs, human approves
6. **Tools + standards excerpts must be in front of MoE reviewers** — otherwise they're "better-prompted hallucination engines" (GPT-5.5)
7. **Pipeline placement matters**:
   - Phase 0: brief feasibility tools (climate, site, grid)
   - Pre-Phase 1: retrieve W7 exemplar pack, instantiate W0 skeleton, pre-compute feasible parameter ranges
   - Phase 1: Generator emits against typed W0 schema, not free prose
   - Phase 2: deterministic validation (W1 gates) + W3 specialists with W7 context
   - Engine B: consume typed BoM objects + W0 supplier/catalogue anchors
   - Render: multimodal/category check belongs HERE, after PDF

---

## Cost summary

| Path | Initial setup | Per chain run | Per week (50 runs) |
|---|---|---|---|
| Online (chain) | $0 | $2.50 today → $2.20 with W3 | $110-125 |
| Offline (W5/W6) | $50K-80K effort (12 weeks engineering) | $0 (batch) | $50 CI + drift dashboards |

The strategic ask is engineering effort, not LLM spend. Total LLM cost stays roughly constant; quality improves substantially.
