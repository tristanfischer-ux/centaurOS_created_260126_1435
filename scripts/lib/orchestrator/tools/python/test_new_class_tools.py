#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/test_new_class_tools.py

Standalone smoke tests for the NEW class-plan engineering tools added
2026-05-22 for 10 additional product classes (total 20 universal classes):
  - HVAC application tools (shared across multiple classes)
  - solar_inverter, wind_turbine, hydrogen_electrolyser
  - ups_inverter, 3d_printer_fdm, cnc_machine, e_bike
  - smallsat, ventilator, dialysis_machine
Plus ambiance LEO extension (NRLMSISE-00).

Each @case runs a known-input calculation and PASS/FAIL based on a
documented expected range from textbook / industry data.

Usage:
    .venv/bin/python3 scripts/lib/orchestrator/tools/python/test_new_class_tools.py
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
# GROUP A — HVAC application tools (shared across multiple classes)
# ============================================================================

@case("hvac_load_sizing",
      "BESS container 30 kW sensible + 0 latent, 35°C ambient → chiller ≥ 32 kW, "
      "expected_cop in [3-5]",
      "custom")
def t_hvac_load_sizing():
    result = run_wrapper("hvac_load_sizing.py", {
        "sensible_load_kw": 30.0,
        "latent_load_kw_or_moisture_kg_h": 0.0,
        "indoor_db_c": 25.0,
        "indoor_rh_pct": 50.0,
        "outdoor_db_c": 35.0,
        "outdoor_rh_pct": 50.0,
    })
    chiller = result["required_chiller_capacity_kw"]
    cop = result["expected_cop"]
    shr = result["sensible_heat_ratio"]
    assert chiller >= 32.0, f"chiller too small: {chiller}"
    assert 3.0 <= cop <= 6.0, f"COP out of range: {cop}"
    assert shr == 1.0, f"SHR for pure sensible should be 1.0: {shr}"
    return f"chiller={chiller} kW, COP={cop}, SHR={shr}"


@case("dehumidification_calc",
      "VF 200 kg/h transpiration at 22°C/65% RH target → ~4800 L/day dehumidifier",
      "custom")
def t_dehumidification_calc():
    result = run_wrapper("dehumidification_calc.py", {
        "moisture_load_kg_h": 200.0,
        "indoor_db_c": 22.0,
        "indoor_rh_target_pct": 65.0,
        "outdoor_db_c": 28.0,
        "outdoor_rh_pct": 80.0,
        "dehumidifier_type": "refrigeration",
    })
    capacity_l_day = result["dehumidifier_capacity_l_day"]
    chiller_kw = result["chiller_load_kw"]
    assert 4500 < capacity_l_day < 5100, f"capacity out of range: {capacity_l_day}"
    assert chiller_kw is not None and 120 < chiller_kw < 160, f"chiller load out of range: {chiller_kw}"
    return f"capacity={capacity_l_day} L/day, chiller={chiller_kw} kW"


@case("fan_coil_sizing",
      "5000 CMS, 25 kW CHW coil → face area ~2 m², fan power 4-8 kW",
      "custom")
def t_fan_coil_sizing():
    result = run_wrapper("fan_coil_sizing.py", {
        "airflow_cms": 5.0,
        "coil_load_kw": 25.0,
        "coil_type": "chilled_water",
        "static_pressure_pa": 250.0,
    })
    face = result["coil_face_area_m2"]
    fan_p = result["fan_power_kw"]
    filter_class = result["filter_class_required"]
    assert 1.5 < face < 3.0, f"face area out of range: {face}"
    assert 3.0 < fan_p < 9.0, f"fan power out of range: {fan_p}"
    assert filter_class in ("F7", "G4", "F9"), f"unexpected filter class: {filter_class}"
    return f"face_area={face} m², fan={fan_p} kW, filter={filter_class}"


# ============================================================================
# GROUP B — Class-specific tools
# ============================================================================

# ----- Class 11: solar_inverter -----

@case("mppt_tracking_model",
      "600V Voc, 12A Isc array at 800 W/m² 45°C → MPP power ~3.5-4.5 kW",
      "custom")
