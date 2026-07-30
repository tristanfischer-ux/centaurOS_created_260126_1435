# Formula E front drive: multiphysics and computer-aided-design gap plan

**Date:** 2026-07-30  
**Twin:** `out/formula-e-front-mgu-20260729-1432`  
**Scope:** The integrated electric drive unit: motor, inverter, reduction gearbox and differential in one package.  
**Current release verdict:** `ship_ok = false` — **not race-ready; do not celebrate as finished.**

**Binding mission (do not forget):** Every solver, CAD family and Blender view must serve the Formula E **front powertrain kit** duties — especially **≤ 250 kW front regenerative electrical power** as continuous design duty, the **343 × 259 × 267 mm / ~32 kg** bay, **~19,500 rpm**, voltage window, and open vehicle interfaces. Full checklist: [`FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md`](./FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md). Generic motor science that ignores those rows is out of scope.

**Live twin scoreboard file (auto-stamped):**  
`out/formula-e-front-mgu-20260729-1432/JLR-FE-FRONT-FPK-MOTOR-MULTIPHYSICS.md`

---

## Progress scoreboard — update this whenever work lands

**How to read this (mood guide):**

| Signal | Meaning for you |
|---|---|
| **DONE** | We said we would do it, and it is done for that narrow step |
| **STARTED / PARTIAL** | Real progress, but the engineering claim is **not closed** |
| **NOT STARTED** | Still a gap — plan says do it; we have not |
| **OPEN** on a check | That proof is **missing** — treat as unfinished, not “fine” |
| **Release coverage 0** | **Bad for shipping.** Zero parts have supplier or team release CAD. Normal at this stage; **not** success |

**Overall mood as of 2026-07-30 ~16:30:** **In-context magnetics now screens the duty — still not finished.**  
Happy about: magnetic loaded point ~**96 N·m (~77% of ~125)** after fixing the −90° torque-null + magnet fill; stamp now shows **Works in kit context?** separately from smoke.  
Not done: torque map / demag / dyno; water jacket; gears/oil; inverter packaging; release CAD = 0; `ship_ok` false.

**Last scoreboard update:** 2026-07-30 (magnetics current-angle + magnet-fill fix; kit-context honesty column).

### A. Ordered closure plan (the 8 steps we committed to)

| # | What we said we would do | Status | What we have actually done | Gap still open | Plan to fix the gap |
|---|---|---|---|---|---|
| 1 | Freeze one shared assembly revision for CAD + solvers + Blender + Excel | **STARTED** | Label `front-drive-concept-stub-2026-07-30` on the multiphysics stamp | Not a hard gate yet — old evidence can still sit beside new pictures | Make Excel/Quality reject mismatched revisions; bump revision whenever geometry changes |
| 2 | Build CAD authority spine (case, stator, rotor, gears, cooling, …) | **STARTED** | Parametric families now: stator, rotor magnet carrier, planetary, **cold plate serpentine** (4 of 13) | Case, bearings, differential, oil, motor jacket, bus, connectors still Blender-only; **release CAD coverage = 0 / 13** | Next: motor jacket channels + cast case; supplier STEP when known |
| 3 | Close electromagnetic + rotating-mechanical evidence | **PARTIAL (duty screen yes)** | Root cause of ~9 N·m was **−90° current-angle null** + thin magnets. Fix: angle screen (best **−45°**) + bridge-legal magnet fill → **~96 N·m (~77% of 125)**; `works_in_kit_context` **true**. ROSS + CalculiX screens unchanged | Full MTPA/position map, demag, dyno, 24-vs-48 slot reconciliation, magnet-pocket burst still OPEN | Position sweep + voltage/thermal; keep `ship_ok` false |
| 4 | Close gears, differential, structure | **STARTED (rotor screen only)** | CalculiX kit ring at 19,500 rpm (~103 MPa von Mises screening) | No ISO gear strength, no differential contact, no case/mount FEA | Twin-bound gear + case solves after ratio freeze |
| 5 | Close cooling and lubrication | **PARTIAL (cold plate duct)** | OpenFOAM rectangular duct on family channel @ **12 L/min / 60 °C** → ~**25 kPa** headline Δp (PARTIAL). CAD family exists | Full serpentine STEP CHT OPEN; jacket CFD OPEN; oil CFD OPEN; module temps OPEN | Jacket CadQuery → OpenFOAM; CHT when solid mesh exists |
| 6 | Close inverter packaging | **NOT STARTED** | Module volumes in Blender / physics tree | No supplier module identity, bus inductance, double-pulse | Freeze MPNs + supplier STEP; loss + inductance evidence |
| 7 | Make every result visible in the dossier | **STARTED** | Stamp promotes magnetic / ross / structural / cold-plate PARTIAL with file links | Latest Excel workbook may not yet mirror the new PARTIAL rows | Re-export Excel from stamp; Quality & Audit must match markdown table |
| 8 | Correlate with hardware (dyno, HIL, flow bench, …) | **NOT STARTED** | Holds correctly left **OPEN** | Needs real hardware / team data | Cannot close in software alone |

