#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/downstream_chromatography.py

Downstream purification chromatography column sizing.

Column volume:
    V_col = M_target / (DBC × resin_density)
where:
    M_target = mass of protein to purify (g)
    DBC = dynamic binding capacity (mg/mL resin)
    DBC for typical resins:
      - Protein A (mAb): 30-60 mg/mL
      - Ion exchange (Q/S): 40-100 mg/mL
      - HIC (hydrophobic interaction): 20-40 mg/mL
      - SEC (size exclusion): N/A (fractionation, not binding)
      - Mixed mode: 30-60 mg/mL
      - IMAC (His-tag): 30-60 mg/mL

Column performance (linear velocity):
- Bind & elute: 100-300 cm/h (Protein A, IEX)
- SEC: 30-50 cm/h
- HIC: 200-400 cm/h

Cycle count per resin:
- Protein A: 100-300 cycles (regeneration with NaOH/citric acid)
- IEX/HIC: 100-200 cycles

Yield:
- Capture (Protein A): 90-95%
- Polishing (IEX): 85-95%
- SEC polishing: 95-99%

Eluent buffer volume = ~2-4 × column volume per cycle.

References:
- Carta & Jungbauer, "Protein Chromatography: Process Development and Scale-Up",
  Wiley 2nd ed. 2020
- GE Healthcare Process Chromatography Handbook 2018
- Hahn et al, "Comparison of protein A affinity sorbents", J Chromatogr A 2006
- BioMer (Tosoh Bioscience) media datasheets
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
    "tool_name": 'downstream_chromatography (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Sofer, Hagel (1997) 'Handbook of Process Chromatography', Academic Press; Cytiva Application Note: AKTA Process Scaling",
    "physics_basis": 'Column volume V = capacity_g / (load_g/L_resin). Cycles = total_load / column_capacity. Buffer cost ∝ cycles × volume.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


# Resin properties: DBC (mg/mL resin), cost per L, cycle life
RESIN_PROPS: dict[str, dict] = {
    "protein_a": {
        "dbc_mg_ml": 50,   # typical for new generation Protein A
        "cost_gbp_per_l": 12000,
        "cycles_typical": 200,
        "linear_velocity_cm_h": 200,
        "yield_pct": 92,
    },
    "ion_exchange": {
        "dbc_mg_ml": 80,
        "cost_gbp_per_l": 2500,
        "cycles_typical": 150,
        "linear_velocity_cm_h": 250,
        "yield_pct": 90,
    },
    "ion_exchange_anion_q": {
        "dbc_mg_ml": 80,
        "cost_gbp_per_l": 2500,
        "cycles_typical": 150,
        "linear_velocity_cm_h": 250,
        "yield_pct": 90,
    },
    "ion_exchange_cation_s": {
        "dbc_mg_ml": 75,
        "cost_gbp_per_l": 2500,
        "cycles_typical": 150,
        "linear_velocity_cm_h": 250,
        "yield_pct": 90,
    },
    "hic": {
        "dbc_mg_ml": 30,
        "cost_gbp_per_l": 3500,
        "cycles_typical": 100,
        "linear_velocity_cm_h": 300,
        "yield_pct": 88,
    },
    "sec": {
        "dbc_mg_ml": 0,   # not binding-based
        "cost_gbp_per_l": 8000,
        "cycles_typical": 300,
        "linear_velocity_cm_h": 40,
        "yield_pct": 97,
    },
    "mixed_mode": {
        "dbc_mg_ml": 50,
        "cost_gbp_per_l": 4000,
        "cycles_typical": 150,
        "linear_velocity_cm_h": 200,
        "yield_pct": 88,
    },
    "imac": {
        "dbc_mg_ml": 45,
        "cost_gbp_per_l": 3000,
        "cycles_typical": 150,
        "linear_velocity_cm_h": 200,
        "yield_pct": 90,
    },
}


