# Yuri Functional-Form Co-evolution — Findings and SOURCE Plan

**Date:** 2026-07-18  
**Audience:** Terminal owner / next implementation agent  
**Status:** Findings complete; implementation proposed, not applied  
**Authority:** The gold products are training evidence for convergent engineering form. They are not meshes or silhouettes to paste.  
**Scope:** Open Colorimeter, NinjaPCR, Poseidon, OpenFlexure, Pioreactor, Rodeostat, OpenDrop

---

## Executive finding

The accepted Yuri runs are **not visually 9/10 products**. They are dossiers whose deterministic Excel floor reached 9. The score currently proves cost, document completeness, part coverage, PCB output, drawing registration and closure of HARD claims. It does **not** prove that the delivered object has the function-driven morphology revealed by the gold product.

The terminal's “generic boxes” diagnosis is correct.

The deepest defect is architectural, not cosmetic:

1. The engine has useful form-specific genes for four families, but weak delivered phenotypes.
2. Pioreactor, Rodeostat and OpenDrop are collapsed into one `lab_electronics` family.
3. That shared family emits the same eight-mesh PCB/BNC/USB interior.
4. The exterior code then applies the **optical colorimeter** deck, tower, cap and cuvette rule to every instrument except thermocycler, syringe pump and microscope.
5. The form loop has no checklist for optical, thermocycler or lab electronics.
6. `form_render_glance.py` silently returns PASS with `skipped: true` for `lab_electronics`.
7. `yuri-revisit-watch.sh` explicitly passes an empty form for Pioreactor, Rodeostat and OpenDrop, skipping both form-id and glance checks.
8. The visual score rewards part coverage, file presence, colour fractions and framing. A generic cuboid can satisfy those checks.

This is why three delivered exterior renders are effectively the same object, and why even the four “specialised” families remain crude abstractions rather than convincing function-led instruments.

The correct response is **not** seven product-named Blender branches. It is a co-evolving functional morphology system:

> brief physics → functional role graph → dimensions and relations → manufacturing grammar → human interaction → CAD phenotype → delivered-image proof

Gold is the training test: if the same physics, human workflow and manufacturing constraints do not lead the engine toward the same class of form, the rule set is incomplete.

---

## Evidence inspected

### Accepted engine renders

| Product | Accepted exterior |
|---|---|
| Colorimeter | `out/colorimeter-20260717-2254/04-product-exterior.png` |
| NinjaPCR | `out/ninjapcr-20260718-0001/04-product-exterior.png` |
| Poseidon | `out/poseidon-20260718-0022/04-product-exterior.png` |
| OpenFlexure | `out/openflexure-20260718-0101/04-product-exterior.png` |
| Pioreactor | `out/pioreactor-20260718-0327/04-product-exterior.png` |
| Rodeostat | `out/rodeostat-20260718-0201/04-product-exterior.png` |
| OpenDrop | `out/opendrop-20260718-0410/04-product-exterior.png` |

The corresponding `00-hero.png`, `form-meshes.json`, `parts-manifest.json`, `drawing-gates.json`, `render-vision-critique.json` and `tab-scorecard.json` were also inspected.

### Gold/training evidence

| Product | Gold evidence |
|---|---|
| Colorimeter | `out/_gold-colorimeter-showcase/01-finished-product.png`, `02-product-hero.png`, CAD/component images |
| NinjaPCR | `out/_gold-ninjapcr-showcase/02-product-hero.jpg`, `04-kit-open.jpg`, enclosure plate and PCB images |
| Poseidon | `out/_gold-poseidon-showcase/00-hero-ortho.jpg`, frozen source repo |
| OpenFlexure | `out/_gold-openflexure-repo` v6.1.5 and official OpenFlexure build documentation |
| Pioreactor | Official Pioreactor 20 ml v1.5 product and assembly imagery; source manifest `~/Downloads/Yuri_Wet_Science_Benchmark_Library/gold_standard_sources/05_pioreactor_sources.md` |
| Rodeostat | Official IO Rodeo product imagery; source manifest `~/Downloads/Yuri_Wet_Science_Benchmark_Library/gold_standard_sources/06_rodeostat_sources.md` |
| OpenDrop | Official OpenDrop V4 top/front/electronics imagery; source manifest `~/Downloads/Yuri_Wet_Science_Benchmark_Library/gold_standard_sources/07_opendrop_sources.md` |

Official links for the three missing repo-local showcase packs:

