#!/usr/bin/env python3
"""
scripts/blender-universal/design_optimisation.py

DETERMINISTIC DESIGN-OPTIMISATION loops for the universal CAD/engineering engine.

WHY THIS EXISTS
    Sizing a connection to its THERMAL / VOLT-DROP minimum (what
    `connection_sizing.py` does) produces a design that is CORRECT but not
    OPTIMAL. Two standard engineering optimisations turn "good" into "best":

      1. ECONOMIC CONDUCTOR SIZING (Kelvin's law of conductor size, the basis of
         IEC 60287-3-2 / BS 7671 App 4 economic-sizing guidance). The smallest
         cable that is thermally + volt-drop legal is almost NEVER the cheapest
         over the plant's life: a fatter conductor costs more to BUY but wastes
         less energy as I²R heat every hour it runs. Total cost of ownership
            TCO(A) = capex(A) + present-value of lifetime I²R-loss energy(A)
         has a real minimum at a cross-section USUALLY ONE-TO-THREE LADDER STEPS
         ABOVE the thermal minimum. Most installations never compute it and leave
         money (and carbon) on the table. We compute it deterministically over the
         standard CSA ladder and report the optimum + the lifetime saving.

      2. LAYOUT-LENGTH MINIMISATION. Total routed cable/pipe length — hence both
         its capex AND its lifetime loss — depends on WHERE the equipment sits.
         Re-ordering equipment along the process spine to minimise the
         connectivity-weighted total run length is a linear-arrangement problem;
         a deterministic 2-opt (try every pair swap, keep an improving one,
         repeat to a local optimum) shortens the runs with NO randomness, so the
         result is reproducible and the objective strictly decreases each step.

    Both are PURE (no Blender, no network). The economic optimiser reuses the
    cost ladders + resistivity already stated in `connection_sizing.py` so there
    is one source of truth for £/m and Ω·mm²/m. Both are wrapped by
    `convergence_loop.py` inside the physics<->CAD fixed-point iteration, but they
    stand alone and are unit-tested headless.

HONESTY
    - The £/m ladders are the documented UK-2026 supply+install MODEL from
      connection_sizing.py (stamped cost_source there). The optimiser does not
      invent new prices; it re-weights the SAME ladder by lifetime energy.
    - The economic optimum depends on stated financial assumptions (operating
      hours, loss-load factor, energy price, discount rate, horizon). Every one
      is an explicit argument with a documented default and is echoed back in the
      result's `assumptions`, so the number is auditable, never a black box.
    - Copper resistivity is taken at a stated 20 °C (0.0172 Ω·mm²/m, matching
      connection_sizing.size_electrical's busbar branch). A hotter conductor has
      higher resistance — we note this is a slightly OPTIMISTIC loss (the real
      optimum is therefore at least as fat as we report), and expose a
      `temp_coeff` knob so a caller can de-rate at operating temperature.

British spelling throughout.
"""
from __future__ import annotations

import math
import os
import sys
from typing import Any, Optional

# One source of truth for the ladders + resistivity: import from the sizer.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)
import connection_sizing as cs  # noqa: E402

# Copper resistivity at 20 °C [Ω·mm²/m] — same value size_electrical uses.
RHO_CU_20C = 0.0172
# Copper temperature coefficient of resistance [per K] — to de-rate to operating
# temp when a caller supplies one (R(T) = R20·(1 + alpha·(T-20))).
CU_TEMP_COEFF_PER_K = 0.00393