def compute(payload: dict) -> dict:
    feedstock_volume_l = float(payload.get("feedstock_volume_l", 100))
    target_protein_mass_g = float(payload.get("target_protein_mass_g", 5.0))
    resin_type = str(payload.get("resin_type", "protein_a")).lower()
    dbc_user = payload.get("dbc_mg_per_ml_resin")
    column_diameter_cm = float(payload.get("column_diameter_cm", 14))

    aliases = {"q": "ion_exchange_anion_q", "s": "ion_exchange_cation_s",
                "protein_a_mabselect": "protein_a", "iex": "ion_exchange"}
    resin_type = aliases.get(resin_type, resin_type)

    if resin_type not in RESIN_PROPS:
        return {"error": f"Unknown resin_type. Available: {list(RESIN_PROPS.keys())}"}

    props = RESIN_PROPS[resin_type]
    dbc = float(dbc_user) if dbc_user is not None else props["dbc_mg_ml"]

    # For SEC (no binding), column sized by feedstock volume / cycle
    is_sec = resin_type == "sec"
    if is_sec:
        # Load volume = ≤ 5% of column volume for SEC
        column_volume_l = feedstock_volume_l / 0.05
        cycles = 1
        # Yield per pass
        yield_pct = props["yield_pct"]
    else:
        # Bind & elute
        # Column volume to bind all protein in one pass
        column_volume_l = (target_protein_mass_g * 1000) / dbc / 1000   # L
        # Or split into multiple cycles
        # Typical: load ≤ 80% of DBC capacity per cycle
        single_load_protein_g = column_volume_l * dbc * 1000 / 1000   # g per cycle
        cycles = max(1, math.ceil(target_protein_mass_g / single_load_protein_g))
        yield_pct = props["yield_pct"]

    # Column dimensions: diameter from input, height from volume
    column_area_cm2 = math.pi * (column_diameter_cm / 2) ** 2
    column_volume_ml = column_volume_l * 1000
    column_height_cm = column_volume_ml / column_area_cm2
    bed_height_cm = column_height_cm

    # Eluent volume: ~3 × column volume per cycle for elution + reequilibration
    eluent_volume_per_cycle_l = column_volume_l * 3
    total_eluent_volume_l = eluent_volume_per_cycle_l * cycles

    # Cycle time (linear velocity × bed height)
    linear_velocity = props["linear_velocity_cm_h"]
    time_per_cycle_h = (bed_height_cm * 8) / linear_velocity   # ~8 bed volumes per cycle
    total_cycle_time_h = time_per_cycle_h * cycles

    # Cost analysis
    resin_cost_gbp = column_volume_l * props["cost_gbp_per_l"]
    resin_lifetime_cycles = props["cycles_typical"]
    cost_per_cycle_gbp = resin_cost_gbp / resin_lifetime_cycles

    # Final yield (accumulated over cycles)
    final_yield_pct = yield_pct ** cycles if cycles == 1 else yield_pct

    # Buffer cost (rough): equilibration + wash + elute = 3 different buffers
    buffer_cost_per_l_gbp = 1.50
    total_buffer_cost = total_eluent_volume_l * buffer_cost_per_l_gbp

    # Worked calculations for the PDF appendix.
    # SEC column sizing is feedstock-volume-based (not bind-and-elute); for SEC the
    # column_volume_l formula differs and is shown with a note.
    # cycles is the ceiling of a division — branchy, passed as live input to downstream
    # cost steps.
    col_vol_l_r = round(column_volume_l, 3)
    col_area_r = round(column_area_cm2, 2)
    col_vol_ml_r = round(column_volume_ml, 1)
    # Use 2dp so that col_vol_ml_r / col_area_r evaluates to a value within 0.5% of col_h_r.
    # 1dp (e.g. 0.6 for an actual 0.6496 cm) is 8% away from the substitution result — the
    # reviewer cannot verify 100/153.94 = 0.6 by hand.  At 2dp the gap is <0.1%.
    col_h_r = round(column_height_cm, 2)
    eluent_r = round(eluent_volume_per_cycle_l, 1)
    total_eluent_r = round(total_eluent_volume_l, 1)
    resin_cost_r = round(resin_cost_gbp, 0)
    cost_per_cycle_r = round(cost_per_cycle_gbp, 0)
    worked: list = []
    if not is_sec:
        worked.append(worked_calc(
            label="Column volume required (bind-and-elute)",
            formula="col_vol_l = (target_g x 1000) / dbc / 1000",
            values={
                "target_g": (target_protein_mass_g, "g"),
                "dbc": (dbc, "mg/mL"),
            },
            result=col_vol_l_r,
            result_unit="L",
            assumptions=["full mass bound in single pass; DBC = dynamic binding capacity"],
        ))
    else:
        worked.append(worked_calc(
            label="Column volume required (SEC — feedstock fraction rule)",
            formula="col_vol_l = feedstock_volume_l / 0.05",
            values={"feedstock_volume_l": (feedstock_volume_l, "L")},
            result=col_vol_l_r,
            result_unit="L",
            assumptions=["load volume <= 5% of column volume for size-exclusion chromatography"],
        ))
    worked += [
        worked_calc(
            label="Column cross-sectional area",
            formula="col_area = pi x (diameter / 2)^2",
            values={"diameter": (column_diameter_cm, "cm")},
            result=col_area_r,
            result_unit="cm^2",
        ),
        worked_calc(
            label="Column volume in mL",
            formula="col_vol_ml = col_vol_l x 1000",
            values={"col_vol_l": (col_vol_l_r, "L")},
            result=col_vol_ml_r,
            result_unit="mL",
        ),
        worked_calc(
            label="Column bed height",
            formula="col_height = col_vol_ml / col_area",
            values={"col_vol_ml": (col_vol_ml_r, "mL"), "col_area": (col_area_r, "cm^2")},
            result=col_h_r,
            result_unit="cm",
        ),
        worked_calc(
            label="Eluent volume per cycle",
            formula="eluent_per_cycle = col_vol_l x 3",
            values={"col_vol_l": (col_vol_l_r, "L")},
            result=eluent_r,
            result_unit="L",
            assumptions=["3 column volumes: elution + re-equilibration (Carta & Jungbauer 2020)"],
        ),
        worked_calc(
            label="Total eluent volume",
            formula="total_eluent = eluent_per_cycle x cycles",
            values={"eluent_per_cycle": (eluent_r, "L"), "cycles": (cycles, "")},
            result=total_eluent_r,
            result_unit="L",
        ),
        worked_calc(
            label="Resin cost",
            formula="resin_cost = col_vol_l x cost_per_l",
            values={
                "col_vol_l": (col_vol_l_r, "L"),
                "cost_per_l": (props["cost_gbp_per_l"], "GBP/L"),
            },
            result=resin_cost_r,
            result_unit="GBP",
        ),
        worked_calc(
            label="Resin cost per cycle",
            formula="cost_per_cycle = resin_cost / resin_lifetime_cycles",
            values={
                "resin_cost": (resin_cost_r, "GBP"),
                "resin_lifetime_cycles": (props["cycles_typical"], ""),
            },
            result=cost_per_cycle_r,
            result_unit="GBP",
            assumptions=["resin amortised over typical cycle lifetime"],
        ),
    ]

    return {
        "feedstock_volume_l": feedstock_volume_l,
        "target_protein_mass_g": target_protein_mass_g,
        "resin_type": resin_type,
        "dbc_mg_per_ml_resin": dbc,
        "column_volume_l": round(column_volume_l, 3),
        "column_volume_ml": round(column_volume_ml, 1),
        "column_diameter_cm": column_diameter_cm,
        "column_bed_height_cm": col_h_r,
        "cycle_count": cycles,
        "yield_pct_per_cycle": yield_pct,
        "yield_pct_overall": round(final_yield_pct, 1),
        "eluent_volume_per_cycle_l": round(eluent_volume_per_cycle_l, 1),
        "total_eluent_volume_l": round(total_eluent_volume_l, 1),
        "linear_velocity_cm_h": linear_velocity,
        "time_per_cycle_h": round(time_per_cycle_h, 2),
        "total_cycle_time_h": round(total_cycle_time_h, 1),
        "resin_cost_gbp": round(resin_cost_gbp, 0),
        "resin_cost_per_l_gbp": props["cost_gbp_per_l"],
        "resin_lifetime_cycles": resin_lifetime_cycles,
        "cost_per_cycle_gbp": round(cost_per_cycle_gbp, 0),
        "total_buffer_cost_gbp": round(total_buffer_cost, 0),
        "total_run_cost_gbp": round(resin_cost_gbp + total_buffer_cost, 0),
        "worked": worked,
        "notes": (
            "Per Carta & Jungbauer (2020) Protein Chromatography. "
            "DBC = dynamic binding capacity (typically 70-80% of static capacity). "
            "Protein A is most expensive (£12k/L) but specific for mAb capture. "
            "SEC for desalting/aggregate removal at end of purification train."
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
