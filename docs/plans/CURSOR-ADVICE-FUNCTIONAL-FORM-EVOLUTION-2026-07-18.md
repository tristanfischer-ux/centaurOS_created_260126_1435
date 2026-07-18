# Cursor Advisory — Functional-Form Convergent Evolution for Blender

**Date:** 2026-07-18  
**Authority:** Claude terminal implements; Cursor advises  
**Goal:** Anvil should generate forms that look inevitable because physics,
human use, manufacturing and service constraints force them.

## Core principle

Do not evolve visual appearance directly.

Evolve **arrangements of functional roles** under hard engineering constraints,
then derive the shell and product language from the surviving arrangement.

```text
brief
  → use sequence
  → functional role graph
  → physical dimensions/fields
  → candidate arrangements
  → hard feasibility cull
  → human/manufacturing/service selection
  → CAD phenotype
  → delivered render proof
```

Gold is a training check:

> If independent evolution from the same physics does not converge toward the
> gold product's class of morphology, the universal constraints are incomplete.

Gold is not a mesh, texture, silhouette or pixel target.

---

## 1. Genotype: `functional-form/v1`

The genotype is a graph, not Blender objects.

```ts
interface FunctionalFormContract {
  schema: 'functional-form/v1'
  operatingMode:
    | 'handheld'
    | 'benchtop'
    | 'open_mechanism'
    | 'open_pcba'
  operatorView: 'top' | 'front' | 'side' | 'host_ui'
  accessDirection: 'top' | 'front' | 'side'
  manufacturing:
    | 'fdm'
    | 'laser_cut_sheet'
    | 'machined_block'
    | 'sheet_metal'
    | 'open_pcba'
    | 'mixed'
  roles: FormRole[]
  relations: FormRelation[]
  fields: PhysicalField[]
  repeatedGroups: RepeatedRoleGroup[]
  hardConstraints: FormConstraint[]
  preferences: FormPreference[]
}
```

### Role

```ts
interface FormRole {
  roleId: string
  function:
    | 'sample'
    | 'sensor'
    | 'source'
    | 'actuator'
    | 'compute'
    | 'power'
    | 'hmi'
    | 'connector'
    | 'structure'
    | 'safety'
    | 'service'
  geometryFamily: string
  dimensionsBasis: string
  dimensionsMm: { x: number; y: number; z: number }
  orientationFreedom: 'fixed' | 'axis_rotation' | 'free'
  mustBeVisible: boolean
  mustBeAccessible: boolean
  removable: boolean
  hazardDomain?: 'hot' | 'high_voltage' | 'wet' | 'moving' | 'optical'
  materialRole: string
}
```

### Relation

```ts
interface FormRelation {
  from: string
  relation:
    | 'aligned_with'
    | 'above'
    | 'below'
    | 'adjacent_to'
    | 'contains'
    | 'faces'
    | 'repeats'
    | 'connected_to'
    | 'separated_from'
    | 'visible_from'
    | 'accessible_from'
  to: string
  toleranceMm?: number
  minDistanceMm?: number
  maxDistanceMm?: number
  hard: boolean
  provenance: string
}
```

### Physical field

```ts
interface PhysicalField {
  fieldId: string
  kind:
    | 'optical_axis'
    | 'heat_path'
    | 'force_path'
    | 'fluid_path'
    | 'motion_axis'
    | 'high_voltage_boundary'
    | 'rf_keepout'
    | 'human_reach'
  roleIds: string[]
  direction?: [number, number, number]
  minimumSpanMm?: number
  clearanceMm?: number
}
```

---

## 2. Phenotype is derived, not selected

After role placement:

1. place authentic CAD/compound geometry for each role;
2. add required connectors/harness paths;
3. generate structure along force/manufacturing paths;
4. generate openings from access/service volumes;
5. offset/wrap only the volumes that require enclosure;
6. leave required open mechanisms exposed;
7. add fillets/draft/wall thickness from manufacturing grammar;
8. assign role-honest materials;
9. generate camera from operator view + required visible roles.

### Critical anti-box rule

Do not begin with an enclosure bounding box.

```text
role volumes first
  → pack
  → access/service/hazard clearances
  → shell only around roles that need protection
```

A generic box is allowed only when a box is the natural manufacturing/physical
solution, such as a laser-cut thermocycler chassis or flat electronics enclosure.

