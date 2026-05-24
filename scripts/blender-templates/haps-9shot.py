"""haps-9shot.py — high-altitude pseudo-satellite, full-fat Blender geometry through forge_blender_lib.

Source class: haps
Typical instance: Airbus Zephyr / BAE PHASA-35 style solar-electric stratospheric
unmanned aircraft. Long thin composite wing, full-span PV array, central fuselage
pod, distributed pusher propellers, twin-boom V-tail, lithium-sulfur battery,
avionics, payload sensors, skids, pitot/AoA, and cold-soak thermal management.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P haps-9shot.py
"""
import bpy
import os
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl

fl.init_scene()

POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-haps-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

# Scale: 1 Blender unit = 1 metre.
W = 25.0
D = 4.0
H = 2.0

CX = W / 2
WING_Z = 1.18
WING_CHORD = 3.20
LE_Y = -1.55
TE_Y = 1.65
POD_Z = 0.70

MODULE_IDS = [
    "structure_containment",
    "energy_storage_source",
    "energy_conversion_transduction",
    "actuation_kinematics",
    "environmental_interface",
    "sensing_instrumentation",
    "control_compute_communication",
    "safety_protection",
    "power_distribution",
    "hmi_ergonomics",
    "maintenance_serviceability",
]
MO = fl.make_module_dict(MODULE_IDS)

MAT = fl.make_default_palette()
MAT.update({
    "composite": fl.make_mat("m_haps_composite", (0.10, 0.12, 0.16), metallic=0.15, roughness=0.48),
    "wing_skin": fl.make_mat("m_haps_wing_skin", (0.30, 0.32, 0.36), metallic=0.25, roughness=0.52),
    "solar_deep": fl.make_mat("m_haps_solar_deep", (0.00, 0.05, 1.00), metallic=0.05, roughness=0.28),
    "solar_grid": fl.make_mat("m_haps_solar_grid", (0.00, 0.95, 1.00), metallic=0.1, roughness=0.25),
    "tail_orange": fl.make_mat("m_haps_tail_orange", (1.00, 0.28, 0.00), metallic=0.0, roughness=0.45),
    "prop_black": fl.make_mat("m_haps_prop_black", (0.04, 0.05, 0.07), metallic=0.1, roughness=0.38),
    "insulation": fl.make_mat("m_haps_insulation", (1.00, 0.10, 0.85), metallic=0.0, roughness=0.55),
    "payload_glass": fl.make_mat("m_haps_payload_glass", (0.00, 0.90, 0.20), metallic=0.25, roughness=0.18),
    "skid": fl.make_mat("m_haps_skid", (0.70, 0.72, 0.76), metallic=0.65, roughness=0.35),
})

# ═══════ MODULE 3 — structure_containment ════════════════════════════════
# Six-span composite wing segments.
SEG = W / 6
for i in range(6):
    x = SEG * (i + 0.5)
    fl.add_box(f"hp3_wing_skin_segment_{i+1}", (x, 0.00, WING_Z),
               (SEG - 0.08, WING_CHORD, 0.085), MAT["wing_skin"], "structure_containment", MO)
    fl.add_cyl(f"hp3_front_spar_segment_{i+1}", (x, -1.05, WING_Z + 0.005),
               0.035, SEG - 0.12, MAT["composite"], "structure_containment", MO,
               rotation=(0, math.radians(90), 0))
    fl.add_cyl(f"hp3_rear_spar_segment_{i+1}", (x, 0.95, WING_Z - 0.005),
               0.030, SEG - 0.12, MAT["composite"], "structure_containment", MO,
               rotation=(0, math.radians(90), 0))

# Chordwise ribs and visible segment joins.
for x in [0.15, 4.17, 8.33, 12.50, 16.67, 20.83, 24.85]:
    fl.add_box(f"hp3_wing_rib_{x:.2f}", (x, 0.00, WING_Z + 0.005),
               (0.030, WING_CHORD, 0.13), MAT["composite"], "structure_containment", MO)

