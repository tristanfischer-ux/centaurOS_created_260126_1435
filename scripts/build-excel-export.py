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


# Number formats (#37) — kill General/scientific. Excel display masks only;
# they never change the stored value, so they are safe on live-formula cells.
FMT_GBP = "£#,##0"          # money, no decimals
FMT_GBP2 = "£#,##0.00"      # money with pence (small unit prices)
FMT_INT = "#,##0"           # counts / integers with thousands separators
FMT_DEC1 = "#,##0.0"        # one decimal (velocities, %drop, ratings)
FMT_DEC2 = "#,##0.00"       # two decimals (ratios, m/s, areas)

# CONTENTS hyperlink target / back-link constant.
CONTENTS_SHEET = "Contents"
FONT_LINK = Font(name="Calibri", size=11, color="1F3A5F", underline="single", bold=True)

# One-line descriptions for the Contents index (#26). Image/module tabs fall
# back to _default_desc(); these cover the data tabs by their exact sheet name.
_TAB_DESCRIPTIONS: Dict[str, str] = {
    "Overview": "Quality scorecard, headline metrics & run provenance.",
    "⚠ Checks": "Live arithmetic invariants (== the CLI verifier). RED = numbers don't reconcile.",
    "Quantities": "Every sized contract quantity with family, basis & source.",
    "Calculations": "Worked calcs grouped by tool — live Excel formulas where structured.",
    "BoM": "Bill of materials — every line, with a live Σ line £ total.",
    "Cost": "Cost basis — per-line cost build-up with method, inputs & factors.",
    "Brief compliance": "Every brief target metric vs the achieved quantity vs a live PASS/FAIL.",
    "Cost waterfall": "BoM → assembly → factory COGS → install → installed ASP (live running totals).",
    "Spec sheets": "One block per principal item: duty, rating, qty, £, driving calc & part/MPN.",
    "Panel schedule": "Electrical panel / load schedule as a real sortable table.",
    "Process line list": "Process line list — sortable rows cross-referenced to the P&ID.",
    "Process valve list": "Process valve list — tag, type, service, size, fail action.",
    "Process instruments": "Instrument index — tag, ISA, measured variable, range, signal.",
    "Line & velocity": "Every sized run with velocity / volt-drop & within-spec flagging.",
}

# A whitelist of CONTROL-CHARS Excel rejects inside a worksheet cell string —
# md tables occasionally carry stray control bytes; strip them so .save never throws.
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def clean_cell(v: Any) -> Any:
    """Make any value safe + tidy for a worksheet cell. Strings get control chars
    stripped; everything else passes through untouched."""
    if isinstance(v, str):
        return _CTRL.sub("", v).strip()
    return v


def back_link(ws: Worksheet, span: int) -> None:
    """Write a '↑ Contents' internal hyperlink at the top-right of a data tab —
    column ``span+1`` (immediately right of the merged title band, so it never
    collides with the title merge). UNIVERSAL: called on every non-image tab."""
    col = span + 1
    c = ws.cell(1, col, "↑ Contents")
    # quote the sheet name so spaces/symbols in CONTENTS_SHEET are always valid
    c.hyperlink = f"#'{CONTENTS_SHEET}'!A1"
    c.font = FONT_LINK
    c.alignment = Alignment(horizontal="right", vertical="center")
    ws.column_dimensions[get_column_letter(col)].width = 13


def apply_col_formats(ws: Worksheet, first_row: int, fmt_by_col: Dict[int, str],
                      last_row: Optional[int] = None) -> None:
    """Apply a number format to numeric cells in the given columns from
    ``first_row`` down. Only touches cells whose stored value is a number OR a
    live formula string (formulas resolve to numbers, so a money/decimal mask is
    correct + kills the General default). Text cells are left alone. ROBUST:
    a missing/empty column is silently skipped."""
    lr = last_row if last_row is not None else ws.max_row
    for col, fmt in fmt_by_col.items():
        letter = get_column_letter(col)
        for row in range(first_row, lr + 1):
            cell = ws[f"{letter}{row}"]
            v = cell.value
            if v is None:
                continue
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                cell.number_format = fmt
            elif isinstance(v, str) and v.startswith("="):
                cell.number_format = fmt


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

    back_link(ws, 4)