---

## 3. Evolutionary candidate generation

Generate 20–100 candidates cheaply from the same genotype.

### Topology-preserving mutation operators

```text
mirror_for_handedness
rotate_free_role_about_axis
swap_adjacent_noncritical_roles
pack_role_cluster_tighter
separate_hazard_domains
align_to_primary_field
repeat_group_by_pitch
move_hmi_into_view_cone
move_connector_to_service_face
open_sample_access
wrap_protected_roles
expose_required_mechanism
add_service_panel
route_harness_through_channel
```

Mutations may change arrangement, never required role count or physics.

### Candidate seeds

Seed from generic physical compositions:

- side-by-side;
- vertical stack;
- radial around sample;
- repeated linear array;
- planar cartridge + controller;
- host module + daughterboard;
- open mechanism + control spine.

These are universal composition seeds, not product archetypes.

---

## 4. Fitness hierarchy

Never use one weighted score that allows beauty to compensate for broken
physics.

### Tier A — hard feasibility (binary)

Candidate is discarded if any fail:

- required role absent;
- hard relation violated;
- physical-field alignment violated;
- collision;
- required access blocked;
- hazard separation violated;
- channel count wrong;
- envelope/anthropometric hard limit violated;
- authentic geometry unavailable for a recognisable part.

### Tier B — functional quality

Use lexicographic/Pareto selection:

1. field alignment margin;
2. access/reach margin;
3. thermal/force-path efficiency;
4. wiring/tubing length;
5. service removal path;
6. envelope volume/mass.

### Tier C — manufacturing quality

- part count;
- print orientation/support burden;
- sheet count and unique thicknesses;
- machinability;
- fastener count;
- assembly direction changes;
- tolerance stack.

### Tier D — human/desirability quality

- operating plane visible;
- one clear primary action;
- visual hierarchy follows functional hierarchy;
- aligned datums;
- coherent repeated rhythm;
- quiet A-surfaces;
- no unexplained decorative features.

### Tier E — delivered SIGHT

- required roles occupy visible pixels;
- working axis reads;
- no foreign product language;
- correct material cues;
- photoreal product camera.

Final score is the minimum tier score after all hard gates pass.

---

## 5. Why beauty should emerge

Use universal beauty rules only after function:

- align features that share a datum;
- repeat features that share a function;
- expose the dominant working principle;
- hide incidental complexity;
- minimise feature count;
- give access openings their real clearance;
- make joints explain assembly;
- use material changes to show role changes;
- use one silhouette hierarchy, not equal boxes.

This produces Rams-like restraint without styling the product before it works.

---

## 6. Delivered proof: `form-proof/v1`

Blender writes proof from actual scene objects:

```json
{
  "schema": "form-proof/v1",
  "candidate_id": "…",
  "form_id": "…",
  "roles_present": [],
  "relations_measured": [],
  "fields_measured": [],
  "access_clearances": [],
  "hazard_separations": [],
  "manufacturing_metrics": {},
  "render_visibility": {},
  "hard_failures": [],
  "fitness": {},
  "ok": true
}
```

Do not prove from mesh names alone. Measure:

- object transforms/bounds;
- actual distances/angles;
- collision/clearance;
- projected pixel area/occlusion;
- camera visibility.

---

## 7. Exact lab-electronics role graphs requested by terminal

### A. Vial bioreactor

Roles:

```text
electronics_base
stir_motor
stir_magnet
heater
vial_nest
culture_vial
culture_fluid
od_source
od_detector
sterile_cap
inlet_tubes
outlet_tubes
pump_heads
service_connector
```

Hard relations:

```text
stir_motor below culture_vial
stir_magnet aligned_with vial_axis
heater adjacent_to culture_vial
od_source aligned_with culture_vial aligned_with od_detector
od_source separated_from od_detector by vial diameter
sterile_cap above culture_vial
tubes connected_to sterile_cap
culture_vial accessible_from top
electronics_base separated_from wet_zone
pump_heads accessible_from side
```

Dominant field:

```text
vertical process stack:
electronics → stir/heat → vial → sterile cap/tubes
```

Natural convergence: tall sample-led silhouette on compact electronics base.

### B. Electrochemical interface

Roles:

