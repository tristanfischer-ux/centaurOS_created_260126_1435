"""GA non-massing classifier — the single source of truth for which parts are
PRINCIPAL 3D equipment (placed in the General Arrangement + the render that
mirrors it) versus P&ID-level detail that must NOT be rendered as a 3D box.

WHY THIS EXISTS (Tristan 2026-06-27, the render/GA ≥8 work): a General
Arrangement shows the MAJOR equipment — vessels, tanks, skids, pumps, filters,
blowers, exchangers, cabinets. Valves + field instruments are P&ID TAGS, and
glands / unions / terminal-blocks / panel-cards are accessories that live ON or
INSIDE a parent item. The geometry generator has no real dimensions for these
small parts, so they ALL fall to one shared type-default box — and ≥5 distinct
names sharing one box is the `manifest_sight` LITTER signal that (correctly)
scores every render/GA sheet 0. On the Codema water plant this was 25 instruments
sharing 130×100×120 + 18 fittings sharing 1000×1010×1100 + 12 control cards
sharing 242×470×120. Excluding them from the 3D scene removes the litter AND the
"unconnected inline valve" connection-trace concerns (a valve belongs on the
P&ID, not as a floating scene node). The parts REMAIN in the BoM + the ledger.

UNIVERSAL: keyed purely on accessory / instrument / valve vocabulary — no
per-class table. A principal vessel / tank / skid / pump / filter / blower /
cabinet / reactor / column / exchanger matches NONE of it (verified: RAS
tanks/filters/blowers, BESS racks/PCS/transformer all survive). This is the same
"drop BoM-only detail from the GA" principle as the existing fastener /
sub-component drops in extract_parts — extended to the accessory + instrument +
inline-valve families that drive the default-box litter.
"""
import re

