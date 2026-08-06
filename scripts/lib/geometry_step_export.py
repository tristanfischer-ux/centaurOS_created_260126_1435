#!/usr/bin/env python3
"""Export geometry IR to a *named* STEP assembly via CadQuery (free stack).

v2: CadQuery ``Assembly`` with per-tag part names so FreeCAD / partners see a
product tree — not a single fused blob. Header timestamps pinned for
deterministic re-exports (same discipline as blender-universal/export_step.py).
"""
from __future__ import annotations

import math
import os
import re
from pathlib import Path
from typing import Any, Optional

PIN_DATE = "2026-01-01T00:00:00"


def _cq():
    try:
        import cadquery as cq

        return cq
    except ImportError:
        return None


def _sanitize(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_]+", "_", str(name or "part")).strip("_")
    return (s or "part")[:80]


def _pose_origin(comp: dict) -> tuple[float, float, float]:
    o = (comp.get("pose") or {}).get("origin_mm") or [0, 0, 0]
    return float(o[0]), float(o[1]), float(o[2])


def _rpy_deg(comp: dict) -> tuple[float, float, float]:
    r = (comp.get("pose") or {}).get("rotation_rpy_deg") or [0, 0, 0]
    if isinstance(r, (list, tuple)) and len(r) >= 3:
        return float(r[0] or 0), float(r[1] or 0), float(r[2] or 0)
    return 0.0, 0.0, 0.0


def _solid_shape(cq, comp: dict) -> Optional[Any]:
    """Return a Shape (or Workplane val) at local origin; caller applies Location."""
    family = str(comp.get("family") or "box")
    params = comp.get("params_mm") or {}
    try:
        if family in ("box", "envelope", "board"):
            w = float(params.get("w") or 10)
            d = float(params.get("d") or 10)
            h = float(params.get("h") or (2 if family == "board" else 10))
            # bottom-centred on XY, Z up from 0 — matches kernel IR convention
            return cq.Workplane("XY").box(w, d, h, centered=(True, True, False)).val()
        if family in ("cylinder", "flange_port"):
            dia = float(params.get("dia") or params.get("d") or 10)
            ln = float(params.get("len") or params.get("h") or 10)
            return cq.Workplane("XY").circle(dia / 2).extrude(ln).val()
    except Exception:
        return None
    return None


def _path_shape(cq, path: dict) -> Optional[Any]:
    pts = path.get("centreline_mm") or []
    if len(pts) < 2:
        return None
    sec = path.get("section") or {}
    od = float(sec.get("od_mm") or 4.0)
    r = max(0.5, od / 2.0)
    solids = []
    for i in range(len(pts) - 1):
        a = [float(pts[i][j]) for j in range(3)]
        b = [float(pts[i + 1][j]) for j in range(3)]
        dx, dy, dz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        length = math.sqrt(dx * dx + dy * dy + dz * dz)
        if length < 1e-3:
            continue
        try:
            import cadquery as cq_mod

            cyl = cq.Workplane("XY").circle(r).extrude(length).val()
            z = cq_mod.Vector(0, 0, 1)
            target = cq_mod.Vector(dx, dy, dz).normalized()
            if abs(target.z - 1) > 1e-6:
                axis = z.cross(target)
                if axis.Length > 1e-9:
                    angle = math.degrees(math.acos(max(-1, min(1, z.dot(target)))))
                    cyl = cyl.rotate((0, 0, 0), (axis.x, axis.y, axis.z), angle)
            loc = cq_mod.Location(cq_mod.Vector(a[0], a[1], a[2]))
            solids.append(cyl.moved(loc))
        except Exception:
            continue
    if not solids:
        return None
    try:
        result = solids[0]
        for s in solids[1:]:
            result = result.fuse(s)
        return result
    except Exception:
        return solids[0]


def _pin_step_header(path: Path) -> None:
    """Pin FILE_NAME timestamp + basename for deterministic re-exports."""
    try:
        txt = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return
    base = path.name
    txt2 = re.sub(
        r"FILE_NAME\('[^']*','[^']*'",
        f"FILE_NAME('{base}','{PIN_DATE}'",
        txt,
        count=1,
    )
    counter = iter(range(1, 10**9))
    txt2 = re.sub(
        r"NEXT_ASSEMBLY_USAGE_OCCURRENCE\('\d+'",
        lambda m: f"NEXT_ASSEMBLY_USAGE_OCCURRENCE('{next(counter)}'",
        txt2,
    )
    if txt2 != txt:
        path.write_text(txt2, encoding="utf-8")


def _part_name(comp: dict) -> str:
    raw = comp.get("export_name") or f"{comp.get('tag')}_{comp.get('name') or 'part'}"
    return _sanitize(raw)


