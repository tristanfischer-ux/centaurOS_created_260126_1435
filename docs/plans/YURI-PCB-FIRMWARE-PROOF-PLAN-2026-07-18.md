# Yuri PCB Firmware Proof — Plan for Minimal Executable Bring-up Software

**Date:** 2026-07-18  
**Audience:** Claude terminal owner and future PCB/firmware integration work  
**Status:** Plan plus isolated draft prototype; not wired into the chain  
**Prototype:** `prototypes/pcb-firmware-proof/`  
**Depends on:** `YURI-PCB-IMPLEMENTATION-RECOMMENDATIONS-2026-07-18.md`

---

## Goal

A PCB must not be called functional merely because KiCad DRC passes.

The minimum stronger claim is:

> Simple software can be generated from the board's real architecture, pinout and interfaces; it compiles; it boots in a deterministic host/simulator harness; it enumerates every required bus/component/channel; it proves a communications path; and it keeps all actuators safe by default.

This is **not product firmware**. It is a universal bring-up/smoke-test image.

It does not implement:

- UI;
- calibration;
- scientific algorithms;
- experiment recipes;
- cloud services;
- closed-loop product performance.

It only proves that the electronic architecture is coherent enough for software to bind and exercise.

---

## Why this is valuable

Firmware is an independent consistency check over the PCB:

- a fake four-pin LQFP cannot produce a credible pin header;
- missing buses become compile/spec failures;
- one driver standing in for four channels fails a static count;
- duplicate I²C addresses are exposed;
- missing enable/fault/sense nets become validation failures;
- high-voltage and heater outputs can be proved safe-off at boot;
- multi-board connectors can be checked from both ends;
- COTS-only systems can prove their integration wiring without inventing a PCB.

However, firmware proof must run **after** PCB design fitness:

```text
pcbDesignFitnessOk == false
  ⇒ firmware proof is not allowed to mint PASS
```

Otherwise software would merely compile against the same invented pin model.

---

## Governing acceptance doctrine

Firmware proof must eventually govern the Excel PCB tab and Verification spine.
Native proof shows contract coherence; real-MCU compile shows target coherence;
simulation shows executable peripheral behavior; **HIL on the populated PCB is
the ultimate functional proof**.

Required workbook states:

| PCB readiness | Required evidence |
|---|---|
| `FAIL` | PCB hygiene/design/firmware proof has a HARD failure |
| `ENGINEERING DRAFT` | Real-MCU compile or required simulation is absent |
| `FAB-READY — UNPROVEN IN HARDWARE` | Design + compile/sim pass; no current HIL |
| `FUNCTIONALLY VERIFIED` | Current proof flashed to the current populated PCB and HIL passes |

```text
FUNCTIONALLY_VERIFIED =
  fabricationExportHygieneOk
  AND pcbDesignFitnessOk
  AND realMcuCompileOk
  AND requiredSimulationOk
  AND hilOk
  AND proofHashesMatchCurrentDesign
```

Proof must be hash-bound to the architecture, schematic, routed PCB, component
manifest, pin contract, firmware source and BOM/PnP. Any changed input makes an
older transcript `UNVERIFIED`.

The Excel PCB tab must derive an “Executable proof” section from stored artifacts:
targets, proof hash, MCU compile, simulation, HIL, channels, bus identities,
safe-off and host communication. Verification must carry separate HARD rows for
export hygiene, PCB fitness, MCU compile, bus/channel proof, safe actuation and
current-revision HIL. Before hardware exists, HIL is honestly `UNVERIFIED`.

After workbook generation, render-then-reingest must compare the Excel status
cells with `proof-result.json`, HIL transcript and current hashes. No manually
green row can substitute for proof evidence.

---

## Three evidence tiers

### Tier 0 — Native contract proof (draft implemented now)

No embedded toolchain required.

Inputs:

- firmware proof spec;
- board/component/bus/channel pin contract;
- safety rules.

Outputs:

- validated JSON;
- generated C11 bring-up harness;
- native compile with Apple clang/GCC;
- executed transcript;
- proof result JSON.

What it proves:

- schema completeness;
- compile-time bindings exist;
- channel counts close;
- buses and identities are represented;
- communications banner exists;
- actuators default safe and use bounded exercise rules.

What it does not prove:

- code compiles for the actual MCU;
- peripheral registers are correct;
- physical hardware responds;
- timings/electrical levels are correct.

### Tier 1 — Real MCU compile

Toolchain examples:

- Arduino CLI;
- PlatformIO;
- arm-none-eabi-gcc;
- ESP-IDF.

What it adds:

- actual SDK headers;
- MCU pin-name validity;
- flash/RAM fit;
- linker/startup correctness;
- real peripheral API binding.

### Tier 2 — Simulation or hardware-in-the-loop

Options:

- Renode/QEMU/simavr/Wokwi where appropriate;
- USB-UART + programmer + real board;
- host protocol simulator.

What it adds:

- boot banner;
- bus enumeration;
- ID register reads;
- GPIO readback;
- safe bounded output exercise;
- end-to-end inter-board communication.

---

## Firmware proof contract

One spec per custom board or COTS integration target:

```json
{
  "schema": "pcb-firmware-proof-spec/v1",
  "proof_target_id": "motion_controller",
  "kind": "custom_board",
  "design_fitness_ok": true,
  "mcu": {
    "mpn": "ATmega328P-AU",
    "toolchain": "arduino",
    "pin_contract_complete": true
  },
  "buses": [],
  "components": [],
  "channels": [],
  "actuators": [],
  "communications": []
}
```

### Required proof categories

1. **Boot**
   - MCU/host target identified;
   - reset/boot/programming interface exists;
   - software emits a deterministic banner.

2. **Buses**
   - I²C/SPI/UART/USB bindings name real nets;
   - expected devices are attached;
   - address/chip-select conflicts are rejected.

3. **Component identity**
   - resolved parts expose ID-register checks where possible;
   - simple parts use GPIO/presence checks;
   - unresolved parts block real-MCU/FAB proof.

4. **Channels**
   - required count comes from PCB architecture;
   - implemented instance count must be at least required;
   - every instance has its enable/output/sense/fault bindings.

5. **Communications**
   - at least one host-observable path;
   - banner includes board ID and spec hash;
   - multi-board links are checked from both ends.

6. **Safe actuation**
   - outputs are safe before initialization;
   - dangerous outputs require two-step arm;
   - smoke exercise is time/duty bounded;
   - output automatically returns safe.

---

## Safety policy

Every generated harness is fail-closed.

### Defaults

| Domain | Safe state |
|---|---|
| Motor enable | disabled |
| Step output | low |
| Heater SSR/MOSFET | off |
| Peltier bridge | all switches off |
| HV enable | off |
| Pump/stir PWM | zero |
| LED source | off |

### Arm sequence

Actuation requires:

1. compile-time `PROOF_MODE`;
2. runtime token derived from proof-spec hash;
3. all interlocks satisfied;
4. bounded duty/duration.

Recommended default limits:

- duty ≤5%;
- pulse ≤100 ms;
- one exercise per boot;
- forced off after exercise.

No physical actuation should be performed in Tier 0 native simulation.

---

## Disposition-specific proof

### COTS-only

Examples: Poseidon, base OpenFlexure.

No fake custom firmware target.

Generate a host integration harness that proves:

- every required module is catalogued;
- module pin maps agree;
- channel/module count is sufficient;
- serial/I²C/SPI wiring has no conflict;
- host command protocol can enumerate all channels.

### Daughterboard

Examples: Colorimeter source board, Rodeostat analog shield.

Prove:

- host connector pins match both sides;
- daughterboard target compiles if it has an MCU;
- passive daughterboard uses an `interconnect_only` proof with continuity/pin-map checks;
- host can enable/read the board through the declared interface.

Important: a passive LED/resistor board should not be forced to contain firmware. Its proof target is the host software that drives its connector plus a static continuity contract.

### Single custom

Examples: thermocycler controller.

Compile one bring-up image that:

- checks all sensors;
- enumerates power channels;
- proves fault/interlock inputs;
- emits host banner;
- performs only safe bounded output pulses.

### Multi-board

Examples: Pioreactor and OpenDrop.

One proof result per board plus aggregate checks:

- connector maps agree;
- no I²C address/CS conflicts;
- every required board boots/responds;
- isolation boundaries are respected;
- aggregate communications reaches every board.

---

## Integration with PCB readiness

Extend the planned readiness contract:

```ts
interface PcbReadinessResult {
  fabricationExportHygieneOk: boolean
  pcbDesignFitnessOk: boolean
  firmwareProofOk: boolean
  readiness: 'FAIL' | 'ENGINEERING_DRAFT' | 'FAB_READY'
}
```

Policy:

```text
FAB_READY =
  fabricationExportHygieneOk
  AND pcbDesignFitnessOk
  AND firmwareProofOk
```

