"""vfd-motor-drive-9shot.py — wall-mounted IP21 variable-frequency drive cabinet.

Single compact Siemens Sinamics-style VFD: painted steel wall cabinet
0.4 × 0.25 × 0.6 m with dense internal power electronics. The model keeps all
functional parts packed inside the outer cabinet envelope: EMI input filtering,
rectifier, DC link capacitors, IGBT inverter module on heatsink, output reactor,
control PCB, top cooling fan, terminal blocks, HMI keypad, protection and
maintenance features.

Outputs: 1 hero + 3 spatial + 9 module pages = 13 PNGs.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P vfd-motor-drive-9shot.py
"""
import bpy
import os
import sys
import math
from pathlib import Path

POC_DIR = Path(__file__).parent
sys.path.insert(0, str(POC_DIR))
import forge_blender_lib as fl

fl.init_scene()

OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-vfd-motor-drive-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 0.4
D = 0.25
H = 0.6

MODULE_IDS = [
    "structure_containment",
    "energy_conversion_transduction",
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
    "painted_steel": fl.make_mat("m_vfd_painted_steel", (0.58, 0.60, 0.64), metallic=0.35, roughness=0.48),
    "dark_vent":     fl.make_mat("m_vfd_dark_vent",     (0.03, 0.04, 0.06), metallic=0.20, roughness=0.65),
    "emi_green":     fl.make_mat("m_vfd_emi_green",     (0.00, 0.78, 0.20), metallic=0.00, roughness=0.45),
    "rectifier":     fl.make_mat("m_vfd_rectifier",     (0.16, 0.44, 1.00), metallic=0.15, roughness=0.38),
    "igbt":          fl.make_mat("m_vfd_igbt",          (0.72, 0.04, 1.00), metallic=0.00, roughness=0.42),
    "dc_cap":        fl.make_mat("m_vfd_dc_cap",        (0.00, 0.18, 1.00), metallic=0.05, roughness=0.32),
    "reactor":       fl.make_mat("m_vfd_reactor",       (0.00, 0.78, 0.88), metallic=0.05, roughness=0.42),
    "pcb_yellow":    fl.make_mat("m_vfd_pcb_yellow",    (1.00, 0.58, 0.00), metallic=0.00, roughness=0.50),
    "terminal":      fl.make_mat("m_vfd_terminal",      (0.08, 0.10, 0.14), metallic=0.15, roughness=0.55),
    "wire_black":    fl.make_mat("m_vfd_wire_black",    (0.02, 0.03, 0.05), metallic=0.00, roughness=0.72),
    "led_green":     fl.make_mat("m_vfd_led_green",     (0.00, 1.00, 0.12), metallic=0.00, roughness=0.25),
    "led_amber":     fl.make_mat("m_vfd_led_amber",     (1.00, 0.55, 0.00), metallic=0.00, roughness=0.25),
    "led_red":       fl.make_mat("m_vfd_led_red",       (1.00, 0.00, 0.00), metallic=0.00, roughness=0.25),
    "keypad_blue":   fl.make_mat("m_vfd_keypad_blue",   (0.04, 0.34, 1.00), metallic=0.00, roughness=0.35),
    "display":       fl.make_mat("m_vfd_display",       (0.00, 0.95, 1.00), metallic=0.00, roughness=0.18),
    "label_white":   fl.make_mat("m_vfd_label_white",   (0.96, 0.97, 0.98), metallic=0.00, roughness=0.42),
})

T = 0.012
FRONT_Y = -D / 2 + T / 2
BACK_Y = D / 2 - T / 2
LEFT_X = T / 2
RIGHT_X = W - T / 2
MID_X = W / 2

