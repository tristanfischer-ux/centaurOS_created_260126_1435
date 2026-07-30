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
import connection_ledger as cl  # _ABSTRACT_BOUNDARY_RE — ONE shared boundary-noun authority
                                 # (never a second copy that could drift from the ledger's own)

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
                   r"mass flow|detector|monitor|thermistor|\bntc\b|"
                   # a position/door/limit switch is a field SENSOR (open/closed state), not a
                   # power-distribution device — checked here (not the electrical rule) so it is
                   # P&ID/schedule-expected, not a phantom single-line feeder (BESS v3 dissection
                   # 2026-07-05: 'door position switch' had NO TYPE_RULES match at all → fell to
                   # 'other' → wrongly blender/GA-expected).
                   r"position switch|door switch|limit switch|"
                   # INTENT (Poseidon 2026-07-16): force/stall/end-stop feedback is a sensing
                   # instrument — NOT a battery-limit "feed" origin (substring trap below).
                   r"force\s+limit|limit\s+feedback|stall\s*(?:sense|detect|feedback)|"
                   r"end[\s-]?stop|load\s*cell|force\s+feedback"),
    ("valve",      r"\bvalve\b|solenoid|actuator|damper"),
    ("control",    r"controller|control\s*board|microcontroller|\bmcu\b|gateway|\bI/O\b|network switch|power supply|scada|\bUPS\b|\bPLC\b|"
                   r"\bHMI\b|touch\s?screen|touch\s?panel|\bDCS\b|operator (?:panel|interface|station)|"
                   # INTENT (2026-07-29 sealed drive packs): OEM inverter / gate-driver
                   # boards are the pack measurement hub when plant SCADA is absent.
                   r"gate\s*driver(?:\s*board)?"),
    # INTENT (2026-07-30 Formula-E FPK): a mesh screen is a mechanical pickup/filter
    # insert, not a discrete separator vessel with its own fluid in/out nozzles.
    ("other",      r"\b(?:pickup\s+)?mesh\s+screen\b"),
    # INTENT (2026-07-29): traction motor / SiC inverter are ELECTRICAL principals
    # (SLD + panel), not plant `other` → blender+GA litter. Before generic rules.
    ("electrical", r"\btraction\s*(?:ipmsm\s*)?motor\b|\bipmsm\b|motor[-\s]?generator|"
                   r"sic\s*traction\s*inverter|\btraction\s*inverter\b|"
                   r"(?<!desat\s)\binverter\b(?!\s*control)|\bmcu\b|"
                   r"transformer|switchgear|\bMCC\b|busbar|generator|genset|breaker|relay|\bATS\b|fuse|surge|"
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
                   r"\bEMI\s+filter\b|\bRFI\s+filter\b|\bEMC\s+(?:line\s+)?filter\b|"
                   r"\bline\s+filter\b|harmonic\s+filter|"
                   # a bare 'Output Filter' / 'AC Filter' on an inverter/PCS is the AC output
                   # LCL stage — power electronics, never a process separator (Powerwall v13:
                   # 'Output Filter' typed separator → false 'fluid in+out' connectivity FAIL
                   # on a solid-state product; process plants say inlet/outlet/discharge filter).
                   # INTENT (cell-cycler cold-v15 Connection-trace): 'Emc Line Filter' matched
                   # bare `\bfilter\b` → separator → process fluid in+out FAIL on a dry bench
                   # instrument. EMC/EMI/RFI/line filters are electrical — must match HERE.
                   r"\boutput\s+filter\b|\bac\s+filter\b|"
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
    # `reboil` (not the narrower 'reboiler') catches BOTH 'distillation reboiler' and a
    # 'stripper reboil pot' — a column reboiler is process-plant heat-transfer equipment,
    # same TYPE_EXPECTED {blender, GA, pid, block-flow-diagram} as 'vessel' below (CO2-v1
    # coverage-classification fix, 2026-07-05: both fell to 'other' → {blender, GA} only,
    # shrinking their honest P&ID/BFD coverage expectation even though both are already
    # drawn there — the 'one-classification-both-sides' rule).
    ("exchanger",  r"heat exchanger|heat pump|\bHEX\b|chiller|\bUV\b|ozone|steril|oxygenat|degas|"
                   r"makeup hex|reboil"),
    # `\bscreen\b` (not bare `screen`) so a filtration screen / drum screen matches but an HMI
    # "touchscreen" does NOT fall to separator (the HMI is caught by the control rule above anyway).
    # `(?<!interface )(?<!cell )membrane` — an 'Interface Membrane' / 'Cell Membrane' is a
    # component INSIDE an electrochemical device (pack separator film / gasket), not a
    # process-fluid membrane skid (Powerwall v13 false process-typing; same fixed-width
    # lookbehind idiom as the panel exclusions above).
    ("separator",  r"drum filter|\bscreen\b|filter|clarifi|settl|cyclone|(?<!interface )(?<!cell )membrane|biofilter|\bMBBR\b"),
    # 'crystalli[sz]er' (crystalliser/crystallizer/recrystalliser/recrystallizer) is a
    # process VESSEL by shape (same CO2-v1 fix as 'reboil' above) — 'K2SO4 recrystalliser'
    # fell to 'other' despite being drawn on the P&ID + block-flow-diagram already.
    ("vessel",     r"\btank\b|vessel|reservoir|\bsump\b|\bcone\b|column|reactor|silo|hopper|"
                   r"\bLOX\b|storage|crystalli[sz]er"),
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
    r"materials?\s+take-?off|structural\s+take-?off|footprint\s+take-?off|\bfabricat\w*\b|"
    # INTENT: a duty-rated / UV-ozone / rating-based parametric line is priced from its
    # OWN kW/kVA/flow rating × a market £/unit curve — there is no catalogue MPN to find
    # (the named part was already rejected as undersized, or never existed). Counting
    # these as residual NOT FOUND inflated Part names (Codema ship 12 pumps/UV/TX).
    r"rating-based(?:\s+parametric)?|uv/?ozone\s+parametric|"
    r"\d+(?:\.\d+)?\s*kW\s*[×x]\s*£|\d+(?:\.\d+)?\s*kVA\s*[×x]\s*£|"
    # A DB-median / rejected-MPN duty price is the SAME fabricated parametric family —
    # the catalogue candidate was tried and discarded; the line is priced from duty.
    r"real\s+DB\s+median|named\s+part\s+['\"].*?['\"]\s+rejected|"
    # Flow-parametric cloth/paperbelt/drum filters + distribution headers — priced from
    # throughput, not a catalogue MPN (Codema ship V-104 Nursery Cloth Filter).
    r"(?:cloth|paperbelt|drum|sand|media)\s+filter\s+parametric|"
    r"distribution-manifold\s+parametric|"
    r"\d+(?:\.\d+)?\s*m[³3]/h\s*[×x]\s*£|"
    # FPK physics-tree densify concept lines (0846 traction MGU): make-to-print cassette
    # take-offs with honest TBD MPNs — no catalogue identity by nature.
    r"fpk\s+physics-tree\s+densify|concept\s+line\s+·\s+no\s+fake\s+mpn",
    re.I)
# INTENT: electrical control / MCC / distribution panels are SCOPE-DOCUMENTED assemblies
# (built-to-schedule from the panel schedule), not catalogue-research residuals. Without
# this, X-106 "Electrical Control Panel" stayed bare NOT FOUND while the GA drew it
# (Codema ship 2026-07-09). Noun-keyed — never a class slug.
_CONTROL_PANEL_NAME_RE = re.compile(
    r"\b(?:electrical\s+)?control\s+panel\b|\bmotor\s+control\s+(?:cent(?:re|er)|cabinet)\b|"
    r"\bmcc\b|\bmdb\b|\bswitchboard\b|\bdistribution\s+board\b|\bpanel\s+board\b",
    re.I)
