"""connection_ledger.py — THE authoritative connection ledger for the universal CAD.

ARCHITECTURE (Tristan 2026-06-20, "the ledger should be driving all the connections —
it should say which part connects to what with what; all Blender should do is the
distance calculation based on where the parts sit"):

  THE LEDGER authors WHICH part connects to WHICH, with WHAT service + size.
  BLENDER only measures the routed distance between the placed parts and renders.
  THE BoM costs exactly the ledger's connections.

This module is the ledger AUTHORITY. It takes the candidate connection edges (the
contract's authored process topology + the universal completion that closes the graph
and gives every part its required services) and returns the FINAL, VALIDATED,
ENDPOINT-RESOLVED connection list — every edge guaranteed to start and end at a REAL
placed part (NO nothing-to-nothing pipes), with spurious / mis-typed ties removed.
Blender renders exactly this list and writes back the measured lengths; nothing
downstream may invent a connection the ledger did not author.

Pure + position-free + dependency-injected (the caller passes `resolve_endpoint` + the
`parts` list + a logger), so it is unit-testable and reusable outside Blender's
interpreter. Run `python3 connection_ledger.py --selftest`.
"""
import re


# Dry MATERIAL-HANDLING ancillaries that are NOT on the process-water recirculation
# loop — a feed store is augered/pneumatic, mortalities go to a disposal bin, and
# grading / harvest / transport / biosecurity / quarantine are dry-handling stations.
# A process-WATER (or thermal) main must never tie one of these straight to a rearing
# tank: that was the spurious "web" of pipes Tristan flagged (a feed silo does not pipe
# 1,500 m³/h of process water to the fish tank). They keep their power / signal / small
# service ties; only the bogus main-loop water tie to the tank is removed. Universal —
# class-agnostic handling-station vocabulary, no per-class table.
_DRY_ANCILLARY_RE = re.compile(
    r"feed[_ ]?stor|feed[_ ]?silo|feed[_ ]?system|feed[_ ]?distrib|feed[_ ]?hopper|"
    r"mortalit|\bmort\b|dead[_ ]?fish|"
    r"grad(?:e|ing|er)|crowd|harvest[_ ]?(?:system|station|handl)|"
    r"live[_ -]?fish|fish[_ ]?handl|fish[_ ]?transport|transfer[_ ]?system|"
    r"biosecur|quarant|"
    r"office|staff|amenit|store[_ ]?room|workshop|laborator", re.I)

_TANK_RE = re.compile(
    r"rearing[_ ]?tank|grow[_ ]?out|fish[_ ]?tank|culture[_ ]?tank|nursery[_ ]?tank", re.I)

# ── SERVICE-DOMAIN COMPATIBILITY (2026-07-02, the v55 "Fresh Water Tank → Mains Incomer
# [water]" fix) ─────────────────────────────────────────────────────────────────────────
# SWITCHING / PROTECTION / CONTROL gear NEVER carries process fluid: an incomer,
# switchboard, busbar, MCC, distribution board, breaker, control panel, PLC/SCADA. A fluid
# (water/thermal/air/oxygen) edge terminating on one is a corrupt tie — v55's cross-module
# augmenter picked 'Mains Incomer' as a module representative and routed the 90 m³/h recirc
# main INTO the electrical incomer (shipped on the Connection trace as 'Mains Incomer |
# Inputs ← Fresh Water Tank | Services: power, water'). DELIBERATELY EXCLUDED from this
# classifier: power-CONVERSION gear that legitimately takes liquid cooling (transformer /
# inverter / rectifier / PCS / UPS / generator — a BESS coolant loop to a PCS is real).
# Universal — electrical-gear vocabulary, no class table. The new connection-sanity gate
# (drawing_gates) uses this SAME classifier, so authoring rule and gate stay in lock-step.
SWITCH_CONTROL_GEAR_RE = re.compile(
    r"incomer|switchboard|switchgear|busbar|\bmcc\b|motor[ _-]?control[ _-]?cent|"
    r"distribution[ _-]?(?:board|panel)|circuit[ _-]?breaker|"
    r"control[ _-]?(?:panel|cabinet|room)|\bplc\b|scada|\bdcs\b|\brtu\b|\bhmi\b|"
    r"protection[ _-]?relay|metering[ _-]?(?:panel|cubicle)|electrical[ _-]?(?:panel|cabinet)", re.I)

# A pure STORAGE vessel takes NO power feed (its heater / agitator / dosing skid is a
# separate powered part). Used by the gate's reverse check (power edge into a tank). A
# storage name carrying a powered-internals qualifier is exempt.
PURE_STORAGE_RE = re.compile(r"\b(?:tank|reservoir|storage|silo|cistern)\b", re.I)
POWERED_INTERNALS_RE = re.compile(
    r"heat|agitat|mix|stir|immersion|trace|chill|refriger|aerat|dosing|pump", re.I)

_FLUID_SERVICES = ("water", "thermal", "air", "oxygen")


def _norm_name(s):
    """Case/punctuation-insensitive part-name key (self-loop + merged-tag comparison)."""
    return re.sub(r"[^a-z0-9]+", "", str(s or "").lower())


# ── FLOW-UNIT CANONICALISATION (2026-07-02, the v55 phantom 300,000 m³/h fix) ──────────
# The cross-module / service-tie augmenters scrape `loop_flow` from the authored fluid
# edges (which carry m³/h since the daed1aeab/9f07f8a71 flow joins) but stamp the minted
# edge `required_unit = 'm³/s'` — so a 90 m³/h loop flow ships as 90 m³/s = 324,000 m³/h
# (v55: 6 parallel DN300 runs @ 205.6 m/s @ 9,477 bar, £152k phantom pipe, 132.6 GW
# parasitic pump power). finalize_ledger is the choke point every candidate edge flows
# through, so the ledger AUTHORITY canonicalises here: an edge whose stated flow exceeds
# the plant's own demand ceiling (max contract flow qty × FLOW_CEILING_FACTOR) while the
# BARE magnitude fits the m³/h demand family is a mis-stamped unit → re-stamp m3/h with
# provenance. A flow implausible under EITHER reading is never rescaled (no fabrication) —
# it is marked `_flow_implausible` for the connection-sanity gate to FAIL.
_VOL_FLOW_TO_M3H = {
    "m3/h": 1.0, "m³/h": 1.0, "m3h": 1.0, "m^3/h": 1.0, "m3/hr": 1.0, "m³/hr": 1.0,
    "m3/s": 3600.0, "m³/s": 3600.0, "m3s": 3600.0, "m^3/s": 3600.0,
    "l/s": 3.6, "lps": 3.6, "l/min": 0.06, "lpm": 0.06, "l/h": 0.001, "lph": 0.001,
}
FLOW_CEILING_FACTOR = 5.0   # a single line may carry a combined header, never 5× the
                            # largest demand the contract states anywhere on the plant


def plant_flow_ceiling_m3h(quantities):
    """The plant's own demand-family ceiling: max over the contract's flow-suffixed
    quantities (m³/h), or None when the contract states no flow anywhere."""
    if not quantities:
        return None
    best = None
    for k in quantities:
        if any(k.endswith(suf) for suf in _FLOW_QTY_SUFFIXES):
            v = _qty_num(quantities.get(k))
            if v is not None and v > 0 and (best is None or v > best):
                best = v
    return best


def canonicalise_flow_units(edges, quantities, log=print):
    """In-place unit sanity for FLUID edges (see block comment above). Returns
    (n_corrected, n_implausible). No-op without a stated plant flow ceiling."""
    ceiling = plant_flow_ceiling_m3h(quantities)
    if ceiling is None:
        return (0, 0)
    limit = ceiling * FLOW_CEILING_FACTOR
    n_fix = n_bad = 0
    for e in edges:
        if not isinstance(e, dict):
            continue
        svc = e.get("_ledger_service") or _service_of(e.get("mechanism"))
        if svc not in ("water", "thermal"):
            continue
        v = _qty_num(e.get("required_value"))
        if v is None or v <= 0:
            continue
        unit = str(e.get("required_unit") or "").strip().lower()
        factor = _VOL_FLOW_TO_M3H.get(unit)
        if factor is None:
            continue    # not a volumetric flow rating (or no unit) — not ours to judge
        flow_m3h = v * factor
        if flow_m3h <= limit:
            continue    # plausible as stated
        if factor != 1.0 and v <= limit:
            # the BARE magnitude fits the plant's m³/h demand family — the unit stamp is
            # the corruption (an augmenter copied an m³/h loop flow and wrote m³/s).
            e["required_unit"] = "m3/h"
            e["_unit_corrected_basis"] = (
                f"unit re-stamped {unit}→m3/h: {v:g} {unit} = {flow_m3h:g} m³/h exceeds "
                f"the plant demand ceiling {ceiling:g} m³/h × {FLOW_CEILING_FACTOR:g}, while "
                f"{v:g} m³/h fits the contract's own demand family")
            n_fix += 1
        else:
            e["_flow_implausible"] = (
                f"{v:g} {unit or '?'} = {flow_m3h:g} m³/h exceeds the plant demand ceiling "
                f"{ceiling:g} m³/h × {FLOW_CEILING_FACTOR:g} under every unit reading")
            n_bad += 1
    if n_fix:
        log(f"[ledger] flow-unit canonicalisation: {n_fix} fluid edge(s) re-stamped to m3/h "
            f"(magnitude matched the plant demand family; the stated unit exceeded the "
            f"ceiling {ceiling:g} m³/h × {FLOW_CEILING_FACTOR:g})")
    if n_bad:
        log(f"[ledger] flow-unit canonicalisation: ✗ {n_bad} fluid edge(s) carry an "
            f"IMPLAUSIBLE flow under every unit reading — marked _flow_implausible "
            f"(the connection-sanity gate fails on these)")
    return (n_fix, n_bad)


def _service_of(mech):
    """Map an edge mechanism → the SERVICE it carries (power / signal / water / thermal
    / air). Mirrors build_universal_scene._edge_service; kept local so this module has
    no back-dependency on Blender."""
    m = str(mech or "").lower()
    if "electric" in m or m in ("ac_busbar", "dc_bus", "power", "ac_bus"):
        return "power"
    if m in ("signal", "data_link", "control_signal", "sensor_feedback", "modbus_tcp",
             "profibus", "ethernet", "fieldbus") or "signal" in m or "data" in m:
        return "signal"
    if "thermal" in m or "heat" in m or "steam" in m or "refriger" in m:
        return "thermal"
    # OXYGEN (or any oxidant gas-supply) is its OWN process service — the O₂ header that
    # feeds the oxygenation cones / DO valves / emergency-O₂ solenoids. It is NOT bulk
    # process WATER (so the water flow-through in+out rule must not drag an O₂ injector
    # into a "needs a water input" verdict) and NOT ventilation AIR (so the air-mover
    # closer must not treat the O₂ header as a blower duct). Folding it to its own
    # service keeps the dedupe key + the audits coherent. (RAS connectivity fix.)
    if ("oxygen" in m or m.startswith("o2") or m == "lox" or "ozone" in m):
        return "oxygen"
    if "air" in m or "vent" in m or "hvac" in m or "duct" in m or "gas" in m:
        return "air"
    if "assembly" in m or "mechanical" in m or "part_of" in m or "mount" in m:
        return "assembly"
    return "water"


