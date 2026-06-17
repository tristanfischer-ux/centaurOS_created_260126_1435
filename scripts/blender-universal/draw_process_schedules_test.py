#!/usr/bin/env python3
"""
scripts/blender-universal/draw_process_schedules_test.py

Headless test for draw_process_schedules.py — the tabular process deliverables (LINE LIST
· VALVE LIST · INSTRUMENT INDEX) that pair with the P&ID (draw_pid.py).

The judging rubric (the same one a process engineer + Tristan apply): a real document SET
cross-references CONSISTENTLY.  The load-bearing assertions:

  CONSISTENCY (the key check)
    • EVERY topology process/thermal line appears as exactly one LINE-LIST row.
    • The LINE-LIST line numbers EQUAL draw_pid's P&ID line numbers — element-for-element,
      in order (so `203-ST-DN200` on the P&ID is `203-ST-DN200` in the line list).
    • Every from/to equipment tag in the line list is a real P&ID equipment tag (K-101…).
    • Every valve / instrument P&ID cross-reference resolves to a real line number or a
      real equipment tag in THIS drawing set (no dangling refs).

  STATE FIDELITY (valve / instrument counts match the state)
    • The VALVE LIST has exactly one row per distinct valve-family word in the state BoM.
    • The INSTRUMENT INDEX has exactly one row per distinct instrument-family word.
    • Real ISA tag families are used (LT/PT/TT/FT/AT; PSV/PCV/XV/PV/HV).

  REAL-SCHEDULE SHAPE
    • Line rows carry fluid + phase + DN + material + a design rating.
    • The markdown + SVG carry a title block + the "not for construction · as-modelled"
      scope note (light-mode; the SVG is a white page).

  TOPOLOGY-ONLY FALLBACK
    • The schedules still build from the state alone when no connection-schedule.json is
      present (DN inferred), and the line numbers STILL match draw_pid's in that mode.

Run (pure stdlib + the archetype state.json):
    python3 scripts/blender-universal/draw_process_schedules_test.py
    PROC_SCHED_RASTER=1 python3 scripts/blender-universal/draw_process_schedules_test.py

Exits non-zero on the first failed assertion; prints an inspectable per-archetype summary.
"""
from __future__ import annotations

import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_pid as PID                      # noqa: E402
import draw_process_schedules as PS         # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RASTER = os.environ.get("PROC_SCHED_RASTER") == "1"

# (label, state.json, connection-schedule dir candidates).  The schedule lives next to the
# state in out/<run>; a /tmp build dir is also accepted.  When none is found the test runs
# the topology-only fallback for that case too.
CASES = [
    ("e-fuel SAF", REPO / "out/oxccu-saf-v21/state.json",
     [REPO / "out/oxccu-saf-v21", "/tmp/bl-univ-efuel-sized"]),
    ("CO2 mineralisation", REPO / "out/co2-caspar-fix3/state.json",
     [REPO / "out/co2-caspar-fix3", "/tmp/bl-univ-co2-pid"]),
]


class Fail(AssertionError):
    pass


def _check(cond, msg):
    if not cond:
        raise Fail(msg)


def _find_sched_dir(candidates):
    for c in candidates:
        if (Path(c) / "connection-schedule.json").is_file():
            return str(c)
    return None


# ── ground-truth distinct valve / instrument word counts, computed with the SAME
#    classifier the schedule builder uses (so the assertion is a true 1:1 fidelity check).
def _distinct_valve_words(state):
    seen = set()
    for w, name, cid in PS._iter_words(state):
        blob = f"{cid} {name}"
        if PS._VALVE_NOISE.search(blob):
            continue
        for rx, prefix, _t, _f in PS._VALVE_KINDS:
            if rx.search(blob):
                seen.add((prefix, cid or name))
                break
    return seen


def _distinct_instr_words(state):
    seen = set()
    for w, name, cid in PS._iter_words(state):
        blob = f"{cid} {name}"
        if PS._INSTR_NOISE.search(blob):
            continue
        for rx, isa, measured, _ty in PS._INSTR_KINDS:
            if rx.search(blob):
                seen.add((isa, measured, cid or name))
                break
    return seen