### B. Solver check rows (what “OPEN / PARTIAL” means)

| Check | Said we need | Status now | Good or bad? | Next fix |
|---|---|---|---|---|
| Magnetic field / torque | Map proving 250 kW duty | **PARTIAL** | **Works in kit context (duty screen):** ~**96 N·m / 125 (~77%)** at −45° elec after magnet fill. Was ~9 N·m at the −90° null. Map / demag / dyno still OPEN | Multi-position MTPA map; 24-vs-48 slots; demagnetisation |
| Rotor dynamics | Critical speeds vs 19,500 rpm | **PARTIAL** | Progress — kit-sized ROSS screen clear of band; **assumed bearings**, not supplier data | Replace bearing k/c with catalogue; modal correlation later |
| Structural / burst | Case, rotor, mounts survive | **PARTIAL** | Progress — steel-ring centrifugal screen; **not** magnet-pocket burst or case FEA | Pocket burst + case/mount load cases |
| Motor water jacket | Flow + heat at 12 L/min, 60 °C | **OPEN** | **Unfinished** | Jacket CadQuery → OpenFOAM |
| Inverter cold plate | Module temperatures / pressure drop | **PARTIAL** | Progress — duct Δp/velocity screen; **module temps OPEN** | Full serpentine CHT + heater-plate correlation |
| Gear oil delivery | Jets, pickup, churning | **OPEN** | **Unfinished** | Oil CFD after galleries exist |
| Gear strength | Tooth life for kit torque | **OPEN** | **Unfinished** | ISO 6336 / licensed gear tool |

### C. CAD authority (why “release coverage 0” sounds alarming)

We track 13 principal parts. Each is one of:

1. **Communication only** — Blender shapes that explain packaging  
2. **Parametric family** — our CadQuery geometry (concept, **not** supplier release)  
3. **Supplier / team release CAD** — the only level that counts toward “release coverage”

**Today: 4 parametric, 9 communication-only, 0 release → coverage 0%.**  
Expected early. **Not fab-ready.** Building the library ≠ closed manufacturing geometry.

### D. What to expect next (short queue)

1. Excel re-export so Quality & Audit matches the stamp table.  
2. Magnetic angle/position sweep + 24-vs-48 slot reconciliation.  
3. Motor water-jacket CadQuery + OpenFOAM.  
4. Keep `ship_ok = false`.

---

## Plain-language verdict

The Blender model is now useful for explaining how the package is arranged. It shows a motor barrel, inverter shelf, reduction gears, differential, cooling interfaces and a physical cutaway. The physics tree is also a strong checklist: 256 nodes, 207 leaves and explicit analytical values for items such as winding resistance, capacitor size and cold-plate channels.

That is not the same as a race-ready design.

- Blender pictures are communication. They show where things are and how they relate.
- Analytical calculations are screening. They find impossible or obviously weak concepts early.
- Solver results close engineering evidence holds. A magnetic field solve, stress solve, flow solve or gear-strength calculation must use the same geometry revision shown in the dossier.
- Physical tests close the final correlation holds. Dynamometer, pressure-drop, overspeed and populated-hardware results are still required where the model says they are.
- Prettier pictures alone must never change a solver row from **OPEN** to **PASS**, and must never set `ship_ok` to true.

The correct target is therefore not “make Blender look more detailed.” It is “make every visible feature come from controlled computer-aided design (CAD), then attach the right calculation or test result to that exact revision.”

## Evidence ladder

| Level | What it can honestly prove | What it cannot prove |
|---|---|---|
| Blender render | Packaging, adjacency, service access and whether the cutaway explains the machine | Magnetic performance, stress margin, oil delivery, pressure drop, bearing life or manufacturability |
| Analytical tool | First sizing, order-of-magnitude loads and sensible starting dimensions | Local hot spots, leakage fields, contact pressure, flow separation or tolerance sensitivity |
| Solver-backed model | Performance of a controlled geometry revision under stated load cases | Agreement with the manufactured unit |
| Bench or vehicle test | Correlation of the model to real hardware | A different, later design revision |
| Released supplier or team CAD plus signed evidence | The geometry and evidence package that can support a release decision | Automatic race approval; the Fédération Internationale de l’Automobile and team still own homologation |

