"""test_primitives_9shot.py — B1 primitive-library self-test (the invariant).

Composes a mixed scene exercising the parametric primitives + placement
relations: a small fixed-wing airframe (continuous wing THROUGH/ON the
fuselage — never floating boxes), a foundation slab carrying an open skid
with two horizontal vessels, a routed orthogonal pipe between the vessel
top ports, and a rack row with a declared maintenance clearance zone.

Runs every deterministic check in forge_scene_checks.py, renders ONE
9-shot-grammar hero frame to /tmp/forge-b1-test/00-hero.png (Read-tool
inspectable), prints the JSON report, and exits non-zero on any check
failure. This script IS the B1 regression invariant.

Run:
  blender --background --python scripts/blender-templates/test_primitives_9shot.py
"""
import json
import math
import os
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl
import forge_scene_checks as fsc

fl.init_scene()

OUT = Path(os.environ.get("BLENDER_OUT_DIR", "/tmp/forge-b1-test"))
OUT.mkdir(parents=True, exist_ok=True)

MODULE_IDS = [
    "structure_containment",
    "energy_conversion_transduction",
    "actuation_kinematics",
    "mass_fluid_transport_process",
    "control_compute_communication",
]
MO = fl.make_module_dict(MODULE_IDS)
MAT = fl.make_default_palette()
MAT.update({
    "composite": fl.make_mat("m_test_composite", (0.30, 0.32, 0.36), kind="carbon_fibre"),
    "steel": fl.make_mat("m_test_steel", (0.55, 0.56, 0.58), kind="painted_steel"),
    "vessel": fl.make_mat("m_test_vessel", (0.85, 0.86, 0.88), kind="stainless"),
    "concrete": fl.make_mat("m_test_concrete", (0.72, 0.71, 0.68), kind="concrete"),
    "pipe": fl.make_mat("m_test_pipe", (1.00, 0.45, 0.05), kind="painted_steel"),
})

# ═══════ Island 1 — small airframe (all dims in mm) ═══════════════════════
AX, AY, AZ = -8000, 0, 1500  # fuselage volume centre

fuselage = fl.prim_fuselage("af_fuselage", length_mm=3600, diameter_mm=420,
                            location_mm=(AX, AY, AZ), material=MAT["composite"],
                            module="structure_containment", module_objects=MO)
fl.declare_structure_root(fuselage)

wing = fl.prim_wing("af_wing", span_mm=9000, chord_mm=1050, thickness_mm=130,
                    fuselage=fuselage, mount="high", chord_offset_mm=-200,
                    material=MAT["wing_skin"] if "wing_skin" in MAT else MAT["composite"],
                    material_spar=MAT["composite"],
                    module="structure_containment", module_objects=MO)

tail = fl.prim_tail("af_tail", boom_length_mm=1900, boom_diameter_mm=80,
                    hstab_span_mm=2700, hstab_chord_mm=480, fin_height_mm=650,
                    fuselage=fuselage, material=MAT["composite"],
                    material_surface=MAT["rotor_cap"],
                    module="structure_containment", module_objects=MO)

wing_z_mm = wing["centre_m"][2] * 1000.0
wing_bottom_mm = wing_z_mm - 65  # half of 130 mm thickness
pods = []
for sx, side in [(-2300, "L"), (2300, "R")]:
    pod = fl.prim_pod(f"af_pod_{side}", length_mm=950, diameter_mm=300,
                      location_mm=(AX + sx, AY - 300, wing_bottom_mm - 320),
                      material=MAT["motor"], pylon_to_z_mm=wing_z_mm,
                      parent=wing, module="energy_conversion_transduction",
                      module_objects=MO)
    pods.append(pod)
    pcx, pcy, pcz = pod["centre_m"]
    fl.prim_propeller(f"af_prop_{side}", diameter_mm=850, n_blades=3,
                      location_mm=(pcx * 1000, (pcy * 1000) - 950 / 2 - 90, pcz * 1000),
                      material=MAT["prop_black"] if "prop_black" in MAT else MAT["ctrl_black"],
                      material_hub=MAT["maint"], axis="y", parent=pod,
                      module="actuation_kinematics", module_objects=MO)

# ═══════ Island 2 — foundation + skid + vessels + pipe + rack row ═════════
foundation = fl.prim_foundation("plant_foundation", width_mm=6500, depth_mm=3800,
                                thickness_mm=250, location_mm=(3000, 0, 0),
                                material=MAT["concrete"],
                                module="structure_containment", module_objects=MO)
fl.declare_structure_root(foundation)
F_TOP = foundation["top_z_m"] * 1000.0  # 250 mm

