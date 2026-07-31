#!/usr/bin/env python3
"""fpk_bar_b_readiness.py — Bar B checklist under assumptions (honest).

INTENT: Tristan asked whether frozen assumptions let us "complete Bar B".
Bar B is race/homologation (HIL, supplier Gerbers, dyno, chassis XYZ, bench CFD).
Assumptions cannot mint ship_ok. They CAN fill every Bar B row with either:
  - ASSUMED_CONCEPT — educated guess + screening evidence (replace when JLR sends data)
  - NEEDS_HARDWARE — predicted model ready; physical artefact still required
  - NEEDS_PARTNER_INPUT — must not invent (e.g. chassis XYZ, supplier Gerbers)

This register completes the *list for review*, not homologation.

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
    em = _load(motor_stack / "em_fia_front_kit_case.json") or {}
    cool = _load(motor_stack / "analytical_fia_cooling_network_screen.json") or {}
    rotor = _load(motor_stack / "calculix_fia_rotor_screen.json") or {}
    pocket = _load(motor_stack / "calculix_fia_magnet_pocket_screen.json") or {}
    hw = _load(motor_stack / "hardware_correlation_bench_prep.json") or {}
    inv = _load(motor_stack / "inverter_packaging_fia_front_kit_case.json") or {}
    mm = _load(twin_dir / "motor-multiphysics.json") or {}
    homologation = (
        state.get("homologationHonesty")
        if isinstance(state.get("homologationHonesty"), Mapping)
        else {}
    )
    pcb = state.get("pcb") if isinstance(state.get("pcb"), Mapping) else {}
    em_works = em.get("works_in_kit_context") if isinstance(em.get("works_in_kit_context"), Mapping) else {}
    cool_scr = cool.get("screening_results") if isinstance(cool.get("screening_results"), Mapping) else {}
    rotor_works = (
        rotor.get("works_in_kit_context")
        if isinstance(rotor.get("works_in_kit_context"), Mapping)
        else {}
    )

    rows = [
        {
            "id": "BARB-SIC-MODULE",
            "bar_b_item": "SiC module identity + thermal limit (DEC-001)",
            "closure_class": "ASSUMED_CONCEPT",
            "decision_register": ["DEC-001"],
            "assumed_value": (
                "3× traction half-bridge class; analytical inverter dissipation "
                f"~{_qty(quantities, 'inverter_dissipated_kw', 4.318)} kW; "
                f"ESL seed ~{(inv or mm.get('inverterPackaging') or {}).get('bus_esl_nominal_nh', 6.39)} nH; "
                "N42UH-class magnet / SiC loss model — not a frozen supplier MPN"
            ),
            "result_under_assumption": (
                f"Cooling network T_module≈{cool_scr.get('maximum_module_temperature_c', '—')} °C "
                f"at A-COOL; packaging screen present"
            ),
            "evidence": [
                "_motor_stack/analytical_fia_cooling_network_screen.json",
                "_motor_stack/inverter_packaging_fia_front_kit_case.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": "Supplier module MPN + datasheet + STEP + heater-plate / double-pulse",
            "homologation_status": "OPEN",
        },
        {
            "id": "BARB-ROTOR-RETENTION",
            "bar_b_item": "Rotor retention / overspeed (DEC-006)",
            "closure_class": "ASSUMED_CONCEPT",
            "decision_register": ["DEC-006"],
            "assumed_value": (
                f"Max speed {_qty(quantities, 'max_rotor_speed_rpm', 19500)} rpm; "
                "CalculiX centrifugal + magnet-pocket screens as retention seed "
                "(not instrumented overspeed)"
            ),
            "result_under_assumption": (
                f"Rotor screening FoS≈{rotor_works.get('minimum_factor_of_safety') or rotor.get('minimum_factor_of_safety') or '—'}; "
                f"pocket screen present={pocket.get('status') == 'PARTIAL' or bool(pocket)}"
            ),
            "evidence": [
                "_motor_stack/calculix_fia_rotor_screen.json",
                "_motor_stack/calculix_fia_magnet_pocket_screen.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": "Instrumented overspeed / retention test on revision-matched rotor",
            "homologation_status": "OPEN",
        },
        {
            "id": "BARB-DUTY-CYCLE",
            "bar_b_item": "Duty-cycle / E_net authority (DEC-007)",
            "closure_class": "ASSUMED_CONCEPT",
            "decision_register": ["DEC-007"],
            "assumed_value": (
                f"Continuous design duty {_qty(quantities, 'front_regen_electrical_cap_kw', 250)} kW "
                "front regen; public FIA energy tools as placeholder spectrum"
            ),
            "result_under_assumption": (
                f"EM duty screen ok={em_works.get('duty_torque_screen_ok')}; "
                f"loaded FE torque≈{em_works.get('loaded_torque_magnitude_nm', '—')} N·m"
            ),
            "evidence": [
                "_motor_stack/em_fia_front_kit_case.json",
                "_motor_stack/em_fia_torque_map_screen.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": "Team lap CSV / energy tool authority for this car/season",
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
                f"{homologation.get('hil_present', False)}"
            ),
            "evidence": [
                "firmware/README.md",
                "firmware/bring-up-contract.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": "HIL pass on populated inverter revision (safe-off, sense, CAN, desat)",
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
                f"PCB disposition={pcb.get('disposition')}; pipeline.ok="
                f"{(pcb.get('pipeline') or {}).get('ok')}; NOT_FAB for release"
            ),
            "evidence": ["state.pcb", "pcb-boards/ (if present)"],
            "blocks_ship_ok": True,
            "replace_with": "Supplier Gerbers + pinout ICD matching the frozen module",
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
                "torque_map status remains OPEN for dyno"
            ),
            "evidence": [
                "_motor_stack/em_fia_front_kit_case.json",
                "_motor_stack/em_fia_mtpa_screen.json",
                "_motor_stack/em_fia_torque_map_screen.json",
                "_motor_stack/em_fia_voltage_fw_screen.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": "Calibrated dyno torque/η/thermal map at revision-matched assembly",
            "homologation_status": "OPEN",
            "software_prep": "READY_FOR_BENCH",
        },
        {
            "id": "BARB-FLOW-BENCH",
            "bar_b_item": "Flow bench jacket + cold plate",
            "closure_class": "NEEDS_HARDWARE",
            "decision_register": [],
            "assumed_value": "A-COOL 60 °C / 12 L/min; OF duct Δp + coupled network temperatures",
            "result_under_assumption": (
                f"Δp≈{cool_scr.get('total_delta_p_kpa', '—')} kPa; "
                f"coupled_ok={cool_scr.get('coupled_screen_ok')}"
            ),
            "evidence": [
                "_motor_stack/openfoam_fia_water_jacket_case.json",
                "_motor_stack/openfoam_fia_cold_plate_case.json",
                "_motor_stack/analytical_fia_cooling_network_screen.json",
            ],
            "blocks_ship_ok": True,
            "replace_with": "Measured pressure-flow curves at controlled coolant conditions",
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
                f"T_module≈{cool_scr.get('maximum_module_temperature_c', '—')} °C (screening)"
            ),
            "evidence": ["_motor_stack/analytical_fia_cooling_network_screen.json"],
            "blocks_ship_ok": True,
            "replace_with": "Heater-plate test with revision-matched TIM / module stack",
            "homologation_status": "OPEN",
            "software_prep": "READY_FOR_BENCH",
        },
        {
            "id": "BARB-DOUBLE-PULSE",
            "bar_b_item": "Double-pulse ESL / switching",
            "closure_class": "NEEDS_HARDWARE",
            "decision_register": ["DEC-001", "DEC-008"],
            "assumed_value": "Bus ESL analytical seed (~6.4 nH class) — not measured commutation loop",
            "result_under_assumption": "ESL seed in inverter packaging screen; measured ESL OPEN",
            "evidence": ["_motor_stack/inverter_packaging_fia_front_kit_case.json"],
            "blocks_ship_ok": True,
            "replace_with": "Double-pulse waveforms on populated SiC hardware",
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
            "replace_with": "Chassis ICD coordinates from JLR",
            "homologation_status": "OPEN",
        },
    ]

    assumed_n = sum(1 for r in rows if r["closure_class"] == "ASSUMED_CONCEPT")
    hardware_n = sum(1 for r in rows if r["closure_class"] == "NEEDS_HARDWARE")
    partner_n = sum(1 for r in rows if r["closure_class"] == "NEEDS_PARTNER_INPUT")
    hw_holds = hw.get("holds") if isinstance(hw.get("holds"), list) else []

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
            "supplier Gerbers. ship_ok stays false until physical artefacts exist."
        ),
        "counts": {
            "rows_total": len(rows),
            "assumed_concept": assumed_n,
            "needs_hardware": hardware_n,
            "needs_partner_input": partner_n,
            "hardware_correlation_holds_open": len(hw_holds),
            "rows_blocking_ship_ok": sum(1 for r in rows if r.get("blocks_ship_ok")),
        },
        "rows": rows,
        "can_mint_ship_ok": False,
        "why_not_complete": (
            "Completing Bar B means measured HIL/dyno/Gerbers/XYZ — not better guesses. "
            "The list is now fully filled for Jack; homologation remains NOT_HOMOLOGATED."
        ),
        "brief_assumption_pack": (
            "docs/plans/JLR-FE-FRONT-FPK-ASSUMPTION-BASED-RESULTS-FOR-JACK-2026-07-31.md"
        ),
        "email_ask": "docs/plans/JLR-FE-FRONT-FPK-EMAIL-ASK-JACK-2026-07-31.md",
        "proveCatch": {
            "ship_ok_false": True,
            "can_mint_ship_ok_false": True,
            "has_assumed_and_hardware_rows": assumed_n >= 2 and hardware_n >= 3,
            "partner_xyz_not_invented": partner_n >= 1,
            "all_rows_block_ship": all(r.get("blocks_ship_ok") for r in rows),
        },
    }


def render_markdown(reg: Mapping[str, Any]) -> str:
    """Render Bar B readiness markdown."""

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
        f"| Assumed concept | Needs hardware | Needs partner input | Blocks ship |",
        f"|---|---|---|---|",
        (
            f"| {reg.get('counts', {}).get('assumed_concept')} | "
            f"{reg.get('counts', {}).get('needs_hardware')} | "
            f"{reg.get('counts', {}).get('needs_partner_input')} | "
            f"{reg.get('counts', {}).get('rows_blocking_ship_ok')} |"
        ),
        "",
        "## Checklist",
        "",
        "| ID | Bar B item | Closure class | Assumed / predicted | Replace with | Homologation |",
        "|---|---|---|---|---|---|",
    ]
    for row in reg.get("rows") or []:
        if not isinstance(row, Mapping):
            continue
        lines.append(
            f"| `{row.get('id')}` | {row.get('bar_b_item')} | "
            f"**{row.get('closure_class')}** | {row.get('result_under_assumption')} | "
            f"{row.get('replace_with')} | {row.get('homologation_status')} |"
        )
    lines.extend(
        [
            "",
            "## Related",
            "",
            f"- Assumption pack: `{reg.get('brief_assumption_pack')}`",
            f"- Email ask: `{reg.get('email_ask')}`",
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
    """ProveCatch: list filled, ship_ok false, HIL/Gerbers not assumed PASS."""

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
                        }
                    },
                    "homologationHonesty": {
                        "verdict": "NOT_HOMOLOGATED",
                        "hil_present": False,
                        "supplier_gerbers_present": False,
                    },
                    "pcb": {"disposition": "bespoke", "pipeline": {"ok": True}},
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
                    }
                }
            ),
            encoding="utf-8",
        )
        (twin / "_motor_stack" / "analytical_fia_cooling_network_screen.json").write_text(
            json.dumps(
                {
                    "screening_results": {
                        "coupled_screen_ok": True,
                        "total_delta_p_kpa": 42.7,
                        "maximum_module_temperature_c": 71.0,
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
        checks = {
            "ship_ok_false": reg["ship_ok"] is False,
            "can_mint_false": reg["can_mint_ship_ok"] is False,
            "hil_needs_hardware": hil["closure_class"] == "NEEDS_HARDWARE",
            "gerber_needs_partner": gerber["closure_class"] == "NEEDS_PARTNER_INPUT",
            "has_assumed": reg["counts"]["assumed_concept"] >= 2,
            "proveCatch": reg["proveCatch"]["ship_ok_false"] is True,
        }
        write_register(twin, reg)
        apply_decision_assumption_annotations(twin, reg)
        dec = json.loads((twin / "10-decision-register.json").read_text())
        d001 = next(x for x in dec if x["id"] == "DEC-001")
        checks["dec_still_open"] = d001["status"] == "OPEN"
        checks["dec_has_assumption"] = d001.get("assumption_closure_class") == "ASSUMED_CONCEPT"
        if not all(checks.values()):
            print("FAIL", json.dumps(checks, indent=2))
            return 1
        print("fpk_bar_b_readiness --selftest OK")
        print(json.dumps(checks, indent=2))
        return 0


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
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
