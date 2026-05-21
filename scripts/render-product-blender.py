#!/usr/bin/env python3
"""
scripts/render-product-blender.py — generic, brief-aware Blender
illustration renderer for the ForgeOS PDF engine.

Sprint 0 v5 (Tristan 2026-05-20): replace gpt-image-1 stylistic drift
with a single deterministic Blender scene rendered from N camera
azimuths — one image per module, all on the same orbital sphere. Reads
"turntable spin": same product, rotating viewpoint, different module
highlighted in saturated colour while the others stay greyscale.

Architecture (validated 2026-05-17, source mempalace drawer
drawer_forgeos_decisions on bess-camera-orbit.py):
  - ONE Blender scene per product. All N module images sit on the same
    orbital sphere.
  - Camera convention: turntable orbit with fixed RADIUS + ELEVATION +
    LENS (35 mm). Only AZIMUTH varies per module.
  - Each module render → same scene at a different camera azimuth,
    focal module SATURATED colour, all others GREYSCALE.
  - Aesthetic: clean engineering schematic. Eevee, Freestyle outlines,
    flat Principled BSDF (no PBR / no HDRI / no photoreal). High-
    saturation base colours from a fixed palette; unknown module ids
    hash to a stable colour.

This script is INVOKED HEADLESS by scripts/render-product-
illustrations.tsx using the Blender CLI:

    /Applications/Blender.app/Contents/MacOS/Blender \
        --background --python scripts/render-product-blender.py -- \
        --state <state.json> --module <id|cover> --azimuth <deg> \
        --out <png>

(arguments AFTER `--` are forwarded to the Python script verbatim.)

INPUTS read from state.json:
  state.parsedBrief.constraints.max_dimensions_mm = { w, d, h }  (mm)
  state.moduleDecomposition.modules[] = [{ module, sub_modules, ... }]
  state.moduleDecomposition.product_class

OUTPUT:
  Single PNG at the path passed via --out.

UNIVERSAL: no per-class hardcoding. Box layout is driven entirely by
moduleDecomposition.modules — each module becomes a box inside the
envelope shell, with size proportional to its sub_modules count.

WHEN BLENDER IS UNAVAILABLE: this script is not invoked. The wrapper
falls through to the existing AI-image generation step. See
render-product-illustrations.tsx for the fallback chain.

References: see CLAUDE.md "ForgeOS PDF Engine — Mistakes to Avoid"
item 6 (§4.5 binding contract) and MEMORY topic file
forgeos_chain_engine_locations_2026_05_19.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
from pathlib import Path

# Blender python modules — only importable when the script is executed
# from inside Blender (`blender --background --python ...`). If we're
# invoked as a plain `python3` script for syntax-check we still want a
# meaningful error rather than a crash.
try:
    import bpy  # type: ignore
    from mathutils import Vector  # type: ignore
except ImportError:  # pragma: no cover — host python, not Blender
    print(
        "[blender-render] FATAL: must be invoked via Blender — "
        "`blender --background --python scripts/render-product-blender.py -- ...`",
        file=sys.stderr,
    )
    sys.exit(2)


# ── Palette ────────────────────────────────────────────────────────────
# Module-id → RGB (linear, 0..1 floats). Covers common ForgeOS module
# ids across the 5 stage-gate product classes (BESS, heat pump, vertical
# farm, CGM, AUV, HAPS). Unknown module ids hash to a stable colour via
# `palette_for(module_id)` — universal across any product class.

_PALETTE_HEX = {
    # universal module spine (PA architecture stage 1.7)
    "structure_containment":          "#3a6ea5",  # steel blue
    "energy_conversion_transduction": "#e8a93b",  # warm amber
    "environmental_interface":        "#4fb286",  # mint
    "mass_fluid_transport_process":   "#3aa3c4",  # cyan
    "sensing_instrumentation":        "#a061d1",  # purple
    "control_compute_communication":  "#5867d4",  # indigo
    "power_distribution":             "#e36b3e",  # orange-red
    "safety_protection":              "#d4413a",  # crimson
    "actuation_kinematics":           "#7aa53a",  # olive green
    "hmi_ergonomics":                 "#d4a23a",  # mustard
    "maintenance_serviceability":     "#6c8b9a",  # slate
    # legacy aliases sometimes emitted by older chains
    "structure":                      "#3a6ea5",
    "energy":                         "#e8a93b",
    "thermal":                        "#4fb286",
    "fluid":                          "#3aa3c4",
    "sensing":                        "#a061d1",
    "control":                        "#5867d4",
    "power":                          "#e36b3e",
    "safety":                         "#d4413a",
    "actuation":                      "#7aa53a",
    "hmi":                            "#d4a23a",
    "maintenance":                    "#6c8b9a",
}


def _hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return (
        int(h[0:2], 16) / 255.0,
        int(h[2:4], 16) / 255.0,
        int(h[4:6], 16) / 255.0,
    )


def palette_for(module_id: str) -> tuple[float, float, float]:
    """Stable colour for any module id. Returns linear sRGB 0..1."""
    if module_id in _PALETTE_HEX:
        return _hex_to_rgb(_PALETTE_HEX[module_id])
    # hash → HSV with high saturation → RGB. Deterministic, well-spread.
    digest = hashlib.sha1(module_id.encode("utf-8")).digest()
    hue = (digest[0] / 255.0)
    sat = 0.65 + (digest[1] / 255.0) * 0.15  # 0.65..0.80
    val = 0.55 + (digest[2] / 255.0) * 0.20  # 0.55..0.75
    # HSV → RGB
    i = int(hue * 6) % 6
    f = hue * 6 - int(hue * 6)
    p = val * (1 - sat)
    q = val * (1 - f * sat)
    t = val * (1 - (1 - f) * sat)
    if i == 0:
        return (val, t, p)
    if i == 1:
        return (q, val, p)
    if i == 2:
        return (p, val, t)
    if i == 3:
        return (p, q, val)
    if i == 4:
        return (t, p, val)
    return (val, p, q)


GREY = (0.62, 0.62, 0.62)  # greyscale colour for non-focal modules
SHELL_TINT = (0.78, 0.82, 0.88)  # envelope shell tint (visible enough
# to read as the container outline without obscuring the boxes inside)
SHELL_ALPHA = 0.40  # transparent enough to see modules inside,
# solid enough that the envelope reads unambiguously as "the box"
# (2026-05-21 Tristan feedback: 0.22 was too faint at the small inset
# sizes used for per-module images; 0.40 keeps the box legible)
GROUND_TINT = (0.96, 0.96, 0.97)


# ── CLI parsing ────────────────────────────────────────────────────────


def parse_argv() -> dict:
    """Parse args AFTER `--` (Blender swallows everything before)."""
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    opts: dict[str, str] = {}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a.startswith("--") and i + 1 < len(argv):
            opts[a[2:]] = argv[i + 1]
            i += 2
        else:
            i += 1
    for required in ("state", "module", "azimuth", "out"):
        if required not in opts:
            print(
                f"[blender-render] FATAL: missing --{required}",
                file=sys.stderr,
            )
            sys.exit(2)
    return opts


# ── State loader ───────────────────────────────────────────────────────


def load_state(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def envelope_mm(state: dict) -> tuple[float, float, float]:
    """Returns (w, d, h) in METRES. Falls back to a default 6×2×2 m
    box if max_dimensions_mm is missing or partially null — keeps the
    renderer universal: it works even when the brief omitted the
    envelope. The caller never has to special-case missing data."""
    maxd = (
        state.get("parsedBrief", {})
        .get("constraints", {})
        .get("max_dimensions_mm")
        or {}
    )
    w = float(maxd.get("w") or 0) or 6000.0
    d = float(maxd.get("d") or 0) or 2000.0
    h = float(maxd.get("h") or 0) or 2000.0
    return (w / 1000.0, d / 1000.0, h / 1000.0)


def modules(state: dict) -> list[dict]:
    md = state.get("moduleDecomposition", {}) or {}
    mods = md.get("modules") or []
    return [m for m in mods if isinstance(m, dict) and m.get("module")]


# ── Scene construction ────────────────────────────────────────────────


def reset_scene() -> None:
    """Empty the default scene. Blender's empty-scene API is finicky —
    deleting every datablock by type is the reliable form."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.lights,
        bpy.data.cameras,
        bpy.data.curves,
        bpy.data.images,
    ):
        for item in list(coll):
            coll.remove(item)


