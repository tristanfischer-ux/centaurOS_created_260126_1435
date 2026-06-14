#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/electrical_transformer_sizing.py

electrical:transformer-sizing — FIRST-PRINCIPLES sizing of the plant supply
(distribution) transformer from the connected electrical load: apparent power
(kVA) from the active load + power factor, a headroom (spare-capacity) margin to
pick the next standard rating, and the primary + secondary line currents at the
stated voltages.

WHAT IT DOES
    Given the plant active electrical load P [kW], the load power factor pf, a
    spare-capacity headroom and the primary/secondary line-to-line voltages:

      S_load   = P / pf                                  apparent power demand [kVA]
      S_req    = S_load x (1 + headroom)                 + spare capacity
      S_rated  = next standard IEC 60076 rating >= S_req (transformer nameplate kVA)
      I_pri    = S_rated x 1000 / (sqrt(3) x V_pri)      primary line current  [A] (3-ph)
      I_sec    = S_rated x 1000 / (sqrt(3) x V_sec)      secondary line current [A] (3-ph)

WHY (CO2-mineralisation Electrical Distribution module had NO computation):
    The plant has no electrical sizing tool, so the distribution transformer +
    feeder were LLM-guessed. A transformer SIZED from the real ~561 kW connected
    load (the steam boiler, duct heaters, shrink tunnel, pumps/agitators/blowers)
    IS the BoM line item — kVA nameplate + primary/secondary currents.

INPUT (JSON on stdin)
    {
      "transformer_name": "plant distribution transformer", # optional label
      "plant_load_kw": 561.0,            # connected active electrical load [kW]
      "power_factor": 0.9,              # load displacement power factor (0..1]
      "headroom_fraction": 0.25,        # spare-capacity margin over demand (0..1)
      "primary_voltage_v": 11000.0,     # HV primary line-to-line voltage [V]
      "secondary_voltage_v": 400.0,     # LV secondary line-to-line voltage [V]
      "phases": 3,                      # 3 (3-phase) or 1 (single-phase)
      "standard_ratings_kva": [...]     # optional override of the IEC rating ladder
    }

OUTPUT (JSON on stdout)
    transformer_kva (nameplate), primary/secondary line currents, the apparent
    power demand + required-with-headroom, plus a worked[] array (each line
    hand-checkable) and a _provenance block.

LICENCE: tool wrapper internal. Standard sizing per IEC 60076 (power
transformers) / IEC 60909 load-current basis. NO fabricated constants — the
standard preferred-rating ladder is the published IEC 60076-1 / R10-derived
series. British spelling.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402  (same-dir shared helper)

PROVENANCE = {
    "tool_name": "electrical_transformer_sizing (custom)",
    "tool_version": "1.0.0",
    "tool_license": "proprietary",
    "tool_source_url": "(in-tree)",
    "tool_paper": (
        "IEC 60076-1 'Power transformers — General' (rating + standard kVA "
        "series); IEC 60909-0 (short-circuit / load current basis); "
        "IET BS 7671 §551 + Schneider 'Electrical Installation Guide' "
        "(transformer current = S / (sqrt(3) x U) for a 3-phase supply)."
    ),
    "physics_basis": (
        "Apparent power S = P / pf (kVA from active kW and displacement power "
        "factor). Transformer nameplate = the smallest IEC 60076 preferred "
        "rating >= S x (1 + headroom). Three-phase line current "
        "I = S x 1000 / (sqrt(3) x U_LL); single-phase I = S x 1000 / U. "
        "No fabricated constants; the preferred-rating ladder is the published "
        "IEC standard kVA series."
    ),
    "confidence_class": "standard",
    "last_reviewed_date": "2026-06-04",
}

# Standard IEC 60076 distribution/power transformer preferred kVA ratings.
STANDARD_KVA_LADDER = [
    25, 50, 100, 160, 200, 250, 315, 400, 500, 630, 800,
    1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
]


def _next_standard_kva(s_req_kva: float, ladder: list[float]) -> tuple[float, bool]:
    """Smallest ladder rating >= s_req_kva. If the demand exceeds the largest
    ladder entry, return that demand rounded UP to the next 100 kVA (bespoke
    rating) and flag that it is off-ladder — never silently under-size."""
    for r in sorted(ladder):
        if r >= s_req_kva - 1e-9:
            return float(r), False
    bespoke = math.ceil(s_req_kva / 100.0) * 100.0
    return float(bespoke), True


