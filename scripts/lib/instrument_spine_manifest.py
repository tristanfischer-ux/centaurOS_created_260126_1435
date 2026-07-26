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
        # `requirementsBom` is EITHER the rows list itself OR a {rows: [...]} wrapper —
        # both shapes are live in the wild. The old code assumed the wrapper and did
        # `(... or {}).get("rows")`, which raised AttributeError on the list shape. That
        # exception propagated out of the SHARED try block in write_parts_manifest and
        # silently killed the vessel-on-top seating too, so no manifest row ever received
        # its `geometry_source` provenance stamp (organoid r11: the culture vessel was
        # then packed as an ordinary interior part instead of standing proud on the lid).
        _rb_raw = state.get("requirementsBom")
        if isinstance(_rb_raw, list):
            rb = _rb_raw
        elif isinstance(_rb_raw, dict):
            rb = _rb_raw.get("rows") or []
        rb = rb or state.get("requirements_bom_rows") or []
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


# ── culture-vessel unification (Tristan 2026-07-25 "on top, accessible") ──────────
# The sealed vial-bioreactor render draws the culture vessel as the ON-TOP hero
# signature mesh (u_se_le_vial), but the real BoM vessel part (X-103) is packed
# small-and-inside by the interior packer — so the GA (which reads the manifest)
# drew the vessel INSIDE while the render showed it ON TOP ("they don't look
# anything like each other"). SOURCE fix: seat the real vessel row's manifest
# position + dims from the on-top signature-mesh bbox, so manifest = render = GA
# (ONE vessel, on top). Universal: keyed on vessel-noun tokens + the u_se_le_vial
# mesh union, never a product-class slug. Update-in-place when the row exists
# (never additive-duplicate — that would double-count the vessel); additive from
# state only when the packer skipped it entirely.
_VESSEL_NOUN_RE = re.compile(
    r"\b(vial|culture\s+vessel|culture\s+chamber|bioreactor\s+vessel|"
    r"culture\s+flask|reaction\s+vessel|growth\s+vessel|culture\s+bottle)\b",
    re.I,
)
# A holder / cap / probe / fitting that merely MENTIONS the vessel is NOT the vessel.
_VESSEL_EXCLUDE_RE = re.compile(
    r"holder|fixture|probe|thermistor|sensor|\bcap\b|\blid\b|seal|septum|clamp|"
    r"collar|bracket|mount|gasket|o-ring|adapter|fitting|tubing|\bline\b|port|stir",
    re.I,
)
# The DRAWN vessel geometry the render actually shows — build_universal_scene unions
# the vessel cutaway-cue meshes (u_se_cutaway_cue_int_<slug>_{body,cap,neck}) and passes
# the bbox under this key. (The bare u_se_le_vial signature mesh is hidden/replaced by
# the universal pack, so the drawn vessel is the cutaway cue, NOT a u_se_le_* mesh.)
_VESSEL_MESH_PREFIX = "vessel_drawn"


def _find_vessel_row(rows: list[dict]) -> Optional[dict]:
    """The single real culture-vessel manifest row (vessel-noun, not a holder/probe)."""
    for r in rows:
        nm = str(r.get("name") or "")
        if _VESSEL_NOUN_RE.search(nm) and not _VESSEL_EXCLUDE_RE.search(nm):
            return r
    return None


def _vessel_seat_from_state(state: Optional[dict]) -> Optional[dict[str, str]]:
    """{tag, name} for the culture-vessel principal from the BoM (additive fallback)."""
    if not isinstance(state, dict):
        return None
    rb = ((state.get("requirementsBom") or {}).get("rows")
          or state.get("requirements_bom_rows") or [])
    for r in rb:
        if not isinstance(r, dict) or r.get("status") == "SUB-COMPONENT":
            continue
        name = str(r.get("requirement") or r.get("name") or "").strip()
        if name and _VESSEL_NOUN_RE.search(name) and not _VESSEL_EXCLUDE_RE.search(name):
            return {"tag": str(r.get("tag") or "").strip(), "name": name}
    return None


def _vessel_mesh_bbox(
    mesh_bbox_by_prefix: Optional[dict[str, tuple[float, float, float, float, float, float]]],
) -> Optional[tuple[float, float, float, float, float, float]]:
    """Union bbox of the on-top vessel signature meshes (vial + fluid fill + collar)."""
    if not mesh_bbox_by_prefix:
        return None
    acc: Optional[list[float]] = None
    for k, bb in mesh_bbox_by_prefix.items():
        if not (k == _VESSEL_MESH_PREFIX or k.startswith(_VESSEL_MESH_PREFIX)):
            continue
        if not bb:
            continue
        if acc is None:
            acc = list(bb)
        else:
            acc = [min(acc[0], bb[0]), max(acc[1], bb[1]),
                   min(acc[2], bb[2]), max(acc[3], bb[3]),
                   min(acc[4], bb[4]), max(acc[5], bb[5])]
    return tuple(acc) if acc is not None else None  # type: ignore[return-value]


