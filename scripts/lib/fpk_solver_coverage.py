#!/usr/bin/env python3
"""Universal gate: every physical claim must trace to a FRESH solver artefact.

INTENT (Tristan 2026-07-31): "why is it that you didn't use them automatically
and why did you make your own stuff up. You need to show and PROVE that you're
actually using all of these deterministic tools."

ROOT-CAUSE AUDIT of the failure this closes
-------------------------------------------
On the FE front kit I used 3 of 18 available `--twin` solvers and hand-derived
the rest. The specific mechanisms, in order of blame:

1. ANCHORED ON THE HANDOVER. The handover named `em_fia_front_kit_case.py`, so I
   treated the named script as "the toolset" and never listed
   `scripts/motor-stack/` until asked — about 40 tool calls into the EM work.
   The repo's own CLAUDE.md already warns against exactly this
   ("STOP HUNTING — read these BEFORE searching"; "grep before declaring
   missing"). I violated a documented lesson.
2. ARITHMETIC FELT LIKE A SANITY CHECK, THEN GOT PUBLISHED. `T ∝ D²L`,
   `critical speed ∝ 1/L²`, `+10.7% I²R` were each written as a quick estimate
   and then reported as an engineering conclusion. The D²L one was wrong by 2×
   and drove a false "the kit cannot close in this bay" verdict.
3. I WROTE CAVEATS INSTEAD OF CLOSING GAPS. I wrote "this is at one current
   angle, not an MTPA optimum" and moved on — while `em_fia_mtpa_screen.py`
   existed. Running it moved the duty ratio 0.748 → 0.946 and reversed the
   conclusion. A disclosed gap that one command could close is avoidance, not
   honesty.
4. I BUILT NEW TOOLS WITHOUT GREPPING FOR EXISTING ONES (a bespoke gear tooth
   solver while `iso6336_fia_front_kit_case.py` was present).
5. NOTHING FORCED THE CHECK. No rule said "a quantitative claim must trace to a
   solver artefact", so nothing stopped any of the above. That absence is the
   real root cause — the rest is judgement, and judgement is not a control.

THIS MODULE IS THE CONTROL. It enumerates every solver with a `--twin`
entrypoint, and reports for each whether its artefact is FRESH (newer than the
inputs it depends on), STALE, or MISSING. Archetype-agnostic: it discovers
solvers by entrypoint, never by a hardcoded list, so a new solver is covered the
day it lands.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

ROOT = Path(__file__).resolve().parents[2]
SOLVER_DIR = ROOT / "scripts" / "motor-stack"

# A solver's artefact conventionally shares its stem, under _motor_stack/.
ARTEFACT_SUBDIR = "_motor_stack"

# Gate 44 — same class as claim-provenance (41): a REPORT that exits 0 while
# solvers are STALE/MISSING is Goodhart. Exit 44 under enforce.
GATE_EXIT = 44


@dataclass
class SolverStatus:
    name: str
    script: str
    artefact: Optional[str]
    state: str           # FRESH | STALE | MISSING | ERROR
    age_s: Optional[float]
    detail: str = ""


def discover_solvers(solver_dir: Path | str = SOLVER_DIR) -> list[Path]:
    """Every script exposing a `--twin` entrypoint. Discovery, not a hardcoded list."""
    out: list[Path] = []
    d = Path(solver_dir)
    if not d.is_dir():
        return out
    for path in sorted(d.glob("*.py")):
        if path.name.endswith("_test.py") or "selftest" in path.name:
            continue
        try:
            src = path.read_text()
        except OSError:
            continue
        if '"--twin"' in src or "'--twin'" in src:
            out.append(path)
    return out


def _artefact_for(script: Path, twin: Path) -> Optional[Path]:
    """Locate a solver's artefact by stem, tolerating name variations."""
    stem = script.stem
    art_dir = twin / ARTEFACT_SUBDIR
    if not art_dir.is_dir():
        return None
    exact = art_dir / f"{stem}.json"
    if exact.exists():
        return exact
    # Solvers often drop the leading family prefix (em_fia_x -> x, fia_x).
    tokens = [t for t in re.split(r"[_]+", stem) if t not in {"fia", "screen", "case"}]
    best: Optional[Path] = None
    best_score = 0
    for cand in art_dir.glob("*.json"):
        score = sum(1 for t in tokens if t and t in cand.stem)
        if score > best_score:
            best, best_score = cand, score
    return best if best_score >= max(2, len(tokens) - 2) else None


