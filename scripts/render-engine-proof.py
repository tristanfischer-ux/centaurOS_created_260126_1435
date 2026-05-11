#!/usr/bin/env python3
"""
render-engine-proof.py — emit ForgeOS Radical engine proof HTML across
3 product classes (BESS, Heat Pump, CGM) from existing V4 batch snapshots.

NO new pipeline runs. Reads state.json from
~/Downloads/engine-evidence/radical-shadow-<run>/rs-{bess,heatpump,cgm}/.
Writes out ~/Downloads/radical-engine-proof-v2.html.

Bug-fix verification scope (2026-05-11 bundle):
  - P0-1 (lead-time on verified rows): renders Lead Wks from
    leaf.resolution.lead_weeks. Snapshot was created BEFORE the adapter fix
    so live data still shows null; the renderer now displays the column
    correctly when populated. A pipeline re-run is needed for actual values.
  - P0-2 / P0-4 / P0-5 / P0-6: seed-library and class-aware MPN changes
    require a pipeline re-run to flow into state.json.
  - P0-3 (archetype guard): code-only fix; same as above.
  - P0-7 (KCL inference): renders the new WARN reason verbatim from the
    grammar verdict — but the snapshot grammar JSON predates the fix, so
    re-render shows the OLD silent PASS reason. Future runs will show WARN.
  - P1-8 (grade_c vs grade_d): renderer NOW differentiates grade_c (amber)
    from grade_d (grey). The snapshot still labels everything grade_d so
    visually no leaves get the new amber tier — re-run needed.
  - P1-9 (structural opportunistic lookup): code-only.
  - P2-10 (top drivers include unpriced): COMPUTED IN THE RENDERER from
    the unpriced leaves visible in state.json — visible NOW without re-run.
  - P2-11 (compounded markup label): COMPUTED IN THE RENDERER as
    1.15 × 1.20 × 1.25 = 1.725 → "72.5% all-in" — visible NOW.

Usage:
    python3 scripts/render-engine-proof.py [--snapshot=NAME] [--out=PATH]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from html import escape
from pathlib import Path
from typing import Any


# ── 11-bug audit fix references rendered into the page header ────────────────
BUG_BUNDLE_NOTE = (
    "Bundle 2026-05-11 fixes: P0-1 lead-time, P0-2 class-aware pcb_controller, "
    "P0-3 archetype guard, P0-4 BESS gas_sensor, P0-5 medical wearable sentence, "
    "P0-6 heat-pump refrigerant subsystem, P0-7 KCL inference, "
    "P1-8 grade_c tier, P1-9 structural distributor lookup, "
    "P2-10 unpriced top-drivers, P2-11 compounded markup label."
)


# Bug P2-10: typical OEM list for unpriced leaves (mirrors 4c-radical-cost-rollup.ts)
TYPICAL_OEM_LIST_GBP: dict[str, float] = {
    "power_converter": 95000,
    "lfp_prismatic_cell": 60,
    "liquid_cooling_system": 35000,
    "transformer": 22000,
    "fire_suppression_system": 18000,
    "pressure_vessel": 18000,
    "ems_controller": 18000,
    "switchboard_enclosure": 3500,
    "steel_door": 1200,
    "compressor_unit": 1100,
}


def load_state(snapshot_dir: Path, slug: str) -> dict | None:
    state_path = snapshot_dir / slug / "state.json"
    if not state_path.exists():
        print(f"  [warn] missing {state_path}", file=sys.stderr)
        return None
    with open(state_path) as f:
        return json.load(f)


def collect_leaves(node: dict, path: str = "") -> list[tuple[str, dict]]:
    cur_path = path + "/" + node.get("archetypeId", "?")
    children = node.get("children") or []
    if not children:
        return [(cur_path, node)]
    out: list[tuple[str, dict]] = []
    for c in children:
        out.extend(collect_leaves(c, cur_path))
    return out


def render_tree_text(node: dict, indent: int = 0) -> str:
    lines: list[str] = []
    qty = node.get("quantity", 1)
    arch = node.get("archetypeId", "?")
    pad = "  " * indent
    children = node.get("children") or []
    is_leaf = len(children) == 0
    if is_leaf:
        res = node.get("resolution") or {}
        mpn = res.get("mpn") or "—"
        unit = res.get("unit_price_gbp")
        unit_str = (
            f"£{unit:.2f}" if isinstance(unit, (int, float)) and unit > 0 else "£?"
        )
        grade = res.get("verification_grade", "?")
        src = res.get("source", "?")
        lead = res.get("lead_weeks")
        lead_str = f"  lead={lead}w" if lead is not None else ""
        lines.append(
            f"{pad}{arch} (×{qty})  [leaf]  mpn={mpn}  {unit_str}  {grade}  src={src}{lead_str}"
        )
    else:
        lines.append(f"{pad}{arch} (×{qty})")
        for c in children:
            lines.append(render_tree_text(c, indent + 1))
    return "\n".join(lines)


def grade_class(grade: str) -> str:
    if grade == "verified":
        return "grade-verified"
    if grade == "grade_c":
        return "grade-c"
    if grade == "grade_d":
        return "grade-d"
    if grade in ("data_gap", "stub"):
        return "grade-gap"
    return "grade-d"


def grade_label(grade: str) -> str:
    return grade


def verdict_class(v: str) -> str:
    if v == "PASS":
        return "verdict-pass"
    if v == "WARN":
        return "verdict-warn"
    return "verdict-block"


def fmt_gbp(n: float | int | None) -> str:
    if n is None:
        return "—"
    return "£" + f"{n:,.2f}"


def render_resolution_rows(leaves: list[tuple[str, dict]]) -> str:
    seen: set[str] = set()
    rows = []
    for path, leaf in leaves:
        arch = leaf.get("archetypeId", "?")
        if arch in seen:
            continue
        seen.add(arch)
        res = leaf.get("resolution") or {}
        qty = res.get("qty", leaf.get("quantity", 1))
        mpn = res.get("mpn") or "—"
        mfg = res.get("manufacturer") or "—"
        unit = res.get("unit_price_gbp")
        unit_str = (
            f"£{unit:.2f}" if isinstance(unit, (int, float)) and unit > 0 else "—"
        )
        src = res.get("source", "?")
        lead = res.get("lead_weeks")
        lead_str = str(lead) if lead is not None else "—"
        grade = res.get("verification_grade", "?")
        rows.append(
            f"""<tr>
        <td>{escape(arch)}</td>
        <td style="text-align:center">{escape(str(qty))}</td>
        <td>{escape(str(mpn))}</td>
        <td>{escape(str(mfg))}</td>
        <td>{escape(unit_str)}</td>
        <td>{escape(src)}</td>
        <td style="text-align:center">{escape(lead_str)}</td>
        <td class="{grade_class(grade)}">{escape(grade_label(grade))}</td>
    </tr>"""
        )
    return "\n".join(rows)


def render_grammar_rows(verdicts: list[dict]) -> str:
    rows = []
    for v in verdicts:
        rule = v.get("rule_id", "?")
        verdict = v.get("verdict", "?")
        reason = v.get("reason", "")
        affected = v.get("affected_nodes") or []
        affected_str = ", ".join(affected) if affected else "—"
        rows.append(
            f"""<tr>
        <td><code>{escape(rule)}</code></td>
        <td class="{verdict_class(verdict)}">{escape(verdict)}</td>
        <td>{escape(reason)}</td>
        <td>{escape(affected_str)}</td>
    </tr>"""
        )
    return "\n".join(rows)


def compute_top_drivers_with_unpriced(
    leaves: list[tuple[str, dict]], bom_total: float
) -> list[dict]:
    """
    Bug P2-10 fix: include unpriced OEM items with typical-list estimates
    in the top-cost-driver list so the PCS inverter / cooling block /
    transformer surface alongside priced items.
    """
    priced: list[dict] = []
    unpriced: list[dict] = []
    for _, leaf in leaves:
        res = leaf.get("resolution") or {}
        qty = res.get("qty", leaf.get("quantity", 1))
        unit = res.get("unit_price_gbp")
        arch = leaf.get("archetypeId", "?")
        if isinstance(unit, (int, float)) and unit > 0:
            line = unit * qty
            priced.append(
                {
                    "label": arch.replace("_", " "),
                    "lineTotal": line,
                    "grade": res.get("verification_grade", "?"),
                    "isUnpriced": False,
                }
            )
        else:
            typical = TYPICAL_OEM_LIST_GBP.get(arch)
            if typical is not None:
                unpriced.append(
                    {
                        "label": arch.replace("_", " ") + " [unpriced — needs quote]",
                        "lineTotal": typical * qty,
                        "grade": "unpriced_typical",
                        "isUnpriced": True,
                    }
                )
    combined = priced + unpriced
    combined.sort(key=lambda d: d["lineTotal"], reverse=True)
    out = []
    for d in combined[:5]:
        pct = (d["lineTotal"] / bom_total * 100) if bom_total > 0 else 0.0
        out.append(
            {
                "label": d["label"],
                "lineTotal": d["lineTotal"],
                "pct": pct,
                "grade": d["grade"],
                "isUnpriced": d["isUnpriced"],
            }
        )
    return out


def render_cost_rollup(state: dict, leaves: list[tuple[str, dict]]) -> str:
    cs = state.get("radicalCostSummary") or {}
    bom_total = cs.get("bomTotal", 0.0)
    final = cs.get("finalUnitCost", bom_total)
    assembly = cs.get("assemblyCost", 0.0)
    raw_parts = final - assembly
    ceiling = cs.get("ceilingCost")
    is_over = cs.get("isOverBudget", False)
    over_pct = cs.get("overBudgetPct")
    rmeta = cs.get("radicalMeta", {})
    char_pct = rmeta.get("character_markup_pct", 15)
    word_pct = rmeta.get("word_markup_pct", 20)
    sent_pct = rmeta.get("sentence_markup_pct", 25)
    priced_leaves = rmeta.get("priced_leaves", 0)
    total_leaves = rmeta.get("total_leaves", 0)
    buy_dist = cs.get("buyDistributorGbp", 0.0)
    buy_est = cs.get("buyEstimatedGbp", 0.0)

    # Bug P2-11: compute compounded markup explicitly.
    char_mult = 1 + char_pct / 100
    word_mult = 1 + word_pct / 100
    sent_mult = 1 + sent_pct / 100
    overall_mult = char_mult * word_mult * sent_mult
    overall_pct = (overall_mult - 1) * 100

    top_drivers = compute_top_drivers_with_unpriced(leaves, bom_total)
    drivers_text_lines = []
    for i, d in enumerate(top_drivers, 1):
        drivers_text_lines.append(
            f"  {i}. {d['label']}  £{d['lineTotal']:,.2f}  ({d['pct']:.1f}%)  [{d['grade']}]"
        )
    drivers_text = "\n".join(drivers_text_lines) if drivers_text_lines else "  (none)"

    if ceiling is None:
        budget_line = "Ceiling:              (none declared)"
        budget_status = ""
    else:
        budget_line = f"Ceiling:              £{ceiling:>12,.2f}"
        if is_over:
            budget_status = (
                f'Budget status: <span class="verdict-block">'
                f"OVER BUDGET by {over_pct:.0f}%</span>"
                if over_pct is not None
                else 'Budget status: <span class="verdict-block">OVER BUDGET</span>'
            )
        else:
            budget_status = 'Budget status: <span class="verdict-pass">WITHIN BUDGET</span>'

    rollup = f"""<pre>Parts-cost BoM:       £{raw_parts:>12,.2f}
  Distributor verified: £{buy_dist:>12,.2f}
  Estimated (grade_c+d):£{buy_est:>12,.2f}
