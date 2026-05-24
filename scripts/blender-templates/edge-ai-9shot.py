"""edge-ai-9shot.py — 1U rack-mount edge inference appliance.

Source: iter-64-edge-ai-v4. Envelope 438 × 450 × 43.5 mm (full-depth 1U server).
Air-cooled (no fluid). 8 modules — control_compute_communication is the dominant
one (CPU + memory + storage + AI accelerator + NIC).

Layout (view from front looking in along +Y):
  Front bezel (y 0): LCD + LED bar + power switch + fascia
  Front bay (y 0.02–0.10): hot-swap fan row (6 small axial fans)
  Compute bay (y 0.10–0.32): motherboard with CPU + heatsink + memory DIMMs
                              + storage bays + AI accelerator card (full-height
                              PCIe Gen5 on riser)
  Rear bay (y 0.32–0.45): PSU + I/O panel (back of motherboard) + power harness

Run:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P edge-ai-9shot.py
"""
import bpy
import os
import math
import mathutils
from pathlib import Path

bpy.ops.wm.read_factory_settings(use_empty=True)

POC_DIR = Path(__file__).parent
OUT = Path(os.environ.get("BLENDER_OUT_DIR", str(POC_DIR / "out-edge-ai-9shot")))
OUT.mkdir(parents=True, exist_ok=True)

W = 0.438
D = 0.450
H = 0.0435

