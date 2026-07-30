# Open educational motor-stack CAD

This directory contains legally reusable computer-aided design (CAD) training
references. STEP is the editable solid-exchange format; STL is a triangular
surface mesh. Every included asset is pinned to a source revision and carries
its upstream license.

## Included assets

| Asset | Local path | Form | License | Verified here |
|---|---|---|---|---|
| OpenMotor CIAG 2 28 125 25 | `openmotor-ciag-125/CIAG_2_28_125_25.step` | Detailed 3D motor assembly | CERN Open Hardware Licence 2, weakly reciprocal | CadQuery imported 616 solids; envelope 138.393 × 138.393 × 53.500 millimetres |
| Pyleecan IPMSM B | `pyleecan-ipmsm-b/IPMSM_B.json` | Parametric interior permanent-magnet synchronous motor definition | Apache 2.0 | Valid JSON with 48 stator slots, V-magnet rotor, winding, dimensions, and materials |
| CQ Gears planetary set | `cq-gears-planetary/planetary_gearset.step` and `.stl` | Rebuildable three-planet solid model | Apache 2.0 | Generated locally from `generate_planetary.py` and imported as valid solids |

The OpenMotor model is an air-cooled industrial propulsion motor, not an
automotive traction motor. The Pyleecan model is the stronger seed for
interior-magnet rotor and stator-lamination rules. Neither is evidence that a
new ForgeOS design has passed electromagnetic, thermal, or structural checks.

## Useful open sources not copied into this directory

- **Differential and planetary gearbox:**  
  https://github.com/Lodran/differential_planetary_gearbox  
  Parametric OpenSCAD source under Creative Commons Attribution-ShareAlike
  3.0. It is mechanically relevant, but OpenSCAD was not installed here, so
  the geometry was not promoted without a successful rebuild.
- **Cold plate with a channel:**  
  https://github.com/barrosyan/PINNeAPPle/blob/78c6357e5aa38802c99f8c3329dea6c13606ca5e/pinneapple_design/geometry/gen/cadquery_gen.py  
  Apache 2.0 CadQuery source with a parameterized plate and through-channel.
  It is a useful starting primitive, but it is less detailed than the
  serpentine traction-inverter plate ForgeOS needs.
- **Open electric-vehicle inverter power stage:**  
  https://github.com/paltatech/half-bridge  
  CERN Open Hardware Licence 1.2. Includes an untested 70-kilowatt nominal
  water-cooled half-bridge board, FreeCAD/KiCad design files, and a TO-247
  package model. Treat it as educational architecture, not validated hardware.
- **Open three-phase inverter:**  
  https://github.com/owntech-foundation/OWNVERTER  
  CERN Open Hardware Licence, strongly reciprocal. Includes editable KiCad
  files and project-specific three-dimensional package files.
- **Additional parametric gear library:**  
  https://github.com/looooo/freecad.gears  
  GNU General Public License 3.0 FreeCAD workbench for involute, bevel, crown,
  worm, and other gears.

## Sources deliberately excluded

- **GrabCAD:** public downloads normally have no standard per-model open
  license. Public visibility is not permission to redistribute.
- **TraceParts and CADENAS:** files are free for design use, but their terms
  restrict republishing and redistribution. They can be linked as supplier
  references, not copied into forge-truth.
- **Unlicensed GitHub models:** the printable `Open-Differential` repository
  and detailed `WKJBryan/cadquery-library` cold plate have no declared license,
  so their source was not copied.
- **OEM and race-team CAD:** no Lucid, Formula E team, or other proprietary
  vehicle geometry was used.

## Existing ForgeOS coverage

`Tier 1 and 2 parts for cad /tier2_electromechanical.py` already contains
parametric drone-style outrunner and pancake motors with simple stator slots.
`Tier 1 and 2 parts for cad /ev_physical_properties.py` contains traction
motor and reduction-gearbox metadata, but no corresponding detailed solid
geometry. No local STEP, STL, FreeCAD, or OpenSCAD motor-stack assets were
present before this import.

## Recommended forge-truth seeds

1. Seed the OpenMotor STEP as a source-backed **open propulsion motor reference**
   with the source revision and CERN license attached. Do not label it
   `traction_motor_ipmsm`.
2. Build a universal `ipmsm_lamination_stack` CadQuery family from Pyleecan's
   slot, bore, magnet-hole, pole, and stack-length parameters. Keep the bundled
   Prius-derived definition as a regression benchmark, not a customer-facing
   silhouette.
3. Seed `planetary_gearset` from `generate_planetary.py`; expose module, tooth
   counts, width, rim width, planet count, backlash, and bore as parameters.
4. Next, implement source-owned universal families for a bevel-gear
   differential, serpentine cold plate, and isolated inverter power-module
   package. Use the open links above as training checks and retain license
   provenance on every generated derivative.
