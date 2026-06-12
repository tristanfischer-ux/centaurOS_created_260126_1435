#!/usr/bin/env python3
"""draw_envelope_pack.py — design-to-envelope P2/P5: the containerisation diagram.

Plan (d). Takes the CAD parts-manifest.json + an envelope, runs the fit-audit
(envelope_fit_audit), shelf-packs the IN-BOX equipment into N envelopes, and draws
the result: N container rectangles (to scale) with the packed equipment footprints
inside (coloured by module, tagged), plus a panel listing the FIELD-ERECTED /
external items and the OUTPUT-FLEX (output the envelope holds). This is the visual
"the design in the box" — a real design-and-construction drawing.

Usage (matches the draw_*.py contract):  python3 draw_envelope_pack.py <out_dir> [state_path] [--env 40ft-hi-cube]
Writes <out_dir>/drawings/envelope-packing.png.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

_THIS = Path(__file__).resolve().parent
sys.path.insert(0, str(_THIS))
import envelope_fit_audit as efa  # noqa: E402

MODULE_COLOUR = {}  # filled on the fly, stable order
_PALETTE = ["#4C78A8", "#F58518", "#54A24B", "#B279A2", "#E45756", "#72B7B2",
            "#FF9DA6", "#9D755D", "#BAB0AC", "#EECA3B"]


def _colour(module: str) -> str:
    if module not in MODULE_COLOUR:
        MODULE_COLOUR[module] = _PALETTE[len(MODULE_COLOUR) % len(_PALETTE)]
    return MODULE_COLOUR[module]


def draw(out_dir: Path, env_name: str = "40ft-hi-cube") -> bool:
    manifest = efa._load_manifest(str(out_dir))
    rep = efa.audit(manifest, env_name, efa._headline_output(str(out_dir)))
    env = rep["envelope_mm"]
    eL_m, eW_m = env["L"] / 1000.0, env["W"] / 1000.0
    containers = rep["packing"]   # qty-aware placed pack from the audit (single source of truth)
    n = max(1, len(containers))

    # Draw up to MAX_DRAW representative containers (stacked); note the rest. Many tiny
    # containers stacked would be an unreadable sliver — show the concept + the totals.
    MAX_DRAW = 6
    drawn = containers[:MAX_DRAW]
    GAP_C = eW_m * 0.75
    fig_h = max(4.5, min(11.0, len(drawn) * (eW_m + GAP_C) * 0.40 + 1.4))
    fig = plt.figure(figsize=(15.5, fig_h), dpi=140)
    ax = fig.add_axes([0.03, 0.06, 0.60, 0.86])
    ax.set_aspect("equal")
    y_off = 0.0
    for ci, c in enumerate(drawn):
        ax.add_patch(Rectangle((0, y_off), eL_m, eW_m, fill=False, edgecolor="#222", lw=1.6))
        ax.text(0.1, y_off + eW_m + 0.10, f"{env_name}  #{ci+1}  ({len(c)} items)",
                fontsize=8, color="#222")
        for it in c:
            ax.add_patch(Rectangle((it["x"], y_off + it["y"]), it["w"], it["d"],
                                   facecolor=_colour(it["module"]), edgecolor="white",
                                   lw=0.5, alpha=0.9))
            if it["w"] > 0.8 and it["d"] > 0.55:
                ax.text(it["x"] + it["w"] / 2, y_off + it["y"] + it["d"] / 2, it["label"],
                        ha="center", va="center", fontsize=5.0, color="white")
        y_off += eW_m + GAP_C
    ax.set_xlim(-0.5, eL_m + 0.5)
    ax.set_ylim(-0.5, max(y_off, eW_m + 0.5))
    ax.axis("off")
    title = (f"Containerisation — {n} × {env_name}  ({rep['utilisation_pct']:.0f}% floor utilisation)")
    if n > len(drawn):
        title += f"   ·   showing {len(drawn)} of {n}"
    ax.set_title(title, fontsize=11, loc="left")

    # side panel
    px = fig.add_axes([0.72, 0.10, 0.26, 0.82]); px.axis("off")
    lines = [f"FIELD-ERECTED / EXTERNAL ({rep['external_count']}):"]
    for e in rep["external"][:16]:
        lines.append(f"  • {e['name'][:30]} [{e['shape']}]")
    if rep["external_count"] > 16:
        lines.append(f"  • … +{rep['external_count']-16} more")
    fx = rep.get("output_flex")
    if fx:
        lines.append("")
        lines.append(f"OUTPUT-FLEX ({fx['metric'] or 'output'}, {fx['unit']}):")
        for k, v in fx["output_for_containers"].items():
            lines.append(f"  {k} container(s) → {v:g}")
    px.text(0, 1.0, "\n".join(lines), va="top", ha="left", fontsize=7.0, family="monospace", color="#222")

    drawings = out_dir / "drawings"
    drawings.mkdir(parents=True, exist_ok=True)
    out_png = drawings / "envelope-packing.png"
    fig.savefig(out_png, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    # also persist the machine-readable report for the renderer + downstream
    (out_dir / "envelope-fit-report.json").write_text(json.dumps(rep, indent=1))
    return out_png.exists()


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__); return 0
    out_dir = Path(argv[0]).resolve()
    env_name = "40ft-hi-cube"
    if "--env" in argv:
        env_name = argv[argv.index("--env") + 1]
    ok = draw(out_dir, env_name)
    print(f"[envelope-pack] {'wrote' if ok else 'FAILED'} {out_dir/'drawings'/'envelope-packing.png'} "
          f"+ envelope-fit-report.json ({env_name})")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