# --- Economic-sizing default financial basis (UK-2026, all overridable) --------
# These DRIVE the optimum and are echoed in every result so the answer is
# auditable. They are deliberately conservative/standard, not cherry-picked.
DEFAULT_OPERATING_HOURS_PER_YEAR = 8760.0   # continuous plant; scale by util below
DEFAULT_UTILISATION = 0.85                  # fraction of the year at design load
DEFAULT_LOSS_LOAD_FACTOR = 1.0              # I²R uses the loss-load factor; 1.0 =
#   size at the continuous design current (conservative — a varying load has LLF<1
#   so LESS loss; 1.0 therefore never UNDER-sizes the economic optimum).
DEFAULT_ENERGY_PRICE_GBP_PER_KWH = 0.18     # UK-2026 industrial electricity
DEFAULT_DISCOUNT_RATE = 0.08                # real discount rate for PV of losses
DEFAULT_HORIZON_YEARS = 25.0               # plant economic life
# Below this lifetime-saving fraction of capex the upsize is "not worth it" noise.
ECONOMIC_MIN_WORTHWHILE_SAVING_GBP = 1.0


# ===========================================================================
# 1. ECONOMIC CONDUCTOR SIZING  (Kelvin's law of conductor size)
# ===========================================================================

def _present_value_annuity_factor(rate: float, years: float) -> float:
    """PV of £1/yr for `years` at real discount `rate`:  (1 - (1+r)^-n)/r.

    At rate 0 this is just `years` (sum of n undiscounted pounds)."""
    if rate <= 1e-9:
        return years
    return (1.0 - (1.0 + rate) ** (-years)) / rate


def _conductor_resistance_ohm(csa_mm2: float, length_m: float,
                              n_parallel: int, temp_c: Optional[float]) -> float:
    """Run resistance [Ω] of `n_parallel` copper conductors of `csa_mm2` over
    `length_m`. Optionally de-rated to `temp_c` (else 20 °C)."""
    rho = RHO_CU_20C
    if temp_c is not None:
        rho = RHO_CU_20C * (1.0 + CU_TEMP_COEFF_PER_K * (temp_c - 20.0))
    return rho * max(0.0, length_m) / max(1e-9, csa_mm2) / max(1, n_parallel)


