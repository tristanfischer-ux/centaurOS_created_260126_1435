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
    # The packer reserves an access aisle from the WIDTH; draw it as a labelled band so the
    # empty strip reads as a walkway (intentional), not as wasted space — and so the
    # equipment footprints don't look like they fill the box when utilisation is ~35%.
    aisle = min(getattr(efa, "ACCESS_AISLE_M", 0.8), max(0.0, eW_m - 1.0))
    eW_eq = eW_m - aisle                                  # equipment band depth
    containers = rep["packing"]   # qty-aware placed pack from the audit (single source of truth)
    n = max(1, len(containers))

    # Draw up to MAX_DRAW representative containers; note the rest. A 40ft floor is long-thin
    # (≈5:1) — stacking 6 of them single-column letterboxes each into an unreadable sliver, so
    # lay them out in a 2-COLUMN grid: the content fills the frame and each container is legible.
    MAX_DRAW = 6
    drawn = containers[:MAX_DRAW]
    ncol = 1 if len(drawn) <= 2 else 2
    nrow = (len(drawn) + ncol - 1) // ncol
    gap_x = eL_m * 0.10
    gap_y = eW_m * 1.05                                   # room for the per-container label
    grid_w = ncol * eL_m + (ncol - 1) * gap_x
    fig_w = 14.5
    fig_h = max(3.6, min(12.0, (fig_w * 0.92) * (nrow * (eW_m + gap_y)) / max(grid_w, 1e-6) + 1.3))
    fig = plt.figure(figsize=(fig_w, fig_h), dpi=150)
    ax = fig.add_axes([0.04, 0.13, 0.92, 0.77])
    ax.set_aspect("equal")
    legend_modules: list[str] = []
    for i, c in enumerate(drawn):
        col, row = i % ncol, i // ncol
        x0 = col * (eL_m + gap_x)
        y0 = -row * (eW_m + gap_y)                        # rows descend
        ax.add_patch(Rectangle((x0, y0), eL_m, eW_m, fill=False, edgecolor="#222", lw=1.4))
        if aisle > 0.05:                                  # labelled access-aisle band (top strip)
            ax.add_patch(Rectangle((x0, y0 + eW_eq), eL_m, aisle, facecolor="#f4f4f4",
                                   edgecolor="#e2e2e2", lw=0.4, hatch="////"))
            if i == 0:
                ax.text(x0 + eL_m / 2, y0 + eW_eq + aisle / 2, f"access aisle  {aisle:.1f} m",
                        ha="center", va="center", fontsize=5.5, color="#9a9a9a", style="italic")
        ax.text(x0 + 0.05, y0 + eW_m + 0.10, f"{env_name}  #{i+1}  ·  {len(c)} skids",
                fontsize=7.5, color="#222")
        for it in c:
            ax.add_patch(Rectangle((x0 + it["x"], y0 + it["y"]), it["w"], it["d"],
                                   facecolor=_colour(it["module"]), edgecolor="white",
                                   lw=0.6, alpha=0.92))
            if it["module"] not in legend_modules:
                legend_modules.append(it["module"])
            if it["w"] > 1.1 and it["d"] > 0.45:
                ax.text(x0 + it["x"] + it["w"] / 2, y0 + it["y"] + it["d"] / 2, it["label"][:16],
                        ha="center", va="center", fontsize=4.6, color="white")
    bottom_y = -(nrow - 1) * (eW_m + gap_y)
    sb_y = bottom_y - gap_y * 0.5                         # scale bar under the grid (lower-left)
    ax.plot([0, 2.0], [sb_y, sb_y], color="#222", lw=1.4)
    for xx in (0.0, 2.0):
        ax.plot([xx, xx], [sb_y - 0.07, sb_y + 0.07], color="#222", lw=1.4)
    ax.text(1.0, sb_y - 0.20, "2 m", ha="center", va="top", fontsize=7, color="#222")
    ax.set_xlim(-0.4, grid_w + 0.4)
    ax.set_ylim(sb_y - 0.45, eW_m + 0.7)
    ax.axis("off")
    title = (f"Containerisation — {n} × {env_name}  ({eL_m:.1f}×{eW_m:.2f} m floor each)  ·  "
             f"{rep['utilisation_pct']:.0f}% floor used")
    if n > len(drawn):
        title += f"  ·  showing {len(drawn)} of {n}"
    ax.set_title(title, fontsize=11, loc="left")

    # module colour key — a thin strip along the bottom (replaces the old redundant monospace
    # panel; the field-erected list + output-flex are rendered as proper prose on the PDF page).
    if legend_modules:
        lx = fig.add_axes([0.04, 0.015, 0.92, 0.07]); lx.axis("off")
        lx.set_xlim(0, 1); lx.set_ylim(0, 1)
        cx = 0.0
        for m in legend_modules[:7]:
            label = m.replace("_", " ")[:22]
            lx.add_patch(Rectangle((cx, 0.30), 0.016, 0.42, facecolor=_colour(m),
                                   edgecolor="white", lw=0.5))
            lx.text(cx + 0.022, 0.51, label, ha="left", va="center", fontsize=6.5, color="#333")
            cx += 0.022 + 0.0115 * len(label) + 0.022
            if cx > 0.97:
                break

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
