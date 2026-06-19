#!/usr/bin/env python3
"""
render_ledger_html.py — render THE LEDGER as a full standalone HTML page you can
open and read: every part (principal equipment + its sub-components + every
pipe/cable/sensor connection), with cost, status, basis, inputs/outputs (named
connected part + via-element) and the coverage matrix (Blender + the 8 drawings).

Tristan 2026-06-16: "I want the full htmls with everything in them. I explicitly
want to see the entire ledger with all the parts in it." (No PDFs.)

SPINE = state.requirementsBom (the authoritative BoM — principal + sub-components +
connections). Coverage + inputs/outputs are enriched from parts-ledger.json (the
deterministic coverage matrix) when present, joined by equipment_tag.

USAGE: python3 render_ledger_html.py <out_dir> [state.json]
OUTPUT: <out_dir>/parts-ledger.html  (light mode, printable)
"""
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

REPS = ["blender", "general-arrangement", "pid", "single-line-diagram", "panel-schedule",
        "block-flow-diagram", "process-schedules", "isometric-index"]
SHORT = {"blender": "3D", "general-arrangement": "GA", "pid": "P&ID", "single-line-diagram": "SLD",
         "panel-schedule": "PNL", "block-flow-diagram": "BFD", "process-schedules": "SCH",
         "isometric-index": "ISO"}


def _esc(s):
    return html.escape(str(s if s is not None else ""))


def _gbp(v):
    try:
        return f"£{float(v):,.0f}"
    except Exception:
        return "—"


def _is_connection(r):
    return (r.get("status") == "ROUTED" or bool(re.fullmatch(r"C\d+", str(r.get("tag", ""))))
            or str(r.get("basis", "")).startswith(("pipe ", "cable ", "gas ")))


