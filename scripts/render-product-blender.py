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
FOCAL_BOX_ALPHA = 0.12  # focal module's enclosing box is a near-invisible
# shell — Freestyle silhouette outlines give it the "box" boundary while
# the CONTENTS (components in identity colour) read as the primary signal.
# 0.65 was too opaque: the tinted shell obscured the internal components.
# Phase8 reference: focal shells read as wire-frame outlines only; the
# vivid identity-colour geometry inside is what identifies the module.
# (2026-05-22 phase8 analysis: battery module shell is nearly invisible,
# blue cell arrays inside are the dominant visual — alpha ~0.12 matches.)


# ── Component shape heuristics (universal, class-agnostic) ─────────────
# Keyword → shape kind. Order matters: first match wins. Strings are
# substring-matched against `word.name_human.lower()` AND
# `word.content_character.character_id.lower()` (the latter is often a
# shorter slug like 'led_driver_unit' or 'scroll_compressor').
#
# This table is intentionally class-agnostic — it works for any ForgeOS
# product class. Add new keywords as the corpus grows; never branch on
# product_class.

_SHAPE_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    # Order-sensitive: more specific first.
    (("busbar", "wire", "cable", "harness"),                 "tube"),
    (("led", "luminaire", "lamp", "lighting"),               "led_panel"),
    (("pcb", "controller", "computer", "inverter", "drive",
      "relay", "contactor"),                                 "pcb"),
    (("compressor", "pump", "blower"),                       "cylinder_short"),
    (("fan", "rotor"),                                       "fan"),
    (("tank", "reservoir", "vessel", "drum"),                "cylinder_tall"),
    (("coil", "heat_exchanger", "evaporator", "condenser",
      "radiator"),                                           "coil"),
    (("cell", "battery", "module_pack", "pouch", "prismatic"),
                                                              "cell"),
    (("rack", "frame", "skid", "trolley", "shelving", "tray",
      "rail", "bracket"),                                    "frame"),
    (("panel", "cabinet", "enclosure", "casing", "housing",
      "container", "door"),                                  "panel_box"),
    (("filter", "grille", "vent"),                           "thin_panel"),
    (("solar", "pv", "photovoltaic"),                        "led_panel"),
    (("motor", "actuator", "servo"),                         "cylinder_short"),
    (("valve", "regulator", "sensor", "probe", "transducer"),
                                                              "small_cyl"),
    # Aerospace specifics — order matters: 'spar' before 'wing' so a
    # 'wing spar' reads as 'frame' (load-bearing) not 'thin_panel'.
    (("spar", "longeron", "stringer", "rib", "boom", "truss"),
                                                              "frame"),
    (("fuselage",),                                          "panel_box"),
    (("skin", "fairing"),                                    "panel_box"),
    (("wing", "airfoil", "blade", "propeller", "fin"),       "thin_panel"),
]


def shape_for_word(name_human: str, character_id: str) -> str:
    """Pick a shape kind from the word's labels. Returns one of the
    keys understood by `add_component_shape`."""
    hay = f"{name_human.lower()} {character_id.lower()}"
    for keys, shape in _SHAPE_KEYWORDS:
        for k in keys:
            if k in hay:
                return shape
    return "cube"  # default: grey-ish cube


def quantity_from_word(word: dict) -> int:
    """Extract `×N` quantity from modifier_characters. Returns 1 on
    miss. We do NOT instantiate N primitives — quantity drives a scale
    label / mini-array packing, not literal count."""
    mods = word.get("modifier_characters") or []
    for mod in mods:
        if not isinstance(mod, dict):
            continue
        if mod.get("kind") == "quantity":
            v = str(mod.get("value") or "")
            # Strip ×, x, ' ', commas → integer.
            digits = "".join(ch for ch in v if ch.isdigit())
            if digits:
                try:
                    return max(1, int(digits))
                except ValueError:
                    pass
    return 1


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
            # BLEND mode: correct semi-transparent surfaces in Eevee.
            # Very low alphas (≤0.08 for focal shells) use CLIP so the
            # shell is nearly invisible but still captures Freestyle lines.
            if alpha <= 0.08:
                mat.blend_method = "CLIP"
                mat.alpha_threshold = 0.01
            else:
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
    # primitive_cube_add(size=1.0) creates a cube with verts at ±0.5 (edge
    # length 1). obj.scale=(S) makes verts effectively ±0.5*S after
    # transform_apply. So to get final half-extents of size/2 (i.e. the box
    # fills exactly the requested size), we need S = size (not size/2).
    # The old `size/2` was wrong — it made every box 2× too small, causing
    # modules to appear outside the envelope they were geometrically inside.
    obj.scale = (size[0], size[1], size[2])
    # Blender 5.x changed defaults: `transform_apply(scale=True)` now
    # ALSO resets location to (0,0,0). Pass explicit kwargs so only
    # scale is baked (otherwise every box renders at the origin).
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def add_cylinder(name: str, centre: tuple[float, float, float],
                 radius: float, height: float,
                 material: "bpy.types.Material",
                 vertices: int = 18) -> "bpy.types.Object":
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=height, location=centre, vertices=vertices,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)
    return obj


