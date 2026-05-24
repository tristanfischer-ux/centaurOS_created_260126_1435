"""insulin-pump-9shot.py — wearable insulin pump, 90 × 55 × 20 mm pocket device.

Source: v3 repair pass. Tiny-scale geometry in metres. All primitives are packed
inside the pump envelope unless intentionally flush to an exterior face.

Run: /Applications/Blender.app/Contents/MacOS/Blender -b -P insulin-pump-9shot.py
"""
import bpy
import math
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import forge_blender_lib as fl

fl.init_scene()
POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-insulin-pump-9shot")))

# Scale: 1 Blender unit = 1 metre. Pump envelope 90×55×20 mm.
W = 0.09
D = 0.055
H = 0.02

MO = fl.make_module_dict([
    "structure_containment",
    "energy_storage_source",
    "actuation_kinematics",
    "environmental_interface",
    "sensing_instrumentation",
    "control_compute_communication",
    "safety_protection",
    "power_distribution",
    "hmi_ergonomics",
    "maintenance_serviceability",
    "mass_fluid_transport_process",
])

MAT = fl.make_default_palette()
MAT["case_offwhite"]     = fl.make_mat("m_case_offwhite",     (0.93, 0.90, 0.82), metallic=0.0, roughness=0.62)
MAT["case_shadow"]       = fl.make_mat("m_case_shadow",       (0.70, 0.68, 0.60), metallic=0.0, roughness=0.70)
MAT["display_dark"]      = fl.make_mat("m_display_dark",      (0.00, 0.02, 0.08), metallic=0.0, roughness=0.22)
MAT["display_glow"]      = fl.make_mat("m_display_glow",      (0.00, 0.65, 1.00), metallic=0.0, roughness=0.20)
MAT["button_grey"]       = fl.make_mat("m_button_grey",       (0.10, 0.12, 0.16), metallic=0.2, roughness=0.45)
MAT["led_green"]         = fl.make_mat("m_led_green",         (0.00, 1.00, 0.18), metallic=0.0, roughness=0.22)
MAT["reservoir_clear"]   = fl.make_mat("m_reservoir_clear",   (0.72, 0.95, 1.00), metallic=0.0, roughness=0.18, alpha=0.42)
MAT["insulin_cyan"]      = fl.make_mat("m_insulin_cyan",      (0.00, 0.92, 1.00), metallic=0.0, roughness=0.28, alpha=0.68)
MAT["silicone_red"]      = fl.make_mat("m_silicone_red",      (1.00, 0.04, 0.02), metallic=0.0, roughness=0.60)
MAT["rubber_black"]      = fl.make_mat("m_rubber_black",      (0.01, 0.012, 0.018), metallic=0.0, roughness=0.70)
MAT["adhesive"]          = fl.make_mat("m_adhesive",          (1.00, 0.80, 0.18), metallic=0.0, roughness=0.72)
MAT["service_magenta"]   = fl.make_mat("m_service_magenta",   (1.00, 0.00, 0.70), metallic=0.0, roughness=0.48)
MAT["dose_orange"]       = fl.make_mat("m_dose_orange",       (1.00, 0.38, 0.00), metallic=0.0, roughness=0.45)
MAT["metal_contact"]     = fl.make_mat("m_metal_contact",     (0.95, 0.78, 0.25), metallic=0.55, roughness=0.28)
MAT["label_white"]       = fl.make_mat("m_label_white",       (1.00, 1.00, 1.00), metallic=0.0, roughness=0.50)


# ═══════ structure_containment ════════════════════════════════════════════
# Outer shell/frame only. Internal functional components are deliberately not
# tagged as structure so hero and module passes can ghost the case correctly.
fl.add_box("pump1_backplate_shell", (W/2, 0, 0.0007),
           (W, D, 0.0014), MAT["case_offwhite"], "structure_containment", MO)
fl.add_box("pump1_sidewall_y_pos", (W/2, D/2 - 0.0015, H/2),
           (W, 0.003, H), MAT["case_offwhite"], "structure_containment", MO)