During rollout:

- missing proof → ENGINEERING_DRAFT;
- failed safety/channel/domain proof → FAIL;
- COTS-only architecture can be system-ready without Gerbers if integration proof passes.

---

## Proposed future engine files

These are not implemented by the isolated draft:

```text
src/lib/pdf-engine-v2/lib/pcb/
  pcb-firmware-proof-spec.ts
  pcb-firmware-proof-runner.ts
  pcb-firmware-proof-gate.ts
  firmware-proof/
    templates/
      proof_main.c.mustache
      proof_config.h.mustache
      proof_boot.c.mustache
      proof_buses.c.mustache
      proof_identity.c.mustache
      proof_channels.c.mustache
      proof_comms.c.mustache
      proof_actuation_safe.c.mustache

scripts/pcb-firmware-proof/
  run-proof-sim.py
```

### Gate

Proposed Gate 40:

```text
PCB_FIRMWARE_PROOF_ENFORCING
```

Applicability:

- PCB-bearing architecture;
- COTS-only integration architecture;
- design fitness already true.

Must prove:

- bad channel count fires;
- unsafe default fires;
- missing host pin map fires;
- good resolved exemplar passes.

---

## Product training cases

These are test fixtures, not runtime branches.

| Product | Minimal proof |
|---|---|
| Colorimeter | host sees detector; source connector maps; one LED channel safe-off/brief pulse |
| NinjaPCR | temperature devices enumerate; heater/TEC/fan channels counted; cutout input; UART/Wi-Fi banner |
| Poseidon | COTS host finds four driver channels; serial command enumerates all; enable defaults off |
| OpenFlexure | host sees three motion axes and camera/illumination interfaces |
| Pioreactor | HAT, OD and actuation boards communicate; heater/stir/pump safe-off |
| Rodeostat | AFE buses/range controls bind; electrode outputs safe; USB banner |
| OpenDrop | controller/cartridge link; electrode channel capacity; HV default off; interlock required |

---

## Isolated draft prototype

Location:

```text
prototypes/pcb-firmware-proof/
```

It is deliberately:

- not imported by chain code;
- dependency-free (Python stdlib + system C compiler);
- fixture-driven;
- output-isolated under its own `out/`;
- suitable for later translation into TypeScript/templates.

### Draft commands

```bash
python3 prototypes/pcb-firmware-proof/firmware_proof.py \
  validate prototypes/pcb-firmware-proof/fixtures/good-motion-board.json

python3 prototypes/pcb-firmware-proof/firmware_proof.py \
  prove prototypes/pcb-firmware-proof/fixtures/good-motion-board.json \
  --out /tmp/pcb-firmware-proof

python3 -m unittest discover \
  -s prototypes/pcb-firmware-proof/tests \
  -p 'test_*.py'
```

### Draft behavior

- validates a proof spec;
- rejects unfit PCB designs;
- rejects channel under-count;
- rejects duplicate I²C addresses;
- rejects unsafe actuator defaults/limits;
- generates a C11 proof harness;
- compiles with local `cc`;
- runs it;
- parses deterministic PASS transcript;
- writes result JSON.

### Draft limitations

- native host target, not actual MCU;
- no real peripheral emulator;
- no register-level driver;
- no HIL;
- no chain state integration;
- no attempt to hide that limitation.

---

## Acceptance for the draft

The draft is successful when:

1. known-good motion board validates, compiles and runs;
2. one-of-four channel fixture fails;
3. duplicate I²C address fixture fails;
4. unsafe actuator fixture fails;
5. design-fitness false fixture fails before generation;
6. transcript contains board ID, spec hash and all proof categories;
7. no files outside `prototypes/pcb-firmware-proof/` and docs are changed.

---

## Integration sequence later

1. Finish `pcb-architecture/v1`.
2. Finish real pinout/schematic/ERC path.
3. Port the draft spec validator into TypeScript.
4. Generate native proof in shadow from real board specs.
5. Add real MCU toolchain discovery.
6. Compile one known-good exemplar.
7. Add simulation/HIL where justified.
8. Add Gate 40 and readiness axis.
9. Replace Excel's narrative “firmware CRC” with actual proof evidence.

---

## Final principle

Firmware proof is not a substitute for electrical design.

It is a cross-domain witness:

> If simple software cannot bind to the declared pins, enumerate the declared parts, close the declared channel count and communicate safely, the PCB model is not coherent enough to call functional.

