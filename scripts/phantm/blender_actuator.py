"""PHANTM fixed design — 3D Blender model (Tony-CAD colour language).

Run:  blender -b -P blender_actuator.py -- out/render-3d-fixed.png
Workbench engine (solid object colours, deterministic, fast headless).
All dims mm; fixed design: gap 20 µm, bridge/PM section ×1.5, spacing 390 µm.
"""
import sys

import bpy

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "out/render-3d-fixed.png"

GOLD = (0.91, 0.79, 0.42, 1)
STEEL = (0.60, 0.64, 0.68, 1)
RED = (0.75, 0.23, 0.17, 1)
CYAN = (0.21, 0.77, 0.84, 1)

P, T = 0.464, 0.232
HT = 1.549 / 2
CORE = 1.549 - 2 * 0.465
G = 0.020
SS_AX, SS_TR, SS_D, SS_SLOT = 1.16, 1.708, 0.465, 0.155
SPACING = 0.390
BR_AX, BR_TR = 0.348, 1.162          # bridge axial (×1.5) × transverse width
PM_L = 0.243

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)


def box(name, cx, cy, cz, dx, dy, dz, color):
    bpy.ops.mesh.primitive_cube_add(location=(cx, cy, cz))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (dx / 2, dy / 2, dz / 2)
    ob.color = color
    return ob


# translator: core + teeth both faces (x = axis, y = transverse, z = radial)
box("core", 6.25 - 2.0, 0, 0, 12.5, 1.55, CORE, GOLD)
for k in range(26):
    x = -2.0 + 0.232 + k * P + T / 2
    for s in (1, -1):
        box(f"tooth{k}{s}", x, 0, s * (CORE / 2 + 0.465 / 2), T, 1.55, 0.465, GOLD)

# 3 poles
for kp in range(3):
    px = kp * (SS_AX + SPACING) + T / 2  # pole tooth grid aligned to translator teeth
    for s in (1, -1):
        zs = s * (HT + G + SS_SLOT + (SS_D - SS_SLOT) / 2)
        box(f"back{kp}{s}", px + SS_AX / 2 - T / 2, 0, zs + s * 0, SS_AX, SS_TR,
            SS_D - SS_SLOT, STEEL)
        for j in range(3):
            tx = px + j * P
            box(f"ptooth{kp}{s}{j}", tx, 0, s * (HT + G + SS_SLOT / 2), T, SS_TR,
                SS_SLOT, STEEL)
    # bridge: limb at transverse end + two arms
    ylimb = SS_TR / 2 + 0.35
    xmid = px + SS_AX / 2 - T / 2
    span = HT + G + SS_D
    box(f"limb{kp}", xmid, ylimb, 0, BR_AX, 0.232, 2 * span, STEEL)
    for s in (1, -1):
        box(f"arm{kp}{s}", xmid, SS_TR / 2 - BR_TR / 2 + 0.35 / 2 + 0.116, s * (span - (SS_D - SS_SLOT) / 2),
            BR_AX, BR_TR + 0.35, SS_D - SS_SLOT, STEEL)
    # coil around limb (red frame of 4 boxes) + magnet inline
    cw = 0.16
    zc = 0.55
    for dy, dz, sy, sz in ((0.232 / 2 + cw / 2, 0, cw, 0.9),
                           (-(0.232 / 2 + cw / 2), 0, cw, 0.9),
                           (0, 0.45 + cw / 2, 0.232 + 2 * cw, cw),
                           (0, -(0.45 + cw / 2), 0.232 + 2 * cw, cw)):
        box(f"coil{kp}{dy}{dz}", xmid, ylimb + dy, zc + dz,
            BR_AX + 0.10, sy, 0.9 if sz == 0.9 else sz, RED)
    box(f"pm{kp}", xmid, ylimb - 0.02, -0.45, BR_AX + 0.06, 0.30, PM_L, CYAN)

# light + camera + world
bpy.ops.object.light_add(type="SUN", location=(10, -10, 20))
bpy.context.object.data.energy = 3
bpy.ops.object.camera_add(location=(8.6, -7.8, 5.6))
cam = bpy.context.object
cam.rotation_euler = (1.05, 0, 0.81)
cam.data.type = "ORTHO"
cam.data.ortho_scale = 9.5
bpy.context.scene.camera = cam

sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"
sc.display.shading.color_type = "OBJECT"
sc.display.shading.show_object_outline = True
sc.render.resolution_x, sc.render.resolution_y = 1800, 1000
sc.render.film_transparent = False
sc.world = bpy.data.worlds.new("w")
sc.world.color = (0.93, 0.94, 0.96)
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("rendered", OUT)
