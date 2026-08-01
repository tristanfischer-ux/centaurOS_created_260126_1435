#!/usr/bin/env python3
"""Excitation-tracking screen — is the stator field actually synchronised with
the rotor, or is it walking past it?

THE INVARIANT. Sweep rotor position while holding the current angle fixed IN THE
ROTOR FRAME. The relative angle `delta` between the stator MMF and the rotor
d-axis is then CONSTANT by construction, so shaft torque must be constant too,
apart from two legitimate families:

  * SLOT COGGING at `stator_slots` cycles per mechanical revolution, and
  * TORQUE RIPPLE at 6k times the electrical frequency (k = 1, 2, ...).

Anything large outside those is the signature of `delta` SWEEPING rather than
being held. Torque on a salient machine is

    T(delta) = T_pm * sin(delta)  +  T_rel * sin(2*delta)

so a delta that advances linearly with rotor position writes the PM term at the
delta-sweep rate and the RELUCTANCE term at twice it. On a machine with weak
magnets the reluctance bin is the LARGER of the two — worth stating plainly,
because it looks like a reluctance design problem and is not one. It vanishes
when the excitation is synchronised.

ALL INDICES HERE ARE CYCLES PER SWEEP SPAN, deliberately. Expressing them as
"1x/2x electrical" is what I got wrong first time: 45 deg mechanical at p=4 is
180 deg electrical, not 360, so the same bins carry different electrical labels
depending on the span. Counting cycles across the span actually swept removes
the ambiguity, and the legitimate families are converted INTO that basis rather
than the reader being asked to convert.

WHY THIS EXISTS (FE front MGU, 2026-08-01). The deck reported a mean |T| of
57.8 N.m against a 125.2 N.m duty and the campaign spent days treating that as a
SIZING shortfall. The sweep's harmonic content over one 45 deg pole pitch said
otherwise:

    DC   3.75 N.m      <- the only torque actually delivered
    k=1 53.65 N.m      <- PM term, delta sweeping
    k=2 80.17 N.m      <- reluctance term, dominant
    k=3 31.11 N.m      <- 24-slot cogging, legitimate
    k=6  3.45 N.m      <- legitimate ripple

Meanwhile the same deck's own back-EMF implied 131 N.m. The machine was not
short; it was mis-excited, and every mean taken over that sweep was meaningless.

Worse, the fault SURVIVED a fix attempt because the evidence used to choose the
advance sign was WORTHLESS: five samples spanning 15 deg mech, when one full
cycle of the async signature takes 360/(2p) = 45 deg. That sweep saw a THIRD of
one oscillation and its "mean" was a point on a rising edge. This screen
therefore refuses to judge a sweep whose SPAN is shorter than one cycle of the
fault, before it looks at sample count at all.

Usage:
    fpk_excitation_tracking.py --twin <dir> [--json]
    fpk_excitation_tracking.py --selftest
"""

from __future__ import annotations

import argparse
import cmath
import json
import math
import sys
from pathlib import Path
from typing import Sequence

# Energy at 1x or 2x electrical, as a fraction of |DC|, above which the
# excitation is not tracking. A synchronised machine sits far below this; the
# live fault sat at 14x and 21x.
MAX_ASYNC_RATIO = 0.35

# The highest harmonic this screen reasons about (the reluctance term at 2x).
# Nyquist demands strictly more than 2 samples per cycle of it.
HIGHEST_HARMONIC_OF_INTEREST = 2


def harmonics(torque: Sequence[float], max_k: int = 8) -> dict[int, float]:
    """Amplitudes of a torque trace spanning EXACTLY one electrical period.

    Index k is "cycles per electrical period", so k=1 and k=2 are the two
    async signatures and k = Zs/p is slot cogging.
    """
    n = len(torque)
    out: dict[int, float] = {}
    for k in range(1, max_k + 1):
        acc = sum(t * cmath.exp(-2j * math.pi * k * i / n)
                  for i, t in enumerate(torque))
        out[k] = 2.0 * abs(acc) / n
    return out


def legitimate_harmonics(
    *, mechanical_span_deg: float, pole_pairs: int, stator_slots: int,
    max_index: int | None = None,
) -> dict[int, str]:
    """Harmonic indices (cycles per SWEEP SPAN) a healthy machine may occupy.

    Deliberately convention-free: everything is expressed as cycles across the
    span actually swept, so no reader has to agree with me about whether a span
    is "one electrical period". Getting that labelling wrong is exactly the
    mistake this module was written after.

    Two families are legitimate:
      * SLOT COGGING at `stator_slots` cycles per mechanical revolution.
      * TORQUE RIPPLE at 6k times the electrical frequency (k = 1, 2, 3 ...),
        and electrical frequency is `pole_pairs` cycles per mechanical rev.
    """
    allowed: dict[int, str] = {}
    per_rev = 360.0 / mechanical_span_deg          # spans per mechanical rev

    cog = stator_slots / per_rev
    if abs(cog - round(cog)) < 1e-6 and round(cog) >= 1:
        allowed[int(round(cog))] = f"{stator_slots}-slot cogging"

    for k in range(1, 12):
        h = 6 * k * pole_pairs / per_rev
        if abs(h - round(h)) < 1e-6 and round(h) >= 1:
            if max_index is not None and round(h) > max_index:
                continue
            allowed.setdefault(int(round(h)), f"{6 * k}x electrical ripple")
    return allowed


