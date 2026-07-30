# Blender/SIGHT morphology audit - JLR FE Front FPK twin

Twin: `out/formula-e-front-mgu-20260729-1432`

Date: 2026-07-30

Verdict: **do not ship as fabrication CAD or photoreal supplier geometry**. The refreshed Blender twin is a useful **concept morphology / bay packaging sculpture** with a visible axial motor barrel, MCU shelf, ports, shaft stubs, and a procedurally generated concentric stack. It is not a release CAD assembly, not a supplier STEP substitute, and not evidence that the FPK can be manufactured, cooled, wired, homologated, or installed.

## Sighted artifacts

Opened visually:

- `04-product-exterior.png`
- `00-hero.png`
- `05-product-left.png`
- `06-product-right.png`
- `07-product-service.png`
- `08-product-ghost-shell.png`
- `09-product-ghost-shell-side.png`
- `10-product-ghost-shell-back.png`
- `11-product-ghost-shell-top.png`
- `12-product-ghost-shell-front.png`
- `drawings/general-arrangement.png`

Read / cross-checked:

- `render-vision-critique.json`
- `drawings/drawing-vision-critique.json`
- `JLR-FE-FRONT-FPK-MESH-AUTHENTICITY.json`
- `JLR-FE-FRONT-FPK-BLENDER-COVERAGE.json`
- `form-meshes.json`
- `route-audit.json`
- `state.json` stamps: `homologationHonesty`, `interfaceIcd`, `fpkConcentricGeometry`, `fpkRaceClosure`
- `_redteam/merged-findings.json`, `_redteam/PUNCHLIST.md`, `_redteam/sol.json`, `_redteam/glm52.json`, `_redteam/kimi.json`
- `_redteam_v3/merged.md`
- `blender-morphology-sight-rerender-20260730.log`

## Six-question verdict table

| Question | Verdict | Evidence |
|---|---|---|
| 1. Does the assembly make physical sense as a concentric MGU nest, or is it a jumble? | **Partly physical, not release-grade.** The high-level packaging idea is coherent: an axial motor barrel, visible end bells/shaft stubs, an MCU shelf above the barrel, and internal mesh names for stator, hollow rotor, sun/planet/ring gear, mini-diff, and busbars. It is not a random same-size block scatter. But the delivered exterior still reads as a simplified barrel/can with a roof shelf, not a validated sealed Formula E FPK. | `JLR-FE-FRONT-FPK-BLENDER-COVERAGE.json` reports `architecture=concentric_fpk_stack`, `covered=48/48`; `form-meshes.json` lists stator/rotor/planetary/diff/MCU meshes. The visual PNGs show a large cylindrical housing and top electronics shelf. `state.json` still says geometry source is procedural `scripts/lib/fpk_concentric_geometry.py`, not supplier CAD. |
| 2. Are the right part classes present? | **Mostly present by representation, not by released part authority.** The twin includes motor housing, stator ring, winding ends, hollow rotor, magnets, planetary pieces, MCU/inverter housing, cold plate, PCB meshes, HV connector, LV connector, coolant ports, hose stubs, and shaft stubs. The missing/wrong side is that real PCB implementation, sensor channels, exact connector MPNs, port coordinates, and routed harness/fluid topology remain open. | Mesh authenticity now lists principal roles including `stator_ring`, `hollow_rotor`, `sic_inverter`, `inverter_coldplate`, `control_pcb`, `gate_drive_pcb`, `coolant_hoses`, `hv_cable_boot`, `lv_harness`, and `control_ribbon`. Red-team findings still reject PCB / firmware / pinout / HIL and topology completeness. |
| 3. Materials honesty? | **Improved, still not photoreal.** Materials are no longer pure clay: dark metallic case, darker rubber boots, orange-brown HV/coolant service faces, green FR4 PCB in cutaway, copper/bus colors, steel fasteners. But the render still lacks real casting texture, real connector detail, cable braid/sheathing, labels, part numbers, seal geometry, machining marks, and supplier-specific material evidence. | `build_universal_scene.py` now uses distinct `mat_rubber`, `mat_pcb`, `mat_pad`, `mat_bus`, `mat_copper`, `mat_alum`, `mat_steel`. The refreshed `04-product-exterior.png` shows black hose/boot stubs over orange service ports. Sol/GLM/Kimi still reject Blender photorealism / morphology authority. |
| 4. Floaters / disconnected parts / cosmetic pegs? | **Obvious free-floating junk is not the main failure; disconnected service topology is.** Gemini's render checklist saw no blank/exploded/floating-parts failure. The source fix converted the most obvious orange port pegs into attached short hose/boot stubs and clamps. However, the hoses and boots stop immediately; they are not routed into vehicle-side endpoints. The large translucent ghost shell is a box curtain, and the top cover/roof reads like a simplified plate stack rather than a real case closure. | `render-vision-critique.json` says `ok=true`, `broken=false`, but that checklist only catches blank/exploded/featureless gross failures. `route-audit.json` says `routes=0`. Rerender log summary says `topology_total=57`, `topology_routed=0`, `route_manifest_count=null`. |
| 5. Who has actually sighted it? | **Gemini did a basic image checklist; Sol/GLM/Kimi rejected the engineering artifact; this file is the human/agent SIGHT pass.** Gemini did not prove morphology fidelity; it only passed six gross image checks. Drawing vision did catch label overlap. Red-team seats unanimously rejected broader reliability and explicitly called out Blender as visual naming theatre / procedural sculpture. | `render-vision-critique.json`: Gemini `ok=true`, `broken=false`, checklist = blank/floating/exploded/featureless/cropped. `drawing-vision-critique.json`: `broken=true`, overlapping labels in GA front, elevation, and top. `_redteam/merged-findings.json`: `glm52`, `sol`, `kimi` all `REJECT`; GLM F4 and Sol F9 reject Blender morphology authority. |
| 6. Score: concept-sculpture vs fab-CAD readiness? | **Concept sculpture: 5/10 after source fixes. Fab-CAD readiness: 1/10.** The 5 reflects a coherent visual grammar and better service stubs. The 1 reflects zero supplier geometry, open FIA/team ICD XYZ, no HIL/dyno/CFD, no populated PCB proof, and zero routed Blender topology. This is separate from any Excel Renders tab score of 9. | `homologationHonesty.lucid_role=FFF_TRAINING_CHECK_ONLY`, `lucid_cad_paste=false`, `hil_present=false`, `supplier_gerbers_present=false`, `dyno_correlation_present=false`; `interfaceIcd.verdict=TYPES_ONLY_XYZ_OPEN`; all key port `xyz_mm=null`; `ship_ok=false`. |

