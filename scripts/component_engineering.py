"""component_engineering.py — SHARED deterministic component-engineering computations
(per-part connectivity + governance + per-component physics + holistic system balances).
Imported by BOTH build-run-dashboard.py AND the chain enrichment step so the dossier
carries exactly what the dashboard shows — ONE source of truth (Tristan 2026-06-15, #138).
No rendering, no LLM: pure functions over the deterministic run artifacts."""
import os, json

import re as _re
def _norm(s): return _re.sub(r'[^a-z0-9]', '', str(s or '').lower())

_GENERIC_PLACEHOLDER_RE = _re.compile(r'\b(?:sub[- ]?component|component)\s*\d+\b', _re.I)

def _svc(service, size, mech):
    s = f"{service} {mech}".lower(); sz = str(size or '').lower()
    if 'mm²' in sz or 'mm2' in sz or any(k in s for k in ('cable', 'power', 'electr', 'feeder')): return 'electrical'
    if 'duct' in sz or any(k in s for k in ('hvac', 'vent', 'exhaust', 'air', 'aeration', 'pneumatic')): return 'air'
    return 'water'

_GOV = [(('pump', 'circulation'), 'pump-sizing'), (('drum', 'microscreen', 'screen'), 'drum-filter'),
        (('uv', 'steril', 'ozone', 'disinfect'), 'uv-reactor'), (('mbbr', 'biofilter', 'biolog', 'nitrif'), 'mbbr'),
        (('oxygen', 'speece', 'cone', 'aerat'), 'oxygenation'), (('degas', 'strip', 'column'), 'ras-degasser'),
        (('tank', 'vessel', 'skim', 'sump', 'reservoir', 'clarifier'), 'pressure-vessel'),
        (('heat', 'chiller', 'thermal', 'hvac', 'temper'), 'load-sizing'),
        (('cable', 'feeder', 'wire', 'electric', 'power', 'busbar'), 'cable-sizing'),
        (('transformer', 'incomer', 'switchgear'), 'transformer-sizing'),
        (('sensor', 'probe', 'instrument', 'control', 'signal', 'monitor', 'plc'), 'control-systems'),
        (('feed', 'biomass', 'metabol', 'stock', 'fish', 'rear'), 'ras-metabolism'),
        (('enclos', 'frame', 'structur', 'panel', 'contain'), 'envelope-check')]

