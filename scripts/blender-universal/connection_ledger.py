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


# air-mover endpoint vocabulary for the medium override in finalize_ledger (2026-07-10):
# a part that MOVES OR PASSES AIR — its fluid edges are duct/free-air, never water pipe.
_AIR_MOVER_ENDPOINT_RE = re.compile(
    r"\bfan\b|\bvent(?:ilation)?\b|louvre|\bduct\b|\bblower\b|deflagration|off[\s-]?gas|"
    r"air\s+(?:intake|filter|inlet|outlet)|\bhvac\b", re.I)


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
#
# UNIT-SPELLING FAMILY (CO2-v1 Line & velocity fix, 2026-07-05): the contract also
# spells the per-hour unit "_m3_per_hour" (e.g. 'flue_gas_flow_m3_per_hour',
# 'mea_circulation_m3_per_hour') — a THIRD spelling alongside the existing '_m3_h' /
# '_m3_per_hr' families this list already covered. Every 43 stuck 'velocity
# underivable' rows in the CO2 dossier trace back to a real contract flow quantity
# using a suffix spelling this list didn't recognise. Also added: a BARE unit-only
# suffix (no throughput/flow/demand/capacity verb stem) for all three spellings —
# 'mea_circulation_m3_per_hour' names the STREAM directly with no verb at all.
_FLOW_QTY_SUFFIXES = ("_throughput_m3_h", "_flow_m3_h", "_demand_m3_h", "_capacity_m3_h", "_m3_h",
                      "_throughput_m3_per_hr", "_flow_m3_per_hr", "_demand_m3_per_hr", "_capacity_m3_per_hr", "_m3_per_hr",
                      "_throughput_m3_per_hour", "_flow_m3_per_hour", "_demand_m3_per_hour", "_capacity_m3_per_hour", "_m3_per_hour")

# Tokens that carry no identity — every pump/tank/filter shares them; a name made ONLY
# of these must never decide a prefix match (same discipline as _GENERIC_EQUIP_TOKENS in
# electrical_distribution_model.py).
_GENERIC_FLOW_TOKENS = {"pump", "tank", "vessel", "filter", "water", "system", "unit",
                        "skid", "motor", "line", "pipe", "main", "process", "supply"}

# GENERIC EQUIPMENT-TYPE tail nouns (CO2-v1 fix, 2026-07-05): a part is usually named
# <functional descriptor> + <equipment-type noun> ('MEA Circulation PUMP'), while the
# contract's per-stream flow quantity often names only the STREAM the equipment-type
# noun drives ('mea_circulation_m3_per_hour' — no '_pump'). Stripping ONE trailing
# generic noun gives the matcher a second, still-honest subject to try (the SAME
# exact-then-unique-prefix discipline applies to it — no new fabrication path, just a
# second candidate name). Universal equipment-class nouns, never a per-part table.
_GENERIC_TAIL_NOUNS = {
    "pump", "tank", "vessel", "column", "reactor", "exchanger", "valve", "pipe", "skid",
    "system", "unit", "blower", "compressor", "filter", "tower", "drum", "silo", "hopper",
    "cooler", "condenser", "dryer", "mixer", "agitator", "heater", "reboiler", "separator",
    "manifold", "header", "line",
}


def _strip_generic_tail(s: str):
    """Drop ONE trailing generic equipment-type noun token, or None if `s` has no such
    tail (or would strip to nothing) — a second, still-honest match subject, never a
    replacement for the full name (tried only when the full name fails to match)."""
    toks = [t for t in s.split("_") if t]
    if len(toks) < 2 or toks[-1] not in _GENERIC_TAIL_NOUNS:
        return None
    return "_".join(toks[:-1])


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


def _match_flow_subject(s, quantities):
    """(quantity_key, flow_m3h) for ONE snake-cased subject string, or None: (1) exact
    subject + flow-suffix; (2) else a UNIQUE subject-prefixed flow-suffix candidate —
    generic-only subjects are barred from the prefix path. Shared by the full part
    name AND its generic-tail-stripped fallback (same discipline, either subject)."""
    if not s:
        return None
    for suf in _FLOW_QTY_SUFFIXES:
        v = _qty_num(quantities.get(s + suf))
        if v is not None and v > 0:
            return (s + suf, v)
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


def _flow_qty_for_part(name, quantities):
    """(quantity_key, flow_m3h) for an endpoint name, or None — see MATCH SEMANTICS above.
    Tries the FULL name first (an authored match always wins); when that fails, tries
    ONE generic-equipment-noun stripped off the tail ('MEA Circulation Pump' → 'mea
    circulation' — the STREAM the pump drives, when the contract names the stream but
    not the pump). Same exact-then-unique-prefix discipline either way — no fabrication,
    just a second honest subject to test it against."""
    s = _snake_name(name)
    if not s or not quantities:
        return None
    hit = _match_flow_subject(s, quantities)
    if hit is not None:
        return hit
    stripped = _strip_generic_tail(s)
    if stripped:
        return _match_flow_subject(stripped, quantities)
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


# ── POWER-DEMAND JOIN (2026-07-05, the "Line & velocity" bms_ctrl→chiller / →coldplate-
# manifold / DC busbar→(busway) fix) ── the ELECTRICAL analogue of join_flow_demands
# above. An electrical run a closer (or the topology augmenters upstream of this ledger
# choke point) mints with NO required_value cannot be sized — connection_sizing / Blender's
# _sized_dia_mm correctly refuses to fabricate a ✓ over an unknown current (the 2026-07-02
# "0 A → 10×0 mm Cu bar, within ✓" fix) and reports it honestly UNVERIFIED, but that leaves
# the Line & velocity schedule with a run that never gets a real current at all unless
# something joins it on. Same PRECEDENCE + never-fabricate discipline as the fluid join:
#   1. the DESTINATION device's own contract-quantity current demand governs;
#   2. else the SOURCE's own contract-quantity delivery current;
#   3. else — a duplicate/monitoring tie to a device that ALREADY carries a real demand
#      elsewhere in THIS topology (e.g. a BMS interlock tap to the SAME chiller the
#      distribution busbar already feeds) inherits that device's own already-established
#      demand — copied from the ledger's own record, never re-derived or invented;
#   4. no match anywhere (a genuinely non-power-consuming destination — a passive coolant
#      manifold with no motor/heater draw) → required_value stays None, honest UNVERIFIED,
#      exactly like the fluid twin. UNIVERSAL — no per-class/per-part table.
_CURRENT_QTY_SUFFIXES = ("_current_a", "_rated_current_a", "_design_current_a",
                        "_load_current_a", "_full_load_current_a")
# Loose-match floor for the sibling-destination fallback (step 3): a role-token endpoint
# ('chiller') is a SUBSTRING of its resolved display name ('liquid cooling chiller'), not
# an exact match — mirrors parts_ledger.py's own `resolve()` loose contains-match. Guarded
# by a minimum length so a short generic token ('ch', 'fan') never over-matches.
_SIBLING_MATCH_MIN_LEN = 4


def _current_qty_for_part(name, quantities):
    """(quantity_key, current_amps) for an endpoint name, or None — CURRENT-family twin
    of _flow_qty_for_part; identical MATCH SEMANTICS (exact snake+suffix, else a UNIQUE
    prefixed candidate; a name made only of generic tokens never rides the prefix path)."""
    s = _snake_name(name)
    if not s or not quantities:
        return None
    for suf in _CURRENT_QTY_SUFFIXES:
        v = _qty_num(quantities.get(s + suf))
        if v is not None and v > 0:
            return (s + suf, v)
    toks = [t for t in s.split("_") if t]
    if toks and all(t in _GENERIC_FLOW_TOKENS for t in toks):
        return None
    cands = []
    for k in quantities:
        if not k.startswith(s + "_") or not any(k.endswith(x) for x in _CURRENT_QTY_SUFFIXES):
            continue
        v = _qty_num(quantities.get(k))
        if v is not None and v > 0:
            cands.append((k, v))
    if len(cands) == 1:
        return cands[0]
    return None


def join_power_demands(edges, quantities, log=print):
    """Join a POWER-service edge's missing required_value from the DESTINATION device's
    own demand (see the module comment above for the full precedence + rationale). Only an
    electrical edge (mechanism resolves to the 'power' service — mirrors join_flow_demands'
    own mechanism-keyed test, works whether called standalone or via finalize_ledger) with
    NO existing required_value is touched — an authored/joined rating is never overwritten.
    Returns the number joined."""
    if not edges:
        return 0
    def _is_power(e):
        return (e.get("_ledger_service") or _service_of(e.get("mechanism"))) == "power"
    # Index every ALREADY-rated power edge by its destination — step 3's sibling lookup
    # (a second tie to a device that already carries a real demand inherits it). A
    # destination matching _ABSTRACT_BOUNDARY_RE (a GENERIC pseudo-node — '(busway)',
    # 'bms_ctrl', a bare 'board'/'bus' — is reused across MULTIPLE unrelated physical
    # trunks, never a single real device) is excluded from BOTH sides of this lookup: it
    # is not a uniquely-identified destination, so its "own demand" cannot be established
    # OR looked up without cross-attributing one trunk's total onto an unrelated one (the
    # v79 catch: a bare '(busway)' sibling-matched a DIFFERENT hub's small BMS-comms trunk
    # (15 A) onto the DC busbar's own ~1667 A main trunk — wrong by two orders of magnitude).
    established = []   # [(norm_name, amps, unit, real_to_name)]
    for e in edges:
        if not isinstance(e, dict) or not _is_power(e):
            continue
        v = _qty_num(e.get("required_value"))
        to = str(e.get("to_part") or "")
        if v is not None and v > 0 and to and not _ABSTRACT_BOUNDARY_RE.search(to):
            established.append((_norm_name(to), v, e.get("required_unit") or "A", to))

    joined = 0
    for e in edges:
        if not isinstance(e, dict) or not _is_power(e):
            continue
        if e.get("required_value") is not None:
            continue    # never overwrite an authored/already-joined rating
        dst, src = e.get("to_part"), e.get("from_part")
        hit = _current_qty_for_part(dst, quantities)
        which = "destination demand"
        if not hit:
            hit = _current_qty_for_part(src, quantities)
            which = "source delivery"
        if hit:
            key, amps = hit
            e["required_value"] = amps
            e["required_unit"] = "A"
            e["_power_join_basis"] = f"contract qty {key} = {amps:g} A ({which})"
            joined += 1
            continue
        # Step 3 — sibling-destination fallback (never fabricated: copies a REAL value
        # already established elsewhere in this SAME topology for the SAME device). A
        # pseudo-node destination is never a lookup key either (same reasoning as above).
        if _ABSTRACT_BOUNDARY_RE.search(str(dst or "")):
            continue
        nk = _norm_name(str(dst or ""))
        if len(nk) < _SIBLING_MATCH_MIN_LEN:
            continue
        matches = [(amps, unit, real_to) for (enk, amps, unit, real_to) in established
                   if (nk in enk or enk in nk) and len(enk) >= _SIBLING_MATCH_MIN_LEN]
        if len(matches) == 1:
            amps, unit, real_to = matches[0]
            e["required_value"] = amps
            e["required_unit"] = unit
            e["_power_join_basis"] = (f"same destination's already-established demand "
                                       f"({real_to} = {amps:g} {unit} elsewhere in this topology)")
            joined += 1
        # >1 ambiguous match, or 0 matches (a genuinely non-power-consuming destination) —
        # NEVER guess. required_value stays None; the honest-UNVERIFIED path reports it.
    if joined:
        log(f"[ledger] power-demand join: {joined} electrical edge(s) now carry their "
            f"destination's real current demand (required_value A) — cables size from true loads")
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
        # AIR-MOVER MEDIUM OVERRIDE (2026-07-10, Powerwall run-22: fan → thermal-bay →
        # deflagration-vent edges authored as service 'water' and then SIZED as DN100
        # process-water pipes at the 40 m³/h default — £389/£344 of phantom pipework +
        # the vision critic's 'pipes shooting vertically' INSIDE an air-cooled cabinet).
        # A fluid edge whose OWN declaration says medium air, or whose endpoint is an
        # air-mover (fan / vent / louvre / duct / blower / deflagration panel), carries
        # AIR — ducted or free-blown, never a water pipe. Universal noun/medium signal;
        # a genuine water/coolant edge (pump, tank, manifold-to-chiller) is untouched.
        if svc in ("water", "thermal"):
            _fluid = e.get("fluid") if isinstance(e.get("fluid"), dict) else {}
            _medium = str(_fluid.get("medium") or e.get("medium") or "").lower()
            # AIR-COOLED DESIGN: when the contract's own thermal duty says forced-air
            # (dissipation × 1.2 < 2 kW — the SAME threshold as the emitter branch +
            # the liquid-plant demotion), EVERY thermal-family fluid edge is an air/
            # conduction path — there is no liquid loop to pipe (run-23: 'Thermal
            # Management Manifold → Bay' + 'Bay → heat_rejection' still authored as
            # water because their nouns carry no fan/vent token).
            _diss = 0.0
            if isinstance(quantities, dict):
                _dq = quantities.get("system_thermal_dissipation_kw")
                try:
                    _diss = float(_dq.get("value") if isinstance(_dq, dict) else (_dq or 0))
                except (TypeError, ValueError):
                    _diss = 0.0
            _air_cooled = 0 < _diss and _diss * 1.2 < 2.0
            _thermal_family = bool(re.search(
                r"thermal|cold[\s_-]?plate|heat[\s_-]?sink|heat[\s_-]?rejection|cooling",
                f"{frm} | {to}", re.I))
            if (_medium == "air" or _AIR_MOVER_ENDPOINT_RE.search(f"{frm} | {to}")
                    or (_air_cooled and _thermal_family)):
                svc = "air"
                e["_ledger_service"] = "air"

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
    # POWER-DEMAND JOIN — the electrical analogue, same choke point (see join_power_demands'
    # docstring). Runs unconditionally (not gated on `quantities` truthiness) because step 3
    # (sibling-destination fallback) needs no contract quantities at all — only the topology
    # itself; `quantities` may legitimately be {} for a class with no per-part current family.
    join_power_demands(final, quantities or {}, log=log)

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

