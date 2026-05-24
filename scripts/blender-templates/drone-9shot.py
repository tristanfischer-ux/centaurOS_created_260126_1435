"""drone-9shot.py — consumer cinematography drone, full-fat Blender geometry +
universal 9-shot camera grammar (top + 4 sides + 4 corners) + 1 Option 2 hero.

Source spec: bess-iter/iter-64-drone-v4/container/state.json
Folded envelope 225 x 120 x 90 mm. Unfolded rotor tip to rotor tip: 350 mm.
Mass <= 0.899 kg. 4S LiPo 14.8 V 74 Wh. 1-inch CMOS gimbal. Carbon-fibre frame.

11 modules per the brief — geometry built to show each module's typical
sub-modules in their correct spatial position. Renders in UNFOLDED operational
form (motors visible, gimbal deployed, propellers attached) — engineering
report aesthetic, not folded marketing shot.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P drone-9shot.py
"""
import bpy
import os
import math
import mathutils
from pathlib import Path

bpy.ops.wm.read_factory_settings(use_empty=True)

POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-drone-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

# Scale: 1 Blender unit = 1 metre. Drone envelope ~0.35 m unfolded.
DRONE_X = 0.0
DRONE_Y = 0.0
DRONE_Z = 0.06  # chassis top sits at z=0.06 m above ground

# Arm tip positions in X-configuration (rotor tips ±0.155 m from drone centre)
ARM_HALF = 0.155 / math.sqrt(2)  # = 0.1096 m along each axis

# Handset (remote controller) sits to the right of the drone at +Y
HANDSET_X = 0.0
HANDSET_Y = 0.42
HANDSET_Z = 0.04

MODULE_OBJECTS: dict = {k: [] for k in [
    "structure_containment", "energy_storage_source", "energy_conversion_transduction",
    "actuation_kinematics", "sensing_instrumentation", "control_compute_communication",
    "power_distribution", "safety_protection", "environmental_interface",
    "maintenance_serviceability", "hmi_ergonomics",
]}


def make_mat(name, rgb, metallic=0.0, roughness=0.55, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, alpha)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    return mat


# Module palette — same identity colours as BESS so cross-product PDFs read
# consistently. structure_containment = carbon-fibre dark grey.
MAT = {
    # Pure-pigment refresh 2026-05-17 per Tristan: each identity colour at the
    # pigment edge (one channel at 1.0, others near 0). Yellow replaced with
    # amber (FC) and magenta (maint) — pure yellow on white is unreadable due
    # to luminance similarity, regardless of saturation. Distinct hues across
    # modules so no two reads alike.
    "carbon":     make_mat("m_carbon",   (0.18, 0.20, 0.24), metallic=0.2, roughness=0.55),
    "battery":    make_mat("m_battery",  (0.02, 0.18, 0.95), metallic=0.0, roughness=0.45),
    "motor":      make_mat("m_motor",    (0.15, 0.50, 1.00), metallic=0.1, roughness=0.4),
    "rotor_cap":  make_mat("m_rotor",    (1.00, 0.30, 0.00), metallic=0.0, roughness=0.4),
    "prop":       make_mat("m_prop",     (0.12, 0.14, 0.18), metallic=0.0, roughness=0.6),
    "gimbal":     make_mat("m_gimbal",   (0.00, 0.55, 0.65), metallic=0.1, roughness=0.45),
    "lens":       make_mat("m_lens",     (0.02, 0.04, 0.10), metallic=0.4, roughness=0.2),
    "sensor":     make_mat("m_sensing",  (0.00, 0.92, 0.10), metallic=0.0, roughness=0.5),
    "pcb":        make_mat("m_pcb",      (0.00, 0.75, 0.15), metallic=0.0, roughness=0.5),
    "fc":         make_mat("m_fc",       (1.00, 0.55, 0.00), metallic=0.0, roughness=0.5),  # AMBER
    "powerdist":  make_mat("m_pdist",    (0.62, 0.05, 0.95), metallic=0.0, roughness=0.5),
    "copper":     make_mat("m_copper",   (1.00, 0.45, 0.00), metallic=0.1, roughness=0.4),
    "aluminium":  make_mat("m_alu",      (0.45, 0.70, 0.95), metallic=0.1, roughness=0.4),
    "safety":     make_mat("m_safety",   (1.00, 0.00, 0.00), metallic=0.0, roughness=0.5),  # pure red
    "maint":      make_mat("m_maint",    (1.00, 0.10, 0.55), metallic=0.0, roughness=0.5),  # MAGENTA, distinct from amber
    "hmi":        make_mat("m_hmi",      (0.05, 0.42, 1.00), metallic=0.0, roughness=0.4),
    "antenna":    make_mat("m_antenna",  (0.10, 0.12, 0.18), metallic=0.4, roughness=0.5),
    "thermal":    make_mat("m_thermal",  (0.00, 0.80, 0.95), metallic=0.05, roughness=0.4),
    "ctrl_black": make_mat("m_ctrl",     (0.05, 0.08, 0.12), metallic=0.3, roughness=0.4),
}


