# Cursor Advisory Pack — Yuri PCB Repair

**Date:** 2026-07-18  
**Authority:** Claude terminal owns implementation; Cursor advises only  
**Inputs:** PCB gold-gap audit, implementation spec, firmware-proof plan, NinjaPCR worked example

## Executive advice

Do not improve the current token boards by adding density or routing. Build the missing middle layer first:

```text
electronic roles
  → procurement evidence
  → PCB architecture (0/1/N boards)
  → board scope
  → real component/symbol/pinout
  → schematic/ERC
  → channels/domains/mechanics
  → layout/DRC/fab
  → minimal firmware proof
  → HIL
```

The terminal's render work is independent. For PCB Phase 3, start with architecture in shadow and pure fixtures—no cold chains.

---

## Recommended implementation sequence

### P0 — Architecture contract in shadow

Add:

```text
src/lib/pdf-engine-v2/lib/pcb/pcb-architecture.ts
src/lib/pdf-engine-v2/lib/pcb/pcb-architecture.test.ts
```

Core output:

```ts
type PcbSystemDisposition =
  | 'not_applicable'
  | 'cots_only'
  | 'daughterboard'
  | 'single_custom'
  | 'multi_board'
  | 'unresolved'

interface PcbArchitecturePlan {
  schema: 'pcb-architecture/v1'
  systemDisposition: PcbSystemDisposition
  requiresAnyKiCadDeliverable: boolean
  assignments: PcbWordAssignment[]
  boards: PcbBoardPlan[]
  unassignedWordIds: string[]
  rationale: string[]
}
```

Every electronic word must be exactly one of:

```text
on_board(boardId)
off_board_module(moduleId)
interconnect_only
unassigned
```

`unassigned` is a HARD fitness failure.

#### Exact existing code changes

`pcb-stage.ts`

- extend `briefText()` with `parsedBrief.original_text`;
- preserve `isPcbBearing` as “has electronics,” not “needs custom PCB”;
- call `derivePcbArchitecture()` and record the plan.

`disposition.ts`

- keep `evaluatePcbDisposition()` per word;
- stop using one synthetic aggregate as final architecture;
- stop `unresolved → bespoke`;
- project architecture back to legacy disposition only for compatibility.

`pcb-procurement-evidence.ts` (new)

- extract shared COTS/module predicates from stage and generator;
- use DB-only catalogue evidence;
- no live distributor calls.

#### Required architecture fixtures

| Fixture | Expected |
|---|---|
| Colorimeter | `daughterboard` — COTS host/detector + optical source board |
| NinjaPCR | `single_custom` thermal controller |
| Poseidon | `cots_only` Arduino/CNC/driver stack |
| OpenFlexure | `cots_only` or optional motion daughterboard |
| Pioreactor | `multi_board` HAT + OD + wet actuation |
| Rodeostat | `daughterboard` analog shield + COTS MCU |
| OpenDrop | `multi_board` HV controller + electrode cartridge |

Do not branch on these product names at runtime; fixtures prove function/procurement rules.

---

### P1 — One shared readiness evaluator

Add:

```text
src/lib/pdf-engine-v2/lib/pcb/pcb-readiness.ts
```

Return:

```ts
interface PcbReadinessResult {
  fabricationExportHygieneOk: boolean
  pcbDesignFitnessOk: boolean
  firmwareProofOk: boolean
  readiness:
    | 'FAIL'
    | 'ENGINEERING_DRAFT'
    | 'FAB_READY_UNPROVEN_IN_HARDWARE'
    | 'FUNCTIONALLY_VERIFIED'
  reasons: string[]
}
```

Consumers:

- chain;
- PCB gate;
- Verification spine;
- Excel PCB tab;
- sync-heal.

Remove duplicate readiness policy from Excel after parity fixtures are green.

#### Gate split

- Gate 38: fabrication-export hygiene;
- Gate 39: PCB design fitness;
- Gate 40: firmware/HIL proof.

Shadow first. Register all in `gate-registry.ts` with proveCatch.

---

### P2 — Board scope controls generation

Change:

```ts
generateAtopileProject(
  state,
  outDir,
  { architecturePlan, boardPlan }
)
```

Only `boardPlan.requiredWordIds` enter the project.

For multi-board:

```text
pcb-project/<boardId>/
pcb/<boardId>/
state.pcb.pipeline.boards[boardId]
```

Do not re-run off-board regex inference inside the generator after architecture has assigned scope.

Channel replication:

```ts
expandBoardChannels(boardPlan, resolvedComponents)
```

Must create complete driver/sense/connector groups from contract quantities.

---

### P3 — Real component and schematic truth

Add:

```text
pcb-component-resolution.ts
pcb-symbol-pinout.ts
```

FAB component requires:

```text
verified MPN
AND function-role compatibility
AND KiCad symbol
AND full pinout
AND footprint
AND ratings/provenance
```

Do not promote a part to `mpn_package` from part-number text alone.

Forbid these in a FAB path:

- `TBD (detailed design)`;
- 4-pin stub on LQFP-48;
- invented `SIG_IN_n` / `SIG_OUT_n`;
- unmatched topology edge silently skipped.

Unmatched topology becomes `unresolved_topology_edge`.

Generate a real schematic and run ERC before board layout.

---

### P4 — Domain constraints reach copper

Board plan domains:

```text
logic
analog
power
high_voltage
wet_interface
thermal_actuation
motion_actuation
```

Examples:

- NinjaPCR power → current, copper weight, switch/connector/thermal requirements;
- Rodeostat analog → ± rails, reference, guard, isolation, electrode connector;
- OpenDrop HV → isolation/creepage, HV/LV domains, cartridge connector;
- Pioreactor wet interface → isolation/slot/connectors.

Use board-plan mechanics for outlines, mounting holes, cutouts and connector faces. Stop rounded-square area-only outlines.

---

## Exact PCB completeness metrics

The terminal asked what to gate. Use conditional engineering metrics, not universal “vias > 0” rules.

### 1. Scope completeness — governing

```text
assigned_required_roles / required_roles = 100%
unassigned HARD roles = 0
```

Interim diagnostic ratio:

```text
on-board implemented roles / boardPlan.requiredWordIds ≥ 80%
```

But FAB_READY still requires every HARD role.

### 2. Component identity

For FAB_READY:

```text
verified MPN + symbol + footprint + pinout = 100% of fitted components
TBD count = 0
role-incompatible MPN count = 0
```

Passives may use verified value/package/manufacturer ordering code, but still need procurement identity.

### 3. Pin/pad utilisation

Per IC:

```text
(connected pads + explicitly NC pads) / physical pads ≥ 90%
all power/ground pins classified = 100%
```

Do not count undeclared pads as acceptable.

### 4. Channel implementation

```text
implemented channel groups ≥ contract required count
```

Each group must contain every required driver/sense/connector role.

### 5. ERC/DRC/routing

```text
ERC violations = 0
DRC violations = 0
unrouted nets = 0
```

### 6. Layer/plane honesty

Do **not** require vias universally:

- a genuine two-layer passive LED board can validly have zero vias;
- if four layers are declared, at least two copper layers must carry meaningful copper;
- power boards require ground/power zones;
- `zone_count > 0` is conditional on domain, not universal;
- vias are required only when the design uses multiple routed layers or thermal vias are specified.

Gate:

```text
declared stack-up matches used copper
```

### 7. Mechanical closure

```text
outline source = boardPlan mechanical contract
required mounting holes present = 100%
connector-face alignment closed
required slots/creepage cutouts present
```

### 8. Manufacturing package parity

Reference sets must match:

```text
schematic == PCB == BOM == PnP == assembly drawing
```

No missing or extra fitted refs.

### 9. Populated SIGHT

3D/STEP render must contain fitted component bodies and connectors. A pad-only green board fails fitness.

### 10. Firmware proof

Before hardware:

```text
real target compile PASS
bus/component/channel proof PASS
safe-default proof PASS
```

Status is still:

```text
FAB_READY — UNPROVEN IN HARDWARE
```

Only current-revision populated-board HIL permits `FUNCTIONALLY_VERIFIED`.

---

## Universal board-shape grammar

Anvil must not generate every PCB as a rounded square from estimated footprint
area. Board shape is a mechanical/electrical phenotype derived from role,
interfaces, manufacturing and the product CAD envelope.

Add to each `PcbBoardPlan`:

```ts
interface PcbShapeContract {
  shapeFamily:
    | 'optical_registration_plate'
    | 'host_module_shield'
    | 'thermal_power_base'
    | 'linear_channel_spine'
    | 'wet_lab_hat'
    | 'precision_analog_shield'
    | 'high_voltage_controller'
    | 'electrode_cartridge'
    | 'generic_rectangular'
  outlineBasis:
    | 'mechanical_cad'
    | 'host_module_standard'
    | 'connector_pitch'
    | 'optical_axis'
    | 'thermal_interface'
    | 'channel_pitch'
  requiredDatums: Array<{
    role: string
    xMm: number
    yMm: number
    toleranceMm: number
  }>
  mountingPattern: {
    count: number
    holeDiameterMm: number
    source: string
  }
  connectorEdges: Array<{
    interfaceRole: string
    edge: 'front' | 'rear' | 'left' | 'right' | 'top'
    clearanceMm: number
  }>
  keepouts: Array<{
    role: 'antenna' | 'creepage' | 'optics' | 'thermal' | 'wet_zone'
    source: string
  }>
}
```

