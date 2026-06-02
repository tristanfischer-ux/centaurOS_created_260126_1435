#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/cable_ampacity.py

DC bus + AC bus cable sizing per IEC 60364-5-52.

Reference current ratings (table A.52.4 / A.52.5) for thermoplastic-insulated
cables (XLPE rated 90°C conductor) in different installation methods.

Voltage drop per Equation B.52: V_drop = I × L × (2 × R/1000), where R is
cable resistivity in Ω/km. For copper at 20°C: R = 17.241 / A_mm² (typical
single-core). For aluminium: R = 28.265 / A_mm².

Installation methods (per Table B.52.4):
- A1 (insulated conductors in conduit on wall): derating ~ 0.80
- B1 (insulated conductors in conduit free air): 1.00
- D1 (buried direct in ground): derating ~ 0.85 (depends on resistivity)
- E (in open air, perforated cable tray): 1.05
- F (clipped on perforated tray, single core): 1.00

References:
- IEC 60364-5-52:2009 Electrical installations of buildings
- BS 7671 Wiring Regulations 18th edition (UK)
- NEC NFPA 70 Article 310 (US)
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'cable_ampacity (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'IEC 60364-5-52:2009 (Wiring systems); IEEE 835-1994 (Standard Power Cable Ampacity Tables); IEC 60287 (cable rating)',
    "physics_basis": 'Steady-state thermal: I² × R = h × A × (T_conductor - T_amb). De-rating factors for grouping + ambient + installation method.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Conductor resistivity at 20°C (Ω·mm²/m -- multiply by 1000 = Ω/km per mm²)
RHO_CU_20C = 0.0172  # Ω·mm²/m (1/(58e6 S/m))
RHO_AL_20C = 0.0282  # Ω·mm²/m

# Standard CSA sizes (mm²) per IEC 60228
STD_CSA = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300, 400, 500, 630, 800, 1000]

# Reference ampacity at 30°C ambient, single circuit, copper conductor, XLPE 90°C
# Method B1 (insulated single conductors in conduit, free air)
AMPACITY_CU_XLPE_B1 = {
    1.5: 17, 2.5: 24, 4: 33, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125,
    50: 151, 70: 192, 95: 232, 120: 269, 150: 309, 185: 353, 240: 415,
    300: 477, 400: 565, 500: 651, 630: 749, 800: 855, 1000: 971,
}

# Ampacity in open air on perforated tray, single core, XLPE Cu (Method F)
AMPACITY_CU_XLPE_F = {
    16: 113, 25: 150, 35: 184, 50: 222, 70: 280, 95: 338, 120: 392,
    150: 451, 185: 514, 240: 607, 300: 698, 400: 819, 500: 941,
    630: 1083, 800: 1242, 1000: 1407,
}

# Buried direct
AMPACITY_CU_XLPE_BURIED = {
    16: 79, 25: 102, 35: 122, 50: 144, 70: 178, 95: 211, 120: 240,
    150: 271, 185: 304, 240: 351, 300: 396, 400: 459, 500: 513,
}

# Aluminium ratings are ~78% of Cu
def al_factor(cu_amps: float) -> float:
    return cu_amps * 0.78

# Ambient temperature derating (XLPE 90°C insulation)
TEMP_DERATING_XLPE = {
    20: 1.04, 25: 1.02, 30: 1.00, 35: 0.96, 40: 0.91,
    45: 0.87, 50: 0.82, 55: 0.76, 60: 0.71, 65: 0.65, 70: 0.58,
}


def get_temp_derating(t_amb: float) -> float:
    keys = sorted(TEMP_DERATING_XLPE.keys())
    if t_amb <= keys[0]:
        return TEMP_DERATING_XLPE[keys[0]]
    if t_amb >= keys[-1]:
        return TEMP_DERATING_XLPE[keys[-1]]
    # Linear interpolation
    for i in range(len(keys) - 1):
        if keys[i] <= t_amb <= keys[i + 1]:
            x0, x1 = keys[i], keys[i + 1]
            y0, y1 = TEMP_DERATING_XLPE[x0], TEMP_DERATING_XLPE[x1]
            return y0 + (y1 - y0) * (t_amb - x0) / (x1 - x0)
    return 1.00