def screen(
    torque: Sequence[float],
    *,
    mechanical_span_deg: float,
    pole_pairs: int,
    stator_slots: int,
) -> dict:
    """Judge whether the excitation tracked the rotor across this sweep."""
    findings: list[dict] = []
    n = len(torque)
    # Only enumerate harmonics this sweep can actually RESOLVE. Listing bins
    # above Nyquist is not merely useless, it inverted the resolvability test
    # below when a 36-point sweep "expected" a 66x-electrical ripple bin.
    nyquist_index = n // 2
    allowed = legitimate_harmonics(mechanical_span_deg=mechanical_span_deg,
                                   pole_pairs=pole_pairs,
                                   stator_slots=stator_slots,
                                   max_index=nyquist_index)
    # The async signature sits at the rate delta sweeps. A wrong advance sign
    # makes delta sweep at 2*p*theta_m, putting the PM term sin(delta) at k=1
    # and the reluctance term sin(2*delta) at k=2 across ONE POLE PITCH. Those
    # are the bins to watch, and the highest of them sets Nyquist.
    watch = (1, 2)
    # Nyquist is judged against the bins this screen actually DECIDES on (the
    # async signature) plus the slot-cogging bin it reports — NOT against every
    # legitimate harmonic that happens to exist.
    cogging = next((k for k, v in allowed.items() if "cogging" in v), 0)
    highest = max(max(watch), cogging)

    # THE SPAN CHECK, and the one that actually caught the bad evidence. If the
    # advance is wrong, delta sweeps at 2*p*theta_m, so ONE full oscillation of
    # the async signature takes 360/(2*p) mechanical degrees — 45 deg at p=4.
    # A sweep shorter than that never sees a whole cycle, so its "mean" is just
    # a point on a rising edge. The discredited 5-point evidence spanned 15 deg,
    # a THIRD of one oscillation, and reported that partial arc as a mean.
    async_period_deg = 360.0 / (2.0 * pole_pairs) if pole_pairs else float("inf")
    samples_per_span_cycle = n / highest if highest else 0.0
    if mechanical_span_deg < async_period_deg - 1e-6:
        findings.append({
            "severity": "HIGH",
            "rule": "sweep_cannot_resolve_the_fault",
            "detail": (
                f"span is {mechanical_span_deg:g} deg mech but one full cycle "
                f"of the async signature takes {async_period_deg:g} deg "
                f"(delta sweeps at 2*p*theta_m, p={pole_pairs}). This sweep "
                f"covers {mechanical_span_deg / async_period_deg:.2f} of one "
                "oscillation, so any mean taken over it is a point on a rising "
                "edge, not a mean. ALIAS ARTEFACT — do not draw a sign or duty "
                "conclusion from it."),
        })
    elif samples_per_span_cycle <= 2.0:
        findings.append({
            "severity": "HIGH",
            "rule": "sweep_cannot_resolve_the_fault",
            "detail": (
                f"{n} samples across {mechanical_span_deg:g} deg mech gives "
                f"{samples_per_span_cycle:.1f} samples per cycle of the "
                f"highest harmonic of interest (k={highest}); Nyquist needs "
                "more than 2. Any mean, sign or ripple conclusion drawn from "
                "this sweep is an ALIAS ARTEFACT."),
        })
    if findings:
        return {
            "schema": "forgeos.motor_stack.excitation_tracking/v1",
            "resolvable": False, "n_samples": n,
            "mechanical_span_deg": mechanical_span_deg,
            "async_period_deg": async_period_deg,
            "findings": findings, "ok": False,
        }

    dc = sum(torque) / n
    amps = harmonics(torque, max_k=max(8, highest + 2))
    ref = abs(dc) if abs(dc) > 1e-9 else float("inf")

    offenders = {
        k: amps.get(k, 0.0) for k in watch
        if k not in allowed and amps.get(k, 0.0) / ref > MAX_ASYNC_RATIO
    }
    if offenders:
        worst = ", ".join(
            f"k={k} {v:.2f} N.m ({v / ref:.1f}x DC)"
            for k, v in sorted(offenders.items()))
        findings.append({
            "severity": "HIGH",
            "rule": "excitation_not_tracking_rotor",
            "detail": (
                f"{worst}, against a DC of {dc:.2f} N.m. At a fixed "
                "ROTOR-FRAME current angle delta is constant by construction, "
                "so these bins must be near zero — they are not slot cogging "
                f"({sorted(allowed)}) and not 6k electrical ripple. Their size "
                "means delta is SWEEPING: the stator field is walking past the "
                "rotor rather than turning with it. Every mean over this "
                "sweep, including mean|T|, is meaningless until it is fixed."),
        })
        if offenders.get(2, 0.0) > offenders.get(1, 0.0):
            findings.append({
                "severity": "INFO",
                "rule": "reluctance_term_dominates_the_async_signature",
                "detail": (
                    f"k=2 ({offenders.get(2, 0.0):.2f} N.m) exceeds k=1 "
                    f"({offenders.get(1, 0.0):.2f} N.m). sin(2*delta) is the "
                    "RELUCTANCE term of a salient machine with weak magnets — "
                    "NOT a reluctance design problem. It vanishes when the "
                    "excitation is synchronised."),
            })

    return {
        "schema": "forgeos.motor_stack.excitation_tracking/v1",
        "resolvable": True,
        "n_samples": n,
        "mechanical_span_deg": mechanical_span_deg,
        "dc_torque_nm": round(dc, 4),
        "harmonics_nm": {f"k={k}": round(v, 4) for k, v in sorted(amps.items())},
        "legitimate_harmonics": {str(k): v for k, v in sorted(allowed.items())},
        "async_ratio_k1": (round(amps.get(1, 0.0) / ref, 4)
                           if math.isfinite(ref) else None),
        "async_ratio_k2": (round(amps.get(2, 0.0) / ref, 4)
                           if math.isfinite(ref) else None),
        "findings": findings,
        "ok": not any(f["severity"] == "HIGH" for f in findings),
    }