def _expanded_instr_count(state):
    """The qty-ENUMERATED instrument-instance count: Σ of each distinct instrument-family
    word's ledger quantity. The instrument index enumerates per-vessel instances (a qty-10
    level word → LT-201..LT-210), so the row count = Σ qty, not the distinct-word count."""
    seen = set()
    total = 0
    for w, name, cid in PS._iter_words(state):
        blob = f"{cid} {name}"
        if PS._INSTR_NOISE.search(blob):
            continue
        for rx, isa, measured, _ty in PS._INSTR_KINDS:
            if rx.search(blob):
                key = (isa, measured, cid or name)
                if key in seen:
                    break
                seen.add(key)
                q = PS._qty(PS._mods(w))
                total += q if q and q > 0 else 1
                break
    return total


def _run_case(label, state_path, sched_candidates):
    import json
    state = json.load(open(state_path))
    sched_dir = _find_sched_dir(sched_candidates)

    # render into a private temp dir; copy the real schedule in if we found one.
    work = tempfile.mkdtemp(prefix="procsched-test-")
    if sched_dir:
        import shutil
        shutil.copy(Path(sched_dir) / "connection-schedule.json",
                    Path(work) / "connection-schedule.json")

    summary, sc, md = PS.generate_process_schedules(work, str(state_path),
                                                    rasterise_png=RASTER)

    # the P&ID's canonical reconstruction — the single source of truth we cross-check.
    schedule, _state = PID.load_inputs(work, str(state_path))
    proc = PID.reconstruct_process(schedule, state)
    topo = PID._topology(state)
    proc_topo = [e for e in topo if e.get("mechanism") != "electrical_bus"]

    print(f"\n=== {label} ===")
    print(f"  archetype       : {summary['archetype']}")
    print(f"  schedule used   : {summary['schedule_present']}"
          f"  ({'from ' + sched_dir if sched_dir else 'topology-only'})")
    print(f"  line-list rows  : {summary['lines']}  (topology process edges: "
          f"{len(proc_topo)})")
    print(f"  valve-list rows : {summary['valves']}")
    print(f"  instr-index rows: {summary['instruments']}")

    # ── (1) EVERY topology line is in the list, exactly once ──────────────────
    _check(len(sc.lines) == len(proc_topo),
           f"{label}: line-list has {len(sc.lines)} rows but topology has "
           f"{len(proc_topo)} process edges — every line must appear")
    edge_pairs = [(e.get("from_part"), e.get("to_part")) for e in proc_topo]
    list_pairs = [(r_from, r_to) for r_from, r_to in
                  ((ln.from_key, ln.to_key) for ln in proc.lines)]
    _check(edge_pairs == list_pairs,
           f"{label}: line order / coverage diverges from topology")

    # ── (2) LINE NUMBERS EQUAL draw_pid's, element-for-element (THE KEY CHECK) ─
    pid_numbers = [ln.number for ln in proc.lines]
    list_numbers = [r.number for r in sc.lines]
    _check(pid_numbers == list_numbers,
           f"{label}: LINE NUMBERS DO NOT MATCH THE P&ID\n"
           f"      P&ID : {pid_numbers}\n      list : {list_numbers}")
    # the numbers must look like real line numbers (NNN-XX[-DNnnn]); the 2-char service
    # code is alphanumeric (H2 / CO / ST / FG / SL …).
    for n in list_numbers:
        _check(re.match(r"^\d{3}-[A-Z0-9]{2}(-DN\d+)?$", n),
               f"{label}: line number '{n}' is not a standard line-number format")

    # ── (3) equipment tags in the list are REAL P&ID tags ────────────────────
    pid_tags = {nd.tag for nd in proc.nodes}
    tag_of = {nd.key: nd.tag for nd in proc.nodes}
    for r in sc.lines:
        _check(r.frm_tag in pid_tags and r.to_tag in pid_tags,
               f"{label}: line {r.number} has a non-P&ID equipment tag "
               f"({r.frm_tag}->{r.to_tag})")
        # and the tag is the RIGHT one for that endpoint (not just any valid tag).
        exp_from = tag_of[proc.lines[sc.lines.index(r)].from_key]
        exp_to = tag_of[proc.lines[sc.lines.index(r)].to_key]
        _check(r.frm_tag == exp_from and r.to_tag == exp_to,
               f"{label}: line {r.number} tag mismatch "
               f"({r.frm_tag}->{r.to_tag} vs {exp_from}->{exp_to})")

    # ── (4) VALVE / INSTRUMENT counts MATCH THE STATE ─
    # Valves collapse to one row per distinct valve-family word (qty shown as '(×N)' in the
    # tag). Instruments ENUMERATE the ledger's per-vessel instances: a qty-N instrument word
    # yields N consecutive ISA tags (LT-201..LT-210), so the row count = Σ qty over the
    # distinct instrument words — the render-from-ledger enumeration rule.
    exp_valves = _distinct_valve_words(state)
    exp_instr = _distinct_instr_words(state)
    exp_instr_rows = _expanded_instr_count(state)
    _check(len(sc.valves) == len(exp_valves),
           f"{label}: valve-list rows ({len(sc.valves)}) ≠ distinct valve-family "
           f"words in state ({len(exp_valves)})")
    _check(len(sc.instruments) == exp_instr_rows,
           f"{label}: instrument-index rows ({len(sc.instruments)}) ≠ Σ ledger-qty over "
           f"distinct instrument-family words ({exp_instr_rows}; {len(exp_instr)} distinct)")

    # real ISA families used.
    vtags = {v.tag.split("-")[0] for v in sc.valves}
    _check(vtags <= {"PSV", "PCV", "XV", "PV", "HV"} and vtags,
           f"{label}: unexpected valve tag families {vtags}")
    itags = {i.tag.split("-")[0] for i in sc.instruments}
    _check(itags <= {"LT", "PT", "TT", "FT", "AT"} and itags,
           f"{label}: unexpected instrument tag families {itags}")
    # a PSV must exist (both validation states carry relief valves).
    _check(any(v.tag.startswith("PSV") for v in sc.valves),
           f"{label}: no PSV in the valve list though the state carries relief valves")

    # ── (5) every valve / instrument P&ID cross-ref resolves in THIS set ──────
    line_set = set(list_numbers)

    def _resolves(loc: str) -> bool:
        loc = (loc or "").strip()
        if loc in line_set or loc in pid_tags:
            return True
        # 'V-101 (storage)' / 'lines (e.g. 201-FG-DN80)' / 'vessels (e.g. R-104)'
        m = re.search(r"\b([A-Z]-\d+)\b", loc)
        if m and m.group(1) in pid_tags:
            return True
        m = re.search(r"\b(\d{3}-[A-Z0-9]{2}(?:-DN\d+)?)\b", loc)
        if m and m.group(1) in line_set:
            return True
        # a free-text but honest location ('MEA storage tanks') is acceptable only as a
        # documented fallback — never a bare dangling tag/line that LOOKS like a ref.
        return not re.search(r"\b[A-Z]-\d+\b|\b\d{3}-[A-Z0-9]{2}\b", loc)

    for v in sc.valves:
        _check(_resolves(v.location),
               f"{label}: valve {v.tag} location '{v.location}' does not resolve to a "
               f"P&ID line/equipment in this set")
    for i in sc.instruments:
        _check(_resolves(i.location),
               f"{label}: instrument {i.tag} location '{i.location}' does not resolve")

    # ── (6) real LINE-LIST shape — fluid / phase / DN / material / rating ─────
    for r in sc.lines:
        _check(r.fluid and r.fluid != "—", f"{label}: line {r.number} has no fluid")
        _check(r.phase and r.phase != "—", f"{label}: line {r.number} has no phase")
        _check(r.material, f"{label}: line {r.number} has no material")
        _check(r.rating and r.rating != "—",
               f"{label}: line {r.number} has no design rating")
    sized = [r for r in sc.lines if re.match(r"DN\d+", r.dn or "")]
    _check(len(sized) >= max(3, len(sc.lines) - 1),
           f"{label}: too few DN-sized lines ({len(sized)}/{len(sc.lines)})")
    # phase vocabulary is the real process set.
    phases = {r.phase for r in sc.lines}
    _check(phases <= {"Gas", "Liquid", "Steam", "2-phase", "Slurry", "Condensate"},
           f"{label}: unexpected phase value(s) {phases}")

    # ── (7) document furniture — title block + scope note, light-mode ─────────
    _check("PROCESS SCHEDULES" in md and "LINE LIST" in md and "VALVE LIST" in md
           and "INSTRUMENT INDEX" in md,
           f"{label}: markdown missing one of the three schedule sections")
    _check("not for construction" in md.lower() and "as-modelled" in md.lower(),
           f"{label}: markdown scope note 'not for construction · as-modelled' missing")
    svg = Path(summary["svg"]).read_text()
    _check(svg.lstrip().startswith("<svg"), f"{label}: SVG output malformed")
    _check('fill="#ffffff"' in svg, f"{label}: SVG is not light-mode (white page)")
    _check("PROCESS SCHEDULES" in svg and "DRAWING No." in svg,
           f"{label}: SVG title block missing")
    _check("not for construction" in svg.lower(),
           f"{label}: SVG scope note missing")
    _check(svg.count("<text") >= 40, f"{label}: implausibly few SVG cells")

    print(f"  PASS  (lines match P&ID exactly; valves {len(sc.valves)}={len(exp_valves)} "
          f"words; instruments {len(sc.instruments)}=Σqty {exp_instr_rows} "
          f"({len(exp_instr)} words); valve fams {sorted(vtags)}; "
          f"instr fams {sorted(itags)})")
    if RASTER and summary.get("png"):
        print(f"  PNG  -> {summary['png']}")
    return summary


