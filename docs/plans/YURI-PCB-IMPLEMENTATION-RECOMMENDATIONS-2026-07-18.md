# Yuri PCB Pipeline — Implementation Recommendations and Code-Change Design

**Date:** 2026-07-18  
**Audience:** Claude terminal owner implementing the PCB repair  
**Status:** Implementation specification only — no production code changed by this audit  
**Prerequisites:**

1. `docs/plans/YURI-PCB-GOLD-GAP-AUDIT-2026-07-18.md`
2. `docs/plans/YURI-FUNCTIONAL-FORM-COEVOLUTION-FINDINGS-2026-07-18.md`
3. Root `CLAUDE.md` CORE FIX, SIGHT and proveCatch directives

**Collision warning:** Claude may already be changing these files. Before applying this plan, inspect the current diff and preserve any newer work that satisfies the same contracts.

---

## Purpose

This paper converts the PCB gold-gap audit into an implementation-ready SOURCE plan.

It answers:

- exactly why all seven Yuri designs became bespoke token boards;
- which current functions create each failure;
- what new intermediate contracts are needed;
- which files should change and in what order;
- why each proposed change is technically justified;
- how to preserve compatibility during rollout;
- which adversarial tests must prove every gate catches.

This is not a request to make the current sparse boards look denser. The dependency order is:

> architecture → board scope → real component identity/pinout → schematic/ERC → domain constraints → layout/routing → manufacturing outputs → readiness gate

Routing before those earlier stages only creates cleaner copper for the wrong design.

---

## Diagnosis: the complete failure chain

### Failure 1 — “has electronics” is treated as “needs a custom PCB”

`pcb-stage.ts::scanDesignForElectronicSignals()` sets:

```ts
const isPcbBearing =
  categoriesHit.has('board_role') ||
  distinctElectronicCategories.length >= 3
```

This is a reasonable detector for **electronic content**. It is not a procurement or architecture decision.

The same stage then sends one synthetic aggregate candidate into `decidePcbDisposition()`:

```ts
name: `Electronic control board (${categories.join(', ')})`
catalogueResolution: 'not_checked'
parentIsPurchasedAssembly: false
```

No real per-word procurement evidence participates.

### Failure 2 — uncertain designs are inflated to bespoke

`disposition.ts::mapToStageDisposition()` maps:

```ts
bespoke_required  → bespoke
bespoke_candidate → bespoke
unresolved        → bespoke
```

`unresolved` therefore starts KiCad instead of blocking architecture selection.

This explains the false custom boards for Poseidon and OpenFlexure, whose gold electronics are COTS-dominant.

### Failure 3 — COTS intent is invisible

`pcb-stage.ts::briefText()` omits important brief fields such as `original_text`.

The Colorimeter brief contains commercially available electronics intent there, but `EXPLICIT_COTS_PATTERN` never sees it.

`deriveDispositionSignals()` also assumes:

```ts
parentIsPurchasedAssembly: false
```

for every design.

### Failure 4 — architecture and board scope do not exist

The stage has only:

```ts
'bespoke' | 'cots-modules' | 'none'
```

It cannot express:

- COTS-only;
- COTS spine + one daughterboard;
- one integrated custom controller;
- multiple custom boards.

`generateAtopileProject()` always emits one `main.ato`. Pioreactor and OpenDrop cannot be represented honestly.

### Failure 5 — smart off-board filtering runs too late

`atopile-generator.ts::offBoardCotsReason()` has richer knowledge than the stage:

- compute/UI modules;
- detector modules;
- thermal assemblies;
- purchased power/sense modules;
- optomechanics.

But it runs only **after** the design has already been declared bespoke.

The generator strips hard subsystems off-board and routes the small remainder. No contract proves the off-board modules exist or that the remaining board has the required mating connectors.

### Failure 6 — quantity is recorded but not instantiated

`collectElectronicWords()` carries `quantity`. `AtopileComponentRecord` carries `quantityInDesign`.

Neither creates repeated instances.

Consequences:

- Poseidon `channel_count=4` → one driver;
- OpenDrop dozens/hundreds of electrodes → zero electrode channels;
- OpenFlexure three stage axes → no replicated motor-driver group.

### Failure 7 — footprint packages substitute for components

`FUNCTION_CLASS_DEFAULTS` maps roles to packages and short fake pin lists:

```ts
microcontroller → LQFP-32 + [VDD, GND, GPIO1, GPIO2]
op_amp          → SOIC-8  + [VCC, GND, IN_POS, IN_NEG, OUT]
```

The physical package may have 32 or 48 pads while the electrical component declares four or five pins.

KiCad cannot report unconnected pads that are absent from the generated electrical model.

### Failure 8 — MPN presence can inflate resolution tier

The generator can promote a resolved footprint to `mpn_package` when a part-number string exists even if:

- DB lookup failed;
- the footprint came from a function-class default;
- the MPN belongs to the wrong component class.

This produced `TLC5916IDR` assigned to a Poseidon current-sense resistor.

### Failure 9 — topology becomes invented pins

`buildNets()` joins topology by display-name matching and creates:

```ts
SIG_OUT_n
SIG_IN_n
```

If an endpoint does not match, the edge is silently skipped.

This produces routable block-diagram nets without real pin functions, and it hides topology loss.

### Failure 10 — one power domain is used for every product

The net builder creates:

```text
VCC
GND
optional BATT
```

It cannot represent:

- AGND/DGND/PGND;
- isolated analog rails;
- ±15 V potentiostat rails;
- 12 V motor/thermal power;
- 160–300 V EWOD;
- high-voltage return;
- wet-interface isolation boundaries.

### Failure 11 — layout declares capability it does not use

`pcb_pipeline_runner.py` can declare four layers based on power-net names, but it creates:

- no copper zones;
- no plane assignment;
- no via strategy.

All seven Yuri boards route on F.Cu only. Empty layer Gerbers still count as files.

### Failure 12 — `pipeline.ok` validates the thin model

Current final predicate:

```py
result["ok"] = (
    result["routed"]
    and drc_ran
    and violations == 0
    and gerbers_present
)
```

Where:

- `routed = track_count > 0`;
- `unrouted_after_freerouting` is recorded but not part of `ok`;
- DRC only sees declared nets/pins;
- Gerber presence does not prove meaningful copper or assembly data.

### Failure 13 — gate and dossier disagree

`pcb-gate.ts` calls `pipeline.ok === true`:

```ts
reason: 'clean_board'
```

Excel has a stricter `_pcb_readiness_verdict()` with partial scope and design-fitness checks.

Therefore the same board can be:

- `pcbGate: clean_board`;
- Verification HARD “PCB pipeline ok”: PASS;
- PCB tab: ENGINEERING DRAFT.

### Failure 14 — post-hoc sync can mint clean state

`sync-instrument-pcb-state.ts`:

1. regenerates one board;
2. patches `state.pcb.pipeline`;
3. sets author/route/export booleans;
4. re-runs the hygiene-only gate;
5. overwrites `pcbGate.mode` with shadow.

It does not re-plan architecture or evaluate design fitness.

---

## Design decisions for the repair

### Decision A — separate architecture from fabrication

Use two distinct objects:

1. `PcbArchitecturePlan`: what electronic system should exist.
2. `PcbPipelineRecord`: what the EDA tools produced for each required board.

Why:

- COTS-only designs should not enter KiCad.
- multi-board systems require 0–N pipelines;
- board completeness must be judged against an explicit scope;
- generator heuristics should not decide procurement while emitting components.

### Decision B — separate hygiene from fitness

Use two verdict axes:

```text
fabricationExportHygieneOk
pcbDesignFitnessOk
```

Why:

- KiCad DRC is necessary and valuable;
- DRC does not prove electrical function;
- preserving the hygiene signal avoids throwing away real pipeline progress;
- a combined readiness result can block overstatement without mislabelling DRC.

### Decision C — uncertain does not mean bespoke

`unresolved` should be an honest planning failure, not authorization to create a generic custom board.

Why:

- custom design is not the conservative answer when COTS evidence is missing;
- an invented board creates false confidence and extra cost;
- unresolved procurement should route to DB/engineering work.

### Decision D — every electronic role gets exactly one placement

Each role must be:

- on a named custom board;
- inside a named purchased module;
- interconnect/mechanical-only;
- explicitly unassigned.

Unassigned is a HARD fitness failure.

Why:

- prevents off-board disappearance;
- creates an auditable whole-system electronic architecture;
- makes partial-board scope deterministic instead of ratio-based guesswork.

### Decision E — no FAB-READY without real pinout

A package family is useful for concept layout, but it is not a manufacturing component.

Why:

- pinout determines nets, routing, ERC, power and package compatibility;
- an LQFP shape with four invented pins is not electronically meaningful;
- TBD and function-class components can remain ENGINEERING DRAFT.

### Decision F — product slugs do not select PCB architecture

Use:

- contract quantities;
- topology;
- function roles;
- procurement evidence;
- electrical domains;
- mechanical interfaces.

Gold product mappings belong in tests as training cases, not runtime branches.

---

## Target data contracts

### 1. PCB architecture

**Recommended file:**  
`src/lib/pdf-engine-v2/lib/pcb/pcb-architecture.ts`