def _required_services(name, module, function, wet_plant=True):
    """DETERMINISTIC: which connection SERVICES a part of this type MUST have, so a
    missing one is named (the loop then creates it). Powered kit needs power; process
    units sit in the FLUID flow; sensors emit a signal to control; the control system
    consumes signals + power. Pure structure (frame/enclosure/label) needs none.
    Tristan 2026-06-15: a part with no inputs/outputs is probably missing one — this
    says WHICH one.

    `wet_plant` (2026-06-23, M1) gates the PROCESS-FLUID default on a PHYSICAL plant-
    level signal: the design is a WET / process-fluid plant (any fluid topology edge
    present, or the process-plant geometry family). When False — a dry / electrical /
    manufactured archetype (satellite, aero, BESS, generic_assembly with no fluid
    edges) — a part is NOT handed a spurious process-WATER pipe; it defaults to
    power / signal only. Default True preserves every caller that does not yet pass
    the signal (a RAS / wet plant keeps its water services unchanged)."""
    t = _norm(f"{name} {module} {function}"); m = _norm(module); req = set()
    # WORD tokens of the RAW name+function (NOT _norm'd — _norm glues words, so 'relief
    # and' reads as 'fan', 'louvre' as 'uv', and the MODULE name 'transduction' as
    # 'duct'; the BESS cross-val 2026-07-03 catch). SHORT/ambiguous tokens match on
    # these word boundaries; the ≥4-char tokens keep the glued substring behaviour
    # (a 'Centre Standpipe' must keep matching 'pipe' mid-word).
    _words = set(_re.findall(r'[a-z0-9]+', f"{name} {function}".lower()))
    tn = _norm(f"{name} {function}")   # name+function ONLY — the module's service is rule (3)
    if _GENERIC_PLACEHOLDER_RE.search(str(name or '')):
        return req
    # ── (1) NAME-keyword roles (cross-module: a pump / sensor / valve anywhere) ──
    # ELECTRICAL ACTUATORS + ELECTRONICS (2026-07-24, Tristan "why were they not wired up?"):
    # the list missed the benchtop-device families, so a Magnetic Stirrer DRIVE (a motor!),
    # a Peltier/TEC, a heater, a controller/display got NO power requirement → the power-closer
    # never fed them → they sat un-powered while a fluid closer wrongly tied the motor by 'water'.
    # A stirrer/drive/servo/actuator/solenoid/peltier/heater/controller/display needs power in
    # ANY archetype — universal. Short/ambiguous tokens (led/tec/mcu/pcb/psu) match whole words.
    if (any(k in t for k in ('pump', 'heat', 'oxygen', 'blower', 'drum', 'chiller', 'steril', 'aerat', 'degas', 'mbbr', 'filter', 'skim', 'compress', 'motor', 'lamp', 'mixer', 'agitat',
                             'stir', 'drive', 'servo', 'actuator', 'solenoid', 'peltier', 'thermoelectric', 'heater', 'controller', 'display', 'regulator', 'regulation', 'converter', 'transducer', 'tachometer'))
            or _words & {'uv', 'ultraviolet', 'fan', 'fans', 'led', 'tec', 'mcu', 'pcb', 'psu'}):
        req.add('power')
    # PROCESS-FLUID role — ONLY on a WET plant. The bare tokens below describe parts
    # that sit in a fluid flow; on a DRY archetype (no fluid edges, not a process
    # plant) they must NOT pull a spurious process-water pipe. The RAS-only tokens
    # ('rear', 'cone') are a CONDITIONAL extension folded in here, never universal.
    # SCANNED OVER THE NAME+FUNCTION, never the module (BESS cross-val 2026-07-03:
    # 'duct' inside the MODULE name 'energy_conversion_transDUCTion' handed every PCS
    # capacitor/arrester/transformer a process-water pipe); the short tokens
    # 'uv'/'fan' match whole words only ('loUVre' and 'relieF ANd' are not fluid kit).
    # 'chill' ADDED (2026-07-05, BESS out/bess-campaign-v5 CH-101 'liquid cooling
    # chiller'): a chiller is a coolant-loop FLOW-THROUGH exchanger by definition (it
    # ALREADY carries the 'chiller' token in the POWER list two lines above — the
    # same NOUN, now also correctly recognised as a fluid node) — without it the
    # classifier never asked audit_completeness for a fluid tie on the part at all,
    # so no closer ever ran (a "no host signal anywhere" gap indistinguishable from a
    # genuinely dry part). Universal — matches 'chiller'/'chilled'/'chilling' by the
    # bare substring, mirrors the existing 'exchanger'/'pump' fluid-noun entries.
    if wet_plant and (any(k in tn for k in ('tank', 'rear', 'filter', 'mbbr', 'degas', 'oxygen', 'skim', 'sump', 'vessel', 'pump', 'clarifier', 'reservoir', 'manifold', 'header', 'pipework', 'pipe', 'duct', 'valve', 'exchanger', 'cone', 'column', 'tower', 'reactor', 'separator', 'contactor', 'blower', 'compress', 'chill'))
                      or _words & {'uv', 'ultraviolet', 'fan', 'fans'}):
        req.add('water')
    # ── (1a) SERVICE-FAMILY EXCLUSION (BESS cross-val 2026-07-03, the fluid-plant rule
    # mis-firing on an electrical-storage archetype): ELECTRICAL gear (a capacitor bank /
    # surge arrester / transformer / busbar / breaker / fuse), DOCUMENTATION (a label /
    # torque card / tape) and pure FASTENING structure (a compression plate / tie rod)
    # never sit in a process-WATER flow — their families are power/signal/none. Two
    # exceptions keep it honest both directions: an explicitly LIQUID-COOLED part (a
    # 'PCS liquid cooling interface', a water-jacketed anything) keeps water, and a part
    # whose NAME is fluid kit (pipework / manifold / tank / valve …) keeps water even
    # when it also carries a structural word ('Skid Frame & Pipework'). Universal
    # vocabulary, no class table; mirrors the (1b) field-instrument rule below.
    if 'water' in req and not _re.search(
            r'cool|chill|water[ -]?jacket|cold[ -]?plate|'
            r'tank|vessel|pipe|manifold|header|valve|sump|reservoir|drain|hose|spool',
            f"{name} {function}", _re.I):
        if _re.search(
                r'capacitor|inductor|arrester|\btransformer\b|busbar|breaker|\brelay\b|'
            # semiconDUCTors/converters (2026-07-11 run 70: 'duct' glued-substring-matched
            # inside 'semiconductors' — the transDUCTion family, in a part NAME)
            r'semiconductors?|converters?|'
                r'\bfuse\b|inverter|rectifier|\bpcs\b|surge|grounding|earthing|'
                r'sealing[ -]?end|switchgear|isolator|varistor|bushing|'
                r'\blabel\b|\bcard\b|\btape\b|placard|nameplate|decal|'
                r'tie[ -]?rod|compression[ -]?plate|end[ -]?plate|\bbracket\b',
                f"{name} {function}", _re.I):
            req.discard('water')
    # NAME+FUNCTION only (2026-07-10 Tristan/Grok false-ship review): these two rules
    # scanned `t`, which INCLUDES the module id — so EVERY word in hmi_ergonomics matched
    # 'hmi' and drew a power+signal feeder ('Warning Labels' fed at 45.2 A on the panel;
    # 26 such feeders summed to the 195.5 kW board on an 11 kW product). Same module-name
    # leak the fluid rule was already fixed for ('transDUCTion' -> 'duct'). The module's
    # service is rule (3)'s job, for UNCLASSIFIED parts only.
    if any(k in tn for k in ('sensor', 'probe', 'instrument', 'monitor', 'meter', 'gauge', 'transmit', 'analy', 'detector')):
        req.add('signal')
    if (any(k in tn for k in ('control', 'plc', 'scada', 'compute', 'automation', 'gateway', 'network', 'iomodule', 'controller'))
            or _words & {'hmi'}):
        req.update(('signal', 'power'))
    # an ANNUNCIATOR (alarm sounder / beacon / strobe) is an active device: signal + power
    if _words & {'alarm', 'sounder', 'beacon', 'strobe', 'annunciator'}:
        req.update(('signal', 'power'))
    # ── (1b) A FIELD INSTRUMENT measures the process; it ties in by signal (+ power if
    # active), NEVER by its own process-water main. The water-keyword list above
    # (oxygen / uv / filter …) otherwise hands a "dissolved-oxygen analyser" or a
    # "UV transmittance sensor" a full DN350 pipe — the council's £166k "Temperature
    # Sensor → Protein Skimming" defect (2026-06-16). Exclude ONLY pure sensors: a
    # process vessel or an inline VALVE legitimately sits in the flow and keeps 'water'.
    _is_sensor = any(k in t for k in ('sensor', 'probe', 'transmit', 'gauge', 'analy', 'detector'))
    _is_inline = ('valve' in t) or any(k in t for k in (
        'tank', 'vessel', 'filter', 'mbbr', 'degas', 'skim', 'clarifier', 'reactor',
        'column', 'tower', 'cone', 'exchanger', 'separator', 'contactor', 'sump', 'reservoir', 'drum'))
    if _is_sensor and not _is_inline:
        req.discard('water')
    # ── (2) PURE STRUCTURE needs nothing (a frame / enclosure / walkway / label) ──
    # PASSIVE families extended 2026-07-10 (Tristan/Grok false-ship review): insulation
    # panels, signage/placards and burst/deflagration panels reached the module-primary
    # fallback and drew a feeder/signal from their MODULE's function ('Thermal Insulation
    # Panels' fed at 45 A from environmental_interface). A passive part answers to NO
    # module service. ('insulation monitor' stays active — 'monitor' granted its signal
    # above and this return keeps explicit roles.)
    if any(k in t for k in ('frame', 'enclos', 'structur', 'platform', 'foundation', 'nameplate', 'label', 'walkway', 'ladder', 'grating', 'cladding', 'insulation', 'signage', 'placard', 'decal', 'deflagration', 'burstpanel', 'gasket', 'busbar')):
        return req   # usually {}; a mis-named structural item keeps any explicit role above
    # ── (3) MODULE-PRIMARY service — ONLY for a part the name keywords left UNCLASSIFIED
    # (a passive busbar/fuse/manifold). A recognised device (sensor, pump, controller)
    # trusts its NAME role and is NOT given its module's service on top — otherwise a
    # temperature SENSOR in the environmental module wrongly gets a power feeder. Keyed
    # on the module's FUNCTION, never a per-part table. This is what gets orphans → 0. ──
    if not req:
        # INTENT: "Sensing Instrumentation Subcomponent 2" is an anonymous coverage
        # proxy emitted when the design lacks a named child part. It is not itself a
        # detector/controller, so inheriting the module's signal service creates a
        # false strict-ledger failure. Real named sensors/controllers returned above.
        if _GENERIC_PLACEHOLDER_RE.search(str(name or '')):
            return req
        if 'powerdistribution' in m or 'powerconversion' in m:
            req.add('power')
        if 'safetyprotection' in m:
            # A POWER-protection element sits IN the power rail (series fuse/PTC/polyfuse/
            # reverse-polarity/breaker, or shunt MOV/TVS/OVP on the rail) and needs a POWER
            # feed — NOT a signal tie. Only a DATA/signal-protection element (ESD/TVS on the
            # debug/USB data lines) needs signal. Council 2026-07-24: the safety_protection
            # module blanket-defaulted to 'signal', so the "PTC Resettable Fuse" fell through
            # unclassified → signal → the power-bus fan-out skipped it (missing_input) and the
            # signal-closer wired it to the Debug Header. Universal noun test, no class table.
            if _re.search(r'\bfuse\b|polyfuse|\bptc\b|resettable|overcurrent|over[ -]?current|'
                          r'reverse[ -]?polarity|thermal[ -]?cut|crowbar|inrush|\bmov\b|varistor|'
                          r'current[ -]?limit|over[ -]?voltage|\bovp\b|\bocp\b|breaker|surge',
                          tn):
                req.add('power')
            else:
                req.add('signal')
        if 'sensing' in m or 'instrumentation' in m:
            req.add('signal')
        if 'controlcompute' in m or 'communication' in m:
            req.update(('signal', 'power'))
        if wet_plant and ('massfluid' in m or 'watertreatment' in m or 'fluidtransport' in m):
            req.add('water')
        if 'environmentalinterface' in m:
            req.add('power')
    return req

