#!/usr/bin/env python3
"""
optiras_smolt.py — OptiRAS-ONLY smolt model (Tristan/Andrew FishFrom pivot 2026-06-23):
buy 60 g fish, grow to 500 g, SELL the 500 g smolt (strip the Aquatraz marine grow-out / depuration
from the hybrid investment memorandum). Grounded in the FishFrom Investment Memorandum's VALIDATED
OptiRAS figures so this is a rework of real numbers, not a guess.

MEMO-VALIDATED INPUTS (Investment memorandum, 3-OptiRAS + 4-Aquatraz hybrid):
  - OptiRAS capex £20.75M / 3 modules = £6.92M/module equipment; ~£13M all-in per module with a
    standalone share of civils/electrical/engineering/contingency ("£13M for one tank" — Andrew).
  - Per module per cohort: 360,000 smolt in @ 100 g, 97% RAS survival, OUT @ 750 g in 139 days.
  - 2 cohorts/yr in the memo → ~520 t/yr/module (density-limited tankage).
  - Energy 3.5 kWh/kg live; FCR 1.1; smolt-in cost £0.85/fish @ 100 g (memo £1.83M / 2.16M smolt).
  - HYBRID (for contrast): 5 kg HOG @ £7.50/kg, £49.5M rev, £72.75M capex, £11M EBITDA, 7-yr payback.

THE PIVOT CHANGES: buy at 60 g (cheaper than 100 g), sell at 500 g (NOT 750 g, NOT 5 kg). The tank
is DENSITY-limited (60 kg/m³), so tonnage/cohort is ~unchanged; only fish weight/count + value change.
"""
from __future__ import annotations
import sys

# ── module (memo-grounded) ───────────────────────────────────────────────────
MODULE_CAPEX_GBP   = 13_000_000   # one OptiRAS module all-in (equipment £6.9M + standalone civils/elec/eng/cont)
# Throughput is driven by TANK UTILISATION (the average density held over the cycle) — the single
# biggest economic lever (Tristan/FishFrom 2026-06-23, the broiler-thinning insight):
#   BATCH (memo)   — tank reaches 60 kg/m³ only at harvest, ~30 kg/m³ average → ~520 t/yr.
#   THINNED/CASCADE (BASE) — held near 60 kg/m³ by grading/selling the biggest progressively (the
#     chicken-thinning model) OR a size-class tank cascade → ~800 t/yr (~2× batch). << base case.
#   FULL CONTINUOUS (ceiling) — ~1,040 t/yr (theoretical max if always exactly at 60 kg/m³).
# Keeping the tank full ~doubles throughput → ~halves capex/tonne → ~halves payback.
MODULE_TONNES_BATCH   = 520.0
MODULE_TONNES_THINNED = 800.0     # BASE CASE — thinned/cascade, density held near 60 kg/m³
MODULE_TONNES_FULL    = 1040.0
MODULE_TONNES_YR      = MODULE_TONNES_THINNED
RAS_PHASE_DAYS     = 130          # 60 g → 500 g (memo 100 g→750 g = 139 d; similar)
RAS_SURVIVAL       = 0.97
ENERGY_KWH_PER_KG  = 3.5
FCR                = 1.1
SELL_WEIGHT_KG     = 0.5
BUY_WEIGHT_KG      = 0.06

# ── prices / opex rates ──────────────────────────────────────────────────────
P_ELEC_GBP_KWH     = 0.18
FEED_GBP_PER_T     = 1_550.0
BUY_FISH_GBP       = 0.65         # 60 g input fish (cheaper than the £0.85 100 g smolt)
LABOUR_GBP_YR      = 800_000.0    # single-module RAS crew (memo £6M was whole 3-module + marine farm)
O2_CHEM_GBP_PER_T  = 350.0
MAINT_FRACTION     = 0.03         # of £6.9M equipment
SLUDGE_INS_GBP_YR  = 300_000.0