## Major machine parts

Each part below uses the same four questions. “What we have now” means what exists in the twin or current analytical tools, not what a real unit is assumed to contain.

### 1. Outer cast case and cutaway

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| Deterministic compound Blender geometry for the case, end bells, inverter cover, ribs, bolt circles, gasket lips and mounts. The functional section removes the camera-facing case half so the motor, gears and inverter can be read. Rib and mount counts come from `edu_form_grammar.py`, but dimensions are screening values. | A castable wall network with draft, fillets, parting lines, machining stock, bearing bores, dowel lands, seal grooves, oil and water galleries, fastener bosses, local stiffness and realistic assembly access. The closed case and cutaway must come from the same controlled solid model. | There is no integrated-drive cast-case CadQuery family, supplier model or released team model. There is no structural finite-element analysis of case stiffness, mount loads, bearing-bore movement or joint separation. | Build a parametric `integrated_drive_cast_case` CadQuery family and export Standard for the Exchange of Product model data (STEP) plus triangulated render meshes. Mesh it with Gmsh and solve case, cover, mount and joint load cases in CalculiX. Show the exact revision in **Renders / Functional cutaway**, stress and displacement in **Engineering Analysis / Case and mounts**, dimensions in **Drawings / Case machining**, and the result link in **Verification**. |

### 2. Stator slots and copper windings

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| A stator ring and winding-end cues in Blender. The physics tree carries 24 slots, 14 turns per phase, 26.775 square millimetres of conductor area and 0.00623 ohm phase resistance at 20 degrees Celsius. | Real tooth and slot shapes, tooth tips, slot liners, wedges, individual rectangular copper paths, end turns, welds, phase grouping, terminal lugs, impregnation and cooling clearances. Slot fill and winding layout must be manufacturable and must match the magnetic model. | The visual windings are not production hairpins, and the analytical winding does not prove torque, voltage, ripple, local loss, saturation, end-winding heating or manufacturability. | Build a `traction_stator_hairpin_pack` CadQuery family driven by slot count, turns, conductor size and end-turn rules. Run the controlled cross-section through Pyleecan and the native `xfemm` finite-element magnetic solver. Show slot and winding geometry in **Renders / Motor section** and **Drawings / Winding and lamination schedule**; show torque, voltage, copper loss and core loss maps in **Calculations** and **Engineering Analysis / Magnetic and winding check**; link the solver revision in **Verification**. |

### 3. Rotor magnet pockets and retention

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| A hollow rotor barrel and repeated magnet bodies in Blender. The tree names N42UH neodymium-iron-boron magnets, remanent flux density and an analytical centrifugal-stress seed. Magnet retention is explicitly open. | Exact buried-magnet pockets, bridges, flux barriers, magnet coating, adhesive or sleeve, shaft interface, balancing features and minimum iron ligaments. It needs electromagnetic saturation and demagnetisation checks plus overspeed stress and burst margin at hot conditions. | The magnet blocks are communication geometry. There is no pocket topology, nonlinear magnetic solution, hot demagnetisation map, retention stress solution, rotor burst solution or balance evidence. | Build a `traction_interior_magnet_rotor` CadQuery family. Use Pyleecan plus `xfemm` for flux, torque ripple and hot demagnetisation; use Gmsh plus CalculiX for bridges, sleeve and overspeed stress. Show flux and demagnetisation plots in **Engineering Analysis / Rotor magnetic check**, stress and burst margin in **Engineering Analysis / Rotor integrity**, the pocketed rotor in **Renders / Motor section**, and both evidence files in **Verification / Rotor retention**. |

### 4. Motor, gearbox and differential bearings

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| Generic front and rear motor bearings, gearbox bearings, a differential carrier bearing, seats, cages, thrust washers and shims. The tree leaves supplier life, reaction loads, axial loads, preload and thermal fits open. | Exact bearing types and part numbers, load directions, fits, preload, internal clearance, lubrication path, seal arrangement and retention. The shaft system needs reaction loads, thermal growth, critical speeds, unbalance response and bearing life under the race duty cycle. | Bearing objects exist, but there is no solved shaft line, no supplier identity, no rated-life calculation and no proof that preload or clearance survives the temperature range. | Build a `traction_rotor_bearing_stack` and `transmission_bearing_stack` CadQuery family. Use Rotordynamic Open-Source Software (ROSS) for rotor dynamics, an International Organization for Standardization (ISO) 281 bearing-life calculation, CalculiX for shaft and housing deflection, and supplier catalogue data for limits. Show critical-speed separation, reactions, preload and life in **Engineering Analysis / Rotor dynamics and bearings**, exact identities in **Bill of Materials**, fits in **Drawings / Bearing stack**, and evidence links in **Verification**. |

