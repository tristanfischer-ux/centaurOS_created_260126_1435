"""ev-charger-9shot.py — 150 kW DC fast EV charger, dual CCS2.

Source: iter-64-ev-charger-v4. Envelope 800 × 700 × 1850 mm. Floor-standing
cabinet for UK commercial installation. Dual CCS2 outputs with cables hanging
from sides via management arms. Liquid-cooled. 10 modules.

Layout:
  Bottom (z 0–0.40): foundation plinth, AC input busbars, coolant reservoir
  Lower-mid (z 0.40–0.90): coolant pump, manifold, DC output busbars
  Upper-mid (z 0.90–1.45): DC-DC power stack modules (the main power section)
  Top (z 1.45–1.85): AC-DC PFC rectifier stack, aux PSU, control PCBs
  Front face: touchscreen, payment terminal, CCS2 dispenser grips, LEDs

Outputs: 1 hero + 3 spatial + 10 module pages = 14 PNGs.

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P ev-charger-9shot.py
"""
import bpy
import os
import math
import mathutils
from pathlib import Path

bpy.ops.wm.read_factory_settings(use_empty=True)

POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-ev-charger-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 0.80
D = 0.70
H = 1.85

BAY_FOUNDATION_TOP = 0.40
BAY_COOLANT_TOP    = 0.90
BAY_DCDC_TOP       = 1.45

