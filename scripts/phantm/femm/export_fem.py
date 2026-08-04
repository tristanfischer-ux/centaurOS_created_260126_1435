"""PHANTM — export our model as .fem files Tony can open in the FEMM GUI.

WHY. Two models disagree about how much closing the working gap buys (his 1.65x
against our ~6x for 60 -> 20 um), and that is the number his manufacturing
question rests on. Correspondence will not settle it. Handing over the actual
model files does: run one geometry through both solvers and whoever is wrong
finds out in an afternoon.

We already produce a .fem on every solve — `mi_saveas` runs before the analysis
— and then delete it along with the .lua and .ans. This keeps it.

WHAT HE WILL SEE, AND THE CAVEAT THAT MUST TRAVEL WITH IT. The exported model is
the CORRECTED one, which deliberately does NOT look like the real device: the
return path is drawn far from the teeth and several times thicker than the real
bridge limb. That is not sloppiness, it is the decomposition —

  the teeth, gaps and pole feet are prismatic across the 1200 um width, so a 2D
  planar solve is EXACT there, and that region is where force is made;
  the bridge wraps out of plane, does not modulate with position, and therefore
  only scales the flux — so it is deliberately idealised out of the way rather
  than approximated badly.

Our earlier model approximated it badly instead: a straightened bridge close to
the pole at a fifth of the real limb thickness acted as a magnetic short,
putting 0.084 T in the gap against 0.277 T in the bridge. That is the error the
exported model fixes.

So the right comparison for him is NOT "does this look like my actuator" — it
will not — but "does your solver agree with ours on THIS geometry". If it does,
the remaining difference is geometry and we reconcile dimensions. If it does
not, it is solver setup, and that is a much shorter conversation.

Run: ~/.venvs/phantm/bin/python -m femm.export_fem
"""

from __future__ import annotations

import os
import shutil
import subprocess

from params import BASELINE
from . import lua_gen, tooth_exact
from .runner import BIN
from .sweep import CASES

OUT = os.path.join(os.path.dirname(__file__), "..", "out")
EXPORT = os.path.join(OUT, "fem-exchange")

# Tony's own three benchmark cases, so the comparison is like for like.
CASES_TO_EXPORT = [
    ("60um-0.35A-70T", 60, 0.35, 70),
    ("20um-0.35A-70T", 20, 0.35, 70),
    ("40um-0.50A-90T", 40, 0.50, 90),
]
DX_MM = 0.078          # quarter tooth-spacing, where he took his readings


def export_one(tag: str, gap_um: float, i_a: float, turns: int) -> dict:
    """Write a standalone .fem (and the .lua that generated it) for one case."""
    os.makedirs(CASES, exist_ok=True)
    os.makedirs(EXPORT, exist_ok=True)
    tooth_exact.configure(gap_um, turns, clear_pitches=4.0, thick_scale=16.0)

    stem = f"PHANTM-{tag}"
    lua_path = os.path.join(CASES, f"{stem}.lua")
    with open(lua_path, "w") as f:
        f.write(lua_gen.actuator_lua(DX_MM, i_a, 0.05, f"{stem}.fem"))

    # run it so the .fem is written and we know it solves
    proc = subprocess.run([os.path.abspath(BIN), "-q",
                           f"--lua-script={os.path.abspath(lua_path)}"],
                          capture_output=True, text=True, timeout=600,
                          cwd=CASES)
    fem = os.path.join(CASES, f"{stem}.fem")
    ok = os.path.exists(fem) and "PHANTM_RESULT" in proc.stdout
    if ok:
        shutil.copy(fem, os.path.join(EXPORT, f"{stem}.fem"))
        shutil.copy(lua_path, os.path.join(EXPORT, f"{stem}.lua"))
    size = os.path.getsize(fem) if os.path.exists(fem) else 0
    for ext in (".lua", ".fem", ".ans"):
        p = os.path.join(CASES, f"{stem}{ext}")
        if os.path.exists(p):
            os.remove(p)
    return dict(tag=tag, ok=ok, bytes=size,
                gap_um=gap_um, current_a=i_a, turns=turns)


