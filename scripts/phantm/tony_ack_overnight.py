"""Acknowledge Tony's overnight note (29 Jul ~00:08–00:22) — capture corrections.

Short standalone PDF: what he ruled, what Anvil had wrong, what is now open
(Vlad on ⅓-double walls; pole-piece process; 4-phase cost/length trade).

Run: ~/.venvs/phantm/bin/python tony_ack_overnight.py
"""

from __future__ import annotations

import datetime
import json
import os
import shutil
import subprocess
from importlib.machinery import SourceFileLoader
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SUBJECT = "PHANTM-TONY-ACK-OVERNIGHT"


def stem() -> str:
    ver = json.load(open(os.path.join(HERE, "version.json")))
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    return f"{stamp}-{SUBJECT}-V{ver['major']}.{ver['minor']}"


def write_md() -> str:
    L, A = [], (lambda s: L.append(s))
    A("# PHANTM — acknowledging your overnight note")
    A("")
    A("Tony — captured, and several Anvil routes are now **ruled out** by what "
      "you wrote. Short confirmation so we do not keep recommending dead paths. "
      "(Reading \"50 MHz\" as **50 GHz** — the 75/50 = 3/2 wavelength ratio.)")
    A("")

    A("## 1. Folded / welded strip — cell only, and only as individuals for now")
    A("")
    A("Heard clearly:")
    A("")
    A("- The ~4 mm strip idea is **waveguide only** — your rough guess at the "
      "developed length of a formed stub, not an actuator blank.")
    A("- **Now:** individual cells, built **integrated with their actuators**.")
    A("- **Not yet:** continuous assembly of waveguide *arrays* this way, "
      "unless the lattice can live with **⅓ double walls**.")
    A("")
    A("**Open with Vlad:** does a periodic ⅓-double-wall hex lattice produce "
      "insuperable RF issues (biperiodic pitch, mixed wall thickness, node "
      "fillets)? Anvil already flagged a Floquet / periodic-supercell check "
      "before Seed-1 foil hardware — your note makes that a **hard gate**, "
      "not a nice-to-have.")
    A("")
    A("### Routes Anvil had on the table — your kills")
    A("")
    A("| Route Anvil had listed | Your ruling | Why (your words) |")
    A("|---|---|---|")
    A("| Stack etched hex-hole sheets | **NO GOOD** | Waveguide internal "
      "surface would **not** be flat enough |")
    A("| Flat sheets + bond lines + stretch (HOBE-style expand) | **NO GOOD** | "
      "Must have **continuous metal all around** the guide inside; every "
      "guide built that way is two radial halves only bonded/glued — "
      "**terrible electrical properties** |")
    A("| Fold + continuous weld/braze seam on strip (individuals) | **Still "
      "live** | Integrated with actuators; array form only if Vlad clears "
      "⅓-double walls |")
    A("")
    A("Anvil will stop presenting etch-stack and expand-honeycomb as "
      "production defaults for PHANTM cells. Continuous circumferential "
      "metal is the acceptance test.")
    A("")

    A("## 2. Translator laminations vs pole pieces")
    A("")
    A("**Translator — agreed in principle.** Stacked laminations if foil "
      "thickness × count lands on the ~**1.2 mm** tooth height (your L_y). "
      "e.g. 12 × 100 µm, or 8 × 150 µm, after stack compression. Anneal / "
      "stacking-stress caveats from the worksheet answer still stand.")
    A("")
    A("**Pole pieces — correction to Anvil.** We had called the pole-piece "
      "*core* prismatic (constant 2D silhouette extruded). You are saying "
      "the real pole pieces are **not prismatic in any dimension**, so a "
      "single lamination shape does not stack into the part unless a "
      "**largish set of different outlines** is used — and even that may "
      "not be practical. That pushes poles toward **MIM** (or another "
      "3D net-shape soft-magnetic process), with laminations reserved for "
      "the translator.")
    A("")
    A("**MIM and saturation — nuance, not a brush-off.** Relative to "
      "*pressed SMC*, MIM Fe-3%Si is usually *better* (Anvil quoted "
      "~1.8–2.0 T). Relative to *laminated electrical steel / Fe-Co strip* "
      "(the translator route), MIM often **is** lower Bsat and has "
      "porosity / process scatter — your recollection matches that "
      "comparison. If poles go MIM and the translator stays laminated "
      "Fe-Co, the circuit is mixed-material: FE must use the vendor B-H "
      "for the MIM grade, not assume Permendur everywhere. Open: pick a "
      "candidate µ-MIM alloy and re-solve the pole with its real curve.")
    A("")

    A("## 3. Three-phase vs four-phase — your cost/length framing")
    A("")
    A("Recording your trade as the working statement (FE still not run):")
    A("")
    A("| | Effect |")
    A("|---|---|")
    A("| 4-phase, same 104 µm step | Wider teeth → better gap/tooth → "
      "**more force at a given gap** |")
    A("| Stator cost | **~+33%** (fourth pole/coil set) |")
    A("| Stack / stator length | **Longer**, unless… |")
    A("| …use 3-tooth pole pieces on the longer pitch | Recovers length, "
      "but **~−25% force** (your figure) |")
    A("")
    A("So 4-phase is not a free lunch: it buys magnetic margin against "
      "gap, and spends stator cost and/or length (or gives force back if "
      "you shorten via 3-tooth poles). Next Anvil branch, if we run it: "
      "same FE ladder for (a) 4-phase / 4-tooth poles and (b) 4-phase / "
      "3-tooth poles, against today's 3-phase baseline — so the 33% / 25% "
      "numbers get a force curve under them.")
    A("")

    A("## 4. Strategic frame — E-band first, 50 GHz as known backoff")
    A("")
    A("Heard, and it matches how Anvil should prioritise:")
    A("")
    A("1. This actuator was always going to be hard at this scale — "
      "process precision is the wall we keep hitting.")
    A("2. **75 GHz** is the centre of analysis in part because it sits "
      "**ahead of what electronic phased arrays can do at nearly any "
      "cost** — exclusivity, not comfort.")
    A("3. At **~50 GHz**, λ is 75/50 = **1.5× longer** → many process "
      "issues ease (~50% easier in your words). That is a **known place "
      "to go**, not a surprise retreat.")
    A("4. **Right now:** see whether E-band can be made to work with "
      "what we already know and processes that are **viable today**.")
    A("5. **Later:** if a customer wants a first build, backoff to "
      "50 GHz is allowed — *knowing* the exclusive next step is still "
      "there.")
    A("")
    A("Anvil will keep the design pressure on **E-band + processes that "
      "exist now**, and treat 50 GHz as an explicit fallback architecture "
      "(scale gaps, teeth, cell pitch with λ), not as the default escape "
      "hatch in every tough paragraph.")
    A("")

    A("## Actions this note creates")
    A("")
    A("| # | Action | Owner |")
    A("|---|---|---|")
    A("| 1 | Ask Vlad: RF impact of periodic ⅓-double walls on hex "
      "array | you / Vlad |")
    A("| 2 | Drop etch-stack and HOBE-expand from cell shortlist | Anvil |")
    A("| 3 | Reclassify pole pieces as non-prismatic → MIM (or multi-"
      "outline stack) path; laminations for translator only | Anvil |")
    A("| 4 | Optional FE: 4-phase wider teeth vs 4-phase + 3-tooth "
      "poles (cost/length/force) | Anvil, when you want it |")
    A("| 5 | Keep E-band / viable-now as the primary squeeze; document "
      "50 GHz backoff as scaled λ option | Anvil |")
    A("")
    A("Night night received — sleep well.")
    A("")
    A("---")
    A("")
    A("*Acknowledgment only. Does not replace the worksheet answer or "
      "the gap/phase/foil note; supersedes Anvil recommendations that "
      "conflict with your kills above.*")
    A("")

    path = os.path.join(OUT, f"{SUBJECT}.md")
    open(path, "w").write("\n".join(L) + "\n")
    print(f"wrote {path}")
    return path


