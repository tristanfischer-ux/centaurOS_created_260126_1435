#!/usr/bin/env python3
"""loop_board.py — the CODED batch protocol for fix→run→score loops (Tristan
2026-07-10, twice: "it feels as though you are aware of problems for a while but
don't batch fix them" and "this approach needs to be in the code, not just choosing
to do it from time to time on the whim of a generative LLM looking up an MD file").

The mechanism, deterministic and LLM-free:

  assemble <run_dir> [--board <path>]
      Harvest EVERY machine-readable defect the run's own artefacts report —
      tab-scorecard FAIL-tab issues, parts-ledger not_found residuals,
      connection-ledger completeness concerns, benchmark-punchlist routed faults —
      into ONE persistent board (board.json beside the runs). Stable content-keyed
      ids; defects absent from the newest run auto-close (resolved_by_run); defects
      surviving N runs carry seen_count so nothing quietly lingers.

  gate [--board <path>]
      THE HARD RULE: exits non-zero, listing every ACTIVE defect with NO
      disposition. The loop's run command chains `loop_board.py gate && <chain>` —
      a new run CANNOT launch while any known defect is undispositioned. Batching
      stops being agent discipline and becomes a precondition the harness enforces.

  dispose <defect_id> <kind> <ref> [note...]
      Record a disposition: kind ∈ fixed (ref = commit sha), classified (ref = the
      honest substatus/reason), blocked (ref = the named decision Tristan owns).
      A disposition is a CLAIM — the next assemble re-checks it: a 'fixed' defect
      still present in the new run is auto-REOPENED (disposition cleared, reopen
      count bumped), so a wrong fix cannot silently satisfy the gate twice.

  status [--board <path>]
      One-line-per-defect summary (active/dispositioned/resolved counts).
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time


def _bid(source: str, text: str) -> str:
    """Stable defect id: source + the text's leading 90 chars, digits collapsed so a
    count moving 46→45 stays the SAME defect rather than minting a new one."""
    norm = re.sub(r"\d+", "N", str(text)[:90].lower())
    return source + ":" + hashlib.sha1(f"{source}|{norm}".encode()).hexdigest()[:10]


def _load(board_path: str) -> dict:
    if os.path.exists(board_path):
        with open(board_path) as fh:
            return json.load(fh)
    return {"schema": "loop-board/1", "defects": {}}


def _save(board_path: str, board: dict) -> None:
    with open(board_path, "w") as fh:
        json.dump(board, fh, indent=1, sort_keys=True)


def harvest(run_dir: str) -> dict:
    """{defect_id: {source, text}} from the run's own machine-readable artefacts."""
    out: dict = {}

    def add(source: str, text: str) -> None:
        t = str(text).strip()
        if t:
            out[_bid(source, t)] = {"source": source, "text": t[:300]}

    p = os.path.join(run_dir, "tab-scorecard.json")
    if os.path.exists(p):
        sc = json.load(open(p))
        for tab, v in (sc.get("tabs") or sc).items():
            if isinstance(v, dict) and v.get("status") == "FAIL":
                for iss in (v.get("issues") or [])[:6]:
                    add(f"tab:{tab}", iss)
                if not v.get("issues"):
                    add(f"tab:{tab}", f"FAIL at {v.get('score')} with no issue text (scorer must flag AND route)")

    p = os.path.join(run_dir, "parts-ledger.json")
    if os.path.exists(p):
        pl = json.load(open(p))
        for tag in pl.get("not_found") or []:
            add("partsledger:not_found", f"equipment {tag} has NOT-FOUND research status")
        for tag in pl.get("orphan_equipment") or []:
            add("partsledger:orphan", f"equipment {tag} is orphaned")

    p = os.path.join(run_dir, "connection-ledger.json")
    if os.path.exists(p):
        cl = json.load(open(p))
        for c in (cl.get("completeness") or {}).get("concerns") or []:
            add("ledger:completeness", f"{c.get('part')} missing {','.join(c.get('missing') or [])}")

    p = os.path.join(run_dir, "benchmark-punchlist.md")
    if os.path.exists(p):
        for line in open(p):
            if line.lstrip().startswith("- `"):
                add("benchmark:fault", line.strip()[:220])
    return out


