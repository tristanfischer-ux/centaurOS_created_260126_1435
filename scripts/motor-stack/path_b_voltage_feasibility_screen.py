#!/usr/bin/env python3
"""Path B electrical feasibility at 24k / −30° vs 600–900 V bus (W4.1-lite).

Sol (Terminal start council): nothing had checked the Path B −30° kit-case
operating point against the twin DC bus window at 24,000 rpm, where speed is
1.231× the prior 19,500 rpm screen. This screen fills that gap with the SAME
analytical voltage model as em_fia_voltage_fw_screen.py, bound to Path B
geometry + Path B OC FEMM B_rms — not a re-solve of MTPA, not FW calibration.

ship_ok stays false. Bar A stays open: voltage_limit is analytical only;
torque_reliable remains false independently.
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO / "out" / "formula-e-front-mgu-20260729-1432"
PATH_B = "em_fia_front_kit_case_PATH_B_DEC009.json"
POLE_PAIRS = 4
WINDING_FACTOR = 0.96
POWER_FACTOR_SCREEN = 0.95
CONTROL_RESERVE = 0.95
LEGACY_SCREEN_RPM = 19500.0


def _iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def available_ll_rms(v_dc: float) -> float:
    return v_dc * math.sqrt(3.0) / (2.0 * math.sqrt(2.0))


def usable_ll_rms(v_dc: float) -> float:
    return available_ll_rms(v_dc) * CONTROL_RESERVE


def pm_flux_from_oc_b(
    b_rms: float,
    turns_per_phase: float,
    active_length_mm: float,
    rotor_od_mm: float,
    stator_id_mm: float,
) -> tuple[float, float]:
    r_g = (rotor_od_mm + stator_id_mm) / 4000.0
    L = active_length_mm / 1000.0
    phi_pk = 2.0 * math.sqrt(2.0) * b_rms * r_g * L / POLE_PAIRS
    lam_pk = WINDING_FACTOR * turns_per_phase * phi_pk
    return phi_pk, lam_pk


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    args = ap.parse_args()
    twin = args.twin.resolve()
    ms = twin / "_motor_stack"
    pb = json.loads((ms / PATH_B).read_text())
    iq = pb.get("input_quantities") or {}
    geo = pb.get("machine_geometry") or {}
    fe = pb.get("finite_element_point") or {}
    loaded = pb.get("loaded_point") or {}
    wik = pb.get("works_in_kit_context") or {}

    b_rms = float(fe.get("rms_airgap_flux_density_t") or 0.0)
    if b_rms <= 0:
        print(json.dumps({"error": "missing Path B OC rms airgap B", "ship_ok": False}))
        return 2

    turns = float(iq.get("turns_per_phase") or 14.0)
    stack = float(geo.get("active_length_mm") or iq.get("active_length_mm") or 130.0)
    rotor_od = float(geo.get("rotor_outer_diameter_mm") or 139.4)
    stator_id = float(geo.get("stator_inner_diameter_mm") or 140.8)
    rpm = float(iq.get("max_rotor_speed_rpm") or 24000.0)
    i_rms = float(iq.get("phase_current_design_a") or 535.0)
    p_kw = float(iq.get("continuous_electrical_power_kw") or 250.0)
    eta_inv = float(iq.get("inverter_efficiency_assumption") or 0.98766)
    v_nom = float(iq.get("dc_bus_voltage_v") or 750.0)
    v_min = float(iq.get("dc_bus_min_voltage_v") or 600.0)
    v_max = float(iq.get("dc_bus_max_voltage_v") or 900.0)

    phi_pk, lam_pk = pm_flux_from_oc_b(b_rms, turns, stack, rotor_od, stator_id)
    f_e = rpm * POLE_PAIRS / 60.0
    w_e = 2.0 * math.pi * f_e
    e_ph_rms = w_e * lam_pk / math.sqrt(2.0)
    e_ll_rms = math.sqrt(3.0) * e_ph_rms
    # Loaded terminal estimate (same as voltage_fw_screen) — power/current/PF
    v_loaded_ll = p_kw * 1000.0 / eta_inv / (math.sqrt(3.0) * i_rms * POWER_FACTOR_SCREEN)

    speed_ratio_vs_legacy = rpm / LEGACY_SCREEN_RPM
    angle = loaded.get("current_angle_electrical_deg")
    # find -30 in sweep if present
    for row in loaded.get("current_angle_sweep") or []:
        if abs(float(row.get("current_angle_electrical_deg") or 99) - (-30.0)) < 0.1:
            angle = -30.0
            break

    bus_cases = []
    for v_dc in (v_min, v_nom, v_max):
        avail = available_ll_rms(v_dc)
        usable = usable_ll_rms(v_dc)
        bemf_u = e_ll_rms / usable if usable > 0 else float("inf")
        load_u = v_loaded_ll / usable if usable > 0 else float("inf")
        ctrl = max(bemf_u, load_u)
        bus_cases.append(
            {
                "dc_bus_voltage_v": v_dc,
                "available_line_line_rms_voltage_v": round(avail, 3),
                "usable_line_line_rms_voltage_v_with_reserve": round(usable, 3),
                "estimated_back_emf_line_line_rms_v": round(e_ll_rms, 3),
                "estimated_loaded_terminal_line_line_rms_v": round(v_loaded_ll, 3),
                "back_emf_voltage_utilisation": round(bemf_u, 4),
                "loaded_voltage_utilisation": round(load_u, 4),
                "controlling_voltage_utilisation": round(ctrl, 4),
                "voltage_headroom": round(1.0 - ctrl, 4),
                "field_weakening_indicated": bool(bemf_u > 0.95 or load_u > 0.95),
                "within_usable_ceiling": bool(ctrl <= 1.0),
            }
        )

    worst = max(bus_cases, key=lambda r: r["controlling_voltage_utilisation"])
    # Analytical screen OK only if ALL bus corners fit usable ceiling
    all_fit = all(c["within_usable_ceiling"] for c in bus_cases)
    # Nom bus is the design point Jack will read first
    nom = next(c for c in bus_cases if c["dc_bus_voltage_v"] == v_nom)

    # MTPA coverage honesty from DEC009 MTPA artefact if present
    mtpa_cov = {}
    mtpa_path = ms / "em_fia_mtpa_screen_DEC009.json"
    if mtpa_path.is_file():
        mtpa = json.loads(mtpa_path.read_text())
        mtpa_cov = (mtpa.get("coverage") or {})

    rep = {
        "schema": "forgeos.fpk.path_b_voltage_feasibility_screen/v1",
        "status": "PARTIAL_ANALYTICAL_SCREEN",
        "ship_ok": False,
        "ran_at": _iso(),
        "operating_point": {
            "label": "Path B DEC-009 kit-case OP",
            "speed_rpm": rpm,
            "speed_ratio_vs_legacy_19500": round(speed_ratio_vs_legacy, 4),
            "speed_ratio_note": "24000/19500 = 1.2308 — Sol's 1.231× back-EMF scale factor",
            "current_angle_electrical_deg": angle if angle is not None else -30.0,
            "current_angle_note": (
                loaded.get("current_angle_assumption")
                or "Screened regenerative angle near kit torque peak; not a solved MTPA schedule"
            ),
            "phase_current_rms_a": i_rms,
            "electrical_power_kw": p_kw,
            "path_b_mean_torque_nm": wik.get("torque_magnitude_mean_nm"),
            "architecture_duty_nm": wik.get("required_shaft_torque_nm"),
        },
        "geometry_binding": {
            "active_length_mm": stack,
            "magnet_thickness_mm": geo.get("magnet_thickness_mm"),
            "magnet_length_mm": geo.get("magnet_length_mm"),
            "source": PATH_B,
        },
        "open_circuit_evidence": {
            "source": f"{PATH_B}#finite_element_point",
            "kind": fe.get("kind"),
            "rms_airgap_flux_density_t": b_rms,
            "peak_airgap_flux_density_t": fe.get("peak_airgap_flux_density_t"),
        },
        "derived": {
            "pole_flux_peak_wb": round(phi_pk, 6),
            "pm_phase_flux_linkage_peak_wb": round(lam_pk, 6),
            "electrical_frequency_hz": round(f_e, 3),
            "formula_available_ll": "Vdc·√3/(2√2)",
            "formula_loaded_ll": "Pdc/(ηinv·√3·Irms·PF), PF=0.95",
            "model_same_as": "scripts/motor-stack/em_fia_voltage_fw_screen.py",
        },
        "bus_cases": bus_cases,
        "headline": {
            "nominal_bus_v": v_nom,
            "controlling_utilisation_at_nominal": nom["controlling_voltage_utilisation"],
            "worst_bus_v": worst["dc_bus_voltage_v"],
            "worst_controlling_utilisation": worst["controlling_voltage_utilisation"],
            "all_bus_corners_within_usable_ceiling": all_fit,
            "analytical_voltage_screen_ok": all_fit,
        },
        "prior_screen_honesty": {
            "em_fia_voltage_fw_screen_json": "EXISTS but bound to pre-DEC-009 19.5k / 97.58 mm / 8.85 mm magnet lineage — do not quote as Path B 24k proof",
            "mtpa_dec009_voltage_limit_evaluated": mtpa_cov.get("voltage_limit_evaluated"),
            "mtpa_dec009_note": (
                "em_fia_mtpa_screen_DEC009 coverage.voltage_limit_evaluated is false — "
                "angle sweep is torque-only FEMM, not a voltage-circle check."
            ),
        },
        "bar_a_implication": {
            "closes_bar_a": False,
            "reason": (
                "Analytical voltage ceiling screen only. No Rs/Ld/Lq vector, no saturated "
                "dq map, no PWM overmodulation, no dyno. torque_reliable remains false "
                "independently. Bar A stays open."
            ),
        },
        "explicitly_not_claimed": [
            "field_weakening_schedule",
            "MTPA_solved",
            "voltage_circle_closed",
            "dyno_correlation",
            "torque_reliable",
            "ship_ok",
            "Bar_A_close",
        ],
        "release_statement": (
            "Path B–bound analytical voltage feasibility at 24k rpm vs 600–900 V bus. "
            "Same model as voltage_fw_screen, Path B OC B + 130 mm stack. "
            "Not release. ship_ok false. Bar A open."
        ),
    }
    out = ms / "path_b_voltage_feasibility_screen.json"
    out.write_text(json.dumps(rep, indent=2) + "\n")
    print(
        json.dumps(
            {
                "wrote": str(out),
                "speed_ratio_vs_19500": speed_ratio_vs_legacy,
                "e_ll_rms_v": round(e_ll_rms, 2),
                "v_loaded_ll_v": round(v_loaded_ll, 2),
                "util_at_750": nom["controlling_voltage_utilisation"],
                "util_at_600": next(c["controlling_voltage_utilisation"] for c in bus_cases if c["dc_bus_voltage_v"] == 600),
                "all_fit": all_fit,
                "ship_ok": False,
                "closes_bar_a": False,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
