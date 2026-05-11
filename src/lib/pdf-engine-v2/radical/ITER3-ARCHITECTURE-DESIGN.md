# Iter 3 Architecture — Module Decomposition Stage (Stage 1.5)

**Status:** DESIGN ONLY — no engine code modified.
**Author:** sub-agent, 2026-05-11.
**Validated by:** Tristan (architectural diagnosis at `~/Downloads/missing-stage-architectural-diagnosis.md`).
**Reconciled with council:** 2026-05-11 (4-seat council: Grok + Gemini + GLM + Sonnet). The original 9-module taxonomy expanded to 12 after unanimous council recommendation; see `../COUNCIL-UNIVERSAL-TAXONOMY-2026-05-11.md`. Tristan-binding decisions baked in: 4-seat council with 50% NEEDS_MAJOR threshold; `secondary_modules` consumed in v1; 3-run mean ± stddev for V10+ scoring; explicit promotion gate (≥10 cell-≥8 lift on 10 baselines AND ≥4/5 universality probes pass AND no >2-cell regression on previously-passing cells).
**Predecessors:** Iter 1 (wrong-domain leakage fix), Iter 2 (library expanded to 335 mandatory characters).
**Successor:** Iter 3 implementation (separate hand-off; this doc is the contract).

---

## §1 Current pipeline (post-Iter 2)

```
Brief (English)  →  Stage 2: brief → RadicalTree (one LLM call)  →  Resolution → BoM
```

The single LLM call in `runDecomposeRadical()` is asked to (a) read a free-form brief, (b) infer the product class, (c) produce a flat leaf list spanning all subsystems, (d) map each leaf to a known character_id. Iter 2 propped this up by inflating `deriveClassMandatoryCharacters()` to 335 baseline characters per class — but the LLM still emits a sketch (~20–40 leaves per call) and the mandatory-character backfill papers over the gap. Real BESS depth is ~150 unique characters; the gap is a structural ceiling on what one LLM call can produce, not a library gap.

### §1.1 Cost-impact summary (12-module + 4-seat reconciliation)

The 9 → 12 module expansion adds ~25% more module-decomposition LLM calls per product (3 extra modules × per-module Stage 2 call cost). The council seat count went from 3 → 4 (one extra short review per Stage 1.5 invocation). Both deltas are small relative to the Stage 2 amplification. Combined with the 3-run mean ± stddev requirement for V10+ multimodal scoring (3× per-V_n scoring cost), the projected per-pipeline cost lands at ~£0.85–£1.05 vs the original £0.70–£0.85 estimate — see §6.3 for the line-by-line breakdown.

---

## §2 Proposed pipeline (Iter 3)

```
Brief  →  Stage 1.5: Module Decomposition  →  Stage 2: per-module radical sub-trees  →  Union  →  Resolution → BoM
                  (1 LLM call: ~12 modules)       (N LLM calls: 1 per applicable module)
```

`Stage 1.5` is the new artefact. It produces a `ModuleDecomposition` (catalog of 5–12 universal modules instantiated for THIS product). `Stage 2` then loops over the modules — each LLM call sees a focused subset of the library and decomposes a single module deeply, instead of being asked to produce the whole product in one shot.

---

## §3 Universal functional taxonomy (12 modules)

A product class never selects a bespoke module catalog. Every product is decomposed against the same 12 universal functions; an "excluded" set marks the ones N/A for this class. This is what makes the engine generalise to unseen classes (tidal, RO desal, surgical robot) without per-class hand-coding.