# The canonical pattern. extract_parts() in build_universal_scene.py calls
# is_ga_non_massing(name); the litter detector (manifest_sight) is the standing
# OUTPUT guard that re-flags any regression, and _selftest() below is the
# proveCatch (verify-engine-guards.sh).
GA_NON_MASSING_RE = re.compile(
    # pipe / mechanical fittings + connectors + supports (accessories)
    r"\b(?:union|glands?|couplings?|adapters?|adaptors?|ferrules?|olives?|"
    r"nipples?|connectors?|flexmount|spacers?|baffles?)\b|"
    # closure / joint fittings on a pipe run (Codema litter clusters 2026-07-03: a
    # FLANGE and its GASKET are the bolted joint hardware on a pipe stub — same
    # "small parts that live ON a run, never their own GA box" family as the
    # union/gland/coupling line above; an END CAP is the closure fitting on the
    # end of a manifold/spool. 'blanking plate/cap' is the synonym for the same
    # closure part on a larger-bore line.
    r"\bflanges?\b|\bgaskets?\b|\bend caps?\b|\bblanking (?:plates?|caps?)\b|"
    # FASTENERS — bolts/nuts/washers/screws/studs/rivets are never their own GA
    # box (mirrors the Excel commodity-noun family in build-excel-export.py's
    # _COMMODITY_NOUN_RX, applied here to the 3D-massing decision). 'anchor bolt'
    # is the compound skid-fixing fastener; bare 'anchor' is DELIBERATELY excluded
    # from this line so a real 'Anchor Tank' / 'Anchor Handling Winch' is never
    # caught by the fastener family (proveCatch counter-case in _selftest).
    r"\banchor\s+bolts?\b|\b(?:bolts?|nuts?|washers?|screws?|studs?|rivets?)\b|"
    r"\blev(?:el)?ling feet\b|\bleveling feet\b|\bdistribution plate(?:s)?\b|"
    r"\bcip (?:system )?connection(?:s)?\b|\bquick coupling\b|"
    r"\bsupport (?:system|frame|structure|stand)\b|"
    # a SKID / BASE / EQUIPMENT FRAME is the structural steel base of a process skid —
    # the SKID itself (RO/UF/dosing skid) is the massed GA object; its bare frame is not
    # drawn separately. Three material-named "Skid Frame" rows (carbon steel/steel/SST304)
    # shared the skid_box default and littered. "Reverse Osmosis Skid" has no "frame" → kept.
    r"\b(?:skid|base|equipment|mounting|baseplate|sub|structural) frame\b|\bframe assembly\b|"
    r"\bpneumatic actuator(?:s)?\b|\belectric actuator(?:s)?\b|"
    # a bare PIPE RUN / spool ("DN110 PVC Pipe", "DN50 PVC Pipe", "HDPE Pipework") is
    # routed pipework on the P&ID / connection ledger, NOT a massed equipment box — it
    # fell to the default box (LITTER). "pipe" is anchored TERMINAL (the head noun is
    # pipe), with a DN/material context, so a STRUCTURE ("DN150 Pipe Rack/Bridge") or a
    # small vessel ("Pipe Manifold/Header") — where pipe is NOT the head — is NOT dropped.
    r"(?:\bdn\s?\d{2,4}\b|\b(?:pvc|upvc|cpvc|hdpe|abs|grp|frp|stainless|carbon[- ]?steel|"
    r"mild[- ]?steel|galvanis\w+|copper)\b)[^.]*\bpipe(?:s|work)?\s*\d*\s*$|"
    r"\bpipework\s*\d*\s*$|\bpipe spools?\s*\d*\s*$|\bprocess tubing\s*\d*\s*$|"
    # a bare RING MAIN ("Hand watering — ring main to both departments") is the SAME routed
    # distribution-network take-off as the 'Zoned distribution … mains/risers/…' family two
    # rules below — a closed-loop distribution pipe run priced by the metre, not a discrete
    # massed object — but it carries no zoned/distribution/delivery/drain/return anchor word AND
    # is followed by a qualifying phrase ("… to both departments") rather than a hard terminator,
    # so neither the head-anchored network rule below nor a terminal-anchor reached it (the
    # X-146/X-152 inconsistency, 2026-07-04: X-146 'Zoned distribution — department delivery
    # mains' dropped correctly, X-152 'Hand watering — ring main to both departments' did not,
    # even though parts_ledger.py marks both status=PARAMETRIC — the SAME take-off row shape).
    # Self-sufficient (no anchor word required, like the bare pipework/pipe-spool rule above) but
    # NEGATIVE-LOOKAHEAD anchored instead of terminal — excludes 'ring main UNIT' (a real
    # electrical switchgear cabinet, RMU, which must stay massed; proveCatch counter-case in
    # _selftest).
    r"\bring mains?\b(?!\s+units?\b)|"
    # routed DISTRIBUTION-NETWORK take-off quantities (v58b GA coverage: the 8
    # 'Zoned distribution — …' rows X-150..X-157, qty 214-8,280 = metres of delivery/
    # drain mains, risers, zone laterals, collection lines, per-position inlet stubs /
    # outlet connections + valve kits) are PIPEWORK LINE ITEMS, never massed GA boxes —
    # exactly the bare-pipe-run principle above, extended to the network nouns. HEAD-
    # anchored: a distribution-context word (zoned/distribution/delivery/drain/return)
    # followed by a network head noun (mains/risers/laterals/headers/lines/stubs/
    # connections/kits) that ENDS the name (or is followed only by a count/parenthetical
    # tail) — so 'Distribution Transformer', 'Main Switchboard', 'Drain Transfer Pump',
    # 'Drain Collection Sump' and 'Distribution Manifold' (head noun ≠ network noun)
    # all stay massed. proveCatch in _selftest.
    r"\b(?:zoned?|distribution|delivery|drain|return)\b[^.]*?"
    r"\b(?:mains?|risers?|laterals?|headers?|lines?|stubs?|connections?|kits?)\s*(?:\(|,|·|\d|$)|"
    # cabling / wiring / distribution accessories
    r"\bcabling\b|\bcable tray(?:s)?\b|\bcable gland(?:s)?\b|"
    r"\bterminal block(?:s)?\b|\b(?:power )?distribution block(?:s)?\b|"
    r"\bpower supply unit\b|\bdin rail\b|\bwireway\b|"
    # membrane-skid INTERNALS -> represented by the membrane/RO/UF SKID on the GA, never massed
    # individually (you do not draw spiral-wound elements / FRP pressure tubes / the media bank on a
    # plant General Arrangement — the skid package is the massed object). element/media/housing/
    # cartridge/module/bank are the internals; a 'membrane skid/unit/package' stays massed.
    r"\bmembrane (?:element(?:s)?|media|cartridge(?:s)?|module(?:s)?|housings?|bank)\b|"
    r"\b(?:ro|uf|nf|mf) membrane(?:s)?\b|\bmembrane stack(?:s)?\b|"
    # field instruments -> P&ID tags (2026-07-06: PLURAL-BOUNDARY FIX — every noun
    # here previously had NO `(?:s)?`, so a plural name ("CO2 asphyxiation
    # DETECTORS", "radar level TRANSMITTERS", "pH/conductivity ANALYSERS") broke the
    # trailing \b — a word boundary requires a NON-word char immediately after the
    # match, but the plural 's' sits right there with no boundary, so \btransmitter\b
    # never fires inside "transmitters". The CO2-mineralisation instrument-index
    # litter (8 parts sharing one 600×600×600 default box: detectors, isolation
    # barriers, transmitters, relays, analysers all slipped through singular-only
    # patterns) is this exact bug family across every instrument noun at once — a
    # SOURCE-rule fix (not a per-name patch), universal across every archetype that
    # authors its instrument index in the plural.
    r"\btransmitters?\b|\btransducer(?:s)?\b|\bsensors?\b|\banaly[sz]ers?\b|"
    r"\bflow ?meter(?:s)?\b|\bgauges?\b|\bprobes?\b|\bdetectors?\b|\bindicators?\b|"
    # switchgear / protection / control-panel internals -> inside the cabinet
    r"\bcircuit breaker(?:s)?\b|\bmotor starter(?:s)?\b|\bvfds?\b|"
    r"\bcontactor(?:s)?\b|\bemergency stop\b|\bplc\b|\bhmi\b|"
    r"\bcontroller(?:s)?\b|\binterface\b|\bethernet\b|\bmodbus\b|"
    r"\bprofibus\b|\bgateway\b|\b(?:remote )?monitoring\b|"
    r"\b(?:overload|overcurrent|surge|short[- ]?circuit|earth[- ]?fault|"
    r"thermal|fault) protection\b|"
    r"\b(?:low|high|pressure|level|float|limit|flow|proximity|"
    r"temperature) switch(?:es)?\b|"
    # more panel/instrument-index internals (2026-07-06, CO2-mineralisation family-6
    # denominator-honesty pass): a bare protection RELAY (motor-protection relay,
    # safety relay) is the same panel-internal-device family as the circuit-breaker/
    # motor-starter/contactor line above; an ISOLATION BARRIER is a DIN-rail-mounted
    # SIL/Zener barrier (panel internals, not a floor-standing enclosure of its own —
    # distinct from the module-authority INSTRUMENT-SHAPE rule that already forces
    # these small devices off the vessel-shape path); a VARIABLE-SPEED DRIVE (VSD) is
    # the same drive-cabinet-internals concept as the existing bare \bvfd\b; a SOFT
    # STARTER and a FIELDBUS MODULE are likewise panel/motor-control-centre internals;
    # an EMERGENCY SHUTDOWN SYSTEM is SIS/ESD control LOGIC (a P&ID/cause-and-effect
    # concept), not a discrete 3D object; a SAFETY SHOWER + EYEWASH is a P&ID safety-
    # utility symbol. Universal — keyed on the device/utility noun, no per-class table.
    r"\brelays?\b|\bisolation barriers?\b|\bvariable[- ]speed drives?\b|\bvsds?\b|"
    r"\bsoft starters?\b|\bfieldbus modules?\b|"
    r"\bemergency shutdown system\b|\bsafety shower\b|\beyewash(?:es)?\b|"
    # pipework-attached fittings that live ON/IN a parent (Codema litter clusters
    # 2026-07-02): a CIP SPRAY BALL sits INSIDE the tank; a SAMPLING POINT is a
    # port+valve (P&ID tag, same object as the 'Sample Valve' already dropped); a
    # HOSE ASSEMBLY is routed flexible pipework, never a massed crate.
    # NOTE deliberately NOT dropped: manifolds/headers (massed as inline_spool —
    # the 2026-06-27 must_keep decision); "Manifold Support Bracket"; and bare
    # terminal "<stream> Inlet/Outlet" stubs — a first attempt dropped those and
    # the router LOST the real 'Permeate Outlet → Cloth Filter' process edge +
    # re-homed 6 fluid_loop rows (connection endpoints beat GA tidiness; a
    # name-only classifier cannot know which stubs the topology references).
    r"\bspray balls?\b|\bsampl(?:e|ing) points?\b|"
    r"\b(?:hose|flexible hose) assembl(?:y|ies)\b|\bflexible hoses?\b|"
    # a BARE "<service/DN context> Hose" (e.g. 'CIP Hose', 'DN50 Hose') is routed
    # flexible pipework — the same 'hose assembly' principle, extended to the
    # bare noun. TERMINAL-anchored (head noun = hose, optional trailing index) so
    # a real packaged item whose head noun is something else — 'Hose Station'
    # (a mounted reel/cabinet), 'Hose Reel Cabinet' — is NOT dropped (proveCatch
    # counter-case in _selftest).
    r"\bhoses?\s*\d*\s*$|"
    # inline valves -> P&ID symbols (specific types, never a 'valve skid')
    r"\b(?:isolation|sample|ball|check|relief|gate|globe|butterfly|"
    r"control|solenoid|needle|diaphragm|non-return|nrv|pressure relief|"
    r"pressure reducing|safety|actuated|automated|pneumatic|electric|"
    r"motoris(?:ed|er)|motoriz(?:ed|er)|modulating) valve(?:s)?\b|"
    # a DESIGN-METADATA head noun is never a physical part (v55 name-collision:
    # 'Modular Stack Design' matched the \bstack\b shape rule and rendered a 9.6 m
    # CHIMNEY — the tallest object on a water plant — with its own S-101 tag chip).
    # The HEAD noun (terminal, optional trailing index) is the identity: a name
    # ending in design/concept/philosophy/strategy/approach/methodology/scheme/
    # basis is documentation, not equipment. A real 'Vent Stack' / 'Membrane
    # Stack' / 'Design Pressure Vessel' has a different head noun and is kept.
    r"\b(?:design|concept|philosophy|strategy|approach|methodology|scheme|basis)"
    r"s?\s*\d*\s*$|"
    # ── BESS commodity/wiring/grounding/cell-packaging INTERNALS (2026-07-05, BESS
    # v3 3D-coverage denominator-honesty pass) — small bonding/ground hardware and
    # cell/module/PCS-cabinet packaging internals that live INSIDE an already-massed
    # rack/cabinet, never their own GA box (same "internals represented by the
    # parent package" principle as the membrane-skid-internals rule above, extended
    # to a battery rack + its grounding network + a PCS cabinet's internal
    # electronics). A pump/fan/tank/AC-unit/filter (real small massable principals)
    # matches NONE of this — proveCatch counter-cases in _selftest.
    r"\bground(?:ing)?\s*braids?\b|\bearth\s*bars?\b|\bearth\s*rods?\b|"
    r"\bequipotential\s*bonding\s*cables?\b|\bbonding\s*cables?\b|\bgrounding\s*lug(?:s)?\b|"
    r"\bneutral\s*grounding\b|"
    r"\bpadlocks?\b|\bmount\s*rails?\b|\bfuse\s*(?:holders?|mounts?)\b|"
    r"\bcable\s*sealing\s*ends?\b|\bsealing\s*ends?\b|"
    r"\bcell\s*terminal\s*hardware\b|\bthermistor\s*attachments?\b|"
    r"\bcell\s*(?:voltage\s*)?tap\s*wires?\b|\bcell\s*insulation\s*pads?\b|"
    r"\bmodule\s*steel\s*frames?\b|\bmodule\s*top\s*covers?\b|\bmodule\s*bottom\s*trays?\b|"
    r"\bcompression\s*plates?\b|\bcompression\s*tie\s*rod\s*sets?\b|"
    r"\bdc-?link\s*capacitor\s*banks?\b|\bcooling\s*fan\s*trays?\b|"
    r"\bdigital\s*isolators?\b|\bcan\s*transceivers?\b|\bpre-?charge\s*resistors?\b|"
    r"\bfib(?:re|er)\s*patch\s*panels?\b|"
    r"\bheater\s*cables?\b|\bdetection\s*harness(?:es)?\b|\bwiring\s*harness(?:es)?\b|"
    r"\bduct\s*penetration\s*seals?\b|\bsuppression\s*nozzles?\b|"
    r"\biso\s*corner\s*castings?\b|\b(?:structural\s*)?floor\s*reinforcements?\b|"
    r"\bdoor\s*assembly\b|\bsmoke\s*vent\s*interlock\s*mounts?\b|"
    r"\biso\s*container\s*(?:20|40)\s*(?:hc|gp|ft)?\b|"
    # ── FLUID/GAS CHARGE, inline pipe-mounted accessories, bare service pipes, and
    # a thermostat (2026-07-05, BESS v3 LAP-3 3D/GA-coverage denominator-honesty
    # pass) — closing the SAME "not a discrete massed object" gap the families
    # above already cover, extended to four more shapes found in the 314 Ah
    # recalibration's coolant-loop + rack-heater lines:
    #  - a CHARGE is a consumable fluid/gas FILL QUANTITY (a costed BoM line for
    #    accounting), not a physical part — it has no footprint of its own; it
    #    lives dissolved inside the pipe/heat-exchanger it charges.
    r"\b(?:coolant|refrigerant|glycol|nitrogen|gas)\s+charge\b|"
    #  - a SIGHT GLASS is an inline visual level/flow indicator bolted to a pipe —
    #    the same "accessory that lives ON a parent connection" family as the
    #    flange/gasket/end-cap fittings above. A bundled relief+glass compound
    #    ("pressure relief and sight glass") is caught via its sight-glass half.
    r"\bsight\s*glass(?:es)?\b|"
    #  - a bare "<service> SUPPLY/RETURN/FEED/DISCHARGE/DELIVERY pipe" is routed
    #    pipework, the same principle as the DN/material-anchored bare-pipe rule
    #    above, extended to a service-direction-anchored bare pipe with no DN/
    #    material qualifier ("coolant supply pipe", "coolant return pipe").
    #    TERMINAL-anchored so a real vessel/structure whose head noun differs
    #    ("Pipe Bridge Support") is untouched.
    r"\b(?:supply|return|feed|discharge|delivery)\s+pipe(?:s|work)?\s*\d*\s*$|"
    #  - a THERMOSTAT is a small temperature-actuated control switch — the same
    #    P&ID-level instrument family as the existing 'temperature switch' rule
    #    (a thermostat IS a temperature switch by function), mounted on/in its
    #    parent heater/vessel, never its own GA box.
    r"\bthermostats?\b|"
    # ── CO2-mineralisation residual LITTER (2026-07-06, GA/Renders round-2
    # denominator-honesty pass): 6 of the 10 names sharing the {1000,1060,1100}
    # default box are commodity/structural fittings that live ON or INSIDE a
    # parent item — the SAME "not a discrete massed object" principle as the
    # families above, extended to this archetype's vocabulary. The other 4
    # (centrifuge, bag sealer, conveyor, pallet wrapper) are GENUINE standalone
    # process/packaging MACHINES and are deliberately NOT added here — they stay
    # massed and get real per-basis dims from build_universal_scene.py's SHAPE_RULES
    # instead (the fix is to SIZE them honestly, not to hide them).
    #  - a MECHANICAL SEAL is the shaft seal cartridge on a pump/agitator — an
    #    internal wear part bolted into its parent's stuffing box, never its own
    #    GA box (same "internals live inside the parent" family as the membrane-
    #    skid-internals rule above). TIGHT on the full compound so a real seal-LESS
    #    pump or an unrelated "…seal…" name is untouched (proveCatch counter-case).
    r"\bmechanical seals?\b|"
    #  - CABLE TRANSIT FRAMES (e.g. a Roxtec modular multi-cable transit) are the
    #    wall/floor cable-penetration seal hardware — an accessory that lives IN a
    #    wall/floor penetration, the same family as the existing cable-gland/cable-
    #    tray accessories above, extended to the transit-frame compound.
    r"\bcable transits?\b|\bcable transit frames?\b|"
    #  - an ACCESS PLATFORM (+ its ladders/handrails) is the SAME walkway/egress
    #    structural steel the generator already draws PROGRAMMATICALLY on tall
    #    vessels (_add_platforms_and_ladder in build_universal_scene.py) — a BoM
    #    line describing the same structure for a shorter vessel is documentation
    #    of that structural steel, not its own free-standing GA box. HEAD-anchored
    #    on 'access platform' (not bare 'platform') so a genuinely different
    #    principal ("Weighing Platform", "Loading Platform") is untouched.
    r"\baccess platforms?\b|"
    #  - STRUCTURED / RANDOM PACKING (e.g. Mellapak) is the internal mass-transfer
    #    media inside a packed column — the same "internals represented by the
    #    parent vessel" principle as the membrane-element/media rule above. Keyed
    #    on the packing-media compound so a real packaging-LINE machine ("Case
    #    Packing Machine", "Packing Station") is untouched (proveCatch counter-case).
    r"\b(?:structured|random) packings?\b|\bpacking (?:bed|media|rings?)\b|"
    #  - a SPARGER (RING) is a perforated gas-distribution fitting mounted under an
    #    agitator/impeller inside a vessel — an internal fitting, not its own box.
    r"\bspargers?\b|\bsparger rings?\b|"
    #  - a (SEALER JAW) HEATING ELEMENT is a replaceable resistive component inside
    #    a parent machine (a bag/band sealer's jaw) — the same panel/cell-packaging
    #    INTERNALS family as the BESS module-internals rules above. Keyed on the
    #    full compound so a real standalone heater unit ('Immersion Heater',
    #    'Crystalliser Circulation Heater') is untouched.
    r"\bheating elements?\b",
    re.I)