def t_mppt_tracking_model():
    result = run_wrapper("mppt_tracking_model.py", {
        "array_open_circuit_v": 600.0,
        "array_short_circuit_a": 12.0,
        "irradiance_w_m2": 800.0,
        "cell_temp_c": 45.0,
    })
    p_mp = result["mpp_power_w"]
    eta_mppt = result["mppt_efficiency_pct"]
    v_mp = result["mpp_voltage_v"]
    assert 3000 < p_mp < 5000, f"MPP power out of range: {p_mp}"
    assert 95 < eta_mppt < 100, f"MPPT efficiency out of range: {eta_mppt}"
    assert 350 < v_mp < 550, f"MPP voltage out of range: {v_mp}"
    return f"P_mp={p_mp} W, V_mp={v_mp} V, η_MPPT={eta_mppt}%"


# ----- Class 12: wind_turbine -----

@case("wind_resource_model",
      "100 kW @ 7.5 m/s mean wind, h=50m roughness 2 → capacity factor 20-50%",
      "custom")
def t_wind_resource_model():
    # Use realistic small-turbine rotor (10m dia) for 100 kW rated
    result = run_wrapper("wind_resource_model.py", {
        "mean_wind_speed_ms": 7.5,
        "weibull_k": 2.0,
        "hub_height_m": 50.0,
        "roughness_class": 2,
        "ref_height_m": 10.0,
        "rated_power_kw": 100.0,
        "rotor_diameter_m": 10.0,  # small turbine geometry to match 100 kW class
        "cut_in_ms": 3.0,
        "rated_ms": 12.0,
        "cut_out_ms": 25.0,
        "cp_max": 0.42,
    })
    cf = result["capacity_factor_pct"]
    energy = result["annual_energy_kwh"]
    v_hub = result["hub_wind_speed_ms"]
    assert 15 < cf < 60, f"capacity factor out of range: {cf}"
    assert 100000 < energy < 600000, f"annual energy out of range: {energy}"
    assert 8 < v_hub < 12, f"hub wind speed out of range: {v_hub}"
    return f"CF={cf}%, energy={energy} kWh, V_hub={v_hub} m/s"


@case("gearbox_load_spectrum",
      "100 kW turbine, 50000 Nm rated, TI 15%, 20yr life → peak torque 60-85 kNm",
      "custom")
def t_gearbox_load_spectrum():
    result = run_wrapper("gearbox_load_spectrum.py", {
        "mean_wind_ms": 7.5,
        "turbulence_intensity_pct": 15.0,
        "lifetime_years": 20.0,
        "rated_torque_nm": 50000.0,
        "rotor_rpm_rated": 30.0,
    })
    t_peak = result["gearbox_torque_peak_nm"]
    cycles = result["load_cycles_per_lifetime"]
    damage_eq = result["fatigue_damage_eq"]
    assert 60000 < t_peak < 90000, f"peak torque out of range: {t_peak}"
    assert cycles > 1e8, f"cycle count too low: {cycles}"
    assert 1.0 < damage_eq < 10.0, f"fatigue damage out of range: {damage_eq}"
    return f"T_peak={t_peak} Nm, cycles={cycles:.2e}, damage_eq={damage_eq}"


# ----- Class 13: hydrogen_electrolyser -----

@case("electrolyser_efficiency",
      "PEM 2 A/cm² at 70°C/30 bar → cell voltage 1.8-2.0 V, LHV eff 60-75%",
      "custom")
def t_electrolyser_efficiency():
    result = run_wrapper("electrolyser_efficiency.py", {
        "cell_current_density_a_cm2": 2.0,
        "temperature_c": 70.0,
        "pressure_bar": 30.0,
        "membrane_type": "PEM",
    })
    v_cell = result["cell_voltage_v"]
    eta_lhv = result["efficiency_lhv_pct"]
    h2_per_kwh = result["h2_production_kg_per_kwh"]
    assert 1.7 < v_cell < 2.1, f"cell voltage out of range: {v_cell}"
    assert 55 < eta_lhv < 80, f"LHV efficiency out of range: {eta_lhv}"
    assert 0.015 < h2_per_kwh < 0.025, f"H2/kWh out of range: {h2_per_kwh}"
    return f"V_cell={v_cell} V, η_LHV={eta_lhv}%, H2/kWh={h2_per_kwh} kg"


@case("pem_membrane_sizing",
      "1000 kg/day H2 at 2 A/cm² → active area ~40-80 m², ~1.5-2.5 MW",
      "custom")