### Shape derivation rules

| Functional signal | Shape consequence |
|---|---|
| Optical source aligned to a cube | small plate, optical-axis datum, four registration holes |
| Host compute module / HAT / shield | standard host outline + header datum |
| High-current thermal controller | connector edges near loads; copper/thermal interface drives area |
| N linear actuator channels | long spine; width from N×channel pitch |
| Precision analog AFE | short guarded input edge; digital/radio module at opposite edge |
| HV EWOD controller | HV/LV boundary and creepage corridor |
| Electrode array | cartridge aspect/pitch determines outline; long edge connector |
| Wet-lab board | wet connector edge separated from compute/power; slot/keepout |

### Mechanical acceptance

```text
all required datums present
all mounting holes present
connector edge/clearance closed
keepout geometry present
board outline fits owning CAD volume
```

The Blender/CAD role graph and PCB shape contract should share datum IDs. This is
how Anvil closes enclosure↔PCB co-design without product-name branches.

---

## Universal compute/radio chipset and module selection

Modern integrated wireless MCUs can collapse CPU, RAM, security, Wi-Fi,
Bluetooth and sometimes flash/PSRAM into one low-cost chip or certified module.
Anvil should actively consider them, but should not force one family into every
design.

Important distinction:

- Arduino is a development-board/module ecosystem, not one chip;
- a bare RF SoC still needs antenna/RF layout, memory, clocks, power and
  certification work;
- for low-volume instruments, a **certified module** is usually the more honest
  cost/risk choice.

### Candidate classes (2026 evidence)

| Candidate | Integrated capability | Best use |
|---|---|---|
| ESP32-C6 / C6 module | 160 MHz RISC-V, 512 KB SRAM, Wi-Fi 6 2.4 GHz, BLE 5.3, Thread/Zigbee, up to 22/30 GPIO; module options with flash/antenna | Cost-sensitive connected controls |
| ESP32-S3 module | Wi-Fi/BLE, dual-core MCU, strong USB/vector support, module flash/PSRAM options | UI, USB, camera/light DSP, many GPIO |
| Silicon Labs SiWx917 / SiWx917Y module | Cortex-M4F + independent network processor, Wi-Fi 6, BLE 5.4, 672 KB SRAM, module flash/PSRAM and certified antenna | Low-power secure instruments needing larger memory |
| TI CC3551E family | Cortex-M33, dual-band 2.4/5 GHz Wi-Fi 6 + BLE 5.4, >1 MB SRAM, strong security; external/in-package flash variants | Dual-band/security-sensitive connected instruments |
| COTS SBC/module | Linux, camera, storage, mature networking | OpenFlexure/Pioreactor-class host workloads |

Do not add these as an unverified static table in emitters. Seed verified parts
and modules into forge-truth with:

- lifecycle/status;
- unit price bands and MOQ;
- availability provenance;
- module/chip distinction;
- GPIO/peripheral counts;
- ADC/DAC capability;
- memory/flash/PSRAM;
- radio protocols/bands;
- security/OTA;
- package/module dimensions;
- antenna/certification;
- supported toolchain;
- operating voltage/temperature.

### Proposed compute-selection contract

```ts
interface ComputeRequirement {
  gpioDigital: number
  adcChannels: number
  adcResolutionBits?: number
  dacChannels: number
  pwmChannels: number
  i2cBuses: number
  spiBuses: number
  uartBuses: number
  usbRequired: boolean
  cameraRequired: boolean
  ramMinKb: number
  flashMinMb: number
  wifi: 'none' | '2.4' | 'dual_band'
  bluetooth: 'none' | 'ble'
  ieee802154Required: boolean
  linuxRequired: boolean
  realTimeControlRequired: boolean
  batchSize: number
  unitCostCeilingGbp?: number
}

interface ComputeCandidateVerdict {
  candidateId: string
  implementation: 'bare_soc' | 'certified_module' | 'development_board' | 'sbc'
  meets: string[]
  misses: string[]
  requiredCompanions: string[]
  boardAreaMm2: number
  costEvidence: string
  toolchainEvidence: string
  preferred: boolean
  rationale: string[]
}
```

### Selection algorithm

1. Derive `ComputeRequirement` from board roles/channels/interfaces.
2. Query forge-truth DB for verified candidates.
3. Reject any hard miss: GPIO, buses, memory, radio, voltage, toolchain,
   lifecycle or temperature.
4. Generate implementation alternatives:
   - finished COTS board;
   - certified module;
   - bare SoC.
5. Score total landed complexity:

```text
module/chip cost
+ companion memory/power/clock/RF
+ PCB area/layers
+ assembly
+ certification risk
+ firmware/toolchain risk
```

