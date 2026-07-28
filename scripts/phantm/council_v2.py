"""PHANTM — cross-lineage red team on the Tony v2 answer (28 Jul).

Four seats, four DIFFERENT lenses rather than four copies of the same question:
a single prompt asked four times mostly returns the same findings four times,
which reads like corroboration and is not. Perspective diversity is what makes
a panel worth more than one seat.

  grok-4.5     adversarial physics — try to refute the finite-element reasoning
  kimi-k3      numerical audit — recompute every figure independently
  glm-5.2      internal consistency and what is MISSING
  gpt-5.6-sol  manufacturing and materials reality check

Transcripts land in out/council-v2-<seat>.txt with the model id stamped in,
matching the convention of the earlier rounds.

Run: ~/.venvs/phantm/bin/python council_v2.py [seat ...]
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
URL = "https://openrouter.ai/api/v1/chat/completions"

FACTS = """
GEOMETRY (from the client's 28 Jul drawings; all microns unless stated).
Translator: 25 teeth 125 wide, 24 slots 187 wide -> pitch 312, tooth duty 0.401.
Central core 280 thick, slots 280 deep on BOTH faces, so the across-gap
dimension L_x = 280 + 2*280 = 840. Transverse L_y = 1200. Axial
L_z = 25*125 + 24*187 = 7613 um. Material Fe-Co, density 8.12 g/cc.
Stator: 3 pole pieces per actuator, each a horseshoe whose toothed feet face the
translator across a 60 um gap. Pole teeth 140 wide (140 + 172 = 312, the same
pitch). Pole slot depth assumed 120 (the drawing does not fully dimension it).
Coil: 70 turns of 40 um bare copper (48 um enamelled) around a limb roughly
400 x 1200, winding window 1521 long. Supply 5 V. Nominal rate 10 steps/s.

COMPUTED RESULTS.
1. Translator solid volume = (840*1200*7613) - (2*24*187*280*1200) = 4.658 mm^3,
   60.7% of the envelope. MASS 37.82 mg. Weight 0.371 mN. The client's own
   detent target is F_d = 30*M_t*g = 11.13 mN; his stepping target is 1.5-2x
   that, i.e. 16.69-22.25 mN. Three-phase step = pitch/3 = 104 um.
2. FINITE ELEMENT: 2D planar nonlinear magnetostatic (xfemm / FEMM solver core),
   out-of-plane depth 1200 um. The tooth-and-gap region is built exactly from
   the client's dimensions; the back iron and wound limb are approximate because
   the drawing does not fix them. The MAGNET IS REMOVED (Br = 0), so this is
   pure reluctance force from the coil alone. Peak force over one pitch:
     0.30 A -> 0.889 mN    0.35 -> 1.214    0.40 -> 1.589
     0.70 A -> 4.878 mN    1.00 -> 9.809    1.20 -> 13.683
     1.40 A -> 17.375 mN   1.60 -> 20.353   2.00 -> 25.410
   Peak dL/dx = 0.0167 H/m unsaturated, falling to 0.0084 H/m by 1.6 A.
   Inductance 29-31 uH. Bridge flux density 0.22 T at 0.3 A -> 1.16 T at 2.0 A.
   Cross-check at 0.30 A: 1/2 i^2 dL/dx = 0.75 mN against weighted-stress-tensor
   0.889 mN, i.e. 19% apart.
3. CONCLUSION DRAWN: at the client's proposed 0.30-0.40 A the actuator makes
   0.89-1.59 mN against his 11.13 mN detent target -- about 7x short. Attributed
   entirely to ampere-turns: 70 x 0.40 = 28 At against ~95 At needed. Reading
   the FE curve back: 1.07 A reaches the detent (3.86 V), 1.36 A reaches 1.5x
   stepping (4.93 V, just inside the 5 V rail), 1.75 A would be needed for 2x
   (6.33 V, over the rail).
4. COIL: mean turn 3776 um (limb 400x1200 plus 144 um winding build), 3 layers
   of 24 turns, window capacity ~93 turns, wire length 264.3 mm, R = 3.618 ohm,
   L/R = 8.5 us.
5. ALGEBRA CLAIM made prominently: V = iR = i(rho*N*l_turn/A_wire)
   = (N*i)*rho*l_turn/A_wire, so for a REQUIRED ampere-turn figure the turn
   count CANCELS; supply voltage depends only on mean turn length and wire
   cross-section. Therefore more turns never helps and thicker wire is the only
   lever. 40 -> 50 um wire takes the same 95 At from 4.93 V to 3.16 V; 63 um
   gives 1.99 V.
6. RESONANCE: using the client's own form k = 2*pi*F_d/(S/2) with S = 104 um,
   k = 1344.5 N/m and f_res = (1/2pi)*sqrt(k/M_t) = 949 Hz, i.e. 95x above the
   10 steps/s rate.
7. STEP/ENERGY: ballistic step time sqrt(2s/(F/m)) = 0.687 ms at 16.69 mN;
   recommended pulse 1.0-1.6 ms. At 1.36 A and 1.0 ms: ohmic 6.69 mJ, magnetic
   0.028 mJ, ~6.7 mJ per step, ~67 mW average at 10 steps/s, adiabatic copper
   rise ~5.8 K per pulse.
8. MAGNET. The client asked what magnet thickness is required. The answer given
   REFRAMES his question: the test is not whether the magnet can be made as thin
   as MMF/H_c suggests (nobody makes it thinner than stock), but what MMF the
   THINNEST AVAILABLE stock delivers -- because too much is as bad as too
   little, an over-strong detent being one the coil cannot step out of. Using
   MMF = H_c * thickness against the ~95 At required:
     sintered NdFeB  H_c 900 kA/m, 0.30 mm min -> 270 At (2.83x) "too strong"
     SmCo            800 kA/m, 0.30 mm         -> 240 At (2.52x) "too strong"
     Alnico 5         50 kA/m, 0.50 mm         ->  25 At (0.26x) "too weak"
     sintered ferrite 250 kA/m, 0.30 mm        ->  75 At (0.79x) "matches"
     bonded NdFeB    600 kA/m, 0.20 mm         -> 120 At (1.26x) "matches"
   Conclusion: ferrite and bonded NdFeB bracket the requirement; the
   high-energy grades overshoot. Alnico additionally rejected for
   demagnetisation risk from an adjacent coil's reverse field.
9. MANUFACTURABILITY (the client's BIG QUESTION: is the translator
   manufacturable, and the pole pieces, 3 per actuator?).
   TRANSLATOR -- answered YES. It is PRISMATIC (constant 2D silhouette extruded
   across 1200 um), so each lamination is a flat pattern. Recommended:
   photochemical etch of 0.1 mm Fe-Co, 12 laminations to build 1200 um, on the
   rule of thumb that minimum etchable feature is approximately equal to
   material thickness (so 125 um teeth need <=125 um foil); etching gives
   near-zero edge roll, which matters against a 60 um gap. Fine blanking viable
   (die roll 5-20% of strip thickness = 5-20 um on 100 um strip, i.e. 8-33% of
   the gap). Micro-MIM in one piece viable (125 um features, 187 x 280 um slots
   = 1.5:1 aspect, +/-10 um). Fe-Co claimed to be a catalogue item in
   0.1-0.35 mm strip. Dominant risk claimed to be the ~850 C magnetic anneal
   distorting a slender 7.6 x 0.84 mm part; mitigation claimed to be annealing
   laminations flat and stacking afterwards.
   POLE PIECES -- core easy by the same routes, but the WINDING is named as the
   real constraint: 70 turns of 40 um wire, 3 layers, 1521 um window, around a
   400 x 1200 um limb, three per actuator, with no winding-shuttle access
   through a closed magnetic core. Three routes offered: (i) wind in situ on an
   open C then close the circuit; (ii) wind on a separate bobbin and assemble
   the core around it; (iii) a pre-wound self-supporting bonded-wire air coil
   slipped over a limb. Routes (i) and (ii) are each said to add a flux joint
   costing roughly 5-15% of the detent. Recommendation: let the winding method
   drive the pole-piece geometry rather than the reverse.
"""

SEATS = {
    "grok": dict(
        model="x-ai/grok-4.5",
        system=("You are an adversarial chartered engineer hired to REJECT this "
                "analysis. Find every reason a competent engineer would refuse "
                "to rely on it. Do not be balanced or encouraging. Label each "
                "objection DECISIVE (the number is wrong), MATERIAL (defensible "
                "number, misleading framing) or MINOR. If a claim survives your "
                "attack, say so in one line and move on."),
        ask="""Attack the PHYSICS and the FINITE-ELEMENT reasoning. Hardest on:
(a) the mass, and the volume subtraction behind it;
(b) whether a 2D planar model at 1200 um depth is legitimate when the real
    device wraps flux transversely, and what the 19% co-energy vs stress-tensor
    disagreement is telling us;
(c) whether "the turn count cancels" is true AND correctly applied, and where
    it breaks down;
(d) whether removing the magnet for the force-vs-current table is legitimate --
    does superposition hold well enough for the client to add the detent back
    separately?
(e) dL/dx FALLS from 0.0167 to 0.0084 as current rises while force keeps
    rising. Is that self-consistent? Should force be taken from 1/2 i^2 dL/dx
    at all once saturating?
(f) anything about the three-phase arrangement, the 104 um step, or the
    resonance formula that is simply wrong.
(g) the single biggest thing this analysis has NOT considered."""),
    "kimi": dict(
        model="moonshotai/kimi-k3",
        system=("You are auditing numerical correctness. Recompute everything "
                "independently from the stated inputs. Report any figure that "
                "does not reproduce, any misapplied formula, any wrong unit, "
                "and any interpolation or derivative done in a way that biases "
                "the result. Be terse and quantitative. Show arithmetic."),
        ask="""Recompute every numbered figure above and flag whatever does not
reproduce. In particular:
- the volume subtraction and mass;
- R from wire length and area, and the volts-per-ampere-turn figures for 40,
  50 and 63 um wire;
- the resonance, the ballistic step time, the energy per step and the adiabatic
  temperature rise;
- the magnet MMF table;
- does the FE force table scale as i^2 where it should, and where does it
  depart? Is LINEAR interpolation of that table a legitimate way to extract the
  required current, or does it bias the answer -- and in which direction?"""),
    "glm": dict(
        model="z-ai/glm-5.2",
        system=("You are checking a technical document for internal "
                "consistency and for what is MISSING. You are not checking "
                "arithmetic. Look for claims that contradict each other, "
                "conclusions that do not follow from their evidence, "
                "assumptions presented as findings, hedges that hide a real "
                "problem, and above all questions a sharp client will ask that "
                "the document does not answer."),
        ask="""Find contradictions, unsupported conclusions, and gaps. Pay
particular attention to interactions BETWEEN the sections -- a claim in one
section that quietly undermines another. State plainly the questions this
document invites but does not answer."""),
    "sol": dict(
        model="openai/gpt-5.6-sol",
        system=("You are a manufacturing and materials engineer with "
                "production experience in precision metal forming, soft "
                "magnetic alloys and micro-coil winding. Fact-check the "
                "manufacturing claims against real industrial capability. "
                "Correct anything wrong or over-optimistic. Name real "
                "processes, material forms and realistic tolerances. Confirm "
                "briefly where a claim is right."),
        ask="""Fact-check section 9 (manufacturability) and the magnet stock
assumptions in section 8. Specifically:
- is the etch rule of thumb (minimum feature ~ material thickness) stated
  correctly, and what is the real limit?
- is micro-MIM realistic for a 280 um deep, 187 um wide slot?
- is ~850 C right for a Fe-Co magnetic anneal, and is "anneal flat, stack
  after" the right mitigation?
- at this window size, what does the micro-coil industry ACTUALLY do? Is there
  a route missed entirely (planar/deposited coils, bonded self-supporting
  coils, something else)?
- are the quoted minimum stock thicknesses for sintered ferrite (0.30 mm) and
  bonded NdFeB (0.20 mm) realistic?
- what is wrong or missing on cost and yield at millions per year?"""),
}


def call(seat: str, spec: dict, retries: int = 2) -> tuple[str, str]:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("OPENROUTER_API_KEY not set")
    body = json.dumps({
        "model": spec["model"],
        "max_tokens": 16000,
        "messages": [
            {"role": "system", "content": spec["system"]},
            {"role": "user", "content": FACTS + "\n\n---\n\n" + spec["ask"]},
        ],
    }).encode()
    req = urllib.request.Request(
        URL, data=body,
        headers={"Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"})
    last = ""
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                d = json.load(r)
            msg = d["choices"][0].get("message", {})
            txt = msg.get("content")
            # Reasoning models can return content=None when the token budget is
            # consumed by reasoning; fall back to the reasoning trace rather
            # than silently writing "None" into a review file.
            if not txt:
                txt = msg.get("reasoning") or ""
            if not txt:
                raise RuntimeError(
                    f"empty content, finish_reason="
                    f"{d['choices'][0].get('finish_reason')}")
            usage = d.get("usage", {})
            return seat, (f"[model: {spec['model']}]\n"
                          f"[tokens: {usage.get('prompt_tokens')} in / "
                          f"{usage.get('completion_tokens')} out]\n\n{txt}")
        except Exception as e:                                   # noqa: BLE001
            last = f"{type(e).__name__}: {e}"
            if attempt < retries:
                time.sleep(5 * (attempt + 1))
    return seat, f"[model: {spec['model']}]\n[FAILED after retries] {last}"


def main():
    want = sys.argv[1:] or list(SEATS)
    os.makedirs(OUT, exist_ok=True)
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(lambda s: call(s, SEATS[s]), want))
    for seat, txt in results:
        p = os.path.join(OUT, f"council-v2-{seat}.txt")
        open(p, "w").write(txt)
        head = txt.split("\n\n", 1)[-1][:160].replace("\n", " ")
        status = "FAILED" if "[FAILED" in txt else f"{len(txt.split())} words"
        print(f"  {seat:5s} {SEATS[seat]['model']:24s} {status}")
        if "[FAILED" not in txt:
            print(f"        {head}...")
    print(f"\nwrote out/council-v2-*.txt ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