def make_flat_material(name: str, rgb: tuple[float, float, float],
                       alpha: float = 1.0) -> "bpy.types.Material":
    """Plain Principled BSDF, no PBR, no specular highlights — looks
    like a flat schematic fill. Used for both the envelope shell
    (alpha < 1) and module boxes (alpha = 1)."""
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
        # Zero out everything that would make it look photoreal
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.0
        elif "Specular" in bsdf.inputs:  # older Blender naming
            bsdf.inputs["Specular"].default_value = 0.0
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 1.0
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0
        if alpha < 1.0:
            bsdf.inputs["Alpha"].default_value = alpha
            mat.blend_method = "BLEND"
            try:
                mat.surface_render_method = "BLENDED"
            except AttributeError:
                pass
    return mat


def add_box(name: str, centre: tuple[float, float, float],
            size: tuple[float, float, float],
            material: "bpy.types.Material") -> "bpy.types.Object":
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=centre)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] / 2.0, size[1] / 2.0, size[2] / 2.0)
    bpy.ops.object.transform_apply(scale=True)
    obj.data.materials.append(material)
    return obj


def layout_modules(
    mods: list[dict],
    env_w: float,
    env_d: float,
    env_h: float,
    focal_id: str | None,
    show_all_coloured: bool = False,
) -> list[dict]:
    """Pack module boxes inside the envelope on a grid sized by module
    count. Returns a list of { id, centre, size, rgb } dicts.

    Universal layout: grid columns sized to keep cells roughly square in
    plan view. Box height scales with sub_modules count (more sub-
    modules → taller box) so the figure communicates relative complexity.

    Colour rules:
      - show_all_coloured=True  → every module in its palette colour
        (used for the cover shot).
      - focal_id set            → that module saturated, all others grey
        (used for per-module turntable shots).
      - neither                 → all grey (degenerate fallback).
    """
    n = len(mods)
    if n == 0:
        return []
    # Pick a grid that fits inside the envelope footprint reasonably.
    # Aspect-aware: long-thin envelopes (containers) want many cols /
    # few rows. Square envelopes want a square-ish grid.
    cols = max(1, int(round(math.sqrt(n * env_w / max(env_d, 0.1)))))
    cols = min(cols, n)
    rows = int(math.ceil(n / cols))
    # Cell dimensions with margins. Cell footprint is clamped so boxes
    # never poke through the envelope shell.
    margin = 0.06 * min(env_w, env_d, env_h)
    cell_w = max(0.1, (env_w - margin * (cols + 1)) / cols)
    cell_d = max(0.1, (env_d - margin * (rows + 1)) / rows)
    # Box footprint = 80% of cell so there's air between boxes and the
    # shell. The 0.80 factor matters more than the cell-sizing margin.
    box_w = cell_w * 0.80
    box_d = cell_d * 0.80
    # Max sub_modules count → for height scaling
    sub_counts: list[int] = []
    for m in mods:
        sm = m.get("sub_modules")
        sub_counts.append(len(sm) if isinstance(sm, list) else 0)
    max_sub = max(sub_counts) if sub_counts else 1
    items: list[dict] = []
    for idx, m in enumerate(mods):
        col = idx % cols
        row = idx // cols
        cx = -env_w / 2.0 + margin + cell_w / 2.0 + col * (cell_w + margin)
        cy = -env_d / 2.0 + margin + cell_d / 2.0 + row * (cell_d + margin)
        # Height: 25% to 70% of envelope height, scaled by sub_modules.
        # Capped at 70% so boxes never punch through the shell ceiling.
        sub = sub_counts[idx]
        h_ratio = 0.25 + 0.45 * (sub / max(max_sub, 1))
        bh = max(0.20, min(env_h * 0.70, env_h * h_ratio))
        cz = -env_h / 2.0 + margin + bh / 2.0
        mid = m.get("module") or f"module_{idx}"
        if show_all_coloured:
            rgb = palette_for(mid)
        elif mid == focal_id:
            rgb = palette_for(mid)
        else:
            rgb = GREY
        items.append(
            dict(
                id=mid,
                centre=(cx, cy, cz),
                size=(box_w, box_d, bh),
                rgb=rgb,
            )
        )
    return items