```ts
export const PCB_ARCHITECTURE_SCHEMA = 'pcb-architecture/v1' as const

export type PcbSystemDisposition =
  | 'not_applicable'
  | 'cots_only'
  | 'daughterboard'
  | 'single_custom'
  | 'multi_board'
  | 'unresolved'

export type PcbElectricalDomain =
  | 'logic'
  | 'analog'
  | 'power'
  | 'high_voltage'
  | 'wet_interface'
  | 'thermal_actuation'
  | 'motion_actuation'
  | 'rf'

export type PcbWordPlacement =
  | 'on_board'
  | 'off_board_module'
  | 'interconnect_only'
  | 'unassigned'

export interface PcbWordAssignment {
  wordId: string
  moduleId: string
  subModuleId: string
  nameHuman: string
  placement: PcbWordPlacement
  boardId?: string
  catalogueResolution:
    | 'confirmed_finished_module'
    | 'confirmed_component_only'
    | 'confirmed_no_finished_module'
    | 'not_checked'
  disposition:
    | 'not_applicable'
    | 'catalogue_component'
    | 'catalogue_module'
    | 'bespoke_candidate'
    | 'bespoke_required'
    | 'unresolved'
  reasons: string[]
}

export interface PcbChannelRequirement {
  role: string
  count: number
  basisQuantityKeys: string[]
  replicate: 'identical' | 'parametric'
}

export interface PcbInterfaceRequirement {
  role: string
  type: string
  count: number
  pinsOrChannels: number
  voltageMaxV?: number
  currentMaxA?: number
  signalKind: 'power' | 'signal' | 'mixed' | 'high_voltage'
  matesWithBoardId?: string
  matesWithOffBoardWordIds?: string[]
}

export interface PcbBoardPlan {
  boardId: string
  role: string
  requiredFunctions: string[]
  requiredWordIds: string[]
  offBoardModuleWordIds: string[]
  channelRequirements: PcbChannelRequirement[]
  interfaces: PcbInterfaceRequirement[]
  domains: PcbElectricalDomain[]
  mechanical: {
    outlineBasis:
      | 'brief_dimensions'
      | 'enclosure_interface'
      | 'mechanical_cad'
      | 'optical_registration'
      | 'cartridge_pitch'
      | 'derived'
    outlineSourceDetail: string
    maxOutlineMm?: { w: number; h: number }
    mountingHoles: number
    mountingPattern?: string
    connectorFaces: string[]
  }
  constraints: {
    minCreepageMm?: number
    minClearanceMm?: number
    galvanicIsolationRequired?: boolean
    copperOz?: number
    layerCountHonest?: 2 | 4
    powerTraceCurrentA?: number
    thermalViaRequired?: boolean
    analogGuardRequired?: boolean
    wetDrySlotMm?: number
    constraintProvenance: Record<string, string>
  }
  requiresKiCadDeliverable: boolean
}

export interface PcbArchitecturePlan {
  schema: typeof PCB_ARCHITECTURE_SCHEMA
  systemDisposition: PcbSystemDisposition
  requiresAnyKiCadDeliverable: boolean
  assignments: PcbWordAssignment[]
  boards: PcbBoardPlan[]
  unassignedWordIds: string[]
  warnings: string[]
  rationale: string[]
  confidence: 'high' | 'medium' | 'low'
}
```

### 2. Resolved component truth

**Recommended file:**  
`src/lib/pdf-engine-v2/lib/pcb/pcb-component-resolution.ts`

```ts
export interface PcbPinSpec {
  number: string
  name: string
  kind:
    | 'power_in'
    | 'power_out'
    | 'ground'
    | 'input'
    | 'output'
    | 'bidirectional'
    | 'passive'
    | 'nc'
  domain?: PcbElectricalDomain
}

export interface ResolvedPcbComponent {
  wordId: string
  instanceName: string
  manufacturer: string | null
  partNumber: string | null
  mpnVerified: boolean
  procurementProvenance: string | null
  functionClass: string
  symbolId: string | null
  footprint: {
    library: string
    footprint: string
    padCount: number | null
  } | null
  pins: PcbPinSpec[]
  resolutionTier:
    | 'mpn_symbol_footprint'
    | 'mpn_package_only'
    | 'package_family'
    | 'function_class'
    | 'unresolved'
  resolutionBasis: string
}
```

### 3. Board metrics

**Runner output:** `pcb-board-metrics/v1`

```ts
export interface PcbBoardMetrics {
  schema: 'pcb-board-metrics/v1'
  footprintCount: number
  padCountTotal: number
  padCountWithNet: number
  padFloatingRatio: number
  segmentCount: number
  viaCount: number
  zoneCount: number
  declaredCopperLayers: string[]
  layersWithCopper: string[]
  innerLayersEmpty: boolean
  stackUpHonest: boolean
  schematicExists: boolean
  ercRan: boolean
  ercViolations: number | null
  bomRefCount: number
  posRefCount: number
  generatorRefCount: number
  bomPosRefParityOk: boolean
  tbdMpnCount: number
  functionClassOnlyCount: number
  populated3dProofPath?: string
  renderHasPopulatedBodies: boolean | null
}
```

