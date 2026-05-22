#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/pybamm_run.py

Real PyBaMM wrapper for the orchestrator. Reads JSON input from stdin,
writes JSON output to stdout.

Computes cell-level quantities for BESS sizing:
- cell_count               (deterministic arithmetic)
- nameplate_capacity_kwh   (deterministic arithmetic)
- voltage_profile          (REAL PyBaMM DFN discharge simulation at 0.5C)
- capacity_fade            (empirical model scaled by chemistry)
- internal_resistance      (from parameter set)

Input:
    {
      "target_energy_kwh": 3500,
      "dod_fraction": 0.80,
      "cell_chemistry": "lfp" | "nmc" | "lto",
      "cell_capacity_ah": 280,
      "cell_voltage_v": 3.2,
      "ambient_temp_c": 25
    }

Performance: ~3-6 seconds per call (PyBaMM startup + DFN model build +
0.5C discharge simulation + voltage profile extraction). The cycle-life
simulation that would give a real capacity fade curve is skipped because
it adds ~30s per call; we use an empirical scaling instead.

License: BSD-3-Clause. Source: github.com/pybamm-team/PyBaMM
"""
from __future__ import annotations

import json
import math
import sys
import time

# Map orchestrator chemistry codes to PyBaMM parameter sets.
PARAMETER_SETS = {
    "lfp": "Prada2013",       # LFP cell (Prada 2013)
    "nmc": "OKane2022",       # NMC graphite-SiOx (O'Kane 2022)
    "lto": "Chen2020",        # Generic Li-ion fallback for LTO (no LTO-specific set ships)
}

EMPIRICAL_CAPACITY_FADE_PCT = {
    "lfp": 8.0,   # LFP at 6000 cycles 1C/1C, 25°C, ~80% retention typical
    "nmc": 15.0,  # NMC at 6000 cycles
    "lto": 4.0,   # LTO known for very low fade
}


def deterministic_cell_count(payload: dict) -> tuple[int, int, float]:
    """Pure arithmetic — same as the stub. Returns (cell_count, cell_count_theoretical, nameplate_kwh)."""
    target_kwh = float(payload.get("target_energy_kwh", 3500))
    dod = float(payload.get("dod_fraction", 0.80))
    cell_ah = float(payload.get("cell_capacity_ah", 280))
    cell_v = float(payload.get("cell_voltage_v", 3.2))
    cell_energy = (cell_ah * cell_v) / 1000.0
    nameplate = target_kwh / dod
    theoretical = math.ceil(nameplate / cell_energy)
    cell_count = math.ceil(theoretical * 1.025)  # EoL margin
    return cell_count, theoretical, nameplate


def real_pybamm_voltage_profile(chemistry: str, c_rate: float = 0.5) -> dict:
    """Run a single-cell DFN discharge simulation in PyBaMM. Returns voltage
    samples at 100%, 50%, 10% SOC + estimated internal resistance.

    This is the part that uses real PyBaMM physics. Without this call,
    we're just doing the same arithmetic as the stub.
    """
    import pybamm

    ps_name = PARAMETER_SETS.get(chemistry, "Marquis2019")
    params = pybamm.ParameterValues(ps_name)

    # Build a DFN model
    model = pybamm.lithium_ion.DFN()
    # Override C-rate
    params.update({"Current function [A]": c_rate * params["Nominal cell capacity [A.h]"]})

    # Run discharge from 100% to 0% SOC (or until cut-off voltage)
    sim = pybamm.Simulation(model, parameter_values=params)
    # Solve for ~3600s of physical time (full discharge at 1C ≈ 3600s, at 0.5C ≈ 7200s)
    t_end = int(3600 / c_rate)
    sim.solve([0, t_end])

    sol = sim.solution
    # Extract voltage at end-points
    times = sol["Time [s]"].entries
    voltage = sol["Voltage [V]"].entries
    discharge_capacity = sol["Discharge capacity [A.h]"].entries

    nominal_capacity_ah = float(params["Nominal cell capacity [A.h]"])

    def voltage_at_soc(target_soc: float) -> float | None:
        """Linear-interp voltage at target SOC (0..1)."""
        target_discharge = nominal_capacity_ah * (1.0 - target_soc)
        # find the closest sample
        for i in range(1, len(discharge_capacity)):
            if discharge_capacity[i] >= target_discharge:
                # interpolate between i-1 and i
                d0 = float(discharge_capacity[i - 1])
                d1 = float(discharge_capacity[i])
                v0 = float(voltage[i - 1])
                v1 = float(voltage[i])
                if d1 == d0:
                    return v0
                t = (target_discharge - d0) / (d1 - d0)
                return v0 + t * (v1 - v0)
        # if not reached, return final voltage
        return float(voltage[-1])

    v100 = voltage_at_soc(1.0)
    v50 = voltage_at_soc(0.5)
    v10 = voltage_at_soc(0.1)

    # Internal resistance estimate: use IV from start-of-discharge transient
    if len(times) >= 2 and len(voltage) >= 2:
        # OCV - V_load drop right at the start of discharge gives I*R
        ocv_param = params.get("Open-circuit voltage [V]") if "Open-circuit voltage [V]" in params else None
        if ocv_param is not None and callable(ocv_param):
            # Initial OCV at 100% SOC
            try:
                v_oc_100 = float(ocv_param(1.0))
            except Exception:
                v_oc_100 = v100
        else:
            v_oc_100 = v100
        v_load_initial = float(voltage[1])
        i_load = c_rate * nominal_capacity_ah  # A
        internal_resistance_ohm = max(0.0, (v_oc_100 - v_load_initial) / max(1e-9, i_load))
        internal_resistance_mohm = internal_resistance_ohm * 1000.0
    else:
        internal_resistance_mohm = 0.35  # fallback

    return {
        "parameter_set": ps_name,
        "voltage_at_100_soc_v": round(v100, 4) if v100 is not None else None,
        "voltage_at_50_soc_v": round(v50, 4) if v50 is not None else None,
        "voltage_at_10_soc_v": round(v10, 4) if v10 is not None else None,
        "internal_resistance_mohm": round(internal_resistance_mohm, 3),
        "c_rate_simulated": c_rate,
    }


def compute(payload: dict) -> dict:
    chemistry = str(payload.get("cell_chemistry", "lfp")).lower()
    cell_count, theoretical, nameplate = deterministic_cell_count(payload)

    # Try the real PyBaMM simulation. If it fails (parameter set missing
    # for the chemistry, etc.) fall back to empirical voltage profile.
    real_sim_ok = False
    sim_result: dict = {}
    try:
        sim_result = real_pybamm_voltage_profile(chemistry, c_rate=0.5)
        real_sim_ok = True
    except Exception as exc:
        sim_result = {
            "parameter_set": "fallback",
            "voltage_at_100_soc_v": float(payload.get("cell_voltage_v", 3.2)) + 0.15,
            "voltage_at_50_soc_v": float(payload.get("cell_voltage_v", 3.2)),
            "voltage_at_10_soc_v": float(payload.get("cell_voltage_v", 3.2)) - 0.25,
            "internal_resistance_mohm": 0.35,
            "c_rate_simulated": 0.5,
            "_error": f"{type(exc).__name__}: {exc}",
        }

    capacity_fade_pct = EMPIRICAL_CAPACITY_FADE_PCT.get(chemistry, 8.0)

    # Thermal dissipation at 0.5C = I^2 * R per cell
    cell_ah = float(payload.get("cell_capacity_ah", 280))
    discharge_current_a = cell_ah * 0.5
    r_ohm = sim_result["internal_resistance_mohm"] / 1000.0
    thermal_w = (discharge_current_a ** 2) * r_ohm

    return {
        "cell_count": cell_count,
        "cell_count_theoretical": theoretical,
        "nameplate_capacity_kwh": round(nameplate, 1),
        "capacity_fade_at_6000_cycles_pct": capacity_fade_pct,
        "internal_resistance_mohm": sim_result["internal_resistance_mohm"],
        "thermal_dissipation_at_05c_w": round(thermal_w, 2),
        "voltage_profile_at_05c_summary": {
            "voltage_at_100_soc_v": sim_result["voltage_at_100_soc_v"],
            "voltage_at_50_soc_v": sim_result["voltage_at_50_soc_v"],
            "voltage_at_10_soc_v": sim_result["voltage_at_10_soc_v"],
        },
        "_meta": {
            "real_pybamm_simulation_ok": real_sim_ok,
            "parameter_set": sim_result.get("parameter_set", "fallback"),
            "c_rate_simulated": sim_result.get("c_rate_simulated"),
            "error": sim_result.get("_error"),
        },
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
        result["_meta"]["wall_time_s"] = round(time.time() - t_start, 2)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
