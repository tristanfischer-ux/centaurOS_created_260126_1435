#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/smart_thermal_coating.py

Smart variable-emissivity thermal coating — graphene-based VEMS for
spacecraft thermal control.

Companies served: SmartIR (UK), AdaptiVE technology partners.

Input:
    {
      "temperature_range_k": [200, 350],
      "switching_voltage_v": 3.0,
      "device_area_cm2": 100.0
    }

Output:
    emissivity_range (low, high), switching_time_s, lifetime_cycles,
    power_to_maintain_state_mw, _provenance.

Physics:
  VEMS based on graphene intercalation: emissivity tuning Delta_eps ~ 0.5
  Switching via electrochemical doping; charge/discharge timescale ~ ms-s
  Power to hold state: leakage current * voltage * area (~ microwatts to mW)

References:
- Salihoglu, O., Uzlu, H.B., Yakar, O., et al., "Graphene-Based Adaptive
  Thermal Camouflage", Nano Lett. 18(7):4541-4548, 2018.
- Sumboja, A., Fai Wong, C., Naskar, A., et al., "Recent Progress in Variable
  Emissivity Devices for Thermal Management", Advanced Materials Tech. 6(11):
  2100129, 2021.
- ESA EXPERT mission flight test of variable emissivity radiator (Wertz 2009).
"""
from __future__ import annotations

import json
import math
import sys
import time


PROVENANCE = {
    "tool_name": "smart_thermal_coating (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Salihoglu et al. (2018) Nano Lett. 18(7):4541 "
        "DOI:10.1021/acs.nanolett.8b01746; "
        "Sumboja et al. (2021) Advanced Mat. Tech. 6(11):2100129 "
        "DOI:10.1002/admt.202100129; "
        "Wertz (2009) ESA EXPERT flight test variable-emissivity radiator."
    ),
    "physics_basis": (
        "Graphene multilayer electrochemical doping changes IR emissivity "
        "by 0.4-0.6 typical. Switching speed limited by ion diffusion "
        "and double-layer charging."
    ),
    "confidence_class": "industry_typical",
    "embedded_constants": {
        "GRAPHENE_EMISSIVITY_RANGE": {
            "source": "Salihoglu 2018 — undoped multilayer graphene eps_8um = 0.78; "
                      "highly doped eps = 0.28; tuning range 0.50",
            "confidence": "textbook",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    temp_range = payload.get("temperature_range_k", [200, 350])
    voltage_v = float(payload.get("switching_voltage_v", 3.0))
    area_cm2 = float(payload.get("device_area_cm2", 100.0))

    t_min_k = float(temp_range[0])
    t_max_k = float(temp_range[1])

    # Graphene multi-layer emissivity range
    # Undoped (V=0): eps ~ 0.78
    # Highly doped (V > 3): eps ~ 0.28
    eps_high = 0.78
    eps_low = 0.28
    # Switching range narrows at low T (slower ion mobility)
    if t_min_k < 200:
        eps_low = 0.40  # less effective doping at cold
    if t_max_k > 400:
        eps_high = 0.85  # higher emissivity at hot
    delta_eps = eps_high - eps_low

    # Switching time (function of T)
    # Ion diffusion: tau ~ d^2 / D where D = D_0 * exp(-Ea / kBT)
    # At room temp: ~10 ms; at 200K: ~10 s; at 350K: ~1 ms
    avg_t = (t_min_k + t_max_k) / 2.0
    base_tau_s = 0.01  # 10 ms at 300K
    # Arrhenius scaling — assume Ea = 0.3 eV
    Ea_ev = 0.3
    kB_ev_K = 8.617e-5
    tau_low = base_tau_s * math.exp(Ea_ev / (kB_ev_K * t_min_k) - Ea_ev / (kB_ev_K * 300.0))
    tau_high = base_tau_s * math.exp(Ea_ev / (kB_ev_K * t_max_k) - Ea_ev / (kB_ev_K * 300.0))
    switching_time_s = max(tau_low, tau_high)

    # Lifetime (cycles)
    # Graphene electrochemical cells: 1000-10000 cycles before performance degradation
    # Higher voltage = faster degradation
    if voltage_v > 4:
        lifetime_cycles = 1000
    elif voltage_v > 2:
        lifetime_cycles = 10000
    else:
        lifetime_cycles = 50000

    # Power to maintain state
    # Leakage current density ~ 1 uA/cm^2 in steady state
    leakage_a_cm2 = 1e-6
    leakage_total_a = leakage_a_cm2 * area_cm2
    power_mw = leakage_total_a * voltage_v * 1000.0

    # Heat rejection variation
    sigma_sb = 5.67e-8
    # At 300 K, q_max @ eps=0.78 = 357 W/m^2; q_min @ eps=0.28 = 128 W/m^2
    heat_rejection_max_w_m2 = eps_high * sigma_sb * (avg_t ** 4)
    heat_rejection_min_w_m2 = eps_low * sigma_sb * (avg_t ** 4)
    heat_modulation_ratio = heat_rejection_max_w_m2 / heat_rejection_min_w_m2

    return {
        "temperature_range_k": temp_range,
        "switching_voltage_v": voltage_v,
        "device_area_cm2": area_cm2,
        "emissivity_range": {"low": round(eps_low, 3), "high": round(eps_high, 3),
                              "delta": round(delta_eps, 3)},
        "switching_time_s": round(switching_time_s, 5),
        "lifetime_cycles": lifetime_cycles,
        "power_to_maintain_state_mw": round(power_mw, 4),
        "leakage_current_uA_cm2": round(leakage_a_cm2 * 1e6, 3),
        "heat_rejection_max_w_m2": round(heat_rejection_max_w_m2, 1),
        "heat_rejection_min_w_m2": round(heat_rejection_min_w_m2, 1),
        "heat_modulation_ratio": round(heat_modulation_ratio, 2),
    }


def main() -> int:
    t0 = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t0, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
