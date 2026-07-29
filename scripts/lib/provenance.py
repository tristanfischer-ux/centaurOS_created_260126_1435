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
    "anchor", "class_anchor", "datasheet", "spec", "specification",
    # Deterministic ENGINE-computed roots — kept in sync with the engine's own
    # accept-list, scripts/lib/orchestrator/aggregator.ts::isValidProvenanceSource
    # (2026-07-12). A device-scale geometry derivation (enclosure_volume_m3 +
    # design_envelope_* from the brief's max_dimensions_mm / mass envelope), an
    # aggregator-delivered capability metric (optical_path_length_mm etc.), an
    # envelope-detector read, or a closure-validator value are legitimate self-
    # documenting origins (their `basis` states the derivation) — NOT sourceless.
    "derived_device_scale", "aggregator", "envelope_detector", "closure_validator",
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
def _quantity_source(q: dict) -> str:
    """The origin tag — top-level `source` first, else the structured `provenance.source`
    (the engine's TypedQuantity carries its origin under `provenance`, e.g. the aggregator/
    device-scale/tool derivations). 2026-07-12: without the provenance fallback every
    provenance-tagged quantity read as sourceless (device enclosure geometry, aggregator
    capability metrics, tool outputs)."""
    src = str(q.get("source", "") or "").strip().lower()
    if not src:
        prov = q.get("provenance")
        if isinstance(prov, dict):
            src = str(prov.get("source", "") or "").strip().lower()
    return src


def _is_root(q: dict) -> bool:
    src = _quantity_source(q)
    # a tool:<id> source IS a recorded origin — the tool run is the lineage.
    return src in ROOT_SOURCES or src.startswith("tool:")


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


def _tool_claim_index(run_dir: Optional[str]) -> Dict[str, List[float]]:
    """{quantity_key_lower: [claimed values]} from the run's RECORDED tool invocations
    (4-orchestrator-tools-used.json — the engine's own 'this verified tool computed this
    number' record). A quantity whose value matches a recorded claim by ITS OWN name has
    a recorded origin: the tool run. The audit under-read the run's provenance surfaces
    before this (BESS cross-val 2026-07-03: all 22 'sourceless' quantities were exact
    pybamm/pandapower/ngspice/coolprop claims on disk) — a false-UNVERIFIED is as
    dishonest as a false-PASS. Value must MATCH (2%): a stale claim is NOT a lineage."""
    idx: Dict[str, List[float]] = {}
    if not run_dir:
        return idx
    try:
        with open(os.path.join(run_dir, "4-orchestrator-tools-used.json")) as fh:
            tu = json.load(fh)
    except Exception:  # noqa: BLE001
        return idx
    for t in (tu.get("tools") or []) if isinstance(tu, dict) else []:
        for c in (t.get("claims") or []):
            v = c.get("value")
            if not isinstance(v, (int, float)):
                continue
            for k in (c.get("field"), c.get("output_field")):
                if k:
                    idx.setdefault(str(k).strip().lower(), []).append(float(v))
    return idx


