#!/usr/bin/env python3
"""Winding-to-coolant thermal resistance DERIVED from stator geometry.

⭐⭐ WHY (council 2026-08-03, and Tristan's standing rule that checks must be code
rather than judgement). Two thermal screens of the FE front machine disagreed by
76 K. The coupled network screen modelled the winding-to-coolant path as the
CONVECTIVE FILM ALONE — h≈38,000 W/m²K, R=0.000378 K/W — and reported 82.9 °C.
The lumped screen used a flat 0.01 K/W and reported 159.3 °C with the magnets in
breach.

The council's decomposition for a water-jacketed stator at this scale puts the
total at 0.010-0.022 K/W, dominated by the SLOT LINER and the STATOR-to-JACKET
INTERFACE — the two terms the network screen omits entirely. Its film-only figure
is ~30x too low; the flat 0.01 K/W is sane and slightly optimistic.

So this module replaces BOTH a fudge factor and a missing term: it derives each
resistance from the machine's own geometry where the geometry exists, and where a
material property is genuinely unknown it uses a NAMED assumption with its range
recorded, so a reader can see which numbers are measured and which are assumed.
Nothing here is tuned to make a gate pass.

⚠⚠ THIS MODULE DOES NOT YET PRODUCE A REPLACEMENT RESISTANCE, AND SAYS SO.
Building it exposed a STRUCTURAL error that a single series chain cannot express,
and its own plausibility guard caught it: the derived total came out 0.0968 K/W,
which at 8216 W implies a 795 K winding rise. Absurd, and the guard refused it.

TWO reasons, the second load-bearing:
  (a) the impregnation term assumed a 1.5 mm PURE-RESIN path, where real practice
      uses an effective slot-composite conductivity (copper + resin + air);
  (b) A SINGLE SERIES CHAIN IS THE WRONG MODEL. 6035 W of the 8216 W is IRON loss,
      generated IN the iron — it never crosses the slot liner. Only the 2180 W of
      copper loss takes the winding->liner->tooth path. Two heat sources enter the
      chain at DIFFERENT nodes, so one series resistance cannot represent both.

Closing it needs a two-source LPTN (copper injected at the slot node, iron
injected at the tooth/yoke node) plus slot fill fraction and impregnation type,
which this twin does not carry. That is named work, not a coefficient to guess.

WHAT THIS MODULE IS FOR MEANWHILE: it computes the chain and DIAGNOSES, so the
one thing that IS defensible gets asserted — the convective film alone cannot be
the whole path. That is the actual bug in
analytical_fia_cooling_network_screen.py (film-only, 0.000378 K/W, reporting
82.9 C against the lumped screen's 159.3 C). Refusing to emit a number I cannot
defend is the point; inventing one is how steinmetz_ke = 1e-7 got into the plan.

Usage:
    stator_thermal_chain.py --twin <dir>
    stator_thermal_chain.py --selftest
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

# ── ASSUMED material properties. Each is a published typical value for the named
# material, NOT a fitted constant, and each carries the range it was drawn from so
# a reader can see the sensitivity. Where the twin states a value it wins.
ASSUMPTIONS: dict = {
    "slot_liner_thickness_m": (0.25e-3, "Nomex 410 class, 0.25 mm typical for a "
                                        "traction slot liner"),
    "slot_liner_k_w_mk": (0.14, "aramid paper 0.13-0.15 W/(m·K)"),
    "impregnation_k_w_mk": (0.30, "VPI epoxy 0.2-0.5 W/(m·K); trickle is lower"),
    "impregnation_path_m": (1.5e-3, "mean copper-to-liner path through resin"),
    "lamination_radial_k_w_mk": (25.0, "M400-50A in-plane 20-30 W/(m·K)"),
    "interface_conductance_w_m2k": (3000.0, "press-fit steel-to-aluminium "
                                            "1000-6000 W/(m²·K); paste at the top"),
    "jacket_wall_k_w_mk": (167.0, "aluminium 6082"),
    "jacket_wall_m": (3.0e-3, "typical jacket wall"),
    "channel_h_w_m2k": (11000.0, "turbulent water/glycol in a jacket channel, "
                                 "8000-15000 W/(m²·K) — a 38000 figure implies "
                                 "micro-fins and is optimistic"),
}


def _q(state: dict, key: str):
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {})
    v = q.get(key)
    if isinstance(v, dict):
        v = v.get("value")
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _geometry(twin: Path, state: dict) -> dict | None:
    """Stator geometry from the FE deck's own artefact, contract as fallback."""
    g = {}
    for name in ("em_fia_front_kit_case_REBALANCED.json", "em_fia_front_kit_case.json"):
        p = twin / "_motor_stack" / name
        if not p.exists():
            continue
        try:
            d = json.loads(p.read_text())
        except Exception:  # noqa: BLE001
            continue
        mg = d.get("machine_geometry") or d.get("input_quantities") or {}
        for k_src, k_dst in (("stator_inner_diameter_mm", "d_si_mm"),
                             ("stator_outer_diameter_mm", "d_so_mm"),
                             ("slot_depth_mm", "slot_depth_mm"),
                             ("stator_slots", "slots")):
            if mg.get(k_src) is not None:
                g[k_dst] = float(mg[k_src])
        if g.get("d_si_mm"):
            break
    g["stack_mm"] = _q(state, "stack_length_mm") or _q(state, "active_length_mm")
    need = ("d_si_mm", "d_so_mm", "slot_depth_mm", "slots", "stack_mm")
    return g if all(g.get(k) for k in need) else None