def main():
    if len(sys.argv) < 2:
        print("usage: render_ledger_html.py <out_dir> [state.json]", file=sys.stderr)
        return 2
    out_dir = Path(sys.argv[1]).resolve()
    state_path = Path(sys.argv[2]) if len(sys.argv) > 2 else out_dir / "state.json"
    state = json.loads(state_path.read_text())
    rb = state.get("requirementsBom") or []
    try:
        ledger = json.loads((out_dir / "parts-ledger.json").read_text())
    except Exception:
        ledger = {}
    cov_by_tag = {e["tag"]: e for e in ledger.get("equipment", [])}

    # split the BoM
    subs_by_parent = {}
    for r in rb:
        if r.get("status") == "SUB-COMPONENT" and r.get("sub_of"):
            subs_by_parent.setdefault(str(r["sub_of"]), []).append(r)
    principals = [r for r in rb if r.get("status") != "SUB-COMPONENT" and not _is_connection(r)]
    connections = [r for r in rb if _is_connection(r) and r.get("status") != "SUB-COMPONENT"]
    grand = sum((r.get("line_gbp") or 0) for r in rb)
    equip_total = sum((r.get("line_gbp") or 0) for r in principals)
    conn_total = sum((r.get("line_gbp") or 0) for r in connections)

    klass = (ledger.get("product_class")
             or (((state.get("parsedBrief") or {}).get("product_class")) or "")
             or (((state.get("moduleDecomposition") or {}).get("product_class")) or "")
             or (((state.get("orchestratorContract") or {}).get("product_class")) or "")).lower()

    def cov_cells(tag):
        e = cov_by_tag.get(tag)
        if not e:
            return "".join('<td class="c-na">·</td>' for _ in REPS)
        out = []
        for k in REPS:
            if e["coverage"].get(k):
                out.append('<td class="c-y">✓</td>')
            elif k in e.get("expected", []):
                out.append('<td class="c-n">✗</td>')
            else:
                out.append('<td class="c-na">·</td>')
        return "".join(out)

    # ── build rows ──
    erows = []
    for r in principals:
        tag = str(r.get("tag", ""))
        req = str(r.get("requirement", ""))
        name = req.split("·")[0].strip() or tag
        spec = " · ".join(p.strip() for p in req.split("·")[1:]) if "·" in req else ""
        e = cov_by_tag.get(tag, {})
        typ = e.get("type", "")
        ins = e.get("inputs") or []
        outs = e.get("outputs") or []
        io = ""
        if ins or outs:
            io = ("".join(f'<div class="io in">◀ {_esc(x)}</div>' for x in ins)
                  + "".join(f'<div class="io out">▶ {_esc(x)}</div>' for x in outs))
        if not ins:
            io = '<div class="io" style="color:#b23b1e;font-weight:600;">⚠ no input</div>' + io
        if not outs:
            io = io + '<div class="io" style="color:#b23b1e;font-weight:600;">⚠ no output</div>'
        status = r.get("status", "")
        scls = {"IDENTIFIED": "s-ok", "BESPOKE": "s-bes", "NOT FOUND": "s-nf"}.get(status, "s-oth")
        erows.append(f'''<tr class="eq">
  <td class="tag">{_esc(tag)}</td>
  <td class="nm"><b>{_esc(name)}</b>{f'<div class="spec">{_esc(spec)}</div>' if spec else ''}</td>
  <td class="ty">{_esc(typ)}</td>
  <td class="num">{_esc(r.get("qty") or 1)}</td>
  <td class="num">{_gbp(r.get("unit_gbp"))}</td>
  <td class="num lt"><b>{_gbp(r.get("line_gbp"))}</b></td>
  <td><span class="status {scls}">{_esc(status)}</span></td>
  <td class="part">{_esc(r.get("part") or "")}<div class="basis">{_esc((r.get("basis") or "")[:140])}</div></td>
  <td class="iocell">{io}</td>
  {cov_cells(tag)}
</tr>''')
        # sub-components
        for s in subs_by_parent.get(tag, []):
            sreq = str(s.get("requirement", "")).replace("↳", "").strip()
            erows.append(f'''<tr class="sub">
  <td class="tag">{_esc(s.get("tag",""))}</td>
  <td class="nm sub-nm">↳ {_esc(sreq)}</td>
  <td class="ty"></td><td class="num">{_esc(s.get("qty") or 1)}</td>
  <td class="num">{_gbp(s.get("unit_gbp"))}</td>
  <td class="num lt">{_gbp(s.get("breakdown_gbp") or s.get("line_gbp"))}</td>
  <td colspan="{3+len(REPS)}" class="basis">{_esc((s.get("basis") or "")[:120])}</td>
</tr>''')

    crows = []
    for r in connections:
        crows.append(f'''<tr>
  <td class="tag">{_esc(r.get("tag",""))}</td>
  <td>{_esc(str(r.get("requirement",""))[:90])}</td>
  <td class="num">{_esc(r.get("qty") or 1)}</td>
  <td class="num lt">{_gbp(r.get("line_gbp"))}</td>
  <td class="basis">{_esc((r.get("basis") or "")[:150])}</td>
</tr>''')

    covsum = ""
    if ledger.get("coverage_by_drawing"):
        cells = []
        for k in REPS:
            d = ledger["coverage_by_drawing"].get(k, {})
            if d.get("expected"):
                cells.append(f'<span class="pill">{SHORT[k]} {d["present"]}/{d["expected"]} '
                             f'({d.get("pct")}%)</span>')
        covsum = "".join(cells)

    head_cov = "".join(f'<th class="cov">{SHORT[k]}</th>' for k in REPS)

    # Build a descriptive title with date/time, project class, and loop iteration
    from datetime import datetime as _dt
    _gen_dt = _dt.now().strftime("%Y-%m-%d %H:%M")
    _loop_iter = ""
    try:
        _hist_path = out_dir / "quality-loop-history.json"
        if _hist_path.exists():
            _hist = json.loads(_hist_path.read_text())
            _iters = sorted(set(h.get("iteration", 0) for h in _hist)) if _hist else [0]
            _loop_iter = f" · loop {_iters[-1] + 1}" if _iters else " · loop 1"
    except Exception:
        pass
    _page_title = f"{klass.upper() if klass else 'UNKNOWN'} — {_gen_dt}{_loop_iter}"

    doc = f'''<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<title>Parts Ledger — {_esc(_page_title)}</title>
<style>
  :root {{ color-scheme: light; }}
  body {{ font: 13px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
          color:#1a1f29; background:#f6f7f9; margin:0; padding:28px 32px; }}
  h1 {{ font-size:21px; margin:0 0 4px; }} h2 {{ font-size:16px; margin:30px 0 10px; }}
  .muted {{ color:#5b6472; }}
  .summary {{ display:flex; gap:26px; flex-wrap:wrap; margin:14px 0 8px;
              background:#fff; border:1px solid #e2e6ec; border-radius:10px; padding:14px 18px; }}
  .summary .k {{ font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:#6b7280; }}
  .summary .v {{ font-size:19px; font-weight:700; }}
  .pill {{ display:inline-block; background:#eef1f5; border:1px solid #dde2e9; border-radius:20px;
           padding:2px 9px; margin:2px 4px 2px 0; font-size:11px; color:#3a4250; }}
  table {{ border-collapse:collapse; width:100%; background:#fff; border:1px solid #e2e6ec;
           border-radius:10px; overflow:hidden; font-size:12px; }}
  th {{ background:#eef1f5; text-align:left; padding:7px 9px; font-size:11px; position:sticky;
        top:0; border-bottom:1px solid #dde2e9; white-space:nowrap; }}
  th.cov {{ text-align:center; width:30px; }}
  td {{ padding:6px 9px; border-bottom:1px solid #eef0f3; vertical-align:top; }}
  tr.eq td {{ border-top:1px solid #e7eaef; }}
  tr.sub td {{ background:#fafbfc; color:#5b6472; }}
  .sub-nm {{ padding-left:18px; }}
  .tag {{ font-family:ui-monospace,Menlo,monospace; font-size:11px; color:#2563a6; white-space:nowrap; }}
  .num {{ text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }}
  .lt {{ font-variant-numeric:tabular-nums; }}
  .ty {{ color:#6b7280; font-size:11px; }}
  .spec {{ color:#7a828f; font-size:11px; }}
  .basis {{ color:#8a909c; font-size:10.5px; }}
  .part {{ max-width:230px; }}
  .iocell {{ max-width:300px; }}
  .io {{ font-size:10.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:300px; }}
  .io.in {{ color:#1f7a4d; }} .io.out {{ color:#b4690e; }}
  .status {{ font-size:10px; padding:1px 6px; border-radius:10px; white-space:nowrap; }}
  .s-ok {{ background:#e3f4ea; color:#1f7a4d; }} .s-bes {{ background:#e8eefb; color:#2b5bb5; }}
  .s-nf {{ background:#fdece8; color:#b23b1e; }} .s-oth {{ background:#eef1f5; color:#5b6472; }}
  td.c-y {{ text-align:center; color:#1f9d57; font-weight:700; }}
  td.c-n {{ text-align:center; color:#d23b1e; font-weight:700; }}
  td.c-na {{ text-align:center; color:#c2c8d0; }}
</style></head><body>
<h1>Parts Ledger — {_esc(_page_title)}</h1>
<div class="muted">{_esc(_page_title)} · run <code>{_esc(out_dir.name)}</code> · the single source of truth (BoM + connectivity + coverage). Coverage ✓ = present in that view, ✗ = expected but missing, · = not expected there.</div>
<div class="summary">
  <div><div class="k">Grand total (raw materials)</div><div class="v">{_gbp(grand)}</div></div>
  <div><div class="k">Principal equipment</div><div class="v">{len(principals)} · {_gbp(equip_total)}</div></div>
  <div><div class="k">Connections (pipes/wires)</div><div class="v">{len(connections)} · {_gbp(conn_total)}</div></div>
  <div><div class="k">Sub-components</div><div class="v">{sum(len(v) for v in subs_by_parent.values())}</div></div>
  <div><div class="k">Total BoM lines</div><div class="v">{len(rb)}</div></div>
</div>
<div style="margin:6px 0 2px;"><b>Coverage by view (part present / expected):</b> {covsum}</div>
'''

    # ── Connectivity audit section (type-aware) ───────────────────────────────
    conn = ledger.get("connectivity") or {}
    concerns = conn.get("concerns") or []
    n_concerns = len(concerns)
    n_origins = len(conn.get("origins") or [])
    n_sinks = len(conn.get("sinks") or [])
    n_proc = conn.get("n_process_total", 0)
    n_proc_ok = conn.get("n_process_connected", 0)
    n_inst = conn.get("n_instrument_total", 0)
    n_inst_ok = conn.get("n_instrument_associated", 0)
    if conn:
        proc_pct = round(100 * n_proc_ok / n_proc, 1) if n_proc else 0
        inst_pct = round(100 * n_inst_ok / n_inst, 1) if n_inst else 0
        concern_bg = "#fdece8;color:#b23b1e" if n_concerns else "#e3f4ea;color:#1f7a4d"
        doc += f'''<div style="margin:14px 0 6px;background:#fff;border:1px solid #e2e6ec;border-radius:10px;padding:12px 18px;">
<h2 style="margin:0 0 6px;">Connectivity audit</h2>
<div class="muted" style="margin-bottom:8px;">Every process part (vessel, pump, exchanger, valve) needs an upstream input AND a downstream output. Instruments need at least one connection. Origins (grid, water, feed) and sinks (drains, waste) are exempt. Structural elements are never flagged.</div>
<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:6px;">
  <span class="pill" style="background:#e3f4ea;color:#1f7a4d;">✓ {n_origins} origin(s)</span>
  <span class="pill" style="background:#e8eefb;color:#2b5bb5;">✓ {n_sinks} sink(s)</span>
  <span class="pill" style="background:{concern_bg};">{"⚠" if n_concerns else "✓"} {n_concerns} concern(s)</span>
  <span class="pill" style="background:#eef1f5;color:#3a4250;">process {n_proc_ok}/{n_proc} ({proc_pct}%)</span>
  <span class="pill" style="background:#eef1f5;color:#3a4250;">instruments {n_inst_ok}/{n_inst} ({inst_pct}%)</span>
</div>
'''
        if concerns:
            doc += '<table style="margin:6px 0 10px;font-size:11.5px;"><thead><tr><th>Tag</th><th>Item</th><th>Type</th><th>Issue</th><th>Detail</th></tr></thead><tbody>'
            for c in concerns:
                doc += f'<tr><td class="tag">{_esc(c.get("tag",""))}</td><td>{_esc(c.get("name",""))}</td><td class="ty">{_esc(c.get("type",""))}</td><td style="color:#b23b1e;font-weight:600;">{_esc(c.get("issue","").replace("_"," "))}</td><td class="basis">{_esc(c.get("detail",""))}</td></tr>'
            doc += '</tbody></table>'
        else:
            doc += '<div class="muted" style="margin:6px 0;">No connectivity concerns — all process equipment has both input and output, all instruments are associated.</div>'
        origins = conn.get("origins") or []
        sinks = conn.get("sinks") or []
        if origins:
            doc += '<div style="margin:6px 0 4px;"><b style="color:#1f7a4d;">Origins:</b> ' + ", ".join(_esc(o.get("name","?")) for o in origins) + '</div>'
        if sinks:
            doc += '<div style="margin:6px 0 4px;"><b style="color:#2b5bb5;">Sinks:</b> ' + ", ".join(_esc(s.get("name","?")) for s in sinks) + '</div>'
        doc += '</div>'

    doc += f'''
<h2>Principal equipment + sub-components ({len(principals)})</h2>
<table>
<thead><tr><th>Tag</th><th>Item</th><th>Type</th><th>Qty</th><th>Unit</th><th>Line £</th>
<th>Status</th><th>Catalogue part / basis</th><th>Inputs ◀ / Outputs ▶ (part · via)</th>{head_cov}</tr></thead>
<tbody>
{''.join(erows)}
</tbody></table>

<h2>Connections — pipes, cables, sensor ties ({len(connections)})</h2>
<table>
<thead><tr><th>Tag</th><th>Run</th><th>Qty</th><th>Line £</th><th>Basis</th></tr></thead>
<tbody>
{''.join(crows)}
</tbody></table>
<p class="muted" style="margin-top:24px;">Derived deterministically from state.requirementsBom + parts-ledger.json every run — never hand-maintained. {len(rb)} lines · {_gbp(grand)}.</p>
</body></html>'''

    out = out_dir / "parts-ledger.html"
    out.write_text(doc)
    print(f"wrote {out}  ({len(principals)} equipment + {len(connections)} connections + "
          f"{sum(len(v) for v in subs_by_parent.values())} sub-components = {len(rb)} lines, {_gbp(grand)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