def audit_provenance(state: dict, run_dir: Optional[str] = None) -> ProvenanceReport:
    rep = ProvenanceReport()
    q = _quantities(state)
    rep.total = len(q)
    if not q:
        return rep

    keyset = set(q.keys())
    claims = _tool_claim_index(run_dir)

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
        # TOOL-CLAIM ORIGIN: the run's recorded tool invocations claim this exact key
        # with a MATCHING value (2%) → the origin IS recorded (the tool run), just not
        # restated on the quantity. Traced. A claim whose value DISAGREES does not
        # credit — a stale tool output is deterministic_checks_lib's STALE catch, not
        # a lineage.
        v = qty.get("value")
        if isinstance(v, (int, float)) and any(
                abs(float(v) - cv) <= max(abs(cv) * 0.02, 0.01)
                for cv in claims.get(key.strip().lower(), [])):
            rep.traced += 1
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
    # INTENT (2026-07-29 Formula E front FPK Calculations HIGH): race-pack
    # fia_net_usable_energy_kwh (~25 kWh) and vignette duty_loss_energy_kwh
    # (~0.17 kWh) shared only the measurement noun 'energy' after generic strip
    # and false-flagged 150×. Domain tokens (fia/usable vs electrical/loss stem)
    # discriminate — same pattern as power/mass above.
    "energy",
    # INTENT (cell-cycler cold-v15 Calculations HIGH): instrument aggregate thermal
    # duty (max_simultaneous_dissipation_w = 200 W) and a per-channel shunt resistor
    # loss (channel_shunt_dissipation_w = 0.5 W) share only the measurement noun
    # 'dissipation' — different physical roles (system heat vs sense-element I²R).
    # Domain tokens (simultaneous/aggregate vs shunt/channel) discriminate.
    "dissipation", "dissipated", "loss",
    "demand_kw",  # never a token, but guard
    # device-type + flow-descriptor nouns — shared across UNRELATED equipment, so they don't
    # discriminate ROLE either. A metering pump and a circulation pump are both "dosing pumps" but
    # legitimately differ ~1000× in flow; without this the check paired the 0.04 m³/h acid metering
    # pump with the 45 m³/h circulation pump and false-flagged the real difference (Tristan 2026-06-30).
    "pump", "valve", "tank", "vessel", "skid", "unit", "motor", "filter", "blower", "fan",
    "mixer", "agitator", "sensor", "transmitter", "exchanger", "column", "tower", "compressor",
    # INTENT (2026-07-29 Formula E MGU Calculations HIGH): nameplate throughput
    # (traction_inverter_power_kw = 350) and loss/heat (inverter_dissipated_kw ≈ 2.7)
    # shared only the device noun 'inverter' after generic strip and false-flagged
    # 128×. Same pattern as motor/pump above — device type ≠ physical role.
    "inverter", "converter", "rectifier", "pcs", "mgu", "mcu", "drive",
    "dosing", "metering", "throughput", "transfer", "circulation", "recirc", "feed", "pressure",
    # location / zone qualifiers (Codema ship 2026-07-08 P2-J): 'nursery' is a WHERE, not a
    # WHAT — nursery_acid_dosing (0.04 m³/h metering) and nursery_fertigation (45 m³/h
    # circulation) share only 'nursery' and were false-flagged 1125× same-role. Same for
    # department/zone/main/backup labels that locate equipment without identifying the role.
    "nursery", "department", "zone", "main", "primary", "secondary", "backup", "standby",
    "spare", "duty", "train", "skid",
    # per-unit / each / count vocabulary (Codema ship 2026-07-08): fresh_water_tank_volume_each_m3
    # (91 m³ reservoir) and nutrient_tank_volume_each_m3 (1 m³ stock tank) share only 'each'
    # after tank/volume are stripped — they are different vessels, not a same-role pair.
    "each", "unit", "count", "qty", "number",
    # vessel-class nouns (codema-full-20260709-1508 Quantities HIGH): a galvanised STORAGE
    # RESERVOIR (91–455 m³ delivered) and a concrete DRAIN COLLECTION SUMP / PIT (5 m³ each)
    # share only 'drain'+'water' after generic strip — they are different vessel classes in
    # the same recovery train, not a same-role contradiction. 'delivered' is a roll-up
    # qualifier (mintDemandCoverage `_delivered_m3`), not a role.
    "reservoir", "sump", "pit", "buffer", "storage", "collection", "delivered",
    # electrical measurement-type nouns (BESS cross-val 2026-07-03): every *_voltage_* /
    # *_current_* quantity of the unit shares these, so they don't discriminate ROLE —
    # a 3.2 V CELL and a 1500 V DC BUS are different roles BY DESIGN (469 in series),
    # exactly as 'power'/'mass' above; only the genuine domain token (cell/bus/string)
    # discriminates.
    "voltage", "volt", "current", "amperage", "frequency",
    # temperature measurement-type nouns (NinjaPCR / thermocycler 2026-07-15): every
    # *_temp_* / *_temperature_* quantity of the unit shares these, so they don't
    # discriminate ROLE — heatsink_base_temp_c (109 °C absolute) and
    # calculated_temp_spread_c (0.5 °C delta) are DIFFERENT physical roles that only
    # shared the spurious token 'temp' and false-flagged 218×. Domain tokens
    # (heatsink/base vs spread/delta) discriminate; see _temperature_kind.
    "temp", "temperature", "celsius", "kelvin",
    # UNIT-PHRASE time words spelled out INSIDE a key name (CO2-mineralisation cross-val
    # 2026-07-06): a key like 'flue_gas_flow_m3_per_hour' encodes its unit as literal
    # tokens ('per', 'hour') rather than in the `unit` field ('m³/h' has no letter run
    # ≥3 chars for `_unit_tokens` to strip). 'per' was already generic; 'hour' (and its
    # day/week/month/year/minute/second siblings) were NOT, so any two *_per_hour /
    # *_per_day quantities shared 'hour'/'day' as a spurious "role" regardless of what
    # they actually measure — flue_gas_flow_m3_per_hour (a GAS volumetric flow) and
    # mea_circulation_m3_per_hour (a LIQUID circulation flow) unioned on 'hour' alone and
    # false-flagged a 331× "divergence" between two genuinely different physical
    # quantities. These are unit vocabulary, never a domain discriminator — universal
    # across any '<qty>_per_<time>' naming convention, not CO2-specific.
    "hour", "hours", "day", "days", "week", "weeks", "month", "months",
    "year", "years", "minute", "minutes", "second", "seconds",
}