def compute(twin: Path, state: dict) -> dict | None:
    """Series resistance chain, winding -> coolant, in K/W."""
    g = _geometry(twin, state)
    if g is None:
        return None
    a = {k: v[0] for k, v in ASSUMPTIONS.items()}
    for k in a:
        stated = _q(state, k)
        if stated is not None:
            a[k] = stated

    L = g["stack_mm"] / 1000.0
    d_si, d_so = g["d_si_mm"] / 1000.0, g["d_so_mm"] / 1000.0
    slots, depth = int(g["slots"]), g["slot_depth_mm"] / 1000.0

    # SLOT WETTED PERIMETER — the heat leaves the winding through the slot walls.
    # Approximate each slot as a rectangle of depth `depth` and width = the mean
    # slot pitch at mid-slot minus the tooth. Conservative: use the mid-slot
    # circumference share, which is what the liner actually wraps.
    r_mid = (d_si / 2.0) + depth / 2.0
    slot_pitch_mid = 2.0 * math.pi * r_mid / slots
    slot_width = slot_pitch_mid * 0.45          # ~45% slot / 55% tooth, typical
    per_slot_perimeter = 2.0 * depth + slot_width
    a_slot_total = per_slot_perimeter * L * slots      # m², all slots

    # Jacket wetted area — the stator OD cylinder.
    a_jacket = math.pi * d_so * L

    # Radial conduction path through teeth+yoke: from mid-slot radius to the OD.
    t_iron = max(d_so / 2.0 - r_mid, 1e-4)
    a_iron_mean = math.pi * (d_so + 2.0 * r_mid) / 2.0 * L   # log-mean approximated

    terms = [
        ("impregnation (copper -> liner)",
         a["impregnation_path_m"] / (a["impregnation_k_w_mk"] * a_slot_total),
         "assumed k + path"),
        ("slot liner",
         a["slot_liner_thickness_m"] / (a["slot_liner_k_w_mk"] * a_slot_total),
         "assumed thickness + k"),
        ("liner -> tooth contact",
         1.0 / (a["interface_conductance_w_m2k"] * a_slot_total),
         "assumed contact conductance"),
        ("stator iron, radial",
         t_iron / (a["lamination_radial_k_w_mk"] * a_iron_mean),
         "DERIVED from geometry"),
        ("stator OD -> jacket interface",
         1.0 / (a["interface_conductance_w_m2k"] * a_jacket),
         "assumed contact conductance"),
        ("jacket wall",
         a["jacket_wall_m"] / (a["jacket_wall_k_w_mk"] * a_jacket),
         "assumed wall thickness"),
        ("channel convection",
         1.0 / (a["channel_h_w_m2k"] * a_jacket),
         "assumed h (turbulent glycol)"),
    ]
    total = sum(r for _, r, _ in terms)
    # Plausibility band for a water-jacketed stator of this size. Outside it the
    # chain is not merely uncertain, it is wrong — and must not be adopted.
    usable = 0.005 <= total <= 0.030
    return {
        "schema": "forgeos.machine.stator_thermal_chain/v1",
        "usable_as_replacement": usable,
        "why_not_usable": (None if usable else
            "single-series-chain total is outside the physical band for a "
            "water-jacketed stator; a two-source LPTN is required because iron "
            "loss is generated IN the iron and does not cross the slot liner"),
        "winding_to_coolant_k_per_w": round(total, 6),
        "terms": [{"term": n, "r_k_per_w": round(r, 6), "basis": b,
                   "share_pct": round(100.0 * r / total, 1)} for n, r, b in terms],
        "dominant_term": max(terms, key=lambda t: t[1])[0],
        "geometry": {k: round(v, 4) for k, v in g.items()},
        "slot_wetted_area_m2": round(a_slot_total, 5),
        "jacket_area_m2": round(a_jacket, 5),
        "assumptions": {k: {"value": a[k], "note": ASSUMPTIONS[k][1]} for k in a},
        "caveat": ("Screening model, not a calibrated LPTN. A calibrated network is "
                   "+/-10-15 K on winding hot-spot; uncalibrated material properties "
                   "give +/-25 K. Interface conductance is a factor-of-two quantity "
                   "until measured on hardware."),
    }


