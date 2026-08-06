#!/usr/bin/env python3
"""Blender film slave — place principals from geometry IR (never freehand).

Authority: geometry/assembly.json (+ optional assembly.step for external CAD).
When ANVIL_GEOMETRY_MASTER=kernel (or --kernel), this script builds film meshes
from IR poses/families only. It does not invent BoM placement.

Usage (headless Blender):
  blender -b -P scripts/blender-universal/import_geometry_kernel.py -- <twin_dir>

Usage (emit film plan without Blender — CI / dry-run):
  python3 scripts/blender-universal/import_geometry_kernel.py <twin_dir> --plan-only

Selftest:
  python3 scripts/blender-universal/import_geometry_kernel.py --selftest
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Optional

REPO = Path(__file__).resolve().parents[2]


def load_ir(twin: Path) -> dict[str, Any]:
    p = twin / "geometry" / "assembly.json"
    if not p.is_file():
        raise FileNotFoundError(f"missing {p} — run geometry-kernel-build.py first")
    return json.loads(p.read_text(encoding="utf-8"))


def load_contract(twin: Path) -> dict[str, Any]:
    p = twin / "geometry" / "blender_import.json"
    if p.is_file():
        return json.loads(p.read_text(encoding="utf-8"))
    return {
        "schema": "anvil.blender_import/1",
        "forbid_freehand_principals": True,
        "material_by_role": {},
    }


def film_plan_from_ir(ir: dict[str, Any], contract: dict[str, Any]) -> dict[str, Any]:
    """Deterministic film plan: one mesh descriptor per solid/path."""
    try:
        from geometry_film_meshes import film_recipe
    except ImportError:
        film_recipe = None  # type: ignore

    objects = []
    for c in ir.get("components") or []:
        if not isinstance(c, dict):
            continue
        if c.get("geometry_kind") not in ("solid", "envelope_only"):
            continue
        o = (c.get("pose") or {}).get("origin_mm") or [0, 0, 0]
        rpy = (c.get("pose") or {}).get("rotation_rpy_deg") or [0, 0, 0]
        params = c.get("params_mm") or {}
        family = str(c.get("family") or "box")
        role = str(c.get("role") or "part")
        name = str(c.get("name") or c.get("tag") or "")
        if family in ("cylinder", "flange_port"):
            mesh = {
                "type": "cylinder",
                "dia_mm": float(params.get("dia") or params.get("d") or 20),
                "len_mm": float(params.get("len") or params.get("h") or 20),
            }
        elif family == "board":
            mesh = {
                "type": "box",
                "w_mm": float(params.get("w") or 80),
                "d_mm": float(params.get("d") or 50),
                "h_mm": float(params.get("h") or 1.6),
            }
        else:
            mesh = {
                "type": "box",
                "w_mm": float(params.get("w") or 20),
                "d_mm": float(params.get("d") or 20),
                "h_mm": float(params.get("h") or 15),
            }
        recipe = None
        if film_recipe is not None:
            recipe = film_recipe(role, family, name)
        objects.append(
            {
                "name": c.get("export_name") or f"{c.get('tag')}_{c.get('name')}",
                "tag": c.get("tag"),
                "role": role,
                "name_human": name,
                "family": family,
                "film_recipe": recipe,
                "material": c.get("material"),
                "geometry_kind": c.get("geometry_kind"),
                "origin_mm": [float(o[0]), float(o[1]), float(o[2])],
                "rotation_rpy_deg": [
                    float(rpy[0] if len(rpy) > 0 else 0),
                    float(rpy[1] if len(rpy) > 1 else 0),
                    float(rpy[2] if len(rpy) > 2 else 0),
                ],
                "mesh": mesh,
                "source": "geometry_ir",
            }
        )
    for p in ir.get("paths") or []:
        if not isinstance(p, dict) or p.get("status") != "ROUTED":
            continue
        pts = p.get("centreline_mm") or []
        if len(pts) < 2:
            continue
        sec = p.get("section") or {}
        objects.append(
            {
                "name": f"path_{p.get('id')}",
                "tag": p.get("id"),
                "role": "path",
                "kind": p.get("kind"),
                "geometry_kind": "path",
                "centreline_mm": pts,
                "od_mm": float(sec.get("od_mm") or 4),
                "source": "geometry_ir",
            }
        )
    return {
        "schema": "anvil.film_plan/1",
        "master": "geometry_kernel",
        "forbid_freehand_principals": bool(
            contract.get("forbid_freehand_principals", True)
        ),
        "assembly_step": contract.get("assembly_step") or "geometry/assembly.step",
        "n_objects": len(objects),
        "objects": objects,
        "holds": ir.get("holds") or [],
        "material_by_role": contract.get("material_by_role") or {},
    }


def write_film_plan(twin: Path) -> Path:
    ir = load_ir(twin)
    contract = load_contract(twin)
    plan = film_plan_from_ir(ir, contract)
    out = twin / "geometry" / "film_plan.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    return out


def _bpy_build(twin: Path) -> dict[str, Any]:
    """Build Blender scene meshes from IR. Requires bpy."""
    import bpy  # type: ignore
    import mathutils  # type: ignore

    plan_path = write_film_plan(twin)
    plan = json.loads(plan_path.read_text(encoding="utf-8"))

    # Clear mesh objects only (keep cameras/lights if present)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and (
            obj.get("anvil_source") == "geometry_ir"
            or obj.name.startswith("kernel_")
        ):
            bpy.data.objects.remove(obj, do_unlink=True)

    coll_name = "anvil_kernel_solids"
    if coll_name not in bpy.data.collections:
        coll = bpy.data.collections.new(coll_name)
        bpy.context.scene.collection.children.link(coll)
    else:
        coll = bpy.data.collections[coll_name]

    created = 0
    mm = 0.001  # film plan mm → Blender metres
    dense = os.environ.get("ANVIL_FILM_DENSE", "1").strip().lower() not in (
        "0", "false", "no", "off",
    )
    recipes_used: dict[str, int] = {}

    try:
        from geometry_film_meshes import film_recipe, build_film_object
    except ImportError:
        film_recipe = None  # type: ignore
        build_film_object = None  # type: ignore
        dense = False

    for spec in plan.get("objects") or []:
        name = "kernel_" + str(spec.get("name") or "part")[:60]
        mesh_spec = spec.get("mesh") or {}
        o = spec.get("origin_mm") or [0, 0, 0]
        ox, oy, oz = float(o[0]) * mm, float(o[1]) * mm, float(o[2]) * mm
        rpy = spec.get("rotation_rpy_deg") or [0, 0, 0]
        role = str(spec.get("role") or "part")

        if spec.get("geometry_kind") == "path":
            curve = bpy.data.curves.new(name + "_crv", type="CURVE")
            curve.dimensions = "3D"
            curve.bevel_depth = max(0.0005, float(spec.get("od_mm") or 4) * mm / 2)
            curve.bevel_resolution = 3
            spline = curve.splines.new("POLY")
            pts = spec.get("centreline_mm") or []
            if len(pts) < 2:
                continue
            spline.points.add(max(0, len(pts) - 1))
            for i, pt in enumerate(pts):
                spline.points[i].co = (
                    float(pt[0]) * mm,
                    float(pt[1]) * mm,
                    float(pt[2]) * mm,
                    1.0,
                )
            obj = bpy.data.objects.new(name, curve)
        elif dense and film_recipe is not None and build_film_object is not None:
            family = "cylinder" if mesh_spec.get("type") == "cylinder" else "box"
            if mesh_spec.get("type") == "cylinder":
                params_m = {
                    "dia": float(mesh_spec.get("dia_mm") or 20) * mm,
                    "len": float(mesh_spec.get("len_mm") or 20) * mm,
                    "w": float(mesh_spec.get("dia_mm") or 20) * mm,
                    "d": float(mesh_spec.get("dia_mm") or 20) * mm,
                    "h": float(mesh_spec.get("len_mm") or 20) * mm,
                }
            else:
                params_m = {
                    "w": max(float(mesh_spec.get("w_mm") or 20) * mm, 0.001),
                    "d": max(float(mesh_spec.get("d_mm") or 20) * mm, 0.001),
                    "h": max(float(mesh_spec.get("h_mm") or 15) * mm, 0.001),
                }
            recipe = film_recipe(role, family, str(spec.get("name") or ""))
            recipes_used[recipe] = recipes_used.get(recipe, 0) + 1
            obj = build_film_object(
                name=name,
                recipe=recipe,
                origin_m=(ox, oy, oz),
                params_m=params_m,
                rpy_deg=(
                    float(rpy[0] if len(rpy) > 0 else 0),
                    float(rpy[1] if len(rpy) > 1 else 0),
                    float(rpy[2] if len(rpy) > 2 else 0),
                ),
            )
        elif mesh_spec.get("type") == "cylinder":
            dia = float(mesh_spec.get("dia_mm") or 20) * mm
            ln = float(mesh_spec.get("len_mm") or 20) * mm
            bpy.ops.mesh.primitive_cylinder_add(
                radius=max(dia / 2, 0.0005),
                depth=max(ln, 0.001),
                location=(ox, oy, oz + ln / 2),
            )
            obj = bpy.context.active_object
            obj.name = name
            obj.rotation_euler = (
                math.radians(float(rpy[0])),
                math.radians(float(rpy[1])),
                math.radians(float(rpy[2])),
            )
        else:
            w = max(float(mesh_spec.get("w_mm") or 20) * mm, 0.001)
            d = max(float(mesh_spec.get("d_mm") or 20) * mm, 0.001)
            h = max(float(mesh_spec.get("h_mm") or 15) * mm, 0.001)
            bpy.ops.mesh.primitive_cube_add(size=2, location=(ox, oy, oz + h / 2))
            obj = bpy.context.active_object
            obj.name = name
            obj.scale = (w / 2.0, d / 2.0, h / 2.0)
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            try:
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            except Exception:
                pass
            obj.select_set(False)
            obj.rotation_euler = (
                math.radians(float(rpy[0])),
                math.radians(float(rpy[1])),
                math.radians(float(rpy[2])),
            )

        obj["anvil_source"] = "geometry_ir"
        obj["anvil_tag"] = str(spec.get("tag") or "")
        obj["anvil_role"] = role
        if obj.name not in coll.objects:
            for c in list(obj.users_collection):
                c.objects.unlink(obj)
            coll.objects.link(obj)
        created += 1

    # Marker that freehand is forbidden
    bpy.context.scene["anvil_geometry_master"] = "kernel"
    bpy.context.scene["anvil_forbid_freehand_principals"] = True

    report = {
        "ok": True,
        "created": created,
        "film_plan": str(plan_path),
        "master": "kernel",
        "dense_film": dense,
        "recipes": recipes_used,
    }
    (twin / "geometry" / "blender_import_report.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    return report


def master_is_kernel() -> bool:
    env = os.environ.get("ANVIL_GEOMETRY_MASTER", "legacy_blender").strip().lower()
    return env in ("kernel", "1", "true", "yes")


def main(argv: Optional[list[str]] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    # Blender passes args after --
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]

    if "--selftest" in argv:
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            twin = Path(td)
            g = twin / "geometry"
            g.mkdir()
            ir = {
                "schema": "anvil.geometry_assembly/1",
                "twin": "t",
                "components": [
                    {
                        "tag": "X1",
                        "name": "Box",
                        "export_name": "X1_Box",
                        "geometry_kind": "solid",
                        "family": "box",
                        "role": "enclosure",
                        "params_mm": {"w": 10, "d": 10, "h": 5},
                        "pose": {"origin_mm": [0, 0, 0], "rotation_rpy_deg": [0, 0, 0]},
                    }
                ],
                "paths": [],
                "holds": [],
            }
            (g / "assembly.json").write_text(json.dumps(ir))
            (g / "blender_import.json").write_text(
                json.dumps({"forbid_freehand_principals": True})
            )
            plan_path = write_film_plan(twin)
            plan = json.loads(plan_path.read_text())
            assert plan["n_objects"] == 1
            assert plan["forbid_freehand_principals"] is True
            assert plan["objects"][0]["source"] == "geometry_ir"
        print("import_geometry_kernel selftest OK")
        return 0

    plan_only = "--plan-only" in argv
    argv = [a for a in argv if a not in ("--plan-only", "--kernel")]
    if not argv:
        print("usage: import_geometry_kernel.py <twin_dir> [--plan-only]", file=sys.stderr)
        return 2
    twin = Path(argv[0]).resolve()
    if not twin.is_dir():
        print(f"not a directory: {twin}", file=sys.stderr)
        return 2

    plan_path = write_film_plan(twin)
    print(f"film_plan: {plan_path}")

    if plan_only or "bpy" not in sys.modules:
        try:
            import bpy  # type: ignore  # noqa: F401

            have_bpy = True
        except ImportError:
            have_bpy = False
        if plan_only or not have_bpy:
            print("plan-only (no Blender mesh build)")
            return 0

    report = _bpy_build(twin)
    print(f"blender kernel import: created={report.get('created')}")
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
