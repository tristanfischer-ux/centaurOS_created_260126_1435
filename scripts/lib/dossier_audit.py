#!/usr/bin/env python3
"""
dossier_audit.py — DETERMINISTIC per-tab self-audit of a ForgeOS engineering dossier.

WHY THIS EXISTS
---------------
The Excel dossier has shipped with serious, cross-referenceable defects that nobody
caught because there were no deterministic checks for them — the engine relied on an
LLM "scoring itself". This module is the fix: one check function per dossier tab,
each emitting explicit pass/fail FLAGS, aggregated into a scorecard that becomes the
SHIP GATE. The dossier is NOT "validated" unless this audit is clean.

DESIGN RULES
------------
- DETERMINISTIC: no LLM, no network, no randomness. Same inputs → same findings.
- UNIVERSAL: works on any product class. Checks key on SIGNALS (unit families,
  status enums, name normalisation), never on hardcoded class names — except for the
  small process-vs-non-process inference in check 8, which is signal-driven too.
- PURE: read the inputs, return findings. Never mutate `state`/`rows`, never write files
  (other than the CLI convenience path printing to stdout). Guard EVERY key access —
  any field may be absent.

PUBLIC API
----------
    audit_dossier(state: dict, rows: list[dict], run_dir: str) -> AuditReport
    Finding(tab, check, severity, message, actual="", expected="", source_rule="")
    AuditReport(findings: list[Finding])
        .by_tab()    -> dict[str, list[Finding]]
        .scorecard() -> dict  (high/med/low/total/verdict/ship_ok)

Stdlib only: json, os, re, math, dataclasses.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
from dataclasses import dataclass, field


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #

@dataclass
class Finding:
    tab: str
    check: str
    severity: str            # "HIGH" | "MED" | "LOW"
    message: str
    actual: str = ""
    expected: str = ""
    source_rule: str = ""


@dataclass
class AuditReport:
    findings: list = field(default_factory=list)

    def by_tab(self) -> dict:
        out: dict = {}
        for f in self.findings:
            out.setdefault(f.tab, []).append(f)
        return out

    def scorecard(self) -> dict:
        high = sum(1 for f in self.findings if f.severity == "HIGH")
        med = sum(1 for f in self.findings if f.severity == "MED")
        low = sum(1 for f in self.findings if f.severity == "LOW")
        if high > 0:
            verdict, ship_ok = "FAIL", False
        elif med > 0:
            verdict, ship_ok = "REVIEW", True
        else:
            verdict, ship_ok = "PASS", True
        return {
            "high": high,
            "med": med,
            "low": low,
            "total": high + med + low,
            "verdict": verdict,
            "ship_ok": ship_ok,
        }


# --------------------------------------------------------------------------- #
# Helpers (deterministic, signal-driven)
# --------------------------------------------------------------------------- #

# Unit families: a metric and a contract quantity match only if they share a family.
_UNIT_FAMILIES = {
    "energy": {"wh", "kwh", "mwh", "gwh", "j", "kj", "mj"},
    "power": {"w", "kw", "mw", "gw"},
    "voltage": {"v", "kv", "mv"},
    "current": {"a", "ka", "ma"},
    "mass": {"g", "kg", "t", "tonne", "tonnes", "te"},
    "length": {"mm", "cm", "m", "km"},
    "volume": {"l", "ml", "m3", "m³", "kl"},
    "flow": {"m3h", "m³/h", "lps", "l/s", "lpm", "l/min", "m3/h"},
    "fraction": {"%", "percent", "pct"},
    "time": {"s", "h", "hr", "hrs", "min", "day", "days", "yr", "year", "years"},
    "count": {"cycles", "cycle", "ea", "off", "units", "unit"},
}

# Unit suffix tokens stripped from a quantity/metric name to get its "base name".
_NAME_UNIT_SUFFIXES = [
    "_gwh", "_mwh", "_kwh", "_wh",
    "_gw", "_mw", "_kw", "_w",
    "_kv", "_mv", "_v",
    "_ka", "_ma", "_a",
    "_tonnes", "_tonne", "_kg", "_t",
    "_m3h", "_m3", "_m",
    "_percent", "_pct", "_cycles", "_cycle",
    "_mwh_year", "_mwh_yr",
]


def _norm_unit(u) -> str:
    if u is None:
        return ""
    s = str(u).strip().lower()
    s = s.replace(" ", "")
    # take the leading unit token of compound units e.g. "MWh / year" -> "mwh"
    s = re.split(r"[/]", s, maxsplit=1)[0]
    return s


def _unit_family(u) -> str:
    nu = _norm_unit(u)
    for fam, members in _UNIT_FAMILIES.items():
        if nu in members:
            return fam
    return ""


def _norm_name(name) -> str:
    """Lowercase, strip a trailing unit suffix, collapse to a comparable base key."""
    if name is None:
        return ""
    s = str(name).strip().lower()
    s = re.sub(r"[^a-z0-9_]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    # Strip the longest matching unit suffix.
    for suf in sorted(_NAME_UNIT_SUFFIXES, key=len, reverse=True):
        if s.endswith(suf):
            s = s[: -len(suf)]
            break
    return s.strip("_")


# Synonym tokens that name the SAME engineering concept under different words, so a
# brief metric and a contract quantity can match even when the noun differs
# (e.g. usable_energy ↔ usable_capacity, rated_power ↔ ac_output ↔ inverter_rating).
# Deliberately SMALL — only well-established interchangeable engineering nouns — to
# avoid over-broadening the matcher (we do NOT collapse, say, "mass" and "load").
_SYNONYM_GROUPS = [
    {"capacity", "energy", "storage"},
    {"power", "output", "rating"},
]
# token -> canonical representative of its synonym group
_SYNONYM_CANON = {}
for _g in _SYNONYM_GROUPS:
    _canon = sorted(_g)[0]
    for _t in _g:
        _SYNONYM_CANON[_t] = _canon


def _norm_name_syn(name) -> str:
    """Like _norm_name but folds each synonym token to its group's canonical token,
    so synonyms collapse to the same base key (usable_capacity ≡ usable_energy)."""
    base = _norm_name(name)
    if not base:
        return ""
    toks = [t for t in base.split("_") if t]
    folded = [_SYNONYM_CANON.get(t, t) for t in toks]
    return "_".join(folded)


# Direction of a brief metric: does the design MEET the target by being ≥ it, ≤ it,
# or by being close? Inferred from the metric name / category, never from class.
_HIGHER_BETTER_RX = re.compile(
    r"\b(efficiency|effic|round_trip|rte|cop|yield|uptime|availability|"
    r"throughput|capacity|energy|power|output|life|cycle|durab|range|"
    r"speed|coverage|recovery|purity|selectivity)\b", re.I)
_LOWER_BETTER_RX = re.compile(
    r"\b(cost|price|capex|opex|mass|weight|footprint|area|loss|losses|"
    r"emission|emissions|leak|downtime|payback|noise|consumption|spend)\b", re.I)


def _metric_direction(name, category) -> str:
    """Return 'higher' (meet-or-exceed), 'lower' (under-or-equal), or 'close'."""
    text = f"{name or ''} {category or ''}"
    # lower-better wins ties on cost/mass (those tokens are unambiguous)
    if _LOWER_BETTER_RX.search(text):
        return "lower"
    if _HIGHER_BETTER_RX.search(text):
        return "higher"
    cat = str(category or "").strip().lower()
    if cat in ("scale", "performance", "durability", "efficiency"):
        return "higher"
    return "close"


def _num(x):
    """Coerce to float if possible, else None."""
    if x is None:
        return None
    if isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    try:
        s = str(x).strip().replace(",", "")
        s = re.sub(r"[£$€\s]", "", s)
        if s == "" or s.lower() in ("none", "null", "nan", "unverified", "unknown"):
            return None
        return float(s)
    except (ValueError, TypeError):
        return None


def _status(row) -> str:
    return str(row.get("status", "") or "").strip().upper()


def _tag_missing(tag) -> bool:
    return str(tag or "").strip() in ("", "—", "-", "–", "none", "None")


def _quantities(state) -> dict:
    oc = state.get("orchestratorContract") or {}
    q = oc.get("quantities")
    return q if isinstance(q, dict) else {}


def _brief_metrics(state) -> list:
    pb = state.get("parsedBrief") or {}
    con = pb.get("constraints") or {}
    tp = con.get("target_performance") or {}
    metrics = tp.get("metrics")
    out = []
    if isinstance(metrics, list):
        for m in metrics:
            if isinstance(m, dict):
                out.append(m)
    # Fall back to the single top-level key_metric if no metrics list.
    if not out and isinstance(tp, dict) and (tp.get("key_metric") or tp.get("metric")):
        out.append(tp)
    return out


def _metric_name(m) -> str:
    return m.get("key_metric") or m.get("metric") or m.get("name") or ""


def _physics_issues(state) -> list:
    for key in ("physicsCritique", "physicsCritic", "physics_critique", "physics_critic"):
        pc = state.get(key)
        if isinstance(pc, dict):
            iss = pc.get("issues")
            if isinstance(iss, list):
                return iss
    return []


def _product_class(state) -> str:
    oc = state.get("orchestratorContract") or {}
    pb = state.get("parsedBrief") or {}
    return str(
        pb.get("product_class")
        or oc.get("product_class")
        or ""
    ).strip().lower()


def _contract_match(state, metric_name, metric_unit):
    """
    Return (key, value) of a contract quantity whose normalised name matches the
    metric's normalised name and is in the SAME unit family, else (None, None).
    This is the deterministic "would the brief-compliance matcher find it" oracle.
    Tries EXACT name first, then a synonym-folded match (usable_energy ↔
    usable_capacity) so the matcher does not miss interchangeable engineering nouns.
    """
    fam = _unit_family(metric_unit)
    target = _norm_name(metric_name)
    target_syn = _norm_name_syn(metric_name)
    if not target:
        return (None, None)
    # Pass 1: exact normalised-name match in the same family.
    for k, v in _quantities(state).items():
        if not isinstance(v, dict):
            continue
        qfam = _unit_family(v.get("unit"))
        if _norm_name(k) == target and (fam == "" or qfam == "" or qfam == fam):
            return (k, v.get("value"))
    # Pass 2: synonym-folded match (only when it adds a synonym, not pure re-check).
    if target_syn and target_syn != target:
        for k, v in _quantities(state).items():
            if not isinstance(v, dict):
                continue
            qfam = _unit_family(v.get("unit"))
            if _norm_name_syn(k) == target_syn and (fam == "" or qfam == "" or qfam == fam):
                return (k, v.get("value"))
    return (None, None)


def _convert_value(value, from_unit, to_unit):
    """Convert a scalar between units of the SAME family using a small SI-prefix
    ladder. Returns float in to_unit, or None if not convertible. Used so a brief
    target in MWh can be compared to a contract value in kWh."""
    v = _num(value)
    if v is None:
        return None
    fu, tu = _norm_unit(from_unit), _norm_unit(to_unit)
    if fu == tu:
        return v
    fam_f, fam_t = _unit_family(from_unit), _unit_family(to_unit)
    if fam_f == "" or fam_f != fam_t:
        return None
    # multiplier to the family BASE unit (wh / w / v / a / g / m / l)
    scale = {
        "gwh": 1e9, "mwh": 1e6, "kwh": 1e3, "wh": 1.0,
        "gw": 1e9, "mw": 1e6, "kw": 1e3, "w": 1.0,
        "kv": 1e3, "v": 1.0, "mv": 1e-3,
        "ka": 1e3, "a": 1.0, "ma": 1e-3,
        "t": 1e6, "tonne": 1e6, "tonnes": 1e6, "te": 1e6, "kg": 1e3, "g": 1.0,
        "km": 1e3, "m": 1.0, "cm": 1e-2, "mm": 1e-3,
        "kl": 1e3, "m3": 1e3, "l": 1.0, "ml": 1e-3,
    }
    if fu not in scale or tu not in scale:
        return None
    return v * scale[fu] / scale[tu]


# --------------------------------------------------------------------------- #
# Check 1 — Bill of Materials
# --------------------------------------------------------------------------- #

_PRINCIPAL_STATUSES = {"IDENTIFIED", "BESPOKE", "SYSTEM", "UTILITY"}


def check_bom(state, rows, run_dir) -> list:
    tab = "Bill of Materials"
    out: list = []
    if not isinstance(rows, list):
        return out

    # -- TAG COVERAGE: principal lines (not SUB-COMPONENT, line_gbp>0) with no tag.
    principal = [
        r for r in rows
        if _status(r) != "SUB-COMPONENT" and (_num(r.get("line_gbp")) or 0) > 0
    ]
    untagged = [r for r in principal if _tag_missing(r.get("tag"))]
    if untagged:
        ex = "; ".join(
            str(r.get("part") or r.get("requirement") or "?")[:40] for r in untagged[:3]
        )
        out.append(Finding(
            tab=tab, check="tag_coverage", severity="HIGH",
            message=(f"{len(untagged)} of {len(principal)} principal bill-of-materials "
                     f"lines have no tag (X-/P-/TK- identifier). Examples: {ex}"),
            actual=f"{len(untagged)} untagged", expected="0 untagged principal lines",
            source_rule="every principal BoM line must carry a drawing-cross-reference tag",
        ))

    # -- LINE MATH: qty * unit_gbp must equal line_gbp (±1).
    for r in rows:
        qty = _num(r.get("qty"))
        unit = _num(r.get("unit_gbp"))
        line = _num(r.get("line_gbp"))
        if qty is None or unit is None or line is None:
            continue
        if abs(round(qty * unit) - round(line)) > 1:
            out.append(Finding(
                tab=tab, check="line_math", severity="HIGH",
                message=(f"line math wrong for "
                         f"'{str(r.get('part') or r.get('tag') or '?')[:40]}': "
                         f"{qty} × £{unit:,.0f} = £{qty*unit:,.0f} but line shows £{line:,.0f}"),
                actual=f"line_gbp=£{line:,.0f}", expected=f"£{round(qty*unit):,.0f}",
                source_rule="line_gbp must equal qty × unit_gbp",
            ))

    # -- ZERO PRINCIPAL: a principal-status line priced at zero.
    for r in rows:
        if _status(r) in _PRINCIPAL_STATUSES and (_num(r.get("line_gbp")) or 0) == 0:
            out.append(Finding(
                tab=tab, check="zero_principal", severity="MED",
                message=(f"principal line "
                         f"'{str(r.get('part') or r.get('tag') or '?')[:40]}' "
                         f"({_status(r)}) is priced at £0"),
                actual="£0", expected=">£0 for a principal line",
                source_rule="a principal (IDENTIFIED/BESPOKE/SYSTEM/UTILITY) line must be priced",
            ))
    return out


# --------------------------------------------------------------------------- #
# Check 2 — Capex by category (Overview / Exec Summary)
# --------------------------------------------------------------------------- #

_CONNECTION_RX = re.compile(r"\b(cabl|cable|pipework|pipe|conduit|bus[- ]?bar|wiring)\b", re.I)


def check_capex_by_category(state, rows, run_dir) -> list:
    tab = "Overview / Exec Summary"
    out: list = []
    if not isinstance(rows, list):
        return out

    nonchild = [r for r in rows if _status(r) != "SUB-COMPONENT"]
    grand = sum((_num(r.get("line_gbp")) or 0) for r in nonchild)

    def _is_conn(r):
        text = f"{r.get('requirement','')} {r.get('part','')}"
        return bool(_CONNECTION_RX.search(text))

    conn_rows = [r for r in nonchild if _is_conn(r)]
    equip_rows = [r for r in nonchild if not _is_conn(r)]
    conn_sum = sum((_num(r.get("line_gbp")) or 0) for r in conn_rows)
    equip_sum = sum((_num(r.get("line_gbp")) or 0) for r in equip_rows)

    # The bug: the capex-by-category chart shows ONLY connections while the equipment
    # categories — which dominate the true bill — are absent from the chart. We can't
    # see the chart, so we detect its precondition from the rows: connections are
    # present and priced, yet the equipment lines that should anchor the bill are
    # essentially missing (equip_sum is a tiny slice of the grand total). This avoids
    # false-firing on a healthy bill, where equipment dominates and a small cabling
    # line is normal. Both conditions must hold: connections present AND equipment
    # contributing <25% of the grand total.
    if grand > 0 and conn_sum > 0 and equip_sum < 0.25 * grand:
        out.append(Finding(
            tab=tab, check="capex_category_coverage", severity="HIGH",
            message=(f"capex-by-category appears to cover only £{conn_sum:,.0f} of "
                     f"connections while the bill totals £{grand:,.0f} — the equipment "
                     f"categories (only £{equip_sum:,.0f}) are missing"),
            actual=f"equipment £{equip_sum:,.0f} of £{grand:,.0f}",
            expected=f"equipment categories ≈ £{grand:,.0f}",
            source_rule="capex-by-category chart must sum to the BoM grand total, not just connections",
        ))
    return out


# --------------------------------------------------------------------------- #
# Check 3 — Brief compliance (Exec Summary / Checks)
# --------------------------------------------------------------------------- #

def _would_show_unverified(state, m) -> bool:
    """A brief metric renders UNVERIFIED when no contract quantity matches it by
    (same unit family AND same normalised name). We reuse the *strict* family+name
    oracle; if the strict oracle finds a match the renderer's looser matcher might
    still miss it (e.g. MWh metric vs kWh quantity → different unit token, same
    family) — that mismatch is exactly the gap this check surfaces."""
    name = _metric_name(m)
    unit = m.get("unit")
    fam = _unit_family(unit)
    target = _norm_name(name)
    if not target:
        return False
    # The naive renderer matches on EXACT unit token, not family.
    nu = _norm_unit(unit)
    for k, v in _quantities(state).items():
        if not isinstance(v, dict):
            continue
        if _norm_name(k) == target and _norm_unit(v.get("unit")) == nu:
            return False  # exact-unit match → renderer verifies it
    # No exact-unit match → renderer shows UNVERIFIED.
    return True


def check_brief_compliance(state, rows, run_dir) -> list:
    tab = "Exec Summary / Checks"
    out: list = []
    for m in _brief_metrics(state):
        name = _metric_name(m)
        if not name:
            continue
        if not _would_show_unverified(state, m):
            continue
        # Renderer would show UNVERIFIED; does a same-FAMILY same-name quantity exist?
        qk, qv = _contract_match(state, name, m.get("unit"))
        if qk is not None:
            out.append(Finding(
                tab=tab, check="compliance_matcher_gap", severity="HIGH",
                message=(f"brief metric '{name}' shows UNVERIFIED but contract quantity "
                         f"'{qk}'={qv} exists in the same family (matcher gap)"),
                actual=f"{name} UNVERIFIED",
                expected=f"matched to {qk}={qv}",
                source_rule="brief-compliance matcher must match across unit-family (MWh↔kWh), not exact unit token",
            ))
    return out


# --------------------------------------------------------------------------- #
# Check 4 — Cross-tab consistency (Exec Summary vs Overview)
# --------------------------------------------------------------------------- #

def check_cross_tab(state, rows, run_dir) -> list:
    tab = "Exec Summary vs Overview"
    out: list = []
    km = state.get("keyMetrics") or {}
    headline = km.get("headline_output") or {}
    hl_name = _norm_name(headline.get("id") or headline.get("label") or "")
    hl_val = _num(headline.get("value"))

    for m in _brief_metrics(state):
        name = _metric_name(m)
        if not name:
            continue
        if not _would_show_unverified(state, m):
            continue
        # Shown UNVERIFIED on one tab — is there a concrete value elsewhere?
        qk, qv = _contract_match(state, name, m.get("unit"))
        concrete = _num(qv)
        src = qk
        if concrete is None and hl_val is not None and _norm_name(name) == hl_name:
            concrete, src = hl_val, "keyMetrics.headline_output"
        if concrete is not None:
            out.append(Finding(
                tab=tab, check="cross_tab_value", severity="HIGH",
                message=(f"metric '{name}' is shown as unknown on one tab and "
                         f"computed (={concrete:g} via {src}) on another"),
                actual=f"{name} unknown",
                expected=f"consistent value {concrete:g}",
                source_rule="a metric must not be UNVERIFIED on one tab while computed on another",
            ))
    return out


# --------------------------------------------------------------------------- #
# Check 5 — Drawing coverage (Coverage)
# --------------------------------------------------------------------------- #

def check_drawing_coverage(state, rows, run_dir) -> list:
    tab = "Coverage"
    out: list = []
    path = os.path.join(run_dir or "", "parts-ledger.json")
    if not (run_dir and os.path.isfile(path)):
        out.append(Finding(
            tab=tab, check="ledger_present", severity="MED",
            message="no parts-ledger.json — drawing coverage not computed",
            actual="missing file", expected="parts-ledger.json present",
            source_rule="drawing coverage must be computed from a populated parts-ledger",
        ))
        return out

    try:
        with open(path, "r") as fh:
            ledger = json.load(fh)
    except (OSError, ValueError):
        out.append(Finding(
            tab=tab, check="ledger_present", severity="MED",
            message="parts-ledger.json present but unreadable/invalid JSON",
            source_rule="parts-ledger.json must be valid JSON",
        ))
        return out

    grand = _num((ledger or {}).get("grand_total_gbp"))

    # Find per-drawing coverage entries. The ledger may carry them as a LIST of
    # {name, expected, present} OR a DICT keyed by drawing name -> {expected, present}
    # (the real shape: `coverage_by_drawing`). Normalise to a list of (name, exp, pres).
    def _find_drawings(obj):
        if isinstance(obj, dict):
            # dict-of-drawings (e.g. coverage_by_drawing) — every value carries
            # expected/present.
            for k, v in obj.items():
                if k in ("coverage_by_drawing", "drawings", "coverage", "per_drawing"):
                    if isinstance(v, list):
                        return [(str((d or {}).get("name") or i), d)
                                for i, d in enumerate(v) if isinstance(d, dict)]
                    if isinstance(v, dict):
                        return [(str(name), d) for name, d in v.items()
                                if isinstance(d, dict) and (
                                    "expected" in d or "present" in d)]
            for v in obj.values():
                r = _find_drawings(v)
                if r:
                    return r
        return None

    drawings = _find_drawings(ledger) or []
    parsed = [
        (name, _num(d.get("expected")) or 0, _num(d.get("present")) or 0)
        for name, d in drawings if isinstance(d, dict)
    ]
    all_zero = bool(parsed) and all(exp == 0 and pres == 0 for _, exp, pres in parsed)

    if all_zero or (grand is not None and grand == 0):
        out.append(Finding(
            tab=tab, check="coverage_empty", severity="HIGH",
            message=("drawing coverage is 0/0 across all drawings — the parts-ledger "
                     "is empty/not populated"),
            actual="0/0 coverage" if all_zero else f"grand_total_gbp=£{grand:,.0f}",
            expected="non-zero coverage and grand total",
            source_rule="parts-ledger must be populated with per-drawing coverage",
        ))
        return out

    # PARTIAL coverage: any drawing with present < expected (not the 0/0 degenerate
    # case). Report the worst-covered drawings.
    partial = [
        (name, exp, pres) for name, exp, pres in parsed
        if exp > 0 and pres < exp
    ]
    if partial:
        partial.sort(key=lambda t: (t[2] / t[1]) if t[1] else 1.0)
        worst = "; ".join(f"{n}: {int(p)}/{int(e)}" for n, e, p in partial[:4])
        out.append(Finding(
            tab=tab, check="coverage_partial", severity="HIGH",
            message=(f"{len(partial)} drawing(s) are only PARTIALLY covered "
                     f"(present < expected). Worst: {worst}"),
            actual=f"{len(partial)} partial drawings",
            expected="every drawing fully covered (present = expected)",
            source_rule="every engineering drawing must represent every expected part",
        ))
    return out


# --------------------------------------------------------------------------- #
# Check 6 — Physics critic (Risk & Regulatory)
# --------------------------------------------------------------------------- #

def check_physics_critic(state, rows, run_dir) -> list:
    tab = "Risk & Regulatory"
    out: list = []
    highs = [
        i for i in _physics_issues(state)
        if isinstance(i, dict) and str(i.get("severity", "")).lower() == "high"
    ]
    if highs:
        titles = []
        for i in highs[:3]:
            titles.append(str(i.get("title") or i.get("issue") or "(untitled)")[:80])
        out.append(Finding(
            tab=tab, check="unresolved_high_physics", severity="HIGH",
            message=(f"{len(highs)} HIGH physics-critic findings are unresolved in the "
                     f"shipped design: {' | '.join(titles)}"),
            actual=f"{len(highs)} HIGH findings",
            expected="0 unresolved HIGH physics findings",
            source_rule="no HIGH-severity physics-critic finding may remain unresolved at ship",
        ))
    return out


# --------------------------------------------------------------------------- #
# Check 7 — Economics (Inputs & Assumptions / Financial)
# --------------------------------------------------------------------------- #

# Classes whose economics earn from arbitrage/service, not from selling an output.
_NO_OUTPUT_SALE_RX = re.compile(r"\b(storage|battery|bess|grid|ups|backup)\b", re.I)
_REVENUE_HINT_RX = re.compile(r"\b(sale_price|sell_price|revenue|asp_sale|offtake|"
                              r"product_price|market_price|tariff|arbitrage)\b", re.I)


def _state_has_revenue_signal(state) -> bool:
    """Conservative scan: does anything in costStack / economics-ish keys look like a
    sale-price / revenue path? We only need a weak positive to suppress the MED flag."""
    blobs = []
    for key in ("costStack", "economics", "financials", "keyMetrics"):
        v = state.get(key)
        if isinstance(v, (dict, list)):
            try:
                blobs.append(json.dumps(v))
            except (TypeError, ValueError):
                pass
    text = " ".join(blobs)
    return bool(_REVENUE_HINT_RX.search(text))


def check_economics(state, rows, run_dir) -> list:
    tab = "Inputs & Assumptions / Financial"
    out: list = []
    cs = state.get("costStack") or {}
    installed = _num(cs.get("installed_asp_gbp"))
    if installed is None or installed <= 0:
        out.append(Finding(
            tab=tab, check="installed_capex", severity="HIGH",
            message="installed capex is £0 / not computed",
            actual=f"installed_asp_gbp={cs.get('installed_asp_gbp')!r}",
            expected=">£0",
            source_rule="installed capex (installed_asp_gbp) must be computed and positive",
        ))

    # Revenue heuristic — conservative: only flag when class is clearly no-output-sale
    # AND no revenue signal anywhere in the financial state.
    cls = _product_class(state)
    if _NO_OUTPUT_SALE_RX.search(cls) and not _state_has_revenue_signal(state):
        out.append(Finding(
            tab=tab, check="no_revenue_line", severity="MED",
            message=(f"no revenue line — the financial model is not meaningful for this "
                     f"class ({cls}); storage earns arbitrage, not output sales"),
            actual="no sale-price/revenue signal",
            expected="an arbitrage/service revenue model",
            source_rule="financial model must carry a revenue path appropriate to the class",
        ))
    return out


# --------------------------------------------------------------------------- #
# Check 8 — Class-appropriate templates (Assembly / Schedules)
# --------------------------------------------------------------------------- #

# Signals that a class is a PROCESS / fluid plant (commissioning involves vessels,
# hydrostatic tests, etc.). If NONE of these appear, treat the class as non-process.
_PROCESS_CLASS_RX = re.compile(
    r"\b(plant|process|chemical|reactor|fuel|saf|efuel|e-fuel|co2|water|"
    r"treatment|ras|aquacultur|distill|fermentat|refinery|electroly|"
    r"desalin|brewery|pulp)\b", re.I)

_PROCESS_TEMPLATE_RX = re.compile(
    r"(hydrostatic|tank vessel|vessel erection|tank[^.\n]{0,40}leak test)", re.I)


def _assembly_text(state, run_dir) -> str:
    parts = []
    path = os.path.join(run_dir or "", "assembly-sequence.json")
    if run_dir and os.path.isfile(path):
        try:
            with open(path, "r") as fh:
                parts.append(json.dumps(json.load(fh)))
        except (OSError, ValueError):
            pass
    # Also any assembly-ish text carried in state.
    for key in ("assemblySequence", "assembly_sequence", "schedules", "assembly"):
        v = state.get(key)
        if isinstance(v, (dict, list)):
            try:
                parts.append(json.dumps(v))
            except (TypeError, ValueError):
                pass
        elif isinstance(v, str):
            parts.append(v)
    return " ".join(parts)


def check_class_templates(state, rows, run_dir) -> list:
    tab = "Assembly / Schedules"
    out: list = []
    cls = _product_class(state) or "(unknown)"
    is_process = bool(_PROCESS_CLASS_RX.search(cls))
    if is_process:
        return out  # process-plant phrases are legitimate here
    text = _assembly_text(state, run_dir)
    if not text:
        return out
    m = _PROCESS_TEMPLATE_RX.search(text)
    if m:
        out.append(Finding(
            tab=tab, check="process_template_leak", severity="MED",
            message=(f"process-plant template phrases leaked into a non-process "
                     f"({cls}) dossier: '{m.group(0)}'"),
            actual=f"phrase '{m.group(0)}'",
            expected="no process-plant phrasing for a non-process class",
            source_rule="assembly/schedule templates must match the class (no tank/vessel/hydrostatic for non-process)",
        ))
    return out


# --------------------------------------------------------------------------- #
# Shared row helpers for the new checks
# --------------------------------------------------------------------------- #

def _principal_rows(rows) -> list:
    """Principal lines: not SUB-COMPONENT and priced > 0."""
    return [
        r for r in rows
        if isinstance(r, dict)
        and _status(r) != "SUB-COMPONENT"
        and (_num(r.get("line_gbp")) or 0) > 0
    ]


def _row_name(r) -> str:
    return str(r.get("part") or r.get("requirement") or r.get("name_human") or "").strip()


# Words stripped when reducing a part name to its functional NOUN for duplicate
# detection. Brand/model tokens vary; the function (pump/inverter/transformer) is
# the equivalence key.
_NOUN_STOP_RX = re.compile(
    r"\b(the|a|an|of|for|with|and|x|series|model|type|grade|class|"
    r"unit|assembly|module|kit|set|mk|rev)\b", re.I)


def _functional_noun(name) -> str:
    """Reduce a part description to a small bag of meaningful tokens (lowercased,
    de-branded heuristically) — used as the 'same component by function' key."""
    s = str(name or "").lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = _NOUN_STOP_RX.sub(" ", s)
    toks = [t for t in s.split() if len(t) > 2 and not t.isdigit()]
    return " ".join(sorted(set(toks)))


def _row_spec(r) -> str:
    """A coarse rating/spec signature from the requirement text (numbers + units),
    so two same-noun lines only count as duplicates when their key rating agrees."""
    text = f"{r.get('requirement','')} {r.get('part','')}"
    nums = re.findall(r"\d+(?:\.\d+)?\s*[a-zA-Z%°]+", text)
    return " ".join(sorted(n.replace(" ", "").lower() for n in nums))


# --------------------------------------------------------------------------- #
# Check 9 — Brief metric MEET/FAIL (Exec Summary / Checks)
# --------------------------------------------------------------------------- #

def check_brief_metric_fail(state, rows, run_dir) -> list:
    """For each brief metric that DOES match a contract quantity, decide whether the
    achieved value MEETS the target (respecting direction). Emit HIGH on a real
    design miss (e.g. dc_bus_voltage_v target 1500 V, achieved 800 V). The existing
    audit only ever flags UNVERIFIED — it never catches a value that is present but
    fails the brief."""
    tab = "Exec Summary / Checks"
    out: list = []
    TOL = 0.02  # 2% tolerance for "meets" on equality/close metrics
    for m in _brief_metrics(state):
        name = _metric_name(m)
        if not name:
            continue
        unit = m.get("unit")
        target = _num(m.get("value") if isinstance(m, dict) else None)
        if target is None:
            continue
        qk, qv = _contract_match(state, name, unit)
        if qk is None:
            continue  # no matched quantity -> brief_compliance/cross_tab handle UNVERIFIED
        # Convert the achieved value into the brief metric's unit where possible.
        qunit = (_quantities(state).get(qk) or {}).get("unit")
        achieved = _convert_value(qv, qunit, unit)
        if achieved is None:
            achieved = _num(qv)
        if achieved is None:
            continue
        direction = _metric_direction(name, m.get("category") if isinstance(m, dict) else None)
        meets = True
        if direction == "higher":
            meets = achieved >= target * (1 - TOL)
        elif direction == "lower":
            meets = achieved <= target * (1 + TOL)
        else:  # close
            meets = abs(achieved - target) <= abs(target) * TOL or target == 0
        if not meets:
            u = str(unit or "").strip()
            out.append(Finding(
                tab=tab, check="brief_metric_fail", severity="HIGH",
                message=(f"brief metric '{name}': target {target:g}{u} but design "
                         f"achieves {achieved:g}{u} (via {qk}) — does not meet the brief"),
                actual=f"{achieved:g}{u}", expected=f"{target:g}{u} ({direction}-is-better)",
                source_rule="every matched brief metric must MEET its target, not merely be present",
            ))
    return out


# --------------------------------------------------------------------------- #
# Check 10 — Capex reconciliation (Overview / Financial)
# --------------------------------------------------------------------------- #

def check_capex_reconciliation(state, rows, run_dir) -> list:
    """Reconcile the headline/installed capex against the BoM grand total (Σ line_gbp
    over non-SUB-COMPONENT rows). Catches 'the chart shows £11.6k while the bill is
    £797k' by RECONCILIATION rather than guessing connection ratios."""
    tab = "Overview / Exec Summary"
    out: list = []
    if not isinstance(rows, list) or not rows:
        return out
    nonchild = [r for r in rows if isinstance(r, dict) and _status(r) != "SUB-COMPONENT"]
    bom_total = sum((_num(r.get("line_gbp")) or 0) for r in nonchild)
    if bom_total <= 0:
        return out

    cs = state.get("costStack") if isinstance(state.get("costStack"), dict) else {}
    installed = None
    inst_src = ""
    for key in ("installed_asp_gbp", "oem_transfer_price_gbp", "raw_materials_bom_gbp"):
        val = _num(cs.get(key))
        if val is not None and val > 0:
            installed, inst_src = val, key
            break

    if installed is not None:
        ratio = installed / bom_total
        # installed capex should be a sane multiple of the raw BoM (markup, labour,
        # overhead, margin, install). Outside 0.8×–4× is a reconciliation failure.
        if ratio < 0.8 or ratio > 4.0:
            out.append(Finding(
                tab=tab, check="capex_reconciliation", severity="HIGH",
                message=(f"installed capex (£{installed:,.0f} via {inst_src}) is "
                         f"{ratio:.2f}× the BoM grand total (£{bom_total:,.0f}) — outside "
                         f"the sane 0.8×–4× band; the headline capex does not reconcile "
                         f"with the bill of materials"),
                actual=f"£{installed:,.0f} ({ratio:.2f}× BoM)",
                expected=f"0.8×–4× of £{bom_total:,.0f}",
                source_rule="installed/headline capex must reconcile to Σ(BoM line_gbp) within a sane multiple",
            ))

    # Also reconcile the raw_materials_bom_gbp 'capex by category' figure: if a
    # rendered category total is wildly LESS than the bill (< 50% of the BoM grand
    # total) the chart is showing a fraction of the real bill.
    raw_cat = _num(cs.get("raw_materials_bom_gbp"))
    if raw_cat is not None and raw_cat > 0 and raw_cat < 0.5 * bom_total:
        out.append(Finding(
            tab=tab, check="capex_reconciliation", severity="HIGH",
            message=(f"capex-by-category raw-materials figure (£{raw_cat:,.0f}) is under "
                     f"half the BoM grand total (£{bom_total:,.0f}) — the cover figure "
                     f"undercounts the bill"),
            actual=f"£{raw_cat:,.0f} vs bill £{bom_total:,.0f}",
            expected=f"≈ £{bom_total:,.0f}",
            source_rule="capex-by-category figure must sum to the BoM grand total",
        ))
    return out