| # | `UniversalModule` key | One-sentence definition |
|---|---|---|
| 1 | `energy_storage_source` | Stores or sources the primary working energy/material the product uses (battery, fuel tank, capacitor bank, accumulator, biomass feedstock, water reservoir). |
| 2 | `energy_conversion_transduction` | Converts energy or material between forms (inverter, motor, heat exchanger, fermenter, RO membrane, solar cell, turbine generator). |
| 3 | `structure_containment` | Carries load, contains pressure/fluid, and provides geometric form (pressure vessel, frame, enclosure, container shell, hull, chassis). |
| 4 | `sensing_instrumentation` | Measures physical state — temperature, pressure, flow, voltage, biochemistry, position, gas concentration. |
| 5 | `control_compute_communication` | Closed-loop control, supervisory compute, and on/off-board comms (PLC, MCU, EMS, SCADA, radio, CAN bus, edge inference). |
| 6 | `safety_protection` | Detects and mitigates hazards via *active* mitigation devices (fire suppression, surge protection, pressure relief valves, e-stops, interlocks, BMS protection circuits). |
| 7 | `environmental_interface` | Handles the physical boundary with the operating environment (thermal management, ingress protection, EMC shielding, lightning, anti-icing, biofouling protection). |
| 8 | `power_distribution` | Distributes electrical or fluid power within the product via *uninterrupted routing* only (busbars, switchgear cabling, harnesses, manifolds, conduit). Interrupting devices live in 6. |
| 9 | `maintenance_serviceability` | Affords *offline* inspection, swap, calibration, decommissioning (access doors, lifting eyes, drain valves, test points, spare-parts kits, labels). Operation-time protection lives in 6. |
| 10 | `actuation_kinematics` *(NEW — council)* | Applies converted energy to kinematic intent: joints, gears, linkages, propellers, rotors, control surfaces, end-effector jaws, dish actuators, turbine blades, impellers, agitators. Distinct from 2 (which only changes energy domain) — this is where mechanical motion is shaped and delivered. |
| 11 | `mass_fluid_transport_process` *(NEW — council)* | Internal pumping, valving, mixing, filtration, separation, phase change, biological/chemical processing — distinct from passive containment in 3 and from environmental heat/mass exchange in 7. The product's *internal* matter flow lives here. |
| 12 | `hmi_ergonomics` *(NEW — council)* | Operator-facing touchpoints and ergonomic surfaces: touchscreens, haptics, displays, manual controls, sight glasses, ergonomic grips, biocompatible/wearable interfaces. Operator-facing only; external connectors stay in 8 (electrical) or 11 (fluid). |

### §3.1 Examples per baseline class for the 3 council additions

For the 10 baseline product classes, the council's coverage matrix (in `../COUNCIL-UNIVERSAL-TAXONOMY-2026-05-11.md`) shows where modules 10–12 land hardest. Concrete characters per baseline:

- **`actuation_kinematics` (10)**:
  - Drone — rotors, gimbal motors, ESCs, propeller hubs.
  - Bioreactor — agitator/impeller assembly, magnetic stirrer drive.
  - Heat pump — scroll/rotary compressor, expansion valve actuator.
  - AUV — thrusters, rudder servos, ballast pump motor.
  - Tidal converter — turbine blades, gearbox, pitch actuators.
  - RO desalination skid — high-pressure plunger pump driver.
  - Surgical end-effector — jaw actuators, articulation cables, joint motors.
  - Satellite ground station — dish azimuth / elevation actuators.

- **`mass_fluid_transport_process` (11)**:
  - Heat pump — refrigerant circuit, evaporator/condenser flow paths.
  - Bioreactor — media loops, sparging system, harvest line, CIP/SIP fluidics.
  - Vertical farm — irrigation lines, nutrient dosing manifold, drip emitters.
  - AUV — variable-buoyancy ballast plumbing.
  - RO desalination skid — pre-filter, RO membrane train, post-filter, brine discharge.
  - Microbrewery — wort/yeast transfer, racking valves, CIP fluid path.
  - Tidal converter — water flow shaping ducts, debris-screen flushing.
  - EV charger DC fast — liquid-cooled cable coolant loop.

- **`hmi_ergonomics` (12)**:
  - EV charger — operator screen, RFID/NFC touch surface, cable-handle grip.
  - CGM — skin-adhesive patch, biocompatible housing, audible/haptic alerts.
  - Bioreactor — sample ports, sight glass, manual valves, control HMI.
  - Microbrewery — sight glass, manual sample valve, brewer-facing controls.
  - RO desalination skid — operator HMI panel, sample tap.
  - Satellite ground station — operations console, manual override controls.
  - Surgical end-effector — surgeon-side haptic feedback, grip ergonomics.

A product instance that has zero entries for one of these new modules marks it as `excluded` with rationale (just as for the original 9). E.g. an Edge AI 1U server has no `actuation_kinematics`, no `mass_fluid_transport_process`, no operator-facing `hmi_ergonomics` — three explicit exclusions are perfectly valid.

**Why 12, not 9.** Original brief proposed 9. The 4-seat council (Grok + Gemini + GLM + Sonnet) ran 2026-05-11 unanimously added the three above — without them, 11 of 15 test products force shoehorning of moving / processing / user-facing components into adjacent modules (drone rotors and bioreactor impellers ending up in `energy_conversion_transduction`; refrigerant loops and brewery wort ending up split across `structure_containment` and `environmental_interface`; touchscreens scattering across `sensing_instrumentation` and `control_compute_communication`). Three of the renames also tightened orthogonality boundaries — `interface` → `environmental_interface` (cosmetic clarity vs the data-interface concept in Stage 2 PA), and the boundary clauses on 6/8/9 were sharpened.