# Aggregate qualifiers: a key carrying one of these is a SYSTEM ROLL-UP of a same-role
# per-unit quantity (total_cell_mass_kg = cell_mass_kg × cell_count). A roll-up and its
# per-unit basis legitimately differ by the unit COUNT — that is a consistent design,
# not a contradiction. Two AGGREGATES that disagree (total_supply_demand 124,478 vs
# total_electrical_demand 41.3 — the original catch) still flag: both carry the qualifier.
# 'lifecycle' / 'cradle_to_grave' / 'whole_life' (CO2-mineralisation cross-val 2026-07-05):
# a plant's CRADLE-TO-GRAVE total (embodied materials + years of operational emissions) is
# the SAME roll-up relation as total_cell_mass vs cell_mass — it legitimately dwarfs its
# EMBODIED (materials-only) component by the operating-years multiplier, not a contradiction.
_AGGREGATE_QUALIFIERS = {"total", "overall", "gross", "system", "aggregate", "sum", "combined",
                         "lifecycle", "cradle", "grave", "wholelife"}


def _is_aggregate(key: str) -> bool:
    return bool(_AGGREGATE_QUALIFIERS & set(_NUM_RE.findall(str(key).lower())))


# GEOMETRIC-DIMENSION roles (CO2-mineralisation v2 cross-val 2026-07-05): 'height' was
# already a GENERIC measurement noun (stripped from the role set entirely, alongside mass/
# power/area), while 'diameter' was NOT — so an equipment stem shared between a height
# quantity and a diameter quantity (both 'absorber_*') fell through to the stem token alone
# ('absorber') as the "role", merging two DIFFERENT geometric axes of the SAME vessel into
# one false divergence (24.5 m tan-to-tan height vs 0.2346 m diameter — a 104× "contradiction"
# that is just two different dimensions of one column). A vessel's height/length and its
# diameter/width are NEVER the same physical role, however tightly their equipment stem
# matches — so when EITHER key carries a dimension-family token, the two keys may only be
# compared if they carry the SAME dimension family (a real same-axis divergence, e.g. two
# competing HEIGHT claims for the same vessel, must still flag).
_DIMENSION_GROUPS = {
    "height": {"height", "ht", "tt", "tan", "tall", "length"},
    "diameter": {"diameter", "dia", "id", "od"},
    "width": {"width", "wide"},
}


def _dimension_group(key: str) -> Optional[str]:
    toks = set(_NUM_RE.findall(str(key).lower()))
    for group, members in _DIMENSION_GROUPS.items():
        if toks & members:
            return group
    return None


# VESSEL-CLASS roles (codema-full-20260709-1508 Quantities HIGH): a STORAGE RESERVOIR
# and a COLLECTION SUMP/PIT in the same drain train share 'drain' but are different
# vessel classes — never a same-role contradiction. Same pattern as geometric axes:
# when EITHER key carries a vessel-class token, only compare if they share the SAME class.
_VESSEL_CLASS_GROUPS = {
    "reservoir": {"reservoir", "buffer", "storage"},
    "sump": {"sump", "pit"},
    "stock_tank": {"stock", "daytank", "day_tank"},
}


def _vessel_class_group(key: str) -> Optional[str]:
    toks = set(_NUM_RE.findall(str(key).lower()))
    for group, members in _VESSEL_CLASS_GROUPS.items():
        if toks & members:
            return group
    return None


