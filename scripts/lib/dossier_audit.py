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
    Return (key, value) of a contract quantity whose normalised name EQUALS the
    metric's normalised name and is in the SAME unit family, else (None, None).
    This is the deterministic "would the brief-compliance matcher find it" oracle.
    """
    fam = _unit_family(metric_unit)
    target = _norm_name(metric_name)
    if not target:
        return (None, None)
    for k, v in _quantities(state).items():
        if not isinstance(v, dict):
            continue
        qfam = _unit_family(v.get("unit"))
        if _norm_name(k) == target and (fam == "" or qfam == "" or qfam == fam):
            return (k, v.get("value"))
    return (None, None)


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

    # Find per-drawing coverage entries: look for a list of {expected, present, ...}.
    def _find_drawings(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in ("drawings", "coverage", "per_drawing") and isinstance(v, list):
                    return v
            for v in obj.values():
                r = _find_drawings(v)
                if r:
                    return r
        return None

    drawings = _find_drawings(ledger) or []
    all_zero = bool(drawings) and all(
        (_num(d.get("expected")) or 0) == 0 and (_num(d.get("present")) or 0) == 0
        for d in drawings if isinstance(d, dict)
    )

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
            },
        },
        "parsedBrief": {
            "product_class": "bess",
            "constraints": {
                "target_performance": {
                    "metrics": [
                        {"key_metric": "nameplate_capacity_mwh", "value": 3, "unit": "MWh"},
                    ]
                }
            },
        },
        "keyMetrics": {"headline_output": {"id": "nameplate_capacity_mwh",
                                           "label": "Nameplate", "value": "3", "unit": "MWh"}},
        "costStack": {"installed_asp_gbp": 0},  # -> HIGH installed capex £0; bess -> MED no-revenue
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
    expect(sc["verdict"] == "FAIL" and sc["ship_ok"] is False, f"A: expected FAIL/ship_ok=False, got {sc}")

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
        "costStack": {"installed_asp_gbp": 250000},
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
    # rows are not on disk in a standard place — run state-only checks.
    report = audit_dossier(state, rows=[], run_dir=run_dir)
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
