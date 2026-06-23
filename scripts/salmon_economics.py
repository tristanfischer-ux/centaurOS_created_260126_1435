#!/usr/bin/env python3
"""
salmon_economics.py — deterministic techno-economic model for the Tayinloan Atlantic-salmon
post-smolt RAS, sized to fit BOTH hard site constraints simultaneously (Tristan 2026-06-23):

    (1) £5,000,000 installed capex ceiling
    (2) 0.5 MW (500 kW) existing grid connection  ← the current connection, NOT the planned 6 MW micro-grid

KEY PHYSICS THAT MAKES SALMON DIFFERENT FROM THE KINGFISH RAS (and why this is its own model):
  - Ambient run, NO HEATING PLANT. Seawater is ~12 °C; salmon post-smolts want 13-14 °C. The
    continuous recirculation-pump shaft power dumps ~all of itself into the water as heat, which —
    against the small losses of a covered, insulated, low-make-up plant — LIFTS the water into band
    and would OVERSHOOT it. So the thermal duty is NET COOLING, met by a cheap seawater heat
    exchanger, not an expensive heat-pump + immersion heating plant. "The pumps heat it, the sea
    cools it." This removes the kingfish's single largest capex item AND ~600 kW of connected load.
  - CONTINUOUS MONTHLY-COHORT schedule → standing biomass is the sum across the in-system cohorts
    (~39 t for 120 t/yr), NOT a uniform full-biomass plant (~118 t). Tanks size on STANDING biomass,
    so the cohort model needs ~2.4× less tankage than the engine's v1 uniform run assumed.

Capex/opex rates are first-cut engineering estimates (moderate confidence), documented inline and
grounded against the v1 chain run (out/salmon-postsmolt-v1: £10.7M, 120 t, HEATED, 118 t uniform
biomass) where possible. The post-smolt SELLING PRICE is the dominant economic uncertainty, so the
model reports payback as a function of price + the breakeven price rather than asserting one number.

USAGE
    .venv/bin/python scripts/salmon_economics.py [--json]
"""
from __future__ import annotations
import json
import sys

from postsmolt_scheduler import schedule

# ── ASSUMPTIONS (documented; tune here) ──────────────────────────────────────
GRID_LIMIT_KW = 500.0          # current site grid connection (hard)
CAPEX_CEILING_GBP = 5_000_000  # installed-cost ceiling (hard)

# Capex unit rates (installed £). First-cut; cited basis in comments.
R_TANK_PER_M3        = 1_000.0   # covered, insulated GRP/concrete circular tank + lid, £/m³
R_TREATMENT_PER_KGD  = 3_600.0   # drum filter + MBBR biofilter + degasser, sized on peak daily feed, £/(kg feed/day)
R_UV_PER_M3H         = 90.0      # validated UV reactors, £/(m³/h) of recirc flow
R_OXY_PER_KGO2D      = 1_900.0   # O2 cones + PSA generator + LOX buffer, £/(kg O2/day)
R_PUMP_PER_KW        = 2_500.0   # duty+standby recirc pumps, VFDs, £/kW installed
R_COOL_HEX_PER_KWTH  = 350.0     # seawater plate HEX + titanium tube + pump, £/kW thermal (cheap vs heating plant)
R_COVER_PER_M2       = 450.0     # light weather/biosecurity cover (NOT a heated hall), £/m²
FIXED_LIFE_SUPPORT   = 550_000.0 # genset sized to CRITICAL load + LOX buffer + fail-safe controls + alarms
FIXED_HANDLING_BLDG  = 350_000.0 # small heated food-grade grading/harvest building (the ONLY heated space)
INSTALL_FRACTION     = 0.22      # install + EPC + commissioning as a fraction of equipment capex

# Engineering coefficients
TANK_TURNOVERS_PER_H = 1.5       # recirc loop turnovers of the tank volume per hour
PUMP_HEAD_M          = 6.0       # low-head RAS recirc (gravity-assisted return)
PUMP_EFF             = 0.65
O2_KG_PER_KG_FEED    = 0.42      # O2 demand incl. nitrification, kg O2 per kg feed
UV_DOSE_KW_SHARE     = 0.013     # UV electrical as kW per m³/h (≈ validated dose + lamp ageing)
CONTROLS_AUX_KW      = 25.0      # PLC, analysers, dosing, lighting, auto-dialler
O2_PSA_KWH_PER_KG    = 0.55      # PSA generation energy (LOX backup is delivered, no power)
SEAWATER_C           = 12.0      # raw seawater temperature
TARGET_C             = 13.5      # salmon post-smolt set-point
METABOLIC_KW_PER_T   = 0.6       # fish metabolic heat, kW per tonne standing biomass
FABRIC_LOSS_KW_PER_M2= 0.015     # covered insulated tank loss at the small ambient gradient, kW/m²

