"""industrial-inspection-drone-9shot.py — ForgeOS hand-coded Blender template for a large industrial inspection drone.

Larger industrial inspection quadrotor: ~1.5 m class envelope, ~1.2 m motor-to-motor
diagonal, carbon-fibre X-frame, 15-inch propellers, 80 mm stator motors, rugged landing
gear, underside camera/LiDAR payload, central 22000 mAh LiPo battery, long-range RF/GNSS,
obstacle sensing, flight-controller + companion-compute stack, outdoor inspection fitout.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P industrial-inspection-drone-9shot.py
"""
import os
import sys
import math
from pathlib import Path

POC_DIR = Path(__file__).parent
sys.path.insert(0, str(POC_DIR))
import forge_blender_lib as fl

fl.init_scene()

OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-industrial-inspection-drone-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 1.5
D = 1.5
H = 0.5

CX = W / 2
CY = 0.0
CHASSIS_Z = 0.205
ARM_HALF = 0.42
MOTOR_Z = 0.255
PROP_Z = 0.315
GIMBAL_Z = 0.105

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
    "carbon_ind": fl.make_mat("m_industrial_carbon", (0.07, 0.09, 0.12), metallic=0.25, roughness=0.48),
    "carbon_edge": fl.make_mat("m_carbon_edge", (0.16, 0.18, 0.22), metallic=0.25, roughness=0.42),
    "prop_dark": fl.make_mat("m_prop_industrial", (0.045, 0.055, 0.070), metallic=0.0, roughness=0.58),
    "rubber": fl.make_mat("m_rubber_black", (0.015, 0.018, 0.022), metallic=0.0, roughness=0.82),
    "lidar": fl.make_mat("m_lidar_deep_violet", (0.38, 0.00, 1.00), metallic=0.1, roughness=0.36),
    "camera_glass": fl.make_mat("m_camera_glass", (0.00, 0.03, 0.09), metallic=0.35, roughness=0.18),
    "inspection_orange": fl.make_mat("m_inspection_orange", (1.00, 0.24, 0.00), metallic=0.0, roughness=0.45),
    "ip_gasket": fl.make_mat("m_ip_gasket", (0.00, 0.95, 0.95), metallic=0.0, roughness=0.45),
    "tablet_screen": fl.make_mat("m_tablet_screen", (0.00, 0.10, 0.20), metallic=0.1, roughness=0.2),
})

# ═══════ MODULE — structure_containment: carbon X-frame, landing gear, payload frame ═══════
fl.add_box("iid_frame_centre_upper_plate", (CX, CY, CHASSIS_Z + 0.018), (0.34, 0.24, 0.018), MAT["carbon_ind"], "structure_containment", MO)
fl.add_box("iid_frame_centre_lower_plate", (CX, CY, CHASSIS_Z - 0.018), (0.30, 0.20, 0.014), MAT["carbon_ind"], "structure_containment", MO)
fl.add_box("iid_frame_battery_deck", (CX, CY, CHASSIS_Z + 0.050), (0.30, 0.18, 0.010), MAT["carbon_edge"], "structure_containment", MO)

for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    angle = math.atan2(sy, sx)
    fl.add_cyl(f"iid_arm_outer_tube_{name}", (CX + sx * ARM_HALF * 0.50, CY + sy * ARM_HALF * 0.50, CHASSIS_Z),
               0.018, 0.62, MAT["carbon_ind"], "structure_containment", MO,
               rotation=(0, math.radians(90), angle))
    fl.add_cyl(f"iid_arm_inner_brace_{name}", (CX + sx * ARM_HALF * 0.34, CY + sy * ARM_HALF * 0.34, CHASSIS_Z - 0.030),
               0.009, 0.42, MAT["carbon_edge"], "structure_containment", MO,
               rotation=(0, math.radians(90), angle))
    fl.add_box(f"iid_motor_mount_plate_{name}", (CX + sx * ARM_HALF, CY + sy * ARM_HALF, MOTOR_Z - 0.026),
               (0.12, 0.12, 0.010), MAT["carbon_ind"], "structure_containment", MO,
               rotation=(0, 0, angle))
    fl.add_cyl(f"iid_arm_root_clamp_{name}", (CX + sx * 0.145, CY + sy * 0.145, CHASSIS_Z),
               0.028, 0.034, MAT["carbon_edge"], "structure_containment", MO)

