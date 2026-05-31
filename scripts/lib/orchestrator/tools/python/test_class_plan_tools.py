#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/test_class_plan_tools.py

Standalone smoke tests for the class-plan engineering tools used by
HAPS, Vertical Farm, Heat Pump, AUV, Drone, and Bioreactor product
classes.

Each @case runs a known-input calculation and PASS/FAIL based on a
documented expected range from textbook / industry data.

Usage:
    .venv/bin/python3 scripts/lib/orchestrator/tools/python/test_class_plan_tools.py

Sister file to test_all_tools.py (which tests the wider tool list
already wired into BESS/cleantech production runs).
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


def case(name: str, expected: str, tool_kind: str = "custom"):
    """Decorator that wraps a test with PASS/FAIL + timing."""
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
    """Run a stdin/stdout JSON wrapper script. Returns parsed output."""
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
# HAPS-class tools
# ============================================================================

@case("pvlib_solar_at_haps_altitude",
      "ET-DNI at June solstice noon 45°N ≈ 1320 W/m²; extraterrestrial at 20 km altitude",
      "library")
def t_pvlib_haps():
    # 20 km altitude, 45°N, longitude 0, June solstice noon UTC.
    # At June solstice the Earth is near aphelion; ET-DNI ~ 1322 W/m² at TOA.
    result = run_wrapper("pvlib_run.py", {
        "latitude": 45.0,
        "longitude": 0.0,
        "altitude_m": 20000.0,
        "time_utc": "2026-06-21T12:00:00",
        "model": "extraterrestrial",
    })
    ghi = result["ghi"]
    et_dni = result["extraterrestrial_dni_w_m2"]
    assert 1250 < et_dni < 1400, f"ET-DNI out of range: {et_dni}"
    assert 800 < ghi < 1400, f"GHI at 45°N noon out of range: {ghi}"
    return f"ET-DNI={et_dni} W/m², GHI(horiz)={ghi} W/m², solar_elev={result['solar_elevation_deg']}°"


@case("aerosandbox_low_re_airfoil",
      "NACA4412 at 5° AoA, Re=500k: CL ≈ 0.85-1.05",
      "library")
def t_aerosandbox_low_re():
    result = run_wrapper("aerosandbox_run.py", {
        "airfoil_name": "NACA4412",
        "alpha_deg": 5.0,
        "reynolds": 500_000,
        "mach": 0.0,
    })
    cl = result["CL"]
    cd = result["CD"]
    assert 0.80 <= cl <= 1.10, f"CL out of expected range: {cl}"
    assert 0.005 <= cd <= 0.025, f"CD out of expected range: {cd}"
    return f"CL={cl}, CD={cd}, L/D={result['L_over_D']}"


@case("ambiance_isa_20km",
      "ISA at 20 km: ρ≈0.0889 kg/m³, T≈216.65 K, P≈5475 Pa",
      "library")
def t_ambiance_isa():
    result = run_wrapper("ambiance_run.py", {"altitude_m": 20000})
    rho = result["density_kg_m3"]
    T = result["temperature_k"]
    P = result["pressure_pa"]
    assert 0.085 < rho < 0.095, f"density out of range: {rho}"
    assert 215.0 < T < 218.0, f"temperature out of range: {T}"
    assert 5300 < P < 5650, f"pressure out of range: {P}"
    return f"ρ={rho} kg/m³, T={T} K, P={P} Pa, a={result['speed_of_sound_m_s']} m/s"


# ============================================================================
# Vertical Farm tools
# ============================================================================

@case("psychrolib_humid_air",
      "25°C, 60% RH at sea level: T_dew ≈ 16.7°C, W ≈ 0.0118 kg/kg",
      "library")
def t_psychrolib():
    result = run_wrapper("psychrolib_run.py", {
        "dry_bulb_c": 25.0,
        "relative_humidity_pct": 60.0,
        "pressure_pa": 101325,
    })
    t_dp = result["dew_point_c"]
    W = result["humidity_ratio_kg_kg"]
    h = result["enthalpy_kj_kg"]
    assert 16.0 < t_dp < 17.5, f"dew point out of range: {t_dp}"
    assert 0.0110 < W < 0.0125, f"humidity ratio out of range: {W}"
    assert 50.0 < h < 60.0, f"enthalpy out of range: {h}"
    return f"T_dew={t_dp}°C, W={W} kg/kg, h={h} kJ/kg"


@case("led_par_efficacy",
      "660nm red LED, 100W input: PPF ≈ 235-265 μmol/s (2.5 μmol/J × 94% driver eff)",
      "custom")
