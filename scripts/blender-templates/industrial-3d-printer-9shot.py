"""industrial-3d-printer-9shot.py — enclosed industrial FDM 3D printer with dense visible gantry interior.

Envelope: 1.0 × 1.0 × 1.5 m. Markforged X7-like enclosed printer:
translucent aluminium-frame shell, front door, heated build plate, X/Y/Z gantry,
print head carriage, steppers, filament spool/tube, top dryer, HEPA filter,
electronics, safety devices and HMI.

Outputs: 1 hero + 3 spatial + per-module pages.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P industrial-3d-printer-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-industrial-3d-printer-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 1.0
D = 1.0
H = 1.5

MO = fl.make_module_dict([
    "structure_containment",
    "actuation_kinematics",
    "energy_conversion_transduction",
    "sensing_instrumentation",
    "control_compute_communication",
    "safety_protection",
    "power_distribution",
    "hmi_ergonomics",
    "maintenance_serviceability",
    "environmental_interface",
    "mass_fluid_transport_process",
])

MAT = fl.make_default_palette()
MAT.update({
    "panel_glass":      fl.make_mat("m_panel_glass",      (0.55, 0.82, 1.00), metallic=0.0, roughness=0.18, alpha=0.28),
    "extrusion":        fl.make_mat("m_printer_extrusion", (0.72, 0.74, 0.78), metallic=0.7, roughness=0.32),
    "rail_blue":        fl.make_mat("m_axis_rail_blue",    (0.00, 0.35, 1.00), metallic=0.35, roughness=0.30),
    "gantry_orange":    fl.make_mat("m_gantry_orange",     (1.00, 0.38, 0.00), metallic=0.05, roughness=0.42),
    "belt_black":       fl.make_mat("m_belt_black",        (0.02, 0.03, 0.05), metallic=0.0, roughness=0.72),
    "heated_plate":     fl.make_mat("m_heated_plate",      (0.08, 0.10, 0.14), metallic=0.45, roughness=0.36),
    "heater_zone":      fl.make_mat("m_bed_heater_zone",   (1.00, 0.18, 0.00), metallic=0.0, roughness=0.45),
    "hotend":           fl.make_mat("m_hotend_red",        (1.00, 0.05, 0.00), metallic=0.25, roughness=0.35),
    "nozzle":           fl.make_mat("m_nozzle_brass",      (1.00, 0.62, 0.00), metallic=0.45, roughness=0.30),
    "filament":         fl.make_mat("m_filament_lime",     (0.25, 1.00, 0.00), metallic=0.0, roughness=0.50),
    "spool":            fl.make_mat("m_spool_violet",      (0.72, 0.00, 1.00), metallic=0.0, roughness=0.45),
    "dryer":            fl.make_mat("m_dryer_magenta",     (1.00, 0.05, 0.55), metallic=0.05, roughness=0.42),
    "filter":           fl.make_mat("m_hepa_filter_cyan",  (0.00, 0.90, 1.00), metallic=0.05, roughness=0.38),
    "led_lime":         fl.make_mat("m_led_lime",          (0.00, 1.00, 0.20), metallic=0.0, roughness=0.25),
    "led_red":          fl.make_mat("m_led_red",           (1.00, 0.00, 0.00), metallic=0.0, roughness=0.25),
    "webcam":           fl.make_mat("m_webcam_black",      (0.01, 0.02, 0.05), metallic=0.35, roughness=0.30),
    "build_surface":    fl.make_mat("m_build_surface",     (0.02, 0.04, 0.10), metallic=0.1, roughness=0.48),
    "cable_chain":      fl.make_mat("m_cable_chain",       (0.04, 0.05, 0.07), metallic=0.0, roughness=0.70),
})

# ═══════ Module — structure_containment: shell, door, outer frame only ═══════
POST = 0.04
PANEL_T = 0.014

fl.add_box("idp_skid_base", (W/2, 0, 0.035), (0.96, 0.96, 0.07), MAT["powerdist"], "structure_containment", MO)

for x in [POST/2, W - POST/2]:
    for y in [-D/2 + POST/2, D/2 - POST/2]:
        fl.add_box(f"idp_corner_post_{x:.2f}_{y:.2f}", (x, y, H/2), (POST, POST, H), MAT["extrusion"], "structure_containment", MO)

for z, level in [(0.085, "bottom"), (H - 0.025, "top")]:
    fl.add_box(f"idp_{level}_front_rail", (W/2, D/2 - POST/2, z), (W, POST, POST), MAT["extrusion"], "structure_containment", MO)
    fl.add_box(f"idp_{level}_rear_rail",  (W/2, -D/2 + POST/2, z), (W, POST, POST), MAT["extrusion"], "structure_containment", MO)
    fl.add_box(f"idp_{level}_left_rail",  (POST/2, 0, z), (POST, D, POST), MAT["extrusion"], "structure_containment", MO)
    fl.add_box(f"idp_{level}_right_rail", (W - POST/2, 0, z), (POST, D, POST), MAT["extrusion"], "structure_containment", MO)

fl.add_box("idp_left_translucent_panel",  (PANEL_T/2 + 0.005, 0, 0.78), (PANEL_T, 0.86, 1.32), MAT["panel_glass"], "structure_containment", MO)
fl.add_box("idp_right_translucent_panel", (W - PANEL_T/2 - 0.005, 0, 0.78), (PANEL_T, 0.86, 1.32), MAT["panel_glass"], "structure_containment", MO)
fl.add_box("idp_rear_translucent_panel",  (W/2, -D/2 + PANEL_T/2 + 0.005, 0.78), (0.86, PANEL_T, 1.32), MAT["panel_glass"], "structure_containment", MO)
fl.add_box("idp_front_door_panel",        (W/2, D/2 - PANEL_T/2 - 0.005, 0.78), (0.70, PANEL_T, 1.20), MAT["panel_glass"], "structure_containment", MO)

fl.add_box("idp_front_upper_header", (W/2, D/2 - POST/2, 1.40), (0.86, POST, 0.08), MAT["extrusion"], "structure_containment", MO)
fl.add_box("idp_front_lower_kick",   (W/2, D/2 - POST/2, 0.14), (0.86, POST, 0.10), MAT["extrusion"], "structure_containment", MO)
fl.add_box("idp_top_translucent_panel", (W/2, 0, H - PANEL_T/2), (0.82, 0.82, PANEL_T), MAT["panel_glass"], "structure_containment", MO)

for z in [0.45, 0.78, 1.11]:
    fl.add_cyl(f"idp_front_door_hinge_{z:.2f}", (0.16, D/2 - 0.012, z), 0.014, 0.06, MAT["extrusion"], "structure_containment", MO, rotation=(math.radians(90), 0, 0))

# ═══════ Module — actuation_kinematics: dense X/Y/Z gantry and moving head ═══════
for x in [0.18, 0.82]:
    for y in [-0.32, 0.32]:
        fl.add_box(f"idp_inner_z_post_{x:.2f}_{y:.2f}", (x, y, 0.78), (0.030, 0.030, 1.20), MAT["rail_blue"], "actuation_kinematics", MO)
        fl.add_cyl(f"idp_z_leadscrew_{x:.2f}_{y:.2f}", (x + 0.025, y, 0.78), 0.010, 1.16, MAT["nozzle"], "actuation_kinematics", MO)

fl.add_box("idp_x_axis_front_rail", (W/2, 0.055, 1.20), (0.88, 0.030, 0.030), MAT["rail_blue"], "actuation_kinematics", MO)
fl.add_box("idp_x_axis_rear_rail",  (W/2, -0.015, 1.20), (0.88, 0.030, 0.030), MAT["rail_blue"], "actuation_kinematics", MO)
fl.add_box("idp_y_axis_left_rail",  (0.20, 0, 1.20), (0.030, 0.88, 0.030), MAT["rail_blue"], "actuation_kinematics", MO)
fl.add_box("idp_y_axis_right_rail", (0.80, 0, 1.20), (0.030, 0.88, 0.030), MAT["rail_blue"], "actuation_kinematics", MO)
fl.add_box("idp_gantry_crossbeam",  (W/2, 0.02, 1.245), (0.72, 0.045, 0.035), MAT["gantry_orange"], "actuation_kinematics", MO)

for x in [0.29, 0.50, 0.71]:
    fl.add_box(f"idp_x_linear_bearing_{x:.2f}", (x, 0.055, 1.165), (0.070, 0.055, 0.045), MAT["gantry_orange"], "actuation_kinematics", MO)

for y in [-0.28, 0.28]:
    fl.add_box(f"idp_y_carriage_left_{y:.2f}",  (0.20, y, 1.165), (0.055, 0.070, 0.045), MAT["gantry_orange"], "actuation_kinematics", MO)
    fl.add_box(f"idp_y_carriage_right_{y:.2f}", (0.80, y, 1.165), (0.055, 0.070, 0.045), MAT["gantry_orange"], "actuation_kinematics", MO)

fl.add_box("idp_x_belt_upper", (W/2, 0.105, 1.235), (0.82, 0.010, 0.010), MAT["belt_black"], "actuation_kinematics", MO)
fl.add_box("idp_x_belt_lower", (W/2, -0.060, 1.170), (0.82, 0.010, 0.010), MAT["belt_black"], "actuation_kinematics", MO)
fl.add_box("idp_y_belt_left",  (0.155, 0, 1.230), (0.010, 0.82, 0.010), MAT["belt_black"], "actuation_kinematics", MO)
fl.add_box("idp_y_belt_right", (0.845, 0, 1.230), (0.010, 0.82, 0.010), MAT["belt_black"], "actuation_kinematics", MO)

fl.add_box("idp_printhead_carriage", (0.50, 0.055, 1.135), (0.150, 0.100, 0.080), MAT["gantry_orange"], "actuation_kinematics", MO)
fl.add_box("idp_printhead_fan_shroud", (0.50, 0.115, 1.090), (0.120, 0.035, 0.060), MAT["ctrl_black"], "actuation_kinematics", MO)
fl.add_cyl("idp_hotend_heatbreak", (0.50, 0.055, 1.045), 0.018, 0.070, MAT["hotend"], "actuation_kinematics", MO)
fl.add_cyl("idp_nozzle_tip", (0.50, 0.055, 0.995), 0.012, 0.035, MAT["nozzle"], "actuation_kinematics", MO)

for x in [0.24, 0.76]:
    for y in [-0.26, 0.26]:
        fl.add_cyl(f"idp_bed_level_screw_{x:.2f}_{y:.2f}", (x, y, 0.345), 0.012, 0.055, MAT["nozzle"], "actuation_kinematics", MO)

# ═══════ Module — energy_conversion_transduction: steppers, extruder motor, heaters ═══════
for name, loc in [
    ("idp_stepper_x_left",  (0.08, 0.055, 1.20)),
    ("idp_stepper_x_right", (0.92, 0.055, 1.20)),
    ("idp_stepper_y_rear",  (0.20, -0.43, 1.20)),
    ("idp_stepper_y_front", (0.80, 0.43, 1.20)),
]:
    fl.add_box(name, loc, (0.060, 0.060, 0.080), MAT["motor"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"{name}_shaft", (loc[0], loc[1], loc[2] - 0.055), 0.010, 0.050, MAT["nozzle"], "energy_conversion_transduction", MO)

fl.add_box("idp_extruder_drive_motor", (0.50, -0.020, 1.155), (0.070, 0.060, 0.060), MAT["motor"], "energy_conversion_transduction", MO)
fl.add_box("idp_hotend_heater_block", (0.50, 0.055, 1.020), (0.052, 0.045, 0.032), MAT["hotend"], "energy_conversion_transduction", MO)
fl.add_box("idp_bed_heater_plate", (W/2, 0, 0.285), (0.62, 0.62, 0.018), MAT["heater_zone"], "energy_conversion_transduction", MO)
for x in [0.35, 0.50, 0.65]:
    fl.add_box(f"idp_bed_heater_trace_{x:.2f}", (x, 0, 0.302), (0.018, 0.56, 0.006), MAT["hotend"], "energy_conversion_transduction", MO)

# ═══════ Module — environmental_interface: heated plate surface, HEPA, fans, chamber air ═══════
fl.add_box("idp_build_plate_surface", (W/2, 0, 0.325), (0.600, 0.600, 0.030), MAT["heated_plate"], "environmental_interface", MO)
fl.add_box("idp_pei_build_sheet", (W/2, 0, 0.345), (0.560, 0.560, 0.006), MAT["build_surface"], "environmental_interface", MO)

fl.add_box("idp_top_hepa_filter_frame", (W/2, 0.20, 1.475), (0.300, 0.180, 0.030), MAT["filter"], "environmental_interface", MO)
for i in range(7):
    fl.add_box(f"idp_hepa_pleat_{i}", (0.38 + i * 0.040, 0.20, 1.492), (0.010, 0.160, 0.018), MAT["filter"], "environmental_interface", MO)

for x, y, z, nm in [(0.15, -0.42, 0.62, "rear_left"), (0.85, -0.42, 0.62, "rear_right")]:
    fl.add_cyl(f"idp_chamber_fan_{nm}", (x, y, z), 0.055, 0.025, MAT["ctrl_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
    fl.add_box(f"idp_chamber_fan_duct_{nm}", (x, y + 0.035, z), (0.120, 0.035, 0.070), MAT["thermal"], "environmental_interface", MO)

fl.add_box("idp_rear_air_plenum", (W/2, -0.455, 0.86), (0.64, 0.035, 0.55), MAT["thermal"], "environmental_interface", MO)
fl.add_box("idp_chamber_temp_heater", (0.50, -0.430, 0.52), (0.260, 0.030, 0.050), MAT["hotend"], "environmental_interface", MO)

# ═══════ Module — mass_fluid_transport_process: spool, feeder, filament path ═══════
fl.add_cyl("idp_top_filament_spool", (0.32, -0.22, 1.38), 0.100, 0.080, MAT["spool"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_torus("idp_spool_outer_rim", (0.32, -0.22, 1.38), 0.088, 0.010, MAT["filament"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("idp_spool_hub", (0.32, -0.22, 1.38), 0.026, 0.095, MAT["nozzle"], "mass_fluid_transport_process", MO, rotation=(0, math.radians(90), 0))
fl.add_box("idp_filament_feeder_top", (0.46, -0.22, 1.42), (0.070, 0.055, 0.045), MAT["filament"], "mass_fluid_transport_process", MO)

fl.add_cyl("idp_filament_tube_top_run", (0.50, -0.11, 1.40), 0.007, 0.240, MAT["filament"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("idp_filament_tube_drop", (0.50, -0.005, 1.285), 0.007, 0.230, MAT["filament"], "mass_fluid_transport_process", MO)
fl.add_cyl("idp_filament_tube_to_head", (0.50, 0.030, 1.165), 0.007, 0.075, MAT["filament"], "mass_fluid_transport_process", MO, rotation=(math.radians(90), 0, 0))

# ═══════ Module — maintenance_serviceability: dryer, handles, access labels ═══════
fl.add_box("idp_top_filament_dryer_cabinet", (0.70, -0.22, 1.40), (0.300, 0.200, 0.200), MAT["dryer"], "maintenance_serviceability", MO)
fl.add_box("idp_dryer_window", (0.70, -0.115, 1.40), (0.180, 0.010, 0.100), MAT["panel_glass"], "maintenance_serviceability", MO)
fl.add_box("idp_dryer_desiccant_cartridge", (0.78, -0.22, 1.335), (0.060, 0.120, 0.040), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("idp_front_door_pull_handle", (0.78, D/2 - 0.020, 0.82), (0.035, 0.025, 0.240), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("idp_build_plate_pull_tab", (0.50, 0.315, 0.350), (0.160, 0.025, 0.030), MAT["maint"], "maintenance_serviceability", MO)
for i in range(3):
    fl.add_box(f"idp_service_label_{i}", (0.24 + i * 0.12, D/2 - 0.018, 0.235), (0.080, 0.006, 0.035), MAT["maint"], "maintenance_serviceability", MO)

# ═══════ Module — hmi_ergonomics: touchscreen and door LED frame ═══════
fl.add_box("idp_hmi_bezel", (0.50, D/2 - 0.020, 0.98), (0.220, 0.018, 0.140), MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_box("idp_hmi_touchscreen", (0.50, D/2 - 0.031, 0.98), (0.180, 0.006, 0.100), MAT["hmi"], "hmi_ergonomics", MO)
for i in range(3):
    fl.add_cyl(f"idp_hmi_softkey_{i}", (0.43 + i * 0.07, D/2 - 0.036, 0.900), 0.010, 0.006, MAT["led_lime"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))

fl.add_box("idp_led_bar_left",   (0.145, D/2 - 0.018, 0.82), (0.014, 0.010, 1.12), MAT["led_lime"], "hmi_ergonomics", MO)
fl.add_box("idp_led_bar_right",  (0.855, D/2 - 0.018, 0.82), (0.014, 0.010, 1.12), MAT["led_lime"], "hmi_ergonomics", MO)
fl.add_box("idp_led_bar_top",    (0.50, D/2 - 0.018, 1.385), (0.700, 0.010, 0.014), MAT["led_lime"], "hmi_ergonomics", MO)
fl.add_box("idp_led_bar_bottom", (0.50, D/2 - 0.018, 0.255), (0.700, 0.010, 0.014), MAT["led_lime"], "hmi_ergonomics", MO)

# ═══════ Module — sensing_instrumentation: camera, probes, chamber sensors ═══════
fl.add_box("idp_webcam_body", (0.15, 0.36, 1.31), (0.070, 0.045, 0.040), MAT["webcam"], "sensing_instrumentation", MO)
fl.add_cyl("idp_webcam_lens", (0.15, 0.385, 1.31), 0.018, 0.014, MAT["lens"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("idp_webcam_bracket", (0.15, 0.335, 1.35), (0.025, 0.020, 0.080), MAT["sensor"], "sensing_instrumentation", MO)

fl.add_cyl("idp_bed_probe", (0.565, 0.055, 1.030), 0.010, 0.085, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("idp_filament_runout_sensor", (0.50, -0.215, 1.345), (0.050, 0.035, 0.030), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("idp_chamber_temp_sensor", (0.82, 0.34, 1.06), (0.030, 0.020, 0.030), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("idp_bed_thermistor", (0.30, 0.27, 0.360), (0.028, 0.016, 0.012), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("idp_hepa_pressure_sensor", (0.66, 0.20, 1.430), (0.040, 0.025, 0.025), MAT["sensor"], "sensing_instrumentation", MO)

# ═══════ Module — power_distribution: PSU, busbars, harness, drag chain ═══════
fl.add_box("idp_main_power_supply", (0.76, -0.36, 0.17), (0.200, 0.150, 0.080), MAT["powerdist"], "power_distribution", MO)
fl.add_box("idp_ac_inlet_filter", (0.90, -0.455, 0.18), (0.070, 0.030, 0.055), MAT["ctrl_black"], "power_distribution", MO)
for i, z in enumerate([0.115, 0.145, 0.175]):
    fl.add_box(f"idp_low_voltage_busbar_{i}", (0.56, -0.37, z), (0.300, 0.014, 0.010), MAT["copper"], "power_distribution", MO)

for i in range(14):
    fl.add_box(f"idp_x_drag_chain_link_{i:02d}", (0.18 + i * 0.050, -0.105, 1.285), (0.030, 0.025, 0.022), MAT["cable_chain"], "power_distribution", MO)

fl.add_cyl("idp_power_harness_vertical", (0.84, -0.39, 0.69), 0.010, 1.00, MAT["copper"], "power_distribution", MO)
fl.add_cyl("idp_head_harness_drop", (0.58, -0.105, 1.205), 0.008, 0.150, MAT["cable_chain"], "power_distribution", MO)

# ═══════ Module — control_compute_communication: controller stack and comms ═══════
for i in range(4):
    fl.add_box(f"idp_controller_pcb_{i}", (0.23, -0.36, 0.135 + i * 0.035), (0.180, 0.120, 0.010), MAT["control"], "control_compute_communication", MO)
    fl.add_box(f"idp_controller_spacer_{i}", (0.155, -0.415, 0.150 + i * 0.035), (0.012, 0.012, 0.030), MAT["nozzle"], "control_compute_communication", MO)

fl.add_box("idp_motion_controller_cpu", (0.23, -0.36, 0.295), (0.080, 0.060, 0.030), MAT["fc"], "control_compute_communication", MO)
fl.add_box("idp_ethernet_module", (0.34, -0.36, 0.255), (0.050, 0.040, 0.030), MAT["control"], "control_compute_communication", MO)
fl.add_box("idp_wifi_module", (0.14, -0.36, 0.255), (0.040, 0.035, 0.020), MAT["antenna"], "control_compute_communication", MO)
fl.add_cyl("idp_internal_antenna", (0.12, -0.42, 0.42), 0.004, 0.160, MAT["antenna"], "control_compute_communication", MO)

# ═══════ Module — safety_protection: e-stop, interlocks, limit switches ═══════
fl.add_cyl("idp_estop_button", (0.72, D/2 - 0.035, 1.13), 0.036, 0.020, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("idp_estop_yellow_collar", (0.72, D/2 - 0.025, 1.13), 0.046, 0.010, MAT["fc"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("idp_door_interlock_switch", (0.165, D/2 - 0.030, 1.26), (0.035, 0.025, 0.045), MAT["safety"], "safety_protection", MO)

for name, loc in [
    ("idp_x_min_limit", (0.11, 0.065, 1.255)),
    ("idp_x_max_limit", (0.89, 0.065, 1.255)),
    ("idp_y_min_limit", (0.20, -0.405, 1.255)),
    ("idp_y_max_limit", (0.80, 0.405, 1.255)),
    ("idp_z_min_limit", (0.16, -0.32, 0.235)),
    ("idp_z_max_limit", (0.84, 0.32, 1.345)),
]:
    fl.add_box(name, loc, (0.032, 0.018, 0.024), MAT["safety"], "safety_protection", MO)

fl.add_box("idp_thermal_cutoff_bed", (0.70, 0.27, 0.355), (0.040, 0.018, 0.015), MAT["safety"], "safety_protection", MO)
fl.add_cyl("idp_smoke_sensor", (0.50, 0.36, 1.38), 0.035, 0.018, MAT["safety"], "safety_protection", MO)

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")