"""pv-string-inverter-9shot.py — 5–30 kW PV string inverter, wall-mounted IP65 cabinet.

Envelope 0.65 × 0.30 × 0.80 m. Single compact aluminium enclosure with all
internal power electronics packed inside the body. External features are limited
to the rear heatsink fins, front HMI, bottom cable/connectors, and top antenna /
service access.

Outputs: 1 hero + 3 spatial + 9 module pages = 13 PNGs.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P pv-string-inverter-9shot.py
"""
import bpy
import os
import math
import mathutils
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl

fl.init_scene()

POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-pv-string-inverter-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 0.65
D = 0.3
H = 0.8

MO = fl.make_module_dict([
    "structure_containment",
    "energy_conversion_transduction",
    "environmental_interface",
    "power_distribution",
    "control_compute_communication",
    "safety_protection",
    "sensing_instrumentation",
    "hmi_ergonomics",
    "maintenance_serviceability",
])

MAT = fl.make_default_palette()
MAT.update({
    "pv_aluminium": fl.make_mat("m_pv_aluminium", (0.62, 0.64, 0.68), metallic=0.55, roughness=0.42),
    "dark_gasket": fl.make_mat("m_dark_gasket", (0.02, 0.025, 0.03), metallic=0.0, roughness=0.78),
    "lcd_blue": fl.make_mat("m_lcd_blue", (0.00, 0.30, 1.00), metallic=0.0, roughness=0.28),
    "button_black": fl.make_mat("m_button_black", (0.02, 0.03, 0.05), metallic=0.0, roughness=0.55),
    "led_green": fl.make_mat("m_led_green", (0.00, 1.00, 0.10), metallic=0.0, roughness=0.22),
    "led_amber": fl.make_mat("m_led_amber", (1.00, 0.55, 0.00), metallic=0.0, roughness=0.25),
    "led_red": fl.make_mat("m_led_red", (1.00, 0.00, 0.00), metallic=0.0, roughness=0.25),
    "mppt_blue": fl.make_mat("m_mppt_blue", (0.02, 0.18, 0.95), metallic=0.0, roughness=0.42),
    "igbt_violet": fl.make_mat("m_igbt_violet", (0.62, 0.05, 0.95), metallic=0.0, roughness=0.46),
    "capacitor_cyan": fl.make_mat("m_capacitor_cyan", (0.00, 0.82, 1.00), metallic=0.1, roughness=0.34),
    "coil_orange": fl.make_mat("m_coil_orange", (1.00, 0.42, 0.00), metallic=0.25, roughness=0.36),
    "ferrite": fl.make_mat("m_ferrite", (0.05, 0.06, 0.08), metallic=0.15, roughness=0.58),
    "transformer_core": fl.make_mat("m_transformer_core", (0.10, 0.12, 0.18), metallic=0.25, roughness=0.50),
    "emi_teal": fl.make_mat("m_emi_teal", (0.00, 0.72, 0.72), metallic=0.0, roughness=0.45),
    "fan_black": fl.make_mat("m_fan_black", (0.015, 0.018, 0.025), metallic=0.25, roughness=0.42),
    "mc4_black": fl.make_mat("m_mc4_black", (0.02, 0.025, 0.03), metallic=0.0, roughness=0.72),
    "ac_gland": fl.make_mat("m_ac_gland", (0.08, 0.09, 0.11), metallic=0.25, roughness=0.48),
    "earth_green": fl.make_mat("m_earth_green", (0.00, 0.85, 0.18), metallic=0.0, roughness=0.40),
    "pcb_green": fl.make_mat("m_pcb_green", (0.00, 0.75, 0.15), metallic=0.0, roughness=0.45),
    "chip_black": fl.make_mat("m_chip_black", (0.02, 0.025, 0.035), metallic=0.15, roughness=0.48),
    "port_magenta": fl.make_mat("m_port_magenta", (1.00, 0.10, 0.55), metallic=0.0, roughness=0.42),
    "label_white": fl.make_mat("m_label_white", (0.96, 0.96, 0.90), metallic=0.0, roughness=0.35),
    "sensor_lime": fl.make_mat("m_sensor_lime", (0.00, 1.00, 0.16), metallic=0.0, roughness=0.38),
})

