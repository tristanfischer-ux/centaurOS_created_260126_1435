"""Red team the follow-up calculation pack — Sol + Kimi K3 only.

Run: OPENROUTER_API_KEY=... ~/.venvs/phantm/bin/python council_followup.py
       -> out/council-followup-{sol,kimi}.txt
"""

from __future__ import annotations

import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
URL = "https://openrouter.ai/api/v1/chat/completions"


def facts() -> str:
    study = json.load(open(os.path.join(OUT, "tony-phase-material-study.json")))
    rf = json.load(open(os.path.join(OUT, "double-wall-rf-check.json")))
    floq_path = os.path.join(OUT, "floquet-hex-array.json")
    floq = json.load(open(floq_path)) if os.path.exists(floq_path) else None

    va = study["variants"]["A_three_phase_3_teeth"]
    vb = study["variants"]["B_four_phase_4_teeth"]
    vc = study["variants"]["C_four_phase_3_teeth"]
    cmp_ = study["comparisons"]
    mats = study["materials"]

    lines = [
        "FOLLOW-UP CALCULATION PACK (Anvil, 29 Jul) — attack these claims.",
        "",
        "GEOMETRY LOCK: step = 104 um fixed. Duty = 0.401.",
        f"  A three-phase: pitch {va['meta']['pitch_um']:.0f} um, tooth "
        f"{va['meta']['tooth_um']:.0f} um, 3 teeth/pole, pole foot "
        f"{va['summary']['60']['pole_foot_mm']:.3f} mm",
        f"  B four-phase 4 teeth: pitch {vb['meta']['pitch_um']:.0f}, tooth "
        f"{vb['meta']['tooth_um']:.0f}, foot {vb['summary']['60']['pole_foot_mm']:.3f} mm",
        f"  C four-phase 3 teeth: same pitch/tooth as B, foot "
        f"{vc['summary']['60']['pole_foot_mm']:.3f} mm",
        "",
        "FORCE @ 0.40 A (coil-only FE, Br=0, Maxwell stress, DC end-bias removed):",
    ]
    for g in study["gaps_um"]:
        lines.append(
            f"  gap {g} um: A={va['summary'][str(g)]['force_at_0_40_a_mn']:.3f} mN  "
            f"B={vb['summary'][str(g)]['force_at_0_40_a_mn']:.3f} mN  "
            f"C={vc['summary'][str(g)]['force_at_0_40_a_mn']:.3f} mN  "
            f"B/A={cmp_['force_ratio_B_over_A_at_0_40A'][str(g)]:.3f}  "
            f"C/B={cmp_['force_ratio_C_over_B_at_0_40A'][str(g)]:.3f}")
    lines += [
        "",
        "CLAIMS MADE TO CLIENT:",
        "  (1) Four-phase helps ~+33% force at 60 um; little at 20 um; gap dominates.",
        "  (2) Three-tooth poles on four-phase pitch cost ~7% force at 60 um, not Tony's 25%.",
        "  (3) Stator channel count +33%; pole foot 0.85→1.52 mm (4-tooth) or 1.10 mm (3-tooth).",
        "  (4) Coil resistance held at 3.618 ohm for all variants (same wire/turns).",
        "  (5) Detent 11.13 mN unreachable at 60 um below 1.4 A for A/B/C; ~0.92 A at 40 um.",
        "",
        "MATERIALS @ 60 um, geometry A, force (mN) / bridge |B| (T):",
    ]
    for name, rows in mats.items():
        bits = ", ".join(f"{r['current_a']}A:{r['force_mn']:.3f}mN/B={r['b_bridge_max_t']:.3f}T"
                         for r in rows)
        lines.append(f"  {name}: {bits}")
    lines += [
        "  CLAIM: mixed Fe-Co translator + MIM poles ≈ all-MIM near rail; "
        "~13% below all-Fe-Co at 1.2 A. Curves are representative, not vendor grades.",
        "",
        "SINGLE-CELL RF (75 um tape, AF=3.10 mm):",
        f"  uniform fc={rf['uniform_cell']['fc_ghz']:.3f} GHz",
        f"  shrink-by-tape Δfc=+{rf['model_interior_shrink_by_tape']['delta_fc_mhz']:.0f} MHz",
        f"  shrink-by-tape/3 Δfc=+{rf['model_interior_shrink_by_tape_over_3']['delta_fc_mhz']:.0f} MHz",
        f"  interior-held pitch growth={rf['model_interior_held_exterior_grows']['pitch_growth_pct']:.2f}%",
    ]
    if floq:
        lines += [
            "",
            "FLOQUET–BLOCH ARRAY SOLVE (2D transverse, 2×2 hex supercell, Neumann TE):",
            f"  uniform fc={floq['uniform']['fundamental_cutoff_ghz']} GHz  "
            f"split={floq['uniform']['mode_splitting_ghz']} GHz  "
            f"margin@75={floq['uniform']['margin_at_75_ghz_mhz']} MHz",
            f"  1/3-double fc={floq['one_third_double']['fundamental_cutoff_ghz']} GHz  "
            f"split={floq['one_third_double']['mode_splitting_ghz']} GHz  "
            f"margin@75={floq['one_third_double']['margin_at_75_ghz_mhz']} MHz",
            f"  delta_fc={floq['comparison']['delta_fundamental_mhz']} MHz",
            "  VERDICT LINES:",
        ]
        for v in floq["verdict"]:
            lines.append(f"    - {v}")
    return "\n".join(lines)