# Opex rates
P_GBP_PER_KWH        = 0.18      # industrial electricity
FEED_GBP_PER_T       = 1_550.0   # marine post-smolt diet
SMOLT_GBP_EACH       = 1.40      # 100 g seawater-ready input smolt
# Labour scales sub-linearly: a fixed core crew + a per-tonne component. At 111 t → ~£321k
# (matches the single-plant estimate); at 800 t the same model gives ~£1.2M (≈£1.5/kg, not £2.9/kg).
LABOUR_BASE_GBP_YR   = 180_000.0
LABOUR_PER_T_GBP     = 1_280.0
MAINT_FRACTION       = 0.03      # annual maintenance as fraction of equipment capex
O2_CHEM_GBP_PER_T    = 350.0     # LOX top-up + bicarbonate + sundries, £/t output
HOURS_PER_YEAR       = 8_322.0   # 95% availability


def _pump_kw(flow_m3h: float) -> float:
    # P = rho*g*Q*H / (3.6e6 * eff), Q in m³/h
    return 1000.0 * 9.81 * flow_m3h * PUMP_HEAD_M / (3.6e6 * PUMP_EFF)


def model(monthly_cohort_n: int) -> dict:
    s = schedule(monthly_cohort_n=monthly_cohort_n)
    standing_t = s["standing_biomass_t"]
    tank_vol = s["total_tank_volume_m3"]
    peak_feed = s["peak_feed_kg_day"]
    annual_t = s["annual_tonnes"]
    annual_n = s["annual_postsmolts"]
    annual_feed_t = s["annual_feed_t"]

    # ── loads ───────────────────────────────────────────────────────────────
    recirc_flow = tank_vol * TANK_TURNOVERS_PER_H
    pump_kw = _pump_kw(recirc_flow) * 1.6   # ×1.6: multiple size-class loops + duty margin
    o2_kg_day = peak_feed * O2_KG_PER_KG_FEED
    o2_kw = (o2_kg_day / 24.0) * O2_PSA_KWH_PER_KG
    uv_kw = recirc_flow * UV_DOSE_KW_SHARE
    # heat balance → cooling duty (positive = needs cooling)
    metabolic_kw = standing_t * METABOLIC_KW_PER_T
    fabric_area_m2 = tank_vol / 3.0 * 2.4           # ≈ footprint (3 m deep tanks) × cover factor
    fabric_loss_kw = fabric_area_m2 * FABRIC_LOSS_KW_PER_M2
    net_heat_kw = pump_kw + metabolic_kw - fabric_loss_kw   # >0 → surplus heat to reject
    cooling_kw = max(net_heat_kw, 0.0)
    cool_pump_kw = cooling_kw * 0.05                # seawater circulation pump for the HEX
    connected_kw = pump_kw + o2_kw + uv_kw + uv_kw * 0 + CONTROLS_AUX_KW + cool_pump_kw

    # ── capex ────────────────────────────────────────────────────────────────
    cap = {
        "rearing_tanks": tank_vol * R_TANK_PER_M3,
        "water_treatment": peak_feed * R_TREATMENT_PER_KGD,
        "uv_disinfection": recirc_flow * R_UV_PER_M3H,
        "oxygenation": o2_kg_day * R_OXY_PER_KGO2D,
        "recirc_pumps": pump_kw * R_PUMP_PER_KW,
        "seawater_cooling_hex": cooling_kw * R_COOL_HEX_PER_KWTH,
        "light_cover": fabric_area_m2 * R_COVER_PER_M2,
        "life_support_backup": FIXED_LIFE_SUPPORT,
        "handling_harvest_bldg": FIXED_HANDLING_BLDG,
    }
    equipment = sum(cap.values())
    install = equipment * INSTALL_FRACTION
    capex = equipment + install

    # ── opex ──────────────────────────────────────────────────────────────────
    power_kwh = connected_kw * HOURS_PER_YEAR
    opex = {
        "power": power_kwh * P_GBP_PER_KWH,
        "feed": annual_feed_t * FEED_GBP_PER_T,
        "smolts": annual_n * SMOLT_GBP_EACH,
        "labour": LABOUR_BASE_GBP_YR + LABOUR_PER_T_GBP * annual_t,
        "maintenance": equipment * MAINT_FRACTION,
        "o2_chemicals": annual_t * O2_CHEM_GBP_PER_T,
    }
    opex_total = sum(opex.values())

    return {
        "monthly_cohort_n": monthly_cohort_n,
        "annual_postsmolts": annual_n, "annual_tonnes": annual_t,
        "standing_biomass_t": standing_t, "total_tank_volume_m3": tank_vol,
        "peak_feed_kg_day": peak_feed, "recirc_flow_m3h": round(recirc_flow),
        "loads_kw": {"pumps": round(pump_kw), "oxygen": round(o2_kw, 1), "uv": round(uv_kw, 1),
                     "controls": CONTROLS_AUX_KW, "cooling_pump": round(cool_pump_kw, 1),
                     "connected_total": round(connected_kw)},
        "heat_balance_kw": {"pump_heat": round(pump_kw), "metabolic": round(metabolic_kw),
                            "fabric_loss": round(fabric_loss_kw), "net_cooling_duty": round(cooling_kw)},
        "capex_breakdown": {k: round(v) for k, v in cap.items()},
        "equipment_gbp": round(equipment), "install_gbp": round(install), "capex_gbp": round(capex),
        "opex_breakdown": {k: round(v) for k, v in opex.items()}, "opex_gbp": round(opex_total),
        "fits_capex": capex <= CAPEX_CEILING_GBP, "fits_grid": connected_kw <= GRID_LIMIT_KW,
    }


