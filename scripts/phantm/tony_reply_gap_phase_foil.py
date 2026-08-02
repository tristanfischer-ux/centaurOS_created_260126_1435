"""Short standalone note for Tony — gap/tooth, 4-phase teeth, folded hex foil.

Answers his 28 Jul evening note. Does not replace the worksheet answer
(PHANTM-TONY-V2-ANSWER); it goes one level deeper on the three points he
raised after reading Anvil.

Run: ~/.venvs/phantm/bin/python tony_reply_gap_phase_foil.py
       -> out/*.md + stamped PDF/HTML in out/ and ~/Downloads/
"""

from __future__ import annotations

import datetime
import json
import math
import os
import shutil
import subprocess
import sys
from importlib.machinery import SourceFileLoader
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SUBJECT = "PHANTM-TONY-GAP-PHASE-FOIL"


def load(n):
    p = os.path.join(OUT, n)
    return json.load(open(p)) if os.path.exists(p) else None


def current_for(rows, target_mn):
    i = [r["current_a"] for r in rows]
    f = [r["force_mn"] for r in rows]
    if target_mn > max(f):
        return None
    for a, b, fa, fb in zip(i, i[1:], f, f[1:]):
        if fa <= target_mn <= fb or fb <= target_mn <= fa:
            if fb == fa:
                return a
            return a + (target_mn - fa) * (b - a) / (fb - fa)
    return None


def deliverable_stem() -> str:
    ver = json.load(open(os.path.join(HERE, "version.json")))
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    return f"{stamp}-{SUBJECT}-V{ver['major']}.{ver['minor']}"


