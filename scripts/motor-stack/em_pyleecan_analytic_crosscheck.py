#!/usr/bin/env python3
"""INDEPENDENT analytical torque cross-check from the pyleecan machine model.

INTENT (Tristan 2026-08-01): "why don't you just do the pyleecan end-to-end
straight away for the cross check?"

WHY IT IS ANALYTICAL, NOT FE. pyleecan's magnetic solvers are `MagFEMM` (needs
the WINDOWS FEMM binary via Wine) and `MagElmer` (needs Elmer). Neither is on
this machine — no wine, no femm, no Elmer — so the FE route through pyleecan is
closed here. That is not a loss: an independent FE solve would still share the
same torque-integration assumptions. The ANALYTICAL route is the stronger check
because it derives torque from the machine's FLUX LINKAGE, which is measurable
independently and which the xfemm deck already reports as back-EMF.

THE CHECK — two routes to the same number, from the same machine:
  A. PM torque from the design:   T = 1.5 * p * lambda_pm * Iq
       lambda_pm = kw1 * N_series_per_phase * flux_per_pole
       flux_per_pole = B_gap_avg * pole_area
  B. PM torque from the MEASURED back-EMF (the xfemm deck's own output):
       lambda_pm = E_peak_per_phase / omega_e
  If A and B disagree, the winding/flux model is inconsistent. If BOTH exceed the
  FE torque integral, the torque integration is the fault.

This is exactly the contradiction Grok 4.5 and Sol independently flagged: the
deck's back-EMF of 324.1 V l-l rms implies ~131 N.m at 477 A rms while the deck
reported 93.6 N.m.

Winding data (turns, parallel paths, layout, winding factor) comes from pyleecan
+ swat_em — the solved layout, not a hand-written belt map.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MATERIAL_MACHINE_PATH = (
    REPO_ROOT / "assets" / "edu-training-cad" / "pyleecan-ipmsm-b" / "IPMSM_B.json"
)
MU0 = 4.0e-7 * math.pi


def _numpy2_compat() -> None:
    import numpy as _np
    for old, new in (("string_", "bytes_"), ("unicode_", "str_"),
                     ("float_", "float64"), ("complex_", "complex128")):
        if not hasattr(_np, old) and hasattr(_np, new):
            setattr(_np, old, getattr(_np, new))


def _num(q: dict, *keys: str, default=None):
    for k in keys:
        raw = q.get(k)
        if raw is None:
            continue
        v = raw.get("value") if isinstance(raw, dict) else raw
        try:
            f = float(v)
        except (TypeError, ValueError):
            continue
        if math.isfinite(f):
            return f
    return default


def _flux_focusing_ratio(quantities: dict) -> float:
    """A_m/A_g for the V-magnet pair, from the SOLVED geometry.

    Derived from the same `derive_fia_geometry` the FE deck builds from, so the
    analytic route and the FE route describe ONE machine. Never a typed
    constant — a hardcoded focusing ratio would silently stop tracking the
    geometry the moment the rotor is resized, which is exactly the failure this
    module exists to detect.
    """
    import sys as _sys
    _sys.path.insert(0, str(REPO_ROOT / "scripts" / "motor-stack"))
    import em_fia_front_kit_case as _m  # noqa: PLC0415

    geometry = _m.derive_fia_geometry(_m.inputs_from_sections(quantities, {}))
    tilt = math.radians(20.0)
    r_ro = geometry.rotor_outer_diameter_mm / 2.0
    half = (geometry.magnet_length_mm / 2.0 * math.sin(tilt)
            + geometry.magnet_thickness_mm / 2.0 * math.cos(tilt))
    r_mag = r_ro - _m.MAGNET_ROTOR_BRIDGE_MM - half
    pole_pitch_mm = 2.0 * math.pi * r_mag / _m.ROTOR_POLES
    face_mm = 2.0 * geometry.magnet_length_mm * math.cos(tilt)
    return face_mm / pole_pitch_mm


def crosscheck(twin: Path) -> dict:
    _numpy2_compat()
    from pyleecan.Functions.load import load
    from swat_em import datamodel

    state = json.loads((twin / "state.json").read_text())
    q = (state.get("orchestratorContract") or {}).get("quantities") or {}

    machine = load(str(MATERIAL_MACHINE_PATH))
    p = int(machine.rotor.get_pole_pair_number())
    poles = 2 * p
    Br = float(machine.rotor.hole[0].magnet_0.mat_type.mag.Brm20)
    mur = float(machine.rotor.hole[0].magnet_0.mat_type.mag.mur_lin)

    # ── Machine bound to the twin ───────────────────────────────────────────
    Zs = int(_num(q, "stator_slots", default=24))
    rotor_od_mm = _num(q, "fpk_rotor_od_mm", "rotor_airgap_diameter_mm", default=139.4)
    stack_mm = _num(q, "stack_length_mm", default=97.58)
    turns_phase = _num(q, "turns_per_phase", default=14.0)
    I_rms = _num(q, "phase_current_design_a", default=477.0)
    rpm = _num(q, "max_rotor_speed_rpm", default=19500.0)
    airgap_mm = 0.7
    magnet_th_mm = _num(q, "magnet_thickness_mm", default=6.0)

    # ── Winding factor from the SOLVED layout ───────────────────────────────
    wdg = datamodel()
    wdg.set_machinedata(Q=Zs, p=p, m=3)
    wdg.genwdg(Q=Zs, P=poles, m=3, layers=1, turns=1)
    kw1 = float(wdg.get_windingfactor_el()[0][0])
    symmetric = bool(wdg.get_is_symmetric())

    # ── Airgap flux density (magnet operating point, 1-D) ───────────────────
    # SOURCE BUG FIXED 2026-08-01. This previously read
    #     B_gap_pk = Br * (t_m / (t_m + mur*g_eff))
    # which is the operating point of a magnet whose FACE FILLS THE WHOLE POLE.
    # It omits the FLUX-FOCUSING RATIO A_m/A_g, and on an IPM whose magnet
    # covers only part of the pole that overstates airgap flux by 1/focus.
    #
    # The correct pair (see scripts/lib/fpk_magnet_flux_focusing.py):
    #     B_m   = Br / (1 + mur * g_eff * (A_m/A_g) / t_m)     magnet operating point
    #     B_gap = B_m * (A_m/A_g)                              what crosses the gap
    #
    # WHY THIS MATTERED. The omission inflated route A by 1.72x and produced the
    # headline "DESIGN flux linkage and MEASURED back-EMF disagree by 1.64x --
    # the winding/flux model is internally inconsistent". There was no winding
    # inconsistency: the 1.64x WAS the missing focusing ratio. With it included,
    # design lambda_pm 0.0309 Wb vs measured 0.0324 Wb -- agreement to 4.6% --
    # and route A falls 215.01 -> ~125 N.m, converging with route B's 131.11.
    g_eff = airgap_mm
    focus = _flux_focusing_ratio(q)
    B_m = Br / (1.0 + mur * g_eff * focus / magnet_th_mm)
    B_gap_pk = B_m * focus
    # Pole area at the airgap.
    D_gap = (rotor_od_mm + 2.0 * airgap_mm) * 1e-3
    L = stack_mm * 1e-3
    pole_area = math.pi * D_gap * L / poles
    # Fundamental of a square-ish pole wave, alpha_i ~ 2/pi for the peak-to-mean.
    flux_per_pole = (2.0 / math.pi) * B_gap_pk * pole_area

    lambda_pm_design = kw1 * turns_phase * flux_per_pole

    # ── Route A: torque from the DESIGN flux linkage ────────────────────────
    Iq_pk = I_rms * math.sqrt(2.0)
    T_design = 1.5 * p * lambda_pm_design * Iq_pk

    # ── Route B: torque from the MEASURED back-EMF (xfemm deck output) ──────
    fw_path = twin / "_motor_stack" / "em_fia_voltage_fw_screen.json"
    T_backemf = None
    E_ll_rms = None
    lambda_pm_meas = None
    if fw_path.exists():
        fw = json.loads(fw_path.read_text())

        def _find(o, *names):
            if isinstance(o, dict):
                for k, v in o.items():
                    if k in names and isinstance(v, (int, float)):
                        return float(v)
                    r = _find(v, *names)
                    if r is not None:
                        return r
            elif isinstance(o, list):
                for i in o:
                    r = _find(i, *names)
                    if r is not None:
                        return r
            return None

        E_ll_rms = _find(fw, "estimated_back_emf_line_line_rms_v",
                         "back_emf_line_line_rms_v", "open_circuit_line_line_rms_v")
        if E_ll_rms:
            omega_e = rpm * 2.0 * math.pi / 60.0 * p
            E_ph_pk = (E_ll_rms / math.sqrt(3.0)) * math.sqrt(2.0)
            lambda_pm_meas = E_ph_pk / omega_e
            T_backemf = 1.5 * p * lambda_pm_meas * Iq_pk

    # ── The FE deck's own answer ────────────────────────────────────────────
    fe_path = twin / "_motor_stack" / "em_fia_front_kit_case.json"
    T_fe = required = None
    if fe_path.exists():
        fe = json.loads(fe_path.read_text())
        w = fe.get("works_in_kit_context") or {}
        T_fe = w.get("torque_magnitude_mean_nm")
        required = w.get("required_shaft_torque_nm")

    return {
        "schema": "forgeos.motor_stack.em_pyleecan_analytic_crosscheck/v1",
        "machine": {
            "stator_slots": Zs, "rotor_poles": poles, "pole_pairs": p,
            "winding_factor_kw1": round(kw1, 5),
            "winding_symmetric": symmetric,
            "turns_per_phase": turns_phase,
            "rotor_od_mm": rotor_od_mm, "stack_mm": stack_mm,
            "magnet_Br_T": round(Br, 4), "magnet_mur": round(mur, 4),
            "magnet_thickness_mm": magnet_th_mm,
        },
        "flux": {
            "B_gap_peak_T": round(B_gap_pk, 4),
            "flux_focusing_ratio_Am_over_Ag": round(focus, 4),
            "magnet_operating_flux_T": round(B_m, 4),
            "pole_area_m2": round(pole_area, 6),
            "flux_per_pole_Wb": round(flux_per_pole, 6),
            "lambda_pm_design_Wb": round(lambda_pm_design, 6),
            "lambda_pm_from_back_emf_Wb": (round(lambda_pm_meas, 6)
                                           if lambda_pm_meas else None),
            "back_emf_line_line_rms_v": E_ll_rms,
        },
        "torque_nm": {
            "route_A_design_flux": round(T_design, 2),
            "route_B_measured_back_emf": (round(T_backemf, 2) if T_backemf else None),
            "fe_deck_mean": T_fe,
            "required": required,
        },
        "verdict": _verdict(T_design, T_backemf, T_fe, required),
    }


def _verdict(T_a, T_b, T_fe, required) -> dict:
    out = {"notes": []}
    if T_a and T_b:
        r = T_a / T_b
        out["design_vs_backemf_ratio"] = round(r, 3)
        if not (0.7 <= r <= 1.4):
            out["notes"].append(
                f"DESIGN flux linkage and MEASURED back-EMF disagree by {r:.2f}x — "
                "the winding/flux model is internally inconsistent")
        else:
            out["notes"].append(
                f"design and measured flux linkage agree within {r:.2f}x")
    if T_fe and T_b:
        r = T_b / T_fe
        out["backemf_vs_fe_ratio"] = round(r, 3)
        if r > 1.3:
            out["notes"].append(
                f"the deck's OWN back-EMF implies {r:.2f}x the torque its FE "
                "integral reports — the torque integration is the suspect, not "
                "the machine")
    if T_fe and required:
        out["fe_vs_required"] = round(T_fe / required, 4)
    if T_b and required:
        out["backemf_vs_required"] = round(T_b / required, 4)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, required=True)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()
    res = crosscheck(args.twin.resolve())
    out = args.output or (args.twin / "_motor_stack"
                          / "em_pyleecan_analytic_crosscheck.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=2))
    m, f, t, v = res["machine"], res["flux"], res["torque_nm"], res["verdict"]
    print(f"machine : Zs={m['stator_slots']} 2p={m['rotor_poles']} kw1={m['winding_factor_kw1']} "
          f"symmetric={m['winding_symmetric']} Nph={m['turns_per_phase']:g}")
    print(f"flux    : B_gap_pk={f['B_gap_peak_T']} T  flux/pole={f['flux_per_pole_Wb']} Wb  "
          f"lambda_pm design={f['lambda_pm_design_Wb']} / back-EMF={f['lambda_pm_from_back_emf_Wb']}")
    print(f"TORQUE  : A(design flux)={t['route_A_design_flux']}  "
          f"B(measured back-EMF)={t['route_B_measured_back_emf']}  "
          f"FE deck={t['fe_deck_mean']}  required={t['required']}")
    for n in v["notes"]:
        print(f"  -> {n}")
    print(f"Artefact: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