# ── Component shape palette (used inside the focal module's box) ──────
#
# Per-shape RGB picks are deliberately ENGINEERING-LIKE rather than
# clones of the parent module colour — that way components read as
# distinct parts inside the box rather than dissolving into one mass.

_COMP_COLOURS: dict[str, tuple[float, float, float]] = {
    "cell":          (0.20, 0.45, 0.70),  # battery blue
    "frame":         (0.55, 0.40, 0.30),  # weathered steel / Corten
    "cylinder_short":(0.78, 0.55, 0.20),  # brass/bronze (compressor/pump)
    "cylinder_tall": (0.45, 0.55, 0.70),  # tank steel
    "pcb":           (0.12, 0.50, 0.20),  # PCB green
    "led_panel":     (1.00, 0.92, 0.55),  # warm LED
    "fan":           (0.35, 0.40, 0.50),  # fan dark steel
    "tube":          (0.78, 0.45, 0.20),  # copper
    "panel_box":     (0.55, 0.55, 0.62),  # cabinet grey
    "thin_panel":    (0.62, 0.68, 0.74),  # filter / vent
    "coil":          (0.82, 0.45, 0.25),  # copper-ish coil
    "small_cyl":     (0.38, 0.42, 0.50),  # sensor / valve
    "cube":          (0.50, 0.50, 0.58),  # default
}


