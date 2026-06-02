#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/runtime_calc.py

UPS / battery runtime calculator at variable load.
Stdin JSON -> stdout JSON.

Input:
    {
      "battery_capacity_kwh": 10.0,
      "load_kw": 2.0,
      "dod_max_pct": 80.0,
      "inverter_efficiency_pct": 92.0,
      "peukert_exponent": 1.10,           # optional, Li-ion ~1.0, lead-acid 1.1-1.3
      "battery_chemistry": "lifepo4"      # lifepo4 | nmc | lead_acid | nicd
    }

Output:
    {
      "runtime_minutes": 270.0,
      "runtime_hours": 4.50,
      "usable_capacity_kwh": 7.4,
      "effective_load_kw": 2.17,
      ...
    }

Method:
  Runtime = (Usable kWh × η_inv) / Load_kW
  - Usable kWh = battery_capacity_kwh × dod_max
  - η_inv ≈ 0.90-0.95 (online double-conversion UPS)
  - Peukert correction for high discharge rates:
      effective_capacity = nominal × (I_ref / I_actual)^(k-1)
    where k = Peukert exponent (Li-ion ≈ 1.0, lead-acid 1.1-1.3, NiCd 1.2-1.4)

Reference: IEEE 1184 Battery Sizing for UPS Applications, IEEE 485
(Vented Lead-Acid Sizing), Peukert 1897 "Über die Abhängigkeit der
Kapazität von der Entladestromstärke bei Bleiakkumulatoren".

