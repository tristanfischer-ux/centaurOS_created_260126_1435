#!/usr/bin/env python3
"""
build-excel-export.py — UNIVERSAL ForgeOS run -> multi-tab Excel review surface.

Turns any ``out/<run>/`` directory into ``out/<run>/dossier.xlsx``: a workbook that
REPLACES the HTML dossier as the review surface AND surfaces computational errors
via LIVE Excel formulas (edit a yellow input -> the whole chain recomputes; a
"Checks" tab goes RED where the engine's numbers do not reconcile).

USAGE
    .venv/bin/python scripts/build-excel-export.py out/ras-v26-verify
        argv[1] = run directory (defaults to out/ras-v26-verify if omitted)
        argv[2] = optional output path (defaults to <run>/dossier.xlsx)

DESIGN PRINCIPLES
  * UNIVERSAL: no ``if run == 'ras'`` logic. Everything is data-driven off
    state.json's documented data model. A class-specific value (e.g. the 1336
    per-tank inlet flow) is *discovered* by scanning the contract, never hardcoded.
  * READ-ONLY on engine code: this script imports nothing from the engine and
    modifies no engine file. It only reads out/<run>/*.json and *.png/*.svg.
  * LIVE where possible: STRUCTURED worked-calcs (those carrying inputs[]) become
    real Excel formulas referencing labelled yellow input cells, chained within a
    tool by exact value-equality. LEGACY calcs (no inputs[]) render as static text.

DATA MODEL (established by the feasibility pass — see module docstring map below)
  state.toolsUsedPage.tools[]                : list of 15+ tools, each
      .tool_id / .tool_name                  : identity
      .worked[]                              : the calcs. Two shapes:
        STRUCTURED {label, formula, substitution, inputs:[{symbol,value,unit}],
                    result:{value,unit}, assumptions}   (~67 calcs / 11 tools)
        LEGACY     {label, formula, substitution, result, result_unit}  (no inputs)
  state.orchestratorContract.quantities      : DICT name -> {value,unit,family,basis,
                                               scope,source,source_detail}
  state.orchestratorContract.closures        : engine's own balance closures
  state.requirementsBom                      : LIST of {tag,requirement,status,part,
                                               qty,unit_gbp,line_gbp,basis}
  state.costBasis                            : {lines:[...], rollup:{...}, methodology}
  out/<run>/quality-scorecard.json           : {floor,mean,allPass,sections:[{name,
                                               score,defects}], iteration}
  out/<run>/parts-ledger.json                : {grand_total_gbp, coverage_by_drawing,
                                               connection_coverage, ...}

FORMULA -> EXCEL TRANSLATION (verified with the `formulas` lib in the POC)
    x -> *   |   ^ stays ^   |   log10()/pi survive   |   parentheses survive
    GOTCHA: any cell whose *text* starts with '=' is parsed as a formula. All
    textual / display columns are written WITHOUT a leading '='.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from typing import Any, Dict, List, Optional, Tuple

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

# The SHARED deterministic-check library — the SAME pure-arithmetic checks the
# standalone CLI (scripts/deterministic-checks.py) runs, so the workbook's Checks
# tab and the instant CLI can never diverge. Imported by absolute path so the
# exporter works regardless of the caller's cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import deterministic_checks_lib as dcl  # noqa: E402

# ----------------------------------------------------------------------------
# STYLES — light theme only (Tristan: light mode, never dark)
# ----------------------------------------------------------------------------
FILL_HEADER = PatternFill("solid", fgColor="1F3A5F")      # deep navy header band
FILL_SUB = PatternFill("solid", fgColor="DCE6F1")          # pale blue sub-header
FILL_INPUT = PatternFill("solid", fgColor="FFF2CC")        # YELLOW = editable input
FILL_RESULT = PatternFill("solid", fgColor="E2EFDA")       # pale green = live result
FILL_CONST = PatternFill("solid", fgColor="FCE4D6")        # peach = shared constant
FILL_PASS = PatternFill("solid", fgColor="C6EFCE")         # green pass
FILL_FAIL = PatternFill("solid", fgColor="FFC7CE")         # red fail
FILL_LEGACY = PatternFill("solid", fgColor="F2F2F2")       # grey = static legacy calc
FILL_TITLE = PatternFill("solid", fgColor="2E5A88")

FONT_TITLE = Font(name="Calibri", size=15, bold=True, color="FFFFFF")
FONT_HEADER = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
FONT_SUB = Font(name="Calibri", size=11, bold=True, color="1F3A5F")
FONT_PASS = Font(bold=True, color="006100")
FONT_FAIL = Font(bold=True, color="9C0006")
FONT_NOTE = Font(italic=True, size=9, color="666666")
FONT_MONO = Font(name="Menlo", size=10)

THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP_TOP = Alignment(wrap_text=True, vertical="top")
LEFT_TOP = Alignment(horizontal="left", vertical="top")


# ============================================================================
# Small generic helpers
# ============================================================================
def load_json(path: str) -> Optional[Any]:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as fh:
            return json.load(fh)
    except Exception as exc:  # noqa: BLE001 — never let one bad file kill the export
        print(f"  ! could not parse {path}: {exc}")
        return None


def git_short_sha() -> str:
    """READ-only git: short SHA for provenance. Never mutate the repo."""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=10,
        )
        return out.stdout.strip() or "unknown"
    except Exception:  # noqa: BLE001
        return "unknown"


def num(v: Any) -> Optional[float]:
    """Coerce a value (possibly a display string like '13,360' or '£8.15 M') to float."""
    if v is None:
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace(",", "").replace("£", "").replace("$", "")
        m = re.search(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", s)
        if m:
            try:
                return float(m.group(0))
            except ValueError:
                return None
    return None


def qval(quantities: Dict[str, Any], key: str) -> Optional[float]:
    """Numeric value of a contract quantity (handles {value:..} or bare scalar)."""
    if key not in quantities:
        return None
    v = quantities[key]
    return num(v.get("value") if isinstance(v, dict) else v)


def qunit(quantities: Dict[str, Any], key: str) -> str:
    v = quantities.get(key)
    return (v.get("unit", "") if isinstance(v, dict) else "") or ""


def set_widths(ws: Worksheet, widths: Dict[str, float]) -> None:
    for col, w in widths.items():
        ws.column_dimensions[col].width = w


def title_row(ws: Worksheet, text: str, span: int, subtitle: str = "") -> int:
    """Write a full-width title band; return the next free row index."""
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span)
    c = ws.cell(1, 1, text)
    c.font = FONT_TITLE
    c.fill = FILL_TITLE
    c.alignment = Alignment(vertical="center", horizontal="left", indent=1)
    ws.row_dimensions[1].height = 26
    nxt = 2
    if subtitle:
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=span)
        s = ws.cell(2, 1, subtitle)
        s.font = FONT_NOTE
        s.alignment = LEFT_TOP
        nxt = 3
    return nxt + 1  # leave a blank spacer row


def header(ws: Worksheet, row: int, cols: List[str]) -> None:
    for i, name in enumerate(cols, start=1):
        c = ws.cell(row, i, name)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.border = BORDER
        c.alignment = Alignment(vertical="center", wrap_text=True)


def sub_banner(ws: Worksheet, row: int, text: str, span: int) -> None:
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
    c = ws.cell(row, 1, text)
    c.font = FONT_SUB
    c.fill = FILL_SUB
    c.alignment = LEFT_TOP


# ============================================================================
# FORMULA TRANSLATION:  engine symbolic ASCII  ->  live Excel formula
# ============================================================================
# Functions the engine emits that Excel understands as-is.
_FUNC_OK = {"log10", "log", "ln", "exp", "sqrt", "abs", "sin", "cos", "tan", "max", "min"}


def formula_to_excel(rhs: str, symbol_cell: Dict[str, str]) -> Optional[str]:
    """
    Translate the right-hand side of a worked-calc formula into a live Excel
    formula string (WITHOUT the leading '='), substituting each input symbol
    with its yellow cell reference.

    rhs            : e.g. "rho x g x (Q_m3h / 3600) x H_total"
    symbol_cell    : {symbol_name -> cell coordinate}, e.g. {"rho":"$B$5", "Q_m3h":"C12"}

    Returns None if any symbol in the expression has no cell mapping (we then
    fall back to static text — never emit a half-bound, wrong formula).
    """
    if not rhs:
        return None
    expr = rhs
    # 1) operator translation
    expr = expr.replace("×", "*").replace("·", "*")
    expr = re.sub(r"(?<=[\w\)\s])x(?=[\s\(])", "*", expr)  # ' x ' multiplication
    expr = expr.replace(" x ", " * ")
    # ln -> LN, exp -> EXP etc. are fine; Excel uses ^ for power already.
    expr = expr.replace("π", "PI()")
    # standalone 'pi' token -> PI()
    expr = re.sub(r"\bpi\b", "PI()", expr)

    # 2) collect identifier-like tokens, decide which are symbols vs functions
    #    identifier = letters/digits/underscore, must start with a letter or underscore.
    tokens = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", expr))
    # which tokens are immediately followed by '(' -> they are function calls
    func_tokens = set(re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*\(", expr))

    replacements: List[Tuple[str, str]] = []
    for tok in tokens:
        low = tok.lower()
        if tok in func_tokens or low in _FUNC_OK:
            continue  # it's a function call, leave it
        if low in ("pi", "e"):
            continue
        if tok not in symbol_cell:
            # An unbound symbol -> cannot make a faithful live formula.
            return None
        replacements.append((tok, symbol_cell[tok]))

    # 3) substitute longest-symbol-first so 'H_total' isn't clobbered by 'H'
    for tok, cell in sorted(replacements, key=lambda kv: -len(kv[0])):
        expr = re.sub(rf"(?<![A-Za-z0-9_]){re.escape(tok)}(?![A-Za-z0-9_])", cell, expr)

    # 4) uppercase the known math functions for Excel
    for fn in _FUNC_OK:
        expr = re.sub(rf"\b{fn}\b", fn.upper(), expr, flags=re.IGNORECASE)
    expr = expr.replace("LOG10", "LOG10").replace("LN(", "LN(")
    return expr


def rhs_of(formula: str) -> str:
    """Return the right-hand side of 'lhs = rhs' (or the whole thing if no '=')."""
    if formula and "=" in formula:
        return formula.split("=", 1)[1].strip()
    return (formula or "").strip()


def lhs_symbol(formula: str) -> str:
    """Return the OUTPUT symbol a calc produces — the left-hand side of 'lhs = rhs',
    normalised to the bare identifier. Used to key within-tool chaining by IDENTITY
    (bug #19: chaining by numeric value grabbed the wrong producing cell when two
    calcs produced the same number, e.g. q_wall and q_roof both = 4920)."""
    if not formula or "=" not in formula:
        return ""
    lhs = formula.split("=", 1)[0].strip()
    m = re.match(r"[A-Za-z_][A-Za-z0-9_]*", lhs)
    return m.group(0) if m else ""


# ============================================================================
# TAB 1 — OVERVIEW (quality scorecard + headline metrics + provenance)
# ============================================================================
def tab_overview(wb: Workbook, state: dict, run_dir: str, sha: str) -> None:
    ws = wb.create_sheet("Overview")
    set_widths(ws, {"A": 30, "B": 16, "C": 14, "D": 60})
    run_name = os.path.basename(os.path.normpath(run_dir))
    row = title_row(
        ws, f"ForgeOS Review Workbook — {run_name}", 4,
        "Live Excel review surface. Yellow cells are editable inputs; green cells are "
        "live formulas that recompute downstream. See the '⚠ Checks' tab for invariants "
        "that go RED where the engine's numbers do not reconcile.",
    )

    # ---- provenance block ----
    sub_banner(ws, row, "Run provenance", 4)
    row += 1
    prov = [
        ("Run directory", run_name),
        ("Git short SHA", sha),
        ("State saved at", state.get("savedAt", "—")),
        ("Project id", state.get("projectId", "—")),
        ("Product class",
         (state.get("orchestratorContract") or {}).get("product_class", "—")),
    ]
    for label, val in prov:
        ws.cell(row, 1, label).font = FONT_SUB
        ws.cell(row, 2, str(val))
        row += 1
    row += 1

    # ---- quality scorecard ----
    sc = state.get("qualityScorecard") or load_json(
        os.path.join(run_dir, "quality-scorecard.json")
    )
    sub_banner(ws, row, "Quality scorecard", 4)
    row += 1
    if sc:
        floor = sc.get("floor")
        mean = sc.get("mean")
        all_pass = sc.get("allPass")
        # allPass may be absent -> derive from floor >= 8 (the ≥8-everywhere rule)
        if all_pass is None and floor is not None:
            all_pass = floor >= 8
        for label, val in [
            ("Floor (min section)", floor),
            ("Mean", mean),
            ("All sections ≥ 8 (allPass)", all_pass),
            ("Iteration", sc.get("iteration")),
        ]:
            ws.cell(row, 1, label).font = FONT_SUB
            c = ws.cell(row, 2, val if val is not None else "—")
            if label.startswith("Floor") and isinstance(floor, (int, float)):
                c.fill = FILL_PASS if floor >= 8 else FILL_FAIL
                c.font = FONT_PASS if floor >= 8 else FONT_FAIL
            if label.startswith("All sections") and isinstance(all_pass, bool):
                c.value = "PASS" if all_pass else "FAIL"
                c.fill = FILL_PASS if all_pass else FILL_FAIL
                c.font = FONT_PASS if all_pass else FONT_FAIL
            row += 1
        row += 1

        # per-section table
        header(ws, row, ["Section", "Score", "≥8?", "Defects"])
        row += 1
        for sec in sc.get("sections", []):
            name = sec.get("name", "")
            score = sec.get("score")
            defects = sec.get("defects") or []
            ws.cell(row, 1, name).border = BORDER
            cs = ws.cell(row, 2, score)
            cs.border = BORDER
            ok = isinstance(score, (int, float)) and score >= 8
            cp = ws.cell(row, 3, "PASS" if ok else "FAIL")
            cp.fill = FILL_PASS if ok else FILL_FAIL
            cp.font = FONT_PASS if ok else FONT_FAIL
            cp.border = BORDER
            cd = ws.cell(row, 4, "; ".join(str(d) for d in defects))
            cd.alignment = WRAP_TOP
            cd.border = BORDER
            row += 1
        row += 1
    else:
        ws.cell(row, 1, "No quality-scorecard found.").font = FONT_NOTE
        row += 2

    # ---- headline metrics ----
    km = state.get("keyMetrics") or {}
    sub_banner(ws, row, "Headline metrics", 4)
    row += 1
    header(ws, row, ["Metric", "Value", "Unit", "Notes / source"])
    row += 1

    def metric_row(m: dict) -> None:
        nonlocal row
        ws.cell(row, 1, m.get("label", "")).border = BORDER
        ws.cell(row, 2, m.get("value", "")).border = BORDER
        ws.cell(row, 3, m.get("unit", "")).border = BORDER
        n = ws.cell(row, 4, m.get("notes", m.get("source", "")))
        n.alignment = WRAP_TOP
        n.font = FONT_NOTE
        n.border = BORDER
        row += 1

    if isinstance(km, dict):
        if km.get("headline_output"):
            metric_row(km["headline_output"])
        if km.get("headline_constraint"):
            metric_row(km["headline_constraint"])
        for m in (km.get("supporting_metrics") or [])[:12]:
            metric_row(m)


# ============================================================================
# TAB 2 — "⚠ Checks"  (THE ERROR-SURFACING TAB — the point of the exercise)
# ============================================================================
def _render_lib_checks(ws: Worksheet, state: dict, run_dir: str, r: int,
                       data_r: int, data_col_a: str,
                       fail_labels: List[str]) -> Tuple[int, int, int]:
    """Render every deterministic_checks_lib.Check as a LIVE Excel row, grouped by
    family. Returns (next_row, next_data_row, fail_count).

    Layout per check (mirrors the existing `emit` so the whole tab stays live):
      * hidden data cells: K=actual-base (or per-unit), L=expected, M=count
      * visible: B=ACTUAL formula, C=EXPECTED ref, D=Δ, E=Tol, F=STATUS, G=detail
      * for >= / <= / tally relations the STATUS formula uses the right operator so
        editing a data cell re-decides PASS/FAIL on the correct comparison.
    """
    checks = dcl.run_all_checks(run_dir, state)
    fail_count = 0
    if not checks:
        return r, data_r, fail_count

    fam_titles = {
        "CONSISTENCY": "E1 · CONSISTENCY — per-unit×count, Σsub==line, rating==quantity",
        "ADEQUACY": "E2 · ADEQUACY — rating ≥ duty (motor, breaker, cable, vessel, chiller)",
        "BALANCE": "E3 · BALANCE — mass/energy/flow closures & continuity",
        "COST": "E4 · COST — per-line price band & Σ lines == cover total",
        "CONNECTIVITY": "E5 · CONNECTIVITY/SPEC — out-of-spec tally & velocity limit",
    }
    for fam in ("CONSISTENCY", "ADEQUACY", "BALANCE", "COST", "CONNECTIVITY"):
        fam_checks = [c for c in checks if c.category == fam]
        if not fam_checks:
            continue
        sub_banner(ws, r, fam_titles[fam], 7)
        r += 1
        for c in fam_checks:
            if c.actual is None or c.expected is None:
                continue  # N/A — nothing live to render
            data_r += 1
            # --- hidden editable data cells ---
            ws.cell(data_r, 10, c.name)
            if c.a_factors is not None:
                per_unit, count = c.a_factors
                ws.cell(data_r, 11, per_unit).fill = FILL_INPUT      # K = per-unit
                ws.cell(data_r, 13, count).fill = FILL_INPUT         # M = count
                actual_formula = f"=${data_col_a}${data_r}*$M${data_r}"
            else:
                ws.cell(data_r, 11, c.actual).fill = FILL_INPUT      # K = actual
                actual_formula = f"=${data_col_a}${data_r}"
            ws.cell(data_r, 12, c.expected).fill = FILL_INPUT        # L = expected

            # --- visible live row ---
            ws.cell(r, 1, c.name).border = BORDER
            ws.cell(r, 1).alignment = WRAP_TOP
            ws.cell(r, 2, actual_formula).border = BORDER
            ws.cell(r, 3, f"=$L${data_r}").border = BORDER
            ws.cell(r, 4, f"=B{r}-C{r}").border = BORDER
            ws.cell(r, 5, c.tol).border = BORDER
            # STATUS formula chosen by relation so the comparison stays correct live
            if c.relation == "ge":          # actual must be >= expected
                status_f = f'=IF(B{r}>=C{r}-E{r},"PASS","FAIL")'
            elif c.relation == "le":        # actual must be <= expected
                status_f = f'=IF(B{r}<=C{r}+E{r},"PASS","FAIL")'
            elif c.relation == "tally":     # actual count must be 0
                status_f = f'=IF(B{r}<=C{r},"PASS","FAIL")'
            else:                            # equality within tolerance
                status_f = f'=IF(ABS(D{r})<E{r},"PASS","FAIL")'
            cs = ws.cell(r, 6, status_f)
            cs.border = BORDER
            cs.font = Font(bold=True)
            cdet = ws.cell(r, 7, c.detail)
            cdet.alignment = WRAP_TOP
            cdet.font = FONT_NOTE
            cdet.border = BORDER

            # pre-evaluate now so we can colour + count FAILs (and so the CLI and
            # the tab agree before Excel recomputes on open)
            if c.status == dcl.FAIL:
                fail_count += 1
                fail_labels.append(f"[{fam}] {c.name}")
                for col in range(1, 8):
                    cc = ws.cell(r, col)
                    cc.fill = FILL_FAIL
            r += 1
        r += 1  # spacer between families
    return r, data_r, fail_count


def tab_checks(wb: Workbook, state: dict, run_dir: str) -> int:
    """
    Live-formula invariants. Each row:
        label | ACTUAL (live =formula over cells) | EXPECTED | Δ (=ACTUAL-EXPECTED)
              | TOL | STATUS (=IF(ABS(Δ)<TOL,"PASS","FAIL"))
    Returns the number of FAIL rows (for the final report).

    Coverage (all data-driven, no per-class hardcoding):
      A. per-unit × count == contract total flows  (recirc / degasser / drum-filter)
      B. Σ module BoM sub-totals == cover / grand total (requirementsBom)
      C. emitter-rendered principal values == the contract quantity
      D. any mass/energy/flow balance closure present in the contract
    The numbers feeding these checks live in a hidden DATA block to the right so
    the visible ACTUAL/EXPECTED columns are genuine cell references (live).
    """
    ws = wb.create_sheet("⚠ Checks")
    set_widths(ws, {"A": 46, "B": 16, "C": 16, "D": 14, "E": 10, "F": 12, "G": 52})
    title_row(
        ws, "⚠ Computational checks — live invariants", 7,
        "ACTUAL and Δ are LIVE Excel formulas over the data cells (cols J+). Edit a "
        "data cell and STATUS recomputes. RED = the engine's numbers do not reconcile.",
    )
    hdr = 4
    header(ws, hdr, ["Check", "ACTUAL", "EXPECTED", "Δ (actual-exp)",
                     "Tol", "STATUS", "Detail / why"])
    r = hdr + 1

    oc = state.get("orchestratorContract") or {}
    quantities: Dict[str, Any] = oc.get("quantities") or {}
    bom: List[dict] = state.get("requirementsBom") or []

    # Hidden data columns: J (label), K (a-value), L (b-value/expected)
    DATA_COL_LABEL, DATA_COL_A, DATA_COL_B = "J", "K", "L"
    data_r = hdr  # parallel pointer into the data block
    ws.cell(hdr, 10, "DATA (live inputs — editable)").font = FONT_SUB

    fail_count = 0
    fail_labels: List[str] = []

    # ---- E. the SHARED deterministic check suite (rendered live first) --------
    # Every check from deterministic_checks_lib — the SAME arithmetic the standalone
    # CLI runs — rendered as live Excel rows. ACTUAL/EXPECTED/Δ/STATUS are formulas
    # over editable yellow data cells; per-unit×count checks make the product live.
    # This is the canonical universal suite; sections A–D below add RAS-flavoured
    # cross-surface detail on top.
    r, data_r, fc = _render_lib_checks(
        ws, state, run_dir, r, data_r, DATA_COL_A, fail_labels)
    fail_count += fc

    def emit(label: str, a_val: Optional[float], expected: Optional[float],
             tol: float, detail: str,
             a_is_product: Optional[Tuple[float, float]] = None) -> None:
        """
        Write one check row with LIVE formulas.
          a_is_product=(per_unit, count) -> ACTUAL becomes '=K* * count' so the
            per-unit × count relationship is itself live and editable.
          else ACTUAL just references the A data cell.
        EXPECTED references the B data cell. Δ and STATUS are live over those.
        """
        nonlocal r, data_r, fail_count
        if a_val is None or expected is None:
            return
        data_r += 1
        # write the editable data values
        ws.cell(data_r, 10, label)
        if a_is_product is not None:
            per_unit, count = a_is_product
            ws.cell(data_r, 11, per_unit).fill = FILL_INPUT       # K = per-unit
            ws.cell(data_r, 13, count).fill = FILL_INPUT          # M = count
            actual_formula = f"=${DATA_COL_A}${data_r}*$M${data_r}"
        else:
            ws.cell(data_r, 11, a_val).fill = FILL_INPUT
            actual_formula = f"=${DATA_COL_A}${data_r}"
        ws.cell(data_r, 12, expected).fill = FILL_INPUT          # L = expected

        # visible row
        ws.cell(r, 1, label).border = BORDER
        ws.cell(r, 1).alignment = WRAP_TOP
        ca = ws.cell(r, 2, actual_formula)
        ca.border = BORDER
        ce = ws.cell(r, 3, f"=$L${data_r}")
        ce.border = BORDER
        cd = ws.cell(r, 4, f"=B{r}-C{r}")
        cd.border = BORDER
        ct = ws.cell(r, 5, tol)
        ct.border = BORDER
        cs = ws.cell(r, 6, f'=IF(ABS(D{r})<E{r},"PASS","FAIL")')
        cs.border = BORDER
        cs.font = Font(bold=True)
        cdet = ws.cell(r, 7, detail)
        cdet.alignment = WRAP_TOP
        cdet.font = FONT_NOTE
        cdet.border = BORDER

        # static pre-evaluation so we can colour + count FAILs now (formulas lib
        # re-verifies on validation; conditional formatting also colours on open)
        actual_now = (a_is_product[0] * a_is_product[1]) if a_is_product else a_val
        is_fail = abs(actual_now - expected) >= tol
        if is_fail:
            fail_count += 1
            fail_labels.append(f"{label} (Δ={actual_now - expected:g})")
        r += 1

    # ---- A. per-unit × count == total (the headline error class) ----
    sub_banner(ws, r, "A · Per-unit × count must equal the contract loop total", 7)
    r += 1

    total_flow = qval(quantities, "recirculation_flow_m3_h")
    flow_unit = qunit(quantities, "recirculation_flow_m3_h") or "m³/h"

    # Discover every '<x>_count' quantity and pair it with the matching per-unit flow.
    # Universal rule: count of N parallel trains splitting the recirculation loop
    # implies per_unit = total / N. We surface BOTH the engine's own per-unit
    # quantity (if present) AND any divergent per-unit value found on other surfaces.
    count_keys = [k for k in quantities if k.endswith("_count")]
    PERUNIT_HINTS = {
        "recirc_pump_count": ["recirc_pump_flow_m3_h", "per_pump_flow_m3_h"],
        "degasser_count": ["degasser_water_flow_m3_h", "degasser_flow_m3_h"],
        "drum_filter_count": ["drum_filter_throughput_m3_h", "drum_filter_flow_m3_h"],
    }
    for ck in count_keys:
        cnt = qval(quantities, ck)
        if not cnt or total_flow is None:
            continue
        base = ck[:-6]  # strip '_count'
        # engine's stated per-unit flow, if any
        per_unit = None
        for hint in PERUNIT_HINTS.get(ck, []):
            per_unit = qval(quantities, hint)
            if per_unit is not None:
                break
        if per_unit is None:
            # fall back to the implied even split (this is the engine's intent)
            per_unit = total_flow / cnt
        emit(
            f"{base.replace('_', ' ')}: per-unit flow × {ck} = recirculation_flow",
            per_unit * cnt, total_flow, tol=1.0,
            detail=(f"{per_unit:g} {flow_unit} × {cnt:g} units must equal the "
                    f"{total_flow:g} {flow_unit} loop total."),
            a_is_product=(per_unit, cnt),
        )

    # Cross-surface per-unit flow values that appear in the BoM but use a DIFFERENT
    # count basis than the parallel-train count -> the classic mismatch (e.g. a
    # per-TANK inlet flow of 1336 m³/h that, multiplied by the 8 pump/degasser
    # TRAINS, gives 10688 ≠ the 13360 m³/h loop). We scan BoM requirement strings
    # for '<N> m³/h' tokens, keep only values that PLAUSIBLY represent one share of
    # the recirculation loop (band: a value strictly between the even per-train
    # split and the whole loop), and test each against the train count.
    #
    # Band rationale (keeps the noise out without any per-class hardcoding):
    #   * exclude >= loop total      -> air flows / aggregates (16700, 100200 m³/h)
    #   * exclude <= total / Nmax    -> backwash trims / sub-flows (53 m³/h)
    #   * a per-unit flow legitimately splitting the loop equals total/N for the
    #     SAME N as its unit count; if it instead matches total/(some other count)
    #     it will NOT reconcile against the train count -> we surface it RED.
    train_count = qval(quantities, "recirc_pump_count") or qval(quantities, "degasser_count")
    max_count = max([c for c in
                     (qval(quantities, k) for k in count_keys) if c] or [1.0])
    seen_flow_tokens: Dict[float, str] = {}
    for row_bom in bom:
        req = str(row_bom.get("requirement", ""))
        for m in re.finditer(r"(\d[\d,]*(?:\.\d+)?)\s*m³/h", req):
            fv = num(m.group(1))
            if fv is None or fv <= 0 or total_flow is None:
                continue
            # must look like ONE share of the loop: below the loop total but above
            # the finest even split (total / largest unit count).
            if fv >= total_flow - 1:
                continue
            if fv <= (total_flow / max_count) - 1:
                continue
            seen_flow_tokens.setdefault(fv, req[:80])
    if train_count and total_flow:
        implied = total_flow / train_count  # the value that WOULD reconcile
        for fv, ctx in sorted(seen_flow_tokens.items()):
            if abs(fv - implied) < 1:
                continue  # this one already splits the loop evenly across trains (A)
            k = total_flow / fv  # the count basis this per-unit value implies
            emit(
                f"BoM per-unit flow {fv:g} m³/h × train count {train_count:g}",
                fv * train_count, total_flow, tol=1.0,
                detail=(f"A '{fv:g} m³/h' per-unit flow appears in the BoM "
                        f"(\"{ctx}…\"). It implies a count basis of ÷{k:.3g} "
                        f"(≈{int(round(k))} units) but the parallel-train count is "
                        f"{train_count:g}; {fv:g} × {train_count:g} = "
                        f"{fv*train_count:g} ≠ the {total_flow:g} m³/h loop. RED = "
                        f"this surface uses a per-TANK basis (÷{int(round(k))}) while "
                        f"the pump/degasser trains are ÷{int(train_count)}."),
                a_is_product=(fv, train_count),
            )

    # ---- B. Σ module BoM sub-totals == grand/cover total ----
    sub_banner(ws, r, "B · Σ BoM line totals must equal the cover / grand total", 7)
    r += 1
    bom_line_sum = sum(num(rw.get("line_gbp")) or 0.0 for rw in bom)
    # cover total: prefer parts-ledger grand_total, else costBasis rollup installed
    pl = load_json(os.path.join(run_dir, "parts-ledger.json")) or {}
    cover_total = num(pl.get("grand_total_gbp"))
    cover_src = "parts-ledger.grand_total_gbp"
    if cover_total is None:
        roll = (state.get("costBasis") or {}).get("rollup") or {}
        cover_total = num(roll.get("purchased_gbp"))
        cover_src = "costBasis.rollup.purchased_gbp"
    if bom_line_sum and cover_total is not None:
        # tolerance: BoM (equipment+actuators+instruments) vs ledger grand total can
        # legitimately differ in scope, so use a 1% band and explain.
        tol = max(1.0, 0.01 * cover_total)
        emit(
            "Σ requirementsBom.line_gbp == cover grand total",
            bom_line_sum, cover_total, tol=tol,
            detail=(f"Sum of {len(bom)} BoM line_gbp values vs {cover_src}. "
                    f"Δ within 1% tolerance passes (scope differences expected)."),
        )

    # ---- C. emitter-rendered principal values == contract quantity ----
    sub_banner(ws, r, "C · Emitter-rendered principal values must match the contract", 7)
    r += 1
    # The pump-sizing worked calc renders hydraulic/motor power for the *whole loop*
    # flow; the contract carries a per-pump figure. Surface the divergence so the
    # reviewer sees the emitter and the contract disagree on basis.
    pump_calcs = _tool_worked(state, "process:pump-sizing")
    rendered_hyd_w = _calc_result(pump_calcs, "hydraulic power")
    contract_hyd_w = qval(quantities, "recirc_pump_hydraulic_power_w")
    if rendered_hyd_w is not None and contract_hyd_w is not None:
        emit(
            "Pump hydraulic power: worked-calc render vs contract quantity",
            rendered_hyd_w, contract_hyd_w, tol=max(1.0, 0.05 * contract_hyd_w),
            detail=(f"Worked-calc renders {rendered_hyd_w:g} W (computed on the FULL "
                    f"{total_flow:g} m³/h loop) but the contract quantity "
                    f"recirc_pump_hydraulic_power_w is {contract_hyd_w:g} W (per-pump). "
                    f"RED = emitter and contract disagree on the per-unit basis."),
        )
    rendered_motor_w = _calc_result(pump_calcs, "motor input power")
    contract_motor_kw = qval(quantities, "recirc_pump_motor_kw")
    if rendered_motor_w is not None and contract_motor_kw is not None:
        emit(
            "Pump motor power: worked-calc render (kW) vs contract recirc_pump_motor_kw",
            rendered_motor_w / 1000.0, contract_motor_kw,
            tol=max(0.5, 0.05 * contract_motor_kw),
            detail=(f"Worked-calc motor input {rendered_motor_w/1000:g} kW vs contract "
                    f"recirc_pump_motor_kw {contract_motor_kw:g} kW. Divergence here is "
                    f"the same full-loop-vs-per-pump basis issue."),
        )

    # ---- D. engine's own balance closures ----
    sub_banner(ws, r, "D · Engine-declared balance closures (mass / energy / flow)", 7)
    r += 1
    for cl in (oc.get("closures") or []):
        measured = num(cl.get("measured"))
        required = cl.get("required", "")
        status = str(cl.get("status", "")).lower()
        # Many closures state 'required' as prose; where we can extract a target
        # number we make it a live check, otherwise we surface the engine's own
        # pass/warn verdict as a static status row.
        target = _extract_target_number(required, measured)
        if measured is not None and target is not None and abs(target) > 0:
            emit(
                f"closure · {cl.get('invariant_id', '')}",
                measured, target, tol=max(1.0, 0.02 * abs(target)),
                detail=str(cl.get("reason", required))[:240],
            )
        else:
            # static status row (no parseable target) — show engine verdict
            ws.cell(r, 1, f"closure · {cl.get('invariant_id', '')}").border = BORDER
            ws.cell(r, 1).alignment = WRAP_TOP
            ws.cell(r, 2, measured if measured is not None else "—").border = BORDER
            ws.cell(r, 3, "(prose target)").border = BORDER
            ws.cell(r, 4, "—").border = BORDER
            ws.cell(r, 5, "—").border = BORDER
            verdict = "PASS" if status == "pass" else ("FAIL" if status in ("fail", "error") else "WARN")
            cs = ws.cell(r, 6, verdict)
            cs.fill = FILL_PASS if verdict == "PASS" else (FILL_FAIL if verdict == "FAIL" else FILL_CONST)
            cs.font = FONT_PASS if verdict == "PASS" else (FONT_FAIL if verdict == "FAIL" else Font(bold=True))
            cs.border = BORDER
            det = ws.cell(r, 7, str(cl.get("reason", required))[:240])
            det.alignment = WRAP_TOP
            det.font = FONT_NOTE
            det.border = BORDER
            if verdict == "FAIL":
                fail_count += 1
                fail_labels.append(f"closure {cl.get('invariant_id','')}")
            r += 1

    # conditional formatting so STATUS cells colour live on open / recompute
    from openpyxl.formatting.rule import CellIsRule
    status_range = f"F{hdr+1}:F{r-1}"
    ws.conditional_formatting.add(
        status_range,
        CellIsRule(operator="equal", formula=['"FAIL"'], fill=FILL_FAIL, font=FONT_FAIL),
    )
    ws.conditional_formatting.add(
        status_range,
        CellIsRule(operator="equal", formula=['"PASS"'], fill=FILL_PASS, font=FONT_PASS),
    )
    ws.cell(2, 1)  # keep title intact
    ws.freeze_panes = "A5"

    # stash the fail summary on the object for the caller's report
    ws._forge_fail_count = fail_count       # type: ignore[attr-defined]
    ws._forge_fail_labels = fail_labels     # type: ignore[attr-defined]
    return fail_count


def _tool_worked(state: dict, tool_id: str) -> List[dict]:
    for t in (state.get("toolsUsedPage") or {}).get("tools", []):
        if t.get("tool_id") == tool_id:
            return t.get("worked") or []
    return []


def _calc_result(worked: List[dict], label_substr: str) -> Optional[float]:
    for w in worked:
        if label_substr.lower() in str(w.get("label", "")).lower():
            res = w.get("result")
            return num(res.get("value") if isinstance(res, dict) else res)
    return None


_INEQUALITY_PROSE = re.compile(
    r"≤|≥|<=|>=|<|>|ceiling|limit|within|at most|at least|no more than|"
    r"max(?:imum)?|min(?:imum)?|under|below|above|not exceed|cap\b",
    re.IGNORECASE,
)


def _extract_target_number(required: str, measured: Optional[float]) -> Optional[float]:
    """
    Best-effort numeric EQUALITY target out of a closure's 'required' prose. We only
    return a number when the closure asserts an equality we can resolve, e.g.
    '4 turnovers/h × 3340 m³ tank volume' -> 13360.

    Returns None (so the row renders as a STATUS row showing the engine's own
    pass/warn) when the prose is a one-sided INEQUALITY — e.g. 'design capex ≤ £5.0 M
    ceiling' or 'media ≥ TAN load'. An inequality is NOT an equality target: turning
    '≤ £5.0 M' into 'expected = 5.0 M' would fabricate a hard FAIL where the engine
    itself only warns. Such closures keep their declared status verbatim.
    """
    if not required:
        return None
    if _INEQUALITY_PROSE.search(required):
        return None  # one-sided constraint -> show the engine's verdict, not an equality
    s = required.replace(",", "")
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", s)]
    # 'A × B' product of the two leading numbers (an equality decomposition)
    if "×" in required or " x " in required.lower():
        if len(nums) >= 2:
            return nums[0] * nums[1]
    # a single explicit equality target close to measured
    if len(nums) == 1 and measured is not None:
        return nums[0]
    return None


# ============================================================================
# TAB 3 — QUANTITIES (orchestratorContract.quantities)
# ============================================================================
def tab_quantities(wb: Workbook, state: dict) -> None:
    ws = wb.create_sheet("Quantities")
    set_widths(ws, {"A": 34, "B": 16, "C": 12, "D": 16, "E": 12, "F": 12, "G": 62})
    title_row(ws, "Contract quantities", 7,
              "orchestratorContract.quantities — the engine's sized values.")
    header(ws, 4, ["Name", "Value", "Unit", "Family", "Basis", "Source", "Source detail"])
    quantities = (state.get("orchestratorContract") or {}).get("quantities") or {}
    r = 5
    for name in quantities:
        v = quantities[name]
        if isinstance(v, dict):
            value, unit = v.get("value"), v.get("unit", "")
            family, basis = v.get("family", ""), v.get("basis", "")
            source, detail = v.get("source", ""), v.get("source_detail", "")
        else:
            value, unit, family, basis, source, detail = v, "", "", "", "", ""
        ws.cell(r, 1, name).border = BORDER
        ws.cell(r, 2, value).border = BORDER
        ws.cell(r, 3, unit).border = BORDER
        ws.cell(r, 4, family).border = BORDER
        ws.cell(r, 5, basis).border = BORDER
        ws.cell(r, 6, source).border = BORDER
        cd = ws.cell(r, 7, detail)
        cd.alignment = WRAP_TOP
        cd.font = FONT_NOTE
        cd.border = BORDER
        r += 1
    ws.freeze_panes = "A5"


# ============================================================================
# TAB 4 — CALCULATIONS (worked-calcs grouped by tool; live where structured)
# ============================================================================
def tab_calculations(wb: Workbook, state: dict) -> Tuple[int, int]:
    """
    Returns (live_calc_count, static_calc_count).

    Layout per STRUCTURED calc:
      * each input symbol -> a labelled YELLOW cell (editable)
      * the formula -> a LIVE Excel formula referencing those cells (green)
      * within a tool, if an input's value equals a prior result's value, the
        input cell REFERENCES the producing result cell (chained, not duplicated)
      * the live result sits next to the engine's stored result + a Δ
    LEGACY calcs (no inputs[]) render as static text (formula + substitution +
    result), clearly marked "static — no input map".
    Shared constants (rho, g, pi, ...) live in a constants block at the top and
    are referenced by absolute address.
    """
    ws = wb.create_sheet("Calculations")
    set_widths(ws, {"A": 30, "B": 18, "C": 12, "D": 46, "E": 16, "F": 12, "G": 10, "H": 40})
    title_row(
        ws, "Worked calculations — live where structured", 8,
        "Yellow = editable input. Green col B = LIVE formula. 'Engine value' = the "
        "value the engine stored; Δ should be ~0 (inputs are display-rounded to 4 s.f.). "
        "Legacy calcs (no input map) are shown as static text.",
    )
    r = 4

    # ---- shared constants block ----
    CONSTANTS = {
        "rho": (1025.0, "kg/m³", "seawater density"),
        "rho_air": (1.2, "kg/m³", "air density"),
        "g": (9.8066, "m/s²", "gravity"),
        "pi": (3.141592653589793, "-", "pi (use PI() in formulas)"),
        "mu": (0.001, "Pa·s", "dynamic viscosity (water)"),
    }
    sub_banner(ws, r, "Shared constants (referenced by formulas below)", 8)
    r += 1
    header(ws, r, ["Constant", "Value", "Unit", "Note"])
    r += 1
    const_cell: Dict[str, str] = {}
    for sym, (val, unit, note) in CONSTANTS.items():
        ws.cell(r, 1, sym).font = FONT_MONO
        cc = ws.cell(r, 2, val)
        cc.fill = FILL_CONST
        const_cell[sym] = f"$B${r}"  # absolute ref so it survives anywhere
        ws.cell(r, 3, unit)
        ws.cell(r, 4, note).font = FONT_NOTE
        r += 1
    r += 1

    tools = (state.get("toolsUsedPage") or {}).get("tools", [])
    live_count = 0
    static_count = 0

    for tool in tools:
        worked = tool.get("worked") or []
        if not worked:
            continue
        tname = tool.get("tool_name") or tool.get("tool_id") or "tool"
        tid = tool.get("tool_id", "")
        sub_banner(ws, r, f"{tname}   ·   {tid}", 8)
        r += 1
        header(ws, r, ["Calc / input", "Value (live)", "Unit",
                       "Formula (text)", "Engine value", "Δ", "Unit", "Assumptions"])
        r += 1

        # produced[output_symbol] -> (producing result cell, its value), for
        # within-tool chaining. BUG #19 FIX: key by the producing calc's OUTPUT
        # SYMBOL (formula LHS), not by numeric value — two calcs producing the same
        # number (q_wall and q_roof both 4920) must not collapse to one cell, and a
        # later input must chain to the result with the MATCHING symbol+label, not
        # whichever happened to register last at that value.
        produced: Dict[str, Tuple[str, float]] = {}

        for w in worked:
            label = w.get("label", "")
            formula = w.get("formula", "")
            inputs = w.get("inputs") or []
            res = w.get("result")
            res_val = res.get("value") if isinstance(res, dict) else res
            res_unit = (res.get("unit") if isinstance(res, dict) else w.get("result_unit", "")) or ""

            structured = bool(inputs)

            # ---- calc title row ----
            tc = ws.cell(r, 1, label)
            tc.font = FONT_SUB
            ws.cell(r, 4, formula).font = FONT_MONO
            if not structured:
                ws.cell(r, 1, label + "  [static — no input map]").font = Font(bold=True, italic=True, color="7F7F7F")
            calc_title_row = r
            r += 1

            if not structured:
                # LEGACY: formula + substitution + result as static text
                static_count += 1
                ws.cell(r, 1, "formula").font = FONT_NOTE
                ws.cell(r, 4, str(formula)).font = FONT_MONO
                ws.cell(r, 4).fill = FILL_LEGACY
                r += 1
                ws.cell(r, 1, "substitution").font = FONT_NOTE
                sc = ws.cell(r, 4, str(w.get("substitution", "")))
                sc.font = FONT_MONO
                sc.fill = FILL_LEGACY
                r += 1
                ws.cell(r, 1, "result").font = FONT_NOTE
                ws.cell(r, 5, res_val)
                ws.cell(r, 7, res_unit)
                r += 1
                r += 1  # spacer
                continue

            # ---- STRUCTURED: lay each input as a labelled yellow cell ----
            symbol_cell: Dict[str, str] = {}
            for inp in inputs:
                sym = inp.get("symbol", "")
                ival = num(inp.get("value"))
                iunit = inp.get("unit", "") or ""
                ws.cell(r, 1, f"  {sym}").font = FONT_MONO
                cell = ws.cell(r, 2)
                # chain by IDENTITY (bug #19): reference a prior result ONLY when
                # this input's SYMBOL matches that result's producing output symbol
                # AND the values agree. Symbol-keying means q_wall and q_roof (both
                # 4920) each chain to their OWN producing cell, never the other's.
                ref = None
                if sym and sym in produced:
                    pcell, pval = produced[sym]
                    if ival is None or abs(pval - ival) <= max(1e-9, abs(pval) * 1e-6):
                        ref = pcell
                # also reference a shared constant if the symbol is one
                if ref is None and sym in const_cell and ival is not None:
                    cval = CONSTANTS[sym][0]
                    if abs(cval - ival) <= max(1e-9, abs(cval) * 1e-4):
                        ref = const_cell[sym]
                if ref is not None:
                    cell.value = f"={ref}"
                    cell.fill = FILL_RESULT  # chained / constant -> not a free input
                    ws.cell(r, 8, f"↳ chained from {ref}").font = FONT_NOTE
                else:
                    cell.value = ival
                    cell.fill = FILL_INPUT   # free editable input
                symbol_cell[sym] = cell.coordinate
                ws.cell(r, 3, iunit)
                r += 1

            # ---- live result row ----
            rhs = rhs_of(formula)
            excel = formula_to_excel(rhs, symbol_cell)
            ws.cell(r, 1, "  = result").font = FONT_SUB
            live_cell = ws.cell(r, 2)
            if excel is not None:
                live_cell.value = "=" + excel
                live_cell.fill = FILL_RESULT
                live_count += 1
                produced_ok = True
            else:
                # could not bind every symbol -> show engine value, mark static
                live_cell.value = res_val
                ws.cell(r, 1, "  = result  [static — unbound symbol]").font = Font(bold=True, italic=True, color="7F7F7F")
                static_count += 1
                live_count -= 0
                produced_ok = False
            ws.cell(r, 3, res_unit)
            ws.cell(r, 4, rhs).font = FONT_MONO
            # engine's stored value + delta
            ws.cell(r, 5, res_val)
            if isinstance(res_val, (int, float)):
                # Δ = live - engine ; if live is a formula, reference it
                ws.cell(r, 6, f"=B{r}-E{r}")
            ws.cell(r, 7, res_unit)
            for a in (w.get("assumptions") or [])[:1]:
                ac = ws.cell(r, 8, str(a))
                ac.font = FONT_NOTE
                ac.alignment = WRAP_TOP

            # register this result under its OUTPUT SYMBOL so later inputs chain by
            # symbol+label identity (bug #19), not by a numeric-value collision.
            out_sym = lhs_symbol(formula)
            if out_sym and isinstance(res_val, (int, float)):
                produced[out_sym] = (f"$B${r}", float(res_val))
            r += 2  # spacer between calcs

        r += 1  # spacer between tools

    ws.freeze_panes = "A4"
    return live_count, static_count


# ============================================================================
# TAB 5 — BoM (requirementsBom + coverage_by_drawing + Σ check)
# ============================================================================
def tab_bom(wb: Workbook, state: dict, run_dir: str) -> None:
    ws = wb.create_sheet("BoM")
    set_widths(ws, {"A": 12, "B": 50, "C": 8, "D": 28, "E": 8, "F": 12, "G": 12, "H": 50})
    title_row(ws, "Bill of materials", 8,
              "requirementsBom — every line. Σ line_gbp is a LIVE total at the foot.")
    header(ws, 4, ["Tag", "Requirement", "Qty", "Part", "Status",
                   "Unit £", "Line £", "Basis"])
    bom = state.get("requirementsBom") or []
    r = 5
    first_line_row = r
    for row in bom:
        ws.cell(r, 1, row.get("tag", "")).border = BORDER
        rq = ws.cell(r, 2, row.get("requirement", ""))
        rq.alignment = WRAP_TOP
        rq.border = BORDER
        ws.cell(r, 3, row.get("qty")).border = BORDER
        ws.cell(r, 4, row.get("part", "")).border = BORDER
        ws.cell(r, 5, row.get("status", "")).border = BORDER
        ws.cell(r, 6, num(row.get("unit_gbp"))).border = BORDER
        ws.cell(r, 7, num(row.get("line_gbp"))).border = BORDER
        bs = ws.cell(r, 8, row.get("basis", ""))
        bs.alignment = WRAP_TOP
        bs.font = FONT_NOTE
        bs.border = BORDER
        r += 1
    last_line_row = r - 1

    # LIVE Σ of line £
    ws.cell(r, 1, "Σ TOTAL").font = FONT_SUB
    tot = ws.cell(r, 7, f"=SUM(G{first_line_row}:G{last_line_row})")
    tot.font = Font(bold=True)
    tot.fill = FILL_RESULT
    sum_row = r
    r += 2

    # coverage_by_drawing from parts-ledger.json
    pl = load_json(os.path.join(run_dir, "parts-ledger.json")) or {}
    cov = pl.get("coverage_by_drawing") or {}
    if cov:
        sub_banner(ws, r, "Coverage by drawing (parts-ledger.json)", 8)
        r += 1
        header(ws, r, ["Drawing", "Expected", "Present", "% present", "", "", "", ""])
        r += 1
        for dname, c in cov.items():
            ws.cell(r, 1, dname).border = BORDER
            ws.cell(r, 2, c.get("expected")).border = BORDER
            ws.cell(r, 3, c.get("present")).border = BORDER
            pc = ws.cell(r, 4, c.get("pct"))
            pc.border = BORDER
            if isinstance(c.get("pct"), (int, float)):
                pc.fill = FILL_PASS if c["pct"] >= 90 else (FILL_CONST if c["pct"] >= 70 else FILL_FAIL)
            r += 1
        r += 1

    # grand-total reconciliation note
    grand = num(pl.get("grand_total_gbp"))
    if grand is not None:
        ws.cell(r, 1, "parts-ledger grand_total_gbp").font = FONT_SUB
        ws.cell(r, 7, grand)
        ws.cell(r, 8, f"Compare against the LIVE Σ line £ at row {sum_row}. "
                      f"See the ⚠ Checks tab for the reconciliation row.").font = FONT_NOTE
    ws.freeze_panes = "A5"


# ============================================================================
# TAB 6 — COST (costBasis.lines + rollup)
# ============================================================================
def tab_cost(wb: Workbook, state: dict) -> bool:
    cb = state.get("costBasis")
    if not cb or not isinstance(cb, dict) or not cb.get("lines"):
        return False
    ws = wb.create_sheet("Cost")
    set_widths(ws, {"A": 30, "B": 28, "C": 14, "D": 12, "E": 22, "F": 22, "G": 14, "H": 50})
    title_row(ws, "Cost basis", 8,
              "costBasis.lines — per-word cost build-up with method, inputs and factors.")
    # rollup band
    roll = cb.get("rollup") or {}
    if roll:
        sub_banner(ws, 4, "Rollup", 8)
        rr = 5
        for k, v in roll.items():
            ws.cell(rr, 1, k).font = FONT_SUB
            ws.cell(rr, 2, v)
            rr += 1
        start = rr + 1
    else:
        start = 4
    header(ws, start, ["Label", "Module", "Cost £", "Defensible",
                       "Method", "Inputs", "Est class", "Notes"])
    r = start + 1
    first = r
    for ln in cb["lines"]:
        basis = ln.get("basis") or {}
        ws.cell(r, 1, ln.get("label", "")).border = BORDER
        ws.cell(r, 2, ln.get("module", "")).border = BORDER
        ws.cell(r, 3, num(ln.get("cost_gbp"))).border = BORDER
        ws.cell(r, 4, "yes" if ln.get("defensible") else "no").border = BORDER
        ws.cell(r, 5, basis.get("method", "")).border = BORDER
        inp = basis.get("inputs")
        ws.cell(r, 6, ", ".join(map(str, inp)) if isinstance(inp, list) else str(inp or "")).border = BORDER
        ws.cell(r, 7, basis.get("estimate_class", "")).border = BORDER
        nt = ws.cell(r, 8, basis.get("notes", ""))
        nt.alignment = WRAP_TOP
        nt.font = FONT_NOTE
        nt.border = BORDER
        r += 1
    # live Σ
    ws.cell(r, 1, "Σ cost_gbp (live)").font = FONT_SUB
    ts = ws.cell(r, 3, f"=SUM(C{first}:C{r-1})")
    ts.font = Font(bold=True)
    ts.fill = FILL_RESULT
    ws.freeze_panes = f"A{start+1}"
    return True


# ============================================================================
# IMAGE TABS
# ============================================================================
def ensure_png(src_path: str, run_dir: str) -> Optional[str]:
    """
    Return a PNG path for an image reference. If only an SVG exists, convert it to
    PNG (cairosvg preferred, then rsvg-convert). Returns None if nothing usable.
    """
    if src_path.lower().endswith(".png") and os.path.exists(src_path):
        return src_path
    # if given a .svg, try png sibling first
    base, ext = os.path.splitext(src_path)
    png_sib = base + ".png"
    if os.path.exists(png_sib):
        return png_sib
    if ext.lower() == ".svg" and os.path.exists(src_path):
        out_png = os.path.join(run_dir, ".excel-tmp",
                               os.path.basename(base) + ".png")
        os.makedirs(os.path.dirname(out_png), exist_ok=True)
        # try cairosvg
        try:
            import cairosvg  # noqa: WPS433
            cairosvg.svg2png(url=src_path, write_to=out_png, output_width=1600)
            return out_png
        except Exception:  # noqa: BLE001
            pass
        # try rsvg-convert
        try:
            subprocess.run(["rsvg-convert", "-w", "1600", "-o", out_png, src_path],
                           check=True, capture_output=True, timeout=60)
            if os.path.exists(out_png):
                return out_png
        except Exception:  # noqa: BLE001
            pass
    return None


def downscale_png(src_png: str, run_dir: str, max_px: int = 1400) -> str:
    """
    Downscale a PNG so the whole workbook stays small (module renders are ~4 MB).
    Returns a path to the (possibly) downscaled PNG. Keeps aspect ratio. JPEG-quality
    PNG compression via Pillow optimisation.
    """
    try:
        from PIL import Image
    except Exception:  # noqa: BLE001
        return src_png
    try:
        with Image.open(src_png) as im:
            im = im.convert("RGB") if im.mode in ("RGBA", "P") else im
            w, h = im.size
            scale = min(1.0, max_px / float(max(w, h)))
            if scale < 1.0:
                im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))))
            out_dir = os.path.join(run_dir, ".excel-tmp")
            os.makedirs(out_dir, exist_ok=True)
            out = os.path.join(out_dir, "ds_" + os.path.basename(src_png))
            # save as compressed JPEG inside a .png-ext wrapper would confuse openpyxl;
            # keep PNG but optimise.
            im.save(out, format="PNG", optimize=True)
            return out
    except Exception as exc:  # noqa: BLE001
        print(f"    ! downscale failed for {src_png}: {exc}")
        return src_png


_SHEET_BAD = re.compile(r"[:\\/?*\[\]]")


def safe_sheet_title(name: str, used: set) -> str:
    t = _SHEET_BAD.sub("-", name)[:31].strip() or "sheet"
    base = t
    i = 2
    while t.lower() in used:
        suffix = f"-{i}"
        t = (base[: 31 - len(suffix)] + suffix)
        i += 1
    used.add(t.lower())
    return t


def add_image_tab(wb: Workbook, run_dir: str, png_path: str, title: str,
                  caption: str, used_titles: set) -> bool:
    from openpyxl.drawing.image import Image as XLImage
    ds = downscale_png(png_path, run_dir)
    try:
        sheet_title = safe_sheet_title(title, used_titles)
        ws = wb.create_sheet(sheet_title)
        ws.cell(1, 1, title).font = Font(size=14, bold=True, color="1F3A5F")
        cap = ws.cell(2, 1, caption)
        cap.font = FONT_NOTE
        cap.alignment = LEFT_TOP
        img = XLImage(ds)
        # cap on-sheet display size (keep aspect) so the tab is readable
        max_w = 1100
        if img.width and img.width > max_w:
            ratio = max_w / float(img.width)
            img.width = int(img.width * ratio)
            img.height = int(img.height * ratio)
        ws.add_image(img, "A4")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"    ! could not embed {png_path}: {exc}")
        return False


def collect_image_specs(run_dir: str) -> List[Tuple[str, str, str]]:
    """
    Return ordered list of (file_path, tab_title, caption). UNIVERSAL discovery:
      1. Blender hero (00-hero.png or blender-cover.png)
      2. each module-*.png at the run root (NOT the *-top-front variants)
      3. the 8 named engineering drawings (PNG, or SVG->PNG) from drawings/
         + a few representative isometrics if present
    Missing files are simply skipped.
    """
    specs: List[Tuple[str, str, str]] = []
    draw = os.path.join(run_dir, "drawings")

    def first_existing(*cands: str) -> Optional[str]:
        for c in cands:
            if c and os.path.exists(c):
                return c
        return None

    # 1. hero
    hero = first_existing(os.path.join(run_dir, "00-hero.png"),
                          os.path.join(run_dir, "blender-cover.png"))
    if hero:
        specs.append((hero, "Render — Hero",
                      "Blender photoreal hero render of the plant."))

    # 2. module renders (root-level, exclude -top-front)
    for fn in sorted(os.listdir(run_dir)):
        if fn.startswith("module-") and fn.endswith(".png") and "top-front" not in fn:
            mod = fn[len("module-"):-len(".png")].replace("_", " ")
            specs.append((os.path.join(run_dir, fn), f"Module — {mod}",
                          f"Per-module render: {mod}."))

    # 3. the 8 engineering drawings (canonical names + aliases)
    eng = [
        ("general-arrangement", "GA — General Arrangement",
         "General arrangement / plant layout."),
        ("pid", "P&ID", "Piping & instrumentation diagram."),
        ("block-flow-diagram", "BFD — Block Flow",
         "Block flow diagram of the process."),
        ("single-line-diagram", "Single-line",
         "Electrical single-line diagram."),
        ("panel-schedule", "Panel schedule", "Electrical panel schedule."),
        ("hvac-layout", "HVAC", "HVAC / ventilation layout."),
        ("process-schedules", "Process schedules",
         "Process equipment & line schedules."),
    ]
    for stem, ttl, cap in eng:
        # try drawings/<stem>.png, drawings/<stem>.svg, then run-root variants
        cand_png = os.path.join(draw, stem + ".png")
        cand_svg = os.path.join(draw, stem + ".svg")
        root_png = os.path.join(run_dir, stem + ".png")
        path = first_existing(cand_png, root_png)
        if not path:
            path = ensure_png(cand_svg, run_dir)
        if path:
            specs.append((path, ttl, cap))

    # representative isometrics (first up to 3) so the iso family is shown without
    # exploding the file size with all ~60.
    isos = sorted(fn for fn in os.listdir(draw)
                  if fn.startswith("isometric-") and fn.endswith(".png")) if os.path.isdir(draw) else []
    for fn in isos[:3]:
        tag = fn[len("isometric-"):-len(".png")]
        specs.append((os.path.join(draw, fn), f"Isometric — {tag}",
                      f"Representative pipe isometric ({tag})."))

    return specs


# ============================================================================
# MAIN
# ============================================================================
def build(run_dir: str, out_path: str) -> dict:
    state = load_json(os.path.join(run_dir, "state.json"))
    if state is None:
        raise SystemExit(f"No state.json in {run_dir}")
    sha = git_short_sha()

    wb = Workbook()
    wb.remove(wb.active)  # drop the default sheet

    print("  · Overview")
    tab_overview(wb, state, run_dir, sha)
    print("  · ⚠ Checks")
    fail_count = tab_checks(wb, state, run_dir)
    checks_ws = wb["⚠ Checks"]
    fail_labels = getattr(checks_ws, "_forge_fail_labels", [])
    print("  · Quantities")
    tab_quantities(wb, state)
    print("  · Calculations")
    live_n, static_n = tab_calculations(wb, state)
    print("  · BoM")
    tab_bom(wb, state, run_dir)
    print("  · Cost")
    has_cost = tab_cost(wb, state)

    print("  · Image tabs")
    used_titles = {t.lower() for t in wb.sheetnames}
    specs = collect_image_specs(run_dir)
    img_ok = 0
    for path, ttl, cap in specs:
        png = ensure_png(path, run_dir)
        if png and add_image_tab(wb, run_dir, png, ttl, cap, used_titles):
            img_ok += 1
            print(f"      + {ttl}")

    wb.save(out_path)

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    return {
        "out_path": out_path,
        "size_mb": size_mb,
        "tabs": wb.sheetnames,
        "live_calcs": live_n,
        "static_calcs": static_n,
        "fail_count": fail_count,
        "fail_labels": fail_labels,
        "image_tabs": img_ok,
        "has_cost": has_cost,
        "sha": sha,
    }


def main() -> None:
    run_dir = sys.argv[1] if len(sys.argv) > 1 else "out/ras-v26-verify"
    run_dir = os.path.normpath(run_dir)
    if not os.path.isdir(run_dir):
        raise SystemExit(f"Run dir not found: {run_dir}")
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(run_dir, "dossier.xlsx")
    print(f"Building Excel review workbook for {run_dir} -> {out_path}")
    res = build(run_dir, out_path)
    print("\nDONE")
    print(f"  path        : {res['out_path']}")
    print(f"  size        : {res['size_mb']:.2f} MB")
    print(f"  tabs ({len(res['tabs'])})  : {res['tabs']}")
    print(f"  live calcs  : {res['live_calcs']}")
    print(f"  static calcs: {res['static_calcs']}")
    print(f"  image tabs  : {res['image_tabs']}")
    print(f"  CHECKS FAIL : {res['fail_count']}")
    for fl in res["fail_labels"]:
        print(f"      FAIL -> {fl}")


if __name__ == "__main__":
    main()
