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
    # Normalise exponent notations so m3 ≡ m³ ≡ m^3 (and m2 ≡ m² ≡ m^2). The brief
    # parser is NON-DETERMINISTIC about these: one run emits "m3/hr", the next "m^3/hr"
    # — without this, "m^3" reads as an UNKNOWN family ('') and a flow metric then wrongly
    # matches a unitless COUNT (both '') while the real throughput (volume) is excluded
    # (Codema v7: fertigation/gac/ro_permeate all broke on the caret). 2026-06-27.
    s = s.replace("³", "3").replace("²", "2").replace("^", "")
    # take the leading unit token of compound units e.g. "MWh / year" -> "mwh"
    s = re.split(r"[/]", s, maxsplit=1)[0]
    return s


def _unit_family(u) -> str:
    nu = _norm_unit(u)
    for fam, members in _UNIT_FAMILIES.items():
        if nu in members:
            return fam
    return ""


# Families that are dimensionless / count-like — these may cross-match each other (a "count"
# unit metric ↔ a unitless …_count quantity) but NOT a dimensioned family. The blanket
# "either family is blank → allow" rule was WRONG: it let a flow metric (m3/hr → volume)
# match a unitless COUNT quantity (fertigation_dosing_pump_count=2 reported as "2 m3/hr" — a
# false FAIL hiding that the design delivers 2×45 m³/h). 2026-06-26 Codema v5.
_DIMLESS_FAMILIES = {"", "count"}


def _fam_compatible(a: str, b: str) -> bool:
    """Two unit families may fulfil one another iff they are the SAME family, or BOTH are
    dimensionless/count-like. A dimensioned family (volume/flow/power/mass/…) never matches a
    blank/count family — that cross-match manufactures false PASS/FAIL on the wrong quantity."""
    return a == b or (a in _DIMLESS_FAMILIES and b in _DIMLESS_FAMILIES)


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


# Quantities whose NAME echoes the brief's REQUESTED value (the requirement), not the
# design's ACHIEVED/DELIVERED value. Matching a brief metric against one of these is a
# guaranteed false PASS (e.g. irrigation_demand_m3_h=90 is the REQUIREMENT; the design
# only DELIVERS irrigation_pump_flow_m3_h=12 — matching the demand hides the undersized
# pump). Excluded from the token-subset pass so the honest verdict (FAIL) surfaces.
_ECHO_NAME_TOKENS = {"requested", "request", "target", "brief", "spec",
                     "demand", "required", "setpoint"}
# Tokens carrying no engineering identity — dropped before token-overlap matching.
_MATCH_STOP_TOKENS = {
    "the", "of", "per", "system", "total", "design", "rated", "nominal",
    "max", "min", "peak", "avg", "mean",
    # unit / rate tokens that survive _norm_name on compound names (…_m3_per_hr, …_count)
    "m3", "m2", "m", "h", "hr", "hrs", "day", "yr", "year", "s",
    "kw", "kwh", "kva", "kv", "v", "a", "kg", "t", "l",
    "count", "nr", "no", "qty", "ea", "off", "unit", "units", "pcs", "number",
}


def _singularise(tok: str) -> str:
    """Fold a trailing plural so containers ≡ container, valves ≡ valve."""
    return tok[:-1] if len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss") else tok


def _name_tokens(name) -> set:
    """Engineering-identity tokens of a name: normalised, unit/stop tokens dropped,
    plurals folded. Used for the token-subset compliance match."""
    base = _norm_name(name)
    return {_singularise(t) for t in base.split("_") if t and t not in _MATCH_STOP_TOKENS}