- Pioreactor: <https://pioreactor.com/products/pioreactor-20ml>
- Rodeostat: <https://iorodeo.com/products/rodeostat>
- OpenDrop V4: <https://www.gaudi.ch/OpenDrop/?p=544>

### Critical asset gap

There are no repo-local gold showcase packs or frozen repos for Pioreactor, Rodeostat or OpenDrop. The terminal should first freeze the declared source commits and create local SIGHT packs. The form engine must not depend on network pages at runtime.

---

## The co-evolution model the engine needs

The engine currently treats `form_id` mostly as a style selector. It should instead treat form as the **phenotype of a functional role graph**.

### Shared genes

These can be reused across all instrument classes:

- batch/manufacturing language: FDM shell, laser-cut sheet, exposed PCBA, machined thermal block;
- human factors: viewing direction, access direction, finger target, sample loading, cable reach;
- service strategy: removable panel, replaceable cartridge, replaceable vial, swappable source module;
- electronics: host compute, function-specific daughterboard, connectors, power entry;
- presentation: studio lighting, physically plausible materials, high three-quarter product camera.

### Morphogenes

These create the recognisable product class:

- **working medium:** light beam, heat, linear displacement, image plane, culture fluid, electrode current, electric field;
- **primary working axis:** source→sample→detector, heater→well, motor→screw→plunger, objective→sample→camera;
- **repetition:** tube count, syringe channel count, stage axes, electrode rows/columns;
- **sample interface:** cuvette well, tube block, syringe cradle, microscope stage, vial nest, electrode leads, EWOD cartridge;
- **openness:** mechanism visible, sample open, sealed optical path, exposed development PCB;
- **operator sequence:** what the hand loads, what the eye watches, what must remain visible;
- **hazard boundary:** heated lid, high-voltage cartridge zone, wet/dry boundary, light-tight cube.

### Proposed contract

Add a typed, class-agnostic `functional_form` block to the engineering contract:

```ts
interface FunctionalFormContract {
  schema: 'functional-form/v1'
  family:
    | 'optical_absorbance_handheld'
    | 'thermal_well_cycler'
    | 'parallel_linear_dosing'
    | 'flexure_microscope'
    | 'vial_bioreactor'
    | 'electrochemical_interface'
    | 'ewod_cartridge_controller'
  openness: 'sealed' | 'sample-open' | 'mechanism-open' | 'open-pcba'
  operatorView: 'top' | 'front' | 'side' | 'host-ui'
  accessDirection: 'top' | 'front' | 'side'
  primaryAxis: 'x' | 'y' | 'z' | 'planar-array'
  repeatedCount?: number
  roleVolumes: Array<{
    role: string
    geometryFamily: string
    dimensionsBasis: string
    mustBeVisible: boolean
    mustBeAccessible: boolean
  }>
  requiredRelations: Array<{
    from: string
    relation: 'aligned-with' | 'above' | 'below' | 'contains' | 'adjacent-to' | 'repeats'
    to: string
    toleranceMm?: number
  }>
  interfaceFaces: Array<{
    role: string
    face: 'top' | 'front' | 'rear' | 'left' | 'right'
  }>
}
```

Derive this from existing contract quantities and topology, never from a product brand:

- `optical_path_length_mm` + cuvette/transmittance roles;
- `tube_count` + thermal block;
- `channel_count` + lead-screw actuation;
- `stage_axis_count` + objective/camera path;
- `working_volume_ml` + culture vial + OD/stir/dosing roles;
- `compliance_voltage_v` + WE/RE/CE;
- `electrode_count` + EWOD/HV/cartridge roles.

The contract is intent. Blender must emit a **delivered** `form-proof.json` from actual objects and render regions, so the engine audits phenotype rather than trusting state.

---

## Product-by-product SIGHT findings

Scores below are **functional-form assessments**, not dossier scores.

### 1. Open Colorimeter — current functional-form: approximately 3/10

#### Why the gold looks that way

- Beer–Lambert measurement forces one short, light-tight source→cuvette→detector axis.
- Top-loading sample forces a square well on a raised optical cube.
- Ambient rejection forces a removable cap and circular cap rim.
- A local reading forces display and finger-sized controls on the same look-down deck.
- Wavelength change forces a small source daughterboard on the cube face.
- Batch-of-20 manufacture forces a compact printed L-body with visible fasteners.

#### Delivered divergence

The accepted exterior is a long, deep charcoal slab with a tall rectangular tower. The HMI is nearly hidden by the low side camera. The tower reads like an appliance chimney, not a near-cubic optical chamber. The sample well, cap nest, source PCB and cable channel do not read at a glance. The body has far more empty volume than the physics requires.