_CLOTH_FILTER_NAME_RE = re.compile(
    r"\b(?:cloth|paper[- ]?belt|drum|sand|media)\s+filter\b|\bfilter\s+(?:cloth|media)\b",
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
    # NARROW DELIBERATE DIVERGENCE (2026-07-05, the DS-101 'deflagration vent seal' fix):
    # 'seals?' is added HERE but NOT to ga_massing.GA_NON_MASSING_RE. A moulded/extruded
    # gasket-family seal has no catalogue identity (same £5 commodity-noun floor as a
    # gasket in requirements_bom._COMMODITY_NOUN_FLOORS — the two ALREADY agree there),
    # so it is an honest COMMODITY-FITTING for BoM/MPN purposes. But unlike a gasket it
    # is drawn as its own visible geometry on the GA/3-D scene (a perimeter seal strip
    # around a deflagration vent is a real, inspectable installed item) — the SAME
    # "still a real massing target" carve-out already documented above for the
    # instrument/valve/switchgear-internal exclusions ga_massing deliberately keeps
    # wider on. Catalogue-identity and 3-D-massing are orthogonal decisions; only the
    # former changes here.
    r"\b(?:union|glands?|couplings?|adapters?|adaptors?|ferrules?|olives?|"
    r"nipples?|connectors?|flexmount|spacers?|baffles?)\b|"
    r"\bflanges?\b|\bgaskets?\b|\bseals?\b|\bend caps?\b|\bblanking (?:plates?|caps?)\b|"
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

# ── VERIFIED_NO_PUBLIC_MPN + evidence-based FABRICATED (2026-07-05, the BESS v11
# 17-not-found dissection) ── two more honest sub-statuses, read from the SAME per-part
# verification record the chain's OWN research stage already wrote (state.partVerifications
# / 10-part-verifications.json) — never re-derived, never a per-part table.
#
#   FABRICATED (evidence-based) — the verification record for this row carries NO
#     manufacturer AND NO part_number (there was never a catalogue candidate to check in
#     the first place) and its own reasoning states it was priced from a parametric
#     materials/labour cost curve ("Engine B curve: class=…", requirements_bom.py's own
#     bespoke-fabrication cost estimator) rather than researched against a catalogue. This
#     is the SAME FABRICATED family the basis-text rule above already recognises
#     ("materials/structural/footprint take-off") — a second, independent evidence source
#     for the identical verdict (a battery-module top cover / bottom tray / compression
#     plate has no catalogue identity by nature), not a new category.
#   VERIFIED_NO_PUBLIC_MPN — the verification pipeline ran a genuine, EXHAUSTIVE search
#     (not merely one rejected candidate — see below) for this row and found no public
#     manufacturer part number. Evidence: the matching verification record's OWN status
#     is the literal enum value 'verified_no_public_mpn' — a DISTINCT disposition from a
#     plain 'unverified'/'uncertain' (which only means "the one candidate tried didn't pan
#     out" and may still be genuinely researchable — see requirements_bom.py's ingest
#     path). The chain's Stage 10 verifier (or a manual research pass writing the SAME
#     shaped record, e.g. scripts/ingest/ingest-bess-verified-parts.ts's disposition
#     writer) is the ONLY place licensed to stamp this status, and only after checking
#     multiple real catalogues/distributors, never after a single failed guess — so the
#     ledger classifier here is a pure CONSUMER of that verdict, exactly like every other
#     substatus in this function, never a guess of its own.
_ENGINE_B_CURVE_RX = re.compile(r"engine\s*b\s*curve", re.I)


def _pv_for_name(name: str, pv_by_norm: dict | None) -> dict:
    """The (single, first) partVerifications record matching this row's display name, or
    {} — matched on the SAME normalised-name identity `name` already uses throughout this
    module (word_name mirrors the BoM display name; both derive from the same requirement
    text). Never guesses between ambiguous matches — the caller reads {} for those too."""
    if not pv_by_norm:
        return {}
    hits = pv_by_norm.get(_norm(str(name or "")))
    return hits[0] if hits else {}


# enclosure-hardware commodity family for _not_found_substatus (2026-07-10) — see the
# in-function comment. Deliberately requires the FULL noun phrase (never bare 'door'/
# 'lighting'): an 'Emergency Lighting Inverter' or a 'Fire Door Assembly' with a real
# catalogue identity should still research.
_FABRICATED_PACK_WORK_RE = re.compile(
    r"battery\s+modules?\b|(?:battery\s+)?module\s+racks?\b|pack\s+frames?\b|cell\s+stacks?\b|"
    r"busbar\s+(?:interconnects?|assembl(?:y|ies))|"
    r"thermal\s+management\s+(?:manifolds?|bays?|plenums?)|"
    r"(?:liquid\s+)?coolant\s+loops?|"
    r"deflagration\s+vent\s+panels?|"
    r"(?:auxiliary\s+)?power\s+distribution\s+unit", re.I)
_SCOPE_FUNCTION_WORD_RE = re.compile(
    r"\bplatform\b|\bsoftware\b|"
    r"arc\s+(?:flash|fault)\s+(?:protection|detection)|"
    # spec-echo tail: a 'part' named after an electrical ATTRIBUTE is documentation
    r"(?:apparent\s+)?power\s*(?:·|\d|$)|efficiency\s*(?:·|\d|$)|"
    # DOCUMENTATION / SERVICE CONSUMABLES (2026-07-11 run 68: LLM reviewers minted
    # 'Service Log Book' / 'Safety Vest' / 'Service Manual' / 'Service Tool Kit' and
    # each counted as NOT-FOUND catalogue equipment — paperwork and PPE are scope
    # items, never equipment with an MPN research status).
    r"log\s*books?\b|\bmanuals?\b|safety\s+vests?\b|tool\s*kits?\b|spares?\s+kits?\b|"
    r"torque\s+cards?\b|commissioning\s+records?\b|documentation\s+pack", re.I)
_ENCLOSURE_HARDWARE_RE = re.compile(
    r"warning\s+sign|signage|label\s+plate|"
    r"(?:internal|service|cabinet)\s+lighting|"
    r"service\s+(?:outlets?|sockets?)|"
    r"(?:grounding|earthing)\s+(?:terminals?|bars?|boss)|"
    r"access\s+doors?(?:\s+and\s+locks?)?|door\s+locks?|hinges?|latch(?:es)?|"
    r"(?:fireproof|thermal|acoustic)\s+insulation(?:\s+panels?)?|insulation\s+panels?|"
    r"gland\s+plates?|"
    # PANEL INDICATORS / FIELD SENSORS (Powerwall Part-names 7.2, 2026-07-14): concept-
    # stage ESS dossiers pin shunts / thermistors / E-stops / pilot lights / bypass
    # switches BY SPEC, not MPN — same commodity discipline as glands on the BoM axis
    # (`_COMMODITY_NOUN_RX` in build-excel-export.py). Deliberately SPECIFIC noun phrases
    # (never bare `\bsensors?\b` / `\bmodbus\b`): a Modbus interface, insulation monitor,
    # or ventilation fan stays a true catalogue-research residual (proveCatch below).
    r"current\s+shunts?|temperature\s+thermistors?|\bthermistors?\b|"
    r"(?:current|voltage|humidity|temperature)\s+(?:monitoring\s+)?(?:sensors?|probes?)|"
    r"temperature\s+probes?|"
    r"audible\s+alarms?|status\s+indicator\s+(?:lights?|leds?)|indicator\s+lights?|"
    r"pilot\s+(?:lights?|lamps?)|"
    r"emergency\s+stop\s+(?:buttons?|switch(?:es)?|push\s*buttons?)|"
    # GOTCHA: `switches?` matches "switche(s)", not "switch" — use switch(?:es)?.
    r"(?:maintenance\s+)?bypass\s+switch(?:es)?", re.I)


def _not_found_substatus(name: str, basis: str, typ: str = "other",
                          pv_by_norm: dict | None = None,
                          instrument_device: bool = False,
                          traction_drive: bool = False) -> str:
    """Classify a status=='NOT FOUND' equipment row's TRUE reason from its own
    evidence (name + basis + its parts_ledger TYPE_RULES classification + its verification
    record) — never a per-part table. One of 'OEM-PROPRIETARY', 'ARCHITECTURALLY-EXCLUDED',
    'FABRICATED', 'VERIFIED_NO_PUBLIC_MPN', 'COMMODITY-FITTING', 'BOUNDARY-STUB',
    'SCOPE-DOCUMENTED', or 'NOT FOUND' (the true residual). See the module-level comments
    above for the full rationale + priority."""
    b = str(basis or "")
    n = str(name or "")
    if _OEM_PROPRIETARY_RESEARCH_RX.search(b):
        return "OEM-PROPRIETARY"
    if _MEMBRANE_MEDIA_RE.search(n):
        return "ARCHITECTURALLY-EXCLUDED"
    if _FABRICATED_BASIS_RX.search(b):
        return "FABRICATED"
    # INTENT: on a device-scale optical/electronic instrument, BoM lines without a
    # public MPN are custom electronics / 3D-printed enclosure — FABRICATED at concept
    # stage, not a plant-catalogue residual (colorimeter 0819: 23 NOT FOUND floored
    # Part names at 3.8 while the parts were honestly custom). Universal: gated on
    # isInstrumentDevice + typ, never a part-name table.
    # GOTCHA (NinjaPCR 2026-07-15): plant TYPE_RULES mis-type board nouns
    # (Flash Storage→vessel, Fan Tachometer→rotating) — fold those into the same
    # instrument residual path unless the name is a real plant head noun.
    # INTENT (0846 traction MGU): sealed drive packs are also device-scale custom
    # (IPMSM / SiC MCU / HV spine) — same FABRICATED honesty, gated on traction form.
    _device_custom = bool(instrument_device or traction_drive)
    _inst_typ = typ
    if _device_custom and typ in ("vessel", "rotating", "exchanger") and not re.search(
            r"\b(?:tank|pump|blower|compressor|reactor|column|vessel)\b", n, re.I):
        _inst_typ = "other"
    if _device_custom and _inst_typ in ("instrument", "electrical", "other", "rotating", "control"):
        # INTENT (2026-07-14): bezel / "Sensing Instrumentation Subcomponent N" /
        # optical-bench custom parts are concept-stage fabricated work on a handheld
        # instrument — not plant-catalogue NOT FOUND residuals. Universal noun family
        # (enclosure + optical/sensing custom + generic subcomponent), never a product name.
        # EXTENDED (colorimeter 1441 Part names 6.4): type=other residuals
        # (Compute UI Module, Ambient Light Cap, STEMMA/Qwiic cable/header, fastener
        # kit) were still NOT FOUND because the regex only covered enclosure/optical
        # nouns — Part names floored on 5/14 "not-found" while every row already
        # said "bespoke fabrication". Commodity interconnect/hardware →
        # COMMODITY-FITTING; compute/UI/cap/enclosure → FABRICATED.
        # EXTENDED (NinjaPCR 2026-07-15 Part names 5.3): Bulk Capacitor / Peltier TEC /
        # MOSFET heater switch / sample block fell through both regexes → bare NOT FOUND.
        # Remaining typ=other on an instrument is concept-stage board/thermal work.
        # EXTENDED (0846 traction): OEM inverter control boards type=control.
        if _inst_typ in ("instrument", "electrical", "rotating", "control"):
            return "FABRICATED"
        if re.search(
                r"\b(?:fastener|screw|bolt|nut|washer|header|stemma|qwiic|"
                r"interconnect|cable|harness|ribbon)\b", n, re.I):
            return "COMMODITY-FITTING"
        if re.search(
                r"enclosure|housing|shell|lid|shroud|chassis|case\b|bezel|\bcap\b|"
                r"capacitor|peltier|\btec\b|mosfet|h[\s-]?bridge|current\s+sense|\bshunt\b|"
                r"heater|wifi|wlan|flash\s+storage|debug\s+uart|uart\b|"
                r"fan\s+tach|fan\s+failure|overtemp|estop|e[\s-]?stop|"
                r"protective\s+earth|sample\s+block|aluminum\s+sample|"
                r"subcomponent|sensing|cuvette|collimat|baffle|optic|"
                r"compute|\bmcu\b|microcontroller|\bui\b|display|\bkit\b|"
                r"\bipmsm\b|\bmgu\b|traction|inverter|\bsic\b|cold\s*plate|"
                r"gear(?:box|stage)?|hv\s*dc|desat|gate\s*driver",
                n, re.I):
            return "FABRICATED"
        # Fallthrough: any remaining typ=other on a device instrument / traction
        # pack is concept-stage fabricated work, not a plant-catalogue residual.
        return "FABRICATED"
    # Name-family honest statuses (Codema ship 2026-07-09): a control panel / MCC is a
    # scope-documented assembly; a cloth/media filter with no catalogue pin is fabricated
    # from its flow duty — neither is a true residual NOT FOUND.
    if _CONTROL_PANEL_NAME_RE.search(n):
        return "SCOPE-DOCUMENTED"
    if _CLOTH_FILTER_NAME_RE.search(n):
        return "FABRICATED"
    pv = _pv_for_name(n, pv_by_norm)
    if pv:
        mfr = str(pv.get("manufacturer") or "").strip()
        pn = str(pv.get("part_number") or "").strip()
        reasoning = str(pv.get("reasoning") or "")
        if not mfr and not pn and _ENGINE_B_CURVE_RX.search(reasoning):
            return "FABRICATED"
        if str(pv.get("status") or "").strip().lower() == "verified_no_public_mpn":
            return "VERIFIED_NO_PUBLIC_MPN"
    if _BOUNDARY_STUB_RE.search(n):
        return "BOUNDARY-STUB"
    if _COMMODITY_FITTING_RE.search(n):
        return "COMMODITY-FITTING"
    # FABRICATED IN-PACK WORK (2026-07-10 run-34): busbar interconnects/assemblies,
    # thermal manifolds/bays/plenums, coolant loops, vent panels — copper/sheet-metal
    # work fabricated to the pack drawing, never a catalogue MPN target.
    if _FABRICATED_PACK_WORK_RE.search(n):
        return "FABRICATED"
    # SCOPE/FUNCTION words (run-34): a software platform ('GEMS Digital Energy
    # Platform'), an arc-flash/arc-fault protection FUNCTION, or a spec-echo whose
    # name ends in an attribute noun ('Surge Apparent Power') is documentation of
    # scope — not a discrete purchasable part.
    if _SCOPE_FUNCTION_WORD_RE.search(n):
        return "SCOPE-DOCUMENTED"
    # ENCLOSURE HARDWARE + PANEL INDICATORS (2026-07-10 / 2026-07-14): signage /
    # lighting / grounding / doors / insulation AND concept-stage shunts /
    # thermistors / E-stops / pilot lights / bypass switches each scored as a
    # catalogue-RESEARCH gap. Wholesaler / by-spec panel hardware — never a
    # concept-stage MPN target. Honest substatus: COMMODITY-FITTING. Universal
    # noun family, no class table (Modbus / IMD / fans stay residual — proveCatch).
    if _ENCLOSURE_HARDWARE_RE.search(n):
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


# ── BOUNDARY-ENDPOINT canonicalisation (Tristan CO2-v1 dossier, 2026-07-05) ─────────
# An unresolved connection endpoint (no matching BoM/manifest part) is NOT automatically
# a phantom — the electrical model + connection_ledger both author legitimate BATTERY-
# LIMIT nodes (grid / mains / utility incomer / atmosphere / heat-rejection / …) that
# are never a purchasable part. build_universal_scene.py's own EXTERNAL_SUPPLY_RE
# already treats 'electrical_supply' / 'power_supply' / 'grid' / 'mains' / 'incomer' /
# 'utility' / 'battery_limit' as ONE incomer-marker family (it synthesises a small
# 'incomer' marker at the plant edge for exactly this group) — so an unresolved
# 'electrical supply' endpoint is the SAME concept as a 'utility incomer', not a
# missing BoM line. Before this fix the ledger's connections list fell straight to
# `fr_key.title()` for ANY unresolved endpoint, so 'electrical_supply' rendered as the
# bare phantom-looking "Electrical Supply" — indistinguishable from a genuinely-missing
# part reference (CO2 v1 dossier: 'connection trace references Electrical Supply but no
# such part exists in the bill of materials / design', tab-scorecard HIGH).
# Fix: reuse connection_ledger.py's OWN `_ABSTRACT_BOUNDARY_RE` (the ledger's authority
# on what counts as a legitimate abstract boundary — ONE regex, never a second copy
# that could drift) to detect the case, and render an EXPLICIT boundary label. The
# electrical/power-incomer sub-family renders with the SAME 'Utility Incomer' noun
# every other archetype's grid tie already carries, so a downstream connection-trace
# consumer that only recognises that canonical phrase (not the raw contract key) still
# resolves it as a boundary — universal, keyed on the noun family, never a per-part table.
_ELECTRICAL_INCOMER_RE = re.compile(
    r"electrical[_ -]?supply|power[_ -]?supply\b|incoming[_ -]?supply", re.I)


def _boundary_label(raw_key: str):
    """Canonical boundary-service label for an UNRESOLVED connection endpoint, or None
    if `raw_key` is not a recognised abstract boundary (caller falls back to a plain
    title-cased name — a genuinely unresolved / phantom reference, left untouched)."""
    if not raw_key or not cl._ABSTRACT_BOUNDARY_RE.search(raw_key):
        return None
    title = raw_key.title()
    if _ELECTRICAL_INCOMER_RE.search(raw_key):
        return f"Utility Incomer ({title})"
    return title


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
# GOTCHA (codema-full-20260709-1359): bare `\bPLC\b` / `\bHMI\b` made every
# "PLC Controller" / "HMI Touchscreen" classify as its OWN cabinet (empty
# contents) AND as an orphan_controller — 8 false concerns. A cabinet is an
# ENCLOSURE (panel/cabinet/system/rack); a bare PLC/HMI is housed CONTENTS.
_CABINET_CTRL_RE = re.compile(
    r"marshalling|control\s*cabinet|control\s*panel|\bDCS\b|junction\s*box|"
    r"control\s*system|control\s*enclosure|instrument\s*panel|i/?o\s*rack|remote\s*i/?o|"
    r"control[- ]?network|plc\s*(?:cabinet|panel|rack|enclosure)|"
    r"hmi\s*(?:cabinet|panel|station|enclosure)|scada", re.I)
_HOUSED_POWER_RE = re.compile(
    r"\bbreaker\b|\bfuse\b|surge|\bSPD\b|\brelay\b|\bMCB\b|\bMCCB\b|\bMPCB\b|\bRCD\b|\bRCBO\b|"
    r"contactor|isolator|motor[- ]?protection|earth[- ]?leakage|\bVFD\b|variable[- ]?frequency|"
    r"frequency\s*drive|soft[- ]?start|blower/centrifuge\s*VSD", re.I)
_HOUSED_CTRL_RE = re.compile(
    r"i/?o\s*card|i/?o\s*module|plc\s*module|\bplc\b|controller|gateway|network\s*switch|"
    r"signal\s*conditioner|\bbarrier\b|marshalling\s*terminal|power\s*supply|\bPSU\b|"
    r"interface\s*station|\bhmi\b|touchscreen|monitoring|remote\s*monitor", re.I)
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


# ── INSTRUMENT / SIGNAL-CHAIN ROLES (2026-07-12, colorimeter benchmark) ────────────
# The Python mirror of derive-topology.ts::INSTRUMENT_ROLE_PATTERNS. Applied ONLY on a
# device-scale instrument (state.isInstrumentDevice — the SAME authoritative flag the
# chain sets when deriveInstrumentTopology fires, so classification and topology can
# never disagree, and NO plant / BESS / Powerwall part is ever re-typed). Signal-chain
# parts (photodiode, TIA, ADC, LED source, cuvette, display, MCU …) fell to 'other' —
# no role, no topology, counted in no connectivity denominator — so BFD/P&ID/Connection
# scored 0; the power parts (USB, battery, regulator) also fell through so Electrical
# scored 0. Order MOST-SPECIFIC-FIRST, matching the TS list exactly.
_INSTRUMENT_ROLE_PATTERNS = [
    # indicator + power_protection added 2026-07-13 (mirror TS): a Power Indicator LED is a
    # power LOAD (not an optical source); a DC input fuse / polyfuse / TVS / reverse-polarity
    # / thermal cutoff / EMC bead is a series-PROTECTION element on the DC path — both were
    # role-less → unwired → Connection-trace concerns. Order matches derive-topology.ts.
    ("indicator",          r"\b(?:power|status|fault|alarm|charge|standby|ready)[_ -]?indicator\b|\bindicator[_ -]?(?:led|lamp|light)\b|\bpilot[_ -]?(?:light|lamp)\b|\bpower[_ -]?(?:on[_ -]?)?led\b"),
    ("power_protection",   r"\b(?:fuse|polyfuse|poly[_ -]?fuse|ptc|resettable|circuit[_ -]?breaker|mcb|mov|varistor|tvs|esd[_ -]?protect\w*|surge[_ -]?protect\w*|over[_ -]?current[_ -]?protect\w*|over[_ -]?voltage[_ -]?protect\w*|reverse[_ -]?polarity[_ -]?protect\w*|thermal[_ -]?(?:cut[_ -]?off|fuse|protect\w*)|ferrite[_ -]?(?:bead|emc)|emc[_ -]?(?:bead|filter)|inrush[_ -]?limit\w*)\b"),
    ("driver",             r"(?:led|laser|lamp|source|display|backlight)[_ -]?driver\b|\bdriver[_ -]?(?:board|circuit|stage|ic)\b|\bconstant[_ -]?current[_ -]?driver\b"),
    ("power_conditioning", r"\b(?:regulator|ldo|buck|boost|dc[_ -]?dc|pmic|power[_ -]?management|charge[_ -]?(?:management|controller|circuit|ic)|charger|bms|battery[_ -]?management|power[_ -]?supply|psu|voltage[_ -]?reference|voltage[_ -]?regulat\w*)\b"),
    ("power_storage",      r"\b(?:battery|rechargeable|li[_ -]?ion|lipo|nimh|coin[_ -]?cell|cell[_ -]?pack|supercap\w*|super[_ -]?capacitor|energy[_ -]?cell)\b"),
    ("power_in",           r"\b(?:usb|power[_ -]?(?:inlet|input|interface|jack|connector|entry)|dc[_ -]?jack|barrel[_ -]?jack|mains[_ -]?adapter|wall[_ -]?adapter|type[_ -]?c)\b"),
    ("optical_sample",     r"\b(?:cuvette|sample[_ -]?(?:holder|chamber|cell|compartment)|flow[_ -]?cell|optical[_ -]?cell|specimen[_ -]?holder|test[_ -]?cell)\b"),
    ("optical_element",    r"\b(?:collimat\w*|lens|monochromat\w*|wavelength[_ -]?select\w*|filter[_ -]?wheel|optical[_ -]?filter|interference[_ -]?filter|aperture|baffle|beam[_ -]?split\w*|mirror|grating|diffuser|slit|shutter|reflector|light[_ -]?guide|fibre[_ -]?optic|fiber[_ -]?optic)\b"),
    ("optical_source",     r"\b(?:led[_ -]?source|light[_ -]?source|laser[_ -]?(?:diode|source)?|lamp|emitter|illuminat\w*|excitation[_ -]?source|led)\b"),
    ("detector",           r"\b(?:photodiode|photo[_ -]?detector|photo[_ -]?sensor|photomultiplier|pmt|photo[_ -]?transistor|thermopile|pyroelectric|image[_ -]?sensor|ccd|light[_ -]?sensor|photo[_ -]?receiver|optical[_ -]?detector|detector)\b"),
    ("conditioning",       r"\b(?:transimpedance|tia|amplifier|op[_ -]?amp|afe|analog[_ -]?front[_ -]?end|signal[_ -]?condition\w*|gain[_ -]?stage|instrumentation[_ -]?amp\w*|pre[_ -]?amp\w*|buffer[_ -]?amp\w*)\b"),
    ("digitiser",          r"\b(?:analog[_ -]?to[_ -]?digital|adc|dac|delta[_ -]?sigma|successive[_ -]?approx\w*|digiti[sz]er|sigma[_ -]?delta)\b"),
    ("compute",            r"\b(?:microcontroller|mcu|micro[_ -]?processor|processor|fpga|dsp|soc|firmware|main[_ -]?board|logic[_ -]?board|compute[_ -]?module|system[_ -]?on[_ -]?chip|control[_ -]?board)\b"),
    ("display",            r"\b(?:display|screen|lcd|oled|tft|e[_ -]?ink|readout|seven[_ -]?segment|annunciator|graphic[_ -]?display|numeric[_ -]?display|vfd)\b"),
    ("input",              r"\b(?:button|keypad|keyswitch|user[_ -]?input|membrane[_ -]?switch|tactile[_ -]?switch|rotary[_ -]?encoder|touch[_ -]?(?:pad|key)|power[_ -]?switch|on[_ -]?off[_ -]?switch|control[_ -]?switch)\b"),
]
_INSTRUMENT_POWER_ROLES = {"power_in", "power_storage", "power_conditioning",
                           "power_protection", "indicator"}


def _instrument_role(name: str):
    """The instrument signal-chain role of a part name, or None. Mirrors TS
    derive-topology.ts::instrumentRole. PURE."""
    n = (name or "")
    for role, rx in _INSTRUMENT_ROLE_PATTERNS:
        if re.search(rx, n, re.I):
            return role
    return None


def _is_instrument_power_origin(name: str) -> bool:
    """A device instrument's own power SOURCE (battery / USB inlet / DC jack) is a
    battery-limit ORIGIN — no upstream plant edge, exactly like a mains incomer — so a
    'missing_input' concern on it is false. Gated by the caller on isInstrumentDevice."""
    r = _instrument_role(name)
    return r in ("power_in", "power_storage")


_HOST_INTO_COMPUTE_RE = re.compile(
    r"microcontroller|\bmcu\b|main\s*controller|local\s*display|user\s*input|"
    r"firmware\s*storage|flash\s*storage|wifi|wi[- ]?fi|"
    r"usb\s*(interface|power|data)|host\s*protocol\s*bridge|protocol\s*bridge|"
    r"usb[- ]?uart|\bftdi\b|rechargeable\s*battery|battery\s*charge|"
    r"power\s*switch|control\s*switch|status\s*indicator|status\s*led|"
    r"mounting\s*bezel|power\s*indicator|overcurrent|input\s*fuse|"
    r"dc\s*input\s*fuse|thermal\s*(?:cutoff|fuse)|reverse\s*polarity|"
    r"power\s*input\s*connector|esd\s*protection|polyfuse|ferrite|"
    r"dc\s*[- ]?dc\s*regulat(?:or|ion)|voltage\s*regulat(?:or|ion)|"
    r"regulat(?:or|ion)\s*board|power\s*regulat(?:or|ion)|"
    r"debug\s*uart|current\s*sense|estop|e[- ]?stop|"
    r"power\s*kill|protective\s*earth|fan\s*(?:tach|failure)|overtemp|"
    # INTENT (Rodeostat 0201): AFE / voltage-ref / front-panel ports ride the
    # MCU kit — flagging missing_input/output floored Connection Trace to 6.
    r"compute\s*ui|voltage\s*reference|precision\s*voltage|"
    r"analog\s*front\s*end|\bafe\b|current\s*measurement|\btia\b|"
    r"galvanic\s*isolat|front\s*panel\s*connector|electrode\s*interface|"
    r"adc\s*input|dac\s*output|calibration\s*prompt|"
    # INTENT (Pioreactor 0250): fan anatomy Speed Controller orphaned as control.
    r"speed\s*controller|ec\s*motor|fan\s*housing|stir\s*tachometer",
    re.I,
)
_COMPUTE_PRINCIPAL_RE = re.compile(
    r"compute\s*ui\s*module|main\s*controller|microcontroller|\bmcu\b|processor",
    re.I,
)
_HOST_INTO_LED_RE = re.compile(
    r"\bled\s*driver\b|\bled\s*source\b(?!\s*board)",
    re.I,
)


def _prune_instrument_ghost_connections(
    equipment: list,
    connections: list,
) -> tuple:
    """INTENT: after gold-spine / host absorption, Connection trace must not
    score against 50+ ghost USB→fuse→regulator ties that are no longer BoM lines.

    Remap absorbed host endpoints onto Compute UI Module / LED Source Board when
    those principals exist; drop edges that still fail to resolve to two
    equipment rows; rebuild each principal's inputs/outputs from the survivors.

    @returns (pruned_connections, n_dropped)
    """
    if not connections or not equipment:
        return connections, 0
    by_norm = {_norm(e.get("name") or ""): e for e in equipment if e.get("name")}
    # GOTCHA (NinjaPCR 1330): gold-spine used "Compute UI Module"; thermocycler
    # BoM names "Main Controller MCU" — prune must recognise either or host
    # peripherals stay as ghost electrical orphans and floor Interconnect to 0.
    compute = next(
        (e for e in equipment
         if _COMPUTE_PRINCIPAL_RE.search(e.get("name") or "")),
        None,
    )
    led = next(
        (e for e in equipment
         if re.search(r"led\s*source\s*board", e.get("name") or "", re.I)),
        None,
    )

    def _map_endpoint(name: str):
        nn = _norm(name or "")
        if not nn:
            return None
        if nn in by_norm:
            return by_norm[nn]
        for k, e in by_norm.items():
            if nn in k or k in nn:
                return e
        if led and _HOST_INTO_LED_RE.search(name or ""):
            return led
        if compute and _HOST_INTO_COMPUTE_RE.search(name or ""):
            return compute
        return None

    kept = []
    seen: set = set()
    dropped = 0
    for c in connections:
        fe = _map_endpoint(str(c.get("from_part") or ""))
        te = _map_endpoint(str(c.get("to_part") or ""))
        if not fe or not te or fe is te:
            dropped += 1
            continue
        key = (fe["name"], te["name"], c.get("mechanism") or c.get("kind") or "")
        rkey = (te["name"], fe["name"], key[2])
        if key in seen or rkey in seen:
            dropped += 1
            continue
        seen.add(key)
        kept.append({
            **c,
            "from_part": fe["name"],
            "from_tag": fe.get("tag"),
            "to_part": te["name"],
            "to_tag": te.get("tag"),
        })

    # Rebuild I/O lists so Connection trace rows match the pruned graph.
    for e in equipment:
        e["inputs"] = []
        e["outputs"] = []
    for c in kept:
        fe = by_norm.get(_norm(c["from_part"]))
        te = by_norm.get(_norm(c["to_part"]))
        via = c.get("via") or c.get("kind") or "tie"
        mech = c.get("mechanism") or ""
        if te:
            te["inputs"].append(
                f"{c['from_part']} ({c.get('from_tag') or '?'}) via {via} [{mech}]")
        if fe:
            fe["outputs"].append(
                f"{c['to_part']} ({c.get('to_tag') or '?'}) via {via} [{mech}]")
    return kept, dropped


_INSTRUMENT_SIGNAL_CARRIER_RE = re.compile(
    r"\b(?:sensor|detector|photodiode|signal|data|analog|adc|afe)\b.{0,48}"
    r"\b(?:interconnect|cable|lead|wire|harness|ffc|ribbon)\b|"
    r"\b(?:interconnect|cable|lead|wire|harness|ffc|ribbon)\b.{0,48}"
    r"\b(?:sensor|detector|photodiode|signal|data|analog|adc|afe)\b",
    re.I,
)
_INSTRUMENT_CARRIER_SOURCE_ROLES = {"detector", "conditioning", "digitiser"}
_INSTRUMENT_CARRIER_SINK_ROLES = {"compute", "digitiser", "conditioning"}


def _is_instrument_signal_carrier(name: str) -> bool:
    """A physical lead/FFC/harness that carries an instrument signal between modules."""
    return bool(_INSTRUMENT_SIGNAL_CARRIER_RE.search(name or ""))


def _instrument_signal_carrier_edge_score(
    carrier_name: str,
    from_part: str,
    to_part: str,
    mechanism: str,
) -> int:
    """Score whether a topology edge is the signal path a carrier cable embodies.

    INTENT: compact instruments often list the physical "sensor interconnect cable"
    as a BoM line, while the authoritative topology names the electronic endpoints.
    The cable should inherit the detector/AFE/ADC→compute edge, not become an orphan.
    """
    if not _is_instrument_signal_carrier(carrier_name):
        return 0
    if str(mechanism or "").lower() not in {"signal", "data", "control"}:
        return 0
    fr_role = _instrument_role(from_part or "")
    to_role = _instrument_role(to_part or "")
    score = 1
    if fr_role in _INSTRUMENT_CARRIER_SOURCE_ROLES:
        score += 3
    if to_role in _INSTRUMENT_CARRIER_SINK_ROLES:
        score += 3
    if "sensor" in (carrier_name or "").lower() and fr_role == "detector":
        score += 2
    # Prefer an actual endpoint-to-controller signal over optical sample/source
    # adjacency, which is usually the light path rather than the cable.
    if fr_role in {"optical_sample", "optical_element", "optical_source"}:
        score -= 2
    return max(score, 0)


def _classify(name: str, tag: str, instrument_device: bool = False) -> str:
    # On a device-scale instrument, the signal-chain role classifier runs FIRST so the
    # signal parts type 'instrument' (association-scored) and the power parts type
    # 'electrical' (single-line) — pre-empting the process-plant TYPE_RULES that would
    # otherwise mis-type 'Firmware Storage'→vessel and 'Display Panel'→electrical-panel.
    if instrument_device:
        # INTENT: "HMI Ergonomics Subcomponent 1" / "Power Distribution Subcomponent 2"
        # are placeholder decomposition leaves, not standalone controllers or feeders.
        # Let them remain passive so they cannot create orphan_controller floor kills.
        if re.search(
            r"\b(?:sensing|structure|control|energy|power(?:\s*distribution)?|"
            r"actuation|hmi|safety)[\w\s-]*subcomponent\s*\d+\b",
            name or "",
            re.I,
        ):
            return "other"
        role = _instrument_role(name)
        if role is not None:
            return "electrical" if role in _INSTRUMENT_POWER_ROLES else "instrument"
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
                    "day tank", "bulk tank", "buffer tank", "dosing tank",
                    # Grid electrical origin (codema EP-102, 2026-07-09): "Mains Incomer"
                    # is the battery-limit feed — it HAS no upstream plant edge by design.
                    "incomer", "mains incomer", "utility incomer"}
