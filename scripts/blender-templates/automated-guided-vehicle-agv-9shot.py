"""automated-guided-vehicle-agv-9shot.py — warehouse AGV / autonomous mobile robot.

Envelope 1200 × 800 × 450 mm. Low-profile rectangular platform with steel chassis,
bumper edges, differential drive wheels, caster wheels, top LIDAR, perimeter cameras /
IR sensors, lithium battery bay, control PCB stack, rear charging contacts, and load
deck with compact lift / conveyor features.

Layout (x = length, y = width, z = vertical):
  Front  (x 0.00–0.20): bumper, safety scanners, camera / IR sensors
  Mid    (x 0.20–0.95): battery, compute, drive motors, lift deck
  Rear   (x 0.95–1.20): charging contacts, service ports, rear sensors

Run: /Applications/Blender.app/Contents/MacOS/Blender -b -P automated-guided-vehicle-agv-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-automated-guided-vehicle-agv-9shot")))

W = 1.2
D = 0.8
H = 0.45

MO = fl.make_module_dict([
    "structure_containment",
    "energy_storage_source",
    "energy_conversion_transduction",
    "actuation_kinematics",
    "sensing_instrumentation",
    "control_compute_communication",
    "safety_protection",
    "power_distribution",
    "hmi_ergonomics",
    "maintenance_serviceability",
    "environmental_interface",
])

MAT = fl.make_default_palette()
MAT["steel_dark"] = fl.make_mat("m_agv_steel_dark", (0.18, 0.20, 0.23), metallic=0.55, roughness=0.42)
MAT["steel_light"] = fl.make_mat("m_agv_steel_light", (0.68, 0.70, 0.72), metallic=0.45, roughness=0.38)
MAT["bumper_rubber"] = fl.make_mat("m_agv_bumper_rubber", (0.02, 0.025, 0.03), metallic=0.0, roughness=0.72)
MAT["deck_blue"] = fl.make_mat("m_agv_deck_blue", (0.00, 0.20, 1.00), metallic=0.05, roughness=0.45)
MAT["lift_orange"] = fl.make_mat("m_agv_lift_orange", (1.00, 0.35, 0.00), metallic=0.05, roughness=0.42)
MAT["wheel_black"] = fl.make_mat("m_agv_wheel_black", (0.01, 0.01, 0.012), metallic=0.0, roughness=0.8)
MAT["wheel_hub"] = fl.make_mat("m_agv_wheel_hub", (0.95, 0.96, 0.98), metallic=0.65, roughness=0.3)
MAT["charger_gold"] = fl.make_mat("m_agv_charger_gold", (1.00, 0.72, 0.05), metallic=0.45, roughness=0.25)
MAT["ir_glass"] = fl.make_mat("m_agv_ir_glass", (0.02, 0.00, 0.08), metallic=0.15, roughness=0.18)
MAT["label_white"] = fl.make_mat("m_agv_label_white", (1.00, 1.00, 1.00), metallic=0.0, roughness=0.5)
MAT["caution_yellow"] = fl.make_mat("m_agv_caution_yellow", (1.00, 0.75, 0.00), metallic=0.0, roughness=0.45)


# ═══════ structure_containment ═══════════════════════════════════════════
fl.add_box("agv1_lower_chassis_pan", (0.60, 0.00, 0.075), (1.16, 0.76, 0.070), MAT["steel_dark"], "structure_containment", MO)
fl.add_box("agv1_upper_enclosure_shell", (0.60, 0.00, 0.210), (1.08, 0.68, 0.210), MAT["enclosure"], "structure_containment", MO)
fl.add_box("agv1_top_load_deck_plate", (0.60, 0.00, 0.365), (1.08, 0.68, 0.035), MAT["steel_light"], "structure_containment", MO)
fl.add_box("agv1_front_bumper_beam", (0.025, 0.00, 0.170), (0.050, 0.82, 0.130), MAT["bumper_rubber"], "structure_containment", MO)
fl.add_box("agv1_rear_bumper_beam", (1.175, 0.00, 0.170), (0.050, 0.82, 0.130), MAT["bumper_rubber"], "structure_containment", MO)
fl.add_box("agv1_left_bumper_rail", (0.60, 0.415, 0.170), (1.10, 0.050, 0.125), MAT["bumper_rubber"], "structure_containment", MO)
fl.add_box("agv1_right_bumper_rail", (0.60, -0.415, 0.170), (1.10, 0.050, 0.125), MAT["bumper_rubber"], "structure_containment", MO)
for i, (x, y) in enumerate([(0.08, 0.36), (0.08, -0.36), (1.12, 0.36), (1.12, -0.36)]):
    fl.add_cyl(f"agv1_corner_bumper_post_{i}", (x, y, 0.175), 0.040, 0.145, MAT["bumper_rubber"], "structure_containment", MO)
for i, x in enumerate([0.23, 0.97]):
    fl.add_box(f"agv1_crossmember_{i}", (x, 0.00, 0.115), (0.045, 0.66, 0.045), MAT["steel_dark"], "structure_containment", MO)
fl.add_box("agv1_left_lift_rail", (0.60, 0.255, 0.405), (0.76, 0.035, 0.035), MAT["steel_light"], "structure_containment", MO)
fl.add_box("agv1_right_lift_rail", (0.60, -0.255, 0.405), (0.76, 0.035, 0.035), MAT["steel_light"], "structure_containment", MO)
fl.add_box("agv1_front_sensor_brow", (0.080, 0.00, 0.300), (0.080, 0.50, 0.035), MAT["steel_light"], "structure_containment", MO)
fl.add_box("agv1_rear_service_brow", (1.120, 0.00, 0.300), (0.080, 0.50, 0.035), MAT["steel_light"], "structure_containment", MO)


# ═══════ energy_storage_source ═══════════════════════════════════════════
fl.add_box("agv2_lithium_pack_main", (0.50, 0.00, 0.160), (0.46, 0.34, 0.120), MAT["battery"], "energy_storage_source", MO)
fl.add_box("agv2_battery_case", (0.50, 0.00, 0.160), (0.50, 0.38, 0.140), MAT["aluminium"], "energy_storage_source", MO)
for i in range(4):
    fl.add_box(f"agv2_cell_module_{i}", (0.335 + i * 0.11, 0.00, 0.185), (0.085, 0.300, 0.065), MAT["battery"], "energy_storage_source", MO)
fl.add_box("agv2_bms_pcb", (0.270, 0.205, 0.195), (0.150, 0.012, 0.075), MAT["pcb"], "energy_storage_source", MO)
fl.add_box("agv2_fuse_link", (0.735, 0.150, 0.185), (0.080, 0.050, 0.040), MAT["safety"], "energy_storage_source", MO)
fl.add_cyl("agv2_pack_vent_valve", (0.735, -0.155, 0.210), 0.018, 0.020, MAT["thermal"], "energy_storage_source", MO)
fl.add_box("agv2_battery_retainer_strap", (0.50, 0.00, 0.240), (0.52, 0.030, 0.018), MAT["steel_dark"], "energy_storage_source", MO)


# ═══════ energy_conversion_transduction ══════════════════════════════════
fl.add_cyl("agv3_left_drive_motor", (0.69, 0.315, 0.125), 0.055, 0.115, MAT["motor"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("agv3_right_drive_motor", (0.69, -0.315, 0.125), 0.055, 0.115, MAT["motor"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("agv3_left_gearbox", (0.60, 0.315, 0.125), 0.047, 0.080, MAT["compressor"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("agv3_right_gearbox", (0.60, -0.315, 0.125), 0.047, 0.080, MAT["compressor"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("agv3_dual_motor_inverter", (0.82, 0.000, 0.205), (0.220, 0.160, 0.070), MAT["inverter"], "energy_conversion_transduction", MO)
fl.add_box("agv3_dcdc_24v_converter", (0.91, 0.200, 0.195), (0.140, 0.090, 0.060), MAT["inverter"], "energy_conversion_transduction", MO)
fl.add_box("agv3_brake_chopper_resistor", (0.92, -0.205, 0.200), (0.150, 0.045, 0.055), MAT["thermal"], "energy_conversion_transduction", MO)
for i, y in enumerate([0.090, 0.040, -0.010, -0.060]):
    fl.add_box(f"agv3_inverter_heat_fin_{i}", (0.82, y, 0.258), (0.190, 0.010, 0.045), MAT["heatsink"], "energy_conversion_transduction", MO)
fl.add_cyl("agv3_regen_brake_capacitor", (0.76, -0.205, 0.205), 0.028, 0.070, MAT["compressor"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))


# ═══════ actuation_kinematics ════════════════════════════════════════════
for side, y in [("left", 0.435), ("right", -0.435)]:
    fl.add_cyl(f"agv4_{side}_drive_tire", (0.62, y, 0.125), 0.105, 0.060, MAT["wheel_black"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"agv4_{side}_drive_hub", (0.62, y, 0.125), 0.055, 0.068, MAT["wheel_hub"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"agv4_{side}_axle_stub", (0.62, y * 0.88, 0.125), 0.020, 0.090, MAT["steel_dark"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
for i, (x, y) in enumerate([(0.18, 0.285), (0.18, -0.285), (1.02, 0.285), (1.02, -0.285)]):
    fl.add_cyl(f"agv4_caster_wheel_{i}", (x, y, 0.070), 0.047, 0.038, MAT["wheel_black"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
    fl.add_cyl(f"agv4_caster_swivel_{i}", (x, y, 0.115), 0.032, 0.025, MAT["wheel_hub"], "actuation_kinematics", MO)
fl.add_box("agv4_lift_scissor_lower_A", (0.60, 0.070, 0.365), (0.500, 0.025, 0.025), MAT["lift_orange"], "actuation_kinematics", MO, rotation=(0, math.radians(18), 0))
fl.add_box("agv4_lift_scissor_lower_B", (0.60, -0.070, 0.365), (0.500, 0.025, 0.025), MAT["lift_orange"], "actuation_kinematics", MO, rotation=(0, math.radians(-18), 0))
fl.add_cyl("agv4_lift_actuator_screw", (0.60, 0.000, 0.405), 0.012, 0.360, MAT["motor"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("agv4_lift_motor", (0.39, 0.000, 0.405), 0.030, 0.070, MAT["motor"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))


# ═══════ sensing_instrumentation ═════════════════════════════════════════
fl.add_cyl("agv5_top_lidar_base", (0.16, 0.270, 0.415), 0.050, 0.035, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("agv5_top_lidar_rotor", (0.16, 0.270, 0.462), 0.060, 0.060, MAT["lens"], "sensing_instrumentation", MO)
fl.add_box("agv5_front_depth_camera", (0.035, 0.000, 0.300), (0.020, 0.115, 0.045), MAT["lens"], "sensing_instrumentation", MO)
fl.add_box("agv5_rear_camera", (1.165, 0.000, 0.290), (0.020, 0.090, 0.040), MAT["lens"], "sensing_instrumentation", MO)
for i, y in enumerate([-0.280, -0.140, 0.140, 0.280]):
    fl.add_cyl(f"agv5_front_ir_{i}", (0.018, y, 0.205), 0.018, 0.016, MAT["ir_glass"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
for i, y in enumerate([-0.260, 0.000, 0.260]):
    fl.add_cyl(f"agv5_rear_ir_{i}", (1.182, y, 0.205), 0.016, 0.016, MAT["ir_glass"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
for i, (x, y, rz) in enumerate([(0.30, 0.420, 90), (0.90, 0.420, 90), (0.30, -0.420, 90), (0.90, -0.420, 90)]):
    fl.add_box(f"agv5_side_ultrasonic_{i}", (x, y, 0.230), (0.055, 0.016, 0.030), MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, 0, math.radians(rz)))
fl.add_box("agv5_imu_module", (0.64, 0.115, 0.255), (0.070, 0.055, 0.035), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("agv5_load_cell_front", (0.35, 0.000, 0.385), (0.060, 0.420, 0.012), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("agv5_load_cell_rear", (0.85, 0.000, 0.385), (0.060, 0.420, 0.012), MAT["sensor"], "sensing_instrumentation", MO)


# ═══════ control_compute_communication ═══════════════════════════════════
fl.add_box("agv6_main_compute_box", (0.64, -0.120, 0.245), (0.210, 0.150, 0.080), MAT["control"], "control_compute_communication", MO)
fl.add_box("agv6_navigation_pcb", (0.62, -0.120, 0.305), (0.180, 0.120, 0.010), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("agv6_motion_controller", (0.82, -0.120, 0.275), (0.130, 0.100, 0.055), MAT["fc"], "control_compute_communication", MO)
fl.add_box("agv6_io_gateway", (0.47, -0.125, 0.270), (0.120, 0.090, 0.050), MAT["control"], "control_compute_communication", MO)
fl.add_box("agv6_wifi_radio", (0.98, 0.090, 0.295), (0.080, 0.065, 0.035), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("agv6_wifi_antenna_left", (0.99, 0.130, 0.385), 0.004, 0.150, MAT["antenna"], "control_compute_communication", MO)
fl.add_cyl("agv6_wifi_antenna_right", (1.05, 0.130, 0.375), 0.004, 0.130, MAT["antenna"], "control_compute_communication", MO)
fl.add_box("agv6_canbus_hub", (0.98, -0.095, 0.245), (0.085, 0.070, 0.040), MAT["ctrl_black"], "control_compute_communication", MO)


# ═══════ safety_protection ═══════════════════════════════════════════════
fl.add_cyl("agv7_front_estop_button", (0.100, 0.000, 0.365), 0.035, 0.025, MAT["safety"], "safety_protection", MO)
fl.add_cyl("agv7_rear_estop_button", (1.100, 0.000, 0.365), 0.035, 0.025, MAT["safety"], "safety_protection", MO)
fl.add_cyl("agv7_left_estop_button", (0.600, 0.405, 0.300), 0.030, 0.025, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("agv7_right_estop_button", (0.600, -0.405, 0.300), 0.030, 0.025, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("agv7_front_safety_laser_window", (0.030, 0.000, 0.245), (0.018, 0.310, 0.055), MAT["safety"], "safety_protection", MO)
fl.add_box("agv7_rear_safety_laser_window", (1.170, 0.000, 0.245), (0.018, 0.250, 0.050), MAT["safety"], "safety_protection", MO)
fl.add_box("agv7_left_safety_edge", (0.60, 0.445, 0.205), (1.08, 0.018, 0.055), MAT["safety"], "safety_protection", MO)
fl.add_box("agv7_right_safety_edge", (0.60, -0.445, 0.205), (1.08, 0.018, 0.055), MAT["safety"], "safety_protection", MO)
fl.add_cyl("agv7_warning_beacon", (0.98, -0.255, 0.430), 0.035, 0.050, MAT["safety"], "safety_protection", MO)
fl.add_box("agv7_safety_relay_box", (0.37, -0.230, 0.245), (0.110, 0.070, 0.045), MAT["safety"], "safety_protection", MO)
fl.add_box("agv7_fire_fuse_disconnect", (0.76, 0.235, 0.245), (0.095, 0.055, 0.050), MAT["safety"], "safety_protection", MO)
fl.add_box("agv7_caution_stripe_front", (0.060, 0.000, 0.370), (0.020, 0.560, 0.018), MAT["caution_yellow"], "safety_protection", MO)


# ═══════ power_distribution ══════════════════════════════════════════════
fl.add_box("agv8_main_power_distribution_board", (0.77, 0.115, 0.270), (0.180, 0.120, 0.012), MAT["powerdist"], "power_distribution", MO)
fl.add_box("agv8_high_current_busbar_pos", (0.66, 0.205, 0.245), (0.310, 0.015, 0.018), MAT["copper"], "power_distribution", MO)
fl.add_box("agv8_high_current_busbar_neg", (0.66, 0.165, 0.245), (0.310, 0.015, 0.018), MAT["copper"], "power_distribution", MO)
fl.add_cyl("agv8_left_motor_power_cable", (0.70, 0.240, 0.190), 0.008, 0.220, MAT["copper"], "power_distribution", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("agv8_right_motor_power_cable", (0.70, -0.240, 0.190), 0.008, 0.220, MAT["copper"], "power_distribution", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("agv8_sensor_harness_front", (0.30, 0.000, 0.300), 0.005, 0.410, MAT["copper"], "power_distribution", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("agv8_top_lidar_harness", (0.31, 0.250, 0.365), 0.004, 0.180, MAT["copper"], "power_distribution", MO, rotation=(0, math.radians(90), 0))
fl.add_box("agv8_fuse_block", (0.56, 0.235, 0.260), (0.095, 0.055, 0.045), MAT["powerdist"], "power_distribution", MO)
fl.add_box("agv8_grounding_braid", (0.56, -0.240, 0.105), (0.420, 0.012, 0.010), MAT["copper"], "power_distribution", MO)


# ═══════ hmi_ergonomics ══════════════════════════════════════════════════
fl.add_box("agv9_status_display", (0.170, -0.315, 0.345), (0.140, 0.018, 0.060), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_box("agv9_display_glass", (0.170, -0.328, 0.345), (0.115, 0.006, 0.045), MAT["lens"], "hmi_ergonomics", MO)
fl.add_box("agv9_top_status_light_bar", (0.58, 0.000, 0.430), (0.300, 0.035, 0.020), MAT["hmi"], "hmi_ergonomics", MO)
for i, x in enumerate([0.48, 0.58, 0.68]):
    fl.add_cyl(f"agv9_status_led_{i}", (x, 0.000, 0.447), 0.018, 0.012, MAT["sensor"], "hmi_ergonomics", MO)
fl.add_box("agv9_qr_fleet_label", (0.38, 0.348, 0.330), (0.150, 0.006, 0.080), MAT["label_white"], "hmi_ergonomics", MO)
fl.add_box("agv9_direction_arrow_decal", (0.110, 0.000, 0.392), (0.120, 0.210, 0.006), MAT["caution_yellow"], "hmi_ergonomics", MO)
fl.add_cyl("agv9_audio_buzzer", (1.020, -0.285, 0.335), 0.028, 0.018, MAT["hmi"], "hmi_ergonomics", MO)


# ═══════ maintenance_serviceability ══════════════════════════════════════
fl.add_box("agv10_battery_service_door", (0.500, 0.356, 0.205), (0.420, 0.014, 0.150), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("agv10_controller_service_panel", (0.760, -0.356, 0.245), (0.300, 0.014, 0.120), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("agv10_rear_diagnostic_port", (1.175, -0.220, 0.295), (0.016, 0.080, 0.045), MAT["maint"], "maintenance_serviceability", MO)
fl.add_cyl("agv10_manual_brake_release", (1.170, 0.230, 0.285), 0.022, 0.016, MAT["maint"], "maintenance_serviceability", MO, rotation=(0, math.radians(90), 0))
for i, (x, y) in enumerate([(0.22, 0.330), (0.78, 0.330), (0.22, -0.330), (0.78, -0.330)]):
    fl.add_cyl(f"agv10_quick_release_screw_{i}", (x, y, 0.305), 0.012, 0.010, MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("agv10_service_pull_handle", (0.500, 0.372, 0.285), (0.160, 0.018, 0.025), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("agv10_calibration_tag_plate", (1.020, 0.350, 0.315), (0.120, 0.006, 0.060), MAT["label_white"], "maintenance_serviceability", MO)


# ═══════ environmental_interface ═════════════════════════════════════════
fl.add_box("agv11_rear_charging_contact_pos", (1.187, 0.090, 0.180), (0.014, 0.080, 0.045), MAT["charger_gold"], "environmental_interface", MO)
fl.add_box("agv11_rear_charging_contact_neg", (1.187, -0.090, 0.180), (0.014, 0.080, 0.045), MAT["charger_gold"], "environmental_interface", MO)
fl.add_box("agv11_charging_dock_funnel", (1.170, 0.000, 0.120), (0.040, 0.240, 0.060), MAT["steel_light"], "environmental_interface", MO)
fl.add_box("agv11_front_dust_seal", (0.045, 0.000, 0.110), (0.020, 0.660, 0.030), MAT["thermal"], "environmental_interface", MO)
fl.add_box("agv11_rear_dust_seal", (1.155, 0.000, 0.110), (0.020, 0.660, 0.030), MAT["thermal"], "environmental_interface", MO)
fl.add_box("agv11_left_floor_skirt", (0.60, 0.390, 0.065), (1.000, 0.022, 0.050), MAT["bumper_rubber"], "environmental_interface", MO)
fl.add_box("agv11_right_floor_skirt", (0.60, -0.390, 0.065), (1.000, 0.022, 0.050), MAT["bumper_rubber"], "environmental_interface", MO)
fl.add_box("agv11_esd_drag_chain", (0.98, 0.000, 0.030), (0.020, 0.060, 0.060), MAT["copper"], "environmental_interface", MO)
fl.add_cyl("agv11_ip_rated_vent", (0.265, -0.355, 0.235), 0.030, 0.012, MAT["thermal"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("agv11_rfid_floor_reader_window", (0.42, 0.000, 0.042), (0.170, 0.110, 0.010), MAT["ir_glass"], "environmental_interface", MO)


fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10)
fl.make_world_white()
fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")