# PCB / KiCad Capability — Audit and Integration Handover

**Status:** audit + isolated prototype complete; engine wiring deliberately not changed  
**Reason:** the engine is being modified in another terminal  
**Prepared code:** `prototypes/pcb-capability/`

## Outcome

ForgeOS currently **knows the words** PCB and KiCad but does not have a KiCad design capability wired into the dossier chain.

Today it can:

- classify a PCB-assembly brief;
- emit PCB/PCBA BoM lines;
- price `electronic_pcb` parts;
- describe SMT/reflow/AOI manufacturing;
- simulate some power electronics with ngspice;
- draw plant electrical single-lines and panel schedules;
- display KiCad-origin STEP component models in CAD Lab;
- test whether `kicad-cli --version` is on PATH.

It cannot currently:

- create a `.kicad_pro`, `.kicad_sch`, or `.kicad_pcb`;
- distinguish consistently between a bought module, a bare IC, and a bespoke PCBA;
- invoke KiCad ERC/DRC;
- export Gerbers, drill files, placement data, or a PCBA BoM;
- add verified PCB artifacts to the dossier;
- fail honestly when a product needs a bespoke PCB but no PCB deliverable exists.

## Important discovery

A functioning predecessor implementation already exists outside this repo:

```text
/Users/tristanfischer/Developer/CentaurOS created 260126 1435/
  scripts/pcb-chain/pcb_chain.py
  scripts/lib/pcb_trigger.py
```

It uses Atopile → KiCad PCB → Specctra DSN → Freerouting → KiCad DRC → Gerber/drill/position/render exports.

The local system has:

| Capability | Installed |
|---|---|
| KiCad / `kicad-cli` | 10.0.4 |
| Atopile | 0.2.69 |
| Freerouting | 2.2.4 |
| OpenJDK | 26.x |
| KiCad symbols | 222 library files detected |
| KiCad footprints | 15,435 footprint files detected |

The current repo's heavy-tools test misses this because it looks only on PATH. On this machine `kicad-cli` is available at `/opt/homebrew/bin/kicad-cli` and inside the KiCad app bundle.

---

# Reference inventory

## Real executable PCB-adjacent code in this repo

| Path | What it really does |
|---|---|
| `scripts/lib/orchestrator/types.ts` | Declares `ToolDomain: 'pcb'` |
| `scripts/lib/orchestrator/tools/python/test_heavy_tools.py` | Version/presence check only |
| `scripts/curate-and-upload-step-library.py` | Ingests KiCad 3D STEP component bodies |
| `scripts/lib/orchestrator/tools/ngspice-real.ts` | PCS/inverter simulation, not PCB CAD |
| `scripts/lib/cost/bom-process-route.ts` | Routes board-like BoM lines through PCB assembly steps |
| `src/lib/pdf-engine-v2/component-classes.ts` | `electronic_pcb` pricing class |
| `scripts/estimate-missing-prices.tsx` | Distinguishes PCBs from OEM subsystems imperfectly |
| `scripts/blender-templates/forge_blender_lib.py` | Draws green PCB proxy slabs |
| `scripts/blender-universal/draw_single_line.py` | Plant electrical SLD, not a circuit schematic |
| `scripts/blender-universal/draw_panel_schedule.py` | Plant panel schedule, not PCB design |

## Documentation/content only

- KiCad tutorial and consumer-electronics task migrations.
- Gerber/centroid/DRC references in prompts.
- Manufacturing-technique encyclopedia entries.
- CAD Lab electronics prompts.

## Missing registration surfaces

- No `kicad:*` tool.
- No import in `scripts/lib/orchestrator/register-all.ts`.
- No PCB tool I/O schema.
- No PCB specialist prompt.
- No bespoke-PCB disposition gate.
- No PCB artifact manifest.
- No conditional PCB workbook tab.
- No ERC/DRC/manufacturing-package ship gate.

---

# Why the predecessor cannot be copied verbatim

The previous work is valuable, but it violates current engine standards:

1. `pcb_trigger.py` contains product-class allow/deny lists and a BMS special case.
2. Candidate detection depends on unresolved/TBD parts rather than board-function evidence.
3. Its COTS query treats any keyword database hit as coverage; a bare IC can falsely satisfy a finished-board need.
4. Database errors are silently swallowed.
5. It generates only the first triggered board.
6. It always generates a generic MOSFET/LED-channel design, irrespective of the requested function.
7. It stores templates and Freerouting inputs in `/tmp`.
8. It hardcodes machine-specific executable paths.
9. It hardcodes an LCSC price table in code.
10. It writes optimistic `drc: {unconnected: 0, shorts: 0}` state even when generation fails.
11. `pcb_chain.py` treats KiCad's bundled-Python crash as cosmetic; a production stage must validate artifacts after every subprocess.
12. It claims “manufacturable” from routing/DRC alone without ERC, supply-chain completeness, stackup/fab constraints, or human sign-off.