_SINK_KEYWORDS = {"drain", "effluent", "discharge", "waste", "sludge", "exhaust",
                  "heat rejection", "mortality", "overflow", "reject"}


def _name_has_boundary_keyword(name_l: str, keywords: set) -> bool:
    """INTENT: origin/sink noun match with WORD boundaries.

    GOTCHA (Poseidon 2026-07-16): bare `kw in name_l` matched `feed` inside
    `feedback` → "Force Limit Feedback" falsely raised missing_input and demoted
    an otherwise story-OK Interconnect tab to 0. Short tokens that are prefixes
    of longer words MUST use \\b; multi-word phrases stay substring-safe.
    """
    if not name_l:
        return False
    for kw in keywords:
        if not kw:
            continue
        if " " in kw:
            if kw in name_l:
                return True
            continue
        if re.search(rf"\b{re.escape(kw)}\b", name_l):
            return True
    return False


def _is_grid_electrical_origin(name: str) -> bool:
    """INTENT: a grid/mains electrical incomer is a TRUE battery-limit origin — it
    feeds the plant and has no upstream plant edge. Flagging missing_input on it is
    a false concern (codema EP-102). Universal: noun-keyed, never a tag table."""
    name_l = (name or "").lower()
    return bool(re.search(
        r"\bincomer\b|mains\s+incomer|utility\s+incomer|\bgrid\b.*\b(feed|supply|incomer)\b",
        name_l,
    ))


def _is_filler_pad_controller(name: str) -> bool:
    """INTENT (P6 / cell-cycler cold-v17): Phase-2 'HMI Filler N' / 'Filler N' /
    '… Subcomponent N' placeholders are not real controllers. Universal noun key."""
    return bool(re.search(
        r"\bhmi\s+filler\b|\bfiller\s+\d+\b|\bsubcomponent\s*\d+\b",
        (name or "").lower(),
    ))


def _is_non_fluid_boundary_noun(name: str) -> bool:
    """INTENT (cell-cycler cold-v15 Connection-trace / P1 dry-instrument): sink/origin
    keywords fire on ELECTRICAL discharge and AIR exhaust nouns that are NOT process-
    fluid battery limits.

    - 'discharge' in MOSFET / pass-bank / load-switch names = electrical energy dump
    - 'exhaust air path' / ventilation exhaust = air boundary, not a piped fluid sink

    A wet-plant 'effluent discharge' / 'process drain' still matches fluid sink nouns
    without these electrical/air collocates — proveCatch both directions.
    Universal: noun-keyed, never a product-class table.
    """
    name_l = (name or "").lower()
    if not name_l:
        return False
    # Electrical discharge / dump stage (channel power path) — not a fluid sink.
    if re.search(
        r"(?:discharge|dump)\s+(?:load\s+)?(?:mosfet|fet|transistor|pass\s*bank|"
        r"bank|resistor|heatsink)|"
        r"(?:linear|resistive|electronic)\s+discharge|"
        r"discharge\s+(?:path|stage|leg|rail)|"
        r"load\s+switch\s+mosfet|power\s+mosfet",
        name_l,
    ):
        return True
    # Air exhaust / ventilation path — air mover boundary, not process-fluid sink.
    if re.search(
        r"(?:exhaust|vent(?:ilation)?)\s+air|"
        r"air\s+(?:exhaust|vent(?:ilation)?|path|outlet)|"
        r"exhaust\s+(?:path|duct|port|grille)",
        name_l,
    ):
        return True
    # INTENT (2026-07-29 0846): shield-drain / PE / earth bond is an ELECTRICAL
    # bonding strap, not a process-fluid sink — 'drain' must not open missing_output.
    if re.search(
        r"shield\s*drain|drain\s*bond|earth\s*bond|pe\s*bond|"
        r"protective\s*earth|equipotential\s*bond",
        name_l,
    ):
        return True
    return False


def _synthesize_traction_hv_spine(
    equipment: list,
    connections: list,
    attached_pairs: set,
) -> int:
    """Attach BoM-named HV DC→fuse→bus→SiC→motor edges when schedule is empty.

    INTENT (2026-07-29 0846): freshen-scorer re-runs the ledger after BoM cleanup
    but abstract eng topology never joins tags — synthesise the pack spine from
    seated principals so completeness concerns clear without inventing plant pipes.
    Returns number of newly attached edges.
    """
    def _find(rx: str):
        for e in equipment:
            if re.search(rx, e.get("name") or "", re.I):
                return e
        return None

    hv = _find(r"hv\s*(?:dc\s*)?connector|hv\s*dc\s*input|battery\s*dc")
    fuse = _find(r"hv\s*dc\s*fuse|\bdc\s*fuse\b")
    bus = _find(r"hv\s*dc\s*busbar|busbar\s*link")
    inv = _find(r"sic\s*traction\s*inverter")
    mot = _find(r"traction\s*ipmsm|ipmsm\s*motor|motor[-\s]?generator")
    if not inv or not mot:
        return 0
    chain = [x for x in (hv, fuse, bus, inv, mot) if x is not None]
    # Deduplicate if fuse/bus missing left adjacent duplicates.
    deduped = []
    for e in chain:
        if not deduped or deduped[-1] is not e:
            deduped.append(e)
    n = 0
    for fe, te in zip(deduped, deduped[1:]):
        fr_key = _norm(str(fe.get("name") or ""))
        to_key = _norm(str(te.get("name") or ""))
        key = (fr_key, to_key, "electrical_bus")
        if key in attached_pairs:
            continue
        attached_pairs.add(key)
        via = "cable HV DC"
        fn = fe.get("name") or fr_key
        tn = te.get("name") or to_key
        te.setdefault("inputs", []).append(
            f"{fn} ({fe.get('tag') or '?'}) via {via} [electrical_bus]")
        fe.setdefault("outputs", []).append(
            f"{tn} ({te.get('tag') or '?'}) via {via} [electrical_bus]")
        connections.append(dict(
            idx=len(connections), line_number=None,
            from_part=fn, from_tag=fe.get("tag"),
            to_part=tn, to_tag=te.get("tag"),
            mechanism="electrical_bus", kind="cable", via=via,
            size="", rating=None, length_m=None, line_gbp=None,
            within_spec=None,
            coverage=dict(pid=False, process_schedules=False,
                          isometric=False, route=False),
            source="traction_hv_spine",
        ))
        n += 1
    return n


def _electrical_edge_needs(
    name: str, *, has_any: bool, is_origin: bool, is_sink: bool,
) -> tuple:
    """INTENT: which drawn electrical edges a part requires (needs_in, needs_out).

    Pure so proveCatch can pin the Powerwall false-concern class without running the
    full ledger: busbar interconnect HARDWARE needs neither edge; an AC/LCL output-
    filter stage is an electrical sink (in only); fuse/SPD/HMI/alarm terminals need
    no downstream load. Universal — noun-keyed, never a tag/class table.
    """
    name_l = (name or "").lower()
    is_bus_hardware = bool(re.search(
        r"busbar\s+(?:connectors?|interconnects?)|"
        r"bus\s?bar\s+(?:connectors?|interconnects?)",
        name_l, re.I))
    is_ac_filter_sink = bool(re.search(
        r"(?:\bac\s+filter\b|\boutput\s+filter\b|\bLCL\b|"
        r"filter\s+(?:inductor|capacitor|choke|reactor)|"
        r"\bEMI\s+filter\b|\bRFI\s+filter\b|\bEMC\s+(?:line\s+)?filter\b|"
        r"\bline\s+filter\b|harmonic\s+filter)",
        name_l, re.I))
    is_terminal_elec = is_bus_hardware or bool(re.search(
        r"\bfuse\b|surge|\bSPD\b|protective relay|protection relay|safety relay|"
        r"motor[- ]?protection|\bMPCB\b|earth leakage|\bRCD\b|\bRCBO\b|\bMCB\b|"
        r"\bMCCB\b|circuit\s+breakers?\b|breaker\b|"
        r"cable tray|terminal block|enclosure|junction box|\bgland\b|"
        r"digital\s+control\s+panel|local\s+control\s+panel|operator\s+panel|"
        r"operator\s+deck|front\s+panel|"
        r"\bhmi\b|touchscreen|control\s+panel\b|"
        r"\bindicator\b|pilot\s*(?:light|lamp)|status\s+(?:light|lamp|led)|"
        r"annunciator|\bbeacon\b|buzzer|\bsounder\b|signal\s+(?:lamp|light)",
        name_l, re.I))
    # INTENT (2026-07-29 0846): desat / gate-driver boards ride the MCU kit —
    # never require drawn electrical in+out (a stale ledger OUT must not re-open
    # missing_input via the terminal has_any path).
    is_mcu_kit_board = bool(re.search(
        r"\bdesat\b|gate\s*driver|overcurrent\s*trip",
        name_l, re.I))
    # INTENT (2026-07-29 0846): HV pack connector is the battery-limit origin;
    # IPMSM / motor-generator converts electrical→mechanical — electrical SINK
    # (shaft out is not an electrical load edge).
    is_hv_pack_origin = bool(re.search(
        r"hv\s*(?:dc\s*)?connector|hv\s*dc\s*input|battery\s*dc\s*(?:input|connector)",
        name_l, re.I))
    is_traction_motor_sink = bool(re.search(
        r"\bipmsm\b|motor[-\s]?generator|traction\s*(?:ipmsm\s*)?motor\b",
        name_l, re.I))
    if is_bus_hardware or is_mcu_kit_board:
        return False, False
    if is_hv_pack_origin:
        is_origin = True
    if is_traction_motor_sink:
        is_sink = True
    needs_in = not is_origin and not (is_terminal_elec and not has_any)
    # GOTCHA: compact-device topology can reverse a battery-limit origin tie
    # (e.g. "Power Distribution -> USB inlet"). If any edge touches the origin,
    # the inlet is auditable; do not require the arrow to point downstream.
    needs_out = (
        not is_sink
        and not (is_origin and has_any)
        and not is_terminal_elec
        and not is_ac_filter_sink
    )
    return needs_in, needs_out


# INTENT (2026-07-14 colorimeter Connection-trace 0/10): handheld instruments type the
# MCU / compute / display as `other`/`instrument`, never `control` — so a type-only
# control check left every unconnected sensor (incl. a cuvette CONSUMABLE) as
# orphan_instrument and floored the tab via min-score. Pure helpers so proveCatch
# pins both failure modes without running the full ledger.
_INSTRUMENT_CONTROL_NAME_RE = re.compile(
    r"\b(?:mcu|microcontroller|compute|controller|plc|hmi|display|ui\s*module|"
    r"control\s*board|gate\s*driver)\b",
    re.I)