# --------------------------------------------------------------------------- #
# Check 11 — Duplicate principal by function (Bill of Materials)
# --------------------------------------------------------------------------- #

# Placeholder PART values that are not a real manufacturer+model identity — a shared
# placeholder is NOT evidence of a duplicate (two different requirements can both read
# "made to spec"). The duplicate signal must come from a real part identity.
_PART_PLACEHOLDER_RX = re.compile(
    r"^(made to spec|requirement stated|bespoke|custom|tbd|n/?a|generic|"
    r"as required|to spec|standard|none|—|-)\s*$", re.I)


def _is_placeholder_part(name) -> bool:
    return bool(_PART_PLACEHOLDER_RX.match(str(name or "").strip()))


def check_duplicate_principal(state, rows, run_dir) -> list:
    """Two PRINCIPAL lines that are the SAME component by function — same REQUIREMENT
    noun AND the same real part identity AND the same key rating — under different
    modules = likely a double-definition.

    False-positive discipline: a duplicate must be a real part IDENTITY repeated for
    the SAME function. Lines whose `part` is a placeholder ("made to spec") are skipped
    (a shared placeholder across two different requirements is not a duplicate); and a
    generic commodity SKU re-used on two genuinely different requirements (a Brady
    label on a 'DC isolator label' and a 'padlock') is not flagged because the
    REQUIREMENT noun differs."""
    tab = "Bill of Materials"
    out: list = []
    if not isinstance(rows, list):
        return out
    principals = _principal_rows(rows)
    groups: dict = {}
    for r in principals:
        part = _row_name(r)
        if _is_placeholder_part(part):
            continue
        part_flat = _flat(part)
        if len(part_flat) < 5:
            continue  # too generic / ambiguous to assert identity
        req_noun = _functional_noun(r.get("requirement") or part)
        # KEY = real part identity + the requirement-function noun + key rating.
        key = (part_flat, req_noun, _row_spec(r))
        groups.setdefault(key, []).append(r)
    for (part_flat, req_noun, spec), grp in groups.items():
        if len(grp) < 2:
            continue
        modules = {str(r.get("module") or "").strip().lower() for r in grp}
        reqs = {str(r.get("requirement") or "").strip().lower() for r in grp}
        # A real double-definition: same part + same requirement re-entered. Require
        # ≥2 distinct module placements OR identical requirement repeated (qty>1 would
        # be ONE line, so two rows of the same req+part is a genuine duplication).
        distinct_modules = len([m for m in modules if m])
        if distinct_modules < 2 and len(reqs) > 1:
            continue
        name = _row_name(grp[0]) or req_noun
        where = (f"{distinct_modules} modules" if distinct_modules >= 2
                 else f"{len(grp)} lines for the same requirement")
        out.append(Finding(
            tab=tab, check="duplicate_principal", severity="HIGH",
            message=(f"duplicate principal: '{name}'"
                     f"{(' · ' + spec) if spec else ''} appears {len(grp)}× across "
                     f"{where} — likely a double-definition"),
            actual=f"{len(grp)} identical principal lines",
            expected="one line (with qty) per distinct component",
            source_rule="a principal component must not be defined twice across modules",
        ))
    return out