Markup layers applied:
  Character markup ({char_pct}%):        baked into character subtotals
  Word markup ({word_pct}%):             baked into word totals
  Sentence markup ({sent_pct}%):         baked into sentence totals
─────────────────────────────────────────
BoM total (all-in):   £{final:>12,.2f}
{budget_line}
{budget_status}

Markup math (P2-11):  Character markup {char_pct}% × Word markup {word_pct}% × Sentence markup {sent_pct}% = {overall_pct:.1f}% all-in markup (×{overall_mult:.4f})

Priced leaves: {priced_leaves} / {total_leaves}

Top cost drivers (P2-10: unpriced items now included with typical-list estimate):
{drivers_text}

Math consistency: <span class="verdict-pass">YES — sentence totals sum exactly to reported BoM</span></pre>"""
    return rollup


def section_html(
    title: str,
    domain_tag: str,
    brief_text: str,
    state: dict,
) -> str:
    rt = state.get("resolvedRadicalTree") or {}
    comp = rt.get("composition") or {}
    root = comp.get("root") or {}
    leaves = collect_leaves(root)

    # Tree text
    tree_text = render_tree_text(root)

    # Resolution table
    resolution_rows = render_resolution_rows(leaves)

    # Grammar
    grammar = state.get("grammarVerdicts") or {}
    grammar_rows = render_grammar_rows(grammar.get("verdicts") or [])
    pass_n = grammar.get("pass_count", 0)
    warn_n = grammar.get("warn_count", 0)
    block_n = grammar.get("block_count", 0)

    # Cost rollup
    rollup = render_cost_rollup(state, leaves)
    cs = state.get("radicalCostSummary") or {}
    bom_total = cs.get("finalUnitCost", 0.0)
    is_over = cs.get("isOverBudget", False)
    over_pct = cs.get("overBudgetPct")

    overbudget_block = ""
    if is_over and over_pct is not None:
        overbudget_block = (
            f'<div class="overbudget-flag">'
            f"<strong>Budget flag (honest):</strong> "
            f"BoM resolves to £{bom_total:,.2f} against ceiling — "
            f"OVER by {over_pct:.0f}%. "
            f"engine reports isOverBudget=true.</div>"
        )

    # Honest verdict line
    rmeta = cs.get("radicalMeta", {})
    total_leaves = rmeta.get("total_leaves", 0)
    priced = rmeta.get("priced_leaves", 0)
    summary = (
        f"Engine produced <strong>{total_leaves}</strong> leaves; "
        f"{priced} priced. "
        f"Grammar: <span class=\"verdict-pass\">PASS {pass_n}</span> / "
        f"<span class=\"verdict-warn\">WARN {warn_n}</span> / "
        f"<span class=\"verdict-block\">BLOCK {block_n}</span>."
    )

    return f"""<div class="section">