for sx in [-1, +1]:
    for sy in [-1, +1]:
        fl.add_cyl(f"iid_landing_leg_{sx}_{sy}", (CX + sx * 0.17, CY + sy * 0.12, 0.095),
                   0.010, 0.19, MAT["carbon_ind"], "structure_containment", MO)
        fl.add_cyl(f"iid_landing_foot_socket_{sx}_{sy}", (CX + sx * 0.17, CY + sy * 0.12, 0.018),
                   0.016, 0.018, MAT["rubber"], "structure_containment", MO)

fl.add_cyl("iid_landing_skid_left", (CX, CY - 0.22, 0.020), 0.012, 0.62, MAT["carbon_ind"], "structure_containment", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("iid_landing_skid_right", (CX, CY + 0.22, 0.020), 0.012, 0.62, MAT["carbon_ind"], "structure_containment", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("iid_payload_crossbeam", (CX + 0.095, CY, GIMBAL_Z + 0.044), (0.16, 0.13, 0.012), MAT["carbon_ind"], "structure_containment", MO)
fl.add_box("iid_payload_left_rail", (CX + 0.105, CY - 0.070, GIMBAL_Z + 0.020), (0.18, 0.012, 0.018), MAT["carbon_ind"], "structure_containment", MO)
fl.add_box("iid_payload_right_rail", (CX + 0.105, CY + 0.070, GIMBAL_Z + 0.020), (0.18, 0.012, 0.018), MAT["carbon_ind"], "structure_containment", MO)

# ═══════ MODULE — energy_storage_source: 22000 mAh LiPo pack and pack hardware ═══════
BATT_Z = CHASSIS_Z + 0.108
fl.add_box("iid_lipo_22000_main_pack", (CX, CY, BATT_Z), (0.31, 0.18, 0.086), MAT["battery"], "energy_storage_source", MO)
fl.add_box("iid_lipo_front_cell_block", (CX + 0.082, CY, BATT_Z + 0.004), (0.11, 0.172, 0.074), MAT["battery"], "energy_storage_source", MO)
fl.add_box("iid_lipo_rear_cell_block", (CX - 0.082, CY, BATT_Z + 0.004), (0.11, 0.172, 0.074), MAT["battery"], "energy_storage_source", MO)
fl.add_box("iid_battery_bms_board", (CX - 0.160, CY, BATT_Z), (0.010, 0.150, 0.050), MAT["pcb"], "energy_storage_source", MO)
fl.add_cyl("iid_battery_xt90_positive", (CX + 0.166, CY - 0.032, BATT_Z + 0.005), 0.011, 0.032, MAT["copper"], "energy_storage_source", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("iid_battery_xt90_negative", (CX + 0.166, CY + 0.032, BATT_Z + 0.005), 0.011, 0.032, MAT["powerdist"], "energy_storage_source", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("iid_battery_retention_strap_front", (CX + 0.075, CY, BATT_Z + 0.048), (0.020, 0.205, 0.010), MAT["maint"], "energy_storage_source", MO)
fl.add_box("iid_battery_retention_strap_rear", (CX - 0.075, CY, BATT_Z + 0.048), (0.020, 0.205, 0.010), MAT["maint"], "energy_storage_source", MO)
fl.add_box("iid_battery_heater_film", (CX, CY, BATT_Z - 0.046), (0.285, 0.160, 0.004), MAT["safety"], "energy_storage_source", MO)

# ═══════ MODULE — energy_conversion_transduction: motors and ESCs ═══════
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    mx = CX + sx * ARM_HALF
    my = CY + sy * ARM_HALF
    fl.add_cyl(f"iid_motor_stator_80mm_{name}", (mx, my, MOTOR_Z), 0.040, 0.042, MAT["motor"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"iid_motor_rotor_bell_{name}", (mx, my, MOTOR_Z + 0.038), 0.036, 0.026, MAT["rotor_cap"], "energy_conversion_transduction", MO)
    fl.add_cyl(f"iid_motor_bearing_stack_{name}", (mx, my, MOTOR_Z - 0.032), 0.022, 0.012, MAT["aluminium"], "energy_conversion_transduction", MO)
    fl.add_box(f"iid_arm_esc_{name}", (CX + sx * 0.225, CY + sy * 0.225, CHASSIS_Z - 0.054),
               (0.090, 0.050, 0.020), MAT["pcb"], "energy_conversion_transduction", MO,
               rotation=(0, 0, math.atan2(sy, sx)))
    for i in range(3):
        fl.add_box(f"iid_esc_heat_fin_{name}_{i}", (CX + sx * 0.225 + (i - 1) * 0.014 * sx, CY + sy * 0.225, CHASSIS_Z - 0.037),
                   (0.004, 0.052, 0.018), MAT["thermal"], "energy_conversion_transduction", MO,
                   rotation=(0, 0, math.atan2(sy, sx)))

# ═══════ MODULE — actuation_kinematics: 15-inch propellers and gimbal axes ═══════
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    mx = CX + sx * ARM_HALF
    my = CY + sy * ARM_HALF
    blade_angle = math.radians(18 if sx * sy > 0 else -18)
    fl.add_box(f"iid_prop_15in_blade_A_{name}", (mx, my, PROP_Z), (0.365, 0.045, 0.006), MAT["prop_dark"], "actuation_kinematics", MO,
               rotation=(0, 0, blade_angle))
    fl.add_box(f"iid_prop_15in_blade_B_{name}", (mx, my, PROP_Z), (0.045, 0.365, 0.006), MAT["prop_dark"], "actuation_kinematics", MO,
               rotation=(0, 0, blade_angle))
    fl.add_cyl(f"iid_prop_hub_spinner_{name}", (mx, my, PROP_Z + 0.010), 0.018, 0.020, MAT["maint"], "actuation_kinematics", MO)

fl.add_cyl("iid_gimbal_yaw_motor", (CX + 0.060, CY, GIMBAL_Z + 0.050), 0.032, 0.038, MAT["gimbal"], "actuation_kinematics", MO)
fl.add_box("iid_gimbal_roll_bridge", (CX + 0.090, CY, GIMBAL_Z + 0.015), (0.030, 0.145, 0.016), MAT["gimbal"], "actuation_kinematics", MO)
fl.add_cyl("iid_gimbal_roll_motor_left", (CX + 0.100, CY - 0.082, GIMBAL_Z + 0.014), 0.022, 0.024, MAT["gimbal"], "actuation_kinematics", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("iid_gimbal_roll_motor_right", (CX + 0.100, CY + 0.082, GIMBAL_Z + 0.014), 0.022, 0.024, MAT["gimbal"], "actuation_kinematics", MO,
           rotation=(math.radians(90), 0, 0))
fl.add_cyl("iid_gimbal_pitch_motor", (CX + 0.152, CY, GIMBAL_Z - 0.006), 0.024, 0.030, MAT["gimbal"], "actuation_kinematics", MO,
           rotation=(0, math.radians(90), 0))

# ═══════ MODULE — environmental_interface: outdoor sealing, thermal, airflow ═══════
fl.add_box("iid_ip54_centre_gasket", (CX, CY, CHASSIS_Z + 0.031), (0.350, 0.250, 0.006), MAT["ip_gasket"], "environmental_interface", MO)
fl.add_box("iid_companion_compute_heat_spreader", (CX - 0.035, CY + 0.020, CHASSIS_Z + 0.082), (0.082, 0.060, 0.010), MAT["heatsink"], "environmental_interface", MO)
for i in range(6):
    fl.add_box(f"iid_compute_heat_fin_{i}", (CX - 0.070 + i * 0.014, CY + 0.020, CHASSIS_Z + 0.095),
               (0.004, 0.066, 0.024), MAT["thermal"], "environmental_interface", MO)
fl.add_box("iid_camera_pod_desiccant_window", (CX + 0.205, CY - 0.048, GIMBAL_Z - 0.014), (0.032, 0.010, 0.020), MAT["ip_gasket"], "environmental_interface", MO)
fl.add_box("iid_downwash_air_scoop_left", (CX - 0.035, CY - 0.145, CHASSIS_Z + 0.010), (0.070, 0.018, 0.024), MAT["thermal"], "environmental_interface", MO)
fl.add_box("iid_downwash_air_scoop_right", (CX - 0.035, CY + 0.145, CHASSIS_Z + 0.010), (0.070, 0.018, 0.024), MAT["thermal"], "environmental_interface", MO)
fl.add_box("iid_barometer_foam_filter", (CX - 0.126, CY + 0.070, CHASSIS_Z + 0.038), (0.028, 0.020, 0.012), MAT["ip_gasket"], "environmental_interface", MO)

# ═══════ MODULE — sensing_instrumentation: inspection camera, LiDAR, GPS, avoidance ═══════
fl.add_cyl("iid_highres_camera_body", (CX + 0.182, CY, GIMBAL_Z - 0.008), 0.040, 0.070, MAT["ctrl_black"], "sensing_instrumentation", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("iid_highres_camera_lens", (CX + 0.230, CY, GIMBAL_Z - 0.008), 0.032, 0.028, MAT["camera_glass"], "sensing_instrumentation", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("iid_lidar_puck", (CX + 0.100, CY, GIMBAL_Z - 0.060), 0.046, 0.034, MAT["lidar"], "sensing_instrumentation", MO)
fl.add_cyl("iid_thermal_camera", (CX + 0.170, CY + 0.064, GIMBAL_Z - 0.010), 0.022, 0.030, MAT["lens"], "sensing_instrumentation", MO,
           rotation=(0, math.radians(90), 0))
fl.add_cyl("iid_gnss_survey_puck", (CX - 0.090, CY, BATT_Z + 0.076), 0.038, 0.018, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("iid_gnss_short_mast", (CX - 0.090, CY, BATT_Z + 0.047), 0.006, 0.060, MAT["antenna"], "sensing_instrumentation", MO)
for name, dx, dy, rot in [
    ("front", +0.190, 0.000, (0, math.radians(90), 0)),
    ("rear", -0.190, 0.000, (0, math.radians(90), 0)),
    ("left", 0.000, -0.145, (math.radians(90), 0, 0)),
    ("right", 0.000, +0.145, (math.radians(90), 0, 0)),
]:
    fl.add_cyl(f"iid_obstacle_sensor_{name}", (CX + dx, CY + dy, CHASSIS_Z + 0.020),
               0.016, 0.020, MAT["sensor"], "sensing_instrumentation", MO, rotation=rot)
fl.add_box("iid_imu_vibration_isolated", (CX - 0.030, CY - 0.030, CHASSIS_Z + 0.056), (0.030, 0.030, 0.010), MAT["sensor"], "sensing_instrumentation", MO)

# ═══════ MODULE — control_compute_communication: FC, companion, radios, antennas ═══════
fl.add_box("iid_flight_controller_board", (CX, CY, CHASSIS_Z + 0.060), (0.090, 0.075, 0.008), MAT["fc"], "control_compute_communication", MO)
fl.add_box("iid_companion_computer_board", (CX - 0.035, CY + 0.020, CHASSIS_Z + 0.074), (0.100, 0.076, 0.008), MAT["inverter"], "control_compute_communication", MO)
fl.add_box("iid_ai_accelerator_module", (CX - 0.020, CY + 0.020, CHASSIS_Z + 0.087), (0.040, 0.034, 0.008), MAT["fc"], "control_compute_communication", MO)
fl.add_box("iid_long_range_rf_module", (CX - 0.120, CY - 0.078, CHASSIS_Z + 0.040), (0.056, 0.036, 0.012), MAT["hmi"], "control_compute_communication", MO)
fl.add_box("iid_remote_id_module", (CX - 0.122, CY + 0.080, CHASSIS_Z + 0.040), (0.040, 0.032, 0.010), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("iid_rf_whip_left", (CX - 0.215, CY - 0.145, CHASSIS_Z + 0.060), 0.003, 0.210, MAT["antenna"], "control_compute_communication", MO,
           rotation=(math.radians(18), 0, math.radians(-26)))
fl.add_cyl("iid_rf_whip_right", (CX - 0.215, CY + 0.145, CHASSIS_Z + 0.060), 0.003, 0.210, MAT["antenna"], "control_compute_communication", MO,
           rotation=(math.radians(18), 0, math.radians(26)))
fl.add_cyl("iid_telemetry_stub_900mhz", (CX + 0.020, CY - 0.165, CHASSIS_Z + 0.067), 0.004, 0.100, MAT["antenna"], "control_compute_communication", MO)

# ═══════ MODULE — safety_protection: guards, parachute, strobes, failsafe ═══════
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    fl.add_torus(f"iid_prop_guard_ring_{name}", (CX + sx * ARM_HALF, CY + sy * ARM_HALF, PROP_Z - 0.006),
                 0.213, 0.005, MAT["safety"], "safety_protection", MO)

fl.add_box("iid_parachute_canister", (CX - 0.040, CY, BATT_Z + 0.086), (0.165, 0.090, 0.052), MAT["safety"], "safety_protection", MO)
fl.add_cyl("iid_parachute_ejector_cap", (CX + 0.052, CY, BATT_Z + 0.088), 0.024, 0.020, MAT["inspection_orange"], "safety_protection", MO,
           rotation=(0, math.radians(90), 0))
fl.add_box("iid_main_power_safety_contactor", (CX + 0.120, CY - 0.060, CHASSIS_Z + 0.058), (0.040, 0.028, 0.020), MAT["safety"], "safety_protection", MO)
fl.add_cyl("iid_red_status_strobe", (CX + 0.180, CY - 0.130, CHASSIS_Z + 0.064), 0.014, 0.016, MAT["safety"], "safety_protection", MO)
fl.add_cyl("iid_green_status_strobe", (CX + 0.180, CY + 0.130, CHASSIS_Z + 0.064), 0.014, 0.016, MAT["sensor"], "safety_protection", MO)
fl.add_box("iid_gimbal_crash_bumper", (CX + 0.194, CY, GIMBAL_Z - 0.060), (0.095, 0.125, 0.012), MAT["rubber"], "safety_protection", MO)

# ═══════ MODULE — power_distribution: PDB, busbars, fuses, motor harnesses ═══════
fl.add_box("iid_main_power_distribution_board", (CX, CY, CHASSIS_Z + 0.034), (0.130, 0.110, 0.008), MAT["powerdist"], "power_distribution", MO)
fl.add_box("iid_positive_busbar", (CX + 0.020, CY - 0.040, CHASSIS_Z + 0.046), (0.120, 0.010, 0.010), MAT["copper"], "power_distribution", MO)
fl.add_box("iid_negative_busbar", (CX + 0.020, CY + 0.040, CHASSIS_Z + 0.046), (0.120, 0.010, 0.010), MAT["aluminium"], "power_distribution", MO)
fl.add_box("iid_fuse_block", (CX + 0.105, CY, CHASSIS_Z + 0.045), (0.036, 0.070, 0.018), MAT["safety"], "power_distribution", MO)
fl.add_cyl("iid_battery_positive_lead", (CX + 0.095, CY - 0.030, BATT_Z - 0.032), 0.006, 0.170, MAT["copper"], "power_distribution", MO,
           rotation=(0, math.radians(60), 0))
fl.add_cyl("iid_battery_negative_lead", (CX + 0.095, CY + 0.030, BATT_Z - 0.032), 0.006, 0.170, MAT["powerdist"], "power_distribution", MO,
           rotation=(0, math.radians(60), 0))
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    fl.add_cyl(f"iid_three_phase_motor_harness_{name}", (CX + sx * ARM_HALF * 0.50, CY + sy * ARM_HALF * 0.50, CHASSIS_Z - 0.010),
               0.005, 0.590, MAT["copper"], "power_distribution", MO,
               rotation=(0, math.radians(90), math.atan2(sy, sx)))
fl.add_box("iid_payload_power_connector", (CX + 0.130, CY, CHASSIS_Z - 0.004), (0.036, 0.026, 0.018), MAT["copper"], "power_distribution", MO)

# ═══════ MODULE — hmi_ergonomics: rugged ground controller and onboard indicators ═══════
CTRL_X = CX
CTRL_Y = 0.98
CTRL_Z = 0.060
fl.add_box("iid_rugged_controller_body", (CTRL_X, CTRL_Y, CTRL_Z), (0.300, 0.145, 0.050), MAT["hmi"], "hmi_ergonomics", MO)
fl.add_box("iid_controller_tablet_screen", (CTRL_X, CTRL_Y - 0.030, CTRL_Z + 0.036), (0.210, 0.012, 0.105), MAT["tablet_screen"], "hmi_ergonomics", MO)
fl.add_cyl("iid_controller_left_stick_base", (CTRL_X - 0.078, CTRL_Y + 0.020, CTRL_Z + 0.032), 0.022, 0.010, MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_cyl("iid_controller_right_stick_base", (CTRL_X + 0.078, CTRL_Y + 0.020, CTRL_Z + 0.032), 0.022, 0.010, MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_cyl("iid_controller_left_stick", (CTRL_X - 0.078, CTRL_Y + 0.020, CTRL_Z + 0.050), 0.007, 0.026, MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_cyl("iid_controller_right_stick", (CTRL_X + 0.078, CTRL_Y + 0.020, CTRL_Z + 0.050), 0.007, 0.026, MAT["ctrl_black"], "hmi_ergonomics", MO)
fl.add_cyl("iid_controller_patch_antenna", (CTRL_X + 0.136, CTRL_Y - 0.032, CTRL_Z + 0.070), 0.006, 0.115, MAT["antenna"], "hmi_ergonomics", MO)
fl.add_box("iid_onboard_status_led_bar", (CX + 0.155, CY, CHASSIS_Z + 0.066), (0.010, 0.100, 0.012), MAT["hmi"], "hmi_ergonomics", MO)

# ═══════ MODULE — maintenance_serviceability: latches, ports, QR fasteners, labels ═══════
fl.add_box("iid_battery_quick_release_latch", (CX - 0.145, CY, BATT_Z + 0.054), (0.050, 0.030, 0.014), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("iid_payload_quick_disconnect_plate", (CX + 0.055, CY, GIMBAL_Z + 0.070), (0.080, 0.060, 0.010), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("iid_usb_c_service_port", (CX - 0.176, CY + 0.042, CHASSIS_Z + 0.046), (0.006, 0.024, 0.012), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("iid_sd_card_service_port", (CX - 0.176, CY - 0.042, CHASSIS_Z + 0.046), (0.006, 0.024, 0.012), MAT["maint"], "maintenance_serviceability", MO)
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    mx = CX + sx * ARM_HALF
    my = CY + sy * ARM_HALF
    fl.add_cyl(f"iid_prop_quick_release_knob_{name}", (mx, my, PROP_Z + 0.026),
               0.014, 0.012, MAT["maint"], "maintenance_serviceability", MO)
for sx in [-1, +1]:
    for sy in [-1, +1]:
        fl.add_cyl(f"iid_centre_plate_captive_bolt_{sx}_{sy}", (CX + sx * 0.130, CY + sy * 0.090, CHASSIS_Z + 0.064),
                   0.006, 0.006, MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("iid_airworthiness_id_plate", (CX + 0.000, CY - 0.126, CHASSIS_Z + 0.040), (0.075, 0.006, 0.024), MAT["maint"], "maintenance_serviceability", MO)

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")