### 4. Shared readiness

**Recommended file:**  
`src/lib/pdf-engine-v2/lib/pcb/pcb-readiness.ts`

```ts
export interface PcbReadinessResult {
  schema: 'pcb-readiness/v1'
  fabricationExportHygieneOk: boolean
  pcbDesignFitnessOk: boolean
  readiness: 'FAIL' | 'ENGINEERING_DRAFT' | 'FAB_READY'
  hygieneReasons: string[]
  fitnessReasons: string[]
  scoreCap: 2 | 6 | null
  provenance: 'chain' | 'sync_heal' | 'manual_patch'
}
```

---

## Architecture derivation algorithm

### Step 1 — collect all electronic words with rejection reasons

Modify `collectElectronicWords()` to return both:

```ts
{
  included: ElectronicWordRef[]
  excluded: Array<{
    wordId: string
    reason: 'generic_placeholder' | 'no_electronic_category'
  }>
}
```

Why:

- the current function silently discards words;
- architecture completeness needs to distinguish non-electronic from missed electronic vocabulary;
- excluded words are useful for corpus/grammar improvement.

### Step 2 — build per-word procurement evidence

**New file:** `pcb-candidate-evidence.ts`

For each included electronic word:

1. read manufacturer/MPN/form/quantity;
2. infer parent purchased assembly;
3. query DB-only catalogue cache;
4. classify finished module vs component-only;
5. run existing six-way `evaluatePcbDisposition()`.

Do not call live distributor APIs. Follow `CHAIN-AS-DB-CONSUMER`.

Why:

- the existing evaluator is useful but is only called on one synthetic aggregate;
- per-word evidence is required to distinguish an Arduino module from a MOSFET.

### Step 3 — centralise procurement predicates

Extract overlapping regexes from:

- `disposition.ts::PURCHASED_MODULE_PATTERN`;
- `atopile-generator.ts::offBoardCotsReason()`;
- compute/UI/detector/thermal module regexes.

**New file:** `pcb-procurement-evidence.ts`

Expose:

```ts
classifyPurchasedModule(word, state): {
  isFinishedModule: boolean
  moduleRole: string | null
  reason: string
}
```

Why:

- stage and generator currently reason differently;
- one shared predicate prevents architecture/generator disagreement;
- architecture must know COTS evidence before deciding whether to author a board.

### Step 4 — infer system disposition

Decision tree:

```text
no electronic board function
  → not_applicable

all electronic functions assigned to finished modules/interconnects
  → cots_only

COTS host + one custom function cluster
  → daughterboard

one connected custom function cluster owns most required roles
  → single_custom

two or more separated clusters, or mandatory domain separation
  → multi_board

unassigned required roles or unresolved procurement
  → unresolved
```

Important: unresolved must not silently become a board.

### Step 5 — cluster board functions

Use connected components over stable role/topology IDs, then split on mandatory boundaries:

- high voltage vs touch-safe logic;
- wet interface vs host compute;
- optical source registration vs host;
- cartridge vs controller;
- removable sensor daughterboard vs fixed motherboard.

Suggested reusable board roles:

```text
optical_source_daughterboard
thermal_power_controller
motion_driver_board
analog_front_end_shield
wet_lab_host_hat
od_optics_board
heater_stir_actuation_board
high_voltage_controller
electrode_cartridge
interconnect_adapter
```

These are functional roles, not product names.

### Step 6 — derive repeated channels

Read contract quantities:

| Quantity / evidence | Requirement |
|---|---|
| `channel_count` | replicate motor-driver/sense/connector group |
| `stage_axis_count` | replicate motor-axis group |
| `electrode_count` | derive electrode matrix/interface capacity |
| thermal zones/sensors | replicate sensor/actuator channel if independent |
| analog ranges | derive range-switch network, not physical channel count |

Every generated board later proves:

```text
implemented count ≥ required count
```

### Step 7 — derive domain constraints

Examples:

- thermocycler electrical power → current, copper weight, terminal rating, thermal copper;
- potentiostat compliance voltage/noise → rails, reference, guard, isolation and creepage;
- EWOD voltage → high-voltage domain, optoisolation and creepage;
- wet-lab interfaces → wet/dry slot and galvanic isolation;
- motor channels → driver current and bulk capacitance.

Record provenance for every constraint.

### Step 8 — assign every word

After planning:

```ts
all electronic word IDs
  == on-board IDs
   ∪ off-board module IDs
   ∪ interconnect-only IDs
   ∪ unassigned IDs
```

Any unassigned required word makes `pcbDesignFitnessOk=false`.

---

## Detailed file-by-file recommendations

### 1. `pcb-stage.ts`

#### Change

