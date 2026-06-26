#!/usr/bin/env python3
"""
dossier_repair.py — DETERMINISTIC self-correcting repair loop for a ForgeOS dossier.

WHY THIS EXISTS
---------------
The founder's principle (2026-06): "the engine should look at things, see that it
doesn't work, and FIX it — not produce a report that says it failed. Find all the
problems and fix them internally, and don't produce a report until it's fixed."

`dossier_audit.py` is the DETECTOR — it FLAGS defects. But a flag that ships
unchanged is the "validator-without-fixer" anti-pattern: the customer sees the
defect. This module is the paired FIXER. It sits between dossier generation and
emission, runs the audit, and for every finding that has a SINGLE deterministic
correct answer it FIXES THE DATA in place, then re-audits, looping until no
fixable defect remains. Only the findings that genuinely require human input or
an upstream source-rule change are left in `.remaining()` — surfaced as
questions, never silently dropped.

THE SPLIT (load-bearing)
------------------------
- FIXABLE_CHECKS — a defect with a deterministic correct answer the data alone
  determines (an untagged principal line gets a deterministic ISA-style tag; a
  by-function duplicate collapses to one definition; a £0 line copies an
  identical sibling's known price). These the loop CORRECTS.
- Everything else is NOT auto-fixed, on purpose. You cannot invent a sale price
  (no_revenue_line), patch a design that misses the brief (brief metric FAIL /
  compliance gaps), rewrite leaked template prose into the right class
  (process_template_leak), or back-fill an upstream traceability wiring
  (coverage_empty / ledger). And sizing misses (transformer/fuse/current) need
  the design PARAMETERS — faking a number in `rows` would be a band-aid that
  hides a wrong SOURCE RULE (see project CLAUDE.md: fix the rule, never the
  symptom). Those are recorded as "needs source-rule fix", not patched here.

DESIGN RULES (mirror dossier_audit.py)
--------------------------------------
- DETERMINISTIC: no LLM, no network, no randomness. Same inputs → same fixes.
- UNIVERSAL: fixers key on SIGNALS (component noun, status, name normalisation),
  never on hardcoded class names. A line matching nothing is left untouched
  (the CO₂/SAF byte-identity guarantee).
- A fixer is a PURE function of (state, rows): it returns the mutated copies + a
  count + a human note. It never reaches the network or the filesystem.

PUBLIC API
----------
    repair_dossier(state, rows, run_dir, max_iters=6) -> RepairResult
    RepairResult
        .state, .rows          final corrected (state, rows)
        .iterations            passes the loop ran
        .fixes_applied         list[str] notes, one per applied fixer
        .remaining()           list[Finding] not auto-fixable (human / source-rule)
        .clean_of_fixable()    -> bool   no fixable findings remain
        .blocking()            -> list[Finding]  HIGH remaining → surface as questions

Stdlib only + `import dossier_audit`.
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass, field

# Import the detector. Support both "run as a module" and "run as a script from
# anywhere" — the audit lives beside this file.
try:
    import dossier_audit
except ImportError:  # pragma: no cover - import path convenience
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import dossier_audit

from dossier_audit import Finding, audit_dossier


# --------------------------------------------------------------------------- #
# Shared signal helpers (re-use the audit's deterministic primitives)
# --------------------------------------------------------------------------- #

_num = dossier_audit._num
_status = dossier_audit._status
_tag_missing = dossier_audit._tag_missing
_norm_name = dossier_audit._norm_name
_PRINCIPAL_STATUSES = dossier_audit._PRINCIPAL_STATUSES


def _row_noun(r: dict) -> str:
    """Best text describing what the row IS, for noun classification."""
    return " ".join(
        str(r.get(k) or "")
        for k in ("part", "name_human", "requirement", "tag")
    ).strip()


# ISA-style tag prefix scheme, keyed on the component NOUN. Universal: a noun
# signal, not a class table. Order matters — first matching pattern wins, so the
# more specific nouns are listed before the generic ones.
_TAG_PREFIX_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(heat\s*exchang|chiller|condens|evaporat|cooler|hx)\b", re.I), "HX"),
    (re.compile(r"\b(inverter|converter|rectifier|pcs|vfd|vsd|drive)\b", re.I), "INV"),
    (re.compile(r"\b(transformer|step[- ]?up|step[- ]?down|txfmr|xfmr)\b", re.I), "TX"),
    (re.compile(r"\b(pump|blower|compressor|fan)\b", re.I), "P"),
    (re.compile(r"\b(tank|vessel|column|reactor|drum|silo|separator|degasser|"
                r"clarifier|sump|reservoir)\b", re.I), "TK"),
    (re.compile(r"\b(filter|strainer|membrane|cartridge|screen)\b", re.I), "F"),
    (re.compile(r"\b(valve|actuator|damper|regulator)\b", re.I), "V"),
    (re.compile(r"\b(sensor|transmitter|probe|gauge|meter|instrument|analyser|"
                r"analyzer|detector|switch)\b", re.I), "I"),
    (re.compile(r"\b(cabinet|panel|enclosure|switchgear|mcc|board|rack)\b", re.I), "EP"),
]
# Fallback for anything that is clearly equipment but matches no specific noun.
_GENERIC_PREFIX = "X"


def _tag_prefix_for(r: dict) -> str:
    """Deterministic ISA-style prefix from the component noun, or X- fallback."""
    text = _row_noun(r)
    for rx, prefix in _TAG_PREFIX_RULES:
        if rx.search(text):
            return prefix
    return _GENERIC_PREFIX


def _is_principal(r: dict) -> bool:
    """Mirror the audit's tag_coverage notion of a 'principal' line."""
    return _status(r) != "SUB-COMPONENT" and (_num(r.get("line_gbp")) or 0) > 0