def evaluate_solver_coverage(
    twin: Path | str,
    *,
    solver_dir: Path | str = SOLVER_DIR,
    inputs: Iterable[Path | str] = (),
) -> dict:
    """FRESH / STALE / MISSING for every discovered solver on this twin."""
    twin_p = Path(twin)
    watch = [Path(p) for p in inputs] or [twin_p / "state.json"]
    newest_input = max(
        (p.stat().st_mtime for p in watch if p.exists()), default=0.0)
    rows: list[SolverStatus] = []
    for script in discover_solvers(solver_dir):
        art = _artefact_for(script, twin_p)
        if art is None or not art.exists():
            rows.append(SolverStatus(script.stem, str(script), None, "MISSING",
                                     None, "no artefact for this twin"))
            continue
        age = art.stat().st_mtime - newest_input
        if age >= 0:
            rows.append(SolverStatus(script.stem, str(script), art.name, "FRESH",
                                     age))
        else:
            rows.append(SolverStatus(
                script.stem, str(script), art.name, "STALE", age,
                f"artefact is {abs(age) / 60.0:.1f} min older than its inputs"))
    fresh = [r for r in rows if r.state == "FRESH"]
    not_fresh = [r for r in rows if r.state != "FRESH"]
    # FLOW: blocked twin → punchlist names the exact scripts to re-run
    # → agent re-runs → artefact FRESH → gate clears. No orphan "ok: false".
    punchlist = [
        f"{sys.executable} {r.script} --twin {twin_p}"
        for r in not_fresh
    ]
    return {
        "schema": "forgeos.fpk.solver_coverage/v1",
        "twin": str(twin_p),
        "solvers_discovered": len(rows),
        "fresh": len(fresh),
        "stale": sum(1 for r in rows if r.state == "STALE"),
        "missing": sum(1 for r in rows if r.state == "MISSING"),
        "coverage_pct": round(100.0 * len(fresh) / max(1, len(rows)), 1),
        "rows": [r.__dict__ for r in rows],
        "punchlist": punchlist,
        "ok": all(r.state == "FRESH" for r in rows),
    }


def enforce_mode_from_env() -> str:
    """ENFORCING BY DEFAULT — mirrors claim-provenance (gate 41).

    DECISION: break the gates 31-40 shadow-by-default convention. A STALE or
    MISSING solver artefact is not a judgement call; it is exactly the failure
    mode that let 15/18 motor-stack solvers sit unused while arithmetic was
    published as engineering. SOLVER_COVERAGE_ENFORCING=off|shadow → report only.
    """
    raw = str(os.environ.get("SOLVER_COVERAGE_ENFORCING", "on")).strip().lower()
    return "off" if raw in ("0", "false", "no", "off", "shadow") else "on"