- extend `briefText()` with:
  - `original_text`;
  - application context;
  - explicit procurement/architecture constraints;
- preserve `scanDesignForElectronicSignals()` as electronic-content detection;
- stop using `isPcbBearing` as implicit custom-board intent;
- call architecture planner after capability discovery;
- attach `architecturePlan` to `PcbStageResult`.

#### Why

The current scanner answers “are electronics present?” correctly. Reusing it as “build a custom PCB” creates the first semantic collapse.

#### Tests

- original Colorimeter brief must set explicit COTS intent;
- a three-category COTS stack must remain PCB-bearing but architecture `cots_only`;
- a direct “custom PCB required” brief can produce `single_custom`.

---

### 2. `disposition.ts`

#### Change

- keep six-way `evaluatePcbDisposition()` for per-word decisions;
- deprecate aggregate-only `decidePcbDisposition()` as the final architecture selector;
- do not map `unresolved` to `bespoke`;
- keep legacy three-way output as a compatibility projection of `PcbArchitecturePlan`.

#### Recommended legacy projection

```ts
function legacyDisposition(plan: PcbArchitecturePlan): PcbStageDisposition {
  if (
    plan.systemDisposition === 'daughterboard' ||
    plan.systemDisposition === 'single_custom' ||
    plan.systemDisposition === 'multi_board'
  ) return 'bespoke'

  if (plan.systemDisposition === 'cots_only') return 'cots-modules'
  return 'none'
}
```

`unresolved` remains represented in `architecturePlan`, while the legacy projection is `none` only to prevent accidental pipeline execution. The fitness gate must still report unresolved.

#### Why

“Unknown” is not evidence for custom design. Pipeline execution should require a positive board plan.

---

### 3. New `pcb-architecture.ts`

#### Change

Implement:

```ts
derivePcbArchitecture(state): PcbArchitecturePlan
validateArchitectureCompleteness(plan): findings[]
```

#### Why

This missing middle layer is the largest root cause. Without it:

- generator decides scope while generating;
- multi-board cannot exist;
- COTS-only still creates boards;
- no deterministic definition of a complete board exists.

#### First rollout

Write plan into state in shadow mode without changing pipeline behavior. Prove the seven Yuri mappings before using it to gate execution.

---

### 4. `atopile-generator.ts`

#### Change A — accept a board plan

```ts
generateAtopileProject(
  state,
  outDir,
  { boardPlan, architecturePlan }
)
```

Only `boardPlan.requiredWordIds` may enter that project.

#### Why

Scope must be decided before generation. Re-running off-board regexes inside the generator can contradict the architecture.

#### Change B — remove blind tier promotion

`mpn_package` requires:

```text
MPN verified
AND role-compatible
AND package-compatible
```

Otherwise retain the actual lower tier or unresolved.

#### Why

MPN text alone caused wrong-part confidence inflation.

#### Change C — component identity/pinout

Replace `FUNCTION_CLASS_DEFAULTS.pins` in FAB paths with real symbol/pin data.

Permit function-class stubs only for ENGINEERING DRAFT, visibly marked.

#### Why

Package shape without pinout is not a component.

#### Change D — stable topology joins

Topology endpoints should carry stable word/role IDs. If a topology edge cannot bind:

```text
unresolved_topology_edge
```

must be emitted as a HARD fitness finding.

Do not invent `SIG_IN_n`/`SIG_OUT_n` in a FAB path.

#### Why

Synthetic pins make routing possible while erasing electrical meaning.

#### Change E — channel expansion

Before net generation:

```ts
expandBoardChannels(boardPlan, resolvedComponents)
```

Replicate complete groups and preserve parent role/count provenance.

#### Why

The physical number of channels is a structural requirement.

#### Change F — domain rails

Build rails from board domains:

- logic;
- analog;
- motor/thermal power;
- isolated analog;
- high voltage.

Require explicit bridges/isolation between domains.

#### Why

One VCC/GND cannot express the products' actual safety and signal-integrity requirements.

#### Change G — mechanical outline

Consume `boardPlan.mechanical`:

- outline dimensions;
- mounting holes;
- cutouts;
- connector faces;
- keepouts.

Do not derive every board as a rounded square from component area.

#### Why

PCB geometry must mate with product CAD. The Colorimeter source board's four-hole optical registration is functional, not decorative.

---

### 5. New `pcb-component-resolution.ts`

#### Change

Create a resolver pipeline:

```text
DB verified MPN
  → role compatibility
  → KiCad symbol
  → full pinout
  → footprint
  → electrical ratings
  → resolved component
```

If any FAB-critical element is unknown, return unresolved.

#### Sources

- DB-only catalogue cascade;
- `pretraining_extracted_parts`;
- KiCad symbol/footprint libraries;
- future curated component family records.

#### Why

