#!/usr/bin/env python3
"""
deterministic_checks_lib.py — the SHARED, pure-arithmetic verification library
for a ForgeOS run.

WHY THIS EXISTS
    The semantic physics critic (an LLM) is slow (it sits inside a ~45-minute
    chain) and it HALLUCINATES on correct deterministic designs — it once read a
    pump "10x undersizing" out of a per-tank branch flow (13,360 / 10 tanks) when
    the pump word x8 @ 97 kW was, in fact, correct. A number is only trustworthy
    if you can WATCH it be computed. Every check here is therefore:

      * PURE DETERMINISTIC ARITHMETIC — no LLM, no network, cannot hallucinate.
      * UNIVERSAL — no ``if ras`` and no hardcoded class values. Every ``expected``
        is derived from an AUTHORITATIVE source already in the run:
          - a contract quantity            (orchestratorContract.quantities)
          - the Bill of Materials itself   (requirementsBom / parts-ledger)
          - a distributor / estimate price (state.partVerifications)
          - a geometric / physical relation stated in the run's own data
      * SELF-SKIPPING — when a check's inputs are absent it returns status "N/A"
        and is excluded from the pass/fail tally, so the suite stays universal
        across product classes (a class with no chiller simply skips the chiller
        adequacy check; a class with no electrical bus skips the breaker check).

    Two deliverables share THIS one library so they can never diverge:
      1. scripts/deterministic-checks.py  — a standalone CLI (runs in seconds).
      2. scripts/build-excel-export.py    — the workbook's "Checks" tab renders
         the SAME checks as live Excel formulas.

THE CHECK FAMILIES (all pure arithmetic)
    CONSISTENCY  per-unit x count == authoritative contract/BoM total;
                 Sigma sub-component GBP == principal line GBP;
                 an emitted principal word's rating == the quantity it derives from.
    ADEQUACY     rating >= duty: pump motor kW >= hydraulic/eta; main breaker A >=
                 connected_kW.1000/(sqrt3.V.PF).1.25; cable CSA >= its current;
                 vessel/tank volume > media (MBBR) fill volume; chiller/heat-pump
                 capacity >= duty.
    BALANCE      mass in == out; energy/thermal in == out; flow continuity
                 (Sigma branch == main loop) — where decomposable from state.
    COST         each BoM unit GBP within a sane band (flag > 5x) of its
                 partVerifications distributor/estimate price (catches the
                 Grundfos UP15-42 at 67,900 vs estimate ~1,951); Sigma BoM lines
                 == cover / grand total.
    CONNECTIVITY count connection-schedule rows with within_spec == false
                 (e.g. DN300 @ 7.6 m/s) as a FAIL tally; plus a derived
                 velocity-vs-stated-limit adequacy check per pipe spec.

DATA MODEL (documented in build-excel-export.py; re-stated for the parts read here)
    state.orchestratorContract.quantities : DICT name -> {value,unit,family,...}
    state.requirementsBom                 : LIST of {tag,requirement,status,part,
                                            qty,unit_gbp,line_gbp,basis}. The
                                            parts-ledger grand_total_gbp is exactly
                                            Sigma requirementsBom.line_gbp.
    state.partVerifications               : LIST of {word_id,word_name,manufacturer,
                                            part_number, price_estimate_gbp,
                                            distributor_price_gbp,
                                            cost_repair_corrected_price_gbp, ...}
    state.orchestratorContract.closures   : engine's own balance closures.
    parts-ledger.json  equipment[]        : {tag,name,qty,unit_gbp,line_gbp,
                                            subcomponents,subcomponent_gbp,
                                            requirement,basis}
    connection-schedule.json rows[]       : {mechanism,from,to,rating,size,drop,
                                            within_spec,line_total_gbp,...}
                            specs[]        : per-run {kind,spec_limit,
                                            drop_pct_or_velocity,within_spec,...}

British spelling throughout.
"""

from __future__ import annotations

import json
import math
import os
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

PASS = "PASS"
FAIL = "FAIL"
NA = "N/A"

# Cost-band multiplier: a BoM unit price diverging by more than this factor (in
# either direction) from its distributor/estimate price is flagged. Mirrors the
# chain gate-21 ">5x = HIGH" rule so the two layers agree.
COST_BAND_FACTOR = 5.0

# Magnitude sanity ceiling for the "rating >= duty x margin" ADEQUACY family
# (2026-07-02, v55): a rating more than 100x its duty is not an adequate device,
# it is a corrupt quantity being waved through (incomer 184,166,200 kVA on a 53 kW
# load "PASSed" the >= 66.25 kVA floor). Generous by design — real engineering
# margins sit at 1.25-3x, so x100 can never false-positive a legitimate design.
MAGNITUDE_CEILING_FACTOR = 100.0


# ============================================================================
# Check record — the unit shared by the CLI and the Excel exporter
# ============================================================================
@dataclass
class Check:
    """One deterministic check.

    actual / expected / delta carry the arithmetic; the CLI prints them and the
    Excel exporter renders them as live formulas. ``a_factors`` (per_unit, count)
    is set when ACTUAL is itself a product — the exporter then makes the
    multiplication live (``=K*M``). ``producer`` keys the Excel value-equality
    chain by IDENTITY (symbol/label), never by numeric value (bug #19).
    """
    name: str
    category: str          # CONSISTENCY | ADEQUACY | BALANCE | COST | CONNECTIVITY
    status: str            # PASS | FAIL | N/A
    actual: Optional[float] = None
    expected: Optional[float] = None
    tol: float = 0.0
    detail: str = ""
    unit: str = ""
    # ACTUAL is a live product per_unit x count (for the exporter's =K*M formula):
    a_factors: Optional[Tuple[float, float]] = None
    # relation kind: "eq" (==), "ge" (actual >= expected), "le", "tally"
    relation: str = "eq"
    # identity of the value this check's ACTUAL is produced from (chain key):
    producer: str = ""
    # The CONTRACT QUANTITY this check blesses/measures (orchestratorContract.quantities
    # key) + the quantity keys it consumed as inputs. These drive the CROSS-CHECK JOIN
    # (2026-07-02, the v55 184 GVA lesson): a FAILing check flags its quantity_key, and no
    # OTHER check may then PASS ("bless") a flagged quantity — nor may any headline surface
    # display it. Empty for checks not tied to a named quantity (per-line BoM, cables, …).
    quantity_key: str = ""
    input_keys: Tuple[str, ...] = ()
    # MAGNITUDE SANITY CEILING for "ge" (rating >= duty) checks: a rating more than
    # ~100x its duty is not adequacy, it is a corrupt number being waved through
    # (v55: incomer 184,166,200 kVA "PASSed" >= 66.25 kVA). When set, status is
    # FAIL above the ceiling and the Excel live formula includes the bound.
    ceiling: Optional[float] = None
    # Set when the CROSS-CHECK JOIN demoted this check: its own arithmetic passed but
    # it blesses a quantity another check flagged. The exporter renders a STATIC FAIL
    # (no live formula — the live arithmetic would dishonestly show PASS).
    cross_flagged: bool = False
    # SOURCE IDENTITY (Bar A 2026-08-03): where ACTUAL and EXPECTED each came from.
    # Empty when unpopulated. When BOTH are non-empty AND equal the check is a
    # tautology (both sides read one value) — check_falsifiability_audit catches
    # that generically. Value equality is NOT the signal (a passing eq always
    # shows equal values); source identity is. BoM unit×qty vs line_gbp MUST
    # carry DIFFERENT sources even when the numbers match.
    actual_source: str = ""
    expected_source: str = ""

    @property
    def delta(self) -> Optional[float]:
        if self.actual is None or self.expected is None:
            return None
        return self.actual - self.expected


# ============================================================================
# Generic helpers (kept independent of the exporter so the lib stands alone)
# ============================================================================
def _load_json(path: str) -> Optional[Any]:
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r") as fh:
            return json.load(fh)
    except Exception:  # noqa: BLE001 — one bad file must never crash the suite
        return None


def num(v: Any) -> Optional[float]:
    """Coerce a value (incl. display strings like '13,360', '£8.15 M', '7.6 m/s')
    to float; None when not numeric."""
    if v is None or isinstance(v, bool):
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
    if not isinstance(quantities, dict) or key not in quantities:
        return None
    v = quantities[key]
    return num(v.get("value") if isinstance(v, dict) else v)


def qunit(quantities: Dict[str, Any], key: str) -> str:
    v = quantities.get(key) if isinstance(quantities, dict) else None
    return (v.get("unit", "") if isinstance(v, dict) else "") or ""


def _first_qval(quantities: Dict[str, Any], keys: List[str]) -> Optional[float]:
    for k in keys:
        v = qval(quantities, k)
        if v is not None:
            return v
    return None


def _first_q(quantities: Dict[str, Any], keys: List[str]) -> Tuple[str, Optional[float]]:
    """Like _first_qval but ALSO returns the key that matched — the quantity identity
    the cross-check join needs (a check must record WHICH quantity it read)."""
    for k in keys:
        v = qval(quantities, k)
        if v is not None:
            return k, v
    return "", None


def _rendered_unit_price(pv: dict) -> Optional[float]:
    """The price the BoM/dossier actually RENDERS for a part verification, mirroring
    the chain's own field cascade (corrected -> estimate)."""
    for k in ("cost_repair_corrected_price_gbp", "price_estimate_gbp"):
        v = num(pv.get(k))
        if v is not None and v > 0:
            return v
    return None


def _reference_unit_price(pv: dict) -> Tuple[Optional[float], str]:
    """The independent reference price to band against: prefer a live distributor
    price, else the parametric/list estimate. Returns (price, source_label)."""
    dp = num(pv.get("distributor_price_gbp"))
    if dp is not None and dp > 0:
        return dp, "distributor_price_gbp"
    pe = num(pv.get("price_estimate_gbp"))
    if pe is not None and pe > 0:
        return pe, "price_estimate_gbp"
    return None, ""


# ============================================================================
# CONSISTENCY
# ============================================================================
def _checks_consistency(state: dict, run_dir: str) -> List[Check]:
    out: List[Check] = []
    oc = state.get("orchestratorContract") or {}
    quantities: Dict[str, Any] = oc.get("quantities") or {}
    rb = _requirements_bom(state)
    pl = _load_json(os.path.join(run_dir, "parts-ledger.json")) or {}

    # --- C1. per-unit (duty) x count == the authoritative contract total ---
    # Universal rule: ANY counted principal whose per-unit duty should sum to a
    # contract system total. We discover '<base>_count' quantities and look for a
    # matching per-unit duty quantity + a matching system total, all by NAME — no
    # hardcoded class table. The split family is data-driven from the quantity unit.
    count_keys = [k for k in quantities if k.endswith("_count")]
    for ck in count_keys:
        cnt = qval(quantities, ck)
        if not cnt or cnt <= 0:
            continue
        base = ck[:-6]  # strip '_count'
        per_unit, per_key = _find_per_unit_duty(quantities, base)
        total, total_key = _find_system_total(quantities, base, per_key)
        if per_unit is None or total is None:
            continue
        unit = qunit(quantities, per_key)
        tol = _tol_pct(total, 0.02, 1.0)
        exact = _eq_status(per_unit * cnt, total, tol)
        # A counted principal may INSTALL a STANDBY above its flow-sharing DUTY count (life-
        # critical N+1/N+2 redundancy, e.g. the brief's duty/standby recirc pumps): the installed
        # product then overshoots the system total by a whole number of per-unit standby duties.
        # Accept that — the DUTY units (round(total ÷ per-unit)) must tile the total AND the
        # installed count exceeds duty by a SMALL standby (≤2). The standby is SPARE capacity, not
        # a sizing error. A genuine count/per-unit mismatch (not a clean standby) still FAILS.
        # Universal across any standby-redundant counted principal.
        duty = round(total / per_unit) if per_unit else cnt
        standby = cnt - duty
        duty_tiles = per_unit > 0 and abs(per_unit * duty - total) / max(total, 1.0) <= 0.02
        is_standby = exact != PASS and duty >= 1 and 0 < standby <= 2 and duty_tiles
        flow_cnt = duty if is_standby else cnt
        note = (f"  [{int(cnt)} installed = {int(duty)} duty + {int(standby)} standby]"
                if is_standby else "")
        out.append(Check(
            name=f"{base.replace('_', ' ')}: per-unit x {('duty count' if is_standby else ck)} == {total_key}",
            category="CONSISTENCY", relation="eq",
            status=(PASS if (exact == PASS or is_standby) else FAIL),
            actual=per_unit * flow_cnt, expected=total,
            tol=tol, unit=unit,
            a_factors=(per_unit, flow_cnt), producer=per_key,
            detail=(f"{per_unit:g} {unit} per unit x {flow_cnt:g} DUTY units must equal the "
                    f"{total:g} {unit} system total ({total_key}){note}."),
        ))

    # --- C2. per-unit_gbp x qty == line_gbp on every principal BoM line ---
    # The BoM is its own authority: a line total must equal its own unit x qty.
    for row in rb:
        line = num(row.get("line_gbp"))
        unit_p = num(row.get("unit_gbp"))
        qty = num(row.get("qty"))
        if line is None or unit_p is None or qty is None or line <= 0:
            continue
        tag = str(row.get("tag") or row.get("part") or "?")
        # abs floor ~£0.01, magnitude-capped so a £1 line cannot be swallowed
        # by a £1 floor (unit=0, qty=1, line=1 must FAIL).
        _bom_tol = _tol_pct(line, 0.005, 0.01)
        out.append(Check(
            name=f"BoM {tag}: unit_gbp x qty == line_gbp",
            category="CONSISTENCY", relation="eq",
            status=_eq_status(unit_p * qty, line, _bom_tol),
            actual=unit_p * qty, expected=line,
            tol=_bom_tol, unit="GBP",
            a_factors=(unit_p, qty), producer=f"bom:{tag}:unit",
            # DIFFERENT sources even when values match — unit×qty is derived;
            # line_gbp is the stored line. Same-source would be a tautology.
            actual_source=f"bom:{tag}:unit*qty",
            expected_source=f"bom:{tag}:line_gbp",
            detail=(f"{tag}: £{unit_p:,.0f} x {qty:g} must equal the "
                    f"£{line:,.0f} line total."),
        ))

    # --- C3. Sigma sub-component GBP == principal line GBP (parts-ledger) ---
    # Each ledger principal carries both its rolled line_gbp and the Sigma of its
    # exploded sub-components; when it has sub-components the two must agree.
    for e in (pl.get("equipment") or []):
        nsub = num(e.get("subcomponents")) or 0
        if nsub <= 0:
            continue
        line = num(e.get("line_gbp"))
        subc = num(e.get("subcomponent_gbp"))
        if line is None or subc is None or line <= 0:
            continue
        tag = str(e.get("tag") or e.get("name") or "?")
        # Untagged aggregate / commodity rows (tag "—" / empty) are not principals —
        # they have no exploded sub-assembly tree to reconcile against. Checking them
        # produced 60+ identical FAIL lines that zeroed the dossier floor (codema-ship).
        if not tag or tag in ("—", "-", "?", "–"):
            continue
        out.append(Check(
            name=f"BoM {tag}: Sigma sub-component_gbp == line_gbp",
            category="CONSISTENCY", relation="eq",
            status=_eq_status(subc, line, _tol_pct(line, 0.01, 5.0)),
            actual=subc, expected=line,
            tol=_tol_pct(line, 0.01, 5.0), unit="GBP",
            producer=f"ledger:{tag}:subc",
            detail=(f"{tag}: {int(nsub)} sub-components sum to £{subc:,.0f}; must "
                    f"equal the £{line:,.0f} principal line."),
        ))

    # --- C4. emitted principal word rating == the contract quantity it derives ---
    # e.g. the Recirc-Pump BoM requirement string states "132 kW motor (97 kW
    # shaft)"; those ratings must equal the contract motor/shaft quantities. We
    # match BoM lines to contract quantities by the part/tag NAME stem, then test
    # any 'kW' rating in the requirement against the corresponding *_kw quantity.
    out.extend(_checks_rating_equals_quantity(rb, quantities))

    return out


def _find_per_unit_duty(quantities: Dict[str, Any], base: str
                        ) -> Tuple[Optional[float], str]:
    """Find a per-unit duty quantity for a '<base>_count'. Universal: try the
    base name + common per-unit duty unit suffixes, preferring a 'module'-scope
    quantity (the engine tags a per-unit duty as scope=module)."""
    # exact-name candidates the engine emits for a per-unit duty
    suffixes = ["_throughput_m3_h", "_water_flow_m3_h", "_flow_m3_h",
                "_each_m3", "_volume_each_m3", "_air_flow_m3_h", "_kw"]
    for sfx in suffixes:
        key = base + sfx
        v = qval(quantities, key)
        if v is not None:
            return v, key
    # also accept '<base>_<x>_each' style
    for k in quantities:
        if k.startswith(base) and k.endswith("_each_m3"):
            v = qval(quantities, k)
            if v is not None:
                return v, k
    return None, ""


def _find_system_total(quantities: Dict[str, Any], base: str, per_key: str
                       ) -> Tuple[Optional[float], str]:
    """Find the SYSTEM total that the per-unit duty x count should reproduce. The
    per-unit duty's UNIT family selects the right system total (flow->loop flow;
    volume->total tank volume), all derived from the contract, never hardcoded."""
    per_unit = qunit(quantities, per_key)
    # flow-rate per-unit -> the recirculation loop total (system flow)
    if "m3_h" in per_key or "m³/h" in per_unit or "/h" in per_unit:
        for k in ("recirculation_flow_m3_h", "total_flow_m3_h",
                  "system_flow_m3_h"):
            v = qval(quantities, k)
            if v is not None:
                return v, k
    # volume per-unit (e.g. tank volume each) -> the total tank volume
    if "each_m3" in per_key or per_unit in ("m³", "m3"):
        for k in ("total_tank_volume_m3", "total_volume_m3"):
            v = qval(quantities, k)
            if v is not None:
                return v, k
    return None, ""


def _checks_rating_equals_quantity(rb: List[dict], quantities: Dict[str, Any]
                                   ) -> List[Check]:
    """C4: a principal word's emitted kW rating in its requirement string must
    equal the contract quantity it derives from. Generic: for each BoM line whose
    name stem matches a '<stem>_*_kw' contract quantity, compare."""
    out: List[Check] = []
    # index contract *_kw quantities by their leading stem token(s)
    kw_quants = {k: qval(quantities, k) for k in quantities
                 if k.endswith("_kw") and qval(quantities, k) is not None}
    if not kw_quants:
        return out
    seen: set = set()
    for row in rb:
        if (num(row.get("line_gbp")) or 0) <= 0:
            continue
        req = str(row.get("requirement", ""))
        name = (str(row.get("part", "")) + " " + req).lower()
        # SKIP connection/transfer rows ("<service> connection: A → B · NN kW"): their
        # kW is a downstream DUTY on a pipe/cable run, not an equipment's own rating, so
        # matching it against a '<stem>_kw' equipment quantity is a name-collision
        # false-positive (co2 C06: a steam→reboiler connection's 49.22 kW steam draw
        # mis-matched electric_steam_generator_kw=230, the real boiler's own rating on a
        # SEPARATE BoM line). Mirrors the panel-schedule connection-row exclusion.
        if re.search(r"\bconnection\b|→|->", name):
            continue
        # INTENT (2026-07-29 0846): thermal-sink nouns (cold plate / heat sink) carry
        # a dissipation kW proxy, NOT shaft/electrical power. A lone product-family
        # token ("mgu") must not bind mgu_shaft_power_kw to a 17.5 kW cold plate.
        if re.search(
            r"cold\s*plate|heat\s*sink|heat\s*exchanger|\bradiator\b|coldplate",
            name,
        ):
            continue
        # Prefer the SHAFT/hydraulic figure when the requirement is the dual form
        # "N kW motor (M kW shaft)" — that M is what contract *_power_kw stores.
        # Falling back to the first kW alone mis-compared a wrongly-lifted nameplate
        # against the shaft contract key (codema-ship P-112: 5.04 motor vs 1.92 shaft).
        m_shaft = re.search(
            r"(\d[\d,]*(?:\.\d+)?)\s*kw\s*shaft|motor\s*\(\s*(\d[\d,]*(?:\.\d+)?)\s*kw\s*shaft",
            req, re.IGNORECASE,
        )
        m = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*kw\s*(?:motor|shaft|rated)?", req, re.IGNORECASE)
        if m_shaft:
            rating = num(m_shaft.group(1) or m_shaft.group(2))
        elif m:
            rating = num(m.group(1))
        else:
            continue
        if rating is None:
            continue
        # find a contract *_kw quantity whose stem tokens all appear in the name
        best_key, best_val = None, None
        for qk, qv in kw_quants.items():
            stem = qk[:-3]  # strip '_kw'
            toks = [t for t in stem.split("_") if t not in
                    ("kw", "motor", "shaft", "power", "rated", "input")]
            if toks and all(t in name for t in toks):
                # prefer the closest-magnitude match
                if best_val is None or (qv is not None and rating is not None and
                                        abs(qv - rating) < abs(best_val - rating)):
                    best_key, best_val = qk, qv
        if best_key is None or best_val is None:
            continue
        key_id = (str(row.get("tag")), best_key)
        if key_id in seen:
            continue
        seen.add(key_id)
        out.append(Check(
            name=f"BoM {row.get('tag')}: emitted kW rating == {best_key}",
            category="CONSISTENCY", relation="eq",
            status=_eq_status(rating, best_val, _tol_pct(best_val, 0.10, 0.5)),
            actual=rating, expected=best_val,
            tol=_tol_pct(best_val, 0.10, 0.5), unit="kW",
            producer=best_key,
            detail=(f"{row.get('tag')} requirement states {rating:g} kW; contract "
                    f"{best_key} = {best_val:g} kW. They must agree."),
        ))
    return out


# ============================================================================
# ADEQUACY (rating >= duty)
# ============================================================================
def _checks_adequacy(state: dict, run_dir: str) -> List[Check]:
    out: List[Check] = []
    oc = state.get("orchestratorContract") or {}
    q: Dict[str, Any] = oc.get("quantities") or {}
    pl = _load_json(os.path.join(run_dir, "parts-ledger.json")) or {}
    cs = _load_json(os.path.join(run_dir, "connection-schedule.json")) or {}

    # --- A1. pump motor kW >= hydraulic power / efficiency ---
    hyd_key, hyd_w = _first_q(q, ["recirc_pump_hydraulic_power_w", "pump_hydraulic_power_w"])
    motor_key, motor_kw = _first_q(q, ["recirc_pump_motor_kw", "pump_motor_kw"])
    eta = _first_qval(q, ["pump_efficiency", "recirc_pump_efficiency",
                          "pump_overall_efficiency"]) or 0.65
    if hyd_w is not None and motor_kw is not None and eta and 0 < eta <= 1:
        duty_kw = (hyd_w / 1000.0) / eta
        ceil_kw = duty_kw * MAGNITUDE_CEILING_FACTOR
        out.append(Check(
            name="Pump motor kW >= hydraulic / efficiency",
            category="ADEQUACY", relation="ge",
            status=_ge_ceiling_status(motor_kw, duty_kw, ceil_kw),
            actual=motor_kw, expected=duty_kw, tol=0.0, unit="kW",
            producer="recirc_pump_motor_kw",
            quantity_key=motor_key, input_keys=(hyd_key,) if hyd_key else (),
            ceiling=ceil_kw,
            detail=(f"Motor {motor_kw:g} kW must cover hydraulic {hyd_w/1000:g} kW "
                    f"/ eta {eta:g} = {duty_kw:.3g} kW shaft duty"
                    + _ceiling_clause(motor_kw, ceil_kw, "duty")),
        ))

    # --- A2. main incomer rating >= connected load x 1.25 ---
    # The main protective device / supply incomer must carry the connected load
    # with a 1.25 margin. TWO equivalent forms, both derived from the contract:
    #   (a) PREFERRED, assumption-free: incomer APPARENT power (kVA) >= load kW x
    #       1.25 (kVA >= kW for any PF<=1; this is the basis the engine itself sizes
    #       the transformer on, so no power-factor guess is needed).
    #   (b) FALLBACK: incomer CURRENT (A) >= load-derived current at the contract's
    #       stated voltage + power factor (only when an explicit PF is present).
    conn_key, conn_kw = _first_q(q, ["connected_electrical_load_kw", "connected_load_kw",
                                     "total_connected_load_kw", "installed_electrical_load_kw"])
    incomer_kva, kva_key = None, ""
    # LIKE-WITH-LIKE (2026-07-11 run 60): on a self-powered product the AUX panel's
    # incomer (main_incomer_breaker_a, sized to the 0.21 kW aux load) and the PRODUCT's
    # grid connection (total_supply_demand_kva = the PCS path, ~25 kVA) are DIFFERENT
    # electrical boundaries — joining the grid kVA to the aux load breached the 100x
    # magnitude ceiling on a correct design. When a specific incomer-breaker authority
    # exists, the generic supply-demand figure is NOT the aux incomer; skip it here
    # (the breaker-current form (b) below carries the like-for-like comparison).
    _has_breaker_authority = (qval(q, "main_incomer_breaker_a") or 0) > 0
    # GOTCHA (2026-07-16 Poseidon): bench instruments mint psu_transformer_kva≈0.25
    # AND a leftover plant total_supply_demand_kva=25. Picking the plant 25 kVA against
    # a 0.087 kW load fails the ×100 magnitude ceiling even though the real bench PSU
    # is adequate. Device-scale (<1 kW connected) prefers PSU/bench keys and skips
    # plant supply-demand phantoms that sit above the ceiling.
    _device_scale_load = conn_kw is not None and 0 < float(conn_kw) < 1.0
    if _device_scale_load:
        _kva_keys = [
            "psu_transformer_kva", "bench_psu_kva", "main_incomer_kva",
            "supply_transformer_kva", "main_transformer_kva",
        ]
    else:
        _kva_keys = ["main_transformer_kva", "main_incomer_kva", "supply_transformer_kva",
                     "total_supply_demand_kva", "main_supply_kva"]
    if _has_breaker_authority:
        _kva_keys = [k for k in _kva_keys if k not in ("total_supply_demand_kva", "main_supply_kva")]
    for k in _kva_keys:
        v = qval(q, k)
        if v is not None and v > 0:
            # Skip plant-scale phantoms that cannot be this device's incomer.
            if _device_scale_load and conn_kw is not None and v > float(conn_kw) * MAGNITUDE_CEILING_FACTOR:
                continue
            incomer_kva, kva_key = v, k
            break
    if conn_kw is not None and incomer_kva is not None:
        required_kva = conn_kw * 1.25  # kVA must be >= kW; 1.25 design margin
        # MAGNITUDE SANITY CEILING (2026-07-02, v55 proveCatch): "bigger is adequate" has
        # NO upper bound, so a corrupt 184,166,200 kVA incomer PASSed >= 66.25 kVA. A real
        # incomer is never > load x 100 (a generous bound: real designs sit at 1.25-3x);
        # above it the number is an artefact, not an adequate rating -> FAIL.
        ceiling_kva = conn_kw * MAGNITUDE_CEILING_FACTOR
        out.append(Check(
            name="Main incomer kVA >= connected load x 1.25",
            category="ADEQUACY", relation="ge",
            status=_ge_ceiling_status(incomer_kva, required_kva, ceiling_kva),
            actual=incomer_kva, expected=required_kva, tol=0.0, unit="kVA",
            producer=kva_key,
            quantity_key=kva_key, input_keys=(conn_key,) if conn_key else (),
            ceiling=ceiling_kva,
            detail=(f"Incomer {incomer_kva:g} kVA ({kva_key}) must be >= "
                    f"{conn_kw:g} kW x 1.25 = {required_kva:.4g} kVA "
                    f"(kVA >= kW for any power factor)"
                    + _ceiling_clause(incomer_kva, ceiling_kva,
                                      f"connected load {conn_kw:g} kW")),
        ))
    else:
        # (b) current form — only with an explicit PF (else we won't guess one)
        breaker_a, breaker_key = None, ""
        for k in ("main_incomer_breaker_a", "main_breaker_rating_a", "main_incomer_rating_a",
                  "main_breaker_a", "incomer_breaker_a", "main_incomer_current_a",
                  "main_transformer_secondary_current_a", "main_feeder_current_a"):
            v = qval(q, k)
            if v is not None and v > 0:
                breaker_a, breaker_key = v, k
                break
        voltage = _first_qval(q, ["distribution_voltage_v", "system_voltage_v",
                                  "supply_voltage_v", "lv_voltage_v",
                                  "secondary_voltage_v"]) or 400.0
        pf = _first_qval(q, ["power_factor", "system_power_factor"])
        # a <=250 V system is SINGLE-phase: I = P/(V·PF); and PF defaults to the same
        # 0.9 the engine's own incomer mint uses (documented in the detail string) —
        # refusing to run left the aux incomer entirely unchecked (2026-07-11 run 60).
        single_phase = voltage <= 250
        if pf is None and single_phase:
            pf = 0.9
        if (conn_kw is not None and breaker_a is not None and voltage > 0
                and pf is not None and 0 < pf <= 1):
            load_a = ((conn_kw * 1000.0) / (voltage * pf) if single_phase
                      else (conn_kw * 1000.0) / (math.sqrt(3) * voltage * pf))
            required_a = load_a * 1.25
            ceiling_a = load_a * MAGNITUDE_CEILING_FACTOR
            out.append(Check(
                name="Main incomer A >= connected load x 1.25",
                category="ADEQUACY", relation="ge",
                status=_ge_ceiling_status(breaker_a, required_a, ceiling_a),
                actual=breaker_a, expected=required_a, tol=0.0, unit="A",
                producer=breaker_key,
                quantity_key=breaker_key, input_keys=(conn_key,) if conn_key else (),
                ceiling=ceiling_a,
                detail=(f"Incomer {breaker_a:g} A ({breaker_key}) must be >= "
                        f"{conn_kw:g} kW x 1000 / (sqrt3 x {voltage:.0f} V x {pf:g}) "
                        f"x 1.25 = {required_a:.4g} A"
                        + _ceiling_clause(breaker_a, ceiling_a,
                                          f"load current {load_a:.4g} A")),
            ))

    # --- A3. cable CSA >= current (per electrical connection row) ---
    # The connection schedule already sizes each cable + carries a within_spec
    # verdict (voltdrop-based). We add a DERIVED ampacity-floor check: the chosen
    # CSA mm2 must be >= the CSA an air-rated copper-ampacity table requires for
    # that current. Universal: uses a standard BS-7671-style ampacity ladder; skips
    # cleanly when current/size are not parseable.
    out.extend(_checks_cable_csa(cs))

    # --- A4. vessel/tank volume > media (MBBR) fill volume ---
    tank_key, tank_v = _first_q(q, ["biofilter_tank_volume_m3", "mbbr_tank_volume_m3"])
    media_key, media_v = _first_q(q, ["biofilter_media_volume_m3", "mbbr_media_volume_m3",
                                      "media_volume_m3"])
    if tank_v is not None and media_v is not None and media_v > 0:
        out.append(Check(
            name="Biofilter tank volume > media fill volume",
            category="ADEQUACY", relation="ge",
            status=_ge_status(tank_v, media_v),
            actual=tank_v, expected=media_v, tol=0.0, unit="m3",
            producer="biofilter_tank_volume_m3",
            quantity_key=tank_key, input_keys=(media_key,) if media_key else (),
            detail=(f"Tank {tank_v:g} m3 must exceed the {media_v:g} m3 MBBR media "
                    f"fill (carriers cannot exceed the vessel they sit in)."),
        ))

    # --- A5. chiller / heat-pump capacity >= duty ---
    cap_key, cap = _first_q(q, ["chiller_capacity_kw", "heat_pump_capacity_kw",
                                "installed_cooling_capacity_kw", "heat_pump_heating_capacity_kw"])
    duty_key, duty = _first_q(q, ["cooling_duty_kw", "heating_duty_kw", "thermal_duty_kw",
                                  "system_thermal_dissipation_kw"])
    if cap is not None and duty is not None and duty > 0:
        ceil_th = duty * MAGNITUDE_CEILING_FACTOR
        out.append(Check(
            name="Chiller / heat-pump capacity >= thermal duty",
            category="ADEQUACY", relation="ge",
            status=_ge_ceiling_status(cap, duty, ceil_th),
            actual=cap, expected=duty, tol=0.0, unit="kW",
            producer="thermal_capacity_kw",
            quantity_key=cap_key, input_keys=(duty_key,) if duty_key else (),
            ceiling=ceil_th,
            detail=(f"Installed thermal capacity {cap:g} kW must cover the "
                    f"{duty:g} kW design duty"
                    + _ceiling_clause(cap, ceil_th, "duty")),
        ))

    return out


