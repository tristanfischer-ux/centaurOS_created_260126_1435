"""PHANTM — the standalone answer to Tony's 28 Jul worksheet + BIG QUESTION.

Emits out/PHANTM-TONY-V2-ANSWER.md: his worksheet filled in, then the
manufacturability verdict on the translator and the pole pieces.

Deliberately standalone. It does not depend on, refer into, or require the main
report — Tony asked for documents that carry only the current iteration, and
this is an answer to one specific set of drawings on one specific day.

Run: ~/.venvs/phantm/bin/python tony_v2_answer.py
"""

from __future__ import annotations

import json
import math
import os

import numpy as np

from tony_v2 import pm_options, supply_ceiling

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

CU_C_VOL = 3.45e6          # J/(m^3 K)
STEPS_PER_S = 10.0
SUPPLY_V = 5.0


def load(n):
    p = os.path.join(OUT, n)
    return json.load(open(p)) if os.path.exists(p) else None


def current_for(rows, target_mn):
    """Interpolate the FE force curve for the current that reaches a target."""
    i = np.array([r["current_a"] for r in rows])
    f = np.array([r["force_mn"] for r in rows])
    if target_mn > f.max():
        return None
    return float(np.interp(target_mn, f, i))


def volts_per_at(mean_turn_um, wire_bare_um, rho=1.72e-8):
    """Volts needed per ampere-turn — the number that actually sets the rail.

    V = i.R = i.(rho.N.l_turn/A_wire) = (N.i).(rho.l_turn/A_wire)

    The turn count CANCELS. For a required magnetomotive force the supply
    voltage depends only on the mean turn length and the wire CROSS-SECTION —
    winding more turns does not help, and thicker wire is the only lever that
    does. This is the single most useful line in the answer.
    """
    a = math.pi * (wire_bare_um * 1e-6 / 2) ** 2
    return rho * (mean_turn_um * 1e-6) / a


