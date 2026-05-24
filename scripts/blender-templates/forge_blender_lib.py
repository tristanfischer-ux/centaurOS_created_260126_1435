"""forge_blender_lib.py — shared helpers for form-factor Blender scripts.

Refactored 2026-05-17 after building drone + heatpump + ev-charger + edge-ai.
Each form-factor script now imports from this lib instead of inlining helpers.
Keeps form-factor scripts focused on geometry — typically ~200 lines of just
add_box / add_cyl calls.

Usage:
  import sys
  from pathlib import Path
  sys.path.insert(0, str(Path(__file__).parent))
  import forge_blender_lib as fl

  fl.init_scene()
  MAT = fl.make_palette()
  MODULE_OBJECTS = fl.make_module_dict([...])
  fl.add_box("name", (x,y,z), (w,d,h), MAT["..."], "module_id", MODULE_OBJECTS)
  ...
  fl.run_render_pipeline(OUT, MODULE_OBJECTS, MAT, structure_module_id="structure_containment")
"""
import os
import bpy
import math
import mathutils
from pathlib import Path


# Module-level state — populated by add_box / add_cyl / etc.
_module_objects_ref = None


def init_scene():
    """Reset Blender to empty state, configure render engine for engineering output.

    Phase A 2026-05-24 upgrades:
      - Resolution 1600×1100 → 2400×1600 (sharper PDF embed)
      - Eevee SSR (screen-space reflections) — adds depth to glossy components
      - Eevee Ambient Occlusion — adds soft shadows between components
      - Eevee Bloom subtle — gentle highlight glow
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    # Engine: prefer EEVEE_NEXT on Blender 5.x; fall back to legacy EEVEE
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except (TypeError, ValueError):
            continue
    scene.render.resolution_x = 2400
    scene.render.resolution_y = 1600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.exposure = 0.0
    scene.view_settings.view_transform = "Standard"
    # Eevee quality boosts — names vary between Blender 4.x EEVEE and 5.x EEVEE_NEXT.
    # Set attributes defensively; ignore AttributeError when an engine version
    # doesn't expose a given prop.
    eevee = getattr(scene, "eevee", None)
    if eevee is not None:
        for attr, val in [
            ("use_ssr", True), ("use_ssr_refraction", True),
            ("use_gtao", True), ("gtao_distance", 0.4), ("gtao_factor", 0.8),
            ("use_bloom", True), ("bloom_intensity", 0.015), ("bloom_threshold", 1.5),
            ("taa_render_samples", 64),
            ("use_soft_shadows", True),
        ]:
            try:
                setattr(eevee, attr, val)
            except (AttributeError, TypeError):
                continue


def init_scene_cycles_hero():
    """Switch the renderer to Cycles for the hero pass — slower but produces
    proper ray-traced shadows + ambient occlusion + reflections. Restore
    Eevee via init_scene_back_to_eevee() after the hero render.

    Phase B item 8 (2026-05-24): opt-in via run_render_pipeline(...,
    hero_cycles=True). Adds ~30 s to the hero render but produces a CAD-
    presentation-quality cover.
    """
    scene = bpy.context.scene
    try:
        scene.render.engine = "CYCLES"
        cycles = getattr(scene, "cycles", None)
        if cycles is not None:
            for attr, val in [
                ("samples", 64), ("preview_samples", 32),
                ("use_denoising", True), ("denoiser", "OPENIMAGEDENOISE"),
                ("device", "CPU"),  # safe default; Metal/CUDA optional later
            ]:
                try: setattr(cycles, attr, val)
                except (AttributeError, TypeError): continue
    except (TypeError, ValueError):
        pass  # Cycles not available — silently stay in Eevee


def init_scene_back_to_eevee():
    """Restore Eevee renderer after init_scene_cycles_hero()."""
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            return
        except (TypeError, ValueError):
            continue


def make_world_white():
    """Pure white world background."""
    world = bpy.data.worlds.new("world")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    bg.inputs["Strength"].default_value = 1.0


def add_lights(target_centre=(0, 0, 0), sun_energy=3.0, fill_energy=60, fill_size=2.5):
    """Phase A 2026-05-24: 4-light rig for grounded components + soft side fill.
      - KEY SUN at upper-front-right with shadows ON (defines the form)
      - AREA fill from above (soften shadows + add ambient brightness)
      - SIDE AREA fill from -X (lift the left side out of shadow)
      - Drop-shadow plane below the scene (Eevee ground plane with shadow catch)
    """
    cx, cy, cz = target_centre
    # Key sun — casts shadow for grounding
    bpy.ops.object.light_add(type="SUN", location=(cx + 2, cy - 3, cz + 5))
    sun = bpy.context.active_object
    sun.data.energy = sun_energy
    sun.rotation_euler = (math.radians(55), math.radians(20), math.radians(35))
    try:
        sun.data.use_shadow = True
        sun.data.angle = math.radians(3.0)  # slight softness on shadow edges
    except AttributeError:
        pass
    # Area fill from above (kills harshness on top surfaces)
    bpy.ops.object.light_add(type="AREA", location=(cx, cy, cz + 2.5))
    fill = bpy.context.active_object
    fill.data.energy = fill_energy
    fill.data.size = fill_size
    # NEW: side fill from -X to soften left-side shadows
    bpy.ops.object.light_add(type="AREA", location=(cx - 3.0, cy, cz + 0.5))
    side = bpy.context.active_object
    side.data.energy = fill_energy * 0.35
    side.data.size = fill_size * 0.8
    side.rotation_euler = (0, math.radians(90), 0)
    # NEW: ground plane below to catch drop shadows (subtle grey). Sized to
    # the local fill area; compute_scene_bbox() filters fl_ground* out so
    # the camera doesn't zoom out to fit it.
    ground_size = fill_size * 4
    bpy.ops.mesh.primitive_plane_add(size=ground_size,
                                     location=(cx, cy, cz - fill_size * 0.5))
    ground = bpy.context.active_object
    ground.name = "fl_ground_shadow_catcher"
    mat = bpy.data.materials.new("m_ground")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.97, 0.97, 0.97, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.9
    ground.data.materials.append(mat)


_MAT_KIND_PRESETS = {
    # Phase B item 6 (2026-05-24): named PBR presets — pass kind="painted_steel"
    # etc. to get correct metallic/roughness/clearcoat for the material class.
    "painted_steel":   {"metallic": 0.3, "roughness": 0.55, "clearcoat": 0.2},
    "brushed_alu":     {"metallic": 0.85, "roughness": 0.35},
    "polished_steel":  {"metallic": 0.92, "roughness": 0.18},
    "stainless":       {"metallic": 0.78, "roughness": 0.28},
    "copper":          {"metallic": 0.95, "roughness": 0.32},
    "ceramic":         {"metallic": 0.0,  "roughness": 0.18, "clearcoat": 0.6},
    "polymer":         {"metallic": 0.0,  "roughness": 0.65},
    "polymer_glossy":  {"metallic": 0.0,  "roughness": 0.32, "clearcoat": 0.4},
    "rubber":          {"metallic": 0.0,  "roughness": 0.92},
    "glass":           {"metallic": 0.0,  "roughness": 0.05, "alpha": 0.25, "ior": 1.45},
    "led_emissive":    {"metallic": 0.0,  "roughness": 0.5, "emission_strength": 2.0},
    "carbon_fibre":    {"metallic": 0.2,  "roughness": 0.45, "clearcoat": 0.3},
    "anodised_alu":    {"metallic": 0.65, "roughness": 0.42},
    "concrete":        {"metallic": 0.0,  "roughness": 0.88},
    "pcb":             {"metallic": 0.0,  "roughness": 0.6},
}


def make_mat(name, rgb, metallic=0.0, roughness=0.55, alpha=1.0, kind=None,
             clearcoat=0.0, ior=1.45, emission_strength=0.0):
    """Principled BSDF material. Pass kind="painted_steel" etc. (see
    _MAT_KIND_PRESETS) to load a calibrated PBR preset — explicit metallic /
    roughness / clearcoat / alpha kwargs OVERRIDE the preset values when set.
    """
    preset = _MAT_KIND_PRESETS.get(kind, {}) if kind else {}
    metallic = preset.get("metallic", metallic) if kind and "metallic" not in {} else (preset.get("metallic", metallic))
    roughness = preset.get("roughness", roughness)
    if kind == "glass" and alpha == 1.0:
        alpha = preset.get("alpha", 0.25)
    if kind and clearcoat == 0.0:
        clearcoat = preset.get("clearcoat", 0.0)
    if kind == "led_emissive" and emission_strength == 0.0:
        emission_strength = preset.get("emission_strength", 0.0)
    if kind == "glass":
        ior = preset.get("ior", ior)

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, alpha)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = ior
    # Clearcoat — input name varies between Blender 4.x ("Clearcoat") and
    # 5.x EEVEE_NEXT ("Coat Weight"). Defensive lookup.
    for cc_name in ("Coat Weight", "Clearcoat"):
        if cc_name in bsdf.inputs:
            try: bsdf.inputs[cc_name].default_value = clearcoat
            except (AttributeError, TypeError): pass
            break
    # Emission for led_emissive
    if emission_strength > 0.0:
        for ec_name in ("Emission Color", "Emission"):
            if ec_name in bsdf.inputs:
                try: bsdf.inputs[ec_name].default_value = (*rgb, 1.0)
                except (AttributeError, TypeError): pass
                break
        if "Emission Strength" in bsdf.inputs:
            try: bsdf.inputs["Emission Strength"].default_value = emission_strength
            except (AttributeError, TypeError): pass
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    return mat


def make_default_palette():
    """Standard Forge engineering palette — pure pigments, amber-not-yellow for
    legibility on white background. Used by all form factors as the base. Each
    form factor can extend with form-factor-specific colours.
    """
    return {
        "enclosure":   make_mat("m_enclosure",   (0.55, 0.56, 0.58), metallic=0.4, roughness=0.55),
        "battery":     make_mat("m_battery",     (0.02, 0.18, 0.95), metallic=0.0, roughness=0.45),
        "motor":       make_mat("m_motor",       (0.15, 0.50, 1.00), metallic=0.2, roughness=0.4),
        "rotor_cap":   make_mat("m_rotor",       (1.00, 0.30, 0.00), metallic=0.0, roughness=0.4),
        "compressor":  make_mat("m_compressor",  (0.15, 0.50, 1.00), metallic=0.2, roughness=0.4),
        "inverter":    make_mat("m_inverter",    (0.62, 0.05, 0.95), metallic=0.0, roughness=0.5),
        "gimbal":      make_mat("m_gimbal",      (0.00, 0.55, 0.65), metallic=0.1, roughness=0.45),
        "lens":        make_mat("m_lens",        (0.02, 0.04, 0.10), metallic=0.4, roughness=0.2),
        "sensor":      make_mat("m_sensing",     (0.00, 0.92, 0.10), metallic=0.0, roughness=0.5),
        "pcb":         make_mat("m_pcb",         (0.00, 0.75, 0.15), metallic=0.0, roughness=0.5),
        "fc":          make_mat("m_fc",          (1.00, 0.55, 0.00), metallic=0.0, roughness=0.5),  # AMBER
        "control":     make_mat("m_control",     (1.00, 0.55, 0.00), metallic=0.0, roughness=0.5),  # alias
        "powerdist":   make_mat("m_pdist",       (0.18, 0.20, 0.24), metallic=0.5, roughness=0.5),
        "copper":      make_mat("m_copper",      (1.00, 0.45, 0.00), metallic=0.1, roughness=0.4),
        "aluminium":   make_mat("m_alu",         (0.45, 0.70, 0.95), metallic=0.1, roughness=0.4),
        "safety":      make_mat("m_safety",      (1.00, 0.00, 0.00), metallic=0.0, roughness=0.5),
        "maint":       make_mat("m_maint",       (1.00, 0.10, 0.55), metallic=0.0, roughness=0.5),  # MAGENTA
        "hmi":         make_mat("m_hmi",         (0.05, 0.42, 1.00), metallic=0.0, roughness=0.4),
        "antenna":     make_mat("m_antenna",     (0.10, 0.12, 0.18), metallic=0.4, roughness=0.5),
        "thermal":     make_mat("m_thermal",     (0.00, 0.80, 0.95), metallic=0.05, roughness=0.4),
        "heatsink":    make_mat("m_heatsink",    (0.85, 0.86, 0.88), metallic=0.6, roughness=0.3),
        "fluid_water": make_mat("m_water",       (0.10, 0.40, 0.85), metallic=0.5, roughness=0.3),
        "stainless":   make_mat("m_stainless",   (0.85, 0.86, 0.88), metallic=0.7, roughness=0.3),
        "ctrl_black":  make_mat("m_ctrl",        (0.05, 0.08, 0.12), metallic=0.3, roughness=0.4),
    }


# ─── Geometry primitive helpers ──────────────────────────────────────────


def add_box(name, location, size, material, module=None, module_objects=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if module and module_objects is not None:
        module_objects[module].append(obj)
    return obj


def add_cyl(name, location, radius, height, material, module=None, module_objects=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(location=location, radius=radius, depth=height, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    if module and module_objects is not None:
        module_objects[module].append(obj)
    return obj


def add_torus(name, location, major_radius, minor_radius, material, module=None, module_objects=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(location=location, major_radius=major_radius, minor_radius=minor_radius, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    if module and module_objects is not None:
        module_objects[module].append(obj)
    return obj


def add_sphere(name, location, radius, material, module=None, module_objects=None):
    bpy.ops.mesh.primitive_uv_sphere_add(location=location, radius=radius)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    if module and module_objects is not None:
        module_objects[module].append(obj)
    return obj


# ─── Phase B item 5 (2026-05-24): expanded primitive vocabulary ─────────
# Compound shapes that read as recognisable engineering components rather
# than generic boxes/cylinders. Each composes 2-4 basic primitives.


def add_frustum(name, location, radius_bottom, radius_top, height, material,
                module=None, module_objects=None, rotation=(0, 0, 0), vertices=24):
    """Truncated cone — for bulkheads, tank end-caps, motor housings."""
    bpy.ops.mesh.primitive_cone_add(
        radius1=radius_bottom, radius2=radius_top, depth=height,
        location=location, rotation=rotation, vertices=vertices,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    if module and module_objects is not None:
        module_objects[module].append(obj)
    return obj


def add_pipe(name, points, radius, material, module=None, module_objects=None, bevel_segments=4):
    """Bezier-curve extruded pipe — for refrigerant lines, cable runs, ducts.
    `points` is a list of (x,y,z) tuples defining the path. The mesh tube
    is generated by adding a curve + setting a bevel depth = radius."""
    if len(points) < 2:
        return None
    curve_data = bpy.data.curves.new(name + "_curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = bevel_segments
    polyline = curve_data.splines.new("POLY")
    polyline.points.add(len(points) - 1)  # one already exists
    for i, (x, y, z) in enumerate(points):
        polyline.points[i].co = (x, y, z, 1.0)
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    # Convert curve to mesh so material assignment + Freestyle work consistently
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    if module and module_objects is not None:
        module_objects[module].append(obj)
    return obj


def add_compound_motor(name, location, body_radius, body_length, material_body,
                       material_shaft=None, material_flange=None,
                       module=None, module_objects=None, rotation=(0, 0, 0)):
    """Motor compound — cylinder body + shaft sticking out one end + mounting flange.
    For: pumps, compressors, fan motors, servo drives.
    Total length = body_length + body_length*0.3 shaft. Aligned along +Z by default."""
    parts = []
    body = add_cyl(f"{name}_body", location, body_radius, body_length, material_body,
                   module=module, module_objects=module_objects, rotation=rotation)
    parts.append(body)
    sx, sy, sz = location
    shaft_mat = material_shaft or material_body
    shaft = add_cyl(f"{name}_shaft", (sx, sy, sz + body_length * 0.65),
                    body_radius * 0.18, body_length * 0.4, shaft_mat,
                    module=module, module_objects=module_objects, rotation=rotation)
    parts.append(shaft)
    flange_mat = material_flange or material_body
    flange = add_cyl(f"{name}_flange", (sx, sy, sz - body_length * 0.45),
                     body_radius * 1.3, body_length * 0.05, flange_mat,
                     module=module, module_objects=module_objects, rotation=rotation)
    parts.append(flange)
    return parts


def add_compound_vessel(name, location, radius, height, material_body,
                        material_end=None, num_ports=4, material_port=None,
                        module=None, module_objects=None):
    """Cylindrical vessel + hemispherical end caps + N radial port stubs.
    For: pressure vessels, tanks, reactors, separators."""
    parts = []
    sx, sy, sz = location
    body = add_cyl(f"{name}_body", location, radius, height, material_body,
                   module=module, module_objects=module_objects)
    parts.append(body)
    end_mat = material_end or material_body
    top = add_sphere(f"{name}_top", (sx, sy, sz + height/2), radius, end_mat,
                     module=module, module_objects=module_objects)
    bot = add_sphere(f"{name}_bot", (sx, sy, sz - height/2), radius, end_mat,
                     module=module, module_objects=module_objects)
    parts += [top, bot]
    port_mat = material_port or material_body
    for i in range(num_ports):
        ang = (i / num_ports) * 2 * math.pi
        px = sx + radius * 1.05 * math.cos(ang)
        py = sy + radius * 1.05 * math.sin(ang)
        port = add_cyl(f"{name}_port_{i}", (px, py, sz),
                       radius * 0.12, radius * 0.5, port_mat,
                       module=module, module_objects=module_objects,
                       rotation=(0, math.radians(90), ang))
        parts.append(port)
    return parts


def add_compound_finned_heatsink(name, location, width, depth, height, material,
                                  n_fins=12, module=None, module_objects=None):
    """Heatsink with vertical fins — for IGBT modules, GPU cards, motor cooling.
    Base plate + N vertical fins evenly spaced along width."""
    parts = []
    sx, sy, sz = location
    base = add_box(f"{name}_base", (sx, sy, sz), (width, depth, height * 0.15), material,
                   module=module, module_objects=module_objects)
    parts.append(base)
    fin_w = width / (n_fins * 2)
    for i in range(n_fins):
        fx = sx - width/2 + width * (i + 0.5) / n_fins
        fin = add_box(f"{name}_fin_{i}", (fx, sy, sz + height * 0.55),
                      (fin_w, depth, height * 0.85), material,
                      module=module, module_objects=module_objects)
        parts.append(fin)
    return parts


# ─── Camera helpers ──────────────────────────────────────────────────────


def compute_scene_bbox():
    xs, ys, zs = [], [], []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        # Phase A item 3 (2026-05-24): skip the shadow-catcher ground plane —
        # otherwise its large extent inflates the bbox + camera zooms out.
        if obj.name.startswith("fl_ground"):
            continue
        for v in obj.bound_box:
            wv = obj.matrix_world @ mathutils.Vector(v)
            xs.append(wv.x); ys.append(wv.y); zs.append(wv.z)
    return ((min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs)))


def nine_shot_cameras(bbox, distance_factor=2.8, elevation_factor=0.6):
    """3-shot universal grammar: top + 2 opposing corners. Per Tristan
    2026-05-17 — 9 shots was overkill for symmetric form factors."""
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


def per_module_camera_pair(bbox, distance_factor=2.8, elevation_factor=0.6):
    """Phase A item 4 (2026-05-24): 2-angle pair per module — corner-FR (the
    canonical 3/4 iso view) + top-front (looking down at 60° to reveal
    component layout). Returns list of 2 camera specs."""
    (xmin, xmax), (ymin, ymax), (zmin, zmax) = bbox
    cx, cy, cz = (xmin+xmax)/2, (ymin+ymax)/2, (zmin+zmax)/2
    max_dim = max(xmax-xmin, ymax-ymin, zmax-zmin)
    radius = max_dim * distance_factor
    elev = max_dim * elevation_factor
    ortho_scale = max_dim * 1.45
    target = (cx, cy, cz)
    diag = radius / math.sqrt(2)
    return [
        {"name": "corner-FR", "loc": (cx + diag, cy + diag, cz + elev), "target": target, "ortho_scale": ortho_scale},
        {"name": "top-front", "loc": (cx, cy - diag * 0.5, cz + radius * 0.95), "target": target, "ortho_scale": ortho_scale},
    ]


def setup_camera(loc, target, ortho_scale, focal=50):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho_scale
    cam.data.lens = focal
    direction = (target[0] - loc[0], target[1] - loc[1], target[2] - loc[2])
    cam.rotation_euler = mathutils.Vector(direction).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def clear_cameras():
    for obj in list(bpy.data.objects):
        if obj.type == "CAMERA":
            bpy.data.objects.remove(obj, do_unlink=True)


# ─── Freestyle ───────────────────────────────────────────────────────────


def enable_freestyle(thickness=1.4, color=(0.05, 0.08, 0.12)):
    scene = bpy.context.scene
    scene.render.use_freestyle = True
    vl = scene.view_layers[0]
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(140)
    ls = fs.linesets[0]
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new("focal_outline")
    ls.linestyle.color = color
    ls.linestyle.thickness = thickness


def disable_freestyle():
    scene = bpy.context.scene
    scene.render.use_freestyle = False
    scene.view_layers[0].use_freestyle = False


# ─── Ghost materials for per-module render pass ──────────────────────────


def make_ghost_materials():
    """Returns (GHOST_LIGHT, ENCLOSURE_GHOST). GHOST_LIGHT is solid mid-grey for
    non-focal non-shell objects. ENCLOSURE_GHOST is translucent (alpha 0.18) for
    structure_containment objects — lets internals show through when an internal
    module is focal. Per heatpump debugging 2026-05-17."""
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

    return GHOST_LIGHT, ENCLOSURE_GHOST


def make_hero_ghost():
    """Translucent ghost for the cover hero — applied to structure_containment
    objects only, not other modules. Lets all internal modules pop through."""
    HERO_GHOST = bpy.data.materials.new("hero_ghost_enclosure")
    HERO_GHOST.use_nodes = True
    gb = HERO_GHOST.node_tree.nodes["Principled BSDF"]
    gb.inputs["Base Color"].default_value = (0.93, 0.94, 0.95, 1.0)
    gb.inputs["Metallic"].default_value = 0.0
    gb.inputs["Roughness"].default_value = 0.4
    gb.inputs["Alpha"].default_value = 0.18
    HERO_GHOST.blend_method = "BLEND"
    return HERO_GHOST


# ─── Module objects bookkeeping ──────────────────────────────────────────


def make_module_dict(module_ids):
    return {k: [] for k in module_ids}


def snapshot_all_materials():
    snap = {}
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.data and obj.data.materials:
            snap[obj.name] = list(obj.data.materials)
    return snap


def restore_materials_from_snap(snap):
    for obj_name, mats in snap.items():
        obj = bpy.data.objects.get(obj_name)
        if obj is None or obj.type != "MESH":
            continue
        obj.data.materials.clear()
        for m in mats:
            obj.data.materials.append(m)


# ─── Full render pipeline (spatial + hero + per-module) ──────────────────


def run_render_pipeline(out_dir, module_objects, structure_module_id="structure_containment",
                        flat_form_factor=False, hero_camera_override=None,
                        hero_cycles=False):
    """Render the standard Forge engineering set:
    - 3 spatial views (top + corner FR + corner BL), no Freestyle
    - 1 Option-2 hero (ghosted structure + saturated modules), no Freestyle
    - N per-module pages with Freestyle outline, translucent shell

    Args:
      out_dir: Path for output PNGs
      module_objects: dict of module_id → list of Blender objects
      structure_module_id: which module is the "enclosure shell" (default
        "structure_containment"). For drone-like form factors with no shell,
        pass None or "structure_containment" — translucent treatment still
        applied but doesn't change much for skeletal frames.
      flat_form_factor: True for 1U servers etc. where Z << X,Y. Adjusts hero
        camera to a tighter near-horizontal angle.
      hero_camera_override: optional dict {loc, target, ortho_scale} to override
        the auto-computed hero camera.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene

    # ─── Pass 1: 3 spatial views ───
    bbox = compute_scene_bbox()
    cams = nine_shot_cameras(bbox)
    disable_freestyle()
    for cam_spec in cams:
        clear_cameras()
        setup_camera(loc=cam_spec["loc"], target=cam_spec["target"], ortho_scale=cam_spec["ortho_scale"])
        scene.render.filepath = str(out_dir / f"{cam_spec['name']}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[forge] {cam_spec['name']}.png")

    # ─── Pass 2: hero with ghosted shell ───
    HERO_GHOST = make_hero_ghost()
    structure_objs = module_objects.get(structure_module_id, []) if structure_module_id else []
    hero_snap = {}
    for obj in structure_objs:
        if obj.data and obj.data.materials:
            hero_snap[obj.name] = list(obj.data.materials)
            obj.data.materials.clear()
            obj.data.materials.append(HERO_GHOST)

    clear_cameras()
    if hero_camera_override:
        setup_camera(**hero_camera_override)
    else:
        (xmin, xmax), (ymin, ymax), (zmin, zmax) = compute_scene_bbox()
        cx, cy, cz = (xmin+xmax)/2, (ymin+ymax)/2, (zmin+zmax)/2
        if flat_form_factor:
            horizontal_max = max(xmax-xmin, ymax-ymin)
            hero_diag = horizontal_max * 1.6 / math.sqrt(2)
            setup_camera(loc=(cx + hero_diag, cy - hero_diag, cz + horizontal_max * 0.20),
                         target=(cx, cy, cz), ortho_scale=horizontal_max * 1.10)
        else:
            max_dim = max(xmax-xmin, ymax-ymin, zmax-zmin)
            hero_diag = max_dim * 2.0 / math.sqrt(2)
            setup_camera(loc=(cx + hero_diag, cy - hero_diag, cz + max_dim * 0.45),
                         target=(cx, cy, cz), ortho_scale=max_dim * 1.20)
    disable_freestyle()
    # Phase B item 8 (2026-05-24): opt-in Cycles ray-trace for hero only.
    # Enable via run_render_pipeline(..., hero_cycles=True) or env
    # BLENDER_HERO_CYCLES=1. Adds ~30 s but produces CAD-presentation hero.
    use_cycles = hero_cycles or os.environ.get("BLENDER_HERO_CYCLES") == "1"
    if use_cycles:
        init_scene_cycles_hero()
    scene.render.filepath = str(out_dir / "00-hero.png")
    bpy.ops.render.render(write_still=True)
    print("[forge] 00-hero.png" + (" (Cycles)" if use_cycles else ""))
    if use_cycles:
        init_scene_back_to_eevee()

    # Restore structure materials
    for name, mats in hero_snap.items():
        obj = bpy.data.objects.get(name)
        if obj and obj.type == "MESH":
            obj.data.materials.clear()
            for m in mats:
                obj.data.materials.append(m)

    # ─── Pass 3: per-module pages with Freestyle ───
    enable_freestyle()
    GHOST_LIGHT, ENCLOSURE_GHOST = make_ghost_materials()
    structure_names = set(o.name for o in module_objects.get(structure_module_id, []) if structure_module_id)
    all_orig = snapshot_all_materials()

    def apply_focal_palette(focal_module_id):
        focal_names = set(o.name for o in module_objects.get(focal_module_id, []))
        for obj_name, orig_mats in all_orig.items():
            obj = bpy.data.objects.get(obj_name)
            if obj is None:
                continue
            obj.data.materials.clear()
            if obj_name in focal_names:
                for m in orig_mats:
                    obj.data.materials.append(m)
            elif obj_name in structure_names and focal_module_id != structure_module_id:
                obj.data.materials.append(ENCLOSURE_GHOST)
            else:
                obj.data.materials.append(GHOST_LIGHT)

    for module_id, mod_objs in module_objects.items():
        if not mod_objs:
            continue
        apply_focal_palette(module_id)
        bbox_mod = compute_scene_bbox()
        # Phase A item 4 (2026-05-24): 2-angle per module — corner-FR (primary)
        # + top-front (alternate view to reveal vertical layout). Each is
        # written as module-<id>.png (primary) and module-<id>-top.png.
        cam_pair = per_module_camera_pair(bbox_mod)
        for cam_idx, cam_spec in enumerate(cam_pair):
            clear_cameras()
            setup_camera(loc=cam_spec["loc"], target=cam_spec["target"], ortho_scale=cam_spec["ortho_scale"])
            suffix = "" if cam_idx == 0 else "-" + cam_spec["name"]
            scene.render.filepath = str(out_dir / f"module-{module_id}{suffix}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[forge] module-{module_id}{suffix}.png")

    restore_materials_from_snap(all_orig)
    print(f"[forge] DONE — {out_dir}")
