#!/usr/bin/env python3
"""Seat gold-spine BoM principals into the parts-manifest.

INTENT (2026-07-14 Tristan): coverage must not Goodhart on absorbed-host proxies
(Microcontroller / LED Source) while the BoM names Compute UI Module (I-201) and
LED Source Board (X-201). A one-off JSON patch on a single run is a band-aid —
the next Blender export would regress. This module is the SOURCE rule: every
instrument manifest export seats missing spine principals from (1) story/cutaway
mesh bboxes when available, else (2) donor proxy rows already placed.

FLOW: build_universal_scene.write_parts_manifest
   → seat_spine_principals_in_manifest(rows, state, mesh_bbox_by_prefix)
   → parts-ledger coverage matches BoM I-201/X-201
   → Assembly / Renders denominators stay honest

Usage:
  from instrument_spine_manifest import seat_spine_principals_in_manifest
  n = seat_spine_principals_in_manifest(rows, state, mesh_bbox_by_prefix)
  python3 scripts/lib/instrument_spine_manifest.py out/<run>   # offline reseat
  python3 scripts/lib/instrument_spine_manifest.py --selftest
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any, Optional

# Prefer the bake module's canonical list; fall back to the two coverage-critical seats.
try:
    from instrument_gold_spine_bake import SPINE_PRINCIPALS  # type: ignore
except Exception:  # noqa: BLE001 — allow offline import from scripts/lib
    try:
        _HERE = Path(__file__).resolve().parent
        if str(_HERE) not in sys.path:
            sys.path.insert(0, str(_HERE))
        from instrument_gold_spine_bake import SPINE_PRINCIPALS  # type: ignore
    except Exception:  # noqa: BLE001
        SPINE_PRINCIPALS = [
            {"tag": "I-201", "requirement": "Compute UI Module"},
            {"tag": "X-201", "requirement": "LED Source Board"},
        ]

# Principals that must appear on blender + GA for an instrument pack (not cables/consumables).
_SEAT_REQUIRED_RE = re.compile(
    r"compute\s*ui\s*module|led\s*source\s*board",
    re.I,
)

# Absorbed-host / story meshes that already carry the geometry for a spine principal.
_DONOR_ALIASES: dict[str, tuple[str, ...]] = {
    "compute ui module": (
        "microcontroller",
        "local display",
        "user input buttons",
        "usb interface",
    ),
    "led source board": (
        "led source",
        "led driver",
        "wavelength selection module",
    ),
}

_MESH_HINTS: dict[str, tuple[str, ...]] = {
    "compute ui module": (
        "u_se_cutaway_cue_ui_pcb",
        "u_se_instrument_story_pcb",
        "u_se_cutaway_cue_top_display",
    ),
    "led source board": (
        "u_se_cutaway_cue_led_pcb",
        "u_se_exterior_detail_led_pcb",
        "u_se_exterior_detail_source_window",
    ),
}


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(name or "").lower()).strip()


def _slug(name: str) -> str:
    return "u_" + re.sub(r"[^a-z0-9]+", "_", str(name).lower()).strip("_")[:40]


def _spine_seats_from_state(state: Optional[dict]) -> list[dict[str, str]]:
    """Return [{tag, name}] for instrument spine principals that must be seated."""
    seats: list[dict[str, str]] = []
    seen: set[str] = set()
    rb = []
    if isinstance(state, dict):
        rb = (
            (state.get("requirementsBom") or {}).get("rows")
            or state.get("requirements_bom_rows")
            or []
        )
    for r in rb:
        if not isinstance(r, dict):
            continue
        if r.get("status") == "SUB-COMPONENT":
            continue
        name = str(r.get("requirement") or r.get("name") or "").strip()
        tag = str(r.get("tag") or "").strip()
        if not name or not _SEAT_REQUIRED_RE.search(name):
            continue
        key = _norm(name)
        if key in seen:
            continue
        seen.add(key)
        seats.append({"tag": tag or "", "name": name})
    if seats:
        return seats
    # Fallback — bake table (works even when state BoM was not gold-spine baked).
    for p in SPINE_PRINCIPALS:
        name = str(p.get("requirement") or "").strip()
        tag = str(p.get("tag") or "").strip()
        if not name or not _SEAT_REQUIRED_RE.search(name):
            continue
        seats.append({"tag": tag, "name": name})
    return seats


def _row_has_principal(rows: list[dict], name: str, tag: str) -> bool:
    nn = _norm(name)
    tt = str(tag or "").strip()
    for r in rows:
        if tt and str(r.get("equipment_tag") or "").strip() == tt:
            return True
        if _norm(str(r.get("name") or "")) == nn:
            return True
    return False


def _find_donor_row(rows: list[dict], principal_name: str) -> Optional[dict]:
    aliases = _DONOR_ALIASES.get(_norm(principal_name), ())
    for r in rows:
        rn = _norm(str(r.get("name") or ""))
        if rn in aliases or any(a in rn for a in aliases):
            return r
    return None


def _mesh_pose(
    mesh_bbox_by_prefix: Optional[dict[str, tuple[float, float, float, float, float, float]]],
    principal_name: str,
) -> Optional[tuple[list[float], dict[str, float]]]:
    """Return (pos_mm, dims_mm) from a story/cutaway mesh bbox, or None."""
    if not mesh_bbox_by_prefix:
        return None
    for pref in _MESH_HINTS.get(_norm(principal_name), ()):
        bb = mesh_bbox_by_prefix.get(pref)
        if not bb:
            # allow prefix match (pads/connectors share stem)
            for k, v in mesh_bbox_by_prefix.items():
                if k == pref or k.startswith(pref + "_"):
                    bb = v
                    break
        if not bb:
            continue
        xmin, xmax, ymin, ymax, zmin, zmax = bb
        pos = [
            round((xmin + xmax) / 2.0, 1),
            round((ymin + ymax) / 2.0, 1),
            round((zmin + zmax) / 2.0, 1),
        ]
        dims = {
            "w": round(max(1.0, xmax - xmin), 1),
            "d": round(max(1.0, ymax - ymin), 1),
            "h": round(max(1.0, zmax - zmin), 1),
        }
        return pos, dims
    return None


def seat_spine_principals_in_manifest(
    rows: list[dict],
    state: Optional[dict] = None,
    mesh_bbox_by_prefix: Optional[
        dict[str, tuple[float, float, float, float, float, float]]
    ] = None,
) -> int:
    """Ensure Compute UI / LED Source Board principals exist as manifest rows.

    @description Mutates `rows` in place. Additive only — never deletes donors.
    @param rows parts-manifest part dicts
    @param state design state.json (optional; used to discover spine BoM names/tags)
    @param mesh_bbox_by_prefix optional {object_prefix: (xmin,xmax,ymin,ymax,zmin,zmax)} mm
    @returns number of rows seated (0 when already complete or not an instrument)
    """
    if not isinstance(rows, list):
        return 0
    is_instrument = bool(isinstance(state, dict) and state.get("isInstrumentDevice"))
    if not is_instrument:
        # Still seat when the BoM already carries gold-spine principals (baked run).
        seats_probe = _spine_seats_from_state(state)
        if not seats_probe:
            return 0
        is_instrument = True
    if not is_instrument:
        return 0

    n = 0
    for seat in _spine_seats_from_state(state):
        name = seat["name"]
        tag = seat["tag"]
        if _row_has_principal(rows, name, tag):
            # Repair equipment_tag if the name exists under a mint tag.
            for r in rows:
                if _norm(str(r.get("name") or "")) == _norm(name) and tag:
                    if str(r.get("equipment_tag") or "") != tag:
                        r["equipment_tag"] = tag
                        n += 1
            continue

        pos: Optional[list[float]] = None
        dims: Optional[dict[str, float]] = None
        source = "spine_principal_seat"
        mesh_pose = _mesh_pose(mesh_bbox_by_prefix, name)
        if mesh_pose:
            pos, dims = mesh_pose
            source = "spine_principal_seat_from_story_mesh"
        else:
            donor = _find_donor_row(rows, name)
            if donor is None:
                continue
            pos = list(donor.get("pos_mm") or [0.0, 0.0, 0.0])
            d0 = donor.get("dims_mm") or {}
            if "dia" in d0:
                dims = {
                    "w": float(d0.get("dia") or 20.0),
                    "d": float(d0.get("dia") or 20.0),
                    "h": float(d0.get("len") or 10.0),
                }
            else:
                dims = {
                    "w": float(d0.get("w") or 40.0),
                    "d": float(d0.get("d") or 30.0),
                    "h": float(d0.get("h") or 8.0),
                }
            source = "spine_principal_seat_from_donor"

        assert pos is not None and dims is not None
        rows.append({
            "tag": _slug(name),
            "equipment_tag": tag or "",
            "name": name,
            "module": "gold_spine",
            "shape": "instrument",
            "qty": 1,
            "region_rank": 50,
            "pos_mm": [round(float(pos[0]), 1), round(float(pos[1]), 1),
                       round(float(pos[2]), 1)],
            "dims_mm": {
                "w": round(float(dims["w"]), 1),
                "d": round(float(dims["d"]), 1),
                "h": round(float(dims["h"]), 1),
            },
            "geometry_source": source,
        })
        n += 1
    return n


def reseat_run_manifest(run_dir: Path) -> int:
    """Offline: reseat spine principals into an existing parts-manifest.json (+ blender copy)."""
    run_dir = Path(run_dir)
    state_path = run_dir / "state.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    n_total = 0
    for rel in ("parts-manifest.json", "blender/renders/parts-manifest.json"):
        path = run_dir / rel
        if not path.exists():
            continue
        man = json.loads(path.read_text())
        rows = man.get("parts") or []
        n = seat_spine_principals_in_manifest(rows, state, mesh_bbox_by_prefix=None)
        man["parts"] = rows
        man["count"] = len(rows)
        path.write_text(json.dumps(man, indent=2) + "\n")
        n_total += n
        print(f"[spine-manifest] {rel}: seated {n} principal(s); count={man['count']}")
    return n_total


def _selftest() -> None:
    rows = [
        {
            "tag": "u_microcontroller",
            "equipment_tag": "I-113",
            "name": "Microcontroller",
            "module": "control",
            "shape": "instrument",
            "qty": 1,
            "region_rank": 40,
            "pos_mm": [-30.0, 0.0, 35.0],
            "dims_mm": {"w": 70.0, "d": 50.0, "h": 5.0},
        },
        {
            "tag": "u_led_source",
            "equipment_tag": "X-103",
            "name": "LED Source",
            "module": "optical",
            "shape": "instrument",
            "qty": 1,
            "region_rank": 30,
            "pos_mm": [46.0, -20.0, 95.0],
            "dims_mm": {"w": 28.0, "d": 18.0, "h": 14.0},
        },
    ]
    state = {
        "isInstrumentDevice": True,
        "requirementsBom": {
            "rows": [
                {"tag": "I-201", "requirement": "Compute UI Module"},
                {"tag": "X-201", "requirement": "LED Source Board"},
            ]
        },
    }
    # proveCatch: missing principals → seated from donors
    n = seat_spine_principals_in_manifest(rows, state)
    assert n == 2, n
    names = {r["name"] for r in rows}
    assert "Compute UI Module" in names
    assert "LED Source Board" in names
    by_name = {r["name"]: r for r in rows}
    assert by_name["Compute UI Module"]["equipment_tag"] == "I-201"
    assert by_name["LED Source Board"]["equipment_tag"] == "X-201"
    # Idempotent
    n2 = seat_spine_principals_in_manifest(rows, state)
    assert n2 == 0, n2
    # Mesh path preferred over donor
    rows2 = [dict(rows[0]), dict(rows[1])]  # donors only
    mesh = {
        "u_se_cutaway_cue_ui_pcb": (-40.0, 0.0, -10.0, 10.0, 30.0, 40.0),
        "u_se_cutaway_cue_led_pcb": (40.0, 60.0, -30.0, -10.0, 90.0, 110.0),
    }
    n3 = seat_spine_principals_in_manifest(rows2, state, mesh_bbox_by_prefix=mesh)
    assert n3 == 2, n3
    ui = next(r for r in rows2 if r["name"] == "Compute UI Module")
    assert ui["geometry_source"] == "spine_principal_seat_from_story_mesh"
    assert ui["pos_mm"] == [-20.0, 0.0, 35.0]
    print("instrument-spine-manifest _selftest: OK (donor seat + mesh seat + idempotent)")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        raise SystemExit(0)
    if len(sys.argv) < 2:
        raise SystemExit("usage: instrument-spine-manifest.py <run-dir> | --selftest")
    raise SystemExit(0 if reseat_run_manifest(Path(sys.argv[1])) >= 0 else 1)