def cmd_assemble(run_dir: str, board_path: str) -> int:
    board = _load(board_path)
    defects = board["defects"]
    run = os.path.basename(os.path.normpath(run_dir))
    # CRASHED-RUN GUARD (2026-07-10, run 48): a run that died upstream produces NO
    # scorecard — harvesting it yields zero defects and would auto-RESOLVE the whole
    # board (every open defect "absent from the newest run"). Absence of evidence from
    # a crashed run is NOT evidence of absence: refuse to update the board.
    if not os.path.exists(os.path.join(run_dir, "tab-scorecard.json")):
        print(f"[board] {run}: CRASHED/incomplete (no tab-scorecard.json) — board NOT updated; "
              f"defects keep their prior state")
        return 0
    now = harvest(run_dir)
    new = reopened = resolved = 0
    for did, d in now.items():
        cur = defects.get(did)
        if cur is None:
            defects[did] = {**d, "first_seen": run, "last_seen": run, "seen_count": 1,
                            "disposition": None, "reopens": 0}
            new += 1
        else:
            cur["last_seen"] = run
            cur["seen_count"] = int(cur.get("seen_count", 0)) + 1
            cur.pop("resolved_by_run", None)
            # a 'fixed' claim contradicted by the new run REOPENS — a wrong fix can
            # never satisfy the gate twice.
            disp = cur.get("disposition")
            if disp and disp.get("kind") == "fixed":
                cur["disposition"] = None
                cur["reopens"] = int(cur.get("reopens", 0)) + 1
                reopened += 1
    for did, cur in defects.items():
        if did not in now and not cur.get("resolved_by_run") and cur.get("last_seen") != run:
            cur["resolved_by_run"] = run
            resolved += 1
    board["latest_run"] = run
    board["assembled_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    _save(board_path, board)
    active = [d for d in defects.values() if not d.get("resolved_by_run")]
    undisp = [d for d in active if not d.get("disposition")]
    print(f"[board] {run}: {len(now)} defect(s) live — {new} new, {reopened} REOPENED, "
          f"{resolved} resolved; board: {len(active)} active ({len(undisp)} undispositioned)")
    return 0


def cmd_gate(board_path: str) -> int:
    board = _load(board_path)
    undisp = {did: d for did, d in board["defects"].items()
              if not d.get("resolved_by_run") and not d.get("disposition")}
    if not undisp:
        print(f"[board] GATE OPEN — every active defect on {board.get('latest_run')} is dispositioned")
        return 0
    print(f"[board] GATE CLOSED — {len(undisp)} active defect(s) with NO disposition. "
          f"Fix (dispose <id> fixed <sha>), classify, or name the blocked decision BEFORE the next run:")
    for did, d in sorted(undisp.items(), key=lambda kv: -kv[1].get("seen_count", 0)):
        print(f"  {did}  seen×{d.get('seen_count')}  [{d.get('source')}] {d.get('text')[:120]}")
    return 1


def cmd_dispose(board_path: str, did: str, kind: str, ref: str, note: str) -> int:
    if kind not in ("fixed", "classified", "blocked"):
        print("kind must be fixed|classified|blocked")
        return 2
    board = _load(board_path)
    d = board["defects"].get(did)
    if d is None:
        print(f"no defect {did}")
        return 2
    d["disposition"] = {"kind": kind, "ref": ref, "note": note,
                        "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    _save(board_path, board)
    print(f"[board] {did} → {kind} ({ref})")
    return 0


def cmd_status(board_path: str) -> int:
    board = _load(board_path)
    ds = board["defects"].values()
    active = [d for d in ds if not d.get("resolved_by_run")]
    undisp = [d for d in active if not d.get("disposition")]
    print(f"[board] latest={board.get('latest_run')} total={len(list(ds))} "
          f"active={len(active)} undispositioned={len(undisp)} "
          f"resolved={sum(1 for d in ds if d.get('resolved_by_run'))}")
    return 0


def _selftest() -> int:
    import tempfile
    tmp = tempfile.mkdtemp(prefix="loopboard_")
    run1 = os.path.join(tmp, "run-1"); os.makedirs(run1)
    json.dump({"tabs": {"Part names": {"status": "FAIL", "score": 4,
              "issues": ["parts-ledger: 0 orphan + 46 not-found equipment item(s)"]}}},
              open(os.path.join(run1, "tab-scorecard.json"), "w"))
    json.dump({"not_found": ["X-1"]}, open(os.path.join(run1, "parts-ledger.json"), "w"))
    bp = os.path.join(tmp, "board.json")
    cmd_assemble(run1, bp)
    assert cmd_gate(bp) == 1, "gate must CLOSE on undispositioned defects"
    b = _load(bp); dids = list(b["defects"])
    for did in dids:
        cmd_dispose(bp, did, "fixed", "abc1234", "test")
    assert cmd_gate(bp) == 0, "gate must OPEN once every defect is dispositioned"
    # the same defect surviving the next run must REOPEN and re-close the gate
    run2 = os.path.join(tmp, "run-2"); os.makedirs(run2)
    json.dump({"tabs": {"Part names": {"status": "FAIL", "score": 4,
              "issues": ["parts-ledger: 0 orphan + 45 not-found equipment item(s)"]}}},
              open(os.path.join(run2, "tab-scorecard.json"), "w"))
    json.dump({"not_found": ["X-1"]}, open(os.path.join(run2, "parts-ledger.json"), "w"))
    cmd_assemble(run2, bp)
    assert cmd_gate(bp) == 1, "a false 'fixed' claim must REOPEN (digit drift 46→45 = same defect)"
    # a defect genuinely absent from the next run auto-resolves
    run3 = os.path.join(tmp, "run-3"); os.makedirs(run3)
    json.dump({"tabs": {}}, open(os.path.join(run3, "tab-scorecard.json"), "w"))
    json.dump({"not_found": []}, open(os.path.join(run3, "parts-ledger.json"), "w"))
    cmd_assemble(run3, bp)
    assert cmd_gate(bp) == 0, "gate must open when the defects are genuinely gone"
    # a CRASHED run (no scorecard) must NOT touch the board — re-seed a defect, then
    # assemble an empty dir and confirm nothing auto-resolves
    run4 = os.path.join(tmp, "run-4"); os.makedirs(run4)
    json.dump({"tabs": {"Ledger": {"status": "FAIL", "score": 5, "issues": ["x missing"]}}},
              open(os.path.join(run4, "tab-scorecard.json"), "w"))
    cmd_assemble(run4, bp)
    assert cmd_gate(bp) == 1
    run5 = os.path.join(tmp, "run-5"); os.makedirs(run5)  # crashed: no artefacts at all
    cmd_assemble(run5, bp)
    b2 = _load(bp)
    live = [d for d in b2["defects"].values() if not d.get("resolved_by_run") and not d.get("disposition")]
    assert live, "a crashed run must NOT auto-resolve open defects"
    assert b2.get("latest_run") != "run-5", "a crashed run must not become latest_run"
    print("loop_board selftest: OK (gate closes on undispositioned; false-fixed REOPENS; genuine fixes auto-resolve; crashed runs don't wipe the board)")
    return 0


def main(argv: list) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] == "--selftest":
        return _selftest()
    cmd, rest = argv[0], argv[1:]
    bp = "out/loop-board.json"
    if "--board" in rest:
        i = rest.index("--board"); bp = rest[i + 1]; rest = rest[:i] + rest[i + 2:]
    if cmd == "assemble" and rest:
        return cmd_assemble(rest[0], bp)
    if cmd == "gate":
        return cmd_gate(bp)
    if cmd == "dispose" and len(rest) >= 3:
        return cmd_dispose(bp, rest[0], rest[1], rest[2], " ".join(rest[3:]))
    if cmd == "status":
        return cmd_status(bp)
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
