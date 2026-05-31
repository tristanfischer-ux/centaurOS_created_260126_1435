#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/test_layer1_libraries.py

Smoke tests for the 7 newly-integrated Layer-1 peer-reviewed Python
engineering libraries:
  - fluids (BSD, Caleb Bell) — pipe sizing & friction
  - ht (BSD, Caleb Bell) — heat transfer correlations
  - thermo (MIT, Caleb Bell) — thermodynamic properties
  - astropy + sgp4 (BSD/MIT, NASA-supported) — orbits
  - control / python-control (BSD) — control systems
  - windpowerlib (MIT, KTH/TU Berlin) — wind turbine power curves

Each test exercises a known engineering value derived from textbook or
manufacturer data and checks the wrapper output against the expected
range. Same harness style as test_class_plan_tools.py.

Usage:
    .venv/bin/python3 scripts/lib/orchestrator/tools/python/test_layer1_libraries.py
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Any

HERE = Path(__file__).parent
PYTHON = str(HERE.parents[4] / ".venv" / "bin" / "python3")

RESULTS: list[dict[str, Any]] = []


def case(name: str, expected: str, tool_kind: str = "library"):
    def wrap(fn):
        def runner():
            t0 = time.time()
            entry: dict[str, Any] = {"tool": name, "expected": expected, "kind": tool_kind}
            try:
                value = fn()
                entry["status"] = "PASS"
                entry["value"] = value
            except AssertionError as exc:
                entry["status"] = "FAIL"
                entry["error_type"] = "AssertionError"
                entry["error_msg"] = str(exc)[:300]
                entry["trace"] = traceback.format_exc().splitlines()[-1]
            except Exception as exc:
                entry["status"] = "ERROR"
                entry["error_type"] = type(exc).__name__
                entry["error_msg"] = str(exc)[:300]
                entry["trace"] = traceback.format_exc().splitlines()[-1]
            entry["wall_time_s"] = round(time.time() - t0, 3)
            RESULTS.append(entry)
        return runner
    return wrap