# ── FLOW-DEMAND JOIN (2026-07-02, the v52 "every fluid edge required_value=null" fix) ──
# The contract's flow demands live as PER-PART quantities (fertigation_dosing_pump_
# throughput_m3_h = 45, gac_softener_throughput_m3_h = 14.5, …) but were never joined
# onto the edges — connection_sizing received flow=0 for every fluid line, sized
# everything at the DN15 minimum, and (since commit 1303f8535) the Line & velocity tab
# honestly reads UNVERIFIED/FAIL. finalize_ledger is the CHOKE POINT every edge flows
# through (the contract's authored topology AND every closer-minted _augmented edge), so
# the join here covers all Python authoring paths in one place.
#
# MATCH SEMANTICS mirror the landed Excel join (build-excel-export.py::_flow_qty_for_part,
# commit 1303f8535) + the distinguishing-token discipline of edm._equip_kw_from_quantities
# (commit f9dfc2918 — the blanket-match family has bitten 3×): (1) exact snake(endpoint) +
# flow-suffix key; (2) else a UNIQUE snake(endpoint)-prefixed flow-suffix candidate —
# never a guess between two, and a name made ONLY of generic tokens (pump/tank/filter/…)
# may never ride the prefix path (generic tokens never decide); NO bare-substring
# containment anywhere. Ambiguity → None.
#
# PRECEDENCE RULE (the governing endpoint): the DESTINATION's demand governs — a line is
# sized for what the consumer it feeds must receive (a DN-tap to a 14.5 m³/h softener
# carries the softener's demand, not the 90 m³/h loop). When the destination carries no
# flow quantity, the SOURCE's delivery rating governs (a pump's rated delivery IS the
# design flow of the line it drives — which is also how a recycle/return edge takes its
# loop's flow: the return pump that drives the loop names it). NEVER fabricate: no
# matching quantity on either endpoint → required_value stays None and the honest-
# UNVERIFIED path from 1303f8535 reports it.
_FLOW_QTY_SUFFIXES = ("_throughput_m3_h", "_flow_m3_h", "_demand_m3_h", "_capacity_m3_h",
                      "_throughput_m3_per_hr", "_flow_m3_per_hr", "_demand_m3_per_hr")

# Tokens that carry no identity — every pump/tank/filter shares them; a name made ONLY
# of these must never decide a prefix match (same discipline as _GENERIC_EQUIP_TOKENS in
# electrical_distribution_model.py).
_GENERIC_FLOW_TOKENS = {"pump", "tank", "vessel", "filter", "water", "system", "unit",
                        "skid", "motor", "line", "pipe", "main", "process", "supply"}


def _qty_num(v):
    """Numeric value of a contract quantity ({value:..} dict or bare scalar), else None."""
    if isinstance(v, dict):
        v = v.get("value")
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f


def _snake_name(name):
    return re.sub(r"[^a-z0-9]+", "_", str(name or "").lower()).strip("_")


def _flow_qty_for_part(name, quantities):
    """(quantity_key, flow_m3h) for an endpoint name, or None — see MATCH SEMANTICS above."""
    s = _snake_name(name)
    if not s or not quantities:
        return None
    # (1) exact snake-name + flow-suffix
    for suf in _FLOW_QTY_SUFFIXES:
        v = _qty_num(quantities.get(s + suf))
        if v is not None and v > 0:
            return (s + suf, v)
    # (2) a UNIQUE prefixed candidate — generic-only names are barred from this path
    toks = [t for t in s.split("_") if t]
    if toks and all(t in _GENERIC_FLOW_TOKENS for t in toks):
        return None
    cands = []
    for k in quantities:
        if not k.startswith(s + "_") or not any(k.endswith(x) for x in _FLOW_QTY_SUFFIXES):
            continue
        v = _qty_num(quantities.get(k))
        if v is not None and v > 0:
            cands.append((k, v))
    if len(cands) == 1:
        return cands[0]
    return None


def join_flow_demands(edges, quantities, log=print):
    """Join the contract's per-part flow demands onto the FLUID edges in place
    (required_value + required_unit + a _flow_join_basis provenance note). Only a fluid
    (water-service) edge with NO existing required_value and a flow_capacity (or absent)
    constraint_kind is touched — a hand-authored rating is never overwritten, and no edge
    is ever given a fabricated value. Returns the number of edges joined."""
    if not edges or not quantities:
        return 0
    joined = 0
    for e in edges:
        if not isinstance(e, dict):
            continue
        mech = str(e.get("mechanism") or "").lower()
        if not ("fluid" in mech or mech == "water"):
            continue    # fluid lines only (never an air/O₂/thermal/power/signal tie)
        ck = e.get("constraint_kind")
        if ck not in (None, "flow_capacity"):
            continue    # don't re-type an authored constraint
        if e.get("required_value") is not None:
            continue    # never overwrite an authored rating
        # destination's demand governs; else the source's delivery (see PRECEDENCE RULE)
        dst = _flow_qty_for_part(e.get("to_part"), quantities)
        hit, which = (dst, "destination demand") if dst else \
                     (_flow_qty_for_part(e.get("from_part"), quantities), "source delivery")
        if not hit:
            continue    # honest None — the UNVERIFIED path reports it
        key, flow = hit
        e["required_value"] = flow
        e["required_unit"] = "m3/h"
        if ck is None:
            e["constraint_kind"] = "flow_capacity"
        e["_flow_join_basis"] = f"contract qty {key} = {flow:g} m3/h ({which})"
        joined += 1
    if joined:
        log(f"[ledger] flow-demand join: {joined} fluid edge(s) now carry their contract "
            f"flow demand (required_value m3/h) — pipes size from true flows")
    return joined


def finalize_ledger(topology, parts, resolve_endpoint, log=print, quantities=None):
    """Return (final_topology, dropped). `final_topology` is the AUTHORITATIVE connection
    list — every edge endpoint-resolved to a real placed part, spurious ties removed,
    de-duplicated per (from, to, service). `dropped` is a list of
    (from, to, mechanism, reason) for transparency.

    When `quantities` (the contract quantities map) is given, every authored FLUID edge
    that carries no required_value gets the endpoint-matched contract flow demand joined
    on (join_flow_demands — the v52 required_value=null fix); with quantities=None the
    ledger is byte-identical to the pre-join behaviour.

    The three authority rules (universal, in priority order):
      1. ENDPOINT VALIDITY — an edge whose BOTH endpoints fail to resolve to a real part
         is a nothing-to-nothing pipe (the dangling route Tristan saw). The ledger must
         not author it. (A single abstract endpoint — a utility incomer / drain / sink —
         is kept: it legitimately joins the distribution spine or a collector; only when
         NEITHER end is a real part is the edge meaningless.)
      2. NO SPURIOUS DRY-ANCILLARY WATER/THERMAL TIE — a fluid/thermal edge between a dry
         material-handling ancillary and a tank is not a real process connection.
      3. DEDUPE per (from, to, service) — one physical line per directed pair + service
         (a recirc SUPPLY A→B and RETURN B→A are distinct and both kept)."""
    final = []
    dropped = []
    seen = set()
    for e in topology:
        frm = str(e.get("from_part") or e.get("from") or "").strip()
        to = str(e.get("to_part") or e.get("to") or "").strip()
        mech = str(e.get("mechanism") or "fluid_loop")
        svc = _service_of(mech)

        pa = resolve_endpoint(frm, parts) if frm else None
        pb = resolve_endpoint(to, parts) if to else None

        # 1) ENDPOINT VALIDITY — kill nothing-to-nothing.
        if pa is None and pb is None:
            dropped.append((frm or "∅", to or "∅", mech, "both-endpoints-unresolved"))
            continue
        # canonical endpoint names: a resolved part's name, else the (abstract) tag text.
        a_name = pa.name if pa is not None else frm
        b_name = pb.name if pb is not None else to
        # SELF-LOOP — compared on the NORMALISED name (case/punctuation-insensitive), so a
        # 'Cip Tank' → 'cip_tank' slug/alias pair is caught, not only the exact-string match
        # (v55 shipped a 'Cip Tank → Cip Tank' row on the Connection trace).
        if _norm_name(a_name) == _norm_name(b_name):
            dropped.append((a_name, b_name, mech, "self-loop"))
            continue

        # SERVICE-DOMAIN COMPATIBILITY — a fluid edge may not terminate on switching /
        # protection / control gear (and the gate checks the reverse: power into a pure
        # storage vessel). v55: 'Fresh Water Tank → Mains Incomer [water]'. Power-conversion
        # gear that takes liquid cooling (transformer/inverter/PCS/UPS/generator) is NOT in
        # the classifier, so a BESS coolant loop is untouched.
        if svc in _FLUID_SERVICES and (
                SWITCH_CONTROL_GEAR_RE.search(a_name) or SWITCH_CONTROL_GEAR_RE.search(b_name)):
            dropped.append((a_name, b_name, mech,
                            "service-domain mismatch (fluid line on electrical/control gear)"))
            continue

        # 2) NO SPURIOUS WATER/THERMAL TIE for parts that don't carry process water.
        if svc in ("water", "thermal"):
            both = f"{a_name} {b_name}"
            if _DRY_ANCILLARY_RE.search(both) and _TANK_RE.search(both):
                dropped.append((a_name, b_name, mech, "dry-ancillary water/thermal tie to tank"))
                continue
            # an AIR-MOVER (blower/fan) carries AIR, not water — its spurious orphan→TANK
            # water tie is dropped (its real tie is the air line the air-closer adds). Only
            # the tie to a TANK is dropped: a tie to another part (e.g. an inlet valve on its
            # line) is left so that part keeps its connection (narrow — don't orphan it).
            if (_AIR_MOVER_RE.search(a_name) or _AIR_MOVER_RE.search(b_name)) and _TANK_RE.search(both):
                dropped.append((a_name, b_name, mech, "air-mover water tie to tank (belongs on an air line)"))
                continue
            # a SUB-COMPONENT (filter screen/backwash, MBBR media) is PART OF a parent unit;
            # its water tie to a tank is spurious — it connects to its parent (assembly edge).
            if (_SUBCOMPONENT_RE.search(a_name) or _SUBCOMPONENT_RE.search(b_name)) and _TANK_RE.search(both):
                dropped.append((a_name, b_name, mech, "sub-component water tie to tank (belongs to its parent)"))
                continue
            # a SINK (drain / sludge / effluent / waste) DISCHARGES to disposal — it does NOT
            # feed the tank. An orphan→tank OUTPUT from a sink is spurious (its input comes
            # from the process, its output goes to the battery-limit disposal via the
            # boundary closer). Only the FROM-sink→TO-tank direction is dropped.
            if _FLUID_SINK_RE.search(a_name) and _TANK_RE.search(b_name):
                dropped.append((a_name, b_name, mech, "sink output to tank (a sink discharges to disposal)"))
                continue

        # 3) DEDUPE per directed pair + service.
        key = (a_name, b_name, svc)
        if key in seen:
            dropped.append((a_name, b_name, mech, "duplicate"))
            continue
        seen.add(key)

        e2 = dict(e)
        e2["from_part"] = a_name
        e2["to_part"] = b_name
        e2["_ledger_service"] = svc
        final.append(e2)

    # FLOW-DEMAND JOIN — after endpoint resolution (canonical part names match their
    # per-part contract quantities), covering contract + every closer-minted fluid edge.
    if quantities:
        join_flow_demands(final, quantities, log=log)
        # FLOW-UNIT CANONICALISATION — an authored/augmented rating whose stated unit puts
        # it orders of magnitude over the plant's own demand ceiling is a mis-stamped unit
        # (the v55 90 m³/h → '90 m³/s' → 324,000 m³/h phantom); re-stamp when the bare
        # magnitude fits the demand family, else mark _flow_implausible for the gate.
        canonicalise_flow_units(final, quantities, log=log)

    if dropped:
        from collections import Counter
        reasons = Counter(d[3] for d in dropped)
        log(f"[ledger] authority: {len(final)} connection(s) authored; "
            f"{len(dropped)} candidate(s) dropped ("
            + ", ".join(f"{n} {r}" for r, n in reasons.most_common()) + ")")
        for d in dropped:
            if d[3] in ("both-endpoints-unresolved", "dry-ancillary water/thermal tie to tank",
                        "service-domain mismatch (fluid line on electrical/control gear)",
                        "self-loop"):
                log(f"[ledger]   dropped {d[0]} -> {d[1]} [{d[2]}]: {d[3]}")
    return final, dropped


