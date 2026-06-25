#!/usr/bin/env python3
"""provenance.py — the TRACEABILITY SPINE enforcement (Tristan 2026-06-25).

THE PRINCIPLE: the dossier is a directed dataflow — brief (the root assumptions) → tool
selection → each tool turns brief inputs into outputs → those outputs are the inputs to the
next transform (another tool, the contract, or an Excel formula) → … → every downstream number
(quantities, BoM, cost, drawings, schedules) traces back through that chain to a tool, and the
tool back to the brief. EVERY number must have a lineage. NOTHING appears from nowhere.

THE ENFORCEMENT (this module): a number is TRACEABLE iff it is a ROOT (sourced to the brief or
a physics constant) OR it records HOW it was produced — a non-empty source_detail (prose lineage)
or, better, a structured `lineage.from` (the exact upstream quantity keys it was computed from).
A number that is none of these is SOURCELESS — it "appears from nowhere" — and is a HARD defect.

This is the universal forcing function (the CORE FIX PRINCIPLE applied to provenance): the gate
FAILS on any sourceless number, which drives every number to record its origin. The exemplar it
catches: out/fischer-farms-v1 total_supply_demand_kw = 124,478 kW (source='design-loop', empty
source_detail, no recorded inputs, ~3000× the real 41.3 kW plant load sitting right next to it).

A second, independent check catches a WRONG number even before its lineage exists: DIVERGENCE —
two quantities of the same physical role (same unit-family + same role token) that differ by a
large factor are contradictory; one of them is wrong (124,478 vs 41.3).
"""
from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# A quantity from one of these origins is a legitimate ROOT (a brief assumption, a physics
# constant, a cited standard/datasheet value) and needs no further tracing — it IS a source.
ROOT_SOURCES = {
    "brief", "physics_constant", "constant", "standard", "standards",
    "anchor", "datasheet", "spec", "specification",
}

# Source tags that are DERIVED — they MUST record how they were produced (source_detail or
# a structured lineage.from). 'design-loop', 'calculator', 'tool', 'derived', '<none>' etc.
# all fall here; the empty-string / missing source is the worst (no origin claimed at all).

# Unit-family → the set of role tokens used to decide "same physical thing" for the divergence
# check. Universal: keyed on the key NAME tokens, not on archetype.
_DIVERGENCE_FACTOR = 50.0   # > 50× between same-role quantities ⇒ a near-certain contradiction
                            # (precision over recall: a secondary check; the sourceless check is
                            #  the rock-solid spine enforcement. 124478/41.3 = 3014× is caught;
                            #  a borderline same-domain 40× total-vs-embodied is not flagged.)


@dataclass
class ProvFinding:
    key: str
    severity: str           # HIGH | MED | LOW
    kind: str               # sourceless | divergence | orphan
    message: str
    value: Any = None
    unit: str = ""
    detail: str = ""


@dataclass
class ProvenanceReport:
    findings: List[ProvFinding] = field(default_factory=list)
    total: int = 0
    roots: int = 0
    traced: int = 0         # derived but with a recorded origin (detail or lineage.from)
    sourceless: int = 0
    structured: int = 0     # has a real lineage.from edge list (the gold standard)

    def scorecard(self) -> Dict[str, Any]:
        high = sum(1 for f in self.findings if f.severity == "HIGH")
        med = sum(1 for f in self.findings if f.severity == "MED")
        traceable = self.total - self.sourceless
        frac = (traceable / self.total) if self.total else 1.0
        return {
            "total": self.total, "roots": self.roots, "traced": self.traced,
            "structured": self.structured, "sourceless": self.sourceless,
            "traceable_fraction": round(frac, 3),
            "high": high, "med": med,
            "verdict": "FAIL" if high else ("REVIEW" if med else "PASS"),
            "ship_ok": high == 0,
        }


# --------------------------------------------------------------------------- #
# Predicates
# --------------------------------------------------------------------------- #
def _is_root(q: dict) -> bool:
    return str(q.get("source", "")).strip().lower() in ROOT_SOURCES