def add_component_shape(
    shape: str,
    name: str,
    centre: tuple[float, float, float],
    cell_size: tuple[float, float, float],
    quantity: int,
    identity_rgb: tuple[float, float, float] | None = None,
) -> None:
    """Add a primitive matching `shape` inside the bounding `cell_size`
    centred at `centre`. The primitive fills ~75% of the cell so there's
    air between neighbours. `quantity` >1 is used only to pick between a
    single object and a small (max 4×4) array; we never instantiate the
    raw count (a 4896-cell rack would blow up the scene).

    `identity_rgb`: when supplied (per-module focal renders), ALL components
    use the MODULE IDENTITY COLOUR instead of the per-shape _COMP_COLOURS.
    This matches phase8 reference where battery cells are vivid blue (not
    the default blue-grey), fire bottles are bright orange, busbars amber,
    etc — the identity colour IS the visual signal that identifies the module.
    """
    cw, cd, ch = cell_size
    fill = 0.90  # components fill 90% of each cell — maximises legibility
    # at the small inset sizes used for per-module PDF images.
    # Phase8 rule: focal components use module identity colour, not shape colours.
    # _COMP_COLOURS is only used as fallback when no identity is supplied (cover).
    if identity_rgb is not None:
        rgb = identity_rgb
    else:
        rgb = _COMP_COLOURS.get(shape, _COMP_COLOURS["cube"])
    mat = make_flat_material(f"comp_{name}", rgb, alpha=1.0)

    # Decide whether to render a single primitive or a packed array.
    arr_n = 1
    if quantity >= 8:
        # Pack into a 2D grid that visibly hints at "many of these"
        # without literally placing them all. Cap at 4×4.
        side = min(4, max(2, int(round(math.sqrt(min(quantity, 16))))))
        arr_n = side  # arr_n × arr_n footprint on (x, y)

    if shape == "cell":
        # Tall thin rectangular box; in arrays, pack on the floor.
        if arr_n > 1:
            cell_pad = 0.10
            sub_w = (cw * fill) / arr_n * (1.0 - cell_pad)
            sub_d = (cd * fill) / arr_n * (1.0 - cell_pad)
            sub_h = ch * fill
            for ix in range(arr_n):
                for iy in range(arr_n):
                    px = centre[0] + (ix - (arr_n - 1) / 2) * (cw * fill) / arr_n
                    py = centre[1] + (iy - (arr_n - 1) / 2) * (cd * fill) / arr_n
                    add_box(
                        f"{name}_c{ix}_{iy}",
                        (px, py, centre[2]),
                        (sub_w, sub_d, sub_h),
                        mat,
                    )
        else:
            add_box(name, centre, (cw * fill * 0.5, cd * fill * 0.5, ch * fill), mat)
        return

    if shape == "frame":
        # Solid steel-grey frame box. Freestyle outline gives it the
        # "frame" read.
        add_box(name, centre, (cw * fill, cd * fill, ch * fill), mat)
        return

    if shape == "cylinder_short":
        # Short cylinder lying horizontally → looks like compressor/pump.
        r = min(cw, cd) * fill * 0.4
        h = ch * fill * 0.55
        obj = add_cylinder(name, centre, r, h, mat)
        obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        return

    if shape == "cylinder_tall":
        r = min(cw, cd) * fill * 0.42
        h = ch * fill
        add_cylinder(name, centre, r, h, mat)
        return

    if shape == "pcb":
        # Flat thin green rectangle.
        add_box(
            name,
            (centre[0], centre[1], centre[2] - ch * fill * 0.3),
            (cw * fill, cd * fill, max(0.02, ch * 0.06)),
            mat,
        )
        return

    if shape == "led_panel":
        # Thin emissive-feel plane.
        emi_mat = bpy.data.materials.new(name=f"emi_{name}")
        emi_mat.use_nodes = True
        nt = emi_mat.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*rgb, 1.0)
            if "Emission Strength" in bsdf.inputs:
                bsdf.inputs["Emission Strength"].default_value = 1.5
            if "Specular IOR Level" in bsdf.inputs:
                bsdf.inputs["Specular IOR Level"].default_value = 0.0
            if "Roughness" in bsdf.inputs:
                bsdf.inputs["Roughness"].default_value = 1.0
        add_box(
            name,
            (centre[0], centre[1], centre[2] + ch * fill * 0.35),
            (cw * fill, cd * fill, max(0.02, ch * 0.08)),
            emi_mat,
        )
        return

    if shape == "fan":
        r = min(cw, cd) * fill * 0.45
        h = ch * fill * 0.18
        add_cylinder(name, centre, r, h, mat, vertices=24)
        return

    if shape == "tube":
        # Thin horizontal tube spanning the cell.
        r = min(cw, cd) * 0.05
        length = max(cw, cd) * fill
        obj = add_cylinder(name, centre, r, length, mat, vertices=12)
        obj.rotation_euler = (math.radians(90.0), 0.0, 0.0)
        return

    if shape == "panel_box":
        # Box with a darker "door line" — render as the cube; door
        # line is implied by Freestyle silhouette + scale.
        add_box(name, centre, (cw * fill, cd * fill, ch * fill), mat)
        return

    if shape == "thin_panel":
        # Thin vertical filter / vent panel.
        add_box(
            name,
            centre,
            (cw * fill, max(0.03, cd * 0.08), ch * fill),
            mat,
        )
        return

    if shape == "coil":
        # Tall slim cylinder oriented horizontally → coil tube bank.
        r = min(cw, cd) * fill * 0.3
        h = cw * fill
        obj = add_cylinder(name, centre, r, h, mat, vertices=18)
        obj.rotation_euler = (0.0, math.radians(90.0), 0.0)
        return

    if shape == "small_cyl":
        r = min(cw, cd) * fill * 0.20
        h = ch * fill * 0.40
        add_cylinder(name, centre, r, h, mat, vertices=12)
        return

    # Default cube.
    add_box(name, centre, (cw * fill, cd * fill, ch * fill), mat)


