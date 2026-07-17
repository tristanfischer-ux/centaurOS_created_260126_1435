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


def _clip(s, n: int) -> str:
    """Clip a user-facing string at a WORD boundary with an ellipsis — never mid-word
    (v54 shipped scorecard defect texts like 'A number you canno' cut at a raw [:110]).
    Text at/under the limit is returned untouched."""
    s = str(s or "")
    if len(s) <= n:
        return s
    cut = s[: max(n - 1, 1)]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0].rstrip(" ,;:·—-")
    return cut + "…"


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


# A FEEDSTOCK/CONSUMPTION metric (how much raw material the design draws in to hit its
# output, e.g. koh_feed_tpd) is a DERIVED quantity, not a performance floor: the design's
# achieved feed rate is correct when it matches the stoichiometric/process requirement,
# and a brief that states the figure as an APPROXIMATION ('approximately 2.6 t/day')
# is disclosing that the number is not exact. A capacity/output/rated PERFORMANCE metric
# is the opposite — it is the thing being sold, and stays on the tight tolerance even
# when the brief also hedges it with 'approximately'. Universal: keyed off the metric's
# own name tokens, never a class table; the performance regex wins any token overlap so
# a name can never accidentally qualify for both.
_FEEDSTOCK_METRIC_RX = re.compile(
    r"\b(feed|feedstock|consum|reagent|dos(?:e|ing)|makeup|make_up|intake|uptake|input)\b", re.I)
_HARD_PERFORMANCE_METRIC_RX = re.compile(
    r"\b(capacity|output|throughput|yield|product|rated|nameplate|power|voltage|current|"
    r"efficiency|energy|duty|captur\w*)\b", re.I)


def _is_feedstock_metric(name) -> bool:
    """True for a feedstock/raw-material CONSUMPTION metric name; false for a hard
    performance/output floor even when a token would otherwise overlap. Metric names are
    snake_case (koh_feed_tpd) — underscores are \\w characters so \\b never breaks on
    them; fold to spaces first so the word-bounded regexes actually see token edges."""
    text = re.sub(r"[_\-]+", " ", str(name or ""))
    return bool(_FEEDSTOCK_METRIC_RX.search(text)) and not _HARD_PERFORMANCE_METRIC_RX.search(text)


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


def _physics_issues_raw(state, run_dir=None) -> list:
    """SIGHT: grade the DELIVERED critique. The freshen-scorer re-runs the physics critic on the FINAL
    design and writes 7-5-physics-critique.json; the copy embedded in state.json is from an earlier
    stage and can be STALE (different — sometimes contradictory — findings). Prefer the on-disk fresh
    file when present, fall back to the state-embedded critique (Tristan 2026-06-28)."""
    if run_dir:
        try:
            with open(os.path.join(run_dir, "7-5-physics-critique.json"), "r", encoding="utf-8") as _fh:
                fresh = json.load(_fh)
            iss = fresh.get("issues") if isinstance(fresh, dict) else None
            if isinstance(iss, list):
                return iss
        except Exception:  # noqa: BLE001
            pass
    for key in ("physicsCritique", "physicsCritic", "physics_critique", "physics_critic"):
        pc = state.get(key)
        if isinstance(pc, dict):
            iss = pc.get("issues")
            if isinstance(iss, list):
                return iss
    return []


def _physics_issues(state, run_dir=None) -> list:
    """The CANONICAL scoring view of the physics critique (B3 extension, Tristan 2026-07-03):
    corroborated findings are replaced by their deterministic, state-derived evidence rows
    (identical designs → identical rows, however the LLM re-rolled its phrasing); anything the
    deterministic matchers cannot corroborate carries corroboration='uncorroborated' and is an
    ADVISORY note — visible, honest, NEVER scores. Idempotent: a critique the chain already
    canonicalised (every issue carries a 'corroboration' marker) is returned as-is."""
    raw = _physics_issues_raw(state, run_dir)
    return _canonicalise_issues(state, raw)


_PHYS_EMPTY_CLAIM_RX = re.compile(r"\bempty\b|no words|words['\"]?\s*[:=]?\s*\[\s*\]|\bhas no (?:words|equipment|parts)\b", re.I)
# A "quantity N× smeared/duplicated across many parts" claim — verifiable against the actual part counts.
_PHYS_DUP_CLAIM_RX = re.compile(r"duplicat|smear|copied .*count|across every|thousands of|on every .*(valve|part|word)", re.I)
# A "passive fluid device is (wrongly) rated in kW/power" claim — verifiable: does the NAMED device
# actually carry a power modifier in the shipped design? (Codema: the critic's stale '4 kW' on the
# Pressure Relief Valve / pressure switches — no such modifier exists in the delivered parts.)
_PHYS_PASSIVE_DEVICE_RX = re.compile(
    r"pressure relief valve|relief valve|pressure switch|check valve|non-return valve|isolation valve|"
    r"ball valve|sight glass|pressure gauge|level gauge|strainer|rupture disc|flow indicator", re.I)
# A claim that reasons about NAMED components the shipped design supposedly HAS ("the design
# includes/provides 'X'", "'X' is oversized", "labeled as 'Cip Tank'") — verifiable: do those named
# components still EXIST in the shipped design? (Codema: the critic's stale 'Cip Tank (40 m³)' /
# 'Cleaning Tank (40 m³)' — both a "40 m³ CIP tank is absurd" HIGH and a "water-storage deficit, the
# design only provides these two tanks" HIGH, BOTH predicated on tanks reconcilePrincipalEquipment
# already DROPPED downstream. When the critic's cited parts are gone, its reasoning is stale.)
_PHYS_OVERSIZED_RX = re.compile(r"oversiz|implausibl|absurd|physically implausible|too large|does not (?:exist|belong)", re.I)
_PHYS_DESIGN_HAS_RX = re.compile(
    r"design (?:only )?(?:includes|provides|contains|has|specifies|features)|labell?ed as|"
    r"the design's? '", re.I)
# A "a SINGLE / only one <part>" undercount claim — verifiable against the contract's part count.
_PHYS_SINGULAR_RX = re.compile(r"\b(?:a single|only one|only a single|just one|a lone)\b", re.I)
# A "design OMITS / lacks / is missing X" claim — verifiable by EXISTENCE: does X actually
# appear in the DELIVERED BoM / design words? (v55: the stale critique's top HIGH said the
# design "completely omits the three 40 m³ storage tanks (one fresh-water, two drain-water)"
# while the delivered BoM carried Fresh Water Tank TK-108 + Drain Water Tanks — the claim
# was FALSE against what shipped.)
_PHYS_OMITS_RX = re.compile(
    r"\bomits?\b|\bomitted\b|\bmissing\b|\blacks?\b|\babsent\b|"
    r"does not (?:include|provide|contain|specify)|"
    r"(?:is|are) not (?:included|present|provided|specified)|"
    r"\bno (?:provision|allowance) for\b|fail(?:s|ed)? to (?:include|provide|specify)", re.I)
# Tokens that carry no identity for the existence match — every plant shares them, so they
# must never DECIDE a match on their own (the f9dfc2918 distinguishing-token discipline).
_EXIST_GENERIC_TOKENS = {
    "tank", "tanks", "pump", "pumps", "valve", "valves", "vessel", "vessels", "unit",
    "units", "system", "systems", "skid", "assembly", "module", "storage", "water",
    "sensor", "sensors", "filter", "filters", "plant", "design", "process", "supply"}


def _exist_tok_hit(a: str, b: str) -> bool:
    """Exact token equality or a bounded ≥4-char PREFIX stem (never substring
    containment) — the f9dfc2918 matcher rule ('tanks'≡'tank', 'recirculation'≡'recirc')."""
    return a == b or (min(len(a), len(b)) >= 4 and (a.startswith(b) or b.startswith(a)))


def _delivered_row_names(state):
    """Every DELIVERED component name the dossier ships: requirementsBom principal rows
    (the requirement text before the '·' spec suffix) + every design word name."""
    names = []
    for row in state.get("requirementsBom") or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("status") or "") == "SUB-COMPONENT":
            continue
        req = str(row.get("requirement") or "").split("·")[0].strip()
        if req:
            names.append(req)
    for _w, nm in _iter_design_words(state):
        if nm:
            names.append(nm)
    return names


def _count_words_with_qty(state, qty: int) -> int:
    """How many DISTINCT design part-words carry the exact quantity `qty` (×N modifier). Used to verify a
    critic 'N× duplicated everywhere' claim against the real state — a true smear stamps N on MANY words."""
    n = 0
    for m in (state.get("moduleDecomposition") or {}).get("modules") or []:
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                for mc in (w.get("modifier_characters") or []):
                    if mc.get("kind") == "quantity":
                        mm = re.search(r"(\d[\d,]*)", str(mc.get("value") or ""))
                        if mm and int(mm.group(1).replace(",", "")) == qty:
                            n += 1
                        break
    return n


def _iter_design_words(state):
    """Yield every (word_dict, name_lower) in the shipped design."""
    for m in (state.get("moduleDecomposition") or {}).get("modules") or []:
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                yield w, str(w.get("name_human") or "").lower()


def _word_has_power_rating(w) -> bool:
    """True if the word carries a real electrical POWER rating (kind=power, or a '<n> kW/W' modifier)."""
    for mc in (w.get("modifier_characters") or []):
        if mc.get("kind") == "power":
            return True
        if re.search(r"\d\s*(?:k?w|kilowatt)\b", str(mc.get("value") or ""), re.I):
            return True
    return False


def _contract_count_ge2_for(state, tokens: set) -> bool:
    """True if a contract quantity whose key carries all `tokens` + 'count' has value ≥ 2 — i.e. the design
    demonstrably has MULTIPLE of that part (falsifies a critic 'a single <part>' undercount)."""
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = (state.get(ck) or {}).get("quantities")
        if not isinstance(qs, dict):
            continue
        for k, v in qs.items():
            kt = set(re.findall(r"[a-z0-9]+", k.lower()))
            if "count" in kt and tokens <= kt:
                val = (v or {}).get("value") if isinstance(v, dict) else v
                try:
                    if float(str(val)) >= 2:
                        return True
                except (TypeError, ValueError):
                    pass
    return False


def _physics_claim_falsified(state, issue: dict) -> bool:
    """Deterministically FALSE physics-critic claims must not gate (a false FAIL is as dishonest as a
    false PASS — Tristan 2026-06-28). The physics critic runs at Stage 7.5, BEFORE the downstream fixes
    (phantom-vessel drop, valve consolidation, contract sizing) settle — so its snapshot is frequently
    STALE against the shipped design. Each shape below falsifies ONLY when the delivered state
    definitively LACKS the claimed defect; anything we cannot disprove is left to gate."""
    txt = f"{issue.get('issue') or ''} {issue.get('title') or ''} {issue.get('where') or ''}".lower()
    raw = f"{issue.get('issue') or ''} {issue.get('title') or ''}"  # case-preserved for quoted names
    # (a) "module X is empty" shape — falsified if the named module actually has words.
    if _PHYS_EMPTY_CLAIM_RX.search(txt):
        for m in (state.get("moduleDecomposition") or {}).get("modules") or []:
            mid = str(m.get("module") or "")
            if mid and mid.lower() in txt:
                wc = sum(len(sm.get("words") or []) for sm in (m.get("sub_modules") or []))
                if wc > 0:
                    return True  # "empty" claim against a module that has words → falsified
    # (b) "quantity N× smeared/duplicated across many parts" shape — a REAL smear stamps the same big
    # count onto MANY distinct words. Verify: extract the large claimed count(s) and check how many words
    # actually carry each. If the worst-case count appears on ≤2 words, there is NO smear — the (LLM) critic
    # hallucinated it (the Codema run: it claimed '200× across 15 valve types' when only Pneumatic Actuated
    # Valves = ×200 + their 200 actuators = a 1:1 driven PAIR). A false FAIL is as dishonest as a false PASS.
    # NB the count regex must not require a trailing \b — the critic writes "200x" (digit+letter, no boundary).
    if _PHYS_DUP_CLAIM_RX.search(txt):
        cands = {int(x.replace(",", "")) for x in re.findall(r"\b(\d[\d,]{1,6})(?![\d,])", txt)}
        cands = {c for c in cands if c >= 50}  # a "smear" is a LARGE repeated count, not 1–2 isolators
        if cands and max(_count_words_with_qty(state, c) for c in cands) <= 2:
            return True  # the claimed massive duplication does not exist in the state → hallucinated smear
    # (c) "passive fluid device wrongly rated in kW" shape — falsified if the NAMED passive device(s) carry
    # NO power modifier in the delivered design (the wrong rating the critic complains about isn't there).
    if re.search(r"\bk?w\b|kilowatt|electrical.{0,10}power", txt) and _PHYS_PASSIVE_DEVICE_RX.search(txt):
        named = {d.lower() for d in _PHYS_PASSIVE_DEVICE_RX.findall(raw)}
        any_powered = any(
            any(dev in nm for dev in named) and _word_has_power_rating(w)
            for w, nm in _iter_design_words(state))
        if not any_powered:
            return True  # no named passive device is actually power-rated → stale 'N kW' claim
    # (d) "the design includes/provides 'X'" or "'X' is oversized/implausible" shape — the critic reasons
    # about specific NAMED components it asserts the design HAS. Falsified if NONE of the quoted component
    # name(s) still exist as a design word (the offending vessel was dropped downstream — so the critic's
    # whole line of reasoning, oversize OR capacity-deficit, rests on parts that are no longer shipped).
    # SAFE: fires only on a POSITIVE-assertion framing (design HAS X) — never on "the design LACKS X"
    # (a genuine missing-component finding must still gate).
    if _PHYS_OVERSIZED_RX.search(txt) or _PHYS_DESIGN_HAS_RX.search(txt):
        quoted = [q.strip() for q in re.findall(r"'([^']{3,40})'", raw) + re.findall(r"\"([^\"]{3,40})\"", raw)]
        # keep only quoted tokens that look like a component (contain a noun), not bare numbers/units
        quoted = [q for q in quoted if re.search(r"[a-z]{3}", q, re.I) and not re.fullmatch(r"[\d.,\s]*m[³3l]?", q, re.I)]
        if quoted:
            present = any(q.lower() in nm for q in quoted for _w, nm in _iter_design_words(state))
            if not present:
                return True  # none of the named components the critic cites exist in the shipped design → stale
    # (f) EXISTENCE check — "the design OMITS / lacks / is missing X" is auto-falsified when X
    # matches a DELIVERED BoM/manifest row (token match, the f9dfc2918 distinguishing-token
    # discipline). For each delivered row: ALL of its tokens must appear in the claim text
    # (exact or ≥4-char prefix stem) AND at least one matched token must be NON-generic (the
    # generic noun 'tank' alone never decides — 'fresh'/'drain' does). v55: the stale "design
    # completely omits the three 40 m³ storage tanks (one fresh-water, two drain-water)" HIGH
    # dies against the delivered 'Fresh Water Tank' + 'Drain Water Tank' rows; a claim naming
    # a component NO row matches (a genuine omission) still gates.
    # REDUNDANCY carve-out: "omits a BACKUP/standby/spare X" is a redundancy finding — the
    # base X shipping does not falsify it; only a plain existence claim is checked.
    if _PHYS_OMITS_RX.search(txt) and not re.search(
            r"backup|standby|redundan|spare|additional|\bsecond\b|duplicate", txt):
        claim_toks = set(re.findall(r"[a-z0-9]{2,}", txt))
        for row_name in _delivered_row_names(state):
            row_toks = [t for t in re.findall(r"[a-z0-9]{2,}", str(row_name).lower())
                        if not t.isdigit()]
            if not row_toks or len(row_toks) > 6:
                continue   # a whole-sentence 'name' is not a component identity
            dist = [t for t in row_toks if t not in _EXIST_GENERIC_TOKENS]
            if not dist:
                continue   # all-generic row ('Tank') can never falsify an omission claim
            all_present = all(any(_exist_tok_hit(t, c) for c in claim_toks) for t in row_toks)
            dist_present = any(any(_exist_tok_hit(t, c) for c in claim_toks) for t in dist)
            if all_present and dist_present:
                return True  # the 'omitted' component demonstrably SHIPS → stale claim
    # (e) "a SINGLE / only one <part>" undercount shape — falsified if the contract shows that part's
    # count ≥ 2 (the design demonstrably has the required multiple units; the critic under-counted).
    if _PHYS_SINGULAR_RX.search(txt):
        # the part noun tokens: the significant words right after the singular phrase / in the 'where' path
        toks = set(re.findall(r"[a-z]{4,}", txt))
        toks -= {"single", "only", "lone", "just", "design", "specifies", "rated", "brief", "requires",
                 "explicitly", "with", "that", "this", "each", "unit", "units", "system", "which", "using",
                 "water", "powered", "nutrient"}
        for noun in ("pump", "tank", "vessel", "blower", "compressor", "filter", "skid", "exchanger"):
            if noun in toks:
                # a couple of qualifier tokens + the noun (e.g. {dosing, pump}) must match a *_count ≥ 2
                quals = [t for t in toks if t not in (noun,)][:3]
                for qtok in quals:
                    if _contract_count_ge2_for(state, {qtok, noun}):
                        return True  # the design has ≥2 of this part → 'a single <part>' is false
    return False