# TEMPERATURE kinds (NinjaPCR 2026-07-15): an ABSOLUTE temperature (heatsink base,
# junction, ambient) and a DELTA / spread / uniformity are NEVER the same physical
# role — they share only the measurement noun 'temp' after generic strip.
# INTENT (P5 floor-9 / cell-cycler cold-v17): stability/tolerance/accuracy are
# control-band deltas (±0.5 °C), not absolute setpoints — cell_bay_temp_max_c
# (45 °C) vs cell_bay_temp_stability_c (0.5 °C) share only {cell,bay} after
# generic strip and false-flagged 90× as "same physical role".
_TEMP_DELTA_TOKENS = {
    "spread", "delta", "rise", "drop", "uniformity", "gradient", "diff",
    "stability", "tolerance", "ripple", "accuracy", "precision", "band",
}
_TEMP_ABS_HINT = {"temp", "temperature", "celsius", "kelvin", "degc", "deg"}


def _temperature_kind(key: str) -> Optional[str]:
    toks = set(_NUM_RE.findall(str(key).lower()))
    if not (toks & _TEMP_ABS_HINT) and not (toks & _TEMP_DELTA_TOKENS):
        return None
    if toks & _TEMP_DELTA_TOKENS:
        return "delta"
    return "absolute"


# RANGE bounds (sample_temp_min vs sample_temp_max): both are absolute °C of the
# same stem but opposite ends of a stated operating range — never a contradiction.
_RANGE_BOUND_GROUPS = {
    "min_bound": {"min", "minimum", "low", "lower"},
    "max_bound": {"max", "maximum", "high", "upper"},
}


def _range_bound_group(key: str) -> Optional[str]:
    toks = set(_NUM_RE.findall(str(key).lower()))
    for group, members in _RANGE_BOUND_GROUPS.items():
        if toks & members:
            return group
    return None


