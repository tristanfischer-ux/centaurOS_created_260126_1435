#!/usr/bin/env python3
"""
build-run-dashboard.py <run_dir>

A SIMPLE HTML view of one engine run (Tristan 2026-06-14: "not interested in the
PDF — I want HTML showing the brief inputs, the tools used, the Blender images,
the 8 engineering documents, and the bill of materials").

Writes <run_dir>/dashboard.html with relative image paths, so opening it shows
everything in place. Reusable for any run directory.
"""
import json, os, sys, html, glob, re

run = sys.argv[1] if len(sys.argv) > 1 else '.'
run = os.path.abspath(run)

def load(name, default=None):
    p = os.path.join(run, name)
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return default

def loadtext(name, default=''):
    try:
        with open(os.path.join(run, name)) as f:
            return f.read()
    except Exception:
        return default

def esc(x):
    return html.escape(str(x)) if x is not None else ''

def fmtnum(v):
    try:
        f = float(v)
        return f"{f:,.0f}" if abs(f) >= 100 else f"{f:,.2f}"
    except Exception:
        return esc(v)

state = load('state.json', {}) or {}
expanded = load('1-brief-expanded.json', {}) or {}
parsed = load('1-parsed-brief.json', {}) or load('1-parsed-brief-augmented.json', {}) or {}
if 'brief' in parsed:   # augmented file wraps under .brief
    parsed = parsed['brief']
tools_doc = load('4-orchestrator-tools-used.json', {}) or {}
req_bom = state.get('requirementsBom')
cost = state.get('costStack') or {}

run_name = os.path.basename(run)
pclass = (state.get('parsedBrief') or state.get('brief') or {}).get('product_class') \
    or parsed.get('product_class') or 'unknown'

