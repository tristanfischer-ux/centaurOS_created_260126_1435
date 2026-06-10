# Blender Universal CAD Loop — Plan + Tracker

**Agreed with Tristan 2026-06-10.** Repo: `CentaurOS-oxccu-efuel` ONLY.

## The goal (Tristan, verbatim intent)
A **universal** generator that turns the engineering output of ANY archetype into a
**geometrically correct CAD model**: **every** engineering part present, at the right
**size**, **shape**, and **location**, with **every connection routed correctly** (full
routed CAD piping — elbows/flanges/runs). Aim **10/10** ("aim for 10 and you might get 9").

- **I am the visual judge, autonomously.** Loop = render → I Read the PNGs → critique vs the
  rubric → improve the SHARED CODE → re-render. Repeat fast.
- **Improvements go in CODE**, never one-off prompt tweaks — so it constantly improves and
  **never regresses** (each fix gets a guard).
- **No PDF in the loop.** Fast render→critique→code cycles only. PDF wiring comes LATER.
- **Ignore shadows/lighting.** Core CAD geometry only — lighting is trivial to add after.
- **Universal & sequential:** perfect archetype 1 to 10/10 → next → … → until all done AND
  any NEW archetype comes out beautifully (the machinery generalises).

## The 10/10 rubric (the FLOOR across these five, not the average)
1. **Completeness** — every PHYSICAL engineering part is in the model (exclude non-physical
   BoM lines: coatings, labels, software, services, consumables — the lesson from the rejected
   compiler).
2. **Shape** — each part the right shape (flat panel = flat slab, vessel = cylinder/capsule,
   pipe = pipe, heatsink = finned block, motor = cylindrical body, PCB = thin board, dish = paraboloid…).
3. **Size** — each part sized to its real engineering dimensions.
4. **Location** — each part assembled in the right place like a real unit (nothing floating,
   nothing scattered, sensible spatial relationships).
5. **Connections** — every topology edge (`from_part→to_part`, mechanism) rendered as a routed
   connection of the right type (fluid=pipe, electrical=bus/cable, thermal=pipe) joining the
   CORRECT parts.

## Loop protocol (per archetype)
render scene → I Read hero + orthographic + per-module + a pipework view → score each rubric
dimension → if any < 10, edit SHARED code (primitive lib / digest / topology router / placement /
authoring) → regression-guard the fix → re-render → repeat → promote at 10/10 → next archetype.

## What exists (from the 2026-06-10 subsystem map)
- **Live generator:** `scripts/generate-blender-scene.tsx` — LLM (gpt-5.5) adapts nearest of 33
  `*-9shot.py` hand-templates using a dims+qty digest → `blender-scene.py` → `render-blender-scene.py`
  → headless Blender → hero/top/2-corner/per-module PNGs. AST-validated. NOT chain-wired (offline — fine).
- **Dormant deterministic checks:** `scripts/author-blender-scene.tsx` + `forge_scene_checks.py`
  (connectivity/nothing-floats, bbox-in-envelope, no-interpenetration, CoM-over-base). Wire these in.
- **Primitive lib:** `scripts/blender-templates/forge_blender_lib.py` (add_box/cyl/torus/sphere/
  frustum/pipe; compound motor/vessel/heatsink; prim_* domain; `prim_pipe_run` takes manual waypoints).
- **Topology edges** (the connectivity, today UNCONSUMED by Blender): `engineering-contract.ts`
  `TopologyEdge[] { from_part, to_part, mechanism, constraint_kind, required_value/unit/margin, material_context }`.

## The biggest gap = connectivity
Topology edges exist + are validated by gates, but NO Blender code draws them. Goal-2 core =
a router that places parts then draws routed CAD piping/buses between the named parts per edge.

## First batch (~6–8 diverse hard cases, then fan out to all 33+)
| # | Archetype | Why (hard case it exercises) | State avail? |
|---|---|---|---|
| 1 | e-fuel-synthesis / co2-mineralisation | fluid process: vessel→vessel→vessel routed pipework (Goal-2 showcase) | TBD |
| 2 | bess-utility-scale | rack-packing of ×N cells/modules; electrical-bus + thermal edges | TBD |
| 3 | pv-module-residential | FLAT panels (the "flat panel rendered as a cube" failure) | TBD |
| 4 | industrial-inspection-drone / HAPS | aero, non-box geometry (fuselage/wings/props) | TBD |
| 5 | heat-pump-residential | vessels + refrigerant loop pipework + compressor | TBD |
| 6 | vertical-farm | canopy/racks: flat + structure packing | TBD |
| 7 | a NOVEL class with NO template | proves universal authoring (no hand-template to lean on) | TBD |

## Geometry families — the shape of "universal" (found round 4-5, 2026-06-10)
The generator runs on ANY archetype (verified: e-fuel 70/73 parts + BESS 143 parts, 0 errors), but good GEOMETRY needs a per-FAMILY strategy detected from the parts/modules — all families share the same part-extraction, topology router, skid frame, and clean light-mode inspection render:
- **process-plant** (vessels + columns + overhead pipe rack) → e-fuel, CO2 — ✓ the round 1-5 exemplar (~7.5/10)
- **rack-farm** (rows of cabinets/racks + aisles + a power/cooling skid) → BESS, edge-AI — TO BUILD. (Round-4 universality check: BESS runs clean but renders as generic boxes + a stray vessel, NOT rack rows — confirms the over-fit risk and the need for this strategy.)
- **panel-array** (flat tiers/arrays on a structure) → vertical farm, PV module — TO BUILD
- **aero-body** (central fuselage/hull + wings/rotors/appendages) → HAPS, satellite, drone — TO BUILD

Build sequence (Tristan's "perfect one → next"): finish e-fuel (process-plant) → BESS (add rack-farm) → vertical farm (panel-array) → HAPS/satellite (aero-body) → fan out. A geometry-family classifier ties them together so any NEW archetype maps to a family and renders well. The per-family strategy + shared machinery IS what "universal" means here — NOT one layout for everything (that was the rejected "part vomit").

## Phases
- **P0 — Harness + baseline:** loop runner (state → generate → render multi-angle → HTML gallery +
  part-checklist); render TODAY's output for the batch; my first baseline critique per archetype.
- **P1 — Topology → routed pipework:** feed `TopologyEdge[]` + topology_clause into the generator;
  `route_edge()` in forge_blender_lib draws routed CAD connections between placed parts; prove on the fluid archetype.
- **P2 — Dimension + part fidelity:** dimension-conformance audit (emitted primitive dims == engineering dims);
  packing rules (×N small → representative grid; flat stays flat); wire `forge_scene_checks.py` as the cheap pre-gate.
- **P3 — The loop to 10/10:** drive each batch archetype to rubric-floor 10 by improving shared code; regression-guard every fix.
- **P4 — Fan out:** run all 33+ templated classes + novel classes; confirm any new archetype renders beautifully.

## Lessons carried (do NOT relitigate)
- Filter non-physical BoM lines before geometry (coatings/labels/software/services).
- Assembly/placement is the hard part — a naive keyword→region heuristic = "part vomit" (rejected 2026-05-24/06-10).
- Bank every improvement in CODE + a regression guard so iter-N catches iter-(N+1).

## Status
- [ ] P0 harness + baseline
- [ ] P1 topology→pipework
- [ ] P2 dim/part fidelity + deterministic checks
- [ ] P3 batch to 10/10
- [ ] P4 fan-out + novel-class confidence