def pack_subgrid(
    parent_centre: tuple[float, float, float],
    parent_size: tuple[float, float, float],
    n_items: int,
) -> list[tuple[tuple[float, float, float], tuple[float, float, float]]]:
    """Return a list of (centre, cell_size) tuples that pack `n_items`
    cells inside the parent box. Margin keeps cells from touching the
    parent walls so the focal box's silhouette is still visible."""
    if n_items <= 0:
        return []
    pw, pd, ph = parent_size
    # Grid columns chosen so cells stay roughly square in plan view.
    cols = max(1, int(round(math.sqrt(n_items * pw / max(pd, 0.1)))))
    cols = min(cols, n_items)
    rows = int(math.ceil(n_items / cols))
    margin = 0.05 * min(pw, pd)
    cell_w = max(0.05, (pw - margin * (cols + 1)) / cols)
    cell_d = max(0.05, (pd - margin * (rows + 1)) / rows)
    cell_h = ph * 0.85
    cx0 = parent_centre[0] - pw / 2.0 + margin + cell_w / 2.0
    cy0 = parent_centre[1] - pd / 2.0 + margin + cell_d / 2.0
    cz = parent_centre[2]
    cells: list[tuple[tuple[float, float, float], tuple[float, float, float]]] = []
    for i in range(n_items):
        col = i % cols
        row = i // cols
        cx = cx0 + col * (cell_w + margin)
        cy = cy0 + row * (cell_d + margin)
        cells.append(((cx, cy, cz), (cell_w, cell_d, cell_h)))
    return cells


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