# Copper, 70C thermoplastic, ~reference method C ampacity ladder (BS 7671 App 4
# flavour). Conservative single-circuit air-rated values; the check only FAILS a
# cable that is undersized by a WHOLE rung, so the exact table need not be precise.
_CU_AMPACITY = [
    (1.5, 19.5), (2.5, 27), (4, 36), (6, 46), (10, 63), (16, 85), (25, 112),
    (35, 138), (50, 168), (70, 213), (95, 258), (120, 299), (150, 344),
    (185, 392), (240, 461), (300, 530), (400, 634), (500, 723), (630, 826),
]


def _csa_required_for_current(amps: float) -> Optional[float]:
    for csa, cap in _CU_AMPACITY:
        if cap >= amps:
            return csa
    return None  # beyond the ladder -> needs parallel conductors; skip (N/A)


def _checks_cable_csa(cs: dict) -> List[Check]:
    out: List[Check] = []
    rows = cs.get("rows") or []
    for r in rows:
        if r.get("mechanism") != "electrical_bus":
            continue
        amps = num(r.get("rating"))                  # "194.5 A"
        chosen = num(r.get("size"))                  # "50 mm2"
        if amps is None or chosen is None or amps <= 0:
            continue
        req_csa = _csa_required_for_current(amps)
        if req_csa is None:
            continue  # off the top of the ladder (parallel runs) -> skip cleanly
        frm = str(r.get("from", "?"))[:18]
        to = str(r.get("to", "?"))[:24]
        out.append(Check(
            name=f"Cable CSA >= ampacity: {to}",
            category="ADEQUACY", relation="ge",
            status=_ge_status(chosen, req_csa),
            actual=chosen, expected=req_csa, tol=0.0, unit="mm2",
            producer=f"cable:{frm}->{to}",
            detail=(f"{frm}->{to}: {amps:g} A needs >= {req_csa:g} mm2 copper "
                    f"(air-rated ladder); chosen {chosen:g} mm2."),
        ))
    return out


# ============================================================================
# BALANCE (in == out, flow continuity) — from the engine's own closures + flow
# ============================================================================
def _checks_balance(state: dict, run_dir: str) -> List[Check]:
    out: List[Check] = []
    oc = state.get("orchestratorContract") or {}
    q: Dict[str, Any] = oc.get("quantities") or {}

    # --- B1. engine-declared closures with an extractable EQUALITY target ---
    # Only equality closures of the form "A x B" become live checks; one-sided
    # inequalities keep the engine's own verdict (handled below as a tally only if
    # the engine itself recorded FAIL — we never fabricate a hard FAIL).
    for cl in (oc.get("closures") or []):
        measured = num(cl.get("measured"))
        required = str(cl.get("required", ""))
        target = _extract_equality_target(required, measured)
        inv = str(cl.get("invariant_id", "closure"))
        if measured is not None and target is not None and abs(target) > 0:
            out.append(Check(
                name=f"closure: {inv}",
                category="BALANCE", relation="eq",
                status=_eq_status(measured, target, _tol_pct(target, 0.02, 1.0)),
                actual=measured, expected=target,
                tol=_tol_pct(target, 0.02, 1.0), unit="",
                producer=inv,
                detail=str(cl.get("reason", required))[:200],
            ))
        else:
            # The engine's OWN verdict on a required closure it could not satisfy is
            # surfaced as a deterministic FAIL — we never fabricate one, we just stop
            # DROPPING the ones the engine already flagged. "warn" is included: e.g.
            # capex_within_ceiling status=warn means the £5.0 M brief ceiling is
            # breached by the £8.15 M 204 t/yr design — the single most important
            # customer constraint. A breach the engine recorded must NOT hide behind an
            # all-green book (the deterministic-verification contract: flag every
            # discrepancy). A closure the engine marked pass/ok stays silent.
            status = str(cl.get("status", "")).lower()
            if status in ("warn", "fail", "error"):
                out.append(Check(
                    name=f"closure: {inv}",
                    category="BALANCE", relation="eq", status=FAIL,
                    actual=measured, expected=None, tol=0.0,
                    detail=f"Engine recorded {status}: {str(cl.get('reason', required))[:160]}",
                ))

    # --- B2. flow continuity: Sigma per-unit branch == main loop ---
    # Where a per-unit branch flow + a parallel count + a loop total all exist,
    # Sigma(branch) must equal the loop. (This is the deterministic statement the
    # LLM critic mis-read as a 10x undersizing.) Derived purely from quantities.
    loop = _first_qval(q, ["recirculation_flow_m3_h", "total_flow_m3_h"])
    branch = _first_qval(q, ["drum_filter_throughput_m3_h", "degasser_water_flow_m3_h"])
    branch_key = ("drum_filter_throughput_m3_h" if qval(q, "drum_filter_throughput_m3_h")
                  is not None else "degasser_water_flow_m3_h")
    cnt_key = "drum_filter_count" if branch_key.startswith("drum") else "degasser_count"
    cnt = qval(q, cnt_key)
    if loop is not None and branch is not None and cnt:
        out.append(Check(
            name=f"Flow continuity: {branch_key} x {cnt_key} == recirculation loop",
            category="BALANCE", relation="eq",
            status=_eq_status(branch * cnt, loop, _tol_pct(loop, 0.02, 1.0)),
            actual=branch * cnt, expected=loop,
            tol=_tol_pct(loop, 0.02, 1.0), unit="m3/h",
            a_factors=(branch, cnt), producer=branch_key,
            detail=(f"Sigma branch flow {branch:g} x {cnt:g} must close on the "
                    f"{loop:g} m3/h loop total."),
        ))

    return out


# ============================================================================
# COST
# ============================================================================
# Basis vocabulary the pricing pass writes when it DELIBERATELY corrects a line's price
# away from its raw parametric estimate (corpus lift / credible-price floor / commodity
# floor / micro-commodity cap / gate-21 distributor correction / actuated-valve assembly
# formula). Keyed on the correction STATEMENT, never on part class — universal. See the
# exemption note in _checks_cost.
#
# 'actuated-valve assembly' (codema v77, 2026-07-05): requirements_bom.py's
# _actuated_valve_assembly_price() prices an ACTUATED valve (actuator + valve body as
# ONE procurable unit) from an explicit, self-documenting formula — "£80 base +
# £1.85/DN·mm × DN65 assumed = £200 (... never the bare-valve band)" — and its own
# comment states it is LIFT-ONLY (never lowers a real catalogue price). Banding that
# honest £200 assembly price against a partVerifications estimate that only ever priced
# the BARE valve body (£18-25, an Engine-B commodity-curve reference for a component
# class that pre-dates the actuation upgrade) compares two different physical scopes —
# the same self-contradiction the corpus-lift/commodity-floor patterns above already
# exempt. v77 V-107/V-109/V-110 (Bürkert Type 2000/2301 actuated valves) FAILED the x5
# band at £200 vs a stale £18 bare-valve price_estimate_gbp for exactly this reason.
# Matches the LITERAL basis prefix requirements_bom.py always emits for this family, so
# it can never accidentally exempt an unrelated line.
_DELIBERATE_PRICE_CORRECTION_RE = re.compile(
    r"lifted\s*£?[\d,.]+\s*→|to the engine corpus|floored to min credible price|"
    r"commodity-floor|micro-commodity ceiling|gate-21\s*>?\s*\d*×?\s*correction|"
    r"actuated-valve assembly",
    re.I)

# BESPOKE / MADE-TO-ORDER FABRICATION exemption (2026-07-06, CO2-mineralisation M-102
# fix). A bespoke, made-to-order fabrication — a shop-built item quoted as ONE
# procurable unit ("fabricated 316L wash-bar manifold — made to order") — has no
# commodity per-kg/per-fitting equivalent; comparing its quoted price against a generic
# parametric estimate is the same self-contradiction the grounded/corrected/catalogue-pin
# exemptions above already codify, just triggered by a different upstream defect: a
# bespoke item's partVerification can get indexed with manufacturer='fabricated' + the
# full description AS its 'part_number' (no real MPN exists for a one-off fabrication),
# which _match_partverification_by_mpn then joins as if it were a genuine catalogue part
# — banding the £2,800 bespoke quote against an £11.70 commodity placeholder (239x FAIL,
# M-102). Detected on the BoM row's OWN text ('made to order' / 'made to spec' /
# 'fabricated' / 'bespoke') — universal, independent of how the false MPN join happened,
# and mirrors the EXISTING made-to-spec exemption already applied to structural vessel
# take-offs (see _match_partverification_by_mpn's docstring). NEVER exempts a genuine
# commodity line: the keyword must appear in the row's own part/requirement description,
# not merely a high ratio — a plain over-priced catalogue part still FAILs (proveCatch
# below, both directions).
_BESPOKE_FABRICATION_RE = re.compile(
    r"\bmade[- ]to[- ]order\b|\bmade[- ]to[- ]spec\b|\bfabricated\b|\bbespoke\b", re.I)


def _is_bespoke_fabrication(row: dict) -> bool:
    text = f"{row.get('part') or ''} {row.get('requirement') or ''}"
    return bool(_BESPOKE_FABRICATION_RE.search(text))


# Basis vocabulary that states the line's rendered price IS a catalogue / distributor /
# library quote ('catalogue', 'distributor catalogue (db:…)', 'library match') — anchored
# at the START of the basis so 'catalogue-class budget' (a class-anchor ESTIMATE, not a
# quote) never matches. Such a row must band against ITS OWN quote, never a parametric
# estimate another pass rejected/overwrote (see the exemption note in _checks_cost).
_CATALOGUE_PIN_BASIS_RE = re.compile(
    r"^\s*(?:(?:distributor\s+)?catalogue(?![\w-])|library\s+match\b)", re.I)
# The quote a 'distributor catalogue (db:mouser £45.68)' basis embeds — parse ONLY the
# (db:…£N) form, never the '£X→£Y' lift figures a correction suffix may carry.
_DB_PIN_QUOTE_RE = re.compile(r"\(db:[^)]*?£\s*([\d,]+(?:\.\d+)?)", re.I)


# UNIT-BASIS RECONCILIATION (2026-07-05, X-6 CLI PARITY fix) — mirrors
# scripts/lib/per-line-price-plausibility-audit.ts::reconcileUnitBasis (gate 21)
# AND scripts/build-excel-export.py::_reconcile_unit_basis_gbp EXACTLY, so the
# live TS gate, the workbook's Checks tab, and this CLI can never disagree.
# Gate 21 downgrades a die-cut/cut-length PIECE priced against a distributor's
# whole-STOCK unit (Bergquist GP3000S30 gasket pad £2.50/cell vs its £56.48
# stock-sheet distributor price — X-6) from HIGH to a non-blocking note; the
# workbook mirrors that as "RECONCILED — unit-basis (non-blocking)". Before
# this fix the CLI had NO such reconciliation and hard-FAILed the identical
# numbers gate 21 no longer blocks on (the X-6 CLI PARITY gap). NEVER excuses
# the OVER direction, and never fires for a non-piece-of-stock noun — a
# genuine mispriced principal (INV-4: a £181 PCS vs its £75,000 distributor
# reference) is not this SHAPE and stays caught. KEEP THIS FUNCTION BYTE-
# IDENTICAL to build-excel-export.py's copy of the same name.
_PIECE_OF_STOCK_RX = re.compile(
    r"\b(pads?|gaskets?|shims?|labels?|seals?|die[- ]?cut|decals?|stickers?|tapes?|foils?|"
    r"films?|liners?|membranes?|wires?|cables?|tub(?:e|es|ing)|hoses?|sleev(?:e|es|ing)|"
    r"heat[- ]?shrink|braid(?:ed|ing)?|cords?|lacing|webbing|per[- ]?met(?:re|er))\b",
    re.I)
_UNIT_BASIS_YIELD_MIN = 2
_UNIT_BASIS_YIELD_MAX = 500

# ── Part-type coherence (F3, 2026-07-20): an ACTIVE-MACHINE requirement must not be
# pinned to a CONSUMABLE/stock SKU. The frozen organoid-bioreactor 2150 shipped
# "P-101 Dosing Peristaltic Pump = Watson-Marlow TUB-SAN-6.4" at £20.74, status
# IDENTIFIED — a length of sanitary tubing presented as a resolved pump (a chartered
# engineer rejects it on sight). Universal, no per-class table: fires only when the
# REQUIREMENT names an active machine/actuator AND the pinned PART identity is a
# consumable stock noun (a pump's tubing, a valve's o-ring, a motor's coupling). ──
_ACTIVE_MACHINE_RX = re.compile(
    r"\b(pumps?|motors?|drives?|actuators?|solenoids?|valves?|fans?|blowers?|"
    r"compressors?|mixers?|agitators?|stirrers?|impellers?|heaters?|peltiers?|"
    r"chillers?|spindles?|gearbox(?:es)?|servos?|steppers?)\b", re.I)
# consumable/stock SKU alpha-prefixes (e.g. Watson-Marlow TUB-SAN-6.4 -> "TUB"): a
# generic stock-noun abbreviation lexicon, the SKU-prefix companion to _PIECE_OF_STOCK_RX.
_CONSUMABLE_SKU_PREFIX = {
    "tub", "tube", "hose", "hos", "seal", "gsk", "gskt", "gask", "oring", "orng",
    "ferr", "grom", "grmt", "slv", "sleev", "clmp", "lbl", "tape", "film", "memb",
    "filt", "crt", "gasket", "ptfe", "silic",
}
_SKU_PREFIX_RX = re.compile(r"^([A-Za-z]{2,6})[-_ ]")


def _part_is_consumable_stock(part: str) -> bool:
    """True when a pinned part identity reads as a consumable/stock item (tubing,
    gasket, o-ring, sleeve, label …) rather than a machine — by stock-noun match
    OR by a consumable SKU alpha-prefix."""
    p = str(part or "")
    if _PIECE_OF_STOCK_RX.search(p):
        return True
    # test every whitespace token for a consumable SKU alpha-prefix (mfr TUB-SAN-6.4)
    for tok in p.split():
        m = _SKU_PREFIX_RX.match(tok)
        if m and m.group(1).lower() in _CONSUMABLE_SKU_PREFIX:
            return True
    return False


def _part_is_placeholder(part: str) -> bool:
    """Non-catalogue placeholders that carry no real SKU (never a mispin)."""
    p = str(part or "").strip().lower()
    return (not p) or p in ("requirement stated", "made to spec", "tbd", "not found",
                            "—", "-", "n/a") or bool(re.match(r"^tbd\b", p))


def _reconcile_unit_basis_gbp(word_name, bom_unit_price_gbp, distributor_best_gbp
                              ) -> Tuple[bool, Optional[int], Optional[str]]:
    """Pure + deterministic. Returns (applied, implied_yield, note). Applied ONLY when
    (a) the item name is a piece-of-stock noun family, (b) the BoM price is BELOW the
    reference (the over direction is never excused), and (c) some integer yield in
    [2, 500] lands piece_price × yield within [0.5x, 2x] of the reference price."""
    try:
        bom_p = float(bom_unit_price_gbp)
        ref_p = float(distributor_best_gbp)
    except (TypeError, ValueError):
        return False, None, None
    if not (bom_p > 0 and ref_p > 0):
        return False, None, None
    if bom_p >= ref_p:
        return False, None, None          # (c) the over direction is NEVER excused
    if not _PIECE_OF_STOCK_RX.search(str(word_name or "")):
        return False, None, None          # (a) piece-of-stock noun family only
    implied_yield = ref_p / bom_p
    y_lo = max(_UNIT_BASIS_YIELD_MIN, math.ceil(0.5 * implied_yield))
    y_hi = min(_UNIT_BASIS_YIELD_MAX, math.floor(2 * implied_yield))
    if y_lo > y_hi:
        return False, None, None          # (b) no plausible integer yield lands in-band
    rounded = round(implied_yield)
    note = (f"unit-basis reconciliation: per-piece £{bom_p:,.2f} vs stock unit "
            f"£{ref_p:,.2f} — implied yield ~{rounded}, unit-basis differs; "
            f"verify die-cut/cut-length yield (mirrors gate 21 reconcileUnitBasis)")
    return True, rounded, note


def _own_catalogue_quote(pv: dict, basis: str) -> Tuple[Optional[float], str]:
    """The catalogue-pinned row's OWN quote to band against (codema v60 I-104):
    (1) a £ figure the basis itself embeds ('distributor catalogue (db:mouser £45.68)');
    (2) else the pv's engine-B corpus quote (engine_b_reference_unit_cost_gbp) — but ONLY
        when engine_b_estimate_source == 'corpus_price' (a REAL corpus/catalogue match,
        untouched by a later cost-repair overwrite of price_estimate_gbp). A 'curve' /
        rule-based parametric is NOT a quote — a catalogue-claiming row with no quote
        behind it must stay flagged (BESS I-17: £140 'catalogue' vs a £6.5 curve estimate).
    Returns (quote, source_label) or (None, '')."""
    m = _DB_PIN_QUOTE_RE.search(basis)
    if m:
        v = num(m.group(1).replace(",", ""))
        if v is not None and v > 0:
            return v, "own distributor-catalogue quote (basis db pin)"
    if str(pv.get("engine_b_estimate_source") or "").strip().lower() == "corpus_price":
        v = num(pv.get("engine_b_reference_unit_cost_gbp"))
        if v is not None and v > 0:
            return v, "own catalogue quote (engine-B corpus)"
    return None, ""


def _checks_cost(state: dict, run_dir: str) -> List[Check]:
    out: List[Check] = []
    rb = _requirements_bom(state)
    pl = _load_json(os.path.join(run_dir, "parts-ledger.json")) or {}

    # --- COST1. per-line unit GBP within a sane band of its reference price ---
    # Catches the Grundfos UP15-42 rendered at 67,900 (rating-based £700/kW x 97kW)
    # vs its own distributor/estimate of ~1,951 — a 35x over-bill. The band check
    # is ONLY applied where a BoM line is CONFIDENTLY joined to a partVerification
    # by EXACT manufacturer + part_number (the one unambiguous key) — never by a
    # loose name overlap, which would mis-band a structural "made to spec" line
    # against an unrelated part's placeholder estimate. Reference = the part's live
    # distributor price if present, else its parametric estimate.
    pv_by_mpn = _index_partverifications_by_mpn(state)
    for row in rb:
        line = num(row.get("line_gbp"))
        unit_p = num(row.get("unit_gbp"))
        if line is None or unit_p is None or line <= 0 or unit_p <= 0:
            continue
        tag = str(row.get("tag") or "?")
        pv = _match_partverification_by_mpn(row, pv_by_mpn)
        if not pv:
            continue  # no real mfr+MPN on this line -> nothing authoritative to band
        ref, ref_src = _reference_unit_price(pv)
        if ref is None or ref <= 0:
            continue
        # A line whose BoM price was DELIBERATELY GROUNDED to the market band (because the raw
        # estimate fell OUTSIDE the band) IS the band-corrected market value — banding it against
        # the rejected pre-grounding estimate is meaningless and self-contradictory (the grounding
        # IS the sanity correction). Pass it with a note. Universal — any £/kW(/kVA)-grounded line.
        # (Tristan 2026-06-22: E-101 PHE £88k = 400kW×£220/kW grounded UP from a £2,740 below-band
        # LLM estimate; the £88k is correct, the £2,740 was the bad number.)
        basis = str(row.get("basis") or "")
        grounded = "grounded to market" in basis
        # SAME self-contradiction, other vocabularies (BESS cross-val 2026-07-03): the pricing
        # pass writes its deliberate corrections as "lifted £X→£Y to the engine corpus p25/
        # 0.6×median", "floored to min credible price", "commodity-floor (…)", "capped to pack
        # micro-commodity ceiling", "gate-21 >5× correction". Each states the raw estimate was
        # REJECTED as out-of-band — so banding the corrected price against that SAME rejected
        # PARAMETRIC ESTIMATE re-litigates a decision already taken (22 false FAILs on the first
        # BESS run under this check). The exemption is deliberately NARROW: it applies ONLY when
        # the reference is the weak parametric estimate. A LIVE DISTRIBUTOR price is independent
        # market evidence the correction never saw — a corrected line that still diverges from a
        # real catalogue price stays FLAGGED (e.g. the 1 MW PCS 'lifted' to £181 vs its £75,000
        # distributor price — a genuine corpus-comparable mis-class, not a check artefact).
        corrected = bool(_DELIBERATE_PRICE_CORRECTION_RE.search(basis))
        # BESPOKE / MADE-TO-ORDER fabrication (see _BESPOKE_FABRICATION_RE above): the
        # row's own text names it a one-off shop-built item, so no commodity estimate is
        # a valid comparator regardless of which direction the ratio falls.
        bespoke = _is_bespoke_fabrication(row)
        ratio = unit_p / ref
        out_of_band = (ratio > COST_BAND_FACTOR or ratio < (1.0 / COST_BAND_FACTOR))
        # the correction exemption ENGAGES only where the band would otherwise FIRE —
        # an in-band corrected row keeps the plain band-comparison detail (a passing
        # row's rendered text is byte-identical to the pre-exemption behaviour).
        exempt = grounded or bespoke or (corrected and out_of_band and ref_src == "price_estimate_gbp")
        # CATALOGUE-PIN re-band (codema v60 I-104, same self-contradiction family): a row
        # whose basis states the price IS a catalogue quote ('catalogue' / 'distributor
        # catalogue (db:…)' / 'library match') was banded against price_estimate_gbp — but
        # when TWO partVerifications share one MPN the first-indexed pv wins the join, and
        # a cost-repair pass may have OVERWRITTEN that pv's estimate with a parametric-
        # physics figure the pricing pass never used (I-104: £76 KPI35 catalogue pin banded
        # vs the DP-switch sub-component's £420 parametric-physics overwrite = x0.2 false
        # FAIL). Re-band against the row's OWN quote instead — the basis-embedded (db:…£N)
        # figure, else the pv's engine-B corpus quote. BOTH directions: a catalogue-basis
        # row whose rendered price still diverges from its own quote FAILs (dishonest
        # 'catalogue' label), and a catalogue claim with NO recoverable quote behind it
        # keeps the plain parametric band-FAIL (BESS I-17 stays caught). Engages only where
        # the band would otherwise FIRE and only on the weak parametric reference — a LIVE
        # distributor reference is independent market evidence and is never displaced.
        if (not exempt) and out_of_band and ref_src == "price_estimate_gbp" \
                and _CATALOGUE_PIN_BASIS_RE.match(basis):
            own, own_src = _own_catalogue_quote(pv, basis)
            if own is not None:
                ref, ref_src = own, own_src
                ratio = unit_p / ref
                out_of_band = (ratio > COST_BAND_FACTOR
                               or ratio < (1.0 / COST_BAND_FACTOR))
        bad = (not exempt) and out_of_band
        # UNIT-BASIS RECONCILIATION (X-6 CLI PARITY, 2026-07-05) — engages ONLY
        # where the band would otherwise FIRE, same idiom as the catalogue-pin
        # re-band above: a piece-of-stock line under-priced by a plausible
        # die-cut/cut-length yield of its reference is the SAME false-defect
        # gate 21 downgrades, not an independent CLI hard-FAIL. Genuine
        # mispricing (a non-piece-of-stock noun, or the OVER direction — INV-4's
        # £181-vs-£75,000 PCS) is NEVER excused and stays a hard FAIL — proven
        # by the XVAL selftest below.
        recon_applied = False
        recon_note = None
        if bad:
            _item_name = f"{row.get('part') or ''} {row.get('requirement') or ''}".strip()
            recon_applied, _recon_yield, recon_note = _reconcile_unit_basis_gbp(
                _item_name, unit_p, ref)
            if recon_applied:
                bad = False
        # DISCLOSED DISPLAY FLOOR (2026-07-11 run 65): a pennies-truth commodity line
        # floored to £1 for integer-display honesty (basis says 'commodity-floor …
        # renders £0') is a DISCLOSED rendering rule, not a pricing error — the band
        # (£1 vs a £0.11 catalogue truth = 9×) must not fire on the engine's own
        # documented floor. Scoped hard: floor value ≤ £1 AND the basis discloses it.
        if bad and unit_p is not None and unit_p <= 1.0 \
                and "commodity-floor" in str(row.get("basis") or ""):
            bad = False
            recon_note = "disclosed sub-£1 commodity display floor (basis-documented)"
        out.append(Check(
            name=f"BoM {tag}: unit price within x{COST_BAND_FACTOR:g} of {ref_src}",
            category="COST", relation="eq",
            status=FAIL if bad else PASS,
            actual=unit_p, expected=(unit_p if (exempt or recon_applied) else ref), tol=0.0, unit="GBP",
            producer=f"cost:{tag}:ref",
            detail=(f"{tag} ({pv.get('manufacturer','?')} {pv.get('part_number','?')}): "
                    + (f"price GROUNDED to the market band (£{unit_p:,.0f}); the pre-grounding "
                       f"{ref_src} £{ref:,.0f} was rejected as out-of-band — banding against it is "
                       f"not meaningful." if grounded
                       else (f"BESPOKE / MADE-TO-ORDER fabrication (£{unit_p:,.0f}); a commodity "
                             f"{ref_src} £{ref:,.0f} is not a valid comparator for a one-off "
                             f"fabricated-to-order item — banding against it is not meaningful."
                             if bespoke
                             else (f"price DELIBERATELY CORRECTED by the pricing pass (£{unit_p:,.0f}; "
                             f"basis: {basis[:80]}); the parametric {ref_src} £{ref:,.0f} was "
                             f"rejected/superseded by that correction — banding against it is "
                             f"self-contradictory." if exempt
                             else (f"RECONCILED — unit-basis (non-blocking): {recon_note}" if recon_applied
                             else f"BoM unit £{unit_p:,.0f} vs {ref_src} £{ref:,.0f} = x{ratio:.1f}. "
                             f"Flag when >x{COST_BAND_FACTOR:g} or <x{1/COST_BAND_FACTOR:g}."))))),
        ))

    # --- COST2. Sigma BoM line_gbp == cover / grand total ---
    bom_sum = sum(num(r.get("line_gbp")) or 0.0 for r in rb)
    grand = num(pl.get("grand_total_gbp"))
    src = "parts-ledger.grand_total_gbp"
    if grand is None:
        roll = ((state.get("costBasis") or {}).get("rollup") or {})
        grand = num(roll.get("purchased_gbp"))
        src = "costBasis.rollup.purchased_gbp"
    if bom_sum and grand is not None:
        out.append(Check(
            name="Sigma requirementsBom.line_gbp == cover grand total",
            category="COST", relation="eq",
            status=_eq_status(bom_sum, grand, _tol_pct(grand, 0.01, 1.0)),
            actual=bom_sum, expected=grand,
            tol=_tol_pct(grand, 0.01, 1.0), unit="GBP",
            producer="cover_total",
            detail=(f"Sum of {len(rb)} BoM line_gbp values vs {src}."),
        ))

    return out


