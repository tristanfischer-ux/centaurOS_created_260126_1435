"""PHANTM actuator — final report + figures (Increment G).

Builds out/PHANTM-ACTUATOR-REPORT.md + four PNG figures from the result files:
five-numbers.json (network v1), femm-five-numbers.json + femm-curves.npz
(baseline FE), femm-variants.json, fixed-design.json + fixed-design-curves.npz,
dynamics.json, cost.json, scorecard.json.

Figures follow the dataviz procedure: line charts for force-vs-position (change
over position), single-hue bars for the variant comparison, categorical slots in
fixed order (blue #2a78d6, orange #eb6834), thin marks, no dual axes, recessive
grid, direct labels, light mode.

Run:  ~/.venvs/phantm/bin/python report.py
"""

from __future__ import annotations

import json
import os

import datetime
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

import geometry as geo
from params import BASELINE, G_ACCEL

OUT = os.path.join(os.path.dirname(__file__), "out")
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
INK, MUTED, GRID = "#1a1a1a", "#666666", "#e4e4e4"


def load(name, binary=False):
    p = os.path.join(OUT, name)
    if not os.path.exists(p):
        return None
    return np.load(p) if binary else json.load(open(p))


def style_ax(ax, xlabel, ylabel, title):
    ax.spines[["top", "right"]].set_visible(False)
    ax.spines[["left", "bottom"]].set_color(MUTED)
    ax.grid(True, color=GRID, linewidth=0.7, zorder=0)
    ax.set_axisbelow(True)
    ax.set_xlabel(xlabel, color=INK)
    ax.set_ylabel(ylabel, color=INK)
    ax.set_title(title, color=INK, loc="left", fontsize=11, fontweight="bold")
    ax.tick_params(colors=MUTED)


def fig_detent(fd_mn):
    base = load("femm-curves.npz", binary=True)
    fixed = load("fixed-design-curves.npz", binary=True)
    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=150)
    if fixed is not None:
        ax.plot(fixed["xs_detent"] * 1e6, fixed["f_detent"] * 1e3, color=BLUE,
                linewidth=2, label="Fixed design (FE)", zorder=3)
    if base is not None:
        # reconstruct the baseline 3-pole net curve from the single-pole sweep
        from femm.sweep import FeForceModel, net_force
        model = FeForceModel(base["xs"], base["fx_detent"])
        offs = geo.pole_phasing(BASELINE)[1]
        xg = np.linspace(-0.232, 0.232, 241)
        ax.plot(xg * 1e3, net_force(xg, None, model, offs) * 1e3,
                color=ORANGE, linewidth=2,
                label="Baseline (FE, at its best Pm)", zorder=3)
    ax.axhline(fd_mn, color=MUTED, linewidth=1, linestyle="--", zorder=1)
    ax.axhline(-fd_mn, color=MUTED, linewidth=1, linestyle="--", zorder=1)
    ax.annotate(f"±Fd = {fd_mn:.1f} mN", xy=(0.99, fd_mn), xycoords=("axes fraction", "data"),
                ha="right", va="bottom", color=MUTED, fontsize=9)
    style_ax(ax, "translator position (µm)", "net detent force (mN)",
             "Zero-current detent force over one tooth pitch — 3 poles")
    ax.legend(frameon=False, loc="lower left", fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "fig-detent.png"))
    plt.close(fig)


def fig_drive(fd_mn, step_um):
    fixed = load("fixed-design-curves.npz", binary=True)
    if fixed is None:
        return
    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=150)
    ax.plot(fixed["xs_detent"] * 1e6, fixed["f_drive"] * 1e3, color=BLUE, linewidth=2,
            label=f"Fixed design, one coil at Ic = {float(fixed['ic_a']):.2f} A", zorder=3)
    ax.plot(fixed["xs_detent"] * 1e6, fixed["f_detent"] * 1e3, color=ORANGE,
            linewidth=2, label="fixed design, detent only (i = 0)", zorder=2)
    sw = load("pm-ic-sweeps.npz", binary=True)
    if sw is not None and "baseline_drive_x_mm" in sw:
        ax.plot(sw["baseline_drive_x_mm"] * 1e3, sw["baseline_drive_f_n"] * 1e3,
                color=AQUA, linewidth=2, label="BASELINE, one coil at 4 A", zorder=2)
    ax.axvspan(0, step_um, color=GRID, alpha=0.5, zorder=0)
    ax.annotate("step path", xy=(step_um / 2, 0.02), xycoords=("data", "axes fraction"),
                ha="center", color=MUTED, fontsize=9)
    ax.axhline(2 * fd_mn, color=MUTED, linewidth=1, linestyle="--", zorder=1)
    ax.annotate(f"2·Fd = {2*fd_mn:.1f} mN", xy=(0.99, 2 * fd_mn),
                xycoords=("axes fraction", "data"), ha="right", va="bottom",
                color=MUTED, fontsize=9)
    style_ax(ax, "translator position (µm)", "net axial force (mN)",
             "Drive force with one coil energised — fixed design (FE)")
    leg = ax.legend(frameon=True, loc="upper left", fontsize=9)
    leg.get_frame().set_edgecolor("none")
    leg.get_frame().set_alpha(0.95)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "fig-drive.png"))
    plt.close(fig)