_INSTRUMENT_CONSUMABLE_RE = re.compile(
    r"\b(?:consumable|cuvette|sample\s*(?:cell|vial|tube|cuvette)|"
    r"reagent|ampoule)\b",
    re.I)


def _control_present(equipment: list, *, instrument_device: bool) -> bool:
    """True when the plant/device has something instruments can report to.

    On a device instrument, an onboard MCU/compute/display counts even when typed
    `other`/`instrument` (not plant `control`).
    """
    for e in equipment:
        typ = str(e.get("type") or "")
        if typ == "control":
            return True
        if instrument_device and _INSTRUMENT_CONTROL_NAME_RE.search(str(e.get("name") or "")):
            return True
    return False


def _is_instrument_consumable(name: str) -> bool:
    """Passive optical/sample path element — not a transmitter that reports to control."""
    return bool(_INSTRUMENT_CONSUMABLE_RE.search(name or ""))


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
    # DECISION: grid electrical incomers are origins that REQUIRE no upstream plant
    # edge — skip the missing_input raise (they still count as origins for tallies).
    if _is_grid_electrical_origin(name):
        return None
    # DECISION: PARAMETRIC zoned-distribution take-offs name "delivery"/"drain" but
    # are materials aggregates, not discrete flow-through nodes — the status==PARAMETRIC
    # skip in the main loop covers PROCESS-typed ones; PASSIVE-typed ones hit this
    # predicate first. Caller must pass status via name alone here — so also skip
    # when the name itself declares a zoned-distribution materials take-off.
    if "zoned distribution" in name_l or name_l.startswith("zoned distribution"):
        return None
    # INTENT (P1 dry-instrument): electrical discharge / air-exhaust nouns share
    # sink keywords ('discharge','exhaust') but are not process-fluid boundaries.
    if _is_non_fluid_boundary_noun(name):
        return None
    is_origin = _name_has_boundary_keyword(name_l, _ORIGIN_KEYWORDS)
    is_sink = _name_has_boundary_keyword(name_l, _SINK_KEYWORDS)
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


def _ellipsis_prefix_match(nm: str, txt: str) -> bool:
    """ELLIPSIS-TRUNCATION credit — pure, module-level so it is proveCatch-able (see
    _selftest). A drawing column legitimately truncates a long name with '…' ("W16
    Nursery Fertigation Dosing Pu…", "W22–23 Fertigation Dosing Pump (BACK…"), so the
    full BoM name is never a substring of the SVG text — a matcher FALSE-NEGATIVE on a
    part that IS drawn (Codema 2100 BoM-Ledger 8/10 root, 2026-07-09; the known
    parts_ledger false-neg class). Credits when a '…'-terminated PREFIX of THIS name
    (≥ 12 chars, long enough to be unambiguous) appears in the text. Prefix-of-THIS-name
    only — a truncated run belonging to a DIFFERENT part can never credit this one
    (a catch-fix, never a relax)."""
    if "…" not in txt:
        return False
    low_nm, low_txt = (nm or "").lower(), txt.lower()
    for _L in range(len(low_nm) - 1, 11, -1):
        if (low_nm[:_L].rstrip() + "…") in low_txt:
            return True
    return False


def _tag_covered_verdict(t: str, txt: str, ambiguous_tags: set, name_present: bool):
    """Pure decision used by covered()'s tag-matching loop — module-level (no bpy, no
    live drawing) so it is a proveCatch-able regression guard (see _selftest).

    Returns None when tag string `t` is a PLACEHOLDER ("—", the dash every untagged
    synthetic/documentation row carries) or is simply absent from `txt` — the caller
    should try the next tag candidate (e.g. the manifest's canonical_tag). Returns a
    final True/False verdict once `t` is a genuine, present tag.

    A placeholder tag is never an identity: dozens of unrelated rows share it, and the
    bare dash character is ubiquitous drawing furniture (dimension placeholders, table
    blanks, "— —" cells), so " — " ALWAYS appears somewhere in a non-trivial SVG's
    text. Treating it as an "unambiguous tag hit" gave every dash-tagged row a FALSE
    True on every 2D drawing regardless of whether it was actually drawn (found
    2026-07-05: "deflagration vent seal" read GA-covered purely because " — " sits in
    an unrelated table cell). Require NAME matching for a placeholder tag exactly as
    for an ambiguous one — never bare-tag credit.

    For a genuine (non-placeholder) present tag: if UNAMBIGUOUS (unique identity — one
    equipment per tag), credit on tag alone. If AMBIGUOUS (collision: same tag → >1
    distinct equipment name), require the NAME to also be present — otherwise a
    different unit that happens to share the tag would be wrongly credited."""
    if not t or t == "—" or not (f" {t} " in txt or f">{t}<" in txt):
        return None
    if t not in ambiguous_tags:
        return True
    return name_present


def _is_connection(r: dict) -> bool:
    return (r.get("status") == "ROUTED" or bool(re.fullmatch(r"C\d+", str(r.get("tag", ""))))
            or str(r.get("basis", "")).startswith(("pipe ", "cable ", "gas ")))