# A part with only ONE legitimate fluid direction — a fluid ORIGIN (raw-water intake /
# make-up / source) needs no inbound; a SINK (drain / effluent / product / discharge)
# needs no outbound. Exempted from the strict in+out rule below.
_FLUID_ORIGIN_RE = re.compile(
    r"incomer|intake|make[_ -]?up|makeup|\bsource\b|supply|borehole|\bwell\b|"
    r"seawater[_ -]?intake|raw[_ -]?water|feed[_ -]?water[_ -]?supply", re.I)
_FLUID_SINK_RE = re.compile(
    r"\bdrain\b|effluent|discharge|outfall|sludge|\bwaste\b|disposal|"
    r"atmosphere|\bvent\b|product[_ -]?out|harvest[_ -]?out|to[_ -]?sea|sump[_ -]?out|"
    r"bleed[_ -]?(?:/|\s)?drain|mortalit", re.I)

# INJECTOR — a part that ADDS a reagent / gas / heat to the loop. Its process input is
# the REAGENT (chemical / O₂ / heat), NOT a bulk-water inlet; it has ONE fluid tie (the
# injection point into the loop). Like an origin: exempt from the fluid-INPUT requirement.
_INJECTOR_RE = re.compile(
    r"dos(?:e|ing|er)|chemical|alkalin|bicarb|caustic|\bacid\b|nutrient|"
    r"(?:oxygen|o₂|o2)[_ -]?(?:supply|cone|inject|diffus|solenoid)|\bsolenoid\b|"
    r"\blox\b|liquid[_ -]?oxygen|ozone[_ -]?(?:supply|generat|inject)|"
    r"(?:co2|co₂)[_ -]?(?:supply|inject)|heat[_ -]?pump", re.I)

# SUB-COMPONENTS — a part that is INSIDE / PART OF a parent equipment item (a filter's
# screen / backwash, an MBBR's media / carrier, a vessel's internals / packing / fill, a
# pump's impeller). It does NOT carry its own bulk-fluid in+out — the PARENT does. So it
# is not a standalone process-fluid node and is exempt from the flow-through in+out rule.
_SUBCOMPONENT_RE = re.compile(
    r"\bscreen\b|backwash|\bmedia\b|carrier|\belement\b|cartridge|membrane|packing|"
    r"\bfill\b|internals|impeller|\brotor\b|standpipe|\bsparger\b|sight[_ -]?glass", re.I)

# AIR-MOVERS — a blower / fan / forced-draught unit moves AIR (aeration / ventilation /
# CO₂-stripping draught), not bulk process WATER. Its connection is an air duct, so it has
# no process-water in+out and is exempt from the water flow-through rule.
_AIR_MOVER_RE = re.compile(
    r"blower|\bfan\b|aeration|ventilat|exhaust[_ -]?fan|forced[_ -]?draught|"
    r"forced[_ -]?draft|\bFD\b|air[_ -]?handl", re.I)

# AIR CONSUMERS — process units that an air-mover (blower/fan) feeds with an AIR line: a
# CO₂ degasser / stripper (forced-draught air), a biofilter / MBBR / aeration basin
# (process air), an oxygenation cone / DAF / scrubber. The air-closer connects each
# air-mover to its nearest such consumer. Universal — class-agnostic process vocabulary.
_AIR_CONSUMER_RE = re.compile(
    r"degass|co2[_ -]?strip|co₂[_ -]?strip|stripp|biofilter|\bmbbr\b|moving[_ -]?bed|"
    r"trickl|aeration|aerobic|oxygenat|\bcone\b|scrubber|flotation|dissolved[_ -]?air|"
    r"\bDAF\b|packed[_ -]?column|degasser", re.I)

# OXYGEN SOURCES — the parts that SUPPLY oxidant gas: a LOX / liquid-oxygen vessel, an
# oxygen-supply / oxygenation skid, an O₂ header, a PSA / VSA oxygen generator, an ozone
# generator. The oxygen-closer feeds each O₂ consumer from the nearest of these. Universal
# — class-agnostic O₂-supply vocabulary, no per-class table.
_O2_SOURCE_RE = re.compile(
    r"oxygen\s*supply|\blox\b|liquid[_ -]?oxygen|o₂?\s*header|oxygen\s*header|"
    r"\bpsa\b|\bvsa\b|oxygen\s*generat|oxygenation\s*(?:system|skid|unit)|"
    r"ozone\s*(?:supply|generat)", re.I)

# OXYGEN CONSUMERS — a part that injects / regulates oxidant gas and therefore NEEDS an
# O₂-supply feed: an O₂/oxygen solenoid + diffuser, a dissolved-O₂ (DO) control valve, an
# oxygenation cone / Speece cone, an O₂ injection point. Keyed on the oxygen vocabulary so
# any O₂ actuator on any plant is covered; the SOURCES above are excluded by the closer.
_O2_CONSUMER_RE = re.compile(
    r"oxygen|\bo₂\b|\bo2\b|do[\s_-]*valve|dissolved[\s_-]*o(?:xygen)?|"
    r"speece|oxygenation\s*cone|\bo₂?\s*(?:diffus|inject|solenoid|cone)", re.I)

# A SENSOR / instrument that merely MEASURES O₂ (a dissolved-O₂ analyser, an O₂ header
# pressure transmitter, a LOX level alarm) is NOT supplied by the O₂ header — it samples /
# monitors. It must be excluded from the O₂-consumer set so the closer feeds only ACTUATORS
# (solenoid / diffuser / control valve / cone). Mirrors _required_services' sensor rule.
_O2_SENSOR_RE = re.compile(
    r"analy|transmit|\bsensor\b|\bprobe\b|\bgauge\b|detector|\bmeter\b|"
    r"\blevel\b|\balarm\b|monitor", re.I)

# INLINE TAP — a valve / meter / manifold / instrument that sits ON a line. It needs ≥1
# fluid tie (it is on the pipe) but not necessarily a distinct in AND out modelled as
# separate edges (the line passes through it). Requiring both over-flags an inline valve.
_INLINE_TAP_RE = re.compile(
    r"\bvalve\b|flow[_ -]?meter|\bmeter\b|manifold|distribution[_ -]?manifold|"
    r"pipework|\bheader\b|sight[_ -]?glass|sampl|strainer|\btee\b|\bspool\b", re.I)

# ABSTRACT BATTERY-LIMIT boundary nodes — the grid connection, the atmosphere, the sea/
# sewer. Intentional system edges with no physical part; a legitimate trace terminus, so
# they are NOT 'broken references' in the referential-integrity check.
_ABSTRACT_BOUNDARY_RE = re.compile(
    r"utility[_ -]?incomer|\bgrid\b|\bmains\b|battery[_ -]?limit|electrical[_ -]?supply|"
    r"power[_ -]?supply\b|incoming[_ -]?supply|"
    r"atmosphere|ambient|to[_ -]?sea|\bsewer\b|public[_ -]?network|off[_ -]?site", re.I)


