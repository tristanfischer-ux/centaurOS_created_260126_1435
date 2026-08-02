#!/usr/bin/env python3
"""Claim-provenance gate — a quantitative claim may not ship without a FRESH
artefact behind it.

THE DIAGNOSIS THIS ENFORCES (Cursor, 2026-08-01, and it is right):

    "It uses the stack when it remembers or when you poke it, then races ahead
     on the exciting bug. Coverage is a REPORT, not a GATE. Same class of
     Goodhart as 'we have a gate' without proveCatch + enforce."

    "Claude's context is episodic. Docs, MEMORY, and a coverage script it can
     choose not to run will always lose to 'I'm mid-debug'. The only durable fix
     is: a quantitative claim must not ship without a FRESH solver artefact —
     enforced."

Everything softer than a hard stop has already been tried on this engine and has
already failed. A document that says "run the solvers" loses to a live bug. A
coverage report that says `ok: false` and exits 0 changes nothing. So this gate
does the one thing that survives a distracted agent: it REFUSES.

WHAT IT CHECKS. For each load-bearing claim you register:
  1. An artefact backs it AT ALL (named file exists).
  2. That artefact is FRESH — newer than every input it depends on. A solver
     result computed before the source rule changed is not evidence.
  3. The claimed VALUE actually appears in the artefact, at the key stated.
     "I ran the solver" is not the same as "the solver produced this number",
     and hand-carried numbers are exactly how a stale figure survives a re-run.

On failure it emits a PUNCHLIST naming the scripts to run, because a gate that
blocks without routing the fix is half a gate.

UNIVERSAL: nothing here knows about motors, this repo, or any archetype. It
takes claims, artefact paths and dependency paths.

Usage:
    claim_provenance_gate.py --claims <claims.json> [--enforce]
    claim_provenance_gate.py --selftest
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Claim:
    """One load-bearing number and the artefact that must justify it."""

    name: str
    value: float
    artefact: Path
    key_path: str                      # dotted path to the value in the artefact
    depends_on: list[Path] = field(default_factory=list)
    tolerance: float = 1e-6             # RELATIVE tolerance
    abs_tolerance: float = 0.0          # absolute floor; opt-in, NOT the same
                                        # number as `tolerance` — see compare
    run_to_fix: str = ""                # the command that regenerates it


def _dig(obj, dotted: str):
    """Fetch a dotted path, walking dicts and list indices."""
    cur = obj
    for part in dotted.split("."):
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
                continue
            except (ValueError, IndexError):
                return None
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def check(claim: Claim, *, now_mtime: float | None = None) -> dict:
    """Judge one claim. Returns a finding dict; `ok` False means it must block."""
    if not claim.artefact.exists():
        return {"claim": claim.name, "ok": False, "reason": "NO_ARTEFACT",
                "detail": f"nothing backs this claim: {claim.artefact} is absent",
                "run_to_fix": claim.run_to_fix}

    art_mtime = claim.artefact.stat().st_mtime
    # FAIL-OPEN FIXED (Sol, pre-commit council 2026-08-01): a dependency that
    # does NOT exist used to be silently skipped, so a typo in depends_on — or a
    # file someone moved — turned the freshness check off without telling
    # anyone. A gate that quietly stops checking is worse than no gate.
    absent = [str(d) for d in claim.depends_on if not d.exists()]
    if absent:
        return {"claim": claim.name, "ok": False, "reason": "DEPENDENCY_MISSING",
                "detail": ("declared inputs do not exist, so freshness cannot be "
                           "established: " + ", ".join(absent)),
                "run_to_fix": claim.run_to_fix}
    stale_against = [str(d) for d in claim.depends_on
                     if d.stat().st_mtime > art_mtime]
    if stale_against:
        return {"claim": claim.name, "ok": False, "reason": "STALE_ARTEFACT",
                "detail": ("the artefact predates its inputs, so it describes a "
                           "machine that no longer exists: newer than it are "
                           + ", ".join(stale_against)),
                "run_to_fix": claim.run_to_fix}

    try:
        payload = json.loads(claim.artefact.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        return {"claim": claim.name, "ok": False, "reason": "UNREADABLE_ARTEFACT",
                "detail": f"{type(exc).__name__}: {exc}",
                "run_to_fix": claim.run_to_fix}

    found = _dig(payload, claim.key_path)
    if found is None:
        return {"claim": claim.name, "ok": False, "reason": "KEY_ABSENT",
                "detail": (f"'{claim.key_path}' is not in the artefact — the "
                           "claim was not produced by this solver run"),
                "run_to_fix": claim.run_to_fix}
    try:
        found_f = float(found)
    except (TypeError, ValueError):
        return {"claim": claim.name, "ok": False, "reason": "KEY_NOT_NUMERIC",
                "detail": f"'{claim.key_path}' holds {found!r}",
                "run_to_fix": claim.run_to_fix}

    # ⭐⭐ A RELATIVE TOLERANCE IS NOT AN ABSOLUTE ONE (2026-08-02). This passed
    # `claim.tolerance` as BOTH rel_tol and abs_tol, so a 0.05 tolerance meant
    # "within 5% OR within 0.05 in absolute units". For flux linkage — a
    # quantity of order 0.0015 to 0.03 Wb — the absolute arm could never fail,
    # and `lambda_pm_fundamental_wb` reported BACKED while the claim (0.002903)
    # was exactly TWICE the artefact (0.0014514). The gate that exists to catch
    # hand-carried numbers was, for small quantities, incapable of catching one.
    # abs_tolerance is now a SEPARATE, opt-in field defaulting to zero, so a
    # relative tolerance stays relative.
    if not math.isclose(found_f, claim.value, rel_tol=claim.tolerance,
                        abs_tol=claim.abs_tolerance):
        return {"claim": claim.name, "ok": False, "reason": "VALUE_MISMATCH",
                "detail": (f"claimed {claim.value}, artefact says {found_f} — a "
                           "hand-carried number, or the artefact moved on"),
                "run_to_fix": claim.run_to_fix}

    return {"claim": claim.name, "ok": True, "reason": "BACKED",
            "detail": f"{claim.key_path} = {found_f} in {claim.artefact.name}"}


def evaluate(claims: list[Claim]) -> dict:
    # FAIL-OPEN FIXED: an EMPTY registry used to return ok=True. "No claims are
    # registered" is not "every claim is backed" — it is the state a distracted
    # agent leaves behind, and it must not read as a pass.
    if not claims:
        return {"schema": "forgeos.claim_provenance_gate/v1", "n_claims": 0,
                "n_backed": 0,
                "findings": [{"claim": "<registry>", "ok": False,
                              "reason": "EMPTY_REGISTRY",
                              "detail": ("no claims registered — an empty "
                                         "registry is not evidence of anything"),
                              "run_to_fix": "register the load-bearing claims"}],
                "punchlist": ["register the load-bearing claims"], "ok": False}
    findings = [check(c) for c in claims]
    failed = [f for f in findings if not f["ok"]]
    punchlist = []
    for f in failed:
        cmd = f.get("run_to_fix")
        if cmd and cmd not in punchlist:
            punchlist.append(cmd)
    return {
        "schema": "forgeos.claim_provenance_gate/v1",
        "n_claims": len(claims),
        "n_backed": len(claims) - len(failed),
        "findings": findings,
        "punchlist": punchlist,
        "ok": not failed,
    }


def claims_from_json(path: Path) -> list[Claim]:
    raw = json.loads(path.read_text())
    base = path.parent
    out = []
    for c in raw["claims"]:
        out.append(Claim(
            name=c["name"], value=float(c["value"]),
            artefact=(base / c["artefact"]).resolve()
            if not Path(c["artefact"]).is_absolute() else Path(c["artefact"]),
            key_path=c["key_path"],
            # Resolve depends_on the SAME way as artefact — against the claims
            # file, not the process CWD. They used to differ, so the same
            # registry gave different verdicts depending on where it was run.
            depends_on=[(Path(d) if Path(d).is_absolute()
                         else (base / d).resolve())
                        for d in c.get("depends_on", [])],
            tolerance=float(c.get("tolerance", 1e-6)),
            run_to_fix=c.get("run_to_fix", "")))
    return out


def _selftest() -> int:
    import tempfile
    fails: list[str] = []

    def ck(name: str, cond: bool, detail: str = "") -> None:
        if not cond:
            fails.append(f"{name}: {detail}")

    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        art = d / "solver.json"
        art.write_text(json.dumps({"works": {"torque_nm": 42.5}}))
        dep = d / "source_rule.py"
        dep.write_text("x = 1")

        good = Claim("torque", 42.5, art, "works.torque_nm",
                     run_to_fix="python solver.py")

        # proveCatch 1 — a HONEST claim must pass, or the gate is noise.
        ck("proveCatch.backed_claim_passes", check(good)["ok"],
           "a correctly-backed claim was blocked")

        # proveCatch 2 — the claim this gate exists for: a number with NO
        # artefact behind it. This is "I'll run the solver later".
        missing = Claim("torque", 42.5, d / "absent.json", "works.torque_nm",
                        run_to_fix="python solver.py")
        r = check(missing)
        ck("proveCatch.no_artefact_blocks", not r["ok"] and r["reason"] == "NO_ARTEFACT")
        ck("proveCatch.routes_the_fix", r.get("run_to_fix") == "python solver.py",
           "blocked without saying what to run")

        # proveCatch 3 — STALE. The source rule changed after the solve, so the
        # artefact describes a machine that no longer exists. This is the exact
        # failure mode where a fix lands and the old number keeps being quoted.
        import os, time
        os.utime(art, (time.time() - 500, time.time() - 500))
        stale = Claim("torque", 42.5, art, "works.torque_nm", depends_on=[dep],
                      run_to_fix="python solver.py")
        r = check(stale)
        ck("proveCatch.stale_blocks", not r["ok"] and r["reason"] == "STALE_ARTEFACT",
           f"a stale artefact passed: {r}")

        # proveCatch 4 — HAND-CARRIED number. The solver ran, but the claim does
        # not match what it produced. This is how a pre-fix figure survives.
        os.utime(art, None)
        drifted = Claim("torque", 118.0, art, "works.torque_nm",
                        run_to_fix="python solver.py")
        r = check(drifted)
        ck("proveCatch.value_mismatch_blocks",
           not r["ok"] and r["reason"] == "VALUE_MISMATCH",
           f"a hand-carried number passed: {r}")

        # ⭐ proveCatch 4b — A RELATIVE TOLERANCE MUST STAY RELATIVE. The gate
        # used to pass `tolerance` as abs_tol too, so on a SMALL quantity the
        # absolute arm swallowed everything: a claim of 0.002903 Wb against an
        # artefact holding 0.0014514 Wb — exactly 2x, the parallel-path error
        # itself — reported BACKED under tolerance 0.05. A gate that cannot
        # fail on the very error it was built for is decoration.
        small = d / "small.json"
        small.write_text(json.dumps({"works": {"lambda_wb": 0.0014514}}))
        halved = Claim("lambda", 0.002903, small, "works.lambda_wb",
                       tolerance=0.05, run_to_fix="python sweep.py")
        r = check(halved)
        ck("proveCatch.small_quantity_2x_error_blocks",
           not r["ok"] and r["reason"] == "VALUE_MISMATCH",
           f"a 2x error on a small quantity passed: {r}")
        # ...and an explicitly declared absolute floor must still work, for the
        # cases where a near-zero quantity genuinely needs one.
        with_floor = Claim("lambda", 0.002903, small, "works.lambda_wb",
                           tolerance=0.05, abs_tolerance=0.05,
                           run_to_fix="python sweep.py")
        ck("tolerance.explicit_abs_floor_still_honoured", check(with_floor)["ok"],
           "an explicitly declared absolute tolerance was ignored")

        # proveCatch 5 — the key is absent: "I ran a solver" != "this solver
        # produced this number".
        wrong_key = Claim("torque", 42.5, art, "works.nonexistent",
                          run_to_fix="python solver.py")
        ck("proveCatch.key_absent_blocks", check(wrong_key)["reason"] == "KEY_ABSENT")

        # proveCatch 6 — FAIL-OPEN: a dependency that does not exist must BLOCK,
        # not silently disable the freshness check.
        ghost = Claim("torque", 42.5, art, "works.torque_nm",
                      depends_on=[d / "does_not_exist.py"],
                      run_to_fix="python solver.py")
        r = check(ghost)
        ck("failopen.missing_dependency_blocks",
           not r["ok"] and r["reason"] == "DEPENDENCY_MISSING",
           f"a missing dependency was ignored: {r}")

        # proveCatch 7 — FAIL-OPEN: an EMPTY registry must not read as a pass.
        empty = evaluate([])
        ck("failopen.empty_registry_blocks", not empty["ok"],
           "an empty claim registry passed")

        # The aggregate must block and must carry a de-duplicated punchlist.
        agg = evaluate([good, missing, drifted])
        ck("aggregate.blocks", not agg["ok"], "aggregate passed with failures")
        ck("aggregate.punchlist", agg["punchlist"] == ["python solver.py"],
           f"punchlist wrong: {agg['punchlist']}")
        ck("aggregate.counts", agg["n_backed"] == 1,
           f"n_backed={agg['n_backed']}, expected 1")

    for f in fails:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if fails else 'PASS'} claim_provenance_gate selftest "
          f"({len(fails)} failures)")
    return 1 if fails else 0


def _enforce_mode_from_env() -> str:
    """ENFORCING BY DEFAULT (Tristan 2026-08-01: "turn them on by default").

    This gate deliberately breaks the gates 31-40 shadow-by-default convention.
    Those gates default to shadow because a false positive would block a run
    over a judgement call. This one cannot false-positive on a judgement: it
    asserts only that a number has a fresh artefact behind it, which is either
    true or it is not. Shipping a figure with nothing behind it is not a
    borderline case, so there is nothing to be lenient about.

    CLAIM_PROVENANCE_ENFORCING=off returns it to reporting.
    """
    raw = str(os.environ.get("CLAIM_PROVENANCE_ENFORCING", "on")).strip().lower()
    return "off" if raw in ("0", "false", "no", "off", "shadow") else "on"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--claims", type=Path)
    ap.add_argument("--output", type=Path)
    ap.add_argument("--enforce", action="store_true",
                    help="exit 41 when a claim is unbacked (ON BY DEFAULT; "
                         "set CLAIM_PROVENANCE_ENFORCING=off to report only)")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()
    if not args.claims:
        ap.error("--claims required unless --selftest")

    res = evaluate(claims_from_json(args.claims))
    for f in res["findings"]:
        mark = "ok   " if f["ok"] else "BLOCK"
        print(f"  [{mark}] {f['claim']:34s} {f['reason']:20s} {f['detail'][:90]}")
    if res["punchlist"]:
        print("\n  PUNCHLIST — run these, then re-check:")
        for cmd in res["punchlist"]:
            print(f"    {cmd}")
    if args.output:
        args.output.write_text(json.dumps(res, indent=2))
    print(f"\n  {res['n_backed']}/{res['n_claims']} claims backed by a fresh artefact")
    # Enforcement is also settable by environment, so the chain can turn it on
    # without every caller passing a flag (mirrors the gates 31-40 pattern).
    enforcing = args.enforce or _enforce_mode_from_env() != "off"
    if not res["ok"] and enforcing:
        print("  CLAIM-PROVENANCE GATE BLOCKS — do not ship these numbers.")
        return 41
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