def _contract_match(state, metric_name, metric_unit):
    """
    Return (key, value) of a contract quantity that FULFILS the brief metric (same unit
    family, matching name), else (None, None). This is the deterministic "would the
    brief-compliance matcher find it" oracle. Three passes, most-specific first:
      1. EXACT normalised-name match in the same family.
      2. SYNONYM-folded match (usable_energy ↔ usable_capacity).
      3. TOKEN-SUBSET match in the same family — the brief's identity tokens are covered
         by a quantity's tokens (cultivation_containers ↔ cultivation_container_count,
         ro_permeate_capacity_m3_per_hr ↔ ro_permeate_capacity_m3_h). Requirement-ECHO
         quantities (…_demand / …_target) are EXCLUDED so a brief metric matches the
         DELIVERED quantity (irrigation_pump_flow), never the requirement it restates —
         which keeps a genuine miss honest (a FAIL, not a manufactured PASS).
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
        if _norm_name(k) == target and _fam_compatible(fam, qfam):
            return (k, v.get("value"))
    # Pass 2: synonym-folded match (only when it adds a synonym, not pure re-check).
    if target_syn and target_syn != target:
        for k, v in _quantities(state).items():
            if not isinstance(v, dict):
                continue
            qfam = _unit_family(v.get("unit"))
            if _norm_name_syn(k) == target_syn and _fam_compatible(fam, qfam):
                return (k, v.get("value"))
    # Pass 3: token-subset match in the same family, echoes excluded.
    b_tokens = _name_tokens(metric_name)
    if b_tokens:
        need = max(1, (len(b_tokens) + 1) // 2)  # at least half the brief's tokens covered
        best = None  # (-overlap, peak_penalty, extra_tokens, key, value)
        for k, v in _quantities(state).items():
            if not isinstance(v, dict):
                continue
            if set(_norm_name(k).split("_")) & _ECHO_NAME_TOKENS:
                continue  # requirement-echo → would manufacture a false PASS
            qfam = _unit_family(v.get("unit"))
            if not _fam_compatible(fam, qfam):
                continue
            q_tokens = _name_tokens(k)
            overlap = len(b_tokens & q_tokens)
            if overlap < need:
                continue
            penalty = 1 if re.search(r"peak|max|surge|inrush", str(k).lower()) else 0
            cand = (-overlap, penalty, len(q_tokens - b_tokens), k, v.get("value"))
            if best is None or cand < best:
                best = cand
        if best is not None:
            return (best[3], best[4])
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

    # -- LINE MATH: qty * unit_gbp must equal line_gbp (±1). SUB-COMPONENT rows are EXCLUDED: they
    # carry line_gbp=£0 BY DESIGN (the principal carries the counted/rolled-up price; the sub-rows are
    # an indicative breakdown, not counted in the bill total), so qty×unit≠0 on a £0 sub-row is correct,
    # not a fault. Counting it flagged 202 false HIGHs on the water dossier → BoM forced to 0/10. The
    # line-math invariant applies to PRINCIPAL (counted) lines only.
    for r in rows:
        if _status(r) == "SUB-COMPONENT":
            continue
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
    """A brief metric renders UNVERIFIED iff NO contract quantity fulfils it. The
    rendered compliance table and this oracle share ONE matcher (`_contract_match` —
    family + synonym + token-subset, requirement-echoes excluded), so the table and the
    score never disagree (the old split — strict oracle here, looser matcher in the
    renderer — produced phantom 'matcher gap' findings on metrics that genuinely match,
    e.g. ro_permeate_capacity_m3_per_hr ↔ ro_permeate_capacity_m3_h). Retired the
    separate compliance_matcher_gap check: with one matcher the gap is closed by
    construction (a divergence between the two file-level implementations is now a
    cross-file consistency concern, not a per-metric finding)."""
    name = _metric_name(m)
    if not name:
        return False
    qk, _ = _contract_match(state, name, m.get("unit"))
    return qk is None


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

# A real tag: PREFIX (1-3 caps) + number, optionally a RANGE for a group of identical
# instruments (FCV-201–208 = eight valves on one line, an ISA convention) — the en-dash/
# em-dash must be accepted or a legitimate range reads as garbage (Codema 2026-06-26: the
# only "garbage" tags were FCV-201–208 / LT-201–211 range groups).
_TAG_RX = re.compile(r"^[A-Z]{1,3}-?\d+[A-Za-z0-9.\-–—/]*$")
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
# Check 15 — Tool I/O traceability (Calculations)
# --------------------------------------------------------------------------- #

# An input_summary that names no source: a worked calc whose inputs are untraceable.
_NO_INPUT_TOKENS = {"", "(none)", "none", "n/a", "na", "—", "-", "–"}


def _input_is_missing(claim) -> bool:
    if not isinstance(claim, dict):
        return True
    return str(claim.get("input_summary") or "").strip().lower() in _NO_INPUT_TOKENS


def _output_field_missing(claim) -> bool:
    if not isinstance(claim, dict):
        return True
    out = claim.get("output_field") or claim.get("field")
    return str(out or "").strip() == ""


def check_tool_io_traceability(state, rows, run_dir) -> list:
    """Every worked tool calc must record WHERE its inputs came from (input_summary)
    and WHERE its output goes (output_field). A claim with no input edge means the
    number is not traceable back to its source; a claim with no output destination is
    a dangling result. Counts both across every tool's claims.

    Universal + deterministic — keys on the claim shape only, never on class. Skips
    silently when the run has no tools (some classes/iterations carry none)."""
    tab = "Calculations"
    out: list = []
    tp = state.get("toolsUsedPage")
    if not isinstance(tp, dict):
        return out
    tools = tp.get("tools")
    if not isinstance(tools, list) or not tools:
        return out  # no tools this run -> nothing to judge

    total = 0
    no_input = 0
    no_input_examples: list = []
    for t in tools:
        if not isinstance(t, dict):
            continue
        tid = str(t.get("tool_id") or t.get("tool_name") or "?")
        claims = t.get("claims")
        if not isinstance(claims, list):
            continue
        for c in claims:
            if not isinstance(c, dict):
                continue
            total += 1
            fld = str(c.get("field") or c.get("output_field") or "?")
            if _input_is_missing(c):
                no_input += 1
                if len(no_input_examples) < 3:
                    no_input_examples.append(f"{tid}·{fld}")
            # OUTPUT edge: a claim that declares no output destination at all.
            if _output_field_missing(c):
                out.append(Finding(
                    tab=tab, check="tool_io_traceability", severity="MED",
                    message=(f"tool '{tid}' claim '{fld}' declares no output "
                             f"destination (output_field) — the result is a dangling "
                             f"number with nowhere to flow"),
                    actual="output_field empty",
                    expected="every tool claim names its output_field",
                    source_rule="every tool claim must declare where its output goes (output_field)",
                ))

    if total == 0:
        return out

    # INPUT edge: a large fraction missing an input edge is a real traceability
    # failure (the worked calcs aren't anchored to a source); a smaller fraction is
    # a softer flag.
    if no_input > 0:
        frac = no_input / total
        ex = "; ".join(no_input_examples)
        if frac > 0.40:
            out.append(Finding(
                tab=tab, check="tool_io_traceability", severity="HIGH",
                message=(f"{no_input} of {total} tool claims don't record where their "
                         f"inputs came from (input_summary '(none)') — the worked calcs "
                         f"aren't traceable to their source. Examples: {ex}"),
                actual=f"{no_input}/{total} claims with no input edge ({frac:.0%})",
                expected="every tool claim cites its input source (input_summary)",
                source_rule="every tool claim must record its input provenance (input_summary), not '(none)'",
            ))
        else:
            out.append(Finding(
                tab=tab, check="tool_io_traceability", severity="MED",
                message=(f"{no_input} of {total} tool claims don't record where their "
                         f"inputs came from (input_summary '(none)'). Examples: {ex}"),
                actual=f"{no_input}/{total} claims with no input edge ({frac:.0%})",
                expected="every tool claim cites its input source (input_summary)",
                source_rule="every tool claim must record its input provenance (input_summary), not '(none)'",
            ))
    return out


# --------------------------------------------------------------------------- #
# Aggregator
# --------------------------------------------------------------------------- #

def _as_num(x):
    try:
        return float(x)
    except Exception:  # noqa: BLE001
        return None


def check_brief_unverified(state, rows, run_dir) -> list:
    """Every brief target must be PROVEN against a contract quantity. A pass is good; an
    UNVERIFIED metric is BAD (Tristan 2026-06-26: "a pass is good — unverified and fail are
    bad") — the design cannot be confirmed against its own brief, which usually means the
    brief's SCALE never propagated into the sizing (the Exec Summary showed every metric
    UNVERIFIED while the design was sized ~150× below the 6,000-container brief).

    Scoring honesty: emit ONE HIGH finding PER UNVERIFIED metric (NOT a single softened
    roll-up). The old code collapsed all UNVERIFIED metrics into one finding and downgraded
    it to MED unless 100% were unverified — so a tab whose compliance table was 1-of-5 PASS
    still scored 8/10. Per-metric HIGH means the Exec Summary score now reflects the truth:
    the only way to raise it is to make the engine actually verify the metric (match a
    same-family contract quantity / propagate the brief scale), never to soften the scorer."""
    out: list = []
    try:
        metrics = ((((state.get("parsedBrief") or {}).get("constraints") or {})
                    .get("target_performance") or {}).get("metrics")) or []
    except Exception:  # noqa: BLE001
        return out
    if not isinstance(metrics, list) or not metrics:
        return out
    for m in metrics:
        if not isinstance(m, dict):
            continue
        name = m.get("key_metric") or m.get("metric") or m.get("name") or ""
        if not name:
            continue
        mk = _contract_match(state, name, m.get("unit") or "")
        matched = mk[0] if isinstance(mk, tuple) else mk   # _contract_match → (key, value) or (None, None)
        if matched is not None:
            continue  # matched → PASS/FAIL handled by check_brief_metric_fail (a matched miss is its own HIGH)
        u = str(m.get("unit") or "").strip()
        tgt = _num(m.get("value") if isinstance(m, dict) else None)
        tgt_s = f"{tgt:g}{u}" if tgt is not None else "(stated)"
        out.append(Finding(
            tab="Exec Summary", check="brief_unverified", severity="HIGH",
            message=(f"brief metric '{name}' (target {tgt_s}) is UNVERIFIED — no contract quantity "
                     f"in the same unit family within ±50% of target, so the design cannot be "
                     f"confirmed to meet its own brief"),
            actual=f"{name} UNVERIFIED",
            expected=f"a same-unit-family contract quantity proving {name} = {tgt_s}",
            source_rule="brief scale metrics must propagate into the contract (sizing reads the brief target, not a class default)",
        ))
    return out


def check_dominant_bom_line(state, rows, run_dir) -> list:
    """No single bill-of-materials line should dominate the bill — a line > 50% of the total is
    almost always a mis-price (Tristan 2026-06-25: a 40 W UV steriliser at £35k × 10 = £350k was
    87% of the bill, surfacing as 'Other equipment 87%')."""
    out: list = []
    principals = [r for r in rows if isinstance(r, dict)
                  and str(r.get("status")) != "SUB-COMPONENT"
                  and (_as_num(r.get("line_gbp")) or 0) > 0]
    total = sum((_as_num(r.get("line_gbp")) or 0) for r in principals)
    if total <= 0 or len(principals) < 3:
        return out
    for r in principals:
        lg = _as_num(r.get("line_gbp")) or 0
        if lg > 0.5 * total:
            name = str(r.get("requirement") or r.get("part") or "?")
            out.append(Finding(
                tab="Bill of Materials", check="dominant_bom_line", severity="HIGH",
                message=(f"a single line '{name[:48]}' is £{round(lg):,} = {round(lg/total*100)}% "
                         f"of the £{round(total):,} bill — almost certainly a mis-price (check the "
                         f"unit price against the part's spec)"),
                actual=f"unit £{r.get('unit_gbp')} × qty {r.get('qty')}",
                expected="no single line should exceed ~50% of the bill",
                source_rule="per-line price plausibility — a small-spec part priced as a large assembly",
            ))
    return out


def check_scope_fidelity(state, rows, run_dir) -> list:
    """The design must build ONLY what the brief asks for — honour the brief's explicit EXCLUSIONS
    (Tristan 2026-06-25: a water-system brief was built as a £112M full vertical farm with LED/HVAC
    the brief excluded). Read the brief's stated exclusions; flag any subsystem present in the bill
    that the brief excludes. Universal — keyed on the brief's own exclusion words, no per-class table."""
    out: list = []
    pb = state.get("parsedBrief") or {}
    text = " ".join(str(pb.get(k) or "") for k in
                    ("original_text", "product_description", "mission_statement", "why_now")).lower()
    if not text:
        return out
    # Pull the exclusion clauses: "excluding X, Y and Z", "excludes …", "… out of scope".
    excl = " ".join(re.findall(r"exclud(?:ing|es?|ed)[:\s]+([^.;]{3,240})", text))
    m = re.search(r"([^.;]{3,200})\bout[\s-]of[\s-]scope", text)
    if m:
        excl += " " + m.group(1)
    if not excl.strip():
        return out
    # (exclusion keywords the brief might state) → (BoM part terms that mean that subsystem)
    SUBSYS = [
        ("lighting", ("lighting", "light", "led", "luminaire"),
         ("led", "luminaire", "grow light", "horticultural", "photoperiod fixture")),
        ("climate / HVAC", ("climate", "hvac", "ventilation", "heating", "air-condition", "heating-ventilation"),
         ("hvac", "chiller", "dehumidif", " ahu", "air handling", "condenser", "cooling unit", "heat pump", "refrigerant")),
        ("building / structure", ("building", "rack framework", "cultivation rack", "structure", "civil"),
         ("building", "canopy", "growing rack", "cultivation rack", "trolley", "structural floor")),
    ]
    for label, excl_kw, bom_kw in SUBSYS:
        if not any(kw in excl for kw in excl_kw):
            continue   # the brief did NOT exclude this subsystem
        hits = []
        for r in rows:
            if not isinstance(r, dict) or str(r.get("status")) == "SUB-COMPONENT":
                continue
            name = str(r.get("requirement") or r.get("part") or "").lower()
            if any(bk.strip() in name for bk in bom_kw):
                hits.append((str(r.get("requirement") or r.get("part") or "?"), _as_num(r.get("line_gbp")) or 0))
        if hits:
            cost = sum(h[1] for h in hits)
            out.append(Finding(
                tab="Exec Summary", check="scope_fidelity", severity="HIGH",
                message=(f"the brief EXCLUDES {label}, but the design builds it: {len(hits)} part(s), "
                         f"£{round(cost):,} (e.g. '{hits[0][0][:40]}'). Build only what the brief asks for."),
                actual=f"£{round(cost):,} of out-of-scope {label}",
                expected=f"no {label} parts — the brief excludes them",
                source_rule="scope-fidelity: drop subsystems the brief excludes; route a process/water-system brief to the process path, not a full-product emitter",
            ))
    return out