**Multi-classification.** A single component or module can legitimately serve more than one universal function. A pump is PRIMARY `actuation_kinematics` (it imparts kinematic intent to a fluid via an impeller) and SECONDARY `mass_fluid_transport_process` (it moves the working fluid through the system). A solar panel is PRIMARY `energy_conversion_transduction` (PV cells) and SECONDARY `structure_containment` (the rigid module body). The `secondary_modules?: UniversalModule[]` field on `ModuleSpec` carries this dual-classification — Stage 2 uses it to broaden `allowed_radicals` for that module (union of primary + secondary defaults). v1 consumes this (NOT deferred to Iter 3.5) because multi-classification matters for unseen-class universality probes.

**Excluded modules** — every product will mark some as N/A. A flow-through heat exchanger has no `energy_storage_source`. A passive optical sensor has no `power_distribution`. A pure-mechanical hand tool has no `control_compute_communication`. The exclusion is explicit in the `ModuleDecomposition.excluded_modules` field so downstream stages can reason about absence as deliberate, not missing. Sum of `modules.length + excluded_modules.length` MUST equal 12.

---

## §4 Stage 1.5 — Module Decomposition (NEW)

### 4.1 Input/output contract

**Input:**
- `parsedBrief: StructuredBriefJSON` (current Stage 1 output — unchanged)
- `classification: string` (current PA Stage 2 output — unchanged)
- `regulatoryExtraction?: RegulatoryExtraction` (current PA Stage 4 output — unchanged)

**Output:** `StageResult<ModuleDecomposition>` (see types skeleton).

The contract is purely additive — Stage 1.5 lives between current Stages 4 and 5/2 in the PA flow, and between current Stages 1 and 2 in the radical flow. No upstream stage has its signature changed.

### 4.2 LLM prompt strategy

```
SYSTEM
You are decomposing a hardware product into a fixed set of 12 universal
engineering modules. Your output is a JSON object naming which of the 12
modules apply, with a 2–3 sentence module_brief for each, derived
parameters, and the subset of the 22 universal radicals that are
appropriate for this module on this product.

A module may be marked as PRIMARY for a component AND SECONDARY for
another universal function it also serves (e.g. a pump is primary
`actuation_kinematics` and secondary `mass_fluid_transport_process`;
a solar panel is primary `energy_conversion_transduction` and secondary
`structure_containment`). Use the `secondary_modules` array on a
ModuleSpec to express this dual-classification — do NOT force a single
choice when both apply.

THE 12 UNIVERSAL MODULES
{{taxonomy_block}}    // §3 above, rendered

ALLOWED RADICALS PER MODULE (default mapping — refine for the product)
{{allowed_radicals_default}}    // see §5.2

USER
[Structured brief]
{{parsedBrief}}

[Classification]
{{classification}}

[Regulatory context — first 20 entries]
{{regulatoryExtraction}}

[Output schema]
{
  "product_class": "<classification>",
  "modules": [
    {
      "module": "<one of the 12>",
      "module_brief": "<2-3 sentences specific to THIS product>",
      "derived_parameters": { "<key>": <number|string> },
      "allowed_radicals": ["<radical_id>", ...],
      "applicability_confidence": "high|medium|low",
      "secondary_modules": ["<universal_module>", ...]   // optional, omit if N/A
    }
  ],
  "excluded_modules": ["<module>", ...],   // sum(modules)+sum(excluded) MUST = 12
  "rationale_excluded": { "<module>": "<why N/A>" }
}
```

Temperature 0.0. Models: `google/gemini-3.1-pro-preview` primary, `x-ai/grok-4.3` fallback (matches current Stage 2). max_tokens: 4096 (small output — module catalog only, no leaf list).

### 4.3 Council validation step

After the LLM emits the catalog, run a **4-seat council** (Grok 4.3 + Gemini 3.1 Pro + GLM 5.1 + Sonnet 4.7) over the catalog only (not the brief). Each seat answers, with one of `OK | NEEDS_MINOR | NEEDS_MAJOR`:

1. Does the module list cover the product's functional surface? (yes/no/missing: ...)
2. Are any modules genuinely N/A but listed? (yes/no/which: ...)
3. Are derived_parameters numerically plausible? (yes/no/specific challenge: ...)

**Synthesis rule (4-seat, 50% NEEDS_MAJOR threshold):**
- **2+ seats vote NEEDS_MAJOR** → aggregate `council_verdict = 'NEEDS_MAJOR'`, retry Stage 1.5 once with council notes appended; if still NEEDS_MAJOR, fail the stage. (50% of 4 = block.)
- **1 seat votes NEEDS_MAJOR** → aggregate verdict is the worst non-block verdict from the other 3 seats: any NEEDS_MINOR among the other 3 → `'NEEDS_MINOR'`; all OK among the other 3 → `'NEEDS_MINOR'` (the lone NEEDS_MAJOR is logged in `council_notes`).
- **0 seats NEEDS_MAJOR + ≥1 NEEDS_MINOR** → `'NEEDS_MINOR'`, log notes, proceed (warn).
- **All 4 OK** → `'OK'`, proceed.