SEATS = {
    "kimi": dict(
        model="moonshotai/kimi-k3",
        system=("You are auditing numerical correctness and modelling logic. "
                "Recompute ratios from the stated forces. Flag unit errors, "
                "illegitimate comparisons, and interpolation bias. Terse, "
                "quantitative. Label each finding DECISIVE / MATERIAL / MINOR."),
        ask="""Attack the FOLLOW-UP pack. Hardest on:
(a) Is B/A≈1.333 at 60 um a fair 'four-phase benefit', or an artefact of
    comparing 4 teeth vs 3 teeth at the same current without normalising for
    pole length, copper mass, or net multi-phase detent?
(b) Does holding R=3.618 ohm across longer four-phase poles understate volts?
(c) Is linear interpolation of I(F_d) legitimate on a saturating curve?
(d) Recompute every B/A and C/B ratio from the force table — any mis-report?
(e) Material claim ~13% at 1.2 A — reproduce; is comparing at equal current
    fair when MIM saturates earlier?
(f) Floquet: is a 2D transverse Neumann solve being oversold as a full array
    answer? What must still go to Vlad / 3D?
(g) Single biggest correction Anvil should make before the client PDF."""),
    "sol": dict(
        model="openai/gpt-5.6-sol",
        system=("You are a manufacturing + RF-hardware engineer. Fact-check "
                "whether the conclusions are safe to send a client. Correct "
                "over-claims. Name what a competent Vlad would still demand."),
        ask="""Red-team the FOLLOW-UP pack for client safety:
(a) Four-phase cost/length framing — is 'pole foot' being confused with
    full stator length? What else grows?
(b) MIM vs laminated Fe-Co — are the representative curves directionally
    right? What vendor data is mandatory before tooling?
(c) One-third double-wall Floquet conclusions — what would you refuse to
    stamp without a 3D unit-cell solve? Is 'guides still open at 75 GHz'
    enough for Tony?
(d) Any manufacturing or RF claim that should be DOWNGRADED or REMOVED.
(e) Concrete corrections (bullet list) Anvil must apply before shipping."""),
}


def call(seat: str, spec: dict, payload: str, retries: int = 2) -> tuple[str, str]:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("OPENROUTER_API_KEY not set")
    body = json.dumps({
        "model": spec["model"],
        "max_tokens": 12000,
        "messages": [
            {"role": "system", "content": spec["system"]},
            {"role": "user", "content": payload + "\n\n---\n\n" + spec["ask"]},
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
            txt = msg.get("content") or msg.get("reasoning") or ""
            if not txt:
                raise RuntimeError("empty content")
            usage = d.get("usage", {})
            return seat, (f"[model: {spec['model']}]\n"
                          f"[tokens: {usage.get('prompt_tokens')} in / "
                          f"{usage.get('completion_tokens')} out]\n\n{txt}")
        except Exception as e:  # noqa: BLE001
            last = f"{type(e).__name__}: {e}"
            if attempt < retries:
                time.sleep(5 * (attempt + 1))
    return seat, f"[model: {spec['model']}]\n[FAILED after retries] {last}"


def main():
    os.makedirs(OUT, exist_ok=True)
    payload = facts()
    open(os.path.join(OUT, "council-followup-facts.txt"), "w").write(payload)
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=2) as ex:
        results = list(ex.map(lambda s: call(s, SEATS[s], payload), SEATS))
    for seat, txt in results:
        p = os.path.join(OUT, f"council-followup-{seat}.txt")
        open(p, "w").write(txt)
        status = "FAILED" if "[FAILED" in txt else f"{len(txt.split())} words"
        print(f"  {seat:5s} {SEATS[seat]['model']:24s} {status}")
    print(f"wrote out/council-followup-*.txt ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