def check_calc_coverage(state, rows, run_dir) -> list:
    """GUARANTEE every code calculation appears in Excel (Tristan 2026-06-25: "ALL the calculations
    in code have to appear in excel"). A number's calculation is SHOWN if its derivation is a real
    FORMULA (a source_detail carrying an operator) OR a tool worked-calc (formula + substitution).
    Having only inputs (lineage.from) is NOT enough — that's the lineage, not the calculation.
    This is the forcing function: it flags every HIDDEN calc so calc-coverage is driven to 100%
    (the same pattern as the provenance spine; the build refuses to ship below it when enforcing)."""
    out: list = []
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {})
    if not isinstance(q, dict) or not q:
        return out
    wc = (state.get("worked_calculations")
          or ((state.get("orchestratorContract") or {}).get("worked_calculations")) or {})
    worked = set()
    worked_tool_ids = set()   # tools whose full working (inputs→formula→result) IS shown
    if isinstance(wc, dict):
        for tool_id, calcs in wc.items():
            if calcs:
                worked_tool_ids.add(str(tool_id).lower())
            for c in (calcs or []):
                if isinstance(c, dict):
                    f = c.get("output_field") or c.get("field") or c.get("label")
                    if f:
                        worked.add(str(f).lower())
    # A ROOT (a brief assumption or a physics constant) is an INPUT, not a calculation — it has
    # no formula because it isn't computed. Only DERIVED quantities need a shown calculation.
    _ROOTS = {"brief", "physics_constant", "constant", "standard", "anchor", "datasheet", "spec"}
    _OPS = ("=", "×", "*", "/", "+", "−", "·", "^")
    hidden, total = [], 0
    for k, v in q.items():
        if not isinstance(v, dict):
            continue
        if str(v.get("source", "")).strip().lower() in _ROOTS:
            continue   # an input/constant, not a calculation
        total += 1
        sd = str(v.get("source_detail") or "")
        has_formula = len(sd) > 3 and any(op in sd for op in _OPS)
        # A quantity COMPUTED BY A TOOL whose full working (inputs → formula → substituted
        # numbers → result) is rendered on the Tools-Used / Calculations tab IS shown — the
        # reader can verify the number from the tool's own maths (Tristan: "ALL the calculations
        # in code have to appear in excel" — the tool's calc chain does appear). Requiring the
        # worked-calc label to EXACTLY equal the quantity key was stricter than that intent and
        # wrongly hid every tool-sized number. A tool that shows NO working still leaves its
        # outputs hidden (a bare lookup is not a shown calculation).
        src = str(v.get("source", "")).strip().lower()
        tool_shown = src.startswith("tool:") and src[len("tool:"):] in worked_tool_ids
        if str(k).lower() in worked or has_formula or tool_shown:
            continue
        hidden.append(str(k))
    cov = round((total - len(hidden)) / total * 100) if total else 100
    if hidden:
        out.append(Finding(
            tab="Calculations", check="calc_coverage",
            severity="HIGH" if cov < 70 else "MED",
            message=(f"{len(hidden)} of {total} numbers ({100 - cov}%) have NO calculation shown "
                     f"in Excel — only a value (calc-coverage {cov}%). A number you cannot see "
                     f"computed is not verifiable."),
            actual=", ".join(hidden[:6]) + ("…" if len(hidden) > 6 else ""),
            expected="every number shows its formula + inputs + result (a worked calc) in the Calculations tab",
            source_rule="every code calculation must emit a worked-calc (a calc() capture) that the Calculations tab renders — drive calc-coverage to 100%",
        ))
    return out