skid = fl.prim_skid_frame("plant_skid", width_mm=4200, depth_mm=2200, height_mm=500,
                          location_mm=(2400, -700, F_TOP), material=MAT["steel"],
                          n_cross_members=3, deck=True,
                          module="structure_containment", module_objects=MO)
fl.declare_relation(foundation, "supports", skid)
SKID_TOP = skid["top_z_m"] * 1000.0

vessels = []
for vy, tag in [(-1250, "a"), (-150, "b")]:
    v = fl.prim_vessel(f"vessel_{tag}", diameter_mm=900, length_mm=2600,
                       location_mm=(2400, vy, SKID_TOP), material=MAT["vessel"],
                       orientation="horizontal", material_support=MAT["steel"],
                       module="mass_fluid_transport_process", module_objects=MO)
    fl.declare_relation(skid, "supports", v)
    vessels.append(v)

port_a = tuple(c * 1000.0 for c in vessels[0]["ports_m"]["top"])
port_b = tuple(c * 1000.0 for c in vessels[1]["ports_m"]["top"])
fl.prim_pipe_run("pipe_va_vb",
                 waypoints_mm=fl.route_orthogonal(port_a, port_b, rise_mm=450),
                 diameter_mm=150, material=MAT["pipe"], bend_radius_mm=220,
                 connect=vessels,
                 module="mass_fluid_transport_process", module_objects=MO)

rack_row = fl.prim_rack_row("plant_racks", n_racks=4, rack_width_mm=600,
                            rack_depth_mm=800, rack_height_mm=2000, pitch_mm=700,
                            location_mm=(3000, 1300, F_TOP), material=MAT["control"],
                            material_internal=MAT["ctrl_black"], axis="x",
                            module="control_compute_communication", module_objects=MO)
fl.declare_relation(foundation, "supports", rack_row)

fl.add_clearance_zone("racks_maintenance_zone",
                      location_mm=(3000, 650, F_TOP + 1000),
                      size_mm=(2700, 400, 2000), owner=rack_row)

fl.sync_module_tags(MO)  # belt-and-braces: stamp tags exactly as templates would

# ═══════ Deterministic checks (BEFORE lights — no shadow-catcher plane) ═══
SPEC = {
    "expected_modules": MODULE_IDS,
    "envelope_mm": [18800, 5650, 2400],
    "envelope_tol": 0.05,
    "interpenetration_tolerance_mm": 5,
    "clearance_tolerance_mm": 1,
    "com": [{
        "masses": {
            "plant_foundation": 12000,
            "plant_skid": 900,
            "vessel_a": 2400,
            "vessel_b": 2400,
            "pipe_va_vb": 60,
            "plant_racks": 1200,
        },
        "scope": ["plant_foundation", "plant_skid", "vessel_a", "vessel_b",
                  "pipe_va_vb", "plant_racks"],
        "ground_tol_mm": 120,
    }],
}
findings, ok = fsc.run_all_checks(SPEC)
rep = fsc.report(findings, ok)

# ═══════ Render ONE 9-shot-grammar hero frame ═════════════════════════════
bbox = fl.compute_scene_bbox()
(xmin, xmax), (ymin, ymax), (zmin, zmax) = bbox
cx, cy, cz = (xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2
max_dim = max(xmax - xmin, ymax - ymin, zmax - zmin)
print(f"[b1-test] scene bbox X[{xmin:.2f},{xmax:.2f}] Y[{ymin:.2f},{ymax:.2f}] "
      f"Z[{zmin:.2f},{zmax:.2f}] (m)")

fl.add_lights(target_centre=(cx, cy, cz), fill_energy=260, fill_size=12)
fl.make_world_white()
fl.disable_freestyle()
fl.clear_cameras()
hero_diag = max_dim * 2.0 / math.sqrt(2)
fl.setup_camera(loc=(cx + hero_diag, cy - hero_diag, cz + max_dim * 0.45),
                target=(cx, cy, cz), ortho_scale=max_dim * 1.20)
bpy.context.scene.render.filepath = str(OUT / "00-hero.png")
bpy.ops.render.render(write_still=True)
print(f"[b1-test] rendered {OUT / '00-hero.png'}")

# ═══════ Report + exit code ═══════════════════════════════════════════════
report_path = OUT / "checks-report.json"
report_path.write_text(json.dumps(rep, indent=2))
print(json.dumps(rep, indent=2))
print(f"[b1-test] report written to {report_path}")
if not ok:
    print("[b1-test] FAIL — at least one deterministic check failed", file=sys.stderr)
    sys.exit(2)
print("[b1-test] PASS — all deterministic checks green")
