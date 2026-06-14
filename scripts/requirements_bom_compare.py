#!/usr/bin/env python3
"""requirements_bom_compare.py — ONE html comparing the requirements-driven BoM
across the three test archetypes (CO2, SAF/e-fuel, RAS). Tristan 2026-06-13:
"show me the results of the three test runs- co2 fuel and ras - in an html file".
Pure read via requirements_bom.assemble — no engine state mutated."""
import html, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from requirements_bom import assemble

RUNS = [
    ("CO₂ — carbon capture", "out/co2-regcheck", "Amine post-combustion CO₂ capture plant"),
    ("SAF / e-fuel — Fischer-Tropsch", "out/oxccu-saf-v21", "Power-to-liquid sustainable aviation fuel"),
    ("RAS — recirculating aquaculture", "out/ras-r5-20260613", "Land-based recirculating aquaculture system"),
]
SC = {"IDENTIFIED": ("#0a7a33", "identified"), "BESPOKE": ("#1257b0", "bespoke"),
      "NOT FOUND": ("#a60", "not yet sourced")}


def gbp(n):
    return f"£{round(n):,}"


def _mix(rows):
    m = {}
    for r in rows:
        m[r["status"]] = m.get(r["status"], 0) + 1
    return m


def section(title, dir_, blurb):
    rows = assemble(dir_)
    total = sum(r["line_gbp"] for r in rows)
    m = _mix(rows)
    chips = " ".join(
        f'<span style="color:{SC[s][0]};font-weight:700">{m.get(s,0)} {SC[s][1]}</span>'
        for s in ("IDENTIFIED", "BESPOKE", "NOT FOUND") if m.get(s))
    trs = "".join(
        f'<tr><td class="tag">{html.escape(str(r["tag"]))}</td>'
        f'<td>{html.escape(r["requirement"])}</td>'
        f'<td style="color:{SC.get(r["status"],("#333",""))[0]};font-weight:700;font-size:10.5px">{html.escape(r["status"])}</td>'
        f'<td class="sm">{html.escape(r["basis"])}</td>'
        f'<td class="n">×{r["qty"]}</td><td class="n">{gbp(r["line_gbp"])}</td></tr>'
        for r in rows)
    return f"""<section>
<h2>{html.escape(title)}</h2>
<p class="blurb">{html.escape(blurb)} &middot; <code>{html.escape(dir_)}</code></p>
<div class="cards">
 <div class="card"><div class="k">Requirement lines</div><div class="v">{len(rows)}</div></div>
 <div class="card"><div class="k">Requirements total</div><div class="v">{gbp(total)}</div></div>
 <div class="card" style="flex:2;min-width:240px"><div class="k">Fulfilment mix</div><div class="chips">{chips}</div></div>
</div>
<table>
<tr><th>Tag</th><th>Requirement — what it must do</th><th>Fulfilment</th><th>Cost basis</th><th>Qty</th><th>Line £</th></tr>
{trs}
<tr class="tot"><td colspan="5">Requirements total — {len(rows)} lines</td><td class="n">{gbp(total)}</td></tr>
</table>
</section>"""


def main():
    secs = "\n".join(section(*r) for r in RUNS)
    sumrows = ""
    for title, dir_, _ in RUNS:
        rows = assemble(dir_)
        total = sum(r["line_gbp"] for r in rows)
        m = _mix(rows)
        sumrows += (f'<tr><td>{html.escape(title)}</td><td class="n">{len(rows)}</td>'
                    f'<td class="n">{gbp(total)}</td>'
                    f'<td class="n" style="color:#0a7a33">{m.get("IDENTIFIED",0)}</td>'
                    f'<td class="n" style="color:#1257b0">{m.get("BESPOKE",0)}</td>'
                    f'<td class="n" style="color:#a60">{m.get("NOT FOUND",0)}</td></tr>')
    doc = f"""<!doctype html><html><head><meta charset="utf-8"><title>Requirements-driven BoM — three test runs</title>
<style>
body{{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1a1a1a;background:#fff;max-width:1120px;margin:30px auto;padding:0 22px;line-height:1.5}}
h1{{font-size:24px;margin-bottom:2px}} h2{{font-size:18px;margin-top:36px;border-bottom:2px solid #1257b0;padding-bottom:5px}}
.sub{{color:#555;margin-top:0;max-width:820px}} .blurb{{color:#777;font-size:13px;margin-top:2px}}
.cards{{display:flex;gap:14px;flex-wrap:wrap;margin:14px 0}}
.card{{background:#f6f8fa;border:1px solid #e3e8ee;border-radius:8px;padding:10px 16px;min-width:150px}}
.card .v{{font-size:21px;font-weight:700}} .card .k{{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.04em}}
.chips{{font-size:13px;margin-top:6px;line-height:1.9}} .chips span{{margin-right:16px;white-space:nowrap}}
table{{border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0}}
th,td{{text-align:left;padding:5px 9px;border-bottom:1px solid #eee;vertical-align:top}} th{{color:#888;font-size:11px;text-transform:uppercase}}
td.n{{text-align:right;font-variant-numeric:tabular-nums}} td.sm{{color:#888;font-size:11px}}
.tag{{font-weight:700;color:#1257b0;font-variant-numeric:tabular-nums;white-space:nowrap}} .tot{{font-weight:700}} .tot td{{border-top:2px solid #1257b0}}
.summary table{{font-size:13.5px}} .summary td,.summary th{{padding:7px 10px}}
.note{{color:#555;font-size:12px;background:#f6f8fa;border-left:3px solid #1257b0;padding:11px 15px;border-radius:4px;margin:16px 0}}
</style></head><body>
<h1>Requirements-driven Bill of Materials — three test runs</h1>
<p class="sub">The same universal assembler, no per-class code, on three different archetypes. Each line states the REQUIREMENT (the duty computed by the physics engine, the size and connections measured off the Blender model, the material) &rarr; the FULFILMENT &rarr; the COST and its basis.</p>
<div class="summary">
<table>
<tr><th>Archetype</th><th>Lines</th><th>Requirements total</th><th>Identified</th><th>Bespoke</th><th>Not found</th></tr>
{sumrows}
</table>
</div>
<p class="note"><b style="color:#0a7a33">Identified</b> = a real catalogue part. <b style="color:#1257b0">Bespoke</b> = made-to-spec: tanks are costed by a materials take-off (steel/FRP mass &times; rate); reactors, columns and absorbers are costed by an engineering budget estimate and are never an off-shelf catalogue line even when a part number is pinned. <b style="color:#a60">Not found</b> = the requirement is stated and sized, no catalogue match recorded yet. The archetype totals are identical before and after the bespoke relabel — only the honesty of the label changed. Light theme.</p>
{secs}
</body></html>"""
    out = sys.argv[1] if len(sys.argv) > 1 else "out/requirements-bom-three-runs.html"
    open(out, "w").write(doc)
    print("wrote", out, f"({len(doc)//1024} KB)")


if __name__ == "__main__":
    main()