def _qval(quantities, key):
    """Read a numeric contract-quantity value (handles {value,unit} or bare)."""
    q = quantities or {}; v = q.get(key)
    if v in (None, ''):
        return None
    try:
        return float(v.get('value') if isinstance(v, dict) else v)
    except (TypeError, ValueError):
        return None


def _tokens(text):
    """Lower-case word tokens (≥4 chars) from a RAW string, split on any non-letter.
    NOTE: do NOT pass a _norm()'d string here — _norm strips spaces so the whole name
    collapses to one glued token that never substring-matches a snake_case key."""
    return [t for t in _re.findall(r'[a-z]+', str(text or '').lower()) if len(t) >= 4]


def _match_qty(quantities, raw_name, prefer, suffixes):
    """UNIVERSAL contract-quantity match for a component: try the explicit `prefer`
    keys in order, else any quantity whose key ends in one of `suffixes` AND whose
    key shares a keyword token with the component name (so a 'recirc' pump grabs
    recirc_pump_power_kw, the 'biofilter' blower grabs biofilter_air_flow_m3_h).
    Tokenises the RAW name (split on non-letters), then matches either direction
    (name-token inside key, or key-token inside name). Returns (value, key) or
    (None, None). Deterministic — pure read."""
    q = quantities or {}
    for k in prefer:
        v = _qval(q, k)
        if v is not None:
            return v, k
    toks = _tokens(raw_name)
    best = None
    for k in q:
        if not any(k.endswith(s) for s in suffixes):
            continue
        ktoks = [t for t in k.split('_') if len(t) >= 4]
        if any(t in k for t in toks) or any(kt in nt or nt in kt for kt in ktoks for nt in toks):
            v = _qval(q, k)
            if v is not None and (best is None or v > best[0]):
                best = (v, k)
    return best if best else (None, None)


def _dims_DH(dims):
    """Principal (diameter/major, height/minor) in metres from a dims dict/list, or
    (0,0). Used for vessel geometry and as render-fallback dimensions only."""
    if isinstance(dims, dict):
        if 'dia' in dims:
            return float(dims['dia']) / 1000.0, float(dims.get('len') or dims.get('h') or dims.get('height') or 0) / 1000.0
        if 'w' in dims or 'd' in dims:
            return max(float(dims.get('w') or 0), float(dims.get('d') or 0)) / 1000.0, float(dims.get('h') or 0) / 1000.0
        vals = sorted((float(v) / 1000.0 for v in dims.values() if isinstance(v, (int, float))), reverse=True)
        return (vals[0], vals[-1]) if len(vals) >= 2 else (0.0, 0.0)
    if isinstance(dims, (list, tuple)) and len(dims) >= 2:
        vals = [float(x) / 1000.0 for x in dims]
        return max(vals[0], vals[1]), (vals[2] if len(vals) >= 3 else vals[-1])
    return 0.0, 0.0


