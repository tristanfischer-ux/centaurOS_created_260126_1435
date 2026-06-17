#!/usr/bin/env python3
"""build-council-facts.py <out_dir> — assemble the NEUTRAL FACTS PACK for the 6-seat
engineering-council re-score, in the established format (cost cascade + BoM summary by
status + top lines + canonical physics quantities + the drawing list). Deterministic, no
spin: reads <out_dir>/state.json + the connection/route manifests, writes
<out_dir>/COUNCIL-FACTS.md. One generator so every loop round feeds the seats the SAME
neutral facts (council variance otherwise comes from inconsistent facts, not the design).
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict


def gbp(n) -> str:
    try:
        return f"£{round(float(n)):,}"
    except (TypeError, ValueError):
        return str(n)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: build-council-facts.py <out_dir>")
        return 2
    out_dir = sys.argv[1]
    state_path = os.path.join(out_dir, "state.json")
    if not os.path.exists(state_path):
        print(f"no state.json in {out_dir}")
        return 1
    state = json.load(open(state_path))
    L: list[str] = []

    km = state.get("keyMetrics") or {}
    pclass = km.get("product_class") or "?"
    ho = km.get("headline_output") or {}
    out_val = ho.get("value")
    out_unit = ho.get("unit") or ""
    try:
        out_num = float(str(out_val).replace(",", ""))
    except (TypeError, ValueError):
        out_num = None

    L.append(f"# DOSSIER {os.path.basename(out_dir)} — NEUTRAL FACTS PACK (6-seat council re-score)")
    L.append(f"Class **{pclass}** · headline output **{out_val} {out_unit}** · "
             f"cost CEILING is DEFERRED per client (keep the full-size design, show the real price as one scenario).")
    L.append("")

    # ── COST CASCADE ──
    cs = state.get("costStack") or {}
    if cs:
        L.append("## COST CASCADE (£)")
        for k in ("raw_materials_bom_gbp", "assembly_labour_gbp", "factory_overhead_gbp",
                  "factory_cogs_gbp", "manufacturer_margin_gbp", "oem_transfer_price_gbp",
                  "channel_markup_gbp", "channel_list_price_gbp", "installation_cost_gbp",
                  "installed_asp_gbp"):
            if k in cs:
                L.append(f"  - {k}: {gbp(cs[k])}")
        L.append("")

    # ── COST-SANITY GATE (independent £/output verdict) ──
    csan = state.get("costSanity") or {}
    if csan:
        band = csan.get("band") or {}
        L.append("## INDEPENDENT COST-SANITY (gate 32)")
        L.append(f"  - verdict: {csan.get('verdict')} · headline {gbp(csan.get('headline_cost_gbp'))} "
                 f"/ {csan.get('output_value')} {csan.get('output_unit_label')} = "
                 f"£{round(float(csan.get('cost_per_output_unit') or 0)):,}/{csan.get('output_unit_label')} "
                 f"· band £{band.get('low')}–{band.get('high')} {band.get('per_unit_label','')} ({csan.get('band_basis')})")
        L.append("")

    # ── BoM SUMMARY ──
    bom = state.get("requirementsBom")
    if isinstance(bom, list) and bom:
        rows = [r for r in bom if isinstance(r, dict)]
        total = sum(float(r.get("line_gbp") or 0) for r in rows)
        by_status: dict[str, list] = defaultdict(lambda: [0, 0.0])
        for r in rows:
            st = r.get("status") or "?"
            by_status[st][0] += 1
            by_status[st][1] += float(r.get("line_gbp") or 0)
        per_out = f" ({gbp(total / out_num)}/{out_unit})" if out_num else ""
        L.append(f"## BoM — {len(rows)} lines, Σ {gbp(total)}{per_out}")
        for st, (c, s) in sorted(by_status.items(), key=lambda x: -x[1][1]):
            L.append(f"  - {st}: {c} lines, {gbp(s)}")
        L.append("")
        top = sorted(rows, key=lambda r: -float(r.get("line_gbp") or 0))[:16]
        L.append("Top 16 lines by £:")
        for r in top:
            L.append(f"  - {gbp(r.get('line_gbp')):>13} [{r.get('status', '?')}] {(r.get('requirement') or '')[:62]}")
        L.append("")

    # ── PHYSICS / SIZING (canonical, single value per quantity) ──
    q = ((state.get("orchestratorContract") or {}).get("quantities")) or {}
    if q:
        L.append("## PHYSICS / SIZING (canonical quantities — no computed_X twins)")
        for k in sorted(q.keys()):
            if k.startswith("computed_"):
                continue
            v = q[k]
            val = v.get("value") if isinstance(v, dict) else v
            unit = (v.get("unit") if isinstance(v, dict) else "") or ""
            if isinstance(val, (int, float)):
                L.append(f"  - {k}: {val} {unit}".rstrip())
        L.append("")

    # ── DRAWINGS available for the seats to OPEN ──
    dd = os.path.join(out_dir, "drawings")
    if os.path.isdir(dd):
        pngs = sorted(f for f in os.listdir(dd) if f.endswith(".png"))
        L.append(f"## DRAWINGS ({len(pngs)} PNG in {dd}/) — seats MUST open the relevant sheets")
        L.append("  " + ", ".join(pngs[:30]) + (" …" if len(pngs) > 30 else ""))
        L.append("")

    L.append(f"## acceptanceStatus: {state.get('acceptanceStatus', 'n/a')}")
    open(os.path.join(out_dir, "COUNCIL-FACTS.md"), "w").write("\n".join(L) + "\n")
    print(f"wrote {out_dir}/COUNCIL-FACTS.md ({len(L)} lines, BoM Σ {gbp(total) if isinstance(bom, list) and bom else 'n/a'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