Additional gate: ≥2 modules at `'low'` applicability_confidence force `'NEEDS_MAJOR'` regardless of seat agreement (data-quality back-stop, independent of seat votes).

Council cost: ~£0.13/run (4 short reviews of a small JSON, ~33% more than the original 3-seat estimate). Still cheap relative to the Stage 2 amplification.

**Why 4 seats not 3:** Tristan-binding decision 2026-05-11. A 3-seat council with majority rule produces ties that resolve by who happens to be the swing seat — unstable for a quality gate. 4 seats with a 50% NEEDS_MAJOR threshold gives a deterministic block when half the council blocks, and otherwise defers to the worst non-block verdict (still strict). The fourth seat (Sonnet 4.7) was added because it tends to differ stylistically from Grok/Gemini/GLM and surfaces edge cases that the systems-thinker triad miss.

### 4.4 Failure modes + fallbacks

| Failure mode | Detection | Fallback |
|---|---|---|
| LLM emits invalid module key | JSON validation against `UNIVERSAL_MODULES` enum | Reject + retry with `validation_reminder` appended (one retry, then fail) |
| LLM names <3 modules | `modules.length >= 3` invariant | Likely a parse error; retry once, then fail |
| LLM names all 12 modules with `low` confidence | confidence histogram | Council ALWAYS triggers `NEEDS_MAJOR` — retry with stricter prompt |
| LLM hallucinates a module not in the 9 | Enum check rejects | Same as invalid key |
| `derived_parameters` numerically nonsensical (e.g. capacity_kwh: -50) | Range check per parameter | Strip the bad parameter, log warning, proceed |
| Council disagrees on module set | Majority rule | Use majority; record dissent in `council_notes` |
| Total Stage 1.5 failure | Returns `StageResult.ok = false` | Pipeline falls back to legacy Stage 2 (the current single-shot path) — **dual-write/dual-read for migration; see §6.2** |

---

## §5 Stage 2 — Per-Module Radical Translation (MODIFIED)

### 5.1 Loop structure

Current `runDecomposeRadical()` makes one LLM call. New flow:

```
for each module in moduleDecomposition.modules:
    leafList_module = await callLLMPerModule({
        module_brief,
        derived_parameters,
        allowed_radicals: module.allowed_radicals,    // SUBSET — narrow attention
        allowed_characters: characterLibrary.filter(c => c.radicals ⊆ module.allowed_radicals),
    })
    validate, collect

aggregatedLeafList = union(all module leaf lists)
tree = buildTreeFromLeaves(aggregatedLeafList, ...)    // existing deterministic builder, unchanged
```

Each per-module call sees ~30–60 candidate characters instead of ~335. The narrowed attention surface is what unlocks deeper decomposition per module (target: 15–30 leaves per module × 5–8 modules = 75–240 leaves total, vs current ceiling of ~40).

### 5.2 Module-specific allowed_radicals subset

Default mapping (Stage 1.5 LLM may refine per product):

| Module | Default allowed radicals |
|---|---|
| `energy_storage_source` | electrochemical_energy, lithium_iron_phosphate, hydrogen_storage, fluid_flow_state, pressure_vessel |
| `energy_conversion_transduction` | silicon_semiconductor, magnetic_coupling, electromechanical_switching, thermal_transfer, mechanical_kinetic, optical_transduction, biochemical_sensing, electrochemical_reaction, refrigerant_fluid |
| `structure_containment` | steel, aluminium_alloy, carbon_fibre_composite, polymer_thermoplastic, mineral_fibre_material, pressure_vessel |
| `sensing_instrumentation` | silicon_semiconductor, optical_sensing, chemical_sensing, biochemical_sensing, digital_logic |
| `control_compute_communication` | silicon_semiconductor, digital_logic, electrical_conducting, copper |
| `safety_protection` | chemical_suppressant, optical_sensing, chemical_sensing, electromechanical_switching, pressure_vessel |
| `environmental_interface` | thermal_transfer, refrigerant_fluid, fluid_flow_state, polymer_thermoplastic, mineral_fibre_material |
| `power_distribution` | copper, electrical_conducting, electromechanical_switching, polymer_thermoplastic, fluid_flow_state |
| `maintenance_serviceability` | steel, polymer_thermoplastic, electrical_conducting |
| `actuation_kinematics` *(NEW)* | silicon_semiconductor (motor controllers / ESCs), copper (windings), magnetic_coupling (rotor↔stator interaction), electromechanical_switching (relays, contactors, brake), polymer_thermoplastic (insulators, gear casings), mineral_fibre_material (bearings / ceramic races), mechanical_kinetic (shafts, gears, linkages) |
| `mass_fluid_transport_process` *(NEW)* | pressure_vessel (process tanks, manifolds), fluid_flow_state (pipe runs, valves), copper (process piping where appropriate), steel (high-pressure piping, RO trains), polymer_thermoplastic (gaskets, seals, soft fluid lines), chemical_sensing (in-line process monitors), refrigerant_fluid (refrigeration / process loops), electrochemical_reaction (membrane / separation chemistry) |
| `hmi_ergonomics` *(NEW)* | silicon_semiconductor (display drivers, touch controllers), polymer_thermoplastic (touch surfaces, bezels), elastomer-equivalent (mapped via polymer_thermoplastic for grips and overmoulds), optical_sensing (proximity, button backlights), mechanical_kinetic (manual valves, sight glass actuation), digital_logic (HMI controller boards), thermal_transfer (where ergonomic surfaces need heat dissipation) |

