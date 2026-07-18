# PCB Capability Prototype

This directory is preparatory code only. Nothing here is imported by the design engine.

## Why it exists

The repository declares `ToolDomain: 'pcb'` and can classify `pcb_assembly`, but no registered orchestrator tool creates a KiCad project. PCB references currently produce BoM prose, manufacturing-route text, component STEP models, or plant electrical drawings—not an electronic schematic or board.

The local machine does have a viable toolchain:

- KiCad / `kicad-cli` 10.0.4
- Atopile 0.2.69
- Freerouting 2.2.4
- OpenJDK
- KiCad symbol and footprint libraries

A previous project also contains a functioning board-generation chain:

- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/scripts/pcb-chain/pcb_chain.py`
- `/Users/tristanfischer/Developer/CentaurOS created 260126 1435/scripts/lib/pcb_trigger.py`

Those files are valuable prior art but should not be copied into the engine verbatim. The trigger contains class lists and special cases, while the PCB chain hardcodes machine paths, uses `/tmp` resources, carries a static component/price table, and can report optimistic state when generation fails.

## Files

- `pcb-contract.ts` — future engine/tool boundary for PCB evidence, requests, artifacts, and verification.
- `pcb-disposition.ts` — universal COTS-vs-bespoke policy with ten adversarial cases.
- `pcb-outline.ts` — arbitrary closed board outlines and KiCad 10 `Edge.Cuts`.
- `discover-pcb-capability.ts` — discovers KiCad/Atopile/Freerouting without relying only on PATH.

## Commands

```bash
npx tsx prototypes/pcb-capability/pcb-disposition.ts --selftest
npx tsx prototypes/pcb-capability/pcb-outline.ts --selftest
npx tsx prototypes/pcb-capability/discover-pcb-capability.ts
PCB_ACCEPTANCE_OUT=/tmp/forgeos-pcb-shape-acceptance \
  npx tsx prototypes/pcb-capability/standalone-shape-acceptance.ts
```

## Bespoke board shapes

The future request contract does not use `board_shape: "rect"`. It carries an ordered,
provenanced contour made from line and arc segments, plus internal cut-outs and mounting holes.
The prototype currently proves:

- circular boards;
- rounded rectangles;
- arbitrary polygons (for example hexagonal boards);
- irregular/L-shaped boards;
- circular internal cut-outs;
- plated/non-plated mounting holes;
- rejection of open/discontinuous contours.

The engine integration must also make component placement shape-aware. Drawing a bespoke
`Edge.Cuts` contour while continuing to place parts inside a rectangular bounding box would put
components outside circular/concave boards. This remains an explicit porting requirement.

## Independent acceptance result

The standalone harness was run against KiCad 10.0.4 without importing Anvil.
Every fixture contains two real copper nets, four plated test-point pads, routed
F.Cu tracks, mounting holes, silkscreen, and its bespoke outline:

| Shape | KiCad DRC | Edge.Cuts Gerber | Drill files | 3D render |
|---|---|---|---|---|
| Circular | Pass | Pass | Pass | Pass |
| Rounded rectangle | Pass | Pass | Pass | Pass |
| Hexagonal | Pass | Pass | Pass | Pass |
| Irregular L-shape + circular cut-out | Pass | Pass | Pass | Pass |

KiCad reported zero error-severity DRC violations and zero unconnected items.
Artifacts and `acceptance-report.json` were written to:

`/tmp/forgeos-pcb-shape-acceptance-routed`

## Central rule

A bespoke PCB workflow is required only when:

1. The function is an actual board-level electronics function.
2. It is not inside a purchased parent assembly.
3. No suitable finished COTS module is confirmed.
4. At least one independent application-specific constraint exists: compact/custom form factor, multi-function integration, safety integration, RF/high-speed layout, or repeated topology-specific boards.

A catalogue IC hit is not a finished-board match. Conversely, an MCU mention does not itself require a PCB deliverable.

## Integration status

Not wired. See:

`docs/plans/2026-07-10-pcb-kicad-capability-handover.md`