# ═══════ Module — structure_containment ═══════
# Outer cabinet shell only: wall panels, top/bottom, door frame, back mounting rails.
fl.add_box("vfd_shell_back_panel", (MID_X, BACK_Y, H / 2), (W, T, H), MAT["painted_steel"], "structure_containment", MO)
fl.add_box("vfd_shell_left_wall", (LEFT_X, 0.0, H / 2), (T, D, H), MAT["painted_steel"], "structure_containment", MO)
fl.add_box("vfd_shell_right_wall", (RIGHT_X, 0.0, H / 2), (T, D, H), MAT["painted_steel"], "structure_containment", MO)
fl.add_box("vfd_shell_top_panel", (MID_X, 0.0, H - T / 2), (W, D, T), MAT["painted_steel"], "structure_containment", MO)
fl.add_box("vfd_shell_bottom_panel", (MID_X, 0.0, T / 2), (W, D, T), MAT["painted_steel"], "structure_containment", MO)

fl.add_box("vfd_front_left_stile", (0.035, FRONT_Y, H / 2), (0.045, T, H - 0.024), MAT["painted_steel"], "structure_containment", MO)
fl.add_box("vfd_front_right_stile", (W - 0.035, FRONT_Y, H / 2), (0.045, T, H - 0.024), MAT["painted_steel"], "structure_containment", MO)
fl.add_box("vfd_front_top_rail", (MID_X, FRONT_Y, 0.555), (W - 0.024, T, 0.075), MAT["painted_steel"], "structure_containment", MO)
fl.add_box("vfd_front_bottom_rail", (MID_X, FRONT_Y, 0.045), (W - 0.024, T, 0.075), MAT["painted_steel"], "structure_containment", MO)
fl.add_box("vfd_front_hmi_plate", (MID_X, FRONT_Y, 0.485), (0.16, T, 0.115), MAT["painted_steel"], "structure_containment", MO)

fl.add_box("vfd_back_mount_rail_L", (0.09, 0.112, H / 2), (0.018, 0.012, H - 0.06), MAT["painted_steel"], "structure_containment", MO)
fl.add_box("vfd_back_mount_rail_R", (0.31, 0.112, H / 2), (0.018, 0.012, H - 0.06), MAT["painted_steel"], "structure_containment", MO)

# ═══════ Module — environmental_interface ═══════
# EMI filter at bottom-left, top cooling fan, and IP21 vent grilles.
fl.add_box("vfd_emi_filter_can", (0.075, -0.02, 0.105), (0.060, 0.080, 0.040), MAT["emi_green"], "environmental_interface", MO)
fl.add_box("vfd_emi_filter_label", (0.075, -0.061, 0.105), (0.045, 0.004, 0.024), MAT["label_white"], "environmental_interface", MO)

for i in range(7):
    fl.add_box(f"vfd_top_vent_louvre_{i}", (0.09 + i * 0.035, -0.005, 0.592), (0.022, 0.150, 0.004), MAT["dark_vent"], "environmental_interface", MO)
for i in range(7):
    fl.add_box(f"vfd_bottom_vent_louvre_{i}", (0.09 + i * 0.035, FRONT_Y - 0.001, 0.070), (0.022, 0.004, 0.018), MAT["dark_vent"], "environmental_interface", MO)

fl.add_cyl("vfd_top_fan_ring", (0.305, 0.038, 0.525), 0.034, 0.014, MAT["dark_vent"], "environmental_interface", MO)
fl.add_cyl("vfd_top_fan_hub", (0.305, 0.038, 0.525), 0.012, 0.018, MAT["heatsink"], "environmental_interface", MO)
for i, ang in enumerate([0, 45, 90, 135]):
    fl.add_box(f"vfd_fan_blade_{i}", (0.305, 0.038, 0.526), (0.048, 0.007, 0.006), MAT["dark_vent"], "environmental_interface", MO,
               rotation=(0, 0, math.radians(ang)))
fl.add_box("vfd_air_baffle_left", (0.052, 0.055, 0.260), (0.010, 0.070, 0.330), MAT["thermal"], "environmental_interface", MO)
fl.add_box("vfd_air_baffle_right", (0.348, 0.055, 0.300), (0.010, 0.070, 0.380), MAT["thermal"], "environmental_interface", MO)