# Pure DOCUMENTATION / signage / compliance-record rows (2026-07-05, BESS v3 dissection):
# a label, a hazard/warning/compliance placard, barrier tape, a certification record, or
# a quality/torque card is not a physical part at all — it has NO engineering-drawing
# home (not GA, not P&ID, not a single-line symbol, not even a panel-schedule row).
# TERMINAL-anchored on the bare 'label' head noun (a compound like 'high voltage safety
# label' or 'IEC 62619 compliance label' still ends in 'label') plus a few named
# document/record compounds. Distinct from GA_NON_MASSING_RE: those are still REAL
# physical/functional parts (just not separately massed); these are paperwork.
GA_PURE_DOCUMENTATION_RE = re.compile(
    r"\blabels?\s*\d*\s*$|\blabel\s*mounts?\b|"
    r"\bbarrier\s*tapes?\b|\bcertification\s*records?\b|\btorque\s*cards?\b|"
    r"\bquality\s*records?\b|"
    # Powerwall X-142 (2026-07-14): 'Safety Warning Signage' / 'Warning Sign' is the
    # same paperwork class as a compliance label — expected on NO engineering drawing
    # (the enclosure already carries the decal in the massing). `\blabel\b` alone
    # missed the 'signage' head noun.
    r"\bsignage\b|\bwarning\s+signs?\b|\bsafety\s+warning\b",
    re.I)


