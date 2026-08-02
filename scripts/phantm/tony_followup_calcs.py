"""Tony follow-up calculations note — four-phase, materials, double walls.

Reads:
  out/tony-phase-material-study.json
  out/double-wall-rf-check.json

Writes stamped markdown + PDF to out/ and ~/Downloads/
(date-time-subject-version naming). Spells terms out — no unexplained
abbreviations in the client-facing text.

Run: ~/.venvs/phantm/bin/python tony_followup_calcs.py
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
SUBJECT = "PHANTM-TONY-FOLLOWUP-CALCS"


def stem() -> str:
    ver = json.load(open(os.path.join(HERE, "version.json")))
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
    return f"{stamp}-{SUBJECT}-V{ver['major']}.{ver['minor']}"


def fmt_i(i):
    if i is None:
        return "not reached on this current sweep"
    return f"{i:.2f} A"


def write_md() -> str:
    study = json.load(open(os.path.join(OUT, "tony-phase-material-study.json")))
    rf = json.load(open(os.path.join(OUT, "double-wall-rf-check.json")))
    va = study["variants"]["A_three_phase_3_teeth"]
    vb = study["variants"]["B_four_phase_4_teeth"]
    vc = study["variants"]["C_four_phase_3_teeth"]
    cmp_ = study["comparisons"]
    mats = study["materials"]

    L, A = [], (lambda s: L.append(s))
    A("# PHANTM — follow-up calculations (your overnight points)")
    A("")
    A("Tony — three calculation packs against the points you raised overnight. "
      "Coil-only reluctance force (permanent-magnet remanence set to zero), "
      "same finite-element stack as the worksheet answer. Step held at "
      f"**{study['step_um']:.0f} micrometres** throughout.")
    A("")

    # ---- 1 four phase ---------------------------------------------------
    A("## 1. Three-phase versus four-phase drive")
    A("")
    A("Fixed step = pitch / number of phases = 104 micrometres. Tooth duty "
      "held at 0.401 (your closure). Three geometries:")
    A("")
    A("| Variant | Phases | Pitch | Tooth | Teeth on each pole | Pole foot length |")
    A("|---|---|---|---|---|---|")
    for v in (va, vb, vc):
        m, s = v["meta"], v["summary"]["60"]
        A(f"| {m['label']} | {m['phases']} | {m['pitch_um']:.0f} µm | "
          f"{m['tooth_um']:.0f} µm | {m['n_pole_teeth']} | "
          f"{s['pole_foot_mm']:.2f} mm |")
    A("")
    A("Peak force at 0.40 A (worksheet current), coil only:")
    A("")
    A("| Gap | Three-phase (A) | Four-phase, 4 teeth (B) | Four-phase, 3 teeth (C) | "
      "B / A | C / B |")
    A("|---|---|---|---|---|---|")
    for g in study["gaps_um"]:
        fa = va["summary"][str(g)]["force_at_0_40_a_mn"]
        fb = vb["summary"][str(g)]["force_at_0_40_a_mn"]
        fc = vc["summary"][str(g)]["force_at_0_40_a_mn"]
        A(f"| **{g} µm** | {fa:.2f} mN | {fb:.2f} mN | {fc:.2f} mN | "
          f"{cmp_['force_ratio_B_over_A_at_0_40A'][str(g)]:.2f}× | "
          f"{cmp_['force_ratio_C_over_B_at_0_40A'][str(g)]:.2f}× |")
    A("")
    A("**Reading.**")
    A("")
    A(f"1. At the as-drawn **60 micrometre** gap, four-phase with four teeth "
      f"per pole gives **{cmp_['force_ratio_B_over_A_at_0_40A']['60']:.0%}** "
      f"of the three-phase force at the same current — in line with the wider "
      f"tooth and the extra land. The pole foot grows "
      f"{va['summary']['60']['pole_foot_mm']:.2f} → "
      f"{vb['summary']['60']['pole_foot_mm']:.2f} mm "
      f"(about **+{100*(vb['summary']['60']['pole_foot_mm']/va['summary']['60']['pole_foot_mm']-1):.0f}%** "
      f"on that part), and stator channel count is still **+33%**.")
    A(f"2. Dropping to **three teeth** on the four-phase pitch (your length-"
      f"recovery idea) costs only "
      f"**{(1-cmp_['force_ratio_C_over_B_at_0_40A']['60'])*100:.0f}%** force "
      f"at 60 micrometres versus four teeth — not the 25% you guessed. At "
      f"30–20 micrometre gaps the three-tooth and four-tooth four-phase "
      f"forces are within a few percent. Finite element says the third tooth "
      f"is not buying a full quarter of the force once fringing is resolved.")
    A("3. **Closing the gap still dominates.** At 20 micrometres the three "
      "variants almost meet each other (~5.2 mN at 0.40 A). Four-phase is a "
      "help at large gap/tooth; it is not a substitute for gap control.")
    A("")
    A("Current needed to reach the detent (11.13 mN) and 1.5× detent "
      "(16.69 mN), interpolated on the same sweeps:")
    A("")
    A("| Gap | Three-phase I for detent | Four-phase 4-tooth I for detent | "
      "Four-phase 3-tooth I for detent |")
    A("|---|---|---|---|")
    for g in study["gaps_um"]:
        A(f"| {g} µm | {fmt_i(va['summary'][str(g)]['i_for_detent_a'])} | "
          f"{fmt_i(vb['summary'][str(g)]['i_for_detent_a'])} | "
          f"{fmt_i(vc['summary'][str(g)]['i_for_detent_a'])} |")
    A("")
    A("At 60 micrometres none of the three reaches the detent below 1.4 A on "
      "this coil. At 40 micrometres all three do, at nearly the same current "
      "(~0.90–0.92 A). **Gap wins; phase count is a secondary lever.**")
    A("")

    # ---- 2 materials ----------------------------------------------------
    A("## 2. Micro-injection-moulded poles versus laminated iron-cobalt "
      "translator")
    A("")
    A("Same three-phase geometry, 60 micrometre gap, coil only. Four material "
      "assignments (representative datasheet-shaped curves — not a named "
      "vendor grade yet):")
    A("")
    A("| Assignment | Force @ 0.40 A | Force @ 1.00 A | Force @ 1.20 A | "
      "Bridge |B| @ 1.20 A |")
    A("|---|---|---|---|---|")

    def row(name, label):
        r0 = {x["current_a"]: x for x in mats[name]}
        A(f"| {label} | {r0[0.4]['force_mn']:.2f} mN | "
          f"{r0[1.0]['force_mn']:.2f} mN | {r0[1.2]['force_mn']:.2f} mN | "
          f"{r0[1.2]['b_bridge_max_t']:.2f} T |")

    row("all_fe_co_laminated", "All iron-cobalt laminated (optimistic poles)")
    row("translator_fe_co__poles_mim",
        "**Translator iron-cobalt + poles MIM Fe-3%Si** (your split)")
    row("all_mim_fe3si", "All micro-injection-moulded Fe-3%Si")
    row("all_somaloy_legacy", "Legacy Somaloy-shaped curve (prior studies)")
    A("")
    feco_12 = next(x["force_mn"] for x in mats["all_fe_co_laminated"]
                   if x["current_a"] == 1.2)
    mix_12 = next(x["force_mn"] for x in mats["translator_fe_co__poles_mim"]
                  if x["current_a"] == 1.2)
    mim_12 = next(x["force_mn"] for x in mats["all_mim_fe3si"]
                  if x["current_a"] == 1.2)
    A(f"**Reading.** At worksheet current (0.40 A) the circuit is still "
      f"linear — material choice barely moves the force. Near the rail "
      f"(1.20 A) laminated iron-cobalt everywhere is best "
      f"({feco_12:.1f} mN). Putting **only the poles** on micro-injection-"
      f"moulded Fe-3%Si drops that to **{mix_12:.1f} mN** "
      f"({(1-mix_12/feco_12)*100:.0f}% less) — almost identical to making "
      f"*everything* MIM ({mim_12:.1f} mN). So your recollection is right "
      f"for the comparison that matters: **MIM poles limit the saturated "
      f"force versus laminated iron-cobalt**, and the bridge/pole steel is "
      f"where that limit sits. Vendor B–H for the chosen MIM grade should "
      f"replace these representative curves before tooling.")
    A("")

    # ---- 3 double wall RF -----------------------------------------------
    A("## 3. One-third double walls — first-order radio-frequency bounds")
    A("")
    A("Not a periodic Floquet array solve (that stays with Vlad). Single-cell "
      "cutoff of the 3.10 mm across-flats hexagon, with 75 micrometre tape:")
    A("")
    u = rf["uniform_cell"]
    s = rf["model_interior_shrink_by_tape"]
    m = rf["model_interior_shrink_by_tape_over_3"]
    h = rf["model_interior_held_exterior_grows"]
    A(f"| Model | Cut-off | Shift versus uniform |")
    A(f"|---|---|---|")
    A(f"| Uniform cell (today) | **{u['fc_ghz']:.2f} GHz** | — |")
    A(f"| Interior shrinks by one tape thickness (worst single-cell bound) | "
      f"{s['fc_ghz']:.2f} GHz | **+{s['delta_fc_mhz']:.0f} MHz** |")
    A(f"| Interior shrinks by tape/3 (one of three wall classes doubles) | "
      f"{m['fc_ghz']:.2f} GHz | +{m['delta_fc_mhz']:.0f} MHz |")
    A(f"| Interior held; exterior pitch grows by one tape | "
      f"{h['fc_interior_ghz']:.2f} GHz (unchanged) | 0 — but lattice pitch "
      f"**+{h['pitch_growth_pct']:.2f}%** on that axis |")
    A("")
    A("**For Vlad.** The question is not whether a single cell still guides "
      f"at 75 GHz (it does, with hundreds of megahertz of cut-off margin even "
      f"in the worst single-cell bound). The question is whether a "
      f"**periodic one-third-double-wall lattice** is acceptable: "
      f"biperiodic pitch (~{h['pitch_growth_pct']:.1f}% on one axis) and "
      f"mixed wall thickness at the nodes. Anvil cannot close that with a "
      f"single-cell eigenproblem.")
    A("")

    # ---- summary --------------------------------------------------------
    A("## Summary for the next design choice")
    A("")
    A("| Your point | Calculation result |")
    A("|---|---|")
    A("| Four-phase wider teeth help force at a given gap | "
      "**Yes at 60 µm (~+33%); little at 20 µm.** Gap remains the main lever. |")
    A("| Four-phase costs ~+33% stator and lengthens the stack | "
      "**Confirmed** on channel count; pole foot "
      f"{va['summary']['60']['pole_foot_mm']:.2f}→"
      f"{vb['summary']['60']['pole_foot_mm']:.2f} mm with four teeth. |")
    A("| Three-tooth poles on four-phase pitch cost ~25% force | "
      f"**Finite element says ~{(1-cmp_['force_ratio_C_over_B_at_0_40A']['60'])*100:.0f}% "
      f"at 60 µm, less at tight gaps** — milder than guessed. |")
    A("| MIM poles lower saturation versus laminated iron-cobalt | "
      f"**Yes near the rail (~{(1-mix_12/feco_12)*100:.0f}% less force at 1.2 A "
      f"for mixed vs all iron-cobalt).** |")
    A("| One-third double walls for arrays — ask Vlad | "
      f"Single-cell cut-off shift up to ~{s['delta_fc_mhz']:.0f} MHz if "
      f"aperture is eaten; or ~{h['pitch_growth_pct']:.1f}% pitch growth if "
      f"interior is held. **Array Floquet still open.** |")
    A("")
    A("---")
    A("")
    A(f"*Finite-element runtime {study['runtime_s']:.0f} s. Artefacts: "
      "`tony-phase-material-study.json`, `double-wall-rf-check.json`. "
      "Material curves are representative; swap for named vendor data "
      "before tooling.*")
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
    # GATE: this older writer used absolute-only framing. Block ship unless
    # prose passes force_claim_guards (prefer tony_reply_overnight.py).
    from force_claim_guards import (assert_claim_text_safe, audit_study,
                                    enrich_study_comparisons)
    study = json.load(open(os.path.join(OUT, "tony-phase-material-study.json")))
    audit = enrich_study_comparisons(study)
    md = write_md()
    viol = assert_claim_text_safe(open(md).read(), audit)
    if viol:
        raise SystemExit(
            "tony_followup_calcs.py prose failed force_claim_guards — "
            "use tony_reply_overnight.py instead.\n  - "
            + "\n  - ".join(viol))
    s = stem()
    shutil.copy2(md, os.path.join(OUT, f"{s}.md"))
    pdf = render_pdf(md, s)
    dl = os.path.expanduser(f"~/Downloads/{s}.pdf")
    shutil.copy2(pdf, dl)
    print(f"downloads {dl}")


if __name__ == "__main__":
    main()
