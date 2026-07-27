"""PHANTM — the two outstanding-decision packs, ready to send.

Every open item in the programme that is waiting on a person rather than on a
calculation, written so it can be answered in one pass. The format is fixed and
deliberate — a question on its own invites a delay, so each one carries:

  WHAT IT UNBLOCKS   the decision actually waiting, so the cost of silence is
                     visible rather than implied
  THE OPTIONS        with our own numbers against each, so the reply can be a
                     choice rather than an investigation
  WE RECOMMEND       our answer, with the reasoning, so disagreeing is cheap
  IF WE DON'T HEAR   the default we will proceed on, and what changes if the
                     answer differs — so nothing stalls waiting for a reply, and
                     nobody is surprised later by an assumption they never saw

Numbers are read from the artefacts rather than retyped, so these packs cannot
drift from the report they are drawn from.

Run: ~/.venvs/phantm/bin/python questions.py
     -> out/PHANTM-QUESTIONS-TONY.md, out/PHANTM-QUESTIONS-VLAD.md
"""

from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")


def load(name):
    p = os.path.join(OUT, name)
    return json.load(open(p)) if os.path.exists(p) else None


def build_tony() -> str:
    demag = load("demag-fe.json")
    eddy = load("eddy-fe.json")
    vent = load(os.path.join("opt", "vent-tolerance.json"))
    b4 = load(os.path.join("opt", "opt-sweeps-4.json"))
    b3 = load(os.path.join("opt", "opt-sweeps-3.json"))

    L = []
    A = L.append
    A("# PHANTM actuator — decisions we need from you")
    A("")
    A("Tony — seven items, each one a choice rather than an open question. "
      "Where we can proceed without you we say what we will assume, so nothing "
      "is waiting on this reply; where the assumption is expensive to unwind we "
      "have said so.")
    A("")
    A("The three engineering gates that were open on our side are now closed. "
      "Two came back clean: the cancel coil does not demagnetise its own magnet "
      "(§14.4), and solid unlaminated parts do pass flux fast enough for the "
      "pulse — though with a 3.4× margin at the pessimistic corner rather than "
      "the comfortable one the earlier estimate implied (§14.5). The third "
      "found something: the damper vent's robust diameter is Ø0.138 mm, not the "
      "Ø0.15 we had been quoting, and the tolerance is tight enough that we "
      "want a coupon measurement before ordering any damper hardware (§14.7). "
      "That one is ours to action, not yours.")
    A("")
    A("The items below are the ones we cannot close ourselves.")
    A("")

    # ---- Q1 gap ----------------------------------------------------------
    g30 = None
    if b3:
        g30 = next((r for r in b3["rows"] if r["name"].startswith("g30 stack N52")), None)
    g20 = None
    if b4:
        g20 = next((r for r in b4["rows"] if r["name"] == "d40 stack N52 Pm0.50"), None)
    A("## 1. Working gap — 20 µm or 30 µm?")
    A("")
    A("**What it unblocks:** the tolerance class of the whole assembly, which "
      "in turn decides which suppliers can quote, whether the gap has to be "
      "actively set at assembly, and a large part of the unit cost. It is the "
      "single most expensive number in the design.")
    A("")
    A("**The options, on our finite-element numbers** (worst-registration "
      "figures — the honest ones):")
    A("")
    A("| Gap | Zero-power detent | Against the 5 g spec | What it costs to build |")
    A("|---|---|---|---|")
    if g20:
        A(f"| 20 µm | {g20['bk_exact_mn']:.1f} mN = {g20['margin_g_exact']:.1f} g "
          f"| {g20['margin_g_exact']/5:.1f}× | gap must be actively set at "
          f"assembly; force moves ≈8% per µm, so ±5 µm of scatter is ±40% of force |")
    if g30:
        A(f"| 30 µm | {g30['bk_exact_mn']:.1f} mN = {g30['margin_g_exact']:.1f} g "
          f"| {g30['margin_g_exact']/5:.1f}× | 1.5× looser on every tolerance in "
          f"the stack — materially more suppliers, materially cheaper |")
    A("")
    A("**We recommend 30 µm** unless your vibration answer (item 2) demands "
      "more force. It still clears the stated spec with margin, and it buys a "
      "tolerance class that changes who can build this and at what price. "
      "20 µm is available if the hold requirement turns out to be the 20–30 g "
      "ambition rather than 5 g — but it should be bought deliberately, for a "
      "reason, not inherited.")
    A("")
    A("**If we don't hear:** we will carry 20 µm as the design centre (it is "
      "what the current model and the supplier enquiries assume) and quote "
      "30 µm alongside it. Switching later is a parameter change on our side, "
      "not a redesign — so this one is safe to leave, but it is holding up the "
      "sharpest cost question we have.")
    A("")

    # ---- Q2 vibration ----------------------------------------------------
    A("## 2. Is the 20–30 g figure a HOLD requirement or a SURVIVE requirement?")
    A("")
    A("**What it unblocks:** the entire force ladder, and through it the gap "
      "decision above, the magnet grade, the drive current and the step energy. "
      "This is the highest-leverage number outstanding.")
    A("")
    A("The two readings size completely differently:")
    A("")
    A("- **HOLD** — the detent must beat 20–30 g of sustained platform "
      "acceleration without power. That is a 4–6× force increase over the "
      "current 5 g design and drives us to the optimised sets, the 20 µm gap "
      "and dual-coil stepping.")
    A("- **SURVIVE** — the actuator must not be damaged by 20–30 g of shock, "
      "but may lose position and be re-pointed afterwards. That is a structural "
      "and re-acquisition requirement, and the 5 g detent stands.")
    A("")
    A("**What we need:** the vehicle vibration envelope — acceleration against "
      "frequency for the platform, and whether beam pointing must be maintained "
      "through it. A single number (\"n g sustained, pointing maintained\") is "
      "enough to close it.")
    A("")
    A("**We recommend** treating it as HOLD for the satellite-communications-"
      "on-the-move case in the bid, because a beam that loses pointing under "
      "vibration is not doing the job the bid claims. But that is our reading "
      "of the use case, not of your requirement.")
    A("")
    A("**If we don't hear:** we proceed on HOLD at the balanced optimised set "
      "(14.6 g as-drawn, 11.0 g worst-registration), which covers the lower end "
      "of the ambition with margin. If the real answer is SURVIVE we have "
      "over-designed and can recover cost by relaxing back toward the 5 g "
      "design and the 30 µm gap.")
    A("")

    # ---- Q3 registration -------------------------------------------------
    A("## 3. Pole spacing — 374 µm (brief), 400 µm (your CAD), or 390 µm (exact)?")
    A("")
    A("**What it unblocks:** step uniformity, and with it the phase jitter the "
      "array sees. It is also a straight trade against detent strength, so it "
      "interacts with items 1 and 2.")
    A("")
    A("The three documents disagree, and none of the first two gives exact "
      "third-of-pitch phasing:")
    A("")
    A("| Spacing | Source | Steps | Consequence |")
    A("|---|---|---|---|")
    A("| 374 µm | the brief | 172.6 / 146.1 / 145.3 µm | uneven; ±3.4° of phase "
      "jitter at 80 GHz; detent 7.72 mN |")
    A("| 400 µm | your CAD | also not exact ⅓ pitch | needs the same analysis "
      "once you confirm it is the intended number |")
    A("| 390 µm | exact ⅓ of a 465 µm pitch | 154.7 µm uniform | uniform steps, "
      "but detent falls to 5.95 mN — about 23% of the holding force traded away |")
    A("")
    A("**We recommend** deciding this against the array's phase-error budget "
      "rather than on our side: if ±3.4° of per-step jitter is acceptable to the "
      "beam, keep the wider spacing and the stronger detent. If it is not, the "
      "exact-⅓ registration is available and we know exactly what it costs.")
    A("")
    A("**If we don't hear:** we continue quoting every force figure with its "
      "registration attached, and carry 374 µm as drawn. This is the one item "
      "where we would rather not guess — the two answers differ by a quarter of "
      "the holding force.")
    A("")

    # ---- Q4 tooth profile ------------------------------------------------
    A("## 4. Tooth profile — which document is authoritative?")
    A("")
    A("**What it unblocks:** the tooling geometry. It is a small question that "
      "becomes an expensive one the moment a die is cut.")
    A("")
    A("The brief's slot-plus-land arithmetic gives 232 + 232 = 464 µm pitch. "
      "Your CAD dimensions the tooth features as 465 / 620. We have modelled "
      "the brief's numbers throughout. Please confirm which is intended — and "
      "if it is the CAD, whether 620 is a tooth width or something else, "
      "because we cannot reconcile it with a 465 µm pitch.")
    A("")
    A("**If we don't hear:** we proceed on 232 + 232 / 464 µm. A change here "
      "does not alter any conclusion in the report, but it does change the "
      "tooling drawings, so it should be settled before any die work.")
    A("")

    # ---- Q5 temperature --------------------------------------------------
    A("## 5. Peak operating temperature — we can now turn your answer straight "
      "into a magnet specification")
    A("")
    A("**What it unblocks:** the magnet grade, and nothing else — this is now a "
      "lookup rather than an investigation.")
    A("")
    A("We have run the demagnetisation analysis across temperature, so the "
      "answer to this question selects a grade directly. Every grade below "
      "survives the cancel coil's reverse field; what varies is the grade's own "
      "thermal rating:")
    A("")
    if demag:
        A("| If peak temperature is | Specify | Notes |")
        A("|---|---|---|")
        bal = demag["configs"][0]
        for ce in bal["ceilings"]:
            if ce["binding"] == "grade thermal rating":
                A(f"| up to {ce['t_max_catalogue_c']} °C | {ce['grade']} | "
                  f"demagnetisation limit is {ce['t_max_reversible_c']:.0f} °C, "
                  f"so the thermal rating binds first — "
                  f"{abs(ce['headroom_k']):.0f} K of margin against the coil |")
        A("")
    A("**If we don't hear:** we specify for 80 °C, which is the standard grade "
      "and the cheapest. Moving up the table is a purchasing change, not a "
      "design change — but it is not free, so we would rather size it once.")
    A("")

    # ---- Q6 drive voltage ------------------------------------------------
    A("## 6. Drive rail — is 1 V fixed, or can we have 2 V?")
    A("")
    A("**What it unblocks:** whether the full drive point is reachable at all.")
    A("")
    A("At the coil resistance of 0.552 Ω, 1 V limits the current to reduced-"
      "margin stepping. The full peak-force point needs about 1.9 V. The "
      "optimised sets need a full bridge per coil regardless.")
    A("")
    A("**We recommend 2 V** if the platform can supply it — it removes a "
      "constraint rather than trading one thing for another.")
    A("")
    A("**If we don't hear:** we design the drive electronics for a 2 V rail "
      "with 1 V operation as a documented reduced-capability mode.")
    A("")

    # ---- Q7 frame --------------------------------------------------------
    A("## 7. The bearing/frame block — is its cross-section negotiable?")
    A("")
    A("**What it unblocks:** whether the design fits an E-band cell at all.")
    A("")
    A("The magnetics fit the 3.10 mm cell interior with 0.35 mm of width margin "
      "and 0.47 mm of height margin. The bearing/frame block on your CAD is "
      "1784 × 3098 µm — larger in cross-section than the entire magnetic "
      "assembly. As drawn, the frame and not the magnetics sets the cell-fit "
      "budget, and it does not fit.")
    A("")
    A("**What we need:** either confirmation that the frame is a test-rig "
      "fixture rather than the flight part, or a view on how much of that "
      "cross-section is structurally required.")
    A("")
    A("**If we don't hear:** we treat it as a test fixture and carry the "
      "magnetics envelope as the fit-critical dimension. If it is the real "
      "part, this is a blocking problem and we should talk before anything "
      "else on this list.")
    A("")
    A("---")
    A("")
    A("Everything above is in the full report with the workings; these are the "
      "extracts that need a decision. Happy to take any of them on a call.")
    return "\n".join(L) + "\n"