def build_scene(state: dict, focal: str | None) -> tuple[float, float, float]:
    """Build the entire scene. Returns the envelope dimensions in
    metres so the camera placement can use them."""
    reset_scene()
    env_w, env_d, env_h = envelope_mm(state)

    # Envelope shell — semi-transparent so you can see inside. Freestyle
    # outlines do the visual work; the BSDF is just enough to read as
    # "container present" against the grey floor.
    shell_mat = make_flat_material("ShellMat", SHELL_TINT, alpha=SHELL_ALPHA)
    add_box(
        "Envelope",
        (0.0, 0.0, 0.0),
        (env_w, env_d, env_h),
        shell_mat,
    )

    # Modules inside. Cover shot = all coloured. Per-module shot = focal
    # only saturated, others grey.
    mods = modules(state)
    is_cover = focal is None
    items = layout_modules(
        mods, env_w, env_d, env_h, focal,
        show_all_coloured=is_cover,
    )
    for it in items:
        mat = make_flat_material(f"Mod_{it['id']}", it["rgb"], alpha=1.0)
        add_box(f"box_{it['id']}", it["centre"], it["size"], mat)

    # Ground plane — flat off-white, gives a subtle scale reference.
    ground_mat = make_flat_material("Ground", GROUND_TINT, alpha=1.0)
    ground_size = max(env_w, env_d) * 6.0
    bpy.ops.mesh.primitive_plane_add(
        size=ground_size, location=(0.0, 0.0, -env_h / 2.0 - 0.01)
    )
    bpy.context.active_object.name = "Ground"
    bpy.context.active_object.data.materials.append(ground_mat)
    # Disable shadow casting on the ground so module shadows don't make
    # the boxes look like they're outside the shell (the high-contrast
    # SUN-shadow halo is what was confusing the cover render).
    try:
        bpy.context.active_object.visible_shadow = False
    except AttributeError:
        pass

    return env_w, env_d, env_h