def _has_detail(q: dict) -> bool:
    return bool(str(q.get("source_detail") or "").strip())


def _lineage_from(q: dict) -> List[str]:
    lin = q.get("lineage")
    if isinstance(lin, dict):
        fr = lin.get("from")
        if isinstance(fr, list):
            return [str(x) for x in fr if x]
        if isinstance(fr, str) and fr.strip():
            return [fr.strip()]
    return []


_NUM_RE = re.compile(r"[a-z][a-z0-9]{2,}")


def _unit_tokens(unit: str) -> set:
    """Tokens of a unit string (≥3 chars), e.g. 'kg/day'→{day}, 'gbp'→{gbp}, '£/MWh'→{mwh},
    'kg co2e'→{co2e}. Subtracted from a key's role tokens so a unit-echo embedded in the key
    name (transpiration_kg_DAY, npv_GBP) doesn't spuriously union unrelated quantities."""
    return set(_NUM_RE.findall(str(unit).lower()))


def _role_tokens(key: str) -> set:
    """Tokens of a quantity key, minus the trailing unit token, for same-role grouping."""
    toks = _NUM_RE.findall(str(key).lower())
    # drop a trailing unit-ish token (kw, kwh, m3, kg, v, a, …) so power keys group by role
    UNITS = {"kw", "kwh", "mwh", "gwh", "wh", "kva", "mva", "v", "kv", "a", "ka",
             "kg", "tonne", "t", "m", "mm", "m2", "m3", "lpm", "l", "bar", "pa",
             "kpa", "mpa", "hz", "rpm", "pct", "percent", "ratio", "yr", "hr", "h"}
    return {t for t in toks if t not in UNITS}


# --------------------------------------------------------------------------- #
# Core audit
# --------------------------------------------------------------------------- #
def _quantities(state: dict) -> Dict[str, dict]:
    oc = state.get("orchestratorContract") or {}
    q = oc.get("quantities") or {}
    return q if isinstance(q, dict) else {}


def audit_provenance(state: dict) -> ProvenanceReport:
    rep = ProvenanceReport()
    q = _quantities(state)
    rep.total = len(q)
    if not q:
        return rep

    keyset = set(q.keys())

    # ---- 1. sourceless / lineage check -------------------------------------
    for key, qty in q.items():
        if not isinstance(qty, dict):
            continue
        froms = _lineage_from(qty)
        if froms:
            rep.structured += 1
            rep.traced += 1
            # ORPHAN: a declared input that doesn't exist as a quantity (and isn't a brief root)
            missing = [f for f in froms
                       if f not in keyset and not f.lower().startswith("brief")]
            if missing:
                rep.findings.append(ProvFinding(
                    key=key, severity="MED", kind="orphan",
                    message=f"'{key}' declares input(s) {missing} that are not quantities — "
                            f"broken lineage edge",
                    value=qty.get("value"), unit=str(qty.get("unit", "")),
                ))
            continue
        if _is_root(qty):
            rep.roots += 1
            continue
        if _has_detail(qty):
            rep.traced += 1   # prose lineage — traceable but not yet structured
            continue
        # No root source, no source_detail, no lineage.from → appears from nowhere.
        rep.sourceless += 1
        rep.findings.append(ProvFinding(
            key=key, severity="HIGH", kind="sourceless",
            message=f"'{key}' = {qty.get('value')} {qty.get('unit','')} has NO recorded origin "
                    f"(source='{qty.get('source','<none>')}', no source_detail, no lineage.from) "
                    f"— it appears from nowhere",
            value=qty.get("value"), unit=str(qty.get("unit", "")),
            detail=str(qty.get("source", "<none>")),
        ))

    # ---- 2. divergence: same physical role, contradictory value ------------
    # Within each UNIT, union quantities that share a non-generic role token (so
    # total_SUPPLY_DEMAND_kw and total_ELECTRICAL_DEMAND_kw join via "demand"), then in
    # each component flag a max/min ratio > the factor (124478 vs 41.3 = a 3000× contradiction).
    rep.findings.extend(_detect_divergences(q))
    return rep