def _spec(type_, material, mass_kg, basis, summary, **specs):
    """Build a render-safe spec dict. Always carries the five keys the dashboard
    indexes (material/diameter_m/height_m/wall_mm/mass_kg) so non-vessel specs never
    KeyError there, PLUS the type-specific engineering `specs`, a `type`, a one-line
    `summary`, and the `basis` (calc + every assumption). Geometry keys default 0 for
    non-vessels whose dims_mm are footprint placeholders, not real shells."""
    d = {'type': type_, 'material': material, 'diameter_m': 0.0, 'height_m': 0.0,
         'wall_mm': 0.0, 'mass_kg': round(mass_kg) if mass_kg else 0,
         'basis': basis, 'summary': summary}
    d.update({k: v for k, v in specs.items()})
    return d


def _component_spec(part, quantities=None):
    """Per-component engineering spec, DETERMINISTIC from the part's OWN role + the
    holistic engineering CONTRACT quantities (Tristan 2026-06-15: EVERY component type
    computes the physics specific to it, not just vessels — universal keyword/role
    dispatch, no per-class/if-ras logic, no LLM). A DISPATCHER routes by name/module
    keyword to the right physics: vessel→hoop-stress wall+mass; pump→rated power+NPSH+
    mass; blower/fan→airflow+ΔP+shaft power+mass; heat-exchanger/heat-pump→duty+UA area+
    mass; transformer→kVA+mass; panel/switchgear→current rating+mass; valve→size+mass;
    motor→frame+mass. Pure structure / sensors / labels return None (no bulk physics).
    Every spec states its calc + assumptions in `basis`."""
    quantities = quantities or {}
    name = str(part.get('name') or ''); shape = str(part.get('shape') or '').lower()
    n = _norm(f"{name} {part.get('module', '')}")
    D, H = _dims_DH(part.get('dims_mm') or {})

    # ── dispatch keyword sets (priority order; first match wins) ─────────────────
    is_hx = any(k in n for k in ('heatpump', 'heatexchang', 'chiller', 'exchanger', 'hvac')) or 'heatpump' in n or (
        'heat' in n and any(k in n for k in ('pump', 'exchang', 'recover', 'duty')))
    is_pump = (not is_hx) and ('pump' in shape or any(k in n for k in ('pump', 'circulation')))
    is_blower = any(k in n for k in ('blower', 'fan', 'aeration', 'aerat', 'oxygen', 'degas', 'compress')) and shape not in ('vertical_vessel', 'horizontal_vessel', 'tall_column', 'tank') and not any(k in n for k in ('tank', 'vessel', 'column'))
    is_transformer = 'transformer' in n
    # unambiguous electrical-switchgear keywords (NOT 'panel'/'distribution' alone — an
    # enclosure PANEL is structure, a DISTRIBUTION manifold is pipework). Require either an
    # unambiguous switch-gear word, or a generic word ('panel'/'distribution') WITH an
    # electrical context (power module / breaker / busbar) and NO structural/fluid context.
    _elec_ctx = any(k in n for k in ('power', 'electric', 'switchgear', 'breaker', 'busbar', 'fuse', 'surge', 'incomer'))
    _struct_ctx = any(k in n for k in ('structur', 'enclos', 'contain', 'frame', 'manifold', 'pipe', 'reservoir', 'fluid'))
    is_panel = (not is_transformer) and (not _struct_ctx) and (
        any(k in n for k in ('switchgear', 'breaker', 'busbar', 'fuse', 'surge', 'incomer'))
        or (any(k in n for k in ('panel', 'distribution', 'board')) and _elec_ctx))
    is_valve = 'valve' in n and not is_pump
    is_motor = (not is_pump) and (not is_hx) and any(k in n for k in ('motor', 'drive')) and 'driveway' not in n
    is_vessel = ('cyl' in shape or 'vessel' in shape or 'column' in shape or any(k in n for k in (
        'tank', 'vessel', 'reservoir', 'sump', 'basin', 'degas', 'column', 'skim',
        'clarifier', 'cone', 'filter', 'drum')))

    # ── HEAT EXCHANGER / HEAT PUMP ───────────────────────────────────────────────
    if is_hx:
        duty, dk = _match_qty(quantities, n,
            ['heating_duty_kw', 'heat_pump_thermal_kw', 'cooling_duty_kw', 'thermal_duty_kw'],
            ('_duty_kw', '_thermal_kw', '_kw'))
        if duty is None:
            ehp = _qval(quantities, 'heat_pump_electrical_kw'); cop = _qval(quantities, 'heat_pump_cop')
            duty = (ehp * cop) if (ehp and cop) else (ehp or 0.0)
            dk = 'heat_pump_electrical_kw×COP' if (ehp and cop) else 'heat_pump_electrical_kw'
        # plate HX: U≈1200 W/m²K (water/water plate), LMTD≈8 K (close-approach warm loop)
        U = 1200.0; lmtd = 8.0
        area = (duty * 1000.0) / (U * lmtd) if duty else 0.0   # A=Q/(U·ΔTlm), m²
        mat = '316L stainless plate' if 'titan' not in n else 'titanium plate'
        # parametric mass: brazed/gasketed plate pack ≈ 18 kg/m² heat-transfer area + frame
        mass = area * 18.0 + 250.0
        ehp = _qval(quantities, 'heat_pump_electrical_kw')
        extra = {'thermal_duty_kw': round(duty, 1), 'area_m2': round(area, 1), 'U_w_m2k': U, 'lmtd_k': lmtd}
        if ehp is not None:
            extra['electrical_kw'] = round(ehp, 1)
        return _spec('heat_exchanger', mat, mass,
            f"A=Q/(U·ΔTlm) · Q={duty:,.0f} kW (from {dk}) · U={U:.0f} W/m²K plate · LMTD={lmtd:.0f} K → A={area:,.0f} m² · mass≈18 kg/m²·A+250 kg frame",
            f"{duty:,.0f} kW · {area:,.0f} m² · {round(mass):,} kg", **extra)

    # ── PUMP ─────────────────────────────────────────────────────────────────────
    if is_pump:
        power, pk = _match_qty(quantities, n,
            (['recirc_pump_power_kw'] if 'recirc' in n else []) + ['pump_power_kw', 'circulation_pump_power_kw'],
            ('_pump_power_kw', '_power_kw'))
        if power is None:
            cel = _qval(quantities, 'connected_electrical_load_kw') or 0.0
            power = cel * 0.20; pk = '20% of connected_electrical_load_kw (default share)'
        # fluid → material: process/sea water = corrosion → 316L wetted; else ductile iron
        corrosive = any(k in n for k in ('seawater', 'sea', 'salt', 'process', 'recirc', 'circulation', 'ras'))
        mat = '316L stainless (wetted) + cast-iron casing' if corrosive else 'ductile cast iron'
        # NPSHr estimate: low-specific-speed end-suction, grows mildly with power (~0.05·P^0.5 +2)
        npshr = 2.0 + 0.05 * (power ** 0.5)
        # pump+motor mass parametric: end-suction long-coupled set ≈ 9·P^0.75 + 60 kg (IEC frame + baseplate)
        mass = 9.0 * (power ** 0.75) + 60.0
        return _spec('pump', mat, mass,
            f"rated power {power:,.0f} kW (from {pk}) · NPSHr≈2+0.05·√P={npshr:.1f} m · mass≈9·P^0.75+60 (long-coupled set+baseplate)",
            f"{power:,.0f} kW · NPSHr {npshr:.1f} m · {round(mass):,} kg",
            rated_power_kw=round(power, 1), npshr_m=round(npshr, 1))

    # ── BLOWER / FAN ─────────────────────────────────────────────────────────────
    if is_blower:
        q_air, qk = _match_qty(quantities, n, [],  ('_air_flow_m3_h', '_airflow_m3_h', '_air_m3_h'))
        if q_air is None and 'oxygen' in n:
            # oxygenation cone feed-gas blower: size off recirculation flow at low air:water
            q_air = (_qval(quantities, 'recirculation_flow_m3_h') or 0.0) * 0.5; qk = '0.5×recirculation_flow_m3_h (O₂ feed-gas)'
        if q_air is None:
            return None
        # static pressure assumption by duty: degasser/aeration push against column/diffuser
        # submergence (~depth head); biofilter grid is shallow; default low-pressure fan.
        if any(k in n for k in ('degas', 'strip', 'column')):
            dP = 12000.0; dP_note = '~1.2 m water column packed degasser draught'
        elif any(k in n for k in ('oxygen', 'aerat', 'biofilter', 'mbbr', 'diffus')):
            dP = 18000.0; dP_note = '~1.8 m diffuser submergence'
        else:
            dP = 5000.0; dP_note = '~0.5 m low-pressure fan'
        eta = 0.65                                            # blower wire-to-air efficiency
        P_kw = (q_air / 3600.0) * dP / (1000.0 * eta)         # P=Q·ΔP/(1000·η), Q in m³/s
        # mass parametric: centrifugal blower + motor ≈ 6·P^0.8 + 40 kg
        mass = 6.0 * (P_kw ** 0.8) + 40.0
        mat = 'cast aluminium / coated steel volute'
        return _spec('blower', mat, mass,
            f"P=Q·ΔP/(1000·η) · Q={q_air:,.0f} m³/h (from {qk}) · ΔP={dP / 1000:.1f} kPa ({dP_note}) · η={eta:.2f} → P={P_kw:,.1f} kW · mass≈6·P^0.8+40",
            f"{q_air:,.0f} m³/h · {P_kw:,.1f} kW · {round(mass):,} kg",
            air_flow_m3_h=round(q_air), static_pressure_pa=round(dP), shaft_power_kw=round(P_kw, 1))

    # ── TRANSFORMER ──────────────────────────────────────────────────────────────
    if is_transformer:
        kva, kk = _match_qty(quantities, n, ['transformer_rating_kva', 'transformer_kva'], ('_kva',))
        if kva is None:
            load = _qval(quantities, 'connected_electrical_load_kw') or 0.0
            pf = 0.9                                          # assumed plant power factor
            kva = (load / pf) * 1.25                          # +25% headroom over connected load
            kk = 'connected_electrical_load_kw/0.9 ×1.25 headroom'
        # oil-filled distribution transformer mass ≈ 5.5 kg/kVA (11 kV/400 V, ~1000 kVA band)
        mass = kva * 5.5
        return _spec('transformer', 'oil-filled copper-wound (ONAN)', mass,
            f"oil-filled distribution transformer · {kva:,.0f} kVA (from {kk}) · mass≈5.5 kg/kVA (11 kV/400 V ONAN band)",
            f"{kva:,.0f} kVA · {round(mass):,} kg", rating_kva=round(kva))

    # ── ELECTRICAL PANEL / SWITCHGEAR / BREAKER / BUSBAR ─────────────────────────
    if is_panel:
        load = _qval(quantities, 'connected_electrical_load_kw') or 0.0
        V, pf = 400.0, 0.9                                    # LV 400 V 3-phase, pf 0.9
        amps = (load * 1000.0) / (1.732 * V * pf) if load else 0.0   # I=P/(√3·V·pf)
        rating = next((r for r in (250, 400, 630, 800, 1250, 1600, 2000, 2500, 3200, 4000) if r >= amps * 1.25), 4000)
        # enclosure + copper parametric: floor-standing form-4 board ≈ 0.18 kg/A rating + 120 kg steel
        mass = rating * 0.18 + 120.0
        return _spec('electrical_panel', 'sheet-steel enclosure + tinned-copper busbar', mass,
            f"I=P/(√3·V·pf) · P={load:,.0f} kW · V=400 V · pf=0.9 → {amps:,.0f} A · next std frame ≥1.25·I = {rating} A · mass≈0.18 kg/A+120 kg",
            f"{rating} A frame · {round(mass):,} kg", current_a=round(amps), frame_rating_a=rating)

    # ── VALVE ────────────────────────────────────────────────────────────────────
    if is_valve:
        # An inline control valve sits on ONE branch, not the whole plant: prefer its OWN
        # body footprint (the part geometry) for DN. Only when there is no geometry AND the
        # name signals a MAIN/HEADER valve do we size from the full recirculation flow.
        is_header = any(k in n for k in ('main', 'header', 'trunk', 'manifold'))
        q_m3h = _qval(quantities, 'recirculation_flow_m3_h')
        if D > 0 and not is_header:
            dn_mm = D * 1000.0; src = 'body footprint'
        elif is_header and q_m3h:
            dn_mm = ((4.0 * (q_m3h / 3600.0) / (3.14159 * 2.0)) ** 0.5) * 1000.0   # D=√(4Q/(πv)), v=2 m/s
            src = 'D=√(4Q/(πv)) at v=2 m/s on full recirc flow'
        else:
            dn_mm = max(D * 1000.0, 50.0); src = 'body footprint'
        # body+actuator parametric: ductile-iron butterfly ≈ 0.9 kg/mm DN + 8 kg actuator
        mass = dn_mm * 0.9 + 8.0
        return _spec('valve', 'ductile-iron body / EPDM seat', mass,
            f"DN≈{dn_mm:,.0f} mm ({src}) · mass≈0.9 kg/mm+8 kg actuator",
            f"DN{dn_mm:,.0f} · {round(mass):,} kg", line_size_mm=round(dn_mm))

    # ── MOTOR (standalone) ───────────────────────────────────────────────────────
    if is_motor:
        power, pk = _match_qty(quantities, n, ['motor_power_kw'], ('_power_kw',))
        if power is None:
            power = (_qval(quantities, 'connected_electrical_load_kw') or 0.0) * 0.10; pk = '10% of connected load (default)'
        # TEFC induction motor frame mass ≈ 7·P^0.78 + 15 kg
        mass = 7.0 * (power ** 0.78) + 15.0
        return _spec('motor', 'TEFC cast-iron induction', mass,
            f"frame from rated power {power:,.0f} kW (from {pk}) · mass≈7·P^0.78+15 (IEC TEFC)",
            f"{power:,.0f} kW · {round(mass):,} kg", rated_power_kw=round(power, 1))

    # ── VESSEL (KEEP the existing hoop-stress physics) ───────────────────────────
    if is_vessel and D > 0 and H > 0:
        if any(k in n for k in ('frp', 'grp', 'hdpe', 'plastic')) or (
                any(k in n for k in ('tank', 'rear', 'basin', 'reservoir', 'sump'))
                and not any(k in n for k in ('pressure', 'reactor', 'column', 'degas', 'steril', 'uv'))):
            mat, rho, sigma, corr, floor = 'FRP/GRP', 1800.0, 18.0, 0.0, 6.0
        elif any(k in n for k in ('316', 'stainless', 'steril', 'uv', 'degas', 'skim', 'oxygen')):
            mat, rho, sigma, corr, floor = '316L stainless', 8000.0, 138.0, 0.5, 4.0
        else:
            mat, rho, sigma, corr, floor = 'carbon steel', 7850.0, 120.0, 2.0, 5.0
        P = 1000.0 * 9.81 * H                                  # hydrostatic at base, Pa
        t_hoop = P * (D / 2.0) / (sigma * 1e6 * 0.85)          # hoop stress, weld eff 0.85, m
        wall = max(t_hoop + corr / 1000.0, floor / 1000.0)
        area = 3.14159 * D * H + 2 * (3.14159 * D * D / 4.0)   # shell + 2 ends
        mass = area * wall * rho
        return {'type': 'vessel', 'material': mat, 'diameter_m': round(D, 2), 'height_m': round(H, 2),
                'wall_mm': round(wall * 1000, 1), 'mass_kg': round(mass),
                'summary': f"⌀{D:.1f}×{H:.1f} m · wall {wall * 1000:.1f} mm · {round(mass):,} kg",
                'basis': f"hoop t=P·r/(σ·E)+c · P={P / 1000:.0f} kPa head · σ={sigma:.0f} MPa · ⌀{D:.1f}×{H:.1f} m → {wall * 1000:.1f} mm"}

    # pure structure / sensors / small instruments / labels → no bulk physics
    return None