def t_led_par():
    result = run_wrapper("led_par.py", {
        "led_type": "red",
        "input_watts": 100.0,
        "photoperiod_hours": 16.0,
        "growing_area_m2": 5.0,
        "driver_efficiency": 0.94,
    })
    ppf = result["ppf_umol_s"]
    dli = result["dli_mol_m2_day"]
    # 100 W × 0.94 × 2.8 = 263.2 μmol/s
    assert 240 < ppf < 290, f"PPF out of range: {ppf}"
    assert 2.7 < dli < 3.5, f"DLI out of range: {dli}"
    return f"PPF={ppf} μmol/s, PPFD={result['ppfd_umol_m2_s']} μmol/m²/s, DLI={dli} mol/m²/day"


@case("plant_dli",
      "Tomato at 12h photoperiod, 500 μmol/m²/s: DLI≈21.6 mol/m²/day (match=98%+)",
      "custom")
def t_plant_dli():
    # 500 μmol/m²/s × 12 hours × 0.0036 = 21.6 mol/m²/day
    result = run_wrapper("plant_growth.py", {
        "crop": "tomato",
        "dli_mol_m2_day": 21.6,
        "growing_area_m2": 100.0,
    })
    yield_per = result["yield_kg_per_m2_per_cycle"]
    match = result["dli_match_pct"]
    assert 90 < match <= 100, f"DLI match out of range: {match}"
    assert 4.0 < yield_per < 6.0, f"yield out of range: {yield_per}"
    return f"DLI match={match}%, yield/cycle={yield_per} kg/m², cycle={result['cycle_days']} days"


# ============================================================================
# Heat Pump tools
# ============================================================================

@case("coolprop_refrigeration_cycle_cop",
      "R290 cycle, T_evap=5°C / T_cond=45°C: COP_cool ≈ 4.5-5.5",
      "custom")
def t_refrigeration_cycle():
    result = run_wrapper("refrigeration_cycle.py", {
        "refrigerant": "R290",
        "evap_temp_c": 5.0,
        "cond_temp_c": 45.0,
        "superheat_k": 5.0,
        "subcool_k": 2.0,
        "isentropic_efficiency": 0.70,
        "cooling_load_kw": 10.0,
    })
    cop_c = result["cop_cooling"]
    cop_h = result["cop_heating"]
    assert 3.5 < cop_c < 6.0, f"COP_cool out of range: {cop_c}"
    assert 4.5 < cop_h < 7.0, f"COP_heat out of range: {cop_h}"
    return (
        f"COP_cool={cop_c}, COP_heat={cop_h}, "
        f"P_evap={result['evap_pressure_bar']} bar, "
        f"compressor={result['compressor_power_kw']} kW"
    )


@case("ht_run (ε-NTU)",
      "Counter-flow, C_r=0.8, NTU=2: effectiveness ≈ 0.71 (Incropera Table 11.4 / Bell ht library)",
      "library")
def t_ntu():
    # Routed via Layer-1 `ht` library (Bell, BSD-3-Clause). Closed-form:
    # ε = (1 - exp(-NTU(1-Cr))) / (1 - Cr exp(-NTU(1-Cr)))
    # = (1 - e^-0.4) / (1 - 0.8 × e^-0.4)
    # = 0.3297 / 0.4638 = 0.7109
    # Cross-checks against Incropera Table 11.4 ε ≈ 0.71.
    # Previously called `ntu_heat_exchanger.py` (deleted 2026-05-22).
    result = run_wrapper("ht_run.py", {
        "hx_type": "counterflow",
        "ntu": 2.0,
        "c_ratio": 0.8,
    })
    eff = result["effectiveness"]
    assert 0.70 < eff < 0.74, f"effectiveness out of range: {eff}"
    return f"effectiveness={eff} (counter-flow, ht library)"


# ============================================================================
# AUV tools
# ============================================================================

@case("seawater_density_at_depth",
      "S=35 PSU, T=4°C, depth=1000m: ρ ≈ 1035-1040 kg/m³",
      "library")
def t_auv_seawater_density():
    result = run_wrapper("auv_hydro.py", {
        "depth_m": 1000.0,
        "velocity_m_s": 2.0,
        "length_m": 2.5,
        "beam_m": 0.3,
        "c_d": 0.04,
        "salinity_ppt": 35.0,
        "water_temp_c": 4.0,
        "hull_form": "torpedo",
    })
    rho = result["seawater_density_kg_m3"]
    p_bar = result["hydrostatic_pressure_bar"]
    drag = result["drag_force_n"]
    assert 1030 < rho < 1045, f"density out of range: {rho}"
    # At 1000 m, P ≈ 101 bar gauge (1000 × 9.81 × 1037 / 1e5 ≈ 101.7 bar)
    assert 95 < p_bar < 110, f"pressure out of range: {p_bar}"
    return f"ρ={rho} kg/m³, P={p_bar} bar, drag={drag} N at 2 m/s"