def audit_completeness(parts, final_topology, required_services, log=print):
    """STRICT ledger-completeness audit (Tristan 2026-06-20: "the ledger was supposed to
    have a deterministic check so that all parts had to show an input AND output of all
    required connections, saying what they connect to and from — this should have flagged
    the issue").

    For EVERY part, for EVERY connection its role requires, the ledger must show the edge
    (naming the other end). A process (fluid) part missing an inbound OR an outbound, or
    any required power / signal with no edge, is a CONCERN — the ledger is incomplete and
    a part is 'not connecting'. This is the deterministic gate that catches a topology
    gap BEFORE it reaches the render (where the old code papered over it by inventing a
    pipe). Returns a list of {part, missing[], connects_from[], connects_to[],
    services_present[]}. Exempts recognised fluid origins / sinks (one legitimate
    direction) and dry material-handling ancillaries (no process-water need at all)."""
    fluid_in, fluid_out, svc_have = {}, {}, {}
    for e in final_topology:
        f, t = e.get("from_part"), e.get("to_part")
        svc = e.get("_ledger_service") or _service_of(e.get("mechanism"))
        if svc in ("water", "thermal"):
            if t:
                fluid_in.setdefault(t, []).append(f)
            if f:
                fluid_out.setdefault(f, []).append(t)
        for endp in (f, t):
            if endp:
                svc_have.setdefault(endp, set()).add(svc)

    concerns = []
    for p in parts:
        nm = getattr(p, "name", None) or (p.get("name") if isinstance(p, dict) else None)
        if not nm:
            continue
        mod = getattr(p, "module_id", "") or (p.get("module_id") if isinstance(p, dict) else "") or ""
        fn = getattr(p, "function", "") or (p.get("function") if isinstance(p, dict) else "") or ""
        try:
            req = set(required_services(nm, mod, fn) or set())
        except Exception:
            req = set()
        has = svc_have.get(nm, set())
        missing = []
        for s in req:
            if s == "water":
                continue   # fluid handled by the in/out rule below
            if s not in has:
                missing.append(s)
        if ("water" in req and not _DRY_ANCILLARY_RE.search(nm)
                and not _SUBCOMPONENT_RE.search(nm) and not _AIR_MOVER_RE.search(nm)):
            # (sub-components are part of a parent; air-movers carry air — neither is a
            #  standalone process-water node, so neither needs its own water in+out)
            has_in = nm in fluid_in
            has_out = nm in fluid_out
            # an origin OR an injector supplies the loop (output only, no bulk-water inlet);
            # a sink receives it (input only); an inline tap (valve/meter) sits ON the line.
            is_origin = bool(_FLUID_ORIGIN_RE.search(nm)) or bool(_INJECTOR_RE.search(nm))
            is_sink = bool(_FLUID_SINK_RE.search(nm))
            is_inline_tap = bool(_INLINE_TAP_RE.search(nm))
            if is_inline_tap:
                if not has_in and not has_out:
                    missing.append("fluid-connection")   # on a line, needs ≥1 tie
            else:
                # a FLOW-THROUGH unit (vessel / pump / filter / treatment) needs BOTH.
                if not has_in and not is_origin:
                    missing.append("fluid-input")
                if not has_out and not is_sink:
                    missing.append("fluid-output")
        if missing:
            concerns.append({
                "part": nm,
                "missing": missing,
                "connects_from": sorted(set(x for x in fluid_in.get(nm, []) if x))[:6],
                "connects_to": sorted(set(x for x in fluid_out.get(nm, []) if x))[:6],
                "services_present": sorted(has),
            })
    if concerns:
        log(f"[ledger] COMPLETENESS: ✗ {len(concerns)} part(s) missing a required connection "
            f"— the ledger is INCOMPLETE (each must show its input + output):")
        for c in concerns[:15]:
            log(f"[ledger]   ✗ {c['part']}: missing [{', '.join(c['missing'])}] "
                f"(present: {', '.join(c['services_present']) or 'none'})")
    else:
        log(f"[ledger] COMPLETENESS: ✓ all {len(parts)} parts show their required inputs + outputs")
    return concerns


def close_flow_directions(parts, topology, log=print):
    """UNIVERSAL direction-closer (the fix for "every part output-only" — RAS 15/80, SAF
    49/63). Give every FLOW-THROUGH part that has a fluid OUTPUT but no fluid INPUT a real
    input from its nearest PROCESS-UPSTREAM source — a part that ALREADY has a fluid
    output, earlier in process order (region_rank), same module preferred. This completes
    the graph with a SERIAL topology (predecessor → part → successor), NOT a star and NOT
    a guess: the input always comes from a genuine fluid source that exists, and a part
    with no resolvable upstream is LEFT for the gate to flag (never invented). Excludes
    injector/origin/sink/inline-tap/dry parts (correctly single-direction). Skips a pair
    that would merely REVERSE an existing edge (no 2-cycle). Pure + position-free."""
    by_name = {getattr(p, "name", None): p for p in parts if getattr(p, "name", None)}

    def _rank(nm):
        p = by_name.get(nm)
        v = getattr(p, "region_rank", None) if p is not None else None
        return v if isinstance(v, (int, float)) else 999

    def _mod(nm):
        p = by_name.get(nm)
        return (getattr(p, "module_id", "") if p is not None else "") or ""

    has_in, has_out, sources = set(), set(), set()
    fwd_pairs = set()
    for e in topology:
        if _service_of(e.get("mechanism")) not in ("water", "thermal"):
            continue
        f, t = e.get("from_part"), e.get("to_part")
        if f:
            has_out.add(f); sources.add(f)
        if t:
            has_in.add(t)
        if f and t:
            fwd_pairs.add((f, t))

    extra, seen = [], set()
    for p in parts:
        nm = getattr(p, "name", None)
        if not nm or nm in has_in:
            continue  # already has an input
        is_sink = bool(_FLUID_SINK_RE.search(nm))     # a sink RECEIVES — it needs an input
        is_flowthrough = nm in has_out                # a flow-through has an output, needs input
        # exempt parts that legitimately need NO input: an injector/origin (it supplies),
        # an inline tap (sits on the line), a dry ancillary, a sub-component (part of a
        # parent), an air-mover (carries air).
        if (_INJECTOR_RE.search(nm) or _FLUID_ORIGIN_RE.search(nm) or
                _INLINE_TAP_RE.search(nm) or _DRY_ANCILLARY_RE.search(nm) or
                _SUBCOMPONENT_RE.search(nm) or _AIR_MOVER_RE.search(nm)):
            continue
        if not (is_flowthrough or is_sink):
            continue  # neither flow-through nor sink → no input to close here
        r, m = _rank(nm), _mod(nm)
        cands = [s for s in sources if s != nm and _rank(s) < r and (nm, s) not in fwd_pairs]
        same = [s for s in cands if _mod(s) == m]
        pick = (max(same, key=lambda c: (_rank(c), c)) if same else (max(cands, key=lambda c: (_rank(c), c)) if cands else None))   # det tie-break (#86)
        if pick is None or (pick, nm) in seen:
            continue  # no genuine upstream → leave it for the gate (never guess)
        seen.add((pick, nm))
        extra.append({"from_part": pick, "to_part": nm, "mechanism": "fluid_loop",
                      "constraint_kind": "flow_capacity",
                      "material_context": "process-flow input (direction-closer: nearest upstream)",
                      "_augmented": True, "_direction_closed": True})
        has_in.add(nm)

    # OUTPUT pass (symmetric) — a flow-through part with an INPUT but no OUTPUT produces
    # but feeds nothing; connect it to its nearest DOWNSTREAM consumer (a part with an
    # input, higher region_rank). Closes storage/recycle/intermediate units. A sink
    # legitimately has no output and is skipped; never reverse an existing edge.
    consumers = sorted(has_in, key=lambda c: (_rank(c), c))   # (rank, name) total order → deterministic (#86)
    for p in parts:
        nm = getattr(p, "name", None)
        if not nm or nm in has_out or nm not in has_in:
            continue  # already feeds something, OR has no input (handled by the input pass)
        if (_FLUID_SINK_RE.search(nm) or _INJECTOR_RE.search(nm) or
                _INLINE_TAP_RE.search(nm) or _DRY_ANCILLARY_RE.search(nm) or
                _SUBCOMPONENT_RE.search(nm) or _AIR_MOVER_RE.search(nm) or
                _FLUID_ORIGIN_RE.search(nm)):
            continue  # legitimately no successor (a sink/terminus) or not a flow node
        r, m = _rank(nm), _mod(nm)
        cands = [c for c in consumers if c != nm and _rank(c) > r and (c, nm) not in fwd_pairs]
        same = [c for c in cands if _mod(c) == m]
        pick = (min(same, key=lambda c: (_rank(c), c)) if same else (min(cands, key=lambda c: (_rank(c), c)) if cands else None))   # det tie-break (#86)
        if pick is None or (nm, pick) in seen:
            continue
        seen.add((nm, pick))
        extra.append({"from_part": nm, "to_part": pick, "mechanism": "fluid_loop",
                      "constraint_kind": "flow_capacity",
                      "material_context": "process-flow output (direction-closer: nearest downstream)",
                      "_augmented": True, "_direction_closed": True})
        has_out.add(nm)

    if extra:
        n_in = sum(1 for e in extra if "input" in e["material_context"])
        log(f"[ledger] direction-closer: +{len(extra)} edge(s) ({n_in} input from upstream, "
            f"{len(extra) - n_in} output to downstream) — flow-through parts connected both ways")
    return extra


def close_air_directions(parts, topology, log=print):
    """Connect every AIR-MOVER (blower/fan) to the process unit it aerates by an AIR line —
    the physically-correct tie (a degasser's forced draught, an MBBR's/biofilter's process
    air, an oxygenation cone), NOT the spurious water tie to a tank the orphan connector
    gave it. Universal: feeds the nearest air-consumer in the same module, else the nearest
    by process order; if none, the air-mover is left. Pure + position-free."""
    by_name = {getattr(p, "name", None): p for p in parts if getattr(p, "name", None)}

    def _rank(nm):
        p = by_name.get(nm)
        v = getattr(p, "region_rank", None) if p is not None else None
        return v if isinstance(v, (int, float)) else 999

    def _mod(nm):
        p = by_name.get(nm)
        return (getattr(p, "module_id", "") if p is not None else "") or ""

    has_air = set()
    for e in topology:
        if _service_of(e.get("mechanism")) == "air":
            f = e.get("from_part")
            if f:
                has_air.add(f)
    consumers = [getattr(p, "name", None) for p in parts
                 if getattr(p, "name", None) and _AIR_CONSUMER_RE.search(p.name)
                 and not _AIR_MOVER_RE.search(p.name)]
    extra, seen = [], set()
    for p in parts:
        nm = getattr(p, "name", None)
        if not nm or not _AIR_MOVER_RE.search(nm) or nm in has_air:
            continue
        r, m = _rank(nm), _mod(nm)
        cands = [c for c in consumers if c != nm]
        pool = [c for c in cands if _mod(c) == m] or cands
        pick = min(pool, key=lambda c: (abs(_rank(c) - r), c)) if pool else None
        if pick is None or (nm, pick) in seen:
            continue
        seen.add((nm, pick))
        extra.append({"from_part": nm, "to_part": pick, "mechanism": "air",
                      "constraint_kind": "air_flow",
                      "material_context": "aeration / process-air line (air-mover -> consumer)",
                      "_augmented": True, "_air_closed": True})
    if extra:
        log(f"[ledger] air-closer: +{len(extra)} air line(s) — air-movers feed their aeration consumer")
    return extra