fl.add_box("pump1_sidewall_y_neg", (W/2, -D/2 + 0.0015, H/2),
           (W, 0.003, H), MAT["case_offwhite"], "structure_containment", MO)
fl.add_box("pump1_endcap_x_min", (0.0015, 0, H/2),
           (0.003, D, H), MAT["case_offwhite"], "structure_containment", MO)
fl.add_box("pump1_endcap_x_max", (W - 0.0015, 0, H/2),
           (0.003, D, H), MAT["case_offwhite"], "structure_containment", MO)

# Front-face bezel strips around the 60×40 mm LCD aperture.
fl.add_box("pump1_front_bezel_top", (W/2, 0.0235, H - 0.0005),
           (0.074, 0.003, 0.001), MAT["case_offwhite"], "structure_containment", MO)
fl.add_box("pump1_front_bezel_bottom", (W/2, -0.0235, H - 0.0005),
           (0.074, 0.003, 0.001), MAT["case_offwhite"], "structure_containment", MO)
fl.add_box("pump1_front_bezel_left", (0.010, 0, H - 0.0005),
           (0.005, 0.044, 0.001), MAT["case_offwhite"], "structure_containment", MO)
fl.add_box("pump1_front_bezel_right", (0.080, 0, H - 0.0005),
           (0.005, 0.044, 0.001), MAT["case_offwhite"], "structure_containment", MO)

# Internal plastic ribs and cradles.
fl.add_box("pump1_centre_rib", (0.045, 0, 0.0050),
           (0.002, D - 0.008, 0.008), MAT["case_shadow"], "structure_containment", MO)
fl.add_box("pump1_battery_cradle_front", (0.036, -0.023, 0.0045),
           (0.054, 0.0015, 0.006), MAT["case_shadow"], "structure_containment", MO)
fl.add_box("pump1_battery_cradle_back", (0.036, -0.001, 0.0045),
           (0.054, 0.0015, 0.006), MAT["case_shadow"], "structure_containment", MO)
fl.add_box("pump1_motor_bracket", (0.074, -0.011, 0.0040),
           (0.014, 0.014, 0.004), MAT["case_shadow"], "structure_containment", MO)
fl.add_box("pump1_reservoir_cradle_a", (0.045, 0.016, 0.0120),
           (0.056, 0.0012, 0.004), MAT["case_shadow"], "structure_containment", MO)
fl.add_box("pump1_reservoir_cradle_b", (0.045, 0.026, 0.0120),
           (0.056, 0.0012, 0.004), MAT["case_shadow"], "structure_containment", MO)

for i, (x, y) in enumerate([(0.008, 0.021), (0.082, 0.021), (0.008, -0.021), (0.082, -0.021)]):
    fl.add_cyl(f"pump1_screw_boss_{i}", (x, y, 0.0040),
               0.0020, 0.006, MAT["case_shadow"], "structure_containment", MO)

fl.add_box("pump1_skid_foot_left", (0.045, 0.0215, 0.00035),
           (0.070, 0.003, 0.0007), MAT["case_shadow"], "structure_containment", MO)
fl.add_box("pump1_skid_foot_right", (0.045, -0.0215, 0.00035),
           (0.070, 0.003, 0.0007), MAT["case_shadow"], "structure_containment", MO)


# ═══════ energy_storage_source ════════════════════════════════════════════
# Rechargeable lithium pack at bottom of the case.
fl.add_box("pump2_liion_cell", (0.036, -0.012, 0.0040),
           (0.050, 0.020, 0.004), MAT["battery"], "energy_storage_source", MO)
fl.add_box("pump2_cell_label", (0.036, -0.012, 0.00615),
           (0.034, 0.012, 0.0003), MAT["label_white"], "energy_storage_source", MO)
fl.add_box("pump2_positive_tab", (0.062, -0.007, 0.0042),
           (0.004, 0.004, 0.001), MAT["metal_contact"], "energy_storage_source", MO)
fl.add_box("pump2_negative_tab", (0.010, -0.017, 0.0042),
           (0.004, 0.004, 0.001), MAT["metal_contact"], "energy_storage_source", MO)
