"""industrial-robot-arm-9shot.py — 6-DOF industrial robot arm with adjacent controller cabinet.

Source: ForgeOS hand-coded form-factor template. Envelope W=1.0 × D=1.0 × H=1.8 m
for ABB IRB 1200 / UR10-class industrial robot arm. Includes base pedestal,
shoulder, upper arm, elbow, forearm, 3-axis wrist, end-effector flange, visible
servo / harmonic-drive housings, cable carrier, controller cabinet, HMI pendant,
e-stop, power distribution, safety, sensing, maintenance and environmental
interface features.

Outputs: 1 hero + 3 spatial + 10 module pages = 14 PNGs.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P industrial-robot-arm-9shot.py
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
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-industrial-robot-arm-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 1.0
D = 1.0
H = 1.8

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
])

MAT = fl.make_default_palette()
MAT.update({
    "robot_yellow": fl.make_mat("m_robot_yellow", (1.00, 0.64, 0.00), metallic=0.05, roughness=0.42),
    "joint_orange": fl.make_mat("m_joint_orange", (1.00, 0.32, 0.00), metallic=0.10, roughness=0.38),
    "gear_teal": fl.make_mat("m_gear_teal", (0.00, 0.70, 0.78), metallic=0.20, roughness=0.36),
    "servo_blue": fl.make_mat("m_servo_blue", (0.05, 0.36, 1.00), metallic=0.25, roughness=0.34),
    "cabinet_dark": fl.make_mat("m_cabinet_dark", (0.18, 0.19, 0.21), metallic=0.45, roughness=0.48),
    "cable_black": fl.make_mat("m_cable_black", (0.02, 0.025, 0.03), metallic=0.0, roughness=0.78),
    "rubber": fl.make_mat("m_rubber", (0.01, 0.012, 0.014), metallic=0.0, roughness=0.88),
    "screen_glass": fl.make_mat("m_screen_glass", (0.00, 0.20, 0.80), metallic=0.0, roughness=0.16),
    "pendant_blue": fl.make_mat("m_pendant_blue", (0.02, 0.38, 1.00), metallic=0.05, roughness=0.36),
    "warning_white": fl.make_mat("m_warning_white", (0.96, 0.96, 0.92), metallic=0.0, roughness=0.48),
})

# Robot arm reference points — compact 6-DOF pose with raised elbow.
BASE = (0.50, 0.00, 0.00)
SHOULDER = (0.50, 0.00, 0.34)
THETA_UPPER = math.radians(-62)
THETA_FORE = math.radians(-34)
UPPER_LEN = 0.56
FORE_LEN = 0.40
UPPER_VEC = (math.cos(THETA_UPPER) * UPPER_LEN, 0.0, -math.sin(THETA_UPPER) * UPPER_LEN)
ELBOW = (SHOULDER[0] + UPPER_VEC[0], SHOULDER[1], SHOULDER[2] + UPPER_VEC[2])
FORE_VEC = (math.cos(THETA_FORE) * FORE_LEN, 0.0, -math.sin(THETA_FORE) * FORE_LEN)
WRIST = (ELBOW[0] + FORE_VEC[0], ELBOW[1], ELBOW[2] + FORE_VEC[2])
TOOL = (WRIST[0] + 0.12, WRIST[1], WRIST[2] + 0.02)

CAB_X = 1.35
CAB_Y = -0.34
CAB_W = 0.60
CAB_D = 0.40
CAB_H = 1.50
CAB_Z = CAB_H / 2

# ═══════ Module — structure_containment ═══════
# Floor plate and base / joint covers only — actual containment and outer shell.
fl.add_box("ira_floor_anchor_plate", (0.50, 0.00, 0.015), (0.58, 0.46, 0.03), MAT["powerdist"], "structure_containment", MO)
fl.add_cyl("ira_base_outer_shell", (0.50, 0.00, 0.115), 0.150, 0.200, MAT["robot_yellow"], "structure_containment", MO)
fl.add_cyl("ira_base_top_cover", (0.50, 0.00, 0.225), 0.135, 0.030, MAT["robot_yellow"], "structure_containment", MO)
fl.add_cyl("ira_shoulder_outer_cover", SHOULDER, 0.165, 0.190, MAT["robot_yellow"], "structure_containment", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_upper_arm_left_cover", (SHOULDER[0] + UPPER_VEC[0] * 0.50, -0.055, SHOULDER[2] + UPPER_VEC[2] * 0.50),
           (UPPER_LEN, 0.045, 0.095), MAT["robot_yellow"], "structure_containment", MO, rotation=(0, THETA_UPPER, 0))
fl.add_box("ira_upper_arm_right_cover", (SHOULDER[0] + UPPER_VEC[0] * 0.50, 0.055, SHOULDER[2] + UPPER_VEC[2] * 0.50),
           (UPPER_LEN, 0.045, 0.095), MAT["robot_yellow"], "structure_containment", MO, rotation=(0, THETA_UPPER, 0))
fl.add_cyl("ira_elbow_outer_cover", ELBOW, 0.135, 0.175, MAT["robot_yellow"], "structure_containment", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_forearm_outer_cover", (ELBOW[0] + FORE_VEC[0] * 0.50, 0.000, ELBOW[2] + FORE_VEC[2] * 0.50),
           (FORE_LEN, 0.115, 0.085), MAT["robot_yellow"], "structure_containment", MO, rotation=(0, THETA_FORE, 0))
fl.add_cyl("ira_wrist_roll_cover", WRIST, 0.078, 0.135, MAT["robot_yellow"], "structure_containment", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_wrist_pitch_cover", (WRIST[0] + 0.055, 0.00, WRIST[2] + 0.018), 0.060, 0.115, MAT["robot_yellow"], "structure_containment", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_wrist_yaw_cover", (WRIST[0] + 0.105, 0.00, WRIST[2] + 0.020), 0.050, 0.080, MAT["robot_yellow"], "structure_containment", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_tool_flange_plate", TOOL, 0.060, 0.026, MAT["stainless"], "structure_containment", MO, rotation=(0, math.radians(90), 0))
fl.add_box("ira_tool_mount_block", (TOOL[0] + 0.045, 0.00, TOOL[2]), (0.070, 0.100, 0.055), MAT["stainless"], "structure_containment", MO)

# Controller cabinet containment panels.
fl.add_box("ira_cabinet_plinth", (CAB_X, CAB_Y, 0.050), (CAB_W + 0.08, CAB_D + 0.08, 0.10), MAT["powerdist"], "structure_containment", MO)
fl.add_box("ira_cabinet_left_panel", (CAB_X - CAB_W/2, CAB_Y, CAB_Z + 0.10), (0.025, CAB_D, CAB_H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("ira_cabinet_right_panel", (CAB_X + CAB_W/2, CAB_Y, CAB_Z + 0.10), (0.025, CAB_D, CAB_H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("ira_cabinet_back_panel", (CAB_X, CAB_Y + CAB_D/2, CAB_Z + 0.10), (CAB_W, 0.025, CAB_H), MAT["enclosure"], "structure_containment", MO)
fl.add_box("ira_cabinet_front_lower_door", (CAB_X, CAB_Y - CAB_D/2, 0.55), (CAB_W, 0.025, 0.90), MAT["enclosure"], "structure_containment", MO)
fl.add_box("ira_cabinet_front_upper_door", (CAB_X, CAB_Y - CAB_D/2, 1.35), (CAB_W, 0.025, 0.50), MAT["enclosure"], "structure_containment", MO)
fl.add_box("ira_cabinet_roof", (CAB_X, CAB_Y, CAB_H + 0.10), (CAB_W, CAB_D, 0.025), MAT["enclosure"], "structure_containment", MO)
fl.add_box("ira_cabinet_internal_rail_L", (CAB_X - 0.22, CAB_Y + 0.15, 0.85), (0.025, 0.035, 1.25), MAT["powerdist"], "structure_containment", MO)
fl.add_box("ira_cabinet_internal_rail_R", (CAB_X + 0.22, CAB_Y + 0.15, 0.85), (0.025, 0.035, 1.25), MAT["powerdist"], "structure_containment", MO)

# ═══════ Module — actuation_kinematics ═══════
# Bearings, harmonic drives, joint axes and wrist mechanics.
fl.add_torus("ira_base_slew_bearing", (0.50, 0.00, 0.235), 0.118, 0.010, MAT["gear_teal"], "actuation_kinematics", MO)
fl.add_torus("ira_shoulder_crossroller_bearing", SHOULDER, 0.135, 0.012, MAT["gear_teal"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_shoulder_harmonic_drive", (SHOULDER[0], -0.105, SHOULDER[2]), 0.088, 0.045, MAT["joint_orange"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_upper_arm_spine", (SHOULDER[0] + UPPER_VEC[0] * 0.50, 0.00, SHOULDER[2] + UPPER_VEC[2] * 0.50),
           (UPPER_LEN * 0.92, 0.045, 0.040), MAT["gear_teal"], "actuation_kinematics", MO, rotation=(0, THETA_UPPER, 0))
fl.add_cyl("ira_elbow_crossroller_bearing", ELBOW, 0.112, 0.155, MAT["gear_teal"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_elbow_harmonic_drive", (ELBOW[0], 0.095, ELBOW[2]), 0.076, 0.048, MAT["joint_orange"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_forearm_torque_tube", (ELBOW[0] + FORE_VEC[0] * 0.50, 0.00, ELBOW[2] + FORE_VEC[2] * 0.50),
           (FORE_LEN * 0.86, 0.040, 0.035), MAT["gear_teal"], "actuation_kinematics", MO, rotation=(0, THETA_FORE, 0))
fl.add_torus("ira_wrist_roll_bearing", WRIST, 0.060, 0.008, MAT["gear_teal"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
fl.add_torus("ira_wrist_pitch_bearing", (WRIST[0] + 0.055, 0.00, WRIST[2] + 0.018), 0.047, 0.007, MAT["gear_teal"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_torus("ira_wrist_yaw_bearing", (WRIST[0] + 0.105, 0.00, WRIST[2] + 0.020), 0.040, 0.006, MAT["gear_teal"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_tool_dowel_pin_A", (TOOL[0] + 0.018, 0.032, TOOL[2]), 0.006, 0.018, MAT["stainless"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_tool_dowel_pin_B", (TOOL[0] + 0.018, -0.032, TOOL[2]), 0.006, 0.018, MAT["stainless"], "actuation_kinematics", MO, rotation=(0, math.radians(90), 0))
fl.add_box("ira_gripper_left_finger", (TOOL[0] + 0.105, -0.045, TOOL[2] - 0.015), (0.120, 0.020, 0.035), MAT["gear_teal"], "actuation_kinematics", MO)
fl.add_box("ira_gripper_right_finger", (TOOL[0] + 0.105, 0.045, TOOL[2] - 0.015), (0.120, 0.020, 0.035), MAT["gear_teal"], "actuation_kinematics", MO)

# ═══════ Module — energy_conversion_transduction ═══════
# Six servo motors plus cabinet drive packs, PSU and regeneration resistor.
fl.add_cyl("ira_axis1_servo_motor", (0.50, 0.00, 0.075), 0.095, 0.110, MAT["servo_blue"], "energy_conversion_transduction", MO)
fl.add_cyl("ira_axis2_servo_motor", (SHOULDER[0], 0.145, SHOULDER[2]), 0.082, 0.105, MAT["servo_blue"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis3_servo_motor", (ELBOW[0], -0.135, ELBOW[2]), 0.070, 0.095, MAT["servo_blue"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis4_servo_motor", (WRIST[0] - 0.030, 0.000, WRIST[2]), 0.050, 0.090, MAT["servo_blue"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_axis5_servo_motor", (WRIST[0] + 0.052, 0.070, WRIST[2] + 0.018), 0.038, 0.065, MAT["servo_blue"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis6_servo_motor", (WRIST[0] + 0.125, 0.000, WRIST[2] + 0.020), 0.032, 0.055, MAT["servo_blue"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
for i in range(6):
    fl.add_box(f"ira_servo_drive_pack_{i+1}", (CAB_X - 0.18 + (i % 2) * 0.22, CAB_Y + 0.08, 0.45 + (i // 2) * 0.24),
               (0.18, 0.11, 0.16), MAT["inverter"], "energy_conversion_transduction", MO)
fl.add_box("ira_24v_aux_psu", (CAB_X + 0.20, CAB_Y + 0.08, 1.20), (0.16, 0.10, 0.12), MAT["motor"], "energy_conversion_transduction", MO)
fl.add_box("ira_regen_brake_resistor", (CAB_X - 0.20, CAB_Y + 0.10, 1.22), (0.18, 0.08, 0.18), MAT["thermal"], "energy_conversion_transduction", MO)
fl.add_box("ira_line_filter_module", (CAB_X, CAB_Y + 0.11, 0.22), (0.28, 0.08, 0.10), MAT["aluminium"], "energy_conversion_transduction", MO)

# ═══════ Module — sensing_instrumentation ═══════
# Absolute encoders, torque sensing, vision and cabinet monitoring sensors.
fl.add_cyl("ira_axis1_abs_encoder", (0.50, 0.00, 0.248), 0.045, 0.018, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_cyl("ira_axis2_abs_encoder", (SHOULDER[0], -0.155, SHOULDER[2]), 0.035, 0.018, MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis3_abs_encoder", (ELBOW[0], 0.145, ELBOW[2]), 0.030, 0.018, MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis4_abs_encoder", (WRIST[0] - 0.078, 0.000, WRIST[2]), 0.025, 0.015, MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_axis5_abs_encoder", (WRIST[0] + 0.052, -0.070, WRIST[2] + 0.018), 0.022, 0.014, MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis6_abs_encoder", (WRIST[0] + 0.162, 0.000, WRIST[2] + 0.020), 0.019, 0.012, MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
fl.add_torus("ira_base_torque_sensor", (0.50, 0.00, 0.260), 0.075, 0.006, MAT["sensor"], "sensing_instrumentation", MO)
fl.add_torus("ira_elbow_torque_sensor", ELBOW, 0.085, 0.006, MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_wrist_force_torque_sensor", (TOOL[0] - 0.015, 0.00, TOOL[2]), (0.030, 0.085, 0.045), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("ira_tool_vision_camera", (TOOL[0] + 0.030, -0.070, TOOL[2] + 0.030), (0.050, 0.035, 0.030), MAT["lens"], "sensing_instrumentation", MO)
fl.add_cyl("ira_tool_camera_lens", (TOOL[0] + 0.030, -0.091, TOOL[2] + 0.030), 0.013, 0.010, MAT["sensor"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_cabinet_temp_sensor", (CAB_X + 0.24, CAB_Y - 0.17, 1.10), (0.035, 0.010, 0.035), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_box("ira_door_limit_switch", (CAB_X - 0.27, CAB_Y - 0.195, 1.00), (0.030, 0.012, 0.035), MAT["sensor"], "sensing_instrumentation", MO)

# ═══════ Module — control_compute_communication ═══════
# Robot CPU, motion control, fieldbus, wireless and teach-pendant control PCB.
fl.add_box("ira_main_robot_cpu", (CAB_X - 0.18, CAB_Y - 0.13, 1.22), (0.20, 0.018, 0.16), MAT["control"], "control_compute_communication", MO)
fl.add_box("ira_motion_control_board", (CAB_X + 0.06, CAB_Y - 0.13, 1.22), (0.22, 0.018, 0.16), MAT["control"], "control_compute_communication", MO)
fl.add_box("ira_safety_plc_logic_board", (CAB_X + 0.21, CAB_Y - 0.13, 0.94), (0.12, 0.018, 0.12), MAT["fc"], "control_compute_communication", MO)
fl.add_box("ira_fieldbus_io_slice_A", (CAB_X - 0.20, CAB_Y - 0.13, 0.95), (0.055, 0.020, 0.120), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("ira_fieldbus_io_slice_B", (CAB_X - 0.13, CAB_Y - 0.13, 0.95), (0.055, 0.020, 0.120), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("ira_fieldbus_io_slice_C", (CAB_X - 0.06, CAB_Y - 0.13, 0.95), (0.055, 0.020, 0.120), MAT["pcb"], "control_compute_communication", MO)
fl.add_box("ira_ethernet_switch", (CAB_X + 0.19, CAB_Y - 0.13, 1.08), (0.12, 0.020, 0.060), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("ira_wifi_antenna", (CAB_X + 0.26, CAB_Y - 0.14, 1.55), 0.006, 0.140, MAT["antenna"], "control_compute_communication", MO)
fl.add_box("ira_pendant_internal_pcb", (CAB_X - 0.42, CAB_Y - 0.44, 0.99), (0.090, 0.010, 0.150), MAT["control"], "control_compute_communication", MO)
fl.add_box("ira_diagnostic_gateway", (CAB_X + 0.20, CAB_Y - 0.13, 0.78), (0.13, 0.020, 0.070), MAT["fc"], "control_compute_communication", MO)

# ═══════ Module — safety_protection ═══════
# E-stops, safety relay, contactors, brakes, light-curtain posts and warning beacon.
fl.add_cyl("ira_cabinet_mushroom_estop", (CAB_X, CAB_Y - 0.20, 1.55), 0.040, 0.026, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_pendant_estop", (CAB_X - 0.42, CAB_Y - 0.465, 1.08), 0.028, 0.018, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_safety_relay_block", (CAB_X - 0.20, CAB_Y + 0.08, 0.88), (0.16, 0.10, 0.12), MAT["safety"], "safety_protection", MO)
fl.add_box("ira_dual_channel_contactor_A", (CAB_X + 0.10, CAB_Y + 0.08, 0.82), (0.10, 0.09, 0.14), MAT["safety"], "safety_protection", MO)
fl.add_box("ira_dual_channel_contactor_B", (CAB_X + 0.22, CAB_Y + 0.08, 0.82), (0.10, 0.09, 0.14), MAT["safety"], "safety_protection", MO)
fl.add_cyl("ira_axis2_fail_safe_brake", (SHOULDER[0], 0.205, SHOULDER[2]), 0.055, 0.026, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis3_fail_safe_brake", (ELBOW[0], -0.195, ELBOW[2]), 0.050, 0.026, MAT["safety"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
for i, x in enumerate([0.06, 0.94]):
    fl.add_cyl(f"ira_light_curtain_post_{i}", (x, -0.46, 0.70), 0.018, 1.30, MAT["safety"], "safety_protection", MO)
    fl.add_box(f"ira_light_curtain_receiver_{i}", (x, -0.46, 0.70), (0.030, 0.020, 1.00), MAT["sensor"], "safety_protection", MO)
fl.add_cyl("ira_three_colour_beacon_red", (CAB_X + 0.20, CAB_Y, 1.66), 0.028, 0.032, MAT["safety"], "safety_protection", MO)
fl.add_cyl("ira_three_colour_beacon_amber", (CAB_X + 0.20, CAB_Y, 1.70), 0.028, 0.032, MAT["maint"], "safety_protection", MO)
fl.add_cyl("ira_three_colour_beacon_green", (CAB_X + 0.20, CAB_Y, 1.74), 0.028, 0.032, MAT["sensor"], "safety_protection", MO)

# ═══════ Module — power_distribution ═══════
# Mains input, DC bus, cabinet harness, arm cable carrier and tool power.
for i, z in enumerate([0.24, 0.28, 0.32]):
    fl.add_box(f"ira_three_phase_input_busbar_{i}", (CAB_X - 0.12 + i * 0.12, CAB_Y + 0.145, z), (0.090, 0.018, 0.014), MAT["copper"], "power_distribution", MO)
fl.add_box("ira_dc_bus_positive", (CAB_X - 0.05, CAB_Y + 0.145, 0.60), (0.36, 0.018, 0.014), MAT["copper"], "power_distribution", MO)
fl.add_box("ira_dc_bus_negative", (CAB_X - 0.05, CAB_Y + 0.145, 0.64), (0.36, 0.018, 0.014), MAT["copper"], "power_distribution", MO)
fl.add_box("ira_main_disconnect_switch", (CAB_X + 0.24, CAB_Y - 0.205, 1.30), (0.060, 0.020, 0.090), MAT["powerdist"], "power_distribution", MO)
fl.add_cyl("ira_cabinet_to_base_cable", (0.88, -0.21, 0.10), 0.024, 0.72, MAT["cable_black"], "power_distribution", MO, rotation=(0, math.radians(82), math.radians(18)))
fl.add_cyl("ira_base_cable_exit_gland", (0.64, -0.08, 0.18), 0.035, 0.035, MAT["rubber"], "power_distribution", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_axis1_cable_loop", (0.48, -0.145, 0.30), (0.080, 0.030, 0.150), MAT["cable_black"], "power_distribution", MO)
fl.add_box("ira_upper_arm_cable_carrier", (SHOULDER[0] + UPPER_VEC[0] * 0.50, -0.105, SHOULDER[2] + UPPER_VEC[2] * 0.50),
           (UPPER_LEN * 0.82, 0.035, 0.032), MAT["cable_black"], "power_distribution", MO, rotation=(0, THETA_UPPER, 0))
fl.add_box("ira_forearm_cable_carrier", (ELBOW[0] + FORE_VEC[0] * 0.50, -0.095, ELBOW[2] + FORE_VEC[2] * 0.50),
           (FORE_LEN * 0.82, 0.030, 0.030), MAT["cable_black"], "power_distribution", MO, rotation=(0, THETA_FORE, 0))
fl.add_cyl("ira_wrist_cable_service_loop", (WRIST[0] + 0.035, -0.075, WRIST[2] + 0.030), 0.018, 0.130, MAT["cable_black"], "power_distribution", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_tool_power_connector", (TOOL[0] + 0.025, 0.055, TOOL[2] + 0.020), (0.040, 0.026, 0.026), MAT["powerdist"], "power_distribution", MO)
fl.add_cyl("ira_tool_air_power_cable", (TOOL[0] + 0.070, 0.065, TOOL[2] + 0.010), 0.010, 0.110, MAT["cable_black"], "power_distribution", MO, rotation=(0, math.radians(82), 0))

# ═══════ Module — hmi_ergonomics ═══════
# Teach pendant, screen, keypad, status LEDs and user-facing cabinet controls.
fl.add_box("ira_teach_pendant_body", (CAB_X - 0.42, CAB_Y - 0.46, 1.00), (0.150, 0.035, 0.260), MAT["pendant_blue"], "hmi_ergonomics", MO)
fl.add_box("ira_teach_pendant_screen", (CAB_X - 0.42, CAB_Y - 0.482, 1.045), (0.105, 0.006, 0.085), MAT["screen_glass"], "hmi_ergonomics", MO)
fl.add_box("ira_pendant_grip_left", (CAB_X - 0.515, CAB_Y - 0.458, 0.99), (0.030, 0.030, 0.200), MAT["rubber"], "hmi_ergonomics", MO)
fl.add_box("ira_pendant_grip_right", (CAB_X - 0.325, CAB_Y - 0.458, 0.99), (0.030, 0.030, 0.200), MAT["rubber"], "hmi_ergonomics", MO)
for i in range(8):
    x = CAB_X - 0.455 + (i % 4) * 0.025
    z = 0.930 - (i // 4) * 0.030
    fl.add_cyl(f"ira_pendant_softkey_{i}", (x, CAB_Y - 0.486, z), 0.008, 0.006, MAT["hmi"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_pendant_jog_wheel", (CAB_X - 0.380, CAB_Y - 0.486, 0.915), 0.020, 0.007, MAT["maint"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_pendant_enable_switch", (CAB_X - 0.420, CAB_Y - 0.438, 0.875), 0.018, 0.018, MAT["safety"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_pendant_hanger_hook", (CAB_X - 0.42, CAB_Y - 0.405, 1.155), 0.020, 0.020, MAT["stainless"], "hmi_ergonomics", MO)
fl.add_cyl("ira_pendant_cable", (CAB_X - 0.31, CAB_Y - 0.35, 1.22), 0.010, 0.320, MAT["cable_black"], "hmi_ergonomics", MO, rotation=(math.radians(55), math.radians(0), math.radians(40)))
fl.add_box("ira_cabinet_hmi_status_panel", (CAB_X - 0.12, CAB_Y - 0.207, 1.30), (0.130, 0.010, 0.080), MAT["cabinet_dark"], "hmi_ergonomics", MO)
for i, mat in enumerate([MAT["sensor"], MAT["maint"], MAT["safety"]]):
    fl.add_cyl(f"ira_cabinet_status_led_{i}", (CAB_X - 0.155 + i * 0.035, CAB_Y - 0.214, 1.315), 0.010, 0.006, mat, "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_robot_nameplate", (0.50, -0.153, 0.145), (0.120, 0.006, 0.035), MAT["warning_white"], "hmi_ergonomics", MO)

# ═══════ Module — maintenance_serviceability ═══════
# Door handles, access panels, grease points, lifting lugs and calibration fiducials.
fl.add_box("ira_cabinet_door_handle", (CAB_X + 0.235, CAB_Y - 0.215, 0.92), (0.035, 0.018, 0.160), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("ira_cabinet_upper_door_handle", (CAB_X + 0.235, CAB_Y - 0.215, 1.34), (0.035, 0.018, 0.110), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("ira_base_service_hatch", (0.50, -0.154, 0.115), (0.120, 0.008, 0.070), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("ira_shoulder_service_cover", (SHOULDER[0] - 0.060, -0.160, SHOULDER[2] + 0.020), (0.070, 0.008, 0.060), MAT["maint"], "maintenance_serviceability", MO)
fl.add_box("ira_elbow_service_cover", (ELBOW[0] + 0.040, 0.142, ELBOW[2] + 0.010), (0.060, 0.008, 0.055), MAT["maint"], "maintenance_serviceability", MO)
for i, loc in enumerate([(0.44, 0.16, 0.24), (0.56, 0.16, 0.24), (ELBOW[0] - 0.050, -0.120, ELBOW[2]), (WRIST[0], 0.065, WRIST[2])]):
    fl.add_cyl(f"ira_grease_nipple_{i}", loc, 0.008, 0.014, MAT["maint"], "maintenance_serviceability", MO)
for i, x in enumerate([CAB_X - 0.22, CAB_X + 0.22]):
    fl.add_torus(f"ira_cabinet_lifting_eye_{i}", (x, CAB_Y, 1.64), 0.025, 0.005, MAT["maint"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_robot_lifting_boss", (0.50, 0.00, 0.270), 0.030, 0.020, MAT["maint"], "maintenance_serviceability", MO)
for i, loc in enumerate([(0.37, -0.18, 0.03), (0.63, -0.18, 0.03), (0.37, 0.18, 0.03), (0.63, 0.18, 0.03)]):
    fl.add_cyl(f"ira_anchor_bolt_access_{i}", loc, 0.018, 0.010, MAT["maint"], "maintenance_serviceability", MO)

# ═══════ Module — environmental_interface ═══════
# Cabinet cooling, vents, filters, seals, heat sink and cable strain relief.
fl.add_cyl("ira_cabinet_intake_fan", (CAB_X - 0.20, CAB_Y - 0.205, 0.42), 0.055, 0.018, MAT["ctrl_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_cabinet_exhaust_fan", (CAB_X + 0.20, CAB_Y - 0.205, 1.18), 0.055, 0.018, MAT["ctrl_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
for i in range(6):
    fl.add_box(f"ira_lower_intake_louvre_{i}", (CAB_X - 0.20, CAB_Y - 0.218, 0.34 + i * 0.025), (0.150, 0.006, 0.006), MAT["thermal"], "environmental_interface", MO)
for i in range(6):
    fl.add_box(f"ira_upper_exhaust_louvre_{i}", (CAB_X + 0.20, CAB_Y - 0.218, 1.10 + i * 0.025), (0.150, 0.006, 0.006), MAT["thermal"], "environmental_interface", MO)
fl.add_box("ira_drive_heatsink_backplate", (CAB_X, CAB_Y + 0.185, 0.80), (0.42, 0.020, 0.46), MAT["heatsink"], "environmental_interface", MO)
for i in range(8):
    fl.add_box(f"ira_drive_heatsink_fin_{i}", (CAB_X - 0.18 + i * 0.052, CAB_Y + 0.215, 0.80), (0.010, 0.040, 0.42), MAT["heatsink"], "environmental_interface", MO)
fl.add_torus("ira_base_ip_seal", (0.50, 0.00, 0.218), 0.128, 0.006, MAT["rubber"], "environmental_interface", MO)
fl.add_torus("ira_tool_ip_seal", TOOL, 0.048, 0.004, MAT["rubber"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))
fl.add_box("ira_cabinet_filter_mat", (CAB_X - 0.20, CAB_Y - 0.212, 0.42), (0.135, 0.006, 0.135), MAT["thermal"], "environmental_interface", MO)
fl.add_cyl("ira_cable_strain_relief", (CAB_X - 0.30, CAB_Y - 0.05, 0.20), 0.030, 0.040, MAT["rubber"], "environmental_interface", MO, rotation=(0, math.radians(90), 0))

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")