def economic_conductor_csa(
    current_a: float,
    length_m: float,
    *,
    thermal_min_csa_mm2: Optional[float] = None,
    n_parallel: int = 1,
    n_cores: int = 1,
    operating_hours_per_year: float = DEFAULT_OPERATING_HOURS_PER_YEAR,
    utilisation: float = DEFAULT_UTILISATION,
    loss_load_factor: float = DEFAULT_LOSS_LOAD_FACTOR,
    energy_price_gbp_per_kwh: float = DEFAULT_ENERGY_PRICE_GBP_PER_KWH,
    discount_rate: float = DEFAULT_DISCOUNT_RATE,
    horizon_years: float = DEFAULT_HORIZON_YEARS,
    conductor_temp_c: Optional[float] = None,
) -> dict:
    """Pick the lifetime-cheapest copper CSA at/above the thermal minimum.

    Sweeps the standard CSA ladder (cs.CABLE_CSA_LADDER) from the thermal/volt-
    drop minimum upward, computing for each:
        capex(A)        = cs.CABLE_COST_GBP_PER_M_BY_CSA[A] × L × n_parallel × n_cores
        annual_loss(A)  = I² × R(A) × operating_hours × utilisation × LLF   [kWh]
        pv_losses(A)    = annual_loss_cost(A) × PV_annuity(discount, horizon)
        TCO(A)          = capex(A) + pv_losses(A)
    and returns the A that minimises TCO, alongside the thermal-minimum A so the
    caller sees the saving from upsizing. PURE.

    `thermal_min_csa_mm2` is the floor (the smallest legal size from the sizer);
    when None the whole ladder is considered (floor = smallest ladder rung).

    Returns a dict with: thermal_min_csa, economic_csa, ladder_steps_up,
    capex_thermal, capex_economic, pv_losses_thermal, pv_losses_economic,
    tco_thermal, tco_economic, lifetime_saving_gbp (TCO_thermal - TCO_economic,
    ≥0), annual_loss_kwh_thermal/economic, sweep[] (per-rung TCO breakdown),
    worthwhile (bool), assumptions[]. NEVER recommends BELOW the thermal floor.
    """
    pv = _present_value_annuity_factor(discount_rate, horizon_years)
    hours = max(0.0, operating_hours_per_year) * max(0.0, utilisation)
    # The loss current is the design current scaled by sqrt(LLF) in energy terms;
    # we apply LLF directly to the I²R energy (loss-load factor convention).
    i = max(0.0, current_a)

    floor = thermal_min_csa_mm2 if thermal_min_csa_mm2 is not None else cs.CABLE_CSA_LADDER[0]
    rungs = [a for a in cs.CABLE_CSA_LADDER if a >= floor - 1e-9]
    if not rungs:
        # current exceeds the ladder (busbar territory) — economic sizing of a
        # stranded cable does not apply; report a no-op honestly.
        return {
            "applicable": False,
            "reason": "thermal minimum exceeds the stranded-cable ladder (busbar) "
                      "— economic conductor sizing applies to cables only",
            "thermal_min_csa": thermal_min_csa_mm2,
            "economic_csa": thermal_min_csa_mm2,
            "lifetime_saving_gbp": 0.0,
            "assumptions": [],
        }

    def _tco(a: float) -> dict:
        cpm = cs.CABLE_COST_GBP_PER_M_BY_CSA.get(a)
        if cpm is None:
            # interpolate defensively (ladder keys are exact, so this rarely runs)
            cpm = cs.CABLE_COST_GBP_PER_M_BY_CSA[min(
                cs.CABLE_COST_GBP_PER_M_BY_CSA, key=lambda k: abs(k - a))]
        capex = cpm * max(0.0, length_m) * max(1, n_parallel) * max(1, n_cores)
        r = _conductor_resistance_ohm(a, length_m, n_parallel, conductor_temp_c)
        loss_w = (i ** 2) * r * max(0.0, loss_load_factor)
        annual_kwh = loss_w / 1000.0 * hours
        annual_cost = annual_kwh * energy_price_gbp_per_kwh
        pv_loss = annual_cost * pv
        return {
            "csa_mm2": a,
            "capex_gbp": round(capex, 2),
            "loss_w": round(loss_w, 1),
            "annual_loss_kwh": round(annual_kwh, 1),
            "annual_loss_gbp": round(annual_cost, 2),
            "pv_losses_gbp": round(pv_loss, 2),
            "tco_gbp": round(capex + pv_loss, 2),
        }

    sweep = [_tco(a) for a in rungs]
    thermal_row = sweep[0]
    # The economic optimum = min TCO. Ties -> the SMALLER cable (first in ladder).
    econ_row = min(sweep, key=lambda r: (r["tco_gbp"], r["csa_mm2"]))
    saving = round(thermal_row["tco_gbp"] - econ_row["tco_gbp"], 2)
    steps_up = rungs.index(econ_row["csa_mm2"])  # 0 = thermal min already optimal
    worthwhile = saving >= ECONOMIC_MIN_WORTHWHILE_SAVING_GBP and steps_up > 0

    assumptions = [
        f"copper, ρ20={RHO_CU_20C} Ω·mm²/m"
        + (f", de-rated to {conductor_temp_c:g}°C" if conductor_temp_c is not None
           else " at 20 °C (slightly optimistic loss; true optimum ≥ this size)"),
        f"loss energy = I²R × {hours:.0f} h/yr (= {operating_hours_per_year:.0f} h × "
        f"{utilisation:.0%} util) × LLF {loss_load_factor:g}",
        f"energy £{energy_price_gbp_per_kwh:g}/kWh; discount {discount_rate:.0%}; "
        f"horizon {horizon_years:.0f} yr → PV-annuity factor {pv:.2f}",
        f"capex = £/m ladder × {length_m:.1f} m × {n_parallel} parallel × {n_cores} core(s)",
        "cost ladder = connection_sizing UK-2026 supply+install model (not engine data)",
    ]
    return {
        "applicable": True,
        "thermal_min_csa": thermal_row["csa_mm2"],
        "economic_csa": econ_row["csa_mm2"],
        "ladder_steps_up": steps_up,
        "n_parallel": n_parallel,
        "n_cores": n_cores,
        "current_a": round(i, 1),
        "length_m": round(length_m, 2),
        "capex_thermal_gbp": thermal_row["capex_gbp"],
        "capex_economic_gbp": econ_row["capex_gbp"],
        "pv_losses_thermal_gbp": thermal_row["pv_losses_gbp"],
        "pv_losses_economic_gbp": econ_row["pv_losses_gbp"],
        "tco_thermal_gbp": thermal_row["tco_gbp"],
        "tco_economic_gbp": econ_row["tco_gbp"],
        "lifetime_saving_gbp": max(0.0, saving),
        "annual_loss_kwh_thermal": thermal_row["annual_loss_kwh"],
        "annual_loss_kwh_economic": econ_row["annual_loss_kwh"],
        "annual_loss_reduction_kwh": round(
            thermal_row["annual_loss_kwh"] - econ_row["annual_loss_kwh"], 1),
        "worthwhile": worthwhile,
        "sweep": sweep,
        "assumptions": assumptions,
        "cost_source": cs.COST_SOURCE_MODEL,
    }