def system_balances(quantities):
    """Holistic SYSTEM-WIDE resource accounting (Tristan 2026-06-15: see water use, power
    in vs consumption, air, heat, oxygen, feed across the WHOLE system — and keep track of
    it). Groups the contract quantities by resource and computes a headline in-vs-out
    closure where derivable. Deterministic — pure read of the contract."""
    q = quantities or {}
    def val(k):
        v = q.get(k)
        return float(v.get('value') if isinstance(v, dict) else v) if v not in (None, '') else 0.0
    def unit(k):
        v = q.get(k); return v.get('unit', '') if isinstance(v, dict) else ''
    def rows(keys): return [(k, val(k), unit(k)) for k in keys if k in q]
    bal = []
    elec = [k for k in q if (k.endswith('_electrical_kw') or k.endswith('_power_kw')) and 'connected' not in k]
    bal.append(('Electrical power', rows(elec + (['connected_electrical_load_kw'] if 'connected_electrical_load_kw' in q else [])),
                f"consumers Σ {sum(val(k) for k in elec):,.0f} kW vs connected load {val('connected_electrical_load_kw'):,.0f} kW"))
    water = [k for k in q if unit(k) == 'm³/h' and any(t in k for t in ('water', 'recirc', 'makeup'))]
    bal.append(('Water', rows(water),
                f"make-up {val('makeup_water_m3_h'):,.0f} m³/h in ≈ discharge out · recirc loop {val('recirculation_flow_m3_h'):,.0f} m³/h internal"))
    air = [k for k in q if 'air_flow' in k]
    # building moisture / dehumidification load from the OPEN WATER SURFACE (Tristan: "all the
    # air handling including humidity"). Surface from tank volume (⌀ assuming H≈0.6·⌀), +20% for
    # sumps/channels; indoor RAS evaporation ~0.15 kg/m²/h; latent of vaporisation ~0.68 kWh/kg.
    tankV = val('total_tank_volume_m3'); ntank = val('rearing_tank_count') or 1
    v_each = (tankV / ntank) if ntank else tankV
    d_each = (v_each / 0.471) ** (1 / 3.0) if v_each > 0 else 0.0
    water_area = ntank * 3.14159 * (d_each / 2.0) ** 2 * 1.2
    moisture_kg_h = water_area * 0.15
    dehum_kw = moisture_kg_h * 0.68
    bal.append(('Air handling', rows(air),
                f"Σ {sum(val(k) for k in air):,.0f} m³/h strip+vent air · water surface ≈ {water_area:,.0f} m² "
                f"→ moisture {moisture_kg_h:,.0f} kg/h → dehumidification ≈ {dehum_kw:,.0f} kW "
                f"(evap 0.15 kg/m²/h, latent 0.68 kWh/kg)"))
    thermal = [k for k in q if k.endswith('_kw') and any(t in k for t in ('heating', 'loss', 'thermal')) and 'electrical' not in k]
    bal.append(('Thermal / heat', rows(thermal), f"heating duty {val('heating_duty_kw'):,.0f} kW vs losses + make-up"))
    o2d = val('oxygen_demand_kg_day'); o2s = val('oxygen_supply_kg_h') * 24
    bal.append(('Oxygen', rows(['oxygen_demand_kg_day', 'oxygen_supply_kg_h']), f"supply {o2s:,.0f} kg/day vs demand {o2d:,.0f} kg/day → {'BALANCED' if o2d and abs(o2s - o2d) / o2d < 0.1 else 'CHECK'}"))
    feed = [k for k in q if k.endswith('_kg_day')]
    bal.append(('Feed + waste loads', rows(feed), f"feed {val('daily_feed_kg'):,.0f} kg/day in → solids {val('solids_load_kg_day'):,.0f} + TAN {val('tan_load_kg_day'):,.0f} kg/day removed"))
    return [(name, items, note) for name, items, note in bal if items]