# ============================================================================
# TAB 2 — "⚠ Checks"  (THE ERROR-SURFACING TAB — the point of the exercise)
# ============================================================================
def _render_lib_checks(ws: Worksheet, state: dict, run_dir: str, r: int,
                       data_r: int, data_col_a: str,
                       fail_labels: List[str]) -> Tuple[int, int, int]:
    """Render every deterministic_checks_lib.Check as a LIVE Excel row, grouped by
    family. Returns (next_row, next_data_row, fail_count).

    Layout per check (one visible row per lib Check; STATUS recomputes live):
      * hidden data cells: K=actual-base (or per-unit), L=expected, M=count
      * visible: B=ACTUAL formula, C=EXPECTED ref, D=Δ, E=Tol/band, F=STATUS, G=detail
      * the STATUS formula is chosen to MIRROR the lib's own decision for that check
        so the live recompute can never disagree with the CLI:
          ge    -> =IF(B>=C-E,"PASS","FAIL")        (rating must clear duty)
          le    -> =IF(B<=C+E,"PASS","FAIL")        (within a ceiling)
          tally -> =IF(B<=C,"PASS","FAIL")          (out-of-spec count must be 0)
          band  -> =IF(OR(B/C>E,B/C<1/E),"FAIL","PASS")  (COST ×N price band; the lib
                   tags these relation="eq" but decides by a RATIO band with tol==0 —
                   here E holds the band factor so the column stays meaningful)
          eq    -> =IF(ABS(D)<E,"PASS","FAIL")      (equality within tolerance)
    A COST check with relation "eq" and tol 0 IS a ratio-band check (the lib's COST1
    `unit price within xN of <ref>`); every other eq check carries a non-zero tol.
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

            # A COST check tagged relation="eq" with tol==0 is decided by the lib as a
            # RATIO BAND (unit price within xN of its reference), NOT an equality —
            # render it as a live band test so the recompute matches the CLI exactly.
            is_band = (c.category == "COST" and c.relation == "eq" and not c.tol)
            tol_cell_val = dcl.COST_BAND_FACTOR if is_band else c.tol

            # --- visible live row ---
            ws.cell(r, 1, c.name).border = BORDER
            ws.cell(r, 1).alignment = WRAP_TOP
            ws.cell(r, 2, actual_formula).border = BORDER
            ws.cell(r, 3, f"=$L${data_r}").border = BORDER
            ws.cell(r, 4, f"=B{r}-C{r}").border = BORDER
            ws.cell(r, 5, tol_cell_val).border = BORDER
            # STATUS formula chosen to MIRROR the lib's own decision (see docstring)
            if is_band:                     # COST ratio band: flag >xN or <1/N of ref
                status_f = (f'=IF(OR(C{r}=0,AND(B{r}/C{r}<=E{r},'
                            f'B{r}/C{r}>=1/E{r})),"PASS","FAIL")')
            elif c.relation == "ge":        # actual must be >= expected
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
    Live-formula invariants — ONE SOURCE OF TRUTH with the CLI verifier.

    This tab renders EXACTLY the checks ``deterministic_checks_lib.run_all_checks``
    produces — the SAME pure-arithmetic suite the standalone CLI
    (``scripts/deterministic-checks.py``) prints — one visible row per applicable
    check, in the SAME five families (CONSISTENCY / ADEQUACY / BALANCE / COST /
    CONNECTIVITY), with the SAME PASS/FAIL verdict. There is NO exporter-side check
    machinery any more: previously this tab ALSO carried four hand-rolled sections
    (A per-unit×count, B Σ-lines==cover, C emitter-render-vs-contract, D closures)
    that DUPLICATED the lib (B, D) or emitted FALSE POSITIVES the lib does not (the
    stale "BoM per-unit flow 1336 m³/h × train count 8" — 1,336 is the correct
    per-TANK inlet flow ÷10 tanks, not a per-pump flow ÷8 trains — and the
    "Pump motor power: worked-calc render vs contract" full-loop-vs-per-pump basis
    comparison). Both have been removed so the tab can never disagree with the CLI.

    Each row:
        Check | ACTUAL (live =formula over the data cells) | EXPECTED
              | Δ (=ACTUAL-EXPECTED) | Tol | STATUS (=IF(...)) | Detail
    The numbers live in a hidden, editable DATA block (cols J+) so the visible
    ACTUAL/EXPECTED are genuine cell references: edit a yellow input and STATUS
    recomputes live. Conditional formatting colours STATUS on open.

    Returns the number of FAIL rows (for the final report) — identical to the
    CLI's fail count on the same run.
    """
    ws = wb.create_sheet("⚠ Checks")
    set_widths(ws, {"A": 46, "B": 16, "C": 16, "D": 14, "E": 10, "F": 12, "G": 52})
    title_row(
        ws, "⚠ Computational checks — live invariants (== the CLI verifier)", 7,
        "EXACTLY the checks scripts/deterministic-checks.py reports, rendered as "
        "LIVE Excel formulas over the data cells (cols J+). Edit a data cell and "
        "STATUS recomputes. RED = the engine's numbers do not reconcile.",
    )
    hdr = 4
    header(ws, hdr, ["Check", "ACTUAL", "EXPECTED", "Δ (actual-exp)",
                     "Tol", "STATUS", "Detail / why"])
    r = hdr + 1

    # Hidden data columns: J (label), K (a-value), L (b-value/expected), M (count)
    DATA_COL_A = "K"
    data_r = hdr  # parallel pointer into the data block
    ws.cell(hdr, 10, "DATA (live inputs — editable)").font = FONT_SUB

    fail_count = 0
    fail_labels: List[str] = []

    # ---- THE SHARED deterministic check suite — the ONLY source of checks --------
    # Every check from deterministic_checks_lib.run_all_checks — the SAME arithmetic
    # the standalone CLI runs — rendered as live Excel rows, grouped by family.
    # ACTUAL/EXPECTED/Δ/STATUS are formulas over editable yellow data cells;
    # per-unit×count checks make the product itself live (=K*M). This is the WHOLE
    # tab: identical set + identical PASS/FAIL to the CLI, no exporter-side extras.
    r, data_r, fc = _render_lib_checks(
        ws, state, run_dir, r, data_r, DATA_COL_A, fail_labels)
    fail_count += fc

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
    # number formats (#37) on the Value column — kill General/scientific
    apply_col_formats(ws, 5, {2: FMT_DEC2}, r - 1)
    ws.auto_filter.ref = f"A4:G{r - 1}"
    ws.freeze_panes = "A5"
    back_link(ws, 7)


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

    # number formats (#37): value (B) + engine-value (E) + Δ (F) columns. These
    # carry per-calc results in mixed units, so a thousands-separated 2-dp mask
    # (not £, not General/scientific) is the safe universal display.
    apply_col_formats(ws, 5, {2: FMT_DEC2, 5: FMT_DEC2, 6: FMT_DEC2}, r)
    ws.freeze_panes = "A4"
    back_link(ws, 8)
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
        gc = ws.cell(r, 7, grand)
        gc.number_format = FMT_GBP
        ws.cell(r, 8, f"Compare against the LIVE Σ line £ at row {sum_row}. "
                      f"See the ⚠ Checks tab for the reconciliation row.").font = FONT_NOTE
    # number formats (#37) on the BoM line block: Qty (#,##0) + Unit/Line £ (£#,##0)
    apply_col_formats(ws, first_line_row, {3: FMT_INT}, last_line_row)
    apply_col_formats(ws, first_line_row, {6: FMT_GBP, 7: FMT_GBP}, sum_row)
    ws.auto_filter.ref = f"A4:H{last_line_row}"
    ws.freeze_panes = "A5"
    back_link(ws, 8)


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
    back_link(ws, 8)
    return True