def close_oxygen_directions(parts, topology, log=print):
    """Connect every O₂-CONSUMING actuator (an O₂ solenoid + diffuser, a dissolved-O₂
    control valve, an oxygenation cone) that has NO process feed to its nearest O₂ SOURCE
    (a LOX vessel / oxygen-supply skid / O₂ header / PSA generator) by an OXYGEN line —
    the physically-correct supply (the emergency-O₂ solenoid IS fed by the O₂ header), NOT
    a guess. Universal: any plant with an O₂/oxidant-gas supply + O₂ actuators benefits; a
    plant with no O₂ parts gets an empty result (no-op). Mirrors close_air_directions.

    A consumer NEEDS an O₂ feed when it is an O₂ part that currently has NO PROCESS input
    (water OR oxygen — power/signal ties do NOT count as the process feed) in the topology.
    The O₂ SOURCES themselves are excluded (a source supplies, it is not fed). If no O₂
    source exists, the consumer is LEFT for the gate (never invent a source — same
    discipline as close_flow_directions). Pure + position-free + deterministic."""
    by_name = {getattr(p, "name", None): p for p in parts if getattr(p, "name", None)}

    def _rank(nm):
        p = by_name.get(nm)
        v = getattr(p, "region_rank", None) if p is not None else None
        return v if isinstance(v, (int, float)) else 999

    def _mod(nm):
        p = by_name.get(nm)
        return (getattr(p, "module_id", "") if p is not None else "") or ""

    # parts that ALREADY have a PROCESS input (water or oxygen) — power/signal don't count.
    has_proc_in = set()
    for e in topology:
        if _service_of(e.get("mechanism")) in ("water", "thermal", "oxygen"):
            t = e.get("to_part")
            if t:
                has_proc_in.add(t)

    sources = [getattr(p, "name", None) for p in parts
               if getattr(p, "name", None) and _O2_SOURCE_RE.search(p.name)]
    if not sources:
        return []   # no O₂ supply on this plant → nothing to close (never invent one)

    extra, seen = [], set()
    for p in parts:
        nm = getattr(p, "name", None)
        if not nm or nm in has_proc_in:
            continue  # already has a process feed
        # an O₂ CONSUMER (actuator) that is not itself an O₂ SOURCE and not a mere O₂
        # SENSOR (an analyser/transmitter samples the line, it is not supplied by it).
        if (not _O2_CONSUMER_RE.search(nm) or _O2_SOURCE_RE.search(nm)
                or _O2_SENSOR_RE.search(nm)):
            continue
        r, m = _rank(nm), _mod(nm)
        cands = [s for s in sources if s != nm]
        pool = [s for s in cands if _mod(s) == m] or cands   # same module preferred
        pick = min(pool, key=lambda s: (abs(_rank(s) - r), s)) if pool else None
        if pick is None or (pick, nm) in seen:
            continue
        seen.add((pick, nm))
        extra.append({"from_part": pick, "to_part": nm, "mechanism": "oxygen",
                      "constraint_kind": "flow_capacity",
                      "material_context": "O₂ supply (direction-closer: oxygen header → consumer)",
                      "_augmented": True, "_direction_closed": True})
        has_proc_in.add(nm)
    if extra:
        log(f"[ledger] oxygen-closer: +{len(extra)} O₂ supply line(s) — O₂ actuators fed "
            f"from their oxygen header/source")
    return extra


_POWER_HUB_RE = re.compile(
    r"distribution\s*busbar|\bbusbar\b|switchgear|motor[\s_-]*control|\bmcc\b|"
    r"\blv\s*(?:board|panel|switchboard)\b|power\s*distribution|\bpdu\b|\bmsb\b|"
    r"main\s*switchboard|distribution\s*(?:board|panel)", re.I)
# The plant CONTROL hub every measuring instrument reports to (signal-closer target).
_CONTROL_HUB_RE = re.compile(
    r"scada|\bplc\b|\bdcs\b|\brtu\b|control\s*(?:system|panel|cabinet)|plant\s*control|"
    r"instrument\s*panel|digital\s*control|main\s*controller|control\s*\+\s*instrument", re.I)
# A measuring INSTRUMENT — reports a signal to the control system (transmitter / analyser /
# sensor / meter / switch / detector). The completeness audit's n_instrument set.
_INSTRUMENT_SIGNAL_RE = re.compile(
    r"transmitter|analy[sz]er|\bsensor\b|\bprobe\b|flow\s*meter|\bmeter\b|"
    r"\bgauge\b|detector|monitor\b|pressure\s*switch|level\s*switch|\bindicator\b", re.I)


def close_power_directions(parts, topology, required_services, log=print):
    """Give every part that REQUIRES power but has no incoming power edge a feed from the
    plant's power-distribution hub — the deterministic close of the completeness audit's
    'missing [power]' concern (Tristan 2026-06-20: a Degassing Blower with no power feed
    left the ledger incomplete). Universal: the required-power set comes from the SAME
    required_services() the audit uses, so the closer fills EXACTLY the gaps the audit
    flags — any powered orphan (blower / pump / motor / UV / heater / actuator), not a
    hand list. Hub = the part matching _POWER_HUB_RE (busbar / switchgear / MCC / LV board),
    else the first part whose module is a power module. Pure + position-free; no-op when no
    hub exists or nothing needs power."""
    by_name = {getattr(p, "name", None): p for p in parts if getattr(p, "name", None)}
    # parts that ALREADY have an incoming power edge
    has_power = set()
    for e in topology:
        svc = e.get("_ledger_service") or _service_of(e.get("mechanism"))
        if svc == "power" and e.get("to_part"):
            has_power.add(e.get("to_part"))
    # the power-distribution hub (the source of every feed)
    hub = next((nm for nm in by_name if _POWER_HUB_RE.search(nm)), None)
    if hub is None:
        for p in parts:
            nm = getattr(p, "name", None)
            if nm and "power" in str(getattr(p, "module_id", "") or "").lower():
                hub = nm
                break
    if hub is None:
        return []
    extra, seen = [], set()
    for p in parts:
        nm = getattr(p, "name", None)
        if not nm or nm == hub or nm in has_power or _SUBCOMPONENT_RE.search(nm):
            continue
        mod = getattr(p, "module_id", "") or ""
        fn = getattr(p, "function", "") or ""
        try:
            req = set(required_services(nm, mod, fn) or set())
        except Exception:
            req = set()
        if "power" not in req or (hub, nm) in seen:
            continue
        seen.add((hub, nm))
        extra.append({"from_part": hub, "to_part": nm, "mechanism": "electrical_bus",
                      "constraint_kind": "power_feed", "_ledger_service": "power",
                      "material_context": "power feed (distribution hub -> powered part)",
                      "_augmented": True, "_power_closed": True})
    if extra:
        log(f"[ledger] power-closer: +{len(extra)} power feed(s) from {hub!r} "
            f"— every powered part now shows its supply")
    return extra


def close_instrument_signals(parts, topology, log=print):
    """UNIVERSAL signal-closer (2026-07-01): every measuring INSTRUMENT (sensor / transmitter /
    analyser / meter / switch) must report a signal to the control system — else it is an ORPHAN
    the completeness audit flags "not wired to what it measures or to the control system"
    (parts_ledger n_instrument_associated < n_instrument_total → the Instruments-associated
    coverage invariant fails, capping ⚠Checks). This is the exact instrument analogue of the
    power-closer: an instrument with NO edge at all gets a signal association to the plant's
    control hub (SCADA / PLC / control panel). Deterministic + position-free; keyed on the
    instrument + control-hub NAME, no class table. No-op when there is no instrument or hub."""
    by_name = {getattr(p, "name", None): p for p in parts if getattr(p, "name", None)}
    # parts that ALREADY have ANY edge (any service) — the audit's has_any: an inline-tap
    # instrument already on a fluid line is associated, so we only close TRUE orphans.
    connected = set()
    for e in topology:
        for k in ("from_part", "to_part"):
            if e.get(k):
                connected.add(e.get(k))
    hub = next((nm for nm in by_name if _CONTROL_HUB_RE.search(nm)), None)
    if hub is None:
        return []
    extra, seen = [], set()
    for p in parts:
        nm = getattr(p, "name", None)
        if not nm or nm == hub or nm in connected:
            continue
        if not _INSTRUMENT_SIGNAL_RE.search(nm) or _SUBCOMPONENT_RE.search(nm):
            continue
        if (nm, hub) in seen:
            continue
        seen.add((nm, hub))
        extra.append({"from_part": nm, "to_part": hub, "mechanism": "signal",
                      "constraint_kind": "signal_association", "_ledger_service": "signal",
                      "material_context": "instrument signal (measurement -> control system)",
                      "_augmented": True, "_signal_closed": True})
    if extra:
        log(f"[ledger] signal-closer: +{len(extra)} instrument signal(s) to {hub!r} "
            f"— every instrument now reports to the control system")
    return extra


def close_subcomponents(parts, topology, log=print):
    """Connect every SUB-COMPONENT (a filter screen/backwash, MBBR media/carrier, vessel
    internals) to its PARENT equipment by an assembly edge — it is PART OF that unit, not a
    standalone process node, so it must show its parent, not a spurious pipe to a tank.
    Universal: the parent is the non-sub-component part sharing the most NAME tokens (e.g.
    'Drum Filter Screen' -> 'Drum Filter'; 'Biofilm Carrier Media (MBBR)' -> the MBBR
    biofilter). If no parent shares a token, the sub-component is left. Pure."""
    def _toks(s):
        return {t for t in re.split(r"[^a-z0-9]+", str(s).lower())
                if len(t) > 2 and t not in ("the", "and", "system", "unit", "for", "with", "ras")}
    cand_toks = {getattr(p, "name", None): _toks(getattr(p, "name", ""))
                 for p in parts
                 if getattr(p, "name", None) and not _SUBCOMPONENT_RE.search(p.name)}
    extra, seen = [], set()
    for p in parts:
        nm = getattr(p, "name", None)
        if not nm or not _SUBCOMPONENT_RE.search(nm):
            continue
        nt = _toks(nm)
        best, best_ov = None, 0
        for c, ct in cand_toks.items():
            if c == nm:
                continue
            ov = len(nt & ct)
            if ov > best_ov:
                best, best_ov = c, ov
        if best is None or best_ov < 1 or (best, nm) in seen:
            continue
        seen.add((best, nm))
        extra.append({"from_part": best, "to_part": nm, "mechanism": "assembly",
                      "constraint_kind": "mechanical_assembly",
                      "material_context": "sub-component of parent (assembly: part-of)",
                      "_augmented": True, "_assembly_closed": True})
    if extra:
        log(f"[ledger] sub-component closer: +{len(extra)} assembly edge(s) — sub-parts tied to their parent")
    return extra


_BL_FEED = "Plant feed — battery limit"
_BL_DISPOSAL = "Effluent / disposal — battery limit"
_BL_EXPORT = "Product export — battery limit"