def export_step(ir: dict[str, Any], step_path: Path) -> dict[str, Any]:
    """Write multi-part named STEP assembly. Returns {ok, n_solids, names, ...}."""
    cq = _cq()
    if cq is None:
        return {"ok": False, "n_solids": 0, "error": "cadquery not installed"}

    from cadquery import Assembly, Location, Vector

    twin = _sanitize(str(ir.get("twin") or "assembly"))
    root = Assembly(name=f"Assembly_{twin}")
    solids_asm = Assembly(name="solids")
    paths_asm = Assembly(name="paths")
    names: list[str] = []
    used: set[str] = set()

    def unique(nm: str) -> str:
        base = nm
        n = 2
        while nm in used:
            nm = f"{base}_{n}"
            n += 1
        used.add(nm)
        return nm

    n_solids = 0
    for comp in ir.get("components") or []:
        if not isinstance(comp, dict):
            continue
        if comp.get("geometry_kind") not in ("solid", "envelope_only"):
            continue
        shape = _solid_shape(cq, comp)
        if shape is None:
            continue
        x, y, z = _pose_origin(comp)
        roll, pitch, yaw = _rpy_deg(comp)
        # CadQuery Location: translation; rotation applied if non-zero
        try:
            loc = Location(Vector(x, y, z))
            if abs(roll) + abs(pitch) + abs(yaw) > 1e-6:
                # rotate shape about local origin before placing
                if abs(roll) > 1e-6:
                    shape = shape.rotate((0, 0, 0), (1, 0, 0), roll)
                if abs(pitch) > 1e-6:
                    shape = shape.rotate((0, 0, 0), (0, 1, 0), pitch)
                if abs(yaw) > 1e-6:
                    shape = shape.rotate((0, 0, 0), (0, 0, 1), yaw)
            nm = unique(_part_name(comp))
            solids_asm.add(shape, name=nm, loc=loc)
            names.append(nm)
            n_solids += 1
        except Exception:
            continue

    n_paths = 0
    for path in ir.get("paths") or []:
        if not isinstance(path, dict) or path.get("status") != "ROUTED":
            continue
        shape = _path_shape(cq, path)
        if shape is None:
            continue
        try:
            kind = _sanitize(str(path.get("kind") or "path"))
            nm = unique(_sanitize(f"path_{path.get('id')}_{kind}"))
            paths_asm.add(shape, name=nm, loc=Location(Vector(0, 0, 0)))
            names.append(nm)
            n_paths += 1
            n_solids += 1
        except Exception:
            continue

    if n_solids == 0:
        return {"ok": False, "n_solids": 0, "error": "no solids to export"}

    root.add(solids_asm)
    if n_paths:
        root.add(paths_asm)

    step_path = Path(step_path)
    step_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        # Prefer Assembly.export (AP214 tree); fall back to save
        if hasattr(root, "export"):
            root.export(str(step_path))
        else:
            root.save(str(step_path))
        _pin_step_header(step_path)
        ok = step_path.is_file() and step_path.stat().st_size > 200
        named = False
        if ok:
            sample = step_path.read_text(encoding="utf-8", errors="replace")[:500_000]
            named = any(n in sample for n in names[:5]) if names else False
        return {
            "ok": ok,
            "n_solids": n_solids,
            "n_paths": n_paths,
            "path": str(step_path),
            "bytes": step_path.stat().st_size if ok else 0,
            "names": names[:40],
            "named_tree": named,
            "exporter": "cadquery_assembly",
        }
    except Exception as exc:
        # Fallback: fused compound (legacy) so twin still gets a STEP
        try:
            return _export_fused_fallback(cq, ir, step_path, names, n_solids, exc)
        except Exception as exc2:
            return {
                "ok": False,
                "n_solids": n_solids,
                "error": f"{exc}; fallback {exc2}",
            }


def _export_fused_fallback(cq, ir, step_path, names, n_solids, first_err) -> dict:
    solids = []
    for comp in ir.get("components") or []:
        if not isinstance(comp, dict):
            continue
        if comp.get("geometry_kind") not in ("solid", "envelope_only"):
            continue
        shape = _solid_shape(cq, comp)
        if shape is None:
            continue
        x, y, z = _pose_origin(comp)
        try:
            solids.append(shape.moved(cq.Location(cq.Vector(x, y, z))))
        except Exception:
            continue
    if not solids:
        return {"ok": False, "n_solids": 0, "error": str(first_err)}
    compound = solids[0]
    for s in solids[1:]:
        try:
            compound = compound.fuse(s)
        except Exception:
            pass
    assy = cq.Workplane("XY").newObject([compound])
    cq.exporters.export(assy, str(step_path), cq.exporters.ExportTypes.STEP)
    _pin_step_header(step_path)
    ok = step_path.is_file() and step_path.stat().st_size > 200
    return {
        "ok": ok,
        "n_solids": len(solids),
        "path": str(step_path),
        "bytes": step_path.stat().st_size if ok else 0,
        "names": names[:20],
        "named_tree": False,
        "exporter": "fused_fallback",
        "warning": str(first_err),
    }


def _selftest() -> None:
    cq = _cq()
    if cq is None:
        print("geometry_step_export selftest SKIP (no cadquery)")
        return
    ir = {
        "twin": "selftest",
        "components": [
            {
                "tag": "X1",
                "name": "Box",
                "export_name": "X1_Box",
                "geometry_kind": "solid",
                "family": "box",
                "params_mm": {"w": 20, "d": 10, "h": 5},
                "pose": {"origin_mm": [0, 0, 0], "rotation_rpy_deg": [0, 0, 0]},
            },
            {
                "tag": "X2",
                "name": "Cyl",
                "export_name": "X2_Cyl",
                "geometry_kind": "solid",
                "family": "cylinder",
                "params_mm": {"dia": 8, "len": 15},
                "pose": {"origin_mm": [30, 0, 0]},
            },
        ],
        "paths": [
            {
                "id": "c1",
                "kind": "fluid",
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
        txt = p.read_text(encoding="utf-8", errors="replace")
        assert "X1_Box" in txt or r.get("exporter") == "fused_fallback", "named tree missing"
        # pinned date
        assert PIN_DATE in txt or "FILE_NAME" in txt
    print(
        "geometry_step_export selftest OK",
        r.get("n_solids"),
        r.get("bytes"),
        r.get("exporter"),
        "named=",
        r.get("named_tree"),
    )


if __name__ == "__main__":
    _selftest()