# ============================================================================
# TAB — BRIEF-COMPLIANCE MATRIX (#45)
# ============================================================================
# Every parsedBrief.constraints.target_performance.metrics[] target vs the
# ACHIEVED contract quantity vs a LIVE =IF PASS/FAIL. Names differ between the
# brief metric (e.g. production_capacity_tpy) and the contract quantity
# (annual_production_t_yr) — so matching is by VALUE + UNIT-FAMILY, never name.
# ----------------------------------------------------------------------------

# Canonical unit-family map so 204 tpy (brief) reconciles with 204 t/yr
# (contract) and 60 kg/m3 reconciles with 60 kg/m³. Each family maps a raw
# unit string (lower-cased, whitespace-stripped) to a (family, to_canonical)
# pair; the value is converted to the family's canonical unit before compare.
def _unit_family(unit: str) -> Tuple[str, float]:
    """Return (family_key, multiplier_to_canonical) for a unit string.
    Unknown units fall back to family='?'+the raw token so two identical raw
    units still match each other."""
    u = (unit or "").strip().lower().replace(" ", "")
    u = u.replace("³", "3").replace("²", "2").replace("·", ".").replace("μ", "u")
    table = {
        # throughput / production per year -> canonical tonnes/yr
        "tpy": ("t_per_yr", 1.0), "t/yr": ("t_per_yr", 1.0),
        "t/y": ("t_per_yr", 1.0), "tonnes/yr": ("t_per_yr", 1.0),
        "tonne/yr": ("t_per_yr", 1.0), "te/yr": ("t_per_yr", 1.0),
        "kg/yr": ("t_per_yr", 0.001),
        # volume -> canonical m3
        "m3": ("volume_m3", 1.0), "litre": ("volume_m3", 0.001),
        "l": ("volume_m3", 0.001), "litres": ("volume_m3", 0.001),
        # density -> canonical kg/m3
        "kg/m3": ("density", 1.0), "g/l": ("density", 1.0),
        # time / cycle -> canonical days
        "days": ("time_days", 1.0), "day": ("time_days", 1.0),
        "d": ("time_days", 1.0), "hr": ("time_days", 1 / 24.0),
        "hours": ("time_days", 1 / 24.0), "h": ("time_days", 1 / 24.0),
        # mass -> canonical kg
        "kg": ("mass_kg", 1.0), "g": ("mass_kg", 0.001), "t": ("mass_kg", 1000.0),
        "tonne": ("mass_kg", 1000.0), "tonnes": ("mass_kg", 1000.0),
        # power -> canonical kW
        "kw": ("power_kw", 1.0), "mw": ("power_kw", 1000.0), "w": ("power_kw", 0.001),
        # dimensionless / ratio
        "ratio": ("ratio", 1.0), "": ("ratio", 1.0), "-": ("ratio", 1.0),
    }
    return table.get(u, ("?" + u, 1.0))


def _match_quantity(metric: dict, quantities: Dict[str, Any]) -> Optional[Tuple[str, float, str]]:
    """Find the contract quantity that fulfils a brief metric, by VALUE + UNIT
    FAMILY (names differ). Returns (qty_name, achieved_value, qty_unit) or None.
    Strategy: same family as the brief metric, then prefer the quantity whose
    canonical value is closest to the brief's canonical target (a faithful
    'we hit the same number' match), tie-broken by a name-token overlap so e.g.
    total_tank_volume_m3 (3340) is preferred over rearing_tank_volume_each_m3
    (334) for the 3,340 m³ target."""
    b_val = num(metric.get("value"))
    if b_val is None:
        return None
    b_fam, b_mul = _unit_family(metric.get("unit", ""))
    b_canon = b_val * b_mul
    # name tokens of the brief metric, for the tie-break
    b_key = (metric.get("key_metric") or metric.get("metric") or "").lower()
    b_tokens = set(re.findall(r"[a-z]+", b_key))

    best = None  # (closeness, -overlap, name, achieved_value, unit)
    for qname, qv in quantities.items():
        if not isinstance(qv, dict):
            continue
        a_val = num(qv.get("value"))
        if a_val is None:
            continue
        a_fam, a_mul = _unit_family(qv.get("unit", ""))
        if a_fam != b_fam:
            continue
        a_canon = a_val * a_mul
        # relative closeness to the brief target (0 == exact hit)
        denom = max(abs(b_canon), 1e-9)
        closeness = abs(a_canon - b_canon) / denom
        # only treat as a fulfilment candidate within a sane window (±50% of
        # target) so an unrelated same-family quantity is never grabbed
        if closeness > 0.5:
            continue
        overlap = len(b_tokens & set(re.findall(r"[a-z]+", qname.lower())))
        cand = (round(closeness, 6), -overlap, qname, a_val, qv.get("unit", ""))
        if best is None or cand < best:
            best = cand
    if best is None:
        return None
    return best[2], best[3], best[4]