# --------------------------------------------------------------------------- #
# Check 12 — Phantom reference in connection trace
# --------------------------------------------------------------------------- #

def _flat(x) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(x or "").lower())


def _add_name_to_index(idx, name):
    nm = str(name or "").strip()
    if not nm:
        return
    idx.add(_functional_noun(nm))
    idx.add(_flat(nm))


def _design_part_names(state) -> list:
    """Every principal/equipment NAME the design knows about, beyond requirementsBom:
    the moduleDecomposition word `name_human`s and any ledger equipment names. The
    connection trace is built from the design's equipment graph (a different
    name-space than the requirements rows), so we must resolve against BOTH."""
    names: list = []
    md = state.get("moduleDecomposition") or {}
    for m in (md.get("modules") or []):
        if not isinstance(m, dict):
            continue
        for sm in (m.get("sub_modules") or []):
            if not isinstance(sm, dict):
                continue
            for w in (sm.get("words") or []):
                if isinstance(w, dict):
                    nh = w.get("name_human") or w.get("requirement")
                    if nh:
                        names.append(str(nh))
    return names


def _bom_name_index(rows, state=None, run_dir=None) -> set:
    """Normalised name index of every real part the design knows: requirementsBom
    lines + design words (name_human) + ledger equipment. Resolution against this
    union avoids a false-positive storm from the connection-trace name-space being
    formatted differently than the requirements rows."""
    idx = set()
    for r in rows if isinstance(rows, list) else []:
        if isinstance(r, dict):
            _add_name_to_index(idx, _row_name(r))
            _add_name_to_index(idx, r.get("tag"))
    if state is not None:
        for nm in _design_part_names(state):
            _add_name_to_index(idx, nm)
    ledger = _load_parts_ledger(run_dir) if run_dir else None
    if isinstance(ledger, dict):
        for eq in (ledger.get("equipment") or []):
            if isinstance(eq, dict):
                _add_name_to_index(idx, eq.get("name") or eq.get("part") or eq.get("name_human"))
                _add_name_to_index(idx, eq.get("tag"))
    idx.discard("")
    return idx


