# Educational CAD family seeding plan — 2026-07-30

## Boundary

These assets are training geometry. They are not Lucid, Formula E, race-team,
or other original-equipment-manufacturer parts. A family may support packaging,
rendering, and early engineering calculations, but it does not prove
electromagnetic, thermal, structural, durability, or manufacturing performance.

## Exact forge-truth identities

| Order | Forge-truth family | Source and licence | Registration | Parametric inputs | Release gate |
|---|---|---|---|---|---|
| 1 | `ipmsm_stator_lamination` | Pyleecan `IPMSM_B.json`, revision `7937d6…`, Apache-2.0 | Family fallback; implemented | outer/bore diameter, lamination thickness, slot count, slot opening/width/neck/depth | STEP and STL >1 KB; one solid; expected envelope; invalid yoke rejected |
| 2 | `ipmsm_rotor_magnet_carrier` | Pyleecan `IPMSM_B.json`, revision `7937d6…`, Apache-2.0 | Family fallback; implemented | rotor outside/shaft diameter, pole pairs, V angle, bridge thickness, magnet pocket width/depth, lamination thickness | pockets preserve bridge and shaft web; 8-pole benchmark matches source dimensions |
| 3 | `ipmsm_lamination_stack` | Composition of families 1 and 2, Apache-2.0 benchmark provenance | Assembly family | stack length, lamination thickness, inter-lamination gap, skew steps | axial envelope and lamination count reconcile; no fused stator/rotor |
| 4 | `planetary_gearset` | `cq_gears`, revision `e73874…`, Apache-2.0 | Family fallback; implemented (optional `cq_gears` import) | module, sun/planet teeth, width, rim width, planet count, backlash, bore | tooth-count compatibility, equal planet spacing, STEP/STL rebuild, non-intersecting solids |
| 5 | `open_propulsion_motor_reference` | OpenMotor CIAG 2 28 125 25, revision `1e1e56…`, CERN-OHL-W-2.0 | **Exact identity only**: OpenMotor / `CIAG-2-28-125-25` | none; source STEP is unchanged | import succeeds; 616 solids; 138.393 × 138.393 × 53.500 mm; never used as traction-family fallback |
| 6 | `cold_plate_serpentine` | ForgeOS source-owned builder; PINNeAPPle revision `78c635…` is an Apache-2.0 training check | Family fallback after fluid checks | plate envelope, wall, channel width/depth/pitch, pass count, port diameter/spacing | continuous channel, positive wall, no channel breakout, hydraulic diameter emitted |
| 7 | `inverter_half_bridge_power_stage` | Paltatech half-bridge, CERN-OHL-1.2, as architecture training only | Exact reference first; universal builder later | substrate, switch count/package, bus spacing, cold-plate interface | package identities and mounting interfaces explicit; no power-rating claim without calculation |

## Seeding sequence

1. Keep source files, source revision, licence text, and local changes together
   under `assets/edu-training-cad/`.
2. Run each builder's `--selftest`; publish only green STEP/STL output.
3. Register generated families with `is_family_asset=True`, a pinned source URL,
   and the upstream SPDX-style licence identifier.
4. Register source assemblies such as OpenMotor with `is_family_asset=False`.
   Exact educational assemblies must never silently stand in for a generic
   traction motor.
5. Resolve forge-truth by exact manufacturer/part number first, then by a
   verified parametric family. Preserve the source URL and licence in every
   returned provenance record.
6. Add Blender role/material mappings only after the family geometry is seeded:
   electrical steel for laminations, magnet material for inserts, machined
   steel for gears, aluminium for cold plates.

## Implementation status

`Tier 1 and 2 parts for cad /tier2_motor_drivetrain.py` owns:

1. `ipmsm_stator_lamination` — defaults reproduce the dimensional benchmark
   (269.24 mm outside diameter, 161.90 mm bore, 48 slots, 0.50 mm lamination)
   without copying Pyleecan implementation code.
2. `ipmsm_rotor_magnet_carrier` — HoleM53 V-pocket carrier with IPMSM_B
   defaults (160.40 mm outside diameter, 110.64 mm shaft, 8 poles / 4 pole
   pairs, 1.50 mm bridge, 17×6.5 mm magnet pockets). Completes the air-gap
   pair; does not require `cq_gears`.
3. `planetary_gearset` — parametric promotion of the cq_gears three-planet
   example (module 1, sun 12, planet 18, width 10 mm, 3 planets). `cq_gears`
   remains an optional import so stator/rotor stay always-on.

The forge-truth seeder publishes these families under Apache-2.0 provenance and
registers the OpenMotor STEP only against its exact CERN-OHL-W-2.0 identity.

The next implementation should be `ipmsm_lamination_stack` (axial composition
of families 1 and 2), then `cold_plate_serpentine`.
