# Iter-9 Strategic Plan: Move from LLM-Probabilistic to Tool-Grounded Engineering

**Status:** DRAFT for council critique. Tristan's brief 2026-05-20:
> "think more about what we have done on previous training work — making sure we have the right real world objects, the reasoning and logic of what makes sense to do. then think about what tools we can use (eg little python code packets) to make things more grounded and deterministic ... multimodal understanding ... in-context learning ... distillation ... self-training ... steel-manning and red-teaming ... mixture of experts ... continuous learning so the engine gets better every hour and every day."

## What we have today (the "training" baseline)

The chain isn't fine-tuned. Its "training" is **curated registries + scripted gates**:

| Asset | Coverage | Quality signal |
|---|---|---|
| `class-priors.ts` | 20 product classes × ~11 modules | Hand-written, drift visible per class |
| `class-connections.ts` | Same 20 classes, ~10 connections each | Caught with BESS-terminology bleed in VF entry today |
| `class-suppliers.ts` | Same 20, ~3-5 archetypes | Aliases working, some supplier names hallucinated |
| `class-standards.ts` | Same 20, ~10-15 standards each | Today: added canonical-code dedup |
| `class-reference-graphs/` | 20 K10 graphs | VF missing — falls back to NO_GRAPH |
| `class-cost-structure.ts` | 20 cost stacks (L, OH, M, C, I ratios) | BESS calibrated, others coarser |
| `class-price-bands.ts` | 20 market bands | Today: VF moved to per-m² |
| `class-floors.ts` | 20 floor multipliers | BESS rich, others sparse |
| `component-classes.ts` | 20 component classes + overrides | Today: floor clamp + VF overrides 4→12 |
| Phase 2 arithmetic gates | 16 universal gates | Today: 3 new (power, pressure, fan) |
| Phase 2 grammar gates | ~15 gates | Today: cross-class bleed guard |
| Engine B classifier | 20-class Flash-Lite + overrides | Pattern-strip pre-pass added today |
| Physics critic (R5) | Single Gemini 3.5 Flash call | Catches 4-8 HIGH issues per run |
| 4 reviewer chain (R1-R4) | Generic, not domain-specialised | Convergence partial |

**The pattern emerging:** every fix tightens a registry or adds a gate. We've made the engine 11× better today via 12 commits, each one closing a known failure mode. **But this is reactive — failure happens, then we fix.**

The strategic question: how do we get to PROACTIVE quality? Six workstreams.

---

## W1. Deterministic engineering tools (Python micro-services)

**Problem today**: LLM hallucinates physics. VF iter-7 had a 300mm axial fan claiming 4500 m³/h at 150 Pa — physically impossible. We fixed it with a lookup table in `universal-arithmetic-gates.ts`, but every NEW physics relationship the chain encounters can hallucinate similarly.

**Solution**: wrap deterministic calculators as JSON-RPC services callable from the chain. The LLM doesn't compute — it requests, consumes the result.

**Concrete tool catalogue**:

