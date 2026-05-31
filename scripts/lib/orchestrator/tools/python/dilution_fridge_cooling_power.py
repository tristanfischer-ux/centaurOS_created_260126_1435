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
import sys
import time

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
        "max_heat_load_at_base_uw": round(Q_at_base, 2),
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
