#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/_worked.py

Shared helper for emitting a "worked calculation" record that the PDF appendix
renders so a reviewer can check the maths BY HAND without the source code.

WHY (Tristan 2026-06-02, reviewer feedback on the vertical-farm dossier): the
appendix used to state the model name + the OUTPUT, but never the inputs, the
formula, or the substituted numbers — so a reviewer "could not tell if the maths
was correct." This helper surfaces inputs -> formula -> substitution -> result.

DRIFT SAFETY (the one real risk): the substitution string is built HERE, from the
SAME live values the tool computed with, at the point of computation. It is never
hand-authored in TypeScript or the renderer from re-fetched values. So if the code
changes, the printed working changes with it — the two cannot silently diverge
(this repo has a documented recurring "two copies drift apart" failure family).
A regression invariant (regression-harness UNIVERSAL.worked_calc_arithmetic_sound)
re-evaluates each substitution and asserts it equals the stated result.

USAGE (in a tool's compute(), once per quantity worth showing):
    from _worked import worked_calc            # same-dir import
    worked = []
    worked.append(worked_calc(
        label="Photosynthetic photon flux density (PPFD)",
        formula="PPFD = (P_in x driver_eff x efficacy) / area",
        values={"P_in": (input_watts, "W"), "driver_eff": (driver_eff, ""),
                "efficacy": (efficacy, "umol/J"), "area": (growing_area_m2, "m2")},
        result=ppfd_umol_m2_s, result_unit="umol/m2/s",
        assumptions=["uniform canopy distribution", "no fixture/optical losses"],
    ))
    ...
    return { ..., "worked": worked }

Author formulas in PLAIN ASCII symbols (P_in, driver_eff, area, x for multiply) —
easy to read and free of unicode-glyph rendering risk in the PDF.
"""
from __future__ import annotations

from typing import Any


def _fmt(v: Any) -> str:
    """Display-format a number: thousands separators, up to 4 significant decimals,
    trailing zeros trimmed. Non-numbers pass through as str()."""
    if isinstance(v, bool):
        return str(v)
    if isinstance(v, (int, float)):
        fv = float(v)
        af = abs(fv)
        if af != 0 and (af >= 1e7 or af < 1e-3):
            return f"{fv:.4g}"
        s = f"{fv:,.4f}".rstrip("0").rstrip(".")
        return s if s else "0"
    return str(v)


def worked_calc(
    label: str,
    formula: str,
    values: dict[str, tuple[Any, str]],
    result: Any,
    result_unit: str = "",
    assumptions: list[str] | None = None,
) -> dict:
    """Build a drift-safe worked-calculation record.

    label:       short human label for the quantity.
    formula:     "LHS = <expr in terms of the value symbols>", plain ASCII.
    values:      { symbol: (value, unit) } — the LIVE values used in compute().
                 Every symbol that appears in `formula` MUST be a key here.
    result:      the computed numeric result (the SAME variable the tool returns).
    result_unit: unit string for the result.
    """
    lhs, _, rhs = formula.partition("=")
    lhs = lhs.strip() or label
    expr = (rhs or formula).strip()

    # Substitute longest symbols first so e.g. "area" is not partially hit while a
    # shorter symbol is a substring of a longer one (P vs P_in).
    subst = expr
    for sym in sorted(values.keys(), key=len, reverse=True):
        val, _unit = values[sym]
        subst = subst.replace(sym, _fmt(val))

    result_str = _fmt(result) + ((" " + result_unit) if result_unit else "")
    substitution = f"{lhs} = {subst} = {result_str}"

    return {
        "label": label,
        "formula": formula,
        "substitution": substitution,
        "inputs": [
            {"symbol": s, "value": v, "unit": u} for s, (v, u) in values.items()
        ],
        "result": {"value": result, "unit": result_unit},
        "assumptions": list(assumptions or []),
    }