def tab_brief_compliance(wb: Workbook, state: dict) -> bool:
    pb = state.get("parsedBrief") or {}
    con = pb.get("constraints") or {}
    tp = con.get("target_performance") or {}
    metrics = tp.get("metrics") or []
    # if the brief carries only the headline (no metrics[]), synthesise one row
    if not metrics and tp.get("value") is not None:
        metrics = [tp]
    if not metrics:
        return False
    quantities = (state.get("orchestratorContract") or {}).get("quantities") or {}

    ws = wb.create_sheet("Brief compliance")
    set_widths(ws, {"A": 36, "B": 14, "C": 12, "D": 32, "E": 14, "F": 12,
                    "G": 10, "H": 40})
    title_row(
        ws, "Brief-compliance matrix", 8,
        "Every brief target_performance metric vs the ACHIEVED contract quantity "
        "vs a LIVE PASS/FAIL. Target & achieved are matched by value + unit family "
        "(brief & contract use different names). Yellow = editable; STATUS recomputes.",
    )
    header(ws, 4, ["Brief metric", "Target", "Unit", "Matched contract quantity",
                   "Achieved", "Direction", "STATUS", "Note"])
    r = 5
    first = r
    for m in metrics:
        key = (m.get("key_metric") or m.get("metric") or m.get("name") or "").strip()
        tgt = num(m.get("value"))
        unit = m.get("unit", "") or ""
        category = (m.get("category") or "").lower()
        matched = _match_quantity(m, quantities)

        ws.cell(r, 1, clean_cell(key) or "(unnamed metric)").border = BORDER
        tc = ws.cell(r, 2, tgt)
        tc.fill = FILL_INPUT
        tc.border = BORDER
        ws.cell(r, 3, clean_cell(unit)).border = BORDER

        if matched is None:
            ws.cell(r, 4, "— no matching quantity —").border = BORDER
            ac = ws.cell(r, 5, "—")
            ac.border = BORDER
            ws.cell(r, 6, "—").border = BORDER
            sc = ws.cell(r, 7, "UNVERIFIED")
            sc.fill = FILL_CONST
            sc.font = Font(bold=True, color="7F5B00")
            sc.border = BORDER
            nt = ws.cell(r, 8, "No contract quantity in the same unit family within "
                              "±50% of target — cannot auto-verify.")
            nt.alignment = WRAP_TOP
            nt.font = FONT_NOTE
            nt.border = BORDER
            r += 1
            continue

        qname, ach, qunit_s = matched
        ws.cell(r, 4, clean_cell(qname)).border = BORDER
        ac = ws.cell(r, 5, ach)
        ac.fill = FILL_RESULT
        ac.border = BORDER

        # Direction of the PASS test, inferred from the metric category/name:
        #  - efficiency ratios (FCR) & cycle-time: lower-is-better -> achieved <= target
        #  - everything else (scale, density, throughput): meet-or-exceed -> >= target
        lower_better = (
            category == "efficiency"
            or "fcr" in key.lower()
            or "conversion_ratio" in key.lower()
            or "cycle" in key.lower()
            or "_days" in key.lower()
        )
        # tolerance band: ±2% of target (display rounding + sizing granularity)
        tol = abs(tgt) * 0.02 if tgt else 0.0
        if lower_better:
            ws.cell(r, 6, "≤ target (lower better)").border = BORDER
            status_f = f'=IF(E{r}<=B{r}+{tol:.6g},"PASS","FAIL")'
        else:
            ws.cell(r, 6, "≥ target (meet/exceed)").border = BORDER
            status_f = f'=IF(E{r}>=B{r}-{tol:.6g},"PASS","FAIL")'
        sc = ws.cell(r, 7, status_f)
        sc.font = Font(bold=True)
        sc.border = BORDER

        # pre-evaluate so the cell colours on open (before Excel recomputes)
        if tgt is not None and ach is not None:
            passed = (ach <= tgt + tol) if lower_better else (ach >= tgt - tol)
            sc_fill = FILL_PASS if passed else FILL_FAIL
            for col in range(1, 9):
                if not isinstance(ws.cell(r, col).fill, PatternFill) or \
                        ws.cell(r, col).fill.fgColor.rgb in (None, "00000000"):
                    pass
            sc.fill = sc_fill
            sc.font = FONT_PASS if passed else FONT_FAIL
        nt = ws.cell(r, 8, f"family={_unit_family(unit)[0]}")
        nt.alignment = WRAP_TOP
        nt.font = FONT_NOTE
        nt.border = BORDER
        r += 1

    # live conditional formatting on STATUS
    from openpyxl.formatting.rule import CellIsRule
    rng = f"G{first}:G{r-1}"
    ws.conditional_formatting.add(rng, CellIsRule(
        operator="equal", formula=['"FAIL"'], fill=FILL_FAIL, font=FONT_FAIL))
    ws.conditional_formatting.add(rng, CellIsRule(
        operator="equal", formula=['"PASS"'], fill=FILL_PASS, font=FONT_PASS))

    apply_col_formats(ws, first, {2: FMT_DEC2, 5: FMT_DEC2}, r - 1)
    ws.auto_filter.ref = f"A4:H{r-1}"
    ws.freeze_panes = "A5"
    back_link(ws, 8)
    return True