def verify(path: str) -> dict:
    """Re-solve an exported .fem on its own to prove it is self-contained.

    An exported file that only works because some other state happened to be
    lying around is worse than no file at all — it would waste his afternoon
    and look like our solver disagreeing with itself.
    """
    work = os.path.join(EXPORT, "_verify")
    os.makedirs(work, exist_ok=True)
    stem = os.path.splitext(os.path.basename(path))[0]
    shutil.copy(path, os.path.join(work, f"{stem}.fem"))
    lua = os.path.join(work, "check.lua")
    with open(lua, "w") as f:
        f.write("\n".join([
            "show_console()",
            f'open("{stem}.fem")',
            "mi_analyze(1)",
            "mi_loadsolution()",
            "mo_groupselectblock(1)",
            'print("PHANTM_RESULT fx=" .. mo_blockintegral(18))',
            "mo_clearblock()",
            "quit()"]) + "\n")
    proc = subprocess.run([os.path.abspath(BIN), "-q",
                           f"--lua-script={os.path.abspath(lua)}"],
                          capture_output=True, text=True, timeout=600, cwd=work)
    got = "PHANTM_RESULT fx=" in proc.stdout
    fx = None
    if got:
        for line in proc.stdout.splitlines():
            if "PHANTM_RESULT fx=" in line:
                try:
                    fx = float(line.split("=", 1)[1])
                except ValueError:
                    pass
    shutil.rmtree(work, ignore_errors=True)
    return dict(file=os.path.basename(path), reopens=got,
                fx_mn=round(fx * 1e3, 4) if fx is not None else None)


def main():
    print("Exporting .fem files at Tony's three benchmark conditions")
    rows = [export_one(*c) for c in CASES_TO_EXPORT]
    for r in rows:
        print(f"  {r['tag']:18s} {'written' if r['ok'] else 'FAILED':8s} "
              f"{r['bytes']:7d} bytes")

    print("\nVerifying each file re-opens and solves STANDALONE")
    for r in rows:
        if not r["ok"]:
            continue
        v = verify(os.path.join(EXPORT, f"PHANTM-{r['tag']}.fem"))
        print(f"  {v['file']:34s} reopens {v['reopens']}  "
              f"Fx {v['fx_mn']} mN")

    readme = os.path.join(EXPORT, "READ-ME-FIRST.txt")
    with open(readme, "w") as f:
        f.write(
            "PHANTM actuator — model files for cross-checking\n"
            "===============================================\n\n"
            "Three .fem files at your own benchmark conditions, plus the .lua\n"
            "that generated each. FEMM 4.2 format; they open in the GUI.\n\n"
            "ONE THING TO KNOW BEFORE YOU OPEN THEM.\n\n"
            "These will NOT look like the actuator. The return path is drawn\n"
            "far from the teeth and several times thicker than the real bridge\n"
            "limb. That is deliberate.\n\n"
            "The teeth, gaps and pole feet are prismatic across the 1200 um\n"
            "width, so a 2D planar solve is exact there, and that is where the\n"
            "force is made. The bridge wraps out of plane and does not modulate\n"
            "with position, so it only scales the flux. Rather than approximate\n"
            "it badly in the tooth plane, we idealise it out of the way and add\n"
            "its reluctance separately.\n\n"
            "Our previous model DID approximate it badly — a straightened\n"
            "bridge close to the pole at a fifth of the real limb thickness,\n"
            "which acted as a magnetic short and put 0.084 T in the working gap\n"
            "against 0.277 T in the bridge. That is the error these files fix,\n"
            "and it is why our earlier numbers were about five times low.\n\n"
            "So the useful question is not 'does this look like my actuator' —\n"
            "it will not — but 'does my solver agree with theirs on THIS\n"
            "geometry'. If it does, our remaining disagreement is dimensions.\n"
            "If it does not, it is solver setup, which is a shorter\n"
            "conversation.\n\n"
            "Force is taken as the weighted stress tensor on the translator,\n"
            "group 1, at dx = 78 um. Depth 1.2 mm. Currents and turns as named\n"
            "in each filename.\n\n"
            "WHY THE RAW NUMBER WILL NOT MATCH THE ONE WE QUOTED.\n\n"
            "Solve one of these and read the stress tensor on group 1 and you\n"
            "will get, for the three files in order:\n\n"
            "    60 um / 0.35 A / 70 T    Fx = -2.89 mN\n"
            "    20 um / 0.35 A / 70 T    Fx = -13.65 mN\n"
            "    40 um / 0.50 A / 90 T    Fx = -15.54 mN\n\n"
            "Those are RAW single-position values and they include a constant\n"
            "offset that is an artefact of modelling a finite length of a\n"
            "periodic structure: the translator ends are attracted toward the\n"
            "pole regardless of position. A periodic device can have NO net\n"
            "force averaged over a whole tooth pitch, so whatever mean survives\n"
            "a full-pitch sweep IS that artefact and we subtract it. That is\n"
            "why the figures in the note are smaller than the raw values here.\n\n"
            "For a solver-versus-solver comparison the RAW numbers above are\n"
            "the right thing to check, because they are what the file alone\n"
            "determines. If your FEMM reproduces those three on these files,\n"
            "the solvers agree and our remaining disagreement is geometry.\n")
    print(f"\nwrote {EXPORT}/ ({len(os.listdir(EXPORT))} files, incl. READ-ME-FIRST.txt)")


if __name__ == "__main__":
    main()
