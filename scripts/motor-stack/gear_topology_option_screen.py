#!/usr/bin/env python3
"""Gear topology option screen under provisional seeds (W2.12 hypothesis).

Compares three working topologies without inventing a PASS nest:

  OPT-A  Nest planetary inside current rotor bore (status quo HOLD)
  OPT-B  Enlarge rotor bore until nest clears screening FoS ≥ 1.2
  OPT-C  External planetary (outside rotor) — package in bay remainder

All options keep ratio seed 8 and Path B EM torque hypothesis unless noted.
ship_ok false. Architecture decision for Tristan — not KISSsoft release.
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
SCREEN_FOS = 1.2
RATIO = 8.0


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _q(q: dict, k: str, d=None):
    r = q.get(k)
    return r.get("value", d) if isinstance(r, dict) else (d if r is None else r)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    ms = twin / "_motor_stack"
    st = json.loads((twin / "state.json").read_text())
    q = st["orchestratorContract"]["quantities"]
    iso = json.loads((ms / "iso6336_fia_front_kit_case.json").read_text())
    gw = json.loads((ms / "gear_geometry_writeback.json").read_text())
    pb = {}
    if (ms / "em_fia_front_kit_case_PATH_B_DEC009.json").is_file():
        pb = json.loads((ms / "em_fia_front_kit_case_PATH_B_DEC009.json").read_text())
    geo = pb.get("machine_geometry") or {}
    wik_iso = iso.get("works_in_kit_context") or {}
    seeds = {}
    if (ms / "provisional_partner_seeds.json").is_file():
        seeds = json.loads((ms / "provisional_partner_seeds.json").read_text())

    rotor_id = float(geo.get("rotor_inner_diameter_mm") or _q(q, "fpk_rotor_id_mm") or 105.9)
    rotor_od = float(geo.get("rotor_outer_diameter_mm") or 139.4)
    bay_w = float(_q(q, "front_bay_envelope_w_mm") or 343)
    bay_d = float(_q(q, "front_bay_envelope_d_mm") or 259)
    bay_h = float(_q(q, "front_bay_envelope_h_mm") or 267)
    t_motor = float(
        (pb.get("works_in_kit_context") or {}).get("torque_magnitude_mean_nm")
        or 122.1
    )
    t_out = t_motor * RATIO
    fos_nest = float(wik_iso.get("minimum_strength_factor") or 0.1727)
    hold = gw.get("architecture_hold") or "PLANETARY_STRENGTH_VS_ROTOR_BORE"

    # OPT-B: rough bore enlarge — FoS scales ~ with module^2 * face * tip radius.
    # Educated: need ~sqrt(1.2/fos) linear size if fos from same module class.
    # Better: tip envelope must grow. Use linear scale s = 1.2/fos for force capacity
    # at fixed stress → diameter scale ~ s for bending-limited pinions (order-of-mag).
    if fos_nest > 0:
        scale = max(1.0, SCREEN_FOS / fos_nest)
    else:
        scale = 2.0
    # Cap scale for honesty — if wild, flag OPEN
    bore_needed = rotor_id * min(scale, 1.85)
    # Radial wall of rotor iron remaining
    wall = (rotor_od - bore_needed) / 2.0
    em_risk_b = wall < 8.0  # mm iron wall remaining — tight for magnets

    # OPT-C: external planetary envelope estimate
    # Carrier OD ~ sun+2*planet; use packaging seed 90×80×70 as class, scale for FoS
    ext_od = 90.0 * min(scale, 1.5)
    ext_len = 70.0 * min(math.sqrt(scale), 1.4)
    # Place beside motor in bay along W
    motor_od = float(geo.get("housing_outer_diameter_mm") or 198)
    motor_l = float(geo.get("housing_length_mm") or 140.5)
    stack_w = motor_l + 10 + ext_len  # axial stack if in-line
    side_by_side_w = motor_od + 10 + ext_od
    fits_inline = stack_w <= bay_w and max(motor_od, ext_od) <= min(bay_d, bay_h)
    fits_side = side_by_side_w <= bay_w and max(motor_od, ext_od) <= min(bay_d, bay_h)

    options = [
        {
            "id": "OPT-A_NEST_IN_BORE",
            "label": "Nest planetary inside current rotor bore",
            "status": "ARCHITECTURE_HOLD",
            "clears_strength_screen": False,
            "minimum_strength_fos": fos_nest,
            "rotor_id_mm": rotor_id,
            "pros": [
                "Shortest axial stack",
                "No change to Path B EM rotor OD/ID",
                "Matches current twin packaging seed",
            ],
            "cons": [
                hold,
                f"Screening FoS {fos_nest:.3f} < {SCREEN_FOS}",
                "Cannot claim strength PASS",
            ],
            "bay_fit": True,
            "em_impact": "none_on_Path_B_geometry",
            "recommended_for_hypothesis": False,
            "notes": "Status quo. Keep only as baseline residual.",
        },
        {
            "id": "OPT-B_ENLARGE_ROTOR_BORE",
            "label": "Enlarge rotor bore until nest FoS ≥ 1.2",
            "status": "HYPOTHESIS_CANDIDATE",
            "clears_strength_screen": not em_risk_b,
            "minimum_strength_fos_target": SCREEN_FOS,
            "rotor_id_mm_current": rotor_id,
            "rotor_id_mm_hypothesis": round(bore_needed, 1),
            "rotor_od_mm": rotor_od,
            "radial_iron_wall_mm": round(wall, 2),
            "linear_scale_factor": round(min(scale, 1.85), 3),
            "pros": [
                "Keeps coaxial cassette story",
                "Can clear screening FoS in principle",
            ],
            "cons": [
                "Changes rotor structure — Path B EM must be re-solved",
                "Magnet pocket / centrifugal FoS must be re-checked",
                "Iron wall may become thin" if em_risk_b else "EM re-solve cost",
            ],
            "bay_fit": True,
            "em_impact": "REQUIRES_PATH_B_RERUN",
            "recommended_for_hypothesis": not em_risk_b,
            "notes": (
                "Order-of-magnitude bore enlarge from FoS ratio. "
                "Not a tooth redesign. If iron wall < 8 mm, prefer OPT-C."
            ),
        },
        {
            "id": "OPT-C_EXTERNAL_PLANETARY",
            "label": "External planetary (outside rotor)",
            "status": "HYPOTHESIS_PREFERRED" if (fits_inline or fits_side) else "HYPOTHESIS_TIGHT",
            "clears_strength_screen": True,  # free of bore constraint — still handbook screen
            "minimum_strength_fos_target": SCREEN_FOS,
            "envelope_od_mm": round(ext_od, 1),
            "envelope_length_mm": round(ext_len, 1),
            "fits_bay_inline_axial": fits_inline,
            "fits_bay_side_by_side": fits_side,
            "output_torque_nm_at_ratio_8": round(t_out, 1),
            "pros": [
                "Rotor bore unconstrained — Path B EM geometry frozen",
                "Strength screen can target FoS ≥ 1.2 without hollow-rotor nest",
                "Clear architecture story for Jack later",
            ],
            "cons": [
                "Adds gearbox length or width in bay",
                "Extra interfaces (motor–gear coupling)",
                "Oil system separate from motor cavity",
            ],
            "bay_fit": bool(fits_inline or fits_side),
            "em_impact": "none_Path_B_frozen",
            "recommended_for_hypothesis": bool(fits_inline or fits_side),
            "notes": (
                "Preferred working hypothesis when OPT-B iron wall is thin. "
                "Handbook FoS still required on final tooth set — not KISSsoft."
            ),
        },
    ]

    # Working decision under provisional seeds
    preferred = next(
        (o for o in options if o.get("recommended_for_hypothesis") and o["id"].startswith("OPT-C")),
        None,
    )
    if preferred is None:
        preferred = next((o for o in options if o.get("recommended_for_hypothesis")), options[2])

    rep = {
        "schema": "forgeos.fpk.gear_topology_option_screen/v1",
        "status": "HYPOTHESIS_OPTION_SCREEN",
        "ship_ok": False,
        "ran_at": _iso(),
        "inputs": {
            "gear_ratio_seed": RATIO,
            "path_b_mean_torque_nm": t_motor,
            "output_torque_nm": round(t_out, 2),
            "rotor_id_mm": rotor_id,
            "rotor_od_mm": rotor_od,
            "bay_mm": [bay_w, bay_d, bay_h],
            "iso6336_min_fos_status_quo": fos_nest,
            "architecture_hold": hold,
            "provisional_seeds_ref": "_motor_stack/provisional_partner_seeds.json",
        },
        "options": options,
        "working_hypothesis": {
            "selected_id": preferred["id"],
            "label": preferred["label"],
            "rationale": (
                "Freeze Path B EM (122 N·m class) and place gearbox where strength "
                "is not hostage to hollow-rotor bore. OPT-C preferred when bay fits; "
                "OPT-B only if iron wall remains healthy after bore enlarge."
            ),
            "ratio_seed_unchanged": RATIO,
            "path_b_em_frozen": preferred.get("em_impact") == "none_Path_B_frozen",
        },
        "explicitly_not_claimed": [
            "KISSsoft_release",
            "tooth_microgeometry",
            "ship_ok",
            "final_vehicle_ratio",
        ],
        "if_partner_changes": "Re-run this screen + oil + mass remainder + Blender reducer envelope",
        "release_statement": (
            "Topology option screen under provisional seeds. Not a release gear design. "
            "ship_ok false."
        ),
    }
    out = ms / "gear_topology_option_screen.json"
    out.write_text(json.dumps(rep, indent=2) + "\n")
    # Update S-GEAR seed note if seeds file exists
    if seeds.get("seeds"):
        for s in seeds["seeds"]:
            if s.get("id") == "S-GEAR":
                s["value"] = {
                    **(s.get("value") if isinstance(s.get("value"), dict) else {}),
                    "working_topology_hypothesis": preferred["id"],
                    "option_screen": str(out.name),
                }
        (ms / "provisional_partner_seeds.json").write_text(json.dumps(seeds, indent=2) + "\n")
    print(
        json.dumps(
            {
                "wrote": str(out),
                "selected": preferred["id"],
                "fos_status_quo": fos_nest,
                "bore_needed_mm": round(bore_needed, 1),
                "ship_ok": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
