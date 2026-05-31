#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/qubit_chip_thermal.py

Qubit chip heat budget at the base plate of a dilution refrigerator.

Input:
    {
      "qubit_count": 100,
      "microwave_signal_count": 200,
      "attenuator_count": 200,
      "base_plate_temp_mk": 20.0,
      "microwave_power_per_line_dbm": -30
    }

Output:
    {
      "heat_load_uW": ...,
      "T1_degradation_factor": ...,
      "max_supportable_qubits_at_this_temp": ...,
      ...
    }

Physics (Krinner 2019; Pop 2014):
- Each coaxial line dissipates power along its attenuator stack.
- Attenuated power at base plate ≈ P_input × 10^(-attenuation_dB/10).
- Typical line plan: 60 dB total attenuation distributed between 4K, 1K, 100mK,
  20mK stages. About 0.1-1 µW per line at base plate.
- Quasiparticle generation from thermal photons degrades T1 if heat exceeds
  ~100 µW at 20 mK (Krinner et al., 2019 EPJ Quantum Technology 6, 2).

References:
- Krinner et al. (2019) "Engineering cryogenic setups for 100-qubit scale
  superconducting circuit systems," EPJ Quantum Technology 6, 2.
- Pop et al. (2014) "Coherent suppression of electromagnetic dissipation due
  to superconducting quasiparticles," Nature 508, 369.
- Bluefors LD-400 dilution refrigerator spec sheet (2024).
"""
from __future__ import annotations

import json
import math
import sys
import time

PROVENANCE = {
    "tool_name": "qubit_chip_thermal (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": "Krinner et al. (2019) EPJ Quantum Technology 6, 2; Pop et al. (2014) Nature 508 369",
    "physics_basis": "Heat load = sum of attenuated line powers at base plate; T1 degrades when load > base plate cooling power.",
    "confidence_class": "industry_typical",
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    n_qubits = int(payload.get("qubit_count", 100))
    n_signals = int(payload.get("microwave_signal_count", 200))
    n_attens = int(payload.get("attenuator_count", 200))
    T_base_mk = float(payload.get("base_plate_temp_mk", 20.0))
    p_in_dbm = float(payload.get("microwave_power_per_line_dbm", -30.0))

    # Typical attenuator distribution per line:
    # 20 dB at 4K, 10 dB at 1K, 10 dB at 100 mK, 20 dB at 20 mK
    # Total 60 dB → P at base = P_in - 60 dB
    attenuation_total_db = 60.0
    p_in_w = 10 ** ((p_in_dbm - 30) / 10.0)  # convert dBm to W
    # Power at base plate per line
    p_base_per_line_w = p_in_w * 10 ** (-attenuation_total_db / 10.0)

    # Assume ~10% of last-stage attenuator power dissipates at base plate (rest
    # goes into chip), and attenuators themselves dissipate power upstream
    # which doesn't reach base
    last_stage_attenuation = 20  # dB
    last_stage_in_w = p_in_w * 10 ** (-40 / 10.0)  # 40 dB upstream
    last_stage_dissipation_w = last_stage_in_w * (1 - 10 ** (-last_stage_attenuation / 10.0))
    # Per-line base load: chip + last-stage attenuator (in 20 mK stage)
    per_line_w = p_base_per_line_w + last_stage_dissipation_w
    per_line_uw = per_line_w * 1e6

    total_signal_uw = per_line_uw * n_signals

    # Static heat load from coax cable conduction (typical 0.1 µW/line stainless)
    static_uw_per_line = 0.1
    static_total_uw = static_uw_per_line * n_signals

    # Total heat load
    total_uw = total_signal_uw + static_uw_per_line * n_signals

    # Bluefors LD-400 has ~30 µW cooling power at 20 mK, ~600 µW at 100 mK
    # Cooling power scales roughly as T² (Bluefors curve fits)
    cooling_power_uw_at_T = 30.0 * (T_base_mk / 20.0) ** 2
    if total_uw <= cooling_power_uw_at_T:
        actual_T_mk = T_base_mk
    else:
        # Temperature rises to where cooling = load
        actual_T_mk = T_base_mk * math.sqrt(total_uw / 30.0)

    # T1 degradation from quasiparticle density
    # ρ_qp ~ exp(-Δ/kT). Δ/k ≈ 2 K for Al. T1 ∝ 1/ρ_qp.
    # At 20 mK, base ρ_qp ~ 10^-8 (low). At higher T, increases exponentially.
    delta_over_kb_k = 2.0
    actual_T_k = actual_T_mk / 1000.0
    if actual_T_k < 0.05:
        T1_degradation = 1.0
    else:
        # T1 degradation factor: 1 = no degradation; higher = worse
        T1_degradation = math.exp((delta_over_kb_k / 0.020) - (delta_over_kb_k / actual_T_k))
        T1_degradation = max(1.0, min(100.0, T1_degradation))

    # Max supportable qubits at current temp
    if per_line_uw > 0:
        max_signals_at_temp = int(cooling_power_uw_at_T / per_line_uw)
        signals_per_qubit_typical = max(2, n_signals / max(1, n_qubits))
        max_qubits_at_temp = int(max_signals_at_temp / signals_per_qubit_typical)
    else:
        max_qubits_at_temp = 100000

    cooling_margin_pct = ((cooling_power_uw_at_T - total_uw) / cooling_power_uw_at_T) * 100.0

    return {
        "qubit_count": n_qubits,
        "microwave_signal_count": n_signals,
        "base_plate_temp_mk": T_base_mk,
        "heat_load_uW": round(total_uw, 2),
        "signal_heat_load_uW": round(total_signal_uw, 2),
        "static_heat_load_uW": round(static_total_uw, 2),
        "per_line_heat_load_uW": round(per_line_uw, 4),
        "cooling_power_available_uW": round(cooling_power_uw_at_T, 1),
        "cooling_margin_pct": round(cooling_margin_pct, 1),
        "actual_base_temp_mk": round(actual_T_mk, 2),
        "T1_degradation_factor": round(T1_degradation, 2),
        "max_supportable_qubits_at_this_temp": max_qubits_at_temp,
        "thermal_envelope_ok": total_uw < cooling_power_uw_at_T,
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