def fig_variants(fd_mn):
    v = load("femm-variants.json")
    if v is None:
        return
    names = [r["name"] for r in v["variants"]]
    vals = [r["net_breakaway_mn"] for r in v["variants"]]
    label_map = {"baseline": "baseline (77.5 µm gap)", "gap40": "gap 40 µm",
                 "gap20": "gap 20 µm", "deep_stator_slots": "deep stator slots",
                 "tooth_0p35": "teeth 0.35·pitch",
                 "combo_g40_deep_t0p35": "combo: g40+deep+0.35p",
                 "combo_g20_deep_t0p35": "combo: g20+deep+0.35p"}
    labels = [label_map.get(n, n) for n in names]
    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=150)
    ys = np.arange(len(names))[::-1]
    bars = ax.barh(ys, vals, height=0.55, color=BLUE, zorder=3)
    for y, val in zip(ys, vals):
        ax.annotate(f"{val:.2f}", xy=(val, y), xytext=(4, 0),
                    textcoords="offset points", va="center", color=INK, fontsize=9)
    ax.axvline(fd_mn, color=ORANGE, linewidth=1.5, linestyle="--", zorder=2)
    ax.annotate(f"Fd target {fd_mn:.1f} mN", xy=(fd_mn, len(names) - 0.4),
                ha="left", color=ORANGE, fontsize=9, xytext=(4, 0),
                textcoords="offset points")
    ax.set_yticks(ys, labels)
    style_ax(ax, "net detent breakaway (mN) at Pm = 0.10 mm", "",
             "Recovery levers — FE net detent by geometry variant")
    ax.tick_params(axis="y", colors=INK)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "fig-variants.png"))
    plt.close(fig)


def fig_pm_sweep(fd_mn):
    d = load("pm-ic-sweeps.json")
    if d is None:
        return False
    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=150)
    for name, color, label in (("fixed", BLUE, "Fixed design (gap 20 µm, bridge/PM ×1.5)"),
                               ("baseline", ORANGE, "Baseline (as specified)")):
        rows = d[name]["pm_sweep"]
        ax.plot([r["pm_mm"] * 1e3 for r in rows], [r["breakaway_mn"] for r in rows],
                color=color, linewidth=2, marker="o", markersize=5, label=label, zorder=3)
    ax.axhline(fd_mn, color=MUTED, linewidth=1, linestyle="--", zorder=1)
    ax.annotate(f"Fd = {fd_mn:.1f} mN (task-3 target)", xy=(0.99, fd_mn),
                xycoords=("axes fraction", "data"), ha="right", va="bottom",
                color=MUTED, fontsize=9)
    base_plateau = d["baseline"]["pm_sweep"][-1]["breakaway_mn"]
    ax.annotate(f"baseline plateaus at {base_plateau:.2f} mN — no Pm reaches Fd",
                xy=(450, base_plateau), ha="right", va="bottom", color=ORANGE, fontsize=9)
    style_ax(ax, "magnet length Pm (µm)", "net detent breakaway (mN)",
             "Task 3 as asked: detent force vs magnet length — where Pm for Fd lives")
    ax.legend(frameon=False, loc="center right", fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "fig-pm-sweep.png"))
    plt.close(fig)
    return True


def fig_ic_sweep(fd_mn):
    d = load("pm-ic-sweeps.json")
    if d is None:
        return False
    fig, ax = plt.subplots(figsize=(8, 4.2), dpi=150)
    for name, color, label in (("fixed", BLUE, "Fixed design (at Pm* = 243 µm)"),
                               ("baseline", ORANGE, "Baseline (at its best Pm)")):
        rows = d[name]["ic_sweep"]
        ax.plot([r["ic_a"] for r in rows], [r["peak_mn"] for r in rows],
                color=color, linewidth=2, marker="o", markersize=5, label=label, zorder=3)
    ax.axhline(2 * fd_mn, color=MUTED, linewidth=1, linestyle="--", zorder=1)
    ax.annotate(f"2·Fd = {2*fd_mn:.1f} mN (task-4 target)", xy=(0.99, 2 * fd_mn),
                xycoords=("axes fraction", "data"), ha="right", va="bottom",
                color=MUTED, fontsize=9)
    ax.axvline(1.81, color=MUTED, linewidth=1, linestyle=":", zorder=1)
    ax.annotate("1 V supply ceiling\nI∞ = 1.81 A", xy=(1.81, 0.30),
                xycoords=("data", "axes fraction"), ha="left", va="bottom",
                color=MUTED, fontsize=8, xytext=(4, 0), textcoords="offset points")
    style_ax(ax, "coil current Ic (A), one coil (Nc = 20, Dc = 50 µm)",
             "net drive-force peak over one pitch (mN)",
             "Task 4 as asked: peak drive force vs coil current")
    ax.legend(frameon=False, loc="upper left", fontsize=9)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "fig-ic-sweep.png"))
    plt.close(fig)
    return True