The correct nouns exist in code, but their **ratios and composition are wrong**. Presence is not convergence.

#### SOURCE changes

- Add a typed `optical_absorbance_handheld` contract builder; do not rely on generic instrument dimensions.
- In `instrument_form_rule.py`, derive body dimensions from:
  - display/control cluster width;
  - optical cube width from cuvette + baffle + wall thickness;
  - only the overlap/step needed to connect those volumes.
- Hard relational guards:
  - optical cube plan aspect 0.75–1.35;
  - cube height ≥55% body height but never a chimney;
  - body long edge ≤155 mm when not brief-pinned;
  - well centred on optical cube;
  - source board centred on optical axis;
  - cap nest adjacent to well, not HMI centre;
  - display and controls visible in top 3/4 view.
- Reframe 04–07 from a high front 3/4 camera. A low side elevation must fail because it hides the operating plane.
- Use role-honest dark polymer, dark glass, green source FR4, metal screws and translucent cuvette. The current largely monochrome result suppresses functional hierarchy.

#### proveCatch

A long slab + tower with correct mesh names must fail `OPTICAL_CUBE_CHIMNEY`, `HMI_NOT_VISIBLE` and `EXCESS_EMPTY_BODY`.

---

### 2. NinjaPCR — current functional-form: approximately 5/10

#### Why the gold looks that way

- Tube contact forces a dense aluminium well block at the centre.
- Fast heating/cooling forces heatsink/airflow volume and real side vents.
- Sample access forces a hinged lid.
- Lid pressure/heating forces a stiff lid platen and a clamp/knob.
- Laser-cut maker manufacture forces planar walls, finger joints, charred edges and visible fasteners.
- The operator must see the wells when loading, so the open-lid camera must reveal them.

#### Delivered divergence

The engine is directionally closer than the generic instruments: lid, block and wells exist. But it still reads as a smooth beige box. Finger-joint construction is barely legible, vents are decorative lines, controls and service ports are weak, the lid is a slab, and the camera crops/hides the knob. The gold object's construction method is its visual language; the render does not convincingly show that construction.

#### SOURCE changes

- Introduce a `thermal_well_cycler` form contract with explicit block, lid platen, hinge, fan/heatsink, control and service roles.
- Build shell walls from planar laser-cut panels with actual interlocking tabs, not a bevelled monolithic enclosure.
- Generate vent apertures with visible depth and heatsink behind them.
- Size wells from `tube_count` and tube OD; array layout must be a contract output.
- Make the knob a genuine clamping mechanism connected through the lid, not a decorative star on a slab.
- Place front reset/mode/power features on the actual face and ensure 04/07 reveal them.
- Improve material response: plywood laminations/char edges, aluminium block, black polymer knob, steel fasteners.

#### proveCatch

An open beige box with wells but no hinge relation, no vent depth or hidden knob must fail even if warm-body and dark-pixel fractions pass.

---

### 3. Poseidon — current functional-form: approximately 5/10

#### Why the gold looks that way

- Each syringe needs an independent linear axis.
- Infuse **and withdraw** forces a carriage that positively captures the plunger.
- Lead screw + two rails prevent carriage rotation.
- The barrel requires a cradle and tip-end clamp.
- Wet tips point away from motors/electronics.
- The mechanism must remain open because loading and motion inspection are the primary interaction.
- Channel count directly forces repeated bay count and base width.

#### Delivered divergence

The engine correctly chose an open repeated mechanism, but the phenotype is incoherent. Rods float above the device, syringes intersect bulky blue walls, drive axes do not read as continuous stepper→screw→carriage chains, the front cradles look like bins, and the control console is oversized and detached. The exterior camera is too low and close, hiding the repeated kinematic story.

#### SOURCE changes

- Make `parallel_linear_dosing` a role-graph layout, not a mesh-count layout.
- Per channel enforce collinearity:
  - stepper shaft;
  - lead screw;
  - carriage nut;
  - syringe axis;
  - plunger clamp.
- Put dual guide rails symmetrically around the lead screw.
- Place barrel cradle and tip clamp at the wet end; no blue wall may intersect the syringe.
- Keep every rod constrained between real endpoints. Any rod whose endpoints are not attached must be rejected before render.
- Scale console from PCB/display, and attach it to a serviceable spine rather than a separate architectural pavilion.
- Use a high oblique camera that shows all channels, motors, cradles and console in one frame.