# --------------------------------------------------------------------------- #
# DETERMINISTIC CORROBORATION LAYER (Tristan 2026-07-03 — B3 extended to the
# critic's FINDING SET)
# --------------------------------------------------------------------------- #
# v56c vs v56d (identical code, identical delivered design words, fresh runs): the
# LLM physics critic re-rolled 3→5 'engine-fixable' findings, and those findings
# leaked straight into scores (Risk tab 7.0→5.8, physics_fidelity 6, floor mirrors).
# B3 caged the critic's SCORES; this layer cages its FINDING SET:
#
#   A critic finding may SCORE (Risk-register ENGINE-FIXABLE row, physics_fidelity
#   deduction, unresolved_critic_highs) ONLY when a DETERMINISTIC check over the
#   DELIVERED artefacts corroborates it. An uncorroborated finding renders as an
#   ADVISORY note — visible, honest, NEVER scores.
#
# Corroborable claim shapes (each with its own matcher, the f9dfc2918
# distinguishing-token discipline):
#   (a) rating_pair       — "X rated A kW but its motor/drive is B kW": both values
#                           must live on the delivered BoM rows and genuinely diverge
#                           beyond the 1.25× motor-service tolerance. A corroborated
#                           rating_pair claim scores through the CANONICAL SWEEP of
#                           every delivered machine↔drive pair (state-derived, deduped,
#                           sorted) — so identical designs yield IDENTICAL scoring rows
#                           however many of the pairs the critic happened to mention.
#   (b) brief_vs_delivered — the claim pins a brief value: corroborated iff that value
#                           exists in parsedBrief AND the named delivered row carries a
#                           same-family value diverging >2%.
#   (c) existence          — "the design omits X": already falsifiable (shape f of
#                           _physics_claim_falsified); corroborated iff the named
#                           component genuinely matches NO delivered row.
#   (d) count              — "only one X": corroborated iff the contract counts confirm
#                           exactly the claimed deficiency (a *_count == 1).
# Everything else (material-suitability opinion, external-catalogue part-identity
# claims, freeboard/oversize judgement calls) is UNCORROBORATED → advisory.

_CORR_KW_RX = re.compile(r"(\d+(?:\.\d+)?)\s*k(?:w\b|ilowatts?)", re.I)
_CORR_DRIVE_CHILD_RX = re.compile(r"\b(?:drive\s+)?(?:gear)?motor\b|\bvsd\b|variable[- ]speed\s+drive", re.I)
_CORR_DRIVEN_PARENT_RX = re.compile(
    r"\b(pump|blower|compressor|fan|agitator|mixer|conveyor|feeder|centrifuge)s?\b", re.I)
_CORR_BRIEF_CITE_RX = re.compile(r"\bbrief\b|\bspecification\b|specif(?:y|ies|ied)|requirement\b", re.I)
# a motor/VSD up to 25% above its driven machine is standard service-margin selection;
# beyond that the delivered rows genuinely disagree with each other.
_RATING_PAIR_SERVICE_TOL = 1.25
_CORR_EQUIP_NOUNS = ("pump", "tank", "vessel", "blower", "compressor", "filter",
                     "skid", "exchanger", "sensor", "valve", "motor", "drive")


def _word_kw(w):
    """The word's electrical POWER rating in kW, or None. Only a kW-family modifier
    counts — a '90 m³/h' rating_primary must never read as 90 kW (unit-family bug)."""
    for mc in (w.get("modifier_characters") or []):
        if mc.get("kind") in ("power", "rating_primary", "rating"):
            txt = f"{mc.get('value') or ''} {mc.get('unit') or ''}"
            if re.search(r"m³|m3|/h|/s|bar|°c|\bv\b|litre|liter", txt, re.I):
                continue  # flow / pressure / voltage family — not power
            m = _CORR_KW_RX.search(txt)
            if m:
                try:
                    return float(m.group(1))
                except ValueError:
                    pass
    return None


def _iter_words_with_module(state):
    """Yield (module_id, word) for every word in the shipped design."""
    for m in (state.get("moduleDecomposition") or {}).get("modules") or []:
        mid = str(m.get("module") or "")
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                yield mid, w


# --------------------------------------------------------------------------- #
# CURRENT-RATING-PAIR shape (Tristan 2026-07-05 — the doctrine's fourth
# application: gate 33 blocking requires deterministic corroboration).
#
# The v4 BESS rack-fuse case: the Physics Critic named a PROTECTIVE device
# (fuse/breaker/contactor/switch) by its OWN part number and asserted it is
# "undersized" — but relative to an UNRELATED device's rating (a disconnect
# switch / contactor), not a genuine current-vs-load deficiency (matching a
# fuse's rating to upstream switching hardware inverts protective
# coordination — see deterministic-emitter.ts's RACK_FUSE_AMPACITY_SAFETY_
# FACTOR comment). Unlike the kW rating_pair shape (a motor vs its OWN driven
# machine, paired by character-id lineage), a protective-device sizing claim
# has no such lineage to pair on — it is verified by LOCATING the delivered
# part BY ITS OWN part_number (quoted in the claim text) and comparing its
# OWN rated current against the contract's continuous-current demand — the
# same DELIVERED-ROWS'-OWN-VALUES discipline as _rating_pair_sweep, extended
# from kW to Amps.
# --------------------------------------------------------------------------- #

_CORR_PROTECTIVE_NOUN_RX = re.compile(r"\bfuses?\b|\bbreakers?\b|\bcontactors?\b|\bswitchgear\b|\bdisconnects?\b", re.I)
_CORR_UNDERSIZE_RX = re.compile(
    r"undersiz|under-siz|underrat|under-rat|insufficient(?:ly)?\s+rated|inadequate|too\s+small|"
    r"will\s+run\s+hot|nuisance[- ]trip", re.I)
_CORR_AMP_MENTION_RX = re.compile(r"\d+(?:\.\d+)?\s*a\b(?!h)", re.I)
_CORR_AMP_RX = re.compile(r"(\d+(?:\.\d+)?)\s*a\b(?!h)", re.I)
# Candidate part-number tokens: alphanumeric groups joined by hyphen/slash
# (PV-200A-1XL-B-15, C310K/500, OTDC315FV11-ESS, …) — deliberately loose,
# every candidate is verified against a REAL delivered part_number below, so
# a false candidate simply fails to match anything (no false corroboration).
_PN_CAND_RX = re.compile(r"\b[A-Za-z][A-Za-z0-9]*(?:[-/][A-Za-z0-9]+){1,6}\b")


def _word_amps(w):
    """The word's own rated CURRENT in Amps, or None. Mirrors _word_kw for the
    amp family — reads capacity/rating_primary/rating modifiers (the three
    kinds the emitter uses for a fuse/breaker's rating — see
    collectEmittedVoltageRatings in sizing-vs-design-audit.ts), rejecting an
    obvious non-current unit (kW/V/flow/pressure/Ah) sharing the same
    modifier."""
    for mc in (w.get("modifier_characters") or []):
        if mc.get("kind") in ("capacity", "rating_primary", "rating"):
            txt = f"{mc.get('value') or ''} {mc.get('unit') or ''}".strip()
            if re.search(r"\bk?w\b|kilowatt|\bv\b|volt|m³|m3|/h|/s|bar|°c|litre|liter|\bah\b", txt, re.I):
                continue
            m = _CORR_AMP_RX.search(txt)
            if m:
                try:
                    return float(m.group(1))
                except ValueError:
                    pass
    return None


def _find_word_by_part_number(state, candidates):
    """Locate the delivered word whose OWN part_number modifier matches one of
    the candidate tokens extracted from the critic's claim text (case-
    insensitive, exact or substring either direction — the critic sometimes
    quotes a shortened/lengthened form of the real PN). None if no candidate
    resolves to a real delivered part."""
    if not candidates:
        return None
    cand_u = [c.upper() for c in candidates if len(c) >= 4]
    if not cand_u:
        return None
    for _mid, w in _iter_words_with_module(state):
        pn = None
        for mc in (w.get("modifier_characters") or []):
            if mc.get("kind") == "part_number":
                pn = str(mc.get("value") or "").strip()
                break
        if not pn:
            continue
        pn_u = pn.upper()
        for cu in cand_u:
            if cu == pn_u or cu in pn_u or pn_u in cu:
                return w
    return None


def _contract_continuous_current_a(state, prefer_tokens=()):
    """Best-effort UNIVERSAL lookup of a 'continuous current' contract quantity
    (Amps) — any quantities-key carrying BOTH 'current' and 'continuous'
    tokens; when several match, prefers the one that ALSO carries a token in
    `prefer_tokens` (e.g. {'string','rack'} for a per-rack/string demand, so
    a bus-level AND a rack-level continuous-current quantity co-existing does
    not pick the wrong one)."""
    best = None
    best_score = -1
    for ck in ("orchestratorContract", "engineeringContract"):
        qs = (state.get(ck) or {}).get("quantities")
        if not isinstance(qs, dict):
            continue
        for k, v in qs.items():
            kt = set(re.findall(r"[a-z0-9]+", k.lower()))
            if not ({"current", "continuous"} <= kt):
                continue
            val = (v or {}).get("value") if isinstance(v, dict) else v
            try:
                fval = float(str(val))
            except (TypeError, ValueError):
                continue
            score = sum(1 for t in prefer_tokens if t in kt)
            if score > best_score:
                best_score = score
                best = fval
    return best


def _rating_pair_sweep(state) -> list:
    """CANONICAL sweep of every delivered machine ↔ motor/drive rating pair.

    Pairing is by character-id lineage (`<parent>_word__<child>` — the synthesis pass
    stamps a sub-component's parent into its character_id), so it is exact, not fuzzy.
    A pair rows-in only when BOTH sides carry a kW rating and the ratio exceeds the
    1.25× motor-service tolerance. One row per parent machine (motor + VSD echo the
    same source defect); severity from the EVIDENCE (ratio ≥2× → high, else med) so a
    critic re-roll can never move it. Output sorted by parent id → deterministic."""
    by_cid: dict = {}
    entries = []
    for mid, w in _iter_words_with_module(state):
        cid = str(((w.get("content_character") or {}).get("character_id")) or "")
        nm = str(w.get("name_human") or "")
        entries.append((mid, w, cid, nm))
        if cid and cid not in by_cid:
            by_cid[cid] = (mid, w, nm)
    grouped: dict = {}
    for mid, w, cid, nm in entries:
        m2 = re.match(r"^(?P<parent>.+?)_word__(?P<child>.+)$", cid)
        if not m2:
            continue
        if not re.search(r"motor|drive|vsd", m2.group("child")):
            continue
        pent = by_cid.get(m2.group("parent"))
        if not pent:
            continue
        pmid, pw, pnm = pent
        pkw, ckw = _word_kw(pw), _word_kw(w)
        if not pkw or not ckw or pkw <= 0 or ckw <= 0:
            continue
        ratio = max(pkw, ckw) / min(pkw, ckw)
        if ratio <= _RATING_PAIR_SERVICE_TOL + 1e-9:
            continue
        g = grouped.setdefault(m2.group("parent"),
                               {"parent_name": pnm, "parent_kw": pkw, "module": pmid, "children": set()})
        g["children"].add((nm, ckw))
    out = []
    for key in sorted(grouped):
        g = grouped[key]
        worst = max(kw for _n, kw in g["children"])
        ratio = max(worst, g["parent_kw"]) / min(worst, g["parent_kw"])
        sev = "high" if ratio >= 2.0 else "med"
        kids = " + ".join(f"{n} {kw:g} kW" for n, kw in sorted(g["children"]))
        out.append({
            "dimension": "engineering_plausibility",
            "severity": sev,
            "confidence": "high",
            "where": f"{g['module']}/{g['parent_name']}",
            "issue": (f"{g['parent_name']} is rated {g['parent_kw']:g} kW but its drive train "
                      f"({kids}) diverges beyond the 1.25x motor-service tolerance "
                      f"(ratio {ratio:.2f}) — both values are on the delivered BoM rows "
                      f"(deterministic rating-pair corroboration)"),
            "suggested_check": ("align the drive motor / VSD rating with the driven machine at its "
                                "SOURCE rule (the synthesis pass that mints drive-train ratings), "
                                "add its regression guard, re-run"),
            "corroboration": "corroborated",
            "shape": "rating_pair",
            "parent_name": g["parent_name"],
        })
    return out


def _claim_tokens(issue) -> set:
    txt = f"{issue.get('issue') or ''} {issue.get('title') or ''} {issue.get('where') or ''}".lower()
    return {t for t in re.findall(r"[a-z]{4,}", txt)}


def _brief_numbers(state) -> set:
    """Every numeric value pinned anywhere in the parsedBrief (deep scan, incl. numbers
    embedded in strings) — the deterministic 'does the brief actually say N?' oracle."""
    out: set = set()

    def _walk(x):
        if isinstance(x, dict):
            for v in x.values():
                _walk(v)
        elif isinstance(x, list):
            for v in x:
                _walk(v)
        elif isinstance(x, (int, float)) and not isinstance(x, bool):
            out.add(round(float(x), 6))
        elif isinstance(x, str):
            for m in re.findall(r"\d+(?:\.\d+)?", x):
                try:
                    out.add(round(float(m), 6))
                except ValueError:
                    pass
    _walk(state.get("parsedBrief") or {})
    return out


# Equipment nouns the COUNT shape may corroborate against (a *_count contract quantity).
_COUNT_EQUIP_NOUNS = ("pump", "tank", "vessel", "blower", "compressor", "filter",
                      "skid", "exchanger")


def _singular_claim_nouns(txt: str) -> list:
    """→ [(noun, window_qualifiers)] — the equipment noun(s) a singular phrase is actually
    ABOUT, read from the short noun window right after 'a single / only one / …', plus the
    window's other tokens as the noun's qualifiers. 'a single water-powered DOSING PUMP' →
    [('pump', ['dosing', 'powered', 'water'])]. 'consolidated into a single SCHEDULE LINE of
    17 units … reverse osmosis skid ×1 …' → [] — the phrase counts a schedule LINE, not
    equipment; matching 'skid' from the vessel roster against the unrelated
    reverse_osmosis_skid_count = 1 manufactured the codema-v61 false corroboration (a row no
    design change could ever clear). Deterministic; used by the count-shape corroborator."""
    out = []
    for m in _PHYS_SINGULAR_RX.finditer(txt or ""):
        window_toks = re.findall(r"[a-z]{4,}", txt[m.end():m.end() + 44].lower())[:5]
        for t in window_toks:
            noun = _singularise(t)
            if noun in _COUNT_EQUIP_NOUNS and noun not in [n for n, _q in out]:
                quals = sorted({_singularise(q) for q in window_toks
                                if _singularise(q) != noun and q not in _EXIST_GENERIC_TOKENS})
                out.append((noun, quals))
    return out


def _finding_shape(issue) -> str:
    """Classify a critic finding into its corroborable claim shape (most specific first)."""
    txt = f"{issue.get('issue') or ''} {issue.get('title') or ''} {issue.get('where') or ''}"
    kws = _CORR_KW_RX.findall(txt)
    if len(kws) >= 2 and _CORR_DRIVE_CHILD_RX.search(txt) and _CORR_DRIVEN_PARENT_RX.search(txt):
        return "rating_pair"
    if (_CORR_PROTECTIVE_NOUN_RX.search(txt) and _CORR_AMP_MENTION_RX.search(txt)
            and _CORR_UNDERSIZE_RX.search(txt)):
        return "current_rating_pair"
    if kws and _CORR_BRIEF_CITE_RX.search(txt):
        return "brief_vs_delivered"
    if _PHYS_OMITS_RX.search(txt):
        return "existence"
    if _PHYS_SINGULAR_RX.search(txt):
        return "count"
    return "other"