def compute(payload: dict) -> dict:
    name = str(payload.get("transformer_name", "distribution transformer"))

    p_kw = payload.get("plant_load_kw")
    if p_kw is None:
        raise ValueError("provide plant_load_kw (connected active electrical load, kW)")
    p_kw = float(p_kw)
    if p_kw <= 0:
        raise ValueError("plant_load_kw must be > 0")

    pf = float(payload.get("power_factor", 0.9))
    if not 0.0 < pf <= 1.0:
        raise ValueError("power_factor must be in (0, 1]")

    headroom = float(payload.get("headroom_fraction", 0.25))
    if not 0.0 <= headroom <= 2.0:
        raise ValueError("headroom_fraction must be in [0, 2]")

    v_pri = float(payload.get("primary_voltage_v", 11000.0))
    v_sec = float(payload.get("secondary_voltage_v", 400.0))
    if v_pri <= 0 or v_sec <= 0:
        raise ValueError("primary/secondary voltages must be > 0")

    phases = int(payload.get("phases", 3))
    if phases not in (1, 3):
        raise ValueError("phases must be 1 or 3")

    ladder = payload.get("standard_ratings_kva") or STANDARD_KVA_LADDER
    # ROBUSTNESS (2026-06-14): tolerate a SCALAR `standard_ratings_kva` (a caller
    # — e.g. the on-the-fly tool-plan bootstrap — that passes a single rating
    # rather than a list). Wrap it so the ladder selection still works instead of
    # raising "'int' object is not iterable". A scalar/iterable both end up as a
    # list of floats; STANDARD_KVA_LADDER is still the default when absent.
    if isinstance(ladder, (int, float)):
        ladder = [ladder]
    ladder = [float(x) for x in ladder]

    # ---- Apparent power demand + required (with headroom) ----
    s_load_kva = p_kw / pf                       # kVA = kW / pf
    s_req_kva = s_load_kva * (1.0 + headroom)    # add spare capacity
    s_rated_kva, off_ladder = _next_standard_kva(s_req_kva, ladder)

    # ---- Line currents at the chosen nameplate rating ----
    if phases == 3:
        i_pri_a = (s_rated_kva * 1000.0) / (math.sqrt(3.0) * v_pri)
        i_sec_a = (s_rated_kva * 1000.0) / (math.sqrt(3.0) * v_sec)
        current_formula = "I = S x 1000 / (sqrt(3) x U_LL)"
        current_assume = "three-phase line current (line-to-line voltage)"
    else:
        i_pri_a = (s_rated_kva * 1000.0) / v_pri
        i_sec_a = (s_rated_kva * 1000.0) / v_sec
        current_formula = "I = S x 1000 / U"
        current_assume = "single-phase line current"

    # ===================== worked[] — chained off rounded intermediates =========
    s_load_r = round(s_load_kva, 2)
    s_req_r = round(s_req_kva, 2)
    s_rated_r = round(s_rated_kva, 2)
    i_pri_r = round(i_pri_a, 2)
    i_sec_r = round(i_sec_a, 2)

    worked = [
        worked_calc(
            label="Apparent power demand",
            formula="S_load = P / pf",
            values={"P": (round(p_kw, 2), "kW"), "pf": (pf, "")},
            result=s_load_r, result_unit="kVA",
            assumptions=["apparent power from active load and displacement power factor (IEC 60076 basis)"],
        ),
        worked_calc(
            label="Required rating with spare capacity",
            formula="S_req = S_load x (1 + headroom)",
            values={"S_load": (s_load_r, "kVA"), "headroom": (headroom, "")},
            result=s_req_r, result_unit="kVA",
            assumptions=[f"{round(headroom * 100)}% spare-capacity headroom over demand"],
        ),
        worked_calc(
            label="Transformer nameplate (next standard rating)",
            formula="S_rated = ceil_to_standard(S_req)",
            values={"S_req": (s_req_r, "kVA")},
            result=s_rated_r, result_unit="kVA",
            assumptions=[
                "smallest IEC 60076 preferred kVA rating >= required",
                *(["demand exceeds the standard ladder — rounded up to the next 100 kVA (bespoke)"] if off_ladder else []),
            ],
        ),
        worked_calc(
            label="Primary line current",
            formula=current_formula,
            values={"S": (s_rated_r, "kVA"), ("U_LL" if phases == 3 else "U"): (round(v_pri, 1), "V")},
            result=i_pri_r, result_unit="A",
            assumptions=[current_assume, "at the chosen nameplate rating"],
        ),
        worked_calc(
            label="Secondary line current",
            formula=current_formula,
            values={"S": (s_rated_r, "kVA"), ("U_LL" if phases == 3 else "U"): (round(v_sec, 1), "V")},
            result=i_sec_r, result_unit="A",
            assumptions=[current_assume, "at the chosen nameplate rating"],
        ),
    ]

    return {
        "transformer_name": name,
        "phases": phases,
        "plant_load_kw": round(p_kw, 2),
        "power_factor": pf,
        "headroom_fraction": headroom,
        "primary_voltage_v": round(v_pri, 1),
        "secondary_voltage_v": round(v_sec, 1),
        "apparent_power_demand_kva": round(s_load_kva, 2),
        "required_with_headroom_kva": round(s_req_kva, 2),
        # Headline output quantities (names chosen to match the Electrical
        # Distribution module words — transformer*):
        "transformer_kva": round(s_rated_kva, 2),
        "transformer_primary_current_a": round(i_pri_a, 2),
        "transformer_secondary_current_a": round(i_sec_a, 2),
        "rating_off_standard_ladder": off_ladder,
        "worked": worked,
        "data_sources": [
            "IEC 60076-1 — power transformers, rating + standard kVA series",
            "IEC 60909-0 — load/short-circuit current basis",
            "Schneider Electrical Installation Guide / IET BS 7671 §551 — transformer line current S/(sqrt(3) x U)",
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
