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
    ax.annotate("coil 20t × Ø50 µm\n(wound in situ — §5.2)", (limb_x0 + 0.24, 0.7),
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
                "dominates the cell-fit budget (report §4.5, Q8).",
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
    ax.annotate("each opposing slot-section is set 57.5 µm inward at assembly, reducing both\n"
                "working gaps 77.5 → 20 µm (fix F1). Translator teeth (232 µm) and slots (232 µm)\n"
                "are unchanged. Bridge/PM section grows out-of-plane (fix F2)",
                (0.48, HT - 0.62), ha="center", fontsize=8.5, color=INK)
    ax.set_xlim(-0.85, 1.35); ax.set_ylim(HT - 0.85, HT + 0.62)
    fig.tight_layout(); fig.savefig(f"{OUT}/drawing-D3-tooth-detail.png"); plt.close(fig)


def d4_build_sequence():
    fig, axes = plt.subplots(1, 5, figsize=(12.5, 3.4), dpi=170)
    fig.suptitle("D4 — Build sequence (corrected 24 Jul: the pole is an OPEN horseshoe until the translator enters)",
                 x=0.02, ha="left", fontsize=11, fontweight="bold", color=INK)
    steps = [
        ("1. Mould micro-MIM parts", "translator + 3 MONOLITHIC\nhorseshoe poles in\nmicro-MIM Fe-3%Si\n(pressed SMC cannot form\n232 µm teeth — §5)"),
        ("2. Wind coils", "Route A: wind 20t × Ø50 µm\nIN SITU on the one-piece\npole's bridge limb\n(Route B: pre-wound coil\nslipped on a 2-piece pole)"),
        ("3. Bond magnet slug", "NdFeB slug bonded\nUNMAGNETISED into the\nmagnetic path (magnetised\nparts snap at ≈37,000×\ntheir weight — §5.3)"),
        ("4. Insert translator +\nset gaps", "translator slides in\nAXIALLY; 20 µm gap\nset by precision shims /\nactive measurement"),
        ("5. Magnetise + test", "magnetise NdFeB through\nthe assembled pole\n(supplier service — §5.5);\ndetent-force 100% test\n= the gap gauge"),
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
             "CORRECTED (Tony, 24 Jul): the pole steel alone is an OPEN horseshoe — its circuit closes only THROUGH the translator, which enters last. "
             "Winding is never blocked; a MONOLITHIC pole (no bonded joints in the flux path, ≈5–15% detent saved vs glued two-piece) becomes the baseline.",
             fontsize=8, color=DELTA)
    fig.tight_layout(rect=(0, 0.07, 1, 0.93))
    fig.savefig(f"{OUT}/drawing-D4-build-sequence.png"); plt.close(fig)


PCB_GRN = "#2f7d4f"


def d5_cell_integration():
    """Side cross-section: hex cell + moving short + actuator + PCB stack (mm)."""
    fig, ax = sheet((12.5, 5.6), "D5 — Hex cell + actuator integration, axial cross-section "
                                 "(dims mm; cell interior 3.10, depth 7.75)")
    IN2 = 3.10 / 2          # interior half-height
    W = 0.15                # wall
    DEP = 7.75
    d_short = 3.4           # drawn short depth (mid-travel)
    # cell walls
    for s in (1, -1):
        ax.add_patch(Rectangle((0, s * IN2), DEP, s * W, fc=STEEL, ec=INK, lw=0.8))
    # back wall with clearance hole Ø2.6
    ax.add_patch(Rectangle((DEP, 1.3), 0.5, IN2 + W - 1.3, fc=STEEL, ec=INK, lw=0.8))
    ax.add_patch(Rectangle((DEP, -IN2 - W), 0.5, (IN2 + W) - 1.3, fc=STEEL, ec=INK, lw=0.8))
    # aperture PCB with hole
    px = DEP + 1.1
    for s in (1, -1):
        ax.add_patch(Rectangle((px, 1.3 if s > 0 else -IN2 - W - 1.2), 1.6,
                               (IN2 + W + 1.2) - 1.3, fc=PCB_GRN, ec=INK, lw=0.8))
    ax.text(px + 0.8, IN2 + W + 1.55, "aperture PCB 1.6\n(pads + select FETs)",
            ha="center", fontsize=7, color=PCB_GRN)
    # translator (gold) with tooth hint, foil + standoff at nose
    trans_y = 1.549 / 2
    ax.add_patch(Rectangle((d_short + 0.25, -trans_y), 12.5, 2 * trans_y,
                           fc=GOLD, ec=INK, lw=0.8))
    for k in range(10):
        x = d_short + 3.4 + k * 0.464
        for s in (1, -1):
            ax.add_patch(Rectangle((x, s * trans_y - (0.14 if s > 0 else 0)), 0.232,
                                   0.14, fc="white", ec=INK, lw=0.4))
    ax.add_patch(Rectangle((d_short + 0.05, -1.0), 0.2, 2.0, fc="#cccccc", ec=INK, lw=0.6))
    ax.add_patch(Rectangle((d_short - 0.05, -(IN2 - 0.15)), 0.1, 2 * (IN2 - 0.15),
                           fc=MAG, ec=INK, lw=0.8))
    ax.text(d_short - 0.15, -IN2 - 0.62, "20 µm Cu foil short (moving)\n+ plastic standoff s (Vlad)",
            ha="center", fontsize=7, color=INK)
    # stator behind PCB
    sx = px + 2.6
    for s in (1, -1):
        ax.add_patch(Rectangle((sx, s * (trans_y + 0.02)), 4.23, s * 0.465,
                               fc=STEEL, ec=INK, lw=0.8))
        ax.add_patch(Rectangle((sx + 1.5, s * (trans_y + 0.5)), 1.2, s * 0.45,
                               fc=COIL, ec=INK, lw=0.8))
    ax.text(sx + 2.1, trans_y + 1.75, "actuator stator (3 poles + coils + PM)\nmounted on the backplate",
            ha="center", fontsize=7.5, color=INK)
    # travel band + phase note
    ax.annotate("", (0.35, 0), (0.35 + 3.33, 0),
                arrowprops=dict(arrowstyle="<->", color=DELTA, lw=1.3))
    ax.text(2.0, 0.28, "short travel λg/2 @70 GHz = 3.33", fontsize=7.5, color=DELTA,
            ha="center")
    ax.text(1.6, -2.75, "phase = 4π·d/λg   ·   everything behind the short is field-free —\n"
            "the actuator sits inside the footprint of the cell it controls",
            fontsize=8, color=INK)
    # dims
    dim(ax, 0, -IN2, 0, IN2, "3.10 interior", offset=-0.55)
    dim(ax, 0, IN2 + W + 0.25, DEP, IN2 + W + 0.25, "7.75 cell depth", offset=0.3)
    dim(ax, DEP + 0.05, -1.3, DEP + 0.05, 1.3, "Ø2.6 holes", offset=0.75)
    ax.text(0.05, IN2 + 0.32, "wall 0.15", fontsize=7, color=MUT)
    ax.set_xlim(-1.4, 17.2); ax.set_ylim(-3.3, 3.6)
    fig.tight_layout(); fig.savefig(f"{OUT}/drawing-D5-cell-integration.png"); plt.close(fig)


def d6_pcb():
    """Aperture-PCB face (hole pattern) + electronics stack summary."""
    import math as _m
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12.5, 5.2), dpi=170,
                                 gridspec_kw={"width_ratios": [1, 1.15]})
    fig.suptitle("D6 — Drive PCB: hole pattern, stack and power/control budget",
                 x=0.02, ha="left", fontsize=11, fontweight="bold", color=INK)
    fig.text(0.995, 0.005, f"PHANTM fixed design — generated {STAMP}", ha="right",
             va="bottom", fontsize=6.5, color=MUT)
    a1.set_aspect("equal"); a1.axis("off")
    a1.set_title("Aperture-board face — 7-cell tile shown (24-hex identical pattern)",
                 fontsize=9)
    P7 = 3.25
    centres = [(0, 0)] + [(P7 * _m.cos(_m.radians(a)), P7 * _m.sin(_m.radians(a)))
                          for a in range(0, 360, 60)]
    for cx, cy in centres:
        hexpts = [(cx + P7 / _m.sqrt(3) * _m.cos(_m.radians(a + 30)),
                   cy + P7 / _m.sqrt(3) * _m.sin(_m.radians(a + 30)))
                  for a in range(0, 360, 60)]
        a1.add_patch(Polygon(hexpts, fill=False, ec=MUT, lw=0.8, ls=":"))
        a1.add_patch(plt.Circle((cx, cy), 1.3, fc="white", ec=INK, lw=1.2))
        for k in range(3):
            a1.add_patch(plt.Circle((cx + 1.62 * _m.cos(_m.radians(90 + k * 120)),
                                     cy + 1.62 * _m.sin(_m.radians(90 + k * 120))),
                                    0.13, fc=COIL, ec=None))
        a1.add_patch(Rectangle((cx - 0.35, cy - 1.85), 0.7, 0.42, fc=PCB_GRN, ec=INK, lw=0.5))
    a1.set_facecolor("#eef3ee")
    dim(a1, centres[1][0], centres[1][1], centres[2][0], centres[2][1],
        "pitch 3.25", offset=0.5)
    a1.text(0, -1.05, "Ø2.6", ha="center", fontsize=7, color=INK)
    a1.text(0, -5.3, "per cell: Ø2.6 clearance hole (translator tail) · 3 coil-pad pairs (red)\n"
            "· dual select-FET (green) · min web 0.65 mm, 2 oz Cu",
            ha="center", fontsize=8, color=INK)
    a1.set_xlim(-6.2, 6.2); a1.set_ylim(-6.2, 6.2)
    a2.axis("off")
    a2.set_title("Stack + power/control budget (drive-electronics.json)", fontsize=9)
    rows = [
        ("STACK", "hex lattice 7.75 → back skin → APERTURE PCB 1.6 (pads + select FETs)"
                  " → board-to-board → DRIVER PCB (3 phase H-bridges, buck, MCU)"),
        ("Rail", "5 V → buck 0.8–2.1 V, DAC-set — the RAIL VOLTAGE is the current "
                 "control (resistive coil): 1.0 V→1.8 A step, 2.0 V→3.6 A ≈ Ic*"),
        ("Per coil", "0.552 Ω · τ 1.1 µs · pulse 1.5 ms · 2.7 mJ/step"),
        ("Per 24-cell tile", "72 coils · re-point 0.65 J · 8-parallel: 57.6 W burst "
                             "(26.8 A rail), 0.12 s · idle 0 W (zero-power hold)"),
        ("10 cm aperture", "≈1,093 cells · 29.3 J/re-point · 5.5 s @8-par (58 W) or "
                           "0.72 s @64-par (461 W burst)"),
        ("Control", "per-tile MCU, open-loop step counting into detents; hold-then-"
                    "release capture (§4.4); tiles daisy-chained (CAN/SPI); host sends "
                    "per-cell target depth map"),
        ("Polarity", "phase bridges full-H: drive current must AID the PM "
                     "(FE sign convention)"),
    ]
    y = 0.95
    for head, body in rows:
        a2.text(0.01, y, head, fontsize=8.5, fontweight="bold", color=INK, va="top")
        a2.text(0.22, y, body, fontsize=8, color=INK, va="top", wrap=True)
        y -= 0.135
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig(f"{OUT}/drawing-D6-pcb.png"); plt.close(fig)


if __name__ == "__main__":
    d1_axial(); d2_transverse(); d3_tooth_detail(); d4_build_sequence()
    d5_cell_integration(); d6_pcb()
    print("wrote drawing-D1..D6 to out/")