_GENERIC_ROLE = {
    # qualifiers (not a role)
    "total", "max", "min", "peak", "avg", "mean", "nominal", "rated", "design",
    "system", "overall", "gross", "net", "per", "continuous", "the", "installed",
    "available", "target", "rating", "required", "actual", "effective",
    # measurement-type nouns (every quantity of a unit shares these, so they don't
    # discriminate ROLE — only genuine domain tokens like supply/demand/electrical do)
    "area", "cost", "price", "mass", "load", "power", "capacity", "rate", "size",
    "volume", "length", "width", "height", "weight", "value", "flow", "duty",
    "demand_kw",  # never a token, but guard
}


def _detect_divergences(q: Dict[str, dict]) -> List[ProvFinding]:
    out: List[ProvFinding] = []
    by_unit: Dict[str, List[tuple]] = {}
    for key, qty in q.items():
        if not isinstance(qty, dict):
            continue
        v = qty.get("value")
        if not isinstance(v, (int, float)) or v == 0:
            continue
        unit = str(qty.get("unit", "")).strip().lower()
        if not unit:
            continue
        roles = _role_tokens(key) - _GENERIC_ROLE - _unit_tokens(unit)
        if not roles:
            continue
        by_unit.setdefault(unit, []).append((key, float(v), roles))

    for unit, items in by_unit.items():
        if len(items) < 2:
            continue
        # DIRECT pairwise: compare two quantities ONLY if they directly share a non-generic
        # role token (no transitive chaining — that mixed unrelated roles into one component
        # and produced false positives like transpiration↔CO₂ and NPV↔warranty). Report each
        # outlier once, at its worst ratio.
        flagged: Dict[str, tuple] = {}   # hi_key -> (lo_key, ratio, hi, lo)
        n = len(items)
        for i in range(n):
            ki, vi, ri = items[i]
            for j in range(i + 1, n):
                kj, vj, rj = items[j]
                if not (ri & rj):           # must DIRECTLY share a domain role token
                    continue
                hi, lo = (vi, vj) if vi >= vj else (vj, vi)
                hk, lk = (ki, kj) if vi >= vj else (kj, ki)
                if lo > 0 and hi / lo > _DIVERGENCE_FACTOR:
                    prev = flagged.get(hk)
                    if prev is None or (hi / lo) > prev[1]:
                        flagged[hk] = (lk, hi / lo, hi, lo)
        for hk, (lk, ratio, hi, lo) in flagged.items():
            out.append(ProvFinding(
                key=hk, severity="HIGH", kind="divergence",
                message=f"'{hk}' = {hi:g} {unit} and '{lk}' = {lo:g} {unit} are the same "
                        f"physical role but differ {ratio:.0f}× — one is wrong (bad roll-up / "
                        f"unit error); the smaller is usually the real value",
                value=hi, unit=unit,
            ))
    return out