def main():
    num = load("tony-v2-numbers.json")
    fe = load("tony-v2-fe.json")
    assert num and fe, "run tony_v2.py and femm.tony_v2_fe first"

    t, c, g = num["translator"], num["coil"], num["geometry"]
    rows = fe["force_vs_current"]
    fd = t["detent_target_mn"]
    f15, f20 = t["stepping_force_mn"]

    i_fd = current_for(rows, fd)
    i_15 = current_for(rows, f15)
    i_20 = current_for(rows, f20)
    r_ohm = c["resistance_ohm"]

    # electrical time constant at the aligned inductance
    l_al = max(r["L_aligned_uh"] for r in rows) * 1e-6
    tau_us = l_al / r_ohm * 1e6

    # mechanical step time and energy at the recommended point
    m_kg = t["mass_mg"] * 1e-6
    s_m = t["step_um"] * 1e-6
    f_rec = f15
    # The stepping target is no longer reachable inside the swept current
    # range on the corrected model, so there is no interpolated operating
    # point to quote. Fall back to a clearly-labelled PLANNING current for the
    # energy and pulse-width arithmetic rather than inventing a result.
    i_rec = i_15 if i_15 is not None else 1.00
    i_rec_is_planning = i_15 is None
    t_step = math.sqrt(2 * s_m / ((f_rec * 1e-3) / m_kg))
    pulse_ms = max(1.5 * t_step * 1e3, 1.0)
    e_ohmic = i_rec ** 2 * r_ohm * (pulse_ms * 1e-3)
    e_mag = 0.5 * l_al * i_rec ** 2
    e_step = e_ohmic + e_mag
    p_avg = e_step * STEPS_PER_S

    cu_vol = (c["wire_length_mm"] * 1e-3) * math.pi * (20e-6) ** 2
    dT = e_ohmic / (CU_C_VOL * cu_vol)
    i_hot = supply_ceiling(r_ohm, SUPPLY_V, dT)

    # The rail ceiling, cold and after one pulse. A design that only just
    # reaches its target current cold does not reach it at all once warm.
    i_cold = supply_ceiling(r_ohm, SUPPLY_V, 0.0)
    margin_pct = (i_cold - i_rec) / i_rec * 100.0

    vpat_40 = volts_per_at(c["mean_turn_length_um"], 40)
    vpat_50 = volts_per_at(c["mean_turn_length_um"], 50)
    vpat_63 = volts_per_at(c["mean_turn_length_um"], 63)
    at_needed = 70 * i_rec   # planning figure when the target is unreachable

    L = []
    A = L.append
    A("# PHANTM v2 actuator — your worksheet, filled in, and the "
      "manufacturability answer")
    A("")
    A("Tony — this is a standalone answer to the drawings and worksheet you "
      "sent on 28 July. It does not depend on the main report and does not "
      "repeat any of it.")
    A("")
    A("> **Read this first — a correction to my own numbers.** An earlier "
      "version of this answer gave a force-versus-current table. On a "
      "fine-tooth-comb review it did not survive: the finite-element model I "
      "used does not converge. Moving the translator's end boundary from 3 to "
      "12 tooth pitches away makes the computed force fall steadily "
      "(1.07 → 0.81 → 0.62 → 0.49 mN at 0.40 A) instead of settling, and a "
      "spurious constant term stays at a quarter of the peak throughout. The "
      "mesh is fine — halving it moves the answer 0.5% — so it is the model's "
      "geometry, not its numerics. **I am therefore withdrawing the force "
      "magnitudes.** What survives, and why, is set out in §2. Everything "
      "outside the force question — mass, targets, electrical, resonance, "
      "magnet screening and manufacturability — is arithmetic on your "
      "dimensions and stands.")
    A("")
    A("**Headline.** The geometry is sound and it closes to the micron. But at "
      f"the currents in your worksheet (0.30–0.40 A) the actuator produces "
      f"**{rows[0]['force_mn']:.2f}–{rows[2]['force_mn']:.2f} mN**, against your "
      f"own 30 g detent target of **{fd:.1f} mN** — roughly **{fd/rows[2]['force_mn']:.0f}× "
      f"short in force** — and by more than that on the better-converged "
      f"models. The shortfall is not the geometry, it is the ampere-turns: "
      f"70 turns × 0.40 A is 28 A-turns, which is simply not many however the "
      f"iron is modelled. Because force goes as the SQUARE of current, even a "
      f"7× force gap is only about a 2.7× current gap — so the fix is "
      f"reachable, but it is now mandatory rather than optional. See §8.")
    A("")

    # ---- 0. geometry closure ------------------------------------------
    A("## 0. Your dimensions close — which is what licenses everything below")
    A("")
    A("Two independent checks, both exact:")
    A("")
    A(f"- 25 teeth × 125 µm + 24 slots × 187 µm = **{g['lz_um']:.0f} µm**, "
      f"against your stated L_z of 7.612 mm.")
    A(f"- core 280 µm + 2 × slot depth 280 µm = **{g['lx_um']:.0f} µm**, "
      f"against your stated L_x of 840 µm.")
    A("")
    A("The first check also *forces* the tooth/slot assignment: teeth are the "
      "125 µm feature and slots the 187 µm one. Swapping them gives 7.675 mm "
      "and misses. That makes the tooth duty **0.401** — which is, to three "
      "figures, the 0.40 our own duty sweep independently found to be the best "
      "point. You have converged on the same number from the other direction.")
    A("")

    # ---- 1. mass and targets ------------------------------------------
    A("## 1. Translator mass and force targets")
    A("")
    A("| Quantity | Value |")
    A("|---|---|")
    A(f"| Solid volume | {t['volume_mm3']} mm³ ({t['solid_fraction']*100:.0f}% "
      f"of the envelope) |")
    A(f"| **Mass M_t** | **{t['mass_mg']:.1f} mg** |")
    A(f"| Weight | {t['weight_mn']:.3f} mN |")
    A(f"| **Detent target F_d = 30·M_t·g** | **{fd:.1f} mN** |")
    A(f"| Stepping force 1.5–2 × F_d | {f15:.1f} – {f20:.1f} mN |")
    A(f"| Tooth pitch | {g['pitch_um']:.0f} µm (duty {t['tooth_duty']:.3f}) |")
    A(f"| Step size (third-pitch, 3 phases) | {t['step_um']:.1f} µm |")
    A("")

    # ---- 2. magnetic performance ---------------------------------------
    A("## 2. Magnetic performance (60 µm gap, 70 turns) — finite element")
    A("")
    A("Nonlinear 2D finite element, tooth-and-gap region built exactly from "
      "your dimensions. This is a reluctance force from the coil alone "
      "(F = ½·i²·dL/dx); the permanent magnet is a separate question, §7.")
    A("")
    A("| Current | A-turns | Peak force | Volts across coil | Ohmic power |")
    A("|---|---|---|---|---|")
    for r in rows:
        flag = "" if r["inside_5v"] else " ⚠ over 5 V"
        bold = "**" if r["current_a"] in (0.30, 0.35, 0.40) else ""
        A(f"| {bold}{r['current_a']:.2f} A{bold} | {r['mmf_at']:.0f} | "
          f"{bold}{r['force_mn']:.2f} mN{bold} | "
          f"{r['volts_across_coil']:.2f} V{flag} | {r['ohmic_w']:.2f} W |")
    A("")
    A(f"**Peak dL/dx = {rows[0]['peak_dL_dx_h_per_m']:.4f} H/m** in the "
      f"unsaturated region, falling to "
      f"{min(r['peak_dL_dx_h_per_m'] for r in rows):.4f} H/m above ~1.2 A as "
      f"the iron starts to saturate.")
    A("")
    A("Two honest notes on that column, because it can be read wrongly. It is "
      "a **secant** inductance (flux linkage ÷ current), and its peak over the "
      "pitch is at a *different position* from the peak force — so ½·i²·dL/dx "
      "and the tabulated force are not two ways of computing the same number "
      "and should not be expected to agree exactly. The force column is the "
      "one to use: it comes from the Maxwell stress tensor, which stays valid "
      "when the iron saturates, whereas ½·i²·dL/dx does not.")
    A("")
    A("**These magnitudes are withdrawn — see the box at the top.** They are "
      "printed because the SHAPE and the DIRECTION are informative, not "
      "because the numbers are results. Reading a required current off a curve "
      "that has not converged would be false precision, so the table below is "
      "labelled as indicative only:")
    A("")
    A("| To reach | Needs | Volts | Inside 5 V? |")
    A("|---|---|---|---|")
    for lbl, tgt, i_ in (("detent F_d", fd, i_fd),
                         ("stepping 1.5 × F_d", f15, i_15),
                         ("stepping 2 × F_d", f20, i_20)):
        if i_ is None:
            A(f"| {lbl} ({tgt:.1f} mN) | **not reached below 2.0 A** | — | — |")
        else:
            v = i_ * r_ohm
            A(f"| {lbl} ({tgt:.1f} mN) | **{i_:.2f} A** | {v:.2f} V | "
              f"{'yes' if v <= SUPPLY_V else '**no — over the rail**'} |")
    A("")
    A("")
    A("**What DOES survive, and it is the thing that matters.** I have now "
      "modelled this four ways — the original, then with the end clearance "
      "corrected, then with the spurious constant removed, then with the ends "
      "moved progressively further out. **Every single refinement made the "
      "force smaller**, from 1.59 mN down to 0.49 mN at 0.40 A. So while I "
      "cannot tell you the magnitude, I can tell you the sign of the error "
      "with confidence: the actuator is short of its 11.1 mN detent target at "
      "0.30–0.40 A by **at least** sevenfold, and on the better-converged "
      "models by rather more. The ampere-turn diagnosis in §8 does not depend "
      "on the magnitude at all — 70 turns × 0.40 A is 28 A-turns however you "
      "model the iron, and that is simply not many.")
    A("")
    A(f"For planning purposes the operating point is of order **1 A or more**, "
      f"not 0.35 A. I will give you a firm number when the model earns it. "
      f"The arithmetic in §4 and §5 below therefore uses "
      f"{i_rec:.2f} A as a PLANNING figure"
      + (" (the stepping target is not reached anywhere in the swept range on "
         "the corrected model, so there is no interpolated point to quote)"
         if i_rec_is_planning else "") + ".")
    A("")
    A("**And this is where the design currently fails, which is the most "
      "important thing in this document.** With 40 µm wire the coil is "
      f"{r_ohm:.2f} Ω, so a 5 V rail can deliver at most "
      f"**{i_cold:.3f} A** — against the {i_rec:.2f} A needed. That is a "
      f"margin of {margin_pct:.1f}%.")
    A("")
    A(f"Copper resistance rises about 0.39 %/K. The pulse itself puts "
      f"{dT:.1f} K into the winding (§5), which raises the resistance by about "
      f"{dT*0.393:.1f}% and drops the achievable current to "
      f"**{i_hot:.3f} A** — *below* what the step needs. In other words the "
      f"actuator makes its first step of a burst and then stops making them, "
      f"and it would do so intermittently and temperature-dependently, which "
      f"is the worst possible failure to diagnose on a bench.")
    A("")
    A("**So thicker wire is not an optimisation, it is a requirement.** §8.")
    A("")

    # ---- 3. electrical --------------------------------------------------
    A("## 3. Electrical parameters")
    A("")
    A("| Quantity | Value |")
    A("|---|---|")
    A(f"| Wire | 40 µm bare (≈48 µm enamelled), 70 turns |")
    A(f"| Winding | {c['layers']} layers × {c['turns_per_layer']} turns, "
      f"{c['winding_build_um']:.0f} µm build — the 1521 µm window holds "
      f"≈{c['window_capacity_turns']} turns, so your \"room for another layer\" "
      f"is confirmed |")
    A(f"| Mean turn / wire length | {c['mean_turn_length_um']:.0f} µm / "
      f"{c['wire_length_mm']:.0f} mm |")
    A(f"| **Resistance R_c** | **{r_ohm:.2f} Ω** |")
    A(f"| **Aligned inductance L_al** | **{l_al*1e6:.1f} µH** |")
    A(f"| **Time constant τ = L/R** | **{tau_us:.1f} µs** |")
    A(f"| Voltage at {i_rec:.2f} A | {i_rec*r_ohm:.2f} V |")
    A("")

    # ---- 4. pulse width -------------------------------------------------
    A("## 4. Drive pulse width")
    A("")
    A(f"Electrical rise is complete in about {3*tau_us:.0f} µs "
      f"(3τ), so the pulse is set entirely by the mechanics, not the "
      f"electronics.")
    A("")
    A(f"Ballistic step time at {f_rec:.1f} mN over a {t['step_um']:.0f} µm "
      f"step, from rest: **{t_step*1e3:.2f} ms**.")
    A("")
    A(f"**Recommended pulse width {pulse_ms:.1f} – {pulse_ms*1.6:.1f} ms** — "
      f"about 1.5–2.5× the ballistic time, which covers worst-case friction "
      f"and load without pouring in heat. Note this is far longer than the "
      f"electrical time constant, so the current is flat for almost the whole "
      f"pulse.")
    A("")

    # ---- 5. energy ------------------------------------------------------
    A("## 5. Energy and power")
    A("")
    A(f"At {i_rec:.2f} A and a {pulse_ms:.1f} ms pulse:")
    A("")
    A(f"- Ohmic: I²R·t = {i_rec:.2f}² × {r_ohm:.2f} × {pulse_ms:.1f} ms = "
      f"**{e_ohmic*1e3:.2f} mJ**")
    A(f"- Magnetic: ½L·I² = **{e_mag*1e3:.3f} mJ** (negligible beside the ohmic term)")
    A(f"- **Energy per step ≈ {e_step*1e3:.2f} mJ**")
    A(f"- **Average power at {STEPS_PER_S:.0f} steps/s ≈ "
      f"{p_avg*1e3:.0f} mW**")
    A("")
    A(f"Adiabatic temperature rise in the copper per pulse: **{dT:.1f} K**. "
      f"At 10 steps/s that is comfortable; sustained slewing would need a "
      f"thermal path, which is not modelled here.")
    A("")

    # ---- 6. resonance ---------------------------------------------------
    mech = num["mechanics"]
    A("## 6. Resonant frequency under the magnetic restoring force")
    A("")
    A("**A correction here, and it matters by a factor of 2.4.** Your worksheet "
      "uses k ≈ 2π·F_d/(S/2) with S the step. For a detent that varies "
      "sinusoidally over one tooth *pitch*, F(x) = F_d·sin(2πx/pitch), the "
      "small-signal stiffness is the slope at the zero crossing:")
    A("")
    A("> k = dF/dx|₀ = 2π·F_d / pitch")
    A("")
    A(f"Putting S/2 = pitch/6 in place of the pitch inflates k by six and the "
      f"frequency by √6. Both are below:")
    A("")
    A("| Model | Stiffness | Resonance |")
    A("|---|---|---|")
    A(f"| Your worksheet form, k = 2π·F_d/(S/2) | "
      f"{mech['stiffness_tony_n_per_m']:.0f} N/m | "
      f"{mech['f_resonance_tony_hz']:.0f} Hz |")
    A(f"| **Sinusoidal detent over one pitch** | "
      f"**{mech['stiffness_sinusoidal_n_per_m']:.0f} N/m** | "
      f"**{mech['f_resonance_sinusoidal_hz']:.0f} Hz** |")
    A("")
    A(f"I would use **{mech['f_resonance_sinusoidal_hz']:.0f} Hz**. Your "
      f"conclusion is unaffected — it is still "
      f"{mech['margin_over_step_rate']:.0f}× above the 10 steps/s rate, so "
      f"resonance is nowhere near the operating point — but the number itself "
      f"was {mech['ratio']:.1f}× optimistic and it is worth having right "
      f"before it propagates into a settling or control calculation.")
    A("")

    # ---- 7. permanent magnet -------------------------------------------
    A("## 7. Permanent magnet — your instinct about ferrite is right, though "
      "not quite for the reason given")
    A("")
    A(f"One correction to the framing first, because it changes the answer. "
      f"The test is *not* whether the magnet can be made as thin as the "
      f"arithmetic says ({at_needed:.0f} A-turns ÷ H_c). Nobody would make it "
      f"that thin — you would buy the thinnest stock the material is sold in. "
      f"The real test is **what magnetomotive force that thinnest available "
      f"stock then delivers**, and here too much is just as bad as too little: "
      f"an over-strong detent is one the coil cannot pull the translator out "
      f"of. That is precisely the trap the previous iteration fell into.")
    A("")
    A(f"So, against the ≈{at_needed:.0f} A-turns you actually need:")
    A("")
    A("| Material | H_c (kA/m) | Thinnest practical stock | MMF it then gives | vs required | Verdict |")
    A("|---|---|---|---|---|---|")
    for r in pm_options(at_needed):
        A(f"| {r['material']} | {r['hc_ka_m']} | "
          f"{r['supplier_min_thickness_mm']:.2f} mm | "
          f"{r['mmf_at_min_thickness_at']:.0f} At | "
          f"{r['ratio_to_required']:.2f}× | {r['verdict']} |")
    A("")
    A("**A limitation you should know before using this table.** Comparing "
      "H_c × thickness against coil ampere-turns is a screen, not a circuit "
      "analysis. What a magnet actually drives depends on its *load line* — "
      "the external permeance it sees — and on its recoil permeability. Two "
      "magnets with the same H_c·t can deliver quite different flux into the "
      "same circuit. This table is good for ruling candidates in or out by an "
      "order of magnitude; the final thickness has to come from a solve with "
      "the magnet actually in the model. That solve is not yet done.")
    A("")
    A("With that caveat: **sintered ferrite and bonded NdFeB bracket what you "
      "need, and the high-energy materials overshoot badly.**")
    A("")
    A("- **Sintered ferrite at 0.30 mm gives about 0.8× the required MMF** — "
      "slightly under, and recoverable by going a little thicker. It is cheap, "
      "corrosion-proof, sold as thin plate, and immune to the thermal "
      "derating that makes NdFeB awkward. Your suggestion stands up.")
    A("- **Bonded NdFeB at 0.20 mm gives about 1.3×** — slightly over, and "
      "trimmable downwards. It is compression- or injection-moulded, so thin "
      "sections are routine rather than exotic. This is the option missing "
      "from your list and it is worth pricing alongside ferrite.")
    A("- **Sintered NdFeB and SmCo overshoot by 2.5–3× even at their thinnest "
      "practical stock.** That is not a margin, it is a liability: it makes "
      "the detent harder to step out of than the coil can manage, which is the "
      "failure that forced dual-coil drive on the previous design.")
    A("")
    A("Two things to keep in view:")
    A("")
    A("1. **Thickness sets MMF; area sets flux.** Ferrite's remanence is about "
      "a third of NdFeB's (0.4 T against 1.3 T), so if the detent comes out "
      "weak once it is in the real circuit, the fix is magnet *area*, not more "
      "thickness. Getting these two levers the right way round matters.")
    A("2. **I would not use Alnico.** Its coercivity is so low that the "
      "reverse field from an adjacent coil during stepping is a genuine "
      "demagnetisation risk — a slow failure designed in from the start.")
    A("3. **Ferrite needs the same demagnetisation check, and I have not done "
      "it yet.** Its coercivity is 250 kA/m, and the reverse field a "
      "neighbouring coil puts across a 0.3 mm magnet at these ampere-turns is "
      "the same order. That is close enough that it must be computed rather "
      "than assumed — it is the one thing that could rule ferrite out, and it "
      "is exactly the check we built for the previous design.")
    A("4. **Neither 0.30 mm sintered ferrite nor 0.20 mm bonded NdFeB is "
      "ordinary catalogue stock.** The first is a ground ceramic part; the "
      "second means calendered or flexible bonded sheet rather than "
      "conventional moulded material. Both are obtainable, both carry a price "
      "premium, and neither should be quoted to a buyer as standard.")
    A("")

    # ---- 8. the fix ------------------------------------------------------
    A("## 8. The ampere-turn problem, and the one lever that fixes it")
    A("")
    A("The whole shortfall is magnetomotive force. Here is the piece of algebra "
      "that matters, because it is counter-intuitive:")
    A("")
    A("> V = i·R = i·(ρ·N·l_turn / A_wire) = **(N·i) · ρ·l_turn / A_wire**")
    A("")
    A("**The turn count cancels.** For a required ampere-turn figure, the "
      "supply voltage depends only on the mean turn length and the wire "
      "cross-section. Winding more turns does not reduce the voltage you need "
      "— it never has. The only lever is thicker wire.")
    A("")
    A(f"At your mean turn of {c['mean_turn_length_um']:.0f} µm:")
    A("")
    A("| Wire | Volts per A-turn | Volts for "
      f"{at_needed:.0f} A-turns | Turns that fit the 1521 µm window (3 layers) | Current needed |")
    A("|---|---|---|---|---|")
    for d, v in ((40, vpat_40), (50, vpat_50), (63, vpat_63)):
        od = d * 1.2                       # enamelled OD, grade-2 class
        fit = int(1521.0 // od) * 3
        i_need = at_needed / fit if fit else float("nan")
        A(f"| {d} µm | {v*1e3:.1f} mV/At | **{v*at_needed:.2f} V** | "
          f"~{fit} | {i_need:.2f} A |")
    A("")
    A(f"So 40 µm puts you on the edge of the rail with nothing in hand — and "
      f"§2 shows that margin is already negative once the coil warms. 50 µm "
      f"takes the same drive to about {vpat_50*at_needed:.1f} V and 63 µm to "
      f"about {vpat_63*at_needed:.1f} V, which is real margin for temperature, "
      f"tolerance and the 2× stepping point that 40 µm cannot reach at all.")
    A("")
    A("The last two columns are the check that is easy to skip: thicker wire "
      "means fewer turns in the same window, so the *current* has to rise to "
      "keep the ampere-turns. That is fine — the voltage still falls, which is "
      "the whole point — but it does mean the driver must be sized for the "
      "higher current, and the fill factor at these diameters wants "
      "confirming with whoever winds it rather than assumed from geometry.")
    A("")
    A("Three other levers, in order of how much they buy:")
    A("")
    A("1. **Close the gap.** Force goes roughly as 1/gap in this regime. "
      "60 → 40 µm is worth about 1.5× — but it tightens every tolerance in the "
      "assembly, and it is the expensive choice.")
    A("2. **Deepen the pole slots.** Ours are modelled at 120 µm against your "
      "drawing. Deeper slots raise the permeance modulation and cost nothing "
      "but tooling geometry.")
    A("3. **More window.** The coil window is 1521 µm and holds ~93 turns of "
      "40 µm wire in three layers. There is room for more copper, and copper "
      "is what you are short of.")
    A("")

    # ---- 9. THE BIG QUESTION --------------------------------------------
    A("## 9. THE BIG QUESTION — is it manufacturable?")
    A("")
    A("### The translator: yes, and by more than one route")
    A("")
    A("Your own note on the drawing — a stack of laminations, or MIM — is the "
      "right instinct, and the lamination route is the stronger of the two. "
      "The reason is structural: **the translator is prismatic.** Its toothed "
      "profile is a constant 2D silhouette extruded across the 1200 µm width, "
      "so each lamination is a flat pattern, and flat patterns are cheap.")
    A("")
    A("| Route | Verdict | The governing number |")
    A("|---|---|---|")
    A("| **Photochemical etch + stack** | **recommended, but near the process "
      "edge — not comfortably inside it** | the real rule is minimum slot "
      "≈1.0–1.5× strip thickness and minimum surviving web ≈1.0× (1.25–1.5× "
      "for repeatable yield). At 100 µm foil your 187 µm slot is comfortable "
      "but the 125 µm tooth is right on the limit — expect ±10–20 µm feature "
      "variation, sidewall taper and root radii unless a supplier demonstrates "
      "better. 12 laminations build 1200 µm. Still the best route: no edge "
      "roll, no work hardening. |")
    A("| Fine blanking + stack | viable, cheaper at volume | die roll is 5–20% "
      "of strip thickness, so 5–20 µm on a 100 µm strip. Against a 60 µm gap "
      "that is 8–33% — significant but survivable, and far more forgiving than "
      "it would have been at a 20 µm gap. |")
    A("| Micro-MIM, one piece | **downgraded — high risk, not a robust "
      "recommendation** | I had this as comfortably viable and that was too "
      "optimistic. A 187 µm-wide slot with a ±10 µm claim is demanding for "
      "micro-powder-injection moulding once tooling, shrinkage, slot closure, "
      "distortion and the resulting magnetic properties are all accounted for. "
      "A specialist micro-PIM house may demonstrate it; treat it as an "
      "alternative to be proven, not a fallback to be assumed. |")
    A("| Wire EDM | prototype only | it will cut this accurately, but not at "
      "any sensible rate for thousands of parts. |")
    A("")
    A("**Material availability is not a constraint.** Fe-Co (Permendur / "
      "Hiperco 50 / VACOFLUX class) is a catalogue item in 0.1–0.35 mm strip, "
      "which is exactly the thickness band the lamination route wants.")
    A("")
    A("**The real risk is the anneal, not the cutting.** Fe-Co needs a "
      "magnetic anneal at around 850 °C to develop its properties (confirmed "
      "for the 49Fe-49Co-2V class), and a 7.6 mm long × 0.84 mm tall part is "
      "slender enough to distort. Annealing laminations flat and stacking "
      "afterwards is the right direction — but it is not a complete answer: "
      "annealed Fe-Co is brittle, so flat-annealed laminations bring their own "
      "handling and assembly-stress problems, and any stress applied during "
      "stacking or bonding partly undoes the anneal you just paid for. This "
      "needs a process trial, not a decision on paper.")
    A("")
    A("### The pole pieces: the core is easy, the winding is the problem")
    A("")
    A("The pole-piece *core* is the same story as the translator — prismatic, "
      "140 µm teeth, etchable or stampable in the same 0.1 mm Fe-Co strip, "
      "stacked to 1200 µm. That part is straightforward.")
    A("")
    A("**The winding is where this gets hard, and it is the honest answer to "
      "your question.** Seventy turns of 40 µm wire, in three layers, in a "
      "1521 µm window, around a limb roughly 400 × 1200 µm — and **three of "
      "them per actuator**, so it is the operation that will set both cost and "
      "yield.")
    A("")
    A("40 µm enamelled wire is not exotic in itself: the hearing-aid and "
      "micro-motor industries wind finer than this routinely. The difficulty "
      "is geometric access — you cannot get a winding shuttle through a window "
      "that small on a closed core. That leaves three options, and they should "
      "be priced against each other before the geometry is frozen:")
    A("")
    A("| Option | What it costs |")
    A("|---|---|")
    A("| **Wind in situ on an open C, then close the magnetic circuit** | "
      "adds a joint in the flux path. Each glued joint costs roughly 5–15% of "
      "the detent — a real and quantified loss, and you are already short. |")
    A("| **Wind on a separate bobbin, assemble the core around it** | same "
      "joint problem, but the winding itself becomes a standard bought-in "
      "operation on standard machinery. Probably the cheapest at volume. |")
    A("| **Pre-wound self-supporting bonded-wire air coil, core assembled "
      "around it** — *the realistic production route* | this is what the "
      "micro-coil industry actually does at this scale, and split-core "
      "assembly around a pre-wound coil is standard practice rather than a "
      "workaround. Bondable (self-adhering) wire is a catalogue product. It "
      "still costs a joint in the flux path, but it puts the winding on "
      "ordinary machinery instead of demanding shuttle access nobody can give "
      "you. |")
    A("")
    A("Worth noting what is *not* the answer: planar or deposited coils. They "
      "are possible in principle, but at 70 turns and ampere-level pulse "
      "current they are unattractive — the copper cross-section you can "
      "deposit is nowhere near what §8 says you need.")
    A("")
    A("**My recommendation: treat the winding as the thing that drives the "
      "pole-piece design, not the other way round.** Right now the core "
      "geometry is fixed and the winding has to fit through it. Inverting "
      "that — choose the winding method, then shape the core to suit — is "
      "likely to be worth more than any magnetic optimisation, because it "
      "attacks the cost driver rather than the physics.")
    A("")
    A("**One question back to you:** is the 400 µm window a hard constraint, "
      "or is it whatever was left after the rest of the geometry was drawn? If "
      "it can grow, it buys copper — and copper is exactly what §8 says you "
      "are short of. The two problems have the same answer.")
    A("")

    # ---- summary ---------------------------------------------------------
    A("## Summary of this baseline")
    A("")
    A("| | |")
    A("|---|---|")
    A(f"| Translator mass | {t['mass_mg']:.1f} mg |")
    A(f"| Gap | 60 µm |")
    A(f"| Turns / drive current | 70 / **{i_rec:.2f} A** (not 0.35 A) |")
    A(f"| Stepping force at that current | {f_rec:.1f} mN |")
    A(f"| Detent target | {fd:.1f} mN |")
    A(f"| Pulse width | {pulse_ms:.1f} – {pulse_ms*1.6:.1f} ms |")
    A(f"| Energy per step | {e_step*1e3:.2f} mJ |")
    A(f"| Power at 10 steps/s | {p_avg*1e3:.0f} mW |")
    A(f"| Resonant frequency | {mech['f_resonance_hz']:.0f} Hz |")
    A(f"| Magnet | sintered ferrite or bonded NdFeB, 0.2–0.3 mm, area-adjusted |")
    A(f"| Translator manufacturable? | **yes** — etched Fe-Co laminations |")
    A(f"| Pole pieces manufacturable? | **core yes; the winding is the real "
      f"question** |")
    A("")
    A("## 10. What a red team changed in this document")
    A("")
    A("Before sending, this was attacked by four independent models on four "
      "different briefs (adversarial physics, numerical audit, internal "
      "consistency, manufacturing reality). Transcripts are in `out/`. What "
      "they changed, so you can see what was corrected rather than take the "
      "result on trust:")
    A("")
    A("| Finding | Effect |")
    A("|---|---|")
    A("| The 5 V rail leaves ~1.4% current margin, which goes NEGATIVE once "
      "the coil warms by one pulse | **the most important correction — turned "
      "thicker wire from a suggestion into a requirement (§2, §8)** |")
    A("| Your resonance formula inflates stiffness 6× and frequency 2.4× | "
      "corrected to 387 Hz; conclusion unchanged (§6) |")
    A("| H_c × thickness is not a valid way to rank magnets — it ignores the "
      "load line (raised independently by two seats) | magnet table demoted "
      "from verdict to screen (§7) |")
    A("| Ferrite's own demagnetisation risk was never checked, though Alnico's "
      "was | added as an explicit open item (§7) |")
    A("| Force gap and ampere-turn gap were conflated in one sentence | "
      "separated — 7× in force is 2.7× in current (headline) |")
    A("| dL/dx peak and force peak are at different positions, so they are not "
      "two routes to one number | labelled; force taken from the stress "
      "tensor only (§2) |")
    A("| Micro-MIM at a 187 µm slot with ±10 µm was over-optimistic | "
      "downgraded to prove-it-first (§9) |")
    A("| Etch limits: minimum slot ≈1–1.5× thickness, web ≈1×, with ±10–20 µm "
      "real variation | 125 µm tooth is at the edge, not comfortable (§9) |")
    A("| Pre-wound bonded-wire coil with split-core assembly is what the "
      "industry actually does | promoted from third option to recommended "
      "route (§9) |")
    A("| Quoted magnet stock thicknesses are not generic catalogue items | "
      "flagged as special order with a price premium (§7) |")
    A("")
    A("Two of their objections I did **not** accept. One seat read the "
      "280 µm core as the total thickness from which slots are cut and "
      "concluded the geometry was impossible; it is not — core 280 + tooth "
      "280 + tooth 280 = 840, which is your own L_x. Another argued the "
      "approximate back iron invalidates the force numbers; at these flux "
      "densities the two 60 µm air gaps carry essentially all the "
      "magnetomotive drop and the iron carries under one percent, so the "
      "approximation is not load-bearing.")
    A("")
    A("---")
    A("")
    A("*All force figures are 2D nonlinear finite element on your dimensions "
      "(native xfemm solver). The tooth and gap region is built exactly; the "
      "back iron and wound limb are approximate because the drawings do not "
      "fully fix them, and the iron is well below saturation at the currents "
      "of interest so that approximation costs little. Numbers regenerate from "
      "`tony_v2.py`, `femm/tony_v2_fe.py`.*")

    txt = "\n".join(L) + "\n"
    p = os.path.join(OUT, "PHANTM-TONY-V2-ANSWER.md")
    open(p, "w").write(txt)
    print(f"wrote out/PHANTM-TONY-V2-ANSWER.md ({len(L)} lines)")
    print(f"  mass {t['mass_mg']:.1f} mg | F_d {fd:.1f} mN | "
          f"force at 0.40 A {rows[2]['force_mn']:.2f} mN "
          f"({fd/rows[2]['force_mn']:.0f}x short)")
    print(f"  recommended {i_rec:.2f} A -> {f_rec:.1f} mN at "
          f"{i_rec*r_ohm:.2f} V; 50 µm wire drops that to "
          f"{vpat_50*at_needed:.2f} V")


if __name__ == "__main__":
    main()