def populate_focal_module(item: dict, mods: list[dict]) -> None:
    """Render the focal module as a faint outline shell + the actual
    sub-modules + components inside, packed in a sub-grid. Called only
    for the focal module on per-module renders (2026-05-21 enhancement
    per Tristan: per-module images must show RECOGNISABLE COMPONENTS
    inside the focal box, not just a coloured cube). """
    focal_id = item["id"]
    centre = item["centre"]
    size = item["size"]
    # Find the focal module's data so we can read sub_modules / words.
    focal_mod: dict | None = None
    for m in mods:
        if m.get("module") == focal_id:
            focal_mod = m
            break
    if focal_mod is None:
        # Fall back to a saturated solid box if we can't find the data.
        mat = make_flat_material(f"Mod_{focal_id}", item["rgb"], alpha=1.0)
        add_box(f"box_{focal_id}", centre, size, mat)
        return

    sub_mods = focal_mod.get("sub_modules") or []

    # Always draw the focal enclosing shell as a very faint outline so
    # the Freestyle silhouette defines the module boundary. CLIP at 0.08
    # means the surface is nearly invisible — components dominate.
    # Phase8 reference: focal module boundary is implied by component
    # Freestyle outlines, not a coloured shell.
    shell_mat = make_flat_material(
        f"FocalShell_{focal_id}", item["rgb"],
        alpha=1.0 if not sub_mods else 0.08,
    )
    add_box(f"focal_shell_{focal_id}", centre, size, shell_mat)

    if not isinstance(sub_mods, list) or not sub_mods:
        return

    # FLAT WORD COLLECTION: gather representative words from sub-modules into
    # a single list, then pack them directly into the MODULE BOX.
    # Cap at 4 components — fewer, larger components are more legible at
    # the small inset sizes used for per-module PDF images. Each component
    # cell will be ~25% of the module box area, making shapes clearly visible.
    all_words: list[tuple[dict, str]] = []  # (word_dict, safe_name_prefix)
    for sm in sub_mods:
        if not isinstance(sm, dict):
            continue
        words = sm.get("words") or []
        if not isinstance(words, list):
            continue
        sm_id = sm.get("id") or sm.get("name") or "sm"
        # Take only the first representative word per sub-module
        for w in words[:2]:
            if isinstance(w, dict):
                all_words.append((w, str(sm_id)))
        if len(all_words) >= 4:
            break
    all_words = all_words[:4]

    if not all_words:
        # No word data — render a solid saturated block.
        mat = make_flat_material(f"FocalSolid_{focal_id}", item["rgb"], alpha=1.0)
        add_box(f"solid_{focal_id}", centre,
                (size[0]*0.85, size[1]*0.85, size[2]*0.85), mat)
        return

    # Determine shapes for each component so we can detect "all flat/thin"
    _THIN_SHAPES = {"led_panel", "pcb", "tube", "thin_panel"}
    comp_shapes = []
    for (word, _) in all_words:
        nh = word.get("name_human") or ""
        cc2 = word.get("content_character") or {}
        cid2 = cc2.get("character_id") if isinstance(cc2, dict) else ""
        comp_shapes.append(shape_for_word(nh, cid2 or ""))

    # If ALL shapes are flat/thin, they won't be visible as 3D mass.
    # Fall back to a solid saturated block + a few representative thin
    # shapes on top so the module reads as a solid coloured zone.
    # Phase8 reference: LED module renders as a solid bright panel array,
    # not as individual thin LEDs that disappear into the background.
    if all(s in _THIN_SHAPES for s in comp_shapes):
        mat = make_flat_material(f"FocalSolid_{focal_id}", item["rgb"], alpha=1.0)
        add_box(f"solid_{focal_id}", centre,
                (size[0]*0.85, size[1]*0.85, size[2]*0.85), mat)
        return

    # Lay out components in a tight grid that FILLS the full focal module
    # bounding box. No margin padding — components tile edge-to-edge so they
    # collectively read as a solid saturated block inside the container.
    # Phase8 reference: battery cells fill the full module zone as a tight
    # blue array; fire suppression cylinders fill their zone completely.
    n_comp = len(all_words)
    fw, fd, fh = size  # focal module size
    # 2-col layout for 2-4 components; 1-col for 1.
    cols_c = min(n_comp, 2)
    rows_c = int(math.ceil(n_comp / cols_c))
    cell_cw = fw / cols_c
    cell_cd = fd / rows_c
    cell_ch = fh

    comp_cells: list[tuple[tuple[float, float, float], tuple[float, float, float]]] = []
    for i in range(n_comp):
        col_i = i % cols_c
        row_i = i // cols_c
        ccx = centre[0] - fw/2 + cell_cw/2 + col_i * cell_cw
        ccy = centre[1] - fd/2 + cell_cd/2 + row_i * cell_cd
        ccz = centre[2]
        comp_cells.append(((ccx, ccy, ccz), (cell_cw, cell_cd, cell_ch)))

    for w_idx, ((word, sm_prefix), (w_centre, w_size)) in enumerate(
        zip(all_words, comp_cells)
    ):
        name_human = word.get("name_human") or ""
        cc = word.get("content_character") or {}
        cid = cc.get("character_id") if isinstance(cc, dict) else ""
        shape = shape_for_word(name_human, cid or "")
        qty = quantity_from_word(word)
        safe_name = (
            (cid or name_human or f"w{w_idx}")
            .lower()
            .replace(" ", "_")
            .replace("/", "_")
        )[:24]
        # Pass identity colour: focal components render in module colour
        # (phase8 reference: battery cells are module-blue, not shape-blue-grey)
        add_component_shape(
            shape,
            f"comp_{focal_id}_{safe_name}_{w_idx}",
            w_centre,
            w_size,
            qty,
            identity_rgb=item["rgb"],
        )


def build_scene(
    state: dict, focal: str | None,
) -> tuple[tuple[float, float, float], dict | None]:
    """Build the entire scene. Returns (envelope_size_m, focal_item)
    where `focal_item` is the layout dict for the focal module (or
    None on cover shots) — the camera needs its centre + size to frame
    correctly."""
    reset_scene()
    env_w, env_d, env_h = envelope_mm(state)

    is_cover = focal is None
    # Envelope shell — rendered on BOTH cover AND per-module shots
    # (2026-05-22 Tristan phase8 reference: every per-module page shows
    # the container envelope as a translucent cage with the focal sub-
    # system saturated inside. The prior code disabled the shell on per-
    # module shots because the camera sat INSIDE the envelope and back-
    # face alpha compounded into a white scrim — but now the camera
    # stays OUTSIDE the envelope at the same cover framing, so the back-
    # face problem doesn't apply.)
    shell_mat = make_flat_material(
        "ShellMat", SHELL_TINT, alpha=SHELL_ALPHA,
    )
    add_box(
        "Envelope",
        (0.0, 0.0, 0.0),
        (env_w, env_d, env_h),
        shell_mat,
    )

    # Modules inside. Cover shot = all coloured. Per-module shot = focal
    # gets components rendered inside it, others grey.
    mods = modules(state)
    items = layout_modules(
        mods, env_w, env_d, env_h, focal,
        show_all_coloured=is_cover,
    )
    focal_item: dict | None = None
    for it in items:
        if (not is_cover) and it["id"] == focal:
            # Don't render the focal module as a solid box; let
            # populate_focal_module draw the faint shell + components.
            populate_focal_module(it, mods)
            focal_item = it
        elif is_cover:
            # Cover shot — every module rendered as saturated solid box.
            mat = make_flat_material(f"Mod_{it['id']}", it["rgb"], alpha=1.0)
            add_box(f"box_{it['id']}", it["centre"], it["size"], mat)
        else:
            # Per-module shot — siblings rendered as TRANSLUCENT GHOST
            # boxes so they don't visually dominate the saturated focal.
            # (2026-05-22 Tristan phase8 reference: sibling modules read
            # as faint grey ghost geometry, not as opaque grey distractor
            # boxes.) Alpha 0.35 provides visible spatial context while
            # keeping siblings clearly subordinate to the saturated focal.
            mat = make_flat_material(f"Mod_{it['id']}", GREY, alpha=0.35)
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

    return (env_w, env_d, env_h), focal_item