### 5. Planetary gears

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| Readable sun, planet and ring-gear objects with seed tooth counts of 18, 54 and 126, plus carrier plates, pins, needle bearings, thrust washers and oil drillings. The current quality report also records an unresolved 7.8:1 reduction and torque-statement inconsistency. | True involute teeth, chosen module, pressure angle, helix angle, profile shift, face width, backlash, tip and root relief, planet phasing, carrier stiffness and realistic support bearings. Strength must cover tooth root bending, flank contact, scuffing, micropitting and race-spectrum fatigue. | The current teeth are visual cues and seed counts. Ratio closure, tooth microgeometry, contact load sharing, carrier deflection and damage accumulation are not solved. | Build a `planetary_reduction_set` CadQuery family from the settled ratio and tooth-system inputs. Run an ISO 6336 strength calculation, use KISSsoft for an independent gear-set check when a licence is available, and use CalculiX for tooth contact and carrier stiffness. Show ratio reconciliation and strength factors in **Calculations** and **Engineering Analysis / Gear strength**, tooth and carrier geometry in **Renders / Gear section** and **Drawings / Gear data**, and the signed result in **Verification**. |

### 6. Differential

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| A mini-differential with carrier, cross-pin, pinion gears, side gears, output shafts, seals and a carrier bearing. The tree correctly leaves bias requirement, bevel-tooth geometry, contact, fatigue and halfshaft splines open. | Proper bevel gear geometry, tooth contact pattern, cross-pin retention, backlash, torque split, side-gear and halfshaft splines, carrier stiffness, bearing reactions and fatigue under wheel-speed difference and traction events. | The differential communicates the architecture but does not yet define a manufacturable gear set or prove torque capacity, fatigue life, lubrication or output-interface compatibility. | Build a `compact_bevel_differential` CadQuery family tied to the halfshaft interface register. Use KISSsoft bevel-gear analysis and CalculiX contact and carrier-stress models. Show the sectioned differential in **Renders / Transmission cutaway**, gear contact and cross-pin margins in **Engineering Analysis / Differential**, spline and backlash data in **Drawings**, and interface and evidence references in **Verification**. |

### 7. Gear oil system and oil cooling jets

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| Oil charge, seals, breather, fill and drain plugs, magnetic debris capture, baffle, pickup gallery, mesh screen, ring scraper, pump and planet-pin drillings are named in the tree. Blender can show oil-system parts, but it does not show proven flow. | A sump and headspace, gear-dip depth, scavenge path, oil cooling jets aimed at bearings and meshes, drillings, baffles, aeration control, breather behaviour, seal wetting, debris handling and service fill level. Flow, pressure, temperature and churning loss must hold across acceleration, braking and cornering. | The inventory is unusually complete, but lubrication architecture, jet flow, pickup robustness, aeration, churning loss, seal temperature and bench correlation are all open. | Build an `integrated_drive_oil_circuit` CadQuery family with explicit galleries and oil cooling jets. Use OpenFOAM computational fluid dynamics for free-surface oil, pickup, jet delivery and churning, then correlate with a clear-case or instrumented flow bench. Show colour-coded oil routes in **Renders / Lubrication section**, flow and temperature margins in **Engineering Analysis / Oil system**, service features in **Drawings**, and simulation and bench revisions in **Verification**. |

### 8. Motor water jacket

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| A motor cooling jacket or band, coolant material and helical or axial channel intent. Coolant-port sizing comes from analytical flow and pressure-drop screening. `CFD_jacket` remains open. | Cast or machined channels with inlet and outlet manifolds, seals, wall thickness, local velocity control, air-bleed behaviour and heat paths from windings, stator teeth and case. It must avoid stagnant zones, excessive pressure drop, boiling risk and large circumferential temperature spread. | The jacket shape is not a solved flow volume, and the analytical network cannot locate hot spots or maldistribution. It is not tied to a released case geometry. | Build a `traction_motor_water_jacket` CadQuery family as part of the cast case. Use OpenFOAM conjugate heat transfer, which solves the coolant and surrounding solid together, and correlate pressure drop on a flow bench. Show channel paths in **Renders / Cooling cutaway**, pressure drop and winding-to-coolant temperature in **Engineering Analysis / Motor cooling**, port and seal dimensions in **Drawings**, and result files in **Verification**. |