def add_box(name, location, size, material, module=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if module:
        MODULE_OBJECTS[module].append(obj)
    return obj


def add_cyl(name, location, radius, height, material, module=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(location=location, radius=radius, depth=height, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    if module:
        MODULE_OBJECTS[module].append(obj)
    return obj


def add_torus(name, location, major_radius, minor_radius, material, module=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        location=location, major_radius=major_radius, minor_radius=minor_radius, rotation=rotation
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    if module:
        MODULE_OBJECTS[module].append(obj)
    return obj


# ═══════ MODULE 3 — structure_containment (carbon-fibre frame) ═══════════
# Central chassis core: slab at z=0.06
add_box("dr1_chassis", (DRONE_X, DRONE_Y, DRONE_Z),
        (0.10, 0.06, 0.022), MAT["carbon"], "structure_containment")
# Folding arms — 4 cylinders at 45° (X-configuration)
ARM_LEN = 0.155
ARM_R = 0.010
ARM_HEIGHT = DRONE_Z + 0.002
for arm_idx, (sx, sy, name) in enumerate([(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]):
    arm_mid_x = sx * ARM_HALF / 2 + DRONE_X
    arm_mid_y = sy * ARM_HALF / 2 + DRONE_Y
    arm_angle_z = math.atan2(sy, sx)
    add_cyl(f"dr1_arm_{name}", (arm_mid_x, arm_mid_y, ARM_HEIGHT),
            ARM_R, ARM_LEN * 0.72, MAT["carbon"], "structure_containment",
            rotation=(0, math.radians(90), arm_angle_z))
# Landing gear — 4 thin legs down from chassis to z=0.005
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    leg_x = sx * 0.04 + DRONE_X
    leg_y = sy * 0.025 + DRONE_Y
    add_cyl(f"dr1_leg_{name}", (leg_x, leg_y, DRONE_Z - 0.025),
            0.003, 0.04, MAT["carbon"], "structure_containment")
    # Foot pads
    add_box(f"dr1_foot_{name}", (leg_x, leg_y, DRONE_Z - 0.045),
            (0.012, 0.012, 0.003), MAT["ctrl_black"], "structure_containment")
# Payload mounting frame — bracket below chassis for gimbal
add_box("dr1_payload_mount", (DRONE_X + 0.038, DRONE_Y, DRONE_Z - 0.018),
        (0.024, 0.04, 0.008), MAT["carbon"], "structure_containment")
# Vibration damping rubber pads (4 small soft mounts)
for sx, sy in [(+1, +1), (-1, +1), (-1, -1), (+1, -1)]:
    add_box(f"dr1_damper_{sx}_{sy}", (sx * 0.035 + DRONE_X, sy * 0.022 + DRONE_Y, DRONE_Z + 0.012),
            (0.006, 0.006, 0.004), MAT["safety"], "structure_containment")


# ═══════ MODULE 1 — energy_storage_source (LiPo pack on top) ═════════════
BATT_Z = DRONE_Z + 0.022
add_box("dr2_battery", (DRONE_X, DRONE_Y, BATT_Z + 0.014),
        (0.075, 0.045, 0.028), MAT["battery"], "energy_storage_source")
# BMS PCB (small green board on side)
add_box("dr2_bms", (DRONE_X - 0.038, DRONE_Y, BATT_Z + 0.014),
        (0.003, 0.035, 0.012), MAT["pcb"], "energy_storage_source")
# Battery connector — gold-plated XT60 on back
add_cyl("dr2_connector", (DRONE_X + 0.039, DRONE_Y, BATT_Z + 0.010),
        0.005, 0.012, MAT["copper"], "energy_storage_source",
        rotation=(0, math.radians(90), 0))
# Heater pad — thin red film under battery
add_box("dr2_heater", (DRONE_X, DRONE_Y, BATT_Z + 0.0008),
        (0.07, 0.04, 0.0015), MAT["safety"], "energy_storage_source")
# Enclosure rim
add_box("dr2_enclosure", (DRONE_X, DRONE_Y, BATT_Z + 0.028),
        (0.077, 0.046, 0.002), MAT["ctrl_black"], "energy_storage_source")


# ═══════ MODULE 2 — energy_conversion_transduction (4 motors + ESC) ══════
# Motor stators at arm tips (X-config corners)
MOTOR_Z = DRONE_Z + 0.022
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    mx = sx * ARM_HALF + DRONE_X
    my = sy * ARM_HALF + DRONE_Y
    add_cyl(f"dr3_stator_{name}", (mx, my, MOTOR_Z),
            0.018, 0.018, MAT["motor"], "energy_conversion_transduction")
    add_cyl(f"dr3_rotor_{name}", (mx, my, MOTOR_Z + 0.014),
            0.014, 0.010, MAT["rotor_cap"], "energy_conversion_transduction")
    # Bearing visible at base
    add_cyl(f"dr3_bearing_{name}", (mx, my, MOTOR_Z - 0.011),
            0.010, 0.004, MAT["aluminium"], "energy_conversion_transduction")
# 4-in-1 ESC PCB — square slab under chassis
add_box("dr3_esc", (DRONE_X, DRONE_Y, DRONE_Z - 0.006),
        (0.045, 0.045, 0.005), MAT["pcb"], "energy_conversion_transduction")
# ESC heat sink fins (4 thin parallel fins on top of ESC body, visible from side)
for i in range(5):
    add_box(f"dr3_esc_fin_{i}", (DRONE_X - 0.02 + i * 0.01, DRONE_Y, DRONE_Z - 0.001),
            (0.001, 0.04, 0.004), MAT["thermal"], "energy_conversion_transduction")


# ═══════ MODULE 10 — actuation_kinematics (propellers + gimbal) ══════════
# Propellers — 2 blades each, crossed in X-pattern
PROP_LEN = 0.080
PROP_W = 0.014
PROP_T = 0.002
PROP_Z = MOTOR_Z + 0.024
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    mx = sx * ARM_HALF + DRONE_X
    my = sy * ARM_HALF + DRONE_Y
    # Alternate prop rotation: clockwise / counter-clockwise for opposing pairs
    angle = math.radians(20 if (sx * sy > 0) else -20)
    # First blade
    add_box(f"dr10_prop_{name}_A", (mx, my, PROP_Z), (PROP_LEN, PROP_W, PROP_T),
            MAT["prop"], "actuation_kinematics", rotation=(0, 0, angle))
    # Second blade perpendicular
    add_box(f"dr10_prop_{name}_B", (mx, my, PROP_Z), (PROP_W, PROP_LEN, PROP_T),
            MAT["prop"], "actuation_kinematics", rotation=(0, 0, angle))
    # Hub centre cap
    add_cyl(f"dr10_prop_hub_{name}", (mx, my, PROP_Z + 0.002),
            0.005, 0.004, MAT["maint"], "actuation_kinematics")

# Gimbal — 3-axis brushless, mounted at front of chassis
GIMBAL_X = DRONE_X + 0.04
GIMBAL_Y = DRONE_Y
# Yaw motor (vertical axis below chassis)
add_cyl("dr10_gimbal_yaw_motor", (GIMBAL_X, GIMBAL_Y, DRONE_Z - 0.020),
        0.012, 0.018, MAT["gimbal"], "actuation_kinematics")
# Roll arm (horizontal swing)
add_box("dr10_gimbal_roll_arm", (GIMBAL_X + 0.012, GIMBAL_Y, DRONE_Z - 0.035),
        (0.024, 0.008, 0.008), MAT["gimbal"], "actuation_kinematics")
# Pitch motor
add_cyl("dr10_gimbal_pitch_motor", (GIMBAL_X + 0.026, GIMBAL_Y, DRONE_Z - 0.035),
        0.009, 0.012, MAT["gimbal"], "actuation_kinematics",
        rotation=(math.radians(90), 0, 0))


# ═══════ MODULE 4 — sensing_instrumentation (IMU + GNSS + vision + camera) ═
# IMU on flight controller — small dark chip
add_box("dr4_imu", (DRONE_X - 0.025, DRONE_Y + 0.018, DRONE_Z + 0.014),
        (0.008, 0.008, 0.003), MAT["sensor"], "sensing_instrumentation")
# GNSS antenna puck on top of battery
add_cyl("dr4_gnss", (DRONE_X - 0.025, DRONE_Y, BATT_Z + 0.030),
        0.012, 0.005, MAT["sensor"], "sensing_instrumentation")
# Omnidirectional vision sensors — 6 small bumps
VISION = [
    ("front",  +0.052, 0, DRONE_Z + 0.012),
    ("back",   -0.052, 0, DRONE_Z + 0.012),
    ("left",   0, -0.032, DRONE_Z + 0.012),
    ("right",  0, +0.032, DRONE_Z + 0.012),
    ("top",    0, 0, DRONE_Z + 0.022),
    ("bottom", 0, 0, DRONE_Z - 0.016),
]
for name, vx, vy, vz in VISION:
    add_cyl(f"dr4_vision_{name}", (DRONE_X + vx, DRONE_Y + vy, vz),
            0.005, 0.004, MAT["sensor"], "sensing_instrumentation",
            rotation=(0, 0, 0))
# Main 1-inch CMOS camera payload on gimbal
add_cyl("dr4_camera_body", (GIMBAL_X + 0.035, GIMBAL_Y, DRONE_Z - 0.035),
        0.014, 0.020, MAT["ctrl_black"], "sensing_instrumentation",
        rotation=(math.radians(90), 0, 0))
add_cyl("dr4_camera_lens", (GIMBAL_X + 0.048, GIMBAL_Y, DRONE_Z - 0.035),
        0.011, 0.010, MAT["lens"], "sensing_instrumentation",
        rotation=(math.radians(90), 0, 0))


# ═══════ MODULE 5 — control_compute_communication ════════════════════════
# Flight controller PCB
add_box("dr5_fc", (DRONE_X - 0.005, DRONE_Y, DRONE_Z + 0.014),
        (0.035, 0.030, 0.004), MAT["fc"], "control_compute_communication")
# Video processing engine SoC (big chip with heat spreader)
add_box("dr5_vpu", (DRONE_X + 0.012, DRONE_Y, DRONE_Z + 0.018),
        (0.014, 0.014, 0.005), MAT["fc"], "control_compute_communication")
# 5.8 GHz digital radio transceiver PCB + antenna stub
add_box("dr5_radio", (DRONE_X - 0.030, DRONE_Y - 0.018, DRONE_Z + 0.014),
        (0.012, 0.012, 0.003), MAT["fc"], "control_compute_communication")
add_cyl("dr5_antenna_5g", (DRONE_X - 0.040, DRONE_Y - 0.020, DRONE_Z + 0.025),
        0.0015, 0.030, MAT["antenna"], "control_compute_communication")
# Remote ID broadcaster — small dedicated chip
add_box("dr5_remote_id", (DRONE_X + 0.020, DRONE_Y - 0.022, DRONE_Z + 0.015),
        (0.008, 0.005, 0.002), MAT["fc"], "control_compute_communication")


# ═══════ MODULE 8 — power_distribution ══════════════════════════════════
# Main power board (sits under flight controller, above ESC)
add_box("dr8_pdb", (DRONE_X, DRONE_Y, DRONE_Z + 0.008),
        (0.040, 0.040, 0.003), MAT["powerdist"], "power_distribution")
# Power harnesses — 4 thin cables routing from PDB to each motor (silicone-jacketed copper)
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    mx = sx * ARM_HALF + DRONE_X
    my = sy * ARM_HALF + DRONE_Y
    add_cyl(f"dr8_harness_{name}",
            ((mx + DRONE_X) / 2, (my + DRONE_Y) / 2, ARM_HEIGHT - 0.004),
            0.0018, math.hypot(mx, my) * 1.0, MAT["copper"], "power_distribution",
            rotation=(0, math.radians(90), math.atan2(my, mx)))
# Signal harness — thin bus between FC and ESC
add_box("dr8_signal_harness", (DRONE_X, DRONE_Y, DRONE_Z + 0.0035),
        (0.010, 0.010, 0.001), MAT["copper"], "power_distribution")


# ═══════ MODULE 6 — safety_protection ═══════════════════════════════════
# Propeller guards — 4 thin rings around each propeller
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    mx = sx * ARM_HALF + DRONE_X
    my = sy * ARM_HALF + DRONE_Y
    add_torus(f"dr6_prop_guard_{name}", (mx, my, PROP_Z - 0.002),
              major_radius=0.085, minor_radius=0.0025,
              material=MAT["safety"], module="safety_protection")
# Battery safety cutoff — small relay on PDB
add_box("dr6_safety_cutoff", (DRONE_X + 0.012, DRONE_Y + 0.020, DRONE_Z + 0.012),
        (0.006, 0.005, 0.003), MAT["safety"], "safety_protection")
# Hardware watchdog chip
add_box("dr6_watchdog", (DRONE_X - 0.015, DRONE_Y - 0.022, DRONE_Z + 0.017),
        (0.004, 0.004, 0.002), MAT["safety"], "safety_protection")
# Emergency recovery module — parachute beacon
add_box("dr6_emergency", (DRONE_X + 0.025, DRONE_Y + 0.020, DRONE_Z + 0.015),
        (0.006, 0.006, 0.005), MAT["safety"], "safety_protection")


# ═══════ MODULE 7 — environmental_interface ═════════════════════════════
# SoC thermal — heat sink on top of VPU
add_box("dr7_soc_heatsink", (DRONE_X + 0.012, DRONE_Y, DRONE_Z + 0.024),
        (0.014, 0.014, 0.005), MAT["thermal"], "environmental_interface")
# Heatsink fins
for i in range(5):
    add_box(f"dr7_soc_fin_{i}", (DRONE_X + 0.005 + i * 0.0035, DRONE_Y, DRONE_Z + 0.029),
            (0.001, 0.014, 0.003), MAT["thermal"], "environmental_interface")
# VTX thermal pad on radio
add_box("dr7_vtx_thermal", (DRONE_X - 0.030, DRONE_Y - 0.018, DRONE_Z + 0.017),
        (0.012, 0.012, 0.002), MAT["thermal"], "environmental_interface")
# Chassis weather sealing — thin rubber gasket band around chassis perimeter
add_box("dr7_gasket", (DRONE_X, DRONE_Y, DRONE_Z + 0.011),
        (0.103, 0.063, 0.0015), MAT["safety"], "environmental_interface")


# ═══════ MODULE 9 — maintenance_serviceability ═══════════════════════════
# Propeller quick-release — visible threaded bolt heads on rotor caps
for sx, sy, name in [(+1, +1, "FR"), (-1, +1, "BR"), (-1, -1, "BL"), (+1, -1, "FL")]:
    mx = sx * ARM_HALF + DRONE_X
    my = sy * ARM_HALF + DRONE_Y
    add_cyl(f"dr9_qr_{name}", (mx, my, MOTOR_Z + 0.020),
            0.004, 0.005, MAT["maint"], "maintenance_serviceability")
# Battery swap latch — small yellow lever on top of battery enclosure
add_box("dr9_battery_latch", (DRONE_X - 0.030, DRONE_Y + 0.018, BATT_Z + 0.029),
        (0.015, 0.005, 0.003), MAT["maint"], "maintenance_serviceability")
# Diagnostic interface — small USB-C port at rear of chassis
add_box("dr9_diagnostic_port", (DRONE_X - 0.050, DRONE_Y, DRONE_Z + 0.008),
        (0.002, 0.008, 0.003), MAT["maint"], "maintenance_serviceability")
# Repair fastener kit — 4 visible bolt heads at chassis corners
for sx, sy in [(+1, +1), (-1, +1), (-1, -1), (+1, -1)]:
    add_cyl(f"dr9_bolt_{sx}_{sy}", (sx * 0.045 + DRONE_X, sy * 0.025 + DRONE_Y, DRONE_Z + 0.012),
            0.002, 0.001, MAT["maint"], "maintenance_serviceability")


# ═══════ MODULE 11 — hmi_ergonomics (separate handset object) ════════════
# Controller chassis — main handset body
add_box("dr11_handset", (HANDSET_X, HANDSET_Y, HANDSET_Z),
        (0.16, 0.08, 0.035), MAT["hmi"], "hmi_ergonomics")
# 2 flight control gimbals (joystick stubs on top)
for jx, name in [(-0.040, "L"), (+0.040, "R")]:
    add_cyl(f"dr11_joystick_base_{name}", (HANDSET_X + jx, HANDSET_Y, HANDSET_Z + 0.020),
            0.014, 0.005, MAT["ctrl_black"], "hmi_ergonomics")
    add_cyl(f"dr11_joystick_{name}", (HANDSET_X + jx, HANDSET_Y, HANDSET_Z + 0.030),
            0.006, 0.012, MAT["ctrl_black"], "hmi_ergonomics")
# Mobile device clamp (extruded above handset, holds phone)
add_box("dr11_phone_clamp", (HANDSET_X, HANDSET_Y - 0.025, HANDSET_Z + 0.040),
        (0.12, 0.005, 0.060), MAT["ctrl_black"], "hmi_ergonomics")
# Controller UI panel — small LCD on top centre
add_box("dr11_ui_panel", (HANDSET_X, HANDSET_Y + 0.012, HANDSET_Z + 0.018),
        (0.040, 0.022, 0.003), MAT["sensor"], "hmi_ergonomics")  # green LCD
# Internal battery (cylinder visible in cutaway, drawn as small bump)
add_cyl("dr11_internal_battery", (HANDSET_X, HANDSET_Y, HANDSET_Z - 0.014),
        0.010, 0.060, MAT["battery"], "hmi_ergonomics",
        rotation=(0, math.radians(90), 0))
# Controller radio module — small antenna stub
add_cyl("dr11_antenna", (HANDSET_X + 0.075, HANDSET_Y, HANDSET_Z + 0.030),
        0.0015, 0.040, MAT["antenna"], "hmi_ergonomics")
# Haptic feedback motor — tiny puck on side
add_cyl("dr11_haptic", (HANDSET_X - 0.072, HANDSET_Y + 0.020, HANDSET_Z),
        0.004, 0.008, MAT["maint"], "hmi_ergonomics",
        rotation=(0, math.radians(90), 0))


# ─── Lighting ───────────────────────────────────────────────────────────
bpy.ops.object.light_add(type="SUN", location=(0.3, -0.5, 0.8))
sun = bpy.context.active_object
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(55), math.radians(20), math.radians(35))

bpy.ops.object.light_add(type="AREA", location=(0, 0, 0.6))
fill = bpy.context.active_object
fill.data.energy = 28
fill.data.size = 1.5

# Pure white world
world = bpy.data.worlds.new("world")
bpy.context.scene.world = world
world.use_nodes = True
world_bg = world.node_tree.nodes["Background"]
world_bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
world_bg.inputs["Strength"].default_value = 1.0

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1600
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.exposure = 0.0
# Standard view transform (not AgX/Filmic) so the white world renders as pure white
scene.view_settings.view_transform = "Standard"


# ═══════════════════════════════════════════════════════════════════════
# Universal 9-shot camera grammar
# Given the scene's bounding box, emit 9 cameras: 1 top-down plan + 4 sides
# at slight elevation + 4 corner-at-elevation. Form-factor-agnostic.
# ═══════════════════════════════════════════════════════════════════════
def compute_scene_bbox():
    xs, ys, zs = [], [], []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for v in obj.bound_box:
            world_v = obj.matrix_world @ mathutils.Vector(v)
            xs.append(world_v.x)
            ys.append(world_v.y)
            zs.append(world_v.z)
    return (
        (min(xs), max(xs)),
        (min(ys), max(ys)),
        (min(zs), max(zs)),
    )


def nine_shot_cameras(bbox, distance_factor=2.8, elevation_factor=0.6):
    """Return 3 camera dicts covering the scene bbox.
    1× top-down (orthographic plan) + 2× opposing corners at elevation.
    For symmetric form factors, 3 shots is sufficient — 4 sides + 4 corners
    are mostly mirror restatements of each other. Per Tristan 2026-05-17.
    """
    (xmin, xmax), (ymin, ymax), (zmin, zmax) = bbox
    cx = (xmin + xmax) / 2
    cy = (ymin + ymax) / 2
    cz = (zmin + zmax) / 2
    dx = xmax - xmin
    dy = ymax - ymin
    dz = zmax - zmin
    max_dim = max(dx, dy, dz)
    radius = max_dim * distance_factor
    elev = max_dim * elevation_factor
    ortho_scale = max_dim * 1.45
    target = (cx, cy, cz)

    cams = []
    # 1× top-down (orthographic plan view, looking straight down)
    cams.append({"name": "01-top",
                 "loc": (cx, cy, zmax + radius),
                 "target": target, "ortho_scale": ortho_scale})

    # 2× opposing corners at elevation — front-right and back-left
    diag = radius / math.sqrt(2)
    for name, sx, sy in [("02-corner-FR", +1, +1), ("03-corner-BL", -1, -1)]:
        cams.append({"name": name,
                     "loc": (cx + sx * diag, cy + sy * diag, cz + elev),
                     "target": target, "ortho_scale": ortho_scale})

    return cams


def setup_camera(loc, target, ortho_scale, focal=50):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho_scale
    cam.data.lens = focal
    direction = (target[0] - loc[0], target[1] - loc[1], target[2] - loc[2])
    cam.rotation_euler = mathutils.Vector(direction).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    return cam


def clear_cameras():
    for obj in list(bpy.data.objects):
        if obj.type == "CAMERA":
            bpy.data.objects.remove(obj, do_unlink=True)


# ═══════ Render 9 spatial views ════════════════════════════════════════
bbox = compute_scene_bbox()
cams = nine_shot_cameras(bbox)
print(f"[drone] scene bbox: x={bbox[0]}, y={bbox[1]}, z={bbox[2]}")

for cam_spec in cams:
    clear_cameras()
    setup_camera(loc=cam_spec["loc"], target=cam_spec["target"], ortho_scale=cam_spec["ortho_scale"])
    scene.render.filepath = str(OUT / f"{cam_spec['name']}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[drone] {cam_spec['name']}.png")


# ═══════ Render Option 2 hero (drone only, tight 3/4 iso) ═════════════
# Hero frames JUST the drone, not the separate handset object — the handset is
# a different physical product. Hide handset objects, recompute bbox, render.
hmi_objs = MODULE_OBJECTS.get("hmi_ergonomics", [])
for obj in hmi_objs:
    obj.hide_render = True

# Hero palette: keep the carbon-fibre frame OPAQUE and DARK. Drone has no
# enclosing shell to ghost (the frame is a skeleton, not a box), so ghosting
# it just makes the structure disappear. Better treatment: medium-dark
# opaque carbon as the visible "skeleton", saturated modules on top.
HERO_CARBON = bpy.data.materials.new("m_carbon_hero")
HERO_CARBON.use_nodes = True
hcb = HERO_CARBON.node_tree.nodes["Principled BSDF"]
hcb.inputs["Base Color"].default_value = (0.28, 0.30, 0.34, 1.0)
hcb.inputs["Metallic"].default_value = 0.3
hcb.inputs["Roughness"].default_value = 0.45

structure_objs = MODULE_OBJECTS.get("structure_containment", [])
hero_snap = {}
for obj in structure_objs:
    if obj.data and obj.data.materials:
        hero_snap[obj.name] = list(obj.data.materials)
        obj.data.materials.clear()
        obj.data.materials.append(HERO_CARBON)

clear_cameras()
hero_bbox = compute_scene_bbox()  # will exclude hidden objects? no — bound_box is geometry
# Compute drone-only bbox by skipping the handset objects manually
drone_xs, drone_ys, drone_zs = [], [], []
hmi_names = {o.name for o in hmi_objs}
for obj in bpy.data.objects:
    if obj.type != "MESH" or obj.name in hmi_names:
        continue
    for v in obj.bound_box:
        wv = obj.matrix_world @ mathutils.Vector(v)
        drone_xs.append(wv.x)
        drone_ys.append(wv.y)
        drone_zs.append(wv.z)
dxmin, dxmax = min(drone_xs), max(drone_xs)
dymin, dymax = min(drone_ys), max(drone_ys)
dzmin, dzmax = min(drone_zs), max(drone_zs)
dcx = (dxmin + dxmax) / 2
dcy = (dymin + dymax) / 2
dcz = (dzmin + dzmax) / 2
dmax = max(dxmax - dxmin, dymax - dymin, dzmax - dzmin)
hero_diag = dmax * 2.0 / math.sqrt(2)
setup_camera(loc=(dcx + hero_diag, dcy - hero_diag, dcz + dmax * 0.55),
             target=(dcx, dcy, dcz),
             ortho_scale=dmax * 1.25)
scene.render.filepath = str(OUT / "00-hero.png")
bpy.ops.render.render(write_still=True)
print("[drone] 00-hero.png")

# Restore handset visibility
for obj in hmi_objs:
    obj.hide_render = False

# Restore original carbon materials after hero
for name, mats in hero_snap.items():
    obj = bpy.data.objects.get(name)
    if obj is not None and obj.type == "MESH":
        obj.data.materials.clear()
        for m in mats:
            obj.data.materials.append(m)


# ═══════════════════════════════════════════════════════════════════════
# Per-module page renders
# For each of the 11 modules, render one image from the FR corner camera
# with that module's objects in saturated colour and everything else ghosted.
# Used as the hero image at the top of each module-section page in the PDF.
# ═══════════════════════════════════════════════════════════════════════
# Muted grey for non-focal modules — SOLID, no alpha. Translucent ghost
# faded the whole drone away on white bg. Solid muted grey reads as
# "engineering drawing of the drone" with the focal module in identity colour.
GHOST_LIGHT = bpy.data.materials.new("ghost_light")
GHOST_LIGHT.use_nodes = True
gl = GHOST_LIGHT.node_tree.nodes["Principled BSDF"]
gl.inputs["Base Color"].default_value = (0.60, 0.62, 0.65, 1.0)
gl.inputs["Metallic"].default_value = 0.0
gl.inputs["Roughness"].default_value = 0.75

# Snapshot every mesh's current original materials so we can restore between modules
all_orig = {}
for obj in bpy.data.objects:
    if obj.type == "MESH" and obj.data and obj.data.materials:
        all_orig[obj.name] = list(obj.data.materials)


def apply_focal_palette(focal_module_id):
    """Saturate the focal module's objects; ghost everything else."""
    focal_names = set()
    for obj in MODULE_OBJECTS.get(focal_module_id, []):
        focal_names.add(obj.name)
    for obj_name, orig_mats in all_orig.items():
        obj = bpy.data.objects.get(obj_name)
        if obj is None:
            continue
        obj.data.materials.clear()
        if obj_name in focal_names:
            for m in orig_mats:
                obj.data.materials.append(m)
        else:
            obj.data.materials.append(GHOST_LIGHT)


def restore_all_originals():
    for obj_name, orig_mats in all_orig.items():
        obj = bpy.data.objects.get(obj_name)
        if obj is None:
            continue
        obj.data.materials.clear()
        for m in orig_mats:
            obj.data.materials.append(m)


# Enable Freestyle for per-module renders only — thin dark outline around every
# visible mesh so focal modules pop unambiguously against the ghost-grey body
# even for high-luminance colours like amber and cyan. Hero + 3 base spatial
# stay outline-free (clean CAD look).
scene.render.use_freestyle = True
vl_for_fs = scene.view_layers[0]
vl_for_fs.use_freestyle = True
fs = vl_for_fs.freestyle_settings
fs.crease_angle = math.radians(140)
ls = fs.linesets[0]
ls.select_silhouette = True
ls.select_border = True
ls.select_crease = True
if ls.linestyle is None:
    ls.linestyle = bpy.data.linestyles.new("focal_outline")
ls.linestyle.color = (0.05, 0.08, 0.12)
ls.linestyle.thickness = 1.4

# Per-module renders — use FR corner camera (index 1 in nine_shot_cameras output)
# For non-HMI modules, hide the handset (it's a separate physical product).
# For the HMI module specifically, show the handset (since it IS the HMI hardware).
for module_id, mod_objs in MODULE_OBJECTS.items():
    if not mod_objs:
        continue

    is_hmi = module_id == "hmi_ergonomics"
    for obj in hmi_objs:
        obj.hide_render = not is_hmi

    apply_focal_palette(module_id)

    # Recompute bbox (drone-only for non-HMI; drone+handset for HMI)
    visible_xs, visible_ys, visible_zs = [], [], []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        for v in obj.bound_box:
            wv = obj.matrix_world @ mathutils.Vector(v)
            visible_xs.append(wv.x)
            visible_ys.append(wv.y)
            visible_zs.append(wv.z)
    mod_bbox = ((min(visible_xs), max(visible_xs)),
                (min(visible_ys), max(visible_ys)),
                (min(visible_zs), max(visible_zs)))
    cams_mod = nine_shot_cameras(mod_bbox)
    fr = cams_mod[1]  # corner-FR

    clear_cameras()
    setup_camera(loc=fr["loc"], target=fr["target"], ortho_scale=fr["ortho_scale"])
    scene.render.filepath = str(OUT / f"module-{module_id}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[drone] module-{module_id}.png")

# Final restore
restore_all_originals()
for obj in hmi_objs:
    obj.hide_render = False

print(f"[drone] DONE — outputs at {OUT}/")
