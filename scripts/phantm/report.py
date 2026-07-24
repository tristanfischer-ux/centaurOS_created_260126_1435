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
             "Current rise onto 1 V (lumped-model L ≈ 2.2 µH shown; FE τ = 0.7–1.1 µs is faster)")
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
    A("# PHANTM beam-steering actuator — engineering verdict and a proposed fixed design (v4.5 — 24 Jul: feedback rounds 1–3 + hex-cell/PCB work package, council-reviewed; pending 3D-FE/prototype validation)")
    A("")
    A(f"**CONFIDENTIAL — core IP.** Scope: the actuator only. Generated **{stamp}**. "
      "All force numbers are 2D nonlinear finite-element results (native xfemm/FEMM solver, "
      "validated on a gapped C-core to 2.5%, mesh-converged <1%, force cross-checked "
      "weighted-stress-tensor vs co-energy). Reviewed by a 4-seat cross-lineage LLM "
      "council (GPT-5.6-Sol physics fact-check · Grok-4.5 adversarial · MiniMax-M3 "
      "honesty audit; the Kimi-K3 seat returned empty and is recorded as such) — every "
      "surviving finding is incorporated. Code + artefacts: `scripts/phantm/`.")
    A("")
    A("**One-paragraph verdict:** the actuator as specified in the brief (geometry Qs 5/6 noted) cannot generate its "
      "specified forces — the net zero-power detent saturates at ≈0.5 mN — ≈×15 below the "
      f"{fd_mn:.1f} mN target for any magnet size, because at a 77.5 µm gap the toothed "
      "interface barely modulates. The electromagnetic architecture itself is sound. Two "
      "changes close the force gap in the 2D model at the as-drawn registration — "
      "close the working gap to 20 µm and grow the bridge+magnet cross-section ×1.5 — "
      "after which the force requirements are met in-model with a "
      "manufacturable ~0.25 mm magnet (no margin yet — specify with trim-at-test "
      "headroom, and note the full drive point needs ≈1.9 V, not 1 V). Uniform-step registration "
      "trades ~23% of the detent back (§4, F3) — the in-model PASS is registration-"
      "specific and awaits 3D-coupled FE + prototype breakaway before a final verdict. The price is a tolerance class that changes who "
      "can build it and how: the toothed parts must be micro-MIM (pressed SMC cannot "
      "form 232 µm teeth), and the 20 µm gap must be actively set at assembly.")
    A("")

    # ---------------------------------------------------------- §0 Tony response
    A("## 0. Response to Tony's feedback of 24 July (before reading on)")
    A("")
    A("Tony confirmed the physics numbers \"mostly well match my own calculations\" "
      "and corrected the framing in four ways, each actioned below:")
    A("")
    A("1. **Scope: ~70 GHz outline feasibility only.** The spec was a ballpark check "
      "for the ~70 GHz band, not a 50–160 GHz product — one actuator will not cover "
      "the full range (a ~2× stroke spread). The multi-band scorecard rows are "
      "therefore secondary; this report's verdicts should be read at the ~70 GHz "
      "point, where the cell pitch sits between the 1.9 and 3.0 mm cases analysed.")
    A("2. **Waveguide wavelength.** Phase steps and stroke must use the GUIDE "
      "wavelength λg = λ0/√(1−(λ0/λc)²) > λ0, not free space — which is why the "
      "brief carries a long stroke. All phase-per-step figures in this report are "
      "free-space values and are therefore UPPER bounds (λg makes quantisation "
      "finer — favourable); the stroke requirement grows to λg/2. UPDATE 24 Jul: the "
      "delivered cell's cutoff is now DERIVED from its measured geometry — fc = 53.56 GHz, "
      "λc = 5.598 mm (§9, validated eigensolver; Vlad to confirm). Stroke available: 8.27 mm with one "
      "3-pole group; note the force ladder below trades stroke for force.")
    A("3. **Force targets: 5 g was the test minimum — the ambition is 20–30 g "
      "(31–46 mN).** FE-backed growth ladder at the 20 µm gap, from the 7.7 mN "
      "(5 g) fixed design: doubling to TWO 3-pole groups along the translator "
      "(8.46 mm of stator; stroke falls to ~3.7 mm — check vs λg/2) → ~15.4 mN "
      "(10 g); N52 magnets (Br 1.45, force ∝ Br²) → ~19 mN (12 g); the "
      "registration knob (§4 F3) → ~21 mN (≈13–14 g). **Reaching 20–30 g needs "
      "one more multiplier**: gap ≤ ~12 µm, a wider magnetic stack (cell-budget "
      "permitting), or accepting the two-group stroke. \"More coil turns\" raises "
      "drive MMF but not the zero-power detent; \"more NdFeB\" helps only until "
      "the Φ → Br·A ceiling (§3.1) — the real currencies are gap, tooth area and "
      "registration.")
    A("4. **The gap ruling — our one push-back, with evidence.** Tony expects "
      "~75 µm is \"probably not manufacturable\" and the gap must GROW. FE says "
      "the opposite direction is fatal: at 100/150 µm with the enlarged bridge/PM, "
      "the detent caps at **0.67/0.48 mN = 0.43/0.31 g** — 12–16× below even the "
      "5 g minimum (artefact: tony-gap-check.json). The resolution is that the "
      "working gap is NOT a moulded tolerance but an ASSEMBLED clearance, set at "
      "the force-gauged assembly step (§5.4): voice-coil-motor, watch and "
      "hard-disk lines hold single-µm assembled clearances at consumer volumes "
      "today (§6 evidence rows). 20 µm assembled is industrially normal — it is a "
      "process-and-cost choice, not a feasibility wall — and it is the single "
      "decision this design cannot survive losing.")
    A("5. **Reflector mass — resolved (Tony, same day).** The reflector is mg-scale "
      "plastic plus 20 µm copper foil, stood off from the (iron) translator by a "
      "small distance (Vlad to advise). Bounding it: a generous 2×2 mm foil patch "
      "at 20 µm is 0.72 mg of copper; with a 1–2 mg plastic standoff the moving "
      "mass grows <2% — inside the ±1.5% solver band, so every force budget in "
      "this report stands with Mt as the moving mass. The standoff adds one "
      "assembly step (non-magnetic, no circuit impact) and its length is an RF "
      "call that stays on Tony's side of the boundary.")
    A("6. **Parameterisation.** Tony has parameterised his critical values for "
      "fettling; this model is parameterised end-to-end the same way "
      "(params.py → FE), so any parameter set he wants swept can be run through "
      "the same validated loop — send values, get curves.")
    A("7. **Manufacturing methods and cost** — §5 (route, incl. the pressed-SMC "
      "impossibility and the coil sequencing) and §6 (ten supplier entries with "
      "evidence) answer this directly; raw materials are indeed tiny "
      "($0.0014/unit, §8.1) — the unit price lives in process and gap-setting.")
    A("")
    A("**Round 3 (24 Jul, 09:00–09:14) — the coil-winding challenge and two process points:**")
    A("")
    A("8. **\"The pole piece when fully assembled is still an open horseshoe\" — Tony is "
      "right, and the claim is RETRACTED.** The earlier closed-ring / cannot-wind "
      "statement conflated MAGNETIC closure with "
      "MECHANICAL closure. Re-analysed: the pole steel alone (two slot-sections + bridge) "
      "is an open horseshoe whose circuit only closes THROUGH the translator across the "
      "two working gaps — and the translator inserts axially LAST, so the winding window "
      "is open throughout pole assembly. In-situ winding is therefore possible, and "
      "checking where the wrong premise propagated found it had HIDDEN A DESIGN "
      "IMPROVEMENT rather than corrupted the force numbers: the slip-on-coil sequence "
      "forced a TWO-PIECE bridge with bonded joints in the flux path, and each glue line "
      "(≈1–3 µm effective air, unmodelled in the FE, which assumes continuous steel) "
      "costs ≈5–15% of the detent against the 2×20 µm working gaps. In-situ winding "
      "permits a MONOLITHIC horseshoe pole — zero magnetic joints, one fewer part, one "
      "fewer bond. §5.2 now carries both routes: monolithic + wind-in-situ (recommended "
      "baseline) vs two-piece + pre-wound slip-on (falls back on the mature hearing-aid "
      "coil supply chain if fine-wire winding on a 2.6 mm assembly proves slow). The FE "
      "force results are unchanged either way — they model the steel as continuous, "
      "which the monolithic route now actually delivers.")
    A("9. **In-situ magnetisation — the logic, then the concession.** The rationale was "
      "handling: a magnetised 0.74 mg slug near steel sees ≈B²A/2µ0 ≈ 0.27 N of snap "
      "force — ≈37,000× its own weight — so parts leap to fixtures and collect ferrous "
      "debris that later sits in a 20 µm gap. But Tony's instinct is right that this "
      "needn't be OUR process step: magnetise-after-assembly is an off-the-shelf "
      "SERVICE at the magnet suppliers themselves (SDM explicitly offers it — §6 row "
      "10, and it is already in the Annex C request-for-quotation), so the "
      "recommendation becomes: slugs supplied unmagnetised, magnetised through the "
      "assembled pole BY THE SUPPLIER'S fixture/service or a bought fixture on the "
      "assembly line — whichever the RFQ returns cheaper. Magnetised-at-supplier "
      "delivery stays a fallback if placement automation with non-magnetic tooling "
      "proves controllable.")
    A("10. **Same alloy both sides of the gap, and no laminations — agreed, with the "
      "analysis flagged.** Translator AND pole pieces are already specified as the SAME "
      "material family (micro-MIM Fe-3%Si, §5.1) — which also matches thermal expansion "
      "across the field gap, exactly Tony's point. On skipping laminations for DC "
      "pulsing: flux-diffusion estimates for solid Fe-3%Si (ρ ≈ 47 µΩ·cm, µr ≈ 4000) "
      "give τ ≈ 15–60 µs across the 0.23–0.47 mm stator sections and up to "
      "≈0.3–0.6 ms for the deepest translator return paths — inside the 1.5 ms pulse, "
      "so DC pulsing works unlaminated, but the margin on the thickest path is <10×: a "
      "transient (eddy) FE run is on the punch list before tooling, and eddy loss will "
      "add modestly to the 2.7 mJ/step. Confidence: moderate (µr-dependent).")
    A("11. **Cost \"steep but within order of magnitude\"** — noted; the honest band "
      "stays $0.10–0.25 at ≈10 M/yr (§5), and the monolithic-pole simplification from "
      "item 8 removes one bond + one part from that stack.")
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
    A("- **Registration** pole spacing 0.374 mm ⇒ claimed exact ⅓-pitch (0.155 mm) offsets — arithmetically inexact as written (§3.3).")
    A("")
    A("**Reconciliation against your CAD (the two SketchUp drawings):** the model and "
      "your CAD agree on the translator, teeth, bridge (1162) and 155 µm features. "
      "Three discrepancies need your ruling: (a) your CAD reads **400 µm** inter-pole "
      "spacing where the brief says 374 µm — neither gives exact ⅓-pitch phasing "
      "(exact: 386.7 µm at pitch 464 / 390 µm at pitch 465; §3.3); (b) your CAD dimensions the far tooth "
      "features as **465/620** where the brief's slot+land arithmetic gives 232+232 = "
      "464 pitch — please confirm which tooth profile is authoritative; (c) your CAD "
      "shows a **bearing/frame block 1784×3098 µm × 7746 µm long** — larger in "
      "cross-section than the entire magnetic assembly, so the frame, not the "
      "magnetics, sets the cell-fit budget (§2/§4 scorecard).")
    A("")

    # ------------------------------------------------------------------ §2
    A("## 2. What is good — verified as specified")
    A("")
    A(f"- **The geometry closes to the micrometre** (1.704 mm = the specified slot-face separation; distinct from the 1.708 mm slot-section bar length). Mt = {s.translator_mass_kg*1e3:.4f} g "
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
    A("- **Electrical and thermal physics are benign**: time constants are microseconds "
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
          "is capped at Φ → Br·A by its internal reluctance — extra magnet LENGTH buys nothing at this cross-section. "
          "**No magnet length meets the target at the specified section within this "
          "model** — growing the SECTION is what helps, which is exactly fix F2.")
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
      "(pole forces adding fully coherently — the worst case), 3 × the per-pole FE amplitude < 4.5 mN — "
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
          f"**{top['peak_mn']:.1f} mN even at {top['ic_a']:.0f} A** (160 A-turns) — ×6 "
          "short of 15.5 mN, for the same reason: current cannot add modulation the "
          "teeth do not provide. (No Ic within the swept 0–8 A reaches the target; "
          "the saturation trend makes a solution beyond it physically implausible.)")
    A("")
    A("### 3.3 Secondary defects the model surfaced")
    A("")
    A("- **Pole registration is not the intended ⅓-pitch as drawn.** Centre-to-centre = 1.160 + "
      "0.374 = 1.534 mm; 1.534 mod 0.464 = **0.142 mm offset, not 0.155** — spacing "
      "exact spacing is 386.7 µm (pitch 464) or 390 µm (pitch 465). Your CAD's 400 µm is also inexact. "
      "Consequence (FE, at the as-drawn 374 µm registration): detents at −175.5/−3.0/+143.1 µm — step split "
      "**172.6/146.1/145.3 µm** (±18 µm, ≈±3.4° phase jitter at 80 GHz).")
    A("- **The step spec's assumed process cannot make the parts** — pressed SMC has a "
      "published minimum-section floor of ~0.8–1.7 mm; the 232 µm teeth are ~3.5–7× below "
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
      "direction). The bridge sits at the transverse END of the slot-sections and its "
      "0.348 mm axial thickness stays inside the pole's 1.16 mm axial footprint, so the "
      "beam-facing envelope AND the stroke are both UNCHANGED (an earlier draft claimed "
      "a 0.35 mm stroke penalty — that was an artifact of the unrolled 2D model, "
      "corrected here). Lifts the magnet's Φ → Br·A ceiling into range.")
    A("- **F3 — registration is a DESIGN TRADE, not a free fix (final-round FE result).** "
      "Exact ⅓-pitch spacing (386.7 µm at pitch 464 / 390 µm at pitch 465) makes the "
      "steps uniform (~154.7 µm, no jitter) — but perfect cancellation also SHRINKS "
      "the detent residual: FE gives **5.95 mN at Pm 243 µm (3.85 g)** and only "
      "6.44 mN at Pm 350 µm, vs 7.72 mN at the as-drawn 374 µm registration (whose "
      "phasing error leaks fundamental into the net detent and boosts it). To hold "
      "BOTH uniform steps AND ≥7.7 mN, add one lever: an N52 magnet (Br 1.45 T, "
      "force ∝ Br² → ≈7.4 mN, marginal) or bridge/PM section ×1.75. Registration "
      "offset is thus a tunable detent-vs-uniformity knob — the ruling on Q5/Q2 "
      "picks the operating point. All curves below are at the AS-DRAWN 374 µm "
      "registration (F1+F2).")
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
          f"{fixed['breakaway_mn']:.2f} mN ≈ Fd (solver tolerance ±1.5% — specify "
          f"nominal 0.25 mm and TRIM AT TEST to ≥7.9 mN for margin), 3 detents ✓ | FE net-detent curve "
          f"peak, bisected on Pm; magnet at B ≈ 0.98 T, H ≈ −245 kA/m (N42-class "
          f"Br 1.30 T recoil line) |")
        A(f"| 4 | Ic | **{fixed['ic_a']:.2f} A** (67 A-turns) for the literal 2·Fd peak "
          f"({fixed['drive_peak_mn']:.1f} mN, ±1.5% solve tolerance — drive with ≥10% "
          f"current headroom); worst-case NET path force **+"
          f"{fixed['stall_min_mn']:.1f} mN** (all detent loads included — the step "
          f"completes with margin) | FE force-vs-x, one coil AIDING its pole's PM |")
        A(f"| 5 | Lc, Rc, tr | Lc ≈ {fixed['lc_uh']:.1f} µH (FE dλ/di), Rc = 0.552 Ω "
          "(63 mm Ø50 µm Cu), τ = L/R ≈ 0.7–1.1 µs (lumped model ≈4 µs — honest range "
          "1–4 µs); 1.4 A reached in 2–7 µs on 1 V; 1.8 A sits within 1% of I∞ = 1.81 A so its rise is asymptotic — use ≥1.2 V headroom or drive at ≤1.7 A | RL rise; back-EMF negligible "
          "over a step |")
    A("")
    A("Drive practicalities: (a) 3.35 A × 0.552 Ω needs **≈1.9 V** — at fixed wire gauge "
      "and mean turn length a 1 V supply caps MMF at 36 A-turns regardless of turns "
      "count (R ∝ N at fixed gauge; rewinding finer gauge in the fixed window is worse "
      "still, NI ∝ 1/N — fixed gauge is the best case, so supply voltage, not winding "
      "design, is the hard limit). Steps complete from ≈1.4 A inside 1 V, at "
      "reduced margin. (b) **Wire duty**: 3.35 A in Ø50 µm Cu ≈ 1,700 A/mm² — legal "
      "ONLY as short pulses: 1.5 ms at 1.8 A heats the coil ≈6 K, but 1.5 ms at 3.35 A "
      "dissipates ≈9.3 mJ ≈ 22 K — at Ic* keep pulses ≤0.5–1 ms; continuous drive would fuse the "
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
    A("### 4.4 Step dynamics (at the as-drawn 374 µm registration; exact-⅓ registration gives uniform ~154.7 µm steps at the §4 F3 detent trade)")
    A("")
    if dyn:
        A("- Transit to the next detent: **2.5–4 ms** at 1.8 A — the ms-scale "
          "requirement is met.")
        A("- Detents (FE) at −175.5/−3.0/+143.1 µm; stiffness ≈ 200 N/m ⇒ ≈180 Hz "
          "ring on the 0.158 g translator.")
        A(f"- Energy ≈ {dyn['energy_per_step_mj']:.1f} mJ per 1.5 ms pulse; coil "
          f"ΔT ≈ {dyn['coil_dT_per_step_k']:.0f} K adiabatic — benign for occasional "
          "repointing with passive hold between steps; sustained slewing needs a "
          "duty-cycle + thermal-path check (not modelled).")
        A("- **Capture needs drive shaping**: with light damping a single full-force "
          "pulse has a narrow reliable-width window (overshoot lands one detent too "
          "far). Hold-until-settled-then-release captures correctly (15–45 ms full "
          "settle at 0.2–0.5 mN guide friction, with a tapered hold current); a brake "
          "pulse (driver firmware) or modest added mechanical damping (hardware) "
          "restores few-ms settle. Guide friction is unspecified — it sets settle time (Q with "
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
      "force-curve) bounds the residual before tooling. The residual is also "
      "REGISTRATION-SENSITIVE (final-round FE: 7.72 mN at the as-drawn 374 µm vs "
      "5.95 mN at exact ⅓-pitch, same magnet) — quote every detent figure with its "
      "registration. Adiabatic ΔT estimates ignore R(T) growth (~9% at +22 K) and "
      "say nothing about steady-state temperature (needs duty cycle + a thermal "
      "path); and Δφ = 4πΔd/λ assumes normal incidence (cosθ factor off-normal). "
      "The surviving STEEL-MAN, for balance: the one genuinely uncertain number — "
      "the detent residual — is covered by TWO independent trim knobs that act at "
      "assembly/tooling time (magnet length Pm, and registration offset, worth "
      "~1.8 mN across its range); every other requirement checks out with margin "
      "or fails for reasons no model error can rescue. A prototype force-curve "
      "collapses the remaining uncertainty in one measurement. SMC B-H is Somaloy-700-shaped; "
      "the micro-MIM route's Fe-3%Si saturates HIGHER (~1.8–2.0 T) — favourable in the "
      "saturation-limited regions, but rerun the FE with the vendor's measured B-H "
      "curve before tooling; permeability and hysteresis also differ. Two further "
      "unmodelled effects, both flagged 24 Jul: the FE treats the pole steel as "
      "CONTINUOUS — true for the monolithic Route-A pole, but the two-piece Route B "
      "adds ≈1–3 µm of bonded-joint air per joint (≈5–15% detent loss, §5.2); and no "
      "transient eddy-current solve has been run — §0.10's flux-diffusion estimate "
      "says DC pulsing clears the 1.5 ms pulse unlaminated, but the thickest-path "
      "margin is <10× and a transient FE run is on the punch list.")
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
      "vendor-claimed low-distortion magnetic annealing — subject to dimensional qualification). Multi-cavity tools amortise to cents/part "
      "at 10–100 M/yr. Fallbacks needing redesign: etched Fe-Si lamination stacks, or "
      "LIGA electroformed permalloy (custom material qualification). Translator and "
      "pole pieces in the SAME alloy (thermal-expansion match across the field gap — "
      "Tony's 24 Jul point); no laminations needed for DC pulsing per the §0.10 "
      "flux-diffusion estimate, transient FE check pending.")
    A("2. **Coils — two viable routes (corrected 24 Jul after Tony's challenge, §0.8).** "
      "The assembled pole WITHOUT the translator is an open horseshoe — its magnetic "
      "circuit closes only through the translator, which slides in axially LAST — so "
      "winding is never topologically blocked. **Route A (recommended): monolithic "
      "MIM horseshoe pole + in-situ winding** — wind 20 turns of Ø50 µm bondable wire "
      "directly on the bridge limb of the one-piece pole (watch/hearing-aid fine-wire "
      "winders; needle access through the open throat). Zero magnetic joints: the FE "
      "assumes continuous steel, and this route delivers it. **Route B: two-piece pole "
      "+ pre-wound coil** — self-supporting coil wound on a former, slipped over the "
      "open bridge limb, then the bridge bonded to the slot-sections. Falls back on "
      "the mature hearing-aid/VCM coil supply chain, but each bonded joint in the flux "
      "path is ≈1–3 µm of effective air ⇒ ≈5–15% detent loss against the 2×20 µm "
      "working gaps — measurable, and Route A avoids it. Both are in the Annex B "
      "request-for-quotation; the winder-cycle-time quote decides.")
    A("3. **Magnets** — sintered NdFeB thin-sliced slugs (0.348×1.162×0.243 mm), "
      "Ni + parylene coated (the 15-year-outdoor corrosion stack is a qualification "
      "gate: demand salt-spray/PCT data on sub-mm parts), supplied UNMAGNETISED "
      "(handling: a magnetised slug near steel sees ≈0.27 N ≈ 37,000× its weight and "
      "collects ferrous debris destined for a 20 µm gap).")
    A("4. **Assembly + the 20 µm gap.** Bond the pole (monolithic, Route A) or bridge "
      "+ slot-sections (Route B) around the translator/bearing; set the gap with "
      "precision shims or active gauging. dF/dg ≈ −8%/µm here, so ±5 µm scatter = "
      "±40% force: the 100%-test detent-force measurement IS the gap gauge — measure, "
      "sort/adjust, then fix.")
    A("5. **Magnetise after assembly** (pulse fixture through the assembled pole) — "
      "preferably as the magnet SUPPLIER'S service (SDM offers exactly this, §6 row "
      "10; already in Annex C) rather than an in-house step, per Tony's 24 Jul "
      "steer — then 100% detent-force + step test.")
    A("")
    A("The cost picture (indicative, NOT quotes): materials ≈ $0.001/unit are noise. "
      "Component floors already stack: 3 coils ($0.03–0.15 ea) + 3 magnets "
      "($0.03–0.10 ea) + ~10 micro-MIM parts (cents each) ⇒ the honest all-in band is "
      "**$0.10–0.25 at ~10 M/yr, approaching $0.10 only at 100 M-scale with the "
      "optimistic end of every component band** and the detent-test-as-gap-gauge "
      "flow. Every figure is planning-grade until RFQs return.")
    A("")

    # ------------------------------------------------------------------ §6
    A("## 6. Who can make it — ten supplier entries, with evidence")
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
      "Whole actuator | Among the only companies to have mass-produced sub-5 mm toothed "
      "PM steppers — the closest published product match found |")
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
      "bridges** | The strongest published process+material match for 232 µm soft-magnetic "
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
    A("1. ANSWERED 24 Jul: reflector = mg-scale plastic + 20 µm Cu foil on a standoff "
      "(<2% of Mt — budgets stand; see §0.6). Remaining ask: the standoff distance "
      "(Vlad), only because it sets the moving-mass tail and the cell stack-up.")
    A("2. ANSWERED 24 Jul: 5 g was the test minimum; ambition is 20–30 g — see §0.3 "
      "ladder. Remaining ask: confirm whether 20–30 g is HOLD (detent) or survive "
      "(shock) — they size differently.")
    A("3. Orientation confirmed? (translator axis along beam depth — assumed)")
    A("4. Peak temperature (NdFeB demag margin check is one line once known) and the "
      "real driver voltage (1 V limits drive to reduced-margin stepping; 2 V unlocks "
      "the full 2·Fd point). NEW: the cell's guide-wavelength/cutoff at ~70 GHz, so "
      "the stroke requirement (λg/2) and phase-per-step can be finalised (§0.2).")
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
    A("## 8. Worked calculations — every number, checkable by hand")
    A("")
    A("Constants: g = 9.80665 m/s²; µ0 = 4π×10⁻⁷ H/m; ρCu(20°C) = 1.72×10⁻⁸ Ω·m; "
      "copper: 8,960 kg/m³, c = 385 J/(kg·K); NdFeB assumed N42-class: Br = 1.30 T, "
      "µr = 1.05. All lengths from §1's geometry.")
    A("")
    A("### 8.1 Geometry and mass")
    A("")
    A("| Quantity | Formula | Substitution | Result |")
    A("|---|---|---|---|")
    A("| Bar volume | w₁·w₂·L | 1.549 × 1.55 × 12.5 mm | 30.012 mm³ |")
    A("| Slot count | 2 faces × ⌊L/p⌋ | 2 × ⌊12.5/0.464⌋ = 2×26 | 52 slots |")
    A("| Slot volume | d·w·t (each) | 0.465 × 0.232 × 1.55 | 0.1672 mm³ |")
    A("| Net volume | bar − 52·slot | 30.012 − 8.695 | 21.317 mm³ |")
    A("| **Mt** | V·ρ | 21.317 mm³ × 7.4 mg/mm³ | **157.7 mg** (7.3→155.6; 7.6→162.0) |")
    A("| **Wm** | (sep − width)/2 | (1.704 − 1.549)/2 | **77.5 µm** |")
    A("| Loop closure | 2·d_ss + 2·Wm + w₁ | 2×0.465 + 2×0.0775 + 1.549 | 2.634 mm = bridge ✓ |")
    A("| Stator extent | 3·pole + 2·gap | 3×1.160 + 2×0.374 | 4.228 mm |")
    A("| Stroke (baseline) | L − extent | 12.5 − 4.228 | 8.27 mm |")
    A("| Stroke (fixed) | unchanged — F2 bridge stays inside the pole footprint | — | 8.27 mm |")
    A("| Envelope ⊥ beam | trans × radial | 1.708 × 2.634 | 4.50 mm² (cells: 1.9²=3.61; "
      "0.94²=0.884 mm²) |")
    A("")
    A("### 8.2 Force targets")
    A("")
    A("| Quantity | Formula | Substitution | Result |")
    A("|---|---|---|---|")
    A("| **Fd** | 5·g·Mt | 5 × 9.80665 × 1.577×10⁻⁴ kg | **7.735 mN** |")
    A("| Drive target | 2·Fd | — | 15.47 mN |")
    A("| 10–30 g shock hold | n·g·Mt | (10…30) × 9.80665 × 1.577×10⁻⁴ | 15.5 – 46.4 mN |")
    A("| Baseline plateau miss | Fd / F_max | 7.735 / 0.52 | ≈×15 |")
    A("| Robustness bound | 3 × per-pole FE amplitude | 3 × ~1.5 mN | < 4.5 mN < Fd ✓ |")
    A("")
    A("### 8.3 Pole phasing (the 374/390/400 µm question)")
    A("")
    A("| Quantity | Formula | Substitution | Result |")
    A("|---|---|---|---|")
    A("| Centre-to-centre | pole + spacing | 1.160 + 0.374 | 1.534 mm |")
    A("| Tooth-phase offset | c-c mod p | 1.534 − 3×0.464 | 0.142 mm (ideal p/3 = 0.1547) |")
    A("| Exact spacing | 3p + p/3 − pole | 3×0.464 + 0.1547 − 1.160 | **0.3867 mm** (p = 0.464) |")
    A("|  | (if p = 0.465 rules) | 3×0.465 + 0.155 − 1.160 | **0.390 mm** (p = 0.465) |")
    A("| Tony CAD spacing | c-c mod p | (1.160+0.400) − 1.392 | 0.168 mm offset — also inexact |")
    A("| FE step split (374 µm) | net-detent zero crossings | fix-alternatives.json | "
      "172.6 / 146.1 / 145.3 µm |")
    A("| Phase jitter @80 GHz | Δφ_step × Δd/d | 29.8° × 17.9/154.7 | ±3.4° |")
    A("")
    A("### 8.4 Magnet circuit (hand-scale)")
    A("")
    A("| Quantity | Formula | Substitution | Result |")
    A("|---|---|---|---|")
    A("| Coercive field | Hc = Br/(µ0·µr) | 1.30/(4π×10⁻⁷ × 1.05) | 985 kA/m |")
    A("| PM MMF | F = Hc·Pm | 985 kA/m × 243 µm | 239 A-turns |")
    A("| PM internal reluctance | R = Pm/(µ0·µr·A) | 2.43×10⁻⁴/(1.319×10⁻⁶ × 4.05×10⁻⁷) | "
      "4.55×10⁸ H⁻¹ |")
    A("| Flux ceiling | Φ → Br·A | 1.30 × 0.405 mm² | 0.527 µWb (fixed); 0.351 µWb "
      "(baseline A = 0.27 mm²) |")
    A("| Load line check | B = Br + µ0·µr·H | 0.98 = 1.30 + 1.319×10⁻⁶ × (−245×10³) ✓ | "
      "consistent |")
    A("")
    A("### 8.5 Coil electrical")
    A("")
    A("| Quantity | Formula | Substitution | Result |")
    A("|---|---|---|---|")
    A("| Wire section | A = π(d/2)² | π × (25 µm)² | 1.963×10⁻⁹ m² |")
    A("| Wire length | Nc × mean turn | 20 × ≈3.15 mm | ≈63 mm |")
    A("| **Rc** | ρ·L/A | 1.72×10⁻⁸ × 0.063 / 1.963×10⁻⁹ | **0.552 Ω** |")
    A("| I∞ on 1 V | V/R | 1/0.552 | 1.812 A |")
    A("| MMF ceiling (1 V) | N·I∞ | 20 × 1.812 | 36.2 A-turns |")
    A("| V for Ic* | I·R | 3.35 × 0.552 | 1.85 V (≈1.9 V incl. driver drop) |")
    A("| Current density at Ic* | I/A | 3.35 / 1.963×10⁻³ mm² | 1,706 A/mm² — PULSE ONLY |")
    A("| τ (FE L) | L/R | 0.6 µH / 0.552 | 1.09 µs (lumped-L 2.2 µH → 4.0 µs) |")
    A("| t to 1.4 A on 1 V | −τ·ln(1−I/I∞) | −1.09 µs × ln(1−1.4/1.812) | 1.6 µs |")
    A("| Coil build | layers × OD | 2 × 58 µm | 0.116 mm < 0.263 mm window ✓ |")
    A("")
    A("### 8.6 Step energetics and dynamics")
    A("")
    A("| Quantity | Formula | Substitution | Result |")
    A("|---|---|---|---|")
    A("| Energy/step | I²·R·t | 1.8² × 0.552 × 1.5 ms | 2.68 mJ |")
    A("| Coil copper mass | ρ·A·L | 8,960 × 1.963×10⁻⁹ × 0.063 | 1.108 mg |")
    A("| ΔT/step (adiabatic) | E/(m·c) | 1.8 A: 2.68 mJ → 6.3 K; 3.35 A: 9.3 mJ → ≈22 K | duty-limit at Ic* |")
    A("| Detent stiffness | dF/dx at zero | FE curve slope | ≈200 N/m |")
    A("| Ring frequency | (1/2π)·√(k/m) | √(200/1.577×10⁻⁴)/2π | ≈179 Hz |")
    A("")
    A("### 8.7 Phase quantisation")
    A("")
    A("| f | λ = c/f | Δφ = 4π·Δd/λ (Δd = 0.155 mm) |")
    A("|---|---|---|")
    A("| 50 GHz | 5.996 mm | 0.3248 rad = **18.6°** |")
    A("| 80 GHz | 3.747 mm | **29.8°** |")
    A("| 160 GHz | 1.874 mm | **59.6°** |")
    A("")
    A("### 8.8 FE-only results (not hand-derivable — traceable to artefacts)")
    A("")
    A("| Result | Value | Artefact |")
    A("|---|---|---|")
    A("| Baseline gap-flux modulation over a pitch | ~8% (λ: 2.8%) | femm sweep diagnostics |")
    A("| Bridge flux crossing the gaps | 86% | gap-probe blocks, femm sweep |")
    A("| Per-pole force harmonics h3/h1 | ≈4% | femm-five-numbers.json |")
    A("| Baseline net-detent plateau | 0.47 mN (Pm 0.30) → 0.52 (0.45) | pm-ic-sweeps.json |")
    A("| Baseline drive plateau | ≈2.5 mN at 8 A (×6 short) | pm-ic-sweeps.json |")
    A("| Fixed Pm* / breakaway | 243 µm / 7.72 mN, 3 basins | fixed-design.json |")
    A("| Fixed Ic* / peak / path-min | 3.35 A / 15.4 / +4.7 mN | fixed-design.json |")
    A("| Gap sensitivity | dF/dg ≈ −8%/µm (20–40 µm) | femm-variants.json |")
    A("| Rejected: 0.35p teeth | basins 3→2 | femm-variants + basin check |")
    A("| Rejected: gap40+deep+PM×1.5 | 4.3 mN cap, 1 basin | fix-alternatives.json |")
    A("")
    A("### 8.9 Honeycomb cell array — structure and packing (Tony's CAD + prototypes, 24 Jul)")
    A("")
    A("Tony's CAD (received 24 Jul: the 2D .skp *24-hex sub array, 3.1 mm between flats, "
      "150 micron wall* and the matching 3D STLs) fixes the cell lattice — and STL "
      "wall-plane forensics settles which dimension 3.1 is: walls sit at 3.25 mm "
      "centre spacing, so **3.10 mm is the INTERIOR aperture (the RF opening), "
      "tiling pitch 3.25 mm, walls 150 µm, depth 7.75 mm** (STL bounding box; the "
      "dimensioned drawing reads 7.7), 3D-printed (metallised for RF duty), tiled as "
      "sub-arrays in TWO sizes, both received as STL: **24-hex (19.7 × 20.8 mm)** and "
      "**7-hex (9.9 × 9.6 mm)**; demo-scale prototypes "
      "(≈25–30 mm cells, hex and square egg-crate) photographed working. Scope note: the "
      "cell-size↔band mapping is RF and stays with Tony/Vlad — cell dimensions are treated "
      "as INPUTS here; only structure, packing and mass are computed.")
    A("")
    A("| Quantity | Formula | Substitution | Result |")
    A("|---|---|---|---|")
    A("| Hexagon side (interior) | a/√3 | 3.1/√3 | 1.790 mm |")
    A("| Interior (RF) area | (√3/2)·a² | (√3/2)×3.1² | 8.32 mm² |")
    A("| Tiling cell area | (√3/2)·p², p = a + t | (√3/2)×3.25² | 9.15 mm² |")
    A("| Cells per sub-array | from the STLs | — | 24 or 7 (aperture = Σ tiles) |")
    A("| Relative density | 1 − (a/p)² | 1 − (3.1/3.25)² | 0.090 |")
    A("| Wall volume per cell | (√3/2)(p² − a²)·L | 0.826 mm² × 7.75 | 6.40 mm³ |")
    A("| Cell wall mass | V·ρ | 6.40 mm³ × 1.24 mg/mm³ (printed) | 7.9 mg |")
    A("| Lattice per sub-array (large-aperture asymptote) | N·m | 24 × 7.9 mg | 0.190 g |")
    A("| **24-hex solid volume — MEASURED from its STL** | mesh integral | 1,640-triangle STL, watertight | **192.2 mm³** |")
    A("| **24-hex lattice mass — measured** | V·ρ | 192.2 × 1.24 / 2.70 | **0.238 g printed / 0.519 g Al** |")
    A("| **7-hex solid volume — MEASURED from its STL** | mesh integral | 264-triangle STL, watertight | **64.5 mm³** |")
    A("| **7-hex lattice mass — measured** | V·ρ | 64.5 × 1.24 / 2.70 | **0.080 g printed / 0.174 g Al** |")
    A("| Boundary-wall edge effect | measured/asymptote | 192.2/153.6 · 64.5/44.8 | +25% (24-hex) vs +44% (7-hex) — an isolated tile owns its outer walls; the excess shrinks toward the shared-wall asymptote as tiles grow or join |")
    A("| Widest fit at actuator height | (2·AF − h)/√3 | (6.2 − 2.634)/√3 | 2.06 mm ≥ 1.708 ✓ |")
    A("| Actuator fit in the 3.1 mm cell | h ≤ AF and w ≤ (2AF−h)/√3 | 2.634 ≤ 3.1; 1.708 ≤ 2.06 | **FITS** |")
    A("| Fit @80 GHz cell (1.9 mm) | same test | 2.634 > 1.9 | FAILS — needs ≥2-deep axial stagger; NOTE this row uses the OUTLINE spec's per-band cell assumption — Tony's delivered E-band cell is 3.1 mm, where the actuator FITS (the 1.9/0.94 rows stand only as stress-tests for the 120–160 GHz roadmap) |")
    A("| One actuator, total mass | Mt + 3·(steel+PM+coil) | 157.7 + 3×(18.8+0.74+1.11) | 220 mg |")
    A("| Actuators per sub-array | N·m | 24 (7) × 220 mg | **5.3 g (1.5 g)** — dominates the measured lattice ≈22× (19×) |")
    A("")
    A("The hexagon fit rule (the corner cuts width as height grows) is why the 1.708 × 2.634 mm "
      "actuator clears the 3.1 mm cell with 0.35 mm to spare but can never enter a 1.9 mm cell. "
      "The square egg-crate alternative accepts the rectangular actuator whenever its pitch "
      "≥ 2.634 mm with no corner check, at ≈15% fewer cells per area than hex at equal pitch. "
      "All of §8.9 is live in PHANTM-CALC.xlsx §11 (yellow cells: cell size, wall thickness, "
      "sub-array count, material density).")
    A("")

    # ---------------------------------------------------------- §9 hex cell
    A("## 9. The hex-cell wave conformer — how it works and how the actuator integrates")
    A("")
    A("*Work package added 24 Jul on Tristan's instruction, informed by the NATO DIANA "
      "quad chart and UKDI Delta Drop bid (both archived in `out/`). Scope: SINGLE-CELL "
      "waveguide physics and the electromechanical interface only — array-level gain, "
      "scan and nulling figures are quoted from Tony's own documents and are NOT "
      "modelled here; feed, matching and choke design stay with Tony/Vlad.*")
    A("")
    A("### 9.1 What the wave conformer is")
    A("")
    A("From the bid documents: PHANTM is a **front-fed reflective phased array** — a "
      "passive metal aperture of hexagonal waveguide cells illuminated by a single "
      "shielded feed. Each cell contains a movable reflective short; the round-trip "
      "path to that short applies a reflection phase **φ = 4π·d/λg** to the cell's "
      "re-radiated field. Setting each cell's short depth d sets the aperture's phase "
      "profile — the beam is formed and steered with zero active electronics on the "
      "aperture. The actuator of §1–§8 is the device that positions one cell's short: "
      "one actuator per cell, translator axis along the cell (beam) axis.")
    A("")
    A("### 9.2 Single-cell physics — cutoff and guide wavelength (computed, validated)")
    A("")
    A("Cell geometry is the STL-measured ground truth: interior across-flats "
      "**3.10 mm** (the RF aperture — walls sit at 3.25 mm pitch, so 3.1 mm is the "
      "clear opening), depth 7.75 mm. The dominant-mode cutoff of a hexagonal guide "
      "has no closed form, so it is computed by a 2D Helmholtz eigensolver "
      "(finite-difference Neumann, `hexcell.py`) — validated against the circular "
      "guide (0.07% error), the square guide (exact), the inscribed/circumscribed "
      "circle bounds, and 0.02% grid convergence:")
    A("")
    A("- **λc = 5.598 mm ⇒ fc = 53.56 GHz** (equivalent-area circle cross-check: "
      "53.97 GHz — 0.8% agreement). Caveat: smooth perfect-conductor walls; the "
      "printed-and-metallised cell's effective dimensions and surface loss are "
      "Vlad's to confirm.")
    A("")
    A("| f (GHz) | λ0 (mm) | λg (mm) | stroke need λg/2 | phase/step (154.7 µm) | full levels per 2π (⌊(λg/2)/step⌋) |")
    A("|---|---|---|---|---|---|")
    A("| 50 | 6.00 | — BELOW CUTOFF | — | — | — |")
    A("| 55 | 5.45 | 23.96 | 11.98 mm — exceeds cell AND translator | 4.6° | 77 (λg hypersensitive this close to cutoff — ±0.1% in λc moves it ≈±2%) |")
    A("| 60 | 5.00 | 11.08 | 5.54 mm | 10.0° | 35 |")
    A("| 65 | 4.61 | 8.14 | 4.07 mm | 13.7° | 26 |")
    A("| 70 | 4.28 | 6.65 | 3.33 mm | 16.7° | 21 |")
    A("| 75 | 4.00 | 5.71 | 2.86 mm | 19.5° | 18 |")
    A("| 80 | 3.75 | 5.05 | 2.52 mm | 22.1° | 16 |")
    A("| 85 | 3.53 | 4.54 | 2.27 mm | 24.5° | 14 |")
    A("| 90 | 3.33 | 4.15 | 2.07 mm | 26.9° | 13 |")
    A("")
    A("![hexcell](fig-hexcell.png)")
    A("")
    A("Three consequences, all new: **(a) 50 GHz is below the dominant-mode cutoff** — operation there is not "
      "supported by this model (any evanescent/short-backed scheme needs full-wave "
      "validation, Vlad) and at the 55 GHz prototyping frequency it is so dispersive that full-2π "
      "would need a 12 mm stroke — the U-band COTS prototype in the UKDI bid must be a "
      "LARGER cell, as that bid indeed implies. **(b) Full 2π is available from ≈57 GHz upward — and "
      "near the band edge the BINDING limit is the CELL DEPTH (7.75 mm of travel "
      "inside the guide), not the actuator (8.27 mm stroke, which exceeds the cell "
      "anyway; council catch, gpt-5.5)**: λg/2 = 7.75 mm at 56.9 GHz. The whole "
      "60–90 GHz target band is covered with margin. Two refinements from the "
      "second council pass (grok-4.5): the actuator's spare stroke is only "
      "0.52 mm, so a deeper cell alone moves the edge merely 56.9 → ≈56.5 GHz — "
      "going meaningfully below ≈57 GHz needs a LONGER TRANSLATOR (cheap: length "
      "grows, nothing else changes) plus the deeper cell; and the usable travel "
      "is really 7.75 mm MINUS the short-stack height and end margins (≈0.5–1 mm, "
      "foil + standoff + nose), so the true edge sits nearer ≈57.4–58.0 GHz "
      "(57.8 at 6.9 mm usable; sol recomputation) — the 60 GHz margin (5.54 of "
      "≈6.9 usable mm) is untouched. "
      "Corollary for the UKDI bid's ≈55 GHz U-band prototype: scaling this cell so 55 GHz "
      "sits at the same operating point as 70 GHz does in production (f/fc = 1.307) gives "
      "an interior across-flats of **≈3.95 mm** and depth ≈9.9 mm (λg/2 = 4.23 mm at 55) — "
      "the unchanged actuator fits it with even more room. "
      "**(c) The §0.3 force-ladder's two-group "
      "option (stroke 3.7 mm) only covers ≥≈67.2 GHz** — doubling the poles for 10 g "
      "trades away 60–67 GHz. Force and band coverage are coupled through stroke; "
      "any force upgrade must be checked against the lowest operating frequency.")
    A("")
    A("### 9.3 The integration — one cell, one actuator")
    A("")
    A("1. **The moving short shields its own actuator — to first order.** The "
      "reflector (mg-scale plastic + 20 µm copper foil, §0.5) rides on the "
      "translator nose, stood off from the iron. Behind a reflective short the "
      "fields are evanescent, so the actuator hides behind the plane it controls: "
      "it occupies the cell's CROSS-SECTION (footprint) and extends axially BEHIND "
      "the cell, the translator tail passing out through the back wall (D5) — only "
      "the foil, standoff and translator nose are ever inside the guide volume. "
      "The one leak path is the foil-edge running clearance (item 4 below, Vlad's "
      "to quantify) — so 'shielded' is a first-order claim pending that number, "
      "not an absolute (council catch, grok). The 1.708 × 2.634 mm envelope "
      "fitting the 3.1 mm interior (§8.9, 0.35 mm width margin) remains the "
      "make-or-break packaging fact — and it fits (0.35 mm is the WIDTH margin at "
      "the actuator's 2.634 mm height; the height margin itself is 0.47 mm).")
    A("2. **Stroke budget** — table above: single-group covers the band (cell "
      "depth binding); the two-group option (§0.3's force-doubler: TWO 3-pole "
      "stator groups on one translator, halving usable stroke to ≈3.7 mm) is a "
      "≥67 GHz option only.")
    A("3. **Phase resolution** — 16.7°/step at 70 GHz in-guide (the free-space 26° "
      "of §8.7 was the upper bound). FE step unevenness (172.6/146.1/145.3 µm at "
      "the as-drawn registration) maps to −1.0/+1.9° of per-step deviation at 70 GHz (asymmetric — the 172.6 µm step is the outlier); the "
      "exact-⅓ registration option (§4 F3 trade) makes steps uniform at 154.7 µm.")
    A("4. **Foil-to-wall clearance is an RF interface, not just a mechanical one.** "
      "The moving foil needs running clearance to the guide wall; that annular gap "
      "leaks past the short. Quantifying the leak (and any choke/lip on the foil "
      "edge) is Vlad's; the actuator side must deliver the clearance and the "
      "standoff distance he specifies — both are one-line changes in the "
      "parameterised model.")
    A("5. **Hold force vs the platform.** SATCOM-on-the-move (the quad chart's use "
      "case) makes the 20–30 g ambition a VIBRATION spec, not a courtesy margin — "
      "zero-power hold must beat platform acceleration at the detent. This is the "
      "open Tony question (hold vs shock, §0.3) with a concrete route to the answer: "
      "the vehicle vibration envelope sets n·g, the §0.3 ladder buys it.")
    A("6. **Drive electronics scale — two regimes, never mixed (council catch, "
      "gpt-5.5).** 3 coils per cell ⇒ 72 per 24-hex tile; ≈10 steps per cell per "
      "re-point; 8 cells at a time (3 groups × 10 steps × ≈4 ms) re-points a tile "
      "in ≈0.12–0.15 s. STEPPING regime (1.8 A): 2.7 mJ/step, tile ≈0.65 J, "
      "15.4 W during the 1.5 ms pulses (37% duty ⇒ ≈5.8 W averaged over the "
      "re-point). WORST-CASE FULL-DRIVE regime (3.35 A): 9.3 mJ/step, tile "
      "≈2.2 J, 53.6 W pulses (≈20 W averaged). Comfortably inside the bid's "
      "mechatronic-nulling claims at ms-per-step; large-aperture re-point time is "
      "a driver parallelism budget, not physics.")
    A("")
    A("### 9.4 Interface requirements (the actuator ↔ cell contract)")
    A("")
    A("| # | Requirement | Owner | Value today |")
    A("|---|---|---|---|")
    A("| 1 | Travel ≥ λg/2 at lowest f — cell depth AND stroke both bound it | actuator + cell | usable ≈ 7.75 − short-stack/margins (≈0.5–1 mm) ≈ 6.9 mm ≥ 5.54 mm @60 GHz ✓; cell depth binds the edge (≈57.4–58.0 GHz); two-group stroke fails below ≈67.2 GHz |")
    A("| 2 | Fit inside 3.10 mm interior | actuator | 1.708 × 2.634 mm ✓ (width margin 0.35 mm) |")
    A("| 3 | Step size / uniformity | actuator | 154.7 µm ideal; FE 172.6/146.1/145.3 — registration choice, §4 F3 |")
    A("| 4 | Zero-power hold ≥ platform vibration | actuator + Tony spec | 5.0 g now; ladder to 20–30 g (§0.3) — vibration envelope needed |")
    A("| 5 | Foil standoff distance from iron | Vlad | open — parameterised, one-line change |")
    A("| 6 | Foil-edge clearance + leak/choke | Vlad (RF) / actuator (mech) | open |")
    A("| 7 | Non-magnetic frame parts near the field region | frame design | flagged — frame is the §4.5 open block |")
    A("| 8 | Re-point time / drive parallelism | driver electronics | ≈0.15 s per 24-cell tile at 8-way parallel |")
    A("")

    A("### 9.5 CAD: the integration drawings, and the drive PCB with its power/control budget")
    A("")
    A("![D5](drawing-D5-cell-integration.png)")
    A("")
    A("D5 is the axial cross-section of one cell: the foil short travels inside the "
      "7.75 mm guide (λg/2 = 3.33 mm of travel covers 2π at 70 GHz); the translator "
      "tail exits through the cell back wall and a Ø2.6 mm clearance hole in the "
      "APERTURE PCB; the stator mounts on the backplate behind. The 3D model shows "
      "the same stack on a 7-cell tile (one cell cut away; aperture face down):")
    A("")
    A("![3D hexcell](render-3d-hexcell.png)")
    A("")
    A("![D6](drawing-D6-pcb.png)")
    A("")
    A("**The drive is UNIPOLAR — a council correction that simplified the whole "
      "board.** The first-draft architecture (three shared full-H phase bridges + a "
      "dual select-FET per cell) was killed in review (gemini-3.1): a dual FET "
      "cannot block a bipolar phase rail — body diodes conduct and deselected coils "
      "cross-feed. The fix is cheaper than the bug: step DIRECTION comes from the "
      "phase SEQUENCE (A→B→C vs C→B→A), never from current polarity, so each coil "
      "needs exactly ONE low-side FET (72 per tile, 10–20 mΩ, 1 mm-class DFN — "
      "which now FITS the cell pitch) plus a flyback clamp (the 0.6 µH coil stores "
      "a trivial 3.4 µJ). The APERTURE board carries the Ø2.6 mm clearance holes, "
      "coil pads and those per-coil FETs; the DRIVER board behind carries the "
      "DAC-set buck (burst-rated, VRM-class ≥30 A at 2 V, with input bulk), the "
      "MCU and the gate-drive shift registers. A reverse 'brake' pulse (§4.4 "
      "option) would need half-bridges — added only if settle tests demand it. "
      "Coils are wired so positive rail current AIDS the permanent magnet (the FE "
      "sign convention). Facts that do the heavy lifting (drive-electronics.json):")
    A("")
    A("- **The rail voltage IS the current control.** The coil is resistive at every "
      "timescale that matters (τ = L/R ≈ 1.1 µs ≪ 1.5 ms pulse): the total path is resistive (0.552 Ω coil + ≈45 mΩ FET/trace = 0.60 Ω), so "
      "rail ≈1.07 V delivers the 1.8 A step and 2.0 V the 3.35 A full drive — no "
      "per-channel current loops. The care this buys: rail-sharing across parallel cells needs "
      "star/kelvin routing with ≤5 mΩ of shared path (26.8 A × 5 mΩ ≈ 7% current "
      "error; the force penalty follows the FE force–current curve — the PM bias "
      "makes it between linear and quadratic — council items, gemini-3.1 + sol), and coil warming "
      "(+0.39%/K) trims current a few percent within a burst.")
    A("- **Idle power is zero** (the PM detent holds); the budget is re-pointing "
      "bursts, quoted per regime. STEPPING (1.8 A): tile 0.65 J, 16.4 W pulses / "
      "≈6 W average, 0.12 s at 8-parallel; a 10 × 10 cm panel (≈1,093 cells) "
      "29.3 J, 5.5 s at 8-parallel or 0.72 s at 64-parallel (131 W pulses). "
      "WORST-CASE FULL-DRIVE (3.35 A): tile 2.2 J, 53.6 W pulses / ≈20 W average; "
      "panel 102 J coil / 110 J rail, 429 W pulses at 64-parallel. The parallelism knob is a "
      "driver-board sizing choice, not a physics limit.")
    A("")
    A("Control is deliberately dumb: per-tile MCU, open-loop step counting into the "
      "detents (that is what the zero-power detent is FOR), hold-then-release capture "
      "per §4.4, tiles daisy-chained on CAN/SPI, and the host supplies only a per-cell "
      "target-depth map. The phase map itself — which depth pattern steers where — is "
      "RF and stays with Tony/Vlad.")
    A("")

    A("### 9.6 How to make the cells — the tutorial, and who can fabricate them")
    A("")
    A("**The part**: a tileable hex lattice (24-hex, 19.7 × 20.8 mm, or 7-hex), interior "
      "across-flats 3.10 mm, walls 150 µm, depth 7.75 mm, conductive inner surfaces. "
      "Two framing facts before any process talk: the INTERIOR aperture is the RF "
      "dimension (sensitivity: **fc moves ≈17 MHz per µm** of across-flats, so a "
      "±25 µm tolerance is ±0.4 GHz of cutoff — fine mid-band, felt near the band "
      "edge); and the WALL thickness is NOT a waveguide dimension — it sets element "
      "pitch (array-level, Tony/Vlad) and mass, which means the manufacturer may "
      "thicken walls for process reasons without touching the cell RF.")
    A("")
    A("**The manufacturing tension**: 150 µm walls × 7.75 mm deep is a ≈52:1 aspect "
      "ratio — comfortably PRINTABLE, not conventionally mouldable (thin-wall "
      "injection limits are ≈15–30:1). That splits the route by volume:")
    A("")
    A("1. **Prototype (1–100 tiles): print + metallise.** High-resolution "
      "projection micro-stereolithography (2–25 µm class) or a good SLA print of the "
      "tile → clean/dry → **electroless copper 3–5 µm** on all surfaces (skin depth "
      "at 70 GHz is 0.25 µm — plate ≥10×) → thin nickel or immersion-gold flash for "
      "corrosion. Print SURFACE ROUGHNESS is the RF tax: 1–10 µm print texture vs "
      "0.25 µm skin depth raises conductor loss — specify vapour smoothing or "
      "electropolish, and let Vlad set the loss budget. Plate BEFORE bonding the "
      "back skin, while every cell is open at both ends. This is exactly Tony's "
      "current 3D-printed route, plus the metallisation step.")
    A("2. **Pilot (1k–100k): all-metal precision.** Electroforming (copper grown on "
      "a dissolvable mandrel — the classic satellite feed-network process; "
      "tolerances to ±5 µm, conductivity solved by construction) or wire-EDM from "
      "solid aluminium. Higher unit cost, reference-grade RF.")
    A("3. **Volume (100k+/yr): metallised moulded plastic** — the automotive-radar "
      "playbook (77 GHz waveguide antennas ship in cars today). Needs the aspect "
      "ratio tamed: EITHER thicken walls to ≈0.3 mm (pitch grows to 3.4 mm — an "
      "array-level call for Vlad) OR mould TWO half-depth tiles (≈26:1 each, "
      "standard) and bond face-to-face, then plate. Tooling £30–80k, parts "
      "sub-£2/tile at scale (indicative, LOW confidence until quotes).")
    A("4. **The cheap experiment**: aerospace aluminium honeycomb core is a COMMODITY "
      "at exactly this cell size (1/8\" = 3.175 mm) — foil walls 18–50 µm, corrugated "
      "geometry, MIL-spec. Not Tony's uniform-wall hexagon, but a £100 slice answers "
      "'how does a real metal lattice of this cell size behave on Vlad's bench' in a "
      "week.")
    A("5. **Assembly + QA**: metallised tile → flatness check → bond to the drilled "
      "back skin → PCB stack (§9.5). Gates: dimensional scan (the ±25 µm interior "
      "tolerance), plating continuity (DC resistance wall-to-wall), and an RF "
      "return-loss spot check per batch (Vlad's bench).")
    A("")
    A("**Who can make them — contact routes researched and live-verified 24 Jul** "
      "(three parallel verification passes; every email read off the company's own "
      "page, never constructed; gaps stated):")
    A("")
    A("| # | Company | Role for us | Route | Named person | Phone |")
    A("|---|---|---|---|---|---|")
    A("| 1 | **SWISSto12** (CH) | printed + plated RF structures — 2,000+ qualified 3D-printed RF parts in orbit | contact form (no public email) | **Hadar Naor, VP Sales EMEA** | — |")
    A("| 2 | **Vitesse Systems / Custom Microwave** (Longmont CO) | electroforming, 50 yrs, 1 GHz–1 THz, ±5 µm — strongest all-metal fit | Sales@custommicrowave.com (live-verified) | **Matthew Parisi, VP Sales & Marketing** | +1 303 651 0707 |")
    A("| 3 | **Thomas Keating** (Billingshurst UK) | precision mmWave machining + IN-HOUSE electroforming (ALMA heritage) | K.Pike@terahertz.co.uk (live-verified) | **Kevin Pike, Scientific Sales**; Simon Duke, Toolmaking Sales | +44 1403 787613 |")
    A("| 4 | **RPG Radiometer Physics** (Meckenheim DE) | in-house mmWave design + machining, 50 GHz–1.1 THz | mm-wave-sales@radiometer-physics.de (live-verified) | Dr Thomas Rose, Managing Partner | +49 2225 7075-0 |")
    A("| 5 | **Gapwaves** (Gothenburg SE) | volume metallised-waveguide antennas (77 GHz automotive) — the 100k+/yr route | enquiry form | no public sales name (CEO Jonas Ehinger) | +46 31 762 60 40 |")
    A("| 6 | **Huber+Suhner** (Herisau CH) | metallised-plastic waveguide antennas 76–81 GHz in volume | contact form (email obfuscated) | **Francesco Merli, Head of PM & Dev, Antennas & mmWave** | +41 71 353 41 11 |")
    A("| 7 | **Boston Micro Fabrication** (Maynard MA) | micro-printing 2–25 µm class, ±10 µm — the prototype tile printer | info@bmf3d.com (live-verified) | Steffen Hägele, Sales Manager DACH (2022 evidence) | +1 978 637 2050 |")
    A("| 8 | **Cybershield** (Lufkin TX) | electroless plating on plastic — explicitly markets plated antenna/waveguide systems | sales@cybershieldinc.com (live-verified) | no public name | +1 866 684 8808 |")
    A("| 9 | **SAT Plating** (Troy MI) | plating on PEEK/Ultem/printed parts (\"we plate the unplateable\") | WillW@SATPlating.com (live-verified) | **William Wallace, General Manager** | +1 248 273 0037 |")
    A("| 10 | **Precision Micro** (Birmingham UK) | photochemical etching 10 µm–2.5 mm — the etched-foil/stacked-wall route | sales@precisionmicro.com (live-verified) | **Ben Kitson, Head of Business Development** | +44 121 380 0100 |")
    A("| 11 | **Elliptika** (Brest FR) | RF design house: 3D-printed antennas + measurement benches — EU print-and-verify partner | contact@elliptika.com (live-verified) | Alexandre Manchec (heads the company) | +33 2 98 02 03 40 |")
    A("| 12 | **Flann Microwave** (Bodmin UK) | precision waveguide components to 1.1 THz — bench/interface hardware for Vlad's tests | sales@flann.com (live-verified) | Steve Horner / Caleb Hamlet, Technical Sales | +44 1208 77777 |")
    A("| 13 | **Hexcel** (Stamford CT) | commodity 1/8\" aluminium honeycomb (HexWeb CR III) — the cheap experiment | web form only | no public name | +1 800 688 7734 |")
    A("| 14 | **Plascore** (Zeeland MI) | commodity aluminium honeycomb (PAMG-XR1), 1/16–3/8\" cells | sales@plascore.com (live-verified) | no public name | +1 616 772 1220 |")
    A("")
    A("Recommended first requests-for-quotation: **Thomas Keating + Vitesse** "
      "(reference-grade metal tiles, both electroforming), **BMF + Cybershield or "
      "SAT** (the print-and-plate prototype pair), **SWISSto12** (integrated "
      "print+plate, space heritage), and a **Hexcel/Plascore honeycomb slice** as the "
      "week-one bench experiment. Draft emails for the cell lattice are in §11 "
      "alongside the actuator outreach (Annex E carries the cell specification).")
    A("")

    # ------------------------------------------------------------------ §10
    A("## 10. Traceability")
    A("")
    A("Every headline number maps to a machine-readable artefact in `scripts/phantm/out/`: "
      "five-numbers.json (lumped v1) · femm-five-numbers.json (baseline FE) · "
      "pm-ic-sweeps.json (task-3/4 curves) · femm-variants.json (levers) · hexcell.json (cell cutoff + band table) · "
      "fixed-design.json (Pm*, Ic*, curves) · fix-alternatives.json (rejected "
      "alternates + FE step split) · dynamics.json · cost.json · scorecard.json. "
      "Reproduce: selftest.py (27/27 guards incl. basin-count, spike-free, co-energy "
      "identity) then the scripts in TRACKER.md order. FE backend: native xfemm "
      "femmcli (build recipe in femm/runner.py); C-core gate must PASS before any "
      "actuator run is trusted.")

    A("")
    A("**Final verification round (" + stamp + "):** a deterministic harness "
      "(verify_report.py, wired into selftest) recomputes every hand-derivable "
      "number from first principles, cross-checks every FE number against its "
      "artefact, enforces a stale-string blacklist, and pins the 3D model's "
      "constants to the analysed geometry — 28/28 green. A 5-seat cross-lineage "
      "council then reviewed physics validity, red-teamed both headline "
      "conclusions, steel-manned the design, and re-verified all 11 figures; its "
      "one substantive catch (registration sensitivity of the detent residual) "
      "was settled by a fresh FE solve and is now §4's F3 trade.")

    # ---------------------------------------------------------------- §10
    outreach = os.path.join(OUT, "SUPPLIER-OUTREACH-DRAFTS.md")
    if os.path.exists(outreach):
        A("")
        A("## 11. Supplier outreach — verified contacts, draft emails and "
          "request-for-quotation specifications")
        A("")
        body = open(outreach).read()
        body = body.split("\n", 1)[1] if body.startswith("#") else body
        A(body)

    path = os.path.join(OUT, "PHANTM-ACTUATOR-REPORT.md")
    text = "\n".join(L) + "\n"
    # '~' pairs render as strikethrough in GFM — use '≈' for approximations
    text = text.replace("~", "≈")
    with open(path, "w") as f:
        f.write(text)
    print(f"wrote {path} + figures")


if __name__ == "__main__":
    main()
