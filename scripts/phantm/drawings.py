"""PHANTM actuator — dimensioned drawing set of the FIXED design (Increment J).

Four sheets, Tony-CAD colour language (steel grey, translator gold, coils red,
magnets cyan):
  D1  axial section  — 3 poles + translator, teeth/gaps/spacing dims
  D2  transverse section at a pole — the REAL horseshoe wrap + envelope
  D3  tooth-mesh detail — 20 µm gap vs 77.5 µm baseline ghost
  D4  build sequence — how it is made, incl. the closed-loop coil problem

All dims in µm on the drawings (values in mm in code). Baseline deltas called
out in orange. Run: ~/.venvs/phantm/bin/python drawings.py  → out/drawing-D*.png
"""

import datetime
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch, Polygon, Rectangle

STEEL, GOLD, COIL, MAG = "#9aa3ad", "#e8c96a", "#c0392b", "#35c4d7"
INK, MUT, DELTA = "#1a1a1a", "#666666", "#d35400"
OUT = __file__.rsplit("/", 1)[0] + "/out"

# fixed-design geometry (mm)
P = 0.464; T = 0.232; G = 0.020; G0 = 0.0775
HT = 1.549 / 2; SLOT_T = 0.465; SS_D = 0.465; SS_SLOT = 0.155
POLE_AX = 1.16; SPACING = 0.374          # AS ANALYSED (brief); exact = 386.7/390 — see note
BR_T = 0.348                              # bridge axial thickness ×1.5 (was 0.232)
PM_L = 0.243


def dim(ax, x0, y0, x1, y1, text, offset=0.12, color=INK, fs=7.5, ha="center"):
    """Dimension line with arrows + label (horizontal or vertical)."""
    if y0 == y1:  # horizontal
        yd = y0 + offset
        ax.plot([x0, x0], [y0, yd + 0.02], color=MUT, lw=0.5)
        ax.plot([x1, x1], [y1, yd + 0.02], color=MUT, lw=0.5)
        ax.add_patch(FancyArrowPatch((x0, yd), (x1, yd), arrowstyle="<->",
                                     mutation_scale=7, color=color, lw=0.8))
        ax.annotate(text, ((x0 + x1) / 2, yd), textcoords="offset points",
                    xytext=(0, 3), ha=ha, color=color, fontsize=fs)
    else:         # vertical
        xd = x0 + offset
        ax.plot([x0, xd + 0.02], [y0, y0], color=MUT, lw=0.5)
        ax.plot([x1, xd + 0.02], [y1, y1], color=MUT, lw=0.5)
        ax.add_patch(FancyArrowPatch((xd, y0), (xd, y1), arrowstyle="<->",
                                     mutation_scale=7, color=color, lw=0.8))
        ax.annotate(text, (xd, (y0 + y1) / 2), textcoords="offset points",
                    xytext=(4, 0), va="center", ha="left", color=color, fontsize=fs)


def toothed_path(x0, x1, face, recess, centres, up=True):
    """Polygon pts along a toothed face; teeth (lands) at ±T/2 around centres."""
    s = 1 if up else -1
    pts, x = [], x0
    lands = [(c - T / 2, c + T / 2) for c in centres if c + T / 2 > x0 and c - T / 2 < x1]
    for a, b in lands:
        a, b = max(a, x0), min(b, x1)
        pts += [(x, recess), (a, recess), (a, face), (b, face)]
        x = b
    pts += [(x, recess), (x1, recess)]
    return pts


STAMP = datetime.datetime.now().strftime("%Y-%m-%d %H:%M %Z").strip()


def sheet(figsize, title):
    fig, ax = plt.subplots(figsize=figsize, dpi=170)
    ax.set_aspect("equal"); ax.axis("off")
    ax.set_title(title, loc="left", fontsize=11, fontweight="bold", color=INK)
    fig.text(0.995, 0.005, f"PHANTM fixed design — generated {STAMP}", ha="right",
             va="bottom", fontsize=6.5, color=MUT)
    return fig, ax


