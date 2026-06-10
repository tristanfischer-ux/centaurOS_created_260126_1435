# Universal Engineering (Part 1) + Universal Blender (Part 2) — Build Plan

**Author:** Claude (Opus 4.8) · **Date:** 2026-06-10 · **Status:** IN BUILD — Phase 0 + Phase 1-grounding + Phase 3 (4 families) landed, tested, **deployed**.

---

## ▶ RESUME HERE (2026-06-10, written before a compaction)

**Mission:** universal, physics-first engine — ≥9 on EVERY engineering section for ANY archetype, self-correcting. Diagnosis + scope: mempalace drawer `forgeos_decisions_c9fd2af014689501`. Gotchas to load: `…8f461538…` (this doc's D4 set is MISLABELLED — thruster/satellite/edge-ai are hand-wired; only the deployable antenna tests the spine), `…7924b6b8…` (registered ≠ ≥9; cost-sanity input-power-denominator bug on propulsion), `…b7294b96…` (origin not always green; tsx-harness↔jest glob collision).

**DONE this session — git `main @ e4b8f0c3c`, pushed + DEPLOYED (all off-by-default, no prod behaviour change until flags flip):**
- **Phase 0** ✅ — `engineering_basis` scored + both engineering sections in `HARD_SECTIONS` + empty→null (`scripts/score-radical-pdfs-multimodal.py`); **gate-36** Part-1 completeness halts a hollow Part 1 (`src/lib/pdf-engine-v2/lib/part-one-completeness-audit.ts`; enforce flag `PART_ONE_COMPLETENESS_ENFORCING`, default off).
- **Phase 1 grounding** ✅ — auto-planner writes real tool outputs → contract (`scripts/lib/orchestrator/part-one-grounding.ts` + `auto-plan-fallback.ts`); flag `UNIVERSAL_AUTO_PLAN_GROUND` (default off).
- **Phase 3 sizing** ✅ (4 families) — `scripts/lib/orchestrator/generic/sizing.ts`: `battery`, `process_plant`, `thermal_rejection`, `spacecraft`. Geometry is **derived FROM the calc** (`vesselDimsFromVolume`/`radiatorDimsFromHeat`/`solarArrayDimsFromPower`). An UNMAPPED class → **UNION** of all families (each rule param-gated). Tests: `generic/sizing-phase3.test.tsx` (12).

**NEXT — do in this order:**
1. **Phase 2 — feature-derived applicability** (the right tools fire for an unseen class). SAFE/ADDITIVE design: each tool's `applicable_to(envelope)` returns true if `(class ∈ its allowlist — preserves every registered class)` OR `(a physical-feature predicate matches)`. Add a shared feature-predicate layer + a manifest `applicable` field so the auto-planner (`auto-plan-fallback.ts`) AND the executor (`executor.ts` ~line 129 — currently NO applicability check on the auto-plan path) honour it. This excludes domain-wrong tools (the compute_heat spacecraft-radiator / satellite £23M misfire). ~138 wrappers in `scripts/lib/orchestrator/tools/`.
2. **Phase 3 cont.** — add `power_electronics`, `structural`, `rotating_machine` families to `generic/sizing.ts` (same param-gated, geometry-from-calc pattern); extend `sizing-phase3.test.tsx`.
3. Phase 4 (universal mass/energy-balance table + auto-flow-diagram — de-CO₂-hardcode `render-minimal-pdf.tsx` ~`:15526`), Phase 5 (Blender compiler consuming the dims — wire the orphaned `generate-blender-scene.tsx::buildDigest` into the chain at `serial-design-chain-v2.tsx:5693`), Phase 6 (pixel render-gate + scale lighting).

**Increment discipline:** build → co-located jest `.test.tsx` → `npx jest <path>` + `npx eslint --quiet <files>` → commit w/ a `regression-harness:` line → push (=deploy; off-by-default is safe). NEVER `git add -A`. **Validate universality on a TRULY-UNREGISTERED class (deployable antenna or a new slug), NOT the hand-wired thruster/satellite/edge-ai.** Chain run: `PA_PIPELINE=true RADICAL_PHASE_3_PER_MODULE=true npx tsx scripts/serial-design-chain-v2.tsx <brief.md> <out-dir>`.

**The goal (Tristan, verbatim intent):**
1. The **Part 1 engineering section** (Engineering Basis → Brief Provenance → System Overview → Engineering Calculations) must score a consistent **≥9**, using **deterministic physics**, with the system **automatically selecting the right tools** — for *every* form factor / archetype (battery storage, drones, cubesats, anything).
2. **Part 2 Blender models** must be **realistic for any archetype**, generated **from the engineering requirements produced in Part 1**.

---

## 0. The one-line diagnosis

**The engine is universal in *structure* but hand-wired in *physics and geometry*.** Everything downstream of the physics — the Part 1 renderer, the 31 gates, the scorer, the page layout — is genuinely class-agnostic and already 9-grade. The three things that produce the actual engineering *content* are hand-wired per registered class, so an unseen archetype falls off a cliff.

| Layer | Universal today? | Evidence |
|---|---|---|
| Page structure / renderer | ✅ Yes | `EngineeringCalculationsPage` renders machine-checked worked maths for any class (`render-minimal-pdf.tsx:15232`) |
| 31 quality gates | ✅ Yes | all run class-agnostically |
| Scoring | ⚠️ Mostly | `engineering_calcs` is scored; Engineering **Basis** page is not (§2 below) |
| **Tool applicability** | ❌ Hand-wired | 138/176 tools gate on a class allowlist (`bemt-propeller.ts:29`) |
| **Tool→contract grounding** | ❌ Hand-wired | only inside 37 class plans; auto-planner writes breadcrumb flags only (`auto-plan-fallback.ts:197-213`) |
| **Sizing** | ❌ Hand-wired | `generic/sizing.ts` has exactly ONE family: `battery` (line 110) |
| **Blender geometry** | ❌ Hand-wired | 31 hand-authored Python templates; no per-class → generic boxes |

**Consequence (the proof):** the `compute_heat_module` dossier's "engineering calculations" are a **PEM electrolyser**, a **fuel-cell polarisation curve**, an **EV battery taper**, and a **spacecraft radiator** (`q = εσF(T_rad⁴ − T_sink⁴)`, `T_sink = 3 K`). Its `orchestratorContract.quantities` holds **only nine `auto_planned_tool_ran__* = 1` breadcrumb flags — zero real numbers**. It was sized as a **1 kW, 70-litre battery**. The renderer faithfully rendered nonsense.

**The unifying insight:** brief → universal tool-selection + grounding (Q1) → **a component tree with real dimensions + types** → universal geometry compiler (Q2). That component tree is the spine. Fix it once, and both the engineering section and the Blender models hit the bar. Part 1's grounded output is literally Blender's input.

---

## 1. Current state — verified (what we have)

### 1a. Tool selection (the heart of Part 1)
- Entry: chain → `orchestrateDesign()` (`serial-design-chain-v2.tsx:2708`) → `orchestrate.ts:61-194`.
- Order: `detectEnvelope` (`envelope.ts:79`, ~37 class aliases, else exit 7) → `selectPlan` (`planner.ts:96`, first matching `ClassToolPlan`) → **on miss** `composeFallbackPlan` (`auto-plan-fallback.ts:139`, the universal auto-planner) → execute → verify → `assembleDesign`.
- **Two paths, only one works.** 37 hand-wired `ClassToolPlan` files (`scripts/lib/orchestrator/class-plans/*.ts`; `satellite-cubesat.ts` = 24 ToolSteps, ~780 lines). All registered classes hit this and bypass the universal path. The universal path (`composeToolGraph`, `UNIVERSAL_AUTO_PLAN` default ON since 2026-06-03) composes a graph by I/O-key string-matching but drives off only 3 universal outputs and writes breadcrumbs.
- **Catalogue:** 238 Python physics scripts, 176 registered TS wrappers (`register-all.ts`), registry `registry.ts`. Static manifest `tool-io-manifest.json` (178 entries, **only 94 declare `output_keys`**, no `applicable` predicate).

### 1b. Part 1 generation — the scaffolding is already a 9
- Components: `EngineeringBasisPage` (`render-minimal-pdf.tsx:15483`), `BriefProvenancePage` (`:5619`), `SystemOverviewPage` (`:8380`), `EngineeringCalculationsPage` (`:15232`), shared worked-calc engine `ToolsComputedBlock` (`:14926`).
- Data path is **deterministic, drift-safe**: Python tools → `_worked.py::worked_calc()` (`:58`, re-evaluates each substitution to assert it equals the printed result) → `contract.worked_calculations` → `attribution.ts:237` → `state.toolsUsedPage` (`serial-design-chain-v2.tsx:5306`) → `ToolsComputedBlock`.
- **Proof it's 9-grade when fed real tools (CO₂, verbatim):** `t = p·D/(2·S·E − 1.2·p) + corr → 4.526 mm` (ASME VIII hoop stress); HTU-NTU column sizing; Eckert flooding; Swamee-Jain friction — formula + substituted numbers + units + cited provenance on every step.

### 1c. Scoring
- Scorer: `scripts/score-radical-pdfs-multimodal.py` (3-judge visual council). `SECTIONS` (`:205-220`) is now **14 sections** incl. `engineering_calcs` (`:210`, added 8 Jun commit `32f159f34`).
- Page→section via running-header substring match (`_HEADER_SIGNATURES:362-417`); `engineering_calcs` ← `ENGINEERINGCALCULATIONS` (`:372`). Rubric `_SECTION_CRITERIA:807` ("worked first-principles sizing, grouped by module, every number hand-checkable"; 9 = publication-grade).
- **Three scoring holes:** (a) the **Engineering Basis** page header `PART1·ENGINEERINGBASIS` has **no signature** → that page (process flow + mass/energy balance + verdict + economics) is **unscored**; (b) `engineering_calcs` is **not** in `HARD_SECTIONS` (`:425-428`) → never pass-blocking; (c) empty calcs has no positional fallback → judges score **page 1 (the cover)** as "engineering" (`select_section_pages:582`) — a garbage number, not an honest null.
- Note: on-disk score logs are dated **4 Jun** (pre-commit), so the 14-section scorer has **no recorded run yet**.

### 1d. Blender
- Geometry is **hand-authored Python per class**: 31 `scripts/blender-templates/*-9shot.py` (200–900 literal `add_box`/`add_cyl` calls; `compute-heat-module-9shot.py` hardcodes `W=0.30, D=0.45`). They read **no** engineering output.
- Dispatch: `CLASS_TO_TEMPLATE` (`render-blender-scene.py:42-162`, substring match `resolve_template:165`). ~19 of 37 classes have **no** template → fall to `render-product-blender.py` ("box per module, size ∝ sub_module count" — the coloured-bars-in-a-glass-box).
- A data-driven path **exists but is orphaned**: `generate-blender-scene.tsx::buildDigest` (`:137-173`) walks the real component tree + dims, but the chain calls the static path (`generate-module-images.tsx:74` ← `serial-design-chain-v2.tsx:5692`). No `blender-scene.py` exists in any `out/` run dir.
- Gate 35 (`render-quality-audit.ts`, wired `serial-design-chain-v2.tsx:6486`) checks **template existence only** (`:91`), is **shadow/off** by default (`:150-154`), and passed `compute_heat` because a template file exists — blind to the actual pixels.
- Two failure modes seen: (a) no template → generic bars (`compute-heat-module-v5/blender-cover.png`); (b) scale bug → metre-scale lighting rig overexposes a 0.3 m brick to near-white (`chm-blender-test/00-hero.png`).

---

## 2. Target / definition of done

- **Engineering section ≥9** on a 2-judge-minimum council, for the reference set (BESS, CO₂) **and** for ≥1 genuinely-unseen archetype validated without touching its class.
- **Deterministic**: every engineering number traces to a `worked_calc()` step, machine-checked, no LLM fabrication.
- **Auto-selected tools**: the right physics tools fire for an unseen class; domain-wrong tools are excluded (no spacecraft radiators in a compute brick).
- **Blender realistic for any archetype**: geometry generated from the Part 1 component tree (types + real dimensions + topology), not a hand-authored template; correctly exposed at any scale.
- **Self-correcting**: the engine **refuses to ship** a hollow engineering section or a generic/washed-out render (enforced gates), per the gate-severity philosophy (wrongness hard-exits; soft deviation flags).

---

## 3. The build — phased, dependency-ordered

> Methodology (ForgeOS standard): build the **universal** mechanism, **prove on `compute_heat_module`** (the worst current failure + Tristan's live venture) going nonsense→9, then **validate on a 2nd genuinely-unseen archetype** (proposed: `cubesat` is registered — pick an unregistered one, e.g. a **drone variant** or **microgrid**) *without hand-wiring it*. Every phase adds a `scripts/regression-harness.tsx` invariant (CLAUDE.md rule 11).

### Phase 0 — Make the bar visible + enforced  (≈1 session · low risk · completable now)
*You can't improve what you can't measure, and today hollow engineering sections ship silently.*
- **0.1** New **Part-1 completeness gate** (next free exit code **36**): HALT if `orchestratorContract.quantities` contains only `auto_planned_tool_ran__*` flags, OR the mass/energy balance is empty, OR `EngineeringCalculationsPage` would render zero worked blocks. Shadow→enforcing per env, default shadow first. *This is the net that would have caught the compute_heat 1 kW dossier.*
- **0.2** Scorer: add `ENGINEERINGBASIS` header signature so the Engineering Basis page is scored (likely fold its economics into `cost_analysis` + verdict into `feasibility_notes`, or a new `engineering_basis` section — decision D5).
- **0.3** Scorer: add `engineering_calcs` (and `engineering_basis`) to `HARD_SECTIONS` so a low engineering score blocks the pass.
- **0.4** Scorer: fix empty-calcs → honest `null`, not cover-page fallback (`build_section_page_map` + `select_section_pages:582`).
- **Invariant:** `UNIVERSAL.part1_completeness_blocks_breadcrumb_only_quantities`.
- **Acceptance:** a compute_heat-style run is BLOCKED, not shipped; the Engineering Basis page earns its own score row.

### Phase 1 — Ground the auto-planner (real tool outputs → contract)  (≈1–2 sessions · medium risk · the precondition)
*Selection ≠ grounding. Until tool outputs reach the contract, no amount of selection helps.*
- **1.1** Enrich `tool-io-manifest.json`: all 176 tools declare `output_keys` with **unit + family** metadata (currently 94). Generated from the wrappers' real `contract_update`, not hand-typed.
- **1.2** Replace breadcrumb `synthesiseStep` (`auto-plan-fallback.ts:183-217`) with a generic `contract_update` that maps each tool's declared `output_keys` → typed contract quantities with provenance `tool:<id>`.
- **Invariant:** `UNIVERSAL.auto_planned_tool_writes_real_quantity`.
- **Acceptance:** an auto-planned tool's real numbers appear in `quantities`; a worked-calc block renders for an unseen class.

### Phase 2 — Feature-derived applicability  (≈1–2 sessions · medium risk)
*Right tools fire; wrong tools excluded.*
- **2.1** Replace the 138 hardcoded `applicable_to(envelope) = [...classes].includes(...)` predicates with **physical-feature predicates** derived from the envelope/brief: `needs_pressure_envelope`, `is_rotating`, `is_submerged`, `rejects_heat`, `has_power_electronics`, `is_orbital`, etc.
- **2.2** Populate manifest `applicable` so the auto-planner honours it (`auto-planner.ts:133`) AND the executor enforces it (`executor.ts:129`) — closes the gate-34 "marine tool in a CO₂ plant" class of bug universally.
- **Invariant:** `UNIVERSAL.no_domain_mismatched_tool_selected` (extends gate-34).
- **Acceptance:** compute_heat pulls thermal/electrical tools, not electrolyser/radiator/drone tools.

### Phase 3 — Universal sizing families  (≈2–3 sessions · medium risk · lifts the engineering_plausibility cap)
*`generic/sizing.ts` has ONE family (`battery`); every other unseen class gets ×1 quantities + no ratings → Physics-Critic `engineering_plausibility` capped ~3/10.*
- **3.1** Extend `FAMILIES` + `FAMILY_OF` (`generic/sizing.ts:110`) with: `process_plant`, `rotating_machine`, `power_electronics`, `thermal_rejection`, `spacecraft`, `structural`. Each a small `SizingRule[]` keyed by component-type regex reading already-computed contract quantities.
- **3.2** (Decision D1) Where the *catalogue itself* lacks the physics — e.g. **GPU thermal design, rack heat-rejection, coolant-loop, heat-exchanger-to-district-loop, PUE** (none of the 238 tools cover these) — build them as **family-applicable** tools, NOT class-gated.
- **Maps to existing task #54.**
- **Invariant:** `UNIVERSAL.non_battery_class_gets_rated_components`.
- **Acceptance:** a non-battery unseen class gets real quantities + ratings on its component words (not ×1 / `TBD`).

### Phase 4 — Universal Part-1 rendering  (≈1–2 sessions · low-medium risk)
*Two pieces of Part 1 are still CO₂-hardcoded.*
- **4.1** Mass/energy-balance table: replace the 13 hardcoded CO₂ keys (`render-minimal-pdf.tsx:15526-15547`) with **family-derived** balance keys (same universal pattern as the gate-17 Brief Compliance table). Removes the blank-balance failure for every non-CO₂ class.
- **4.2** Universal auto-block-flow-diagram (Block 1) for any class; fix box labels to fall back to the humanised module/sub-module name when `display_name` is null (the `display_name: None` raw-ID problem). CO₂ SVG (`Co2ProcessFlowDiagram:15357`) is the quality bar.
- **Acceptance:** a non-CO₂ archetype renders a populated balance table + a real process flow.

### Phase 5 — Universal Blender geometry compiler  (≈3–4 sessions · higher risk · Q2 core; depends on Phases 1–3)
*Realism currently needs a human to hand-author 200–900 lines of Python per class — cannot scale to "any archetype."*
- **5.1** Build a **component-TYPE → parametric-primitive compiler** in `forge_blender_lib.py`: a `COMPONENT_ARCHETYPE` registry mapping each `content_character.character_id` family (column, vessel, tank, pump, compressor, PCB, heatsink, fan, valve, pipe, reactor, busbar…) to an existing compound primitive (`add_compound_vessel`, `add_compound_motor`, `add_compound_finned_heatsink`, `add_frustum`, `add_pipe` already exist). 
- **5.2** A single universal scene script walks `modules→sub_modules→words`, reads each word's `dimensions` modifier + quantity, looks up the archetype, emits the right parametric shape at a topology-driven position. Keys on the **universal component vocabulary the engine already emits** → works for unseen classes with no per-class Python.
- **5.3** Wire the data path: route the chain through the engineering-driven scene-gen (currently `serial-design-chain-v2.tsx:5692` calls the static path; the digest builder `generate-blender-scene.tsx::buildDigest` is orphaned).
- **Maps to / supersedes task #56.**
- **Acceptance:** compute_heat + a 2nd unseen class render recognisable component-faithful geometry, not boxes.

### Phase 6 — Render-quality gate: pixel inspection + enforce + scale lighting  (≈1–2 sessions · low-medium risk · Q2 safety-net)
- **6.1** Gate 35 (`render-quality-audit.ts`): add a cheap **pixel** check — mean-luminance/histogram (catches washed-out) + colour-variance/edge-density floor (catches generic-bars-vs-real-geometry). Flip `RENDER_QUALITY_ENFORCING` on so wrong renders block at exit 35 instead of shipping at exit 0.
- **6.2** Scale-relative lighting: make `add_lights` energy/exposure a function of `compute_scene_bbox()` max-dim (already computed) so a 0.3 m brick and a 6 m skid both expose correctly.
- **Acceptance:** washed-out/generic renders BLOCK; small-form-factor archetypes expose correctly.

---

## 4. Dependency graph & rough effort

```
Phase 0 (safety-net+scoring) ──┐  independent, do first
                               │
Phase 1 (grounding) ───► Phase 2 (applicability) ───► Phase 3 (sizing) ──┐
                               │                                         │
                               └──────────────► Phase 4 (Part-1 render) ─┤
                                                                         ▼
                                          Phase 5 (Blender compiler) ◄── needs real components+dims
                                                                         │
                                                          Phase 6 (pixel gate + lighting)
```
**Rough total: 9–16 working sessions.** Phases 1→3 are the engine-physics spine (Q1 core) and must precede Phase 5 (Blender needs real components to render). Phase 0 and Phase 6 are the self-correcting nets.

---

## 5. Decisions — RESOLVED (Tristan, 2026-06-10)

- **D1 — Build the tools. ✅** No cap: *"238 tools aren't enough, you might need 500."* Everything **first-principles**, built **family-applicable** (`rejects_heat`, `transmits_optical_link`, `is_rotating`…), never class-gated. Grounded by `SPACE-SECTOR-ARCHETYPE-TOOL-ROADMAP.md`: **~75 new first-principles tool families** for space alone → catalogue heads toward ~400–450 and keeps self-generating per the growing-DB principle.
- **D2 — Start with families, add as physics demands. ✅** Given the space breadth, expand from 6 to **~10** sizing families: process_plant, rotating_machine, power_electronics, thermal_rejection, structural, spacecraft, propulsion, orbital_mechanics, optics_rf, aero_reentry.
- **D3 — Keep hand templates; compiler should surpass them. ✅** The 31 hand-authored Blender templates stay as the "premium" path; the universal compiler handles the long tail, goal = eventually beat the hand templates.
- **D4 — Space sector is the validation universe. ✅** Spread (none hand-wired): green chemical sat thruster · SAR EO satellite · deployable composite antenna · **onboard-AI edge-compute payload** (thermally-driven — the bridge to compute_heat). compute_heat stays the worst-case forcing function. Full archetype set in the roadmap doc.
- **D5 — New dedicated engineering-section score. ✅** Add a new `engineering_basis` section to the scorer (not folded).
- **D6 — Shadow-first. ✅** New gates (Phase 0, 6) record/log only by default; flip to enforcing on Tristan's go once a clean baseline exists.

### Strategic scope boundary (surfaced by the research — important)
The deterministic-physics engine fits **physics-first hardware** (~45 space archetypes) + the **edge-compute-payload** class. It does **NOT** fit pure software/data companies (EO analytics, mission-ops, imagery marketplaces) — their "dossier" is a compute/data-architecture doc, not an engineering spec. **Tristan confirmed 2026-06-10: software/data is OUT of scope, physics-first engine, full stop** — decline those prospects, no separate mode planned. Detail in `SPACE-SECTOR-ARCHETYPE-TOOL-ROADMAP.md` §1.

---

## 6. Explicitly NOT in scope (anti-patterns)

- **Do NOT add a 38th hand-wired class** for compute_heat. Hand-wiring 37 classes is *why* it's good where it's good and broken everywhere else; a 38th special case makes the venture look good fast but does not advance "every archetype." compute_heat is the **validation target**, not a new hand-wire.
- No "while I'm here" renderer refactors — the renderer is already 9-grade; the work is upstream.
- No LLM in the physics/grounding path — determinism is the requirement (`planner.ts:7-15`: "if the LLM chooses, you've built an entropy engine").

---

## 7. Existing tasks this absorbs/supersedes
- #54 "Add compute-family sizing ruleset" → **Phase 3**.
- #55 "Fix gate-25 false positive on generic-path runs" → fold into **Phase 1/2** (generic path becomes real).
- #56 "Build + verify compute-heat-module Blender template" → **superseded by Phase 5** (universal compiler, not a hand template).
- #51/#52 "Run + iterate compute_heat to ≥8" → becomes the **validation gate** for Phases 1–6.
