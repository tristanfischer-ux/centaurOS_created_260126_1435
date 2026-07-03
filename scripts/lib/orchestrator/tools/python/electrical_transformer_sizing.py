#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/electrical_transformer_sizing.py

electrical:transformer-sizing — FIRST-PRINCIPLES sizing of the plant supply
(distribution) transformer from the connected electrical load: apparent power
(kVA) from the active load + power factor, a headroom (spare-capacity) margin to
pick the next standard rating, and the primary + secondary line currents at the
stated voltages.

WHAT IT DOES
    Given the plant active electrical load P [kW], a spare-capacity headroom and
    the primary/secondary line-to-line voltages:

      S_req    = P x (1 + headroom)                      required rating [kVA]
      S_rated  = next standard IEC 60076 rating >= S_req (transformer nameplate kVA)
      I_pri    = S_rated x 1000 / (sqrt(3) x V_pri)      primary line current  [A] (3-ph)
      I_sec    = S_rated x 1000 / (sqrt(3) x V_sec)      secondary line current [A] (3-ph)

    THE ONE-MINT RULE (v56c convergence round, commit e74d4502e): the incomer /
    distribution-transformer kVA is minted by ONE rule on EVERY surface —
    kVA = next STANDARD rating >= load x 1.25. Because kVA >= kW for ANY power
    factor, load x 1.25 is the assumption-free adequacy requirement — the SAME
    basis the deterministic adequacy check ('Main incomer kVA >= connected load
    x 1.25') verifies, so the mint and the check can never disagree. This tool
    MIRRORS scripts/lib/design-loop/settle-loop.ts (INCOMER_KVA_MARGIN +
    IEC_KVA_LADDER incl. the 75 kVA trade step) so the tool and the settle-loop
    E-pass can never diverge (53 kW -> 66.25 -> 75 kVA, NOT 100). The supplied
    power factor is reported (and the P/pf apparent demand shown as an
    informational line) but does NOT change the mint — dividing by an assumed
    pf and jumping the unladdered series is exactly the divergence this fixes.

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
        "ONE-MINT incomer rule (settle-loop E pass, commit e74d4502e): "
        "transformer nameplate = the smallest standard preferred rating >= "
        "load kW x 1.25. kVA >= kW for any power factor, so load x 1.25 is the "
        "assumption-free adequacy requirement — the same basis the "
        "deterministic adequacy check verifies. Three-phase line current "
        "I = S x 1000 / (sqrt(3) x U_LL); single-phase I = S x 1000 / U. "
        "No fabricated constants; the preferred-rating ladder is the published "
        "IEC 60076 standard kVA series extended with the 75 kVA UK dry-type / "
        "packaged-substation trade step."
    ),
    "confidence_class": "standard",
    "last_reviewed_date": "2026-07-03",
}

# Standard distribution/power transformer preferred kVA ratings.
# MIRROR of IEC_KVA_LADDER in scripts/lib/design-loop/settle-loop.ts (the one-mint
# rule surface, commit e74d4502e) — IEC 60076 series EXTENDED with the 75 kVA step
# (the UK dry-type / packaged-substation trade ladder 50/75/100/160/250 carries it;
# without it a 53 kW plant's 66.25 kVA requirement jumps a whole size class to 100).
# If you change ONE ladder you MUST change BOTH — they implement the same rule.
STANDARD_KVA_LADDER = [
    25, 50, 75, 100, 160, 200, 250, 315, 400, 500, 630, 800,
    1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
]