# ============================================================================
# CONNECTIVITY / SPEC
# ============================================================================
# Abstract SERVICE-BOUNDARY termini — an edge may legitimately end on a system boundary
# that is not a physical part. Mirrors connection_ledger._ABSTRACT_BOUNDARY_RE (the fluid
# battery-limit families) + the electrical/thermal SERVICE termini an electrical-storage
# archetype's contract edges end on (dc/ac/hv/lv/mv service bus, heat rejection/sink).
# Keyed on the service-family NAME (snake_case contract node ids), never a class table —
# a real part name ('DC busbar 1500 V') or a misspelled part never matches.
_SERVICE_BOUNDARY_ENDPOINT_RE = re.compile(
    r"utility[_ -]?incomer|\bgrid\b|\bmains\b|battery[_ -]?limit|electrical[_ -]?supply|"
    r"power[_ -]?supply\b|incoming[_ -]?supply|"
    r"atmosphere|ambient|to[_ -]?sea|\bsewer\b|public[_ -]?network|off[_ -]?site|"
    # effluent / disposal / drain-to-waste termini (water plants discharge here)
    r"\beffluent\b|\bdisposal\b|waste[_ -]?stream|drain[_ -]?to[_ -]?waste|"
    r"\b(?:dc|ac|hv|lv|mv)_bus\b|\bheat[_ -]?reject(?:ion)?\b|"
    r"\b(?:heat|thermal|cold)[_ -]?sink\b", re.I)


def _checks_connectivity(state: dict, run_dir: str) -> List[Check]:
    out: List[Check] = []

    # --- CONN0. CONNECTION-GRAPH COVERAGE (the deterministic complement to the LLM
    # connectivity judge): every PROCESS part must have BOTH a fluid in and out (it sits
    # in a flow path), every INSTRUMENT must have an association (it is wired to what it
    # measures / to control). The parts-ledger connectivity audit computes these per the
    # part TYPE (process / instrument / electrical / buffer / origin / sink). We assert
    # the two coverage fractions clear 0.8 — the SAME ≥80% gate the scorecard's
    # connectivity score uses (round(min(procPct,instPct)*10) ≥ 8). Universal, no class
    # table; reads the derived ledger so it tracks whatever the run actually built. ---
    pl = _load_json(os.path.join(run_dir, "parts-ledger.json")) or {}
    conn = pl.get("connectivity") if isinstance(pl, dict) else None
    if isinstance(conn, dict):
        n_proc = num(conn.get("n_process_total")) or 0.0
        n_proc_ok = num(conn.get("n_process_connected")) or 0.0
        n_inst = num(conn.get("n_instrument_total")) or 0.0
        n_inst_ok = num(conn.get("n_instrument_associated")) or 0.0
        if n_proc > 0:
            frac = n_proc_ok / n_proc
            out.append(Check(
                name="Process parts with both fluid in+out (coverage >= 80%)",
                category="CONNECTIVITY", relation="ge",
                status=PASS if frac >= 0.8 - 1e-9 else FAIL,
                actual=round(frac, 4), expected=0.8, tol=0.0, unit="fraction",
                a_factors=(1.0 / n_proc, n_proc_ok),
                producer="conn:process_coverage",
                detail=(f"{int(n_proc_ok)} of {int(n_proc)} process parts are fully "
                        f"connected (fluid in AND out). The connection graph is "
                        f"incomplete below 80% — a vessel/pump/valve with a missing "
                        f"feed or discharge is a topology gap. "
                        f"{int(conn.get('n_concerns', 0) or 0)} concern(s) total."),
            ))
        if n_inst > 0:
            frac = n_inst_ok / n_inst
            out.append(Check(
                name="Instruments associated to what they measure (coverage >= 80%)",
                category="CONNECTIVITY", relation="ge",
                status=PASS if frac >= 0.8 - 1e-9 else FAIL,
                actual=round(frac, 4), expected=0.8, tol=0.0, unit="fraction",
                a_factors=(1.0 / n_inst, n_inst_ok),
                producer="conn:instrument_coverage",
                detail=(f"{int(n_inst_ok)} of {int(n_inst)} instruments are wired "
                        f"(>=1 signal/sense association). Below 80% leaves orphan "
                        f"sensors not tied to the process or the control system."),
            ))

    # --- CONN0. STRICT LEDGER COMPLETENESS (Tristan 2026-06-20: "the ledger must have a
    # deterministic check so every part shows an input AND output of all required
    # connections — this should have flagged the issue"). Reads the ledger's own
    # completeness audit (connection-ledger.json :: completeness.concerns), where a
    # concern = a part missing a required fluid-input / fluid-output / power / signal
    # connection. This is STRICT (any concern FAILS) — it replaces the old 80%-coverage
    # check that absorbed real gaps (2 missing in 23 parts = 91% silently passed).
    cledger = _load_json(os.path.join(run_dir, "connection-ledger.json"))
    # UNIVERSAL fix (Tristan 2026-06-24): connection-ledger.json is authored ONLY inside Blender's
    # build_universal_scene and is absent or stale in PDF-off / Excel-only mode — so reading only
    # it made this STRICT completeness check silently SKIP on every class but RAS. The SAME
    # per-part connection completeness is computed EVERY chain, bpy-free, by parts_ledger.py →
    # parts-ledger.json :: connectivity. Prefer that when present.
    #
    # DECISION (2026-07-17): PREFER parts-ledger whenever it carries connectivity — do not
    # merely fall back when connection-ledger is missing. freshen-scorer re-runs parts_ledger
    # AFTER BoM cleanup but does NOT rewrite connection-ledger, so a stale Blender plant-era
    # completeness concern (e.g. handheld "Control Switch" missing signal) survived while
    # parts_ledger correctly reported 0 concerns. parts-ledger is the settled authority.
    _pl = _load_json(os.path.join(run_dir, "parts-ledger.json"))
    if isinstance(_pl, dict) and isinstance(_pl.get("connectivity"), dict):
        _cc = _pl["connectivity"]
        _concerns_norm = [
            {"part": (c.get("tag") or c.get("part") or c.get("name") or "?"),
             "missing": ([c.get("issue")] if c.get("issue") else (c.get("missing") or []))}
            for c in (_cc.get("concerns") or [])]
        cledger = {
            "completeness": {
                "n_concerns": int(_cc.get("n_concerns") if _cc.get("n_concerns") is not None
                                  else len(_cc.get("concerns") or [])),
                "concerns": _concerns_norm},
            "referential_integrity": (
                _pl.get("referential_integrity")
                or (cledger.get("referential_integrity") if isinstance(cledger, dict) else {})
                or {}
            )}
    if isinstance(cledger, dict) and isinstance(cledger.get("completeness"), dict):
        comp = cledger["completeness"]
        concerns = comp.get("concerns") or []
        n = int(comp.get("n_concerns") or len(concerns))
        sample = "; ".join(
            f"{c.get('part','?')} missing [{', '.join(c.get('missing', []))}]"
            for c in concerns[:6])
        out.append(Check(
            name="Ledger completeness: every part shows its required input + output",
            category="CONNECTIVITY", relation="le",
            status=PASS if n == 0 else FAIL,
            actual=float(n), expected=0.0, tol=0.0, unit="parts",
            producer="conn:ledger_completeness",
            detail=(f"{n} part(s) are missing a required connection in the authored "
                    f"ledger — the design is not fully connected. Each process part must "
                    f"show a fluid INPUT and OUTPUT (naming what it connects to/from); a "
                    f"powered part a power feed; an instrument a signal tie. "
                    + (f"e.g. {sample}." if sample else "All parts fully connected.")
                    + " Fix at the ledger completion (close every part's missing "
                      "direction), not by inventing a render pipe."),
        ))

        # --- CONN0b. REFERENTIAL INTEGRITY — every connection names a real part on both
        # ends with the EXACT name (Tristan 2026-06-20: "if line 1 connects to line 3,
        # line 3 should say its input is from line 1 — in Excel we should trace whole
        # systems this way"). A broken reference = a connection the trace cannot follow.
        ri = cledger.get("referential_integrity") or {}
        if isinstance(ri, dict):
            # SERVICE-BOUNDARY endpoints are NOT broken references (BESS cross-val fix
            # 2026-07-03): the ledger authoring recognised the fluid-era battery-limit
            # termini (grid / atmosphere / sewer / battery limit) but not the electrical-
            # storage-era SERVICE termini a contract edge legitimately ends on — the
            # dc/ac service bus ('dc_bus') and the thermal sink ('heat_rejection'). Both
            # are abstract system edges keyed on their SERVICE family, exactly like
            # 'enclosure_atmosphere' (which already passed via 'atmosphere'). Filter them
            # here so the check keys on service family, both directions: a misspelled
            # real-part endpoint still has no service-family name and still FAILS.
            vs = [v for v in (ri.get("violations") or [])
                  if not _SERVICE_BOUNDARY_ENDPOINT_RE.search(str(v.get("name") or ""))]
            nv = len(vs)
            vsample = "; ".join(f"{v.get('edge')} [{v.get('end')}={v.get('name')!r}]"
                                for v in vs[:4])
            out.append(Check(
                name="Ledger referential integrity: every connection names a real part",
                category="CONNECTIVITY", relation="le",
                status=PASS if nv == 0 else FAIL,
                actual=float(nv), expected=0.0, tol=0.0, unit="refs",
                producer="conn:ledger_referential_integrity",
                detail=(f"{nv} connection reference(s) point to a name that is not an "
                        f"authored part — the graph is not fully traceable. Every edge "
                        f"A→B must name B by its exact part name AND appear in B's inputs. "
                        + (f"e.g. {vsample}." if vsample else "All references resolve; "
                           "the whole system is traceable part-to-part.")),
            ))

    cs = _load_json(os.path.join(run_dir, "connection-schedule.json"))
    if not cs:
        return out
    rows = cs.get("rows") or []

    # --- CONN1. tally of within_spec == false rows ---
    bad_rows = [r for r in rows if r.get("within_spec") is False]
    if rows:
        out.append(Check(
            name="Connection rows within_spec == false (tally)",
            category="CONNECTIVITY", relation="tally",
            status=FAIL if bad_rows else PASS,
            actual=float(len(bad_rows)), expected=0.0, tol=0.0, unit="rows",
            producer="conn:within_spec_false",
            detail=(f"{len(bad_rows)} of {len(rows)} connection runs are out of "
                    f"spec (e.g. over-velocity pipe / over-voltdrop cable). "
                    + (f"First: {bad_rows[0].get('from')}->{bad_rows[0].get('to')} "
                       f"{bad_rows[0].get('size')} @ {bad_rows[0].get('drop')}."
                       if bad_rows else "All within spec.")),
        ))

    # --- CONN2. derived velocity <= stated spec limit (per pipe spec) ---
    # The run states each pipe spec's own limit ("<=3 m/s velocity") + the achieved
    # velocity. We re-assert it deterministically rather than trust the flag, and
    # report the single worst-offending line as a representative adequacy check.
    worst = None
    for sp in (cs.get("specs") or []):
        if sp.get("kind") != "pipe":
            continue
        vel = num(sp.get("drop_pct_or_velocity"))
        lim = _parse_velocity_limit(sp.get("spec_limit"))
        if vel is None or lim is None:
            continue
        if worst is None or vel > worst[0]:
            worst = (vel, lim, sp)
    if worst is not None:
        vel, lim, sp = worst
        out.append(Check(
            name=f"Worst pipe velocity <= spec limit ({sp.get('size_label','?')})",
            category="CONNECTIVITY", relation="le",
            status=PASS if vel <= lim + 1e-9 else FAIL,
            actual=vel, expected=lim, tol=0.0, unit="m/s",
            producer="conn:worst_velocity",
            detail=(f"{sp.get('size_label','?')} carries {vel:g} m/s vs its stated "
                    f"limit {lim:g} m/s. Over-velocity = erosion / head loss "
                    f"({len([1 for s in (cs.get('specs') or []) if s.get('kind')=='pipe' and (num(s.get('drop_pct_or_velocity')) or 0) > (_parse_velocity_limit(s.get('spec_limit')) or 1e9)])} pipe specs over limit)."),
        ))

    # --- CONN3. ROUTE-LENGTH PLAUSIBILITY (the geometry blind-spot closer) ---------
    # A connection's BoM cost = length x GBP/m, and the LENGTH comes from the Blender
    # layout. So a LOOSE layout silently inflates cost: the suite checks the length x
    # rate ARITHMETIC but never whether the length itself is PHYSICAL. Tristan caught a
    # 88 m run inside a ~27 m building from the render alone (a 'web' of over-long
    # mains). This check makes the blind-spot permanent and universal: derive the plant
    # bounding-box DIAGONAL from the as-routed waypoints (route-manifest.json), then no
    # single routed run may exceed diagonal x 1.8 (1.8 = generous orthogonal up-along-
    # down routing overhead over a straight line), and the TOTAL routed length may not
    # exceed diagonal x n_runs x 1.25. Either breach = an inflated layout. Self-contained
    # (needs only the manifests), class-agnostic (no building-dims lookup, no per-class
    # constant). Skips silently when there are no routed waypoints.
    rm = _load_json(os.path.join(run_dir, "route-manifest.json")) or {}
    rm_lines = rm.get("lines") if isinstance(rm, dict) else None
    if isinstance(rm_lines, list) and rm_lines:
        # INDEPENDENT plant scale — must NOT be derived from the routed extent itself
        # (a loose layout inflates its own bounding box, so its long runs would always
        # look 'plausible' against it — circular). Prefer the engine-emitted BUILDING
        # footprint (the hall the equipment must physically fit inside); else derive a
        # minimum hall from the summed equipment plan area x a circulation factor; only
        # as a last resort fall back to the routed bbox (noted as circular). Universal:
        # building_footprint key names are class-agnostic; the equipment-area fallback
        # works for any archetype.
        diag_m = 0.0
        diag_basis = ""
        _state = _load_json(os.path.join(run_dir, "state.json")) or {}
        _q = ((_state.get("orchestratorContract") or {}).get("quantities") or {}) if isinstance(_state, dict) else {}
        def _qnum(*keys):
            for k in keys:
                v = _q.get(k)
                if isinstance(v, dict):
                    v = v.get("value")
                if isinstance(v, (int, float)) and v > 0:
                    return float(v)
            return None
        footprint_m2 = _qnum("building_footprint_m2", "building_gross_floor_area_m2",
                             "plan_area_m2", "floor_area_m2", "hall_area_m2", "gross_floor_area_m2")
        if footprint_m2:
            # diagonal of a hall of this area, allowing a modest 1.5:1 aspect (factor 2.17).
            diag_m = (footprint_m2 * 2.17) ** 0.5
            diag_basis = f"building footprint {footprint_m2:.0f} m²"
        else:
            # fallback A — minimum hall from the summed equipment plan area x circulation.
            pm = _load_json(os.path.join(run_dir, "parts-manifest.json")) or {}
            _parts = pm.get("parts") if isinstance(pm, dict) else (pm if isinstance(pm, list) else [])
            equip_area = 0.0
            for p in (_parts or []):
                dm = p.get("dims_mm") if isinstance(p, dict) else None
                if isinstance(dm, (list, tuple)) and len(dm) >= 2 and all(isinstance(x, (int, float)) for x in dm[:2]):
                    equip_area += (dm[0] * dm[1]) / 1e6 * max(1, int(p.get("qty") or 1))
            if equip_area > 1.0:
                hall = equip_area * 2.5   # circulation / aisles / clearance
                diag_m = (hall * 2.17) ** 0.5
                diag_basis = f"min hall {hall:.0f} m² from equipment area {equip_area:.0f} m²"
        if diag_m <= 0.5:
            # last resort — routed bbox (CIRCULAR; only when no footprint/equipment data).
            xs: List[float] = []; ys: List[float] = []
            for ln in rm_lines:
                for wp in (ln.get("waypoints_mm") or []):
                    if isinstance(wp, (list, tuple)) and len(wp) >= 2:
                        try:
                            xs.append(float(wp[0])); ys.append(float(wp[1]))
                        except (TypeError, ValueError):
                            pass
            if xs and ys:
                diag_m = (((max(xs) - min(xs)) ** 2 + (max(ys) - min(ys)) ** 2) ** 0.5) / 1000.0
                diag_basis = "routed bbox (no building footprint — circular fallback)"
        if diag_m > 0.5:
            def _runlen(ln: dict) -> float:
                # PLAN (2-D, x-y) length, NOT the 3-D routed length. A loose LAYOUT is a
                # HORIZONTAL property; the run's vertical travel up to the overhead pipe-
                # rack and back (≈2×rack height ≈ 30-40 m on EVERY run) is a fixed routing
                # overhead, not layout looseness, and the diagonal it's compared against is
                # itself 2-D — so counting the 3-D rise made the gate apples-to-oranges
                # (a well-placed pair read 109 m / 81 m-plan). Sum the x-y segments from the
                # waypoints; fall back to the stored routed length only when absent.
                wp = ln.get("waypoints_mm")
                if isinstance(wp, list) and len(wp) >= 2:
                    tot = 0.0
                    for a, b in zip(wp[:-1], wp[1:]):
                        try:
                            tot += ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
                        except (TypeError, IndexError):
                            return 0.0
                    return tot / 1000.0
                v = ln.get("length_routed_m")
                if not isinstance(v, (int, float)):
                    v = ln.get("length_m")
                return float(v) if isinstance(v, (int, float)) else 0.0
            run_lengths = [(_runlen(ln), ln) for ln in rm_lines]
            run_lengths = [(L, ln) for (L, ln) in run_lengths if L > 0]
            if diag_m > 0.5 and run_lengths:
                max_single = max(run_lengths, key=lambda t: t[0])
                plausible_single = diag_m * 1.8
                worst_ln = max_single[1]
                out.append(Check(
                    name="Longest connection run <= plant diagonal x 1.8 (length plausibility)",
                    category="CONNECTIVITY", relation="le",
                    status=PASS if max_single[0] <= plausible_single + 1e-9 else FAIL,
                    actual=round(max_single[0], 1), expected=round(plausible_single, 1),
                    tol=0.0, unit="m", producer="conn:run_length_plausibility",
                    detail=(f"Longest routed run {max_single[0]:.0f} m "
                            f"({worst_ln.get('from_tag','?')} -> {worst_ln.get('to_tag','?')}) "
                            f"vs plant footprint diagonal {diag_m:.0f} m. A run beyond "
                            f"~1.8x the diagonal is not physical inside the plant envelope "
                            f"-> the layout is loose and its length x GBP/m cost is inflated. "
                            f"Fix at the placement source (cluster connected equipment), "
                            f"not the cost rate."),
                ))
                total_routed = sum(L for L, _ in run_lengths)
                plausible_total = diag_m * len(run_lengths) * 1.25
                out.append(Check(
                    name="Total connection length <= diagonal x n_runs x 1.25",
                    category="CONNECTIVITY", relation="le",
                    status=PASS if total_routed <= plausible_total + 1e-9 else FAIL,
                    actual=round(total_routed, 0), expected=round(plausible_total, 0),
                    tol=0.0, unit="m", producer="conn:total_length_plausibility",
                    detail=(f"Total routed connection length {total_routed:.0f} m over "
                            f"{len(run_lengths)} runs vs a plausible {plausible_total:.0f} m "
                            f"(diagonal {diag_m:.0f} m x {len(run_lengths)} runs x 1.25). "
                            f"A systemic overshoot means the layout strings equipment wider "
                            f"than the building -> inflated pipe/cable take-off."),
                ))

    return out


# ============================================================================
# Status + tolerance primitives
# ============================================================================
# Ceiling on any ABSOLUTE tolerance floor, as a fraction of the value being
# compared. Guarantees every check can fail (>10% error) without letting a fixed
# floor swallow a small quantity. See _tol_pct for why this is 0.10, not 0.5.
FLOOR_CAP_FRACTION = 0.10


def _tol_pct(base: Optional[float], pct: float, floor: float) -> float:
    """Relative tolerance with a magnitude-aware absolute floor.

    Pattern: ``max(|base|·pct, min(floor, |base|·FLOOR_CAP))``.
    The floor is capped at a fraction of |base| so a fixed absolute floor (e.g.
    £1.0) can never swallow an entire small expected value — unit=0, qty=1,
    line=1 must still FAIL rather than pass inside a £1 window around a £1 line.

    ⭐ THE CAP WAS 0.5 AND IS NOW 0.10 (2026-08-03). A 0.5 cap GUARANTEES
    falsifiability — you need >50% error to fail — and that is the floor the
    falsifiability audit enforces. But it also OVERRIDES the relative term upward
    for every small quantity: coolant_viscosity_pa_s (0.001375) came out with a
    0.000687 tolerance, a 50% window, so a tool could be 40% wrong and pass.
    "Cannot be unfalsifiable" is a floor, not a quality bar. 0.10 keeps the same
    guarantee (>10% error fails) at five times the tightness, and still protects
    the small-magnitude case the cap exists for.
    """
    if base is None:
        return floor
    ab = abs(base)
    if ab == 0.0:
        return floor
    return max(ab * pct, min(floor, ab * FLOOR_CAP_FRACTION))


def _tool_eq_tol(qv: float) -> float:
    """Magnitude-aware equality tol for tool-output vs contract quantity.

    A flat 0.01 floor swallows mPa·s-scale values (coolant_viscosity_pa_s
    0.001 vs 0.002 would PASS). Cap the floor at a fraction of |qv| the same way
    ``_tol_pct`` does — see the note there on why that fraction is 0.10 and not
    0.5: a 50% window is falsifiable but not a check worth having.
    """
    ab = abs(qv)
    if ab == 0.0:
        return 0.01
    return max(ab * 0.02, min(0.01, ab * FLOOR_CAP_FRACTION))


def _tool_round(v: Optional[float]) -> Optional[float]:
    """Round tool/contract values for Check display without erasing small magnitudes.

    ``round(v, 3)`` turns 0.00101 → 0.001 and round(tol, 3) can zero a
    sub-0.01 tolerance; keep 6 d.p. when |v| < 1e-2.
    """
    if v is None:
        return None
    if abs(v) < 1e-2 and v != 0.0:
        return round(v, 6)
    return round(v, 3)


def _eq_status(actual: float, expected: float, tol: float) -> str:
    return PASS if abs(actual - expected) < tol else FAIL


def _ge_status(actual: float, expected: float) -> str:
    # rating must be >= duty; a tiny epsilon absorbs float noise at equality.
    return PASS if actual >= expected - 1e-9 - abs(expected) * 1e-9 else FAIL


def _ge_ceiling_status(actual: float, expected: float, ceiling: Optional[float]) -> str:
    """rating >= duty AND rating <= magnitude ceiling. The v55 lesson (2026-07-02):
    an adequacy check with no upper bound "blessed" a 184,166,200 kVA incomer against a
    53 kW load. Adequacy means 'in the right band', not 'as big as any corrupt number'."""
    if _ge_status(actual, expected) == FAIL:
        return FAIL
    if ceiling is not None and actual > ceiling * (1 + 1e-9):
        return FAIL
    return PASS


def _ceiling_clause(actual: float, ceiling: Optional[float], base_label: str) -> str:
    """The stated-basis sentence for the magnitude ceiling — always states the basis;
    turns into an explicit breach callout when the ceiling is broken."""
    if ceiling is None:
        return "."
    if actual > ceiling * (1 + 1e-9):
        return (f". MAGNITUDE CEILING BREACHED: {actual:g} > {ceiling:.4g} "
                f"(= {base_label} x {MAGNITUDE_CEILING_FACTOR:g} sanity ceiling) — a rating "
                f"~{actual / (ceiling / MAGNITUDE_CEILING_FACTOR):,.0f}x its duty is a corrupt "
                f"quantity, not an adequate device. FAIL.")
    return (f"; magnitude sanity ceiling <= {base_label} x {MAGNITUDE_CEILING_FACTOR:g} "
            f"= {ceiling:.4g} (an absurdly-large rating must FAIL, not pass as 'adequate').")


# ============================================================================
# Parsing helpers
# ============================================================================
_INEQUALITY_PROSE = re.compile(
    r"≤|≥|<=|>=|<|>|ceiling|limit|within|at most|at least|no more than|"
    r"max(?:imum)?|min(?:imum)?|under|below|above|not exceed|cap\b",
    re.IGNORECASE,
)

# A literal 'A/B' fraction with digits on BOTH sides (e.g. the CaCO3/CO2 molar-mass
# ratio '100/44') — a CONVERSION RATIO embedded in the closure prose, never two
# independent multiplicands. 'ah / 1000' (a unit-scaling divisor with no digit before
# the slash) does NOT match, so this stays scoped to genuine numeric fractions.
_FRACTION_RE = re.compile(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)")


def _extract_equality_target(required: str, measured: Optional[float]) -> Optional[float]:
    """A numeric EQUALITY target out of a closure's prose ('A x B'); None for a
    one-sided inequality (turning '<= £5M' into 'expected=5M' would fabricate a
    FAIL the engine itself does not assert)."""
    if not required or _INEQUALITY_PROSE.search(required):
        return None
    s = required.replace(",", "")
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", s)]
    has_x = "×" in required or " x " in required.lower()
    # RATIO-FRACTION GUARD (caco3 stoichiometry fix, 2026-07-06): a closure like
    # 'CaCO3 output ≈ CO2 fixed × 100/44 ≈ 2.27 t/d (stoichiometric)' multiplies an
    # UNSTATED base quantity ('CO2 fixed', no literal number in the prose) by a molar-
    # mass RATIO written as 'A/B'. Blindly taking nums[0]*nums[1] reads the ratio's own
    # numerator/denominator as if they were the two "A × B" operands (100×44=4400 — a
    # fabricated target 1900× the closure's OWN already-computed, explicitly-stated
    # closing value). When the prose embeds such a fraction AND states a further number
    # afterwards (its own declared result — CaCO3-mineralisation runs consistently
    # write '≈ 2.27 t/d' etc.), trust that trailing stated value instead of synthesising
    # one from the ratio's parts. Universal: keyed on the fraction SHAPE, not on any
    # archetype-specific quantity name.
    if has_x:
        frac = _FRACTION_RE.search(s)
        if frac:
            frac_nums = {float(frac.group(1)), float(frac.group(2))}
            trailing = [n for n in nums if n not in frac_nums]
            if trailing:
                return trailing[-1]
        if len(nums) >= 2:
            return nums[0] * nums[1]
    if len(nums) == 1 and measured is not None:
        return nums[0]
    return None


def _parse_velocity_limit(spec_limit: Any) -> Optional[float]:
    """'<=3 m/s velocity' -> 3.0 ; returns None when no m/s figure present."""
    if not isinstance(spec_limit, str):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*m/s", spec_limit)
    return float(m.group(1)) if m else None


# ============================================================================
# BoM + partVerification indexing
# ============================================================================
def _requirements_bom(state: dict) -> List[dict]:
    rb = state.get("requirementsBom")
    if isinstance(rb, dict):
        rb = rb.get("lines") or rb.get("rows") or []
    return rb if isinstance(rb, list) else []


def _index_partverifications_by_mpn(state: dict
                                    ) -> Dict[Tuple[str, str], List[dict]]:
    """Index partVerifications by (manufacturer.lower, part_number.lower) — the one
    unambiguous join key. Only real part numbers (>=4 chars) are indexed; the
    generic placeholder rows have no usable MPN and are simply absent.

    Returns ALL partVerifications sharing a key, in state order (codema v77 fix,
    2026-07-05): two DIFFERENT principal words can legitimately share one
    manufacturer+part_number — a DB-first match resolving to the same generic
    catalogue shell (Pentair's "36X72 COMP" composite pressure vessel serves both
    a softener vessel AND a GAC-softener vessel at different sizes), or an early
    placeholder word superseded by a later, correctly-priced duplicate (a
    'Solenoid Valves' Engine-B curve estimate vs a 'Solenoid Valve' verified
    Farnell price). The OLD ``setdefault`` shape kept only the FIRST pv per key
    and silently discarded every other candidate, so a BoM row that genuinely
    matched the SECOND (freshly-priced) word was joined to the FIRST (stale)
    sibling's price instead — a two-truths artefact (v77 V-103 £14,825 vs a
    stale £840; V-108 £393 vs a stale £25), not a wrong price. See
    ``_best_pv_candidate`` for how a BoM row picks among multiple candidates."""
    idx: Dict[Tuple[str, str], List[dict]] = {}
    for pv in (state.get("partVerifications") or []):
        pn = str(pv.get("part_number") or "").strip()
        mfr = str(pv.get("manufacturer") or "").strip()
        if len(pn) >= 4 and mfr:
            idx.setdefault((mfr.lower(), pn.lower()), []).append(pv)
    return idx