def seat_vessel_on_top_from_mesh(
    rows: list[dict],
    state: Optional[dict] = None,
    mesh_bbox_by_prefix: Optional[
        dict[str, tuple[float, float, float, float, float, float]]
    ] = None,
) -> int:
    """Seat the real culture-vessel manifest row to the ON-TOP signature-mesh pose.

    @description Mutates `rows` in place so the vessel the render draws on top and the
    vessel the GA draws from the manifest are ONE object. Update-in-place when the
    vessel row exists (never a duplicate); additive from state only when the packer
    skipped the vessel entirely. Idempotent (no-op once seated to the same pose).
    @returns 1 when a vessel row is seated/updated, else 0.
    """
    if not isinstance(rows, list):
        return 0
    if not (isinstance(state, dict) and state.get("isInstrumentDevice")):
        return 0
    bb = _vessel_mesh_bbox(mesh_bbox_by_prefix)
    if not bb:
        return 0  # no on-top vessel signature (not a vial-bioreactor form) → no-op
    xmin, xmax, ymin, ymax, zmin, zmax = bb
    pos = [round((xmin + xmax) / 2.0, 1), round((ymin + ymax) / 2.0, 1),
           round((zmin + zmax) / 2.0, 1)]
    dims = {"w": round(max(1.0, xmax - xmin), 1),
            "d": round(max(1.0, ymax - ymin), 1),
            "h": round(max(1.0, zmax - zmin), 1)}
    row = _find_vessel_row(rows)
    if row is not None:
        if (row.get("geometry_source") == "vessel_seat_on_top_from_signature_mesh"
                and row.get("pos_mm") == pos):
            return 0  # idempotent
        row["pos_mm"] = pos
        row["dims_mm"] = dims
        row["geometry_source"] = "vessel_seat_on_top_from_signature_mesh"
        return 1
    # Additive: the packer skipped the vessel — create its row from the BoM identity.
    seat = _vessel_seat_from_state(state)
    if seat is None:
        return 0
    rows.append({
        "tag": _slug(seat["name"]),
        "equipment_tag": seat["tag"] or "",
        "name": seat["name"],
        "module": "culture_vessel",
        "shape": "instrument",
        "qty": 1,
        "region_rank": 50,
        "pos_mm": pos,
        "dims_mm": dims,
        "geometry_source": "vessel_seat_on_top_from_signature_mesh",
    })
    return 1


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

    # ── vessel-on-top seat proveCatch (Tristan 2026-07-25 vessel unification) ──
    vstate = {"isInstrumentDevice": True}
    vmesh = {  # drawn vessel cutaway-cue union: a tall vessel z ≈ 312→375, ~52 dia
        "vessel_drawn": (-26.0, 26.0, -26.0, 26.0, 312.0, 375.0),
    }
    # (a) UPDATE-in-place: the packed-small-inside vessel row moves on-top, big dims.
    vrows = [
        {"equipment_tag": "X-103", "name": "Borosilicate Culture Vial 20 ml",
         "pos_mm": [-47.5, -90.6, 338.0], "dims_mm": {"w": 2.9, "d": 2.9, "h": 6.1}},
        {"equipment_tag": "X-105", "name": "Vial Holder Fixture",
         "pos_mm": [-16.5, -38.6, 328.0], "dims_mm": {"w": 6.4, "d": 4.3, "h": 2.8}},
    ]
    nv = seat_vessel_on_top_from_mesh(vrows, vstate, mesh_bbox_by_prefix=vmesh)
    assert nv == 1, nv
    vx = next(r for r in vrows if r["equipment_tag"] == "X-103")
    assert vx["geometry_source"] == "vessel_seat_on_top_from_signature_mesh"
    assert vx["pos_mm"][2] >= 340.0, vx["pos_mm"]          # centred on the tall drawn vessel
    assert vx["dims_mm"]["w"] >= 40.0 and vx["dims_mm"]["h"] >= 50.0, vx["dims_mm"]  # real drawn size, not 2.9×6.1
    # the HOLDER must NOT be mistaken for the vessel (still at its packed pose)
    vh = next(r for r in vrows if r["equipment_tag"] == "X-105")
    assert vh["pos_mm"] == [-16.5, -38.6, 328.0], vh["pos_mm"]
    # idempotent
    assert seat_vessel_on_top_from_mesh(vrows, vstate, mesh_bbox_by_prefix=vmesh) == 0
    # (b) ADDITIVE: packer skipped the vessel → seat creates the row from BoM identity.
    arows = [{"equipment_tag": "X-105", "name": "Vial Holder Fixture",
              "pos_mm": [-16.5, -38.6, 328.0], "dims_mm": {"w": 6.4, "d": 4.3, "h": 2.8}}]
    astate = {"isInstrumentDevice": True, "requirementsBom": {"rows": [
        {"tag": "X-103", "requirement": "Borosilicate Culture Vial 20 ml"},
        {"tag": "X-105", "requirement": "Vial Holder Fixture"}]}}
    na = seat_vessel_on_top_from_mesh(arows, astate, mesh_bbox_by_prefix=vmesh)
    assert na == 1 and any(r.get("equipment_tag") == "X-103" for r in arows), arows
    # (c) no vessel mesh (non-vial form) → no-op
    assert seat_vessel_on_top_from_mesh(vrows, vstate, mesh_bbox_by_prefix={"u_se_cutaway_cue_ui_pcb": (0, 1, 0, 1, 0, 1)}) == 0
    print("instrument-spine-manifest _selftest: OK (donor seat + mesh seat + idempotent + vessel-on-top update/additive/holder-exclude)")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
        raise SystemExit(0)
    if len(sys.argv) < 2:
        raise SystemExit("usage: instrument-spine-manifest.py <run-dir> | --selftest")
    raise SystemExit(0 if reseat_run_manifest(Path(sys.argv[1])) >= 0 else 1)