The current DB lookup only extracts package text from description. That cannot prove symbol/pinout/role compatibility.

#### Required validation

- MPN role classifier;
- symbol pin count vs footprint pad count;
- power/ground pin existence;
- package consistency;
- rating checks against board contract.

---

### 6. `pcb_pipeline_runner.py`

#### Change A — tighten hygiene

Include:

```py
unrouted_after_freerouting == 0
```

in hygiene success.

#### Why

The runner already records this value. Leaving it outside `ok` contradicts “fully routed.”

#### Change B — emit board metrics

Add:

```py
parse_board_metrics(board_path)
```

using KiCad Python:

- footprints;
- pad/net counts;
- vias;
- zones;
- copper usage by layer;
- stack-up honesty;
- outline dimensions;
- holes/cutouts.

Write `board-metrics.json`.

#### Why

The current gate cannot distinguish a meaningful four-layer design from F.Cu-only token copper.

#### Change C — schematic/ERC

When a schematic exists:

```text
kicad-cli sch erc
```

Store report and violation count.

Until schematic generation exists, mark:

```text
schematicExists=false
ercRan=false
```

and cap at ENGINEERING DRAFT.

#### Why

DRC cannot detect missing circuit functions or fake pinouts.

#### Change D — BOM/PnP parity

Export a manufacturing BOM and compare reference sets:

```text
generator refs == schematic refs == PCB refs == BOM refs == PnP refs
```

Mismatch is a hygiene failure.

#### Why

A board cannot be assembled when BOM and PnP disagree.

#### Change E — populated render proof

Export STEP/3D or a populated KiCad render with package models. Record whether component bodies are present.

#### Why

The current “3D” images show only pads/copper and visually conceal missing components.

#### Change F — stack-up honesty

Either:

- generate real power/ground zones and use the declared layers; or
- declare a two-layer board.

Do not count empty inner Gerbers as four-layer design evidence.

---

### 7. `pcb-pipeline.ts`

#### Change

- extend result schema with board metrics, ERC and BOM/PnP parity;
- preserve `ok` temporarily as deprecated hygiene alias;
- add `fabricationExportHygieneOk`;
- support per-board records:

```ts
pipeline: {
  boards: Record<string, PcbPipelineRecord>
  fabricationExportHygieneOk: boolean
}
```

#### Why

Multi-board systems need independent artifacts and aggregate readiness.

Aggregate hygiene is true only if every required board passes.

---

### 8. New `pcb-architecture-validator.ts`

#### Change

Implement pure findings:

```ts
evaluateArchitectureCompleteness()
evaluateBoardScope()
evaluateChannelImplementation()
evaluateDomainConstraints()
evaluateMechanicalInterfaces()
evaluateComponentResolution()
```

#### Finding codes

```text
wrong_system_disposition
unassigned_electronic_role
partial_board_scope
unresolved_component
pinout_footprint_mismatch
unresolved_topology_edge
channel_under_implementation
wrong_electrical_domain
incomplete_analog_front_end
undersized_power_design
wet_boundary_failure
missing_mechanical_interface
cosmetic_stack_up
bom_pnp_mismatch
post_hoc_sync_only
```

#### Why

Readiness needs named, routed defects—not a single score.

---

### 9. New `pcb-readiness.ts`

#### Change

One evaluator consumes:

- architecture;
- fitness findings;
- per-board pipeline records;
- disk-probe facts;
- provenance.

Returns:

```ts
FAIL | ENGINEERING_DRAFT | FAB_READY
```

#### Policy

`FAIL`:

- required board missing;
- hygiene failure;
- wrong electrical domain;
- major channel/safety failure.

`ENGINEERING_DRAFT`:

- architecture valid but TBD parts/pinouts/schematic remain;
- concept layout exported but not assembly-ready.

`FAB_READY`:

- architecture complete;
- every required board present;
- no HARD fitness findings;
- schematic/ERC clean;
- MPN/symbol/footprint truth;
- full routing/DRC;
- manufacturing package parity.

#### Why

Gate, Verification and Excel currently calculate different truths. One evaluator eliminates contradictory “clean board / draft” messages.

#### Integration choice

Preferred:

1. chain computes and persists `state.pcbReadiness`;
2. Excel reads it;
3. Excel performs a disk probe and invalidates stale/missing artifacts;
4. shared JSON test vectors prove TS and Python disk wrapper parity.

Avoid invoking TypeScript once per Excel cell. Compute once per run.

---

### 10. `pcb-gate.ts` and gate registry

#### Change

Split semantics:

- Gate 38: fabrication export hygiene;
- Gate 39: PCB design fitness.

Suggested modes:

```text
PCB_HYGIENE_ENFORCING
PCB_FITNESS_ENFORCING
```

Keep both shadow until proveCatch is wired; hygiene can move to enforcing first.

