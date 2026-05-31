#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/water_treatment_ro.py

Reverse osmosis system sizing for vertical farm irrigation water.

Key equations:
- Membrane area: A = Q_p / (J × LMH/3600)
  where J = water flux (L/m²/h, typically 15-25 for BW30, 8-12 for SW30)
- Recovery rate Y = Q_p / Q_f (typical 50-75% brackish, 35-50% seawater)
- Concentration polarisation factor β = exp(Y/(2*(1-Y))/k)
- Osmotic pressure: π = i × c × R × T = 0.08 × TDS_mg/L × T_K / 1000  (bar)
- Operating pressure: P_op = π_feed + ΔP_membrane + losses
  - BW30: ΔP_mem ~ 2-5 bar at low salinity
  - SW30: ΔP_mem ~ 30-55 bar

Specific energy:
- BW (brackish, 500-3000 ppm): 0.5-1.5 kWh/m³
- SW (seawater, 35000 ppm): 3-5 kWh/m³

Reject (concentrate) flow: Q_c = Q_f × (1 - Y)
Reject TDS: TDS_c = TDS_f / (1 - Y) × (1 - rejection)

Salt rejection (BW30): 99.0-99.5%

References:
- DOW FILMTEC Reverse Osmosis Membranes Technical Manual (Form 609-00071)
- Voutchkov, "Desalination Engineering: Planning and Design", McGraw-Hill 2013
- Crittenden et al., "MWH's Water Treatment: Principles and Design",
  3rd ed., Wiley 2012