# COOLANT/GLYCOL LOOP COMPONENTS — a part whose name IS the liquid-cooling loop (a
# chiller, a cold plate / cold-plate manifold / coolant-distribution manifold, a
# cooling pump, an expansion tank, or an explicit glycol/coolant tag). When
# close_flow_directions closes a fluid tie between two such parts it is completing a
# GLYCOL/WATER COOLANT LOOP, not a generic process-fluid tie — the closed edge's
# material_context should SAY so (connection_sizing._pipe_material_factor reads this
# same string to pick the real construction: stainless hard run / EPDM flex drop),
# rather than the bland "process-flow input/output" placeholder that carries no fluid-
# identity at all and would otherwise fall through to a fabricated carbon-steel default.
# Universal — keyed on the liquid-cooling component VOCABULARY, never an archetype
# check (a BESS rack loop and a CO2/SAF chiller circuit match identically).
_COOLANT_LOOP_PART_RE = re.compile(
    r"\bchiller\b|cold[_ -]?plate|coolant|glycol|cooling[_ -]?pump|expansion[_ -]?tank",
    re.I)

# ABSTRACT BATTERY-LIMIT boundary nodes — the grid connection, the atmosphere, the sea/
# sewer. Intentional system edges with no physical part; a legitimate trace terminus, so
# they are NOT 'broken references' in the referential-integrity check.
# EXTENDED 2026-07-03 (BESS cross-val): the electrical-storage-era SERVICE termini a
# contract edge legitimately ends on — the dc/ac service bus ('dc_bus') and the thermal
# sink ('heat_rejection') — are the same kind of abstract system edge as 'atmosphere'
# (which already passed). Keyed on the service-family NAME (snake_case contract node
# ids); a real part name ('DC busbar 1500 V') or a misspelled part never matches.
# Keep in sync with deterministic_checks_lib._SERVICE_BOUNDARY_ENDPOINT_RE.
#
# WIDENED 2026-07-04 (+busway / +ctrl / +board): found empirically replaying the trace-layer
# reconciliation (below) against REAL BESS artefacts (bess-crossval-v1/v2) — 'bms_ctrl' /
# '(busway)' / a bare distribution-board id are ELECTRICAL-DISTRIBUTION pseudo-nodes the
# electrical model authors as routing structure (never a catalogue part), and
# dossier_audit.py's `_ABSTRACT_TERMINUS_RX` already treats them as legitimate — but THIS
# regex (and its documented mirror, deterministic_checks_lib._SERVICE_BOUNDARY_ENDPOINT_RE)
# did not, so the post-hoc reconciler was about to DROP real, already-shipped BESS
# connections as false dangling references (a regression the byte-identity proveCatch below
# now guards). Union of both regexes' vocabulary, so the ledger authority and the exporter's
# phantom-reference net agree on what "not a physical part" means. `ctrl`/`board` use
# `[_ -]?` (not `\b`) so an underscore-joined id like 'bms_ctrl' matches — a bare `\bctrl\b`
# does NOT fire inside 'bms_ctrl' because `_` counts as a word character in Python regex.
#
# WIDENED 2026-07-06 (+generic utility SUPPLY — the CO2-mineralisation reboiler-
# steam gap): the existing supply vocabulary only covered ELECTRICAL (power_supply/
# incoming_supply/electrical_supply) — a THERMAL/gas utility authored the same way
# ('reboiler_steam_supply' → the site steam main feeding a reboiler) fell through as
# a broken reference even though it is the identical "battery-limit utility feed"
# concept, just a different service. Keyed on the SERVICE noun immediately before
# `_supply` (steam/nitrogen/instrument-air/cooling-water/chilled-water/compressed-
# air/inert-gas — the common industrial-utility set), not a per-class name, so any
# archetype whose contract authors '<utility>_steam_supply'-style ids is covered.
# NOTE: when a design's own BoM contains a REAL part for the utility source (e.g. an
# "electric steam generator"), resolve_endpoint's SYN table (build_universal_scene.
# py) resolves the edge to that PART first — a real part beats an abstract boundary
# every time, and this pattern only fires as the fallback when no such part exists.
_ABSTRACT_BOUNDARY_RE = re.compile(
    r"utility[_ -]?incomer|\bgrid\b|\bmains\b|battery[_ -]?limit|electrical[_ -]?supply|"
    r"power[_ -]?supply\b|incoming[_ -]?supply|"
    r"(?:steam|nitrogen|instrument[_ -]?air|compressed[_ -]?air|inert[_ -]?gas|"
    r"cooling[_ -]?water|chilled[_ -]?water)[_ -]?supply\b|"
    # heat_rejection (2026-07-11 run 61): the class graph's thermal SINK — at air-cooled
    # scale it IS the ambient (the vent path), a boundary, never a part; two demotion-
    # surviving edges to it read as stale ties otherwise.
    r"heat[_ -]?rejection|heat[_ -]?sink\b|"
    r"atmosphere|ambient|to[_ -]?sea|\bsewer\b|public[_ -]?network|off[_ -]?site|"
    # effluent / disposal / drain-to-waste termini (water plant battery limits)
    r"\beffluent\b|\bdisposal\b|waste[_ -]?stream|drain[_ -]?to[_ -]?waste|"
    r"\b(?:dc|ac|hv|lv|mv)[_ -]?bus\b|\bheat[_ -]?reject(?:ion)?\b|"
    r"\b(?:heat|thermal|cold)[_ -]?sink\b|"
    r"bus[_ -]?way|(?:^|[_ -])ctrl(?:$|[_ -])|(?:^|[_ -])board(?:$|[_ -])", re.I)


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
    # NAME-FORMAT-INSENSITIVE indexing (2026-07-06, the CO2-mineralisation "CaCO3
    # hot-air dryer" false concern): the topology's edges are stamped with a part's
    # WIRING-time name string, but the `parts` list this function iterates can carry a
    # DIFFERENTLY-FORMATTED display name for the identical equipment tag (case /
    # hyphen / spacing drift — the ledger's own adjacency showed 'caco3 hot air dryer'
    # fully wired with 4 inputs + 3 outputs while the completeness audit, keyed on the
    # exact string 'CaCO3 hot-air dryer', saw zero of either and flagged a fully-
    # connected part as an orphan). Index + look up every fluid/service map by
    # `_norm_name` (the SAME case/punctuation-insensitive key finalize_ledger already
    # trusts for self-loop identity, just above) instead of the raw string, so a
    # formatting-only drift between the wiring name and the audited name can never
    # manufacture a false completeness concern. `connects_from`/`connects_to` still
    # report the original, human-readable edge endpoint strings — only the MEMBERSHIP
    # test is normalised. proveCatch in _selftest (both directions: a format-drifted
    # wired part passes; a genuinely-unwired part of the same name still fails).
    fluid_in, fluid_out, svc_have = {}, {}, {}
    for e in final_topology:
        f, t = e.get("from_part"), e.get("to_part")
        svc = e.get("_ledger_service") or _service_of(e.get("mechanism"))
        if svc in ("water", "thermal"):
            if t:
                fluid_in.setdefault(_norm_name(t), []).append(f)
            if f:
                fluid_out.setdefault(_norm_name(f), []).append(t)
        for endp in (f, t):
            if endp:
                svc_have.setdefault(_norm_name(endp), set()).add(svc)

    concerns = []
    for p in parts:
        nm = getattr(p, "name", None) or (p.get("name") if isinstance(p, dict) else None)
        if not nm:
            continue
        key = _norm_name(nm)
        mod = getattr(p, "module_id", "") or (p.get("module_id") if isinstance(p, dict) else "") or ""
        fn = getattr(p, "function", "") or (p.get("function") if isinstance(p, dict) else "") or ""
        try:
            req = set(required_services(nm, mod, fn) or set())
        except Exception:
            req = set()
        has = svc_have.get(key, set())
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
            has_in = key in fluid_in
            has_out = key in fluid_out
            # an origin OR an injector supplies the loop (output only, no bulk-water inlet);
            # a sink receives it (input only); an inline tap (valve/meter) sits ON the line.
            is_origin = bool(_FLUID_ORIGIN_RE.search(nm)) or bool(_INJECTOR_RE.search(nm))
            is_sink = bool(_FLUID_SINK_RE.search(nm))
            is_inline_tap = bool(_INLINE_TAP_RE.search(nm))
            if is_inline_tap:
                # an AIR tie satisfies the inline-tap ≥1-tie rule too (run-31: the
                # air-cooled 'Thermal Management Manifold' carries only AIR edges —
                # the fluid_in/out maps count water/thermal only, so it read as tie-less)
                if not has_in and not has_out and "air" not in has:
                    missing.append("fluid-connection")   # on a line, needs ≥1 tie
            else:
                # a FLOW-THROUGH unit (vessel / pump / filter / treatment) needs BOTH.
                # AIR-BREATHING EXEMPTION (2026-07-10, run-28: the air-medium flip left
                # 'Power Semiconductors' with an AIR tie + one conduction water-out —
                # the audit then demanded a piped water INLET on an air-cooled part).
                # A part carrying an AIR-service tie sources/returns its fluid through
                # the AMBIENT — air satisfies a missing direction. A pure water-loop
                # part (no air tie) keeps the strict in+out rule byte-identically.
                if not has_in and not is_origin and "air" not in has:
                    missing.append("fluid-input")
                if not has_out and not is_sink and "air" not in has:
                    missing.append("fluid-output")
        if missing:
            concerns.append({
                "part": nm,
                "missing": missing,
                "connects_from": sorted(set(x for x in fluid_in.get(key, []) if x))[:6],
                "connects_to": sorted(set(x for x in fluid_out.get(key, []) if x))[:6],
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
        # a tie between two COOLANT-LOOP-named parts (chiller/cold plate/coolant
        # manifold/cooling pump/expansion tank) is completing a glycol/water coolant
        # loop, not a generic process-fluid tie — say so, so the downstream pipe-
        # material resolver picks the real construction instead of a fabricated
        # carbon-steel default.
        if _COOLANT_LOOP_PART_RE.search(pick) or _COOLANT_LOOP_PART_RE.search(nm):
            mc = ("glycol/water coolant-loop input (direction-closer: nearest "
                  "upstream) — coolant/glycol service")
        else:
            mc = "process-flow input (direction-closer: nearest upstream)"
        extra.append({"from_part": pick, "to_part": nm, "mechanism": "fluid_loop",
                      "constraint_kind": "flow_capacity",
                      "material_context": mc,
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
        if _COOLANT_LOOP_PART_RE.search(nm) or _COOLANT_LOOP_PART_RE.search(pick):
            mc = ("glycol/water coolant-loop output (direction-closer: nearest "
                  "downstream) — coolant/glycol service")
        else:
            mc = "process-flow output (direction-closer: nearest downstream)"
        extra.append({"from_part": nm, "to_part": pick, "mechanism": "fluid_loop",
                      "constraint_kind": "flow_capacity",
                      "material_context": mc,
                      "_augmented": True, "_direction_closed": True})
        has_out.add(nm)

    if extra:
        n_in = sum(1 for e in extra if "input" in e["material_context"])
        log(f"[ledger] direction-closer: +{len(extra)} edge(s) ({n_in} input from upstream, "
            f"{len(extra) - n_in} output to downstream) — flow-through parts connected both ways")
    return extra


# STEAM-SOURCE → REBOILER redirect (2026-07-06, the L&V-flagged mis-wire). ROOT CAUSE
# (proven by tracing close_flow_directions live on the CO2-mineralisation plant): the
# engineering contract authors its stripper-reboiler steam tie using a raw topology id
# ('stripper_column') that names no REAL placed part — the design's actual reboiling
# equipment is called 'distillation reboiler' / 'MEA stripper reboil pot', neither of
# which contains the word "column". Both close_flow_directions' OWN unresolved-candidate
# ranking (an id with no matching Part.name silently defaults to the module-level RANK
# FALLBACK, which can outrank every real process vessel) AND build_universal_scene's
# resolve_endpoint() token-overlap matcher (whose only placed part carrying a "column"
# token is the ABSORBER) independently steer the tie onto 'packed absorber column' — a
# bare separation vessel with no heat-exchange duty of its own. The result: the plant's
# OWN steam generator, sized in engineering-contract.ts specifically as "stripper
# reboiler steam supply", ends up wired to the wrong vessel on both the authored
# ('source: contract', mechanism 'thermal') AND the direction-closer's completion
# ('source: completion', mechanism 'fluid_loop') edges.
#
# THE FIX (a correction pass, same idiom as close_air_directions "physically-correct
# tie, not the spurious one"): whenever a STEAM-GENERATION utility's edge terminates on
# a bare separation/contact VESSEL (absorber/column/vessel — no reboil duty in its own
# name) AND the plant has a REAL placed part whose name says it reboils, re-home that
# edge onto the reboiler. Deterministic + universal — keyed on the STEAM-SOURCE and
# REBOILER-NAME vocabulary (no per-class table); a no-op wherever the plant has no
# reboiler-named part (nothing honest to redirect to, never fabricates a target) or the
# edge already terminates on one (idempotent — a second pass changes nothing).
_STEAM_SOURCE_NAME_RE = re.compile(r"steam\s*generator|\bboiler\b", re.I)
_REBOILER_EXACT_NAME_RE = re.compile(r"\breboilers?\b", re.I)
_REBOIL_ANY_NAME_RE = re.compile(r"reboil", re.I)
_BARE_SEPARATION_VESSEL_RE = re.compile(r"\babsorber\b|\bcolumn\b|\bvessel\b", re.I)


def _find_reboiler_part(parts):
    """The placed part that does the reboiling, or None. Prefers an exact 'reboiler'
    noun (the heat exchanger that actually receives the steam duty) over a looser
    'reboil' match (e.g. a 'reboil pot' — the vessel the reboiler feeds); deterministic
    alphabetical tie-break within either tier so the pick never depends on dict/list
    ordering."""
    names = [getattr(p, "name", None) for p in parts]
    exact = sorted(n for n in names if n and _REBOILER_EXACT_NAME_RE.search(n))
    if exact:
        return exact[0]
    any_ = sorted(n for n in names if n and _REBOIL_ANY_NAME_RE.search(n))
    return any_[0] if any_ else None


def redirect_steam_to_reboiler(topology, parts, log=print):
    """Re-home any edge FROM a steam-generation utility that lands on a bare
    absorber/column/vessel onto the plant's real reboiler part (see module comment
    above). Mutates matching edges IN PLACE (re-homing, not adding a duplicate) and
    returns the count changed. proveCatch + counter-cases in _selftest()."""
    reboiler = _find_reboiler_part(parts)
    if reboiler is None:
        return 0
    n = 0
    for e in topology:
        if not isinstance(e, dict):
            continue
        frm = str(e.get("from_part") or "")
        to = str(e.get("to_part") or "")
        if not _STEAM_SOURCE_NAME_RE.search(frm):
            continue
        if _service_of(e.get("mechanism")) not in ("thermal", "water"):
            continue
        if to == reboiler or _REBOIL_ANY_NAME_RE.search(to):
            continue           # already correct — idempotent
        if not _BARE_SEPARATION_VESSEL_RE.search(to):
            continue           # only correct a genuine bare-vessel mis-target
        old_to = e.get("to_part")
        e["to_part"] = reboiler
        e["material_context"] = (str(e.get("material_context") or "").strip()
                                  + f" [direction-closer: steam re-homed from '{old_to}' to the "
                                    f"reboiler '{reboiler}' — a steam source feeds the reboiler, "
                                    f"not a bare separation vessel]").strip()
        n += 1
    if n:
        log(f"[ledger] steam-to-reboiler redirect: {n} edge(s) re-homed onto '{reboiler}'")
    return n


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


# mirrors parts_ledger.py's own TYPE_RULES valve pattern EXACTLY (\bvalve\b|solenoid|
# actuator|damper) — kept in sync by hand so "is this word an inline valve/actuator" is
# the SAME verdict on both independent ledgers.
_ACTUATOR_VALVE_NAME_RE = re.compile(r"\bvalve\b|solenoid|actuator|damper", re.I)


def close_actuator_host_ties(state, parts, topology, log=print):
    """UNIVERSAL closer for GA-NON-MASSED actuator/valve words (Tristan 2026-07-04, the
    X-124 / FCV-201-202 orphan diagnosis). `ga_massing.is_ga_non_massing()` drops every
    inline valve/solenoid from the 3-D scene at `extract_parts()` (accessory, P&ID-level
    detail) — its own docstring promises "the parts REMAIN in the... connection ledger",
    but every OTHER closer in this module iterates `parts` (the MASSED list only), so a
    GA-dropped valve was never a candidate NODE for any of them: it wasn't orphaned by a
    bad closer rule, it was never given to a closer as a node in the first place. This
    closer restores the promise, reading the FULL authored word list (`state`) instead of
    just `parts`, using two universal, no-per-tag-whitelist signals in priority order:

      1. EXPLICIT HOST — the generic-emitter stamps a synthesized actuator word with
         `_actuator_of: <host_word_id>` when it derives the valve FROM a specific vessel
         (e.g. Fischer Codema's 'Inlet Flow Control Valve … on the inlet of Softener
         Vessel'). Resolve the host word_id to its name_human, then to the MASSED Part
         sharing that name (exact, else token-overlap) — tie a fluid edge host<->valve.
         A host that fails to resolve to a real placed part is left alone (never invents
         a dangling reference).
      2. SIBLING-GROUP HOST — an un-hosted GA-dropped valve/actuator word in the SAME
         sub_module as a word that DOES carry `_actuator_of` shares its sibling's host (a
         valve NEST is authored one sub_module per parent vessel — Fischer Codema's
         'Solenoid Valves' sits beside the explicitly-hosted 'Inlet Flow Control Valve' in
         the SAME sub_module, but only the actuator word itself carries the structured
         reference). A sub_module with NO explicitly-hosted sibling is left untouched —
         never guessed (see the V-107 diagnosis in the caller's commit message: a bare
         'representative actuation kinematics component' placeholder with no host
         reference anywhere in its OWN sub_module cannot be honestly closed here; the
         correct fix is upstream, stamping `_actuator_of` on every synthesized valve).

    A word already massed (present in `parts`) or already carrying ANY edge in the
    candidate `topology` is skipped — this closer only ever adds what ga_massing removed
    and never duplicates an existing tie. Pure + deterministic; no per-tag table."""
    massed_names = {getattr(p, "name", None) for p in parts if getattr(p, "name", None)}

    def _toks(s):
        return {t for t in re.split(r"[^a-z0-9]+", str(s).lower()) if len(t) > 2}

    massed_by_tok = {nm: _toks(nm) for nm in massed_names}

    by_id: dict = {}
    by_submodule: dict = {}
    for m in (state.get("moduleDecomposition") or {}).get("modules") or []:
        for sm in m.get("sub_modules") or []:
            smid = sm.get("id") or sm.get("sub_module_id")
            words = sm.get("words") or []
            by_submodule[smid] = words
            for w in words:
                wid = w.get("id")
                if wid:
                    by_id[wid] = w

    def _resolve_host_part(host_word_id):
        hw = by_id.get(host_word_id) or {}
        hname = hw.get("name_human")
        if not hname:
            return None
        if hname in massed_names:
            return hname
        # token-overlap fallback — the host word itself may ALSO be renamed/non-massed
        # (e.g. a *_synth_word whose canonical Part name differs slightly).
        htoks = _toks(hname)
        best, best_ov = None, 0
        for nm, toks in massed_by_tok.items():
            ov = len(htoks & toks)
            if ov > best_ov:
                best, best_ov = nm, ov
        return best if best_ov >= 1 else None

    connected = set()
    for e in topology:
        for k in ("from_part", "to_part"):
            if e.get(k):
                connected.add(e.get(k))

    extra, seen = [], set()

    def _tie(host_name, valve_name):
        if not host_name or not valve_name or host_name == valve_name:
            return
        if (host_name, valve_name) in seen:
            return
        seen.add((host_name, valve_name))
        extra.append({"from_part": host_name, "to_part": valve_name, "mechanism": "fluid_loop",
                      "constraint_kind": "final_control_element",
                      "material_context": "actuator/valve on the host's process line "
                                           "(actuator-host closer: explicit _actuator_of "
                                           "or sibling-group host)",
                      "_augmented": True, "_actuator_host_closed": True})

    # PASS 1 — explicit `_actuator_of` host.
    submodule_host: dict = {}
    for smid, words in by_submodule.items():
        for w in words:
            name = w.get("name_human")
            host_wid = w.get("_actuator_of")
            if not host_wid or not name:
                continue
            if name in massed_names or name in connected:
                continue
            host_name = _resolve_host_part(host_wid)
            if host_name is None:
                continue
            _tie(host_name, name)
            submodule_host[smid] = host_name

    # PASS 2 — sibling-group fallback: an un-hosted, GA-dropped valve/actuator word in a
    # sub_module that NOW has a resolved host (from pass 1) shares it.
    for smid, words in by_submodule.items():
        host_name = submodule_host.get(smid)
        if not host_name:
            continue
        for w in words:
            name = w.get("name_human")
            if not name or name in massed_names or name in connected:
                continue
            if not _ACTUATOR_VALVE_NAME_RE.search(name):
                continue
            _tie(host_name, name)

    if extra:
        log(f"[ledger] actuator-host closer: +{len(extra)} tie(s) — GA-dropped inline "
            f"valve(s)/actuator(s) connected to their host vessel (explicit _actuator_of "
            f"+ sibling-group fallback)")
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
    Pure + universal (no per-class table). Run AFTER close_boundaries.

    DECISION (Codema 1538): when `placed_xyz_mm` is already on the parts (a
    re-finalize after placement, or a twin that carries centres), prefer PLAN XY
    distance over region_rank for the fluid partner pick — rank-only "nearest"
    minted oxygen-dosing→drain-sump across the plant. When placement is absent
    (first mint, before the placer runs) fall back to rank (position-free).
    Plant-spanning edges that still mint are demoted from 3-D by
    `wire_ports._should_demote_plant_spanning_fluid` (geometry gate)."""
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

    def _xy(nm):
        """Plan centre (x,y) mm when the part is already placed; else None."""
        p = by_name.get(nm)
        xyz = getattr(p, "placed_xyz_mm", None) if p is not None else None
        if not (isinstance(xyz, (list, tuple)) and len(xyz) >= 2):
            return None
        try:
            return (float(xyz[0]), float(xyz[1]))
        except (TypeError, ValueError):
            return None

    def _pick_nearest(pool, nm, r):
        """Prefer plan-XY distance when both ends are placed; else region_rank."""
        if not pool:
            return None
        src_xy = _xy(nm)
        if src_xy is not None:
            def _key(s):
                xy = _xy(s)
                if xy is None:
                    return (1e18, abs(_rank(s) - r), s)
                dx, dy = src_xy[0] - xy[0], src_xy[1] - xy[1]
                return (dx * dx + dy * dy, abs(_rank(s) - r), s)
            return min(pool, key=_key)
        return min(pool, key=lambda s: (abs(_rank(s) - r), s))

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
            # SERVICE-DOMAIN GUARD (Tristan's V-111/Pressure-Vessels thread, 2026-07-04):
            # a candidate-topology edge (e.g. from an earlier, less-careful closer) that
            # terminates on switching/control gear ('Fresh Water Tank -> Mains Incomer')
            # is ITSELF about to be dropped by finalize_ledger's service-domain-
            # compatibility rule below — but this closer ran BEFORE that filter and had
            # no visibility into the future rejection, so it inherited the mistake and
            # picked the SAME doomed gear as a fluid consumer for an unrelated part
            # ('Pressure Vessels -> Mains Incomer'), which finalize_ledger also dropped —
            # leaving the part's completeness gap UNFILLED despite the closer's own
            # "cannot miss a gap it leaves" guarantee. Never add switch/control gear to
            # the fluid source/consumer pool at all — mirrors SWITCH_CONTROL_GEAR_RE,
            # the exact rule finalize_ledger enforces, so the closer never proposes an
            # edge the authority step would reject.
            if f and not SWITCH_CONTROL_GEAR_RE.search(f):
                sources.add(f)
            if t and not SWITCH_CONTROL_GEAR_RE.search(t):
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
                pick = _pick_nearest(pool, nm, r) if pool else _BL_FEED
                _add(pick, nm, "water",
                     "process input (residual closer: nearest producer)" if pick != _BL_FEED
                     else "plant feed (battery limit)")
            elif miss in ("fluid-output", "fluid-connection"):
                cands = [s for s in consumers if s != nm and (s, nm) not in fwd_fluid]
                pool = [s for s in cands if _mod(s) == m] or cands
                pick = _pick_nearest(pool, nm, r) if pool else _BL_EXPORT
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


# ── POST-AUTHORING RECONCILIATION (2026-07-04, the 'Piping Network' trace-layer ghost) ────
# finalize_ledger's ENDPOINT VALIDITY rule (rule 1 above) only ever sees the design as it
# stood AT AUTHORING TIME — but the drawing-generation settle loop runs EARLY (before the
# cost stack), and deterministic_finalize.py's scope-word demotion + reconcile_hollow's
# un-scatter + the thin-sub-module density merge all mutate state.moduleDecomposition LATER,
# on the delivered state.json. A word the ledger tied an edge to (e.g. 'Piping Network', a
# scope-vocabulary word demoted to a scope note post-render) can vanish from the design
# AFTER the ledger already authored connections to it — leaving a dangling reference the
# ledger's own authority rule would have refused had it run last. This is the SAME
# "no dangling reference anywhere" discipline the fold registry + ghost-prune already apply
# to BoM rows (a word folded/removed downstream must leave no BoM ghost) — extended here to
# the connection layer: a name-family fix, not a per-name patch. Universal — keyed on
# membership in the CURRENT valid-part-name set, never a hardcoded word list.
def _row_endpoints(row):
    """(from_name, to_name) for a connection row, tolerant of both schemas in play:
    connection-ledger.json rows use from_part/to_part; connection-schedule.json rows use
    from/to. Returns (None, None) for a non-dict / unrecognised row."""
    if not isinstance(row, dict):
        return None, None
    frm = row.get("from_part", row.get("from"))
    to = row.get("to_part", row.get("to"))
    return frm, to


def _set_row_endpoints(row, frm, to):
    """Write a (possibly re-homed) endpoint pair back using WHICHEVER key pair the row
    already carries (from_part/to_part or from/to) — mirrors _row_endpoints so a read
    followed by a write always round-trips through the same schema."""
    if "from_part" in row or "to_part" in row:
        row["from_part"], row["to_part"] = frm, to
    else:
        row["from"], row["to"] = frm, to


def _endpoint_tokens(s):
    """Lowercase alphanumeric tokens of an endpoint name — the join key for resolution.
    Mirrors build-excel-export.py's `_trace_tokens` intent (its own docstring: "'[N]' index
    dropped") — but that function's IMPLEMENTATION never actually strips the bracket, a
    pre-existing latent mismatch found empirically replaying this fix against real BESS
    artefacts: a qty-N replicated instance name ('rack[0]', 'rack[1]', …) tokenised WITHOUT
    stripping the index picks up a spurious digit token ('0'/'1'/…) that is never a subset
    of the real part's tokens, so EVERY indexed instance reference falsely read as dangling
    and its row was dropped (a real, already-shipped connection destroyed by a resolver bug,
    not by any real design change — exactly the regression the byte-identity proveCatch
    below guards against). Fixed HERE (this module's own resolver); the exporter's
    `_trace_tokens` carries the identical latent gap and is a documented follow-up, not
    touched by this fix (out of the named defect's scope)."""
    import unicodedata as _ud
    t = _ud.normalize("NFKC", str(s or "")).replace("↳", " ")
    for sep in ("·", "•"):
        if sep in t:
            t = t.split(sep)[0]
    t = re.sub(r"\[\d+\]", "", t)
    return [x for x in re.findall(r"[a-z0-9]+", t.lower())]


def _build_valid_index(valid_names):
    """(display_name, token_set) for every name in `valid_names`, deduped. `valid_names`
    is normally every word's name_human in the settled design (see deterministic_finalize.
    _valid_part_names)."""
    out, seen = [], set()
    for nm in (valid_names or ()):
        ts = frozenset(_endpoint_tokens(nm))
        if not ts:
            continue
        key = (str(nm).strip().lower(), ts)
        if key in seen:
            continue
        seen.add(key)
        out.append((str(nm).strip(), ts))
    return out


def _resolve_to_valid_name(name, index):
    """Resolve a (possibly stale/abbreviated/relabelled) endpoint name to the CURRENT real
    part it UNIQUELY names, or None when it matches nothing OR matches more than one. Same
    subset rule as build-excel-export.py's `_resolve_endpoint_name` (one shared semantic,
    see _endpoint_tokens): the endpoint's tokens must be a SUBSET of a real part's tokens (a
    short token may match by PREFIX, so an abbreviation resolves — 'bm ctrl' ⊂ 'bms
    controller'). A reference carrying tokens the real part doesn't have ('toray hfu 2020an
    ro membrane elements' vs 'ro membrane elements') is NOT a subset and resolves to None —
    a genuinely stale/removed reference, not an abbreviation.

    STRICTER than the exporter's own resolver (2026-07-04, found empirically replaying this
    fix against real BESS artefacts): the exporter's shortest-real-name-wins tie-break is
    fine for a DISPLAY-only backstop, but this function's caller decides whether to DROP or
    REWRITE a real connection — a wrong guess is a silent mis-attribution, not just a cosmetic
    label. A bare, low-specificity abbreviation like 'pcs' subset-matches SEVERAL distinct
    real parts ('PCS inverter…', 'PCS cooling fan tray', 'PCS DC surge arrester', …) —
    shortest-wins would have silently picked whichever happened to have the fewest tokens,
    which is not necessarily the part the edge actually meant. Requires an UNAMBIGUOUS
    (exactly one) match; ≥2 candidates return None (the caller's internal-id passthrough,
    not a drop, handles the common case where this ambiguity is itself the signal that
    `name` was never a BoM display name to begin with).

    EXACT MATCH ALWAYS WINS FIRST, before the subset scan (2026-07-04, a second real BESS
    regression found the same replay run): BESS names its own real parts with shared-word
    families — 'rack string fuse' is itself a real, exact word name, but its tokens are
    ALSO a legitimate subset of the unrelated 'rack-level HRC string fuse' word, so the
    subset scan alone finds 2 candidates and (correctly, per the rule above) refuses to
    guess — even though the query was never actually ambiguous, it named itself exactly.
    An exact (case/punctuation-insensitive) match to any index entry is definitionally
    unambiguous and is returned immediately, without ever reaching the subset scan."""
    for disp, _rt in index:
        if _norm_name(disp) == _norm_name(name):
            return disp
    ets = set(_endpoint_tokens(name))
    if not ets or not any(len(t) >= 2 for t in ets):
        return None
    candidates = []
    for disp, rt in index:
        ok = True
        for et in ets:
            if et in rt:
                continue
            if len(et) >= 2 and any(rtok.startswith(et) for rtok in rt):
                continue
            ok = False
            break
        if ok:
            candidates.append(disp)
    return candidates[0] if len(candidates) == 1 else None


# An endpoint written as a bare lowercase/snake_case token ('bms_ctrl', 'rack_block', 'pcs',
# 'dc_bus') is — by this codebase's own consistent authoring convention — a TOPOLOGY-INTERNAL
# id (a module-representative / distribution-hub placeholder the closers mint, resolved to a
# real part only inside Blender's OWN `resolve_endpoint()` at render time), never a BoM word's
# DISPLAY name (which is always authored Title Case with spaces, e.g. 'Piping Network',
# 'Hoogendoorn iSii Process Computer'). Found empirically (2026-07-04) replaying this fix
# against real BESS artefacts: 'pcs' / 'bms_ctrl' / 'rack_block' each fail (or ambiguously
# multi-match) _resolve_to_valid_name, and — being internal ids this post-hoc pass has no
# visibility into via the word-tree alone — must NEVER be dropped nor guessed at; the only
# safe action is to leave the reference exactly as authored (a no-op for that endpoint).
_INTERNAL_ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$")


def _row_keep_decisions(rows, valid_names):
    """Per-row (keep: bool, canon_from, canon_to, bad_name_or_None) decisions against the
    CURRENT valid-part-name set — the ONE resolution pass shared by prune_dangling_rows
    (connection-ledger.json / connection-schedule.json `rows`) and prune_indexed_schedule
    (connection-schedule.json's INDEX-PARALLEL `specs`/`out_of_spec`/`upsized`/
    `design_feedback`, which must be pruned by the identical index decision as `rows` or the
    two arrays drift out of lockstep). Four outcomes per endpoint, in order: (1) an explicit
    abstract battery-limit boundary (_ABSTRACT_BOUNDARY_RE) is kept as-is; (2) an endpoint
    that UNIQUELY resolves to a real part (exact name, or the SAME token-subset rule the
    exporter's phantom-reference resolver uses) is kept, canonicalised to the resolved name;
    (3) a bare lowercase/snake_case topology-internal id that does NOT uniquely resolve
    (_INTERNAL_ID_RE) is kept UNCHANGED — this pass has no visibility into Blender's own
    topology-id resolution, so the only safe action is a no-op, never a guess or a drop;
    (4) anything else resolving to NOTHING is a genuinely dangling DISPLAY-name reference —
    the row is dropped."""
    index = _build_valid_index(valid_names)

    def _canon(name):
        if not name:
            return None
        s = str(name)
        if _ABSTRACT_BOUNDARY_RE.search(s):
            return name
        resolved = _resolve_to_valid_name(name, index)
        if resolved:
            return resolved
        if _INTERNAL_ID_RE.fullmatch(re.sub(r"\[\d+\]$", "", s.strip())):
            return name   # can't verify a topology-internal id — leave unchanged, never drop
        return None

    out = []
    for r in (rows or []):
        frm, to = _row_endpoints(r)
        cfrm, cto = _canon(frm), _canon(to)
        if cfrm and cto:
            out.append((True, cfrm, cto, None))
        else:
            out.append((False, cfrm, cto, frm if not cfrm else to))
    return out


def prune_dangling_rows(rows, valid_names, log=print, context=""):
    """Split `rows` (either connection-ledger.json's from_part/to_part rows or
    connection-schedule.json's from/to rows) into (kept, dropped) against a CURRENT set of
    real part names — see _row_keep_decisions for the per-endpoint resolution rule. A kept
    row with a re-homed endpoint is REWRITTEN to the resolved name; `dropped` mirrors
    finalize_ledger's own dropped schema. Pure; idempotent (a ledger already consistent with
    valid_names returns dropped=[] and rewrites nothing)."""
    decisions = _row_keep_decisions(rows, valid_names)
    kept, dropped = [], []
    for r, (keep, cfrm, cto, bad) in zip((rows or []), decisions):
        if keep:
            frm, to = _row_endpoints(r)
            if cfrm != frm or cto != to:
                r = dict(r)
                _set_row_endpoints(r, cfrm, cto)
            kept.append(r)
        else:
            frm, to = _row_endpoints(r)
            dropped.append({"from": frm, "to": to, "mechanism": r.get("mechanism") if isinstance(r, dict) else None,
                             "reason": f"endpoint '{bad}' no longer resolves to any real part in "
                                       f"the settled design (removed downstream of ledger "
                                       f"authoring — scope-word demotion / fold / merge)"})
    if dropped:
        log(f"[ledger] reconcile{f' ({context})' if context else ''}: dropped {len(dropped)} "
            f"row(s) whose endpoint no longer resolves to any real part in the settled design")
    return kept, dropped


def prune_indexed_schedule(sched, valid_names, log=print):
    """connection-schedule.json's `rows` (BoM-costed) and `specs` (sizing detail) are
    authored INDEX-PARALLEL by write_connection_schedule — one entry per physical run in
    lockstep, `specs[i]` describing the SAME run as `rows[i]`. Pruning `rows` alone (as
    prune_dangling_rows does) would silently desynchronise the two arrays — `specs[i]` would
    then describe a DIFFERENT run than `rows[i]` for every index after a drop. This applies
    the identical per-index keep/drop/re-home decision (drawn once from `rows`) to `specs`
    AND, defensively, to any other top-level list of the SAME original length
    (`out_of_spec` / `upsized` / `design_feedback` — always empty in practice as of
    2026-07-04, but future-proofed rather than assumed empty forever) — re-homing each
    item's own from_part/to_part when present, using the SAME resolved endpoints. Returns
    (new_sched, dropped)."""
    rows = list(sched.get("rows") or [])
    n = len(rows)
    decisions = _row_keep_decisions(rows, valid_names)
    dropped = []
    for r, (keep, cfrm, cto, bad) in zip(rows, decisions):
        if not keep:
            frm, to = _row_endpoints(r)
            dropped.append({"from": frm, "to": to, "mechanism": r.get("mechanism") if isinstance(r, dict) else None,
                             "reason": f"endpoint '{bad}' no longer resolves to any real part in "
                                       f"the settled design (removed downstream of ledger "
                                       f"authoring — scope-word demotion / fold / merge)"})
    new_sched = dict(sched)
    for key in ("rows", "specs", "out_of_spec", "upsized", "design_feedback"):
        arr = sched.get(key)
        if not isinstance(arr, list) or len(arr) != n:
            continue
        new_arr = []
        for item, (keep, cfrm, cto, _bad) in zip(arr, decisions):
            if not keep:
                continue
            if isinstance(item, dict) and (item.get("from_part") is not None or item.get("to_part") is not None
                                            or item.get("from") is not None or item.get("to") is not None):
                ifrm, ito = _row_endpoints(item)
                if cfrm != ifrm or cto != ito:
                    item = dict(item)
                    _set_row_endpoints(item, cfrm, cto)
            new_arr.append(item)
        new_sched[key] = new_arr
    if dropped:
        log(f"[ledger] reconcile (connection-schedule.json): dropped {len(dropped)} row(s) "
            f"(+ its index-parallel specs/out_of_spec/upsized/design_feedback entries) whose "
            f"endpoint no longer resolves to any real part in the settled design")
    return new_sched, dropped


def reconcile_ledger_with_parts(ledger, valid_names, log=print):
    """Re-validate an ALREADY-WRITTEN connection-ledger.json dict against the CURRENT
    valid-part-name set. Returns (new_ledger, n_changed): new_ledger is a FRESH dict with
    `rows`/`dropped`/`count`/`adjacency`/`referential_integrity` rebuilt from the surviving
    (and possibly re-homed) rows (via the SAME build_adjacency / audit_referential_integrity
    the original authoring pass used, so the schema is byte-identical to a clean initial
    build) and any `completeness` concern naming a now-gone part removed (that part no
    longer exists to be incomplete). `n_changed` counts DROPPED rows only (re-homed rows are
    kept, so they don't need a `state.json` re-render to reconcile — but a re-home still
    counts as a write, tracked via the returned ledger being distinct from the input).
    Pure + idempotent: a ledger already fully resolved against valid_names round-trips with
    n_changed=0 and IS the same object (no rewrite)."""
    rows = list(ledger.get("rows") or [])
    kept, newly_dropped = prune_dangling_rows(rows, valid_names, log=log, context="connection-ledger.json")
    if not newly_dropped and kept == rows:
        return ledger, 0

    dropped = list(ledger.get("dropped") or []) + newly_dropped
    new_ledger = dict(ledger)
    new_ledger["rows"] = kept
    new_ledger["dropped"] = dropped
    new_ledger["count"] = len(kept)
    new_ledger["adjacency"] = build_adjacency(kept)

    comp = dict(ledger.get("completeness") or {})
    concerns = comp.get("concerns")
    if isinstance(concerns, list):
        valid = {_norm_name(n) for n in (valid_names or ()) if n}
        kept_concerns = [c for c in concerns
                         if _norm_name(c.get("part") if isinstance(c, dict) else None) in valid]
        if len(kept_concerns) != len(concerns):
            comp = dict(comp)
            comp["concerns"] = kept_concerns
            comp["n_concerns"] = len(kept_concerns)
    new_ledger["completeness"] = comp

    part_names = {p for r in kept for p in _row_endpoints(r) if p}
    violations = audit_referential_integrity(kept, part_names, log=lambda *a: None)
    new_ledger["referential_integrity"] = {"n_violations": len(violations), "violations": violations}
    return new_ledger, len(newly_dropped)


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

    # ── AIR-MOVER MEDIUM OVERRIDE (2026-07-10, run-22 DN100 water pipes on fan edges) ──
    # (second endpoint deliberately shares NO 4-gram with the fan — the fixture's loose
    # resolver would otherwise self-loop 'Vent Panels' onto 'Ventilation Fan')
    air_parts = parts + [_P("Active Ventilation Fan"), _P("Exhaust Louvre Assembly")]
    air_topo = [
        {"from_part": "Active Ventilation Fan", "to_part": "Exhaust Louvre Assembly",
         "mechanism": "fluid_loop"},                                   # endpoint noun → air
        {"from_part": "Recirc Pump", "to_part": "Rearing Tank",
         "mechanism": "fluid_loop", "fluid": {"medium": "air"}},       # declared medium → air
        {"from_part": "Rearing Tank", "to_part": "Rotary Drum Filter",
         "mechanism": "fluid_loop"},                                   # genuine water — untouched
    ]
    air_final, _ = finalize_ledger(air_topo, air_parts, resolve, log=lambda *a: None)
    _svc = {(e["from_part"], e["to_part"]): e.get("service") or e.get("_ledger_service")
            for e in air_final}
    assert any(v == "air" for k, v in _svc.items() if "Fan" in (k[0] or "")), \
        f"fan edge must author as AIR service, got {_svc}"
    assert any(v == "air" for k, v in _svc.items() if "Pump" in (k[0] or "")), \
        "a declared medium:air edge must author as AIR even between wet-named parts"
    assert any(v == "water" for k, v in _svc.items() if "Rearing Tank" in (k[0] or "")), \
        "a genuine water edge must stay WATER (no false positive)"
    # AIR-BREATHING completeness exemption: an air-cooled part with an AIR tie + a
    # conduction water-out must NOT be flagged for a missing piped water inlet; a
    # pure water part missing its input is still flagged (strict rule unchanged).
    _ab_parts = [_P("Power Semiconductors"), _P("Cooling Plate"), _P("Recirc Pump"), _P("Rearing Tank")]
    _ab_topo = [
        {"from_part": "Power Semiconductors", "to_part": "Cooling Plate",
         "mechanism": "fluid_loop", "_ledger_service": "water"},
        {"from_part": "Power Semiconductors", "to_part": "Cooling Plate",
         "mechanism": "air_flow", "_ledger_service": "air"},
        {"from_part": "Recirc Pump", "to_part": "Rearing Tank", "mechanism": "fluid_loop"},
    ]
    _ab = audit_completeness(_ab_parts, _ab_topo, lambda nm, mod, fn: {"water"},
                             log=lambda *a: None)
    _ab_names = {c["part"] for c in _ab}
    assert "Power Semiconductors" not in _ab_names, \
        f"an air-breathing part must not need a piped water inlet (got {_ab})"
    assert "Recirc Pump" in _ab_names, \
        "a pure water part missing its input must STILL be flagged"

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

    # NAME-FORMAT-INSENSITIVE completeness proveCatch (2026-07-06, CO2-mineralisation
    # 'CaCO3 hot-air dryer' false concern): a part fully wired under one string ('caco3
    # hot air dryer', the wiring-time name) must NOT be flagged an orphan merely because
    # the `parts` list carries a differently-CASED/PUNCTUATED display name for the same
    # equipment ('CaCO3 hot-air dryer') — both directions proven.
    class _PD:
        def __init__(self, name, mod="mass_fluid_transport_process"):
            self.name, self.module_id, self.function = name, mod, ""
    drift_topo = [
        {"from_part": "stirred carbonation reactor", "to_part": "caco3 hot air dryer",
         "mechanism": "fluid_loop"},
        {"from_part": "caco3 hot air dryer", "to_part": "filter vacuum pump",
         "mechanism": "fluid_loop"},
    ]
    drift_parts = [_PD("CaCO3 hot-air dryer"), _PD("stirred carbonation reactor"),
                   _PD("filter vacuum pump")]
    drift_concerns = audit_completeness(drift_parts, drift_topo, req_svc, log=lambda *a: None)
    assert not any(c["part"] == "CaCO3 hot-air dryer" for c in drift_concerns), \
        (f"a part wired under a case/hyphen-drifted name string must not be flagged an "
         f"orphan — got {drift_concerns}")
    # proveCatch direction 2: a part of the SAME (drifted) name that is genuinely
    # unwired — no edges anywhere in the topology under any spelling — must still fail.
    orphan_concerns = audit_completeness(
        [_PD("CaCO3 hot-air dryer")], [], req_svc, log=lambda *a: None)
    assert any(c["part"] == "CaCO3 hot-air dryer" and
               {"fluid-input", "fluid-output"} <= set(c["missing"]) for c in orphan_concerns), \
        (f"a genuinely unwired part must still be flagged missing both directions — "
         f"got {orphan_concerns}")

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

    # close_flow_directions COOLANT-LOOP material_context proveCatch (2026-07-06, the
    # BESS liquid-cooling-loop material fix): a direction-closed tie between two
    # coolant-loop-named parts (a chiller / cold plate manifold / cooling pump /
    # expansion tank) must carry a coolant/glycol-identifying material_context, NOT the
    # bland generic placeholder — connection_sizing.coolant_service_material reads this
    # exact string to pick stainless (hard run) / EPDM hose (branch drop) instead of
    # defaulting to a fabricated carbon-steel pipe. Counter-case proves the widening is
    # NOT a blanket "always tag coolant" — a plain non-coolant process-fluid tie (Drum
    # Filter -> Biofilter, tested above) still gets the generic placeholder.
    ccparts = [_PR("Liquid Cooling Chiller", 0), _PR("Cold Plate Manifold", 1),
               _PR("Expansion Tank", 2)]
    cctopo = [{"from_part": "Liquid Cooling Chiller", "to_part": "Cold Plate Manifold",
               "mechanism": "fluid_loop"},
              {"from_part": "Expansion Tank", "to_part": "Cold Plate Manifold",
               "mechanism": "fluid_loop"}]   # Expansion Tank has an output but no input
    cclosed = close_flow_directions(ccparts, cctopo, log=lambda *a: None)
    _ct_edge = next((e for e in cclosed if e["to_part"] == "Expansion Tank"), None)
    assert _ct_edge is not None, f"Expansion Tank (needs an input) must be fed; got {cclosed}"
    assert "coolant/glycol service" in _ct_edge["material_context"], (
        f"a direction-closed tie touching a coolant-loop-named part must carry a "
        f"coolant/glycol-identifying material_context, not the bland generic "
        f"placeholder; got {_ct_edge['material_context']!r}")
    assert "process-flow input" not in _ct_edge["material_context"], (
        f"coolant-loop tie must NOT fall back to the generic placeholder; "
        f"got {_ct_edge['material_context']!r}")
    # counter-case: the earlier Degasser-fed-from-Biofilter tie (neither part named a
    # coolant-loop component) must still carry the ORIGINAL generic placeholder —
    # the widening is keyed on vocabulary, never a blanket change.
    _degasser_edge = next(e for e in closed if e["to_part"] == "Degasser")
    assert _degasser_edge["material_context"] == \
        "process-flow input (direction-closer: nearest upstream)", (
        f"a non-coolant process-fluid tie must keep the original generic "
        f"placeholder unchanged; got {_degasser_edge['material_context']!r}")

    # redirect_steam_to_reboiler proveCatch (2026-07-06, the L&V-flagged CO2-mineralisation
    # mis-wire): a steam generator's authored edge to a bare separation VESSEL must be
    # re-homed onto the plant's real reboiler-named part.
    rparts = [_PR("Electric Steam Generator", 60), _PR("Distillation Reboiler", 30),
              _PR("MEA Stripper Reboil Pot", 20), _PR("Packed Absorber Column", 45)]
    rtopo = [{"from_part": "Electric Steam Generator", "to_part": "Packed Absorber Column",
              "mechanism": "thermal"}]
    n_redirected = redirect_steam_to_reboiler(rtopo, rparts, log=lambda *a: None)
    assert n_redirected == 1 and rtopo[0]["to_part"] == "Distillation Reboiler", \
        f"steam→absorber must redirect to the reboiler; got n={n_redirected} edge={rtopo[0]}"
    # idempotent — a second pass over the now-correct edge changes nothing.
    assert redirect_steam_to_reboiler(rtopo, rparts, log=lambda *a: None) == 0, \
        "a second redirect pass over an already-correct edge must be a no-op"
    # counter-case: NO reboiler-named part in the plant → never invents a target.
    no_reboiler_parts = [_PR("Electric Steam Generator", 60), _PR("Packed Absorber Column", 45)]
    no_reboiler_topo = [{"from_part": "Electric Steam Generator", "to_part": "Packed Absorber Column",
                         "mechanism": "thermal"}]
    assert redirect_steam_to_reboiler(no_reboiler_topo, no_reboiler_parts, log=lambda *a: None) == 0, \
        "with no reboiler-named part present, the edge must be left untouched (never fabricate a target)"
    assert no_reboiler_topo[0]["to_part"] == "Packed Absorber Column"
    # counter-case: a legitimate steam tie to a real process vessel with NO reboiler
    # present at all is untouched (already covered above); a legitimate tie that is NOT
    # to a bare separation vessel (e.g. a jacketed reactor) must also survive unchanged.
    non_vessel_parts = [_PR("Electric Steam Generator", 60), _PR("Distillation Reboiler", 30),
                        _PR("Jacketed Reactor", 20)]
    non_vessel_topo = [{"from_part": "Electric Steam Generator", "to_part": "Jacketed Reactor",
                        "mechanism": "thermal"}]
    assert redirect_steam_to_reboiler(non_vessel_topo, non_vessel_parts, log=lambda *a: None) == 0, \
        "a steam tie to a non-vessel-named part (not the mis-wire signature) must be left alone"
    assert non_vessel_topo[0]["to_part"] == "Jacketed Reactor"

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

    # proveCatch — the V-111/Pressure-Vessels thread (Tristan 2026-07-04): an EARLIER,
    # less-careful closer left a fluid edge terminating on switch/control gear ('Fresh
    # Water Tank -> Mains Incomer') sitting in the candidate topology. finalize_ledger
    # would drop that edge as a service-domain mismatch — but close_residual_completeness
    # ran BEFORE finalize_ledger and, without this guard, would have trusted 'Mains
    # Incomer' as a legitimate fluid consumer and picked it for an UNRELATED output-less
    # part too ('Pressure Vessels'), a pick finalize_ledger would ALSO drop — leaving
    # Pressure Vessels' completeness gap unfilled despite the closer's own "cannot miss a
    # gap it leaves" guarantee. The closer must never propose a switch/control-gear
    # endpoint for a fluid pick, even when a bad peer edge suggests one is available.
    _gparts = [_PR("Pressure Vessels", 2)]
    _gtopo = [{"from_part": "Fresh Water Tank", "to_part": "Mains Incomer", "mechanism": "fluid_loop"},
              {"from_part": "Piping Manifold", "to_part": "Pressure Vessels", "mechanism": "fluid_loop"}]
    _gres = close_residual_completeness(_gparts, _gtopo, lambda n, m, f: {"water"}, log=lambda *a: None)
    _g_edge = next((e for e in _gres if e["from_part"] == "Pressure Vessels"), None)
    assert _g_edge is not None, \
        "residual closer must still give Pressure Vessels an output (some pick, not silence)"
    assert not SWITCH_CONTROL_GEAR_RE.search(_g_edge["to_part"]), \
        (f"residual closer picked switch/control gear {_g_edge['to_part']!r} as a fluid "
         f"consumer — finalize_ledger will drop this edge and the completeness gap "
         f"resurfaces (got {_gres})")
    assert _g_edge["to_part"] == _BL_EXPORT, \
        (f"with no legitimate in-plant consumer left (Mains Incomer excluded), the "
         f"closer must fall to the battery-limit export, not silently vanish "
         f"(got {_g_edge['to_part']!r})")
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

    # proveCatch — plan-XY nearest partner when placement is present (Codema 1538):
    # rank-only "nearest" would pick a far same-rank consumer across the plant;
    # with placed_xyz_mm the closer must pick the geographically nearest consumer.
    class _Placed:
        def __init__(self, name, rank, xy, mod="m"):
            self.name, self.module_id, self.function = name, mod, ""
            self.region_rank = rank
            self.placed_xyz_mm = (xy[0], xy[1], 0.0)
    _pparts = [
        _Placed("Oxygen Dosing Pump", 5, (10000.0, 1500.0)),
        _Placed("Nearby Softener", 5, (10500.0, 1600.0)),  # close in XY, same rank
        _Placed("Far Drain Sump", 5, (-7000.0, 0.0)),       # same rank, far XY
    ]
    # Seed consumers via inbound edges; pump has an input so it needs an output.
    _ptopo_xy = [
        {"from_part": "A", "to_part": "Nearby Softener", "mechanism": "fluid_loop"},
        {"from_part": "B", "to_part": "Far Drain Sump", "mechanism": "fluid_loop"},
        {"from_part": "C", "to_part": "Oxygen Dosing Pump", "mechanism": "fluid_loop"},
    ]
    _pres = close_residual_completeness(
        _pparts, _ptopo_xy, lambda n, m, f: {"water"}, log=lambda *a: None)
    _p_edge = next((e for e in _pres if e["from_part"] == "Oxygen Dosing Pump"), None)
    assert _p_edge is not None, "placed residual closer must still terminate the pump output"
    assert _p_edge["to_part"] == "Nearby Softener", (
        f"with placed_xyz_mm the residual closer must pick the plan-nearest consumer "
        f"(Nearby Softener), not the far same-rank Far Drain Sump — got {_p_edge['to_part']!r}"
    )

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

    # ── CO2-v1 'Line & velocity' fix (2026-07-05): '_m3_per_hour' unit-spelling family +
    # generic-tail stripping ('MEA Circulation Pump' -> the 'mea_circulation' stream the
    # contract actually named). proveCatch both the new match AND that it doesn't over-reach.
    _q_co2 = {"mea_circulation_m3_per_hour": 0.68, "flue_gas_flow_m3_per_hour": 225}
    assert _flow_qty_for_part("MEA Circulation Pump", _q_co2) == ("mea_circulation_m3_per_hour", 0.68), \
        (f"flow-join: a bare-unit '_m3_per_hour' stream quantity must match its equipment "
         f"via the generic-tail-stripped subject; got {_flow_qty_for_part('MEA Circulation Pump', _q_co2)}")
    # the bare-unit suffix also matches a verb-qualified sibling without stripping:
    assert _flow_qty_for_part("Flue Gas Flow", _q_co2) == ("flue_gas_flow_m3_per_hour", 225.0), \
        "flow-join: '_m3_per_hour' (bare, no verb stem) must be a recognised suffix spelling"
    # a part whose tail noun ISN'T generic (no equipment-type tail) must not be stripped —
    # 'MEA Distillation Column' -> strip 'column' -> 'mea_distillation', which matches
    # NOTHING in _q_co2 (honestly None, no fabricated match to the unrelated MEA stream):
    assert _flow_qty_for_part("MEA Distillation Column", _q_co2) is None, \
        "flow-join: a stripped subject with no real quantity must stay honestly None"
    # _strip_generic_tail itself: never strips to nothing, never strips a non-generic tail.
    assert _strip_generic_tail("mea_circulation_pump") == "mea_circulation"
    assert _strip_generic_tail("pump") is None, "flow-join: must not strip a single-token name to nothing"
    assert _strip_generic_tail("mea_distillation_column") == "mea_distillation"
    assert _strip_generic_tail("k2so4_recrystalliser") is None, \
        "flow-join: a non-generic tail noun (not in _GENERIC_TAIL_NOUNS) must not be stripped"

    # ── POWER-DEMAND JOIN (the v79 bms_ctrl→chiller/coldplatemanifold "Line & velocity"
    # 3-rows-fail fix) — same three proveCatch shapes as the flow twin + the sibling-
    # destination fallback the electrical case needed. ──────────────────────────────────
    pq = {"softener_pump_current_a": 12.4}
    pt = [
        # destination demand governs:
        {"from_part": "Mains Incomer", "to_part": "Softener Pump",
         "mechanism": "electrical_bus", "constraint_kind": "current_rating"},
        # sibling-destination fallback: 'chiller' is a role-token substring of the
        # already-rated 'Liquid Cooling Chiller' fed elsewhere in the SAME topology —
        # copy that device's own already-established demand, never invent a new one.
        {"from_part": "Dc Busbar 1500 V", "to_part": "Liquid Cooling Chiller",
         "mechanism": "electrical_bus", "constraint_kind": "power_feed",
         "required_value": 15, "required_unit": "A"},
        {"from_part": "Bms Ctrl", "to_part": "chiller",
         "mechanism": "electrical_bus", "constraint_kind": "power_feed"},
        # NO-FABRICATION counter-case: a passive device with no contract current AND no
        # established sibling demand anywhere (a coolant manifold draws no current) must
        # stay honestly None — never guessed at.
        {"from_part": "Bms Ctrl", "to_part": "coldplatemanifold",
         "mechanism": "electrical_bus", "constraint_kind": "power_feed"},
        # an authored rating is NEVER overwritten:
        {"from_part": "Grid Pcc Metering Ct", "to_part": "Step-Up Transformer",
         "mechanism": "electrical_bus", "constraint_kind": "current_rating",
         "required_value": 15, "required_unit": "A"},
        # a NON-electrical edge is untouched even when its endpoints carry current qty:
        {"from_part": "Softener Pump", "to_part": "Storage Tank", "mechanism": "fluid_loop"},
    ]
    npj = join_power_demands(pt, pq, log=lambda *a: None)
    assert npj == 2, f"power-join: expected exactly 2 edges joined, got {npj}"
    assert pt[0]["required_value"] == 12.4 and "destination demand" in pt[0]["_power_join_basis"], \
        f"power-join: destination demand must govern; got {pt[0]}"
    assert pt[2]["required_value"] == 15 and pt[2]["required_unit"] == "A" and \
        "already-established demand" in pt[2]["_power_join_basis"], \
        f"power-join: sibling-destination fallback must copy the SAME device's real demand; got {pt[2]}"
    assert pt[3].get("required_value") is None, \
        "power-join: NO-FABRICATION violated — a non-power-consuming destination with no " \
        "sibling demand must stay None, never guessed"
    assert pt[4]["required_value"] == 15, "power-join: an authored rating must never be overwritten"
    assert pt[5].get("required_value") is None, "power-join: a non-electrical edge must be untouched"
    # finalize_ledger applies the power join unconditionally at the choke point (runs even
    # when quantities={} — the sibling fallback needs no contract quantities at all):
    fptopo = [
        {"from_part": "Dc Busbar 1500 V", "to_part": "Liquid Cooling Chiller",
         "mechanism": "electrical_bus", "constraint_kind": "power_feed",
         "required_value": 15, "required_unit": "A"},
        {"from_part": "Bms Ctrl", "to_part": "chiller", "mechanism": "electrical_bus",
         "constraint_kind": "power_feed"},
    ]
    fpparts = [_P("Dc Busbar 1500 V"), _P("chiller"), _P("Liquid Cooling Chiller"), _P("Bms Ctrl")]
    fpj, _ = finalize_ledger(list(fptopo), fpparts, resolve, log=lambda *a: None, quantities={})
    _bms_edge = next(e for e in fpj if e["from_part"] == "Bms Ctrl")
    assert _bms_edge["required_value"] == 15, \
        f"finalize_ledger must run the power join at its choke point; got {_bms_edge}"
    # PSEUDO-NODE GUARD proveCatch (the v79 near-miss caught replaying real bess-campaign-v11
    # data): '(busway)' is a GENERIC label reused by MULTIPLE unrelated trunks (one per
    # originating hub) — an unguarded sibling lookup keyed on that shared label would
    # cross-attribute one hub's small aux trunk onto a totally different hub's own real
    # trunk. Must NEVER match through a pseudo-node destination.
    ppt = [
        {"from_part": "Bms Ctrl", "to_part": "(busway)", "mechanism": "electrical_bus",
         "constraint_kind": "power_feed", "required_value": 15, "required_unit": "A"},
        {"from_part": "Dc Busbar 1500 V", "to_part": "(busway)", "mechanism": "electrical_bus",
         "constraint_kind": "power_feed"},
    ]
    npj2 = join_power_demands(ppt, {}, log=lambda *a: None)
    assert npj2 == 0 and ppt[1].get("required_value") is None, \
        (f"power-join: PSEUDO-NODE GUARD violated — a bare '(busway)' destination must never "
         f"sibling-match across unrelated trunks; got joined={npj2}, edge={ppt[1]}")
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

    # ── SOURCE KILL GUARD (2026-07-02): the scene augmenters may never again STAMP a
    # hardcoded flow unit onto an edge (the v55 phantom: an m³/h magnitude shipped as
    # 'm³/s' = ×3600). The choke-point canonicaliser above is the NET; this proves the
    # SOURCE stays fixed: no `required_unit = 'm³/s'`-style literal assignment exists in
    # build_universal_scene.py (inherited-unit assignments read a variable, not a literal).
    import os as _os
    _scene_src = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)),
                               "build_universal_scene.py")
    with open(_scene_src, "r", encoding="utf-8") as _sf:
        _src_txt = _sf.read()
    _stamps = re.findall(r"required_unit.{0,4}=\s*['\"]m[³^]?3?/s['\"]", _src_txt) \
        + re.findall(r"required_unit.{0,4}=\s*['\"]m³/s['\"]", _src_txt)
    assert not _stamps, (
        f"build_universal_scene.py stamps a hardcoded m³/s required_unit again — "
        f"the v55 ×3600 phantom source: {_stamps}")

    # ── SERVICE-BOUNDARY termini proveCatch (BESS cross-val 2026-07-03, both directions):
    # a contract edge ending on the dc service bus / thermal sink is a legitimate abstract
    # terminus (like 'atmosphere'), NOT a broken reference; a misspelled real-part
    # endpoint must STILL be flagged.
    _sb_topo = [
        {"from_part": "rack string fuse", "to_part": "dc_bus", "mechanism": "electrical_bus"},
        {"from_part": "PCS inverter", "to_part": "heat_rejection", "mechanism": "thermal"},
        {"from_part": "pump", "to_part": "Bufer Tank", "mechanism": "fluid_loop"},
    ]
    _sb_v = audit_referential_integrity(
        _sb_topo, ["rack string fuse", "PCS inverter", "pump", "Buffer Tank"],
        log=lambda *a: None)
    assert len(_sb_v) == 1 and _sb_v[0]["name"] == "Bufer Tank", (
        f"referential integrity must exempt service-boundary termini (dc_bus / "
        f"heat_rejection) while still flagging the misspelled part; got {_sb_v}")

    # ── close_actuator_host_ties proveCatch (2026-07-04, the X-124/FCV-201-202 orphan
    # diagnosis) — a synthetic 'actuation_kinematics' module shaped exactly like the real
    # Fischer Codema v76 state: one sub_module with an EXPLICIT `_actuator_of` host word
    # + 2 un-hosted siblings (sibling-group case), a SECOND sub_module with NO explicit
    # host anywhere (the honest V-107 diagnosis — must stay untouched), a MASSED valve
    # that must never be duplicated, and an ALREADY-CONNECTED valve that must be skipped.
    class _AP:
        def __init__(self, name):
            self.name = name
    _a_parts = [_AP("Softener Vessel"), _AP("Already Massed Valve")]
    _a_state = {"moduleDecomposition": {"modules": [{
        "module": "actuation_kinematics",
        "sub_modules": [
            {
                "id": "actuation_kinematics__solenoid_valves",
                "words": [
                    {"id": "solenoid_valves_word", "name_human": "Solenoid Valves"},
                    {"id": "actr_valve_on_softener_vessel_synth_word",
                     "name_human": "Inlet Flow Control Valve",
                     "_actuator_of": "softener_vessel_synth_word"},
                    {"id": "already_massed_valve_word", "name_human": "Already Massed Valve"},
                    {"id": "already_connected_valve_word", "name_human": "Already Connected Valve"},
                ],
            },
            {
                "id": "actuation_kinematics__solenoid_valve",
                "words": [
                    {"id": "solenoid_valve_word", "name_human": "Solenoid Valve"},
                    {"id": "pneumatic_control_valve_word", "name_human": "Pneumatic Control Valve"},
                ],
            },
        ],
    }, {
        "module": "mass_fluid_transport_process",
        "sub_modules": [{"id": "mass_fluid_transport_process__softener",
                          "words": [{"id": "softener_vessel_synth_word",
                                     "name_human": "Softener Vessel"}]}],
    }]}}
    _a_topo = [{"from_part": "Already Connected Valve", "to_part": "Softener Vessel",
                "mechanism": "signal"}]
    _a_extra = close_actuator_host_ties(_a_state, _a_parts, _a_topo, log=lambda *a: None)
    _a_pairs = {(e["from_part"], e["to_part"]) for e in _a_extra}
    assert ("Softener Vessel", "Inlet Flow Control Valve") in _a_pairs, (
        f"EXPLICIT _actuator_of host must be tied (FCV-201-202 case); got {_a_extra}")
    assert ("Softener Vessel", "Solenoid Valves") in _a_pairs, (
        f"SIBLING-GROUP fallback must tie an un-hosted valve in the SAME sub_module as an "
        f"explicitly-hosted one (X-124 case); got {_a_extra}")
    assert not any(e["to_part"] == "Solenoid Valve" for e in _a_extra), (
        f"a valve in a sub_module with NO explicit host anywhere (V-107) must NOT be "
        f"guessed a host — never invent a connection; got {_a_extra}")
    assert not any(e["to_part"] == "Already Massed Valve" for e in _a_extra), (
        "a word already present in `parts` (successfully massed) must be left to the "
        "normal closers, never duplicated by the actuator-host closer"
    )
    assert not any(e["to_part"] == "Already Connected Valve" for e in _a_extra), (
        "a word already carrying an edge in the candidate topology must be skipped "
        "(no duplicate tie)"
    )
    # re-run is idempotent (pure function of state+parts+topology, no hidden state).
    _a_extra2 = close_actuator_host_ties(_a_state, _a_parts, _a_topo, log=lambda *a: None)
    assert _a_extra == _a_extra2, "close_actuator_host_ties must be deterministic/idempotent"

    # ── reconcile_ledger_with_parts proveCatch (2026-07-04, the 'Piping Network' trace-layer
    # ghost) — BOTH directions: a demoted word's ledger references are cleaned (dropped +
    # adjacency/referential-integrity/completeness rebuilt); a real part's references are
    # left byte-untouched (no rebuild triggered when nothing is dangling).
    _rl_ledger = {
        "schema": "connection-ledger/1", "count": 3,
        "rows": [
            {"from_part": "Gac Softener", "to_part": "Softener Vessel", "mechanism": "fluid_loop",
             "service": "water"},
            {"from_part": "Motor Control Center", "to_part": "Piping Network",
             "mechanism": "electrical_bus", "service": "power"},
            {"from_part": "Piping Network", "to_part": "Process Computer",
             "mechanism": "signal", "service": "signal"},
        ],
        "dropped": [],
        "completeness": {"n_concerns": 1,
                         "concerns": [{"part": "Piping Network", "missing": ["fluid input"]}]},
        "adjacency": {}, "referential_integrity": {},
    }
    # (a) CATCH: 'Piping Network' was demoted (removed from the word tree) downstream of
    # ledger authoring — its edges must be pruned and every derived structure rebuilt clean.
    _rl_valid = {"Gac Softener", "Softener Vessel", "Motor Control Center", "Process Computer"}
    _rl_new, _rl_n = reconcile_ledger_with_parts(_rl_ledger, _rl_valid, log=lambda *a: None)
    assert _rl_n == 2, f"both Piping Network edges must be pruned; got n_pruned={_rl_n}"
    assert {(_row_endpoints(r)) for r in _rl_new["rows"]} == {("Gac Softener", "Softener Vessel")}, \
        f"the real edge must survive and the two ghost edges must be gone; got {_rl_new['rows']}"
    assert _rl_new["count"] == 1, f"count must reflect the surviving rows only; got {_rl_new['count']}"
    assert "Piping Network" not in _rl_new["adjacency"], \
        f"the demoted word must not remain as an adjacency node; got {list(_rl_new['adjacency'])}"
    assert _rl_new["completeness"]["n_concerns"] == 0, \
        "a completeness concern naming a now-gone part must be dropped too (nothing left to be incomplete)"
    assert len(_rl_new["dropped"]) == 2 and all("Piping Network" in (d["from"] or "") + (d["to"] or "")
                                                for d in _rl_new["dropped"][-2:]), \
        f"both drops must be recorded with transparency; got {_rl_new['dropped']}"
    # (b) NO FALSE CATCH: a ledger with no dangling reference is untouched — n_pruned=0 and
    # the SAME object is returned (no spurious rebuild / no drift on a clean ledger).
    _rl_clean = {"rows": [{"from_part": "Gac Softener", "to_part": "Softener Vessel",
                           "mechanism": "fluid_loop", "service": "water"}],
                 "dropped": [], "completeness": {"n_concerns": 0, "concerns": []},
                 "adjacency": {}, "referential_integrity": {}}
    _rl_same, _rl_n0 = reconcile_ledger_with_parts(_rl_clean, _rl_valid, log=lambda *a: None)
    assert _rl_n0 == 0 and _rl_same is _rl_clean, \
        "a ledger with every endpoint still real must round-trip untouched (idempotent, no false catch)"
    # (c) an abstract battery-limit boundary endpoint is NEVER treated as dangling even
    # though it names no real part.
    _rl_boundary = {"rows": [{"from_part": "Fresh Water Tank", "to_part": "utility incomer",
                              "mechanism": "electrical_bus", "service": "power"}],
                    "dropped": [], "completeness": {}, "adjacency": {}, "referential_integrity": {}}
    _rl_bnew, _rl_bn = reconcile_ledger_with_parts(_rl_boundary, {"Fresh Water Tank"}, log=lambda *a: None)
    assert _rl_bn == 0, f"an explicit abstract boundary terminus must never be pruned as dangling; got {_rl_bn}"

    # (d) RE-HOME, DON'T DROP: an endpoint that is an ABBREVIATED/relabelled form of a
    # CURRENT real part (its tokens a subset of the real part's, short tokens matching by
    # PREFIX — the SAME rule build-excel-export.py's phantom-reference resolver already
    # uses: 'bm'⊂'bms', 'pc'⊂'pcs') is rewritten to the real part's name and the row KEPT —
    # dropping it would destroy real connectivity data just because a downstream pass
    # shortened/reworded the name. Distinct from (a): 'Piping Network' has NO subset
    # relationship to any real part and is correctly dropped; 'Pc Inverter' IS a
    # prefix-subset of 'Pcs Inverter Module' and must be re-homed instead.
    _rh_ledger = {"rows": [{"from_part": "Pc Inverter", "to_part": "Rack String Fuse",
                            "mechanism": "signal"}],
                 "dropped": [], "completeness": {}, "adjacency": {}, "referential_integrity": {}}
    _rh_new, _rh_n = reconcile_ledger_with_parts(
        _rh_ledger, {"Pcs Inverter Module", "Rack String Fuse"}, log=lambda *a: None)
    assert _rh_n == 0, f"a resolvable abbreviation must NOT be counted as a drop; got n={_rh_n}"
    assert _row_endpoints(_rh_new["rows"][0]) == ("Pcs Inverter Module", "Rack String Fuse"), \
        f"'Pc Inverter' must re-home to the real part's current name, row kept; got {_rh_new['rows']}"
    # a reference carrying tokens the real part does NOT have (more specific than any
    # current part — e.g. a manufacturer+model detail that was later genericised) is a
    # genuine miss, not an abbreviation, and is still dropped.
    _rh_miss = {"rows": [{"from_part": "Toray HFU-2020AN RO Membrane Elements",
                          "to_part": "Cloth Filter", "mechanism": "fluid_loop"}],
               "dropped": [], "completeness": {}, "adjacency": {}, "referential_integrity": {}}
    _rh_mnew, _rh_mn = reconcile_ledger_with_parts(
        _rh_miss, {"Ro Membrane Elements", "Cloth Filter"}, log=lambda *a: None)
    assert _rh_mn == 1, (
        f"a reference with EXTRA tokens no real part carries (manufacturer+model detail "
        f"the design later genericised) is a genuine miss, not an abbreviation — must "
        f"still be dropped; got n={_rh_mn}")

    # (e) AMBIGUOUS BARE TOKEN — NEVER GUESS, NEVER DROP (2026-07-04, the real BESS
    # regression found replaying this fix against bess-crossval-v1/v2 before this fix:
    # 'pcs' subset-matched ALL of 'PCS Inverter Module' / 'PCS Cooling Fan Tray' / 'PCS DC
    # Surge Arrester' and the exporter-style shortest-wins tie-break silently picked the
    # WRONG one — a mis-attributed connection, worse than either an honest drop or a no-op).
    # 'bms_ctrl' / 'rack_block' are bare lowercase/snake_case topology-internal ids this
    # pass cannot verify at all — must be left UNCHANGED, not dropped.
    _amb_valid = {"PCS Inverter Module", "PCS Cooling Fan Tray", "PCS DC Surge Arrester",
                  "Rack String Fuse"}
    _amb_ledger = {"rows": [
        {"from_part": "rack_block", "to_part": "pcs", "mechanism": "electrical_bus"},
        {"from_part": "bms_ctrl", "to_part": "Rack String Fuse", "mechanism": "electrical_bus"},
    ], "dropped": [], "completeness": {}, "adjacency": {}, "referential_integrity": {}}
    _amb_new, _amb_n = reconcile_ledger_with_parts(_amb_ledger, _amb_valid, log=lambda *a: None)
    assert _amb_n == 0, (
        f"an ambiguous bare-token / topology-internal-id endpoint must NEVER be dropped "
        f"(no confident diagnosis, so no action) — got n_pruned={_amb_n}, dropped={_amb_new.get('dropped')}")
    assert _row_endpoints(_amb_new["rows"][0]) == ("rack_block", "pcs"), (
        f"'pcs' is ambiguous among 3 PCS-prefixed parts — must be left UNCHANGED (never "
        f"guessed at via shortest-wins); got {_amb_new['rows'][0]}")
    assert _row_endpoints(_amb_new["rows"][1]) == ("bms_ctrl", "Rack String Fuse"), (
        f"'bms_ctrl' is a topology-internal id with no real-part match at all — left "
        f"unchanged, the real 'Rack String Fuse' endpoint untouched; got {_amb_new['rows'][1]}")

    # (f) an INDEXED INSTANCE reference ('rack[0]', 'rack[7]', …) is likewise never dropped
    # nor mis-resolved to an unrelated same-brand-token part — Blender's own qty-N
    # replication naming is invisible to this word-tree-only pass.
    _idx_ledger = {"rows": [{"from_part": "bms_ctrl", "to_part": "rack[3]", "mechanism": "electrical_bus"}],
                  "dropped": [], "completeness": {}, "adjacency": {}, "referential_integrity": {}}
    _idx_new, _idx_n = reconcile_ledger_with_parts(
        _idx_ledger, {"Rack String Fuse", "Steel Rack Frame"}, log=lambda *a: None)
    assert _idx_n == 0 and _row_endpoints(_idx_new["rows"][0]) == ("bms_ctrl", "rack[3]"), (
        f"an indexed instance reference must be left exactly as authored, never dropped "
        f"nor resolved to an unrelated rack-brand part; got n={_idx_n} row={_idx_new['rows']}")

    # prune_dangling_rows also handles connection-schedule.json's from/to schema (distinct
    # key names from connection-ledger.json's from_part/to_part) with the SAME authority.
    _sched_rows = [
        {"from": "Motor Control Center", "to": "Piping Network", "mechanism": "electrical_bus"},
        {"from": "Gac Softener", "to": "Softener Vessel", "mechanism": "fluid_loop"},
    ]
    _sk, _sd = prune_dangling_rows(_sched_rows, _rl_valid, log=lambda *a: None)
    assert len(_sk) == 1 and _row_endpoints(_sk[0]) == ("Gac Softener", "Softener Vessel"), \
        f"the from/to schedule schema must resolve identically to from_part/to_part; got {_sk}"
    assert len(_sd) == 1, f"exactly the Piping Network row must be dropped; got {_sd}"

    # prune_indexed_schedule proveCatch (2026-07-04, the connection-schedule.json 'specs'
    # lockstep bug found empirically replaying this fix on codema v77 — `specs[i]` describes
    # the SAME run as `rows[i]`; pruning `rows` alone desynchronised the two arrays so
    # `specs[1]` (the surviving Gac Softener run) still carried the DROPPED row's sizing
    # detail from index 0). Three rows: dangling / real / dangling, `specs` carrying its OWN
    # from_part/to_part per index that must be pruned/re-homed IN LOCKSTEP.
    _pi_sched = {
        "rows": [
            {"from": "Motor Control Center", "to": "Piping Network", "mechanism": "electrical_bus"},
            {"from": "motor_control_center", "to": "Gac Softener", "mechanism": "signal"},
            {"from": "Fresh Water Tank", "to": "Piping Network", "mechanism": "fluid_loop"},
        ],
        "specs": [
            {"from_part": "Motor Control Center", "to_part": "Piping Network", "size_label": "1.5mm2"},
            {"from_part": "motor_control_center", "to_part": "Gac Softener", "size_label": "1.5mm2"},
            {"from_part": "Fresh Water Tank", "to_part": "Piping Network", "size_label": "DN25"},
        ],
        "out_of_spec": [], "upsized": [], "design_feedback": [],
        "totals": {},
    }
    _pi_valid = {"Motor Control Center", "Gac Softener", "Fresh Water Tank"}
    _pi_new, _pi_dropped = prune_indexed_schedule(_pi_sched, _pi_valid, log=lambda *a: None)
    assert len(_pi_dropped) == 2, f"both Piping Network rows must be dropped; got {_pi_dropped}"
    assert len(_pi_new["rows"]) == 1 and len(_pi_new["specs"]) == 1, (
        f"rows and specs must shrink to the SAME single survivor (lockstep); "
        f"got rows={_pi_new['rows']} specs={_pi_new['specs']}")
    assert _row_endpoints(_pi_new["rows"][0]) == ("Motor Control Center", "Gac Softener"), (
        f"the surviving row must be the real one, re-homed from its 'motor_control_center' "
        f"slug to the display name; got {_pi_new['rows'][0]}")
    assert _row_endpoints(_pi_new["specs"][0]) == ("Motor Control Center", "Gac Softener"), (
        f"specs[0] must describe the SAME surviving run as rows[0] (lockstep, re-homed) — "
        f"a plain per-array prune (not index-aligned) would leave specs pointing at the "
        f"wrong run; got {_pi_new['specs'][0]}")

    # audit_referential_integrity + _ABSTRACT_BOUNDARY_RE utility-supply widening
    # (2026-07-06, CO2-mineralisation prong-3 proveCatch): a generic UTILITY-SUPPLY
    # endpoint id (steam / nitrogen / instrument-air / …) that names no real part must
    # be treated as a legitimate battery-limit terminus, NOT a broken reference — but
    # a genuinely bogus endpoint (matches no part AND no recognised utility/boundary
    # vocabulary) must still be flagged. Both directions proven so the widening cannot
    # silently swallow real dangling references (the anti-Goodhart counter-case).
    _ri_names = {"MEA Stripper Reboil Pot", "Packed Absorber Column"}
    _ri_topo = [
        {"from_part": "reboiler_steam_supply", "to_part": "Packed Absorber Column",
         "mechanism": "thermal"},
        {"from_part": "nitrogen_supply", "to_part": "MEA Stripper Reboil Pot",
         "mechanism": "fluid_loop"},
        {"from_part": "MEA Stripper Reboil Pot", "to_part": "totally_made_up_widget",
         "mechanism": "fluid_loop"},
    ]
    _ri_violations = audit_referential_integrity(_ri_topo, _ri_names, log=lambda *a: None)
    _ri_bad = {v["name"] for v in _ri_violations}
    assert "reboiler_steam_supply" not in _ri_bad, \
        "a <service>_supply utility endpoint is a legitimate boundary, not a broken reference"
    assert "nitrogen_supply" not in _ri_bad, \
        "the utility-supply pattern is generic (any service noun), not a per-name patch"
    assert "totally_made_up_widget" in _ri_bad, \
        "a genuinely unresolved endpoint must still be flagged (the widening must not " \
        "swallow real dangling references)"

    print("connection_ledger selftest: OK (authority + completeness + integrity + direction-closer + residual + flow-demand join)")
    print(f"connection_ledger selftest: OK (2 authored, dangling+dry+dup dropped; "
          f"completeness flags {len(concerns)} incomplete part(s) incl. pump-missing-input)")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