def check_overview_invariants(state, rows, run_dir) -> list:
    """The Overview tab DISPLAYS the deterministic arithmetic invariants (the SAME
    deterministic_checks_lib.run_all_checks the ⚠ Checks tab renders, summarised as
    'N/M pass · K FAIL'). Its score MUST reflect them — a tab cannot show a green 10/10
    while it renders failing invariants (Tristan 2026-06-27: Overview 10/10 over rows 17-21
    FAILs is the fake-8 again). One finding, severity scaled by the fail count; routed to
    Overview so its banner drops until the invariants are fixed at source."""
    tab = "Overview"
    out: list = []
    try:
        import sys as _sys
        _sdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")  # scripts/
        if _sdir not in _sys.path:
            _sys.path.insert(0, _sdir)
        import deterministic_checks_lib as _dcl  # noqa: N813
        checks = _dcl.run_all_checks(run_dir, state)
    except Exception:  # noqa: BLE001 — never break scoring on the optional invariant lib
        return out
    if not checks:
        return out
    fails = [c for c in checks if str(getattr(c, "status", "")).upper() == "FAIL"]
    if not fails:
        return out
    names = "; ".join(str(getattr(c, "name", ""))[:46] for c in fails[:4])
    # The Overview DISPLAYS the summary count → its score reflects the TOTAL fails.
    out.append(Finding(
        tab=tab, check="overview_invariant_fail",
        severity="HIGH" if len(fails) >= 2 else "MED",
        message=(f"{len(fails)} of {len(checks)} deterministic invariants FAIL — shown ON the Overview "
                 f"({len(checks) - len(fails)}/{len(checks)} pass · {len(fails)} FAIL): {names}"),
        actual=f"{len(fails)} invariant(s) FAIL",
        expected="every deterministic invariant passes (the Overview cannot be a green 10/10 over visible failures)",
        source_rule="fix each failing invariant at SOURCE (arithmetic reconciliation / brief-target / ledger completeness) — see deterministic_checks_lib.run_all_checks",
    ))
    # ROUTE each failing invariant to the SPECIFIC tab it concerns, so that tab's score drops too
    # — a Connection-trace 10/10 must not stand while the 'ledger completeness / every part shows
    # input+output' invariant FAILS (Tristan 2026-06-27: the connection-trace 'OK' is meaningless if
    # the completeness invariant it should mirror is red). Keyed on the invariant NAME, universal.
    for c in fails:
        nm = str(getattr(c, "name", ""))
        nl = nm.lower()
        if re.search(r"ledger completeness|input\s*\+\s*output|in\s*\+\s*out|fluid in|connect", nl):
            dest = "Connection trace"
        elif re.search(r"brief target|target met|compliance", nl):
            dest = "Exec Summary"
        else:
            continue  # the Overview summary already covers the generic ones
        out.append(Finding(
            tab=dest, check="invariant_fail_on_tab", severity="HIGH",
            message=(f"a deterministic invariant this tab is responsible for FAILS: {nm[:80]}"),
            actual="invariant FAIL", expected="the invariant passes",
            source_rule="fix the invariant at source (deterministic_checks_lib) — this tab cannot pass while it fails",
        ))
    return out


def check_provenance(state, rows, run_dir) -> list:
    """The TRACEABILITY SPINE, surfaced in the dossier (Tristan 2026-06-25): every number must
    trace to the brief via a tool/formula. Flags quantities with NO recorded origin (appear
    from nowhere) + same-physical-role value contradictions. Delegates to provenance.py."""
    out: list = []
    try:
        from provenance import audit_provenance
    except Exception:  # noqa: BLE001
        return out
    try:
        rep = audit_provenance(state)
    except Exception:  # noqa: BLE001
        return out
    sc = rep.scorecard()
    if sc.get("total", 0) == 0:
        return out
    if sc["sourceless"] > 0:
        examples = [f.key for f in rep.findings if f.kind == "sourceless"][:6]
        frac = round(sc["traceable_fraction"] * 100)
        sev = "HIGH" if sc["sourceless"] > sc["total"] * 0.25 else "MED"
        out.append(Finding(
            tab="Quantities", check="provenance_sourceless", severity=sev,
            message=(f"{sc['sourceless']} of {sc['total']} quantities have no recorded origin "
                     f"(only {frac}% trace to the brief via a tool/formula) — numbers appear from nowhere"),
            actual=", ".join(examples) + ("…" if sc["sourceless"] > 6 else ""),
            expected="every number records its source (source_detail or lineage.from) rooting at the brief",
            source_rule="provenance.py — record each number's lineage at source (contract / sizing / tools)",
        ))
    for f in rep.findings:
        if f.kind == "divergence":
            out.append(Finding(
                tab="Quantities", check="provenance_divergence", severity="HIGH",
                message=f.message, actual=str(f.value),
                expected="two quantities of the same physical role must agree",
                source_rule="provenance.py — one is a wrong roll-up / unit error; fix at source",
            ))
    return out


