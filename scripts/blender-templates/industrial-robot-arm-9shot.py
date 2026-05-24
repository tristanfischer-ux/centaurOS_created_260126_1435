"""industrial-robot-arm-9shot.py — 6-DOF industrial robot arm + controller cabinet.

Source: regenerated after v3 review. Envelope 1.0 × 1.0 × 1.8 m. ABB IRB 1200
form factor: articulated upward/outward 6-axis arm on a bolted floor base, with
left-side controller cabinet and external teach pendant.

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
    "cabinet_shell": fl.make_mat("m_robot_cabinet_shell", (0.58, 0.60, 0.64), metallic=0.35, roughness=0.50),
    "skid": fl.make_mat("m_robot_skid", (0.22, 0.24, 0.28), metallic=0.55, roughness=0.45),
    "arm_yellow": fl.make_mat("m_robot_arm_yellow", (1.00, 0.72, 0.00), metallic=0.05, roughness=0.42),
    "joint_blue": fl.make_mat("m_robot_joint_blue", (0.00, 0.32, 1.00), metallic=0.25, roughness=0.36),
    "joint_dark": fl.make_mat("m_robot_joint_dark", (0.03, 0.05, 0.09), metallic=0.40, roughness=0.42),
    "drive_blue": fl.make_mat("m_robot_drive_blue", (0.00, 0.56, 1.00), metallic=0.20, roughness=0.36),
    "servo_purple": fl.make_mat("m_robot_servo_purple", (0.70, 0.00, 1.00), metallic=0.10, roughness=0.45),
    "heatsink_silver": fl.make_mat("m_robot_heatsink_silver", (0.88, 0.90, 0.94), metallic=0.75, roughness=0.28),
    "rubber_black": fl.make_mat("m_robot_rubber_black", (0.01, 0.015, 0.025), metallic=0.00, roughness=0.78),
    "pendant_case": fl.make_mat("m_robot_pendant_case", (0.02, 0.08, 0.18), metallic=0.20, roughness=0.45),
    "screen_blue": fl.make_mat("m_robot_screen_blue", (0.00, 0.42, 1.00), metallic=0.05, roughness=0.25),
    "status_green": fl.make_mat("m_robot_status_green", (0.00, 1.00, 0.16), metallic=0.00, roughness=0.40),
    "warning_red": fl.make_mat("m_robot_warning_red", (1.00, 0.00, 0.00), metallic=0.00, roughness=0.45),
    "cable_black": fl.make_mat("m_robot_cable_black", (0.015, 0.018, 0.025), metallic=0.00, roughness=0.82),
    "label_magenta": fl.make_mat("m_robot_label_magenta", (1.00, 0.02, 0.55), metallic=0.00, roughness=0.45),
    "fan_cyan": fl.make_mat("m_robot_fan_cyan", (0.00, 0.86, 1.00), metallic=0.12, roughness=0.35),
    "encoder_green": fl.make_mat("m_robot_encoder_green", (0.00, 1.00, 0.18), metallic=0.00, roughness=0.40),
    "tool_orange": fl.make_mat("m_robot_tool_orange", (1.00, 0.30, 0.00), metallic=0.12, roughness=0.35),
    "grease_pink": fl.make_mat("m_robot_grease_pink", (1.00, 0.05, 0.72), metallic=0.00, roughness=0.45),
    "copper_bright": fl.make_mat("m_robot_copper_bright", (1.00, 0.42, 0.00), metallic=0.25, roughness=0.35),
})


# ═══════ Module — structure_containment ═══════
CAB_X = 0.25
CAB_Y = -0.22
CAB_W = 0.40
CAB_D = 0.30
CAB_H = 1.40
CAB_Z = 0.75
WALL = 0.020

# Controller cabinet shell: six panels only, all ghostable in hero pass.
fl.add_box("ira_cabinet_floor_panel", (CAB_X, CAB_Y, 0.06), (CAB_W, CAB_D, WALL), MAT["cabinet_shell"], "structure_containment", MO)
fl.add_box("ira_cabinet_roof_panel", (CAB_X, CAB_Y, 1.44), (CAB_W, CAB_D, WALL), MAT["cabinet_shell"], "structure_containment", MO)
fl.add_box("ira_cabinet_left_panel", (CAB_X - CAB_W/2 + WALL/2, CAB_Y, CAB_Z), (WALL, CAB_D, CAB_H), MAT["cabinet_shell"], "structure_containment", MO)
fl.add_box("ira_cabinet_right_panel", (CAB_X + CAB_W/2 - WALL/2, CAB_Y, CAB_Z), (WALL, CAB_D, CAB_H), MAT["cabinet_shell"], "structure_containment", MO)
fl.add_box("ira_cabinet_back_panel", (CAB_X, CAB_Y + CAB_D/2 - WALL/2, CAB_Z), (CAB_W, WALL, CAB_H), MAT["cabinet_shell"], "structure_containment", MO)
fl.add_box("ira_cabinet_front_door_outer", (CAB_X, CAB_Y - CAB_D/2 + WALL/2, CAB_Z), (CAB_W, WALL, CAB_H), MAT["cabinet_shell"], "structure_containment", MO)

# Cabinet corner frame rails.
for ix, x in enumerate([CAB_X - CAB_W/2 + 0.025, CAB_X + CAB_W/2 - 0.025]):
    for iy, y in enumerate([CAB_Y - CAB_D/2 + 0.025, CAB_Y + CAB_D/2 - 0.025]):
        fl.add_box(f"ira_cabinet_corner_rail_{ix}_{iy}", (x, y, CAB_Z), (0.025, 0.025, CAB_H), MAT["skid"], "structure_containment", MO)

# Robot skid / bolted floor base, not the moving robot itself.
fl.add_box("ira_robot_floor_skid", (0.64, 0.12, 0.020), (0.42, 0.42, 0.040), MAT["skid"], "structure_containment", MO)
fl.add_box("ira_cabinet_floor_skid", (CAB_X, CAB_Y, 0.025), (0.46, 0.36, 0.050), MAT["skid"], "structure_containment", MO)
for i, (x, y) in enumerate([(0.48, -0.04), (0.80, -0.04), (0.48, 0.28), (0.80, 0.28)]):
    fl.add_cyl(f"ira_skid_anchor_bolt_{i}", (x, y, 0.055), 0.018, 0.012, MAT["heatsink_silver"], "structure_containment", MO)


# ═══════ Module — actuation_kinematics ═══════
ARM_Y = 0.12
BASE_X = 0.64
BASE_Z = 0.14
SHOULDER_Z = 0.38

# Axis 1 base: vertical rotary pedestal, clearly cylindrical and bolted.
fl.add_cyl("ira_axis1_base_rotary_cylinder", (BASE_X, ARM_Y, BASE_Z), 0.150, 0.200, MAT["joint_blue"], "actuation_kinematics", MO)
fl.add_cyl("ira_axis1_top_turntable", (BASE_X, ARM_Y, 0.250), 0.125, 0.050, MAT["joint_dark"], "actuation_kinematics", MO)
fl.add_cyl("ira_axis1_lower_bearing_ring", (BASE_X, ARM_Y, 0.050), 0.165, 0.030, MAT["joint_dark"], "actuation_kinematics", MO)

# Axis 2 shoulder: horizontal rotary cylinder above base.
fl.add_cyl("ira_axis2_shoulder_horizontal_joint", (BASE_X, ARM_Y, SHOULDER_Z), 0.125, 0.220, MAT["joint_blue"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis2_shoulder_left_cap", (BASE_X, ARM_Y - 0.125, SHOULDER_Z), 0.130, 0.018, MAT["joint_dark"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis2_shoulder_right_cap", (BASE_X, ARM_Y + 0.125, SHOULDER_Z), 0.130, 0.018, MAT["joint_dark"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))

# Upper arm: 500 mm rectangular link, steeply upward/outward so it reads as an arm.
UPPER_LEN = 0.50
UPPER_ANG = math.radians(60)
UPPER_START = (BASE_X, ARM_Y, SHOULDER_Z + 0.02)
ELBOW_X = UPPER_START[0] + UPPER_LEN * math.cos(UPPER_ANG)
ELBOW_Z = UPPER_START[2] + UPPER_LEN * math.sin(UPPER_ANG)
UPPER_CX = (UPPER_START[0] + ELBOW_X) / 2
UPPER_CZ = (UPPER_START[2] + ELBOW_Z) / 2
fl.add_box("ira_upper_arm_500mm_main_beam", (UPPER_CX, ARM_Y, UPPER_CZ), (UPPER_LEN, 0.150, 0.150), MAT["arm_yellow"], "actuation_kinematics", MO, rotation=(0, -UPPER_ANG, 0))
fl.add_box("ira_upper_arm_top_rib", (UPPER_CX, ARM_Y + 0.060, UPPER_CZ + 0.010), (UPPER_LEN * 0.92, 0.018, 0.115), MAT["joint_dark"], "actuation_kinematics", MO, rotation=(0, -UPPER_ANG, 0))
fl.add_box("ira_upper_arm_bottom_rib", (UPPER_CX, ARM_Y - 0.060, UPPER_CZ - 0.010), (UPPER_LEN * 0.92, 0.018, 0.115), MAT["joint_dark"], "actuation_kinematics", MO, rotation=(0, -UPPER_ANG, 0))

# Axis 3 elbow: vertical rotary joint at the end of the upper arm.
fl.add_cyl("ira_axis3_elbow_vertical_joint", (ELBOW_X, ARM_Y, ELBOW_Z), 0.100, 0.160, MAT["joint_blue"], "actuation_kinematics", MO)
fl.add_cyl("ira_axis3_elbow_top_bearing", (ELBOW_X, ARM_Y, ELBOW_Z + 0.090), 0.105, 0.020, MAT["joint_dark"], "actuation_kinematics", MO)
fl.add_cyl("ira_axis3_elbow_lower_bearing", (ELBOW_X, ARM_Y, ELBOW_Z - 0.090), 0.105, 0.020, MAT["joint_dark"], "actuation_kinematics", MO)

# Forearm: shorter 300 mm link, angled further upward/outward.
FORE_LEN = 0.28
FORE_ANG = math.radians(70)
WRIST_X = ELBOW_X + FORE_LEN * math.cos(FORE_ANG)
WRIST_Z = ELBOW_Z + FORE_LEN * math.sin(FORE_ANG)
FORE_CX = (ELBOW_X + WRIST_X) / 2
FORE_CZ = (ELBOW_Z + WRIST_Z) / 2
fl.add_box("ira_forearm_300mm_main_beam", (FORE_CX, ARM_Y, FORE_CZ), (FORE_LEN, 0.120, 0.120), MAT["arm_yellow"], "actuation_kinematics", MO, rotation=(0, -FORE_ANG, 0))
fl.add_box("ira_forearm_side_rib_left", (FORE_CX, ARM_Y - 0.050, FORE_CZ), (FORE_LEN * 0.86, 0.014, 0.090), MAT["joint_dark"], "actuation_kinematics", MO, rotation=(0, -FORE_ANG, 0))
fl.add_box("ira_forearm_side_rib_right", (FORE_CX, ARM_Y + 0.050, FORE_CZ), (FORE_LEN * 0.86, 0.014, 0.090), MAT["joint_dark"], "actuation_kinematics", MO, rotation=(0, -FORE_ANG, 0))

# Axis 4/5/6 wrist stack: three differentiated small rotary cylinders plus flange.
fl.add_cyl("ira_axis4_wrist_roll_cylinder", (WRIST_X - 0.020, ARM_Y, WRIST_Z - 0.055), 0.045, 0.105, MAT["joint_blue"], "actuation_kinematics", MO, rotation=(0, math.radians(20), 0))
fl.add_cyl("ira_axis5_wrist_pitch_cylinder", (WRIST_X - 0.004, ARM_Y, WRIST_Z - 0.012), 0.040, 0.115, MAT["joint_dark"], "actuation_kinematics", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis6_wrist_yaw_cylinder", (WRIST_X, ARM_Y, WRIST_Z + 0.040), 0.038, 0.080, MAT["joint_blue"], "actuation_kinematics", MO)
fl.add_cyl("ira_tool_flange_disc_100mm", (WRIST_X + 0.008, ARM_Y, WRIST_Z + 0.070), 0.050, 0.035, MAT["tool_orange"], "actuation_kinematics", MO, rotation=(0, math.radians(20), 0))
fl.add_cyl("ira_tool_flange_centre_bore", (WRIST_X + 0.012, ARM_Y, WRIST_Z + 0.094), 0.018, 0.020, MAT["joint_dark"], "actuation_kinematics", MO, rotation=(0, math.radians(20), 0))

# Link-side gearbox housings to reinforce the mechanical arm silhouette.
fl.add_box("ira_shoulder_gearbox_box", (BASE_X - 0.055, ARM_Y, SHOULDER_Z - 0.105), (0.110, 0.160, 0.085), MAT["joint_dark"], "actuation_kinematics", MO)
fl.add_box("ira_elbow_gearbox_box", (ELBOW_X - 0.035, ARM_Y, ELBOW_Z - 0.120), (0.095, 0.130, 0.070), MAT["joint_dark"], "actuation_kinematics", MO, rotation=(0, -math.radians(20), 0))
fl.add_box("ira_wrist_casting_block", (WRIST_X - 0.025, ARM_Y, WRIST_Z + 0.010), (0.075, 0.095, 0.085), MAT["arm_yellow"], "actuation_kinematics", MO)


# ═══════ Module — energy_conversion_transduction ═══════
# Six servo drive modules in the cabinet, each with visible heatsink fins.
drive_zs = [0.32, 0.47, 0.62, 0.77, 0.92, 1.07]
for i, z in enumerate(drive_zs):
    x = 0.145 if i % 2 == 0 else 0.295
    fl.add_box(f"ira_servo_drive_{i+1}", (x, CAB_Y - 0.010, z), (0.105, 0.155, 0.080), MAT["drive_blue"], "energy_conversion_transduction", MO)
    for f in range(4):
        fl.add_box(f"ira_servo_drive_{i+1}_heatsink_fin_{f}", (x - 0.039 + f * 0.026, CAB_Y - 0.095, z + 0.004), (0.006, 0.035, 0.070), MAT["heatsink_silver"], "energy_conversion_transduction", MO)

# Servo motor bodies at robot joints.
fl.add_cyl("ira_axis1_servo_motor", (BASE_X + 0.105, ARM_Y, 0.225), 0.055, 0.105, MAT["servo_purple"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_axis2_servo_motor", (BASE_X + 0.110, ARM_Y, SHOULDER_Z), 0.052, 0.105, MAT["servo_purple"], "energy_conversion_transduction", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_axis3_servo_motor", (ELBOW_X, ARM_Y + 0.095, ELBOW_Z), 0.045, 0.080, MAT["servo_purple"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis4_servo_motor", (WRIST_X - 0.048, ARM_Y, WRIST_Z - 0.030), 0.032, 0.065, MAT["servo_purple"], "energy_conversion_transduction", MO, rotation=(0, math.radians(20), 0))
fl.add_cyl("ira_axis5_servo_motor", (WRIST_X, ARM_Y + 0.060, WRIST_Z + 0.008), 0.030, 0.060, MAT["servo_purple"], "energy_conversion_transduction", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis6_servo_motor", (WRIST_X, ARM_Y, WRIST_Z + 0.092), 0.028, 0.050, MAT["servo_purple"], "energy_conversion_transduction", MO)


# ═══════ Module — sensing_instrumentation ═══════
# Absolute encoders and process sensors at each axis.
fl.add_cyl("ira_axis1_absolute_encoder", (BASE_X - 0.108, ARM_Y, 0.225), 0.030, 0.030, MAT["encoder_green"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_axis2_absolute_encoder", (BASE_X - 0.115, ARM_Y, SHOULDER_Z), 0.030, 0.030, MAT["encoder_green"], "sensing_instrumentation", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_axis3_absolute_encoder", (ELBOW_X, ARM_Y - 0.095, ELBOW_Z), 0.028, 0.030, MAT["encoder_green"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis4_absolute_encoder", (WRIST_X - 0.058, ARM_Y, WRIST_Z - 0.060), 0.020, 0.024, MAT["encoder_green"], "sensing_instrumentation", MO, rotation=(0, math.radians(20), 0))
fl.add_cyl("ira_axis5_absolute_encoder", (WRIST_X, ARM_Y - 0.058, WRIST_Z + 0.008), 0.020, 0.024, MAT["encoder_green"], "sensing_instrumentation", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis6_absolute_encoder", (WRIST_X, ARM_Y, WRIST_Z + 0.126), 0.018, 0.022, MAT["encoder_green"], "sensing_instrumentation", MO)
fl.add_box("ira_tool_flange_force_torque_sensor", (WRIST_X + 0.014, ARM_Y, WRIST_Z + 0.110), (0.040, 0.070, 0.018), MAT["sensor"], "sensing_instrumentation", MO, rotation=(0, -FORE_ANG, 0))
fl.add_box("ira_cabinet_temperature_sensor", (0.405, CAB_Y + 0.080, 1.180), (0.025, 0.020, 0.025), MAT["sensor"], "sensing_instrumentation", MO)
fl.add_sphere("ira_base_home_switch", (BASE_X - 0.060, ARM_Y + 0.125, 0.075), 0.018, MAT["encoder_green"], "sensing_instrumentation", MO)
fl.add_sphere("ira_elbow_home_switch", (ELBOW_X + 0.055, ARM_Y + 0.065, ELBOW_Z + 0.035), 0.014, MAT["encoder_green"], "sensing_instrumentation", MO)


# ═══════ Module — control_compute_communication ═══════
# Robot controller PCB stack and fieldbus electronics in cabinet.
for i, z in enumerate([0.42, 0.52, 0.62, 0.72]):
    fl.add_box(f"ira_controller_pcb_stack_{i}", (0.380, CAB_Y + 0.030, z), (0.010, 0.180, 0.070), MAT["control"], "control_compute_communication", MO)
    fl.add_box(f"ira_controller_pcb_connector_{i}", (0.371, CAB_Y - 0.075, z), (0.012, 0.020, 0.050), MAT["copper_bright"], "control_compute_communication", MO)

fl.add_box("ira_motion_cpu_module", (0.380, CAB_Y + 0.030, 0.875), (0.012, 0.170, 0.115), MAT["control"], "control_compute_communication", MO)
fl.add_box("ira_safety_plc_interface_board", (0.380, CAB_Y + 0.030, 1.020), (0.012, 0.150, 0.090), MAT["control"], "control_compute_communication", MO)
fl.add_box("ira_ethercat_gateway", (0.380, CAB_Y + 0.030, 1.145), (0.012, 0.130, 0.070), MAT["control"], "control_compute_communication", MO)
fl.add_box("ira_robot_io_terminal_strip", (0.240, CAB_Y + 0.100, 1.250), (0.180, 0.030, 0.050), MAT["control"], "control_compute_communication", MO)
fl.add_cyl("ira_cabinet_wifi_antenna", (0.420, CAB_Y - 0.055, 1.365), 0.006, 0.120, MAT["antenna"], "control_compute_communication", MO)
fl.add_box("ira_teach_pendant_interface_socket", (0.105, CAB_Y - 0.158, 0.890), (0.060, 0.012, 0.045), MAT["control"], "control_compute_communication", MO)


# ═══════ Module — safety_protection ═══════
# E-stop on top of controller cabinet plus robot protective sensors.
fl.add_cyl("ira_cabinet_top_estop_red_mushroom", (CAB_X, CAB_Y - 0.055, 1.485), 0.038, 0.038, MAT["warning_red"], "safety_protection", MO)
fl.add_cyl("ira_cabinet_top_estop_yellow_collar", (CAB_X, CAB_Y - 0.055, 1.455), 0.046, 0.015, MAT["fc"], "safety_protection", MO)
fl.add_box("ira_safety_relay_red_module", (0.130, CAB_Y + 0.070, 1.175), (0.080, 0.065, 0.120), MAT["warning_red"], "safety_protection", MO)
fl.add_box("ira_brake_contactor_bank", (0.130, CAB_Y + 0.070, 1.020), (0.085, 0.060, 0.090), MAT["warning_red"], "safety_protection", MO)
fl.add_box("ira_axis1_mechanical_stop", (BASE_X + 0.125, ARM_Y + 0.085, 0.080), (0.045, 0.025, 0.040), MAT["warning_red"], "safety_protection", MO)
fl.add_box("ira_axis2_limit_stop", (BASE_X + 0.080, ARM_Y - 0.120, SHOULDER_Z + 0.055), (0.035, 0.025, 0.030), MAT["warning_red"], "safety_protection", MO)
fl.add_box("ira_elbow_limit_stop", (ELBOW_X - 0.060, ARM_Y - 0.070, ELBOW_Z + 0.045), (0.035, 0.025, 0.030), MAT["warning_red"], "safety_protection", MO)
fl.add_cyl("ira_pendant_deadman_switch", (0.150, -0.485, 0.715), 0.020, 0.012, MAT["warning_red"], "safety_protection", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_protective_stop_input_block", (0.105, CAB_Y + 0.090, 0.875), (0.070, 0.055, 0.055), MAT["warning_red"], "safety_protection", MO)


# ═══════ Module — power_distribution ═══════
# Cabinet power supply, busbars, braking resistor, and robot umbilical.
fl.add_box("ira_24v_power_supply", (0.140, CAB_Y + 0.065, 0.780), (0.095, 0.070, 0.090), MAT["powerdist"], "power_distribution", MO)
fl.add_box("ira_dc_busbar_positive", (0.250, CAB_Y + 0.115, 0.205), (0.260, 0.015, 0.018), MAT["copper_bright"], "power_distribution", MO)
fl.add_box("ira_dc_busbar_negative", (0.250, CAB_Y + 0.090, 0.165), (0.260, 0.015, 0.018), MAT["copper_bright"], "power_distribution", MO)
for i, z in enumerate([0.290, 0.335, 0.380]):
    fl.add_box(f"ira_three_phase_input_busbar_{i}", (0.250, CAB_Y + 0.110, z), (0.240, 0.012, 0.014), MAT["copper_bright"], "power_distribution", MO)

fl.add_box("ira_brake_resistor_block", (0.135, CAB_Y + 0.060, 0.560), (0.090, 0.060, 0.065), MAT["powerdist"], "power_distribution", MO)
fl.add_cyl("ira_robot_power_umbilical_floor_run", (0.520, -0.050, 0.105), 0.018, 0.260, MAT["cable_black"], "power_distribution", MO, rotation=(0, math.radians(90), 0))
fl.add_cyl("ira_robot_power_umbilical_vertical_loop", (0.590, 0.035, 0.245), 0.015, 0.270, MAT["cable_black"], "power_distribution", MO)
fl.add_cyl("ira_robot_power_umbilical_to_shoulder", (0.620, 0.085, 0.335), 0.013, 0.160, MAT["cable_black"], "power_distribution", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_pendant_cable_drop", (0.150, -0.430, 0.885), 0.010, 0.300, MAT["cable_black"], "power_distribution", MO)
fl.add_cyl("ira_pendant_cable_to_cabinet", (0.150, -0.350, 0.890), 0.010, 0.230, MAT["cable_black"], "power_distribution", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_cable_gland_power_entry", (0.455, CAB_Y - 0.060, 0.145), (0.025, 0.050, 0.035), MAT["cable_black"], "power_distribution", MO)


# ═══════ Module — hmi_ergonomics ═══════
# External teach pendant on cable, just outside the front of the cell.
fl.add_box("ira_teach_pendant_body", (0.150, -0.485, 0.850), (0.155, 0.030, 0.270), MAT["pendant_case"], "hmi_ergonomics", MO)
fl.add_box("ira_teach_pendant_screen", (0.150, -0.503, 0.900), (0.115, 0.006, 0.125), MAT["screen_blue"], "hmi_ergonomics", MO)
for i, x in enumerate([0.110, 0.150, 0.190]):
    fl.add_cyl(f"ira_pendant_softkey_{i}", (x, -0.506, 0.790), 0.012, 0.006, MAT["status_green"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
for i, x in enumerate([0.115, 0.150, 0.185]):
    fl.add_cyl(f"ira_pendant_jog_key_{i}", (x, -0.506, 0.740), 0.011, 0.006, MAT["hmi"], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))

# Cabinet indicators and operator status strip.
for i, (mat_key, z) in enumerate([("status_green", 1.285), ("fc", 1.225), ("warning_red", 1.165)]):
    fl.add_cyl(f"ira_cabinet_status_lamp_{i}", (0.340, CAB_Y - 0.158, z), 0.014, 0.008, MAT[mat_key], "hmi_ergonomics", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_cabinet_small_hmi_display", (0.250, CAB_Y - 0.160, 1.300), (0.110, 0.006, 0.060), MAT["screen_blue"], "hmi_ergonomics", MO)
fl.add_box("ira_pendant_hand_grip", (0.150, -0.470, 0.685), (0.090, 0.025, 0.055), MAT["rubber_black"], "hmi_ergonomics", MO)


# ═══════ Module — maintenance_serviceability ═══════
# Handles, access labels, grease points, lifting eye and calibration marks.
fl.add_box("ira_cabinet_front_door_handle", (0.405, CAB_Y - 0.165, 0.880), (0.025, 0.020, 0.180), MAT["label_magenta"], "maintenance_serviceability", MO)
fl.add_box("ira_cabinet_service_latch_upper", (0.075, CAB_Y - 0.165, 1.185), (0.040, 0.014, 0.030), MAT["label_magenta"], "maintenance_serviceability", MO)
fl.add_box("ira_cabinet_service_latch_lower", (0.075, CAB_Y - 0.165, 0.375), (0.040, 0.014, 0.030), MAT["label_magenta"], "maintenance_serviceability", MO)
for i, z in enumerate([0.470, 0.540, 0.610]):
    fl.add_box(f"ira_cabinet_warning_label_{i}", (0.250, CAB_Y - 0.166, z), (0.120, 0.004, 0.035), MAT["label_magenta"], "maintenance_serviceability", MO)

fl.add_cyl("ira_cabinet_lifting_eye_left", (0.145, CAB_Y, 1.500), 0.020, 0.020, MAT["label_magenta"], "maintenance_serviceability", MO)
fl.add_cyl("ira_cabinet_lifting_eye_right", (0.355, CAB_Y, 1.500), 0.020, 0.020, MAT["label_magenta"], "maintenance_serviceability", MO)
fl.add_cyl("ira_axis1_grease_nipple", (BASE_X - 0.065, ARM_Y - 0.120, 0.120), 0.010, 0.018, MAT["grease_pink"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis2_grease_nipple", (BASE_X - 0.070, ARM_Y - 0.130, SHOULDER_Z + 0.020), 0.009, 0.018, MAT["grease_pink"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis3_grease_nipple", (ELBOW_X - 0.040, ARM_Y - 0.092, ELBOW_Z + 0.020), 0.008, 0.016, MAT["grease_pink"], "maintenance_serviceability", MO, rotation=(math.radians(90), 0, 0))
fl.add_box("ira_elbow_calibration_tick", (ELBOW_X + 0.025, ARM_Y - 0.102, ELBOW_Z + 0.075), (0.045, 0.006, 0.010), MAT["label_magenta"], "maintenance_serviceability", MO)
fl.add_box("ira_wrist_zero_mark", (WRIST_X - 0.012, ARM_Y - 0.058, WRIST_Z + 0.052), (0.030, 0.005, 0.008), MAT["label_magenta"], "maintenance_serviceability", MO)


# ═══════ Module — environmental_interface ═══════
# Cabinet fan/filter, arm seals and IP-rated cable gland interfaces.
fl.add_box("ira_cabinet_filter_grille_frame", (0.135, CAB_Y - 0.166, 0.245), (0.120, 0.006, 0.090), MAT["fan_cyan"], "environmental_interface", MO)
for i in range(5):
    fl.add_box(f"ira_cabinet_filter_louver_{i}", (0.135, CAB_Y - 0.171, 0.215 + i * 0.016), (0.105, 0.004, 0.004), MAT["rubber_black"], "environmental_interface", MO)

fl.add_cyl("ira_cabinet_exhaust_fan", (0.365, CAB_Y + 0.139, 1.245), 0.050, 0.012, MAT["fan_cyan"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
for i, a in enumerate([0, math.pi / 2, math.pi, 3 * math.pi / 2]):
    fl.add_box(f"ira_exhaust_fan_blade_{i}", (0.365 + 0.020 * math.cos(a), CAB_Y + 0.133, 1.245 + 0.020 * math.sin(a)), (0.006, 0.006, 0.040), MAT["rubber_black"], "environmental_interface", MO, rotation=(0, a, 0))

fl.add_cyl("ira_axis1_rubber_seal", (BASE_X, ARM_Y, 0.265), 0.132, 0.012, MAT["rubber_black"], "environmental_interface", MO)
fl.add_cyl("ira_axis2_rubber_seal_left", (BASE_X, ARM_Y - 0.139, SHOULDER_Z), 0.118, 0.010, MAT["rubber_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_axis2_rubber_seal_right", (BASE_X, ARM_Y + 0.139, SHOULDER_Z), 0.118, 0.010, MAT["rubber_black"], "environmental_interface", MO, rotation=(math.radians(90), 0, 0))
fl.add_cyl("ira_elbow_rubber_seal", (ELBOW_X, ARM_Y, ELBOW_Z + 0.112), 0.095, 0.010, MAT["rubber_black"], "environmental_interface", MO)
fl.add_box("ira_wrist_dust_boot", (WRIST_X - 0.026, ARM_Y, WRIST_Z - 0.020), (0.060, 0.088, 0.050), MAT["rubber_black"], "environmental_interface", MO, rotation=(0, -FORE_ANG, 0))
fl.add_box("ira_cabinet_acoustic_foam_panel", (0.250, CAB_Y + 0.128, 0.760), (0.300, 0.008, 0.840), MAT["fan_cyan"], "environmental_interface", MO)

fl.add_lights(target_centre=(W/2,0,H/2),fill_energy=200,fill_size=10); fl.make_world_white(); fl.run_render_pipeline(OUT, MO, structure_module_id="structure_containment")