Port the mechanisms, not these weaknesses.

---

# Universal policy: when does a product need a bespoke PCB?

The decision must be made per electronic function—not per product class.

## Dispositions

```ts
type PcbDisposition =
  | 'not_applicable'
  | 'catalogue_component'
  | 'catalogue_module'
  | 'bespoke_candidate'
  | 'bespoke_required'
  | 'unresolved'
```

## Required rule

A bespoke PCB is required when all are true:

1. The item represents a board-level electronic function.
2. It is not an internal child of a purchased parent assembly.
3. No suitable **finished** catalogue module is confirmed.
4. There is independent application-specific evidence:
   - compact/custom mechanical envelope;
   - multiple functions integrated on one board;
   - safety-specific I/O or isolation;
   - RF/high-speed/controlled-impedance layout;
   - repeated topology-specific board;
   - explicit custom-electronics requirement.

## Important distinctions

- An STM32/LTC6813 distributor hit proves the **IC** exists, not that the required board exists.
- A purchased Siemens PLC, HMI, VFD, PCS, payment terminal, gateway, flight controller, or ESC does not trigger a custom board.
- Internal boards inside a purchased PCS are not separate procurement/design deliverables.
- A small embedded electronics package with no finished module and application-specific integration normally does require a bespoke PCB.
- “No database match” alone produces `bespoke_candidate`, not `bespoke_required`, unless independent constraints corroborate it.

## Prototype

Implemented outside the engine:

```text
prototypes/pcb-capability/pcb-disposition.ts
```

The ten current adversarial cases cover:

- purchased PCS internals;
- catalogue PLC;
- bare monitor IC;
- replicated BMS slave board;
- compact wearable AFE;
- RF board;
- custom board before COTS search;
- component-only catalogue hit;
- explicit bespoke intent;
- mechanical non-electronics.

---

# Target architecture

## Two-stage PCB workflow

Do not invoke KiCad from the early generic tool planner. At that point the final board function, purchased-parent decision, and net/interface requirements are not settled.

### Stage A — PCB disposition and request closure

Run after:

- deterministic/generic emitter has produced board roles;
- OEM/purchased parent relationships are settled;
- DB-only COTS coverage has run;
- contract/topology quantities are stable enough to derive interfaces.

For every candidate:

1. evaluate disposition;
2. record evidence and reason codes;
3. if bespoke is required, build a typed `PcbDesignRequest`;
4. fail/request clarification if safety-critical inputs are missing;
5. never invent unspecified interfaces or rail ratings.

### Stage B — artifact generation and verification

Run after request closure and before final drawing/workbook generation:

1. generate source schematic/project;
2. resolve symbols, footprints and manufacturer parts;
3. run ERC;
4. generate/validate PCB;
5. route;
6. run DRC;
7. export fabrication/assembly package;
8. verify required files exist and are non-empty;
9. record tool versions and input hash;
10. publish artifacts into state and drawing/workbook manifests.

This split avoids forcing an artifact generator into the first-principles calculation plan.

---

# State contract

Use an array because a product can contain several bespoke boards.

```ts
interface PcbCapabilityState {
  availability: PcbCapabilityManifest
  decisions: Array<{
    wordId: string
    subModuleId: string
    disposition: PcbDisposition
    reasons: string[]
    evidenceHash: string
  }>
  designs: PcbDesignResult[]
}
```

Do not use the predecessor's singular `state.pcbDesign`.

## Required request data

Each board request should include:

- board role/purpose;
- source submodule/parent assembly;
- input rails and maximum currents;
- channel counts;
- communication interfaces;
- isolation/safety boundaries;
- mechanical envelope;
- mounting/connector constraints;
- environmental requirements;
- production quantity;
- required standards;
- net classes and impedance/current constraints.

If these are absent, the honest result is `bespoke_required_but_request_incomplete`, not a generic LED/MOSFET board.

## Bespoke board geometry

The predecessor's `ChainConfig.board_shape` supports only `rect` and `circle`. The replacement
contract supports an arbitrary ordered perimeter of lines and arcs, internal closed cut-outs,
and plated/non-plated mounting holes:

```ts
interface PcbBoardGeometry {
  outline: PcbContour
  cutouts: PcbContour[]
  mountingHoles: PcbMountingHole[]
  source: 'brief_dimensions' | 'enclosure_interface' | 'mechanical_cad' | 'derived'
  sourceDetail: string
}
```

This supports circular, rounded, polygonal, L-shaped, notched, enclosure-following, and mixed
line/arc boards without adding shape-name branches.

The placement/routing port must also:

- place components inside the true contour, not its rectangular bounding box;
- maintain component/pad clearance from all external edges and internal cut-outs;
- place connectors on actual accessible contour segments;
- reserve mounting-hole and enclosure keep-outs;
- regenerate placement if geometry changes;
- let KiCad DRC reject malformed/open/self-intersecting Edge.Cuts.

Geometry provenance is mandatory: the board outline must come from the brief, enclosure interface,
or mechanical CAD—not a default rectangle silently substituted for a missing constraint.

---

# Artifact and quality contract

## Required artifacts

For a completed bespoke board:

- editable project/source;
- schematic;
- board layout;
- schematic PDF;
- Gerber set;
- Excellon drill files;
- pick-and-place/position files;
- assembly BoM;
- assembly drawing;
- STEP/3D model where available;
- top/bottom/3D renders;
- ERC report;
- DRC report;
- tool/version/input manifest.

## Verification

A board is complete only when:

```text
ERC errors = 0
DRC errors = 0
Unconnected items = 0
Shorts = 0
Missing footprints = 0
Missing manufacturer parts = 0
All mandatory artifact files exist and are non-empty
```

Warnings must remain visible. A DRC-clean autorouted board is still an engineering draft until reviewed for EMC, thermal, creepage/clearance, DFM, testability, and certification.

---

# Engine integration patch map (for later, after terminal is quiescent)

## 1. Capability preflight

**Targets:**

- `scripts/lib/chain-preflight.ts`
- new engine module based on `prototypes/pcb-capability/discover-pcb-capability.ts`

Behaviour:

- Record PCB capability on every run.
- PCB toolchain absence is not fatal for designs that do not require a PCB.
- Once disposition returns `bespoke_required`, missing author/verify capability becomes a routed blocking finding.

## 2. Pure disposition module

**Target:**

- promote `prototypes/pcb-capability/pcb-disposition.ts` into `scripts/lib/pcb/`

Inputs must be normalized after purchased-parent and DB-only module resolution.

Add a shadow coherence gate first:

- board name + bare IC MPN + finished-board price;
- bespoke board with non-custom manufacturer;
- purchased parent exploded into internal PCBs;
- custom PCBA required but no KiCad request;
- COTS module selected but PCB workflow invoked.

## 3. COTS coverage

Use `db-only-cascade` and forge-truth data. A match must be typed:

```ts
type CatalogueMatchKind = 'finished_module' | 'component' | 'unknown'
```

Never treat a component match as a module match. Never call live distributor APIs from the chain.

## 4. PCB artifact runner

**Targets:**

- new `scripts/lib/pcb/pcb-runner.ts`
- ported, cleaned Python under `scripts/lib/pcb/python/`

The TypeScript wrapper should follow existing tool-result provenance conventions but run as a dedicated artifact stage.

Draft boundary:

```ts
interface PcbRunner {
  discover(): Promise<PcbCapabilityManifest>
  generate(request: PcbDesignRequest, outputDir: string): Promise<PcbDesignResult>
  verify(result: PcbDesignResult): Promise<PcbVerificationResult>
}
```

All paths come from discovery/environment—not hardcoded usernames or `/tmp`.

## 5. Registration and awareness

Add capability metadata so planning/review stages know it exists:

- `scripts/lib/orchestrator/register-all.ts`
- PCB tool/capability manifest
- `scripts/lib/orchestrator/generic/relevance-sweep.ts`
- tool I/O catalogue
- specialist prompt for electronics/PCB review
- tool-archetype coherence marker distinguishing:
  - ngspice circuit simulation;
  - KiCad schematic/layout;
  - Blender mechanical PCB proxy;
  - plant SLD/panel schedule.

Do not let the LLM call a plant single-line a PCB schematic or RAD grammar “DRC” a KiCad DRC.

## 6. BoM and cost

When a bespoke board exists:

