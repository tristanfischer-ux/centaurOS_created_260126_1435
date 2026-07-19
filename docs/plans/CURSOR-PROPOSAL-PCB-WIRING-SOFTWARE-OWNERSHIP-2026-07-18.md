# Proposal — Cursor Owns PCB, Device Wiring and Software Proof

**Date:** 2026-07-18  
**Decision owner:** Tristan  
**Proposed implementer:** Cursor, isolated worktree/branch  
**Mechanical/form owner:** Claude terminal

## Answer

Yes. The electrical design must specify:

- what each PCB does;
- whether there should be zero, one or multiple custom boards;
- board outline/shape and why;
- mounting holes/datums and service/removal direction;
- connector locations and mating parts;
- every power/signal/fluid-adjacent interface;
- cable/harness topology and physical route;
- voltage/current/wire gauge/length/voltage drop;
- strain relief, shielding, creepage and hazard separation;
- firmware pin/bus/channel contract;
- compile/simulation/HIL evidence.

The existing advice contains most pieces, but they need one governing integration
artifact consumed by Blender and Excel.

---

## Proposed boundary

### Cursor owns

```text
PCB architecture and disposition
component/module selection
compute/radio selection
schematic/symbol/pinout
PCB mechanical shape contract
KiCad board generation
ERC/DRC/Gerbers/BOM/PnP/STEP
connector selection and datum export
device wiring/harness contract
electrical sizing and route constraints
firmware bring-up proof
native/MCU compile, simulation and HIL plan
PCB/electrical readiness evidence
```

### Claude terminal owns

```text
functional-form solver
mechanical role graph
enclosure and mechanism CAD
Blender geometry/materials/cameras
construction language
mechanical assembly connectedness
render SIGHT and form proof
overall chain sequencing
```

### Shared integration points

```text
mechanical envelope/datums → Cursor
board STEP/OBJ + connector datums + harness route plan → Claude
delivered Blender transform proof → Cursor/Excel evidence
```

Neither agent edits the other agent’s core files.

---

## Governing contract: `device-electrical-assembly/v1`

```ts
interface DeviceElectricalAssembly {
  schema: 'device-electrical-assembly/v1'
  architectureHash: string
  mechanicalEnvelopeHash: string
  boards: ElectricalBoardAssembly[]
  connectors: ConnectorAssembly[]
  harnesses: HarnessAssembly[]
  offBoardModules: OffBoardModule[]
  electricalDomains: ElectricalDomain[]
  firmwareProof: FirmwareProofSummary
  findings: ElectricalAssemblyFinding[]
}
```

### Board assembly

```ts
interface ElectricalBoardAssembly {
  boardId: string
  role: string
  workPerformed: string[]
  requiredChannels: Array<{ role: string; count: number }>
  shape: {
    outlineSource: string
    outlinePointsMm: Array<[number, number]>
    thicknessMm: number
    shapeFamily: string
  }
  coordinateFrame: {
    originDatum: string
    xAxisDatum: string
    yAxisDatum: string
  }
  mounting: Array<{
    datumId: string
    positionMm: [number, number, number]
    holeDiameterMm: number
    fastener: string
  }>
  placementVolume: {
    dimensionsMm: [number, number, number]
    keepoutMm: number
  }
  serviceDirection: 'top' | 'front' | 'rear' | 'left' | 'right'
  thermal: {
    dissipationW: number
    heatsinkRequired: boolean
    airflowRequired: boolean
  }
  hazardDomains: string[]
  connectorIds: string[]
  cadArtifact: string
  pcbArtifact: string
}
```

### Connector assembly

```ts
interface ConnectorAssembly {
  connectorId: string
  boardId: string
  role: string
  manufacturer: string
  mpn: string
  pinCount: number
  pinMap: Array<{
    pin: string
    signal: string
    domain: string
  }>
  datum: {
    face: string
    positionMm: [number, number, number]
    orientationDeg: [number, number, number]
  }
  matingConnectorId?: string
  humanAccessible: boolean
  keyed: boolean
  currentRatingA?: number
  voltageRatingV?: number
}
```

### Harness assembly

```ts
interface HarnessAssembly {
  harnessId: string
  fromConnectorId: string
  toConnectorId: string
  service: 'power' | 'signal' | 'analog' | 'motor' | 'sensor' | 'high_voltage'
  conductors: Array<{
    signal: string
    gaugeAwg?: number
    crossSectionMm2?: number
    colour?: string
    shielded: boolean
    twistedWith?: string
  }>
  voltageMaxV: number
  currentMaxA: number
  lengthMm: number
  maxVoltageDropV?: number
  minBendRadiusMm: number
  route: Array<{
    datumId: string
    positionMm: [number, number, number]
  }>
  strainRelief: {
    from: boolean
    to: boolean
    intermediateClips: number
  }
  serviceLoopMm: number
  separationRules: string[]
}
```