#### proveCatch

Add `FLOATING_LINEAR_MEMBER`, `AXIS_MISALIGNMENT`, `MISSING_WITHDRAWAL_CLAMP`, `CHANNEL_INTERSECTION` and `CONSOLE_DOMINATES_MECHANISM`.

---

### 4. OpenFlexure — current functional-form: approximately 2/10

#### Why the gold looks that way

- A flexure stage requires compliant printed links and a monolithic moving stage, not a rigid box.
- Three independent geared actuators force three towers/drive interfaces.
- Inverted microscopy forces objective/camera below the sample.
- Transmitted brightfield forces condenser/LED above the sample.
- Sample loading forces an accessible top stage.
- Printed polymer manufacturing creates curved, ribbed, joined load paths.

#### Delivered divergence

The engine render is a white cuboid body with black side boxes, a rectangular stage recess, a white tower and a floating black disc. It does not visibly contain a flexure mechanism. There is no credible objective barrel, condenser stack, sample clip, geared actuator, printed linkage or camera path. This is a semantic diagram made of boxes, not a microscope.

#### SOURCE changes

- Replace the cuboid `lab_microscope` body with parametric flexure geometry:
  - monolithic U/omega-shaped compliant links;
  - moving stage platform;
  - three actuator contact points;
  - objective cylinder below stage;
  - condenser/LED stack above.
- Add reusable CadQuery families for:
  - flexure linkage;
  - geared stepper;
  - RMS objective/barrel;
  - condenser;
  - sample clip.
- Use ribs, fillets and printed wall thickness to express force paths.
- Tie actuator placement to `stage_axis_count`; require three when XYZ.
- Ensure camera view shows stage, at least two flexure link paths, objective and illumination in one image.

#### proveCatch

A cream cuboid with three dark boxes must fail `NO_COMPLIANT_LINK_PATH`, `NO_OBJECTIVE_AXIS`, `FLOATING_CONDENSER` and `ACTUATOR_NOT_COUPLED_TO_STAGE`.

---

### 5. Pioreactor — current functional-form: approximately 1/10

#### Why the gold looks that way

- The culture vial is the process, so it dominates the silhouette.
- OD sensing forces paired optical blocks hugging the vial at defined heights/angles.
- Stirring forces a motor/magnet volume directly below the vial.
- Heating forces intimate thermal contact around/below the vial.
- Dosing and sterile gas exchange force top tubes and serviceable pump/tubing paths.
- Raspberry Pi/HAT electronics naturally form a ventilated base below the wet process.
- Wet/dry separation forces a vertical stack: electronics → stir/heat → vial → sterile cap/tubes.

#### Delivered divergence

The accepted Pioreactor exterior is the same long slab and optical tower used by Rodeostat and OpenDrop. No culture vial, optical blocks, pump head, tubing, stir motor or Pi electronics stack is visible. It is functionally unrelated to the gold object.

#### SOURCE changes

- Split `lab_electronics` into `vial_bioreactor` when:
  - `working_volume_ml` exists and is ≤250 ml;
  - culture vessel + OD/stir/dosing roles exist.
- Build a vertical morphology:
  - open electronics frame/base;
  - stir motor and magnet under vial;
  - vial nest/heater;
  - transparent vial + fluid;
  - paired OD source/detector housings;
  - sterile cap and tubes;
  - optional peristaltic pump heads adjacent, never represented as a plant skid.
- Derive vial dimensions from volume with a realistic slenderness band.
- Keep the vial removable from the top and electronics serviceable from the side.
- Use transparent glass, visible culture liquid, black printed housings, FR4 and real tubing.

#### proveCatch

`working_volume_ml` + culture topology with no visible vial must hard-fail. A BNC connector must not substitute for a culture interface.

---

### 6. Rodeostat — current functional-form: approximately 2/10

#### Why the gold looks that way

- The function is in the AFE and external electrochemical cell, so the enclosure should be flat and PCB-sized.
- The operator watches a host plot, so no large local display or optical tower is needed.
- Three electrode connections force distinct WE/RE/CE cable exits and colour-coded leads.
- USB programming/power forces a side cutout.
- Low-current integrity favours short internal paths, compact enclosure and cable strain relief.

#### Delivered divergence

The current exterior is again the long slab + optical tower. It has none of the gold object's low flat enclosure, three coloured electrode leads, USB opening or restrained PCB-scale footprint. The shared interior BNC cues are somewhat directionally relevant, but the exterior destroys that relevance.