# --------------------------------------------------------------------------- #
# Selftest + CLI
# --------------------------------------------------------------------------- #
def _selftest() -> int:
    fails: List[str] = []

    def expect(c, m):
        if not c:
            fails.append(m)

    # dirty: a sourceless number, a divergence pair, a clean root, a prose-traced one, a structured one
    dirty = {"orchestratorContract": {"quantities": {
        "brief_power_kw":        {"value": 41.3, "unit": "kW", "source": "brief"},
        "total_electrical_demand_kw": {"value": 41.3, "unit": "kW", "source": "calculator",
                                       "source_detail": "Σ pump + dosing motor duties"},
        "total_supply_demand_kw": {"value": 124478.0, "unit": "kW", "source": "design-loop"},  # SOURCELESS + DIVERGENT
        "mystery_mass_kg":       {"value": 999.0, "unit": "kg", "source": ""},                  # SOURCELESS
        "cell_voltage_v":        {"value": 3.2, "unit": "V", "source": "physics_constant"},     # ROOT
        "rack_count":            {"value": 13, "unit": "", "source": "calculator",
                                  "lineage": {"from": ["brief_power_kw"], "via": "round(power/per_rack)"}},  # STRUCTURED
    }}}
    rep = audit_provenance(dirty)
    sc = rep.scorecard()
    expect(sc["verdict"] == "FAIL", f"dirty should FAIL, got {sc['verdict']}")
    expect(sc["sourceless"] == 2, f"expected 2 sourceless (total_supply_demand_kw, mystery_mass_kg), got {sc['sourceless']}")
    expect(any(f.kind == "divergence" for f in rep.findings),
           "should flag the 124478 vs 41.3 divergence")
    expect(any(f.kind == "sourceless" and f.key == "total_supply_demand_kw" for f in rep.findings),
           "total_supply_demand_kw must be flagged sourceless")
    expect(sc["roots"] == 2 and sc["structured"] == 1,
           f"expected 2 roots (brief + physics_constant) + 1 structured, got roots={sc['roots']} structured={sc['structured']}")

    # clean: every number is a root, prose-traced, or structured
    clean = {"orchestratorContract": {"quantities": {
        "brief_power_kw": {"value": 41.3, "unit": "kW", "source": "brief"},
        "load_kw":        {"value": 41.3, "unit": "kW", "source": "calculator",
                           "lineage": {"from": ["brief_power_kw"], "via": "identity"}},
        "cell_v":         {"value": 3.2, "unit": "V", "source": "physics_constant"},
    }}}
    sc2 = audit_provenance(clean).scorecard()
    expect(sc2["verdict"] == "PASS", f"clean should PASS, got {sc2['verdict']} ({sc2})")
    expect(sc2["sourceless"] == 0, f"clean has no sourceless, got {sc2['sourceless']}")

    # orphan: a structured edge pointing at a non-existent quantity
    orphan = {"orchestratorContract": {"quantities": {
        "a": {"value": 1.0, "unit": "kW", "source": "brief"},
        "b": {"value": 2.0, "unit": "kW", "source": "calculator",
              "lineage": {"from": ["does_not_exist"], "via": "x"}},
    }}}
    repo = audit_provenance(orphan)
    expect(any(f.kind == "orphan" for f in repo.findings), "should flag the orphan edge")

    if fails:
        print("provenance selftest FAILED:")
        for m in fails:
            print("  -", m)
        return 1
    print("provenance selftest: OK")
    return 0


def _cli(run_dir: str, enforce: bool) -> int:
    sp = os.path.join(run_dir, "state.json")
    try:
        with open(sp) as fh:
            state = json.load(fh)
    except Exception as e:  # noqa: BLE001
        print(f"provenance: cannot read {sp}: {e}", file=sys.stderr)
        return 2
    rep = audit_provenance(state)
    sc = rep.scorecard()
    print(f"provenance: {sc['total']} quantities · roots {sc['roots']} · traced {sc['traced']} "
          f"· structured {sc['structured']} · SOURCELESS {sc['sourceless']} "
          f"· traceable {sc['traceable_fraction']*100:.0f}% · verdict {sc['verdict']}",
          file=sys.stderr)
    for f in rep.findings[:40]:
        print(f"  [{f.severity}] {f.kind}: {f.message}", file=sys.stderr)
    if len(rep.findings) > 40:
        print(f"  … +{len(rep.findings)-40} more", file=sys.stderr)
    return 1 if (enforce and not sc["ship_ok"]) else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--selftest":
        sys.exit(_selftest())
    elif args and os.path.isdir(args[0]):
        sys.exit(_cli(args[0], enforce="--enforce" in args))
    else:
        print("usage: provenance.py --selftest | <run_dir> [--enforce]", file=sys.stderr)
        sys.exit(2)