# ============================================================================
# TAB — COST WATERFALL (#44)
# ============================================================================
# BoM -> +assembly -> factory COGS -> +install -> installed ASP, from
# state.costStack, as LIVE running formulas (each running total references the
# prior running total + the step delta, so editing any step recomputes the ASP).
# ----------------------------------------------------------------------------
def tab_cost_waterfall(wb: Workbook, state: dict) -> bool:
    cs = state.get("costStack")
    if not cs or not isinstance(cs, dict):
        return False

    # Ordered build-up: (label, base-key for the additive STEP value, is_running_anchor).
    # We render successive steps; each running total = previous running + this step.
    # The anchors (raw BoM, factory COGS, OEM transfer, channel list, installed ASP)
    # are taken from costStack directly and shown beside the running total so any
    # divergence is visible.
    raw = num(cs.get("raw_materials_bom_gbp"))
    if raw is None:
        return False

    ws = wb.create_sheet("Cost waterfall")
    set_widths(ws, {"A": 38, "B": 18, "C": 18, "D": 56})
    title_row(
        ws, "Cost waterfall — BoM → installed ASP", 4,
        "Running build-up from state.costStack. Yellow = editable step £; the "
        "Running total column is LIVE (each = previous running + this step), so "
        "editing any step recomputes the installed price. 'costStack anchor' shows "
        "the engine's stored figure at that milestone for cross-check.",
    )
    header(ws, 4, ["Step", "Step £ (editable)", "Running total £ (live)",
                   "costStack anchor / note"])
    r = 5

    # Build the additive ladder. Each entry: (label, step_amount, anchor_value_or_None, note)
    steps: List[Tuple[str, Optional[float], Optional[float], str]] = []
    steps.append(("Raw materials (BoM)", raw, raw,
                  "raw_materials_bom_gbp — start of the build-up"))
    asm = num(cs.get("assembly_labour_gbp")) or 0.0
    steps.append(("+ Assembly / erection labour", asm, None, "assembly_labour_gbp"))
    ovh = num(cs.get("factory_overhead_gbp")) or 0.0
    if ovh:
        steps.append(("+ Factory overhead", ovh, None, "factory_overhead_gbp"))
    steps.append(("= Factory COGS", None,
                  num(cs.get("factory_cogs_gbp")),
                  "factory_cogs_gbp (anchor — compare running total)"))
    margin = num(cs.get("manufacturer_margin_gbp")) or 0.0
    if margin:
        steps.append(("+ Manufacturer margin", margin, None, "manufacturer_margin_gbp"))
    steps.append(("= OEM transfer price", None,
                  num(cs.get("oem_transfer_price_gbp")),
                  "oem_transfer_price_gbp (anchor)"))
    chan = num(cs.get("channel_markup_gbp")) or 0.0
    if chan:
        steps.append(("+ Channel markup", chan, None, "channel_markup_gbp"))
        steps.append(("= Channel list price", None,
                      num(cs.get("channel_list_price_gbp")),
                      "channel_list_price_gbp (anchor)"))
    install = num(cs.get("installation_cost_gbp")) or 0.0
    steps.append(("+ Installation / field erection", install, None,
                  "installation_cost_gbp"))
    steps.append(("= Installed ASP", None,
                  num(cs.get("installed_asp_gbp")),
                  "installed_asp_gbp (anchor — final installed price)"))

    first = r
    running_row: Optional[int] = None  # row holding the last LIVE running total
    for label, step_amt, anchor, note in steps:
        ws.cell(r, 1, label).border = BORDER
        ws.cell(r, 1).font = FONT_SUB if label.startswith(("=", "Raw")) else Font()
        if step_amt is not None and not label.startswith("="):
            sc = ws.cell(r, 2, step_amt)
            sc.fill = FILL_INPUT
            sc.border = BORDER
            if running_row is None:          # first anchor = the running seed
                rt = ws.cell(r, 3, f"=B{r}")
            else:
                rt = ws.cell(r, 3, f"=C{running_row}+B{r}")
            rt.fill = FILL_RESULT
            rt.border = BORDER
            running_row = r
        else:
            # milestone anchor row: running total carries forward unchanged; show
            # the engine's stored anchor in the running column for direct compare
            ws.cell(r, 2, "").border = BORDER
            if running_row is not None:
                rt = ws.cell(r, 3, f"=C{running_row}")
            else:
                rt = ws.cell(r, 3, anchor)
            rt.fill = FILL_RESULT
            rt.border = BORDER
            running_row = r
            ws.cell(r, 1).font = FONT_SUB
        nt = ws.cell(r, 4, (note + (f"  ·  engine anchor £{anchor:,.0f}"
                                    if anchor is not None else "")))
        nt.alignment = WRAP_TOP
        nt.font = FONT_NOTE
        nt.border = BORDER
        r += 1

    apply_col_formats(ws, first, {2: FMT_GBP, 3: FMT_GBP}, r - 1)
    ws.freeze_panes = "A5"
    back_link(ws, 4)
    return True


# ============================================================================
# TAB — SPEC-SHEET-PER-PRINCIPAL (#43)
# ============================================================================
# One compact block per principal BoM item: tag, duty, rating, qty, unit £,
# line £, driving worked-calc label (the 'basis'), and the part/MPN.
# ----------------------------------------------------------------------------
def tab_spec_sheets(wb: Workbook, state: dict) -> bool:
    bom = state.get("requirementsBom") or []
    if not bom:
        return False
    # PRINCIPAL items = top-level lines (no sub_of parent) that carry a real line
    # cost. Sub-components (sub_of set) fold into their parent and are excluded.
    principals = [
        b for b in bom
        if isinstance(b, dict) and not b.get("sub_of")
        and num(b.get("line_gbp"))
    ]
    if not principals:
        # fall back to anything with a line cost so the tab still renders
        principals = [b for b in bom if isinstance(b, dict) and num(b.get("line_gbp"))]
    if not principals:
        return False
    principals.sort(key=lambda b: num(b.get("line_gbp")) or 0.0, reverse=True)

    # part-verification lookup: tag/word -> best MPN string, for the part column
    pv_by_word: Dict[str, str] = {}
    for pv in (state.get("partVerifications") or []):
        if not isinstance(pv, dict):
            continue
        mfr = (pv.get("manufacturer") or "").strip()
        mpn = (pv.get("part_number") or "").strip()
        if not mpn:
            continue
        label = (f"{mfr} {mpn}".strip())
        for k in (pv.get("word_name"), pv.get("word_id")):
            if k:
                pv_by_word.setdefault(str(k).strip().lower(), label)

    ws = wb.create_sheet("Spec sheets")
    set_widths(ws, {"A": 22, "B": 18, "C": 12, "D": 14, "E": 14, "F": 14,
                    "G": 14, "H": 58})
    title_row(
        ws, "Spec sheet — per principal item", 8,
        "One block per principal BoM line: tag · duty/rating (from the requirement) "
        "· qty · unit £ · line £ · the driving worked-calc (basis) · the part/MPN. "
        "Line £ is a LIVE =qty×unit; the foot Σ totals the principals.",
    )
    r = 4
    first_line_row = None
    line_total_rows: List[int] = []

    for b in principals:
        tag = clean_cell(b.get("tag", "")) or "(no tag)"
        req = clean_cell(b.get("requirement", ""))
        status = clean_cell(b.get("status", ""))
        part = clean_cell(b.get("part", ""))
        qty = num(b.get("qty"))
        unit_gbp = num(b.get("unit_gbp"))
        line_gbp = num(b.get("line_gbp"))
        basis = clean_cell(b.get("basis", ""))
        material = clean_cell(b.get("material", ""))
        # duty/rating: prefer the structured rating in the requirement text after
        # the tag noun; we surface the WHOLE requirement as 'duty' (it carries the
        # sizing, e.g. '132 kW motor (97 kW shaft)') — universal, no class parsing.
        mpn = pv_by_word.get(str(b.get("tag", "")).strip().lower()) or ""
        if not mpn and req:
            # try to match by the leading noun of the requirement against pv words
            head = re.split(r"[·\-(]", req)[0].strip().lower()
            mpn = pv_by_word.get(head, "")

        # ---- block header (the tag band) ----
        sub_banner(ws, r, f"{tag}    ·    {req}", 8)
        r += 1
        header(ws, r, ["Field", "Status", "Qty", "Unit £", "Line £",
                       "Material", "Part / MPN", "Driving worked-calc (basis)"])
        r += 1
        # the single data row for this principal
        ws.cell(r, 1, "spec").font = FONT_SUB
        ws.cell(r, 1).border = BORDER
        ws.cell(r, 2, status).border = BORDER
        qc = ws.cell(r, 3, qty)
        qc.fill = FILL_INPUT
        qc.border = BORDER
        uc = ws.cell(r, 4, unit_gbp)
        uc.fill = FILL_INPUT
        uc.border = BORDER
        # Line £ LIVE = qty × unit £ where both are present; else the stored value
        if qty is not None and unit_gbp is not None:
            lc = ws.cell(r, 5, f"=C{r}*D{r}")
        else:
            lc = ws.cell(r, 5, line_gbp)
        lc.fill = FILL_RESULT
        lc.border = BORDER
        line_total_rows.append(r)
        ws.cell(r, 6, material).border = BORDER
        pc = ws.cell(r, 7, clean_cell(mpn) or (part or "—"))
        pc.border = BORDER
        pc.alignment = WRAP_TOP
        bc = ws.cell(r, 8, basis)
        bc.alignment = WRAP_TOP
        bc.font = FONT_NOTE
        bc.border = BORDER
        if first_line_row is None:
            first_line_row = r
        apply_col_formats(ws, r, {4: FMT_GBP, 5: FMT_GBP}, r)
        r += 2  # spacer between blocks

    # foot Σ over all principal line totals (live, sums the discrete cells)
    if line_total_rows:
        ws.cell(r, 1, "Σ PRINCIPALS").font = FONT_SUB
        sum_expr = "=" + "+".join(f"E{rr}" for rr in line_total_rows)
        tot = ws.cell(r, 5, sum_expr)
        tot.font = Font(bold=True)
        tot.fill = FILL_RESULT
        tot.number_format = FMT_GBP
    ws.freeze_panes = "A4"
    back_link(ws, 8)
    return True