(Where the 22-radical universe lacks a perfect match for HMI grip/overmould chemistry, the LLM may use `polymer_thermoplastic` or fall back to the closest material radical; the resolver downstream catches mismatches via the prior table.)

Tristan's example holds: a BESS `energy_storage_source` gets `electrochemical_energy + lithium_iron_phosphate`, NOT `photovoltaic` (the BESS is grid-charged, not solar). A solar-charged BESS would have Stage 1.5 add `photovoltaic` to its `energy_storage_source.allowed_radicals` because the brief says so. Likewise, a pump as a ModuleSpec with PRIMARY `actuation_kinematics` and SECONDARY `mass_fluid_transport_process` gets the UNION of both module's allowed_radicals — the per-module Stage 2 call sees a wider character library so the BoM captures both motor-stator characters AND fluid-line characters in one cohesive sub-tree.

### 5.3 Per-module LLM prompt strategy

```
SYSTEM
You are decomposing the {{module}} of a {{product_class}} into LEAVES
(individual procurable parts). Output a flat JSON array of LeafRecord.

You may ONLY use character_ids from this list:
{{filtered_character_library}}     // ~30–60 entries, not the full 335

You may ONLY assign radicals from:
{{module.allowed_radicals}}

CONTEXT FROM STAGE 1.5
module_brief: {{module.module_brief}}
derived_parameters: {{module.derived_parameters}}

USER
Produce the full leaf list for THIS module only. Other modules are
handled separately — do NOT include them. Aim for 15–30 leaves with
realistic multiplicities.
```

Temperature 0.0. Models: `google/gemini-3.1-pro-preview` primary, `x-ai/grok-4.3` fallback. max_tokens 4096 per call (single-module output, smaller than the current 8192 single-shot).

### 5.4 Aggregation back to product-level paragraph

After all per-module calls return, merge into the paragraph → sentence → word → character tree the same way `buildTreeFromLeaves()` already does. The deterministic builder doesn't care WHERE the leaves came from — it only needs character_ids and multiplicities. The mapping `module → sentence` is straightforward because each `UniversalModule` corresponds to a sentence-cluster in `character-hierarchy.ts` (`energy_storage_source` → `battery_rack_assembly` for BESS, → `hydrogen_storage_module` for fuel cell, → `accumulator_assembly` for hydraulic, etc.). The hierarchy file gets a per-class mapping `universalModuleToSentenceIds[productClass][module] = string[]` added in Iter 3 implementation.

---

## §6 Migration plan

### 6.1 Code changes required (file-by-file)

The 9 → 12 module expansion is **purely a data-table change** at every code touchpoint — bump the canonical `UNIVERSAL_MODULES` enum from 9 to 12 entries, extend the `allowed_radicals_default` mapping by 3 rows, extend `class_module_priors` (where defined) by 3 columns. No structural code changes.

