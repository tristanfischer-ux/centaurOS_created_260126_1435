"""component_engineering.py — SHARED deterministic component-engineering computations
(per-part connectivity + governance + per-component physics + holistic system balances).
Imported by BOTH build-run-dashboard.py AND the chain enrichment step so the dossier
carries exactly what the dashboard shows — ONE source of truth (Tristan 2026-06-15, #138).
No rendering, no LLM: pure functions over the deterministic run artifacts."""
import os, json

import re as _re
def _norm(s): return _re.sub(r'[^a-z0-9]', '', str(s or '').lower())

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

def _required_services(name, module, function):
    """DETERMINISTIC: which connection SERVICES a part of this type MUST have, so a
    missing one is named (the loop then creates it). Powered kit needs power; process
    units sit in the water flow; sensors emit a signal to control; the control system
    consumes signals + power. Pure structure (frame/enclosure/label) needs none.
    Tristan 2026-06-15: a part with no inputs/outputs is probably missing one — this
    says WHICH one."""
    t = _norm(f"{name} {module} {function}"); req = set()
    if any(k in t for k in ('pump', 'heat', 'uv', 'oxygen', 'blower', 'drum', 'chiller', 'steril', 'aerat', 'degas', 'mbbr', 'filter', 'skim', 'compress', 'motor', 'fan')):
        req.add('power')
    if any(k in t for k in ('tank', 'rear', 'filter', 'mbbr', 'degas', 'oxygen', 'uv', 'skim', 'sump', 'vessel', 'pump', 'clarifier', 'reservoir')):
        req.add('water')
    if any(k in t for k in ('sensor', 'probe', 'instrument', 'monitor', 'meter', 'gauge', 'transmit', 'analy')):
        req.add('signal')
    if any(k in t for k in ('control', 'plc', 'scada', 'hmi', 'compute', 'automation')):
        req.update(('signal', 'power'))
    if any(k in t for k in ('frame', 'enclos', 'structur', 'contain', 'support', 'platform', 'foundation', 'nameplate', 'label')) and not req:
        return set()
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
    bal.append(('Air handling', rows(air), f"Σ {sum(val(k) for k in air):,.0f} m³/h (degasser strip air dominates) · humidity load = NOT yet computed"))
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
    for part in parts:
        part['incoming'] = [e for e in edges if _match(e['to'], part['name'])]
        part['outgoing'] = [e for e in edges if _match(e['from'], part['name'])]
        part['function'] = func.get(_norm(part['name']), '')
        part['orphan'] = (not part['incoming']) or (not part['outgoing'])
        part['governing_tool'] = _gov(part['name'], part['function'])
        present = set(('power' if e['service'] == 'electrical' else e['service']) for e in part['incoming'] + part['outgoing'])
        part['missing'] = sorted(_required_services(part['name'], part.get('module', ''), part['function']) - present)
        part['checks'] = {'governed': bool(part['governing_tool']), 'connected': not part['orphan'],
                          'priced': priced.get(_norm(part['name']), False)}
    return parts, edges