def _existing_tag_numbers(rows: list, prefix: str) -> set:
    """Already-used sequence numbers for a prefix, so we never collide."""
    used = set()
    pat = re.compile(rf"^{re.escape(prefix)}-(\d+)(?:\.\d+)?$", re.I)
    for r in rows:
        m = pat.match(str(r.get("tag") or "").strip())
        if m:
            used.add(int(m.group(1)))
    return used


# --------------------------------------------------------------------------- #
# Fixers — each: (state, rows) -> (state, rows, n_fixed, note)
# A fixer mutates the rows it is given (the loop passes the working copies) and
# returns how many lines it corrected plus a human-readable note.
# --------------------------------------------------------------------------- #

def fix_missing_tags(state: dict, rows: list):
    """Assign every untagged PRINCIPAL line a deterministic ISA-style tag.

    Universal noun→prefix scheme; sequential per prefix; stable + unique
    (continues existing numbering, never collides). Commodity / SUB-COMPONENT
    lines are left untagged on purpose — they don't need a drawing cross-ref.
    """
    # Seed the per-prefix counter from tags already present (so re-runs are stable
    # and we extend rather than restart the sequence).
    next_num: dict = {}
    for r in rows:
        for _, prefix in _TAG_PREFIX_RULES:
            next_num.setdefault(prefix, 0)
    next_num.setdefault(_GENERIC_PREFIX, 0)
    for prefix in list(next_num.keys()):
        used = _existing_tag_numbers(rows, prefix)
        next_num[prefix] = max(used) if used else 0

    n = 0
    assigned: list = []
    for r in rows:
        if not _is_principal(r):
            continue
        if not _tag_missing(r.get("tag")):
            continue
        prefix = _tag_prefix_for(r)
        next_num[prefix] = next_num.get(prefix, 0) + 1
        tag = f"{prefix}-{next_num[prefix]}"
        r["tag"] = tag
        assigned.append(tag)
        n += 1
    note = (f"fix_missing_tags: assigned {n} ISA-style tag(s) "
            f"({', '.join(assigned[:6])}{'…' if len(assigned) > 6 else ''})"
            if n else "fix_missing_tags: nothing to assign")
    return state, rows, n, note


# Fulfilment-status PLACEHOLDERS — these are NOT a component identity. A NOT-FOUND /
# BESPOKE row carries part="requirement stated" / "made to spec" (+ variants), IDENTICAL
# across dozens of physically-distinct requirements. Keying the dedup on that placeholder
# collapsed an Electrical Control Panel, an RO membrane (qty 3463 elements) and ~100 other
# distinct not-found lines into ONE row with the SUMMED qty — the £2.77M phantom panel and
# a 171→68 line collapse (Codema 2026-06-26). The dedup noun must be the row's durable
# IDENTITY (its requirement), never the fulfilment text.
_PLACEHOLDER_NOUNS = {
    "requirement_stated", "requirement_stated_structural", "requirement_stated_parametric",
    "requirement_stated_rating_based_parametric", "made_to_spec", "not_found", "tbd",
}