# ===========================================================================
# 2. LAYOUT-LENGTH MINIMISATION  (deterministic 2-opt linear arrangement)
# ===========================================================================
#
#   The equipment sits at ordered slots along the process spine (slot i at
#   x = i · pitch). A connection between two pieces costs
#       weight × |x_from - x_to|   (longer + fatter/dearer runs weigh more).
#   Minimising Σ over edges of that product is a Minimum Linear Arrangement —
#   NP-hard in general but tiny here (≤ a few dozen pieces). A deterministic
#   2-opt (scan all i<j, swap if it lowers the objective, restart the scan,
#   stop at a local optimum) gives a reproducible, monotonically-improving
#   answer with no randomness. The PROCESS order is the natural starting point
#   (so a good process flow is preserved unless a real shortening beats it).
# ===========================================================================

def _arrangement_cost(order: list[str], weights: dict, pitch_m: float) -> float:
    """Σ weight_e × |slot(from) - slot(to)| × pitch over all weighted edges."""
    slot = {node: i for i, node in enumerate(order)}
    total = 0.0
    for (a, b), w in weights.items():
        if a in slot and b in slot:
            total += w * abs(slot[a] - slot[b]) * pitch_m
    return total


def minimise_layout_length(
    nodes: list[str],
    edges: list[dict],
    *,
    pitch_m: float = 3.0,
    initial_order: Optional[list[str]] = None,
    pinned: Optional[set] = None,
    max_passes: int = 200,
) -> dict:
    """Re-order `nodes` along the spine to minimise connectivity-weighted total
    run length via deterministic 2-opt. PURE.

    edges: list of {from, to, weight?} — `weight` defaults to 1.0 (use £/m or a
        size proxy so fat/expensive runs are shortened preferentially). Parallel
        edges between the same pair accumulate.
    pinned: nodes whose slot must not move (e.g. a grid incomer fixed at one end);
        a swap touching a pinned node is rejected.
    initial_order: starting arrangement (defaults to `nodes` order = the process
        order the caller hands in, so a sensible flow is the seed).

    Returns: initial_order, optimised_order, initial_total_m, optimised_total_m,
    reduction_m, pct_saved, swaps_applied, pitch_m, weights_used, assumptions[].
    Guarantees optimised_total_m ≤ initial_total_m (2-opt only accepts improving
    swaps), and is deterministic (fixed scan order, strict-improvement threshold).
    """
    pinned = pinned or set()
    order = list(initial_order if initial_order is not None else nodes)
    # Accumulate weights for undirected pairs (a,b) canonicalised.
    weights: dict = {}
    for e in edges:
        a, b = e.get("from"), e.get("to")
        if a is None or b is None or a == b:
            continue
        w = cs._f(e.get("weight"), 1.0) or 1.0
        key = (a, b) if a <= b else (b, a)
        weights[key] = weights.get(key, 0.0) + w

    initial_total = _arrangement_cost(order, weights, pitch_m)
    best_total = initial_total
    swaps = 0
    # Deterministic 2-opt: repeatedly scan all i<j, apply the FIRST improving swap,
    # restart. Strict-improvement (eps) guarantees termination + determinism.
    eps = 1e-6
    for _ in range(max_passes):
        improved = False
        n = len(order)
        for i in range(n):
            if order[i] in pinned:
                continue
            for j in range(i + 1, n):
                if order[j] in pinned:
                    continue
                order[i], order[j] = order[j], order[i]
                cand = _arrangement_cost(order, weights, pitch_m)
                if cand < best_total - eps:
                    best_total = cand
                    swaps += 1
                    improved = True
                    break
                # revert
                order[i], order[j] = order[j], order[i]
            if improved:
                break
        if not improved:
            break

    reduction = initial_total - best_total
    pct = (100.0 * reduction / initial_total) if initial_total > 1e-9 else 0.0
    return {
        "initial_order": list(initial_order if initial_order is not None else nodes),
        "optimised_order": order,
        "initial_total_m": round(initial_total, 2),
        "optimised_total_m": round(best_total, 2),
        "reduction_m": round(reduction, 2),
        "pct_saved": round(pct, 1),
        "swaps_applied": swaps,
        "pitch_m": pitch_m,
        "n_nodes": len(order),
        "n_weighted_pairs": len(weights),
        "assumptions": [
            f"slot pitch {pitch_m:g} m; cost = Σ weight × |Δslot| × pitch",
            "weight defaults to 1.0; pass £/m or a size proxy to shorten fat runs first",
            "deterministic 2-opt (first improving swap, fixed scan order) → local optimum",
            f"{len(pinned)} pinned node(s) held fixed" if pinned else "no pinned nodes",
        ],
    }


