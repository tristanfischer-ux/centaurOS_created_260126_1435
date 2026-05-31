#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/ph_titration_sizing.py

pH control titration sizing for bioreactors.

Acid/base dose rate calculation:
    H+ added = ΔpH × buffering_capacity × volume
    Where buffering capacity depends on buffer ions present

For E. coli growth on glucose:
    1 mol acid required to neutralise CO2 production per mol cells
    CO2 production: ~30 mmol/L/h at high biomass density

Common acid/base:
- HCl 1M: 1 mol H+/L, common but corrosive
- H3PO4 (phosphoric, 1M): adds phosphate buffer + nutrient
- HNO3 1M: oxidising, less common
- NaOH 1M: 1 mol OH-/L
- KOH 1M: alternative
- NH4OH 10M: provides nitrogen + base (combined)

pH swing without control:
    For E. coli: organic acids drop pH 0.5-2 units in 24h without titration
    For CHO: pH drift -0.3/24h typical (lower metabolism)

References:
- Doran "Bioprocess Engineering" Ch.11
- Sweere et al, "Acid-Base Balance in Microbial Fermentation",
  Biotechnology Advances 1991
- Glassey & Hand, "Strategies for Reactor pH Control", Trends Biotechnol 1997
"""
from __future__ import annotations

import json
import math
import sys
import time


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'ph_titration_sizing (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Doran (2013) 'Bioprocess Engineering Principles' 2nd ed., ch.8; Sigma-Aldrich Buffer Reference",
    "physics_basis": 'Acid/base dose = ΔpH × buffer_capacity × volume. Henderson-Hasselbalch for pH from acid-conjugate ratios.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


def compute(payload: dict) -> dict:
    start_ph = float(payload.get("starting_ph", 7.5))
    target_ph = float(payload.get("target_ph", 7.0))
    volume_l = float(payload.get("working_volume_l", 100))
    co2_production_g_h = float(payload.get("organism_co2_production_g_h", 30))
    acid_concentration_m = float(payload.get("acid_concentration_m", 1.0))   # 1M default
    base_concentration_m = float(payload.get("base_concentration_m", 1.0))   # 1M default
    buffer_capacity_meq_per_l = float(payload.get("buffer_capacity_meq_l", 8))   # typical media
    biomass_g_l = float(payload.get("biomass_g_l", 5.0))

    # Direction of titration
    needs_acid = target_ph < start_ph
    needs_base = target_ph > start_ph
    if start_ph == target_ph:
        return {"acid_dose_rate_ml_min": 0, "base_dose_rate_ml_min": 0,
                "ph_swing_per_minute_uncontrolled": 0, "notes": "pH at target"}

    # Initial bolus to bring to target
    # H+ needed for ΔpH: ~ buffer_capacity × ΔpH × volume / 1000 (in moles)
    delta_ph = abs(target_ph - start_ph)
    mol_h_needed = buffer_capacity_meq_per_l / 1000.0 * delta_ph * volume_l
    initial_dose_l = mol_h_needed / acid_concentration_m
    initial_dose_ml = initial_dose_l * 1000

    # Continuous CO2 → carbonic acid: CO2 + H2O → H2CO3 → HCO3- + H+
    # ~30% of CO2 forms H+ in typical bicarbonate-buffered medium
    co2_mol_per_h = co2_production_g_h / 44.0
    h_plus_mol_per_h = co2_mol_per_h * 0.30

    # If target pH < starting: need acid continuously (organism naturally produces acid)
    # If target pH > starting: continuous CO2 production drives pH down → need base
    if needs_base:
        # CO2 produces H+; base neutralises it
        base_dose_mol_per_h = h_plus_mol_per_h
        base_dose_l_per_h = base_dose_mol_per_h / base_concentration_m
        base_dose_ml_per_min = base_dose_l_per_h * 1000 / 60
        acid_dose_ml_per_min = 0
    elif needs_acid:
        # Organism producing organic acids; we add more acid to push lower
        # Plus need to overcome the CO2-driven H+ already there (it helps)
        # In practice, mostly need a small acid bolus for set-point
        acid_dose_ml_per_min = initial_dose_ml / 30   # bolus over 30 min
        base_dose_ml_per_min = 0

    # pH swing per minute without control
    # H+ added per minute / buffer capacity / volume
    delta_h_per_min = (h_plus_mol_per_h / 60.0) * 1000   # mmol/min
    delta_ph_per_min = delta_h_per_min / (buffer_capacity_meq_per_l * volume_l)
    ph_swing_per_minute_uncontrolled = delta_ph_per_min

    # Total titrant for 24h
    base_l_per_24h = base_dose_mol_per_h * 24 / base_concentration_m if needs_base else 0
    acid_l_per_24h = (initial_dose_ml + acid_dose_ml_per_min * 1440) / 1000 if needs_acid else 0

    return {
        "starting_ph": start_ph,
        "target_ph": target_ph,
        "working_volume_l": volume_l,
        "delta_ph": round(delta_ph, 2),
        "needs_acid": needs_acid,
        "needs_base": needs_base,
        "initial_bolus_dose_ml": round(initial_dose_ml, 2),
        "initial_bolus_mol_h_needed": round(mol_h_needed, 3),
        "co2_production_g_h": co2_production_g_h,
        "h_plus_generation_rate_mol_h": round(h_plus_mol_per_h, 3),
        "acid_dose_rate_ml_min": round(acid_dose_ml_per_min if needs_acid else 0, 3),
        "base_dose_rate_ml_min": round(base_dose_ml_per_min if needs_base else 0, 3),
        "ph_swing_per_minute_uncontrolled": round(ph_swing_per_minute_uncontrolled, 4),
        "acid_l_per_24h": round(acid_l_per_24h, 2),
        "base_l_per_24h": round(base_l_per_24h, 2),
        "buffer_capacity_meq_per_l": buffer_capacity_meq_per_l,
        "acid_concentration_m": acid_concentration_m,
        "base_concentration_m": base_concentration_m,
        "biomass_g_l": biomass_g_l,
        "recommended_titrant": (
            "H3PO4 (phosphoric)" if needs_acid else
            "NH4OH 10M (provides N)" if needs_base else "Neutral"
        ),
        "notes": (
            "pH control via PI loop typically 0.05-0.10 pH offset typical setpoint accuracy. "
            "Initial bolus to set-point + continuous compensation for organism acid production. "
            "Use phosphoric acid (also provides P) or KH2PO4 buffer to reduce titrant volume."
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