def _dup_key(r: dict):
    """A duplicate-by-function key: the row's durable IDENTITY (its requirement) + the
    salient spec the audit would compare on. Two physically-identical definitions collapse,
    but a 30 kW pump and a 75 kW pump (genuinely different) do NOT — and two DISTINCT
    not-found requirements never collapse just because they share the 'requirement stated'
    fulfilment placeholder."""
    noun = _norm_name(r.get("requirement") or r.get("name_human") or r.get("part"))
    # If the identity field is a fulfilment placeholder (or empty), DON'T risk a merge.
    if not noun or noun in _PLACEHOLDER_NOUNS:
        return ("", "")
    spec = ""
    for k in ("spec", "rating_primary", "capacity", "form", "model", "part_number"):
        v = r.get(k)
        if v not in (None, ""):
            spec = _norm_name(v)
            break
    return (noun, spec)


def fix_duplicate_principal(state: dict, rows: list):
    """Collapse two principal rows that are the same component BY FUNCTION
    (same normalised noun + same key spec) into one definition.

    Keep the first occurrence; merge the duplicate's qty into it (a bill should
    carry ONE definition with the summed count, not two identical lines), recompute
    its line total when unit price is known, then drop the duplicate. Deterministic.
    """
    seen: dict = {}
    drop_idx: set = set()
    n = 0
    merged: list = []
    for i, r in enumerate(rows):
        if not _is_principal(r):
            continue
        key = _dup_key(r)
        if not key[0]:  # no usable noun → don't risk a false merge
            continue
        if key in seen:
            keep = rows[seen[key]]
            qd = _num(r.get("qty"))
            qk = _num(keep.get("qty"))
            if qd is not None and qk is not None:
                keep["qty"] = qk + qd
                unit = _num(keep.get("unit_gbp"))
                if unit is not None:
                    keep["line_gbp"] = round((qk + qd) * unit)
            drop_idx.add(i)
            merged.append(str(r.get("part") or r.get("tag") or key[0])[:32])
            n += 1
        else:
            seen[key] = i

    if drop_idx:
        rows[:] = [r for i, r in enumerate(rows) if i not in drop_idx]
    note = (f"fix_duplicate_principal: merged + dropped {n} by-function "
            f"duplicate(s) ({', '.join(merged[:4])}{'…' if len(merged) > 4 else ''})"
            if n else "fix_duplicate_principal: no duplicates")
    return state, rows, n, note


def fix_zero_principal_price(state: dict, rows: list):
    """For a £0 principal line, copy the price from an IDENTICAL sibling that HAS
    a price; otherwise leave it (do NOT invent a number — that would be a band-aid
    over a missing source rule). Conservative.

    "Identical" = same normalised noun + same key spec (the duplicate key). This
    only fires when the bill already KNOWS the price for that exact part on
    another line, so it is a deterministic copy, not a guess.
    """
    # Build a price index from priced lines, keyed by the function key.
    priced: dict = {}
    for r in rows:
        line = _num(r.get("line_gbp"))
        unit = _num(r.get("unit_gbp"))
        if (line or 0) > 0 or (unit or 0) > 0:
            key = _dup_key(r)
            if key[0] and key not in priced:
                priced[key] = r

    n = 0
    filled: list = []
    for r in rows:
        if _status(r) not in _PRINCIPAL_STATUSES:
            continue
        if (_num(r.get("line_gbp")) or 0) != 0:
            continue
        key = _dup_key(r)
        src = priced.get(key)
        if src is None or src is r:
            continue  # no known sibling price → leave it, surface as the audit's MED
        unit = _num(src.get("unit_gbp"))
        qty = _num(r.get("qty"))
        if unit is not None and qty is not None:
            r["unit_gbp"] = unit
            r["line_gbp"] = round(qty * unit)
        else:
            sline = _num(src.get("line_gbp"))
            if sline is None:
                continue
            r["line_gbp"] = sline
            if unit is not None:
                r["unit_gbp"] = unit
        n += 1
        filled.append(str(r.get("part") or r.get("tag") or key[0])[:32])
    note = (f"fix_zero_principal_price: filled {n} £0 line(s) from a priced "
            f"sibling ({', '.join(filled[:4])}{'…' if len(filled) > 4 else ''})"
            if n else "fix_zero_principal_price: no sibling-priced £0 lines")
    return state, rows, n, note