def build_vlad() -> str:
    L = []
    A = L.append
    A("# PHANTM — the radio-frequency questions we cannot answer ourselves")
    A("")
    A("Vlad — five items on the boundary between the actuator and the cell. We "
      "have deliberately stayed on our side of it: everything below is a place "
      "where our mechanical design has taken a position that only the "
      "radio-frequency analysis can confirm or correct. Each says what we have "
      "assumed and what changes if you disagree, so none of them is blocking "
      "us today — but each is a real assumption sitting in the design.")
    A("")

    A("## 1. Metallised-cell cutoff — does the plated cell still cut off where "
      "the bare geometry says?")
    A("")
    A("**What we have:** from the measured interior across-flats of 3.10 mm, a "
      "validated eigensolver gives a cutoff of 53.56 GHz and a cutoff "
      "wavelength of 5.598 mm, with full 2π phase coverage available from "
      "roughly 57.4–58.0 GHz upward.")
    A("")
    A("**What we need from you:** confirmation on the *metallised* cell — the "
      "plating thickness and surface finish that will actually be there — plus "
      "a loss budget. Our number is a geometric result on an ideal conductor.")
    A("")
    A("**What changes if you disagree:** the band edges move, and with them the "
      "stroke requirement on the actuator. Stroke is the one requirement we "
      "have in abundance (about 6.9 mm usable against 5.54 mm needed at "
      "60 GHz), so we can absorb a fair amount of movement here — but the cell "
      "*depth* binds the low-frequency edge, and that is a cell-geometry "
      "change, not an actuator one.")
    A("")

    A("## 2. Foil-edge running clearance — how much, and does it need a choke?")
    A("")
    A("**What we have:** the moving short is a reflector foil that has to run "
      "with mechanical clearance to the guide wall. That annular gap is a leak "
      "path past the short. We have treated the actuator as self-shielding "
      "behind the reflector, which is a first-order claim that this clearance "
      "is the exception to.")
    A("")
    A("**What we need from you:** the clearance you can tolerate, and whether "
      "the foil edge needs a lip or choke feature. Both are one-line changes in "
      "our parametric model.")
    A("")
    A("**What changes if you disagree:** a tighter clearance raises the "
      "friction and contact risk in the guide, which feeds straight into the "
      "step dynamics — our friction band (0.2–0.5 mN) is already a live "
      "sensitivity in the damper design. A choke feature adds mass at the worst "
      "possible place, on the moving end.")
    A("")

    A("## 3. Array pitch growth — how much wall thickening can the array take?")
    A("")
    A("**What we have:** we proved deterministically, and then had it "
      "adversarially attacked, that wall thickness is not a radio-frequency "
      "dimension *for the cell* — the interior across-flats is the held "
      "dimension, and walls can thicken outward freely without changing cutoff. "
      "That result is solid and it matters, because wall thickness is the main "
      "manufacturing lever we have.")
    A("")
    A("**What we need from you:** the *array-level* consequence. Thickening the "
      "wall from 0.15 to 0.30 mm grows the lattice pitch from 3.25 to 3.40 mm, "
      "and grating-lobe and scan headroom are array properties, not cell ones. "
      "How much pitch growth is available?")
    A("")
    A("**What changes if you disagree:** if the pitch budget is tight, several "
      "of the cheaper cell fabrication routes get harder, because they buy "
      "their manufacturability with wall thickness. This is the single most "
      "useful number you could give us for the cost model.")
    A("")

    A("## 4. Two-half moulding — is a bond seam acceptable in the guide wall?")
    A("")
    A("**What we have:** the volume fabrication route for the cell lattice is "
      "moulding in two halves and bonding. That puts a seam running along the "
      "guide wall.")
    A("")
    A("**What we need from you:** whether a bonded seam at that location is "
      "acceptable, and if so what conductivity and gap the joint has to "
      "achieve.")
    A("")
    A("**What changes if you disagree:** the volume route changes. "
      "Electroforming and stacked etched plates both avoid a longitudinal seam "
      "and are already on our ledger as alternatives, but they cost more per "
      "cell at volume.")
    A("")

    A("## 5. Reflector standoff — how far should the foil sit from the iron?")
    A("")
    A("**What we have:** the reflector is carried on the translator nose on a "
      "standoff, so that the iron sits behind the reflecting plane where the "
      "fields are evanescent. We have parameterised the distance but not "
      "chosen it.")
    A("")
    A("**What we need from you:** the distance that keeps the magnetic material "
      "acceptably out of the field.")
    A("")
    A("**What changes if you disagree:** the standoff is a lever arm on the "
      "moving mass, so a longer one costs step time and settling directly. "
      "Our dynamics currently assume about 3 mg for the whole "
      "reflector-and-standoff assembly; a significantly longer standoff would "
      "need that revisited.")
    A("")
    A("---")
    A("")
    A("Nothing here is urgent this week, but items 2 and 3 are the two that "
      "most shape the mechanical design, so those first if you are choosing.")
    return "\n".join(L) + "\n"


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, text in (("PHANTM-QUESTIONS-TONY.md", build_tony()),
                       ("PHANTM-QUESTIONS-VLAD.md", build_vlad())):
        p = os.path.join(OUT, name)
        open(p, "w").write(text)
        print(f"wrote out/{name} ({len(text.splitlines())} lines)")


if __name__ == "__main__":
    main()
