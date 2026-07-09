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

    # ── (7) document furniture — working-schematic title + scope note, light-mode ─
    # T-09: sheet title must read as the canonical working schematic deliverable.
    _check("Working Schematic" in md and "LINE LIST" in md and "VALVE LIST" in md
           and "INSTRUMENT INDEX" in md,
           f"{label}: markdown missing Working Schematic title or a schedule section")
    _check("pipe runs" in md.lower() and "dn" in md.lower(),
           f"{label}: markdown must mention pipe runs / DN (working-schematic subtitle)")
    _check("not for construction" in md.lower() and "as-modelled" in md.lower(),
           f"{label}: markdown scope note 'not for construction · as-modelled' missing")
    svg = Path(summary["svg"]).read_text()
    _check(svg.lstrip().startswith("<svg"), f"{label}: SVG output malformed")
    _check('fill="#ffffff"' in svg, f"{label}: SVG is not light-mode (white page)")
    _check("Working Schematic" in svg and "DRAWING No." in svg,
           f"{label}: SVG title block missing Working Schematic title")
    _check("not for construction" in svg.lower(),
           f"{label}: SVG scope note missing")
    _check("ISO 2768-mK" in svg and "ISO 2768-mK" in md,
           f"{label}: shared general-tolerance note (ISO 2768-mK) missing from SVG/md")
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


def _run_pump_duty_and_psv_set():
    """PUMP-DUTY VALVE-SIZE + PSV-SET-FROM-PRESSURE-CLASS (2026-07-05, the codema v74
    Process-schedules closer). proveCatch both directions:
      - a Suction/Discharge Isolation or Non-Return valve on a pump with a stated
        m3/h duty gets a real DN + 'derived from host pump duty' provenance (never
        a bare dash);
      - the SAME valve family on a pump stated only in kW (no flow modifier) gets
        an HONEST, explicit 'not derivable … no flow duty' flag — never a guess;
      - a PSV protecting a vessel whose own requirementsBom basis states a design
        pressure ('P=13 kPa head') gets a derived bar figure with provenance;
      - a valve family this fix does NOT touch (Solenoid / Actuated — no host-pump
        cid) still shows the PRE-EXISTING honest '—' unchanged.
    Uses the real codema v74 water-treatment run (out/fischer-codema-v74) — the one
    archetype in the corpus that carries pump sub-assembly valves + a vessel whose
    basis states a design pressure. SKIPs (not fails) when that reference run is
    absent, exactly like the CASES loader above."""
    import json
    run_dir = REPO / "out/fischer-codema-v74"
    state_path = run_dir / "state.json"
    sched_path = run_dir / "connection-schedule.json"
    if not state_path.is_file() or not sched_path.is_file():
        print("\n=== pump-duty / PSV-set derivation === SKIP "
              "(out/fischer-codema-v74 reference run not found)")
        return
    print("\n=== pump-duty valve-size + PSV-set derivation (codema v74) ===")
    state = json.load(open(state_path))
    schedule = json.load(open(sched_path))
    proc = PID.reconstruct_process(schedule, state, str(run_dir))
    line_rows = PS.build_line_list(proc, schedule, state, str(run_dir))
    valve_rows = PS.build_valve_list(proc, schedule, state, line_rows)

    derived = [v for v in valve_rows if "derived from host pump duty" in v.size]
    no_flow = [v for v in valve_rows if v.size.startswith("not derivable")]
    _check(len(derived) >= 1,
           "pump-duty: expected at least one valve Size derived from a host pump's duty")
    for v in derived:
        _check(re.match(r"^DN\d+ — derived from host pump duty \([\d.]+ m3/h @ "
                         r"[\d.]+ m/s (suction|discharge)\)$", v.size),
               f"pump-duty: {v.tag} size string malformed: {v.size!r}")
    _check(len(no_flow) >= 1,
           "pump-duty: expected at least one honest 'not derivable' no-flow flag "
           "(a kW-rated pump has no m3/h to size a line from)")
    for v in no_flow:
        _check("no flow duty" in v.size,
               f"pump-duty: {v.tag} no-flow flag malformed: {v.size!r}")

    psvs = [v for v in valve_rows if v.vtype.startswith("Pressure relief")]
    _check(psvs, "PSV-set: no PSV in the v74 valve list")
    derived_set = [v for v in psvs if "design pressure" in v.set_or_cv]
    _check(derived_set,
           "PSV-set: expected at least one PSV Set derived from the protected "
           "vessel's stated design pressure")
    for v in derived_set:
        _check(re.match(r"^[\d.]+ bar \(design P\) — derived from .+ design pressure",
                        v.set_or_cv),
               f"PSV-set: {v.tag} set string malformed: {v.set_or_cv!r}")

    # proveNoFalsePositive the OTHER direction: an unrelated valve family (Solenoid /
    # Actuated — no host-pump cid) must NEVER carry the pump-duty derivation string.
    # It may resolve a real line DN (honest) or fall to '—' — either is fine; the
    # pump-duty fix must not smear "derived from host pump duty" onto them.
    unrelated = [v for v in valve_rows
                 if v.vtype in ("Solenoid shut-off", "Actuated isolation")]
    _check(unrelated,
           "pump-duty: expected ≥1 Solenoid/Actuated valve in the v74 valve list")
    smeared = [v for v in unrelated if "derived from host pump duty" in (v.size or "")]
    _check(not smeared,
           "pump-duty: a non-pump-family valve must NOT carry 'derived from host "
           f"pump duty' (got {[v.tag + ':' + v.size for v in smeared]})")
    print(f"  PASS  ({len(derived)} valve size(s) derived from host-pump duty; "
          f"{len(no_flow)} honest no-flow flag(s); {len(derived_set)} PSV set(s) "
          f"derived from vessel design pressure; {len(unrelated)} unrelated "
          f"valve(s) correctly unsmeared)")


