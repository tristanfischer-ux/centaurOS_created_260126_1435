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
        # Grow the merged subtitle row so a 2-3 line purpose note never clips
        # (Excel does NOT auto-grow a MERGED wrapped cell). Estimate lines from
        # the text length vs the merged width (~5.5 chars per column-width unit).
        approx_cols_wide = max(1, sum(_col_width(ws, ci) for ci in range(1, span + 1)))
        chars_per_line = max(40, approx_cols_wide * 1.05)
        lines = max(1, int(_math.ceil(len(subtitle) / chars_per_line)))
        ws.row_dimensions[2].height = 15 + 13 * min(lines, 4)
        nxt = 3
    return nxt + 1  # leave a blank spacer row


def _col_width(ws: Worksheet, col_idx: int) -> float:
    """Best-effort current width of a column (default 8.43 if unset)."""
    try:
        from openpyxl.utils import get_column_letter
        cd = ws.column_dimensions.get(get_column_letter(col_idx))
        if cd is not None and cd.width:
            return float(cd.width)
    except Exception:  # noqa: BLE001
        pass
    return 8.43


def header(ws: Worksheet, row: int, cols: List[str]) -> None:
    for i, name in enumerate(cols, start=1):
        c = ws.cell(row, i, name)
        c.font = FONT_HEADER
        c.fill = FILL_HEADER
        c.border = BORDER
        c.alignment = Alignment(vertical="center", wrap_text=True)


def sub_banner(ws: Worksheet, row: int, text: str, span: int) -> None:
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=span)
    # A deliberate "=..." live-formula heading (e.g. a Spec-sheet banner referencing the
    # master tag) is written raw; everything else is defanged for display.
    val = text if (isinstance(text, str) and text.startswith("=")) else clean_cell(text)
    c = ws.cell(row, 1, val)
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
FMT_NUM = "#,##0.##"        # thousands sep, drops trailing zeros (62 -> "62", 2.58 -> "2.58")

# CONTENTS hyperlink target / back-link constant.
CONTENTS_SHEET = "Contents"
FONT_LINK = Font(name="Calibri", size=11, color="1F3A5F", underline="single", bold=True)

# One-line descriptions for the Contents index (#26). Image/module tabs fall
# back to _default_desc(); these cover the data tabs by their exact sheet name.
_TAB_DESCRIPTIONS: Dict[str, str] = {
    "Overview": "Quality scorecard, headline metrics & run provenance.",
    "Brief": "The original client brief and the engine's enhanced, structured interpretation that drives the design.",
    "⚠ Checks": "Live arithmetic invariants (== the CLI verifier). RED = numbers don't reconcile.",
    "Part names": "The master parts list — every part named once; every other tab references these cells.",
    "Connection trace": "Which part connects to what — live input/output cell-references with completeness & integrity counts.",
    "Quantities": "Every sized contract quantity with family, basis & source.",
    "Calculations": "Worked calcs grouped by tool — live Excel formulas where structured.",
    "BoM": "THE BILL — what to buy: every line, qty, part/MPN, live Σ line £ total.",
    "Cost": "PRICE PROVENANCE — how each £ was derived (method, factors, confidence).",
    "Brief compliance": "Every brief target metric vs the achieved quantity vs a live PASS/FAIL.",
    "Cost waterfall": "BoM → assembly → factory COGS → install → installed ASP (live running totals).",
    "Inputs & Assumptions": "Editable yellow drivers (price/feed/energy/labour/capex) — the economics model inputs.",
    "Economics": "Live revenue / opex / EBITDA / margin / payback / NPV / IRR — all formulas off the Inputs tab. Opex pie + revenue-vs-EBITDA bar.",
    "Scenarios": "Live FINE scale sweep (0.2x-5x, capex via the tunable scaling exponent — default LINEAR/modular) with per-row payback/NPV/IRR + Low/Central/High price sensitivity. Capex/payback line charts + EBITDA bar.",
    "Investment Analysis": "THE SWEET-SPOT FINDER. Live break-even / viability / investable / NPV-max / £5M-anchor over the sweep + a recommended-deployment callout. IRR-vs-capex (with hurdle lines), NPV, payback & EBITDA-margin curves.",
    "Spec sheets": "SIZING RATIONALE — why each principal is this size: duty, rating, driving calc.",
    "Panel schedule": "Electrical panel / load schedule as a real sortable table.",
    "Process line list": "Process line list — sortable rows cross-referenced to the P&ID.",
    "Process valve list": "Process valve list — tag, type, service, size, fail action.",
    "Process instruments": "Instrument index — tag, ISA, measured variable, range, signal.",
    "Line & velocity": "Every sized run with velocity / volt-drop & within-spec flagging.",
    "Glossary": "Plain-English meaning of every abbreviation (DN, ISA tags, FC/FO, status codes, units).",
    "Risk register": "Hazards & findings (live: physics critic, gate flags, cost) + process-safety risks, S×L scored.",
    "Regulatory": "Compliance-gate verdict + statutory duties derived from jurisdiction + hazards present.",
    "Assembly sequence": "Order-of-works: civils → tankage → mechanical → pipework → electrical → I&C → commissioning.",
}

# A whitelist of CONTROL-CHARS Excel rejects inside a worksheet cell string —
# md tables occasionally carry stray control bytes; strip them so .save never throws.
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")

# Formula-injection defang (CWE-1236): a worksheet cell whose visible text starts with
# one of these is interpreted as a FORMULA by Excel/LibreOffice when the file is opened.
# Display text from the brief / LLM / md-tables is externally-sourced, so a stray
# "=cmd|..." / "+.." / "-.." / "@.." could execute on the customer's machine. We prefix
# such display strings with a zero-width space — they render identically but are inert
# text. Deliberate live formulas are written directly via cell.value = "=..." and NEVER
# pass through clean_cell (verified: no formula write routes through it).
_FORMULA_TRIGGERS = ("=", "+", "-", "@")


def clean_cell(v: Any) -> Any:
    """Make any value safe + tidy for a worksheet DISPLAY cell. Strings get control
    chars stripped, are trimmed, and any leading formula-trigger is defanged with a
    zero-width space (CWE-1236). Non-strings pass through untouched (numbers stay
    numbers). NEVER call this on a deliberate "=..." live-formula string."""
    if isinstance(v, str):
        s = _CTRL.sub("", v).strip().replace("`", "")   # strip markdown code-ticks (Tristan: `201-PR` → 201-PR)
        if s and s[0] in _FORMULA_TRIGGERS:
            s = "​" + s
        return s
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
    # A function token Excel does NOT have (e.g. ceil_to_standard — a tool-internal
    # helper that snaps a value to the next IEC standard rating) cannot become a live
    # Excel formula. Emit None so the caller renders the STATIC computed value, never a
    # broken "=ceil_to_standard(...)" that shows #NAME?. (PI/LOG10/SQRT/... stay live.)
    _excel_funcs = _FUNC_OK | {"pi", "ceiling", "floor", "round", "power", "sum"}
    if any(fn.lower() not in _excel_funcs for fn in func_tokens):
        return None

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
# TAB — BRIEF (original client brief vs the engine-enhanced structured brief)
# ============================================================================
def _brief_paragraphs(md: str) -> List[str]:
    """Split a markdown/prose brief into readable paragraphs, one per row. Blank-line
    separated blocks become paragraphs; a leading '# heading' / list bullet is kept
    verbatim (lightly de-marked). Universal — no class assumptions."""
    out: List[str] = []
    block: List[str] = []
    for raw in str(md or "").splitlines():
        ln = raw.rstrip()
        if not ln.strip():
            if block:
                out.append(" ".join(block).strip())
                block = []
            continue
        s = ln.strip()
        # a markdown heading or list bullet is its OWN paragraph (don't fold into prose)
        if re.match(r"^#{1,6}\s", s) or re.match(r"^[-*]\s", s):
            if block:
                out.append(" ".join(block).strip())
                block = []
            s = re.sub(r"^#{1,6}\s+", "", s)        # drop the ### markers, keep the text
            out.append(s)
        else:
            block.append(s)
    if block:
        out.append(" ".join(block).strip())
    return [p for p in out if p]


