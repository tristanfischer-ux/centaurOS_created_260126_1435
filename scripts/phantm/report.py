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
            linewidth=2, label="detent only (i = 0)", zorder=2)
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
    net = load("five-numbers.json")
    fe = load("femm-five-numbers.json")
    fixed = load("fixed-design.json")
    dyn = load("dynamics.json")
    cost = load("cost.json")
    score = load("scorecard.json")
    fig_detent(fd_mn)
    fig_drive(fd_mn, geo.pole_phasing(p)[1][1] * 1000.0)  # mm → µm
    fig_variants(fd_mn)
    fig_rise()

    step_um = geo.pole_phasing(p)[1][1] * 1000
    L = []
    A = L.append
    A("# PHANTM beam-steering actuator — Anvil model v2 report")
    A("")
    A("**CONFIDENTIAL — core IP.** Scope: the actuator only. "
      "Model + FE code: `scripts/phantm/` (worktree CentaurOS-phantm). 2026-07-24.")
    A("")
    A("## Verdict (plain English)")
    A("")
    A("**As specified, the actuator cannot meet its force requirements — and the "
      "model shows exactly why and what fixes it.** The 77.5 µm working gap is "
      "~⅓ of the tooth width; at that ratio fringing keeps the unaligned gap "
      "almost as conductive as the aligned one (flux modulation ~8 %), so the "
      "net three-phase detent tops out at ≈0.5 mN against the 7.7 mN spec for "
      "ANY magnet length, and the drive force is similarly capped. This is a "
      "nonlinear-FE result (validated solver, mesh-converged, co-energy "
      "cross-checked); the closed-form estimate misses it, which is precisely "
      "why the brief mandated a field solver.")
    A("")
    A("**The smallest change set that works (FE-proven): TWO changes.** "
      "Working gap 77.5 → 20 µm, and bridge + magnet cross-section ×1.5. "
      "Teeth, pitch, translator and stator slots stay exactly as specified. "
      "With that set the detent spec is met at Pm* ≈ 0.24 mm (ordinary sintered "
      "NdFeB), and the three ⅓-pitch detents are preserved. (Deepening the "
      "stator slots to 0.465 mm is an optional third change that shrinks the "
      "magnet to ≈0.19 mm. A narrower-tooth variant that looked attractive was "
      "REJECTED: at 0.35·pitch teeth the net detent collapses to two basins per "
      "pitch and the ⅓-pitch step structure is lost — basin count is now an "
      "explicit acceptance check.) The cost is a much tighter assembly "
      "tolerance at the 20 µm gap — the dominant cost/yield risk — and the "
      "drive needing ≈1.9 V for the full 2·Fd force (see task 4).")
    A("")
    A("## The five numbers")
    A("")
    A("| # | Quantity | Baseline (as specified) | Fixed design | Method |")
    A("|---|---|---|---|---|")
    A(f"| 1 | **Mt** | **{s.translator_mass_kg*1e3:.4f} g** | same | bar − 52 slots × "
      f"slot volume, SMC 7.4 g/cm³ (26 slots/face). Matches Tony's ≈0.16 g |")
    A(f"| 2 | **Wm** | **77.5 µm** | 20 µm (changed by fix F1) | (1.704 − 1.549)/2 |")
    pm_line = (f"**no Pm achieves Fd** — net breakaway plateaus ≈0.5 mN "
               f"(PM self-reluctance ceiling; ×16 short)")
    fx_pm = (f"**Pm* = {fixed['pm_mm']*1e3:.0f} µm** → {fixed['breakaway_mn']:.2f} mN "
             if fixed else "pending")
    A(f"| 3 | **Pm** (detent Fd = {fd_mn:.2f} mN) | {pm_line} | {fx_pm} | nonlinear FE "
      f"(femmcli), 3-pole superposition, breakaway = peak of net detent curve |")
    ic_base = "**not reachable** — net drive ≈1.9 mN even at 4 A (weak modulation; ×8 short)"
    if fixed:
        fx_ic = (f"**Ic* = {fixed['ic_a']:.2f} A** for the literal 2·Fd peak "
                 f"({fixed['drive_peak_mn']:.1f} mN; stall-min "
                 f"{fixed['stall_min_mn']:.1f} mN) — needs ≈1.9 V. Within the "
                 f"1 V budget (I∞ = 1.81 A): steps complete from ≈1.4 A; at "
                 f"1.8 A worst-case path margin +1.5 mN. ½·Fd margin ≈ 2.5 A "
                 f"(≈1.4 V). Note: 1 V caps the MMF at 36 A-turns regardless "
                 f"of turns count (R ∝ N) — a voltage, not winding, limit")
    else:
        fx_ic = "pending"
    A(f"| 4 | **Ic** (peak 2·Fd = {2*fd_mn:.1f} mN) | {ic_base} | {fx_ic} | FE force-vs-x "
      f"with one coil aiding its pole's PM; net incl. other poles' detent |")
    lc_b = f"{fe['lc_uh_fe']:.1f} µH" if fe else "—"
    lc_f = f"{fixed['lc_uh']:.1f} µH" if fixed else "—"
    A(f"| 5 | **Lc, Rc, tr** | Lc ≈ {lc_b} (FE), Rc = 0.55 Ω (63 mm of 50 µm Cu), "
      f"τ = L/R ≈ 2–7 µs; 1 V reaches any solvable Ic in <10 µs | Lc ≈ {lc_f} | "
      f"FE flux linkage dλ/di; wire length from coil fit (2 layers in the "
      f"0.263 mm window) |")
    A("")
    A(f"*Supply note:* 1 V into 0.55 Ω gives I∞ = 1.81 A — above the fixed design's "
      f"Ic*; electrical time constants are µs-scale, negligible vs the ms step.")
    A("")
    A("## Force curves (FE)")
    A("")
    A("![detent](fig-detent.png)")
    A("")
    A("![drive](fig-drive.png)")
    A("")
    A("## Why the baseline fails, quantified (§6 make-or-break)")
    A("")
    A("![variants](fig-variants.png)")
    A("")
    A("- Reluctance force needs permeance MODULATION, not permeance. At g/t = 1/3, "
      "corner fringing keeps the anti-aligned interface conducting: FE gap-flux "
      "modulation is ~8 % (λ modulation 2.8 %), vs the ~3× a naive overlap model "
      "predicts. 86 % of bridge flux does cross the gaps — there is no leakage "
      "short; the geometry itself is the limit.")
    A("- The three-phase offsets cancel the fundamental of the per-pole force; the "
      "net detent rides on the harmonic content, which this tooth profile barely "
      "produces (h3/h1 ≈ 4 %).")
    A("- The magnet cannot brute-force it: flux is capped by the PM's own internal "
      "reluctance (Φ → Br·A), reached long before useful force.")
    A("- Gap is the dominant recovery lever (20 µm: ×8.6 on net detent); deep "
      "stator slots and 0.35·pitch teeth compound; enlarging the bridge/PM "
      "section lifts the flux ceiling (needed to actually hit Fd).")
    A("")
    A("## Requirements scorecard (§5)")
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
    A("## Step dynamics")
    A("")
    if dyn:
        eq = ", ".join(f"{e:+.1f}" for e in dyn["equilibria_um"])
        A(f"- Fixed-design detent equilibria at {eq} µm — steps uneven by ~11 µm "
          f"(the 0.374 mm pole spacing; see open questions). Detent stiffness "
          f"ring frequency ≈ 180 Hz on the translator mass.")
        A(f"- TRANSIT is ms-scale as required: 2.5–4 ms to reach the next detent "
          f"at 1.8 A. Energy ≈ {dyn['energy_per_step_mj']:.2f} mJ per "
          f"{dyn['pulse_ms']:.1f} ms pulse; adiabatic coil ΔT ≈ "
          f"{dyn['coil_dT_per_step_k']:.1f} K — negligible at realistic step "
          f"rates with passive hold.")
        A("- CAPTURE is the real dynamics constraint: the translator is a "
          "~180 Hz mass-spring with little damping, so a single open-loop pulse "
          "has a narrow reliable-width window (overshoot lands in the wrong "
          "detent). Hold-until-settled-then-release captures correctly "
          "(15–45 ms full settle at 0.2–0.5 mN guide friction, with a tapered "
          "hold current); a shaped brake pulse or modest added damping brings "
          "full settle to a few ms. Guide friction is unspecified — it sets "
          "the settle time and is flagged to Tony with the bearing choice.")
    A("")
    A("## Manufacture + cost (§7)")
    A("")
    if cost:
        A(f"- Materials are negligible: **${cost['materials_usd']:.4f}/unit** "
          f"(SMC 0.21 g + NdFeB 1.2 mg + Cu 3.3 mg).")
        A("- The $0.10 target is a process/volume question. Estimated all-in bands "
          "(LOW confidence — industry analogues, not quotes):")
        A("")
        A("| Volume | Baseline (77.5 µm gap) | Fixed design (20 µm gap) |")
        A("|---|---|---|")
        for tier in ("1M/yr", "10M/yr", "100M/yr"):
            b = cost["cost_bands_usd"][f"{tier}:baseline_77um"]
            fx = cost["cost_bands_usd"][f"{tier}:fixed_20um"]
            A(f"| {tier} | ${b[0]:.2f}–${b[1]:.2f} | ${fx[0]:.2f}–${fx[1]:.2f} |")
        A("")
        A(f"- **Tolerance is the coupling between physics and cost**: "
          f"{cost['tolerance_sensitivity']}.")
        A("- Processes: pressed net-shape SMC (teeth in the die, no machining); "
          "3× 20-turn 50 µm coils (fits 2 layers in the 0.263 mm window with "
          "0.116 mm build); bonded or thin sintered NdFeB slugs magnetised after "
          "insertion; the 77.5 µm gap was evidently a manufacturability choice — "
          "the physics wants 20 µm, so the assembly must deliver it (active gap "
          "setting / shimming), which is where the cost risk concentrates.")
    A("")
    A("## Where the linear model breaks (explicit statement, §8.7)")
    A("")
    A("A permeance-overlap model with plausible fringing constants over-predicts "
      "the baseline detent by ~16× (it gave Pm ≈ 29 µm for Fd; FE shows Fd is "
      "unreachable). The failure is structural, not a constant: at g/t = 1/3 the "
      "fringing fields dominate the modulation, and only a field solution "
      "captures the near-cancellation. The lumped model remains useful for "
      "Rc/coil fit/dynamics scaffolding, but every FORCE number in this report "
      "is FE (nonlinear B-H, validated against a gapped C-core to 2.5 %, "
      "mesh-converged to <1 %, WST vs co-energy consistent).")
    A("")
    A("## Model limitations (honest list)")
    A("")
    A("- 2D unrolled-loop FE: the transverse horseshoe is straightened into the "
      "tooth plane with area-preserving scaling; bridge-region leakage geometry "
      "is approximate. 3D (Elmer) is the escalation if a prototype disagrees.")
    A("- Poles are superposed (no cross-pole steel coupling); at 0.374 mm spacing "
      "some interaction exists — expected second-order, unverified.")
    A("- SMC B-H is a Somaloy-700-shaped table; swap in the chosen grade's curve.")
    A("- Hysteresis/eddy losses and PM temperature demag margin estimated, not "
      "swept (NdFeB Br −0.12 %/K included in the material model; a +85 °C check "
      "runs in one line once Tony confirms the temperature).")
    A("")
    A("## Open questions for Tony (§9 + new from the model)")
    A("")
    A("1. (§9.1) Is the reflector a translator face (Mt complete) or an added mass?")
    A("2. (§9.2) Fd = 5·g·Mt: holding the translator against 10–30 g shock needs "
      "16–47 mN, not 7.7 — which is the real requirement? It moves Pm and the "
      "whole force budget.")
    A("3. (§9.3) Orientation assumed: translator axis along beam depth — confirm.")
    A("4. (§9.4) Peak temperature and the real driver voltage.")
    A("5. **Pole spacing 0.374 mm gives a tooth-phase offset of 0.142 mm, not "
      "0.155 (= pitch/3): spacing of 0.390 mm would be exact. As drawn, steps are "
      "uneven (0.151/0.162/0.151 mm, ±1.4° phase jitter at 80 GHz) and detents "
      "sit 23 µm off tooth-alignment. Intentional?**")
    A("6. Tooth pitch: §2.1's slot+land arithmetic gives 0.464 mm; §2.3 uses "
      "0.465. Which is authoritative? (Model uses 0.464.)")
    A("7. The fixed design keeps pitch/step/translator; is a 20 µm assembled gap "
      "acceptable to pursue, given the tolerance/cost analysis?")
    A("")
    A("---")
    A("*Reproduce: `selftest.py` (27/27) · `five_numbers.py` (lumped) · "
      "`femm/ccore.py` (FE gate) · `femm/sweep.py` (baseline FE) · "
      "`femm/variants.py` (levers) · `femm/fixed_design.py` (fix) · "
      "`dynamics.py` · `cost_model.py` · `scorecard.py` · `report.py`. "
      "FE backend: native xfemm femmcli (build recipe in femm/runner.py).*")

    path = os.path.join(OUT, "PHANTM-ACTUATOR-REPORT.md")
    with open(path, "w") as f:
        f.write("\n".join(L) + "\n")
    print(f"wrote {path} + figures")


if __name__ == "__main__":
    main()