def find_max_output() -> dict:
    """Largest monthly cohort whose plant fits BOTH the £5M and 0.5 MW limits."""
    best = None
    for n in range(2_000, 30_001, 1_000):
        m = model(n)
        if m["fits_capex"] and m["fits_grid"]:
            best = m
        else:
            break
    return best or model(2_000)


def economics(m: dict, price_each: float) -> dict:
    revenue = m["annual_postsmolts"] * price_each
    ebitda = revenue - m["opex_gbp"]
    payback = (m["capex_gbp"] / ebitda) if ebitda > 0 else float("inf")
    roi = (ebitda / m["capex_gbp"]) if m["capex_gbp"] else 0.0
    return {"price_each": price_each, "revenue": round(revenue), "ebitda": round(ebitda),
            "payback_years": round(payback, 1) if payback != float("inf") else None,
            "simple_roi_pct": round(roi * 100, 1)}


def breakeven_price(m: dict, target_payback_yr: float = 10.0) -> float:
    needed_ebitda = m["capex_gbp"] / target_payback_yr
    return round((m["opex_gbp"] + needed_ebitda) / m["annual_postsmolts"], 2)


def _print(m: dict) -> None:
    g = lambda x: f"£{x:,.0f}"
    print("TAYINLOAN ATLANTIC-SALMON POST-SMOLT RAS — techno-economic model")
    print("  (fits BOTH the £5.0M capex ceiling AND the 0.5 MW existing grid; no heating plant)")
    print("=" * 82)
    print(f"  SIZE @ £5M + 0.5MW:  {m['annual_tonnes']:.0f} t/yr  "
          f"({m['annual_postsmolts']:,} × 1 kg post-smolts), monthly cohort {m['monthly_cohort_n']:,}")
    print(f"  Standing biomass {m['standing_biomass_t']:.0f} t · tankage {m['total_tank_volume_m3']:,.0f} m³ "
          f"· peak feed {m['peak_feed_kg_day']:,.0f} kg/day · recirc {m['recirc_flow_m3h']:,} m³/h")
    hb = m["heat_balance_kw"]
    print(f"\n  HEAT BALANCE: pump heat {hb['pump_heat']} kW + metabolic {hb['metabolic']} kW "
          f"− fabric loss {hb['fabric_loss']} kW  →  NET COOLING {hb['net_cooling_duty']} kW")
    print(f"    → met by a seawater heat exchanger (cheap), NOT a heating plant. The pumps heat it; the sea cools it.")
    L = m["loads_kw"]
    print(f"\n  CONNECTED LOAD: pumps {L['pumps']} + O2 {L['oxygen']} + UV {L['uv']} + controls "
          f"{L['controls']} + cooling {L['cooling_pump']}  =  {L['connected_total']} kW  "
          f"(limit 500 kW → {'FITS' if m['fits_grid'] else 'OVER'})")
    print(f"\n  CAPEX  (ceiling £5.0M → {'FITS' if m['fits_capex'] else 'OVER'}):")
    for k, v in m["capex_breakdown"].items():
        print(f"    {k:24} {g(v)}")
    print(f"    {'install + EPC (22%)':24} {g(m['install_gbp'])}")
    print(f"    {'= ALL-IN CAPEX':24} {g(m['capex_gbp'])}")
    print(f"\n  OPEX / yr  ({g(m['opex_gbp'])} total):")
    for k, v in m["opex_breakdown"].items():
        print(f"    {k:24} {g(v)}")
    print(f"\n  ECONOMICS vs post-smolt selling price (the key uncertainty):")
    print(f"    {'price/fish':>11}{'revenue/yr':>14}{'EBITDA/yr':>13}{'payback':>10}{'ROI':>8}")
    for p in (7.0, 9.0, 11.0, 13.0, 15.0):
        e = economics(m, p)
        pb = f"{e['payback_years']} yr" if e["payback_years"] else "never"
        print(f"    {'£'+format(p,'.0f'):>11}{g(e['revenue']):>14}{g(e['ebitda']):>13}{pb:>10}{e['simple_roi_pct']:>7}%")
    print(f"\n  BREAKEVEN price for a 10-yr payback: £{breakeven_price(m):.2f}/post-smolt")
    print(f"\n  HEAD-TO-HEAD vs the heated kingfish RAS at the SAME site:")
    print(f"    kingfish (heated, 26.4°C):  62 t/yr  @ ~£7.0M  ·  658 kW connected  → OVER the 0.5 MW grid (needs 6 MW micro-grid)")
    print(f"    salmon (ambient, no heat):  {m['annual_tonnes']:.0f} t/yr  @ £{m['capex_gbp']/1e6:.1f}M  "
          f"·  {L['connected_total']} kW connected  → fits the existing grid")
    print(f"    → ~{m['annual_tonnes']/62:.1f}× the output for less capital, on the grid you already have.")


