"""PHANTM — council round on Tony's 3 Aug coarse-pitch proposal.

Five seats, five different briefs. Reuses council_v2's transport and seat
definitions; only the facts change.

Run: ~/.venvs/phantm/bin/python council_coarse.py [seat ...]
"""

from __future__ import annotations

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from council_v2 import SEATS, call

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

FACTS = """
CONTEXT. A three-phase linear variable-reluctance stepper, ~1 cm scale, for a
mechanically-steered phased array. Translator is a toothed Fe-Co bar running
between three toothed pole pieces across an air gap. Baseline as drawn by the
client: tooth pitch 312 um, tooth 125 um (duty 0.401), slots 187 um wide x
280 um deep on both faces, across-gap dimension L_x 840 um (so central core =
840 - 2x280 = 280), transverse 1200 um, axial length 7613 um, Fe-Co 8.12 g/cc.
Coil 70 turns of 40 um wire, R = 3.618 ohm, 5 V rail (so 1.382 A cold ceiling,
~1.365 A after one pulse of self-heating). Pole foot 960 um carrying 3 teeth.
Force targets: detent F_d = 30.M_t.g, stepping 1.5x that.

ESTABLISHED PREVIOUSLY (not under review here): at the drawn 60 um gap the
gap/tooth ratio is 0.48, flux fringes tooth-to-tooth even when unaligned, the
inductance modulation is only ~3%, and neither force target is reachable within
the 5 V rail. Closing the gap to 30 um triples the modulation and meets both
targets at 0.98 A / 3.55 V.

THE CLIENT'S NEW PROPOSAL (3 Aug), which is what is under review. He does not
want a 20-30 um assembled gap on manufacturing grounds. He suggests: "if the
gap is short compared to the SLOT depth then that's OK. If we then just remove
every other tooth along the translator and the polepiece, the tooth-tooth
fringing will become small. Can we try this with a 60um gap (or even bigger)?"
He then raised his own objection: "this doesn't work as envisioned unless we
ensure there are 3 of these more widely spaced teeth on the polepieces.
However, after the first 3 steps there are teeth facing gaps."

MY ANALYSIS, WHICH IS WHAT I WANT ATTACKED.

1. His objection is correct, and for a precise reason. A three-phase machine
   offsets its poles by pitch/3. A phase can only make force at its offset
   position if its tooth still PARTIALLY OVERLAPS a translator tooth, which
   requires tooth width > pitch/3, i.e. duty > 1/3. Removing every other tooth
   doubles the pitch (312 -> 624) while leaving the tooth at 125 um, so duty
   falls to 0.20 and the offset (208 um) exceeds the tooth (125 um): the
   energised phase sits entirely over a slot with nothing to pull on.

2. Therefore the correct form of his idea is NOT to delete teeth but to SCALE
   the whole pattern — tooth and slot together — holding duty at 0.401. Then
   gap/tooth falls (governing fringing) while the duty condition is preserved.

3. FINITE ELEMENT (2D nonlinear, tooth/gap region exact, DC end-attraction
   artefact removed as a mean, mesh- and boundary-converged to <1%), at 60 um
   gap, 1.00 A, 3 pole teeth (pole foot grown to suit), slot depth held at the
   drawn 280 um:
     pitch 312 (tooth 125, slot 187): modulation 2.76%, force 6.37 mN
     pitch 468 (tooth 188, slot 280): modulation 3.28%, force 7.43 mN
     pitch 624 (tooth 250, slot 374): modulation 2.04%, force 5.94 mN
     pitch 780 (tooth 313, slot 467): modulation 1.33%, force 4.34 mN
   NON-MONOTONIC — it peaks at pitch 468 and then falls.

4. MY EXPLANATION for the turnover: with slot DEPTH fixed at 280 um while the
   pitch grows, the slot becomes wider and relatively shallower, and a wide
   shallow slot stops suppressing the unaligned permeance (flux dips in and
   back out). Slot depth/width runs 1.50, 1.00, 0.75, 0.60 across those four
   rows and the peak sits where depth ~= width. So the client named the right
   variable when he said slot depth matters — but depth must SCALE WITH the
   pattern, not stay put.

5. Deepening the slots with the pitch (translator slots 280 -> 350 um, pole
   slots 120 -> 240 um) at pitch 468 and 60 um gap gives modulation 4.18% and
   force 9.27 mN at 1.00 A. Translator core thins to 840 - 2x350 = 140 um and
   the peak flux density there is 0.86 T, so it is not saturating.

6. A SECOND-ORDER EFFECT I claim matters: the coarser, deeper pattern removes
   more metal, so the translator gets LIGHTER (37.84 -> 31.72 mg) and since
   F_d = 30.M_t.g the force TARGET falls with it (11.13 -> 9.33 mN).

7. RESULTING CLAIM: at a 60 um gap, pitch 468 / duty 0.401 / translator slots
   350 deep / pole slots 240 deep, the detent target (9.33 mN) is met at
   1.00 A / 3.63 V and the 1.5x stepping target at 1.23 A / 4.45 V — both
   inside the 5 V rail cold and after self-heating. The client can therefore
   keep his 60 um gap.
   COSTS I identify: step becomes pitch/3 = 156 um instead of 104 um, i.e. 50%
   coarser positioning (this actuator sets an RF phase by axial displacement,
   so step size is a resolution budget); pole foot grows 960 -> 1404 um, so the
   actuator gets longer; translator core thins to 140 um.
"""

