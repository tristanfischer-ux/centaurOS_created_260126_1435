#!/usr/bin/env python3
"""
build-run-dashboard.py <run_dir>

A simple light-theme HTML view of ONE engine run — the inspection surface
(Tristan 2026-06-15). Shows, in order:
  1. the expanded brief          4. the Blender model (universal CAD)
  2. all tools + their results   5. the 8 engineering documents
  3. the engineering contract    6. the bill of materials

Deliberately does NOT show: the Gemini photoreal cover, per-module renders, or
any PDF (Tristan: "the PDFs are wrong and wired incorrectly — don't show them").
Writes <run_dir>/dashboard.html with relative image paths.
"""
import json, os, sys, html, glob

run = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')

def load(name, default=None):
    try:
        with open(os.path.join(run, name)) as f: return json.load(f)
    except Exception: return default

def loadtext(name, default=''):
    try:
        with open(os.path.join(run, name)) as f: return f.read()
    except Exception: return default

def esc(x): return html.escape(str(x)) if x is not None else ''

def fmtnum(v):
    try:
        f = float(v)
        if abs(f) >= 100: return f"{f:,.0f}"
        if abs(f) >= 1:   return f"{f:,.2f}"
        return f"{f:.3g}"
    except Exception:
        return esc(v)

def imgcards(paths, three=True):
    out = [f'<div class="{"grid3" if three else "grid"}">']
    for p in paths:
        rel = os.path.relpath(p, run)
        out.append(f'<div class="imgcard"><img src="{esc(rel)}"><div class="cap">{esc(os.path.basename(p).replace(".png",""))}</div></div>')
    out.append('</div>')
    return ''.join(out)

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

state    = load('state.json', {}) or {}
expanded = load('1-brief-expanded.json', {}) or {}
parsed   = load('1-parsed-brief.json', {}) or load('1-parsed-brief-augmented.json', {}) or {}
if isinstance(parsed, dict) and 'brief' in parsed: parsed = parsed['brief']
tools    = (load('4-orchestrator-tools-used.json', {}) or {}).get('tools') or []
results  = load('4-orchestrator-tool-results.json', []) or []
if isinstance(results, dict): results = results.get('results') or []
res_by_id = {r.get('tool_id'): r for r in results if isinstance(r, dict)}
contract = load('0.5-engineering-contract.json', {}) or {}
req_bom  = state.get('requirementsBom')
cost     = state.get('costStack') or {}

run_name = os.path.basename(run)
pclass = contract.get('product_class') or (state.get('parsedBrief') or {}).get('product_class') or parsed.get('product_class') or 'unknown'