# ── Camera + lighting + render setup ──────────────────────────────────


def place_camera(env_w: float, env_d: float, env_h: float,
                 azimuth_deg: float, wide: bool = False,
                 look_at: tuple[float, float, float] | None = None,
                 focal_size: tuple[float, float, float] | None = None,
                 ) -> None:
    """Place the camera on the orbital sphere.

    Cover / envelope shot: orbital camera centred on origin, framed to
    fit the whole envelope. radius derived from envelope diagonal.

    Per-module shot (look_at + focal_size accepted but IGNORED for
    centre/distance): envelope-centred orbit, fit=0.30 framing the FULL
    envelope. Only AZIMUTH varies per module — distance + centre do NOT.
    Phase8 contract (mempalace 2026-05-22 forgeos_blender_per_module
    _quality_bar): the saturated focal module inside the full envelope
    context IS the visual signal. Earlier focal-centred orbit
    (focal_diag*2.2 / fit=0.45) put the focal at the frame edge when the
    focal box sat at one end of a 12 m container; camera looked past
    empty space and the ghost envelope dominated.

    Lens 35mm and elevation 28° are preserved across both modes.
    """
    diag = math.sqrt(env_w * env_w + env_d * env_d + env_h * env_h)
    target_extent = diag / 2.0
    if look_at is not None and focal_size is not None:
        fit = 0.30
    elif wide:
        fit = 0.26
    else:
        fit = 0.50
    centre = (0.0, 0.0, 0.0)
    elevation_angle = math.radians(28.0)  # consistent ¾ view, cover + module
    distance = target_extent / fit
    az = math.radians(azimuth_deg)
    horiz = distance * math.cos(elevation_angle)
    cx = centre[0] + horiz * math.cos(az)
    cy = centre[1] + horiz * math.sin(az)
    cz = centre[2] + distance * math.sin(elevation_angle)
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 35.0
    cam_data.clip_end = max(1000.0, distance * 4.0)
    cam_obj = bpy.data.objects.new("Cam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = (cx, cy, cz)
    # Aim at the focal centre (or scene origin for cover shots).
    direction = Vector(centre) - Vector((cx, cy, cz))
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
        # Subtle rim light from below to lift recessed components out
        # of shadow on per-module renders — adds <1 ms render cost.
        ("RimLight", (max_dim * 0.5, -max_dim * 0.5, -max_dim * 0.5), 1.2),
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
    # Flat world background — medium grey (2026-05-22 phase8 reference:
    # pale shapes against pure-white background lost contrast and read as
    # uniform grey wash. Medium-grey BG ≈ 0.85 gives every shape a clear
    # silhouette, matching the phase8 module pages).
    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.85, 0.85, 0.87, 1.0)
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

    (env_w, env_d, env_h), focal_item = build_scene(state, focal)
    if focal_item is not None:
        place_camera(
            env_w, env_d, env_h, azimuth, wide=False,
            look_at=focal_item["centre"],
            focal_size=focal_item["size"],
        )
    else:
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