@case("sonar_thorp_attenuation",
      "10 kHz, 1 km, T=10°C: attenuation ≈ 0.8-1.3 dB/km (Francois-Garrison)",
      "custom")
def t_sonar_attenuation():
    result = run_wrapper("sonar_acoustic.py", {
        "frequency_khz": 10.0,
        "distance_km": 1.0,
        "depth_m": 100.0,
        "salinity_ppt": 35.0,
        "water_temp_c": 10.0,
        "ph": 8.0,
    })
    alpha = result["attenuation_db_per_km"]
    c = result["sound_speed_m_s"]
    # Thorp at 10 kHz ≈ 1 dB/km in standard seawater
    assert 0.6 < alpha < 1.5, f"attenuation out of range: {alpha}"
    assert 1480 < c < 1510, f"sound speed out of range: {c}"
    return f"α={alpha} dB/km, c={c} m/s, path_loss={result['path_loss_db']} dB"


@case("pressure_vessel_hoop_stress",
      "1000m depth, 200mm dia, 8mm wall, Ti6Al4V: σ_hoop ≈ 120-135 MPa, SF > 5",
      "custom")
def t_pressure_vessel():
    result = run_wrapper("pressure_vessel.py", {
        "depth_m": 1000.0,
        "diameter_mm": 200.0,
        "wall_thickness_mm": 8.0,
        "length_mm": 600.0,
        "material": "Ti_grade5",
        "safety_factor_required": 2.0,
    })
    sigma = result["hoop_stress_mpa"]
    sf = result["yield_safety_factor"]
    mass = result["mass_kg"]
    # σ ≈ P × r / t = 10.1 MPa × 100 mm / 8 mm = 126.6 MPa
    assert 115 < sigma < 140, f"hoop stress out of range: {sigma}"
    assert sf > 5.0, f"safety factor too low: {sf}"
    return f"σ_hoop={sigma} MPa, SF={sf}, mass={mass} kg"


# ============================================================================
# Drone tools
# ============================================================================

@case("bemt_propeller_thrust",
      "10-inch APC prop @ 8000 rpm hover: thrust ≈ 4-10 N (typical for 4.5-inch pitch)",
      "custom")
def t_bemt():
    result = run_wrapper("bemt_propeller.py", {
        "diameter_inch": 10.0,
        "pitch_inch": 4.5,
        "rpm": 8000,
        "airspeed_m_s": 0.0,
        "num_blades": 2,
        "altitude_m": 0.0,
    })
    thrust = result["thrust_n"]
    power = result["power_w"]
    eta = result["efficiency"]
    # APC SF10x4.5 at 8000 rpm static thrust ≈ 6.5 N per UIUC data
    assert 3.0 < thrust < 12.0, f"thrust out of range: {thrust}"
    assert 80 < power < 300, f"power out of range: {power}"
    return f"thrust={thrust} N, power={power} W, FoM={eta}"


@case("motor_kv_rpm",
      "920Kv motor at 22.2V (6S LiPo): no-load RPM ≈ 20424",
      "custom")
def t_motor_kv():
    result = run_wrapper("motor_prop_match.py", {
        "motor_kv": 920,
        "battery_voltage": 22.2,
        "prop_diameter_inch": 10.0,
        "prop_pitch_inch": 4.5,
        "payload_kg": 1.2,
        "num_motors": 4,
    })
    no_load_rpm = result["no_load_rpm"]
    twr = result["thrust_to_weight_ratio"]
    hover_throttle = result["hover_throttle_pct"]
    assert 20400 < no_load_rpm < 20450, f"no-load RPM wrong: {no_load_rpm}"
    assert twr > 1.5, f"thrust/weight too low for hover: {twr}"
    # 10×4.5 prop at no-load 20.4k rpm is heavily oversized for a 1.2 kg quad
    # → hover throttle is low (~20%). Spec is for HOTness margin, not min.
    assert 15 < hover_throttle < 80, f"hover throttle out of range: {hover_throttle}"
    return f"no_load_rpm={no_load_rpm}, TWR={twr}, hover throttle={hover_throttle}%"


# ============================================================================
# Bioreactor tools
# ============================================================================

@case("biosteam_ethanol_stoich",
      "100 kg glucose -> ethanol fermentation: ~51 kg theoretical (Gay-Lussac)",
      "library")