def _corroborate_finding(state, issue):
    """→ (verdict, shape, detail). verdict ∈ 'corroborated' | 'uncorroborated' | 'falsified'.
    A finding corroborates ONLY when a deterministic check over the DELIVERED artefacts
    confirms its claim; a deterministically FALSE claim is 'falsified'; anything the
    matchers cannot decide is 'uncorroborated' (advisory — never scores)."""
    shape = _finding_shape(issue)
    if _physics_claim_falsified(state, issue):
        return ("falsified", shape, "the claim is deterministically FALSE against the delivered state")
    toks = _claim_tokens(issue)
    if shape == "rating_pair":
        for row in _rating_pair_sweep(state):
            row_toks = {t for t in re.findall(r"[a-z]{4,}", str(row["parent_name"]).lower())}
            dist = row_toks - set(_CORR_EQUIP_NOUNS)
            if row_toks and row_toks <= toks and (not dist or (dist & toks)):
                return ("corroborated", shape,
                        f"delivered rows confirm the rating divergence on {row['parent_name']}")
        return ("uncorroborated", shape,
                "the claimed rating pair does not diverge beyond tolerance on any delivered row pair")
    if shape == "current_rating_pair":
        # locate the flagged protective device by ITS OWN part number (quoted
        # in the claim text) — never by the LLM's `where` index, which is
        # unreliable when a module/sub_module name repeats (same discipline
        # as physics-critic-autocorrect's locate-by-part-tokens fix).
        raw_cp = f"{issue.get('issue') or ''} {issue.get('title') or ''}"
        candidates = _PN_CAND_RX.findall(raw_cp)
        w = _find_word_by_part_number(state, candidates)
        if w is None:
            return ("uncorroborated", shape,
                    "the named protective device could not be located among delivered words by part number")
        delivered_a = _word_amps(w)
        if delivered_a is None:
            return ("uncorroborated", shape,
                    "the delivered part carries no extractable current rating to verify against")
        required_a = _contract_continuous_current_a(state, prefer_tokens={"string", "rack"})
        if not required_a or required_a <= 0:
            return ("uncorroborated", shape,
                    "no contract continuous-current quantity available to verify the claimed undersizing")
        ratio = delivered_a / required_a
        if ratio >= _RATING_PAIR_SERVICE_TOL - 1e-9:
            return ("falsified", shape,
                    f"delivered part ({w.get('name_human')}) is rated {delivered_a:g} A vs the contract's "
                    f"{required_a:g} A continuous demand — {ratio:.2f}x margin clears the "
                    f"{_RATING_PAIR_SERVICE_TOL}x floor; the claimed undersizing is arithmetically false")
        return ("corroborated", shape,
                f"delivered part ({w.get('name_human')}) is rated {delivered_a:g} A against the contract's "
                f"{required_a:g} A continuous demand — {ratio:.2f}x margin genuinely falls short of the "
                f"{_RATING_PAIR_SERVICE_TOL}x floor")
    if shape == "brief_vs_delivered":
        txt = f"{issue.get('issue') or ''} {issue.get('title') or ''}"
        cited = {round(float(v), 6) for v in _CORR_KW_RX.findall(txt)}
        brief_vals = cited & _brief_numbers(state)
        if brief_vals:
            for _mid, w in _iter_words_with_module(state):
                nm = str(w.get("name_human") or "").lower()
                nm_toks = {t for t in re.findall(r"[a-z]{4,}", nm)}
                if not nm_toks or not (nm_toks <= toks):
                    continue
                kw = _word_kw(w)
                if kw is None:
                    continue
                for bv in brief_vals:
                    if bv > 0 and abs(kw - bv) / bv > 0.02:
                        return ("corroborated", shape,
                                f"brief pins {bv:g} kW; delivered row '{w.get('name_human')}' carries {kw:g} kW")
        return ("uncorroborated", shape,
                "the cited brief value / delivered divergence could not be confirmed on the rows")
    if shape == "existence":
        # not falsified (checked above) → verify the claim names something concrete that
        # genuinely matches NO delivered row (the inverse of falsifier shape f).
        raw = f"{issue.get('issue') or ''} {issue.get('title') or ''}"
        quoted = [q for q in re.findall(r"'([^']{3,40})'", raw) + re.findall(r'"([^"]{3,40})"', raw)
                  if re.search(r"[a-z]{3}", q, re.I)]
        candidates = quoted or [raw]
        for cand in candidates:
            c_toks = [t for t in re.findall(r"[a-z]{4,}", cand.lower())]
            nouns = [t for t in c_toks if _singularise(t) in
                     {_singularise(n) for n in _CORR_EQUIP_NOUNS}]
            quals = [t for t in c_toks if t not in _EXIST_GENERIC_TOKENS and t not in nouns]
            if not nouns or not quals:
                continue
            hit = any(
                any(_exist_tok_hit(n, rt) for rt in re.findall(r"[a-z0-9]{2,}", str(rn).lower()))
                and any(any(_exist_tok_hit(q, rt) for rt in re.findall(r"[a-z0-9]{2,}", str(rn).lower()))
                        for q in quals)
                for n in nouns for rn in _delivered_row_names(state))
            if not hit:
                return ("corroborated", shape,
                        f"no delivered row matches the claimed component ('{cand[:60]}') — genuine omission")
        return ("uncorroborated", shape,
                "the omission claim names no component the existence scan can decide")
    if shape == "count":
        # not falsified → the contract does NOT show ≥2; corroborated iff a matching
        # *_count quantity exists and equals exactly 1 (the claimed deficiency).
        # The noun must be what the singular phrase is ABOUT (its immediate noun window) —
        # scanning the WHOLE claim for any equipment noun manufactured the codema-v61 false
        # corroboration: "consolidated into a single SCHEDULE LINE of 17 units … reverse
        # osmosis skid ×1 …" grabbed 'skid' from the vessel roster and "confirmed" the
        # unrelated reverse_osmosis_skid_count = 1, so the row could NEVER clear however the
        # design changed. A false corroboration is as dishonest as a false PASS.
        txt_sing = f"{issue.get('issue') or ''} {issue.get('title') or ''} {issue.get('where') or ''}"
        for noun, win_quals in _singular_claim_nouns(txt_sing):
            # qualifiers = the words of the singular phrase itself ('a single DOSING pump' →
            # 'dosing'), widened to the whole claim when the phrase is bare — deterministic
            # (sorted), never an arbitrary slice of an unordered set.
            quals = (win_quals or sorted(t for t in toks if t != noun))[:6]
            for ck in ("orchestratorContract", "engineeringContract"):
                qs = (state.get(ck) or {}).get("quantities")
                if not isinstance(qs, dict):
                    continue
                for k, v in qs.items():
                    kt = set(re.findall(r"[a-z0-9]+", k.lower()))
                    if "count" in kt and noun in kt and any(q in kt for q in quals):
                        val = (v or {}).get("value") if isinstance(v, dict) else v
                        try:
                            if float(str(val)) == 1:
                                return ("corroborated", shape,
                                        f"contract confirms {k} = 1 (the claimed single unit)")
                        except (TypeError, ValueError):
                            pass
        return ("uncorroborated", shape, "no contract count confirms the claimed deficiency")
    return ("uncorroborated", shape,
            "no deterministic matcher corroborates this claim shape — advisory only")


def _canonicalise_issues(state, issues) -> list:
    """The scoring view: corroborated findings → their canonical, state-derived evidence
    rows (rating_pair claims score through the FULL deterministic sweep — the CORE FIX
    PRINCIPLE: one wrong rule is wrong for the whole class, and identical states must
    yield identical rows); uncorroborated/falsified findings → ADVISORY notes (visible,
    labelled, never score). Idempotent via the 'corroboration' marker."""
    issues = [i for i in (issues or []) if isinstance(i, dict)]
    if any(i.get("corroboration") for i in issues):
        return issues  # already canonicalised (the chain wrote this critique)
    scoring: list = []
    advisory: list = []
    swept_rating_pairs = False
    for i in issues:
        verdict, shape, detail = _corroborate_finding(state, i)
        if verdict == "corroborated" and shape == "rating_pair":
            swept_rating_pairs = True  # scored via the canonical sweep below (deduped)
            continue
        if verdict == "corroborated":
            canon = dict(i)
            canon["corroboration"] = "corroborated"
            canon["shape"] = shape
            canon["issue"] = f"{str(i.get('issue') or '')} [corroborated: {detail}]"
            scoring.append(canon)
            continue
        adv = dict(i)
        adv["corroboration"] = verdict
        adv["shape"] = shape
        adv["advisory"] = True
        adv["issue"] = (f"ADVISORY ({verdict} by deterministic check — visible, never scores): "
                        f"{str(i.get('issue') or '')}")
        advisory.append(adv)
    if swept_rating_pairs:
        scoring = _rating_pair_sweep(state) + scoring
    return scoring + advisory


def canonicalise_physics_critique(state, critique) -> dict:
    """PUBLIC: return a NEW critique object whose issues are the canonical scoring view
    (see _canonicalise_issues) + a per-finding corroboration report. The chain calls this
    on the final shipped critique so the file, state.physicsCritique, the Excel Risk
    register and the floor all read the SAME deterministic set."""
    critique = dict(critique) if isinstance(critique, dict) else {}
    raw = [i for i in (critique.get("issues") or []) if isinstance(i, dict)]
    report = []
    for i in raw:
        if i.get("corroboration"):
            report = critique.get("corroboration_report") or []
            break
        verdict, shape, detail = _corroborate_finding(state, i)
        report.append({"issue": str(i.get("issue") or "")[:200], "shape": shape,
                       "verdict": verdict, "detail": detail})
    critique["issues"] = _canonicalise_issues(state, raw)
    critique["corroboration_report"] = report
    critique["raw_issue_count"] = len(raw)
    return critique


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
# MEASURE / SCOPE words — the part of a metric name that says HOW it is measured or at what scope,
# not WHAT it is. Stripped to leave the SUBJECT noun(s) for the subject-anchored match (Pass 4), so a
# brief that names a REQUIREMENT by its measure word ('irrigation_demand') still binds to the DELIVERED
# quantity that names it differently ('irrigation_pump_flow').
_MEASURE_SCOPE_TOKENS = {
    "demand", "capacity", "throughput", "flow", "rate", "duty", "load", "output", "delivery",
    "department", "each", "module", "per", "total", "max", "min", "peak", "required", "target",
    "pump", "motor", "power", "volume", "size", "value",
}


def _singularise(tok: str) -> str:
    """Fold a trailing plural so containers ≡ container, valves ≡ valve."""
    return tok[:-1] if len(tok) > 3 and tok.endswith("s") and not tok.endswith("ss") else tok


def _name_tokens(name) -> set:
    """Engineering-identity tokens of a name: normalised, unit/stop tokens dropped,
    plurals folded. Used for the token-subset compliance match."""
    base = _norm_name(name)
    return {_singularise(t) for t in base.split("_") if t and t not in _MATCH_STOP_TOKENS}


# --------------------------------------------------------------------------- #
# Scope-qualified brief targets — "battery/container-only" cost (or other) anchors
# --------------------------------------------------------------------------- #
# A brief may state a target for a SUBSET of the design ("the battery-energy-storage
# portion only — cells, racks, ... — but EXCLUDING the medium-voltage step-up
# transformer, the switchgear, and civil works — costs approximately £63 per kWh")
# while the engine also derives a FULL-SYSTEM figure of the same NAME for transparency
# (cost_per_kwh_gbp = £113/kWh, battery+PCS). Matching the brief's scope-restricted
# number against the full-system quantity compares the right unit family but the WRONG
# SCOPE — it manufactures a false FAIL (or, the other direction, a false PASS). The
# closure layer publishes a scope-restricted sibling under the naming convention
# "<scope>_only_<metric_name>" (e.g. battery_only_cost_per_kwh_gbp alongside
# cost_per_kwh_gbp) whenever one exists; this pass finds it by that NAMING CONVENTION
# (never a hardcoded class/metric table) and ONLY when the brief's own prose, within a
# short window of THIS metric's cited target value, carries an explicit scope
# restriction ("... only ... excluding ..."). A genuinely-missed scoped target still
# fails downstream — this only redirects WHICH quantity is compared, it never
# manufactures a PASS. Universal: keyed off exclusion language near the cited number,
# so it fires for any future scope-restricted brief target, in any class.
_SCOPE_ONLY_RX = re.compile(r"\bonly\b", re.I)
_SCOPE_EXCLUDE_RX = re.compile(r"\bexclud\w*\b", re.I)


def _brief_value_reprs(value) -> set:
    v = _num(value)
    if v is None:
        return set()
    reps = {f"{v:g}"}
    for nd in (0, 1, 2):
        reps.add(f"{v:.{nd}f}")
    return reps


def _brief_scope_qualified(state, metric_value) -> bool:
    """True when the brief's own text, within a short window of THIS metric's cited
    target value, states BOTH an 'only' restriction and an 'excluding' exclusion — i.e.
    the brief itself scopes the target to a SUBSET of the full design."""
    reps = _brief_value_reprs(metric_value)
    if not reps:
        return False
    pb = state.get("parsedBrief") or {}
    for text in (pb.get("original_text"), pb.get("revised_text")):
        if not isinstance(text, str) or not text:
            continue
        for rep in reps:
            for m in re.finditer(re.escape(rep), text):
                window = text[max(0, m.start() - 250): m.start() + 60]
                if _SCOPE_ONLY_RX.search(window) and _SCOPE_EXCLUDE_RX.search(window):
                    return True
    return False


# An APPROXIMATION hedge on a brief-stated figure — 'approximately', 'approx.', '~',
# 'about', 'roughly' — placed near the cited number. When the brief itself discloses a
# value as approximate, a feedstock/consumption metric (see _is_feedstock_metric above)
# gets a widened tolerance band instead of the tight 2% "meets" check: see
# check_brief_metric_fail. This mirrors _brief_scope_qualified's window-around-the-
# cited-value technique (same _brief_value_reprs helper) rather than reinventing it.
_APPROX_RX = re.compile(r"~|\bapprox(?:imately|\.)?\b|\babout\b|\broughly\b", re.I)


def _brief_value_approximated(state, metric_value) -> bool:
    """True when the brief's own text, within a short window of THIS metric's cited
    target value, hedges it with an approximation word — i.e. the brief itself states
    the figure is not exact."""
    reps = _brief_value_reprs(metric_value)
    if not reps:
        return False
    pb = state.get("parsedBrief") or {}
    for text in (pb.get("original_text"), pb.get("revised_text")):
        if not isinstance(text, str) or not text:
            continue
        for rep in reps:
            for m in re.finditer(re.escape(rep), text):
                window = text[max(0, m.start() - 40): m.start()]
                if _APPROX_RX.search(window):
                    return True
    return False