# ── Placeholder names that are NOT a real part identity (mirror dossier_repair). ──
_PLACEHOLDER_NAMES = {
    "requirement stated", "requirement stated structural", "requirement stated parametric",
    "requirement stated rating based parametric", "made to spec", "not found", "tbd", "",
    "field instrument catalogue class", "final control element catalogue class",
}


def _display_name(r: dict) -> str:
    """The name the Part-names tab shows: prefer the REQUIREMENT (durable identity) over the
    fulfilment placeholder ('requirement stated' is a status, not a name)."""
    return str(r.get("requirement") or r.get("name_human") or r.get("part") or "").strip()


def check_part_names(state, rows, run_dir) -> list:
    """'Part names' is the master list every other tab references — each principal must carry a
    REAL, non-placeholder name. (Tristan: every tab a genuine ≥8; an unscored tab cannot pass.)"""
    tab = "Part names"
    out: list = []
    principals = _principal_rows(rows)
    if not principals:
        return out
    bad = []
    for r in principals:
        low = re.sub(r"[^a-z0-9 ]+", " ", _display_name(r).lower()).strip()
        low = re.sub(r"\s+", " ", low)
        if not low or low in _PLACEHOLDER_NAMES:
            bad.append(r)
    if bad:
        frac = len(bad) / len(principals)
        out.append(Finding(
            tab=tab, check="part_name_placeholder", severity="HIGH" if frac > 0.10 else "MED",
            message=(f"{len(bad)} of {len(principals)} principal parts have a placeholder/blank name "
                     f"(e.g. 'requirement stated') instead of a real part name — the master Part-names "
                     f"list every tab references is incomplete"),
            actual=", ".join(_display_name(r)[:20] or "(blank)" for r in bad[:5]),
            expected="every principal carries a real, descriptive name on the Part names tab",
            source_rule="requirements_bom must emit a real requirement/name for every line (never the fulfilment placeholder as the name)",
        ))
    return out