def t_pem_membrane_sizing():
    result = run_wrapper("pem_membrane_sizing.py", {
        "target_h2_kg_per_day": 1000.0,
        "current_density_a_cm2": 2.0,
        "voltage_v": 1.85,
        "active_area_per_cell_cm2": 1500.0,
    })
    A_m2 = result["active_area_m2"]
    p_kw = result["total_power_kw"]
    spec = result["spec_energy_kwh_per_kg_h2"]
    assert 30 < A_m2 < 100, f"area out of range: {A_m2}"
    assert 1500 < p_kw < 3000, f"power out of range: {p_kw}"
    assert 45 < spec < 60, f"specific energy out of range: {spec}"
    return f"area={A_m2} m², power={p_kw} kW, spec={spec} kWh/kg"


# ----- Class 14: ups_inverter -----

@case("runtime_calc",
      "10 kWh LiFePO4 at 2 kW load 80% DoD 92% inv eff → 200-280 min",
      "custom")
def t_runtime_calc():
    result = run_wrapper("runtime_calc.py", {
        "battery_capacity_kwh": 10.0,
        "load_kw": 2.0,
        "dod_max_pct": 80.0,
        "inverter_efficiency_pct": 92.0,
        "battery_chemistry": "lifepo4",
    })
    rt_min = result["runtime_minutes"]
    usable = result["usable_capacity_kwh"]
    eff_load = result["effective_load_kw"]
    assert 200 < rt_min < 280, f"runtime out of range: {rt_min}"
    assert 7.5 < usable < 8.5, f"usable capacity out of range: {usable}"
    assert 2.0 < eff_load < 2.3, f"effective load out of range: {eff_load}"
    return f"runtime={rt_min} min, usable={usable} kWh, effective_load={eff_load} kW"


# ----- Class 15: 3d_printer_fdm -----

@case("extruder_thermal",
      "PLA at 210°C, 0.04 g/s, 50W heater → steady=210°C, lag<3s, melt zone 5-30mm",
      "custom")
def t_extruder_thermal():
    result = run_wrapper("extruder_thermal.py", {
        "set_temp_c": 210.0,
        "flow_rate_g_s": 0.04,
        "filament_diameter_mm": 1.75,
        "heater_w": 50.0,
        "material": "PLA",
        "ambient_c": 25.0,
    })
    t_steady = result["steady_state_temp_c"]
    lag = result["temp_lag_s"]
    melt_mm = result["melt_zone_length_mm"]
    cfm = result["cooling_fan_required_cfm"]
    assert 205 < t_steady < 215, f"steady-state temp out of range: {t_steady}"
    assert 0.5 < lag < 5.0, f"temp lag out of range: {lag}"
    assert 5 < melt_mm < 35, f"melt zone out of range: {melt_mm}"
    assert cfm >= 5.0, f"cooling fan too low: {cfm}"
    return f"T_steady={t_steady}°C, τ={lag}s, melt={melt_mm}mm, fan={cfm} CFM"


@case("motion_kinematics",
      "200mm/s, NEMA17 1.8°, 16μstep, 20T GT2 belt → 80 steps/mm, torque margin > 50%",
      "custom")
def t_motion_kinematics():
    result = run_wrapper("motion_kinematics.py", {
        "axis_length_mm": 300.0,
        "belt_pulley_teeth": 20,
        "belt_pitch_mm": 2.0,
        "motor_step_angle_deg": 1.8,
        "microstepping": 16,
        "target_print_speed_mm_s": 200.0,
        "moving_mass_kg": 0.5,
        "target_accel_mm_s2": 5000.0,
    })
    spm = result["steps_per_mm"]
    margin = result["torque_margin_pct"]
    feasible = result["feasible"]
    max_accel = result["max_accel_mm_s2"]
    assert spm == 80.0, f"steps/mm wrong: {spm}"
    assert margin > 50.0, f"torque margin too low: {margin}"
    assert feasible, "motion deemed infeasible"
    assert max_accel > 5000, f"max accel too low: {max_accel}"
    return f"steps/mm={spm}, margin={margin}%, max_accel={max_accel} mm/s², feasible={feasible}"


# ----- Class 16: cnc_machine -----

@case("spindle_thermal",
      "15 kW spindle 18 krpm ceramic hybrid 80% duty → heat 0.2-1.0 kW, oil <5 LPM",
      "custom")