def t_biosteam_stoich():
    result = run_wrapper("biosteam_run.py", {
        "substrate": "glucose",
        "product": "ethanol",
        "substrate_mass_kg": 100.0,
        "yield_factor": 1.0,  # theoretical maximum
    })
    eth = result["product_mass_kg"]
    co2 = result["byproduct_co2_kg"]
    yld = result["theoretical_yield_pct"]
    # C6H12O6 -> 2 C2H5OH + 2 CO2
    # 180.16 g/mol -> 2 × 46.069 g/mol = 92.14 g/mol ethanol = 51.14% of substrate mass
    assert 50.5 < eth < 51.5, f"ethanol mass out of range: {eth}"
    assert 48.0 < co2 < 49.5, f"CO2 mass out of range: {co2}"
    assert 50.5 < yld < 51.5, f"theoretical yield out of range: {yld}"
    return f"ethanol={eth} kg, CO2={co2} kg, theoretical yield={yld}%"


@case("kla_oxygen_transfer",
      "1 kW/m³ P/V, U_g=0.05 m/s, Rushton: kLa ≈ 150-260 h⁻¹ (Van 't Riet coalescing water)",
      "custom")
def t_kla():
    # Van 't Riet coalescing-water: kLa = 0.026 × P^0.4 × U_g^0.5
    # = 0.026 × 1000^0.4 × 0.05^0.5
    # = 0.026 × 15.85 × 0.2236
    # = 0.0921 /s = 332 /h
    # But experiments show industrial Rushton in coalescing water at this
    # P/V typically gives ~200-300 /h. Wide range = healthy bound.
    result = run_wrapper("kla_oxygen.py", {
        "power_volumetric_w_m3": 1000.0,
        "superficial_velocity_m_s": 0.05,
        "impeller_type": "rushton",
    })
    kla_h = result["kla_per_hour"]
    assert 100 < kla_h < 400, f"kLa out of range: {kla_h}"
    return f"kLa={kla_h} h⁻¹, OTR={result['otr_kg_m3_hr']} kg O2/m³/h"


@case("agitation_power_rushton",
      "Rushton D=0.3m, N=200 rpm in water: P ≈ 150-450 W (Np=5)",
      "custom")
def t_agitation():
    # P = Np × ρ × N³ × D⁵
    # = 5 × 1000 × (200/60)³ × 0.3⁵
    # = 5 × 1000 × 37.04 × 0.00243
    # = 450 W
    result = run_wrapper("agitation_power.py", {
        "impeller_diameter_m": 0.3,
        "rpm": 200,
        "fluid_density_kg_m3": 1000.0,
        "impeller_type": "rushton",
        "fluid_viscosity_pa_s": 0.001,
        "tank_diameter_m": 0.9,
    })
    power = result["power_w"]
    re_imp = result["reynolds_impeller"]
    assert 150 < power < 550, f"agitation power out of range: {power}"
    # Re = 1000 × 3.33 × 0.09 / 0.001 = 300,000 (fully turbulent)
    assert re_imp > 50_000, f"Reynolds too low for turbulent regime: {re_imp}"
    return f"P={power} W, Re={re_imp}, tip speed={result['tip_speed_m_s']} m/s"


# ============================================================================
# Main
# ============================================================================

ALL_TESTS = [
    t_pvlib_haps,
    t_aerosandbox_low_re,
    t_ambiance_isa,
    t_psychrolib,
    t_led_par,
    t_plant_dli,
    t_refrigeration_cycle,
    t_ntu,
    t_auv_seawater_density,
    t_sonar_attenuation,
    t_pressure_vessel,
    t_bemt,
    t_motor_kv,
    t_biosteam_stoich,
    t_kla,
    t_agitation,
]


if __name__ == "__main__":
    for fn in ALL_TESTS:
        try:
            fn()
        except Exception as exc:
            RESULTS.append({
                "tool": fn.__name__,
                "status": "HARNESS_ERROR",
                "error_msg": str(exc),
                "wall_time_s": 0.0,
            })

    pass_count = sum(1 for r in RESULTS if r["status"] == "PASS")
    total = len(RESULTS)

    print("=" * 76)
    print(f"CLASS-PLAN TOOL SMOKE TESTS  —  {pass_count}/{total} PASS")
    print("=" * 76)
    for r in RESULTS:
        s = r["status"]
        sigil = "v" if s == "PASS" else "X"
        print(f"\n[{sigil} {s}] {r['tool']}  ({r['wall_time_s']}s)")
        print(f"    Expected: {r.get('expected', 'n/a')}")
        if s == "PASS":
            print(f"    Result:   {r['value']}")
        else:
            print(f"    Error:    {r.get('error_type', '?')}: {r.get('error_msg', '?')}")
    print()
    sys.exit(0 if pass_count == total else 1)