# ============================================================================
# MARKDOWN-TABLE PARSER (shared by the schedule tabs #20–22)
# ============================================================================
_MD_SEP = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")


def parse_md_tables(text: str) -> List[Tuple[str, List[str], List[List[str]]]]:
    """Parse every GitHub-flavoured markdown table in ``text``.
    Returns a list of (preceding_heading, header_cells, [row_cells, ...]).
    A table = a pipe row immediately followed by a |---|---| separator row, then
    consecutive pipe rows. The nearest preceding '#'-heading is attached."""
    lines = text.splitlines()
    tables: List[Tuple[str, List[str], List[List[str]]]] = []
    heading = ""
    i, n = 0, len(lines)

    def cells(s: str) -> List[str]:
        s = s.strip()
        if s.startswith("|"):
            s = s[1:]
        if s.endswith("|"):
            s = s[:-1]
        return [c.strip() for c in s.split("|")]

    while i < n:
        st = lines[i].strip()
        if st.startswith("#"):
            heading = st.lstrip("#").strip()
        if (st.startswith("|") and i + 1 < n
                and _MD_SEP.match(lines[i + 1].strip())
                and "-" in lines[i + 1]):
            hdr = cells(st)
            rows: List[List[str]] = []
            j = i + 2
            while j < n and lines[j].strip().startswith("|"):
                rows.append(cells(lines[j].strip()))
                j += 1
            tables.append((heading, hdr, rows))
            i = j
            continue
        i += 1
    return tables


def _render_md_table(ws: Worksheet, start_row: int, heading: str,
                     hdr: List[str], rows: List[List[str]],
                     spec_col: Optional[int] = None) -> int:
    """Render one parsed md table as a real sortable sheet table starting at
    ``start_row``. Returns (next_free_row, first_body_row). Numeric-looking cells
    are coerced to numbers (so they sort + format correctly); the rest stay as
    text. If ``spec_col`` is given, an 'In spec' ✓/✗ column is coloured."""
    ncol = max(len(hdr), max((len(rw) for rw in rows), default=0))
    if heading:
        sub_banner(ws, start_row, heading, max(ncol, 2))
        start_row += 1
    header(ws, start_row, hdr + [""] * (ncol - len(hdr)))
    r = start_row + 1
    body_first = r
    for rw in rows:
        for ci in range(ncol):
            raw = rw[ci] if ci < len(rw) else ""
            txt = clean_cell(raw)
            cell = ws.cell(r, ci + 1)
            # coerce a clean numeric token (no stray units/parentheses) to a number
            n_only = re.fullmatch(r"-?[\d,]+(?:\.\d+)?", str(txt).replace("£", "").strip())
            if n_only:
                cell.value = num(txt)
            else:
                cell.value = txt
            cell.border = BORDER
            cell.alignment = WRAP_TOP
            # colour an in-spec ✓/✗ cell
            if spec_col is not None and ci + 1 == spec_col:
                s = str(txt)
                if "✗" in s or s.lower() in ("no", "false", "fail"):
                    cell.fill = FILL_FAIL
                    cell.font = FONT_FAIL
                elif "✓" in s or s.lower() in ("yes", "true", "pass"):
                    cell.fill = FILL_PASS
                    cell.font = FONT_PASS
        r += 1
    return r, body_first