def t_spindle_thermal():
    result = run_wrapper("spindle_thermal.py", {
        "spindle_power_kw": 15.0,
        "max_rpm": 18000,
        "bearing_type": "ceramic_hybrid",
        "duty_cycle": 0.80,
    })
    heat_kw = result["heat_dissipation_kw"]
    oil_lpm = result["cooling_oil_lpm"]
    t_bearing = result["bearing_temp_c"]
    assert 0.2 < heat_kw < 1.5, f"heat dissipation out of range: {heat_kw}"
    assert oil_lpm < 8.0, f"oil flow too high: {oil_lpm}"
    assert t_bearing < 120, f"bearing temp too high: {t_bearing}"
    return f"heat={heat_kw} kW, oil={oil_lpm} LPM, T_bearing={t_bearing}°C"


@case("mrr_chip_load",
      "10mm 4-flute Al, V_c=200 m/min, f_z=0.05 mm, slot a_p=5 a_e=5 → MRR 25-35 cm³/min",
      "custom")
def t_mrr_chip_load():
    result = run_wrapper("mrr_chip_load.py", {
        "tool_diameter_mm": 10.0,
        "material": "aluminium",
        "cutting_speed_m_min": 200.0,
        "feed_per_tooth_mm": 0.05,
        "num_flutes": 4,
        "axial_depth_mm": 5.0,
        "radial_depth_mm": 5.0,
    })
    mrr = result["mrr_cm3_min"]
    force = result["cutting_force_n"]
    torque = result["spindle_torque_nm"]
    rpm = result["spindle_rpm"]
    assert 20 < mrr < 40, f"MRR out of range: {mrr}"
    assert 100 < force < 600, f"cutting force out of range: {force}"
    assert 0.3 < torque < 5.0, f"spindle torque out of range: {torque}"
    assert 5000 < rpm < 8000, f"spindle rpm out of range: {rpm}"
    return f"MRR={mrr} cm³/min, F_c={force} N, T={torque} Nm, RPM={rpm}"


# ----- Class 17: e_bike -----

@case("rolling_resistance",
      "95 kg total at 30 km/h (8.33 m/s) upright commuter → battery power 200-350 W",
      "custom")
def t_rolling_resistance():
    result = run_wrapper("rolling_resistance.py", {
        "total_mass_kg": 95.0,
        "velocity_ms": 8.33,
        "tire_pressure_bar": 4.5,
        "rider_position": "upright",
        "road_grade_pct": 0.0,
        "tire_type": "commuter",
    })
    p_wheel = result["total_power_required_w"]
    p_batt = result["battery_power_required_w"]
    F_rr = result["rolling_drag_n"]
    F_aero = result["aero_drag_n"]
    assert 150 < p_wheel < 350, f"wheel power out of range: {p_wheel}"
    assert 180 < p_batt < 420, f"battery power out of range: {p_batt}"
    assert 4 < F_rr < 10, f"rolling drag out of range: {F_rr}"
    assert 15 < F_aero < 30, f"aero drag out of range: {F_aero}"
    return f"P_batt={p_batt} W, F_rr={F_rr} N, F_aero={F_aero} N"


@case("gear_ratio",
      "Kv=100, 36V battery, 700mm wheel, 22:60 gearing → top speed > 30 km/h with load",
      "custom")
def t_gear_ratio():
    result = run_wrapper("gear_ratio.py", {
        "motor_kv": 100.0,
        "battery_v": 36.0,
        "wheel_diameter_mm": 700.0,
        "pulley_teeth_motor": 22,
        "pulley_teeth_wheel": 60,
        "max_torque_nm": 80.0,
        "battery_capacity_kwh": 0.7,
    })
    speed = result["max_speed_kmh"]
    ratio = result["gear_ratio"]
    torque_wheel = result["torque_at_wheel_nm"]
    no_load_rpm = result["no_load_motor_rpm"]
    assert speed > 30, f"speed too low: {speed}"
    assert ratio > 2.0, f"gear ratio too low: {ratio}"
    assert torque_wheel > 100, f"wheel torque too low: {torque_wheel}"
    assert 3000 < no_load_rpm < 4000, f"no-load RPM out of range: {no_load_rpm}"
    return f"speed={speed} km/h, ratio={ratio}, T_wheel={torque_wheel} Nm"


# ----- Class 18: smallsat -----

@case("orbital_thermal",
      "12U CubeSat 0.5 m² with 0.1 m² sun, α=0.4 ε=0.85, Q_int=20W, 500km → "
      "T_sun in -50 to +50°C, T_eclipse in -80 to 0°C",
      "custom")
