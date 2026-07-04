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
    # field instruments -> P&ID tags
    r"\btransmitter\b|\btransducer(?:s)?\b|\bsensor\b|\banaly[sz]er\b|"
    r"\bflow ?meter(?:s)?\b|\bgauge\b|\bprobe\b|\bdetector\b|\bindicator\b|"
    # switchgear / protection / control-panel internals -> inside the cabinet
    r"\bcircuit breaker(?:s)?\b|\bmotor starter(?:s)?\b|\bvfd\b|"
    r"\bcontactor(?:s)?\b|\bemergency stop\b|\bplc\b|\bhmi\b|"
    r"\bcontroller(?:s)?\b|\binterface\b|\bethernet\b|\bmodbus\b|"
    r"\bprofibus\b|\bgateway\b|\b(?:remote )?monitoring\b|"
    r"\b(?:overload|overcurrent|surge|short[- ]?circuit|earth[- ]?fault|"
    r"thermal|fault) protection\b|"
    r"\b(?:low|high|pressure|level|float|limit|flow|proximity|"
    r"temperature) switch(?:es)?\b|"
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
    r"s?\s*\d*\s*$",
    re.I)


def is_ga_non_massing(name):
    """True if `name` is P&ID-level detail (accessory / instrument / inline
    valve / panel-internal) that must NOT be placed as a 3D GA equipment box."""
    return bool(GA_NON_MASSING_RE.search(name or ""))


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
    ]
    bad_drop = [n for n in must_drop if not is_ga_non_massing(n)]
    bad_keep = [n for n in must_keep if is_ga_non_massing(n)]
    if bad_drop:
        raise AssertionError(f"GA-non-massing FAILED to drop (litter would survive): {bad_drop}")
    if bad_keep:
        raise AssertionError(f"GA-non-massing WRONGLY dropped principal equipment: {bad_keep}")
    print(f"ga_massing --selftest OK ({len(must_drop)} dropped, {len(must_keep)} principal kept)")


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        _selftest()