#### Why

Separating axes retains useful EDA diagnostics while preventing “DRC clean” from becoming “design ready.”

#### Registry

Add Gate 38 and 39 to `scripts/lib/gate-registry.ts`.

Every gate must:

- prove it catches;
- prove a good case passes;
- report the SOURCE stage;
- emit a routed punch-list item.

#### Exit codes

Before assigning 39, inspect current collisions. Update root `CLAUDE.md` canonical exit table in the same commit.

---

### 11. `build-excel-export.py`

#### Change

- remove duplicated readiness policy after `state.pcbReadiness` is authoritative;
- retain deterministic disk checks;
- show two axes:
  - export hygiene;
  - design fitness;
- Verification gets separate HARD rows;
- PCB tab shows every required board in multi-board systems;
- remove/invalidate any formula that can disagree with the Python/TS verdict.

#### Why

The current workbook can show hygiene PASS beside readiness DRAFT. That distinction is valid, but the labels and governing source are inconsistent.

#### Scope fix during transition

Until architecture assignments exist:

```text
n_on_board_scope =
  electronicPartCount - explicitly proven off-board module count
```

Do not replace scope with generator component count merely because the generator emitted something.

---

### 12. `sync-instrument-pcb-state.ts`

#### Change

- require or derive an architecture plan;
- regenerate each required board, not one generic board;
- write `provenance: 'sync_heal'`;
- recompute hygiene and fitness;
- never overwrite enforcing-mode metadata;
- by default, sync heal may repair hygiene but cannot upgrade to FAB_READY;
- replace product-class size regex with `boardPlan.constraints.maxSideMm`.

#### Why

The current script can patch a token board into `clean_board` without re-evaluating architecture.

---

### 13. `serial-design-chain-v2.tsx`

#### Target flow

```text
runPcbStage
  → derivePcbArchitecture
  → validate architecture
  → for every board requiring KiCad:
      resolve board components
      generate schematic/project
      run pipeline
  → evaluate design fitness
  → evaluate readiness
  → record both gates
  → enforce according to mode
```

#### Why

Architecture must control whether and how many pipelines run.

---

## Expected architecture for the seven Yuri products

These are tests, not runtime product branches.

| Product | Expected plan | Why |
|---|---|---|
| Colorimeter | daughterboard | COTS host + detector; small swappable optical source board |
| NinjaPCR | single_custom | integrated thermal sensing and high-current control |
| Poseidon | cots_only | Arduino/CNC shield/driver modules solve electronics economically |
| OpenFlexure | cots_only or one optional motion daughterboard | Pi/camera and common motor modules dominate |
| Pioreactor | multi_board | host HAT, OD optics and wet actuation have distinct roles |
| Rodeostat | daughterboard / analog shield | COTS MCU with custom precision analog core |
| OpenDrop | multi_board | HV controller and removable electrode cartridge must separate |

Acceptance is not “match gold exactly.” A superior alternative may pass if the same functional/procurement constraints are closed and the plan is complete.

---

## Test and proveCatch plan

### Frozen fixtures

Do not depend on mutable `out/` directories in CI.

Create compact fixtures under:

```text
tests/fixtures/pcb/yuri/
```

For each product, freeze:

- minimal relevant state;
- architecture inputs;
- generator summary;
- board metrics;
- expected findings.

Use current accepted runs as the source of known-bad fixtures.

### Architecture tests

| Test | Expected |
|---|---|
| COTS stepper stack | `cots_only`, no KiCad |
| Optical COTS host + source | one daughterboard |
| Thermal controller | one integrated custom board |
| Wet host + OD + actuation | multi-board |
| HV controller + cartridge | multi-board, high-voltage domain |
| unresolved procurement | unresolved, no pipeline |

### Generator tests

| Test | Must catch |
|---|---|
| non-verified MPN | cannot become `mpn_symbol_footprint` |
| TLC5916 as current shunt | role incompatibility |
| LQFP-48 with four pins | pinout-footprint mismatch |
| unmatched topology edge | HARD unresolved edge |
| channel count 4, one driver | channel under-implementation |
| high-voltage board with VCC/GND only | wrong domain |

### Runner tests

| Test | Must catch |
|---|---|
| Freerouting leaves 1 net | hygiene fail |
| four-layer board, F.Cu only | dishonest stack-up |
| power board, zero zones | power-layout finding |
| BOM refs differ from PnP | hygiene fail |
| render has no component bodies | fitness fail |
| no schematic/ERC | max ENGINEERING_DRAFT |

### Readiness tests

| Input | Verdict |
|---|---|
| clean DRC, partial token board | ENGINEERING_DRAFT |
| clean DRC, wrong domain | FAIL |
| clean DRC, unresolved MPNs | ENGINEERING_DRAFT |
| all required boards clean and fit | FAB_READY |
| COTS-only complete architecture | not applicable to KiCad, system architecture PASS |
| one of three required boards absent | FAIL |

