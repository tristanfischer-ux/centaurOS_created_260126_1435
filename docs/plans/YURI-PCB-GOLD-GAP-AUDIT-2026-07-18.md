# Yuri PCB Gold-Gap Audit — What We Generate vs What the Products Need

**Date:** 2026-07-18  
**Audience:** Terminal owner / PCB pipeline implementation agent  
**Status:** Read-only audit complete; suggested SOURCE changes only  
**Companion:** `docs/plans/YURI-FUNCTIONAL-FORM-COEVOLUTION-FINDINGS-2026-07-18.md`

---

## Executive verdict

The PCB pipeline is real as a **toolchain exercise** and poor as an **electronic design system**.

It successfully runs:

> electronic words → Atopile text → KiCad PCB → Freerouting → KiCad DRC → Gerbers/drill/PnP/zip

That is useful infrastructure. It proves binaries execute, footprints can be placed, some nets can be routed, KiCad can emit a zero-violation report for the generated netlist, and files can be packaged.

It does **not** prove that the board implements the product. The seven accepted runs contain sparse token boards with:

- 3–10 footprints against 12–29 claimed electronic design parts;
- 0 vias and 0 copper zones on every board;
- empty bottom/inner copper layers;
- 55–78% physically unused pads on most multi-pin packages;
- almost entirely `TBD` MPNs and `Value "?"`;
- no genuine populated 3D preview;
- no schematic/ERC evidence;
- no realistic analog, power, thermal or high-voltage partition;
- stale/incomplete BOM exports;
- no silkscreen/reference/manufacturing identity;
- no mechanical co-design beyond rounded square outlines.

All seven report:

```json
{
  "pipeline.ok": true,
  "pcbGate.reason": "clean_board",
  "pcbGate.mode": "shadow"
}
```

That status should be read as:

> “The generated token netlist produced at least one routed track, KiCad reported no violations for the nets/pins it was told about, and Gerber files exist.”

It must **not** be read as:

> “This is a correct, complete, assembly-ready PCBA for the instrument.”

### Honest grade

| Dimension | Current grade |
|---|---:|
| Toolchain invocation and artifact packaging | 6/10 |
| Bare-board fabrication hygiene | 3/10 |
| Procurement / assembly package | 1/10 |
| Electrical architecture | 1/10 |
| Domain physics implementation | 1/10 |
| Gold architecture fidelity | 1/10 |
| Chartered-EE signability | 0/10 |
| **Overall PCB work** | **approximately 2/10** |

None of the seven boards should be ordered for assembly. A board house could fabricate the copper files, but the resulting PCB would not implement the claimed product, and assembly cannot be responsibly specified from the current BOM/PnP.

---

## Evidence inspected

For each accepted run:

- `state.json` → `pcb`, `pcbGate`;
- `pcb-project/main.ato`, `ato.yaml`, `board-outline.json`;
- `pcb/board.kicad_pcb`, `board-normalised.kicad_pcb`, `board-routed.kicad_pcb`;
- `pcb/drc-report.json`;
- `pcb/gerbers/`, `pcb/drill/`;
- `pcb/positions.csv`, `pcb/pcb-fab.zip`;
- `pcb/board-top.png`, `board-bottom.png`, `board-3d.png`;
- Atopile build outputs and electronic word/off-board decisions.

Gold evidence included frozen repos, showcase images, official product PCBs and source manifests under:

`~/Downloads/Yuri_Wet_Science_Benchmark_Library/gold_standard_sources/`.

---

## Delivered-board metrics

| Product | Claimed electronic parts | Placed footprints | Connected / total pads | Floating | Nets | Segments | Vias | Zones | Actual outline | Real MPNs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| Colorimeter | 29 | 4 | 11/14 | 21% | 7 | 13 | 0 | 0 | 25×25 mm | 1 |
| NinjaPCR | 14 | 4 | 10/38 | 74% | 6 | 17 | 0 | 0 | 25×25 mm | 0 |
| Poseidon | 21 | 10 | 24/56 | 57% | 16 | 33 | 0 | 0 | 50×50 mm | 2, one wrongly assigned |
| OpenFlexure | 14 | 4 | 13/44 | 71% | 6 | 24 | 0 | 0 | 50×50 mm | 0 |
| Pioreactor | 12 | 3 | 8/36 | 78% | 6 | 13 | 0 | 0 | 25×25 mm | 0 |
| Rodeostat | 14 | 8 | 26/80 | 68% | 12 | 47 | 0 | 0 | 30×30 mm | 0 |
| OpenDrop | 16 | 10 | 30/68 | 56% | 16 | 55 | 0 | 0 | 30×30 mm | 0 |