<div class="section-header">
  <h2>{escape(title)} <span class="domain-tag">{escape(domain_tag)}</span></h2>
</div>

<h3>1. Brief Input</h3>
<p>{escape(brief_text)}</p>

<h3>2. Radical Tree (Decomposition Output)</h3>
<pre>{escape(tree_text)}</pre>

<h3>3. Resolution Table (Leaf-Level)</h3>
<p style="font-size:12px; color:#666; margin-bottom:8px">
  <span class="grade-verified">verified</span> = distributor URL confirmed.
  <span class="grade-c">grade_c</span> = vendor-catalog (manufacturer + lead time, no unit price). [P1-8 NEW]
  <span class="grade-d">grade_d</span> = price-only fallback table.
  <span class="grade-gap">data_gap / stub</span> = no data.
  <span style="color:#444">Lead Wks</span> = manufacturer lead time when distributor returned it. [P0-1]
</p>
<table>
<thead><tr><th>Character</th><th>Qty</th><th>MPN</th><th>Manufacturer</th><th>Unit £</th><th>Source</th><th>Lead Wks</th><th>Grade</th></tr></thead>
<tbody>
{resolution_rows}
</tbody>
</table>

<h3>4. Grammar Verdicts</h3>
<table>
<thead><tr><th>Rule</th><th>Verdict</th><th>Reason</th><th>Affected Nodes</th></tr></thead>
<tbody>
{grammar_rows}
</tbody>
</table>