#### SOURCE changes

- Split `electrochemical_interface` when `compliance_voltage_v` and WE/RE/CE roles exist.
- Use a flat enclosure generated from board dimensions + connector clearances.
- Expose three distinct electrode cable exits or recessed terminals; colour coding follows role, not brand.
- Put USB on a side face with a real cutout.
- No optical cube, sample well, cap, D-pad or local display unless separately required by contract.
- Add internal guard/shield zones around AFE/TIA and keep digital/USB away from the low-current input edge.

#### proveCatch

A potentiostat with an optical tower must fail `FOREIGN_SAMPLE_INTERFACE`. Missing three-electrode interface must fail regardless of PCB and BoM completeness.

---

### 7. OpenDrop — current functional-form: approximately 1/10

#### Why the gold looks that way

- The active object is a planar electrode cartridge, so the deck must be flat and viewed from above.
- A 14×8 or contract-derived pad matrix forces a visible repeated array.
- Droplet loading and observation force the cartridge to remain exposed.
- 160–300 V actuation forces a high-voltage boundary, interlock/presence detection and prominent power state.
- Cartridge replacement forces a long edge connector/latch.
- Local menu/feedback forces a small OLED/joystick/buttons, not a colorimeter HMI.
- The open-development-board manufacturing choice honestly exposes PCB, fasteners and modules.

#### Delivered divergence

The accepted exterior is identical to the Rodeostat/colorimeter-derived slab and tower. There is no electrode grid, cartridge, long connector, HV boundary, OLED/joystick or planar droplet arena. The BoM's “Distribution Manifold” and “Flow Control Valve” are also evidence that continuous-flow plant vocabulary leaked into a digital-droplet device.

#### SOURCE changes

- Split `ewod_cartridge_controller` when `electrode_count` + HV driver + cartridge interface exist.
- Generate:
  - open PCBA/controller deck;
  - replaceable cartridge;
  - electrode grid from count and matrix aspect;
  - reservoirs;
  - long cartridge connector and mechanical alignment notches;
  - HV switch/status boundary;
  - compact OLED + joystick/buttons;
  - optional under-cartridge extension volume.
- Treat exposed FR4 as honest for this **open-PCBA** family. The “no exterior FR4” rule applies to a closed consumer enclosure pretending FR4 is a screen, not to an intentionally open development platform.
- Delete continuous-flow manifold/valve morphology from the form role graph. Droplets are actuated electrically on a plane.

#### proveCatch

An EWOD contract with no visible grid and cartridge must hard-fail. Any pipe/manifold geometry in the primary phenotype must fail `WRONG_TRANSPORT_PHYSICS`.

---

## Root-cause trace in current code

### 1. Three architectures are intentionally collapsed

`scripts/lib/instrument_form_grammar.py`:

- `LAB_ELECTRONICS_CLASS_RE` includes potentiostat, digital microfluidics and benchtop bioreactor.
- `resolve_form_family()` returns one `lab_electronics` family.
- `FORM_FAMILIES["lab_electronics"]` has no checklist.

This is not a reasonable shared form family. These products share electronics, not morphology.

### 2. The shared interior is potentiostat-shaped

`scripts/blender-universal/build_universal_scene.py::_place_lab_electronics_interior_layout` emits:

- one FR4 board;
- three generic box chips;
- USB;
- two BNC connectors;
- coin cell.

It emits the same `form_id: lab_electronics` for Pioreactor, Rodeostat and OpenDrop. BNC is a plausible electrochemistry cue but is wrong for culture and EWOD.

### 3. The exterior then receives optical colorimeter morphology

In `place_sealed_enclosure()`:

```py
if (_IS_INSTRUMENT_DEVICE
        and not _IS_THERMOCYCLER_FORM
        and not _IS_SYRINGE_PUMP_FORM
        and not _IS_LAB_MICROSCOPE_FORM):
    form = _instrument_form_rule_mm(W, D, H, base_z, tt)
```

`_IS_LAB_ELECTRONICS_FORM` is absent from the exclusion. Therefore Pioreactor, Rodeostat and OpenDrop receive the optical sample chamber, HMI and cap language after receiving the generic PCB/BNC interior.

This is the immediate source of the identical exterior images.

### 4. Form convergence is vacuous for most families

`scripts/blender-universal/form_converge_loop.py::_checklist_for_form` only checks:

- `lab_microscope`;
- `syringe_pump`.

Thermocycler, optical handheld and lab electronics return `(True, [])`.