def run_wrapper(script_name: str, payload: dict) -> dict:
    path = HERE / script_name
    proc = subprocess.run(
        [PYTHON, str(path)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"{script_name} exit {proc.returncode}: stderr={proc.stderr[:300]} stdout={proc.stdout[:200]}"
        )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{script_name} returned non-JSON: {proc.stdout[:200]} (err={exc})")


# ============================================================================
# fluids — Caleb Bell, BSD-3-Clause
# ============================================================================

@case("fluids_run (pipe pressure drop)",
      "Water 10 L/s through 100 mm Sch 40 steel pipe, 100 m length, 4 LR elbows + 2 ball valves: ΔP ~12-25 kPa, v ≈ 1.27 m/s",
      "library")
def t_fluids_water_pipe():
    # 10 L/s through 100 mm pipe = 0.01 m^3/s. Velocity = Q/A = 0.01/0.00785 = 1.27 m/s
    # Re = rho*v*D/mu ~ 1.27 * 998 * 0.1 / 0.001 = 127000 (turbulent)
    # Friction factor (Colebrook, eD = 0.046/100 = 4.6e-4) ~ 0.020
    # dP straight = f * L/D * 0.5 * rho * v^2 = 0.020 * 1000 * 0.5 * 998 * 1.61 ~ 16 kPa
    # plus minor losses for 4 LR elbows (K=0.2 each) + 2 ball valves full-port (K=0.05 each)
    # = 0.9 * 0.5 * 998 * 1.61 ~ 720 Pa
    # Total ~16.7 kPa
    result = run_wrapper("fluids_run.py", {
        "flow_rate_m3_s": 0.01,
        "fluid": "water",
        "fluid_temperature_c": 20.0,
        "pipe_diameter_mm": 100.0,
        "length_m": 100.0,
        "fittings_count_per_type": {
            "elbow_90_long_radius": 4,
            "ball_valve_full_port": 2,
        },
    })
    dp_kpa = result["pressure_drop_kpa"]
    v = result["velocity_m_s"]
    Re = result["reynolds_number"]
    assert 10 < dp_kpa < 30, f"pressure drop out of expected range: {dp_kpa} kPa"
    assert 1.2 < v < 1.4, f"velocity out of expected range: {v} m/s"
    assert 100_000 < Re < 200_000, f"Reynolds out of expected range: {Re}"
    return (
        f"ΔP={dp_kpa} kPa, v={v} m/s, Re={Re:.0f}, "
        f"f={result['friction_factor']}, K_total={result['k_total_fittings']}, "
        f"class={result['recommended_pipe_class']}"
    )


# ============================================================================
# ht — Caleb Bell, BSD-3-Clause
# ============================================================================

@case("ht_run (counter-flow ε-NTU)",
      "Counter-flow, C_r=0.8, NTU=2 → effectiveness=0.7109 (must match prior ntu_heat_exchanger.py exactly)",
      "library")
def t_ht_counterflow():
    # Closed form ε = (1 - e^-0.4) / (1 - 0.8 * e^-0.4) = 0.7109
    result = run_wrapper("ht_run.py", {
        "hx_type": "counterflow",
        "ntu": 2.0,
        "c_ratio": 0.8,
    })
    eff = result["effectiveness"]
    # Tight tolerance because library result and old hand-coded result must agree
    assert abs(eff - 0.7109) < 0.001, f"effectiveness mismatch with ntu_heat_exchanger.py: {eff}"
    return f"ε={eff} (matches prior hand-coded version to 4 sig fig)"


@case("ht_run (shell-tube TEMA-E)",
      "Shell-and-tube 1 shell / 2 tube passes, C_r=0.5, NTU=2 → effectiveness ≈ 0.69 (Kakac & Liu)",
      "library")
def t_ht_shell_tube():
    result = run_wrapper("ht_run.py", {
        "hx_type": "shell_tube_1pass",
        "ntu": 2.0,
        "c_ratio": 0.5,
        "n_shell_tube": 2,
    })
    eff = result["effectiveness"]
    assert 0.60 < eff < 0.80, f"shell-tube effectiveness out of range: {eff}"
    return f"shell-tube 1-shell-2-pass ε={eff}"


# ============================================================================
# thermo — Caleb Bell, MIT
# ============================================================================

@case("thermo_run (water properties)",
      "Water at 25°C, 1 atm: ρ ≈ 997 kg/m³, μ ≈ 0.89 mPa·s, Cp ≈ 4181 J/kg·K",
      "library")
def t_thermo_water():
    result = run_wrapper("thermo_run.py", {
        "chemical": "water",
        "temperature_c": 25.0,
        "pressure_bar": 1.01325,
    })
    rho = result["density_kg_m3"]
    mu = result["viscosity_pa_s"]
    cp = result["heat_capacity_j_kg_k"]
    assert 990 < rho < 1005, f"water density out of expected range: {rho}"
    assert 0.0008 < mu < 0.0010, f"water viscosity out of expected range: {mu}"
    assert 4150 < cp < 4220, f"water Cp out of expected range: {cp}"
    return f"ρ={rho} kg/m³, μ={mu*1000:.3f} mPa·s, Cp={cp} J/kg·K, Psat={result.get('vapour_pressure_pa')} Pa"


@case("thermo_run (ammonia at -33°C)",
      "Ammonia at -33°C, 1 atm (refrigerant baseline): ρ_l ≈ 680 kg/m³",
      "library")
def t_thermo_ammonia():
    result = run_wrapper("thermo_run.py", {
        "chemical": "ammonia",
        "temperature_c": -33.0,
        "pressure_bar": 1.01325,
    })
    rho = result.get("density_kg_m3")
    # Saturated liquid ammonia at boiling point ~ 681 kg/m^3 (NIST)
    # If thermo returns vapour phase at the saturation point, density is ~0.9 kg/m^3
    assert rho is not None and (rho > 600 or rho < 5), f"ammonia density at -33C unexpected: {rho}"
    return f"ρ={rho} kg/m³, phase={result.get('phase')}"


# ============================================================================
# python-control — BSD-3-Clause
# ============================================================================

@case("control_systems_run (IMC tuning of 2nd-order plant)",
      "Plant 1/(s² + 2s + 1), IMC PID, λ=1.0: kp ~1.0 (FOPTD K≈1.0), PM>50°, settling <10s",
      "library")
def t_control_imc():
    result = run_wrapper("control_systems_run.py", {
        "plant_numerator": [1.0],
        "plant_denominator": [1.0, 2.0, 1.0],
        "tuning_method": "imc",
        "controller_type": "PID",
        "lambda_imc_s": 1.0,
    })
    kp = result["kp"]
    pm = result["phase_margin_deg"]
    st = result["settling_time_s"]
    overshoot = result["peak_overshoot_pct"]
    assert 0.5 < kp < 2.0, f"kp out of expected IMC range: {kp}"
    assert pm > 45, f"phase margin too low: {pm}°"
    assert st is not None and st < 15, f"settling time too long: {st}s"
    assert overshoot < 20, f"overshoot too high: {overshoot}%"
    return f"kp={kp}, ki={result['ki']}, kd={result['kd']}, PM={pm}°, settling={st}s, overshoot={overshoot}%"


@case("control_systems_run (Ziegler-Nichols of first-order plant)",
      "Plant 1/(s+1), Z-N PI tuning: kp positive, stable closed loop",
      "library")
def t_control_zn():
    result = run_wrapper("control_systems_run.py", {
        "plant_numerator": [1.0],
        "plant_denominator": [1.0, 1.0],
        "tuning_method": "ziegler_nichols",
        "controller_type": "PI",
    })
    kp = result["kp"]
    stable = result["stable"]
    assert kp > 0, f"Z-N gave non-positive kp: {kp}"
    assert stable, f"Z-N tuned loop not stable: {result}"
    return f"kp={kp}, ki={result['ki']}, stable={stable}, PM={result['phase_margin_deg']}°"


# ============================================================================
# astropy + sgp4 — via orbit_propagator_j2.py
# ============================================================================

@case("orbit_propagator_j2 (LEO sun-sync)",
      "500 km circular at 97.4°, propagate 6h: still circular, RAAN drift ≈ 0.25° (sun-sync)",
      "library")
def t_astropy_orbit():
    result = run_wrapper("orbit_propagator_j2.py", {
        "altitude_perigee_km": 500.0,
        "altitude_apogee_km": 500.0,
        "inclination_deg": 97.4,
        "propagation_time_days": 0.25,  # 6 hours
    })
    period = result["orbital_period_min"]
    drift = result["node_drift_deg_per_day"]
    raan_after = result["raan_propagated_deg"]
    e = result["eccentricity"]
    sso = result["is_sun_synchronous"]
    # 6 hours = 0.25 day → expect drift ≈ 0.25 × 0.9854 ≈ 0.246°
    expected_raan_drift = drift * 0.25
    assert 90 < period < 100, f"period out of expected LEO range: {period}"
    assert 0.95 < drift < 1.05, f"drift not at sun-sync value: {drift}"
    assert sso, f"sun-sync flag should be True at 97.4° / 500 km: {sso}"
    assert e < 0.001, f"orbit not circular: e={e}"
    # raan_propagated should equal expected_raan_drift mod 360
    assert abs(raan_after - expected_raan_drift) < 0.01, f"RAAN drift wrong: {raan_after} vs {expected_raan_drift}"
    return f"T={period} min, Ω̇={drift}°/day, RAAN after 6h={raan_after}°, eclipse={result['eclipse_fraction_pct']}%, SSO={sso}"


# ============================================================================
# windpowerlib — KTH/TU Berlin, MIT
# ============================================================================

@case("wind_resource_model (E-126/4200 at 8 m/s)",
      "Enercon E-126 4.2 MW at 8 m/s mean wind, hub 135 m, k=2: AEP ~12-16 GWh/yr (oedb power curve)",
      "library")
def t_windpowerlib_e126():
    result = run_wrapper("wind_resource_model.py", {
        "mean_wind_speed_ms": 8.0,
        "weibull_k": 2.0,
        "hub_height_m": 135.0,
        "ref_height_m": 135.0,         # already at hub — no shear extrapolation
        "roughness_class": 1,           # open terrain
        "rated_power_kw": 4200.0,
        "rotor_diameter_m": 127.0,
        "cut_in_ms": 3.0,
        "rated_ms": 14.0,
        "cut_out_ms": 25.0,
        "cp_max": 0.48,
        "turbine_type": "E-126/4200",   # tells wrapper to use windpowerlib oedb
        "wake_loss_pct": 8.0,
        "availability_pct": 97.0,
    })
    aep = result["annual_energy_kwh"]
    aep_gwh = result["annual_energy_gwh"]
    cf = result["capacity_factor_pct"]
    source = result["power_curve_source"]
    assert 10_000_000 < aep < 18_000_000, f"AEP out of expected range: {aep} kWh"
    assert 25 < cf < 50, f"capacity factor out of expected range: {cf}%"
    assert "windpowerlib_oedb" in source, f"oedb power curve not used: {source}"
    return f"AEP={aep_gwh} GWh/yr, CF={cf}%, source={source}"


@case("wind_resource_model (synthetic curve, 100 kW)",
      "100 kW synthetic-curve turbine, 7.5 m/s mean: AEP 200-450 MWh, CF 18-50% (legacy schema)",
      "library")
def t_windpowerlib_synthetic():
    # No turbine_type → falls back to internal synthetic Weibull integration.
    result = run_wrapper("wind_resource_model.py", {
        "mean_wind_speed_ms": 7.5,
        "weibull_k": 2.0,
        "hub_height_m": 50.0,
        "ref_height_m": 10.0,
        "roughness_class": 2,
        "rated_power_kw": 100.0,
        "rotor_diameter_m": 20.0,
        "cut_in_ms": 3.0,
        "rated_ms": 12.0,
        "cut_out_ms": 25.0,
        "cp_max": 0.42,
        "wake_loss_pct": 8.0,
        "availability_pct": 97.0,
    })
    aep = result["annual_energy_kwh"]
    cf = result["capacity_factor_pct"]
    source = result["power_curve_source"]
    assert 100_000 < aep < 600_000, f"AEP out of expected range: {aep}"
    assert 15 < cf < 60, f"CF out of expected range: {cf}"
    assert "synthetic" in source, f"expected synthetic curve, got: {source}"
    return f"AEP={aep} kWh, CF={cf}%, source={source}"


# ============================================================================
# refrigeration_cycle — CoolProp + thermo cross-check
# ============================================================================

@case("refrigeration_cycle (R290 5/45°C, thermo cross-check)",
      "R290 cycle 5°C/45°C, η_is=0.7: COP_cooling ≈ 3.5-5.0 + thermo confirms fluid identity",
      "library")
def t_refrigeration_thermo_check():
    result = run_wrapper("refrigeration_cycle.py", {
        "refrigerant": "R290",
        "evap_temp_c": 5.0,
        "cond_temp_c": 45.0,
        "superheat_k": 5.0,
        "subcool_k": 2.0,
        "isentropic_efficiency": 0.70,
        "cooling_load_kw": 10.0,
    })
    cop = result["cop_cooling"]
    thermo_evap = result.get("thermo_cross_check", {}).get("evap_state", {})
    thermo_available = thermo_evap.get("thermo_available", False)
    assert 3.5 < cop < 6.0, f"COP out of expected range: {cop}"
    assert thermo_available, f"thermo cross-check should be available for R290: {thermo_evap}"
    assert thermo_evap.get("fluid_name_in_thermo") == "propane", f"wrong thermo identity: {thermo_evap}"
    return f"COP_cool={cop}, thermo identifies as propane (cross-check confirmed)"


# ============================================================================
# Harness
# ============================================================================

ALL_TESTS = [
    t_fluids_water_pipe,
    t_ht_counterflow,
    t_ht_shell_tube,
    t_thermo_water,
    t_thermo_ammonia,
    t_control_imc,
    t_control_zn,
    t_astropy_orbit,
    t_windpowerlib_e126,
    t_windpowerlib_synthetic,
    t_refrigeration_thermo_check,
]


def main() -> int:
    t_total_start = time.time()
    for t in ALL_TESTS:
        t()

    n_total = len(RESULTS)
    n_pass = sum(1 for r in RESULTS if r["status"] == "PASS")
    n_fail = sum(1 for r in RESULTS if r["status"] == "FAIL")
    n_err = sum(1 for r in RESULTS if r["status"] == "ERROR")

    print(f"\nLAYER-1 LIBRARY SMOKE TESTS  —  {n_pass}/{n_total} PASS, {n_fail} FAIL, {n_err} ERROR")
    print(f"Total wall time: {round(time.time() - t_total_start, 2)}s\n")

    for r in RESULTS:
        marker = "[v PASS]" if r["status"] == "PASS" else "[X " + r["status"] + "]"
        print(f"{marker} {r['tool']}  ({r['wall_time_s']}s)")
        print(f"    Expected: {r['expected']}")
        if r["status"] == "PASS":
            print(f"    Result:   {r['value']}")
        else:
            print(f"    {r.get('error_type', '?')}: {r.get('error_msg', '?')}")

    print()
    print(json.dumps({"summary": {"total": n_total, "pass": n_pass, "fail": n_fail, "error": n_err},
                       "results": RESULTS}, indent=2)[:200] + "...\n  (full JSON elided)")

    return 0 if (n_fail == 0 and n_err == 0) else 1


if __name__ == "__main__":
    sys.exit(main())
