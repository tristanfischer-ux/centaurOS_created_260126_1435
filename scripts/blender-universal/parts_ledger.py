#!/usr/bin/env python3
"""
parts_ledger.py — THE LEDGER: one canonical object holding everything about the
design except the pixels. The images (Blender + the 8 drawings) are VIEWS of it:
generated from it and checked against it.

Tristan's design (2026-06-16, across four messages):
  1. "a table/database of parts that is the bom but also has all the inputs and
     outputs and transformations plus whether the information is in the relevant
     blender image or the 8 engineering documents — explicitly check things off."
  2. "the ledger is also the bom with everything about the costings in it."
  3. "the ledger should have everything in it except the images and they should
     inform the ledger and be changed by the ledger."
  4. "inputs and outputs should also determine what part it inputs from and outputs
     to including all of the pipes wires sensors etc. that information can be cross
     referenced with the 8 engineering drawings and the blender images."

So the ledger has two row kinds, both cross-referenced against every view:
  PARTS (equipment) — identity, BoM/cost (catalogue part, qty, unit/line £, basis,
    status, sub-component breakdown), inputs/outputs that NAME the connected part +
    the connecting element (pipe/cable/sensor) + mechanism, transformation, and a
    ✓/✗ coverage cell per representation (blender + 8 drawings) with EXPECTED
    coverage per type so a GAP = expected ✓ ∧ absent.
  CONNECTIONS (the pipes / wires / sensor ties) — from-part → to-part, mechanism,
    kind, size, rating, length, cost, AND their OWN coverage (P&ID line, line-list,
    isometric spool, Blender route) so every connection is checked off too.

SPINE = state.requirementsBom (the BoM, tag-keyed; sub-components line_gbp=0 so
Σ line_gbp reconciles). Flows = connection-schedule rows. Enriched by parts-
manifest (Blender placement) + route-manifest (routed pipes). DERIVED every run —
never hand-maintained — and meant to become the single source the draw_*.py
generators read (one tag → one name → one cost → one role → one connection).

USAGE: python3 parts_ledger.py <out_dir> [state.json]
OUTPUT: <out_dir>/parts-ledger.json + a printed ledger + coverage check-off.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # sibling modules
import ga_massing  # GA non-massing classifier — keep render/GA EXPECTED consistent with the scene

# Isometric drawings REMOVED from the dossier (Tristan 2026-06-28). 'isometric-index' is dropped from
# the tracked drawing reps + every type's expected-set, so no part is isometric-expected and no
# isometric coverage gap or tab is produced. The P&ID + BFD + line schedule carry the piping detail.
REPS = ["blender", "general-arrangement", "pid", "single-line-diagram", "panel-schedule",
        "block-flow-diagram", "process-schedules"]
SHORT = {"blender": "BLE", "general-arrangement": "GA", "pid": "P&ID",
         "single-line-diagram": "SLD", "panel-schedule": "PNL", "block-flow-diagram": "BFD",
         "process-schedules": "SCH"}

TYPE_EXPECTED = {
    "vessel":     {"blender", "general-arrangement", "pid", "block-flow-diagram"},
    "rotating":   {"blender", "general-arrangement", "pid", "single-line-diagram", "panel-schedule", "block-flow-diagram"},
    "exchanger":  {"blender", "general-arrangement", "pid", "block-flow-diagram"},
    "separator":  {"blender", "general-arrangement", "pid", "block-flow-diagram"},
    "instrument": {"pid", "process-schedules"},
    "valve":      {"pid", "process-schedules"},
    "electrical": {"single-line-diagram", "panel-schedule"},
    # A CONTROL device (PLC / HMI / SCADA / gateway / power-supply / surge) is CABINET CONTENTS,
    # shown on the PANEL SCHEDULE — NOT a power feeder on the single-line one-line (which shows the
    # incomer → main breaker → motor/sub-panel feeders). The control PANEL/enclosure itself is typed
    # `electrical` and stays single-line-expected; its internal cards do not. (A single-line conventionally
    # carries power-path equipment only — same correctness principle as GA-non-massing for the 3-D scene.)
    "control":    {"panel-schedule"},
    "other":      {"blender", "general-arrangement"},
}
TYPE_RULES = [
    # TELEMETRY / SCADA / cloud gateways are CONTROL systems (single-line / panel), NOT field
    # instruments — checked FIRST so "Remote Monitoring Gateway" / "Aquavista" don't fall to the
    # instrument rule's bare "monitor" token and get falsely counted as P&ID-expected field tags.
    ("control",    r"\bSCADA\b|telemetry|remote\s*monitor|cloud|aquavista|grundfos\s*remote|"
                   r"data\s*logger|\bIoT\b|edge\s*gateway|\bgateway\b"),
    ("instrument", r"transmitter|analy[sz]er|\bprobe\b|sensor|\bgauge\b|level switch|"
                   r"flow meter|flowmeter|\bmeter\b|densit|turbidit|viscosit|coriolis|"
                   r"mass flow|detector|monitor|"
                   # a position/door/limit switch is a field SENSOR (open/closed state), not a
                   # power-distribution device — checked here (not the electrical rule) so it is
                   # P&ID/schedule-expected, not a phantom single-line feeder (BESS v3 dissection
                   # 2026-07-05: 'door position switch' had NO TYPE_RULES match at all → fell to
                   # 'other' → wrongly blender/GA-expected).
                   r"position switch|door switch|limit switch"),
    ("valve",      r"\bvalve\b|solenoid|actuator|damper"),
    ("control",    r"controller|gateway|\bI/O\b|network switch|power supply|scada|\bUPS\b|\bPLC\b|"
                   r"\bHMI\b|touch\s?screen|touch\s?panel|\bDCS\b|operator (?:panel|interface|station)"),
    ("electrical", r"transformer|switchgear|\bMCC\b|busbar|generator|genset|breaker|relay|\bATS\b|fuse|surge|"
                   # metering/instrument transformers are switchgear-adjacent power apparatus,
                   # not a bare field instrument (BESS v3: 'grid PCC metering CT' had no match at
                   # all → fell to 'other').
                   r"metering\s*CT|current\s*transformer|voltage\s*transformer|"
                   # an LCL/EMI/RFI/harmonic output filter INDUCTOR/capacitor/choke/reactor is a
                   # power-electronics component, not a process SEPARATOR — checked here (before
                   # the separator rule below) so the generic '\bfilter\b' token in "PCS LCL output
                   # filter inductor" doesn't misclassify it as a process filter (BESS v3: this
                   # caused a FALSE 'no downstream connection' connectivity concern on a PCS
                   # cabinet-internal component that was never meant to have a discrete flow path).
                   r"\bLCL\b|filter\s+inductor|filter\s+capacitor|filter\s+choke|filter\s+reactor|"
                   r"\bEMI\s+filter\b|\bRFI\s+filter\b|harmonic\s+filter|"
                   # 'panel' means an ELECTRICAL distribution/control panel — but a bare match also
                   # caught non-electrical HVAC/fire/insulation/data compounds sharing the same head
                   # noun (BESS v3 dissection 2026-07-05): a louvre VENT panel, a suppression
                   # RELEASING panel, an arc flash BARRIER panel, a DEFLAGRATION vent panel, a
                   # thermal INSULATION panel, and a fibre PATCH panel are none of them power/
                   # control distribution equipment. Exclude those specific qualifiers (fixed-width
                   # lookbehind per qualifier) so a genuine 'Electrical Control Panel' / 'Digital
                   # Control Panel' / 'Distribution Panel' / 'Enclosure Panel' still matches.
                   # proveCatch both directions in build/verify-engine-guards selftest coverage.
                   r"(?<!vent )(?<!insulation )(?<!barrier )(?<!releasing )(?<!deflagration )"
                   r"(?<!louvre )(?<!fibre )(?<!fiber )(?<!patch )\bpanel\b"),
    ("rotating",   r"\bpump\b|blower|\bfan\b|compressor|skimmer|aerat"),
    ("exchanger",  r"heat exchanger|heat pump|\bHEX\b|chiller|\bUV\b|ozone|steril|oxygenat|degas|makeup hex"),
    # `\bscreen\b` (not bare `screen`) so a filtration screen / drum screen matches but an HMI
    # "touchscreen" does NOT fall to separator (the HMI is caught by the control rule above anyway).
    ("separator",  r"drum filter|\bscreen\b|filter|clarifi|settl|cyclone|membrane|biofilter|\bMBBR\b"),
    ("vessel",     r"\btank\b|vessel|reservoir|\bsump\b|\bcone\b|column|reactor|silo|hopper|\bLOX\b|storage"),
]
TRANSFORM = {"vessel": "holds / contains working fluid", "rotating": "adds head / moves fluid",
             "exchanger": "transfers heat / treats stream", "separator": "separates a phase",
             "instrument": "measures a process variable", "valve": "regulates / isolates a flow",
             "electrical": "distributes electrical power", "control": "computes / commands",
             "other": "—"}
# mechanism → the physical connecting element kind (pipes / wires / sensors)
MECH_KIND = {"fluid_loop": "pipe", "fluid": "pipe", "process": "pipe", "thermal": "pipe (thermal)",
             "electrical": "cable", "power": "cable", "signal": "signal/sensor tie",
             "control": "signal/sensor tie", "gas": "gas pipe", "oxygen": "gas pipe"}

# ── NOT-FOUND STATUS SPLIT (Tristan 2026-07-04, round-4 dissection, fix 1) ─────────
# The ledger's flat "NOT FOUND" bucket conflated FOUR honest categories under one
# dishonest umbrella — a genuinely unresearched gap read identically to a part that
# was never going to carry a catalogue identity in the first place. Split every
# status=='NOT FOUND' equipment row by its OWN evidence (never a per-part table),
# in this priority order (a row matches at most one):
#   OEM-PROPRIETARY         — the row's own `basis` states a RECORDED research
#     finding that no public MPN exists (mirrors build-excel-export.py's
#     `_oem_proprietary_row` / `_OEM_PROPRIETARY_RESEARCH_RX` EXACTLY — same
#     regex, kept in sync by hand since the two scripts are independent CLI entry
#     points). Never inferred from a merely-absent price/part.
#   ARCHITECTURALLY-EXCLUDED — the row's NAME is in the membrane/filtration-media
#     family (mirrors requirements_bom.py's `_MEMBRANE_MEDIA_RE` EXACTLY — the
#     same regex that routes the row to the area-parametric price in the first
#     place). Until the membrane-pin rule lets a genuinely-pinned real MPN
#     through (in which case the row's status becomes IDENTIFIED and it never
#     reaches this classifier at all), a pinless membrane/media row is honestly
#     excluded from catalogue-identity research BY DESIGN, not failed research.
#   FABRICATED               — the row's own `basis` states a materials-take-off /
#     bespoke-fabrication pricing family (a manifold header, a structural
#     footprint take-off …) — these have NO catalogue identity BY NATURE, so the
#     gap is not a research failure either.
#   NOT FOUND                — kept ONLY for a part that SHOULD have a catalogue
#     identity (a pump, a sensor, a switchgear item …) and does not yet — the
#     true, honest, still-open research gap.
# The Part names scorer (build-excel-export.py `_sc_partnames`) already consumes
# only the top-level `not_found` list — narrowing THAT list to true residuals is
# the whole fix; the exporter needs no change (verified: it reads `pl.get(
# "not_found")` and `pl.get("orphan_equipment")` only, never a per-part status).
# proveCatch per status both directions in `_selftest`: a fabricated manifold
# never counts not-found; a plain unpinned pump still does.
_OEM_PROPRIETARY_RESEARCH_RX = re.compile(
    r"oem[- ]proprietary|"
    r"no\s+public(?:ly)?[- ]?(?:available|listed|disclosed)?\s*(?:part\s*number|mpn)|"
    r"no\s+published\s+(?:part\s*number|mpn)|"
    r"(?:manufacturer|oem)\s+(?:does\s+not|doesn't)\s+publish|"
    r"not\s+publicly\s+(?:available|listed|disclosed)", re.I)
# mirrors requirements_bom.py's _MEMBRANE_MEDIA_RE EXACTLY (the regex that routes a
# row to the area-parametric price) — keep the two in sync by hand.
_MEMBRANE_MEDIA_RE = re.compile(
    r"\bmembranes?\b|"
    r"\b(?:ro|uf|nf|mf|edi)\s+(?:membrane|element|module|bank|housing)s?\b|"
    r"\bfilter\s+media\b|\bmedia\s+(?:bed|fill|charge)\b|"
    r"\bspiral[- ]wound\b|\bhollow[- ]fib(?:re|er)\b",
    re.I)
_FABRICATED_BASIS_RX = re.compile(
    r"materials?\s+take-?off|structural\s+take-?off|footprint\s+take-?off|\bfabricat\w*\b",
    re.I)

# ── ONE-TRUTH NAME FAMILIES (Tristan 2026-07-04, round-4 dissection, fix 2) ────────────
# The split above narrows the residual by BASIS-TEXT signals (OEM-PROPRIETARY, FABRICATED)
# and by a NAME signal specific to membrane media. It still left the ledger blind to name
# families the BoM taxonomy + ga_massing.py's GA-non-massing classifier ALREADY apply —
# under-covering real Codema v76 rows ('Piping Network', 'Cip System', 'Cip System
# Connections', 'Modular Stack Design', '3 Part Union Fittings', 'Leveling Feet',
# 'Flexmount Connectors', 'Permeate Outlet', 'Concentrate Outlet' …) as a dishonest
# residual "NOT FOUND" when the BoM/GA taxonomy already knows exactly what they are:
#   COMMODITY-FITTING — a bare accessory / fastener / fitting / connector / cabling noun
#     with no catalogue identity BY NATURE (a union, gland, gasket, bolt, terminal block,
#     cable gland, leveling foot, support frame …). Mirrors ga_massing.GA_NON_MASSING_RE's
#     accessory/fastener/fitting + cabling/wiring + pipework-attached-fitting alternations
#     EXACTLY (the same regex the 3-D massing decision already applies to these names) —
#     kept in sync by hand since the two modules serve different decisions (massing vs
#     catalogue-identity research) but must never diverge on WHICH names are "not a
#     discrete purchasable item". Deliberately EXCLUDES ga_massing's instrument / inline-
#     valve / switchgear-internal alternations — those ARE real catalogue-class parts
#     (a Modbus Interface, a Pressure Relief Valve) that must stay a TRUE 'NOT FOUND' gap
#     until researched; GA-non-massing them from the 3-D scene is a rendering decision,
#     not a catalogue-identity one.
#   BOUNDARY-STUB — a bare process connection ENDPOINT ('Permeate Outlet', 'Concentrate
#     Outlet') — a topological reference point ga_massing deliberately KEEPS massed (its
#     must_keep list: dropping it dangles/re-homes a real fluid_loop edge) but which is
#     still not a catalogue part with its own MPN. TERMINAL-anchored (head noun = Inlet/
#     Outlet) so a real device whose head noun is something else ('Outlet Damper
#     Assembly') is untouched.
#   SCOPE-DOCUMENTED — the row's own name IS a design/system LABEL, not a single
#     purchasable item: either a design-metadata head noun (mirrors ga_massing.py's
#     design/concept/philosophy/strategy/approach/methodology/scheme/basis rule EXACTLY —
#     'Modular Stack Design') or a bare '<qualifier> System'/'<qualifier> Network'
#     aggregate whose own constituent parts are ALREADY separate BoM rows ('Cip System'
#     rolls up 'Cip Tank' + 'Cip System Connections'; 'Piping Network' is the RO skid's
#     interconnect run, not a single SKU). The System/Network check only fires when
#     TYPE_RULES found no real equipment/control keyword at all (`typ == "other"`) — a
#     genuine 'SCADA System' / 'Control System' is typed 'control' upstream (SCADA/
#     controller keyword) and never reaches this generic fallback, so it is never
#     wrongly exempted.
# proveCatch both directions in `_selftest`: every family member reclassifies; a real
# unresearched catalogue part (pump/vessel/valve/VFD/transformer/motor-starter/PLC
# interface) does not.
_COMMODITY_FITTING_RE = re.compile(
    # mirrors ga_massing.GA_NON_MASSING_RE's accessory/fastener/fitting/support-frame
    # alternation EXACTLY (ga_massing.py lines ~33-58) — independent CLI entry points,
    # kept in sync by hand.
    r"\b(?:union|glands?|couplings?|adapters?|adaptors?|ferrules?|olives?|"
    r"nipples?|connectors?|flexmount|spacers?|baffles?)\b|"
    r"\bflanges?\b|\bgaskets?\b|\bend caps?\b|\bblanking (?:plates?|caps?)\b|"
    r"\banchor\s+bolts?\b|\b(?:bolts?|nuts?|washers?|screws?|studs?|rivets?)\b|"
    r"\blev(?:el)?ling feet\b|\bleveling feet\b|\bdistribution plate(?:s)?\b|"
    r"\bcip (?:system )?connection(?:s)?\b|\bquick coupling\b|"
    r"\bsupport (?:system|frame|structure|stand)\b|"
    r"\b(?:skid|base|equipment|mounting|baseplate|sub|structural) frame\b|\bframe assembly\b|"
    r"\bpneumatic actuator(?:s)?\b|\belectric actuator(?:s)?\b|"
    # mirrors ga_massing.py lines ~94-97 EXACTLY (cabling/wiring/distribution accessories)
    r"\bcabling\b|\bcable tray(?:s)?\b|\bcable gland(?:s)?\b|"
    r"\bterminal block(?:s)?\b|\b(?:power )?distribution block(?:s)?\b|"
    r"\bpower supply unit\b|\bdin rail\b|\bwireway\b|"
    # mirrors ga_massing.py lines ~126-127 EXACTLY (pipework-attached small fittings)
    r"\bspray balls?\b|\bsampl(?:e|ing) points?\b|"
    r"\b(?:hose|flexible hose) assembl(?:y|ies)\b|\bflexible hoses?\b",
    re.I)
_BOUNDARY_STUB_RE = re.compile(r"\b(?:inlet|outlet)\s*\d*\s*$", re.I)
# mirrors ga_massing.py's design-metadata rule EXACTLY (lines ~147-148) — kept in sync.
_SCOPE_DESIGN_METADATA_RE = re.compile(
    r"\b(?:design|concept|philosophy|strategy|approach|methodology|scheme|basis)s?\s*\d*\s*$",
    re.I)
# NOT in ga_massing (a 'Cip System'/'Piping Network' stays MASSED there, correctly, for
# 3-D placement) — this is the catalogue-identity analogue, gated on `typ == "other"` so
# a genuine control/electrical "*System" is never caught (see docstring above).
_SCOPE_SYSTEM_NETWORK_RE = re.compile(r"\b(?:system|network)\s*\d*\s*$", re.I)


def _not_found_substatus(name: str, basis: str, typ: str = "other") -> str:
    """Classify a status=='NOT FOUND' equipment row's TRUE reason from its own
    evidence (name + basis + its parts_ledger TYPE_RULES classification) — never a
    per-part table. One of 'OEM-PROPRIETARY', 'ARCHITECTURALLY-EXCLUDED', 'FABRICATED',
    'COMMODITY-FITTING', 'BOUNDARY-STUB', 'SCOPE-DOCUMENTED', or 'NOT FOUND' (the true
    residual). See the module-level comments above for the full rationale + priority."""
    b = str(basis or "")
    n = str(name or "")
    if _OEM_PROPRIETARY_RESEARCH_RX.search(b):
        return "OEM-PROPRIETARY"
    if _MEMBRANE_MEDIA_RE.search(n):
        return "ARCHITECTURALLY-EXCLUDED"
    if _FABRICATED_BASIS_RX.search(b):
        return "FABRICATED"
    if _BOUNDARY_STUB_RE.search(n):
        return "BOUNDARY-STUB"
    if _COMMODITY_FITTING_RE.search(n):
        return "COMMODITY-FITTING"
    if _SCOPE_DESIGN_METADATA_RE.search(n):
        return "SCOPE-DOCUMENTED"
    if typ == "other" and _SCOPE_SYSTEM_NETWORK_RE.search(n):
        return "SCOPE-DOCUMENTED"
    # 2026-07-05 BESS v3 dissection: reuse the SHARED ga_massing pure-documentation signal
    # (the same one driving the "expected nowhere" decision above) so a NOT-FOUND row
    # whose name is pure paperwork/signage gets the SAME honest substatus instead of a
    # dishonest catalogue-research-gap flag. NOTE: deliberately NOT reusing the broader
    # `ga_massing.is_ga_non_massing()` here — that classifier is intentionally WIDER (it
    # also drops valve/instrument/control-panel-internal families that are legitimate
    # 3D-massing exclusions but are STILL real catalogue-research targets, e.g. a VFD
    # Drive, a Modbus Interface, a Pressure Relief Valve). Conflating the two caused a
    # real proveCatch OVER-REACH regression (verify-engine-guards.sh) — reverted to the
    # narrower LOCAL `_COMMODITY_FITTING_RE` above for that decision.
    if ga_massing.is_pure_documentation(n):
        return "SCOPE-DOCUMENTED"
    return "NOT FOUND"

# A manifest instrument/valve part is REPRESENTED on a P&ID by its ISA LETTER (TT/PT/LT/AT/FCV/
# XV/PSV), NOT by its manifest tag ("u_temperature_sensor") — so the coverage matcher's tag/name
# text-match FALSE-NEGATIVES every such part (the part IS drawn, just as an ISA bubble). Credit
# coverage when the function's ISA symbol is present in the drawing. Mirrors draw_pid.py's
# _INSTR_WORD_FUNC. Universal — corrects the manifest-tag↔ISA-tag mismatch for every class. A
# genuinely-missing valve (no PCV/XV symbol drawn) is still NOT credited → the % stays honest.
_ISA_FUNC = [
    # valves FIRST (a "flow control valve" is a valve, not a flow transmitter — match before \bflow\b)
    (re.compile(r"relief|\bpsv\b|safety.?valve|pressure.?relief", re.I), ("PSV",)),
    (re.compile(r"check.?valve|non.?return|\bnrv\b|one.?way.?valve|foot.?valve", re.I), ("NV", "XV")),
    (re.compile(r"solenoid|\besd\b|shut.?off|emergency.*valve|on.?off.?valve|"
                r"actuat|pneumatic|motor(?:is|iz)ed.?valve|composeal", re.I), ("XV",)),
    (re.compile(r"flow.?control.?valve|\bfcv\b|control.?valve|dosing.?valve|modulat", re.I), ("FCV", "PCV")),
    # manual hand valves (ball / butterfly / gate / isolation) — drawn as a plain hand-valve symbol
    (re.compile(r"manual.?(?:ball|valve)|\bball.?valve\b|butterfly|gate.?valve|isolation.?valve|hand.?valve", re.I), ("HV", "XV")),
    # instruments
    (re.compile(r"dissolved.?oxygen|_do_|\bdo\b|do[_ ]?anal", re.I), ("AT",)),
    (re.compile(r"\bph\b|_ph_|ph[_ ]?anal", re.I), ("AT",)),
    (re.compile(r"conductiv|salin|\btds\b|total.?dissolved|\bec\b", re.I), ("AT",)),
    # water-quality analysers: ORP/redox, free-chlorine, turbidity, silica, hardness, ammonia/nitrate,
    # leak / moisture — all measure a stream property → ISA Analyser bubble (AT). UNIVERSAL.
    (re.compile(r"ammonia|nitrate|nitrite|\btan\b|analy[sz]|\borp\b|redox|chlorin|turbidit|"
                r"\bsilica\b|hardness|residual|\bleak\b|moisture|gas.?detect", re.I), ("AT",)),
    (re.compile(r"\blevel\b|_level_|level.?transmit|level.?switch", re.I), ("LT", "LSL")),
    (re.compile(r"temperatur|_temp_|\btemp\b", re.I), ("TT",)),
    (re.compile(r"\bflow\b|_flow_|flow.?transmit|flow.?meter", re.I), ("FT",)),
    (re.compile(r"pressure|_press_", re.I), ("PT",)),
]


def _isa_letters(tag: str, name: str):
    s = f"{tag or ''} {name or ''}"
    for rx, letters in _ISA_FUNC:
        if rx.search(s):
            return letters
    return ()


def _norm(s: str) -> str:
    s = re.sub(r"^u_", "", (s or "").strip().lower())
    s = re.sub(r"[_\-]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"s\b", "", s)


# ── CABINET GROUPING (universal, role-keyed — no per-class table) ─────────────────
# Tristan 2026-06-24: "all sub systems that are small should be put into a cabinet" +
# "create a deterministic check for all things going into the cabinets so we can see the
# inputs and outputs and the connectors and that it all works". A real plant houses every
# small electrical / control device inside an ENCLOSURE: a power board / MCC houses the
# breakers / fuses / relays / drives; a control / marshalling cabinet houses the I/O cards
# / PLC / network switch / gateway. We classify the enclosures by ROLE, then assign each
# small device to the right enclosure (matching domain, same module preferred). Field
# INSTRUMENTS (probes / transmitters / analysers / detectors) are NOT housed — they are
# field-mounted and wire TO a cabinet, so they are never cabinet contents.
_CABINET_POWER_RE = re.compile(
    r"busbar|distribution\s*board|switchboard|motor\s*control\s*cent|\bMCC\b|switch[- ]?gear|"
    r"\bLV\s*board\b|\bMV\s*board\b|panelboard|consumer\s*unit|\bPDU\b|distribution\s*panel|"
    r"power\s*distribution\s*panel|drive\s*cabinet|\bVSD\b\s*cabinet", re.I)
_CABINET_CTRL_RE = re.compile(
    r"marshalling|control\s*cabinet|control\s*panel|\bDCS\b|\bPLC\b|\bHMI\b|junction\s*box|"
    r"control\s*system|control\s*enclosure|instrument\s*panel|i/?o\s*rack|remote\s*i/?o|"
    r"control[- ]?network", re.I)
_HOUSED_POWER_RE = re.compile(
    r"\bbreaker\b|\bfuse\b|surge|\bSPD\b|\brelay\b|\bMCB\b|\bMCCB\b|\bMPCB\b|\bRCD\b|\bRCBO\b|"
    r"contactor|isolator|motor[- ]?protection|earth[- ]?leakage|\bVFD\b|variable[- ]?frequency|"
    r"frequency\s*drive|soft[- ]?start|blower/centrifuge\s*VSD", re.I)
_HOUSED_CTRL_RE = re.compile(
    r"i/?o\s*card|i/?o\s*module|plc\s*module|gateway|network\s*switch|signal\s*conditioner|"
    r"\bbarrier\b|marshalling\s*terminal|power\s*supply|\bPSU\b|interface\s*station", re.I)
# a "remote I/O rack" / "remote I/O" is itself a small ENCLOSURE (it houses I/O cards) →
# treat as a cabinet, not a housed device, so cabinet-match takes precedence below.


def _build_cabinets(equipment: list, concern_tags: set) -> dict:
    """Group small electrical/control devices into the enclosure that houses them and
    return a deterministic cabinet schedule: for each cabinet, its housed CONTENTS with
    each device's IN/OUT connectors + a connected verdict, and a cabinet-level all_connected
    flag. `connected` reuses the SAME connectivity verdict the ledger computed (a device is
    connected iff it is not in concern_tags), so the cabinet deck cannot disagree with the
    connector audit. Universal — role vocabulary only."""
    def _is_cab(e):
        return (e.get("type") in ("electrical", "control")
                and (_CABINET_POWER_RE.search(e["name"]) or _CABINET_CTRL_RE.search(e["name"])))

    cabinets_eq = [e for e in equipment if _is_cab(e)]
    cab_tags = {e["tag"] for e in cabinets_eq}

    def _domain(e):
        return "power" if _CABINET_POWER_RE.search(e["name"]) else "control"

    # housed = a small power/control device that is NOT itself a cabinet/enclosure
    housed = []
    for e in equipment:
        if e["tag"] in cab_tags or e.get("type") not in ("electrical", "control"):
            continue
        if _HOUSED_POWER_RE.search(e["name"]):
            housed.append((e, "power"))
        elif _HOUSED_CTRL_RE.search(e["name"]):
            housed.append((e, "control"))

    def _pick_cabinet(dev, dom):
        same_dom = [c for c in cabinets_eq if _domain(c) == dom]
        same_mod = [c for c in same_dom if c.get("module") and c.get("module") == dev.get("module")]
        for pool in (same_mod, same_dom, cabinets_eq):
            if pool:
                return sorted(pool, key=lambda c: str(c["tag"]))[0]
        return None

    by_cab: dict = {e["tag"]: [] for e in cabinets_eq}
    n_unassigned = 0
    for dev, dom in housed:
        cab = _pick_cabinet(dev, dom)
        if cab is None:
            n_unassigned += 1
            continue
        by_cab[cab["tag"]].append({
            "tag": dev["tag"], "name": dev["name"], "type": dev["type"],
            "function": dev.get("transformation", "—"),
            "n_in": len(dev.get("inputs") or []), "n_out": len(dev.get("outputs") or []),
            "inputs": (dev.get("inputs") or [])[:6], "outputs": (dev.get("outputs") or [])[:6],
            "connected": dev["tag"] not in concern_tags})

    cabinets = []
    for cab in sorted(cabinets_eq, key=lambda c: str(c["tag"])):
        contents = by_cab[cab["tag"]]
        cab_connected = cab["tag"] not in concern_tags
        all_conn = cab_connected and all(c["connected"] for c in contents)
        cabinets.append({
            "tag": cab["tag"], "name": cab["name"], "domain": _domain(cab),
            "module": cab.get("module"), "connected": cab_connected,
            "n_in": len(cab.get("inputs") or []), "n_out": len(cab.get("outputs") or []),
            "inputs": (cab.get("inputs") or [])[:6], "outputs": (cab.get("outputs") or [])[:6],
            "n_contents": len(contents), "contents": contents,
            "all_connected": all_conn})
    n_all_conn = sum(1 for c in cabinets if c["all_connected"])
    return {
        "n_cabinets": len(cabinets),
        "n_housed": len(housed) - n_unassigned,
        "n_unassigned": n_unassigned,
        "n_cabinets_all_connected": n_all_conn,
        "all_cabinets_proven": n_all_conn == len(cabinets) and n_unassigned == 0,
        "cabinets": cabinets}


def _classify(name: str, tag: str) -> str:
    blob = f"{name} {tag}".lower()
    for typ, rx in TYPE_RULES:
        if re.search(rx, blob, re.I):
            return typ
    return "other"


# Origin/sink BOUNDARY-NODE noun signal (hoisted to module level 2026-07-04 so
# _passive_boundary_concern below can share it with main()'s connectivity audit —
# ONE list, never two copies that could drift). A part matching one of these nouns is
# a legitimate battery-limit origin/sink regardless of its TYPE_RULES classification.
_ORIGIN_KEYWORDS = {"grid", "mains", "water supply", "water intake", "make-up water",
                    "make-up", "makeup", "make up",
                    "feed", "food", "fuel", "air intake", "seawater", "freshwater",
                    "oxygen supply", "chemical supply", "intake",
                    "lox", "liquid oxygen", "bulk storage", "supply tank", "storage tank",
                    "day tank", "bulk tank", "buffer tank", "dosing tank"}
_SINK_KEYWORDS = {"drain", "effluent", "discharge", "waste", "sludge", "exhaust",
                  "heat rejection", "mortality", "overflow", "reject"}


def _passive_boundary_concern(name: str, has_in: bool, has_out: bool):
    """proveCatch target (Tristan's X-140 thread, 2026-07-04): a PASSIVE-typed part
    ('structural' / the 'other' fallback) is normally never a connectivity concern —
    frames, cladding, foundations legitimately carry no process tie. But the 'other'
    fallback ALSO catches parts TYPE_RULES has no pattern for at all — e.g. a nozzle
    named 'Drain Connection' or 'Zone valve connection kit', which the origin/sink
    NOUN signal already recognises as a genuine battery-limit boundary (the SAME
    keyword check the PROCESS-typed branch uses). Before this fix such a part was
    silently exempted from ANY connectivity concern — a genuinely-unconnected part
    (no drawn discharge) escaped the ledger's own completeness audit. Returns a
    concern dict {issue, detail} or None. A truly-structural part with no origin/sink
    noun (e.g. 'Structural Support Beam') matches neither list and stays exempt —
    universal, keyed on the same noun signal, never a per-part table."""
    name_l = (name or "").lower()
    is_origin = any(kw in name_l for kw in _ORIGIN_KEYWORDS)
    is_sink = any(kw in name_l for kw in _SINK_KEYWORDS)
    if is_origin and not has_in:
        return {"issue": "missing_input",
                "detail": "Battery-limit origin with no upstream feed drawn — the TYPE "
                          "classifier has no pattern for this part, but its name names "
                          "an origin boundary that still needs its feed."}
    if is_sink and not has_out:
        return {"issue": "missing_output",
                "detail": "Battery-limit sink/drain with no downstream connection drawn "
                          "— where does this discharge to? The TYPE classifier has no "
                          "pattern for this part, but its name names a sink boundary "
                          "that still needs its discharge tie."}
    return None


def _load(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception:
        return None


def _is_connection(r: dict) -> bool:
    return (r.get("status") == "ROUTED" or bool(re.fullmatch(r"C\d+", str(r.get("tag", ""))))
            or str(r.get("basis", "")).startswith(("pipe ", "cable ", "gas ")))


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: parts_ledger.py <out_dir> [state.json]", file=sys.stderr)
        return 2
    out_dir = Path(sys.argv[1]).resolve()
    state_path = Path(sys.argv[2]) if len(sys.argv) > 2 else out_dir / "state.json"
    ddir = out_dir / "drawings"
    state = _load(state_path) or {}
    manifest = _load(out_dir / "parts-manifest.json") or {}
    conn = _load(out_dir / "connection-schedule.json") or {}
    # connection-ledger.json is the AUTHORITATIVE connection graph (every part→part tie:
    # fluid, electrical, SIGNAL, air, oxygen, assembly) — the SAME graph Blender renders
    # and the BoM costs. connection-schedule.json is only the SIZED cable/pipe runs (no
    # signal ties, only a subset of electrical), so building connectivity from it alone
    # manufactures false orphans for every instrument/controller (whose tie is a signal
    # wire, never a sized power cable) and for distribution gear wired in the ledger but
    # not the sizing schedule. We attach inputs/outputs from BOTH: the schedule gives the
    # sized via + cost + drawing coverage; the ledger closes the connectivity graph.
    # Universal — no per-class logic. (Tristan 2026-06-24: audit the graph that is real.)
    cledger = _load(out_dir / "connection-ledger.json") or {}
    route = _load(out_dir / "route-manifest.json") or {}
    rb = state.get("requirementsBom") or []

    # ── tool invocations + calculations (Tristan 2026-06-18) ──────────────────────
    # The ledger shows which tools were invoked for each part and the calculations
    # resulting from the tools. Tools live in 4-orchestrator-tools-used.json; each
    # tool has claims[] (output fields → values) and worked[] (label, formula,
    # substitution, inputs, result, assumptions). We join tools → equipment by
    # three strategies: (1) contract-quantity key in the part's basis text,
    # (2) equipment name/tag in the tool's worked-calculation text, (3) tool-name
    # type-match (pump-sizing → Recirc Pump). Universal — no per-class logic.
    tools_used = _load(out_dir / "4-orchestrator-tools-used.json") or {}
    tools_list = tools_used.get("tools", []) if isinstance(tools_used, dict) else []
    contract = state.get("engineeringContract") or {}
    contract_qty = contract.get("quantities", {}) if isinstance(contract, dict) else {}

    # Build: contract_quantity_key → tool_id (from claims[].output_field)
    qty_to_tool: dict[str, str] = {}
    for tool in tools_list:
        tid = str(tool.get("tool_id", ""))
        for c in (tool.get("claims") or []):
            for fld in (c.get("output_field"), c.get("field")):
                if fld:
                    qty_to_tool[str(fld)] = tid

    # Build: normalised equipment name tokens → set of tool_ids (type-match)
    TYPE_KW = {
        "pump": ["pump"], "vessel": ["vessel", "tank", "reactor", "silo"],
        "exchanger": ["heat exchanger", "hex", "chiller", "oxygenat", "degas"],
        "separator": ["filter", "screen", "clarifi", "cyclone", "membrane", "biofilter", "mbbr"],
        "rotating": ["blower", "fan", "compressor", "skimmer", "aerat"],
        "electrical": ["cable", "transformer", "switchgear", "panel", "breaker", "mcc"],
        "instrument": ["sensor", "gauge", "meter", "transmitter", "analy", "probe"],
        "valve": ["valve", "solenoid", "actuator"],
        "control": ["controller", "plc", "scada", "ups", "gateway", "switch"],
    }

    def _find_tools_for_equipment(eq_tag: str, eq_name: str, eq_basis: str) -> list:
        relevant: dict[str, dict] = {}
        nm_l = (eq_name or "").lower()
        tag_l = (eq_tag or "").lower()
        basis_l = (eq_basis or "").lower()

        for tool in tools_list:
            tid = str(tool.get("tool_id", ""))
            tname = str(tool.get("tool_name", ""))
            worked = tool.get("worked") or []
            claims = tool.get("claims") or []
            matched_calcs = []
            matched_claims = []

            # Strategy 1: equipment name/tag appears in worked-calc text
            for w in worked:
                txt = f"{w.get('label','')} {w.get('formula','')} {w.get('substitution','')}".lower()
                if nm_l and len(nm_l) >= 4 and nm_l in txt:
                    matched_calcs.append(w)
                elif tag_l and len(tag_l) >= 2 and tag_l in txt:
                    matched_calcs.append(w)

            # Strategy 2: claim output_field appears in the part's basis text.
            # Tightened: require the field to be ≥6 chars (avoids false matches
            # like 'ki' in 'rating-based' or 'pi' in 'pipe') AND require a
            # word-boundary match (not a substring).
            import re as _re
            for c in claims:
                for fld in (c.get("output_field"), c.get("field")):
                    if not fld: continue
                    fld_s = str(fld)
                    if len(fld_s) < 6: continue  # skip short fields (ki, pi, etc.)
                    if _re.search(r'\b' + _re.escape(fld_s.lower()) + r'\b', basis_l):
                        matched_claims.append(c)
                        break

            # Strategy 3: tool-name type-match (pump-sizing → Recirc Pump).
            # Tightened: require the keyword to be the PRIMARY noun in the equipment
            # name (first word or immediately after a qualifier like 'recirc').
            # This prevents 'control-systems:pid-tuning' matching every part with
            # 'control' anywhere in the name.
            type_match = False
            tid_l = tid.lower()
            for _, keywords in TYPE_KW.items():
                if any(kw in tid_l for kw in keywords):
                    # Check if the keyword appears as a significant word in the name
                    # (not just a substring). Split the name into words and check.
                    nm_words = nm_l.split()
                    for kw in keywords:
                        for nw in nm_words:
                            if kw in nw and len(nw) >= 3:
                                type_match = True
                                break
                        if type_match: break
                    if type_match: break

            if matched_calcs or matched_claims or type_match:
                # When type-matching (e.g. pump-sizing → Recirc Pump), include ALL
                # the tool's calculations — the tool was invoked FOR this type of
                # equipment, so its worked calcs are relevant even if the label
                # doesn't name the specific part.
                calcs_to_include = matched_calcs if matched_calcs else worked[:5]
                claims_to_include = matched_claims if matched_claims else claims[:5]
                relevant[tid] = dict(
                    tool_id=tid, tool_name=tname,
                    calculations=[
                        dict(label=w.get("label"), formula=w.get("formula"),
                             substitution=w.get("substitution"),
                             result=w.get("result"),
                             assumptions=w.get("assumptions", []))
                        for w in calcs_to_include[:5]],
                    claims=[
                        dict(field=c.get("output_field") or c.get("field"),
                             value=c.get("value"), unit=c.get("unit"))
                        for c in claims_to_include[:5]],
                    type_match=type_match and not matched_calcs and not matched_claims)

        return list(relevant.values())

    placed = {str(p.get("equipment_tag") or p.get("tag")): p
              for p in (manifest.get("parts", []) if isinstance(manifest, dict) else [])}
    subs: dict[str, list] = {}
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" and r.get("sub_of"):
            subs.setdefault(str(r["sub_of"]), []).append(r)

    # ── tag-collision detection (universal identity resolution) ──────────────────
    # A tag is AMBIGUOUS when the same tag maps to >1 distinct normalised equipment
    # name in the BoM (e.g. tag 'B' → 'aeration blower' AND 'degassing blower'; tag
    # 'AT' → 7 different analysers). For ambiguous tags, tag-only matching would
    # credit coverage for equipment that isn't drawn — a different unit shares the
    # tag. The covered() function requires NAME corroboration for ambiguous tags.
    _tag_names: dict[str, set] = {}
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" or _is_connection(r):
            continue
        tag = str(r.get("tag", "")).strip()
        if not tag or tag == "—":
            continue
        req = str(r.get("requirement", ""))
        nm = _norm(req.split("·")[0].strip() or str(r.get("part", "")) or tag)
        _tag_names.setdefault(tag, set()).add(nm)
    ambiguous_tags = {t for t, names in _tag_names.items() if len(names) > 1}

    # rendered text per view (deterministic, no OCR). Whitespace is COLLAPSED (a label
    # wrapped onto two SVG <tspan> lines renders as "Drain Collection \n Sump" — a raw
    # newline breaks the plain substring match against the manifest's single-line name
    # even though the label IS present; canonical-name audit 2026-07-04 traced 2 of the
    # 13 true drawing-coverage gaps — TK-114, F-3 — to exactly this, not an absent part).
    def _svg_text(f: Path) -> str:
        if not f.exists():
            return ""
        raw = " ".join(re.findall(r">([^<>]+)<", f.read_text(errors="ignore")))
        return " " + re.sub(r"\s+", " ", raw).strip() + " "

    rep_text = {"blender": ""}
    for key in REPS:
        if key == "blender":
            continue
        if key == "isometric-index":
            # the isometrics are PER-LINE spool files (isometric-201-PR-DN300.svg …), NOT a
            # single index sheet — `isometric-index.svg` never exists, so the old single-file
            # read gave EVERY part ISO=absent (false 0/N). A part is on the ISO set if it is
            # named on ANY spool, so AGGREGATE every spool's text. (Connection ISO coverage
            # already keys on the per-line spool file; this fixes the PART side.)
            rep_text[key] = " ".join(_svg_text(f) for f in sorted(ddir.glob("isometric-*.svg")))
            continue
        rep_text[key] = _svg_text(ddir / f"{key}.svg")
    placed_norms = {_norm(str(p.get("name", ""))) for p in placed.values()}

    def covered(tag: str, name: str, key: str, canonical: str | None = None) -> bool:
        """`canonical` (added 2026-07-04, canonical-name-register audit): the manifest's OWN
        name for this tag (parts-manifest.json `name`), tried as a SECOND match candidate
        alongside the BoM `requirement`-derived `name` — the two surfaces sometimes diverge
        (e.g. a combined manifest label "Grp Membrane Housings" vs a per-item BoM
        requirement) even though the same physical part is drawn under one of the two
        strings. Consuming it is additive-only: a canonical hit can turn a NOT-found into a
        found, never the reverse."""
        if key == "blender":
            return tag in placed or _norm(name) in placed_norms
        txt = rep_text.get(key, "")
        if not txt:
            return False

        def _present(nm: str) -> bool:
            nm = (nm or "").strip()
            if not nm or len(nm) < 4:
                return False
            # PLURAL-INSENSITIVE name match: a 'Circuit Breakers' BoM line IS represented by a
            # 'Circuit Breaker' on the drawing (and vice-versa) — a trailing-s on either side
            # must not break the substring credit. Singularise each word (strip a word-final
            # 's') on BOTH the name and the drawing text before comparing. Universal; corrects
            # a coverage false-negative, not a relax.
            _sing = lambda s: re.sub(r"s\b", "", s.lower())  # noqa: E731
            return bool(nm.lower() in txt.lower() or _sing(nm) in _sing(txt))

        name_present = _present(name) or (bool(canonical) and canonical != name and _present(canonical))
        if tag and (f" {tag} " in txt or f">{tag}<" in txt):
            # Tag is present in the drawing. If the tag is UNAMBIGUOUS (unique
            # identity — one equipment per tag), credit on tag alone. If the tag
            # is AMBIGUOUS (collision: same tag → different equipment), require
            # the NAME to also be present — otherwise we'd credit coverage for a
            # different unit that happens to share the tag.
            if tag not in ambiguous_tags:
                return True
            return name_present
        if name_present:
            return True
        # ISA-bubble credit: an instrument/valve is drawn on a P&ID / single-line / process
        # schedule (added 2026-07-04 — I-104 "Conductivity Sensor" is drawn as the combined
        # "pH / conductivity" row under its OWN AT-20x ISA tag on Process schedules, not
        # under its manifest name) by its ISA LETTER (TT/PT/LT/AT/FCV/XV/PSV), not its
        # manifest tag — credit when the function's symbol is present in the drawing text.
        # Corrects a matcher false-negative (the part IS drawn).
        if key in ("pid", "single-line-diagram", "process-schedules"):
            for L in _isa_letters(tag, name):
                if re.search(rf"\b{re.escape(L)}\b", txt):
                    return True
        return name_present

    # ── 1. PARTS (equipment) — identity + BoM/cost + coverage (I/O attached below) ──
    equipment = []
    grand = sum(r.get("line_gbp", 0) or 0 for r in rb)
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" or _is_connection(r):
            continue
        tag = str(r.get("tag", ""))
        req = str(r.get("requirement", ""))
        name = (req.split("·")[0].strip() or str(placed.get(tag, {}).get("name", "")) or tag)
        typ = _classify(name, tag)
        pm = placed.get(tag, {})
        sublist = subs.get(tag, [])
        # canonical = the manifest's OWN name for this tag — the second match candidate
        # (2026-07-04 canonical-name-register audit; see covered()'s docstring).
        cov = {key: covered(tag, name, key, pm.get("name")) for key in REPS}
        expected = TYPE_EXPECTED.get(typ, set())
        # Consistency with the 3D scene: a part the GA/render correctly OMIT — inline valves,
        # field instruments, switchgear/panel internals, fittings (P&ID-level detail dropped
        # from the Blender scene by build_universal_scene's ga_massing filter) — must NOT be
        # EXPECTED in the render or GA either; otherwise its guaranteed-absence deflates
        # render/GA coverage. It REMAINS expected on the P&ID / schedules (its proper home).
        # EXTENDED 2026-07-05 (BESS v3 denominator-honesty pass): the SAME "lives inside an
        # already-massed parent, never its own drawn object" principle also applies to the
        # SINGLE-LINE one-line diagram — a rack's grounding wire, a transformer's cable
        # sealing end, a fibre patch panel, are not power-path feeder equipment either, so
        # they must not inflate the single-line/panel-schedule denominator (Electrical tab).
        if ga_massing.is_ga_non_massing(name):
            expected = expected - {"blender", "general-arrangement", "single-line-diagram"}
        # A pure document/label/certification-record row (Tristan's Codema-discipline ask,
        # 2026-07-05) has NO engineering-drawing home at all — expected NOWHERE, exactly like
        # a PARAMETRIC materials-allowance row. Never inferred from status; a name-level
        # signal shared with the 3D-massing decision (ga_massing.is_pure_documentation).
        if ga_massing.is_pure_documentation(name):
            expected = set()
        basis_full = str(r.get("basis", ""))
        eq_tools = _find_tools_for_equipment(tag, name, basis_full)
        # NOT-FOUND STATUS SPLIT — classified from the FULL basis (never the display-
        # truncated `basis` field below) so a signal past 90 chars is never missed.
        # None for every other status (IDENTIFIED/BESPOKE/SYSTEM/… never reach this).
        nf_substatus = _not_found_substatus(name, basis_full, typ) if r.get("status") == "NOT FOUND" else None
        equipment.append(dict(
            tag=tag, name=name, type=typ, module=pm.get("module"), ikey=_norm(name),
            requirement=req, part=r.get("part"), status=r.get("status"),
            qty=r.get("qty"), unit_gbp=r.get("unit_gbp"), line_gbp=r.get("line_gbp"),
            basis=basis_full[:90], subcomponents=len(sublist),
            subcomponent_gbp=round(sum(s.get("breakdown_gbp", 0) or 0 for s in sublist)),
            modelled_qty=(pm.get("qty") if pm else 0), dims_mm=pm.get("dims_mm"),
            transformation=TRANSFORM.get(typ, "—"),
            coverage=cov, expected=sorted(expected),
            gaps=sorted(k for k in expected if not cov.get(k)),
            tools=eq_tools, not_found_status=nf_substatus,
            inputs=[], outputs=[]))

    # resolver: a connection-schedule internal key → the equipment row (by norm name)
    eq_by_key: dict[str, dict] = {}
    for e in equipment:
        eq_by_key.setdefault(e["ikey"], e)
    def resolve(ikey: str):
        if ikey in eq_by_key:
            return eq_by_key[ikey]
        for k, e in eq_by_key.items():          # loose contains-match (rotary_drum_filter↔drum filter)
            if k and (k in ikey or ikey in k):
                return e
        return None

    # ── 2. CONNECTIONS (pipes / wires / sensor ties) — endpoints + via + coverage ──
    rows = conn.get("rows", []) if isinstance(conn, dict) else []
    specs = conn.get("specs", []) if isinstance(conn, dict) else []
    route_lines = (route.get("lines") if isinstance(route, dict) else None) or []
    runname_to_lineno = {l.get("run_name"): l.get("line_number")
                         for l in route_lines if isinstance(l, dict)}
    tagpair_to_lineno = {(_norm(str(l.get("from_tag", ""))), _norm(str(l.get("to_tag", "")))):
                         l.get("line_number") for l in route_lines if isinstance(l, dict)}
    connections = []
    # ties already attached from the SIZED schedule, keyed (from_norm, to_norm, mech) so
    # the authoritative-ledger pass below never double-lists the same physical run.
    attached_pairs: set = set()
    for i, r in enumerate(rows):
        fr_key, to_key = _norm(str(r.get("from", ""))), _norm(str(r.get("to", "")))
        mech = r.get("mechanism", "")
        spec = specs[i] if i < len(specs) and isinstance(specs[i], dict) else {}
        kind = spec.get("kind") or MECH_KIND.get(mech, "pipe")
        size = r.get("size") or spec.get("size_label") or ""
        lineno = runname_to_lineno.get(spec.get("run_name")) or tagpair_to_lineno.get((fr_key, to_key))
        fe, te = resolve(fr_key), resolve(to_key)
        fn = fe["name"] if fe else fr_key.title()
        tn = te["name"] if te else to_key.title()
        # coverage by the AUTHORITATIVE line number (exact join via route-manifest): the
        # P&ID + line-list label the line number, the isometric spool file is named for
        # it, the Blender route-manifest carries the run. P&ID falls back to "both
        # endpoint symbols present" when the line number itself is not labelled.
        ln = str(lineno or "")
        both_pid = (covered((fe or {}).get("tag", ""), fn, "pid")
                    and covered((te or {}).get("tag", ""), tn, "pid"))
        cov = dict(
            pid=bool(ln and ln in rep_text.get("pid", "")) or both_pid,
            process_schedules=bool(ln and ln in rep_text.get("process-schedules", "")),
            isometric=bool(lineno and (ddir / f"isometric-{lineno}.svg").exists()),
            route=bool(lineno),
        )
        via = f"{kind} {size}".strip()
        connections.append(dict(
            idx=i, line_number=lineno, from_part=fn, from_tag=(fe or {}).get("tag"), to_part=tn,
            to_tag=(te or {}).get("tag"), mechanism=mech, kind=kind, via=via,
            size=size, rating=r.get("rating"), length_m=r.get("length_m"),
            line_gbp=r.get("line_total_gbp") or r.get("line_gbp"),
            within_spec=r.get("within_spec"), coverage=cov))
        # attach to the endpoint parts' inputs/outputs (NAME the part + via-element)
        if te:
            te["inputs"].append(f"{fn} ({(fe or {}).get('tag') or '?'}) via {via} [{mech}]")
        if fe:
            fe["outputs"].append(f"{tn} ({(te or {}).get('tag') or '?'}) via {via} [{mech}]")
        if fe or te:
            attached_pairs.add((fr_key, to_key, mech))

    # ── 2b. AUTHORITATIVE LEDGER TIES — close the connectivity graph ──────────────────
    # The sized schedule above carries only cables + pipes; the connection-ledger holds
    # EVERY tie Blender drew (signal wires to the DCS, the full electrical spine, air /
    # oxygen / assembly). Attach each ledger tie not already represented by a sized run so
    # an instrument/controller shows its signal connector and distribution gear shows its
    # power in+out. Same `via [mech]` idiom; coverage/cost stay schedule-driven. Universal.
    cledger_rows = cledger.get("rows", []) if isinstance(cledger, dict) else []
    n_ledger_attached = 0
    # STALE-TIE GUARD (2026-07-02): the connection-ledger is authored INSIDE Blender
    # MID-CHAIN; later design stages may legitimately remove/rename a word (the
    # generator's pH/ORP/Conductivity sensor suite was wired by Blender, then dropped
    # from the delivered design). A tie endpoint that exists NOWHERE in the delivered
    # design (BoM heads + module words + drawn manifest parts) must NOT be attached as
    # a live connection — that fabricates an input from a part that does not exist in
    # the bill (the "Ph Sensor (?)" phantom the dossier audit rightly flags HIGH).
    # An endpoint that IS in the design but is not ledger EQUIPMENT (a pipe run /
    # spool line / GA-dropped sub-component / drawn electrical spine node) keeps the
    # loose '(?)' attach — those via-nodes are legitimate delivered evidence. Stale
    # ties are DISCLOSED in `stale_ties`; the deeper fix (re-derive the ledger on the
    # FINAL state) is the standing #86 ordering work.
    design_names = set()
    for _r in rb:
        _h = str(_r.get("requirement") or "").split("·", 1)[0].strip()
        if _h:
            design_names.add(_norm(_h))
    for _m in (state.get("moduleDecomposition") or {}).get("modules") or []:
        for _sm in (_m.get("sub_modules") or []):
            for _w in (_sm.get("words") or []):
                if _w.get("name_human"):
                    design_names.add(_norm(str(_w["name_human"])))
    for _p in (manifest.get("parts") or []):
        if isinstance(_p, dict) and _p.get("name"):
            design_names.add(_norm(str(_p["name"])))

    # token set mirrors dossier_audit's phantom-reference resolver rule (b) — ANY
    # meaningful token (len>2) of the reference appearing in the design token set
    # resolves it. SAME semantics on both sides so the ledger can never attach a tie
    # the audit would flag phantom (the one-matcher lesson, 2026-07-02).
    design_tokens = set()
    for d in design_names:
        design_tokens.update(t for t in re.split(r"[^a-z0-9]+", d) if len(t) > 2)

    def _in_design(k: str) -> bool:
        if not k:
            return False
        if k in design_names or any((k in d or d in k) for d in design_names):
            return True
        return bool({t for t in re.split(r"[^a-z0-9]+", k) if len(t) > 2} & design_tokens)

    stale_ties = []
    for r in cledger_rows:
        fr_key, to_key = _norm(str(r.get("from_part", ""))), _norm(str(r.get("to_part", "")))
        mech = r.get("mechanism", "") or r.get("service", "")
        if (fr_key, to_key, mech) in attached_pairs:
            continue
        fe, te = resolve(fr_key), resolve(to_key)
        if not (fe or te):
            continue
        unresolved = [k for k, e in ((fr_key, fe), (to_key, te)) if e is None]
        if any(not _in_design(k) for k in unresolved):
            stale_ties.append({"from_part": r.get("from_part"), "to_part": r.get("to_part"),
                               "mechanism": mech,
                               "unresolved": "from_part" if not fe else "to_part"})
            continue
        attached_pairs.add((fr_key, to_key, mech))
        kind = MECH_KIND.get(mech, MECH_KIND.get(r.get("service", ""), "tie"))
        fn = fe["name"] if fe else fr_key.title()
        tn = te["name"] if te else to_key.title()
        if te:
            te["inputs"].append(f"{fn} ({(fe or {}).get('tag') or '?'}) via {kind} [{mech}]")
        if fe:
            fe["outputs"].append(f"{tn} ({(te or {}).get('tag') or '?'}) via {kind} [{mech}]")
        n_ledger_attached += 1
    if stale_ties:
        print(f"[parts-ledger] {len(stale_ties)} STALE ledger tie(s) reference part(s) "
              f"absent from the delivered design (wired pre-removal) — disclosed in "
              f"stale_ties, not attached: "
              f"{[t['from_part'] + '→' + t['to_part'] for t in stale_ties[:4]]}")

    # ── reconciliations / summaries ──
    by_drawing = {}
    for key in REPS:
        exp = [e for e in equipment if key in e["expected"]]
        pres = [e for e in exp if e["coverage"].get(key)]
        by_drawing[key] = dict(expected=len(exp), present=len(pres),
                               pct=round(100 * len(pres) / len(exp), 1) if exp else None)
    conn_cov = {}
    for key in ("pid", "process_schedules", "isometric", "route"):
        vals = [c["coverage"][key] for c in connections if c["coverage"][key] is not None]
        # P&ID shows process pipes (+ instruments/valves), NOT electrical power
        # cables or signal wires — those belong on the SLD / network drawing.
        # Excluding non-pipe connections from the P&ID applicable set corrects
        # the denominator so the coverage % is honest (universal — keyed by kind).
        applic = [c for c in connections
                  if not (key == "isometric" and "pipe" not in c["kind"])
                  and not (key == "pid" and "pipe" not in c["kind"])]
        pres = sum(1 for c in applic if c["coverage"][key])
        conn_cov[key] = dict(present=pres, applicable=len(applic),
                             pct=round(100 * pres / len(applic), 1) if applic else None)
    # `not_found` is narrowed to the TRUE residual (the honest, still-open research
    # gap) — the other three honest sub-categories get their OWN tally below, never
    # folded back in here. This is the whole fix: the Part names scorer + every other
    # consumer already reads only `pl.get("not_found")` / `pl.get("orphan_equipment")`
    # (verified — see the module-level comment above `_not_found_substatus`), so
    # narrowing this ONE list is sufficient; no downstream consumer needs a change.
    not_found = [e["tag"] for e in equipment
                 if e["status"] == "NOT FOUND" and e.get("not_found_status") == "NOT FOUND"]
    fabricated_equipment = [e["tag"] for e in equipment if e.get("not_found_status") == "FABRICATED"]
    architecturally_excluded_equipment = [e["tag"] for e in equipment
                                          if e.get("not_found_status") == "ARCHITECTURALLY-EXCLUDED"]
    oem_proprietary_equipment = [e["tag"] for e in equipment if e.get("not_found_status") == "OEM-PROPRIETARY"]
    # 2026-07-04 one-truth name-family split (fix 2) — each its OWN visible tally,
    # never folded back into `not_found` above (same discipline as the three above).
    commodity_fitting_equipment = [e["tag"] for e in equipment if e.get("not_found_status") == "COMMODITY-FITTING"]
    boundary_stub_equipment = [e["tag"] for e in equipment if e.get("not_found_status") == "BOUNDARY-STUB"]
    scope_documented_equipment = [e["tag"] for e in equipment if e.get("not_found_status") == "SCOPE-DOCUMENTED"]
    gapped = [e for e in equipment if e["gaps"]]

    # ── connectivity audit (type-aware) ────────────────────────────────────────
    # What "connected" means depends on the part TYPE:
    #
    # PROCESS EQUIPMENT (vessel, rotating, exchanger, separator, valve):
    #   Must have ≥1 input AND ≥1 output — something flows in, something flows out.
    #   Missing either = genuine topology gap.
    #
    # INSTRUMENTS (sensor, analyser, gauge):
    #   Must have ≥1 connection (input OR output) — it's associated with what it
    #   measures. Two connections is normal (sense + signal), one is minimum.
    #   Zero connections = orphan sensor, not wired to anything.
    #
    # ELECTRICAL (breaker, busbar, contactor, transformer):
    #   Must have ≥1 input AND ≥1 output — power flows through.
    #   Missing = wiring gap.
    #
    # CONTROL (PLC, controller, HMI):
    #   Must have ≥1 connection — at least a signal connection.
    #
    # STRUCTURAL/PASSIVE (frames, panels, doors, cladding, foundations):
    #   No process connections expected. Never flagged.
    #
    # ORIGINS (grid, water supply, feed, fuel, air intake):
    #   Legitimate start points — no input required, but SHOULD have output.
    #
    # SINKS (drains, effluent, waste, exhaust):
    #   Legitimate end points — no output required, but SHOULD have input.

    # Hoisted to module level (_ORIGIN_KEYWORDS / _SINK_KEYWORDS, 2026-07-04) so
    # _passive_boundary_concern shares the SAME noun signal — no second copy to drift.
    ORIGIN_KEYWORDS = _ORIGIN_KEYWORDS
    SINK_KEYWORDS = _SINK_KEYWORDS
    # a BUFFER / SURGE / EXPANSION vessel is a DEAD-LEG on the loop: it tees off at a
    # single point to absorb thermal expansion / pressure surge / level swing, so it
    # legitimately has ONE process connection (not a flow-through in + out). Universal —
    # keyed on the vessel ROLE word, no per-part table.
    BUFFER_KEYWORDS = {"expansion", "surge", "buffer", "accumulator", "balance tank",
                       "break tank", "header tank", "expansion vessel", "expansion reservoir"}

    PROCESS_TYPES = {"vessel", "rotating", "exchanger", "separator", "valve"}
    ELECTRICAL_TYPES = {"electrical"}
    INSTRUMENT_TYPES = {"instrument"}
    CONTROL_TYPES = {"control"}
    PASSIVE_TYPES = {"structural", "other"}
    # AIR-SERVICE / SUB-COMPONENT parts that get a PROCESS etype ("rotating" blower,
    # "exchanger" HVAC unit, an MBBR media fill) but carry AIR or belong to a PARENT —
    # NOT a process-WATER flow-through node. Their correct tie is an air line / a parent
    # edge, so requiring a water in+out is wrong (it deflated the coverage to 74 %). This
    # mirrors the connection_ledger completeness audit's air-mover + sub-component
    # exemptions, so the two connectivity gates agree. (Tristan 2026-06-20.)
    AIR_OR_SUBCOMPONENT_KEYWORDS = {
        "blower", "fan", "ventilation", "dehumidifier", "hrv", "air handling",
        "air handler", "ahu", "hvac", "extract air", "supply air", "ducting",
        "media", "carrier", "biofilm carrier", "screen panel", "mesh panel",
        "filter element", "backwash",
        # FINAL-CONTROL ELEMENTS (actuators on a line, not flow-through nodes), SUB-
        # COMPONENTS (a filter's own screen), and DRY material-handling stations (solids,
        # not process water) are NOT process-WATER both-fluid nodes — requiring each to
        # have its own fluid in+out wrongly deflated coverage to 76 % (Tristan 2026-06-21).
        # The STRICT connection-ledger completeness check models each part's REAL required
        # ties and already passes them; it stays the authoritative gate + the backstop for a
        # genuinely disconnected part. Universal role keywords, no per-class table.
        "control valve", "solenoid", "diffuser", "filter screen", "drum filter screen",
        "feed storage", "feed distribution", "feed system", "grading", "harvest",
        "mortality", "live-fish handling", "biosecurity",
        # SAFETY-RELIEF devices are DEAD-LEG taps off a protected vessel discharging to
        # atmosphere / flare / a header — NOT inline flow-through nodes. Like a buffer or
        # a control valve they do not carry the process loop, so requiring each to have
        # its own fluid in+out is a false orphan (the PSV on a reactor reads "no upstream"
        # because the relief tap is not drawn as a process line). Universal role keywords.
        "relief valve", "safety valve", "pressure-relief", "pressure relief", "psv",
        "rupture disc", "bursting disc", "vacuum breaker", "breather valve", "vent valve",
        # PNEUMATIC ACTUATORS / ACTUATED VALVES are FINAL-CONTROL elements on a line (the same role as
        # the already-exempt "control valve"/"solenoid") — not flow-through nodes. SAMPLE valves are
        # DEAD-LEG taps (like a PSV). MEMBRANE ELEMENTS are the internal media of a membrane bank/skid
        # (the bank is the process node; its elements are sub-components). Requiring each to carry its
        # own fluid in+out is a false orphan that deflated water_treatment coverage to 67 % (2026-06-26).
        "pneumatic actuat", "actuated valve", "actuator", "sample valve", "sample point",
        "membrane element", "membrane elements", "ro membrane element",
        # CHECK / NON-RETURN valves are inline final elements (like a control valve), not flow-through
        # nodes. MEMBRANE HOUSINGS / pressure-vessel tubes are the RO/UF SKID's sub-components (the skid
        # is the process node). "ro membrane" (the membrane stack itself) is internal to the skid too.
        "check valve", "non-return", "nrv", "membrane housing", "membrane housings",
        "pressure vessel housing", "ro membrane", "uf membrane", "membrane bank",
        # CHEMICAL STOCK / DAY / DOSING tanks (A/B fertiliser concentrate, acid, caustic, nutrient) are
        # filled by EXTERNAL DELIVERY (drums / IBC / manual top-up), NOT a piped process line — they are
        # a process-fluid SOURCE with an output to the dosing pump and no piped INPUT. Requiring a piped
        # fluid input is a false orphan (the fill is off-system). Universal for any chemical day-tank.
        "nutrient tank", "stock tank", "day tank", "concentrate tank", "dosing tank", "chemical tank"}

    connectivity_concerns = []
    origin_parts = []
    sink_parts = []
    n_process_total = 0
    n_process_connected = 0
    n_instrument_total = 0
    n_instrument_associated = 0
    n_electrical_total = 0
    n_electrical_connected = 0

    # ── identity folding (universal — fixes the duplicate-line false orphan) ─────
    # The SAME physical part appears as several BoM lines (e.g. "Level Transmitter"
    # at 10 tanks + 1 sump + 8 lines = three rows, one IDENTITY; "Inlet Flow Control
    # Valve" ×3). The connection schedule wires ONE edge per identity (LT → Main
    # Controller), and resolve() attaches it to ONE row — so the other rows read 0/0
    # and were counted as separate orphans, deflating the %. Connectivity is a
    # property of the part IDENTITY (tag + normalised name), NOT of each duplicate
    # line: if ANY row of an identity carries the connection, the identity is wired,
    # and the identity counts ONCE. Keyed on (tag, norm-name) — no per-part table.
    ident_io: dict[tuple, dict] = {}
    for e in equipment:
        key = (str(e["tag"] or "—"), _norm(e["name"]))
        agg = ident_io.setdefault(key, {"has_in": False, "has_out": False})
        if e["inputs"]:
            agg["has_in"] = True
        if e["outputs"]:
            agg["has_out"] = True

    # A control system is present when ANY equipment is control-typed (SCADA / PLC / DCS /
    # control panel) — every field instrument reports its measurement to it (see the instrument
    # branch below; its signal wiring is on the P&ID, decluttered from the 3-D model).
    _control_present = any((str(e.get("type") or "")) in CONTROL_TYPES for e in equipment)

    seen_idents: set = set()
    for e in equipment:
        ident = (str(e["tag"] or "—"), _norm(e["name"]))
        # evaluate each IDENTITY exactly once (the first row carries the verdict);
        # later duplicate rows of the same identity are skipped for the tally.
        if ident in seen_idents:
            continue
        seen_idents.add(ident)
        agg = ident_io.get(ident, {"has_in": bool(e["inputs"]), "has_out": bool(e["outputs"])})
        has_in = agg["has_in"]
        has_out = agg["has_out"]
        has_any = has_in or has_out
        name_l = (e["name"] or "").lower()
        tag = e["tag"] or "—"
        etype = e.get("type", "other")
        is_origin = any(kw in name_l for kw in ORIGIN_KEYWORDS)
        is_sink = any(kw in name_l for kw in SINK_KEYWORDS)

        if is_origin and not has_in:
            origin_parts.append({"tag": tag, "name": e["name"], "type": etype})
        if is_sink and not has_out:
            sink_parts.append({"tag": tag, "name": e["name"], "type": etype})

        if etype in PASSIVE_TYPES:
            # X-140 THREAD FIX (Tristan 2026-07-04): a PASSIVE-typed part is normally
            # never a connectivity concern (genuinely structural — frames, cladding).
            # But the 'other' fallback ALSO catches parts TYPE_RULES has no pattern
            # for at all (e.g. 'Drain Connection', 'Zone valve connection kit') — the
            # origin/sink noun match just computed above (is_origin/is_sink) already
            # correctly identifies these as boundary nodes and tallies them into
            # origin_parts/sink_parts, but they were silently dropped HERE before a
            # real concern was ever raised — a genuinely-unconnected boundary part
            # (no drawn discharge) escaped the ledger completeness audit entirely.
            # Promote via the shared pure predicate; a truly-structural part with no
            # origin/sink noun match stays exempt (untouched).
            _pbc = _passive_boundary_concern(e["name"], has_in, has_out)
            if _pbc is not None:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype, **_pbc})
            continue

        # AIR-mover / HVAC / sub-component: carries AIR or belongs to a parent, NOT a
        # process-WATER flow-through node — its air/parent tie is the correct connection,
        # so it must not be counted in the process-WATER both-fluid coverage (else a
        # blower/ventilation unit wrongly drags the % down). Aligns with the
        # connection_ledger audit's exemptions. (Tristan 2026-06-20 connectivity fix.)
        if etype in PROCESS_TYPES and any(kw in name_l for kw in AIR_OR_SUBCOMPONENT_KEYWORDS):
            continue

        is_buffer = any(kw in name_l for kw in BUFFER_KEYWORDS)

        if etype in PROCESS_TYPES:
            # An INLINE VALVE is a FINAL ELEMENT mounted ON a pipe run — the connection
            # schedule routes EQUIPMENT↔EQUIPMENT, so no bare valve ever carries its own
            # drawn fluid in+out. Requiring one produced a per-NOUN whack-a-mole of
            # exemptions (control/solenoid 2026-06-21, PSV/sample/check 2026-06-26) and
            # plain inlet/drain/manual-ball valves STILL failed 2026-07-02, deflating
            # water_treatment coverage to 76% < 80%. Fix the RULE, not the noun list:
            # the valve TYPE leaves the flow-through denominator entirely. Its drawing
            # presence is already scored by the ISA-bubble P&ID credit above, and a
            # genuinely missing valve tie stays caught by the STRICT connection-ledger
            # completeness audit (the authoritative gate). Universal — keyed on etype.
            if etype == "valve":
                continue
            n_process_total += 1
            # a BUFFER / surge / expansion vessel is a DEAD-LEG — one tie is correct, so
            # it only needs ≥1 connection (in OR out), like an instrument's association.
            if is_buffer:
                if has_in or has_out:
                    n_process_connected += 1
                else:
                    connectivity_concerns.append({
                        "tag": tag, "name": e["name"], "type": etype,
                        "issue": "missing_connection",
                        "detail": "Buffer/surge/expansion vessel not tied to the loop — "
                                  "a dead-leg vessel still needs its single tee connection."})
                continue
            needs_in = not is_origin
            needs_out = not is_sink
            ok = True
            if needs_in and not has_in:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "missing_input",
                    "detail": f"Process equipment with no upstream connection — "
                              f"nothing feeds into this {etype}. The topology is incomplete."})
                ok = False
            if needs_out and not has_out:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "missing_output",
                    "detail": f"Process equipment with no downstream connection — "
                              f"nothing leaves this {etype}. Where does the flow go?"})
                ok = False
            if ok:
                n_process_connected += 1

        elif etype in INSTRUMENT_TYPES:
            n_instrument_total += 1
            # A field instrument reports its measurement to the control system BY DEFINITION;
            # that signal wiring lives on the P&ID / loop diagram and is deliberately
            # DECLUTTERED from the 3-D model + connection schedule (0 signal rows drawn), so a
            # ×N field transmitter often carries no discrete DRAWN edge even though it is wired.
            # Requiring a drawn edge is then a FALSE ORPHAN (2026-07-01): if the plant HAS a
            # control system, every instrument associates to it. A run-to-run flapper too — the
            # LLM authors a signal grammar-link for some transmitters and not others. Credit the
            # instrument when a control system exists; only a genuinely CONTROL-LESS plant leaves
            # an instrument orphan. Deterministic — keyed on the presence of a control-typed part.
            if has_any or _control_present:
                n_instrument_associated += 1
            else:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "orphan_instrument",
                    "detail": "Sensor/analyser with no connection AND no control system in the "
                              "plant — nothing for it to report its measurement to."})

        elif etype in ELECTRICAL_TYPES:
            n_electrical_total += 1
            # A TERMINAL / PASSIVE electrical device legitimately has no downstream
            # LOAD edge — it is the END of a circuit, not a distributor: a fuse / surge
            # protector (SPD) / protective relay protects the bus it taps; a cable tray
            # / terminal block / enclosure panel is passive containment. These need a
            # power feed IN (where present) but NOT an OUT — the electrical analogue of
            # a process SINK. Universal, name-only (no class table). A part with NO
            # required electrical role at all (a pure enclosure with no power feed) is
            # not a concern in either direction.
            is_terminal_elec = bool(re.search(
                r"\bfuse\b|surge|\bSPD\b|protective relay|protection relay|safety relay|"
                r"motor[- ]?protection|\bMPCB\b|earth leakage|\bRCD\b|\bRCBO\b|\bMCB\b|"
                r"cable tray|terminal block|enclosure|junction box|\bgland\b",
                name_l, re.I))
            needs_in = not is_origin and not (is_terminal_elec and not has_any)
            needs_out = not is_sink and not is_terminal_elec
            ok = True
            if needs_in and not has_in:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "missing_input",
                    "detail": f"Electrical component with no upstream power supply."})
                ok = False
            if needs_out and not has_out:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "missing_output",
                    "detail": f"Electrical component with no downstream load."})
                ok = False
            if ok:
                n_electrical_connected += 1

        elif etype in CONTROL_TYPES:
            if not has_any:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "orphan_controller",
                    "detail": "Controller with no signal connections — not wired "
                              "to anything it controls."})

    # orphan = a PROCESS-type IDENTITY with no edge on ANY of its rows (identity-
    # folded, same as the connectivity tally — a duplicate line whose sibling row
    # carries the edge is not an orphan).
    orphans = []
    _orph_seen: set = set()
    for e in equipment:
        if e["type"] not in PROCESS_TYPES:
            continue
        # FABRICATED items (a manifold header, a structural take-off …) are unpenalised
        # by the orphan check — the take-off IS the part; by nature it does not
        # necessarily carry the conventional equipment-to-equipment tie this check
        # looks for. Same exemption discipline as AIR_OR_SUBCOMPONENT_KEYWORDS above.
        # ARCHITECTURALLY-EXCLUDED (2026-07-04, F-2 fix): a pinless membrane/media row is
        # honestly excluded from catalogue-identity research BY DESIGN (see
        # `_not_found_substatus`'s docstring) — its own basis ALREADY discloses it has no
        # conventional equipment-to-equipment tie either (a membrane BANK's own elements
        # are its internals, not a separate flow-through node); the orphan check must
        # honour that disclosed reason exactly like FABRICATED, not silently ignore it
        # (F-2 'Uf Membrane Bank' was flagged an orphan despite its own honest basis).
        if e.get("not_found_status") in ("FABRICATED", "ARCHITECTURALLY-EXCLUDED"):
            continue
        # PARAMETRIC network/kit take-off rows (2026-07-04, V-110/V-111 fix): the row's
        # OWN basis states "engineered allowance, NOT per-pipe routed" — a materials-count
        # aggregate (a run of metres, a count of connection kits), not a discrete flow-
        # through node, so it structurally cannot carry the conventional equipment-to-
        # equipment tie this check looks for — same exemption discipline as FABRICATED.
        # Universal: status-keyed, not name-keyed — the 9 sibling PARAMETRIC rows already
        # escape this loop by TYPE ('other'); V-110/V-111 only differ because their
        # generic descriptive NAME happens to contain the word 'valve', tripping
        # `_classify` into type='valve' (in PROCESS_TYPES) — a naming accident, not a
        # real topology distinction from their 9 exempt siblings.
        if e.get("status") == "PARAMETRIC":
            continue
        ident = (str(e["tag"] or "—"), _norm(e["name"]))
        if ident in _orph_seen:
            continue
        _orph_seen.add(ident)
        agg = ident_io.get(ident, {})
        if not agg.get("has_in") and not agg.get("has_out"):
            orphans.append(e["tag"])

    uncov_conn = [f"{c['from_part']}→{c['to_part']}" for c in connections
                  if "pipe" in c["kind"] and not c["coverage"]["pid"]]

    for e in equipment:
        e.pop("ikey", None)

    # ── tool summary: which tools computed what, how many parts they cover ──────
    tool_summary: dict[str, dict] = {}
    for e in equipment:
        for t in (e.get("tools") or []):
            tid = t["tool_id"]
            if tid not in tool_summary:
                tool_summary[tid] = dict(
                    tool_id=tid, tool_name=t["tool_name"],
                    n_parts=0, n_calculations=0, n_claims=0,
                    sample_calculations=[])
            ts = tool_summary[tid]
            ts["n_parts"] += 1
            ts["n_calculations"] += len(t.get("calculations") or [])
            ts["n_claims"] += len(t.get("claims") or [])
            for calc in (t.get("calculations") or [])[:1]:
                if len(ts["sample_calculations"]) < 3:
                    ts["sample_calculations"].append(dict(
                        part=f"{e['tag']} {e['name'][:20]}",
                        label=calc.get("label"),
                        substitution=calc.get("substitution")))
    # parts with NO tool provenance
    parts_without_tools = [e["tag"] for e in equipment if not e.get("tools")]

    # ── CABINETS — house every small electrical/control device + prove its connectors ──
    _concern_tags = {c["tag"] for c in connectivity_concerns}
    cabinets = _build_cabinets(equipment, _concern_tags)

    report = dict(out_dir=str(out_dir), grand_total_gbp=round(grand), n_equipment=len(equipment),
                  n_connections=len(connections),
                  connections_gbp=round(sum(c["line_gbp"] or 0 for c in connections)),
                  coverage_by_drawing=by_drawing, connection_coverage=conn_cov,
                  not_found=not_found, n_gapped=len(gapped), orphan_equipment=orphans,
                  # honest NOT-FOUND sub-statuses (2026-07-04 round-4 dissection, fix 1) —
                  # each its OWN visible tally, never folded back into `not_found` above.
                  fabricated_equipment=fabricated_equipment,
                  architecturally_excluded_equipment=architecturally_excluded_equipment,
                  oem_proprietary_equipment=oem_proprietary_equipment,
                  commodity_fitting_equipment=commodity_fitting_equipment,
                  boundary_stub_equipment=boundary_stub_equipment,
                  scope_documented_equipment=scope_documented_equipment,
                  n_connections_off_pid=len(uncov_conn),
                  n_ambiguous_tags=len(ambiguous_tags),
                  ambiguous_tags=sorted(ambiguous_tags),
                  n_tools=len(tool_summary),
                  n_parts_without_tools=len(parts_without_tools),
                  parts_without_tools=parts_without_tools[:30],
                  tool_summary=list(tool_summary.values()),
                  equipment=equipment, connections=connections,
                  connectivity=dict(
                      n_concerns=len(connectivity_concerns),
                      concerns=connectivity_concerns,
                      n_origins=len(origin_parts), origins=origin_parts,
                      n_sinks=len(sink_parts), sinks=sink_parts,
                      n_process_total=n_process_total,
                      n_process_connected=n_process_connected,
                      n_instrument_total=n_instrument_total,
                      n_instrument_associated=n_instrument_associated,
                      n_electrical_total=n_electrical_total,
                      n_electrical_connected=n_electrical_connected,
                      n_orphans=len(orphans)),
                  # ledger ties whose endpoint no longer exists in the DELIVERED design
                  # (wired by Blender mid-chain, part removed later) — disclosed, never
                  # attached as live connections (2026-07-02 phantom-reference fix).
                  n_stale_ties=len(stale_ties), stale_ties=stale_ties,
                  cabinets=cabinets)
    (out_dir / "parts-ledger.json").write_text(json.dumps(report, indent=1))

    # ── printed ledger + coverage ──
    print(f"\n  LEDGER (BoM + connectivity + coverage + tools) — {out_dir.name}   "
          f"£{round(grand):,} raw materials   {len(equipment)} parts + {len(connections)} connections   "
          f"{len(tool_summary)} tools invoked")
    hdr = ("  " + f"{'tag':7}{'type':10}{'name':22}{'£ line':>9} {'in/out':>6} {'status':9}{'tool':>16}"
           + "".join(f"{SHORT[k]:>5}" for k in REPS))
    print(hdr); print("  " + "-" * (len(hdr) - 2))
    for e in equipment:
        cells = "".join(f"{'  ✓':>5}" if e["coverage"].get(k) else
                        (f"{'  ✗':>5}" if k in e["expected"] else f"{'  ·':>5}") for k in REPS)
        lg = f"{e['line_gbp']:>8,.0f}" if e.get("line_gbp") is not None else "       —"
        io = f"{len(e['inputs'])}/{len(e['outputs'])}"
        etools = (e.get("tools") or [])
        tshort = etools[0]["tool_id"].split(":")[-1][:15] if etools else "—"
        if len(etools) > 1:
            tshort += f" +{len(etools)-1}"
        print(f"  {e['tag']:7}{e['type']:10}{e['name'][:21]:22}{lg} {io:>6} "
              f"{str(e['status'] or '')[:8]:9}{tshort:>16}{cells}")
    print("  " + "-" * (len(hdr) - 2))
    part_cov = "   ".join(f"{SHORT[k]} {by_drawing[k]['present']}/{by_drawing[k]['expected']}"
                          for k in REPS if by_drawing[k]['expected'])
    print(f"  PART coverage by drawing (present / expected):   {part_cov}")
    cc = []
    for k in ("pid", "process_schedules", "isometric", "route"):
        d = conn_cov[k]
        pct = "" if d["pct"] is None else f" ({d['pct']}%)"
        cc.append(f"{k} {d['present']}/{d['applicable']}{pct}")
    print("  CONNECTION coverage (pipes/wires/sensors vs the views):   " + "   ".join(cc))
    # tool summary
    if tool_summary:
        print(f"  TOOLS invoked ({len(tool_summary)}):")
        for ts in sorted(tool_summary.values(), key=lambda x: -x["n_parts"]):
            print(f"    {ts['tool_id']:40} → {ts['n_parts']:3} parts  {ts['n_calculations']:3} calcs  {ts['n_claims']:3} claims")
            for s in ts.get("sample_calculations", [])[:1]:
                print(f"      └ {s.get('part','?')[:24]:24} {str(s.get('label',''))[:40]}")
    print(f"  → {len(not_found)} NOT FOUND (true gap) · {len(fabricated_equipment)} fabricated "
          f"(no catalogue identity by nature) · {len(architecturally_excluded_equipment)} "
          f"architecturally-excluded (membrane/media) · {len(oem_proprietary_equipment)} "
          f"OEM-proprietary (recorded finding) · {len(commodity_fitting_equipment)} "
          f"commodity-fitting (accessory/fastener, no catalogue identity by nature) · "
          f"{len(boundary_stub_equipment)} boundary-stub (connection endpoint, not a part) · "
          f"{len(scope_documented_equipment)} scope-documented (system/network/design label) · "
          f"{len(gapped)} parts w/ coverage gap · "
          f"{len(orphans)} orphan · {len(uncov_conn)} connections off the P&ID.  "
          f"{len(ambiguous_tags)} ambiguous tag(s) (name-corroborated).  "
          f"{len(parts_without_tools)}/{len(equipment)} parts have NO tool provenance.  "
          f"wrote parts-ledger.json")
    proc_pct = round(100 * n_process_connected / n_process_total, 1) if n_process_total else 0
    inst_pct = round(100 * n_instrument_associated / n_instrument_total, 1) if n_instrument_total else 0
    print(f"  → CONNECTIVITY: {len(connectivity_concerns)} concern(s) — "
          f"process {n_process_connected}/{n_process_total} connected ({proc_pct}%) · "
          f"instruments {n_instrument_associated}/{n_instrument_total} associated ({inst_pct}%) · "
          f"{len(origin_parts)} origin(s) · {len(sink_parts)} sink(s)\n")
    return 0


def _selftest() -> int:
    """proveCatch for _classify type assignment (Tristan 2026-06-27, P&ID-coverage work).
    An HMI 'Touchscreen' used to fall to `separator` because the bare `screen` token matched
    'touchSCREEN' — inflating the separator-expected drawing coverage with a control device.
    Now `\\bscreen\\b` matches a filtration screen but not a touchscreen, and the control rule
    recognises HMI / touchscreen / DCS / operator panel positively."""
    bad = 0
    cases = [
        ("HMI Touchscreen", "control"),
        ("Operator Interface Panel", "control"),
        ("PLC Controller", "control"),
        ("Drum Screen", "separator"),
        ("Microscreen Filter", "separator"),
        ("UF Membrane Bank", "separator"),
        ("Pressure Transmitter", "instrument"),
        ("Butterfly Valve", "valve"),
        ("Fresh Water Tank", "vessel"),
    ]
    cases += [
        ("Aquavista Remote Monitoring", "control"),   # telemetry, not a field instrument
        ("Remote Monitoring Gateway", "control"),
    ]
    cases += [
        # valve ETYPE routing — the 2026-07-02 connectivity fix keys on it: a part typed
        # `valve` is a FINAL ELEMENT on a line and leaves the flow-through (fluid in+out)
        # denominator entirely (`if etype == "valve": continue` in the tally loop). These
        # four deflated water_treatment coverage to 76% when counted as process nodes.
        ("Inlet Valve", "valve"),
        ("Drain Valve", "valve"),
        ("Manual Ball Valve", "valve"),
        ("Manifold Drain Valve", "valve"),
    ]
    for name, want in cases:
        got = _classify(name, "")
        if got != want:
            print(f"  FAIL _classify('{name}') = {got!r}, want {want!r}")
            bad += 1
    # _isa_letters: a water-quality analyser maps to AT; a valve to its valve symbol. The P&ID
    # coverage matcher credits the part when ITS function symbol is present in the drawing — so an
    # ORP/chlorine/TDS/leak sensor (an analyser) must map to AT, not to nothing (the gap that left
    # them P&ID-uncredited even though an AT bubble was drawn).
    isa_cases = [
        ("Orp Sensor", "AT"), ("Chlorine Sensor", "AT"), ("Tds Sensor", "AT"),
        ("Leak Detection Sensor", "AT"), ("Conductivity Sensor", "AT"),
        ("Solenoid Valves", "XV"), ("Check Valve", "NV"), ("Manual Ball Valve", "HV"),
        ("Pneumatic Actuated Valve", "XV"), ("Level Transmitter", "LT"), ("Pressure Transducer", "PT"),
    ]
    for name, want_first in isa_cases:
        letters = _isa_letters("", name)
        if not letters or letters[0] != want_first:
            print(f"  FAIL _isa_letters('{name}') = {letters!r}, want first {want_first!r}")
            bad += 1
    # TYPE_EXPECTED: a control device is panel-schedule contents, NOT a single-line power feeder.
    if "single-line-diagram" in TYPE_EXPECTED.get("control", set()):
        print("  FAIL: control type must NOT expect single-line (it is panel-schedule cabinet contents)")
        bad += 1
    if "panel-schedule" not in TYPE_EXPECTED.get("control", set()):
        print("  FAIL: control type must expect the panel-schedule")
        bad += 1
    # GA-EXPECTATION ↔ SCENE one-rule proveCatch (v58b GA coverage 24/37): a routed
    # distribution-network line item ('Zoned distribution — …' pipework take-off,
    # qty in the hundreds/thousands of metres) is dropped from the 3-D scene by the
    # SHARED ga_massing rule — so the ledger must NOT expect it on the render or the
    # GA either (the guaranteed absence of a part the scene correctly omits was
    # deflating GA coverage). A real massed principal in a distribution CONTEXT
    # ('Distribution Manifold') keeps both expectations — the rule is head-anchored.
    _zoned = [
        "Zoned distribution — department delivery mains",
        "Zoned distribution — delivery risers",
        "Zoned distribution — zone laterals (flood-fill lines)",
        "Zoned distribution — drain/return risers (gravity)",
        "Zoned distribution — drain collection lines",
        "Zoned distribution — main drain headers",
        "Zoned distribution — delivery inlet stubs, one per served position",
        "Zoned distribution — drain outlet connections (one per 2 positions)",
    ]
    for _zn in _zoned:
        _exp = TYPE_EXPECTED.get(_classify(_zn, ""), set())
        if ga_massing.is_ga_non_massing(_zn):
            _exp = _exp - {"blender", "general-arrangement"}
        if "general-arrangement" in _exp or "blender" in _exp:
            print(f"  FAIL ga-expectation: '{_zn}' is scene-dropped pipework take-off "
                  f"and must NOT be GA/render-expected (got {sorted(_exp)})")
            bad += 1
    for _kn in ("Distribution Manifold", "Drain Collection Sump", "Drain Transfer Pump"):
        _exp = TYPE_EXPECTED.get(_classify(_kn, ""), set())
        if ga_massing.is_ga_non_massing(_kn):
            _exp = _exp - {"blender", "general-arrangement"}
        if "general-arrangement" not in _exp:
            print(f"  FAIL ga-expectation: '{_kn}' is a massed principal and MUST stay "
                  f"GA-expected (got {sorted(_exp)})")
            bad += 1
    # ── X-140 THREAD proveCatch (Tristan 2026-07-04): a PASSIVE ('other')-typed
    # boundary nozzle whose noun matches SINK/ORIGIN_KEYWORDS still needs its ONE
    # required tie — both directions, plus the negative (a genuinely-structural
    # part with no origin/sink noun must stay exempt, never flagged). ──
    _bad_drain = _passive_boundary_concern("Drain Connection", has_in=False, has_out=False)
    if not _bad_drain or _bad_drain.get("issue") != "missing_output":
        print(f"  FAIL passive-boundary: an unconnected 'Drain Connection' (sink noun, "
              f"no output) must raise missing_output (got {_bad_drain!r})")
        bad += 1
    _ok_drain = _passive_boundary_concern("Drain Connection", has_in=False, has_out=True)
    if _ok_drain is not None:
        print(f"  FAIL passive-boundary: a 'Drain Connection' WITH a drawn output must "
              f"raise no concern (got {_ok_drain!r})")
        bad += 1
    _bad_origin = _passive_boundary_concern("Chemical Supply Skid", has_in=False, has_out=False)
    if not _bad_origin or _bad_origin.get("issue") != "missing_input":
        print(f"  FAIL passive-boundary: an unconnected origin-noun part with no input "
              f"must raise missing_input (got {_bad_origin!r})")
        bad += 1
    _structural = _passive_boundary_concern("Structural Support Beam", has_in=False, has_out=False)
    if _structural is not None:
        print(f"  FAIL passive-boundary: a genuinely-structural part (no origin/sink "
              f"noun) must NEVER be flagged (got {_structural!r})")
        bad += 1
    # ── NOT-FOUND STATUS SPLIT proveCatch (2026-07-04, round-4 dissection fix 1).
    # Per status, both directions: the positive fires on its own evidence, the
    # negative (a plain unpinned part with none of that evidence) stays the true,
    # honest 'NOT FOUND' residual. Real corpus examples (out/fischer-codema-v73). ──
    _fab_hit = _not_found_substatus(
        "Distribution Manifold",
        "distribution-manifold parametric: 45 m³/h delivery duty × £25/(m³·h) + £600 base "
        "— fabricated header + isolation/non-return valves + gauge tappings + supports")
    if _fab_hit != "FABRICATED":
        print(f"  FAIL not-found-substatus: a fabricated manifold must classify FABRICATED "
              f"(got {_fab_hit!r}) — a fabricated manifold must never count not-found")
        bad += 1
    _pump_hit = _not_found_substatus("Ro High Pressure Pump", "bottom-up parametric")
    if _pump_hit != "NOT FOUND":
        print(f"  FAIL not-found-substatus: an unpinned pump with a plain parametric basis "
              f"must stay the true NOT FOUND residual (got {_pump_hit!r})")
        bad += 1
    _mem_hit = _not_found_substatus(
        "Ro Membrane Elements",
        "membrane-area parametric: 364 m² × £25/m² (spiral-wound/UF module supply, "
        "UK-2026; NOT a steel take-off)")
    if _mem_hit != "ARCHITECTURALLY-EXCLUDED":
        print(f"  FAIL not-found-substatus: a pinless membrane row must classify "
              f"ARCHITECTURALLY-EXCLUDED (got {_mem_hit!r})")
        bad += 1
    _oem_hit = _not_found_substatus(
        "Veolia Ro40 Controller",
        "bottom-up parametric · OEM-proprietary — no public MPN (verified 2026-07-04: "
        "Veolia Water Technologies RO40)")
    if _oem_hit != "OEM-PROPRIETARY":
        print(f"  FAIL not-found-substatus: a recorded no-public-MPN finding must classify "
              f"OEM-PROPRIETARY (got {_oem_hit!r})")
        bad += 1
    _oem_neg = _not_found_substatus("Some Controller", "bottom-up parametric")
    if _oem_neg != "NOT FOUND":
        print(f"  FAIL not-found-substatus: a merely-unpriced controller with NO recorded "
              f"finding must NOT self-declare OEM-PROPRIETARY (got {_oem_neg!r})")
        bad += 1
    # priority: a recorded OEM finding on a membrane-named part must win OEM-PROPRIETARY
    # (the more specific, verified evidence), never fall through to the architectural
    # exclusion — proves the two categories never silently swap.
    _oem_over_mem = _not_found_substatus(
        "Ro Membrane Elements",
        "membrane-area parametric · OEM-proprietary — no public MPN (verified)")
    if _oem_over_mem != "OEM-PROPRIETARY":
        print(f"  FAIL not-found-substatus: a recorded OEM finding must take priority over "
              f"the membrane-family classification (got {_oem_over_mem!r})")
        bad += 1
    # ── ONE-TRUTH NAME-FAMILY proveCatch (2026-07-04, fix 2) — real Codema v76 rows,
    # both directions: every family member reclassifies off a bare 'bottom-up parametric'
    # basis (no distinguishing basis text exists for any of these); a real unresearched
    # catalogue part with the SAME generic basis stays the true NOT FOUND residual. ──
    _commodity_cases = [
        "3 Part Union Fittings", "Leveling Feet", "Flexmount Connectors",
        "Cip System Connections", "Terminal Block", "Hydraulic Connectors",
        "Compartment Spacers", "Module Support System", "Cable Glands", "DC Power Cabling",
    ]
    for _nm in _commodity_cases:
        _hit = _not_found_substatus(_nm, "bottom-up parametric", "other")
        if _hit != "COMMODITY-FITTING":
            print(f"  FAIL not-found-substatus: {_nm!r} must classify COMMODITY-FITTING "
                  f"(mirrors ga_massing.GA_NON_MASSING_RE) — got {_hit!r}")
            bad += 1
    for _nm in ("Permeate Outlet", "Concentrate Outlet"):
        _hit = _not_found_substatus(_nm, "bottom-up parametric", "other")
        if _hit != "BOUNDARY-STUB":
            print(f"  FAIL not-found-substatus: {_nm!r} must classify BOUNDARY-STUB "
                  f"(bare process-connection endpoint) — got {_hit!r}")
            bad += 1
    _stub_neg = _not_found_substatus("Outlet Damper Assembly", "bottom-up parametric", "other")
    if _stub_neg == "BOUNDARY-STUB":
        print(f"  FAIL not-found-substatus: 'Outlet Damper Assembly' is a real device whose "
              f"head noun is 'Assembly', not a bare stub — must NOT classify BOUNDARY-STUB")
        bad += 1
    _scope_design = _not_found_substatus("Modular Stack Design", "bottom-up parametric", "other")
    if _scope_design != "SCOPE-DOCUMENTED":
        print(f"  FAIL not-found-substatus: 'Modular Stack Design' (ga_massing design-"
              f"metadata head noun) must classify SCOPE-DOCUMENTED — got {_scope_design!r}")
        bad += 1
    for _nm in ("Piping Network", "Cip System"):
        _hit = _not_found_substatus(_nm, "bottom-up parametric", "other")
        if _hit != "SCOPE-DOCUMENTED":
            print(f"  FAIL not-found-substatus: {_nm!r} (bare System/Network aggregate "
                  f"label, typ='other') must classify SCOPE-DOCUMENTED — got {_hit!r}")
            bad += 1
    # a genuine control/electrical '*System' is typed upstream by TYPE_RULES (SCADA /
    # controller / PLC keyword) and never reaches the generic System/Network fallback —
    # simulated here by passing typ='control' as _classify() would return for it.
    _ctrl_neg = _not_found_substatus("Control System", "bottom-up parametric", "control")
    if _ctrl_neg == "SCOPE-DOCUMENTED":
        print("  FAIL not-found-substatus: a control-typed '*System' (typ != 'other') "
              "must NOT be swept into SCOPE-DOCUMENTED by the generic System/Network rule")
        bad += 1
    # proveCatch the other direction — real, still-unresearched catalogue-class parts
    # (pump/VFD/motor-starter/valve-assembly/instrument-interface/transformer) sharing the
    # SAME bare 'bottom-up parametric' basis as every family member above must stay the
    # true NOT FOUND residual; none of the three new families may over-reach into them.
    for _nm in ("Motor Starter", "Vfd Drive", "Vfd Controller", "Modbus Interface",
                "Pneumatic Actuated Valves", "Ro High Pressure Pump", "Gac Filter",
                "Gac Softener", "Transformer", "Overcurrent Protection",
                "Pressure Relief Valve", "Pneumatic Control Valve"):
        _hit = _not_found_substatus(_nm, "bottom-up parametric", "other")
        if _hit != "NOT FOUND":
            print(f"  FAIL not-found-substatus OVER-REACH: {_nm!r} is a real unresearched "
                  f"catalogue part and must stay NOT FOUND — got {_hit!r}")
            bad += 1
    print("parts_ledger selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


if __name__ == "__main__":
    if "--selftest" in sys.argv[1:]:
        raise SystemExit(_selftest())
    raise SystemExit(main())