def _contract_match(state, metric_name, metric_unit, metric_value=None):
    """
    Return (key, value) of a contract quantity that FULFILS the brief metric (same unit
    family, matching name), else (None, None). This is the deterministic "would the
    brief-compliance matcher find it" oracle. Passes, most-specific first:
      0. SCOPE-QUALIFIED sibling match — see the block comment above. Only engages when
         `metric_value` is given AND the brief's own prose scopes it (Pass 0 never fires
         on an ordinary, unscoped metric).
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
    # Pass 0: scope-qualified sibling match (see block comment above _contract_match).
    if metric_value is not None and _brief_scope_qualified(state, metric_value):
        sib_rx = re.compile(r"^[a-z0-9]+_only_" + re.escape(target) + r"$")
        for k, v in _quantities(state).items():
            if not isinstance(v, dict):
                continue
            if sib_rx.match(_norm_name(k)) and _fam_compatible(fam, _unit_family(v.get("unit"))):
                return (k, v.get("value"))
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
        # SUBJECT-token gating (2026-07-09 — mirrors build-excel-export._match_quantity,
        # the ONE-matcher doctrine): need + overlap are computed over the metric's SUBJECT
        # tokens (identity minus measure/scope words), so a measure word can neither
        # INFLATE the threshold (ro_makeup_FLOW → 3 tokens → need 2 → the honest match
        # ro_high_pressure_pump_throughput, overlap {ro} = 1, was unreachable → a false
        # UNVERIFIED the renderer disagreed with) nor DECIDE a match on its own
        # (gac_softener_throughput must still never bind cloth_filter_throughput on
        # 'throughput' alone — measure words carry no subject identity). Falls back to
        # the full token set when the name is entirely measure words.
        b_subject = (b_tokens - _MEASURE_SCOPE_TOKENS) or b_tokens
        need = max(1, (len(b_subject) + 1) // 2)  # at least half the SUBJECT tokens covered
        best = None  # (-subject_overlap, -full_overlap, peak_penalty, extra_tokens, key, value)
        for k, v in _quantities(state).items():
            if not isinstance(v, dict):
                continue
            if set(_norm_name(k).split("_")) & _ECHO_NAME_TOKENS:
                continue  # requirement-echo → would manufacture a false PASS
            qfam = _unit_family(v.get("unit"))
            if not _fam_compatible(fam, qfam):
                continue
            q_tokens = _name_tokens(k)
            overlap = len(b_subject & q_tokens)
            if overlap < need:
                continue
            # rank ties by the FULL-token overlap too (richer context wins among equally-
            # valid subject matches) — mirrors the renderer's ranking exactly.
            full_overlap = len(b_tokens & q_tokens)
            penalty = 1 if re.search(r"peak|max|surge|inrush", str(k).lower()) else 0
            cand = (-overlap, -full_overlap, penalty, len(q_tokens - b_tokens), k, v.get("value"))
            if best is None or cand < best:
                best = cand
        if best is not None:
            return (best[4], best[5])
    # Pass 4: SUBJECT-anchored family match. When the brief names a REQUIREMENT by a word the DELIVERED
    # quantity doesn't share (irrigation 'demand' ↔ the delivered irrigation 'pump_flow'), bind by the
    # metric's distinctive SUBJECT noun(s) + same family, preferring the fewest extra tokens. Requires
    # EVERY subject noun present (so it stays specific) and excludes requirement-echoes. Removes the
    # false-UNVERIFIED on a met demand (v14 max_irrigation_demand_per_department met by irrigation_pump_flow).
    subj = {t for t in b_tokens if t not in _MEASURE_SCOPE_TOKENS}
    if subj:
        best4 = None
        for k, v in _quantities(state).items():
            if not isinstance(v, dict):
                continue
            if set(_norm_name(k).split("_")) & _ECHO_NAME_TOKENS:
                continue
            if not _fam_compatible(fam, _unit_family(v.get("unit"))):
                continue
            q_tokens = _name_tokens(k)
            if subj <= q_tokens:                      # every subject noun present in the quantity
                cand4 = (len(q_tokens - b_tokens), k, v.get("value"))
                if best4 is None or cand4 < best4:
                    best4 = cand4
        if best4 is not None:
            return (best4[1], best4[2])
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
# Deliberate dedupe-fold statuses: the row stays visible at line £0; its value lives on
# the parent line named in `sub_of` (ledger fold, bar-C dedupe work, 2026-07-02).
_FOLD_STATUSES = {"MERGED·SYNONYM", "IN ASSEMBLY"}


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
            _clip(str(r.get("part") or r.get("requirement") or "?"), 40) for r in untagged[:3]
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
    #
    # FOLD SEMANTICS (Tristan catch routed 2026-07-03): the dedupe pass deliberately keeps a
    # folded row VISIBLE at line £0 with a fold status ('MERGED·SYNONYM' — a synonym line
    # naming the same physical thing; 'IN ASSEMBLY' — a component already priced inside its
    # assembly line) and `sub_of` naming the PARENT that carries the price. Such a row's £0
    # is CORRECT — the check verifies the PARENT exists (its own qty×unit=line is checked by
    # this same loop). A £0 fold row whose named parent does NOT exist is a genuine defect
    # and still flags. proveCatch both directions in _selftest.
    def _base_name(x) -> str:
        # ledger names carry a ' · spec' suffix ('Uf Membrane Bank · 364 m² area');
        # sub_of names the BASE — compare on the base.
        return str(x or "").split("·")[0].strip().lower()

    def _fold_parent_exists(r) -> bool:
        # INTENT: sub_of may name the parent by requirement lead OR by tag
        # (requirements_bom historically stamped either). Accept both so a correct
        # fold never false-HIGHs on a tag-shaped parent pointer (Codema 2026-07-09).
        target = _base_name(r.get("sub_of"))
        if not target or target in ("—", "-"):
            return False
        for p in rows:
            if p is r or not isinstance(p, dict):
                continue
            if _status(p) in _FOLD_STATUSES:
                continue
            if float(p.get("line_gbp") or 0) <= 0:
                continue
            name = _base_name(p.get("requirement") or p.get("part"))
            tag = str(p.get("tag") or "").strip().lower()
            if name == target or tag == target:
                return True
        return False

    for r in rows:
        if _status(r) == "SUB-COMPONENT":
            continue
        qty = _num(r.get("qty"))
        unit = _num(r.get("unit_gbp"))
        line = _num(r.get("line_gbp"))
        if qty is None or unit is None or line is None:
            continue
        if _status(r) in _FOLD_STATUSES and round(line) == 0:
            if _fold_parent_exists(r):
                continue      # deliberate fold — the priced parent carries the arithmetic
            out.append(Finding(
                tab=tab, check="line_math", severity="HIGH",
                message=(f"£0 fold row "
                         f"'{_clip(str(r.get('requirement') or r.get('part') or '?'), 40)}' "
                         f"({_status(r)}) names parent '{_clip(str(r.get('sub_of') or '—'), 40)}' "
                         "but no priced line with that name exists — a fold must point at a real parent"),
                actual="fold parent missing", expected="sub_of names a priced BoM line",
                source_rule="a MERGED·SYNONYM / IN ASSEMBLY fold row must reference its priced parent line",
            ))
            continue
        if abs(round(qty * unit) - round(line)) > 1:
            out.append(Finding(
                tab=tab, check="line_math", severity="HIGH",
                message=(f"line math wrong for "
                         f"'{_clip(str(r.get('part') or r.get('tag') or '?'), 40)}': "
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
                         f"'{_clip(str(r.get('part') or r.get('tag') or '?'), 40)}' "
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
    qk, _ = _contract_match(state, name, m.get("unit"), m.get("value") if isinstance(m, dict) else None)
    return qk is None


# --------------------------------------------------------------------------- #
# Check 3.5 — Brief-compliance UNVERIFIED lines drop the Executive Summary
# --------------------------------------------------------------------------- #

def check_brief_compliance_unverified(state, rows, run_dir) -> list:
    """Every brief metric the compliance matrix renders UNVERIFIED (NO contract quantity fulfils it)
    is a requirement the engine CANNOT confirm the design meets — an honest GAP, not a free note. It
    must DROP the Executive Summary score (the cover that prints the matrix); a sheet with an
    unverified line cannot read a green 10 (Tristan 2026-06-27 caught exactly this: max_irrigation_
    demand showed UNVERIFIED while the Exec Summary scored 10/10). A HARD sizing/scale/safety metric
    is HIGH; a soft metric is MED. The fix is to SIZE the missing quantity (so it verifies) or admit a
    genuine miss as a FAIL — never a silent UNVERIFIED on the cover."""
    tab = "Executive Summary"
    out: list = []
    hard_rx = re.compile(r"capacit|throughput|flow|demand|power|voltage|count|\brate\b|pressure|"
                         r"recovery|storage|head|duty|temperature|mass|energy|load", re.I)
    for m in _brief_metrics(state):
        if not _would_show_unverified(state, m):
            continue
        name = _metric_name(m) or "(unnamed metric)"
        hard = bool(hard_rx.search(name))
        out.append(Finding(
            tab=tab, check="brief_compliance_unverified",
            severity="HIGH" if hard else "MED",
            message=(f"brief requirement '{name}' is UNVERIFIED on the compliance matrix — no contract "
                     f"quantity fulfils it, so the design cannot be confirmed to meet it"),
            actual="UNVERIFIED",
            expected="every brief requirement matched to a DELIVERED quantity with a PASS/FAIL",
            source_rule=("size the missing quantity in the engineering contract so the requirement "
                         "verifies (or surface a genuine miss as a FAIL) — never a silent UNVERIFIED "
                         "on the cover; the Exec Summary cannot be ≥8 over an unverified requirement"),
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
        qk, qv = _contract_match(state, name, m.get("unit"), m.get("value") if isinstance(m, dict) else None)
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

    # Applicability / dedicated-gate authority. A sealed dry product's P&ID can
    # be explicitly NA-BY-DESIGN, and panel/SLD powered-part coverage is checked
    # by drawing-gates G3 against the correct powered-part denominator. The
    # generic ledger denominator must not re-fail those proved cases.
    def _qv(key):
        for contract_key in ("orchestratorContract", "engineeringContract"):
            q = (state.get(contract_key) or {}).get("quantities") or {}
            value = q.get(key) if isinstance(q, dict) else None
            if isinstance(value, dict):
                value = value.get("value")
            if isinstance(value, (int, float)):
                return float(value)
        return None

    sealed = bool((_qv("enclosure_volume_m3") or 0) < 1.0
                  and (_qv("enclosure_volume_m3") or 0) > 0)
    pid_na = False
    pid_svg = os.path.join(run_dir or "", "drawings", "pid.svg")
    if sealed and os.path.isfile(pid_svg):
        try:
            pid_na = "NA-BY-DESIGN" in open(pid_svg, encoding="utf-8").read()
        except OSError:
            pid_na = False

    drawing_pass = {}
    dg_path = os.path.join(run_dir or "", "drawing-gates.json")
    if os.path.isfile(dg_path):
        try:
            drawing_pass = {
                str(name): bool((entry or {}).get("pass"))
                for name, entry in (json.load(open(dg_path)).get("drawings") or {}).items()
                if isinstance(entry, dict)
            }
        except (OSError, ValueError):
            drawing_pass = {}

    def _coverage_applicable(name: str) -> bool:
        norm = str(name).lower().replace("_", "-")
        if pid_na and norm in ("pid", "p&id"):
            return False
        if norm in ("panel-schedule", "single-line-diagram") and drawing_pass.get(norm):
            return False
        return True

    parsed = [
        (name, _num(d.get("expected")) or 0, _num(d.get("present")) or 0)
        for name, d in drawings
        if isinstance(d, dict) and _coverage_applicable(name)
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
        worst_pct = (partial[0][2] / partial[0][1]) if partial[0][1] else 1.0
        # GRADUATED severity (Tristan 2026-06-27): a drawing is a genuine DEFECT only when a real
        # SYSTEM is missing (badly under-covered). A near-complete drawing (≥75%) whose only gaps are
        # over-decomposition detail — membrane elements/housings represented by the RO skid, valve
        # synonyms collapsed to one population — is NOT a dossier-failing HIGH; it is a minor noted
        # gap (MED). Requiring 100% of EVERY part on EVERY drawing is not how a real engineering
        # dossier reads (a part legitimately need not appear on every view). HIGH < 75% worst-covered;
        # MED 75–95%; nothing ≥95%. Honest: a missing system still hard-fails; minor detail does not.
        if worst_pct < 0.75:
            sev = "HIGH"
        elif worst_pct < 0.95:
            sev = "MED"
        else:
            sev = "LOW"
        out.append(Finding(
            tab=tab, check="coverage_partial", severity=sev,
            message=(f"{len(partial)} drawing(s) partially covered "
                     f"(worst {worst_pct*100:.0f}%): {worst}"
                     + ("" if sev == "HIGH" else " — minor over-decomposition detail; principal systems are represented")),
            actual=f"{len(partial)} partial drawings, worst {worst_pct*100:.0f}%",
            expected="every principal system represented on each drawing (≥95% coverage)",
            source_rule="each engineering drawing must represent every PRINCIPAL part; minor decomposition detail may be represented by its parent",
        ))
    return out


# --------------------------------------------------------------------------- #
# Check 6 — Physics critic (Risk & Regulatory)
# --------------------------------------------------------------------------- #

# A physics-critic HIGH is a DESIGN defect only when it concerns the DESIGN — not when it is an
# artifact of the critic's own LLM input/output (a TRUNCATED JSON payload, a parse error) or a vague
# advisory hedge with no concrete failure ("perform a detailed analysis", "should be verified"). These
# are exactly the findings gate 33 (issueIsBlocking, physics-critic-enforcement.ts) already SKIPS as
# non-design false-positives. Counting them as Risk-tab defects is a FALSE FAIL (penalising a correct
# design for an LLM payload artifact) — as dishonest as a false PASS. So the Risk tab counts only the
# findings that name the DESIGN's problem, matching the gate-33 contract. (Tristan 2026-06-27.)
_PHYS_FP_PAYLOAD = re.compile(
    r"(truncat|json\s+payload|payload\s+is\s+physically|json\s+is\s+(?:incomplete|malformed|cut)|"
    r"parse\s+error|unparse|malformed\s+json|cut\s+off\s+(?:mid|at)|incomplete\s+json|"
    r"json\s+is\s+truncat|design\s+json\s+is)", re.I)
_PHYS_FP_VAGUE = re.compile(
    r"\b(perform\s+a\s+detailed|should\s+be\s+verified|recommend\s+verifying|consider\s+reviewing|"
    r"further\s+analysis\s+(?:is\s+)?(?:recommended|required|needed)|a\s+detailed\s+(?:load|thermal|"
    r"structural)\s+analysis)\b", re.I)


def _physics_high_is_design_defect(issue: dict, state=None) -> bool:
    # CORROBORATION GATE (Tristan 2026-07-03, B3 extended to the finding set): a finding
    # may SCORE only when a deterministic check over the delivered artefacts corroborates
    # it. A canonicalised issue carries the verdict directly; a raw issue is corroborated
    # on the fly when state is available. Uncorroborated → advisory, NEVER scores.
    corr = issue.get("corroboration") if isinstance(issue, dict) else None
    if corr == "corroborated":
        return True
    if corr in ("uncorroborated", "falsified"):
        return False
    txt = f"{issue.get('issue') or ''} {issue.get('title') or ''} {issue.get('where') or ''}"
    if _PHYS_FP_PAYLOAD.search(txt):
        return False  # the critic's INPUT was truncated — an engine I/O artifact, not a design defect
    if _PHYS_FP_VAGUE.search(txt) and not re.search(r"/words?[\[/]|\bsub_modules?\b", txt):
        return False  # a holistic advisory with no NAMED part — gate-33 false-positive discipline
    if state is not None and _physics_claim_falsified(state, issue):
        return False  # the critic's claim is deterministically FALSE (e.g. "module empty" but it has words)
    if state is not None:
        verdict, _shape, _detail = _corroborate_finding(state, issue)
        return verdict == "corroborated"
    return True


def check_physics_critic(state, rows, run_dir) -> list:
    tab = "Risk & Regulatory"
    out: list = []
    issues = _physics_issues(state, run_dir)   # the CANONICAL corroborated scoring view
    highs = [
        i for i in issues
        if isinstance(i, dict) and str(i.get("severity", "")).lower() == "high"
        and _physics_high_is_design_defect(i, state)
    ]
    if highs:
        titles = []
        for i in highs[:3]:
            titles.append(_clip(str(i.get("title") or i.get("issue") or "(untitled)"), 80))
        out.append(Finding(
            tab=tab, check="unresolved_high_physics", severity="HIGH",
            message=(f"{len(highs)} HIGH physics-critic findings are unresolved in the "
                     f"shipped design: {' | '.join(titles)}"),
            actual=f"{len(highs)} HIGH findings",
            expected="0 unresolved HIGH physics findings",
            source_rule="no HIGH-severity physics-critic finding may remain unresolved at ship",
        ))
    # UNCORROBORATED critic notes stay VISIBLE (honest) but NEVER score: severity INFO
    # carries a 0 penalty in the per-tab scorecard (Tristan 2026-07-03 corroboration layer).
    advisory = [i for i in issues if isinstance(i, dict)
                and i.get("corroboration") in ("uncorroborated", "falsified")]
    if advisory:
        heads = [_clip(str(i.get("issue") or "(untitled)").replace(
            "ADVISORY (uncorroborated by deterministic check — visible, never scores): ", ""), 70)
            for i in advisory[:2]]
        out.append(Finding(
            tab=tab, check="advisory_critic_notes", severity="INFO",
            message=(f"{len(advisory)} critic note(s) are UNCORROBORATED by any deterministic "
                     f"check over the delivered artefacts — rendered as advisory, never scored: "
                     + " | ".join(heads)),
            actual=f"{len(advisory)} advisory notes",
            expected="advisory notes are visible but carry no score penalty",
            source_rule=("a critic finding may score only when corroborated by a deterministic "
                         "check over delivered artefacts (B3 finding-set extension)"),
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

    # Revenue: a financial model with NO verified revenue path is UNVERIFIED — it must NOT score a
    # green 10 (Tristan 2026-06-27: the water-plant Financial model showed '⚠ UNVERIFIED ECONOMICS'
    # yet the tab scored 10/10 — the fake-8 again). Flag whenever there is NO revenue signal anywhere
    # in the financial state, for ANY class (was BESS-only). A storage/grid class earns arbitrage (a
    # known, recoverable model → MED); any other class with no derivable sale price is an unverified
    # model that needs a real price OR a class-appropriate capex/opex/payback frame (→ HIGH).
    cls = _product_class(state)
    # A COST-OF-SERVICE frame (capex/opex/levelised-£-per-unit) IS the honest, class-appropriate
    # economic model for an infrastructure / utility plant with no product sale — it is exactly the
    # "capex/opex/payback model for this class" this check asks for. When present, the absence of a
    # MARKET sale price is expected, not a defect, so do not flag the no-revenue HIGH. (build-excel's
    # _render_cost_of_service_section records state['_costOfService'] for a no-verified-price plant.)
    _cos = state.get("_costOfService")
    _has_cost_of_service = isinstance(_cos, dict) and (_num(_cos.get("capex_gbp")) or 0) > 0
    if not _state_has_revenue_signal(state) and not _has_cost_of_service:
        if _NO_OUTPUT_SALE_RX.search(cls):
            out.append(Finding(
                tab=tab, check="no_revenue_line", severity="MED",
                message=(f"no revenue line — a storage/grid class ({cls}) earns arbitrage/service "
                         f"revenue, not output sales; the financial model needs that path"),
                actual="no sale-price/revenue signal",
                expected="an arbitrage/service revenue model",
                source_rule="financial model must carry a revenue path appropriate to the class",
            ))
        elif _PROCESS_CLASS_RX.search(cls):
            # an infrastructure / process plant (water / treatment / SAF / CO₂ …) with NO derivable
            # sale price → its revenue / EBITDA / NPV are UNVERIFIED; the tab must NOT be a green 10
            # over its own '⚠ UNVERIFIED ECONOMICS' banner (Tristan 2026-06-27). A sellable PRODUCT
            # class (widget / server) is NOT flagged here — a missing price on a sellable product is a
            # separate gap, and infrastructure plants are the case that needs a capex/payback frame.
            out.append(Finding(
                tab=tab, check="no_revenue_line", severity="HIGH",
                message=(f"the financial model has NO verified revenue path ({cls}): no per-unit sale "
                         f"price is derivable, so revenue / EBITDA / NPV are UNVERIFIED — the tab cannot "
                         f"be a green 10 over its own '⚠ UNVERIFIED ECONOMICS' banner. For an "
                         f"infrastructure / cost project give it a capex / opex / payback model instead of revenue"),
                actual="no sale-price/revenue signal; economics UNVERIFIED",
                expected="a verified revenue path, OR a class-appropriate capex/opex/payback model",
                source_rule="financial model must carry a verified revenue path OR an explicit cost-project (capex/payback) frame for its class",
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
    fails the brief.

    FEEDSTOCK-APPROXIMATION RELIEF (2026-07-06, CO2-mineralisation KOH false miss): a
    feedstock/consumption metric (koh_feed_tpd) is a DERIVED quantity — the stoichiometric
    amount of raw material the design draws to hit its stated output — not a performance
    floor. When the brief's own prose hedges the cited figure with 'approximately'/
    'approx'/'~'/'about'/'roughly' (_brief_value_approximated), a near-miss under the
    tight 2% band is widened to a ±5% tolerance before it is allowed to gate: 2.54 t/day
    achieved vs an approximate 2.6 t/day target (2.3% gap, the correct stoichiometric
    2*(3900/174)*56 for 3.9 t/day K2SO4) is COMPLIANT, not a HIGH. A genuinely short
    feedstock (>5% out) still fails; a hard, non-approximate target, or a capacity/output
    performance metric that merely happens to ALSO be hedged with 'approximately' in the
    brief, both stay on the tight 2% band — the relief is scoped to feedstock/consumption
    names only (_is_feedstock_metric) and only fires when the brief discloses the
    approximation itself. proveCatch (both directions) in _selftest."""
    tab = "Exec Summary / Checks"
    out: list = []
    TOL = 0.02  # 2% tolerance for "meets" on equality/close metrics
    APPROX_TOL = 0.05  # 5% tolerance for a brief-disclosed approximate feedstock metric
    for m in _brief_metrics(state):
        name = _metric_name(m)
        if not name:
            continue
        unit = m.get("unit")
        target = _num(m.get("value") if isinstance(m, dict) else None)
        if target is None:
            continue
        qk, qv = _contract_match(state, name, unit, target)
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
        if not meets and _is_feedstock_metric(name) and _brief_value_approximated(state, target):
            # The brief itself discloses this feedstock/consumption figure as
            # approximate — widen to a ±5% band; a genuine under/over-consumption
            # outside that band still fails below.
            meets = abs(achieved - target) <= abs(target) * APPROX_TOL or target == 0
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

