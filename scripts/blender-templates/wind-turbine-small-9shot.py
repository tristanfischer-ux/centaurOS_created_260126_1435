"""wind-turbine-small-9shot.py — small horizontal-axis wind turbine, full-fat Blender geometry through forge_blender_lib.

Source class: wind-turbine-small
Typical instance: 20 m guyless tubular tower with 5 m rotor diameter, compact
nacelle, integrated inverter cabinet, base battery bank, ladder/service hardware,
tower cable run, aviation lighting, weather protection, and wind instrumentation.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P wind-turbine-small-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-wind-turbine-small-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

# Scale: 1 Blender unit = 1 metre.
W = 10.0
D = 10.0
H = 22.0

CX = W / 2
CY = 0.0
FOUND_Z = 0.25
TOWER_BASE_Z = 0.5
NACELLE_Z = 19.9
HUB_Z = 19.7
HUB_Y = -0.68

MODULE_IDS = [
    "structure_containment",
    "energy_storage_source",
    "energy_conversion_transduction",
    "environmental_interface",
    "actuation_kinematics",
    "power_distribution",
    "control_compute_communication",
    "safety_protection",
    "sensing_instrumentation",
    "maintenance_serviceability",
]
MO = fl.make_module_dict(MODULE_IDS)

MAT = fl.make_default_palette()
MAT.update({
    "concrete": fl.make_mat("m_wts_concrete", (0.62, 0.64, 0.66), metallic=0.0, roughness=0.82),
    "tower_steel": fl.make_mat("m_wts_tower_steel", (0.80, 0.84, 0.88), metallic=0.55, roughness=0.36),
    "fiberglass_light": fl.make_mat("m_wts_fiberglass_light", (0.92, 0.95, 1.00), metallic=0.0, roughness=0.42),
    "blade_white": fl.make_mat("m_wts_blade_white", (1.00, 1.00, 0.92), metallic=0.0, roughness=0.38),
    "gearbox_slate": fl.make_mat("m_wts_gearbox_slate", (0.10, 0.16, 0.26), metallic=0.35, roughness=0.45),
    "yaw_teal": fl.make_mat("m_wts_yaw_teal", (0.00, 0.72, 0.88), metallic=0.15, roughness=0.38),
    "nacelle_vent": fl.make_mat("m_wts_nacelle_vent", (0.00, 0.85, 1.00), metallic=0.1, roughness=0.36),
    "weather_strip": fl.make_mat("m_wts_weather_strip", (1.00, 0.08, 0.75), metallic=0.0, roughness=0.55),
    "ladder_hot": fl.make_mat("m_wts_ladder_hot", (1.00, 0.16, 0.00), metallic=0.2, roughness=0.42),
    "bolt_dark": fl.make_mat("m_wts_bolt_dark", (0.08, 0.09, 0.11), metallic=0.75, roughness=0.32),
    "red_led": fl.make_mat("m_wts_red_led", (1.00, 0.00, 0.00), metallic=0.0, roughness=0.2),
    "foundation_mark": fl.make_mat("m_wts_foundation_mark", (1.00, 0.55, 0.00), metallic=0.0, roughness=0.48),
    "mast_black": fl.make_mat("m_wts_mast_black", (0.02, 0.025, 0.035), metallic=0.35, roughness=0.38),
    "vane_green": fl.make_mat("m_wts_vane_green", (0.00, 0.95, 0.16), metallic=0.0, roughness=0.42),
})

# ═══════ MODULE — structure_containment ══════════════════════════════════
# Concrete foundation pad.
fl.add_box("wts3_concrete_foundation_pad", (CX, CY, FOUND_Z),
           (3.00, 3.00, 0.50), MAT["concrete"], "structure_containment", MO)

# Ten stacked tubular tower sections, 2 m each, filling the tall envelope.
for i in range(10):
    z = TOWER_BASE_Z + 1.0 + i * 2.0
    fl.add_cyl(f"wts3_tower_tube_section_{i+1:02d}", (CX, CY, z),
               0.20, 2.00, MAT["tower_steel"], "structure_containment", MO)

# Visible tower flanges at alternating joints.
for j, z in enumerate([0.55, 2.50, 4.50, 6.50, 8.50, 10.50, 12.50, 14.50, 16.50, 18.50, 20.45]):
    fl.add_torus(f"wts3_tower_flange_ring_{j+1:02d}", (CX, CY, z),
                 0.215, 0.018, MAT["tower_steel"], "structure_containment", MO)

# Anchor bolts around the base plate.
for n, (dx, dy) in enumerate([(0.42, 0.42), (-0.42, 0.42), (-0.42, -0.42), (0.42, -0.42)]):
    fl.add_cyl(f"wts3_anchor_bolt_{n+1}", (CX + dx, CY + dy, 0.64),
               0.040, 0.28, MAT["bolt_dark"], "structure_containment", MO)

# Fibreglass nacelle shell only — internals belong to other modules.
fl.add_box("wts3_nacelle_lower_shell", (CX, CY, NACELLE_Z),
           (1.50, 1.00, 0.82), MAT["fiberglass_light"], "structure_containment", MO)
fl.add_cyl("wts3_nacelle_rounded_upper_shell", (CX, CY, NACELLE_Z + 0.29),
           0.48, 1.04, MAT["fiberglass_light"], "structure_containment", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("wts3_nacelle_tail_fairing", (CX, 0.58, NACELLE_Z + 0.02),
           0.30, 0.22, MAT["fiberglass_light"], "structure_containment", MO,
           rotation=(math.radians(90), 0, 0))

# ═══════ MODULE — maintenance_serviceability ═════════════════════════════
# Ladder rails and rungs running nearly the full tower height.
for side_y, side_name in [(-0.12, "L"), (0.12, "R")]:
    for i in range(10):
        z = 1.35 + i * 1.9
        fl.add_cyl(f"wts9_ladder_side_rail_{side_name}_{i+1:02d}", (CX + 0.31, side_y, z),
                   0.018, 1.55, MAT["ladder_hot"], "maintenance_serviceability", MO)

for i in range(20):
    z = 0.95 + i * 0.95
    fl.add_box(f"wts9_ladder_rung_{i+1:02d}", (CX + 0.335, CY, z),
               (0.030, 0.34, 0.030), MAT["ladder_hot"], "maintenance_serviceability", MO)

# Service hatches and inspection details distributed along tower.
for n, z in enumerate([2.2, 7.2, 12.2, 17.2]):
    fl.add_box(f"wts9_tower_inspection_hatch_{n+1}", (CX + 0.222, CY, z),
               (0.022, 0.22, 0.38), MAT["maint"], "maintenance_serviceability", MO)

fl.add_box("wts9_nacelle_top_service_hatch", (CX - 0.22, -0.05, NACELLE_Z + 0.74),
           (0.48, 0.34, 0.035), MAT["maint"], "maintenance_serviceability", MO)
fl.add_cyl("wts9_nacelle_service_port", (CX + 0.76, 0.10, NACELLE_Z + 0.04),
           0.055, 0.018, MAT["maint"], "maintenance_serviceability", MO,
           rotation=(0, math.radians(90), 0))
for n, y in enumerate([-0.45, 0.45]):
    fl.add_torus(f"wts9_foundation_lifting_eye_{n+1}", (CX - 1.10, y, 0.58),
                 0.070, 0.012, MAT["maint"], "maintenance_serviceability", MO)

# ═══════ MODULE — power_distribution ═════════════════════════════════════
# Internal tower cable routing, visible as a vertical copper column through ghosted tower.
for i in range(10):
    z = 1.45 + i * 1.85
    fl.add_cyl(f"wts8_internal_drop_cable_{i+1:02d}", (CX - 0.075, CY, z),
               0.025, 1.48, MAT["copper"], "power_distribution", MO)

fl.add_box("wts8_cable_trench_south", (CX, -1.62, 0.15),
           (1.00, 0.30, 0.30), MAT["powerdist"], "power_distribution", MO)
fl.add_box("wts8_base_inverter_cabinet", (7.00, CY, 0.60),
           (0.60, 0.40, 1.20), MAT["powerdist"], "power_distribution", MO)
fl.add_box("wts8_inverter_dc_busbar", (7.00, -0.22, 1.05),
           (0.46, 0.035, 0.09), MAT["copper"], "power_distribution", MO)
fl.add_box("wts8_tower_base_junction_box", (CX + 0.62, -0.35, 0.82),
           (0.36, 0.24, 0.30), MAT["powerdist"], "power_distribution", MO)
for n, z in enumerate([18.9, 19.35, 19.8]):
    fl.add_cyl(f"wts8_nacelle_power_loop_{n+1}", (CX - 0.18, -0.08, z),
               0.018, 0.70, MAT["copper"], "power_distribution", MO,
               rotation=(math.radians(90), 0, 0))
fl.add_torus("wts8_slip_ring_power_transfer", (CX, CY, 19.28),
             0.28, 0.024, MAT["copper"], "power_distribution", MO)

# ═══════ MODULE — energy_storage_source ══════════════════════════════════
# Base battery bank with internal tray stack.
fl.add_box("wts1_battery_bank_outer_box", (3.00, CY, 0.30),
           (1.00, 0.80, 0.60), MAT["battery"], "energy_storage_source", MO)
for n, z in enumerate([0.16, 0.30, 0.44]):
    fl.add_box(f"wts1_battery_module_tray_{n+1}", (3.00, CY, z),
               (0.82, 0.64, 0.105), MAT["battery"], "energy_storage_source", MO)
    fl.add_box(f"wts1_battery_bus_link_{n+1}", (3.48, CY, z + 0.035),
               (0.035, 0.52, 0.035), MAT["copper"], "energy_storage_source", MO)
fl.add_box("wts1_battery_bms_board", (2.46, -0.28, 0.40),
           (0.040, 0.22, 0.18), MAT["pcb"], "energy_storage_source", MO)
fl.add_cyl("wts1_battery_service_disconnect", (3.00, -0.42, 0.36),
           0.055, 0.028, MAT["maint"], "energy_storage_source", MO,
           rotation=(math.radians(90), 0, 0))

# ═══════ MODULE — energy_conversion_transduction ════════════════════════
# Generator and gearbox in the nacelle.
fl.add_cyl("wts2_permanent_magnet_generator", (CX, -0.04, NACELLE_Z + 0.03),
           0.25, 0.60, MAT["motor"], "energy_conversion_transduction", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("wts2_gearbox_housing", (CX, -0.36, NACELLE_Z + 0.03),
           (0.40, 0.50, 0.40), MAT["gearbox_slate"], "energy_conversion_transduction", MO)
fl.add_cyl("wts2_generator_rotor_core", (CX, -0.04, NACELLE_Z + 0.03),
           0.16, 0.64, MAT["rotor_cap"], "energy_conversion_transduction", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("wts2_rectifier_module", (CX + 0.42, 0.18, NACELLE_Z - 0.15),
           (0.25, 0.16, 0.12), MAT["inverter"], "energy_conversion_transduction", MO)
fl.add_box("wts2_generator_cooling_jacket", (CX - 0.34, -0.02, NACELLE_Z + 0.03),
           (0.050, 0.56, 0.42), MAT["thermal"], "energy_conversion_transduction", MO)

# ═══════ MODULE — actuation_kinematics ═══════════════════════════════════
# Yaw bearing and yaw drive below nacelle.
fl.add_torus("wts10_yaw_bearing_ring", (CX, CY, 19.18),
             0.35, 0.040, MAT["yaw_teal"], "actuation_kinematics", MO)
fl.add_cyl("wts10_yaw_motor", (CX + 0.34, 0.18, 19.23),
           0.085, 0.24, MAT["yaw_teal"], "actuation_kinematics", MO)

# Rotor hub and three swept blades in the X/Z rotor plane.
fl.add_cyl("wts10_rotor_hub_disc", (CX, HUB_Y, HUB_Z),
           0.15, 0.20, MAT["rotor_cap"], "actuation_kinematics", MO,
           rotation=(math.radians(90), 0, 0))

for n, angle_deg in enumerate([90, 210, 330]):
    angle = math.radians(angle_deg)
    r_mid = 1.38
    bx = CX + math.sin(angle) * r_mid
    bz = HUB_Z + math.cos(angle) * r_mid
    fl.add_box(f"wts10_fiberglass_blade_{n+1}", (bx, HUB_Y - 0.02, bz),
               (0.20, 0.080, 2.50), MAT["blade_white"], "actuation_kinematics", MO,
               rotation=(0, angle, 0))
    rx = CX + math.sin(angle) * 0.33
    rz = HUB_Z + math.cos(angle) * 0.33
    fl.add_box(f"wts10_blade_root_grip_{n+1}", (rx, HUB_Y - 0.01, rz),
               (0.16, 0.13, 0.34), MAT["yaw_teal"], "actuation_kinematics", MO,
               rotation=(0, angle, 0))

# Tail boom and vertical fin behind nacelle.
fl.add_cyl("wts10_tail_boom", (CX, 0.73, NACELLE_Z + 0.04),
           0.035, 0.62, MAT["yaw_teal"], "actuation_kinematics", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("wts10_vertical_tail_fin", (CX, 1.03, NACELLE_Z + 0.22),
           (0.60, 0.030, 0.60), MAT["blade_white"], "actuation_kinematics", MO)

# ═══════ MODULE — safety_protection ══════════════════════════════════════
# Brake disc, aviation lights, emergency stops, lockout and rotor warning ring.
fl.add_cyl("wts6_mechanical_brake_disc", (CX, -0.57, HUB_Z),
           0.10, 0.045, MAT["safety"], "safety_protection", MO,
           rotation=(math.radians(90), 0, 0))
for n, z in enumerate([18.80, 19.55, 20.28]):
    fl.add_sphere(f"wts6_red_aviation_led_{n+1}", (CX + 0.225, 0.03, z),
                  0.055, MAT["red_led"], "safety_protection", MO)
fl.add_box("wts6_base_emergency_stop", (6.66, -0.26, 0.98),
           (0.12, 0.08, 0.12), MAT["safety"], "safety_protection", MO)
fl.add_box("wts6_battery_cutoff_handle", (2.48, 0.34, 0.36),
           (0.08, 0.06, 0.18), MAT["safety"], "safety_protection", MO)
fl.add_cyl("wts6_rotor_lock_pin", (CX + 0.20, -0.55, HUB_Z + 0.18),
           0.026, 0.32, MAT["safety"], "safety_protection", MO,
           rotation=(0, math.radians(90), 0))
fl.add_torus("wts6_rotor_warning_swept_disc", (CX, HUB_Y - 0.035, HUB_Z),
             2.50, 0.010, MAT["safety"], "safety_protection", MO,
             rotation=(math.radians(90), 0, 0))
fl.add_box("wts6_foundation_warning_stripe", (CX, -1.25, 0.525),
           (1.20, 0.055, 0.050), MAT["foundation_mark"], "safety_protection", MO)

# ═══════ MODULE — sensing_instrumentation ════════════════════════════════
# Anemometer, wind vane, vibration and tower condition sensors.
fl.add_cyl("wts4_anemometer_mast", (CX - 0.28, -0.12, 20.92),
           0.018, 0.52, MAT["mast_black"], "sensing_instrumentation", MO)
fl.add_box("wts4_anemometer_cross_arm_x", (CX - 0.28, -0.12, 21.18),
           (0.42, 0.035, 0.035), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("wts4_anemometer_cross_arm_y", (CX - 0.28, -0.12, 21.18),
           (0.035, 0.42, 0.035), MAT["sensor"], "sensing_instrumentation", MO)
for n, (dx, dy) in enumerate([(0.25, 0.00), (-0.125, 0.216), (-0.125, -0.216)]):
    fl.add_sphere(f"wts4_anemometer_cup_{n+1}", (CX - 0.28 + dx, -0.12 + dy, 21.18),
                  0.055, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("wts4_wind_vane_boom", (CX + 0.28, -0.10, 20.98),
           0.015, 0.55, MAT["mast_black"], "sensing_instrumentation", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("wts4_wind_vane_tail", (CX + 0.28, 0.18, 20.98),
           (0.25, 0.030, 0.16), MAT["vane_green"], "sensing_instrumentation", MO)
fl.add_box("wts4_nacelle_temperature_sensor", (CX + 0.52, -0.32, NACELLE_Z + 0.28),
           (0.08, 0.06, 0.06), MAT["sensor"], "sensing_instrumentation", MO)
for n, z in enumerate([5.2, 10.2, 15.2]):
    fl.add_box(f"wts4_tower_vibration_sensor_{n+1}", (CX - 0.22, 0.07, z),
               (0.055, 0.070, 0.085), MAT["sensor"], "sensing_instrumentation", MO)

# ═══════ MODULE — control_compute_communication ══════════════════════════
# Controller, SCADA radio, nacelle controller and communications antennas.
fl.add_box("wts5_base_turbine_controller", (6.98, 0.24, 0.62),
           (0.42, 0.07, 0.70), MAT["fc"], "control_compute_communication", MO)
fl.add_box("wts5_nacelle_control_unit", (CX - 0.42, 0.18, NACELLE_Z - 0.18),
           (0.24, 0.18, 0.14), MAT["control"], "control_compute_communication", MO)
fl.add_box("wts5_yaw_control_node", (CX + 0.18, 0.36, 19.42),
           (0.18, 0.11, 0.09), MAT["fc"], "control_compute_communication", MO)
fl.add_cyl("wts5_scada_antenna_base", (7.25, 0.20, 1.34),
           0.035, 0.08, MAT["antenna"], "control_compute_communication", MO)
fl.add_cyl("wts5_scada_whip_antenna", (7.25, 0.20, 1.78),
           0.010, 0.80, MAT["antenna"], "control_compute_communication", MO)

# ═══════ MODULE — environmental_interface ════════════════════════════════
# Weather seals, vents, drain paths and grounding details.
for n, x in enumerate([CX - 0.48, CX - 0.24, CX, CX + 0.24, CX + 0.48]):
    fl.add_box(f"wts7_nacelle_side_cooling_louver_{n+1}", (x, -0.515, NACELLE_Z + 0.10),
               (0.14, 0.020, 0.055), MAT["nacelle_vent"], "environmental_interface", MO)

fl.add_box("wts7_nacelle_front_weather_seal", (CX, -0.515, NACELLE_Z - 0.26),
           (1.16, 0.030, 0.050), MAT["weather_strip"], "environmental_interface", MO)
fl.add_box("wts7_nacelle_rear_weather_seal", (CX, 0.515, NACELLE_Z - 0.24),
           (1.02, 0.030, 0.050), MAT["weather_strip"], "environmental_interface", MO)
fl.add_torus("wts7_yaw_weather_gasket", (CX, CY, 19.08),
             0.31, 0.018, MAT["weather_strip"], "environmental_interface", MO)
fl.add_box("wts7_foundation_drain_channel", (CX - 0.78, -1.02, 0.535),
           (0.18, 0.86, 0.050), MAT["nacelle_vent"], "environmental_interface", MO)
fl.add_cyl("wts7_lightning_down_conductor_upper", (CX + 0.245, 0.02, 15.3),
           0.012, 7.4, MAT["thermal"], "environmental_interface", MO)
fl.add_cyl("wts7_lightning_down_conductor_lower", (CX + 0.245, 0.02, 5.9),
           0.012, 7.4, MAT["thermal"], "environmental_interface", MO)
fl.add_box("wts7_grounding_bar_at_base", (CX + 0.78, 0.46, 0.62),
           (0.42, 0.055, 0.070), MAT["thermal"], "environmental_interface", MO)

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")