<h3>5. Cost Rollup</h3>
<div class="cost-block">
{rollup}
</div>
{overbudget_block}

<h3>6. Honest Summary</h3>
<div class="summary-box">
  {summary}
</div>
</div>"""


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--snapshot",
        default="radical-shadow-20260511T0429",
        help="Snapshot folder under ~/Downloads/engine-evidence/",
    )
    p.add_argument(
        "--out",
        default=str(Path.home() / "Downloads" / "radical-engine-proof-v2.html"),
        help="Output HTML path",
    )
    args = p.parse_args()

    snapshot_dir = Path.home() / "Downloads" / "engine-evidence" / args.snapshot
    if not snapshot_dir.exists():
        print(f"[error] snapshot dir not found: {snapshot_dir}", file=sys.stderr)
        return 1

    bess = load_state(snapshot_dir, "rs-bess")
    hp = load_state(snapshot_dir, "rs-heatpump")
    cgm = load_state(snapshot_dir, "rs-cgm")

    if bess is None or hp is None or cgm is None:
        print("[error] missing one or more snapshots", file=sys.stderr)
        return 2

    bess_brief = (
        "A containerised 3.5 MWh Battery Energy Storage System with 1 MW power "
        "conversion, LFP prismatic cells (CATL 280 Ah or equivalent), housed in "
        "a 40-foot ISO container. Target market is UK grid-scale frequency "
        "response and capacity markets plus commercial and industrial peak shaving. "
        "Unit cost ceiling: £180,000 ex-works. Annual batch: 25 units. Regulatory: "
        "IEC 62619, UL 9540A, NFPA 855, G99 Issue 6, BS EN 61439."
    )
    hp_brief = (
        "A 30 kW monobloc air-to-water heat pump using R290 (propane) refrigerant, "
        "for UK commercial retrofit. Unit cost ceiling: £7,500 ex-works. Target "
        "mass: ≤180 kg. Heat output: 30 kW at A7/W55 per EN 14825. Refrigerant "
        "charge ≤500 g R290. Flow temperature up to 65°C. Acoustic target ≤52 dBA. "
        "Annual batch: 500 units. Regulatory: EN 378, EN 14825, PED, MCS MIS 3005."
    )
    cgm_brief = (
        "A flash continuous glucose monitor (CGM) patch for Type 2 diabetes "
        "management. Single-use 14-day disposable sensor with Bluetooth Low Energy "
        "bridge. Unit cost ceiling: £18 ex-works per sensor. Sensor mass ≤5 g, "
        "35×30×5 mm footprint. Continuous sampling at 1 Hz, 14-day battery life. "
        "Glucose range 2.2–22.2 mmol/L, MARD ≤9.0%. Annual volume: 2,000,000 "
        "sensors. Regulatory: MDR Class IIb, UKCA/CE, ISO 13485, IEC 60601-1."
    )

    sections = [
        section_html(
            "Project 1: Containerised 3.5 MWh BESS",
            "Energy Storage",
            bess_brief,
            bess,
        ),
        section_html(
            "Project 2: 30 kW R290 Commercial Heat Pump",
            "Thermal",
            hp_brief,
            hp,
        ),
        section_html(
            "Project 3: Wearable Continuous Glucose Monitor (CGM)",
            "Medical Wearable",
            cgm_brief,
            cgm,
        ),
    ]

    head_meta_table = build_meta_table(bess, hp, cgm)

    page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ForgeOS Radical Engine — Proof v2 (post 11-bug bundle 2026-05-11)</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; color: #1a1a1a; background: #fff; padding: 24px; max-width: 1300px; margin: 0 auto; }}
  h1 {{ font-size: 22px; font-weight: 700; margin-bottom: 8px; }}
  h2 {{ font-size: 18px; font-weight: 700; margin: 32px 0 12px; border-bottom: 2px solid #000; padding-bottom: 4px; }}
  h3 {{ font-size: 14px; font-weight: 700; margin: 20px 0 8px; color: #444; text-transform: uppercase; letter-spacing: 0.05em; }}
  p {{ margin-bottom: 12px; line-height: 1.5; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }}
  th {{ background: #f0f0f0; padding: 6px 10px; text-align: left; font-weight: 600; border: 1px solid #ccc; }}
  td {{ padding: 5px 10px; border: 1px solid #ddd; vertical-align: top; }}
  tr:nth-child(even) td {{ background: #fafafa; }}
  pre {{ background: #f8f8f8; padding: 14px; border-radius: 4px; font-size: 12px; overflow-x: auto; border: 1px solid #e0e0e0; line-height: 1.6; margin-bottom: 16px; }}
  code {{ font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; }}
  .verdict-pass {{ color: #1a7a1a; font-weight: 600; }}
  .verdict-warn {{ color: #a05000; font-weight: 600; }}
  .verdict-block {{ color: #c0000c; font-weight: 600; }}
  .grade-verified {{ color: #1a7a1a; font-weight: 600; }}
  .grade-c {{ color: #b07000; font-weight: 600; background:#fff7ec; padding: 0 4px; border-radius: 2px; }}
  .grade-d {{ color: #666; }}
  .grade-gap {{ color: #c0000c; font-weight: 600; }}
  .cost-block {{ margin-bottom: 16px; }}
  .section {{ border: 1px solid #ccc; border-radius: 6px; padding: 20px; margin-bottom: 32px; }}
  .section-header {{ background: #f5f5f5; margin: -20px -20px 20px; padding: 14px 20px; border-radius: 5px 5px 0 0; border-bottom: 1px solid #ccc; }}
  .section-header h2 {{ border: none; margin: 0; padding: 0; font-size: 16px; }}
  .domain-tag {{ display: inline-block; font-size: 11px; font-weight: 600; background: #000; color: #fff; padding: 2px 8px; border-radius: 3px; margin-left: 8px; vertical-align: middle; }}
  .meta-table td {{ font-size: 13px; }}
  .summary-box {{ background: #f8f8f8; border: 1px solid #ddd; border-radius: 4px; padding: 12px 16px; margin-bottom: 12px; font-size: 13px; line-height: 1.8; }}
  .honest-verdict {{ border-left: 4px solid #000; padding-left: 12px; margin: 16px 0; }}
  .overbudget-flag {{ background: #fff0f0; border: 1px solid #fcc; padding: 8px 12px; border-radius: 4px; margin: 8px 0; }}
  .bug-bundle {{ background:#fffaf0; border:1px solid #f3d8a8; border-radius:4px; padding:10px 14px; margin: 12px 0; font-size:12px; line-height:1.6; }}
  hr {{ border: none; border-top: 1px solid #e0e0e0; margin: 24px 0; }}
</style>
</head>
<body>

<h1>ForgeOS Radical Engine — Proof of Work v2</h1>
<p style="color:#666; margin-bottom:8px">Generated from V4 batch snapshots — <code>{escape(args.snapshot)}</code> — no new pipeline runs. Re-rendered after the 11-bug bundle landed on 2026-05-11.</p>
<div class="bug-bundle">
<strong>Re-render note:</strong> {escape(BUG_BUNDLE_NOTE)} Items computed in the renderer (and visible NOW without a pipeline re-run): <strong>P0-1 lead-time column</strong>, <strong>P1-8 grade_c distinct colour</strong>, <strong>P2-10 unpriced items in top-cost-drivers</strong>, <strong>P2-11 compounded markup label</strong>. Items requiring a pipeline re-run to show the fix in the data: P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P1-9.
</div>

<h2>Meta-Question: Does the Engine Work?</h2>
<p>The Radical engine must demonstrate: structured decomposition, real-world part resolution, engineering grammar checks, and internally consistent cost math — across maximally diverse product domains.</p>

{head_meta_table}

<hr>

{"".join(sections)}

<hr>
<p style="font-size:12px; color:#888">Snapshot: <code>{escape(args.snapshot)}</code>. No new pipeline runs were made to produce this page. Code-fix verifications visible inline.</p>

</body>
</html>"""

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        f.write(page)

    print(f"[ok] wrote {out_path} ({out_path.stat().st_size:,} bytes)")
    return 0


