#!/usr/bin/env python3
"""P0+P1 twin repair — one FPK identity + concentric geometry writeback.

INTENT (2026-07-29): patch the live front twin so BoM/contract/Blender share one
motor, one MCU, planetary+mini-diff in rotor, AC busbar pierce, nested dims, and
`interfaceIcd` without inventing FIA port XYZ.

Usage:
  python3 scripts/fe-front-p0-identity-geometry.py [outDir]
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "lib"))

from fpk_concentric_geometry import (  # noqa: E402
    geometry_from_quantities,
    principal_box_dims,
    quantity_writeback,
)

FRONT = ROOT / "out/formula-e-front-mgu-20260729-1432"
NOW = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")

RENAME = {
    "reduction_gear_stage": ("planetary_reduction_in_rotor", "Planetary Reduction In Rotor"),
    "open_bevel_differential": ("mini_diff_in_rotor", "Mini Diff In Rotor"),
    "phase_cable_set": ("ac_phase_busbar_pierce", "Ac Phase Busbar Pierce"),
}
DROP_SYNTH = {
    "traction_motor_synth",
    "traction_inverter_synth",
    "traction_motor_synth_word",
    "traction_inverter_synth_word",
}


def _load(p: Path) -> dict:
    return json.loads(p.read_text())


def _save(p: Path, data: object) -> None:
    p.write_text(json.dumps(data, indent=2) + "\n")


def _qty_nums(cq: dict) -> dict[str, float]:
    out: dict[str, float] = {}
    for k, v in (cq or {}).items():
        if isinstance(v, dict):
            try:
                n = float(v.get("value"))
            except (TypeError, ValueError):
                continue
        else:
            try:
                n = float(v)
            except (TypeError, ValueError):
                continue
        if n == n and n > 0:
            out[k] = n
    return out


def _set_dim(word: dict, dim: str, basis: str) -> None:
    mods = list(word.get("modifier_characters") or [])
    kept = [m for m in mods if (m or {}).get("kind") not in ("dimension", "dimensions", "sizing_basis")]
    kept.append({"kind": "dimension", "value": dim, "unit": ""})
    kept.append({"kind": "sizing_basis", "value": basis, "unit": ""})
    word["modifier_characters"] = kept


def patch_words(state: dict, boxes: dict[str, str]) -> dict:
    stats = {"renamed": 0, "dropped_synth": 0, "dimmed": 0, "added": 0}
    modules = ((state.get("moduleDecomposition") or {}).get("modules")) or []
    basis = (
        "fpk_concentric_geometry (PHANTM pattern): nested in bay / hollow rotor — "
        f"stamped {NOW}"
    )
    for m in modules:
        for sm in m.get("sub_modules") or []:
            words = sm.get("words") or []
            keep = []
            for w in words:
                cid = str((w.get("content_character") or {}).get("character_id") or w.get("id") or "")
                wid = str(w.get("id") or "")
                if cid in DROP_SYNTH or wid in DROP_SYNTH or cid.endswith("_synth") and (
                    "traction_motor" in cid or "traction_inverter" in cid
                ):
                    stats["dropped_synth"] += 1
                    continue
                # Rename identities
                for old, (new_id, new_name) in RENAME.items():
                    if cid == old or wid == old:
                        w["id"] = new_id
                        cc = dict(w.get("content_character") or {})
                        cc["character_id"] = new_id
                        cc["name_human"] = new_name
                        w["content_character"] = cc
                        if "name_human" in w:
                            w["name_human"] = new_name
                        stats["renamed"] += 1
                        cid = new_id
                        break
                # Nested / contract dims
                for key, dim in boxes.items():
                    if cid == key or cid.replace("_word", "") == key:
                        _set_dim(w, dim, basis)
                        stats["dimmed"] += 1
                        break
                keep.append(w)
            sm["words"] = keep

    return stats


def patch_contract(state: dict, g, wb: dict) -> None:
    for key in ("orchestratorContract", "engineeringContract"):
        c = state.get(key)
        if not isinstance(c, dict):
            continue
        cq = dict(c.get("quantities") or {})
        cq.update(wb)
        c["quantities"] = cq
        # Topology rename
        topo = []
        for e in c.get("topology") or []:
            if not isinstance(e, dict):
                continue
            e = dict(e)
            for fld in ("from_part", "to_part"):
                v = str(e.get(fld) or "")
                if v == "reduction_gear_stage":
                    e[fld] = "planetary_reduction_in_rotor"
                elif v == "open_bevel_differential":
                    e[fld] = "mini_diff_in_rotor"
            topo.append(e)
        if topo:
            c["topology"] = topo
        macros = []
        for mac in c.get("macro_assembly_prices") or []:
            if not isinstance(mac, dict):
                continue
            mac = dict(mac)
            wn = str(mac.get("word_name") or "")
            if wn in RENAME:
                mac["word_name"] = RENAME[wn][0]
                if "open_bevel" in wn or "reduction_gear" in wn:
                    mac["source_detail"] = (
                        "trial concentric planetary/mini-diff nest inside hollow rotor"
                    )
            macros.append(mac)
        if macros:
            c["macro_assembly_prices"] = macros
        state[key] = c


def stamp_interface_icd(state: dict) -> None:
    """P0.7 — types required; XYZ OPEN until supplier/chassis ICD (never invent FIA mm)."""
    state["interfaceIcd"] = {
        "stamped_at": NOW,
        "verdict": "TYPES_ONLY_XYZ_OPEN",
        "provenance_note": (
            "Public FE regs + press define functional interfaces and envelope class; "
            "exact port XYZ / mount CAD are supplier–chassis ICD — not open-web FIA drawings. "
            "Do not invent millimetres."
        ),
        "ports": [
            {
                "id": "HV_DC_IN",
                "type": "HV DC connector (Amphenol-class)",
                "count": 1,
                "provenance": "press_type",
                "xyz_mm": None,
                "status": "OPEN_await_supplier_icd",
            },
            {
                "id": "COOLANT_IN",
                "type": "coolant quick-connect inlet",
                "count": 1,
                "provenance": "fia_functional",
                "xyz_mm": None,
                "status": "OPEN_await_supplier_icd",
            },
            {
                "id": "COOLANT_OUT",
                "type": "coolant quick-connect outlet",
                "count": 1,
                "provenance": "fia_functional",
                "xyz_mm": None,
                "status": "OPEN_await_supplier_icd",
            },
            {
                "id": "LV_CAN",
                "type": "LV / CAN-FD vehicle interface",
                "count": 1,
                "provenance": "press_type",
                "xyz_mm": None,
                "status": "OPEN_await_supplier_icd",
            },
            {
                "id": "HALFSHAFT_L",
                "type": "halfshaft output flange",
                "count": 1,
                "provenance": "fia_functional",
                "xyz_mm": None,
                "status": "OPEN_await_supplier_icd",
            },
            {
                "id": "HALFSHAFT_R",
                "type": "halfshaft output flange",
                "count": 1,
                "provenance": "fia_functional",
                "xyz_mm": None,
                "status": "OPEN_await_supplier_icd",
            },
            {
                "id": "MOUNT_EARS",
                "type": "chassis mounting ear set",
                "count": 4,
                "provenance": "press_type",
                "xyz_mm": None,
                "status": "OPEN_await_supplier_icd",
            },
        ],
        "architecture": "concentric_fpk_stack",
        "layers": [
            "mcu_shelf_inverter",
            "stator_wave_wound",
            "hollow_rotor",
            "planetary_diff_in_rotor",
        ],
        "lucid_role": "FFF_TRAINING_CHECK_ONLY",
    }


def patch_requirements_bom(state: dict, boxes: dict[str, str]) -> int:
    n = 0
    bom = state.get("requirementsBom")
    rows = []
    if isinstance(bom, list):
        rows = bom
    elif isinstance(bom, dict):
        rows = bom.get("rows") or []
    for r in rows:
        if not isinstance(r, dict):
            continue
        name = str(r.get("name") or r.get("part") or r.get("character_id") or "")
        cid = str(r.get("character_id") or r.get("id") or "")
        blob = f"{name} {cid}".lower()
        if "traction motor" in blob and "generator" not in blob and "ipmsm" not in blob:
            r["_drop"] = True
            n += 1
            continue
        if "traction inverter" in blob and "sic" not in blob:
            r["_drop"] = True
            n += 1
            continue
        for old, (new_id, new_name) in RENAME.items():
            if old in cid or old.replace("_", " ") in blob:
                r["character_id"] = new_id
                r["name"] = new_name
                if "part" in r:
                    r["part"] = new_name
                n += 1
        for key, dim in boxes.items():
            if key in cid or key.replace("_", " ") in blob:
                r["dimensions_mm"] = dim
                n += 1
    if isinstance(bom, list):
        state["requirementsBom"] = [r for r in rows if not r.get("_drop")]
    elif isinstance(bom, dict):
        bom["rows"] = [r for r in rows if not r.get("_drop")]
        state["requirementsBom"] = bom
    return n


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else FRONT
    state_path = out / "state.json"
    state = _load(state_path)
    cq = _qty_nums(
        ((state.get("orchestratorContract") or {}).get("quantities"))
        or ((state.get("engineeringContract") or {}).get("quantities"))
        or {}
    )
    g = geometry_from_quantities(cq)
    boxes = principal_box_dims(g)
    wb = quantity_writeback(g)

    stats = patch_words(state, boxes)
    patch_contract(state, g, wb)
    stamp_interface_icd(state)
    bom_n = patch_requirements_bom(state, boxes)

    state["fpkConcentricGeometry"] = {
        "stamped_at": NOW,
        "housing_od_mm": g.housing_od_mm,
        "housing_len_mm": g.housing_len_mm,
        "stator_od_mm": g.stator_od_mm,
        "stator_id_mm": g.stator_id_mm,
        "rotor_od_mm": g.rotor_od_mm,
        "rotor_id_mm": g.rotor_id_mm,
        "sun_od_mm": g.sun_od_mm,
        "planet_od_mm": g.planet_od_mm,
        "planet_count": g.planet_count,
        "ring_id_mm": g.ring_id_mm,
        "diff_od_mm": g.diff_od_mm,
        "mcu_w_mm": g.mcu_w_mm,
        "mcu_d_mm": g.mcu_d_mm,
        "mcu_h_mm": g.mcu_h_mm,
        "nest_fits_rotor": g.nest_fits_rotor,
        "stack_fits_bay": g.stack_fits_bay,
        "mcu_fits_bay": g.mcu_fits_bay,
        "notes": list(g.notes),
        "principal_boxes": boxes,
        "source": "scripts/lib/fpk_concentric_geometry.py",
    }
    state["p0IdentityRepair"] = {
        "stamped_at": NOW,
        "stats": stats,
        "bom_touches": bom_n,
        "killed": sorted(DROP_SYNTH),
        "renames": {k: v[0] for k, v in RENAME.items()},
    }

    _save(state_path, state)
    # Mirror into 0.5-engineering-contract.json if present
    ec_path = out / "0.5-engineering-contract.json"
    if ec_path.exists():
        ec = _load(ec_path)
        if isinstance(ec, dict):
            cq2 = dict(ec.get("quantities") or {})
            cq2.update(wb)
            ec["quantities"] = cq2
            _save(ec_path, ec)

    print(json.dumps({
        "ok": True,
        "out": str(out),
        "geometry": {
            "housing_od_mm": g.housing_od_mm,
            "housing_len_mm": g.housing_len_mm,
            "rotor_id_mm": g.rotor_id_mm,
            "sun_od_mm": g.sun_od_mm,
            "planet_od_mm": g.planet_od_mm,
            "planet_count": g.planet_count,
            "nest_fits": g.nest_fits_rotor,
            "stack_fits": g.stack_fits_bay,
        },
        "stats": stats,
        "boxes": boxes,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
