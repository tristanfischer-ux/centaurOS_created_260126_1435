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
    net = load("five-numbers.json")
    fe = load("femm-five-numbers.json")
    fixed = load("fixed-design.json")
    dyn = load("dynamics.json")
    cost = load("cost.json")
    score = load("scorecard.json")
    fig_detent(fd_mn)
    fig_drive(fd_mn, geo.pole_phasing(p)[1][1] * 1000.0)  # mm → µm
    fig_pm_sweep(fd_mn)
    fig_ic_sweep(fd_mn)
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
    sweeps = load("pm-ic-sweeps.json")
    A("## The five numbers — each of Tony's asks, answered as asked")
    A("")
    A("### Task 1 — Mt, the translator mass")
    A(f"**Mt = {s.translator_mass_kg*1e3:.4f} g** (density stated: 7.4 g/cm³). Solid bar "
      f"1.549×1.55×12.5 mm minus 26 slots per face × 2 faces × (0.465×0.232×1.55 mm) "
      f"= 21.32 mm³ net. Range over the 7.3–7.6 g/cm³ density band: 0.156–0.162 g. "
      f"This reproduces and refines your ≈0.16 g hand-check.")
    A("")
    A("### Task 2 — Wm, the working gap")
    A("**Wm = 77.5 µm per side, confirmed from the geometry**: (1.704 − 1.549)/2, and the "
      "bridge length closes the loop exactly (2×0.465 + 2×0.0775 + 1.549 = 2.634 mm — "
      "your §2 dimensions are self-consistent to the µm). This Wm is the single most "
      "consequential number in the design — see task 3.")
    A("")
    A("### Task 3 — Pm for Fd = 5·g·Mt = " + f"{fd_mn:.2f} mN")
    A("")
    A("![pm-sweep](fig-pm-sweep.png)")
    A("")
    if sweeps:
        b_rows = sweeps["baseline"]["pm_sweep"]
        plateau = b_rows[-1]
        op = next((r for r in sweeps["fixed"]["pm_sweep"]
                   if abs(r["pm_mm"] - 0.243) < 0.01), None)
        A(f"**For your geometry the answer is: no Pm exists.** The curve you asked for is "
          f"above — net zero-current breakaway force vs magnet length. It rises to only "
          f"**{plateau['breakaway_mn']:.2f} mN and saturates** (at Pm = "
          f"{plateau['pm_mm']*1e3:.0f} µm the magnet already operates at "
          f"B = {plateau['b_pm_t']:.2f} T, H = {plateau['h_pm_ka_m']:.0f} kA/m on its load "
          f"line; longer magnets just push themselves further down it — flux is capped at "
          f"Φ → Br·A by the magnet's own internal reluctance). The target is missed "
          f"≈×{fd_mn/plateau['breakaway_mn']:.0f} however much NdFeB you insert.")
        A("")
        A("**Why (the physics, not the model):** a reluctance detent needs the gap "
          "permeance to *change* with position. At Wm/tooth-width = 77.5/232 ≈ 1/3, the "
          "fringing field at the tooth corners conducts almost as well anti-aligned as the "
          "faces do aligned — FE shows the flux crossing the gaps changes by only ~8 % "
          "over a full pitch. On top of that, your three ⅓-pitch-offset poles cancel each "
          "other's fundamental force component exactly (that is what makes three-phase "
          "stepping work), so the net detent lives on the *harmonics* of the permeance "
          "waveform — which this tooth profile barely produces (3rd/1st ≈ 4 %). Detent "
          "force vs displacement for both designs is the figure in the next section.")
        A("")
        if op:
            A(f"**What works instead:** gap → 20 µm and bridge+magnet cross-section ×1.5 "
              f"(teeth, pitch, translator, stator slots unchanged). Then **Pm* = 243 µm** "
              f"gives {op['breakaway_mn']:.2f} mN breakaway with the magnet at a healthy "
              f"operating point (B = {op['b_pm_t']:.2f} T, H = {op['h_pm_ka_m']:.0f} kA/m) "
              f"and the three ⅓-pitch detents intact.")
    A("")
    A("### Task 4 — Ic for a peak axial force of 2·Fd = " + f"{2*fd_mn:.1f} mN "
      "(Nc = 20, Dc = 50 µm)")
    A("")
    A("![ic-sweep](fig-ic-sweep.png)")
    A("")
    if sweeps:
        b_ic = sweeps["baseline"]["ic_sweep"]
        top = b_ic[-1]
        A(f"**For your geometry: no Ic exists either.** Peak net drive force vs coil "
          f"current is above — it saturates near **{top['peak_mn']:.1f} mN even at "
          f"{top['ic_a']:.0f} A** (400 A-turns), ×8 short of the 15.5 mN target, for the "
          f"same reason as task 3: force needs permeance modulation, and current cannot "
          f"add what the tooth geometry does not provide. (One subtlety your driver must "
          f"respect: the coil has to be poled to AID its own pole's magnet — opposed, "
          f"more current *reduces* the force.)")
        A("")
        if fixed:
            A(f"**What works instead:** on the fixed design, **Ic* = {fixed['ic_a']:.2f} A** "
              f"reaches the literal 2·Fd peak ({fixed['drive_peak_mn']:.1f} mN; worst force "
              f"along the step path {fixed['stall_min_mn']:.1f} mN). Two practical notes: "
              f"(a) 3.35 A through the 0.55 Ω coil needs ≈1.9 V — the 1 V case caps the "
              f"MMF at 36 A-turns *regardless of turns count* (R scales with N, so "
              f"voltage, not winding design, is the limit); (b) reliable stepping does "
              f"not need the full 2·Fd — steps complete from ≈1.4 A, inside the 1 V "
              f"budget. Force vs position with one coil energised:")
    A("")
    A("![drive](fig-drive.png)")
    A("")
    A("### Task 5 — Lc, Rc and the rise time on 1 V")
    lc_b = f"{fe['lc_uh_fe']:.1f}" if fe else "—"
    lc_f = f"{fixed['lc_uh']:.1f}" if fixed else "—"
    A(f"**Rc = 0.552 Ω** (63 mm of 50 µm Cu at 20 °C; the 20 turns wind in 2 layers with "
      f"0.116 mm build inside your 0.263 mm window — it fits with margin). "
      f"**Lc ≈ {lc_b} µH (baseline) / {lc_f} µH (fixed), from FE flux linkage dλ/di at "
      f"the drive point** — small, because the same weak gap modulation that limits force "
      f"also limits inductance. **tr: with λ-based nonlinear integration onto 1 V, the "
      f"current reaches 63 % of I∞ = 1.81 A in ≈4 µs** and any practical stepping current "
      f"(1.4–1.8 A) in <15 µs; electrical time constants are microseconds against "
      f"millisecond mechanics, so the coil never limits the step. (The fixed design's "
      f"full Ic* = 3.35 A is unreachable on 1 V — it needs the ≈1.9 V supply above.)")
    A("")
    A("### The detent curves behind tasks 3–4")
    A("")
    A("![detent](fig-detent.png)")
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