def _best_pv_candidate(bom_row: dict, candidates: List[dict]) -> dict:
    """Disambiguate when >=2 partVerifications share one (manufacturer, part_number)
    key (codema v77, 2026-07-05). A requirementsBom row carries no word_id, so there is
    no exact identity link back to a specific word — but two words that GENUINELY
    price the same real catalogue part must carry the SAME reference price, while a
    word that merely coincidentally collides on that (manufacturer, part_number) string
    (a DB-first mis-match — e.g. codema v77's "Grundfos 96122012" landed on the real
    fertigation pump AND, wrongly, on an unrelated pump-assembly word AND a suction
    valve) prices from an entirely different component-class curve and sits far away.
    Picks the candidate whose OWN reference price (``_reference_unit_price`` — the same
    field cascade the band check itself reads) is closest to the row's rendered
    ``unit_gbp``, compared on a log scale so an over-bid (x17.6) and an under-bid
    (x0.004) are weighed the same way. This is NOT circular: it does not always pick a
    PASS — a row whose true price genuinely diverges from every candidate still has no
    close match to prefer and keeps today's FAIL (see the V-CTRL adversarial proveCatch
    below, and P-106 above the wrong 'closer-looking' name once mis-selected before this
    was tried on price instead of text). An earlier text-overlap heuristic was rejected
    here (proveCatch regression on P-106 codema v77: a verbose duplicate word's name
    shared MORE requirement tokens than the actually-correct concise duplicate). Falls
    back to the FIRST candidate (today's behaviour) when no candidate carries a usable
    reference price — an unresolvable ambiguity never invents a match it can't support.
    """
    if len(candidates) == 1:
        return candidates[0]
    unit_p = num(bom_row.get("unit_gbp"))
    if unit_p is None or unit_p <= 0:
        return candidates[0]
    best, best_dist = candidates[0], None
    for pv in candidates:
        ref, _ = _reference_unit_price(pv)
        if ref is None or ref <= 0:
            continue
        dist = abs(math.log(unit_p / ref))
        if best_dist is None or dist < best_dist:
            best, best_dist = pv, dist
    return best


def _match_partverification_by_mpn(bom_row: dict,
                                   idx: Dict[Tuple[str, str], List[dict]]
                                   ) -> Optional[dict]:
    """Match a BoM line to its partVerification ONLY by an exact manufacturer +
    part_number both appearing in the line's ``part`` string (e.g. the part
    'Grundfos UP15-42' joins the pv whose mfr='Grundfos', pn='UP15-42'). Returns
    None for any line that does not name a real mfr+MPN (e.g. 'requirement
    stated', 'made to spec', a structural take-off) — those have no authoritative
    independent price to band against, so we never fabricate a cost FAIL on them.
    When more than one partVerification shares that (mfr, pn) key, disambiguates
    via ``_best_pv_candidate`` (codema v77, 2026-07-05) instead of the first one
    indexed.

    MOST-SPECIFIC-FIRST (E-104 fix, 2026-07-06): a BoM row's ``part`` string can
    substring-match MULTIPLE indexed (mfr, pn) keys at once — e.g. a fully-qualified
    'CB30 (brazed-plate condenser)' key AND a plainer 'CB30' key shared by two
    UNRELATED CB30 duplicates both substring-match the row 'Alfa Laval CB30
    (brazed-plate condenser)'. Iterating ``idx.items()`` in plain (insertion) order
    returned on WHICHEVER key happened to be indexed first — on the CO2-mineralisation
    run that was the plainer 'CB30' key (indexed from an earlier, unrelated word), so
    the row joined a sibling's price (£3,000) instead of its own exact entry (£21,500),
    fabricating a x7.2 cost-band FAIL that was actually a checker mis-join, not a real
    mispriced part. The fuller/longer part_number is always the more precise
    identification of the specific catalogue variant a row names — checking the
    longest-pn keys first (while still requiring the same strict substring match)
    prefers that precision without weakening the match test itself."""
    part = str(bom_row.get("part") or "").strip().lower()
    if not part:
        return None
    for (mfr, pn), candidates in sorted(idx.items(), key=lambda kv: -len(kv[0][1])):
        if mfr in part and pn in part:
            return _best_pv_candidate(bom_row, candidates)
    return None


# ============================================================================
# PUBLIC ENTRY POINT
# ============================================================================
_BRIEF_UNIT_FAM = {
    "m3": "vol", "kg/m3": "density", "kg": "mass", "days": "time", "day": "time",
    "hr": "time", "h": "time", "mins": "time2", "min": "time2", "minute": "time2",
    "minutes": "time2", "%": "frac", "percent": "frac", "pct": "frac", "t/yr": "tpy",
    "tpy": "tpy", "tonne/yr": "tpy", "tonnes/yr": "tpy", "ratio": "ratio", "c": "temp",
    "degc": "temp", "ppt": "sal", "kw": "power", "mw": "power", "kwh": "energy",
    # INTENT (OpenFlexure 2026-07-17): brief `1 um` vs contract `1 µm` must share a family.
    "um": "len_um", "µm": "len_um", "μm": "len_um",
}


def _ufam(u: Any) -> str:
    # Fold the #86 unit-NOTATION variants to ONE canonical before the family lookup so a brief metric
    # in 'm3/hr' compares equal to a contract quantity in 'm³/h' (the v14 fertigation/hand-watering miss:
    # the CORRECT flow quantity was excluded because 'm3/hr' != 'm3/h'). ³→3, ²→2, caret dropped, and
    # every hour spelling (/hr, /hour, per hour, perhr) → /h.
    s = re.sub(r"\s+", "", str(u or "").lower()).replace("³", "3").replace("²", "2").replace("°", "").replace("^", "")
    s = s.replace("µ", "u").replace("μ", "u")
    s = s.replace("perhour", "/h").replace("/hour", "/h").replace("perhr", "/h").replace("/hr", "/h")
    return _BRIEF_UNIT_FAM.get(s, s)


def _btoks(s: Any) -> set:
    s = re.sub(r"[^a-z0-9]+", " ", str(s or "").lower())
    # GOTCHA (OpenFlexure 2026-07-17): `um` as a concept token made
    # focus_resolution_um fuzzy-bind abbe_resolution_um ({resolution, um}) and
    # HARD-FAIL a met 1 µm focus step against Abbe 0.611 µm. Drop unit tokens.
    _drop = {"kg", "m3", "mm", "um", "nm", "days", "day", "mins", "min", "minute", "minutes", "hr",
             "h", "s", "percent", "pct", "tpy", "yr", "year", "per", "c", "ppt", "kw",
             "mw", "kwh", "ml", "l", "w", "ratio", "the", "of", "value", "target", "a", "an"}
    return {t for t in s.split() if t and t not in _drop and not t.isdigit()}


def _is_cost_band_center(name) -> bool:
    """A cost/£ brief metric that names the CENTRE of a plausibility band (midpoint/typical/
    target_cost) — verified WITHIN-band (±20%), not with a directional ge. Mirrors
    build-excel-export + dossier_audit (the ONE-matcher doctrine). Organoid r11: a £291 BoM in
    a £275-385 band is economical and correct; a `ge` test on the £330 midpoint false-FAILed the
    'Brief target met: bom_cost_midpoint_gbp' invariant and floored Exec Summary/⚠ Checks."""
    nl = re.sub(r"[_\-]+", " ", str(name or "")).lower()
    is_cost = ("cost" in nl or "gbp" in nl or "price" in nl)
    return is_cost and bool(re.search(r"midpoint|mid point|\btypical\b|band cent|target cost", nl))


def _brief_metric_is_lower_better(key: str) -> bool:
    """Mirror build-excel-export / scorecard-floor ceiling semantics (ONE-matcher)."""
    kl = (key or "").lower()
    is_capability_floor = (
        "simultaneous" in kl or "output_capacity" in kl or "dissipation" in kl
    )
    is_ceiling = (not is_capability_floor) and (
        "_ceiling" in kl
        or "_cap_kg" in kl
        or "cost_ceiling" in kl
        or kl == "max_mass_kg"
        or kl == "max_rotor_speed_rpm"
        or kl == "max_system_voltage_v"
        or "_temp_limit" in kl
        or kl.endswith("_limit_c")
        or kl.endswith("_max_rpm")
        # HW power CLASS is a nameplate / survivability ceiling (not continuous
        # duty floor). Achieved envelope at Vdc,min must stay ≤ the class.
        or "power_class" in kl
        or bool(re.search(r"_max_(khz|l_per_min|nm|kw|v|a|c|ratio)\b", kl))
        or (
            kl.endswith("_max")
            and any(t in kl for t in (
                "ratio", "gear", "flow", "frequency", "speed", "torque", "throughput",
            ))
        )
        or (kl.startswith("max_") and ("voltage" in kl or "rotor_speed" in kl or "rpm" in kl))
        or kl.endswith("_max_c")
    )
    return is_ceiling or bool(
        "fcr" in kl or "feed_conversion" in kl or "conversion_ratio" in kl
        or "_days" in kl or "duration" in kl or "lead_time" in kl
        or "lcoe" in kl or "cost_per" in kl
        or "resolution" in kl or "linewidth" in kl or "detection_limit" in kl
        or "noise" in kl or "latency" in kl
        or ("cycle" in kl and bool(re.search(r"\btime\b|hour|minute|second|_s\b", kl)))
    )


def _is_out_of_scope_perimeter_metric(key: str) -> bool:
    kl = (key or "").lower()
    return (
        "car_level" in kl or "vehicle_level" in kl
        or "whole_vehicle" in kl or "whole_car" in kl
    )


def _qty_is_brief_only_identity(key: str, qentry: Any) -> bool:
    """True when a contract quantity is NOT a distinct ACHIEVED design value —
    it only restates the brief (or is a named assumption / class label / limit).

    SOURCE rule (Bar A 2026-08-03): never treat brief target T as achieved by
    contract key T when the quantity provenance is only the brief. Name patterns
    that declare the same thing even without an explicit source tag:

      * assumed_*          — design inputs, not delivered performance
      * *_power_class_*    — nameplate / class labels, not duty achieved
      * limit/ceiling/cap  — constraints; achieved lives under a different key
      * source == 'brief'  — brief-echoed identity (max_rotor_speed_rpm, …)

    A quantity with a tool/calculator source and no limit/assumed/class name is
    a real design value and may still bind (same-key fast path or candidate).
    """
    kl = str(key or "").lower()
    # Name declares "not an achieved quantity".
    if kl.startswith("assumed_"):
        return True
    # Class labels (front_hardware_power_class_kw) are envelope/nameplate tags,
    # not delivered shaft or electrical duty. Match power_class specifically —
    # not every token 'class' (insulation_class etc. are unrelated).
    if "power_class" in kl:
        return True
    if re.search(r"(?:^|_)(?:limit|ceiling|cap|max_allowed|threshold)(?:_|$)", kl):
        return True
    if not isinstance(qentry, dict):
        return False
    src = str(qentry.get("source") or "").strip().lower()
    if not src:
        prov = qentry.get("provenance") if isinstance(qentry.get("provenance"), dict) else {}
        src = str((prov or {}).get("source") or "").strip().lower()
    if src == "brief" or src.startswith("brief.") or src.startswith("brief:"):
        return True
    # Explicit brief-identity restatements even when source tag is missing/odd.
    sd = str(qentry.get("source_detail") or "").lower()
    if "brief" in sd and "identity" in sd:
        return True
    # Calculator / tool ALIASES of a brief-only identity are still identities
    # (e.g. traction_motor_power_kw = "alias of front_hardware_power_class_kw").
    # Binding the brief class label to its own renamed echo is tautology green.
    if "alias of" in sd and any(
        tok in sd for tok in (
            "power_class", "front_hardware", "fpk_mass_cap", "assumed_",
            "brief", "_limit_", "_ceiling",
        )
    ):
        return True
    return False


# Universal brief-metric → preferred achieved-quantity keys (Bar A 2026-08-05).
# Used ONLY when the same-named contract key is a brief-only identity (class label,
# assumed_*, limit/cap, source=brief). Prefer real tool/calculator keys so brief
# compliance cannot greenwash by identity and cannot stay UNVERIFIED when the twin
# already publishes a distinct achieved figure under a different name.
_BRIEF_ACHIEVED_ALIASES: Dict[str, Tuple[str, ...]] = {
    "front_hardware_power_class_kw": (
        "traction_inverter_power_kw",
        "traction_motor_power_kw",
        "hardware_power_envelope_kw",
        "envelope_electrical_power_kw",
    ),
    "front_regen_electrical_cap_kw": (
        "regen_electrical_capability_kw",
        "continuous_power_kw",
        "mgu_shaft_power_kw",
        "dc_input_electrical_kw_continuous",
    ),
    "fpk_mass_cap_kg": (
        "fpk_unit_mass_achieved_kg",
        "unit_mass_kg",
        "mgu_mcu_mass_kg",
    ),
    "assumed_vdc_min_v": (
        "design_vdc_operating_v",
        "dc_bus_voltage_v",
    ),
    "assumed_vdc_max_v": (
        "design_vdc_operating_v",
        "dc_bus_voltage_v",
    ),
    "assumed_coolant_inlet_c": (
        "coolant_inlet_c",
    ),
    "winding_temp_limit_c": (
        "mgu_winding_temp_c",
        "winding_temp_c",
        "stator_winding_temp_c",
    ),
    "max_rotor_speed_rpm": (
        "max_rotor_speed_rpm",
        "mgu_base_speed_rpm",
    ),
}


def _checks_brief_compliance(state: dict, run_dir: str) -> List[Check]:
    """UNIVERSAL: deterministically verify each STRUCTURED brief target metric
    (constraints.target_performance.metrics) against the matching DESIGNED contract quantity —
    so the brief's own targets are AUTHORITATIVELY verified, not merely disclosed. Matching is
    conservative: ALL of the metric's concept tokens must be present in the quantity name AND the
    unit-family must agree; a metric with no confident contract match is SKIPPED (never falsely
    failed). Class-agnostic — any archetype whose brief carries structured target metrics."""
    out: List[Check] = []
    oc = state.get("orchestratorContract") or {}
    q: Dict[str, Any] = oc.get("quantities") or {}
    if not q:
        return out
    pb = state.get("parsedBrief") or _load_json(os.path.join(run_dir, "1-parsed-brief.json")) or {}
    metrics = ((((pb or {}).get("constraints") or {}).get("target_performance") or {}).get("metrics")) or []
    if not metrics:
        return out
    qidx = [(k, _btoks(k), _ufam((q[k] or {}).get("unit") if isinstance(q[k], dict) else ""))
            for k in q]
    for m in metrics:
        if not isinstance(m, dict):
            continue
        km, tv, unit = m.get("key_metric"), m.get("value"), (m.get("unit") or "")
        try:
            tvf = float(tv)
        except (TypeError, ValueError):
            continue
        mt, mu = _btoks(km), _ufam(unit)
        if not km or not mt or tvf == 0:
            continue
        # INTENT (2026-07-29 0846): whole-car brief context is not a rear-MGU target.
        if _is_out_of_scope_perimeter_metric(str(km)):
            continue
        tol = abs(tvf) * 0.05
        # DECISION (OpenFlexure 2026-07-17): exact key_metric match FIRST.
        # Fuzzy token overlap wrongly bound focus_resolution_um → abbe_resolution_um.
        _band = _is_cost_band_center(km)
        _band_tol = abs(tvf) * 0.20
        _lower = _brief_metric_is_lower_better(str(km))
        # ⭐⭐ A LIMIT / BRIEF ECHO RESTATED IS NOT A TARGET MET (2026-08-03).
        # This fast path takes the contract quantity of the SAME NAME as the brief
        # metric and treats it as the DESIGN's achieved value. That is legitimate
        # only when the contract holds a DISTINCT achieved quantity under that
        # name (tool/calculator provenance). It is a tautology when:
        #   * the name is a LIMIT (magnet_temp_limit_c) — contract restates 150,
        #     while magnets ran 159 °C under mgu_magnet_temp_c;
        #   * the name is assumed_* / a class label / source=brief identity
        #     (front_hardware_power_class_kw, max_rotor_speed_rpm, assumed_vdc_*,
        #     assumed_coolant_inlet_c) — both sides read the brief.
        # Skip the fast path for brief-only identities and fall through to the
        # candidate search, which finds a real achieved quantity — or, finding
        # none, emits honest UNVERIFIED/FAIL rather than a green identity.
        _q_same = q.get(km) if km in q else None
        _skip_same_key = _qty_is_brief_only_identity(str(km), _q_same)
        if km in q and not _skip_same_key:
            dvc = qval(q, km)
            if dvc is not None:
                # ⭐ DEC SUPERSEDES BRIEF CEILING (2026-08-05). DEC-009 freezes
                # max_rotor_speed_rpm at 24,000 while the brief still carries the
                # press-class 19,500 assumption. Forcing design back to 19,500 is
                # wrong; restamping the target under the decision is the honest
                # path. Proof: contract source starts with decision:DEC- and
                # carries written provenance. Only for lower-better ceilings
                # where design exceeds the brief (decision raised the freeze).
                _qe = _q_same if isinstance(_q_same, dict) else {}
                _src = str(_qe.get("source") or "")
                _prov = _qe.get("provenance") if isinstance(_qe.get("provenance"), dict) else {}
                _dec_super = (
                    _lower
                    and _src.startswith("decision:DEC-")
                    and dvc > tvf + tol
                    and (
                        bool(_prov.get("detail") or _prov.get("source") or _qe.get("source_detail"))
                    )
                )
                _exp = dvc if _dec_super else tvf
                _exp_src = (
                    f"{_src} supersedes brief:{km}" if _dec_super else f"brief:{km}"
                )
                if _band:
                    _ok = abs(dvc - _exp) <= _band_tol
                    _rel = "band"
                elif _lower:
                    _ok = dvc <= _exp + tol
                    _rel = "le"
                else:
                    _ok = dvc >= _exp - tol
                    _rel = "ge"
                out.append(Check(
                    name=f"Brief target met: {km}",
                    category="BRIEF", relation=_rel,
                    status=PASS if _ok else FAIL,
                    actual=round(dvc, 4), expected=_exp,
                    tol=round(_band_tol if _band else tol, 4), unit=unit,
                    producer=f"brief:{km}",
                    actual_source=f"contract:{km}",
                    expected_source=_exp_src,
                    detail=(
                        (f"DEC SUPERSEDES BRIEF: brief set {km} = {tvf:g} {unit}; "
                         f"design freeze under {_src} is {dvc:g} {unit} — target "
                         f"restamped to the decision (not forced back to the brief)."
                         if _dec_super else
                         f"Brief target {km} = {tvf:g} {unit}; design ({km}) = {dvc:g} {unit} — "
                         + ("a cost band-centre: the BoM must land WITHIN the ±20% plausibility band."
                            if _band else
                            ("a ceiling: design must stay ≤ the brief cap (±5%)."
                             if _lower else
                             "the design must realise the brief target within ±5%.")))
                    ),
                ))
                continue
        # candidate designed quantities: unit-family agrees AND a concept-token overlap (>=2,
        # or a full subset for a single-token metric). Among the candidates pick the value
        # CLOSEST to the brief target — this resolves a per-unit-vs-total name clash (the brief's
        # 'rearing_tank_volume_m3' = the TOTAL 1016 m3 must match the contract's total_tank_volume
        # 1016, not the 254 m3 per-tank quantity of the same name). A genuine shortfall (no
        # concept+unit quantity within 5% of the target) still FAILS.
        cands: List[Tuple[float, float, str]] = []
        for k, kt, ku in qidx:
            # Unit-family must AGREE. A blank family is wild-carded ONLY when BOTH sides are blank —
            # a DIMENSIONED metric (m³/h flow) must NEVER bind to a DIMENSIONLESS quantity (a *_count):
            # the v14 fertigation/hand-watering miss bound 'fertigation_dosing_capacity' (m³/h) to
            # 'fertigation_dosing_pump_count' (=2) because an empty quantity family wild-carded through.
            if mu and ku and mu != ku:
                continue
            if bool(mu) != bool(ku):   # one side dimensioned, the other dimensionless → not the same metric
                continue
            # ⭐⭐ A CHECK MAY NOT COMPARE THE TARGET TO ITSELF (2026-08-03). The
            # brief metric `magnet_temp_limit_c` = 150 matched the contract
            # quantity of the SAME NAME, also 150, so the row read
            # "Brief target met: magnet_temp_limit_c — 150 vs 150 — PASS" and
            # could never fail whatever the machine did. It showed green while the
            # magnets ran 9.3 K over that very limit. A tautology dressed as a
            # check is worse than no check, because it occupies the slot where a
            # real one would have failed. The ACHIEVED quantity is a different key
            # (mgu_magnet_temp_c); the limit is the target, not the measurement.
            # Same rule for any brief-only identity (assumed_*, class labels,
            # source=brief echoes): binding T → another brief echo of T is still
            # a green identity, not a design check. Do not invent physics bindings.
            if k.lower() == km.lower():
                continue
            if _qty_is_brief_only_identity(k, q.get(k)):
                continue
            ov = len(mt & kt)
            if ov >= 2 or (mt <= kt and ov >= 1):
                dvc = qval(q, k)
                if dvc is not None:
                    cands.append((abs(dvc - tvf), dvc, k))
        # Universal alias table: seed preferred achieved keys FIRST (class labels,
        # caps, assumed_*) so token-fuzzy matches cannot displace a deliberate
        # binding (and so UNVERIFIED does not fire when the twin already publishes
        # the achieved figure under a different name).
        if str(km) in _BRIEF_ACHIEVED_ALIASES:
            seeded = []
            for ak in _BRIEF_ACHIEVED_ALIASES[str(km)]:
                if ak not in q:
                    continue
                if _qty_is_brief_only_identity(ak, q.get(ak)):
                    continue
                dvc = qval(q, ak)
                if dvc is None:
                    continue
                seeded.append((abs(dvc - tvf), dvc, ak))
            if seeded:
                # Prefer alias list order; later meeting-from-above sort still applies.
                cands = seeded + [c for c in cands if c[2] not in {s[2] for s in seeded}]
        if not cands:
            # Nothing but the target itself matched → the brief states a target the
            # design never reports an achieved value for. That is UNVERIFIED, and it
            # must say so rather than vanish: a silently-dropped target is how a
            # constraint goes unaudited (the same disease gate 17 exists to catch).
            out.append(Check(
                name=f"Brief target met: {km}", category="BRIEF", relation="eq",
                status=FAIL, actual=None, expected=tvf, tol=0.0, unit=unit,
                producer=f"brief:{km}",
                actual_source="",
                expected_source=f"brief:{km}",
                detail=(f"UNVERIFIED — the brief sets {km} = {tvf:g} {unit} but the design "
                        f"reports no ACHIEVED quantity to compare it against (only the "
                        f"target itself). Emit the achieved value, or this constraint "
                        f"ships unaudited.")))
            continue
        # A performance target is MET by MEETING-OR-EXCEEDING it — the design delivering MORE than the
        # brief demand is success, not a failure (v14: irrigation 'per_department' target 45 m³/h with a
        # design that delivers the 90 m³/h TOTAL the plant needs — 90 ≥ 45 is MET, not an equality miss).
        # Prefer the candidate that MEETS the target, closest from above (resolves the per-unit-vs-total
        # clash without falsely failing on over-delivery); if none meets, surface the closest (a real miss).
        # Ceilings invert: meeting means ≤ target (design under the cap).
        cands.sort(key=lambda t: t[0])
        if _band:
            _, dv, best = min(cands, key=lambda t: abs(t[1] - tvf))
            _ok = abs(dv - tvf) <= _band_tol
            _rel = "band"
        elif _lower:
            meeting = sorted((c for c in cands if c[1] <= tvf + tol), key=lambda t: t[0])
            _, dv, best = (meeting[0] if meeting else cands[0])
            _ok = dv <= tvf + tol
            _rel = "le"
        else:
            meeting = sorted((c for c in cands if c[1] >= tvf - tol), key=lambda t: t[0])
            _, dv, best = (meeting[0] if meeting else cands[0])
            _ok = dv >= tvf - tol
            _rel = "ge"
        out.append(Check(
            name=f"Brief target met: {km}",
            category="BRIEF", relation=_rel,
            status=PASS if _ok else FAIL,
            actual=round(dv, 4), expected=tvf,
            tol=round(_band_tol if _band else tol, 4), unit=unit,
            producer=f"brief:{km}",
            actual_source=f"contract:{best}",
            expected_source=f"brief:{km}",
            detail=(f"Brief target {km} = {tvf:g} {unit}; design ({best}) = {dv:g} {unit} — "
                    + ("a cost band-centre: the BoM must land WITHIN the ±20% plausibility band."
                       if _band else
                       ("a ceiling: design must stay ≤ the brief cap (±5%)."
                        if _lower else
                        "the design must realise the brief target within ±5%."))),
        ))
    return out


def _checks_tool_provenance(state: dict, run_dir: str) -> List[Check]:
    """TOOL I/O PROVENANCE (Tristan 2026-06-23): every value a 'verified engineering tool' computes
    (4-orchestrator-tools-used.json) must actually be USED by the design — either it matches the
    same-named contract quantity, or its value appears in the design's consumed numbers (quantities
    ∪ BoM ∪ costStack). A tool that ran but whose output the design does NOT use (orphaned), or
    whose recorded value DISAGREES with the quantity it claims to produce (stale — e.g. a tool run
    at the 222 t/yr reference while the design scaled to 62 t/yr), is a provenance failure: the
    dossier claims 'computed by this tool' but the number shown came from somewhere else. Universal."""
    out: List[Check] = []
    tu = _load_json(os.path.join(run_dir, "4-orchestrator-tools-used.json"))
    if not isinstance(tu, dict):
        return out
    tools = tu.get("tools") or []
    if not tools:
        return out
    q = (state.get("orchestratorContract") or {}).get("quantities") or {}
    qval = {k.lower(): (v.get("value") if isinstance(v, dict) else v) for k, v in q.items()}
    consumed = set()
    for v in qval.values():
        n = num(v)
        if n is not None:
            consumed.add(round(n, 3))
    for r in (state.get("requirementsBom") or []):
        for f in ("unit_gbp", "line_gbp", "qty"):
            n = num(r.get(f))
            if n is not None:
                consumed.add(round(n, 3))
    for v in (state.get("costStack") or {}).values():
        n = num(v)
        if n is not None:
            consumed.add(round(n, 3))

    def _present(x: float) -> bool:
        for cand in (x, x * 1000.0, x / 1000.0):       # allow W↔kW / unit scaling
            for c in consumed:
                if abs(cand - c) <= max(abs(c) * 0.02, 0.01):
                    return True
        return False

    def qk_orig_probe(qd, lower_key):
        """Original-case contract key for a lower-cased lookup key."""
        return next((k for k in qd if k.lower() == lower_key), lower_key)

    for t in tools:
        tid = str(t.get("tool_id", "?"))
        for c in (t.get("claims") or []):
            field = str(c.get("field", ""))
            val = num(c.get("value"))
            if val is None:
                continue
            of = str(c.get("output_field", "")).lower()
            f = re.sub(r"^calc_", "", field).lower()
            # JOIN PRIORITY (BESS cross-val fix 2026-07-03): when the claim's OWN field name is
            # itself a contract quantity, THAT is the canonical comparison — tool.X vs contract.X.
            # The claim's declared output_field only routes a claim whose field name is NOT a
            # quantity (calc_* / renamed outputs). Before this, a claim with a WRONG declared
            # mapping (pybamm cell_heat_generation_kw=45.1 declared output_field=
            # system_thermal_dissipation_kw) was compared against a DIFFERENT quantity (95.1)
            # and flagged STALE while contract.cell_heat_generation_kw matched it exactly —
            # apples-to-oranges. A tool field that IS a contract key and DISAGREES still FAILs.
            qk = (f if f in qval else of if of in qval else
                  next((k for k in qval if k == f or (len(f) >= 6 and (f in k or k in f))), None))
            if qk is not None:
                qv = num(qval[qk])
                _tol = _tool_eq_tol(qv) if qv is not None else 0.01
                ok = qv is not None and abs(val - qv) <= _tol
                # ⭐⭐ SUPERSEDED IS NOT STALE (2026-08-03). A tool output that differs
                # from the contract is a defect ONLY when nothing explains it. When a
                # LATER, better-sourced tool deliberately replaced the value — here
                # fe:iron-loss-from-lamination superseding motor:loss-point, because
                # the loss-point run used an invented Steinmetz pair — the difference
                # IS the provenance, and reporting it as "STALE: the tool output is
                # NOT the number shown" tells the reader the opposite of the truth.
                #
                # The guard against laundering: the contract quantity must name a
                # DIFFERENT tool_id in its own provenance AND carry a written reason.
                # A bare mismatch with no provenance still FAILs, exactly as before,
                # so this cannot be used to wave away a genuine disagreement.
                _qk_probe = qk_orig_probe(q, qk)
                _pq = q.get(_qk_probe) or {}
                _prov = (_pq.get("provenance") or {}) if isinstance(_pq, dict) else {}
                _owner = str(
                    _prov.get("tool_id")
                    or (str(_prov.get("source") or "").split(":")[-1] if _prov.get("source") else "")
                    or ""
                )
                _reason = str(
                    _prov.get("detail")
                    or _prov.get("caveat")
                    or (_pq.get("source_detail") if isinstance(_pq, dict) else "")
                    or (_pq.get("condition") if isinstance(_pq, dict) else "")
                    or ""
                )
                # ⭐⭐ DELIBERATELY ABSENT IS NOT STALE (2026-08-05). After DEC-008 the
                # winding temperature was withdrawn (proxy copy of magnet temp) —
                # value=None, basis unresolved_after_dec_008, caveat written. A prior
                # tool claim of 86.82 °C is historical, not a live design number; FAIL
                # as "stale" told the reader the opposite of the truth. PASS with an
                # explicit WITHDRAWN detail so the dossier still audits the gap.
                if not ok and qv is None and isinstance(_pq, dict):
                    _basis = str(_pq.get("basis") or "").lower()
                    _cond = str(_pq.get("condition") or "").lower()
                    _withdrawn = (
                        _pq.get("value") is None
                        and (
                            "unresolved" in _basis
                            or "deliberately" in _cond
                            or "not derived" in _cond
                            or bool(_prov.get("caveat"))
                            or str(_prov.get("source") or "").startswith("decision:")
                        )
                    )
                    if _withdrawn:
                        out.append(Check(
                            name=f"Tool output withdrawn: {field}", category="PROVENANCE",
                            relation="eq", status=PASS, actual=_tool_round(val),
                            expected=None, tol=_tool_round(_tol), unit="",
                            producer=f"tool:{tid}",
                            quantity_key=_qk_probe,
                            actual_source=f"tool:{tid}:{field}",
                            expected_source=f"contract:{_qk_probe}",
                            detail=(f"{tid} computed {field}={val:g}, but contract "
                                    f"{_qk_probe} is DELIBERATELY ABSENT "
                                    f"(basis={_pq.get('basis') or '?'}) — withdrawn "
                                    f"rather than published from a proxy; historical "
                                    f"tool claim is not the design number. "
                                    f"{(_reason or '')[:160]}")))
                        continue
                if not ok and qv is not None:
                    # Owner may be a tool_id OR a decision:/tool: provenance source;
                    # require a written reason so bare mismatches still FAIL.
                    if _owner and _owner != tid and len(_reason) > 0:
                        out.append(Check(
                            name=f"Tool output superseded: {field}", category="PROVENANCE",
                            relation="eq", status=PASS, actual=_tool_round(val),
                            expected=_tool_round(qv), tol=_tool_round(_tol), unit="",
                            producer=f"tool:{tid}",
                            quantity_key=_qk_probe,
                            actual_source=f"tool:{tid}:{field}",
                            expected_source=f"contract:{qk}",
                            detail=(f"{tid} computed {field}={val:g}; the design uses "
                                    + (f"{qv:g} from {_owner}" if qv is not None
                                       else f"NO value — withdrawn by {_owner}")
                                    + f" — deliberate supersession, "
                                    f"not drift: {_reason[:180]}")))
                        continue
                # find the ORIGINAL-CASE contract key (qval dict is lower-cased) so the
                # cross-check join + headline surfaces can join on the real quantity key.
                qk_orig = next((k for k in q if k.lower() == qk), qk)
                out.append(Check(
                    name=f"Tool output used: {field}", category="PROVENANCE", relation="eq",
                    status=PASS if ok else FAIL, actual=_tool_round(val),
                    expected=(_tool_round(qv) if qv is not None else val),
                    tol=_tool_round(_tol), unit="",
                    producer=f"tool:{tid}",
                    quantity_key=qk_orig,
                    actual_source=f"tool:{tid}:{field}",
                    expected_source=f"contract:{qk_orig}",
                    # ⭐ A QUANTITY CAN BE DELIBERATELY ABSENT (2026-08-03). When a
                    # value is withdrawn because it was never derived — the winding
                    # temperature after DEC-008, which used to be the magnet's number
                    # copied across — `qv` is None and `f"{qv:g}"` raised TypeError,
                    # taking the whole workbook build down. An absent quantity is a
                    # legitimate state and every consumer has to render it, not crash
                    # on it; that is the cost of withdrawing a wrong number rather
                    # than leaving it in place, and it is the right cost to pay.
                    detail=(f"{tid} {field}={val:g} matches contract {qk}." if ok else
                            (f"STALE: {tid} computed {field}={val:g} but the design uses "
                             f"{qk}={qv:g} — the tool output is NOT the number shown "
                             f"(tool ran at a different scale/input)." if qv is not None
                             else f"{tid} computed {field}={val:g}, but contract {qk} is "
                                  f"DELIBERATELY ABSENT — the quantity was withdrawn "
                                  f"rather than published from a proxy, so there is "
                                  f"nothing to compare the tool output against."))))
            else:
                if abs(val) in (0.0, 1.0):              # un-checkable zero/unit value
                    continue
                used = _present(val)
                out.append(Check(
                    name=f"Tool output traced: {field}", category="PROVENANCE", relation="eq",
                    status=PASS if used else FAIL, actual=_tool_round(val), expected=None,
                    tol=0.0, unit="", producer=f"tool:{tid}",
                    actual_source=f"tool:{tid}:{field}",
                    expected_source="",
                    detail=(f"{tid} {field}={val:g} is used in the design." if used else
                            f"ORPHANED: {tid} computed {field}={val:g} but this value appears "
                            f"NOWHERE in the design's quantities/BoM/cost — tool ran but its "
                            f"output is unused.")))
    return out


