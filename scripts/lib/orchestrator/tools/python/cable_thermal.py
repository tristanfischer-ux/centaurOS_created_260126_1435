#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/cable_thermal.py

EV charging cable + connector thermal sizing per IEC 62893. Reads JSON
from stdin, writes JSON to stdout.

Input:
    {
      "continuous_current_a": 500.0,
      "cable_length_m": 5.0,
      "cooling": "liquid_cooled",      # "passive"|"liquid_cooled"
      "ambient_c": 40.0,
      "conductor_material": "Cu"        # "Cu"|"Al"
    }

Output:
    {
      "cable_temp_rise_c": 35.0,
      "max_continuous_current_a": 500.0,
      "cable_csa_mm2_required": 70.0,
      "liquid_cooling_required_lpm": 1.5,
      "voltage_drop_v": 0.5,
      "ohmic_loss_w": 250,
      ...
    }

Physics:
- Resistance: R = ρ × L / A   (ρ_Cu = 1.72e-8 Ω·m at 20°C)
- Loss: P = I² × R   (Joule heating)
- Temp rise: thermal resistance of insulation + ambient to surroundings
  Passive: ΔT = P × R_th_passive (~1.5 K·m/W for typical EV cable)
  Liquid:  ΔT = P × R_th_liquid (~0.2 K·m/W)
- IEC 62893 limit: T_cable surface ≤ 60°C; T_conductor ≤ 90°C

Cable CSA sizing per IEC 60364-5-52 ampacity tables:
- 50 mm² Cu cable: ~190 A (free air, 30°C)
- 70 mm² Cu: ~240 A
- 95 mm² Cu: ~290 A
- 150 mm² Cu: ~400 A
- 240 mm² Cu: ~530 A
- 300 mm² Cu: ~610 A

For >300 A continuous, liquid cooling is essentially mandatory for
practical cable diameter. Tesla Supercharger V3 (250 A → 250 kW with
liquid cooling, 35 mm² conductor). 350 kW HPC charger uses 500 A +
liquid cooling on 70-95 mm².

References:
- IEC 62893-1:2017 (charging cables for electric vehicles)
- IEC 60364-5-52 ampacity tables
- Lawrence Berkeley Lab "Cable Thermal Performance for EV Fast Charging" (2020)
- DOE Vehicle Tech Office HPC fast charger reports
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'cable_thermal (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "IEC 62893-1:2017 'Charging cables for electric vehicles'; IEC 60364-5-52 (cable ampacity); LBNL DC Charging Cable Cooling Study (2020)",
    "physics_basis": 'Cable temperature rise ΔT = I² × R × R_thermal. Liquid-coolant flow Q = Q_total / (ρ × Cp × ΔT_acceptable).',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Resistivity at 20°C, Ω·m
RHO_CU_20C = 1.72e-8
RHO_AL_20C = 2.82e-8

# Temperature coefficient of resistivity (per °C)
ALPHA_CU = 0.00393
ALPHA_AL = 0.00403

# IEC 60364-5-52 free-air ampacity table (Cu, 30°C ambient, 2-conductor)
# CSA mm², continuous A
CABLE_AMPACITY_TABLE_CU = [
    (10.0, 75),
    (16.0, 100),
    (25.0, 135),
    (35.0, 169),
    (50.0, 207),
    (70.0, 268),
    (95.0, 328),
    (120.0, 383),
    (150.0, 444),
    (185.0, 510),
    (240.0, 607),
    (300.0, 703),
    (400.0, 823),
    (500.0, 946),
    (630.0, 1088),
]

# Approximate mass per metre (kg/m) — round-trip pair
CABLE_MASS_KG_PER_M = {
    10.0: 0.18,
    16.0: 0.27,
    25.0: 0.42,
    35.0: 0.59,
    50.0: 0.85,
    70.0: 1.18,
    95.0: 1.62,
    120.0: 2.04,
    150.0: 2.52,
    185.0: 3.10,
    240.0: 4.04,
    300.0: 5.04,
    400.0: 6.75,
    500.0: 8.50,
    630.0: 10.7,
}


def find_csa_for_passive(current_a: float, ambient_c: float = 30.0,
                         derating_for_ambient: float = 1.0) -> float:
    """Find minimum CSA that supports continuous_current_a passively."""
    # Apply ambient derating (above 30°C: 0.93 at 40°C, 0.87 at 50°C per IEC)
    ambient_derate = 1.0 - (ambient_c - 30.0) * 0.013
    ambient_derate = max(0.5, min(1.0, ambient_derate))
    required_table_a = current_a / ambient_derate
    for csa, amps in CABLE_AMPACITY_TABLE_CU:
        if amps >= required_table_a:
            return csa
    return 630.0  # max in our table


def find_csa_for_liquid_cooled(current_a: float, ambient_c: float = 30.0) -> float:
    """Liquid cooling allows ~2-3x current per CSA vs passive (Tesla V3
    used 35 mm² at 250 A vs ~170 A passive). We use 2.5× factor."""
    LIQUID_BOOST = 2.5
    ambient_derate = 1.0 - (ambient_c - 30.0) * 0.013
    ambient_derate = max(0.5, min(1.0, ambient_derate))
    required_table_a = current_a / (ambient_derate * LIQUID_BOOST)
    for csa, amps in CABLE_AMPACITY_TABLE_CU:
        if amps >= required_table_a:
            return csa
    return 630.0