def _run_schedule_less():
    """The schedules must build from the TOPOLOGY ALONE when no connection-schedule.json is
    supplied — and the line numbers must STILL equal draw_pid's in that mode."""
    import json
    print("\n=== schedule-less fallback (topology only) ===")
    state_path = REPO / "out/oxccu-saf-v21/state.json"
    state = json.load(open(state_path))
    work = tempfile.mkdtemp(prefix="procsched-noschd-")     # empty: no schedule present
    summary, sc, md = PS.generate_process_schedules(work, str(state_path),
                                                    rasterise_png=False)
    _check(summary["schedule_present"] is False,
           "schedule-less: expected schedule_present=False")
    proc = PID.reconstruct_process({}, state)
    _check([r.number for r in sc.lines] == [ln.number for ln in proc.lines],
           "schedule-less: line numbers diverge from draw_pid in topology-only mode")
    _check(len(sc.lines) >= 4, f"schedule-less: too few lines ({len(sc.lines)})")
    _check(all(r.fluid and r.rating for r in sc.lines),
           "schedule-less: a line is missing fluid / rating")
    _check("not for construction" in md.lower(),
           "schedule-less: scope note missing")
    print(f"  PASS  (lines={len(sc.lines)}, numbers still match draw_pid, "
          f"valves={len(sc.valves)}, instruments={len(sc.instruments)})")


def main():
    missing = [str(s) for _l, s, _d in CASES if not Path(s).is_file()]
    if missing:
        print("[proc-sched-test] SKIP — state.json not found:\n  " + "\n  ".join(missing))
        return 0
    try:
        for label, state_path, sched in CASES:
            _run_case(label, state_path, sched)
        _run_schedule_less()
    except Fail as ex:
        print(f"\n[proc-sched-test] FAIL: {ex}")
        return 1
    print("\n[proc-sched-test] ALL PASS — both archetypes project real process schedules "
          "that cross-reference the P&ID line-for-line (line numbers identical · equipment "
          "tags identical · valve/instrument counts match the state).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
