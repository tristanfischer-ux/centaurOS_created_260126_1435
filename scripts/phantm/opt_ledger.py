"""PHANTM — THE COMPLETE OPTIONS LEDGER (Tristan 25 Jul: "knowing what is bad
and does not work is just as useful as knowing what is best").

Merges EVERY option tried across the campaign — batches 1–4, the Pm re-centre,
the drive-scheme table and the damper grid — into one table with an explicit
PASS / KEEP / KILL verdict and the reason, failures included. Also emits the
verdict counts so the report can say honestly how much was tried and rejected.

Run: ~/.venvs/phantm/bin/python opt_ledger.py → out/opt/OPTIONS-LEDGER.md + .json
"""
import json
import os

OUT = os.path.join(os.path.dirname(__file__), "out", "opt")
G = 9.80665

L = {f: json.load(open(os.path.join(OUT, f + ".json")))
     for f in ("opt-sweeps-1", "opt-sweeps-2", "opt-sweeps-3", "opt-sweeps-4",
               "opt-recentre", "damper", "damper-balanced")}

rows = []


def add(option, family, numbers, verdict, why):
    rows.append(dict(option=option, family=family, numbers=numbers,
                     verdict=verdict, why=why))


# ---- batch 1: single knobs --------------------------------------------------
for r in L["opt-sweeps-1"]["rows"]:
    m = f"bk {r['bk_drawn_mn']}/{r['bk_exact_mn']} mN · {r['margin_g_drawn']} g drawn · drive {r['drv_quarter_mn']} mN · {r['mass_mg']} mg"
    fam = r["family"]
    if fam == "1A-duty":
        d = r["setting"]
        if d == 0.50:
            add(f"duty {d} (Tony baseline)", "tooth duty", m, "BASELINE",
                "near-worst as-drawn margin in the sweep — the 50/50 guess leaves force on the table")
        elif d == 0.35:
            add(f"duty {d}", "tooth duty", m, "KILL",
                "harmonic dip: exact-registration breakaway collapses to 2.42 mN (1.8 g) — decisively the worst option on the worst registration")
        elif d == 0.30:
            add(f"duty {d}", "tooth duty", m, "KILL",
                "registration-fragile: 10.1 g as-drawn but only 6.31 mN exact — spread too wide to bank")
        else:
            add(f"duty {d}", "tooth duty", m, "KEEP",
                "robust on both registrations; carried into the stacks")
    elif fam == "1B-tslot":
        k = r["setting"]
        add(f"translator slots {k}×", "slot depth", m,
            "KILL" if k < 1.0 else ("KEEP" if k > 1.0 else "BASELINE"),
            "force flat with depth — shallower only ADDS mass (worse margin); deeper deletes mass for free (pending §10 structural caveat)")
    elif fam == "1B-sslot":
        k = r["setting"]
        add(f"stator slots {k}×", "slot depth", m,
            "KILL" if k < 1.0 else ("KEEP" if k > 1.0 else "BASELINE"),
            "monotonic: shallower loses force (−16% at 0.5×); deeper gains ≈6–7% at unchanged mass")
    elif fam == "V2-gap40":
        add(f"gap 40 µm — {r['setting']}", "relaxed gap", m, "KILL",
            "later exposed by the basin check as a single-well non-stepper at the as-drawn registration; exact registration never clears 5 g")

# ---- batch 2: stacks --------------------------------------------------------
for r in L["opt-sweeps-2"]["rows"]:
    m = f"bk {r['bk_drawn_mn']}/{r['bk_exact_mn']} mN · {r['margin_g_drawn']} g · {r['mass_mg']} mg"
    if r["family"] == "V2-stack":
        add(f"gap-40 stack: {r['name']}", "relaxed gap", m, "KILL",
            "breakaway briefly looked ≥5 g as-drawn but the re-centre found ONE basin (mirage); dead")
    elif "d.30" in r["name"]:
        add(f"stack {r['name']}", "stack", m, "KILL",
            "15.4 g as-drawn is the sweep's biggest number and it is NOT bankable — exact registration only 6.39 mN")
    else:
        add(f"stack {r['name']}", "stack", m, "KEEP", "the d.40/d.45 deep-slot stacks — both registrations strong")

