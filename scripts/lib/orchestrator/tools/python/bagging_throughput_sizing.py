#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/bagging_throughput_sizing.py

bagging:throughput-sizing — FIRST-PRINCIPLES sizing of the solids bagging +
packaging line from the product mass rate and bag size: the bag fill rate
(bags/hour), the equivalent bagging-line throughput (kg/h) and the upstream
day-silo storage volume (m3) for each product stream.

WHAT IT DOES
    Given the product mass rate m [t/day], the bag net weight [kg], the daily
    operating hours and a buffer-storage (day-silo) basis:

      bags_day   = m x 1000 / bag_kg                     bags filled per day
      bags_h     = bags_day / hours_per_day              bagger fill rate [bags/h]
      line_kg_h  = bags_h x bag_kg                        line throughput [kg/h]
      V_silo     = (m x 1000 x silo_hours/24) / rho_bulk x (1 + ullage)
                                                          day-silo volume [m3]

WHY (CO2-mineralisation Bagging & Packaging module had NO computation):
    The plant has no bagging sizing tool, so the bagger + silos were LLM-guessed.
    A line SIZED from the real product rates (~2.3 t/day CaCO3, ~3.9 t/day K2SO4
    at 25 kg/bag) IS the BoM line item — bags/h, line kg/h, day-silo m3.

INPUT (JSON on stdin)
    {
      "line_name": "solids bagging line",     # optional label
      "product_mass_rate_t_day": 3.9,         # product mass rate [t/day]
      "bag_kg": 25.0,                          # net bag weight [kg]
      "operating_hours_per_day": 16.0,        # production hours/day (shift basis)
      "silo_buffer_hours": 24.0,              # day-silo storage basis [h of product]
      "bulk_density_kg_m3": 1100.0,           # product loose bulk density [kg/m3]
      "silo_ullage_fraction": 0.15,           # freeboard above working volume (0..1)
      "n_products": 2                          # distinct product silos (info only)
    }

OUTPUT (JSON on stdout)
    bagging_rate_bags_h, bagging_line_kg_h, day_silo_volume_m3, plus bags/day and
    the per-shift basis, a worked[] array (each line hand-checkable) and a
    _provenance block. ERRORS (never fabricates) on non-physical inputs.

LICENCE: tool wrapper internal. Conventional bulk-solids handling design (mass
balance + bulk-density storage volume) — Perry's Chemical Engineers' Handbook
ch.21 (solids handling) / Woodcock & Mason 'Bulk Solids Handling'. NO fabricated
constants. British spelling.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

PROVENANCE = {
    "tool_name": "bagging_throughput_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "Perry's Chemical Engineers' Handbook 8th ed. ch.21 (solids handling, "
        "bin/silo storage volume from bulk density); Woodcock & Mason 'Bulk "
        "Solids Handling' (bagging-line throughput + buffer storage)."
    ),
    "physics_basis": (
        "Mass balance: bags/day = product mass rate / bag net weight; bagger "
        "fill rate bags/h = bags/day / operating hours/day; line throughput "
        "kg/h = bags/h x bag weight. Day-silo volume = stored mass / bulk "
        "density x (1 + ullage), stored mass = mass rate x silo buffer hours. "
        "No fabricated constants."
    ),
    "confidence_class": "standard",
    "last_reviewed_date": "2026-06-04",
}