# --------------------------------------------------------------------------- #
# Registry + the FIXABLE / not-fixable split
# --------------------------------------------------------------------------- #

# Each fixable `check` → the fixer that corrects it deterministically.
FIXERS = {
    "tag_coverage": fix_missing_tags,
    "tag_validity": fix_missing_tags,        # same data fix (a missing/invalid tag)
    "duplicate_principal_by_function": fix_duplicate_principal,
    "zero_principal": fix_zero_principal_price,
}

# The set the loop is allowed to auto-correct. Single source of truth for the split.
FIXABLE_CHECKS = set(FIXERS.keys())

# A small set of STRUCTURAL fixers that run PROACTIVELY every pass, independent of
# whether the audit happens to emit a matching finding. A by-function duplicate
# is a deterministic structural defect ("the bill must carry ONE definition per
# component") the repair loop should always clean — the founder's principle is
# "find ALL the problems and fix them", not "fix only what the detector named".
# These are idempotent (a clean bill is left byte-identical), so running them
# unconditionally is safe. The audit's `duplicate_principal_by_function` check
# (part of the concurrent audit-hardening effort) routes to the same fixer when
# it lands — the registry entry above guarantees that — but the loop does not
# DEPEND on that check existing yet.
# Order matters: fill a known £0 line from its priced sibling BEFORE the dedup
# collapses identical lines — so when an identical £0 line and a priced line both
# exist, the £0 line is priced first and the surviving merged definition carries
# the price (not £0).
STRUCTURAL_FIXERS = [fix_zero_principal_price, fix_duplicate_principal]

# Everything else is NOT auto-fixable. Documented WHY each can't be patched in
# data — these are genuine human-input or upstream-source-rule gaps, surfaced
# (never silently dropped). (Not exhaustive of the audit's checks; any check not
# in FIXABLE_CHECKS falls through to .remaining() with this rationale available.)
NON_FIXABLE_RATIONALE = {
    "no_revenue_line":
        "can't invent a sale price / arbitrage model — surface as a question to the operator",
    "installed_capex":
        "£0 installed capex is an upstream cost-stack computation gap, not a row patch",
    "brief_metric_FAIL":
        "design doesn't meet the brief — needs a sizing/source fix, not a data patch",
    "compliance_matcher_gap":
        "brief-compliance matcher logic gap — fix the matcher (source rule), don't fake a row",
    "cross_tab_value":
        "a metric unknown on one tab / computed on another — reconcile at the SOURCE that emits both",
    "coverage_empty":
        "parts-ledger not populated — upstream traceability wiring, not a row the fixer owns",
    "ledger_present":
        "no/invalid parts-ledger.json — produced by an upstream stage, can't synthesise here",
    "unresolved_high_physics":
        "a HIGH physics-critic finding — re-spec at the contract source rule, not in the BoM data",
    "process_template_leak":
        "leaked process-plant prose in a non-process class — fix the template/source, not a data field",
    "capex_category_coverage":
        "capex-by-category chart misses the equipment categories — fix the chart's source aggregation",
    "line_math":
        "qty×unit≠line — a deterministic arithmetic error in the EMITTER; fix the source rule that "
        "computed line_gbp, don't silently overwrite the rendered total here",
    # Sizing misses (transformer / fuse / current ratings) need the design
    # PARAMETERS to compute the correct rating; faking a number in `rows` hides
    # the wrong source rule. They route to the contract source, not the fixer.
    "_sizing_default":
        "needs the design parameters to size correctly — fix at the contract source rule, not in rows",
}


def _why_not_fixable(check: str) -> str:
    return NON_FIXABLE_RATIONALE.get(check, "no deterministic single-answer fix — human / source-rule gap")


# --------------------------------------------------------------------------- #
# Result type
# --------------------------------------------------------------------------- #

@dataclass
class RepairResult:
    state: dict
    rows: list
    iterations: int = 0
    fixes_applied: list = field(default_factory=list)
    _remaining: list = field(default_factory=list)

    def remaining(self) -> list:
        """Findings NOT auto-fixable — the genuine human-input / source-rule gaps."""
        return list(self._remaining)

    def clean_of_fixable(self) -> bool:
        """True when no fixable finding remains (the loop did its whole job)."""
        return not any(f.check in FIXABLE_CHECKS for f in self._remaining)

    def blocking(self) -> list:
        """HIGH remaining findings that should block emission / be surfaced as
        questions to the operator (they are not auto-correctable)."""
        return [f for f in self._remaining if f.severity == "HIGH"]

    def summary(self) -> dict:
        return {
            "iterations": self.iterations,
            "fixes_applied": len(self.fixes_applied),
            "remaining": len(self._remaining),
            "remaining_fixable": sum(1 for f in self._remaining if f.check in FIXABLE_CHECKS),
            "blocking": len(self.blocking()),
            "clean_of_fixable": self.clean_of_fixable(),
        }