### 5. Glance explicitly auto-passes missing families

`scripts/lib/form_render_glance.py::score_form_glance` returns:

```py
{"ok": True, "score": 1.0, "skipped": True}
```

when no scorer is registered. `lab_electronics` has no scorer.

### 6. The Yuri watcher skips the checks

`scripts/yuri-revisit-watch.sh` passes `form=""` for Pioreactor, Rodeostat and OpenDrop. `check_bar()` then skips both glance and form-id validation.

### 7. Vision routing is inconsistent

- `drawing_vision_glance.py` has a permissive `lab_electronics` prompt.
- `render_vision_critic.py` lacks the same branch and falls through to the generic optical instrument prompt.
- Drawing vision is shadow by default.
- Neither compares the delivered role graph with the contract role graph.

### 8. The dossier score is not a functional-form score

Renders/Assembly/Drawings reach 9 from:

- ledger part coverage;
- image occupancy and edge density;
- drawing file presence;
- lettering;
- generic vision “clean” verdict;
- broad colour-region heuristics.

No dedicated HARD claim asks: “does the sample interface and working physics visibly determine this product's silhouette?”

---

## Proposed SOURCE architecture

### Phase 0 — stop the false claim

Do not call dossier floor 9 “product 9/10”. In reports/UI:

- `dossier_floor`: documentation and engineering evidence score;
- `functional_form_score`: delivered morphology score;
- `gold_training_verdict`: human/vision benchmark verdict.

For Yuri completion, require all three. Existing accepted runs should remain historical, but no longer count as visual completion.

### Phase 1 — split form families by physics

In `instrument_form_grammar.py`, add function-keyed detectors:

```py
def has_vial_bioreactor_form(state_or_signals) -> bool:
    return has_qty("working_volume_ml") and has_roles(
        "culture_vessel", "stir_drive", "od_source", "od_detector")

def has_electrochemical_interface_form(state_or_signals) -> bool:
    return has_qty("compliance_voltage_v") and has_roles("working_electrode", "reference_electrode")

def has_ewod_cartridge_form(state_or_signals) -> bool:
    return has_qty("electrode_count") and has_roles("electrode_array", "hv_driver", "cartridge")
```

Do not key on `pioreactor`, `rodeostat` or `opendrop`.

New form IDs:

- `vial_bioreactor`;
- `electrochemical_interface`;
- `ewod_cartridge_controller`.

Retain `lab_electronics` only as an honest fallback, and make fallback non-shippable until a complete functional form contract is available.

### Phase 2 — build from role relations

In `build_universal_scene.py`:

1. Replace `_place_lab_electronics_interior_layout` dispatch with three form-specific placers.
2. Extract shared helpers:
   - `_place_pcb_base`;
   - `_place_usb_interface`;
   - `_place_status_indicator`;
   - `_place_service_fasteners`.
3. Each placer consumes `functional_form.roleVolumes` and `requiredRelations`.
4. Use CadQuery/forge-truth families for recognisable parts. Cuboids are acceptable only for true planar boards/panels.
5. Write object role metadata:

```py
obj["functional_role"] = "culture_vessel"
obj["form_family"] = "vial_bioreactor"
obj["geometry_source"] = "cad_family:square_cuvette"
```

6. Emit `form-proof.json` from actual scene objects:

```json
{
  "schema": "form-proof/v1",
  "form_id": "vial_bioreactor",
  "roles_present": ["pcb_base", "stir_drive", "culture_vessel", "od_source", "od_detector"],
  "relations_measured": [
    {"from": "stir_drive", "relation": "below", "to": "culture_vessel", "ok": true}
  ],
  "silhouette": {"openness": "sample-open", "dominant_role": "culture_vessel"},
  "ok": true
}
```

### Phase 3 — fix the four existing families

The existing specialised families are not done merely because their detector works.

- Optical: correct ratios, compactness, top-view visibility and materials.
- Thermocycler: real panel construction, vent depth, hinge/knob relation.
- Syringe: kinematic collinearity, endpoint attachment, intersections and camera.
- Microscope: parametric compliant linkage and optical axis, not cuboids.

### Phase 4 — make every form family prove itself

Every `FORM_FAMILIES` entry must have:

- detector;
- envelope function;
- placer;
- checklist;
- deterministic glance;
- vision prompt;
- adversarial fixture;
- role/relation proof;
- camera contract;
- GOLD-WHY document.

CI should fail if any registry entry lacks one.

---