def compute(payload: dict) -> dict:
    name = str(payload.get("line_name", "bagging line"))

    m_t_day = payload.get("product_mass_rate_t_day")
    if m_t_day is None:
        raise ValueError("provide product_mass_rate_t_day (product mass rate, t/day)")
    m_t_day = float(m_t_day)
    if m_t_day <= 0:
        raise ValueError("product_mass_rate_t_day must be > 0")

    bag_kg = float(payload.get("bag_kg", 25.0))
    if bag_kg <= 0:
        raise ValueError("bag_kg must be > 0")

    hours_per_day = float(payload.get("operating_hours_per_day", 16.0))
    if not 0.0 < hours_per_day <= 24.0:
        raise ValueError("operating_hours_per_day must be in (0, 24]")

    silo_hours = float(payload.get("silo_buffer_hours", 24.0))
    if silo_hours <= 0:
        raise ValueError("silo_buffer_hours must be > 0")

    bulk_density = float(payload.get("bulk_density_kg_m3", 1100.0))
    if bulk_density <= 0:
        raise ValueError("bulk_density_kg_m3 must be > 0")

    ullage = float(payload.get("silo_ullage_fraction", 0.15))
    if not 0.0 <= ullage <= 1.0:
        raise ValueError("silo_ullage_fraction must be in [0, 1]")

    n_products = max(1, int(payload.get("n_products", 1)))

    # ---- Bagging mass balance ----
    product_kg_day = m_t_day * 1000.0
    bags_day = product_kg_day / bag_kg
    bags_h = bags_day / hours_per_day
    line_kg_h = bags_h * bag_kg                       # = product_kg_day / hours_per_day

    # ---- Day-silo storage volume (per product stream) ----
    stored_mass_kg = product_kg_day * (silo_hours / 24.0)
    working_vol_m3 = stored_mass_kg / bulk_density
    silo_vol_m3 = working_vol_m3 * (1.0 + ullage)     # + freeboard ullage

    # ===================== worked[] — chained off rounded intermediates =========
    bags_day_r = round(bags_day, 1)
    bags_h_r = round(bags_h, 2)
    line_kg_h_r = round(line_kg_h, 1)
    stored_mass_r = round(stored_mass_kg, 1)
    working_vol_r = round(working_vol_m3, 3)
    silo_vol_r = round(silo_vol_m3, 3)

    worked = [
        worked_calc(
            label="Bags filled per day",
            formula="bags_day = m x 1000 / bag_kg",
            values={"m": (round(m_t_day, 3), "t/day"), "bag_kg": (bag_kg, "kg")},
            result=bags_day_r, result_unit="bags/day",
            assumptions=["net-weigh bagging mass balance (Perry's ch.21)"],
        ),
        worked_calc(
            label="Bagger fill rate",
            formula="bags_h = bags_day / hours_per_day",
            values={"bags_day": (bags_day_r, "bags/day"), "hours_per_day": (round(hours_per_day, 1), "h")},
            result=bags_h_r, result_unit="bags/h",
            assumptions=[f"{round(hours_per_day, 1)} production hours per day (shift basis)"],
        ),
        worked_calc(
            label="Bagging-line throughput",
            formula="line_kg_h = bags_h x bag_kg",
            values={"bags_h": (bags_h_r, "bags/h"), "bag_kg": (bag_kg, "kg")},
            result=line_kg_h_r, result_unit="kg/h",
            assumptions=["equivalent solids throughput of the bagging line"],
        ),
        worked_calc(
            label="Day-silo stored mass",
            formula="stored = m x 1000 x silo_hours / 24",
            values={"m": (round(m_t_day, 3), "t/day"), "silo_hours": (round(silo_hours, 1), "h")},
            result=stored_mass_r, result_unit="kg",
            assumptions=[f"{round(silo_hours, 1)} h of product buffered upstream of the bagger"],
        ),
        worked_calc(
            label="Day-silo volume",
            formula="V_silo = stored / rho_bulk x (1 + ullage)",
            values={"stored": (stored_mass_r, "kg"), "rho_bulk": (round(bulk_density, 1), "kg/m3"),
                    "ullage": (ullage, "")},
            result=silo_vol_r, result_unit="m3",
            assumptions=[f"loose bulk density {round(bulk_density, 1)} kg/m3",
                         f"+ {round(ullage * 100)}% freeboard ullage (per product silo; {n_products} product stream(s))"],
        ),
    ]

    return {
        "line_name": name,
        "product_mass_rate_t_day": round(m_t_day, 3),
        "bag_kg": bag_kg,
        "operating_hours_per_day": round(hours_per_day, 1),
        "silo_buffer_hours": round(silo_hours, 1),
        "bulk_density_kg_m3": round(bulk_density, 1),
        "silo_ullage_fraction": ullage,
        "n_products": n_products,
        "bags_per_day": round(bags_day, 1),
        "day_silo_stored_mass_kg": round(stored_mass_kg, 1),
        "day_silo_working_volume_m3": round(working_vol_m3, 3),
        # Headline output quantities (names chosen to match the Bagging &
        # Packaging module words — bagging / bag / silo):
        "bagging_rate_bags_h": round(bags_h, 2),
        "bagging_line_kg_h": round(line_kg_h, 1),
        "day_silo_volume_m3": round(silo_vol_m3, 3),
        "worked": worked,
        "data_sources": [
            "Perry's Chemical Engineers' Handbook 8th ed. ch.21 — solids handling, silo storage volume from bulk density",
            "Woodcock & Mason 'Bulk Solids Handling' — bagging-line throughput + buffer storage",
        ],
    }


def main() -> int:
    t = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse: {exc}"}, sys.stdout)
        return 2
    try:
        out = compute(payload)
        out["_provenance"] = PROVENANCE
        out.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t, 3)
    except Exception as exc:  # noqa: BLE001 — surface any failure as structured error
        json.dump({"error": f"{type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(out, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