- Parent PCBA line is the procurement/design item.
- Component children provide transparent cost breakdown but do not double-count.
- PCBA unit cost = components + bare board + assembly + test + yield/scrap + setup/NRE amortisation.
- Use `manufacturer: custom-design` and `CUSTOM-<ROLE>-<REV>` internal references.
- Distributor existence gates apply to child components, not to the custom parent PN.

## 7. Workbook and drawings

Add a conditional `PCB` tab only when at least one decision is `bespoke_required` or a board result exists.

Suggested content:

- decision/evidence;
- board overview and dimensions;
- schematic;
- stackup/net classes;
- ERC/DRC status;
- component BoM;
- artifact manifest;
- top/bottom/3D images;
- unresolved engineering warnings.

If no bespoke board is needed, no PCB tab and no score penalty.

If a board is required, the PCB tab becomes part of the minimum score and cannot silently disappear.

## 8. Action logs

Record:

- capability discovery;
- disposition per candidate;
- COTS evidence kind;
- request closure;
- each external tool invocation;
- before/after hashes;
- ERC/DRC;
- artifact publication.

---

# Tests and proveCatch matrix

## Must not invoke PCB design

1. Purchased utility PCS.
2. Siemens PLC/DCS process plant.
3. HMI panel computer.
4. Purchased VFD.
5. Pixhawk/Cube flight controller.
6. Purchased ESC.
7. Standard field instrument.
8. Bare MCU/transceiver IC.
9. Explicit COTS BMS.
10. PCB inside a purchased OEM parent.

## Must invoke PCB design

1. Repeated application-specific BMS slave.
2. Compact wearable AFE/radio board.
3. RF controlled-impedance board.
4. Custom motor controller with no purchased drive.
5. Safety-specific custom I/O board.
6. Non-standard sensor interface.
7. Explicit custom electronics brief.
8. Product whose settled electronics package has no finished module and multiple integration constraints.

## Toolchain failures

- KiCad missing.
- Atopile missing.
- symbol/footprint missing.
- ERC failure.
- routing incomplete.
- DRC short.
- unconnected pad.
- export command returns success but file missing.
- stale artifact from prior run.
- tool version/input hash mismatch.

Each failure must prove it blocks a “completed PCB” claim and routes to the correct stage.

## Independent bespoke-shape acceptance (completed)

The isolated harness `prototypes/pcb-capability/standalone-shape-acceptance.ts` generated and tested
four routed KiCad boards without importing or invoking Anvil. Each board contains two copper nets,
four plated test-point pads, routed F.Cu tracks, mounting holes, silkscreen and its bespoke outline:

| Shape | DRC | Gerbers | Drill | KiCad 3D render |
|---|---|---|---|---|
| Circular | Pass | Pass | Pass | Pass |
| Rounded rectangle | Pass | Pass | Pass | Pass |
| Hexagonal | Pass | Pass | Pass | Pass |
| Irregular L-shape with circular internal cut-out | Pass | Pass | Pass | Pass |

KiCad version: 10.0.4. Every DRC JSON reported zero error-severity violations and zero
unconnected items. The run produced non-empty copper/mask/silkscreen/`Edge_Cuts` Gerbers,
NPTH/PTH drill files, editable `.kicad_pcb` files, and PNG renders under:

`/tmp/forgeos-pcb-shape-acceptance-routed`

The renders were visually inspected and showed the intended profiles and openings.

---

# Preparatory code delivered

No engine code was changed.

```text
prototypes/pcb-capability/
  README.md
  pcb-contract.ts
  pcb-disposition.ts
  pcb-outline.ts
  discover-pcb-capability.ts
  standalone-shape-acceptance.ts
```

Validation:

```text
pcb-disposition selftest: OK (10 cases)
pcb-outline selftest: OK
standalone KiCad shape acceptance: PASS (4/4)
KiCad 10.0.4 detected
Atopile 0.2.69 detected
Freerouting detected
OpenJDK detected
KiCad symbols and footprints detected
```

---

# Recommended implementation sequence

1. Review this handover and predecessor code.
2. Wait for the active engine terminal to finish.
3. Promote only capability discovery + disposition policy first.
4. Run policy shadow-only across saved BESS, CGM, drone, RAS, CO₂ and residential ESS states.
5. Inspect every false positive/negative.
6. Add request closure; still no KiCad invocation.
7. Port the artifact runner and test on isolated fixture projects.
8. Wire conditional generation.
9. Add workbook/drawing surfaces.
10. Enforce only after the golden portfolio has zero unexplained false decisions.

Do not begin by importing `pcb_trigger.py` into the chain. The policy must be correct before artifact generation can be safe.