# ABSTRACT TERMINI a connection legitimately ends on WITHOUT a BoM part behind them
# (BESS cross-val 2026-07-03): the battery-limit boundaries (grid / atmosphere / sewer),
# the service sinks (heat rejection / thermal sink), and the ELECTRICAL-DISTRIBUTION
# pseudo-nodes the electrical model authors as routing structure (a busway, a
# distribution BOARD id like 'bms_ctrl' rendered 'Bm Ctrl', the dc/ac service bus).
# These are system edges, not phantom parts — the rendered Connection trace resolves
# or drops them (_resolve_trace_endpoints); the audit keys on the same service
# families so it applies only where its physics applies. A genuinely phantom PART
# ('cabinets', a misspelled vessel) matches none of these and still flags.
# Keep in sync with deterministic_checks_lib._SERVICE_BOUNDARY_ENDPOINT_RE.
_ABSTRACT_TERMINUS_RX = re.compile(
    r"utility[_ -]?incomer|\bgrid\b|\bmains\b|battery[_ -]?limit|atmosphere|ambient|"
    r"to[_ -]?sea|\bsewer\b|public[_ -]?network|off[_ -]?site|"
    r"\bheat[_ -]?reject(?:ion)?\b|\b(?:heat|thermal|cold)[_ -]?sink\b|"
    r"bus[_ -]?way|\b(?:dc|ac|hv|lv|mv)[_ -]?bus\b|\bctrl\b|"
    r"\bboard\b", re.I)


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
        if _ABSTRACT_TERMINUS_RX.search(str(name or "")):
            continue   # a service-boundary / distribution pseudo-node, not a phantom part
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
    ex = "; ".join(_clip(_row_name(r), 40) or "?" for r in blank[:3])
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
        mk = _contract_match(state, name, m.get("unit") or "", m.get("value"))
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
                message=(f"a single line '{_clip(name, 48)}' is £{round(lg):,} = {round(lg/total*100)}% "
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
    #
    # "civil works" is its OWN category, deliberately SEPARATE from "building / structure"
    # (evidence, BESS v10, 2026-07-05): the brief excludes "civil works" (external site
    # engineering — groundworks, foundations, cable trenches around the equipment) alongside
    # the MV transformer + switchgear, but the container's OWN internal floor-reinforcement
    # plate ("structural floor reinforcement", S355 checker-plate welded to the container's
    # floor frame — required to carry the rack loads) is in-scope EQUIPMENT MOUNTING, part of
    # the brief's own explicitly in-scope "20-foot enclosure". Bucketing "civil" together with
    # "building / structure" (whose bom_kw list carried the over-broad "structural floor")
    # matched that in-scope word and manufactured a false Exec Summary HIGH — "the brief
    # EXCLUDES building / structure, but the design builds it: structural floor reinforcement".
    # "Civil works" and "the equipment's own structure" are different scopes in ordinary
    # engineering usage; conflating them in one bucket is the wrong RULE, not a one-off data
    # point (CORE FIX PRINCIPLE — fix the rule, universal, with a guard). The civil bucket's
    # bom_kw is kept to genuinely EXTERNAL groundworks/foundation terms so a real civil-scope
    # breach (e.g. a "concrete foundation pad" or "site groundworks" BoM line built despite an
    # excluded civil scope) still fails — proveCatch in _selftest, both directions.
    SUBSYS = [
        ("lighting", ("lighting", "light", "led", "luminaire"),
         ("led", "luminaire", "grow light", "horticultural", "photoperiod fixture")),
        ("climate / HVAC", ("climate", "hvac", "ventilation", "heating", "air-condition", "heating-ventilation"),
         ("hvac", "chiller", "dehumidif", " ahu", "air handling", "condenser", "cooling unit", "heat pump", "refrigerant")),
        ("building / structure", ("building", "rack framework", "cultivation rack", "structure"),
         ("building", "canopy", "growing rack", "cultivation rack", "trolley")),
        ("civil works / groundworks", ("civil work", "civil engineering"),
         ("foundation", "groundwork", "ground work", "concrete pad", "concrete base", "pile cap",
          "piling", "plinth", "cable trench", "site preparation", "earthwork", "retaining wall")),
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
                         f"£{round(cost):,} (e.g. '{_clip(hits[0][0], 40)}'). Build only what the brief asks for."),
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
    # 'class_anchor' (CO2-mineralisation v2 cross-val 2026-07-05): the orchestrator's own
    # provenance vocabulary (scripts/lib/orchestrator/types.ts, 'class-specific default
    # constant' — a cited engineering-estimate/rule-of-thumb value a tool cannot derive from
    # first principles, e.g. '90% MEA packed-absorber design capture rate') is a ROOT exactly
    # like 'anchor'/'standard'/'datasheet' — a citation, not an arithmetic derivation — but was
    # missing from this set (tuned to v1's quantity list, not the general source-tag FAMILY),
    # so every class_anchor value in a fresh design hid as an "uncaptured calculation" no
    # matter which quantity carried it. aggregator.ts:75 already treats 'class_anchor' as a
    # root for its own purpose — this closes the same gap on the Python/Excel side. Universal:
    # keyed on the source TAG (a fixed, class-agnostic provenance vocabulary), never a
    # per-quantity-key list, so it holds for any future design's own class_anchor values.
    _ROOTS = {"brief", "physics_constant", "constant", "standard", "anchor", "class_anchor",
              "datasheet", "spec"}
    _OPS = ("=", "×", "*", "/", "+", "−", "·", "^")
    # CITED-MEASURED taxonomy (2026-07-05, the interconnect_cable_length_m fix): a quantity
    # MEASURED from as-built/as-routed geometry (route-manifest segment lengths) has no
    # arithmetic formula — it is a citation to a physical measurement, the same standing as a
    # datasheet reference. Recognised ONLY when the source_detail actually names the
    # route-manifest AND a segment count — never a bare 'measured' claim with no citation, and
    # NEVER by tacking a fake operator onto the prose to trip has_formula (that would be the
    # OPPOSITE dishonesty — Tristan: "never a fake formula"). This also closes the latent
    # false-positive where 'measured routed fluid + thermal pipe length' only passed has_formula
    # because the English word 'fluid + thermal' happens to contain a literal '+'.
    _CITED_MEASURED_RE = re.compile(r"measured from routed geometry \(route-manifest, \d+ segments?\)")
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
        # Tool-computed: full working on Tools/Calculations tab OR source_detail names
        # the tool ("computed by process:pump-sizing …") — both are verifiable.
        tool_shown = src.startswith("tool:") and (
            src[len("tool:"):] in worked_tool_ids
            or bool(re.search(r"computed by\s+\S+", sd, re.I))
        )
        # demand-coverage / calculator lineage that cites its parent rule is a disclosed
        # derivation (e.g. backup pump = duty unit's kW), not a hidden calc.
        # DECISION: require an explicit RULE/identity/from/= marker — a long prose
        # sentence alone (len>20) over-widened the exemption and let mystery_hidden_pct
        # ("an engineering judgement call, no formula") escape the guarantee.
        disclosed_lineage = src in ("demand-coverage", "calculator", "derived") and bool(
            re.search(r"\bRULE\b|rated identically|from\s+\w+|=\s*", sd, re.I)
        )
        is_cited_measurement = src == "route-manifest" and bool(_CITED_MEASURED_RE.search(sd))
        if (str(k).lower() in worked or has_formula or tool_shown
                or is_cited_measurement or disclosed_lineage):
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
    names = "; ".join(_clip(str(getattr(c, "name", "")), 46) for c in fails[:4])
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
            message=(f"a deterministic invariant this tab is responsible for FAILS: {_clip(nm, 120)}"),
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
        # run_dir lets the audit read the run's RECORDED tool invocations
        # (4-orchestrator-tools-used.json) — a quantity matching a recorded tool
        # claim by its own name has an origin (the tool run), not 'from nowhere'.
        rep = audit_provenance(state, run_dir=run_dir)
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
    # NA-BY-DESIGN for a device-scale INSTRUMENT (2026-07-12, colorimeter): a sealed sub-1 m³
    # optical/electronic instrument has no fluid pipe schedule and no plant cable line-list —
    # its interconnects are PCB traces / short internal leads, not sized runs carrying a
    # velocity or a volt-drop verdict. The Line & velocity line list is not applicable (the
    # same NA-by-design principle as the P&ID for a solid-state product). Universal — keyed
    # on the authoritative device flag; a plant with real sized runs is unaffected.
    if isinstance(state, dict) and state.get("isInstrumentDevice"):
        return out
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
    "D", "U", "Z",
}
# NOTE (Tristan 2026-06-27, resolved 2026-07-03): D-/S-/U-/Z- were briefly whitelisted here WITHOUT
# glossary entries to clear the Glossary MED — that was GAMING the check. They are now GENUINELY
# documented: the workbook Glossary's 'Equipment & package tags' group (build-excel-export.py
# _GLOSSARY) defines D (drum/separator), U (utility/package unit) and Z (packaged skid unit,
# explicitly disambiguated from the HVAC zone identifiers Z-01…), so a reader no longer meets an
# undefined code — the letter AND the intent of the check are met. Known residual defect (routed,
# NOT hidden by this whitelist): the scene tagger's three-phase-separator rule
# (scripts/blender-universal/build_universal_scene.py _TAG_LETTER_BY_NAME '3.?phase|three.?phase')
# mis-fires on an ELECTRICAL '3 Phase Power Input', stamping it D- (a separator letter). Fix that
# regex at source when the Blender tag scheme is next touched; the glossary definition documents the
# scheme's INTENDED meaning, not the mis-tag.

# GENERATIVE tag-prefix glossary (2026-07-05, the BESS 18-missing-prefix fix). Two prior static
# whitelists had already DIVERGED from the workbook's real Glossary tab: build-excel-export.py's
# `_GLOSSARY` 'Battery storage (BESS tags)' category defines BMS/BR/CH/FS/PCS/SG with real prose,
# but `_GLOSSARY_TAG_PREFIXES` above (this module's OWN whitelist, consulted by THIS check) was
# never updated to match — so those 6 "already landed" definitions still flagged undocumented. A
# hand-maintained whitelist that must be edited in TWO files every time a new archetype mints a
# fresh tag family is exactly the "kept in sync by hand" trap this codebase keeps hitting (see
# parts_ledger.py's ga_massing-mirror comments). Fix: a tag-prefix is documented when EITHER (a) a
# curated override gives its canonical expansion (an ACRONYM whose meaning isn't self-evident from
# its own first occurrence — BMS, PCS, …) OR (b) it self-documents from the bill's own first
# occurrence of that prefix (a real named part — 'coolant distribution manifold' IS its own honest
# definition). `build-excel-export.py`'s `tab_glossary` renders the IDENTICAL generative entry (the
# override text, else the ledger's own first-occurrence name) for every such prefix, so the check
# and the render can never disagree — mirrors the CITED-MEASURED taxonomy pattern used for
# calc-coverage: never invent a fake definition, always a REAL citation to the engine's own data.
# A prefix with NO derivable name at all (blank/garbage requirement text) is the one true residual
# gap this still catches.
_TAG_PREFIX_OVERRIDES = {
    "BMS": "Battery Management System",
    "BR": "Battery Rack (wiring carrier / busbar hardware)",
    "BS": "BMS Slave (per-rack battery-management slave module)",
    "CD": "Coolant Distribution (manifold)",
    "CF": "Cell / Frame (battery cell — prismatic, cylindrical or pouch format)",
    "CH": "Chiller",
    "CM": "Cold-plate Manifold",
    "CP": "Cold Plate",
    "DI": "DC Isolator",
    "DS": "Deflagration (vent) Seal",
    "DU": "Duct",
    "EQ": "Equipment (generic catalogue-class package)",
    "FS": "Fire Suppression (system component)",
    "IE": "Isolator Enclosure",
    "OG": "Off-gas (duct / handling)",
    "PCS": "Power Conversion System (inverter)",
    "RH": "Rack Heater",
    "SG": "Switchgear",
    "SI": "Smoke (vent) Interlock",
}


def _tag_prefix_self_documents(pref: str, principals: list) -> bool:
    """True when `pref` has a curated override OR the bill carries a genuinely-named part
    under that prefix (the same first-occurrence text the generative Glossary section
    renders as the definition). See the module-level comment above."""
    if pref in _TAG_PREFIX_OVERRIDES or pref in _GLOSSARY_TAG_PREFIXES:
        return True
    for r in principals:
        raw = str(r.get("tag") or "").strip()
        m = re.match(r"^([A-Z]{1,4})-?\d", raw)
        if m and m.group(1) == pref:
            name = str(r.get("requirement") or r.get("part") or "").strip()
            if name:
                return True
    return False


def check_glossary(state, rows, run_dir) -> list:
    """'Glossary' must define every abbreviation the dossier USES. Genuine coverage check: every
    ISA tag-prefix that appears in the bill must be a documented family (else a reader meets an
    undefined code). The curated whitelist + override table cover the standard/acronym families;
    any OTHER prefix is checked against the GENERATIVE self-documentation rule (see above) — a
    prefix with no derivable name at all is the true residual gap that still flags."""
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
        if pref not in _GLOSSARY_TAG_PREFIXES and not _tag_prefix_self_documents(pref, principals):
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


_POP_MIN_DUP = 12  # a "population" count; 1–2 duplicate valves are legit, a 200-population emitted twice is not


def _word_qty(w: dict) -> int:
    for mc in (w.get("modifier_characters") or []):
        if isinstance(mc, dict) and mc.get("kind") == "quantity":
            n = _num(re.sub(r"[^0-9.]", "", str(mc.get("value", ""))))
            if n and n > 0:
                return int(n)
    return 1


def _singularise_phrase(s) -> str:
    return " ".join(_singularise(t) for t in re.findall(r"[a-z]+", str(s).lower()))


def _population_role_key(name: str) -> str:
    """Mirror universal-contract-sizing._populationRoleKey: singular/plural AND
    solenoid↔pneumatic-actuated synonym labels for the SAME on/off valve population
    collapse to one key so the audit catches the Codema 2×200 (and 3×200) smear."""
    sing = _singularise_phrase(name)
    if (re.search(r"\b(solenoid|pneumatic|electric|motor(?:is|iz)ed|actuated)\b", sing)
            and re.search(r"\bvalve\b", sing)
            and not re.search(r"\b(manual|ball|check|sample|relief|butterfly|gate|needle)\b", sing)):
        return "actuated_on_off_valve"
    return sing


def check_population_duplication(state, rows, run_dir) -> list:
    """A brief POPULATION (e.g. '200 actuated valves') emitted under TWO words — a singular + a plural,
    or two synonym names with the SAME count — DOUBLE-COUNTS it: 'Pneumatic Actuated Valve ×200' +
    'Pneumatic Actuated Valves ×200' = 400 valves on a 200-valve bill. Deterministic + universal:
    group every principal word by (role-or-singularised-name, count) for population counts (≥12);
    ≥2 words in a group is a duplicated population. Runs on the FINAL state, so a synthesis path
    that re-mints the duplicate is still caught (the 'two synthesis paths' gotcha). Council C5
    (2026-06-27); role-key extended 2026-07-09 for solenoid↔pneumatic synonym smear."""
    tab = "Bill of Materials (Ledger)"
    out: list = []
    groups: dict = {}
    for m in (state.get("moduleDecomposition") or {}).get("modules", []) or []:
        for sm in m.get("sub_modules", []) or []:
            for w in sm.get("words", []) or []:
                if not isinstance(w, dict) or w.get("_subcomponent"):
                    continue
                nm = w.get("name_human") or (w.get("content_character") or {}).get("name_human") or ""
                if not nm:
                    continue
                q = _word_qty(w)
                if q < _POP_MIN_DUP:
                    continue
                groups.setdefault((_population_role_key(nm), q), []).append(nm)
    for (sing, q), names in groups.items():
        if len(names) >= 2:
            out.append(Finding(
                tab=tab, check="population_duplication", severity="HIGH",
                message=(f"the {q}-unit population '{names[0]}' is emitted {len(names)}× under the same "
                         f"name (e.g. {', '.join(sorted(set(names))[:3])}) — the bill DOUBLE-COUNTS it "
                         f"({len(names)}×{q}={len(names) * q}, not {q})"),
                actual=f"{len(names)} words × {q}", expected=f"ONE consolidated word × {q}",
                source_rule=("consolidate a population to ONE word at synthesis "
                             "(dropAttributePhantomWords singular/plural dedup) — this check asserts it on "
                             "the FINAL state so a re-minting reconcile path cannot bypass it"),
            ))
    return out