| Tool | Library | Use cases |
|---|---|---|
| `psychrometrics.calc` | `psychrolib` (Python) | VF dehumidification ΔT, dewpoint, enthalpy |
| `refrigerant.cycle` | `CoolProp` | R454B/R290/R32 COP, mass flow, condensing pressure |
| `fan_curve.evaluate` | Polynomial fit per (size, type) | Static pressure feasibility (today's gate generalised) |
| `pressure_drop.pipe` | Darcy-Weisbach via `fluids` | Hydronic loop ΔP, fertigation manifold sizing |
| `voltage_drop.cable` | BS 7671 tables | Cable CSA selection, busbar ampacity |
| `npshr.pump` | Centrifugal-pump equations | Pump cavitation check |
| `heat_exchanger.ntu` | NTU-effectiveness method | Cold-plate sizing for BESS, condenser sizing |
| `psi_psv_relief.sizing` | API 520, ASME UG-127 | Pressure relief for refrigerant + fluid systems |
| `g99_loss_of_mains.calc` | ENA EREC G99 Issue 6 | BESS grid-protection settings |
| `solar_irradiance.lookup` | NSRDB / PVGIS API | PV sizing, heat pump SCOP |
| `climate_normal.lookup` | Met Office UKCP / NOAA NCDC | Brief plausibility for site-specific HVAC |
| `electrical_topology.size` | `pandapower` | 3-phase fault current, transformer sizing |
| `material.properties` | `pyMaterials` (k, cp, ρ, E) | Structural and thermal sanity |

**Implementation pattern**: each tool is a 50-200-line Python module behind a thin Node-side wrapper that calls it via subprocess. The wrapper enforces input schema + caches by (tool, inputs) hash.

**Where the chain calls them**:
- After Phase 1 (Generator): tool-call the deterministic checks against the proposed design. Output goes into Phase 2 as ground truth.
- In arithmetic gates: replace lookup tables with tool calls (better physics, less manual maintenance).
- In Engine B: pump pressure / fan curves / electrical sizing become tool calls, not LLM guesses.

**Cost**: high upfront (1-2 weeks engineering to wrap 8 tools), near-zero recurring (deterministic functions). **Highest impact-per-cost.**

---

## W2. Multi-modal reference grounding

**Problem today**: the chain THINKS in text but the user EXPERIENCES the PDF as a visual artefact. We caught the cabinet-vs-container image bug only because Tristan + I looked at the rendered PDF. The 4 council LLMs (text-only) missed it.

**Solution**: a curated **reference image library** per product class + a multimodal verification stage.

**Reference image library**:
- 8-15 photos of REAL examples per class:
  - Vertical farm: AeroFarms warehouse interior, Plenty containerised system, GrowUp container retrofit, Babylon Micro-Farm cabinet, Vertical Future single-unit
  - BESS utility: Tesla Megapack, Wärtsilä Quantum, Fluence Sunstack, Sungrow ST2752UX
  - Heat pump R290 residential: Mitsubishi Ecodan, Daikin Altherma, Vaillant aroTHERM
- Annotated with: physical dimensions, key visual components, common variants
- Stored in `public/reference-images/<class-slug>/` with metadata in `class-reference-images.ts`

**Multimodal verification stage** (new chain step after Phase 2):
- Inputs to Gemini 3.5 Flash or Opus 4.7: 
  - The chain's generated module decomposition + key derived parameters
  - 3-5 reference images for that class (best matches by envelope dimensions)
  - The brief's envelope spec
- Prompts: "Compare the chain's design to these reference examples. What proportions, components, layouts does the chain get RIGHT? What does it MISS? Specifically: does the envelope size suggest the SAME or DIFFERENT physical category as these references?"
- Output → new manual-review badge `multimodal_reference_check` if mismatch detected

**Bonus**: feeds W3 (each expert can see references for its module).

**Cost**: mid upfront (curate library ~1 day per class × 20 classes = 4 weeks; or sourced from Tristan's network of real installations). Low recurring (Gemini Flash @ $0.20/run × 100 runs/day = $20/day).

---

## W3. Mixture of domain experts (replace generic R1-R4)

**Problem today**: R1-R4 are 4 generalist reviewers. They don't know WHY a 300mm axial fan can't push 150 Pa — that's HVAC domain knowledge. They don't know G99 grid-protection settings — that's electrical. So they let those issues through; the physics critic (R5) catches some but not all.

**Solution**: replace R1-R4 with a **mixture-of-experts panel**, one specialist per major report section. Each fights for their corner.

**Expert roster**:

| Expert | Domain | Model + system prompt | Module(s) reviewed |
|---|---|---|---|
| HVAC | Thermo + psychrometrics | Opus 4.7 + ASHRAE/EN 14511 prompt | Module 2 (Env Interface), Module 6 (AHU fan) |
| Electrical | Power + protection | Grok 4.3 + BS 7671/IEC 60364 prompt | Module 5 (Power Dist), Module 4 (Energy Conv) |
| Fluid Systems | Hydraulics + RO | Gemini 3.5 Flash + Darcy-Weisbach prompt | Module 3 (Mass Fluid) |
| Compliance | CE/UKCA/jurisdiction | GPT-5.5 + class-standards.ts in context | Section 2 (Compliance) |
| Safety | SIL/PLe/FMEA | Opus 4.7 + BS EN ISO 13849 prompt | Module 9 (Safety) |
| BoM/Cost | Industrial cost engineering | Opus 4.7 + Engine B output context | Section 6 (BoM) |
| Suppliers | UK manufacturing | Gemini 3.5 Flash + Companies House facts | Section 7 (Suppliers) |
| Structural | Mechanical envelope | Grok 4.3 + ISO containers / structural codes | Module 1 (Structure) |

**Cross-expert mediation**: when two experts disagree (e.g. HVAC selects R454B, Compliance flags A3 charge limit), a "panel" round with a third arbiter resolves. Both expert opinions appear in the action log.

**Cost**: low upfront (per-domain prompts ~1 day each = 1.5 weeks). HIGH recurring: 8 specialists × $0.10 average = $0.80 per chain run vs current ~$2.50 for 4 generic reviewers. So actually CHEAPER per-chain, just more orchestration complexity.

---

## W4. Adversarial development (steel-man + red-team)

**Problem today**: every commit is "Claude + Tristan think this is right". Council critiques the OUTPUT of the chain, but not the CHANGES we make to the chain. So a bad fix can land if I'm wrong + Tristan trusts me on it.

**Solution**: for every code change to chain-critical files (arithmetic gates, class registries, Engine B, physics critic, performance card, design decisions), require an adversarial pass:

1. **Steel-man** (defend the BEFORE state): "argue why the current code is correct as-is. What problem would the proposed change introduce?"
2. **Red-team** (attack the AFTER state): "find ways the proposed change breaks existing functionality, introduces regressions, or has unintended consequences."

Run as a pre-merge check:
- 2 LLMs steel-man, 2 LLMs red-team
- If red-team finds a regression → fix the regression before merge
- If steel-man can't defend → confirms change is needed
- All output committed alongside the change as `audit/<commit-sha>.md`

**Mandatory scope**: chain-critical files only. Optional for renderer tweaks, docs.

**Cost**: low upfront (orchestration scripts). Recurring: 4 LLM calls × ~$0.10 = $0.40 per chain-critical commit. Today's 12 commits would have cost ~$5 extra in adversarial review.

---

## W5. Pattern distillation back into registries

**Problem today**: every chain run produces telemetry (actions.jsonl) but we don't aggregate it. Each new manual fix tightens a registry; we could be tightening them automatically.

**Solution**: an offline batch job that consumes the last N chain runs (N = 100 across all classes) and extracts:

| Metric | Aggregation | Registry update |
|---|---|---|
| Which derived_parameters get emitted on which modules | frequency table | class-priors.ts update (add missing fields to expected schema) |
| Which manufacturer + part_number pairs verify successfully | frequency + verification rate | Build per-class component catalogue |
| Which physics-critic findings repeat across runs | finding-similarity clustering | Add as Phase 2 arithmetic gate if pattern is universal |
| Engine B class anchor drift | running median per (product_class, component_class) | Update PRODUCT_CLASS_REFERENCE_OVERRIDES if observed median drifts >25% |
| Reviewer disagreement patterns | which reviewer flags what most often | Tune reviewer prompts |
| Cost-stack actual install factor (when user provides feedback) | running mean per class | Update class-cost-structure.ts |

**Implementation**: weekly batch job. Diffs proposed for registry updates → human reviews → accept or reject. The accepted ones land as commits.

**Cost**: mid upfront (batch infra ~1 week). Low recurring (compute only).

---

## W6. Continuous learning loop (engine gets better every day)

**Problem today**: today's improvement was a manual push by Tristan + me. Tomorrow needs the same energy. Doesn't scale.

**Solution**: an always-on quality loop:

1. **Telemetry**: every chain run already writes `actions.jsonl`. Add: post-render visual hash, council findings count (from a daily background audit), user-feedback signals (brief revisions, supplier overrides).
2. **Regression suite**: 10 canonical briefs (1 per class — heat pump, BESS, VF, EV charger, etc.). Auto-run on every commit to chain-critical files. PDF outputs structurally compared (gate-pass counts, BoM totals within envelope, manual-review badge counts).
3. **Drift detection**: weekly digest emails to Tristan:
   - "VF class gate-pass rate dropped from 87% to 74% this week — regression in seriesStackVoltageGate"
   - "BESS BoM total drifted +18% week-over-week — Engine B BESS overrides need calibration"
4. **User-signal capture**: when user revises a brief or replaces a supplier, that's a TRAINING SIGNAL. Log + classify (good chain default → user override, OR brief ambiguity → user clarification).
5. **Quarterly review**: human (Tristan) reviews the aggregated signal + decides which registry updates to accept.

**Cost**: high upfront (~2 weeks for telemetry + regression suite). Mid recurring (CI compute + audit LLM calls).

---

## Sequencing (priority)

| W# | Sub-stream | Weeks effort | Recurring cost | Why this priority |
|---|---|---|---|---|
| 1 | Deterministic tools | 1-2 | near-zero | Closes physics-hallucination class permanently. Highest leverage. |
| 5 | Pattern distillation | 1 | low | Closes the loop on what we already do manually. |
| 3 | Mixture of experts | 1.5 | similar to current | Replaces generic reviewers with domain specialists. |
| 2 | Multimodal grounding | 4 (mostly curation) | low | Catches what text-only audits miss. |
| 4 | Adversarial dev | 0.5 | $5-10/week | Cheap insurance against bad fixes. |
| 6 | Continuous learning | 2 | mid | Long-term lever, biggest scale payoff. |

**Recommended order**: W1 → W5 → W3 → W4 → W2 → W6.

W1 + W5 + W3 + W4 ≈ 4 weeks engineering to close the biggest quality gaps. W2 + W6 add 6 more weeks to reach "auto-improving engine".

---

## Open questions for council

1. **Is the workstream priority right?** W1 (tools) before W3 (experts) — or should experts come first because they're cheaper to start?
2. **W2 reference images** — sourcing problem. Is curating 8-15 images × 20 classes realistic, or should we start with 3 classes and prove the pattern?
3. **W3 MoE cost claim** — is 8 specialists actually cheaper than 4 generalists? I claimed yes (per-call cheaper at $0.10 each) but Opus 4.7 specialists would be more like $0.30. Need actual estimate.
4. **W4 adversarial** — should it be MANDATORY on chain-critical changes (high bar), or SAMPLED (every Nth commit)?
5. **What's MISSING from this plan?** Is there a workstream I haven't named that would have higher impact than these six?
