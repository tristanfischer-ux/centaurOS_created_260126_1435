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
        out.append(Check(
            name=f"{base.replace('_', ' ')}: per-unit x {ck} == {total_key}",
            category="CONSISTENCY", relation="eq",
            status=_eq_status(per_unit * cnt, total, _tol_pct(total, 0.02, 1.0)),
            actual=per_unit * cnt, expected=total,
            tol=_tol_pct(total, 0.02, 1.0), unit=unit,
            a_factors=(per_unit, cnt), producer=per_key,
            detail=(f"{per_unit:g} {unit} per unit x {cnt:g} units must equal the "
                    f"{total:g} {unit} system total ({total_key})."),
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
        out.append(Check(
            name=f"BoM {tag}: unit_gbp x qty == line_gbp",
            category="CONSISTENCY", relation="eq",
            status=_eq_status(unit_p * qty, line, _tol_pct(line, 0.005, 1.0)),
            actual=unit_p * qty, expected=line,
            tol=_tol_pct(line, 0.005, 1.0), unit="GBP",
            a_factors=(unit_p, qty), producer=f"bom:{tag}:unit",
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
        # extract the FIRST motor/shaft kW figure in the requirement, if any
        m = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*kw\s*(?:motor|shaft|rated)?", req, re.IGNORECASE)
        if not m:
            continue
        rating = num(m.group(1))
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
    hyd_w = _first_qval(q, ["recirc_pump_hydraulic_power_w", "pump_hydraulic_power_w"])
    motor_kw = _first_qval(q, ["recirc_pump_motor_kw", "pump_motor_kw"])
    eta = _first_qval(q, ["pump_efficiency", "recirc_pump_efficiency",
                          "pump_overall_efficiency"]) or 0.65
    if hyd_w is not None and motor_kw is not None and eta and 0 < eta <= 1:
        duty_kw = (hyd_w / 1000.0) / eta
        out.append(Check(
            name="Pump motor kW >= hydraulic / efficiency",
            category="ADEQUACY", relation="ge",
            status=_ge_status(motor_kw, duty_kw),
            actual=motor_kw, expected=duty_kw, tol=0.0, unit="kW",
            producer="recirc_pump_motor_kw",
            detail=(f"Motor {motor_kw:g} kW must cover hydraulic {hyd_w/1000:g} kW "
                    f"/ eta {eta:g} = {duty_kw:.3g} kW shaft duty."),
        ))

    # --- A2. main incomer rating >= connected load x 1.25 ---
    # The main protective device / supply incomer must carry the connected load
    # with a 1.25 margin. TWO equivalent forms, both derived from the contract:
    #   (a) PREFERRED, assumption-free: incomer APPARENT power (kVA) >= load kW x
    #       1.25 (kVA >= kW for any PF<=1; this is the basis the engine itself sizes
    #       the transformer on, so no power-factor guess is needed).
    #   (b) FALLBACK: incomer CURRENT (A) >= load-derived current at the contract's
    #       stated voltage + power factor (only when an explicit PF is present).
    conn_kw = _first_qval(q, ["connected_electrical_load_kw", "connected_load_kw",
                              "total_connected_load_kw", "installed_electrical_load_kw"])
    incomer_kva, kva_key = None, ""
    for k in ("main_transformer_kva", "main_incomer_kva", "supply_transformer_kva",
              "total_supply_demand_kva", "main_supply_kva"):
        v = qval(q, k)
        if v is not None and v > 0:
            incomer_kva, kva_key = v, k
            break
    if conn_kw is not None and incomer_kva is not None:
        required_kva = conn_kw * 1.25  # kVA must be >= kW; 1.25 design margin
        out.append(Check(
            name="Main incomer kVA >= connected load x 1.25",
            category="ADEQUACY", relation="ge",
            status=_ge_status(incomer_kva, required_kva),
            actual=incomer_kva, expected=required_kva, tol=0.0, unit="kVA",
            producer=kva_key,
            detail=(f"Incomer {incomer_kva:g} kVA ({kva_key}) must be >= "
                    f"{conn_kw:g} kW x 1.25 = {required_kva:.4g} kVA "
                    f"(kVA >= kW for any power factor)."),
        ))
    else:
        # (b) current form — only with an explicit PF (else we won't guess one)
        breaker_a, breaker_key = None, ""
        for k in ("main_breaker_rating_a", "main_incomer_rating_a", "main_breaker_a",
                  "incomer_breaker_a", "main_incomer_current_a",
                  "main_transformer_secondary_current_a", "main_feeder_current_a"):
            v = qval(q, k)
            if v is not None and v > 0:
                breaker_a, breaker_key = v, k
                break
        voltage = _first_qval(q, ["distribution_voltage_v", "system_voltage_v",
                                  "supply_voltage_v", "lv_voltage_v",
                                  "secondary_voltage_v"]) or 400.0
        pf = _first_qval(q, ["power_factor", "system_power_factor"])
        if (conn_kw is not None and breaker_a is not None and voltage > 0
                and pf is not None and 0 < pf <= 1):
            required_a = (conn_kw * 1000.0) / (math.sqrt(3) * voltage * pf) * 1.25
            out.append(Check(
                name="Main incomer A >= connected load x 1.25",
                category="ADEQUACY", relation="ge",
                status=_ge_status(breaker_a, required_a),
                actual=breaker_a, expected=required_a, tol=0.0, unit="A",
                producer=breaker_key,
                detail=(f"Incomer {breaker_a:g} A ({breaker_key}) must be >= "
                        f"{conn_kw:g} kW x 1000 / (sqrt3 x {voltage:.0f} V x {pf:g}) "
                        f"x 1.25 = {required_a:.4g} A."),
            ))

    # --- A3. cable CSA >= current (per electrical connection row) ---
    # The connection schedule already sizes each cable + carries a within_spec
    # verdict (voltdrop-based). We add a DERIVED ampacity-floor check: the chosen
    # CSA mm2 must be >= the CSA an air-rated copper-ampacity table requires for
    # that current. Universal: uses a standard BS-7671-style ampacity ladder; skips
    # cleanly when current/size are not parseable.
    out.extend(_checks_cable_csa(cs))

    # --- A4. vessel/tank volume > media (MBBR) fill volume ---
    tank_v = _first_qval(q, ["biofilter_tank_volume_m3", "mbbr_tank_volume_m3"])
    media_v = _first_qval(q, ["biofilter_media_volume_m3", "mbbr_media_volume_m3",
                              "media_volume_m3"])
    if tank_v is not None and media_v is not None and media_v > 0:
        out.append(Check(
            name="Biofilter tank volume > media fill volume",
            category="ADEQUACY", relation="ge",
            status=_ge_status(tank_v, media_v),
            actual=tank_v, expected=media_v, tol=0.0, unit="m3",
            producer="biofilter_tank_volume_m3",
            detail=(f"Tank {tank_v:g} m3 must exceed the {media_v:g} m3 MBBR media "
                    f"fill (carriers cannot exceed the vessel they sit in)."),
        ))

    # --- A5. chiller / heat-pump capacity >= duty ---
    cap = _first_qval(q, ["chiller_capacity_kw", "heat_pump_capacity_kw",
                          "installed_cooling_capacity_kw", "heat_pump_heating_capacity_kw"])
    duty = _first_qval(q, ["cooling_duty_kw", "heating_duty_kw", "thermal_duty_kw",
                           "system_thermal_dissipation_kw"])
    if cap is not None and duty is not None and duty > 0:
        out.append(Check(
            name="Chiller / heat-pump capacity >= thermal duty",
            category="ADEQUACY", relation="ge",
            status=_ge_status(cap, duty),
            actual=cap, expected=duty, tol=0.0, unit="kW",
            producer="thermal_capacity_kw",
            detail=(f"Installed thermal capacity {cap:g} kW must cover the "
                    f"{duty:g} kW design duty."),
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
        ratio = unit_p / ref
        bad = ratio > COST_BAND_FACTOR or ratio < (1.0 / COST_BAND_FACTOR)
        out.append(Check(
            name=f"BoM {tag}: unit price within x{COST_BAND_FACTOR:g} of {ref_src}",
            category="COST", relation="eq",
            status=FAIL if bad else PASS,
            actual=unit_p, expected=ref, tol=0.0, unit="GBP",
            producer=f"cost:{tag}:ref",
            detail=(f"{tag} ({pv.get('manufacturer','?')} {pv.get('part_number','?')}): "
                    f"BoM unit £{unit_p:,.0f} vs {ref_src} £{ref:,.0f} "
                    f"= x{ratio:.1f}. Flag when >x{COST_BAND_FACTOR:g} or "
                    f"<x{1/COST_BAND_FACTOR:g}."),
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

    return out


# ============================================================================
# Status + tolerance primitives
# ============================================================================
def _tol_pct(base: Optional[float], pct: float, floor: float) -> float:
    if base is None:
        return floor
    return max(floor, abs(base) * pct)


def _eq_status(actual: float, expected: float, tol: float) -> str:
    return PASS if abs(actual - expected) < tol else FAIL


def _ge_status(actual: float, expected: float) -> str:
    # rating must be >= duty; a tiny epsilon absorbs float noise at equality.
    return PASS if actual >= expected - 1e-9 - abs(expected) * 1e-9 else FAIL


# ============================================================================
# Parsing helpers
# ============================================================================
_INEQUALITY_PROSE = re.compile(
    r"≤|≥|<=|>=|<|>|ceiling|limit|within|at most|at least|no more than|"
    r"max(?:imum)?|min(?:imum)?|under|below|above|not exceed|cap\b",
    re.IGNORECASE,
)


def _extract_equality_target(required: str, measured: Optional[float]) -> Optional[float]:
    """A numeric EQUALITY target out of a closure's prose ('A x B'); None for a
    one-sided inequality (turning '<= £5M' into 'expected=5M' would fabricate a
    FAIL the engine itself does not assert)."""
    if not required or _INEQUALITY_PROSE.search(required):
        return None
    s = required.replace(",", "")
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", s)]
    if "×" in required or " x " in required.lower():
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
                                    ) -> Dict[Tuple[str, str], dict]:
    """Index partVerifications by (manufacturer.lower, part_number.lower) — the one
    unambiguous join key. Only real part numbers (>=4 chars) are indexed; the
    generic placeholder rows have no usable MPN and are simply absent."""
    idx: Dict[Tuple[str, str], dict] = {}
    for pv in (state.get("partVerifications") or []):
        pn = str(pv.get("part_number") or "").strip()
        mfr = str(pv.get("manufacturer") or "").strip()
        if len(pn) >= 4 and mfr:
            idx.setdefault((mfr.lower(), pn.lower()), pv)
    return idx


def _match_partverification_by_mpn(bom_row: dict,
                                   idx: Dict[Tuple[str, str], dict]
                                   ) -> Optional[dict]:
    """Match a BoM line to its partVerification ONLY by an exact manufacturer +
    part_number both appearing in the line's ``part`` string (e.g. the part
    'Grundfos UP15-42' joins the pv whose mfr='Grundfos', pn='UP15-42'). Returns
    None for any line that does not name a real mfr+MPN (e.g. 'requirement
    stated', 'made to spec', a structural take-off) — those have no authoritative
    independent price to band against, so we never fabricate a cost FAIL on them."""
    part = str(bom_row.get("part") or "").strip().lower()
    if not part:
        return None
    for (mfr, pn), pv in idx.items():
        if mfr in part and pn in part:
            return pv
    return None


# ============================================================================
# PUBLIC ENTRY POINT
# ============================================================================
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
    checks.extend(_checks_adequacy(state, run_dir))
    checks.extend(_checks_balance(state, run_dir))
    checks.extend(_checks_cost(state, run_dir))
    checks.extend(_checks_connectivity(state, run_dir))
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

    def _has(checks: List[Check], name_sub: str, want_status: str) -> bool:
        for c in checks:
            if name_sub.lower() in c.name.lower():
                return c.status == want_status
        return False

    def _write_run(tmp: str, state: dict, ledger: dict, conns: dict) -> str:
        d = os.path.join(tmp, "run")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "state.json"), "w") as f:
            json.dump(state, f)
        with open(os.path.join(d, "parts-ledger.json"), "w") as f:
            json.dump(ledger, f)
        with open(os.path.join(d, "connection-schedule.json"), "w") as f:
            json.dump(conns, f)
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

    # ---- UNIVERSALITY: a minimal class with none of these inputs -> all N/A,
    #      zero FAIL (the suite must never invent a failure on a sparse class) ----
    with tempfile.TemporaryDirectory() as tmp:
        d = _write_run(tmp, {"orchestratorContract": {"quantities": {}},
                             "requirementsBom": [], "partVerifications": []},
                       {}, {})
        checks = run_all_checks(d)
        _, fcount, _ = summarise(checks)
        check(fcount == 0, "SPARSE class must produce zero FAIL (universal skip)")

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
