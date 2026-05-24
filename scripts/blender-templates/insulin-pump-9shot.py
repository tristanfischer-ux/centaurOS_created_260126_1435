"""insulin-pump-9shot.py — wearable insulin pump, Medtronic 780G / Tandem t:slim X2 class.

Pocket-sized 90 × 55 × 20 mm pump with ABS/PC enclosure, touchscreen,
buttons, USB port, top insulin reservoir, tubing quick-connect, infusion set,
stepper-driven plunger, Li-ion battery, BLE/CGM electronics, low-flow pump,
occlusion sensing, vibration alert motor, and safety/service features.

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

# Scale: 1 Blender unit = 1 metre. Device envelope 90×55×20 mm.
W = 0.09
D = 0.055
H = 0.02

CX = W / 2
CY = 0.0
CZ = H / 2

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
MAT["adhesive"] = fl.make_mat("m_adhesive", (0.95, 0.92, 0.85), metallic=0.0, roughness=0.7, alpha=0.7)
MAT["case_polymer"]     = fl.make_mat("m_case_polymer",     (0.16, 0.17, 0.20), metallic=0.0, roughness=0.48)
MAT["front_glass"]      = fl.make_mat("m_front_glass",      (0.00, 0.18, 0.55), metallic=0.0, roughness=0.18)
MAT["button_rubber"]    = fl.make_mat("m_button_rubber",    (0.00, 0.45, 1.00), metallic=0.0, roughness=0.55)
MAT["insulin"]          = fl.make_mat("m_insulin",          (0.00, 0.95, 1.00), metallic=0.0, roughness=0.22, alpha=0.72)
MAT["reservoir_clear"]  = fl.make_mat("m_reservoir_clear",  (0.72, 0.96, 1.00), metallic=0.0, roughness=0.08, alpha=0.38)
MAT["silicone"]         = fl.make_mat("m_silicone",         (1.00, 0.35, 0.85), metallic=0.0, roughness=0.62)
MAT["orange_alarm"]     = fl.make_mat("m_orange_alarm",     (1.00, 0.22, 0.00), metallic=0.0, roughness=0.42)
MAT["tube"]             = fl.make_mat("m_tube",             (0.95, 0.98, 1.00), metallic=0.0, roughness=0.25, alpha=0.55)
MAT["needle_steel"]     = fl.make_mat("m_needle_steel",     (0.88, 0.90, 0.94), metallic=0.8, roughness=0.22)
MAT["label_white"]      = fl.make_mat("m_label_white",      (0.98, 0.98, 0.96), metallic=0.0, roughness=0.65)
MAT["gold_contact"]     = fl.make_mat("m_gold_contact",     (1.00, 0.62, 0.05), metallic=0.45, roughness=0.28)


# ═══════ structure_containment ════════════════════════════════════════════
fl.add_box("pump1_main_abs_pc_case", (CX, CY, CZ),
           (W, D, H), MAT["case_polymer"], "structure_containment", MO)
fl.add_box("pump1_front_bezel_frame", (CX, CY, H + 0.00045),
           (W - 0.006, D - 0.006, 0.0010), MAT["enclosure"], "structure_containment", MO)
fl.add_box("pump1_rear_cover_plate", (CX, CY, -0.00045),
           (W - 0.004, D - 0.004, 0.0010), MAT["case_polymer"], "structure_containment", MO)
fl.add_box("pump1_left_side_structural_rail", (CX, -D/2 + 0.002, CZ),
           (W - 0.010, 0.0025, H - 0.003), MAT["enclosure"], "structure_containment", MO)
fl.add_box("pump1_right_side_structural_rail", (CX, D/2 - 0.002, CZ),
           (W - 0.010, 0.0025, H - 0.003), MAT["enclosure"], "structure_containment", MO)
fl.add_box("pump1_reservoir_cradle_frame", (0.032, D/2 - 0.006, H + 0.002),
           (0.056, 0.010, 0.004), MAT["enclosure"], "structure_containment", MO)
fl.add_box("pump1_tubing_port_housing", (W - 0.003, D/2 - 0.010, H * 0.60),
           (0.006, 0.013, 0.010), MAT["case_polymer"], "structure_containment", MO)


# ═══════ energy_storage_source ════════════════════════════════════════════
fl.add_box("pump2_lithium_polymer_cell", (0.024, -0.010, H * 0.43),
           (0.030, 0.026, 0.0065), MAT["battery"], "energy_storage_source", MO)
fl.add_box("pump2_cell_pouch_laminate", (0.024, -0.010, H * 0.43),
           (0.032, 0.028, 0.0006), MAT["aluminium"], "energy_storage_source", MO)
fl.add_box("pump2_battery_fuel_gauge_ic", (0.043, -0.022, H * 0.62),
           (0.004, 0.004, 0.0012), MAT["control"], "energy_storage_source", MO)
fl.add_box("pump2_charge_manager_ic", (0.051, -0.022, H * 0.62),
           (0.005, 0.004, 0.0012), MAT["control"], "energy_storage_source", MO)
fl.add_box("pump2_battery_protection_pack", (0.010, -0.022, H * 0.54),
           (0.010, 0.005, 0.002), MAT["safety"], "energy_storage_source", MO)
fl.add_cyl("pump2_cell_thermal_sensor", (0.038, -0.010, H * 0.78),
           0.0015, 0.001, MAT["thermal"], "energy_storage_source", MO)


# ═══════ actuation_kinematics ═════════════════════════════════════════════
fl.add_cyl("pump3_stepper_motor_can", (0.020, 0.010, H * 0.48),
           0.006, 0.014, MAT["motor"], "actuation_kinematics", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("pump3_motor_mount_bracket", (0.020, 0.010, H * 0.20),
           (0.018, 0.014, 0.002), MAT["aluminium"], "actuation_kinematics", MO)
fl.add_box("pump3_reduction_gearbox", (0.033, 0.010, H * 0.48),
           (0.010, 0.013, 0.007), MAT["motor"], "actuation_kinematics", MO)
fl.add_cyl("pump3_precision_lead_screw", (0.049, 0.010, H * 0.48),
           0.0012, 0.028, MAT["stainless"], "actuation_kinematics", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump3_plunger_drive_disk", (0.064, 0.010, H * 0.48),
           0.005, 0.002, MAT["aluminium"], "actuation_kinematics", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("pump3_linear_guide_rail_upper", (0.050, 0.016, H * 0.74),
           (0.032, 0.001, 0.001), MAT["stainless"], "actuation_kinematics", MO)
fl.add_box("pump3_linear_guide_rail_lower", (0.050, 0.004, H * 0.22),
           (0.032, 0.001, 0.001), MAT["stainless"], "actuation_kinematics", MO)
fl.add_box("pump3_anti_backlash_nut", (0.053, 0.010, H * 0.48),
           (0.004, 0.006, 0.004), MAT["copper"], "actuation_kinematics", MO)


# ═══════ environmental_interface ══════════════════════════════════════════
fl.add_cyl("pump7_tubing_quick_connect_socket", (W + 0.002, D/2 - 0.010, H * 0.60),
           0.0045, 0.006, MAT["silicone"], "environmental_interface", MO,
           rotation=(0, math.radians(90), 0))
fl.add_torus("pump7_luer_lock_ring", (W + 0.005, D/2 - 0.010, H * 0.60),
             major_radius=0.005, minor_radius=0.0007,
             material=MAT["orange_alarm"], module="environmental_interface", module_objects=MO,
             rotation=(0, math.radians(90), 0))
fl.add_cyl("pump7_external_tube_segment_1", (W + 0.020, D/2 - 0.010, H * 0.60),
           0.0010, 0.030, MAT["tube"], "environmental_interface", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump7_external_tube_segment_2", (W + 0.035, D/2 - 0.022, H * 0.38),
           0.0010, 0.026, MAT["tube"], "environmental_interface", MO,
           rotation=(math.radians(55), 0, 0))
fl.add_box("pump7_infusion_set_base", (W + 0.040, -0.022, 0.0015),
           (0.022, 0.018, 0.002), MAT["silicone"], "environmental_interface", MO)
fl.add_cyl("pump7_skin_adhesive_disc", (W + 0.040, -0.022, 0.0002),
           0.013, 0.0007, MAT["adhesive"], "environmental_interface", MO)
fl.add_cyl("pump7_subcutaneous_cannula", (W + 0.040, -0.022, -0.004),
           0.00055, 0.008, MAT["needle_steel"], "environmental_interface", MO)
fl.add_box("pump7_case_perimeter_gasket", (CX, CY, H + 0.0009),
           (W - 0.003, D - 0.003, 0.0007), MAT["silicone"], "environmental_interface", MO)


# ═══════ sensing_instrumentation ══════════════════════════════════════════
fl.add_box("pump4_occlusion_pressure_sensor", (0.066, 0.002, H * 0.68),
           (0.006, 0.005, 0.0015), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump4_flow_sensor_die", (0.071, 0.016, H * 0.58),
           (0.004, 0.004, 0.0012), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump4_reservoir_level_optical_tx", (0.042, D/2 - 0.003, H + 0.004),
           (0.002, 0.0015, 0.0015), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump4_reservoir_level_optical_rx", (0.052, D/2 - 0.003, H + 0.004),
           (0.002, 0.0015, 0.0015), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump4_bubble_detector_led", (0.060, D/2 - 0.004, H + 0.002),
           (0.002, 0.0015, 0.0015), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("pump4_temperature_probe", (0.014, 0.022, H * 0.55),
           (0.003, 0.002, 0.001), MAT["thermal"], "sensing_instrumentation", MO)
fl.add_box("pump4_cgm_receiver_frontend", (0.065, -0.019, H * 0.66),
           (0.006, 0.005, 0.0014), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ control_compute_communication ════════════════════════════════════
fl.add_box("pump5_main_mcu", (0.053, -0.006, H * 0.70),
           (0.008, 0.008, 0.0016), MAT["control"], "control_compute_communication", MO)
fl.add_box("pump5_insulin_dosing_asic", (0.065, -0.006, H * 0.70),
           (0.006, 0.006, 0.0014), MAT["control"], "control_compute_communication", MO)
fl.add_box("pump5_ble_radio_module", (0.075, -0.018, H * 0.70),
           (0.008, 0.006, 0.0014), MAT["control"], "control_compute_communication", MO)
fl.add_box("pump5_flash_memory", (0.043, 0.002, H * 0.70),
           (0.005, 0.004, 0.0012), MAT["control"], "control_compute_communication", MO)
fl.add_box("pump5_motor_driver_ic", (0.037, 0.020, H * 0.68),
           (0.006, 0.005, 0.0014), MAT["control"], "control_compute_communication", MO)
fl.add_box("pump5_cgm_decode_processor", (0.073, -0.006, H * 0.70),
           (0.005, 0.005, 0.0012), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("pump5_ble_chip_antenna", (0.083, -0.022, H * 0.72),
           0.0008, 0.012, MAT["antenna"], "control_compute_communication", MO,
           rotation=(0, math.radians(90), 0))


# ═══════ safety_protection ════════════════════════════════════════════════
fl.add_box("pump6_watchdog_supervisor", (0.055, -0.018, H * 0.82),
           (0.003, 0.003, 0.001), MAT["safety"], "safety_protection", MO)
fl.add_box("pump6_redundant_cutoff_fet", (0.061, -0.018, H * 0.82),
           (0.004, 0.003, 0.001), MAT["safety"], "safety_protection", MO)
fl.add_box("pump6_thermal_fuse", (0.018, -0.026, H * 0.50),
           (0.006, 0.002, 0.001), MAT["safety"], "safety_protection", MO)
fl.add_box("pump6_bolus_lockout_latch", (0.079, 0.021, H * 0.60),
           (0.005, 0.004, 0.003), MAT["orange_alarm"], "safety_protection", MO)
fl.add_box("pump6_reservoir_door_interlock", (0.022, D/2 - 0.004, H + 0.005),
           (0.006, 0.002, 0.002), MAT["safety"], "safety_protection", MO)
for i in range(4):
    fl.add_box(f"pump6_esd_tvs_array_{i}", (0.078 + i * 0.0025, -0.026, H * 0.75),
               (0.0012, 0.0015, 0.0008), MAT["safety"], "safety_protection", MO)
fl.add_box("pump6_emc_shield_can", (0.062, -0.006, H * 0.88),
           (0.026, 0.018, 0.001), MAT["stainless"], "safety_protection", MO)


# ═══════ power_distribution ══════════════════════════════════════════════
fl.add_box("pump8_main_rigid_pcb", (0.058, -0.004, H * 0.55),
           (0.058, 0.042, 0.0009), MAT["pcb"], "power_distribution", MO)
fl.add_box("pump8_button_display_flex", (0.045, 0.000, H * 0.90),
           (0.052, 0.022, 0.0005), MAT["pcb"], "power_distribution", MO)
fl.add_box("pump8_battery_connector", (0.042, -0.018, H * 0.58),
           (0.005, 0.004, 0.002), MAT["powerdist"], "power_distribution", MO)
fl.add_box("pump8_motor_connector", (0.035, 0.014, H * 0.58),
           (0.005, 0.004, 0.002), MAT["powerdist"], "power_distribution", MO)
for i in range(4):
    fl.add_box(f"pump8_copper_power_rail_{i}", (0.040 + i * 0.010, -0.024, H * 0.61),
               (0.008, 0.0006, 0.00035), MAT["copper"], "power_distribution", MO)
for i in range(3):
    fl.add_cyl(f"pump8_gold_pogo_contact_{i}", (0.081, 0.010 + i * 0.004, H * 0.70),
               0.0009, 0.0005, MAT["gold_contact"], "power_distribution", MO)


# ═══════ hmi_ergonomics ══════════════════════════════════════════════════
fl.add_box("pump9_colour_touchscreen", (0.045, -0.003, H + 0.0011),
           (0.050, 0.032, 0.0012), MAT["front_glass"], "hmi_ergonomics", MO)
fl.add_box("pump9_oled_active_area", (0.045, -0.003, H + 0.0018),
           (0.044, 0.026, 0.0004), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_cyl("pump9_up_button", (0.078, 0.016, H + 0.0016),
           0.0032, 0.0014, MAT["button_rubber"], "hmi_ergonomics", MO)
fl.add_cyl("pump9_select_button", (0.078, 0.006, H + 0.0016),
           0.0032, 0.0014, MAT["button_rubber"], "hmi_ergonomics", MO)
fl.add_cyl("pump9_down_button", (0.078, -0.004, H + 0.0016),
           0.0032, 0.0014, MAT["button_rubber"], "hmi_ergonomics", MO)
fl.add_cyl("pump9_vibration_alert_motor", (0.017, -0.020, H * 0.73),
           0.0035, 0.009, MAT["motor"], "hmi_ergonomics", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump9_piezo_sounder", (0.012, 0.018, H * 0.72),
           0.005, 0.0012, MAT["ctrl_black"], "hmi_ergonomics", MO)
for i in range(5):
    fl.add_box(f"pump9_side_grip_rib_{i}", (0.007 + i * 0.006, -D/2 - 0.0005, H * 0.58),
               (0.003, 0.001, 0.009), MAT["button_rubber"], "hmi_ergonomics", MO)
fl.add_box("pump9_status_led_window", (0.080, -0.017, H + 0.0015),
           (0.006, 0.002, 0.0005), MAT["orange_alarm"], "hmi_ergonomics", MO)


# ═══════ maintenance_serviceability ══════════════════════════════════════
fl.add_box("pump10_usb_charging_port", (W - 0.002, -0.015, H * 0.42),
           (0.004, 0.010, 0.004), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("pump10_usb_metal_shell", (W - 0.003, -0.015, H * 0.42),
           (0.002, 0.008, 0.003), MAT["stainless"], "maintenance_serviceability", MO)
fl.add_box("pump10_reservoir_release_tab", (0.012, D/2 + 0.001, H + 0.002),
           (0.012, 0.003, 0.003), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("pump10_fill_port_septum", (0.008, D/2 - 0.006, H + 0.003),
           (0.006, 0.004, 0.002), MAT["silicone"], "maintenance_serviceability", MO)
fl.add_box("pump10_serial_label", (0.045, 0.000, -0.0011),
           (0.040, 0.018, 0.0003), MAT["label_white"], "maintenance_serviceability", MO)
for i in range(4):
    fl.add_cyl(f"pump10_case_screw_boss_{i}",
               (0.012 + (i % 2) * 0.066, -0.020 + (i // 2) * 0.040, H * 0.18),
               0.0022, 0.003, MAT["maint"], "maintenance_serviceability", MO)
for i in range(5):
    fl.add_cyl(f"pump10_debug_test_pad_{i}", (0.036 + i * 0.004, -0.021, H * 0.74),
               0.00075, 0.0004, MAT["gold_contact"], "maintenance_serviceability", MO)


# ═══════ mass_fluid_transport_process ════════════════════════════════════
fl.add_cyl("pump11_clear_insulin_reservoir_barrel", (0.040, D/2 + 0.004, H + 0.004),
           0.0055, 0.052, MAT["reservoir_clear"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_insulin_fill_volume", (0.040, D/2 + 0.004, H + 0.004),
           0.0043, 0.045, MAT["insulin"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_reservoir_plunger", (0.014, D/2 + 0.004, H + 0.004),
           0.0047, 0.002, MAT["safety"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_reservoir_outlet_nozzle", (0.069, D/2 + 0.004, H + 0.004),
           0.0020, 0.009, MAT["insulin"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("pump11_micro_pump_chamber", (0.069, 0.010, H * 0.50),
           (0.008, 0.006, 0.004), MAT["insulin"], "mass_fluid_transport_process", MO)
fl.add_box("pump11_inlet_check_valve", (0.063, 0.010, H * 0.50),
           (0.003, 0.004, 0.003), MAT["fluid_water"], "mass_fluid_transport_process", MO)
fl.add_box("pump11_outlet_check_valve", (0.075, 0.010, H * 0.50),
           (0.003, 0.004, 0.003), MAT["fluid_water"], "mass_fluid_transport_process", MO)
fl.add_cyl("pump11_internal_fluid_line_a", (0.068, 0.022, H * 0.68),
           0.0008, 0.020, MAT["insulin"], "mass_fluid_transport_process", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("pump11_internal_fluid_line_b", (0.078, 0.016, H * 0.60),
           0.0008, 0.016, MAT["insulin"], "mass_fluid_transport_process", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("pump11_cannula_fluid_core", (W + 0.040, -0.022, -0.0035),
           0.00025, 0.007, MAT["insulin"], "mass_fluid_transport_process", MO)


fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")