_CHECKS = [
    check_bom,
    check_capex_by_category,
    check_brief_compliance_unverified,
    check_population_duplication,
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

_SEVERITY_PENALTY = {"HIGH": 4, "MED": 2, "LOW": 1,
                     # INFO = an advisory note (e.g. an uncorroborated critic opinion):
                     # VISIBLE on the tab, but it may never move a deterministic score.
                     "INFO": 0}

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
            "issues": [f"[{f.severity}] {_clip(f.message, 220)}" for f in fs[:6]],
            "fix": next((f.source_rule for f in fs if f.source_rule), ""),
        }
    # The Executive Summary is the COVER that CLAIMS the whole dossier is buildable + ready. It cannot
    # honestly score higher than the WEAKEST sheet it summarises — a 10/10 cover over a 6/10 Risk tab
    # and "4 open issues" is the lie Tristan caught (2026-06-27). Cap it at the floor of the other
    # scored tabs so the headline can never overstate the dossier's true readiness.
    es = out.get("Executive Summary")
    if isinstance(es, dict) and isinstance(es.get("score"), (int, float)):
        others = [v["score"] for k, v in out.items()
                  if k != "Executive Summary" and isinstance(v.get("score"), (int, float))]
        floor = min(others) if others else es["score"]
        if floor < es["score"]:
            es["issues"] = ([f"capped at the dossier FLOOR ({floor}/10): the cover cannot claim a higher "
                             f"score than its weakest sheet — fix that sheet to raise this one"]
                            + (es.get("issues") or []))[:6]
            es["score"] = floor
            es["status"] = "PASS" if floor >= 8 else "FAIL"
    return out