The pad percentage is not merely a visual observation. Generic QFP/SOIC footprints are instantiated with only a few declared pins. KiCad cannot report missing electrical connections for pins the generated component model never defined.

### Visual SIGHT

Every `board-top.png` is a large rounded green square containing sparse grey pads and a few brown tracks. The “3D” images contain no visible components and are effectively the same 2D board rendering.

This immediately fails a manufacturing review:

- no fitted package bodies;
- no pin-1 marks;
- no reference designators;
- no polarity markings;
- no connector labels;
- no test points;
- no mounting-hole labels;
- no board revision;
- no keep-out or safety boundary;
- no visible ground/power planes.

By contrast:

- gold Colorimeter LED PCB visibly carries LED, resistor, dual JST connectors and four mounting holes;
- gold NinjaPCR is a dense power/control board with large connectors, power copper, relay/MOSFET areas and silkscreen;
- gold Rodeostat is a populated analog shield with its MCU module, op-amps/switches, isolated supply and connectors;
- gold OpenDrop is a dense multi-board HV platform with cartridge connector, power conversion, optoisolation and electrode hardware.

---

## What the gold products actually do electronically

The first architectural decision is often **not “generate a bespoke PCB.”** Gold shows four different procurement/design patterns.

| Product | Gold PCB architecture |
|---|---|
| Colorimeter | COTS PyBadge compute/UI + COTS TSL2591 detector + one tiny swappable LED/resistor/JST daughterboard per wavelength |
| NinjaPCR | One integrated custom thermocycler controller with Wi-Fi MCU, thermal ADC, heater/Peltier/fan power and high-current connectors |
| Poseidon | No custom PCB: Arduino Uno + CNC Shield + COTS stepper-driver modules |
| OpenFlexure | No PCB for base imaging; optional Sangaboard or Arduino Nano + ULN2003 motor control |
| Pioreactor | Multi-board: Raspberry Pi HAT + heater board + Eye-Spy OD board (+ optional temperature board) |
| Rodeostat | One custom precision analog shield + COTS ItsyBitsy M4 compute module |
| OpenDrop | Multi-board: custom SAMD21/HV main controller + electrode cartridge + connector/frame/adaptor boards |

The current stage disposition marks every one of these as:

```text
isPcbBearing = true
disposition = bespoke
```

That is already wrong for Poseidon and commonly wrong for OpenFlexure. It is incomplete for Colorimeter and catastrophically too simple for Pioreactor/OpenDrop.

---

## Product-by-product comparison

### 1. Open Colorimeter — closest architecture, still not a valid LED board

#### Gold

- No custom motherboard.
- COTS compute/UI and detector.
- Custom PCB is deliberately tiny and swappable.
- LED + ballast resistor + **two 4-pin JST-SH** connectors.
- Four mounting holes align the source board to the optical cube.
- Board size is approximately 25.4×20 mm.

#### Generated

- 25×25 mm, four footprints.
- LED, TLC5916-class driver, one 2-pin JST, decoupling capacitor.
- No resistor-determined LED current in the gold style.
- No dual daisy-chain connector.
- No four-hole optical mounting pattern.
- No detector board/interconnect proof.
- Three TBD MPNs.

#### Assessment

The decision to make a small source daughterboard is correct. The generated circuit is not the gold architecture and is not obviously preferable:

- a multi-channel TLC5916 driver is unnecessary for one swappable LED;
- a 2-pin interface omits the gold system's chained power/data interconnect;
- the mechanical registration required for optical alignment is missing.

**PCB fidelity: 3/10.**

#### Correct target

Keep the COTS spine. Generate a real source-board contract:

- wavelength-specific LED MPN;
- calculated resistor from supply/current/forward voltage;
- dual four-pin JST-SH or explicit alternative harness architecture;
- four mounting holes and source-axis datum;
- optional EEPROM/ID only if the design justifies it;
- assembly BOM/CPL per wavelength.

---

### 2. NinjaPCR — token MCU instead of a 175 W thermal controller

#### Gold

- One integrated custom board.
- ESP-WROOM Wi-Fi MCU.
- NAU7802 precision thermal measurement.
- heater MOSFET/relay;
- Peltier/fan control;
- thermistor and heater connectors;
- 12 V entry;
- heavy/high-current copper; 2 oz copper referenced;
- dense silkscreened board with mounting holes and clear functional zones.

#### Generated

- 25×25 mm, four footprints.
- generic LQFP-32, two-position terminal, LED, capacitor.
- 74% of package pads unused.
- no temperature-sensor front-end;
- no H-bridge/TEC driver;
- no heater MOSFET/SSR;
- no fan control;
- no over-temperature hardware;
- no high-current power connectors;
- no thermal copper/zones.

#### Assessment

The generated board implements no PCR-specific power or sensing function. It is an MCU placeholder.

**PCB fidelity: 1/10.**

#### Correct target

Board contract must derive from thermal power:

- TEC bidirectional current and connector;
- block heater/lid heater channels;
- fan output;
- block/lid sensors;
- independent thermal cutoff input;
- power-entry protection;
- trace-width/copper-area calculations;
- thermal via/pour requirements;
- real MCU/module and ADC pinout.

---

### 3. Poseidon — bespoke board where gold uses COTS motion electronics

#### Gold

- Arduino Uno;
- CNC Shield;
- one driver module per pump axis;
- USB serial;
- external 12 V;
- no bespoke PCB.

This is rational: the hard product problem is mechanics, calibration and software, not board design.

#### Generated

- 50×50 mm, ten footprints.
- generic MCU, one stepper-driver placeholder, one current sense, fuses, bulk caps and one terminal block.
- four-channel product represented by one driver channel.
- 57% unused pads.
- one MPN is semantically impossible: `TLC5916IDR` LED driver assigned to a 0603 current-sense resistor.

#### Assessment

The generated board is neither the gold COTS architecture nor a complete superior four-axis custom board.

**PCB fidelity: 1/10.**

#### Correct target

Disposition should choose:

1. COTS Arduino/CNC/driver stack when cost, batch and brief permit; or
2. a genuine four-channel board with four replicated driver/sense/connector groups.

Never create one channel and imply four.

---

### 4. OpenFlexure — token optical board instead of optional COTS motor control

#### Gold

- Raspberry Pi + camera are COTS.
- Base microscope requires no custom PCB.
- Motorised version may use:
  - Arduino Nano + three ULN2003 breakouts; or
  - Sangaboard motor controller.
- Illumination can be a wired LED/resistor/JST.

#### Generated

- 50×50 mm, four footprints.
- generic MCU, generic SOIC “photodiode path”, two caps.
- no three motor-driver channels;
- no motor connectors;
- no camera/SBC interface;
- no illumination driver;
- no drill holes;
- state paths still point at ephemeral `/tmp/pcb-sync-*`.

#### Assessment

The PCB is solving the wrong problem. OpenFlexure's base electronics should be COTS; if a board is authored, it should be an explicit three-axis motor controller.

**PCB fidelity: 1/10.**

---

### 5. Pioreactor — three-component MCU token vs a multi-board wet-lab stack

#### Gold

- Raspberry Pi host.
- Pioreactor HAT.
- heater/temperature board.
- Eye-Spy OD board with ADS1114-class ADC, op-amp and photodiode.
- optional temperature expansion.
- multiple wet-process connectors and board-to-board interfaces.

#### Generated

- 25×25 mm, three footprints: LQFP MCU, debug header, one capacitor.
- 78% unused pads.
- no OD LED/detector/TIA/ADC;
- no heater driver;
- no stir driver;
- no pump driver;
- no temperature input;
- no isolation;
- no wet/dry creepage slot;
- no vessel/pump connectors.