# ===========================================================================
# 3. Demo (real-ish numbers) when run directly.
# ===========================================================================

def _demo() -> None:
    print("=== ECONOMIC CONDUCTOR SIZING — 400 A feeder, 100 m run ===")
    r = economic_conductor_csa(400.0, 100.0, thermal_min_csa_mm2=185.0)
    print(f"  thermal-min {r['thermal_min_csa']} mm²  TCO £{r['tco_thermal_gbp']:,.0f}")
    print(f"  economic    {r['economic_csa']} mm²  TCO £{r['tco_economic_gbp']:,.0f}"
          f"  ({r['ladder_steps_up']} steps up)")
    print(f"  lifetime saving £{r['lifetime_saving_gbp']:,.0f}; annual loss "
          f"{r['annual_loss_kwh_thermal']:,.0f} → {r['annual_loss_kwh_economic']:,.0f} kWh")
    print()
    print("=== LAYOUT-LENGTH MINIMISATION — a mis-ordered 5-stage process ===")
    nodes = ["feed", "react", "sep", "compress", "product"]
    # A deliberately bad initial order where the recycle (compress↔react) is long.
    edges = [
        {"from": "feed", "to": "react", "weight": 2.0},
        {"from": "react", "to": "sep", "weight": 3.0},
        {"from": "sep", "to": "product", "weight": 2.0},
        {"from": "sep", "to": "compress", "weight": 4.0},   # recycle gas (fat)
        {"from": "compress", "to": "react", "weight": 4.0}, # recycle return (fat)
    ]
    bad = ["feed", "product", "react", "sep", "compress"]
    o = minimise_layout_length(nodes, edges, initial_order=bad, pitch_m=4.0)
    print(f"  initial  {o['initial_order']}  = {o['initial_total_m']} m·weight")
    print(f"  optimised {o['optimised_order']}  = {o['optimised_total_m']} m·weight")
    print(f"  {o['pct_saved']}% shorter in {o['swaps_applied']} swaps")


if __name__ == "__main__":
    _demo()