def write_md() -> str:
    num = load("tony-v2-numbers.json")
    mx = load("tony-v2-matrix.json")
    assert num and mx, "run tony_v2.py and femm/tony_v2_matrix.py first"

    t = num["translator"]
    g = num["geometry"]
    fd = t["detent_target_mn"]
    f15 = t["stepping_force_mn"][0]
    step = t["step_um"]
    pitch3 = g["pitch_um"]
    tooth3 = 125.0
    slot3 = 187.0
    duty = tooth3 / pitch3

    # 4-phase at FIXED step: pitch = 4 × step
    pitch4 = 4.0 * step
    tooth4 = duty * pitch4
    slot4 = pitch4 - tooth4

    def gap_needs(gap):
        rows = mx["by_gap"][str(gap)]
        r04 = next(r for r in rows if r["current_a"] == 0.4)
        return dict(
            f04=r04["force_mn"],
            mod=r04["modulation_pct"],
            frac=r04["fraction_of_ideal"],
            i_fd=current_for(rows, fd),
            i_15=current_for(rows, f15),
            gt=gap / tooth3,
        )

    L = []
    A = L.append
    A(f"# {SUBJECT.replace('-', ' ')} — reply to your note")
    A("")
    A("Tony — three points from your note after the first look at Anvil: "
      "(1) that ~20 µm gap looks necessary at a 104 µm step because "
      "gap/tooth kills the force, (2) whether a 4-phase drive could buy "
      "~⅓ wider teeth at the same step, and (3) whether Anvil looked at "
      "folding and laser-welding thin metal strip for the hex waveguides. "
      "Short answers with the numbers behind them. Standalone — you do not "
      "need the main report open.")
    A("")

    # ---- 1 gap/tooth ----------------------------------------------------
    A("## 1. Yes — it is the gap/tooth ratio, and 20 µm is where the "
      "as-drawn teeth start to behave")
    A("")
    A("On your worksheet geometry the tooth is 125 µm and the as-drawn "
      "working gap is 60 µm, so")
    A("")
    A("> gap / tooth = 60 / 125 = **0.48**")
    A("")
    A("At that ratio the unaligned permeance stays high because flux "
      "fringes across neighbouring teeth. There is almost nothing left for "
      "the teeth to modulate, so the force collapses. Ideal (no-fringing) "
      "force at 0.40 A would be ~15 mN; finite element at 60 µm returns "
      f"**{gap_needs(60)['f04']:.2f} mN** — only "
      f"~{gap_needs(60)['frac']*100:.0f}% of ideal, with "
      f"**{gap_needs(60)['mod']:.1f}%** inductance modulation.")
    A("")
    A("Closing the gap, *at the same 125 µm tooth and the same 70-turn "
      "coil*, is what restores modulation. Coil-only FE (magnet removed), "
      "same model as the worksheet answer:")
    A("")
    A("| Gap | gap/tooth | Mod. @0.40 A | F @0.40 A | I for F_d "
      f"({fd:.1f} mN) | I for 1.5×F_d ({f15:.1f} mN) |")
    A("|---|---|---|---|---|---|")
    for gap in mx["gaps_um"]:
        n = gap_needs(gap)
        def fmt(i):
            return "unreachable on sweep" if i is None else f"{i:.2f} A"
        A(f"| **{gap} µm** | {n['gt']:.2f} | {n['mod']:.1f}% | "
          f"{n['f04']:.2f} mN | {fmt(n['i_fd'])} | {fmt(n['i_15'])} |")
    A("")
    A("So your instinct is right: **at a 104 µm step with ~125 µm teeth, "
      "you need the gap down near 20–30 µm** (or you need wider teeth — "
      "§2) before the detent sits inside a 5 V / 40 µm-wire rail. 40 µm "
      "already reaches the detent; 30 µm puts 1.5× stepping inside the "
      "rail; 20 µm is the comfortable magnetic end of the same ladder.")
    A("")
    A("**The process caveat is first-order, not a footnote.** ±10–20 µm "
      "etch or stamp feature variation on a 125 µm tooth is already a "
      "large fraction of a 20–40 µm working gap. Closing the gap on paper "
      "without a gap-control plan (reference faces, selective finish, or "
      "a looser magnetic target) trades one problem for another. That is "
      "why Anvil has also been asking whether 30 µm is acceptable if the "
      "hold force can live with it.")
    A("")

    # ---- 2 four phase --------------------------------------------------
    A("## 2. Four-phase at fixed 104 µm step — good idea, not yet FE'd")
    A("")
    A("Anvil has so far locked the drive to **three phases**, so")
    A("")
    A(f"> step = pitch / 3 = {pitch3:.0f} / 3 = **{step:.0f} µm**")
    A("")
    A("Your proposal: keep the **step** at 104 µm, go to **four phases**, "
      "and let the pitch grow. That is exactly")
    A("")
    A(f"> pitch₄ = 4 × {step:.0f} = **{pitch4:.0f} µm**  "
      f"(vs {pitch3:.0f} µm today)")
    A("")
    A(f"Hold the tooth duty at your present {duty:.3f} (the number both "
      f"your closure and our duty sweep converged on):")
    A("")
    A("| | 3-phase (today) | 4-phase (same step) | Change |")
    A("|---|---|---|---|")
    A(f"| Step | {step:.0f} µm | {step:.0f} µm | — |")
    A(f"| Pitch | {pitch3:.0f} µm | {pitch4:.0f} µm | "
      f"+{(pitch4/pitch3-1)*100:.0f}% |")
    A(f"| Tooth width | {tooth3:.0f} µm | {tooth4:.0f} µm | "
      f"+{(tooth4/tooth3-1)*100:.0f}% |")
    A(f"| Slot width | {slot3:.0f} µm | {slot4:.0f} µm | "
      f"+{(slot4/slot3-1)*100:.0f}% |")
    A(f"| gap/tooth @ 60 µm | {60/tooth3:.2f} | {60/tooth4:.2f} | "
      "better, still not great |")
    A(f"| gap/tooth @ 40 µm | {40/tooth3:.2f} | {40/tooth4:.2f} | |")
    A(f"| gap/tooth @ 30 µm | {30/tooth3:.2f} | {30/tooth4:.2f} | |")
    A(f"| gap/tooth @ 20 µm | {20/tooth3:.2f} | {20/tooth4:.2f} | |")
    A("")
    A("So the ~33% wider tooth is real, and it **improves** the governing "
      "ratio at every gap. It is **not** a full substitute for closing the "
      "gap: at 60 µm a 167 µm tooth still sits at gap/tooth ≈ 0.36, which "
      "is better than 0.48 but still a fringing-dominated regime. The "
      "attractive combined move is **wider teeth *and* a moderated gap** "
      "(e.g. 4-phase + 30–40 µm), which may ease the process edge that a "
      "20 µm / 125 µm-tooth stack is sitting on.")
    A("")
    A("**What 4-phase costs (not yet sized):**")
    A("")
    A("1. **A fourth coil / pole** per actuator — more copper, more "
      "driver channels, a longer or re-pitched stator.")
    A("2. **Translator length** grows with pitch if you keep the same "
      "tooth count; or tooth count falls if you keep the same length. "
      "Either way the mass and the detent target move, so F_d is not "
      "invariant.")
    A("3. **Force FE for the 4-phase tooth** has not been run. The gap "
      "matrix above is for *your* 125 µm tooth. Scaling force by tooth "
      "width alone would be hand-waving — we should re-mesh.")
    A("")
    A("**Verdict.** Worth doing as the next magnetic branch: fix step = "
      f"{step:.0f} µm, pitch = {pitch4:.0f} µm, tooth ≈ {tooth4:.0f} µm, "
      "sweep gap 60/40/30/20 µm on the same FE stack, and compare rail "
      "current against today's 3-phase ladder. Anvil has not run that "
      "yet; your note is what puts it on the list.")
    A("")

    # ---- 3 foil hex ----------------------------------------------------
    A("## 3. Folded / laser-welded thin strip for the hex waveguides — "
      "yes, for the *cell*, not the actuator")
    A("")
    A("This is the important split. Anvil has looked hard at folding and "
      "joining thin metal for the **hexagonal waveguide cells** (the RF "
      "aperture). That is a different strip from the Fe-Co laminations of "
      "the actuator. The two share vocabulary (\"foil\", \"strip\", "
      "\"weld\", \"etch\") and are easy to conflate.")
    A("")
    A("### What was checked (cell walls)")
    A("")
    A("Your 25 Jul folded-foil route — press stiff metal foil into 60° "
      "half-hex corrugations, build the lattice, weld at the node faces, "
      "register in a grooved base plate — got two physics checks and a "
      "topology proof:")
    A("")
    A("1. **Corner radii.** A 0.3 mm bend shifts cut-off by only "
      "~137 MHz (≡ ~8 µm of interior); even 0.5 mm stays inside the "
      "±25 µm RF gate.")
    A("2. **Why one continuous tape collides.** Every interior hex "
      "junction is 3-way (odd degree). An Euler trail (one tape, each "
      "wall once) exists only with ≤2 odd junctions. A 7-cell tile "
      "already has 12. So the CAD collision is a **theorem**, not a "
      "process miss.")
    A("3. **Constructive fix — exactly your mixed single/double-wall "
      "instinct, made systematic.** Double one of the three wall "
      "orientation classes → every interior junction even → one tape "
      "can wind the lattice. Minimum doubled fraction = **⅓ of walls**. "
      "The commercial **row-strip** corrugation process lands on that "
      "same ⅓-double topology with trivial paths, and is the "
      "volume-credible default (per-node spot welds at cell pitch do "
      "not scale; continuous braze / laser seam / line bond does).")
    A("")
    A("Candidate tape thickness used in those checks: **~75–100 µm** "
      "(your band). Seams must be RF-continuous — a gappy seam is a "
      "slot antenna between cells.")
    A("")
    A("**(Updated after your overnight note.)** Two routes Anvil had "
      "listed are now **killed by you** and must not be recommended:")
    A("")
    A("| Route | Ruling |")
    A("|---|---|")
    A("| HOBE-style expand (flat foil + bond lines + stretch) | **NO** — "
      "two radial halves bonded/glued; must be continuous metal all "
      "around each guide |")
    A("| Stacked etched hex-hole sheets | **NO** — internal surface not "
      "flat enough |")
    A("| Fold + continuous weld/braze on strip, **individual** cells "
      "integrated with actuators | **Live** |")
    A("| Same for continuous **arrays** | Only if Vlad clears periodic "
      "**⅓-double walls** |")
    A("")
    A("Your ~4 mm figure is the rough developed length of a formed "
      "waveguide stub — not an actuator blank. Thickness band in the "
      "checks was ~75–100 µm.")
    A("")
    A("### Actuator iron is a different strip")
    A("")
    A("Folding strip into hex cells does **not** make actuator teeth. "
      "Translator may be laminated (stack to ~1.2 mm). Pole pieces you "
      "flag as **not prismatic** — laminations hard; MIM more likely "
      "(see overnight acknowledgment).")
    A("")

    # ---- close ---------------------------------------------------------
    A("## What this changes on the next pass")
    A("")
    A("| Your point | Anvil status | Next |")
    A("|---|---|---|")
    A("| ~20 µm gap needed at 104 µm step | **Agreed** — gap matrix "
      "already shows it; process variation is the real risk | Keep "
      "30/40 µm as the moderated alternatives |")
    A("| 4-phase → ~⅓ wider teeth, same step | **Arithmetic yes; "
      "FE not run** | Mesh pitch = 416 µm, tooth ≈ 167 µm, re-sweep "
      "gap |")
    A("| Fold / weld thin strip for hex cells | **Yes, individuals + "
      "actuators; arrays need Vlad on ⅓-double** — HOBE/etch-stack "
      "**killed** | Continuous metal around each guide |")
    A("")
    A("---")
    A("")
    A("*Numbers: `tony-v2-numbers.json`, `tony-v2-matrix.json` "
      "(coil-only FE, Br = 0). Cell foil: `foil-topology.json`, "
      "`foil-corner.json`, main-report folded-foil section. "
      "4-phase geometry in this note is pitch arithmetic only — "
      "not a force solve.*")
    A("")

    text = "\n".join(L) + "\n"
    md_path = os.path.join(OUT, f"{SUBJECT}.md")
    open(md_path, "w").write(text)
    print(f"wrote {md_path} ({len(L)} lines)")
    return md_path