def _checks_module_integrity(state: dict, run_dir: str) -> List[Check]:
    """A sub-module that DESCRIBES components (a real English sentence) but carries an EMPTY words[]
    is a HOLLOW module — it claims content it does not contain. Tristan 2026-06-29: the Codema
    'fertigation_dosing_system' had prose ("two identical A/B nutrient-dosing units…") but zero
    component words (the dosing pumps had been scattered into another module). The LLM physics critic
    flags this only intermittently; this DETERMINISTIC check fires every time. Universal — every
    described sub-module must back its prose with ≥1 component word; a genuinely contentless structural
    slot (no descriptive sentence) is NOT a defect, so it is not flagged."""
    md = state.get("moduleDecomposition") or {}
    modules = md.get("modules") or []
    if not modules:
        return []
    hollow: List[str] = []
    for m in modules:
        for sm in (m.get("sub_modules") or []):
            words = sm.get("words") or []
            sent = str(sm.get("english_sentence") or sm.get("sentence_en")
                       or sm.get("paragraph_en") or "").strip()
            if len(words) == 0 and len(sent.split()) >= 5:
                hollow.append(str(sm.get("id") or sm.get("sub_module") or "?"))
    n = len(hollow)
    return [Check(
        name="modules: every described sub-module carries components (no hollow module)",
        category="CONSISTENCY", relation="le",
        status=(PASS if n == 0 else FAIL),
        actual=float(n), expected=0.0, tol=0.0, unit="hollow modules",
        producer="module:hollow_count",
        detail=("every sub-module that describes components backs its prose with ≥1 component word"
                if n == 0 else
                f"{n} hollow sub-module(s) describe components but carry an EMPTY words[]: "
                f"{', '.join(hollow[:6])} — their components were dropped or scattered to another "
                f"module. Every described sub-module must carry ≥1 component word."),
    )]


def flagged_quantity_reasons(checks: List[Check], state: Optional[dict] = None) -> Dict[str, str]:
    """THE FLAGGED-QUANTITY SET (2026-07-02, v55): every contract quantity that FAILED a
    check on this run, mapped to the failing check's name — PLUS the lineage-forward
    closure (a quantity DERIVED from a flagged quantity is itself flagged: v55's
    total_supply_demand_kva=184,166,200 has lineage.from=[total_supply_demand_kw], the
    directly-STALE-flagged 132 GW artefact). This is the JOIN every headline/summary
    surface must apply: a flagged quantity may render ONLY as a flagged FAIL row —
    never as an Exec OUTPUT, an Overview headline metric, or a 'design output' role."""
    reasons: Dict[str, str] = {}
    for c in checks:
        if c.status == FAIL and c.quantity_key:
            reasons.setdefault(c.quantity_key, c.name)
    if not reasons:
        return reasons
    q = ((state or {}).get("orchestratorContract") or {}).get("quantities") or {}
    changed = True
    while changed:                      # lineage-forward transitive closure
        changed = False
        for k, v in q.items():
            if k in reasons or not isinstance(v, dict):
                continue
            lin = (v.get("lineage") or {}).get("from") or []
            hit = next((s for s in lin if s in reasons), None)
            if hit:
                reasons[k] = f"derived (lineage) from flagged '{hit}' ({reasons[hit]})"
                changed = True
    return reasons


def _apply_cross_check_join(checks: List[Check], state: Optional[dict]) -> None:
    """CROSS-CHECK JOIN (2026-07-02, v55): a check must not BLESS a quantity another
    check flagged. v55's 'tool matches contract' provenance rows PASSed on quantities
    downstream of the STALE 132 GW artefact, and the adequacy check PASSed the derived
    184 GVA — each check was locally true while the quantity was known-bad on the SAME
    run. Demote every PASSing PROVENANCE/ADEQUACY check whose quantity_key (or any
    input_key) is in the flagged set, to a fixpoint (a demotion can flag new keys)."""
    for _ in range(len(checks) + 1):
        flagged = flagged_quantity_reasons(checks, state)
        if not flagged:
            return
        changed = False
        for c in checks:
            if c.status != PASS or c.category not in ("PROVENANCE", "ADEQUACY"):
                continue
            keys = [c.quantity_key, *c.input_keys]
            hit = next((k for k in keys if k and k in flagged), None)
            if hit:
                c.status = FAIL
                c.cross_flagged = True
                c.detail = (c.detail.rstrip() +
                            f" CROSS-CHECK FAIL: '{hit}' is flagged by another failed check "
                            f"on this run ({flagged[hit]}) — a check must not bless a "
                            f"quantity a sibling check has already flagged.")
                changed = True
        if not changed:
            return


def _checks_part_type_coherence(state: dict, run_dir: str) -> List[Check]:
    """F3 (2026-07-20): every ACTIVE-MACHINE BoM line must be pinned to a MACHINE,
    not a consumable/stock SKU. The frozen 2150 shipped a peristaltic PUMP pinned to
    a sanitary-TUBING SKU (Watson-Marlow TUB-SAN-6.4, £20.74, IDENTIFIED) — a
    slot-mispin a chartered engineer rejects on sight. Universal (no per-class
    table): fires ONLY when the requirement noun is an active machine/actuator AND
    the pinned part identity reads as a consumable (stock noun or consumable SKU
    prefix). A consumable requirement legitimately pinned to a consumable (a 'Tubing
    Set' -> tubing SKU) never fires because its requirement is not an active machine."""
    out: List[Check] = []
    rb = _requirements_bom(state)
    if not rb:
        return out
    bad: List[str] = []
    for row in rb:
        if not isinstance(row, dict):
            continue
        req = str(row.get("requirement") or row.get("name") or "")
        # skip connection/sub-component roll-up rows (they carry the ↳ prefix)
        if req.startswith("↳"):
            continue
        part = str(row.get("part") or "")
        # the requirement must be an active machine, and NOT itself a consumable
        if not _ACTIVE_MACHINE_RX.search(req):
            continue
        if _PIECE_OF_STOCK_RX.search(req):
            continue
        if _part_is_placeholder(part):
            continue
        if _part_is_consumable_stock(part):
            tag = str(row.get("tag") or "").strip()
            bad.append(f"{tag + ' ' if tag else ''}{req.strip()} = {part.strip()}")
    n = len(bad)
    out.append(Check(
        name="Part-type coherence: no active machine pinned to a consumable SKU",
        category="CONSISTENCY", relation="le",
        status=PASS if n == 0 else FAIL,
        actual=float(n), expected=0.0, tol=0.0, unit="lines",
        producer="consistency:part_type_coherence",
        detail=(f"{n} BoM line(s) pin an active machine/actuator to a consumable or "
                f"stock SKU (a pump to its tubing, a valve to its o-ring) — the line "
                f"names a machine but the part is a length of stock, so the requirement "
                f"is NOT actually fulfilled and the price is consumable-tier. "
                + (f"e.g. {bad[0]}." if bad else "Every active machine is pinned to a "
                   "machine.")
                + " Fix at part resolution (re-resolve the machine's own MPN, not its "
                  "consumable), never by relabelling the line."),
    ))
    return out


_PELTIER_RX = re.compile(r"\b(peltier|thermo[- ]?electric|tec\s*module|\btec\b)\b", re.I)
_RESISTIVE_HEATER_RX = re.compile(
    r"\b(cartridge heater|resistive heat\w*|film heater|kapton heater|"
    r"heating element|band heater|silicone heater|\bheater\b)\b", re.I)
# a trivially-small thermal duty (W) below which ONE bidirectional actuator suffices —
# a Peltier heats AND cools, so a separate resistive heater is provably redundant.
_REDUNDANT_THERMAL_DUTY_CEILING_W = 10.0


def _checks_thermal_actuator_redundancy(state: dict, run_dir: str) -> List[Check]:
    """F2 (2026-07-20): a single small thermal-control loop must not carry TWO powered
    thermal actuators. The frozen 2150 emitted BOTH a Peltier/TEC module (X-111) AND a
    cartridge heater (H-101) for a `net_heating_required_w` of 0.93 W — and a Peltier
    already heats AND cools, so the separate resistive heater is pure redundancy on a
    sub-1W duty. Universal (no per-class table): fires ONLY when a bidirectional
    thermoelectric actuator AND a separate resistive heater are BOTH present AND the
    net thermal duty is trivially small (< 10 W) — a kW-scale thermal cycler that
    genuinely needs fast resistive heat + Peltier cooling never trips (duty gate), and
    a design with no thermal-duty quantity never trips (conservative — cannot prove it
    is small). Routed fix: collapse to one thermal actuator in equipment synthesis."""
    out: List[Check] = []
    rb = _requirements_bom(state)
    if not rb:
        return out
    q = (state.get("orchestratorContract") or {}).get("quantities") or {}
    # net thermal duty in W (a kW dissipation quantity is converted); None if unknown
    duty_w = _first_qval(q, ["net_heating_required_w", "net_cooling_required_w",
                             "vessel_heat_loss_w"])
    diss_kw = _first_qval(q, ["system_thermal_dissipation_kw"])
    if duty_w is None and diss_kw is not None:
        duty_w = diss_kw * 1000.0
    if duty_w is None:
        return out                       # cannot prove the duty is small — do not fire
    peltier, heater = [], []
    for row in rb:
        if not isinstance(row, dict):
            continue
        name = str(row.get("requirement") or row.get("name") or "")
        if name.startswith("↳"):
            continue
        if _PELTIER_RX.search(name):
            peltier.append(f"{row.get('tag', '')} {name}".strip())
        elif _RESISTIVE_HEATER_RX.search(name):
            heater.append(f"{row.get('tag', '')} {name}".strip())
    redundant = bool(peltier) and bool(heater) and duty_w < _REDUNDANT_THERMAL_DUTY_CEILING_W
    out.append(Check(
        name="Thermal-actuator redundancy: one small duty must not carry two actuators",
        category="CONSISTENCY", relation="le",
        status=FAIL if redundant else PASS,
        actual=float(1 if redundant else 0), expected=0.0, tol=0.0, unit="loops",
        producer="consistency:thermal_actuator_redundancy",
        detail=(f"A bidirectional Peltier/TEC ({peltier[0] if peltier else '—'}) AND a "
                f"separate resistive heater ({heater[0] if heater else '—'}) both serve a "
                f"net thermal duty of {duty_w:.2f} W (< {_REDUNDANT_THERMAL_DUTY_CEILING_W:.0f} W) "
                f"— the Peltier alone heats and cools this loop, so the second actuator is "
                f"redundant. Collapse to one thermal actuator at equipment synthesis."
                if redundant else
                (f"Thermal actuators reconcile (duty {duty_w:.2f} W): "
                 + ("single actuator" if not (peltier and heater)
                    else f"two actuators but duty ≥ {_REDUNDANT_THERMAL_DUTY_CEILING_W:.0f} W")
                 + ".")),
    ))
    return out


_RESOLVED_BOM_STATUS = {"IDENTIFIED", "VERIFIED", "RESOLVED"}


def _checks_part_status_honesty(state: dict, run_dir: str) -> List[Check]:
    """F4 (2026-07-20): a BoM line presented as IDENTIFIED/resolved must not be pinned to
    a part its OWN verification stage proved FAKE. The frozen 2150 shipped "P-101 Dosing
    Peristaltic Pump = Watson-Marlow TUB-SAN-6.4 IDENTIFIED" while the partVerification
    for that exact SKU said status=`unverified` (verifier semantic: 'confident this SKU
    is fake' — part-verification.ts VERIFIER_SYSTEM). Presenting a proven-fake SKU as a
    resolved catalogue pin is the confidence-honesty violation (a false-IDENTIFIED is as
    dishonest as a false-PASS — [[forgeos_honest_scoring_precondition]]). Universal, no
    per-class table: joins a resolved BoM line to any partVerification whose part_number
    appears verbatim in the line's part text and whose status is `unverified`. An honest
    line (status NOT FOUND / TBD / UNRESOLVED, or a verified pv) never trips."""
    out: List[Check] = []
    rb = _requirements_bom(state)
    if not rb:
        return out
    # index unverified pvs by their real SKU (>=4 chars) for a substring join
    unverified_skus: List[Tuple[str, str]] = []   # (part_number.lower, mfr)
    for pv in (state.get("partVerifications") or []):
        if not isinstance(pv, dict):
            continue
        pn = str(pv.get("part_number") or "").strip()
        if len(pn) >= 4 and str(pv.get("status") or "").strip().lower() == "unverified":
            unverified_skus.append((pn.lower(), str(pv.get("manufacturer") or "")))
    bad: List[str] = []
    for row in rb:
        if not isinstance(row, dict):
            continue
        if str(row.get("status") or "").strip().upper() not in _RESOLVED_BOM_STATUS:
            continue
        part = str(row.get("part") or "").lower()
        for pn, _mfr in unverified_skus:
            if pn in part:
                tag = str(row.get("tag") or "").strip()
                req = str(row.get("requirement") or row.get("name") or "").strip()
                bad.append(f"{tag + ' ' if tag else ''}{req} = {row.get('part')}")
                break
    n = len(bad)
    out.append(Check(
        name="Part-status honesty: no IDENTIFIED line over a proven-unverified SKU",
        category="CONSISTENCY", relation="le",
        status=PASS if n == 0 else FAIL,
        actual=float(n), expected=0.0, tol=0.0, unit="lines",
        producer="consistency:part_status_honesty",
        detail=(f"{n} BoM line(s) are presented as IDENTIFIED/resolved but pin a SKU the "
                f"verification stage marked `unverified` (proved fake). A resolved line "
                f"must join to a verified or honestly-TBD part, never a proven-fake SKU. "
                + (f"e.g. {bad[0]}." if bad else "Every resolved line is honestly grounded.")
                + " Fix at part resolution (re-resolve a real SKU, or demote the line to "
                  "UNRESOLVED/RFQ), never by relabelling an unverified part IDENTIFIED."),
    ))
    return out


# ============================================================================
# PLAUSIBILITY — the "would a chartered engineer BELIEVE this number?" family
# (2026-07-21, Tristan: "just because you have a high score number doesn't mean
# it's necessarily true … catch all of these fake-good tabs"). Every OTHER check
# family verifies CONSISTENCY (does the arithmetic reconcile / is the value USED /
# is provenance present). NONE attacks MAGNITUDE PLAUSIBILITY — so a £0.01 MCU, a
# 16 mm² power cable on a 35 W device, a 0 kg cable, and fluid services on
# electronic parts all shipped in tabs scored 10/10 (consistency ≠ correctness).
# This family attacks the magnitudes/semantics directly. UNIVERSAL — keyed on
# scale signals + noun classes, no per-archetype table; a line matching nothing is
# untouched. Each invariant has a proveCatch in _selftest.
# ============================================================================
# Cu ampacity ladder is _CU_AMPACITY (above). A conductor grossly LARGER than the
# duty needs is a plant-scale leak on a benchtop instrument (the 16 mm² = ~90 A
# cable spec'd for a 35 W / ~1.5 A USB device). Symmetric to _checks_cable_csa,
# which only catches UNDER-sizing.
_FLUID_MECHANISMS = {"water", "air", "gas", "media", "coolant", "fluid", "liquid",
                     "steam", "vent", "perfusion", "hydraulic", "pneumatic"}
# a part that legitimately touches a fluid service (a fluid edge must have >=1 of these)
_FLUID_PART_RE = re.compile(
    r"vessel|tank|tube|tubing|pump|filter|valve|reservoir|manifold|\bvent\b|media|"
    r"culture|perfusion|jacket|chamber|nozzle|port|inlet|outlet|drain|sparger|"
    r"impeller|stirrer|degas|aerat|bioreactor|column|nutrient|waste|bottle|flask|"
    r"cartridge|membrane|syringe|needle|coupler|fitting|hose|line\b", re.I)


def _watt_scale_device(state: dict) -> bool:
    """True for a benchtop/handheld INSTRUMENT drawing < ~100 W — the scale where a
    plant-sized cable/feeder is a magnitude leak. Reuses the chain's own signals."""
    if state.get("isInstrumentDevice") is True or state.get("isWattScaleInstrument") is True:
        return True
    oc = state.get("orchestratorContract") or {}
    q = oc.get("quantities") or {}
    load_kw = _first_qval(q, ["connected_electrical_load_kw", "total_electrical_load_kw",
                              "nameplate_power_kw"])
    if load_kw is not None and load_kw < 0.1:
        return True
    w = _first_qval(q, ["total_power_w", "peak_power_w", "nameplate_power_w"])
    return w is not None and w < 100.0


def _checks_plausibility(state: dict, run_dir: str) -> List[Check]:
    out: List[Check] = []
    oc = state.get("orchestratorContract") or {}
    q: Dict[str, Any] = oc.get("quantities") or {}
    watt_scale = _watt_scale_device(state)

    # -- P3. CABLE-CSA SCALE COHERENCE (the 16 mm² on a 35 W device) --------------
    csa = _first_qval(q, ["power_cable_csa_mm2", "cable_csa_mm2", "conductor_csa_mm2"])
    load_kw = _first_qval(q, ["connected_electrical_load_kw", "total_electrical_load_kw",
                              "nameplate_power_kw"])
    if csa is not None and csa > 0:
        # required CSA from the actual duty: I = P / V, at a conservative low DC bus
        # (24 V) so we never OVER-state the requirement (a smaller V → more amps → a
        # bigger required CSA → a more FORGIVING check). load unknown → assume a token
        # 5 W handheld draw so a wattage device still can't justify a 16 mm² cable.
        p_w = (load_kw * 1000.0) if (load_kw is not None) else 5.0
        amps = p_w / 24.0
        req = _csa_required_for_current(max(amps, 0.1)) or 0.5
        # FAIL when the chosen conductor is a gross over-size on a wattage device: a
        # real cable is picked one-or-two sizes above the duty, never 8x+. Only fire
        # on the watt-scale regime (a plant bus is legitimately large).
        gross = watt_scale and csa >= max(4.0, req * 6.0)
        out.append(Check(
            name="Cable CSA is scale-plausible for the load",
            category="PLAUSIBILITY", relation="le",
            status=FAIL if gross else PASS,
            actual=csa, expected=max(req, 2.5), tol=0.0, unit="mm2",
            producer="plausibility:cable_csa_scale",
            quantity_key="power_cable_csa_mm2",
            detail=(f"chosen {csa:g} mm2 conductor vs a {p_w:g} W duty (~{amps:.1f} A @ 24 V "
                    f"→ needs ~{req:g} mm2). A benchtop/USB instrument cannot carry a "
                    f"{csa:g} mm2 (~90 A-class) cable — a plant-scale leak. Size the "
                    f"conductor from the real duty, not a plant default."
                    if gross else
                    f"{csa:g} mm2 is plausible for a ~{amps:.1f} A duty.")))

    # -- P2. A SIZED CABLE HAS MASS (0 kg cable) ----------------------------------
    mass = _first_qval(q, ["cable_mass_kg", "cabling_mass_kg", "wiring_mass_kg"])
    if csa is not None and csa > 0 and mass is not None and mass <= 0:
        out.append(Check(
            name="Sized cable has non-zero mass",
            category="PLAUSIBILITY", relation="ge",
            status=FAIL, actual=mass, expected=0.001, tol=0.0, unit="kg",
            producer="plausibility:cable_mass_nonzero",
            quantity_key="cable_mass_kg",
            detail=(f"a {csa:g} mm2 conductor is spec'd but cable_mass_kg = 0 — a cable "
                    f"with cross-section cannot be massless. Derive mass from CSA x length "
                    f"x copper density, never leave it 0.")))

    # -- P6. FLUID SERVICE MUST CONNECT A FLUID PART (water on a debug header) -----
    cs = _load_json(os.path.join(run_dir, "connection-schedule.json")) or {}
    rows = cs.get("rows") if isinstance(cs, dict) else None
    if isinstance(rows, list):
        bad_fluid = []
        for r in rows:
            mech = str(r.get("mechanism") or "").lower().strip()
            if mech not in _FLUID_MECHANISMS:
                continue
            frm = str(r.get("from") or "")
            to = str(r.get("to") or "")
            if not (_FLUID_PART_RE.search(frm) or _FLUID_PART_RE.search(to)):
                bad_fluid.append(f"{mech}: {frm[:20]}->{to[:20]}")
        n = len(bad_fluid)
        out.append(Check(
            name="Fluid services connect fluid-handling parts",
            category="PLAUSIBILITY", relation="eq",
            status=PASS if n == 0 else FAIL,
            actual=float(n), expected=0.0, tol=0.0, unit="edges",
            producer="plausibility:fluid_service_domain",
            detail=(f"{n} connection edge(s) carry a FLUID service (water/air/media) between "
                    f"two NON-fluid parts (an electronic/mechanical pair) — a nonsensical "
                    f"service assignment. " + (f"e.g. {bad_fluid[0]}. " if bad_fluid else "")
                    + "A fluid edge must touch a vessel/tube/pump/valve/filter; fix the "
                      "connection-graph service typing at its source."
                    if n else "Every fluid edge touches a fluid-handling part.")))

    # -- P5. PART NAMES ARE NOT DUPLICATE/GENERIC PLACEHOLDERS --------------------
    # names come from partVerifications (reliable) — a duplicated generic
    # "…Subcomponent"/"…Subc" placeholder shipping as a distinct BoM line is a naming
    # gap the register/part-names tab score never sees.
    pvs = state.get("partVerifications") or []
    if isinstance(pvs, list) and pvs:
        names = [str(p.get("name") or p.get("word_name") or "") for p in pvs]
        generic = sorted({n for n in names
                          if re.search(r"subcomponent|instrumentation subc|\bsubc\b|"
                                       r"placeholder|component \d+$|part \d+$", n, re.I)})
        from collections import Counter as _Counter
        dups = sorted({n for n, c in _Counter(n for n in names if n).items() if c > 1})
        offenders = sorted(set(generic) | set(dups))
        n = len(offenders)
        out.append(Check(
            name="Part names are specific, not generic/duplicate",
            category="PLAUSIBILITY", relation="eq",
            status=PASS if n == 0 else FAIL,
            actual=float(n), expected=0.0, tol=0.0, unit="names",
            producer="plausibility:name_honesty",
            detail=(f"{n} part name(s) are generic placeholders or duplicates "
                    + (f"(e.g. {offenders[0]!r}) " if offenders else "")
                    + "— a real BoM names each part by its function, never "
                      "'…Subcomponent N'. Name the part at emission."
                    if n else "Every part name is specific.")))

    # -- P7. A SAFETY / COMPLIANCE MARGIN MUST NOT BE NEGATIVE ---------------------
    # (2026-07-21, the 4-agent review: emc_compliance_margin_dB = -30, electronics
    # junction 92.65 °C = -7.65 K over Tj_max — both shipped as a green 10/10 cell). A
    # negative margin/headroom/clearance means the DESIGN EXCEEDS A LIMIT — a hard
    # engineering failure, never a PASS. Universal: any quantity whose key names a
    # margin/headroom/clearance and whose value is < 0. (A limit-vs-value pair with no
    # explicit margin quantity is out of scope here — this catches the emitted margins.)
    neg_margins = []
    for _k, _qv in q.items():
        if not re.search(r"margin|headroom|clearance", str(_k), re.I):
            continue
        _v = _qv.get("value") if isinstance(_qv, dict) else _qv
        try:
            if _v is not None and float(_v) < 0:
                neg_margins.append((str(_k), float(_v)))
        except (TypeError, ValueError):
            continue
    if neg_margins:
        out.append(Check(
            name="Safety / compliance margins are non-negative",
            category="PLAUSIBILITY", relation="ge",
            status=FAIL, actual=float(min(v for _, v in neg_margins)), expected=0.0,
            tol=0.0, unit="", producer="plausibility:negative_margin",
            detail=(f"{len(neg_margins)} margin/headroom quantity(ies) are NEGATIVE — the design "
                    f"EXCEEDS a stated limit (e.g. {neg_margins[0][0]} = {neg_margins[0][1]:g}). A "
                    f"negative safety/compliance margin is a hard failure, never a PASS. Fix the "
                    f"design (more shielding / lower dissipation / larger derate) at its source.")))

    # -- P8. NO PART MAY BE LARGER THAN ITS ENCLOSURE -----------------------------
    # (2026-07-21: Culture Temperature Probe 260x309x240 mm inside a 221x165x82 mm shell —
    # a geometric impossibility a geometry-proxy plant-default produced). Every internal
    # part's bounding box must fit inside the enclosure shell. Universal — reads the
    # parts-manifest the render + drawings share; skips cleanly when there is no shell.
    pm = _load_json(os.path.join(run_dir, "parts-manifest.json")) or {}
    parts = pm.get("parts") if isinstance(pm, dict) else None
    if isinstance(parts, list) and parts:
        def _dims(p):
            d = p.get("dims_mm") or {}
            if isinstance(d, dict):
                return (num(d.get("w")), num(d.get("d")), num(d.get("h")))
            if isinstance(d, list) and len(d) == 3:
                return (num(d[0]), num(d[1]), num(d[2]))
            return (None, None, None)
        shell = next((p for p in parts if re.search(r"enclosure|shell|housing|chassis|cabinet",
                     str(p.get("name") or ""), re.I)), None)
        if shell is not None:
            sw, sd, sh = _dims(shell)
            # ROBUSTNESS (2026-07-24 organoid >9-drive): the shell PROXY dim can be
            # mis-scaled — an instrument enclosure whose manifest dims came back ~28× too
            # small (7.7×5.7×2.8 vs its delivered 221×165×82 mm spec) flagged EVERY interior
            # part as "oversized", floor-setting Overview. The true enclosure must at least
            # CONTAIN the placed-parts bbox, so floor each shell extent to the manifest bbox
            # extent. A genuine plant-scale proxy part (the check's real target — thousands of
            # mm) still exceeds this envelope and flags; a normal 28 mm part no longer does.
            _bb = pm.get("bbox_mm") if isinstance(pm, dict) else None
            if isinstance(_bb, dict) and all(isinstance(x, (int, float)) and x > 0 for x in (sw, sd, sh)):
                _bx = abs(num(_bb.get("length_mm")) or 0.0)
                _by = abs(num(_bb.get("width_mm")) or 0.0)
                _bz = abs(num(_bb.get("height_mm")) or 0.0)
                if _bx and _by and _bz and (sw < _bx or sd < _by or sh < _bz):
                    sw, sd, sh = max(sw, _bx), max(sd, _by), max(sh, _bz)
            if all(isinstance(x, (int, float)) and x > 0 for x in (sw, sd, sh)):
                s_sorted = sorted([sw, sd, sh], reverse=True)  # orientation-free: a part fits if
                oversized = []                                 # its sorted extents all <= the shell's
                for p in parts:
                    if p is shell:
                        continue
                    pw, pd, ph = _dims(p)
                    if not all(isinstance(x, (int, float)) and x > 0 for x in (pw, pd, ph)):
                        continue
                    p_sorted = sorted([pw, pd, ph], reverse=True)
                    if any(p_sorted[i] > s_sorted[i] * 1.02 for i in range(3)):
                        oversized.append(f"{p.get('name','?')} "
                                         f"({pw:.0f}x{pd:.0f}x{ph:.0f} > shell {sw:.0f}x{sd:.0f}x{sh:.0f})")
                if oversized:
                    out.append(Check(
                        name="Every part fits inside the enclosure",
                        category="PLAUSIBILITY", relation="eq",
                        status=FAIL, actual=float(len(oversized)), expected=0.0, tol=0.0,
                        unit="parts", producer="plausibility:part_containment",
                        detail=(f"{len(oversized)} part(s) are LARGER than the enclosure shell they "
                                f"sit inside — a geometric impossibility (e.g. {oversized[0]}). A "
                                f"geometry-proxy fell through to a plant-scale default; size the part "
                                f"from its real datasheet footprint / a device-scale TYPE_DEFAULT.")))

    # -- P9. NO INTERNAL RUN MAY EXCEED THE ENCLOSURE DIAGONAL ---------------------
    # (2026-07-21: 2.37 m signal cables + 15.1 m interconnect inside a 281 mm box →
    # a £874 connection cost). With no site/room, an intra-enclosure wire/tube run cannot
    # exceed roughly the device's bounding-box diagonal. Universal — reads the same
    # connection-schedule + parts-manifest bbox; only fires when a real bbox exists.
    bbox = pm.get("bbox_mm") if isinstance(pm, dict) else None
    # A "run" here means a PHYSICALLY DRAWN wire/tube (it has real geometry in the scene).
    # A route the builder DEMOTED to logical (drawn:false) has no drawn geometry — its
    # length_m is a routing ESTIMATE on the placed parts, not a physical run that must
    # "fit". Judging a demoted/undrawn logical association's estimated length as a run
    # that exceeds the envelope is a category error, so exclude undrawn routes (identified
    # from wired-lengths.json's drawn flag, keyed on the same from/to part pair).
    _wl = _load_json(os.path.join(run_dir, "wired-lengths.json")) or {}
    _wl_rows = _wl.get("runs") if isinstance(_wl, dict) else (_wl if isinstance(_wl, list) else [])
    _undrawn_pairs = {
        (str(w.get("from_part") or ""), str(w.get("to_part") or ""))
        for w in (_wl_rows or [])
        if isinstance(w, dict) and w.get("drawn") is False
    }
    if isinstance(rows, list) and isinstance(bbox, dict):
        L = num(bbox.get("length_mm")); W = num(bbox.get("width_mm")); H = num(bbox.get("height_mm"))
        if all(isinstance(x, (int, float)) and x > 0 for x in (L, W, H)):
            diag_m = math.sqrt(L * L + W * W + H * H) / 1000.0
            # generous 1.5x allowance for routing slack around the envelope
            cap_m = diag_m * 1.5
            long_runs = []
            for r in rows:
                # skip demoted/undrawn logical routes — no physical geometry to "fit"
                if (str(r.get("from") or ""), str(r.get("to") or "")) in _undrawn_pairs:
                    continue
                lm = num(r.get("length_m"))
                if lm is not None and lm > cap_m:
                    long_runs.append(f"{str(r.get('from','?'))[:16]}->{str(r.get('to','?'))[:16]} "
                                     f"{lm:.2f} m")
            if long_runs:
                out.append(Check(
                    name="Internal runs fit within the device envelope",
                    category="PLAUSIBILITY", relation="le",
                    status=FAIL, actual=float(len(long_runs)), expected=0.0, tol=0.0,
                    unit="runs", producer="plausibility:run_length_scale",
                    detail=(f"{len(long_runs)} wire/tube run(s) exceed {cap_m:.2f} m — 1.5x the "
                            f"{diag_m*1000:.0f} mm enclosure diagonal — yet sit INSIDE the device "
                            f"(e.g. {long_runs[0]}). A plant point-to-point router leaked onto a "
                            f"benchtop device; clamp intra-enclosure runs to the bbox diagonal.")))

    return out