ASKS = {
    "grok": """Attack this. Hardest on:
(a) Is the duty > 1/3 condition right? Is that really what kills the
    every-other-tooth version, or have I got the three-phase geometry wrong?
(b) Is my explanation of the non-monotonic turnover (slot depth/width) correct,
    or is something else causing it that I have mis-attributed?
(c) Claim 6 — does lightening the translator really lower the requirement, or
    am I double-counting a benefit? Is there a reason the target should NOT
    move with mass?
(d) The 140 um core at 0.86 T — is that safe, or am I missing a saturation or
    mechanical stiffness problem?
(e) What have I not considered at all about coarsening the pitch?""",
    "kimi": """Recompute and check:
- the duty/offset arithmetic and the overlap condition;
- the mass recomputation: envelope 840x1200x7613 um minus 2 x n_slots x
  slot_width x slot_depth x 1200, with n_slots = floor(7613/pitch); does
  31.72 mg and F_d 9.33 mN follow for pitch 468 / duty 0.401 / depth 350?
- the current scaling: force goes as i^2, so from 9.27 mN at 1.00 A, do 9.33
  and 14.0 mN really need 1.00 A and 1.23 A?
- slot depth/width ratios in claim 4;
- is the peak in the force-vs-pitch table statistically real given the values,
  or within plausible model noise?""",
    "glm": """Find what is missing or inconsistent. In particular: does the
recommendation actually hold together across all the coupled changes (pitch,
slot depth, core thickness, mass, target, pole length, step size), or does one
of them quietly undermine another? What would a sharp client ask that this
does not answer? Is the comparison against the 30 um option being made fairly?""",
    "sol": """Manufacturing reality check. The proposal trades a 30 um assembled
gap for a 60 um gap with a coarser, deeper tooth pattern:
- translator slots 280 um wide x 350 um deep (aspect 1.25) instead of 187 x 280;
- pole slots 240 um deep;
- translator core thinned to 140 um;
- pole foot lengthened 960 -> 1404 um.
Parts are Fe-Co, made as stacked photochemically-etched or fine-blanked
laminations ~100 um thick, or micro metal injection moulding. Is this trade
actually easier to manufacture than holding a 30 um gap? Does the deeper slot
or the 140 um core create a new problem (etch aspect ratio, handling, anneal
distortion, stack registration)? Which of the two designs would you rather
quote?""",
    "deepseek": """Independently confirm or refute each numbered claim,
recomputing where you can. Be explicit about which claims you can check and
which you can only accept as given. Finish with SOUND / SOUND WITH CORRECTIONS
/ NOT SOUND.""",
}

SEATS = dict(SEATS)
SEATS["deepseek"] = dict(
    model="deepseek/deepseek-v4-flash",
    system=("You are an independent checker. Recompute what you can from the "
            "stated inputs and confirm or refute it. Do not be agreeable — a "
            "confirmation is only worth something if you would have said so "
            "had it been wrong."),
    ask="")


def main():
    want = sys.argv[1:] or list(SEATS)
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    specs = {s: {**SEATS[s], "ask": ASKS[s]} for s in want}
    # council_v2.call builds its prompt from its own FACTS; rebuild here
    import council_v2
    council_v2.FACTS = FACTS
    with ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(lambda s: call(s, specs[s]), want))
    for seat, txt in results:
        open(os.path.join(OUT, f"council-coarse-{seat}.txt"), "w").write(txt)
        status = "FAILED" if "[FAILED" in txt else f"{len(txt.split())} words"
        print(f"  {seat:9s} {specs[seat]['model']:26s} {status}")
    print(f"\nwrote out/council-coarse-*.txt ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