def _load_run_json(run_dir, name):
    try:
        with open(os.path.join(run_dir or "", name), "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:  # noqa: BLE001
        return None


def check_line_velocity(state, rows, run_dir) -> list:
    """'Line & velocity' schedule (connection-schedule.json): every sized run must be WITHIN
    SPEC (pipe velocity ≤ limit, cable volt-drop ≤ limit). An out-of-spec line is a real
    hydraulic/electrical defect (e.g. 25 m/s through an undersized pipe)."""
    tab = "Line & velocity"
    out: list = []
    cs = _load_run_json(run_dir, "connection-schedule.json")
    lines = cs.get("rows") if isinstance(cs, dict) else None
    expected = len(_principal_rows(rows)) >= 10  # a real multi-equipment plant has connections
    if not isinstance(lines, list) or not lines:
        if expected:
            out.append(Finding(
                tab=tab, check="line_schedule_missing", severity="HIGH",
                message=("no Line & velocity schedule (connection-schedule.json absent/empty) for a "
                         "plant with many equipment items — every sized run must be listed with its "
                         "velocity / volt-drop and within-spec verdict"),
                actual="0 lines", expected="a line schedule with one row per sized run",
                source_rule="the connection/route builder must emit connection-schedule.json with sized runs",
            ))
        return out
    oos = [r for r in lines if isinstance(r, dict) and r.get("within_spec") is False]
    if oos:
        frac = len(oos) / len(lines)
        ex = "; ".join(f"{str(r.get('from',''))[:14]}→{str(r.get('to',''))[:14]} {r.get('drop','')}" for r in oos[:3])
        out.append(Finding(
            tab=tab, check="line_out_of_spec", severity="HIGH" if frac > 0.05 else "MED",
            message=(f"{len(oos)} of {len(lines)} sized runs are OUT OF SPEC (pipe velocity > limit "
                     f"or cable volt-drop > limit) on the Line & velocity schedule. Examples: {ex}"),
            actual=f"{len(oos)} out-of-spec lines",
            expected="every line within spec (pipe ≤ 3 m/s, cable ΔU ≤ 5 %) — upsize the run at source",
            source_rule="the sizing tool / line-sizer must pick a diameter/CSA that keeps velocity ≤ 3 m/s and ΔU ≤ 5 %",
        ))
    return out


def check_panel_schedule(state, rows, run_dir) -> list:
    """'Panel schedule' (drawings/panel-schedule.md): an electrical design must publish a panel/
    load schedule with real circuit rows. Absent or empty = a missing deliverable, not a pass."""
    tab = "Panel schedule"
    out: list = []
    # Only a design that HAS electrical load owes a panel schedule.
    q = _quantities(state)
    has_elec = any(re.search(r"electrical_load|connected_load|supply_demand|switchboard|incomer", k, re.I)
                   for k in q) or any(re.search(r"panel|switchboard|breaker|mcc|distribution board",
                                                _row_name(r), re.I) for r in _principal_rows(rows))
    if not has_elec:
        return out
    path = os.path.join(run_dir or "", "drawings", "panel-schedule.md")
    text = ""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            text = fh.read()
    except Exception:  # noqa: BLE001
        text = ""
    # count markdown table body rows (lines with ≥2 pipes that aren't the header/separator)
    body = [ln for ln in text.splitlines()
            if ln.count("|") >= 2 and not re.match(r"^\s*\|?[\s:|-]+\|?\s*$", ln)]
    data_rows = max(0, len(body) - 1)  # minus the header row
    if data_rows < 1:
        out.append(Finding(
            tab=tab, check="panel_schedule_missing", severity="HIGH",
            message=("the electrical design publishes NO panel / load schedule with circuit rows "
                     "(drawings/panel-schedule.md absent or empty) — an electrified plant must list "
                     "its circuits, breakers and cables"),
            actual=f"{data_rows} circuit rows",
            expected="a panel schedule with one row per circuit (load · breaker · cable · ΔU)",
            source_rule="the panel-schedule generator must emit a circuit row per powered load",
        ))
    return out


# Tag-prefixes the universal Glossary documents (ISA + the engine's own families). A BoM tag
# whose prefix is outside this set is an abbreviation the Glossary does not explain.
_GLOSSARY_TAG_PREFIXES = {
    "P", "TK", "F", "V", "I", "HX", "INV", "TX", "EP", "C", "X",
    "FCV", "FV", "LV", "PV", "TV", "LT", "PT", "TT", "FT", "AT", "LE", "FE", "PE", "TE",
    "M", "G", "UV", "PMP", "BLR", "AHU", "MCC", "DB", "SW", "ATS",
}


def check_glossary(state, rows, run_dir) -> list:
    """'Glossary' must define every abbreviation the dossier USES. Genuine coverage check: every
    ISA tag-prefix that appears in the bill must be a documented family (else a reader meets an
    undefined code). The static glossary covers the standard families; a NOVEL prefix flags."""
    tab = "Glossary"
    out: list = []
    principals = _principal_rows(rows)
    if not principals:
        return out
    undocumented = {}
    for r in principals:
        raw = str(r.get("tag") or "").strip()
        m = re.match(r"^([A-Z]{1,4})-?\d", raw)
        if not m:
            continue
        pref = m.group(1)
        if pref not in _GLOSSARY_TAG_PREFIXES:
            undocumented[pref] = undocumented.get(pref, 0) + 1
    if undocumented:
        ex = ", ".join(f"{p}- (×{n})" for p, n in sorted(undocumented.items())[:6])
        out.append(Finding(
            tab=tab, check="glossary_undocumented_prefix", severity="MED",
            message=(f"{len(undocumented)} tag-prefix family/families used in the bill are not in the "
                     f"Glossary: {ex} — a reader meets an undefined code"),
            actual=ex,
            expected="every ISA tag-prefix used is defined on the Glossary tab",
            source_rule="add the tag-prefix to the universal glossary (build-excel GLOSSARY) OR use a documented prefix in the tag scheme",
        ))
    return out


_CHECKS = [
    check_bom,
    check_capex_by_category,
    check_cross_tab,
    check_part_names,
    check_line_velocity,
    check_panel_schedule,
    check_glossary,
    check_overview_invariants,   # Overview score must reflect the failing invariants it displays
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
    check_tool_io_traceability,     # 15 tool claim with no input/output edge (untraceable calc)
    check_provenance,               # 16 SPINE: quantities with no recorded origin + role divergence
    check_brief_unverified,         # 17 most brief metrics UNVERIFIED (brief scale didn't propagate)
    check_dominant_bom_line,        # 18 a single BoM line > 50% of the bill (mis-price)
    check_calc_coverage,            # 19 GUARANTEE: every code calculation is shown in Excel (formula)
    check_scope_fidelity,           # 20 design builds a subsystem the brief EXCLUDES (out of scope)
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
# DETERMINISTIC PER-TAB SCORECARD (Tristan 2026-06-26)
#
# Every Excel tab carries its OWN deterministic 0-10 score against the ≥8 floor, shown ON the tab.
# The engine USES these scores internally: a tab below 8 is a routed fault to fix at source, and a
# dossier whose worst tab is below 8 is NOT certified. This is the per-tab, deterministic complement
# to the 6-section selfAudit — no LLM, reproducible, and the loop's signal. A tab a check EXAMINED
# and found clean scores 10; a tab NO deterministic check examines is UNSCORED (a coverage gap — it
# can NEVER be a free 10, because an un-checked tab cannot be certified ≥8; the universal fix is to
# write its check).
# --------------------------------------------------------------------------- #

# Canonical Excel tabs that MUST carry a deterministic quality score (the data/engineering tabs).
# Meta tabs (⭐ Scorecard, Sense-check) and pure-narrative tabs are excluded from the floor.
SCORED_TABS = [
    "Executive Summary", "Overview", "Brief", "Quantities", "Calculations",
    "Bill of Materials (Ledger)", "Cost waterfall", "Financial model",
    "Connection trace", "Part names", "Risk & Regulatory", "Assembly sequence",
    "Panel schedule", "Process schedules", "Line & velocity", "Glossary",
]

# A deterministic check EXAMINES these canonical tabs (so a clean one scores 10; the rest are
# UNSCORED = a coverage gap to close, never a silent pass). Derived from the _CHECKS tab tags.
COVERED_TABS = {
    "Executive Summary", "Overview", "Quantities", "Calculations",
    "Bill of Materials (Ledger)", "Cost waterfall", "Financial model",
    "Connection trace", "Risk & Regulatory", "Process schedules",
    "Assembly sequence", "Brief",
    # 2026-06-26: the formerly-UNSCORED tabs now carry deterministic checks (a genuine ≥8
    # requires a check that looked, never "nothing examined it").
    "Part names", "Line & velocity", "Panel schedule", "Glossary",
}

_SEVERITY_PENALTY = {"HIGH": 4, "MED": 2, "LOW": 1}

# Route an audit Finding.tab (audit-domain names) → its canonical Excel tab. First substring wins.
_TAB_ROUTE = [
    ("bill of material", "Bill of Materials (Ledger)"), ("bom", "Bill of Materials (Ledger)"),
    ("coverage", "Bill of Materials (Ledger)"), ("ledger", "Bill of Materials (Ledger)"),
    ("capex", "Cost waterfall"), ("cost", "Cost waterfall"),
    ("financial", "Financial model"), ("inputs", "Financial model"), ("revenue", "Financial model"),
    ("econom", "Financial model"),
    ("quantit", "Quantities"), ("calculation", "Calculations"),
    ("connectiv", "Connection trace"), ("connection", "Connection trace"), ("drawing", "Connection trace"),
    ("part name", "Part names"), ("glossar", "Glossary"),
    ("risk", "Risk & Regulatory"), ("regulator", "Risk & Regulatory"), ("physics", "Risk & Regulatory"),
    ("line & velocity", "Line & velocity"), ("panel", "Panel schedule"),
    ("schedule", "Process schedules"), ("process", "Process schedules"),
    ("assembly", "Assembly sequence"),
    ("brief", "Brief"), ("overview", "Overview"),
    ("exec", "Executive Summary"), ("checks", "Executive Summary"), ("audit", "Executive Summary"),
]


def _route_to_excel_tab(audit_tab: str) -> str:
    tl = str(audit_tab or "").lower()
    for sub, canon in _TAB_ROUTE:
        if sub in tl:
            return canon
    return "Executive Summary"


def tab_scores(state: dict, rows: list, run_dir: str) -> dict:
    """Deterministic per-tab scorecard. Returns {tab: {score|None, target, status, issues, fix}}.

    score is 0-10 (10 − Σ severity penalty, HIGH=4 / MED=2 / LOW=1); status PASS (≥8) / FAIL (<8) /
    UNSCORED (no check covers the tab). The minimum scored tab is the dossier's per-tab floor.
    """
    report = audit_dossier(state, rows, run_dir)
    by_tab: dict = {}
    for f in report.findings:
        by_tab.setdefault(_route_to_excel_tab(f.tab), []).append(f)

    out: dict = {}
    for tab in SCORED_TABS:
        fs = by_tab.get(tab, [])
        if tab not in COVERED_TABS:
            out[tab] = {
                "score": None, "target": 8, "status": "UNSCORED",
                "issues": ["no deterministic check examines this tab yet — it cannot be certified ≥8"],
                "fix": "write a deterministic check for this tab in dossier_audit.py (the universal fix for an unscored tab)",
            }
            continue
        penalty = sum(_SEVERITY_PENALTY.get(f.severity, 1) for f in fs)
        score = max(0, 10 - penalty)
        out[tab] = {
            "score": score, "target": 8,
            "status": "PASS" if score >= 8 else "FAIL",
            "issues": [f"[{f.severity}] {f.message[:110]}" for f in fs[:6]],
            "fix": next((f.source_rule for f in fs if f.source_rule), ""),
        }
    return out


def tab_scorecard_summary(scores: dict) -> dict:
    """Headline numbers over the per-tab scorecard: the min scored tab + how many fail / are unscored."""
    scored = [(t, v) for t, v in scores.items() if isinstance(v.get("score"), (int, float))]
    fails = [t for t, v in scored if v["score"] < v["target"]]
    unscored = [t for t, v in scores.items() if v.get("status") == "UNSCORED"]
    min_tab, min_score = (None, None)
    if scored:
        min_tab, mv = min(scored, key=lambda kv: kv[1]["score"])
        min_score = mv["score"]
    return {
        "min_tab": min_tab, "min_score": min_score,
        "scored_count": len(scored), "fail_tabs": fails, "unscored_tabs": unscored,
        "all_pass": (not fails and not unscored),
    }


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
        # Tool I/O traceability: 4 of 5 claims show input_summary "(none)" (80% > 40%)
        # -> HIGH; one claim also declares no output_field at all -> MED.
        "toolsUsedPage": {"tools": [
            {"tool_id": "arc-flash:ieee1584", "claims": [
                {"field": "incident_energy", "input_summary": "(none)",
                 "output_field": "governing_incident_energy"},
                {"field": "boundary_m", "input_summary": "none",
                 "output_field": "arc_flash_boundary_m"},
                {"field": "ppe_category", "input_summary": "",
                 "output_field": "ppe_cat"},
            ]},
            {"tool_id": "thermal:derating", "claims": [
                # missing input AND no output destination at all (neither output_field
                # nor field) -> MED no-output finding.
                {"input_summary": "(none)", "output_field": "", "field": ""},
                # the ONE traceable claim
                {"field": "margin_pct", "input_summary": "inputs from: brief temp_max_c",
                 "output_field": "thermal_margin_pct"},
            ]},
        ]},
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
    # compliance_matcher_gap RETIRED — the renderer + score now share ONE matcher
    # (_contract_match), so a metric that matches cross-unit-family (MWh↔kWh) is a clean
    # PASS, never a 'gap'. cross_tab_value has its own focused fixture (H) below.
    expect("compliance_matcher_gap" not in checks, "A: compliance_matcher_gap is retired (one matcher)")
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
    expect("tool_io_traceability" in checks, "A: expected tool_io_traceability (4/5 claims '(none)')")
    expect(sc["verdict"] == "FAIL" and sc["ship_ok"] is False, f"A: expected FAIL/ship_ok=False, got {sc}")

    # tool_io_traceability must fire HIGH on the input gap (4/5 > 40%) AND MED on the
    # one claim that declares no output destination.
    tio = [f for f in rep.findings if f.check == "tool_io_traceability"]
    expect(any(f.severity == "HIGH" and "inputs came from" in f.message for f in tio),
           "A: tool_io_traceability should HIGH-flag the input gap (4/5 (none))")
    expect(any(f.severity == "MED" and "no output destination" in f.message for f in tio),
           "A: tool_io_traceability should MED-flag the claim with no output_field")

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
                # exact-unit match -> compliance verifies, no matcher-gap flag.
                # source='brief' -> traceable, so check_provenance stays silent on the clean fixture.
                "throughput_units": {"value": 1000, "unit": "units", "family": "count", "source": "brief"},
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
        # Clean tools: every claim cites a real input AND names an output_field ->
        # tool_io_traceability stays silent.
        "toolsUsedPage": {"tools": [
            {"tool_id": "motor:sizing", "claims": [
                {"field": "torque_nm", "input_summary": "inputs from: brief rated_power_kw",
                 "output_field": "rated_torque_nm"},
                {"field": "rpm", "input_summary": "inputs from: contract drive_speed_rpm",
                 "output_field": "rated_rpm"},
            ]},
        ]},
    }
    clean_rows = [
        {"tag": "P-1", "requirement": "Frame", "status": "IDENTIFIED",
         "part": "Frame A", "qty": 2, "unit_gbp": 1500, "line_gbp": 3000, "basis": "x"},
        {"tag": "P-2", "requirement": "Motor", "status": "IDENTIFIED",
         "part": "Motor B", "qty": 1, "unit_gbp": 4000, "line_gbp": 4000, "basis": "x"},
        {"tag": "TK-1", "requirement": "Tank", "status": "IDENTIFIED",
         "part": "Tank C", "qty": 1, "unit_gbp": 4000, "line_gbp": 4000, "basis": "x"},
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

    # ---- Fixture H: cross-tab — UNVERIFIED on compliance but computed in headline --
    # A metric with NO fulfilling contract quantity (so the compliance table shows
    # UNVERIFIED) whose value nonetheless appears in keyMetrics.headline_output must
    # raise cross_tab_value (the two tabs disagree). Guards the surviving check after
    # compliance_matcher_gap was retired.
    xtab_state = {
        "orchestratorContract": {"product_class": "widget", "quantities": {}},  # nothing to match
        "parsedBrief": {"product_class": "widget", "constraints": {"target_performance": {"metrics": [
            {"key_metric": "throughput_units", "value": 1000, "unit": "units"},
        ]}}},
        "keyMetrics": {"headline_output": {"id": "throughput_units", "value": "1000", "unit": "units"}},
    }
    repx = audit_dossier(xtab_state, [], run_dir="/nonexistent-run-dir-xyz")
    expect(any(f.check == "cross_tab_value" for f in repx.findings),
           "H: expected cross_tab_value (UNVERIFIED on compliance, computed in headline)")

    # ---- Fixture G: HONEST SCORING — every UNVERIFIED metric is its own HIGH ----
    # Tristan 2026-06-26: "a pass is good — unverified and fail are bad"; "if you can't
    # score yourself correctly you can't fix yourself". A compliance table that is
    # mostly UNVERIFIED must NOT let the Executive Summary score ≥8 (the generosity bug:
    # the old roll-up collapsed N unverified metrics into one MED → tab scored 8/10).
    unver_state = {
        "orchestratorContract": {"product_class": "water_treatment", "quantities": {
            # ONE metric is provable (exact-unit match) -> PASS; the rest have no match.
            "ro_recovery_percent": {"value": 75, "unit": "%", "family": "percent", "source": "brief"},
        }},
        "parsedBrief": {"product_class": "water_treatment", "constraints": {"target_performance": {"metrics": [
            {"key_metric": "ro_recovery_percent", "value": 75, "unit": "%"},        # PASS
            {"key_metric": "cultivation_containers", "value": 6000, "unit": "count"},   # UNVERIFIED
            {"key_metric": "max_irrigation_demand_m3_per_hr", "value": 45, "unit": "m3/hr"},  # UNVERIFIED
            {"key_metric": "ro_permeate_capacity_m3_per_hr", "value": 8, "unit": "m3/hr"},    # UNVERIFIED
            {"key_metric": "actuated_valves", "value": 200, "unit": "count"},               # UNVERIFIED
        ]}}},
        "keyMetrics": {"headline_output": {"id": "ro_recovery_percent", "value": "75", "unit": "%"}},
        "costStack": {"installed_asp_gbp": 1000},
    }
    repg = audit_dossier(unver_state, [], run_dir="/nonexistent-run-dir-xyz")
    unv = [f for f in repg.findings if f.check == "brief_unverified"]
    expect(len(unv) == 4, f"G: expected 4 per-metric brief_unverified HIGH, got {len(unv)}")
    expect(all(f.severity == "HIGH" for f in unv), "G: every UNVERIFIED metric must be HIGH")
    scg = tab_scores(unver_state, [], "/nonexistent-run-dir-xyz")
    es = scg.get("Executive Summary") or {}
    es_score = es.get("score")
    expect(isinstance(es_score, (int, float)) and es_score < 8 and es.get("status") == "FAIL",
           f"G: Exec Summary must FAIL (<8) when its compliance table is mostly UNVERIFIED, got {es_score}")

    # ---- Fixture K: the 4 formerly-UNSCORED tab checks PROVE they catch ----------
    # part_names (placeholder name), line_velocity (out-of-spec run), panel_schedule
    # (missing for an electrified design), glossary (undocumented tag-prefix).
    with tempfile.TemporaryDirectory() as tk:
        with open(os.path.join(tk, "connection-schedule.json"), "w") as fh:
            json.dump({"rows": [{"from": "Pump A", "to": "Tank B", "within_spec": False,
                                 "drop": "25 m/s"}] + [{"from": f"n{i}", "to": f"m{i}",
                                 "within_spec": True} for i in range(12)]}, fh)
        k_rows = [
            {"tag": "P-1", "requirement": "Recirculation pump", "status": "IDENTIFIED",
             "part": "Grundfos", "qty": 1, "unit_gbp": 4000, "line_gbp": 4000},
            # placeholder NAME (part_names fires): requirement is the placeholder
            {"tag": "X-7", "requirement": "requirement stated", "status": "NOT FOUND",
             "part": "requirement stated", "qty": 1, "unit_gbp": 800, "line_gbp": 800},
            # undocumented tag-prefix ZZ- (glossary fires)
            {"tag": "ZZ-3", "requirement": "Main Switchboard", "status": "IDENTIFIED",
             "part": "Switchboard", "qty": 1, "unit_gbp": 3000, "line_gbp": 3000},
        ] + [{"tag": f"TK-{i}", "requirement": f"Tank {i}", "status": "IDENTIFIED",
              "part": f"Tank {i}", "qty": 1, "unit_gbp": 1000, "line_gbp": 1000} for i in range(9)]
        k_state = {"orchestratorContract": {"product_class": "water_treatment",
                   "quantities": {"connected_electrical_load_kw": {"value": 48, "unit": "kW"}}},
                   "parsedBrief": {"product_class": "water_treatment", "constraints": {}},
                   "costStack": {"installed_asp_gbp": 50000}}
        repk = audit_dossier(k_state, k_rows, run_dir=tk)
        kchecks = {f.check for f in repk.findings}
        expect("part_name_placeholder" in kchecks, "K: part_names must catch a 'requirement stated' name")
        expect("line_out_of_spec" in kchecks, "K: line_velocity must catch a within_spec=False run")
        expect("panel_schedule_missing" in kchecks, "K: panel_schedule must catch a missing schedule on an electrified design")
        expect("glossary_undocumented_prefix" in kchecks, "K: glossary must catch the undocumented ZZ- prefix")

    # ---- Fixture J: a dimensioned metric must NOT match a unitless COUNT quantity -----
    # Codema v5: fertigation_dosing_capacity (m3/hr) matched fertigation_dosing_pump_count=2
    # and reported "achieves 2 m3/hr" — a false FAIL. The matcher must pick the DELIVERED
    # throughput (same flow family), never the pump count (dimensionless).
    fam_state = {
        "orchestratorContract": {"product_class": "water_treatment", "quantities": {
            "fertigation_dosing_pump_throughput_m3_h": {"value": 45, "unit": "m³/h"},
            "fertigation_dosing_pump_count": {"value": 2, "unit": ""},
        }},
        "parsedBrief": {"product_class": "water_treatment", "constraints": {"target_performance": {"metrics": [
            {"key_metric": "fertigation_dosing_capacity_m3_per_hr", "value": 45, "unit": "m3/hr"},
        ]}}},
    }
    fk, fv = _contract_match(fam_state, "fertigation_dosing_capacity_m3_per_hr", "m3/hr")
    expect(fk == "fertigation_dosing_pump_throughput_m3_h" and fv == 45,
           f"J: flow metric must match the throughput=45, not the count; got {fk}={fv}")
    expect(not _fam_compatible("volume", ""), "J: a dimensioned family must NOT match a blank/count family")
    expect(_fam_compatible("", "count") and _fam_compatible("", ""), "J: dimensionless families cross-match")

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