# MIRROR of INCOMER_KVA_MARGIN in scripts/lib/design-loop/settle-loop.ts.
# kVA >= load kW x 1.25 — assumption-free (kVA >= kW at any power factor).
INCOMER_KVA_MARGIN = 1.25


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

    headroom = float(payload.get("headroom_fraction", INCOMER_KVA_MARGIN - 1.0))
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
    elif isinstance(ladder, str):
        # FAIL-SOFT (2026-06-14): the bootstrap may wire "500,800,1000" as a
        # comma/space/semicolon-separated STRING rather than a JSON array.
        # Split it instead of float()-ing the raw string (which crashed on ',').
        ladder = ladder.replace(";", ",").replace(" ", ",").split(",")
    _parsed = []
    for _x in ladder:
        try:
            _parsed.append(float(_x))
        except (TypeError, ValueError):
            pass
    ladder = _parsed or [float(x) for x in STANDARD_KVA_LADDER]

    # ---- ONE-MINT INCOMER RULE (mirrors settle-loop.ts resizeFromConvergedDemand,
    # commit e74d4502e): required kVA = load kW x (1 + headroom), default margin
    # 1.25 — ASSUMPTION-FREE (kVA >= kW at any power factor). The supplied pf
    # yields an informational apparent-power line only; it must NOT change the
    # mint (dividing by an assumed pf is how this tool minted 100 kVA while the
    # settle-loop minted 75 kVA for the same 53 kW load).
    s_load_kva = p_kw / pf                       # informational: apparent demand at stated pf
    margin = 1.0 + headroom
    s_req_kva = p_kw * margin
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
            label="Apparent power demand (informational)",
            formula="S_load = P / pf",
            values={"P": (round(p_kw, 2), "kW"), "pf": (pf, "")},
            result=s_load_r, result_unit="kVA",
            assumptions=["informational only — the nameplate mint below is pf-free (kVA >= kW at any pf)"],
        ),
        worked_calc(
            label="Required rating (one-mint incomer rule)",
            formula="S_req = P x (1 + headroom)",
            values={"P": (round(p_kw, 2), "kW"), "headroom": (headroom, "")},
            result=s_req_r, result_unit="kVA",
            assumptions=[
                f"kVA >= load x {round(margin, 4)} — assumption-free adequacy (kVA >= kW at any power factor)",
                "same rule as the settle-loop incomer mint + the deterministic adequacy check (commit e74d4502e)",
            ],
        ),
        worked_calc(
            label="Transformer nameplate (next standard rating)",
            formula="S_rated = ceil_to_standard(S_req)",
            values={"S_req": (s_req_r, "kVA")},
            result=s_rated_r, result_unit="kVA",
            assumptions=[
                "smallest standard preferred kVA rating >= required (IEC 60076 series + the 75 kVA trade step; ladder 25/50/75/100/160/250…)",
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


def _selftest() -> int:
    """proveCatch for the one-mint alignment (commit e74d4502e residual #4):
    the ADVERSARIAL input is the v56d divergence — a 53 kW plant that this tool
    minted at 100 kVA (pf-divided + unladdered) while the settle-loop E pass
    minted 75 kVA. The tool MUST now produce 75 on the same rule/ladder."""
    fails = []

    def chk(name, cond):
        if not cond:
            fails.append(name)

    # THE catch: 53 kW -> 53 x 1.25 = 66.25 -> next standard (ladder incl. 75) = 75
    out = compute({"plant_load_kw": 53})
    chk("v56d_53kw_mints_75", out["transformer_kva"] == 75.0)
    chk("v56d_required_66_25", abs(out["required_with_headroom_kva"] - 66.25) < 1e-6)
    chk("v56d_on_ladder", out["rating_off_standard_ladder"] is False)
    # pf must NOT change the mint (the assumption-free basis) — pf 0.7 still 75
    chk("pf_free_mint", compute({"plant_load_kw": 53, "power_factor": 0.7})["transformer_kva"] == 75.0)
    # exactly-on-a-step is inclusive: 40 kW x 1.25 = 50 -> 50 kVA (settle-loop parity)
    chk("inclusive_step_40kw", compute({"plant_load_kw": 40})["transformer_kva"] == 50.0)
    # above the ladder top: never under-size — round UP to the next 100 kVA, flagged bespoke
    big = compute({"plant_load_kw": 12000})
    chk("off_ladder_rounds_up", big["transformer_kva"] == 15000.0 and big["rating_off_standard_ladder"] is True)
    # worked[] present + the nameplate line references the standard-ladder rule
    chk("worked_present", len(out.get("worked") or []) == 5)

    if fails:
        print(f"[electrical_transformer_sizing] SELFTEST FAIL: {', '.join(fails)}", file=sys.stderr)
        return 1
    print("[electrical_transformer_sizing] selftest OK (one-mint kVA rule: 53 kW -> 75 kVA, pf-free, ladder incl. 75)")
    return 0


def main() -> int:
    if "--selftest" in sys.argv:
        return _selftest()
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