def build_connectivity(run, req_bom, tools):
    """DETERMINISTIC per-part connectivity + GOVERNANCE from the Blender route/parts
    manifests + the connection-schedule. For every part: incoming + outgoing routed
    connections (service · size · length · CALCULATED rating · in/out-of-spec), what
    it does, the TOOL that governs it (sizes/calculates it), and a CHECKER (governed /
    connected / priced). A part with no inputs OR no outputs, OR no governing tool, is
    flagged — the loop must call a tool in to govern/connect it (Tristan 2026-06-15:
    every part + connection needs a tool governing it; the calc sets the connector
    type + cost; orphans are probably missing a connection). No LLM."""
    def _L(n):
        try:
            with open(os.path.join(run, n)) as f: return json.load(f)
        except Exception: return {}
    pm = _L('parts-manifest.json'); rmf = _L('route-manifest.json'); cs = _L('connection-schedule.json')
    qty = (_L('0.5-engineering-contract.json').get('quantities') or {})  # per-component physics inputs
    meta = {(_norm(r.get('from')), _norm(r.get('to'))): {'within_spec': bool(r.get('within_spec')),
            'rating': r.get('rating'), 'drop': r.get('drop')} for r in (cs.get('rows') or [])}
    edges = []
    for l in (rmf.get('lines') or []):
        ft, tt = l.get('from_tag'), l.get('to_tag'); m = meta.get((_norm(ft), _norm(tt)), {})
        edges.append({'from': ft, 'to': tt, 'service': _svc(l.get('service'), l.get('size_label'), l.get('mechanism')),
                      'size': l.get('size_label'), 'length_m': l.get('length_m'),
                      'within_spec': m.get('within_spec', True), 'rating': m.get('rating'), 'drop': m.get('drop')})
    func, priced = {}, {}
    for r in (req_bom or []):
        if isinstance(r, dict) and not r.get('connection'):
            nm = _norm(r.get('part') or r.get('requirement'))
            func[nm] = r.get('requirement'); func[_norm(str(r.get('requirement', '')).split('·')[0])] = r.get('requirement')
            priced[nm] = bool((r.get('line_gbp') or 0) > 0)
    tool_ids = [t.get('tool_id', '') for t in (tools or [])]
    def _gov(name, function):
        text = _norm(f"{name} {function}")
        for keys, sub in _GOV:
            if any(k in text for k in keys):
                m = next((i for i in tool_ids if sub in i), None)
                if m: return m
        return None
    parts, seen = [], set()
    for p in (pm.get('parts') or []):
        nm = p.get('name')
        parts.append({'name': nm, 'tag': p.get('equipment_tag') or p.get('tag'), 'module': p.get('module'),
                      'spec': _component_spec(p, qty)})
        seen.add(_norm(nm))
    for e in edges:
        for ep in (e['from'], e['to']):
            if _norm(ep) not in seen:
                seen.add(_norm(ep)); parts.append({'name': ep, 'tag': '—', 'module': '(process node)'})
    def _match(ep, name):
        a, b = _norm(ep), _norm(name)
        return bool(a) and bool(b) and (a == b or a in b or b in a)
    # WET-PLANT signal (M1, 2026-06-23): the design carries a process-FLUID topology
    # iff any routed line is a water/process-fluid service. A dry archetype (satellite,
    # aero, BESS) has zero water lines → its parts default to power/signal, never a
    # spurious process-water pipe. Physical signal (routed edges), no archetype name.
    wet_plant = any(e.get('service') == 'water' for e in edges)
    for part in parts:
        part['incoming'] = [e for e in edges if _match(e['to'], part['name'])]
        part['outgoing'] = [e for e in edges if _match(e['from'], part['name'])]
        part['function'] = func.get(_norm(part['name']), '')
        part['governing_tool'] = _gov(part['name'], part['function'])
        present = set(('power' if e['service'] == 'electrical' else e['service']) for e in part['incoming'] + part['outgoing'])
        _req = _required_services(part['name'], part.get('module', ''), part['function'], wet_plant)
        part['missing'] = sorted(_req - present)
        # ORPHAN = ISOLATED (no edges at all) AND it actually needs a service. A pure
        # structural part (frame / enclosure → no required services) is connectionless by
        # DESIGN, not an orphan. A part with ANY edge is wired into the plant; a missing
        # direction/service is the softer `missing` diagnosis (not an orphan). This is
        # what makes "orphans → 0" a meaningful, achievable target.
        part['orphan'] = (not part['incoming'] and not part['outgoing']) and bool(_req)
        part['checks'] = {'governed': bool(part['governing_tool']), 'connected': not part['orphan'],
                          'priced': priced.get(_norm(part['name']), False)}
    return parts, edges



