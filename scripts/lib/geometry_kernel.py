#!/usr/bin/env python3
"""Anvil geometry kernel — build IR + paths + STEP from twin artefacts.

Universal: role/noun based families; no product_class forks.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

from geometry_ir import (
    empty_assembly,
    geometry_dir,
    principal_tags_from_state,
    sanitize_name,
    save_ir,
    validate_ir,
)
from geometry_completeness import evaluate_completeness, save_completeness
from geometry_path_router import load_principal_edges, route_all

try:
    from geometry_step_export import export_step
except ImportError:  # pragma: no cover
    export_step = None  # type: ignore


def _pos_xyz(pos: Any) -> list[float]:
    if isinstance(pos, dict):
        return [float(pos.get("x") or 0), float(pos.get("y") or 0), float(pos.get("z") or 0)]
    if isinstance(pos, (list, tuple)) and len(pos) >= 3:
        return [float(pos[0] or 0), float(pos[1] or 0), float(pos[2] or 0)]
    return [0.0, 0.0, 0.0]


def _rpy_from_manifest(man: dict) -> list[float]:
    """Read roll/pitch/yaw deg when present; default identity (no silent invention)."""
    for key in ("rotation_rpy_deg", "rpy_deg", "euler_deg", "rotation_deg"):
        r = man.get(key)
        if isinstance(r, (list, tuple)) and len(r) >= 3:
            return [float(r[0] or 0), float(r[1] or 0), float(r[2] or 0)]
        if isinstance(r, dict):
            return [
                float(r.get("roll") or r.get("r") or 0),
                float(r.get("pitch") or r.get("p") or 0),
                float(r.get("yaw") or r.get("y") or 0),
            ]
    return [0.0, 0.0, 0.0]


def _site_min(pm: dict) -> list[float]:
    s = pm.get("site") or pm.get("bbox_mm") or {}
    if not isinstance(s, dict):
        return [0.0, 0.0, 0.0]
    return [
        float(s.get("x_min_mm") or s.get("x_min") or 0),
        float(s.get("y_min_mm") or s.get("y_min") or 0),
        float(s.get("z_min_mm") or s.get("z_min") or 0),
    ]


def _family_and_params(name: str, shape: str, dims: dict) -> tuple[str, dict]:
    dims = dims if isinstance(dims, dict) else {}
    nl = (name or "").lower()
    sh = (shape or "").lower()
    if "cylinder" in sh or re.search(r"vessel|motor|filter|shaft|rotor", nl):
        dia = float(dims.get("dia") or dims.get("d") or dims.get("w") or 20)
        ln = float(dims.get("len") or dims.get("h") or dims.get("d") or 30)
        return "cylinder", {"dia": dia, "len": ln}
    if re.search(r"\bpcb\b|board|mcu|hat\b", nl):
        w = float(dims.get("w") or 80)
        d = float(dims.get("d") or 50)
        h = float(dims.get("h") or 1.6)
        return "board", {"w": w, "d": d, "h": h}
    w = float(dims.get("w") or 20)
    d = float(dims.get("d") or dims.get("dia") or 20)
    h = float(dims.get("h") or dims.get("len") or 15)
    if re.search(r"enclosure|shell|housing|casing", nl):
        return "envelope", {"w": w, "d": d, "h": h}
    return "box", {"w": w, "d": d, "h": h}


def _role(name: str) -> str:
    nl = (name or "").lower()
    for role, rx in (
        ("vessel", r"vessel|vial|culture"),
        ("pump", r"pump|peristaltic"),
        ("stirrer", r"stirr|agitator"),
        ("vent", r"vent|filter"),
        ("pcb", r"pcb|board|mcu"),
        ("sensor", r"sensor|probe|optical|od\b|flow"),
        ("thermal", r"peltier|tec|heater|heatsink"),
        ("enclosure", r"enclosure|shell|housing"),
        ("motor", r"motor|ipmsm|rotor|stator"),
        ("inverter", r"inverter|sic|gate.?drive"),
    ):
        if re.search(rx, nl):
            return role
    return "part"


def _material(role: str) -> str:
    return {
        "vessel": "clear_polymer",
        "vent": "ptfe_polymer",
        "pcb": "fr4",
        "enclosure": "aluminium",
        "motor": "steel_aluminium",
        "thermal": "aluminium",
        "pump": "polymer_metal",
    }.get(role, "generic_polymer")


def _print_role(role: str, name: str) -> Optional[str]:
    if role == "enclosure" or re.search(r"fixture|holder|manifold|bracket", name or "", re.I):
        return "enclosure" if role == "enclosure" else "fixture"
    return None


def _is_consumable(name: str, status: str) -> bool:
    if re.search(r"tubing set|media|consumable|label set|grease|adhesive", name or "", re.I):
        return True
    return False


def _should_open_hold(name: str, part: str, status: str) -> Optional[str]:
    """Principals that are deliberate holds (TBD sensing paths, etc.)."""
    pl = (part or "").upper()
    if "TBD" in pl or status.upper() == "TBD":
        if re.search(r"optical|od600|flow sensor|stirrer drive|mcu", name or "", re.I):
            return f"OPEN hold: {name} identity/geometry not frozen"
    return None


def build_assembly_from_twin(
    twin: Path,
    *,
    route_paths: bool = True,
    export_step_file: bool = True,
) -> dict[str, Any]:
    twin = Path(twin)
    state = json.loads((twin / "state.json").read_text(encoding="utf-8"))
    pm = {}
    if (twin / "parts-manifest.json").is_file():
        pm = json.loads((twin / "parts-manifest.json").read_text(encoding="utf-8"))

    ir = empty_assembly(twin.name)
    site_min = _site_min(pm)
    ir["frame"]["site_min_mm"] = site_min

    principals = principal_tags_from_state(state, pm)
    # enrich from ledger
    ledger_path = twin / "parts-ledger.json"
    if ledger_path.is_file():
        pl = json.loads(ledger_path.read_text(encoding="utf-8"))
        for e in pl.get("equipment") or []:
            if not isinstance(e, dict) or not e.get("tag"):
                continue
            tag = str(e["tag"])
            hit = next((p for p in principals if p["tag"] == tag), None)
            if hit is None:
                principals.append(
                    {
                        "tag": tag,
                        "name": str(e.get("name") or tag),
                        "source": "ledger",
                        "part": str(e.get("part") or ""),
                        "status": str(e.get("status") or ""),
                        "dims_mm": e.get("dims_mm"),
                    }
                )

    # index manifest parts by tag for poses
    man_by_tag = {}
    for p in pm.get("parts") or []:
        if isinstance(p, dict):
            t = str(p.get("tag") or p.get("equipment_tag") or "")
            if t:
                man_by_tag[t] = p

    components = []
    for prin in principals:
        tag = prin["tag"]
        name = prin["name"]
        man = man_by_tag.get(tag) or {}
        dims = prin.get("dims_mm") or man.get("dims_mm") or {}
        shape = str(man.get("shape") or "")
        pos = man.get("pos_mm") or prin.get("pos_mm")
        origin = _pos_xyz(pos)
        # shift to site min frame for export
        origin_shifted = [
            origin[0] - site_min[0],
            origin[1] - site_min[1],
            origin[2] - site_min[2],
        ]
        rpy = _rpy_from_manifest(man)

        if _is_consumable(name, prin.get("status") or ""):
            ir["consumables"].append(
                {
                    "tag": tag,
                    "name": name,
                    "geometry_kind": "consumable_no_mesh",
                    "reason": "consumable / take-off — no discrete solid",
                }
            )
            continue

        hold_reason = _should_open_hold(name, prin.get("part") or "", prin.get("status") or "")
        # If no pose and no dims, OPEN rather than invent at origin pile
        if hold_reason and not pos:
            ir["holds"].append(
                {
                    "tag": tag,
                    "name": name,
                    "geometry_kind": "open",
                    "reason": hold_reason,
                    "status": "OPEN",
                }
            )
            continue

        family, params = _family_and_params(name, shape, dims if isinstance(dims, dict) else {})
        role = _role(name)
        # OPEN for TBD high-risk sensing but still place envelope if we have pose
        if hold_reason and pos:
            # place as envelope_only + hold note
            components.append(
                {
                    "tag": tag,
                    "name": name,
                    "role": role,
                    "geometry_kind": "envelope_only",
                    "family": family,
                    "params_mm": params,
                    "pose": {
                        "origin_mm": origin_shifted,
                        "rotation_rpy_deg": rpy,
                    },
                    "material": _material(role),
                    "bom_ref": f"tag={tag}",
                    "geometry_source": "parametric_family",
                    "print_role": _print_role(role, name),
                    "status": "PLACED_ENVELOPE",
                    "hold_note": hold_reason,
                    "export_name": sanitize_name(tag, name),
                }
            )
            ir["holds"].append(
                {
                    "tag": tag,
                    "name": name,
                    "geometry_kind": "open",
                    "reason": hold_reason + " (envelope only in STEP)",
                    "status": "OPEN",
                }
            )
            continue

        if not pos and not dims:
            ir["holds"].append(
                {
                    "tag": tag,
                    "name": name,
                    "geometry_kind": "open",
                    "reason": "no placement or dimensions on twin",
                    "status": "OPEN",
                }
            )
            continue

        # Dims without placement would invent a pile at site origin — OPEN instead.
        if not pos:
            ir["holds"].append(
                {
                    "tag": tag,
                    "name": name,
                    "geometry_kind": "open",
                    "reason": "dimensions present but no placement (refuse silent origin pile-up)",
                    "status": "OPEN",
                }
            )
            continue

        components.append(
            {
                "tag": tag,
                "name": name,
                "role": role,
                "geometry_kind": "solid",
                "family": family,
                "params_mm": params,
                "pose": {
                    "origin_mm": origin_shifted,
                    "rotation_rpy_deg": rpy,
                },
                "material": _material(role),
                "bom_ref": f"tag={tag}",
                "geometry_source": "parametric_family",
                "print_role": _print_role(role, name),
                "status": "PLACED",
                "export_name": sanitize_name(tag, name),
            }
        )

    ir["components"] = components

    # Paths
    edges_meta = []
    if route_paths:
        conn = []
        cl_path = twin / "connection-ledger.json"
        if cl_path.is_file():
            cl = json.loads(cl_path.read_text(encoding="utf-8"))
            conn = cl.get("rows") or cl.get("connections") or []
        is_inst = bool(state.get("isInstrumentDevice"))
        edges = load_principal_edges(conn, is_instrument=is_inst)
        by_key: dict[str, dict] = {}
        for c in components:
            by_key[str(c["tag"])] = c
            by_key[str(c.get("name") or "")] = c
        paths, path_holds = route_all(edges, by_key)
        ir["paths"] = paths
        ir["holds"].extend(path_holds)
        edges_meta = edges

    problems = validate_ir(ir)
    gdir = geometry_dir(twin)
    gdir.mkdir(parents=True, exist_ok=True)
    save_ir(gdir / "assembly.json", ir)

    # Blender import contract
    blender_import = {
        "schema": "anvil.blender_import/1",
        "assembly_step": "geometry/assembly.step",
        "assembly_json": "geometry/assembly.json",
        "forbid_freehand_principals": True,
        "collections": {
            "solids": [c.get("export_name") for c in components],
            "paths": [f"path_{p.get('id')}" for p in ir.get("paths") or []],
        },
        "material_by_role": {
            "enclosure": "anvil_aluminium",
            "vessel": "anvil_clear_polymer",
            "pcb": "anvil_fr4",
            "vent": "anvil_ptfe",
            "motor": "anvil_metal",
        },
    }
    (gdir / "blender_import.json").write_text(
        json.dumps(blender_import, indent=2) + "\n", encoding="utf-8"
    )

    # STEP (named CadQuery Assembly tree when available)
    step_report = {"ok": False, "skipped": True}
    step_path = gdir / "assembly.step"
    if export_step_file and export_step is not None:
        step_report = export_step(ir, step_path)
        step_report["skipped"] = False
    elif export_step_file:
        step_report = {"ok": False, "error": "export_step unavailable", "skipped": False}

    # Print subset (STL + optional 3MF)
    print_report = _export_print_subset(ir, gdir)

    # Completeness
    principal_tags = [p["tag"] for p in principals]
    comp_report = evaluate_completeness(
        ir,
        principal_tags=principal_tags,
        principal_edges=edges_meta,
        step_path=step_path if step_report.get("ok") else None,
    )
    save_completeness(gdir / "completeness.json", comp_report)

    # G-DRAW-SYNC: drawings from IR (placement slave to kernel)
    draw_report: dict[str, Any] = {"ok": False}
    try:
        from geometry_draw_sync import sync_drawings_from_ir

        draw_report = sync_drawings_from_ir(twin)
    except Exception as exc:  # pragma: no cover
        draw_report = {"ok": False, "error": str(exc)}

    # Blender film plan (slave) — always write plan; mesh build needs bpy
    film_report: dict[str, Any] = {"ok": False}
    try:
        import sys as _sys

        bu = str(Path(__file__).resolve().parents[1] / "blender-universal")
        if bu not in _sys.path:
            _sys.path.insert(0, bu)
        from import_geometry_kernel import write_film_plan

        film_path = write_film_plan(twin)
        film_report = {"ok": True, "film_plan": str(film_path)}
    except Exception as exc:  # pragma: no cover
        film_report = {"ok": False, "error": str(exc)}

    # README for Tristan
    (gdir / "README.txt").write_text(
        "Anvil geometry (CAD master)\n"
        "─────────────────────────\n"
        "1. Open assembly.step in FreeCAD (free) — engineering model.\n"
        "   Named product tree: solids/<tag>_… and paths/path_…\n"
        "2. assembly.json lists solids, paths, and OPEN holds.\n"
        "3. completeness.json scores BoM↔geometry coverage.\n"
        "4. blender_import.json + film_plan.json map this assembly into Blender film (slave).\n"
        "   Blender must not invent principal placement when ANVIL_GEOMETRY_MASTER=kernel.\n"
        "5. drawings/ga-geometry-from-ir.svg is G-DRAW-SYNC from this IR.\n"
        "6. STEP is not supplier fab-ready and not a substitute for HIL/Gerbers.\n"
        f"\nCompleteness: {comp_report.get('score')}/10 · "
        f"STEP ok={step_report.get('ok')} named_tree={step_report.get('named_tree')} · "
        f"solids={comp_report.get('n_solid')} paths={comp_report.get('n_path')} "
        f"holds={comp_report.get('n_open_holds')}\n",
        encoding="utf-8",
    )

    return {
        "ok": True,
        "geometry_dir": str(gdir),
        "ir_problems": problems,
        "completeness": comp_report,
        "step": step_report,
        "print": print_report,
        "draw_sync": draw_report,
        "film": film_report,
        "n_components": len(components),
        "n_paths": len(ir.get("paths") or []),
        "n_holds": len(ir.get("holds") or []),
    }


def _export_print_subset(ir: dict, gdir: Path) -> dict[str, Any]:
    """Export STL (+ 3MF when CadQuery supports it) for print_role parts only."""
    try:
        import cadquery as cq
    except ImportError:
        return {"ok": False, "reason": "cadquery missing"}
    print_dir = gdir / "print"
    written = []
    threemf = []
    for comp in ir.get("components") or []:
        if not comp.get("print_role"):
            continue
        if comp.get("geometry_kind") not in ("solid", "envelope_only"):
            continue
        family = comp.get("family")
        params = comp.get("params_mm") or {}
        try:
            if family in ("box", "envelope", "board"):
                w, d, h = (
                    float(params.get("w") or 10),
                    float(params.get("d") or 10),
                    float(params.get("h") or 5),
                )
                solid = cq.Workplane("XY").box(w, d, h, centered=(True, True, False))
            elif family == "cylinder":
                dia = float(params.get("dia") or 10)
                ln = float(params.get("len") or 10)
                solid = cq.Workplane("XY").circle(dia / 2).extrude(ln)
            else:
                continue
            print_dir.mkdir(parents=True, exist_ok=True)
            base = comp.get("export_name") or comp.get("tag")
            out = print_dir / f"{base}.stl"
            cq.exporters.export(solid, str(out))
            written.append(out.name)
            # Best-effort 3MF (not all CadQuery builds expose it)
            try:
                out3 = print_dir / f"{base}.3mf"
                cq.exporters.export(solid, str(out3))
                if out3.is_file() and out3.stat().st_size > 50:
                    threemf.append(out3.name)
            except Exception:
                pass
        except Exception:
            continue
    note = (
        "Print subset only — not whole-product printable. "
        "Manifold check is best-effort; verify in slicer before fab."
    )
    if written:
        print_dir.mkdir(parents=True, exist_ok=True)
        (print_dir / "README.txt").write_text(note + "\n", encoding="utf-8")
    return {
        "ok": bool(written),
        "files": written,
        "threemf": threemf,
        "note": note if written else "no print_role parts",
    }


def _selftest() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as td:
        twin = Path(td)
        (twin / "state.json").write_text(
            json.dumps(
                {
                    "isInstrumentDevice": True,
                    "requirementsBom": [
                        {"tag": "X-1", "requirement": "Culture Vessel", "part": "vial"},
                        {"tag": "X-2", "requirement": "Media Tubing Set", "part": "tubing"},
                        {"tag": "X-3", "requirement": "Optical Density Sensor", "part": "TBD path"},
                    ],
                    "orchestratorContract": {"quantities": {}},
                }
            )
        )
        (twin / "parts-manifest.json").write_text(
            json.dumps(
                {
                    "site": {
                        "x_min_mm": 0,
                        "x_max_mm": 100,
                        "y_min_mm": 0,
                        "y_max_mm": 80,
                        "z_min_mm": 300,
                        "z_max_mm": 400,
                    },
                    "parts": [
                        {
                            "tag": "X-1",
                            "name": "Culture Vessel",
                            "shape": "cylinder",
                            "pos_mm": [50, 40, 350],
                            "dims_mm": {"dia": 30, "len": 50},
                        },
                        {
                            "tag": "X-3",
                            "name": "Optical Density Sensor",
                            "shape": "box",
                            "pos_mm": [20, 40, 350],
                            "dims_mm": {"w": 10, "d": 10, "h": 10},
                        },
                    ],
                }
            )
        )
        (twin / "connection-ledger.json").write_text(
            json.dumps(
                {
                    "rows": [
                        {
                            "id": "e1",
                            "from": "Culture Vessel",
                            "to": "Optical Density Sensor",
                            "service": "signal",
                            "from_tag": "X-1",
                            "to_tag": "X-3",
                        }
                    ]
                }
            )
        )
        r = build_assembly_from_twin(twin, export_step_file=True)
        assert r["ok"]
        assert (twin / "geometry" / "assembly.json").is_file()
        assert (twin / "geometry" / "completeness.json").is_file()
        assert (twin / "geometry" / "blender_import.json").is_file()
        # STEP may work with cadquery
        print("geometry_kernel selftest OK", r.get("step"), r["completeness"]["score"])


if __name__ == "__main__":
    _selftest()
