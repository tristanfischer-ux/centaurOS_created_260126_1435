#!/usr/bin/env python3
"""STAGE BOUNDARY CHECK — verify what just finished before starting what's next.

INTENT (Tristan 2026-08-02): "maybe at the beginning of every P stage you should
do an automatic check of what you have just done and what you are about to
start."

THE GAP IT CLOSES. Finishing a stage and KNOWING it landed are different things,
and this session has the scars:

  - The physics-tree stamp completed "successfully" and silently re-based FOUR
    contract quantities, moving every measured number. Nothing failed. The
    provenance gate caught it hours later as a VALUE_MISMATCH.
  - An overnight refresh reported 7 steps "ok" while one had exited 43 — a gate
    BLOCKING, which the driver counted as a failure and the summary as noise.
  - Artefacts have outlived failed runs three separate times, so "the file is
    there" has repeatedly meant "the file is there from before".

A stage boundary is exactly where those go undetected, because attention has
already moved to the next thing.

WHAT IT CHECKS
  DID:  every artefact the finished stage should have produced exists, is
        NEWER than the inputs it declares, and is non-trivial.
  NEXT: every precondition the next stage needs is present — inputs, tools on
        disk, packages importable.
  Then re-runs the cheap universal gates, because a stage that quietly broke a
  gate must not be followed by another stage.

UNIVERSAL: takes plain paths and names. No archetype knowledge.

Usage:
    stage_boundary_check.py --did "P0 magnet BoM" --produced a.json b.json \\
                            --next "P1 losses" --needs c.json --tools x.py
    stage_boundary_check.py --selftest
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

# Cheap, deterministic, and the ones that catch cross-stage damage.
UNIVERSAL_SELFTESTS = (
    "machine_excitation_tracking", "machine_magnet_flux_focusing",
    "machine_loss_bounds", "model_routing", "claim_provenance_gate",
    "machine_geometry_coherence", "capability_lookup_stage",
)

MIN_ARTEFACT_BYTES = 32


def check_produced(paths: list[Path], *, max_age_s: float | None = None) -> list[dict]:
    """Did the finished stage actually produce what it claims?"""
    out = []
    now = time.time()
    for p in paths:
        if not p.exists():
            out.append({"path": str(p), "ok": False, "reason": "ABSENT",
                        "detail": "the stage did not produce this"})
            continue
        size = p.stat().st_size
        age = now - p.stat().st_mtime
        if size < MIN_ARTEFACT_BYTES:
            out.append({"path": str(p), "ok": False, "reason": "TRIVIAL",
                        "detail": f"{size} bytes — a stub, not a result"})
            continue
        if max_age_s is not None and age > max_age_s:
            # THE trap: an artefact that outlived a failed run reads as success.
            out.append({"path": str(p), "ok": False, "reason": "STALE",
                        "detail": (f"{age / 60:.0f} min old — older than this "
                                   "stage, so it predates the work")})
            continue
        if p.suffix == ".json":
            try:
                json.loads(p.read_text())
            except (json.JSONDecodeError, OSError) as exc:
                out.append({"path": str(p), "ok": False, "reason": "UNREADABLE",
                            "detail": f"{type(exc).__name__}: {exc}"})
                continue
        out.append({"path": str(p), "ok": True, "reason": "PRESENT",
                    "detail": f"{size} bytes, {age / 60:.0f} min old"})
    return out


def check_preconditions(needs: list[Path], tools: list[Path],
                        packages: list[str]) -> list[dict]:
    """Can the next stage actually start?"""
    out = []
    for p in needs:
        out.append({"item": str(p), "kind": "input", "ok": p.exists(),
                    "detail": "present" if p.exists() else "MISSING — next stage cannot start"})
    for t in tools:
        full = t if t.is_absolute() else REPO_ROOT / t
        out.append({"item": str(t), "kind": "tool", "ok": full.exists(),
                    "detail": "on disk" if full.exists() else "NOT FOUND — do not rebuild it, find it"})
    for pkg in packages:
        r = subprocess.run([sys.executable, "-c", f"import {pkg}"],
                           capture_output=True, timeout=60)
        ok = r.returncode == 0
        out.append({"item": pkg, "kind": "package", "ok": ok,
                    "detail": "importable" if ok else "NOT importable HERE"})
    return out


def run_universal_gates() -> list[dict]:
    out = []
    for name in UNIVERSAL_SELFTESTS:
        path = REPO_ROOT / "scripts" / "lib" / f"{name}.py"
        if not path.exists():
            continue
        r = subprocess.run(["python3", str(path), "--selftest"],
                           capture_output=True, timeout=180)
        out.append({"gate": name, "ok": r.returncode == 0,
                    "detail": ("pass" if r.returncode == 0
                               else r.stdout.decode()[-160:] or "FAILED")})
    return out


def evaluate(did: str, produced: list[dict], nxt: str, pre: list[dict],
             gates: list[dict]) -> dict:
    bad_produced = [x for x in produced if not x["ok"]]
    bad_pre = [x for x in pre if not x["ok"]]
    bad_gates = [x for x in gates if not x["ok"]]
    return {
        "schema": "forgeos.stage_boundary_check/v1",
        "finished_stage": did, "next_stage": nxt,
        "produced": produced, "preconditions": pre, "gates": gates,
        "ok": not (bad_produced or bad_gates),
        # A missing PRECONDITION is a warning (the next stage may create it);
        # a missing PRODUCT or a broken GATE is a stop.
        "verdict": (
            "STOP — the finished stage did not deliver, or it broke a gate"
            if (bad_produced or bad_gates) else
            "PROCEED WITH CARE — preconditions missing for the next stage"
            if bad_pre else "PROCEED"),
    }


def _selftest() -> int:
    import tempfile
    fails: list[str] = []

    def ck(n: str, c: bool, d: str = "") -> None:
        if not c:
            fails.append(f"{n}: {d}")

    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        good = d / "result.json"; good.write_text(json.dumps({"value": 42, "pad": "x" * 40}))
        stub = d / "stub.json"; stub.write_text("{}")
        absent = d / "never.json"

        r = check_produced([good])
        ck("produced.good_passes", r[0]["ok"], str(r))
        r = check_produced([absent])
        ck("produced.absent_blocks", not r[0]["ok"] and r[0]["reason"] == "ABSENT")
        r = check_produced([stub])
        ck("produced.trivial_blocks", not r[0]["ok"] and r[0]["reason"] == "TRIVIAL",
           "a 2-byte stub passed as a result")

        # THE trap this exists for: an artefact that predates the stage.
        import os
        os.utime(good, (time.time() - 7200, time.time() - 7200))
        r = check_produced([good], max_age_s=600)
        ck("produced.stale_blocks", not r[0]["ok"] and r[0]["reason"] == "STALE",
           "an artefact that outlived a failed run passed as success")

        pre = check_preconditions([absent], [Path("scripts/lib/model_routing.py")], [])
        ck("pre.missing_input_flagged", not pre[0]["ok"])
        ck("pre.existing_tool_found", pre[1]["ok"], "a tool that exists was not found")

        v = evaluate("X", check_produced([absent]), "Y", [], [])
        ck("verdict.stop_on_missing_product", v["verdict"].startswith("STOP"))
        v = evaluate("X", check_produced([good]), "Y", pre, [])
        ck("verdict.care_on_missing_precondition",
           v["verdict"].startswith("PROCEED WITH CARE"), v["verdict"])

    for f in fails:
        print(f"  FAIL {f}")
    print(f"{'FAIL' if fails else 'PASS'} stage_boundary_check selftest "
          f"({len(fails)} failures)")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--did", default="(unnamed)")
    ap.add_argument("--produced", nargs="*", default=[])
    ap.add_argument("--max-age-min", type=float)
    ap.add_argument("--next", dest="nxt", default="(unnamed)")
    ap.add_argument("--needs", nargs="*", default=[])
    ap.add_argument("--tools", nargs="*", default=[])
    ap.add_argument("--packages", nargs="*", default=[])
    ap.add_argument("--skip-gates", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return _selftest()

    produced = check_produced(
        [Path(p) for p in args.produced],
        max_age_s=args.max_age_min * 60 if args.max_age_min else None)
    pre = check_preconditions([Path(p) for p in args.needs],
                              [Path(t) for t in args.tools], args.packages)
    gates = [] if args.skip_gates else run_universal_gates()
    res = evaluate(args.did, produced, args.nxt, pre, gates)

    print(f"── FINISHED: {args.did}")
    for x in produced:
        print(f"   [{'ok' if x['ok'] else 'BAD':3s}] {x['reason']:10s} {x['path']}")
        if not x["ok"]:
            print(f"         {x['detail']}")
    print(f"── NEXT: {args.nxt}")
    for x in pre:
        print(f"   [{'ok' if x['ok'] else 'MISS':4s}] {x['kind']:8s} {x['item']} — {x['detail']}")
    if gates:
        bad = [g for g in gates if not g["ok"]]
        print(f"── GATES: {len(gates) - len(bad)}/{len(gates)} pass")
        for g in bad:
            print(f"   [BAD] {g['gate']}: {g['detail']}")
    print(f"── {res['verdict']}")
    return 0 if res["ok"] else 46


if __name__ == "__main__":
    raise SystemExit(main())