def render_pdf(md_path: str, name_stem: str) -> str:
    loader = SourceFileLoader(
        "show_md", os.path.expanduser("~/.claude/scripts/show-md"))
    import importlib.util
    spec = importlib.util.spec_from_loader("show_md", loader)
    show_md = importlib.util.module_from_spec(spec)
    loader.exec_module(show_md)
    html_path = show_md.render(Path(md_path))
    html_stamped = os.path.join(OUT, f"{name_stem}.html")
    shutil.copy2(html_path, html_stamped)
    pdf_path = os.path.join(OUT, f"{name_stem}.pdf")
    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf_path}", f"file://{html_stamped}"],
        check=True, capture_output=True, timeout=120,
    )
    print(f"wrote {pdf_path}")
    return pdf_path


def main():
    md = write_md()
    s = stem()
    shutil.copy2(md, os.path.join(OUT, f"{s}.md"))
    pdf = render_pdf(md, s)
    dl = os.path.expanduser(f"~/Downloads/{s}.pdf")
    shutil.copy2(pdf, dl)
    print(f"downloads {dl}")

    # Append to tracker so the kills stick in-repo
    tracker = os.path.join(HERE, "TRACKER.md")
    if os.path.exists(tracker):
        block = (
            "\n## Tony overnight (29 Jul ~00:08–00:22) — CAPTURED\n"
            "- Cell foil: individuals + actuators only; arrays need Vlad OK on "
            "⅓-double walls.\n"
            "- **KILLED:** etched hex-hole stack (surface flatness); HOBE "
            "expand / bonded radial halves (must be continuous metal around "
            "guide).\n"
            "- Translator laminations OK if stack → ~1.2 mm; **poles NOT "
            "prismatic** → MIM / multi-outline, not single-lam stack.\n"
            "- MIM Bs: often lower vs laminated Fe-Co (not vs SMC).\n"
            "- 4-phase: +force via wider teeth; +~33% stator cost; longer "
            "stator unless 3-tooth poles (−~25% force).\n"
            "- Strategy: squeeze E-band with processes viable NOW; 50 GHz "
            "(λ×1.5) is known backoff, not the default escape.\n"
            f"- Ack PDF: `out/{s}.pdf`\n"
        )
        with open(tracker, "a") as f:
            f.write(block)
        print(f"appended TRACKER.md")


if __name__ == "__main__":
    main()