# ── Camera + lighting + render setup ──────────────────────────────────


def place_camera(env_w: float, env_d: float, env_h: float,
                 azimuth_deg: float, wide: bool = False) -> None:
    """Place the camera on the orbital sphere.

    radius    = 1.5 × max envelope dim   (per validated decision)
    elevation = 0.4 × radius             (per validated decision)
    lens      = 35 mm fixed              (per validated decision)
    Only AZIMUTH varies per module.

    Note (Tristan 2026-05-20 review): for long-thin envelopes (the
    vertical-farm 40-ft container is 12 m × 2.4 m × 2.9 m), max_dim ×
    1.5 puts the camera 18 m away staring at a 2.4 m sliver. We use a
    `target_extent` heuristic — half the bounding-box diagonal — so
    long-thin and cube-like envelopes both frame correctly.
    """
    diag = math.sqrt(env_w * env_w + env_d * env_d + env_h * env_h)
    target_extent = diag / 2.0
    # Distance to fit `target_extent` in a 35mm lens with some margin.
    # 35mm vertical FoV ~38° → tan(19°) ≈ 0.344 → dist ≈ extent / 0.344.
    # Use 0.30 (slightly more pulled back) for safety, 0.22 for wide.
    fit = 0.22 if wide else 0.30
    distance = target_extent / fit
    elevation_angle = math.radians(28.0)  # consistent ¾ view
    az = math.radians(azimuth_deg)
    horiz = distance * math.cos(elevation_angle)
    cx = horiz * math.cos(az)
    cy = horiz * math.sin(az)
    cz = distance * math.sin(elevation_angle)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 35.0
    cam_data.clip_end = max(1000.0, distance * 4.0)
    cam_obj = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = (cx, cy, cz)
    # Aim at the scene centre
    direction = Vector((0.0, 0.0, 0.0)) - Vector((cx, cy, cz))
    rot_quat = direction.to_track_quat("-Z", "Y")
    cam_obj.rotation_euler = rot_quat.to_euler()
    bpy.context.scene.camera = cam_obj