# ---- re-centre --------------------------------------------------------------
for name, w in L["opt-recentre"]["winners"].items():
    last = w["pm_rows"][-1]
    if name.startswith("V2"):
        add(f"{name} (Pm 0.15–0.50)", "re-centre",
            f"basins DRAWN = 1 at every Pm; exact 3 but ≤4.3 g", "KILL",
            "the basin check: passes breakaway, fails to BE a stepper — the campaign's cautionary tale")
    else:
        add(f"{name} (Pm 0.15–0.50)", "re-centre",
            f"monotonic to Pm 0.5: {last['bk_drawn_mn']}/{last['bk_exact_mn']} mN, basins 3/3 throughout",
            "KEEP", "no plateau by 0.5 mm; Pm stays the assembly trim")

# ---- batch 3/4: full stacks + gap ladder + Pm probe -------------------------
for src in ("opt-sweeps-3", "opt-sweeps-4"):
    for r in L[src]["rows"]:
        m = (f"bk {r['bk_drawn_mn']}/{r['bk_exact_mn']} mN · {r['margin_g_drawn']}/"
             f"{r['margin_g_exact']} g · basins {r['basins_drawn']}/{r['basins_exact']} · B_br {r['b_bridge_t']} T")
        n = r["name"]
        if "Pm 0.6" in n or "Pm 0.7" in n:
            add(n, "magnet length", m, "KILL",
                "only ≈+3% per 0.1 mm beyond 0.5 — extra magnet not worth it")
        elif n == "win sslot2x":
            add(n + " (THE BALANCED SET, N42)", "final stack", m, "PASS ★ RECOMMENDED",
                "2.2× spec worst-registration at the sane stepping cost (37 mJ, ±3.35 A)")
        elif "N52" in n and "g30" not in n and src == "opt-sweeps-4" and "d40" in n:
            add(n + " (THE MAX-FORCE SET)", "final stack", m, "PASS",
                "highest bankable margin (14.3 g worst-reg) — but 83 mJ/step at ±5 A and the N52 demag question")
        elif "g30" in n:
            add(n, "gap ladder", m, "PASS",
                "the honest manufacturing trade: 1.5× looser gap tolerance, both registrations clear spec")
        else:
            add(n, "final stack", m, "KEEP", "supporting point for the Pareto")

# ---- drive schemes (from the corrected damper artefacts) --------------------
for d, tag in ((L["damper-balanced"], "balanced set"), (L["damper"], "max-force set")):
    for srow in d.get("scheme_table", []):
        v = "KEEP" if srow["scheme"] == d["drive_scheme"] else (
            "KILL" if srow["barrier_mn"] > 0.5 else "viable")
        why = ("chosen: barrier cleared, held equilibrium at target, lowest energy"
               if v == "KEEP" else
               (f"mid-step barrier {srow['barrier_mn']} mN — cannot complete the step"
                if v == "KILL" else "clears the barrier but costs more energy than the chosen scheme"))
        add(f"drive {srow['scheme']} ({tag})", "drive scheme",
            f"barrier {srow['barrier_mn']} mN · eq at {srow['equilibria_um']} µm · {srow['e_mj_per_1p5ms']} mJ/1.5 ms",
            v, why)
    for grow in d["rows"]:
        lab = grow["label"]
        cap = grow["capture_holds_ms"]
        v = "PASS" if cap else "KILL"
        why = ("captures at every hold ≥3 ms" if cap else
               ("trapped-air spring mis-parks the translator" if lab == "sealed" else
                "insufficient dissipation — the translator escapes the target basin"))
        add(f"damper vent {lab} ({tag})", "damper",
            f"capture holds {cap or 'none'} · best settle {grow['best_settle_ms']}", v, why)

counts = {}
for r in rows:
    counts[r["verdict"].split()[0]] = counts.get(r["verdict"].split()[0], 0) + 1
lines = [
    "# THE COMPLETE OPTIONS LEDGER — everything tried, kept AND killed",
    "",
    f"{len(rows)} options evaluated: " + ", ".join(f"{v} {k}" for k, v in sorted(counts.items())) + ".",
    "Failures are kept on the record deliberately — knowing what does NOT work (and why)",
    "is as load-bearing as the recommendation.",
    "",
    "| Option | Family | Numbers | VERDICT | Why |",
    "|---|---|---|---|---|",
]
for r in rows:
    lines.append(f"| {r['option']} | {r['family']} | {r['numbers']} | **{r['verdict']}** | {r['why']} |")
open(os.path.join(OUT, "OPTIONS-LEDGER.md"), "w").write("\n".join(lines) + "\n")
json.dump(dict(counts=counts, rows=rows), open(os.path.join(OUT, "options-ledger.json"), "w"), indent=1)
print(f"ledger: {len(rows)} options — {counts}")