### 9. Inverter cold-plate cooling channels

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| A cold-plate body and analytical seed of eight channels, each about 5.345 by 1.336 millimetres, carrying roughly 4.318 kilowatts of inverter heat. The tree also includes a cover, thermal-interface layer, coolant and ports. | Real headers, turns, channel or pin-fin pattern, module mounting lands, controlled thermal-interface thickness, cover joining method, seals, pressure proof, drain and bleed behaviour. Every power module needs a temperature and pressure-drop result. | The channel numbers are a good start but do not prove uniform flow, local boiling margin, pressure loss, module temperature spread, cover stress or manufacturability. | Build an `inverter_cold_plate_channelled` CadQuery family. Use OpenFOAM conjugate heat transfer and CalculiX pressure and bolt-load checks, then correlate with pressure-drop and heater-plate tests. Show channels in **Renders / Inverter section**, module temperatures and pressure drop in **Engineering Analysis / Inverter cooling**, manufacturing dimensions in **Drawings / Cold plate**, and test and model links in **Verification**. |

### 10. Silicon-carbide power modules

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| Three power-module volumes, one for each motor phase, with six high-side and low-side silicon-carbide switch positions. The analytical model splits switching and conduction loss and assigns the heat to the cold plate. Supplier module data and double-pulse testing remain open. | An exact supplier package or controlled custom stack with die count, direct-bonded-copper substrate, baseplate, terminals, gate and sense connections, isolation distances, clamping, thermal-interface material and temperature sensors. Electrical loss and junction temperature must use supplier curves and measured switching behaviour. | The blocks express topology, not package identity. Current rating, short-circuit survival, switching energy, thermal resistance, terminal geometry and lifetime are not release evidence. | Prefer supplier STEP and datasheet authority. If a neutral family is needed for early packaging, add `traction_half_bridge_power_module` in CadQuery and mark it non-authoritative. Use Piecewise Linear Electrical Circuit Simulation (PLECS) with supplier loss maps for switching and thermal behaviour, then a double-pulse bench for correlation. Show exact module identity in **Bill of Materials**, switching and junction-temperature maps in **Calculations** and **Engineering Analysis / Power modules**, package geometry in **Renders / Inverter section**, and supplier plus bench evidence in **Verification**. |

### 11. Laminated direct-current bus

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| Positive and negative copper sheets, dielectric layer and phase busbars are represented. Cross-section is analytically sized for current. Three-dimensional inductance and measured equivalent series inductance remain open. | Overlapping copper laminates with real terminal tabs, insulation boundaries, creepage and clearance, capacitor and module interfaces, bolt stacks, current sharing, thermal expansion allowance and manufacturable bend radii. The commutation loop must have calculated and measured stray inductance. | The present bus is a visual and cross-section seed. It does not prove terminal fit, local current density, voltage overshoot, insulation life, bolt pressure or low-inductance commutation. | Build a `laminated_direct_current_bus_stack` CadQuery family tied to the chosen capacitor and power-module terminals. Use FastHenry2 for three-dimensional parasitic inductance and CalculiX for bolt and thermal-expansion loads; verify inductance during double-pulse testing. Show the current loop in **Renders / Inverter section**, inductance and overshoot in **Engineering Analysis / Direct-current link**, layer data in **Drawings / Bus stack**, and measured comparison in **Verification**. |

### 12. Direct-current link capacitors

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| Four generic film capacitors totalling about 222.9 microfarads, plus a discharge resistor and voltage-sense divider. The capacitance comes from analytical ripple screening. | Exact supplier parts or a released custom capacitor, with terminal geometry, capacitance tolerance, ripple-current rating, equivalent series resistance, thermal path, voltage derating, lifetime model, discharge time and safe failure behaviour. | There is no frozen manufacturer part number, ripple-current proof, life at temperature, terminal fit or thermal result. Generic blocks cannot establish bus layout or lifetime. | Select supplier parts and ingest their STEP models; use a `direct_current_link_film_capacitor_bank` CadQuery family only for controlled custom packaging. Use PLECS for ripple current and bus interaction, with supplier lifetime curves and thermal inputs. Show identities in **Bill of Materials**, ripple and discharge checks in **Calculations**, life and temperature in **Engineering Analysis / Capacitor bank**, installed geometry in **Renders**, and datasheet evidence in **Verification**. |

### 13. Electrical and coolant connectors