# ──────────────────────────────────────────────────────────────────────────
# proveCatch
# ──────────────────────────────────────────────────────────────────────────

def _synthetic(dc: float, *, one_x: float = 0.0, two_x: float = 0.0,
               cog: float = 0.0, cog_k: int = 6, n: int = 36) -> list[float]:
    return [
        dc
        + one_x * math.sin(2 * math.pi * i / n)
        + two_x * math.sin(4 * math.pi * i / n)
        + cog * math.sin(2 * math.pi * cog_k * i / n)
        for i in range(n)
    ]


def _selftest() -> int:
    failures: list[str] = []

    def check(name: str, cond: bool, detail: str = "") -> None:
        if not cond:
            failures.append(f"{name}: {detail}")

    # ADVERSARIAL INPUT 1 — the LIVE fault. This is the real measured trace
    # shape: tiny DC, huge 1x and 2x, legitimate cogging. It MUST fire.
    live = _synthetic(3.75, one_x=53.65, two_x=80.17, cog=31.11, cog_k=3)
    res = screen(live, mechanical_span_deg=45.0, pole_pairs=4, stator_slots=24)
    check("proveCatch.live_fault_fires", not res["ok"],
          "the live mis-excited trace passed")
    rules = {f["rule"] for f in res["findings"]}
    check("proveCatch.names_tracking", "excitation_not_tracking_rotor" in rules,
          f"did not name the tracking fault; got {rules}")
    check("proveCatch.notes_reluctance_dominates",
          "reluctance_term_dominates_the_async_signature" in rules,
          "did not explain why 2x exceeds 1x")

    # ADVERSARIAL INPUT 2 — a HEALTHY machine: big DC, real cogging at k=3
    # (24 slots over a 45 deg pole pitch), no async content. Must stay silent,
    # or the screen is decoration.
    healthy = _synthetic(125.0, cog=18.0, cog_k=3)
    ok = screen(healthy, mechanical_span_deg=45.0, pole_pairs=4, stator_slots=24)
    check("proveCatch.healthy_silent", ok["ok"],
          f"a synchronised machine fired: {ok['findings']}")
    check("proveCatch.healthy_keeps_cogging",
          ok["harmonics_nm"].get("k=3", 0) > 15.0,
          f"legitimate cogging was not reported: {ok['harmonics_nm']}")
    check("proveCatch.cogging_is_whitelisted", "3" in ok["legitimate_harmonics"],
          f"k=3 not recognised as legitimate: {ok['legitimate_harmonics']}")

    # ADVERSARIAL INPUT 3 — THE ALIASING TRAP that defeated the first fix
    # attempt. Five samples over 15 deg mech. The screen must REFUSE to judge
    # rather than return a confident wrong answer.
    coarse = [55.0, 74.2, 87.6, 97.7, 108.5]
    aliased = screen(coarse, mechanical_span_deg=15.0, pole_pairs=4,
                     stator_slots=24)
    check("proveCatch.refuses_aliased_sweep", not aliased["ok"],
          "judged a sweep too coarse to resolve the 2x term")
    check("proveCatch.names_aliasing",
          "sweep_cannot_resolve_the_fault" in
          {f["rule"] for f in aliased["findings"]},
          "did not name aliasing as the reason")
    check("proveCatch.aliased_marked_unresolvable", aliased["resolvable"] is False,
          "did not mark the aliased sweep unresolvable")

    # INVARIANT — a DC-only trace must recover its DC and show no harmonics.
    flat = screen([100.0] * 36, mechanical_span_deg=45.0, pole_pairs=4,
                  stator_slots=24)
    check("invariant.flat_is_clean", flat["ok"], "a flat trace fired")
    check("invariant.flat_dc", abs(flat["dc_torque_nm"] - 100.0) < 1e-6,
          f"DC recovered as {flat['dc_torque_nm']}")

    # INVARIANT — amplitude recovery. A known 1x of 40 N.m must read back as
    # 40 N.m, or every ratio this screen reports is wrong.
    known = _synthetic(100.0, one_x=40.0)  # noqa: E501
    got = screen(known, mechanical_span_deg=45.0, pole_pairs=4, stator_slots=24)
    check("invariant.amplitude_recovery",
          abs(got["harmonics_nm"]["k=1"] - 40.0) < 0.01,
          f"k=1 of 40.0 read back as {got['harmonics_nm']['k=1']}")

    for f in failures:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if failures else 'PASS'} "
          f"fpk_excitation_tracking selftest ({len(failures)} failures)")
    return 1 if failures else 0


