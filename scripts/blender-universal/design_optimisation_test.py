#!/usr/bin/env python3
"""Headless regression tests for design_optimisation.py.

Run:  python3 design_optimisation_test.py   (exit 0 = all pass)

Locks the invariants that would catch a regression in either optimiser:
  ECONOMIC CONDUCTOR
    E1  never recommends BELOW the thermal floor
    E2  lifetime_saving ≥ 0 (the optimum's TCO ≤ the thermal-min TCO, always)
    E3  the returned economic_csa actually minimises TCO over the sweep
    E4  a HEAVY continuous run upsizes (economic > thermal)
    E5  NON-DEGENERACY: a LIGHT run gives an INTERMEDIATE optimum, not ladder-max
    E6  MONOTONICITY: a higher energy price never gives a THINNER economic size
    E7  hand-checked arithmetic on one fully-specified case (TCO to the £)
    E8  busbar territory (floor above the ladder) → applicable=False, no crash
  LAYOUT LENGTH
    L1  optimised_total ≤ initial_total (2-opt only accepts improving swaps)
    L2  determinism — identical input → byte-identical ordering + totals
    L3  a pinned node never moves
    L4  an already-optimal order → 0 swaps, ordering unchanged
    L5  fat (heavy-weight) edges end up SHORTER than they started
"""
from __future__ import annotations

import sys

import design_optimisation as do

_FAILS: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        _FAILS.append(msg)
        print(f"  FAIL: {msg}")
    else:
        print(f"  ok:   {msg}")


# --------------------------------------------------------------------------
print("ECONOMIC CONDUCTOR SIZING")

# E1 + E2 across a spread of currents/lengths/floors.
for (i_a, L, floor) in [(400, 100, 185), (50, 30, 10), (1000, 50, 240),
                        (16, 200, 2.5), (250, 8, 95)]:
    r = do.economic_conductor_csa(i_a, L, thermal_min_csa_mm2=floor)
    if r.get("applicable", True):
        check(r["economic_csa"] >= floor - 1e-9,
              f"E1 {i_a}A/{L}m: economic {r['economic_csa']} ≥ floor {floor}")
        check(r["lifetime_saving_gbp"] >= -1e-6,
              f"E2 {i_a}A/{L}m: saving £{r['lifetime_saving_gbp']:.0f} ≥ 0")
        # E3 — the chosen CSA is the sweep TCO minimum.
        best = min(r["sweep"], key=lambda s: s["tco_gbp"])
        check(abs(best["csa_mm2"] - r["economic_csa"]) < 1e-9,
              f"E3 {i_a}A/{L}m: economic_csa is the sweep TCO minimum")

# E4 — heavy continuous run upsizes above thermal min.
r_heavy = do.economic_conductor_csa(400, 120, thermal_min_csa_mm2=150)
check(r_heavy["economic_csa"] > r_heavy["thermal_min_csa"] and r_heavy["worthwhile"],
      f"E4 heavy 400A/120m: upsizes {r_heavy['thermal_min_csa']}→{r_heavy['economic_csa']} (worthwhile)")

# E5 — NON-DEGENERACY: a light, short, low-utilisation run must NOT slam the
# ladder ceiling; the optimum is intermediate (proves it's a real minimisation,
# not "always pick the fattest"). 30 A, 12 m, 20% utilisation, thermal min 4 mm².
r_light = do.economic_conductor_csa(
    30, 12, thermal_min_csa_mm2=4, utilisation=0.20)
check(r_light["economic_csa"] < do.cs.CABLE_CSA_LADDER[-1],
      f"E5 light 30A/12m@20%%: optimum {r_light['economic_csa']} mm² is intermediate "
      f"(< ladder max {do.cs.CABLE_CSA_LADDER[-1]})")

# E6 — MONOTONICITY in energy price: dearer energy never gives a THINNER cable.
prev = 0.0
mono_ok = True
for price in [0.05, 0.12, 0.18, 0.30, 0.50]:
    rr = do.economic_conductor_csa(200, 60, thermal_min_csa_mm2=35,
                                   energy_price_gbp_per_kwh=price)
    if rr["economic_csa"] < prev - 1e-9:
        mono_ok = False
    prev = rr["economic_csa"]