# --------------------------------------------------------------------------- #
# The repair loop
# --------------------------------------------------------------------------- #

def repair_dossier(state: dict, rows: list, run_dir: str, max_iters: int = 6) -> RepairResult:
    """Run the deterministic self-correcting loop.

    Each pass: audit → for every finding whose `check` has a registered fixer,
    apply the fixer (mutating state/rows) → re-audit → repeat. Terminate when no
    fixable finding remains, OR a pass fixed nothing (no progress), OR max_iters.

    Returns a RepairResult carrying the corrected (state, rows), the iteration
    count, the applied-fix notes, and `remaining` = the findings that are NOT
    auto-fixable (the genuine human-input / source-rule gaps to surface).
    """
    state = state if isinstance(state, dict) else {}
    rows = list(rows) if isinstance(rows, list) else []

    fixes_applied: list = []
    iterations = 0
    last_report = audit_dossier(state, rows, run_dir)

    while iterations < max_iters:
        report = audit_dossier(state, rows, run_dir)
        last_report = report

        # What can we fix this pass?
        #  (a) findings the audit emitted whose check has a registered fixer;
        #  (b) the proactive STRUCTURAL fixers, which run every pass regardless of
        #      whether a matching finding was emitted (deterministic structural
        #      defects we always clean — see STRUCTURAL_FIXERS).
        fixable_checks_present = {
            f.check for f in report.findings if f.check in FIXABLE_CHECKS
        }

        iterations += 1
        pass_fixed = 0
        ran: set = set()

        # (b) proactive structural fixers first (idempotent, finding-independent).
        for fixer in STRUCTURAL_FIXERS:
            ran.add(fixer)
            state, rows, n, note = fixer(state, rows)
            if n > 0:
                fixes_applied.append(note)
                pass_fixed += n

        # (a) finding-driven fixers — each registered fixer AT MOST ONCE per pass
        # (a fixer handles every row of its kind in one call).
        for f in report.findings:
            fixer = FIXERS.get(f.check)
            if fixer is None or fixer in ran:
                continue
            ran.add(fixer)
            state, rows, n, note = fixer(state, rows)
            if n > 0:
                fixes_applied.append(note)
                pass_fixed += n

        if pass_fixed == 0:
            # Nothing changed this pass: no structural defect remained AND either no
            # fixable finding was reported, or the reported one couldn't be acted on
            # (e.g. a £0 line with no priced sibling). Either way we've reached a
            # fixed point — stop. Any still-flagged finding stays in `remaining`.
            iterations -= 1  # this pass did no work; don't count it
            break

    # Final audit reflects every applied fix. Everything still flagged that is NOT
    # auto-fixable is the genuine remaining gap. (A still-present FIXABLE finding
    # means the fixer couldn't act on it — e.g. a £0 line with no sibling price;
    # it stays in remaining too, honestly, and clean_of_fixable() reports False.)
    final = audit_dossier(state, rows, run_dir)
    remaining = [f for f in final.findings if f.check not in FIXABLE_CHECKS or
                 # keep a fixable check that survived (fixer couldn't resolve it)
                 True]
    # Annotate non-fixable findings with WHY (for the operator-facing surface).
    for f in remaining:
        if f.check not in FIXABLE_CHECKS and not f.source_rule.endswith(_why_not_fixable(f.check)):
            f.source_rule = (f.source_rule + " | repair: " + _why_not_fixable(f.check)).strip(" |")

    return RepairResult(
        state=state,
        rows=rows,
        iterations=iterations,
        fixes_applied=fixes_applied,
        _remaining=remaining,
    )


# --------------------------------------------------------------------------- #
# Selftest
# --------------------------------------------------------------------------- #