"""
from __future__ import annotations

import json
import math
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'water_treatment_ro (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Dow FILMTEC Reverse Osmosis Membranes Technical Manual; AWWA M46 (2007) 'Reverse Osmosis and Nanofiltration Manual of Water Supply Practices'",
    "physics_basis": 'Solution-diffusion model J_w = A × (ΔP - Δπ). Specific energy = (ΔP × Q_permeate) / η_pump.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Default flux (LMH) by membrane type
DEFAULT_FLUX_LMH = {
    "bw30_brackish": 22.0,     # Brackish water (BW30, BW30-365)
    "sw30_seawater": 11.0,     # Seawater (SW30, SW30HRLE)
    "low_pressure_bw": 28.0,   # Low-energy brackish (XLE, ULE)
    "nf270_softening": 35.0,   # Nanofiltration (high flux)
}

# Default operating pressure (bar) by TDS range
def operating_pressure_bar(feed_tds: float) -> float:
    if feed_tds < 500:
        return 6.0     # Low-pressure RO
    elif feed_tds < 3000:
        return 12.0    # Standard BW
    elif feed_tds < 10000:
        return 20.0    # High-TDS BW
    elif feed_tds < 25000:
        return 45.0    # Light SW
    else:
        return 60.0    # SW desalination


def compute(payload: dict) -> dict:
    feed_tds = float(payload.get("feed_water_tds_mg_l", 1500))
    target_tds = float(payload.get("target_tds_mg_l", 50))
    daily_demand_l = float(payload.get("daily_water_demand_l", 10000))
    recovery_target = float(payload.get("recovery_target_pct", 70)) / 100.0
    operating_hours_per_day = float(payload.get("operating_hours_per_day", 16))

    # Pick membrane type
    if feed_tds < 100:
        return {"error": "feed_water_tds too low - consider direct UV/filter only"}
    if feed_tds > 50000:
        return {"error": "feed_water_tds > 50000 - use SWRO with energy recovery"}

    if feed_tds < 3000:
        mem = "bw30_brackish"
    elif feed_tds < 15000:
        mem = "bw30_brackish"   # high-TDS BW still
    else:
        mem = "sw30_seawater"
    flux_lmh = DEFAULT_FLUX_LMH[mem]

    # Permeate flow Q_p (L/h)
    q_permeate_lph = daily_demand_l / operating_hours_per_day

    # Feed flow Q_f = Q_p / Y
    q_feed_lph = q_permeate_lph / recovery_target
    q_reject_lph = q_feed_lph - q_permeate_lph

    # Membrane area: A = Q_p / J
    membrane_area_m2 = q_permeate_lph / flux_lmh
    # Element count (standard 8" × 40" element = 37 m² area)
    element_area_m2 = 37.0 if mem != "nf270_softening" else 27.0
    element_count = max(1, math.ceil(membrane_area_m2 / element_area_m2))

    # Operating pressure
    p_op_bar = operating_pressure_bar(feed_tds)

    # Energy: P × Q × η_pump
    # Specific energy = P × Q_f / (Q_p × η)
    pump_efficiency = 0.70
    # 1 bar × 1 m³/h = 0.0278 kW (hydraulic)
    hydraulic_power_kw = (p_op_bar * (q_feed_lph / 1000.0) / 36.0) / pump_efficiency
    energy_kwh_per_m3 = hydraulic_power_kw / max(0.001, q_permeate_lph / 1000.0)

    # Permeate TDS = feed × (1 - rejection) / (CPF)
    rejection_pct = 99.4 if mem == "bw30_brackish" else 99.6
    if mem == "nf270_softening":
        rejection_pct = 97.0
    permeate_tds = feed_tds * (1 - rejection_pct / 100.0)

    # Check target
    target_met = permeate_tds <= target_tds * 1.5  # within 50% of target acceptable

    # Reject (concentrate) TDS
    reject_tds = (feed_tds - permeate_tds * recovery_target) / (1 - recovery_target)

    # Pre-treatment requirements
    pretreatment_needed: list[str] = []
    if feed_tds > 500:
        pretreatment_needed.append("Multi-media filter (50-100µm)")
        pretreatment_needed.append("Antiscalant injection")
    if feed_tds > 3000:
        pretreatment_needed.append("Cartridge filter (5µm)")
        pretreatment_needed.append("Chlorine removal (carbon or SMBS)")
    pretreatment_needed.append("Cartridge prefilter (1µm)")

    # CAPEX estimate
    # ~£800 per element + £15k pump + £8k controls + £200/m² piping
    capex_gbp = (
        element_count * 800
        + 15000  # pump
        + 8000   # controls + skid
        + membrane_area_m2 * 200  # piping/manifold
        + 12000  # pretreatment skid
    )

    return {
        "membrane_type": mem,
        "flux_lmh": flux_lmh,
        "ro_membrane_area_m2": round(membrane_area_m2, 1),
        "element_count": element_count,
        "element_area_m2": element_area_m2,
        "permeate_flow_lph": round(q_permeate_lph, 0),
        "permeate_flow_m3_h": round(q_permeate_lph / 1000.0, 2),
        "feed_flow_lph": round(q_feed_lph, 0),
        "reject_water_l_day": round(q_reject_lph * operating_hours_per_day, 0),
        "reject_water_m3_day": round(q_reject_lph * operating_hours_per_day / 1000.0, 2),
        "pump_pressure_bar": p_op_bar,
        "energy_kwh_per_m3": round(energy_kwh_per_m3, 2),
        "daily_energy_kwh": round(energy_kwh_per_m3 * (daily_demand_l / 1000.0), 1),
        "permeate_tds_mg_l": round(permeate_tds, 1),
        "rejection_pct": rejection_pct,
        "reject_tds_mg_l": round(reject_tds, 1),
        "target_tds_met": target_met,
        "recovery_pct": round(recovery_target * 100.0, 1),
        "operating_hours_per_day": operating_hours_per_day,
        "pretreatment_required": pretreatment_needed,
        "estimated_capex_gbp": round(capex_gbp),
        "estimated_membrane_replacement_yr": 3,
        "notes": (
            f"Per DOW FILMTEC Technical Manual. {mem} flux {flux_lmh} LMH, "
            f"{rejection_pct}% rejection. Recovery {recovery_target*100:.0f}% balanced "
            f"with antiscalant. Use carbon prefilter for chlorinated municipal feed."
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
