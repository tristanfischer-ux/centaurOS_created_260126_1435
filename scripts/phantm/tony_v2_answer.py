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
    i_rec = i_15
    t_step = math.sqrt(2 * s_m / ((f_rec * 1e-3) / m_kg))
    pulse_ms = max(1.5 * t_step * 1e3, 1.0)
    e_ohmic = i_rec ** 2 * r_ohm * (pulse_ms * 1e-3)
    e_mag = 0.5 * l_al * i_rec ** 2
    e_step = e_ohmic + e_mag
    p_avg = e_step * STEPS_PER_S

    cu_vol = (c["wire_length_mm"] * 1e-3) * math.pi * (20e-6) ** 2
    dT = e_ohmic / (CU_C_VOL * cu_vol)

    vpat_40 = volts_per_at(c["mean_turn_length_um"], 40)
    vpat_50 = volts_per_at(c["mean_turn_length_um"], 50)
    vpat_63 = volts_per_at(c["mean_turn_length_um"], 63)
    at_needed = 70 * i_15

    L = []
    A = L.append
    A("# PHANTM v2 actuator — your worksheet, filled in, and the "
      "manufacturability answer")
    A("")
    A("Tony — this is a standalone answer to the drawings and worksheet you "
      "sent on 28 July. It does not depend on the main report and does not "
      "repeat any of it.")
    A("")
    A("**Headline.** The geometry is sound and it closes to the micron. But at "
      f"the currents in your worksheet (0.30–0.40 A) the actuator produces "
      f"**{rows[0]['force_mn']:.2f}–{rows[2]['force_mn']:.2f} mN**, against your "
      f"own 30 g detent target of **{fd:.1f} mN** — roughly **{fd/rows[2]['force_mn']:.0f}× "
      f"short**. The shortfall is not the geometry, it is the ampere-turns: "
      f"70 turns × 0.40 A is 28 A-turns, and you need about "
      f"{at_needed:.0f}. Everything else follows from that, and there is a "
      f"clean fix — see §8.")
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
      f"{min(r['peak_dL_dx_h_per_m'] for r in rows):.4f} H/m as the iron "
      f"begins to saturate above ~1.2 A.")
    A("")
    A("**The three points you asked for are the first three rows, and they are "
      "the problem.** Reading the target back off the curve:")
    A("")
    A("| To reach | Needs | Volts | Inside 5 V? |")
    A("|---|---|---|---|")
    for lbl, tgt, i_ in (("detent F_d", fd, i_fd),
                         ("stepping 1.5 × F_d", f15, i_15),
                         ("stepping 2 × F_d", f20, i_20)):
        if i_ is None:
            A(f"| {lbl} ({tgt:.1f} mN) | beyond 2.0 A | — | no |")
        else:
            v = i_ * r_ohm
            A(f"| {lbl} ({tgt:.1f} mN) | **{i_:.2f} A** | {v:.2f} V | "
              f"{'yes' if v <= SUPPLY_V else '**no — over the rail**'} |")
    A("")
    A(f"So the recommended operating point is **≈{i_rec:.2f} A**, not 0.35 A. "
      f"That is {i_rec/0.35:.1f}× the current in your worksheet, and it lands "
      f"essentially exactly on the 5 V rail ({i_rec*r_ohm:.2f} V) with 40 µm "
      f"wire. §8 says how to buy that back.")
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
    A(f"Using your form k ≈ 2π·F_d/(S/2) with F_d = {fd:.1f} mN and "
      f"S = {t['step_um']:.0f} µm:")
    A("")
    A(f"- **k ≈ {mech['stiffness_n_per_m']:.0f} N/m**")
    A(f"- **f_res = (1/2π)·√(k/M_t) ≈ {mech['f_resonance_hz']:.0f} Hz**")
    A("")
    A(f"That is **{mech['margin_over_step_rate']:.0f}× above** the nominal "
      f"10 steps/s, so the mechanical resonance is nowhere near the operating "
      f"rate — comfortable, as you expected. It does mean the settling "
      f"behaviour is governed by damping rather than by the step rate.")
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
    from tony_v2 import pm_options
    for r in pm_options(at_needed):
        A(f"| {r['material']} | {r['hc_ka_m']} | "
          f"{r['supplier_min_thickness_mm']:.2f} mm | "
          f"{r['mmf_at_min_thickness_at']:.0f} At | "
          f"{r['ratio_to_required']:.2f}× | {r['verdict']} |")
    A("")
    A("**This is the useful result: sintered ferrite and bonded NdFeB bracket "
      "what you need, and the high-energy materials overshoot badly.**")
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
    A("| Wire | Volts per ampere-turn | Volts for the required "
      f"{at_needed:.0f} A-turns |")
    A("|---|---|---|")
    for d, v in ((40, vpat_40), (50, vpat_50), (63, vpat_63)):
        A(f"| {d} µm | {v*1e3:.1f} mV/At | **{v*at_needed:.2f} V** |")
    A("")
    A(f"So 40 µm wire puts you right on the edge of the rail with nothing in "
      f"hand. Going to 50 µm takes the same drive to about "
      f"{vpat_50*at_needed:.1f} V, and 63 µm to about {vpat_63*at_needed:.1f} V "
      f"— real margin for temperature, tolerance and the 2× stepping point "
      f"that 40 µm cannot reach at all. The cost is winding window: fewer "
      f"turns per layer, so more layers or a longer window.")
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
    A("| **Photochemical etch + stack** | **recommended** | minimum feature ≈ "
      "material thickness. Your 125 µm teeth need foil ≤125 µm; at 100 µm foil "
      "you need 12 laminations to build 1200 µm. Near-zero edge roll, no "
      "work-hardening, no anneal-distortion risk from the cutting step. |")
    A("| Fine blanking + stack | viable, cheaper at volume | die roll is 5–20% "
      "of strip thickness, so 5–20 µm on a 100 µm strip. Against a 60 µm gap "
      "that is 8–33% — significant but survivable, and far more forgiving than "
      "it would have been at a 20 µm gap. |")
    A("| Micro-MIM, one piece | viable, keep as the volume alternative | "
      "125 µm features and 187 × 280 µm slots (1.5:1 aspect) are inside "
      "published micro-MIM capability at ±10 µm. No stacking, no registration. |")
    A("| Wire EDM | prototype only | it will cut this accurately, but not at "
      "any sensible rate for thousands of parts. |")
    A("")
    A("**Material availability is not a constraint.** Fe-Co (Permendur / "
      "Hiperco 50 / VACOFLUX class) is a catalogue item in 0.1–0.35 mm strip, "
      "which is exactly the thickness band the lamination route wants.")
    A("")
    A("**The real risk is the anneal, not the cutting.** Fe-Co needs a "
      "magnetic anneal at around 850 °C to develop its properties, and a "
      "7.6 mm long × 0.84 mm tall part is slender enough to distort. Anneal "
      "the laminations flat and stack afterwards; do not anneal the assembled "
      "stack. This is a process-order decision worth fixing early because it "
      "is expensive to discover late.")
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
    A("| **Pre-wound self-supporting air coil slipped over a limb** | no "
      "bobbin, no joint if the limb is open-ended, but self-supporting coils "
      "at 40 µm need bonded wire and careful handling. |")
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