def tab_scorecard_summary(scores: dict) -> dict:
    """Headline numbers over the per-tab scorecard: the min scored tab + how many fail / are
    unscored.

    VERIFIED OUT-OF-SCOPE (Tristan 2026-07-05, Option A): a tab whose own scorer set
    `scored: False` — meaning it PROVED both its own verification checks pass (e.g. HVAC on
    a process plant: no contract HVAC/ventilation/cooling duty AND the brief's own exclusions
    explicitly cite the climate hardware) — is excluded from EVERY count here: not a fail,
    not "unscored", not a floor/min candidate. An honestly-verified "not applicable" is not an
    open issue. GENERIC: keyed on the `scored` flag any tab's own scorer may set, never on the
    tab's name — an out-of-scope CLAIM whose verification checks do NOT both pass never sets
    this flag, so it stays a normal (and typically low-scoring) tab that still counts here —
    the mechanism cannot be used to dodge the floor by merely asserting inapplicability."""
    verified_oos = [t for t, v in scores.items() if v.get("scored") is False]
    scored = [(t, v) for t, v in scores.items()
              if v.get("scored") is not False and isinstance(v.get("score"), (int, float))]
    fails = [t for t, v in scored if v["score"] < v["target"]]
    unscored = [t for t, v in scores.items()
                if v.get("scored") is not False and v.get("status") == "UNSCORED"]
    min_tab, min_score = (None, None)
    if scored:
        min_tab, mv = min(scored, key=lambda kv: kv[1]["score"])
        min_score = mv["score"]
    return {
        "min_tab": min_tab, "min_score": min_score,
        "scored_count": len(scored), "fail_tabs": fails, "unscored_tabs": unscored,
        "verified_out_of_scope_tabs": verified_oos,
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

    # ---- physics duplication-claim verifier (Tristan 2026-06-30) ------------
    # An LLM critic that claims "N× smeared across many parts" must be checked against the real counts:
    # a hallucinated smear (≤2 words actually at N — e.g. 200 valves + their 200 actuators, a legit 1:1
    # pair) is DROPPED; a real smear (3+ unrelated words at N) still GATES (a false FAIL == a false PASS).
    def _mk(name, qty):
        return {"name_human": name, "modifier_characters": [{"kind": "quantity", "value": f"×{qty}"}]}
    halluc = {"moduleDecomposition": {"modules": [{"module": "act", "sub_modules": [{"words": [
        _mk("Pneumatic Actuated Valves", 200), _mk("Pneumatic Actuators", 200), _mk("Solenoid Valve", 1)]}]}]}}
    dup_issue = {"severity": "high", "issue": "Massive duplication of the '200x' valve quantity across every "
                 "valve representation — thousands of valves instead of the 200 requested."}
    expect(_physics_claim_falsified(halluc, dup_issue),
           "hallucinated 200× smear (only valves+actuators at 200) must be FALSIFIED")
    real_smear = {"moduleDecomposition": {"modules": [{"module": "x", "sub_modules": [{"words": [
        _mk("Power Distribution Block", 200), _mk("Flow Plates", 200), _mk("Gasket Set", 200), _mk("Bracket", 200)]}]}]}}
    expect(not _physics_claim_falsified(real_smear, dup_issue),
           "a REAL 4-part 200× smear must STILL gate (not be dropped)")

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
        # CORROBORATION LAYER (2026-07-03): a HIGH scores only when a deterministic
        # check corroborates it. The first issue is a genuine-omission existence claim
        # (no transformer skid ships anywhere in this fixture → corroborates); the
        # second is an uncorroborable judgement → an ADVISORY note (never scores).
        "physicsCritique": {"issues": [
            {"severity": "high", "title": "Transformer undersized 2x",
             "issue": "The design omits the step-up transformer skid the brief requires"},
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

    # ---- FOLD SEMANTICS proveCatch (both directions, 2026-07-03): a deliberate dedupe
    # fold (£0 + fold status + sub_of naming a priced parent) passes; a £0 fold whose
    # parent does NOT exist still fails; a genuine £0-with-price line still fails.
    fold_rows = [
        {"tag": "Z-1", "requirement": "Uf Membrane Bank · 364 m² area", "status": "IDENTIFIED",
         "part": "UF bank", "qty": 1, "unit_gbp": 14825, "line_gbp": 14825, "basis": "x"},
        {"tag": "Z-2", "requirement": "Ultrafiltration Module", "status": "MERGED·SYNONYM",
         "part": "UF synonym", "qty": 1, "unit_gbp": 14825, "line_gbp": 0,
         "sub_of": "Uf Membrane Bank", "basis": "folded"},
        {"tag": "—", "requirement": "Pneumatic Actuators", "status": "IN ASSEMBLY",
         "part": "actuators", "qty": 200, "unit_gbp": 30, "line_gbp": 0,
         "sub_of": "Uf Membrane Bank", "basis": "priced in assembly"},
    ]
    fold_f = [f for f in check_bom({}, fold_rows, "") if f.check == "line_math"]
    expect(not fold_f, f"FOLD: a legit £0 fold row must NOT flag line_math (got {[f.message[:60] for f in fold_f]})")
    # proveCatch: sub_of may be the parent's TAG (Codema 2026-07-09) — still a valid fold.
    tag_fold = [
        {"tag": "X-126", "requirement": "Pneumatic Actuated Valves", "status": "IDENTIFIED",
         "part": "valves", "qty": 200, "unit_gbp": 200, "line_gbp": 40000, "basis": "x"},
        {"tag": "X-125", "requirement": "Solenoid Valves", "status": "MERGED·SYNONYM",
         "part": "synonym", "qty": 200, "unit_gbp": 80, "line_gbp": 0,
         "sub_of": "X-126", "basis": "folded by tag"},
    ]
    tag_fold_f = [f for f in check_bom({}, tag_fold, "") if f.check == "line_math"]
    expect(not tag_fold_f,
           f"FOLD: sub_of=parent TAG must resolve (got {[f.message[:60] for f in tag_fold_f]})")
    orphan_fold = [dict(fold_rows[1], sub_of="No Such Parent")]
    orphan_f = [f for f in check_bom({}, orphan_fold, "") if f.check == "line_math"]
    expect(len(orphan_f) == 1 and "no priced line" in orphan_f[0].message,
           "FOLD: a £0 fold row pointing at a MISSING parent must still flag")
    broken_line = [{"tag": "X-9", "requirement": "Pump", "status": "IDENTIFIED",
                    "part": "pump", "qty": 2, "unit_gbp": 100, "line_gbp": 0, "basis": "x"}]
    broken_f = [f for f in check_bom({}, broken_line, "") if f.check == "line_math"]
    expect(len(broken_f) == 1, "FOLD: a genuinely broken £0 line (no fold status) must still flag")
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
    # advisory_critic_notes is INFO (zero penalty): the fixture's 'cosmetic' low critic
    # note is uncorroborated → an honest, visible, never-scoring advisory (2026-07-03).
    expect(checksb <= {"ledger_present", "advisory_critic_notes"},
           f"B: only ledger_present (+INFO advisory_critic_notes) allowed, got {checksb}")
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

    # ---- Fixture E2: sealed P&ID N/A + dedicated panel gate -> no false HIGH ----
    with tempfile.TemporaryDirectory() as te2:
        os.makedirs(os.path.join(te2, "drawings"), exist_ok=True)
        with open(os.path.join(te2, "drawings", "pid.svg"), "w") as fh:
            fh.write("<svg><text>P&ID — NOT APPLICABLE (NA-BY-DESIGN)</text></svg>")
        with open(os.path.join(te2, "drawing-gates.json"), "w") as fh:
            json.dump({"drawings": {
                "panel-schedule": {"pass": True},
                "single-line-diagram": {"pass": True},
            }}, fh)
        with open(os.path.join(te2, "parts-ledger.json"), "w") as fh:
            json.dump({"grand_total_gbp": 11000, "coverage_by_drawing": {
                "pid": {"expected": 8, "present": 0},
                "panel-schedule": {"expected": 8, "present": 5},
                "general-arrangement": {"expected": 26, "present": 25},
            }}, fh)
        sealed_state = {
            **clean_state,
            "orchestratorContract": {"quantities": {
                "enclosure_volume_m3": {"value": 0.13, "unit": "m3"},
            }},
        }
        repe2 = audit_dossier(sealed_state, clean_rows, run_dir=te2)
        high_cov = [f for f in repe2.findings
                    if f.check == "coverage_partial" and f.severity == "HIGH"]
        expect(not high_cov,
               "E2: NA P&ID and dedicated-gate-passed panel must not create coverage HIGH")

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

    # ---- Fixture F2 (BESS cross-val 2026-07-03): ABSTRACT TERMINI are not phantoms —
    # a thermal service sink ('Heat Rejection'), a distribution board id ('Bm Ctrl'),
    # and a busway are system routing nodes, never BoM parts; a genuinely phantom part
    # ('cabinets') in the SAME ledger must STILL flag (both directions).
    with tempfile.TemporaryDirectory() as tf:
        with open(os.path.join(tf, "parts-ledger.json"), "w") as fh:
            json.dump({"grand_total_gbp": 11000,
                       "coverage_by_drawing": {"ga": {"expected": 3, "present": 3}},
                       "connections": [
                           {"from_part": "Motor B", "to_part": "Heat Rejection"},
                           {"from_part": "Bm Ctrl", "to_part": "Motor B"},
                           {"from_part": "Motor B", "to_part": "(Busway)"},
                           {"from_part": "Frame A", "to_part": "cabinets"},
                       ]}, fh)
        repf2 = audit_dossier(clean_state, clean_rows, run_dir=tf)
        phantoms2 = [f for f in repf2.findings if f.check == "phantom_reference"]
        for _term in ("Heat Rejection", "Bm Ctrl", "Busway"):
            expect(not any(_term in f.message for f in phantoms2),
                   f"F2: abstract terminus '{_term}' must NOT be flagged as a phantom part")
        expect(any("cabinets" in f.message for f in phantoms2),
               "F2: a genuine phantom part must STILL flag next to the exempt termini")

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

    # ---- Fixture M: ONE-matcher doctrine — Pass 3 subject-token gating ------------
    # (2026-07-09, Codema run 2100 Exec=2 root.) The metric ro_makeup_flow_m3_per_hr
    # tokenises {ro, makeup, flow}: with need computed over ALL tokens (2), the honest
    # delivered matches (ro_high_pressure_pump_throughput / ro_permeate_capacity, each
    # sharing only {ro}) were unreachable → false UNVERIFIED that the RENDERER
    # (build-excel-export._match_quantity, subject-gated since ffe42c887) disagreed
    # with — two matchers, two verdicts. Pass 3 now computes need+overlap over SUBJECT
    # tokens (minus _MEASURE_SCOPE_TOKENS), mirroring the renderer.
    mk_ro = {"orchestratorContract": {"quantities": {
        "ro_high_pressure_pump_throughput_m3_h": {"value": 11, "unit": "m³/h"},
        "ro_permeate_capacity_m3_h": {"value": 11, "unit": "m³/h"},
        "ro_permeate_production_m3_per_hr": {"value": 8, "unit": "m3/h"},
        "irrigation_pump_flow_m3_h": {"value": 225, "unit": "m3/h"},
    }}}
    mk_k, mk_v = _contract_match(mk_ro, "ro_makeup_flow_m3_per_hr", "m3/hr", 11)
    expect(mk_k is not None and mk_v == 11 and str(mk_k).startswith("ro_"),
           f"M: ro_makeup_flow must match a delivered RO flow at 11 (got {mk_k}={mk_v})")
    # proveNoFalsePositive 1: a measure word alone must never decide a match — the
    # wrong-subsystem cloth filter shares only 'throughput' with the GAC/softener metric.
    mk_wrong = {"orchestratorContract": {"quantities": {
        "cloth_filter_throughput_m3_h": {"value": 80, "unit": "m3/h"},
    }}}
    expect(_contract_match(mk_wrong, "gac_softener_throughput_m3_per_hr", "m3/hr", 14.5) == (None, None),
           "M: generic-measure-only overlap must stay unmatched (no wrong-subsystem PASS)")
    # proveNoFalsePositive 2: a requirement-echo is still excluded — matching the demand
    # would manufacture a false PASS over an undersized delivery.
    mk_echo = {"orchestratorContract": {"quantities": {
        "irrigation_demand_m3_h": {"value": 90, "unit": "m3/h"},
    }}}
    expect(_contract_match(mk_echo, "max_irrigation_flow_m3_per_hr", "m3/hr", 45) == (None, None),
           "M: requirement-echo quantities must stay excluded from Pass 3")

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
            # undocumented tag-prefix ZZ- (glossary fires). GOTCHA: generative
            # self-documentation treats a real requirement name as its own definition —
            # use blank requirement/part so ZZ has NO derivable name (the residual gap).
            {"tag": "ZZ-3", "requirement": "", "status": "IDENTIFIED",
             "part": "", "qty": 1, "unit_gbp": 3000, "line_gbp": 3000},
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

    # proveCatch population-duplication (Tristan 2026-06-27 council C5): a 200-population emitted as
    # BOTH a singular and a plural word DOUBLE-COUNTS it; ONE population word is clean; small duplicate
    # qtys (×1) are not flagged.
    _dupst = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Pneumatic Actuated Valve", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
        {"name_human": "Pneumatic Actuated Valves", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
        {"name_human": "Manual Ball Valve", "modifier_characters": [{"kind": "quantity", "value": "×1"}]},
        {"name_human": "Manual Ball Valves", "modifier_characters": [{"kind": "quantity", "value": "×1"}]},
    ]}]}]}}
    _dup = check_population_duplication(_dupst, [], "")
    expect(len(_dup) == 1 and "200" in _dup[0].message,
           f"C5: a 200-population emitted as singular+plural must be ONE HIGH (got {len(_dup)})")
    _clean = check_population_duplication({"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Pneumatic Actuated Valve", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
    ]}]}]}}, [], "")
    expect(len(_clean) == 0, "C5: a single 200-population word must NOT be flagged")
    # proveCatch: solenoid ↔ pneumatic-actuated synonym smear (Codema ship 2026-07-09)
    _syn = check_population_duplication({"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Solenoid Valves", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
        {"name_human": "Pneumatic Actuated Valves", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
        {"name_human": "Solenoid Valve", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
    ]}]}]}}, [], "")
    expect(len(_syn) == 1 and "200" in _syn[0].message,
           f"C5b: solenoid+pneumatic ×200 synonym smear must be ONE HIGH (got {len(_syn)})")
    _manual_ok = check_population_duplication({"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Solenoid Valves", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
        {"name_human": "Manual Ball Valves", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
    ]}]}]}}, [], "")
    expect(len(_manual_ok) == 0,
           "C5b: solenoid ×200 beside manual-ball ×200 must NOT collapse (distinct families)")

    # ── proveCatch: physics-critic claim FALSIFICATION (a deterministically-false claim must not gate)
    _pop_state = {"moduleDecomposition": {"modules": [
        {"module": "fertigation_dosing_system", "sub_modules": [
            {"words": [{"name_human": "Water-Powered Dosing Pump"}]}]},
        {"module": "truly_empty_module", "sub_modules": [{"words": []}]},
    ]}}
    expect(_physics_claim_falsified(_pop_state, {"severity": "high",
           "issue": "the fertigation_dosing_system module is completely empty ('words': [])"}) is True,
           "PHYS: 'empty' claim against a POPULATED module must be falsified (hallucination)")
    expect(_physics_claim_falsified(_pop_state, {"severity": "high",
           "issue": "the truly_empty_module is completely empty"}) is False,
           "PHYS: 'empty' claim against a GENUINELY empty module must NOT be falsified (real)")
    expect(_physics_claim_falsified(_pop_state, {"severity": "high",
           "issue": "the Dosatron D8RE5 is forced to 45 m3/h above its 8 m3/h max"}) is False,
           "PHYS: a real capacity defect must NOT be falsified")

    # ── proveCatch: STALE Stage-7.5 shapes (the critic runs before downstream fixes settle). Each must
    #    falsify when the shipped design LACKS the defect, and NOT falsify when the defect is real.
    # (b) "200x" smear number-extraction (the digit+letter, no-\b case that used to slip through)
    _smear2 = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Pneumatic Actuated Valve", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
        {"name_human": "Pneumatic Actuator", "modifier_characters": [{"kind": "quantity", "value": "×200"}]},
    ]}]}]}}
    expect(_physics_claim_falsified(_smear2, {"severity": "high",
           "issue": "massive duplication of the 200x valve count across sub-modules (200x solenoid valves, 200x ...)"}) is True,
           "PHYS(b): '200x' smear over a 1:1 driven pair (2 words) must falsify (regex handles digit+letter)")
    _smear5 = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": f"Valve{k}", "modifier_characters": [{"kind": "quantity", "value": "×200"}]} for k in range(5)]}]}]}}
    expect(_physics_claim_falsified(_smear5, {"severity": "high",
           "issue": "massive duplication of the 200x valve count across sub-modules"}) is False,
           "PHYS(b): a REAL 200x smear over 5 words must NOT falsify")
    # (c) passive device wrongly rated in kW — falsify when no named device carries a power modifier
    _passive_ok = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Pressure Relief Valve", "modifier_characters": [{"kind": "rating_primary", "value": "16 bar"}]}]}]}]}}
    expect(_physics_claim_falsified(_passive_ok, {"severity": "high",
           "issue": "The Pressure Relief Valve and Low Pressure Switch are all rated '4 kW'"}) is True,
           "PHYS(c): '4 kW' on a passive device with NO power modifier must falsify")
    _passive_bad = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Pressure Relief Valve", "modifier_characters": [{"kind": "power", "value": "4 kW"}]}]}]}]}}
    expect(_physics_claim_falsified(_passive_bad, {"severity": "high",
           "issue": "The Pressure Relief Valve is rated '4 kW'"}) is False,
           "PHYS(c): a passive device that IS actually power-rated must NOT falsify (real defect)")
    # (d) phantom oversized vessel — falsify when the named vessel is absent from the shipped design
    _no_cip = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Cip System Connections"}]}]}]}}
    expect(_physics_claim_falsified(_no_cip, {"severity": "high",
           "issue": "The design includes a 'Cip Tank' (40 m³) which is absurdly oversized and implausible"}) is True,
           "PHYS(d): an oversized 'Cip Tank' that no longer EXISTS in the design must falsify")
    _has_cip = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Cip Tank", "modifier_characters": [{"kind": "capacity", "value": "40 m³"}]}]}]}]}}
    expect(_physics_claim_falsified(_has_cip, {"severity": "high",
           "issue": "The design includes a 'Cip Tank' (40 m³) which is absurdly oversized"}) is False,
           "PHYS(d): an oversized vessel that IS present must NOT falsify (real defect)")
    # (e) 'a single <part>' undercount — falsify when the contract shows count ≥ 2
    _two_pumps = {"orchestratorContract": {"quantities": {"fertigation_dosing_pump_count": {"value": 2}}}}
    expect(_physics_claim_falsified(_two_pumps, {"severity": "high",
           "issue": "The design specifies a single water-powered dosing pump rated at 10 L/h"}) is True,
           "PHYS(e): 'a single dosing pump' when the contract count is 2 must falsify")
    _one_pump = {"orchestratorContract": {"quantities": {"fertigation_dosing_pump_count": {"value": 1}}}}
    expect(_physics_claim_falsified(_one_pump, {"severity": "high",
           "issue": "The design specifies a single dosing pump"}) is False,
           "PHYS(e): 'a single dosing pump' when the count really IS 1 must NOT falsify")
    # (d-broadened) "the design provides 'X'" where X was DROPPED downstream — stale reasoning (Codema
    # water-storage 'deficit' predicated on the dropped 'Cleaning Tank'/'Cip Tank'). Must falsify when the
    # cited parts are absent; must NOT falsify when they exist, nor a genuine "design LACKS X" gap.
    _no_tanks = {"moduleDecomposition": {"modules": [{"sub_modules": [{"words": [
        {"name_human": "Fresh Water Tank"}, {"name_human": "Drain Water Tank"}]}]}]}}
    expect(_physics_claim_falsified(_no_tanks, {"severity": "high",
           "issue": "The design only provides 2x 40 m³ tanks (labeled as 'Cleaning Tank' and 'Cip Tank'), a 40 m³ deficit"}) is True,
           "PHYS(d): a 'design provides X' claim citing DROPPED tanks must falsify")
    expect(_physics_claim_falsified(_no_tanks, {"severity": "high",
           "issue": "the design provides a 'Fresh Water Tank' that is oversized"}) is False,
           "PHYS(d): a 'design provides X' claim where X EXISTS must NOT falsify")
    expect(_physics_claim_falsified({"moduleDecomposition": {"modules": []}}, {"severity": "high",
           "issue": "the design lacks a 'Backup Pump' required by the brief"}) is False,
           "PHYS(d): a genuine 'design LACKS X' missing-component finding must NOT falsify")

    # ── proveCatch (f): EXISTENCE falsification of 'design OMITS X' claims (2026-07-02, the v55
    #    stale top HIGH: "completely omits the three 40 m³ storage tanks (one fresh-water, two
    #    drain-water)" while TK-108 Fresh Water Tank + the Drain Water Tanks were IN the delivered
    #    BoM). Token match per the f9dfc2918 distinguishing-token discipline: all row tokens in
    #    the claim, at least one NON-generic ('fresh'/'drain' decides; bare 'tank' never does).
    _v55_bom = {"requirementsBom": [
        {"status": "BESPOKE", "requirement": "Fresh Water Tank · 3.7 m dia x 3.7 m"},
        {"status": "BESPOKE", "requirement": "Drain Water Tank · 3.6 m dia x 3.9 m"},
        {"status": "SUB-COMPONENT", "requirement": "↳ Nameplate"},
    ], "moduleDecomposition": {"modules": []}}
    expect(_physics_claim_falsified(_v55_bom, {"severity": "high",
           "issue": "The design completely omits the three 40 m³ storage tanks (one fresh-water, "
                    "two drain-water) required to meet the brief's 120 m³ buffer"}) is True,
           "PHYS(f): 'omits the fresh-water/drain-water tanks' must falsify — both tanks SHIP in the BoM")
    expect(_physics_claim_falsified(_v55_bom, {"severity": "high",
           "issue": "The design omits the inductive EC sensors the brief explicitly requires"}) is False,
           "PHYS(f): a GENUINE omission (no EC sensor row exists) must NOT falsify")
    expect(_physics_claim_falsified(_v55_bom, {"severity": "high",
           "issue": "The design lacks a backup fresh water tank for N+1 redundancy"}) is False,
           "PHYS(f): a missing-REDUNDANCY claim must NOT be falsified by the base tank shipping")
    expect(_physics_claim_falsified({"requirementsBom": [
        {"status": "BESPOKE", "requirement": "Tank"}], "moduleDecomposition": {"modules": []}},
        {"severity": "high", "issue": "The design omits the chemical dosing tank"}) is False,
        "PHYS(f): an ALL-GENERIC row ('Tank') can never decide an existence falsification")

    # ── proveCatch: DETERMINISTIC CORROBORATION LAYER (Tristan 2026-07-03) ───────
    # B3 extended to the critic's FINDING SET: a finding SCORES only when a
    # deterministic check over the delivered artefacts corroborates it; an
    # uncorroborated finding is an advisory note that NEVER scores — both directions.
    def _corr_word(cid, name, kw=None):
        mods = [{"kind": "quantity", "value": "×1"}]
        if kw is not None:
            mods.append({"kind": "rating_primary", "value": f"{kw}kW"})
        return {"name_human": name,
                "content_character": {"character_id": cid, "name_human": name},
                "modifier_characters": mods}

    corr_state = {"moduleDecomposition": {"modules": [{"module": "mass_fluid", "sub_modules": [{"words": [
        _corr_word("fert_pump_synth", "Fertigation Dosing Pump", 8),
        _corr_word("fert_pump_synth_word__drive_motor", "Drive Motor", 11),
        _corr_word("ro_hp_pump_synth", "Ro High Pressure Pump", 4),
        _corr_word("ro_hp_pump_synth_word__drive_motor", "Drive Motor", 6),
        _corr_word("softener_vessel_synth", "Softener Vessel"),
    ]}]}]}}
    claim_fert = {"severity": "high", "confidence": "high",
                  "issue": "The Drive Motor for the Fertigation Dosing Pump is rated at 11 kW, "
                           "but the parent pump is rated at 8 kW."}
    claim_judgement = {"severity": "high", "confidence": "high",
                       "issue": "The Softener Vessel is oversized for 350 litres of resin; "
                                "typically a 700-800 litre vessel is sufficient."}
    # (1) corroborated rating-pair FIRES (scores)
    v1 = _corroborate_finding(corr_state, claim_fert)
    expect(v1[0] == "corroborated" and v1[1] == "rating_pair",
           f"CORR(1): the fertigation 8 kW-pump / 11 kW-motor claim must CORROBORATE (got {v1[:2]})")
    expect(_physics_high_is_design_defect(claim_fert, corr_state) is True,
           "CORR(1): a corroborated rating-pair HIGH must SCORE")
    # (2) uncorroborated judgement NEVER scores (advisory) — the other direction
    v2 = _corroborate_finding(corr_state, claim_judgement)
    expect(v2[0] == "uncorroborated",
           f"CORR(2): an oversize judgement call with no deterministic matcher must be UNCORROBORATED (got {v2[0]})")
    expect(_physics_high_is_design_defect(claim_judgement, corr_state) is False,
           "CORR(2): an uncorroborated finding must NEVER score, even at severity=high")
    # (3) REPRODUCTION PROOF: two different LLM re-rolls over the SAME delivered state
    #     canonicalise to IDENTICAL scoring rows (the v56c/v56d determinism fix).
    reroll_a = [claim_fert, claim_judgement]                       # v56c-style: 1 pair + 1 judgement
    reroll_b = [{"severity": "med", "confidence": "high",
                 "issue": "The Drive Motor for the Ro High Pressure Pump is rated at 6 kW, "
                          "but the parent pump is rated at 4 kW."}]  # v56d-style: different pair named
    rows_a = [(r["severity"], r["issue"]) for r in _canonicalise_issues(corr_state, reroll_a)
              if r.get("corroboration") == "corroborated"]
    rows_b = [(r["severity"], r["issue"]) for r in _canonicalise_issues(corr_state, reroll_b)
              if r.get("corroboration") == "corroborated"]
    expect(rows_a == rows_b and len(rows_a) == 2,
           f"CORR(3): different critic re-rolls over the SAME state must yield IDENTICAL canonical "
           f"scoring rows via the full sweep (a={len(rows_a)}, b={len(rows_b)}, equal={rows_a == rows_b})")
    # (4) a HEALTHY pair (within the 1.25× service tolerance) never fires the sweep,
    #     and a rating-pair claim against it stays advisory (no manufactured defect).
    healthy = {"moduleDecomposition": {"modules": [{"module": "m", "sub_modules": [{"words": [
        _corr_word("p_synth", "Recirculation Pump", 10),
        _corr_word("p_synth_word__drive_motor", "Drive Motor", 11),
    ]}]}]}}
    expect(_rating_pair_sweep(healthy) == [],
           "CORR(4): a 10 kW pump with an 11 kW motor (ratio 1.10) is healthy — the sweep must be EMPTY")
    claim_healthy = {"severity": "high", "issue": "The Drive Motor for the Recirculation Pump is "
                     "rated at 11 kW but the pump is rated at 10 kW."}
    expect(_corroborate_finding(healthy, claim_healthy)[0] == "uncorroborated",
           "CORR(4): a rating-pair claim within the service tolerance must NOT corroborate")
    # (5) existence claims: a GENUINE omission corroborates; INFO advisory carries no penalty
    omit_claim = {"severity": "high", "issue": "The design omits the drain transfer pump required by the brief"}
    v5 = _corroborate_finding(_v55_bom, omit_claim)
    expect(v5[0] == "corroborated" and v5[1] == "existence",
           f"CORR(5): a genuine omission (no pump row ships) must CORROBORATE via the existence scan (got {v5[:2]})")
    expect(_SEVERITY_PENALTY.get("INFO") == 0,
           "CORR(5): INFO (advisory) findings must carry a ZERO tab-score penalty")
    # (6) idempotency: canonicalising an already-canonical set is a no-op
    once = _canonicalise_issues(corr_state, reroll_a)
    expect(_canonicalise_issues(corr_state, once) == once,
           "CORR(6): canonicalisation must be idempotent (marker-guarded)")
    # (7) COUNT shape is noun-ADJACENT (codema v61 false corroboration): a claim whose
    #     singular phrase counts a SCHEDULE LINE ("consolidated into a single schedule line
    #     of 17 units … reverse osmosis skid ×1 …") must NOT corroborate against an
    #     unrelated *_count == 1 grabbed from the vessel roster — such a row could never
    #     clear however the design changed. A REAL undercount ("only a single dosing pump")
    #     still corroborates when the contract confirms the deficiency.
    count_state = {"orchestratorContract": {"quantities": {
        "reverse_osmosis_skid_count": {"value": 1, "unit": ""},
        "dosing_pump_count": {"value": 1, "unit": ""},
    }}}
    v7_line = _corroborate_finding(count_state, {
        "severity": "low",
        "issue": "The level transmitters and pressure transmitters are consolidated into a "
                 "single schedule line of 17 units, but the 'vessel_location' modifier lists "
                 "'reverse osmosis skid x1 (0-3 m)' and 'gac filter x1 (0-1.4 m)'."})
    expect(v7_line[0] != "corroborated",
           f"CORR(7): 'a single SCHEDULE LINE' is not an equipment undercount — matching the "
           f"unrelated reverse_osmosis_skid_count=1 manufactured a permanent false corroboration (got {v7_line[:2]})")
    v7_pump = _corroborate_finding(count_state, {
        "severity": "high",
        "issue": "The design provides only a single dosing pump for both acid and base duty."})
    expect(v7_pump[0] == "corroborated" and v7_pump[1] == "count",
           f"CORR(7): a REAL 'only a single dosing pump' undercount with dosing_pump_count=1 "
           f"must still corroborate (got {v7_pump[:2]})")

    # ── proveCatch: CURRENT-RATING-PAIR shape (Tristan 2026-07-05 — the
    # doctrine's fourth application: gate 33 blocking requires deterministic
    # corroboration). The v4 BESS fuse HIGH verbatim ("The rack-level fuses
    # are specified as Eaton Bussmann PV-200A-1XL-B-15 rated at 200 A. …
    # nominal current per rack is 1,667 A / 13 = 128.2 A. A 200 A fuse
    # provides a 1.56x margin, which is acceptable. However, … the 200 A
    # fuse is undersized relative to the 315 A switch and 500 A contactor …")
    # must FALSIFY (the claimed undersizing does not survive contact with the
    # delivered part's own rating vs the contract's demand) — both directions
    # asserted against a genuinely undersized synthetic counterpart.
    def _fuse_word(pn, amps, kind="capacity"):
        mods = [{"kind": "quantity", "value": "×13"}, {"kind": "manufacturer", "value": "Eaton Bussmann"},
                {"kind": "part_number", "value": pn}, {"kind": kind, "value": str(amps), "unit": "A"}]
        return {"name_human": "DC HRC fuse", "content_character": {"character_id": "dc_hrc_fuse_word"},
                "modifier_characters": mods}
    fuse_state_ok = {
        "moduleDecomposition": {"modules": [{"module": "power_distribution", "sub_modules": [{"words": [
            _fuse_word("PV-200A-1XL-B-15", 200)]}]}]},
        "orchestratorContract": {"quantities": {
            "string_continuous_current_a": {"value": 128.2051282051282, "unit": "A"}}},
    }
    v4_fuse_claim = {
        "severity": "high", "confidence": "high",
        "issue": ("The rack-level fuses are specified as Eaton Bussmann PV-200A-1XL-B-15 rated at 200 A. "
                  "However, the maximum DC current of the system is 1,667 A. Split across 13 parallel racks, "
                  "the nominal current per rack is 1,667 A / 13 = 128.2 A. A 200 A fuse provides a 1.56x "
                  "margin, which is acceptable. However, the sub-module description also lists 'Schaltbau "
                  "C310K/500' contactors rated at 500 A continuous and 'OTDC315FV11-ESS' disconnect switches "
                  "rated at 315 A. The 200 A fuse is undersized relative to the 315 A switch and 500 A "
                  "contactor, and will run hot at 128 A continuous in a 45°C ambient container environment."),
    }
    v8 = _corroborate_finding(fuse_state_ok, v4_fuse_claim)
    expect(v8[0] == "falsified" and v8[1] == "current_rating_pair",
           f"CORR(8): the v4 fuse HIGH (200 A fuse, 128.2 A rack demand, 1.56x margin) must FALSIFY "
           f"— the claimed undersizing does not survive its own cited numbers (got {v8[:2]})")
    expect(_physics_high_is_design_defect(v4_fuse_claim, fuse_state_ok) is False,
           "CORR(8): the v4 fuse HIGH must NEVER score once corroborated as falsified")
    # (9) a GENUINELY undersized rack fuse (100 A on a 128.2 A rack, required
    #     160.25 A) must CORROBORATE — the shape must still catch a real fault.
    fuse_state_bad = {
        "moduleDecomposition": {"modules": [{"module": "power_distribution", "sub_modules": [{"words": [
            _fuse_word("PV-100A-2XL-B-15", 100)]}]}]},
        "orchestratorContract": {"quantities": {
            "string_continuous_current_a": {"value": 128.2051282051282, "unit": "A"}}},
    }
    v9 = _corroborate_finding(fuse_state_bad, {
        "severity": "high", "confidence": "high",
        "issue": "The rack-level fuses are specified as Eaton Bussmann PV-100A-2XL-B-15 rated at 100 A, "
                 "undersized relative to the 315 A disconnect switch and 500 A contactor.",
    })
    expect(v9[0] == "corroborated" and v9[1] == "current_rating_pair",
           f"CORR(9): a genuinely undersized 100 A fuse on a 128.2 A rack (needs >=160.25 A) must "
           f"CORROBORATE (got {v9[:2]})")
    # (10) UNCORROBORABLE: a protective-device claim naming NO part the design
    #      actually ships (a fabricated/typo'd PN) must stay uncorroborated —
    #      never silently falsified just because nothing matched.
    v10 = _corroborate_finding(fuse_state_ok, {
        "severity": "high", "confidence": "high",
        "issue": "The XYZ-9999-NOPE fuse rated at 50 A is undersized relative to the 315 A disconnect switch.",
    })
    expect(v10[0] == "uncorroborated" and v10[1] == "current_rating_pair",
           f"CORR(10): a claim naming a part that matches NO delivered row must stay UNCORROBORABLE, "
           f"never falsified/corroborated by accident (got {v10[:2]})")

    # ---- VERIFIED OUT-OF-SCOPE (Tristan 2026-07-05, Option A) — tab_scorecard_summary
    #      must exclude a `scored:False` tab from EVERY count (min/fail/unscored), while an
    #      out-of-scope CLAIM that has NOT proved both its own verification checks (never
    #      sets `scored:False`) must still be scored normally, and score LOW so the "unverified
    #      scope dodge" cannot escape the floor. GENERIC — the fixture below is a generic
    #      "Discipline X" tab name, never "HVAC", proving the mechanism is keyed on the
    #      `scored` flag alone. ----
    _voos_scores = {
        "Executive Summary": {"score": 9, "target": 8},
        "Discipline X": {"score": 8, "target": 8, "status": "PASS", "scored": False},
    }
    _voos_sum = tab_scorecard_summary(_voos_scores)
    expect(_voos_sum["min_tab"] == "Executive Summary" and _voos_sum["min_score"] == 9,
           f"a scored:False tab must NEVER be the min/floor candidate, even when its own "
           f"score is the lowest in the dict (got min_tab={_voos_sum['min_tab']!r}, "
           f"min_score={_voos_sum['min_score']!r})")
    expect("Discipline X" not in _voos_sum["fail_tabs"] and "Discipline X" not in _voos_sum["unscored_tabs"],
           "a scored:False tab must be neither a FAIL nor an UNSCORED tab")
    expect(_voos_sum.get("verified_out_of_scope_tabs") == ["Discipline X"],
           f"the verified-out-of-scope tab must be named in its own tally "
           f"(got {_voos_sum.get('verified_out_of_scope_tabs')!r})")
    expect(_voos_sum["all_pass"] is True,
           "a workbook whose ONLY non-9 tab is verified out-of-scope must still all_pass")
    # direction 2: a LOW-scoring tab that does NOT set scored:False (the "unverified scope
    # dodge" — claims inapplicability but never proved it) MUST still count as a normal FAIL.
    _dodge_scores = {
        "Executive Summary": {"score": 9, "target": 8},
        "Discipline X": {"score": 0, "target": 8, "status": "FAIL"},   # no `scored` key at all
    }
    _dodge_sum = tab_scorecard_summary(_dodge_scores)
    expect(_dodge_sum["min_tab"] == "Discipline X" and _dodge_sum["min_score"] == 0,
           f"an UNVERIFIED out-of-scope claim (no scored:False) must floor normally — "
           f"got min_tab={_dodge_sum['min_tab']!r}, min_score={_dodge_sum['min_score']!r}")
    expect("Discipline X" in _dodge_sum["fail_tabs"],
           "the unverified-claim tab must be a normal FAIL, never exempted")
    expect(_dodge_sum["all_pass"] is False,
           "a workbook with a genuine 0-scoring tab must NOT all_pass, scored:False or not")
    # direction 3: a normal, fully-scored tab (the "duty branch" — real content present) is
    # completely unaffected by the mechanism's existence.
    _normal_scores = {"Overview": {"score": 10, "target": 8}, "Brief": {"score": 9, "target": 8}}
    _normal_sum = tab_scorecard_summary(_normal_scores)
    expect(_normal_sum["min_tab"] == "Brief" and _normal_sum["min_score"] == 9 and _normal_sum["all_pass"] is True,
           f"a workbook with no scored:False tabs at all must behave exactly as before "
           f"(got {_normal_sum!r})")

    # ---- scope-qualified brief target matcher (2026-07-05, battery-only vs full-system) -----
    # A brief cost anchor scoped to a SUBSET of the design ("battery-energy-storage portion
    # only ... EXCLUDING the ... transformer ... costs approximately £63 per kWh") must match
    # the scope-restricted sibling quantity, never the full-system figure of the same name.
    _scope_state = {
        "parsedBrief": {
            "original_text": (
                "Cost anchors: the battery-energy-storage portion only — cells, racks, "
                "battery management — but EXCLUDING the medium-voltage step-up transformer "
                "and the 11 kV switchgear — costs approximately £63 per kWh at the two-hour "
                "configuration."
            ),
        },
        "orchestratorContract": {
            "quantities": {
                "cost_per_kwh_gbp": {"value": 113.34, "unit": "GBP/kWh", "family": "currency"},
                "battery_only_cost_per_kwh_gbp": {"value": 60.0, "unit": "GBP/kWh", "family": "currency"},
            }
        },
    }
    _sk, _sv = _contract_match(_scope_state, "cost_per_kwh_gbp", "GBP/kWh", 63)
    expect(_sk == "battery_only_cost_per_kwh_gbp" and _sv == 60.0,
           f"a battery-only-scoped £63/kWh brief target must match the battery_only_ sibling "
           f"(60), not the full-system quantity (113.34) — got ({_sk!r}, {_sv!r})")
    # proveCatch: WITHOUT the scope signal in the brief text, the plain exact-name match must
    # still win (no false redirect on an ordinary, unscoped metric).
    _unscoped_state = {
        "parsedBrief": {"original_text": "Cost target: approximately £63 per kWh."},
        "orchestratorContract": {"quantities": _scope_state["orchestratorContract"]["quantities"]},
    }
    _uk, _uv = _contract_match(_unscoped_state, "cost_per_kwh_gbp", "GBP/kWh", 63)
    expect(_uk == "cost_per_kwh_gbp" and _uv == 113.34,
           f"an UNSCOPED brief target must match the plain full-system quantity, never the "
           f"_only_ sibling by accident — got ({_uk!r}, {_uv!r})")
    # proveCatch: a genuinely-missed SCOPED target must still FAIL, not be silently rescued —
    # the pass only redirects WHICH quantity is compared, it never manufactures a PASS.
    _miss_state = dict(_scope_state)
    _miss_state["orchestratorContract"] = {
        "quantities": {
            "cost_per_kwh_gbp": {"value": 113.34, "unit": "GBP/kWh", "family": "currency"},
            "battery_only_cost_per_kwh_gbp": {"value": 90.0, "unit": "GBP/kWh", "family": "currency"},
        }
    }
    _miss_state["parsedBrief"] = {
        "constraints": {"target_performance": {"metrics": [
            {"key_metric": "cost_per_kwh_gbp", "value": 63, "unit": "GBP/kWh", "category": "cost"}
        ]}},
        "original_text": _scope_state["parsedBrief"]["original_text"],
    }
    _miss_findings = check_brief_metric_fail(_miss_state, [], "")
    expect(any(f.check == "brief_metric_fail" for f in _miss_findings),
           "a scope-matched battery_only quantity that STILL misses the brief's £63/kWh target "
           "must surface as a HIGH brief_metric_fail, never be silently rescued to a PASS")

    # ---- feedstock/consumption approximate-tolerance (2026-07-06, CO2-mineralisation ----
    # KOH false brief-miss): 'brief metric koh_feed_tpd: target 2.6 t/day but design
    # achieves 2.54 t/day' was flagging as a HIGH — but KOH is a DERIVED feedstock
    # consumption (2.54 t/day is the correct stoichiometric amount for 3.9 t/day K2SO4:
    # 2*(3900/174)*56 = 2.51-2.54 t/day) and the brief states the figure as
    # 'approximately 2.6 t/day'. proveCatch, four directions.
    _koh_state = {
        "parsedBrief": {
            "original_text": (
                "Feedstocks: gypsum (approximately 3.1 t/day), potassium hydroxide "
                "(approximately 2.6 t/day), process water"
            ),
            "constraints": {"target_performance": {"metrics": [
                {"key_metric": "koh_feed_tpd", "value": 2.6, "unit": "t/day", "category": "scale"},
            ]}},
        },
        "orchestratorContract": {"quantities": {
            "koh_feed_t_per_day": {"value": 2.54, "unit": "t/day", "family": "mass"},
        }},
    }
    # Direction 1: 2.54 vs an approximate 2.6 target (2.3% gap) is COMPLIANT, not a HIGH.
    _koh_findings = check_brief_metric_fail(_koh_state, [], "")
    expect(not _koh_findings,
           f"a feedstock metric (2.54 vs approx-2.6 target, 2.3% gap) hedged by the "
           f"brief's own 'approximately' must be COMPLIANT, not a HIGH miss — got "
           f"{[f.message for f in _koh_findings]!r}")
    # Direction 2: a genuinely-short feedstock (20% under) still FAILS — the tolerance
    # is a band, not a blanket rescue of every feedstock metric.
    _koh_short = json.loads(json.dumps(_koh_state))
    _koh_short["orchestratorContract"]["quantities"]["koh_feed_t_per_day"]["value"] = 2.08
    expect(any(f.check == "brief_metric_fail" for f in check_brief_metric_fail(_koh_short, [], "")),
           "a feedstock 20% short of its approximate brief target must still FAIL")
    # Direction 3: a HARD, non-approximate feedstock target (the brief states it exactly,
    # no 'approximately'/'~'/'about'/'roughly' near the value) stays on the tight 2% band
    # — the relief never fires without the brief's own hedge.
    _koh_hard = json.loads(json.dumps(_koh_state))
    _koh_hard["parsedBrief"]["original_text"] = (
        "Feedstocks: gypsum (3.1 t/day), potassium hydroxide (exactly 2.6 t/day), process water")
    expect(any(f.check == "brief_metric_fail" for f in check_brief_metric_fail(_koh_hard, [], "")),
           "a feedstock target the brief states WITHOUT an approximation hedge must stay "
           "on the tight 2% tolerance (2.54 vs 2.6 is a 2.3% gap, outside 2%)")
    # Direction 4: a HARD PERFORMANCE metric (output/capacity) stays on the tight 2% band
    # even though the brief ALSO hedges it with 'approximately' — the relief is scoped to
    # feedstock/consumption names, it must never leak to a capacity/output floor.
    _output_state = {
        "parsedBrief": {
            "original_text": (
                "Product output: approximately 2.3 t/day precipitated calcium carbonate "
                "and approximately 3.9 t/day potassium sulfate"
            ),
            "constraints": {"target_performance": {"metrics": [
                {"key_metric": "caco3_output_tpd", "value": 2.3, "unit": "t/day", "category": "scale"},
            ]}},
        },
        "orchestratorContract": {"quantities": {
            "caco3_output_t_per_day": {"value": 2.24, "unit": "t/day", "family": "mass"},
        }},
    }
    expect(any(f.check == "brief_metric_fail" for f in check_brief_metric_fail(_output_state, [], "")),
           "an OUTPUT/capacity metric must stay on the tight 2% tolerance even when the "
           "brief also says 'approximately' — the feedstock relief must not leak to output metrics")

    # ---- civil-works exclusion must not catch in-scope equipment structure (2026-07-05) ----
    # proveCatch direction 1: a container's OWN internal structural item (in-scope equipment
    # mounting) must NOT be flagged when the brief excludes "civil works".
    _civil_ok_state = {
        "parsedBrief": {
            "original_text": (
                "The battery-energy-storage portion only — cells, racks, battery management, "
                "the 20-foot enclosure — but EXCLUDING the medium-voltage step-up transformer, "
                "the 11 kV switchgear, and civil works — costs approximately £63 per kWh."
            ),
        },
    }
    _civil_ok_rows = [
        {"requirement": "structural floor reinforcement", "status": "OK", "line_gbp": 450},
        {"requirement": "ISO container 20-ft HC", "status": "OK", "line_gbp": 5200},
    ]
    _civil_ok_findings = check_scope_fidelity(_civil_ok_state, _civil_ok_rows, "")
    expect(not any(f.check == "scope_fidelity" for f in _civil_ok_findings),
           "a container's own in-scope structural floor reinforcement must NOT be flagged as "
           "excluded 'civil works' scope — got: "
           f"{[f.message for f in _civil_ok_findings]!r}")
    # proveCatch direction 2: a GENUINE civil-scope line (external groundworks/foundation)
    # built despite the same exclusion must still be caught.
    _civil_bad_rows = _civil_ok_rows + [
        {"requirement": "concrete foundation pad", "status": "OK", "line_gbp": 18000},
    ]
    _civil_bad_findings = check_scope_fidelity(_civil_ok_state, _civil_bad_rows, "")
    expect(any(f.check == "scope_fidelity" and "civil works" in f.message for f in _civil_bad_findings),
           "a genuine civil-scope BoM line (concrete foundation pad) built despite an excluded "
           "civil-works scope must still surface as a scope_fidelity HIGH — got: "
           f"{[f.message for f in _civil_bad_findings]!r}")

    # ---- calc-coverage 'class_anchor' ROOT guard (CO2-mineralisation v2 cross-val
    # 2026-07-05, both directions): a class_anchor value (a cited engineering-estimate
    # default, e.g. '90% MEA absorber capture rate') is an INPUT citation like anchor/
    # standard/datasheet — it must NOT hide as an uncaptured calculation merely because
    # it carries no arithmetic operator. A genuinely-derived quantity with no formula
    # and no worked-calc must still be flagged (the guarantee still bites).
    _anchor_state = {"orchestratorContract": {"quantities": {
        "co2_capture_efficiency_pct": {
            "value": 90, "unit": "%", "source": "class_anchor",
            "source_detail": "computed by dac:regeneration-energy (inputs from brief)"},
        "carbonation_conversion_pct": {
            "value": 95, "unit": "%", "source": "class_anchor",
            "source_detail": "computed by dac:regeneration-energy (inputs from brief)"},
        "mystery_hidden_pct": {"value": 42, "unit": "%", "source": "calculator",
                               "source_detail": "an engineering judgement call, no formula"},
    }}}
    _anchor_findings = check_calc_coverage(_anchor_state, [], "")
    _anchor_hidden = ", ".join(f.actual for f in _anchor_findings if f.check == "calc_coverage")
    expect("co2_capture_efficiency_pct" not in _anchor_hidden
           and "carbonation_conversion_pct" not in _anchor_hidden,
           "a class_anchor (cited engineering-estimate) value must NOT be flagged as an "
           f"uncaptured calculation — got hidden={_anchor_hidden!r}")
    expect("mystery_hidden_pct" in _anchor_hidden,
           "a genuinely-derived quantity with no formula/worked-calc must STILL be flagged "
           f"hidden (the guarantee must not over-widen) — got hidden={_anchor_hidden!r}")

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