### Gate proveCatch

Gate 38:

- dirty DRC/no Gerbers/unrouted → fires;
- clean export → silent.

Gate 39:

- current Rodeostat token board → fires on incomplete AFE;
- current OpenDrop token board → fires on wrong domain;
- synthetic fully resolved reference → silent.

---

## Migration and compatibility strategy

### Phase 0 — additive shadow fields

Add:

- `state.pcbArchitecture`;
- `state.pcbReadiness`;
- board metrics.

Do not change pipeline execution yet.

### Phase 1 — correct semantics

- add `fabricationExportHygieneOk`;
- retain `pipeline.ok` as deprecated alias;
- change UI wording from `clean_board` to `export_hygiene_ok`;
- fitness remains shadow.

### Phase 2 — architecture controls pipeline

- COTS-only skips KiCad;
- unresolved skips KiCad and records a fitness failure;
- daughterboard/single/multi board run planned projects.

### Phase 3 — real pinout requirement

- function-class stubs remain ENGINEERING DRAFT;
- FAB_READY requires real component truth;
- no immediate regression for early concept dossiers, but they cannot claim fab-ready.

### Phase 4 — enforce fitness

After known-good exemplars pass:

```text
PCB_FITNESS_ENFORCING=1
```

can become default.

---

## Recommended implementation work blocks

### Work block 1 — architecture shadow

Files:

- new `pcb-architecture.ts`;
- new tests;
- `pcb-stage.ts`;
- `disposition.ts`.

Done when:

- all seven Yuri architecture expectations pass;
- no pipeline behavior changes;
- every electronic role has a placement or explicit unassigned status.

### Work block 2 — readiness unification

Files:

- new `pcb-readiness.ts`;
- `pcb-gate.ts`;
- Excel bridge/consumer;
- gate registry;
- Verification rows.

Done when:

- one test-vector set drives chain and Excel;
- `clean_board` terminology is removed/deprecated;
- current seven boards are hygiene PASS but fitness FAIL/DRAFT for named reasons.

### Work block 3 — board metrics and hygiene

Files:

- `pcb_pipeline_runner.py`;
- `pcb-pipeline.ts`;
- runner selftests.

Done when:

- unrouted nets fail hygiene;
- stack-up, pads, zones, vias, BOM/PnP and render population are recorded;
- empty inner layers can no longer imply meaningful four-layer design.

### Work block 4 — architecture-controlled generation

Files:

- `atopile-generator.ts`;
- chain;
- sync script.

Done when:

- COTS-only emits no fake PCB;
- daughterboard emits only its assigned scope;
- multi-board emits one project/pipeline per board;
- unassigned roles block fitness.

### Work block 5 — component and schematic truth

Files:

- new component resolver;
- Atopile generator;
- schematic/ERC runner.

Done when:

- verified MPN/symbol/footprint/pinout path works;
- fake four-pin QFP cannot become FAB_READY;
- synthetic `SIG_*` pins are forbidden in enforcing mode.

### Work block 6 — domain exemplars

Build one reference per architecture family:

1. LED daughterboard;
2. thermal power controller;
3. COTS-only motion stack manifest;
4. precision analog shield;
5. wet-lab multi-board stack;
6. HV controller + cartridge.

Done when:

- each is SIGHTed and electrically reviewed;
- the corresponding known-bad Yuri fixture fails while the exemplar passes.

---

## What not to do

- Do not add more generic ICs to make boards look dense.
- Do not add product-name branches for seven gold designs.
- Do not tune DRC to hide missing schematic truth.
- Do not force four layers when only one copper layer is used.
- Do not treat every off-board label as proof a module exists.
- Do not generate a custom board when procurement is unresolved.
- Do not let sync-heal upgrade a board to FAB_READY.
- Do not run seven cold chains before pure architecture/readiness fixtures pass.

---

## Definition of done

The PCB repair is complete only when:

1. the system can intentionally choose 0, 1 or multiple custom boards;
2. every electronic role is assigned;
3. every board closes its required functions/channels/interfaces;
4. all FAB components have verified identity, symbol, pinout and footprint;
5. schematic/ERC exists and passes;
6. domain constraints reach copper/mechanics;
7. every required board is fully routed and DRC clean;
8. BOM, PnP, Gerbers, drill and assembly refs agree;
9. populated 3D SIGHT is credible;
10. gate 38 proves export hygiene;
11. gate 39 proves design fitness;
12. Excel, Verification and chain report the same readiness;
13. known-bad Yuri token boards fail for their documented reasons;
14. known-good architecture exemplars pass.

Until then, the honest wording is:

> “PCB export pipeline exercised; electronic design remains an engineering draft.”