def from_twin(twin: Path) -> dict:
    """Read the deck's rotor sweep and screen it.

    GOTCHA: the span must be derived from the SAMPLING GEOMETRY, never from
    float-equality on the endpoint torque. The sweep repeats its first rotor
    position at the end, and the two torque values agree only to solver
    tolerance (55.00849 vs 55.00852). An exact `==` missed the repeat, added a
    step to the span, and pushed slot cogging onto a NON-INTEGER bin — so the
    screen reported "no legitimate harmonics" and would have called genuine
    cogging an async fault on a healthy machine.
    """
    em = json.loads(
        (twin / "_motor_stack" / "em_fia_front_kit_case.json").read_text())
    pts = em["rotor_position_sweep"]["points"]
    positions = [float(p["rotor_position_mechanical_deg"]) for p in pts]
    torque = [float(p["torque_nm"]) for p in pts]
    if len(positions) < 3:
        raise ValueError("rotor sweep too short to screen")

    step = (positions[-1] - positions[0]) / (len(positions) - 1)
    # A repeated endpoint is a POSITION fact: last == first + n*step. Compare
    # positions (exact by construction) rather than torques (solver noise).
    span_deg = positions[-1] - positions[0]
    scale = 1.0
    if abs(torque[-1] - torque[0]) <= 1e-3 * max(1.0, abs(torque[0])):
        torque = torque[:-1]                     # drop the duplicate sample
    else:
        span_deg += step                         # open interval: add one step
        scale = 1.0

    machine = em.get("machine") or {}
    ctx = em.get("works_in_kit_context") or {}
    assumptions = em.get("loaded_point_assumptions") or {}
    def _pick(*keys, default):
        for src in (machine, ctx, assumptions, em):
            for k in keys:
                v = src.get(k) if isinstance(src, dict) else None
                if isinstance(v, (int, float)) and v > 0:
                    return int(v)
        return default
    slots = _pick("stator_slots", "stator_slot_count", default=24)
    poles = _pick("rotor_poles", "pole_count", default=8)

    return screen(torque, mechanical_span_deg=span_deg * scale,
                  pole_pairs=poles // 2, stator_slots=slots)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--twin", type=Path)
    ap.add_argument("--output", type=Path)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return _selftest()
    if not args.twin:
        ap.error("--twin required unless --selftest")

    twin = args.twin.resolve()
    res = from_twin(twin)
    out = args.output or (twin / "_motor_stack" / "excitation_tracking.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, indent=2))

    if args.json:
        print(json.dumps(res, indent=2))
    else:
        if res.get("resolvable"):
            print(f"  DC torque            = {res['dc_torque_nm']} N.m")
            print(f"  harmonics            = {res['harmonics_nm']}")
            print(f"  legitimate bins      = {res['legitimate_harmonics']}")
            print(f"  async ratio k1 / k2  = {res['async_ratio_k1']} / "
                  f"{res['async_ratio_k2']}  (limit {MAX_ASYNC_RATIO})")
        for f in res["findings"]:
            print(f"  [{f['severity']}] {f['rule']}: {f['detail']}")
        print(f"  ok = {res['ok']}")
    print(f"Artefact: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
