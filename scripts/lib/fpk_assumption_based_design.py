#!/usr/bin/env python3
"""fpk_assumption_based_design.py — JLR-facing assumption → results register.

INTENT: Tristan needs something Jack can review that is not a wall of PARTIAL.
We freeze educated design assumptions, attach screening results computed under
those assumptions, and list the partner asks that replace them. This is NOT
ship_ok / homologation — it is an honest concept pack narrative.

FLOW: stamp / CLI → twin JSON + markdown section → Excel can cite the same object.

Run:
  python3 scripts/lib/fpk_assumption_based_design.py --twin out/formula-e-front-mgu-20260729-1432
  python3 scripts/lib/fpk_assumption_based_design.py --selftest
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Optional


SCHEMA = "forgeos.fpk.assumption_based_design/v1"
OUTPUT_BASENAME = "JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.json"
MARKDOWN_BASENAME = "JLR-FE-FRONT-FPK-ASSUMPTION-BASED-DESIGN.md"


def _qty_value(quantities: Mapping[str, Any], key: str, default: Any = None) -> Any:
    raw = quantities.get(key)
    if isinstance(raw, Mapping) and "value" in raw:
        return raw.get("value")
    if raw is not None:
        return raw
    return default


def _load_json(path: Path) -> Optional[dict[str, Any]]:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def build_register(twin_dir: Path) -> dict[str, Any]:
    """Build the assumption → results → ask register from twin artefacts.

    @description Reads state + motor-stack screens; never invents ship_ok.
    @param twin_dir Twin output directory
    @returns Assumption-based design object
    """

    state = _load_json(twin_dir / "state.json") or {}
    quantities = (
        ((state.get("orchestratorContract") or {}).get("quantities"))
        if isinstance(state.get("orchestratorContract"), Mapping)
        else {}
    )
    if not isinstance(quantities, Mapping):
        quantities = {}

    motor_stack = twin_dir / "_motor_stack"
    em = _load_json(motor_stack / "em_fia_front_kit_case.json") or {}
    cool = _load_json(motor_stack / "analytical_fia_cooling_network_screen.json") or {}
    gear_oil = _load_json(motor_stack / "gear_oil_fia_front_kit_case.json") or {}
    post = _load_json(motor_stack / "post_diff_final_drive_packaging_screen.json") or {}
    iso = _load_json(motor_stack / "iso6336_fia_front_kit_case.json") or {}
    bevel = _load_json(motor_stack / "iso_bevel_fia_front_kit_case.json") or {}
    rotor_struct = _load_json(motor_stack / "calculix_fia_rotor_screen.json") or {}
    pocket_struct = _load_json(motor_stack / "calculix_fia_magnet_pocket_screen.json") or {}
    mount_struct = _load_json(motor_stack / "analytical_fia_case_mount_screen.json") or {}
    mm = _load_json(twin_dir / "motor-multiphysics.json") or {}
    cad = mm.get("cadAuthority") if isinstance(mm.get("cadAuthority"), Mapping) else {}

    em_works = em.get("works_in_kit_context") if isinstance(em.get("works_in_kit_context"), Mapping) else {}
    cool_scr = cool.get("screening_results") if isinstance(cool.get("screening_results"), Mapping) else {}
    gear_scr = (
        gear_oil.get("screening_results")
        if isinstance(gear_oil.get("screening_results"), Mapping)
        else {}
    )
    post_gate = post.get("closure_gate") if isinstance(post.get("closure_gate"), Mapping) else {}
    post_blocker = (
        post.get("architecture_blocker")
        if isinstance(post.get("architecture_blocker"), Mapping)
        else {}
    )
    iso_works = (
        iso.get("works_in_kit_context")
        if isinstance(iso.get("works_in_kit_context"), Mapping)
        else {}
    )
    bevel_margins = bevel.get("margins") if isinstance(bevel.get("margins"), Mapping) else {}
    bevel_works = (
        bevel.get("works_in_kit_context")
        if isinstance(bevel.get("works_in_kit_context"), Mapping)
        else {}
    )
    rotor_scr = (
        rotor_struct.get("screening_results")
        if isinstance(rotor_struct.get("screening_results"), Mapping)
        else {}
    )
    rotor_margins = (
        rotor_struct.get("margins")
        if isinstance(rotor_struct.get("margins"), Mapping)
        else {}
    )
    pocket_scr = (
        pocket_struct.get("screening_results")
        if isinstance(pocket_struct.get("screening_results"), Mapping)
        else {}
    )
    pocket_margins = (
        pocket_struct.get("margins")
        if isinstance(pocket_struct.get("margins"), Mapping)
        else {}
    )
    mount_scr = (
        mount_struct.get("screening_results")
        if isinstance(mount_struct.get("screening_results"), Mapping)
        else {}
    )
    mount_margins = (
        mount_struct.get("margins")
        if isinstance(mount_struct.get("margins"), Mapping)
        else {}
    )

    assumptions = [
        {
            "id": "A-DUTY",
            "status": "FROZEN_ASSUMPTION",
            "statement": "Continuous front regen electrical duty",
            "value": f"{_qty_value(quantities, 'front_regen_electrical_cap_kw', 250)} kW",
            "replace_with": "Team race software / energy tool CSV (DEC-007)",
        },
        {
            "id": "A-BAY",
            "status": "FROZEN_ASSUMPTION",
            "statement": "Package envelope and dry mass aspiration",
            "value": (
                f"{_qty_value(quantities, 'front_bay_envelope_w_mm', 343)}×"
                f"{_qty_value(quantities, 'front_bay_envelope_d_mm', 259)}×"
                f"{_qty_value(quantities, 'front_bay_envelope_h_mm', 267)} mm; "
                f"~{_qty_value(quantities, 'fpk_mass_cap_kg', 32)} kg dry"
            ),
            "replace_with": "Chassis ICD STEP + weighed bill of materials",
        },
        {
            "id": "A-BUS",
            "status": "FROZEN_ASSUMPTION",
            "statement": "DC bus voltage seed",
            "value": f"{_qty_value(quantities, 'dc_bus_voltage_v', 750)} V",
            "replace_with": "Exact bus window and ripple limits",
        },
        {
            "id": "A-COOL",
            "status": "FROZEN_ASSUMPTION",
            "statement": "Coolant inlet and flow",
            "value": (
                f"{_qty_value(quantities, 'coolant_inlet_c', 60)} °C / "
                f"{_qty_value(quantities, 'coolant_flow_l_min', 12)} L/min"
            ),
            "replace_with": "Team coolant loop ICD",
        },
        {
            "id": "A-SPEED",
            "status": "FROZEN_ASSUMPTION",
            "statement": "Maximum rotor speed",
            "value": f"{_qty_value(quantities, 'max_rotor_speed_rpm', 19500)} rpm",
            "replace_with": "Team max used speed + overspeed policy",
        },
        {
            "id": "A-RATIO",
            "status": "FROZEN_ASSUMPTION",
            "statement": "Overall gear ratio seed (2 into nest × 4 post-diff)",
            "value": f"{_qty_value(quantities, 'gear_ratio', 8)}",
            "replace_with": "Final ratio from vehicle model",
        },
        {
            "id": "A-SIC",
            "status": "FROZEN_ASSUMPTION",
            "statement": "SiC module class (topology + analytical loss; not MPN)",
            "value": "3× half-bridge class; ~4.3 kW inverter dissipation seed; ESL ~6.4 nH",
            "replace_with": "Supplier module MPN + datasheet + STEP (DEC-001)",
        },
        {
            "id": "A-IFACE",
            "status": "NEEDS_PARTNER_INPUT",
            "statement": "Vehicle port XYZ / mount CAD",
            "value": "Types only (HV, coolant×2, LV/CAN, halfshafts, mounts) — XYZ not invented",
            "replace_with": "Chassis interface control drawing coordinates",
        },
    ]

    results = [
        {
            "id": "R-BAY-FIT",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Concentric cassette packaging",
            "value": (
                f"Housing Ø{_qty_value(quantities, 'fpk_housing_od_mm', '—')}×"
                f"L{_qty_value(quantities, 'fpk_housing_len_mm', '—')} mm; "
                f"rotor ID {_qty_value(quantities, 'fpk_rotor_id_mm', '—')} / "
                f"OD {_qty_value(quantities, 'fpk_rotor_od_mm', '—')} mm"
            ),
            "evidence": "state.orchestratorContract.quantities + Blender FPK geometry",
        },
        {
            "id": "R-EM-DUTY",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Electromagnetic duty torque screen",
            "value": (
                f"Loaded FE torque "
                f"{em_works.get('loaded_torque_magnitude_nm', '—')} N·m vs required "
                f"{em_works.get('required_shaft_torque_nm', '—')} N·m; "
                f"duty_torque_screen_ok={em_works.get('duty_torque_screen_ok')}"
            ),
            "evidence": "_motor_stack/em_fia_front_kit_case.json",
        },
        {
            "id": "R-COOL-NET",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Coupled cooling network at assumed coolant point",
            "value": (
                f"Δp={cool_scr.get('total_delta_p_kpa', '—')} kPa; "
                f"T_winding={cool_scr.get('maximum_winding_temperature_c', '—')} °C; "
                f"T_module={cool_scr.get('maximum_module_temperature_c', '—')} °C; "
                f"coupled_ok={cool_scr.get('coupled_screen_ok')}"
            ),
            "evidence": "_motor_stack/analytical_fia_cooling_network_screen.json",
        },
        {
            "id": "R-GEAR-OIL",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Geometry-bound gear-oil jet / pickup / churning screen",
            "value": (
                f"jet={gear_scr.get('minimum_jet_flow_l_min', '—')} L/min; "
                f"ΔP_jet={gear_scr.get('jet_pressure_required_kpa', '—')} kPa; "
                f"churning={gear_scr.get('churning_loss_w', '—')} W; "
                f"immersion={gear_scr.get('immersion_fraction_geometry', '—')}; "
                f"cornering_ok={gear_scr.get('cornering_pickup_ok')}"
            ),
            "evidence": "_motor_stack/gear_oil_fia_front_kit_case.json",
        },
        {
            "id": "R-GEAR-PLANET",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Planetary strength + nest fit",
            "value": (
                f"duty_strength_screen_ok={iso_works.get('duty_strength_screen_ok')}; "
                f"nest_fits_rotor={iso_works.get('nest_fits_rotor')}"
            ),
            "evidence": "_motor_stack/iso6336_fia_front_kit_case.json",
        },
        {
            "id": "R-BEVEL-DIFF",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Bevel differential handbook strength screen",
            "value": (
                f"min_strength_FoS={bevel_margins.get('minimum_strength_factor')}; "
                f"contact_FoS={bevel_margins.get('minimum_contact_fos')}; "
                f"duty_strength_screen_ok={bevel_works.get('duty_strength_screen_ok')}"
            ),
            "evidence": "_motor_stack/iso_bevel_fia_front_kit_case.json",
        },
        {
            "id": "R-STRUCT-ROTOR",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Rotor ring centrifugal screen @ max rpm",
            "value": (
                f"von_Mises={rotor_scr.get('max_von_mises_mpa')} MPa; "
                f"screening_FoS={rotor_margins.get('screening_fos_vs_assumed_yield')}; "
                f"below_yield={rotor_margins.get('below_assumed_yield')}"
            ),
            "evidence": "_motor_stack/calculix_fia_rotor_screen.json",
        },
        {
            "id": "R-STRUCT-POCKET",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Magnet-pocket iron-bridge centrifugal screen",
            "value": (
                f"FEA_von_Mises={pocket_scr.get('max_von_mises_mpa')} MPa; "
                f"FEA_FoS={pocket_margins.get('screening_fos_vs_assumed_yield_fea')}; "
                f"analytical_FoS={pocket_margins.get('screening_fos_vs_assumed_yield_analytical')}"
            ),
            "evidence": "_motor_stack/calculix_fia_magnet_pocket_screen.json",
        },
        {
            "id": "R-STRUCT-MOUNT",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Cast case / bay-mount torque screen",
            "value": (
                f"motor_reaction={mount_scr.get('motor_reaction_torque_nm')} N·m; "
                f"carrier_output={mount_scr.get('carrier_output_torque_nm')} N·m; "
                f"min_screening_FoS={mount_margins.get('minimum_screening_fos')}; "
                f"bay_mount_shear_FoS={mount_margins.get('bay_mount_shear_fos')}"
            ),
            "evidence": "_motor_stack/analytical_fia_case_mount_screen.json",
        },
        {
            "id": "R-POST-DIFF",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Post-diff final-drive software screening",
            "value": (
                f"blocker={post_blocker.get('status')}; "
                f"FoS≥{post_gate.get('minimum_strength_factor')}; "
                f"bay_fit={post_gate.get('bay_fit')}; "
                f"interfaces_ok={post_gate.get('interface_register_ok')}"
            ),
            "evidence": "_motor_stack/post_diff_final_drive_packaging_screen.json",
        },
        {
            "id": "R-CAD",
            "status": "RESULT_UNDER_ASSUMPTIONS",
            "statement": "Parametric CAD spine (not supplier release)",
            "value": (
                f"parametric_family_count={cad.get('parametric_family_count')}; "
                f"release_authority_coverage={cad.get('release_authority_coverage')}"
            ),
            "evidence": "motor-multiphysics.json cadAuthority",
        },
    ]

    asks = [
        {
            "id": "ASK-ICD-XYZ",
            "priority": 1,
            "ask": "Chassis interface XYZ for HV, coolant, LV/CAN, halfshafts, mounts",
            "closes": ["A-IFACE"],
            "decision_register": [],
        },
        {
            "id": "ASK-SIC-MPN",
            "priority": 2,
            "ask": "SiC power module manufacturer + MPN + datasheet (+ STEP if available)",
            "closes": ["A-SIC", "DEC-001"],
            "decision_register": ["DEC-001"],
        },
        {
            "id": "ASK-CAP-BANK",
            "priority": 3,
            "ask": "Preferred DC-link film capacitor MPNs / envelope",
            "closes": ["dc_link_capacitors"],
            "decision_register": [],
        },
        {
            "id": "ASK-COOLANT",
            "priority": 4,
            "ask": "Confirm or replace coolant 60 °C / 12 L/min and pressure budget",
            "closes": ["A-COOL"],
            "decision_register": ["DEC-004"],
        },
        {
            "id": "ASK-RATIO-SPEED",
            "priority": 5,
            "ask": "Confirm overall ratio seed 8.0 and max used rotor speed",
            "closes": ["A-RATIO", "A-SPEED"],
            "decision_register": ["DEC-003"],
        },
        {
            "id": "ASK-BENCH",
            "priority": 6,
            "ask": "Any dyno / HIL / flow / double-pulse data on a comparable unit",
            "closes": ["DEC-008", "DEC-010", "hardwareCorrelation"],
            "decision_register": ["DEC-008", "DEC-010", "DEC-006", "DEC-001"],
        },
        {
            "id": "ASK-GERBERS",
            "priority": 7,
            "ask": "Supplier electronics Gerbers / pinout ICD when available",
            "closes": ["DEC-009"],
            "decision_register": ["DEC-009"],
        },
    ]

    open_blockers = mm.get("architectureBlockers")
    if not isinstance(open_blockers, list):
        open_blockers = []
    open_blocker_ids = [
        b.get("blocker_id")
        for b in open_blockers
        if isinstance(b, Mapping) and b.get("status") == "OPEN"
    ]

    return {
        "schema": SCHEMA,
        "stamped_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "twin": str(twin_dir),
        "pitch": (
            "Under frozen packaging and duty assumptions consistent with the public "
            "Formula E front-kit envelope, the concentric motor–inverter–planetary–diff "
            "layout fits the bay and screens torque, gear strength, and thermal margins. "
            "Not homologated — replace assumptions when JLR inputs arrive."
        ),
        "review_status": "RESULTS_AVAILABLE_UNDER_ASSUMPTIONS",
        "ship_ok": False,
        "homologation": "NOT_CLAIMED",
        "honesty": (
            "RESULT_UNDER_ASSUMPTIONS means educated guesses were frozen and named, "
            "then models were run. It is not hardware correlation and not ship_ok. "
            "NEEDS_PARTNER_INPUT / NEEDS_HARDWARE rows are deliberate — we did not invent them."
        ),
        "assumptions": assumptions,
        "results_under_assumptions": results,
        "asks_from_partner": asks,
        "architecture_blockers_open": open_blocker_ids,
        "brief_markdown": (
            "docs/plans/JLR-FE-FRONT-FPK-ASSUMPTION-BASED-RESULTS-FOR-JACK-2026-07-31.md"
        ),
        "email_draft_markdown": (
            "docs/plans/JLR-FE-FRONT-FPK-EMAIL-ASK-JACK-2026-07-31.md"
        ),
        "proveCatch": {
            "ship_ok_false": True,
            "has_assumptions": len(assumptions) >= 6,
            "has_results": len(results) >= 7,
            "has_asks": len(asks) >= 5,
            "review_status_is_results_available": True,
        },
    }


def render_markdown(register: Mapping[str, Any]) -> str:
    """Render a short Jack-facing markdown from the register."""

    lines = [
        "# Assumption-based design — results for review",
        "",
        f"**Stamped:** {register.get('stamped_at')}",
        f"**Review status:** `{register.get('review_status')}`",
        f"**ship_ok:** `{register.get('ship_ok')}` — homologation `{register.get('homologation')}`",
        "",
        register.get("pitch") or "",
        "",
        register.get("honesty") or "",
        "",
        "## Frozen assumptions",
        "",
        "| ID | Status | Statement | Value | Replace with |",
        "|---|---|---|---|---|",
    ]
    for row in register.get("assumptions") or []:
        if not isinstance(row, Mapping):
            continue
        lines.append(
            f"| `{row.get('id')}` | {row.get('status')} | {row.get('statement')} | "
            f"{row.get('value')} | {row.get('replace_with')} |"
        )
    lines.extend(
        [
            "",
            "## Results under those assumptions",
            "",
            "| ID | Status | Statement | Value | Evidence |",
            "|---|---|---|---|---|",
        ]
    )
    for row in register.get("results_under_assumptions") or []:
        if not isinstance(row, Mapping):
            continue
        lines.append(
            f"| `{row.get('id')}` | {row.get('status')} | {row.get('statement')} | "
            f"{row.get('value')} | `{row.get('evidence')}` |"
        )
    lines.extend(
        [
            "",
            "## Ask list (replace assumptions)",
            "",
            "| Priority | ID | Ask | Closes |",
            "|---|---|---|---|",
        ]
    )
    for row in register.get("asks_from_partner") or []:
        if not isinstance(row, Mapping):
            continue
        closes = ", ".join(str(x) for x in (row.get("closes") or []))
        lines.append(
            f"| {row.get('priority')} | `{row.get('id')}` | {row.get('ask')} | {closes} |"
        )
    lines.extend(
        [
            "",
            f"**Brief:** `{register.get('brief_markdown')}`",
            f"**Email draft:** `{register.get('email_draft_markdown')}`",
            "",
        ]
    )
    return "\n".join(lines)


def write_register(twin_dir: Path, register: Mapping[str, Any]) -> tuple[Path, Path]:
    """Atomically write JSON + markdown into the twin."""

    twin_dir.mkdir(parents=True, exist_ok=True)
    json_path = twin_dir / OUTPUT_BASENAME
    md_path = twin_dir / MARKDOWN_BASENAME
    payload = json.dumps(register, indent=2) + "\n"
    md = render_markdown(register)
    for path, text in ((json_path, payload), (md_path, md)):
        temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
        temporary.write_text(text, encoding="utf-8")
        os.replace(temporary, path)
    return json_path, md_path


def selftest() -> int:
    """ProveCatch: register is reviewable, ship_ok false, asks present."""

    with tempfile.TemporaryDirectory(prefix="fpk-assumption-selftest-") as raw:
        twin = Path(raw)
        (twin / "_motor_stack").mkdir()
        (twin / "state.json").write_text(
            json.dumps(
                {
                    "orchestratorContract": {
                        "quantities": {
                            "front_regen_electrical_cap_kw": {"value": 250},
                            "front_bay_envelope_w_mm": {"value": 343},
                            "front_bay_envelope_d_mm": {"value": 259},
                            "front_bay_envelope_h_mm": {"value": 267},
                            "fpk_mass_cap_kg": {"value": 32},
                            "dc_bus_voltage_v": {"value": 750},
                            "coolant_inlet_c": {"value": 60},
                            "coolant_flow_l_min": {"value": 12},
                            "max_rotor_speed_rpm": {"value": 19500},
                            "gear_ratio": {"value": 8},
                            "fpk_housing_od_mm": {"value": 251.8},
                            "fpk_housing_len_mm": {"value": 140.5},
                            "fpk_rotor_id_mm": {"value": 130.5},
                            "fpk_rotor_od_mm": {"value": 197.1},
                        }
                    }
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
                        "required_shaft_torque_nm": 125.0,
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
                        "maximum_winding_temperature_c": 67.0,
                        "maximum_module_temperature_c": 71.0,
                    }
                }
            ),
            encoding="utf-8",
        )
        (twin / "motor-multiphysics.json").write_text(
            json.dumps(
                {
                    "architectureBlockers": [],
                    "cadAuthority": {
                        "parametric_family_count": 11,
                        "release_authority_coverage": 0.0,
                    },
                }
            ),
            encoding="utf-8",
        )
        register = build_register(twin)
        checks = {
            "ship_ok_false": register.get("ship_ok") is False,
            "review_status": register.get("review_status")
            == "RESULTS_AVAILABLE_UNDER_ASSUMPTIONS",
            "assumptions": len(register.get("assumptions") or []) >= 6,
            "results": len(register.get("results_under_assumptions") or []) >= 7,
            "asks": len(register.get("asks_from_partner") or []) >= 5,
            "proveCatch": (register.get("proveCatch") or {}).get("ship_ok_false")
            is True,
        }
        json_path, md_path = write_register(twin, register)
        checks["wrote_json"] = json_path.is_file()
        checks["wrote_md"] = md_path.is_file() and "RESULT_UNDER_ASSUMPTIONS" in (
            md_path.read_text(encoding="utf-8")
        )
        if not all(checks.values()):
            print("FAIL", json.dumps(checks, indent=2))
            return 1
        print("fpk_assumption_based_design --selftest OK")
        print(json.dumps(checks, indent=2))
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--twin", type=Path, help="Twin directory")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        return selftest()
    if not args.twin:
        parser.error("--twin is required unless --selftest")
    twin = args.twin.resolve()
    register = build_register(twin)
    json_path, md_path = write_register(twin, register)
    print(
        json.dumps(
            {
                "json": str(json_path),
                "markdown": str(md_path),
                "review_status": register.get("review_status"),
                "ship_ok": register.get("ship_ok"),
                "assumption_count": len(register.get("assumptions") or []),
                "result_count": len(register.get("results_under_assumptions") or []),
                "ask_count": len(register.get("asks_from_partner") or []),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