6. Prefer a certified module for small batches unless board area or volume cost
   justifies bare RF design.
7. Keep precision analog, high current and HV outside the radio module; integration
   does not remove domain-partition requirements.
8. Record why the winner beat alternatives.

### No “integrated chip solves everything” shortcut

An integrated wireless MCU can replace:

- MCU;
- external radio;
- some memory;
- USB/communications glue;
- basic ADC/DAC/PWM.

It does not replace:

- precision 16–24 bit ADC/TIA;
- isolated analog rails;
- high-current TEC/motor/heater drivers;
- high-voltage EWOD switching;
- galvanic isolation;
- safety cutoff;
- connectors and mechanical interfaces.

---

## Seven Yuri training mappings through universal compute rules

These are expected fixture outcomes, never runtime name branches.

| Training case | Compute candidate advice |
|---|---|
| Colorimeter | Integrated wireless/UI module is optional; simplest COTS display/MCU board + detector remains valid. ESP32-S3/C6 module is viable only if display/buttons/battery/USB are included in the whole-system comparison. |
| NinjaPCR | Modern ESP32-C6/S3 or SiWx917 module can replace legacy ESP8266 while thermal ADC and power stages remain separate. Select from GPIO, Wi-Fi, memory and toolchain evidence. |
| Poseidon | COTS Arduino/CNC stack remains valid; an ESP32 module may consolidate host connectivity and motion control only if four driver channels remain explicit. |
| OpenFlexure | Linux SBC remains preferred for camera/server workloads; wireless MCU may serve only as a motor coprocessor. |
| Pioreactor | Linux SBC remains preferred for experiment orchestration; one certified wireless MCU module may own deterministic OD/heater/stir/pump control. |
| Rodeostat | MCU/radio module can provide USB/Wi-Fi/BLE, but must sit away from and be isolated/partitioned from the precision analog shield. |
| OpenDrop | A high-GPIO MCU/module may run UI/networking and matrix control, but HV generation/isolation and electrode cartridge remain separate boards/domains. |

### Candidate proveCatch

- insufficient GPIO for channel count → reject;
- ADC resolution below analog requirement → reject;
- bare RF SoC selected at batch 20 without antenna/certification rationale → reject;
- Linux-required camera workload mapped to small MCU → reject;
- radio module placed inside guarded TIA input region → reject;
- integrated wireless MCU selected but missing flash/PSRAM companion → reject;
- candidate with no pinned firmware toolchain → max ENGINEERING DRAFT.

---

## Worked software exemplar now available

Use:

```text
docs/plans/NINJAPCR-PCB-SOFTWARE-WORKED-EXAMPLE-2026-07-18.md
prototypes/ninjapcr-pcb-software-benchmark/
prototypes/pcb-firmware-proof/
```

Evidence:

- gold schematic↔firmware contract extracted;
- native proof PASS;
- minimal ESP8266 target compile PASS;
- full frozen firmware fails modern core compatibility honestly;
- hardware status `UNVERIFIED_NO_HIL`.

Important learning:

- fan is fail-safe ON in the gold hardware/firmware, not universally OFF;
- GPIO aliases exist in the gold header;
- firmware proof must be generated from real board connectivity;
- toolchain versions are part of proof.

---

## Per-product terminal action list

### Colorimeter

- COTS compute/UI + detector;
- source daughterboard only;
- LED + calculated resistor + dual JST;
- four optical registration holes;
- host-to-board pin contract.

### NinjaPCR

- replace four-part token with integrated thermal controller;
- real sensor ADC, heater/Peltier/fan channels and cutoff;
- use the worked software proof as acceptance fixture.

### Poseidon

- choose COTS-only architecture;
- no fake custom board;
- prove four driver modules and serial channel map.

### OpenFlexure

- choose COTS-only or one three-axis motor board;
- no photodiode/MCU token board.

### Pioreactor

- multi-board HAT + OD + heater/stir/pump architecture;
- wet/dry interface proof.

### Rodeostat

- real analog shield;
- COTS MCU;
- isolated rails, reference, switches, TIA ranges and electrode connector.

### OpenDrop

- multi-board HV controller + cartridge;
- no potentiostat AFE template;
- channel capacity, isolation and creepage must prove.

---

## Suggested first terminal work block

Do only:

1. `pcb-architecture/v1` types/derivation;
2. seven pure fixtures;
3. record plan in state shadow;
4. no generator behavior change;
5. no cold chains.

Acceptance:

- seven architecture mappings correct;
- every electronic word assigned or explicitly unresolved;
- Poseidon/OpenFlexure no longer auto-bespoke;
- Pioreactor/OpenDrop can express multiple boards.

Then request Cursor review of the plan output before wiring KiCad.