| File | Change |
|---|---|
| `src/lib/pdf-engine-v2/types/module-decomposition.ts` | NEW — type contracts. `UNIVERSAL_MODULES` is the 12-element tuple (DONE in this commit). `CouncilSeatReview` is 4-seat with `verdict: SeatVerdict`. `ModuleSpec.secondary_modules?` consumed in v1. |
| `src/lib/pdf-engine-v2/stages/1.7-module-decomposition.ts` | NEW — `runModuleDecomposition()` entry point. Council loop iterates 4 seats. |
| `src/lib/pdf-engine-v2/prompts.ts` | NEW exports: `MODULE_DECOMPOSITION_TAXONOMY_PROMPT` (renders the 12-module table), `MODULE_DECOMPOSITION_COUNCIL_PROMPT` (4-seat with synthesis-rule reminder), `PER_MODULE_LEAF_PROMPT`. |
| `src/lib/pdf-engine-v2/stages/2-decompose.ts` | NEW function: `runDecomposeRadicalPerModule(moduleDecomposition)` — parallel to `runDecomposeRadical`. Per-module call must union `module.allowed_radicals` with the secondary modules' defaults when `secondary_modules` is non-empty. |
| `src/lib/pdf-engine-v2/radical/character-hierarchy.ts` | NEW export: `universalModuleToSentenceIds` (per-class map). New keys for `actuation_kinematics`, `mass_fluid_transport_process`, `hmi_ergonomics` per baseline class. |
| `src/lib/pdf-engine-v2/radical/structural-builder.ts` | NEW export: `filterCharacterLibraryByRadicals(allowedRadicals)` helper for §5.3 |
| `src/lib/pdf-engine-v2/index.ts` (or wherever the pipeline orchestrator lives) | Insert Stage 1.7 between current Stage 4 (regulatory) and Stage 2 (decompose) when `RADICAL_PHASE_3_PER_MODULE=true` |

No deletions. No edits to existing function bodies — Iter 3 is **strictly additive** to keep V8/V9 batches in flight unaffected.

### 6.2 Backward compatibility

Gate the new path behind `RADICAL_PHASE_3_PER_MODULE` (default `false`). When false: existing pipeline unchanged. When true: Stage 1.7 runs, Stage 2 uses the per-module loop. This mirrors the gating pattern Iter 2 used (`RADICAL_PHASE_1_TREE_OUTPUT`).

**Dual-run window:** during the V10/V11 batch comparison, run BOTH paths on the same brief and compare leaf counts + cell ≥8 distribution. Promote to default-on only when the **§7.1 promotion gate** passes (≥10 cell-≥8 lift on 10 baselines as 3-run mean ± stddev with lift ≥ 3× stddev, AND ≥4/5 universality probes pass, AND no >2-cell regression on previously-passing cells).

### 6.3 Cost impact estimate

**Per-pipeline LLM call delta (12-module + 4-seat reconciliation):**

| Stage | Iter 2 calls | Iter 3 calls | Delta |
|---|---|---|---|
| 1.5 module decomposition | 0 | 1 | +1 |
| 1.5 council validation | 0 | 4 (parallel; was 3 in pre-reconciliation draft) | +4 |
| 2 decompose | 1 | 5–12 (one per applicable module; up to 12 vs prior 9) | +4 to +11 |
| **Total LLM calls per pipeline run** | **~12** (whole pipeline) | **~22–28** | **+10 to +16 (~80%–130% lift)** |

