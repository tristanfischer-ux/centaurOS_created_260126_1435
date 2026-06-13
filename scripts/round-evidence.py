#!/usr/bin/env python3
"""round-evidence.py — per-round accountability page for the recursive-improvement loop.

For each loop round, assemble ONE self-contained HTML showing the real deterministic
engine outputs so Tristan can SEE the work, not trust a text claim:
  • the Blender 3D model render
  • all 8 engineering drawings (GA, single-line, P&ID, process schedules, panel
    schedule, HVAC, piping isometrics, block-flow diagram)
  • the FULL bill of materials (every line, qty, unit £, line £) + the cost stack
  • the harsh scorecard for the round

Images are base64-embedded so the page is self-contained + persists even if the run
dir is later cleaned. Light theme only.

Usage: python3 round-evidence.py <out_dir> <round_num> <archetype_label> [score_json]
       score_json e.g. '{"sizing":7,"bom_complete":4,"part_scale":3,"floor":4}'
"""
from __future__ import annotations
import base64, json, sys
from pathlib import Path


def _img_data_uri(p: Path) -> str | None:
    if not p.exists() or p.stat().st_size < 200:
        return None
    b = base64.b64encode(p.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{b}"


def _find_blender(d: Path) -> Path | None:
    for name in ("inspect-hero.png", "00-hero.png", "blender-cover.png", "cover.png", "inspect-iso.png"):
        if (d / name).exists():
            return d / name
    return None


DRAWINGS = [
    ("General Arrangement", "general-arrangement.png"),
    ("Single-Line Electrical", "single-line-diagram.png"),
    ("Piping & Instrumentation (P&ID)", "pid.png"),
    ("Process Schedules", "process-schedules.png"),
    ("Panel / Load Schedule", "panel-schedule.png"),
    ("HVAC Duct Layout", "hvac-layout.png"),
    ("Piping Isometrics", "isometric-index.png"),
    ("Block-Flow Diagram", "block-flow-diagram.png"),
]


def _gbp(v) -> str:
    try:
        v = float(v)
    except Exception:
        return "—"
    return f"£{round(v):,}"


def extract_bom(state: dict) -> tuple[list[dict], float]:
    # price map: word_id -> unit price (anchored / corrected / estimate)
    price = {}
    for v in (state.get("partVerifications") or []):
        wid = str(v.get("word_id") or "")
        p = v.get("cost_repair_corrected_price_gbp")
        if not (isinstance(p, (int, float)) and p > 0):
            p = v.get("price_estimate_gbp")
        if not (isinstance(p, (int, float)) and p > 0):
            p = v.get("distributor_price_gbp")
        if wid and isinstance(p, (int, float)) and p > 0:
            price[wid] = float(p)
    # components rolled into a parent assembly are excluded from the grand total
    excluded = {str(v.get("word_id") or "") for v in (state.get("partVerifications") or [])
                if v.get("cost_repair_excluded_from_subtotal")}
    rows = []
    total = 0.0
    for m in ((state.get("moduleDecomposition") or {}).get("modules") or []):
        mod_name = m.get("name") or m.get("module_id") or ""
        for sm in (m.get("sub_modules") or []):
            for w in (sm.get("words") or []):
                wid = str(w.get("id") or "")
                mods = {mm.get("kind"): mm.get("value") for mm in (w.get("modifier_characters") or [])}
                qy = 1
                qraw = mods.get("quantity")
                if qraw:
                    import re
                    mt = re.search(r"\d+", str(qraw))
                    if mt:
                        qy = int(mt.group(0))
                unit = price.get(wid, 0.0)
                line = unit * qy
                if wid not in excluded:
                    total += line
                rows.append({
                    "module": mod_name,
                    "name": w.get("name_human") or "",
                    "mpn": mods.get("part_number") or "",
                    "mfr": mods.get("manufacturer") or "",
                    "qty": qy,
                    "unit": unit,
                    "line": line,
                })
    return rows, total


def build(out_dir: str, rnd: str, label: str, score: dict) -> str:
    d = Path(out_dir)
    state = json.loads((d / "state.json").read_text()) if (d / "state.json").exists() else {}
    cs = state.get("costStack") or {}
    rows, bom_total = extract_bom(state)

    blender = _find_blender(d)
    blender_uri = _img_data_uri(blender) if blender else None

    draw_html = ""
    present = 0
    for title, fn in DRAWINGS:
        uri = _img_data_uri(d / "drawings" / fn)
        if uri:
            present += 1
            draw_html += f'<figure><figcaption>{title}</figcaption><a href="{uri}" target="_blank"><img src="{uri}"></a></figure>'
        else:
            draw_html += f'<figure class="missing"><figcaption>{title}</figcaption><div class="ph">not generated</div></figure>'

    sc = "".join(
        f'<tr><td>{k}</td><td class="n {("hi" if isinstance(v,(int,float)) and v>=8 else "lo" if isinstance(v,(int,float)) and v<6 else "mid")}">{v}</td></tr>'
        for k, v in score.items()
    )

    bom_rows = "".join(
        f'<tr><td>{r["module"][:28]}</td><td>{r["name"][:46]}</td><td class="sm">{r["mfr"][:18]} {r["mpn"][:16]}</td>'
        f'<td class="n">×{r["qty"]}</td><td class="n">{_gbp(r["unit"]) if r["unit"] else "—"}</td><td class="n">{_gbp(r["line"]) if r["line"] else "—"}</td></tr>'
        for r in rows
    )

    return f"""<!doctype html><html><head><meta charset="utf-8">
<title>Round {rnd} — {label}</title>
<style>
 body{{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;background:#fff;max-width:1180px;margin:28px auto;padding:0 22px;line-height:1.5}}
 h1{{font-size:23px;margin-bottom:2px}} h2{{font-size:15px;margin-top:30px;border-bottom:1px solid #e3e8ee;padding-bottom:5px;color:#333}}
 .sub{{color:#666;font-size:13px;margin-top:0}}
 .cards{{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}}
 .card{{background:#f6f8fa;border:1px solid #e3e8ee;border-radius:8px;padding:12px 16px;min-width:150px}}
 .card .v{{font-size:22px;font-weight:700}} .card .k{{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.04em}}
 table{{border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0}}
 th,td{{text-align:left;padding:5px 9px;border-bottom:1px solid #eee}} th{{color:#888;font-size:11px;text-transform:uppercase}}
 td.n{{text-align:right;font-variant-numeric:tabular-nums}} td.sm{{color:#888;font-size:11px}}
 .hi{{color:#0a7a33;font-weight:700}} .lo{{color:#c0392b;font-weight:700}} .mid{{color:#a60;font-weight:700}}
 .score{{max-width:320px}}
 .blender img{{width:100%;border:1px solid #e3e8ee;border-radius:8px}}
 .grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
 figure{{margin:0}} figcaption{{font-size:12px;font-weight:600;color:#333;margin-bottom:5px}}
 figure img{{width:100%;border:1px solid #e3e8ee;border-radius:6px;background:#fff}}
 figure.missing .ph{{height:140px;display:flex;align-items:center;justify-content:center;color:#c0392b;background:#fff5f5;border:1px dashed #f0b0b0;border-radius:6px;font-size:13px}}
 .bomtot{{font-weight:700}} .note{{color:#777;font-size:11px}}
</style></head><body>
<h1>Round {rnd} — {label}</h1>
<p class="sub">Deterministic engine → Blender → bill of materials · {present}/8 drawings · generated from <code>{out_dir}</code></p>

<div class="cards">
 <div class="card"><div class="k">Installed cost</div><div class="v">{_gbp(cs.get('installed_asp_gbp'))}</div></div>
 <div class="card"><div class="k">Raw materials BoM</div><div class="v">{_gbp(cs.get('raw_materials_bom_gbp'))}</div></div>
 <div class="card"><div class="k">BoM lines</div><div class="v">{len(rows)}</div></div>
 <div class="card"><div class="k">Floor score</div><div class="v {('hi' if score.get('floor',0)>=8 else 'lo' if score.get('floor',0)<6 else 'mid')}">{score.get('floor','—')}/10</div></div>
</div>

<h2>Harsh scorecard (the 20-year-engineer test — the score is the FLOOR)</h2>
<table class="score">{sc}</table>

<h2>Blender 3D model</h2>
<div class="blender">{f'<img src="{blender_uri}">' if blender_uri else '<p class="lo">no Blender render found in this run</p>'}</div>

<h2>The 8 engineering drawings</h2>
<div class="grid">{draw_html}</div>

<h2>Full bill of materials ({len(rows)} lines · Σ {_gbp(bom_total)})</h2>
<table>
<tr><th>Module</th><th>Item</th><th>Mfr / part</th><th>Qty</th><th>Unit</th><th>Line</th></tr>
{bom_rows}
<tr class="bomtot"><td colspan="5">Bill-of-materials total (raw)</td><td class="n">{_gbp(bom_total)}</td></tr>
</table>
<p class="note">Prices marked parametric where reconciled to the contract's computed equipment-capex anchor (Round-1 universal cost reconciliation). Real catalogue grounding + scale-aware part selection is the ongoing loop work. Light theme. Generated by scripts/round-evidence.py.</p>
</body></html>"""


def main(argv):
    if len(argv) < 3:
        print(__doc__); return 1
    out_dir, rnd, label = argv[0], argv[1], argv[2]
    score = json.loads(argv[3]) if len(argv) > 3 else {}
    html = build(out_dir, rnd, label, score)
    p = Path(out_dir).parent / f"round-{rnd}-evidence.html"
    p.write_text(html)
    print(f"[evidence] wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
