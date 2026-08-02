"""Force-claim fairness guards — catch absolute-only multiphase framing.

INTENT: The overnight Tony pack shipped correct FE arithmetic with wrong
client attribution ("four-phase helps +33%", "3-tooth costs ~7% not 25%").
Root cause: absolute force per pole segment was the only normalisation
shown, while the design question was force per coil / per watt / per
millimetre of pole-foot envelope.

RULE (executable): any multiphase variant comparison MUST emit absolute,
per-coil, per-foot, and per-watt ratios. A claim that attributes an
absolute force ratio to "phase count" when that ratio equals the tooth/
coil-count ratio within tolerance is a HARD FAIL. A claim that rebuts a
length-normalised estimate using only the absolute ratio, when per-foot
agrees with the length estimate, is a HARD FAIL. Currents for a force
target above the last solved point must be labelled extrapolate, not
interpolate.

Run: ~/.venvs/phantm/bin/python force_claim_guards.py --selftest
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

# Absolute ratio within this of n_teeth_B/n_teeth_A ⇒ coil-count artefact
COIL_COUNT_RATIO_TOL = 0.02
# If |absolute loss| < this but |per-foot disagreement with length claim| …
ABSOLUTE_MILD_LOSS = 0.12          # e.g. −7%
# … and per-foot ratio is at least this far from 1 in the opposite sense
LENGTH_CLAIM_AGREE_TOL = 0.08      # within 8% of stated length claim


def current_for_force(rows: list[dict], target_mn: float) -> dict[str, Any]:
    """Return current estimate + honest method label.

    rows: [{current_a, force_mn}, ...] sorted by current.
    """
    if not rows:
        return dict(current_a=None, method="no_data", note="empty sweep")
    i_arr = [float(r["current_a"]) for r in rows]
    f_arr = [float(r["force_mn"]) for r in rows]
    f_max = max(f_arr)
    if target_mn <= f_max:
        for a, b, fa, fb in zip(i_arr, i_arr[1:], f_arr, f_arr[1:]):
            if fa <= target_mn <= fb or fb <= target_mn <= fa:
                if fb == fa:
                    return dict(current_a=a, method="bracket",
                                note="flat segment")
                i_star = a + (target_mn - fa) * (b - a) / (fb - fa)
                return dict(current_a=i_star, method="bracket",
                            note="inside solved sweep")
        return dict(current_a=None, method="not_found",
                    note="target below max but not in a segment")
    # Extrapolation from last two points — optimistic lower bound on a
    # saturating curve (underestimates required I).
    if len(rows) < 2:
        return dict(current_a=None, method="above_sweep",
                    note="need ≥2 solved points to extrapolate")
    a, b = i_arr[-2], i_arr[-1]
    fa, fb = f_arr[-2], f_arr[-1]
    if fb == fa:
        return dict(current_a=None, method="above_sweep",
                    note="last segment flat")
    i_star = b + (target_mn - fb) * (b - a) / (fb - fa)
    return dict(
        current_a=i_star,
        method="extrapolate_linear_optimistic",
        note="target above last solved force; linear I* is a lower bound "
             "on a saturating curve — solve at/above this current before "
             "shipping the number",
    )


def normalise_pair(
    force_a_mn: float, force_b_mn: float,
    n_coils_a: int, n_coils_b: int,
    foot_a_mm: float, foot_b_mm: float,
    r_coil_ohm: float = 3.618, current_a: float = 0.40,
) -> dict[str, Any]:
    """Four normalisations for a variant pair at equal per-phase current."""
    if min(force_a_mn, n_coils_a, n_coils_b, foot_a_mm, foot_b_mm) <= 0:
        raise ValueError("forces, coil counts, and feet must be positive")
    loss_a = n_coils_a * current_a ** 2 * r_coil_ohm
    loss_b = n_coils_b * current_a ** 2 * r_coil_ohm
    abs_ratio = force_b_mn / force_a_mn
    coil_ratio = (force_b_mn / n_coils_b) / (force_a_mn / n_coils_a)
    foot_ratio = (force_b_mn / foot_b_mm) / (force_a_mn / foot_a_mm)
    watt_ratio = (force_b_mn / loss_b) / (force_a_mn / loss_a)
    count_ratio = n_coils_b / n_coils_a
    return dict(
        absolute_ratio=abs_ratio,
        per_coil_ratio=coil_ratio,
        per_foot_ratio=foot_ratio,
        per_watt_ratio=watt_ratio,
        coil_count_ratio=count_ratio,
        force_a_mn=force_a_mn, force_b_mn=force_b_mn,
        per_coil_a_mn=force_a_mn / n_coils_a,
        per_coil_b_mn=force_b_mn / n_coils_b,
        per_foot_a_mn_per_mm=force_a_mn / foot_a_mm,
        per_foot_b_mn_per_mm=force_b_mn / foot_b_mm,
        n_coils_a=n_coils_a, n_coils_b=n_coils_b,
        foot_a_mm=foot_a_mm, foot_b_mm=foot_b_mm,
    )


def findings_for_pair(norm: dict[str, Any], *,
                      pair_name: str = "B/A",
                      length_claim_ratio: float | None = None,
                      ) -> list[dict[str, Any]]:
    """Emit guard findings for one normalised pair.

    length_claim_ratio: if set (e.g. Tony's 0.75 for C/B absolute, or the
    inverse density claim), check absolute-only rebuttals against per-foot.
    For "dropping a tooth costs ~25% force" interpreted as force density,
    pass the expected *absolute* ratio 0.75 and we check whether per-foot
    tells a different story than absolute.
    """
    out: list[dict[str, Any]] = []
    abs_r = norm["absolute_ratio"]
    count_r = norm["coil_count_ratio"]
    foot_r = norm["per_foot_ratio"]
    coil_r = norm["per_coil_ratio"]

    # 1) Coil-count artefact: absolute ≈ n_coils ratio, per-coil ≈ 1
    if abs(abs_r - count_r) / count_r <= COIL_COUNT_RATIO_TOL and abs(
            coil_r - 1.0) <= COIL_COUNT_RATIO_TOL:
        out.append(dict(
            code="COIL_COUNT_ARTEFACT",
            severity="HARD",
            pair=pair_name,
            detail=(
                f"{pair_name} absolute force ratio {abs_r:.4f} equals coil-"
                f"count ratio {count_r:.4f} within {COIL_COUNT_RATIO_TOL:.0%}; "
                f"per-coil ratio {coil_r:.4f}. Do NOT attribute this to phase "
                f"count / multiphase physics — it is the extra coil."
            ),
            client_safe_line=(
                f"Absolute force {pair_name} = {abs_r:.3f} (= coil count "
                f"{count_r:.3f}); force per coil unchanged. Extra force is "
                f"the extra tooth/coil, not a free multiphase bonus."
            ),
        ))

    # 2) Absolute mild, per-foot disagrees — forbids "only −7%, not 25%"
    abs_loss = 1.0 - abs_r  # positive when B < A
    if length_claim_ratio is not None and abs_loss < ABSOLUTE_MILD_LOSS:
        # Tony-style: expected absolute ~0.75. Per-foot may go the other way
        # (shorter variant denser). Flag when absolute is mild but per-foot
        # density ratio is far from absolute ratio.
        if abs(foot_r - abs_r) > 0.15:
            # Does per-foot agree with a ~25% length story?
            # If shorter machine (fewer teeth → smaller foot) has higher
            # per-foot force, length-normalised "cost of 4th tooth" is large.
            length_side = 1.0 / foot_r if foot_r > 1 else foot_r
            # cost of longer/heavier variant vs denser one
            denser_advantage = max(foot_r, 1.0 / foot_r) - 1.0
            if denser_advantage >= 0.20:  # ≥20% density swing
                out.append(dict(
                    code="LENGTH_NORM_CONTRADICTS_ABSOLUTE",
                    severity="HARD",
                    pair=pair_name,
                    detail=(
                        f"{pair_name} absolute ratio {abs_r:.3f} "
                        f"(loss {abs_loss*100:.1f}% < {ABSOLUTE_MILD_LOSS*100:.0f}%) "
                        f"but per-foot ratio {foot_r:.3f} "
                        f"(density swing {denser_advantage*100:.0f}%). "
                        f"Rebutting a ~{(1-length_claim_ratio)*100:.0f}% "
                        f"length-normalised claim with the absolute figure "
                        f"alone is forbidden."
                    ),
                    client_safe_line=(
                        f"Absolute {pair_name} = {abs_r:.3f}; per mm of pole "
                        f"foot = {foot_r:.3f}. Report both. A ~25% length-"
                        f"normalised estimate can be right while absolute "
                        f"loss is only a few percent."
                    ),
                ))

    # 3) Always require the four ratios be present (structural)
    required = ("absolute_ratio", "per_coil_ratio", "per_foot_ratio",
                "per_watt_ratio")
    missing = [k for k in required if k not in norm or norm[k] is None]
    if missing:
        out.append(dict(
            code="MISSING_NORMALISATION",
            severity="HARD",
            pair=pair_name,
            detail=f"Missing required ratios: {missing}",
            client_safe_line="Emit absolute, per-coil, per-foot, per-watt.",
        ))

    return out


def audit_study(study: dict[str, Any],
                r_coil_ohm: float = 3.618,
                current_a: float = 0.40,
                tony_c_over_b_length: float = 0.75,
                ) -> dict[str, Any]:
    """Audit a tony-phase-material-study.json-shaped dict."""
    va = study["variants"]["A_three_phase_3_teeth"]
    vb = study["variants"]["B_four_phase_4_teeth"]
    vc = study["variants"]["C_four_phase_3_teeth"]
    findings: list[dict[str, Any]] = []
    norms_by_gap: dict[str, Any] = {}

    for g in study["gaps_um"]:
        gs = str(g)
        fa = va["summary"][gs]["force_at_0_40_a_mn"]
        fb = vb["summary"][gs]["force_at_0_40_a_mn"]
        fc = vc["summary"][gs]["force_at_0_40_a_mn"]
        foot_a = va["summary"][gs]["pole_foot_mm"]
        foot_b = vb["summary"][gs]["pole_foot_mm"]
        foot_c = vc["summary"][gs]["pole_foot_mm"]
        na = va["meta"]["n_pole_teeth"]
        nb = vb["meta"]["n_pole_teeth"]
        nc = vc["meta"]["n_pole_teeth"]

        ba = normalise_pair(fa, fb, na, nb, foot_a, foot_b, r_coil_ohm, current_a)
        cb = normalise_pair(fb, fc, nb, nc, foot_b, foot_c, r_coil_ohm, current_a)
        ca = normalise_pair(fa, fc, na, nc, foot_a, foot_c, r_coil_ohm, current_a)
        norms_by_gap[gs] = dict(B_over_A=ba, C_over_B=cb, C_over_A=ca)

        findings.extend(findings_for_pair(ba, pair_name=f"B/A@{g}µm"))
        # C vs B: Tony's ~25% length claim
        findings.extend(findings_for_pair(
            cb, pair_name=f"C/B@{g}µm",
            length_claim_ratio=tony_c_over_b_length if g == 60 else None))

    # Detent method honesty on variant A @ 60 µm if by_gap present
    detent = study.get("targets_mn", {}).get("detent", 11.127)
    det_findings = []
    if "by_gap" in va:
        rows = va["by_gap"].get("60") or va["by_gap"].get(60)
        if rows:
            est = current_for_force(rows, detent)
            summary_i = va["summary"]["60"].get("i_for_detent_a")
            if est["method"].startswith("extrapolate") and summary_i is not None:
                det_findings.append(dict(
                    code="EXTRAPOLATION_PRESENTED_AS_BRACKET",
                    severity="HARD",
                    pair="detent@60µm",
                    detail=(
                        f"Detent {detent} mN is above the sweep; honest method "
                        f"is {est['method']} (I*≈{est['current_a']:.3f} A), "
                        f"but summary stores a finite i_for_detent_a="
                        f"{summary_i}."
                    ),
                    client_safe_line=(
                        "Say 'above sweep; linear extrapolation ≈X A "
                        "(optimistic lower bound)' — never 'interpolated'."
                    ),
                ))
            elif est["method"].startswith("extrapolate") and summary_i is None:
                # Correctly stored as None — OK, but record the optimistic I*
                det_findings.append(dict(
                    code="EXTRAPOLATION_AVAILABLE",
                    severity="INFO",
                    pair="detent@60µm",
                    detail=(
                        f"Detent above sweep; optimistic linear I*="
                        f"{est['current_a']:.3f} A. Summary correctly has null."
                    ),
                    client_safe_line=est["note"],
                    optimistic_i_a=est["current_a"],
                ))

    hard = [f for f in findings + det_findings if f["severity"] == "HARD"]
    return dict(
        ok=len(hard) == 0,
        # ok=False when HARD findings exist that would block a *naive* claim.
        # For shipping, HARD findings are WARNINGS that must appear as the
        # client_safe_line — they do not mean the FE is wrong.
        hard_findings=hard,
        all_findings=findings + det_findings,
        norms_by_gap=norms_by_gap,
        required_client_lines=[f["client_safe_line"] for f in hard],
    )


def _window(lines: list[str], idx: int, radius: int = 2) -> str:
    lo = max(0, idx - radius)
    hi = min(len(lines), idx + radius + 1)
    return "\n".join(lines[lo:hi]).lower()


def assert_claim_text_safe(text: str, audit: dict[str, Any]) -> list[str]:
    """Scan client-facing prose for forbidden absolute-only patterns.

    Scans per-line *windows* so a harmless "pole foot" column header elsewhere
    cannot mask a bad absolute-only rebuttal sentence.

    Returns list of violations (empty = safe).
    """
    violations = []
    lines = text.splitlines()
    low_lines = [ln.lower() for ln in lines]

    coil_hits = [f for f in audit["hard_findings"]
                 if f["code"] == "COIL_COUNT_ARTEFACT" and "60" in f["pair"]]
    if coil_hits:
        for i, ln in enumerate(low_lines):
            if "four-phase" not in ln and "four phase" not in ln:
                continue
            if "help" not in ln and "+33" not in ln and "133%" not in ln:
                continue
            win = _window(low_lines, i)
            if "per coil" in win or "coil count" in win or "extra coil" in win \
                    or "4/3" in win or "extra tooth" in win:
                continue
            violations.append(
                f"Line {i+1}: multiphase force gain without coil-count / "
                f"per-coil attribution (COIL_COUNT_ARTEFACT active): {lines[i][:100]}")
            break

    length_hits = [f for f in audit["hard_findings"]
                   if f["code"] == "LENGTH_NORM_CONTRADICTS_ABSOLUTE"]
    if length_hits:
        for i, ln in enumerate(low_lines):
            # absolute-only rebuttal of ~25%
            rebuts = (
                ("25%" in ln and "not" in ln) or
                ("7%" in ln and "25%" in ln) or
                ("milder than" in ln and ("25" in ln or "guess" in ln)) or
                ("says ~7%" in ln or "says ~7 %" in ln or
                 "fe says ~7" in ln or "finite element says ~7" in ln)
            )
            if not rebuts and not (
                    "7%" in ln and i + 1 < len(low_lines)
                    and "25%" in low_lines[i + 1]):
                # also catch "costs only 7% … not the 25%"
                if not ("7%" in ln and "25%" in _window(low_lines, i, 1)):
                    continue
            win = _window(low_lines, i, radius=2)
            # GOTCHA: do NOT treat "teeth per pole" + "pole foot" as a
            # length-normalised force story — require an explicit density cue.
            density_cues = (
                "per mm", "mN/mm", "mn/mm",
                "per millimetre", "per millimeter",
                "force per millimetre", "force per millimeter",
                "mm of pole foot", "mm of pole-foot",
                "force density", "per unit length", "per unit pole",
            )
            if any(cue in win for cue in density_cues):
                continue
            violations.append(
                f"Line {i+1}: absolute-only rebuttal of ~25% length claim "
                f"(LENGTH_NORM active): {lines[i][:100]}")
            break

    for i, ln in enumerate(low_lines):
        if "interpolat" in ln and ("detent" in ln or "current" in ln):
            win = _window(low_lines, i, radius=3)
            if "60" not in win and "60 µm" not in text.lower():
                continue
            if "extrapo" in win or "above the sweep" in win or \
                    "above sweep" in win or "not reached" in win:
                continue
            if any(f["code"].startswith("EXTRAPOLATION")
                   for f in audit["all_findings"]):
                violations.append(
                    f"Line {i+1}: detent current described as interpolated "
                    f"but target is above the sweep: {lines[i][:100]}")
                break
    return violations


def enrich_study_comparisons(study: dict[str, Any]) -> dict[str, Any]:
    """Add normalised comparisons + guard block into study dict (in place)."""
    audit = audit_study(study)
    study.setdefault("comparisons", {})
    study["comparisons"]["normalised_at_0_40A"] = {
        g: {
            k: {kk: (round(vv, 4) if isinstance(vv, float) else vv)
                for kk, vv in pair.items()}
            for k, pair in gap.items()
        }
        for g, gap in audit["norms_by_gap"].items()
    }
    study["comparisons"]["force_claim_guards"] = dict(
        hard_findings=audit["hard_findings"],
        required_client_lines=audit["required_client_lines"],
        info_findings=[f for f in audit["all_findings"]
                       if f["severity"] == "INFO"],
    )
    return audit


# ---------------------------------------------------------------------------
# Selftest — adversarial fixtures that reproduce the overnight pack bugs
# ---------------------------------------------------------------------------

def _fixture_tony_pack_bug() -> dict[str, Any]:
    """Synthetic study mirroring the numbers that shipped the bad claims."""
    def summary(fa, fb, fc, foot_a=0.849, foot_b=1.515, foot_c=1.099):
        # only need 60 for the HARD catches; fill others similarly scaled
        return {
            "60": dict(force_at_0_40_a_mn=fa, pole_foot_mm=foot_a,
                       i_for_detent_a=None),
            "40": dict(force_at_0_40_a_mn=fa * 2.02, pole_foot_mm=foot_a,
                       i_for_detent_a=0.92),
            "20": dict(force_at_0_40_a_mn=fa * 4.75, pole_foot_mm=foot_a,
                       i_for_detent_a=0.57),
        }

    # Exact overnight numbers at 60 µm
    fa, fb, fc = 1.0961, 1.4606, 1.3537
    return dict(
        gaps_um=[60, 40, 20],
        targets_mn=dict(detent=11.127),
        variants=dict(
            A_three_phase_3_teeth=dict(
                meta=dict(n_pole_teeth=3, phases=3, label="A"),
                summary=summary(fa, fb, fc),
                by_gap={"60": [
                    dict(current_a=0.4, force_mn=1.0961),
                    dict(current_a=1.0, force_mn=6.5505),
                    dict(current_a=1.2, force_mn=8.6192),
                ]},
            ),
            B_four_phase_4_teeth=dict(
                meta=dict(n_pole_teeth=4, phases=4, label="B"),
                summary={
                    g: dict(force_at_0_40_a_mn=v,
                            pole_foot_mm=1.515,
                            i_for_detent_a=None)
                    for g, v in (("60", fb), ("40", 2.5207), ("20", 5.2925))
                },
            ),
            C_four_phase_3_teeth=dict(
                meta=dict(n_pole_teeth=3, phases=4, label="C"),
                summary={
                    g: dict(force_at_0_40_a_mn=v,
                            pole_foot_mm=1.099,
                            i_for_detent_a=None)
                    for g, v in (("60", fc), ("40", 2.4208), ("20", 5.1671))
                },
            ),
        ),
    )


def selftest() -> int:
    print("force_claim_guards --selftest")
    fails = 0

    def check(name: str, ok: bool, detail: str = ""):
        nonlocal fails
        if not ok:
            fails += 1
        print(f"  {'PASS' if ok else 'FAIL'}  {name}"
              f"{'  — ' + detail if detail else ''}")

    # --- unit: current_for_force method labels ---
    rows = [dict(current_a=0.4, force_mn=1.0),
            dict(current_a=1.0, force_mn=6.0),
            dict(current_a=1.2, force_mn=8.0)]
    br = current_for_force(rows, 5.0)
    check("bracket inside sweep", br["method"] == "bracket", br["method"])
    ex = current_for_force(rows, 11.13)
    check("extrapolate above sweep",
          ex["method"] == "extrapolate_linear_optimistic", ex["method"])
    check("extrapolate I* > 1.2", ex["current_a"] is not None
          and ex["current_a"] > 1.2, f"{ex['current_a']}")

    # --- adversarial: overnight pack numbers ---
    study = _fixture_tony_pack_bug()
    audit = audit_study(study)
    codes = {f["code"] for f in audit["hard_findings"]}
    check("proveCatch COIL_COUNT_ARTEFACT on B/A@60",
          "COIL_COUNT_ARTEFACT" in codes, str(codes))
    check("proveCatch LENGTH_NORM_CONTRADICTS_ABSOLUTE on C/B@60",
          "LENGTH_NORM_CONTRADICTS_ABSOLUTE" in codes, str(codes))

    # Bad prose must be caught
    bad_prose = (
        "Four-phase helps ~+33% force at 60 µm. Three-tooth poles cost "
        "only ~7% force, not Tony's 25%."
    )
    viol = assert_claim_text_safe(bad_prose, audit)
    check("proveCatch bad prose fires ≥2 violations",
          len(viol) >= 2, str(viol))

    # Good prose (what overnight reply now says) must pass
    good_prose = (
        "At 60 micrometres absolute B/A = 1.333 (= coil count 4/3); force "
        "per coil identical — the extra force is the extra tooth/coil. "
        "Dropping the fourth tooth: absolute −7%; on force per millimetre "
        "of pole foot, three-tooth is denser (~+28%), in line with a ~25% "
        "length-normalised estimate. Detent at 60 µm is above the sweep; "
        "linear extrapolation is an optimistic lower bound."
    )
    viol_ok = assert_claim_text_safe(good_prose, audit)
    check("good prose clean", viol_ok == [], str(viol_ok))

    # Happy path: equal teeth, genuine per-coil gain, feet equal → no HARD
    clean = dict(
        gaps_um=[60],
        targets_mn=dict(detent=5.0),
        variants=dict(
            A_three_phase_3_teeth=dict(
                meta=dict(n_pole_teeth=3),
                summary={"60": dict(force_at_0_40_a_mn=1.0, pole_foot_mm=1.0,
                                    i_for_detent_a=0.5)},
                by_gap={"60": [dict(current_a=0.4, force_mn=1.0),
                               dict(current_a=1.0, force_mn=6.0)]},
            ),
            B_four_phase_4_teeth=dict(
                # rename conceptually: same 3 teeth, more force per coil
                meta=dict(n_pole_teeth=3),
                summary={"60": dict(force_at_0_40_a_mn=1.3, pole_foot_mm=1.0,
                                    i_for_detent_a=0.5)},
            ),
            C_four_phase_3_teeth=dict(
                meta=dict(n_pole_teeth=3),
                summary={"60": dict(force_at_0_40_a_mn=1.25, pole_foot_mm=1.0,
                                    i_for_detent_a=0.5)},
            ),
        ),
    )
    # B and C both 3 teeth — no coil-count artefact; feet equal — no length flag
    audit_clean = audit_study(clean)
    hard_clean = [f for f in audit_clean["hard_findings"]
                  if f["code"] in ("COIL_COUNT_ARTEFACT",
                                   "LENGTH_NORM_CONTRADICTS_ABSOLUTE")]
    check("clean equal-foot pack has no coil/length HARD",
          hard_clean == [], str(hard_clean))

    print(f"\n{fails} failure(s)" if fails else "\nALL PASS")
    return 1 if fails else 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--audit-study", metavar="JSON",
                    help="audit a tony-phase-material-study.json")
    ap.add_argument("--check-prose", metavar="PATH",
                    help="also scan a markdown/prose file for forbidden claims")
    args = ap.parse_args(argv)
    if args.selftest:
        return selftest()
    if args.audit_study:
        study = json.load(open(args.audit_study))
        audit = enrich_study_comparisons(study)
        print(json.dumps(dict(
            hard=len(audit["hard_findings"]),
            findings=audit["all_findings"],
            required_client_lines=audit["required_client_lines"],
        ), indent=2))
        if args.check_prose:
            text = open(args.check_prose).read()
            viol = assert_claim_text_safe(text, audit)
            if viol:
                print("PROSE VIOLATIONS:", file=sys.stderr)
                for v in viol:
                    print(f"  • {v}", file=sys.stderr)
                return 2
            print("prose OK")
        return 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