#### Assessment

This board implements essentially none of the bioreactor.

**PCB fidelity: 0–1/10.**

#### Correct target

The PCB architecture contract must permit multiple boards:

1. host HAT / compute interface;
2. OD optics board;
3. heater/stir/pump actuation board or justified grouping.

Every wet-bench interface requires connector, isolation/creepage and service evidence.

---

### 6. Rodeostat — block-diagram fragment without precision electronics

#### Gold

- ItsyBitsy M4 compute module.
- custom low-current analog shield.
- multiple real precision op-amps/switches/decoders;
- isolated ±15 V analog supply;
- Kelvin-switched TIA ranges;
- DAC scaling and reference path;
- electrode switching and external connectors;
- dense routed analog board with labelled connectors.

#### Generated

- 30×30 mm, eight footprints.
- DAC, ADC, MCU and TIA represented by generic package stubs.
- every MPN TBD.
- LQFP-48 has four declared pins.
- no electrode connector;
- no voltage reference;
- no ±10 V compliance stage;
- no isolated analog supply;
- no range switching;
- no 17.7 mm creepage slot despite the contract calculating it;
- one VCC/GND domain; no analog/digital partition.

`main.ato` demonstrates the issue directly:

```text
component Part_microcontroller_mcu_word:
    footprint = "Package_QFP:LQFP-48_7x7mm_P0.5mm"
    mpn = "TBD (detailed design) - microcontroller"
    signal VDD ~ pin 1
    signal GND ~ pin 2
    signal GPIO1 ~ pin 3
    signal GPIO2 ~ pin 4
```

KiCad sees only four electrically defined pins on a 48-pad package. The other pads do not become unconnected DRC errors.

#### Assessment

The named signal flow DAC→cell→TIA→ADC is directionally correct, making Rodeostat one of the less-wrong generated boards. It is still not a valid precision potentiostat design.

**PCB fidelity: 2/10.**

---

### 7. OpenDrop — wrong electrical domain

#### Gold

- custom SAMD21 main controller;
- MAX1771-class high-voltage generation;
- optocouplers and PhotoMOS/SSR switching;
- HV/LV separation;
- long cartridge connector;
- separate 14×8 electrode cartridge;
- optional adaptor/heater/magnet boards;
- 50–300 V-class EWOD actuation;
- multiple large, purpose-shaped PCBs.

#### Generated

- 30×30 mm, ten generic footprints.
- the same low-voltage DAC/ADC/TIA template used for Rodeostat.
- no HV boost;
- no high-voltage switches;
- no optoisolation;
- no 64/112 electrode channels;
- no cartridge connector;
- no separate electrode PCB;
- no HV creepage/clearance;
- no matrix clock/latch/bus nets;
- every MPN TBD.

#### Assessment

This is a wrong-class board. A potentiostat-like AFE does not implement electrowetting.

**PCB fidelity: 0–1/10.**

---

## Why DRC says clean

Both inspected DRC reports have:

```json
{
  "schematic_parity": [],
  "unconnected_items": [],
  "violations": [],
  "ignored_checks": [
    "missing_courtyard",
    "track_not_centered_on_via",
    "tuning_profile_track_geometries",
    "footprint_filters_mismatch",
    "footprint_type_mismatch"
  ]
}
```

The DRC result is internally honest for the generated PCB model. The model is incomplete.

Key reasons:

1. There is no reviewed schematic and no ERC.
2. Generic components define only a handful of pins.
3. Missing physical package pins are not electrical nets, so DRC cannot flag them.
4. Synthetic `SIG_IN_n` / `SIG_OUT_n` nets can connect placeholder blocks without representing a real IC pinout.
5. Footprint-type and footprint-filter mismatch checks are ignored.
6. `routed` is effectively satisfied by track presence; it is not a domain-completeness verdict.
7. DRC checks copper rules, not whether a thermocycler contains a heater driver or whether an EWOD controller has 112 HV channels.

`pipeline.ok` is therefore a **hygiene predicate over an under-specified model**.

---

## Systemic Goodhart paths

### 1. Bespoke disposition inflation

