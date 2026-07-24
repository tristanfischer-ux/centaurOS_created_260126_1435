"""PHANTM hex-cell array + actuator integration — 3D model (Tony-CAD colours).

7-hex sub-array (interior 3.10, wall 0.15, pitch 3.25, depth 7.75), front cell
cut away to show the moving foil short + actuator behind it; aperture PCB
(green) with Ø2.6 clearance holes behind the lattice; translator tails through.

Run: blender -b -P blender_hexcell.py -- out/render-3d-hexcell.png
"""
import math
import sys

import bpy

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "out/render-3d-hexcell.png"

GOLD = (0.91, 0.79, 0.42, 1)
STEEL = (0.60, 0.64, 0.68, 1)
RED = (0.75, 0.23, 0.17, 1)
CYAN = (0.21, 0.77, 0.84, 1)
GREEN = (0.18, 0.49, 0.31, 1)
GREY = (0.80, 0.81, 0.83, 1)

AF, W, PITCH, DEP = 3.10, 0.15, 3.25, 7.75

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)


def box(name, cx, cy, cz, dx, dy, dz, color, rz=0.0):
    bpy.ops.mesh.primitive_cube_add(location=(cx, cy, cz))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (dx / 2, dy / 2, dz / 2)
    ob.rotation_euler = (0, 0, rz)
    ob.color = color
    return ob


def hex_walls(cx, cy, z0, z1, skip=()):
    """Six wall slabs of one cell; slab k spans flat k (normal at angle k*60)."""
    side = AF / math.sqrt(3) + W  # slab length covers the corner joints
    r = (AF + W) / 2              # wall centreline radius
    for k in range(6):
        if k in skip:
            continue
        a = math.radians(k * 60)
        box(f"w{cx:.1f}{cy:.1f}{k}", cx + r * math.cos(a), cy + r * math.sin(a),
            (z0 + z1) / 2, W, side, z1 - z0, GREY, rz=a)


# 7-cell tile: centre + ring (hex packing, pitch across flats)
centres = [(0.0, 0.0)] + [(PITCH * math.cos(math.radians(a)),
                           PITCH * math.sin(math.radians(a)))
                          for a in range(0, 360, 60)]
CUT = 1  # cutaway cell = ring cell at (3.25, 0), facing the camera
for i, (cx, cy) in enumerate(centres):
    hex_walls(cx, cy, 0, DEP, skip=(0, 5) if i == CUT else ())

# aperture PCB behind the lattice, with clearance "holes" (rim rings drawn dark)
box("pcb", 0, 0, DEP + 1.3, 12.5, 12.5, 1.6, GREEN)
for cx, cy in centres:
    bpy.ops.mesh.primitive_cylinder_add(radius=1.3, depth=1.7,
                                        location=(cx, cy, DEP + 1.3))
    ob = bpy.context.object
    ob.color = (0.05, 0.10, 0.07, 1)
    ob.name = f"hole{cx:.1f}{cy:.1f}"

# the cutaway cell's hardware: foil short + standoff + translator + stator
cx, cy = centres[CUT]
d_short = 3.4
bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=(AF - 0.3) / math.sqrt(3),
                                    depth=0.06, location=(cx, cy, d_short))
foil = bpy.context.object
foil.color = CYAN
foil.name = "foil"
box("standoff", cx, cy, d_short + 0.35, 0.8, 0.8, 0.6, (0.9, 0.9, 0.9, 1))
box("translator", cx, cy, d_short + 0.7 + 6.25, 1.549, 1.55, 12.5, GOLD)
for s in (1, -1):
    box(f"pole{s}", cx + s * 1.05, cy, DEP + 4.4, 0.5, 1.7, 4.23, STEEL)
    box(f"coil{s}", cx + s * 1.05, cy, DEP + 3.1, 0.85, 1.9, 1.1, RED)

# translator tails through two other holes to show the pattern in use
for i in (2, 3):
    tx, ty = centres[i]
    box(f"tail{i}", tx, ty, DEP + 2.6, 1.549, 1.55, 3.4, GOLD)

# light + camera (track-to target at the stack centre)
bpy.ops.object.empty_add(location=(0, 0, 6.5))
target = bpy.context.object
bpy.ops.object.light_add(type="SUN", location=(15, -18, 25))
sun = bpy.context.object
sun.data.energy = 3
c = sun.constraints.new("TRACK_TO")
c.target = target
bpy.ops.object.camera_add(location=(16, -15, 20))
cam = bpy.context.object
cam.data.type = "ORTHO"
cam.data.ortho_scale = 24
c = cam.constraints.new("TRACK_TO")
c.target = target
c.track_axis = "TRACK_NEGATIVE_Z"
c.up_axis = "UP_Y"
bpy.context.scene.camera = cam

sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"
sc.display.shading.color_type = "OBJECT"
sc.display.shading.show_object_outline = True
sc.render.resolution_x, sc.render.resolution_y = 1800, 1200
sc.world = bpy.data.worlds.new("w")
sc.world.color = (0.93, 0.94, 0.96)
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("rendered", OUT)