License: MIT.
"""
from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'runtime_calc (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "IEEE 1184-2006 'IEEE Guide for Batteries for Uninterruptible Power Supply Systems'; Peukert (1897) for lead-acid",
    "physics_basis": 'Battery runtime = (capacity × DoD × η_inverter) / load_kW. Peukert exponent correction for non-LFP chemistries.',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Peukert exponents by chemistry (typical)
PEUKERT = {
    "lifepo4": 1.03,
    "nmc": 1.05,
    "nca": 1.05,
    "lead_acid": 1.20,
    "vrla": 1.15,
    "agm": 1.13,
    "gel": 1.13,
    "nicd": 1.15,
    "nimh": 1.10,
}

# Self-discharge per month (typical for stored batteries — only matters
# if the user supplies a non-zero "storage_days_since_charge")
SELF_DISCHARGE_PCT_PER_MONTH = {
    "lifepo4": 3.0,
    "nmc": 2.0,
    "lead_acid": 5.0,
    "nicd": 15.0,
}


def compute(payload: dict) -> dict:
    cap_kwh = float(payload.get("battery_capacity_kwh", 10.0))
    load_kw = float(payload.get("load_kw", 2.0))
    dod_pct = float(payload.get("dod_max_pct", 80.0))
    eta_inv_pct = float(payload.get("inverter_efficiency_pct", 92.0))
    chemistry = str(payload.get("battery_chemistry", "lifepo4")).strip().lower()
    peukert_in = payload.get("peukert_exponent")
    storage_days = float(payload.get("storage_days_since_charge", 0.0))

    if peukert_in is not None:
        k = float(peukert_in)
    else:
        k = PEUKERT.get(chemistry, 1.05)

    # Usable energy after DoD limit
    usable_kwh = cap_kwh * (dod_pct / 100.0)
    usable_kwh_pre_storage = usable_kwh  # capture before storage-loss deduction

    # Self-discharge over storage (linear approximation)
    self_disch_pct_month = SELF_DISCHARGE_PCT_PER_MONTH.get(chemistry, 3.0)
    storage_loss_frac = (self_disch_pct_month / 100.0) * (storage_days / 30.0)
    usable_kwh *= max(0.0, 1.0 - storage_loss_frac)

    # Peukert correction — high C-rate reduces effective capacity.
    # Use C-rate = load_kW / cap_kWh as reference. For 1C (C/1) reference
    # the formula: cap_eff / cap_nom = (1 / C_rate)^(k-1)
    c_rate = load_kw / max(1e-3, cap_kwh)
    peukert_factor = (1.0 / max(0.01, c_rate)) ** (k - 1.0) if c_rate > 0 else 1.0
    # Bound the factor so it doesn't blow up for very low C-rates
    peukert_factor = min(1.20, max(0.5, peukert_factor))
    usable_kwh_peukert = usable_kwh * peukert_factor

    # Inverter efficiency on the output
    eta_inv = eta_inv_pct / 100.0
    runtime_h = (usable_kwh_peukert * eta_inv) / max(1e-3, load_kw)
    runtime_min = runtime_h * 60.0

    # Effective load drawing from battery accounting for inverter loss
    effective_load_dc_kw = load_kw / eta_inv

    # Worked calculations.  Peukert factor involves (1/C_rate)^(k-1) (power
    # law — transcendental for non-integer k); pass the rounded result as an
    # opaque input to the runtime step, which is then clean arithmetic.
    # usable_pre_r is the capacity after DoD only (before any storage loss);
    # usable_r is after storage loss (the value that feeds the Peukert step).
    usable_pre_r = round(usable_kwh_pre_storage, 4)
    usable_r = round(usable_kwh, 4)
    storage_loss_frac_r = round(storage_loss_frac, 4)
    usable_p_r = round(usable_kwh_peukert, 4)
    eta_inv_r = round(eta_inv, 4)
    peukert_r = round(peukert_factor, 4)
    runtime_h_r = round(runtime_h, 3)

    worked = [
        worked_calc(
            label="Usable energy after depth-of-discharge limit",
            formula="usable_kwh = cap_kwh x (dod_pct / 100)",
            values={
                "cap_kwh": (cap_kwh, "kWh"),
                "dod_pct": (dod_pct, "%"),
            },
            result=usable_pre_r, result_unit="kWh",
            assumptions=[f"DoD limit {dod_pct}%; battery chemistry {chemistry}"],
        ),
        # Storage-loss step only emitted when storage_days > 0 so the
        # substitution is always clean arithmetic that reproduces usable_r.
        *([worked_calc(
            label="Usable energy after self-discharge during storage",
            formula="usable_after_storage = usable_kwh x (1 - storage_loss_frac)",
            values={
                "usable_kwh": (usable_pre_r, "kWh"),
                "storage_loss_frac": (storage_loss_frac_r, ""),
            },
            result=usable_r, result_unit="kWh",
            assumptions=[
                f"storage_loss_frac = (self_discharge_pct_month / 100) x (storage_days / 30) "
                f"= ({self_disch_pct_month} / 100) x ({storage_days} / 30) = {storage_loss_frac_r}",
                "linear self-discharge approximation (IEEE 1184-2006)",
            ],
        )] if storage_days > 0 else []),
        worked_calc(
            label="Effective battery capacity after Peukert correction",
            formula="usable_peukert = usable_kwh x peukert_factor",
            values={
                "usable_kwh": (usable_r, "kWh"),
                "peukert_factor": (peukert_r, ""),
            },
            result=usable_p_r, result_unit="kWh",
            assumptions=[
                f"Peukert factor = (1/C_rate)^(k-1) = (1/{round(c_rate, 4)})^({round(k, 4)}-1) "
                f"(power-law, pre-computed); k={round(k, 4)} for {chemistry} (IEEE 1184-2006)",
                f"C-rate = {round(c_rate, 4)} (load_kw / cap_kwh)",
            ],
        ),
        worked_calc(
            label="Battery runtime",
            formula="runtime_h = (usable_peukert x eta_inv) / load_kw",
            values={
                "usable_peukert": (usable_p_r, "kWh"),
                "eta_inv": (eta_inv_r, ""),
                "load_kw": (load_kw, "kW"),
            },
            result=runtime_h_r, result_unit="h",
            assumptions=[f"Inverter efficiency {eta_inv_pct}% (online double-conversion UPS)"],
        ),
        worked_calc(
            label="Effective DC load (battery draw)",
            formula="load_dc = load_kw / eta_inv",
            values={
                "load_kw": (load_kw, "kW"),
                "eta_inv": (eta_inv_r, ""),
            },
            result=round(effective_load_dc_kw, 3), result_unit="kW",
            assumptions=["Accounts for inverter losses between battery and AC load"],
        ),
    ]

    return {
        "runtime_minutes": round(runtime_min, 1),
        "runtime_hours": runtime_h_r,
        "usable_capacity_kwh": usable_r,
        "usable_capacity_after_peukert_kwh": usable_p_r,
        "effective_load_kw": round(effective_load_dc_kw, 3),
        "c_rate": round(c_rate, 4),
        "peukert_exponent": round(k, 4),
        "peukert_factor": peukert_r,
        "battery_chemistry": chemistry,
        "inverter_efficiency_pct": eta_inv_pct,
        "dod_max_pct": dod_pct,
        "battery_nominal_kwh": cap_kwh,
        "storage_days_since_charge": storage_days,
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