def run_solver(script: Path, twin: Path, python: str, timeout: int = 5400) -> tuple[bool, str]:
    """Execute one solver against the twin. Returns (ok, tail-of-output)."""
    try:
        proc = subprocess.run(
            [python, str(script), "--twin", str(twin)],
            capture_output=True, text=True, timeout=timeout,
        )
        tail = (proc.stdout or proc.stderr or "").strip().splitlines()
        return proc.returncode == 0, (tail[-1] if tail else "")
    except subprocess.TimeoutExpired:
        return False, "TIMEOUT"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def _selftest() -> None:
    """proveCatch: coverage must be DISCOVERED and must fail on a stale artefact."""
    found = discover_solvers()
    assert len(found) >= 10, f"solver discovery is broken, found {len(found)}"
    names = {p.stem for p in found}
    # The engines this session proved were being ignored MUST be discoverable.
    for must in ("em_fia_mtpa_screen", "calculix_fia_rotor_screen",
                 "openfoam_fia_water_jacket_case", "iso6336_fia_front_kit_case",
                 "em_fia_voltage_fw_screen", "em_fia_torque_map_screen"):
        assert must in names, f"{must} must be discovered, not hand-listed"
    # Discovery must be by ENTRYPOINT, never a hardcoded roster.
    import inspect
    disc = inspect.getsource(discover_solvers)
    assert ".py" not in disc.replace('"*.py"', "").replace('"_test.py"', ""), (
        "discover_solvers must find solvers by ENTRYPOINT, not a hardcoded "
        "roster — a roster goes stale the day a new solver lands, which is how "
        "15 of 18 went unrun")
    assert "--twin" in disc, "discovery keys on the --twin entrypoint"
    import tempfile, os, time
    with tempfile.TemporaryDirectory() as td:
        twin = Path(td)
        (twin / ARTEFACT_SUBDIR).mkdir()
        state = twin / "state.json"
        art = twin / ARTEFACT_SUBDIR / "em_fia_mtpa_screen.json"
        art.write_text("{}")
        time.sleep(0.01)
        state.write_text("{}")           # inputs NEWER than artefact => STALE
        res = evaluate_solver_coverage(twin)
        row = next(r for r in res["rows"] if r["name"] == "em_fia_mtpa_screen")
        assert row["state"] == "STALE", f"a stale artefact must be caught: {row}"
        assert not res["ok"], "stale coverage must not report ok"
        os.utime(art, None)              # artefact now newer => FRESH
        res2 = evaluate_solver_coverage(twin)
        row2 = next(r for r in res2["rows"] if r["name"] == "em_fia_mtpa_screen")
        assert row2["state"] == "FRESH", row2
        missing = next(r for r in res2["rows"] if r["name"] == "calculix_fia_rotor_screen")
        assert missing["state"] == "MISSING", missing
        assert res2["punchlist"], "missing solvers must route a punchlist"
        assert any("calculix_fia_rotor_screen" in c for c in res2["punchlist"])
    # proveCatch via CLI exit path: STALE twin under --enforce MUST exit 44
    with tempfile.TemporaryDirectory() as td:
        twin = Path(td)
        (twin / ARTEFACT_SUBDIR).mkdir()
        art = twin / ARTEFACT_SUBDIR / "em_fia_mtpa_screen.json"
        art.write_text("{}")
        time.sleep(0.01)
        (twin / "state.json").write_text("{}")  # newer → STALE
        proc = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()),
             "--twin", str(twin), "--enforce"],
            capture_output=True, text=True, env={
                **os.environ, "SOLVER_COVERAGE_ENFORCING": "on",
            },
        )
        assert proc.returncode == GATE_EXIT, (
            f"--enforce on stale coverage must exit {GATE_EXIT}, got "
            f"{proc.returncode}: {(proc.stdout or proc.stderr)[-400:]}")
    print(f"fpk_solver_coverage _selftest: OK — {len(found)} solvers DISCOVERED "
          f"by entrypoint; stale + missing both caught; --enforce exits {GATE_EXIT}")


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        _selftest()
        return 0
    twin = Path(argv[argv.index("--twin") + 1]) if "--twin" in argv else None
    if twin is None:
        print("usage: fpk_solver_coverage.py --twin <dir> "
              "[--run] [--python P] [--enforce]",
              file=sys.stderr)
        return 2
    python = argv[argv.index("--python") + 1] if "--python" in argv else sys.executable
    res = evaluate_solver_coverage(twin)
    print(f"solver coverage: {res['fresh']}/{res['solvers_discovered']} FRESH "
          f"({res['coverage_pct']}%)  stale={res['stale']} missing={res['missing']}")
    for r in res["rows"]:
        mark = {"FRESH": "ok   ", "STALE": "STALE", "MISSING": "MISS "}[r["state"]]
        print(f"  [{mark}] {r['name']:44s} {r['detail']}")
    if "--run" in argv:
        for r in res["rows"]:
            if r["state"] == "FRESH":
                continue
            script = Path(r["script"])
            print(f"\n>>> running {script.name}", flush=True)
            ok, tail = run_solver(script, twin, python)
            print(f"    {'OK  ' if ok else 'FAIL'} {tail[:200]}", flush=True)
        res = evaluate_solver_coverage(twin)
        print(f"\nafter run: {res['fresh']}/{res['solvers_discovered']} FRESH "
              f"({res['coverage_pct']}%)")
    if res.get("punchlist") and not res["ok"]:
        print("\n  PUNCHLIST — run these, then re-check:")
        for cmd in res["punchlist"]:
            print(f"    {cmd}")
    out = Path(twin) / "solver-coverage.json"
    out.write_text(json.dumps(res, indent=2))
    print(f"\n→ {out}")
    # INTENT: report-only was the exact failure mode (coverage ok:false + exit 0
    # or soft exit 1 the agent ignored). Gate 44 refuses under enforce.
    want_enforce = "--enforce" in argv or enforce_mode_from_env() != "off"
    if not res["ok"] and want_enforce:
        print("  SOLVER-COVERAGE GATE BLOCKS (exit 44) — "
              "do not ship claims while solvers are STALE/MISSING.")
        return GATE_EXIT
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