Token-cost multiplier per pipeline: ~1.8×–2.2× (the per-module calls are smaller individually so it's not a clean 2× on calls; the extra council seat and the 3 new modules add ~10–25% on top of the original 1.7× projection).

GBP/run estimate (gemini 3.1 pro at ~£3 per million input + £15 per million output):
- Iter 2 baseline: ~£0.40 per pipeline run.
- Iter 3 projected (post-reconciliation): ~£0.85–£1.05 per pipeline run.
- 10-baseline batch: ~£10.50 vs ~£4.00 today.
- Full V10 batch (10 briefs × 3 iters of brief revision × scoring): ~£36 vs ~£15.

#### §6.3.1 V10+ multimodal scoring methodology — 3-run mean ± stddev (mandatory)

A single multimodal scoring pass on a batch is **not** a trustworthy quality metric — temperature-0 inference is approximately reproducible but image rendering, OCR drift, and small prompt-cache effects produce single-run variance of ±0.5–1.0 cells/120 even on identical artefacts. From V10 onward, every per-V_n score reported MUST be the **mean ± stddev across 3 independent scoring runs** of the same artefact set, not a single-run number. The cost penalty:

- **3× per-V_n scoring cost**: a single V_n batch score that costs £4 today now costs £12 (3 runs × £4).
- **Promotion-gate budget impact**: each promotion check (V_n vs V_(n-1)) is a 6× LLM call (3 runs × 2 versions). Budget for ~£24 per promotion check.
- **Justification**: without the averaging, the §7 promotion gate ("≥10 cell-≥8 lift") is testing noise as much as signal. The 3-run mean + stddev makes the gate a genuine quality test: a +10 lift with stddev ≤2 is a real lift; a +10 lift with stddev ≥6 is noise and must not promote.

Any V10+ result reported as a single number is invalid and must be rejected by the watchdog.

This is structurally cheaper than the alternative (continuing to inflate the library while accepting low cell ≥8 scores → rerun more batches to grind out incremental gains, AND chasing phantom lifts that were just single-run noise).

---

## §7 Universality test plan (Phase D)

Iter 3 cannot ship as default-on until it demonstrates **universality**, not just BESS depth. The 5 unseen-class probes:

| # | Brief | Expected modules to appear | Pass: leaf count + cell ≥8 |
|---|---|---|---|
| 1 | Tidal stream generator (1 MW, North Sea) | conversion (turbine, gearbox, generator), structure (nacelle, tower, foundation), environmental_interface (anti-biofouling, anti-corrosion), control, safety, distribution | ≥80% of expected unique line items + ≥6/10 average cell score |
| 2 | RO desalination skid (1000 m³/day) | conversion (HP pump, RO membrane stack), storage (feed tank, brine tank), distribution (pre-filter, post-filter, valves), sensing (conductivity, pressure, flow), control, safety, structure, serviceability | same |
| 3 | LEO satellite ground station (Ka-band, 7.3 m dish) | conversion (LNA, downconverter, modem), structure (dish, pedestal, radome), environmental_interface (de-icing, sun shield), control, sensing, distribution, safety | same |
| 4 | Microbrewery fermentation vessel (20 hL stainless) | structure (vessel, jacket), environmental_interface (cooling jacket, insulation), sensing (pH, DO, temp, level), control, safety (PRV, sample port), distribution (CIP/SIP, racking valve), serviceability | same |
| 5 | Surgical robot end-effector (laparoscopic, 8 mm) | conversion (μ-motors, force transducers), structure (housing, articulation joints), sensing (force, position, vision), control, safety (emergency-disengage, sterilisation interface), distribution (cable harness through arm) | same |

**Pass criteria (per brief):**
1. Stage 1.5 produces a module catalog with ≥4 modules and ≥1 explicit exclusion (proves the LLM is engaging the taxonomy, not rubber-stamping all 12).
2. Stage 2 produces ≥80% of the manually-estimated unique-line-item count for that product (manual estimate done before running, sealed envelope).
3. The aggregated tree resolves cleanly into a procurable BoM (no >10% UNKNOWN_RADICAL leaves).
4. Council scorecard ≥6/10 on Design Modules and BoM sections (lower bar than baseline because library coverage is thinner for unseen classes — this is a coverage probe, not a quality probe).

**Failure handling:** if any of the 5 fails, Iter 3 ships in **opt-in mode only** (env-flag remains off by default) and the universality bug is logged for Iter 4. Do NOT ship default-on with <4/5 pass.

### §7.1 Promotion gate (binding) — V_n → V_(n+1)

**Promotion to V_(n+1) requires ALL THREE conditions to hold:**

1. **Cell-≥8 lift on baselines** — V_(n+1) achieves at least **+10 cell-≥8** vs V_n on the 10-baseline batch, measured as the **3-run mean** (not a single run; see §6.3.1). Stddev across the 3 runs MUST be ≤ 1/3 of the lift (i.e. lift ≥3× stddev) — otherwise the lift is statistical noise and the gate FAILS.
2. **Universality probes** — at least **4 of 5** unseen-class probes (§7) pass all four pass-criteria. The 4/5 threshold is the binding test for the universality goal — without it, we have not built what was specified, even if the baseline lift is huge. A V_(n+1) that scores +30 on baselines but passes only 2/5 universality probes is a regression on the universality objective and MUST NOT promote.
3. **No regression on previously-passing cells** — for any individual cell that scored ≥8 on V_n, V_(n+1) may regress at most **2 cells back below 8**. (The whole 10-baseline batch is 120 cells: 10 baselines × 12 sections. A regression of 3+ previously-passing cells is a blocker even if other cells lifted.)

**All three conditions must hold simultaneously.** Two-of-three is NOT a promotion; it is a candidate that needs work. The promotion gate is enforced by the autonomous quality watchdog (`autonomous_quality_watchdog_required`).

**Why this gate, not a softer one:** the engine's stated objective is "8/10 on every section across universal product classes". A gate that admits version-bumps which only improve baselines, OR which improve aggregate score by trading off coverage on unseen classes, OR which silently regress previously-passing cells, would steadily drift the engine away from the stated objective while reporting "improvement". Each of the three conditions guards against one of those failure modes.

---

## §8 Risks

### 8.1 LLM hallucination in module catalog

**Risk:** the LLM lists `energy_storage_source` for a flow-through device, or omits `safety_protection` from a high-voltage product. The council guard catches gross errors but not subtle ones.

**Mitigation:** maintain a `class_module_priors` table in code (NOT LLM-generated). For the 10 baselines we know which modules MUST appear (e.g. BESS MUST have 8 of the 12 — typically all except `actuation_kinematics`, `mass_fluid_transport_process`, `hmi_ergonomics`, and possibly `maintenance_serviceability` if the brief is silent). Stage 1.5 cross-checks the LLM output against the priors and flags discrepancies. For unseen classes there's no prior — accept LLM judgement + council.

### 8.2 Cost amplification (3–5× LLM calls)

Quantified in §6.3 — projected ~1.7×–2× cost lift per pipeline. Acceptable if cell ≥8 lifts +30 (per Tristan's diagnosis estimate). NOT acceptable if cell ≥8 lifts <+10 — kill criterion for Iter 3.

**Mitigation 1:** parallel module calls (`Promise.all`) — the wall-clock latency hit is ~1.3× even though token spend is 2×.
**Mitigation 2:** route per-module calls to cheaper models (`x-ai/grok-4.3` or `xiaomi/mimo-v2.5-pro`) if quality holds. Stage 1.5 stays on gemini-3.1-pro because it's the integration step.

### 8.3 Module overlap (e.g. structure vs interface on a pressure vessel)

A BESS container shell is `structure_containment` (it carries load, contains the rack) AND `environmental_interface` (it's IP55, weatherproof, fire-rated). A pressure vessel on a bioreactor is `structure_containment` AND `safety_protection` (the burst rating is a safety boundary).

**RESOLVED (no longer open):** v1 consumes `secondary_modules: UniversalModule[]` on `ModuleSpec`. Stage 1.5 prompt requires multi-classification when a component genuinely serves two universal functions (canonical examples: pumps as primary `actuation_kinematics` + secondary `mass_fluid_transport_process`; solar panels as primary `energy_conversion_transduction` + secondary `structure_containment`). Stage 2 unions the secondary module's `allowed_radicals` into the primary call so the per-module BoM captures both domains in one cohesive sub-tree. This was promoted from Iter 3.5 to v1 because multi-classification matters for unseen-class universality probes (§7) — without it, products like pumps shatter their BoM cohesion across two adjacent modules.

### 8.4 Determinism regression

The current single-shot path is reproducible at temperature=0.0. The per-module loop introduces N independent LLM calls — variance compounds. Same brief might produce a different module catalog → different per-module calls → different leaf set.

**RESOLVED (no longer open):** the V10+ scoring methodology mandates **3-run mean ± stddev** (see §6.3.1) for every reported score. This converts the determinism-regression risk from "we cannot tell if our metric is real" to "we measure the variance, and gate on the lift being ≥3× the stddev". Determinism within a single run is no longer required for the metric to be trustworthy. Plus the original mitigations remain in place (pin model versions, canonicalise the leaf list, seed council aggregation deterministically). The leaf-list HASH stability test (±5% across 3 reruns) becomes a smoke check, not the gate.

### 8.5 The mapping `universalModuleToSentenceIds[productClass][module]` becomes a maintenance burden

Per-class tables are exactly what Tristan wants to AVOID (the universality goal). For the 10 baselines the table is ~9 entries × 10 classes = 90 mappings. For unseen classes it's empty — the builder falls back to a "best-fit" sentence resolver based on character ↔ sentence matches.

**Mitigation:** for unseen classes, `buildTreeFromLeaves` already routes via `character-hierarchy`. The new mapping is only needed for the OPTIONAL hint that Stage 2 can use when constraining the per-module character library. If absent, Stage 2 falls back to "use all characters whose radicals are in `module.allowed_radicals`" — radical-based filtering, fully universal. Note: the table is now ~12 entries × 10 classes = 120 mappings (vs the original 90 with 9 modules); the maintenance burden delta from the council additions is small and the benefit (cleanly slotting actuation, process, and HMI characters into the right sentence-cluster per class) is large.

---

## Iteration kill criteria

Iter 3 implementation is dropped if, after one full implementation pass + V10 batch (3-run mean ± stddev per §6.3.1):
- Cell ≥8 lift < +10 vs Iter 2 baseline (currently 33/120, on the 3-run mean). Target: 60+/120.
- Lift / stddev ratio < 3 (the lift is statistical noise, not signal).
- Cost per run > 2.5× Iter 2 baseline.
- <4/5 unseen-class probes pass §7 criteria. (Tightened from <3/5 — the §7.1 promotion gate requires 4/5; failing the gate definition is failing the iteration.)
- > 2-cell regression on previously-passing cells.
- Determinism HASH variance > ±10% across 3 reruns of the same brief (smoke check; the 3-run averaging absorbs ordinary variance, but >10% means something structural has broken).

Any one of those = revert to Iter 2 default and re-plan.