def t_orbital_thermal():
    result = run_wrapper("orbital_thermal.py", {
        "surface_area_m2": 0.5,
        "solar_absorptivity": 0.40,
        "ir_emissivity": 0.85,
        "internal_dissipation_w": 20.0,
        "orbital_altitude_km": 500.0,
        "eclipse_fraction_pct": 35.0,
        "sun_facing_area_m2": 0.1,
    })
    t_sun = result["equilibrium_temp_c_sun"]
    t_ecl = result["equilibrium_temp_c_eclipse"]
    radiator = result["radiator_area_required_m2"]
    assert -60 < t_sun < 60, f"sun-side temp out of range: {t_sun}"
    assert -100 < t_ecl < 20, f"eclipse temp out of range: {t_ecl}"
    assert radiator < 1.0, f"radiator area too high: {radiator}"
    return f"T_sun={t_sun}°C, T_ecl={t_ecl}°C, radiator={radiator} m²"


@case("attitude_torque",
      "3U CubeSat at 400 km, I=[0.01,0.01,0.005], A=0.02 m², CG=2cm → "
      "total disturbance < 1e-5 Nm, h_wheel < 0.1 N·m·s",
      "custom")
def t_attitude_torque():
    result = run_wrapper("attitude_torque.py", {
        "inertia_tensor_kgm2": [0.01, 0.01, 0.005],
        "altitude_km": 400.0,
        "area_facing_sun_m2": 0.02,
        "area_facing_velocity_m2": 0.01,
        "cg_offset_m": 0.02,
    })
    t_total = result["total_disturbance_nm"]
    h_wheel = result["actuator_required_nms"]
    t_gg = result["gravity_gradient_torque_nm"]
    t_aero = result["aero_torque_nm"]
    assert t_total < 1e-5, f"total disturbance too high: {t_total}"
    assert h_wheel < 0.1, f"reaction wheel momentum too high: {h_wheel}"
    assert t_gg > 0, f"gravity-gradient torque should be positive: {t_gg}"
    assert t_aero > 0, f"aero torque should be positive: {t_aero}"
    return f"T_total={t_total:.2e} Nm, h_wheel={h_wheel:.2e} N·m·s"


# ----- GROUP C — Ambiance extension to LEO -----

@case("nrlmsise00_leo_density",
      "400 km altitude, mean solar activity → density 1e-12 to 1e-11 kg/m³, T ~1000-1300 K",
      "library")
def t_nrlmsise00_leo():
    result = run_wrapper("nrlmsise00_run.py", {
        "altitude_km": 400.0,
        "solar_activity": "mean",
    })
    rho = result["density_kg_m3"]
    T_k = result["temperature_k"]
    p_pa = result["pressure_pa"]
    H_m = result["scale_height_m"]
    assert 1e-13 < rho < 1e-10, f"density out of LEO range: {rho}"
    assert 900 < T_k < 1500, f"temperature out of LEO range: {T_k}"
    assert p_pa < 1e-3, f"pressure should be very low at 400 km: {p_pa}"
    assert H_m > 30000, f"scale height too low for LEO: {H_m}"
    return f"ρ={rho:.2e} kg/m³, T={T_k} K, P={p_pa:.2e} Pa, H={H_m} m"


# ----- Class 19: ventilator -----

@case("flow_compliance",
      "V_t=500 mL, PEEP=5, RR=14, C=50 mL/cmH2O, R=5 → P_peak<20, P_plat<18",
      "custom")
def t_flow_compliance():
    result = run_wrapper("flow_compliance.py", {
        "tidal_volume_ml": 500.0,
        "peep_cmh2o": 5.0,
        "respiratory_rate_bpm": 14.0,
        "compliance_ml_cmh2o": 50.0,
        "resistance_cmh2o_l_s": 5.0,
    })
    pip = result["peak_pressure_cmh2o"]
    p_plat = result["plateau_pressure_cmh2o"]
    p_mean = result["mean_airway_pressure_cmh2o"]
    flow = result["inspiratory_flow_l_min"]
    minute_vent = result["minute_ventilation_l_min"]
    assert 12 < pip < 25, f"PIP out of range: {pip}"
    assert 12 < p_plat < 18, f"P_plateau out of range: {p_plat}"
    assert 5 < p_mean < 15, f"mean airway P out of range: {p_mean}"
    assert 15 < flow < 35, f"insp flow out of range: {flow}"
    assert 6 < minute_vent < 8, f"minute vent out of range: {minute_vent}"
    return f"PIP={pip}, P_plat={p_plat}, V_E={minute_vent} L/min"


