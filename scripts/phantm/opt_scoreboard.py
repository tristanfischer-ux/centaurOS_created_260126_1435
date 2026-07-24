"""PHANTM optimisation — scoreboard + figure sheets from out/opt/*.json.

Layout per plan v1.1: one running scoreboard, same columns always; one figure
sheet per sweep family with the baseline marked. Verdicts are derived from
RULES stated inline (not vibes): keep if it beats baseline on detent margin (g)
without killing drive or saturating the bridge.

Run: ~/.venvs/phantm/bin/python opt_scoreboard.py
"""
import json
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

OUT = os.path.join(os.path.dirname(__file__), "out", "opt")
d = json.load(open(os.path.join(OUT, "opt-sweeps-1.json")))
rows = d["rows"]
base = next(r for r in rows if r["family"] == "1A-duty" and r["setting"] == 0.50)

INK, MUT, ACC, BAD = "#1a1a1a", "#666666", "#1a5fb4", "#c01c28"


def verdict(r):
    dm = r["margin_g_drawn"] - base["margin_g_drawn"]
    ddrv = r["drv_quarter_mn"] - base["drv_quarter_mn"]
    if r["family"] == "V2-gap40":
        return ("KEEP" if r["margin_g_drawn"] >= 5.0 else "kill",
                f"{'recovers' if r['margin_g_drawn'] >= 5.0 else 'misses'} 5 g at 40 µm "
                f"({r['margin_g_drawn']:.1f} g)")
    if r["b_bridge_t"] > 2.0:
        return "kill", f"bridge saturates ({r['b_bridge_t']:.1f} T)"
    if dm > 0.15 and ddrv > -0.3 * abs(base["drv_quarter_mn"]):
        return "KEEP", f"+{dm:.2f} g margin vs baseline"
    if dm < -0.15:
        return "kill", f"{dm:.2f} g vs baseline"
    return "flat", "within noise of baseline"


lines = [
    "# Optimisation scoreboard — batch 1 (Phase 1A/1B + V2), " + f"PM {d['pm_study_mm']} mm, I {d['i_study_a']} A",
    "",
    "Baseline row = duty 0.50p (the FIXED design). Margin-g = breakaway / (g·mass): the",
    "honest objective (force per moving weight). bk drawn/exact = the registration pair.",
    "",
    "| Row | Family | tooth µm | tslot µm | sslot µm | gap µm | Br T | mass mg | bk drawn/exact mN | margin g | drive¼ mN | h1 mN | flux mod | B_br T | VERDICT |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
]
for r in rows:
    v, why = verdict(r)
    mark = " **(baseline)**" if r is base else ""
    lines.append(
        f"| {r['name']}{mark} | {r['family']} | {r['tooth_um']} | {r['tslot_um']} | "
        f"{r['sslot_um']} | {r['gap_um']} | {r['br_t']} | {r['mass_mg']} | "
        f"{r['bk_drawn_mn']}/{r['bk_exact_mn']} | **{r['margin_g_drawn']}** | "
        f"{r['drv_quarter_mn']} | {r['h1_mn']} | {r['flux_mod']:.1%} | {r['b_bridge_t']} | "
        f"{v} — {why} |")
lines += ["", f"Runtime {d['runtime_s']} s. Artefact: opt-sweeps-1.json."]
open(os.path.join(OUT, "SCOREBOARD.md"), "w").write("\n".join(lines) + "\n")
print("wrote SCOREBOARD.md")

for fam, xlab in (("1A-duty", "tooth width (× pitch)"),
                  ("1B-tslot", "translator slot depth (× 465 µm)"),
                  ("1B-sslot", "stator slot depth (× 155 µm)")):
    fr = [r for r in rows if r["family"] == fam]
    xs = [r["setting"] for r in fr]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(10.5, 4), dpi=170)
    a1.plot(xs, [r["margin_g_drawn"] for r in fr], "o-", color=ACC, label="margin (g), as-drawn")
    a1.plot(xs, [r["bk_exact_mn"] / (9.80665 * r["mass_mg"] * 1e-6) / 1e3 for r in fr],
            "s--", color=MUT, label="margin (g), exact ⅓")
    a1.axhline(5.0, color=BAD, ls=":", lw=1.2)
    a1.text(xs[0], 5.05, "5 g spec", color=BAD, fontsize=8)
    a1.set_xlabel(xlab); a1.set_ylabel("detent margin (g)"); a1.legend(fontsize=8); a1.grid(alpha=0.25)
    a2.plot(xs, [r["drv_quarter_mn"] for r in fr], "o-", color=ACC, label="drive @¼ pitch, 1.8 A (mN)")
    a2b = a2.twinx()
    a2b.plot(xs, [r["b_bridge_t"] for r in fr], "^--", color=BAD, label="|B| bridge (T)")
    a2b.set_ylabel("|B| bridge (T)", color=BAD)
    a2.set_xlabel(xlab); a2.set_ylabel("drive force (mN)"); a2.grid(alpha=0.25)
    a2.legend(fontsize=8, loc="upper left"); a2b.legend(fontsize=8, loc="lower right")
    fig.suptitle(f"Sweep {fam} — baseline at duty 0.50p / 1.0× depths", fontsize=10, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.93))
    fig.savefig(os.path.join(OUT, f"fig-opt-{fam}.png"))
    print(f"wrote fig-opt-{fam}.png")

v2 = [r for r in rows if r["family"] == "V2-gap40"]
if v2:
    fig, ax = plt.subplots(figsize=(7.5, 4), dpi=170)
    names = [r["setting"] for r in v2]
    ax.bar(range(len(v2)), [r["margin_g_drawn"] for r in v2], color=ACC)
    ax.axhline(5.0, color=BAD, ls=":", lw=1.4)
    ax.text(-0.4, 5.08, "5 g spec", color=BAD, fontsize=8)
    ax.set_xticks(range(len(v2)), names, fontsize=8)
    ax.set_ylabel("detent margin (g) at gap 40 µm")
    ax.set_title("V2 — can duty + N52 buy back the relaxed gap?", fontsize=10, fontweight="bold")
    ax.grid(alpha=0.25, axis="y")
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "fig-opt-V2-gap40.png"))
    print("wrote fig-opt-V2-gap40.png")