def render_pdf(md_path: str, stem: str) -> str:
    loader = SourceFileLoader(
        "show_md", os.path.expanduser("~/.claude/scripts/show-md"))
    import importlib.util
    spec = importlib.util.spec_from_loader("show_md", loader)
    show_md = importlib.util.module_from_spec(spec)
    loader.exec_module(show_md)

    html_path = show_md.render(Path(md_path))
    # show-md writes beside the md; rename/copy to stamped names
    pdf_path = os.path.join(OUT, f"{stem}.pdf")
    html_stamped = os.path.join(OUT, f"{stem}.html")
    shutil.copy2(html_path, html_stamped)

    if not os.path.exists(CHROME):
        raise SystemExit(f"Chrome not found at {CHROME}")
    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf_path}", f"file://{html_stamped}"],
        check=True, capture_output=True, timeout=120,
    )
    print(f"wrote {pdf_path}")
    return pdf_path


def main():
    md = write_md()
    stem = deliverable_stem()
    # also keep a stamped md copy
    shutil.copy2(md, os.path.join(OUT, f"{stem}.md"))
    pdf = render_pdf(md, stem)
    dl = os.path.expanduser(f"~/Downloads/{stem}.pdf")
    shutil.copy2(pdf, dl)
    print(f"downloads {dl}")
    return dl


if __name__ == "__main__":
    main()
