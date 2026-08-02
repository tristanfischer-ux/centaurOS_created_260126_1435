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
translator across a 60 um gap (as drawn). Pole teeth 140 wide (140 + 172 = 312).
Pole slot depth assumed 120 (drawing does not fully dimension it).
Coil: 70 turns of 40 um bare copper (48 um enamelled) around a limb roughly
400 x 1200, winding window 1521 long. Supply 5 V. Nominal rate 10 steps/s.

COMPUTED RESULTS (re-audited 28 Jul evening; these SUPERSEDE any earlier draft).
1. MASS. Solid volume = (840*1200*7613) - (2*24*187*280*1200) = 4.658 mm^3.
   MASS 37.82 mg. Weight 0.371 mN. F_d = 30*M_t*g = 11.13 mN; stepping
   1.5-2x = 16.69-22.25 mN. Step = pitch/3 = 104 um. Arithmetic reproduces.
2. FINITE ELEMENT (60 um gap): 2D planar nonlinear magnetostatic (xfemm),
   depth 1200 um. Tooth/gap exact; back iron and wound limb approximate.
   Magnet REMOVED (Br=0) — coil reluctance force only. Constant end-attraction
   of the unrolled model (~25% of peak) is subtracted before peaking.
   Peak force (Maxwell stress):
     0.30 A -> 0.598 mN   0.35 -> 0.817   0.40 -> 1.070
     0.70 A -> 3.262 mN   1.00 -> 6.345   1.20 -> 8.274
     1.40 A -> 9.540 mN   1.60 -> 10.272  2.00 -> 11.092
   Peak dL/dx (secant) 0.0152 H/m unsaturated, falling above ~1.2 A.
   L_aligned ~33.6 uH. Bridge B 0.24 T at 0.3 A -> 1.18 T at 2.0 A.
   MST vs 1/2 i^2 dL/dx median disagreement ~28% even at 0.40 A (worst >100%).
   Force is taken from the stress tensor, not the inductance slope.
   Current density: 318 A/mm^2 at 0.40 A; ~800 A/mm^2 at 1.0 A.
3. CONVERGENCE. An earlier draft withdrew the force magnitudes after a test
   that moved the bridge WITH the translator ends looked non-convergent.
   That test was broken (two variables at once). With the magnetic circuit
   held fixed, peak force at 0.40 A settles 1.071/1.070/1.067 mN across
   2/3/5 pitch overhang (0.4%). Magnitudes are REINSTATED with the
   disclosures above.
4. GAP x CURRENT MATRIX (same solver; circuit fixed; only gap changed):
     gap 60 um: F@0.40A=1.07 mN, F@1.20A=8.27 mN, mod=3.2%, ~7% of ideal;
                F_d=11.13 mN UNREACHABLE inside 5 V rail (max ~8.3 mN at 1.2 A)
     gap 40 um: F@0.40A=2.15, F@1.20A=15.17, mod=7.1%; I(F_d)=0.95 A,
                I(1.5 Fd)=1.37 A (over 5 V with 40 um wire)
     gap 30 um: F@0.40A=3.12, F@1.20A=20.90, mod=10.5%; I(F_d)=0.77 A,
                I(1.5 Fd)=0.98 A (both inside 5 V)
     gap 20 um: F@0.40A=4.94, F@1.20A=30.57, mod=16.1%; I(F_d)=0.59 A,
                I(1.5 Fd)=0.75 A
   Ideal no-fringing bound at 0.40 A / 60 um ~14.8 mN; FE/ideal ~0.07.
5. CONCLUSION DRAWN NOW: shortfall at worksheet currents is ~10x in force.
   Two co-equal causes: (a) 28 A-turns is not many; (b) g/t=0.48 fringing
   kills modulation. As-drawn 60 um gap cannot meet F_d on a 5 V / 40 um-wire
   rail. Recommended path: close gap to 40 um (detent) or 30 um (1.5x step),
   AND thicken wire. Ampere-turns alone cannot rescue the as-drawn geometry.
6. COIL: mean turn 3776 um, 3 layers x 24 turns, window capacity ~93 turns,
   wire length 264.3 mm, R = 3.618 ohm (reproduces from rho*l/A), L/R ~9 us.
   Cold rail ceiling 1.382 A; after a 1 A / 1 ms pulse, warm ceiling 1.365 A.
7. ALGEBRA: V=(N*i)*rho*l_turn/A_wire so turn count cancels for FIXED mean
   turn and wire section. Caveat accepted: extra layers lengthen l_turn;
   short pulses near L/R make volt-seconds N-dependent. Thicker wire remains
   the voltage lever; gap closure is the force lever.
8. RESONANCE: client's k=2*pi*F_d/(S/2) gives 949 Hz; sinusoidal-over-pitch
   form k=2*pi*F_d/pitch gives 387 Hz (factor sqrt(6)). 387 Hz used.
9. MAGNET screen (H_c * t vs ~95 At of the 40 um-gap stepping path) — EXPLICITLY
   a screen, not a load-line solve:
     sintered NdFeB 900 kA/m, 0.30 mm -> 270 At (too strong)
     SmCo 800 / 0.30 -> 240 At (too strong)
     Alnico 5 50 / 0.50 -> 25 At (too weak + demag risk)
     sintered ferrite 250 / 0.30 -> 75 At (brackets)
     bonded NdFeB 600 / 0.20 -> 120 At (brackets)
   Load-line solve with magnet present is NOT done. Ferrite demag check open.
   Quoted min thicknesses are special-order forms, not generic catalogue.
10. MANUFACTURABILITY. Translator YES, prismatic, photochemical etch of
    0.1 mm Fe-Co recommended but 125 um tooth is at process edge (+/-10-20 um,
    taper, root radii). Micro-MIM downgraded to prove-first. Anneal ~850 C is
    the real risk. Pole CORE easy; WINDING is the constraint — recommended
    route is pre-wound bonded-wire air coil with split-core assembly (industry
    practice). Planar/deposited coils rejected for copper cross-section.
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
(b) whether a 2D planar unrolled model at 1200 um depth is legitimate when the
    real device wraps flux transversely; what the ~28% median MST vs
    1/2 i^2 dL/dx disagreement (worse at high current) is telling us; and
    whether reinstating magnitudes after the "fixed-circuit" overhang check
    is actually earned;
(c) whether "the turn count cancels" is true AND correctly applied, and where
    it breaks down;
(d) whether removing the magnet for the force-vs-current table is legitimate --
    does superposition hold well enough for the client to add the detent back
    separately?
(e) the gap x current matrix and the claim that fringing at g/t=0.48 is why
    only ~7% of ideal force is recovered — is the ideal bound the right
    comparison, and is gap closure ranked correctly vs ampere-turns?
(f) current density 318-800 A/mm^2 — is the "short pulses survive" hedge
    engineering or hand-waving?
(g) three-phase step, 104 um, resonance — anything simply wrong.
(h) the single biggest thing this analysis has NOT considered."""),
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
        ask="""Fact-check the manufacturability claims and the magnet stock
assumptions. Specifically:
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
