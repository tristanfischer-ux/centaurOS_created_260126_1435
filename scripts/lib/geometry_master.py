#!/usr/bin/env python3
"""Geometry master authority — kernel vs legacy Blender layout.

Env:
  ANVIL_GEOMETRY_MASTER=kernel|legacy_blender   (default: legacy_blender)
  ANVIL_REQUIRE_STEP=1                          pack gate (handled in build_send_pack)

When master is *kernel*:
  - Blender must not invent principal placement (film slave only)
  - STEP master is geometry/assembly.step from the geometry kernel
  - export_step.py prefers the kernel IR when present
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parents[2]


def geometry_master_mode() -> str:
    raw = (os.environ.get("ANVIL_GEOMETRY_MASTER") or "legacy_blender").strip().lower()
    if raw in ("kernel", "1", "true", "yes", "cad", "ir"):
        return "kernel"
    return "legacy_blender"


def is_kernel_master() -> bool:
    return geometry_master_mode() == "kernel"


def twin_from_state_path(state_path: str | Path) -> Path:
    p = Path(state_path).resolve()
    return p.parent if p.name == "state.json" else p


def ensure_geometry_kernel(twin: Path, *, force: bool = False) -> dict[str, Any]:
    """Build geometry/ if missing (or force). Uses project .venv when present."""
    twin = Path(twin)
    step = twin / "geometry" / "assembly.step"
    ir = twin / "geometry" / "assembly.json"
    if not force and ir.is_file() and step.is_file() and step.stat().st_size > 200:
        return {"ok": True, "skipped": True, "reason": "geometry already present"}

    py = ROOT / ".venv" / "bin" / "python"
    if not py.is_file():
        py = Path(sys.executable)
    cli = ROOT / "scripts" / "geometry-kernel-build.py"
    if not cli.is_file():
        return {"ok": False, "error": f"missing {cli}"}
    r = subprocess.run(
        [str(py), str(cli), str(twin)],
        capture_output=True,
        text=True,
        timeout=300,
        cwd=str(ROOT),
    )
    return {
        "ok": r.returncode == 0 and ir.is_file(),
        "returncode": r.returncode,
        "stdout": (r.stdout or "")[-2000:],
        "stderr": (r.stderr or "")[-1000:],
    }


def ir_to_parts_manifest_rows(ir: dict[str, Any]) -> list[dict[str, Any]]:
    """Project kernel IR components into parts-manifest-like rows (mm)."""
    rows = []
    for c in ir.get("components") or []:
        if not isinstance(c, dict):
            continue
        if c.get("geometry_kind") not in ("solid", "envelope_only"):
            continue
        o = (c.get("pose") or {}).get("origin_mm") or [0, 0, 0]
        params = c.get("params_mm") or {}
        family = str(c.get("family") or "box")
        if family in ("cylinder", "flange_port"):
            dims = {
                "dia": float(params.get("dia") or params.get("d") or 20),
                "len": float(params.get("len") or params.get("h") or 20),
            }
            shape = "cylinder"
            # manifest convention: pos is bbox centre
            h = dims["len"]
            pos = [float(o[0]), float(o[1]), float(o[2]) + h / 2.0]
        else:
            w = float(params.get("w") or 20)
            d = float(params.get("d") or 20)
            h = float(params.get("h") or 15)
            dims = {"w": w, "d": d, "h": h}
            shape = "board" if family == "board" else "box"
            pos = [float(o[0]), float(o[1]), float(o[2]) + h / 2.0]
        tag = str(c.get("tag") or "")
        rows.append(
            {
                "tag": tag,
                "equipment_tag": tag,
                "name": str(c.get("name") or tag),
                "module": str(c.get("role") or "kernel"),
                "shape": shape,
                "qty": 1,
                "pos_mm": pos,
                "dims_mm": dims,
                "geometry_source": "geometry_kernel_ir",
                "entity_type": "equipment",
            }
        )
    return rows


def write_manifest_from_ir(twin: Path, ir: Optional[dict] = None) -> Path:
    twin = Path(twin)
    if ir is None:
        ir = json.loads((twin / "geometry" / "assembly.json").read_text(encoding="utf-8"))
    rows = ir_to_parts_manifest_rows(ir)
    # site from component bounds
    xs, ys, zs = [], [], []
    for r in rows:
        p = r["pos_mm"]
        d = r["dims_mm"]
        if "dia" in d:
            half = float(d["dia"]) / 2
            xs += [p[0] - half, p[0] + half]
            ys += [p[1] - half, p[1] + half]
            zs += [p[2] - float(d["len"]) / 2, p[2] + float(d["len"]) / 2]
        else:
            xs += [p[0] - d["w"] / 2, p[0] + d["w"] / 2]
            ys += [p[1] - d["d"] / 2, p[1] + d["d"] / 2]
            zs += [p[2] - d["h"] / 2, p[2] + d["h"] / 2]
    site = {
        "x_min_mm": min(xs) if xs else 0,
        "x_max_mm": max(xs) if xs else 100,
        "y_min_mm": min(ys) if ys else 0,
        "y_max_mm": max(ys) if ys else 100,
        "z_min_mm": min(zs) if zs else 0,
        "z_max_mm": max(zs) if zs else 100,
    }
    man = {
        "schema": "parts-manifest/1",
        "count": len(rows),
        "parts": rows,
        "site": site,
        "geometry_master": "kernel",
    }
    out = twin / "parts-manifest.json"
    # Prefer not to clobber a rich legacy manifest unless kernel master
    if is_kernel_master() or not out.is_file():
        out.write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    else:
        # write sidecar
        out = twin / "geometry" / "parts-manifest-from-ir.json"
        out.write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")
    return out


def apply_kernel_layout(
    twin: Path,
    out_dir: Optional[Path] = None,
    *,
    build_blender_meshes: bool = True,
) -> dict[str, Any]:
    """Ensure kernel artefacts + film plan; optionally build bpy meshes.

    Returns ok + short_circuit hint for build_universal_scene.
    """
    twin = Path(twin)
    if not is_kernel_master():
        return {"ok": False, "reason": "not kernel master", "short_circuit": False}

    built = ensure_geometry_kernel(twin)
    if not built.get("ok") and not (twin / "geometry" / "assembly.json").is_file():
        return {"ok": False, "error": "geometry kernel failed", "detail": built, "short_circuit": False}

    ir_path = twin / "geometry" / "assembly.json"
    ir = json.loads(ir_path.read_text(encoding="utf-8"))
    man_path = write_manifest_from_ir(twin, ir)

    # film plan always
    film_path = None
    try:
        bu = str(ROOT / "scripts" / "blender-universal")
        if bu not in sys.path:
            sys.path.insert(0, bu)
        from import_geometry_kernel import write_film_plan, _bpy_build

        film_path = write_film_plan(twin)
        bpy_report = None
        if build_blender_meshes:
            try:
                import bpy  # type: ignore  # noqa: F401

                bpy_report = _bpy_build(twin)
            except ImportError:
                bpy_report = {"ok": False, "reason": "bpy not available"}
    except Exception as exc:
        return {
            "ok": True,
            "short_circuit": True,
            "warning": f"film plan partial: {exc}",
            "manifest": str(man_path),
            "kernel_build": built,
        }

    stamp = {
        "schema": "anvil.geometry_master/1",
        "mode": "kernel",
        "forbid_freehand_principals": True,
        "twin": twin.name,
        "film_plan": str(film_path) if film_path else None,
        "manifest": str(man_path),
        "blender": bpy_report,
        "kernel_build": built,
    }
    stamp_path = twin / "geometry" / "geometry_master.json"
    stamp_path.write_text(json.dumps(stamp, indent=2) + "\n", encoding="utf-8")
    if out_dir is not None:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "geometry_master.json").write_text(
            json.dumps(stamp, indent=2) + "\n", encoding="utf-8"
        )

    return {
        "ok": True,
        "short_circuit": True,
        "stamp": str(stamp_path),
        "manifest": str(man_path),
        "film_plan": str(film_path) if film_path else None,
        "blender": bpy_report,
    }


def step_source_preference(twin: Path) -> str:
    """Return 'kernel' or 'legacy_manifest' for STEP export."""
    if is_kernel_master() and (Path(twin) / "geometry" / "assembly.json").is_file():
        return "kernel"
    if (Path(twin) / "geometry" / "assembly.json").is_file() and (
        os.environ.get("ANVIL_STEP_SOURCE") or ""
    ).strip().lower() in ("kernel", "ir", "geometry"):
        return "kernel"
    return "legacy_manifest"


def _selftest() -> None:
    assert geometry_master_mode() in ("kernel", "legacy_blender")
    os.environ["ANVIL_GEOMETRY_MASTER"] = "kernel"
    assert is_kernel_master()
    os.environ["ANVIL_GEOMETRY_MASTER"] = "legacy_blender"
    assert not is_kernel_master()
    ir = {
        "components": [
            {
                "tag": "A",
                "name": "Box",
                "geometry_kind": "solid",
                "family": "box",
                "role": "enclosure",
                "params_mm": {"w": 10, "d": 10, "h": 5},
                "pose": {"origin_mm": [0, 0, 0]},
            }
        ]
    }
    rows = ir_to_parts_manifest_rows(ir)
    assert len(rows) == 1 and rows[0]["dims_mm"]["w"] == 10
    print("geometry_master selftest OK")


if __name__ == "__main__":
    _selftest()