@case("peep_valve_sizing",
      "PEEP target 8 cmH2O, flow 120 L/min → relief 60 cmH2O, Cv 1-15",
      "custom")
def t_peep_valve():
    result = run_wrapper("peep_valve_sizing.py", {
        "peep_target_cmh2o": 8.0,
        "max_flow_l_min": 120.0,
        "valve_type": "electronic",
    })
    cv = result["valve_cv_required"]
    relief = result["relief_pressure_setting_cmh2o"]
    dead = result["dead_space_ml"]
    compliant = result["iso_80601_2_12_compliant"]
    assert 0.5 < cv < 20, f"Cv out of range: {cv}"
    assert 55 < relief <= 80, f"relief pressure out of range: {relief}"
    assert dead < 30, f"dead space too high: {dead}"
    assert compliant, "should be ISO compliant"
    return f"Cv={cv}, relief={relief} cmH2O, dead={dead} mL"


# ----- Class 20: dialysis_machine -----

@case("osmosis_membrane",
      "1.8 m² high-flux, Q_b=350 mL/min, Q_d=500 mL/min, 4hr, V=42L → "
      "urea clearance 280-350 mL/min, Kt/V > 1.2",
      "custom")
def t_osmosis_membrane():
    result = run_wrapper("osmosis_membrane.py", {
        "membrane_area_m2": 1.8,
        "blood_flow_ml_min": 350.0,
        "dialysate_flow_ml_min": 500.0,
        "session_minutes": 240.0,
        "patient_v_total_l": 42.0,
        "solute": "urea",
    })
    k_urea = result["urea_clearance_ml_min"]
    kt_v = result["Kt_V_per_session"]
    urr = result["URR_pct"]
    assert 250 < k_urea < 350, f"urea clearance out of range: {k_urea}"
    assert 1.2 < kt_v < 2.5, f"Kt/V out of range: {kt_v}"
    assert 65 < urr < 95, f"URR out of range: {urr}"
    return f"K_urea={k_urea} mL/min, Kt/V={kt_v}, URR={urr}%"


@case("blood_pump_sizing",
      "350 mL/min target, 200 mmHg head, 8mm tubing → RPM 30-50, hemolysis low",
      "custom")
def t_blood_pump_sizing():
    result = run_wrapper("blood_pump_sizing.py", {
        "target_flow_ml_min": 350.0,
        "pressure_head_mmhg": 200.0,
        "tubing_id_mm": 8.0,
    })
    rpm = result["pump_rpm"]
    hemo = result["hemolysis_risk_score"]
    torque = result["motor_torque_ncm"]
    assert 30 < rpm < 60, f"pump RPM out of range: {rpm}"
    assert hemo == "low", f"hemolysis risk not low: {hemo}"
    assert 10 < torque < 200, f"motor torque out of range: {torque}"
    return f"RPM={rpm}, hemolysis={hemo}, T_motor={torque} N·cm"


# ============================================================================
# Main
# ============================================================================

ALL_TESTS = [
    # HVAC application
    t_hvac_load_sizing,
    t_dehumidification_calc,
    t_fan_coil_sizing,
    # solar_inverter
    t_mppt_tracking_model,
    # wind_turbine
    t_wind_resource_model,
    t_gearbox_load_spectrum,
    # hydrogen_electrolyser
    t_electrolyser_efficiency,
    t_pem_membrane_sizing,
    # ups_inverter
    t_runtime_calc,
    # 3d_printer_fdm
    t_extruder_thermal,
    t_motion_kinematics,
    # cnc_machine
    t_spindle_thermal,
    t_mrr_chip_load,
    # e_bike
    t_rolling_resistance,
    t_gear_ratio,
    # smallsat
    t_orbital_thermal,
    t_attitude_torque,
    # ambiance LEO extension
    t_nrlmsise00_leo,
    # ventilator
    t_flow_compliance,
    t_peep_valve,
    # dialysis_machine
    t_osmosis_membrane,
    t_blood_pump_sizing,
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
    print(f"NEW CLASS-PLAN TOOL SMOKE TESTS  —  {pass_count}/{total} PASS")
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