# Central fuselage pod and fairings.
fl.add_box("hp3_fuselage_pod_shell", (CX, 0.55, POD_Z),
           (0.46, 3.00, 0.42), MAT["composite"], "structure_containment", MO)
fl.add_cyl("hp3_fuselage_nose_fairing", (CX, -1.00, POD_Z),
           0.23, 0.18, MAT["wing_skin"], "structure_containment", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("hp3_fuselage_tail_fairing", (CX, 2.10, POD_Z),
           0.19, 0.22, MAT["wing_skin"], "structure_containment", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("hp3_pod_to_wing_pylon", (CX, -0.05, 0.96),
           (0.34, 0.95, 0.45), MAT["composite"], "structure_containment", MO)

# Twin tail booms and V-tail fixed surfaces.
for sx, name in [(-0.72, "L"), (0.72, "R")]:
    fl.add_cyl(f"hp3_tail_boom_{name}", (CX + sx, 2.55, 0.92),
               0.035, 2.05, MAT["composite"], "structure_containment", MO,
               rotation=(math.radians(90), 0, 0))
    fl.add_box(f"hp3_tail_fin_fixed_{name}", (CX + sx, 3.55, 1.10),
               (0.72, 0.075, 0.48), MAT["tail_orange"], "structure_containment", MO,
               rotation=(0, math.radians(22 if sx < 0 else -22), 0))
fl.add_box("hp3_tail_cross_tube", (CX, 3.45, 0.92),
           (1.70, 0.08, 0.08), MAT["composite"], "structure_containment", MO)

# Lightweight sprung skids under fuselage.
for sx, name in [(-0.18, "L"), (0.18, "R")]:
    fl.add_cyl(f"hp3_landing_skid_{name}", (CX + sx, 0.48, 0.28),
               0.025, 2.15, MAT["skid"], "structure_containment", MO,
               rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"hp3_skid_strut_front_{name}", (CX + sx, -0.35, 0.47),
               0.015, 0.40, MAT["skid"], "structure_containment", MO,
               rotation=(math.radians(12), 0, 0))
    fl.add_cyl(f"hp3_skid_strut_rear_{name}", (CX + sx, 1.25, 0.47),
               0.015, 0.40, MAT["skid"], "structure_containment", MO,
               rotation=(math.radians(-12), 0, 0))

# ═══════ MODULE 1 — energy_storage_source ════════════════════════════════
# Lithium-sulfur battery trays distributed through the central pod.
for j, y in enumerate([-0.45, -0.05, 0.35, 0.75, 1.15, 1.55]):
    fl.add_box(f"hp1_lis_battery_tray_{j+1}", (CX, y, 0.70),
               (0.34, 0.30, 0.18), MAT["battery"], "energy_storage_source", MO)
    fl.add_box(f"hp1_cell_stack_bus_{j+1}", (CX + 0.18, y, 0.77),
               (0.018, 0.24, 0.045), MAT["copper"], "energy_storage_source", MO)

fl.add_box("hp1_battery_bms_master", (CX - 0.19, -0.72, 0.76),
           (0.035, 0.28, 0.16), MAT["pcb"], "energy_storage_source", MO)
fl.add_box("hp1_pack_contactor_box", (CX + 0.17, -0.72, 0.64),
           (0.08, 0.22, 0.10), MAT["safety"], "energy_storage_source", MO)
fl.add_box("hp1_battery_pressure_vessel", (CX, 0.55, 0.54),
           (0.38, 2.45, 0.055), MAT["ctrl_black"], "energy_storage_source", MO)
fl.add_cyl("hp1_service_disconnect_socket", (CX - 0.24, -0.95, 0.68),
           0.045, 0.020, MAT["maint"], "energy_storage_source", MO,
           rotation=(0, math.radians(90), 0))

# ═══════ MODULE 2 — energy_conversion_transduction ═══════════════════════
# Full upper-wing photovoltaic surface: 24 monocrystalline panels.
panel_idx = 0
for i in range(6):
    x = SEG * (i + 0.5)
    for k, y in enumerate([-1.17, -0.39, 0.39, 1.17]):
        panel_idx += 1
        fl.add_box(f"hp2_pv_panel_{panel_idx:02d}", (x, y, WING_Z + 0.055),
                   (SEG - 0.28, 0.66, 0.016), MAT["solar_deep"], "energy_conversion_transduction", MO)
        fl.add_box(f"hp2_pv_grid_{panel_idx:02d}", (x, y, WING_Z + 0.066),
                   (SEG - 0.38, 0.018, 0.006), MAT["solar_grid"], "energy_conversion_transduction", MO)

# Six electric pusher motor nacelles on trailing edge.
PROP_XS = [2.70, 6.70, 10.70, 14.30, 18.30, 22.30]
for n, x in enumerate(PROP_XS):
    fl.add_cyl(f"hp2_brushless_stator_{n+1}", (x, TE_Y + 0.13, WING_Z - 0.03),
               0.13, 0.18, MAT["motor"], "energy_conversion_transduction", MO,
               rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"hp2_motor_rotor_cap_{n+1}", (x, TE_Y + 0.24, WING_Z - 0.03),
               0.10, 0.07, MAT["rotor_cap"], "energy_conversion_transduction", MO,
               rotation=(math.radians(90), 0, 0))
    fl.add_box(f"hp2_motor_controller_{n+1}", (x, TE_Y - 0.10, WING_Z - 0.08),
               (0.22, 0.16, 0.055), MAT["inverter"], "energy_conversion_transduction", MO)

# ═══════ MODULE 10 — actuation_kinematics ════════════════════════════════
# Pusher propellers, elevons, and V-tail moving control surfaces.
for n, x in enumerate(PROP_XS):
    y = TE_Y + 0.34
    z = WING_Z - 0.03
    fl.add_box(f"hp10_prop_blade_horizontal_{n+1}", (x, y, z),
               (0.62, 0.026, 0.045), MAT["prop_black"], "actuation_kinematics", MO,
               rotation=(0, math.radians(10), 0))
    fl.add_box(f"hp10_prop_blade_vertical_{n+1}", (x, y, z),
               (0.045, 0.026, 0.62), MAT["prop_black"], "actuation_kinematics", MO,
               rotation=(0, math.radians(-10), 0))
    fl.add_cyl(f"hp10_prop_hub_{n+1}", (x, y, z),
               0.055, 0.055, MAT["maint"], "actuation_kinematics", MO,
               rotation=(math.radians(90), 0, 0))

for i, x in enumerate([2.1, 5.7, 9.3, 15.7, 19.3, 22.9]):
    fl.add_box(f"hp10_trailing_elevon_{i+1}", (x, 1.52, WING_Z - 0.015),
               (2.10, 0.24, 0.040), MAT["gimbal"], "actuation_kinematics", MO,
               rotation=(math.radians(3), 0, 0))
    fl.add_cyl(f"hp10_elevon_hinge_{i+1}", (x, 1.38, WING_Z - 0.01),
               0.014, 2.05, MAT["aluminium"], "actuation_kinematics", MO,
               rotation=(0, math.radians(90), 0))

for sx, name in [(-0.72, "L"), (0.72, "R")]:
    fl.add_box(f"hp10_vtail_ruddervator_{name}", (CX + sx, 3.78, 1.12),
               (0.58, 0.055, 0.34), MAT["gimbal"], "actuation_kinematics", MO,
               rotation=(0, math.radians(28 if sx < 0 else -28), 0))
    fl.add_cyl(f"hp10_vtail_servo_{name}", (CX + sx, 3.35, 0.95),
               0.035, 0.08, MAT["fc"], "actuation_kinematics", MO,
               rotation=(0, math.radians(90), 0))

# ═══════ MODULE 7 — environmental_interface ══════════════════════════════
# Battery heating films, insulation, heat spreaders, and stratospheric vents.
for j, y in enumerate([-0.45, -0.05, 0.35, 0.75, 1.15, 1.55]):
    fl.add_box(f"hp7_battery_heater_film_{j+1}", (CX, y, 0.605),
               (0.32, 0.27, 0.012), MAT["insulation"], "environmental_interface", MO)

fl.add_box("hp7_pod_aerogel_left", (CX - 0.245, 0.55, 0.70),
           (0.025, 2.60, 0.34), MAT["thermal"], "environmental_interface", MO)
fl.add_box("hp7_pod_aerogel_right", (CX + 0.245, 0.55, 0.70),
           (0.025, 2.60, 0.34), MAT["thermal"], "environmental_interface", MO)
fl.add_box("hp7_avionics_heat_spreader", (CX, -0.62, 0.92),
           (0.36, 0.38, 0.020), MAT["heatsink"], "environmental_interface", MO)
for i, x in enumerate([5.0, 10.0, 15.0, 20.0]):
    fl.add_box(f"hp7_wing_deice_trace_{i+1}", (x, LE_Y + 0.06, WING_Z + 0.075),
               (3.2, 0.035, 0.014), MAT["insulation"], "environmental_interface", MO)
for i, y in enumerate([-0.20, 0.35, 0.90]):
    fl.add_cyl(f"hp7_pod_pressure_vent_{i+1}", (CX + 0.245, y, 0.78),
               0.025, 0.012, MAT["thermal"], "environmental_interface", MO,
               rotation=(0, math.radians(90), 0))

# ═══════ MODULE 4 — sensing_instrumentation ══════════════════════════════
# Air-data probes, inertial/GNSS sensors, payload camera, and science sensors.
fl.add_cyl("hp4_pitot_tube", (CX - 0.55, LE_Y - 0.32, WING_Z + 0.02),
           0.018, 0.65, MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("hp4_aoa_vane", (CX + 0.25, LE_Y - 0.12, WING_Z + 0.09),
           (0.06, 0.25, 0.018), MAT["sensor"], "sensing_instrumentation", MO,
           rotation=(0, 0, math.radians(18)))
fl.add_cyl("hp4_gnss_patch", (CX - 0.18, -0.35, WING_Z + 0.13),
           0.13, 0.028, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("hp4_imu_block", (CX - 0.14, -0.62, 0.89),
           (0.10, 0.08, 0.045), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("hp4_payload_camera_gimbal", (CX, 1.42, 0.45),
           0.13, 0.16, MAT["gimbal"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("hp4_payload_camera_lens", (CX, 1.58, 0.45),
           0.10, 0.08, MAT["lens"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_sphere("hp4_star_tracker_dome", (CX + 0.20, -0.82, 0.93),
              0.075, MAT["payload_glass"], "sensing_instrumentation", MO)
for x, name in [(3.2, "L_tip"), (21.8, "R_tip")]:
    fl.add_box(f"hp4_wingtip_met_sensor_{name}", (x, LE_Y - 0.05, WING_Z + 0.08),
               (0.12, 0.08, 0.05), MAT["sensor"], "sensing_instrumentation", MO)

# ═══════ MODULE 5 — control_compute_communication ════════════════════════
# Flight computer, autopilot, radios, satcom, and distributed control nodes.
fl.add_box("hp5_flight_computer", (CX, -0.66, 0.80),
           (0.24, 0.20, 0.075), MAT["fc"], "control_compute_communication", MO)
fl.add_box("hp5_autopilot_redundant", (CX, -0.38, 0.82),
           (0.22, 0.16, 0.060), MAT["control"], "control_compute_communication", MO)
fl.add_box("hp5_payload_processor", (CX, 1.18, 0.80),
           (0.25, 0.22, 0.080), MAT["fc"], "control_compute_communication", MO)
fl.add_cyl("hp5_satcom_dish", (CX, 1.75, 0.94),
           0.18, 0.04, MAT["antenna"], "control_compute_communication", MO)
fl.add_cyl("hp5_satcom_feed", (CX, 1.75, 1.12),
           0.025, 0.18, MAT["antenna"], "control_compute_communication", MO)
for i, x in enumerate([4.5, 8.5, 16.5, 20.5]):
    fl.add_box(f"hp5_wing_control_node_{i+1}", (x, 1.18, WING_Z - 0.08),
               (0.24, 0.12, 0.055), MAT["fc"], "control_compute_communication", MO)
for x, name in [(1.0, "L"), (24.0, "R")]:
    fl.add_cyl(f"hp5_wingtip_antenna_{name}", (x, 0.10, WING_Z + 0.22),
               0.010, 0.44, MAT["antenna"], "control_compute_communication", MO)

# ═══════ MODULE 6 — safety_protection ════════════════════════════════════
# Cutoffs, anti-collision strobes, watchdogs, and emergency recovery beacon.
fl.add_box("hp6_dual_power_cutoff", (CX + 0.18, -0.48, 0.86),
           (0.08, 0.16, 0.07), MAT["safety"], "safety_protection", MO)
fl.add_box("hp6_flight_termination_unit", (CX - 0.18, -0.25, 0.86),
           (0.09, 0.11, 0.055), MAT["safety"], "safety_protection", MO)
fl.add_box("hp6_watchdog_board", (CX + 0.17, -0.12, 0.88),
           (0.08, 0.08, 0.035), MAT["safety"], "safety_protection", MO)
fl.add_cyl("hp6_recovery_beacon", (CX, 2.02, 0.91),
           0.055, 0.12, MAT["safety"], "safety_protection", MO)
for x, name in [(0.35, "L_tip"), (24.65, "R_tip"), (CX, "tail")]:
    y = 0.0 if name != "tail" else 3.62
    z = WING_Z + 0.12 if name != "tail" else 1.34
    fl.add_sphere(f"hp6_anti_collision_strobe_{name}", (x, y, z),
                  0.055, MAT["safety"], "safety_protection", MO)
for n, x in enumerate(PROP_XS):
    fl.add_torus(f"hp6_propeller_warning_ring_{n+1}", (x, TE_Y + 0.34, WING_Z - 0.03),
                 0.34, 0.006, MAT["safety"], "safety_protection", MO,
                 rotation=(math.radians(90), 0, 0))

# ═══════ MODULE 8 — power_distribution ═══════════════════════════════════
# PV collection buses, wing harnesses, DC/DC converters, and fuselage loom.
for y, name in [(-0.92, "front"), (0.92, "rear")]:
    fl.add_box(f"hp8_pv_busbar_{name}", (CX, y, WING_Z + 0.085),
               (23.8, 0.030, 0.018), MAT["copper"], "power_distribution", MO)

for i, x in enumerate([2.2, 6.3, 10.4, 14.6, 18.7, 22.8]):
    fl.add_cyl(f"hp8_drop_harness_{i+1}", (x, 1.12, WING_Z - 0.05),
               0.015, 0.72, MAT["copper"], "power_distribution", MO,
               rotation=(math.radians(90), 0, 0))
    fl.add_box(f"hp8_mppt_converter_{i+1}", (x, 0.65, WING_Z - 0.10),
               (0.24, 0.16, 0.055), MAT["powerdist"], "power_distribution", MO)

fl.add_box("hp8_main_power_distribution_unit", (CX, -0.08, 0.58),
           (0.32, 0.35, 0.10), MAT["powerdist"], "power_distribution", MO)
fl.add_box("hp8_hv_dc_bus_fuselage", (CX, 0.48, 0.92),
           (0.08, 2.35, 0.035), MAT["copper"], "power_distribution", MO)
for x, name in [(6.7, "L_inner"), (18.3, "R_inner")]:
    fl.add_cyl(f"hp8_motor_power_bundle_{name}", (x, 1.42, WING_Z - 0.11),
               0.018, 0.62, MAT["copper"], "power_distribution", MO,
               rotation=(math.radians(90), 0, 0))

# ═══════ MODULE 11 — hmi_ergonomics ══════════════════════════════════════
# Ground-control terminal shown as an external operator interface beside aircraft.
GCS_X = CX
GCS_Y = -4.75
GCS_Z = 0.72
fl.add_box("hp11_ground_station_case", (GCS_X, GCS_Y, GCS_Z),
           (1.20, 0.55, 0.28), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_box("hp11_ground_station_screen", (GCS_X, GCS_Y - 0.18, GCS_Z + 0.23),
           (0.86, 0.055, 0.48), MAT["sensor"], "hmi_ergonomics", MO,
           rotation=(math.radians(-14), 0, 0))
fl.add_box("hp11_keyboard_panel", (GCS_X, GCS_Y + 0.05, GCS_Z + 0.17),
           (0.78, 0.34, 0.035), MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_cyl("hp11_operator_joystick", (GCS_X - 0.42, GCS_Y + 0.07, GCS_Z + 0.27),
           0.045, 0.18, MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_cyl("hp11_ground_station_antenna", (GCS_X + 0.58, GCS_Y - 0.04, GCS_Z + 0.42),
           0.012, 0.85, MAT["antenna"], "hmi_ergonomics", MO,
           rotation=(math.radians(18), 0, 0))
fl.add_box("hp11_status_lamp_strip", (GCS_X, GCS_Y + 0.32, GCS_Z + 0.18),
           (0.62, 0.035, 0.035), MAT["safety"], "hmi_ergonomics", MO)

# ═══════ MODULE 9 — maintenance_serviceability ═══════════════════════════
# Access panels, wing segment latches, service ports, lifting hard-points.
for i, x in enumerate([4.17, 8.33, 12.50, 16.67, 20.83]):
    fl.add_box(f"hp9_wing_joiner_latch_top_{i+1}", (x, -1.30, WING_Z + 0.105),
               (0.18, 0.12, 0.025), MAT["maint"], "maintenance_serviceability", MO)
    fl.add_box(f"hp9_wing_joiner_latch_rear_{i+1}", (x, 1.30, WING_Z + 0.105),
               (0.18, 0.12, 0.025), MAT["maint"], "maintenance_serviceability", MO)

fl.add_box("hp9_fuselage_battery_hatch", (CX - 0.245, 0.46, 0.70),
           (0.018, 1.30, 0.25), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("hp9_avionics_access_hatch", (CX + 0.245, -0.55, 0.78),
           (0.018, 0.45, 0.20), MAT["maint"], "maintenance_serviceability", MO)
fl.add_cyl("hp9_payload_service_port", (CX + 0.245, 1.32, 0.74),
           0.055, 0.016, MAT["maint"], "maintenance_serviceability", MO,
           rotation=(0, math.radians(90), 0))
for x, y, name in [(CX - 0.18, -0.78, "front_L"), (CX + 0.18, -0.78, "front_R"),
                   (CX - 0.18, 1.72, "rear_L"), (CX + 0.18, 1.72, "rear_R")]:
    fl.add_torus(f"hp9_lifting_hardpoint_{name}", (x, y, 0.96),
                 0.055, 0.009, MAT["maint"], "maintenance_serviceability", MO)
for x, y, name in [(CX - 0.23, -0.95, "nose"), (CX + 0.23, 2.00, "tail")]:
    fl.add_cyl(f"hp9_quick_release_pin_{name}", (x, y, 0.63),
               0.030, 0.11, MAT["maint"], "maintenance_serviceability", MO,
               rotation=(0, math.radians(90), 0))

fl.add_lights(target_centre=(W/2, 0, H/2), fill_energy=200, fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")