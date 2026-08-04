#!/usr/bin/env python3
"""fpk_bar_b_readiness.py — Bar B checklist under assumptions (honest).

INTENT: Tristan asked whether frozen assumptions let us "complete Bar B".
Bar B is race/homologation (HIL, supplier Gerbers, dyno, chassis XYZ, bench CFD).
Assumptions cannot mint ship_ok. They CAN fill every Bar B row with either:
  - ASSUMED_CONCEPT — educated guess + screening evidence (replace when JLR sends data)
  - NEEDS_HARDWARE — predicted model ready; physical artefact still required
  - NEEDS_PARTNER_INPUT — must not invent (e.g. chassis XYZ, supplier Gerbers)

This register completes the *list for review*, not homologation.

Each row carries an executable_ask (artefact · format · conditions · unblocks ·
already_have · priority) so a supplier or test engineer can act without a
follow-up question. replace_with is the human one-paragraph form of that ask.

Run:
  python3 scripts/lib/fpk_bar_b_readiness.py --twin out/formula-e-front-mgu-20260729-1432
  python3 scripts/lib/fpk_bar_b_readiness.py --selftest
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional


SCHEMA = "forgeos.fpk.bar_b_readiness/v1"
OUTPUT_JSON = "JLR-FE-FRONT-FPK-BAR-B-READINESS.json"
OUTPUT_MD = "JLR-FE-FRONT-FPK-BAR-B-READINESS.md"

EXECUTABLE_ASK_REQUIRED_KEYS = (
    "artefact",
    "format",
    "conditions",
    "unblocks",
    "already_have",
    "priority",
)


def _load(path: Path) -> Optional[dict[str, Any]]:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _qty(quantities: Mapping[str, Any], key: str, default: Any = None) -> Any:
    raw = quantities.get(key)
    if isinstance(raw, Mapping) and "value" in raw:
        return raw.get("value")
    return default if raw is None else raw


def _fmt(val: Any, digits: int = 1) -> str:
    if val is None:
        return "—"
    try:
        return f"{float(val):.{digits}f}"
    except (TypeError, ValueError):
        return str(val)


def _executable_ask(
    *,
    artefact: str,
    format: str,
    conditions: str,
    unblocks: str,
    already_have: str,
    priority: int,
) -> dict[str, Any]:
    """Build a structured supplier/test-engineer ask (all fields required)."""

    return {
        "artefact": artefact,
        "format": format,
        "conditions": conditions,
        "unblocks": unblocks,
        "already_have": already_have,
        "priority": int(priority),
    }


def _prefer_kit_case_em(motor_stack: Path) -> tuple[dict[str, Any], str]:
    """Prefer coherent Path B DEC-009 kit-case over baseline REBALANCED file."""
    path_b = motor_stack / "em_fia_front_kit_case_PATH_B_DEC009.json"
    baseline = motor_stack / "em_fia_front_kit_case.json"
    for path, label in ((path_b, "PATH_B_DEC009"), (baseline, "kit_case")):
        em = _load(path) or {}
        if not em:
            continue
        if path != path_b:
            return em, label
        g = em.get("machine_geometry") if isinstance(em.get("machine_geometry"), Mapping) else {}
        w = (
            em.get("works_in_kit_context")
            if isinstance(em.get("works_in_kit_context"), Mapping)
            else {}
        )
        sw = ((em.get("rotor_position_sweep") or {}).get("summary") or {})
        try:
            active = float(g.get("active_length_mm") or 0)
            mag_t = float(g.get("magnet_thickness_mm") or 0)
            mag_l = float(g.get("magnet_length_mm") or 0)
            mean = w.get("torque_magnitude_mean_nm") or sw.get("torque_magnitude_mean_nm")
            sign_ok = sw.get("torque_sign_consistent") is True
            rev_ok = sw.get("sign_reversals") is not None and int(sw.get("sign_reversals")) == 0
            geom_ok = (
                abs(active - 130.0) < 0.05
                and abs(mag_t - 6.0) < 0.01
                and abs(mag_l - 22.5) < 0.01
            )
            if mean is not None and float(mean) > 0 and sign_ok and rev_ok and geom_ok:
                return em, label
        except (TypeError, ValueError):
            continue
    return {}, "none"


def build_bar_b(twin_dir: Path) -> dict[str, Any]:
    """Build Bar B readiness rows from twin screens + decisions.

    @description Completes the Bar B checklist for review under assumptions.
    @param twin_dir Twin directory
    @returns Bar B readiness object (ship_ok always false)
    """

    state = _load(twin_dir / "state.json") or {}
    quantities = (
        ((state.get("orchestratorContract") or {}).get("quantities"))
        if isinstance(state.get("orchestratorContract"), Mapping)
        else {}
    )
    if not isinstance(quantities, Mapping):
        quantities = {}
    motor_stack = twin_dir / "_motor_stack"
    em, em_source = _prefer_kit_case_em(motor_stack)
    cool = _load(motor_stack / "analytical_fia_cooling_network_screen.json") or {}
    rotor = _load(motor_stack / "calculix_fia_rotor_screen.json") or {}
    pocket = _load(motor_stack / "calculix_fia_magnet_pocket_screen.json") or {}
    hw = _load(motor_stack / "hardware_correlation_bench_prep.json") or {}
    inv = _load(motor_stack / "inverter_packaging_fia_front_kit_case.json") or {}
    mm = _load(twin_dir / "motor-multiphysics.json") or {}
    pcb_stage = _load(twin_dir / "pcb-stage.json") or {}
    homologation = (
        state.get("homologationHonesty")
        if isinstance(state.get("homologationHonesty"), Mapping)
        else {}
    )
    pcb = state.get("pcb") if isinstance(state.get("pcb"), Mapping) else {}
    em_works = em.get("works_in_kit_context") if isinstance(em.get("works_in_kit_context"), Mapping) else {}
    cool_scr = cool.get("screening_results") if isinstance(cool.get("screening_results"), Mapping) else {}
    cool_in = cool.get("input_quantities") if isinstance(cool.get("input_quantities"), Mapping) else {}
    inv_scr = inv.get("screening_results") if isinstance(inv.get("screening_results"), Mapping) else {}
    rotor_works = (
        rotor.get("works_in_kit_context")
        if isinstance(rotor.get("works_in_kit_context"), Mapping)
        else {}
    )
    rotor_scr = (
        rotor.get("screening_results")
        if isinstance(rotor.get("screening_results"), Mapping)
        else {}
    )
    rotor_margins = (
        rotor.get("margins") if isinstance(rotor.get("margins"), Mapping) else {}
    )
    rotor_fos = (
        rotor_works.get("minimum_factor_of_safety")
        or rotor.get("minimum_factor_of_safety")
        or rotor_scr.get("minimum_factor_of_safety")
        or rotor_scr.get("screening_fos_vs_yield")
        or rotor_scr.get("screening_fos")
        or rotor_margins.get("screening_fos_vs_assumed_yield")
        or rotor_margins.get("minimum_factor_of_safety")
    )

    max_rpm = _qty(quantities, "max_rotor_speed_rpm", 19500)
    coolant_inlet_c = cool_in.get("coolant_inlet_c") or _qty(quantities, "coolant_inlet_c", 60)
    coolant_flow = cool_in.get("coolant_flow_l_min") or _qty(quantities, "coolant_flow_l_min", 12)
    iron_loss_w = cool_in.get("iron_loss_w") or _qty(quantities, "mgu_iron_loss_w", 6035.1)
    slot_k = cool_in.get("slot_to_iron_k_per_w", 0.006)
    jacket_k = cool_in.get("iron_to_jacket_k_per_w", 0.0077)
    esl_nh = inv_scr.get("bus_esl_nominal_nh")
    if esl_nh is None:
        esl_nh = (inv or mm.get("inverterPackaging") or {}).get("bus_esl_nominal_nh", 6.39)
    inv_kw = inv_scr.get("inverter_dissipated_kw") or _qty(quantities, "inverter_dissipated_kw", 4.318)
    t_module = cool_scr.get("maximum_module_temperature_c")
    delta_p = cool_scr.get("total_delta_p_kpa")
    # Dual bars: architecture power bar from twin stamp when Path B adopted
    arch_q = quantities.get("architecture_duty_shaft_torque_nm")
    bind_q = quantities.get("binding_duty_shaft_torque_nm")
    fe_q = quantities.get("last_sign_consistent_kit_case_fe_mean_nm")
    required_tq = em_works.get("required_shaft_torque_nm") or 125.2193
    mean_tq = em_works.get("torque_magnitude_mean_nm") or em_works.get("loaded_torque_magnitude_nm")
    if em_source == "PATH_B_DEC009":
        if isinstance(arch_q, Mapping) and arch_q.get("value") is not None:
            required_tq = arch_q.get("value")
        if isinstance(fe_q, Mapping) and fe_q.get("value") is not None:
            mean_tq = fe_q.get("value")
    bind_tq = bind_q.get("value") if isinstance(bind_q, Mapping) else None
    duty_regen_s = _qty(quantities, "duty_regen_time_s", 24)
    duty_motor_s = _qty(quantities, "duty_motoring_time_s", 76)
    cycle_s = None
    try:
        cycle_s = float(duty_regen_s or 0) + float(duty_motor_s or 0)
    except (TypeError, ValueError):
        cycle_s = 100.0
    if not cycle_s:
        cycle_s = 100.0

    pcb_pipe = pcb.get("pipeline") if isinstance(pcb.get("pipeline"), Mapping) else {}
    pcb_drc = pcb_pipe.get("drc") if isinstance(pcb_pipe.get("drc"), Mapping) else {}
    pcb_boards = []
    arch = pcb.get("architecture") if isinstance(pcb.get("architecture"), Mapping) else {}
    if isinstance(arch.get("boards"), list):
        pcb_boards = [b.get("boardId") for b in arch["boards"] if isinstance(b, Mapping)]
    if not pcb_boards and isinstance(pcb_stage.get("boardPipelines"), list):
        pcb_boards = [
            b.get("boardId")
            for b in pcb_stage["boardPipelines"]
            if isinstance(b, Mapping)
        ]
    n_boards = len(pcb_boards) if pcb_boards else (
        2 if pcb_stage.get("boardPipelines") else 0
    )
    not_fab = bool(
        pcb_stage.get("NOT_FABRICATION_READY")
        or pcb.get("NOT_FABRICATION_READY")
        or pcb_stage.get("forgeDraftOnly")
    )
    drc_viol = pcb_drc.get("violations")
    if drc_viol is None and isinstance(pcb_stage.get("pipeline"), Mapping):
        drc_viol = ((pcb_stage.get("pipeline") or {}).get("drc") or {}).get("violations")

    rotor_speed_scr = rotor_scr.get("operating_speed_rpm") or max_rpm

    rows = [
        {
            "id": "BARB-SIC-MODULE",
            "bar_b_item": "SiC module identity + thermal limit (DEC-001)",
            "closure_class": "ASSUMED_CONCEPT",
            "decision_register": ["DEC-001"],
            "assumed_value": (
                "3× traction half-bridge class; analytical inverter dissipation "
                f"~{_fmt(inv_kw, 3)} kW; "
                f"ESL seed ~{_fmt(esl_nh, 2)} nH; "
                "N42UH-class magnet / SiC loss model — not a frozen supplier MPN"
            ),
            "result_under_assumption": (
                f"Cooling network T_module≈{_fmt(t_module)} °C "
                f"at A-COOL; packaging screen present"
            ),
            "evidence": [
                "_motor_stack/analytical_fia_cooling_network_screen.json",
                "_motor_stack/inverter_packaging_fia_front_kit_case.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": (
                f"Please freeze the SiC traction half-bridge module MPN and send the "
                f"full datasheet (PDF), package STEP with terminal/pad geometry, "
                f"Rth(j-c)/Rth(c-s) curves, and Tj max / short-circuit SOA, matched to "
                f"the twin seed of {_fmt(inv_scr.get('sic_module_count', 3), 0)} modules "
                f"and ~{_fmt(inv_kw, 3)} kW inverter dissipation under A-COOL "
                f"({_fmt(coolant_inlet_c, 0)} °C / {_fmt(coolant_flow, 0)} L/min) — this "
                f"closes BARB-SIC-MODULE and unblocks heater-plate (BARB-HEATER-PLATE) "
                f"and double-pulse (BARB-DOUBLE-PULSE) stack geometry; we already hold "
                f"an analytical ESL seed (~{_fmt(esl_nh, 2)} nH) and packaging screen, "
                f"not a supplier MPN or measured ESL."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Frozen supplier SiC half-bridge module identity: manufacturer part "
                    "number, package outline, terminal/pad geometry, and thermal limits"
                ),
                format=(
                    "PDF datasheet + package STEP (or supplier 3D with pad/terminal "
                    "datums) + CSV or datasheet tables for Rth(j-c), Rth(c-s), Tj max, "
                    "short-circuit SOA; pinout netlist for gate/desat/NTC if separate "
                    "from Gerber ICD"
                ),
                conditions=(
                    f"Revision-matched to the traction inverter BOM line; thermal "
                    f"ratings quoted at or convertible to A-COOL coolant "
                    f"{_fmt(coolant_inlet_c, 0)} °C / {_fmt(coolant_flow, 0)} L/min and "
                    f"design phase current class (DEC-001); do not substitute a "
                    f"different package family without calling it a new revision"
                ),
                unblocks=(
                    "BARB-SIC-MODULE (DEC-001); enables BARB-HEATER-PLATE TIM/stack "
                    "geometry and BARB-DOUBLE-PULSE commutation-loop layout; removes "
                    "module_mpn_and_step OPEN on inverter packaging screen"
                ),
                already_have=(
                    f"Analytical 3× half-bridge class seed; inverter dissipation "
                    f"~{_fmt(inv_kw, 3)} kW; bus ESL analytical seed "
                    f"~{_fmt(esl_nh, 2)} nH (band 3–15 nH); cooling network "
                    f"T_module≈{_fmt(t_module)} °C screening — no supplier MPN, "
                    f"no package STEP, no measured Rth"
                ),
                priority=6,
            ),
            "homologation_status": "OPEN",
        },
        {
            "id": "BARB-ROTOR-RETENTION",
            "bar_b_item": "Rotor retention / overspeed (DEC-006)",
            "closure_class": "ASSUMED_CONCEPT",
            "decision_register": ["DEC-006"],
            "assumed_value": (
                f"Max speed {_fmt(max_rpm, 0)} rpm (contract quantity); "
                "CalculiX centrifugal + magnet-pocket screens as retention seed "
                "(not instrumented overspeed)"
            ),
            "result_under_assumption": (
                f"Rotor screening FoS≈{_fmt(rotor_fos, 3) if rotor_fos is not None else '—'}; "
                f"pocket screen present={pocket.get('status') == 'PARTIAL' or bool(pocket)}; "
                f"screen speed={_fmt(rotor_speed_scr, 0)} rpm"
            ),
            "evidence": [
                "_motor_stack/calculix_fia_rotor_screen.json",
                "_motor_stack/calculix_fia_magnet_pocket_screen.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": (
                f"Please run an instrumented overspeed / retention test on a "
                f"revision-matched rotor (sleeve/bridge/magnet pocket as built) through "
                f"approved speed steps up to at least the controlled max used speed "
                f"(contract screen {_fmt(rotor_speed_scr, 0)} rpm; DEC-009 target class "
                f"24,000 rpm if that revision is the release article), logging speed, "
                f"vibration, strain or radial growth, and post-test NDT/photo of "
                f"magnets and retention — deliver CSV + signed PDF report; closes "
                f"BARB-ROTOR-RETENTION / DEC-006 (screening FoS≈"
                f"{_fmt(rotor_fos, 3) if rotor_fos is not None else '—'} is not a release "
                f"factor). We already hold CalculiX centrifugal and magnet-pocket "
                f"screens; do not re-send FEA-only evidence."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Instrumented overspeed / rotor retention test on the "
                    "revision-matched rotor article (magnets, sleeve/bridge, pockets)"
                ),
                format=(
                    "CSV time-series: time_s, rotor_speed_rpm, vibration channels, "
                    "strain or radial_growth_um; plus PDF report with speed-step table, "
                    "post-test inspection photos/NDT, and pass/fail vs acceptance band"
                ),
                conditions=(
                    f"Guarded spin rig; speed steps through approved schedule to at "
                    f"least controlled max used speed (live screen "
                    f"{_fmt(rotor_speed_scr, 0)} rpm; use DEC-009 release speed if that "
                    f"is the frozen article); ambient and rotor temperature logged; "
                    f"article serial + drawing revision on the header row; retention "
                    f"must remain intact with no magnet shift"
                ),
                unblocks=(
                    "BARB-ROTOR-RETENTION and DEC-006; supplies the measured strain/"
                    "growth that can reverse DEC-009 only if release-grade FoS fails "
                    "(do not reverse DEC-009 by opinion)"
                ),
                already_have=(
                    f"CalculiX rotor screen (FoS≈"
                    f"{_fmt(rotor_fos, 3) if rotor_fos is not None else '—'} vs assumed "
                    f"yield at {_fmt(rotor_speed_scr, 0)} rpm) and magnet-pocket screen; "
                    f"hardware_correlation hold OVERSPEED_ROTOR_RETENTION recipe — no "
                    f"instrumented spin data"
                ),
                priority=7,
            ),
            "homologation_status": "OPEN",
        },
        {
            "id": "BARB-DUTY-CYCLE",
            "bar_b_item": "Duty-cycle / E_net authority (DEC-007)",
            "closure_class": "ASSUMED_CONCEPT",
            "decision_register": ["DEC-007"],
            "assumed_value": (
                f"Continuous design duty {_qty(quantities, 'front_regen_electrical_cap_kw', 250)} kW "
                f"front regen; twin vignette { _fmt(duty_regen_s, 0)} s regen / "
                f"{_fmt(cycle_s, 0)} s cycle (DEC-008 intermittent); public FIA energy "
                f"tools as placeholder spectrum"
            ),
            "result_under_assumption": (
                f"EM source={em_source}; duty screen ok={em_works.get('duty_torque_screen_ok')} "
                f"(torque_reliable={em_works.get('torque_reliable')}); "
                f"mean |T|≈{_fmt(mean_tq, 2)} N·m vs architecture duty≈{_fmt(required_tq, 2)} N·m"
                f"{f' (conservative binding≈{_fmt(bind_tq, 2)} N·m)' if bind_tq is not None else ''}; "
                f"DEC-008 vignette {_fmt(duty_regen_s, 0)}s/{_fmt(cycle_s, 0)}s"
            ),
            "evidence": [
                "_motor_stack/em_fia_front_kit_case_PATH_B_DEC009.json"
                if em_source == "PATH_B_DEC009"
                else "_motor_stack/em_fia_front_kit_case.json",
                "_motor_stack/em_fia_torque_map_screen.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": (
                f"Please send team lap telemetry (or FIA energy-tool export) that is "
                f"authority for this car/season: CSV with columns time_s, "
                f"vehicle_speed_kph (or axle_speed_rpm), front_axle_regen_power_kw "
                f"OR hv_dc_current_a + hv_dc_voltage_v, and brake_pressure_bar; "
                f"≥20 Hz sampling (100 Hz preferred); at least one full race stint or "
                f"≥10 flying laps at representative fuel/energy load. This is the only "
                f"artefact that confirms or reverses DEC-008 intermittent duty "
                f"({_fmt(duty_regen_s, 0)} s regen every {_fmt(cycle_s, 0)} s) — do not "
                f"re-open DEC-008/009 by opinion; DEC-009 hangs on DEC-008. Closes "
                f"BARB-DUTY-CYCLE / DEC-007 and sets E_net authority. We already hold "
                f"the twin vignette and public-tool placeholder spectrum."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Team lap / stint telemetry or FIA energy-tool export that is the "
                    "named duty-cycle authority for this car and season"
                ),
                format=(
                    "CSV (UTF-8) with header row and columns at minimum: time_s, "
                    "vehicle_speed_kph OR axle_speed_rpm, front_axle_regen_power_kw "
                    "OR (hv_dc_current_a AND hv_dc_voltage_v), brake_pressure_bar; "
                    "optional: throttle, inverter_temp_c, coolant_temp_c. One file per "
                    "stint/session plus a one-page PDF stating car, event, tyre set, "
                    "and energy mode"
                ),
                conditions=(
                    f"Sampling ≥20 Hz (100 Hz preferred), time-synchronised channels, "
                    f"no gaps >0.5 s during flying laps; ≥10 flying laps or one full "
                    f"race stint at representative energy load; channel units SI as "
                    f"named; if only axle torque is available, state the gear ratio "
                    f"used. Compare against twin DEC-008 vignette "
                    f"{_fmt(duty_regen_s, 0)} s regen / {_fmt(cycle_s, 0)} s cycle — "
                    f"materially higher duty (guide: continuous regen fraction ≳40%) "
                    f"is the data that reverses DEC-008 (and then forces DEC-009 "
                    f"re-score); lower or equal duty confirms it"
                ),
                unblocks=(
                    "BARB-DUTY-CYCLE and DEC-007 (E_net authority); confirms or "
                    "reverses DEC-008 intermittent duty from data only; DEC-009 "
                    "thermal/torque case hangs on DEC-008 — do not reverse either "
                    "decision by opinion"
                ),
                already_have=(
                    f"Twin illustrative vignette duty_regen_time_s="
                    f"{_fmt(duty_regen_s, 0)} / duty_motoring_time_s="
                    f"{_fmt(duty_motor_s, 0)}; front regen cap "
                    f"{_qty(quantities, 'front_regen_electrical_cap_kw', 250)} kW; "
                    f"public FIA energy-tool placeholder spectrum; EM duty screen "
                    f"under that assumption — no team lap CSV"
                ),
                priority=1,
            ),
            "homologation_status": "OPEN",
        },
        {
            "id": "BARB-HIL",
            "bar_b_item": "HIL on populated inverter (DEC-008)",
            "closure_class": "NEEDS_HARDWARE",
            "decision_register": ["DEC-008"],
            "assumed_value": (
                "Firmware bring-up contract SPEC complete "
                "(FAB-READY — UNPROVEN IN HARDWARE); cannot assume HIL PASS"
            ),
            "result_under_assumption": (
                "Contract checklist SPEC; hil_present="
                f"{homologation.get('hil_present', False)}; "
                f"bring-up verdict from firmware/bring-up-contract.json"
            ),
            "evidence": [
                "firmware/README.md",
                "firmware/bring-up-contract.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": (
                "Please run HIL on the populated inverter revision (gate-drive + "
                "control boards mated to the frozen SiC module) against a real-time "
                "plant model: deliver pass/fail matrix + timestamped logs covering "
                "safe-off, desat/OC (<10 µs class), phase-current and DC-link sense "
                "scaling (±5%), resolver track, CAN-FD loss, and HVIL — PDF summary + "
                "CSV/MF4 traces, board serials and firmware hash on the header. Closes "
                "BARB-HIL only on measured PASS (bring-up is FAB-READY_UNPROVEN_IN_"
                "HARDWARE today). We already hold the bring-up contract and channel "
                "checklist; do not re-send SPEC-only paperwork."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Hardware-in-the-loop pass on the populated inverter revision "
                    "(control + gate-drive + SiC power stage as a unit)"
                ),
                format=(
                    "PDF HIL report with case matrix (pass/fail, timing) + raw logs "
                    "CSV or MF4: time_s, commanded_state, gate_enable, desat_trip, "
                    "phase_current_a[3], vdc_v, resolver_angle_rad, can_status, "
                    "hvil_status; firmware git hash and board serials in metadata"
                ),
                conditions=(
                    "Populated hardware revision-matched to the frozen module and "
                    "Gerber set; cases must include normal torque track, sensor-fault "
                    "injection, resolver loss, CAN-FD loss, desaturation / OC safe-off "
                    "(target ≤10 µs class per bring-up contract), and HVIL open; "
                    "scaled analogue channels within ±5% of plant; no unsafe output "
                    "persists after a trip; ambient and coolant conditions logged"
                ),
                unblocks=(
                    "BARB-HIL; required before any claim of functionally verified "
                    "inverter firmware. Note: decision-register DEC-008 id is also "
                    "used for A-DUTY intermittent freeze — HIL evidence does not by "
                    "itself reverse the duty vignette; duty reversal needs "
                    "BARB-DUTY-CYCLE lap CSV"
                ),
                already_have=(
                    "firmware/bring-up-contract.json "
                    "(verdict FAB-READY_UNPROVEN_IN_HARDWARE, hil_present=false); "
                    "channel counts (phase_current×3, resolver×1, coolant_temp, HVIL); "
                    "safe-off desat_oc target 10 µs class; HIL_POPULATED_INVERTER "
                    "bench recipe — no HIL pass log"
                ),
                priority=8,
            ),
            "homologation_status": "OPEN",
            "software_prep": "READY_FOR_BENCH",
        },
        {
            "id": "BARB-GERBERS",
            "bar_b_item": "Supplier Gerbers / pinout ICD (DEC-009)",
            "closure_class": "NEEDS_PARTNER_INPUT",
            "decision_register": ["DEC-009"],
            "assumed_value": (
                "Forge KiCad/Gerber drafts are engineering review only — "
                "not supplier release; cannot invent supplier Gerbers"
            ),
            "result_under_assumption": (
                f"PCB disposition={pcb.get('disposition')}; "
                f"boards={n_boards} ({', '.join(str(b) for b in pcb_boards) or '—'}); "
                f"DRC violations={drc_viol if drc_viol is not None else '—'}; "
                f"NOT_FABRICATION_READY={not_fab}; pipeline.ok="
                f"{pcb_pipe.get('ok')}; supplier Gerbers OPEN"
            ),
            "evidence": ["state.pcb", "pcb-stage.json", "pcb-boards/ (if present)"],
            "blocks_ship_ok": True,
            "replace_with": (
                f"Please issue supplier-release Gerber + drill + pick-and-place + "
                f"pinout ICD for the traction gate-drive and traction control boards "
                f"mated to the frozen SiC module MPN (RS-274X or ODB++, Excellon, "
                f"IPC-D-356, positions CSV, PDF pinout with net names and connector "
                f"part numbers, stack-up and controlled-impedance notes). Do not "
                f"re-send our Forge KiCad drafts — we already have {n_boards} routed "
                f"boards"
                f"{(' (' + ', '.join(str(b) for b in pcb_boards) + ')') if pcb_boards else ''}"
                f", DRC {drc_viol if drc_viol is not None else 0} violations, marked "
                f"NOT_FABRICATION_READY / forgeDraftOnly. Closes BARB-GERBERS only "
                f"when the pack is supplier-stamped; millimetres and layer stack must "
                f"come from you."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Supplier-release PCB fabrication pack and pinout ICD for the "
                    "inverter control and gate-drive boards, revision-locked to the "
                    "frozen SiC module"
                ),
                format=(
                    "Gerber RS-274X (or ODB++) + Excellon drill + IPC-D-356 netlist + "
                    "pick-and-place CSV + PDF pinout/connector ICD (net name, pin, "
                    "mating connector MPN) + stack-up PDF with controlled-impedance "
                    "targets; one zip per board with drawing number and rev in the "
                    "filename"
                ),
                conditions=(
                    "Boards must mate to the frozen SiC module MPN and chassis LV/CAN "
                    "and HV interfaces; creepage/clearance stated for the HV domain; "
                    "rev letter frozen; DRC clean on supplier ruleset; explicitly "
                    "labelled SUPPLIER RELEASE (not engineering review). Do not invent "
                    "or ask us to invent pad coordinates for a module you have not frozen"
                ),
                unblocks=(
                    "BARB-GERBERS; required before fabrication and before HIL on "
                    "production-intent bare boards. Note: decision-register DEC-009 "
                    "id is also used for DEC-EM-1 24 krpm/130 mm freeze — Gerber "
                    "evidence does not reverse that EM decision"
                ),
                already_have=(
                    f"Forge KiCad drafts only: {n_boards} routed boards"
                    f"{(' (' + ', '.join(str(b) for b in pcb_boards) + ')') if pcb_boards else ''}"
                    f", pipeline complete, DRC violations="
                    f"{drc_viol if drc_viol is not None else 0}, "
                    f"NOT_FABRICATION_READY={not_fab}, supplier_gerbers=OPEN — "
                    f"engineering review, not a fab release"
                ),
                priority=5,
            ),
            "homologation_status": "OPEN",
        },
        {
            "id": "BARB-DYNO",
            "bar_b_item": "Motor + inverter dyno correlation (DEC-010)",
            "closure_class": "NEEDS_HARDWARE",
            "decision_register": ["DEC-010"],
            "assumed_value": (
                "Hybrid EM map + loss/FW screens under A-DUTY/A-MAG/A-SPEED/A-BUS — "
                "predicted model only, not measured map"
            ),
            "result_under_assumption": (
                f"duty_torque_screen_ok={em_works.get('duty_torque_screen_ok')}; "
                f"mean |T|≈{_fmt(mean_tq, 2)} N·m / required≈{_fmt(required_tq, 2)} N·m; "
                f"iron_loss_w screening≈{_fmt(iron_loss_w, 0)} W (range 3.9–8.5 kW); "
                "torque_map status remains OPEN for dyno"
            ),
            "evidence": [
                "_motor_stack/em_fia_front_kit_case.json",
                "_motor_stack/em_fia_mtpa_screen.json",
                "_motor_stack/em_fia_torque_map_screen.json",
                "_motor_stack/em_fia_voltage_fw_screen.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": (
                f"Please run a calibrated motor+inverter dyno map on the "
                f"revision-matched assembly at A-COOL coolant inlet "
                f"{_fmt(coolant_inlet_c, 0)} °C / {_fmt(coolant_flow, 0)} L/min: speed "
                f"grid 0–max used rpm in ≤1000 rpm steps (include base and "
                f"{_fmt(max_rpm, 0)} rpm class points), torque grid 0–"
                f"{_fmt(required_tq, 1)} N·m in ≤25 N·m steps at each speed, log shaft "
                f"torque, speed, DC/AC power, η, winding/magnet/module/coolant "
                f"temperatures, and a calorimetric loss split (coolant ΔT×ṁ×cp plus "
                f"shaft power balance — not shaft torque alone) so the iron-loss "
                f"screening band 3.9–8.5 kW (point estimate {_fmt(iron_loss_w, 0)} W) "
                f"can collapse. Deliver CSV + calibration certificates. Closes "
                f"BARB-DYNO / DEC-010 and narrows BARB-DUTY-CYCLE thermal integrals; "
                f"we already hold hybrid EM/MTPA/FW predicted maps."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Calibrated dyno torque / efficiency / thermal map of the "
                    "revision-matched MGU + inverter assembly, with calorimetric "
                    "loss split"
                ),
                format=(
                    "CSV with columns: speed_rpm, shaft_torque_nm, shaft_power_kw, "
                    "vdc_v, idc_a, id_a, iq_a, ac_power_kw, efficiency, "
                    "coolant_inlet_c, coolant_outlet_c, coolant_flow_l_min, "
                    "winding_temp_c, magnet_temp_c_or_rotor_proxy_c, module_temp_c, "
                    "calorimetric_loss_w, electrical_loss_w; plus PDF run sheet and "
                    "torque-transducer / meter calibration certificates"
                ),
                conditions=(
                    f"Coolant held at A-COOL: inlet {_fmt(coolant_inlet_c, 0)} °C ±2 °C, "
                    f"flow {_fmt(coolant_flow, 0)} L/min ±5%; DC bus at kit voltage "
                    f"class ({_fmt(_qty(quantities, 'dc_bus_voltage_v', 750), 0)} V "
                    f"nominal); speed grid 0 to max used rpm in steps ≤1000 rpm "
                    f"(include base speed and {_fmt(max_rpm, 0)} rpm class); torque "
                    f"grid 0 to ≥{_fmt(required_tq, 1)} N·m in steps ≤25 N·m at each "
                    f"speed; steady thermal soak at each map corner; calorimetric "
                    f"loss from coolant ΔT×ṁ×cp required (shaft torque alone will not "
                    f"collapse the 3.9–8.5 kW iron-loss range); assembly revision hash "
                    f"on the header"
                ),
                unblocks=(
                    "BARB-DYNO and DEC-010; narrows BARB-DUTY-CYCLE loss integrals and "
                    "the iron-loss screening range 3.9–8.5 kW; acceptance guide "
                    "±10% torque / ±3 pp efficiency vs predicted model at matched "
                    "points (from hardware_correlation_bench_prep). Never sets "
                    "torque_reliable from software alone"
                ),
                already_have=(
                    f"Predicted EM front-kit case, MTPA, torque-map and voltage-FW "
                    f"screens; required shaft torque ≈{_fmt(required_tq, 2)} N·m; "
                    f"screening iron_loss_w≈{_fmt(iron_loss_w, 0)} W "
                    f"(basis screening_estimate, range 3.9–8.5 kW); DYNO hold recipe "
                    f"— no measured dyno CSV"
                ),
                priority=2,
            ),
            "homologation_status": "OPEN",
            "software_prep": "READY_FOR_BENCH",
        },
        {
            "id": "BARB-FLOW-BENCH",
            "bar_b_item": "Flow bench jacket + cold plate",
            "closure_class": "NEEDS_HARDWARE",
            "decision_register": [],
            "assumed_value": (
                f"A-COOL {_fmt(coolant_inlet_c, 0)} °C / {_fmt(coolant_flow, 0)} L/min; "
                "OF duct Δp + coupled network temperatures"
            ),
            "result_under_assumption": (
                f"Δp≈{_fmt(delta_p)} kPa; "
                f"coupled_ok={cool_scr.get('coupled_screen_ok')}; "
                f"T_module≈{_fmt(t_module)} °C; "
                f"slot_to_iron_k_per_w={slot_k}; iron_to_jacket_k_per_w={jacket_k}"
            ),
            "evidence": [
                "_motor_stack/openfoam_fia_water_jacket_case.json",
                "_motor_stack/openfoam_fia_cold_plate_case.json",
                "_motor_stack/analytical_fia_cooling_network_screen.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": (
                f"Please flow-bench the revision-matched motor water jacket and "
                f"inverter cold plate separately and in series: EGW mix as kit, inlet "
                f"{_fmt(coolant_inlet_c, 0)} °C, step flow from ~3 to ~20 L/min "
                f"(include the A-COOL point {_fmt(coolant_flow, 0)} L/min), record "
                f"stabilised inlet/outlet pressure (kPa), flow (L/min), and fluid "
                f"temperatures; add wall/near-wall temperature taps on stator iron, "
                f"slot/winding proxy, jacket wall, module case and cold-plate land so "
                f"we can calibrate screening constants slot_to_iron_k_per_w={slot_k} "
                f"and iron_to_jacket_k_per_w={jacket_k} in "
                f"analytical_fia_cooling_network_screen.py. CSV + calibration certs. "
                f"Closes BARB-FLOW-BENCH (model Δp≈{_fmt(delta_p)} kPa today). We "
                f"already hold OpenFOAM jacket/cold-plate cases and the coupled "
                f"network screen."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Measured pressure-flow and temperature-instrumented flow-bench "
                    "curves for the motor water jacket and inverter cold plate"
                ),
                format=(
                    "CSV per article (jacket, cold_plate, optional series): "
                    "flow_l_min, p_inlet_kpa, p_outlet_kpa, delta_p_kpa, "
                    "t_fluid_in_c, t_fluid_out_c, t_wall_iron_c, t_slot_or_winding_c, "
                    "t_jacket_wall_c, t_module_case_c, t_cold_plate_land_c; PDF rig "
                    "schematic and instrument calibration certificates"
                ),
                conditions=(
                    f"Coolant mix and inlet temperature controlled to A-COOL class "
                    f"({_fmt(coolant_inlet_c, 0)} °C ±2 °C); flow stepped across "
                    f"approximately 3–20 L/min including the kit point "
                    f"{_fmt(coolant_flow, 0)} L/min; each point thermally stabilised; "
                    f"articles revision-matched to release CAD; temperature taps on "
                    f"iron, slot/winding proxy, jacket wall, module case and cold-plate "
                    f"land required for Rth calibration (Δp-only curves are not enough "
                    f"to retune slot_to_iron_k_per_w={slot_k} and "
                    f"iron_to_jacket_k_per_w={jacket_k})"
                ),
                unblocks=(
                    "BARB-FLOW-BENCH; calibrates analytical_fia_cooling_network_screen.py "
                    f"screening constants slot_to_iron_k_per_w={slot_k} and "
                    f"iron_to_jacket_k_per_w={jacket_k}; tightens BARB-HEATER-PLATE and "
                    "duty/thermal predictions. Acceptance guide ±15% Δp vs OpenFOAM/"
                    "network model with monotonic trend"
                ),
                already_have=(
                    f"OpenFOAM water-jacket and cold-plate cases; coupled network "
                    f"screen (Δp≈{_fmt(delta_p)} kPa, coupled_ok="
                    f"{cool_scr.get('coupled_screen_ok')}, T_module≈{_fmt(t_module)} °C); "
                    f"screening Rth seeds slot_to_iron={slot_k} K/W, "
                    f"iron_to_jacket={jacket_k} K/W — no measured bench curves"
                ),
                priority=3,
            ),
            "homologation_status": "OPEN",
            "software_prep": "READY_FOR_BENCH",
        },
        {
            "id": "BARB-HEATER-PLATE",
            "bar_b_item": "Heater-plate module temperatures",
            "closure_class": "NEEDS_HARDWARE",
            "decision_register": ["DEC-001"],
            "assumed_value": "Network T_module from analytical Rth + OF Δp under A-SIC/A-COOL",
            "result_under_assumption": (
                f"T_module≈{_fmt(t_module)} °C (screening); "
                f"module_to_coolant_k_per_w={cool_in.get('module_to_coolant_k_per_w', 0.01)}"
            ),
            "evidence": ["_motor_stack/analytical_fia_cooling_network_screen.json"],
            "blocks_ship_ok": True,
            "replace_with": (
                f"Please run a heater-plate test on the revision-matched SiC "
                f"module/TIM/cold-plate stack (frozen MPN + TIM thickness/type): apply "
                f"calibrated heater power steps covering ~{_fmt(inv_kw, 2)} kW class "
                f"dissipation at A-COOL {_fmt(coolant_inlet_c, 0)} °C / "
                f"{_fmt(coolant_flow, 0)} L/min, log steady module case, TIM "
                f"interfaces, plate, coolant inlet/outlet temperatures, and report "
                f"measured Rth(j-c) / Rth(c-coolant). CSV + photos of stack-up. Closes "
                f"BARB-HEATER-PLATE (screening T_module≈{_fmt(t_module)} °C). We "
                f"already hold the analytical network prediction; need the physical "
                f"stack."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Heater-plate thermal correlation of the revision-matched SiC "
                    "module / TIM / cold-plate stack"
                ),
                format=(
                    "CSV: heater_power_w, t_module_case_c, t_tim_interface_c, "
                    "t_cold_plate_c, t_coolant_in_c, t_coolant_out_c, flow_l_min, "
                    "rth_module_to_coolant_k_per_w; PDF stack-up (TIM type, thickness, "
                    "torque/pressure) and calibration certificates"
                ),
                conditions=(
                    f"Stack matches frozen module MPN and release TIM; coolant "
                    f"{_fmt(coolant_inlet_c, 0)} °C / {_fmt(coolant_flow, 0)} L/min "
                    f"(A-COOL); heater power stepped through points bracketing "
                    f"~{_fmt(float(inv_kw or 4.318) * 1000, 0)} W class inverter "
                    f"dissipation; each point to thermal steady state; acceptance "
                    f"guide ±5 °C on module temperature and ±15% on Rth vs network "
                    f"model"
                ),
                unblocks=(
                    "BARB-HEATER-PLATE and supports DEC-001 thermal limit; feeds "
                    "module_to_coolant_k_per_w back into the cooling network screen"
                ),
                already_have=(
                    f"Analytical network T_module≈{_fmt(t_module)} °C; "
                    f"module_to_coolant_k_per_w seed="
                    f"{cool_in.get('module_to_coolant_k_per_w', 0.01)}; "
                    f"HEATER_PLATE_MODULE_TEMPS bench recipe — no heater-plate CSV"
                ),
                priority=9,
            ),
            "homologation_status": "OPEN",
            "software_prep": "READY_FOR_BENCH",
        },
        {
            "id": "BARB-DOUBLE-PULSE",
            "bar_b_item": "Double-pulse ESL / switching",
            "closure_class": "NEEDS_HARDWARE",
            "decision_register": ["DEC-001", "DEC-008"],
            "assumed_value": (
                f"Bus ESL analytical seed (~{_fmt(esl_nh, 2)} nH class) — not measured "
                "commutation loop"
            ),
            "result_under_assumption": (
                f"ESL seed nominal≈{_fmt(esl_nh, 2)} nH "
                f"(band {inv_scr.get('esl_target_band_nh', [3.0, 15.0])}); "
                "measured ESL OPEN"
            ),
            "evidence": ["_motor_stack/inverter_packaging_fia_front_kit_case.json"],
            "blocks_ship_ok": True,
            "replace_with": (
                f"Please run guarded double-pulse tests on the populated SiC hardware "
                f"(revision-matched laminated bus + frozen module): at kit DC bus "
                f"({_fmt(_qty(quantities, 'dc_bus_voltage_v', 750), 0)} V class) and "
                f"current points up to design phase current, capture Vgs, Vds, Id, "
                f"timing, device temperature, and extract commutation-loop ESL, "
                f"voltage overshoot, Eon/Eoff. Deliver scope CSV/binary + PDF with "
                f"loop geometry photo and gate-resistor settings. Closes "
                f"BARB-DOUBLE-PULSE (analytical ESL seed ~{_fmt(esl_nh, 2)} nH is not "
                f"measured). We already hold the packaging ESL seed and target band "
                f"3–15 nH."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Double-pulse switching characterisation on populated SiC "
                    "inverter hardware with measured commutation-loop ESL"
                ),
                format=(
                    "Scope CSV or vendor binary per pulse point: time, vgs_v, vds_v, "
                    "id_a; derived table CSV of vdc_v, id_peak_a, esl_nh, overshoot_v, "
                    "eon_mj, eoff_mj, rg_ohm, tj_c; PDF with bus geometry photo, probe "
                    "points, and gate settings"
                ),
                conditions=(
                    f"Populated revision-matched bus + frozen module MPN; DC bus at "
                    f"kit class ({_fmt(_qty(quantities, 'dc_bus_voltage_v', 750), 0)} V "
                    f"nominal) and current points spanning design phase-current class; "
                    f"guarded cell; compare extracted ESL to analytical seed "
                    f"~{_fmt(esl_nh, 2)} nH (target band 3–15 nH, preferred ≤10 nH); "
                    f"acceptance guide ±20% ESL, ±10% overshoot, ±15% Eon/Eoff vs "
                    f"prediction with no device-limit breach"
                ),
                unblocks=(
                    "BARB-DOUBLE-PULSE; replaces analytical ESL seed with measured "
                    "loop inductance; supports DEC-001 switching loss and safe gate "
                    "settings for HIL/dyno"
                ),
                already_have=(
                    f"Inverter packaging screen ESL nominal {_fmt(esl_nh, 2)} nH "
                    f"(low/high {_fmt(inv_scr.get('bus_esl_low_nh'), 2)}/"
                    f"{_fmt(inv_scr.get('bus_esl_high_nh'), 2)} nH); "
                    f"double_pulse_and_measured_esl status OPEN; DOUBLE_PULSE_ESL_SIC "
                    f"bench recipe — no scope capture"
                ),
                priority=10,
            ),
            "homologation_status": "OPEN",
            "software_prep": "READY_FOR_BENCH",
        },
        {
            "id": "BARB-ICD-XYZ",
            "bar_b_item": "FIA / chassis port XYZ",
            "closure_class": "NEEDS_PARTNER_INPUT",
            "decision_register": [],
            "assumed_value": (
                "Port types only (HV, coolant×2, LV/CAN, halfshafts, mounts) — "
                "millimetres deliberately not invented"
            ),
            "result_under_assumption": "Interface ICD TYPES_ONLY_XYZ_OPEN",
            "evidence": ["JLR-FE-FRONT-FPK-INTERFACE-ICD.md"],
            "blocks_ship_ok": True,
            "replace_with": (
                "Please issue the chassis / FIA port coordinate ICD for this front "
                "MGU bay: XYZ (mm) and Euler orientation for HV_DC_IN, COOLANT_IN, "
                "COOLANT_OUT, LV_CAN, HALFSHAFT_L/R flange datums, and MOUNT_EARS "
                "(×4), in the vehicle frame, as STEP or CAD-native + CSV point table "
                "with tolerance class. We already hold types-only ICD "
                "(TYPES_ONLY_XYZ_OPEN) and press-class envelope (343×259×267 mm) — "
                "do not ask us to invent millimetres and do not re-send type lists "
                "without coordinates. Closes BARB-ICD-XYZ."
            ),
            "executable_ask": _executable_ask(
                artefact=(
                    "Chassis / FIA interface coordinate ICD locating every MGU port "
                    "and mount in the vehicle frame"
                ),
                format=(
                    "STEP (or CATIA/NX native) of port/mount datums + CSV: port_id, "
                    "x_mm, y_mm, z_mm, rx_deg, ry_deg, rz_deg, tolerance_mm, "
                    "mating_connector_or_flange_mpn; PDF sheet with vehicle-frame "
                    "definition and revision"
                ),
                conditions=(
                    "Vehicle frame and origin explicitly defined; ports required at "
                    "minimum: HV_DC_IN, COOLANT_IN, COOLANT_OUT, LV_CAN, HALFSHAFT_L, "
                    "HALFSHAFT_R, MOUNT_EARS (4); millimetres mandatory — types-only "
                    "responses will be rejected as incomplete; revision locked to the "
                    "bay this car/season uses"
                ),
                unblocks=(
                    "BARB-ICD-XYZ; unblocks casing machine datums, harness lengths, "
                    "and mount FEA boundary conditions. Never invent coordinates in "
                    "the twin"
                ),
                already_have=(
                    "JLR-FE-FRONT-FPK-INTERFACE-ICD.md — TYPES_ONLY_XYZ_OPEN; port "
                    "type table (HV DC, coolant×2, LV/CAN, halfshafts, 4 mount ears); "
                    "press/bay-class envelope 343×259×267 mm — no measured or "
                    "supplier XYZ"
                ),
                priority=4,
            ),
            "homologation_status": "OPEN",
        },
    ]

    assumed_n = sum(1 for r in rows if r["closure_class"] == "ASSUMED_CONCEPT")
    hardware_n = sum(1 for r in rows if r["closure_class"] == "NEEDS_HARDWARE")
    partner_n = sum(1 for r in rows if r["closure_class"] == "NEEDS_PARTNER_INPUT")
    hw_holds = hw.get("holds") if isinstance(hw.get("holds"), list) else []

    ask_priorities = [
        int((r.get("executable_ask") or {}).get("priority") or 0) for r in rows
    ]
    ask_fields_ok = all(
        isinstance(r.get("executable_ask"), Mapping)
        and all(
            str((r.get("executable_ask") or {}).get(k) or "").strip()
            for k in EXECUTABLE_ASK_REQUIRED_KEYS
            if k != "priority"
        )
        and isinstance((r.get("executable_ask") or {}).get("priority"), int)
        and int((r.get("executable_ask") or {}).get("priority") or 0) >= 1
        for r in rows
    )

    return {
        "schema": SCHEMA,
        "stamped_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "twin": str(twin_dir),
        "bar": "B",
        "definition": (
            "Bar B = race / homologation. Requires real HIL, supplier Gerbers, dyno, "
            "chassis XYZ, and bench correlation. Educated assumptions complete the "
            "review checklist and predict results — they do not complete homologation."
        ),
        "verdict": "BAR_B_LIST_FILLED_UNDER_ASSUMPTIONS_NOT_HOMOLOGATED",
        "ship_ok": False,
        "homologation": "NOT_HOMOLOGATED",
        "fia_race_ready": False,
        "honesty": (
            "ASSUMED_CONCEPT rows have named educated guesses + screening evidence. "
            "NEEDS_HARDWARE rows have READY_FOR_BENCH recipes / predicted models. "
            "NEEDS_PARTNER_INPUT rows are deliberately blank of invented millimetres or "
            "supplier Gerbers. Every row carries an executable_ask (artefact, format, "
            "conditions, unblocks, already_have, priority) so partners can act without "
            "a follow-up. ship_ok stays false until physical artefacts exist."
        ),
        "counts": {
            "rows_total": len(rows),
            "assumed_concept": assumed_n,
            "needs_hardware": hardware_n,
            "needs_partner_input": partner_n,
            "hardware_correlation_holds_open": len(hw_holds),
            "rows_blocking_ship_ok": sum(1 for r in rows if r.get("blocks_ship_ok")),
            "executable_asks": sum(1 for r in rows if isinstance(r.get("executable_ask"), Mapping)),
        },
        "rows": rows,
        "can_mint_ship_ok": False,
        "why_not_complete": (
            "Completing Bar B means measured HIL/dyno/Gerbers/XYZ — not better guesses. "
            "The list is now fully filled for Jack with executable asks; homologation "
            "remains NOT_HOMOLOGATED."
        ),
        "brief_assumption_pack": (
            "docs/plans/JLR-FE-FRONT-FPK-ASSUMPTION-BASED-RESULTS-FOR-JACK-2026-07-31.md"
        ),
        "email_ask": "docs/plans/JLR-FE-FRONT-FPK-EMAIL-ASK-JACK-2026-07-31.md",
        "ask_priority_order": [
            r["id"]
            for r in sorted(
                rows,
                key=lambda x: int((x.get("executable_ask") or {}).get("priority") or 99),
            )
        ],
        "proveCatch": {
            "ship_ok_false": True,
            "can_mint_ship_ok_false": True,
            "has_assumed_and_hardware_rows": assumed_n >= 2 and hardware_n >= 3,
            "partner_xyz_not_invented": partner_n >= 1,
            "all_rows_block_ship": all(r.get("blocks_ship_ok") for r in rows),
            "all_rows_have_executable_ask": ask_fields_ok and len(rows) == 10,
            "executable_ask_priorities_unique": (
                len(ask_priorities) == len(set(ask_priorities)) and len(ask_priorities) == 10
            ),
            "duty_cycle_priority_one": any(
                r.get("id") == "BARB-DUTY-CYCLE"
                and (r.get("executable_ask") or {}).get("priority") == 1
                for r in rows
            ),
        },
    }


def render_markdown(reg: Mapping[str, Any]) -> str:
    """Render Bar B readiness markdown including executable asks."""

    lines = [
        "# Bar B readiness — filled under assumptions (not homologated)",
        "",
        f"**Stamped:** {reg.get('stamped_at')}",
        f"**Verdict:** `{reg.get('verdict')}`",
        f"**ship_ok:** `{reg.get('ship_ok')}` · homologation `{reg.get('homologation')}`",
        "",
        reg.get("definition") or "",
        "",
        reg.get("honesty") or "",
        "",
        f"**Why this is not “Bar B complete”:** {reg.get('why_not_complete')}",
        "",
        "## Counts",
        "",
        f"| Assumed concept | Needs hardware | Needs partner input | Blocks ship | Executable asks |",
        f"|---|---|---|---|---|",
        (
            f"| {reg.get('counts', {}).get('assumed_concept')} | "
            f"{reg.get('counts', {}).get('needs_hardware')} | "
            f"{reg.get('counts', {}).get('needs_partner_input')} | "
            f"{reg.get('counts', {}).get('rows_blocking_ship_ok')} | "
            f"{reg.get('counts', {}).get('executable_asks')} |"
        ),
        "",
        "## Checklist",
        "",
        "| Pri | ID | Bar B item | Closure class | Assumed / predicted | Replace with (human ask) | Homologation |",
        "|---|---|---|---|---|---|---|",
    ]
    rows_sorted = sorted(
        [r for r in (reg.get("rows") or []) if isinstance(r, Mapping)],
        key=lambda r: int((r.get("executable_ask") or {}).get("priority") or 99),
    )
    for row in rows_sorted:
        ask = row.get("executable_ask") if isinstance(row.get("executable_ask"), Mapping) else {}
        pri = ask.get("priority", "—")
        # Keep table cells single-line.
        replace = str(row.get("replace_with") or "").replace("\n", " ").replace("|", "/")
        result = str(row.get("result_under_assumption") or "").replace("\n", " ").replace("|", "/")
        lines.append(
            f"| {pri} | `{row.get('id')}` | {row.get('bar_b_item')} | "
            f"**{row.get('closure_class')}** | {result} | "
            f"{replace} | {row.get('homologation_status')} |"
        )

    lines.extend(
        [
            "",
            "## Executable asks (supplier / test engineer)",
            "",
            "Each ask is actionable without a follow-up: artefact, file format, "
            "measurement conditions, what it unblocks, and what we already hold so "
            "partners are not asked twice. Priority 1 is highest (handover order).",
            "",
        ]
    )
    for row in rows_sorted:
        ask = row.get("executable_ask") if isinstance(row.get("executable_ask"), Mapping) else {}
        if not ask:
            continue
        lines.extend(
            [
                f"### P{ask.get('priority')} — `{row.get('id')}` · {row.get('bar_b_item')}",
                "",
                f"- **Closure class:** `{row.get('closure_class')}`",
                f"- **Artefact:** {ask.get('artefact')}",
                f"- **Format:** {ask.get('format')}",
                f"- **Conditions:** {ask.get('conditions')}",
                f"- **Unblocks:** {ask.get('unblocks')}",
                f"- **Already have:** {ask.get('already_have')}",
                f"- **Human ask:** {row.get('replace_with')}",
                "",
            ]
        )

    lines.extend(
        [
            "## Related",
            "",
            f"- Assumption pack: `{reg.get('brief_assumption_pack')}`",
            f"- Email ask: `{reg.get('email_ask')}`",
            f"- Ask priority order: `{' → '.join(reg.get('ask_priority_order') or [])}`",
            "",
        ]
    )
    return "\n".join(lines)


def write_register(twin_dir: Path, reg: Mapping[str, Any]) -> tuple[Path, Path]:
    """Atomically write Bar B JSON + markdown."""

    twin_dir.mkdir(parents=True, exist_ok=True)
    json_path = twin_dir / OUTPUT_JSON
    md_path = twin_dir / OUTPUT_MD
    for path, text in (
        (json_path, json.dumps(reg, indent=2) + "\n"),
        (md_path, render_markdown(reg)),
    ):
        temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        temporary.write_text(text, encoding="utf-8")
        os.replace(temporary, path)
    return json_path, md_path


def apply_decision_assumption_annotations(twin_dir: Path, reg: Mapping[str, Any]) -> None:
    """Annotate OPEN DEC rows with concept-assumption notes (do not APPROVE).

    INTENT: Jack can see which OPEN decisions have an ASSUMED_CONCEPT fill.
    Status stays OPEN for homologation; we add assumption fields only.
    """

    path = twin_dir / "10-decision-register.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []
    items = data if isinstance(data, list) else data.get("decisions") or []
    by_dec: dict[str, list[dict[str, Any]]] = {}
    for row in reg.get("rows") or []:
        if not isinstance(row, Mapping):
            continue
        for dec_id in row.get("decision_register") or []:
            by_dec.setdefault(str(dec_id), []).append(dict(row))
    changed = False
    for item in items:
        if not isinstance(item, dict):
            continue
        dec_id = str(item.get("id") or "")
        if dec_id not in by_dec:
            continue
        primary = by_dec[dec_id][0]
        item["assumption_closure_class"] = primary.get("closure_class")
        item["assumption_value"] = primary.get("assumed_value")
        item["assumption_result"] = primary.get("result_under_assumption")
        item["assumption_replace_with"] = primary.get("replace_with")
        item["assumption_executable_ask"] = primary.get("executable_ask")
        item["assumption_note"] = (
            "Concept fill under frozen assumptions — homologation status remains OPEN; "
            "ship_ok remains false."
        )
        # Keep status OPEN for race; surface review label separately.
        item["review_fill"] = primary.get("closure_class")
        changed = True
    if not changed:
        return
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    payload = items if isinstance(data, list) else {**data, "decisions": items}
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def selftest() -> int:
    """ProveCatch: list filled, ship_ok false, executable asks complete, no PASS invent."""

    with tempfile.TemporaryDirectory(prefix="fpk-barb-selftest-") as raw:
        twin = Path(raw)
        (twin / "_motor_stack").mkdir()
        (twin / "state.json").write_text(
            json.dumps(
                {
                    "orchestratorContract": {
                        "quantities": {
                            "front_regen_electrical_cap_kw": {"value": 250},
                            "max_rotor_speed_rpm": {"value": 19500},
                            "inverter_dissipated_kw": {"value": 4.3},
                            "coolant_inlet_c": {"value": 60},
                            "coolant_flow_l_min": {"value": 12},
                            "duty_regen_time_s": {"value": 24},
                            "duty_motoring_time_s": {"value": 76},
                            "dc_bus_voltage_v": {"value": 750},
                            "mgu_iron_loss_w": {"value": 6035.1},
                        }
                    },
                    "homologationHonesty": {
                        "verdict": "NOT_HOMOLOGATED",
                        "hil_present": False,
                        "supplier_gerbers_present": False,
                    },
                    "pcb": {
                        "disposition": "bespoke",
                        "pipeline": {"ok": True, "drc": {"ran": True, "violations": 0}},
                        "architecture": {
                            "boards": [
                                {"boardId": "traction_gate_drive"},
                                {"boardId": "traction_control"},
                            ]
                        },
                        "NOT_FABRICATION_READY": True,
                    },
                }
            ),
            encoding="utf-8",
        )
        (twin / "pcb-stage.json").write_text(
            json.dumps(
                {
                    "NOT_FABRICATION_READY": True,
                    "forgeDraftOnly": True,
                    "supplier_gerbers": "OPEN",
                    "boardPipelines": [
                        {"boardId": "traction_gate_drive"},
                        {"boardId": "traction_control"},
                    ],
                    "pipeline": {"ok": True, "drc": {"violations": 0}},
                }
            ),
            encoding="utf-8",
        )
        (twin / "_motor_stack" / "em_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "works_in_kit_context": {
                        "duty_torque_screen_ok": True,
                        "loaded_torque_magnitude_nm": 200.0,
                        "torque_magnitude_mean_nm": 81.6,
                        "required_shaft_torque_nm": 125.2193,
                        "torque_reliable": False,
                    }
                }
            ),
            encoding="utf-8",
        )
        (twin / "_motor_stack" / "analytical_fia_cooling_network_screen.json").write_text(
            json.dumps(
                {
                    "input_quantities": {
                        "coolant_flow_l_min": 12.0,
                        "coolant_inlet_c": 60.0,
                        "iron_loss_w": 6035.1,
                        "slot_to_iron_k_per_w": 0.006,
                        "iron_to_jacket_k_per_w": 0.0077,
                        "module_to_coolant_k_per_w": 0.01,
                    },
                    "screening_results": {
                        "coupled_screen_ok": True,
                        "total_delta_p_kpa": 42.7,
                        "maximum_module_temperature_c": 71.0,
                    },
                }
            ),
            encoding="utf-8",
        )
        (twin / "_motor_stack" / "inverter_packaging_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "screening_results": {
                        "bus_esl_nominal_nh": 6.39,
                        "bus_esl_low_nh": 4.15,
                        "bus_esl_high_nh": 9.9,
                        "inverter_dissipated_kw": 4.318,
                        "sic_module_count": 3,
                        "esl_target_band_nh": [3.0, 15.0],
                    }
                }
            ),
            encoding="utf-8",
        )
        (twin / "_motor_stack" / "calculix_fia_rotor_screen.json").write_text(
            json.dumps(
                {
                    "screening_results": {
                        "screening_fos_vs_yield": 2.635,
                        "operating_speed_rpm": 19500.0,
                    }
                }
            ),
            encoding="utf-8",
        )
        (twin / "10-decision-register.json").write_text(
            json.dumps(
                [
                    {"id": "DEC-001", "status": "OPEN", "decision": "SiC"},
                    {"id": "DEC-008", "status": "OPEN", "decision": "HIL"},
                ]
            ),
            encoding="utf-8",
        )
        reg = build_bar_b(twin)
        hil = next(r for r in reg["rows"] if r["id"] == "BARB-HIL")
        gerber = next(r for r in reg["rows"] if r["id"] == "BARB-GERBERS")
        duty = next(r for r in reg["rows"] if r["id"] == "BARB-DUTY-CYCLE")
        dyno = next(r for r in reg["rows"] if r["id"] == "BARB-DYNO")
        xyz = next(r for r in reg["rows"] if r["id"] == "BARB-ICD-XYZ")

        def _ask_ok(row: Mapping[str, Any]) -> bool:
            ask = row.get("executable_ask")
            if not isinstance(ask, Mapping):
                return False
            for key in EXECUTABLE_ASK_REQUIRED_KEYS:
                if key == "priority":
                    if not isinstance(ask.get("priority"), int) or int(ask["priority"]) < 1:
                        return False
                elif not str(ask.get(key) or "").strip():
                    return False
            return True

        checks = {
            "ship_ok_false": reg["ship_ok"] is False,
            "can_mint_false": reg["can_mint_ship_ok"] is False,
            "homologation_not": reg.get("homologation") == "NOT_HOMOLOGATED",
            "hil_needs_hardware": hil["closure_class"] == "NEEDS_HARDWARE",
            "gerber_needs_partner": gerber["closure_class"] == "NEEDS_PARTNER_INPUT",
            "xyz_needs_partner": xyz["closure_class"] == "NEEDS_PARTNER_INPUT",
            "has_assumed": reg["counts"]["assumed_concept"] >= 2,
            "ten_rows": len(reg["rows"]) == 10,
            "proveCatch_ship_ok": reg["proveCatch"]["ship_ok_false"] is True,
            "all_executable_asks": all(_ask_ok(r) for r in reg["rows"]),
            "proveCatch_asks": reg["proveCatch"]["all_rows_have_executable_ask"] is True,
            "duty_priority_1": (duty.get("executable_ask") or {}).get("priority") == 1,
            "dyno_priority_2": (dyno.get("executable_ask") or {}).get("priority") == 2,
            "replace_with_paragraph": all(
                isinstance(r.get("replace_with"), str) and len(r["replace_with"]) > 80
                for r in reg["rows"]
            ),
            "no_ship_ok_true_in_rows": all(r.get("blocks_ship_ok") is True for r in reg["rows"]),
            "torque_reliable_not_minted": em_works_safe(reg) is False,
            "priorities_1_to_10": sorted(
                int((r.get("executable_ask") or {}).get("priority")) for r in reg["rows"]
            )
            == list(range(1, 11)),
        }
        # Duty ask must name channels and must not invite opinion-reversal of DEC-008.
        duty_ask = json.dumps(duty.get("executable_ask") or {}) + str(duty.get("replace_with") or "")
        checks["duty_names_csv_channels"] = all(
            token in duty_ask
            for token in ("time_s", "brake_pressure", "regen")
        )
        checks["duty_data_not_opinion"] = "opinion" in duty_ask.lower()
        dyno_ask = json.dumps(dyno.get("executable_ask") or {}) + str(dyno.get("replace_with") or "")
        checks["dyno_names_coolant_and_calorimetric"] = (
            "60" in dyno_ask and "calorimetric" in dyno_ask.lower() and "12" in dyno_ask
        )
        flow = next(r for r in reg["rows"] if r["id"] == "BARB-FLOW-BENCH")
        flow_ask = json.dumps(flow.get("executable_ask") or {})
        checks["flow_names_rth_constants"] = (
            "0.006" in flow_ask and "0.0077" in flow_ask
        )
        checks["xyz_no_invented_mm"] = "OPEN" in str(xyz.get("result_under_assumption")) or (
            "TYPES_ONLY" in str(xyz.get("result_under_assumption"))
        )

        md = render_markdown(reg)
        checks["md_has_executable_section"] = "## Executable asks" in md
        checks["md_has_priority_column"] = "| Pri |" in md

        write_register(twin, reg)
        apply_decision_assumption_annotations(twin, reg)
        dec = json.loads((twin / "10-decision-register.json").read_text())
        d001 = next(x for x in dec if x["id"] == "DEC-001")
        checks["dec_still_open"] = d001["status"] == "OPEN"
        checks["dec_has_assumption"] = d001.get("assumption_closure_class") == "ASSUMED_CONCEPT"
        checks["dec_has_executable_ask"] = isinstance(d001.get("assumption_executable_ask"), dict)

        # Hard stop: register must never claim closed homologation or ship_ok.
        stamped = json.loads((twin / OUTPUT_JSON).read_text())
        checks["stamped_ship_ok_false"] = stamped.get("ship_ok") is False
        checks["no_row_homologation_closed"] = all(
            str(r.get("homologation_status") or "").upper() in {"OPEN", ""}
            for r in stamped.get("rows") or []
        )

        if not all(checks.values()):
            print("FAIL", json.dumps(checks, indent=2))
            return 1
        print("fpk_bar_b_readiness --selftest OK")
        print(json.dumps(checks, indent=2))
        return 0


def em_works_safe(reg: Mapping[str, Any]) -> bool:
    """Selftest helper: torque_reliable must not appear minted true on any row text."""

    blob = json.dumps(reg)
    # Allow the literal false; forbid true minting.
    if '"torque_reliable": true' in blob or '"torque_reliable":true' in blob:
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--twin", type=Path)
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument(
        "--annotate-decisions",
        action="store_true",
        help="Annotate 10-decision-register.json with assumption fills (status stays OPEN)",
    )
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.twin:
        parser.error("--twin required unless --selftest")
    twin = args.twin.resolve()
    reg = build_bar_b(twin)
    json_path, md_path = write_register(twin, reg)
    if args.annotate_decisions:
        apply_decision_assumption_annotations(twin, reg)
    print(
        json.dumps(
            {
                "json": str(json_path),
                "markdown": str(md_path),
                "verdict": reg["verdict"],
                "ship_ok": reg["ship_ok"],
                "counts": reg["counts"],
                "ask_priority_order": reg.get("ask_priority_order"),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