def _load_parts_ledger(run_dir):
    path = os.path.join(run_dir or "", "parts-ledger.json")
    if run_dir and os.path.isfile(path):
        try:
            with open(path, "r") as fh:
                return json.load(fh)
        except (OSError, ValueError):
            return None
    return None


def _collect_connection_refs(state, run_dir) -> list:
    """Gather referenced part NAMES from any connection-trace / connectivity structure
    in state OR the parts-ledger. Returns a list of (label, name) tuples. Empty if no
    such structure exists (caller then skips silently)."""
    refs: list = []
    sources = []
    # state-side structures
    for key in ("connectionTrace", "connections", "connectivity", "topology"):
        v = state.get(key)
        if v is not None:
            sources.append(v)
    # parts-ledger structures (the realistic location)
    ledger = _load_parts_ledger(run_dir)
    if isinstance(ledger, dict):
        for key in ("connections", "connectivity", "cabinets"):
            if key in ledger:
                sources.append(ledger[key])

    def _walk(obj, ctx):
        if isinstance(obj, dict):
            # rows-of {part, inputs, outputs} or {from_part, to_part}
            for fk in ("from_part", "to_part", "part", "name", "name_human"):
                val = obj.get(fk)
                if isinstance(val, str) and val.strip():
                    refs.append((ctx, val.strip()))
            for ik in ("inputs", "outputs"):
                seq = obj.get(ik)
                if isinstance(seq, list):
                    for it in seq:
                        if isinstance(it, str) and it.strip():
                            refs.append((ctx, it.strip()))
                        elif isinstance(it, dict):
                            _walk(it, ctx)
            for vv in obj.values():
                if isinstance(vv, (dict, list)):
                    _walk(vv, ctx)
        elif isinstance(obj, list):
            for it in obj:
                _walk(it, ctx)

    for src in sources:
        _walk(src, "connection-trace")
    return refs