def compute(payload: dict) -> dict:
    current_a = float(payload.get("continuous_current_a", 100))
    ambient_c = float(payload.get("ambient_c", 30))
    installation = str(payload.get("installation", "tray")).lower()
    material = str(payload.get("cable_material", "copper")).lower()
    voltage_v = float(payload.get("voltage_class_v", 400))
    length_m = float(payload.get("length_m", 10))
    voltage_drop_max_pct = float(payload.get("voltage_drop_max_pct", 3.0))

    # Pick ampacity table
    if installation in ("open_air", "tray"):
        table = AMPACITY_CU_XLPE_F
    elif installation in ("conduit",):
        table = AMPACITY_CU_XLPE_B1
    elif installation in ("buried",):
        table = AMPACITY_CU_XLPE_BURIED
    else:
        table = AMPACITY_CU_XLPE_F  # default

    temp_factor = get_temp_derating(ambient_c)
    is_aluminium = material == "aluminium"

    # Find smallest CSA where derated ampacity >= current
    selected_csa = None
    rated_amps = 0
    for csa in sorted(table.keys()):
        base = table[csa]
        if is_aluminium:
            base = al_factor(base)
        derated = base * temp_factor
        if derated >= current_a:
            selected_csa = csa
            rated_amps = derated
            break
    if selected_csa is None:
        return {"error": f"No standard CSA up to 1000mm² can carry {current_a}A at {ambient_c}°C."}

    # Voltage drop check: V_drop = I × L × 2 × R / A
    # R = rho / A_mm² in Ω/m per mm²
    rho = RHO_AL_20C if is_aluminium else RHO_CU_20C
    resistance_ohm_km = (rho * 1000.0) / selected_csa  # Ω/km
    # DC drop (2 conductors for round trip in DC system, 1 for 3-phase AC star)
    is_dc = voltage_v <= 1500
    multiplier = 2.0 if is_dc else 1.732
    v_drop = current_a * length_m * resistance_ohm_km / 1000.0 * multiplier
    v_drop_pct = (v_drop / voltage_v) * 100.0

    # If V drop too high, step up to next size
    upgrade_for_vdrop = False
    while v_drop_pct > voltage_drop_max_pct:
        # next CSA
        next_csa = None
        for csa in sorted(table.keys()):
            if csa > selected_csa:
                next_csa = csa
                break
        if next_csa is None:
            break
        upgrade_for_vdrop = True
        selected_csa = next_csa
        resistance_ohm_km = (rho * 1000.0) / selected_csa
        v_drop = current_a * length_m * resistance_ohm_km / 1000.0 * multiplier
        v_drop_pct = (v_drop / voltage_v) * 100.0
        # Update rated amps
        base = table.get(selected_csa, 0)
        if is_aluminium:
            base = al_factor(base)
        rated_amps = base * temp_factor

    # Mass per metre (approximate)
    # Cu density 8960 kg/m³, Al density 2700 kg/m³, insulation+armour ~20% extra
    density = 2700 if is_aluminium else 8960
    cond_mass_per_m_kg = (selected_csa / 1e6) * density  # mm² to m² (1e6), × density
    cable_mass_per_m_kg = cond_mass_per_m_kg * 1.25

    # Worked calculations — post CSA-selection arithmetic only.
    # CSA selection itself is a table-lookup loop (skip).
    # Ambient derating is interpolated from a table (skip as input symbol).
    res_r = round(resistance_ohm_km, 4)
    v_drop_r = round(v_drop, 2)
    v_drop_pct_r = round(v_drop_pct, 3)
    mass_per_m_r = round(cable_mass_per_m_kg, 3)
    total_mass_r = round(cable_mass_per_m_kg * length_m, 2)

    worked = [
        worked_calc(
            label="Cable resistance per km",
            formula="R_per_km = (rho x 1000) / csa",
            values={
                "rho": (rho, "ohm.mm2/m"),
                "csa": (selected_csa, "mm2"),
            },
            result=res_r, result_unit="ohm/km",
            assumptions=[
                f"rho at 20 degC for {'aluminium' if is_aluminium else 'copper'}",
                "IEC 60228 conductor resistivity",
            ],
        ),
        worked_calc(
            label="Voltage drop",
            formula="v_drop = I x length_m x R_per_km x multiplier / 1000",
            values={
                "I": (current_a, "A"),
                "length_m": (length_m, "m"),
                "R_per_km": (res_r, "ohm/km"),
                "multiplier": (multiplier, ""),
            },
            result=v_drop_r, result_unit="V",
            assumptions=[
                "multiplier = 2.0 for DC (return path); 1.732 for 3-phase AC",
                f"circuit is {'DC' if is_dc else 'AC'} (voltage_v = {voltage_v} V)",
            ],
        ),
        worked_calc(
            label="Voltage drop percentage",
            formula="v_drop_pct = (v_drop / voltage_v) x 100",
            values={
                "v_drop": (v_drop_r, "V"),
                "voltage_v": (voltage_v, "V"),
            },
            result=v_drop_pct_r, result_unit="%",
            assumptions=[],
        ),
        worked_calc(
            label="Conductor mass per metre",
            formula="cond_mass_per_m = (csa / 1e6) x density",
            values={
                "csa": (selected_csa, "mm2"),
                "density": (density, "kg/m3"),
            },
            result=round(cond_mass_per_m_kg, 4), result_unit="kg/m",
            assumptions=[
                f"density = {density} kg/m3 ({'Al' if is_aluminium else 'Cu'})",
                "1 mm2 = 1e-6 m2",
            ],
        ),
        worked_calc(
            label="Cable (with insulation) mass per metre",
            formula="cable_mass_per_m = cond_mass_per_m x 1.25",
            values={"cond_mass_per_m": (round(cond_mass_per_m_kg, 4), "kg/m")},
            result=mass_per_m_r, result_unit="kg/m",
            assumptions=["1.25 factor covers insulation, armour, and sheath (~25% extra)"],
        ),
        worked_calc(
            label="Total cable mass",
            formula="total_mass = cable_mass_per_m x length_m",
            values={
                "cable_mass_per_m": (mass_per_m_r, "kg/m"),
                "length_m": (length_m, "m"),
            },
            result=total_mass_r, result_unit="kg",
            assumptions=[],
        ),
    ]

    return {
        "csa_mm2": selected_csa,
        "voltage_drop_v": v_drop_r,
        "voltage_drop_pct": v_drop_pct_r,
        "rated_ampacity_a_after_derating": round(rated_amps, 1),
        "temperature_derating_factor": round(temp_factor, 3),
        "material": material,
        "installation_method": installation,
        "resistance_ohm_per_km": res_r,
        "length_m": length_m,
        "mass_kg_per_m": mass_per_m_r,
        "total_mass_kg": total_mass_r,
        "upgraded_for_voltage_drop": upgrade_for_vdrop,
        "is_dc_circuit": is_dc,
        "ampacity_table_used": installation,
        "notes": (
            "Per IEC 60364-5-52 Method B1/F/D1. XLPE 90°C insulation assumed. "
            "Voltage drop ≤ "
            f"{voltage_drop_max_pct}% of {voltage_v} V."
        ),
        "worked": worked,
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