MODULE_OBJECTS: dict = {k: [] for k in [
    "structure_containment", "energy_conversion_transduction",
    "sensing_instrumentation", "control_compute_communication",
    "safety_protection", "environmental_interface",
    "power_distribution", "maintenance_serviceability",
    "mass_fluid_transport_process", "hmi_ergonomics",
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


MAT = {
    "enclosure":   make_mat("m_enclosure",   (0.55, 0.56, 0.58), metallic=0.4, roughness=0.55),
    "pfc":         make_mat("m_pfc",         (0.15, 0.50, 1.00), metallic=0.2, roughness=0.4),
    "dcdc":        make_mat("m_dcdc",        (0.02, 0.18, 0.95), metallic=0.0, roughness=0.45),
    "aux_psu":     make_mat("m_aux_psu",     (0.62, 0.05, 0.95), metallic=0.0, roughness=0.5),
    "ups":         make_mat("m_ups",         (0.10, 0.55, 0.65), metallic=0.1, roughness=0.45),
    "coldplate":   make_mat("m_coldplate",   (0.85, 0.86, 0.88), metallic=0.6, roughness=0.3),
    "coolant":     make_mat("m_coolant",     (0.10, 0.40, 0.85), metallic=0.5, roughness=0.3),
    "control":     make_mat("m_control",     (1.00, 0.55, 0.00), metallic=0.0, roughness=0.5),
    "powerdist":   make_mat("m_pdist",       (0.18, 0.20, 0.24), metallic=0.5, roughness=0.5),
    "copper":      make_mat("m_copper",      (1.00, 0.45, 0.00), metallic=0.1, roughness=0.4),
    "safety":      make_mat("m_safety",      (1.00, 0.00, 0.00), metallic=0.0, roughness=0.5),
    "sensor":      make_mat("m_sensing",     (0.00, 0.92, 0.10), metallic=0.0, roughness=0.5),
    "hmi":         make_mat("m_hmi",         (0.05, 0.42, 1.00), metallic=0.0, roughness=0.4),
    "maint":       make_mat("m_maint",       (1.00, 0.10, 0.55), metallic=0.0, roughness=0.5),
    "cable":       make_mat("m_cable",       (0.05, 0.08, 0.12), metallic=0.0, roughness=0.7),
    "thermal":     make_mat("m_thermal",     (0.00, 0.80, 0.95), metallic=0.05, roughness=0.4),
    "ctrl_black":  make_mat("m_ctrl",        (0.05, 0.08, 0.12), metallic=0.3, roughness=0.4),
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
    bpy.ops.mesh.primitive_torus_add(location=location, major_radius=major_radius, minor_radius=minor_radius, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    if module:
        MODULE_OBJECTS[module].append(obj)
    return obj


# ═══════ Module — structure_containment ═══════
WALL_T = 0.025
# Foundation plinth (concrete base, slightly wider than cabinet)
add_box("evc1_plinth", (W/2, D/2, 0.05), (W + 0.10, D + 0.10, 0.10), MAT["powerdist"], "structure_containment")
# Main enclosure cabinet — 6 panels
add_box("evc1_base",      (W/2, D/2, 0.10 + WALL_T/2), (W, D, WALL_T), MAT["enclosure"], "structure_containment")
add_box("evc1_top",       (W/2, D/2, H - WALL_T/2 + 0.10), (W, D, WALL_T), MAT["enclosure"], "structure_containment")
add_box("evc1_left",      (WALL_T/2, D/2, H/2 + 0.10), (WALL_T, D, H), MAT["enclosure"], "structure_containment")
add_box("evc1_right",     (W - WALL_T/2, D/2, H/2 + 0.10), (WALL_T, D, H), MAT["enclosure"], "structure_containment")
add_box("evc1_back",      (W/2, D - WALL_T/2, H/2 + 0.10), (W, WALL_T, H), MAT["enclosure"], "structure_containment")
# Front panel — solid below display, with cutout at top for screen + payment
add_box("evc1_front_lower", (W/2, WALL_T/2, 0.50), (W, WALL_T, 0.80), MAT["enclosure"], "structure_containment")
add_box("evc1_front_upper", (W/2, WALL_T/2, 1.65), (W, WALL_T, 0.30), MAT["enclosure"], "structure_containment")
# Internal chassis frame — central vertical strut
add_box("evc1_strut_C", (W/2, D - 0.06, H/2 + 0.10), (0.04, 0.06, H - 0.10), MAT["powerdist"], "structure_containment")
# Cable management arms — 2 swing arms on left + right sides of cabinet
for sx, side in [(-0.04, "L"), (W + 0.04, "R")]:
    add_box(f"evc1_cable_arm_{side}", (sx, D/2, 1.40), (0.06, 0.04, 0.30), MAT["enclosure"], "structure_containment")
    add_cyl(f"evc1_cable_arm_pivot_{side}", (sx, D/2, 1.25), 0.04, 0.04, MAT["powerdist"], "structure_containment")


# ═══════ Module — energy_conversion_transduction ═══════
# AC-DC PFC rectifier stack (top section) — 3 rectifier modules stacked
for i in range(3):
    add_box(f"evc_pfc_{i}", (0.18 + i * 0.22, D * 0.5, BAY_DCDC_TOP + 0.20),
            (0.18, 0.40, 0.18), MAT["pfc"], "energy_conversion_transduction")
# DC-DC power stack — 4 power modules in the upper-mid bay
for i in range(2):
    for j in range(2):
        add_box(f"evc_dcdc_{i}_{j}", (W * 0.30 + i * 0.30, D * 0.30 + j * 0.30, BAY_COOLANT_TOP + 0.25),
                (0.24, 0.22, 0.45), MAT["dcdc"], "energy_conversion_transduction")
# Auxiliary power supply
add_box("evc_aux_psu", (W * 0.85, D * 0.30, BAY_COOLANT_TOP + 0.15),
        (0.10, 0.16, 0.20), MAT["aux_psu"], "energy_conversion_transduction")
# UPS inverter
add_box("evc_ups", (W * 0.85, D * 0.55, BAY_COOLANT_TOP + 0.20),
        (0.10, 0.18, 0.30), MAT["ups"], "energy_conversion_transduction")
# Liquid cold plate (mounted under DC-DC stack)
add_box("evc_coldplate", (W/2, D/2, BAY_COOLANT_TOP - 0.02),
        (W - 0.10, D - 0.10, 0.020), MAT["coldplate"], "energy_conversion_transduction")


# ═══════ Module — mass_fluid_transport_process ═══════
# Coolant pump assembly (cylindrical)
add_cyl("evc_coolant_pump", (W * 0.25, D * 0.30, BAY_FOUNDATION_TOP + 0.18),
        0.06, 0.12, MAT["coolant"], "mass_fluid_transport_process")
add_cyl("evc_coolant_pump_motor", (W * 0.25, D * 0.30, BAY_FOUNDATION_TOP + 0.30),
        0.05, 0.08, MAT["ctrl_black"], "mass_fluid_transport_process")
# Coolant reservoir tank (translucent-ish blue)
add_cyl("evc_reservoir", (W * 0.20, D * 0.65, BAY_FOUNDATION_TOP + 0.20),
        0.09, 0.30, MAT["coolant"], "mass_fluid_transport_process")
# Coolant distribution manifold (T-junction copper)
add_box("evc_coolant_manifold", (W/2, D * 0.5, BAY_COOLANT_TOP - 0.06),
        (0.30, 0.04, 0.04), MAT["copper"], "mass_fluid_transport_process")
# Filtration housing
add_cyl("evc_coolant_filter", (W * 0.55, D * 0.30, BAY_FOUNDATION_TOP + 0.20),
        0.04, 0.12, MAT["coolant"], "mass_fluid_transport_process")
# Coolant pipes — supply + return + cold plate feeds
add_cyl("evc_coolant_supply", (W * 0.40, D * 0.30, (BAY_FOUNDATION_TOP + BAY_COOLANT_TOP)/2),
        0.012, 0.42, MAT["coolant"], "mass_fluid_transport_process")
add_cyl("evc_coolant_return", (W * 0.40, D * 0.65, (BAY_FOUNDATION_TOP + BAY_COOLANT_TOP)/2),
        0.012, 0.42, MAT["coolant"], "mass_fluid_transport_process")


# ═══════ Module — environmental_interface ═══════
# Air-to-liquid heat exchanger (rectangular finned block, on roof)
add_box("evc_heatx_block", (W/2, D/2, H + 0.05),
        (0.50, 0.30, 0.08), MAT["thermal"], "environmental_interface")
# Heat exchanger fins (visible vertical strips on top)
for i in range(10):
    add_box(f"evc_heatx_fin_{i}", (W * 0.30 + i * 0.04, D/2, H + 0.09),
            (0.005, 0.30, 0.05), MAT["thermal"], "environmental_interface")
# Cabinet ventilation fan (intake on bottom)
add_cyl("evc_intake_fan", (W * 0.85, D * 0.85, BAY_FOUNDATION_TOP + 0.05),
        0.06, 0.04, MAT["ctrl_black"], "environmental_interface")
# Coolant heater for cold start (small heater element)
add_box("evc_cold_start_heater", (W * 0.20, D * 0.65, BAY_FOUNDATION_TOP + 0.05),
        (0.04, 0.04, 0.04), MAT["safety"], "environmental_interface")
# Acoustic damping (panel on inside of back wall, faint)
add_box("evc_acoustic", (W/2, D - WALL_T - 0.015, H/2 + 0.10),
        (W - 0.10, 0.01, H - 0.30), MAT["thermal"], "environmental_interface")


# ═══════ Module — actuation_kinematics has been folded into other modules ═══
# (no entry in this product's module list, only 10 modules)


# ═══════ Module — sensing_instrumentation ═══════
# DC energy metering (on DC output busbar)
add_box("evc_energy_meter", (W/2, D * 0.65, BAY_COOLANT_TOP - 0.10),
        (0.08, 0.06, 0.05), MAT["sensor"], "sensing_instrumentation")
# Insulation monitoring device
add_box("evc_imd", (W * 0.85, D * 0.85, BAY_FOUNDATION_TOP + 0.30),
        (0.06, 0.04, 0.06), MAT["sensor"], "sensing_instrumentation")
# Current / voltage sensors on busbars (3 small green dots)
for i, (sx, sy, sz) in enumerate([
    (W * 0.30, D * 0.85, BAY_COOLANT_TOP - 0.05),
    (W * 0.50, D * 0.85, BAY_COOLANT_TOP - 0.05),
    (W * 0.70, D * 0.85, BAY_COOLANT_TOP - 0.05),
]):
    add_cyl(f"evc_iv_sensor_{i}", (sx, sy, sz), 0.018, 0.025, MAT["sensor"], "sensing_instrumentation")
# Environmental sensors (T + humidity, in air intake)
add_box("evc_env_sensor", (W * 0.85, D * 0.85, BAY_FOUNDATION_TOP + 0.12),
        (0.04, 0.03, 0.03), MAT["sensor"], "sensing_instrumentation")


# ═══════ Module — control_compute_communication ═══════
# Main charge controller (large PCB on right wall)
add_box("evc_main_ctrl", (W - 0.05, D * 0.30, BAY_DCDC_TOP + 0.15),
        (0.005, 0.20, 0.15), MAT["control"], "control_compute_communication")
# EVSE comm controller
add_box("evc_evse_ctrl", (W - 0.05, D * 0.55, BAY_DCDC_TOP + 0.15),
        (0.005, 0.12, 0.10), MAT["control"], "control_compute_communication")
# Telemetry backhaul (4G modem with antenna)
add_box("evc_telemetry", (W - 0.05, D * 0.50, BAY_DCDC_TOP + 0.30),
        (0.005, 0.08, 0.06), MAT["control"], "control_compute_communication")
add_cyl("evc_telemetry_antenna", (W - 0.025, D * 0.50, BAY_DCDC_TOP + 0.40),
        0.003, 0.10, MAT["ctrl_black"], "control_compute_communication")
# Power module controller (smaller PCB near DC-DC stack)
add_box("evc_power_ctrl", (W - 0.05, D * 0.25, BAY_COOLANT_TOP + 0.15),
        (0.005, 0.10, 0.08), MAT["control"], "control_compute_communication")
# Watchdog timer
add_box("evc_watchdog", (W - 0.05, D * 0.40, BAY_DCDC_TOP + 0.05),
        (0.005, 0.04, 0.04), MAT["control"], "control_compute_communication")


# ═══════ Module — safety_protection ═══════
# Grid protection relay (large red enclosure on left wall)
add_box("evc_grid_protection", (0.05, D * 0.30, BAY_COOLANT_TOP + 0.20),
        (0.06, 0.10, 0.18), MAT["safety"], "safety_protection")
# AC input protection (RCBO breakers)
add_box("evc_ac_protection", (0.05, D * 0.60, BAY_FOUNDATION_TOP + 0.20),
        (0.06, 0.18, 0.10), MAT["safety"], "safety_protection")
# DC output isolation contactor
add_box("evc_dc_isolation", (0.05, D * 0.50, BAY_DCDC_TOP - 0.10),
        (0.06, 0.10, 0.10), MAT["safety"], "safety_protection")
# Emergency stop button (front face, prominent)
add_cyl("evc_estop", (W * 0.85, 0.012, 1.40),
        0.030, 0.020, MAT["safety"], "safety_protection",
        rotation=(math.radians(90), 0, 0))
add_cyl("evc_estop_collar", (W * 0.85, 0.020, 1.40),
        0.035, 0.008, MAT["maint"], "safety_protection",
        rotation=(math.radians(90), 0, 0))
# Thermal interlock sensors (small red dots on each power module)
for i in range(4):
    sx = W * 0.30 + (i % 2) * 0.30
    sy = D * 0.30 + (i // 2) * 0.30
    add_cyl(f"evc_thermal_interlock_{i}", (sx, sy, BAY_DCDC_TOP - 0.02),
            0.010, 0.010, MAT["safety"], "safety_protection")
# EMC grounding strap
add_box("evc_emc_ground", (W * 0.5, 0.04, 0.08), (0.10, 0.02, 0.005), MAT["copper"], "safety_protection")
# Door interlock (limit switch on front panel)
add_box("evc_door_interlock", (W * 0.05, 0.02, 1.0), (0.02, 0.02, 0.02), MAT["safety"], "safety_protection")


# ═══════ Module — power_distribution ═══════
# AC input busbars (3-phase, copper bars at bottom)
for i, dy in enumerate([0.30, 0.40, 0.50]):
    add_box(f"evc_ac_busbar_{i}", (0.10, dy, BAY_FOUNDATION_TOP - 0.05),
            (0.40, 0.018, 0.015), MAT["copper"], "power_distribution")
# DC output busbars (positive + negative, copper bars between DC-DC and front)
add_box("evc_dc_busbar_pos", (W/2, D * 0.20, BAY_DCDC_TOP - 0.08),
        (0.50, 0.025, 0.015), MAT["copper"], "power_distribution")
add_box("evc_dc_busbar_neg", (W/2, D * 0.25, BAY_DCDC_TOP - 0.08),
        (0.50, 0.025, 0.015), MAT["copper"], "power_distribution")
# CCS2 charging cables — 2 thick black cables hanging from sides
for sx, side in [(-0.06, "L"), (W + 0.06, "R")]:
    # Cable arm hanging vertical from cable management
    add_cyl(f"evc_ccs2_cable_{side}", (sx, D/2, 1.10),
            0.028, 0.60, MAT["cable"], "power_distribution")
    # CCS2 dispenser grip (connector head at end)
    add_box(f"evc_ccs2_grip_{side}", (sx, D/2, 0.75),
            (0.10, 0.06, 0.14), MAT["ctrl_black"], "power_distribution")
    add_cyl(f"evc_ccs2_dc_pin_{side}", (sx, D/2, 0.72),
            0.012, 0.04, MAT["copper"], "power_distribution",
            rotation=(math.radians(90), 0, 0))
# LV control harness (thin cable bundle inside)
add_cyl("evc_lv_harness", (W * 0.60, D * 0.85, BAY_DCDC_TOP),
        0.008, 0.60, MAT["copper"], "power_distribution")


# ═══════ Module — maintenance_serviceability ═══════
# Service access doors (handle on right side of front)
add_box("evc_door_handle_R", (W - 0.10, 0.005, 1.20),
        (0.06, 0.012, 0.04), MAT["maint"], "maintenance_serviceability")
add_box("evc_door_handle_L", (0.10, 0.005, 1.20),
        (0.06, 0.012, 0.04), MAT["maint"], "maintenance_serviceability")
# Lifting hoist points (2 lugs on top)
for sx in [W * 0.25, W * 0.75]:
    add_cyl(f"evc_lift_lug_{sx:.2f}", (sx, D/2, H + 0.18),
            0.025, 0.025, MAT["maint"], "maintenance_serviceability")
# Diagnostic interface (RJ45/USB port behind small flap)
add_box("evc_diagnostic", (W * 0.05, 0.012, 1.45),
        (0.04, 0.005, 0.04), MAT["maint"], "maintenance_serviceability")
# Safety labels (signage placards on front)
for i in range(3):
    add_box(f"evc_label_{i}", (W * 0.30 + i * 0.15, 0.012, 0.20),
            (0.10, 0.003, 0.04), MAT["maint"], "maintenance_serviceability")


# ═══════ Module — hmi_ergonomics ═══════
# Touchscreen display (large, upper front)
HMI_Z = 1.45
add_box("evc_hmi_bezel", (W/2, 0.005, HMI_Z),
        (0.36, 0.010, 0.26), MAT["enclosure"], "hmi_ergonomics")
add_box("evc_hmi_screen", (W/2, -0.002, HMI_Z),
        (0.32, 0.005, 0.22), MAT["hmi"], "hmi_ergonomics")
# Payment terminal (separate smaller screen + contactless reader, below display)
add_box("evc_payment_bezel", (W/2, 0.005, 1.15),
        (0.20, 0.010, 0.16), MAT["enclosure"], "hmi_ergonomics")
add_box("evc_payment_screen", (W/2, -0.002, 1.20),
        (0.16, 0.005, 0.08), MAT["hmi"], "hmi_ergonomics")
# Contactless card reader (NFC pad)
add_cyl("evc_nfc_pad", (W/2, -0.005, 1.08), 0.035, 0.008, MAT["hmi"], "hmi_ergonomics",
        rotation=(math.radians(90), 0, 0))
# LED status indicators (vertical strip on front)
for i, c in enumerate([MAT["sensor"], MAT["maint"], MAT["safety"]]):
    add_cyl(f"evc_status_led_{i}", (W * 0.92, -0.005, 1.70 - i * 0.08),
            0.012, 0.008, c, "hmi_ergonomics",
            rotation=(math.radians(90), 0, 0))
# CCS2 dispenser grips already added in power_distribution module — those are
# the physical connectors. The HMI module's grip is the ergonomic handle wrapping.
for sx, side in [(-0.06, "L"), (W + 0.06, "R")]:
    add_torus(f"evc_grip_handle_{side}", (sx, D/2, 0.78), 0.045, 0.008, MAT["maint"], "hmi_ergonomics",
              rotation=(math.radians(90), 0, 0))


# ─── Lighting ─────────────────────────────────────────────────
bpy.ops.object.light_add(type="SUN", location=(2, -3, 5))
sun = bpy.context.active_object
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(55), math.radians(20), math.radians(35))

bpy.ops.object.light_add(type="AREA", location=(W/2, D/2, 3.0))
fill = bpy.context.active_object
fill.data.energy = 80
fill.data.size = 3.0

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
scene.view_settings.view_transform = "Standard"


def compute_scene_bbox():
    xs, ys, zs = [], [], []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for v in obj.bound_box:
            wv = obj.matrix_world @ mathutils.Vector(v)
            xs.append(wv.x); ys.append(wv.y); zs.append(wv.z)
    return ((min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs)))


def nine_shot_cameras(bbox, distance_factor=2.8, elevation_factor=0.6):
    (xmin, xmax), (ymin, ymax), (zmin, zmax) = bbox
    cx, cy, cz = (xmin+xmax)/2, (ymin+ymax)/2, (zmin+zmax)/2
    dx, dy, dz = xmax-xmin, ymax-ymin, zmax-zmin
    max_dim = max(dx, dy, dz)
    radius = max_dim * distance_factor
    elev = max_dim * elevation_factor
    ortho_scale = max_dim * 1.45
    target = (cx, cy, cz)
    cams = [{"name": "01-top", "loc": (cx, cy, zmax + radius), "target": target, "ortho_scale": ortho_scale}]
    diag = radius / math.sqrt(2)
    for name, sx, sy in [("02-corner-FR", +1, +1), ("03-corner-BL", -1, -1)]:
        cams.append({"name": name, "loc": (cx + sx * diag, cy + sy * diag, cz + elev), "target": target, "ortho_scale": ortho_scale})
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


# Spatial base set (no Freestyle, clean iso)
bbox = compute_scene_bbox()
cams = nine_shot_cameras(bbox)
for cam_spec in cams:
    clear_cameras()
    setup_camera(loc=cam_spec["loc"], target=cam_spec["target"], ortho_scale=cam_spec["ortho_scale"])
    scene.render.filepath = str(OUT / f"{cam_spec['name']}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ev-charger] {cam_spec['name']}.png")


# Hero — Option 2 ghosted shell
HERO_GHOST = bpy.data.materials.new("hero_ghost_enclosure")
HERO_GHOST.use_nodes = True
gb = HERO_GHOST.node_tree.nodes["Principled BSDF"]
gb.inputs["Base Color"].default_value = (0.93, 0.94, 0.95, 1.0)
gb.inputs["Metallic"].default_value = 0.0
gb.inputs["Roughness"].default_value = 0.4
gb.inputs["Alpha"].default_value = 0.18
HERO_GHOST.blend_method = "BLEND"

structure_objs = MODULE_OBJECTS.get("structure_containment", [])
hero_snap = {}
for obj in structure_objs:
    if obj.data and obj.data.materials:
        hero_snap[obj.name] = list(obj.data.materials)
        obj.data.materials.clear()
        obj.data.materials.append(HERO_GHOST)

clear_cameras()
(xmin, xmax), (ymin, ymax), (zmin, zmax) = compute_scene_bbox()
cx, cy, cz = (xmin+xmax)/2, (ymin+ymax)/2, (zmin+zmax)/2
max_dim = max(xmax-xmin, ymax-ymin, zmax-zmin)
hero_diag = max_dim * 2.0 / math.sqrt(2)
setup_camera(loc=(cx + hero_diag, cy - hero_diag, cz + max_dim * 0.45),
             target=(cx, cy, cz), ortho_scale=max_dim * 1.20)
scene.render.filepath = str(OUT / "00-hero.png")
bpy.ops.render.render(write_still=True)
print("[ev-charger] 00-hero.png")

# Restore enclosure
for name, mats in hero_snap.items():
    obj = bpy.data.objects.get(name)
    if obj and obj.type == "MESH":
        obj.data.materials.clear()
        for m in mats:
            obj.data.materials.append(m)


# Freestyle for per-module
scene.render.use_freestyle = True
vl_fs = scene.view_layers[0]
vl_fs.use_freestyle = True
fs = vl_fs.freestyle_settings
fs.crease_angle = math.radians(140)
ls = fs.linesets[0]
ls.select_silhouette = True
ls.select_border = True
ls.select_crease = True
if ls.linestyle is None:
    ls.linestyle = bpy.data.linestyles.new("focal_outline")
ls.linestyle.color = (0.05, 0.08, 0.12)
ls.linestyle.thickness = 1.4

# Per-module palette — two ghosts (translucent enclosure + solid grey rest)
GHOST_LIGHT = bpy.data.materials.new("ghost_light")
GHOST_LIGHT.use_nodes = True
gl = GHOST_LIGHT.node_tree.nodes["Principled BSDF"]
gl.inputs["Base Color"].default_value = (0.60, 0.62, 0.65, 1.0)
gl.inputs["Metallic"].default_value = 0.0
gl.inputs["Roughness"].default_value = 0.75

ENCLOSURE_GHOST = bpy.data.materials.new("enclosure_ghost")
ENCLOSURE_GHOST.use_nodes = True
eg = ENCLOSURE_GHOST.node_tree.nodes["Principled BSDF"]
eg.inputs["Base Color"].default_value = (0.85, 0.86, 0.88, 1.0)
eg.inputs["Metallic"].default_value = 0.0
eg.inputs["Roughness"].default_value = 0.5
eg.inputs["Alpha"].default_value = 0.18
ENCLOSURE_GHOST.blend_method = "BLEND"

structure_names = set(o.name for o in MODULE_OBJECTS.get("structure_containment", []))

all_orig = {}
for obj in bpy.data.objects:
    if obj.type == "MESH" and obj.data and obj.data.materials:
        all_orig[obj.name] = list(obj.data.materials)


def apply_focal_palette(focal_module_id):
    focal_names = set(o.name for o in MODULE_OBJECTS.get(focal_module_id, []))
    for obj_name, orig_mats in all_orig.items():
        obj = bpy.data.objects.get(obj_name)
        if obj is None:
            continue
        obj.data.materials.clear()
        if obj_name in focal_names:
            for m in orig_mats:
                obj.data.materials.append(m)
        elif obj_name in structure_names and focal_module_id != "structure_containment":
            obj.data.materials.append(ENCLOSURE_GHOST)
        else:
            obj.data.materials.append(GHOST_LIGHT)


for module_id, mod_objs in MODULE_OBJECTS.items():
    if not mod_objs:
        continue
    apply_focal_palette(module_id)
    clear_cameras()
    bbox_mod = compute_scene_bbox()
    cams_mod = nine_shot_cameras(bbox_mod)
    fr = cams_mod[1]
    setup_camera(loc=fr["loc"], target=fr["target"], ortho_scale=fr["ortho_scale"])
    scene.render.filepath = str(OUT / f"module-{module_id}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[ev-charger] module-{module_id}.png")

for obj_name, orig_mats in all_orig.items():
    obj = bpy.data.objects.get(obj_name)
    if obj is None:
        continue
    obj.data.materials.clear()
    for m in orig_mats:
        obj.data.materials.append(m)

print(f"[ev-charger] DONE — {OUT}")
