#!/usr/bin/env python3
"""Export geometry IR to STEP assembly via CadQuery (free stack)."""
from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any, Optional


def _cq():
    try:
        import cadquery as cq

        return cq
    except ImportError:
        return None


def _pose_origin(comp: dict) -> tuple[float, float, float]:
    o = (comp.get("pose") or {}).get("origin_mm") or [0, 0, 0]
    return float(o[0]), float(o[1]), float(o[2])


def _solid_for_component(cq, comp: dict) -> Optional[Any]:
    family = str(comp.get("family") or "box")
    params = comp.get("params_mm") or {}
    try:
        if family in ("box", "envelope", "board"):
            w = float(params.get("w") or 10)
            d = float(params.get("d") or 10)
            h = float(params.get("h") or (2 if family == "board" else 10))
            return cq.Workplane("XY").box(w, d, h, centered=(True, True, False))
        if family in ("cylinder", "flange_port"):
            dia = float(params.get("dia") or params.get("d") or 10)
            ln = float(params.get("len") or params.get("h") or 10)
            return cq.Workplane("XY").circle(dia / 2).extrude(ln)
    except Exception:
        return None
    return None


def _path_solid(cq, path: dict) -> Optional[Any]:
    pts = path.get("centreline_mm") or []
    if len(pts) < 2:
        return None
    sec = path.get("section") or {}
    od = float(sec.get("od_mm") or 4.0)
    r = max(0.5, od / 2.0)
    # Build as sequential cylinders along segments (robust vs sweep edge cases)
    solids = []
    for i in range(len(pts) - 1):
        a = [float(pts[i][j]) for j in range(3)]
        b = [float(pts[i + 1][j]) for j in range(3)]
        dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        if length < 1e-3:
            continue
        # cylinder along Z then rotate — use Workplane along segment via loft of disks is hard;
        # simple: sphere joints + thin boxes as approximation using transformed cylinder
        try:
            cyl = cq.Workplane("XY").circle(r).extrude(length)
            # move to midpoint and orient: cadquery Vectors
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
            # Default extrude is +Z; rotate to direction
            import cadquery as cq_mod

            z = cq_mod.Vector(0, 0, 1)
            target = cq_mod.Vector(dx, dy, dz).normalized()
            # transform
            solid = cyl.val()
            # locate at start, not mid — extrude along Z from origin
            loc = cq_mod.Location(cq_mod.Vector(a[0], a[1], a[2]))
            # rotation from Z to target
            if abs(target.z - 1) > 1e-6:
                axis = z.cross(target)
                if axis.Length > 1e-9:
                    angle = math.degrees(math.acos(max(-1, min(1, z.dot(target)))))
                    solid = solid.rotate((0, 0, 0), (axis.x, axis.y, axis.z), angle)
            solid = solid.move(loc)
            solids.append(solid)
        except Exception:
            continue
    if not solids:
        return None
    try:
        result = solids[0]
        for s in solids[1:]:
            result = result.fuse(s)
        return cq.Workplane("XY").newObject([result])
    except Exception:
        return cq.Workplane("XY").newObject([solids[0]])


def export_step(ir: dict[str, Any], step_path: Path) -> dict[str, Any]:
    """Write multi-solid STEP compound. Returns {ok, n_solids, error}."""
    cq = _cq()
    if cq is None:
        return {"ok": False, "n_solids": 0, "error": "cadquery not installed"}

    solids = []
    names = []
    for comp in ir.get("components") or []:
        if not isinstance(comp, dict):
            continue
        if comp.get("geometry_kind") not in ("solid", "envelope_only"):
            continue
        wp = _solid_for_component(cq, comp)
        if wp is None:
            continue
        x, y, z = _pose_origin(comp)
        try:
            # box was centered XY bottom at 0; translate
            moved = wp.translate((x, y, z))
            solids.append(moved.val())
            names.append(
                re.sub(
                    r"[^A-Za-z0-9_]",
                    "_",
                    f"{comp.get('tag')}_{comp.get('name') or 'part'}",
                )[:60]
            )
        except Exception:
            continue

    for path in ir.get("paths") or []:
        if not isinstance(path, dict) or path.get("status") != "ROUTED":
            continue
        wp = _path_solid(cq, path)
        if wp is None:
            continue
        try:
            solids.append(wp.val())
            names.append(re.sub(r"[^A-Za-z0-9_]", "_", f"path_{path.get('id')}")[:60])
        except Exception:
            continue

    if not solids:
        return {"ok": False, "n_solids": 0, "error": "no solids to export"}

    step_path = Path(step_path)
    step_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        # Compound export
        comp = solids[0]
        for s in solids[1:]:
            try:
                comp = comp.fuse(s)
            except Exception:
                pass
        assy = cq.Workplane("XY").newObject([comp])
        cq.exporters.export(assy, str(step_path), cq.exporters.ExportTypes.STEP)
        ok = step_path.is_file() and step_path.stat().st_size > 200
        return {
            "ok": ok,
            "n_solids": len(solids),
            "path": str(step_path),
            "bytes": step_path.stat().st_size if ok else 0,
            "names": names[:20],
        }
    except Exception as exc:
        return {"ok": False, "n_solids": len(solids), "error": str(exc)}


def _selftest() -> None:
    cq = _cq()
    if cq is None:
        print("geometry_step_export selftest SKIP (no cadquery)")
        return
    ir = {
        "components": [
            {
                "tag": "X1",
                "name": "Box",
                "geometry_kind": "solid",
                "family": "box",
                "params_mm": {"w": 20, "d": 10, "h": 5},
                "pose": {"origin_mm": [0, 0, 0]},
            },
            {
                "tag": "X2",
                "name": "Cyl",
                "geometry_kind": "solid",
                "family": "cylinder",
                "params_mm": {"dia": 8, "len": 15},
                "pose": {"origin_mm": [30, 0, 0]},
            },
        ],
        "paths": [
            {
                "id": "c1",
                "status": "ROUTED",
                "section": {"od_mm": 3},
                "centreline_mm": [[0, 0, 5], [30, 0, 5]],
            }
        ],
    }
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "t.step"
        r = export_step(ir, p)
        assert r.get("ok"), r
        assert p.stat().st_size > 200
    print("geometry_step_export selftest OK", r.get("n_solids"), r.get("bytes"))


if __name__ == "__main__":
    _selftest()