`bespoke_candidate` and unresolved electronic clusters are collapsed to `bespoke`. The system authors a board before proving that a custom board is the right architecture.

### 2. Off-board filtering makes tiny boards look complete

Large or difficult subsystems are marked off-board. The residual board routes cleanly, but the PCB gate does not prove the off-board modules exist or that their interconnects are complete.

### 3. Generic footprints masquerade as resolved electronics

A role like `current_measurement_tia` becomes a generic SOIC-8 with five pins. That is a visual block diagram, not a component.

### 4. Package presence is mistaken for MPN resolution

Some resolution tiers can earn credit from a plausible package even when the part identity/pinout came from a function-class fallback.

### 5. Single-channel logic stands in for repeated channels

Poseidon requires four drivers; OpenDrop requires dozens/hundreds of HV channels. One generic block satisfies “driver present.”

### 6. Board layers are declared, not designed

Four-layer stack-ups are exported, but all routing is on F.Cu with no vias or planes.

### 7. Post-hoc sync can mint `clean_board`

`sync-instrument-pcb-state.ts` can regenerate a token board and patch state to clean without a full chain re-evaluation of electronic design fitness.

### 8. Excel and gate semantics diverge

Excel has richer notions of PCB fitness/readiness. Gate 38 only asks whether `pipeline.ok` is true. A board can be `clean_board` while still an engineering draft.

---

## Required PCB architecture contract

Before schematic generation, emit:

```ts
interface PcbArchitectureContract {
  schema: 'pcb-architecture/v1'
  disposition: 'cots-only' | 'daughterboard' | 'single-custom' | 'multi-board'
  boards: Array<{
    boardId: string
    role: string
    requiredFunctions: string[]
    requiredWordIds: string[]
    offBoardModules: string[]
    channelRequirements: Array<{
      role: string
      count: number
    }>
    interfaces: Array<{
      role: string
      type: string
      pinsOrChannels: number
      voltageMaxV?: number
      currentMaxA?: number
    }>
    domains: Array<'logic' | 'analog' | 'power' | 'high-voltage' | 'wet-interface'>
    mechanical: {
      outlineBasis: string
      mountingHoles: number
      connectorFaces: string[]
    }
    constraints: {
      minCreepageMm?: number
      minClearanceMm?: number
      copperOz?: number
      powerTraceCurrentA?: number
      analogGuardRequired?: boolean
      isolationRequired?: boolean
    }
  }>
}
```

Gold-informed outputs:

- Colorimeter → `daughterboard`;
- NinjaPCR → `single-custom`;
- Poseidon → `cots-only` unless a superior four-channel board is explicitly selected;
- OpenFlexure → `cots-only` or optional motor daughterboard;
- Pioreactor → `multi-board`;
- Rodeostat → `single-custom` analog shield + COTS MCU;
- OpenDrop → `multi-board`.

This is architecture from function and procurement, not product-name branching.

---

## SOURCE changes recommended

### A. Disposition before generation

Files:

- `src/lib/pdf-engine-v2/lib/pcb/disposition.ts`
- `pcb-stage.ts`
- `atopile-generator.ts`

Changes:

1. Do not map `unresolved` to `bespoke`.
2. Require `requiresKiCadDeliverable === true` or a high-confidence `bespoke_required`.
3. Search cached COTS/module evidence before custom-board selection.
4. Support `multi-board`.
5. Emit explicit required-on-board and off-board scope.

### B. Real component and schematic semantics

1. No `TBD` MPN on a FAB-READY board.
2. An MPN must resolve to:
   - symbol;
   - real pinout;
   - footprint;
   - electrical ratings;
   - procurement provenance.
3. Generate a real schematic and run ERC.
4. Unmatched topology must become an unresolved HARD gap, not synthetic pins.
5. Join topology by stable word/role IDs, not display names.

### C. Domain-driven design rules

Function-keyed gates:

- repeated channels equal contract count;
- high-voltage domain has isolated boundary and creepage;
- power domain trace/pour capacity closes against current;
- low-current TIA has analog reference/guard/partition evidence;
- wet interface has connector and isolation/creepage;
- thermal controller has sensors, cutout and power switching;
- multi-board system has every board and inter-board connector.

