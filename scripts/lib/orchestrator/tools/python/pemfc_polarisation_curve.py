#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pemfc_polarisation_curve.py

PEM fuel cell polarisation curve (voltage vs current density).

Input:
    {
      "temperature_c": 80,
      "pressure_bar": 2.5,
      "humidity_pct": 100,
      "platinum_loading_mg_cm2": 0.4
    }

Output:
    {
      "peak_power_density_w_cm2": ...,
      "voltage_at_peak_efficiency": ...,
      "current_density_at_peak_power_a_cm2": ...,
      ...
    }

Physics (Larminie & Dicks "Fuel Cell Systems Explained" 2nd ed., Ch. 3):
  V(i) = E_OCV - V_activation - V_ohmic - V_concentration
  V_act = (RT / αF) × ln(i / i_0)       [Tafel]
  V_ohm = i × R_ohm
  V_conc = (RT / nF) × ln(1 - i/i_L)   [mass transport limit]

E_OCV (open-circuit) ≈ 1.23 V at 25°C, decreasing with T.
Practical max ~1.0 V due to crossover + parasitic.

References:
- Larminie & Dicks (2003) "Fuel Cell Systems Explained" 2nd ed.
- Barbir (2013) "PEM Fuel Cells: Theory and Practice" 2nd ed.
- Ballard FCmove(TM) HD spec sheet.
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "pemfc_polarisation_curve (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Larminie & Dicks (2003) 'Fuel Cell Systems Explained' 2nd ed., Ch. 3; Barbir (2013) 'PEM Fuel Cells' 2nd ed.",
    "physics_basis": "V(i) = E_OCV - V_act(Tafel) - V_ohm(iR) - V_conc(mass transport). Industry-typical PEMFC parameters.",
    "confidence_class": "textbook",
    "last_reviewed_date": "2026-05-22",
}

R = 8.314  # J/(mol·K)
F = 96485  # C/mol


def compute(payload: dict) -> dict:
    T_c = float(payload.get("temperature_c", 80.0))
    P_bar = float(payload.get("pressure_bar", 2.5))
    rh_pct = float(payload.get("humidity_pct", 100.0))
    pt_load_mg_cm2 = float(payload.get("platinum_loading_mg_cm2", 0.4))

    T_k = T_c + 273.15

    # Open-circuit potential (Nernst)
    # E = 1.229 - 0.846e-3 × (T - 298) + RT/(4F) × ln(P_H2² × P_O2)
    # Practical OCV ~1.0 V due to crossover
    E_OCV = 1.229 - 0.846e-3 * (T_k - 298) + (R * T_k / (4 * F)) * math.log(max(0.1, P_bar))
    E_OCV_practical = min(1.05, E_OCV) - 0.15  # parasitic + crossover

    # Tafel slope ~ 70 mV/dec at 80°C for ORR (Larminie & Dicks)
    # Use base-10 log form: V_act = b × log10(i/i_0) where b = 0.070 V/dec at 80°C
    tafel_slope_per_dec_v = 0.070  # 70 mV/dec at 80°C, industry-typical for ORR
    # Higher Pt loading reduces i_0; we model practical ORR at 0.4 mg/cm² Pt
    # i_0 typical: 1e-4 A/cm² @ 80°C, 100% RH for state-of-art Pt (Barbir 2013)
    i_0_baseline = 1e-4
    i_0 = i_0_baseline * (pt_load_mg_cm2 / 0.4) * (P_bar / 2.5) ** 0.5

    # Ohmic resistance (membrane + contact)
    # Nafion 117 at 100% RH: 0.07 Ω·cm². Reduces with humidity.
    R_ohm_ref = 0.07
    R_ohm = R_ohm_ref * (1 + (100 - rh_pct) * 0.05)  # 5% per 1% RH drop

    # Limiting current density (mass-transport limit)
    # Typical at 2.5 bar, 80°C, stoich 2: i_L ≈ 2.0-3.0 A/cm²
    i_L = 2.5 * (P_bar / 2.5) ** 0.5

    # Sweep current density (base-10 log Tafel)
    def V_at_i(i: float) -> float:
        if i < i_0:
            return E_OCV_practical
        V_act = tafel_slope_per_dec_v * math.log10(i / i_0)
        V_ohm = i * R_ohm
        if i >= i_L:
            return 0.0
        V_conc = -tafel_slope_per_dec_v * math.log10(max(0.001, 1 - i / i_L))  # mass transport
        V = E_OCV_practical - V_act - V_ohm - V_conc
        return max(0.0, V)

    # Find peak power
    i_grid = [k / 100 for k in range(1, 250)]  # 0.01 to 2.5 A/cm²
    P_grid = [(i, V_at_i(i), i * V_at_i(i)) for i in i_grid]
    peak = max(P_grid, key=lambda x: x[2])
    i_peak, V_peak, P_peak = peak

    # Peak efficiency point: V near 0.7 V (~57% HHV efficiency)
    V_efficient = 0.70
    eff_pt = min(P_grid, key=lambda x: abs(x[1] - V_efficient))
    i_eff, V_eff, _ = eff_pt
    efficiency_at_peak_efficient = V_eff / 1.482  # HHV reference

    # Cell efficiency vs HHV at peak power
    efficiency_at_peak_power = V_peak / 1.482

    return {
        "temperature_c": T_c,
        "pressure_bar": P_bar,
        "humidity_pct": rh_pct,
        "platinum_loading_mg_cm2": pt_load_mg_cm2,
        "ocv_v": round(E_OCV_practical, 3),
        "peak_power_density_w_cm2": round(P_peak, 3),
        "current_density_at_peak_power_a_cm2": round(i_peak, 3),
        "voltage_at_peak_power_v": round(V_peak, 3),
        "voltage_at_peak_efficiency_v": round(V_eff, 3),
        "current_density_at_peak_efficiency_a_cm2": round(i_eff, 3),
        "efficiency_at_peak_power_pct_hhv": round(efficiency_at_peak_power * 100, 1),
        "efficiency_at_peak_efficient_pct_hhv": round(efficiency_at_peak_efficient * 100, 1),
        "tafel_slope_mv_per_dec": round(tafel_slope_per_dec_v * 1000, 1),
        "ohmic_resistance_ohm_cm2": round(R_ohm, 4),
        "limiting_current_a_cm2": round(i_L, 2),
        "exchange_current_density_a_cm2": float(f"{i_0:.2e}"),
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