def _detect_divergences(q: Dict[str, dict]) -> List[ProvFinding]:
    out: List[ProvFinding] = []
    by_unit: Dict[str, List[tuple]] = {}
    for key, qty in q.items():
        if not isinstance(qty, dict):
            continue
        # NAMESPACED BREAKDOWN LISTS (co2 one-mint, 2026-07-06): a key like
        # 'electrical_consumer__<slug>_kw' is one entry of a deliberate per-consumer
        # breakdown whose entries are DISTINCT BY CONSTRUCTION (a crystalliser at 80 kW and
        # a pump at 0.75 kW are SUPPOSED to differ). They all share the 'electrical'+
        # 'consumer' namespace tokens, so the same-role divergence check false-flagged every
        # pair. The list's own invariant (Σ == connected_electrical_load_kw) is checked by
        # the load_reconcile gate + a by-construction proveCatch — not here. Skip the namespace.
        if str(key).lower().startswith("electrical_consumer__"):
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
        by_unit.setdefault(unit, []).append(
            (key, float(v), roles, _dimension_group(key), _vessel_class_group(key),
             _temperature_kind(key), _range_bound_group(key)),
        )

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
            ki, vi, ri, di, vi_cls, ti, bi = items[i]
            for j in range(i + 1, n):
                kj, vj, rj, dj, vj_cls, tj, bj = items[j]
                if di and dj and di != dj:
                    # a HEIGHT-family quantity and a DIAMETER/WIDTH-family quantity are
                    # distinct geometric roles even when they share an equipment-stem token
                    # (absorber_column_height_tt_m vs absorber_diameter_m both carry
                    # 'absorber' but measure orthogonal axes of the same vessel) — never
                    # a same-role contradiction, regardless of stem overlap.
                    continue
                if (vi_cls or vj_cls) and vi_cls != vj_cls:
                    # a STORAGE RESERVOIR and a COLLECTION SUMP/PIT share 'drain' but are
                    # different vessel classes — never a same-role contradiction.
                    continue
                if ti and tj and ti != tj:
                    # absolute temperature vs delta/spread — never same role.
                    continue
                if bi and bj and bi != bj:
                    # operating-range min vs max of the same stem — never a contradiction.
                    continue
                if not (ri & rj):           # must DIRECTLY share a domain role token
                    continue
                if _is_aggregate(ki) != _is_aggregate(kj):
                    # a TOTAL vs its PER-UNIT basis (total_cell_mass vs cell_mass) is a
                    # roll-up relation, not a same-role contradiction — skip. Two
                    # aggregates (or two per-unit values) that disagree still flag.
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

    # PROVENANCE-SUB-OBJECT ORIGIN guard (2026-07-12, colorimeter): the engine's TypedQuantity
    # records its origin under `provenance.source` (NOT a top-level `source`) — a device-scale
    # geometry derivation, an aggregator capability metric, a tool output. Each must read as a
    # recorded ROOT/traced origin, never sourceless (before the fix all 4+ read sourceless).
    provq = {"orchestratorContract": {"quantities": {
        "enclosure_volume_m3":       {"value": 0.0013, "unit": "m³", "provenance": {"source": "derived_device_scale"}},
        "optical_path_length_mm":    {"value": 10.0, "unit": "mm", "provenance": {"source": "aggregator"}},
        "led_current_kp":            {"value": 2.6, "unit": "", "provenance": {"source": "tool:control-systems:pid-tuning"}},
        "still_sourceless_kg":       {"value": 5.0, "unit": "kg", "source": ""},  # genuinely sourceless — MUST still flag
    }}}
    _pr = audit_provenance(provq)
    expect(_pr.sourceless == 1, f"only the genuinely-sourceless quantity should flag; got sourceless={_pr.sourceless}")
    expect(any(f.kind == "sourceless" and f.key == "still_sourceless_kg" for f in _pr.findings),
           "the genuinely sourceless quantity MUST still be flagged (fix is not a blanket pass)")

    # DEVICE-ROLE guard (Tristan 2026-06-30): two DIFFERENT devices that merely share a generic device/
    # flow noun (a 0.04 m³/h acid METERING pump vs a 45 m³/h CIRCULATION pump — both "dosing pumps") must
    # NOT be flagged as a divergent same-role pair; only a SPECIFIC shared role (acid↔acid) discriminates.
    pumps = {"orchestratorContract": {"quantities": {
        "acid_dosing_pump_throughput_m3_h":        {"value": 0.04, "unit": "m³/h", "source": "brief"},
        "chemical_dosing_pump_throughput_m3_h":    {"value": 0.04, "unit": "m³/h", "source": "brief"},
        "fertigation_dosing_pump_throughput_m3_h": {"value": 45.0, "unit": "m³/h", "source": "brief"},
        "drain_transfer_pump_throughput_m3_h":     {"value": 45.0, "unit": "m³/h", "source": "brief"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(pumps).findings),
           "a metering pump and a circulation pump (different devices) must NOT be flagged divergent")

    # DEVICE-TYPE guard (2026-07-29 MGU Calculations): nameplate throughput vs loss/heat
    # sharing only 'inverter' must NOT false-flag (350 kW vs 2.7 kW).
    inv = {"orchestratorContract": {"quantities": {
        "traction_inverter_power_kw": {"value": 350.0, "unit": "kW", "source": "brief"},
        "inverter_dissipated_kw": {"value": 2.7283, "unit": "kW", "source": "tool:inverter:sic-loss",
                                   "source_detail": "SiC bridge conduction+switching loss"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(inv).findings),
           "inverter nameplate vs inverter dissipation must NOT be flagged same-role divergent")

    # LOCATION-QUALIFIER guard (Codema ship 2026-07-08): two different devices that only
    # share a location token ('nursery') must NOT be flagged — nursery acid metering vs
    # nursery fertigation circulation legitimately differ ~1000×.
    nursery = {"orchestratorContract": {"quantities": {
        "nursery_acid_dosing_pump_throughput_m3_h":        {"value": 0.04, "unit": "m³/h", "source": "brief"},
        "nursery_fertigation_dosing_pump_throughput_m3_h": {"value": 45.0, "unit": "m³/h", "source": "brief"},
        "nursery_cloth_filter_throughput_m3_h":            {"value": 45.0, "unit": "m³/h", "source": "brief"},
        "nursery_pump_flow_m3_per_hr":                     {"value": 45.0, "unit": "m³/h", "source": "brief"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(nursery).findings),
           "nursery location alone must NOT make acid metering and fertigation circulation 'same role'")

    # VESSEL-CLASS guard (codema-full-20260709-1508): a drain STORAGE RESERVOIR (delivered
    # total) and a drain COLLECTION SUMP (per-pit volume) share 'drain'+'water' but are
    # different vessel classes — must NOT flag. Two competing reservoir claims still flag.
    vessels = {"orchestratorContract": {"quantities": {
        "drain_water_reservoir_delivered_m3": {
            "value": 455.0, "unit": "m3", "source": "demand-coverage",
            "source_detail": "Σ drain_water_tank volumes (test fixture)",
        },
        "nursery_drain_reservoir_delivered_m3": {
            "value": 364.0, "unit": "m3", "source": "demand-coverage",
            "source_detail": "Σ nursery drain reservoir volumes (test fixture)",
        },
        "drain_collection_sump_volume_each_m3": {"value": 5.0, "unit": "m3", "source": "brief"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(vessels).findings),
           "drain reservoir (storage) vs drain collection sump (pit) must NOT be same-role")
    same_reservoir = {"orchestratorContract": {"quantities": {
        "drain_water_reservoir_delivered_m3": {
            "value": 455.0, "unit": "m3", "source": "demand-coverage",
            "source_detail": "Σ drain_water_tank volumes (test fixture)",
        },
        "drain_water_reservoir_volume_m3": {"value": 5.0, "unit": "m3", "source": "brief"},
    }}}
    expect(any(f.kind == "divergence" for f in audit_provenance(same_reservoir).findings),
           "two competing drain_water_reservoir claims that disagree must still flag")

    # UNIT-PHRASE TIME-WORD guard (CO2-mineralisation cross-val 2026-07-06, both
    # directions): a GAS flow and a LIQUID circulation flow named '..._per_hour' must
    # NOT cluster merely because 'hour' is spelled out in both key names — they carry no
    # genuine shared domain token (flue/gas vs mea). Two truly same-role '..._per_hour'
    # values (same domain token) must still flag.
    per_hour = {"orchestratorContract": {"quantities": {
        "flue_gas_flow_m3_per_hour":        {"value": 225.0, "unit": "m³/h", "source": "brief"},
        "flue_gas_blower_flow_m3_per_hour": {"value": 225.0, "unit": "m³/h", "source": "brief"},
        "mea_circulation_m3_per_hour":      {"value": 0.68, "unit": "m³/h", "source": "brief"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(per_hour).findings),
           "flue-gas flow and MEA circulation ('..._per_hour' siblings) must NOT be "
           "flagged divergent merely because 'hour' is spelled out in both key names")
    same_role_per_hour = {"orchestratorContract": {"quantities": {
        "mea_circulation_m3_per_hour":       {"value": 0.68, "unit": "m³/h", "source": "brief"},
        "mea_makeup_circulation_m3_per_hour": {"value": 68.0, "unit": "m³/h", "source": "brief"},
    }}}
    expect(any(f.kind == "divergence" for f in audit_provenance(same_role_per_hour).findings),
           "two genuinely same-role ('mea') '..._per_hour' values must still cluster/flag")

    # ELECTRICAL-ARCHETYPE role guards (BESS cross-val 2026-07-03, both directions):
    # a 3.2 V cell vs its 1500 V series bus, and a per-cell mass vs its ×6097 system
    # total, are DESIGN relations — never divergences. Two same-role AGGREGATES that
    # contradict must STILL flag (the original 124,478-vs-41.3 catch, asserted above).
    bess = {"orchestratorContract": {"quantities": {
        "cell_voltage_v":         {"value": 3.2, "unit": "V", "source": "datasheet"},
        "dc_bus_voltage_v":       {"value": 1500, "unit": "V", "source": "brief"},
        "string_voltage_nominal_v": {"value": 1500.8, "unit": "V", "source": "brief"},
        "cell_mass_kg":           {"value": 5.3, "unit": "kg", "source": "datasheet"},
        "total_cell_mass_kg":     {"value": 32314.1, "unit": "kg", "source": "brief"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(bess).findings),
           "cell-vs-bus voltage and per-cell-vs-total mass are design roll-ups, not divergences")
    twin_totals = {"orchestratorContract": {"quantities": {
        "total_supply_demand_kw":     {"value": 124478.0, "unit": "kW", "source": "brief"},
        "total_electrical_demand_kw": {"value": 41.3, "unit": "kW", "source": "brief"},
    }}}
    expect(any(f.kind == "divergence" for f in audit_provenance(twin_totals).findings),
           "two contradicting same-role AGGREGATES must still flag (the original catch)")

    # GEOMETRIC-DIMENSION role guard (CO2-mineralisation v2 cross-val 2026-07-05, both
    # directions): a vessel's HEIGHT and its DIAMETER are different geometric axes and must
    # NEVER cluster merely because they share an equipment-stem token; two competing claims
    # for the SAME axis (both height) must still flag.
    dims = {"orchestratorContract": {"quantities": {
        "absorber_column_height_tt_m": {"value": 24.5, "unit": "m", "source": "brief"},
        "absorber_diameter_m":         {"value": 0.2346, "unit": "m", "source": "brief"},
        "absorber_packed_height_m":    {"value": 20.0, "unit": "m", "source": "brief"},
        "stripper_column_height_m":    {"value": 12.0, "unit": "m", "source": "brief"},
        "stripper_diameter_m":         {"value": 0.2288, "unit": "m", "source": "brief"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(dims).findings),
           "a vessel's height/tan-to-tan and its diameter must NOT cluster as the same "
           "geometric role, even on the same equipment stem (absorber/stripper)")
    same_axis = {"orchestratorContract": {"quantities": {
        "absorber_column_height_tt_m": {"value": 24.5, "unit": "m", "source": "brief"},
        "absorber_shell_height_m":     {"value": 0.2, "unit": "m", "source": "brief"},
    }}}
    expect(any(f.kind == "divergence" for f in audit_provenance(same_axis).findings),
           "two genuinely same-axis (both HEIGHT) absorber claims that disagree 122x must "
           "still flag — the dimension-group guard must not swallow real height-vs-height "
           "divergences")

    # TEMPERATURE absolute-vs-delta guard (NinjaPCR 2026-07-15): heatsink_base_temp
    # (absolute °C) and calculated_temp_spread (delta °C) must NOT cluster merely
    # because both carry 'temp'. Two competing absolute heatsink-base claims still flag.
    # sample_temp_min vs sample_temp_max is an operating-range pair — also not a
    # same-role contradiction.
    temps = {"orchestratorContract": {"quantities": {
        "heatsink_base_temp_c": {"value": 109.0, "unit": "degC", "source": "tool"},
        "calculated_temp_spread_c": {"value": 0.5, "unit": "degC", "source": "tool"},
        "sample_temp_min_c": {"value": 4.0, "unit": "degC", "source": "brief"},
        "sample_temp_max_c": {"value": 99.0, "unit": "degC", "source": "brief"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(temps).findings),
           "heatsink absolute temp vs temp-spread delta, and sample min vs max, "
           "must NOT be flagged as same-role divergences")
    same_heatsink = {"orchestratorContract": {"quantities": {
        "heatsink_base_temp_c": {"value": 109.0, "unit": "degC", "source": "tool"},
        "heatsink_hot_side_base_temp_c": {"value": 0.5, "unit": "degC", "source": "tool"},
    }}}
    expect(any(f.kind == "divergence" for f in audit_provenance(same_heatsink).findings),
           "two competing heatsink-base absolute temperatures that disagree must still flag")

    # TEMPERATURE envelope-vs-stability guard (cell-cycler cold-v17 Calculations):
    # bay operating max (45 °C absolute) vs bay control stability (±0.5 °C delta)
    # share stem tokens {cell,bay} — must NOT cluster. Two competing bay-max
    # absolutes still flag.
    bay_env = {"orchestratorContract": {"quantities": {
        "cell_bay_temp_min_c": {"value": 15.0, "unit": "degC", "source": "brief"},
        "cell_bay_temp_max_c": {"value": 45.0, "unit": "degC", "source": "brief"},
        "cell_bay_temp_stability_c": {"value": 0.5, "unit": "degC", "source": "brief"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(bay_env).findings),
           "bay temp min/max envelope vs bay stability band must NOT be same-role "
           "(absolute setpoint vs control delta)")
    same_bay_max = {"orchestratorContract": {"quantities": {
        "cell_bay_temp_max_c": {"value": 45.0, "unit": "degC", "source": "brief"},
        "cell_bay_hot_side_temp_max_c": {"value": 0.5, "unit": "degC", "source": "brief"},
    }}}
    expect(any(f.kind == "divergence" for f in audit_provenance(same_bay_max).findings),
           "two competing bay-max absolute temperatures that disagree must still flag")

    # LIFECYCLE-vs-EMBODIED aggregate guard (CO2-mineralisation v2 cross-val 2026-07-05):
    # a cradle-to-grave lifecycle total (embodied + years of operation) legitimately dwarfs
    # its embodied (materials-only) component — a roll-up relation, not a contradiction.
    lifecycle = {"orchestratorContract": {"quantities": {
        "plant_lifecycle_co2_t": {"value": 3412.24, "unit": "t", "source": "brief"},
        "plant_embodied_co2_t":  {"value": 30.6, "unit": "t", "source": "brief"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(lifecycle).findings),
           "a plant's lifecycle (cradle-to-grave) CO2 total and its embodied-only component "
           "are a roll-up relation, not a same-role contradiction")

    # DISSIPATION measurement-noun guard (cell-cycler cold-v15 Calculations):
    # aggregate instrument heat (200 W) vs channel shunt I²R (0.5 W) share only
    # 'dissipation' — must NOT flag. Two competing aggregate thermal claims still flag.
    dissip = {"orchestratorContract": {"quantities": {
        "max_simultaneous_dissipation_w": {"value": 200.0, "unit": "W", "source": "brief"},
        "channel_shunt_dissipation_w": {"value": 0.5, "unit": "W", "source": "calculator"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(dissip).findings),
           "aggregate instrument dissipation vs channel shunt dissipation must NOT "
           "cluster merely because both carry the measurement noun 'dissipation'")

    # ENERGY measurement-noun guard (Formula E front FPK 2026-07-29):
    # FIA race-pack usable energy (~25 kWh) vs vignette duty loss (~0.17 kWh)
    # share only 'energy' — must NOT flag. Two competing FIA usable claims still flag.
    fe_energy = {"orchestratorContract": {"quantities": {
        "fia_net_usable_energy_kwh": {"value": 25.26, "unit": "kWh", "source": "tool"},
        "duty_loss_energy_kwh": {"value": 0.168, "unit": "kWh", "source": "tool"},
        "duty_net_electrical_energy_kwh": {"value": 1.34, "unit": "kWh", "source": "tool"},
    }}}
    expect(not any(f.kind == "divergence" for f in audit_provenance(fe_energy).findings),
           "FIA usable energy vs duty vignette loss/electrical must NOT cluster on "
           "the measurement noun 'energy' alone")
    same_fia = {"orchestratorContract": {"quantities": {
        "fia_net_usable_energy_kwh": {"value": 25.26, "unit": "kWh", "source": "tool"},
        "fia_pack_usable_energy_kwh": {"value": 0.17, "unit": "kWh", "source": "tool"},
    }}}
    expect(any(f.kind == "divergence" for f in audit_provenance(same_fia).findings),
           "two competing FIA usable-energy claims that disagree must still flag")
    # GOTCHA: total_* is an aggregate qualifier vs max_* (per-unit/peak) — that
    # pair is skipped by the roll-up guard. Use two non-aggregate keys that share
    # the domain token 'simultaneous' so the catch stays live.
    same_agg_dissip = {"orchestratorContract": {"quantities": {
        "max_simultaneous_dissipation_w": {"value": 200.0, "unit": "W", "source": "brief"},
        "peak_simultaneous_dissipation_w": {"value": 0.5, "unit": "W", "source": "calculator"},
    }}}
    expect(any(f.kind == "divergence" for f in audit_provenance(same_agg_dissip).findings),
           "two competing simultaneous dissipation claims that disagree must still flag")

    # TOOL-CLAIM ORIGIN (both directions): a quantity matching the run's recorded tool
    # claim is TRACED (the tool run IS its recorded origin); a claim whose value
    # DISAGREES does not credit (stale ≠ lineage → still sourceless).
    import tempfile
    tool_state = {"orchestratorContract": {"quantities": {
        "cell_count":   {"value": 6097, "unit": ""},                # claim matches → traced
        "rack_count":   {"value": 14, "unit": ""},                  # claim says 13 → sourceless
    }}}
    with tempfile.TemporaryDirectory() as td:
        with open(os.path.join(td, "4-orchestrator-tools-used.json"), "w") as fh:
            json.dump({"tools": [{"tool_id": "pybamm:cell-sizing", "claims": [
                {"field": "cell_count", "value": 6097, "output_field": "cell_count"},
                {"field": "rack_count", "value": 13, "output_field": "rack_count"},
            ]}]}, fh)
        rep_t = audit_provenance(tool_state, run_dir=td)
        keys_sourceless = {f.key for f in rep_t.findings if f.kind == "sourceless"}
        expect("cell_count" not in keys_sourceless,
               "a quantity matching a recorded tool claim has an origin (the tool run) — traced")
        expect("rack_count" in keys_sourceless,
               "a quantity DISAGREEING with its tool claim must stay sourceless (stale ≠ lineage)")
    # without a run_dir nothing is credited (pure-state behaviour unchanged)
    expect({f.key for f in audit_provenance(tool_state).findings if f.kind == "sourceless"}
           == {"cell_count", "rack_count"},
           "no run_dir → no tool-claim crediting (behaviour unchanged)")

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
    rep = audit_provenance(state, run_dir=run_dir)
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