def tab_brief(wb: Workbook, run_dir: str) -> None:
    """The ORIGINAL client brief (left) vs the engine's ENHANCED, structured brief
    (right). Original = 0-original-brief.md (prose, one paragraph per row, wrapped);
    enhanced = 1-brief-expanded.json (labelled sections; lists one item per row).
    Falls back gracefully when a file is missing. Universal."""
    ws = wb.create_sheet("Brief")
    set_widths(ws, {"A": 80, "B": 4, "C": 46})
    title_row(
        ws, "Brief — original vs engine-enhanced", 3,
        "The verbatim client brief (left) and the engine's structured, enhanced "
        "interpretation (right) that drives the whole design.",
    )

    # ---- read both sources (gracefully) ----
    orig = ""
    op = os.path.join(run_dir, "0-original-brief.md")
    if os.path.exists(op):
        try:
            orig = open(op, "r").read()
        except Exception:  # noqa: BLE001
            orig = ""
    enh = load_json(os.path.join(run_dir, "1-brief-expanded.json")) or {}

    # ---- column headers ----
    r0 = 4
    oc = ws.cell(r0, 1, "Original brief (verbatim)")
    oc.font = FONT_SUB
    oc.fill = FILL_SUB
    oc.alignment = LEFT_TOP
    ec = ws.cell(r0, 3, "Engine-enhanced brief (structured)")
    ec.font = FONT_SUB
    ec.fill = FILL_SUB
    ec.alignment = LEFT_TOP
    r0 += 1

    # ---- LEFT: original prose, one paragraph per row, wrapped ----
    left_r = r0
    paras = _brief_paragraphs(orig)
    if not paras:
        c = ws.cell(left_r, 1, "— 0-original-brief.md not found —")
        c.font = FONT_NOTE
        c.alignment = WRAP_TOP
        left_r += 1
    else:
        for p in paras:
            c = ws.cell(left_r, 1, clean_cell(p))
            c.alignment = WRAP_TOP
            # grow the row so a long paragraph never clips (col A ≈ 80 wide)
            ws.row_dimensions[left_r].height = 14.5 * min(8, max(1, -(-len(p) // 95)))
            left_r += 1

    # ---- RIGHT: enhanced brief, each key a labelled section ----
    right_r = r0
    SCALAR_KEYS = [
        ("product_summary", "Product summary"),
        ("primary_product", "Primary product"),
        ("construction_materials", "Construction materials"),
    ]
    LIST_KEYS = [
        ("derived_requirements", "Derived requirements"),
        ("operating_conditions", "Operating conditions"),
    ]

    def _label(text: str) -> None:
        nonlocal right_r
        lc = ws.cell(right_r, 3, clean_cell(text))
        lc.font = FONT_SUB
        right_r += 1

    def _value(text: str) -> None:
        nonlocal right_r
        vc = ws.cell(right_r, 3, clean_cell(text))
        vc.alignment = WRAP_TOP
        vc.font = FONT_NOTE
        s = str(text or "")
        ws.row_dimensions[right_r].height = 14.5 * min(6, max(1, -(-len(s) // 55)))
        right_r += 1

    if not enh:
        c = ws.cell(right_r, 3, "— 1-brief-expanded.json not found —")
        c.font = FONT_NOTE
        c.alignment = WRAP_TOP
        right_r += 1
    else:
        for key, label in SCALAR_KEYS:
            v = enh.get(key)
            if v:
                _label(label)
                _value(str(v))
                right_r += 1  # spacer
        for key, label in LIST_KEYS:
            items = enh.get(key)
            if isinstance(items, list) and items:
                _label(label)
                for it in items:
                    if isinstance(it, dict):
                        lbl = (it.get("label") or it.get("key") or "").strip()
                        val = it.get("value")
                        unit = it.get("unit") or ""
                        line = f"{lbl}: {val} {unit}".strip() if lbl else f"{val} {unit}".strip()
                        prov = it.get("provenance") or it.get("confidence")
                        if prov:
                            line += f"   ({prov})"
                    else:
                        line = str(it)
                    _value("• " + line)
                right_r += 1  # spacer
        notes = enh.get("notes")
        if notes:
            _label("Notes")
            _value(str(notes))

    ws.freeze_panes = "A4"
    back_link(ws, 3)


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
                # No numeric target → no LIVE formula possible. But a check the ENGINE
                # itself flagged FAIL (e.g. a closure with status=warn/fail such as
                # capex_within_ceiling: £8.15 M design vs the £5.0 M brief ceiling) must
                # still surface — otherwise the tab silently disagrees with the CLI and
                # hides a real breach. Render it as a STATIC red row (no recompute).
                if c.status == dcl.FAIL:
                    ws.cell(r, 1, clean_cell(c.name)).border = BORDER
                    ws.cell(r, 1).alignment = WRAP_TOP
                    ws.cell(r, 2, num(c.actual) if c.actual is not None else "—").border = BORDER
                    ws.cell(r, 3, "(engine verdict)").border = BORDER
                    ws.cell(r, 4, "—").border = BORDER
                    ws.cell(r, 5, "—").border = BORDER
                    cs = ws.cell(r, 6, "FAIL")
                    cs.border = BORDER
                    cs.font = Font(bold=True)
                    cdet = ws.cell(r, 7, clean_cell(c.detail))
                    cdet.alignment = WRAP_TOP
                    cdet.font = FONT_NOTE
                    cdet.border = BORDER
                    fail_count += 1
                    fail_labels.append(f"[{fam}] {c.name}")
                    for col in range(1, 8):
                        ws.cell(r, col).fill = FILL_FAIL
                    r += 1
                continue  # N/A, or static-fail already rendered — nothing live
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
    # ↑ Contents back-link at col span+1 (=H), clear of the hidden J–M data block.
    back_link(ws, 7)
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
              "Every sized contract quantity with its family, basis and source.")
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
        ws.cell(r, 1, clean_cell(name)).border = BORDER
        ws.cell(r, 2, value).border = BORDER
        ws.cell(r, 3, clean_cell(unit)).border = BORDER
        ws.cell(r, 4, clean_cell(family)).border = BORDER
        ws.cell(r, 5, clean_cell(basis)).border = BORDER
        ws.cell(r, 6, clean_cell(source)).border = BORDER
        cd = ws.cell(r, 7, clean_cell(detail))
        cd.alignment = WRAP_TOP
        cd.font = FONT_NOTE
        cd.border = BORDER
        r += 1
    # number formats (#37) on the Value column — FMT_NUM drops trailing .00 so an
    # integer-valued metric reads "62" not "62.00", while 2.58 still shows "2.58".
    apply_col_formats(ws, 5, {2: FMT_NUM}, r - 1)
    ws.auto_filter.ref = f"A4:G{r - 1}"
    ws.freeze_panes = "A5"
    back_link(ws, 7)


# ============================================================================
# TAB 4 — CALCULATIONS (worked-calcs grouped by tool; live where structured)
# ============================================================================
# ============================================================================
# UNIVERSAL HELPERS — chart styling + worked-calc verification (class-agnostic;
# NO per-archetype logic — these run for every dossier the engine produces)
# ============================================================================
import math as _math
import ast as _ast
import operator as _op

_CHART_PALETTE = ["2F5496", "C0392B", "548235", "7F4FC9", "1F9BD6",
                  "E67E22", "16A085", "8E44AD"]


def style_chart(ch, *, legend="auto", data_labels=False, gridlines=False):
    """Universal chart hygiene. Excel/openpyxl default to varying colour PER
    DATA POINT on a single-series chart — which renders a line as rainbow
    segments AND dumps every category into the legend (the 12-entry "£2.0M…"
    legends Tristan flagged). Force ONE solid colour per series, drop the heavy
    black gridlines, keep axis values, and show a legend only for genuine
    multi-series charts. Applies to every class."""
    try:
        ch.varyColors = False
    except Exception:  # noqa: BLE001
        pass
    series = list(getattr(ch, "series", []) or [])
    for i, s in enumerate(series):
        col = _CHART_PALETTE[i % len(_CHART_PALETTE)]
        try:
            s.graphicalProperties.line.solidFill = col
            s.graphicalProperties.line.width = 28000  # EMU ≈ 2.2 pt
        except Exception:  # noqa: BLE001
            pass
        try:
            s.graphicalProperties.solidFill = col  # bar/area fill (line series ignore)
        except Exception:  # noqa: BLE001
            pass
        try:
            # Excel renders a NEGATIVE bar HOLLOW/white by default (invertIfNegative).
            # A loss-making EBITDA bar must stay the SAME solid colour as the positives
            # (just pointing down) — Tristan flagged the white "EBITDA Low" bar.
            s.invertIfNegative = False
        except Exception:  # noqa: BLE001
            pass
        try:
            s.smooth = False
        except Exception:  # noqa: BLE001
            pass
        try:
            if getattr(s, "marker", None) is not None:
                s.marker.symbol = "none"
        except Exception:  # noqa: BLE001
            pass
    for ax_name in ("x_axis", "y_axis"):
        ax = getattr(ch, ax_name, None)
        if ax is None:
            continue
        try:
            ax.delete = False
            # openpyxl writes an axis TITLE that Excel renders OVERLAPPING the tick labels
            # (no layout reserve) — drop it; the chart title + the formatted tick labels carry
            # the meaning. (Tristan: "Output (t/yr)" / "Capex £" overwriting the tick labels.)
            ax.title = None
            if not gridlines:
                ax.majorGridlines = None
        except Exception:  # noqa: BLE001
            pass
    want = (legend is True) or (legend == "auto" and len(series) > 1)
    try:
        if want:
            from openpyxl.chart.legend import Legend
            if ch.legend is None:
                ch.legend = Legend()
            ch.legend.position = "r"
            ch.legend.overlay = False
        else:
            ch.legend = None
    except Exception:  # noqa: BLE001
        pass
    if data_labels:
        try:
            from openpyxl.chart.label import DataLabelList
            dl = DataLabelList()
            dl.showVal = True            # the value ONLY
            dl.showSerName = False       # NEVER "Series1" (Tristan: ugly + overwrites the title)
            dl.showCatName = False       # the category axis already names each bar
            dl.showLegendKey = False
            dl.showPercent = False
            dl.showBubbleSize = False
            ch.dataLabels = dl
        except Exception:  # noqa: BLE001
            pass
    return ch


# --- worked-calc verification: turn "static" legacy calcs into LIVE, checked ---
_ARITH_OPS = {_ast.Add: _op.add, _ast.Sub: _op.sub, _ast.Mult: _op.mul,
              _ast.Div: _op.truediv, _ast.Pow: _op.pow, _ast.Mod: _op.mod,
              _ast.USub: _op.neg, _ast.UAdd: _op.pos}
_ARITH_FUNCS = {"sqrt": _math.sqrt, "abs": abs, "exp": _math.exp,
                "log": _math.log, "ln": _math.log, "log10": _math.log10,
                "sin": _math.sin, "cos": _math.cos, "tan": _math.tan,
                "min": min, "max": max, "pow": pow}
_EXCEL_FUNCS = {"sqrt": "SQRT", "abs": "ABS", "exp": "EXP", "log": "LN",
                "ln": "LN", "log10": "LOG10", "sin": "SIN", "cos": "COS",
                "tan": "TAN", "min": "MIN", "max": "MAX", "pow": "POWER"}


def _eval_arith(node):
    if isinstance(node, _ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError("non-numeric constant")
    if isinstance(node, _ast.BinOp):
        return _ARITH_OPS[type(node.op)](_eval_arith(node.left), _eval_arith(node.right))
    if isinstance(node, _ast.UnaryOp):
        return _ARITH_OPS[type(node.op)](_eval_arith(node.operand))
    if isinstance(node, _ast.Call):
        fn = getattr(node.func, "id", "")
        if fn.lower() in _ARITH_FUNCS and not node.keywords:
            return _ARITH_FUNCS[fn.lower()](*[_eval_arith(a) for a in node.args])
        raise ValueError("unsupported call")
    if isinstance(node, _ast.Name) and node.id.lower() == "pi":
        return _math.pi
    raise ValueError("unsupported node")


def _clean_substitution(sub):
    """Normalise a worked-calc substitution to a bare arithmetic expression.
    Handles BOTH engine formats universally: pure '(a*b)/c' AND the structured
    'lhs = a x b x c = result UNIT' form (keep the middle expression; × / spaced-x
    → *). No class-specific parsing."""
    s = re.sub(r"^=\s*", "", str(sub or "").strip())
    if s.count("=") >= 2:                       # 'lhs = EXPR = result UNIT'
        s = s.split("=")[1]
    elif "=" in s:                              # 'lhs = expr' OR 'expr = result'
        a, b = s.split("=", 1)
        s = b if re.search(r"[-+*/x^()]", b) else a
    s = s.replace("×", "*").replace(",", "")
    s = re.sub(r"(?<=[\d\)\s])x(?=[\s\d(])", "*", s)   # spaced 'x' = multiply, never max()/exp()
    return s.strip()


def safe_eval_substitution(sub):
    """Evaluate a worked-calc expression (numbers + - * / ^, sqrt/abs/exp/log/trig,
    pi). Returns float, or None when it isn't pure arithmetic. Universal."""
    s = _clean_substitution(sub).replace("^", "**")
    if not s:
        return None
    try:
        return float(_eval_arith(_ast.parse(s, mode="eval").body))
    except Exception:  # noqa: BLE001
        return None


def substitution_to_excel(sub):
    """Convert a worked-calc substitution to a LIVE Excel formula ('=…'), or None
    when it isn't pure arithmetic. Lets a 'static' calc recompute itself in the
    sheet so the value is verifiable + editable. Universal."""
    if safe_eval_substitution(sub) is None:
        return None
    s = _clean_substitution(sub)
    s = re.sub(r"\bpi\b", "PI()", s, flags=re.I)
    for fn, xl in _EXCEL_FUNCS.items():
        s = re.sub(r"\b" + fn + r"\s*\(", xl + "(", s, flags=re.I)
    return "=" + s


def _qty_tokens(s):
    STOP = {"the", "a", "of", "per", "and", "to", "for", "at", "in", "kg", "day",
            "hr", "h", "m", "m2", "m3", "mm", "cm", "kw", "kwh", "gbp", "pct",
            "ratio", "yr", "year", "rate", "total", "design", "value", "load"}
    return {t for t in re.split(r"[^a-z0-9]+", str(s).lower())
            if t and t not in STOP and not t.isdigit()}


def index_design_quantities(state):
    """Flat (key, tokens, value, unit) list from the engineering contract — the
    authoritative design quantities a worked-calc result can be cross-checked
    against. Universal (reads orchestratorContract.quantities for any class)."""
    out = []
    q = ((state.get("orchestratorContract") or {}).get("quantities")) or {}
    if isinstance(q, dict):
        items = list(q.items())
    elif isinstance(q, list):
        items = [(e.get("key"), e) for e in q if isinstance(e, dict)]
    else:
        items = []
    for key, e in items:
        if not isinstance(e, dict):
            continue
        v = e.get("value")
        if isinstance(v, (int, float)):
            out.append((key, _qty_tokens(key), float(v), e.get("unit") or ""))
    return out


def match_design_quantity(label, res_val, qindex):
    """SAFE positive-only cross-check: returns (key, value) ONLY when EVERY label
    token appears in the quantity key AND the values agree within 10% — an
    unambiguous confirmation. Never claims a divergence (a similarly-named but
    DIFFERENT quantity, e.g. MBBR 'Tank Volume' 205 m³ vs rearing
    total_tank_volume 851 m³, must not raise a false alarm). Universal."""
    if not isinstance(res_val, (int, float)):
        return None
    lt = _qty_tokens(label)
    if not lt:
        return None
    for (key, ktoks, val, _unit) in qindex:
        if lt.issubset(ktoks) and val and abs(res_val - val) / abs(val) <= 0.10:
            return (key, val)
    return None


def _unit_from_symbol(sym: str) -> str:
    """Best-effort unit from a snake_case symbol's trailing unit token (solids_load_kg_day →
    kg/day, throughput_m3_h → m³/h). Empty when none recognised. Universal."""
    table = [
        ("kg_day", "kg/day"), ("kg_d", "kg/day"), ("mg_l", "mg/L"), ("g_kg", "g/kg"),
        ("m3_h", "m³/h"), ("m3h", "m³/h"), ("l_day", "L/day"), ("l_s", "L/s"),
        ("kwh", "kWh"), ("kw", "kW"), ("kpa", "kPa"), ("mpa", "MPa"), ("bar", "bar"),
        ("mm", "mm"), ("m2", "m²"), ("m3", "m³"), ("deg_c", "°C"), ("ppt", "ppt"),
        ("pct", "%"), ("hz", "Hz"), ("rpm", "rpm"),
    ]
    s = str(sym or "").lower()
    for suf, u in table:
        if s.endswith("_" + suf) or s == suf:
            return u
    return ""


def _infer_inputs_from_formula(formula, substitution):
    """Recover a legacy worked-calc's named inputs by aligning its FORMULA symbol tokens with
    its SUBSTITUTION number tokens (same expression structure) — so a calc that ships only
    formula+substitution text renders in the SAME yellow-input + live-result style as a
    structured calc (not a divergent 'recomputed live' text block). Returns
    [{symbol, value, unit}] or None when the two don't align 1:1. Universal — no class logic."""
    f = re.sub(r"^\s*[A-Za-z_]\w*\s*=\s*", "", str(formula or "").strip())   # drop a leading 'lhs ='
    s = re.sub(r"^\s*[A-Za-z_]\w*\s*=\s*", "", str(substitution or "").strip())
    s = re.split(r"=", s)[0].strip()                                          # drop a trailing '= result unit'
    if not f or not s:
        return None
    tokre = r"[A-Za-z_]\w*|\d+\.?\d*(?:[eE][-+]?\d+)?|[-+*/^()]|×|x(?=[\s\d(])"
    ft, st = re.findall(tokre, f), re.findall(tokre, s)
    if not ft or len(ft) != len(st):
        return None
    SYM, NUM = re.compile(r"^[A-Za-z_]\w*$"), re.compile(r"^-?\d+\.?\d*(?:[eE][-+]?\d+)?$")
    inputs: Dict[str, Dict] = {}
    for a, b in zip(ft, st):
        a_sym, b_num = bool(SYM.match(a)), bool(NUM.match(b))
        if a_sym and b_num:
            if a not in inputs:
                inputs[a] = {"symbol": a, "value": float(b), "unit": _unit_from_symbol(a)}
        elif a_sym and not b_num:
            if a.lower() != str(b).lower():     # a function name etc. must match verbatim
                return None
        elif not a_sym and a != b:              # operator/constant must be identical in both
            try:
                if float(a) != float(b):
                    return None
            except Exception:
                return None
    return list(inputs.values()) or None


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
    set_widths(ws, {"A": 30, "B": 18, "C": 12, "D": 46, "E": 16, "F": 12, "G": 10, "H": 64})
    title_row(
        ws, "Worked calculations — every value recomputed live + checked", 8,
        "Yellow = editable input. Green col B = LIVE formula. 'Engine value' = the "
        "value the engine stored; Δ should be ~0 (inputs are display-rounded to 4 s.f.). "
        "Legacy calcs (no input map) are RECOMPUTED LIVE from their substitution and "
        "cross-checked against the engine value (col H verdict).",
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
    qindex = index_design_quantities(state)   # authoritative design quantities to cross-check against
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
            if not inputs:
                # recover named inputs from formula+substitution so a LEGACY calc renders in the
                # SAME yellow-input + live-result style as a structured one (not a divergent
                # 'recomputed live' text block). Falls through to the legacy text only if it can't.
                inferred = _infer_inputs_from_formula(formula, w.get("substitution", ""))
                if inferred:
                    inputs = inferred
            res = w.get("result")
            res_val = res.get("value") if isinstance(res, dict) else res
            res_unit = (res.get("unit") if isinstance(res, dict) else w.get("result_unit", "")) or ""

            structured = bool(inputs)

            # ---- calc title row ----
            tc = ws.cell(r, 1, label)
            tc.font = FONT_SUB
            ws.cell(r, 4, formula).font = FONT_MONO
            sub_text = str(w.get("substitution", "") or "")
            xl_formula = substitution_to_excel(sub_text) if not structured else None
            ev_val = safe_eval_substitution(sub_text) if not structured else None
            if not structured:
                marker = "  [recomputed live]" if xl_formula else "  [static — no auto-check]"
                ws.cell(r, 1, label + marker).font = Font(bold=True, italic=True, color="7F7F7F")
            calc_title_row = r
            r += 1

            if not structured:
                # LEGACY calc: show formula + substitution as transparent text, then
                # RECOMPUTE the substitution as a LIVE Excel formula and check it
                # against the engine's stored result. This turns an unchecked
                # printed number ("these values have not been checked") into a
                # self-verifying, editable cell. Universal — works for any tool's
                # worked-calc with a numeric substitution.
                ws.cell(r, 1, "formula").font = FONT_NOTE
                ws.cell(r, 4, str(formula)).font = FONT_MONO
                ws.cell(r, 4).fill = FILL_LEGACY
                r += 1
                ws.cell(r, 1, "substitution").font = FONT_NOTE
                sc = ws.cell(r, 4, sub_text)
                sc.font = FONT_MONO
                sc.fill = FILL_LEGACY
                r += 1
                ws.cell(r, 1, "result").font = FONT_NOTE
                if xl_formula is not None and isinstance(res_val, (int, float)):
                    lc = ws.cell(r, 2, xl_formula)        # LIVE recomputation
                    lc.fill = FILL_RESULT
                    lc.number_format = "#,##0.0000"
                    ws.cell(r, 5, res_val)                # engine value
                    ws.cell(r, 6, f"=B{r}-E{r}").number_format = "#,##0.0000"
                    ws.cell(r, 7, res_unit)
                    drift = (abs(ev_val - res_val) / abs(res_val)
                             if (ev_val is not None and res_val) else 0.0)
                    if drift <= 0.02:
                        verdict, vfont = "✓ recomputed live — maths checks out", FONT_PASS
                        live_count += 1
                    else:
                        verdict = (f"⚠ engine result ≠ its own substitution "
                                   f"({ev_val:.4g} vs {res_val:.4g})")
                        vfont = FONT_FAIL
                        static_count += 1
                    dq = match_design_quantity(label, res_val, qindex)
                    if dq:
                        verdict += f"   ·   confirmed = design {dq[0]}"
                    vc = ws.cell(r, 8, verdict)
                    vc.font = vfont
                    vc.alignment = WRAP_TOP
                else:
                    # non-arithmetic substitution (rare) — keep honest static text
                    static_count += 1
                    ws.cell(r, 5, res_val)
                    ws.cell(r, 7, res_unit)
                    ws.cell(r, 8, "— not auto-checkable (non-numeric substitution)").font = FONT_NOTE
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
                # could not bind every symbol -> fall back to recomputing the
                # SUBSTITUTION as a live Excel formula (same universal check as the
                # legacy path) so the value is still live + verified, not a bare
                # static number. Universal across classes.
                sub_s = str(w.get("substitution", "") or "")
                xl_s = substitution_to_excel(sub_s)
                if xl_s is not None and isinstance(res_val, (int, float)):
                    live_cell.value = xl_s
                    live_cell.fill = FILL_RESULT
                    ws.cell(r, 1, "  = result  [recomputed from substitution]").font = FONT_SUB
                    ev_s = safe_eval_substitution(sub_s)
                    drift_s = (abs(ev_s - res_val) / abs(res_val)
                               if (ev_s is not None and res_val) else 0.0)
                    if drift_s <= 0.02:
                        live_count += 1
                    else:
                        ws.cell(r, 8, f"⚠ engine result ≠ substitution "
                                f"({ev_s:.4g} vs {res_val:.4g})").font = FONT_FAIL
                        static_count += 1
                else:
                    live_cell.value = res_val
                    ws.cell(r, 1, "  = result  [static — unbound symbol]").font = Font(bold=True, italic=True, color="7F7F7F")
                    static_count += 1
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
def tab_connection_trace(wb: Workbook, state: dict, run_dir: str) -> bool:
    """Connection Trace — the ledger's per-part adjacency (Tristan 2026-06-20: "if line 1
    connects to line 3, line 3 should say its input is from line 1; in Excel we should
    trace whole systems this way"). One row per part: what feeds INTO it (by name) and
    what it feeds OUT to (by name), bidirectionally consistent. Ctrl-F any part name to
    follow the chain. Reads connection-ledger.json (authored by connection_ledger.py).
    Returns False (tab skipped) when no ledger is present."""
    led = load_json(os.path.join(run_dir, "connection-ledger.json"))
    if not isinstance(led, dict) or not led.get("adjacency"):
        return False
    adj = led["adjacency"]
    comp = led.get("completeness") or {}
    ri = led.get("referential_integrity") or {}
    incomplete = {c.get("part"): c.get("missing", []) for c in (comp.get("concerns") or [])}

    # tag lookup: part name -> BoM tag (so the trace carries the same tag as the
    # BoM / drawings). Exact name first, then a loose contains-match.
    tag_by_name: Dict[str, str] = {}
    for b in (state.get("requirementsBom") or []):
        if not isinstance(b, dict):
            continue
        tg = clean_cell(b.get("tag", ""))
        if not tg:
            continue
        for key in (b.get("name_human"), b.get("requirement")):
            if key:
                tag_by_name.setdefault(str(key).strip().lower(), tg)

    def _tag_for(nm: str) -> str:
        n = str(nm).strip().lower()
        if n in tag_by_name:
            return tag_by_name[n]
        for k, t in tag_by_name.items():
            if k and (k in n or n in k):
                return t
        return ""

    ws = wb.create_sheet("Connection trace")
    set_widths(ws, {"A": 38, "B": 12, "C": 10, "D": 46, "E": 46, "F": 22})
    title_row(ws, "Connection trace — which part connects to what", 6,
              "The ledger authors every connection. INPUTS / OUTPUTS are LIVE cell-references "
              "to the connected part's own row (col A): select a cell and use Formulas ▸ Trace "
              "Precedents / Trace Dependents to draw the arrows, or click through to navigate. "
              "Each part also carries its Tag. Bidirectionally consistent.")
    # health banner
    sub_banner(ws, 4,
               f"{led.get('count', len(adj))} authored connections   ·   "
               f"completeness: {comp.get('n_concerns', 0)} part(s) missing a required tie   ·   "
               f"referential integrity: {ri.get('n_violations', 0)} broken reference(s)", 6)
    header(ws, 5, ["Part", "Tag", "Status", "Inputs ← (from)", "Outputs → (to)", "Services"])

    # PASS 1 — assign every part a row so inputs/outputs can reference it by cell.
    names_sorted = sorted(adj.keys(), key=lambda s: str(s).lower())
    first_row = 6
    name_to_row = {nm: first_row + i for i, nm in enumerate(names_sorted)}

    def _ref_formula(conn_names) -> Optional[str]:
        """A formula referencing each connected part's A-cell (so Excel can trace it)
        — unknown / boundary endpoints fall back to a quoted literal."""
        parts = []
        for nm in dict.fromkeys(conn_names):
            row = name_to_row.get(nm)
            if row:
                parts.append(f"A{row}")
            else:
                parts.append('"' + str(nm).replace('"', "'") + '"')
        if not parts:
            return None
        return "=" + '&", "&'.join(parts)

    # PASS 2 — write the rows.
    r = first_row
    for name in names_sorted:
        a = adj[name] or {}
        ins = a.get("inputs") or []
        outs = a.get("outputs") or []
        in_list = [str(i.get("from")) for i in ins]
        out_list = [str(o.get("to")) for o in outs]
        svcs = ", ".join(sorted({(i.get("service") or "") for i in ins} |
                                {(o.get("service") or "") for o in outs} - {""})) or "—"
        miss = incomplete.get(name)
        status = "OK" if not miss else "missing: " + ", ".join(miss)
        # Part name + tag REFERENCE the master "Part names" tab where the part is a
        # registered principal (one identity across the workbook); literal fallback for
        # boundary / aggregate endpoints the master doesn't carry.
        _pn = name_ref(name)
        ws.cell(r, 1, _pn if _pn else clean_cell(name)).border = BORDER
        _pt = name_ref(name, "tag")
        ws.cell(r, 2, _pt if _pt else clean_cell(_tag_for(name))).border = BORDER
        sc = ws.cell(r, 3, clean_cell(status))
        sc.border = BORDER
        if miss:
            sc.font = Font(color="C00000", bold=True)
        in_f = _ref_formula(in_list)
        ci = ws.cell(r, 4, in_f if in_f else "—")
        ci.alignment = WRAP_TOP
        ci.border = BORDER
        out_f = _ref_formula(out_list)
        co = ws.cell(r, 5, out_f if out_f else "—")
        co.alignment = WRAP_TOP
        co.border = BORDER
        ws.cell(r, 6, clean_cell(svcs)).border = BORDER
        r += 1
    ws.freeze_panes = "A6"
    ws.auto_filter.ref = f"A5:F{max(6, r - 1)}"
    back_link(ws, 6)
    return True


# ── CANONICAL PART REGISTRY (the BoM tab IS the single source) ────────────────
# tab_bom populates this {tag: {field: "'BoM'!$X$n"}} map as it renders each line,
# so every OTHER part-listing tab (Spec sheets, Panel schedule, Process line/valve/
# instrument lists) can REFERENCE the part's name / tag / unit £ / qty BY CELL rather
# than repeating the string — one canonical identity, fully traceable, and a price
# edit on the BoM propagates everywhere (Tristan 2026-06-21: "referenced parts rather
# than repeated again and again"). Tags that do not resolve fall back to the literal,
# so a tab never breaks. Cleared at the start of each build so a re-run is never stale.
_BOM_REGISTRY: Dict[str, Dict[str, str]] = {}


def _norm_tag(tag) -> str:
    """Normalise a tag for registry lookup — trim + lowercase so 'P-101' / 'p-101 '
    resolve identically across the BoM and the consumer tabs."""
    return str(tag or "").strip().lower()


def bom_ref(tag, field: str = "name") -> Optional[str]:
    """The cross-sheet cell-reference FORMULA (e.g. "='BoM'!$B$7") for a part's field
    on the canonical BoM registry, or None if the tag is not a BoM line. field ∈
    {tag, name, qty, part, unit, line}. Callers write the returned string straight into
    a cell (it carries the leading '='); on None they keep their own literal."""
    rec = _BOM_REGISTRY.get(_norm_tag(tag))
    if not rec or field not in rec:
        return None
    return "=" + rec[field]


# ── MASTER PART-NAME REGISTRY (the "Part names" tab IS the single source) ──────
# Tristan 2026-06-21, stated four times: "a master series of NAMES, and all other
# names referenced in the spreadsheet on different tabs will be referencing the
# names, not using the names from scratch again … when the name is first introduced,
# every single other reference to that name needs to reference that name."
#
# The BoM registry above is keyed by TAG — but the engine carries TWO independent tag
# namespaces (requirementsBom mints catalogue-class tags B-201/FCV-201/SYS; the parts
# manifest mints shape-class tags K-103/I-114), so a TAG can't be the cross-tab join.
# The PART NAME is the one identity every tab and both namespaces share ("Aeration
# Blower" is "Aeration Blower" in the BoM, the drawings, the ledger and the spec sheet).
# So the master is keyed by NORMALISED NAME: the "Part names" tab introduces each
# principal's name ONCE; every other tab references that cell. Edit a name there and it
# propagates across the whole workbook; Formulas ▸ Trace Dependents follows it.
# Principals only — sub-component nouns ("Casing", "Impeller", "Top Head") repeat across
# parents and are NOT global identities; they stay exploded under their parent in the BoM.
_NAME_REG: Dict[str, Dict[str, str]] = {}
# Parallel index by NORMALISED TAG, so a tab that knows only the part's tag (the
# Line & velocity From/To endpoints, a schedule's served-equipment column) can also
# reference the master row. Populated alongside _NAME_REG in tab_parts_master.
_TAG_REG: Dict[str, Dict[str, str]] = {}


def _norm_name(s) -> str:
    """Normalise a human part name to its cross-tab identity key: NFKC-fold, strip the
    ↳ child marker, cut the ' · detail' requirement tail, lowercase, collapse runs of
    whitespace, drop edge punctuation. 'Recirc Pump · 110 kW (78 kW shaft)' and
    'recirc  pump' both → 'recirc pump'."""
    import unicodedata
    t = unicodedata.normalize("NFKC", str(s or "")).replace("↳", " ")
    for sep in ("·", "•", "—", " - ", " | "):
        if sep in t:
            t = t.split(sep)[0]
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t.strip(" .,:;-")


def _clean_name(s) -> str:
    """The display name = the requirement head before the ' · ' detail tail, ↳ stripped.
    Keeps original casing/unicode (e.g. 'Dissolved-O₂ Control Valve')."""
    t = str(s or "").replace("↳", "").strip()
    for sep in ("·", "•"):
        if sep in t:
            t = t.split(sep)[0]
    return t.strip(" .,:;-")


def _detail_tail(s) -> str:
    """Everything AFTER the name head — the ' · 110 kW …' descriptor — or '' if none."""
    t = str(s or "").replace("↳", "").strip()
    for sep in ("·", "•"):
        if sep in t:
            return sep + " " + sep.join(t.split(sep)[1:]).strip()
    return ""


def name_ref(name, field: str = "name") -> Optional[str]:
    """The cross-sheet cell-reference FORMULA (e.g. "='Part names'!$B$7") for a part's
    master NAME, or None when the name is not a registered principal (caller keeps its
    literal). field ∈ {name, tag}. Carries the leading '=' — write it straight to a cell."""
    rec = _NAME_REG.get(_norm_name(name))
    if not rec or field not in rec:
        return None
    return "=" + rec[field]


def tag_ref(tag, field: str = "tag") -> Optional[str]:
    """The cross-sheet cell-reference FORMULA for a part identified by its TAG on the
    master "Part names" tab, or None when the tag is not a registered principal (caller
    keeps its literal). field ∈ {tag, name}. Carries the leading '='."""
    rec = _TAG_REG.get(_norm_tag(tag))
    if not rec or field not in rec:
        return None
    return "=" + rec[field]


def tab_parts_master(wb: Workbook, state: dict, run_dir: str) -> None:
    """THE master list of part NAMES (Tristan 2026-06-21). One row per distinct principal
    part: its canonical Tag + Name typed ONCE here. Populates _NAME_REG so every other
    tab references these cells instead of repeating the string. Built FIRST so all
    consumers can resolve. Principals only (a tag with no '.' suffix whose requirement is
    not a ↳ sub-component)."""
    _NAME_REG.clear()
    _TAG_REG.clear()
    ws = wb.create_sheet("Part names")
    set_widths(ws, {"A": 14, "B": 46, "C": 8, "D": 64})
    title_row(ws, "Part names — the master list", 4,
              "THE single source of every part's name. Each name is typed ONCE here; every "
              "other tab (BoM, Cost, Spec sheets, Connection trace, schedules) REFERENCES these "
              "cells, never repeats the string — edit a name here and it updates across the whole "
              "workbook. Select a Name cell and use Formulas ▸ Trace Dependents to see everywhere "
              "it is used. One row per principal part; sub-components are listed under their parent "
              "on the BoM.")
    header(ws, 4, ["Tag", "Name", "Qty", "Requirement (as stated)"])
    bom = state.get("requirementsBom") or []
    # collect principals in document order, dedup by normalised name (first wins)
    seen: set = set()
    principals: List[dict] = []
    for row in bom:
        if not isinstance(row, dict):
            continue
        tag = str(row.get("tag", "") or "").strip()
        req = str(row.get("requirement", "") or "")
        if "." in tag or req.strip().startswith("↳"):
            continue                         # sub-component / instance — not a master name
        # Connection / pipework lines ("air connection: A → B", tag C01…) are priced in the
        # BoM but are not PARTS — keep them off the name master (the arrow / "connection" noun
        # is the universal signal, independent of class).
        if "→" in req or re.search(r"\bconnection\b", req, re.I):
            continue
        nm = _clean_name(req)
        key = _norm_name(req)
        if not nm or not key or key in seen:
            continue
        seen.add(key)
        principals.append({"tag": tag, "name": nm, "qty": row.get("qty"), "req": req})
    # stable, readable order: by name (the thing the reader scans)
    principals.sort(key=lambda p: p["name"].lower())
    r = 5
    for p in principals:
        ws.cell(r, 1, clean_cell(p["tag"]) or "—").border = BORDER
        nc = ws.cell(r, 2, clean_cell(p["name"]))
        nc.font = FONT_SUB
        nc.border = BORDER
        ws.cell(r, 3, p["qty"]).border = BORDER
        rq = ws.cell(r, 4, clean_cell(p["req"]))
        rq.alignment = WRAP_TOP
        rq.font = FONT_NOTE
        rq.border = BORDER
        _rec = {
            "tag":  f"'Part names'!$A${r}",
            "name": f"'Part names'!$B${r}",
            "row":  str(r),
        }
        _NAME_REG[_norm_name(p["req"])] = _rec
        if p["tag"] and p["tag"] != "—":
            _TAG_REG.setdefault(_norm_tag(p["tag"]), _rec)
        r += 1
    apply_col_formats(ws, 5, {3: FMT_INT}, r - 1)
    ws.auto_filter.ref = f"A4:D{r - 1}"
    ws.freeze_panes = "A5"
    back_link(ws, 4)


def tab_bom(wb: Workbook, state: dict, run_dir: str) -> None:
    _BOM_REGISTRY.clear()
    ws = wb.create_sheet("BoM")
    set_widths(ws, {"A": 12, "B": 50, "C": 8, "D": 28, "E": 8, "F": 12, "G": 12, "H": 50})
    title_row(ws, "Bill of materials", 8,
              "THE PROCUREMENT BILL — what to buy. Every line: tag · requirement · qty · "
              "part / MPN · unit £ · LIVE line £ (=qty×unit) · basis; sub-components explode "
              "under their parent (cost shown 'incl. in parent'). Σ line £ is live at the foot. "
              "→ For HOW each price was derived & how confident, see the 'Cost' tab. "
              "→ For WHY each principal item is sized as it is, see the 'Spec sheets' tab.")
    header(ws, 4, ["Tag", "Requirement", "Qty", "Part", "Status",
                   "Unit £", "Line £", "Basis"])
    bom = state.get("requirementsBom") or []
    r = 5
    first_line_row = r
    for row in bom:
        # Tag column REFERENCES the master "Part names" tag where this is a principal (one
        # identity; the master is the single source of the tag too). Sub-components (P-101.1)
        # and connection lines keep their literal tag (not master principals).
        _btref = tag_ref(row.get("tag", ""))
        ws.cell(r, 1, _btref if _btref else clean_cell(row.get("tag", ""))).border = BORDER
        # Requirement column — the NAME is referenced from the master "Part names" tab
        # (introduced once), with this row's own detail tail (" · 110 kW …") appended, so
        # editing the master name updates the BoM too. Sub-components (↳) and unmatched
        # names keep their literal text (not global identities).
        _req_raw = clean_cell(row.get("requirement", ""))
        _nref = name_ref(row.get("requirement", "")) if not str(
            row.get("requirement", "") or "").strip().startswith("↳") else None
        if _nref:
            _tail = _detail_tail(row.get("requirement", ""))
            _val = (_nref + ' & "  ' + _tail.replace('"', '""') + '"') if _tail else _nref
            rq = ws.cell(r, 2, _val)
        else:
            rq = ws.cell(r, 2, _req_raw)
        rq.alignment = WRAP_TOP
        rq.border = BORDER
        ws.cell(r, 3, row.get("qty")).border = BORDER
        ws.cell(r, 4, clean_cell(row.get("part", ""))).border = BORDER
        ws.cell(r, 5, clean_cell(row.get("status", ""))).border = BORDER
        # A sub-component row (requirement marked "↳") whose cost is rolled into its
        # parent (line_gbp == 0) must NOT show a standalone unit price: the parametric
        # intermediate is often larger than the parent itself (e.g. a £137k "110 kW
        # drive motor" sub-line under a £67.9k pump) and reads to a customer as a wrong
        # number. Show "incl. in parent" instead. Totals are unaffected — the LIVE
        # Σ(line_gbp) ignores the text cell exactly as it ignored the 0.
        _line_raw = row.get("line_gbp")
        _line_num = _line_raw if isinstance(_line_raw, (int, float)) else 0
        _is_subcomp = str(row.get("requirement", "") or "").strip().startswith("↳")
        if _is_subcomp and not _line_num:
            ws.cell(r, 6, "incl. in parent").border = BORDER
            ws.cell(r, 7, "—").border = BORDER
        else:
            ws.cell(r, 6, num(row.get("unit_gbp"))).border = BORDER
            ws.cell(r, 7, num(row.get("line_gbp"))).border = BORDER
        bs = ws.cell(r, 8, clean_cell(row.get("basis", "")))
        bs.alignment = WRAP_TOP
        bs.font = FONT_NOTE
        bs.border = BORDER
        # Register this part's canonical cells so other tabs reference (not repeat) it.
        _rtag = str(row.get("tag", "") or "").strip()
        if _rtag:
            _BOM_REGISTRY.setdefault(_norm_tag(_rtag), {
                "tag":  f"'BoM'!$A${r}",
                "name": f"'BoM'!$B${r}",
                "qty":  f"'BoM'!$C${r}",
                "part": f"'BoM'!$D${r}",
                "unit": f"'BoM'!$F${r}",
                "line": f"'BoM'!$G${r}",
            })
        r += 1
    last_line_row = r - 1

    # LIVE Σ of line £
    ws.cell(r, 1, "Σ TOTAL").font = FONT_SUB
    tot = ws.cell(r, 7, f"=SUM(G{first_line_row}:G{last_line_row})")
    tot.font = Font(bold=True)
    tot.fill = FILL_RESULT
    sum_row = r
    r += 2

    # BUILDING & CIVILS — listed in the BoM/equipment list (Tristan 2026-06-22: "additional items
    # must be in the BoM and equipment list") but DELIBERATELY NOT summed into the raw-materials Σ
    # above: it is INSTALLED civils that bypasses the OEM manufacturing stack. The all-in project
    # capex (equipment installed + building) is on the Cost waterfall.
    _cs_b = state.get("costStack") or {}
    _bld = num(_cs_b.get("building_civils_gbp"))
    if _bld:
        sub_banner(ws, r, "Building & Civils (installed — separate from the raw-materials Σ above)", 8)
        r += 1
        ws.cell(r, 1, "BLDG-001").border = BORDER
        ws.cell(r, 3, 1).border = BORDER
        ws.cell(r, 4, "Insulated steel-frame industrial building — clad walls, insulated roof, "
                      "floor slab, drainage, roller + personnel doors").border = BORDER
        ws.cell(r, 5, "derived").border = BORDER
        ws.cell(r, 6, _bld).border = BORDER
        ws.cell(r, 7, _bld).border = BORDER
        _bn = ws.cell(r, 8, f"installed civils: {int(_cs_b.get('building_footprint_m2') or 0):,} m² "
                            f"footprint × UK-2026 rates; NOT in the raw Σ (bypasses the OEM stack). "
                            f"All-in project capex on the Cost waterfall.")
        _bn.font = FONT_NOTE
        _bn.border = BORDER
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
              "THE PRICE PROVENANCE — how each number was derived and how confident. "
              "Per line: the cost METHOD (catalogue price / estimate / class-reference), the "
              "inputs behind it, the install & contingency FACTORS, and the rollup to installed "
              "cost. Same items as the BoM — this is the audit trail behind every £, NOT a second "
              "bill (quantities & line totals live on the 'BoM' tab; sizing rationale on 'Spec sheets').")
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
        # Label REFERENCES the master "Part names" tab where this cost line names a known
        # principal (one identity); a literal is kept where the costBasis label diverges
        # from the BoM name (e.g. "Circulation Pump" vs "Recirc Pump" — that literal is the
        # visible flag of a name still to be reconciled at source).
        _lref = name_ref(ln.get("label", ""))
        ws.cell(r, 1, _lref if _lref else clean_cell(ln.get("label", ""))).border = BORDER
        ws.cell(r, 2, clean_cell(ln.get("module", ""))).border = BORDER
        # A 0/None cost renders as an em-dash (text) so it never reads as a real £0.
        _cost = num(ln.get("cost_gbp"))
        ws.cell(r, 3, _cost if _cost else "—").border = BORDER
        ws.cell(r, 4, "yes" if ln.get("defensible") else "no").border = BORDER
        ws.cell(r, 5, clean_cell(basis.get("method", ""))).border = BORDER
        inp = basis.get("inputs")
        ws.cell(r, 6, clean_cell(", ".join(map(str, inp)) if isinstance(inp, list) else str(inp or ""))).border = BORDER
        ws.cell(r, 7, clean_cell(basis.get("estimate_class", ""))).border = BORDER
        nt = ws.cell(r, 8, clean_cell(basis.get("notes", "")))
        nt.alignment = WRAP_TOP
        nt.font = FONT_NOTE
        nt.border = BORDER
        r += 1
    last_line = r - 1
    # live Σ
    ws.cell(r, 1, "Σ cost_gbp (live)").font = FONT_SUB
    ts = ws.cell(r, 3, f"=SUM(C{first}:C{r-1})")
    ts.font = Font(bold=True)
    ts.fill = FILL_RESULT
    ts.number_format = FMT_GBP
    # number formats (#37) on the Cost £ column — was rendering bare integers (General)
    apply_col_formats(ws, first, {3: FMT_GBP}, last_line)
    # filterable like the BoM / Quantities tables (header row -> last data row)
    ws.auto_filter.ref = f"A{start}:H{last_line}"
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
    u = u.replace("³", "3").replace("²", "2").replace("·", ".").replace("μ", "u").replace("°", "")
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
        # temperature -> canonical °C (° already stripped above; K not offset-converted, rare)
        "c": ("temp_c", 1.0), "degc": ("temp_c", 1.0), "celsius": ("temp_c", 1.0),
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

    # FMT_NUM on the Target / Achieved metric columns: integer-valued metrics (62 t/yr)
    # read "62" not "62.00", while genuine decimals (FCR 1.37) still show their places.
    apply_col_formats(ws, first, {2: FMT_NUM, 5: FMT_NUM}, r - 1)
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
    steps.append(("= Installed ASP (process equipment)", None,
                  num(cs.get("installed_asp_gbp")),
                  "installed_asp_gbp (anchor — process plant installed price)"))
    # Building & Civils added at INSTALLED level (not through the OEM manufacturing stack) →
    # the ALL-IN project capex (Tristan 2026-06-22: building in the BoM, capex ~£7M all-in).
    bld = num(cs.get("building_civils_gbp")) or 0.0
    if bld:
        steps.append(("+ Building & Civils (installed)", bld, None,
                      "building_civils_gbp — insulated industrial building, floor slab, drainage, "
                      "doors (civils — separate from the equipment OEM stack)"))
        steps.append(("= ALL-IN PROJECT CAPEX", None, num(cs.get("all_in_capex_gbp")),
                      "all_in_capex_gbp (anchor — equipment + building, total project capex)"))

    first = r
    running_row: Optional[int] = None  # row holding the last LIVE running total
    for label, step_amt, anchor, note in steps:
        # clean_cell defangs the leading "=" sentinel on the anchor rows ("= Factory
        # COGS" etc.) so Excel doesn't read them as formulas (the #NAME? bug Tristan
        # caught). The startswith() logic below still tests the raw Python `label`.
        ws.cell(r, 1, clean_cell(label)).border = BORDER
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
# TABS — ECONOMICS MODEL  (Inputs & Assumptions / Economics / Scenarios + charts)
# ============================================================================
# A LIVE, defensible revenue/opex/EBITDA/NPV model. Universal shape:
#     revenue = output_qty × unit_price ;  opex = Σ drivers ;  EBITDA = rev − opex
# RAS is populated with grounded, cited market defaults (£/kg fish + feed/energy/
# labour); a non-RAS class still gets an Economics tab off its own output metric.
#
# Every derived number is a LIVE Excel formula referencing the yellow input cells
# on the "Inputs & Assumptions" tab (stable $-anchored addresses, also exposed as
# WORKBOOK-LEVEL DEFINED NAMES). Edit an input -> the whole chain + every chart
# recomputes. clean_cell() wraps every string; numbers are written directly.
# ----------------------------------------------------------------------------
INPUTS_SHEET = "Inputs & Assumptions"

# Defined-name keys -> the driver each maps to. The actual cell address is filled
# in when the Inputs tab is built, then read by Economics/Scenarios so the two
# tabs stay wired even if the Inputs layout shifts.
_ECON_INPUT_ADDR: Dict[str, str] = {}

# The economics-model input DEFAULTS (mirrored exactly from tab_inputs_assumptions
# so the Python-side sweet-spot pre-compute reproduces what the LIVE formulas show
# at the as-built inputs). These drive ONLY the colouring + the recommended-row pick
# + the few values too awkward to do as a live INDEX/MATCH; the workbook cells
# themselves are all live formulas, so editing an input still re-drives everything.
_ECON_DEFAULTS = {
    "sale_price_ras": 22.0, "feed_price_ras": 2.1, "fcr_ras": 1.37,
    "sale_price_generic": 1.0, "feed_price_generic": 0.0, "fcr_generic": 0.0,
    "energy_price": 0.15, "load_factor": 0.65, "hours": 8760.0,
    "labour": 300000.0, "maint_pct": 3.0, "other_opex": 120000.0,
    "discount_rate": 10.0, "hurdle_rate": 15.0, "project_life": 20.0,
}

# Number of rows in the scale sweep, and its span as a multiple of the as-built
# output. Log-spaced 0.2x .. 5x is a genuine "scale up and down from the current
# plant" curve (Tristan: "best size plant and to scale up and down from £5M capex").
SWEEP_ROWS = 16
SWEEP_LO_MULT = 0.2
SWEEP_HI_MULT = 5.0
# Capex-vs-output scaling exponent n: capex ∝ output^n.
#   n = 1.0  → LINEAR. A MODULAR plant that scales by REPLICATING identical units
#              (more tanks / pumps / treatment skids) — capex per unit of output is
#              constant. This is the DEFAULT: ForgeOS process plants are modular, and
#              the empirical 52 t→72 t RAS data scales ~linearly (exponent ≈1, not 0.6).
#              Modular/linear is the IDEAL (Tristan 2026-06-21): de-risked, testable at
#              small scale, predictable scale-up.
#   n ≈ 0.6  → the Williams/Chilton "six-tenths" law, valid ONLY for MONOLITHIC
#              equipment that scales by getting BIGGER (a single larger vessel/column).
# Exposed as a TUNABLE Inputs cell ('scale_exp') so the investor model shows the capex
# + economics live under either regime — set it to 0.6 to model a monolithic build.
SCALE_EXPONENT = 1.0


def _sweep_outputs(base_q: float) -> List[float]:
    """The log-spaced output points for the scale sweep, base_q×0.2 .. base_q×5.0
    (SWEEP_ROWS points). Log spacing puts equal resolution per doubling — the
    natural axis for a cost-capacity curve."""
    import math
    base = base_q if base_q and base_q > 0 else 1.0
    lo = math.log(base * SWEEP_LO_MULT)
    hi = math.log(base * SWEEP_HI_MULT)
    n = SWEEP_ROWS
    return [math.exp(lo + (hi - lo) * i / (n - 1)) for i in range(n)]


def _annuity_irr(ebitda: float, capex: float, n: float) -> Optional[float]:
    """IRR of a level annuity: capex out at t0, EBITDA in for n years. Same value
    Excel RATE(n, EBITDA, -capex) returns. Bisection (robust, no numpy). Returns
    None for a non-positive-EBITDA row (no real positive IRR)."""
    if ebitda is None or capex is None or ebitda <= 0 or capex <= 0 or n <= 0:
        return None
    lo, hi = 1e-7, 5.0  # 0 .. 500% — wide enough for any sane plant
    # PV(i) = EBITDA*(1-(1+i)^-n)/i is monotone decreasing in i; solve PV==capex
    for _ in range(200):
        mid = (lo + hi) / 2.0
        pv = ebitda * (1 - (1 + mid) ** -n) / mid
        if pv > capex:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def _econ_at(out: float, base_q: float, base_capex: float,
             is_ras: bool) -> Dict[str, Optional[float]]:
    """Pure-Python mirror of one sweep row's economics at output ``out`` — the SAME
    arithmetic the live Excel formulas compute, used to colour cells + pick the
    recommended row. Holds labour fixed (small plants don't shed fixed staff), scales
    energy pro-rata with output, capex via the six-tenths law."""
    d = _ECON_DEFAULTS
    sale = d["sale_price_ras"] if is_ras else d["sale_price_generic"]
    feed_p = d["feed_price_ras"] if is_ras else d["feed_price_generic"]
    fcr = d["fcr_ras"] if is_ras else d["fcr_generic"]
    sale_mult = 1000.0 if is_ras else 1.0
    ratio = (out / base_q) if base_q else 1.0
    capex = base_capex * (ratio ** SCALE_EXPONENT)
    revenue = out * sale_mult * sale
    feed = out * sale_mult * fcr * feed_p
    # connected load scaled pro-rata with output (mirrors the sweep's energy formula)
    energy = _ECON_LOAD_KW * ratio * d["hours"] * d["load_factor"] * d["energy_price"]
    maint = capex * d["maint_pct"] / 100.0
    opex = feed + energy + d["labour"] + maint + d["other_opex"]
    ebitda = revenue - opex
    r = d["discount_rate"] / 100.0
    n = d["project_life"]
    npv = -capex + ebitda * (1 - (1 + r) ** -n) / r
    payback = (capex / ebitda) if ebitda > 0 else None
    irr = _annuity_irr(ebitda, capex, n)
    margin = (ebitda / revenue) if revenue else None
    return {"out": out, "capex": capex, "revenue": revenue, "opex": opex,
            "ebitda": ebitda, "payback": payback, "npv": npv, "irr": irr,
            "margin": margin}


# the connected load (kW) at the as-built plant — set when the Inputs tab resolves
# it (mirrors tab_inputs_assumptions' load_kw), so the Python sweep mirror scales
# energy correctly. Defaults to a safe placeholder until the Inputs tab runs.
_ECON_LOAD_KW = 500.0


def _sweet_spot(state: dict) -> Optional[Dict[str, Any]]:
    """Compute the sweet-spot findings in Python (the SAME maths the workbook shows
    live), for the recommended-deployment callout + threshold colouring. Returns a
    dict of scale findings, or None if no usable output metric. The workbook STILL
    renders these live via INDEX/MATCH over the sweep; this mirror just lets us write
    a human callout + colour the headline cells before Excel recomputes on open."""
    out_qty, _unit, price_unit, _noun = _econ_output_metric(state)
    if not out_qty or out_qty <= 0:
        return None
    is_ras = price_unit == "£/kg"
    cs = state.get("costStack") or {}
    # prefer the ALL-IN project capex (equipment + building) when present, so the financial
    # analysis matches the all-in headline (Tristan 2026-06-22); else the equipment installed.
    base_capex = (num(cs.get("all_in_capex_gbp")) or num(cs.get("installed_asp_gbp"))
                  or num(cs.get("factory_cogs_gbp"))
                  or num(cs.get("raw_materials_bom_gbp")) or 1_000_000.0)
    rows = [_econ_at(o, out_qty, base_capex, is_ras) for o in _sweep_outputs(out_qty)]
    d = _ECON_DEFAULTS

    def first(pred):
        for row in rows:
            if pred(row):
                return row
        return None

    break_even = first(lambda x: x["ebitda"] is not None and x["ebitda"] >= 0)
    viability = first(lambda x: x["irr"] is not None and x["irr"] >= d["discount_rate"] / 100.0)
    investable = first(lambda x: x["irr"] is not None and x["irr"] >= d["hurdle_rate"] / 100.0)
    npv_max = max(rows, key=lambda x: (x["npv"] if x["npv"] is not None else -1e18))
    # is NPV monotone increasing to the top of the range? (RAS: usually yes)
    npv_monotonic = npv_max["out"] >= rows[-1]["out"] - 1e-6

    # the £5M-affordable output and its economics
    five_out = out_qty * (5_000_000.0 / base_capex) ** (1.0 / SCALE_EXPONENT)
    five = _econ_at(five_out, out_qty, base_capex, is_ras)

    # recommended deployment = the investable scale if it exists, else NPV-max
    recommend = investable or npv_max
    return {
        "is_ras": is_ras, "base_q": out_qty, "base_capex": base_capex,
        "rows": rows, "break_even": break_even, "viability": viability,
        "investable": investable, "npv_max": npv_max, "npv_monotonic": npv_monotonic,
        "five": five, "recommend": recommend,
    }


def _econ_output_metric(state: dict) -> Tuple[float, str, str, str]:
    """Resolve the headline OUTPUT the economics model sells, universally.

    Returns (qty, unit, price_unit_label, output_noun). RAS -> (204, 't/yr',
    '£/kg', 'fish'). For a non-RAS class we read the primary brief metric /
    largest production-family contract quantity so the tab still renders a
    generic £/output-unit model. Always returns a positive qty (fallback 1.0)."""
    q = (state.get("orchestratorContract") or {}).get("quantities") or {}
    pclass = ((state.get("orchestratorContract") or {}).get("product_class")
              or "").lower()

    # 1) RAS / aquaculture: annual tonnage of fish, sold £/kg
    if "aquaculture" in pclass or "ras" in pclass or "annual_production_t_yr" in q:
        t = qval(q, "annual_production_t_yr")
        if t:
            return float(t), "t/yr", "£/kg", "fish"

    # 2) generic: take the brief's primary target_performance metric value+unit
    pb = state.get("parsedBrief") or {}
    tp = (pb.get("constraints") or {}).get("target_performance") or {}
    metrics = tp.get("metrics") or ([tp] if tp.get("value") is not None else [])
    if metrics:
        m0 = metrics[0]
        v = num(m0.get("value"))
        if v:
            unit = (m0.get("unit") or "unit").strip()
            return float(v), unit, "£/unit", "output"

    # 3) last resort: the largest production/flow-family contract quantity
    best = None
    for name, qv in q.items():
        if not isinstance(qv, dict):
            continue
        fam = (qv.get("family") or "").lower()
        if fam in ("flow_rate", "production", "throughput", "mass"):
            v = num(qv.get("value"))
            if v and (best is None or v > best[0]):
                best = (float(v), qv.get("unit", "unit"), name)
    if best:
        return best[0], best[1], "£/unit", "output"

    return 1.0, "unit", "£/unit", "output"


def tab_inputs_assumptions(wb: Workbook, state: dict) -> bool:
    """TAB 1 — editable yellow input cells, one per row, driving the whole model.
    Engine-derived values (tonnage, capex, connected load) are pulled from state
    and labelled 'from engine'; market defaults are grounded + cited in the Basis
    column. Every value cell is registered as a workbook DEFINED NAME and its
    address cached in _ECON_INPUT_ADDR for the Economics/Scenarios tabs."""
    q = (state.get("orchestratorContract") or {}).get("quantities") or {}
    cs = state.get("costStack") or {}

    # ---- engine-grounded values (fall back + label as assumption if absent) ----
    out_qty, out_unit, price_unit, out_noun = _econ_output_metric(state)

    capex = num(cs.get("all_in_capex_gbp")) or num(cs.get("installed_asp_gbp"))
    capex_basis = ("from engine · costStack.all_in_capex_gbp (equipment installed + building & civils)"
                   if cs.get("all_in_capex_gbp")
                   else "from engine · costStack.installed_asp_gbp (BoM + assembly + install)")
    if capex is None:
        capex = num(cs.get("factory_cogs_gbp")) or num(cs.get("raw_materials_bom_gbp"))
        capex_basis = "from engine · costStack (installed ASP absent — COGS proxy)"
    if capex is None:
        capex = 1_000_000.0
        capex_basis = "ASSUMPTION · no costStack — placeholder £1.0M, replace"

    # connected electrical load: engine field, else derive from transformer kVA,
    # else a labelled default.
    load_kw = qval(q, "connected_electrical_load_kw")
    load_basis = "from engine · connected_electrical_load_kw"
    if load_kw is None:
        load_kw = qval(q, "total_supply_demand_kw")
        load_basis = "from engine · total_supply_demand_kw (connected load absent)"
    if load_kw is None:
        kva = qval(q, "main_transformer_kva")
        if kva is not None:
            load_kw = round(kva * 0.9, 1)
            load_basis = "ASSUMPTION · main_transformer_kva × 0.9 power-factor (no load field)"
    if load_kw is None:
        load_kw = 500.0
        load_basis = "ASSUMPTION · no electrical field in state — placeholder 500 kW"

    # publish the resolved connected load to the Python sweet-spot mirror so its
    # energy term scales correctly (the workbook is live regardless; this only
    # affects pre-render colouring + the recommended-deployment callout text).
    global _ECON_LOAD_KW
    _ECON_LOAD_KW = float(load_kw)

    # FCR (feed conversion ratio) — only meaningful for a feed-driven biological
    # class; from engine where present.
    fcr = qval(q, "feed_conversion_ratio")
    fcr_basis = "from engine · feed_conversion_ratio"
    if fcr is None:
        fcr = 1.37
        fcr_basis = "ASSUMPTION · from brief (engine field absent)"

    is_ras = price_unit == "£/kg"

    ws = wb.create_sheet(INPUTS_SHEET)
    set_widths(ws, {"A": 34, "B": 14, "C": 12, "D": 74})
    title_row(
        ws, "Inputs & Assumptions — the economics model drivers", 4,
        "EVERY yellow cell is editable. Engine-derived values are labelled "
        "'from engine'; market defaults are grounded + cited in Basis. The "
        "Economics & Scenarios tabs reference these cells with LIVE formulas — "
        "edit one driver and the whole model + every chart recomputes.",
    )
    header(ws, 4, ["Driver", "Value", "Unit", "Basis / source"])
    r = 5

    # rows: (defined_name, label, value, unit, basis, number_format)
    # The fish-price / feed rows are RAS-specific; for a non-RAS class they are
    # still emitted (generic £/unit sale price; feed driver zeroed) so the model
    # shape is universal and the formulas never reference a missing cell.
    rows: List[Tuple[str, str, float, str, str, str]] = []
    rows.append(("out_qty", f"Output volume ({out_noun})", round(out_qty, 4),
                 out_unit, "from engine · primary output metric", FMT_DEC2))
    if is_ras:
        rows.append(("sale_price", "Fish sale price", 22.0, "£/kg",
                     "sashimi-grade yellowtail kingfish (Hamachi), UK food-service "
                     "wholesale; range £18–28/kg", FMT_GBP2))
        rows.append(("feed_price", "Feed price", 2.1, "£/kg",
                     "high-protein marine carnivore aquafeed; range £1.8–2.4/kg",
                     FMT_GBP2))
        rows.append(("fcr", "Feed conversion ratio (FCR)", round(fcr, 3), "kg/kg",
                     fcr_basis, FMT_DEC2))
    else:
        rows.append(("sale_price", "Sale price (per output unit)", 1.0,
                     f"£/{out_unit}",
                     "ASSUMPTION · generic unit price — set to the market value "
                     "for this product (no RAS £/kg default applies)", FMT_GBP2))
        rows.append(("feed_price", "Feedstock price", 0.0, "£/unit",
                     "ASSUMPTION · feedstock cost driver (0 if not feed-driven)",
                     FMT_GBP2))
        rows.append(("fcr", "Feedstock conversion ratio", 0.0, "ratio",
                     "ASSUMPTION · feed-to-output ratio (0 disables the feed term)",
                     FMT_DEC2))
    rows.append(("energy_price", "Energy price", 0.15, "£/kWh",
                 "UK industrial net of the planned on-site renewable micro-grid; "
                 "grid alone ~£0.22/kWh", FMT_GBP2))
    rows.append(("load_kw", "Connected electrical load", round(load_kw, 1), "kW",
                 load_basis, FMT_DEC1))
    rows.append(("load_factor", "Electrical load factor", 0.65, "avg/peak",
                 "continuous RAS duty, average/peak", FMT_DEC2))
    rows.append(("hours", "Operating hours", 8760.0, "h/yr", "continuous",
                 FMT_INT))
    rows.append(("labour", "Labour", 300000.0, "£/yr",
                 "≈8 FTE loaded for a small RAS; scale with tonnage", FMT_GBP))
    rows.append(("maint_pct", "Maintenance", 3.0, "% capex/yr",
                 "process-plant norm", FMT_DEC1))
    rows.append(("other_opex", "Other opex", 120000.0, "£/yr",
                 "LOX, chemicals, juveniles, insurance, overhead", FMT_GBP))
    rows.append(("capex", "Installed capex", round(capex, 0), "£", capex_basis,
                 FMT_GBP))
    rows.append(("scale_exp", "Scaling exponent n  (capex ∝ output^n)",
                 SCALE_EXPONENT, "n",
                 "1.0 = LINEAR — a MODULAR plant scaled by replicating identical units "
                 "(more tanks/pumps/skids); capex per tonne is constant, de-risked + "
                 "testable at small scale (the ForgeOS default; the empirical RAS data "
                 "scales ~linearly). 0.6 = the six-tenths law for MONOLITHIC equipment "
                 "that scales by getting bigger. Edit to model either regime — every "
                 "capex/economics cell on the sweep, solver and £5M anchor is live off "
                 "this.", FMT_DEC2))
    rows.append(("discount_rate", "Discount rate", 10.0, "%",
                 "real WACC for a small infrastructure project", FMT_DEC1))
    rows.append(("hurdle_rate", "Investor hurdle rate (IRR)", 15.0, "%",
                 "the minimum IRR an investor demands before deploying capital — "
                 "the 'investable' bar on the Investment Analysis tab; edit to your "
                 "fund's threshold", FMT_DEC1))
    rows.append(("project_life", "Project life", 20.0, "yr",
                 "asset economic life for the NPV horizon", FMT_DEC1))

    for name, label, value, unit, basis, fmt in rows:
        ws.cell(r, 1, clean_cell(label)).font = FONT_SUB
        vc = ws.cell(r, 2, value)
        vc.fill = FILL_INPUT
        vc.border = BORDER
        vc.number_format = fmt
        addr = f"${get_column_letter(2)}${r}"     # e.g. $B$5 — stable absolute ref
        _ECON_INPUT_ADDR[name] = f"'{INPUTS_SHEET}'!{addr}"
        # workbook-level defined name so a human can also use it in any formula
        try:
            from openpyxl.workbook.defined_name import DefinedName
            dn = f"in_{name}"
            if dn not in wb.defined_names:
                wb.defined_names[dn] = DefinedName(
                    dn, attr_text=f"'{INPUTS_SHEET}'!{addr}")
        except Exception:  # noqa: BLE001 — defined names are a nicety, never fatal
            pass
        ws.cell(r, 3, clean_cell(unit)).border = BORDER
        bs = ws.cell(r, 4, clean_cell(basis))
        bs.alignment = WRAP_TOP
        bs.font = FONT_NOTE
        bs.border = BORDER
        r += 1

    # (Removed the 'Engine bootstrap economics' stub — Tristan 2026-06-21: it only ever showed
    # '—' placeholders; the transparent live model on the Economics tab is the authoritative
    # figure, so an empty engine-stub block is noise. Don't ship a stub.)

    ws.freeze_panes = "A5"
    back_link(ws, 4)
    return True


def _ref(name: str) -> str:
    """The cross-sheet reference to a registered input cell (e.g.
    "'Inputs & Assumptions'!$B$6"). Raises if the input wasn't built — callers
    only run after tab_inputs_assumptions succeeded."""
    return _ECON_INPUT_ADDR[name]


def tab_economics(wb: Workbook, state: dict) -> bool:
    """TAB 2 — every cell a LIVE formula over the Inputs cells. Computes revenue,
    the opex stack, EBITDA + margin, simple payback, a discounted-cashflow NPV
    column (years 0..life) and a live IRR. Plus an opex breakdown sub-table that
    feeds the pie chart."""
    if not _ECON_INPUT_ADDR:
        return False  # Inputs tab didn't build -> nothing to reference

    out_qty, out_unit, price_unit, out_noun = _econ_output_metric(state)
    is_ras = price_unit == "£/kg"
    # output is sold per-kg for RAS (tonnes×1000), else per the metric's own unit
    sale_mult = "*1000" if is_ras else ""

    R = _ref  # local alias
    ws = wb.create_sheet("Economics")
    set_widths(ws, {"A": 34, "B": 18, "C": 12, "D": 60})
    title_row(
        ws, "Economics — live revenue / opex / EBITDA / NPV", 4,
        "Every value is a LIVE formula referencing the yellow cells on the "
        "'Inputs & Assumptions' tab. Edit any input there and every number here "
        "(and the charts) recompute. Money £#,##0; margins 0.0%; years 0.0.",
    )
    r = 4

    # ---- revenue + opex stack ----------------------------------------------
    sub_banner(ws, r, "Annual profit & loss", 4)
    r += 1
    header(ws, r, ["Line", "£ / yr (live)", "Unit", "Formula"])
    r += 1

    # remember key rows so later cells reference them
    rows_addr: Dict[str, int] = {}

    def line(key: str, label: str, formula: str, note: str,
             fmt: str = FMT_GBP, fill=FILL_RESULT) -> None:
        nonlocal r
        ws.cell(r, 1, clean_cell(label)).font = FONT_SUB
        c = ws.cell(r, 2, formula)        # LIVE formula (string starting with '=')
        c.fill = fill
        c.border = BORDER
        c.number_format = fmt
        ws.cell(r, 3, clean_cell("£/yr"))
        nt = ws.cell(r, 4, clean_cell(note))
        nt.alignment = WRAP_TOP
        nt.font = FONT_NOTE
        rows_addr[key] = r
        r += 1

    # revenue = output × (×1000 for tonnes) × sale price
    line("revenue", "Annual revenue",
         f"={R('out_qty')}{sale_mult}*{R('sale_price')}",
         f"output × {'1000 ×' if is_ras else ''} sale price ({price_unit})")
    # feed cost = output × FCR × feed price (RAS: ×1000 kg)
    line("feed", "Feed / feedstock cost",
         f"={R('out_qty')}{sale_mult}*{R('fcr')}*{R('feed_price')}",
         "output × FCR × feed price")
    # energy = connected load × hours × load factor × energy price
    line("energy", "Energy cost",
         f"={R('load_kw')}*{R('hours')}*{R('load_factor')}*{R('energy_price')}",
         "connected load (kW) × hours × load factor × £/kWh")
    line("labour", "Labour", f"={R('labour')}", "from inputs")
    line("maint", "Maintenance",
         f"={R('capex')}*{R('maint_pct')}/100", "capex × maint% / 100")
    line("other", "Other opex", f"={R('other_opex')}", "from inputs")
    # total opex = Σ of the four+ driver rows
    line("opex", "Total opex",
         f"=B{rows_addr['feed']}+B{rows_addr['energy']}+B{rows_addr['labour']}"
         f"+B{rows_addr['maint']}+B{rows_addr['other']}",
         "Σ feed + energy + labour + maintenance + other",
         fill=FILL_CONST)
    # EBITDA = revenue − opex
    line("ebitda", "EBITDA",
         f"=B{rows_addr['revenue']}-B{rows_addr['opex']}",
         "revenue − total opex", fill=FILL_CONST)
    # Red-flag a loss-making base case (negative EBITDA) — the honest headline when
    # the plant is sub-scale (the £5M / 45 t/yr point runs at or below break-even).
    from openpyxl.formatting.rule import CellIsRule as _CIR
    _eb_cell = f"B{rows_addr['ebitda']}"
    ws.conditional_formatting.add(
        f"{_eb_cell}:{_eb_cell}",
        _CIR(operator="lessThan", formula=["0"], fill=FILL_FAIL, font=FONT_FAIL),
    )
    r += 1

    # ---- headline ratios ----------------------------------------------------
    sub_banner(ws, r, "Headline metrics (live)", 4)
    r += 1
    margin_row = r
    ws.cell(r, 1, "EBITDA margin").font = FONT_SUB
    mc = ws.cell(r, 2, f"=B{rows_addr['ebitda']}/B{rows_addr['revenue']}")
    mc.fill = FILL_RESULT
    mc.border = BORDER
    mc.number_format = "0.0%"
    ws.cell(r, 4, clean_cell("EBITDA ÷ revenue")).font = FONT_NOTE
    r += 1

    payback_row = r
    ws.cell(r, 1, "Simple payback").font = FONT_SUB
    # guard divide-by-zero / negative EBITDA -> blank (no payback)
    pc = ws.cell(r, 2,
                 f"=IF(B{rows_addr['ebitda']}>0,{R('capex')}/B{rows_addr['ebitda']},"
                 f'"n/a (EBITDA≤0)")')
    pc.fill = FILL_RESULT
    pc.border = BORDER
    pc.number_format = FMT_DEC1
    ws.cell(r, 3, clean_cell("yr"))
    ws.cell(r, 4, clean_cell("capex ÷ EBITDA (only if EBITDA > 0)")).font = FONT_NOTE
    r += 2

    # ---- NPV / IRR via a discounted cashflow column -------------------------
    sub_banner(ws, r, "Discounted cashflow — NPV & IRR (live)", 4)
    r += 1
    header(ws, r, ["Year", "Cashflow £ (live)", "Discounted £ (live)",
                   "Note"])
    r += 1
    cf_first = r
    life_int = 20
    pl = qval((state.get("orchestratorContract") or {}).get("quantities") or {},
              "project_life_years")
    # life is an editable input; for the static column count we use a fixed 20-row
    # horizon (the model's editable life caps the discount via an IF guard below).
    for y in range(0, life_int + 1):
        ws.cell(r, 1, y).border = BORDER
        if y == 0:
            cf = f"=-{R('capex')}"                       # capex outflow at year 0
            note = "capex outflow"
        else:
            # EBITDA inflow each year, but only while year ≤ editable project life
            cf = f"=IF({y}<={R('project_life')},B{rows_addr['ebitda']},0)"
            note = "EBITDA inflow (within project life)"
        cc = ws.cell(r, 2, cf)
        cc.border = BORDER
        cc.number_format = FMT_GBP
        # discounted = cashflow / (1+rate)^year
        dc = ws.cell(r, 3,
                     f"=B{r}/((1+{R('discount_rate')}/100)^A{r})")
        dc.border = BORDER
        dc.number_format = FMT_GBP
        ws.cell(r, 4, clean_cell(note)).font = FONT_NOTE
        r += 1
    cf_last = r - 1

    # NPV = Σ discounted column ; IRR = live IRR over the (undiscounted) cashflow
    ws.cell(r, 1, "NPV").font = FONT_SUB
    npv_c = ws.cell(r, 3, f"=SUM(C{cf_first}:C{cf_last})")
    npv_c.fill = FILL_RESULT
    npv_c.border = BORDER
    npv_c.number_format = FMT_GBP
    ws.cell(r, 4, clean_cell("Σ discounted cashflow (capex at yr 0 + discounted "
                             "EBITDA)")).font = FONT_NOTE
    npv_row = r
    r += 1
    ws.cell(r, 1, "IRR").font = FONT_SUB
    irr_c = ws.cell(r, 3, f"=IRR(B{cf_first}:B{cf_last})")
    irr_c.fill = FILL_RESULT
    irr_c.border = BORDER
    irr_c.number_format = "0.0%"
    ws.cell(r, 4, clean_cell("live =IRR over the year-0..N cashflow row")).font = FONT_NOTE
    r += 2

    # ---- opex breakdown sub-table (feeds the pie chart) ---------------------
    sub_banner(ws, r, "Opex breakdown (feeds the pie chart)", 4)
    r += 1
    header(ws, r, ["Driver", "£ / yr (live)", "% of opex (live)", ""])
    r += 1
    brk_first = r
    for key, lbl in [("feed", "Feed / feedstock"), ("energy", "Energy"),
                     ("labour", "Labour"), ("maint", "Maintenance"),
                     ("other", "Other")]:
        ws.cell(r, 1, clean_cell(lbl)).border = BORDER
        c = ws.cell(r, 2, f"=B{rows_addr[key]}")
        c.border = BORDER
        c.number_format = FMT_GBP
        pcc = ws.cell(r, 3, f"=B{r}/B{rows_addr['opex']}")
        pcc.border = BORDER
        pcc.number_format = "0.0%"
        r += 1
    brk_last = r - 1

    # ---- charts: opex pie + revenue/opex/EBITDA bar -------------------------
    from openpyxl.chart import PieChart, BarChart, Reference
    # Pie: opex breakdown
    pie = PieChart()
    pie.title = "Opex breakdown"
    pie.height, pie.width = 8, 17   # wider so the category legend has room
    pdata = Reference(ws, min_col=2, min_row=brk_first, max_row=brk_last)
    plabs = Reference(ws, min_col=1, min_row=brk_first, max_row=brk_last)
    pie.add_data(pdata, titles_from_data=False)
    pie.set_categories(plabs)
    from openpyxl.chart.label import DataLabelList
    # Clean pie: the CATEGORY names go in a right-side legend (no collision), the
    # slices carry the PERCENT only. (Tristan: "lots of writing overwriting each
    # other" — putting category names ON a small pie's slices is the collision.)
    dl = DataLabelList()
    dl.showPercent = True
    dl.showCatName = False
    dl.showSerName = False
    dl.showVal = False
    dl.showLegendKey = False
    dl.showBubbleSize = False
    pie.dataLabels = dl
    from openpyxl.chart.legend import Legend
    pie.legend = Legend()
    pie.legend.position = "r"
    pie.legend.overlay = False
    ws.add_chart(pie, f"F{cf_first}")

    # Bar: revenue vs total opex vs EBITDA — build a tiny 3-row helper block so
    # the chart has clean contiguous categories+values.
    bar_first = r + 1
    ws.cell(bar_first, 1, clean_cell("Revenue")).font = FONT_NOTE
    ws.cell(bar_first, 2, f"=B{rows_addr['revenue']}").number_format = FMT_GBP
    ws.cell(bar_first + 1, 1, clean_cell("Total opex")).font = FONT_NOTE
    ws.cell(bar_first + 1, 2, f"=B{rows_addr['opex']}").number_format = FMT_GBP
    ws.cell(bar_first + 2, 1, clean_cell("EBITDA")).font = FONT_NOTE
    ws.cell(bar_first + 2, 2, f"=B{rows_addr['ebitda']}").number_format = FMT_GBP
    bar = BarChart()
    bar.title = "Revenue vs Opex vs EBITDA"
    bar.type = "col"
    bar.height, bar.width = 8, 13
    bdata = Reference(ws, min_col=2, min_row=bar_first, max_row=bar_first + 2)
    blabs = Reference(ws, min_col=1, min_row=bar_first, max_row=bar_first + 2)
    bar.add_data(bdata, titles_from_data=False)
    bar.set_categories(blabs)
    style_chart(bar, legend=None, data_labels=True)  # solid bars + £ labels (EBITDA stays visible even when near break-even)
    ws.add_chart(bar, f"F{cf_first + 16}")

    ws.freeze_panes = "A5"
    back_link(ws, 4)
    return True


def tab_scenarios(wb: Workbook, state: dict) -> bool:
    """TAB 3 — a live scenario explorer: a FINE log-spaced scale sweep (six-tenths
    capex law, 0.2x..5x of the as-built output, ~16 rows) carrying capex / revenue /
    opex / EBITDA / payback / NPV (live annuity DCF) / IRR (live RATE), plus a
    Low/Central/High price-driver block — all LIVE formulas referencing the Inputs
    cells. The sweep's cell ranges are stashed on the worksheet object so the
    Investment Analysis tab can drive its sweet-spot INDEX/MATCH + curves off them.
    Adds capex-vs-scale + payback-vs-scale line charts and a L/C/H EBITDA bar."""
    if not _ECON_INPUT_ADDR:
        return False

    out_qty, out_unit, price_unit, out_noun = _econ_output_metric(state)
    is_ras = price_unit == "£/kg"
    sale_mult = "*1000" if is_ras else ""
    R = _ref

    ws = wb.create_sheet("Scenarios")
    set_widths(ws, {"A": 16, "B": 16, "C": 16, "D": 16, "E": 16, "F": 12,
                    "G": 14, "H": 12, "I": 4, "J": 16, "K": 16, "L": 16, "M": 16})
    title_row(
        ws, "Scenarios — live scale sweep & price sensitivity", 8,
        "LEFT: a FINE log-spaced output sweep (0.2x to 5x the as-built plant; capex "
        "follows capex_ref × (q/q_ref)^n where n = the 'Scaling exponent' Inputs cell, "
        "default 1.0 = LINEAR/modular), with LIVE payback, annuity-DCF NPV and RATE-"
        "based IRR per row. RIGHT: Low/Central/High on the key price drivers. Every cell "
        "is a LIVE formula off the Inputs tab — edit a driver (or the scaling exponent) "
        "and the whole curve, the Investment Analysis tab and the charts all move.",
    )
    r = 4

    # ---- FINE scale sweep ---------------------------------------------------
    base_q = round(out_qty, 6) or 204.0
    sweep = [round(o, 4) for o in _sweep_outputs(base_q)]

    sub_banner(ws, r, f"Output sweep ({out_noun}, {out_unit}) — capex via the tunable "
                      f"scaling exponent (default linear/modular); payback / NPV / IRR live per row", 8)
    r += 1
    header(ws, r, [f"Output ({out_unit})", "Capex £ (live)", "Revenue £ (live)",
                   "Total opex £ (live)", "EBITDA £ (live)", "Payback yr",
                   "NPV £ (live)", "IRR (live)"])
    r += 1
    sweep_first = r
    qref = R("out_qty")
    for qv in sweep:
        # A-relative: this row's output qty drives every other cell on the row.
        ws.cell(r, 1, qv).border = BORDER
        ws.cell(r, 1).number_format = FMT_DEC1
        ws.cell(r, 1).fill = FILL_INPUT     # the sweep point is editable too
        # capex = capex_ref × (q / q_ref)^n  (n = the tunable scale_exp cell; 1.0 = linear)
        cc = ws.cell(r, 2, f"={R('capex')}*(A{r}/{qref})^{R('scale_exp')}")
        cc.border = BORDER
        cc.number_format = FMT_GBP
        # revenue = q × (×1000 for tonnes) × sale price
        rc = ws.cell(r, 3, f"=A{r}{sale_mult}*{R('sale_price')}")
        rc.border = BORDER
        rc.number_format = FMT_GBP
        # opex = feed(q) + energy(load scaled q/q_ref) + labour(FIXED) + maint(capex(q)) + other
        feed = f"A{r}{sale_mult}*{R('fcr')}*{R('feed_price')}"
        energy = (f"{R('load_kw')}*(A{r}/{qref})*{R('hours')}*"
                  f"{R('load_factor')}*{R('energy_price')}")
        maint = f"B{r}*{R('maint_pct')}/100"
        oc = ws.cell(r, 4, f"={feed}+{energy}+{R('labour')}+{maint}+{R('other_opex')}")
        oc.border = BORDER
        oc.number_format = FMT_GBP
        # EBITDA = revenue − opex
        ec = ws.cell(r, 5, f"=C{r}-D{r}")
        ec.border = BORDER
        ec.number_format = FMT_GBP
        # payback = capex / EBITDA (n/a if EBITDA ≤ 0 — small plant is sub-break-even)
        pc = ws.cell(r, 6, f'=IF(E{r}>0,B{r}/E{r},"n/a")')
        pc.border = BORDER
        pc.number_format = FMT_DEC1
        # NPV = live annuity DCF: -capex + EBITDA × (1-(1+r)^-n)/r ; one compact cell
        rr = f"({R('discount_rate')}/100)"
        nn = R("project_life")
        npv = (f"=-B{r}+E{r}*(1-(1+{rr})^-{nn})/{rr}")
        nc = ws.cell(r, 7, npv)
        nc.border = BORDER
        nc.number_format = FMT_GBP
        # IRR = live RATE of the level annuity (capex out t0, EBITDA in for n yrs).
        # RATE() is Newton-solved and DIVERGES from its default 10% guess on steep
        # annuities (a £33M/£10.8M-a-yr row -> IRR ≈ 33% returned -190% with the
        # default seed). We pass a DATA-DERIVED guess = EBITDA/capex (the cash-on-cash
        # return — always a hair above the true annuity IRR, an ideal Newton seed) so
        # it converges across the whole 0.2x-5x sweep. Guard ≤0 EBITDA -> "n/a";
        # IFERROR + MAX(-0.99,…) keep a pathological row from ever rendering absurd.
        irr = (f'=IF(E{r}>0,IFERROR(MAX(-0.99,RATE({nn},E{r},-B{r},0,0,E{r}/B{r})),'
               f'-1),"n/a")')
        ic = ws.cell(r, 8, irr)
        ic.border = BORDER
        ic.number_format = "0.0%"
        r += 1
    sweep_last = r - 1
    # Red-flag every loss-making sweep row (EBITDA < 0) so the sub-scale plants are
    # visually obvious and the sweet-spot crossing reads at a glance.
    from openpyxl.formatting.rule import CellIsRule as _CIR
    ws.conditional_formatting.add(
        f"E{sweep_first}:E{sweep_last}",
        _CIR(operator="lessThan", formula=["0"], fill=FILL_FAIL, font=FONT_FAIL),
    )
    r += 1

    # a numeric payback column the line-chart can plot (text "n/a" breaks a chart
    # series), capped so a near-break-even point doesn't blow the axis.
    sub_banner(ws, r, "Chart helper — payback capped at 40 yr (text 'n/a' breaks a "
                      "chart series)", 8)
    r += 1
    header(ws, r, [f"Output ({out_unit})", "Payback yr (chart)", "", "", "", "",
                   "", ""])
    r += 1
    pay_first = r
    for i, qv in enumerate(sweep):
        src = sweep_first + i
        ws.cell(r, 1, f"=A{src}").number_format = FMT_DEC1
        ws.cell(r, 1).border = BORDER
        # capped numeric payback: ≤0 EBITDA or >40yr -> 40 (off-the-chart marker)
        ws.cell(r, 2,
                f"=IF(E{src}>0,MIN(40,B{src}/E{src}),40)").number_format = FMT_DEC1
        ws.cell(r, 2).border = BORDER
        r += 1
    pay_last = r - 1
    r += 1

    # Stash the sweep geometry so tab_investment_analysis can build live INDEX/MATCH
    # sweet-spot cells + the curves directly off these columns (cols A..H).
    ws._forge_sweep = {                                   # type: ignore[attr-defined]
        "sheet": ws.title, "first": sweep_first, "last": sweep_last,
        "col_out": "A", "col_capex": "B", "col_rev": "C", "col_opex": "D",
        "col_ebitda": "E", "col_payback": "F", "col_npv": "G", "col_irr": "H",
    }

    # ---- Low / Central / High price-driver block ---------------------------
    price_label = "fish price" if is_ras else "sale price"
    sub_banner(ws, r, f"Low / Central / High — {price_label} ±25%, energy ±25%, "
                      "capex ±15% (at the base output)", 8)
    r += 1
    header(ws, r, ["Driver / metric", "Low", "Central", "High", "", "", "", ""])
    r += 1
    # rows: sale price, energy price, capex (the swung inputs), then EBITDA+payback
    # recomputed for each column. Columns: B=Low, C=Central, D=High.
    lo, ce, hi = "B", "C", "D"
    # sale price row
    sp_row = r
    ws.cell(r, 1, clean_cell("Sale price (±25%)")).font = FONT_SUB
    ws.cell(r, 2, f"={R('sale_price')}*0.75").number_format = FMT_GBP2
    ws.cell(r, 3, f"={R('sale_price')}").number_format = FMT_GBP2
    ws.cell(r, 4, f"={R('sale_price')}*1.25").number_format = FMT_GBP2
    for col in (2, 3, 4):
        ws.cell(r, col).border = BORDER
    r += 1
    # energy price row
    ep_row = r
    ws.cell(r, 1, clean_cell("Energy price (±25%)")).font = FONT_SUB
    ws.cell(r, 2, f"={R('energy_price')}*0.75").number_format = FMT_GBP2
    ws.cell(r, 3, f"={R('energy_price')}").number_format = FMT_GBP2
    ws.cell(r, 4, f"={R('energy_price')}*1.25").number_format = FMT_GBP2
    for col in (2, 3, 4):
        ws.cell(r, col).border = BORDER
    r += 1
    # capex row
    cx_row = r
    ws.cell(r, 1, clean_cell("Capex (±15%)")).font = FONT_SUB
    ws.cell(r, 2, f"={R('capex')}*0.85").number_format = FMT_GBP
    ws.cell(r, 3, f"={R('capex')}").number_format = FMT_GBP
    ws.cell(r, 4, f"={R('capex')}*1.15").number_format = FMT_GBP
    for col in (2, 3, 4):
        ws.cell(r, col).border = BORDER
    r += 1
    # NOTE on the sensitivity direction: Low = worst case (low price, HIGH energy,
    # HIGH capex); High = best case. We build EBITDA accordingly per column.
    # revenue per column uses that column's sale price; energy uses the OPPOSITE
    # extreme so 'Low' is genuinely the pessimistic corner.
    rev_row = r
    ws.cell(r, 1, clean_cell("Revenue £ (live)")).font = FONT_SUB
    for col, spcol in ((2, lo), (3, ce), (4, hi)):
        ws.cell(r, col,
                f"={R('out_qty')}{sale_mult}*{spcol}{sp_row}").number_format = FMT_GBP
        ws.cell(r, col).border = BORDER
    r += 1
    # opex per column: energy at the column's energy price, capex-driven maint at
    # the column's capex, feed/labour/other fixed.
    op_row = r
    ws.cell(r, 1, clean_cell("Total opex £ (live)")).font = FONT_SUB
    feed_t = f"{R('out_qty')}{sale_mult}*{R('fcr')}*{R('feed_price')}"
    for col, ecol, ccol in ((2, lo, lo), (3, ce, ce), (4, hi, hi)):
        energy_t = (f"{R('load_kw')}*{R('hours')}*{R('load_factor')}*{ecol}{ep_row}")
        maint_t = f"{ccol}{cx_row}*{R('maint_pct')}/100"
        ws.cell(r, col,
                f"={feed_t}+{energy_t}+{R('labour')}+{maint_t}+{R('other_opex')}"
                ).number_format = FMT_GBP
        ws.cell(r, col).border = BORDER
    r += 1
    # EBITDA per column. WORST corner (Low) = low sale price + HIGH energy + HIGH
    # capex; so for the 'Low' EBITDA use Low revenue but High-energy/High-capex
    # opex. We assemble each corner explicitly for an honest sensitivity.
    eb_row = r
    ws.cell(r, 1, clean_cell("EBITDA £ (live)")).font = FONT_SUB
    # Low corner: rev=Low, opex=High-energy+High-capex
    low_energy = f"{R('load_kw')}*{R('hours')}*{R('load_factor')}*{hi}{ep_row}"
    low_maint = f"{hi}{cx_row}*{R('maint_pct')}/100"
    ws.cell(r, 2,
            f"=B{rev_row}-({feed_t}+{low_energy}+{R('labour')}+{low_maint}+"
            f"{R('other_opex')})").number_format = FMT_GBP
    # Central
    ws.cell(r, 3, f"=C{rev_row}-C{op_row}").number_format = FMT_GBP
    # High corner: rev=High, opex=Low-energy+Low-capex
    hi_energy = f"{R('load_kw')}*{R('hours')}*{R('load_factor')}*{lo}{ep_row}"
    hi_maint = f"{lo}{cx_row}*{R('maint_pct')}/100"
    ws.cell(r, 4,
            f"=D{rev_row}-({feed_t}+{hi_energy}+{R('labour')}+{hi_maint}+"
            f"{R('other_opex')})").number_format = FMT_GBP
    for col in (2, 3, 4):
        ws.cell(r, col).border = BORDER
    r += 1
    # payback per column
    pb_row = r
    ws.cell(r, 1, clean_cell("Payback yr (live)")).font = FONT_SUB
    ws.cell(r, 2, f'=IF(B{eb_row}>0,D{cx_row}/B{eb_row},"n/a")'
            ).number_format = FMT_DEC1      # Low corner used High capex (D col)
    ws.cell(r, 3, f'=IF(C{eb_row}>0,C{cx_row}/C{eb_row},"n/a")'
            ).number_format = FMT_DEC1
    ws.cell(r, 4, f'=IF(D{eb_row}>0,B{cx_row}/D{eb_row},"n/a")'
            ).number_format = FMT_DEC1      # High corner used Low capex (B col)
    for col in (2, 3, 4):
        ws.cell(r, col).border = BORDER
    r += 1

    # ---- Additional what-if scenarios: single-driver sensitivity (tornado),
    #      breakeven price + combined best/worst corners. Every cell is a LIVE
    #      formula off the Inputs tab (Tristan: "a whole series of additional
    #      scenario set-ups... more scenarios done"). Universal — uses the same
    #      driver refs as the sweep, no class-specific logic. -------------------
    q = R('out_qty')

    def _ebitda(sale="", fcr="", feed="", energy="", capex="", labour=""):
        """A LIVE EBITDA formula with an optional ×factor on ONE driver (the rest
        held at the Inputs base): revenue − (feed + energy + labour + capex-maint +
        other)."""
        rev = f"{q}{sale_mult}*{R('sale_price')}{sale}"
        feed_t = f"{q}{sale_mult}*{R('fcr')}{fcr}*{R('feed_price')}{feed}"
        energy_t = f"{R('load_kw')}*{R('hours')}*{R('load_factor')}*{R('energy_price')}{energy}"
        maint_t = f"{R('capex')}{capex}*{R('maint_pct')}/100"
        opex = (f"({feed_t}+{energy_t}+{R('labour')}{labour}+{maint_t}"
                f"+{R('other_opex')})")
        return f"={rev}-{opex}"

    sub_banner(ws, r, "What-if sensitivity — one driver at a time (±20%), with the "
                      "EBITDA swing (tornado magnitude); held at the base output", 8)
    r += 1
    header(ws, r, ["Driver (±20%)", "EBITDA @ −20%", "EBITDA @ base",
                   "EBITDA @ +20%", "Swing £ (|+20 − −20|)", "", "", ""])
    r += 1
    DRIVERS = [
        ("Sale price", "sale"), ("Feed price", "feed"), ("Energy price", "energy"),
        ("Feed-conversion ratio (FCR)", "fcr"), ("Capex (→ maintenance)", "capex"),
        ("Labour", "labour"),
    ]
    for label, key in DRIVERS:
        ws.cell(r, 1, clean_cell(label)).font = FONT_SUB
        ws.cell(r, 2, _ebitda(**{key: "*0.8"})).number_format = FMT_GBP
        ws.cell(r, 3, _ebitda()).number_format = FMT_GBP
        ws.cell(r, 4, _ebitda(**{key: "*1.2"})).number_format = FMT_GBP
        ws.cell(r, 5, f"=ABS(D{r}-B{r})").number_format = FMT_GBP
        for col in range(1, 6):
            ws.cell(r, col).border = BORDER
        r += 1
    r += 1

    sub_banner(ws, r, "Breakeven & combined corners (live)", 8)
    r += 1
    base_opex = (f"({q}{sale_mult}*{R('fcr')}*{R('feed_price')}"
                 f"+{R('load_kw')}*{R('hours')}*{R('load_factor')}*{R('energy_price')}"
                 f"+{R('labour')}+{R('capex')}*{R('maint_pct')}/100+{R('other_opex')})")
    ws.cell(r, 1, clean_cell(f"Breakeven {price_label} ({price_unit})")).font = FONT_SUB
    ws.cell(r, 2, f"={base_opex}/({q}{sale_mult})").number_format = FMT_GBP2
    ws.cell(r, 3, clean_cell("EBITDA = 0 at this price (vs the Inputs price)")).font = FONT_NOTE
    r += 1
    ws.cell(r, 1, clean_cell("Combined corners → EBITDA £")).font = FONT_SUB
    for col, lbl in ((2, "Worst"), (3, "Base"), (4, "Best")):
        ws.cell(r, col, clean_cell(lbl)).font = FONT_NOTE
    r += 1
    worst = _ebitda(sale="*0.8", feed="*1.2", energy="*1.2", capex="*1.15", fcr="*1.1")
    best = _ebitda(sale="*1.2", feed="*0.8", energy="*0.8", capex="*0.85", fcr="*0.9")
    ws.cell(r, 1, clean_cell("EBITDA (all drivers swung together)")).font = FONT_SUB
    ws.cell(r, 2, worst).number_format = FMT_GBP
    ws.cell(r, 3, _ebitda()).number_format = FMT_GBP
    ws.cell(r, 4, best).number_format = FMT_GBP
    for col in range(1, 5):
        ws.cell(r, col).border = BORDER
    r += 2

    # an EBITDA-only contiguous block for the L/C/H bar chart (categories must be
    # the labels Low/Central/High in a column for a clean chart).
    lch_first = r + 1
    ws.cell(lch_first, 1, clean_cell("Low")).font = FONT_NOTE
    ws.cell(lch_first, 2, f"=B{eb_row}").number_format = FMT_GBP
    ws.cell(lch_first + 1, 1, clean_cell("Central")).font = FONT_NOTE
    ws.cell(lch_first + 1, 2, f"=C{eb_row}").number_format = FMT_GBP
    ws.cell(lch_first + 2, 1, clean_cell("High")).font = FONT_NOTE
    ws.cell(lch_first + 2, 2, f"=D{eb_row}").number_format = FMT_GBP

    # ---- charts (anchored right of the 8-col sweep, in cols J+) -------------
    from openpyxl.chart import LineChart, BarChart, Reference
    # 1) capex vs output (line)
    c1 = LineChart()
    c1.title = "Capex vs output"
    c1.height, c1.width = 8, 14
    c1.y_axis.title = "Capex £"
    c1.x_axis.title = f"Output ({out_unit})"
    d1 = Reference(ws, min_col=2, min_row=sweep_first, max_row=sweep_last)
    cats = Reference(ws, min_col=1, min_row=sweep_first, max_row=sweep_last)
    c1.add_data(d1, titles_from_data=False)
    c1.set_categories(cats)
    style_chart(c1, legend=None)  # single solid line, no rainbow, no heavy gridlines
    ws.add_chart(c1, "J4")

    # 2) payback vs output (line) — uses the capped numeric column
    c2 = LineChart()
    c2.title = "Payback vs output"
    c2.height, c2.width = 8, 14
    c2.y_axis.title = "Payback (yr, capped 40)"
    c2.x_axis.title = f"Output ({out_unit})"
    d2 = Reference(ws, min_col=2, min_row=pay_first, max_row=pay_last)
    cats2 = Reference(ws, min_col=1, min_row=pay_first, max_row=pay_last)
    c2.add_data(d2, titles_from_data=False)
    c2.set_categories(cats2)
    style_chart(c2, legend=None)
    ws.add_chart(c2, "J21")

    # 3) Low/Central/High EBITDA (bar)
    c3 = BarChart()
    c3.title = "Scenario EBITDA — Low / Central / High"
    c3.type = "col"
    c3.height, c3.width = 8, 14
    d3 = Reference(ws, min_col=2, min_row=lch_first, max_row=lch_first + 2)
    cats3 = Reference(ws, min_col=1, min_row=lch_first, max_row=lch_first + 2)
    c3.add_data(d3, titles_from_data=False)
    c3.set_categories(cats3)
    style_chart(c3, legend=None, data_labels=True)  # Low/Central/High £ labels on each bar
    ws.add_chart(c3, "J38")

    ws.freeze_panes = "A5"
    back_link(ws, 8)
    return True


# ============================================================================
# TAB — INVESTMENT ANALYSIS  (the SWEET-SPOT FINDER — the headline)
# ============================================================================
# Drives off the FINE scale sweep on the Scenarios tab (stashed cell ranges) to
# answer "what plant size should we build, and where does it become investable?".
# Break-even / viability / investable / NPV-max / £5M-anchor are LIVE INDEX/MATCH
# over the sweep columns (they re-resolve when any Input changes). Four curves
# (IRR-vs-capex with threshold lines, NPV-vs-capex, payback-vs-capex, EBITDA-margin-
# vs-scale) let an investor SEE the crossings. A recommended-deployment callout
# (Python-mirrored prose + live value cells) sits at the top.
# ----------------------------------------------------------------------------
def tab_investment_analysis(wb: Workbook, state: dict) -> bool:
    if not _ECON_INPUT_ADDR:
        return False
    scen = wb["Scenarios"] if "Scenarios" in wb.sheetnames else None
    sw = getattr(scen, "_forge_sweep", None) if scen is not None else None
    if not sw:
        return False  # Scenarios sweep didn't build -> nothing to analyse

    out_qty, out_unit, price_unit, out_noun = _econ_output_metric(state)
    is_ras = price_unit == "£/kg"
    R = _ref
    ss = _sweet_spot(state)  # Python mirror for the prose callout + colouring

    # sweep cell ranges (on the Scenarios tab) — cross-sheet quoted refs
    sh = f"'{sw['sheet']}'"
    f, l = sw["first"], sw["last"]
    OUT = f"{sh}!${sw['col_out']}${f}:${sw['col_out']}${l}"
    CAP = f"{sh}!${sw['col_capex']}${f}:${sw['col_capex']}${l}"
    EBI = f"{sh}!${sw['col_ebitda']}${f}:${sw['col_ebitda']}${l}"
    NPV = f"{sh}!${sw['col_npv']}${f}:${sw['col_npv']}${l}"
    IRRr = f"{sh}!${sw['col_irr']}${f}:${sw['col_irr']}${l}"
    PAY = f"{sh}!${sw['col_payback']}${f}:${sw['col_payback']}${l}"

    ws = wb.create_sheet("Investment Analysis")
    set_widths(ws, {"A": 34, "B": 18, "C": 16, "D": 16, "E": 14, "F": 12,
                    "G": 4, "H": 16, "I": 16, "J": 16, "K": 16, "L": 16})
    title_row(
        ws, "Investment Analysis — the sweet-spot finder", 6,
        "Where does this plant become INVESTABLE, and what size should management "
        "build? Every result below is a LIVE formula over the scale sweep on the "
        "Scenarios tab — edit any Input and the recommended size, the thresholds and "
        "the curves all move. Output unit: " + out_unit + ".",
    )
    r = 4

    # ── ★ CAPEX → MAX OUTPUT SOLVER (Tristan 2026-06-20: "how do you get as much fish
    #    production out for a specific amount of capex?"). The six-tenths cost-capacity
    #    law INVERTED: for a capex budget B, the largest internally-consistent plant
    #    produces out_realised × (B / capex_realised)^(1/0.6). Type a budget in the yellow
    #    cell → read the max tonnage + its LIVE economics. Revenue is exact (qty×price);
    #    operating cost is read off the Scenarios sweep (near-linear in output) so EBITDA /
    #    payback / IRR stay consistent with the rest of the model. Universal.
    CAPX = _ECON_INPUT_ADDR.get("capex")
    OUTQ = _ECON_INPUT_ADDR.get("out_qty")
    SALE = _ECON_INPUT_ADDR.get("sale_price")
    if CAPX and OUTQ and SALE:
        OPX = f"{sh}!${sw['col_opex']}${f}:${sw['col_opex']}${l}"
        OUTr = f"{sh}!${sw['col_out']}${f}:${sw['col_out']}${l}"
        sub_banner(ws, r, "★ CAPEX → MAX OUTPUT — type a capex budget in the yellow cell; "
                          "read the biggest plant it buys + its economics (via the tunable scaling exponent)", 6)
        r += 1
        b_row = r
        ws.cell(r, 1, "Capex budget (EDIT me) £").font = FONT_SUB
        bc = ws.cell(r, 2, f"={CAPX}")
        bc.fill = FILL_INPUT; bc.number_format = FMT_GBP; bc.border = BORDER
        r += 1
        o_row = r
        ws.cell(r, 1, f"→ Max production ({out_unit})").font = FONT_SUB
        oc = ws.cell(r, 2, f"={OUTQ}*(B{b_row}/{CAPX})^(1/{R('scale_exp')})")
        oc.fill = FILL_RESULT; oc.font = Font(bold=True, size=12)
        oc.number_format = FMT_DEC1; oc.border = BORDER
        r += 1
        rev_row = r
        ws.cell(r, 1, "→ Revenue / yr £").border = BORDER
        rc = ws.cell(r, 2, f"=B{o_row}*1000*{SALE}")
        rc.number_format = FMT_GBP; rc.border = BORDER
        r += 1
        opx_row = r
        ws.cell(r, 1, "→ Operating cost / yr £ (interp. from sweep)").border = BORDER
        oxc = ws.cell(r, 2, f"=FORECAST(B{o_row},{OPX},{OUTr})")
        oxc.number_format = FMT_GBP; oxc.border = BORDER
        r += 1
        ebt_row = r
        ws.cell(r, 1, "→ EBITDA / yr £").font = FONT_SUB
        ebc = ws.cell(r, 2, f"=B{rev_row}-B{opx_row}")
        ebc.fill = FILL_RESULT; ebc.number_format = FMT_GBP; ebc.border = BORDER
        r += 1
        ws.cell(r, 1, "→ Simple payback (yr)").border = BORDER
        pbc = ws.cell(r, 2, f'=IF(B{ebt_row}>0,B{b_row}/B{ebt_row},"n/a (EBITDA ≤ 0)")')
        pbc.number_format = FMT_DEC1; pbc.border = BORDER
        r += 1
        _nn = R("project_life")
        ws.cell(r, 1, "→ IRR (annuity)").border = BORDER
        irc = ws.cell(r, 2,
                      f'=IF(B{ebt_row}>0,IFERROR(MAX(-0.99,'
                      f'RATE({_nn},B{ebt_row},-B{b_row},0,0,B{ebt_row}/B{b_row})),-1),"n/a")')
        irc.number_format = "0.0%"; irc.border = BORDER
        r += 2

    # ----------------------------------------------------------------------
    # RECOMMENDED DEPLOYMENT callout (big band) — prose from the Python mirror,
    # live value cells beneath so it stays correct if inputs change.
    # ----------------------------------------------------------------------
    def _fmt_q(v):  # output qty with unit — keep 2 dp for small/fractional outputs
        if v is None:
            return "—"
        prec = 0 if abs(v) >= 10 else 2  # 0.5 t/day must not round to "0"
        return f"{v:,.{prec}f} {out_unit}"

    def _fmt_gbp(v):
        return f"£{v:,.0f}" if v is not None else "—"

    def _fmt_pct(v):
        return f"{v*100:.1f}%" if v is not None else "—"

    def _fmt_yr(v):  # payback years — None/≤0 -> honest text, never "nan"
        return f"{v:.1f} yr" if (v is not None and v > 0) else "n/a (EBITDA ≤ 0)"

    rec = ss["recommend"] if ss else None
    inv = ss["investable"] if ss else None
    five = ss["five"] if ss else None
    npvmax = ss["npv_max"] if ss else None
    callout_lines: List[str] = []
    if ss and rec:
        if inv:
            callout_lines.append(
                f"DEPLOY {_fmt_gbp(rec['capex'])} for {_fmt_q(rec['out'])} "
                f"→ IRR {_fmt_pct(rec['irr'])}, payback "
                f"{_fmt_yr(rec['payback'])} — the sweet spot (first scale clearing the "
                f"{_ECON_DEFAULTS['hurdle_rate']:.0f}% investor hurdle).")
        else:
            callout_lines.append(
                f"DEPLOY {_fmt_gbp(rec['capex'])} for {_fmt_q(rec['out'])} "
                f"→ IRR {_fmt_pct(rec['irr'])}, payback "
                f"{_fmt_yr(rec['payback'])} — the best NPV in range. The "
                f"{_ECON_DEFAULTS['hurdle_rate']:.0f}% investor hurdle is not reached "
                f"anywhere in the 0.2x-5x sweep at the current inputs"
                + (" (set a real sale price on the Inputs tab — the generic £1/unit "
                   "default makes every scale sub-viable)." if not is_ras
                   else ".") )
        # £5M ceiling line
        if five:
            if five["irr"] is None or five["irr"] <= 0.005:
                callout_lines.append(
                    f"At the £5.0M capex ceiling the plant makes only "
                    f"{_fmt_q(five['out'])} and is ~break-even (IRR ≈ 0) — economics "
                    f"turn investable only at larger scale.")
            else:
                callout_lines.append(
                    f"At the £5.0M capex ceiling the plant makes {_fmt_q(five['out'])} "
                    f"at IRR {_fmt_pct(five['irr'])} — "
                    + (f"already above the hurdle." if five['irr'] >= _ECON_DEFAULTS['hurdle_rate']/100
                       else f"below the {_ECON_DEFAULTS['hurdle_rate']:.0f}% hurdle."))
        if inv:
            callout_lines.append(
                f"Economics turn investable above {_fmt_gbp(inv['capex'])} / "
                f"{_fmt_q(inv['out'])}.")
        if ss["npv_monotonic"]:
            callout_lines.append(
                "NOTE: NPV improves monotonically with scale to the top of the "
                "range — the binding constraint here is capital/site, not economics. "
                "Build as large as the site and balance sheet allow.")
    else:
        callout_lines.append("No usable output metric to analyse — sweet-spot "
                             "finder unavailable for this run.")

    # render the callout band
    callout_text = "  ".join(callout_lines)
    ws.merge_cells(start_row=r, start_column=1, end_row=r + 2, end_column=6)
    cc = ws.cell(r, 1, clean_cell("★ RECOMMENDED DEPLOYMENT"))
    cc.font = Font(name="Calibri", size=13, bold=True, color="FFFFFF")
    cc.fill = FILL_TITLE
    cc.alignment = Alignment(vertical="top", wrap_text=True, indent=1)
    r += 3
    ws.merge_cells(start_row=r, start_column=1, end_row=r + 3, end_column=6)
    bc = ws.cell(r, 1, clean_cell(callout_text))
    bc.fill = FILL_RESULT
    bc.alignment = Alignment(vertical="top", wrap_text=True, indent=1)
    bc.font = Font(name="Calibri", size=11, bold=True, color="1F3A5F")
    for rr in range(r, r + 4):
        ws.row_dimensions[rr].height = 22
    r += 5

    # ----------------------------------------------------------------------
    # SWEET-SPOT THRESHOLDS — LIVE over the sweep (INDEX/MATCH).
    # IRR & EBITDA increase monotonically with output, so the "smallest output
    # meeting a threshold" = the first row above where the threshold is crossed:
    #   MATCH(threshold, ascending_range, 1) returns the LAST row ≤ threshold;
    #   +1 indexes the first row ABOVE it. Guard the edge cases with IFERROR.
    # ----------------------------------------------------------------------
    sub_banner(ws, r, "Sweet-spot thresholds — live over the scale sweep "
                      "(Scenarios tab)", 6)
    r += 1
    header(ws, r, ["What", f"Output ({out_unit})", "Capex £", "IRR", "Payback yr",
                   "How it's found"])
    r += 1
    HURDLE = R("hurdle_rate")
    DISC = R("discount_rate")

    def thr_row(label: str, out_formula: str, how: str, pyrow) -> None:
        """One threshold row: live output cell + capex/IRR/payback looked up at
        that same output via INDEX/MATCH-exact, coloured from the Python mirror."""
        nonlocal r
        ws.cell(r, 1, clean_cell(label)).font = FONT_SUB
        ws.cell(r, 1).border = BORDER
        oc = ws.cell(r, 2, out_formula)
        oc.fill = FILL_RESULT
        oc.border = BORDER
        oc.number_format = FMT_DEC1
        # capex / IRR / payback AT that output: INDEX(col, MATCH(thisOutput, OUT, 0)).
        # The matched output is exactly a sweep value (we INDEX the sweep's own out),
        # so an exact MATCH always resolves.
        mref = f"MATCH(B{r},{OUT},0)"
        cap = ws.cell(r, 3, f"=IFERROR(INDEX({CAP},{mref}),\"—\")")
        cap.border = BORDER
        cap.number_format = FMT_GBP
        ic = ws.cell(r, 4, f"=IFERROR(INDEX({IRRr},{mref}),\"—\")")
        ic.border = BORDER
        ic.number_format = "0.0%"
        pc = ws.cell(r, 5, f"=IFERROR(INDEX({PAY},{mref}),\"—\")")
        pc.border = BORDER
        pc.number_format = FMT_DEC1
        nt = ws.cell(r, 6, clean_cell(how))
        nt.font = FONT_NOTE
        nt.alignment = WRAP_TOP
        nt.border = BORDER
        # colour the output cell green if the Python mirror found a real point
        if pyrow is not None:
            oc.fill = FILL_RESULT
        else:
            oc.fill = FILL_CONST
        r += 1

    # break-even scale: smallest output where EBITDA ≥ 0 (EBITDA ascending)
    be_out = (f"=IFERROR(INDEX({OUT},MATCH(0,{EBI},1)+1),"
              f"INDEX({OUT},1))")
    thr_row("Break-even scale (EBITDA ≥ 0)", be_out,
            "first sweep row with EBITDA ≥ 0 (EBITDA rises with scale)",
            ss["break_even"] if ss else None)
    # viability: smallest output where IRR ≥ discount rate
    via_out = (f"=IFERROR(INDEX({OUT},MATCH({DISC}/100,{IRRr},1)+1),\"> range\")")
    thr_row("Viability threshold (IRR ≥ discount rate)", via_out,
            "first row whose IRR clears the discount rate — capital just covers its "
            "cost", ss["viability"] if ss else None)
    # investable: smallest output where IRR ≥ hurdle
    invv_out = (f"=IFERROR(INDEX({OUT},MATCH({HURDLE}/100,{IRRr},1)+1),\"> range\")")
    thr_row("Investable scale (IRR ≥ hurdle)", invv_out,
            "first row whose IRR clears the editable investor hurdle "
            "(Inputs tab) — the SWEET SPOT", ss["investable"] if ss else None)
    # NPV-max scale in range: output at MAX(NPV)
    npvmax_out = f"=INDEX({OUT},MATCH(MAX({NPV}),{NPV},0))"
    thr_row("NPV-max scale (in range)", npvmax_out,
            "output that maximises NPV across the sweep (trends to the top of the "
            "range when economics improve with scale)", ss["npv_max"] if ss else None)
    r += 1

    # ----------------------------------------------------------------------
    # THE £5M ANCHOR — output affordable at £5M (inverse six-tenths) + its metrics.
    # out_5M = out_ref × (5e6 / capex_ref)^(1/0.6). Live off the Inputs capex cell.
    # ----------------------------------------------------------------------
    sub_banner(ws, r, "The £5M capex anchor — what £5.0M buys & how far below "
                      "investable it sits", 6)
    r += 1
    header(ws, r, ["Metric", "Value", "", "", "", ""])
    r += 1
    five_out_row = r
    # output at £5M (live, inverse scaling off the as-built capex+output; exponent is
    # the tunable scale_exp cell — at n=1.0 this is simply out_ref × 5M / capex_ref)
    ws.cell(r, 1, clean_cell(f"Output affordable at £5.0M ({out_unit})")).font = FONT_SUB
    fo = ws.cell(r, 2, f"={R('out_qty')}*(5000000/{R('capex')})^(1/{R('scale_exp')})")
    fo.fill = FILL_RESULT
    fo.border = BORDER
    fo.number_format = FMT_DEC1
    ws.cell(r, 1).border = BORDER
    r += 1
    # the £5M EBITDA / IRR / payback — computed directly (not via the sweep, since
    # the £5M output isn't one of the sweep grid points). All live off Inputs.
    five_q = f"B{five_out_row}"
    qref = R("out_qty")
    sale_mult = "*1000" if is_ras else ""
    feed5 = f"{five_q}{sale_mult}*{R('fcr')}*{R('feed_price')}"
    energy5 = f"{R('load_kw')}*({five_q}/{qref})*{R('hours')}*{R('load_factor')}*{R('energy_price')}"
    maint5 = f"5000000*{R('maint_pct')}/100"
    rev5 = f"{five_q}{sale_mult}*{R('sale_price')}"
    eb5 = f"({rev5})-({feed5}+{energy5}+{R('labour')}+{maint5}+{R('other_opex')})"
    eb5_row = r
    ws.cell(r, 1, clean_cell("EBITDA at £5.0M")).font = FONT_SUB
    ec5 = ws.cell(r, 2, f"={eb5}")
    ec5.fill = FILL_RESULT
    ec5.border = BORDER
    ec5.number_format = FMT_GBP
    ws.cell(r, 1).border = BORDER
    r += 1
    ws.cell(r, 1, clean_cell("IRR at £5.0M")).font = FONT_SUB
    irr5 = ws.cell(r, 2,
                   f'=IF(B{eb5_row}>0,IFERROR(MAX(-0.99,RATE({R("project_life")},'
                   f'B{eb5_row},-5000000,0,0,B{eb5_row}/5000000)),-1),"n/a")')
    irr5.fill = FILL_RESULT
    irr5.border = BORDER
    irr5.number_format = "0.0%"
    ws.cell(r, 1).border = BORDER
    r += 1
    ws.cell(r, 1, clean_cell("Payback at £5.0M")).font = FONT_SUB
    pay5 = ws.cell(r, 2, f'=IF(B{eb5_row}>0,5000000/B{eb5_row},"n/a (EBITDA≤0)")')
    pay5.fill = FILL_RESULT
    pay5.border = BORDER
    pay5.number_format = FMT_DEC1
    ws.cell(r, 1).border = BORDER
    r += 1
    # gap below investable scale (live: investable output − £5M output)
    ws.cell(r, 1, clean_cell(f"Shortfall vs investable scale ({out_unit})")).font = FONT_SUB
    gap = ws.cell(r, 2,
                  f'=IFERROR(INDEX({OUT},MATCH({HURDLE}/100,{IRRr},1)+1)-B{five_out_row},"—")')
    gap.fill = FILL_CONST
    gap.border = BORDER
    gap.number_format = FMT_DEC1
    ws.cell(r, 3, clean_cell("how far the £5M plant sits below the investable size")
            ).font = FONT_NOTE
    ws.cell(r, 1).border = BORDER
    r += 2

    # ----------------------------------------------------------------------
    # "What moves the sweet spot" note — the 2-3 most sensitive inputs.
    # ----------------------------------------------------------------------
    sub_banner(ws, r, "What moves the sweet spot", 6)
    r += 1
    movers = (
        "Revenue scales linearly with the sale price and 1:1 with output, so the "
        "SALE PRICE is the dominant lever — a 25% lift pulls the investable scale "
        "sharply DOWN (smaller plant clears the hurdle). ENERGY price + connected "
        "load set the largest variable-opex line and bite hardest at small scale "
        "where fixed labour dominates margin. CAPEX (and its six-tenths exponent) "
        "sets the absolute investment and the maintenance line. Flex these three on "
        "the Inputs tab and watch every threshold + curve below move."
    ) if is_ras else (
        "The SALE PRICE per output unit is the dominant lever (revenue is linear in "
        "it and in output). ENERGY price + connected load set the largest variable-"
        "opex line. CAPEX and its six-tenths exponent set the absolute investment "
        "and the maintenance line. Flex these on the Inputs tab — every threshold + "
        "curve moves live."
    )
    ws.merge_cells(start_row=r, start_column=1, end_row=r + 2, end_column=6)
    mc = ws.cell(r, 1, clean_cell(movers))
    mc.alignment = Alignment(vertical="top", wrap_text=True, indent=1)
    mc.font = FONT_NOTE
    r += 4

    # ----------------------------------------------------------------------
    # CHART HELPER BLOCK (cols H..L) — a contiguous live mirror of the sweep plus
    # two constant threshold series (discount-rate line + hurdle line) so the
    # IRR-vs-capex chart shows the crossings AS the viability + investable points.
    # Built on THIS tab (cols H+) so every chart series is contiguous & live.
    # ----------------------------------------------------------------------
    hh = r  # helper header row
    ws.cell(hh, 8, clean_cell("Capex £")).font = FONT_SUB
    ws.cell(hh, 9, clean_cell(f"Output {out_unit}")).font = FONT_SUB
    ws.cell(hh, 10, clean_cell("IRR")).font = FONT_SUB
    ws.cell(hh, 11, clean_cell("Discount-rate line")).font = FONT_SUB
    ws.cell(hh, 12, clean_cell("Hurdle line")).font = FONT_SUB
    ws.cell(hh, 13, clean_cell("NPV £")).font = FONT_SUB
    ws.cell(hh, 14, clean_cell("Payback yr (cap 40)")).font = FONT_SUB
    ws.cell(hh, 15, clean_cell("EBITDA margin")).font = FONT_SUB
    hfirst = hh + 1
    n_rows = l - f + 1
    for i in range(n_rows):
        src = f + i  # the sweep source row on the Scenarios tab
        rr = hfirst + i
        # capex (x-axis) + output, mirrored live from the sweep
        ws.cell(rr, 8, f"={sh}!{sw['col_capex']}{src}").number_format = FMT_GBP
        ws.cell(rr, 9, f"={sh}!{sw['col_out']}{src}").number_format = FMT_DEC1
        # IRR — coerce a non-numeric ("n/a") to a plottable NA() so the line breaks
        ws.cell(rr, 10,
                f'=IFERROR(N({sh}!{sw["col_irr"]}{src})+0,NA())').number_format = "0.0%"
        # threshold constant series across the same x-range
        ws.cell(rr, 11, f"={DISC}/100").number_format = "0.0%"
        ws.cell(rr, 12, f"={HURDLE}/100").number_format = "0.0%"
        # NPV mirror
        ws.cell(rr, 13, f"={sh}!{sw['col_npv']}{src}").number_format = FMT_GBP
        # payback capped (text n/a -> 40 so the series plots)
        ws.cell(rr, 14,
                f'=IF({sh}!{sw["col_ebitda"]}{src}>0,'
                f'MIN(40,{sh}!{sw["col_capex"]}{src}/{sh}!{sw["col_ebitda"]}{src}),40)'
                ).number_format = FMT_DEC1
        # EBITDA margin = EBITDA / revenue
        ws.cell(rr, 15,
                f'=IFERROR({sh}!{sw["col_ebitda"]}{src}/{sh}!{sw["col_rev"]}{src},0)'
                ).number_format = "0.0%"
    hlast = hfirst + n_rows - 1

    # ----------------------------------------------------------------------
    # THE CURVES — ScatterChart on a capex / scale x-axis. Threshold lines are
    # constant-value series; their crossing with the IRR curve IS the viability
    # + investable point.
    # ----------------------------------------------------------------------
    from openpyxl.chart import ScatterChart, LineChart, Reference, Series

    def _scatter(title, x_title, y_title, x_col, y_cols_fills, num_fmt="0.0%"):
        ch = ScatterChart()
        ch.title = title
        ch.height, ch.width = 8.5, 15
        ch.x_axis.title = x_title
        ch.y_axis.title = y_title
        ch.x_axis.delete = False
        ch.y_axis.delete = False
        xref = Reference(ws, min_col=x_col, min_row=hfirst, max_row=hlast)
        for (ycol, name) in y_cols_fills:
            yref = Reference(ws, min_col=ycol, min_row=hfirst, max_row=hlast)
            s = Series(yref, xref, title=name)
            ch.series.append(s)
        return ch

    # 1) IRR vs capex with the two threshold lines (the crossings)
    c1 = _scatter("IRR vs capex — crossings = viability & investable points",
                  "Capex £", "IRR",
                  8, [(10, "IRR"), (11, "Discount rate"), (12, "Investor hurdle")])
    # straight-line connectors so the threshold series read as horizontal lines
    for s in c1.series:
        s.smooth = False
        s.marker.symbol = "none"
    style_chart(c1, legend=True)  # 3 genuine series (IRR / discount / hurdle) — keep legend, kill per-point colours
    ws.add_chart(c1, f"A{hh}")

    # 2) NPV vs capex (marks the NPV-max)
    c2 = _scatter("NPV vs capex — peak = NPV-max scale", "Capex £", "NPV £",
                  8, [(13, "NPV")], num_fmt=FMT_GBP)
    for s in c2.series:
        s.smooth = False
    style_chart(c2, legend=None)  # single NPV curve — no per-point legend (was dumping every capex value)
    ws.add_chart(c2, f"A{hh+18}")

    # 3) Payback vs capex
    c3 = _scatter("Payback vs capex", "Capex £", "Payback (yr, cap 40)",
                  8, [(14, "Payback")], num_fmt=FMT_DEC1)
    for s in c3.series:
        s.smooth = False
    style_chart(c3, legend=None)
    ws.add_chart(c3, f"A{hh+36}")

    # 4) EBITDA margin vs scale (output on x)
    c4 = _scatter("EBITDA margin vs scale", f"Output ({out_unit})", "EBITDA margin",
                  9, [(15, "EBITDA margin")])
    for s in c4.series:
        s.smooth = False
    style_chart(c4, legend=None)
    ws.add_chart(c4, f"A{hh+54}")

    ws.freeze_panes = "A4"
    back_link(ws, 6)
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
        "THE SIZING RATIONALE — why each big-ticket item is the size it is. One block per "
        "PRINCIPAL line (sub-components excluded): tag · duty / rating (from the requirement) "
        "· qty · unit £ · LIVE line £ · the driving worked-calc that sized it (basis) · the "
        "part / MPN. NOT a bill (full line-by-line buy list is the 'BoM' tab) and NOT a price "
        "audit (cost method & confidence is the 'Cost' tab) — this is the engineering 'why'.",
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

        # ---- block header (the canonical TAG band — the stable identity) ----
        # The banner REFERENCES the master "Part names" tag where this is a principal (so the
        # tag is sourced once); literal fallback for anything the master doesn't carry.
        sub_banner(ws, r, tag_ref(tag) or f"{tag}", 8)
        r += 1
        header(ws, r, ["Name (→ Part names)", "Status", "Qty", "Unit £", "Line £",
                       "Material", "Part / MPN", "Driving worked-calc (basis)"])
        r += 1
        # The single data row for this principal. Name REFERENCES the master "Part names"
        # tab (the one place the name is typed); Qty / Unit £ REFERENCE the canonical BoM
        # registry by tag (a BoM price/qty edit propagates here). Literal fallbacks so the
        # tab never breaks.
        _name_ref = name_ref(req) or bom_ref(tag, "name")
        nc = ws.cell(r, 1, _name_ref if _name_ref else (req or "spec"))
        nc.font = FONT_SUB
        nc.border = BORDER
        ws.cell(r, 2, clean_cell(status)).border = BORDER
        _qty_ref = bom_ref(tag, "qty")
        qc = ws.cell(r, 3, _qty_ref if _qty_ref else qty)
        qc.fill = FILL_RESULT if _qty_ref else FILL_INPUT
        qc.border = BORDER
        _unit_ref = bom_ref(tag, "unit")
        uc = ws.cell(r, 4, _unit_ref if _unit_ref else unit_gbp)
        uc.fill = FILL_RESULT if _unit_ref else FILL_INPUT
        uc.border = BORDER
        # Line £ LIVE = qty × unit £ when both cells carry a value/ref; else the stored value
        _have_q = bool(_qty_ref) or qty is not None
        _have_u = bool(_unit_ref) or unit_gbp is not None
        if _have_q and _have_u:
            lc = ws.cell(r, 5, f"=C{r}*D{r}")
        else:
            lc = ws.cell(r, 5, line_gbp)
        lc.fill = FILL_RESULT
        lc.border = BORDER
        line_total_rows.append(r)
        ws.cell(r, 6, clean_cell(material)).border = BORDER
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
                # Referencify: a cell that IS a master part name (or its tag) becomes a
                # cell-reference to "Part names" — so md-rendered schedules (instrument index,
                # valve list, panel schedule) also point at the one master, not a repeat.
                # Skips the spec ✓/✗ column (left for the live in-spec formula). Literal kept
                # for anything not a registered principal.
                _ref = None
                if not (spec_col is not None and ci + 1 == spec_col) and isinstance(txt, str) and txt.strip():
                    _ref = name_ref(txt) or tag_ref(txt)
                cell.value = _ref if _ref else txt
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
    # auto-fit row heights so long wrapped text (Service / Description) is not
    # clipped — cells already carry wrap_text (WRAP_TOP) but openpyxl never grows
    # the row to fit it, which read as truncation ("Dual Cornell drain tank…").
    # Estimate wrapped lines per cell from the column width. Universal — keys off
    # column width + content length, no class-specific assumptions.
    for rr in range(body_first, r):
        max_lines = 1
        for ci in range(ncol):
            v = ws.cell(rr, ci + 1).value
            if v is None:
                continue
            cw = ws.column_dimensions[get_column_letter(ci + 1)].width or 12
            approx = max(6, int((cw - 1) * 1.05))   # ~chars per line at this width
            lines = max(1 + str(v).count("\n"), -(-len(str(v)) // approx))
            if lines > max_lines:
                max_lines = lines
        if max_lines > 1:
            ws.row_dimensions[rr].height = min(max_lines, 6) * 14.5
    return r, body_first


# Universal engineering-nomenclature glossary. Standard across EVERY archetype
# (it is industry abbreviation, not RAS-specific) — Tristan: "what does DN stand
# for?", "I don't know what ISA stands for", "abbreviations glossary". Grouped so
# related terms sit together; British spelling; every term spelled out in full.
_GLOSSARY: List[tuple] = [
    ("Pipe sizes & materials", [
        ("DN", "Diameter Nominal — the nominal bore size of a pipe / valve in millimetres (e.g. DN200 ≈ 200 mm bore). A size label, not the exact internal diameter."),
        ("NB", "Nominal Bore — same idea as DN; the nominal internal pipe size."),
        ("CS", "Carbon steel — the default structural / pipe steel where no corrosion or hygiene driver applies."),
        ("316L", "316L stainless steel — low-carbon austenitic stainless; the corrosion-resistant grade for process-water, oxidiser and hygienic duties."),
        ("304 / 304L", "304 / 304L stainless steel — general-purpose austenitic stainless."),
        ("DUPLEX", "Duplex stainless steel — high-strength, chloride-corrosion-resistant stainless for seawater / brackish duties."),
        ("HDPE / PE100", "High-density polyethylene (PE100 grade) — tough, corrosion-free thermoplastic pipe for water / effluent at low pressure."),
        ("PP", "Polypropylene — chemical-resistant thermoplastic, used for ducting, linings and pipe-insulation lagging."),
        ("FRP / GRP", "Fibre-reinforced plastic (glass-reinforced plastic) — moulded composite for tanks and vessels."),
        ("PVC / uPVC", "Poly(vinyl chloride) pipe grades — low-cost drainage / cold-water pipe."),
    ]),
    ("Instrumentation (ISA tags)", [
        ("ISA", "The instrument-tag convention to ISA-5.1 (International Society of Automation) — the letter code naming what an instrument measures and does."),
        ("LT", "Level Transmitter — measures liquid level."),
        ("TT", "Temperature Transmitter — measures temperature."),
        ("PT", "Pressure Transmitter — measures pressure."),
        ("FT", "Flow Transmitter — measures flow rate."),
        ("AT", "Analyser Transmitter — measures a composition variable, e.g. dissolved oxygen, pH or redox."),
        ("AT (pH) / AT (ORP)", "Analyser variant: pH, or oxidation-reduction (redox) potential."),
        ("LSL / LSH", "Level Switch Low / Level Switch High — a discrete level alarm/trip."),
        ("4–20 mA", "The standard analogue field-signal current loop (4 mA = zero, 20 mA = full scale)."),
        ("HART", "Highway Addressable Remote Transducer — a digital signal superimposed on the 4–20 mA loop."),
        ("PLC / SCADA", "Programmable Logic Controller / Supervisory Control And Data Acquisition — the plant control system."),
    ]),
    ("Valves & safety", [
        ("FC", "Fail Closed — the valve drives to the CLOSED position on loss of signal, air or power."),
        ("FO", "Fail Open — the valve drives to the OPEN position on failure."),
        ("PSV / PRV", "Pressure Safety / Relief Valve — mechanical over-pressure protection."),
        ("XV / SDV", "Shutdown / emergency-shutdown Valve — fast on/off safety isolation."),
        ("PCV", "Pressure / Process Control Valve — a modulating control valve."),
        ("HV", "Hand Valve — manual isolation."),
        ("NRV / CV", "Non-Return Valve / Check Valve — prevents reverse flow."),
    ]),
    ("Electrical", [
        ("MCB", "Miniature Circuit Breaker."),
        ("MCCB", "Moulded-Case Circuit Breaker."),
        ("MCC", "Motor Control Centre — the cabinet housing motor starters / drives."),
        ("ATS", "Automatic Transfer Switch — switches the load to standby supply on mains loss."),
        ("UPS", "Uninterruptible Power Supply — battery-backed supply for control / instruments."),
        ("VSD / VFD", "Variable-Speed / Variable-Frequency Drive — controls motor speed."),
        ("LV / HV", "Low Voltage / High Voltage."),
        ("ΔU %", "Volt-drop percentage — the voltage lost along a cable run as a fraction of the supply voltage (kept within spec, typically ≤ 5 %)."),
    ]),
    ("HVAC", [
        ("HVAC", "Heating, Ventilation & Air-Conditioning."),
        ("DX", "Direct-Expansion — a refrigerant-coil cooling / dehumidification system."),
        ("AHU", "Air-Handling Unit — the fan/coil/filter box serving a zone."),
        ("Z-01, Z-02 …", "HVAC zone identifiers — each Z-number is a separately-served air zone (supply / return)."),
        ("ACH", "Air Changes per Hour — room-volume ventilation rate."),
    ]),
    ("Bill-of-materials status codes", [
        ("BESPOKE", "Made-to-order item — fabricated / engineered to spec; no off-the-shelf part number."),
        ("UTILITY", "A utility / commodity item (pipework, cable, civils) priced parametrically."),
        ("SYSTEM", "A multi-part packaged system priced as one unit."),
        ("IDENTIFIED", "A specific real product has been matched (manufacturer + part number)."),
        ("NOT FOUND", "No catalogue match yet — the price is an engineering estimate."),
        ("INSTRUMENT", "A field-instrument line."),
    ]),
    ("Units", [
        ("m³/h", "Cubic metres per hour — volumetric flow."),
        ("m³/s", "Cubic metres per second — volumetric flow."),
        ("kW / kWh", "Kilowatt (power) / kilowatt-hour (energy)."),
        ("mg/L", "Milligrams per litre — concentration (e.g. dissolved oxygen)."),
        ("bar / barg", "Pressure / pressure gauge (above atmospheric)."),
        ("t/yr", "Tonnes per year — annual throughput."),
        ("°C", "Degrees Celsius — temperature."),
    ]),
]


def tab_glossary(wb: Workbook, state: dict) -> bool:
    """Reference glossary of every abbreviation used across the dossier tabs and
    drawings. Universal (standard engineering nomenclature, identical for any
    archetype). Tristan flagged DN / ISA / PT / FC-FO / status-codes / Z-zones as
    undefined."""
    ws = wb.create_sheet("Glossary")
    set_widths(ws, {"A": 20, "B": 104})
    title_row(ws, "Glossary — abbreviations & symbols", 2,
              "Plain-English meaning of every abbreviation used on the schedule, "
              "drawing, bill-of-materials and cost tabs. Standard engineering "
              "nomenclature (British spelling); the same reference applies to any plant.")
    r = 4
    for category, entries in _GLOSSARY:
        sub_banner(ws, r, category, 2)
        r += 1
        for term, meaning in entries:
            tc = ws.cell(r, 1, term)
            tc.font = FONT_SUB
            tc.alignment = WRAP_TOP
            tc.border = BORDER
            mc = ws.cell(r, 2, meaning)
            mc.alignment = WRAP_TOP
            mc.border = BORDER
            # grow the row when the meaning wraps (col B ≈ 102 chars/line)
            lines = max(1, -(-len(meaning) // 102))
            if lines > 1:
                ws.row_dimensions[r].height = lines * 14.5
            r += 1
        r += 1  # spacer between categories
    ws.freeze_panes = "A4"
    back_link(ws, 2)
    return True


_FILL_RISK_HI = PatternFill("solid", fgColor="F4CCCC")   # red-ish
_FILL_RISK_MED = PatternFill("solid", fgColor="FCE5CD")  # amber
_FILL_RISK_LO = PatternFill("solid", fgColor="D9EAD3")   # green

# Universal hazard library. Each entry keys off EQUIPMENT/SERVICE tokens that
# actually appear in the bill of materials (so it fires for whatever plant the
# engine built — no per-class table), and carries the inherent severity ×
# likelihood plus the statutory regulations the hazard triggers. SHARED by the
# Risk Register (X) and the Regulatory & Compliance tab (Y). British spelling;
# regulations default to the UK family (the matrix maps to US/EU equivalents).
#   (token_regex, hazard, cause, severity 1-5, likelihood 1-5, mitigation, [regulations])
_HAZARD_LIB = [
    (r"liquid oxygen|\blox\b|\boxygen\b|oxygenat|\bpsa\b|\bo₂\b",
     "Oxygen enrichment — fire / accelerated combustion",
     "Stored or generated O₂ raises local oxygen concentration; oils and materials ignite readily.",
     4, 2, "O₂-clean materials, exclusion zones, gas detection + ventilation interlocks, no hydrocarbons near O₂.",
     ["Dangerous Substances and Explosive Atmospheres Regulations 2002 (DSEAR)",
      "BCGA / EIGA oxygen-handling codes of practice"]),
    (r"ammonia|\bnh3\b|biofilter|nitrif|\bh2s\b|hydrogen sulphide|chlorine|\bcl2\b",
     "Toxic / asphyxiant gas release",
     "Biological or chemical processes can release ammonia, hydrogen sulphide or chlorine.",
     4, 2, "Gas detection, forced ventilation, scrubbing, respiratory PPE, confined-space controls.",
     ["Control of Substances Hazardous to Health Regulations 2002 (COSHH)"]),
    (r"pressure vessel|pressuris|relief valve|\bpsv\b|compressor|air receiver|autoclave",
     "Stored pressure energy",
     "Pressurised vessels and lines can fail explosively.",
     4, 2, "Design + periodic inspection to pressure code, relief devices, written scheme of examination.",
     ["Pressure Systems Safety Regulations 2000 (PSSR)",
      "Pressure Equipment (Safety) Regulations 2016"]),
    (r"\bpump\b|blower|\bmotor\b|rotat|\bfan\b|mixer|agitator|\bvsd\b|\bdrive\b",
     "Rotating machinery — entanglement / mechanical failure",
     "Exposed rotating parts; stored mechanical energy; loss of a duty machine upsets the process.",
     3, 3, "Fixed guarding, lock-off / isolation (LOTO), N+1 standby on critical duties, vibration monitoring.",
     ["Provision and Use of Work Equipment Regulations 1998 (PUWER)",
      "Supply of Machinery (Safety) Regulations 2008 (UKCA)"]),
    (r"switchgear|transformer|\bmcc\b|\bhv\b|\bkv\b|400 v|busbar|\bups\b|generator|genset|distribution board",
     "Electrical — shock / arc-flash",
     "High fault energy at switchgear and transformers; shock risk from LV / HV.",
     4, 2, "BS 7671 installation, arc-flash assessment, lock-off, IP-rated enclosures, RCD + earthing.",
     ["Electricity at Work Regulations 1989",
      "BS 7671 Requirements for Electrical Installations"]),
    (r"\btank\b|\bvessel\b|\bcolumn\b|\bsump\b|\bbasin\b|\bsilo\b|\bpit\b|reactor",
     "Working at height / confined space (tanks & vessels)",
     "Tank tops present a fall risk; tank interiors are confined spaces (atmosphere / drowning).",
     4, 2, "Edge protection, confined-space permit-to-work, atmosphere testing, rescue plan.",
     ["Work at Height Regulations 2005", "Confined Spaces Regulations 1997"]),
    (r"\bfish\b|aquacultur|livestock|broodstock|larvae|hatchery|\bras\b",
     "Livestock welfare — mass mortality on plant failure",
     "Loss of recirculation, oxygen or temperature control can cause rapid stock mortality.",
     3, 3, "N+1 on critical plant, alarmed O₂ / level / temperature, standby power, automatic failover.",
     ["Welfare of Farmed Animals (England) Regulations 2007", "Animal Welfare Act 2006"]),
    (r"discharge|effluent|sludge|waste ?water|blowdown|\bbleed\b|drain to",
     "Environmental discharge to controlled waters",
     "Process effluent or sludge discharged to controlled waters requires consent.",
     3, 3, "Discharge permit, effluent treatment to consent limits, monitoring + reporting.",
     ["Environmental Permitting (England and Wales) Regulations 2016"]),
    (r"boiler|heater|immersion|heat pump|\bsteam\b|hot water|chiller|refriger",
     "Thermal — burns / scald / refrigerant",
     "Hot surfaces and fluids (scald / burn); refrigerant leak (asphyxiation).",
     3, 2, "Insulation + guarding, thermal relief, refrigerant leak detection + ventilation.",
     ["Provision and Use of Work Equipment Regulations 1998 (PUWER)",
      "Fluorinated Greenhouse Gases Regulations (F-Gas)"]),
    (r"dosing|chemical|\bacid\b|alkali|caustic|bicarb|coagulant|disinfect|biocide",
     "Chemical handling — corrosive / reactive",
     "Dosing chemicals are corrosive or reactive; incompatible mixing is hazardous.",
     3, 2, "Bunding, segregated storage, COSHH assessment, PPE, eyewash / safety shower.",
     ["Control of Substances Hazardous to Health Regulations 2002 (COSHH)",
      "Dangerous Substances and Explosive Atmospheres Regulations 2002 (DSEAR)"]),
    (r"\buv\b|ultraviolet|\bozone\b",
     "Radiation — ultraviolet / ozone exposure",
     "Ultraviolet reactors emit harmful UV; ozone is a respiratory irritant.",
     2, 2, "Interlocked enclosures, UV-opaque shielding, ozone detection + destruct.",
     ["Control of Artificial Optical Radiation at Work Regulations 2010"]),
]

# Statutory duties that apply to ANY industrial plant, by jurisdiction (independent
# of the specific hazards) — the always-on baseline of the regulatory tab.
_BASE_REGS_BY_JURIS = {
    "UK": [("Health and Safety at Work etc. Act 1974", "Overarching duty of care to workers and others."),
           ("Management of Health and Safety at Work Regulations 1999", "Suitable & sufficient risk assessment."),
           ("Construction (Design and Management) Regulations 2015 (CDM)", "Design + construction safety duties."),
           ("Supply of Machinery (Safety) Regulations 2008 (UKCA)", "Machinery conformity + UKCA marking.")],
    "US": [("OSHA General Duty Clause (29 U.S.C. § 654)", "Overarching duty of care."),
           ("OSHA 29 CFR 1910", "General-industry safety standards."),
           ("National Electrical Code (NFPA 70)", "Electrical installation."),
           ("EPA Clean Water Act (NPDES)", "Discharge permitting.")],
    "EU": [("Directive 89/391/EEC (OSH Framework)", "Overarching duty of care."),
           ("Machinery Directive 2006/42/EC (CE)", "Machinery conformity + CE marking."),
           ("ATEX 2014/34/EU", "Equipment in explosive atmospheres."),
           ("Industrial Emissions Directive 2010/75/EU", "Emissions + discharge permitting.")],
}

# Map a UK statute to its rough US/EU equivalent so the hazard regulations follow
# the detected jurisdiction (universal — no per-class content).
_REG_JURIS_MAP = {
    "Dangerous Substances and Explosive Atmospheres Regulations 2002 (DSEAR)":
        {"US": "OSHA 29 CFR 1910.119 (Process Safety Management)", "EU": "ATEX 1999/92/EC"},
    "Control of Substances Hazardous to Health Regulations 2002 (COSHH)":
        {"US": "OSHA Hazard Communication 29 CFR 1910.1200", "EU": "Chemical Agents Directive 98/24/EC"},
    "Pressure Systems Safety Regulations 2000 (PSSR)":
        {"US": "ASME Boiler & Pressure Vessel Code", "EU": "Pressure Equipment Directive 2014/68/EU"},
    "Pressure Equipment (Safety) Regulations 2016":
        {"US": "ASME BPVC", "EU": "Pressure Equipment Directive 2014/68/EU"},
    "Electricity at Work Regulations 1989":
        {"US": "NFPA 70E", "EU": "Low Voltage Directive 2014/35/EU"},
    "BS 7671 Requirements for Electrical Installations":
        {"US": "National Electrical Code (NFPA 70)", "EU": "HD 60364 / IEC 60364"},
    "Environmental Permitting (England and Wales) Regulations 2016":
        {"US": "EPA Clean Water Act (NPDES)", "EU": "Industrial Emissions Directive 2010/75/EU"},
    "Provision and Use of Work Equipment Regulations 1998 (PUWER)":
        {"US": "OSHA 29 CFR 1910 Subpart O", "EU": "Use of Work Equipment Directive 2009/104/EC"},
    "Supply of Machinery (Safety) Regulations 2008 (UKCA)":
        {"US": "ANSI B11 machine safety", "EU": "Machinery Directive 2006/42/EC"},
}


def _derive_hazards(state: dict):
    """Hazards PRESENT in this design, derived from the equipment tokens in the
    bill of materials. Universal — fires for whatever the engine built."""
    bom = state.get("requirementsBom") or []
    corpus = " ".join(
        " ".join(str(b.get(k, "")) for k in ("requirement", "part", "name_human", "status", "tag"))
        for b in bom if isinstance(b, dict)
    ).lower()
    present = []
    for rx, name, cause, sev, lik, mit, regs in _HAZARD_LIB:
        if re.search(rx, corpus):
            present.append(dict(name=name, cause=cause, sev=sev, lik=lik, mit=mit, regs=regs))
    return present


def _rag(score: int):
    if score >= 15:
        return ("High", _FILL_RISK_HI)
    if score >= 8:
        return ("Medium", _FILL_RISK_MED)
    return ("Low", _FILL_RISK_LO)


def _detect_jurisdiction(state: dict) -> str:
    cg = state.get("complianceGate") or {}
    js = cg.get("jurisdictions_detected") or []
    if js:
        j = str(js[0]).upper()
        if j in _BASE_REGS_BY_JURIS:
            return j
        if j in ("GB", "UK", "ENGLAND", "WALES", "SCOTLAND"):
            return "UK"
        if j in ("USA", "US"):
            return "US"
    return "UK"


def tab_risk_register(wb: Workbook, state: dict) -> bool:
    """X — native Risk Register (Tristan 2026-06-21: bring the PDF's risk register
    into the Excel). Universal + fully traceable: rows from LIVE engine findings
    (physics critique, residual gate flags, cost sanity) PLUS process-hazard rows
    derived from the equipment actually present. No RAS-only content."""
    rows = []   # (category, hazard/finding, cause, sev, lik, mitigation, source)

    # 1) LIVE engineering findings — the physics critic's issues
    pc = state.get("physicsCritique") or {}
    for iss in (pc.get("issues") or []):
        if not isinstance(iss, dict):
            continue
        sevtxt = str(iss.get("severity", "")).lower()
        sev = 5 if sevtxt == "high" else 3 if sevtxt in ("medium", "med") else 2
        rows.append(("Engineering — design", iss.get("issue", "").strip() or "Design concern",
                     f"Physics critic ({iss.get('dimension', 'engineering')}), at {iss.get('where', 'design')}.",
                     sev, 3, "Resolve / re-spec before procurement; re-run the physics check to confirm closure.",
                     "state.physicsCritique.issues"))

    # 2) LIVE residual gate flags (QA / commercial)
    for ri in (state.get("residualIssues") or []):
        if not isinstance(ri, dict):
            continue
        gate = str(ri.get("gate", "")).lower()
        cat = ("Commercial — pricing" if "price" in gate else
               "Procurement — part data" if "pn" in gate or "fictional" in gate else
               "Documentation — drawing/layout" if "layout" in gate or "overlap" in gate else
               "Quality assurance")
        rows.append((cat, ri.get("summary", "").strip() or ri.get("gate", "Gate flag"),
                     f"Deterministic {ri.get('gate', 'gate')} raised a flag.",
                     3, 2, "Review the named audit, correct the source line, and re-run the gate.",
                     "state.residualIssues"))

    # 3) LIVE cost-sanity (commercial) when outside / borderline the industry band
    cstat = state.get("costSanity") or {}
    if isinstance(cstat, dict) and cstat.get("ratio_to_nearest_edge"):
        ratio = num(cstat.get("ratio_to_nearest_edge")) or 1.0
        if ratio and ratio > 1.05:
            sev = 4 if ratio > 2 else 3 if ratio > 1.5 else 2
            rows.append(("Commercial — capex", "Capex per output unit outside the typical industry band",
                         clean_cell(cstat.get("message", "")) or "Cost-per-output outside band.",
                         sev, 3, "Value-engineer the high-cost items or confirm the premium is justified.",
                         "state.costSanity"))

    # 4) PROCESS-HAZARD rows from the equipment present (universal hazard library)
    for hz in _derive_hazards(state):
        rows.append(("Process safety / HSE", hz["name"], hz["cause"],
                     hz["sev"], hz["lik"], hz["mit"], "Equipment present in the bill of materials"))

    if not rows:
        return False

    ws = wb.create_sheet("Risk register")
    set_widths(ws, {"A": 6, "B": 22, "C": 40, "D": 40, "E": 6, "F": 6, "G": 7,
                    "H": 10, "I": 46, "J": 16, "K": 26})
    title_row(
        ws, "Risk register", 11,
        "Preliminary hazard & risk register, derived LIVE from the engine. Engineering "
        "/ QA / commercial rows come from the physics critic, the deterministic gate "
        "flags and the independent cost-sanity check; the process-safety rows are "
        "derived from the equipment actually present in the bill of materials, each "
        "with its inherent severity × likelihood and the standard mitigation. Score = "
        "S × L (≤7 Low / 8–14 Medium / ≥15 High). Universal — not specific to this plant "
        "type. Preliminary; a site-specific HAZID / HAZOP is required before construction.",
    )
    header(ws, 4, ["#", "Category", "Hazard / finding", "Cause", "S", "L", "Score",
                   "Rating", "Mitigation", "Residual", "Source"])
    r = 5
    for i, (cat, hz, cause, sev, lik, mit, src) in enumerate(rows, start=1):
        score = sev * lik
        rating, fill = _rag(score)
        ws.cell(r, 1, i).border = BORDER
        ws.cell(r, 2, clean_cell(cat)).border = BORDER
        c3 = ws.cell(r, 3, clean_cell(hz)); c3.alignment = WRAP_TOP; c3.border = BORDER
        c4 = ws.cell(r, 4, clean_cell(cause)); c4.alignment = WRAP_TOP; c4.border = BORDER
        ws.cell(r, 5, sev).border = BORDER
        ws.cell(r, 6, lik).border = BORDER
        sc = ws.cell(r, 7, score); sc.border = BORDER
        # live recompute so an edited S or L re-scores: =E*F
        sc.value = f"=E{r}*F{r}"
        rc = ws.cell(r, 8, rating); rc.border = BORDER; rc.fill = fill
        rc.alignment = Alignment(horizontal="center")
        c9 = ws.cell(r, 9, clean_cell(mit)); c9.alignment = WRAP_TOP; c9.border = BORDER
        ws.cell(r, 10, "Tolerable (with mitigation)").border = BORDER
        c11 = ws.cell(r, 11, clean_cell(src)); c11.alignment = WRAP_TOP; c11.border = BORDER
        # grow row for the longest wrapped cell
        longest = max(len(str(hz)), len(str(cause)), len(str(mit)))
        if longest > 40:
            ws.row_dimensions[r].height = min(-(-longest // 40), 5) * 14.5
        r += 1
    ws.auto_filter.ref = f"A4:K{r - 1}"
    ws.freeze_panes = "A5"
    back_link(ws, 11)
    return True


def tab_regulatory(wb: Workbook, state: dict) -> bool:
    """Y — native Regulatory & Compliance tab (Tristan 2026-06-21). Universal: the
    engine's compliance-gate verdict + a jurisdiction × hazard → regulation matrix
    derived from the hazards present. Honest when the gate skipped (no class
    standards registered)."""
    cg = state.get("complianceGate") or {}
    juris = _detect_jurisdiction(state)
    hazards = _derive_hazards(state)

    ws = wb.create_sheet("Regulatory")
    set_widths(ws, {"A": 6, "B": 56, "C": 50, "D": 22})
    verdict = str(cg.get("verdict", "—")).upper()
    title_row(
        ws, "Regulatory & compliance", 4,
        f"Jurisdiction: {juris}. Engine compliance-gate verdict: {verdict} "
        f"({cg.get('mandatory_covered', 0)}/{cg.get('mandatory_total', 0)} class standards covered). "
        "The statutory duties below are derived from the jurisdiction + the hazards present "
        "in this design (universal hazard → regulation matrix), NOT a per-class list. Where the "
        "gate skipped (no class-specific standards registered), that is shown honestly — the "
        "engineer must still verify and apply the duties below before sale / construction.",
    )
    r = 4
    # verdict banner row
    if cg.get("reason"):
        sub_banner(ws, r, "Engine compliance-gate verdict", 4)
        r += 1
        vc = ws.cell(r, 1, verdict)
        vc.font = FONT_SUB
        vc.fill = FILL_PASS if verdict == "PASS" else _FILL_RISK_MED
        m = ws.cell(r, 2, clean_cell(cg.get("reason", "")))
        m.alignment = WRAP_TOP
        ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
        ws.row_dimensions[r].height = 30
        r += 2

    # 1) always-on statutory duties for the jurisdiction
    sub_banner(ws, r, f"Statutory duties that always apply ({juris})", 4)
    r += 1
    header(ws, r, ["#", "Regulation / standard", "Applies because", "Status"])
    r += 1
    n = 1
    for reg, why in _BASE_REGS_BY_JURIS.get(juris, _BASE_REGS_BY_JURIS["UK"]):
        ws.cell(r, 1, n).border = BORDER
        ws.cell(r, 2, clean_cell(reg)).border = BORDER
        c3 = ws.cell(r, 3, clean_cell(why)); c3.alignment = WRAP_TOP; c3.border = BORDER
        ws.cell(r, 4, "Mandatory — verify").border = BORDER
        r += 1
        n += 1

    # 2) hazard-driven regulations (deduped), mapped to the detected jurisdiction
    r += 1
    sub_banner(ws, r, "Hazard-driven regulations (from the equipment present)", 4)
    r += 1
    header(ws, r, ["#", "Regulation / standard", "Triggered by (hazard present)", "Status"])
    r += 1
    seen = {}
    for hz in hazards:
        for reg in hz["regs"]:
            mapped = reg
            if juris != "UK" and reg in _REG_JURIS_MAP:
                mapped = _REG_JURIS_MAP[reg].get(juris, reg)
            seen.setdefault(mapped, []).append(hz["name"])
    n = 1
    for reg, triggers in seen.items():
        ws.cell(r, 1, n).border = BORDER
        ws.cell(r, 2, clean_cell(reg)).border = BORDER
        # dedupe trigger names, keep readable
        trig = "; ".join(dict.fromkeys(triggers))
        c3 = ws.cell(r, 3, clean_cell(trig)); c3.alignment = WRAP_TOP; c3.border = BORDER
        if len(trig) > 48:
            ws.row_dimensions[r].height = min(-(-len(trig) // 48), 4) * 14.5
        ws.cell(r, 4, "Mandatory — verify").border = BORDER
        r += 1
        n += 1

    # 3) any conflicts the gate found
    conflicts = cg.get("conflicts") or []
    if conflicts:
        r += 1
        sub_banner(ws, r, "Standards conflicts flagged by the engine", 4)
        r += 1
        for c in conflicts:
            ws.cell(r, 1, "⚠").font = FONT_FAIL
            cc = ws.cell(r, 2, clean_cell(str(c))); cc.alignment = WRAP_TOP
            ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
            r += 1

    ws.freeze_panes = "A4"
    back_link(ws, 4)
    return True


# Universal construction / erection sequence — the standard order of works for a
# process plant. Each phase keys off equipment tokens in the bill of materials, so
# the equipment list populates from whatever the engine built (no per-class table).
#   (phase, token_regex_or_None, predecessor, plant/lifting, hold/witness point)
_ERECTION_PHASES = [
    ("Site establishment & civils",
     r"foundation|slab|\bbund\b|civil|groundwork|plinth|concrete|earthwork|drainage channel",
     "Site handover & set-out", "Excavator, concrete pump",
     "Foundation survey + concrete cube tests signed off"),
    ("Tankage & major static equipment erection",
     r"\btank\b|\bvessel\b|\bcolumn\b|biofilter|degas|\bsilo\b|\bbasin\b|\bsump\b|reactor|skimmer|clarifier|\bmbbr\b|media",
     "Civils complete & cured", "Mobile crane",
     "Tank / vessel hydrostatic (leak) test witnessed"),
    ("Mechanical equipment installation",
     r"\bpump\b|blower|\bfilter\b|heat pump|compressor|screen|mixer|\bfan\b|dehumidif|\buv\b|chiller|\bhrv\b|skid|aerat|exchanger",
     "Tankage set & grouted", "Forklift / overhead crane",
     "Alignment + rotation (bump) test recorded"),
    ("Pipework & ductwork",
     r"\bpipe\b|\bvalve\b|\bline\b|\bduct\b|manifold|header|\bspool\b|fitting|flange|\bdn\d",
     "Equipment installed", "Pipe trolleys, chain hoists",
     "Pressure / leak test certificate per line"),
    ("Electrical installation",
     r"switchgear|transformer|\bmcc\b|\bpanel\b|\bcable\b|\bups\b|generator|genset|distribution|busbar|\bats\b|feeder|breaker|\bmccb\b|\bmcb\b",
     "Equipment set, cable routes ready", "Cable drum jacks",
     "Insulation-resistance + earth-continuity tests"),
    ("Instrumentation, controls & SCADA",
     r"transmitter|\bsensor\b|\bprobe\b|analys|instrument|controller|\bscada\b|\bplc\b|flow meter|\bgauge\b|\bhmi\b|level switch",
     "Electrical energised (LV)", "Hand tools",
     "Loop checks + calibration certificates"),
    ("Pre-commissioning & commissioning",
     None, "All systems installed & tested", "—",
     "Water-on, functional + performance test; client witness"),
]


def tab_assembly_sequence(wb: Workbook, state: dict) -> bool:
    """Z — native Assembly & Erection Sequence (Tristan 2026-06-21: bring the PDF's
    assembly/erection sequence into the Excel). Universal: a standard order-of-works
    whose per-phase equipment list is derived from the bill of materials by discipline
    keyword (no per-class table). Each phase carries its predecessor, lifting plant and
    a hold / witness point."""
    bom = state.get("requirementsBom") or []
    principals = [b for b in bom if isinstance(b, dict) and not b.get("sub_of") and num(b.get("line_gbp"))]
    if not principals:
        principals = [b for b in bom if isinstance(b, dict) and b.get("requirement")]
    if not principals:
        return False

    # assign each principal to the FIRST matching phase (commissioning takes none)
    buckets = {ph[0]: [] for ph in _ERECTION_PHASES}
    for b in principals:
        blob = f"{b.get('requirement', '')} {b.get('part', '')} {b.get('tag', '')}".lower()
        placed = False
        for ph, rx, *_ in _ERECTION_PHASES:
            if rx and re.search(rx, blob):
                tag = clean_cell(b.get("tag", ""))
                nm = clean_cell(b.get("requirement", "")).lstrip("↳ ").split("·")[0].strip()
                buckets[ph].append((nm, tag))      # (name, tag) — referenced at render
                placed = True
                break
        if not placed:
            buckets["Mechanical equipment installation"].append(
                (clean_cell(b.get("requirement", "")).split("·")[0].strip(), ""))

    ws = wb.create_sheet("Assembly sequence")
    set_widths(ws, {"A": 6, "B": 34, "C": 60, "D": 26, "E": 22, "F": 40})
    title_row(
        ws, "Assembly & erection sequence", 6,
        "Standard order of works for the plant, derived from the bill of materials by "
        "discipline. Each step lists the principal equipment installed in it (with tags), "
        "its predecessor, the lifting plant, and the hold / witness point that gates the "
        "next step. Universal sequence — not specific to this plant type. Indicative; a "
        "site-specific construction phase plan (CDM) is required before works begin.",
    )
    header(ws, 4, ["Step", "Phase / activity", "Principal equipment installed (tag)",
                   "Predecessor", "Lifting plant", "Hold / witness point"])
    r = 5
    step = 1
    for ph, rx, pred, plant, hold in _ERECTION_PHASES:
        items = list(dict.fromkeys(buckets.get(ph, [])))
        if ph.startswith("Pre-commissioning"):
            equip = "Whole plant — flush, fill, leak-check, energise, wet-commission, performance test."
        elif items:
            shown = items[:14]
            tail = len(items) - 14
            # Build a concat formula REFERENCING the master "Part names" for each principal's
            # name + tag (one identity; click a precedent). Literal fallback per item; if no
            # item resolves, emit the plain string (no pointless all-literal formula).
            exprs, any_ref = [], False
            for nm, tag in shown:
                nref = name_ref(nm)
                tref = tag_ref(tag) if tag else None
                any_ref = any_ref or bool(nref) or bool(tref)
                nexpr = nref[1:] if nref else '"' + str(nm).replace('"', '""') + '"'
                if tag:
                    texpr = tref[1:] if tref else '"' + str(tag).replace('"', '""') + '"'
                    exprs.append(f'{nexpr} & " [" & {texpr} & "]"')
                else:
                    exprs.append(nexpr)
            if any_ref:
                joined = ' & "; " & '.join(exprs)
                if tail > 0:
                    joined += f' & "  (+{tail} more)"'
                equip = "=" + joined
            else:
                equip = "; ".join(f"{nm}{(' [' + tag + ']') if tag else ''}" for nm, tag in shown) \
                    + (f"  (+{tail} more)" if tail > 0 else "")
        else:
            continue  # skip a phase with no equipment (other than commissioning)
        ws.cell(r, 1, step).border = BORDER
        ws.cell(r, 2, clean_cell(ph)).border = BORDER
        c3 = ws.cell(r, 3, equip); c3.alignment = WRAP_TOP; c3.border = BORDER
        ws.cell(r, 4, clean_cell(pred if step > 1 else "Site handover & set-out")).border = BORDER
        ws.cell(r, 5, clean_cell(plant)).border = BORDER
        c6 = ws.cell(r, 6, clean_cell(hold)); c6.alignment = WRAP_TOP; c6.border = BORDER
        lines = max(1, -(-len(equip) // 58))
        if lines > 1:
            ws.row_dimensions[r].height = min(lines, 6) * 14.5
        r += 1
        step += 1
    ws.freeze_panes = "A5"
    back_link(ws, 6)
    return True


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
        "Real sortable rows (circuit · load · device · cable · volt-drop). The "
        "engine computes Design I = P·1000 / (√3·V·pf·η) — pf 0.85 / η 0.90 for "
        "motor circuits, pf 1.0 / η 1.0 for resistive loads — from each circuit's "
        "INSTALLED motor frame (so the amps can exceed the duty-kW shown). ΔU % is "
        "the cable volt-drop over its length / CSA at Design I. 'In spec' is a LIVE "
        "formula = (ΔU ≤ 5 %): edit a ΔU cell and the verdict + red flag recompute. "
        "Auto-generated; not for construction.",
    )
    r = 4
    last_circuit_first = None
    for heading, hdr, rows in tables:
        # locate the 'in spec' + 'ΔU' columns for live verdicts + conditional colour
        spec_col = None
        du_col = None
        for idx, h in enumerate(hdr, start=1):
            hl = h.lower()
            if "spec" in hl:
                spec_col = idx
            if "δu" in hl or "volt" in hl or "drop" in hl or "δ" in hl:
                du_col = idx
        r, body_first = _render_md_table(ws, r, heading, hdr, rows, spec_col)
        body_last = r - 1
        # MAKE 'In spec' LIVE: verdict computed from the ΔU cell vs the 5% limit,
        # not the static '✓' parsed from the markdown (Tristan: "doesn't seem to be
        # using real formulas, which makes me suspicious"). Universal — any panel md
        # with a volt-drop + in-spec column gets a live check.
        if spec_col and du_col and len(hdr) >= 6 and body_last >= body_first:
            du_L = get_column_letter(du_col)
            sp_L = get_column_letter(spec_col)
            for rr in range(body_first, body_last + 1):
                cell = ws.cell(rr, spec_col)
                # ELSE branch must be a STATIC value — referencing the spec cell itself
                # ({sp_L}{rr}) is a CIRCULAR reference (the cell is THIS formula). When
                # ΔU is non-numeric there is no volt-drop to check, so show "—".
                cell.value = (f'=IF(ISNUMBER({du_L}{rr}),'
                              f'IF({du_L}{rr}<=5,"✓","✗"),"—")')
            from openpyxl.formatting.rule import CellIsRule
            ws.conditional_formatting.add(
                f"{sp_L}{body_first}:{sp_L}{body_last}",
                CellIsRule(operator="equal", formula=['"✗"'],
                           fill=FILL_FAIL, font=FONT_FAIL))
            ws.conditional_formatting.add(
                f"{sp_L}{body_first}:{sp_L}{body_last}",
                CellIsRule(operator="equal", formula=['"✓"'],
                           fill=FILL_PASS, font=FONT_PASS))
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
            if h.lower() in ("service", "description", "measured", "notes", "remarks"):
                widths[get_column_letter(idx)] = 54
        set_widths(ws, widths)
        # Use the clean SHEET NAME as the title (sentence case) — the source heading is
        # verbatim ALL-CAPS ("LINE LIST"/"VALVE LIST"/"INSTRUMENT INDEX"); the descriptive
        # subtitle carries the detail.
        title_row(ws, sheet, max(ncol, 2),
                  "Parsed from process-schedules.md — real sortable rows.")
        nxt, body_first = _render_md_table(ws, 4, "", hdr, rows)
        ws.auto_filter.ref = f"A4:{get_column_letter(ncol)}{nxt - 1}"
        ws.freeze_panes = "A5"
        back_link(ws, max(ncol, 2))
        made += 1
    return made


def _line_section(row: dict, spec: dict) -> str:
    """Classify a sized run so flow lines and electrical cables never share a units
    column (Tristan: 'water and electrics mixed... amps and cubes'). Universal —
    keys off the connection-schedule's own kind / mechanism, no class assumptions."""
    kind = (spec.get("kind") or "").lower()
    mech = (row.get("mechanism") or "").lower()
    if kind == "cable" or "electric" in mech or mech == "signal" or "power" in mech:
        return "electrical"
    if kind == "pipe" and ("loop" in mech or "fluid" in mech):
        return "pipe"
    return "other"


def _line_basis(row: dict) -> str:
    """How a Line £ is built (Tristan: 'how or where the line cost number comes from')
    — the material take-off + £/m × length + install, from the row's own fields."""
    bits = []
    q = clean_cell(row.get("qty", ""))
    if q:
        bits.append(q)
    uc = num(row.get("unit_cost_gbp"))
    ln = num(row.get("length_m"))
    if uc is not None and ln:
        bits.append(f"£{uc:,.0f}/m × {ln:,.1f} m")
    elif uc is not None:
        bits.append(f"£{uc:,.0f}/unit")
    inst = num(row.get("install_gbp"))
    if inst:
        bits.append(f"install £{inst:,.0f}")
    return " · ".join(bits)


def tab_line_velocity(wb: Workbook, run_dir: str) -> bool:
    """#22 — Line & velocity schedule from connection-schedule.json, SPLIT into
    process-pipe lines (velocity vs ≤3 m/s) and electrical/signal cables (volt-drop
    vs ≤5 %) so flow, current and power units never mix in one column. Adds a Basis
    column showing how each Line £ is derived. within_spec ✗ conditional-formatted RED."""
    cs = load_json(os.path.join(run_dir, "connection-schedule.json"))
    if not cs or not isinstance(cs, dict):
        return False
    rows = cs.get("rows")
    if not rows or not isinstance(rows, list):
        return False
    specs = cs.get("specs") or []  # parallel, carries the spec_limit text

    ws = wb.create_sheet("Line & velocity")
    set_widths(ws, {"A": 6, "B": 22, "C": 22, "D": 16, "E": 16, "F": 14,
                    "G": 16, "H": 10, "I": 9, "J": 13, "K": 62})
    title_row(
        ws, "Line & velocity schedule", 11,
        "Every sized run, SPLIT so units never mix: process-pipe lines (flow m³/s, "
        "velocity vs ≤ 3 m/s) · electrical & signal cables (current A, volt-drop vs "
        "≤ 5 %) · other services. Velocity / ΔU is the AS-SIZED value (post-upsizing); "
        "'In spec' ✗ = RED. Basis shows how each Line £ is built (take-off × £/m + install).",
    )

    # bucket rows by section, preserving the original index for the '#'
    groups: Dict[str, list] = {"pipe": [], "electrical": [], "other": []}
    for idx, row in enumerate(rows):
        if not isinstance(row, dict):
            continue
        spec = specs[idx] if idx < len(specs) and isinstance(specs[idx], dict) else {}
        groups[_line_section(row, spec)].append((idx, row, spec))

    SECTIONS = [
        ("pipe", "Process pipe lines — flow (m³/s) · velocity limit ≤ 3 m/s"),
        ("electrical", "Electrical & signal cables — current (A) · volt-drop limit ≤ 5 %"),
        ("other", "Other services (air / misc)"),
    ]
    HDR = ["#", "From", "To", "Size", "Rating", "Velocity / ΔU", "Spec limit",
           "Length (m)", "In spec", "Line £", "Basis"]
    r = 4
    grand_fail = 0
    spec_cells = []   # In-spec column cells for the conditional-format range
    for key, label in SECTIONS:
        g = groups[key]
        if not g:
            continue
        sub_banner(ws, r, label, 11)
        r += 1
        header(ws, r, HDR)
        r += 1
        sec_first = r
        for idx, row, spec in g:
            in_spec = row.get("within_spec")
            ws.cell(r, 1, idx + 1).border = BORDER
            # From / To endpoints REFERENCE the master "Part names" row where the endpoint
            # is a registered principal (one identity; click through to the part). The
            # connection-schedule labels endpoints by NAME ("Standby Diesel Generator"), so
            # resolve by name first, tag second; literal kept for boundary endpoints (e.g.
            # "Utility Incomer") the master doesn't carry.
            _fr = name_ref(row.get("from", "")) or tag_ref(row.get("from", ""))
            ws.cell(r, 2, _fr if _fr else clean_cell(row.get("from", ""))).border = BORDER
            _to = name_ref(row.get("to", "")) or tag_ref(row.get("to", ""))
            ws.cell(r, 3, _to if _to else clean_cell(row.get("to", ""))).border = BORDER
            ws.cell(r, 4, clean_cell(row.get("size", ""))).border = BORDER
            ws.cell(r, 5, clean_cell(row.get("rating", ""))).border = BORDER
            # AS-SIZED velocity / volt-drop (post-upsizing) from specs — never the
            # stale pre-upsize row['drop'].
            velnum = num(spec.get("drop_pct_or_velocity"))
            if velnum is not None:
                vc = ws.cell(r, 6, velnum)
                vc.number_format = FMT_DEC2
            else:
                vc = ws.cell(r, 6, clean_cell(row.get("drop", "")))
            vc.border = BORDER
            ws.cell(r, 7, clean_cell(spec.get("spec_limit", ""))).border = BORDER
            lc = ws.cell(r, 8, num(row.get("length_m")))
            lc.number_format = FMT_DEC1
            lc.border = BORDER
            sc = ws.cell(r, 9, "✓" if in_spec is not False else "✗")
            sc.border = BORDER
            sc.alignment = Alignment(horizontal="center")
            spec_cells.append(sc.coordinate)
            if in_spec is False:
                sc.font = FONT_FAIL
                grand_fail += 1
                for col in range(1, 12):
                    ws.cell(r, col).fill = FILL_FAIL
            else:
                sc.fill = FILL_PASS
                sc.font = FONT_PASS
            lt = ws.cell(r, 10, num(row.get("line_total_gbp")))
            lt.number_format = FMT_GBP
            lt.border = BORDER
            basis = _line_basis(row)
            bc = ws.cell(r, 11, basis)
            bc.alignment = WRAP_TOP
            bc.border = BORDER
            if len(basis) > 60:
                ws.row_dimensions[r].height = min(-(-len(basis) // 60), 4) * 14.5
            r += 1
        # per-section Σ line £
        ws.cell(r, 2, f"Σ {label.split('—')[0].strip()}").font = FONT_SUB
        st = ws.cell(r, 10, f"=SUM(J{sec_first}:J{r - 1})")
        st.font = Font(bold=True)
        st.fill = FILL_RESULT
        st.number_format = FMT_GBP
        r += 2

    # grand foot: out-of-spec tally across all sections
    ws.cell(r, 2, "Runs out-of-spec (all sections, as-sized)").font = FONT_SUB
    tc = ws.cell(r, 9, grand_fail)
    tc.font = FONT_FAIL if grand_fail else FONT_PASS
    tc.fill = FILL_FAIL if grand_fail else FILL_PASS
    tc.alignment = Alignment(horizontal="center")

    # any '✗' in an In-spec cell goes red live
    if spec_cells:
        from openpyxl.formatting.rule import CellIsRule
        ws.conditional_formatting.add(
            f"I5:I{r}",
            CellIsRule(operator="equal", formula=['"✗"'], fill=FILL_FAIL, font=FONT_FAIL))
    ws.freeze_panes = "A5"
    back_link(ws, 11)
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
    """Fallback one-line description for image / module tabs not in the static map.
    Distinct lines per drawing TYPE (matched on the title) so GA/P&ID/BFD/Single-line/
    HVAC never share an identical generic string."""
    low = name.lower()
    if low.startswith("module —"):
        return "Per-module Blender render."
    if low.startswith("isometric"):
        return "Representative pipe isometric drawing."
    if low.startswith("render"):
        return "Photoreal Blender render."
    if low.startswith("ga") or "general arrangement" in low:
        return "General arrangement — equipment layout & footprint."
    if "p&id" in low or low.startswith("pid"):
        return "Piping & instrumentation diagram — process flow, valves, instruments."
    if low.startswith("bfd") or "block flow" in low:
        return "Block flow diagram — major process blocks & streams."
    if "single-line" in low or "single line" in low:
        return "Single-line electrical distribution diagram."
    if "hvac" in low:
        return "Ventilation & climate-control schematic."
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
            cairosvg.svg2png(url=src_path, write_to=out_png, output_width=3000)
            return out_png
        except Exception:  # noqa: BLE001
            pass
        # try rsvg-convert
        try:
            subprocess.run(["rsvg-convert", "-w", "3000", "-o", out_png, src_path],
                           check=True, capture_output=True, timeout=60)
            if os.path.exists(out_png):
                return out_png
        except Exception:  # noqa: BLE001
            pass
    return None


def downscale_png(src_png: str, run_dir: str, max_px: int = 3400) -> str:
    """
    Downscale a PNG so the whole workbook stays manageable. Raised 1400→2600→3400
    (Tristan: "make all of the diagrams higher resolution" + "A2 minimum"): native
    drawings are 2160–6560 px and the densest (single-line 6140, P&ID 4380, block-
    flow 4526, process-schedule 4356) were still being crushed to 2600. 3400 keeps
    the dense P&ID / single-line / process-schedule legible on zoom (≈ A2 at ~150 dpi)
    while bounding workbook size; smaller renders (hero, isometrics ~2360 px) pass
    through untouched. Universal.
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
            # Name the downscaled file by its PARENT-QUALIFIED relative path, NOT the bare
            # basename — interior 00-hero.png and exterior/00-hero.png share a basename, so a
            # basename-keyed temp made the exterior OVERWRITE the interior and both tabs embedded
            # the SAME image (Tristan 2026-06-22: "interior and exterior layouts are identical").
            try:
                _rel = os.path.relpath(src_png, run_dir)
            except ValueError:
                _rel = os.path.basename(src_png)
            _safe = _rel.replace(os.sep, "_").replace("..", "_")
            out = os.path.join(out_dir, "ds_" + _safe)
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
        # Shared navy title band (matches the data tabs) + a ↑ Contents back-link, instead
        # of a bare bold cell. title_row returns the next free row; the image goes below it.
        img_row = title_row(ws, title, 6, caption)
        back_link(ws, 6)
        img = XLImage(ds)
        # cap on-sheet display size (keep aspect) so the tab is readable. Raised
        # 1100→1700 to match the higher-res embed: the underlying PNG is up to
        # 2600 px so zooming stays sharp. Universal.
        max_w = 1700
        if img.width and img.width > max_w:
            ratio = max_w / float(img.width)
            img.width = int(img.width * ratio)
            img.height = int(img.height * ratio)
        ws.add_image(img, f"A{img_row}")
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

    # 1. hero (interior layout — the materialed render's 00-hero)
    hero = first_existing(os.path.join(run_dir, "00-hero.png"),
                          os.path.join(run_dir, "blender-cover.png"))
    if hero:
        specs.append((hero, "Render — Interior layout",
                      "Blender 3D render — interior plant layout (no walls/roof), view 1."))
    # 1b. SECOND interior angle + the EXTERIOR building views (Tristan 2026-06-22: the Excel was
    #     missing the updated renders + the external building). The exterior set is rendered to
    #     <run>/exterior/ from the SAME scene build (BLENDER_PLANT_SHELL=1).
    _ext = os.path.join(run_dir, "exterior")
    for _p, _ttl, _cap in (
        (os.path.join(run_dir, "02-corner-FR.png"), "Render — Interior layout (view 2)",
         "Interior plant layout — second angle."),
        (os.path.join(_ext, "00-hero.png"), "Render — Building exterior",
         "Architectural exterior of the building enclosing the plant, view 1."),
        (os.path.join(_ext, "02-corner-FR.png"), "Render — Building exterior (view 2)",
         "Architectural exterior — second angle."),
    ):
        if os.path.exists(_p):
            specs.append((_p, _ttl, _cap))

    # 2. module renders — REMOVED (Tristan 2026-06-20): the per-module Blender
    # highlight renders (module-*.png) read as poor quality and their provenance was
    # unclear, so they no longer get their own tabs. Universal across all classes.

    # 3. the 8 engineering drawings (canonical names + aliases)
    eng = [
        ("general-arrangement", "GA — General Arrangement",
         "General arrangement / plant layout."),
        ("pid", "P&ID", "Piping & instrumentation diagram."),
        ("block-flow-diagram", "BFD — Block Flow",
         "Block flow diagram of the process."),
        ("single-line-diagram", "Single-line",
         "Electrical single-line diagram."),
        ("hvac-layout", "HVAC", "HVAC / ventilation layout."),
        # NOTE: panel-schedule + process-schedules are deliberately NOT embedded
        # as PDF-page images — they are rendered as NATIVE, sortable Excel rows by
        # tab_panel_schedule + tab_process_schedules (Tristan 2026-06-20: "panel /
        # process schedule should be in excel, not a pdf"). Universal for any class
        # that emits those schedules.
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
    print("  · Brief")
    tab_brief(wb, run_dir)
    # Place Brief immediately AFTER Overview, BEFORE ⚠ Checks (created next).
    # openpyxl appends at the end, so move it up to index 1.
    try:
        _bi = wb.sheetnames.index("Brief")
        if _bi != 1:
            wb.move_sheet("Brief", 1 - _bi)
    except ValueError:
        pass
    print("  · ⚠ Checks")
    fail_count = tab_checks(wb, state, run_dir)
    checks_ws = wb["⚠ Checks"]
    fail_labels = getattr(checks_ws, "_forge_fail_labels", [])
    print("  · Part names")
    tab_parts_master(wb, state, run_dir)
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
    add_tab("Connection trace", lambda: tab_connection_trace(wb, state, run_dir))
    add_tab("Cost waterfall", lambda: tab_cost_waterfall(wb, state))
    # ---- ECONOMICS MODEL: Inputs -> Economics -> Scenarios (live + charts).
    # Built in this order so Economics/Scenarios can reference the Inputs cells.
    # Each self-guards (skips cleanly on a class with no usable output metric).
    add_tab(INPUTS_SHEET, lambda: tab_inputs_assumptions(wb, state))
    add_tab("Economics", lambda: tab_economics(wb, state))
    add_tab("Scenarios", lambda: tab_scenarios(wb, state))
    # Investment Analysis depends on the Scenarios sweep (stashed cell ranges) —
    # built immediately after so the sweet-spot INDEX/MATCH + curves can reference it.
    add_tab("Investment Analysis", lambda: tab_investment_analysis(wb, state))
    add_tab("Spec sheets", lambda: tab_spec_sheets(wb, state))
    add_tab("Panel schedule", lambda: tab_panel_schedule(wb, run_dir))
    # process schedules creates 0..3 sheets; treat >0 as success
    add_tab("Process schedules", lambda: tab_process_schedules(wb, run_dir) > 0)
    add_tab("Line & velocity", lambda: tab_line_velocity(wb, run_dir))
    add_tab("Risk register", lambda: tab_risk_register(wb, state))
    add_tab("Regulatory", lambda: tab_regulatory(wb, state))
    add_tab("Assembly sequence", lambda: tab_assembly_sequence(wb, state))
    add_tab("Glossary", lambda: tab_glossary(wb, state))

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