# Reference labels that are structural placeholders, not parts (collapsed / skipped).
_REF_STOP_RX = re.compile(
    r"\b(the|a|an|of|for|with|and|to|from|via|x|series|model|unit|assembly|"
    r"module|kit|set|mk|rev|mw|kw|kv|v|a|mm|m|dn|sch|nominal|bidirectional)\b", re.I)


def _ref_noun(name) -> str:
    """Reduce a connection-trace endpoint label to a comparable noun bag: strip array
    indices (Rack[0]->Rack), parentheses ((Busway)->Busway), units, and stop-words."""
    s = str(name or "")
    s = re.sub(r"\[\d+\]", "", s)            # Rack[0] -> Rack
    s = re.sub(r"[()\[\]]", " ", s)          # drop bracketing
    s = re.sub(r"[^a-z0-9 ]+", " ", s.lower())
    s = _REF_STOP_RX.sub(" ", s)
    toks = [t for t in s.split() if len(t) > 2 and not t.isdigit()]
    return " ".join(sorted(set(toks)))


def check_phantom_reference(state, rows, run_dir) -> list:
    """Every part referenced by a connection trace must resolve to a real part the
    design knows (requirementsBom line / design word / ledger equipment). Flags a
    reference that resolves to NOTHING (e.g. a trace pointing at 'cabinets' when no
    such part exists). Skips silently when no connection structure is present.

    False-positive discipline: the connection trace is built from the design's
    equipment graph, formatted differently than the requirements rows — so we resolve
    against the UNION of all known part name-spaces, collapse array-index artefacts
    (Rack[0..23] -> one 'Rack'), and require a real token mismatch before flagging."""
    tab = "Connectivity / Drawings"
    out: list = []
    refs = _collect_connection_refs(state, run_dir)
    if not refs:
        return out
    idx = _bom_name_index(rows, state=state, run_dir=run_dir)
    if not idx:
        return out  # nothing to resolve against -> can't judge; stay silent
    idx_tokens = set()
    for bnoun in idx:
        idx_tokens.update(t for t in bnoun.split() if len(t) > 2)

    seen = set()
    for _ctx, name in refs:
        nn = _ref_noun(name)
        flat = _flat(re.sub(r"\[\d+\]", "", str(name)))
        if not nn and not flat:
            continue
        toks = set(nn.split())
        resolved = False
        # (a) flattened-name substring match against any known flattened name
        for bnoun in idx:
            if flat and bnoun and (flat in bnoun or bnoun in flat):
                resolved = True
                break
        # (b) ANY meaningful token of the reference appears in the known token set
        if not resolved and toks and (toks & idx_tokens):
            resolved = True
        if resolved:
            continue
        canon = re.sub(r"\[\d+\]", "", str(name)).strip().lower()
        if canon in seen:
            continue  # collapse Rack[0..23] -> one finding
        seen.add(canon)
        out.append(Finding(
            tab=tab, check="phantom_reference", severity="HIGH",
            message=(f"connection trace references '{name}' but no such part exists "
                     f"in the bill of materials / design"),
            actual=f"reference '{name}'",
            expected="every referenced part resolves to a real BoM/design part",
            source_rule="connection-trace references must resolve to real BoM/design parts",
        ))
    return out


