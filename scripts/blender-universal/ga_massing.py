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
    r"\blev(?:el)?ling feet\b|\bleveling feet\b|\bdistribution plate(?:s)?\b|"
    r"\bcip (?:system )?connection(?:s)?\b|\bquick coupling\b|"
    r"\bsupport (?:system|frame|structure|stand)\b|"
    r"\bpneumatic actuator(?:s)?\b|\belectric actuator(?:s)?\b|"
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
    # inline valves -> P&ID symbols (specific types, never a 'valve skid')
    r"\b(?:isolation|sample|ball|check|relief|gate|globe|butterfly|"
    r"control|solenoid|needle|diaphragm|non-return|nrv|pressure relief|"
    r"pressure reducing|safety|actuated|automated|pneumatic|electric|"
    r"motoris(?:ed|er)|motoriz(?:ed|er)|modulating) valve(?:s)?\b",
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
    ]
    # counter-cases: PRINCIPAL equipment that a GA MUST show — none may be dropped.
    must_keep = [
        "Reverse Osmosis Skid", "Fresh Water Storage Tank", "Ultrafiltration Module",
        "Uf Module Bank", "Standby Diesel Generator", "Distribution Transformer",
        "Gac Filter", "Softener Vessel", "Irrigation Pump", "Fertigation Dosing Pump",
        "Drain Collection Sump", "Cip Tank", "Main Switchboard", "Cloth Filter",
        "Electrical Control Cabinet",   # the enclosure itself is real massing
        # other-archetype principals (no-regression): RAS + BESS + process
        "Drum Filter", "Biofilter", "Oxygenation Cone", "MBBR Reactor",
        "Aeration Blower", "Battery Rack", "Power Conversion System", "Step-up Transformer",
        "Absorber Column", "CSTR Reactor", "Heat Exchanger", "Buffer Tank",
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