def _checks_heater_power_contract_consistency(state: dict, run_dir: str) -> List[Check]:
    # Heater-power reconciliation (2026-07-22): the contract's `peak_heater_power_w` quantity
    # (what the brief-compliance row shows) MUST equal the P_heat value the bioreactor-thermal
    # heat-balance calc uses in its Heating Margin substitution — a split causes the 5W/10W
    # discrepancy seen in the organoid-bioreactor run. Universal: only fires when BOTH the
    # contract quantity AND the heat-balance worked calc are present.
    out: List[Check] = []
    q = (state.get("orchestratorContract") or {}).get("quantities") or {}
    contract_w_entry = q.get("peak_heater_power_w")
    if not isinstance(contract_w_entry, dict):
        return out  # no contract quantity — cannot check
    contract_w = float(contract_w_entry.get("value", float("nan")))
    if not math.isfinite(contract_w) or contract_w <= 0:
        return out
    # Find the Heating Margin step in the bioreactor-thermal:heat-balance worked calculations
    wc = (state.get("orchestratorContract") or {}).get("worked_calculations") or {}
    hb_steps = wc.get("bioreactor-thermal:heat-balance") or []
    calc_w: Optional[float] = None
    for step in hb_steps:
        if not isinstance(step, dict):
            continue
        if "heating margin" in str(step.get("label", "")).lower():
            # substitution format: "(P_heat - Q_req) / P_heat * 100" e.g. "(10.0 - 0.9340) / 10.0 * 100"
            subst = str(step.get("substitution", ""))
            m = re.match(r"\(([0-9.]+)\s*-", subst)
            if m:
                try:
                    calc_w = float(m.group(1))
                except ValueError:
                    pass
            break
    if calc_w is None:
        return out  # no calc to compare against — conservative
    tol = 0.1  # W tolerance
    mismatch = abs(contract_w - calc_w) > tol
    out.append(Check(
        name="Heater-power reconciliation: contract quantity must match heat-balance calc",
        category="CONSISTENCY", relation="le",
        status=FAIL if mismatch else PASS,
        actual=round(calc_w, 3), expected=round(contract_w, 3), tol=tol, unit="W",
        producer="consistency:heater_power_reconciliation",
        detail=(
            f"Contract `peak_heater_power_w` = {contract_w:.2f} W but the bioreactor-thermal "
            f"heat-balance calc uses P_heat = {calc_w:.2f} W — a {abs(contract_w - calc_w):.2f} W "
            f"split means the brief-compliance row and the Calculations tab disagree. "
            f"Fix: emit `peak_heater_power_w` from the brief into the contract so the tool plan "
            f"reads it (not a 10 W default fallback)."
            if mismatch else
            f"Contract `peak_heater_power_w` = {contract_w:.2f} W agrees with heat-balance "
            f"calc P_heat = {calc_w:.2f} W (within {tol:.1f} W tolerance)."
        ),
    ))
    return out

def run_all_checks(run_dir: str, state: Optional[dict] = None) -> List[Check]:
    """Run EVERY deterministic check against a run directory and return the list
    of Check records (PASS / FAIL / N/A). Pure: reads only the run's JSON, makes
    no network call, invokes no LLM."""
    if state is None:
        state = _load_json(os.path.join(run_dir, "state.json"))
    if not state:
        return []
    checks: List[Check] = []
    checks.extend(_checks_consistency(state, run_dir))
    checks.extend(_checks_part_type_coherence(state, run_dir))
    checks.extend(_checks_thermal_actuator_redundancy(state, run_dir))
    checks.extend(_checks_part_status_honesty(state, run_dir))
    checks.extend(_checks_heater_power_contract_consistency(state, run_dir))
    checks.extend(_checks_adequacy(state, run_dir))
    checks.extend(_checks_balance(state, run_dir))
    checks.extend(_checks_cost(state, run_dir))
    checks.extend(_checks_connectivity(state, run_dir))
    checks.extend(_checks_brief_compliance(state, run_dir))
    checks.extend(_checks_tool_provenance(state, run_dir))
    checks.extend(_checks_module_integrity(state, run_dir))
    checks.extend(_checks_plausibility(state, run_dir))
    _apply_cross_check_join(checks, state)     # no PASS may bless a flagged quantity
    return checks


def summarise(checks: List[Check]) -> Tuple[int, int, int]:
    """Return (n_pass, n_fail, n_na)."""
    p = sum(1 for c in checks if c.status == PASS)
    f = sum(1 for c in checks if c.status == FAIL)
    n = sum(1 for c in checks if c.status == NA)
    return p, f, n