def module(sell_price_each: float, tonnes_yr: float = MODULE_TONNES_YR,
           capex: float = MODULE_CAPEX_GBP, equipment: float = 6_900_000.0) -> dict:
    fish_yr = tonnes_yr * 1000.0 / SELL_WEIGHT_KG
    bought = fish_yr / RAS_SURVIVAL
    gain_t = tonnes_yr - bought * BUY_WEIGHT_KG / 1000.0
    opex = {
        "input_fish":  bought * BUY_FISH_GBP,
        "feed":        gain_t * FCR * FEED_GBP_PER_T,
        "energy":      tonnes_yr * 1000.0 * ENERGY_KWH_PER_KG * P_ELEC_GBP_KWH,
        "labour":      LABOUR_GBP_YR,
        "o2_chem":     tonnes_yr * O2_CHEM_GBP_PER_T,
        "maintenance": equipment * MAINT_FRACTION,
        "sludge_ins":  SLUDGE_INS_GBP_YR,
    }
    opex_total = sum(opex.values())
    revenue = fish_yr * sell_price_each
    ebitda = revenue - opex_total
    payback = capex / ebitda if ebitda > 0 else float("inf")
    return {"sell_price_each": sell_price_each, "fish_yr": round(fish_yr), "tonnes_yr": tonnes_yr,
            "capex": capex, "opex": round(opex_total), "opex_breakdown": {k: round(v) for k, v in opex.items()},
            "revenue": round(revenue), "ebitda": round(ebitda),
            "payback_years": round(payback, 1) if payback != float("inf") else None,
            "fully_loaded_per_kg": round((opex_total + capex / 10.0) / (tonnes_yr * 1000.0), 2)}


def _print():
    g = lambda x: f"£{x:,.0f}"
    print("OPTIRAS-ONLY SMOLT MODEL — buy 60 g, grow to 500 g, sell the smolt (memo-grounded)")
    print("=" * 84)
    m = module(4.0)
    print(f"  ONE OptiRAS module: {m['tonnes_yr']:.0f} t/yr  ({m['fish_yr']:,} × 500 g smolts)  "
          f"capex {g(m['capex'])}")
    print(f"  OpEx {g(m['opex'])}/yr:")
    for k, v in m["opex_breakdown"].items():
        print(f"    {k:14} {g(v)}")
    print(f"\n  TANK UTILISATION — the biggest lever (keep it near 60 kg/m³, sell off bit by bit):")
    print(f"    {'mode':<40}{'t/yr':>7}{'@£4':>9}{'@£5':>9}")
    for label, t in [("batch (fills to 60 only at harvest, ~30 avg)", MODULE_TONNES_BATCH),
                     ("thinned/cascade — BASE (held near 60)", MODULE_TONNES_THINNED),
                     ("full continuous (ceiling)", MODULE_TONNES_FULL)]:
        a, b = module(4.0, tonnes_yr=t), module(5.0, tonnes_yr=t)
        pa = f"{a['payback_years']}yr" if a["payback_years"] else "never"
        pb = f"{b['payback_years']}yr" if b["payback_years"] else "never"
        print(f"    {label:<40}{t:>7.0f}{pa:>9}{pb:>9}")
    print(f"\n  PAYBACK vs the 500 g smolt SELLING PRICE (base = thinned ~{MODULE_TONNES_YR:.0f} t/yr):")
    print(f"    {'£/fish':>7}{'£/kg':>7}{'revenue':>12}{'EBITDA':>12}{'payback':>10}{'£/kg cost':>11}")
    for p in (4.0, 4.5, 5.0, 5.5, 6.0):
        e = module(p)
        pb = f"{e['payback_years']} yr" if e["payback_years"] else "never"
        print(f"    {'£'+format(p,'.1f'):>7}{'£'+format(p/SELL_WEIGHT_KG,'.0f'):>7}{g(e['revenue']):>12}"
              f"{g(e['ebitda']):>12}{pb:>10}{'£'+format(e['fully_loaded_per_kg'],'.2f'):>11}")
    print(f"\n  → fully-loaded cost ≈ £{m['fully_loaded_per_kg']:.2f}/kg; profitable where the price beats it.")
    print(f"\n  CONTRAST — the memo's FULL HYBRID (grow on to 5 kg HOG @ £7.50/kg):")
    print(f"    £72.75M capex · £49.5M revenue · £11M EBITDA · 7-yr payback · 14% IRR")
    print(f"    The value is in the 5 kg fish (~£37.50 each), not the 500 g smolt (~£4 each).")
    print(f"\n  MINIMUM unit = ONE module (~£13M, ~520 t/yr). Below that = a Tayinloan RETROFIT PILOT")
    print(f"    (existing building + hatchery + a sub-flagship RAS), ~£3-5M, ~100-200 t/yr — proves yield,")
    print(f"    earns revenue, fundable. 'A dozen modules' = the scale-up, not the start.")


if __name__ == "__main__":
    if "--json" in sys.argv:
        import json
        print(json.dumps({"per_module": [module(p) for p in (4.0, 4.5, 5.0, 5.5, 6.0)]}, indent=2))
    else:
        _print()
