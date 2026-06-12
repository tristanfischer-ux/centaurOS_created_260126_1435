#!/usr/bin/env python3
"""budget_solve.py — design-to-budget: fix a £ budget, solve the OUTPUT it affords.

Plan (c), Tristan 2026-06-12 reframe: the budget SETS THE SCALE; the OUTPUT is the
dependent variable — "with the original budget ~1,000 units; at HALF the budget maybe
~300", and that is the answer, not a failure. This is tractable now that the cost scales
bottom-up with capacity (the cost-scale work): plant cost ~ capacity^0.6 (the six-tenths
rule), so the inverse is near-closed-form:

    affordable_output = current_output × (budget / current_cost)^(1 / 0.6)

(½ budget → 0.5^(1/0.6) = 0.315 → ~31% output, i.e. ~300 of 1,000 — matching the ask.)

Emits budget-report.json with the budget→output flex. The actual re-design at the solved
output is one chain run at that target (not an N-iteration loop).

Usage:  python3 budget_solve.py <out_dir | state.json> [--budget <£>] [--json]
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

SIX_TENTHS = 0.6   # cost ~ capacity^0.6 (process-equipment economy of scale)
MIN_SCALE = 0.05   # below ~5% of the reference scale there is no sensible plant


def _state_path(arg: str) -> Path:
    p = Path(arg)
    return (p / "state.json") if p.is_dir() else p


def solve(state_path: Path, budget_gbp: float | None = None) -> dict:
    s = json.loads(Path(state_path).read_text())
    cs = s.get("costStack") or {}
    cr = s.get("cost_reality") or {}
    # Use the INSTALLED cost (the all-in figure a buyer's budget actually pays), not the
    # ex-works oem_transfer — anchoring to oem under-states the budget by ~35% (found by
    # LOOKING at the rendered page: the column said 'INSTALLED £' but showed oem).
    cost = (cs.get("installed_asp_gbp") or cs.get("oem_transfer_price_gbp")
            or cr.get("bom_total_gbp") or cs.get("channel_list_price_gbp"))
    tp = ((s.get("parsedBrief") or {}).get("constraints") or {}).get("target_performance") or {}
    out = tp.get("value")
    if out in (None, 0):
        out = ((tp.get("metrics") or [{}])[0]).get("value")
    unit = tp.get("unit", "") or ((tp.get("metrics") or [{}])[0]).get("unit", "")
    metric = tp.get("key_metric", "") or ((tp.get("metrics") or [{}])[0]).get("key_metric", "")
    try:
        cost = float(cost); out = float(out)
    except (TypeError, ValueError):
        return {"schema": "budget-report/v1", "error": "missing cost or output in state",
                "cost_gbp": cost, "output": out}

    def output_for(b: float) -> float:
        frac = max(MIN_SCALE, (b / cost)) ** (1.0 / SIX_TENTHS)
        return float(f"{out * frac:.3g}")   # 3 sig figs — no false '621.746' precision

    flex = {}
    for f in (0.25, 0.5, 0.75, 1.0, 1.5, 2.0):
        b = round(cost * f)
        flex[f"{int(f*100)}%"] = {"budget_gbp": b, "output": output_for(b)}
    rep = {
        "schema": "budget-report/v1",
        "current_cost_gbp": round(cost),
        "current_output": out, "unit": unit, "metric": metric,
        "scaling": "six-tenths (plant cost ~ capacity^0.6); output = current × (budget/cost)^(1/0.6)",
        "note": ("the budget sets the scale — output is the dependent variable. "
                 "Below ~5% of the reference scale there is no sensible plant (floor)."),
        "budget_flex": flex,
    }
    if budget_gbp:
        rep["target_budget_gbp"] = round(float(budget_gbp))
        rep["affordable_output"] = output_for(float(budget_gbp))
        rep["fits_brief_output"] = bool(rep["affordable_output"] >= out * 0.999)
    return rep


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    budget = None
    if "--budget" in argv:
        budget = float(argv[argv.index("--budget") + 1])
    rep = solve(_state_path(argv[0]), budget)
    out_dir = Path(argv[0]) if Path(argv[0]).is_dir() else Path(argv[0]).parent
    (out_dir / "budget-report.json").write_text(json.dumps(rep, indent=1))
    if "--json" in argv:
        print(json.dumps(rep, indent=1)); return 0
    if rep.get("error"):
        print(f"  budget-solve: {rep['error']}"); return 1
    print(f"  DESIGN-TO-BUDGET — current £{rep['current_cost_gbp']:,} → {rep['current_output']:g} {rep['unit']}")
    print(f"  {'-'*60}")
    for k, v in rep["budget_flex"].items():
        print(f"   {k:>4} budget  £{v['budget_gbp']:>12,}  →  {v['output']:g} {rep['unit']}")
    if budget:
        print(f"   TARGET £{rep['target_budget_gbp']:,} → {rep['affordable_output']:g} {rep['unit']}"
              f"  ({'meets' if rep['fits_brief_output'] else 'below'} the brief's {rep['current_output']:g})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