WALL = 0.018
Y_FRONT = -D / 2
Y_BACK = D / 2

# ═══════ Module — structure_containment ═══════
fl.add_box("pv_shell_bottom", (W / 2, 0, WALL / 2), (W, D, WALL), MAT["pv_aluminium"], "structure_containment", MO)
fl.add_box("pv_shell_top", (W / 2, 0, H - WALL / 2), (W, D, WALL), MAT["pv_aluminium"], "structure_containment", MO)
fl.add_box("pv_shell_left", (WALL / 2, 0, H / 2), (WALL, D, H), MAT["pv_aluminium"], "structure_containment", MO)
fl.add_box("pv_shell_right", (W - WALL / 2, 0, H / 2), (WALL, D, H), MAT["pv_aluminium"], "structure_containment", MO)
fl.add_box("pv_shell_front", (W / 2, Y_FRONT + WALL / 2, H / 2), (W, WALL, H), MAT["pv_aluminium"], "structure_containment", MO)
fl.add_box("pv_shell_back", (W / 2, Y_BACK - WALL / 2, H / 2), (W, WALL, H), MAT["pv_aluminium"], "structure_containment", MO)

fl.add_box("pv_front_door_gasket_top", (W / 2, Y_FRONT + 0.003, 0.735), (0.55, 0.006, 0.010), MAT["dark_gasket"], "structure_containment", MO)
fl.add_box("pv_front_door_gasket_bottom", (W / 2, Y_FRONT + 0.003, 0.065), (0.55, 0.006, 0.010), MAT["dark_gasket"], "structure_containment", MO)
fl.add_box("pv_front_door_gasket_left", (0.055, Y_FRONT + 0.003, H / 2), (0.010, 0.006, 0.66), MAT["dark_gasket"], "structure_containment", MO)
fl.add_box("pv_front_door_gasket_right", (W - 0.055, Y_FRONT + 0.003, H / 2), (0.010, 0.006, 0.66), MAT["dark_gasket"], "structure_containment", MO)

for i in range(8):
    x = 0.095 + i * 0.066
    fl.add_box(f"pv_rear_heatsink_fin_{i}", (x, Y_BACK + 0.020, 0.42), (0.030, 0.040, 0.600), MAT["heatsink"], "structure_containment", MO)

# ═══════ Module — hmi_ergonomics ═══════
fl.add_box("pv_lcd_bezel", (W / 2, Y_FRONT + 0.002, 0.635), (0.240, 0.010, 0.140), MAT["dark_gasket"], "hmi_ergonomics", MO)
fl.add_box("pv_lcd_display", (W / 2, Y_FRONT + 0.001, 0.635), (0.200, 0.006, 0.100), MAT["lcd_blue"], "hmi_ergonomics", MO)