| What we have now (in Blender / analytical tools) | What a real engineering model should have | The gap | How we close the gap (named software or CadQuery family + dossier proof) |
|---|---|---|---|
| A high-voltage connector shell sized from about 750 volts and 333 amperes, a low-voltage signal connector, high-voltage interlock intent, coolant ports and four concept route stubs. The latest form rule forces these interfaces, but team and vehicle coordinates remain open. | Exact connector families with keys, pins, seals, shielding, braid termination, high-voltage interlock pins, touch safety, creepage, service tools, cable bend radii and load paths. Coolant fittings need thread or quick-connect details. Every interface needs controlled position, orientation and keep-out volume. | The current connectors show function but not supplier identity or installability. `route-audit` concept routes do not prove a complete harness, hose path or vehicle interface. Port coordinates, cable lengths and service clearances remain open. | Use supplier STEP where available and add a `vehicle_interface_connector_and_port_set` CadQuery family for mounting and keep-out geometry. Freeze coordinates in the team interface register, then route cables and hoses against the settled assembly. Show coordinates and orientations in **Drawings / Interface control**, identities in **Bill of Materials**, routed lengths in **Connection schedule**, service views in **Renders**, and sign-off in **Verification / Vehicle interfaces**. |

## Software stack to add

These are separate evidence stages. They should consume frozen inputs and write results back; they should not be hidden inside Blender or the analytical tools.

| Engineering question | Named software and job | Controlled output | Where the Excel report shows it |
|---|---|---|---|
| Does the motor make the required torque without saturation, excessive ripple or hot demagnetisation? | **Pyleecan + native `xfemm`**: build the machine cross-section, sweep current and rotor position, solve the nonlinear magnetic field and create torque, voltage, loss and demagnetisation maps. | Solver input package, geometry revision, material curves, mesh, convergence record, torque map, loss map and demagnetisation margin. | **Calculations / Magnetic finite-element runs**, **Engineering Analysis / Motor electromagnetic map**, **Verification / Torque and magnet claims**. |
| Are rotor and shaft critical speeds, bearing reactions and unbalance response acceptable? | **ROSS**: rotor-dynamics model of shaft, rotor, gears and bearings. Couple reaction loads to the bearing-life and structural checks. | Campbell diagram, critical speeds, mode shapes, bearing reactions, unbalance response and speed-separation margin. | **Engineering Analysis / Rotor dynamics and bearings**, with the release claim linked from **Verification**. |
| Do case, mounts, rotor, shafts, carrier, covers and joints survive their loads? | **Gmsh + CalculiX**: mesh and solve static, modal, contact, centrifugal, bolt-preload, thermal-expansion and fatigue load cases. | Revision-matched mesh, load cases, convergence, stress, displacement, contact pressure, factors of safety and fatigue usage. | **Engineering Analysis / Structural finite-element checks**, **Drawings / load-case notes**, and **Verification / structural claims**. |
| Do water and oil reach every hot or loaded part with acceptable pressure drop and temperature? | **OpenFOAM**: conjugate heat transfer for water jackets and cold plate; free-surface and rotating-flow models for gearbox oil, jets, churning and pickup. | Geometry revision, boundary conditions, mesh study, flow balance, pressure drop, temperatures, oil delivery and churning loss. | **Engineering Analysis / Cooling and lubrication**, **Calculations / fluid balance**, and **Verification / thermal-fluid claims**. |
| Will the gears survive the race load spectrum? | **ISO 6336 calculator + KISSsoft check + CalculiX contact model**: ratio closure, tooth-root bending, flank contact, scuffing, micropitting, load sharing and carrier flexibility. | Settled gear data, load spectrum, strength factors, contact pattern and fatigue usage. | **Calculations / Gear ratio and load spectrum**, **Engineering Analysis / Gear strength**, **Drawings / Gear data**, and **Verification**. |
| Is the geometry authoritative enough to manufacture and assemble? | **CadQuery family library + supplier or team STEP files**: one controlled solid assembly for case, motor, gearbox, differential, cooling, power stage and interfaces. Blender receives derived render meshes only. | Component source, authority level, revision, checksum, interface datums, mass properties, interference report and released drawing set. | **CAD & Geometry / Authority register**, **Renders / revision label**, **Drawings**, **Bill of Materials**, and **Quality & Audit / CAD authority coverage**. |

## CAD authority rules

Every visible principal part should carry one of these authority levels:

1. **Communication only** — Blender compound or neutral placeholder. It may explain packaging but cannot close manufacturing or fit.
2. **Parametric family** — controlled CadQuery geometry with dimensions and tests. It can close concept geometry and interference checks, but not supplier identity.
3. **Supplier-authoritative** — frozen supplier STEP, datasheet and part number. It can close purchased-part geometry when the exact revision matches procurement.
4. **Team release CAD** — controlled native or STEP geometry, drawings, interface datums and release approval. This is the target for bespoke castings, rotor, stator, gears, shafts, bus and cold plate.

The Blender scene must record the source component revision for every imported mesh. A render built from stale or placeholder geometry must say so on the Renders tab.

## Proposed state fields

This is a reporting contract, not an implementation in this plan.

