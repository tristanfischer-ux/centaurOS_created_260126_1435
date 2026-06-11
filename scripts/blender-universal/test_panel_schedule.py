#!/usr/bin/env python3
"""
scripts/blender-universal/test_panel_schedule.py

Headless test for draw_panel_schedule.py. Asserts the projected PANEL / LOAD
SCHEDULE is a REAL electrical schedule, not cosmetic — using small synthetic
schedule + state dicts (hermetic, no Blender, no /tmp), and then, if the
regenerated demo dirs exist, a light sanity pass over the real BESS / BESS-D2 /
VF schedules.

Invariants exercised (synthetic):
  1. Boards are grouped by distribution board; the fan-out hub = the MAIN board.
  2. Identical fan-out ways (rack[0..N]) COLLAPSE to ONE row annotated × N, and
     the per-way × N total is carried for the reconciliation (Σ stays honest).
  3. Each circuit row carries the real fields: ref, description, design current,
     a protective device (matched from the BoM, else a SIZED standard frame),
     a cable CSA, length, volt-drop %, and within-spec.
  4. Σ circuit design current ≈ the board busbar demand (reconciliation OK).
  5. A SERIES conversion-chain link (a node feeding exactly one downstream item)
     is NOT promoted to a board — only genuine fan-out / named boards are.
  6. D2: a '<x>_subdist' node gets its OWN schedule; its busbar / demand is the
     LV-side current (the local busway), NOT the MV feeder amps; the step-down
     transformer + its kVA-headroom verdict are surfaced.
  7. A breaker frame is SIZED ≥ design current × 1.25 when the BoM names none.

Run:
    python3 scripts/blender-universal/test_panel_schedule.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_panel_schedule as ps  # noqa: E402


_FAILS: list[str] = []


def check(cond, msg):
    if cond:
        print(f"  ok   {msg}")
    else:
        print(f"  FAIL {msg}")
        _FAILS.append(msg)


# ───────────────────────────────────────────────────────────────────────────
# Synthetic fixtures
# ───────────────────────────────────────────────────────────────────────────

def _word(cid, name, mfr="", pn="", rating=""):
    mods = []
    if mfr:
        mods.append({"kind": "manufacturer", "value": mfr})
    if pn:
        mods.append({"kind": "part_number", "value": pn})
    if rating:
        mods.append({"kind": "rating_primary", "value": rating})
    return {"name_human": name, "content_character": {"character_id": cid},
            "modifier_characters": mods}


def _state(quantities: dict, words: list) -> dict:
    return {
        "engineeringContract": {"product_class": "test_class",
                                "quantities": {k: {"value": v}
                                               for k, v in quantities.items()}},
        "moduleDecomposition": {"product_class": "test_class",
                                "modules": [{"sub_modules": [{"words": words}]}]},
    }


def _erow(frm, to, rating, size, drop, role=None, length_m=5.0, within=True):
    return {"mechanism": "electrical_bus", "from": frm, "to": to, "rating": rating,
            "size": size, "drop": drop, "role": role, "length_m": length_m,
            "within_spec": within, "line_total_gbp": 100.0}


# A plain BESS-like schedule: a DC bus 'switchgear' fans out to 15 rack taps + a
# chiller; plus the series conversion chain rack_block→pcs→transformer (NOT boards).
def fixture_plain():
    rows = [
        _erow("rack_block", "pcs", "1953.1 A", "3×400 mm²", "0.066% Vd"),       # chain
        _erow("pcs", "transformer", "1953.1 A", "3×400 mm²", "0.053% Vd"),      # chain
        _erow("switchgear", "(busway)", "1953.1 A", "3×400 mm²", "0.073% Vd",
              role="trunk"),
    ]
    for i in range(15):
        rows.append(_erow("switchgear", f"rack[{i}]", "130.2 A", "25 mm²",
                          "0.042% Vd", role="branch"))
    rows.append(_erow("switchgear", "chiller", "—", "(no rating — fallback)", "—",
                      role="branch"))
    schedule = {"rows": rows, "specs": [], "totals": {"grand_total_gbp": 24000.0}}
    state = _state(
        {"dc_bus_voltage_v": 800, "bus_continuous_current_a": 1250,
         "continuous_power_kw": 1000, "rack_count": 15, "cell_count": 3750,
         "cells_per_rack": 250, "system_thermal_dissipation_kw": 31.7,
         "hvac_expected_cop": 3.5},
        [_word("rack_dc_isolator", "rack DC isolator", "ABB", "OTDC200E02P", "200 A"),
         _word("ac_main_breaker", "AC main breaker", "ABB", "Emax E2.2 2500", "2300")])
    return schedule, state


# A D2-actuated schedule: a 250 kVA 11000/48 V step-down feeds switchgear_subdist,
# which then fans out to the 15 racks + chiller on its 48 V LV busbar.
def fixture_d2():
    rows = [
        {"mechanism": "electrical_bus", "from": "(primary)", "to": "(secondary)",
         "rating": "250 kVA", "size": "11000/48 V sub-distribution", "drop": "—",
         "role": "transformer", "length_m": None, "within_spec": True},
        _erow("switchgear", "switchgear_subdist", "13.1 A", "1.5 mm²", "0.043% Vd",
              role="feeder"),
        _erow("switchgear_subdist", "(local busway)", "1953.1 A", "3×400 mm²",
              "1.192% Vd", role="local_busway"),
    ]
    for i in range(15):
        rows.append(_erow("switchgear_subdist", f"rack[{i}]", "130.2 A", "25 mm²",
                          "2.0% Vd", role="branch"))
    rows.append(_erow("switchgear_subdist", "chiller", "—", "2.5 mm² (sense)", "—",
                      role="branch"))
    schedule = {"rows": rows, "specs": [], "totals": {"grand_total_gbp": 39000.0}}
    state = _state(
        {"dc_bus_voltage_v": 800, "bus_continuous_current_a": 1250,
         "continuous_power_kw": 1000, "rack_count": 15, "cell_count": 3750,
         "cells_per_rack": 250},
        [_word("rack_dc_isolator", "rack DC isolator", "ABB", "OTDC200E02P", "200 A")])
    return schedule, state


# A VF-like schedule: a TP&N 'control' board fans out to 8 LED racks + HVAC + pump.
# No explicit board voltage in state → must be INFERRED from the TP&N main breaker.
def fixture_vf():
    rows = [_erow("control", "(busway)", "46.9 A", "6 mm²", "0.353% Vd", role="trunk")]
    for i in range(8):
        rows.append(_erow("control", f"rack[{i}]", "5.9 A", "1.5 mm²", "0.028% Vd",
                          role="branch"))
    rows.append(_erow("control", "hvac", "—", "(no rating — fallback)", "—",
                      role="branch"))
    rows.append(_erow("control", "nutrient", "—", "(no rating — fallback)", "—",
                      role="branch"))
    schedule = {"rows": rows, "specs": [], "totals": {"grand_total_gbp": 2650.0}}
    state = _state(
        {"installed_lighting_kw": 15, "hvac_compressor_power_kw": 5.683,
         "ahu_fan_power_kw": 1.123, "irrigation_pump_motor_kw": 0.18},
        [_word("tp_n_main_breaker", "TP&N main breaker", "ABB", "Tmax XT1H 160 4p", "63"),
         _word("lighting_branch_breaker", "lighting branch breaker", "ABB",
               "S203-C", "17")])
    return schedule, state


# ───────────────────────────────────────────────────────────────────────────
# Tests
# ───────────────────────────────────────────────────────────────────────────

def test_plain():
    print("\n[plain BESS] DC bus → 15 racks + chiller; conversion chain not a board")
    sched, state = fixture_plain()
    panels = ps.build_schedules(sched, state)
    check(len(panels) == 1, f"exactly ONE board (got {len(panels)})")
    main = panels[0]
    check(main.kind == "main", "the board is the MAIN board")
    check("switchgear" in main.board_id, f"board is the fan-out hub (got {main.board_id})")
    # invariant 5: rack_block / pcs (series chain links) are NOT boards
    ids = {p.board_id for p in panels}
    check("rack_block" not in ids and "pcs" not in ids,
          "series conversion-chain links are NOT promoted to boards")
    # invariant 2: 15 identical rack ways collapse to ONE row × 15
    rack = next((c for c in main.circuits if "rack" in c.description.lower()), None)
    check(rack is not None and rack.ways == 15,
          f"15 rack ways collapsed to one row ×15 (got {rack.ways if rack else None})")
    check(rack is not None and rack.ref == "W1–15", f"way-range ref (got "
          f"{rack.ref if rack else None})")
    # invariant 3: real per-circuit fields
    check(abs((rack.design_a or 0) - 130.2) < 0.1, "rack design current = 130.2 A")
    check(rack.device and "ABB" in rack.device and "OTDC200E02P" in rack.device,
          f"rack device matched from BoM (got {rack.device!r})")
    check("25 mm²" in (rack.cable or ""), f"rack cable CSA present (got {rack.cable!r})")
    check(rack.voltdrop_pct is not None, "rack volt-drop captured")
    check(rack.within_spec is True, "rack within spec")
    # invariant 4: Σ reconciles
    rec = ps.reconcile(main)
    check(rec["verdict"] == "OK",
          f"reconciliation OK (ratio {rec['ratio']:.2f})" if rec["ratio"]
          else "reconciliation computed")
    check(abs(rec["sum_a"] - 1953.0) < 5, f"Σ circuit current ≈ 1953 A "
          f"(got {rec['sum_a']:.0f})")
    # the chiller's connected load is the ELECTRICAL input (thermal/COP), not 31.7 kW
    chill = next((c for c in main.circuits if "chiller" in c.description.lower()), None)
    check(chill is not None and chill.connected_kw is not None
          and chill.connected_kw < 15,
          f"chiller load is electrical (≈9 kW, got "
          f"{chill.connected_kw if chill else None})")


def test_d2():
    print("\n[D2 BESS] 250 kVA step-down → switchgear_subdist → racks (own schedule)")
    sched, state = fixture_d2()
    panels = ps.build_schedules(sched, state)
    check(len(panels) == 1, f"the load-bearing sub-board gets a schedule "
          f"(got {len(panels)})")
    sub = panels[0]
    check(sub.board_id == "switchgear_subdist", f"board is the subdist node "
          f"(got {sub.board_id})")
    check(sub.kind == "sub", "classed as a sub-distribution board")
    # invariant 6: busbar / demand is the LV side (1953 A), NOT the 13 A MV feeder
    check(sub.busbar_a is not None and abs(sub.busbar_a - 1953.1) < 5,
          f"busbar = LV-side current 1953 A, NOT the 13 A MV feeder "
          f"(got {sub.busbar_a})")
    check(sub.transformer_kva == 250.0, f"step-down transformer kVA surfaced "
          f"(got {sub.transformer_kva})")
    check("11000/48 V" in (sub.transformer or ""), "transformer ratio surfaced")
    rec = ps.reconcile(sub)
    check(rec["verdict"] == "OK", f"LV-domain reconciliation OK "
          f"(ratio {rec['ratio']:.2f})")
    # the kVA-headroom check FIRES (1000 kW load through a 250 kVA TX = OVER)
    check(rec["tx_headroom"] is not None and rec["tx_headroom"] > 1.0,
          f"transformer kVA-headroom flags OVER (got "
          f"{rec['tx_headroom']:.2f}× rating)")


def test_vf():
    print("\n[VF] TP&N 'control' board; voltage inferred from the BoM TP&N breaker")
    sched, state = fixture_vf()
    panels = ps.build_schedules(sched, state)
    check(len(panels) == 1, f"one TP&N board (got {len(panels)})")
    board = panels[0]
    # voltage INFERRED (no ac_output_voltage_v in state) → 400 V 3-phase TP&N
    check(board.voltage_v == 400.0 and board.phases == 3,
          f"board voltage inferred 400 V 3-phase (got {board.voltage_v} V / "
          f"{board.phases}-ph)")
    check("TP&N" in (board.system or "") or "3-phase" in (board.system or ""),
          f"system label is TP&N (got {board.system!r})")
    # LED grow-rack uses INSTALLED LIGHTING power ÷ ways = 1.875 kW (not whole-site demand)
    led = next((c for c in board.circuits if "led" in c.description.lower()), None)
    check(led is not None and led.ways == 8, f"8 LED ways collapsed "
          f"(got {led.ways if led else None})")
    check(led is not None and led.connected_kw is not None
          and abs(led.connected_kw - 1.875) < 0.1,
          f"LED per-way kW = installed_lighting/8 = 1.875 (got "
          f"{led.connected_kw if led else None})")
    check(led is not None and led.device and "S203-C" in led.device,
          f"LED branch breaker matched from BoM (got {led.device if led else None})")
    rec = ps.reconcile(board)
    check(rec["verdict"] == "OK", f"reconciliation OK (ratio {rec['ratio']:.2f})")


def test_breaker_sizing():
    print("\n[breaker sizing] an unnamed circuit gets a SIZED standard frame ≥ I×1.25")
    sched, state = fixture_vf()
    board = ps.build_schedules(sched, state)[0]
    # HVAC has no named breaker in the BoM → must be sized. 12.2 kW @ 400V 3ph ≈ 18.5 A
    # design current is unknown (rating-less feeder) so it sizes off… check it produced a
    # standard frame string at all for a circuit that DOES carry a design current:
    # synthesise a circuit with a known current and no matching device.
    label, amp = ps._device_for("unknown_motor", 145.0, [], board)
    check(amp is not None and amp >= 145.0 * 1.25,
          f"sized frame ≥ design×1.25 (145 A → {amp} A)")
    check(amp == 200, f"next standard frame above 181 A = 200 A (got {amp})")
    check("MCCB" in label or "MCB" in label, f"frame labelled (got {label!r})")


def test_render_smoke():
    print("\n[render] markdown + SVG produce non-trivial output with the key sections")
    for name, fx in (("plain", fixture_plain), ("d2", fixture_d2), ("vf", fixture_vf)):
        sched, state = fx()
        panels = ps.build_schedules(sched, state)
        md = ps.render_markdown("test_class", panels, sched)
        svg = ps.build_table_svg("test_class", panels, sched)
        check("PANEL / LOAD SCHEDULE" in md and "Reconciliation" in md
              and "| Ckt |" in md, f"[{name}] markdown has banner + table + reconcile")
        check(svg.startswith("<svg") and "TOTALS" in svg and len(svg) > 2000,
              f"[{name}] SVG renders the table")


def test_real_dirs():
    """Light sanity over the regenerated demo dirs IF present (not required to pass)."""
    print("\n[real dirs] sanity over regenerated /tmp schedules (skipped if absent)")
    cases = [
        ("/tmp/ps-bess", "../out/rerun-energy_storage/state.json", 1),
        ("/tmp/ps-bess-d2", "../out/rerun-energy_storage/state.json", 3),
        ("/tmp/ps-vf", "../out/rerun-vertical_farm/state.json", 1),
    ]
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(os.path.dirname(here))
    any_ran = False
    for out_dir, rel_state, expect_boards in cases:
        sched_path = os.path.join(out_dir, "connection-schedule.json")
        if not os.path.isfile(sched_path):
            print(f"  skip {out_dir} (no schedule — run build_universal_scene first)")
            continue
        any_ran = True
        state_path = os.path.join(repo, rel_state.replace("../", ""))
        summary, panels, _md = ps.generate_panel_schedule(
            out_dir, state_path if os.path.isfile(state_path) else None,
            rasterise_png=False)
        n = len(summary["panels"])
        check(n == expect_boards, f"{out_dir}: {n} board(s) (expected {expect_boards})")
        for pp in summary["panels"]:
            r = pp["reconcile"]
            if r["ratio"] is not None:
                check(r["verdict"] == "OK",
                      f"{out_dir} · {pp['name']}: reconciliation "
                      f"{r['verdict']} (ratio {r['ratio']:.2f})")
    if not any_ran:
        print("  (no regenerated dirs found — synthetic tests already cover the logic)")


def main():
    print("=" * 76)
    print("draw_panel_schedule.py — panel / load schedule tests")
    print("=" * 76)
    test_plain()
    test_d2()
    test_vf()
    test_breaker_sizing()
    test_render_smoke()
    test_real_dirs()
    print("\n" + "=" * 76)
    if _FAILS:
        print(f"RESULT: {len(_FAILS)} FAILURE(S)")
        for f in _FAILS:
            print(f"  ✗ {f}")
        return 1
    print("RESULT: ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