def close_boundaries(parts, topology, log=print):
    """Final boundary connector — make EVERY real part fully connected after the in-plant
    closers. A SINK still missing an input is fed from its nearest in-plant PRODUCER (any
    rank) and discharges to the battery-limit DISPOSAL; a FEED-stage unit with no in-plant
    upstream is fed from the battery-limit PLANT FEED; a product / storage unit with no
    downstream discharges to the battery-limit EXPORT. The battery-limit nodes are abstract
    system boundaries (the referential-integrity check exempts them, via 'battery limit').
    A sink's spurious output-to-tank is NOT counted as a real output here (finalize drops
    it), so the sink correctly gets a disposal output. Pure + position-free."""
    by_name = {getattr(p, "name", None): p for p in parts if getattr(p, "name", None)}

    def _rank(nm):
        p = by_name.get(nm)
        v = getattr(p, "region_rank", None) if p is not None else None
        return v if isinstance(v, (int, float)) else 999

    def _mod(nm):
        p = by_name.get(nm)
        return (getattr(p, "module_id", "") if p is not None else "") or ""

    has_in, has_out, sources, fwd = set(), set(), set(), set()
    for e in topology:
        if _service_of(e.get("mechanism")) not in ("water", "thermal"):
            continue
        f, t = e.get("from_part"), e.get("to_part")
        if t:
            has_in.add(t)
        # a sink's output to a tank is spurious — don't count it as a real output/source.
        if f and not (_FLUID_SINK_RE.search(f) and t and _TANK_RE.search(t)):
            has_out.add(f); sources.add(f)
        if f and t:
            fwd.add((f, t))

    def _exempt(nm):
        return bool(_INJECTOR_RE.search(nm) or _INLINE_TAP_RE.search(nm) or
                    _DRY_ANCILLARY_RE.search(nm) or _SUBCOMPONENT_RE.search(nm) or
                    _AIR_MOVER_RE.search(nm) or _FLUID_ORIGIN_RE.search(nm))

    extra, seen = [], set()

    def _add(a, b, ctx):
        if a == b or (a, b) in seen:
            return
        seen.add((a, b))
        extra.append({"from_part": a, "to_part": b, "mechanism": "fluid_loop",
                      "constraint_kind": "flow_capacity", "material_context": ctx,
                      "_augmented": True, "_boundary": True})

    for p in parts:
        nm = getattr(p, "name", None)
        if not nm or _exempt(nm):
            continue
        is_sink = bool(_FLUID_SINK_RE.search(nm))
        r, m = _rank(nm), _mod(nm)
        # INPUT — a sink or flow-through with no input: from its nearest in-plant producer,
        # else the battery-limit plant feed.
        if nm not in has_in and (is_sink or nm in has_out):
            cands = [s for s in sources if s != nm and (nm, s) not in fwd]
            pool = [s for s in cands if _mod(s) == m] or cands
            pick = min(pool, key=lambda s: (abs(_rank(s) - r), s)) if pool else _BL_FEED
            _add(pick, nm, "process input (boundary closer: nearest producer)"
                 if pick != _BL_FEED else "plant feed (battery limit)")
            has_in.add(nm)
        # OUTPUT — a sink discharges to disposal; a flow-through with no downstream exports.
        if nm not in has_out and (is_sink or nm in has_in):
            tgt = _BL_DISPOSAL if is_sink else _BL_EXPORT
            _add(nm, tgt, "discharge to disposal (battery limit)" if is_sink
                 else "product export (battery limit)")
            has_out.add(nm)
    if extra:
        log(f"[ledger] boundary closer: +{len(extra)} edge(s) — sinks fed from their producer "
            f"+ discharged to disposal; feed/product stages tied to the battery limit")
    return extra


def close_residual_completeness(parts, topology, required_services, log=print):
    """FINAL self-healing net (Tristan 2026-06-24: "all parts have a confirmed connector
    point for things going in and out and ALL connector points are connected"). Whatever
    audit_completeness would STILL flag after every in-plant closer + the boundary closer
    is terminated here, so the ledger is PROVABLY complete — every part shows each required
    input + output. It is driven by the SAME audit_completeness it satisfies, so it cannot
    miss a gap it leaves (the two stay in lock-step). For a missing fluid direction it
    prefers the nearest in-plant partner (a real producer upstream / consumer downstream,
    same module preferred); if none exists the stream genuinely crosses the plant boundary,
    so it ties to the abstract battery-limit feed/export node. A missing SIGNAL ties to the
    plant control hub (a PLC / SCADA / DCS part) if present, else a control battery-limit;
    a missing POWER feed comes from the distribution hub, else a utility battery-limit.
    Pure + position-free; universal (no per-class table). Run AFTER close_boundaries."""
    concerns = audit_completeness(parts, topology, required_services, log=lambda *a: None)
    if not concerns:
        return []
    by_name = {getattr(p, "name", None): p for p in parts if getattr(p, "name", None)}

    def _rank(nm):
        p = by_name.get(nm)
        v = getattr(p, "region_rank", None) if p is not None else None
        return v if isinstance(v, (int, float)) else 999

    def _mod(nm):
        p = by_name.get(nm)
        return (getattr(p, "module_id", "") if p is not None else "") or ""

    sources, consumers = set(), set()
    fwd_fluid = set()          # (from,to) of FLUID edges — for 2-cycle avoidance in fluid
    existing_svc = set()       # (from,to,svc) of ALL edges — exact-duplicate avoidance
    ctrl_hub = dist_hub = None
    _CTRL_RE = re.compile(r"\bPLC\b|\bSCADA\b|\bDCS\b|control system|plant control|control hub", re.I)
    _DIST_RE = re.compile(r"busbar|distribution board|switchboard|\bMCC\b|switchgear|main board", re.I)
    for e in topology:
        svc = e.get("_ledger_service") or _service_of(e.get("mechanism"))
        f, t = e.get("from_part"), e.get("to_part")
        if svc in ("water", "thermal"):
            if f:
                sources.add(f)
            if t:
                consumers.add(t)
            if f and t:
                fwd_fluid.add((f, t))
        if f and t:
            existing_svc.add((f, t, svc))
    for p in parts:
        nm = getattr(p, "name", None)
        if not nm:
            continue
        if ctrl_hub is None and _CTRL_RE.search(nm):
            ctrl_hub = nm
        if dist_hub is None and _DIST_RE.search(nm):
            dist_hub = nm
    _BL_CTRL = "Plant control system — battery limit"
    _BL_POWER = "Power distribution — battery limit"

    extra, seen = [], set()

    def _add(a, b, svc, ctx, mech="fluid_loop"):
        # service-aware dedup: a SIGNAL tie may legitimately PARALLEL an existing power
        # edge between the same pair (an MCC both takes power FROM and reports status TO
        # the same control hub), so dedup on (a,b,svc) not (a,b). The 2-cycle guard only
        # applies to FLUID (a feed + a return between two vessels is a tangle; a signal
        # back to a controller that powers the part is normal).
        if not a or not b or a == b or (a, b, svc) in seen or (a, b, svc) in existing_svc:
            return
        if svc in ("water", "thermal") and ((a, b) in fwd_fluid or (b, a) in fwd_fluid):
            return
        seen.add((a, b, svc))
        extra.append({"from_part": a, "to_part": b, "mechanism": mech,
                      "constraint_kind": "flow_capacity" if svc in ("water", "thermal") else "current_rating",
                      "material_context": ctx, "_augmented": True, "_residual_closed": True,
                      "_ledger_service": svc})

    for c in concerns:
        nm = c["part"]
        r, m = _rank(nm), _mod(nm)
        for miss in c["missing"]:
            if miss == "fluid-input":
                cands = [s for s in sources if s != nm and (nm, s) not in fwd_fluid]
                pool = [s for s in cands if _mod(s) == m] or cands
                pick = min(pool, key=lambda s: (abs(_rank(s) - r), s)) if pool else _BL_FEED
                _add(pick, nm, "water",
                     "process input (residual closer: nearest producer)" if pick != _BL_FEED
                     else "plant feed (battery limit)")
            elif miss in ("fluid-output", "fluid-connection"):
                cands = [s for s in consumers if s != nm and (s, nm) not in fwd_fluid]
                pool = [s for s in cands if _mod(s) == m] or cands
                pick = min(pool, key=lambda s: (abs(_rank(s) - r), s)) if pool else _BL_EXPORT
                _add(nm, pick, "water",
                     "process output (residual closer: nearest consumer)" if pick != _BL_EXPORT
                     else "product / recycle export (battery limit)")
            elif miss == "signal":
                _add(nm, ctrl_hub or _BL_CTRL, "signal",
                     "instrument / status signal (residual closer)", mech="signal")
            elif miss == "power":
                _add(dist_hub or _BL_POWER, nm, "power",
                     "LV power feed (residual closer)", mech="electrical_bus")
    if extra:
        log(f"[ledger] residual closer: +{len(extra)} edge(s) — every remaining required "
            f"connection terminated (nearest in-plant partner, else battery limit)")
    return extra


def build_adjacency(final_topology):
    """Per-part connection trace (Tristan 2026-06-20: "if line 1 connects to line 3, line
    3 should say its input is from line 1 — in Excel we should trace whole systems this
    way"). Returns {part_name: {"inputs": [{from, mechanism, service}],
    "outputs": [{to, mechanism, service}]}}. Built FROM the authored edges, so it is
    bidirectionally consistent BY CONSTRUCTION: every edge A→B puts B in A.outputs AND A
    in B.inputs, using the SAME (resolved, normalised) part names on both sides — you can
    follow any part to the parts it feeds, and each of those names back to it."""
    adj = {}

    def _slot(name):
        return adj.setdefault(name, {"inputs": [], "outputs": []})

    for e in final_topology:
        f, t = e.get("from_part"), e.get("to_part")
        if not f or not t:
            continue
        mech = e.get("mechanism")
        svc = e.get("_ledger_service") or _service_of(mech)
        _slot(f)["outputs"].append({"to": t, "mechanism": mech, "service": svc})
        _slot(t)["inputs"].append({"from": f, "mechanism": mech, "service": svc})
    return adj


