#!/usr/bin/env python3
"""Full hero re-render suite from geometry kernel IR (ANVIL_GEOMETRY_MASTER=kernel).

Authority: geometry/assembly.json + film_plan.json — no freehand principal placement.

Invoked only via Blender:

  ANVIL_GEOMETRY_MASTER=kernel \\
  /Applications/Blender.app/Contents/MacOS/Blender --background --python \\
    scripts/blender-universal/render_kernel_heroes.py -- <twin_dir>

Writes into the twin (and twin/renders/ when present):
  00-hero.png, 01-top.png, 04–07 product views, 08–12 ghost views,
  inspect-{hero,iso,top,front,side}.png, hero-embed.png,
  kernel-hero-manifest.json

Selftest (no Blender): plan-only dry run of view list.
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Optional

REPO = Path(__file__).resolve().parents[2]


def _parse_argv(argv: list[str]) -> Path:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    # Blender also leaves the script path in argv
    args = [a for a in argv if not a.endswith("render_kernel_heroes.py") and a not in ("--selftest",)]
    if not args:
        raise SystemExit("usage: blender --background --python render_kernel_heroes.py -- <twin_dir>")
    twin = Path(args[0]).resolve()
    if not twin.is_dir():
        raise SystemExit(f"not a twin dir: {twin}")
    return twin


def _ensure_paths() -> None:
    for p in (
        REPO / "scripts" / "blender-templates",
        REPO / "scripts" / "lib",
        REPO / "scripts" / "blender-universal",
    ):
        s = str(p)
        if s not in sys.path:
            sys.path.insert(0, s)


def _role_rgba(role: str, kind: str = "") -> tuple[float, float, float, float]:
    r = (role or "").lower()
    k = (kind or "").lower()
    if "path" in r or kind:
        if any(x in k for x in ("fluid", "water", "media")):
            return (0.15, 0.40, 0.85, 1.0)
        if any(x in k for x in ("power", "electrical", "dc")):
            return (0.90, 0.40, 0.10, 1.0)
        return (0.20, 0.70, 0.30, 1.0)
    table = {
        "enclosure": (0.55, 0.58, 0.62, 1.0),
        "vessel": (0.45, 0.75, 0.90, 0.55),
        "pcb": (0.15, 0.45, 0.20, 1.0),
        "motor": (0.75, 0.55, 0.25, 1.0),
        "thermal": (0.85, 0.35, 0.30, 1.0),
        "pump": (0.45, 0.40, 0.75, 1.0),
        "sensor": (0.90, 0.75, 0.20, 1.0),
        "vent": (0.70, 0.70, 0.75, 1.0),
        "inverter": (0.25, 0.25, 0.30, 1.0),
        "part": (0.65, 0.65, 0.68, 1.0),
    }
    return table.get(r, table["part"])


def _mat(name: str, rgba: tuple[float, float, float, float], *, alpha: Optional[float] = None):
    import bpy

    a = alpha if alpha is not None else rgba[3]
    m = bpy.data.materials.new(name=name[:60])
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
        if "Alpha" in bsdf.inputs:
            bsdf.inputs["Alpha"].default_value = a
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.45
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.15 if rgba[0] > 0.5 else 0.05
    if a < 0.99:
        m.blend_method = "BLEND"
        try:
            m.shadow_method = "NONE"
        except Exception:
            pass
    return m


def _bbox_m_from_plan(plan: dict) -> tuple[float, float, float, float, float, float]:
    """Authoritative framing bbox from film_plan (mm→m). Never trust inflated mesh bounds."""
    mm = 0.001
    xs: list[float] = []
    ys: list[float] = []
    zs: list[float] = []
    for o in plan.get("objects") or []:
        if not isinstance(o, dict):
            continue
        if o.get("geometry_kind") == "path":
            for pt in o.get("centreline_mm") or []:
                if isinstance(pt, (list, tuple)) and len(pt) >= 3:
                    xs.append(float(pt[0]) * mm)
                    ys.append(float(pt[1]) * mm)
                    zs.append(float(pt[2]) * mm)
            continue
        origin = o.get("origin_mm") or [0, 0, 0]
        mesh = o.get("mesh") or {}
        ox, oy, oz = float(origin[0]) * mm, float(origin[1]) * mm, float(origin[2]) * mm
        if mesh.get("type") == "cylinder":
            r = float(mesh.get("dia_mm") or 20) * mm / 2
            ln = float(mesh.get("len_mm") or 20) * mm
            xs += [ox - r, ox + r]
            ys += [oy - r, oy + r]
            zs += [oz, oz + ln]
        else:
            w = float(mesh.get("w_mm") or 20) * mm
            d = float(mesh.get("d_mm") or 20) * mm
            h = float(mesh.get("h_mm") or 15) * mm
            xs += [ox - w / 2, ox + w / 2]
            ys += [oy - d / 2, oy + d / 2]
            zs += [oz, oz + h]
    if not xs:
        return 0.0, 0.15, 0.0, 0.15, 0.0, 0.08
    # pad 5%
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    z0, z1 = min(zs), max(zs)
    return x0, x1, y0, y1, z0, z1


def _render_view(
    out_path: Path,
    *,
    loc: tuple,
    target: tuple,
    ortho_scale: float,
    resolution: tuple[int, int] = (2400, 1600),
    cycles: bool = False,
) -> None:
    import bpy
    import forge_blender_lib as fl

    scene = bpy.context.scene
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    fl.clear_cameras()
    cam = fl.setup_camera(loc=loc, target=target, ortho_scale=ortho_scale, focal=50)
    cam.data.clip_start = 0.001
    cam.data.clip_end = max(ortho_scale * 20, 50.0)
    if cycles:
        fl.init_scene_cycles_hero()
    scene.render.filepath = str(out_path)
    bpy.ops.render.render(write_still=True)
    if cycles:
        fl.init_scene_back_to_eevee()
    print(f"[kernel-hero] wrote {out_path} ({out_path.stat().st_size if out_path.is_file() else 0} B)")


def _apply_role_materials(plan: dict) -> None:
    import bpy

    by_name = {str(o.get("name")): o for o in (plan.get("objects") or []) if isinstance(o, dict)}
    for obj in bpy.data.objects:
        if obj.type not in ("MESH", "CURVE"):
            continue
        # strip kernel_ prefix
        key = obj.name
        if key.startswith("kernel_"):
            key = key[len("kernel_") :]
        spec = by_name.get(key) or by_name.get(obj.name)
        role = (spec or {}).get("role") or obj.get("anvil_role") or "part"
        kind = (spec or {}).get("kind") or ""
        if obj.get("anvil_source") != "geometry_ir" and not obj.name.startswith("kernel_"):
            continue
        rgba = _role_rgba(str(role), str(kind))
        # ghost enclosures slightly more opaque for product exterior
        mat = _mat(f"mat_{obj.name}", rgba)
        if obj.data:
            if hasattr(obj.data, "materials"):
                obj.data.materials.clear()
                obj.data.materials.append(mat)


def _ghost_enclosures(alpha: float = 0.22) -> list:
    """Make enclosure-role meshes translucent; return names for restore."""
    import bpy

    changed = []
    for obj in bpy.data.objects:
        if obj.get("anvil_role") == "enclosure" or "enclosure" in obj.name.lower() or "shell" in obj.name.lower():
            if obj.type != "MESH" or not obj.data:
                continue
            rgba = (0.70, 0.72, 0.75, alpha)
            mat = _mat(f"ghost_{obj.name}", rgba, alpha=alpha)
            obj.data.materials.clear()
            obj.data.materials.append(mat)
            changed.append(obj.name)
    return changed


def render_suite(twin: Path) -> dict[str, Any]:
    import bpy
    import forge_blender_lib as fl
    from geometry_master import ensure_geometry_kernel, is_kernel_master
    from import_geometry_kernel import write_film_plan, _bpy_build

    # Force kernel master for this session
    os.environ["ANVIL_GEOMETRY_MASTER"] = "kernel"

    twin = Path(twin)
    out_dir = twin
    renders_dir = twin / "renders"
    renders_dir.mkdir(parents=True, exist_ok=True)

    built = ensure_geometry_kernel(twin)
    print(f"[kernel-hero] ensure_geometry: {built.get('ok')} skipped={built.get('skipped')}")

    fl.init_scene()
    fl.make_world_white()
    plan_path = write_film_plan(twin)
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    report = _bpy_build(twin)
    print(f"[kernel-hero] bpy build: {report}")
    _apply_role_materials(plan)

    # Frame from film_plan mm (authoritative) — product fills the frame
    x0, x1, y0, y1, z0, z1 = _bbox_m_from_plan(plan)
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    dx, dy, dz = max(x1 - x0, 0.01), max(y1 - y0, 0.01), max(z1 - z0, 0.01)
    max_dim = max(dx, dy, dz)
    fill = max(max_dim * 2.0, 0.20)
    fl.add_lights(target_centre=(cx, cy, cz), sun_energy=2.8, fill_energy=140, fill_size=fill)
    import bpy as _bpy

    for _g in _bpy.data.objects:
        if _g.name.startswith("fl_ground"):
            _g.location = (cx, cy, z0 - 0.002)
            # shrink ground to product footprint
            s = max(max_dim * 3.0, 0.3)
            _g.scale = (s, s, 1.0)

    aspect = 2400 / 1600
    margin = 1.25  # product ~80% of short axis

    def ortho(w, h):
        return max(w, h * aspect) * margin

    radius = max_dim * 2.5
    written: list[str] = []

    def save(name: str, **kwargs):
        path = out_dir / name
        _render_view(path, **kwargs)
        written.append(name)
        try:
            import shutil

            shutil.copy2(path, renders_dir / name)
        except OSError:
            pass

    # 00-hero — 3/4 elevated, product-dominant
    hero_diag = max_dim * 1.2 / math.sqrt(2)
    hero_loc = (cx + hero_diag, cy - hero_diag, cz + max_dim * 0.55)
    hero_tgt = (cx, cy, z0 + dz * 0.4)
    hero_scale = ortho(math.hypot(dx, dy), dz + math.hypot(dx, dy) * 0.25)
    use_cycles = os.environ.get("BLENDER_HERO_CYCLES", "0") == "1"
    print(
        f"[kernel-hero] plan_bbox_m dx={dx:.4f} dy={dy:.4f} dz={dz:.4f} "
        f"hero_scale={hero_scale:.4f} n_obj={plan.get('n_objects')}"
    )
    save(
        "00-hero.png",
        loc=hero_loc,
        target=hero_tgt,
        ortho_scale=hero_scale,
        cycles=use_cycles,
    )
    save(
        "hero-embed.png",
        loc=hero_loc,
        target=hero_tgt,
        ortho_scale=hero_scale * 0.95,
        resolution=(1600, 1100),
    )

    save(
        "01-top.png",
        loc=(cx, cy, z1 + radius),
        target=(cx, cy, cz),
        ortho_scale=ortho(dx, dy),
    )
    save(
        "04-product-exterior.png",
        loc=hero_loc,
        target=hero_tgt,
        ortho_scale=hero_scale * 1.05,
    )
    save(
        "05-product-left.png",
        loc=(x0 - radius, cy, cz),
        target=(cx, cy, cz),
        ortho_scale=ortho(dy, dz),
    )
    save(
        "06-product-right.png",
        loc=(x1 + radius, cy, cz),
        target=(cx, cy, cz),
        ortho_scale=ortho(dy, dz),
    )
    save(
        "07-product-service.png",
        loc=(cx, y0 - radius, cz),
        target=(cx, cy, cz),
        ortho_scale=ortho(dx, dz),
    )

    # Ghost suite — enclosures translucent so internals read through shell
    _ghost_enclosures(0.20)

    ghost_views = [
        ("08-product-ghost-shell.png", hero_loc, hero_tgt, hero_scale),
        ("09-product-ghost-shell-side.png", (x1 + radius, cy, cz), (cx, cy, cz), ortho(dy, dz)),
        ("10-product-ghost-shell-back.png", (cx, y1 + radius, cz), (cx, cy, cz), ortho(dx, dz)),
        ("11-product-ghost-shell-top.png", (cx, cy, z1 + radius), (cx, cy, cz), ortho(dx, dy)),
        ("12-product-ghost-shell-front.png", (cx, y0 - radius, cz), (cx, cy, cz), ortho(dx, dz)),
    ]
    for name, loc, tgt, scale in ghost_views:
        save(name, loc=loc, target=tgt, ortho_scale=scale)

    # Restore solid materials for inspect suite
    _apply_role_materials(plan)
    fl.add_lights(target_centre=(cx, cy, cz), fill_energy=200, fill_size=max(max_dim * 2, 1.5))

    inspect = [
        (
            "inspect-hero.png",
            (cx + radius * 0.60, cy - radius * 0.60, cz + radius * 0.45),
            (cx, cy, z0 + dz * 0.35),
            ortho(math.hypot(dx, dy), dz) * 0.72,
        ),
        (
            "inspect-iso.png",
            (cx + radius * 0.62, cy - radius * 0.62, cz + radius * 0.55),
            (cx, cy, cz),
            ortho(math.hypot(dx, dy), dz + math.hypot(dx, dy) * 0.4),
        ),
        ("inspect-top.png", (cx, cy, z1 + radius), (cx, cy, cz), ortho(dx, dy)),
        ("inspect-front.png", (cx, y0 - radius, cz), (cx, cy, cz), ortho(dx, dz)),
        ("inspect-side.png", (x1 + radius, cy, cz), (cx, cy, cz), ortho(dy, dz)),
    ]
    for name, loc, tgt, scale in inspect:
        save(name, loc=loc, target=tgt, ortho_scale=scale, resolution=(1600, 1100))

    man = {
        "schema": "anvil.kernel_hero_render/1",
        "master": "geometry_kernel",
        "twin": twin.name,
        "n_objects": plan.get("n_objects"),
        "forbid_freehand_principals": True,
        "written": written,
        "bbox_m": {"x0": x0, "x1": x1, "y0": y0, "y1": y1, "z0": z0, "z1": z1},
        "blender_report": report,
        "geometry_ensure": built,
    }
    (twin / "kernel-hero-manifest.json").write_text(json.dumps(man, indent=2) + "\n")
    (renders_dir / "kernel-hero-manifest.json").write_text(json.dumps(man, indent=2) + "\n")
    print(f"[kernel-hero] DONE {len(written)} views → {twin}")
    return man


def main(argv: Optional[list[str]] = None) -> int:
    argv = list(sys.argv if argv is None else argv)
    if "--selftest" in argv:
        # Dry-run view list without bpy
        views = [
            "00-hero.png",
            "01-top.png",
            "04-product-exterior.png",
            "05-product-left.png",
            "06-product-right.png",
            "07-product-service.png",
            "08-product-ghost-shell.png",
            "09-product-ghost-shell-side.png",
            "10-product-ghost-shell-back.png",
            "11-product-ghost-shell-top.png",
            "12-product-ghost-shell-front.png",
            "inspect-hero.png",
            "inspect-iso.png",
            "inspect-top.png",
            "inspect-front.png",
            "inspect-side.png",
            "hero-embed.png",
        ]
        assert len(views) >= 16
        print("render_kernel_heroes selftest OK", len(views), "views")
        return 0

    _ensure_paths()
    try:
        import bpy  # noqa: F401
    except ImportError:
        print("must run inside Blender", file=sys.stderr)
        return 2

    twin = _parse_argv(argv)
    man = render_suite(twin)
    return 0 if man.get("written") else 1


if __name__ == "__main__":
    raise SystemExit(main())