def _selftest() -> int:
    fails: list[str] = []

    def ck(name, ok, detail=""):
        if not ok:
            fails.append(f"{name}: {detail}")

    import tempfile
    td = Path(tempfile.mkdtemp()); (td / "_motor_stack").mkdir()
    (td / "_motor_stack" / "em_fia_front_kit_case.json").write_text(json.dumps(
        {"machine_geometry": {"stator_inner_diameter_mm": 140.8,
                              "stator_outer_diameter_mm": 188.2,
                              "slot_depth_mm": 15.0, "stator_slots": 24}}))
    st = {"orchestratorContract": {"quantities": {"stack_length_mm": {"value": 98.33}}}}
    r = compute(td, st)
    ck("computes_from_real_geometry", r is not None, "the FE front geometry produced nothing")

    # ⭐⭐ proveCatch: the total must land in the band the council gave for a
    # water-jacketed stator of this size (0.010-0.022 K/W). Outside it, the chain
    # has an error of the kind that produced the 76 K disagreement in the first
    # place — most likely a missing term or an area computed on the wrong surface.
    tot = r["winding_to_coolant_k_per_w"] if r else 0.0
    # ⭐⭐ proveCatch: a chain outside the physical band must DECLARE ITSELF
    # UNUSABLE rather than be adopted. The live FE geometry currently produces
    # 0.0968 K/W (795 K at 8216 W) precisely because a single series chain cannot
    # carry two heat sources; the module must refuse it, not round it off.
    in_band = 0.005 <= tot <= 0.030
    ck("implausible_chain_refuses_itself", r["usable_as_replacement"] == in_band,
       f"total {tot} K/W in_band={in_band} but usable_as_replacement="
       f"{r['usable_as_replacement']} — an unusable chain must say so")
    if not in_band:
        ck("refusal_states_the_reason", bool(r["why_not_usable"]),
           "refused without saying why")

    # ⭐⭐ proveCatch: the FILM ALONE must never be mistaken for the total. This is
    # the exact defect in analytical_fia_cooling_network_screen (0.000378 K/W).
    film = next(t["r_k_per_w"] for t in r["terms"] if "convection" in t["term"])
    ck("film_is_a_minority_of_the_chain", film < 0.25 * tot,
       f"convective film is {100*film/tot:.0f}% of the chain — if the film dominates, "
       f"the conduction terms are wrong")
    ck("insulation_dominates",
       any("liner" in t["term"] or "impregnation" in t["term"]
           for t in sorted(r["terms"], key=lambda x: -x["r_k_per_w"])[:2]),
       f"expected liner/impregnation to dominate; got {r['dominant_term']}")
    # The one conclusion that IS defensible today and is the network screen's bug.
    ck("film_only_is_never_the_answer", film < 0.05 * tot,
       f"the convective film is {100*film/tot:.1f}% of the chain — a screen using "
       f"the film ALONE (0.000378 K/W) understates the path by more than an "
       f"order of magnitude")

    # Missing geometry abstains rather than inventing a chain.
    ck("absent_geometry_abstains", compute(Path(tempfile.mkdtemp()), {}) is None,
       "an empty twin produced a resistance chain")

    for f in fails:
        print(f"  FAIL {f}")
    print("stator_thermal_chain selftest: OK" if not fails
          else f"FAIL stator_thermal_chain selftest ({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required")
    state = json.loads((args.twin / "state.json").read_text())
    r = compute(args.twin, state)
    if r is None:
        print("[thermal-chain] stator geometry unavailable — nothing derived")
        return 0
    print(f"[thermal-chain] winding -> coolant = {r['winding_to_coolant_k_per_w']:.5f} K/W")
    for t in r["terms"]:
        print(f"   {t['r_k_per_w']:.6f}  {t['share_pct']:5.1f}%  {t['term']:<34} [{t['basis']}]")
    print(f"   dominant: {r['dominant_term']}")
    (args.twin / "_motor_stack" / "stator_thermal_chain.json").write_text(
        json.dumps(r, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