def is_ga_non_massing(name):
    """True if `name` is P&ID-level detail (accessory / instrument / inline
    valve / panel-internal) that must NOT be placed as a 3D GA equipment box."""
    return bool(GA_NON_MASSING_RE.search(name or ""))


def is_pure_documentation(name):
    """True if `name` is a document/label/record/compliance-placard with NO physical
    engineering-drawing home at all (not equipment, not a routed connection) —
    expected on NO representation whatsoever (mirrors a PARAMETRIC allowance row)."""
    return bool(GA_PURE_DOCUMENTATION_RE.search(name or ""))


def _selftest():
    # proveCatch: every one of these drove the Codema default-box LITTER
    # (instruments, fittings, panel cards, inline valves) — each MUST be dropped.
    must_drop = [
        "Sample Valve 2", "Isolation Valves", "Manual Ball Valve", "Check Valves",
        "Pneumatic Actuated Valve", "Pressure Relief Valve", "Solenoid Valves",
        "Cable Glands", "Union Fitting 3", "3 Part Union Fittings", "Flexmount Connectors",
        "Hydraulic Connectors", "Leveling Feet", "Module Support System",
        "Terminal Blocks", "Power Distribution Block", "DC Power Cabling", "Cable Trays",
        "Level Transmitter", "Pressure Transducer", "Conductivity Sensor",
        "Silica Analyzer", "Flow Meter", "Flow Meters",
        "Circuit Breakers", "Motor Starter", "Vfd Drive", "Emergency Stop Button",
        "PLC Controller", "HMI Touchscreen", "Modbus Interface", "Ethernet Ip Module",
        "Veolia Ro40 Controller", "Aquavista Remote Monitoring",
        "Low Pressure Switch", "High Pressure Switch", "Overcurrent Protection",
        "Surge Protection Device", "Compartment Spacers", "Flow Distribution Plates",
        # bare pipe RUNS — routed pipework, never a massed box (the v33 litter pair)
        "DN110 PVC Pipe", "DN50 PVC Pipe", "DN200 Stainless Pipe", "HDPE Pipework",
        "Pipe Spool 4", "DN80 PVC Pipe 2",
        # bare structural skid FRAMES — the skid they support is the massed object
        "Painted Carbon Steel Skid Frame", "Painted Steel Skid Frame", "Sst304 Skid Frame",
        "Equipment Frame", "Base Frame Assembly",
        # pipework-attached fittings (Codema litter clusters 2026-07-02: 5 names
        # sharing 1000×1010×1100)
        "CIP Spray Ball", "Permeate Sampling Point", "Sample Point 2",
        "CIP Hose Assembly", "Flexible Hose",
        # DESIGN-METADATA head nouns — never physical parts (v55: 'Modular Stack
        # Design' rendered as a 9.6 m chimney, the tallest object on a water plant)
        "Modular Stack Design", "Redundancy Concept", "Control Philosophy",
        "Maintenance Strategy", "Sizing Basis", "Expansion Concept 2",
        # routed DISTRIBUTION-NETWORK take-off quantities (the v58b GA-coverage 8:
        # X-150..X-157) — pipework line items, never massed GA boxes; a part this rule
        # drops from the scene must not be GA-expected either (parts_ledger reads the
        # SAME rule, so expectation and scene can never disagree)
        "Zoned distribution — department delivery mains",
        "Zoned distribution — delivery risers",
        "Zoned distribution — zone laterals (flood-fill lines)",
        "Zoned distribution — drain/return risers (gravity)",
        "Zoned distribution — drain collection lines",
        "Zoned distribution — main drain headers",
        "Zoned distribution — delivery inlet stubs, one per served position",
        "Zoned distribution — drain outlet connections (one per 2 positions)",
        "Zoned distribution — zone valve connection kits",
        # X-146/X-152 family-consistency fix (2026-07-04): a bare ring-main take-off is the
        # same PARAMETRIC network row as the zoned-distribution family above, just without a
        # zoned/distribution/delivery/drain/return anchor word.
        "Hand watering — ring main to both departments", "Ring Main", "Fire Ring Main 2",
        # Codema v63 residual (2026-07-03): 5 of the 8 default-box litter names are
        # real bought-out FASTENERS / FITTINGS with genuine manufacturer+DN specs
        # (Hilti M20 anchor bolts, Georg Fischer PVC-U flange/end cap, Klinger
        # gasket, Trelleborg EPDM hose) — every one lives ON a parent connection
        # (a skid frame, a pipe joint, a manifold end), never its own GA box.
        "Anchor Bolt", "M20 Anchor Bolts", "Hex Bolt",
        "CIP Hose", "DN50 Hose", "Hose 2",
        "End Cap", "Outlet Manifold End Cap",
        "Flange", "Permeate Outlet Flange",
        "Gasket", "Permeate Outlet Gasket",
        # BESS commodity/grounding/cell-packaging internals (2026-07-05 v3 dissection)
        "EMC ground braid", "earth bar", "equipotential bonding cable", "earth rod",
        "grounding lug set", "transformer neutral grounding",
        "rack DC isolator padlock", "fuse mount rail",
        "transformer cable sealing end",
        "cell terminal hardware", "thermistor attachment", "cell voltage tap wire",
        "cell insulation pad", "module steel frame", "module top cover",
        "module bottom tray", "compression plate", "compression tie rod set",
        "PCS DC-link capacitor bank", "PCS cooling fan tray", "digital isolator",
        "CAN transceiver", "DC pre-charge resistor", "EMS fibre patch panel",
        "rack heater cable", "gas detection harness",
        "off-gas duct penetration seal", "suppression nozzle",
        "ISO corner casting", "structural floor reinforcement",
        "door assembly double leaf", "smoke vent interlock mount",
        "ISO container 20 HC",
        # fluid/gas charge, pipe-mounted accessories, bare service pipes, thermostat
        # (2026-07-05 BESS v3 LAP-3 denominator-honesty pass)
        "coolant charge", "refrigerant charge", "nitrogen charge",
        "pressure relief and sight glass", "sight glass",
        "coolant supply pipe", "coolant return pipe",
        "rack heater thermostat",
        # PLURAL-BOUNDARY fix proveCatch (2026-07-06, CO2-mineralisation instrument-
        # index family-6 denominator-honesty pass) — every one of these is the SAME
        # noun as an existing must_drop singular above, but plural, and previously
        # slipped the \bnoun\b boundary (no trailing 's' handling): amine-vapour/CO2
        # asphyxiation DETECTORS, radar level / pressure / temperature TRANSMITTERS,
        # pH/conductivity ANALYSERS all shared one 600×600×600 default box.
        "amine-vapour detectors", "CO2 asphyxiation detectors",
        "radar level transmitters", "pressure transmitters", "temperature transmitters",
        "pH/conductivity analysers", "flow transducers", "gauges 2", "probes 2",
        "level indicators",
        # new panel/instrument-index device families (relay / isolation barrier / VSD /
        # soft starter / fieldbus module / ESD logic / safety shower) — the SAME
        # panel-internals + P&ID-symbol principle as the switchgear-internals family
        # above, extended to the CO2-mineralisation electrical/safety-loop vocabulary.
        "motor-protection relays", "safety relays", "SIL-rated isolation barriers",
        "variable-speed drives", "VSD panel", "soft starters",
        "drive fieldbus modules", "emergency shutdown system", "safety shower + eyewash",
        # CO2-mineralisation round-2 RESIDUAL litter (2026-07-06, GA/Renders
        # denominator-honesty pass): 6 of the 10 names sharing the default
        # {1000,1060,1100} box are commodity/structural fittings — must drop.
        # (The other 4 — centrifuge, bag sealer, conveyor, pallet wrapper — are
        # real standalone machines and are proven in must_keep below instead.)
        "agitator shaft mechanical seal", "cable transit frames",
        "access platform + ladders", "structured packing",
        "CO2 sparger ring", "sealer jaw heating element",
    ]
    # pure documentation/signage — expected on NO representation at all.
    must_be_documentation = [
        "rack DC isolator label", "fuse label", "safety label mount",
        "IEC 62619 compliance label", "NFPA 855 warning label",
        "high voltage safety label", "arc flash hazard label",
        "arc flash boundary label", "arc flash barrier tape",
        "deflagration vent label", "fuse install torque card",
        "lifting certification record",
        # Powerwall X-142 Part-names 7.2 (2026-07-14): signage head noun
        "Safety Warning Signage", "Warning Sign", "safety warning placard",
    ]
    # counter-cases: PRINCIPAL equipment that a GA MUST show — none may be dropped.
    must_keep = [
        "Reverse Osmosis Skid", "Fresh Water Storage Tank", "Ultrafiltration Module",
        "Uf Module Bank", "Standby Diesel Generator", "Distribution Transformer",
        "Gac Filter", "Softener Vessel", "Irrigation Pump", "Fertigation Dosing Pump",
        "Drain Collection Sump", "Cip Tank", "Main Switchboard", "Cloth Filter",
        "Electrical Control Cabinet",   # the enclosure itself is real massing
        # fastener/fitting counter-cases (Codema v63 residual, 2026-07-03): bare
        # 'anchor' and bare terminal-noun heads OTHER than the fitting/fastener
        # word itself must never be swept up by the new fastener/hose/fitting
        # families above (proves those rules are tight, not "contains anchor").
        "Anchor Tank", "Anchor Handling Winch", "Hose Station", "Hose Reel Cabinet",
        # other-archetype principals (no-regression): RAS + BESS + process
        "Drum Filter", "Biofilter", "Oxygenation Cone", "MBBR Reactor",
        "Aeration Blower", "Battery Rack", "Power Conversion System", "Step-up Transformer",
        "Absorber Column", "CSTR Reactor", "Heat Exchanger", "Buffer Tank",
        # pipe-ADJACENT names where pipe is NOT the head noun — these are structures /
        # vessels and MUST stay massed (proves the terminal-anchored pipe rule is tight)
        "DN150 Pipe Rack", "Pipe Bridge Support", "Filtrate Pipe Manifold", "Pipe Header Vessel",
        # manifolds stay MASSED (rendered as inline_spool headers, 2026-07-02)
        "Inlet Manifold", "Outlet Manifold", "Piping Manifold", "Permeate Manifold",
        "Outlet Damper Assembly", "Inlet Air Filter", "Cip System",
        # connection-schedule fluid ENDPOINTS — dropping either dangles/re-homes real
        # process edges (the 'Permeate Outlet → Cloth Filter' loss, 2026-07-02)
        "Manifold Support Bracket", "Permeate Outlet", "Concentrate Outlet",
        # REAL stacks — the design-metadata rule is HEAD-anchored, so these keep
        # their massing (proves the rule is tight). NB 'Membrane Stack' is already
        # dropped by the membrane-INTERNALS rule above — deliberately not listed.
        "Vent Stack", "Flare Stack", "Exhaust Stack 2",
        # distribution-CONTEXT names whose HEAD is real equipment — the network rule
        # is head-anchored, so none of these may drop (proves the rule is tight)
        "Distribution Transformer", "Drain Collection Sump", "Drain Transfer Pump",
        "Drain Line Filter", "Delivery Pump Skid", "Return Sludge Pump",
        # 'ring main UNIT' (RMU) counter-case — a real MV switchgear cabinet, not a pipe run;
        # proves the bare ring-main rule above is TERMINAL-anchored (tight), not "contains
        # ring main" (2026-07-04, X-146/X-152 fix).
        "Ring Main Unit", "11kV Ring Main Unit",
        # BESS true massable principals (2026-07-05 v3 dissection) — real small pumps/
        # fans/tank/filter/AC-unit that MUST survive the new grounding/cell-packaging
        # families above (proves those rules are tight, not "contains cell/module").
        "enclosure ventilation fan", "air intake filter", "expansion tank",
        "cooling pump", "container AC unit", "coolant circulation pump",
        "HVAC condensate pump", "off-gas exhaust fan", "LFP prismatic cell",
        "rack DC isolator", "PTC rack heater",
        # CO2-mineralisation round-2 RESIDUAL — the 4 of 10 default-box-litter names
        # that are GENUINE standalone process/packaging machines (2026-07-06): a
        # pusher centrifuge, a band sealer, a belt conveyor and a stretch-wrapper
        # are each their own free-standing piece of kit, not internals/fittings of
        # a parent — these MUST stay massed (and get real per-basis dims from
        # build_universal_scene.py's SHAPE_RULES, not the litter default box).
        "K2SO4 pusher centrifuge", "bag heat sealer", "bag take-away conveyor",
        "pallet wrapper",
        # tightness counter-cases (proves the new exclusion rules above are keyed on
        # the full compound, not a bare substring):
        "Sealless Magnetic Drive Pump",   # no 'mechanical seal' phrase — stays massed
        "Weighing Platform", "Loading Platform",  # no 'access' prefix — stays massed
        "Case Packing Machine", "Packing Station",  # 'packing' machine ≠ packing media
        "Immersion Heater",   # no 'heating element' phrase — stays massed
    ]
    bad_drop = [n for n in must_drop if not is_ga_non_massing(n)]
    bad_keep = [n for n in must_keep if is_ga_non_massing(n)]
    bad_doc = [n for n in must_be_documentation if not is_pure_documentation(n)]
    bad_doc_keep = [n for n in must_keep if is_pure_documentation(n)]
    if bad_drop:
        raise AssertionError(f"GA-non-massing FAILED to drop (litter would survive): {bad_drop}")
    if bad_keep:
        raise AssertionError(f"GA-non-massing WRONGLY dropped principal equipment: {bad_keep}")
    if bad_doc:
        raise AssertionError(f"pure-documentation FAILED to classify: {bad_doc}")
    if bad_doc_keep:
        raise AssertionError(f"pure-documentation WRONGLY caught principal equipment: {bad_doc_keep}")
    print(f"ga_massing --selftest OK ({len(must_drop)} dropped, {len(must_keep)} principal kept, "
          f"{len(must_be_documentation)} pure-documentation)")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
