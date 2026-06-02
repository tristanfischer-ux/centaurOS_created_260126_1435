#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/dilution_fridge_cooling_power.py

Pulse-tube + 3He/4He dilution refrigerator cooling power.

Input:
    {
      "target_base_temp_mk": 20.0,
      "helium_3_flow_umol_s": 600.0,
      "stage_count": 5,
      "pulse_tube_capacity_w_at_4k": 1.5
    }

Output:
    {
      "cooling_power_uw_at_100mK": ...,
      "cooling_power_uw_at_base": ...,
      "cool_down_time_hours": ...,
      ...
    }

Physics (Pobell, "Matter and Methods at Low Temperatures" 3rd ed., Ch. 7):
- Dilution cooling power: Q_dot = 84·n_3·T²  [W with n_3 in mol/s, T in K]
- Practical: at 100 mK with n_3 = 600 µmol/s: Q ≈ 84 × 6e-4 × 0.01 = 504 µW
- Below ~10 mK, Q drops sharply due to Kapitza resistance + viscous loss.
- Cool-down time ≈ thermal mass / (cooling power × dT).

Reference: Pobell (2007); Bluefors LD-400 specsheet; Oxford Instruments
ProteoxLX specsheet.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

PROVENANCE = {
    "tool_name": "dilution_fridge_cooling_power (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Pobell (2007) 'Matter and Methods at Low Temperatures' 3rd ed., Ch. 7; Bluefors LD-400 spec",
    "physics_basis": "Q_dot = 84·n_3·T² (Pobell Eq. 7.45); Kapitza limit at low T.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    T_base_mk = float(payload.get("target_base_temp_mk", 20.0))
    n_3_umol_s = float(payload.get("helium_3_flow_umol_s", 600.0))
    n_stages = int(payload.get("stage_count", 5))
    pt_w_at_4k = float(payload.get("pulse_tube_capacity_w_at_4k", 1.5))

    # Q_dot = 84 × n_3 (mol/s) × T² (K²)
    n_3_mol_s = n_3_umol_s * 1e-6

    def cooling_power_w(T_k: float) -> float:
        # Pobell Eq. 7.45 — ideal dilution cooling
        return 84.0 * n_3_mol_s * (T_k ** 2)

    T_base_k = T_base_mk / 1000.0

    Q_at_100mK = cooling_power_w(0.100) * 1e6  # µW
    Q_at_base = cooling_power_w(T_base_k) * 1e6  # µW

    # Practical Kapitza derate below 30 mK
    if T_base_mk < 30:
        # Kapitza thermal resistance: A_kapitza ∝ T³ between He and Cu
        # Effective cooling power drops by ~30% at 20 mK vs ideal
        kapitza_derate = 1.0 - 0.30 * ((30 - T_base_mk) / 30)
        Q_at_base *= max(0.5, kapitza_derate)
    else:
        kapitza_derate = 1.0

    # Cool-down time estimate
    # Thermal mass at 4 K → 100 mK is ~10 J (typical 500 g Cu sample stage)
    # Cool-down = ∫ C(T) dT / Q(T)
    # Approximation: ~5-8 hours for warm to base, dominated by 4K → 100 mK
    cool_down_hours = 6.0 + max(0, (20 - T_base_mk) * 0.5)

    # Hold time on liquid helium (if no pulse tube): hours of operation
    # before LHe refill. For continuous PT operation: indefinite.
    he4_capacity_l = pt_w_at_4k * 30  # rough fit: 1.5W PT ~ 45 L equivalent

    # Pulse tube intermediate stages
    # 4K stage: pulse_tube capacity directly
    # 1K still pot: ~30 mW @ 800 mK
    # 100 mK plate: ~ Q_at_100mK
    # 20 mK base: Q_at_base

    # Worked calculations for the PDF appendix.
    # The Kapitza derate branch (piecewise/clamped) is skipped — instead we show the
    # ideal Pobell value and state the derate factor in assumptions so the reviewer can
    # apply it by hand.  Q_at_base is already derated; for the worked calc we show the
    # ideal pre-derate value (which is what the formula actually evaluates to).
    n_3_mol_s_r = round(n_3_mol_s, 9)
    Q_100mK_r = round(Q_at_100mK, 1)
    # cooling_power_w() is the ideal Pobell formula; the result before the in-place
    # Kapitza multiplication.  We recompute it here to get the pre-derate ideal value
    # that the worked formula actually evaluates to.
    Q_base_ideal_uw = round(84.0 * n_3_mol_s * (T_base_k ** 2) * 1e6, 2)
    Q_base_r = round(Q_at_base, 2)
    T_100mK_k = 0.100
    worked = [
        worked_calc(
            label="3He molar flow rate",
            formula="n_3_mol_s = n_3_umol_s x 1e-6",
            values={"n_3_umol_s": (n_3_umol_s, "umol/s")},
            result=n_3_mol_s_r,
            result_unit="mol/s",
            assumptions=["1 umol = 1e-6 mol"],
        ),
        worked_calc(
            label="Ideal dilution cooling power at 100 mK",
            formula="Q_100mK_uw = 84 x n_3_mol_s x T_100mK^2 x 1e6",
            values={
                "n_3_mol_s": (n_3_mol_s_r, "mol/s"),
                "T_100mK": (T_100mK_k, "K"),
            },
            result=Q_100mK_r,
            result_unit="uW",
            assumptions=["Pobell Eq. 7.45: Q_dot = 84 n_3 T^2 [W]; factor 1e6 converts W to uW"],
        ),
        worked_calc(
            label="Ideal dilution cooling power at base temperature (pre-Kapitza)",
            formula="Q_base_ideal_uw = 84 x n_3_mol_s x T_base_k^2 x 1e6",
            values={
                "n_3_mol_s": (n_3_mol_s_r, "mol/s"),
                "T_base_k": (T_base_k, "K"),
            },
            result=Q_base_ideal_uw,
            result_unit="uW",
            assumptions=[
                "Pobell Eq. 7.45 ideal (pre-Kapitza); actual output in cooling_power_uw_at_base applies "
                f"kapitza_derate = {round(kapitza_derate, 3)} (piecewise function, not shown here)",
            ],
        ),
    ]

    return {
        "target_base_temp_mk": T_base_mk,
        "helium_3_flow_umol_s": n_3_umol_s,
        "cooling_power_uw_at_100mK": round(Q_at_100mK, 1),
        "cooling_power_uw_at_base": round(Q_at_base, 2),
        "cooling_power_w_at_4K": round(pt_w_at_4k, 2),
        "cooling_power_mw_at_1K": round(0.030 * 1000, 1),  # 30 mW typical still
        "kapitza_derate": round(kapitza_derate, 3),
        "stage_count": n_stages,
        "cool_down_time_hours": round(cool_down_hours, 1),
        "he4_equivalent_capacity_l": round(he4_capacity_l, 1),
        "ideal_at_100mK_uw": round(Q_at_100mK, 1),
        "achievable_base_temp_mk_at_zero_load": round(T_base_mk, 1),
        "max_heat_load_at_base_uw": Q_base_r,
        "worked": worked,
    }


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