## Deterministic gates that should replace colour-only confidence

### Gate A — form registry completeness

Fail when any form has no checklist/glance/vision/placer/envelope.

**proveCatch:** register a fake form with only `detect`; registry selftest must fail.

### Gate B — role coverage

Compare `functional_form.roleVolumes.mustBeVisible` against actual Blender objects.

**Threshold:** 100% of HARD visible roles, ≥80% of secondary roles.

**proveCatch:** Pioreactor scene containing only PCB/BNC/USB fails because vial, stir and OD roles are absent.

### Gate C — relation coherence

Evaluate delivered object transforms:

- optical source/sample/detector collinear;
- stir drive below vial;
- objective below stage and condenser above;
- syringe motor/screw/carriage/syringe collinear;
- EWOD grid contained by cartridge and adjacent to connector.

**proveCatch:** correct objects in a pile still fail.

### Gate D — openness and dominant-role silhouette

Use object occlusion + hero segmentation:

- `mechanism-open`: repeated mechanisms visibly exposed;
- `sample-open`: sample interface visible and accessible;
- `sealed`: no exposed internals on exterior;
- `open-pcba`: PCB honestly visible with hazard boundary.

**proveCatch:** sealed syringe-pump crate and enclosed EWOD cartridge fail.

### Gate E — camera reveals operation

Project required role bounding boxes into 04 exterior:

- every primary visible role must occupy a minimum pixel area;
- no required role may be fully occluded;
- the primary working axis must span a minimum fraction of the object bbox.

**proveCatch:** current low-side colorimeter and cropped PCR knob fail despite having the meshes.

### Gate F — non-box authenticity

Extend `interior_authenticity_ok` to exterior/product geometry:

- recognise cylinders, domes, glass vessels, flexure links, rails, screws, real PCB families;
- plain cuboid ratio ≤ family-specific maximum;
- forbid cuboid proxies for vial, motor, syringe, objective, connector, well.

**proveCatch:** OpenFlexure's white body + black cubes fails.

### Gate G — wrong-physics intrusion

Role vocabulary must agree with transport physics:

- EWOD: no pipe manifold/control valve as primary transport;
- potentiostat: no cuvette tower;
- culture: no BNC substitution for vial;
- thermocycler: no ambient-light cap.

**proveCatch:** use the current three identical `lab_electronics` scenes as known-bad fixtures.

### Gate H — gold training SIGHT

This is an offline benchmark, not runtime pixel copying:

1. Frozen gold photo(s) + frozen engine hero.
2. Vision prompt asks for **functional morphology**, not brand similarity.
3. Required output identifies:
   - shared physics-forced features;
   - missing physics-forced features;
   - foreign features;
   - manufacturing-language mismatch;
   - human-workflow mismatch.
4. A deterministic wrapper requires every named HARD feature to be represented by a coded role/relation gate before acceptance.

The vision critic discovers residue; deterministic role gates own shipping.

---

## Suggested code change map

| Priority | File | Change |
|---|---|---|
| P0 | `scripts/lib/instrument_form_grammar.py` | Split `lab_electronics`; add complete registry contract and checklists |
| P0 | `scripts/blender-universal/build_universal_scene.py` | Stop optical exterior on lab electronics; add vial/electrochem/EWOD placers; improve four existing placers |
| P0 | `scripts/lib/engineering-contract.ts` | Emit `functional_form/v1` from quantities + topology |
| P0 | `scripts/blender-universal/form_converge_loop.py` | Registry-dispatched checklist; unknown/missing form = fail |
| P0 | `scripts/lib/form_render_glance.py` | Unknown scorer = fail; add all form families; move from colour-only to region/role evidence |
| P0 | `scripts/yuri-revisit-watch.sh` | Resolve form from artefact; never pass empty form; reject `skipped: true` |
| P1 | `scripts/lib/minimum_working_envelope.py` | Family-specific packing; stop colorimeter packing on OD culture sensor |
| P1 | `scripts/lib/render_view_contract.py` | Family-specific camera/view packs; culture and EWOD are not generic handheld |
| P1 | `scripts/lib/render_vision_critic.py` | Form routing parity + functional morphology prompts |
| P1 | `scripts/blender-universal/drawing_vision_glance.py` | Enforcing family prompts and known-bad fixtures |
| P1 | `scripts/blender-universal/drawing_gates.py` | Add form role/relation/camera gates with proveCatch |
| P1 | `scripts/build-excel-export.py` | Functional-form failure caps Renders/Assembly ≤4 and blocks ships |
| P1 | `scripts/blender-universal/ga_glance_audit.py` | Family-specific SVG markers, no optical marker Goodhart |
| P2 | `scripts/ingest/seed_internal_cad_assets.py` + CAD builders | Add flexure link, vial/optics collar, pump head, cartridge and connector geometry families |
| P2 | `tests/fixtures/form-vision/` | Frozen known-bad current outputs + synthetic adversarial fixtures |