def d1_axial():
    fig, ax = sheet((11, 5.2), "D1 — Axial section: 3 poles on the toothed translator "
                               "(FIXED design; dims µm)")
    x_left, x_right = -0.8, 5.6
    # translator bar with teeth both faces
    centres = [k * P for k in range(-3, 14)]
    top = toothed_path(x_left, x_right, HT, HT - SLOT_T, centres)
    bot = [(x, -y) for x, y in reversed(top)]
    ax.add_patch(Polygon(top + bot, closed=True, fc=GOLD, ec=INK, lw=0.7, zorder=2))
    # 3 poles
    pole_x0 = 0.0
    for k in range(3):
        px = pole_x0 + k * (POLE_AX + SPACING)
        for s in (1, -1):
            tipy = s * (HT + G)
            backy = s * (HT + G + SS_D)
            pc = [px + 0.116 + j * P for j in range(3)]
            face = toothed_path(px, px + POLE_AX, tipy, s * (HT + G + SS_SLOT), pc)
            poly = face + [(px + POLE_AX, backy), (px, backy)]
            ax.add_patch(Polygon(poly, closed=True, fc=STEEL, ec=INK, lw=0.7, zorder=2))
        # coil marks at pole ends (bridge is transverse — shown hatched behind)
        ax.add_patch(Rectangle((px + POLE_AX / 2 - 0.12, HT + G + SS_D + 0.05), 0.24, 0.16,
                               fc=COIL, ec=INK, lw=0.5, zorder=1, alpha=0.85))
        ax.annotate(f"pole {k}", (px + POLE_AX / 2, -(HT + G + SS_D) - 0.16),
                    ha="center", fontsize=8, color=INK)
    # dims
    dim(ax, 4.756 - T / 2, HT + 0.25, 4.756 + T / 2, HT + 0.25, "tooth 232", offset=0.12)
    dim(ax, 0.116, -HT - 0.9, 0.116 + P, -HT - 0.9, "pitch 464", offset=-0.12)
    dim(ax, 0, HT + G + SS_D + 0.32, POLE_AX, HT + G + SS_D + 0.32, "pole 1160")
    dim(ax, POLE_AX, HT + G + SS_D + 0.32, POLE_AX + SPACING, HT + G + SS_D + 0.32,
        "gap 374*", color=DELTA)
    dim(ax, 0, HT + G + SS_D + 0.78, 3 * POLE_AX + 2 * SPACING, HT + G + SS_D + 0.78,
        "stator axial extent 4228")
    ax.annotate("* drawn at the AS-ANALYSED 374 µm spacing (steps 173/146/145 µm).\n"
                "  Fix F3 recommends 386.7 µm (pitch 464) / 390 µm (pitch 465) for uniform steps;\n"
                "  Tony CAD reads 400 µm — reconcile (report Q5/Q6).",
                (x_left, -HT - 1.35), fontsize=8, color=DELTA, va="top")
    ax.annotate("translator 1549×1550 ×12500 long (unchanged)", (4.5, -HT - 2.15),
                fontsize=8, color=INK, ha="center")
    ax.set_xlim(x_left - 0.2, x_right + 0.2); ax.set_ylim(-3.0, 2.6)
    fig.tight_layout(); fig.savefig(f"{OUT}/drawing-D1-axial.png"); plt.close(fig)