## Source-level fixes made

These are safe universal FE traction-pack improvements. They do **not** claim photoreal fabrication CAD.

1. `scripts/blender-universal/build_universal_scene.py`
   - Added dark rubber material for service boots/hose stubs.
   - Added coolant hose stubs and metal clamps behind coolant ports.
   - Added HV cable boot and LV/control harness boot on service connectors.
   - Added internal signal and gate-drive ribbon cues for cutaway/ghost views.
   - Updated exterior keep-list guards so service boots/hoses stay visible while internal ribbon/PCB meshes remain hidden on closed exterior product shots.
   - Added proveCatch assertions so service ports cannot regress back to pure cosmetic pegs.

2. `scripts/lib/fpk_mesh_authenticity.py`
   - Added principal roles for `coolant_hoses`, `hv_cable_boot`, `lv_harness`, and `control_ribbon`.
   - Added coolant clamps as visual-only details.
   - Updated selftest fixtures so these service details count as compound primitives, not missing morphology.

3. `scripts/lib/fpk_concentric_geometry.py`
   - Added `mean_airgap_diameter_mm` as the actual mean diameter between rotor OD and stator ID.
   - Wrote back `fpk_mean_airgap_diameter_mm`.
   - Tightened `fpk_geometry_ok` so it includes `rotor_od < mean_airgap_diameter < stator_id`.
   - Clarified the legacy `rotor_airgap_diameter_mm` input is treated as a rotor-OD seed, not the delivered mean airgap.

## Re-render performed

Command:

```bash
BLENDER_BIN="/opt/homebrew/bin/blender" python3 scripts/render-blender-scene.py \
  --state "/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-front-mgu-20260729-1432/state.json" \
  --out-dir "/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-front-mgu-20260729-1432" \
  --force \
  --cycles-samples 48 \
  > "/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/formula-e-front-mgu-20260729-1432/blender-morphology-sight-rerender-20260730.log" 2>&1
```

Result:

- Exit code: 0.
- Log: `blender-morphology-sight-rerender-20260730.log`.
- Log terminal line: `UNIVERSAL OK - cover + 8 module page(s) from shaded 00-hero`.
- Refreshed images show black service boots/hose stubs on HV/LV/coolant ports.

Verification run:

- `python3 scripts/lib/fpk_concentric_geometry.py --selftest` -> OK.
- `python3 scripts/lib/fpk_mesh_authenticity.py --selftest` -> OK.
- Targeted Blender guard for traction keep-list -> OK.
- Full `build_universal_scene.py --selftest` in Blender is **not clean globally** because it fails an unrelated `instrument_form_grammar` lab-microscope camera assertion (`dist_k=0.88`, expected `<=0.72`). That is outside this FE-front morphology fix, but it should be fixed before treating the global Blender guard as green.

## Non-closure / reliance blockers

Do **not** set `ship_ok`.

Remaining blockers that this SIGHT pass did not and cannot close:

- No supplier/OEM STEP or released CAD authority.
- No photometric/silhouette validation against a permitted real sealed FPK reference.
- `route-audit.json` still reports `routes=0`.
- Rerender summary still reports `topology_routed=0`.
- `interfaceIcd` is types-only; all key ports have `xyz_mm=null` and `OPEN_await_supplier_icd`.
- Six race holds remain open in `_redteam_v3/merged.md`: HIL, supplier Gerbers, dyno, CFD/cold-plate, FIA/port XYZ, topology.
- GA drawing still has overlapping labels in front/elevation/top views.
- PCB, firmware, current sensing, resolver/CAN, gate drive, HIL, dyno, thermal correlation, and FIA evidence remain unresolved.

Plain-language bottom line: the Blender asset is now a better **explain-the-idea** model. It is still not something a chartered engineer should stamp as a manufacturable front MGU package.
