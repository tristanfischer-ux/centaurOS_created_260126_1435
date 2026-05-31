#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/grounding_lightning.py

IEC 62305 lightning protection + earthing impedance per BS 7430.

Earthing resistance (single rod, Dwight formula):
    R = (ρ / (2π × L)) × (ln(8L/d) - 1)
where:
    ρ = soil resistivity (Ω·m)
    L = rod length (m)
    d = rod diameter (m)

For multiple rods spaced > 2× rod length:
    R_combined = R_single / N × (1 + K/N)
where K = 0.5-0.7 (mutual coupling factor)

IEC 62305 Lightning Protection Levels:
- LPL I:   99% protection efficiency, current 200 kA peak
- LPL II:  97% protection, current 150 kA peak
- LPL III: 91% protection, current 100 kA peak
- LPL IV:  84% protection, current 75 kA peak

Bonding conductor sizing per IEC 62305-3 Table 7:
- LPL I: ≥50 mm² Cu down conductor
- LPL II: ≥35 mm² Cu
- LPL III/IV: ≥25 mm² Cu

For BESS / industrial: typically LPL II or III (97% / 91% efficiency).

Target earth resistance:
- Standard installations: ≤ 10 Ω
- Lightning protection: ≤ 10 Ω (≤4 Ω preferred for grid-tied)
- Telecoms / sensitive: ≤ 5 Ω

References:
- IEC 62305-1:2010 + Amd 1 / Amd 2 :2021
- IEC 62305-3:2010 (LPS protection)
- BS 7430:2011+A1:2015 (Code of practice for protective earthing)
- IEEE Std 81-2012 (Earth resistance measurement)
"""
from __future__ import annotations

import json
import math
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'grounding_lightning (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'IEC 62305-1/2/3/4:2010 (Protection against lightning); BS 7430:2011 (Earthing)',
    "physics_basis": 'Earth-electrode impedance from rod resistance R = ρ_soil / (2πL) × ln(8L/d). LPL (Lightning Protection Level) per IEC 62305-2.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


def single_rod_resistance(rho: float, L: float, d: float) -> float:
    """Single vertical rod Dwight formula."""
    if L <= 0 or d <= 0 or rho <= 0:
        return float("inf")
    return (rho / (2.0 * math.pi * L)) * (math.log(8.0 * L / d) - 1.0)


def multi_rod_resistance(R_single: float, N: int, mutual_factor: float = 0.6) -> float:
    if N <= 1:
        return R_single
    return (R_single / N) * (1.0 + mutual_factor / N)


def compute(payload: dict) -> dict:
    rho = float(payload.get("site_soil_resistivity_ohm_m", 100))
    dims = payload.get("container_dimensions_m", {})
    L_container = float(dims.get("l", 12.0))
    W_container = float(dims.get("w", 2.5))
    H_container = float(dims.get("h", 2.6))
    rod_count = int(payload.get("rod_count", 4))
    rod_length_m = float(payload.get("rod_length_m", 3.0))
    rod_diameter_mm = float(payload.get("rod_diameter_mm", 16.0))
    rod_diameter_m = rod_diameter_mm / 1000.0
    lpl_target = str(payload.get("lpl_target", "II")).upper()

    # Single-rod resistance
    R_single = single_rod_resistance(rho, rod_length_m, rod_diameter_m)
    # Multi-rod combined (mutual factor decreases for closer spacing; default 0.6)
    R_combined = multi_rod_resistance(R_single, rod_count, mutual_factor=0.6)

    # Determine actual LPL achieved
    if R_combined <= 4.0:
        lpl_achieved = "I"
        protection_pct = 99
    elif R_combined <= 10.0:
        lpl_achieved = "II"
        protection_pct = 97
    elif R_combined <= 20.0:
        lpl_achieved = "III"
        protection_pct = 91
    elif R_combined <= 50.0:
        lpl_achieved = "IV"
        protection_pct = 84
    else:
        lpl_achieved = "NONE"
        protection_pct = 0

    # Bonding conductor sizing per IEC 62305-3 Table 7
    bonding_lpl = {"I": 50, "II": 35, "III": 25, "IV": 25}
    bonding_mm2 = bonding_lpl.get(lpl_target, 25)

    # Down conductor count: per IEC 62305-3, one down conductor per 10m of building perimeter for LPL I,
    # per 15m for II, per 20m for III/IV.
    perimeter = 2 * (L_container + W_container)
    spacing_map = {"I": 10, "II": 15, "III": 20, "IV": 20}
    spacing = spacing_map.get(lpl_target, 15)
    down_conductor_count = max(2, math.ceil(perimeter / spacing))

    # Air terminal (rolling sphere)
    rolling_sphere_radius_m = {"I": 20, "II": 30, "III": 45, "IV": 60}.get(lpl_target, 30)
    air_terminal_h_m = 1.0   # standard finial height
    # Mesh size per IEC 62305-3 Table 2
    mesh_size_m = {"I": 5, "II": 10, "III": 15, "IV": 20}.get(lpl_target, 10)

    # Peak lightning current per LPL
    peak_current_ka = {"I": 200, "II": 150, "III": 100, "IV": 75}.get(lpl_target, 100)

    # Step / touch voltage check (very simplified)
    # V_step ≈ ρ × I_peak / (2π × distance)   -- at 1m, this can be MV-scale, so a step potential
    # mat is mandatory in pedestrian areas around the container.
    step_voltage_at_1m_kv = (rho * peak_current_ka) / (2.0 * math.pi * 1.0) / 1000.0

    # Cost rough order
    rod_cost = rod_count * 80              # £80 per Cu-bonded rod
    bonding_cost = perimeter * 1.5 * 35    # £35/m for 35mm² Cu down conductor
    air_term_cost = down_conductor_count * 250
    cad_pit_cost = 2000                      # inspection pits + connection plates
    total_install = rod_cost + bonding_cost + air_term_cost + cad_pit_cost

    return {
        "ground_resistance_ohm": round(R_combined, 2),
        "single_rod_resistance_ohm": round(R_single, 2),
        "lightning_protection_level": "LPL_" + lpl_achieved,
        "lpl_achieved": lpl_achieved,
        "protection_efficiency_pct": protection_pct,
        "lpl_target": lpl_target,
        "meets_lpl_target": (lpl_achieved <= lpl_target) if lpl_achieved != "NONE" else False,
        "bonding_conductor_mm2": bonding_mm2,
        "down_conductor_count": down_conductor_count,
        "down_conductor_spacing_m": spacing,
        "rolling_sphere_radius_m": rolling_sphere_radius_m,
        "mesh_size_m": mesh_size_m,
        "peak_design_current_ka": peak_current_ka,
        "step_voltage_at_1m_kv": round(step_voltage_at_1m_kv, 2),
        "step_potential_mat_required": (step_voltage_at_1m_kv > 0.5),
        "perimeter_m": round(perimeter, 1),
        "soil_resistivity_ohm_m": rho,
        "rod_count": rod_count,
        "rod_length_m": rod_length_m,
        "rod_diameter_mm": rod_diameter_mm,
        "estimated_installed_cost_gbp": round(total_install),
        "compliance_iec_62305": (R_combined <= 10.0),
        "notes": (
            "Earth resistance per Dwight formula (BS 7430 Annex B). "
            "Multi-rod uses 0.6 mutual coupling factor (rods spaced > 2L). "
            "Lower soil resistivity = lower R_combined: clay 50-100 Ω·m, "
            "sand 200-500, rock 1000+. Add bentonite or rod extensions if high."
        ),
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