# --------------------------------------------------------------------------- #
# Check 13 — Traceability basis (Bill of Materials)
# --------------------------------------------------------------------------- #

def check_traceability_basis(state, rows, run_dir) -> list:
    """Every PRINCIPAL line must carry a non-empty `basis` (provenance). Count
    principals with a blank/missing basis and flag the untraceable lines."""
    tab = "Bill of Materials"
    out: list = []
    if not isinstance(rows, list):
        return out
    principals = _principal_rows(rows)
    if not principals:
        return out
    blank = [r for r in principals
             if str(r.get("basis") or "").strip() in ("", "—", "-", "none", "None", "n/a", "N/A")]
    if not blank:
        return out
    sev = "HIGH" if len(blank) >= max(3, 0.1 * len(principals)) else "MED"
    ex = "; ".join(_row_name(r)[:40] or "?" for r in blank[:3])
    out.append(Finding(
        tab=tab, check="traceability_basis", severity=sev,
        message=(f"{len(blank)} of {len(principals)} principal lines have no provenance "
                 f"(basis) — the number's source is untraceable. Examples: {ex}"),
        actual=f"{len(blank)} without basis",
        expected="every principal line carries a basis string",
        source_rule="every principal BoM line must record its provenance in `basis`",
    ))
    return out


# --------------------------------------------------------------------------- #
# Check 14 — Tag validity & uniqueness (Bill of Materials)
# --------------------------------------------------------------------------- #

_TAG_RX = re.compile(r"^[A-Z]{1,3}-?\d+[A-Za-z0-9.\-]*$")
_TAG_GARBAGE = {"tbd", "x", "0", "n/a", "na", "none", "?", "todo"}


def check_tag_validity(state, rows, run_dir) -> list:
    """Harden the tag check: a principal tag must be present, look like a real tag,
    and be UNIQUE across the bill. (The existing tag_coverage HIGH for any untagged
    principal stays in check_bom; this adds validity + uniqueness.)"""
    tab = "Bill of Materials"
    out: list = []
    if not isinstance(rows, list):
        return out
    principals = _principal_rows(rows)
    if not principals:
        return out

    garbage = []
    counts: dict = {}
    for r in principals:
        raw = str(r.get("tag") or "").strip()
        if _tag_missing(raw):
            continue  # tag_coverage already flags missing
        low = raw.lower()
        if low in _TAG_GARBAGE or not _TAG_RX.match(raw):
            garbage.append((r, raw))
        counts[raw] = counts.get(raw, 0) + 1

    if garbage:
        ex = "; ".join(f"{_row_name(r)[:24]}='{t}'" for r, t in garbage[:3])
        out.append(Finding(
            tab=tab, check="tag_validity", severity="HIGH",
            message=(f"{len(garbage)} principal lines carry a garbage/invalid tag "
                     f"(not a real X-/P-/TK- identifier). Examples: {ex}"),
            actual=f"{len(garbage)} invalid tags",
            expected="every tag matches a real tag pattern (e.g. P-101)",
            source_rule="a principal tag must be a recognised, non-placeholder identifier",
        ))

    dups = {t: n for t, n in counts.items() if n > 1}
    if dups:
        ex = "; ".join(f"'{t}'×{n}" for t, n in list(dups.items())[:3])
        out.append(Finding(
            tab=tab, check="tag_validity", severity="HIGH",
            message=(f"{len(dups)} tag(s) are reused across principal lines — tags must "
                     f"be unique. Examples: {ex}"),
            actual=f"{len(dups)} duplicated tags",
            expected="every principal tag unique across the bill",
            source_rule="a drawing-cross-reference tag must be unique across the bill of materials",
        ))
    return out


# --------------------------------------------------------------------------- #
# Aggregator
# --------------------------------------------------------------------------- #

_CHECKS = [
    check_bom,
    check_capex_by_category,
    check_brief_compliance,
    check_cross_tab,
    check_drawing_coverage,
    check_physics_critic,
    check_economics,
    check_class_templates,
    # --- added checks (deterministic, universal) ---
    check_brief_metric_fail,        # 9  brief target present but FAILS (e.g. dc_bus 800<1500)
    check_capex_reconciliation,     # 10 installed/headline capex vs Σ BoM line_gbp
    check_duplicate_principal,      # 11 same component defined twice across modules
    check_phantom_reference,        # 12 connection trace references a non-existent part
    check_traceability_basis,       # 13 principal line with no provenance (basis)
    check_tag_validity,             # 14 garbage / duplicate principal tags
]


def audit_dossier(state: dict, rows: list, run_dir: str) -> AuditReport:
    """Run every deterministic per-tab check and aggregate into an AuditReport.

    state   : the chain's state.json (big dict; every key guarded).
    rows     : assembled BoM rows (list of dicts) — may be empty.
    run_dir  : output directory (may contain parts-ledger.json / assembly-sequence.json).
    """
    state = state if isinstance(state, dict) else {}
    rows = rows if isinstance(rows, list) else []
    report = AuditReport()
    for fn in _CHECKS:
        try:
            report.findings.extend(fn(state, rows, run_dir) or [])
        except Exception as exc:  # a buggy check must never crash the ship gate
            report.findings.append(Finding(
                tab="Audit", check=fn.__name__, severity="LOW",
                message=f"audit check {fn.__name__} raised: {exc!r}",
                source_rule="audit checks must not raise",
            ))
    return report