def compute(payload: dict) -> dict:
    current_a = float(payload.get("continuous_current_a", 500.0))
    cable_length_m = float(payload.get("cable_length_m", 5.0))
    cooling = str(payload.get("cooling", "passive"))
    ambient_c = float(payload.get("ambient_c", 30.0))
    conductor = str(payload.get("conductor_material", "Cu"))

    if cooling not in ("passive", "liquid_cooled"):
        cooling = "passive"
    if conductor not in ("Cu", "Al"):
        conductor = "Cu"

    rho_20 = RHO_CU_20C if conductor == "Cu" else RHO_AL_20C
    alpha = ALPHA_CU if conductor == "Cu" else ALPHA_AL

    if cooling == "liquid_cooled":
        csa_mm2 = find_csa_for_liquid_cooled(current_a, ambient_c)
    else:
        csa_mm2 = find_csa_for_passive(current_a, ambient_c)

    csa_m2 = csa_mm2 * 1e-6

    # Resistance assuming conductor at ~70°C operating temp
    operating_temp_c = 70.0
    rho_op = rho_20 * (1.0 + alpha * (operating_temp_c - 20.0))
    # Round-trip cable: 2× length (DC+ and DC-)
    total_length_m = cable_length_m * 2.0
    resistance_ohm = rho_op * total_length_m / csa_m2

    # Joule heating
    ohmic_loss_w = current_a * current_a * resistance_ohm
    loss_per_meter_w_m = ohmic_loss_w / cable_length_m

    # Voltage drop (full cable length, round trip)
    voltage_drop_v = current_a * resistance_ohm

    # Temp rise: passive ~1.5 K·m/W; liquid ~0.2 K·m/W
    if cooling == "liquid_cooled":
        thermal_resistance_k_w_m = 0.2  # very high heat transfer
    else:
        thermal_resistance_k_w_m = 1.5

    # Cable temp rise per meter × loss_per_meter
    cable_temp_rise_c = thermal_resistance_k_w_m * loss_per_meter_w_m
    cable_surface_temp_c = ambient_c + cable_temp_rise_c

    # IEC 62893 limit: cable surface ≤ 60°C
    surface_ok = cable_surface_temp_c <= 60.0

    # Liquid cooling required lpm calculation
    # Q = m_dot × cp × dT
    # For water: cp = 4186 J/kg/K
    # Acceptable dT = 10K (inlet to outlet)
    # m_dot (kg/s) = ohmic_loss_w / (cp × dT)
    # lpm = m_dot × 60 (water density = 1 kg/L)
    if cooling == "liquid_cooled":
        coolant_dT_k = 10.0
        coolant_cp = 4186.0  # J/kg/K (water)
        m_dot_kg_s = ohmic_loss_w / (coolant_cp * coolant_dT_k)
        liquid_cooling_lpm = m_dot_kg_s * 60.0
    else:
        liquid_cooling_lpm = 0.0

    # Cable mass
    mass_per_m = CABLE_MASS_KG_PER_M.get(csa_mm2, 5.0)
    cable_mass_kg = mass_per_m * cable_length_m

    # IEC 62893 cable diameter approximation: D ≈ 1.6 × sqrt(2 × CSA / π)
    # for 2-conductor + insulation + outer sheath
    conductor_dia_mm = 2.0 * math.sqrt(csa_mm2 / math.pi)
    cable_outer_dia_mm = conductor_dia_mm * 2.5  # insulation + jacket
    if cooling == "liquid_cooled":
        cable_outer_dia_mm *= 1.5  # coolant channels add bulk

    return {
        "continuous_current_a": current_a,
        "cable_length_m": cable_length_m,
        "cooling": cooling,
        "conductor_material": conductor,
        "ambient_c": ambient_c,
        "cable_csa_mm2_required": csa_mm2,
        "resistance_ohm_total": round(resistance_ohm, 5),
        "ohmic_loss_w": round(ohmic_loss_w, 1),
        "loss_per_meter_w_m": round(loss_per_meter_w_m, 2),
        "voltage_drop_v": round(voltage_drop_v, 3),
        "cable_temp_rise_c": round(cable_temp_rise_c, 2),
        "cable_surface_temp_c": round(cable_surface_temp_c, 2),
        "iec_62893_surface_pass": surface_ok,
        "max_continuous_current_a": current_a,  # alias for the requested current
        "liquid_cooling_required_lpm": round(liquid_cooling_lpm, 3),
        "conductor_diameter_mm": round(conductor_dia_mm, 2),
        "cable_outer_diameter_mm": round(cable_outer_dia_mm, 2),
        "cable_mass_kg": round(cable_mass_kg, 2),
        "operating_temp_c_assumed": operating_temp_c,
        "feasibility": "OK" if surface_ok else "REQUIRES_LIQUID_COOLING",
        "_meta": {
            "model": "IEC 62893 cable sizing + Joule heating + thermal resistance to ambient",
            "references": [
                "IEC 62893-1:2017",
                "IEC 60364-5-52 ampacity tables",
                "LBNL Cable Thermal Performance for EV Fast Charging 2020",
            ],
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
        if isinstance(result, dict):
            result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