### Important immediate code correction

Adding `and not _IS_LAB_ELECTRONICS_FORM` to the optical exterior guard is necessary but insufficient. If done alone, it will merely leave three blank sealed boxes. Make that guard change in the same work block as the three function-specific placers or keep it behind a failing gate.

---

## Implementation sequence for the terminal

### Work block 1 — truth contract and known-bad fixtures

1. Freeze gold assets/repositories for products 05–07.
2. Copy the seven current accepted exterior PNGs into `tests/fixtures/form-vision/current-known-bad/`.
3. Encode `functional-form/v1` and a registry completeness selftest.
4. Add role/relation extraction from existing contract states.
5. Do not launch full chains.

### Work block 2 — repair the catastrophic shared phenotype

1. Split `lab_electronics` into three functional families.
2. Add vial bioreactor, electrochemical interface and EWOD placers.
3. Remove optical exterior leakage.
4. Add mesh/role/relation proveCatch tests.
5. Low-sample render only from frozen states.
6. SIGHT side-by-side with official gold photos.

### Work block 3 — improve the four specialised families

1. Colorimeter proportion/camera/materials.
2. NinjaPCR construction/vents/knob/camera.
3. Poseidon kinematic relations/intersections/camera.
4. OpenFlexure real flexure/optics geometry.

### Work block 4 — close the Goodhart paths

1. Unknown glance no longer passes.
2. Every family has checklist + glance + vision.
3. Drawing vision enforcing for instruments.
4. Delivered `form-proof.json` enters Verification as HARD.
5. Dossier cannot ship on coverage alone.

### Work block 5 — cold confirmation

Only after frozen-state form loops pass:

1. run one cold product per family;
2. open every delivered exterior and hero;
3. compare against gold on functional morphology;
4. confirm no foreign product-language features;
5. then rebuild dossier and score.

---

## Acceptance rubric for genuine ≥9 functional form

The score should be the minimum of these dimensions, with HARD failures capping at 4:

| Dimension | Weight / rule |
|---|---|
| Functional roles present | HARD: all primary roles |
| Spatial relations / working axis | HARD |
| Sample loading and access | HARD |
| Human hand/eye usability | HARD |
| Scale and proportion | HARD |
| Manufacturing/material honesty | ≥8 |
| Serviceability / replaceability | ≥8 |
| Delivered camera visibility | HARD |
| Foreign-form absence | HARD |
| Photoreal CAD presentation | ≥8 |

Gold training acceptance:

> A competent engineer shown the engine render and gold product should recognise that the same physics, workflow and manufacturing constraints shaped both objects, even though dimensions, styling and component choices may differ.

That is co-evolution. It is not pixel similarity, brand copying or product-named branching.

---

## Honest current verdict

| Product | Dossier floor | Functional-form verdict |
|---|---:|---|
| Colorimeter | 9 | FAIL — right concept, wrong proportions/camera/material hierarchy |
| NinjaPCR | 9 | FAIL — recognisable thermal box, insufficient construction/mechanism fidelity |
| Poseidon | 9 | FAIL — open repeated concept, incoherent kinematics and floating geometry |
| OpenFlexure | 9 | FAIL — generic cuboids, no credible flexure or optical path |
| Pioreactor | 9 | FAIL — wrong product family entirely |
| Rodeostat | 9 | FAIL — wrong optical tower phenotype |
| OpenDrop | 9 | FAIL — wrong optical tower phenotype; no EWOD cartridge/array |

No Yuri product should be declared visually complete on the current accepted renders.

---

## Final instruction to the terminal owner

Do not optimise the existing 9/10 score. It measures the wrong target.

Start with the delivered phenotype:

1. encode the functional role graph;
2. build actual engineering geometry from those roles;
3. prove the relations in Blender;
4. render from a camera that reveals operation;
5. attack the actual PNG against the gold's function-driven morphology;
6. only then permit the dossier score to rise.

The gold products are useful because they expose hidden constraints. If an engine-generated object does not converge toward their class of form, treat that as evidence that a constraint is still missing from the universal rule set.