def _selftest() -> int:
    failures: list = []

    def expect(cond, msg):
        if not cond:
            failures.append(msg)

    # ---- Dirty fixture: untagged principals + duplicate pump + £0 principal ----
    # plus a non-fixable no-revenue (bess class, no revenue signal) and an
    # installed-capex £0 (also non-fixable) so we prove they survive into remaining.
    state = {
        "orchestratorContract": {"product_class": "bess", "quantities": {}},
        "parsedBrief": {"product_class": "bess", "constraints": {}},
        # installed_asp_gbp=0 → HIGH installed_capex (non-fixable);
        # bess class + no revenue → MED no_revenue_line (non-fixable).
        "costStack": {"installed_asp_gbp": 0},
    }
    rows = [
        # untagged principals of varied nouns (fix_missing_tags → P-/TK-/INV-/X-)
        {"tag": "—", "requirement": "Recirculation pump", "status": "IDENTIFIED",
         "part": "Grundfos pump", "qty": 1, "unit_gbp": 4000, "line_gbp": 4000},
        {"tag": "", "requirement": "Buffer tank", "status": "IDENTIFIED",
         "part": "Storage tank", "qty": 1, "unit_gbp": 9000, "line_gbp": 9000},
        {"tag": None, "requirement": "Grid inverter", "status": "IDENTIFIED",
         "part": "PCS converter", "qty": 1, "unit_gbp": 22000, "line_gbp": 22000},
        {"tag": "—", "requirement": "Control gizmo", "status": "IDENTIFIED",
         "part": "Generic widget", "qty": 1, "unit_gbp": 500, "line_gbp": 500},
        # DUPLICATE pump by function (same noun+spec as the first) → merged + dropped
        {"tag": "—", "requirement": "Recirculation pump", "status": "IDENTIFIED",
         "part": "Grundfos pump", "qty": 1, "unit_gbp": 4000, "line_gbp": 4000},
        # £0 principal (distinct part) whose identical priced sibling exists below →
        # fix_zero_principal_price copies the price (a degasser appears twice: one
        # priced, one £0; distinct noun from the tank so dedup doesn't pre-merge).
        {"tag": "TK-9", "requirement": "Degasser column", "status": "BESPOKE",
         "part": "Degasser unit", "qty": 1, "unit_gbp": 0, "line_gbp": 0},
        {"tag": "TK-10", "requirement": "Degasser column", "status": "IDENTIFIED",
         "part": "Degasser unit", "qty": 1, "unit_gbp": 12000, "line_gbp": 12000},
        # a SUB-COMPONENT (commodity) — must stay untagged + untouched
        {"tag": "", "requirement": "gasket", "status": "SUB-COMPONENT",
         "part": "o-ring", "qty": 50, "unit_gbp": 1, "line_gbp": 50},
    ]

    n_principal_before = sum(1 for r in rows if _is_principal(r))
    res = repair_dossier(state, rows, run_dir="/nonexistent-run-dir-xyz", max_iters=6)

    # 1) Every principal now carries a tag, and tags are unique.
    principals = [r for r in res.rows if _is_principal(r)]
    untagged = [r for r in principals if _tag_missing(r.get("tag"))]
    expect(not untagged, f"every principal must be tagged; still untagged: "
                         f"{[_row_noun(r)[:24] for r in untagged]}")
    tags = [str(r.get('tag')).strip() for r in principals]
    expect(len(tags) == len(set(tags)), f"tags must be unique, got {tags}")

    # noun→prefix correctness (universal scheme)
    by_noun = {_row_noun(r).lower(): str(r.get("tag")) for r in principals}
    expect(any(t.startswith("P-") for n, t in by_noun.items() if "pump" in n),
           f"pump should get P- tag, got {by_noun}")
    expect(any(t.startswith("TK-") for n, t in by_noun.items() if "tank" in n),
           f"tank should get TK- tag, got {by_noun}")
    expect(any(t.startswith("INV-") for n, t in by_noun.items() if "converter" in n or "inverter" in n),
           f"inverter should get INV- tag, got {by_noun}")
    expect(any(t.startswith("X-") for n, t in by_noun.items() if "widget" in n),
           f"generic equipment should get X- fallback, got {by_noun}")

    # 2) The by-function duplicate pump was resolved (one definition, qty merged).
    pump_rows = [r for r in res.rows if "pump" in _row_noun(r).lower() and _is_principal(r)]
    expect(len(pump_rows) == 1, f"duplicate pump must collapse to one row, got {len(pump_rows)}")
    if pump_rows:
        expect(_num(pump_rows[0].get("qty")) == 2,
               f"merged pump qty should be 2, got {pump_rows[0].get('qty')}")
    # Net principal-count change: the pump duplicate is removed (-1); the degasser
    # pair (one started £0 → not counted as principal, then priced + merged into the
    # already-counted priced one) nets to no change. So the count drops by exactly 1.
    expect(len(principals) == n_principal_before - 1,
           f"principal count should net-drop by 1 (pump dup removed; degasser pair "
           f"merges to the already-counted priced one): {n_principal_before} -> {len(principals)}")

    # 3) The £0 line was filled from its priced sibling (degasser £12000) and the
    #    two identical degassers then merged into one priced definition.
    degassers = [r for r in res.rows if "degasser" in _row_noun(r).lower() and _is_principal(r)]
    expect(len(degassers) == 1, f"degasser must collapse to one priced row, got {len(degassers)}")
    if degassers:
        expect((_num(degassers[0].get("line_gbp")) or 0) > 0,
               f"£0 degasser must be filled from sibling price, got {degassers[0].get('line_gbp')}")
        # priced £12000 each, merged qty 2 → £24000
        expect(_num(degassers[0].get("line_gbp")) == 24000,
               f"merged degasser line should be 2×£12000=£24000, got {degassers[0].get('line_gbp')}")

    # 4) The loop converged (iterations < max).
    expect(res.iterations < 6, f"loop must converge under max_iters, ran {res.iterations}")
    expect(res.clean_of_fixable(),
           f"no fixable finding should remain; remaining fixable: "
           f"{[f.check for f in res.remaining() if f.check in FIXABLE_CHECKS]}")

    # 5) Non-fixable findings correctly LEFT in remaining (NOT silently dropped).
    remaining_checks = {f.check for f in res.remaining()}
    expect("no_revenue_line" in remaining_checks,
           f"no_revenue_line must survive in remaining (can't invent a price), "
           f"got {remaining_checks}")
    expect("installed_capex" in remaining_checks,
           f"installed_capex (£0) must survive in remaining, got {remaining_checks}")
    # and they must be classed as non-fixable + carry the WHY annotation
    nr = [f for f in res.remaining() if f.check == "no_revenue_line"]
    expect(nr and "repair:" in nr[0].source_rule,
           "remaining non-fixable finding must carry the repair rationale")
    # blocking() surfaces the HIGH ones (installed_capex is HIGH)
    expect(any(f.check == "installed_capex" for f in res.blocking()),
           f"blocking() must surface the HIGH installed_capex, got "
           f"{[f.check for f in res.blocking()]}")

    # 6) At least the three target fixers actually ran.
    notes = " ".join(res.fixes_applied)
    expect("fix_missing_tags" in notes, "fix_missing_tags should have run")
    expect("fix_duplicate_principal" in notes, "fix_duplicate_principal should have run")
    expect("fix_zero_principal_price" in notes, "fix_zero_principal_price should have run")

    # ---- Stability fixture: a CLEAN-of-fixable bill must not be mutated --------
    clean_rows = [
        {"tag": "P-1", "requirement": "Pump", "status": "IDENTIFIED",
         "part": "Pump A", "qty": 1, "unit_gbp": 5000, "line_gbp": 5000},
        {"tag": "TK-1", "requirement": "Tank", "status": "IDENTIFIED",
         "part": "Tank B", "qty": 1, "unit_gbp": 8000, "line_gbp": 8000},
    ]
    import copy
    before = copy.deepcopy(clean_rows)
    clean_state = {"orchestratorContract": {"product_class": "widget"},
                   "parsedBrief": {"product_class": "widget", "constraints": {}},
                   "costStack": {"installed_asp_gbp": 100000}}
    res2 = repair_dossier(clean_state, clean_rows, run_dir="/nonexistent-run-dir-xyz")
    expect(res2.iterations == 0, f"clean-of-fixable bill needs 0 repair passes, got {res2.iterations}")
    expect(res2.rows == before, "clean bill must be left byte-identical (no spurious mutation)")

    # ---- NOT-FOUND placeholder guard (Codema 2026-06-26) ----------------------
    # Distinct NOT-FOUND requirements all carry part="requirement stated" — the dedup
    # must key on the REQUIREMENT (identity), NOT that placeholder, or it collapses
    # physically-distinct lines into ONE with the SUMMED qty (the £2.77M phantom panel:
    # an Electrical Control Panel + an RO membrane qty 3463 + others merged → qty 3469).
    nf_rows = [
        {"tag": "X-1", "requirement": "Electrical Control Panel", "status": "NOT FOUND",
         "part": "requirement stated", "qty": 1, "unit_gbp": 800, "line_gbp": 800},
        {"tag": "F-1", "requirement": "RO Membrane · 364 m² area", "status": "NOT FOUND",
         "part": "requirement stated", "qty": 3463, "unit_gbp": 12, "line_gbp": 41556},
        {"tag": "I-1", "requirement": "SCADA Plant Control System", "status": "NOT FOUND",
         "part": "requirement stated", "qty": 5, "unit_gbp": 600, "line_gbp": 3000},
    ]
    res3 = repair_dossier(clean_state, [dict(r) for r in nf_rows],
                          run_dir="/nonexistent-run-dir-xyz")
    nf_principals = [r for r in res3.rows if _is_principal(r)]
    expect(len(nf_principals) == 3,
           f"3 DISTINCT not-found requirements must NOT collapse on the 'requirement stated' "
           f"placeholder, got {len(nf_principals)}: {[_row_noun(r)[:24] for r in nf_principals]}")
    panel = [r for r in nf_principals if "control panel" in _row_noun(r).lower()]
    expect(panel and _num(panel[0].get("qty")) == 1,
           f"the Electrical Control Panel must keep qty 1 (no summed phantom), got "
           f"{panel and panel[0].get('qty')}")

    if failures:
        print("SELFTEST FAILED:")
        for f in failures:
            print("  -", f)
        return 1

    print("OK — dossier_repair selftest passed.")
    print(f"  fixers run: {len(res.fixes_applied)} | iterations: {res.iterations} "
          f"(converged < max) | remaining (non-fixable): {len(res.remaining())} "
          f"| blocking: {len(res.blocking())}")
    print("  applied:")
    for note in res.fixes_applied:
        print(f"    - {note}")
    print("  remaining (surfaced, NOT auto-fixed):")
    for f in res.remaining():
        print(f"    - {f.severity:<4} {f.check}: {_why_not_fixable(f.check)}")
    return 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def _cli_writeback(run_dir: str) -> int:
    """Chain entrypoint: load <run_dir>/state.json, run the deterministic repair loop,
    and write the REPAIRED state back in place so EVERY downstream consumer (the Excel
    deliverable, any re-render, the chain verdict) builds from the corrected bill. The
    auto-fixable defects are gone; only genuine human-input / source-rule gaps survive
    in state._dossierRepair.needs_input. Idempotent — re-running on a repaired state is
    a no-op (the loop converges immediately)."""
    import json
    sp = os.path.join(run_dir, "state.json")
    try:
        with open(sp) as fh:
            state = json.load(fh)
    except Exception as e:  # noqa: BLE001
        print(f"dossier_repair: cannot read {sp}: {e}", file=sys.stderr)
        return 2
    rows = state.get("requirementsBom") or []
    res = repair_dossier(state, rows, run_dir)
    state = res.state
    state["requirementsBom"] = res.rows
    state["_dossierRepair"] = {
        **res.summary(),
        "fixes": list(res.fixes_applied),
        "needs_input": [
            {"check": f.check, "severity": f.severity, "tab": f.tab,
             "message": f.message, "why": f.source_rule}
            for f in res.remaining()
        ],
    }
    try:
        with open(sp, "w") as fh:
            json.dump(state, fh, indent=2)
    except Exception as e:  # noqa: BLE001
        print(f"dossier_repair: cannot write {sp}: {e}", file=sys.stderr)
        return 2
    s = res.summary()
    print(f"dossier_repair: {s['fixes_applied']} fix(es) over {s['iterations']} pass(es); "
          f"{s['remaining']} gap(s) need input ({s['blocking']} blocking HIGH) → wrote {sp}",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "--selftest":
        sys.exit(_selftest())
    elif len(sys.argv) >= 2 and os.path.isdir(sys.argv[1]):
        # chain use: repair <run_dir>/state.json in place
        sys.exit(_cli_writeback(sys.argv[1]))
    else:
        print("usage: dossier_repair.py --selftest | <run_dir>  (repairs run_dir/state.json in place)",
              file=sys.stderr)
        print("  (programmatic use: repair_dossier(state, rows, run_dir) -> RepairResult)",
              file=sys.stderr)
        sys.exit(2)