def d2_transverse():
    fig, ax = sheet((7.6, 6.4), "D2 — Transverse section at a pole: horseshoe wrap "
                                "(FIXED design; dims µm)")
    tw = 1.55 / 2          # translator transverse half-width
    ss_w = 1.708 / 2
    # translator (gold)
    ax.add_patch(Rectangle((-tw, -HT), 2 * tw, 2 * HT, fc=GOLD, ec=INK, lw=0.8, zorder=3))
    # slot-sections above/below (teeth out-of-plane; shown solid)
    for s in (1, -1):
        y0 = s * (HT + G) if s > 0 else s * (HT + G + SS_D)
        ax.add_patch(Rectangle((-ss_w, min(y0, y0 + SS_D * (1 if s > 0 else 1))),
                               2 * ss_w, SS_D, fc=STEEL, ec=INK, lw=0.8, zorder=2))
    # bridge limb on the left (transverse wrap), width 1.162 drawn as depth into page —
    # in this plane the limb shows its radial run + transverse thickness
    limb_x0 = -ss_w - 0.55
    span = HT + G + SS_D
    ax.add_patch(Rectangle((limb_x0, -span), 0.35, 2 * span, fc=STEEL, ec=INK, lw=0.8, zorder=2))
    # joins limb→slot-sections
    for s in (1, -1):
        ax.add_patch(Rectangle((limb_x0 + 0.35, s * (HT + G) if s > 0 else -span),
                               -ss_w - (limb_x0 + 0.35) + 0.0, SS_D, fc=STEEL, ec=INK,
                               lw=0.8, zorder=1))
    # PM in limb (cyan) + coil around limb (red)
    ax.add_patch(Rectangle((limb_x0, -PM_L / 2), 0.35, PM_L, fc=MAG, ec=INK, lw=0.8, zorder=4))
    ax.add_patch(Rectangle((limb_x0 - 0.13, 0.45), 0.61, 0.5, fc=COIL, ec=INK, lw=0.7,
                           zorder=3, alpha=0.9))
    ax.annotate("coil 20t × Ø50 µm\n(pre-wound, slipped on)", (limb_x0 + 0.24, 0.7),
                fontsize=7.5, ha="left", color=INK,
                xytext=(limb_x0 - 0.35, 2.05), textcoords="data",
                arrowprops=dict(arrowstyle="->", color=MUT, lw=0.7))
    ax.annotate(f"NdFeB Pm = 243 µm\nsection ×1.5 (=0.348×1162)", (limb_x0 + 0.17, 0),
                fontsize=7.5, ha="left", color=DELTA,
                xytext=(limb_x0 + 0.85, -0.75), textcoords="data",
                arrowprops=dict(arrowstyle="->", color=DELTA, lw=0.8))
    # dims
    dim(ax, -tw, -HT - 0.5, tw, -HT - 0.5, "1549", offset=-0.12)
    dim(ax, -ss_w, -(HT + G + SS_D) - 0.28, ss_w, -(HT + G + SS_D) - 0.28, "1708",
        offset=-0.14)
    dim(ax, ss_w + 0.30, -(HT + G), ss_w + 0.30, HT + G, "1589\n(=1549+2×20*)",
        offset=0.0, color=DELTA)
    dim(ax, ss_w + 1.55, -span, ss_w + 1.55, span, "2634\nenvelope", offset=0.0)
    # Tony frame ghost
    ax.annotate("schematic: the bridge limb is drawn rotated into the section plane; in the device it\n"
                "runs along the transverse END of the slot-sections. Bearing/frame block in Tony's CAD\n"
                "(1784 × 3098, sited axially over the plain shaft) is NOT shown — it, not the magnetics,\n"
                "dominates the cell-fit budget (§5.1).",
                (0.2, -3.35), ha="center", fontsize=8, color=MUT)
    ax.annotate("* working gap 77.5 → 20 µm (fix F1)", (0, 2.55), ha="center",
                fontsize=8.5, color=DELTA)
    ax.set_xlim(-3.3, 3.8); ax.set_ylim(-3.75, 2.95)
    fig.tight_layout(); fig.savefig(f"{OUT}/drawing-D2-transverse.png"); plt.close(fig)