def tab_panel_schedule(wb: Workbook, run_dir: str) -> bool:
    """#20 — Panel / load schedule as a real table (from panel-schedule.md)."""
    path = os.path.join(run_dir, "drawings", "panel-schedule.md")
    if not os.path.exists(path):
        return False
    try:
        text = open(path, "r").read()
    except Exception:  # noqa: BLE001
        return False
    tables = parse_md_tables(text)
    if not tables:
        return False
    ws = wb.create_sheet("Panel schedule")
    set_widths(ws, {"A": 14, "B": 40, "C": 8, "D": 18, "E": 12, "F": 22,
                    "G": 22, "H": 12, "I": 10, "J": 8})
    title_row(
        ws, "Electrical panel / load schedule", 10,
        "Parsed from panel-schedule.md — real sortable rows (circuit / load / "
        "device / cable / volt-drop). 'In spec' ✓ green / ✗ red. Auto-generated; "
        "not for construction.",
    )
    r = 4
    last_circuit_first = None
    for heading, hdr, rows in tables:
        # locate an 'in spec' column for conditional colour
        spec_col = None
        for idx, h in enumerate(hdr, start=1):
            if "spec" in h.lower():
                spec_col = idx
        r, body_first = _render_md_table(ws, r, heading, hdr, rows, spec_col)
        # autofilter + format the wide circuit table (the one with many columns)
        if len(hdr) >= 6:
            last_circuit_first = (body_first, r - 1, len(hdr))
        r += 1
    if last_circuit_first:
        bf, bl, nc = last_circuit_first
        ws.auto_filter.ref = f"A{bf - 1}:{get_column_letter(nc)}{bl}"
    ws.freeze_panes = "A5"
    back_link(ws, 10)
    return True


def tab_process_schedules(wb: Workbook, run_dir: str) -> int:
    """#21 — Process line list / valve list / instrument index as real tabs
    (from process-schedules.md). Each md table becomes its OWN sheet so each is
    independently sortable. Returns the number of sheets created."""
    path = os.path.join(run_dir, "drawings", "process-schedules.md")
    if not os.path.exists(path):
        return 0
    try:
        text = open(path, "r").read()
    except Exception:  # noqa: BLE001
        return 0
    tables = parse_md_tables(text)
    if not tables:
        return 0

    # map each section heading to a short, unique sheet name
    name_for = {
        "line": "Process line list",
        "valve": "Process valve list",
        "instrument": "Process instruments",
    }
    made = 0
    for heading, hdr, rows in tables:
        if not rows:
            continue
        hl = heading.lower()
        sheet = next((v for k, v in name_for.items() if k in hl), None)
        if sheet is None:
            sheet = "Process " + re.sub(r"[^a-z0-9 ]", "", hl)[:20].strip()
        sheet = sheet[:31]
        if sheet in wb.sheetnames:
            sheet = (sheet[:28] + f"-{made}")
        ws = wb.create_sheet(sheet)
        ncol = max(len(hdr), max((len(rw) for rw in rows), default=0))
        widths = {get_column_letter(i): (14 if i > 1 else 16) for i in range(1, ncol + 1)}
        # widen a likely 'service' / description column
        for idx, h in enumerate(hdr, start=1):
            if h.lower() in ("service", "description", "measured"):
                widths[get_column_letter(idx)] = 40
        set_widths(ws, widths)
        title_row(ws, heading.split("·")[-1].strip() or sheet, max(ncol, 2),
                  "Parsed from process-schedules.md — real sortable rows.")
        nxt, body_first = _render_md_table(ws, 4, "", hdr, rows)
        ws.auto_filter.ref = f"A4:{get_column_letter(ncol)}{nxt - 1}"
        ws.freeze_panes = "A5"
        back_link(ws, max(ncol, 2))
        made += 1
    return made


def tab_line_velocity(wb: Workbook, run_dir: str) -> bool:
    """#22 — Line & velocity table from connection-schedule.json (from/to/size/
    velocity), with within_spec conditional-formatted RED. Real sortable rows."""
    cs = load_json(os.path.join(run_dir, "connection-schedule.json"))
    if not cs or not isinstance(cs, dict):
        return False
    rows = cs.get("rows")
    if not rows or not isinstance(rows, list):
        return False
    specs = cs.get("specs") or []  # parallel, carries the spec_limit text

    ws = wb.create_sheet("Line & velocity")
    set_widths(ws, {"A": 6, "B": 22, "C": 22, "D": 14, "E": 18, "F": 12,
                    "G": 16, "H": 10, "I": 22, "J": 16})
    title_row(
        ws, "Line & velocity schedule", 10,
        "Every sized run from connection-schedule.json — from · to · DN/CSA · "
        "rating · velocity-or-ΔU · within-spec (✗ = RED) · spec limit · line £. "
        "Sortable; the within-spec column flags any run outside its limit.",
    )
    header(ws, 4, ["#", "From", "To", "Size", "Rating", "Velocity / ΔU",
                   "Length (m)", "In spec", "Spec limit", "Line £"])
    r = 5
    first = r
    fail_rows = 0
    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        spec = specs[idx] if idx < len(specs) and isinstance(specs[idx], dict) else {}
        in_spec = row.get("within_spec")
        ws.cell(r, 1, idx + 1).border = BORDER
        ws.cell(r, 2, clean_cell(row.get("from", ""))).border = BORDER
        ws.cell(r, 3, clean_cell(row.get("to", ""))).border = BORDER
        ws.cell(r, 4, clean_cell(row.get("size", ""))).border = BORDER
        ws.cell(r, 5, clean_cell(row.get("rating", ""))).border = BORDER
        # velocity / volt-drop: prefer the numeric drop_pct_or_velocity from specs
        velnum = num(spec.get("drop_pct_or_velocity"))
        if velnum is not None:
            vc = ws.cell(r, 6, velnum)
            vc.number_format = FMT_DEC2
        else:
            vc = ws.cell(r, 6, clean_cell(row.get("drop", "")))
        vc.border = BORDER
        lc = ws.cell(r, 7, num(row.get("length_m")))
        lc.number_format = FMT_DEC1
        lc.border = BORDER
        sc = ws.cell(r, 8, "✓" if in_spec else "✗")
        sc.border = BORDER
        sc.alignment = Alignment(horizontal="center")
        if in_spec is False:
            sc.fill = FILL_FAIL
            sc.font = FONT_FAIL
            fail_rows += 1
            for col in range(1, 11):
                ws.cell(r, col).fill = FILL_FAIL
        else:
            sc.fill = FILL_PASS
            sc.font = FONT_PASS
        ws.cell(r, 9, clean_cell(spec.get("spec_limit", ""))).border = BORDER
        lt = ws.cell(r, 10, num(row.get("line_total_gbp")))
        lt.number_format = FMT_GBP
        lt.border = BORDER
        r += 1
    last = r - 1

    # foot: out-of-spec tally + Σ line £
    ws.cell(r, 2, "Runs out-of-spec").font = FONT_SUB
    tc = ws.cell(r, 8, fail_rows)
    tc.font = FONT_FAIL if fail_rows else FONT_PASS
    tc.fill = FILL_FAIL if fail_rows else FILL_PASS
    sct = ws.cell(r, 10, f"=SUM(J{first}:J{last})")
    sct.font = Font(bold=True)
    sct.fill = FILL_RESULT
    sct.number_format = FMT_GBP

    # conditional formatting: any '✗' in the In-spec column goes red live
    from openpyxl.formatting.rule import CellIsRule
    ws.conditional_formatting.add(
        f"H{first}:H{last}",
        CellIsRule(operator="equal", formula=['"✗"'], fill=FILL_FAIL, font=FONT_FAIL))
    ws.auto_filter.ref = f"A4:J{last}"
    ws.freeze_panes = "A5"
    back_link(ws, 10)
    return True