def _run_t09_synthetic_dn_and_valve_tags():
    """T-09 proveCatch — Working Schematic content fidelity (Sam Green 2026-07-09).

    Given a synthetic route-manifest (≥2 lines with DN) + a valve schedule with tags,
    the generated schedule markdown/SVG MUST include those DN strings and valve tags.
    Also asserts the Working Schematic title is present (first-class deliverable).
    Pure stdlib — no out/ corpus dependency.
    """
    import json
    print("\n=== T-09 synthetic DN + valve tags (working schematic) ===")
    state = {
        "parsedBrief": {"product_class": "water_treatment"},
        "moduleDecomposition": {
            "product_class": "water_treatment",
            "modules": [{
                "module": "mass_fluid_transport_process",
                "sub_modules": [{
                    "sub_module": "valves",
                    "words": [
                        {
                            "id": "isolation_valve_word",
                            "name_human": "Suction Isolation Valve",
                            "content_character": {
                                "character_id": "isolation_valve",
                                "name_human": "Suction Isolation Valve",
                            },
                            "modifier_characters": [
                                {"kind": "quantity", "value": "×1"},
                                {"kind": "form", "value": "manual isolation ball valve"},
                            ],
                        },
                        {
                            "id": "relief_valve_word",
                            "name_human": "Pressure Relief Valve",
                            "content_character": {
                                "character_id": "pressure_relief_valve",
                                "name_human": "Pressure Relief Valve",
                            },
                            "modifier_characters": [
                                {"kind": "quantity", "value": "×1"},
                                {"kind": "form", "value": "spring-loaded PSV"},
                            ],
                        },
                    ],
                }],
            }],
        },
        "orchestratorContract": {
            "product_class": "water_treatment",
            "topology": [
                {
                    "from_part": "fresh_water_tank",
                    "to_part": "fertigation_dosing_pump",
                    "mechanism": "fluid_loop",
                    "constraint_kind": "flow_capacity",
                    "required_value": 90,
                },
                {
                    "from_part": "fertigation_dosing_pump",
                    "to_part": "distribution_manifold",
                    "mechanism": "fluid_loop",
                    "constraint_kind": "flow_capacity",
                    "required_value": 90,
                },
            ],
        },
        "engineeringContract": {
            "product_class": "water_treatment",
            "topology": [],
            "quantities": {},
        },
    }
    # connection-schedule.json shape the line list joins on (specs[].from_part/to_part
    # + size_label; rows[].from/to + size) — same as out/*/connection-schedule.json.
    schedule = {
        "specs": [
            {
                "from_part": "Fresh Water Tank",
                "to_part": "Fertigation Dosing Pump",
                "size_label": "DN150",
                "mechanism": "fluid_loop",
                "carried_rating": 90,
                "carried_unit": "m3/h",
                "phase": "liquid",
                "length_m": 12.0,
            },
            {
                "from_part": "Fertigation Dosing Pump",
                "to_part": "Distribution Manifold",
                "size_label": "DN100",
                "mechanism": "fluid_loop",
                "carried_rating": 90,
                "carried_unit": "m3/h",
                "phase": "liquid",
                "length_m": 8.0,
            },
            # Also key by topology slug (some archetypes write raw keys).
            {
                "from_part": "fresh_water_tank",
                "to_part": "fertigation_dosing_pump",
                "size_label": "DN150",
                "mechanism": "fluid_loop",
            },
            {
                "from_part": "fertigation_dosing_pump",
                "to_part": "distribution_manifold",
                "size_label": "DN100",
                "mechanism": "fluid_loop",
            },
        ],
        "rows": [
            {
                "from": "Fresh Water Tank",
                "to": "Fertigation Dosing Pump",
                "size": "DN150",
                "rating": "90 m3/h",
                "length_m": 12.0,
            },
            {
                "from": "Fertigation Dosing Pump",
                "to": "Distribution Manifold",
                "size": "DN100",
                "rating": "90 m3/h",
                "length_m": 8.0,
            },
        ],
    }
    work = tempfile.mkdtemp(prefix="procsched-t09-")
    state_path = Path(work) / "state.json"
    state_path.write_text(json.dumps(state))
    (Path(work) / "connection-schedule.json").write_text(json.dumps(schedule))
    summary, sc, md = PS.generate_process_schedules(work, str(state_path), rasterise_png=False)
    svg = Path(summary["svg"]).read_text()
    blob = md + "\n" + svg
    _check("Working Schematic" in blob,
           "T-09: generated content must carry Working Schematic title")
    _check("DN150" in blob or "DN150" in "".join(r.dn for r in sc.lines),
           f"T-09: expected DN150 in schedule content (lines={[r.dn for r in sc.lines]})")
    _check("DN100" in blob or "DN100" in "".join(r.dn for r in sc.lines),
           f"T-09: expected DN100 in schedule content (lines={[r.dn for r in sc.lines]})")
    # Valve tags from the BoM words must appear (HV-/PSV- family).
    vtags = [v.tag for v in sc.valves]
    _check(len(vtags) >= 1, f"T-09: expected ≥1 valve tag from synthetic BoM, got {vtags}")
    for t in vtags:
        _check(t in blob, f"T-09: valve tag {t!r} missing from generated schedule content")
    print(f"  PASS  (Working Schematic title; DN150+DN100 present; valve tags {vtags})")


def main():
    missing = [str(s) for _l, s, _d in CASES if not Path(s).is_file()]
    try:
        # T-09 synthetic proveCatch always runs (no corpus dependency).
        _run_t09_synthetic_dn_and_valve_tags()
        if missing:
            print("[proc-sched-test] SKIP corpus cases — state.json not found:\n  "
                  + "\n  ".join(missing))
        else:
            for label, state_path, sched in CASES:
                _run_case(label, state_path, sched)
            _run_schedule_less()
            _run_pump_duty_and_psv_set()
    except Fail as ex:
        print(f"\n[proc-sched-test] FAIL: {ex}")
        return 1
    print("\n[proc-sched-test] ALL PASS — Working Schematic (T-09) + process schedules "
          "cross-reference the P&ID line-for-line where corpus states are present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
