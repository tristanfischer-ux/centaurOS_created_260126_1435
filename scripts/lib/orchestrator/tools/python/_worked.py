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

import math
import re
import sys
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


# ─────────────────────────────────────────────────────────────────────────────
# Emission-time SELF-CHECK (2026-07-03 — the fake-tick doctrine applied to
# formulas, after v56d shipped "flow_lpm = (6,000 x 2) / 60 = 1,500" where the
# printed substitution evaluates to 200): a tool must REFUSE to emit a worked
# line whose printed arithmetic does not evaluate to its printed result within
# 0.5%. The safe re-evaluator is the ast-based pattern from
# control_systems_run.py (commit 9303ade9f), extended to tolerate the display
# idioms _worked emits: thousands commas, 'x' multiply, '^' power, literal
# 'pi', and scientific-notation constants like 1e9. It mirrors the harness
# invariant UNIVERSAL.worked_calc_arithmetic_sound (regression-harness.tsx) so
# a line this check accepts cannot fail the harness.
# ─────────────────────────────────────────────────────────────────────────────

# Function-bearing substitutions (sqrt/ln/min/…) are not plain +-*/ arithmetic;
# the harness skips them, and so does this check (same list).
_FN_SKIP = re.compile(
    r"\b(sqrt|cbrt|ln|log10|log|exp|ceil_to_standard|ceil|round|floor|min|max|abs)\s*\(",
    re.IGNORECASE,
)
_NUM_TOKEN = re.compile(r"\d+\.?\d*(?:[eE][+-]?\d+)?")


def _eval_arith(expr: str):
    """SAFE arithmetic evaluation via ast (NO eval — numbers and + - * / ** ( )
    unary +/- only; anything else → None). Same pattern as
    control_systems_run.py::_eval_arith (commit 9303ade9f)."""
    import ast
    try:
        # strip: leading whitespace raises IndentationError in mode="eval"
        tree = ast.parse(expr.strip(), mode="eval")
    except (SyntaxError, ValueError, MemoryError, RecursionError):
        return None

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return float(node.value)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            v = ev(node.operand)
            return None if v is None else (-v if isinstance(node.op, ast.USub) else v)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)):
            a, b = ev(node.left), ev(node.right)
            if a is None or b is None:
                return None
            try:
                if isinstance(node.op, ast.Add):
                    return a + b
                if isinstance(node.op, ast.Sub):
                    return a - b
                if isinstance(node.op, ast.Mult):
                    return a * b
                if isinstance(node.op, ast.Div):
                    return a / b
                return a ** b
            except (ZeroDivisionError, OverflowError):
                return None
        return None

    v = ev(tree)
    return v if (v is not None and math.isfinite(v)) else None


def eval_substitution(substitution: str):
    """Re-evaluate the PRINTED middle of a worked-calc substitution string
    ("LHS = <printed numbers> = <result unit>"). Returns the evaluated float,
    or None when the line is not plainly evaluable (function call, residual
    symbol, malformed) — mirroring the harness's skip behaviour."""
    parts = str(substitution).split("=")
    if len(parts) < 3:
        return None
    expr = "=".join(parts[1:-1])
    if _FN_SKIP.search(expr):
        return None
    expr = expr.replace(",", "")
    expr = re.sub(r"\bpi\b", repr(math.pi), expr, flags=re.IGNORECASE)
    expr = expr.replace("^", "**")
    # display multiply: 'x' between numbers/parens/whitespace (never inside a word)
    expr = re.sub(r"(?<=[\d\s()])x(?=[\s(\d])", "*", expr)
    # any residual alphabetic symbol (excluding scientific-notation exponents,
    # stripped with the number tokens) → not plainly evaluable
    if re.search(r"[A-Za-z]", _NUM_TOKEN.sub("", expr)):
        return None
    return _eval_arith(expr)


def worked_is_sound(record: dict, rel_tol: float = 0.005) -> bool:
    """True when the record's printed substitution evaluates to its stated
    result within rel_tol (default 0.5%), or when it is not plainly evaluable
    (function-bearing / symbolic lines pass through — same as the harness)."""
    got = eval_substitution((record or {}).get("substitution", ""))
    if got is None:
        return True
    stated = ((record or {}).get("result") or {}).get("value")
    try:
        stated = float(stated)
    except (TypeError, ValueError):
        return True
    if not math.isfinite(stated):
        return True
    return abs(got - stated) <= rel_tol * max(abs(stated), 1e-9)


def self_check_worked(records: list, tool_id: str = "", rel_tol: float = 0.005) -> list:
    """Emission-time gate: keep only worked records whose printed arithmetic
    adds up (within rel_tol); REFUSE (drop + warn on stderr — stdout stays pure
    JSON) any record that would mislead a reviewer re-deriving the maths. A
    dropped line is a TOOL BUG: fix the formula template / display precision at
    source rather than widening the tolerance."""
    kept: list = []
    for rec in records:
        if rec is None:
            continue
        if worked_is_sound(rec, rel_tol):
            kept.append(rec)
        else:
            got = eval_substitution(rec.get("substitution", ""))
            sys.stderr.write(
                f"[{tool_id or 'worked-calc'}] WARN: refused worked line "
                f"'{rec.get('substitution', '')}' — printed arithmetic evaluates to "
                f"{got!r}, not the stated result (>{rel_tol * 100:.1f}% off). "
                f"Formula-template/precision bug: fix the emitting code.\n"
            )
    return kept


def sig(v: Any, n: int = 6):
    """Round a number to n significant figures for worked-calc display values +
    results. Fixed-decimal round() was the v56d precision bug: round(1.3587, 1)
    → 1.4 printed in a substitution whose result was computed from 1.3587 (2.9%
    off — the harness fails it). Significant-figure rounding keeps display drift
    ~1e-6, far inside the 0.5% self-check, at any magnitude."""
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return v
    fv = float(v)
    if fv == 0 or not math.isfinite(fv):
        return fv
    return float(f"%.{int(n)}g" % fv)