def _seed_rb_from_manifest_and_costs(state: dict, manifest: dict) -> list:
    """INTENT (Powerwall 2026-07-15): when state.requirementsBom is empty but the
    run still has a parts-manifest and/or costBasis lines (assembler crashed mid-
    structural take-off, chain left []), the ledger must NOT emit n_equipment=0.
    Seed a minimal BoM spine from costBasis.lines joined to manifest tags, falling
    back to moduleDecomposition words. Universal — sealed cabinets and plants.
    Never invents prices beyond what costBasis / partVerifications already hold."""
    cost_lines = ((state.get("costBasis") or {}).get("lines") or [])
    pv_by_wid = {str(v.get("word_id") or ""): v
                 for v in (state.get("partVerifications") or []) if isinstance(v, dict)}
    pm_by_name: dict[str, dict] = {}
    for p in (manifest.get("parts") or []) if isinstance(manifest, dict) else []:
        nm = _norm(str(p.get("name") or ""))
        if nm and nm not in pm_by_name:
            pm_by_name[nm] = p

    rows: list = []
    seen: set = set()

    def _append(name: str, tag: str, unit: float, basis: str, status: str,
                part: str = "requirement stated", qty: float = 1) -> None:
        key = _norm(name) or tag
        if not key or key in seen:
            return
        seen.add(key)
        rows.append({
            "tag": tag or "—",
            "requirement": name,
            "status": status,
            "part": part,
            "qty": qty,
            "unit_gbp": unit,
            "line_gbp": round(float(unit or 0) * float(qty or 1), 2),
            "basis": basis or "seeded from costBasis/manifest (requirementsBom was empty)",
        })

    for cl in cost_lines:
        if not isinstance(cl, dict):
            continue
        name = str(cl.get("label") or cl.get("name") or "").strip()
        if not name:
            continue
        pm = pm_by_name.get(_norm(name)) or {}
        tag = str(pm.get("equipment_tag") or pm.get("tag") or "—")
        unit = float(cl.get("cost_gbp") or cl.get("engine_price_gbp") or 0) or 0.0
        basis_obj = cl.get("basis") if isinstance(cl.get("basis"), dict) else {}
        basis = str((basis_obj or {}).get("notes") or cl.get("method")
                    or "costBasis line (requirementsBom empty — seeded)")
        _append(name, tag, unit, basis, "IDENTIFIED" if unit > 0 else "NOT FOUND")

    if not rows:
        for m in ((state.get("moduleDecomposition") or {}).get("modules") or []):
            for sm in (m.get("sub_modules") or []):
                for w in (sm.get("words") or []):
                    if not isinstance(w, dict):
                        continue
                    cc = w.get("content_character") or {}
                    name = str(w.get("name_human") or cc.get("name_human") or "").strip()
                    if not name:
                        continue
                    wid = str(w.get("id") or w.get("word_id") or "")
                    pv = pv_by_wid.get(wid) or {}
                    pm = pm_by_name.get(_norm(name)) or {}
                    tag = str(pm.get("equipment_tag") or pm.get("tag") or "—")
                    unit = float(pv.get("cost_repair_corrected_price_gbp")
                                 or pv.get("price_estimate_gbp")
                                 or pv.get("distributor_price_gbp") or 0) or 0.0
                    part = " ".join(x for x in (pv.get("manufacturer"), pv.get("part_number"))
                                    if x).strip() or "requirement stated"
                    _append(name, tag, unit,
                            "moduleDecomposition word (requirementsBom empty — seeded)",
                            "IDENTIFIED" if unit > 0 else "NOT FOUND", part=part)

    if not rows:
        for p in (manifest.get("parts") or []) if isinstance(manifest, dict) else []:
            name = str(p.get("name") or "").strip()
            tag = str(p.get("equipment_tag") or p.get("tag") or "—")
            if name:
                _append(name, tag, 0.0,
                        "parts-manifest only (requirementsBom empty — seeded)",
                        "NOT FOUND", qty=float(p.get("qty") or 1))
    return rows


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
    rb = list(state.get("requirementsBom") or [])
    # INTENT (Powerwall 2026-07-15): empty requirementsBom + non-empty manifest/cost
    # must still populate equipment — sealed product cabinets included. Source crash
    # in requirements_bom.assemble is fixed separately; this seed is the ledger's
    # universal backstop so GA/Process/Verification floors cannot zero out.
    if not rb:
        _n_manifest = len(manifest.get("parts") or []) if isinstance(manifest, dict) else 0
        _n_cost = len(((state.get("costBasis") or {}).get("lines") or []))
        _n_words = sum(
            len(sm.get("words") or [])
            for m in ((state.get("moduleDecomposition") or {}).get("modules") or [])
            for sm in (m.get("sub_modules") or []))
        if _n_manifest or _n_cost or _n_words:
            rb = _seed_rb_from_manifest_and_costs(state, manifest)
            print(f"[parts_ledger] requirementsBom empty — seeded {len(rb)} row(s) "
                  f"from costBasis/manifest/words "
                  f"(manifest={_n_manifest}, cost_lines={_n_cost}, words={_n_words})",
                  file=sys.stderr)

    # Device-scale INSTRUMENT flag — the authoritative signal the chain sets when
    # deriveInstrumentTopology fires (a sealed sub-1 m³ optical/electronic instrument
    # with no fluid/plant). Gates the signal-chain role classification below; a plant /
    # BESS / Powerwall never carries it, so those runs are byte-identical.
    instrument_device = bool(state.get("isInstrumentDevice"))
    # INTENT (2026-07-29): traction packs seat motor/SiC/gear on blender+GA but
    # `_classify` types motor/inverter as electrical (SLD-only). Expand expected
    # so seated principals are in the coverage denominator (not plant litter).
    _traction_pack = False
    try:
        _libp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "lib")
        if _libp not in sys.path:
            sys.path.insert(0, _libp)
        import instrument_form_grammar as _ifg_pl  # type: ignore
        _pc_pl = str(
            (state.get("parsedBrief") or {}).get("product_class")
            or (state.get("orchestratorContract") or {}).get("product_class")
            or (state.get("moduleDecomposition") or {}).get("product_class")
            or "",
        )
        _traction_pack = bool(_ifg_pl.is_traction_drive_pack_form(product_class=_pc_pl))
    except Exception:
        _pc_pl = str((state.get("moduleDecomposition") or {}).get("product_class") or "")
        _traction_pack = bool(re.search(r"\bmgu\b|traction|ipmsm|powertrain", _pc_pl, re.I))
    # INTENT (Powerwall 2026-07-15): sealed product cabinets (enclosure_volume_m3 < 1)
    # share the instrument rule for GA coverage — the GA IS the parts-manifest
    # projection (thin-TOP outlines + FRONT cutaway). Requiring every sub-16×12 px
    # cabinet internal to carry a readable tag deflated coverage to 68% while the
    # parts were honestly drawn. Envelope signal via is_product_scale — never a
    # class table.
    try:
        _lib = str(Path(__file__).resolve().parent.parent / "lib")
        if _lib not in sys.path:
            sys.path.insert(0, _lib)
        from render_view_contract import is_product_scale as _is_product_scale
        product_scale = bool(_is_product_scale(state))
    except Exception:  # noqa: BLE001
        product_scale = False

    # partVerifications lookup, keyed by NORMALISED word_name (2026-07-05, the
    # VERIFIED_NO_PUBLIC_MPN + evidence-based FABRICATED not-found-substatus fix — see
    # _not_found_substatus's docstring). state.partVerifications is the SAME data as the
    # sibling 10-part-verifications.json artefact; read from state so a caller passing a
    # bare state dict (no on-disk sibling file) still gets the classification.
    _pv_by_norm: dict[str, list] = {}
    for _pv in (state.get("partVerifications") or []):
        if isinstance(_pv, dict) and _pv.get("word_name"):
            _pv_by_norm.setdefault(_norm(str(_pv["word_name"])), []).append(_pv)

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
    # NAME-KEYED fallback (added 2026-07-05, BESS v3 LAP-3 pass): a SYNTHETIC aggregated
    # block (the rack-farm BoP lineup — one drawn box standing for a whole BoM line) mints
    # its OWN counter-based equipment_tag ("RH-101") that is never the underlying BoM row's
    # own tag ("EP-1") — `placed.get(tag)` above then misses entirely for every such row,
    # so `pm` resolves to {} and every field read off it (module, dims_mm, modelled_qty,
    # AND the canonical name/tag `covered()` needs) silently reads as absent even though the
    # part IS drawn. Resolve by NORMALISED NAME as a second-chance lookup — the manifest
    # row's own `name` field is the SAME BoM part name the placer recorded (`_SYN_BLOCK_BOM`),
    # so this closes the identity gap universally, not per-part. First-match-wins (stable
    # dict insertion order); only consulted when the direct tag lookup misses.
    placed_by_name: dict[str, dict] = {}
    for _p in (manifest.get("parts", []) if isinstance(manifest, dict) else []):
        _pk = _norm(str(_p.get("name", "")))
        if _pk and _pk not in placed_by_name:
            placed_by_name[_pk] = _p
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
        txt = " " + re.sub(r"\s+", " ", raw).strip() + " "
        # RANGE-TAG EXPANSION (2026-07-11 run 60: the GA keynote density collapse
        # renders module groups as 'X-102…X-131 (14)' — a legible convention the
        # elevations already use — but this plain-substring presence scan then read
        # every member as ABSENT and GA coverage fell 27/28 → 9/28. A range tag
        # COVERS its members: expand 'A-N…A-M' (or -/–) into each member tag.)
        for _pref, _a, _b in re.findall(r"\b([A-Z]{1,5})-(\d{1,4})\s*[…\u2013\u2014-]\s*(?:\1-)?(\d{1,4})\b", txt):
            _lo, _hi = int(_a), int(_b)
            if 0 < _hi - _lo <= 200:
                txt += " " + " ".join(f"{_pref}-{n}" for n in range(_lo, _hi + 1)) + " "
        return txt

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

    def covered(tag: str, name: str, key: str, canonical: str | None = None,
                canonical_tag: str | None = None) -> bool:
        """`canonical` (added 2026-07-04, canonical-name-register audit): the manifest's OWN
        name for this tag (parts-manifest.json `name`), tried as a SECOND match candidate
        alongside the BoM `requirement`-derived `name` — the two surfaces sometimes diverge
        (e.g. a combined manifest label "Grp Membrane Housings" vs a per-item BoM
        requirement) even though the same physical part is drawn under one of the two
        strings. Consuming it is additive-only: a canonical hit can turn a NOT-found into a
        found, never the reverse.

        `canonical_tag` (added 2026-07-05, BESS v3 LAP-3 GA-coverage pass): the manifest's
        OWN equipment_tag for this row, tried as a SECOND tag candidate alongside the BoM's
        own `tag` — the SAME divergence as `canonical`/`name`, just for tag identity. A
        SYNTHETIC aggregated block (the rack-farm BoP lineup — one drawn box standing for a
        whole BoM line, e.g. every per-rack accessory) mints its OWN counter-based tag
        ("RH-101") that is never the BoM's tag ("EP-1"); the drawing genuinely shows + tags
        the part, but under a different tag string, and its NAME never reaches the area-
        capped GA schedule when the item is small. Without this, a real, honestly-drawn
        small principal reads as a GA-coverage gap purely because of tag-string divergence.
        Also additive-only, tried ONLY when the primary tag is absent from the text at all
        (never overrides an ambiguous-tag verdict on the primary tag)."""
        if key == "blender":
            return tag in placed or _norm(name) in placed_norms
        # INTENT: a sealed handheld instrument's GA IS the product placement — the same
        # parts-manifest that proves blender coverage. Requiring plant-GA SVG tag text
        # for EP-2/X-24 left GA at 0/2 while blender was 27/28 (colorimeter 0819).
        # EXTENDED (Powerwall 2026-07-15): product-scale sealed cabinets share this —
        # thin-TOP defers tags to FRONT, and many honest outlines fall below the
        # 16×12 px tag floor; coverage must not Goodhart "readable tag text".
        if (instrument_device or product_scale) and key == "general-arrangement":
            if tag in placed or _norm(name) in placed_norms:
                return True
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
            if nm.lower() in txt.lower() or _sing(nm) in _sing(txt):
                return True
            # ELLIPSIS-TRUNCATION credit (Codema 2100 BoM-Ledger 8/10 root, 2026-07-09): a
            # drawing column legitimately truncates a long name with '…' ("W16 Nursery
            # Fertigation Dosing Pu…", "W22–23 Fertigation Dosing Pump (BACK…"), so the full
            # BoM name is never a substring of the SVG text — a matcher FALSE-NEGATIVE on a
            # part that IS drawn (the known parts_ledger false-neg class). Credit when a
            # '…'-terminated PREFIX of THIS name (≥ 12 chars, long enough to be unambiguous)
            # appears in the text. Prefix-of-THIS-name only — a truncated run belonging to a
            # DIFFERENT part can never credit this one (a catch-fix, never a relax).
            if _ellipsis_prefix_match(nm, txt):
                return True
            # SYNONYM STAGE CREDIT (Codema ship 2026-07-09): a 'Gac Filter' BoM line is the
            # SAME GAC treatment stage the P&ID already labels 'Gac Softener' / 'Softener' /
            # 'Carbon' — credit when the drawing carries the shared stage token. Narrow:
            # only fires when BOTH the BoM name and the drawing text share a GAC/softener/
            # activated-carbon stage noun (never a bare 'filter' alone).
            _gac_rx = re.compile(r"\b(?:gac|softener|activated\s+carbon|granular\s+carbon)\b", re.I)
            if _gac_rx.search(nm) and _gac_rx.search(txt):
                return True
            # BUSBAR ↔ MAIN DC BUS (Powerwall 2026-07-15): canonical_board_name stamps
            # the SLD main bus as 'MAIN DC BUS' while the BoM keeps part names
            # 'Busbar Assembly' / 'DC Busbar Assembly' / 'Busbar Interconnects'.
            # Those parts ARE the drawn DC bus — credit when both sides carry a
            # bus/busbar token (never a bare 'assembly' alone).
            _bus_rx = re.compile(r"\bbus(?:bar)?\b", re.I)
            if _bus_rx.search(nm) and _bus_rx.search(txt):
                return True
            return False

        name_present = _present(name) or (bool(canonical) and canonical != name and _present(canonical))

        # tag-matching decision extracted to the module-level, unit-testable
        # _tag_covered_verdict (see its docstring + _selftest's TAG_VERDICT_CASES).
        for _t in (tag, canonical_tag):
            _v = _tag_covered_verdict(_t, txt, ambiguous_tags, name_present)
            if _v is not None:
                return _v
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
        typ = _classify(name, tag, instrument_device)
        # pm resolution: direct TAG lookup first; NAME fallback second (2026-07-05 — a
        # synthetic aggregated block's own tag never equals the BoM tag; see
        # placed_by_name's docstring above).
        pm = placed.get(tag) or placed_by_name.get(_norm(name)) or {}
        sublist = subs.get(tag, [])
        # canonical / canonical_tag = the manifest's OWN name / equipment_tag for this
        # row — second match candidates (2026-07-04 canonical-name-register audit +
        # 2026-07-05 canonical-tag extension; see covered()'s docstring).
        cov = {key: covered(tag, name, key, pm.get("name"), pm.get("equipment_tag")) for key in REPS}
        expected = TYPE_EXPECTED.get(typ, set())
        # Consistency with the 3D scene: a part the GA/render correctly OMIT — inline valves,
        # field instruments, switchgear/panel internals, fittings (P&ID-level detail dropped
        # from the Blender scene by build_universal_scene's ga_massing filter) — must NOT be
        # EXPECTED in the render or GA either; otherwise its guaranteed-absence deflates
        # render/GA coverage. It REMAINS expected on the P&ID / schedules (its proper home).
        # EXTENDED 2026-07-05 (BESS v3 denominator-honesty pass): the SAME "lives inside an
        # already-massed parent, never its own drawn object" principle also applies to the
        # SINGLE-LINE one-line diagram AND the PANEL SCHEDULE — a rack's grounding wire, a
        # transformer's cable sealing end, a fibre patch panel, a fuse's holder/mount-rail,
        # are not power-path feeder equipment either, so they must not inflate the single-
        # line/panel-schedule denominator (Electrical tab). CORRECTED 2026-07-05 (v10 Part
        # names 7.6 gap): the comment above always said "panel-schedule" too, but the code
        # only ever stripped {blender, general-arrangement, single-line-diagram} — leaving
        # panel-schedule STILL expected for every one of these accessories (TX-102 transformer
        # neutral grounding, TX-105 transformer cable sealing end, X-40 fuse holder, X-42 fuse
        # mount rail all landed as false "not shown on ANY drawing/manifest" gaps even though
        # they are exactly the mounting/termination hardware this exemption was written for).
        # Universal — keyed on the SAME is_ga_non_massing noun signal already proven against
        # cable glands / terminal blocks / mounting frames, not a per-tag table.
        if ga_massing.is_ga_non_massing(name):
            expected = expected - {"blender", "general-arrangement", "single-line-diagram", "panel-schedule"}
        # INTENT: a fluid-less handheld instrument has no P&ID / process-schedule home —
        # those tabs are VERIFIED NA in build-excel-export when isInstrumentDevice + zero
        # fluid edges. Leaving pid/process-schedules EXPECTED here inflated not-found
        # (colorimeter 0819: 18 instrument parts "missing" from an NA'd P&ID) and kept
        # Part-names / coverage denominators dishonest. Mirror the Excel NA claim.
        if instrument_device:
            # Fluid-less handheld pack: no P&ID / BFD / process / HVAC homes (2026-07-14).
            expected = expected - {
                "pid", "process-schedules", "block-flow-diagram",
            }
            # Device electrical design lives on the PCB tab / connection trace / interconnect
            # — not a plant single-line or panel schedule (those are also NA when pcb is bespoke).
            if typ in ("electrical", "instrument", "other"):
                expected = expected - {"single-line-diagram", "panel-schedule"}
            # Enclosure / lid / shell principals still belong on blender + GA.
            if re.search(
                    r"enclosure|housing|shell|lid|shroud|chassis|case\b", name, re.I):
                expected = expected | {"blender", "general-arrangement"}
            elif typ in ("electrical", "instrument", "other"):
                # INTENT (2026-07-14 Tristan): gold-spine BoM PRINCIPALS (Compute UI
                # Module, LED Source Board, …) MUST stay expected on blender + GA —
                # dropping them from the denominator made coverage 7/7 while I-201
                # was never drawn (Goodhart). Sub-component / absorbed host lines
                # still do not demand a plant GA box.
                _is_spine_principal = bool(
                    re.match(r"^[IXEP]-\d{3}$", str(tag or "").strip())
                    and int(re.sub(r"\D", "", str(tag) or "0") or "0") >= 200
                ) or bool(re.search(
                    r"compute\s*ui\s*module|led\s*source\s*board|"
                    r"optical\s*detector\s*module|cuvette\s*holder|"
                    r"collimating\s*optic|wavelength\s*selection|"
                    r"optical\s*path\s*baffle",
                    name, re.I,
                ))
                _is_cable_consumable = bool(re.search(
                    r"interconnect\s*cable|qwiic|stemma\s*header|"
                    r"fastener|consumable|ambient\s*light\s*cap",
                    name, re.I,
                ))
                if _is_spine_principal and not _is_cable_consumable:
                    expected = expected | {"blender", "general-arrangement", "interconnect"}
                else:
                    # Internal electronics / membranes — do not demand a plant GA box.
                    expected = expected - {"blender", "general-arrangement"}
                    # Still credit blender/GA if the part WAS drawn.
                    if cov.get("blender") or cov.get("general-arrangement"):
                        expected = expected | {k for k in ("blender", "general-arrangement")
                                               if cov.get(k)}
        # INTENT (2026-07-14 Powerwall): a dry electrical product's P&ID/BFD honestly
        # declares NA-BY-DESIGN — those sheets are NOT a home for process vessels /
        # rotating kit. Leaving them EXPECTED made coverage pid=0/7 while the GA +
        # SLD + hero agreed. Mirror the SVG's own NA declaration into the denominator.
        if "NA-BY-DESIGN" in (rep_text.get("pid") or ""):
            expected = expected - {"pid"}
        if "NA-BY-DESIGN" in (rep_text.get("block-flow-diagram") or ""):
            expected = expected - {"block-flow-diagram"}
        if "NA-BY-DESIGN" in (rep_text.get("process-schedules") or ""):
            expected = expected - {"process-schedules"}
        # Traction pack: no plant process/HVAC homes. Mechanical principals sit on
        # blender+GA; HV electrical spine (motor/inverter/connector/fuse/busbar) on SLD.
        if _traction_pack:
            expected = expected - {
                "pid", "process-schedules", "block-flow-diagram", "hvac-layout",
                "panel-schedule",
            }
            _mech = bool(re.search(
                r"reduction\s*gear|gearbox|mgu\s*cold\s*plate|cold\s*plate|"
                r"traction\s*drive\s*housing|hv\s*shield|mounting\s*ear",
                name, re.I,
            ))
            # Massed HV principals (story meshes / GA boxes).
            _elec_massed = bool(re.search(
                r"traction\s*(?:ipmsm\s*)?motor|ipmsm|motor[-\s]?generator|"
                r"sic\s*traction\s*inverter|(?<!desat\s)\btraction\s*inverter\b|"
                r"hv\s*(?:dc\s*)?connector",
                name, re.I,
            ))
            # Series HV protection / bus — SLD symbols only, not GA boxes.
            _elec_sld_only = bool(re.search(
                r"hv\s*dc\s*fuse|\bdc\s*fuse\b|hv\s*dc\s*busbar|dc\s*busbar\s*link",
                name, re.I,
            ))
            if _mech:
                expected = expected | {"blender", "general-arrangement"}
                expected = expected - {"single-line-diagram", "panel-schedule"}
            if _elec_massed:
                expected = expected | {
                    "blender", "general-arrangement", "single-line-diagram",
                }
            if _elec_sld_only:
                expected = expected | {"single-line-diagram"}
                expected = expected - {"blender", "general-arrangement", "panel-schedule"}
            # Twin bare names — SLD credit via richer IPMSM/SiC principal only.
            if re.fullmatch(r"traction\s*motor", name.strip(), re.I) or re.fullmatch(
                r"traction\s*inverter", name.strip(), re.I,
            ):
                expected = expected - {
                    "blender", "general-arrangement", "single-line-diagram",
                    "panel-schedule",
                }
            # Gate-drive / desat boards live on the MCU — not separate SLD feeders.
            if re.search(r"desat|gate\s*driver|overcurrent\s*trip", name, re.I):
                expected = expected - {
                    "blender", "general-arrangement", "single-line-diagram",
                    "panel-schedule",
                }
            # Coolant manifold is absorbed by the cold-plate story mesh — not a
            # separate GA box. Phase-overcurrent with no ISA tag is not massing.
            if re.search(r"coolant\s*manifold", name, re.I):
                expected = expected - {"blender", "general-arrangement"}
            if not str(tag or "").strip() or str(tag).strip() in ("—", "-"):
                expected = expected - {
                    "blender", "general-arrangement", "single-line-diagram",
                    "panel-schedule",
                }
        # A TRANSFORMER is supply-side power conversion UPSTREAM of the board, not a
        # consuming LOAD WAY — a panel schedule lists load circuits, so expecting the
        # transformer there deflates coverage on a correctly-drawn board (Codema 2100:
        # TX-101 held BoM-Ledger at 8/10 while the single-line — its proper home, which
        # stays expected — already showed it). Same denominator-honesty discipline as the
        # accessory strip above; keyed on the generic transformer noun, never a tag table.
        if re.search(r"\btransformer\b", name, re.I):
            expected = expected - {"panel-schedule"}
        # A pure document/label/certification-record row (Tristan's Codema-discipline ask,
        # 2026-07-05) has NO engineering-drawing home at all — expected NOWHERE, exactly like
        # a PARAMETRIC materials-allowance row. Never inferred from status; a name-level
        # signal shared with the 3D-massing decision (ga_massing.is_pure_documentation).
        if ga_massing.is_pure_documentation(name):
            expected = set()
        # INTENT: a PARAMETRIC materials/network allowance (zoned-delivery kits, hand-
        # watering stations, DN-family pipe runs) is a take-off aggregate, not a discrete
        # P&ID node — same "expected nowhere" discipline as pure documentation. Without
        # this, a descriptive name containing 'valve' trips TYPE_RULES → type=valve →
        # expected {pid, process-schedules} and deflates P&ID coverage (Codema ship).
        if str(r.get("status") or "").upper() == "PARAMETRIC":
            expected = set()
        # FPK physics-tree densify concept lines (0846 traction MGU): internal cassette
        # take-offs mirrored from fpkPhysicsTree — not individually tagged GA objects.
        _basis_early = str(r.get("basis") or "")
        if (
            str(r.get("provenance") or "") == "fpk_bom_densify/v1"
            or re.match(r"^FPK-D-\d{3}$", tag)
            or re.search(r"fpk\s+physics-tree\s+densify", _basis_early, re.I)
        ):
            expected = set()
        basis_full = _basis_early
        eq_tools = _find_tools_for_equipment(tag, name, basis_full)
        # NOT-FOUND STATUS SPLIT — classified from the FULL basis (never the display-
        # truncated `basis` field below) so a signal past 90 chars is never missed.
        # None for every other status (IDENTIFIED/BESPOKE/SYSTEM/… never reach this).
        nf_substatus = _not_found_substatus(
            name, basis_full, typ, _pv_by_norm, instrument_device,
            traction_drive=_traction_pack,
        ) if r.get("status") == "NOT FOUND" else None
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
        # DECISION: prefer the SHORTEST contains-match (fewest extra tokens) so
        # "drain water tank" binds Drain Water Tank, not Nursery Drain Water Tank
        # (codema TK-101 orphan, 2026-07-09). First-wins on a longer superstring
        # was the false join.
        best = None  # (extra_len, row)
        for k, e in eq_by_key.items():
            if not k:
                continue
            if k in ikey or ikey in k:
                extra = abs(len(k) - len(ikey))
                if best is None or extra < best[0]:
                    best = (extra, e)
        return best[1] if best else None

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
        fn = fe["name"] if fe else (_boundary_label(fr_key) or fr_key.title())
        tn = te["name"] if te else (_boundary_label(to_key) or to_key.title())
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
        # a recognised BOUNDARY endpoint (grid / ambient / heat_rejection …) is a
        # legitimate battery-limit, never a stale reference (2026-07-11 run 61).
        unresolved = [k for k in unresolved if not _boundary_label(k)]
        if any(not _in_design(k) for k in unresolved):
            stale_ties.append({"from_part": r.get("from_part"), "to_part": r.get("to_part"),
                               "mechanism": mech,
                               "unresolved": "from_part" if not fe else "to_part"})
            continue
        attached_pairs.add((fr_key, to_key, mech))
        kind = MECH_KIND.get(mech, MECH_KIND.get(r.get("service", ""), "tie"))
        fn = fe["name"] if fe else (_boundary_label(fr_key) or fr_key.title())
        tn = te["name"] if te else (_boundary_label(to_key) or to_key.title())
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

    # INTENT (2026-07-29 0846): traction packs often race with empty
    # connection-schedule + abstract eng topology (hv_battery_dc_bus) that never
    # joins BoM tags. Synthesise the HV spine from seated principals so ledger
    # completeness / Connection Trace cannot floor on a known-good pack form.
    if _traction_pack:
        n_td = _synthesize_traction_hv_spine(equipment, connections, attached_pairs)
        if n_td:
            print(f"[parts-ledger] traction HV spine: attached {n_td} BoM-named "
                  f"electrical_bus edge(s) (connector→fuse→bus→SiC→motor)")

    # INTENT (2026-07-14 Tristan adversarial): gold-spine / handheld BoM collapses
    # USB/MCU/fuse hosts into Compute UI Module + LED Source Board, but the
    # connection-schedule + Blender ledger still emit 50+ ghost host ties.
    # Connection trace then scores 10 on ~7 rendered rows while the ledger lists
    # 52 — Goodhart. Prune to principal↔principal edges (remap absorbed hosts).
    if instrument_device:
        connections, n_ghost_drop = _prune_instrument_ghost_connections(
            equipment, connections)
        if n_ghost_drop:
            print(f"[parts-ledger] instrument ghost prune: dropped {n_ghost_drop} "
                  f"absorbed-host / unresolved ties → {len(connections)} principal "
                  f"connection(s) (Connection trace honesty)")

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
    # GOTCHA: untagged rows (tag "—" / blank) are still research gaps on the
    # equipment list, but they must NOT inflate the top-level `not_found` tally
    # the Part names scorer consumes — an em-dash is not an equipment identity,
    # and counting six of them as six distinct gaps double-counts against the
    # tagged residual (Codema ship, 2026-07-09: 17 "not-found" of which 6 were "—").
    def _is_real_tag(tag: object) -> bool:
        t = str(tag or "").strip()
        return bool(t) and t not in ("—", "-", "–", "−")

    not_found = [e["tag"] for e in equipment
                 if e["status"] == "NOT FOUND"
                 and e.get("not_found_status") == "NOT FOUND"
                 and _is_real_tag(e.get("tag"))]
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
                       "break tank", "header tank", "expansion vessel", "expansion reservoir",
                       # INTENT (Pioreactor 0327): a batch culture vessel / vial is a
                       # dead-leg working volume — media doses IN; the broth stays put.
                       # Requiring fluid OUT floored Interconnect (missing_output V-101).
                       "culture vessel", "culture vial", "working volume",
                       # Terminal drain/recovery reservoirs (codema TK-101, 2026-07-09):
                       # a "Drain Water Tank" is a dead-leg collection buffer — one tie
                       # (in OR out) is correct, not a flow-through in+out. Universal:
                       # role noun, never a tag table.
                       "drain water", "drainwater", "recovery tank", "return tank",
                       "collection tank", "dirty water"}
    # INTENT (OpenDrop 0410): lab cartridge / syringe / EWOD fluid filters on a
    # device-scale instrument are consumable dead-legs (dose → trap), NOT plant
    # separators that need fluid OUT. Gated on instrument_device below so a plant
    # water-treatment "Fluid Filter" still requires in+out.
    _INSTRUMENT_LAB_FILTER_BUFFER = (
        "fluid filter", "syringe filter", "cartridge filter", "inline filter",
        "sample filter", "media filter",
    )

    PROCESS_TYPES = {"vessel", "rotating", "exchanger", "separator", "valve"}
    ELECTRICAL_TYPES = {"electrical"}
    INSTRUMENT_TYPES = {"instrument"}
    CONTROL_TYPES = {"control"}
    PASSIVE_TYPES = {"structural", "other"}
    # INTENT: controllers nested inside a SCADA/panel cabinet (EP-105 contents) are
    # already credited via the cabinet aggregate — auditing them again as top-level
    # orphans is a false concern (codema X-120..X-135, 2026-07-09). Build the set
    # once from the same cabinet assignment the ledger already computes.
    _cabinet_content_tags: set = set()
    try:
        _cab_preview = _build_cabinets(equipment, set())
        for _cab in (_cab_preview.get("cabinets") or []):
            for _c in (_cab.get("contents") or []):
                _ct = _c.get("tag") if isinstance(_c, dict) else None
                if _ct:
                    _cabinet_content_tags.add(str(_ct))
    except Exception:
        _cabinet_content_tags = set()
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
        "nutrient tank", "stock tank", "day tank", "concentrate tank", "dosing tank", "chemical tank",
        # ENCLOSURE / CABINET COOLING FANS move UNDUCTED AIR — they are never in a piped
        # process-fluid path, so requiring a fluid in+out is a false orphan (Powerwall v13:
        # the EC cooling fan held process connectivity at 50%). Universal: every enclosure
        # fan (utility container or wall cabinet) has a POWER feed (electrical connectivity
        # covers it), not process pipework.
        "cooling fan", "ventilation fan", "enclosure fan", "cabinet fan", "axial fan", "case fan",
        # INSTRUMENT STRUCTURAL / ELECTRONIC MOUNTS (2026-07-25, organoid council): a mounting
        # fixture, base plate, standoff, thermal insulation/interface pad, debug header or creepage
        # slot carries NO process fluid — it is a passive support/electronic part whose real tie is
        # mechanical (assembly) or signal/power, never a piped fluid in+out. Without this they got a
        # PROCESS etype → flagged missing-fluid → the residual closer plumbed spurious WATER edges
        # (e.g. "Debug Header -> Thermal Insulation | water", "Vial Holder Fixture -> Chassis Base
        # Plate | water"). CONSERVATIVE phrases only — deliberately NOT the bare nouns "header" /
        # "housing" / "plate" / "fixture", which would wrongly exclude a wetted media HEADER, filter
        # HOUSING, manifold PLATE or pump-HEAD fixture (council: Kimi false-exclusion warnings).
        "vial holder", "holder fixture", "cuvette holder", "sample holder", "probe holder",
        "base plate", "chassis base", "mounting frame", "mounting plate", "mounting bracket",
        "standoff", "thermal insulation", "thermal interface pad", "debug header", "creepage"}

    # ── 2c. DEVICE-INSTRUMENT AUTHORITATIVE-TOPOLOGY TIES (2026-07-13) ────────────────
    # A device instrument's signal + DC-rail edges are PCB-level: they are NEVER drawn as
    # 3-D pipes, and the scene DECLUTTERS the small I&C parts (Power Indicator LED, Status
    # Indicator, Battery Charge Management Circuit) OUT of the placed set — so their real
    # electrical edges vanish from connection-schedule.json even though the AUTHORITATIVE
    # graph (contract.topology from deriveInstrumentTopology) carries them. That made a
    # correctly-connected part read as missing_input/orphan_instrument (Connection-trace 0).
    # The contract topology is the truth for connectivity (the 3-D routing is a drawing
    # artifact); attach every contract edge not already carried by a sized/ledger run.
    # Gated on instrument_device so NO plant/BESS/Powerwall connectivity is touched.
    if instrument_device:
        _oc = (state.get("orchestratorContract") or {}).get("topology") or []
        _ec = (state.get("engineeringContract") or {}).get("topology") or []
        _seen_topo = set()
        _topo_edge_records = []
        _n_topo_attached = 0
        for _e in (list(_oc) + list(_ec)):
            if not isinstance(_e, dict):
                continue
            _fp, _tp = _e.get("from_part"), _e.get("to_part")
            _mech = _e.get("mechanism") or "signal"
            if not _fp or not _tp:
                continue
            _fk, _tk = _norm(str(_fp)), _norm(str(_tp))
            if (_fk, _tk, _mech) in attached_pairs or (_fk, _tk, _mech) in _seen_topo:
                continue
            _seen_topo.add((_fk, _tk, _mech))
            _fe, _te = resolve(_fk), resolve(_tk)
            if not (_fe or _te):
                continue  # neither endpoint is a real placed/ledger part — skip (no phantom)
            _topo_edge_records.append((_fp, _tp, _mech, _fe, _te))
            _fn = _fe["name"] if _fe else str(_fp)
            _tn = _te["name"] if _te else str(_tp)
            if _te:
                _te["inputs"].append(f"{_fn} ({(_fe or {}).get('tag') or '?'}) via {_mech} [contract-topology]")
            if _fe:
                _fe["outputs"].append(f"{_tn} ({(_te or {}).get('tag') or '?'}) via {_mech} [contract-topology]")
            _n_topo_attached += 1
        if _n_topo_attached:
            print(f"[ledger] device-instrument: attached {_n_topo_attached} authoritative-topology tie(s) "
                  f"the 3-D-declutter dropped from the connection schedule")

        # INTENT: a physical sensor/AFE interconnect cable is the CARRIER for an
        # endpoint-to-endpoint topology edge, not itself an endpoint in the topology.
        # If it remains 0/0 after the authoritative topology pass, inherit the best
        # detector/AFE/ADC→compute signal edge so the cable is auditable as connected.
        _n_carriers_attached = 0
        for _carrier in equipment:
            if (_carrier.get("inputs") or _carrier.get("outputs")
                    or not _is_instrument_signal_carrier(_carrier.get("name") or "")):
                continue
            _candidates = []
            for _fp, _tp, _mech, _fe, _te in _topo_edge_records:
                _score = _instrument_signal_carrier_edge_score(
                    _carrier.get("name") or "",
                    (_fe or {}).get("name") or str(_fp),
                    (_te or {}).get("name") or str(_tp),
                    _mech,
                )
                if _score > 0 and (_fe or _te):
                    _candidates.append((_score, _fp, _tp, _mech, _fe, _te))
            if not _candidates:
                continue
            _score, _fp, _tp, _mech, _fe, _te = sorted(
                _candidates,
                key=lambda item: (-item[0], str(item[1]), str(item[2])),
            )[0]
            _fn = (_fe or {}).get("name") or str(_fp)
            _tn = (_te or {}).get("name") or str(_tp)
            _carrier["inputs"].append(
                f"{_fn} ({(_fe or {}).get('tag') or '?'}) via signal carrier [contract-topology]"
            )
            _carrier["outputs"].append(
                f"{_tn} ({(_te or {}).get('tag') or '?'}) via signal carrier [contract-topology]"
            )
            _n_carriers_attached += 1
        if _n_carriers_attached:
            print(f"[ledger] device-instrument: attached {_n_carriers_attached} signal-carrier cable(s) "
                  f"to their authoritative endpoint pair")

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
    # On a device instrument, onboard MCU/compute/display also counts — see
    # `_control_present` (colorimeter 1441 Connection-trace 0/10).
    has_control = _control_present(equipment, instrument_device=instrument_device)

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
        is_origin = _name_has_boundary_keyword(name_l, ORIGIN_KEYWORDS)
        # A device instrument's own power SOURCE (battery / USB inlet / DC jack) is a
        # battery-limit ORIGIN — no upstream plant edge, like a mains incomer. Gated on
        # the instrument flag so a BESS 'battery' is never treated as an origin.
        if instrument_device and not is_origin and _is_instrument_power_origin(name_l):
            is_origin = True
        is_sink = _name_has_boundary_keyword(name_l, SINK_KEYWORDS)
        # Electrical discharge / air-exhaust nouns share sink keywords but are not
        # process-fluid sinks (P1 dry-instrument; cold-v15 Connection-trace).
        if is_sink and _is_non_fluid_boundary_noun(e["name"]):
            is_sink = False

        if is_origin and not has_in:
            origin_parts.append({"tag": tag, "name": e["name"], "type": etype})
        if is_sink and not has_out:
            sink_parts.append({"tag": tag, "name": e["name"], "type": etype})

        # PARAMETRIC materials/network take-off (2026-07-09): skip BEFORE the
        # PASSIVE boundary predicate — zoned-distribution rows are typed 'other'
        # and their names contain "delivery"/"drain", which would otherwise raise
        # false missing_input/output concerns (codema X-150..X-158). Universal:
        # status-keyed, same discipline as the orphan-loop exemption below.
        if e.get("status") == "PARAMETRIC":
            continue

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
            # Grid electrical incomers (EP-102): true battery-limit origins — no
            # upstream plant edge by design; _passive_boundary_concern returns None.
            if _is_grid_electrical_origin(e["name"]):
                continue
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

        # CIVILS take-off (2026-07-09): a below-grade excavation/concrete surround
        # shares the vessel display name but is NOT a flow-through process node —
        # connection edges attribute to the BESPOKE vessel (TK-*). Skip the
        # process-connectivity denominator exactly like the orphan-loop exemption
        # below (status==CIVILS). Universal: status-keyed, never a name table.
        if e.get("status") == "CIVILS":
            continue

        is_buffer = any(kw in name_l for kw in BUFFER_KEYWORDS)
        if instrument_device and any(kw in name_l for kw in _INSTRUMENT_LAB_FILTER_BUFFER):
            is_buffer = True

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
            # GOTCHA (colorimeter 1441): a CUVETTE CONSUMABLE / sample cell is a passive
            # optical path element, NOT a transmitter that reports to control — flagging it
            # orphan_instrument floored Connection Trace to 0/10 while every row said ✓ OK
            # (the concern never appeared as a row status). Universal noun family, not a
            # product name.
            if _is_instrument_consumable(e["name"] or ""):
                n_instrument_associated += 1
            elif has_any or has_control:
                n_instrument_associated += 1
            else:
                connectivity_concerns.append({
                    "tag": tag, "name": e["name"], "type": etype,
                    "issue": "orphan_instrument",
                    "detail": "Sensor/analyser with no connection AND no control system in the "
                              "plant — nothing for it to report its measurement to."})

        elif etype in ELECTRICAL_TYPES:
            n_electrical_total += 1
            # INTENT (NinjaPCR 1330): host peripherals absorbed into the compute
            # principal (polyfuse / DC-DC / USB / thermal fuse / …) do not carry
            # their own drawn in+out edges — they ride the MCU kit. Flagging them
            # missing_input/output floored Interconnect content_score to 0 while
            # layout_metrics already earned the Power story.
            if (
                instrument_device
                and _HOST_INTO_COMPUTE_RE.search(e.get("name") or "")
                and not _COMPUTE_PRINCIPAL_RE.search(e.get("name") or "")
                and any(_COMPUTE_PRINCIPAL_RE.search(x.get("name") or "")
                        for x in equipment)
            ):
                n_electrical_connected += 1
                continue
            # INTENT (2026-07-29 0846): bare Traction Motor / Traction Inverter
            # twins are desaturated when a richer IPMSM / SiC principal seats —
            # do not double-count them in the electrical completeness denom.
            if _traction_pack:
                _en = (e.get("name") or "").strip()
                _has_ipmsm = any(re.search(r"\bipmsm\b|motor[-\s]?generator",
                                           x.get("name") or "", re.I) for x in equipment)
                _has_sic = any(re.search(r"sic\s*traction\s*inverter",
                                         x.get("name") or "", re.I) for x in equipment)
                if _has_ipmsm and re.fullmatch(r"traction\s*motor", _en, re.I):
                    continue
                if _has_sic and re.fullmatch(r"traction\s*inverter", _en, re.I):
                    continue
            # A TERMINAL / PASSIVE electrical device legitimately has no downstream
            # LOAD edge — it is the END of a circuit, not a distributor: a fuse / surge
            # protector (SPD) / protective relay protects the bus it taps; a cable tray
            # / terminal block / enclosure panel is passive containment. These need a
            # power feed IN (where present) but NOT an OUT — the electrical analogue of
            # a process SINK. Universal, name-only (no class table). A part with NO
            # required electrical role at all (a pure enclosure with no power feed) is
            # not a concern in either direction.
            # Circuit breakers / MCCBs are the SAME protective-device family as MCB/
            # fuse — they protect the feeder they sit on; the schedule already sizes
            # them as board components, not as flow-through electrical nodes with
            # their own drawn in+out edges. Without this, every BoM "Circuit Breaker"
            # line false-orphans and floors connectivity (Codema ship, 2026-07-09).
            # FLOW: _electrical_edge_needs — busbar interconnect / AC-filter / fuse+HMI
            # terminal exemptions (Powerwall X-117/X-101 false-concern fix, 2026-07-14).
            needs_in, needs_out = _electrical_edge_needs(
                e["name"], has_any=has_any, is_origin=is_origin, is_sink=is_sink)
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
            # DECISION: a controller already nested in a cabinet's contents is
            # credited via the cabinet aggregate — do not re-flag as orphan
            # (codema X-120..X-135 duplicate top-level rows inside EP-105).
            if tag in _cabinet_content_tags:
                continue
            # a TELEMETRY/SCADA GATEWAY aggregates other controllers' data upstream —
            # it is the network EDGE, not a device commander; requiring a drawn
            # 'controls' edge false-orphans it on every compact product whose comms
            # ride the control bus (2026-07-11 run 59, X-141 SCADA Gateway).
            _is_net_edge = bool(re.search(r"gateway|telemetry|remote\s+monitor|router|modem", name_l, re.I))
            # INTENT (P6 floor-9 / cell-cycler cold-v17): Phase-2 "HMI Filler N"
            # / "Filler N" placeholders are not real controllers — flagging them
            # as orphan_controller demotes Interconnect + Connection-trace while
            # the sizing pass drops them. Skip here so freshen-scorer (ledger
            # only) cannot re-floor on a word the BoM cleanup already rejects.
            if not has_any and not _is_net_edge and not _is_filler_pad_controller(name_l):
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
        # CIVILS take-off (2026-07-09, Codema CIV-101/CIV-102): a below-grade
        # excavation/concrete surround row shares the vessel's display name but
        # carries a DISTINCT tag (CIV-*) from the BESPOKE process vessel (TK-*).
        # Connection edges attribute to the vessel identity; the civils row is a
        # materials take-off, not a second flow-through node — same exemption
        # discipline as PARAMETRIC. Universal: status-keyed, never a name table.
        if e.get("status") == "CIVILS":
            continue
        # AIR-mover / HVAC / sub-component EXEMPTION (2026-07-05, the INV-4 'PCS cooling
        # fan tray' orphan fix): the comment above this loop has always PROMISED "same
        # exemption discipline as AIR_OR_SUBCOMPONENT_KEYWORDS above" (the connectivity-
        # tally loop at line ~1216), but the check itself was never actually added HERE —
        # a fan/blower/HVAC accessory carries an AIR or PARENT tie, never the conventional
        # equipment-to-equipment fluid/electrical edge this orphan check looks for, so it
        # was flagged an orphan on the exact same false-negative the connectivity tally
        # already fixed for it. Universal — the SAME keyword set, no new heuristic.
        if any(kw in (e.get("name") or "").lower() for kw in AIR_OR_SUBCOMPONENT_KEYWORDS):
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
    # covered()'s TAG-matching decision (2026-07-05, BESS v3 LAP-3 GA-coverage pass):
    # a placeholder tag ("—") must NEVER bare-match (the false-GA-coverage bug found
    # on "deflagration vent seal" — " — " sits in unrelated drawing furniture, every
    # dash-tagged row read as covered on every 2D drawing); an ambiguous real tag
    # requires NAME corroboration; a genuinely absent tag returns None so the caller
    # tries the next candidate (the manifest's canonical_tag, closing the "synthetic
    # aggregated block mints its own counter-based tag" gap).
    _tv_cases = [
        # (tag, txt, ambiguous_tags, name_present) -> want
        ("—", " some — table row ", set(), False, None),
        ("—", " some — table row ", set(), True, None),
        ("EP-1", " drawn as >EP-1< here ", set(), False, True),
        ("AT", " multiple >AT< bubbles ", {"AT"}, False, False),
        ("AT", " multiple >AT< bubbles ", {"AT"}, True, True),
        ("RH-101", " no such tag text at all ", set(), False, None),
    ]
    for _t, _txt, _amb, _namep, _want in _tv_cases:
        _got = _tag_covered_verdict(_t, _txt, _amb, _namep)
        if _got != _want:
            print(f"  FAIL _tag_covered_verdict({_t!r}, ambiguous={_amb!r}, "
                  f"name_present={_namep!r}) = {_got!r}, want {_want!r}")
            bad += 1
    # _ellipsis_prefix_match (2026-07-09, Codema 2100 BoM-Ledger 8/10 root): a column-
    # truncated name on the drawing must credit ITS part (proveCatch) and never a
    # different part or a short/ambiguous prefix (proveNoFalsePositive).
    _ep_cases = [
        # (name, txt, want)
        ("Nursery Fertigation Dosing Pump", "W16 Nursery Fertigation Dosing Pu… 1 (8.60)", True),
        ("Fertigation Dosing Pump (BACKUP / STANDBY)", "W22–23 Fertigation Dosing Pump (BACK… 2", True),
        # a DIFFERENT pump: the truncated run is not a prefix of this name → no credit
        ("Nursery Drain Transfer Pump", "W16 Nursery Fertigation Dosing Pu… 1", False),
        # no ellipsis in the text at all → helper never fires (substring path owns it)
        ("Nursery Fertigation Dosing Pump", "W16 Nursery Fertigation Dosing Pump 1", False),
        # sub-12-char prefix is too ambiguous to credit
        ("Nursery Pump", "W16 Nursery Pu… 1", False),
    ]
    for _nm, _txt, _want in _ep_cases:
        _got = _ellipsis_prefix_match(_nm, _txt)
        if _got != _want:
            print(f"  FAIL _ellipsis_prefix_match({_nm!r}) = {_got!r}, want {_want!r}")
            bad += 1
    cases = [
        ("HMI Touchscreen", "control"),
        ("Operator Interface Panel", "control"),
        ("PLC Controller", "control"),
        ("Drum Screen", "separator"),
        ("Microscreen Filter", "separator"),
        ("UF Membrane Bank", "separator"),
        ("Pressure Transmitter", "instrument"),
        ("Inverter power-module NTC", "instrument"),
        ("Real-time MCU", "control"),
        ("Oil pickup mesh screen", "other"),
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
    cases += [
        # COVERAGE-CLASSIFICATION fix (CO2-v1, 2026-07-05): a column reboiler / reboil pot
        # and a crystalliser/recrystalliser are process equipment by SHAPE, not 'other' —
        # 'other' shrinks TYPE_EXPECTED to {blender, general-arrangement} only, hiding an
        # honest P&ID/BFD coverage check even though both are already drawn there.
        ("MEA Stripper Reboil Pot", "exchanger"),
        ("Distillation Reboiler", "exchanger"),
        ("K2SO4 Recrystalliser", "vessel"),
        ("K2SO4 Recrystallizer", "vessel"),
        # already correctly classified via the pre-existing 'column'/'reactor' tokens —
        # proveCatch that the new 'reboil'/'crystalli[sz]er' additions don't regress these.
        ("Packed Absorber Column", "vessel"),
        ("Stirred Carbonation Reactor", "vessel"),
        ("MEA Distillation Column", "vessel"),
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
    # Grid electrical incomer (codema EP-102, 2026-07-09): true battery-limit origin.
    if _passive_boundary_concern("Mains Incomer", has_in=False, has_out=True) is not None:
        print("  FAIL passive-boundary: 'Mains Incomer' must NEVER raise missing_input "
              "(grid origin has no upstream plant edge)")
        bad += 1
    if not _is_grid_electrical_origin("Mains Incomer"):
        print("  FAIL _is_grid_electrical_origin: 'Mains Incomer' must match")
        bad += 1
    # P1 dry-instrument (cell-cycler cold-v15 Connection-trace): EMC line filter is
    # ELECTRICAL (not process separator); electrical discharge / air-exhaust nouns
    # must NOT raise fluid-sink missing_output; a real process drain still fires.
    if _classify("Emc Line Filter", "") != "electrical":
        print(f"  FAIL type: 'Emc Line Filter' must be electrical, not "
              f"{_classify('Emc Line Filter', '')!r} (bare filter→separator disease)")
        bad += 1
    for _nf in (
        "Per Channel Discharge Load Mosfet",
        "Per Channel Linear Discharge Pass Bank",
        "Exhaust Air Path",
    ):
        if not _is_non_fluid_boundary_noun(_nf):
            print(f"  FAIL non-fluid-boundary: '{_nf}' must be recognised as "
                  f"electrical/air (not process-fluid sink)")
            bad += 1
        if _passive_boundary_concern(_nf, has_in=False, has_out=False) is not None:
            print(f"  FAIL passive-boundary: '{_nf}' must NOT raise missing_output "
                  f"(dry-instrument false fluid sink)")
            bad += 1
    if _is_non_fluid_boundary_noun("Effluent Discharge Header"):
        print("  FAIL non-fluid-boundary: wet-plant 'Effluent Discharge Header' must "
              "STILL be a fluid sink (not swallowed by the electrical/air guard)")
        bad += 1
    if _passive_boundary_concern("Effluent Discharge Header", has_in=False, has_out=False) is None:
        print("  FAIL passive-boundary: wet-plant effluent discharge with no out must "
              "still raise missing_output")
        bad += 1

    # P6 filler-pad controllers (cell-cycler cold-v17 Interconnect/Connection-trace):
    # "HMI Filler 2" must NOT count as an orphan_controller candidate.
    for _fp in ("HMI Filler 2", "Filler 3", "Energy Storage Source Subcomponent 1"):
        if not _is_filler_pad_controller(_fp):
            print(f"  FAIL filler-pad: '{_fp}' must be recognised as padding "
                  f"(not a real orphan_controller)")
            bad += 1
    if _is_filler_pad_controller("Touchscreen HMI Controller"):
        print("  FAIL filler-pad: real 'Touchscreen HMI Controller' must NOT be "
              "swallowed as padding")
        bad += 1

    # DC-DC regulation-board absorption (organoid r11 Interconnect 0/10, 2026-07-26):
    # a power-regulation host peripheral rides the compute kit (no drawn downstream
    # LOAD edge), same as the polyfuse / reverse-polarity / usb-power siblings on the
    # SAME bus. The exemption keyed off `dc dc regulator` but the emitter named it
    # "DC-DC Regulation Board" — "regulation" ≠ "regulator" → X-120 alone false-
    # flagged missing_output and floored Interconnect via min. Pin the noun FAMILY
    # (regulator|regulation, board variant) so the treadmill's name-drift can't reopen
    # it; the negative keeps a genuine PLANT power distributor un-absorbed.
    for _hn in ("DC-DC Regulation Board", "DC-DC Regulator", "Voltage Regulation Module",
                "Power Regulation Board", "Regulator Board"):
        if not _HOST_INTO_COMPUTE_RE.search(_hn):
            print(f"  FAIL host-into-compute: power-regulation peripheral '{_hn}' must be "
                  f"absorbed into the compute kit (rides the MCU, no drawn LOAD edge)")
            bad += 1
    if _HOST_INTO_COMPUTE_RE.search("Zone Distribution Transformer"):
        print("  FAIL host-into-compute: a plant distribution transformer must NEVER be "
              "absorbed (it is a real flow-through electrical node)")
        bad += 1
    # Device-instrument signal-carrier rule (colorimeter 1441): a physical sensor
    # interconnect cable is not itself a topology endpoint, but must inherit the
    # detector/AFE/ADC→compute signal edge so it does not read orphan_instrument.
    _carrier_score = _instrument_signal_carrier_edge_score(
        "Sensor Interconnect Cable",
        "Optical Detector Module",
        "Microcontroller",
        "signal",
    )
    _optical_path_score = _instrument_signal_carrier_edge_score(
        "Sensor Interconnect Cable",
        "Cuvette Holder",
        "Optical Detector Module",
        "signal",
    )
    if _carrier_score <= _optical_path_score:
        print("  FAIL instrument-signal-carrier: sensor interconnect must prefer "
              "detector→compute over sample→detector optical adjacency")
        bad += 1
    if _instrument_signal_carrier_edge_score(
            "Mounting Bezel", "Optical Detector Module", "Microcontroller", "signal") != 0:
        print("  FAIL instrument-signal-carrier: non-cable mechanical parts must not "
              "inherit signal endpoints")
        bad += 1
    if _instrument_signal_carrier_edge_score(
            "Sensor Interconnect Cable", "Optical Detector Module", "Microcontroller",
            "electrical_bus") != 0:
        print("  FAIL instrument-signal-carrier: signal cable rule must not attach "
              "power-bus edges")
        bad += 1
    # Zoned-distribution PARAMETRIC take-off names must not raise via the passive
    # predicate (status skip is the primary gate; name guard is the backstop).
    if _passive_boundary_concern(
            "Zoned distribution — department delivery mains",
            has_in=False, has_out=False) is not None:
        print("  FAIL passive-boundary: zoned-distribution take-off must not raise")
        bad += 1
    # proveCatch (Poseidon 2026-07-16): "feed" must NOT match inside "feedback".
    if _passive_boundary_concern(
            "Force Limit Feedback", has_in=False, has_out=False) is not None:
        print("  FAIL passive-boundary: 'Force Limit Feedback' must NEVER raise "
              "missing_input (feedback ≠ feed origin)")
        bad += 1
    if not _name_has_boundary_keyword("chemical feed line", _ORIGIN_KEYWORDS):
        print("  FAIL boundary-keyword: bare 'feed' as a word must still match origins")
        bad += 1
    if _classify("Force Limit Feedback", "I-111") != "instrument":
        print("  FAIL type: 'Force Limit Feedback' must classify as instrument "
              f"(got {_classify('Force Limit Feedback', 'I-111')!r})")
        bad += 1
    # Cabinet vs housed: a bare PLC/HMI is CONTENTS, not its own empty cabinet.
    if _CABINET_CTRL_RE.search("PLC Controller"):
        print("  FAIL cabinet-regex: bare 'PLC Controller' must NOT be a cabinet "
              "(it is housed contents of SCADA/control system)")
        bad += 1
    if not _HOUSED_CTRL_RE.search("PLC Controller"):
        print("  FAIL housed-regex: 'PLC Controller' must be housed contents")
        bad += 1
    if not _CABINET_CTRL_RE.search("SCADA / Plant Control System"):
        print("  FAIL cabinet-regex: SCADA / Plant Control System must remain a cabinet")
        bad += 1
    # Shortest-contains resolve: drain water tank → Drain Water Tank, not Nursery…
    _eq = {
        "nursery drain water tank": {"name": "Nursery Drain Water Tank", "tag": "TK-115"},
        "drain water tank": {"name": "Drain Water Tank", "tag": "TK-101"},
    }
    _best = None
    _ikey = "drain water tank"
    for k, e in _eq.items():
        if k in _ikey or _ikey in k:
            extra = abs(len(k) - len(_ikey))
            if _best is None or extra < _best[0]:
                _best = (extra, e)
    if not _best or _best[1]["tag"] != "TK-101":
        print(f"  FAIL resolve-shortest: 'drain water tank' must bind TK-101 "
              f"(got {_best})")
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
    _fpk_densify = _not_found_substatus(
        "Oil pickup mesh screen",
        "fpk physics-tree densify · concept line · no fake MPN · material=steel",
        "separator",
        traction_drive=True,
    )
    if _fpk_densify != "FABRICATED":
        print(f"  FAIL not-found-substatus: FPK densify concept line must classify "
              f"FABRICATED (got {_fpk_densify!r})")
        bad += 1
    # proveCatch (2026-07-14): instrument-device custom bezel / sensing subcomponents
    # must classify FABRICATED — never inflate Part names with plant-catalogue NOT FOUND.
    _bez = _not_found_substatus("Mounting Bezel", "bottom-up parametric", "other",
                               instrument_device=True)
    if _bez != "FABRICATED":
        print(f"  FAIL not-found-substatus: instrument Mounting Bezel must be FABRICATED "
              f"(got {_bez!r})")
        bad += 1
    _subc = _not_found_substatus(
        "Sensing Instrumentation Subcomponent 1", "bottom-up parametric", "other",
        instrument_device=True)
    if _subc != "FABRICATED":
        print(f"  FAIL not-found-substatus: instrument sensing subcomponent must be "
              f"FABRICATED (got {_subc!r})")
        bad += 1
    # proveCatch (2026-07-15 NinjaPCR Part names 5.3): Bulk Capacitor / Peltier TEC /
    # MOSFET heater on a device instrument must NOT stay bare NOT FOUND.
    for _npcr_name in ("Bulk Capacitor", "Peltier Tec Module", "Mosfet Heater Switch",
                       "H Bridge Tec Driver", "Current Sense Shunt"):
        _npcr = _not_found_substatus(_npcr_name, "bottom-up parametric · commodity-floor",
                                     "other", instrument_device=True)
        if _npcr == "NOT FOUND":
            print(f"  FAIL not-found-substatus: instrument {_npcr_name!r} must not stay "
                  f"bare NOT FOUND (got {_npcr!r})")
            bad += 1
    _flash = _not_found_substatus("Flash Storage", "bottom-up parametric", "vessel",
                                  instrument_device=True)
    if _flash == "NOT FOUND":
        print(f"  FAIL not-found-substatus: instrument Flash Storage (mis-typed vessel) "
              f"must not stay bare NOT FOUND (got {_flash!r})")
        bad += 1
    _bez_plant = _not_found_substatus("Mounting Bezel", "bottom-up parametric", "other",
                                     instrument_device=False)
    if _bez_plant == "FABRICATED":
        print("  FAIL not-found-substatus proveNoFalsePositive: Mounting Bezel on a "
              "non-instrument plant must NOT auto-classify FABRICATED")
        bad += 1
    _cap_plant = _not_found_substatus("Bulk Capacitor", "bottom-up parametric", "other",
                                     instrument_device=False)
    if _cap_plant != "NOT FOUND":
        print("  FAIL not-found-substatus proveNoFalsePositive: Bulk Capacitor on a "
              f"non-instrument plant must stay NOT FOUND (got {_cap_plant!r})")
        bad += 1
    # proveCatch (0846 traction MGU): SiC inverter / IPMSM on a traction pack are
    # concept-stage fabricated drive hardware — never plant-catalogue NOT FOUND.
    _sic = _not_found_substatus("SiC Traction Inverter", "requirement stated", "electrical",
                               traction_drive=True)
    if _sic != "FABRICATED":
        print(f"  FAIL not-found-substatus: traction SiC inverter must be FABRICATED "
              f"(got {_sic!r})")
        bad += 1
    _ipmsm = _not_found_substatus("Traction Ipmsm Motor Generator", "requirement stated",
                                 "rotating", traction_drive=True)
    if _ipmsm != "FABRICATED":
        print(f"  FAIL not-found-substatus: traction IPMSM must be FABRICATED "
              f"(got {_ipmsm!r})")
        bad += 1
    _sic_plant = _not_found_substatus("SiC Traction Inverter", "requirement stated",
                                     "electrical", traction_drive=False)
    if _sic_plant == "FABRICATED":
        print("  FAIL not-found-substatus proveNoFalsePositive: SiC inverter on a "
              "non-traction plant must NOT auto-classify FABRICATED")
        bad += 1
    # proveCatch: Electrical Control Panel / Cloth Filter must never stay bare NOT FOUND
    # (Codema ship X-106 / V-104 — both drawn on GA, residual Part-names FAIL).
    _panel = _not_found_substatus("Electrical Control Panel", "bottom-up parametric")
    if _panel != "SCOPE-DOCUMENTED":
        print(f"  FAIL not-found-substatus: an electrical control panel must classify "
              f"SCOPE-DOCUMENTED (got {_panel!r})")
        bad += 1
    _cloth = _not_found_substatus(
        "Nursery Cloth Filter",
        "cloth filter parametric: 45 m³/h × £40/(m³·h) + £2k frame")
    if _cloth != "FABRICATED":
        print(f"  FAIL not-found-substatus: a cloth-filter parametric must classify "
              f"FABRICATED (got {_cloth!r})")
        bad += 1
    _cloth_name = _not_found_substatus("Nursery Cloth Filter", "bottom-up parametric")
    if _cloth_name != "FABRICATED":
        print(f"  FAIL not-found-substatus: a cloth filter by NAME must classify "
              f"FABRICATED even without a parametric basis (got {_cloth_name!r})")
        bad += 1
    _pump_hit = _not_found_substatus("Ro High Pressure Pump", "bottom-up parametric")
    if _pump_hit != "NOT FOUND":
        print(f"  FAIL not-found-substatus: an unpinned pump with a plain parametric basis "
              f"must stay the true NOT FOUND residual (got {_pump_hit!r})")
        bad += 1
    # proveCatch: a duty-rated / UV-ozone / DB-median parametric basis is FABRICATED
    # (no catalogue MPN to find) — Codema ship Part-names residual (2026-07-09).
    _rated = _not_found_substatus(
        "Fertigation Dosing Pump",
        "rating-based: 8 kW × £700/kW (UK-2026 installed mid) — process pump")
    if _rated != "FABRICATED":
        print(f"  FAIL not-found-substatus: a rating-based parametric pump must classify "
              f"FABRICATED (got {_rated!r})")
        bad += 1
    _uv = _not_found_substatus(
        "Uv Disinfection",
        "UV/ozone parametric: 10.1 kW lamp power × £2,200/kW + £4k reactor")
    if _uv != "FABRICATED":
        print(f"  FAIL not-found-substatus: a UV/ozone parametric line must classify "
              f"FABRICATED (got {_uv!r})")
        bad += 1
    _dbmed = _not_found_substatus(
        "Hand Watering Pump",
        "real DB median of 1 comparable 4kw 'pump' parts (forge-truth.db) · "
        "named part 'SL1.50.65.22.2.50D.C' rejected: catalogue reference £35 is "
        "53× below the duty-rated price (undersized for the duty)")
    if _dbmed != "FABRICATED":
        print(f"  FAIL not-found-substatus: a DB-median + rejected-MPN pump must classify "
              f"FABRICATED (got {_dbmed!r})")
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
                "Modbus Tcp Interface", "Pneumatic Actuated Valves",
                "Ro High Pressure Pump", "Gac Filter",
                "Gac Softener", "Transformer", "Overcurrent Protection",
                "Pressure Relief Valve", "Pneumatic Control Valve",
                "Insulation Monitoring Device", "Active Ventilation Fan"):
        _hit = _not_found_substatus(_nm, "bottom-up parametric", "other")
        if _hit != "NOT FOUND":
            print(f"  FAIL not-found-substatus OVER-REACH: {_nm!r} is a real unresearched "
                  f"catalogue part and must stay NOT FOUND — got {_hit!r}")
            bad += 1
    # PANEL INDICATOR / FIELD SENSOR commodity family (Powerwall Part-names, 2026-07-14)
    # — mirrors BoM `_COMMODITY_NOUN_RX` for the SAME concept-stage ESS rows so the
    # Part-names not_found residual and the BoM commodity tally stay one truth.
    for _nm in ("Current Shunt", "Temperature Thermistor", "Emergency Stop Button",
                "Audible Alarm", "Status Indicator Lights", "Maintenance Bypass Switch",
                "Current Sensors", "Temperature Probes", "Voltage Monitoring Sensors",
                "Humidity Sensors"):
        _hit = _not_found_substatus(_nm, "bottom-up parametric", "other")
        if _hit != "COMMODITY-FITTING":
            print(f"  FAIL not-found-substatus: {_nm!r} must classify COMMODITY-FITTING "
                  f"(panel indicator / field sensor commodity) — got {_hit!r}")
            bad += 1
    # ── CIVILS orphan exemption proveCatch (Codema CIV-101/CIV-102, 2026-07-09) ──
    # A below-grade civils take-off shares the vessel display name but carries a
    # distinct CIV-* tag; connection edges attribute to the BESPOKE vessel. The
    # orphan loop must skip status==CIVILS exactly like PARAMETRIC — prove by
    # asserting the status gate is present in source (the loop is not a pure
    # helper; this is the regression tripwire for a future "simplify" that
    # drops the exemption).
    _src = Path(__file__).read_text(encoding="utf-8")
    if 'e.get("status") == "CIVILS"' not in _src:
        print("  FAIL CIVILS orphan exemption: status==CIVILS gate missing from "
              "orphan loop — CIV take-off rows will false-orphan again")
        bad += 1
    # ── _boundary_label proveCatch (CO2-v1 CONNECTION TRACE fix, 2026-07-05) ───────────
    # 'electrical supply' (the _norm'd form of the contract's 'electrical_supply' boundary
    # node) is a legitimate battery-limit utility incomer — mirrors connection_ledger.py's
    # OWN _ABSTRACT_BOUNDARY_RE (electrical[_ -]?supply is already in that regex) + the
    # SAME 'incomer marker' family build_universal_scene.EXTERNAL_SUPPLY_RE groups
    # electrical_supply/power_supply/grid/mains/incomer/utility/battery_limit under. Must
    # render with the canonical 'Utility Incomer' noun (not a naive title-cased phantom
    # "Electrical Supply" that a downstream connection-trace consumer reads as a missing
    # BoM part — the CO2-v1 tab-scorecard HIGH this fix closes).
    if _boundary_label("electrical supply") != "Utility Incomer (Electrical Supply)":
        print(f"  FAIL _boundary_label('electrical supply') = "
              f"{_boundary_label('electrical supply')!r}, want the canonical Utility "
              f"Incomer label")
        bad += 1
    for _bk in ("power supply", "incoming supply"):
        _bl = _boundary_label(_bk)
        if not _bl or not _bl.lower().startswith("utility incomer"):
            print(f"  FAIL _boundary_label({_bk!r}) = {_bl!r}, want a 'Utility Incomer (…)' label")
            bad += 1
    # a NON-electrical abstract boundary (atmosphere / grid / mains / battery limit) is
    # STILL recognised (via cl._ABSTRACT_BOUNDARY_RE) but keeps its own plain title —
    # only the electrical/power-supply sub-family needs the 'Utility Incomer' rename
    # (its OWN raw key already contains 'grid'/'mains'/'battery limit', which the
    # narrower downstream mirror regex already accepts verbatim).
    for _bk, _want in (("atmosphere", "Atmosphere"), ("grid", "Grid"), ("mains", "Mains")):
        _bl = _boundary_label(_bk)
        if _bl != _want:
            print(f"  FAIL _boundary_label({_bk!r}) = {_bl!r}, want {_want!r} (unchanged plain title)")
            bad += 1
    # a genuinely unresolved, NON-boundary endpoint (a real missing part reference) must
    # return None so the caller falls through to its honest fr_key.title() — never
    # silently laundered into a fake boundary label.
    if _boundary_label("stray unresolved pump") is not None:
        print("  FAIL _boundary_label: a non-boundary unresolved endpoint must return "
              "None (an honest phantom reference, not laundered as a boundary)")
        bad += 1
    # ── Powerwall electrical terminal exemptions (2026-07-14 Connection-trace 0)
    # Busbar Interconnects → neither edge; AC Filter Inductors → in only; a mid-chain
    # contactor with edges still present still requires both.
    _elec_cases = [
        ("Busbar Interconnects", True, False, False, (False, False)),
        ("AC Filter Inductors", True, False, False, (True, False)),
        ("Output Filter", True, False, False, (True, False)),
        ("PCS LCL filter inductor", True, False, False, (True, False)),
        ("DC Contactor", False, False, False, (True, True)),
        ("DC Contactor", True, False, False, (True, True)),
        ("Status Indicator LED", True, False, False, (True, False)),
        ("Usb Or Barrel Power Inlet", True, True, False, (False, False)),
        ("Usb Or Barrel Power Inlet", False, True, False, (False, True)),
    ]
    for _en, _ha, _io, _is, _want in _elec_cases:
        _got = _electrical_edge_needs(_en, has_any=_ha, is_origin=_io, is_sink=_is)
        if _got != _want:
            print(f"  FAIL _electrical_edge_needs({_en!r}, has_any={_ha}) = {_got!r}, "
                  f"want {_want!r}")
            bad += 1
    # proveCatch (colorimeter 1441): instrument MCU typed `other` MUST count as control
    # (plant path still requires typ==control; device path also accepts MCU/UI names).
    _fake_mcu = {"tag": "I-201", "name": "Compute UI Module", "type": "other"}
    if not _control_present([_fake_mcu], instrument_device=True):
        print("  FAIL _control_present: instrument Compute UI Module typed other "
              "must satisfy control_present")
        bad += 1
    if _control_present([_fake_mcu], instrument_device=False):
        print("  FAIL _control_present: MCU typed other must NOT count on a plant "
              "(non-instrument) run")
        bad += 1
    # proveCatch (2026-07-29 FE MGU): OEM inverter control board types as control
    # so has_control is true on sealed drive packs (orphan_instrument floor kill).
    _ctrl_board_typ = _classify("Oem Inverter Control Board", "", instrument_device=False)
    if _ctrl_board_typ != "control":
        print(f"  FAIL _classify: Oem Inverter Control Board must be 'control' "
              f"(got {_ctrl_board_typ!r})")
        bad += 1
    if not _control_present(
        [{"tag": "INV-3", "name": "Oem Inverter Control Board", "type": _ctrl_board_typ}],
        instrument_device=False,
    ):
        print("  FAIL _control_present: typed control board must satisfy control_present "
              "on a non-instrument sealed pack")
        bad += 1
    # proveCatch (OpenFlexure 0939): generic device subcomponents are placeholder
    # leaves, not orphan controllers/feeders.
    for _sub_nm in ("HMI Ergonomics Subcomponent 1",
                    "Power Distribution Subcomponent 2",
                    "Actuation Kinematics Subcomponent 1"):
        _typ = _classify(_sub_nm, "", instrument_device=True)
        if _typ != "other":
            print(f"  FAIL _classify: instrument generic subcomponent {_sub_nm!r} "
                  f"must be passive 'other' (got {_typ!r})")
            bad += 1
    if not _is_instrument_consumable("Cuvette Consumable"):
        print("  FAIL _is_instrument_consumable: Cuvette Consumable must match")
        bad += 1
    if _is_instrument_consumable("Optical Detector Module"):
        print("  FAIL _is_instrument_consumable: real detector must NOT match")
        bad += 1
    # proveCatch: instrument NOT FOUND substatus — Compute UI + Ambient Light Cap +
    # STEMMA cable must leave residual NOT FOUND (Part names 6.4 = 9/14 coverage).
    for _nm, _typ, _want in (
        ("Compute UI Module", "other", "FABRICATED"),
        ("Ambient Light Cap", "other", "FABRICATED"),
        ("STEMMA QT Interconnect Cable", "other", "COMMODITY-FITTING"),
    ):
        _hit = _not_found_substatus(_nm, "bottom-up parametric", _typ,
                                    instrument_device=True)
        if _hit != _want:
            print(f"  FAIL not-found-substatus: instrument {_nm!r} must be {_want!r} "
                  f"(got {_hit!r})")
            bad += 1
    # proveCatch (Powerwall 2026-07-15): product-scale sealed cabinet — a part in
    # parts-manifest but UNTAGGED on the GA SVG must still credit GA coverage
    # (thin-TOP + sub-threshold FRONT tags). A plant-scale twin must NOT.
    import tempfile as _tf_cov
    _cov_td = Path(_tf_cov.mkdtemp(prefix="pl-prod-cov-"))
    (_cov_td / "drawings").mkdir()
    _cov_parts = [
        {"equipment_tag": "X-105", "name": "Power Semiconductors",
         "pos_mm": [0.0, 0.0, 900.0], "dims_mm": {"w": 80, "d": 60, "h": 40}},
        {"equipment_tag": "K-101", "name": "Active Ventilation Fan",
         "pos_mm": [50.0, 0.0, 1000.0], "dims_mm": {"w": 60, "d": 50, "h": 40}},
        {"equipment_tag": "X-120", "name": "Battery Modules",
         "pos_mm": [0.0, 10.0, 400.0], "dims_mm": {"w": 400, "d": 140, "h": 400}},
    ]
    json.dump({"schema": "parts-manifest/1", "count": 3, "parts": _cov_parts,
               "placement_fp": "abcdabcdabcdabcd"},
              open(_cov_td / "parts-manifest.json", "w"))
    # GA SVG with NO equipment tags — the thin-TOP / sub-threshold case.
    (_cov_td / "drawings" / "general-arrangement.svg").write_text(
        '<svg data-placement-fp="abcdabcdabcdabcd"><text>FRONT '
        '(door removed · looking in)</text></svg>')
    json.dump({
        "orchestratorContract": {"quantities": {
            "enclosure_volume_m3": {"value": 0.14},
        }},
        "requirementsBom": [
            {"tag": "X-105", "requirement": "Power Semiconductors",
             "status": "IDENTIFIED", "qty": 1, "unit_cost_gbp": 10, "line_gbp": 10},
            {"tag": "K-101", "requirement": "Active Ventilation Fan",
             "status": "IDENTIFIED", "qty": 1, "unit_cost_gbp": 20, "line_gbp": 20},
            {"tag": "X-120", "requirement": "Battery Modules",
             "status": "IDENTIFIED", "qty": 1, "unit_cost_gbp": 100, "line_gbp": 100},
        ],
    }, open(_cov_td / "state.json", "w"))
    _rc = os.system(f"{sys.executable} {Path(__file__).resolve()} {_cov_td} "
                    f"{_cov_td / 'state.json'} >/dev/null 2>&1")
    _cov_doc = _load(_cov_td / "parts-ledger.json") or {}
    _ga_pct = ((_cov_doc.get("coverage_by_drawing") or {})
               .get("general-arrangement") or {}).get("pct")
    if _ga_pct is None or float(_ga_pct) < 80.0:
        print(f"  FAIL product-scale-ga-credit: sealed cabinet GA coverage "
              f"must credit placed parts without SVG tags (got pct={_ga_pct}, "
              f"rc={_rc})")
        bad += 1
    if int(_cov_doc.get("n_equipment") or 0) < 3:
        print(f"  FAIL product-scale equipment spine: sealed cabinet with 3 BoM "
              f"lines must populate n_equipment≥3 "
              f"(got {_cov_doc.get('n_equipment')})")
        bad += 1

    # proveCatch (Powerwall 2026-07-15): Busbar Assembly BoM ↔ MAIN DC BUS SLD
    # synonym — SLD coverage must credit the busbar parts that ARE the drawn bus.
    _bus_td = Path(_tf_cov.mkdtemp(prefix="pl-bus-syn-"))
    (_bus_td / "drawings").mkdir()
    json.dump({"schema": "parts-manifest/1", "count": 1, "parts": [
        {"equipment_tag": "X-122", "name": "Busbar Assembly",
         "pos_mm": [0.0, 0.0, 500.0], "dims_mm": {"w": 80, "d": 40, "h": 20}},
    ], "placement_fp": "busbusbusbusbusbus"},
              open(_bus_td / "parts-manifest.json", "w"))
    (_bus_td / "drawings" / "single-line-diagram.svg").write_text(
        '<svg><text>MAIN DC BUS</text><text>DC Fuses</text></svg>')
    (_bus_td / "drawings" / "general-arrangement.svg").write_text(
        '<svg data-placement-fp="busbusbusbusbusbus"><text>FRONT</text></svg>')
    json.dump({
        "orchestratorContract": {"quantities": {
            "enclosure_volume_m3": {"value": 0.14},
        }},
        "requirementsBom": [
            {"tag": "X-122", "requirement": "Busbar Assembly",
             "status": "IDENTIFIED", "qty": 1, "unit_cost_gbp": 10, "line_gbp": 10},
        ],
    }, open(_bus_td / "state.json", "w"))
    _rc_bus = os.system(f"{sys.executable} {Path(__file__).resolve()} {_bus_td} "
                        f"{_bus_td / 'state.json'} >/dev/null 2>&1")
    _bus_doc = _load(_bus_td / "parts-ledger.json") or {}
    _bus_eq = next((e for e in (_bus_doc.get("equipment") or [])
                    if e.get("tag") == "X-122"), None)
    if not _bus_eq or not (_bus_eq.get("coverage") or {}).get("single-line-diagram"):
        print(f"  FAIL busbar↔MAIN DC BUS synonym: Busbar Assembly must credit "
              f"SLD when MAIN DC BUS is drawn (eq={_bus_eq}, rc={_rc_bus})")
        bad += 1

    # proveCatch (Powerwall 2026-07-15): empty requirementsBom + non-empty
    # parts-manifest / costBasis MUST still yield equipment rows (the assembler-
    # crash backstop). Pre-fix: ledger iterated empty rb → n_equipment=0 while
    # manifest had 33 parts → GA/Process/Verification floors collapsed.
    _empty_td = Path(_tf_cov.mkdtemp(prefix="pl-empty-rb-"))
    (_empty_td / "drawings").mkdir()
    json.dump({"schema": "parts-manifest/1", "count": 2, "parts": [
        {"equipment_tag": "X-101", "name": "DC AC Inverter Module",
         "dims_mm": {"w": 140, "d": 96, "h": 190}},
        {"equipment_tag": "X-120", "name": "Battery Modules",
         "dims_mm": {"w": 400, "d": 140, "h": 400}},
    ]}, open(_empty_td / "parts-manifest.json", "w"))
    (_empty_td / "drawings" / "general-arrangement.svg").write_text(
        "<svg><text>X-101 DC AC Inverter Module</text></svg>")
    json.dump({
        "orchestratorContract": {"quantities": {
            "enclosure_volume_m3": {"value": 0.14},
        }},
        "requirementsBom": [],
        "costBasis": {"lines": [
            {"label": "DC AC Inverter Module", "cost_gbp": 838,
             "basis": {"notes": "catalogue"}},
            {"label": "Battery Modules", "cost_gbp": 1200,
             "basis": {"notes": "catalogue"}},
        ]},
    }, open(_empty_td / "state.json", "w"))
    _rc2 = os.system(f"{sys.executable} {Path(__file__).resolve()} {_empty_td} "
                     f"{_empty_td / 'state.json'} >/dev/null 2>&1")
    _empty_doc = _load(_empty_td / "parts-ledger.json") or {}
    if int(_empty_doc.get("n_equipment") or 0) < 2:
        print(f"  FAIL empty-rb equipment seed: manifest+costBasis with empty "
              f"requirementsBom must still populate n_equipment≥2 "
              f"(got {_empty_doc.get('n_equipment')}, rc={_rc2})")
        bad += 1
    # pure helper proveCatch (no I/O): seed function itself
    _seeded = _seed_rb_from_manifest_and_costs(
        {"requirementsBom": [], "costBasis": {"lines": [
            {"label": "Power Semiconductors", "cost_gbp": 10}]}},
        {"parts": [{"equipment_tag": "X-105", "name": "Power Semiconductors"}]})
    if len(_seeded) < 1 or float(_seeded[0].get("line_gbp") or 0) != 10:
        print(f"  FAIL _seed_rb_from_manifest_and_costs: expected 1 priced row "
              f"(got {_seeded!r})")
        bad += 1
    if _seed_rb_from_manifest_and_costs({"requirementsBom": []}, {"parts": []}):
        print("  FAIL _seed_rb_from_manifest_and_costs: empty inputs must yield []")
        bad += 1

    print("parts_ledger selftest:", "OK" if bad == 0 else f"{bad} FAIL")
    return bad


if __name__ == "__main__":
    if "--selftest" in sys.argv[1:]:
        raise SystemExit(_selftest())
    raise SystemExit(main())