---

## How PCB shape follows function

Cursor derives board shape from:

```text
mechanical CAD volume
mounting/optical datums
connector faces
channel pitch
thermal copper/heatsink
HV creepage boundary
wet/dry separation
antenna keepout
service/removal path
```

Examples:

- optical source board follows optical cube face and four registration holes;
- NinjaPCR controller follows thermal/power connector edges and heatsink volume;
- Poseidon may have no custom board—COTS modules plus harness;
- Pioreactor splits into HAT, OD optics and wet-actuation boards;
- Rodeostat shield follows host module and guarded electrode-input edge;
- OpenDrop splits controller and cartridge; cartridge shape follows electrode pitch.

The board is never a generic rounded square unless the constraints genuinely
produce one.

---

## How wiring becomes part of the device

Cursor computes the harness route plan from terminal-supplied mechanical datums:

1. map electrical topology to physical connectors;
2. size conductors from current/voltage/drop;
3. enforce bend radius;
4. avoid hot/moving/HV/wet/optical keepouts;
5. minimise length without violating service access;
6. add strain relief and service loops;
7. emit route waypoints and connector endpoint datums;
8. prove every route terminates on real connectors.

Claude consumes the route plan to render curves/looms/tubes in Blender. Cursor
does not edit Blender placement code.

### Wiring proof

```text
all logical nets assigned to conductor or PCB trace
all external nets terminate at both ends
current capacity adequate
voltage drop within limit
shield/twist requirements met
bend radius met
hazard separation met
strain relief present
route does not intersect forbidden volume
```

Output:

```text
device-wiring-proof/v1
```

---

## How software proves the assembly

For each board/system:

1. generate proof spec from real schematic/pinout;
2. compile minimal target firmware;
3. enumerate buses/components/channels;
4. prove communications across board-to-board links;
5. prove safe output defaults;
6. run simulation;
7. later flash populated hardware and capture HIL.

Multi-board proof verifies the same connectors/harness pin maps used by Blender.

Only hash-matched HIL permits:

```text
FUNCTIONALLY VERIFIED
```

---

## No-clash development model

### Separate worktree

Cursor creates an isolated worktree/branch from terminal-approved HEAD:

```text
../CentaurOS-pcb-electrical
cursor/pcb-electrical-assembly
```

Cursor does not run chains or Blender there.

### Cursor-owned production paths

```text
src/lib/pdf-engine-v2/lib/pcb/**
scripts/lib/device_electrical_assembly.*
scripts/lib/device_wiring_contract.*
scripts/lib/device_wiring_proof.*
prototypes/pcb-firmware-proof/**
prototypes/ninjapcr-pcb-software-benchmark/**
tests/fixtures/pcb/**
```

### Terminal-owned paths

```text
scripts/lib/functional_form.py
scripts/blender-universal/**
instrument form/material grammar
render/drawing/visual gates
```

### Shared files — terminal merges only

```text
scripts/serial-design-chain-v2.tsx
scripts/build-excel-export.py
scripts/lib/gate-registry.ts
CLAUDE.md
```

Cursor supplies small adapter commits/diffs; terminal applies them during an
agreed integration window.

---

## Delivery milestones

### E0 — Contracts

- PCB architecture;
- board shape;
- connector;
- harness;
- software proof schemas;
- seven frozen fixtures.

### E1 — Colorimeter daughterboard

- correct COTS/daughterboard architecture;
- real board shape/mounting;
- host connector/harness contract;
- proof compile.

### E2 — NinjaPCR integrated controller

- full board role/channel scope;
- thermal/power wiring;
- use existing worked firmware benchmark.

### E3 — COTS-only cases

- Poseidon;
- OpenFlexure.

Prove that zero bespoke boards can be the correct answer.

### E4 — Multi-board wet/analog

- Pioreactor;
- Rodeostat.

### E5 — HV multi-board

- OpenDrop controller + cartridge;
- HV wiring/isolation/HIL plan.

### E6 — Terminal integration

Terminal imports:

- board CAD;
- connector datums;
- harness routes;
- evidence JSON.

No cross-owner edits until E0–E2 prove the interface.

---

## Decision requested

If Tristan approves:

1. terminal posts current integration baseline commit;
2. Cursor creates isolated worktree;
3. terminal owns form/Blender exclusively;
4. Cursor owns PCB/electrical/wiring/software proof exclusively;
5. first integration checkpoint is E0 contracts, not code in shared chain files.