# ============================================================================
# TAB — CONTENTS / INDEX (#26)  — built LAST, moved to sheet #1
# ============================================================================
def tab_contents(wb: Workbook, descriptions: Dict[str, str]) -> None:
    """Create the Contents sheet (a hyperlink index to every other tab + a
    one-line description) and MOVE it to position #1. Called after all other
    sheets exist so the full ordered sheet list is known."""
    ws = wb.create_sheet(CONTENTS_SHEET)
    set_widths(ws, {"A": 4, "B": 34, "C": 78})
    title_row(
        ws, "Contents", 3,
        "Click any tab name to jump to it. Each data tab has a '↑ Contents' "
        "link at its top-right to come back. Yellow cells anywhere are editable "
        "inputs; green cells are live formulas.",
    )
    header(ws, 4, ["#", "Tab", "What's on it"])
    r = 5
    n = 1
    for name in wb.sheetnames:
        if name == CONTENTS_SHEET:
            continue
        ws.cell(r, 1, n).border = BORDER
        c = ws.cell(r, 2, name)
        c.hyperlink = f"#'{name}'!A1"
        c.font = FONT_LINK
        c.border = BORDER
        d = ws.cell(r, 3, descriptions.get(name, _default_desc(name)))
        d.alignment = WRAP_TOP
        d.font = FONT_NOTE
        d.border = BORDER
        r += 1
        n += 1
    ws.freeze_panes = "A5"
    # move to the very front
    idx = wb.sheetnames.index(CONTENTS_SHEET)
    if idx != 0:
        wb.move_sheet(CONTENTS_SHEET, -idx)


def _default_desc(name: str) -> str:
    """Fallback one-line description for image / module tabs not in the static map."""
    low = name.lower()
    if low.startswith("module —"):
        return "Per-module Blender render."
    if low.startswith("isometric"):
        return "Representative pipe isometric drawing."
    if low.startswith("render"):
        return "Photoreal Blender render."
    return "Engineering drawing / view."


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

    # ---- NEW high-value engineering + schedule tabs (each self-guards: a tab
    # whose source data is absent is SKIPPED cleanly so any class still builds) --
    skipped: List[str] = []

    def add_tab(name: str, fn) -> None:
        """Run a guarded tab builder; record what it did. Never let one tab kill
        the build — a builder exception is caught + logged as a skip."""
        try:
            ok = fn()
        except Exception as exc:  # noqa: BLE001 — robustness: skip, don't crash
            print(f"  ! {name} raised, skipping: {exc}")
            skipped.append(f"{name} (error: {exc})")
            return
        if ok:
            print(f"  · {name}")
        else:
            print(f"  · {name} — skipped (no source data)")
            skipped.append(f"{name} (no source data)")

    add_tab("Brief compliance", lambda: tab_brief_compliance(wb, state))
    add_tab("Cost waterfall", lambda: tab_cost_waterfall(wb, state))
    add_tab("Spec sheets", lambda: tab_spec_sheets(wb, state))
    add_tab("Panel schedule", lambda: tab_panel_schedule(wb, run_dir))
    # process schedules creates 0..3 sheets; treat >0 as success
    add_tab("Process schedules", lambda: tab_process_schedules(wb, run_dir) > 0)
    add_tab("Line & velocity", lambda: tab_line_velocity(wb, run_dir))

    print("  · Image tabs")
    used_titles = {t.lower() for t in wb.sheetnames}
    specs = collect_image_specs(run_dir)
    img_ok = 0
    for path, ttl, cap in specs:
        png = ensure_png(path, run_dir)
        if png and add_image_tab(wb, run_dir, png, ttl, cap, used_titles):
            img_ok += 1
            print(f"      + {ttl}")

    # ---- CONTENTS (#26): built LAST so the full ordered tab list is known,
    # then moved to sheet #1 with a one-line description + hyperlink per tab ----
    print("  · Contents (sheet #1)")
    tab_contents(wb, _TAB_DESCRIPTIONS)

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
        "skipped_tabs": skipped,
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
    if res.get("skipped_tabs"):
        print(f"  skipped     : {res['skipped_tabs']}")
    print(f"  CHECKS FAIL : {res['fail_count']}")
    for fl in res["fail_labels"]:
        print(f"      FAIL -> {fl}")


if __name__ == "__main__":
    main()