MODULE_OBJECTS: dict = {k: [] for k in [
    "control_compute_communication", "structure_containment",
    "energy_conversion_transduction", "power_distribution",
    "environmental_interface", "hmi_ergonomics",
    "maintenance_serviceability", "sensing_instrumentation",
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
    "enclosure":  make_mat("m_enclosure",  (0.55, 0.56, 0.58), metallic=0.4, roughness=0.55),
    "cpu":        make_mat("m_cpu",        (0.15, 0.50, 1.00), metallic=0.2, roughness=0.4),
    "accelerator": make_mat("m_accel",     (1.00, 0.30, 0.00), metallic=0.0, roughness=0.45),
    "memory":     make_mat("m_memory",     (0.62, 0.05, 0.95), metallic=0.0, roughness=0.5),
    "storage":    make_mat("m_storage",    (0.10, 0.55, 0.65), metallic=0.3, roughness=0.4),
    "pcb":        make_mat("m_pcb",        (0.00, 0.75, 0.15), metallic=0.0, roughness=0.5),
    "nic":        make_mat("m_nic",        (0.05, 0.42, 1.00), metallic=0.0, roughness=0.4),
    "psu":        make_mat("m_psu",        (0.02, 0.18, 0.95), metallic=0.0, roughness=0.45),
    "vrm":        make_mat("m_vrm",        (1.00, 0.55, 0.00), metallic=0.0, roughness=0.5),
    "powerdist":  make_mat("m_pdist",      (0.18, 0.20, 0.24), metallic=0.5, roughness=0.5),
    "copper":     make_mat("m_copper",     (1.00, 0.45, 0.00), metallic=0.1, roughness=0.4),
    "fan":        make_mat("m_fan",        (0.18, 0.20, 0.25), metallic=0.0, roughness=0.6),
    "heatsink":   make_mat("m_heatsink",   (0.85, 0.86, 0.88), metallic=0.6, roughness=0.3),
    "thermal":    make_mat("m_thermal",    (0.00, 0.80, 0.95), metallic=0.05, roughness=0.4),
    "sensor":     make_mat("m_sensing",    (0.00, 0.92, 0.10), metallic=0.0, roughness=0.5),
    "hmi":        make_mat("m_hmi",        (0.05, 0.42, 1.00), metallic=0.0, roughness=0.4),
    "maint":      make_mat("m_maint",      (1.00, 0.10, 0.55), metallic=0.0, roughness=0.5),
    "ctrl_black": make_mat("m_ctrl",       (0.05, 0.08, 0.12), metallic=0.3, roughness=0.4),
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


# ═══════ Module — structure_containment ═══════
WALL_T = 0.002
# Base tray
add_box("ea1_base", (W/2, D/2, WALL_T/2), (W, D, WALL_T), MAT["enclosure"], "structure_containment")
# Top cover
add_box("ea1_top", (W/2, D/2, H - WALL_T/2), (W, D, WALL_T), MAT["enclosure"], "structure_containment")
# Side walls
add_box("ea1_side_L", (WALL_T/2, D/2, H/2), (WALL_T, D, H), MAT["enclosure"], "structure_containment")
add_box("ea1_side_R", (W - WALL_T/2, D/2, H/2), (WALL_T, D, H), MAT["enclosure"], "structure_containment")
# Back panel
add_box("ea1_back", (W/2, D - WALL_T/2, H/2), (W, WALL_T, H), MAT["enclosure"], "structure_containment")
# Front panel — main face minus screen + LED cutouts (we'll just draw it solid)
add_box("ea1_front", (W/2, WALL_T/2, H/2), (W, WALL_T, H), MAT["enclosure"], "structure_containment")
# Rack mounting ears (left + right tabs sticking out)
for sx, side in [(-0.012, "L"), (W + 0.012, "R")]:
    add_box(f"ea1_rack_ear_{side}", (sx, 0.04, H/2), (0.024, 0.04, H), MAT["enclosure"], "structure_containment")
# Internal bulkhead (between fan bay and compute bay)
add_box("ea1_bulkhead", (W/2, 0.10, H/2), (W - 0.02, 0.002, H * 0.6), MAT["enclosure"], "structure_containment")


# ═══════ Module — environmental_interface (fans + thermal + EMC + duct) ════
# 6 hot-swap axial fans across the front
FAN_R = 0.018
for i in range(6):
    fx = 0.05 + i * 0.064
    add_cyl(f"ea7_fan_shroud_{i}", (fx, 0.05, H/2), 0.020, 0.025, MAT["enclosure"], "environmental_interface",
            rotation=(math.radians(90), 0, 0))
    add_cyl(f"ea7_fan_hub_{i}", (fx, 0.05, H/2), 0.005, 0.025, MAT["fan"], "environmental_interface",
            rotation=(math.radians(90), 0, 0))
    # Fan blades — 5 small angled vanes
    for j in range(5):
        ang = math.radians(j * 72)
        bx = fx + FAN_R * 0.5 * math.cos(ang)
        bz = H/2 + FAN_R * 0.5 * math.sin(ang)
        add_box(f"ea7_fan_blade_{i}_{j}", (bx, 0.05, bz), (0.005, 0.024, 0.012), MAT["fan"], "environmental_interface",
                rotation=(math.radians(15), 0, ang))
# CPU thermal solution — large finned heatsink in compute bay
add_box("ea7_cpu_hs", (W * 0.35, D * 0.40, H/2 + 0.005), (0.10, 0.10, H - 0.012), MAT["heatsink"], "environmental_interface")
# Heatsink fins (visible)
for i in range(8):
    add_box(f"ea7_cpu_fin_{i}", (W * 0.30 + i * 0.013, D * 0.40, H/2 + 0.012), (0.002, 0.10, 0.020), MAT["heatsink"], "environmental_interface")
# Accelerator thermal solution (separate heatsink on AI card)
add_box("ea7_accel_hs", (W * 0.70, D * 0.40, H/2 + 0.008), (0.16, 0.04, H - 0.018), MAT["heatsink"], "environmental_interface")
for i in range(10):
    add_box(f"ea7_accel_fin_{i}", (W * 0.62 + i * 0.017, D * 0.40, H/2 + 0.014), (0.002, 0.04, 0.016), MAT["heatsink"], "environmental_interface")
# Thermal fan controller (small PCB)
add_box("ea7_fan_ctrl", (0.02, D * 0.18, H/2), (0.03, 0.03, 0.008), MAT["thermal"], "environmental_interface")
# Air duct assembly (sheet metal baffle channeling air over CPU)
add_box("ea7_air_duct", (W * 0.35, D * 0.30, H - 0.004), (0.18, 0.16, 0.003), MAT["thermal"], "environmental_interface")
# EMC shielding (cage around motherboard)
add_box("ea7_emc_shield", (W * 0.50, D * 0.40, H * 0.85), (W - 0.06, 0.36, 0.002), MAT["copper"], "environmental_interface")


# ═══════ Module — control_compute_communication (the heart) ════════════════
# Motherboard PCB (large green slab covering most of the floor)
add_box("ea_motherboard", (W/2, D * 0.40, 0.008), (W - 0.04, 0.30, 0.0035), MAT["pcb"], "control_compute_communication")
# x86 compute node — CPU socket area (square dark chip under heatsink)
add_box("ea_cpu", (W * 0.35, D * 0.40, 0.013), (0.06, 0.06, 0.005), MAT["cpu"], "control_compute_communication")
# Memory subsystem — 8 DIMM slots (4 per side of CPU)
for i in range(4):
    add_box(f"ea_dimm_A_{i}", (W * 0.20, D * 0.30 + i * 0.022, 0.011), (0.10, 0.005, 0.012), MAT["memory"], "control_compute_communication")
    add_box(f"ea_dimm_B_{i}", (W * 0.20, D * 0.48 + i * 0.022, 0.011), (0.10, 0.005, 0.012), MAT["memory"], "control_compute_communication")
# Storage subsystem — 2 NVMe SSD M.2 slots
add_box("ea_nvme_1", (W * 0.50, D * 0.55, 0.011), (0.08, 0.022, 0.004), MAT["storage"], "control_compute_communication")
add_box("ea_nvme_2", (W * 0.60, D * 0.55, 0.011), (0.08, 0.022, 0.004), MAT["storage"], "control_compute_communication")
# AI accelerator card — full-height PCIe GPU on riser, lies flat in 1U
add_box("ea_accel_card_pcb", (W * 0.70, D * 0.40, 0.014), (0.20, 0.10, 0.003), MAT["pcb"], "control_compute_communication")
add_box("ea_accel_chip", (W * 0.70, D * 0.40, 0.018), (0.06, 0.06, 0.005), MAT["accelerator"], "control_compute_communication")
# Network interface — 2 SFP+ ports on rear
add_box("ea_nic_pcb", (W * 0.85, D * 0.55, 0.010), (0.08, 0.06, 0.003), MAT["pcb"], "control_compute_communication")
for i in range(2):
    add_box(f"ea_sfp_port_{i}", (W * 0.85 + i * 0.024, D - 0.005, 0.014), (0.016, 0.012, 0.010), MAT["nic"], "control_compute_communication")
# Watchdog timer circuit (small chip near CPU)
add_box("ea_watchdog", (W * 0.42, D * 0.30, 0.011), (0.012, 0.012, 0.003), MAT["nic"], "control_compute_communication")


# ═══════ Module — energy_conversion_transduction ═══════
# Primary AC-DC PSU — rectangular box at rear-left
add_box("ea_psu", (W * 0.15, D * 0.85, H/2), (0.12, 0.16, H - 0.008), MAT["psu"], "energy_conversion_transduction")
# CPU VRM stage (set of small DC-DC converters near CPU)
for i in range(4):
    add_box(f"ea_cpu_vrm_{i}", (W * 0.30 - i * 0.018, D * 0.30, 0.014), (0.014, 0.024, 0.008), MAT["vrm"], "energy_conversion_transduction")
# Accelerator VRM stage
for i in range(4):
    add_box(f"ea_accel_vrm_{i}", (W * 0.62 + i * 0.018, D * 0.30, 0.014), (0.014, 0.024, 0.008), MAT["vrm"], "energy_conversion_transduction")
# Memory VRM stage
for i in range(2):
    add_box(f"ea_mem_vrm_{i}", (W * 0.18, D * 0.55 + i * 0.022, 0.014), (0.010, 0.018, 0.006), MAT["vrm"], "energy_conversion_transduction")


# ═══════ Module — power_distribution ═══════
# Power distribution board (PDB next to PSU)
add_box("ea_pdb", (W * 0.30, D * 0.85, 0.014), (0.16, 0.08, 0.005), MAT["powerdist"], "power_distribution")
# Main DC harness (cable from PSU to PDB)
add_cyl("ea_main_dc_harness", (W * 0.20, D * 0.85, H * 0.50), 0.006, 0.10, MAT["copper"], "power_distribution",
        rotation=(0, math.radians(90), 0))
# PCIe power harness
add_cyl("ea_pcie_harness", (W * 0.55, D * 0.60, 0.018), 0.004, 0.30, MAT["copper"], "power_distribution",
        rotation=(0, math.radians(90), 0))
# Peripheral power harness
add_cyl("ea_periph_harness", (W * 0.45, D * 0.75, 0.018), 0.003, 0.20, MAT["copper"], "power_distribution",
        rotation=(0, math.radians(90), 0))


# ═══════ Module — sensing_instrumentation ═══════
# Thermal sensor array (5 small green dots — CPU, accel, ambient, PSU, intake)
for i, (sx, sy) in enumerate([(W * 0.35, D * 0.40), (W * 0.70, D * 0.40), (W * 0.50, D * 0.12), (W * 0.15, D * 0.85), (W * 0.50, D * 0.18)]):
    add_cyl(f"ea4_thermal_{i}", (sx, sy, 0.020), 0.005, 0.005, MAT["sensor"], "sensing_instrumentation")
# Fan speed monitors (tach circuits on each fan — small markers)
for i in range(6):
    fx = 0.05 + i * 0.064
    add_cyl(f"ea4_fan_tach_{i}", (fx, 0.045, H/2 + 0.018), 0.003, 0.003, MAT["sensor"], "sensing_instrumentation")
# Voltage monitoring circuit
add_box("ea4_v_monitor", (W * 0.45, D * 0.30, 0.014), (0.02, 0.02, 0.005), MAT["sensor"], "sensing_instrumentation")
# Chassis intrusion switch (lever on top cover)
add_box("ea4_intrusion", (W * 0.10, D * 0.92, H - 0.005), (0.012, 0.006, 0.004), MAT["sensor"], "sensing_instrumentation")


# ═══════ Module — hmi_ergonomics ═══════
# Front LCD module (small status display)
add_box("ea3_lcd", (W * 0.20, 0.001, H/2), (0.08, 0.002, 0.018), MAT["hmi"], "hmi_ergonomics")
# Status LED array (vertical strip)
for i, c in enumerate([MAT["sensor"], MAT["vrm"], MAT["accelerator"]]):
    add_cyl(f"ea3_led_{i}", (W * 0.30 + i * 0.012, 0.001, H/2), 0.0035, 0.004, c, "hmi_ergonomics",
            rotation=(math.radians(90), 0, 0))
# Operator switch panel (power button + reset)
add_cyl("ea3_power_btn", (W * 0.10, 0.001, H/2), 0.005, 0.004, MAT["maint"], "hmi_ergonomics",
        rotation=(math.radians(90), 0, 0))
add_cyl("ea3_reset_btn", (W * 0.12, 0.001, H/2), 0.003, 0.004, MAT["maint"], "hmi_ergonomics",
        rotation=(math.radians(90), 0, 0))
# Front bezel fascia (mostly aesthetic ribbon)
add_box("ea3_bezel", (W/2, 0.0005, H * 0.85), (W - 0.04, 0.001, H * 0.25), MAT["enclosure"], "hmi_ergonomics")


# ═══════ Module — maintenance_serviceability ═══════
# Hot-swap fan carrier handles (magenta ring on each fan)
for i in range(6):
    fx = 0.05 + i * 0.064
    add_box(f"ea10_fan_handle_{i}", (fx, 0.020, H - 0.008), (0.018, 0.004, 0.008), MAT["maint"], "maintenance_serviceability")
# Toolless rack rails (slide rails on each side, inside view)
add_box("ea10_rail_L", (0.002, D/2, H/2), (0.002, D - 0.04, 0.012), MAT["maint"], "maintenance_serviceability")
add_box("ea10_rail_R", (W - 0.002, D/2, H/2), (0.002, D - 0.04, 0.012), MAT["maint"], "maintenance_serviceability")
# Chassis access mechanism (toolless latch on top cover)
add_box("ea10_top_latch", (W * 0.95, D/2, H - 0.001), (0.012, 0.020, 0.003), MAT["maint"], "maintenance_serviceability")
# Service label set (4 small labels on top)
for i in range(4):
    add_box(f"ea10_label_{i}", (W * 0.20 + i * 0.10, D * 0.80, H - 0.001), (0.03, 0.02, 0.001), MAT["maint"], "maintenance_serviceability")


# ─── Lighting ─────────────────────────────────────────────────
bpy.ops.object.light_add(type="SUN", location=(0.5, -0.5, 1.0))
sun = bpy.context.active_object
sun.data.energy = 3.0
sun.rotation_euler = (math.radians(55), math.radians(20), math.radians(35))

bpy.ops.object.light_add(type="AREA", location=(W/2, D/2, 0.6))
fill = bpy.context.active_object
fill.data.energy = 40
fill.data.size = 1.2

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
    max_dim = max(xmax-xmin, ymax-ymin, zmax-zmin)
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


bbox = compute_scene_bbox()
cams = nine_shot_cameras(bbox)
for cam_spec in cams:
    clear_cameras()
    setup_camera(loc=cam_spec["loc"], target=cam_spec["target"], ortho_scale=cam_spec["ortho_scale"])
    scene.render.filepath = str(OUT / f"{cam_spec['name']}.png")
    bpy.ops.render.render(write_still=True)
    print(f"[edge-ai] {cam_spec['name']}.png")


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
# For flat form factors (1U server), bbox Z is tiny compared to X/Y. Don't let
# max_dim collapse the iso view — use the horizontal max for orthoscale.
horizontal_max = max(xmax-xmin, ymax-ymin)
hero_diag = horizontal_max * 1.6 / math.sqrt(2)
setup_camera(loc=(cx + hero_diag, cy - hero_diag, cz + horizontal_max * 0.55),
             target=(cx, cy, cz), ortho_scale=horizontal_max * 1.10)
scene.render.filepath = str(OUT / "00-hero.png")
bpy.ops.render.render(write_still=True)
print("[edge-ai] 00-hero.png")

for name, mats in hero_snap.items():
    obj = bpy.data.objects.get(name)
    if obj and obj.type == "MESH":
        obj.data.materials.clear()
        for m in mats:
            obj.data.materials.append(m)


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
    print(f"[edge-ai] module-{module_id}.png")

for obj_name, orig_mats in all_orig.items():
    obj = bpy.data.objects.get(obj_name)
    if obj is None:
        continue
    obj.data.materials.clear()
    for m in orig_mats:
        obj.data.materials.append(m)

print(f"[edge-ai] DONE — {OUT}")