S = []
S.append(f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>{esc(run_name)} — engine run</title><style>
:root{{color-scheme:light}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;margin:0;padding:24px 34px 90px;background:#f6f7f9;color:#1a1d22;line-height:1.5}}
h1{{font-size:24px;font-weight:660;margin:0 0 2px}} .sub{{color:#5b6470;font-size:14px;margin:0 0 8px}}
h2{{font-size:19px;font-weight:640;margin:32px 0 8px;padding-top:10px;border-top:2px solid #e3e6ea}}
h3{{font-size:14px;font-weight:640;margin:16px 0 6px;color:#2c333c}}
.card{{background:#fff;border:1px solid #e3e6ea;border-radius:11px;padding:14px 18px;box-shadow:0 1px 3px rgba(20,25,35,.05);margin:10px 0}}
table{{border-collapse:collapse;font-size:12.5px;width:100%;margin-top:4px}}
td,th{{border:1px solid #e7eaee;padding:4px 9px;text-align:left;vertical-align:top}}
th{{background:#f0f2f5;font-weight:620}} td.n{{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
.grid3{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}}
.imgcard{{background:#fff;border:1px solid #e3e6ea;border-radius:10px;overflow:hidden}}
.imgcard img{{width:100%;display:block;background:#eceef1}} .imgcard .cap{{padding:7px 11px;font-size:12.5px;color:#2c333c;font-weight:560}}
.prov{{font-size:10.5px;color:#7a828d}} code{{background:#eef0f3;padding:1px 5px;border-radius:4px;font-size:11.5px}}
.pill{{display:inline-block;font-size:11px;padding:1px 7px;border-radius:10px;background:#eef0f3;color:#48505a;margin-left:6px}}
.ok{{color:#1d6b3c}} .warn{{color:#8a3a0f}} .g{{color:#1d6b3c}}
details{{margin-top:6px}} summary{{cursor:pointer;font-size:12.5px;color:#48505a}}
.note{{font-size:12px;color:#8a3a0f;background:#fdf3ec;border:1px solid #f0d8c4;border-radius:8px;padding:8px 12px;margin:8px 0}}
.toolhead{{font-size:13.5px}}
</style></head><body>
<h1>{esc(run_name)}</h1>
<p class="sub">Class <b>{esc(pclass)}</b> &nbsp;·&nbsp; brief · tools + results · contract · Blender · 8 engineering documents · bill of materials</p>
""")

# ── 1. EXPANDED BRIEF ────────────────────────────────────────────────────────
S.append('<h2>1 · Expanded brief</h2>')
if expanded:
    S.append('<div class="card">')
    S.append(f"<p><b>Product:</b> <span class='g'>{esc(expanded.get('primary_product'))}</span><br>")
    if expanded.get('product_summary'):
        S.append(f"<b>Summary:</b> {esc(expanded.get('product_summary'))}<br>")
    if expanded.get('construction_materials'):
        S.append(f"<b>Construction materials:</b> {esc(expanded.get('construction_materials'))}</p>")
    else:
        S.append("</p>")
    duties = expanded.get('derived_requirements') or []
    if duties:
        S.append(f"<h3>Quantified engineering duties ({len(duties)}) — the reasoner-derived detailed brief</h3>")
        S.append('<table><tr><th>Duty</th><th>Value</th><th>Unit</th><th>Basis</th><th>Provenance</th></tr>')
        for d in duties:
            S.append(f"<tr><td>{esc(d.get('label'))}</td><td class='n'>{fmtnum(d.get('value'))}</td>"
                     f"<td>{esc(d.get('unit'))}</td><td>{esc(d.get('basis'))}</td>"
                     f"<td class='prov'>{esc(d.get('provenance'))} / {esc(d.get('confidence'))}</td></tr>")
        S.append('</table>')
    conds = expanded.get('operating_conditions') or []
    if conds:
        S.append('<h3>Operating conditions</h3><table><tr><th>Parameter</th><th>Value</th><th>Provenance</th></tr>')
        for c in conds:
            S.append(f"<tr><td>{esc(c.get('key') or c.get('label'))}</td><td>{esc(c.get('value'))}</td><td class='prov'>{esc(c.get('provenance'))}</td></tr>")
        S.append('</table>')
    S.append('</div>')
else:
    S.append('<div class="note">No 1-brief-expanded.json — the brief-expander did not run for this run.</div>')

# ── 2. TOOLS + RESULTS ───────────────────────────────────────────────────────
S.append('<h2>2 · Tools used + their results</h2>')
if tools:
    S.append(f'<p class="sub">{len(tools)} engineering sizing tools selected, wired and run for this design.</p>')
    for t in tools:
        tid = t.get('tool_id')
        r = res_by_id.get(tid) or {}
        ran_ok = r.get('ok')
        status = "<span class='ok'>✓ ran</span>" if ran_ok else ("<span class='warn'>✕ failed</span>" if ran_ok is False else "")
        S.append('<div class="card">')
        S.append(f"<div class='toolhead'><b>{esc(t.get('tool_name') or tid)}</b> <code>{esc(tid)}</code> {status}"
                 f"<span class='pill'>{esc(t.get('tool_license'))}</span></div>")
        claims = t.get('claims')
        if isinstance(claims, str):
            try:
                import ast; claims = ast.literal_eval(claims)
            except Exception: claims = None
        rows = [c for c in (claims or []) if isinstance(c, dict)]
        if rows:
            S.append('<table><tr><th>Computed result</th><th>Value</th><th>Unit</th></tr>')
            for c in rows[:16]:
                lbl = c.get('field') or c.get('label') or c.get('key') or c.get('name')
                S.append(f"<tr><td>{esc(lbl)}</td><td class='n'>{fmtnum(c.get('value'))}</td><td>{esc(c.get('unit'))}</td></tr>")
            S.append('</table>')
        warns = (r.get('warnings') or [])
        if warns:
            S.append(f"<div class='prov warn'>warnings: {esc('; '.join(str(w) for w in warns[:4]))}</div>")
        worked = t.get('worked')
        if isinstance(worked, list) and worked:
            S.append(f"<details><summary>{len(worked)} worked calculation step(s)</summary><table><tr><th>Step</th><th>Formula</th><th>Result</th></tr>")
            for w in worked[:20]:
                if isinstance(w, dict):
                    S.append(f"<tr><td>{esc(w.get('label'))}</td><td><code>{esc(w.get('formula'))}</code></td><td class='n'>{fmtnum(w.get('result'))} {esc(w.get('result_unit'))}</td></tr>")
            S.append('</table></details>')
        S.append('</div>')
else:
    S.append('<div class="note">No 4-orchestrator-tools-used.json found.</div>')

# ── 3. ENGINEERING CONTRACT ──────────────────────────────────────────────────
S.append('<h2>3 · Engineering contract</h2>')
q = contract.get('quantities') if isinstance(contract, dict) else None
topo = contract.get('topology') or []
if isinstance(q, dict) and q:
    S.append(f'<p class="sub">{len(q)} authoritative derived quantities the equipment, drawings and BoM all read from'
             + (f' · {len(topo)} topology connections' if topo else '') + '.</p>')
    S.append('<div class="card"><table><tr><th>Quantity</th><th>Value</th><th>Unit</th><th>Basis</th><th>Source</th></tr>')
    for k, v in q.items():
        if isinstance(v, dict):
            S.append(f"<tr><td>{esc(k)}</td><td class='n'>{fmtnum(v.get('value'))}</td><td>{esc(v.get('unit'))}</td>"
                     f"<td>{esc(v.get('basis'))}</td><td class='prov'>{esc(v.get('source'))}</td></tr>")
        else:
            S.append(f"<tr><td>{esc(k)}</td><td class='n'>{fmtnum(v)}</td><td></td><td></td><td></td></tr>")
    S.append('</table></div>')
else:
    S.append('<div class="note">No 0.5-engineering-contract.json quantities found.</div>')

# ── 4. BLENDER (universal CAD — no Gemini cover, no per-module) ───────────────
S.append('<h2>4 · Blender model (universal CAD)</h2>')
blender = [os.path.join(run, n) for n in
           ['inspect-hero.png', 'inspect-iso.png', 'inspect-top.png', 'inspect-front.png', 'inspect-side.png']
           if os.path.exists(os.path.join(run, n))]
if not blender and os.path.exists(os.path.join(run, 'blender-cover.png')):
    blender = [os.path.join(run, 'blender-cover.png')]
if blender:
    S.append(imgcards(blender, three=True))
else:
    S.append('<div class="note">No universal Blender renders (inspect-*.png) found.</div>')

# ── 5. THE 8 ENGINEERING DOCUMENTS ───────────────────────────────────────────
S.append('<h2>5 · The 8 engineering documents</h2>')
ddir = os.path.join(run, 'drawings')
MAIN = ['pid', 'block-flow-diagram', 'single-line-diagram', 'general-arrangement',
        'hvac-layout', 'process-schedules', 'panel-schedule', 'isometric-index']
main_paths = [os.path.join(ddir, m + '.png') for m in MAIN if os.path.exists(os.path.join(ddir, m + '.png'))]
if main_paths:
    S.append(imgcards(main_paths, three=False))
else:
    S.append('<div class="note">No drawings/ PNGs found.</div>')
isos = sorted(glob.glob(os.path.join(ddir, 'isometric-2*.png')))
if isos:
    S.append(f'<details><summary>Piping isometrics ({len(isos)} sheets)</summary>{imgcards(isos, three=True)}</details>')

# ── 6. BILL OF MATERIALS ─────────────────────────────────────────────────────
S.append('<h2>6 · Parts, connectivity + bill of materials</h2>')
# ── per-part connectivity + GOVERNANCE (DETERMINISTIC) ──
parts_conn, _edges = build_connectivity(run, req_bom, tools)
if parts_conn:
    orphans = [p for p in parts_conn if p['orphan']]
    ungov = [p for p in parts_conn if not p['checks']['governed']]
    def _cells(es, src):
        if not es: return "<span class='warn'>— none —</span>"
        rows = []
        for e in es:
            other = str(e['from'] if src else e['to']).replace('_', ' ')
            arr = '←' if src else '→'
            ln = f"{fmtnum(e['length_m'])} m" if e.get('length_m') is not None else ''
            rate = f" · {esc(e['rating'])}" if e.get('rating') else ''
            warn = '' if e.get('within_spec', True) else " <span class='warn'>⚠ out-of-spec</span>"
            rows.append(f"{arr} {esc(other)} <span class='prov'>[{esc(e['service'])} · {esc(e['size'])} · {ln}{rate}]</span>{warn}")
        return '<br>'.join(rows)
    def _chk(c):
        def m(ok, lbl): return f"<span class='{'ok' if ok else 'warn'}'>{lbl}{'✓' if ok else '✗'}</span>"
        return f"{m(c['governed'], 'tool')} {m(c['connected'], 'conn')} {m(c['priced'], '£')}"
    incomplete = [p for p in parts_conn if p.get('missing')]
    S.append(f'<div class="card"><h3>Parts · connectivity · governance ({len(parts_conn)} parts · '
             f'<span class="warn">{len(incomplete)} missing a required connection</span> · '
             f'<span class="warn">{len(ungov)} with no governing tool</span>)</h3>'
             f'<p class="sub">Every part needs a tool that governs it and the connections its type requires; every connection carries a CALCULATED rating (flow / velocity / current / volt-drop) that sets its size, type and cost. ✗ / "missing" = the loop must call a tool in + route the connection.</p>')
    S.append('<table><tr><th>Part</th><th>What it does</th><th>Governed by</th><th>Incoming</th><th>Outgoing</th><th>Checks</th></tr>')
    for p in sorted(parts_conn, key=lambda x: (not x.get('missing'), x['checks']['governed'], str(x.get('module') or ''))):
        gov = f"<code>{esc(p['governing_tool'])}</code>" if p.get('governing_tool') else "<span class='warn'>✗ none</span>"
        miss = f"<br><span class='warn'>missing: {esc(', '.join(p['missing']))}</span>" if p.get('missing') else ''
        sp = p.get('spec')
        specstr = (f"<br><span class='prov'>⚙ {esc(sp['material'])} · ⌀{sp['diameter_m']}×{sp['height_m']} m · "
                   f"wall {sp['wall_mm']} mm · {sp['mass_kg']:,} kg</span>") if sp else ''
        S.append(f"<tr><td><b>{esc(p['name'])}</b> <span class='prov'>{esc(p.get('tag'))} · {esc(p.get('module'))}</span></td>"
                 f"<td>{esc(p.get('function') or '')}{specstr}</td><td>{gov}</td>"
                 f"<td>{_cells(p['incoming'], True)}</td><td>{_cells(p['outgoing'], False)}</td>"
                 f"<td>{_chk(p['checks'])}{miss}</td></tr>")
    S.append('</table></div>')
if cost:
    S.append('<div class="card"><h3>Cost stack</h3><table><tr><th>Stage</th><th>£</th></tr>')
    for k in ['raw_materials_bom_gbp','assembly_labour_gbp','factory_overhead_gbp','factory_cogs_gbp',
              'manufacturer_margin_gbp','oem_transfer_price_gbp','channel_list_price_gbp',
              'installation_cost_gbp','installed_asp_gbp']:
        if k in cost:
            S.append(f"<tr><td>{esc(k.replace('_gbp','').replace('_',' '))}</td><td class='n'>£{fmtnum(cost[k])}</td></tr>")
    S.append('</table></div>')

if isinstance(req_bom, list) and req_bom:
    equip = [r for r in req_bom if isinstance(r, dict) and not r.get('connection')]
    conns = [r for r in req_bom if isinstance(r, dict) and r.get('connection')]
    if equip:
        COLS = ['tag','requirement','part','qty','unit_gbp','line_gbp','status','basis']
        have = [c for c in COLS if any(c in r for r in equip)]
        tot = sum(float(r.get('line_gbp') or 0) for r in equip)
        S.append(f'<div class="card"><h3>Equipment ({len(equip)} rows · Σ £{tot:,.0f})</h3><table><tr>')
        for c in have: S.append(f"<th>{esc(c.replace('_',' '))}</th>")
        S.append('</tr>')
        for r in equip:
            S.append('<tr>')
            for c in have:
                v = r.get(c)
                cls = " class='n'" if (c in ('qty','unit_gbp','line_gbp') or isinstance(v,(int,float))) else ''
                disp = f"£{fmtnum(v)}" if c in ('unit_gbp','line_gbp') and v not in (None,'') else (fmtnum(v) if isinstance(v,(int,float)) else esc(v))
                S.append(f"<td{cls}>{disp}</td>")
            S.append('</tr>')
        S.append('</table></div>')
    if conns:
        tot = sum(float(r.get('line_gbp') or 0) for r in conns)
        flagged = sum(1 for r in conns if not r.get('within_spec'))
        head = (f'Connections — every input/output link, sized + measured ({len(conns)} runs · Σ £{tot:,.0f}'
                + (f' · <span class="warn">{flagged} out-of-spec → loop re-sizes</span>' if flagged else '') + ')')
        S.append(f'<div class="card"><h3>{head}</h3>')
        S.append('<table><tr><th>Tag</th><th>Service</th><th>From → To</th><th>Size</th><th>Length</th><th>Spec</th><th>£</th></tr>')
        for r in conns:
            spec = "<span class='ok'>✓</span>" if r.get('within_spec') else "<span class='warn'>⚠ review</span>"
            frm_to = esc(str(r.get('requirement','')).split(': ', 1)[-1])
            S.append(f"<tr><td>{esc(r.get('tag'))}</td><td>{esc(r.get('service'))}</td><td>{frm_to}</td>"
                     f"<td>{esc(r.get('size'))}</td><td class='n'>{esc(r.get('length_m'))} m</td>"
                     f"<td>{spec}</td><td class='n'>£{fmtnum(r.get('line_gbp'))}</td></tr>")
        S.append('</table></div>')
else:
    S.append('<div class="note">No requirementsBom rows in state.json.</div>')

S.append('</body></html>')

out_path = os.path.join(run, 'dashboard.html')
with open(out_path, 'w') as f:
    f.write('\n'.join(S))
print('wrote', out_path)