```text
host_compute_module
analog_front_end
isolated_power
reference
range_switches
electrode_connector_WE
electrode_connector_RE
electrode_connector_CE
usb_connector
status_indicator
guarded_input_region
flat_enclosure
```

Hard relations:

```text
WE/RE/CE connectors grouped_on front edge
guarded_input_region adjacent_to electrode connectors
analog_front_end adjacent_to guarded_input_region
digital host separated_from guarded_input_region
isolated_power between host and analog domain
USB accessible_from side
no local display unless contract requires one
enclosure depth derived from PCB/module stack
```

Dominant field:

```text
external cell → electrode edge → guarded AFE → host
```

Natural convergence: flat PCB-sized instrument with coloured leads, no tower.

### C. EWOD cartridge controller

Roles:

```text
logic_controller
high_voltage_generation
hv_isolation
hv_switch_matrix
cartridge_connector
electrode_cartridge
electrode_grid
reservoirs
presence_interlock
hv_enable
oled
joystick_buttons
usb_power
extension_bay
```

Hard relations:

```text
electrode_grid contained_by electrode_cartridge
cartridge_connector adjacent_to cartridge long edge
cartridge accessible_from top
hv_switch_matrix adjacent_to connector
hv_isolation separates logic_controller from hv domain
hv_enable visible_from top
presence_interlock connected_to cartridge
oled/controls visible_from top
extension_bay below cartridge
```

Dominant field:

```text
planar droplet arena over controller/HV stack
```

Natural convergence: flat open-PCBA deck with visible cartridge/grid, not enclosure tower.

---

## 8. Existing specialised family role constraints

### Optical absorbance

```text
source → cuvette → detector collinear
well top-accessible
cap adjacent to well
display/controls visible from top
source daughterboard on optical cube face
```

### Thermocycler

```text
tube array contained by thermal block
lid platen above block
hinge behind block
heatsink/fan connected to block
controls visible from front
```

### Parallel syringe dosing

```text
for each channel:
stepper → lead screw → carriage → plunger collinear
two guide rails parallel
barrel cradle at wet end
channels repeated without collision
```

### Flexure microscope

```text
objective below sample stage
condenser above stage
three actuators coupled to compliant links
camera on optical axis
stage top-accessible
```

---

## 9. Code architecture suggestions

Add:

```text
scripts/lib/functional_form_contract.py
scripts/lib/functional_form_solver.py
scripts/lib/functional_form_fitness.py
scripts/lib/form_proof.py
```

Refactor:

```text
instrument_form_grammar.py
  → registry of form signals, role schemas and manufacturing grammar

build_universal_scene.py
  → consumes winning placement; creates geometry/materials only

form_converge_loop.py
  → candidate generation + fitness loop, not manual constant tweaking
```

### Suggested solver API

```py
contract = derive_functional_form_contract(state)
candidates = generate_candidates(contract, seed=state_hash, n=64)
feasible = [c for c in candidates if hard_feasibility(c, contract).ok]
winner = pareto_select(feasible, contract)
build_scene_from_candidate(winner, contract)
write_form_proof(winner, contract, delivered_scene)
```

Deterministic seed from state hash gives reproducibility.

---

## 10. proveCatch set

Known-bad mutations:

- generic bounding box before role packing;
- vial absent;
- optical source/detector not collinear;
- Peltier block hidden under solid lid;
- syringe rod has no endpoints;
- microscope has no compliant force path;
- potentiostat contains optical cube;
- EWOD contains continuous-flow manifold;
- required role exists but is occluded in product camera;
- service part cannot be removed;
- hazard domains overlap.

Each must be rejected before the dossier can score Renders/Assembly ≥8.

---

## 11. Terminal implementation order

1. Define/emit role graph for one family in shadow.
2. Generate 20 cheap placement candidates.
3. Hard-cull with actual relations.
4. Build low-sample winner.
5. Emit `form-proof.json`.
6. SIGHT against gold function morphology.
7. Add known-bad proveCatch.
8. Repeat across families.
9. Only then wire form proof into Excel.

Recommended first family: **EWOD cartridge controller**.

Why:

- current result is obviously wrong;
- planar role graph is simple;
- gold physics strongly constrains the form;
- success is visually unmistakable;
- avoids first tackling complex flexure geometry.

