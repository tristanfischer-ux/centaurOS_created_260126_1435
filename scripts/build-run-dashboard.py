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

from component_engineering import build_connectivity, system_balances
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
S.append('<h2>System balances · holistic resource accounting</h2>')
bals = system_balances(contract.get('quantities') if isinstance(contract, dict) else {})
if bals:
    S.append('<p class="sub">Across the WHOLE system — what goes in vs what is consumed / out, with the closure where derivable. This is how the plant is tracked as one system, not a pile of parts.</p>')
    S.append('<div class="grid">')
    for nm, items, note in bals:
        S.append(f'<div class="card"><h3>{esc(nm)}</h3><table><tr><th>Quantity</th><th>Value</th><th>Unit</th></tr>')
        for k, v, u in items:
            S.append(f"<tr><td>{esc(k.replace('_', ' '))}</td><td class='n'>{fmtnum(v)}</td><td>{esc(u)}</td></tr>")
        S.append(f"</table><p class='prov'><b>Closure:</b> {esc(note)}</p></div>")
    S.append('</div>')
else:
    S.append('<div class="note">No contract quantities for system balances.</div>')

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
        specstr = (f"<br><span class='prov'>⚙ <b>{esc(sp.get('type'))}</b> · {esc(sp.get('material'))} · {esc(sp.get('summary'))}</span>") if sp else ''
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
        COLS = ['tag', 'requirement', 'material', 'diameter_m', 'height_m', 'wall_mm', 'mass_kg',
                'part', 'qty', 'unit_gbp', 'line_gbp', 'status', 'basis']
        have = [c for c in COLS if any(c in r for r in equip)]
        UNIT = {'diameter_m': ' m', 'height_m': ' m', 'wall_mm': ' mm', 'mass_kg': ' kg'}
        NUMC = ('qty', 'unit_gbp', 'line_gbp', 'wall_mm', 'mass_kg', 'diameter_m', 'height_m')
        tot = sum(float(r.get('line_gbp') or 0) for r in equip)
        S.append(f'<div class="card"><h3>Equipment ({len(equip)} rows · Σ £{tot:,.0f}) — material · dimensions · wall · mass + the calculation per line</h3><table><tr>')
        for c in have:
            _hdr = {'diameter_m': '⌀ (m)', 'height_m': 'height (m)', 'wall_mm': 'wall (mm)', 'mass_kg': 'mass (kg)'}
            S.append(f"<th>{esc(_hdr.get(c, c.replace('_', ' ')))}</th>")
        S.append('</tr>')
        for r in equip:
            S.append('<tr>')
            for c in have:
                v = r.get(c)
                cls = " class='n'" if (c in NUMC or isinstance(v, (int, float))) else ''
                if c in ('unit_gbp', 'line_gbp') and v not in (None, ''):
                    disp = f"£{fmtnum(v)}"
                elif c in UNIT and isinstance(v, (int, float)):
                    disp = f"{fmtnum(v)}{UNIT[c]}"
                elif isinstance(v, (int, float)):
                    disp = fmtnum(v)
                else:
                    disp = esc(v)
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