```json
{
  "motorMultiphysics": {
    "schema_version": "motor-multiphysics/v1",
    "assembly_revision": "front-drive-revision-X",
    "required_checks": {
      "magnetic": {
        "status": "OPEN",
        "software": "Pyleecan + xfemm",
        "model_revision": null,
        "geometry_revision": null,
        "input_hash": null,
        "torque_map_ref": null,
        "loss_map_ref": null,
        "demagnetisation_margin": null,
        "correlation_ref": null
      },
      "rotor_dynamics": {
        "status": "OPEN",
        "software": "ROSS",
        "model_revision": null,
        "critical_speed_margin": null,
        "bearing_reaction_ref": null
      },
      "structural": {
        "status": "OPEN",
        "software": "Gmsh + CalculiX",
        "geometry_revision": null,
        "load_case_set": null,
        "minimum_factor_of_safety": null,
        "result_ref": null
      },
      "water_jacket": {
        "status": "OPEN",
        "software": "OpenFOAM",
        "pressure_drop_kpa": null,
        "maximum_winding_temperature_c": null,
        "result_ref": null
      },
      "inverter_cold_plate": {
        "status": "OPEN",
        "software": "OpenFOAM",
        "pressure_drop_kpa": null,
        "maximum_module_temperature_c": null,
        "module_temperature_spread_c": null,
        "result_ref": null
      },
      "gear_oil": {
        "status": "OPEN",
        "software": "OpenFOAM",
        "minimum_jet_flow_l_min": null,
        "churning_loss_w": null,
        "result_ref": null
      },
      "gear_strength": {
        "status": "OPEN",
        "software": "ISO 6336 + KISSsoft + CalculiX",
        "ratio_revision": null,
        "minimum_strength_factor": null,
        "load_spectrum_ref": null,
        "result_ref": null
      }
    },
    "all_required_solver_checks_pass": false,
    "ship_ok": false
  },
  "cadAuthority": {
    "schema_version": "cad-authority/v1",
    "assembly_revision": "front-drive-revision-X",
    "components": [
      {
        "component_id": "traction_drive_housing",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "source_revision": null,
        "source_hash": null,
        "interface_revision": null,
        "interference_check": "OPEN",
        "mass_properties_check": "OPEN"
      }
    ],
    "principal_components_total": 0,
    "release_authority_count": 0,
    "release_authority_coverage": 0.0
  }
}
```

Required behaviour:

- `PASS` needs a real result file, software name, model revision, geometry revision, input hash and acceptance limit.
- If the CAD revision changes, all linked solver checks automatically return to **OPEN** until rerun.
- An image path cannot be used as `result_ref` for a magnetic, structural, fluid, bearing or gear check.
- Solver completion must not copy into `ship_ok`. It only closes the named evidence hold.
- `ship_ok` remains false until solver evidence, supplier evidence, populated inverter hardware, hardware-in-the-loop control evidence, dynamometer correlation, thermal and flow correlation, and team or governing-body interface approvals are all closed.

## Excel visibility draft

Do not add a duplicate “physics mega-sheet.” Strengthen the existing **Calculations**, **Engineering Analysis**, **Verification**, **Quality & Audit**, **CAD & Geometry**, **Renders**, **Drawings**, **Bill of Materials**, **Holds & exclusions** and **Decision Register** surfaces.

### Quality & Audit rows

These rows should always exist for an integrated electric drive unit, even when the answer is **OPEN**:

| Row | Example visible wording |
|---|---|
| Magnetic finite-element check | **PASS/OPEN — torque map from Pyleecan + xfemm revision X; geometry revision Y** |
| Hot magnet demagnetisation | **PASS/OPEN — minimum margin at maximum magnet temperature; evidence revision X** |
| Rotor overspeed structure | **PASS/OPEN — CalculiX burst and retention solve revision X** |
| Rotor dynamics | **PASS/OPEN — ROSS critical-speed separation revision X** |
| Bearing life | **PASS/OPEN — ISO 281 life from revision-X reactions and race load spectrum** |
| Cast case and mounts | **PASS/OPEN — CalculiX stress and displacement solve revision X** |
| Planetary gear strength | **PASS/OPEN — ISO 6336 and contact check revision X** |
| Differential strength | **PASS/OPEN — bevel contact, cross-pin and carrier check revision X** |
| Motor water jacket | **PASS/OPEN — OpenFOAM flow and heat-transfer result revision X** |
| Inverter cold plate | **PASS/OPEN — OpenFOAM pressure-drop and module-temperature result revision X** |
| Gear oil delivery | **PASS/OPEN — oil jet, pickup and churning result revision X** |
| Power-module evidence | **PASS/OPEN — exact silicon-carbide module data plus double-pulse correlation revision X** |
| Laminated bus inductance | **PASS/OPEN — FastHenry2 result plus measured commutation-loop inductance revision X** |
| CAD authority coverage | **PASS/OPEN — N of M principal components have supplier or team release geometry** |
| Blender revision match | **PASS/OPEN — rendered assembly revision matches CAD and solver evidence revisions** |