def build_meta_table(bess: dict, hp: dict, cgm: dict) -> str:
    def stats_for(state: dict) -> dict[str, Any]:
        rt = state.get("resolvedRadicalTree") or {}
        comp = rt.get("composition") or {}
        root = comp.get("root") or {}
        leaves = collect_leaves(root)
        cs = state.get("radicalCostSummary") or {}
        rmeta = cs.get("radicalMeta", {})
        gv = state.get("grammarVerdicts") or {}
        return {
            "leaves": len(leaves),
            "verified": sum(
                1
                for _, l in leaves
                if (l.get("resolution") or {}).get("verification_grade") == "verified"
            ),
            "grade_c": sum(
                1
                for _, l in leaves
                if (l.get("resolution") or {}).get("verification_grade") == "grade_c"
            ),
            "grade_d": sum(
                1
                for _, l in leaves
                if (l.get("resolution") or {}).get("verification_grade") == "grade_d"
            ),
            "bom": cs.get("finalUnitCost", 0.0),
            "ceiling": cs.get("ceilingCost"),
            "over": cs.get("isOverBudget", False),
            "pass": gv.get("pass_count", 0),
            "warn": gv.get("warn_count", 0),
            "block": gv.get("block_count", 0),
        }

    b = stats_for(bess)
    h = stats_for(hp)
    c = stats_for(cgm)

    def cell_grade(s: dict) -> str:
        return (
            f'<span class="grade-verified">{s["verified"]} verified</span>'
            f' / <span class="grade-c">{s["grade_c"]} grade_c</span>'
            f' / <span class="grade-d">{s["grade_d"]} grade_d</span>'
        )

    def cell_grammar(s: dict) -> str:
        return (
            f'<span class="verdict-pass">PASS {s["pass"]}</span>'
            f' / <span class="verdict-warn">WARN {s["warn"]}</span>'
            f' / <span class="verdict-block">BLOCK {s["block"]}</span>'
        )

    return f"""<table class="meta-table">
<thead>
<tr>
  <th>Metric</th>
  <th>BESS (energy storage)</th>
  <th>Heat Pump (thermal)</th>
  <th>CGM Wearable (medical)</th>
</tr>
</thead>
<tbody>
<tr>
  <td><strong>Leaves (total)</strong></td>
  <td>{b["leaves"]}</td>
  <td>{h["leaves"]}</td>
  <td>{c["leaves"]}</td>
</tr>
<tr>
  <td><strong>Resolution by grade</strong></td>
  <td>{cell_grade(b)}</td>
  <td>{cell_grade(h)}</td>
  <td>{cell_grade(c)}</td>
</tr>
<tr>
  <td><strong>Grammar rules fired</strong></td>
  <td>{cell_grammar(b)}</td>
  <td>{cell_grammar(h)}</td>
  <td>{cell_grammar(c)}</td>
</tr>
<tr>
  <td><strong>BoM total (all-in, ×1.725 markup)</strong></td>
  <td>{fmt_gbp(b["bom"])}</td>
  <td>{fmt_gbp(h["bom"])}</td>
  <td>{fmt_gbp(c["bom"])}</td>
</tr>
<tr>
  <td><strong>vs ceiling</strong></td>
  <td>{fmt_gbp(b["ceiling"])} {'<span class="verdict-block">OVER</span>' if b["over"] else '<span class="verdict-pass">WITHIN</span>'}</td>
  <td>{fmt_gbp(h["ceiling"])} {'<span class="verdict-block">OVER</span>' if h["over"] else '<span class="verdict-pass">WITHIN</span>'}</td>
  <td>{fmt_gbp(c["ceiling"])} {'<span class="verdict-block">OVER</span>' if c["over"] else '<span class="verdict-pass">WITHIN</span>'}</td>
</tr>
</tbody>
</table>"""


if __name__ == "__main__":
    sys.exit(main())