def audit_referential_integrity(final_topology, part_names, log=print):
    """Deterministic REFERENTIAL-INTEGRITY check (Tristan 2026-06-20): every connection
    must name a part that actually EXISTS, with the EXACT name, on both ends — so the
    graph is traceable with no broken references. Returns a list of violations
    {edge, end, name, reason}. By construction finalize_ledger normalises both endpoints
    to a resolved part's own name, so a clean ledger has zero violations; this verifies
    that invariant explicitly (a name not in the parts set = a broken reference the Excel
    trace could not follow)."""
    names = set(part_names or [])
    violations = []
    for e in final_topology:
        for end_key in ("from_part", "to_part"):
            nm = e.get(end_key)
            if not nm:
                violations.append({"edge": f"{e.get('from_part')}→{e.get('to_part')}",
                                   "end": end_key, "name": nm, "reason": "empty endpoint"})
            elif names and nm not in names and not _ABSTRACT_BOUNDARY_RE.search(nm):
                # an abstract BATTERY-LIMIT boundary (utility incomer / grid / atmosphere /
                # drain-to-sea) is an intentional system edge, not a physical part — a
                # legitimate trace terminus, not a broken reference.
                violations.append({"edge": f"{e.get('from_part')}→{e.get('to_part')}",
                                   "end": end_key, "name": nm,
                                   "reason": "endpoint name is not an authored part (broken reference)"})
    if violations:
        log(f"[ledger] REFERENTIAL INTEGRITY: ✗ {len(violations)} broken reference(s) — "
            f"a connection names a part that does not exist:")
        for v in violations[:10]:
            log(f"[ledger]   ✗ {v['edge']} [{v['end']}={v['name']!r}]: {v['reason']}")
    else:
        log(f"[ledger] REFERENTIAL INTEGRITY: ✓ every connection names a real part on both "
            f"ends (graph is fully traceable)")
    return violations


def ledger_rows(final_topology):
    """A flat, human-/BoM-readable view of the authored ledger: one row per connection
    stating from → to, service, and (when present) the rating it must carry. The SIZE is
    filled in by the sizer during routing; this is the 'which part connects to what with
    what' record the ledger owns."""
    rows = []
    for e in final_topology:
        rows.append({
            "from_part": e.get("from_part"),
            "to_part": e.get("to_part"),
            "mechanism": e.get("mechanism"),
            "service": e.get("_ledger_service") or _service_of(e.get("mechanism")),
            "constraint_kind": e.get("constraint_kind"),
            "required_value": e.get("required_value"),
            "required_unit": e.get("required_unit"),
            # provenance of a JOINED flow demand (join_flow_demands) — None for an
            # authored rating, so the row discloses where its number came from.
            "required_basis": e.get("_flow_join_basis"),
            "material_context": e.get("material_context"),
            "source": "contract" if not e.get("_augmented") else "completion",
        })
        # unit-canonicalisation provenance — only present when the ledger acted, so the
        # row shape (and every prior run's artifact) is otherwise byte-identical.
        if e.get("_unit_corrected_basis"):
            rows[-1]["unit_corrected"] = e.get("_unit_corrected_basis")
        if e.get("_flow_implausible"):
            rows[-1]["flow_implausible"] = e.get("_flow_implausible")
    return rows