fl.add_box("pump2_fuel_gauge_ic", (0.058, -0.014, 0.0087),
           (0.004, 0.004, 0.001), MAT["control"], "energy_storage_source", MO)
fl.add_box("pump2_pack_thermistor", (0.026, -0.004, 0.0064),
           (0.002, 0.002, 0.001), MAT["thermal"], "energy_storage_source", MO)
fl.add_box("pump2_charge_management", (0.070, -0.019, 0.0087),
           (0.006, 0.004, 0.001), MAT["control"], "energy_storage_source", MO)


# ═══════ mass_fluid_transport_process ═════════════════════════════════════
# Removable insulin reservoir along the top edge, 8 mm diameter × 50 mm long.
fl.add_cyl("pump11_reservoir_clear_body", (0.045, 0.021, 0.0150),
           0.0040, 0.050, MAT["reservoir_clear"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_insulin_fill_volume", (0.045, 0.021, 0.0150),
           0.0031, 0.047, MAT["insulin_cyan"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_reservoir_left_cap", (0.020, 0.021, 0.0150),
           0.0041, 0.0012, MAT["stainless"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_reservoir_right_cap", (0.070, 0.021, 0.0150),
           0.0041, 0.0012, MAT["stainless"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_plunger_piston_seal", (0.026, 0.021, 0.0150),
           0.0034, 0.0010, MAT["silicone_red"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))

for i, x in enumerate([0.030, 0.038, 0.046, 0.054, 0.062]):
    fl.add_box(f"pump11_reservoir_graduation_{i}", (x, 0.0249, 0.0150),
               (0.0005, 0.0004, 0.006), MAT["ctrl_black"], "mass_fluid_transport_process", MO)

# Side tubing port and Luer connector, flush inside the right side envelope.
fl.add_cyl("pump11_tubing_port_barrel", (0.0860, 0.018, 0.0140),
           0.0015, 0.005, MAT["insulin_cyan"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_luer_connector_tip", (0.0880, 0.018, 0.0140),
           0.0011, 0.003, MAT["stainless"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_torus("pump11_luer_lock_ring", (0.0835, 0.018, 0.0140),
             major_radius=0.0021, minor_radius=0.00035,
             material=MAT["silicone_red"], module="mass_fluid_transport_process", module_objects=MO,
             rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_soft_tubing_stub", (0.077, 0.018, 0.0140),
           0.0010, 0.010, MAT["reservoir_clear"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("pump11_fill_septum", (0.018, 0.021, 0.0150),
           (0.002, 0.006, 0.006), MAT["silicone_red"], "mass_fluid_transport_process", MO)


# ═══════ actuation_kinematics ═════════════════════════════════════════════
# Stepper motor and lead-screw/plunger train.
fl.add_cyl("pump4_stepper_motor_can", (0.074, -0.011, 0.0100),
           0.0050, 0.015, MAT["motor"], "actuation_kinematics", MO)
fl.add_cyl("pump4_motor_top_cap", (0.074, -0.011, 0.0178),
           0.0051, 0.0007, MAT["stainless"], "actuation_kinematics", MO)
fl.add_cyl("pump4_motor_bottom_cap", (0.074, -0.011, 0.0022),
           0.0051, 0.0007, MAT["stainless"], "actuation_kinematics", MO)
fl.add_box("pump4_micro_gearbox", (0.066, -0.004, 0.0110),
           (0.011, 0.010, 0.006), MAT["heatsink"], "actuation_kinematics", MO)
fl.add_cyl("pump4_plunger_shaft", (0.057, 0.018, 0.0120),
           0.0020, 0.030, MAT["stainless"], "actuation_kinematics", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump4_drive_coupler", (0.071, 0.018, 0.0120),
           0.0026, 0.003, MAT["dose_orange"], "actuation_kinematics", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("pump4_plunger_head", (0.042, 0.018, 0.0120),
           (0.003, 0.007, 0.007), MAT["dose_orange"], "actuation_kinematics", MO)
fl.add_cyl("pump4_front_bearing", (0.031, 0.018, 0.0120),
           0.0027, 0.0015, MAT["stainless"], "actuation_kinematics", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("pump4_linear_guide_upper", (0.055, 0.014, 0.0100),
           (0.030, 0.001, 0.001), MAT["heatsink"], "actuation_kinematics", MO)
fl.add_box("pump4_linear_guide_lower", (0.055, 0.022, 0.0100),
           (0.030, 0.001, 0.001), MAT["heatsink"], "actuation_kinematics", MO)

for i, x in enumerate([0.046, 0.050, 0.054, 0.058, 0.062, 0.066]):
    fl.add_cyl(f"pump4_leadscrew_thread_{i}", (x, 0.018, 0.0120),
               0.00225, 0.0006, MAT["dose_orange"], "actuation_kinematics", MO,
               rotation=(0, math.radians(90), 0))


# ═══════ control_compute_communication ════════════════════════════════════
# Main PCB and communications components.
fl.add_box("pump5_main_pcb", (0.045, 0.000, 0.0088),
           (0.070, 0.040, 0.001), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("pump5_mcu", (0.041, 0.002, 0.0100),
           (0.008, 0.008, 0.0014), MAT["control"], "control_compute_communication", MO)
fl.add_box("pump5_ble_radio_chip", (0.055, 0.002, 0.0100),
           (0.005, 0.005, 0.001), MAT["control"], "control_compute_communication", MO)
fl.add_box("pump5_radio_shield", (0.061, 0.012, 0.0102),
           (0.014, 0.010, 0.0012), MAT["heatsink"], "control_compute_communication", MO)
fl.add_box("pump5_flash_memory", (0.029, 0.007, 0.0100),
           (0.005, 0.004, 0.001), MAT["control"], "control_compute_communication", MO)
fl.add_box("pump5_crystal", (0.030, -0.005, 0.0100),
           (0.003, 0.002, 0.001), MAT["stainless"], "control_compute_communication", MO)
fl.add_box("pump5_ble_antenna_trace_a", (0.074, 0.015, 0.0100),
           (0.012, 0.0008, 0.0003), MAT["antenna"], "control_compute_communication", MO)
fl.add_box("pump5_ble_antenna_trace_b", (0.080, 0.010, 0.0100),
           (0.0008, 0.010, 0.0003), MAT["antenna"], "control_compute_communication", MO)
fl.add_box("pump5_ble_antenna_trace_c", (0.074, 0.005, 0.0100),
           (0.012, 0.0008, 0.0003), MAT["antenna"], "control_compute_communication", MO)

for i, x in enumerate([0.020, 0.026, 0.032, 0.038, 0.044]):
    fl.add_box(f"pump5_passive_row_a_{i}", (x, -0.014, 0.0100),
               (0.0020, 0.0012, 0.0007), MAT["copper"], "control_compute_communication", MO)
for i, x in enumerate([0.050, 0.056, 0.062, 0.068, 0.074]):
    fl.add_box(f"pump5_passive_row_b_{i}", (x, -0.007, 0.0100),
               (0.0016, 0.0012, 0.0007), MAT["copper"], "control_compute_communication", MO)

for i, y in enumerate([-0.017, -0.011, -0.005, 0.001, 0.007, 0.013]):
    fl.add_cyl(f"pump5_via_{i}", (0.018, y, 0.0096),
               0.00055, 0.00025, MAT["metal_contact"], "control_compute_communication", MO)


# ═══════ sensing_instrumentation ══════════════════════════════════════════
fl.add_box("pump6_occlusion_pressure_sensor", (0.074, 0.018, 0.0110),
           (0.003, 0.003, 0.002), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump6_flow_confirm_sensor", (0.078, 0.018, 0.0155),
           (0.003, 0.002, 0.002), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump6_reservoir_temp_sensor", (0.034, 0.016, 0.0115),
           (0.002, 0.002, 0.001), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump6_air_inline_optical_tx", (0.081, 0.016, 0.0130),
           (0.0015, 0.0015, 0.0015), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump6_air_inline_optical_rx", (0.081, 0.020, 0.0130),
           (0.0015, 0.0015, 0.0015), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump6_accelerometer", (0.022, 0.012, 0.0100),
           (0.003, 0.003, 0.001), MAT["sensor"], "sensing_instrumentation", MO)
for i, x in enumerate([0.051, 0.061, 0.071]):
    fl.add_box(f"pump6_plunger_hall_sensor_{i}", (x, 0.014, 0.0100),
               (0.002, 0.0015, 0.001), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ safety_protection ════════════════════════════════════════════════
# Vibration alert motor is modeled as a safety/alarm actuator per class spec.
fl.add_cyl("pump7_vibration_alert_motor", (0.019, -0.021, 0.0110),
           0.0030, 0.008, MAT["safety"], "safety_protection", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump7_vibe_endcap_a", (0.015, -0.021, 0.0110),
           0.0031, 0.0006, MAT["stainless"], "safety_protection", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump7_vibe_endcap_b", (0.023, -0.021, 0.0110),
           0.0031, 0.0006, MAT["stainless"], "safety_protection", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("pump7_watchdog_supervisor", (0.040, -0.018, 0.0100),
           (0.003, 0.003, 0.001), MAT["safety"], "safety_protection", MO)
fl.add_box("pump7_resettable_fuse", (0.052, -0.018, 0.0100),
           (0.004, 0.002, 0.001), MAT["safety"], "safety_protection", MO)
fl.add_cyl("pump7_overpressure_relief_valve", (0.083, 0.021, 0.0115),
           0.0020, 0.002, MAT["safety"], "safety_protection", MO)
fl.add_box("pump7_tamper_switch", (0.012, 0.018, 0.0100),
           (0.003, 0.003, 0.001), MAT["safety"], "safety_protection", MO)
for i, y in enumerate([-0.015, -0.011, -0.007, -0.003]):
    fl.add_box(f"pump7_esd_suppressor_{i}", (0.079, y, 0.0100),
               (0.0012, 0.0012, 0.0008), MAT["safety"], "safety_protection", MO)


# ═══════ power_distribution ═══════════════════════════════════════════════
fl.add_box("pump8_usb_charge_port", (0.0875, -0.015, 0.0060),
           (0.003, 0.008, 0.002), MAT["ctrl_black"], "power_distribution", MO)
fl.add_box("pump8_usb_shield", (0.0858, -0.015, 0.0060),
           (0.0008, 0.009, 0.003), MAT["stainless"], "power_distribution", MO)
fl.add_box("pump8_charge_contact_pos", (0.080, -0.024, 0.0070),
           (0.004, 0.001, 0.002), MAT["metal_contact"], "power_distribution", MO)
fl.add_box("pump8_charge_contact_neg", (0.070, -0.024, 0.0070),
           (0.004, 0.001, 0.002), MAT["metal_contact"], "power_distribution", MO)
for i, y in enumerate([-0.016, -0.010, -0.004, 0.002, 0.008, 0.014]):
    fl.add_box(f"pump8_power_rail_{i}", (0.045, y, 0.0097),
               (0.055, 0.00045, 0.00025), MAT["copper"], "power_distribution", MO)
for i, y in enumerate([-0.016, -0.011, -0.006, -0.001]):
    fl.add_cyl(f"pump8_flex_wire_{i}", (0.064, y, 0.0075),
               0.00045, 0.025, MAT["copper"], "power_distribution", MO,
               rotation=(0, math.radians(90), 0))
fl.add_box("pump8_board_to_motor_connector", (0.066, -0.008, 0.0102),
           (0.006, 0.003, 0.0015), MAT["powerdist"], "power_distribution", MO)


# ═══════ environmental_interface ══════════════════════════════════════════
fl.add_box("pump9_skin_side_adhesive_patch", (0.045, 0, 0.00025),
           (0.070, 0.043, 0.0005), MAT["adhesive"], "environmental_interface", MO)
fl.add_box("pump9_case_gasket_top", (W/2, 0.0250, 0.0185),
           (0.082, 0.001, 0.001), MAT["silicone_red"], "environmental_interface", MO)
fl.add_box("pump9_case_gasket_bottom", (W/2, -0.0250, 0.0185),
           (0.082, 0.001, 0.001), MAT["silicone_red"], "environmental_interface", MO)
fl.add_box("pump9_case_gasket_left", (0.006, 0, 0.0185),
           (0.001, 0.048, 0.001), MAT["silicone_red"], "environmental_interface", MO)
fl.add_box("pump9_case_gasket_right", (0.084, 0, 0.0185),
           (0.001, 0.048, 0.001), MAT["silicone_red"], "environmental_interface", MO)
fl.add_box("pump9_screen_seal", (0.045, 0, 0.01915),
           (0.064, 0.044, 0.0004), MAT["rubber_black"], "environmental_interface", MO)
fl.add_torus("pump9_reservoir_or_small", (0.022, 0.021, 0.0150),
             major_radius=0.0044, minor_radius=0.00035,
             material=MAT["silicone_red"], module="environmental_interface", module_objects=MO,
             rotation=(0, math.radians(90), 0))
fl.add_torus("pump9_reservoir_or_large", (0.068, 0.021, 0.0150),
             major_radius=0.0044, minor_radius=0.00035,
             material=MAT["silicone_red"], module="environmental_interface", module_objects=MO,
             rotation=(0, math.radians(90), 0))
fl.add_cyl("pump9_pressure_vent_membrane", (0.012, -0.010, 0.0192),
           0.0025, 0.0005, MAT["thermal"], "environmental_interface", MO)


# ═══════ hmi_ergonomics ═══════════════════════════════════════════════════
# Front LCD touchscreen and four physical buttons.
fl.add_box("pump3_lcd_touchscreen", (0.045, 0.000, 0.01975),
           (0.060, 0.040, 0.0005), MAT["display_dark"], "hmi_ergonomics", MO)
for i, y in enumerate([-0.012, -0.004, 0.004, 0.012]):
    fl.add_box(f"pump3_lcd_ui_bar_{i}", (0.045, y, 0.01995),
               (0.045 - i * 0.004, 0.0013, 0.00012), MAT["display_glow"], "hmi_ergonomics", MO)

for i, (x, y) in enumerate([(0.066, -0.021), (0.073, -0.021), (0.080, -0.021), (0.087, -0.021)]):
    fl.add_cyl(f"pump3_physical_button_{i}", (x, y, 0.01945),
               0.0015, 0.0010, MAT["button_grey"], "hmi_ergonomics", MO)

fl.add_sphere("pump3_status_led", (0.011, -0.021, 0.0190),
              0.0010, MAT["led_green"], "hmi_ergonomics", MO)
fl.add_cyl("pump3_piezo_sounder", (0.015, 0.014, 0.0105),
           0.004, 0.0015, MAT["ctrl_black"], "hmi_ergonomics", MO)


# ═══════ maintenance_serviceability ═══════════════════════════════════════
fl.add_box("pump10_reservoir_release_latch", (0.074, 0.024, 0.0188),
           (0.011, 0.003, 0.0015), MAT["service_magenta"], "maintenance_serviceability", MO)
fl.add_box("pump10_service_door_outline", (0.032, -0.022, 0.0189),
           (0.026, 0.002, 0.0006), MAT["service_magenta"], "maintenance_serviceability", MO)
fl.add_box("pump10_pull_tab", (0.018, 0.024, 0.0175),
           (0.008, 0.003, 0.002), MAT["service_magenta"], "maintenance_serviceability", MO)
fl.add_box("pump10_cartridge_alignment_label", (0.050, 0.024, 0.0189),
           (0.018, 0.0015, 0.0004), MAT["label_white"], "maintenance_serviceability", MO)

for i, (x, y) in enumerate([(0.008, 0.021), (0.082, 0.021), (0.008, -0.021), (0.082, -0.021)]):
    fl.add_cyl(f"pump10_service_screw_head_{i}", (x, y, 0.0193),
               0.0012, 0.0005, MAT["service_magenta"], "maintenance_serviceability", MO)

for i, y in enumerate([-0.008, -0.004, 0.000, 0.004]):
    fl.add_cyl(f"pump10_debug_test_pad_{i}", (0.027, y, 0.0102),
               0.0008, 0.0003, MAT["service_magenta"], "maintenance_serviceability", MO)


fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")