### D. Layout and fabrication

- meaningful stack-up (or honestly use two layers);
- ground/power planes;
- vias where required;
- placement rules by domain;
- board outline from mechanical CAD;
- mounting holes and connector-face alignment;
- silkscreen/refdes/polarity/revision;
- complete BOM and CPL matching PnP;
- assembly drawing;
- programming/test connector;
- test points and manufacturing test plan.

### E. Gate alignment

Rename current status:

```text
pipeline.ok → fabrication_export_hygiene_ok
pcbGate.clean_board → generated_artifact_drc_clean
```

Add separate HARD verdict:

```text
pcb_design_fitness_ok
```

Shipping requires both.

---

## Required proveCatch gates

| Gate | Known-bad input | Must fire |
|---|---|---|
| Architecture | Poseidon marked bespoke despite complete COTS stack | wrong disposition |
| Board scope | 3 footprints vs 12 required on-board roles | partial board |
| Component identity | `TBD` MPN or function-class package | unresolved component |
| Pinout | LQFP-48 with four declared pins | schematic/package mismatch |
| Channel count | Poseidon 1 driver vs 4 channels | channel under-implementation |
| HV | OpenDrop with no HV net/isolation/creepage | wrong electrical domain |
| Analog | Rodeostat with no reference/isolated rail/electrode connector | incomplete AFE |
| Power | NinjaPCR with 0 zones and no multi-amp switch | undersized power design |
| Wet interface | Pioreactor without isolation/connector/slot | wet-boundary failure |
| Routing | `unrouted_after_freerouting > 0` | pipeline hygiene fail |
| Layer truth | four-layer declaration, no inner copper/planes | cosmetic stack-up |
| BOM/PnP | differing ref sets | assembly package fail |
| Visual | “3D” render with no populated components | populated-board proof fail |
| Provenance | post-hoc sync only | chain proof incomplete |

Use the current seven PCB directories as frozen known-bad fixtures. A new gate is not proven until it rejects them for the correct reason.

---

## Recommended implementation order

### Work block 1 — stop overstating readiness

1. Rename hygiene status.
2. Make Excel and gate use one shared readiness evaluator.
3. Reject `TBD`, partial scope, missing ERC and BOM/PnP mismatch.
4. Register PCB gate with proveCatch and remove exit-code collision.

### Work block 2 — architecture planner

1. Implement `pcb-architecture/v1`.
2. Add COTS-only/daughterboard/single/multi-board dispositions.
3. Reconcile every design electronic role to one board or off-board module.
4. Fail any unassigned role.

### Work block 3 — real schematic generation

1. MPN/package/symbol/pinout from the growing DB.
2. Real net names and stable topology IDs.
3. ERC.
4. Board-level domain and channel-count checks.

### Work block 4 — domain exemplars

Build one high-quality reference for each architecture family:

1. minimal LED daughterboard;
2. high-current thermal controller;
3. COTS-only motor stack (no fake custom PCB);
4. low-current analog shield;
5. multi-board wet-lab controller;
6. HV controller + electrode cartridge.

### Work block 5 — layout/manufacturing

Only after schematic fitness:

- domain placement;
- power/plane/creepage rules;
- mechanical outlines;
- routing;
- DRC;
- Gerbers;
- BOM/CPL;
- populated 3D SIGHT;
- test plan.

---

## Final answer to “how good is our PCB work?”

The automation plumbing is promising. It genuinely invokes professional EDA tools and produces inspectable artifacts. That is the strongest part.

The electronic engineering is currently at **demonstration-stub level**:

- the wrong board architecture is frequently selected;
- system functions disappear into off-board labels;
- generic footprints replace real parts;
- schematic and pinout truth are absent;
- domain constraints do not reach copper;
- DRC cleanliness is achieved on an impoverished model.

The result is not “seven fab-ready PCBs.” It is “seven successful dry runs of the PCB export machinery using token designs.”

Do not improve these boards by adding visual density or more generic parts. Fix the architecture and schematic truth first. The gold products show when the right answer is a tiny daughterboard, a COTS stack, one dense controller, or a multi-board system. The engine must learn that distinction before routing.
