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

        # 2) NO SPURIOUS DRY-ANCILLARY WATER/THERMAL TIE TO A TANK.
        if svc in ("water", "thermal"):
            both = f"{a_name} {b_name}"
            if _DRY_ANCILLARY_RE.search(both) and _TANK_RE.search(both):
                dropped.append((a_name, b_name, mech, "dry-ancillary water/thermal tie to tank"))
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
    r"oxygen[_ -]?(?:supply|cone|inject|diffus|solenoid)|\blox\b|liquid[_ -]?oxygen|"
    r"ozone[_ -]?(?:supply|generat|inject)|\bco2[_ -]?(?:supply|inject)|heat[_ -]?pump", re.I)

# INLINE TAP — a valve / meter / manifold / instrument that sits ON a line. It needs ≥1
# fluid tie (it is on the pipe) but not necessarily a distinct in AND out modelled as
# separate edges (the line passes through it). Requiring both over-flags an inline valve.
_INLINE_TAP_RE = re.compile(
    r"\bvalve\b|flow[_ -]?meter|\bmeter\b|manifold|distribution[_ -]?manifold|"
    r"pipework|\bheader\b|sight[_ -]?glass|sampl|strainer|\btee\b|\bspool\b", re.I)


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
        if "water" in req and not _DRY_ANCILLARY_RE.search(nm):
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
    print(f"connection_ledger selftest: OK (2 authored, dangling+dry+dup dropped; "
          f"completeness flags {len(concerns)} incomplete part(s) incl. pump-missing-input)")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