# ═══════ Module — energy_conversion_transduction ═══════
# Rectifier bridge with small heatsink, DC-link capacitors, IGBT stage, output reactor.
fl.add_box("vfd_rectifier_bridge", (0.168, -0.010, 0.122), (0.060, 0.060, 0.030), MAT["rectifier"], "energy_conversion_transduction", MO)
for i in range(6):
    fl.add_box(f"vfd_rectifier_fin_{i}", (0.138 + i * 0.012, 0.026, 0.128), (0.004, 0.030, 0.040), MAT["heatsink"], "energy_conversion_transduction", MO)

for i, x in enumerate([0.095, 0.150, 0.205, 0.260]):
    fl.add_cyl(f"vfd_dc_link_cap_{i}", (x, 0.018, 0.250), 0.025, 0.100, MAT["dc_cap"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"vfd_dc_cap_pos_lug_{i}", (x - 0.008, 0.018, 0.305), 0.004, 0.010, MAT["copper"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"vfd_dc_cap_neg_lug_{i}", (x + 0.008, 0.018, 0.305), 0.004, 0.010, MAT["copper"], "energy_conversion_transduction", MO)

fl.add_box("vfd_igbt_power_module", (0.205, -0.010, 0.390), (0.160, 0.036, 0.060), MAT["igbt"], "energy_conversion_transduction", MO)
fl.add_box("vfd_igbt_thermal_pad", (0.205, 0.014, 0.390), (0.166, 0.010, 0.066), MAT["thermal"], "energy_conversion_transduction", MO)
fl.add_box("vfd_heatsink_backplate", (0.205, 0.060, 0.390), (0.175, 0.020, 0.112), MAT["heatsink"], "energy_conversion_transduction", MO)
for i in range(10):
    fl.add_box(f"vfd_igbt_heatsink_fin_{i}", (0.125 + i * 0.018, 0.085, 0.390), (0.005, 0.050, 0.112), MAT["heatsink"], "energy_conversion_transduction", MO)

fl.add_torus("vfd_output_reactor_toroid", (0.313, -0.026, 0.255), 0.032, 0.010, MAT["reactor"], "energy_conversion_transduction", MO,
             rotation=(math.radians(90), 0, 0))
fl.add_box("vfd_output_reactor_clamp", (0.313, -0.026, 0.255), (0.080, 0.014, 0.012), MAT["heatsink"], "energy_conversion_transduction", MO)
fl.add_cyl("vfd_reactor_copper_turn_A", (0.313, -0.052, 0.255), 0.005, 0.062, MAT["copper"], "energy_conversion_transduction", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("vfd_reactor_copper_turn_B", (0.313, -0.000, 0.255), 0.005, 0.062, MAT["copper"], "energy_conversion_transduction", MO,
           rotation=(math.radians(90), 0, 0))

fl.add_box("vfd_brake_chopper_module", (0.318, 0.038, 0.340), (0.065, 0.030, 0.045), MAT["igbt"], "energy_conversion_transduction", MO)

# ═══════ Module — control_compute_communication ═══════
# Vertical control PCB mounted on the right/front side.
fl.add_box("vfd_control_pcb", (0.280, -0.078, 0.410), (0.180, 0.008, 0.120), MAT["pcb_yellow"], "control_compute_communication", MO)
fl.add_box("vfd_control_dsp", (0.250, -0.084, 0.423), (0.040, 0.006, 0.032), MAT["ctrl_black"], "control_compute_communication", MO)
fl.add_box("vfd_control_memory", (0.305, -0.084, 0.420), (0.030, 0.006, 0.024), MAT["ctrl_black"], "control_compute_communication", MO)
for i in range(4):
    fl.add_box(f"vfd_gate_driver_{i}", (0.218 + i * 0.030, -0.084, 0.365), (0.020, 0.006, 0.018), MAT["control"], "control_compute_communication", MO)
for i in range(5):
    fl.add_box(f"vfd_pcb_terminal_header_{i}", (0.215 + i * 0.030, -0.084, 0.466), (0.018, 0.006, 0.010), MAT["terminal"], "control_compute_communication", MO)
fl.add_box("vfd_rs485_comm_port", (0.348, -0.084, 0.392), (0.026, 0.007, 0.018), MAT["hmi"], "control_compute_communication", MO)
fl.add_box("vfd_ribbon_connector", (0.200, -0.084, 0.430), (0.012, 0.007, 0.055), MAT["copper"], "control_compute_communication", MO)

# ═══════ Module — sensing_instrumentation ═══════
# Current, DC-link, temperature, fan-tach sensing.
for i, x in enumerate([0.105, 0.150, 0.195]):
    fl.add_cyl(f"vfd_input_current_sensor_{i}", (x, -0.070, 0.145), 0.014, 0.012, MAT["sensor"], "sensing_instrumentation", MO,
               rotation=(math.radians(90), 0, 0))
for i, x in enumerate([0.245, 0.285, 0.325]):
    fl.add_cyl(f"vfd_output_current_sensor_{i}", (x, -0.070, 0.145), 0.014, 0.012, MAT["sensor"], "sensing_instrumentation", MO,
               rotation=(math.radians(90), 0, 0))
fl.add_box("vfd_dc_link_voltage_sensor", (0.285, 0.018, 0.318), (0.028, 0.018, 0.018), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("vfd_heatsink_thermistor", (0.132, 0.088, 0.440), 0.006, 0.006, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("vfd_fan_tach_sensor", (0.345, 0.038, 0.525), (0.014, 0.012, 0.010), MAT["sensor"], "sensing_instrumentation", MO)

# ═══════ Module — safety_protection ═══════
# Input fuses, isolation relay, surge suppression, grounding, interlock and warning labels.
for i, x in enumerate([0.075, 0.110, 0.145]):
    fl.add_box(f"vfd_input_fuse_{i}", (x, -0.090, 0.180), (0.022, 0.022, 0.070), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_dc_bus_contactor", (0.205, -0.086, 0.178), (0.054, 0.028, 0.055), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_mov_surge_block", (0.070, 0.052, 0.182), (0.040, 0.026, 0.030), MAT["safety"], "safety_protection", MO)
fl.add_cyl("vfd_protective_earth_stud", (0.335, -0.088, 0.085), 0.010, 0.010, MAT["copper"], "safety_protection", MO)
fl.add_box("vfd_door_interlock_switch", (0.362, FRONT_Y, 0.445), (0.018, 0.010, 0.030), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_thermal_trip", (0.104, 0.085, 0.382), (0.022, 0.012, 0.020), MAT["safety"], "safety_protection", MO)
fl.add_box("vfd_hazard_label_front", (0.200, FRONT_Y - 0.001, 0.118), (0.090, 0.003, 0.030), MAT["safety"], "safety_protection", MO)

# ═══════ Module — power_distribution ═══════
# Bottom terminal blocks, DC busbars and compact internal wiring harnesses.
for i, x in enumerate([0.075, 0.112, 0.149]):
    fl.add_box(f"vfd_input_terminal_{i}", (x, -0.082, 0.055), (0.030, 0.030, 0.030), MAT["terminal"], "power_distribution", MO)
for i, x in enumerate([0.236, 0.273, 0.310]):
    fl.add_box(f"vfd_output_terminal_{i}", (x, -0.082, 0.055), (0.030, 0.030, 0.030), MAT["terminal"], "power_distribution", MO)
fl.add_box("vfd_brake_terminal", (0.350, -0.082, 0.055), (0.026, 0.030, 0.030), MAT["terminal"], "power_distribution", MO)
fl.add_box("vfd_earth_terminal", (0.042, -0.082, 0.055), (0.026, 0.030, 0.030), MAT["copper"], "power_distribution", MO)

for i, z in enumerate([0.205, 0.225]):
    fl.add_box(f"vfd_dc_link_busbar_{i}", (0.190, -0.032, z), (0.190, 0.010, 0.008), MAT["copper"], "power_distribution", MO)
for i, x in enumerate([0.250, 0.285, 0.320]):
    fl.add_box(f"vfd_output_busbar_{i}", (x, -0.048, 0.182), (0.012, 0.014, 0.095), MAT["copper"], "power_distribution", MO)

fl.add_box("vfd_left_cable_duct", (0.048, -0.075, 0.285), (0.018, 0.026, 0.260), MAT["wire_black"], "power_distribution", MO)
fl.add_box("vfd_right_cable_duct", (0.352, -0.075, 0.285), (0.018, 0.026, 0.260), MAT["wire_black"], "power_distribution", MO)
fl.add_cyl("vfd_input_harness_bundle", (0.130, -0.066, 0.115), 0.006, 0.125, MAT["wire_black"], "power_distribution", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("vfd_output_harness_bundle", (0.280, -0.066, 0.115), 0.006, 0.120, MAT["wire_black"], "power_distribution", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("vfd_control_ribbon_cable", (0.255, -0.072, 0.505), 0.004, 0.115, MAT["copper"], "power_distribution", MO,
           rotation=(0, math.radians(90), 0))

# ═══════ Module — hmi_ergonomics ═══════
# Front keypad and three status LEDs.
fl.add_box("vfd_hmi_keypad_bezel", (MID_X, FRONT_Y - 0.001, 0.492), (0.100, 0.006, 0.080), MAT["keypad_blue"], "hmi_ergonomics", MO)
fl.add_box("vfd_hmi_display", (MID_X, FRONT_Y - 0.005, 0.515), (0.070, 0.004, 0.024), MAT["display"], "hmi_ergonomics", MO)
for row in range(3):
    for col in range(3):
        fl.add_box(f"vfd_keypad_button_{row}_{col}", (0.176 + col * 0.024, FRONT_Y - 0.006, 0.466 - row * 0.014),
                   (0.012, 0.004, 0.007), MAT["ctrl_black"], "hmi_ergonomics", MO)
for i, (z, mat) in enumerate([(0.540, MAT["led_green"]), (0.518, MAT["led_amber"]), (0.496, MAT["led_red"])]):
    fl.add_cyl(f"vfd_status_led_{i}", (0.272, FRONT_Y - 0.006, z), 0.006, 0.004, mat, "hmi_ergonomics", MO,
               rotation=(math.radians(90), 0, 0))
fl.add_box("vfd_run_stop_label", (0.200, FRONT_Y - 0.006, 0.432), (0.070, 0.003, 0.014), MAT["label_white"], "hmi_ergonomics", MO)

# ═══════ Module — maintenance_serviceability ═══════
# Door hinge knuckles, latch, service screws, rating label and diagnostic access.
for i, z in enumerate([0.115, 0.235, 0.355, 0.475]):
    fl.add_cyl(f"vfd_door_hinge_knuckle_{i}", (0.024, FRONT_Y - 0.001, z), 0.007, 0.030, MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vfd_front_latch_handle", (0.366, FRONT_Y - 0.004, 0.305), (0.018, 0.006, 0.075), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("vfd_diagnostic_flap", (0.320, FRONT_Y - 0.004, 0.122), (0.045, 0.005, 0.025), MAT["maint"], "maintenance_serviceability", MO)
for i, (x, z) in enumerate([(0.045, 0.565), (0.355, 0.565), (0.045, 0.035), (0.355, 0.035), (0.045, 0.300), (0.355, 0.300)]):
    fl.add_cyl(f"vfd_service_screw_{i}", (x, FRONT_Y - 0.004, z), 0.005, 0.004, MAT["maint"], "maintenance_serviceability", MO,
               rotation=(math.radians(90), 0, 0))
fl.add_box("vfd_rating_plate", (0.115, FRONT_Y - 0.004, 0.535), (0.055, 0.003, 0.026), MAT["label_white"], "maintenance_serviceability", MO)
fl.add_box("vfd_qr_service_label", (0.300, FRONT_Y - 0.004, 0.082), (0.032, 0.003, 0.032), MAT["maint"], "maintenance_serviceability", MO)

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")