def add_lighting(env_w: float, env_d: float, env_h: float) -> None:
    """Three flat fills — kills photoreal shadow drama, keeps the
    schematic readable. No HDRI, no sky tex, no PBR. Shadows are
    disabled because they make modules look like they sit OUTSIDE the
    semi-transparent envelope shell."""
    max_dim = max(env_w, env_d, env_h)
    height = max_dim * 2.0
    for name, pos, energy in [
        ("KeyLight", (max_dim * 1.5, -max_dim * 1.5, height), 4.0),
        ("FillLight", (-max_dim * 1.5, -max_dim * 1.0, height * 0.6), 3.0),
        ("BackLight", (0.0, max_dim * 1.5, height * 0.8), 2.0),
    ]:
        light_data = bpy.data.lights.new(name=name, type="SUN")
        light_data.energy = energy
        # Turn shadows OFF — schematic look, no cast shadows.
        try:
            light_data.use_shadow = False
        except AttributeError:
            pass
        light_obj = bpy.data.objects.new(name=name, object_data=light_data)
        bpy.context.collection.objects.link(light_obj)
        light_obj.location = pos
        # Aim roughly at origin
        direction = Vector((0.0, 0.0, 0.0)) - Vector(pos)
        light_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    # Flat world background — light grey
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.97, 0.97, 0.98, 1.0)
        bg.inputs["Strength"].default_value = 1.0


def configure_render(out_path: str, wide: bool) -> None:
    """Eevee + Freestyle outlines. No PBR, no HDRI, no photoreal."""
    scene = bpy.context.scene
    # Blender 5.x ships EEVEE Next as "BLENDER_EEVEE_NEXT"; older builds
    # use "BLENDER_EEVEE". Try both — render still works either way.
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except (TypeError, ValueError):
            continue

    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    if wide:
        scene.render.resolution_x = 1600
        scene.render.resolution_y = 900
    else:
        scene.render.resolution_x = 1200
        scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.filepath = out_path

    # Freestyle line work — clean engineering schematic look.
    scene.render.use_freestyle = True
    view_layer = scene.view_layers[0]
    view_layer.use_freestyle = True
    try:
        lineset = view_layer.freestyle_settings.linesets.get("LineSet") \
            or view_layer.freestyle_settings.linesets.new("LineSet")
        lineset.select_silhouette = True
        lineset.select_border = True
        lineset.select_crease = True
        lineset.select_external_contour = True
        ls = lineset.linestyle
        if ls is not None:
            ls.color = (0.05, 0.05, 0.05)
            ls.thickness = 1.6
    except Exception as exc:  # Blender Freestyle API varies a bit
        print(f"[blender-render] freestyle setup soft-fail: {exc}",
              file=sys.stderr)


# ── Entry point ────────────────────────────────────────────────────────


def main() -> None:
    opts = parse_argv()
    state_path = opts["state"]
    module_id = opts["module"]
    azimuth = float(opts["azimuth"])
    out_path = opts["out"]

    if not Path(state_path).exists():
        print(f"[blender-render] FATAL: state not found: {state_path}",
              file=sys.stderr)
        sys.exit(2)

    state = load_state(state_path)
    is_cover = module_id == "cover"
    focal = None if is_cover else module_id

    env_w, env_d, env_h = build_scene(state, focal)
    place_camera(env_w, env_d, env_h, azimuth, wide=is_cover)
    add_lighting(env_w, env_d, env_h)

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    configure_render(out_path, wide=is_cover)

    print(
        f"[blender-render] {module_id} env=({env_w:.2f}×{env_d:.2f}×{env_h:.2f})m "
        f"az={azimuth:.1f}° → {out_path}",
        flush=True,
    )
    bpy.ops.render.render(write_still=True)
    if not Path(out_path).exists():
        print(f"[blender-render] FATAL: render produced no file at {out_path}",
              file=sys.stderr)
        sys.exit(3)
    print(f"[blender-render] OK {out_path} "
          f"({Path(out_path).stat().st_size // 1024} KB)",
          flush=True)


if __name__ == "__main__":
    main()