def d3_tooth_detail():
    fig, ax = sheet((8.2, 4.6), "D3 — Tooth mesh detail (dims µm)")
    centres = [0.0, P, 2 * P]
    top = toothed_path(-0.25, 1.2, HT, HT - SLOT_T, centres)
    ax.add_patch(Polygon(top + [(1.2, HT - 0.75), (-0.25, HT - 0.75)], closed=True,
                         fc=GOLD, ec=INK, lw=0.8))
    tipy = HT + G
    pc = [c for c in centres]
    face = toothed_path(-0.25, 1.2, tipy, tipy + SS_SLOT, pc)
    ax.add_patch(Polygon(face + [(1.2, tipy + 0.4), (-0.25, tipy + 0.4)], closed=True,
                         fc=STEEL, ec=INK, lw=0.8))
    # baseline gap ghost
    ax.plot([-0.25, 1.2], [HT + G0, HT + G0], color=DELTA, lw=1.0, ls="--")
    ax.annotate("baseline stator face (gap 77.5)", (1.18, HT + G0), fontsize=7.5,
                color=DELTA, ha="right", va="bottom")
    dim(ax, -0.12, HT, -0.12, HT + G, "gap 20 (was 77.5)", offset=-0.55, color=DELTA)
    dim(ax, -T / 2, HT - SLOT_T - 0.18, T / 2, HT - SLOT_T - 0.18, "232", offset=-0.08)
    dim(ax, T / 2, HT - SLOT_T - 0.18, P - T / 2, HT - SLOT_T - 0.18, "232", offset=-0.08)
    dim(ax, 0.62, HT - SLOT_T, 0.62, HT, "465", offset=0.32)
    dim(ax, 0.62 + P, tipy, 0.62 + P, tipy + SS_SLOT, "155", offset=0.32)
    ax.annotate("teeth, pitch, slot depths UNCHANGED — the gap closes by moving the whole\n"
                "stator body toward the translator at assembly (datum shift, fix F1);\n"
                "tooth geometry is identical. Bridge/PM section grows out-of-plane (fix F2)",
                (0.48, HT - 0.62), ha="center", fontsize=8.5, color=INK)
    ax.set_xlim(-0.85, 1.35); ax.set_ylim(HT - 0.85, HT + 0.62)
    fig.tight_layout(); fig.savefig(f"{OUT}/drawing-D3-tooth-detail.png"); plt.close(fig)


def d4_build_sequence():
    fig, axes = plt.subplots(1, 5, figsize=(12.5, 3.4), dpi=170)
    fig.suptitle("D4 — Build sequence (the coil problem drives the order)",
                 x=0.02, ha="left", fontsize=11, fontweight="bold", color=INK)
    steps = [
        ("1. Mould micro-MIM parts", "translator + 6 slot-sections\n+ 3 bridge bars in\nmicro-MIM Fe-3%Si\n(pressed SMC cannot form\n232 µm teeth — §5)"),
        ("2. Pre-wind coils", "20t × Ø50 µm on a\nremovable former →\nself-bonded coil\n"
         "(bondable magnet wire)"),
        ("3. Slip coil + PM\nonto OPEN bridge", "bridge is a straight bar\nBEFORE closing "
         "the loop;\ncoil slides over;\nPM slug bonded in series"),
        ("4. Close loop +\nset gaps", "bridge joins the two\nslot-sections; 20 µm gap\n"
         "set by precision shims /\nactive measurement"),
        ("5. Magnetise + test", "magnetise NdFeB\nin-situ (pulse fixture);\ndetent-force "
         "100% test\n= the gap gauge"),
    ]
    for ax, (title, body) in zip(axes, steps):
        ax.axis("off")
        ax.add_patch(Rectangle((0.03, 0.08), 0.94, 0.84, fill=False, ec=MUT, lw=1.0,
                               transform=ax.transAxes))
        ax.text(0.5, 0.86, title, transform=ax.transAxes, ha="center", va="top",
                fontsize=9.5, fontweight="bold", color=INK)
        ax.text(0.5, 0.60, body, transform=ax.transAxes, ha="center", va="top",
                fontsize=8, color=INK)
    fig.text(0.02, 0.02,
             "THE COIL CONSTRAINT: once the horseshoe closes, the bridge is a closed magnetic loop — a coil cannot be wound on it in volume. "
             "It must be pre-wound and slipped over the open bridge bar (step 3) before the loop closes (step 4). This fixes the assembly order.",
             fontsize=8, color=DELTA)
    fig.tight_layout(rect=(0, 0.07, 1, 0.93))
    fig.savefig(f"{OUT}/drawing-D4-build-sequence.png"); plt.close(fig)


if __name__ == "__main__":
    d1_axial(); d2_transverse(); d3_tooth_detail(); d4_build_sequence()
    print("wrote drawing-D1..D4 to out/")