def scale_curve(market_price: float = 8.0) -> list:
    """Sweep plant size (ignoring the £5M ceiling) to find where the unit economics beat the real
    ~£8 market price. Fixed costs (life-support, handling building, core labour) amortise with scale,
    so the fully-loaded £/fish falls — the question is at what size it crosses below market."""
    rows = []
    for n in range(10_000, 100_001, 10_000):
        m = model(n)
        e = economics(m, market_price)
        unit_opex = m["opex_gbp"] / m["annual_postsmolts"]
        fully_loaded = unit_opex + (m["capex_gbp"] / 10.0) / m["annual_postsmolts"]  # +10-yr straight-line capex
        rows.append({"t": m["annual_tonnes"], "capex": m["capex_gbp"],
                     "connected_kw": m["loads_kw"]["connected_total"], "fits_grid": m["fits_grid"],
                     "fully_loaded_per_fish": fully_loaded, "ebitda": e["ebitda"],
                     "payback": e["payback_years"]})
    return rows


def _print_scale_curve(market_price: float = 8.0) -> None:
    g = lambda x: f"£{x:,.0f}"
    print("\n" + "=" * 82)
    print(f"SCALE CURVE — does salmon pay at the REAL market price (~£{market_price:.0f}/post-smolt)?")
    print("  (fixed costs amortise with size; capex no longer capped at £5M; grid limit 500 kW noted)")
    print(f"  {'t/yr':>6}{'capex':>13}{'load kW':>9}{'£/fish cost':>13}{'EBITDA/yr':>13}{'payback':>10}  grid")
    for r in scale_curve(market_price):
        pb = f"{r['payback']} yr" if r["payback"] else "never"
        grid = "fits" if r["fits_grid"] else "OVER→micro-grid"
        margin = market_price - r["fully_loaded_per_fish"]
        print(f"  {r['t']:>6.0f}{g(r['capex']):>13}{r['connected_kw']:>9.0f}"
              f"{'£'+format(r['fully_loaded_per_fish'],'.2f'):>13}{g(r['ebitda']):>13}{pb:>10}  {grid}")
    print(f"  (£/fish cost = opex + 10-yr straight-line capex; profitable where it falls below £{market_price:.0f})")


if __name__ == "__main__":
    best = find_max_output()
    if "--json" in sys.argv:
        out = dict(best)
        out["economics_curve"] = [economics(best, p) for p in (7, 9, 11, 13, 15)]
        out["breakeven_10yr"] = breakeven_price(best)
        print(json.dumps(out, indent=2))
    else:
        _print(best)
        _print_scale_curve(8.0)