def fig_rise():
    d = load("curves.npz", binary=True)
    if d is None or "t_rise" not in d:
        return
    fig, ax = plt.subplots(figsize=(8, 3.6), dpi=150)
    ax.plot(d["t_rise"] * 1e6, d["i_rise"], color=BLUE, linewidth=2, zorder=3)
    style_ax(ax, "time (µs)", "coil current (A)",
             "Current rise onto 1 V supply (Rc = 0.55 Ω, nonlinear λ–i)")
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "fig-rise.png"))
    plt.close(fig)


def main():
    p = BASELINE
    s = geo.summarise(p)
    fd_mn = p.detent_g_factor * G_ACCEL * s.translator_mass_kg * 1e3
    fe = load("femm-five-numbers.json")
    fixed = load("fixed-design.json")
    dyn = load("dynamics.json")
    cost = load("cost.json")
    score = load("scorecard.json")
    sweeps = load("pm-ic-sweeps.json")
    fig_detent(fd_mn)
    fig_drive(fd_mn, geo.pole_phasing(p)[1][1] * 1000.0)
    fig_pm_sweep(fd_mn)
    fig_ic_sweep(fd_mn)
    fig_variants(fd_mn)
    fig_rise()

    stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M local")
    L = []
    A = L.append
    A("# PHANTM beam-steering actuator — engineering verdict and the design that works (v3)")
    A("")
    A(f"**CONFIDENTIAL — core IP.** Scope: the actuator only. Generated **{stamp}**. "
      "All force numbers are 2D nonlinear finite-element results (native xfemm/FEMM solver, "
      "validated on a gapped C-core to 2.5%, mesh-converged <1%, force cross-checked "
      "weighted-stress-tensor vs co-energy). Reviewed by a 4-seat cross-lineage LLM "
      "council (GPT-5.6-Sol physics fact-check · Grok-4.5 adversarial · MiniMax-M3 "
      "honesty audit; the Kimi-K3 seat returned empty and is recorded as such) — every "
      "surviving finding is incorporated. Code + artefacts: `scripts/phantm/`.")
    A("")
    A("**One-paragraph verdict:** the actuator exactly as drawn cannot generate its "
      "specified forces — the net zero-power detent saturates ≈×15 below the "
      f"{fd_mn:.1f} mN target for any magnet size, because at a 77.5 µm gap the toothed "
      "interface barely modulates. Everything else about the concept is sound. Two "
      "changes fix it — close the working gap to 20 µm and grow the bridge+magnet "
      "cross-section ×1.5 — after which every force requirement is met with a "
      "manufacturable 243 µm magnet. The price is a tolerance class that changes who "
      "can build it and how: the toothed parts must be micro-MIM (pressed SMC cannot "
      "form 232 µm teeth), and the 20 µm gap must be actively set at assembly.")
    A("")

    # ------------------------------------------------------------------ §1
    A("## 1. The current design and its assumptions")
    A("")
    A("A linear variable-reluctance stepper with permanent-magnet detent: an SMC "
      "toothed translator (1.549×1.55×12.5 mm, 232 µm teeth at 464 µm pitch, slots "
      "465 µm deep both faces) runs between three horseshoe pole-pieces, each two "
      "toothed slot-sections (1.16×0.465×1.708 mm, 155 µm slots) bridged by a "
      "0.232×1.162×2.634 mm bar carrying a 20-turn Ø50 µm coil and an NdFeB slug. "
      "Poles are offset ~⅓ tooth pitch for three-phase stepping; a PM detent holds "
      "position at zero power.")
    A("")
    A("Assumptions the brief embeds, made explicit here:")
    A("- **Force spec** Fd = 5·g·Mt ≈ " + f"{fd_mn:.1f} mN detent; 2·Fd ≈ {2*fd_mn:.1f} mN "
      "peak drive (whether 5 g is the real hold requirement vs 10–30 g shock is open — Q2).")
    A("- **Drive** 1 V supply for the rise-time case; coil Nc=20, Dc=50 µm.")
    A("- **Process** pressed/sintered Somaloy-type SMC, net shape.")
    A("- **Registration** pole spacing 0.374 mm ⇒ claimed exact ⅓-pitch (0.155 mm) offsets.")
    A("")
    A("**Reconciliation against your CAD (the two SketchUp drawings):** the model and "
      "your CAD agree on the translator, teeth, bridge (1162) and 155 µm features. "
      "Three discrepancies need your ruling: (a) your CAD reads **400 µm** inter-pole "
      "spacing where the brief says 374 µm — neither gives exact ⅓-pitch phasing "
      "(390 µm is exact; derivation in §3); (b) your CAD dimensions the far tooth "
      "features as **465/620** where the brief's slot+land arithmetic gives 232+232 = "
      "464 pitch — please confirm which tooth profile is authoritative; (c) your CAD "
      "shows a **bearing/frame block 1784×3098 µm × 7746 µm long** — larger in "
      "cross-section than the entire magnetic assembly, so the frame, not the "
      "magnetics, sets the cell-fit budget (§2/§4 scorecard).")
    A("")

    # ------------------------------------------------------------------ §2
    A("## 2. What is good — verified as specified")
    A("")
    A(f"- **The geometry closes to the micrometre.** Mt = {s.translator_mass_kg*1e3:.4f} g "
      "(bar − 52 slots at 7.4 g/cm³; band 0.156–0.162 g over the SMC density range) — "
      "your ≈0.16 g hand-check reproduced. Wm = (1.704−1.549)/2 = 77.5 µm exactly, and "
      "2×0.465 + 2×0.0775 + 1.549 = 2.634 mm closes the bridge loop dimension chain.")
    A(f"- **Stroke is ample**: 12.5 − 4.23 (stator) = {s.usable_stroke_mm:.2f} mm usable "
      "≥ the 3.0 mm λ/2 requirement at 50 GHz.")
    A("- **The coil fits its window**: 20 turns of 58 µm-OD wire = 2 layers × 0.116 mm "
      "build inside the 0.263 mm clearance; Rc = 0.552 Ω from 63 mm of wire.")
    A("- **Phase quantisation is adequate below 100 GHz**: the 155 µm step gives "
      "18.6° @50 GHz / 29.8° @80 GHz / 59.6° @160 GHz (Δφ = 4πΔd/λ) — ~4-bit control "
      "at E-band, coarse at 160 GHz.")
    A("- **Electrical and thermal physics are easy**: time constants are microseconds "
      "against millisecond mechanics; a step pulse heats the coil single-digit kelvin.")
    A("- **The architecture itself is right**: zero-power PM detent + three-phase VR "
      "stepping is a sound, driver-friendly way to hold thousands of cells with no "
      "standing power. Nothing below challenges the concept — only the flux budget.")
    A("")

    # ------------------------------------------------------------------ §3
    A("## 3. What must change — and exactly why")
    A("")
    A("### 3.1 The detent cannot reach Fd (×15 short) — task 3 as asked")
    A("")
    A("![pm-sweep](fig-pm-sweep.png)")
    A("")
    if sweeps:
        b_rows = sweeps["baseline"]["pm_sweep"]; plateau = b_rows[-1]
        A(f"Net zero-current breakaway vs magnet length: it rises to only **≈0.5 mN and "
          f"saturates** (0.47 mN at Pm = 0.30 mm; {plateau['breakaway_mn']:.2f} mN still "
          f"creeping at {plateau['pm_mm']*1e3:.0f} µm, where the magnet operates at "
          f"B = {plateau['b_pm_t']:.2f} T, H = {plateau['h_pm_ka_m']:.0f} kA/m). A longer "
          "magnet moves its own operating point back toward Br, but the flux it can push "
          "is capped at Φ → Br·A by its internal reluctance — extra NdFeB buys nothing. "
          "**No Pm meets the target within this model.**")
    A("")
    A("Three stacked causes:")
    A("- **Gap/tooth = 77.5/232 ≈ ⅓ kills the modulation.** Corner fringing conducts "
      "almost as well anti-aligned as the faces do aligned: FE shows flux through the "
      "gaps varies only ~8% over a pitch (coil flux-linkage 2.8%). Reluctance force "
      "needs the position-DERIVATIVE of permeance, and there barely is one.")
    A("- **Three-phase symmetry cancels the fundamental.** Poles at ⅓-pitch offsets "
      "sum 1 + e^(j2π/3) + e^(j4π/3) = 0 for every harmonic except multiples of 3 — "
      "the net detent rides on the 3rd permeance harmonic, which this equal-tooth/"
      "equal-slot profile barely produces (h3/h1 ≈ 4%).")
    A("- **The magnet self-limits** (the Φ → Br·A cap above).")
    A("")
    A("Robustness of the conclusion: even if the cancellation were completely spoiled "
      "(pole forces adding incoherently), 3 × the per-pole FE amplitude < 4.5 mN — "
      "still under spec. 86% of bridge flux does cross the working gaps (no leakage "
      "short); the geometry itself is the limit.")
    A("")
    A("### 3.2 The drive cannot reach 2·Fd either — task 4 as asked")
    A("")
    A("![ic-sweep](fig-ic-sweep.png)")
    A("")
    if sweeps:
        top = sweeps["baseline"]["ic_sweep"][-1]
        A(f"Peak net drive force vs coil current saturates near "
          f"**{top['peak_mn']:.1f} mN even at {top['ic_a']:.0f} A** (160 A-turns) — ×8 "
          "short of 15.5 mN, for the same reason: current cannot add modulation the "
          "teeth do not provide. (No Ic within the swept 0–8 A reaches the target; "
          "the saturation trend makes a solution beyond it physically implausible.)")
    A("")
    A("### 3.3 Secondary defects the model surfaced")
    A("")
    A("- **Pole registration is off ⅓-pitch as drawn.** Centre-to-centre = 1.160 + "
      "0.374 = 1.534 mm; 1.534 mod 0.464 = **0.142 mm offset, not 0.155** — spacing "
      "0.390 mm would be exact. Your CAD's 400 µm is also inexact (0.168 mm offset). "
      "Consequence (FE, fixed design): detents at −175.5/−3.0/+143.1 µm — step split "
      "**172.6/146.1/145.3 µm** (±18 µm, ≈±3.4° phase jitter at 80 GHz).")
    A("- **The step spec's assumed process cannot make the parts** — pressed SMC has a "
      "published minimum-section floor of ~0.8–1.7 mm; the 232 µm teeth are 4–7× below "
      "it (§5).")
    A("- **Open-loop capture is not free**: the translator is a ≈180 Hz, lightly-damped "
      "mass-spring; a naive full-force pulse overshoots into the wrong detent (§4.4).")
    A("")

    # ------------------------------------------------------------------ §4
    A("## 4. The design that works — with the numbers")
    A("")
    A("**Change set (FE-solved):**")
    A("- **F1 — working gap 77.5 → 20 µm.** Dominant lever: ×8.6 on net detent alone.")
    A("- **F2 — bridge + magnet cross-section ×1.5** (0.232 → 0.348 mm in the AXIAL "
      "direction: transverse width stays 1.162 < 1.708, so the beam-facing envelope is "
      "untouched; the stator grows 0.35 mm axially, stroke 8.27 → 7.92 mm — still ≥3.0). "
      "Lifts the magnet's Φ → Br·A ceiling into range.")
    A("- **F3 (recommended, zero cost) — pole spacing 374 → 390 µm** for exact ⅓-pitch "
      "steps (uniform 154.7 µm; kills the ±3.4° jitter).")
    A("- Teeth, pitch, translator, stator slots: **unchanged**. Rejected alternatives, "
      "both FE-tested: 0.35·pitch teeth (more force but detent basins 3→2 — step "
      "structure lost) and gap 40 µm + deep slots + bigger PM (caps at 4.3 mN AND "
      "collapses to 1 basin). The 20 µm gap is load-bearing.")
    A("")
    A("![variants](fig-variants.png)")
    A("")
    A("### 4.1 The five numbers for the fixed design (methods stated)")
    A("")
    A("| # | Quantity | Value | Method |")
    A("|---|---|---|---|")
    A(f"| 1 | Mt | **{s.translator_mass_kg*1e3:.4f} g** (0.156–0.162 band) | bar − 52 × "
      "(0.465×0.232×1.55) slots, ρ = 7.4 g/cm³ |")
    A("| 2 | Wm | **20 µm** (was 77.5) | fix F1; per side, both interfaces |")
    if fixed:
        A(f"| 3 | Pm | **{fixed['pm_mm']*1e3:.0f} µm** → breakaway "
          f"{fixed['breakaway_mn']:.2f} mN = Fd ✓, 3 detents ✓ | FE net-detent curve "
          f"peak, bisected on Pm; magnet at B ≈ 0.98 T, H ≈ −245 kA/m (N42-class "
          f"Br 1.30 T recoil line) |")
        A(f"| 4 | Ic | **{fixed['ic_a']:.2f} A** (67 A-turns) for the literal 2·Fd peak "
          f"({fixed['drive_peak_mn']:.1f} mN); worst-case NET path force **+"
          f"{fixed['stall_min_mn']:.1f} mN** (all detent loads included — the step "
          f"completes with margin) | FE force-vs-x, one coil AIDING its pole's PM |")
        A(f"| 5 | Lc, Rc, tr | Lc ≈ {fixed['lc_uh']:.1f} µH (FE dλ/di), Rc = 0.552 Ω "
          "(63 mm Ø50 µm Cu), τ = L/R ≈ 0.7–1.1 µs (lumped model ≈4 µs — honest range "
          "1–4 µs); 1.4–1.8 A reached <15 µs on 1 V | RL rise; back-EMF negligible "
          "over a step |")
    A("")
    A("Drive practicalities: (a) 3.35 A × 0.552 Ω needs **≈1.9 V** — at fixed wire gauge "
      "and mean turn length a 1 V supply caps MMF at 36 A-turns regardless of turns "
      "count (R ∝ N; rewound-gauge R ∝ N² gives the same conclusion: supply voltage, "
      "not winding design, is the limit). Steps complete from ≈1.4 A inside 1 V, at "
      "reduced margin. (b) **Wire duty**: 3.35 A in Ø50 µm Cu ≈ 1,700 A/mm² — legal "
      "ONLY as ms pulses (adiabatic ΔT ≈ 6 K/step); continuous drive would fuse the "
      "wire — the driver must be current- and duty-limited. (c) **Polarity is an "
      "interface requirement**: the coil must AID its pole's magnet; opposed, more "
      "current gives LESS force.")
    A("")
    A("### 4.2 Force curves (FE)")
    A("")
    A("![detent](fig-detent.png)")
    A("")
    A("![drive](fig-drive.png)")
    A("")
    A("### 4.3 The drawings — 2D dimensioned + 3D model")
    A("")
    A("![D1](drawing-D1-axial.png)")
    A("")
    A("![D2](drawing-D2-transverse.png)")
    A("")
    A("![D3](drawing-D3-tooth-detail.png)")
    A("")
    A("**3D model of the fixed design** (translator gold, poles steel, coils red; the "
      "NdFeB slugs sit inside the far-side bridge limbs — see D2 for their exact "
      "position):")
    A("")
    A("![3D](render-3d-fixed.png)")
    A("")
    A("### 4.4 Step dynamics")
    A("")
    if dyn:
        A("- Transit to the next detent: **2.5–4 ms** at 1.8 A — the ms-scale "
          "requirement is met.")
        A("- Detents (FE) at −175.5/−3.0/+143.1 µm; stiffness ≈ 200 N/m ⇒ ≈180 Hz "
          "ring on the 0.158 g translator.")
        A(f"- Energy ≈ {dyn['energy_per_step_mj']:.1f} mJ per 1.5 ms pulse; coil "
          f"ΔT ≈ {dyn['coil_dT_per_step_k']:.0f} K adiabatic — thermally trivial at "
          "any realistic step rate with passive hold.")
        A("- **Capture needs drive shaping**: with light damping a single full-force "
          "pulse has a narrow reliable-width window (overshoot lands one detent too "
          "far). Hold-until-settled-then-release captures correctly (15–45 ms full "
          "settle at 0.2–0.5 mN guide friction, with a tapered hold current); a brake "
          "pulse or modest damping restores few-ms settle. This is driver firmware, "
          "not hardware. Guide friction is unspecified — it sets settle time (Q with "
          "the bearing choice).")
    A("")
    A("### 4.5 Requirements scorecard")
    A("")
    if score:
        A("| Requirement | Baseline | Fixed design |")
        A("|---|---|---|")
        for r in score:
            A(f"| {r['requirement']} | {r['baseline']} | {r['fixed']} |")
        A("")
        for r in score:
            if r["note"]:
                A(f"- *{r['requirement']}*: {r['note']}")
    A("")
    A("### 4.6 Model fidelity — what these numbers can and cannot claim")
    A("")
    A("2D unrolled-loop FE (the transverse horseshoe straightened into the tooth plane "
      "with area-preserving scaling); poles superposed without cross-coupling; the "
      "net detent is a residual after fundamental cancellation, so its absolute value "
      "is more model-sensitive than the baseline's ×15 shortfall (which survives even "
      "total loss of cancellation). Treat Pm* = 243 µm as the design centre with the "
      "magnet length as the TRIM parameter at prototype; 3D FE (or a prototype "
      "force-curve) bounds the residual before tooling. SMC B-H is Somaloy-700-shaped; "
      "the micro-MIM route's Fe-3%Si saturates HIGHER (~1.8–2.0 T), making the force "
      "conclusions conservative.")
    A("")

    # ------------------------------------------------------------------ §5
    A("## 5. How to make it")
    A("")
    A("![D4](drawing-D4-build-sequence.png)")
    A("")
    A("1. **Toothed steel parts — micro-MIM, not pressed SMC.** Pressed/sintered SMC "
      "has a published minimum-section floor of ~0.8–1.7 mm — 4–7× above the 232 µm "
      "teeth, so the brief's assumed process cannot form these parts at all. "
      "Micro-MIM in soft-magnetic Fe-3%Si / permalloy is the process family with "
      "published capability at this scale (±10 µm tolerances, <100 µm walls; "
      "magnetic-anneal without distortion). Multi-cavity tools amortise to cents/part "
      "at 10–100 M/yr. Fallbacks needing redesign: etched Fe-Si lamination stacks, or "
      "LIGA electroformed permalloy (custom material qualification).")
    A("2. **Coils — pre-wound, because the loop closes.** Once the bridge joins the "
      "two slot-sections the magnetic circuit is a closed ring: nothing can wind "
      "through it at volume. So: wind 20 turns of Ø50 µm bondable magnet wire on a "
      "removable former (or directly on the free bridge bar) → self-supporting coil → "
      "**slip over the open bridge limb** → then close the loop. Hearing-aid and "
      "watch-coil houses wind 9–50 µm wire at tens of millions/yr.")
    A("3. **Magnets** — sintered NdFeB thin-sliced slugs (0.348×1.162×0.243 mm), "
      "Ni + parylene coated (the 15-year-outdoor corrosion stack is a qualification "
      "gate: demand salt-spray/PCT data on sub-mm parts), inserted UNMAGNETISED.")
    A("4. **Assembly + the 20 µm gap.** Bond bridge to slot-sections around the "
      "translator/bearing; set the gap with precision shims or active gauging. "
      "dF/dg ≈ −8%/µm here, so ±5 µm scatter = ±40% force: the 100%-test detent-force "
      "measurement IS the gap gauge — measure, sort/adjust, then fix.")
    A("5. **Magnetise in-situ** (pulse fixture through the assembled pole), then "
      "100% detent-force + step test.")
    A("")
    A("The cost picture (indicative, NOT quotes): materials ≈ $0.001/unit are noise; "
      "the unit price is process + volume — micro-MIM parts a few cents each at "
      "64+-cavity scale, coil ≈ $0.03–0.15, magnet ≈ $0.03–0.10 (CN volume tier), and "
      "assembly-to-gap-tolerance dominant. $0.10 all-in needs ≥10–100 M/yr and the "
      "detent-test-as-gap-gauge flow; treat every cost cell as planning-grade until "
      "RFQs return.")
    A("")

    # ------------------------------------------------------------------ §6
    A("## 6. Who can make it — ten companies, with evidence")
    A("")
    A("Researched 2026-07-24 (live company/product pages; every capability claim "
      "sourced — URLs in the research annexes). No single vendor makes this exact "
      "part today; the credible structure is a **hybrid supply chain**: a micro-MIM "
      "house for the toothed steel + coil/magnet specialists + a volume "
      "micro-actuator assembler.")
    A("")
    A("| # | Company (HQ) | What they mass-produce today | Which part of ours | Why credible |")
    A("|---|---|---|---|---|")
    A("| 1 | **MinebeaMitsumi** (JP) | Φ3 mm PM stepper motors (world's smallest at "
      "launch), phone-camera AF actuators since 2005, Philippines volume plants | "
      "Whole actuator | The only company already mass-producing a sub-5 mm toothed "
      "PM stepper — the closest existing product on Earth to this device |")
    A("| 2 | **Citizen Finedevice** (JP) | Watch-calibre stepper motors, coils and "
      "µm-machined movement parts at watch-industry volumes | Whole actuator / "
      "coils + assembly | Watch steppers are the cost/precision/volume analogue: "
      "µm parts, tens of millions/yr, decades of DFM |")
    A("| 3 | **Sonion** (DK) | Hearing-aid balanced-armature receivers: sub-mm coils, "
      "magnets and steel assembled at 10M+/yr | Coil-magnet-armature assembly | A "
      "balanced-armature receiver IS a micro electromagnetic actuator built to "
      "medical reliability at consumer cost |")
    A("| 4 | **Jahwa Electronics** (KR) | VCM AF/OIS camera actuators inside the "
      "Apple supply chain; ~8,000-worker Vietnam plant | Coil + magnet + precision "
      "assembly | Proven tier-1 volume discipline on µm-assembled "
      "coil-magnet actuators |")
    A("| 5 | **Alps Alpine** (JP) | VCM + SMA camera actuators, automated µm-tolerance "
      "assembly at phone volumes | Assembly + test | One of the surviving top-tier "
      "camera-actuator makers (TDK has EXITED this business — its lines went to "
      "Actutek/Q Tech, worth tracking separately) |")
    A("| 6 | **Micro MIM Japan / Taisei Kogyo** (JP) | µ-MIM parts at ±10 µm with "
      "<100 µm walls in Fe-3%Si, permalloy, Permendur — explicitly marketed "
      "soft-magnetic micro parts | **The toothed translator + slot-sections + "
      "bridges** | The only published process+material match for 232 µm soft-magnetic "
      "teeth |")
    A("| 7 | **Parmaco AG** (CH) | Micro-MIM 0.1–100 mm parts in FeSi3/50NiFe/CoFe | "
      "Toothed parts (second source / first articles) | Dedicated soft-magnetic MIM "
      "alloys + Swiss precision; ideal pilot-tooling partner |")
    A("| 8 | **Indo-MIM** (IN) | One of the world's largest MIM houses; Fe-Si "
      "feedstocks in the MIM literature | Toothed parts at the COST point | The "
      "volume/cost wildcard — needs a 232 µm-feature capability confirmation before "
      "ruling in |")
    A("| 9 | **Sumida** (JP) — with **Audemars Microtec / Benatav** (CH) as precision "
      "alternates | Fine-wire winding 10–50 µm at volume (Sumida); 9–50 µm micro-coils "
      "down to 0.5 mm (Audemars) | The 20-turn Ø50 µm coils | Hearing-aid/RFID/VCM "
      "coil lines already wind this wire class in tens of millions |")
    A("| 10 | **JL MAG** (CN) — with **SDM Magnetics** (CN) as the precision/coating "
      "alternate | JL MAG: VCM-grade sintered NdFeB at world-leading volume; SDM: "
      "micro-magnets to ±5 µm with Ni/parylene + magnetise-after-assembly | The "
      "0.24 mm NdFeB slugs | Sub-mm VCM magnets are their existing catalogue; "
      "the 15-yr outdoor coating is the one open qualification |")
    A("")
    A("Supporting cast: **Faulhaber PRECISTEP + MPS** (CH) — pilot-line engineering "
      "and the Ø2 mm-class micro linear bearings for the guide (their cost structure "
      "suits prototypes, not the $0.10 line); **IKO** 1 mm-rail micro linear ways as "
      "a bearing alternative. Recommended first RFQs: Micro MIM Japan + Parmaco "
      "(feasibility on the 232 µm/±10 µm tooth spec), Sonion or MinebeaMitsumi "
      "(assembly), JL MAG/SDM (magnet + coating qualification).")
    A("")

    # ------------------------------------------------------------------ §7
    A("## 7. Open questions for Tony")
    A("")
    A("1. Reflector mass: part of the translator (Mt complete) or added? (moves the "
      "hold/step budget)")
    A("2. Is Fd = 5·g·Mt the real requirement, or hold against 10–30 g shock "
      "(= 16–47 mN — 2–6× the current spec; the fixed design would need re-solving)?")
    A("3. Orientation confirmed? (translator axis along beam depth — assumed)")
    A("4. Peak temperature (NdFeB demag margin check is one line once known) and the "
      "real driver voltage (1 V limits drive to reduced-margin stepping; 2 V unlocks "
      "the full 2·Fd point).")
    A("5. **Pole spacing: brief 374 µm vs your CAD 400 µm vs exact 390 µm — which "
      "rules?** (374 ⇒ steps 172.6/146.1/145.3 µm, ±3.4° jitter at 80 GHz.)")
    A("6. **Tooth profile: brief 232+232 (pitch 464) vs the 465/620 dimensions "
      "readable on your CAD teeth — which is authoritative?**")
    A("7. Is a 20 µm assembled gap acceptable to pursue given §5's tolerance/process "
      "consequences? (FE says it is the only route that meets Fd with 3 detents.)")
    A("8. The bearing/frame block (1784×3098) dominates the cell-fit budget — is its "
      "cross-section negotiable for E-band?")
    A("")

    # ------------------------------------------------------------------ §8
    A("## 8. Traceability")
    A("")
    A("Every headline number maps to a machine-readable artefact in `scripts/phantm/out/`: "
      "five-numbers.json (lumped v1) · femm-five-numbers.json (baseline FE) · "
      "pm-ic-sweeps.json (task-3/4 curves) · femm-variants.json (levers) · "
      "fixed-design.json (Pm*, Ic*, curves) · fix-alternatives.json (rejected "
      "alternates + FE step split) · dynamics.json · cost.json · scorecard.json. "
      "Reproduce: selftest.py (27/27 guards incl. basin-count, spike-free, co-energy "
      "identity) then the scripts in TRACKER.md order. FE backend: native xfemm "
      "femmcli (build recipe in femm/runner.py); C-core gate must PASS before any "
      "actuator run is trusted.")

    path = os.path.join(OUT, "PHANTM-ACTUATOR-REPORT.md")
    with open(path, "w") as f:
        f.write("\n".join(L) + "\n")
    print(f"wrote {path} + figures")


if __name__ == "__main__":
    main()
