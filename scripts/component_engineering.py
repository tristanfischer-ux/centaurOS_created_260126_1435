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

def _component_spec(part):
    """Per-component engineering spec, DETERMINISTIC from the part's OWN geometry + role
    (Tristan 2026-06-15: a tank should compute its material, the material physics, and the
    wall THICKNESS from its volume / diameter / height — not a constant). For a vessel:
    select material by service, derive the hoop-stress wall from the hydrostatic head at
    its depth, and the shell mass. Returns None for non-vessels (pumps/pipes need their
    own physics — next). No LLM."""
    name = str(part.get('name') or ''); shape = str(part.get('shape') or '').lower()
    dims = part.get('dims_mm') or {}
    n = _norm(f"{name} {part.get('module', '')}")
    if isinstance(dims, dict):
        if 'dia' in dims:
            D = float(dims['dia']) / 1000.0
            H = float(dims.get('len') or dims.get('h') or dims.get('height') or 0) / 1000.0
        elif 'w' in dims or 'd' in dims:
            D = max(float(dims.get('w') or 0), float(dims.get('d') or 0)) / 1000.0
            H = float(dims.get('h') or 0) / 1000.0
        else:
            vals = sorted((float(v) / 1000.0 for v in dims.values() if isinstance(v, (int, float))), reverse=True)
            if len(vals) < 2:
                return None
            D, H = vals[0], vals[-1]
    elif isinstance(dims, (list, tuple)) and len(dims) >= 2:
        vals = [float(x) / 1000.0 for x in dims]
        D = max(vals[0], vals[1]); H = vals[2] if len(vals) >= 3 else vals[-1]
    else:
        return None
    is_vessel = ('cyl' in shape or 'vessel' in shape or any(k in n for k in ('tank', 'vessel', 'reservoir',
                 'sump', 'basin', 'degas', 'column', 'skim', 'clarifier', 'cone', 'filter', 'drum')))
    if not is_vessel or D <= 0 or H <= 0:
        return None
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
    return {'material': mat, 'diameter_m': round(D, 2), 'height_m': round(H, 2),
            'wall_mm': round(wall * 1000, 1), 'mass_kg': round(mass),
            'basis': f"hoop t=P·r/(σ·E)+c · P={P / 1000:.0f} kPa head · σ={sigma:.0f} MPa · ⌀{D:.1f}×{H:.1f} m → {wall * 1000:.1f} mm"}


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
                      'spec': _component_spec(p)})
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