def _selftest():
    """proveCatch for the required-services classifier (BESS cross-val 2026-07-03) —
    both directions: the fluid-plant water rule must NOT fire on electrical-storage
    gear, and must STILL fire on genuine fluid kit. Run:
        python3 scripts/component_engineering.py --selftest"""
    fails = []

    def expect(cond, msg):
        if not cond:
            fails.append(msg)

    # (a) electrical gear in a module whose NAME glues to a fluid token
    # ('transDUCTion' ≠ 'duct') gets NO process-water service
    for nm in ("PCS DC-link capacitor bank", "PCS DC surge arrester", "step-up transformer",
               "transformer neutral grounding", "transformer cable sealing end"):
        expect('water' not in _required_services(nm, "energy_conversion_transduction", "", True),
               f"{nm!r} must not require process water (electrical gear; module-name 'duct' trap)")
    # (b) short-token word boundaries: 'loUVre' is not UV kit; 'relieF ANd' is not a fan
    expect('water' not in _required_services("louvre vent panel", "environmental_interface", "", True),
           "'louvre' must not match the 'uv' token")
    expect('power' not in _required_services("pressure relief and sight glass",
                                             "mass_fluid_transport_process", "", True),
           "'relief and' must not match the 'fan' token (no spurious power)")
    # (c) fastening structure / documentation: no water
    expect('water' not in _required_services("compression tie rod set", "energy_storage_source", "", True),
           "a tie rod set must not require process water")
    # (d) STILL FIRES on genuine fluid kit (the other direction)
    expect('water' in _required_services("Skid Frame & Pipework", "mass_fluid_transport_process", "", True),
           "'Skid Frame & Pipework' is fluid kit and must keep water")
    expect('water' in _required_services("Dual Drain / Centre Standpipe", "mass_fluid_transport_process", "", True),
           "'Centre Standpipe' must keep water (mid-word 'pipe' match)")
    expect('water' in _required_services("UV Sterilizer Chamber", "water_treatment", "", True),
           "a real UV steriliser keeps water ('uv' as a whole word)")
    expect('water' in _required_services("coolant supply pipe", "mass_fluid_transport_process", "", True),
           "a coolant pipe keeps water")
    # (e) dry plant: no water anywhere
    expect('water' not in _required_services("Buffer Tank", "structure", "", False),
           "a DRY archetype never gets process water")
    # (f) CHILLER FAMILY proveCatch (2026-07-05, BESS out/bess-campaign-v5 CH-101 —
    # 'liquid cooling chiller' got {'power'} only, never 'water', so audit_completeness
    # never even flagged it as needing a fluid tie and no closer ever ran — a coolant
    # loop's own heat-rejection unit was invisible to the whole connectivity net).
    # 'chiller' already granted POWER by name (line ~52); it must ALSO grant water,
    # generalised by the SAME noun token — never a per-tag fix.
    expect('water' in _required_services("liquid cooling chiller", "environmental_interface", "", True),
           "a liquid cooling chiller is a coolant flow-through node and must require water")
    expect('water' in _required_services("Pfannenberg chiller unit", "environmental_interface", "", True),
           "any chiller-named part keeps water (universal noun match, not a specific SKU)")
    expect('water' in _required_services("chilled water circuit chiller", "environmental_interface", "", True),
           "a chiller keeps water regardless of surrounding qualifier words")
    # scope boundary — the added token is the narrow 'chill' (chiller/chilled/chilling),
    # never the broader 'cool', so it does not touch any other keyword's existing verdict.
    # 'step-up transformer' etc. (case (a) above) stay water-free: 'chill' doesn't appear
    # in that family at all — this fix only ever ADDS a match for the literal chiller noun.
    expect('water' not in _required_services("step-up transformer", "energy_conversion_transduction", "", True),
           "the 'chill' addition must not affect unrelated electrical gear")
    if fails:
        print("component_engineering selftest FAILED:")
        for m in fails:
            print("  -", m)
        return 1
    print("component_engineering selftest: OK (required-services keys on service family)")
    return 0


if __name__ == "__main__":
    import sys as _sys
    if "--selftest" in _sys.argv:
        _sys.exit(_selftest())
