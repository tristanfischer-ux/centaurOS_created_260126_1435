#!/usr/bin/env python3
"""
postsmolt_scheduler.py — monthly-cohort production schedule + size-class tank cascade for a
continuous post-smolt (or any staged grow-out) RAS (Tristan 2026-06-23).

WHY THIS EXISTS: a warm-water single-species grow-out (kingfish 200 g → 3.4 kg) is ONE tank size.
A salmon post-smolt RAS stocks a cohort of smolts EVERY MONTH and harvests 1 kg post-smolts every
month, so ~cycle_months cohorts are in the system at once, each a different size — fish progress up
a CASCADE of tank size-classes (small high-density tanks for 100 g entry fish → large tanks for the
1 kg post-smolts). The tankage is driven by the SCHEDULE, not a single total volume. This module
derives, deterministically:
  - the growth trajectory (TGC, calibrated to the stock/harvest endpoints),
  - the in-system cohort table (number + weight + biomass per month-in-cycle, with mortality),
  - the size-class tank cascade (count + volume per class, progressive density + tank size),
  - standing biomass, annual harvest, peak daily feed.

USAGE
    .venv/bin/python scripts/postsmolt_scheduler.py [--json] [--selftest]
    (parameters below; defaults = the Tayinloan salmon post-smolt brief)
"""
from __future__ import annotations
import json
import math
import sys
from dataclasses import dataclass, asdict
from typing import List, Optional


@dataclass
class SizeClass:
    name: str
    w_lo_g: float           # weight band low
    w_hi_g: float           # weight band high
    density_kg_m3: float    # max stocking density for this band (progressive up the cascade)
    tank_volume_m3: float   # standard tank size for this class (smaller at the entry end)
    n_tanks: int = 0
    biomass_kg: float = 0.0
    volume_required_m3: float = 0.0


@dataclass
class Cohort:
    month_in_cycle: int     # 0 = just stocked, cycle_months = about to harvest
    weight_g: float
    number: int
    biomass_kg: float


def _weight_at(month: int, w0_g: float, wf_g: float, cycle_months: int) -> float:
    """Salmon growth via a TGC-style cube-root-linear trajectory calibrated so weight=w0 at month 0
    and weight=wf at month=cycle_months. W(t) = (w0^(1/3) + k·t)^3."""
    a0, af = w0_g ** (1 / 3), wf_g ** (1 / 3)
    k = (af - a0) / max(cycle_months, 1)
    return (a0 + k * month) ** 3


def schedule(
    smolt_g: float = 100.0,
    postsmolt_g: float = 1000.0,
    cycle_months: int = 8,
    monthly_cohort_n: int = 10_000,
    survival_monthly: float = 0.99,     # ~92% over an 8-month cycle
    fcr: float = 1.15,
    size_classes: Optional[List[SizeClass]] = None,
    max_tank_volume_m3: float = 150.0,  # cap any single tank (cranes/handling); classes may override
) -> dict:
    """Return the full monthly-cohort schedule + size-class tank cascade as a dict."""
    if size_classes is None:
        # progressive cascade: small high-turnover tanks for entry fish, large tanks for post-smolts.
        size_classes = [
            SizeClass("C1 · smolt/early", smolt_g, 300.0, density_kg_m3=25.0, tank_volume_m3=30.0),
            SizeClass("C2 · mid-grow", 300.0, 650.0, density_kg_m3=50.0, tank_volume_m3=75.0),
            SizeClass("C3 · post-smolt", 650.0, postsmolt_g * 1.001, density_kg_m3=75.0,
                      tank_volume_m3=150.0),
        ]

    # in-system cohorts: one per month 1..cycle_months (the month-0 stock is also present)
    cohorts: List[Cohort] = []
    for m in range(0, cycle_months + 1):
        w = _weight_at(m, smolt_g, postsmolt_g, cycle_months)
        n = round(monthly_cohort_n * (survival_monthly ** m))
        cohorts.append(Cohort(m, round(w, 1), n, round(n * w / 1000.0, 1)))

    # assign each cohort's biomass to its size-class by weight band
    for c in cohorts:
        for sc in size_classes:
            if sc.w_lo_g <= c.weight_g < sc.w_hi_g:
                sc.biomass_kg += c.biomass_kg
                break
    # size each class: volume = biomass / density; tanks = ceil(volume / tank size)
    for sc in size_classes:
        sc.volume_required_m3 = round(sc.biomass_kg / sc.density_kg_m3, 1) if sc.density_kg_m3 else 0.0
        tv = min(sc.tank_volume_m3, max_tank_volume_m3)
        sc.n_tanks = int(math.ceil(sc.volume_required_m3 / tv)) if tv else 0

    standing_biomass_kg = round(sum(c.biomass_kg for c in cohorts), 1)
    total_tank_volume_m3 = round(sum(sc.volume_required_m3 for sc in size_classes), 1)
    total_tanks = sum(sc.n_tanks for sc in size_classes)
    # annual harvest: 12 cohorts/yr reach harvest, each at end-of-cycle survival
    harvest_n_per_cohort = round(monthly_cohort_n * (survival_monthly ** cycle_months))
    annual_postsmolts = harvest_n_per_cohort * 12
    annual_tonnes = round(annual_postsmolts * postsmolt_g / 1e6, 1)
    # peak daily feed ≈ standing biomass × a feed rate that falls with size; use ~1.0% bodyweight/day
    # blended (small fish eat ~2%, large ~0.7%); FCR ties feed to growth but daily feed sets silo/dosing
    peak_feed_kg_day = round(standing_biomass_kg * 0.010, 1)
    annual_feed_t = round(annual_tonnes * fcr, 1)

    return {
        "inputs": {
            "smolt_g": smolt_g, "postsmolt_g": postsmolt_g, "cycle_months": cycle_months,
            "monthly_cohort_n": monthly_cohort_n, "survival_monthly": survival_monthly, "fcr": fcr,
        },
        "cohorts": [asdict(c) for c in cohorts],
        "size_classes": [asdict(sc) for sc in size_classes],
        "standing_biomass_kg": standing_biomass_kg,
        "standing_biomass_t": round(standing_biomass_kg / 1000.0, 1),
        "total_tank_volume_m3": total_tank_volume_m3,
        "total_tanks": total_tanks,
        "annual_postsmolts": annual_postsmolts,
        "annual_tonnes": annual_tonnes,
        "peak_feed_kg_day": peak_feed_kg_day,
        "annual_feed_t": annual_feed_t,
    }