The Quality & Audit score must be floored by any mandatory **OPEN** or failed evidence row according to the existing honesty doctrine. A good Blender score cannot compensate for an open solver row.

### Engineering Analysis rows

Each row should expose enough information to review the result without opening the state file:

| Field | Meaning |
|---|---|
| Component and load case | For example, “rotor bridge at maximum used speed and hot magnet condition” |
| Requirement | The limit being checked |
| Result | The calculated or solved value, with units |
| Margin | Distance from the limit; never just “looks acceptable” |
| Method | Analytical screening, finite-element solve, computational fluid dynamics, supplier curve or bench test |
| Software | Pyleecan, `xfemm`, ROSS, CalculiX, OpenFOAM, KISSsoft, FastHenry2 or the named bench system |
| Geometry revision | The exact CAD revision used |
| Model revision and input hash | The reproducible calculation identity |
| Evidence link | Relative path to model report, plots and raw result summary |
| Correlation | **OPEN**, or the matching bench/dynamometer record |
| Verdict | **PASS**, **FAIL** or **OPEN** |

### Calculations and Verification

- **Calculations** shows the hand-checkable analytical setup and the headline solver outputs. It does not paste thousands of field values.
- **Engineering Analysis** shows load cases, limits, margins, revisions and plots.
- **Verification** maps every performance or survival claim to the exact analysis and, where required, the physical test.
- **Holds & exclusions** names every missing solver, supplier or test result.
- **Decision Register** records who accepted a geometry freeze, material choice, test basis or remaining hold.
- **Renders** labels the CAD authority and revision. It never uses “validated” merely because the image is attractive.

## Ordered closure plan

### Step 1 — Freeze revision coupling

Define one assembly revision shared by CAD, solver inputs, Blender, drawings and Excel. Reject any evidence whose geometry revision differs. This prevents a solved old rotor or cold plate from being presented beside a newer picture.

### Step 2 — Build the CAD authority spine

Create the case, stator, rotor, bearing stack, planetary set, differential, oil circuit, motor jacket, inverter cold plate, laminated bus and interface families. Import exact supplier models for purchased bearings, capacitors, power modules and connectors. Run interference and mass-property checks before detailed solvers.

### Step 3 — Close electromagnetic and rotating-mechanical evidence

Run magnetic field, hot demagnetisation, rotor overspeed, shaft dynamics and bearing-reaction models on the frozen revision. Feed the same torque and reaction loads into the gearbox and case models.

### Step 4 — Close gears, differential and structure

Reconcile the reduction ratio first. Then close planetary and differential strength, carrier and case deflection, mounts, joints, shafts and fatigue. Do not tune visual teeth to hide a ratio or strength failure.

### Step 5 — Close cooling and lubrication

Use the losses from the magnetic and inverter models as heat inputs. Solve the motor jacket, inverter cold plate and gear oil system. Feed pressure drop, temperatures and oil delivery into the pump, seals, bearings and physical test plan.

### Step 6 — Close inverter packaging

Freeze the silicon-carbide modules, capacitor bank, laminated bus and connectors. Solve electrical losses, parasitic inductance and temperatures. Complete supplier evidence and double-pulse correlation before claiming the power stage is validated.

### Step 7 — Make every result visible

Write only revision-matched summaries to state, rebuild the existing Excel surfaces, and inspect the delivered workbook. A reviewer should be able to see in under a minute which checks pass, which remain open, which geometry was used and what physical test is still required.

### Step 8 — Correlate with hardware

Use pressure-drop rigs, heater plates, overspeed testing, a dynamometer, double-pulse testing and populated-controller hardware-in-the-loop evidence. Update model correlation, not just the conclusion. Race readiness remains false until the existing hard release holds are genuinely closed.

## Stop conditions

The work is not complete when:

- every physics-tree leaf has a name;
- every principal part has a Blender mesh;
- the cutaway looks like a real integrated drive;
- an analytical screening tool returns a plausible number;
- the Excel Renders tab scores highly; or
- the solver executable exits successfully.

The engineering gap is closed only when the exact CAD revision, inputs, solver or test result, acceptance limit, margin and evidence link are present and visible in the dossier.

Until that point:

> **Blender explains the machine. Solvers establish whether the evidence holds can close. Tests establish whether the solved machine matches hardware. `ship_ok` stays false.**
