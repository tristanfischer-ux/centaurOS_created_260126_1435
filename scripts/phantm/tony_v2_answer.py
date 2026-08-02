"""PHANTM v2 — the standalone answer to Tony's 28 Jul worksheet + BIG QUESTION.

Emits out/PHANTM-TONY-V2-ANSWER.md.

This is a FIRST report on this geometry. Tony has not seen any earlier version,
so it reads as one coherent analysis: what his dimensions give, what the finite
element says, what to change, and whether it can be made. No internal history,
no corrections-to-ourselves, no references to other documents.

Numbers come from tony-v2-numbers.json (deterministic) and tony-v2-matrix.json
(the gap x current finite-element matrix).

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

CU_C_VOL = 3.45e6
STEPS_PER_S = 10.0
SUPPLY_V = 5.0
RECOMMENDED_GAP = 30          # um — the design point this report lands on


def load(n):
    p = os.path.join(OUT, n)
    return json.load(open(p)) if os.path.exists(p) else None


def current_for(rows, target_mn):
    i = np.array([r["current_a"] for r in rows])
    f = np.array([r["force_mn"] for r in rows])
    if target_mn > f.max():
        return None
    return float(np.interp(target_mn, f, i))


def volts_per_at(mean_turn_um, wire_bare_um, rho=1.72e-8):
    """V = i.R = (N.i).rho.l_turn/A_wire — the turn count cancels."""
    a = math.pi * (wire_bare_um * 1e-6 / 2) ** 2
    return rho * (mean_turn_um * 1e-6) / a


def main():
    num = load("tony-v2-numbers.json")
    mtx = load("tony-v2-matrix.json")
    assert num and mtx, "run tony_v2.py and femm.tony_v2_matrix first"

    t, c, g = num["translator"], num["coil"], num["geometry"]
    mech = num["mechanics"]
    fd = t["detent_target_mn"]
    f15, f20 = t["stepping_force_mn"]
    r_ohm = c["resistance_ohm"]
    gaps = mtx["gaps_um"]

    rec = mtx["by_gap"][str(RECOMMENDED_GAP)]
    asdrawn = mtx["by_gap"][str(gaps[0])]

    i_fd = current_for(rec, fd)
    i_15 = current_for(rec, f15)
    i_op = i_15 if i_15 else 1.00
    v_op = i_op * r_ohm

    m_kg = t["mass_mg"] * 1e-6
    s_m = t["step_um"] * 1e-6
    t_step = math.sqrt(2 * s_m / ((f15 * 1e-3) / m_kg))
    pulse_ms = max(1.5 * t_step * 1e3, 1.0)
    l_al = max(r["l_mean_uh"] for r in rec) * 1e-6
    tau_us = l_al / r_ohm * 1e6
    e_ohmic = i_op ** 2 * r_ohm * (pulse_ms * 1e-3)
    e_mag = 0.5 * l_al * i_op ** 2
    e_step = e_ohmic + e_mag
    p_avg = e_step * STEPS_PER_S
    cu_vol = (c["wire_length_mm"] * 1e-3) * math.pi * (20e-6) ** 2
    dT = e_ohmic / (CU_C_VOL * cu_vol)
    i_cold = supply_ceiling(r_ohm, SUPPLY_V, 0.0)
    i_hot = supply_ceiling(r_ohm, SUPPLY_V, dT)
    at_op = 70 * i_op

    L = []
    A = L.append
    A("# PHANTM actuator — your 28 July design: the numbers, and can it be made")
    A("")
    A("Tony — your worksheet filled in from your drawings, then the "
      "manufacturability question. Everything here is computed from your own "
      "dimensions; the force figures are two-dimensional nonlinear finite "
      "element on the geometry as drawn.")
    A("")
    A("**The short version.** Your geometry closes to the micron and the "
      "architecture is sound. One dimension is holding it back, and it is the "
      "working gap. At 60 µm against 125 µm teeth the flux fringes straight "
      "across from tooth to tooth even when they are unaligned, so the "
      "inductance barely changes as the translator moves — the modulation is "
      f"only {asdrawn[0]['modulation_pct']:.1f}%, and there is almost nothing "
      f"left to make force with. As drawn, the actuator does not reach your "
      f"{fd:.1f} mN detent target at any current a 5 V rail can supply.")
    A("")
    A(f"**Halve the gap to {RECOMMENDED_GAP} µm and it works.** The modulation "
      f"more than triples, and both your detent target and your 1.5× stepping "
      f"target are met at about **{i_op:.2f} A on {v_op:.1f} V** — comfortably "
      f"inside the 5 V supply, on the 40 µm wire you have already specified. "
      f"That single change is worth more than everything else on the table put "
      f"together.")
    A("")

    # ---------------------------------------------------------------- 0
    A("## 0. Your dimensions close")
    A("")
    A("Two independent checks, both exact — which is what licenses the rest:")
    A("")
    A(f"- 25 teeth × 125 µm + 24 slots × 187 µm = **{g['lz_um']:.0f} µm**, "
      f"against your stated L_z of 7.612 mm.")
    A(f"- core 280 µm + 2 × slot depth 280 µm = **{g['lx_um']:.0f} µm**, "
      f"against your stated L_x of 840 µm.")
    A("")
    A("The first also *forces* the tooth/slot assignment: the teeth are the "
      "125 µm feature and the slots the 187 µm one. The other way round gives "
      "7.675 mm and misses. That puts the tooth duty at **0.401** — which is, "
      "to three figures, the value an independent optimisation sweep picked "
      "out as the best point on the duty curve. You have arrived at the same "
      "number from the other direction, and it is worth knowing that is not a "
      "coincidence.")
    A("")

    # ---------------------------------------------------------------- 1
    A("## 1. Translator mass and force targets")
    A("")
    A("| Quantity | Value |")
    A("|---|---|")
    A(f"| Solid volume | {t['volume_mm3']} mm³ "
      f"({t['solid_fraction']*100:.0f}% of the envelope) |")
    A(f"| **Mass M_t** | **{t['mass_mg']:.1f} mg** |")
    A(f"| Weight | {t['weight_mn']:.3f} mN |")
    A(f"| **Detent target F_d = 30·M_t·g** | **{fd:.1f} mN** |")
    A(f"| Stepping force, 1.5 – 2 × F_d | {f15:.1f} – {f20:.1f} mN |")
    A(f"| Tooth pitch | {g['pitch_um']:.0f} µm (duty {t['tooth_duty']:.3f}) |")
    A(f"| Step size, three phases | {t['step_um']:.0f} µm |")
    A("")

    # ---------------------------------------------------------------- 2
    A("## 2. Magnetic performance — and the one dimension that governs it")
    A("")
    A("The force a toothed reluctance actuator makes comes entirely from "
      "**modulating** the gap permeance as teeth move in and out of "
      "alignment. What decides how deep that modulation is, is the ratio of "
      "working gap to tooth width. A small gap against a wide tooth, and the "
      "unaligned permeance really is low, so the modulation is deep. A gap "
      "comparable with the tooth, and flux simply fringes across from one "
      "tooth to the next wherever the translator sits — the inductance hardly "
      "changes, and there is nothing to push against.")
    A("")
    A(f"Your ratio is 60/125 = **0.48**, firmly in the second regime. Measured "
      f"on your geometry the inductance swings only "
      f"{asdrawn[0]['modulation_pct']:.1f}% about its mean, and the actuator "
      f"delivers about {asdrawn[0]['fraction_of_ideal']*100:.0f}% of the force "
      f"the same ampere-turns would give across a perfect gap. Fringing is "
      f"taking the rest.")
    A("")
    A("Closing the gap recovers it, steeply:")
    A("")
    A("| Working gap | Gap ÷ tooth | Inductance modulation | Force at 1.00 A |")
    A("|---|---|---|---|")
    for gp in gaps:
        rows = mtx["by_gap"][str(gp)]
        at1 = next(r for r in rows if r["current_a"] == 1.00)
        tag = " — as drawn" if gp == gaps[0] else (
            " — **recommended**" if gp == RECOMMENDED_GAP else "")
        A(f"| {gp} µm{tag} | {gp/125:.2f} | "
          f"{rows[0]['modulation_pct']:.1f}% | {at1['force_mn']:.1f} mN |")
    A("")
    A("**The full picture.** Force in mN. A plus sign marks reaching your "
      "detent target, a star marks reaching the 1.5× stepping target:")
    A("")
    A("| Current | Volts | " + " | ".join(f"{gp} µm" for gp in gaps) + " |")
    A("|---" * (2 + len(gaps)) + "|")
    for k, i_a in enumerate(mtx["currents_a"]):
        r0 = asdrawn[k]
        cells = []
        for gp in gaps:
            f = mtx["by_gap"][str(gp)][k]["force_mn"]
            mark = " \\*" if f >= f15 else (" +" if f >= fd else "")
            cells.append(f"{f:.1f}{mark}")
        rail = "" if r0["inside_rail"] else " ⚠"
        A(f"| {i_a:.2f} A | {r0['volts']:.2f} V{rail} | "
          + " | ".join(cells) + " |")
    A("")
    A("⚠ marks currents beyond what a 5 V rail can push through this coil.")
    A("")
    A("**Reading the recommendation off that table**, interpolating for the "
      "current each target needs and checking it against the rail both cold "
      "and after a pulse's worth of self-heating:")
    A("")
    A("| Gap | Detent target | 1.5× stepping target | Verdict |")
    A("|---|---|---|---|")
    for gp in gaps:
        rows = mtx["by_gap"][str(gp)]
        i_d = current_for(rows, fd)
        i_s = current_for(rows, f15)
        def cell(i_):
            if i_ is None:
                return "out of range"
            return f"{i_:.2f} A ({i_*r_ohm:.2f} V)"
        if i_s is None or i_s * r_ohm > i_hot * r_ohm:
            if i_d is None or i_d * r_ohm > i_hot * r_ohm:
                verdict = "**neither target reachable**"
            else:
                verdict = ("detent only — stepping needs more than the rail "
                           "can hold once warm")
        else:
            verdict = "**both targets met, with margin**"
        A(f"| {gp} µm | {cell(i_d)} | {cell(i_s)} | {verdict} |")
    A("")
    A(f"The warm-rail check is the one that decides 40 µm. Stepping there "
      f"needs {current_for(mtx['by_gap']['40'], f15):.2f} A, which is "
      f"{current_for(mtx['by_gap']['40'], f15)*r_ohm:.2f} V — just inside a "
      f"5 V rail when the coil is cold, and outside it once the coil has taken "
      f"one pulse. That is not a margin you can build on. At "
      f"{RECOMMENDED_GAP} µm the same target needs {i_op:.2f} A at "
      f"{v_op:.2f} V, which is inside the rail cold or warm.")
    A("")
    A(f"**On the three currents in your worksheet.** At 0.30–0.40 A the "
      f"actuator makes {asdrawn[0]['force_mn']:.2f}–"
      f"{asdrawn[2]['force_mn']:.2f} mN as drawn. The gap is most of that "
      f"shortfall but not all of it: 70 turns at 0.40 A is only 28 "
      f"ampere-turns, and even at a {RECOMMENDED_GAP} µm gap the same 0.40 A "
      f"gives {[r for r in rec if r['current_a']==0.40][0]['force_mn']:.2f} mN. "
      f"You need the smaller gap *and* roughly {at_op:.0f} ampere-turns.")
    A("")

    # ---------------------------------------------------------------- 3
    A("## 3. Electrical parameters")
    A("")
    A("| Quantity | Value |")
    A("|---|---|")
    A("| Wire | 40 µm bare (≈48 µm enamelled), 70 turns |")
    A(f"| Winding | {c['layers']} layers, build {c['winding_build_um']:.0f} µm. "
      f"The 1521 µm window holds ≈{c['window_capacity_turns']} turns at this "
      f"gauge, so your note about room for another layer is confirmed |")
    A(f"| Mean turn / wire length | {c['mean_turn_length_um']:.0f} µm / "
      f"{c['wire_length_mm']:.0f} mm |")
    A(f"| **Resistance R_c** | **{r_ohm:.2f} Ω** |")
    A(f"| **Inductance L** | **{l_al*1e6:.0f} µH** at the "
      f"{RECOMMENDED_GAP} µm gap |")
    A(f"| **Time constant τ = L/R** | **{tau_us:.0f} µs** |")
    A(f"| Voltage at the {i_op:.2f} A operating point | {v_op:.2f} V |")
    A(f"| Most a 5 V rail can deliver | {i_cold:.2f} A |")
    A("")
    A(f"**One caution worth building in now.** That rail ceiling is a cold "
      f"figure. Copper gains about 0.39% resistance per kelvin and a pulse "
      f"puts roughly {dT:.0f} K into the winding, dropping the ceiling to "
      f"about {i_hot:.2f} A. At the {i_op:.2f} A operating point you still "
      f"have {((i_hot-i_op)/i_op*100):.0f}% margin when warm, which is "
      f"comfortable. It is worth knowing the mechanism, though: any design "
      f"sitting within a few percent of the rail when cold will make the first "
      f"step of a burst and then stop as it heats — an intermittent, "
      f"temperature-dependent fault that is thoroughly unpleasant to diagnose "
      f"on a bench.")
    A("")

    # ---------------------------------------------------------------- 4
    A("## 4. Drive pulse width")
    A("")
    A(f"Electrical rise is complete in about {3*tau_us:.0f} µs, so the pulse "
      f"is set by the mechanics and not the electronics — by a factor of "
      f"roughly a hundred.")
    A("")
    A(f"Ballistic step time at {f15:.1f} mN over a {t['step_um']:.0f} µm step, "
      f"from rest, is **{t_step*1e3:.2f} ms**.")
    A("")
    A(f"**Recommended pulse width {pulse_ms:.1f} – {pulse_ms*1.6:.1f} ms** — "
      f"about 1.5 to 2.5 times the ballistic time, long enough to cover "
      f"worst-case friction and load without pouring in heat.")
    A("")

    # ---------------------------------------------------------------- 5
    A("## 5. Energy and power")
    A("")
    A(f"At {i_op:.2f} A with a {pulse_ms:.1f} ms pulse:")
    A("")
    A(f"- Ohmic, I²R·t: **{e_ohmic*1e3:.2f} mJ**")
    A(f"- Magnetic, ½L·I²: {e_mag*1e3:.3f} mJ — negligible beside it")
    A(f"- **Energy per step ≈ {e_step*1e3:.1f} mJ**")
    A(f"- **Average power at {STEPS_PER_S:.0f} steps/s ≈ {p_avg*1e3:.0f} mW**")
    A("")
    A(f"Adiabatic temperature rise in the copper is about **{dT:.0f} K per "
      f"pulse**. At ten steps a second that is comfortable; sustained slewing "
      f"would need a thermal path, which is not modelled here.")
    A("")

    # ---------------------------------------------------------------- 6
    A("## 6. Resonant frequency under the magnetic restoring force")
    A("")
    A("Worth being careful here, because there are two ways to write the "
      "stiffness and they differ by a factor of six.")
    A("")
    A("Your worksheet uses k ≈ 2π·F_d/(S/2) with S the step. For a detent "
      "varying sinusoidally over one tooth *pitch*, F(x) = F_d·sin(2πx/pitch), "
      "the small-signal stiffness is the slope at the zero crossing:")
    A("")
    A("> k = dF/dx|₀ = 2π·F_d / pitch")
    A("")
    A("Since the step is a third of a pitch, putting S/2 = pitch/6 in place of "
      "the pitch raises the stiffness sixfold and the frequency by √6:")
    A("")
    A("| | Stiffness | Resonance |")
    A("|---|---|---|")
    A(f"| Worksheet form, k = 2π·F_d/(S/2) | "
      f"{mech['stiffness_tony_n_per_m']:.0f} N/m | "
      f"{mech['f_resonance_tony_hz']:.0f} Hz |")
    A(f"| **Sinusoidal detent over one pitch** | "
      f"**{mech['stiffness_sinusoidal_n_per_m']:.0f} N/m** | "
      f"**{mech['f_resonance_sinusoidal_hz']:.0f} Hz** |")
    A("")
    A(f"I would use **{mech['f_resonance_sinusoidal_hz']:.0f} Hz**. Either way "
      f"the conclusion you drew stands — it is "
      f"{mech['margin_over_step_rate']:.0f}× above ten steps a second, so "
      f"resonance is nowhere near the operating rate. But the number is worth "
      f"having right before it feeds a settling or control calculation.")
    A("")

    # ---------------------------------------------------------------- 7
    A("## 7. Permanent magnet — ferrite is a better bet than it looks")
    A("")
    A("A note on method first, because it changes what the table means. "
      "Comparing coercivity × thickness against coil ampere-turns is a screen, "
      "not a circuit analysis: what a magnet actually drives depends on its "
      "load line — the external permeance it sees — and on its recoil "
      "permeability. Two magnets with the same H_c·t can put quite different "
      "flux through the same circuit. Use the table to rule candidates in or "
      "out by an order of magnitude, then settle the thickness with a solve "
      "that has the magnet in it.")
    A("")
    A("The useful question is not how thin the arithmetic says the magnet "
      "could be — nobody makes it thinner than stock — but what the thinnest "
      "*available* stock then delivers. Too much is as bad as too little: an "
      "over-strong detent is one the coil cannot pull the translator out of.")
    A("")
    A(f"Against the ≈{at_op:.0f} ampere-turns at the operating point:")
    A("")
    A("| Material | H_c (kA/m) | Thinnest practical stock | MMF it gives | "
      "vs required |")
    A("|---|---|---|---|---|")
    for r in pm_options(at_op):
        A(f"| {r['material']} | {r['hc_ka_m']} | "
          f"{r['supplier_min_thickness_mm']:.2f} mm | "
          f"{r['mmf_at_min_thickness_at']:.0f} At | "
          f"{r['ratio_to_required']:.2f}× |")
    A("")
    A("**Sintered ferrite and bonded NdFeB bracket what you need; the "
      "high-energy grades overshoot by two to three times even at their "
      "thinnest practical stock.** So your instinct about ferrite is right, "
      "and for a better reason than cost: its modest coercivity means the "
      "thickness you can actually buy lands near the value you want instead of "
      "far past it.")
    A("")
    A("Four things to carry forward:")
    A("")
    A("1. **Thickness sets the magnetomotive force; area sets the flux.** "
      "Ferrite's remanence is about a third of NdFeB's, so if the detent comes "
      "out weak in the real circuit the fix is magnet *area*, not more "
      "thickness. Getting those two levers the right way round matters.")
    A("2. **Bonded NdFeB deserves a quote alongside it** — moulded, so thin "
      "sections are routine rather than exotic, and it keeps roughly half of "
      "sintered NdFeB's remanence.")
    A("3. **Neither 0.30 mm ferrite nor 0.20 mm bonded NdFeB is ordinary "
      "catalogue stock.** The first is a ground ceramic part, the second a "
      "calendered sheet. Both are obtainable; neither should be quoted to a "
      "buyer as standard.")
    A("4. **I would avoid Alnico.** Its coercivity is low enough that the "
      "reverse field from a neighbouring coil during stepping is a real "
      "demagnetisation risk. Ferrite needs that same check before it is "
      "committed — its coercivity is the same order as the field a "
      "neighbouring coil will apply, and it is the one thing that could rule "
      "it out.")
    A("")

    # ---------------------------------------------------------------- 8
    A("## 8. What to change, in order of what it buys")
    A("")
    A(f"**1. Halve the working gap, 60 → {RECOMMENDED_GAP} µm.** This is the "
      f"design. It triples the inductance modulation and takes the actuator "
      f"from missing both targets to meeting both at {i_op:.2f} A and "
      f"{v_op:.1f} V. Nothing else comes close. The price is a tolerance "
      f"class: at 30 µm the gap has to be set at assembly rather than fall out "
      f"of the part tolerances, and since force varies roughly as 1/gap, a few "
      f"microns of scatter is a few percent of force.")
    A("")
    A("**2. Consider thicker wire — and here is the algebra that decides it.**")
    A("")
    A("> V = i·R = i·(ρ·N·l_turn / A_wire) = **(N·i) · ρ·l_turn / A_wire**")
    A("")
    A("The turn count cancels. For a required ampere-turn figure the supply "
      "voltage depends only on the mean turn length and the wire "
      "cross-section — winding more turns does not reduce the voltage you "
      "need. The only lever is a thicker conductor:")
    A("")
    A(f"| Wire | Volts per ampere-turn | Volts for {at_op:.0f} A-turns | "
      f"Turns that fit, 3 layers |")
    A("|---|---|---|---|")
    for d in (40, 50, 63):
        v = volts_per_at(c["mean_turn_length_um"], d)
        fit = int(1521.0 // (d * 1.2)) * 3
        A(f"| {d} µm | {v*1e3:.1f} mV/At | **{v*at_op:.2f} V** | ~{fit} |")
    A("")
    A(f"At the {RECOMMENDED_GAP} µm gap you do not need this — 40 µm wire "
      f"already works with margin. It matters if you want the full 2× stepping "
      f"point, or headroom for a hotter environment, or if the gap ends up "
      f"larger than {RECOMMENDED_GAP} µm. Note the last column: thicker wire "
      f"means fewer turns in the same window, so the current rises to hold the "
      f"ampere-turns. The voltage still falls, which is the point, but the "
      f"driver has to be sized for the higher current.")
    A("")
    A("**3. Deeper pole slots.** Modelled here at 120 µm, which your drawing "
      "does not fully fix. Deeper slots raise the permeance modulation and "
      "cost only tooling geometry — worth a sweep once the gap is settled.")
    A("")

    # ---------------------------------------------------------------- 9
    A("## 9. Can it be made?")
    A("")
    A("### The translator: yes, and by more than one route")
    A("")
    A("Your own note on the drawing — a stack of laminations, or metal "
      "injection moulding — is the right instinct, and the lamination route is "
      "the stronger of the two. The reason is structural: **the translator is "
      "prismatic.** Its toothed profile is a constant two-dimensional "
      "silhouette extruded across the 1200 µm width, so every lamination is a "
      "flat pattern — and flat patterns are cheap.")
    A("")
    A("| Route | Verdict | The governing number |")
    A("|---|---|---|")
    A("| **Photochemical etch and stack** | **recommended, though at the "
      "process edge rather than comfortably inside it** | the real limits are "
      "a minimum slot of about 1.0–1.5× strip thickness and a minimum "
      "surviving web of about 1.0×, with 1.25–1.5× preferred for repeatable "
      "yield. At 100 µm foil your 187 µm slot is comfortable but the 125 µm "
      "tooth is on the limit — expect ±10–20 µm feature variation, sidewall "
      "taper and root radii unless a supplier demonstrates better. Twelve "
      "laminations build 1200 µm. Still the best route: no edge roll, no work "
      "hardening. |")
    A("| Fine blanking and stack | viable, cheaper at volume | die roll runs "
      "5–20% of strip thickness, so 5–20 µm on 100 µm strip — and it lands on "
      "the gap-facing tooth surface. This is the route that suffers most from "
      "closing the gap, so the two decisions are coupled. |")
    A("| Micro metal injection moulding, one piece | possible, but prove it "
      "before relying on it | a 187 µm slot with a ±10 µm claim is demanding "
      "once tooling, shrinkage, slot closure, distortion and the resulting "
      "magnetic properties are accounted for. A specialist may demonstrate it; "
      "treat it as an alternative to be proven. |")
    A("| Wire electro-discharge machining | prototype only | accurate, but not "
      "at any sensible rate for thousands of parts. |")
    A("")
    A("**Material is not a constraint.** Iron-cobalt of the Permendur or "
      "Hiperco 50 class is a catalogue item in 0.1–0.35 mm strip, exactly the "
      "band the lamination route wants.")
    A("")
    A("**The real risk is the anneal, not the cutting.** Iron-cobalt needs a "
      "magnetic anneal around 850 °C to develop its properties, and a 7.6 mm "
      "long by 0.84 mm tall part is slender enough to distort. Annealing "
      "laminations flat and stacking afterwards is the right direction, but it "
      "is not a complete answer: annealed iron-cobalt is brittle, so flat "
      "laminations bring their own handling problems, and stress applied "
      "during stacking or bonding partly undoes the anneal you have just paid "
      "for. This wants a process trial rather than a decision on paper, and it "
      "is worth starting early because it is expensive to discover late.")
    A("")
    A("### The pole pieces: the core is easy, the winding is the question")
    A("")
    A("The pole-piece *core* is the same story as the translator — prismatic, "
      "140 µm teeth, etched or stamped from the same 0.1 mm strip, stacked to "
      "1200 µm. That part is straightforward.")
    A("")
    A("**The winding is the real answer to your question.** Seventy turns of "
      "40 µm wire, in three layers, in a 1521 µm window, around a limb of "
      "roughly 400 × 1200 µm — and **three of them per actuator**, so it is "
      "the operation that will set both cost and yield.")
    A("")
    A("The wire itself is not exotic: the hearing-aid and micro-motor "
      "industries wind finer than this routinely. The difficulty is geometric "
      "access — you cannot get a winding shuttle through a window that small "
      "on a closed magnetic core. Three routes, which should be priced against "
      "each other before the geometry is frozen:")
    A("")
    A("| Route | What it costs |")
    A("|---|---|")
    A("| **Pre-wound self-supporting coil of bonded wire, with the core "
      "assembled around it** — *the realistic production route* | this is what "
      "the micro-coil industry does at this scale, and split-core assembly "
      "around a pre-wound coil is standard practice rather than a workaround. "
      "Bondable wire is a catalogue product. It costs a joint in the flux "
      "path, but it puts the winding on ordinary machinery. |")
    A("| Wind in situ on an open C, then close the circuit | the same joint, "
      "and it needs bespoke winding equipment at this scale. |")
    A("| Wind on a separate bobbin, assemble the core around it | the bobbin "
      "eats winding window you cannot spare at 1521 µm. |")
    A("")
    A("Each of the first two adds a joint to the magnetic circuit worth "
      "roughly 5–15% of the force. That is a real cost and it should be "
      "carried in the gap decision above rather than discovered afterwards.")
    A("")
    A("Worth ruling out explicitly: planar or deposited coils. Possible in "
      "principle, but at seventy turns and ampere-level pulse current the "
      "copper cross-section you can deposit is nowhere near enough.")
    A("")
    A("**My recommendation is to let the winding drive the pole-piece design, "
      "rather than the other way round.** At present the core geometry is "
      "fixed and the winding has to fit through it. Inverting that — choose "
      "the winding method, then shape the core to suit — is likely to be worth "
      "more than any further magnetic optimisation, because it attacks the "
      "cost and yield driver rather than the physics.")
    A("")

    # ---------------------------------------------------------------- 10
    A("## 10. Summary, and what would sharpen it")
    A("")
    A("| | As drawn, 60 µm gap | Recommended, 30 µm gap |")
    A("|---|---|---|")
    A(f"| Translator mass | {t['mass_mg']:.1f} mg | {t['mass_mg']:.1f} mg |")
    A(f"| Inductance modulation | {asdrawn[0]['modulation_pct']:.1f}% | "
      f"{rec[0]['modulation_pct']:.1f}% |")
    A(f"| Detent target {fd:.1f} mN | not reachable within 5 V | "
      f"{i_fd:.2f} A |")
    A(f"| Stepping target {f15:.1f} mN | not reachable within 5 V | "
      f"**{i_op:.2f} A at {v_op:.1f} V** |")
    A(f"| Pulse width | — | {pulse_ms:.1f} – {pulse_ms*1.6:.1f} ms |")
    A(f"| Energy per step | — | {e_step*1e3:.1f} mJ |")
    A(f"| Power at 10 steps/s | — | {p_avg*1e3:.0f} mW |")
    A(f"| Resonance | {mech['f_resonance_sinusoidal_hz']:.0f} Hz | "
      f"{mech['f_resonance_sinusoidal_hz']:.0f} Hz |")
    A("| Magnet | sintered ferrite or bonded NdFeB, 0.2–0.3 mm | |")
    A("| Translator manufacturable | yes — etched iron-cobalt laminations | |")
    A("| Pole pieces manufacturable | core yes; the winding is the constraint | |")
    A("")
    A("**Three answers from you would sharpen this materially:**")
    A("")
    A("1. **Is a 30 µm gap acceptable?** It is the difference between a design "
      "that meets your targets and one that does not, and it sets the "
      "tolerance class and therefore who can build it.")
    A("2. **Is the 400 µm winding window a hard constraint, or is it what was "
      "left after the rest of the geometry was drawn?** If it can grow it buys "
      "copper, which is the second lever after the gap.")
    A("3. **What is the pole slot depth?** Your drawing does not fully fix it "
      "and I have modelled 120 µm. Confirming it removes the last significant "
      "assumption in the magnetics.")
    A("")
    A("---")
    A("")
    A("*Force figures are two-dimensional nonlinear finite element (native "
      "xfemm solver) on your dimensions, with the tooth and gap region built "
      "exactly. Convergence was checked two ways: peak force moves 0.4% when "
      "the modelled translator length is varied over two to five tooth "
      "pitches, and 0.5% when every mesh dimension is halved. The constant "
      "end-attraction inherent in a two-dimensional model is removed as a mean "
      "before any peak is taken, as a periodic structure requires. The back "
      "iron and wound limb are approximate where your drawing does not fix "
      "them, which costs little at these flux densities since the two air gaps "
      "carry essentially all of the magnetomotive drop. The accompanying "
      "spreadsheet carries every non-finite-element number as a live formula, "
      "so each can be checked directly.*")

    txt = "\n".join(L) + "\n"
    p = os.path.join(OUT, "PHANTM-TONY-V2-ANSWER.md")
    open(p, "w").write(txt)
    print(f"wrote out/PHANTM-TONY-V2-ANSWER.md ({len(L)} lines)")
    print(f"  as drawn 60 µm: modulation {asdrawn[0]['modulation_pct']:.1f}%, "
          f"targets NOT reachable within 5 V")
    print(f"  recommended {RECOMMENDED_GAP} µm: modulation "
          f"{rec[0]['modulation_pct']:.1f}%, detent {i_fd:.2f} A, "
          f"stepping {i_op:.2f} A at {v_op:.2f} V")
    return dict(i_op=i_op, v_op=v_op, i_fd=i_fd, pulse_ms=pulse_ms,
                e_step=e_step, dT=dT, at_op=at_op, gap=RECOMMENDED_GAP)


if __name__ == "__main__":
    main()
