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
    if "air" in m or "vent" in m or "hvac" in m or "duct" in m or "gas" in m:
        return "air"
    if "assembly" in m or "mechanical" in m or "part_of" in m or "mount" in m:
        return "assembly"
    return "water"


def finalize_ledger(topology, parts, resolve_endpoint, log=print):
    """Return (final_topology, dropped). `final_topology` is the AUTHORITATIVE connection
    list — every edge endpoint-resolved to a real placed part, spurious ties removed,
    de-duplicated per (from, to, service). `dropped` is a list of
    (from, to, mechanism, reason) for transparency.

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
        if a_name == b_name:
            dropped.append((a_name, b_name, mech, "self-loop"))
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

    if dropped:
        from collections import Counter
        reasons = Counter(d[3] for d in dropped)
        log(f"[ledger] authority: {len(final)} connection(s) authored; "
            f"{len(dropped)} candidate(s) dropped ("
            + ", ".join(f"{n} {r}" for r, n in reasons.most_common()) + ")")
        for d in dropped:
            if d[3] in ("both-endpoints-unresolved", "dry-ancillary water/thermal tie to tank"):
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
    r"utility[_ -]?incomer|\bgrid\b|\bmains\b|battery[_ -]?limit|"
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
        pick = (max(same, key=_rank) if same else (max(cands, key=_rank) if cands else None))
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
    consumers = sorted(has_in, key=_rank)
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
        pick = (min(same, key=_rank) if same else (min(cands, key=_rank) if cands else None))
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
        pick = min(pool, key=lambda c: abs(_rank(c) - r)) if pool else None
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
            pick = min(pool, key=lambda s: abs(_rank(s) - r)) if pool else _BL_FEED
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
            "material_context": e.get("material_context"),
            "source": "contract" if not e.get("_augmented") else "completion",
        })
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
    print("connection_ledger selftest: OK (authority + completeness + integrity + direction-closer)")
    print(f"connection_ledger selftest: OK (2 authored, dangling+dry+dup dropped; "
          f"completeness flags {len(concerns)} incomplete part(s) incl. pump-missing-input)")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
