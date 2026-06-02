#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/electric_pump_fed.py

Electric-pump-fed rocket propulsion (Rocket Lab Rutherford-class).
Computes pump power, battery mass, motor mass and Isp comparison vs
pressure-fed alternatives.

Companies served: LENA Space (UK?), MaiaSpace (FR), Skyrora.

Input:
    {
      "chamber_pressure_bar": 80.0,
      "propellant_mass_flow_kg_s": 5.0,
      "battery_voltage": 800.0,
      "motor_efficiency": 0.95,
      "burn_time_s": 200.0
    }

Output:
    pump_power_kw, battery_mass_kg, motor_mass_kg,
    isp_vs_pressure_fed_delta_s, total_propulsion_dry_mass_kg, _provenance.

Physics:
  Pump power: P_pump = m_dot * dP / (rho * eta)
  Motor torque: T = P / (2 pi * n_rpm / 60)
  Battery sizing: E = P * t / eta_inv

References:
- Sutton & Biblarz "Rocket Propulsion Elements" 9th ed., ch.6.
- Rocket Lab Electron User Manual v6.6.
- Pratt-Whitney + NASA TM-2003-212620 "Electric Pump Fed Engines for
  Small Launch Vehicles".
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
    "tool_name": "electric_pump_fed (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Sutton & Biblarz (2017) ch.6; "
        "Rocket Lab Electron User Manual v6.6 (2024); "
        "NASA TM-2003-212620 'Electric Pump Fed Engines for Small Launch Vehicles'."
    ),
    "physics_basis": (
        "Pump shaft power P = m_dot * dP / (rho * eta_pump). Electric motor "
        "torque from power-speed product. Lithium-polymer battery energy "
        "density 200 Wh/kg sustained for high C-rate discharge."
    ),
    "confidence_class": "textbook",
    "embedded_constants": {
        "BATTERY_ENERGY_DENSITY_WH_KG": {
            "source": "Rocket Lab Electron battery: ~150 Wh/kg sustained, ~210 Wh/kg peak; LiPo high-C cells",
            "confidence": "industry_typical",
        },
        "MOTOR_POWER_DENSITY_KW_KG": {
            "source": "Rutherford reusable motor: ~3 kW/kg; industry typical PMSM for aerospace",
            "confidence": "industry_typical",
        },
    },
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    p_c_bar = float(payload.get("chamber_pressure_bar", 80.0))
    m_dot_kg_s = float(payload.get("propellant_mass_flow_kg_s", 5.0))
    voltage_v = float(payload.get("battery_voltage", 800.0))
    motor_eff = float(payload.get("motor_efficiency", 0.95))
    burn_time_s = float(payload.get("burn_time_s", 200.0))

    propellant_density_kg_m3 = float(payload.get("propellant_density_kg_m3", 800.0))
    pump_efficiency = float(payload.get("pump_efficiency", 0.7))

    # Pressure drop from tank to chamber
    tank_pressure_bar = 5.0
    dp_bar = (p_c_bar * 1.3 - tank_pressure_bar)  # 30% headroom
    dp_pa = dp_bar * 1e5

    # Hydraulic pump power
    p_hydraulic_w = m_dot_kg_s * dp_pa / propellant_density_kg_m3
    # Shaft pump power
    p_pump_shaft_w = p_hydraulic_w / pump_efficiency
    # Motor electrical power
    p_motor_electrical_w = p_pump_shaft_w / motor_eff
    pump_power_kw = p_motor_electrical_w / 1000.0

    # Battery energy (J), then mass
    energy_required_j = p_motor_electrical_w * burn_time_s
    energy_required_kwh = energy_required_j / 3.6e6
    battery_energy_density_wh_kg = 150.0  # sustained discharge at high C-rate
    battery_mass_kg = (energy_required_kwh * 1000.0) / battery_energy_density_wh_kg

    # Motor mass (3 kW/kg)
    motor_power_density_kw_kg = 3.0
    motor_mass_kg = pump_power_kw / motor_power_density_kw_kg

    # Pump mass (small relative to motor + battery)
    pump_mass_kg = motor_mass_kg * 0.3

    # Inverter mass (for AC motor drive)
    inverter_mass_kg = pump_power_kw * 0.05

    # Total dry mass
    total_dry_mass_kg = battery_mass_kg + motor_mass_kg + pump_mass_kg + inverter_mass_kg

    # Pressure-fed comparison
    # A pressure-fed engine at same Pc needs heavier tanks
    # Isp difference: pressure-fed Pc ~ 15-30 bar gives Isp ~10-30s lower than turbopump/electric
    # Electric pump (Rutherford): ~ same Isp as turbopump (300+ s for LOX/RP1)
    # Vs pressure-fed (15 bar): ~ 270s
    pressure_fed_pc_max_bar = 30.0
    if p_c_bar > pressure_fed_pc_max_bar:
        # Electric pump enables higher Pc → higher Isp
        # Isp gain from Pc 15→80: ~+15s (Sutton fig.3-3)
        isp_gain_pump_s = 15.0 * math.log(p_c_bar / 15.0) / math.log(80.0 / 15.0)
    else:
        isp_gain_pump_s = 0.0

    # Rounded intermediates for display; each step chains off the prior rounded value.
    dp_bar_r = round(dp_bar, 2)
    p_hyd_kw_r = round(p_hydraulic_w / 1000.0, 2)
    p_shaft_kw_r = round(p_pump_shaft_w / 1000.0, 2)
    pump_power_kw_r = round(pump_power_kw, 2)
    energy_kwh_r = round(energy_required_kwh, 2)
    battery_mass_r = round(battery_mass_kg, 1)
    motor_mass_r = round(motor_mass_kg, 2)
    pump_mass_r = round(pump_mass_kg, 2)
    inverter_mass_r = round(inverter_mass_kg, 2)
    total_dry_r = round(total_dry_mass_kg, 1)

    worked = [
        worked_calc(
            label="Pump pressure rise",
            formula="dp_bar = p_c_bar x 1.3 - tank_p_bar",
            values={"p_c_bar": (p_c_bar, "bar"), "tank_p_bar": (tank_pressure_bar, "bar")},
            result=dp_bar_r, result_unit="bar",
            assumptions=["30% headroom above chamber pressure; 5 bar residual tank pressure"],
        ),
        worked_calc(
            label="Hydraulic pump power",
            formula="P_hyd = m_dot x dp_pa / rho / 1000",
            values={
                "m_dot": (m_dot_kg_s, "kg/s"),
                "dp_pa": (round(dp_bar_r * 1e5, 0), "Pa"),
                "rho": (propellant_density_kg_m3, "kg/m3"),
            },
            result=p_hyd_kw_r, result_unit="kW",
            assumptions=["dp_pa = dp_bar x 1e5; / 1000 converts W to kW"],
        ),
        worked_calc(
            label="Pump shaft power",
            formula="P_shaft = P_hyd / pump_eff",
            values={"P_hyd": (p_hyd_kw_r, "kW"), "pump_eff": (pump_efficiency, "")},
            result=p_shaft_kw_r, result_unit="kW",
            assumptions=["pump isentropic efficiency"],
        ),
        worked_calc(
            label="Motor electrical power (pump power)",
            formula="P_motor = P_shaft / motor_eff",
            values={"P_shaft": (p_shaft_kw_r, "kW"), "motor_eff": (motor_eff, "")},
            result=pump_power_kw_r, result_unit="kW",
            assumptions=["motor efficiency from input"],
        ),
        worked_calc(
            label="Battery energy required",
            formula="E_kwh = P_motor x burn_time / 3600",
            values={"P_motor": (pump_power_kw_r, "kW"), "burn_time": (burn_time_s, "s")},
            result=energy_kwh_r, result_unit="kWh",
            assumptions=["P_motor is in kW; P[kW] x t[s] / 3600 = energy in kWh"],
        ),
        worked_calc(
            label="Battery mass",
            formula="m_batt = E_kwh x 1000 / E_density",
            values={
                "E_kwh": (energy_kwh_r, "kWh"),
                "E_density": (battery_energy_density_wh_kg, "Wh/kg"),
            },
            result=battery_mass_r, result_unit="kg",
            assumptions=["150 Wh/kg sustained high-C-rate LiPo (Rocket Lab Electron)"],
        ),
        worked_calc(
            label="Motor mass",
            formula="m_motor = P_motor / P_density",
            values={
                "P_motor": (pump_power_kw_r, "kW"),
                "P_density": (motor_power_density_kw_kg, "kW/kg"),
            },
            result=motor_mass_r, result_unit="kg",
            assumptions=["3 kW/kg PMSM aerospace motor (Rutherford-class)"],
        ),
        worked_calc(
            label="Pump mass",
            formula="m_pump = m_motor x 0.3",
            values={"m_motor": (motor_mass_r, "kg")},
            result=pump_mass_r, result_unit="kg",
            assumptions=["pump body ~30% of motor mass (industry rule of thumb)"],
        ),
        worked_calc(
            label="Inverter mass",
            formula="m_inv = P_motor x 0.05",
            values={"P_motor": (pump_power_kw_r, "kW")},
            result=inverter_mass_r, result_unit="kg",
            assumptions=["0.05 kg/kW for compact aerospace inverter"],
        ),
        worked_calc(
            label="Total propulsion dry mass",
            formula="m_dry = m_batt + m_motor + m_pump + m_inv",
            values={
                "m_batt": (battery_mass_r, "kg"),
                "m_motor": (motor_mass_r, "kg"),
                "m_pump": (pump_mass_r, "kg"),
                "m_inv": (inverter_mass_r, "kg"),
            },
            result=total_dry_r, result_unit="kg",
            assumptions=["sum of battery, motor, pump and inverter dry masses"],
        ),
    ]

    return {
        "chamber_pressure_bar": p_c_bar,
        "propellant_mass_flow_kg_s": m_dot_kg_s,
        "battery_voltage_v": voltage_v,
        "motor_efficiency": motor_eff,
        "burn_time_s": burn_time_s,
        "pump_efficiency": pump_efficiency,
        "pressure_drop_bar": dp_bar_r,
        "hydraulic_power_kw": p_hyd_kw_r,
        "pump_shaft_power_kw": p_shaft_kw_r,
        "pump_power_kw": pump_power_kw_r,
        "energy_required_kwh": energy_kwh_r,
        "battery_mass_kg": battery_mass_r,
        "motor_mass_kg": motor_mass_r,
        "pump_mass_kg": pump_mass_r,
        "inverter_mass_kg": inverter_mass_r,
        "total_propulsion_dry_mass_kg": total_dry_r,
        "isp_vs_pressure_fed_delta_s": round(isp_gain_pump_s, 1),
        "battery_energy_density_wh_kg": battery_energy_density_wh_kg,
        "motor_power_density_kw_kg": motor_power_density_kw_kg,
        "worked": worked,
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