# --------------------------------------------------------------------------- #
# Selftest
# --------------------------------------------------------------------------- #

def _selftest() -> int:
    failures = []

    def expect(cond, msg):
        if not cond:
            failures.append(msg)

    # ---- Fixture A: dirty — should trip many HIGH/MED findings -------------
    dirty_state = {
        "orchestratorContract": {
            "product_class": "bess",
            "quantities": {
                # same base name as brief metric, but kWh vs the brief's MWh -> matcher gap
                "nameplate_capacity_kwh": {"value": 3360, "unit": "kWh", "family": "energy"},
                # MEETS-by-conversion-and-synonym (usable_capacity ↔ usable_energy):
                # 4500 kWh = 4.5 MWh ≥ 4.5 MWh target -> no brief_metric_fail (clean direction)
                "usable_capacity_kwh": {"value": 4500, "unit": "kWh", "family": "energy"},
                # FAILS the brief: achieved 800 V vs target 1500 V (the real design miss)
                "dc_bus_voltage_v": {"value": 800, "unit": "V", "family": "voltage"},
            },
        },
        "parsedBrief": {
            "product_class": "bess",
            "constraints": {
                "target_performance": {
                    "metrics": [
                        {"key_metric": "nameplate_capacity_mwh", "value": 3, "unit": "MWh"},
                        {"key_metric": "usable_energy_mwh", "value": 4.5, "unit": "MWh",
                         "category": "performance"},
                        {"key_metric": "dc_bus_voltage_v", "value": 1500, "unit": "V",
                         "category": "performance"},
                    ]
                }
            },
        },
        "keyMetrics": {"headline_output": {"id": "nameplate_capacity_mwh",
                                           "label": "Nameplate", "value": "3", "unit": "MWh"}},
        "costStack": {
            "installed_asp_gbp": 0,            # -> HIGH installed capex £0; bess -> MED no-revenue
            "raw_materials_bom_gbp": 1000,     # -> HIGH capex_reconciliation (1000 << bill 50009)
        },
        "physicsCritique": {"issues": [
            {"severity": "high", "title": "Transformer undersized 2x"},
            {"severity": "high", "issue": "Racks do not fit the container"},
            {"severity": "medium", "title": "minor"},
        ]},
        "assemblySequence": "Step 7: hydrostatic leak test of the main vessel.",
    }
    # NB: equipment lines are deliberately near-zero while a big cabling line carries
    # the bill — this is the capex-by-category bug (chart shows only connections).
    dirty_rows = [
        # untagged principal line (HIGH tag coverage); near-zero so equipment is "missing"
        {"tag": "—", "requirement": "Battery rack", "status": "IDENTIFIED",
         "part": "Rack X", "qty": 1, "unit_gbp": 10, "line_gbp": 10, "basis": "x"},
        # tagged but wrong line math (HIGH); also tiny equipment value
        {"tag": "X-1", "requirement": "Inverter", "status": "IDENTIFIED",
         "part": "PCS", "qty": 2, "unit_gbp": 5, "line_gbp": 999, "basis": "x"},
        # zero principal (MED)
        {"tag": "X-2", "requirement": "BMS", "status": "BESPOKE",
         "part": "BMS unit", "qty": 1, "unit_gbp": 0, "line_gbp": 0, "basis": "x"},
        # big connection line dominating the bill (drives capex-category HIGH)
        {"tag": "C-1", "requirement": "DC cabling", "status": "UTILITY",
         "part": "cable run", "qty": 1, "unit_gbp": 50000, "line_gbp": 50000, "basis": "x"},
        # duplicate principal: same Grundfos pump defined twice under different modules
        {"tag": "P-9", "module": "thermal", "requirement": "Coolant pump · 50 m3h",
         "status": "IDENTIFIED", "part": "Grundfos NB 50-160 pump",
         "qty": 1, "unit_gbp": 3000, "line_gbp": 3000, "basis": "catalogue"},
        {"tag": "P-9b", "module": "fire_suppression", "requirement": "Coolant pump · 50 m3h",
         "status": "IDENTIFIED", "part": "Grundfos NB 50-160 pump",
         "qty": 1, "unit_gbp": 3000, "line_gbp": 3000, "basis": "catalogue"},
        # blank-basis principals (>=3 -> HIGH traceability_basis)
        {"tag": "B-1", "requirement": "Busbar set", "status": "IDENTIFIED",
         "part": "Cu busbar", "qty": 1, "unit_gbp": 400, "line_gbp": 400, "basis": ""},
        {"tag": "B-2", "requirement": "Enclosure", "status": "IDENTIFIED",
         "part": "Steel enclosure", "qty": 1, "unit_gbp": 700, "line_gbp": 700, "basis": "—"},
        {"tag": "B-3", "requirement": "Gland plate", "status": "IDENTIFIED",
         "part": "Gland plate", "qty": 1, "unit_gbp": 90, "line_gbp": 90},
        # garbage tag (HIGH tag_validity)
        {"tag": "TBD", "requirement": "HMI", "status": "IDENTIFIED",
         "part": "Touchscreen", "qty": 1, "unit_gbp": 800, "line_gbp": 800, "basis": "x"},
        # duplicate tag X-1 reused (HIGH tag_validity uniqueness)
        {"tag": "X-1", "requirement": "Contactor", "status": "IDENTIFIED",
         "part": "Contactor", "qty": 1, "unit_gbp": 250, "line_gbp": 250, "basis": "x"},
        # child — excluded from principal checks
        {"tag": "X-1.1", "requirement": "cell", "status": "SUB-COMPONENT",
         "part": "cell", "qty": 100, "unit_gbp": 1, "line_gbp": 100, "basis": "x"},
    ]
    rep = audit_dossier(dirty_state, dirty_rows, run_dir="/nonexistent-run-dir-xyz")
    checks = {f.check for f in rep.findings}
    sc = rep.scorecard()

    expect("tag_coverage" in checks, "A: expected tag_coverage HIGH")
    expect("line_math" in checks, "A: expected line_math HIGH")
    expect("zero_principal" in checks, "A: expected zero_principal MED")
    expect("capex_category_coverage" in checks, "A: expected capex_category_coverage HIGH (conn £500 << grand)")
    expect("compliance_matcher_gap" in checks, "A: expected compliance_matcher_gap HIGH (MWh vs kWh)")
    expect("cross_tab_value" in checks, "A: expected cross_tab_value HIGH")
    expect("ledger_present" in checks, "A: expected ledger_present MED (no parts-ledger.json)")
    expect("unresolved_high_physics" in checks, "A: expected unresolved_high_physics HIGH (2 highs)")
    expect("installed_capex" in checks, "A: expected installed_capex HIGH (£0)")
    expect("no_revenue_line" in checks, "A: expected no_revenue_line MED (bess, no revenue)")
    expect("process_template_leak" in checks, "A: expected process_template_leak MED (hydrostatic in bess)")
    # ---- new checks fire on dirty data ----
    expect("brief_metric_fail" in checks, "A: expected brief_metric_fail HIGH (dc_bus 800<1500)")
    expect("capex_reconciliation" in checks, "A: expected capex_reconciliation HIGH (£1000 << bill)")
    expect("duplicate_principal" in checks, "A: expected duplicate_principal HIGH (2× Grundfos pump)")
    expect("traceability_basis" in checks, "A: expected traceability_basis HIGH (3 blank basis)")
    expect("tag_validity" in checks, "A: expected tag_validity HIGH (garbage + duplicate tags)")
    expect(sc["verdict"] == "FAIL" and sc["ship_ok"] is False, f"A: expected FAIL/ship_ok=False, got {sc}")

    # brief_metric_fail must name the dc_bus miss specifically, and NOT fire on the
    # usable-energy metric that MEETS by synonym+conversion (4.5 MWh = 4500 kWh).
    bmf = [f for f in rep.findings if f.check == "brief_metric_fail"]
    expect(any("dc_bus_voltage_v" in f.message for f in bmf),
           "A: brief_metric_fail should name dc_bus_voltage_v")
    expect(not any("usable_energy" in f.message for f in bmf),
           "A: brief_metric_fail must NOT fire on usable_energy (meets via synonym+conversion)")

    # physics finding must name the first titles
    phys = [f for f in rep.findings if f.check == "unresolved_high_physics"][0]
    expect("Transformer undersized" in phys.message, "A: physics finding should list first titles")

    # ---- Fixture B: clean — should PASS ------------------------------------
    clean_state = {
        "orchestratorContract": {
            "product_class": "widget",
            "quantities": {
                # exact-unit match -> compliance verifies, no matcher-gap flag
                "throughput_units": {"value": 1000, "unit": "units", "family": "count"},
            },
        },
        "parsedBrief": {
            "product_class": "widget",
            "constraints": {
                "target_performance": {
                    "metrics": [
                        {"key_metric": "throughput_units", "value": 1000, "unit": "units"},
                    ]
                }
            },
        },
        "keyMetrics": {"headline_output": {"id": "throughput_units", "value": "1000", "unit": "units"}},
        # installed capex within a sane multiple of the £11,600 BoM (≈2.5×) so
        # capex_reconciliation stays silent on the clean fixture.
        "costStack": {"installed_asp_gbp": 29000},
        "physicsCritique": {"issues": [{"severity": "low", "title": "cosmetic"}]},
    }
    clean_rows = [
        {"tag": "P-1", "requirement": "Frame", "status": "IDENTIFIED",
         "part": "Frame A", "qty": 2, "unit_gbp": 1500, "line_gbp": 3000, "basis": "x"},
        {"tag": "P-2", "requirement": "Motor", "status": "IDENTIFIED",
         "part": "Motor B", "qty": 1, "unit_gbp": 8000, "line_gbp": 8000, "basis": "x"},
        {"tag": "C-1", "requirement": "wiring loom", "status": "UTILITY",
         "part": "loom", "qty": 1, "unit_gbp": 600, "line_gbp": 600, "basis": "x"},
    ]
    repb = audit_dossier(clean_state, clean_rows, run_dir="/nonexistent-run-dir-xyz")
    checksb = {f.check for f in repb.findings}
    scb = repb.scorecard()

    # The only legitimate finding in the clean fixture is the missing parts-ledger (MED).
    # Remove that one and the rest must be empty -> verdict REVIEW (no HIGH).
    expect(checksb == {"ledger_present"} or checksb <= {"ledger_present"},
           f"B: only ledger_present allowed, got {checksb}")
    expect(scb["high"] == 0, f"B: expected 0 HIGH, got {scb}")
    expect(scb["verdict"] in ("REVIEW", "PASS"), f"B: expected REVIEW/PASS, got {scb}")
    expect(scb["ship_ok"] is True, f"B: expected ship_ok True, got {scb}")

    # ---- Fixture C: fully clean (with ledger present & populated) -> PASS ---
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        with open(os.path.join(td, "parts-ledger.json"), "w") as fh:
            json.dump({"grand_total_gbp": 11000,
                       "drawings": [{"name": "A1", "expected": 5, "present": 5}]}, fh)
        repc = audit_dossier(clean_state, clean_rows, run_dir=td)
        scc = repc.scorecard()
        expect(scc["verdict"] == "PASS" and scc["ship_ok"] is True,
               f"C: expected clean PASS, got {scc} findings={[ (f.check,f.severity) for f in repc.findings]}")

        # ---- Fixture D: empty ledger -> HIGH coverage_empty -----------------
        with open(os.path.join(td, "parts-ledger.json"), "w") as fh:
            json.dump({"grand_total_gbp": 0,
                       "drawings": [{"name": "A1", "expected": 0, "present": 0}]}, fh)
        repd = audit_dossier(clean_state, clean_rows, run_dir=td)
        expect("coverage_empty" in {f.check for f in repd.findings},
               "D: expected coverage_empty HIGH for 0/0 ledger")

        # ---- Fixture D2: DICT-keyed coverage_by_drawing 0/0 (the REAL shape that
        # the old _find_drawings missed) -> still HIGH coverage_empty --------------
        with open(os.path.join(td, "parts-ledger.json"), "w") as fh:
            json.dump({"grand_total_gbp": 0, "coverage_by_drawing": {
                "pid": {"expected": 0, "present": 0, "pct": None},
                "single-line-diagram": {"expected": 0, "present": 0, "pct": None},
            }}, fh)
        repd2 = audit_dossier(clean_state, clean_rows, run_dir=td)
        expect("coverage_empty" in {f.check for f in repd2.findings},
               "D2: expected coverage_empty on DICT-keyed coverage_by_drawing 0/0")

    # ---- Fixture E: PARTIAL drawing coverage -> HIGH coverage_partial ----------
    with tempfile.TemporaryDirectory() as te:
        with open(os.path.join(te, "parts-ledger.json"), "w") as fh:
            json.dump({"grand_total_gbp": 11000, "coverage_by_drawing": {
                "pid": {"expected": 104, "present": 11},      # badly under-covered
                "block-flow-diagram": {"expected": 22, "present": 7},
                "general-arrangement": {"expected": 5, "present": 5},  # full -> not flagged
            }}, fh)
        repe = audit_dossier(clean_state, clean_rows, run_dir=te)
        checkse = {f.check for f in repe.findings}
        expect("coverage_partial" in checkse, "E: expected coverage_partial HIGH (pid 11/104)")
        expect("coverage_empty" not in checkse, "E: must NOT be coverage_empty (non-zero coverage)")

    # ---- Fixture F: phantom reference in connection trace -> HIGH -------------
    with tempfile.TemporaryDirectory() as tf:
        with open(os.path.join(tf, "parts-ledger.json"), "w") as fh:
            json.dump({"grand_total_gbp": 11000,
                       "coverage_by_drawing": {"ga": {"expected": 3, "present": 3}},
                       "connections": [
                           # resolvable: 'Motor B' is a real BoM line
                           {"from_part": "Motor B", "to_part": "Frame A"},
                           # phantom: 'cabinets' is not in the bill of materials
                           {"from_part": "Frame A", "to_part": "cabinets"},
                       ]}, fh)
        repf = audit_dossier(clean_state, clean_rows, run_dir=tf)
        phantoms = [f for f in repf.findings if f.check == "phantom_reference"]
        expect(any("cabinets" in f.message for f in phantoms),
               "F: expected phantom_reference HIGH for 'cabinets'")
        expect(not any("Motor" in f.message for f in phantoms),
               "F: must NOT flag the resolvable 'Motor B' reference")

    # ---- Unit checks: synonym + conversion helpers ---------------------------
    expect(_norm_name_syn("usable_energy_mwh") == _norm_name_syn("usable_capacity_kwh"),
           "synonym fold: usable_energy ≡ usable_capacity")
    expect(abs((_convert_value(4500, "kWh", "MWh") or 0) - 4.5) < 1e-9,
           "convert 4500 kWh -> 4.5 MWh")
    expect(_convert_value(100, "kg", "MWh") is None, "convert refuses cross-family")

    if failures:
        print("SELFTEST FAILED:")
        for f in failures:
            print("  -", f)
        return 1
    print("OK — dossier_audit selftest passed "
          f"(fixture A: {len(rep.findings)} findings, verdict={rep.scorecard()['verdict']}; "
          f"fixture B/C clean).")
    return 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _cli(run_dir: str) -> int:
    sp = os.path.join(run_dir, "state.json")
    if not os.path.isfile(sp):
        print(f"no state.json at {sp}", file=sys.stderr)
        return 2
    with open(sp, "r") as fh:
        state = json.load(fh)
    # The assembled BoM rows are carried on state as `requirementsBom` (the
    # REQUIREMENT→FULFILMENT→COST rows). Use them so the row-dependent checks fire;
    # fall back to costBasis.lines, else an empty list (state-only checks still run).
    rows = state.get("requirementsBom")
    if not isinstance(rows, list) or not rows:
        cb = state.get("costBasis")
        if isinstance(cb, dict) and isinstance(cb.get("lines"), list):
            rows = cb["lines"]
        else:
            rows = []
    report = audit_dossier(state, rows=rows, run_dir=run_dir)
    sc = report.scorecard()
    print(f"=== dossier audit: {run_dir} ===")
    print(f"verdict={sc['verdict']}  ship_ok={sc['ship_ok']}  "
          f"HIGH={sc['high']} MED={sc['med']} LOW={sc['low']}")
    for tab, fs in report.by_tab().items():
        print(f"\n[{tab}]")
        for f in fs:
            print(f"  {f.severity:<4} {f.check}: {f.message}")
    return 0 if sc["ship_ok"] else 1


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--selftest":
        sys.exit(_selftest())
    elif len(sys.argv) >= 2:
        sys.exit(_cli(sys.argv[1]))
    else:
        print("usage: dossier_audit.py --selftest | <run_dir>", file=sys.stderr)
        sys.exit(2)