S = []  # html chunks
S.append(f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>{esc(run_name)} — engine run</title><style>
:root{{color-scheme:light}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;margin:0;padding:24px 34px 80px;background:#f6f7f9;color:#1a1d22;line-height:1.5}}
h1{{font-size:24px;font-weight:660;margin:0 0 2px}} .sub{{color:#5b6470;font-size:14px;margin:0 0 8px}}
h2{{font-size:19px;font-weight:640;margin:30px 0 8px;padding-top:10px;border-top:2px solid #e3e6ea}}
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
.g{{color:#1d6b3c}} .r{{color:#8a3a0f}} details{{margin-top:6px}} summary{{cursor:pointer;font-size:12.5px;color:#48505a}}
.note{{font-size:12px;color:#8a3a0f;background:#fdf3ec;border:1px solid #f0d8c4;border-radius:8px;padding:8px 12px;margin:8px 0}}
</style></head><body>
<h1>{esc(run_name)}</h1>
<p class="sub">Class <b>{esc(pclass)}</b> · simple HTML view: brief inputs · tools · Blender · 8 engineering documents · bill of materials</p>
""")

# ── 1. BRIEF ─────────────────────────────────────────────────────────────────
S.append('<h2>1 · Brief inputs</h2>')
if expanded:
    S.append('<div class="card">')
    S.append(f"<h3>What it is (reasoner-derived detailed brief)</h3>")
    S.append(f"<p><b>Product:</b> <span class='g'>{esc(expanded.get('primary_product'))}</span><br>")
    S.append(f"<b>Summary:</b> {esc(expanded.get('product_summary'))}<br>")
    S.append(f"<b>Construction materials:</b> {esc(expanded.get('construction_materials'))}</p>")
    duties = expanded.get('derived_requirements') or []
    if duties:
        S.append(f"<h3>Quantified engineering duties ({len(duties)})</h3>")
        S.append('<table><tr><th>Duty</th><th>Value</th><th>Unit</th><th>Basis</th><th>Source</th></tr>')
        for d in duties:
            S.append(f"<tr><td>{esc(d.get('label'))}</td><td class='n'>{fmtnum(d.get('value'))}</td>"
                     f"<td>{esc(d.get('unit'))}</td><td>{esc(d.get('basis'))}</td>"
                     f"<td class='prov'>{esc(d.get('provenance'))}/{esc(d.get('confidence'))}</td></tr>")
        S.append('</table>')
    conds = expanded.get('operating_conditions') or []
    if conds:
        S.append('<h3>Operating conditions</h3><table><tr><th>Parameter</th><th>Value</th><th>Source</th></tr>')
        for c in conds:
            S.append(f"<tr><td>{esc(c.get('key'))}</td><td>{esc(c.get('value'))}</td><td class='prov'>{esc(c.get('provenance'))}</td></tr>")
        S.append('</table>')
    S.append('</div>')
else:
    S.append('<div class="note">No 1-brief-expanded.json (U6 brief-expander did not run for this run).</div>')

# stated metrics + constraints (the raw brief inputs)
con = parsed.get('constraints') or {}
metrics = (con.get('target_performance') or {}).get('metrics') or []
addl = con.get('additional_constraints') or []
if metrics or addl:
    S.append('<div class="card"><h3>Stated brief inputs (from the founder text)</h3>')
    if metrics:
        S.append('<table><tr><th>Metric</th><th>Value</th><th>Unit</th><th>Category</th></tr>')
        for m in metrics:
            S.append(f"<tr><td>{esc(m.get('key_metric'))}</td><td class='n'>{fmtnum(m.get('value'))}</td><td>{esc(m.get('unit'))}</td><td class='prov'>{esc(m.get('category'))}</td></tr>")
        S.append('</table>')
    if addl:
        S.append('<h3>Additional constraints</h3><ul style="font-size:12.5px;margin:4px 0">')
        for a in addl:
            S.append(f"<li>{esc(a.get('description'))}</li>")
        S.append('</ul>')
    S.append('</div>')

raw = loadtext('0-original-brief.md')
if raw:
    S.append(f'<details><summary>Raw brief text ({len(raw)} chars)</summary><div class="card"><pre style="white-space:pre-wrap;font-size:12px">{esc(raw)}</pre></div></details>')

# ── 2. TOOLS ─────────────────────────────────────────────────────────────────
S.append('<h2>2 · Tools used</h2>')
tools = tools_doc.get('tools') or []
if tools:
    S.append(f'<p class="sub">{len(tools)} engineering tools selected + run for this design.</p>')
    for t in tools:
        S.append('<div class="card">')
        S.append(f"<b>{esc(t.get('tool_name'))}</b> <code>{esc(t.get('tool_id'))}</code>"
                 f"<span class='pill'>{esc(t.get('tool_license'))}</span></p>")
        claims = t.get('claims')
        if isinstance(claims, str):
            try:
                import ast
                claims = ast.literal_eval(claims)
            except Exception:
                claims = None
        if isinstance(claims, list) and claims:
            S.append('<table><tr><th>Computed field</th><th>Value</th><th>Unit</th></tr>')
            for c in claims[:12]:
                if isinstance(c, dict):
                    S.append(f"<tr><td>{esc(c.get('field'))}</td><td class='n'>{fmtnum(c.get('value'))}</td><td>{esc(c.get('unit'))}</td></tr>")
            S.append('</table>')
        S.append('</div>')
else:
    S.append('<div class="note">No tools-used file found.</div>')

# ── 3. BLENDER ───────────────────────────────────────────────────────────────
S.append('<h2>3 · Blender model</h2>')
top_imgs = sorted(glob.glob(os.path.join(run, '*.png')))
hero = [p for p in top_imgs if re.search(r'(hero|cover)', os.path.basename(p))]
mods = [p for p in top_imgs if os.path.basename(p).startswith('module-')]
others = [p for p in top_imgs if p not in hero and p not in mods]
def imgcards(paths):
    out = ['<div class="grid3">']
    for p in paths:
        rel = os.path.relpath(p, run)
        out.append(f'<div class="imgcard"><img src="{esc(rel)}"><div class="cap">{esc(os.path.basename(p))}</div></div>')
    out.append('</div>')
    return ''.join(out)
if hero: S.append(imgcards(hero))
if others: S.append(imgcards(others))
if mods:
    S.append('<h3>Per-module renders</h3>')
    S.append(imgcards(mods))
if not top_imgs:
    S.append('<div class="note">No Blender PNGs at the run top level.</div>')

# ── 4. 8 ENGINEERING DOCUMENTS ───────────────────────────────────────────────
S.append('<h2>4 · The 8 engineering documents</h2>')
ddir = os.path.join(run, 'drawings')
MAIN = ['pid', 'block-flow-diagram', 'single-line-diagram', 'general-arrangement',
        'hvac-layout', 'process-schedules', 'panel-schedule', 'isometric-index']
main_paths = [os.path.join(ddir, m + '.png') for m in MAIN if os.path.exists(os.path.join(ddir, m + '.png'))]
if main_paths:
    out = ['<div class="grid">']
    for p in main_paths:
        rel = os.path.relpath(p, run)
        out.append(f'<div class="imgcard"><img src="{esc(rel)}"><div class="cap">{esc(os.path.basename(p).replace(".png",""))}</div></div>')
    out.append('</div>')
    S.append(''.join(out))
isos = sorted(glob.glob(os.path.join(ddir, 'isometric-2*.png')))
if isos:
    S.append(f'<details><summary>Piping isometrics ({len(isos)} sheets)</summary>{imgcards(isos)}</details>')
if not main_paths:
    S.append('<div class="note">No drawings/ PNGs found.</div>')

# ── 5. BILL OF MATERIALS ─────────────────────────────────────────────────────
S.append('<h2>5 · Bill of materials</h2>')
if cost:
    rm = cost.get('raw_materials_bom_gbp'); asp = cost.get('installed_asp_gbp')
    S.append('<div class="card"><h3>Cost stack</h3><table><tr><th>Stage</th><th>£</th></tr>')
    for k in ['raw_materials_bom_gbp','assembly_labour_gbp','factory_overhead_gbp','factory_cogs_gbp',
              'manufacturer_margin_gbp','oem_transfer_price_gbp','channel_list_price_gbp',
              'installation_cost_gbp','installed_asp_gbp']:
        if k in cost:
            S.append(f"<tr><td>{esc(k.replace('_gbp','').replace('_',' '))}</td><td class='n'>£{fmtnum(cost[k])}</td></tr>")
    S.append('</table></div>')

if isinstance(req_bom, list) and req_bom:
    cols = []
    for r in req_bom:
        if isinstance(r, dict):
            for k in r.keys():
                if k not in cols: cols.append(k)
    cols = [c for c in cols if c in ('requirement','fulfilment','fulfilment_name','part','component','quantity','qty','unit','unit_cost_gbp','total_gbp','cost_gbp','basis','classification')] or cols[:7]
    S.append(f'<div class="card"><h3>Requirements-driven BoM ({len(req_bom)} rows)</h3><table><tr>')
    for c in cols: S.append(f"<th>{esc(c.replace('_',' '))}</th>")
    S.append('</tr>')
    for r in req_bom[:80]:
        if not isinstance(r, dict): continue
        S.append('<tr>')
        for c in cols:
            v = r.get(c)
            cls = " class='n'" if isinstance(v,(int,float)) else ''
            S.append(f"<td{cls}>{fmtnum(v) if isinstance(v,(int,float)) else esc(v)}</td>")
        S.append('</tr>')
    S.append('</table></div>')

audit = loadtext('AUDIT-BOM.md')
if audit:
    S.append(f'<details><summary>BoM audit (module subtotals + cover reconciliation)</summary><div class="card"><pre style="white-space:pre-wrap;font-size:11.5px">{esc(audit)}</pre></div></details>')

S.append('</body></html>')

out_path = os.path.join(run, 'dashboard.html')
with open(out_path, 'w') as f:
    f.write('\n'.join(S))
print('wrote', out_path)