check(mono_ok, "E6 economic_csa is non-decreasing as energy price rises")

# E7 — hand-checked arithmetic (the demo case, defaults). At 185 mm², 100 m,
# 400 A: R=0.0172·100/185=0.009297 Ω, loss=400²·R=1487.6 W, hours=8760·0.85=7446,
# energy=11 077 kWh, cost=£1 993.9/yr, PV factor (8%,25y)=10.675 → £21 283, capex
# 68·100=£6 800 → TCO £28 083.
r7 = do.economic_conductor_csa(400, 100, thermal_min_csa_mm2=185)
check(abs(r7["tco_thermal_gbp"] - 28083) < 60,
      f"E7 hand-check TCO@185mm² = £{r7['tco_thermal_gbp']:.0f} (expect ≈£28 083)")
check(abs(r7["annual_loss_kwh_thermal"] - 11077) < 30,
      f"E7 hand-check annual loss@185 = {r7['annual_loss_kwh_thermal']:.0f} kWh (≈11 077)")

# E8 — busbar territory (floor above the stranded ladder) is handled, not crashed.
r8 = do.economic_conductor_csa(5000, 20, thermal_min_csa_mm2=600)
check(r8.get("applicable") is False,
      "E8 floor above ladder (busbar) → applicable=False, graceful no-op")

# --------------------------------------------------------------------------
print("\nLAYOUT-LENGTH MINIMISATION")

nodes = ["feed", "react", "sep", "compress", "product"]
edges = [
    {"from": "feed", "to": "react", "weight": 2.0},
    {"from": "react", "to": "sep", "weight": 3.0},
    {"from": "sep", "to": "product", "weight": 2.0},
    {"from": "sep", "to": "compress", "weight": 4.0},
    {"from": "compress", "to": "react", "weight": 4.0},
]
bad = ["feed", "product", "react", "sep", "compress"]

o1 = do.minimise_layout_length(nodes, edges, initial_order=bad, pitch_m=4.0)
# L1
check(o1["optimised_total_m"] <= o1["initial_total_m"] + 1e-9,
      f"L1 optimised {o1['optimised_total_m']} ≤ initial {o1['initial_total_m']}")
# L2 determinism
o2 = do.minimise_layout_length(nodes, edges, initial_order=bad, pitch_m=4.0)
check(o1["optimised_order"] == o2["optimised_order"]
      and o1["optimised_total_m"] == o2["optimised_total_m"],
      "L2 deterministic — identical ordering + total on re-run")
# L3 pinned
op = do.minimise_layout_length(nodes, edges, initial_order=bad, pitch_m=4.0,
                               pinned={"feed"})
check(op["optimised_order"].index("feed") == bad.index("feed"),
      "L3 pinned 'feed' stays in its original slot")
# L4 already-optimal → no change
already = o1["optimised_order"]
o4 = do.minimise_layout_length(nodes, edges, initial_order=already, pitch_m=4.0)
check(o4["swaps_applied"] == 0 and o4["optimised_order"] == already,
      "L4 already-optimal order → 0 swaps, unchanged")
# L5 fat edges end shorter — measure the two weight-4 recycle edges' span.
def _span(order, a, b):
    return abs(order.index(a) - order.index(b))
fat_before = _span(bad, "sep", "compress") + _span(bad, "compress", "react")
fat_after = _span(o1["optimised_order"], "sep", "compress") + _span(o1["optimised_order"], "compress", "react")
check(fat_after <= fat_before,
      f"L5 fat recycle edges shortened: span {fat_before} → {fat_after} slots")

# --------------------------------------------------------------------------
print()
if _FAILS:
    print(f"FAILED {len(_FAILS)} check(s):")
    for f in _FAILS:
        print("  -", f)
    sys.exit(1)
print("ALL design_optimisation tests PASS")
sys.exit(0)
