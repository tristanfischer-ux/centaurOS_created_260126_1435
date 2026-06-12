# Anvil Universal Loop — Plan v2 (2026-06-10, council-remediated)

> Goal (THE AIM, verbatim anchor): a **universal** engine that works on **any/unknown** archetype, scores **≥8 on EVERY section** (floor, not average), and is **self-learning + self-correcting**.
> Two asks from Tristan (2026-06-10): (1) make the engineering significantly more robust so it takes ALL possible archetypes with highly credible deterministic tool use; (2) create Blender models on the fly that are highly accurate and realistic for things the engine has not seen before.
> Repo: `CentaurOS-oxccu-efuel` (newest engine per 2026-06-10 handover). Pre-change mempalace search done (30 drawers). Design council v1 run 2026-06-10 (6 seats: Gemini 3.1 Pro BLOCK, GPT-5.4 REVISE, Grok 4.3 REVISE, GLM-5.1 REVISE, Kimi K2.6 BLOCK, MiMo REVISE) — all consensus remediations folded into the increments below; council seats that attacked the decided architecture itself (per-family sizing plug-ins, LLM-as-glue) were held per the wall-3 anchor + push-back protocol.

---

## Anchors (must survive every revision)

1. **≥8 floor on EVERY section, ANY archetype, zero hand-holding** — the only success metric.
2. **Wall-3 verdict stands (2026-06-03):** universal STRUCTURE solved; the lone wall is engineering-plausibility SIZING → **per-class-FAMILY sizing plug-ins** + LLM-authored sizing code for uncovered classes. Do NOT re-open the generic-structure frontier; do NOT swap the architecture for a monolithic MDAO solver (council seats proposing that were overruled — family plug-ins may iterate internally, which captures the same coupling where it matters).
3. **LLM-as-glue around real engineering tools** (Tristan 2026-05-21). LLMs route, author candidate code, and narrate; deterministic tools + gates decide.
4. **Hero = Gemini i2i conditioned on the Blender structural render; CAD-on-white schematic aesthetic, NOT photoreal** (Tristan 2026-05-17). Honest goal wording (council): the Blender layer delivers a **structurally faithful schematic** — dimensionally true to the engineering contract, correct form factor, every module placed and connected; the i2i finish supplies visual realism. "Accurate" = matches the design data; not CAD-for-manufacture.
5. **Growing-DB principle (extended 2026-06-01):** DB-first → on-miss generate → VERIFY → write back class-tagged → read. With the council's governance: **no permanent canonical writeback without staged promotion** (below).
6. **HAPS = standing cold acceptance test**; plus frozen unseen-class holdouts.
7. **Every fix universal + regression invariant** (CLAUDE.md rule #11; invariants live in `scripts/regression-harness.tsx`, named per layer).
8. **All-archetype gate-pass rate = standing universality KPI** (3/8 today → 8/8 → +holdouts).

## Universal governance rules (apply to every increment — council consensus)

- **G1. Staged writeback promotion.** Any generated artefact (sizing module, scene script, spec/standard/supplier row) lands as `candidate` (versioned, immutable, provenance: brief→code→eval results). Promotion to `shadow` (runs alongside, never decides) requires passing the deterministic oracle stack on ≥3 brief variants spanning the class's scale range (perturbation tests). Promotion to `approved` (deterministic fast path) requires shadow agreement on the next full chain run + zero gate regressions on the 3 currently-clean archetypes. Rollback = flip version pointer; bad candidates are quarantined, never deleted. One-writer rule + optimistic concurrency on the candidate store.
- **G2. LLM judges are advisory; deterministic checks decide.** Physics critic + vision judge produce findings that feed iteration loops and human review; promotion/blocking decisions key ONLY on deterministic checks (gates 10-30, conservation/dimensional checks, geometry-API checks). This kills the circular-validation hole.
- **G3. Convergence-failure fallback is explicit.** If an authoring loop (E3/B2-B3) fails its iteration cap: HALT that path, ship the honest degraded mode (labelled in the dossier — "sizing: first-pass estimates, not converged" / text-only module pages), queue the class for human authoring in the tracker. Never silent degrade, never ship unlabelled.
- **G4. Provenance ledger surfaced.** Every contract quantity carries provenance (`brief` | `inferred(confidence)` | `tool:<id>` | `family-plugin:<id>@v` | `authored-module:<id>@v`); the dossier renders inferred-vs-verified badges (extends the contact-research provenance pattern, handover §5.6). Inferred values are proposals — they must be consumed by a sizing path and survive gates before anything downstream treats them as ground truth (anti error-laundering).
- **G5. Frozen hidden eval.** The 3 named holdouts are the WORKING set; a second set of 3 unseen briefs stays frozen and unused by any writeback/learning until final acceptance (anti-overfit). Scoreboard green requires working set AND hidden set.
- **G6. Unit-typed boundaries.** Every plugin/tool/primitive API boundary takes `(value, unit)` typed quantities (the `targetPerformanceValueAs` family), never bare numbers — the recurring unit-family bug class is a named regression suite.

---

## Evidence base (current state, code-audited 2026-06-10)

**Universality scoreboard (re-run on latest engine, out/rerun-*):** co2_mineralisation 0 ✓, e_fuel_synthesis 0 ✓, haps 0 ✓, **compute_heat exit 11** (layout overlap), **energy_storage exit 10** (BoM: orphaned macros / cover≠Σ), **vertical_farm exit 10**, **satellite_smallsat exit 10**, **edge_ai exit 18** (cross-page numeric drift). 3/8 clean. (The 5 named failures = E5's first targets.)

**Walls for an unseen class (failure order):** W1 envelope regex-per-class, no generic fallback in production (`envelope.ts`) → exit 7. W2 auto-planner default-ON but: 3-key required-outputs, breadcrumb-only `synthesiseStep`, 84/178 tools with empty `output_keys` (`auto-plan-fallback.ts`, `tool-io-manifest.json`). W3 sizing: ONE family (BATTERY) in `generic/sizing.ts`, no registry. W4 `UNIVERSAL_GENERIC_EMITTER` default OFF. Self-learning: specs/standards/suppliers/products have no writeback; runtime reads baked TS snapshots; gates 31-34 + render-quality SHADOW.

**Blender walls:** 35 hand-coded templates + substring dispatch (`render-blender-scene.py:42-162`); LLM scene generator only tweaks existing templates; no geometry-from-design-data derivation; no render-vs-design verification; HAPS = wing-beam + floating boxes; `modal_gencad` dormant.

---

## WS-E — Universal deterministic engineering

**E0. Tool I/O manifest completion (council: blocking prerequisite — was E4c).**
Backfill `output_keys`/`input_keys` for the 84 empty tools (offline harvest + hand-check against each `*_run.py` input schema); registry carries I/O metadata at runtime. Nothing downstream (auto-plan population, E3 authoring against tool contracts) is trustworthy while 47% of tools are blind interfaces.

**E1. Universal envelope — typed envelope VECTOR, not a single metric (council-revised).**
3-tier cascade: (a) registered-class exact detectors untouched; (b) universal sweep extracting EVERY unit-family quantity into a typed envelope vector `{physical_dims[], capacities[], mass, environment, mobility_class, contradictions[], confidence}` with deterministic source precedence (explicit physical dims > explicit capacity specs > inferred > analogue/benchmark references — the latter REJECTED by negative-extraction rules: "similar to a 60 m turbine", competitor comparisons, shipping dims); each sizing family then chooses which vector components matter (capacity-primary for plants, geometry-primary for vehicles); (c) LLM-assisted inference for missing components proposes values with `provenance=inferred(confidence)` — advisory per G4, below confidence threshold → flagged, not consumed. genericEnvelope() scoped to registry-miss.
Invariants: payload-led HAPS brief reaches the orchestrator; "50 kW generator for a 10 MW server farm" brief selects 50 kW (semantic binding test).

**E2. Sizing-family plug-in registry with COMPOSITION (council-revised).**
Typed interface: `SizingFamilyPlugin { family; appliesTo(envelopeVector, classSlug): score; requiredQuantities: TypedQuantityRef[] (name+unit+valid_range); size(modules, contract, brief): SizingDelta }` — pure, deterministic, returns a delta (no in-place mutation; caller merges + records provenance `family-plugin:<id>@v`); loud failure on missing/mistyped required quantities (no silent defaults — the London-lat/lon bug class). **Multiple families compose:** all plugins scoring above threshold run in declared dependency order over a shared quantity namespace with explicit conflict rules (a biogas CHP gets process-plant + thermal + power-electronics + structures). Sizing↔grounding seam is explicitly iterative: size → ground to catalogue parts (scale-aware: dimension/rating-matched) → verify fit → resize on no-fit, ≤2 rounds; no-fit after that = honest gap per G3 (never a SiC-MOSFET-as-power-stack pin).
Port BATTERY first; then process-plant, thermal-systems, aero-platforms, power-electronics, structures/enclosures (recurrence order from roster overlap).

**E3. LLM-authored sizing module + deterministic convergence oracle (after E0+E2; the unlock for uncovered classes).**
LLM authors a bespoke module conforming to the SizingFamilyPlugin type (compile + interface-conformance validated, import-allowlisted, no I/O/network/eval, resource-capped sandbox); iterated ≤4 attempts against the DETERMINISTIC oracle stack: gates 14/16/22/24/26, gate-32 cost bands, mass/energy conservation checks, dimensional-consistency checks, monotonicity-under-perturbation; physics critic findings feed the iteration prompt but never decide (G2). Convergence → `candidate` writeback, then G1 promotion ladder (≥3 brief variants). Failure → G3 halt + label + human-authoring queue.

**E4. Auto-planner population.**
(a) Feature-conditional required outputs (flammable→fire_agent_mass, wetted→cp_protection_current, reactor→agitator_power, stream-heat→heat_transfer_kw, always→lifecycle_co2_t). (b) Generic output→quantity mapper: each tool's declared output_keys map to canonical contract quantities as `(name, unit, valid_range, conversion)` entries with `tool:` provenance — replaces breadcrumb-only synthesiseStep; unmapped outputs are logged, never silently defaulted. (c) Auto-validate the 4 stale hand class-graphs against auto-planner output; collapse when auto wins.

**E5. Graduate to production (starts immediately on the 5 named scoreboard failures).**
Fix exit-10 BoM families (macro→sub-total propagation, cover≠Σ), exit-11 layout, exit-18 drift UNIVERSALLY + invariant each. Auto-correct ("fix, don't flag") extends ONLY to consistency repairs provably derivable from upstream values (gate-10 reconciliation, gate-18 drift toward the provenance-backed value) — never substantive respecification (council guard). Gate graduation: one GATE across all archetypes at a time (cross-archetype regression signal), shadow→enforcing when stable. Generic emitter default-ON (registry-miss scope) only after E1-E3 hold on working holdouts with hard preconditions: zero missing required contract quantities, every major dimension has provenance, no default-valued critical ratings without explicit waiver.

**E6. Self-learning writebacks.**
Live DB-first reads + writebacks for specs/standards/suppliers/products under G1 governance + snapshot-at-build (each run records the DB versions it read → reproducible dossiers). Existence verification for parts/specs = deterministic distributor/datasheet resolution (gate-20 cascade), never LLM say-so.

## WS-B — Blender structurally-faithful models on the fly

**B1. Parametric form-factor primitive library** (~12 primitives: airframe set, vessel/tank, skid+piperack, rack row/cabinet, container/enclosure, tower/mast, hull, gantry, rotating machine, panel stack, piping/cable runs, foundation) — unit-typed params (G6), versioned API (stored scenes record the primitive-API version; compatibility-checked on read). Plus a **connection-routing helper** (deterministic orthogonal/spline runs between module ports — pipes/cables/ducts) because module linkage is what makes geometry read as real (council: routing was missing entirely). Plus a placement-ontology lite: `contains | supports | attached_to | clearance_zone` relations the composer must emit.

**B2. LLM scene author v2.**
Input = design digest (envelope vector, modules + derived_parameters + typed quantities, grammar_links for connectivity, class, brief excerpt) + primitive API doc. Output = standalone `blender-scene.py` composed ONLY of primitive calls + placement relations + routed connections, with every dimension traced to a contract quantity (comment provenance). AST-validate + type-validate primitive calls against the API schema (not just syntax).

**B3. Verify-revise loop — deterministic geometry checks decide; vision judge advises (council-revised).**
After headless render, run DETERMINISTIC scene checks via the Blender Python API: module-tag count == decomposition count; scene bbox within envelope ±5% (was ±20% — council); no interpenetration beyond tolerance; connected-components graph = nothing floating (every module reaches the structure root via supports/attached_to); declared clearance zones empty; CoG within support polygon for mobile/airborne platforms (mass from contract). These gate. The multimodal judge scores form-factor sanity + design-match as ADVISORY findings feeding revision (≤4 iterations). Convergence → candidate scene script writeback under G1. Failure → G3 (text-only module pages + tracker queue). Render-quality gate ENFORCING for the authored path.

**B4. Keep the validated i2i finish** (Blender structural render conditions Gemini i2i hero + module zooms; palette card; no changes beyond better structural input).

**B5. Regenerate weak templates through the new path** — HAPS first (acceptance: real airframe, modules ON the airframe, props at pods, CoG plausible). Hand templates stay as the registered-class fast path; authored path = registry-miss universal path. Geometry↔contract consistency check (B3's bbox/mass checks) also runs on HAND templates — they can be stale too. Modal containerisation stays tracked, non-blocking.

---

## The loop

**Scoreboard:** 8 registered archetypes exit 0 + 3 working holdouts (tidal-kite generator, biogas digester CHP, automated mushroom farm) + HAPS-cold (payload-led brief) + 3 FROZEN hidden holdouts (named only at acceptance time, G5). Target: every line exit 0; deterministic gates all PASS; physics-critic ≥8 every dimension + self-audit ≥8 every section (advisory KPIs, calibrated against ≥5 human-scored reference dossiers — council #10); authored geometry passes B3 deterministic checks.

**Per iteration (forgeos-loop.md adapted):**
1. **GENERATE** — rerun-all-archetypes.sh + holdout briefs, ≤3 concurrent, background. Check OpenRouter credits FIRST (402 mid-chain truncates JSON silently).
2. **READ** — every PDF visually (Read tool pages param, NOT pdftotext), every render PNG.
3. **REVIEW** — gate exits + AUDIT mds + critic/self-audit scores + B3 geometry findings; coding-council on diffs >20 lines.
4. **IDENTIFY** — top ≤5 fixes by leverage in `ANVIL-UNIVERSAL-TRACKER.md`, each mapped to an increment.
5. **FIX** — sub-agents; one commit per fix + named regression invariant (or `regression-harness: no-invariant-needed because <reason>`).

Exit: scoreboard green twice consecutively, including the hidden set untouched by any learning.

**Iteration 1 (now):** (a) the 5 named scoreboard failures (#43) — diagnose from `out/rerun-<arch>/chain.log` + AUDIT mds; (b) E0 tool-I/O backfill; (c) E1 envelope vector; (d) B1 primitive library. Holdout baselines generated once credits confirmed.

**Risks:** OpenRouter balance $85 (2026-06-10) — flag top-up before sustained GENERATE phases. Two-repo drift (#41): all work in `CentaurOS-oxccu-efuel`; consolidation = early tracker item (merge-base --is-ancestor, decide direction first). Uncommitted workstreams in repo — commit/stash-label before chain edits. LLM-authored code = supply-chain surface: import allowlist, no network/proc, versioned + signed candidates (G1).