# ============================================================================
# SELF-TEST — synthetic states exercising every family both directions. Run with
#   .venv/bin/python scripts/deterministic_checks_lib.py --selftest
# (the regression harness shells out to this; exit 0 = all invariants hold).
# ============================================================================
def _selftest() -> int:
    import tempfile

    # ⭐⭐ proveCatch (2026-08-03 A-i): brief metric + same-named brief-only contract
    # quantity must NOT PASS. The five live tautologies (front_hardware_power_class_kw,
    # max_rotor_speed_rpm, assumed_vdc_min/max_v, assumed_coolant_inlet_c) compared the
    # brief to itself via the same-key fast path. A synthetic brief-echo of the same
    # shape must surface as FAIL/UNVERIFIED — never green identity. Limit names still
    # bind to a DISTINCT achieved key when one exists (magnet_temp_limit → mgu_magnet).
    _tai_dir = tempfile.mkdtemp(prefix="brief_tautology_")
    _tai_brief = {"constraints": {"target_performance": {"metrics": [
        {"key_metric": "assumed_vdc_min_v", "value": 600, "unit": "V"},
        {"key_metric": "front_hardware_power_class_kw", "value": 350, "unit": "kW"},
        {"key_metric": "max_rotor_speed_rpm", "value": 19500, "unit": "rpm"},
        {"key_metric": "magnet_temp_limit_c", "value": 150, "unit": "C"},
    ]}}}
    _tai_state = {
        "orchestratorContract": {"quantities": {
            "assumed_vdc_min_v": {"value": 600, "unit": "V", "source": "brief"},
            "front_hardware_power_class_kw": {
                "value": 350, "unit": "kW", "source": "brief",
                "source_detail": "HW nameplate class — not continuous duty"},
            "max_rotor_speed_rpm": {
                "value": 19500, "unit": "rpm", "source": "brief",
                "source_detail": "brief max_rotor_speed_rpm identity"},
            "magnet_temp_limit_c": {"value": 150, "unit": "C", "source": "brief"},
            "mgu_magnet_temp_c": {
                "value": 159.35, "unit": "C",
                "provenance": {"source": "tool:motor:cooling-thermal-screen"}},
        }},
        "parsedBrief": _tai_brief,
        "requirementsBom": [], "partVerifications": [],
    }
    for _fn, _blob in (
        ("state.json", _tai_state),
        ("1-parsed-brief.json", _tai_brief),
        ("parts-ledger.json", {"grand_total_gbp": 0, "equipment": []}),
        ("connection-schedule.json", {"rows": [], "specs": []}),
    ):
        with open(os.path.join(_tai_dir, _fn), "w") as _fh:
            json.dump(_blob, _fh)
    _tai_cks = _checks_brief_compliance(_tai_state, _tai_dir)
    def _tai(name_sub: str):
        return next((c for c in _tai_cks if name_sub in c.name), None)
    for _km in ("assumed_vdc_min_v", "front_hardware_power_class_kw",
                "max_rotor_speed_rpm"):
        _c = _tai(_km)
        if _c is None or _c.status == PASS:
            print(f"  FAIL brief-tautology proveCatch: {_km} same-key brief echo "
                  f"must NOT PASS (got {None if _c is None else _c.status})"); return 1
        if _c.actual_source and _c.actual_source == _c.expected_source:
            print(f"  FAIL brief-tautology proveCatch: {_km} still has source-identity "
                  f"actual_source==expected_source"); return 1
    _c_mag = _tai("magnet_temp_limit_c")
    if (_c_mag is None or _c_mag.status != FAIL
            or _c_mag.actual is None or abs(float(_c_mag.actual) - 159.35) > 0.01
            or "mgu_magnet_temp_c" not in (_c_mag.actual_source or "")):
        print("  FAIL brief-tautology proveCatch: magnet_temp_limit_c must FAIL at "
              f"159.35 via mgu_magnet_temp_c (got {_c_mag})"); return 1

    # ⭐⭐ proveCatch (2026-08-05): DEC-009 supersedes brief max_rotor_speed ceiling.
    # Design freeze 24000 must PASS against brief 19500 under decision:DEC-009 —
    # never force the design back to the press-class assumption.
    _dec_dir = tempfile.mkdtemp(prefix="dec_super_")
    _dec_brief = {"constraints": {"target_performance": {"metrics": [
        {"key_metric": "max_rotor_speed_rpm", "value": 19500, "unit": "rpm"},
        {"key_metric": "fpk_mass_cap_kg", "value": 32, "unit": "kg"},
        {"key_metric": "assumed_coolant_inlet_c", "value": 60, "unit": "C"},
    ]}}}
    _dec_state = {
        "orchestratorContract": {"quantities": {
            "max_rotor_speed_rpm": {
                "value": 24000, "unit": "rpm", "source": "decision:DEC-009",
                "source_detail": "DEC-009 freezes design max rotor speed at 24,000 rpm",
                "provenance": {
                    "source": "decision:DEC-009",
                    "detail": "Adopted option 24,000 / 130",
                },
            },
            "fpk_unit_mass_achieved_kg": {
                "value": 28.8, "unit": "kg", "source": "calculator",
                "provenance": {"source": "calculator", "tool_id": "front_fpk_power_reconcile"},
            },
            "coolant_inlet_c": {
                "value": 60, "unit": "C",
                "source": "design:coolant_loop_assumption_adopted",
            },
        }},
        "parsedBrief": _dec_brief,
        "requirementsBom": [], "partVerifications": [],
    }
    for _fn, _blob in (
        ("state.json", _dec_state),
        ("1-parsed-brief.json", _dec_brief),
        ("parts-ledger.json", {"grand_total_gbp": 0, "equipment": []}),
        ("connection-schedule.json", {"rows": [], "specs": []}),
    ):
        with open(os.path.join(_dec_dir, _fn), "w") as _fh:
            json.dump(_blob, _fh)
    _dec_cks = _checks_brief_compliance(_dec_state, _dec_dir)
    _c_rpm = next((c for c in _dec_cks if "max_rotor_speed_rpm" in c.name), None)
    if (_c_rpm is None or _c_rpm.status != PASS
            or abs(float(_c_rpm.actual or 0) - 24000) > 0.1):
        print(f"  FAIL DEC-supersede proveCatch: max_rotor_speed 24000 under "
              f"DEC-009 must PASS vs brief 19500 (got {_c_rpm})"); return 1
    _c_mass = next((c for c in _dec_cks if "fpk_mass_cap" in c.name), None)
    if (_c_mass is None or _c_mass.status != PASS
            or abs(float(_c_mass.actual or 0) - 28.8) > 0.05):
        print(f"  FAIL brief-alias proveCatch: fpk_mass_cap must bind "
              f"fpk_unit_mass_achieved_kg=28.8 PASS (got {_c_mass})"); return 1
    _c_cool = next((c for c in _dec_cks if "assumed_coolant" in c.name), None)
    if (_c_cool is None or _c_cool.status != PASS
            or abs(float(_c_cool.actual or 0) - 60) > 0.1):
        print(f"  FAIL brief-alias proveCatch: assumed_coolant_inlet must bind "
              f"coolant_inlet_c=60 PASS (got {_c_cool})"); return 1

    # ⭐⭐ proveCatch (2026-08-05): deliberately-absent contract + historical tool
    # claim must PASS as withdrawn, not FAIL as stale.
    _wd_dir = tempfile.mkdtemp(prefix="withdrawn_")
    with open(os.path.join(_wd_dir, "4-orchestrator-tools-used.json"), "w") as _fh:
        json.dump({"tools": [{"tool_id": "motor:thermal-lumped",
                              "claims": [{"field": "mgu_winding_temp_c",
                                          "value": 86.82}]}]}, _fh)
    _wd_cks = _checks_tool_provenance(
        {"orchestratorContract": {"quantities": {
            "mgu_winding_temp_c": {
                "value": None, "unit": "C", "basis": "unresolved_after_dec_008",
                "condition": "NOT derived at this operating point",
                "provenance": {
                    "source": "decision:DEC-008",
                    "caveat": "OPEN: needs LPTN re-run",
                },
            }}}}, _wd_dir)
    if not any("winding" in c.name.lower() and c.status == PASS for c in _wd_cks):
        print(f"  FAIL withdrawn-quantity proveCatch: deliberate absence must PASS "
              f"(got {_wd_cks})"); return 1
    # Supersession: older tool 69.1, contract 77.19 from a different owner.
    _ss_dir = tempfile.mkdtemp(prefix="super_cool_")
    with open(os.path.join(_ss_dir, "4-orchestrator-tools-used.json"), "w") as _fh:
        json.dump({"tools": [{"tool_id": "front_fpk_power_reconcile",
                              "claims": [{"field": "coolant_outlet_c",
                                          "value": 69.1}]}]}, _fh)
    _ss_cks = _checks_tool_provenance(
        {"orchestratorContract": {"quantities": {
            "coolant_outlet_c": {
                "value": 77.19, "unit": "C",
                "source_detail": "coolant_outlet_c = coolant_inlet_c+coolant_delta_t_k",
                "provenance": {
                    "source": "tool:motor:cooling-thermal-screen",
                    "tool_id": "analytical_fia_cooling_thermal_screen",
                },
            }}}}, _ss_dir)
    if not any("coolant_outlet" in c.name and c.status == PASS for c in _ss_cks):
        print(f"  FAIL supersession proveCatch: 69.1 vs design 77.19 from cooling "
              f"screen must PASS as superseded (got {_ss_cks})"); return 1

    # ⭐⭐ proveCatch (2026-08-03 A-iii): magnitude-aware floors must catch small
    # swallowed equality checks that a flat abs floor previously waved through.
    # BoM I-4: unit=0, qty=1, line=1 must FAIL (old floor=£1 → tol>=expected).
    _bom_tol = _tol_pct(1.0, 0.005, 0.01)
    if not (_bom_tol < 1.0 and _eq_status(0.0 * 1.0, 1.0, _bom_tol) == FAIL):
        print("  FAIL BoM I-4 proveCatch: unit=0, qty=1, line=1 must FAIL "
              f"(tol={_bom_tol})"); return 1
    # Large lines still use the relative band (0.5% of £10_000 = £50).
    if abs(_tol_pct(10000.0, 0.005, 0.01) - 50.0) > 1e-9:
        print("  FAIL BoM I-4 proveCatch: large-line relative tol regresssed"); return 1
    # coolant_viscosity_pa_s: 0.001 vs 0.002 must FAIL; 0.001 vs 0.00101 must PASS.
    _vt = _tool_eq_tol(0.001)
    if abs(0.002 - 0.001) <= _vt:
        print(f"  FAIL viscosity proveCatch: 0.001 vs 0.002 must FAIL (tol={_vt})")
        return 1
    if abs(0.00101 - 0.001) > _vt:
        print(f"  FAIL viscosity proveCatch: 0.001 vs 0.00101 must PASS (tol={_vt})")
        return 1
    # Rounding must not erase sub-0.01 significance (tol stored on the Check).
    if _tool_round(0.00101) == _tool_round(0.001) or (_tool_round(_vt) or 0) == 0:
        print("  FAIL viscosity proveCatch: _tool_round erased sub-1e-2 significance")
        return 1
    # End-to-end via _checks_tool_provenance (not just the helpers).
    _visc_dir = tempfile.mkdtemp(prefix="visc_tol_")
    with open(os.path.join(_visc_dir, "4-orchestrator-tools-used.json"), "w") as _fh:
        json.dump({"tools": [{"tool_id": "coolant:visc",
                              "claims": [{"field": "coolant_viscosity_pa_s",
                                          "value": 0.002}]}]}, _fh)
    _visc_fail = _checks_tool_provenance(
        {"orchestratorContract": {"quantities": {
            "coolant_viscosity_pa_s": {"value": 0.001}}}}, _visc_dir)
    if not any("coolant_viscosity_pa_s" in c.name and c.status == FAIL
               for c in _visc_fail):
        print("  FAIL viscosity proveCatch e2e: 0.002 vs contract 0.001 must FAIL")
        return 1
    _visc_dir2 = tempfile.mkdtemp(prefix="visc_tol_ok_")
    with open(os.path.join(_visc_dir2, "4-orchestrator-tools-used.json"), "w") as _fh:
        json.dump({"tools": [{"tool_id": "coolant:visc",
                              "claims": [{"field": "coolant_viscosity_pa_s",
                                          "value": 0.00101}]}]}, _fh)
    _visc_pass = _checks_tool_provenance(
        {"orchestratorContract": {"quantities": {
            "coolant_viscosity_pa_s": {"value": 0.001}}}}, _visc_dir2)
    if not any("coolant_viscosity_pa_s" in c.name and c.status == PASS
               for c in _visc_pass):
        print("  FAIL viscosity proveCatch e2e: 0.00101 vs contract 0.001 must PASS")
        return 1
    # BoM I-4 end-to-end: unit=0 × qty=1 ≠ line=1 must surface as FAIL.
    _bom_dir = tempfile.mkdtemp(prefix="bom_i4_")
    for _fn, _blob in (
        ("state.json", {
            "orchestratorContract": {"product_class": "synthetic_bom_i4",
                                     "quantities": {}},
            "requirementsBom": [{"tag": "I-4", "part": "tiny", "qty": 1,
                                 "unit_gbp": 0, "line_gbp": 1,
                                 "requirement": "proveCatch"}],
            "partVerifications": [],
        }),
        ("parts-ledger.json", {"grand_total_gbp": 1, "equipment": []}),
        ("connection-schedule.json", {"rows": [], "specs": []}),
    ):
        with open(os.path.join(_bom_dir, _fn), "w") as _fh:
            json.dump(_blob, _fh)
    _bom_checks = run_all_checks(_bom_dir)
    if not any("unit_gbp x qty" in c.name and c.status == FAIL for c in _bom_checks):
        print("  FAIL BoM I-4 proveCatch e2e: unit=0, qty=1, line=1 must FAIL")
        return 1

    # ⭐⭐ proveCatch (2026-08-03): SUPERSEDED must not become a laundering hole.
    # A tool output that differs from the contract is reported as a deliberate
    # supersession ONLY when the contract quantity names a DIFFERENT tool in its
    # own provenance AND states a reason. Drive both sides here: with provenance
    # it PASSES with the reason; with a bare mismatch it must still FAIL, or any
    # tool could wave away a genuine disagreement by disagreeing louder.
    _sup_dir = tempfile.mkdtemp(prefix="prov_sup_")
    with open(os.path.join(_sup_dir, "4-orchestrator-tools-used.json"), "w") as _fh:
        json.dump({"tools": [{"tool_id": "motor:loss-point",
                              "claims": [{"field": "mgu_iron_loss_w",
                                          "value": 135.56}]}]}, _fh)
    _sup_state = {
        "orchestratorContract": {"quantities": {"mgu_iron_loss_w": {
            "value": 6035.1,
            "provenance": {"tool_id": "fe:iron-loss-from-lamination",
                           "detail": "M400-50A derived Steinmetz on FE-probed flux"}}}},
    }
    _r = _checks_tool_provenance(_sup_state, _sup_dir)
    if not any("superseded" in c.name.lower() and c.status == PASS for c in _r):
        print("  FAIL provenance-supersession: a documented supersession was still "
              "reported as STALE"); return 1
    _bare_dir = tempfile.mkdtemp(prefix="prov_bare_")
    with open(os.path.join(_bare_dir, "4-orchestrator-tools-used.json"), "w") as _fh:
        json.dump({"tools": [{"tool_id": "motor:loss-point",
                              "claims": [{"field": "mgu_iron_loss_w",
                                          "value": 135.56}]}]}, _fh)
    # same disagreement, NO provenance naming a superseding tool
    _bare = {"orchestratorContract": {"quantities": {
        "mgu_iron_loss_w": {"value": 6035.1}}}}
    _rb = _checks_tool_provenance(_bare, _bare_dir)
    if any("superseded" in c.name.lower() for c in _rb):
        print("  FAIL provenance-supersession: an UNDOCUMENTED mismatch was laundered "
              "as a supersession"); return 1
    if not any(c.status == FAIL for c in _rb):
        print("  FAIL provenance-supersession: an undocumented mismatch did not FAIL")
        return 1

    def _has(checks: List[Check], name_sub: str, want_status: str) -> bool:
        for c in checks:
            if name_sub.lower() in c.name.lower():
                return c.status == want_status
        return False

    def _write_run(tmp: str, state: dict, ledger: dict, conns: dict,
                   tools: Optional[dict] = None) -> str:
        d = os.path.join(tmp, "run")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "state.json"), "w") as f:
            json.dump(state, f)
        with open(os.path.join(d, "parts-ledger.json"), "w") as f:
            json.dump(ledger, f)
        with open(os.path.join(d, "connection-schedule.json"), "w") as f:
            json.dump(conns, f)
        if tools is not None:
            with open(os.path.join(d, "4-orchestrator-tools-used.json"), "w") as f:
                json.dump(tools, f)
        return d

    failures: List[str] = []

    def check(cond: bool, msg: str) -> None:
        if not cond:
            failures.append(msg)

    # ---- CLEAN run: every family should PASS (no FAILs at all) ----
    clean_state = {
        "orchestratorContract": {
            "product_class": "synthetic_clean",
            "quantities": {
                "pump_count": {"value": 4, "unit": ""},
                "pump_flow_m3_h": {"value": 250, "unit": "m³/h"},
                "recirculation_flow_m3_h": {"value": 1000, "unit": "m³/h"},
                "connected_electrical_load_kw": {"value": 800, "unit": "kW"},
                "main_transformer_kva": {"value": 1250, "unit": "kVA"},
                "biofilter_tank_volume_m3": {"value": 150, "unit": "m³"},
                "biofilter_media_volume_m3": {"value": 90, "unit": "m³"},
            },
            "closures": [],
        },
        "requirementsBom": [
            {"tag": "P-1", "part": "Acme PUMP-9000", "qty": 4,
             "unit_gbp": 5000, "line_gbp": 20000,
             "requirement": "Pump"},
        ],
        "partVerifications": [
            {"word_id": "p", "word_name": "Pump", "manufacturer": "Acme",
             "part_number": "PUMP-9000", "distributor_price_gbp": 4800,
             "price_estimate_gbp": 4800},
        ],
    }
    clean_ledger = {
        "grand_total_gbp": 20000,
        "equipment": [
            {"tag": "P-1", "qty": 4, "unit_gbp": 5000, "line_gbp": 20000,
             "subcomponents": 2, "subcomponent_gbp": 20000},
        ],
        # a COMPLETE connection graph: every process part wired in+out, every
        # instrument associated -> both coverage checks PASS (>= 0.8).
        "connectivity": {
            "n_process_total": 20, "n_process_connected": 20,
            "n_instrument_total": 16, "n_instrument_associated": 16,
            "n_concerns": 0,
        },
    }
    clean_conns = {
        "rows": [
            {"mechanism": "electrical_bus", "from": "G", "to": "Pump",
             "rating": "100 A", "size": "35 mm²", "within_spec": True},
        ],
        "specs": [
            {"kind": "pipe", "spec_limit": "≤3 m/s velocity",
             "drop_pct_or_velocity": 1.8, "within_spec": True,
             "size_label": "DN300"},
        ],
    }
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, clean_state, clean_ledger, clean_conns)
        checks = run_all_checks(d)
        p, fcount, _ = summarise(checks)
        check(fcount == 0, f"CLEAN run produced {fcount} FAIL(s): "
              f"{[c.name for c in checks if c.status == FAIL]}")
        check(_has(checks, "pump: per-unit", PASS),
              "CLEAN per-unit×count should PASS")
        check(_has(checks, "incomer kVA", PASS), "CLEAN incomer kVA should PASS")
        check(_has(checks, "tank volume > media", PASS),
              "CLEAN tank>media should PASS")
        check(_has(checks, "Process parts with both fluid in+out", PASS),
              "CLEAN process-coverage should PASS (20/20)")
        check(_has(checks, "Instruments associated", PASS),
              "CLEAN instrument-coverage should PASS (16/16)")

    # ---- HOLLOW-MODULE check (Tristan 2026-06-29): a sub-module with descriptive prose but an EMPTY
    #      words[] FAILs; an all-populated decomposition PASSES; a contentless slot with NO prose is
    #      NOT a defect (must not be flagged). proveCatch for _checks_module_integrity. ----
    hollow_state = {"moduleDecomposition": {"modules": [{"module": "m1", "sub_modules": [
        {"id": "fertigation_dosing_system",
         "english_sentence": "The fertigation dosing system comprises two identical A/B nutrient-dosing units.",
         "words": []},                                                   # prose + empty -> the defect
        {"id": "filtration", "english_sentence": "The filtration train removes particulates.",
         "words": [{"name_human": "Cloth Filter"}]},                     # populated -> fine
        {"id": "spare_slot", "english_sentence": "", "words": []},       # no prose -> NOT a defect
    ]}]}}
    hcs = _checks_module_integrity(hollow_state, "")
    check(len(hcs) == 1 and hcs[0].status == FAIL and hcs[0].actual == 1.0,
          f"HOLLOW-MODULE: prose + empty words[] must FAIL with count 1 (spare slot excluded); "
          f"got {[(c.status, c.actual) for c in hcs]}")
    populated_state = {"moduleDecomposition": {"modules": [{"module": "m1", "sub_modules": [
        {"id": "filtration", "english_sentence": "The filtration train removes particulates.",
         "words": [{"name_human": "Cloth Filter"}]}]}]}}
    pcs = _checks_module_integrity(populated_state, "")
    check(len(pcs) == 1 and pcs[0].status == PASS,
          f"HOLLOW-MODULE: an all-populated decomposition must PASS; got {[c.status for c in pcs]}")

    # ---- PART-TYPE COHERENCE (F3, 2026-07-20): an active machine pinned to a consumable
    #      SKU FAILs (the frozen 2150 pump = TUB-SAN-6.4 tubing); a machine pinned to a real
    #      machine SKU, and a consumable requirement pinned to a consumable, both PASS. ----
    mispin_state = {"requirementsBom": [
        {"tag": "P-101", "requirement": "Dosing Peristaltic Pump",
         "part": "Watson-Marlow TUB-SAN-6.4", "status": "IDENTIFIED", "line_gbp": 20.74},
    ]}
    mpc = _checks_part_type_coherence(mispin_state, "")
    check(len(mpc) == 1 and mpc[0].status == FAIL and mpc[0].actual == 1.0,
          f"PART-TYPE: a pump pinned to a tubing SKU must FAIL count 1; "
          f"got {[(c.status, c.actual) for c in mpc]}")
    ok_machine = {"requirementsBom": [
        {"tag": "P-1", "requirement": "Dosing Peristaltic Pump",
         "part": "Watson-Marlow 630Du", "status": "IDENTIFIED"},          # real pump SKU
        {"tag": "X-104", "requirement": "Media Tubing Set",
         "part": "Watson-Marlow TUB-SAN-6.4", "status": "IDENTIFIED"},     # consumable→consumable
        {"tag": "V-101", "requirement": "Culture Vessel",
         "part": "made to spec", "status": "BESPOKE"},                     # placeholder
    ]}
    okc = _checks_part_type_coherence(ok_machine, "")
    check(len(okc) == 1 and okc[0].status == PASS,
          f"PART-TYPE: real-pump-SKU + consumable-req + placeholder must PASS; "
          f"got {[(c.status, c.actual) for c in okc]}")

    # ---- THERMAL-ACTUATOR REDUNDANCY (F2, 2026-07-20): a Peltier + a separate resistive
    #      heater on a sub-10W duty FAILs (the frozen 2150 X-111 Peltier + H-101 heater on
    #      0.93 W); the SAME two actuators on a kW-scale duty PASS; a single actuator PASSes;
    #      no thermal-duty quantity -> no check emitted (conservative). ----
    def _therm(rb, net_w=None, diss_kw=None):
        q = {}
        if net_w is not None:
            q["net_heating_required_w"] = {"value": net_w, "unit": "W"}
        if diss_kw is not None:
            q["system_thermal_dissipation_kw"] = {"value": diss_kw, "unit": "kW"}
        return {"requirementsBom": rb, "orchestratorContract": {"quantities": q}}
    two_actuators = [
        {"tag": "X-111", "requirement": "Peltier Tec Module", "part": "requirement stated"},
        {"tag": "H-101", "requirement": "Cartridge Heater", "part": "requirement stated"},
    ]
    tr = _checks_thermal_actuator_redundancy(_therm(two_actuators, net_w=0.934), "")
    check(len(tr) == 1 and tr[0].status == FAIL and tr[0].actual == 1.0,
          f"THERMAL-REDUNDANCY: Peltier + heater on 0.93 W must FAIL; "
          f"got {[(c.status, c.actual) for c in tr]}")
    tr_big = _checks_thermal_actuator_redundancy(_therm(two_actuators, diss_kw=40.0), "")
    check(len(tr_big) == 1 and tr_big[0].status == PASS,
          f"THERMAL-REDUNDANCY: same two actuators on 40 kW must PASS; "
          f"got {[(c.status, c.actual) for c in tr_big]}")
    tr_one = _checks_thermal_actuator_redundancy(
        _therm([{"tag": "H-101", "requirement": "Cartridge Heater"}], net_w=0.9), "")
    check(len(tr_one) == 1 and tr_one[0].status == PASS,
          f"THERMAL-REDUNDANCY: single heater must PASS; got {[c.status for c in tr_one]}")
    tr_noduty = _checks_thermal_actuator_redundancy(_therm(two_actuators), "")
    check(len(tr_noduty) == 0,
          f"THERMAL-REDUNDANCY: no thermal-duty quantity -> no check emitted; got {len(tr_noduty)}")

    # ---- HEATER-POWER RECONCILIATION (2026-07-22): contract quantity must match what the
    #      heat-balance calc uses. (a) contract 5W + calc 5W = PASS; (b) contract 5W + calc 10W
    #      (the pre-fix bug) = FAIL; (c) no contract quantity -> no check emitted. ----
    def _hpr(contract_w, calc_p_heat_w):
        subst = f"({calc_p_heat_w} - 0.9340) / {calc_p_heat_w} * 100"
        return {
            "orchestratorContract": {
                "quantities": {
                    "peak_heater_power_w": {"value": contract_w, "unit": "W"},
                    "net_heating_required_w": {"value": 0.934, "unit": "W"},
                },
                "worked_calculations": {
                    "bioreactor-thermal:heat-balance": [
                        {"label": "Heating Margin",
                         "formula": "(P_heat - Q_req) / P_heat * 100",
                         "substitution": subst,
                         "result": round((calc_p_heat_w - 0.934) / calc_p_heat_w * 100, 4),
                         "result_unit": "%"}
                    ]
                }
            }
        }
    # (a) contract 5 W, calc uses 5 W -> PASS
    hpr_match = _checks_heater_power_contract_consistency(_hpr(5.0, 5.0), "")
    check(len(hpr_match) == 1 and hpr_match[0].status == PASS,
          f"HEATER-PWR-RECONCILE: contract 5W, calc 5W must PASS; got {[(c.status,c.actual) for c in hpr_match]}")
    # (b) contract 5 W, calc uses 10 W (the pre-fix bug) -> FAIL
    hpr_mismatch = _checks_heater_power_contract_consistency(_hpr(5.0, 10.0), "")
    check(len(hpr_mismatch) == 1 and hpr_mismatch[0].status == FAIL,
          f"HEATER-PWR-RECONCILE: contract 5W, calc 10W must FAIL; got {[(c.status,c.actual) for c in hpr_mismatch]}")
    # (c) no contract quantity -> no check emitted (conservative)
    hpr_none = _checks_heater_power_contract_consistency({"orchestratorContract": {"quantities": {}}}, "")
    check(len(hpr_none) == 0,
          f"HEATER-PWR-RECONCILE: no contract quantity -> no check; got {len(hpr_none)}")

    # ---- PART-STATUS HONESTY (F4, 2026-07-20): an IDENTIFIED BoM line pinned to a SKU the
    #      verification stage proved `unverified` FAILs (the frozen 2150 P-101 IDENTIFIED over
    #      an unverified TUB-SAN-6.4); a verified pv, an honest UNRESOLVED line, and a resolved
    #      line with no unverified pv all PASS. ----
    laundered = {
        "requirementsBom": [
            {"tag": "P-101", "requirement": "Dosing Peristaltic Pump",
             "part": "Watson-Marlow TUB-SAN-6.4", "status": "IDENTIFIED"},
        ],
        "partVerifications": [
            {"manufacturer": "Watson-Marlow", "part_number": "TUB-SAN-6.4",
             "status": "unverified", "confidence": "high"},
        ],
    }
    ph = _checks_part_status_honesty(laundered, "")
    check(len(ph) == 1 and ph[0].status == FAIL and ph[0].actual == 1.0,
          f"PART-STATUS: IDENTIFIED over an unverified SKU must FAIL count 1; "
          f"got {[(c.status, c.actual) for c in ph]}")
    honest = {
        "requirementsBom": [
            {"tag": "P-1", "requirement": "Pump", "part": "Acme PUMP-9000", "status": "IDENTIFIED"},
            {"tag": "X-1", "requirement": "Vent", "part": "Bad FAKE-123", "status": "NOT FOUND"},
        ],
        "partVerifications": [
            {"manufacturer": "Acme", "part_number": "PUMP-9000", "status": "verified"},
            {"manufacturer": "Bad", "part_number": "FAKE-123", "status": "unverified"},
        ],
    }
    hh = _checks_part_status_honesty(honest, "")
    check(len(hh) == 1 and hh[0].status == PASS,
          f"PART-STATUS: verified-IDENTIFIED + unverified-but-NOT-FOUND must PASS; "
          f"got {[(c.status, c.actual) for c in hh]}")

    # ---- DEFECTIVE run: each family must trip exactly its own FAIL ----
    bad_state = {
        "orchestratorContract": {
            "product_class": "synthetic_bad",
            "quantities": {
                # per-unit x count NO LONGER equals the loop -> CONSISTENCY/BALANCE fail
                "pump_count": {"value": 4, "unit": ""},
                "pump_flow_m3_h": {"value": 200, "unit": "m³/h"},   # 4x200=800 != 1000
                "recirculation_flow_m3_h": {"value": 1000, "unit": "m³/h"},
                # incomer kVA undersized -> ADEQUACY fail
                "connected_electrical_load_kw": {"value": 800, "unit": "kW"},
                "main_transformer_kva": {"value": 900, "unit": "kVA"},  # need >=1000
                # tank smaller than media -> ADEQUACY fail
                "biofilter_tank_volume_m3": {"value": 80, "unit": "m³"},
                "biofilter_media_volume_m3": {"value": 90, "unit": "m³"},
            },
            "closures": [],
        },
        "requirementsBom": [
            # unit x qty != line -> CONSISTENCY fail ; price 10x estimate -> COST fail
            {"tag": "P-1", "part": "Acme PUMP-9000", "qty": 4,
             "unit_gbp": 50000, "line_gbp": 99999,
             "requirement": "Pump"},
        ],
        "partVerifications": [
            {"word_id": "p", "word_name": "Pump", "manufacturer": "Acme",
             "part_number": "PUMP-9000", "distributor_price_gbp": 0,
             "price_estimate_gbp": 5000},  # 50000/5000 = 10x -> COST fail
        ],
    }
    bad_ledger = {
        "grand_total_gbp": 12345,   # != Σ line_gbp (99999) -> COST fail
        "equipment": [
            {"tag": "P-1", "qty": 4, "unit_gbp": 50000, "line_gbp": 200000,
             "subcomponents": 2, "subcomponent_gbp": 150000},  # Σsub != line -> CONSISTENCY
        ],
        # an INCOMPLETE connection graph: process 17/28 (61%) + instruments 16/21
        # (76%) both below 80% -> both coverage checks FAIL (the gap this work fixes).
        "connectivity": {
            "n_process_total": 28, "n_process_connected": 17,
            "n_instrument_total": 21, "n_instrument_associated": 16,
            "n_concerns": 29,
        },
    }
    bad_conns = {
        "rows": [
            {"mechanism": "fluid_loop", "from": "a", "to": "b", "size": "DN300",
             "drop": "7.6 m/s", "within_spec": False},   # -> CONNECTIVITY tally fail
            {"mechanism": "electrical_bus", "from": "G", "to": "Big Load",
             "rating": "600 A", "size": "50 mm²", "within_spec": True},  # CSA fail
        ],
        "specs": [
            {"kind": "pipe", "spec_limit": "≤3 m/s velocity",
             "drop_pct_or_velocity": 7.6, "within_spec": False,
             "size_label": "DN300"},
        ],
    }
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, bad_state, bad_ledger, bad_conns)
        checks = run_all_checks(d)
        check(_has(checks, "pump: per-unit", FAIL),
              "BAD per-unit×count should FAIL (4x200 != 1000)")
        check(_has(checks, "unit_gbp x qty", FAIL),
              "BAD unit×qty should FAIL (4x50000 != 99999)")
        check(_has(checks, "Sigma sub-component_gbp", FAIL),
              "BAD Σsub==line should FAIL")
        check(_has(checks, "incomer kVA", FAIL),
              "BAD incomer kVA should FAIL (900 < 1000)")
        check(_has(checks, "tank volume > media", FAIL),
              "BAD tank>media should FAIL (80 < 90)")
        check(_has(checks, "Cable CSA", FAIL),
              "BAD cable CSA should FAIL (50mm² for 600A)")
        check(_has(checks, "unit price within", FAIL),
              "BAD price band should FAIL (10x estimate)")
        check(_has(checks, "cover grand total", FAIL),
              "BAD Σ-lines==cover should FAIL")
        check(_has(checks, "within_spec == false", FAIL),
              "BAD connectivity tally should FAIL")
        check(_has(checks, "velocity <= spec limit", FAIL),
              "BAD velocity-vs-limit should FAIL (7.6 > 3)")
        check(_has(checks, "Process parts with both fluid in+out", FAIL),
              "BAD process-coverage should FAIL (17/28 = 61% < 80%)")
        check(_has(checks, "Instruments associated", FAIL),
              "BAD instrument-coverage should FAIL (16/21 = 76% < 80%)")

    # ---- the engine's OWN non-pass closure verdict must SURFACE, not be dropped ----
    #      capex_within_ceiling status=warn (£8.15M design vs the £5.0M brief ceiling)
    #      is the single most important customer constraint; a breach the engine
    #      recorded must not hide behind an all-green book. A PASS closure stays silent.
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, {
            "orchestratorContract": {"quantities": {}, "closures": [
                {"invariant_id": "capex_within_ceiling", "status": "warn",
                 "measured": 8150000, "required": "equipment capex <= GBP 5.0M ceiling",
                 "reason": "Equipment capex anchor GBP 8.15M vs the GBP 5.0M ceiling."},
                {"invariant_id": "ceiling_satisfied_elsewhere", "status": "pass",
                 "measured": 4000000, "required": "capex <= GBP 5.0M ceiling"},
            ]},
            "requirementsBom": [], "partVerifications": []}, {}, {})
        checks = run_all_checks(d)
        check(_has(checks, "capex_within_ceiling", FAIL),
              "WARN closure (capex over ceiling) must surface as a deterministic FAIL")
        check(not any("ceiling_satisfied_elsewhere" in c.name for c in checks),
              "PASS inequality closure must stay silent (never fabricate a FAIL)")

    # ---- RATIO-FRACTION CLOSURE proveCatch (CO2-mineralisation cross-val 2026-07-06):
    #      a molar-mass/conversion RATIO written as 'A/B' inside an 'X x A/B ~ Y' closure
    #      must never be read as two literal multiplicands (100x44=4400) — the closure's
    #      OWN trailing stated value (2.27) is the target. Both directions: the ratio
    #      shape must PASS when measured matches the trailing value, and a genuine plain
    #      'A x B' closure (no fraction) must still compute its product as before. ----
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, {
            "orchestratorContract": {"quantities": {}, "closures": [
                {"invariant_id": "caco3_output_reconciles_with_co2_fixed", "status": "pass",
                 "measured": 2.27,
                 "required": "CaCO₃ output ≈ CO₂ fixed × 100/44 ≈ 2.27 t/d (stoichiometric)",
                 "reason": "CaCO3 output 2.27 t/d vs stoichiometric 2.27 t/d from 1.00 t/d CO2 fixed."},
                {"invariant_id": "plain_product_closure", "status": "pass", "measured": 4400,
                 "required": "widget count x unit mass = 100 x 44 total mass",
                 "reason": "sanity: a genuine A x B closure with no fraction still multiplies."},
            ]},
            "requirementsBom": [], "partVerifications": []}, {}, {})
        checks = run_all_checks(d)
        check(_has(checks, "caco3_output_reconciles_with_co2_fixed", PASS),
              "RATIO-FRACTION: a stoichiometric '... x 100/44 ... 2.27' closure whose "
              "measured value (2.27) matches its OWN trailing stated result must PASS, "
              "not FAIL against a fabricated 100x44=4400 target")
        check(_has(checks, "plain_product_closure", PASS),
              "RATIO-FRACTION (control): a genuine plain 'A x B' closure with no "
              "embedded fraction must still compute its product normally (100x44=4400)")

    # ---- MAGNITUDE CEILING + CROSS-CHECK JOIN proveCatch (2026-07-02, the v55 shape):
    #      an ABSURD incomer (184,166,200 kVA on a 53 kW load) must FAIL the adequacy
    #      check (was: PASSed — ">= load x 1.25" had no upper bound); the STALE tool
    #      claim flags total_supply_demand_kw; the lineage closure flags the derived
    #      _kva; and a 'tool matches contract' PASS on the flagged _kva is DEMOTED. ----
    v55_state = {
        "orchestratorContract": {
            "product_class": "synthetic_v55",
            "quantities": {
                "connected_electrical_load_kw": {"value": 53, "unit": "kW"},
                "total_supply_demand_kw": {"value": 132599650.69, "unit": "kW",
                                           "lineage": {"from": ["connected_electrical_load_kw"]}},
                "total_supply_demand_kva": {"value": 184166200, "unit": "kVA",
                                            "lineage": {"from": ["total_supply_demand_kw"]}},
            },
            "closures": [],
        },
        "requirementsBom": [], "partVerifications": [],
    }
    v55_tools = {"tools": [{
        "tool_id": "first-principles:process",
        "claims": [
            # the tool computed 53 but the design holds 1.326e8 -> STALE FAIL (flags the key)
            {"field": "total_supply_demand_kw", "value": 53},
            # the tool "matches" the corrupt derived kVA -> locally-true PASS that MUST be demoted
            {"field": "total_supply_demand_kva", "value": 184166200},
        ]}]}
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, v55_state, {}, {}, tools=v55_tools)
        checks = run_all_checks(d)
        check(_has(checks, "incomer kVA", FAIL),
              "V55 CEILING: incomer 184,166,200 kVA on a 53 kW load must FAIL "
              "(magnitude ceiling <= load x 100), never PASS as 'adequate'")
        _kva_ck = next((c for c in checks if "incomer kVA" in c.name), None)
        check(_kva_ck is not None and _kva_ck.ceiling == 5300.0,
              f"V55 CEILING: the adequacy check must carry ceiling = 53 x 100 = 5300 "
              f"(got {_kva_ck and _kva_ck.ceiling})")
        check(_has(checks, "Tool output used: total_supply_demand_kw", FAIL),
              "V55: the STALE tool claim (53 vs 1.326e8) must FAIL")
        _kva_prov = next((c for c in checks
                          if c.name == "Tool output used: total_supply_demand_kva"), None)
        check(_kva_prov is not None and _kva_prov.status == FAIL and _kva_prov.cross_flagged,
              f"V55 CROSS-CHECK: a 'tool matches contract' PASS on the flagged derived kVA "
              f"must be DEMOTED to FAIL (got {_kva_prov and (_kva_prov.status, _kva_prov.cross_flagged)})")
        flagged = flagged_quantity_reasons(checks, v55_state)
        check("total_supply_demand_kw" in flagged,
              "V55 FLAG SET: the STALE-failed quantity must be in the flagged set")
        check("total_supply_demand_kva" in flagged,
              "V55 FLAG SET: lineage closure must flag the kVA DERIVED from the flagged kW")
        check("connected_electrical_load_kw" not in flagged,
              "V55 FLAG SET: lineage flows FORWARD only — the sane 53 kW load "
              "(an INPUT to the flagged aggregate) must NOT be flagged")
    # a LEGITIMATE margin (1250 kVA on 800 kW = 1.56x) must still PASS under the ceiling —
    # already asserted by the CLEAN run above ("CLEAN incomer kVA should PASS").

    # ---- DEVICE-SCALE INCOMER proveCatch (2026-07-16 Poseidon): a bench instrument
    #      with psu_transformer_kva=0.25 AND a leftover plant total_supply_demand_kva=25
    #      must prefer the PSU and PASS — never FAIL the ×100 ceiling on the plant phantom.
    bench_state = {
        "orchestratorContract": {
            "product_class": "syringe_pump",
            "quantities": {
                "connected_electrical_load_kw": {"value": 0.087, "unit": "kW"},
                "psu_transformer_kva": {"value": 0.25, "unit": "kVA"},
                "total_supply_demand_kva": {"value": 25, "unit": "kVA"},
            },
            "closures": [],
        },
        "requirementsBom": [], "partVerifications": [],
    }
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, bench_state, {}, {})
        checks = run_all_checks(d)
        _ck = next((c for c in checks if "incomer kVA" in c.name), None)
        check(_ck is not None and _ck.status == PASS and _ck.actual == 0.25,
              f"DEVICE-SCALE INCOMER: must select psu_transformer_kva=0.25 and PASS "
              f"(got {_ck and (_ck.status, _ck.actual, _ck.producer)}) — plant 25 kVA phantom skipped")

    # ---- LEDGER COMPLETENESS prefers parts-ledger (2026-07-17 Colorimeter):
    #      stale connection-ledger "Control Switch missing signal" must NOT FAIL when
    #      parts-ledger connectivity reports 0 concerns after freshen-scorer.
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, {"orchestratorContract": {"quantities": {}},
                             "requirementsBom": [], "partVerifications": []}, {}, {})
        with open(os.path.join(d, "connection-ledger.json"), "w") as f:
            json.dump({
                "completeness": {
                    "n_concerns": 1,
                    "concerns": [{"part": "Control Switch", "missing": ["signal"]}],
                },
                "referential_integrity": {"n_violations": 0, "violations": []},
            }, f)
        with open(os.path.join(d, "parts-ledger.json"), "w") as f:
            json.dump({
                "connectivity": {"n_concerns": 0, "concerns": []},
                "referential_integrity": {"n_violations": 0, "violations": []},
            }, f)
        checks = run_all_checks(d)
        _ck = next((c for c in checks if c.name.startswith("Ledger completeness")), None)
        check(_ck is not None and _ck.status == PASS and _ck.actual == 0.0,
              f"LEDGER PREFER PARTS-LEDGER: stale connection-ledger concern must be "
              f"ignored when parts-ledger is clean (got {_ck and (_ck.status, _ck.actual)})")

    # ---- BESS CROSS-VAL proveCatches (2026-07-03) — the three checks re-keyed for the
    #      electrical-storage archetype must each still CATCH their adversarial input
    #      (both directions). ----
    xv_state = {
        "orchestratorContract": {
            "product_class": "synthetic_xval",
            "quantities": {
                "cell_heat_generation_kw": {"value": 45.1, "unit": "kW"},
                "system_thermal_dissipation_kw": {"value": 95.1, "unit": "kW"},
            },
            "closures": [],
        },
        "requirementsBom": [
            # corrected-basis + ESTIMATE ref → exempt (the estimate was rejected by the
            # pricing pass; re-banding against it is self-contradictory) → PASS
            {"tag": "EP-1", "part": "ABB OTDC200E02P", "qty": 1, "unit_gbp": 430,
             "line_gbp": 430, "requirement": "DC switch disconnector",
             "basis": "catalogue · lifted £95→£430 to the engine corpus 0.6×median"},
            # corrected-basis + LIVE DISTRIBUTOR ref → NOT exempt → the £181-for-a-£75k-PCS
            # under-bill still FAILS (the corpus lift never saw the market evidence)
            {"tag": "INV-1", "part": "Sungrow SC1000UD-MV", "qty": 1, "unit_gbp": 181,
             "line_gbp": 181, "requirement": "PCS skid",
             "basis": "catalogue · lifted £28→£181 to the engine corpus p25"},
            # UNCORRECTED out-of-band vs the estimate → still FAILS (the exemption never
            # blesses a plain-catalogue absurd price; the pv carries no recoverable quote —
            # engine_b_estimate_source is absent — so the catalogue-pin re-band stays out)
            {"tag": "I-1", "part": "Crowcon TXgard-IS+", "qty": 1, "unit_gbp": 900,
             "line_gbp": 900, "requirement": "Gas detector", "basis": "catalogue"},
            # CATALOGUE-PIN + own corpus quote (codema v60 I-104): the joined pv's
            # price_estimate_gbp was OVERWRITTEN to a parametric-physics £420 by a
            # cost-repair pass on a same-MPN sibling, but the row's £76 IS the engine-B
            # corpus quote (£75.75) → re-band against the OWN quote → PASS
            {"tag": "I-2", "part": "Danfoss KPI-TEST-35", "qty": 1, "unit_gbp": 76,
             "line_gbp": 76, "requirement": "Low pressure switch", "basis": "catalogue"},
            # SAME pv shape but the rendered price diverges from its own quote too
            # (£2500 vs the £75.75 quote = x33) → the catalogue label is dishonest →
            # the re-band must NOT bless it → still FAILS
            {"tag": "I-3", "part": "Danfoss KPI-TEST-36", "qty": 1, "unit_gbp": 2500,
             "line_gbp": 2500, "requirement": "High pressure switch", "basis": "catalogue"},
            # DISTRIBUTOR-CATALOGUE db pin: the basis EMBEDS its own quote (£45.68); the
            # pv estimate says £420 (x0.11 → would false-FAIL) → re-band vs the embedded
            # figure → PASS
            {"tag": "V-1", "part": "Wago 221-TEST-415", "qty": 1, "unit_gbp": 46,
             "line_gbp": 46, "requirement": "Lever connector",
             "basis": "distributor catalogue (db:mouser £45.68) — supersedes parametric "
                      "estimate £420.00"},
            # UNIT-BASIS RECONCILIATION proveCatches (X-6 CLI PARITY, 2026-07-05) — the
            # exact Bergquist GP3000S30 numbers cited throughout this codebase: a
            # die-cut per-piece price banded against the distributor's whole-STOCK-
            # SHEET price → reconciled (non-blocking), never a hard FAIL.
            {"tag": "X-6", "part": "Bergquist GP3000S30", "qty": 1, "unit_gbp": 2.50,
             "line_gbp": 2.50, "requirement": "cell insulation pad", "basis": "catalogue"},
            # SAME piece-of-stock noun + SAME pv, OVER direction (£420 vs £56.48) — the
            # over direction is NEVER excused, must stay FAIL.
            {"tag": "X-6B", "part": "Bergquist GP3000S30", "qty": 1, "unit_gbp": 420,
             "line_gbp": 420, "requirement": "cell insulation pad (over-direction)",
             "basis": "catalogue"},
            # Piece-of-stock noun but an implied yield >500 (5,648x) is not a credible
            # unit-basis artefact — must stay caught.
            {"tag": "X-6C", "part": "Generic LABELR001", "qty": 1, "unit_gbp": 0.01,
             "line_gbp": 0.01, "requirement": "adhesive label", "basis": "catalogue"},
            # Cut-from-reel family (wire per metre vs per reel) — must reconcile.
            {"tag": "X-6D", "part": "Generic WIREROLL01", "qty": 1, "unit_gbp": 3,
             "line_gbp": 3, "requirement": "control wire (per metre)", "basis": "catalogue"},
            # Out-of-band piece-of-stock under-bill with a plausible yield — must still
            # reconcile even though it is well outside the plain x5 band.
            {"tag": "X-6E", "part": "Generic GASKET001", "qty": 1, "unit_gbp": 14,
             "line_gbp": 14, "requirement": "door gasket", "basis": "catalogue"},
            # INV-4 SHAPE, second instance (non-piece-of-stock noun, £30-vs-£3,000 under-
            # bill) — confirms the reconciliation never fires for a principal component,
            # only for X-6-shaped consumables.
            {"tag": "X-6F", "part": "Generic INVERTER01", "qty": 1, "unit_gbp": 30,
             "line_gbp": 30, "requirement": "string inverter", "basis": "catalogue"},
            # BESPOKE FABRICATION proveCatch (2026-07-06, CO2-mineralisation M-102): the
            # exact real-world shape — a bespoke, made-to-order fabrication whose
            # partVerification got a false MPN join (manufacturer='fabricated' + the full
            # description as its 'part_number', see word 'm' below) banded against an
            # £11.70 commodity placeholder → must be EXEMPT (PASS) regardless of the ratio.
            {"tag": "M-102", "part": "fabricated 316L wash-bar manifold — made to order",
             "qty": 1, "unit_gbp": 2800, "line_gbp": 2800,
             "requirement": "cake wash-water manifold", "basis": "catalogue"},
            # SAME shape, "bespoke" vocabulary + UNDER-price direction — the exemption is
            # NOT direction-specific (a bespoke quote below a stale commodity estimate is
            # equally not a valid comparator).
            {"tag": "M-103", "part": "Bespoke stainless drip-tray, made to spec",
             "qty": 1, "unit_gbp": 20, "line_gbp": 20,
             "requirement": "drip tray", "basis": "catalogue"},
            # NEGATIVE CONTROL: a genuine commodity line (no bespoke keyword) 10x over its
            # reference must STILL FAIL — the exemption must never swallow a real
            # over-price just because SOME other row in the run is bespoke.
            {"tag": "B-CTRL", "part": "Generic BRACKET01", "qty": 1, "unit_gbp": 500,
             "line_gbp": 500, "requirement": "mounting bracket", "basis": "catalogue"},
        ],
        "partVerifications": [
            {"word_id": "a", "word_name": "DC switch disconnector", "manufacturer": "ABB",
             "part_number": "OTDC200E02P", "price_estimate_gbp": 6.5},
            {"word_id": "m", "word_name": "cake_wash_manifold_word", "manufacturer": "fabricated",
             "part_number": "fabricated 316L wash-bar manifold — made to order",
             "price_estimate_gbp": 11.7},
            {"word_id": "n", "word_name": "drip_tray_word", "manufacturer": "bespoke",
             "part_number": "Bespoke stainless drip-tray, made to spec",
             "price_estimate_gbp": 200},
            {"word_id": "o", "word_name": "mounting bracket", "manufacturer": "Generic",
             "part_number": "BRACKET01", "price_estimate_gbp": 50},
            {"word_id": "b", "word_name": "PCS skid", "manufacturer": "Sungrow",
             "part_number": "SC1000UD-MV", "distributor_price_gbp": 75000,
             "price_estimate_gbp": 75000},
            {"word_id": "c", "word_name": "Gas detector", "manufacturer": "Crowcon",
             "part_number": "TXgard-IS+", "price_estimate_gbp": 150},
            {"word_id": "d", "word_name": "Low pressure switch", "manufacturer": "Danfoss",
             "part_number": "KPI-TEST-35", "price_estimate_gbp": 420,
             "engine_b_estimate_source": "corpus_price",
             "engine_b_reference_unit_cost_gbp": 75.75},
            {"word_id": "e", "word_name": "High pressure switch", "manufacturer": "Danfoss",
             "part_number": "KPI-TEST-36", "price_estimate_gbp": 420,
             "engine_b_estimate_source": "corpus_price",
             "engine_b_reference_unit_cost_gbp": 75.75},
            {"word_id": "f", "word_name": "Lever connector", "manufacturer": "Wago",
             "part_number": "221-TEST-415", "price_estimate_gbp": 420},
            {"word_id": "g", "word_name": "cell insulation pad", "manufacturer": "Bergquist",
             "part_number": "GP3000S30", "distributor_price_gbp": 56.48},
            {"word_id": "i", "word_name": "adhesive label", "manufacturer": "Generic",
             "part_number": "LABELR001", "distributor_price_gbp": 56.48},
            {"word_id": "j", "word_name": "control wire", "manufacturer": "Generic",
             "part_number": "WIREROLL01", "distributor_price_gbp": 60},
            {"word_id": "k", "word_name": "door gasket", "manufacturer": "Generic",
             "part_number": "GASKET001", "distributor_price_gbp": 100},
            {"word_id": "l", "word_name": "string inverter", "manufacturer": "Generic",
             "part_number": "INVERTER01", "distributor_price_gbp": 3000},
        ],
    }
    # tool claims: the WRONG declared output_field must not trump an exact same-name
    # contract match (cell_heat 45.1 == contract 45.1 → PASS even though its declared
    # output_field points at the 95.1 system quantity)…
    xv_tools = {"tools": [{
        "tool_id": "pybamm:cell-sizing",
        "claims": [
            {"field": "cell_heat_generation_kw", "value": 45.1,
             "output_field": "system_thermal_dissipation_kw"},
            {"field": "system_thermal_dissipation_kw", "value": 95.1,
             "output_field": "system_thermal_dissipation_kw"},
        ]}]}
    xv_ledger = {
        "grand_total_gbp": 4602.51,  # Σ line_gbp: 430+181+900+76+2500+46+2.50+420+0.01+3+14+30
        "connectivity": {"n_process_total": 2, "n_process_connected": 2,
                         "n_instrument_total": 1, "n_instrument_associated": 1,
                         "n_concerns": 0},
    }
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, xv_state, xv_ledger, {}, tools=xv_tools)
        # connection-ledger with SERVICE-BOUNDARY endpoints (legit) + a MISSPELLED part (broken)
        with open(os.path.join(d, "connection-ledger.json"), "w") as f:
            json.dump({"completeness": {"n_concerns": 0, "concerns": []},
                       "referential_integrity": {"n_violations": 3, "violations": [
                           {"edge": "rack string fuse→dc_bus", "end": "to_part",
                            "name": "dc_bus", "reason": "endpoint name is not an authored part"},
                           {"edge": "PCS inverter→heat_rejection", "end": "to_part",
                            "name": "heat_rejection", "reason": "endpoint name is not an authored part"},
                           {"edge": "pump→Bufer Tank", "end": "to_part",
                            "name": "Bufer Tank", "reason": "endpoint name is not an authored part"},
                       ]}}, f)
        checks = run_all_checks(d)
        check(_has(checks, "BoM EP-1: unit price", PASS),
              "XVAL COST: a corpus-corrected price banded against its own REJECTED estimate "
              "must be exempt (PASS)")
        check(_has(checks, "BoM INV-1: unit price", FAIL),
              "XVAL COST: a corrected price that still diverges from a LIVE distributor "
              "price must FAIL (the correction is not market evidence)")
        check(_has(checks, "BoM I-1: unit price", FAIL),
              "XVAL COST: an uncorrected out-of-band price must still FAIL")
        # BESPOKE FABRICATION proveCatch (2026-07-06, CO2-mineralisation M-102), BOTH
        # directions + a negative control:
        check(_has(checks, "BoM M-102: unit price", PASS),
              "BESPOKE: a made-to-order fabrication (£2,800) falsely MPN-joined to an "
              "£11.70 commodity placeholder (239x) must be EXEMPT (PASS)")
        check(_has(checks, "BoM M-103: unit price", PASS),
              "BESPOKE: the 'made to spec' vocabulary + UNDER-price direction (£20 vs "
              "£200) must ALSO be exempt — the exemption is not direction-specific")
        check(_has(checks, "BoM B-CTRL: unit price", FAIL),
              "BESPOKE NEGATIVE CONTROL: a genuine commodity line with no bespoke "
              "keyword (£500 vs £50, 10x) must STILL FAIL — the exemption must never "
              "swallow a real over-price")
        # catalogue-pin re-band proveCatch (codema v60 I-104), BOTH directions:
        check(_has(checks, "BoM I-2: unit price", PASS),
              "CATALOGUE-PIN: a catalogue-basis row banded against a cost-repair-"
              "overwritten estimate must re-band vs its OWN engine-B corpus quote (PASS)")
        check(_has(checks, "BoM I-3: unit price", FAIL),
              "CATALOGUE-PIN: a catalogue-basis row whose rendered price diverges from "
              "its OWN quote must still FAIL (dishonest 'catalogue' label)")
        check(_has(checks, "BoM V-1: unit price", PASS),
              "CATALOGUE-PIN: a 'distributor catalogue (db:…£N)' basis must band against "
              "the quote it EMBEDS, not the superseded parametric estimate (PASS)")
        # UNIT-BASIS RECONCILIATION proveCatches (X-6 CLI PARITY, 2026-07-05) — the CLI
        # must now agree with the workbook + live TS gate 21 on the SAME shapes.
        check(_has(checks, "BoM X-6: unit price", PASS),
              "X-6 CLI PARITY: the Bergquist GP3000S30 die-cut-pad-vs-stock-sheet shape "
              "(£2.50 vs £56.48) must RECONCILE (PASS), matching gate 21 + the workbook")
        check(_has(checks, "BoM X-6B: unit price", FAIL),
              "X-6 CLI PARITY: the SAME piece-of-stock noun in the OVER direction "
              "(£420 vs £56.48) must NEVER be excused — stays FAIL")
        check(_has(checks, "BoM X-6C: unit price", FAIL),
              "X-6 CLI PARITY: a piece-of-stock noun with an implied yield >500 "
              "(5,648x) is not a credible unit-basis artefact — must stay FAIL")
        check(_has(checks, "BoM X-6D: unit price", PASS),
              "X-6 CLI PARITY: a cut-from-reel family (wire per metre vs per reel, "
              "yield 20) must RECONCILE (PASS)")
        check(_has(checks, "BoM X-6E: unit price", PASS),
              "X-6 CLI PARITY: an out-of-band piece-of-stock under-bill with a "
              "plausible yield (door gasket, yield 7) must still RECONCILE (PASS)")
        check(_has(checks, "BoM X-6F: unit price", FAIL),
              "X-6 CLI PARITY / INV-4 SHAPE: a non-piece-of-stock principal (string "
              "inverter, £30 vs £3,000) must NEVER reconcile — genuine under-bill stays FAIL")
        check(_has(checks, "Tool output used: cell_heat_generation_kw", PASS),
              "XVAL PROVENANCE: an exact same-name contract match (45.1==45.1) must PASS even "
              "when the claim's declared output_field points at a different quantity")
        check(_has(checks, "Tool output used: system_thermal_dissipation_kw", PASS),
              "XVAL PROVENANCE: the true system claim must PASS (95.1==95.1)")
        _ri = next((c for c in checks if "referential integrity" in c.name), None)
        check(_ri is not None and _ri.status == FAIL and _ri.actual == 1.0
              and "Bufer Tank" in _ri.detail,
              f"XVAL LEDGER: service-boundary endpoints (dc_bus/heat_rejection) must be "
              f"filtered while the MISSPELLED part endpoint still FAILS "
              f"(got {_ri and (_ri.status, _ri.actual)})")
    # …and a same-name claim whose VALUE disagrees must still FAIL (stale stays caught).
    xv_stale = json.loads(json.dumps(xv_state))
    xv_stale["orchestratorContract"]["quantities"]["cell_heat_generation_kw"]["value"] = 22.0
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, xv_stale, xv_ledger, {}, tools=xv_tools)
        checks = run_all_checks(d)
        check(_has(checks, "Tool output used: cell_heat_generation_kw", FAIL),
              "XVAL PROVENANCE: a same-name claim whose value disagrees with the contract "
              "(45.1 vs 22.0) must still FAIL (stale tool output stays caught)")

    # ---- CODEMA V77 proveCatches (2026-07-05) — duplicate-MPN join disambiguation +
    #      actuated-valve-assembly exemption. Reproduces V-103/V-108 (two partVerifications
    #      legitimately share one manufacturer+part_number; the check must join the BoM row
    #      to the candidate its own `requirement` text actually names, not the first one
    #      indexed) and V-107/V-109/V-110 (an honest actuated-valve-assembly price must not
    #      band against the bare-valve-body estimate it deliberately supersedes). ----
    dup_state = {
        "orchestratorContract": {"product_class": "synthetic_dup_mpn", "quantities": {}},
        "requirementsBom": [
            # V-103 shape: TWO words share (Pentair Structural, 36X72 COMP...) — the
            # STALE 'Softener Vessel' sibling (£840) must NOT win this row's join; the
            # row's own requirement text names 'Gac Softener', which the fresh sibling's
            # word_name matches exactly.
            {"tag": "V-103", "part": "Pentair Structural 36X72 COMP 6\"TF 6\"BF",
             "qty": 1, "unit_gbp": 14825, "line_gbp": 14825,
             "requirement": "Gac Softener · 15 m³/h · 0.9 m dia x 1.8 m",
             "basis": "catalogue"},
            # V-108 shape: TWO words share (Sensata, SOL7A4) — an early Engine-B curve
            # placeholder ('Solenoid Valves', £25) and a later Farnell-verified duplicate
            # ('Solenoid Valve', £393.05). The row names the SINGULAR form.
            {"tag": "V-108", "part": "Sensata Technologies, Inc. SOL7A4",
             "qty": 1, "unit_gbp": 393, "line_gbp": 393,
             "requirement": "Solenoid Valve", "basis": "catalogue"},
            # V-107/109/110 shape: an ACTUATED-VALVE ASSEMBLY price (£200) must not band
            # against the bare-valve-body Engine-B curve estimate (£18) it supersedes.
            {"tag": "V-107", "part": "Bürkert Type 2000", "qty": 1,
             "unit_gbp": 200, "line_gbp": 200,
             "requirement": "Keystone Composeal 125 mm Pneumatic Butterfly Valve",
             "basis": "actuated-valve assembly (actuator + valve body as ONE unit): "
                      "£80 base + £1.85/DN·mm × DN65 assumed (2½ in class) = £200 "
                      "(UK-2026 trade supply, never the bare-valve band)"},
            # Adversarial control: the SAME basis wording, but the reference is a LIVE
            # DISTRIBUTOR price (independent market evidence) rather than a parametric
            # curve estimate — the exemption must NOT engage here (a genuinely wrong
            # price behind honest-looking basis text must still be caught).
            {"tag": "V-CTRL", "part": "Bürkert Type 9999", "qty": 1,
             "unit_gbp": 200, "line_gbp": 200,
             "requirement": "Control actuated valve",
             "basis": "actuated-valve assembly (actuator + valve body as ONE unit): "
                      "£80 base + £1.85/DN·mm × DN65 assumed (2½ in class) = £200 "
                      "(UK-2026 trade supply, never the bare-valve band)"},
            # P-106 shape (the text-overlap heuristic's own regression, caught before this
            # fix shipped): THREE words share (Grundfos, 96122012) — the true match
            # ('Grundfos CR 32-4-2 ... Circulation Pump', £8,634) plus two unrelated
            # DB-mismatch words whose VERBOSE names happen to share MORE requirement
            # tokens ('fertigation', 'dosing', 'pump') than the true match's concise
            # name does. A name/token-overlap disambiguator picks the wrong one; picking
            # by closest reference PRICE does not.
            {"tag": "P-106", "part": "Grundfos 96122012", "qty": 2,
             "unit_gbp": 8634, "line_gbp": 17268,
             "requirement": "Fertigation Dosing Pump · 8 kW · 600x510x660 mm",
             "basis": "catalogue"},
            # E-104 shape (CO2-mineralisation cross-val 2026-07-06, MOST-SPECIFIC-FIRST
            # fix): the row's OWN part string 'CB30 (brazed-plate condenser)' is a
            # SUBSTRING match for BOTH the plainer 'CB30' key (indexed first, shared by
            # two UNRELATED CB30 duplicates) AND its own fully-qualified 'CB30
            # (brazed-plate condenser)' key (an EXACT match, indexed later). Before the
            # fix, plain dict-iteration order picked the plainer key first and joined
            # this row to an unrelated £3,000 sibling instead of its own £21,500 exact
            # entry — a fabricated x7.2 cost-band FAIL that was a checker mis-join, not a
            # real mispriced part.
            {"tag": "E-104", "part": "Alfa Laval CB30 (brazed-plate condenser)",
             "qty": 1, "unit_gbp": 21500, "line_gbp": 21500,
             "requirement": "overhead condenser", "basis": "catalogue"},
        ],
        "partVerifications": [
            {"word_id": "softener_vessel_synth_word", "word_name": "Pentair Fleck 2900S Softener Vessel Assembly",
             "manufacturer": "Pentair Structural", "part_number": "36X72 COMP 6\"TF 6\"BF",
             "price_estimate_gbp": 840},
            {"word_id": "gac_softener_synth_word", "word_name": "Gac Softener",
             "manufacturer": "Pentair Structural", "part_number": "36X72 COMP 6\"TF 6\"BF",
             "price_estimate_gbp": 14825},
            {"word_id": "solenoid_valves_word", "word_name": "Solenoid Valves",
             "manufacturer": "Sensata Technologies, Inc.", "part_number": "SOL7A4",
             "price_estimate_gbp": 25},
            {"word_id": "solenoid_valve_word", "word_name": "Solenoid Valve",
             "manufacturer": "Sensata Technologies, Inc.", "part_number": "SOL7A4",
             "distributor_price_gbp": 393.05},
            {"word_id": "pneumatic_actuated_valves_word", "word_name": "Pneumatic Actuated Valves",
             "manufacturer": "Bürkert", "part_number": "Type 2000",
             "price_estimate_gbp": 18},
            {"word_id": "ctrl_valve_word", "word_name": "Control actuated valve",
             "manufacturer": "Bürkert", "part_number": "Type 9999",
             "distributor_price_gbp": 6.5},
            {"word_id": "fertigation_dosing_pump_synth_word",
             "word_name": "Grundfos CR 32-4-2 A-F-A-E-HQQE Circulation Pump",
             "manufacturer": "Grundfos", "part_number": "96122012",
             "price_estimate_gbp": 8634},
            {"word_id": "fertigation_dosing_system__primary_assembly_completion_word",
             "word_name": "Fertigation dosing / injection pump — vertical multistage, 30 m3/h @ 53.1 m, 7.5",
             "manufacturer": "Grundfos", "part_number": "96122012",
             "price_estimate_gbp": 35},
            {"word_id": "fertigation_dosing_pump_synth_word__suction_isolation_valve",
             "word_name": "Suction Isolation Valve (on Fertigation Dosing Pump)",
             "manufacturer": "Grundfos", "part_number": "96122012",
             "price_estimate_gbp": 448},
            # E-104 shape — insertion order matters: the plainer 'CB30' key's FIRST
            # candidate is indexed before the fuller 'CB30 (brazed-plate condenser)' key.
            {"word_id": "dryer_condensate_cooler_word", "word_name": "dryer condensate cooler",
             "manufacturer": "Alfa Laval", "part_number": "CB30",
             "distributor_price_gbp": 2400},
            {"word_id": "overhead_condenser_word", "word_name": "overhead condenser",
             "manufacturer": "Alfa Laval", "part_number": "CB30 (brazed-plate condenser)",
             "distributor_price_gbp": 21500},
            {"word_id": "reflux_subcooler_word", "word_name": "reflux subcooler",
             "manufacturer": "Alfa Laval", "part_number": "CB30",
             "distributor_price_gbp": 3000},
        ],
    }
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, dup_state, {}, {})
        checks = run_all_checks(d)
        check(_has(checks, "BoM V-103: unit price", PASS),
              "DUP-MPN JOIN: V-103's £14,825 must band against its OWN 'Gac Softener' "
              "sibling (also £14,825), not the stale 'Softener Vessel' sibling's £840 "
              "(would read x17.6 and FAIL as a two-truths artefact)")
        check(_has(checks, "BoM V-108: unit price", PASS),
              "DUP-MPN JOIN: V-108's £393 must band against its OWN 'Solenoid Valve' "
              "(singular) sibling's £393.05 distributor price, not the stale 'Solenoid "
              "Valves' (plural) placeholder's £25")
        check(_has(checks, "BoM V-107: unit price", PASS),
              "ACTUATED-VALVE ASSEMBLY: an honest £200 actuator+valve assembly price must "
              "not band against the £18 bare-valve-body estimate it deliberately "
              "supersedes (basis states the derivation + 'never the bare-valve band')")
        check(_has(checks, "BoM V-CTRL: unit price", FAIL),
              "ACTUATED-VALVE ASSEMBLY (adversarial control): the SAME basis wording must "
              "NOT exempt a price that diverges from a LIVE DISTRIBUTOR reference (£200 "
              "vs £6.50 = x30.8) — the exemption only ever supersedes a weak parametric "
              "estimate, never real market evidence")
        check(_has(checks, "BoM P-106: unit price", PASS),
              "DUP-MPN JOIN (3-way, closest-price not closest-text): P-106's £8,634 must "
              "band against the true 'Grundfos CR 32-4-2 ... Circulation Pump' sibling "
              "(also £8,634), not the two unrelated £35 / £448 DB-mismatch siblings whose "
              "VERBOSE names share more requirement tokens ('fertigation dosing pump')")
        check(_has(checks, "BoM E-104: unit price", PASS),
              "MOST-SPECIFIC-FIRST MPN JOIN: E-104's £21,500 must band against its OWN "
              "fully-qualified 'CB30 (brazed-plate condenser)' entry (also £21,500, an "
              "exact match), not the plainer 'CB30' key's £3,000/£2,400 UNRELATED "
              "siblings merely because that shorter key was indexed first (would read "
              "x7.2 and FAIL as a checker mis-join, not a real mispriced part)")

    # ---- OpenFlexure 2026-07-17: exact key + um/µm fold — must NOT bind Abbe ----
    focus_state = {
        "orchestratorContract": {
            "product_class": "lab_microscope",
            "quantities": {
                "focus_resolution_um": {"value": 1.0, "unit": "µm"},
                "abbe_resolution_um": {"value": 0.611, "unit": "µm"},
            },
        },
        "parsedBrief": {
            "constraints": {
                "target_performance": {
                    "metrics": [
                        {"key_metric": "focus_resolution_um", "value": 1.0, "unit": "um"},
                    ],
                },
            },
        },
        "requirementsBom": [],
        "partVerifications": [],
    }
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, focus_state, {}, {})
        # Write brief so _checks_brief_compliance can load metrics if needed
        with open(os.path.join(d, "1-parsed-brief.json"), "w") as fh:
            json.dump(focus_state["parsedBrief"], fh)
        checks = run_all_checks(d)
        check(_has(checks, "Brief target met: focus_resolution_um", PASS),
              "FOCUS um/µm: brief 1 um must PASS against contract focus_resolution_um=1 µm "
              "(exact key), NOT fail via fuzzy bind to abbe_resolution_um=0.611")

    # ---- COST-BAND CENTRE (organoid r11, 2026-07-26) --------------------------------
    # A £291 BoM against a £330 midpoint is WITHIN the ±20% plausibility band → the
    # 'Brief target met: bom_cost_midpoint_gbp' invariant must PASS (a directional ge
    # test false-FAILed it). A £150 BoM is >20% out → still FAIL.
    _cost_brief = {"constraints": {"target_performance": {"metrics": [
        {"key_metric": "bom_cost_midpoint_gbp", "value": 330, "unit": "GBP"},
    ]}}}
    for _bom, _want in ((291, PASS), (150, FAIL)):
        _cost_state = {
            "orchestratorContract": {"quantities": {
                "bom_cost_midpoint_gbp": {"value": _bom, "unit": "GBP"}}},
            "parsedBrief": _cost_brief,
            "requirementsBom": [], "partVerifications": [],
        }
        with tempfile.TemporaryDirectory() as tmp:
            d = _write_run(tmp, _cost_state, {}, {})
            with open(os.path.join(d, "1-parsed-brief.json"), "w") as fh:
                json.dump(_cost_state["parsedBrief"], fh)
            checks = run_all_checks(d)
            check(_has(checks, "Brief target met: bom_cost_midpoint_gbp", _want),
                  f"COST midpoint band: a £{_bom} BoM vs £330 midpoint must be "
                  f"{'PASS (within ±20%)' if _want == PASS else 'FAIL (>20% out)'}")

    # ---- UNIVERSALITY: a minimal class with none of these inputs -> all N/A,
    #      zero FAIL (the suite must never invent a failure on a sparse class) ----
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, {"orchestratorContract": {"quantities": {}},
                             "requirementsBom": [], "partVerifications": []},
                       {}, {})
        checks = run_all_checks(d)
        _, fcount, _ = summarise(checks)
        check(fcount == 0, "SPARSE class must produce zero FAIL (universal skip)")

    # ---- PLAUSIBILITY family (2026-07-21) — proveCatch both directions --------
    # DEFECTIVE: a watt-scale instrument with a 16 mm2 cable, 0 kg cable mass, a
    # water edge between two electronic parts, and a duplicated generic part name.
    with tempfile.TemporaryDirectory() as tmp:
        bad_state = {
            "isInstrumentDevice": True,
            "orchestratorContract": {"quantities": {
                "connected_electrical_load_kw": {"value": 0.035, "unit": "kW"},
                "power_cable_csa_mm2": {"value": 16, "unit": "mm2"},
                "cable_mass_kg": {"value": 0, "unit": "kg"},
            }},
            "partVerifications": [
                {"name": "Sensing Instrumentation Subcomponent"},
                {"name": "Sensing Instrumentation Subcomponent"},
            ],
        }
        bad_conns = {"rows": [
            {"mechanism": "water", "from": "Debug Header", "to": "Cable Strain Relief"},
            {"mechanism": "signal", "from": "Sensor", "to": "Mcu"},
        ]}
        d = _write_run(tmp, bad_state, {}, bad_conns)
        pc = _checks_plausibility(bad_state, d)
        check(_has(pc, "Cable CSA is scale-plausible", FAIL),
              "P3: a 16 mm2 cable on a 35 W device must FAIL")
        check(_has(pc, "Sized cable has non-zero mass", FAIL),
              "P2: a sized cable with 0 kg mass must FAIL")
        check(_has(pc, "Fluid services connect fluid-handling", FAIL),
              "P6: a water edge between two non-fluid parts must FAIL")
        check(_has(pc, "Part names are specific", FAIL),
              "P5: a duplicated generic '…Subcomponent' name must FAIL")
    # P7/P8/P9 (2026-07-21, the 4-agent review): negative margin, a part bigger than the
    # enclosure, and a metre-scale run inside a benchtop box.
    with tempfile.TemporaryDirectory() as tmp:
        bad2_state = {
            "isInstrumentDevice": True,
            "orchestratorContract": {"quantities": {
                "emc_compliance_margin_dB": {"value": -30, "unit": "dB"},
            }},
        }
        d = _write_run(tmp, bad2_state, {}, {"rows": [
            {"mechanism": "signal", "from": "Probe", "to": "Mcu", "length_m": 2.37},
        ]})
        # oversized part + a small enclosure bbox → P8 + P9 fire
        with open(os.path.join(d, "parts-manifest.json"), "w") as _f:
            json.dump({"bbox_mm": {"length_mm": 281, "width_mm": 165, "height_mm": 82},
                       "parts": [
                           {"name": "Enclosure Shell", "dims_mm": {"w": 221, "d": 165, "h": 82}},
                           {"name": "Culture Temperature Probe", "dims_mm": {"w": 260, "d": 309, "h": 240}},
                       ]}, _f)
        pc = _checks_plausibility(bad2_state, d)
        check(_has(pc, "margins are non-negative", FAIL),
              "P7: a negative EMC/compliance margin must FAIL")
        check(_has(pc, "fits inside the enclosure", FAIL),
              "P8: a part larger than its enclosure must FAIL")
        check(_has(pc, "Internal runs fit within", FAIL),
              "P9: a 2.37 m run in a 281 mm box must FAIL")
    # CLEAN: a plausibly-sized instrument — every plausibility check PASSes.
    with tempfile.TemporaryDirectory() as tmp:
        good_state = {
            "isInstrumentDevice": True,
            "orchestratorContract": {"quantities": {
                "connected_electrical_load_kw": {"value": 0.035, "unit": "kW"},
                "power_cable_csa_mm2": {"value": 0.75, "unit": "mm2"},
                "cable_mass_kg": {"value": 0.02, "unit": "kg"},
                "emc_compliance_margin_dB": {"value": 6, "unit": "dB"},
            }},
            "partVerifications": [
                {"name": "Culture Temperature Probe"},
                {"name": "Magnetic Stirrer Drive"},
            ],
        }
        good_conns = {"rows": [
            {"mechanism": "water", "from": "Media Tubing Set", "to": "Culture Vessel", "length_m": 0.15},
            {"mechanism": "signal", "from": "Temperature Sensor", "to": "Mcu", "length_m": 0.2},
        ]}
        d = _write_run(tmp, good_state, {}, good_conns)
        with open(os.path.join(d, "parts-manifest.json"), "w") as _f:
            json.dump({"bbox_mm": {"length_mm": 221, "width_mm": 165, "height_mm": 82},
                       "parts": [
                           {"name": "Enclosure Shell", "dims_mm": {"w": 221, "d": 165, "h": 82}},
                           {"name": "Culture Temperature Probe", "dims_mm": {"w": 6, "d": 6, "h": 50}},
                       ]}, _f)
        pc = _checks_plausibility(good_state, d)
        check(not any(c.status == FAIL for c in pc),
              "PLAUSIBILITY clean instrument must produce zero FAIL")

    if failures:
        print("SELFTEST FAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("deterministic_checks_lib selftest: all invariants hold "
          "(clean=all-pass, defective=each-family-trips, sparse=all-N/A).")
    return 0


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    print("deterministic_checks_lib is a library; run scripts/deterministic-checks.py "
          "<run-dir>, or pass --selftest.")
