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
import sys
import bpy
import math
import mathutils
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
from render_view_contract import presentation_bevel_width_m

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
    # AgX tone-mapping (was "Standard"): Standard applies no highlight roll-off,
    # so light/white surfaces bloomed to near-white and every render read as a
    # pale wash (iter-66 mean luminance ~250/255). AgX compresses highlights and
    # restores contrast + silhouette. Defensive: older Blender lacks AgX, so
    # fall back Filmic -> Standard to keep the render working.
    _chosen_vt = None
    for _vt in ("AgX", "Filmic", "Standard"):
        try:
            scene.view_settings.view_transform = _vt
            _chosen_vt = _vt
            break
        except (TypeError, ValueError):
            continue
    if _chosen_vt == "AgX":
        try:
            scene.view_settings.look = "AgX - Medium High Contrast"
        except (TypeError, ValueError):
            pass
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
            sample_count = int(os.environ.get("BLENDER_CYCLES_SAMPLES", "64"))
            for attr, val in [
                ("samples", sample_count),
                ("preview_samples", max(8, sample_count // 2)),
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
    """Studio mid-grey world background.

    (Name kept for compatibility with 26 template call sites.) A pure-white
    world flooded every render to a near-white wash (iter-66, mean luminance
    ~250/255); a mid-grey backdrop gives light shapes a clear silhouette and
    cuts the ambient wash. Tristan 2026-05-29."""
    world = bpy.data.worlds.new("world")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    # _to_linear targets a DISPLAY sRGB grey (~0.55) so it reads as mid-grey,
    # not the much lighter value a raw-linear 0.55 would display.
    bg.inputs["Color"].default_value = (*_to_linear((0.55, 0.55, 0.58)), 1.0)
    bg.inputs["Strength"].default_value = 1.0


def make_instrument_studio_world(strength: float = 0.22):
    """Soft product-photography backdrop for handheld instruments.

    INTENT: Nishita sky is correct for plant skids (metals reflect sky) but
    washes an instrument and never puts a specular kiss on dark glass.
    Soft light-grey studio world = clean product-slide language.
    UNIVERSAL — call only when isInstrumentDevice.

    DEMO FIX (2026-07-23, Tristan: "black on black"): backdrop brightened from
    dark mid-grey (0.38) to light studio grey (0.82) so the mid-light-grey body
    reads clearly against it — matches body lightening in instrument_form_grammar.py.
    """
    world = bpy.data.worlds.new("world_instrument_studio")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    # Light studio grey backdrop — reads slightly lighter than the product body.
    # DEMO FIX v3 (2026-07-23): 0.82 near-white washed out the LIGHT-grey body (0.62)
    # — product melted into the backdrop (no luminance gap). A MEDIUM studio grey gives
    # the light body a clear gap so it POPS (light product on medium studio = the classic
    # clean product shot); the dark front panel + green LED read against the light body.
    bg.inputs["Color"].default_value = (*_to_linear((0.40, 0.41, 0.44)), 1.0)
    bg.inputs["Strength"].default_value = float(strength)
    return world


def apply_instrument_color_management(exposure_bias: float = 0.0):
    """Standard view transform for light-grey polymer product shots.

    DEMO FIX (2026-07-23): body lightened from charcoal to mid-light grey
    (MAT_BODY_POLYMER ~0.62 sRGB). AgX was tuned for near-black charcoal
    (High Contrast crushes dark greys to black — wrong for a light body).
    Standard view transform is linear and appropriate for a mid-grey product
    on a light studio background; no look/contrast override needed.
    Exposure bias stays 0 — body is already readable.
    """
    scene = bpy.context.scene
    # DEMO FIX v2 (2026-07-23): Standard was reintroducing the pale wash on the HERO
    # pass (Standard has NO highlight roll-off → light body + bright studio bloom to
    # near-white; the 00-hero read washed out). AgX (which the 04-07 spatial views use
    # via configure_render, and which looked correct there on this SAME 0.62 body)
    # compresses highlights so the mid-grey body + DARK front panel + green LED all read.
    _chosen = None
    for transform in ("AgX", "Filmic", "Standard"):
        try:
            scene.view_settings.view_transform = transform
            _chosen = transform
            break
        except (TypeError, ValueError):
            continue
    try:
        # match the spatial-view look that read correctly on this body
        scene.view_settings.look = "AgX - Medium High Contrast" if _chosen == "AgX" else "None"
    except (TypeError, ValueError, AttributeError):
        pass
    try:
        scene.view_settings.exposure = float(exposure_bias)
    except (AttributeError, TypeError):
        pass


def finish_matte_polymer(mat, specular: float = 0.22):
    """Drop Principled specular so softboxes do not glaze charcoal to clay."""
    if mat is None or not getattr(mat, "use_nodes", False):
        return mat
    try:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is None:
            return mat
        for sp in ("Specular IOR Level", "Specular"):
            if sp in bsdf.inputs:
                bsdf.inputs[sp].default_value = float(specular)
                break
    except (AttributeError, TypeError, KeyError):
        pass
    return mat


def add_instrument_studio_lights(centre_m, extent_m, product_half_height_m=None,
                                 key_energy: float = 18.0,
                                 fill_energy: float = 7.0,
                                 rim_energy: float = 32.0,
                                 bounce_energy: float = 2.5,
                                 ground_srgb=(0.52, 0.53, 0.55)):
    """Softbox product-studio rig for sealed handheld / benchtop instruments.

    INTENT: plant sun+Nishita muddies dark polymer and leaves LCD glass dead.
    Three large soft AREA lights (key / fill / rim) + a seamless soft ground
    give charcoal bodies form and put an edge highlight on dark glass.
    UNIVERSAL — call only for isInstrumentDevice on the shaded pass.

    @param centre_m (cx, cy, cz) product centre in metres.
    @param extent_m Characteristic product extent in metres (max plan edge).
    @param product_half_height_m Half enclosure height in metres — grounds the
        seamless plane under the feet (contact shadow). Falls back to 0.45×extent.
    """
    cx, cy, cz = centre_m
    e = max(0.08, float(extent_m))
    # Soft KEY — large area from front-upper-right (defines form, soft shadow).
    # GOTCHA: energies must stay LOW for a ~0.15 m product — plant-scale softbox
    # wattage washes charcoal polymer to clay-white (2026-07-13 studio first cut;
    # second cut at 28/12/35 still median ~150 — gold body ≈103). Tuned to
    # body-face mean ≈80–110 with charcoal albedo ≤0.07 display.
    bpy.ops.object.light_add(type="AREA", location=(cx + e * 2.2, cy - e * 3.0, cz + e * 3.5))
    key = bpy.context.active_object
    key.name = "u_instrument_studio_key"
    key.data.energy = float(key_energy)
    key.data.size = e * 4.5
    key.rotation_euler = (math.radians(50), math.radians(15), math.radians(35))
    try:
        key.data.use_shadow = True
        key.data.spread = math.radians(75)
    except AttributeError:
        pass
    # Soft FILL — camera-side, lifts shadow side without flattening.
    bpy.ops.object.light_add(type="AREA", location=(cx - e * 2.8, cy - e * 1.2, cz + e * 2.0))
    fill = bpy.context.active_object
    fill.name = "u_instrument_studio_fill"
    fill.data.energy = float(fill_energy)
    fill.data.size = e * 5.0
    fill.rotation_euler = (math.radians(35), math.radians(-25), math.radians(-20))
    # RIM / kicker — behind-right, the specular kiss on dark glass + polymer edges.
    # Kept relatively hot vs key so dark glass still catches an edge ping.
    bpy.ops.object.light_add(type="AREA", location=(cx + e * 1.5, cy + e * 2.8, cz + e * 2.2))
    rim = bpy.context.active_object
    rim.name = "u_instrument_studio_rim"
    rim.data.energy = float(rim_energy)
    rim.data.size = e * 2.4
    rim.rotation_euler = (math.radians(40), math.radians(10), math.radians(160))
    try:
        rim.data.use_shadow = False
    except AttributeError:
        pass
    # Soft bounce from below (very subtle — contact lift only).
    half_h = float(product_half_height_m) if product_half_height_m is not None else e * 0.45
    ground_z = cz - half_h - 0.0004
    bpy.ops.object.light_add(type="AREA", location=(cx, cy - e * 0.3, ground_z - e * 0.15))
    bounce = bpy.context.active_object
    bounce.name = "u_instrument_studio_bounce"
    bounce.data.energy = float(bounce_energy)
    bounce.data.size = e * 5.0
    bounce.rotation_euler = (math.radians(-90), 0.0, 0.0)
    try:
        bounce.data.use_shadow = False
    except AttributeError:
        pass
    # Seamless soft ground — just under the feet for a real contact shadow.
    ground_size = e * 8.0
    bpy.ops.mesh.primitive_plane_add(
        size=ground_size,
        location=(cx, cy, ground_z))
    ground = bpy.context.active_object
    ground.name = "fl_ground_instrument_studio"
    mat = bpy.data.materials.new("m_instrument_studio_ground")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*_to_linear(tuple(ground_srgb)), 1.0)
    bsdf.inputs["Roughness"].default_value = 0.95
    bsdf.inputs["Metallic"].default_value = 0.0
    ground.data.materials.append(mat)
    return {"key": key, "fill": fill, "rim": rim, "bounce": bounce, "ground": ground}


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
    # DECISION: kind=glass + alpha=1.0 → Cycles Transmission (photoreal CAD).
    # Legacy EEVEE alpha-fade glass must pass alpha < 1.0 explicitly — do NOT
    # force the preset alpha=0.25 onto the CAD path (that fights Transmission).
    if kind and clearcoat == 0.0:
        clearcoat = preset.get("clearcoat", 0.0)
    if kind == "led_emissive" and emission_strength == 0.0:
        emission_strength = preset.get("emission_strength", 0.0)
    if kind == "glass":
        ior = preset.get("ior", ior)
        if alpha >= 0.999:
            roughness = min(roughness, float(preset.get("roughness", 0.05)))

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
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
    # Photoreal glass — Cycles Transmission (Blender 4+: "Transmission Weight").
    use_transmission = kind == "glass" or (alpha < 0.95 and roughness <= 0.12)
    if use_transmission:
        for tr_name in ("Transmission Weight", "Transmission"):
            if tr_name in bsdf.inputs:
                try:
                    bsdf.inputs[tr_name].default_value = (
                        0.92 if kind == "glass" else max(0.0, 1.0 - alpha)
                    )
                except (AttributeError, TypeError):
                    pass
                break
    if kind == "glass" and alpha >= 0.999:
        # Opaque + Transmission — correct Cycles glass path (not alpha-fade).
        try:
            mat.blend_method = "OPAQUE"
        except (AttributeError, TypeError):
            pass
    elif alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        try:
            mat.blend_method = "BLEND"
        except (AttributeError, TypeError):
            pass
    return mat


def shade_smooth_object(obj) -> None:
    """Smooth STL/CAD imports so facets do not read as low-poly clay."""
    if obj is None or getattr(obj, "type", None) != "MESH" or obj.data is None:
        return
    try:
        for poly in obj.data.polygons:
            poly.use_smooth = True
    except (AttributeError, TypeError):
        pass
    try:
        # Blender 3.x / early 4.x — enough for photoreal CAD under Cycles.
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(35.0)
    except (AttributeError, TypeError):
        # Blender 4.1+ dropped use_auto_smooth; poly.use_smooth alone is fine.
        pass


def make_instrument_cad_mat(family: str, name: str | None = None):
    """Role-honest PBR for forge-truth CAD families (photoreal Cycles bar).

    INTENT: imported STLs must not stay default grey. Family → material role
    is universal for sealed instruments (and reusable for plant CAD).
    """
    fam = str(family or "").strip().lower()
    nm = name or f"m_cad_{fam[:24] or 'part'}"
    if fam in ("square_cuvette", "cuvette"):
        # alpha=1.0 → Cycles Transmission + IOR (photoreal CAD bar).
        return make_mat(
            nm, _to_linear((0.78, 0.86, 0.90)), metallic=0.0, roughness=0.04,
            alpha=1.0, kind="glass", clearcoat=0.55, ior=1.52)
    if fam in ("led_emitter", "led"):
        return make_mat(
            nm, _to_linear((1.0, 0.55, 0.08)), metallic=0.0, roughness=0.22,
            kind="led_emissive", emission_strength=5.0, clearcoat=0.4)
    if fam in ("photodiode_to_can", "photodiode"):
        return make_mat(
            nm, _to_linear((0.14, 0.15, 0.18)), metallic=0.82, roughness=0.28,
            kind="brushed_alu")
    if fam in ("coin_cell",):
        # Brushed steel — too-light albedo under softboxes reads as white plastic.
        return make_mat(
            nm, _to_linear((0.42, 0.43, 0.46)), metallic=0.92, roughness=0.28,
            kind="brushed_alu")
    if fam in ("instrument_pcb", "pcb_board", "pcb"):
        return make_mat(
            nm, _to_linear((0.05, 0.42, 0.20)), metallic=0.05, roughness=0.48,
            kind="pcb")
    if fam in ("axial_fan",):
        return make_mat(
            nm, _to_linear((0.12, 0.12, 0.14)), metallic=0.15, roughness=0.55,
            kind="polymer")
    if fam in ("heatsink_extruded", "terminal_block", "cable_gland"):
        return make_mat(
            nm, _to_linear((0.55, 0.57, 0.60)), metallic=0.75, roughness=0.35,
            kind="brushed_alu")
    if fam in ("lfp_prismatic_cell",):
        return make_mat(
            nm, _to_linear((0.62, 0.64, 0.68)), metallic=0.7, roughness=0.38,
            kind="brushed_alu")
    return make_mat(nm, _to_linear((0.45, 0.46, 0.48)), metallic=0.2, roughness=0.5)


class _Palette(dict):
    """Engineering palette that never KeyErrors. An undefined material key —
    e.g. an LLM-generated scene that references MAT["concrete"] without ever
    defining it — lazily resolves to a neutral mid-grey material instead of
    raising KeyError and crashing the whole render. Undefined keys were
    silently sinking the real design to a washed-out fallback render every
    run (iter-66/68 KeyError 'concrete'). 2026-05-29."""

    def __missing__(self, key):
        mat = make_mat(f"m_auto_{str(key)[:16]}", (0.52, 0.54, 0.58), metallic=0.2, roughness=0.6)
        self[key] = mat
        return mat


def make_default_palette():
    """Standard Forge engineering palette — pure pigments, amber-not-yellow for
    legibility on white background. Used by all form factors as the base. Each
    form factor can extend with form-factor-specific colours.
    """
    return _Palette({
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
    })


# ─── Module visual profiles (BESS L22 fix #6 — visual differentiation) ──
#
# Maps canonical module-type slugs to per-module visual contracts.  Any
# LLM-generated blender-scene.py can call fl.get_module_profile(module_id)
# to retrieve the accent colour and dominant-feature hint for that module.
#
# Keys are substring-matched (longest match wins) so "energy_storage_source"
# matches "energy_storage" and also the more-specific "battery_rack".
# Returns None if no profile found — callers must handle the fallback.
#
# Accent colour: sRGB tuple, SATURATED.  Apply _to_linear() if assigning
# directly to a Principled BSDF Base Color input.
# dominant_feature: human-readable hint for the LLM / template author about
#   what geometry to foreground (cells visible, PCB prominent, fins, etc.).
# camera_hint: "front" | "three_quarter" | "top_down" — preferred angle to
#   foreground the dominant feature.
#
# Populated for BESS (6 canonical slugs), common HAPS, drone, VF, EV-charger,
# heat-pump, and AUV slugs.  Slug not found → generic enclosure + logged.
#
# Usage in a generated script:
#   profile = fl.get_module_profile(module_id)
#   if profile:
#       accent_rgb = profile["accent_rgb"]
#       print(f"[blender] module {module_id}: {profile['dominant_feature']}")

_MODULE_VISUAL_PROFILES: dict = {
    # ── BESS / Battery energy storage ────────────────────────────────────
    # Battery rack / energy storage: vertical columns of prismatic cells.
    # Camera: 3/4 angle showing cell columns depth.
    "energy_storage_source":   {"accent_rgb": (0.02, 0.18, 0.95), "dominant_feature": "vertical_columns_prismatic_cells", "camera_hint": "three_quarter"},
    "battery_rack":            {"accent_rgb": (0.02, 0.18, 0.95), "dominant_feature": "vertical_columns_prismatic_cells", "camera_hint": "three_quarter"},
    "battery_module":          {"accent_rgb": (0.02, 0.18, 0.95), "dominant_feature": "vertical_columns_prismatic_cells", "camera_hint": "three_quarter"},
    # BMS / battery management: green PCB board + connector strip.
    # Camera: front-on close-up to show connectors.
    "control_compute_communication": {"accent_rgb": (0.00, 0.75, 0.15), "dominant_feature": "green_pcb_chip_array_connector_strip", "camera_hint": "front"},
    "bms":                     {"accent_rgb": (0.00, 0.75, 0.15), "dominant_feature": "green_pcb_chip_array_connector_strip", "camera_hint": "front"},
    "battery_management":      {"accent_rgb": (0.00, 0.75, 0.15), "dominant_feature": "green_pcb_chip_array_connector_strip", "camera_hint": "front"},
    # Inverter / PCS / power conversion: large heatsink fins + cooling fans.
    # Camera: 3/4 high angle showing fins on top.
    "energy_conversion_transduction": {"accent_rgb": (1.00, 0.45, 0.00), "dominant_feature": "heatsink_fins_cooling_fans", "camera_hint": "three_quarter"},
    "inverter":                {"accent_rgb": (1.00, 0.45, 0.00), "dominant_feature": "heatsink_fins_cooling_fans", "camera_hint": "three_quarter"},
    "pcs":                     {"accent_rgb": (1.00, 0.45, 0.00), "dominant_feature": "heatsink_fins_cooling_fans", "camera_hint": "three_quarter"},
    # HVAC / thermal / environmental: round duct + grille at front.
    # Camera: front-on to show duct intake.
    "environmental_interface": {"accent_rgb": (0.00, 0.80, 0.95), "dominant_feature": "round_duct_grille_fan_shroud", "camera_hint": "front"},
    "hvac":                    {"accent_rgb": (0.00, 0.80, 0.95), "dominant_feature": "round_duct_grille_fan_shroud", "camera_hint": "front"},
    "thermal_management":      {"accent_rgb": (0.00, 0.80, 0.95), "dominant_feature": "round_duct_grille_fan_shroud", "camera_hint": "front"},
    # Fire suppression / safety: red cylinder + nozzle on top.
    # Camera: 3/4 angle showing cylinder array.
    "safety_protection":       {"accent_rgb": (1.00, 0.00, 0.00), "dominant_feature": "red_cylinder_nozzle_array", "camera_hint": "three_quarter"},
    "fire_suppression":        {"accent_rgb": (1.00, 0.00, 0.00), "dominant_feature": "red_cylinder_nozzle_array", "camera_hint": "three_quarter"},
    "fire_safety":             {"accent_rgb": (1.00, 0.00, 0.00), "dominant_feature": "red_cylinder_nozzle_array", "camera_hint": "three_quarter"},
    # Controls / SCADA / HMI: rack-mounted display panel + LED indicators.
    # Camera: front-on to show panel face.
    "power_distribution":      {"accent_rgb": (0.95, 0.55, 0.00), "dominant_feature": "busbar_array_fuse_panel", "camera_hint": "front"},
    "hmi_ergonomics":          {"accent_rgb": (0.05, 0.42, 1.00), "dominant_feature": "display_panel_led_indicators", "camera_hint": "front"},
    "controls":                {"accent_rgb": (0.05, 0.42, 1.00), "dominant_feature": "display_panel_led_indicators", "camera_hint": "front"},
    "scada":                   {"accent_rgb": (0.05, 0.42, 1.00), "dominant_feature": "display_panel_led_indicators", "camera_hint": "front"},
    "bms_controller":          {"accent_rgb": (0.05, 0.42, 1.00), "dominant_feature": "display_panel_led_indicators", "camera_hint": "front"},
    # Fluid / cooling pipework: orange coolant manifold + expansion tank.
    "mass_fluid_transport_process": {"accent_rgb": (1.00, 0.45, 0.05), "dominant_feature": "manifold_pipes_expansion_tank", "camera_hint": "three_quarter"},
    # Sensing / instrumentation: green sensor array.
    "sensing_instrumentation": {"accent_rgb": (0.00, 0.92, 0.10), "dominant_feature": "sensor_array_probes", "camera_hint": "three_quarter"},
    # Maintenance / serviceability: magenta door panels + service LEDs.
    "maintenance_serviceability": {"accent_rgb": (1.00, 0.10, 0.55), "dominant_feature": "access_door_service_led_strip", "camera_hint": "front"},
    # Structure / containment: always enclosure colour, no accent.
    "structure_containment":   {"accent_rgb": (0.55, 0.56, 0.58), "dominant_feature": "enclosure_shell_wireframe", "camera_hint": "three_quarter"},

    # ── HAPS ─────────────────────────────────────────────────────────────
    "propulsion":              {"accent_rgb": (0.15, 0.50, 1.00), "dominant_feature": "propeller_motor_pods", "camera_hint": "three_quarter"},
    "solar_array":             {"accent_rgb": (0.02, 0.04, 0.10), "dominant_feature": "solar_panel_array_cells", "camera_hint": "top_down"},
    "payload":                 {"accent_rgb": (0.00, 0.55, 0.65), "dominant_feature": "sensor_gimbal_housing", "camera_hint": "front"},
    "avionics":                {"accent_rgb": (1.00, 0.55, 0.00), "dominant_feature": "flight_computer_pcb_rack", "camera_hint": "front"},
    "comms":                   {"accent_rgb": (0.10, 0.12, 0.18), "dominant_feature": "antenna_array_radome", "camera_hint": "three_quarter"},

    # ── Drone ─────────────────────────────────────────────────────────────
    "flight_controller":       {"accent_rgb": (1.00, 0.55, 0.00), "dominant_feature": "flight_controller_pcb", "camera_hint": "front"},
    "gimbal_camera":           {"accent_rgb": (0.00, 0.55, 0.65), "dominant_feature": "gimbal_lens_housing", "camera_hint": "front"},

    # ── Vertical farm ─────────────────────────────────────────────────────
    "lighting_array":          {"accent_rgb": (1.00, 0.92, 0.10), "dominant_feature": "led_bar_array", "camera_hint": "top_down"},
    "climate_control":         {"accent_rgb": (0.00, 0.80, 0.95), "dominant_feature": "hvac_duct_fan_array", "camera_hint": "front"},
    "irrigation":              {"accent_rgb": (0.10, 0.40, 0.85), "dominant_feature": "water_pipe_nozzle_array", "camera_hint": "three_quarter"},
    "water_irrigation":        {"accent_rgb": (0.10, 0.40, 0.85), "dominant_feature": "water_pipe_nozzle_array", "camera_hint": "three_quarter"},
    "growing_trays":           {"accent_rgb": (0.05, 0.55, 0.10), "dominant_feature": "tray_array_with_plant_rows", "camera_hint": "three_quarter"},
    "nutrient_dosing":         {"accent_rgb": (0.45, 0.70, 0.95), "dominant_feature": "dosing_pump_reservoir", "camera_hint": "three_quarter"},

    # ── EV charger ────────────────────────────────────────────────────────
    "dispensing":              {"accent_rgb": (0.05, 0.42, 1.00), "dominant_feature": "dispenser_screen_connector", "camera_hint": "front"},
    "power_electronics":       {"accent_rgb": (0.62, 0.05, 0.95), "dominant_feature": "rectifier_stack_heatsink", "camera_hint": "three_quarter"},
    "communication":           {"accent_rgb": (0.00, 0.55, 0.65), "dominant_feature": "antenna_comms_module", "camera_hint": "front"},

    # ── Heat pump ─────────────────────────────────────────────────────────
    "outdoor_unit":            {"accent_rgb": (0.00, 0.80, 0.95), "dominant_feature": "fan_coil_condensing_unit", "camera_hint": "front"},
    "indoor_unit":             {"accent_rgb": (0.45, 0.70, 0.95), "dominant_feature": "air_handler_evaporator", "camera_hint": "front"},
    "refrigerant_circuit":     {"accent_rgb": (1.00, 0.45, 0.05), "dominant_feature": "refrigerant_piping_compressor", "camera_hint": "three_quarter"},

    # ── AUV ───────────────────────────────────────────────────────────────
    "thruster_array":          {"accent_rgb": (0.15, 0.50, 1.00), "dominant_feature": "thruster_pod_propeller", "camera_hint": "three_quarter"},
    "navigation_sensors":      {"accent_rgb": (0.00, 0.92, 0.10), "dominant_feature": "dvl_sonar_imu_cluster", "camera_hint": "front"},
    "pressure_hull":           {"accent_rgb": (0.55, 0.56, 0.58), "dominant_feature": "cylinder_end_caps_ports", "camera_hint": "three_quarter"},
}


def get_module_profile(module_id: str) -> dict | None:
    """Return the visual profile dict for module_id, or None if unrecognised.

    Matching is substring-based: "energy_storage_source" matches the key
    "energy_storage_source" exactly first, then any key that is a substring
    of the module_id (longest match wins).  If nothing matches, logs a
    stderr warning and returns None so the caller can fall back to the
    generic enclosure render.

    The returned dict has keys: accent_rgb (sRGB tuple), dominant_feature
    (str hint), camera_hint ("front"|"three_quarter"|"top_down").
    """
    import sys as _sys
    module_lower = module_id.lower()
    # Exact match first
    if module_lower in _MODULE_VISUAL_PROFILES:
        return _MODULE_VISUAL_PROFILES[module_lower]
    # Substring match — longest key wins
    best_key = None
    best_len = 0
    for key in _MODULE_VISUAL_PROFILES:
        if key in module_lower and len(key) > best_len:
            best_key = key
            best_len = len(key)
    if best_key:
        return _MODULE_VISUAL_PROFILES[best_key]
    print(f'[blender] module slug "{module_id}" has no visual profile — using generic enclosure', file=_sys.stderr)
    return None


def module_accent_mat(module_id: str, fallback_rgb=(0.55, 0.56, 0.58)) -> "bpy.types.Material":
    """Convenience: return a Principled BSDF material using the module's
    accent colour (linear-converted).  Falls back to enclosure grey if the
    module has no profile.  Useful for quick dominant-feature accent boxes
    without manually looking up the palette.
    """
    profile = get_module_profile(module_id)
    rgb = profile["accent_rgb"] if profile else fallback_rgb
    lin = _to_linear(rgb)
    return make_mat(f"m_accent_{module_id[:20]}", lin)


def _srgb_to_linear_channel(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _to_linear(rgb):
    """Convert an sRGB colour tuple to scene-linear for Blender shader inputs.

    MANDATORY for any colour tuple assigned directly to Principled BSDF
    Base Color / Emission Color / World Background Color.  Blender's shader
    inputs expect LINEAR values; raw sRGB values wash out at render time.
    See mempalace forgeos_blender_srgb_linear_gamma_mismatch_gotcha.

    Usage: bsdf.inputs["Base Color"].default_value = (*_to_linear(rgb), 1.0)
    """
    return tuple(_srgb_to_linear_channel(c) for c in rgb)


# ─── Geometry primitive helpers ──────────────────────────────────────────


def add_box(name, location, size, material, module=None, module_objects=None, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if os.environ.get("BLENDER_PRESENTATION_BEVEL") == "1":
        bevel = obj.modifiers.new(name="presentation_bevel", type="BEVEL")
        bevel.width = presentation_bevel_width_m(
            (abs(float(size[0])), abs(float(size[1])), abs(float(size[2]))))
        bevel.segments = 3
        try:
            bevel.harden_normals = True
        except AttributeError:
            pass
    obj.data.materials.append(material)
    if module and module_objects is not None:
        module_objects[module].append(obj)
    return obj


def add_cyl(name, location, radius, height, material, module=None, module_objects=None, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(
        location=location, radius=radius, depth=height, rotation=rotation, vertices=vertices)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    shade_smooth_object(obj)
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


def add_smooth_pipe(name, points, radius, material, module=None, module_objects=None,
                    bevel_segments=6, resolution=12):
    """SMOOTH curved tube (2026-07-24, Tristan "make sure tubing has decent curves, not right
    angles"). Same as add_pipe but a NURBS spline interpolates SMOOTHLY through the control points
    instead of straight POLY segments with hard corners. `points` = list of (x,y,z); pass a via/sag
    point between the two real endpoints for a gentle arc."""
    if len(points) < 2:
        return None
    curve_data = bpy.data.curves.new(name + "_curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = bevel_segments
    curve_data.resolution_u = resolution
    spline = curve_data.splines.new("NURBS")
    spline.points.add(len(points) - 1)
    for i, (x, y, z) in enumerate(points):
        spline.points[i].co = (x, y, z, 1.0)
    spline.use_endpoint_u = True        # pass through the first + last control points (real endpoints)
    try:
        spline.order_u = min(4, len(points))
    except Exception:
        pass
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
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
    component layout). Returns list of 2 camera specs.

    2026-05-26: top-front ortho_scale tightened from max_dim * 1.45 to
    max_dim * 0.95 so the container fills ~70% of canvas (was ~35%).
    The ortho camera's framing is purely controlled by ortho_scale — it
    does NOT depend on camera distance — so the previous larger value
    left the container as a small strip at the bottom of an otherwise
    empty white frame.  corner-FR uses max_dim * 1.45 (unchanged).
    """
    (xmin, xmax), (ymin, ymax), (zmin, zmax) = bbox
    cx, cy, cz = (xmin+xmax)/2, (ymin+ymax)/2, (zmin+zmax)/2
    max_dim = max(xmax-xmin, ymax-ymin, zmax-zmin)
    radius = max_dim * distance_factor
    elev = max_dim * elevation_factor
    ortho_scale_corner = max_dim * 1.45   # corner-FR: same as before
    ortho_scale_top = max_dim * 0.95      # top-front: tighter so container fills ~70%
    target = (cx, cy, cz)
    diag = radius / math.sqrt(2)
    return [
        {"name": "corner-FR", "loc": (cx + diag, cy + diag, cz + elev), "target": target, "ortho_scale": ortho_scale_corner},
        {"name": "top-front", "loc": (cx, cy - diag * 0.5, cz + radius * 0.95), "target": target, "ortho_scale": ortho_scale_top},
    ]


def module_bbox(module_objects, module_id):
    """Union the world-space bounding boxes of every object tagged with
    module_id → ((cx, cy, cz), (dx, dy, dz)).

    Returns None if the module has no tagged MESH objects OR the union bbox
    is degenerate (max dim < MODULE_BBOX_MIN_DIM_M, i.e. a single flat panel
    with no real extent) — callers MUST treat None as "fall back to the
    scene-level framing" rather than crashing.

    Skips fl_ground* shadow-catcher planes (same as compute_scene_bbox) so a
    module that happens to include a helper plane doesn't get its bbox blown
    out. 2026-05-28: per-module best-view cameras (Tristan).
    """
    objs = module_objects.get(module_id, []) if module_objects else []
    xs, ys, zs = [], [], []
    for obj in objs:
        if obj is None or getattr(obj, "type", None) != "MESH":
            continue
        if obj.name.startswith("fl_ground"):
            continue
        for v in obj.bound_box:
            wv = obj.matrix_world @ mathutils.Vector(v)
            xs.append(wv.x); ys.append(wv.y); zs.append(wv.z)
    if not xs:
        return None
    cx, cy, cz = (min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2
    dx, dy, dz = max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)
    if max(dx, dy, dz) < MODULE_BBOX_MIN_DIM_M:
        return None
    return ((cx, cy, cz), (dx, dy, dz))


# Minimum module extent (metres) below which module_bbox() returns None and
# the caller falls back to scene framing. 5 cm guards against a module made
# of a single zero-thickness panel (e.g. an earth tape 5mm thick) producing a
# camera glued to the panel surface.
MODULE_BBOX_MIN_DIM_M = 0.05


def camera_for_module(mod_centre, mod_dims, scene_bbox, camera_hint="three_quarter",
                      context_margin=1.6):
    """Compute ONE camera spec that frames a SINGLE module from its best-view
    angle, aimed at the MODULE centroid (not the scene centre).

    Args:
      mod_centre: (cx, cy, cz) module centroid, world space
      mod_dims:   (dx, dy, dz) module bounding-box dimensions
      scene_bbox: ((xmin,xmax),(ymin,ymax),(zmin,zmax)) whole-scene bbox —
                  used ONLY to infer which face of the module points outward
                  (the face nearest the container exterior).
      camera_hint: "front" | "three_quarter" | "top_down". Unknown / None →
                  "three_quarter".
      context_margin: ortho_scale = module max_dim × this factor. 1.6 keeps
                  the module filling most of the frame while still showing
                  where it sits in the container (Tristan 2026-05-28 spec).

    Returns a dict {name, loc, target, ortho_scale} consumable by
    setup_camera(**spec minus name). The camera is positioned on a sphere
    around the module centroid; only the angle (azimuth + elevation) changes
    with camera_hint. Distance is generous (module diag × 3) — framing is
    governed by ortho_scale, not distance, for an ORTHO camera, so distance
    only needs to clear the geometry and keep the module in front of the
    container bulk.

    OUTWARD-NORMAL INFERENCE: the module's dominant outward-facing axis is
    the horizontal axis (X or Y) on which the module centroid is furthest
    (as a fraction of the scene half-extent) from the scene centre. The
    camera is placed on the OUTWARD side of that axis so it looks at the
    module from outside the container toward the centre — i.e. it sees the
    module's exterior-facing face, not the wall behind it. For a module
    sitting dead-centre, defaults to looking along -Y (the conventional
    "front" of these container scenes; back wall is at -Y per the templates,
    front access is +Y, but camera looks toward -Z-ish from +Y/-Y based on
    sign — see below).
    """
    if camera_hint not in ("front", "three_quarter", "top_down"):
        camera_hint = "three_quarter"

    cx, cy, cz = mod_centre
    dx, dy, dz = mod_dims
    (xmin, xmax), (ymin, ymax), (zmin, zmax) = scene_bbox
    scx = (xmin + xmax) / 2
    scy = (ymin + ymax) / 2
    sx_half = max((xmax - xmin) / 2, 1e-6)
    sy_half = max((ymax - ymin) / 2, 1e-6)

    max_dim = max(dx, dy, dz, 1e-6)
    diag = math.sqrt(dx * dx + dy * dy + dz * dz)
    # Distance only needs to clear geometry — ortho framing is ortho_scale.
    dist = max(diag * 3.0, max_dim * 3.0)
    ortho_scale = max_dim * context_margin

    # Outward normal: pick the horizontal axis on which the module is most
    # off-centre (normalised by that axis's scene half-extent). Sign = which
    # way is "outward" from the scene centre.
    off_x = (cx - scx) / sx_half
    off_y = (cy - scy) / sy_half
    if abs(off_x) >= abs(off_y):
        # X is the dominant outward axis
        out = (1.0 if off_x >= 0 else -1.0, 0.0)
        # secondary (for 3/4 swing) is Y, biased toward the front (+Y access)
        side = (0.0, 1.0)
    else:
        out = (0.0, 1.0 if off_y >= 0 else -1.0)
        side = (1.0 if off_x >= 0 else -1.0, 0.0)
    # If the module is essentially centred on both axes, default outward = +Y
    # (front access face of a container) so we don't look through the back wall.
    if abs(off_x) < 0.08 and abs(off_y) < 0.08:
        out = (0.0, 1.0)
        side = (1.0, 0.0)

    def _on_sphere(az_unit, elev_deg):
        """az_unit = (ux, uy) horizontal unit-ish direction the camera sits
        in (FROM the module, looking back at it). elev_deg = elevation above
        horizontal. Returns world camera loc."""
        ux, uy = az_unit
        n = math.hypot(ux, uy) or 1.0
        ux, uy = ux / n, uy / n
        elev = math.radians(elev_deg)
        horiz = math.cos(elev) * dist
        vert = math.sin(elev) * dist
        return (cx + ux * horiz, cy + uy * horiz, cz + vert)

    if camera_hint == "front":
        # 3/4-low angle: 40° azimuth off the outward normal toward the side
        # axis + 22° elevation.  Provides the same "front face readable" quality
        # as the pure front view but adds depth so the module's 3D form is
        # legible (azimuth ≈40°, elevation ≈22°).  The previous straight-outward
        # + 20° elevation rendered as a flat silhouette with no depth cue.
        az = (out[0] * math.cos(math.radians(40)) + side[0] * math.sin(math.radians(40)),
              out[1] * math.cos(math.radians(40)) + side[1] * math.sin(math.radians(40)))
        loc = _on_sphere(az, 22.0)
        name = "front"
    elif camera_hint == "top_down":
        # High elevation looking down — roof / array / tray modules. Keep a
        # slight outward azimuth so it's not a pure plan view (reads better).
        loc = _on_sphere(out, 74.0)
        name = "top-down"
    else:  # three_quarter
        # Classic hero 3/4: ~40° azimuth swung off the outward normal toward
        # the side axis, + ~30° elevation.
        az = (out[0] * math.cos(math.radians(40)) + side[0] * math.sin(math.radians(40)),
              out[1] * math.cos(math.radians(40)) + side[1] * math.sin(math.radians(40)))
        loc = _on_sphere(az, 30.0)
        name = "three-quarter"

    return {"name": name, "loc": loc, "target": (cx, cy, cz), "ortho_scale": ortho_scale}


def setup_camera(loc, target, ortho_scale=None, focal=50, camera_type="ORTHO"):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.active_object
    cam.data.type = camera_type
    if camera_type == "ORTHO":
        if ortho_scale is None:
            raise ValueError("ortho_scale is required for an orthographic camera")
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
    # Dark slate (2026-05-29): was (0.60,0.62,0.65) — LIGHTER than the grey
    # studio world, so non-focal context bloomed to a pale wash under AgX.
    # Darker-than-world makes the saturated focal module read against muted
    # (but clearly visible) context. Linear-space value.
    gl.inputs["Base Color"].default_value = (0.13, 0.15, 0.20, 1.0)
    gl.inputs["Metallic"].default_value = 0.0
    gl.inputs["Roughness"].default_value = 0.75

    ENCLOSURE_GHOST = bpy.data.materials.new("enclosure_ghost")
    ENCLOSURE_GHOST.use_nodes = True
    eg = ENCLOSURE_GHOST.node_tree.nodes["Principled BSDF"]
    # Was (0.85) near-white + alpha 0.18 → an invisible cage. Darker + a touch
    # more opaque reads as a real translucent enclosure (2026-05-29).
    eg.inputs["Base Color"].default_value = (0.24, 0.26, 0.32, 1.0)
    eg.inputs["Metallic"].default_value = 0.0
    eg.inputs["Roughness"].default_value = 0.5
    eg.inputs["Alpha"].default_value = 0.32
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


def make_hero_open_frame_steel():
    """OPAQUE galvanised structural-steel material for the hero pass when a
    template opts into hero_open_frame=True (skid / field-erected / open-rack
    form factors — NOT enclosed containers).

    The default hero treatment (make_hero_ghost) makes EVERY
    structure_containment object translucent. For a sealed enclosure that reads
    as a glass cover the equipment pops through — correct. But for an OPEN SKID
    the structure IS the deliverable (corner posts + perimeter rails + cross-
    bracing + deck + walkway), and ghosting it makes thin frame members + a
    flat deck plate read as a translucent shipping container with a mysterious
    floating floor (Tristan, CO2-mineralisation render, raised 3×). Painting the
    frame as SOLID steel makes it read as what it is: an open structural skid.

    Returned material is opaque, mid-metallic, slightly warm galv grey so it
    separates from the studio mid-grey world without b+looming to white.
    """
    STEEL = bpy.data.materials.new("hero_open_frame_steel")
    STEEL.use_nodes = True
    sb = STEEL.node_tree.nodes["Principled BSDF"]
    # Linear-space galvanised grey (~display 0.62). Opaque, metallic so the
    # frame members catch the key sun and read as box-section steel.
    sb.inputs["Base Color"].default_value = (0.34, 0.35, 0.38, 1.0)
    sb.inputs["Metallic"].default_value = 0.85
    sb.inputs["Roughness"].default_value = 0.42
    return STEEL


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


def orient_billboards_to_camera(loc, target):
    """PER-CAMERA BILLBOARD ORIENTATION (2026-07-02) — face every `u_tagcallout_*`
    tag chip (+ its text) at the camera about to render, text upright. The chips
    used to carry ONE fixed compromise tilt (hero/top bisector), which read as
    ~45°-rotated labels on the PLAN view and mirrored/edge-on chips from the
    corner/exterior cameras. Each render pass now re-orients the chips to ITS
    camera: normal along the (ortho) view axis, local +Y (text up) resolved
    toward world-up via the same 'Y' up-hint the camera itself uses, so the text
    is upright and never mirrored in EVERY view. The paired text object is
    re-lifted along the new face normal. Deterministic (pure camera-spec maths);
    a scene with no tag chips (all bespoke templates) is a strict no-op.
    Returns the number of chips oriented."""
    chips = [o for o in bpy.data.objects if o.name.startswith("u_tagcallout_chip_")]
    if not chips:
        return 0
    view = mathutils.Vector((loc[0] - target[0], loc[1] - target[1], loc[2] - target[2]))
    if view.length == 0:
        return 0
    vn = view.normalized()
    if abs(vn.z) > 0.999:
        # STRAIGHT-DOWN (plan) camera — the 'Y' up-hint is DEGENERATE for a vertical
        # track axis and Blender resolves it with local +Y → −Y world, which rendered
        # the plan labels UPSIDE-DOWN. The plan camera's screen-up is world +Y
        # (setup_camera's own degenerate resolution), so the chip must lie flat with
        # local +Y = +Y world: identity for a top view (normal +Z), X-flip for a
        # bottom view.
        q = mathutils.Euler((0.0 if vn.z > 0 else math.pi, 0.0, 0.0)).to_quaternion()
    else:
        q = vn.to_track_quat("Z", "Y")              # chip face normal → toward camera
    eul = q.to_euler()
    n = q @ mathutils.Vector((0.0, 0.0, 1.0))       # world-space face normal
    for chip in chips:
        chip.rotation_mode = "XYZ"
        chip.rotation_euler = eul
        txt = bpy.data.objects.get(chip.name.replace("_chip_", "_txt_", 1))
        if txt is not None:
            # re-lift the text off the (re-oriented) chip face so it never z-fights
            lift = chip.dimensions.z / 2.0 + chip.dimensions.y * 0.02
            txt.rotation_mode = "XYZ"
            txt.rotation_euler = eul
            txt.location = (chip.location.x + n.x * lift,
                            chip.location.y + n.y * lift,
                            chip.location.z + n.z * lift)
    return len(chips)


def run_render_pipeline(out_dir, module_objects, structure_module_id="structure_containment",
                        flat_form_factor=False, hero_camera_override=None,
                        hero_cycles=False, hero_open_frame=False,
                        spatial_bbox_override=None, spatial_cameras_override=None,
                        view_preparer=None, spatial_cycles=False):
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
      hero_open_frame: when True, the hero pass paints structure_containment
        objects SOLID galvanised steel (make_hero_open_frame_steel) instead of
        the default translucent ghost. Use for OPEN SKID / field-erected /
        open-rack form factors where the structure is an open frame, not a
        sealed enclosure — ghosting an open frame reads as a glass shipping
        container with a floating floor. Default False preserves the
        translucent-cover behaviour for every enclosed-container template.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene

    # ─── Pass 1: 3 spatial views ───
    # spatial_bbox_override: a sealed-product scene adds a room-scale mounting wall
    # for the hero — compute_scene_bbox() then frames the WALL and the corner/top
    # views render a plate on a slab with the product a sliver (powerwall run 73).
    # The caller passes the PRODUCT bbox so the spatial views frame the product.
    bbox = spatial_bbox_override or compute_scene_bbox()
    cams = spatial_cameras_override or nine_shot_cameras(bbox)
    disable_freestyle()
    cycles_active = bool(spatial_cycles)
    if cycles_active:
        init_scene_cycles_hero()
    for cam_spec in cams:
        if view_preparer is not None:
            view_preparer(cam_spec["name"], True)
        try:
            clear_cameras()
            setup_camera(
                loc=cam_spec["loc"],
                target=cam_spec["target"],
                ortho_scale=cam_spec.get("ortho_scale"),
                focal=cam_spec.get("focal", 50),
                camera_type=cam_spec.get("camera_type", "ORTHO"),
            )
            orient_billboards_to_camera(cam_spec["loc"], cam_spec["target"])   # tag chips face THIS view
            scene.render.filepath = str(out_dir / f"{cam_spec['name']}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[forge] {cam_spec['name']}.png")
        finally:
            if view_preparer is not None:
                view_preparer(cam_spec["name"], False)

    # ─── Pass 2: hero with ghosted shell (or solid open frame) ───
    # hero_open_frame=True → paint the structure SOLID steel so an open skid
    # reads as a structural frame, not a translucent glass container. Default
    # (False) keeps the translucent ghost so an enclosed container reads as a
    # see-through cover. The render_minimal/hero CAMERA + everything else is
    # identical — only the structure material differs.
    HERO_STRUCTURE_MAT = make_hero_open_frame_steel() if hero_open_frame else make_hero_ghost()
    structure_objs = module_objects.get(structure_module_id, []) if structure_module_id else []
    # Product/interior story meshes must keep their authored materials on the hero —
    # painting them steel/ghost was the root cause of the colorimeter reading as a
    # featureless grey box (2026-07-13).
    _HERO_MAT_EXEMPT_PREFIXES = (
        "u_se_instrument_story_", "u_se_product_", "u_se_exterior_detail_",
        "u_se_cutaway_cue_",
        # INSTRUMENT INTERIOR MESHES (2026-07-23 pale-hero fix): the enclosed-instrument
        # hero repaints every structure_containment object with the near-white ghost skin
        # (make_hero_ghost, alpha 0.18) UNLESS exempt. The real interior parts are named
        # u_se_le_* (lab_electronics: OD tower / stir / vial collar / PCB), u_se_tc_*
        # (thermocycler), u_se_sp_* (syringe pump), u_se_lm_* (microscope), + u_se_cad_/det_
        # CAD/detail story meshes — none were exempt, so they ghosted to pale phantoms and
        # the 00-hero/cover read washed-out (04-07 exterior views close the cover + hide
        # internals, so they were unaffected). Exempt them so they keep their authored dark
        # materials — matching the crisp 08-ghost-shell pass (which only ghosts the SHELL).
        "u_se_le_", "u_se_tc_", "u_se_sp_", "u_se_lm_",
        "u_se_cad_", "u_se_det_",
    )
    hero_snap = {}
    for obj in structure_objs:
        if any(obj.name.startswith(p) for p in _HERO_MAT_EXEMPT_PREFIXES):
            continue
        if obj.data and obj.data.materials:
            hero_snap[obj.name] = list(obj.data.materials)
            obj.data.materials.clear()
            obj.data.materials.append(HERO_STRUCTURE_MAT)

    clear_cameras()
    # INTENT: sealed products may need a different shell for the hero than for
    # spatial views (instruments: closed product as 00-hero; cabinets: cutaway).
    # Spatial cameras already go through view_preparer; the hero pass must too,
    # otherwise 00-hero silently inherits the last cutaway baseline.
    if view_preparer is not None:
        view_preparer("00-hero", True)
    try:
        if hero_camera_override:
            setup_camera(**hero_camera_override)
            _hero_loc, _hero_target = hero_camera_override["loc"], hero_camera_override["target"]
        else:
            (xmin, xmax), (ymin, ymax), (zmin, zmax) = compute_scene_bbox()
            cx, cy, cz = (xmin+xmax)/2, (ymin+ymax)/2, (zmin+zmax)/2
            if flat_form_factor:
                horizontal_max = max(xmax-xmin, ymax-ymin)
                hero_diag = horizontal_max * 1.6 / math.sqrt(2)
                _hero_loc = (cx + hero_diag, cy - hero_diag, cz + horizontal_max * 0.20)
                _hero_target = (cx, cy, cz)
                setup_camera(loc=_hero_loc, target=_hero_target, ortho_scale=horizontal_max * 1.10)
            else:
                max_dim = max(xmax-xmin, ymax-ymin, zmax-zmin)
                hero_diag = max_dim * 2.0 / math.sqrt(2)
                _hero_loc = (cx + hero_diag, cy - hero_diag, cz + max_dim * 0.45)
                _hero_target = (cx, cy, cz)
                setup_camera(loc=_hero_loc, target=_hero_target, ortho_scale=max_dim * 1.20)
        orient_billboards_to_camera(_hero_loc, _hero_target)   # tag chips face the hero camera
        disable_freestyle()
        # Phase B item 8 (2026-05-24): opt-in Cycles ray-trace for hero only.
        # Enable via run_render_pipeline(..., hero_cycles=True) or env
        # BLENDER_HERO_CYCLES=1. Adds ~30 s but produces CAD-presentation hero.
        use_cycles = cycles_active or hero_cycles or os.environ.get("BLENDER_HERO_CYCLES") == "1"
        if use_cycles and not cycles_active:
            init_scene_cycles_hero()
        scene.render.filepath = str(out_dir / "00-hero.png")
        bpy.ops.render.render(write_still=True)
        print("[forge] 00-hero.png" + (" (Cycles)" if use_cycles else ""))
        if use_cycles:
            init_scene_back_to_eevee()
    finally:
        if view_preparer is not None:
            view_preparer("00-hero", False)

    # Restore structure materials
    for name, mats in hero_snap.items():
        obj = bpy.data.objects.get(name)
        if obj and obj.type == "MESH":
            obj.data.materials.clear()
            for m in mats:
                obj.data.materials.append(m)

    # ─── Pass 3: per-module pages with Freestyle ───
    # 2026-05-26: kill scene-level shadows before per-module renders.
    # init_scene() sets use_soft_shadows=True for the hero pass (adds depth).
    # For the per-module schematic pages, shadows create a large diagonal dark
    # wash across the canvas (especially pronounced in the top-front view where
    # the sun angle produces a stretched shadow extending off-canvas).
    # Drawer: forgeos_gotchas_e559ba6d5818fbf4 — Blender 5.x EEVEE Next ignores
    # per-light use_shadow unless scene.eevee.use_shadow* is ALSO False.
    # Set all three attribute names (4.x = use_shadows, 5.x = use_shadow,
    # and use_shadow_high_bitdepth) to guarantee coverage across Blender versions.
    eevee = getattr(scene, "eevee", None)
    if eevee is not None:
        for _attr in ("use_shadow", "use_shadows", "use_shadow_high_bitdepth", "use_soft_shadows"):
            try:
                setattr(eevee, _attr, False)
            except (AttributeError, TypeError):
                continue

    enable_freestyle()
    GHOST_LIGHT, ENCLOSURE_GHOST = make_ghost_materials()
    structure_names = set(o.name for o in module_objects.get(structure_module_id, []) if structure_module_id)
    all_orig = snapshot_all_materials()
    # Track per-module scale overrides so we can undo them.
    _focal_scale_overrides: dict[str, tuple] = {}

    def apply_focal_palette(focal_module_id):
        # 2026-05-26: instead of restoring the template-assigned material
        # (which may be a grey engineering material like MAT["pcs"] = 0.45,0.55,0.68),
        # replace focal objects with the module's saturated accent colour from
        # _MODULE_VISUAL_PROFILES.  This guarantees pop at camera distance
        # regardless of what material the template author assigned.
        # Universal across all 35 product classes — no per-class branching.
        focal_names = set(o.name for o in module_objects.get(focal_module_id, []))
        profile = get_module_profile(focal_module_id)
        if profile:
            accent_srgb = profile["accent_rgb"]
        else:
            # Fallback: use a bright magenta so unknown modules are clearly
            # identifiable rather than blending into the grey ghost field.
            accent_srgb = (1.00, 0.10, 0.55)
        accent_lin = _to_linear(accent_srgb)
        focal_mat = make_mat(
            f"m_focal_{focal_module_id[:20]}",
            accent_lin,
            metallic=0.0,
            roughness=0.55,
        )
        for obj_name, orig_mats in all_orig.items():
            obj = bpy.data.objects.get(obj_name)
            if obj is None:
                continue
            obj.data.materials.clear()
            if obj_name in focal_names:
                obj.data.materials.append(focal_mat)
            elif obj_name in structure_names and focal_module_id != structure_module_id:
                obj.data.materials.append(ENCLOSURE_GHOST)
            else:
                obj.data.materials.append(GHOST_LIGHT)

    def apply_focal_scale(focal_module_id, scale_factor=1.05):
        """Scale focal objects up by scale_factor (1.05 = 5%) so they
        visually protrude from the ghost sibling field — provides a subtle
        outline effect without Freestyle annotation complexity.
        Stores original scale in _focal_scale_overrides for restoration."""
        for obj in module_objects.get(focal_module_id, []):
            _focal_scale_overrides[obj.name] = (obj.scale.x, obj.scale.y, obj.scale.z)
            obj.scale = (obj.scale.x * scale_factor,
                         obj.scale.y * scale_factor,
                         obj.scale.z * scale_factor)

    def restore_focal_scale(focal_module_id):
        for obj in module_objects.get(focal_module_id, []):
            orig = _focal_scale_overrides.pop(obj.name, None)
            if orig is not None:
                obj.scale = orig

    # Scene bbox is fixed for the whole per-module pass (geometry doesn't move,
    # only materials/scale toggle) — compute once for outward-normal inference
    # + the scene-level fallback framing.
    scene_bbox = compute_scene_bbox()
    (sx0, sx1), (sy0, sy1), (sz0, sz1) = scene_bbox
    print("[forge] ── per-module best-view camera table ──────────────────")
    print(f"[forge] scene bbox X[{sx0:.2f},{sx1:.2f}] Y[{sy0:.2f},{sy1:.2f}] Z[{sz0:.2f},{sz1:.2f}]")

    for module_id, mod_objs in module_objects.items():
        if not mod_objs:
            continue
        apply_focal_palette(module_id)
        apply_focal_scale(module_id, scale_factor=1.05)

        # 2026-05-28 (Tristan): per-module BEST-VIEW camera. Frame each module
        # from its own camera_hint angle, aimed at the MODULE centroid — not
        # the shared scene-level corner/top-front pair that made every module
        # render look identical (just recoloured).
        profile = get_module_profile(module_id)
        cam_hint = profile["camera_hint"] if profile else "three_quarter"
        mbbox = module_bbox(module_objects, module_id)
        if mbbox is not None:
            mod_centre, mod_dims = mbbox
            primary = camera_for_module(mod_centre, mod_dims, scene_bbox, cam_hint)
            tx, ty, tz = primary["target"]
            lx, ly, lz = primary["loc"]
            print(f"[forge] module {module_id:<32} hint={cam_hint:<13} "
                  f"target=({tx:.2f},{ty:.2f},{tz:.2f}) "
                  f"loc=({lx:.2f},{ly:.2f},{lz:.2f}) "
                  f"ortho={primary['ortho_scale']:.2f}  [MODULE-FRAMED]")
            # Alternate second angle: a complementary top-down-ish view of the
            # SAME module (still module-centred) so downstream keeps its
            # 2-angle-per-module contract (module-<id>-top-front.png).
            alt = camera_for_module(mod_centre, mod_dims, scene_bbox, "top_down")
            alt["name"] = "top-front"
            cam_pair = [primary, alt]
        else:
            # Guard rail: module has no usable tagged geometry → fall back to
            # the scene-level pair (old behaviour) instead of crashing.
            print(f"[forge] module {module_id:<32} hint={cam_hint:<13} "
                  f"[FALLBACK: scene-level framing — no usable module bbox]")
            cam_pair = per_module_camera_pair(scene_bbox)

        for cam_idx, cam_spec in enumerate(cam_pair):
            clear_cameras()
            setup_camera(loc=cam_spec["loc"], target=cam_spec["target"], ortho_scale=cam_spec["ortho_scale"])
            orient_billboards_to_camera(cam_spec["loc"], cam_spec["target"])   # tag chips face THIS view
            suffix = "" if cam_idx == 0 else "-" + cam_spec["name"]
            scene.render.filepath = str(out_dir / f"module-{module_id}{suffix}.png")
            bpy.ops.render.render(write_still=True)
            print(f"[forge] module-{module_id}{suffix}.png")
        restore_focal_scale(module_id)

    restore_materials_from_snap(all_orig)
    print(f"[forge] DONE — {out_dir}")


# ═════════════════════════════════════════════════════════════════════════
# B1 (2026-06-10) — Parametric form-factor primitive library
# ANVIL-UNIVERSAL-LOOP-PLAN.md WS-B/B1. Pure-additive: nothing above this
# line changed; existing templates are untouched.
#
# CONVENTIONS (differ deliberately from the legacy add_* helpers):
#   - ALL public dimensions/locations are in MILLIMETRES. Converted to
#     Blender metres internally (1 BU = 1 m, same scale the templates use).
#   - Ground-standing primitives (vessel, skid, rack row, enclosure, tower,
#     hull, gantry, rotating machine, panel stack, foundation) take
#     location_mm = BASE-CENTRE: (x, y) of the footprint centre, z of the
#     UNDERSIDE — so stacking "on top of" something is base_z = parent top.
#   - Airframe primitives (fuselage, wing, pod, propeller) take
#     location_mm = volume centre (aircraft parts hang in space).
#   - Every primitive returns an ASSEMBLY dict:
#       {"name", "root", "parts", "centre_m", "size_m", ...extras}
#     and stamps custom properties consumed by forge_scene_checks.py:
#       obj["fl_module"]    — module tag (mirrors the module_objects dict)
#       obj["fl_assembly"]  — assembly instance name
#       obj["fl_relations"] — JSON list of {"rel", "target"} declarations
#       obj["fl_structure_root"] — True on declared structure roots
#   - Placement ontology (plan WS-B/B1): contains | supports | attached_to
#     via declare_relation(); clearance_zone via add_clearance_zone().
#     Parts inside an assembly are auto-attached_to the assembly root.
# ═════════════════════════════════════════════════════════════════════════
import json

PRIMITIVE_API_VERSION = "1.0.0"

MM = 0.001  # millimetres → Blender metres (1 BU = 1 m)


def _mm(v):
    """Scalar millimetres → metres."""
    return float(v) * MM


def _mm3(t):
    """(x, y, z) millimetres → metres tuple."""
    return tuple(float(c) * MM for c in t)


def stamp_primitive_api_version():
    """Record the primitive-API version on the scene (versioned API — plan
    G-rule: stored scenes record the version; compatibility-checked on read)."""
    try:
        bpy.context.scene["fl_primitive_api_version"] = PRIMITIVE_API_VERSION
    except (AttributeError, TypeError):
        pass


def tag_module(obj, module_id):
    """Stamp the module tag as a custom property so deterministic scene
    checks (forge_scene_checks.py) can read module membership from the scene
    itself — not just from the in-memory module_objects dict."""
    if obj is not None and module_id:
        obj["fl_module"] = str(module_id)


def sync_module_tags(module_objects):
    """Stamp fl_module custom props from a legacy module_objects dict.
    Lets the deterministic checks run on scenes composed with the old
    add_box/add_cyl-only idiom (hand templates) without modifying them."""
    for module_id, objs in (module_objects or {}).items():
        for obj in objs:
            tag_module(obj, module_id)


# ─── Placement relations (contains | supports | attached_to) ─────────────

_RELATION_KINDS = ("contains", "supports", "attached_to")


def _resolve_obj(thing):
    """Accept a Blender object OR an assembly dict; return the root object."""
    if isinstance(thing, dict):
        return thing.get("root")
    return thing


def declare_relation(subject, relation, target):
    """Declare `subject --relation--> target` as scene data.

    relation ∈ {"contains", "supports", "attached_to"}:
      contains    — subject's volume encloses target (enclosure contains rack)
      supports    — subject carries target's weight (skid supports vessel)
      attached_to — subject is fastened to target (wing attached_to fuselage)

    subject/target may be Blender objects or assembly dicts (roots used).
    Stored as a JSON list in subject["fl_relations"] so the deterministic
    checks can rebuild the connectivity graph from the scene alone."""
    if relation not in _RELATION_KINDS:
        raise ValueError(f"unknown relation {relation!r} — use one of {_RELATION_KINDS}")
    s = _resolve_obj(subject)
    t = _resolve_obj(target)
    if s is None or t is None:
        return
    rels = json.loads(s.get("fl_relations", "[]"))
    entry = {"rel": relation, "target": t.name}
    if entry not in rels:
        rels.append(entry)
    s["fl_relations"] = json.dumps(rels)


def declare_structure_root(thing):
    """Mark an object/assembly as a structure root. The connectivity check
    requires every module-tagged object to reach SOME declared root via
    relations — multiple roots are fine (e.g. an aircraft AND a plant skid
    in the same composed scene)."""
    root = _resolve_obj(thing)
    if root is not None:
        root["fl_structure_root"] = True


def add_clearance_zone(name, location_mm, size_mm, owner=None):
    """Declare a rectangular keep-clear volume (maintenance access, vent
    blast path, crane swing). Created as a non-rendering EMPTY so it never
    appears in output; forge_scene_checks.clearance_zones_empty() verifies
    no mesh intrudes. location_mm = volume CENTRE (mm); size_mm = (w, d, h)
    full extents (mm). owner (assembly dict/name) is exempt from the check
    (a door zone may abut its own enclosure)."""
    bpy.ops.object.empty_add(type="CUBE", location=_mm3(location_mm))
    zone = bpy.context.active_object
    zone.name = name
    zone.empty_display_size = 0.5
    sx, sy, sz = _mm3(size_mm)
    zone.scale = (sx, sy, sz)
    zone["fl_clearance_zone"] = True
    zone["fl_zone_size_m"] = [sx, sy, sz]
    if owner is not None:
        owner_name = owner["name"] if isinstance(owner, dict) else str(owner)
        zone["fl_zone_owner"] = owner_name
    return zone


def _parts_bbox_m(parts):
    """World-space union AABB of a list of mesh objects → (centre, size)."""
    bpy.context.view_layer.update()
    xs, ys, zs = [], [], []
    for obj in parts:
        if obj is None or getattr(obj, "type", None) != "MESH":
            continue
        for v in obj.bound_box:
            wv = obj.matrix_world @ mathutils.Vector(v)
            xs.append(wv.x); ys.append(wv.y); zs.append(wv.z)
    if not xs:
        return (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)
    centre = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2)
    size = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    return centre, size


def _finalise_assembly(name, root, parts, module=None, extras=None):
    """Stamp custom props + auto-relations for a freshly built primitive.
    Every part is attached_to the assembly root (so the connectivity check
    only needs ONE declared relation per assembly, on the root)."""
    stamp_primitive_api_version()
    for p in parts:
        if p is None:
            continue
        p["fl_assembly"] = name
        tag_module(p, module)
        if p is not root:
            declare_relation(p, "attached_to", root)
    centre, size = _parts_bbox_m(parts)
    asm = {"name": name, "root": root, "parts": [p for p in parts if p is not None],
           "centre_m": centre, "size_m": size}
    if extras:
        asm.update(extras)
    return asm


# ─── Airframe set ─────────────────────────────────────────────────────────


def prim_fuselage(name, length_mm, diameter_mm, location_mm=(0, 0, 0), material=None,
                  nose_fraction=0.20, tail_fraction=0.26,
                  module=None, module_objects=None):
    """Aircraft fuselage: cylindrical centre body + tapered nose (forward,
    -Y) + tapered tail cone (aft, +Y). Fore-aft axis = Y (template
    convention, see haps-9shot.py). location_mm = volume CENTRE in mm.
    Returns assembly dict; root = centre body."""
    L = _mm(length_mm)
    R = _mm(diameter_mm) / 2
    cx, cy, cz = _mm3(location_mm)
    ln = L * nose_fraction
    lt = L * tail_fraction
    lb = L - ln - lt
    y0 = cy - L / 2
    body = add_cyl(f"{name}_body", (cx, y0 + ln + lb / 2, cz), R, lb, material,
                   module=module, module_objects=module_objects,
                   rotation=(math.radians(90), 0, 0))
    nose = add_frustum(f"{name}_nose", (cx, y0 + ln / 2, cz), R * 0.28, R, ln, material,
                       module=module, module_objects=module_objects,
                       rotation=(math.radians(-90), 0, 0))
    tail = add_frustum(f"{name}_tailcone", (cx, y0 + ln + lb + lt / 2, cz), R, R * 0.16, lt,
                       material, module=module, module_objects=module_objects,
                       rotation=(math.radians(-90), 0, 0))
    return _finalise_assembly(name, body, [body, nose, tail], module,
                              extras={"radius_m": R, "length_m": L})


def prim_wing(name, span_mm, chord_mm, thickness_mm, location_mm=None, fuselage=None,
              mount="high", chord_offset_mm=0.0, material=None, material_spar=None,
              n_spars=2, module=None, module_objects=None):
    """Continuous wing THROUGH/ON a fuselage: single skin box spanning X
    + spar cylinders running full span. Dimensions in mm.

    Pass fuselage= the prim_fuselage() assembly to auto-position: the wing
    centres on the fuselage X/Z, mounted "high" (skin centred at the
    fuselage crown so the wing visibly sits ON the body and crosses it as
    one continuous member — never two floating half-wings) or "mid"
    (through the axis). chord_offset_mm shifts the wing fore/aft.
    Auto-declares wing attached_to fuselage. Or pass explicit location_mm
    (volume centre)."""
    span = _mm(span_mm)
    chord = _mm(chord_mm)
    t = _mm(thickness_mm)
    if fuselage is not None and location_mm is None:
        fx, fy, fz = fuselage["centre_m"]
        zoff = fuselage.get("radius_m", 0.0) * (0.85 if mount == "high" else 0.0)
        cx, cy, cz = fx, fy + _mm(chord_offset_mm), fz + zoff
    elif location_mm is not None:
        cx, cy, cz = _mm3(location_mm)
    else:
        raise ValueError("prim_wing needs location_mm or fuselage=")
    parts = []
    skin = add_box(f"{name}_skin", (cx, cy, cz), (span, chord, t), material,
                   module=module, module_objects=module_objects)
    parts.append(skin)
    spar_mat = material_spar or material
    spar_ys = [cy - chord * 0.30, cy + chord * 0.28][:max(1, n_spars)]
    for i, sy in enumerate(spar_ys):
        parts.append(add_cyl(f"{name}_spar_{i+1}", (cx, sy, cz), t * 0.38, span * 0.99,
                             spar_mat, module=module, module_objects=module_objects,
                             rotation=(0, math.radians(90), 0)))
    for sx, side in [(cx - span / 2 + t * 0.5, "L"), (cx + span / 2 - t * 0.5, "R")]:
        parts.append(add_box(f"{name}_tip_{side}", (sx, cy, cz),
                             (t, chord * 0.82, t * 2.2), spar_mat,
                             module=module, module_objects=module_objects))
    asm = _finalise_assembly(name, skin, parts, module,
                             extras={"span_m": span, "chord_m": chord})
    if fuselage is not None:
        declare_relation(asm, "attached_to", fuselage)
    return asm


def prim_tail(name, boom_length_mm, boom_diameter_mm, hstab_span_mm, hstab_chord_mm,
              fin_height_mm, fuselage=None, location_mm=None, material=None,
              material_surface=None, module=None, module_objects=None):
    """Tail group: boom extending aft (+Y) + horizontal stabiliser + vertical
    fin at the boom end. Dimensions in mm. Pass fuselage= to start the boom
    at the fuselage tail (auto attached_to); else location_mm = boom START
    point (volume centre of the boom root)."""
    lb = _mm(boom_length_mm)
    rb = _mm(boom_diameter_mm) / 2
    hspan = _mm(hstab_span_mm)
    hchord = _mm(hstab_chord_mm)
    fh = _mm(fin_height_mm)
    if fuselage is not None and location_mm is None:
        fx, fy, fz = fuselage["centre_m"]
        sx, sy, sz = fx, fy + fuselage["length_m"] / 2 - lb * 0.06, fz + fuselage.get("radius_m", 0) * 0.25
    elif location_mm is not None:
        sx, sy, sz = _mm3(location_mm)
    else:
        raise ValueError("prim_tail needs location_mm or fuselage=")
    surf_mat = material_surface or material
    parts = []
    boom = add_cyl(f"{name}_boom", (sx, sy + lb / 2, sz), rb, lb, material,
                   module=module, module_objects=module_objects,
                   rotation=(math.radians(90), 0, 0))
    parts.append(boom)
    end_y = sy + lb - hchord * 0.4
    parts.append(add_box(f"{name}_hstab", (sx, end_y, sz), (hspan, hchord, hchord * 0.12),
                         surf_mat, module=module, module_objects=module_objects))
    parts.append(add_box(f"{name}_fin", (sx, end_y, sz + fh / 2),
                         (fh * 0.10, hchord * 0.9, fh), surf_mat,
                         module=module, module_objects=module_objects))
    asm = _finalise_assembly(name, boom, parts, module)
    if fuselage is not None:
        declare_relation(asm, "attached_to", fuselage)
    return asm


def prim_pod(name, length_mm, diameter_mm, location_mm, material=None,
             pylon_to_z_mm=None, parent=None, module=None, module_objects=None):
    """Underslung pod/nacelle: capsule (cylinder + nose/tail frustums) along
    Y. location_mm = pod volume CENTRE (mm). pylon_to_z_mm: if given, a
    pylon box runs from the pod crown up/down to that world z (mm) — use it
    to visibly join the pod to a wing. parent= assembly → attached_to."""
    L = _mm(length_mm)
    R = _mm(diameter_mm) / 2
    cx, cy, cz = _mm3(location_mm)
    lb = L * 0.62
    le = (L - lb) / 2
    parts = []
    body = add_cyl(f"{name}_body", (cx, cy, cz), R, lb, material,
                   module=module, module_objects=module_objects,
                   rotation=(math.radians(90), 0, 0))
    parts.append(body)
    parts.append(add_frustum(f"{name}_nose", (cx, cy - lb / 2 - le / 2, cz), R * 0.45, R, le,
                             material, module=module, module_objects=module_objects,
                             rotation=(math.radians(-90), 0, 0)))
    parts.append(add_frustum(f"{name}_tail", (cx, cy + lb / 2 + le / 2, cz), R, R * 0.30, le,
                             material, module=module, module_objects=module_objects,
                             rotation=(math.radians(-90), 0, 0)))
    if pylon_to_z_mm is not None:
        pz = _mm(pylon_to_z_mm)
        top = cz + R
        h = abs(pz - top)
        if h > 1e-4:
            zc = (pz + top) / 2
            parts.append(add_box(f"{name}_pylon", (cx, cy, zc), (R * 0.7, lb * 0.55, h),
                                 material, module=module, module_objects=module_objects))
    asm = _finalise_assembly(name, body, parts, module, extras={"radius_m": R})
    if parent is not None:
        declare_relation(asm, "attached_to", parent)
    return asm


def prim_propeller(name, diameter_mm, n_blades, location_mm, material=None,
                   material_hub=None, axis="y", pitch_deg=14.0, parent=None,
                   module=None, module_objects=None):
    """Propeller: hub + n_blades thin blades in the rotation plane normal to
    `axis` ("y" = conventional puller/pusher on a Y fore-aft airframe; "z" =
    lift rotor). diameter_mm = disc diameter; location_mm = hub centre (mm).
    parent= assembly (pod/fuselage) → attached_to."""
    R = _mm(diameter_mm) / 2
    cx, cy, cz = _mm3(location_mm)
    hub_r = max(R * 0.10, 0.02)
    hub_mat = material_hub or material
    parts = []
    hub_rot = (math.radians(90), 0, 0) if axis == "y" else (0, 0, 0)
    hub = add_cyl(f"{name}_hub", (cx, cy, cz), hub_r, hub_r * 1.6, hub_mat,
                  module=module, module_objects=module_objects, rotation=hub_rot)
    parts.append(hub)
    blade_len = R * 0.94
    blade_w = max(R * 0.13, 0.015)
    blade_t = max(R * 0.035, 0.006)
    for i in range(int(n_blades)):
        theta = 2 * math.pi * i / int(n_blades)
        rmid = hub_r + blade_len / 2
        if axis == "y":
            loc = (cx + rmid * math.cos(theta), cy, cz + rmid * math.sin(theta))
            rot = (math.radians(pitch_deg), -theta, 0)
            size = (blade_len, blade_t, blade_w)
        else:  # axis == "z": lift rotor, blades in XY plane
            loc = (cx + rmid * math.cos(theta), cy + rmid * math.sin(theta), cz)
            rot = (0, math.radians(pitch_deg), theta)
            size = (blade_len, blade_w, blade_t)
        parts.append(add_box(f"{name}_blade_{i+1}", loc, size, material,
                             module=module, module_objects=module_objects, rotation=rot))
    asm = _finalise_assembly(name, hub, parts, module)
    if parent is not None:
        declare_relation(asm, "attached_to", parent)
    return asm


# ─── Plant / industrial set ───────────────────────────────────────────────


def prim_vessel(name, diameter_mm, length_mm, location_mm, material=None,
                orientation="horizontal", material_support=None,
                support_height_mm=120, n_ports=1, module=None, module_objects=None):
    """Pressure vessel / tank with dished (torispherical-read) ends.
    diameter_mm × length_mm overall (tan-line to tan-line + dishes).
    orientation: "horizontal" (axis X, on 2 saddles) | "vertical" (axis Z,
    on 4 legs). location_mm = BASE-CENTRE (underside of supports) in mm.
    Returns assembly with extras: "ports_m" {"top": (x,y,z)} — connect
    prim_pipe_run() between vessel ports. Root = shell."""
    R = _mm(diameter_mm) / 2
    L = _mm(length_mm)
    hs = _mm(support_height_mm)
    bx, by, bz = _mm3(location_mm)
    dish = R * 0.35
    lb = max(L - 2 * dish, R * 0.5)
    sup_mat = material_support or material
    parts = []
    if orientation == "horizontal":
        cz = bz + hs + R
        shell = add_cyl(f"{name}_shell", (bx, by, cz), R, lb, material,
                        module=module, module_objects=module_objects,
                        rotation=(0, math.radians(90), 0))
        parts.append(shell)
        for sx, side in [(bx - lb / 2, "W"), (bx + lb / 2, "E")]:
            end = add_sphere(f"{name}_head_{side}", (sx, by, cz), R, material,
                             module=module, module_objects=module_objects)
            end.scale = (0.40, 1.0, 1.0)
            parts.append(end)
        for sx, side in [(bx - lb * 0.30, "W"), (bx + lb * 0.30, "E")]:
            parts.append(add_box(f"{name}_saddle_{side}", (sx, by, bz + hs / 2),
                                 (R * 0.45, R * 1.7, hs), sup_mat,
                                 module=module, module_objects=module_objects))
        port_xyz = (bx, by, cz + R)
    else:  # vertical
        cz = bz + hs + lb / 2
        shell = add_cyl(f"{name}_shell", (bx, by, cz), R, lb, material,
                        module=module, module_objects=module_objects)
        parts.append(shell)
        for sz_, side in [(bz + hs, "bot"), (bz + hs + lb, "top")]:
            end = add_sphere(f"{name}_head_{side}", (bx, by, sz_), R, material,
                             module=module, module_objects=module_objects)
            end.scale = (1.0, 1.0, 0.40)
            parts.append(end)
        for i in range(4):
            ang = math.pi / 4 + i * math.pi / 2
            parts.append(add_box(f"{name}_leg_{i+1}",
                                 (bx + R * 0.85 * math.cos(ang), by + R * 0.85 * math.sin(ang), bz + hs / 2),
                                 (R * 0.16, R * 0.16, hs), sup_mat,
                                 module=module, module_objects=module_objects))
        port_xyz = (bx, by, bz + hs + lb + dish)
    for i in range(max(0, int(n_ports))):
        px = port_xyz[0] + (i - (n_ports - 1) / 2) * R * 0.6 * (1 if orientation == "horizontal" else 0)
        parts.append(add_cyl(f"{name}_port_{i+1}", (px, port_xyz[1], port_xyz[2]),
                             R * 0.13, R * 0.35, material,
                             module=module, module_objects=module_objects))
    return _finalise_assembly(name, shell, parts, module,
                              extras={"ports_m": {"top": port_xyz}, "radius_m": R})


def prim_skid_frame(name, width_mm, depth_mm, height_mm, location_mm, material=None,
                    n_cross_members=3, member_mm=120, deck=True, material_deck=None,
                    module=None, module_objects=None):
    """Open structural skid: perimeter base rails + cross members + corner
    posts + top perimeter rails + optional deck plate. width(X) × depth(Y)
    × height(Z) in mm; location_mm = BASE-CENTRE. Root = first long rail.
    Use hero_open_frame=True in run_render_pipeline for skid scenes."""
    w = _mm(width_mm); d = _mm(depth_mm); h = _mm(height_mm); m = _mm(member_mm)
    bx, by, bz = _mm3(location_mm)
    parts = []
    root = None
    for level, zc in [("base", bz + m / 2), ("top", bz + h - m / 2)]:
        for sy, side in [(by - d / 2 + m / 2, "S"), (by + d / 2 - m / 2, "N")]:
            r = add_box(f"{name}_{level}_rail_{side}", (bx, sy, zc), (w, m, m), material,
                        module=module, module_objects=module_objects)
            parts.append(r)
            if root is None:
                root = r
        for sx, side in [(bx - w / 2 + m / 2, "W"), (bx + w / 2 - m / 2, "E")]:
            parts.append(add_box(f"{name}_{level}_end_{side}", (sx, by, zc),
                                 (m, d - 2 * m, m), material,
                                 module=module, module_objects=module_objects))
    for i in range(int(n_cross_members)):
        sx = bx - w / 2 + (i + 1) * w / (n_cross_members + 1)
        parts.append(add_box(f"{name}_cross_{i+1}", (sx, by, bz + m / 2),
                             (m, d - 2 * m, m), material,
                             module=module, module_objects=module_objects))
    for sx, sy, corner in [(bx - w / 2 + m / 2, by - d / 2 + m / 2, "SW"),
                           (bx + w / 2 - m / 2, by - d / 2 + m / 2, "SE"),
                           (bx - w / 2 + m / 2, by + d / 2 - m / 2, "NW"),
                           (bx + w / 2 - m / 2, by + d / 2 - m / 2, "NE")]:
        parts.append(add_box(f"{name}_post_{corner}", (sx, sy, bz + h / 2),
                             (m, m, h - 2 * m), material,
                             module=module, module_objects=module_objects))
    if deck:
        parts.append(add_box(f"{name}_deck", (bx, by, bz + h + m * 0.15),
                             (w, d, m * 0.3), material_deck or material,
                             module=module, module_objects=module_objects))
    return _finalise_assembly(name, root, parts, module,
                              extras={"top_z_m": bz + h + (m * 0.3 if deck else 0)})


def prim_pipe_rack(name, length_mm, width_mm, height_mm, location_mm, material=None,
                   n_bays=3, n_tiers=2, member_mm=150, module=None, module_objects=None):
    """Pipe rack: (n_bays+1) portal frames along X (2 posts + a cross beam
    per tier) + longitudinal stringers each tier. length(X) × width(Y) ×
    height(Z) mm; location_mm = BASE-CENTRE."""
    L = _mm(length_mm); w = _mm(width_mm); h = _mm(height_mm); m = _mm(member_mm)
    bx, by, bz = _mm3(location_mm)
    parts = []
    root = None
    tier_zs = [bz + h * (i + 1) / n_tiers for i in range(int(n_tiers))]
    for f in range(int(n_bays) + 1):
        fx = bx - L / 2 + f * L / n_bays
        for sy, side in [(by - w / 2 + m / 2, "S"), (by + w / 2 - m / 2, "N")]:
            p = add_box(f"{name}_post_{f+1}{side}", (fx, sy, bz + h / 2), (m, m, h),
                        material, module=module, module_objects=module_objects)
            parts.append(p)
            if root is None:
                root = p
        for ti, tz in enumerate(tier_zs):
            parts.append(add_box(f"{name}_beam_{f+1}_t{ti+1}", (fx, by, tz - m / 2),
                                 (m, w, m), material,
                                 module=module, module_objects=module_objects))
    for ti, tz in enumerate(tier_zs):
        for sy, side in [(by - w / 2 + m / 2, "S"), (by + w / 2 - m / 2, "N")]:
            parts.append(add_box(f"{name}_stringer_t{ti+1}{side}", (bx, sy, tz - m / 2),
                                 (L, m * 0.7, m * 0.7), material,
                                 module=module, module_objects=module_objects))
    return _finalise_assembly(name, root, parts, module, extras={"tier_zs_m": tier_zs})


def prim_rack_row(name, n_racks, rack_width_mm, rack_depth_mm, rack_height_mm,
                  pitch_mm, location_mm, material=None, material_internal=None,
                  axis="x", module=None, module_objects=None):
    """Row of equipment racks/cabinets on a shared pitch (battery racks,
    server racks, switchgear line-up). Each rack = frame shell + recessed
    dark internal + plinth. location_mm = BASE-CENTRE of the whole row;
    racks repeat along `axis` ("x"|"y") at pitch_mm. All mm."""
    rw = _mm(rack_width_mm); rd = _mm(rack_depth_mm); rh = _mm(rack_height_mm)
    pitch = _mm(pitch_mm)
    bx, by, bz = _mm3(location_mm)
    n = int(n_racks)
    inner_mat = material_internal or material
    parts = []
    root = None
    for i in range(n):
        off = (i - (n - 1) / 2) * pitch
        cx, cy = (bx + off, by) if axis == "x" else (bx, by + off)
        frame = add_box(f"{name}_rack_{i+1:02d}_frame", (cx, cy, bz + rh / 2),
                        (rw, rd, rh), material,
                        module=module, module_objects=module_objects)
        parts.append(frame)
        if root is None:
            root = frame
        parts.append(add_box(f"{name}_rack_{i+1:02d}_internal", (cx, cy, bz + rh / 2),
                             (rw * 0.84, rd * 0.84, rh * 0.80), inner_mat,
                             module=module, module_objects=module_objects))
        parts.append(add_box(f"{name}_rack_{i+1:02d}_plinth", (cx, cy, bz + rh * 0.02),
                             (rw * 1.04, rd * 1.04, rh * 0.04), material,
                             module=module, module_objects=module_objects))
    return _finalise_assembly(name, root, parts, module)


def prim_enclosure(name, width_mm, depth_mm, height_mm, location_mm, material=None,
                   door_faces=("front",), wall_mm=60, material_door=None,
                   module=None, module_objects=None):
    """Enclosure / container shell: floor + roof + 4 walls; faces listed in
    door_faces ("front"=+Y, "back"=-Y, "left"=-X, "right"=+X) get a slightly
    proud door leaf + handle. width(X) × depth(Y) × height(Z) mm;
    location_mm = BASE-CENTRE. Root = floor (tag the assembly
    structure_containment and the render pipeline's translucent-hero
    treatment applies as usual)."""
    w = _mm(width_mm); d = _mm(depth_mm); h = _mm(height_mm); t = _mm(wall_mm)
    bx, by, bz = _mm3(location_mm)
    door_mat = material_door or material
    parts = []
    floor = add_box(f"{name}_floor", (bx, by, bz + t / 2), (w, d, t), material,
                    module=module, module_objects=module_objects)
    parts.append(floor)
    parts.append(add_box(f"{name}_roof", (bx, by, bz + h - t / 2), (w, d, t), material,
                         module=module, module_objects=module_objects))
    face_geo = {
        "front": ((bx, by + d / 2 - t / 2, bz + h / 2), (w, t, h - 2 * t), (0, 1, 0)),
        "back":  ((bx, by - d / 2 + t / 2, bz + h / 2), (w, t, h - 2 * t), (0, -1, 0)),
        "left":  ((bx - w / 2 + t / 2, by, bz + h / 2), (t, d, h - 2 * t), (-1, 0, 0)),
        "right": ((bx + w / 2 - t / 2, by, bz + h / 2), (t, d, h - 2 * t), (1, 0, 0)),
    }
    for face, (loc, size, normal) in face_geo.items():
        parts.append(add_box(f"{name}_wall_{face}", loc, size, material,
                             module=module, module_objects=module_objects))
        if face in door_faces:
            nx, ny, _ = normal
            leaf_w = (min(w, d) * 0.42)
            leaf_h = h * 0.72
            dloc = (loc[0] + nx * t, loc[1] + ny * t, bz + leaf_h / 2 + t)
            dsize = (leaf_w, t * 0.8, leaf_h) if ny else (t * 0.8, leaf_w, leaf_h)
            parts.append(add_box(f"{name}_door_{face}", dloc, dsize, door_mat,
                                 module=module, module_objects=module_objects))
            hloc = (dloc[0] + (leaf_w * 0.38 if ny else nx * t),
                    dloc[1] + (ny * t if ny else leaf_w * 0.38),
                    bz + h * 0.45)
            parts.append(add_box(f"{name}_handle_{face}", hloc,
                                 (0.03, 0.03, 0.18), door_mat,
                                 module=module, module_objects=module_objects))
    return _finalise_assembly(name, floor, parts, module)


def prim_tower(name, height_mm, base_width_mm, location_mm, material=None,
               taper=0.45, material_flange=None, module=None, module_objects=None):
    """Tubular tower/mast: tapered tube + base flange + top platform disc.
    taper = top diameter as a fraction of base. height/base width in mm;
    location_mm = BASE-CENTRE. Root = tube."""
    h = _mm(height_mm)
    rb = _mm(base_width_mm) / 2
    rt = rb * max(0.05, min(1.0, taper))
    bx, by, bz = _mm3(location_mm)
    parts = []
    tube = add_frustum(f"{name}_tube", (bx, by, bz + h / 2), rb, rt, h, material,
                       module=module, module_objects=module_objects, vertices=32)
    parts.append(tube)
    parts.append(add_cyl(f"{name}_base_flange", (bx, by, bz + rb * 0.05), rb * 1.25,
                         rb * 0.1, material_flange or material,
                         module=module, module_objects=module_objects))
    parts.append(add_cyl(f"{name}_top_platform", (bx, by, bz + h + rt * 0.1), rt * 1.5,
                         rt * 0.2, material_flange or material,
                         module=module, module_objects=module_objects))
    return _finalise_assembly(name, tube, parts, module, extras={"top_z_m": bz + h})


def prim_hull(name, length_mm, beam_mm, depth_mm, location_mm, material=None,
              material_deck=None, module=None, module_objects=None):
    """Marine hull: main hull body + tapered bow (forward, +X) + deck plate
    + keel strip. length(X) × beam(Y) × depth(Z) mm; location_mm =
    BASE-CENTRE (keel underside). Root = hull body."""
    L = _mm(length_mm); B = _mm(beam_mm); D = _mm(depth_mm)
    bx, by, bz = _mm3(location_mm)
    lbow = L * 0.26
    lmain = L - lbow
    cz = bz + D / 2
    parts = []
    body = add_box(f"{name}_body", (bx - lbow / 2, by, cz), (lmain, B, D), material,
                   module=module, module_objects=module_objects)
    parts.append(body)
    bow = add_frustum(f"{name}_bow", (bx + lmain / 2 - lbow / 2 + lbow / 2, by, cz),
                      B / 2, B * 0.10, lbow, material,
                      module=module, module_objects=module_objects,
                      rotation=(0, math.radians(90), 0), vertices=24)
    bow.scale = (1.0, 1.0, D / B)  # squash circular cone to hull depth
    parts.append(bow)
    parts.append(add_box(f"{name}_deck", (bx - lbow / 2, by, bz + D - D * 0.02),
                         (lmain, B * 0.96, D * 0.04), material_deck or material,
                         module=module, module_objects=module_objects))
    parts.append(add_box(f"{name}_keel", (bx - lbow / 2, by, bz + D * 0.02),
                         (lmain * 0.9, B * 0.08, D * 0.04), material,
                         module=module, module_objects=module_objects))
    return _finalise_assembly(name, body, parts, module)


def prim_gantry(name, span_mm, height_mm, location_mm, material=None,
                leg_mm=300, beam_mm=400, axis="x", with_trolley=True,
                material_trolley=None, module=None, module_objects=None):
    """Gantry/portal frame: 2 legs + main beam across the top (+ optional
    trolley block under the beam centre). span along `axis` ("x"|"y"),
    height in mm; location_mm = BASE-CENTRE. Root = beam."""
    s = _mm(span_mm); h = _mm(height_mm); lw = _mm(leg_mm); bh = _mm(beam_mm)
    bx, by, bz = _mm3(location_mm)
    parts = []
    if axis == "x":
        beam = add_box(f"{name}_beam", (bx, by, bz + h - bh / 2), (s, lw, bh), material,
                       module=module, module_objects=module_objects)
        leg_locs = [(bx - s / 2 + lw / 2, by, "W"), (bx + s / 2 - lw / 2, by, "E")]
    else:
        beam = add_box(f"{name}_beam", (bx, by, bz + h - bh / 2), (lw, s, bh), material,
                       module=module, module_objects=module_objects)
        leg_locs = [(bx, by - s / 2 + lw / 2, "S"), (bx, by + s / 2 - lw / 2, "N")]
    parts.append(beam)
    for lx, ly, side in leg_locs:
        parts.append(add_box(f"{name}_leg_{side}", (lx, ly, bz + (h - bh) / 2),
                             (lw, lw, h - bh), material,
                             module=module, module_objects=module_objects))
        parts.append(add_box(f"{name}_foot_{side}", (lx, ly, bz + lw * 0.1),
                             (lw * 1.8, lw * 1.8, lw * 0.2), material,
                             module=module, module_objects=module_objects))
    if with_trolley:
        parts.append(add_box(f"{name}_trolley", (bx, by, bz + h - bh - lw * 0.4),
                             (lw * 1.4, lw * 1.4, lw * 0.8),
                             material_trolley or material,
                             module=module, module_objects=module_objects))
    return _finalise_assembly(name, beam, parts, module)


def prim_rotating_machine(name, body_diameter_mm, body_length_mm, location_mm,
                          material=None, material_shaft=None, material_base=None,
                          axis="x", module=None, module_objects=None):
    """Rotating machine (motor/pump/turbine/compressor): baseplate + feet +
    cylindrical body along `axis` ("x"|"y") + shaft stub at the drive end +
    end bells + terminal box. body d × l in mm; location_mm = BASE-CENTRE
    (underside of baseplate). Root = body."""
    R = _mm(body_diameter_mm) / 2
    L = _mm(body_length_mm)
    bx, by, bz = _mm3(location_mm)
    base_t = R * 0.18
    foot_h = R * 0.30
    cz = bz + base_t + foot_h + R
    rot = (0, math.radians(90), 0) if axis == "x" else (math.radians(90), 0, 0)
    dx, dy = (1, 0) if axis == "x" else (0, 1)
    parts = []
    base = add_box(f"{name}_baseplate", (bx, by, bz + base_t / 2),
                   (L * 1.35 if dx else R * 2.4, R * 2.4 if dx else L * 1.35, base_t),
                   material_base or material, module=module, module_objects=module_objects)
    body = add_cyl(f"{name}_body", (bx, by, cz), R, L, material,
                   module=module, module_objects=module_objects, rotation=rot)
    parts += [body, base]
    for s, side in [(-1, "DE"), (1, "NDE")]:
        parts.append(add_frustum(f"{name}_endbell_{side}",
                                 (bx + dx * s * (L / 2 + R * 0.1), by + dy * s * (L / 2 + R * 0.1), cz),
                                 R, R * 0.55, R * 0.25, material,
                                 module=module, module_objects=module_objects,
                                 rotation=(0, math.radians(s * 90), 0) if axis == "x"
                                 else (math.radians(-s * 90), 0, 0)))
        parts.append(add_box(f"{name}_foot_{side}",
                             (bx + dx * s * L * 0.32, by + dy * s * L * 0.32, bz + base_t + foot_h / 2),
                             (R * 0.5 if dx else R * 1.9, R * 1.9 if dx else R * 0.5, foot_h),
                             material_base or material,
                             module=module, module_objects=module_objects))
    parts.append(add_cyl(f"{name}_shaft", (bx + dx * (L / 2 + R * 0.45), by + dy * (L / 2 + R * 0.45), cz),
                         R * 0.16, R * 0.7, material_shaft or material,
                         module=module, module_objects=module_objects, rotation=rot))
    parts.append(add_box(f"{name}_terminal_box", (bx, by, cz + R + R * 0.18),
                         (R * 0.5, R * 0.5, R * 0.36), material_shaft or material,
                         module=module, module_objects=module_objects))
    return _finalise_assembly(name, body, parts, module)


def prim_panel_stack(name, n_panels, panel_width_mm, panel_height_mm, panel_depth_mm,
                     pitch_mm, location_mm, material=None, axis="y",
                     module=None, module_objects=None):
    """Repeated flat panels on a pitch (PV strings, filter banks, plate
    stacks, electrolyser cells). Panels face along `axis` ("y"|"x"), i.e.
    width×height plates pitched along that axis. All mm; location_mm =
    BASE-CENTRE of the stack."""
    pw = _mm(panel_width_mm); ph = _mm(panel_height_mm); pd = _mm(panel_depth_mm)
    pitch = _mm(pitch_mm)
    bx, by, bz = _mm3(location_mm)
    n = int(n_panels)
    parts = []
    root = None
    for i in range(n):
        off = (i - (n - 1) / 2) * pitch
        if axis == "y":
            loc, size = (bx, by + off, bz + ph / 2), (pw, pd, ph)
        else:
            loc, size = (bx + off, by, bz + ph / 2), (pd, pw, ph)
        p = add_box(f"{name}_panel_{i+1:02d}", loc, size, material,
                    module=module, module_objects=module_objects)
        parts.append(p)
        if root is None:
            root = p
    return _finalise_assembly(name, root, parts, module)


def prim_foundation(name, width_mm, depth_mm, thickness_mm, location_mm, material=None,
                    module=None, module_objects=None):
    """Concrete foundation slab / baseplate. width(X) × depth(Y) ×
    thickness(Z) mm; location_mm = BASE-CENTRE (underside). Root = slab."""
    w = _mm(width_mm); d = _mm(depth_mm); t = _mm(thickness_mm)
    bx, by, bz = _mm3(location_mm)
    slab = add_box(f"{name}_slab", (bx, by, bz + t / 2), (w, d, t), material,
                   module=module, module_objects=module_objects)
    return _finalise_assembly(name, slab, [slab], module,
                              extras={"top_z_m": bz + t})


# ─── Connection routing (pipes / cables / ducts) ──────────────────────────


def route_orthogonal(start_mm, end_mm, rise_mm=600.0):
    """Manhattan route between two points (mm): rise vertically above the
    higher endpoint by rise_mm, traverse X then Y at that level, drop to the
    end point. Returns a waypoint list (mm) for prim_pipe_run(). Degenerate
    legs (< 1 mm) are dropped."""
    sx, sy, sz = (float(c) for c in start_mm)
    ex, ey, ez = (float(c) for c in end_mm)
    zt = max(sz, ez) + float(rise_mm)
    raw = [(sx, sy, sz), (sx, sy, zt), (ex, sy, zt), (ex, ey, zt), (ex, ey, ez)]
    pts = [raw[0]]
    for p in raw[1:]:
        if max(abs(p[0] - pts[-1][0]), abs(p[1] - pts[-1][1]), abs(p[2] - pts[-1][2])) > 1.0:
            pts.append(p)
    return pts


def _fillet_waypoints_m(pts_m, radius_m, samples=4):
    """Replace each interior corner of an ORTHOGONAL polyline with a sampled
    quarter-arc of radius radius_m (clamped to 45% of each adjacent leg).
    Non-perpendicular corners fall back to a 2-point chamfer."""
    if radius_m <= 0 or len(pts_m) < 3:
        return list(pts_m)
    out = [mathutils.Vector(pts_m[0])]
    for i in range(1, len(pts_m) - 1):
        A = mathutils.Vector(pts_m[i - 1])
        P = mathutils.Vector(pts_m[i])
        B = mathutils.Vector(pts_m[i + 1])
        u = (P - A); la = u.length; u.normalize()
        v = (B - P); lb = v.length; v.normalize()
        if (u - v).length < 1e-6:  # straight-through point
            continue
        r = min(radius_m, la * 0.45, lb * 0.45)
        p1 = P - u * r
        p2 = P + v * r
        if abs(u.dot(v)) > 1e-3:  # not perpendicular — chamfer
            out += [p1, p2]
            continue
        C = p1 + v * r
        for k in range(samples + 1):
            th = (k / samples) * math.pi / 2
            out.append(C - v * r * math.cos(th) + u * r * math.sin(th))
    out.append(mathutils.Vector(pts_m[-1]))
    return [tuple(p) for p in out]


from pipe_flange_rules import should_emit_pipe_end_flanges  # noqa: E402


def prim_pipe_run(name, waypoints_mm, diameter_mm, material=None,
                  bend_radius_mm=None, flanges=False, connect=(),
                  module=None, module_objects=None):
    """Routed pipe/cable/duct run along an orthogonal waypoint path (mm),
    with real bend radii at the corners (quarter-arc fillets; default bend
    radius = 1.5D). Use route_orthogonal() to generate waypoints between two
    ports, or pass them explicitly.
    connect=(asm_a, asm_b, ...) declares the run attached_to each — the
    module linkage that makes the connectivity check pass and the geometry
    read as a connected plant.

    INTENT: Pipe-end flanges are OFF by default. Stage-2 nozzle stubs own the
    single joint face at a port landing; a pipe-end disc (even alone) reads as
    a free-end T-bar on risers and unterminated runs (Sam/Codema, 2026-07-09).
    `flanges=True` is accepted for API compatibility but suppressed by
    `should_emit_pipe_end_flanges` unless PIPE_END_FLANGES_ENABLED is flipped.
    """

    dia = _mm(diameter_mm)
    r_bend = _mm(bend_radius_mm) if bend_radius_mm is not None else dia * 1.5
    pts_m = [_mm3(p) for p in waypoints_mm]
    if len(pts_m) < 2:
        raise ValueError("prim_pipe_run needs >= 2 waypoints")
    path = _fillet_waypoints_m(pts_m, r_bend)
    pipe = add_pipe(f"{name}_tube", path, dia / 2, material,
                    module=module, module_objects=module_objects, bevel_segments=6)
    parts = [pipe]
    # DECISION: connect partners ⇒ nozzle stub already owns the flange face.
    # Emitting flanges=True on top of that is the double-disc T residual.
    if should_emit_pipe_end_flanges(flanges, connect):
        # Raised-face flange proportions (not a fat T-bar): OD ≈ 1.35× pipe OD,
        # face thickness ≈ 0.12× pipe OD. The old dia*0.85 radius + dia*0.35 length
        # read as free-end T-pieces on every riser (Sam/Codema visual, 2026-07-09).
        fl_r = dia * 0.675          # radius → OD = 1.35 × pipe OD
        fl_t = max(dia * 0.12, 0.012)  # thin face (metres)
        for pt, nbr, side in [(pts_m[0], pts_m[1], "A"), (pts_m[-1], pts_m[-2], "B")]:
            d = (mathutils.Vector(nbr) - mathutils.Vector(pt)).normalized()
            # Skip flange on a stub tip shorter than ~2 pipe diameters — those free
            # ends are the T-stubs that go nowhere; a flange only makes them louder.
            seg_len = (mathutils.Vector(nbr) - mathutils.Vector(pt)).length
            if seg_len < dia * 2.0:
                continue
            if abs(d.z) > 0.9:
                rot = (0, 0, 0)
            elif abs(d.x) > 0.9:
                rot = (0, math.radians(90), 0)
            else:
                rot = (math.radians(90), 0, 0)
            parts.append(add_cyl(f"{name}_flange_{side}", pt, fl_r, fl_t,
                                 material, module=module, module_objects=module_objects,
                                 rotation=rot))
    pipe["fl_pipe_run"] = True
    asm = _finalise_assembly(name, pipe, parts, module)
    for other in connect:
        declare_relation(asm, "attached_to", other)
    return asm