# --------------------------------------------------------------------------- selftest
def _selftest():
    class _P:
        def __init__(self, name): self.name = name
    parts = [_P("Rearing Tank"), _P("Rotary Drum Filter"), _P("Feed Storage System"),
             _P("Recirc Pump"), _P("Mortality Handling System")]

    def resolve(name, parts):
        n = re.sub(r"[^a-z0-9]", "", str(name).lower())
        if not n or "abstract" in n or n in ("none", "bus", "supply"):
            return None
        for p in parts:
            pn = re.sub(r"[^a-z0-9]", "", p.name.lower())
            if pn and (pn in n or n in pn or _tok(pn) & _tok(n)):
                return p
        return None

    def _tok(s):
        return {s[i:i + 4] for i in range(max(0, len(s) - 3))}

    topo = [
        {"from_part": "Rearing Tank", "to_part": "Rotary Drum Filter", "mechanism": "fluid_loop"},
        {"from_part": "Recirc Pump", "to_part": "Rearing Tank", "mechanism": "fluid_loop"},
        {"from_part": None, "to_part": None, "mechanism": "fluid_loop"},                    # dangling
        {"from_part": "Feed Storage System", "to_part": "Rearing Tank", "mechanism": "fluid_loop"},  # dry tie
        {"from_part": "Mortality Handling System", "to_part": "Rearing Tank", "mechanism": "fluid_loop"},  # dry tie
        {"from_part": "Rearing Tank", "to_part": "Rotary Drum Filter", "mechanism": "fluid_loop"},  # dup
    ]
    final, dropped = finalize_ledger(topo, parts, resolve, log=lambda *a: None)
    names = {(e["from_part"], e["to_part"]) for e in final}
    assert ("Rearing Tank", "Rotary Drum Filter") in names, "kept real loop edge"
    assert ("Recirc Pump", "Rearing Tank") in names, "kept pump return"
    assert not any(e["from_part"] is None for e in final), "no dangling survived"
    assert not any("Feed Storage" in (e["from_part"] or "") for e in final), "dry feed tie dropped"
    assert not any("Mortality" in (e["from_part"] or "") for e in final), "dry mortality tie dropped"
    assert len(final) == 2, f"expected 2 authored edges, got {len(final)}"
    drop_reasons = {d[3] for d in dropped}
    assert "both-endpoints-unresolved" in drop_reasons
    assert "dry-ancillary water/thermal tie to tank" in drop_reasons
    assert "duplicate" in drop_reasons

    # audit_completeness: the pump has an output (→ tank) but NO input → flagged.
    class _PP:
        def __init__(self, name, mod="mass_fluid_transport_process"):
            self.name, self.module_id, self.function = name, mod, ""
    aparts = [_PP("Rearing Tank"), _PP("Rotary Drum Filter"), _PP("Recirc Pump"),
              _PP("Make-up Water System")]

    def req_svc(name, mod, fn):
        return {"water"}   # all are process-fluid parts here

    concerns = audit_completeness(aparts, final, req_svc, log=lambda *a: None)
    by = {c["part"]: c["missing"] for c in concerns}
    assert "Recirc Pump" in by and "fluid-input" in by["Recirc Pump"], \
        f"pump w/ output-only must flag missing input; got {by}"
    # make-up is a fluid ORIGIN → exempt from missing-INPUT (the hyphen fix); it may
    # still be flagged for missing-OUTPUT if it supplies nothing (correct).
    assert "fluid-input" not in by.get("Make-up Water System", []), \
        "make-up origin must be exempt from missing-input (hyphen regex)"

    # close_flow_directions: a flow-through part with an output but no input gets fed from
    # its nearest process-upstream source (lower region_rank), never guessed.
    class _PR:
        def __init__(self, name, rank, mod="m"):
            self.name, self.region_rank, self.module_id, self.function = name, rank, mod, ""
    cparts = [_PR("Drum Filter", 0), _PR("Biofilter", 1), _PR("Degasser", 2)]
    ctopo = [{"from_part": "Drum Filter", "to_part": "Biofilter", "mechanism": "fluid_loop"},
             {"from_part": "Biofilter", "to_part": "Sump", "mechanism": "fluid_loop"},
             {"from_part": "Degasser", "to_part": "Sump", "mechanism": "fluid_loop"}]  # Degasser output-only
    closed = close_flow_directions(cparts, ctopo, log=lambda *a: None)
    assert any(e["to_part"] == "Degasser" and e["from_part"] in ("Biofilter", "Drum Filter")
               for e in closed), f"degasser (output-only) must be fed from upstream; got {closed}"

    # close_oxygen_directions: an O₂ consumer (solenoid+diffuser / DO valve) with NO
    # process feed (only a power tie) is supplied from its nearest O₂ SOURCE by an oxygen
    # line; the source itself is not fed; a flow-through with NO O₂ vocabulary is untouched;
    # and with NO source present the consumer is left (never invented). Pure + position-free.
    oparts = [_PR("Oxygen Supply (LOX) System", 0), _PR("Emergency O₂ Solenoid + Diffuser", 1),
              _PR("Dissolved-O₂ Control Valve", 1), _PR("Recirc Pump", 2)]
    otopo = [{"from_part": "Distribution Busbar", "to_part": "Dissolved-O₂ Control Valve",
              "mechanism": "electrical_bus"}]   # the valve has only a POWER tie, no process feed
    oclosed = close_oxygen_directions(oparts, otopo, log=lambda *a: None)
    o_to = {(e["from_part"], e["to_part"]) for e in oclosed}
    assert ("Oxygen Supply (LOX) System", "Emergency O₂ Solenoid + Diffuser") in o_to, \
        f"emergency-O₂ solenoid must be fed from the LOX source; got {oclosed}"
    assert ("Oxygen Supply (LOX) System", "Dissolved-O₂ Control Valve") in o_to, \
        f"DO control valve (power-only) must get an O₂ supply input; got {oclosed}"
    assert all(e["mechanism"] == "oxygen" for e in oclosed), "O₂ closer edges carry the oxygen mechanism"
    assert not any(e["to_part"] == "Oxygen Supply (LOX) System" for e in oclosed), \
        "an O₂ SOURCE is never fed by the oxygen closer"
    assert not any(e["to_part"] == "Recirc Pump" for e in oclosed), \
        "a non-O₂ flow-through must not be touched by the oxygen closer"
    # no O₂ source present → no-op (never invent a source), same discipline as flow-closer
    assert close_oxygen_directions([_PR("Emergency O₂ Solenoid + Diffuser", 1)], [],
                                   log=lambda *a: None) == [], \
        "with no O₂ source the consumer is left for the gate (no invented source)"

    # close_residual_completeness (2026-06-24): the FINAL self-healing net. (a) a flow-
    # through part the prior closers left output-less is terminated (nearest consumer, else
    # battery-limit export) so audit_completeness → 0; (b) a SIGNAL tie may PARALLEL an
    # existing power edge between the same pair (service-aware dedup) — an MCC powered FROM
    # the control hub still reports status TO it.
    rparts = [_PR("Belt Filter", 2), _PR("Carbonation Reactor", 1)]
    rtopo = [{"from_part": "Carbonation Reactor", "to_part": "Belt Filter", "mechanism": "fluid_loop"}]
    rres = close_residual_completeness(rparts, rtopo, lambda n, m, f: {"water"}, log=lambda *a: None)
    assert any(e["from_part"] == "Belt Filter" for e in rres), \
        "residual closer gives an output-less flow-through part an output (nearest consumer / boundary)"
    # service-aware dedup: a power edge A→B must NOT block a signal edge A→B.
    class _PS:
        def __init__(self, name, mod=""):
            self.name, self.module_id, self.function, self.region_rank = name, mod, "", 1
    sparts = [_PS("Motor Control Centre"), _PS("Plant PLC controller")]
    stopo = [{"from_part": "Motor Control Centre", "to_part": "Plant PLC controller",
              "mechanism": "electrical_bus"}]
    sres = close_residual_completeness(sparts, stopo,
                                       lambda n, m, f: {"signal"} if "Centre" in n else set(),
                                       log=lambda *a: None)
    assert any(e["from_part"] == "Motor Control Centre" and e["mechanism"] == "signal" for e in sres), \
        "a signal tie parallels an existing power edge between the same pair (service-aware dedup)"

    # ── FLOW-DEMAND JOIN (the v52 required_value=null fix) ──────────────────────
    q = {"fertigation_dosing_pump_throughput_m3_h": {"value": 45},
         "gac_softener_throughput_m3_h": 14.5,
         "drain_transfer_pump_throughput_m3_h": 45,
         # TWO keys share the 'storage_tank' prefix → ambiguous, must never decide:
         "storage_tank_a_flow_m3_h": 10, "storage_tank_b_flow_m3_h": 20}
    jt = [
        # destination demand governs (dest 14.5 beats source 45):
        {"from_part": "Fertigation Dosing Pump", "to_part": "Gac Softener",
         "mechanism": "fluid_loop", "constraint_kind": "flow_capacity"},
        # destination has no qty → source delivery governs (the recycle/return case):
        {"from_part": "Drain Transfer Pump", "to_part": "Fresh Water Tank",
         "mechanism": "fluid_loop", "constraint_kind": "flow_capacity"},
        # NO-FABRICATION counter-case: neither endpoint has a flow qty → stays None:
        {"from_part": "Grp Membrane Housings", "to_part": "Uf Module Bank",
         "mechanism": "fluid_loop", "constraint_kind": "flow_capacity"},
        # an authored rating is NEVER overwritten:
        {"from_part": "Irrigation Pump", "to_part": "Gac Softener",
         "mechanism": "fluid_loop", "constraint_kind": "flow_capacity",
         "required_value": 7.7, "required_unit": "m3/h"},
        # a NON-fluid edge is untouched even when its endpoints carry flow quantities:
        {"from_part": "Fertigation Dosing Pump", "to_part": "Main Switchboard",
         "mechanism": "electrical_bus", "constraint_kind": "current_rating"},
        # ambiguity between two prefixed candidates → None (never a guess):
        {"from_part": "Clean Water Pump", "to_part": "Storage Tank",
         "mechanism": "fluid_loop", "constraint_kind": "flow_capacity"},
    ]
    nj = join_flow_demands(jt, q, log=lambda *a: None)
    assert nj == 2, f"flow-join: expected exactly 2 edges joined, got {nj}"
    assert jt[0]["required_value"] == 14.5 and "destination demand" in jt[0]["_flow_join_basis"], \
        f"flow-join: destination demand must govern; got {jt[0]}"
    assert jt[1]["required_value"] == 45 and "source delivery" in jt[1]["_flow_join_basis"], \
        f"flow-join: source delivery must govern when destination has no qty; got {jt[1]}"
    assert jt[2].get("required_value") is None, \
        "flow-join: NO-FABRICATION violated — an edge with no matching quantity must stay None"
    assert jt[3]["required_value"] == 7.7, "flow-join: an authored rating must never be overwritten"
    assert jt[4].get("required_value") is None, "flow-join: a non-fluid edge must be untouched"
    assert jt[5].get("required_value") is None, \
        "flow-join: two prefixed candidates are ambiguous — must stay None"
    # generic-only name must not ride the unique-prefix path even when unambiguous:
    assert _flow_qty_for_part("tank", {"tank_farm_flow_m3_h": 33}) is None, \
        "flow-join: a generic-only name must never decide a prefix match"
    # …but its EXACT key still matches (the full name IS the identity):
    assert _flow_qty_for_part("tank", {"tank_flow_m3_h": 33}) == ("tank_flow_m3_h", 33.0), \
        "flow-join: exact snake-name + suffix must match even for a generic name"
    # finalize_ledger applies the join when quantities are passed (the choke point) and is
    # a no-op join with quantities=None (byte-identical pre-join behaviour).
    ftopo = [{"from_part": "Rearing Tank", "to_part": "Rotary Drum Filter", "mechanism": "fluid_loop"}]
    fq = {"rotary_drum_filter_throughput_m3_h": 120}
    fj, _ = finalize_ledger(list(ftopo), parts, resolve, log=lambda *a: None, quantities=fq)
    assert fj[0]["required_value"] == 120 and fj[0]["required_unit"] == "m3/h", \
        f"finalize_ledger must join flow demands when quantities given; got {fj[0]}"
    assert fj[0]["constraint_kind"] == "flow_capacity", \
        "finalize_ledger join must default constraint_kind=flow_capacity on a bare fluid edge"
    fn, _ = finalize_ledger(list(ftopo), parts, resolve, log=lambda *a: None)
    assert fn[0].get("required_value") is None, \
        "finalize_ledger without quantities must leave edges un-joined (backward compatible)"
    # ledger_rows discloses the join provenance:
    rws = ledger_rows(fj)
    assert rws[0]["required_value"] == 120 and "rotary_drum_filter_throughput_m3_h" in rws[0]["required_basis"], \
        f"ledger_rows must carry required_value + required_basis; got {rws[0]}"

    # ── SERVICE-DOMAIN COMPATIBILITY + SELF-LOOP + FLOW-UNIT CANONICALISATION ──────────
    # (2026-07-02, the v55 scrambled-graph proveCatch — each case reproduces a SHIPPED v55
    #  defect and must be caught; the clean counter-cases must pass untouched.)
    dparts = [_P("Fresh Water Tank"), _P("Mains Incomer"), _P("Cip Tank"),
              _P("PCS Inverter Module"), _P("Gac Softener")]

    def dresolve(name, parts):
        for p in parts:
            if p.name.lower() == str(name or "").lower():
                return p
        return None

    dtopo = [
        # v55 shipped: WATER routed INTO the electrical incomer → must DROP
        {"from_part": "Fresh Water Tank", "to_part": "Mains Incomer", "mechanism": "fluid_loop"},
        # carve-out: liquid COOLING of power-CONVERSION gear is real (BESS PCS loop) → KEPT
        {"from_part": "Fresh Water Tank", "to_part": "PCS Inverter Module", "mechanism": "fluid_coolant"},
        # v55 shipped: 'Cip Tank → Cip Tank' — normalised self-loop (slug alias) → must DROP
        {"from_part": "Cip Tank", "to_part": "cip_tank", "mechanism": "fluid_loop"},
        # clean process edge → KEPT
        {"from_part": "Fresh Water Tank", "to_part": "Gac Softener", "mechanism": "fluid_loop"},
    ]
    dfinal, ddropped = finalize_ledger(dtopo, dparts, dresolve, log=lambda *a: None)
    dpairs = {(e["from_part"], e["to_part"]) for e in dfinal}
    dreasons = {(d[0], d[1]): d[3] for d in ddropped}
    assert dreasons.get(("Fresh Water Tank", "Mains Incomer")) == \
        "service-domain mismatch (fluid line on electrical/control gear)", \
        f"water into the electrical incomer must be dropped; got {ddropped}"
    assert ("Fresh Water Tank", "PCS Inverter Module") in dpairs, \
        "coolant to power-CONVERSION gear (PCS) must be KEPT (the BESS carve-out)"
    assert dreasons.get(("Cip Tank", "cip_tank")) == "self-loop", \
        f"a normalised self-loop (name vs slug alias) must be dropped; got {ddropped}"
    assert ("Fresh Water Tank", "Gac Softener") in dpairs, "the clean process edge survives"

    # canonicalise_flow_units — the 90 m³/h → '90 m³/s' phantom (324,000 m³/h) is re-stamped;
    # a flow implausible under EVERY reading is marked (never rescaled); sane edges untouched.
    cq = {"irrigation_pump_flow_m3_h": 90}     # plant ceiling 90 m³/h → limit 450
    cedges = [
        {"from_part": "A", "to_part": "B", "mechanism": "fluid_loop",
         "required_value": 90, "required_unit": "m³/s"},        # v55 main-loop mis-stamp
        {"from_part": "C", "to_part": "D", "mechanism": "fluid_loop",
         "required_value": 1.35, "required_unit": "m³/s"},      # v55 service-tie mis-stamp
        {"from_part": "E", "to_part": "F", "mechanism": "fluid_loop",
         "required_value": 90000, "required_unit": "m3/h"},     # implausible under any reading
        {"from_part": "G", "to_part": "H", "mechanism": "fluid_loop",
         "required_value": 14.5, "required_unit": "m3/h"},      # sane — untouched
        {"from_part": "I", "to_part": "J", "mechanism": "electrical_bus",
         "required_value": 4000, "required_unit": "A"},         # non-fluid — untouched
    ]
    nfix, nbad = canonicalise_flow_units(cedges, cq, log=lambda *a: None)
    assert (nfix, nbad) == (2, 1), f"expected 2 corrected + 1 implausible, got {(nfix, nbad)}"
    assert cedges[0]["required_unit"] == "m3/h" and "re-stamped" in cedges[0]["_unit_corrected_basis"], \
        f"90 m³/s must be re-stamped to 90 m3/h with provenance; got {cedges[0]}"
    assert cedges[1]["required_unit"] == "m3/h", "the 1.35 m³/s service tie is re-stamped too"
    assert "_flow_implausible" in cedges[2] and cedges[2]["required_value"] == 90000, \
        "an implausible flow is MARKED, never rescaled (no fabrication)"
    assert cedges[3]["required_unit"] == "m3/h" and "_unit_corrected_basis" not in cedges[3], \
        "a sane in-ceiling flow is untouched"
    assert cedges[4]["required_unit"] == "A", "a non-fluid rating is untouched"
    # no flow quantity anywhere (a BESS-like contract) → strict no-op
    assert canonicalise_flow_units([dict(cedges[0])], {"battery_capacity_kwh": 5000},
                                   log=lambda *a: None) == (0, 0), \
        "with no stated plant flow the canonicaliser must be a no-op (BESS byte-identity)"
    # finalize integration: the mis-stamped unit is corrected AT THE CHOKE POINT and the
    # ledger row discloses the correction.
    itopo = [{"from_part": "Fresh Water Tank", "to_part": "Gac Softener",
              "mechanism": "fluid_loop", "constraint_kind": "flow_capacity",
              "required_value": 90, "required_unit": "m³/s"}]
    ifinal, _ = finalize_ledger(itopo, dparts, dresolve, log=lambda *a: None, quantities=cq)
    irow = ledger_rows(ifinal)[0]
    assert irow["required_unit"] == "m3/h" and "re-stamped" in (irow.get("unit_corrected") or ""), \
        f"finalize_ledger must canonicalise the unit and disclose it on the row; got {irow}"

    print("connection_ledger selftest: OK (authority + completeness + integrity + direction-closer + residual + flow-demand join)")
    print(f"connection_ledger selftest: OK (2 authored, dangling+dry+dup dropped; "
          f"completeness flags {len(concerns)} incomplete part(s) incl. pump-missing-input)")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