for i, mat_key in enumerate(["led_green", "led_amber", "led_red"]):
    fl.add_cyl(f"pv_status_led_{i}", (0.215 + i * 0.055, Y_FRONT + 0.001, 0.530), 0.012, 0.010, MAT[mat_key],
               "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))

for i in range(4):
    fl.add_cyl(f"pv_push_button_{i}", (0.235 + i * 0.060, Y_FRONT + 0.001, 0.465), 0.016, 0.012, MAT["button_black"],
               "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))

fl.add_box("pv_hmi_label_strip", (W / 2, Y_FRONT + 0.001, 0.410), (0.300, 0.004, 0.026), MAT["label_white"], "hmi_ergonomics", MO)

# ═══════ Module — power_distribution ═══════
for i, x in enumerate([0.160, 0.240, 0.320, 0.400]):
    fl.add_cyl(f"pv_mc4_socket_{i}", (x, -0.070, 0.015), 0.015, 0.030, MAT["mc4_black"], "power_distribution", MO)
    fl.add_cyl(f"pv_mc4_collar_{i}", (x, -0.070, 0.040), 0.020, 0.012, MAT["dark_gasket"], "power_distribution", MO)

fl.add_cyl("pv_ac_output_gland", (0.500, -0.070, 0.018), 0.025, 0.036, MAT["ac_gland"], "power_distribution", MO)
fl.add_cyl("pv_ac_gland_collar", (0.500, -0.070, 0.047), 0.032, 0.012, MAT["dark_gasket"], "power_distribution", MO)
fl.add_box("pv_earth_bus", (0.555, 0.030, 0.055), (0.090, 0.020, 0.016), MAT["earth_green"], "power_distribution", MO)
fl.add_box("pv_earth_copper_bar", (0.555, 0.030, 0.075), (0.080, 0.010, 0.008), MAT["copper"], "power_distribution", MO)

fl.add_box("pv_dc_bus_pos", (0.250, 0.010, 0.160), (0.320, 0.014, 0.010), MAT["copper"], "power_distribution", MO)
fl.add_box("pv_dc_bus_neg", (0.250, 0.040, 0.160), (0.320, 0.014, 0.010), MAT["copper"], "power_distribution", MO)
for i, x in enumerate([0.210, 0.280, 0.350, 0.420]):
    fl.add_box(f"pv_input_fuse_link_{i}", (x, -0.045, 0.115), (0.040, 0.016, 0.050), MAT["powerdist"], "power_distribution", MO)

for i, x in enumerate([0.455, 0.490, 0.525, 0.560]):
    fl.add_box(f"pv_ac_terminal_{i}", (x, 0.035, 0.135), (0.026, 0.030, 0.040), MAT["copper"], "power_distribution", MO)

fl.add_cyl("pv_dc_harness_vertical", (0.185, 0.010, 0.245), 0.006, 0.180, MAT["copper"], "power_distribution", MO)
fl.add_cyl("pv_ac_harness_vertical", (0.525, 0.035, 0.250), 0.007, 0.210, MAT["copper"], "power_distribution", MO)

# ═══════ Module — energy_conversion_transduction ═══════
for i, x in enumerate([0.205, 0.335]):
    fl.add_cyl(f"pv_mppt_inductor_core_{i}", (x, -0.045, 0.300), 0.040, 0.100, MAT["ferrite"], "energy_conversion_transduction", MO)
    fl.add_torus(f"pv_mppt_inductor_winding_{i}", (x, -0.045, 0.300), 0.043, 0.008, MAT["coil_orange"],
                 "energy_conversion_transduction", MO)
    fl.add_box(f"pv_mppt_boost_board_{i}", (x, -0.045, 0.215), (0.105, 0.080, 0.012), MAT["mppt_blue"],
               "energy_conversion_transduction", MO)
    fl.add_box(f"pv_mppt_switchpack_{i}", (x + 0.030, -0.010, 0.235), (0.040, 0.025, 0.020), MAT["igbt_violet"],
               "energy_conversion_transduction", MO)

fl.add_cyl("pv_dc_link_capacitor", (0.105, 0.040, 0.330), 0.040, 0.200, MAT["capacitor_cyan"], "energy_conversion_transduction", MO)
fl.add_cyl("pv_dc_link_cap_pos", (0.090, 0.040, 0.440), 0.006, 0.026, MAT["copper"], "energy_conversion_transduction", MO)
fl.add_cyl("pv_dc_link_cap_neg", (0.120, 0.040, 0.440), 0.006, 0.026, MAT["copper"], "energy_conversion_transduction", MO)

fl.add_box("pv_igbt_module", (0.420, 0.095, 0.455), (0.250, 0.060, 0.100), MAT["igbt_violet"], "energy_conversion_transduction", MO)
fl.add_box("pv_igbt_coldplate", (0.420, 0.130, 0.455), (0.270, 0.018, 0.120), MAT["heatsink"], "energy_conversion_transduction", MO)
for i in range(6):
    fl.add_box(f"pv_igbt_power_terminal_{i}", (0.320 + i * 0.040, 0.058, 0.520), (0.020, 0.020, 0.014), MAT["copper"],
               "energy_conversion_transduction", MO)

fl.add_cyl("pv_ac_filter_inductor_core", (0.510, -0.040, 0.330), 0.050, 0.120, MAT["ferrite"], "energy_conversion_transduction", MO)
fl.add_torus("pv_ac_filter_inductor_winding", (0.510, -0.040, 0.330), 0.054, 0.010, MAT["coil_orange"],
             "energy_conversion_transduction", MO)
fl.add_box("pv_ac_filter_mount", (0.510, -0.040, 0.250), (0.120, 0.105, 0.012), MAT["mppt_blue"],
           "energy_conversion_transduction", MO)

fl.add_box("pv_isolation_transformer_core", (0.190, 0.045, 0.585), (0.180, 0.120, 0.140), MAT["transformer_core"],
           "energy_conversion_transduction", MO)
fl.add_box("pv_transformer_primary", (0.155, 0.002, 0.585), (0.035, 0.030, 0.120), MAT["coil_orange"],
           "energy_conversion_transduction", MO)
fl.add_box("pv_transformer_secondary", (0.225, 0.088, 0.585), (0.035, 0.030, 0.120), MAT["coil_orange"],
           "energy_conversion_transduction", MO)

# ═══════ Module — environmental_interface ═══════
fl.add_box("pv_emi_filter_can", (0.500, -0.045, 0.095), (0.150, 0.080, 0.060), MAT["emi_teal"], "environmental_interface", MO)
for i in range(3):
    fl.add_cyl(f"pv_emi_common_mode_choke_{i}", (0.455 + i * 0.045, -0.045, 0.145), 0.016, 0.020, MAT["ferrite"],
               "environmental_interface", MO)

fl.add_torus("pv_cooling_fan_ring", (0.565, 0.070, 0.700), 0.033, 0.005, MAT["fan_black"], "environmental_interface", MO,
             rotation=(math.radians(90), 0, 0))
fl.add_cyl("pv_cooling_fan_hub", (0.565, 0.070, 0.700), 0.012, 0.012, MAT["fan_black"], "environmental_interface", MO,
           rotation=(math.radians(90), 0, 0))
for i in range(4):
    fl.add_box(f"pv_cooling_fan_blade_{i}", (0.565, 0.070, 0.700), (0.045, 0.006, 0.010), MAT["thermal"],
               "environmental_interface", MO, rotation=(0, math.radians(0), math.radians(i * 45)))

for i in range(7):
    fl.add_box(f"pv_top_vent_slot_{i}", (0.450 + i * 0.022, -0.120, 0.760), (0.014, 0.006, 0.070), MAT["fan_black"],
               "environmental_interface", MO)

# ═══════ Module — control_compute_communication ═══════
fl.add_box("pv_dsp_control_board", (0.575, -0.020, 0.505), (0.008, 0.150, 0.200), MAT["pcb_green"],
           "control_compute_communication", MO)
for i, z in enumerate([0.440, 0.485, 0.530, 0.575]):
    fl.add_box(f"pv_dsp_chip_{i}", (0.568, -0.040 + (i % 2) * 0.045, z), (0.010, 0.030, 0.026), MAT["chip_black"],
               "control_compute_communication", MO)

fl.add_box("pv_wifi_radio_module", (0.520, -0.105, 0.705), (0.070, 0.045, 0.020), MAT["control"],
           "control_compute_communication", MO)
fl.add_cyl("pv_wifi_antenna_base", (0.575, -0.020, 0.775), 0.018, 0.020, MAT["ctrl_black"],
           "control_compute_communication", MO)
fl.add_cyl("pv_wifi_antenna_whip", (0.575, -0.020, 0.800), 0.006, 0.300, MAT["antenna"],
           "control_compute_communication", MO)
fl.add_box("pv_rs485_terminal", (0.565, 0.050, 0.615), (0.018, 0.080, 0.030), MAT["control"],
           "control_compute_communication", MO)
fl.add_box("pv_control_ribbon", (0.490, 0.010, 0.585), (0.120, 0.010, 0.018), MAT["copper"],
           "control_compute_communication", MO)

# ═══════ Module — safety_protection ═══════
fl.add_box("pv_afci_module", (0.105, -0.075, 0.185), (0.090, 0.060, 0.070), MAT["safety"], "safety_protection", MO)
fl.add_box("pv_dc_isolator_body", (0.105, -0.075, 0.100), (0.095, 0.060, 0.052), MAT["safety"], "safety_protection", MO)
fl.add_cyl("pv_dc_isolator_knob", (0.105, Y_FRONT + 0.001, 0.315), 0.035, 0.018, MAT["safety"], "safety_protection", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_box("pv_surge_protector", (0.180, -0.100, 0.120), (0.050, 0.040, 0.070), MAT["safety"], "safety_protection", MO)
for i in range(4):
    fl.add_box(f"pv_string_fuse_{i}", (0.225 + i * 0.045, -0.105, 0.085), (0.025, 0.025, 0.050), MAT["safety"],
               "safety_protection", MO)
fl.add_box("pv_ground_fault_relay", (0.455, 0.095, 0.235), (0.070, 0.040, 0.050), MAT["safety"], "safety_protection", MO)

# ═══════ Module — sensing_instrumentation ═══════
for i, x in enumerate([0.465, 0.505, 0.545]):
    fl.add_torus(f"pv_ac_current_sensor_{i}", (x, 0.035, 0.190), 0.018, 0.004, MAT["sensor_lime"],
                 "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))

for i, x in enumerate([0.195, 0.275, 0.355, 0.435]):
    fl.add_box(f"pv_dc_voltage_tap_{i}", (x, 0.030, 0.182), (0.018, 0.012, 0.018), MAT["sensor_lime"],
               "sensing_instrumentation", MO)

fl.add_cyl("pv_heatsink_temp_sensor", (0.520, 0.125, 0.500), 0.010, 0.008, MAT["sensor_lime"],
           "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pv_air_temp_sensor", (0.545, 0.050, 0.665), (0.020, 0.014, 0.016), MAT["sensor_lime"],
           "sensing_instrumentation", MO)
fl.add_box("pv_leakage_monitor", (0.410, -0.105, 0.125), (0.050, 0.030, 0.030), MAT["sensor_lime"],
           "sensing_instrumentation", MO)

# ═══════ Module — maintenance_serviceability ═══════
fl.add_box("pv_top_service_port_cover", (0.455, -0.030, 0.792), (0.110, 0.060, 0.008), MAT["port_magenta"],
           "maintenance_serviceability", MO)
fl.add_box("pv_front_service_label", (W / 2, Y_FRONT + 0.001, 0.250), (0.210, 0.004, 0.055), MAT["label_white"],
           "maintenance_serviceability", MO)
fl.add_box("pv_door_handle", (0.585, Y_FRONT + 0.001, 0.405), (0.030, 0.012, 0.135), MAT["port_magenta"],
           "maintenance_serviceability", MO)
for i, (x, z) in enumerate([(0.060, 0.070), (0.590, 0.070), (0.060, 0.730), (0.590, 0.730),
                            (0.060, 0.400), (0.590, 0.400)]):
    fl.add_cyl(f"pv_captive_screw_{i}", (x, Y_FRONT + 0.001, z), 0.010, 0.008, MAT["maint"],
               "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("pv_usb_diagnostic_port", (0.405, -0.030, 0.780), (0.035, 0.020, 0.010), MAT["chip_black"],
           "maintenance_serviceability", MO)
fl.add_box("pv_warning_label_dc", (0.195, Y_FRONT + 0.001, 0.355), (0.110, 0.004, 0.035), MAT["port_magenta"],
           "maintenance_serviceability", MO)
fl.add_box("pv_warning_label_ac", (0.455, Y_FRONT + 0.001, 0.355), (0.110, 0.004, 0.035), MAT["port_magenta"],
           "maintenance_serviceability", MO)

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")