def _print_human(s: dict) -> None:
    print(f"POST-SMOLT PRODUCTION SCHEDULE  (monthly cohort {s['inputs']['monthly_cohort_n']:,}, "
          f"{s['inputs']['cycle_months']}-month cycle, {s['inputs']['smolt_g']:.0f} g → "
          f"{s['inputs']['postsmolt_g']:.0f} g)")
    print("=" * 78)
    print("  COHORTS IN SYSTEM (one stocked each month):")
    print(f"    {'month':>5} {'weight g':>10} {'number':>9} {'biomass kg':>11}")
    for c in s["cohorts"]:
        print(f"    {c['month_in_cycle']:>5} {c['weight_g']:>10,.0f} {c['number']:>9,} {c['biomass_kg']:>11,.0f}")
    print(f"  STANDING BIOMASS: {s['standing_biomass_t']:.1f} t   "
          f"({s['standing_biomass_kg']:,.0f} kg across {len(s['cohorts'])} cohorts)")
    print("\n  SIZE-CLASS TANK CASCADE:")
    print(f"    {'class':<18}{'band g':>14}{'ρ kg/m³':>9}{'biomass kg':>12}{'vol m³':>9}{'tanks':>7}{'tank m³':>9}")
    for sc in s["size_classes"]:
        print(f"    {sc['name']:<18}{(str(int(sc['w_lo_g']))+'-'+str(int(sc['w_hi_g']))):>14}"
              f"{sc['density_kg_m3']:>9.0f}{sc['biomass_kg']:>12,.0f}{sc['volume_required_m3']:>9,.0f}"
              f"{sc['n_tanks']:>7}{sc['tank_volume_m3']:>9.0f}")
    print(f"  TOTAL: {s['total_tanks']} tanks, {s['total_tank_volume_m3']:,.0f} m³ "
          f"(vs a uniform grow-out's single size)")
    print(f"\n  OUTPUT: {s['annual_postsmolts']:,} post-smolts/yr = {s['annual_tonnes']:.1f} t/yr; "
          f"feed {s['annual_feed_t']:.1f} t/yr; peak feed {s['peak_feed_kg_day']:,.0f} kg/day")


def _selftest() -> int:
    s = schedule()
    bad = 0
    # monotone growth + endpoints
    ws = [c["weight_g"] for c in s["cohorts"]]
    if ws[0] != 100.0 or abs(ws[-1] - 1000.0) > 1:
        print(f"  FAIL endpoints: {ws[0]} {ws[-1]}"); bad += 1
    if ws != sorted(ws):
        print("  FAIL growth not monotone"); bad += 1
    # tank volume reconciles to per-class sum
    if abs(s["total_tank_volume_m3"] - sum(sc["volume_required_m3"] for sc in s["size_classes"])) > 0.5:
        print("  FAIL volume reconcile"); bad += 1
    # smaller tanks at the entry end (cascade)
    tv = [sc["tank_volume_m3"] for sc in s["size_classes"]]
    if tv != sorted(tv):
        print("  FAIL not a rising cascade"); bad += 1
    # output sane
    if not (90 <= s["annual_tonnes"] <= 130):
        print(f"  FAIL annual tonnes out of range: {s['annual_tonnes']}"); bad += 1
    print("postsmolt_scheduler selftest:", "all invariants hold" if not bad else f"{bad} FAIL")
    return 1 if bad else 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(_selftest())
    out = schedule()
    if "--json" in sys.argv:
        print(json.dumps(out, indent=2))
    else:
        _print_human(out)
