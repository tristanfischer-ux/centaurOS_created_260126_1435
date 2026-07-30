#!/usr/bin/env python3
"""Build motorMultiphysics + cadAuthority evidence stubs for integrated drive twins.

INTENT: Make solver/CAD work *visible* in state and Excel-ready artefacts while
remaining honest — toolchain smokes are not twin-bound solves. Every required
check stays OPEN; ship_ok stays false until real revision-matched evidence exists.

Plan schema:
  docs/plans/MOTOR-MULTIPHYSICS-AND-CAD-PLAIN-LANGUAGE-2026-07-30.md
FIA duties:
  docs/plans/FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, MutableMapping, Optional

ROOT = Path(__file__).resolve().parents[2]

SCHEMA_MOTOR = "motor-multiphysics/v1"
SCHEMA_CAD = "cad-authority/v1"
SCHEMA_HARDWARE_CORRELATION = "motor-hardware-correlation/v1"
ASSEMBLY_REVISION = "front-drive-concept-stub-2026-07-30"

# INTENT (2026-07-30): Architecture / packaging blockers must be machine-readable
# with permanent unblock paths — never chat-only, never greenwashed to ship_ok.
BLOCKER_ID_DIFF_NEST = "DIFF_NEST_TOO_SMALL_FOR_CARRIER_TORQUE"
BLOCKER_ID_POST_DIFF_FINAL_DRIVE = "POST_DIFF_FINAL_DRIVE_PACKAGING"
_DIFF_NEST_PERMANENT_UNBLOCK: list[dict[str, str]] = [
    {
        "option_id": "enlarge_diff_nest",
        "kind": "geometry_writeback",
        "summary": (
            "Raise kit-allowed bevel nest OD (and planetary ring tip) so a "
            "strength-driven nest clears FoS ≥ 1.2, then sync CadQuery + Blender."
        ),
        "code_hooks": (
            "scripts/motor-stack/iso_bevel_fia_front_kit_case.py"
            "#MAX_DIFF_OD_IN_KIT_MM;"
            "Tier 1 and 2 parts for cad /tier2_motor_drivetrain.py#planetary_gearset;"
            "scripts/lib/edu_form_grammar.py"
        ),
    },
    {
        "option_id": "cut_torque_at_diff",
        "kind": "architecture_decision",
        "summary": (
            "Reduce carrier torque into the open bevel (ratio split, dual-path, "
            "or limited-slip torque budget) so the current nest envelope clears."
        ),
        "code_hooks": (
            "scripts/motor-stack/iso_bevel_fia_front_kit_case.py#derive_motor_shaft_torque_nm;"
            "Decision Register freeze: DIFF_TORQUE_BUDGET"
        ),
    },
    {
        "option_id": "change_diff_topology",
        "kind": "architecture_decision",
        "summary": (
            "Replace open straight-bevel nest (spur/helical face, compact "
            "torque-vectoring module, or locked axle strategy) with a topology "
            "that fits the bay and clears strength."
        ),
        "code_hooks": (
            "scripts/motor-stack/iso_bevel_fia_front_kit_case.py;"
            "docs/plans/MOTOR-MULTIPHYSICS-AND-CAD-PLAIN-LANGUAGE-2026-07-30.md"
            "#architecture-blockers"
        ),
    },
]

# INTENT: Physical correlation gaps are release holds, not footnotes. Link each
# to the existing Decision Register where that authority already exists.
_HARDWARE_CORRELATION_HOLDS: tuple[dict[str, Any], ...] = (
    {
        "hold_id": "DYNO_TORQUE_EFFICIENCY_MAP",
        "domain": "motor_inverter_performance",
        "decision_register_ids": ["DEC-010"],
        "required_evidence": (
            "Calibrated dyno raw data + torque/efficiency map over speed, current, "
            "voltage, and coolant conditions, revision-hashed to the assembly."
        ),
    },
    {
        "hold_id": "HIL_POPULATED_INVERTER",
        "domain": "controls_and_power_electronics",
        "decision_register_ids": ["DEC-008"],
        "required_evidence": (
            "Hardware-in-the-loop pass on the populated inverter revision, including "
            "safe-off, sensing, resolver, CAN, desaturation, and fault handling."
        ),
    },
    {
        "hold_id": "FLOW_BENCH_JACKET_AND_COLD_PLATE",
        "domain": "cooling_hydraulics",
        "decision_register_ids": [],
        "required_evidence": (
            "Measured pressure-flow curves for the motor jacket and inverter cold "
            "plate at controlled coolant temperature and concentration."
        ),
    },
    {
        "hold_id": "HEATER_PLATE_MODULE_TEMPS",
        "domain": "inverter_thermal",
        "decision_register_ids": ["DEC-001"],
        "required_evidence": (
            "Heater-plate test with calibrated module/case/coolant temperatures and "
            "TIM/contact stack matching the populated SiC module revision."
        ),
    },
    {
        "hold_id": "OVERSPEED_ROTOR_RETENTION",
        "domain": "rotor_structural",
        "decision_register_ids": ["DEC-006"],
        "required_evidence": (
            "Instrumented overspeed/retention test and correlated rotor stress model "
            "at the controlled maximum-speed release condition."
        ),
    },
    {
        "hold_id": "DOUBLE_PULSE_ESL_SIC",
        "domain": "inverter_switching",
        "decision_register_ids": ["DEC-001", "DEC-008"],
        "required_evidence": (
            "Double-pulse switching waveforms on populated SiC hardware with measured "
            "commutation-loop ESL, overshoot, switching loss, and gate settings."
        ),
    },
)
_POST_DIFF_FINAL_DRIVE_PERMANENT_UNBLOCK: list[dict[str, str]] = [
    {
        "option_id": "package_post_diff_final_drive",
        "kind": "geometry_writeback",
        "summary": (
            "Design the remaining post-differential reduction stage at the "
            "selected ratio, close gear/bearing/shaft/lubrication strength and "
            "fit it inside the FIA front-kit bay."
        ),
        "code_hooks": (
            "scripts/motor-stack/iso_bevel_fia_front_kit_case.py;"
            "Tier 1 and 2 parts for cad /tier2_motor_drivetrain.py;"
            "scripts/lib/fpk_concentric_geometry.py"
        ),
    },
    {
        "option_id": "revise_ratio_split_or_topology",
        "kind": "architecture_decision",
        "summary": (
            "Revise the pre/post-differential ratio split or select another "
            "final-drive topology if the packaged post-diff stage cannot fit."
        ),
        "code_hooks": (
            "_motor_stack/diff_architecture_decision.json;"
            "scripts/motor-stack/iso_bevel_fia_front_kit_case.py"
        ),
    },
]

# Last-known-green toolchain smoke notes (README / 2026-07-30 proofs).
# These prove the *tools* run — never that the FIA twin geometry was solved.
_KNOWN_SMOKE: dict[str, dict[str, Any]] = {
    "magnetic": {
        "software": "Pyleecan + xfemm + MTPA/demag screens",
        "paths": [
            "scripts/motor-stack/em_magnetic_selftest.py",
            "scripts/motor-stack/em_fia_front_kit_case.py",
            "scripts/motor-stack/em_fia_mtpa_screen.py",
            "scripts/motor-stack/em_fia_demag_screen.py",
            "scripts/phantm/bin/femmcli",
        ],
        "versions": {
            "pyleecan": "1.5.2",
            "pyleecan_source_rev": "7937d675fb77701ac8f2c65816b583cb29270e12",
            "xfemm_femmcli": "0.0.0-dev",
            "triangle": "1.6.0",
        },
        "last_known_green": "2026-07-30 — licensed IPMSM_B open-circuit sector (generic training machine)",
        "evidence_class": "toolchain_smoke_pass",
    },
    "rotor_dynamics": {
        "software": "ROSS",
        "paths": [
            "scripts/motor-stack/ross_rotor_selftest.py",
            "scripts/motor-stack/ross_fia_front_kit_case.py",
        ],
        "versions": {"ross": "2.3.0"},
        "last_known_green": "2026-07-30 — 1 m steel shaft beam model critical speed (generic)",
        "evidence_class": "toolchain_smoke_pass",
    },
    "structural": {
        "software": "Gmsh + CalculiX + analytical case/mount screen",
        "paths": [
            "scripts/motor-stack/calculix_smoke_selftest.sh",
            "scripts/motor-stack/calculix_fia_rotor_screen.py",
            "scripts/motor-stack/calculix_fia_magnet_pocket_screen.py",
            "scripts/motor-stack/analytical_fia_case_mount_screen.py",
            "scripts/motor-stack/calculix.Dockerfile",
        ],
        "versions": {"calculix_ccx": "2.21", "image": "forgeos/calculix:2.21-arm64"},
        "last_known_green": "2026-07-30 — cantilever solid displacement+stress fields (generic)",
        "evidence_class": "toolchain_smoke_pass",
    },
    "water_jacket": {
        "software": "OpenFOAM",
        "paths": [
            "scripts/motor-stack/openfoam_smoke_selftest.sh",
            "scripts/motor-stack/openfoam_fia_water_jacket_case.py",
            "scripts/motor-stack/openfoam_fia_water_jacket_case.sh",
            "scripts/motor-stack/analytical_fia_cooling_thermal_screen.py",
        ],
        "versions": {
            "openfoam_image": "microfluidica/openfoam:14",
            "digest": "sha256:efba53ae22dc5154114a9dd346c979b3cd7f3e20ebed90e399230c02592aecbf",
        },
        "last_known_green": (
            "2026-07-30 — cavity smoke + twin-bound rectangular duct screen "
            "(not full helical CHT)"
        ),
        "evidence_class": "toolchain_smoke_pass",
    },
    "inverter_cold_plate": {
        "software": "OpenFOAM",
        "paths": [
            "scripts/motor-stack/openfoam_smoke_selftest.sh",
            "scripts/motor-stack/openfoam_fia_cold_plate_case.py",
            "scripts/motor-stack/openfoam_fia_cold_plate_case.sh",
            "scripts/motor-stack/analytical_fia_cooling_thermal_screen.py",
        ],
        "versions": {
            "openfoam_image": "microfluidica/openfoam:14",
        },
        "last_known_green": (
            "2026-07-30 — cavity smoke + twin-bound rectangular duct screen "
            "(not full serpentine CHT)"
        ),
        "evidence_class": "toolchain_smoke_pass",
    },
    "gear_oil": {
        "software": "Analytical handbook screen (+ OpenFOAM cavity smoke)",
        "paths": [
            "scripts/motor-stack/gear_oil_fia_front_kit_case.py",
            "scripts/motor-stack/openfoam_smoke_selftest.sh",
        ],
        "versions": {
            "openfoam_image": "microfluidica/openfoam:14",
            "analytical": "gear_oil_fia_front_kit_case/v1",
        },
        "last_known_green": (
            "2026-07-30 — cavity smoke + twin-bound analytical jet/churning/"
            "pickup screen (free-surface CFD OPEN)"
        ),
        "evidence_class": "toolchain_smoke_pass",
    },
    "gear_strength": {
        "software": "ISO 6336 + KISSsoft + CalculiX",
        "paths": [
            "scripts/motor-stack/iso6336_fia_front_kit_case.py",
            "scripts/motor-stack/iso_bevel_fia_front_kit_case.py",
            "scripts/motor-stack/calculix_smoke_selftest.sh",
        ],
        "versions": {
            "iso6336_screen": "analytical_simplified_v1",
            "iso_bevel_screen": "straight_bevel_handbook_not_iso23509_v1",
            "calculix_ccx": "2.21",
            "kisssoft": "licence_not_proven_in_repo",
        },
        "last_known_green": (
            "2026-07-30 — twin-bound ISO 6336-style planetary screen + "
            "straight-bevel differential handbook SCREEN on "
            "formula-e-front-mgu-20260729-1432 (unbudgeted i=8 bevel nest fails; "
            "cut_torque_at_diff i=2 screening clears at OD 120 mm while post-diff "
            "final-drive packaging remains OPEN; "
            "ISO 23509 / KISSsoft / spectrum / tooth-contact FEA still OPEN)"
        ),
        "evidence_class": "toolchain_smoke_pass",
    },
}

# Principal CAD register for an integrated front drive (plan § Major machine parts).
# Stator, rotor carrier, and planetary gearset are parametric educational families.
_PRINCIPAL_COMPONENTS: list[dict[str, Any]] = [
    {
        "component_id": "traction_drive_housing",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Cast case / end bells / inverter cover — screening Blender geometry",
    },
    {
        "component_id": "stator_lamination_and_winding",
        "authority_level": "parametric_family",
        "source_type": "cadquery_family",
        "cad_family": "ipmsm_stator_lamination",
        "notes": (
            "Parametric family exists (Pyleecan IPMSM_B licensed seed). "
            "Not yet revision-bound to this FIA front twin slot count / OD."
        ),
    },
    {
        "component_id": "rotor_magnet_carrier",
        "authority_level": "parametric_family",
        "source_type": "cadquery_family",
        "cad_family": "ipmsm_rotor_magnet_carrier",
        "notes": (
            "Parametric V-pocket carrier family seeded (Apache-2.0 educational). "
            "Not yet the twin-bound burst/demagnetisation release rotor."
        ),
    },
    {
        "component_id": "rotor_bearing_stack",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Generic bearing seats — no supplier identity",
    },
    {
        "component_id": "planetary_reduction_set",
        "authority_level": "parametric_family",
        "source_type": "cadquery_family",
        "cad_family": "planetary_gearset",
        "notes": (
            "Parametric planetary family seeded (cq_gears / Apache-2.0). "
            "Twin-bound ISO 6336-style screen may be PARTIAL under _motor_stack/; "
            "KISSsoft / race spectrum / tooth-contact FEA still OPEN."
        ),
    },
    {
        "component_id": "compact_bevel_differential",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": (
            "Architecture communication — twin-bound straight-bevel handbook "
            "SCREEN may be cited under gear_strength.twin_bound_case; "
            "ISO 23509 / KISSsoft / contact pattern still OPEN"
        ),
    },
    {
        "component_id": "integrated_drive_oil_circuit",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Named inventory; jet/flow CFD OPEN",
    },
    {
        "component_id": "traction_motor_water_jacket",
        "authority_level": "parametric_family",
        "source_type": "cadquery_family",
        "cad_family": "motor_water_jacket_helical",
        "notes": (
            "Parametric helical jacket family seeded (ForgeOS source-owned). "
            "CFD / conjugate heat transfer / winding temperatures still OPEN."
        ),
    },
    {
        "component_id": "inverter_cold_plate",
        "authority_level": "parametric_family",
        "source_type": "cadquery_family",
        "cad_family": "cold_plate_serpentine",
        "notes": (
            "Parametric serpentine cold-plate family seeded (ForgeOS / Apache-2.0 "
            "training check). CFD / conjugate heat transfer still OPEN."
        ),
    },
    {
        "component_id": "sic_power_modules",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Phase volumes — supplier package identity OPEN",
    },
    {
        "component_id": "laminated_dc_bus",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Cross-section seed — FastHenry2 / measured ESL OPEN",
    },
    {
        "component_id": "dc_link_capacitors",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Generic film bank — MPN / life OPEN",
    },
    {
        "component_id": "vehicle_interface_connectors",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "HV/LV/coolant shells — FIA port XYZ OPEN",
    },
]


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _qty_value(qs: Mapping[str, Any], key: str, default: Any = None) -> Any:
    raw = qs.get(key)
    if isinstance(raw, dict):
        return raw.get("value", default)
    if raw is None:
        return default
    return raw


def extract_fia_duty(state: Optional[Mapping[str, Any]] = None) -> dict[str, Any]:
    """Pull FIA front-kit binding numbers from twin quantities (with plan defaults).

    @description Prefer live twin quantities; fall back to public binding table.
    @param state Optional loaded state.json object
    @returns Duty dict used in notes and markdown
    """
    qs: Mapping[str, Any] = {}
    if isinstance(state, Mapping):
        oc = state.get("orchestratorContract") or {}
        if isinstance(oc, Mapping):
            raw_qs = oc.get("quantities") or {}
            if isinstance(raw_qs, Mapping):
                qs = raw_qs

    return {
        "front_regen_electrical_cap_kw": _qty_value(qs, "front_regen_electrical_cap_kw", 250),
        "continuous_design_duty_kw": 250,
        "bay_w_mm": _qty_value(qs, "front_bay_envelope_w_mm", 343),
        "bay_d_mm": _qty_value(qs, "front_bay_envelope_d_mm", 259),
        "bay_h_mm": _qty_value(qs, "front_bay_envelope_h_mm", 267),
        "mass_cap_kg": _qty_value(qs, "fpk_mass_cap_kg", 32),
        "max_rotor_speed_rpm": _qty_value(qs, "max_rotor_speed_rpm", 19500),
        "dc_bus_voltage_v": _qty_value(qs, "dc_bus_voltage_v", 750),
        "coolant_inlet_c": _qty_value(qs, "coolant_inlet_c", 60),
        "coolant_flow_l_min": _qty_value(qs, "coolant_flow_l_min", 12),
        "binding_doc": "docs/plans/FIA-FRONT-POWERTRAIN-KIT-BINDING-REQUIREMENTS-2026-07-30.md",
    }


def _paths_exist(rel_paths: list[str]) -> dict[str, bool]:
    return {p: (ROOT / p).is_file() for p in rel_paths}


def _open_check(
    key: str,
    *,
    extra: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    smoke = _KNOWN_SMOKE[key]
    body: dict[str, Any] = {
        "status": "OPEN",
        "software": smoke["software"],
        "model_revision": None,
        "geometry_revision": None,
        "input_hash": None,
        "result_ref": None,
        "correlation_ref": None,
        "toolchain_smoke": {
            "evidence_class": smoke["evidence_class"],
            "paths": smoke["paths"],
            "paths_present": _paths_exist(list(smoke["paths"])),
            "versions": smoke["versions"],
            "last_known_green": smoke["last_known_green"],
            "note": (
                "Generic toolchain smoke — NOT a twin-bound solve on this "
                "assembly_revision. required_check remains OPEN."
            ),
        },
    }
    if extra:
        body.update(dict(extra))
    return body


def _load_fia_case_json(twin_dir: Optional[Path], filename: str) -> Optional[dict[str, Any]]:
    """Load a twin-bound FIA motor-stack case artefact if present."""
    if twin_dir is None:
        return None
    path = Path(twin_dir) / "_motor_stack" / filename
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _load_fia_magnetic_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA magnetic case artefact if present."""
    return _load_fia_case_json(twin_dir, "em_fia_front_kit_case.json")


def _load_fia_demag_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA hot demagnetisation screen artefact if present."""
    return _load_fia_case_json(twin_dir, "em_fia_demag_screen.json")


def _load_fia_mtpa_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA denser MTPA screen artefact if present."""
    return _load_fia_case_json(twin_dir, "em_fia_mtpa_screen.json")


def _load_fia_ross_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA ROSS rotor-dynamics case artefact if present."""
    return _load_fia_case_json(twin_dir, "ross_fia_front_kit_case.json")


def _load_fia_calculix_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA CalculiX rotor centrifugal screen artefact if present."""
    return _load_fia_case_json(twin_dir, "calculix_fia_rotor_screen.json")


def _load_fia_magnet_pocket_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA magnet-pocket / iron-bridge screen artefact if present."""
    return _load_fia_case_json(twin_dir, "calculix_fia_magnet_pocket_screen.json")


def _load_fia_case_mount_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA cast-case / bay-mount analytical screen if present."""
    return _load_fia_case_json(twin_dir, "analytical_fia_case_mount_screen.json")


def _load_fia_cold_plate_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA OpenFOAM cold-plate duct artefact if present."""
    return _load_fia_case_json(twin_dir, "openfoam_fia_cold_plate_case.json")


def _load_fia_water_jacket_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA OpenFOAM water-jacket duct artefact if present."""
    return _load_fia_case_json(twin_dir, "openfoam_fia_water_jacket_case.json")


def _load_fia_cooling_thermal_screen(
    twin_dir: Optional[Path],
) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA lumped cooling/thermal screen if present."""
    return _load_fia_case_json(
        twin_dir, "analytical_fia_cooling_thermal_screen.json"
    )


def _load_fia_iso6336_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA ISO 6336-style gear-strength artefact if present."""
    return _load_fia_case_json(twin_dir, "iso6336_fia_front_kit_case.json")


def _load_fia_iso_bevel_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA straight-bevel differential screen artefact if present."""
    return _load_fia_case_json(twin_dir, "iso_bevel_fia_front_kit_case.json")


def _load_fia_gear_oil_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA analytical gear-oil artefact if present."""
    return _load_fia_case_json(twin_dir, "gear_oil_fia_front_kit_case.json")


def _load_fia_inverter_packaging_case(
    twin_dir: Optional[Path],
) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA inverter packaging artefact if present."""
    return _load_fia_case_json(twin_dir, "inverter_packaging_fia_front_kit_case.json")


def _demag_screen_cite(
    demag_case: Optional[Mapping[str, Any]],
    *,
    twin_dir: Path,
) -> Any:
    """Cite twin-bound hot demag SCREEN when present; else leave OPEN.

    INTENT: Surface analytical knee/Hci margin without claiming a full demag
    map PASS.  Always keeps ship_ok false and demag_map OPEN.
    """
    if not isinstance(demag_case, Mapping):
        return "OPEN"
    screen = (
        demag_case.get("screening_results")
        if isinstance(demag_case.get("screening_results"), dict)
        else {}
    )
    margins = (
        demag_case.get("margins") if isinstance(demag_case.get("margins"), dict) else {}
    )
    works = (
        demag_case.get("works_in_kit_context")
        if isinstance(demag_case.get("works_in_kit_context"), dict)
        else {}
    )
    demag_rel = "_motor_stack/em_fia_demag_screen.json"
    return {
        "status": demag_case.get("status") or "PARTIAL",
        "ship_ok": False,
        "path": demag_rel,
        "absolute_path": str((Path(twin_dir) / demag_rel).resolve()),
        "magnet_grade": screen.get("magnet_grade") or works.get("magnet_grade"),
        "magnet_temp_c": screen.get("magnet_temp_c") or works.get("magnet_temp_c"),
        "phase_current_rms_a": screen.get("phase_current_rms_a"),
        "current_angle_electrical_deg": screen.get("current_angle_electrical_deg"),
        "h_knee_a_per_m": screen.get("h_knee_a_per_m") or margins.get("h_knee_a_per_m"),
        "h_operating_a_per_m": (
            screen.get("h_operating_a_per_m") or margins.get("h_operating_a_per_m")
        ),
        "demagnetisation_margin_ratio": (
            screen.get("demagnetisation_margin_ratio")
            or margins.get("demagnetisation_margin_ratio")
            or works.get("demagnetisation_margin_ratio")
        ),
        "demagnetisation_margin_headroom": (
            screen.get("demagnetisation_margin_headroom")
            or margins.get("demagnetisation_margin_headroom")
        ),
        "demag_screen_ok": works.get("demag_screen_ok", margins.get("screen_ok")),
        "demag_map": "OPEN",
        "note": (
            "Twin-bound analytical hot knee / Hci SCREEN (N42UH-class seed). "
            "Not a full FE demag map; not supplier BH; not ship_ok."
        ),
    }


def _mtpa_screen_cite(
    mtpa_case: Optional[Mapping[str, Any]],
    *,
    twin_dir: Path,
) -> Any:
    """Cite the denser MTPA SCREEN while leaving the torque map OPEN.

    INTENT: Surface the useful angle × position evidence without upgrading a
    one-current-magnitude screen into torque-map or release closure.
    """

    if not isinstance(mtpa_case, Mapping):
        return "OPEN"
    grid = (
        mtpa_case.get("grid")
        if isinstance(mtpa_case.get("grid"), dict)
        else {}
    )
    summary = (
        mtpa_case.get("summary")
        if isinstance(mtpa_case.get("summary"), dict)
        else {}
    )
    coverage = (
        mtpa_case.get("coverage")
        if isinstance(mtpa_case.get("coverage"), dict)
        else {}
    )
    rel_ref = "_motor_stack/em_fia_mtpa_screen.json"
    return {
        "status": mtpa_case.get("status") or "PARTIAL",
        "ship_ok": False,
        "path": rel_ref,
        "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
        "grid_mode": grid.get("mode"),
        "n_current_angles": grid.get("n_current_angles"),
        "n_rotor_positions": grid.get("n_rotor_positions"),
        "n_points": summary.get("n_points") or grid.get("n_points"),
        "phase_current_rms_a": grid.get("phase_current_rms_a"),
        "peak_torque_magnitude_nm": summary.get("peak_torque_magnitude_nm"),
        "peak_airgap_flux_density_t": summary.get(
            "peak_airgap_flux_density_t"
        ),
        "best_screened_current_angle_electrical_deg": summary.get(
            "best_screened_current_angle_electrical_deg"
        ),
        "best_angle_mean_torque_magnitude_nm": summary.get(
            "best_angle_mean_torque_magnitude_nm"
        ),
        "denser_than_smoke": coverage.get("denser_than_smoke"),
        "torque_map": "OPEN",
        "note": (
            "Twin-bound current-angle × rotor-position SCREEN at one design "
            "current magnitude. Not a closed torque/loss/voltage/thermal map; "
            "not ship_ok."
        ),
    }


def _magnetic_check_from_fia_case(
    duty: Mapping[str, Any],
    case: Mapping[str, Any],
    *,
    twin_dir: Path,
    demag_case: Optional[Mapping[str, Any]] = None,
    mtpa_case: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    """Promote magnetic check to PARTIAL when a twin-bound open-circuit point exists.

    INTENT: Make the FIA front-kit magnetic case visible without claiming a torque
    map, full demagnetisation map PASS, or dynamometer correlation (those stay
    OPEN).  When present, cite the analytical hot demag SCREEN margin.
    """
    fem = case.get("finite_element_point") if isinstance(case.get("finite_element_point"), dict) else {}
    loaded = case.get("loaded_point") if isinstance(case.get("loaded_point"), dict) else {}
    works = (
        case.get("works_in_kit_context")
        if isinstance(case.get("works_in_kit_context"), dict)
        else {}
    )
    analytical = (
        case.get("analytical_duty_check")
        if isinstance(case.get("analytical_duty_check"), dict)
        else {}
    )
    position_sweep = (
        case.get("rotor_position_sweep")
        if isinstance(case.get("rotor_position_sweep"), dict)
        else {}
    )
    position_summary = (
        position_sweep.get("summary")
        if isinstance(position_sweep.get("summary"), dict)
        else {}
    )
    inputs = case.get("input_quantities") if isinstance(case.get("input_quantities"), dict) else {}
    rel_ref = "_motor_stack/em_fia_front_kit_case.json"
    duty_ok = bool(works.get("duty_torque_screen_ok"))
    demag_cite = _demag_screen_cite(demag_case, twin_dir=twin_dir)
    mtpa_cite = _mtpa_screen_cite(mtpa_case, twin_dir=twin_dir)
    demag_margin: Any = None
    if isinstance(demag_cite, dict):
        demag_margin = demag_cite.get("demagnetisation_margin_ratio")
    body = _open_check(
        "magnetic",
        extra={
            "status": "PARTIAL",
            "torque_map_ref": None,
            "loss_map_ref": None,
            "demagnetisation_margin": demag_margin,
            "works_in_kit_context": duty_ok,
            "duty_torque_screen_ok": duty_ok,
            "torque_vs_required_ratio": works.get("torque_vs_required_ratio")
            or loaded.get("torque_vs_required_ratio"),
            "model_revision": str(
                case.get("schema") or "forgeos.motor_stack.em_fia_front_kit_case/v2"
            ),
            "geometry_revision": str(
                (case.get("machine_geometry") or {}).get("topology")
                if isinstance(case.get("machine_geometry"), dict)
                else None
            ),
            "input_hash": case.get("input_quantities_sha256"),
            "result_ref": rel_ref,
            "fia_question": (
                f"Can the machine deliver {duty['continuous_design_duty_kw']} kW "
                "front regen inside voltage/current/temp/demag limits?"
            ),
            "twin_bound_case": {
                "status": case.get("status"),
                "ship_ok": False,
                "works_in_kit_context": duty_ok,
                "duty_torque_screen_ok": duty_ok,
                "path": rel_ref,
                "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
                "peak_airgap_flux_density_t": fem.get("peak_airgap_flux_density_t"),
                "rms_airgap_flux_density_t": fem.get("rms_airgap_flux_density_t"),
                "loaded_torque_nm": loaded.get("torque_nm"),
                "loaded_torque_magnitude_nm": loaded.get("torque_magnitude_nm"),
                "torque_vs_required_ratio": works.get("torque_vs_required_ratio")
                or loaded.get("torque_vs_required_ratio"),
                "current_angle_electrical_deg": loaded.get(
                    "current_angle_electrical_deg"
                ),
                "required_shaft_torque_nm": analytical.get("required_shaft_torque_nm"),
                "dc_current_a": analytical.get("dc_current_a"),
                "electrical_power_check_kw": analytical.get("electrical_power_check_kw"),
                "front_regen_cap_respected": analytical.get("front_regen_cap_respected"),
                "fits_bay": (
                    (case.get("machine_geometry") or {}).get("fits_bay")
                    if isinstance(case.get("machine_geometry"), dict)
                    else None
                ),
                "continuous_electrical_power_kw": inputs.get("continuous_electrical_power_kw"),
                "dc_bus_voltage_v": inputs.get("dc_bus_voltage_v"),
                "max_rotor_speed_rpm": inputs.get("max_rotor_speed_rpm"),
                # Coarse position-sweep summary when present; absent on older artefacts.
                "position_sweep": (
                    {
                        "status": position_sweep.get("status"),
                        "n_positions": position_summary.get("n_positions"),
                        "torque_vs_required_ratio_min": position_summary.get(
                            "torque_vs_required_ratio_min"
                        ),
                        "torque_vs_required_ratio_mean": position_summary.get(
                            "torque_vs_required_ratio_mean"
                        ),
                        "torque_vs_required_ratio_max": position_summary.get(
                            "torque_vs_required_ratio_max"
                        ),
                        "peak_to_peak_magnitude_nm": position_summary.get(
                            "peak_to_peak_magnitude_nm"
                        ),
                        "current_angle_electrical_deg": position_sweep.get(
                            "current_angle_electrical_deg"
                        ),
                    }
                    if position_summary.get("n_positions")
                    else None
                ),
                "demag_screen": demag_cite,
                "mtpa_screen": mtpa_cite,
                "demagnetisation_margin": demag_margin,
                "torque_map": "OPEN",
                "demagnetisation_map": "OPEN",
                "dynamometer_correlation": "OPEN",
                "note": (
                    "Twin-bound OC + loaded magnetic screen on kit geometry, "
                    "optionally with a coarse rotor-position sweep at the "
                    "screened current angle and an analytical hot demag SCREEN. "
                    "works_in_kit_context / duty_torque_screen_ok = |FE torque| "
                    "≥ ~75% of analytical shaft torque at the reference "
                    "position — NOT smoke-only, NOT full MTPA, NOT demag map "
                    "PASS, NOT ship_ok. Torque map / full demag map / dyno "
                    "still OPEN."
                ),
            },
        },
    )
    # GOTCHA: _open_check defaults status OPEN; twin-bound case must win.
    body["status"] = "PARTIAL"
    return body


def _rotor_dynamics_check_from_fia_case(
    duty: Mapping[str, Any],
    case: Mapping[str, Any],
    *,
    twin_dir: Path,
) -> dict[str, Any]:
    """Promote rotor_dynamics to PARTIAL when a twin-bound ROSS screen exists.

    INTENT: Make the FIA front-kit critical-speed screen visible without claiming
    bearing identity, Campbell diagrams, or modal/dyno correlation (those stay OPEN).
    """
    speeds = case.get("critical_speeds") if isinstance(case.get("critical_speeds"), dict) else {}
    margins = case.get("margins") if isinstance(case.get("margins"), dict) else {}
    inputs = case.get("input_quantities") if isinstance(case.get("input_quantities"), dict) else {}
    model = case.get("rotor_model") if isinstance(case.get("rotor_model"), dict) else {}
    rel_ref = "_motor_stack/ross_fia_front_kit_case.json"
    clear = bool(margins.get("clear_of_operating_band"))
    body = _open_check(
        "rotor_dynamics",
        extra={
            "status": "PARTIAL",
            "critical_speed_margin": margins.get("first_critical_over_operating"),
            "bearing_reaction_ref": None,
            "works_in_kit_context": clear,
            "model_revision": str(case.get("schema") or "forgeos.motor_stack.ross_fia_front_kit_case/v1"),
            "geometry_revision": (
                f"span={model.get('shaft_length_m')}m "
                f"shaft_od={model.get('shaft_outer_diameter_m')}m "
                f"disk_od={model.get('disk_outer_diameter_m')}m"
                if model
                else None
            ),
            "input_hash": case.get("input_quantities_sha256"),
            "result_ref": rel_ref,
            "fia_question": (
                f"Are critical speeds clear of the {duty['max_rotor_speed_rpm']} rpm "
                "operating band with margin?"
            ),
            "twin_bound_case": {
                "status": case.get("status"),
                "ship_ok": False,
                "works_in_kit_context": clear,
                "path": rel_ref,
                "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
                "first_critical_speed_rpm": speeds.get("first_critical_speed_rpm"),
                "operating_speed_rpm": speeds.get("operating_speed_rpm"),
                "margin_ratio_first_over_operating": margins.get(
                    "first_critical_over_operating"
                ),
                "clear_of_operating_band": margins.get("clear_of_operating_band"),
                "max_rotor_speed_rpm": inputs.get("max_rotor_speed_rpm"),
                "bearing_supplier_identity": "OPEN",
                "modal_or_dynamometer_correlation": "OPEN",
                "note": (
                    "Twin-bound ROSS beam critical-speed screen on kit-sized shaft + "
                    "rotor disk. works_in_kit_context = clear_of_operating_band. "
                    "Assumed bearing stiffness; not modal/dyno-correlated; "
                    "does not close release."
                ),
            },
        },
    )
    body["status"] = "PARTIAL"
    return body


def _structural_check_from_fia_case(
    duty: Mapping[str, Any],
    case: Mapping[str, Any],
    *,
    twin_dir: Path,
    magnet_pocket_case: Optional[Mapping[str, Any]] = None,
    case_mount_case: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    """Promote structural to PARTIAL when a twin-bound CalculiX screen exists.

    INTENT: Make the FIA front-kit centrifugal ring screen visible, and cite the
    magnet-pocket / iron-bridge and case/mount screens when present, without
    claiming closed release FoS (always OPEN) or flipping ship_ok.
    """
    screening = (
        case.get("screening_results")
        if isinstance(case.get("screening_results"), dict)
        else {}
    )
    margins = case.get("margins") if isinstance(case.get("margins"), dict) else {}
    inputs = case.get("input_quantities") if isinstance(case.get("input_quantities"), dict) else {}
    mesh = case.get("ring_mesh") if isinstance(case.get("ring_mesh"), dict) else {}
    rel_ref = "_motor_stack/calculix_fia_rotor_screen.json"
    below_yield = bool(margins.get("below_assumed_yield"))
    # GOTCHA: works_in_kit_context stays ring-screen below_yield so proveCatch
    # on the ring artefact alone does not break when pocket / case-mount cites
    # are absent.
    magnet_pocket_evidence: Any = "OPEN"
    if isinstance(magnet_pocket_case, Mapping):
        pocket_screening = (
            magnet_pocket_case.get("screening_results")
            if isinstance(magnet_pocket_case.get("screening_results"), dict)
            else {}
        )
        pocket_margins = (
            magnet_pocket_case.get("margins")
            if isinstance(magnet_pocket_case.get("margins"), dict)
            else {}
        )
        pocket_works = (
            magnet_pocket_case.get("works_in_kit_context")
            if isinstance(magnet_pocket_case.get("works_in_kit_context"), dict)
            else {}
        )
        pocket_rel = "_motor_stack/calculix_fia_magnet_pocket_screen.json"
        magnet_pocket_evidence = {
            "status": magnet_pocket_case.get("status") or "PARTIAL",
            "ship_ok": False,
            "path": pocket_rel,
            "absolute_path": str((Path(twin_dir) / pocket_rel).resolve()),
            "max_von_mises_mpa": pocket_screening.get("max_von_mises_mpa"),
            "analytical_bridge_stress_mpa": pocket_screening.get(
                "analytical_bridge_stress_mpa"
            ),
            "screening_fos_vs_yield_fea": pocket_margins.get(
                "screening_fos_vs_assumed_yield_fea"
            ),
            "screening_fos_vs_yield_analytical": pocket_margins.get(
                "screening_fos_vs_assumed_yield_analytical"
            ),
            "below_assumed_yield": pocket_margins.get("below_assumed_yield"),
            "works_in_kit_context": bool(
                pocket_works.get("bridge_screen_ok")
                if "bridge_screen_ok" in pocket_works
                else pocket_margins.get("below_assumed_yield")
            ),
            "release_fos_closed": False,
            "note": (
                "Twin-bound analytical+CalculiX outer iron-bridge / magnet-pocket "
                "centrifugal SCREEN. Not release FoS; not fillet burst mesh."
            ),
        }
    case_mount_evidence: Any = "OPEN"
    if isinstance(case_mount_case, Mapping):
        mount_screening = (
            case_mount_case.get("screening_results")
            if isinstance(case_mount_case.get("screening_results"), dict)
            else {}
        )
        mount_margins = (
            case_mount_case.get("margins")
            if isinstance(case_mount_case.get("margins"), dict)
            else {}
        )
        mount_works = (
            case_mount_case.get("works_in_kit_context")
            if isinstance(case_mount_case.get("works_in_kit_context"), dict)
            else {}
        )
        mount_rel = "_motor_stack/analytical_fia_case_mount_screen.json"
        case_mount_evidence = {
            "status": case_mount_case.get("status") or "PARTIAL",
            "ship_ok": False,
            "path": mount_rel,
            "absolute_path": str((Path(twin_dir) / mount_rel).resolve()),
            "motor_reaction_torque_nm": mount_screening.get(
                "motor_reaction_torque_nm"
            ),
            "carrier_output_torque_nm": mount_screening.get(
                "carrier_output_torque_nm"
            ),
            "flange_bolt_shear_fos": mount_margins.get("flange_bolt_shear_fos"),
            "bay_mount_shear_fos": mount_margins.get("bay_mount_shear_fos"),
            "bay_mount_tension_fos": mount_margins.get("bay_mount_tension_fos"),
            "housing_wall_torsion_fos": mount_margins.get(
                "housing_wall_torsion_fos"
            ),
            "minimum_screening_fos": mount_margins.get("minimum_screening_fos"),
            "below_assumed_allowables": mount_margins.get(
                "below_assumed_allowables"
            ),
            "works_in_kit_context": bool(
                mount_works.get("case_mount_screen_ok")
                if "case_mount_screen_ok" in mount_works
                else mount_margins.get("below_assumed_allowables")
            ),
            "calculix_full_case": "OPEN",
            "release_fos_closed": False,
            "note": (
                "Twin-bound analytical cast-case / bay-mount SCREEN under motor "
                "reaction + carrier output + bump tension. Full-case CalculiX "
                "OPEN; not release FoS."
            ),
        }
    load_parts = ["centrifugal_overspeed_ring_screen"]
    if isinstance(magnet_pocket_evidence, dict):
        load_parts.append("magnet_pocket_bridge_screen")
    if isinstance(case_mount_evidence, dict):
        load_parts.append("case_mount_torque_screen")
    note_extra = ""
    if isinstance(magnet_pocket_evidence, dict):
        note_extra += (
            " Magnet-pocket / iron-bridge screen cited when present "
            "(still SCREENING, not release)."
        )
    else:
        note_extra += (
            " Magnet-pocket burst FEA remains OPEN until "
            "calculix_fia_magnet_pocket_screen.json is present."
        )
    if isinstance(case_mount_evidence, dict):
        note_extra += (
            " Cast-case / bay-mount analytical screen cited when present "
            "(still SCREENING; full-case CalculiX OPEN)."
        )
    else:
        note_extra += (
            " Case / mount torque screen remains OPEN until "
            "analytical_fia_case_mount_screen.json is present."
        )
    body = _open_check(
        "structural",
        extra={
            "status": "PARTIAL",
            "load_case_set": "+".join(load_parts),
            "minimum_factor_of_safety": margins.get("screening_fos_vs_assumed_yield"),
            "works_in_kit_context": below_yield,
            "model_revision": str(
                case.get("schema") or "forgeos.motor_stack.calculix_fia_rotor_screen/v1"
            ),
            "geometry_revision": (
                f"ri={mesh.get('rotor_inner_radius_mm')}mm "
                f"ro={mesh.get('rotor_outer_radius_mm')}mm "
                f"L={mesh.get('axial_length_mm')}mm"
                if mesh
                else None
            ),
            "input_hash": case.get("input_quantities_sha256"),
            "result_ref": rel_ref,
            "fia_question": (
                f"Do rotor retention, case, mounts and joints survive "
                f"{duty['max_rotor_speed_rpm']} rpm and torque reaction inside the "
                f"{duty['mass_cap_kg']} kg / bay box?"
            ),
            "twin_bound_case": {
                "status": case.get("status"),
                "ship_ok": False,
                "works_in_kit_context": below_yield,
                "path": rel_ref,
                "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
                "max_von_mises_mpa": screening.get("max_von_mises_mpa"),
                "max_principal_stress_mpa": screening.get("max_principal_stress_mpa"),
                "max_abs_displacement_mm": screening.get("max_abs_displacement_mm"),
                "screening_fos_vs_yield": margins.get("screening_fos_vs_assumed_yield"),
                "below_assumed_yield": margins.get("below_assumed_yield"),
                "release_fos_closed": False,
                "max_rotor_speed_rpm": inputs.get("max_rotor_speed_rpm"),
                "magnet_pocket_burst_fea": magnet_pocket_evidence,
                "case_mount_screen": case_mount_evidence,
                "note": (
                    "Twin-bound CalculiX steel-ring centrifugal screen at kit rpm. "
                    "works_in_kit_context = ring below_assumed_yield (screening only). "
                    "Assumed isotropic steel; release FoS not closed."
                    + note_extra
                ),
            },
        },
    )
    body["status"] = "PARTIAL"
    return body


def _thermal_screen_cite(
    thermal_case: Optional[Mapping[str, Any]],
    *,
    twin_dir: Path,
) -> Any:
    """Build a fail-closed cite for the lumped cooling/thermal screen.

    INTENT: Surface useful twin-bound temperatures in hydraulic check rows
    without converting a PARTIAL lumped model into CHT or hardware PASS.
    """

    if not isinstance(thermal_case, Mapping):
        return "OPEN"
    results = (
        thermal_case.get("screening_results")
        if isinstance(thermal_case.get("screening_results"), Mapping)
        else {}
    )
    cht = (
        thermal_case.get("conjugate_heat_transfer")
        if isinstance(thermal_case.get("conjugate_heat_transfer"), Mapping)
        else {}
    )
    flow = (
        thermal_case.get("flow_bench")
        if isinstance(thermal_case.get("flow_bench"), Mapping)
        else {}
    )
    rel_ref = "_motor_stack/analytical_fia_cooling_thermal_screen.json"
    return {
        "status": thermal_case.get("status") or "PARTIAL",
        "ship_ok": False,
        "path": rel_ref,
        "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
        "input_hash": thermal_case.get("input_quantities_sha256"),
        "maximum_winding_temperature_c": results.get(
            "maximum_winding_temperature_c"
        ),
        "maximum_magnet_temperature_c": results.get(
            "maximum_magnet_temperature_c"
        ),
        "maximum_module_temperature_c": results.get(
            "maximum_module_temperature_c"
        ),
        "coolant_outlet_temperature_c": results.get(
            "coolant_outlet_temperature_c"
        ),
        "conjugate_heat_transfer": cht.get("status") or "OPEN",
        "flow_bench": flow.get("status") or "OPEN",
        "note": (
            "Twin-bound steady lumped thermal SCREEN. Temperatures are analytical "
            "screening values; CHT and physical flow/heater-plate correlation stay OPEN."
        ),
    }


def _cold_plate_check_from_fia_case(
    duty: Mapping[str, Any],
    case: Mapping[str, Any],
    *,
    twin_dir: Path,
    thermal_case: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    """Promote inverter_cold_plate to PARTIAL when a twin-bound OF duct exists.

    INTENT: Make the 12 L/min / 60 °C cold-plate duct screen visible without
    claiming module temperatures or full serpentine conjugate heat transfer.
    """
    pressure = (
        case.get("pressure_drop") if isinstance(case.get("pressure_drop"), dict) else {}
    )
    channel = (
        case.get("channel_geometry")
        if isinstance(case.get("channel_geometry"), dict)
        else {}
    )
    inputs = case.get("input_quantities") if isinstance(case.get("input_quantities"), dict) else {}
    rel_ref = "_motor_stack/openfoam_fia_cold_plate_case.json"
    headline_pa = pressure.get("headline_delta_p_pa")
    has_delta_p = isinstance(headline_pa, (int, float)) and float(headline_pa) > 0.0
    thermal_cite = _thermal_screen_cite(thermal_case, twin_dir=twin_dir)
    module_temp = (
        thermal_cite.get("maximum_module_temperature_c")
        if isinstance(thermal_cite, Mapping)
        else None
    )
    body = _open_check(
        "inverter_cold_plate",
        extra={
            "status": "PARTIAL",
            "pressure_drop_kpa": (
                round(float(headline_pa) / 1000.0, 4) if has_delta_p else None
            ),
            "maximum_module_temperature_c": module_temp,
            "module_temperature_spread_c": None,
            "works_in_kit_context": has_delta_p,
            "model_revision": str(
                case.get("schema") or "forgeos.motor_stack.openfoam_fia_cold_plate_case/v1"
            ),
            "geometry_revision": (
                f"{channel.get('channel_width_m')}m × {channel.get('channel_depth_m')}m "
                f"× {channel.get('pass_count')} passes"
                if channel
                else None
            ),
            "input_hash": case.get("input_quantities_sha256"),
            "result_ref": rel_ref,
            "fia_question": (
                f"Cold-plate channels at {duty['coolant_flow_l_min']} L/min / "
                f"{duty['coolant_inlet_c']} °C — module temp spread OPEN"
            ),
            "twin_bound_case": {
                "status": case.get("status"),
                "ship_ok": False,
                "works_in_kit_context": has_delta_p,
                "path": rel_ref,
                "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
                "headline_delta_p_pa": headline_pa,
                "inlet_velocity_m_s": channel.get("inlet_velocity_m_s"),
                "reynolds_number": channel.get("reynolds_number"),
                "coolant_flow_l_min": inputs.get("coolant_flow_l_min"),
                "coolant_inlet_c": inputs.get("coolant_inlet_c"),
                "cad_family": case.get("cad_family") or "cold_plate_serpentine",
                "module_temperatures": "OPEN",
                "conjugate_heat_transfer": "OPEN",
                "thermal_screen": thermal_cite,
                "note": (
                    "Twin-bound OpenFOAM rectangular-duct screen on family channel "
                    "section at kit coolant point. works_in_kit_context = finite Δp. "
                    "A lumped module temperature may be cited from the separate "
                    "PARTIAL thermal screen, but full serpentine STEP CHT and "
                    "hardware correlation remain OPEN. "
                    "See also inverterPackaging for MCU land / ESL screen."
                ),
            },
        },
    )
    body["status"] = "PARTIAL"
    return body


def _water_jacket_check_from_fia_case(
    duty: Mapping[str, Any],
    case: Mapping[str, Any],
    *,
    twin_dir: Path,
    thermal_case: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    """Promote water_jacket to PARTIAL when a twin-bound OF duct exists.

    INTENT: Make the 12 L/min / 60 °C jacket duct screen visible without
    claiming winding temperatures or full helical conjugate heat transfer.
    """
    pressure = (
        case.get("pressure_drop") if isinstance(case.get("pressure_drop"), dict) else {}
    )
    channel = (
        case.get("channel_geometry")
        if isinstance(case.get("channel_geometry"), dict)
        else {}
    )
    inputs = (
        case.get("input_quantities")
        if isinstance(case.get("input_quantities"), dict)
        else {}
    )
    rel_ref = "_motor_stack/openfoam_fia_water_jacket_case.json"
    headline_pa = pressure.get("headline_delta_p_pa")
    has_delta_p = isinstance(headline_pa, (int, float)) and float(headline_pa) > 0.0
    thermal_cite = _thermal_screen_cite(thermal_case, twin_dir=twin_dir)
    winding_temp = (
        thermal_cite.get("maximum_winding_temperature_c")
        if isinstance(thermal_cite, Mapping)
        else None
    )
    body = _open_check(
        "water_jacket",
        extra={
            "status": "PARTIAL",
            "pressure_drop_kpa": (
                round(float(headline_pa) / 1000.0, 4) if has_delta_p else None
            ),
            "maximum_winding_temperature_c": winding_temp,
            "works_in_kit_context": has_delta_p,
            "model_revision": str(
                case.get("schema")
                or "forgeos.motor_stack.openfoam_fia_water_jacket_case/v1"
            ),
            "geometry_revision": (
                f"{channel.get('channel_width_m')}m × {channel.get('channel_depth_m')}m "
                f"× {channel.get('helix_turns')} helix turns"
                if channel
                else None
            ),
            "input_hash": case.get("input_quantities_sha256"),
            "result_ref": rel_ref,
            "fia_question": (
                f"Does the jacket reject losses at {duty['coolant_flow_l_min']} L/min / "
                f"{duty['coolant_inlet_c']} °C inlet without boiling or choking?"
            ),
            "twin_bound_case": {
                "status": case.get("status"),
                "ship_ok": False,
                "works_in_kit_context": has_delta_p,
                "path": rel_ref,
                "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
                "headline_delta_p_pa": headline_pa,
                "inlet_velocity_m_s": channel.get("inlet_velocity_m_s"),
                "reynolds_number": channel.get("reynolds_number"),
                "coolant_flow_l_min": inputs.get("coolant_flow_l_min"),
                "coolant_inlet_c": inputs.get("coolant_inlet_c"),
                "cad_family": case.get("cad_family") or "motor_water_jacket_helical",
                "winding_temperatures": "OPEN",
                "conjugate_heat_transfer": "OPEN",
                "thermal_screen": thermal_cite,
                "note": (
                    "Twin-bound OpenFOAM rectangular-duct screen on helical family "
                    "channel section at kit coolant point. A lumped winding temperature "
                    "may be cited from the separate PARTIAL thermal screen, but full "
                    "jacket STEP CHT and hardware correlation remain OPEN."
                ),
            },
        },
    )
    body["status"] = "PARTIAL"
    return body


def _gear_oil_check_from_fia_case(
    duty: Mapping[str, Any],
    case: Mapping[str, Any],
    *,
    twin_dir: Path,
) -> dict[str, Any]:
    """Promote gear_oil to PARTIAL when a twin-bound analytical oil screen exists.

    INTENT: Make jet-flow / churning / pickup screening visible without claiming
    free-surface CFD or clear-case bench correlation.
    """
    screening = (
        case.get("screening_results")
        if isinstance(case.get("screening_results"), dict)
        else {}
    )
    works = (
        case.get("works_in_kit_context")
        if isinstance(case.get("works_in_kit_context"), dict)
        else {}
    )
    inputs = case.get("input_quantities") if isinstance(case.get("input_quantities"), dict) else {}
    rel_ref = "_motor_stack/gear_oil_fia_front_kit_case.json"
    oil_ok = bool(works.get("oil_delivery_screen_ok"))
    body = _open_check(
        "gear_oil",
        extra={
            "status": "PARTIAL",
            "minimum_jet_flow_l_min": screening.get("minimum_jet_flow_l_min"),
            "churning_loss_w": screening.get("churning_loss_w"),
            "works_in_kit_context": oil_ok,
            "model_revision": str(
                case.get("schema") or "forgeos.motor_stack.gear_oil_fia_front_kit_case/v1"
            ),
            "geometry_revision": (
                f"ratio={inputs.get('gear_ratio')} planets={inputs.get('planet_count')} "
                f"planet_od={inputs.get('planet_od_mm')}mm"
                if inputs
                else None
            ),
            "input_hash": case.get("input_quantities_sha256"),
            "result_ref": rel_ref,
            "fia_question": (
                "Oil jet / pickup / churning under race accel/brake/corner — "
                "analytical screen; free-surface CFD OPEN"
            ),
            "twin_bound_case": {
                "status": case.get("status"),
                "ship_ok": False,
                "works_in_kit_context": oil_ok,
                "path": rel_ref,
                "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
                "minimum_jet_flow_l_min": screening.get("minimum_jet_flow_l_min"),
                "churning_loss_w": screening.get("churning_loss_w"),
                "pickup_charge_adequate": screening.get("pickup_charge_adequate"),
                "gear_ratio": inputs.get("gear_ratio"),
                "planet_count": inputs.get("planet_count"),
                "required_shaft_torque_nm": inputs.get("required_shaft_torque_nm"),
                "free_surface_cfd": "OPEN",
                "bench_correlation": "OPEN",
                "note": (
                    "Twin-bound analytical jet/churning/pickup screen on planetary "
                    "seeds. Not free-surface CFD; OpenFOAM cavity remains smoke-only."
                ),
            },
        },
    )
    body["status"] = "PARTIAL"
    # duty unused but keeps signature aligned with other FIA builders.
    _ = duty
    return body


def _bevel_differential_cite_from_case(
    bevel_case: Optional[Mapping[str, Any]],
    *,
    twin_dir: Path,
) -> Any:
    """Build optional bevel-differential SCREEN cite for gear_strength twin_bound.

    GOTCHA: Absence stays the string ``OPEN`` so proveCatch on planetary-only
    fixtures is unchanged. When present, cite is PARTIAL with ship_ok false.
    """

    if not isinstance(bevel_case, Mapping):
        return "OPEN"
    strength = (
        bevel_case.get("strength_screen")
        if isinstance(bevel_case.get("strength_screen"), dict)
        else {}
    )
    margins = (
        bevel_case.get("margins") if isinstance(bevel_case.get("margins"), dict) else {}
    )
    works = (
        bevel_case.get("works_in_kit_context")
        if isinstance(bevel_case.get("works_in_kit_context"), dict)
        else {}
    )
    duty_torques = (
        bevel_case.get("duty_torques")
        if isinstance(bevel_case.get("duty_torques"), dict)
        else {}
    )
    geometry = (
        bevel_case.get("bevel_geometry")
        if isinstance(bevel_case.get("bevel_geometry"), dict)
        else {}
    )
    rel_ref = "_motor_stack/iso_bevel_fia_front_kit_case.json"
    duty_ok = bool(works.get("duty_strength_screen_ok"))
    min_fos = margins.get("minimum_strength_factor")
    if min_fos is None:
        min_fos = strength.get("minimum_strength_factor")
    recommended = (
        bevel_case.get("recommended_geometry")
        if isinstance(bevel_case.get("recommended_geometry"), dict)
        else {}
    )
    architecture_hold = (
        bevel_case.get("architecture_hold")
        or recommended.get("architecture_hold")
        or None
    )
    residual_blocker = (
        bevel_case.get("residual_blocker")
        if isinstance(bevel_case.get("residual_blocker"), Mapping)
        else None
    )
    architecture_decision = (
        bevel_case.get("architecture_decision")
        if isinstance(bevel_case.get("architecture_decision"), Mapping)
        else None
    )
    return {
        "status": bevel_case.get("status") or "PARTIAL",
        "ship_ok": False,
        "path": rel_ref,
        "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
        "works_in_kit_context": duty_ok,
        "duty_strength_screen_ok": duty_ok,
        "minimum_strength_factor": min_fos,
        "minimum_bending_fos": margins.get("minimum_bending_fos")
        or strength.get("minimum_bending_fos"),
        "minimum_contact_fos": margins.get("minimum_contact_fos")
        or strength.get("minimum_contact_fos"),
        "carrier_input_torque_nm": duty_torques.get("carrier_input_torque_nm"),
        "diff_od_mm": geometry.get("diff_od_mm"),
        "spider_pinion_teeth": geometry.get("spider_pinion_teeth"),
        "side_gear_teeth": geometry.get("side_gear_teeth"),
        "tooth_count_basis": geometry.get("tooth_count_basis"),
        "architecture_hold": architecture_hold,
        "architecture_decision": architecture_decision,
        "residual_blocker": residual_blocker,
        "iso23509_independent_check": "OPEN",
        "kisssoft_independent_check": "OPEN",
        "note": (
            "Twin-bound straight-bevel handbook SCREEN on "
            "compact_bevel_differential packaging nest — NOT full ISO 23509 / "
            "KISSsoft / contact pattern; ship_ok false."
            + (
                f" Architecture hold: {architecture_hold}."
                if architecture_hold
                else ""
            )
            + (
                f" Residual blocker: {residual_blocker.get('blocker_id')}."
                if residual_blocker
                else ""
            )
        ),
    }


def collect_architecture_blockers(
    motor: Mapping[str, Any],
) -> list[dict[str, Any]]:
    """Harvest OPEN architecture / packaging blockers from twin-bound cites.

    INTENT: A blocker that only lives in chat or a plan paragraph regresses.
    Every hold that prevents honest PASS must appear here with permanent
    unblock options (geometry writeback, architecture decision, or freeze).

    @description Reads gear_strength bevel cite (extend as new holds land).
    @param motor motorMultiphysics object
    @returns List of blocker dicts (may be empty)
    """
    blockers: list[dict[str, Any]] = []
    checks = motor.get("required_checks") if isinstance(motor, Mapping) else None
    if not isinstance(checks, Mapping):
        return blockers
    gear = checks.get("gear_strength")
    if not isinstance(gear, Mapping):
        return blockers
    twin_case = gear.get("twin_bound_case")
    if not isinstance(twin_case, Mapping):
        return blockers
    bevel = twin_case.get("bevel_differential_screen")
    if not isinstance(bevel, Mapping):
        return blockers
    hold = str(bevel.get("architecture_hold") or "")
    if BLOCKER_ID_DIFF_NEST in hold or (
        bevel.get("works_in_kit_context") is False
        and bevel.get("minimum_strength_factor") is not None
        and float(bevel.get("minimum_strength_factor") or 0.0) < 1.2
        and "DIFF_NEST" in hold
    ):
        blockers.append(
            {
                "blocker_id": BLOCKER_ID_DIFF_NEST,
                "domain": "gear_strength.differential",
                "status": "OPEN",
                "severity": "architecture_hold",
                "ship_ok": False,
                "cannot_greenwash": True,
                "evidence_path": bevel.get("path")
                or "_motor_stack/iso_bevel_fia_front_kit_case.json",
                "minimum_strength_factor": bevel.get("minimum_strength_factor"),
                "summary": hold
                or (
                    "Straight-bevel nest inside kit envelope cannot clear "
                    "carrier-torque FoS ≥ 1.2 — architecture hold."
                ),
                "permanent_unblock_options": list(_DIFF_NEST_PERMANENT_UNBLOCK),
                "human_decision_required": True,
            }
        )
    residual = (
        bevel.get("residual_blocker")
        if isinstance(bevel.get("residual_blocker"), Mapping)
        else None
    )
    if (
        residual
        and residual.get("blocker_id") == BLOCKER_ID_POST_DIFF_FINAL_DRIVE
        and residual.get("status") == "OPEN"
    ):
        blockers.append(
            {
                "blocker_id": BLOCKER_ID_POST_DIFF_FINAL_DRIVE,
                "domain": "gear_strength.final_drive_packaging",
                "status": "OPEN",
                "severity": "architecture_hold",
                "ship_ok": False,
                "cannot_greenwash": True,
                "evidence_path": bevel.get("path")
                or "_motor_stack/iso_bevel_fia_front_kit_case.json",
                "minimum_strength_factor": bevel.get("minimum_strength_factor"),
                "ratio_after_diff": residual.get("ratio_after_diff"),
                "summary": residual.get("summary")
                or (
                    "Differential torque budget clears the bevel nest, but the "
                    "remaining post-differential final-drive stage is not packaged."
                ),
                "permanent_unblock_options": list(
                    _POST_DIFF_FINAL_DRIVE_PERMANENT_UNBLOCK
                ),
                "human_decision_required": True,
            }
        )
    return blockers


def _gear_strength_check_from_fia_case(
    duty: Mapping[str, Any],
    case: Mapping[str, Any],
    *,
    twin_dir: Path,
    bevel_case: Optional[Mapping[str, Any]] = None,
) -> dict[str, Any]:
    """Promote gear_strength to PARTIAL when a twin-bound ISO 6336 screen exists.

    INTENT: Make the FIA front-kit planetary tooth screen visible without claiming
    KISSsoft closure, race load-spectrum fatigue, or CalculiX tooth contact.
    Optional bevel differential SCREEN is cited under twin_bound_case when present.
    """
    strength = (
        case.get("strength_screen")
        if isinstance(case.get("strength_screen"), dict)
        else {}
    )
    margins = case.get("margins") if isinstance(case.get("margins"), dict) else {}
    works = (
        case.get("works_in_kit_context")
        if isinstance(case.get("works_in_kit_context"), dict)
        else {}
    )
    geometry = (
        case.get("gear_geometry") if isinstance(case.get("gear_geometry"), dict) else {}
    )
    inputs = (
        case.get("input_quantities")
        if isinstance(case.get("input_quantities"), dict)
        else {}
    )
    duty_torques = (
        case.get("duty_torques") if isinstance(case.get("duty_torques"), dict) else {}
    )
    rel_ref = "_motor_stack/iso6336_fia_front_kit_case.json"
    duty_ok = bool(works.get("duty_strength_screen_ok"))
    min_fos = margins.get("minimum_strength_factor")
    if min_fos is None:
        min_fos = strength.get("minimum_strength_factor")
    bevel_cite = _bevel_differential_cite_from_case(bevel_case, twin_dir=twin_dir)
    body = _open_check(
        "gear_strength",
        extra={
            "status": "PARTIAL",
            "ratio_revision": (
                f"i={geometry.get('ratio_from_teeth')} "
                f"S/P/R={geometry.get('sun_teeth')}/"
                f"{geometry.get('planet_teeth')}/{geometry.get('ring_teeth')} "
                f"m={geometry.get('module_mm')}mm"
                if geometry
                else None
            ),
            "minimum_strength_factor": min_fos,
            "load_spectrum_ref": None,
            "works_in_kit_context": duty_ok,
            "duty_strength_screen_ok": duty_ok,
            "model_revision": str(
                case.get("schema")
                or "forgeos.motor_stack.iso6336_fia_front_kit_case/v1"
            ),
            "geometry_revision": (
                f"face={geometry.get('face_width_mm')}mm "
                f"planets={geometry.get('planet_count')}"
                if geometry
                else None
            ),
            "input_hash": case.get("input_quantities_sha256"),
            "result_ref": rel_ref,
            "fia_question": (
                f"Does reduction + differential transmit reconciled torque for "
                f"{duty['continuous_design_duty_kw']} kW duty without tooth failure?"
            ),
            "twin_bound_case": {
                "status": case.get("status"),
                "ship_ok": False,
                "works_in_kit_context": duty_ok,
                "duty_strength_screen_ok": duty_ok,
                "controlling_geometry_source": case.get(
                    "controlling_geometry_source", "packaging_seed"
                ),
                "path": rel_ref,
                "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
                "minimum_bending_fos": margins.get("minimum_bending_fos")
                or strength.get("minimum_bending_fos"),
                "minimum_contact_fos": margins.get("minimum_contact_fos")
                or strength.get("minimum_contact_fos"),
                "minimum_strength_factor": min_fos,
                "motor_shaft_torque_nm": duty_torques.get("motor_shaft_torque_nm"),
                "carrier_output_torque_nm": duty_torques.get(
                    "carrier_output_torque_nm"
                ),
                "gear_ratio": inputs.get("gear_ratio"),
                "packaging_seed_minimum_strength_factor": (
                    (case.get("packaging_seed_screen") or {}).get(
                        "minimum_strength_factor"
                    )
                    if isinstance(case.get("packaging_seed_screen"), dict)
                    else None
                ),
                "recommended_geometry": case.get("recommended_geometry"),
                "bevel_differential_screen": bevel_cite,
                "kisssoft_independent_check": "OPEN",
                "load_spectrum_fatigue": "OPEN",
                "calculix_tooth_contact": "OPEN",
                "note": (
                    "Twin-bound ISO 6336-style analytical screen. Controlling "
                    "geometry may be a strength-driven resize when the packaging "
                    "seed fails FoS (seed retained under packaging_seed_screen). "
                    "Optional bevel_differential_screen cites the straight-bevel "
                    "handbook SCREEN when present (else OPEN). "
                    "works_in_kit_context / duty_strength_screen_ok = "
                    "min(bending, contact) FoS ≥ 1.2 vs assumed case-hardened "
                    "allowables — NOT KISSsoft, NOT spectrum, NOT ship_ok."
                ),
            },
        },
    )
    body["status"] = "PARTIAL"
    return body


def build_inverter_packaging(
    *,
    twin_dir: Optional[Path] = None,
    stamped_at: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Build optional inverterPackaging section from twin-bound packaging artefact.

    @description Not a solver required_check row — packaging evidence alongside
    motorMultiphysics / cadAuthority. Returns None when artefact is absent.
    @param twin_dir Twin directory for `_motor_stack/` artefacts
    @param stamped_at ISO timestamp override
    @returns inverterPackaging object or None
    """
    case = _load_fia_inverter_packaging_case(twin_dir)
    if case is None or twin_dir is None:
        return None
    screening = (
        case.get("screening_results")
        if isinstance(case.get("screening_results"), dict)
        else {}
    )
    works = (
        case.get("works_in_kit_context")
        if isinstance(case.get("works_in_kit_context"), dict)
        else {}
    )
    inputs = case.get("input_quantities") if isinstance(case.get("input_quantities"), dict) else {}
    rel_ref = "_motor_stack/inverter_packaging_fia_front_kit_case.json"
    stamped = stamped_at or _iso_now()
    return {
        "schema_version": "inverter-packaging/v1",
        "stamped_at": stamped,
        "status": "PARTIAL",
        "ship_ok": False,
        "works_in_kit_context": bool(works.get("packaging_screen_ok")),
        "result_ref": rel_ref,
        "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
        "input_hash": case.get("input_quantities_sha256"),
        "dc_bus_voltage_v": inputs.get("dc_bus_voltage_v"),
        "continuous_electrical_power_kw": inputs.get("continuous_electrical_power_kw"),
        "dc_current_a": screening.get("dc_current_a"),
        "power_density_kw_l": screening.get("power_density_kw_l"),
        "bus_esl_nominal_nh": screening.get("bus_esl_nominal_nh"),
        "esl_nominal_in_target_band": screening.get("esl_nominal_in_target_band"),
        "sic_module_count": screening.get("sic_module_count"),
        "cold_plate_covers_mcu_footprint": screening.get(
            "cold_plate_covers_mcu_footprint"
        ),
        "mcu_box_mm": {
            "w": inputs.get("mcu_w_mm"),
            "d": inputs.get("mcu_d_mm"),
            "h": inputs.get("mcu_h_mm"),
        },
        "module_mpn_and_step": "OPEN",
        "double_pulse_and_measured_esl": "OPEN",
        "notes": (
            "Analytical MCU packaging screen. Cold-plate hydraulic Δp lives under "
            "required_checks.inverter_cold_plate when present. ship_ok false."
        ),
        "twin_bound_case": case.get("works_in_kit_context"),
    }


def build_motor_multiphysics(
    *,
    state: Optional[Mapping[str, Any]] = None,
    assembly_revision: str = ASSEMBLY_REVISION,
    stamped_at: Optional[str] = None,
    twin_dir: Optional[Path] = None,
) -> dict[str, Any]:
    """Build motorMultiphysics dict per plan schema.

    @description Records FIA duty + toolchain smoke pointers. Magnetic,
    rotor_dynamics, structural, inverter_cold_plate, gear_oil, and gear_strength
    may be PARTIAL when twin-bound FIA case artefacts exist; all_required still false.
    @param state Optional twin state for quantity readback
    @param assembly_revision Shared CAD/solver/Blender revision label
    @param stamped_at ISO timestamp override
    @param twin_dir Twin directory for `_motor_stack/` artefacts
    @returns motorMultiphysics object
    """
    duty = extract_fia_duty(state)
    stamped = stamped_at or _iso_now()
    notes = (
        f"FIA front kit duties: ≤{duty['front_regen_electrical_cap_kw']} kW front regen "
        f"(continuous design {duty['continuous_design_duty_kw']} kW); bay "
        f"{duty['bay_w_mm']}×{duty['bay_d_mm']}×{duty['bay_h_mm']} mm; "
        f"mass cap ~{duty['mass_cap_kg']} kg; rotor ~{duty['max_rotor_speed_rpm']} rpm; "
        f"bus ~{duty['dc_bus_voltage_v']} V; coolant {duty['coolant_inlet_c']} °C / "
        f"{duty['coolant_flow_l_min']} L/min. "
        "Toolchain smokes prove solver executables — they do not close FIA evidence."
    )

    fia_mag = _load_fia_magnetic_case(twin_dir)
    fia_demag = _load_fia_demag_case(twin_dir)
    fia_mtpa = _load_fia_mtpa_case(twin_dir)
    if fia_mag is not None and twin_dir is not None:
        magnetic = _magnetic_check_from_fia_case(
            duty,
            fia_mag,
            twin_dir=Path(twin_dir),
            demag_case=fia_demag,
            mtpa_case=fia_mtpa,
        )
        notes += (
            " Magnetic check PARTIAL: twin-bound open-circuit / loaded point in "
            "_motor_stack/em_fia_front_kit_case.json"
        )
        if fia_demag is not None:
            notes += (
                " + hot demag SCREEN in _motor_stack/em_fia_demag_screen.json"
            )
        if fia_mtpa is not None:
            notes += (
                " + denser MTPA SCREEN in _motor_stack/em_fia_mtpa_screen.json"
            )
        notes += " (torque map / full demag map / dyno still OPEN)."
    else:
        magnetic = _open_check(
            "magnetic",
            extra={
                "torque_map_ref": None,
                "loss_map_ref": None,
                "demagnetisation_margin": None,
                "fia_question": (
                    f"Can the machine deliver {duty['continuous_design_duty_kw']} kW "
                    "front regen inside voltage/current/temp/demag limits?"
                ),
            },
        )

    fia_ross = _load_fia_ross_case(twin_dir)
    if fia_ross is not None and twin_dir is not None:
        rotor_dynamics = _rotor_dynamics_check_from_fia_case(
            duty, fia_ross, twin_dir=Path(twin_dir)
        )
        notes += (
            " Rotor-dynamics check PARTIAL: twin-bound ROSS screen in "
            "_motor_stack/ross_fia_front_kit_case.json "
            "(bearing identity / modal-dyno still OPEN)."
        )
    else:
        rotor_dynamics = _open_check(
            "rotor_dynamics",
            extra={
                "critical_speed_margin": None,
                "bearing_reaction_ref": None,
                "fia_question": (
                    f"Are critical speeds clear of the {duty['max_rotor_speed_rpm']} rpm "
                    "operating band with margin?"
                ),
            },
        )

    fia_calculix = _load_fia_calculix_case(twin_dir)
    fia_magnet_pocket = _load_fia_magnet_pocket_case(twin_dir)
    fia_case_mount = _load_fia_case_mount_case(twin_dir)
    if fia_calculix is not None and twin_dir is not None:
        structural = _structural_check_from_fia_case(
            duty,
            fia_calculix,
            twin_dir=Path(twin_dir),
            magnet_pocket_case=fia_magnet_pocket,
            case_mount_case=fia_case_mount,
        )
        notes += (
            " Structural check PARTIAL: twin-bound CalculiX rotor centrifugal "
            "screen in _motor_stack/calculix_fia_rotor_screen.json"
        )
        if fia_magnet_pocket is not None:
            notes += (
                " + magnet-pocket / iron-bridge screen in "
                "_motor_stack/calculix_fia_magnet_pocket_screen.json"
            )
        if fia_case_mount is not None:
            notes += (
                " + cast-case / bay-mount analytical screen in "
                "_motor_stack/analytical_fia_case_mount_screen.json"
            )
        notes += " (release FoS still OPEN)."
    else:
        structural = _open_check(
            "structural",
            extra={
                "load_case_set": None,
                "minimum_factor_of_safety": None,
                "fia_question": (
                    f"Do rotor retention, case, mounts and joints survive "
                    f"{duty['max_rotor_speed_rpm']} rpm and torque reaction inside the "
                    f"{duty['mass_cap_kg']} kg / bay box?"
                ),
            },
        )

    fia_thermal = _load_fia_cooling_thermal_screen(twin_dir)
    fia_cold = _load_fia_cold_plate_case(twin_dir)
    if fia_cold is not None and twin_dir is not None:
        inverter_cold_plate = _cold_plate_check_from_fia_case(
            duty,
            fia_cold,
            twin_dir=Path(twin_dir),
            thermal_case=fia_thermal,
        )
        notes += (
            " Inverter cold-plate check PARTIAL: twin-bound OpenFOAM duct screen in "
            "_motor_stack/openfoam_fia_cold_plate_case.json "
            "(full serpentine CHT still OPEN)."
        )
        if fia_thermal is not None:
            notes += (
                " Lumped motor/inverter thermal SCREEN cited from "
                "_motor_stack/analytical_fia_cooling_thermal_screen.json; "
                "heater-plate and flow-bench correlation remain OPEN."
            )
    else:
        inverter_cold_plate = _open_check(
            "inverter_cold_plate",
            extra={
                "pressure_drop_kpa": None,
                "maximum_module_temperature_c": None,
                "module_temperature_spread_c": None,
                "fia_question": (
                    f"Cold-plate channels at {duty['coolant_flow_l_min']} L/min / "
                    f"{duty['coolant_inlet_c']} °C — module temp spread OPEN"
                ),
            },
        )

    fia_jacket = _load_fia_water_jacket_case(twin_dir)
    if fia_jacket is not None and twin_dir is not None:
        water_jacket = _water_jacket_check_from_fia_case(
            duty,
            fia_jacket,
            twin_dir=Path(twin_dir),
            thermal_case=fia_thermal,
        )
        notes += (
            " Water-jacket check PARTIAL: twin-bound OpenFOAM duct screen in "
            "_motor_stack/openfoam_fia_water_jacket_case.json "
            "(full helical CHT still OPEN)."
        )
    else:
        water_jacket = _open_check(
            "water_jacket",
            extra={
                "pressure_drop_kpa": None,
                "maximum_winding_temperature_c": None,
                "fia_question": (
                    f"Does the jacket reject losses at {duty['coolant_flow_l_min']} L/min / "
                    f"{duty['coolant_inlet_c']} °C inlet without boiling or choking?"
                ),
            },
        )

    fia_gear_oil = _load_fia_gear_oil_case(twin_dir)
    if fia_gear_oil is not None and twin_dir is not None:
        notes += (
            " Gear-oil check PARTIAL: twin-bound analytical jet/churning/pickup "
            "screen in _motor_stack/gear_oil_fia_front_kit_case.json "
            "(free-surface CFD / bench still OPEN)."
        )

    fia_iso6336 = _load_fia_iso6336_case(twin_dir)
    fia_iso_bevel = _load_fia_iso_bevel_case(twin_dir)
    if fia_iso6336 is not None and twin_dir is not None:
        gear_strength = _gear_strength_check_from_fia_case(
            duty,
            fia_iso6336,
            twin_dir=Path(twin_dir),
            bevel_case=fia_iso_bevel,
        )
        notes += (
            " Gear-strength check PARTIAL: twin-bound ISO 6336-style screen in "
            "_motor_stack/iso6336_fia_front_kit_case.json "
            "(KISSsoft / load spectrum / tooth-contact FEA still OPEN)."
        )
        if fia_iso_bevel is not None:
            notes += (
                " Bevel differential handbook SCREEN cited under "
                "gear_strength.twin_bound_case.bevel_differential_screen "
                "(_motor_stack/iso_bevel_fia_front_kit_case.json; "
                "ISO 23509 still OPEN)."
            )
            hold = None
            twin_case = gear_strength.get("twin_bound_case")
            if isinstance(twin_case, Mapping):
                bevel_cite = twin_case.get("bevel_differential_screen")
                if isinstance(bevel_cite, Mapping):
                    hold = bevel_cite.get("architecture_hold")
            if hold:
                notes += f" Architecture blocker OPEN: {hold}"
    else:
        gear_strength = _open_check(
            "gear_strength",
            extra={
                "ratio_revision": None,
                "minimum_strength_factor": None,
                "load_spectrum_ref": None,
                "fia_question": (
                    f"Does reduction + differential transmit reconciled torque for "
                    f"{duty['continuous_design_duty_kw']} kW duty without tooth failure?"
                ),
            },
        )

    required_checks = {
        "magnetic": magnetic,
        "rotor_dynamics": rotor_dynamics,
        "structural": structural,
        "water_jacket": water_jacket,
        "inverter_cold_plate": inverter_cold_plate,
        "gear_oil": (
            _gear_oil_check_from_fia_case(duty, fia_gear_oil, twin_dir=Path(twin_dir))
            if fia_gear_oil is not None and twin_dir is not None
            else _open_check(
                "gear_oil",
                extra={
                    "minimum_jet_flow_l_min": None,
                    "churning_loss_w": None,
                    "fia_question": (
                        "Oil jet / pickup / churning under race accel/brake/corner — OPEN"
                    ),
                },
            )
        ),
        "gear_strength": gear_strength,
    }

    motor_body: dict[str, Any] = {
        "schema_version": SCHEMA_MOTOR,
        "stamped_at": stamped,
        "source": "scripts/lib/motor_multiphysics_stamp.py",
        "plan": "docs/plans/MOTOR-MULTIPHYSICS-AND-CAD-PLAIN-LANGUAGE-2026-07-30.md",
        "assembly_revision": assembly_revision,
        "fia_duty": duty,
        "notes": notes,
        "required_checks": required_checks,
        "all_required_solver_checks_pass": False,
        "ship_ok": False,
        "honesty": (
            "Blender explains packaging. Analytical tools screen. "
            "PASS needs twin-bound result_ref + geometry_revision + input_hash. "
            "Toolchain smoke ≠ PASS. ship_ok stays false. "
            "OPEN architectureBlockers block release until permanently unblocked."
        ),
    }
    blockers = collect_architecture_blockers(motor_body)
    motor_body["architectureBlockers"] = blockers
    motor_body["architecture_blockers_open_count"] = sum(
        1 for b in blockers if b.get("status") == "OPEN"
    )
    return motor_body


def build_cad_authority(
    *,
    assembly_revision: str = ASSEMBLY_REVISION,
    stamped_at: Optional[str] = None,
) -> dict[str, Any]:
    """Build cadAuthority register — communication_only except seeded stator family.

    @description Lists principal components with authority levels from the plan.
    @param assembly_revision Shared revision label
    @param stamped_at ISO timestamp override
    @returns cadAuthority object
    """
    stamped = stamped_at or _iso_now()
    components: list[dict[str, Any]] = []
    release_count = 0
    for row in _PRINCIPAL_COMPONENTS:
        level = row["authority_level"]
        if level in ("supplier_authoritative", "team_release_cad"):
            release_count += 1
        components.append(
            {
                "component_id": row["component_id"],
                "authority_level": level,
                "source_type": row["source_type"],
                "cad_family": row.get("cad_family"),
                "source_revision": None,
                "source_hash": None,
                "interface_revision": None,
                "interference_check": "OPEN",
                "mass_properties_check": "OPEN",
                "notes": row.get("notes"),
            }
        )

    total = len(components)
    coverage = (release_count / total) if total else 0.0
    return {
        "schema_version": SCHEMA_CAD,
        "stamped_at": stamped,
        "source": "scripts/lib/motor_multiphysics_stamp.py",
        "assembly_revision": assembly_revision,
        "components": components,
        "principal_components_total": total,
        "release_authority_count": release_count,
        "release_authority_coverage": coverage,
        "parametric_family_count": sum(
            1 for c in components if c["authority_level"] == "parametric_family"
        ),
        "communication_only_count": sum(
            1 for c in components if c["authority_level"] == "communication_only"
        ),
        "ship_ok": False,
        "honesty": (
            "Release coverage counts supplier_authoritative + team_release_cad only. "
            "Parametric family is concept geometry — not release authority."
        ),
    }


def build_hardware_correlation(
    *,
    assembly_revision: str = ASSEMBLY_REVISION,
    stamped_at: Optional[str] = None,
) -> dict[str, Any]:
    """Build the physical hardware-correlation release-hold register.

    @description Registers the six mandatory physical evidence campaigns and
    links existing Decision Register authority. Every initial hold is OPEN, so
    the register and parent stamp remain unshippable.
    @param assembly_revision Shared CAD/solver/hardware revision label
    @param stamped_at ISO timestamp override
    @returns Fail-closed hardwareCorrelation object
    """

    stamped = stamped_at or _iso_now()
    holds = [
        {
            **row,
            "status": "OPEN",
            "ship_ok": False,
            "blocks_ship": True,
            "evidence_ref": None,
            "correlated_revision": None,
        }
        for row in _HARDWARE_CORRELATION_HOLDS
    ]
    open_count = sum(1 for row in holds if row["status"] == "OPEN")
    return {
        "schema_version": SCHEMA_HARDWARE_CORRELATION,
        "stamped_at": stamped,
        "assembly_revision": assembly_revision,
        "status": "OPEN" if open_count else "CLOSED",
        "holds": holds,
        "hold_count": len(holds),
        "open_count": open_count,
        "all_holds_closed": open_count == 0,
        "ship_ok": open_count == 0,
        "honesty": (
            "Analytical and numerical screens do not replace physical correlation. "
            "Any OPEN hold forces ship_ok false."
        ),
    }


def build_stamp_payload(
    *,
    state: Optional[Mapping[str, Any]] = None,
    assembly_revision: str = ASSEMBLY_REVISION,
    twin_dir: Optional[Path] = None,
) -> dict[str, Any]:
    """Combine motorMultiphysics + cadAuthority into one sidecar payload.

    @description Single artefact Excel / overview can read without the huge state.
    @param state Optional twin state
    @param assembly_revision Shared revision
    @param twin_dir Twin directory for `_motor_stack/` artefacts
    @returns Combined payload
    """
    stamped = _iso_now()
    motor = build_motor_multiphysics(
        state=state,
        assembly_revision=assembly_revision,
        stamped_at=stamped,
        twin_dir=twin_dir,
    )
    cad = build_cad_authority(assembly_revision=assembly_revision, stamped_at=stamped)
    hardware = build_hardware_correlation(
        assembly_revision=assembly_revision,
        stamped_at=stamped,
    )
    packaging = build_inverter_packaging(twin_dir=twin_dir, stamped_at=stamped)
    payload: dict[str, Any] = {
        "schema_version": "motor-multiphysics-sidecar/v1",
        "stamped_at": stamped,
        "assembly_revision": assembly_revision,
        "motorMultiphysics": motor,
        "cadAuthority": cad,
        "hardwareCorrelation": hardware,
        "ship_ok": False,
        "all_required_solver_checks_pass": False,
    }
    if packaging is not None:
        payload["inverterPackaging"] = packaging
    blockers = motor.get("architectureBlockers")
    if isinstance(blockers, list):
        payload["architectureBlockers"] = blockers
    return payload


def render_markdown(payload: Mapping[str, Any]) -> str:
    """Plain-language markdown for the twin (Excel/overview link target).

    @description Human-readable OPEN status table — never claims solvers closed FIA.
    @param payload Combined stamp payload
    @returns Markdown string
    """
    motor = payload.get("motorMultiphysics") or {}
    cad = payload.get("cadAuthority") or {}
    duty = motor.get("fia_duty") or {}
    lines = [
        "# JLR FE Front FPK — Motor multiphysics & CAD authority",
        "",
        f"**Stamped:** {payload.get('stamped_at')}  ",
        f"**Assembly revision:** `{payload.get('assembly_revision')}`  ",
        f"**Schema:** `{motor.get('schema_version')}` / `{cad.get('schema_version')}`  ",
        "**ship_ok:** **false**  ",
        "**all_required_solver_checks_pass:** **false**",
        "",
        "## Plain English",
        "",
        "Solver *toolchains* have been smoke-tested (Pyleecan+xfemm, ROSS, CalculiX,",
        "OpenFOAM). Generic smokes alone are **not** enough. A check may be **PARTIAL**",
        "when a twin-bound artefact exists (magnetic point, denser MTPA screen,",
        "analytical hot demag screen, ROSS critical-speed screen, CalculiX rotor screen,",
        "OpenFOAM cold-plate duct, gear-oil screen, and/or ISO 6336-style",
        "gear-strength screen) while torque map, **full** demagnetisation map,",
        "magnet-pocket burst release FoS, free-surface oil CFD, KISSsoft, load",
        "spectrum, module temperatures, bearing identity, modal/dynamometer",
        "correlation and other domains remain **OPEN**. `ship_ok` stays false.",
        "",
        "## FIA binding duties (why the solvers exist)",
        "",
        f"| Duty | Value |",
        f"|---|---|",
        f"| Front regen electrical cap | ≤ **{duty.get('front_regen_electrical_cap_kw')} kW** |",
        f"| Continuous design duty | **{duty.get('continuous_design_duty_kw')} kW** |",
        f"| Bay (W×D×H) | **{duty.get('bay_w_mm')}×{duty.get('bay_d_mm')}×{duty.get('bay_h_mm')} mm** |",
        f"| Mass cap | **~{duty.get('mass_cap_kg')} kg** |",
        f"| Peak rotor speed | **~{duty.get('max_rotor_speed_rpm')} rpm** |",
        f"| DC bus (seed) | **{duty.get('dc_bus_voltage_v')} V** |",
        f"| Coolant inlet / flow | **{duty.get('coolant_inlet_c')} °C / {duty.get('coolant_flow_l_min')} L/min** |",
        "",
        f"Binding doc: `{duty.get('binding_doc')}`",
        "",
        "## Required solver checks (Quality & Audit rows)",
        "",
        "Smoke proves the *tool* runs. **Works in kit context** means a twin-bound",
        "artefact answers the FIA duty screen for that row (still not `ship_ok`).",
        "",
        "| Check | Status | Works in kit context? | Software | Twin-bound result |",
        "|---|---|---|---|---|",
    ]
    for name, chk in (motor.get("required_checks") or {}).items():
        works = chk.get("works_in_kit_context")
        if works is True:
            works_cell = "**yes** (duty screen)"
        elif works is False:
            works_cell = "**no** — twin-bound but duty screen fails"
        elif chk.get("status") == "PARTIAL" and chk.get("result_ref"):
            works_cell = "PARTIAL screen (see artefact)"
        else:
            works_cell = "no — OPEN / smoke only"
        lines.append(
            f"| {name} | **{chk.get('status')}** | {works_cell} | "
            f"{chk.get('software')} | `{chk.get('result_ref')}` |"
        )
    lines.extend(
        [
            "",
            "## CAD authority coverage",
            "",
            f"- Principal components: **{cad.get('principal_components_total')}**",
            f"- Parametric family: **{cad.get('parametric_family_count')}** "
            f"(stator + rotor carrier + planetary; not release CAD)",
            f"- Communication only: **{cad.get('communication_only_count')}**",
            f"- Release authority (supplier/team): **{cad.get('release_authority_count')}** "
            f"/ coverage **{cad.get('release_authority_coverage')}**",
            "",
            "| Component | Authority | Source | Family |",
            "|---|---|---|---|",
        ]
    )
    for c in cad.get("components") or []:
        lines.append(
            f"| `{c.get('component_id')}` | `{c.get('authority_level')}` | "
            f"`{c.get('source_type')}` | `{c.get('cad_family')}` |"
        )
    packaging = payload.get("inverterPackaging")
    if isinstance(packaging, Mapping):
        mcu = packaging.get("mcu_box_mm") if isinstance(packaging.get("mcu_box_mm"), Mapping) else {}
        lines.extend(
            [
                "",
                "## Inverter packaging (analytical — not a solver row)",
                "",
                f"- **Status:** **{packaging.get('status')}** · **ship_ok:** false",
                f"- **Works in kit context:** "
                f"{'**yes**' if packaging.get('works_in_kit_context') else '**no**'}",
                f"- **DC bus / power:** {packaging.get('dc_bus_voltage_v')} V / "
                f"{packaging.get('continuous_electrical_power_kw')} kW → "
                f"I_dc ≈ **{packaging.get('dc_current_a')} A**",
                f"- **Power density:** **{packaging.get('power_density_kw_l')} kW/L** "
                f"(MCU {mcu.get('w')}×{mcu.get('d')}×{mcu.get('h')} mm)",
                f"- **Bus ESL nominal:** **{packaging.get('bus_esl_nominal_nh')} nH** "
                f"(in target band: {packaging.get('esl_nominal_in_target_band')})",
                f"- **SiC module count seed:** {packaging.get('sic_module_count')}",
                f"- **Cold-plate land covers MCU footprint:** "
                f"{packaging.get('cold_plate_covers_mcu_footprint')}",
                f"- **Module MPN / STEP:** {packaging.get('module_mpn_and_step')}",
                f"- **Double-pulse / measured ESL:** "
                f"{packaging.get('double_pulse_and_measured_esl')}",
                f"- Artefact: `{packaging.get('result_ref')}`",
                "",
            ]
        )
    hardware = payload.get("hardwareCorrelation")
    if isinstance(hardware, Mapping):
        lines.extend(
            [
                "",
                "## Hardware correlation (release holds)",
                "",
                "Numerical and analytical screens stay **PARTIAL** until the physical",
                "campaigns below close on the same controlled assembly revision.",
                f"**Status:** **{hardware.get('status')}** · "
                f"**OPEN:** **{hardware.get('open_count')} / "
                f"{hardware.get('hold_count')}** · **ship_ok:** **false**",
                "",
                "| Hardware hold | Status | Decision Register | Required evidence |",
                "|---|---|---|---|",
            ]
        )
        for row in hardware.get("holds") or []:
            if not isinstance(row, Mapping):
                continue
            decisions = ", ".join(
                f"`{decision_id}`"
                for decision_id in row.get("decision_register_ids") or []
            ) or "—"
            lines.append(
                f"| `{row.get('hold_id')}` | **{row.get('status')}** | "
                f"{decisions} | {row.get('required_evidence')} |"
            )
    blockers = (
        payload.get("architectureBlockers")
        or motor.get("architectureBlockers")
        or []
    )
    if isinstance(blockers, list) and blockers:
        lines.extend(
            [
                "",
                "## Architecture blockers (must permanently unblock — not chat-only)",
                "",
                "Each OPEN blocker has named permanent unblock options in code /",
                "Decision Register. `ship_ok` stays false while any remain OPEN.",
                "",
                "| Blocker | Status | Severity | Evidence | Permanent unblock |",
                "|---|---|---|---|---|",
            ]
        )
        for b in blockers:
            if not isinstance(b, Mapping):
                continue
            opts = b.get("permanent_unblock_options") or []
            opt_ids = ", ".join(
                f"`{o.get('option_id')}`"
                for o in opts
                if isinstance(o, Mapping)
            ) or "—"
            lines.append(
                f"| `{b.get('blocker_id')}` | **{b.get('status')}** | "
                f"{b.get('severity')} | `{b.get('evidence_path')}` | {opt_ids} |"
            )
        for b in blockers:
            if not isinstance(b, Mapping):
                continue
            lines.extend(["", f"### `{b.get('blocker_id')}`", ""])
            lines.append(str(b.get("summary") or ""))
            lines.append("")
            for o in b.get("permanent_unblock_options") or []:
                if not isinstance(o, Mapping):
                    continue
                lines.append(
                    f"- **{o.get('option_id')}** ({o.get('kind')}): "
                    f"{o.get('summary')} — hooks: `{o.get('code_hooks')}`"
                )
    lines.extend(
        [
            "",
            "## Honesty bar",
            "",
            "> Blender explains the machine. Solvers establish whether evidence holds",
            "> can close. Tests establish whether the solved machine matches hardware.",
            "> `ship_ok` stays false.",
            "",
            "Artefacts: `motor-multiphysics.json` (sidecar) · state keys",
            "`motorMultiphysics` / `cadAuthority` / optional `inverterPackaging` "
            "/ `hardwareCorrelation` / `architectureBlockers` when state write succeeds.",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def prove_catch(payload: Mapping[str, Any]) -> dict[str, Any]:
    """proveCatch: stamp must stay fail-closed; twin-bound checks may be PARTIAL with result_ref.

    @description Adversarial guards for the stub / twin-bound-partial stamp.
    Magnetic, rotor_dynamics, structural, inverter_cold_plate, water_jacket,
    gear_oil, and gear_strength may be PARTIAL when they cite a twin-bound
    artefact result_ref; everything else stays OPEN. Optional inverterPackaging
    may be PARTIAL with ship_ok false.
    @param payload Combined stamp payload
    @returns Catch dict with ok bool
    """
    motor = payload.get("motorMultiphysics") or {}
    cad = payload.get("cadAuthority") or {}
    checks = motor.get("required_checks") or {}
    _partial_allowed = frozenset(
        {
            "magnetic",
            "rotor_dynamics",
            "structural",
            "inverter_cold_plate",
            "water_jacket",
            "gear_oil",
            "gear_strength",
        }
    )

    def _status_ok(name: str, chk: Mapping[str, Any]) -> bool:
        status = chk.get("status")
        if status == "OPEN":
            return True
        # PARTIAL only for twin-bound artefacts that cite a result_ref.
        if name in _partial_allowed and status == "PARTIAL" and chk.get("result_ref"):
            return True
        return False

    statuses_honest = bool(checks) and all(
        isinstance(c, Mapping) and _status_ok(name, c) for name, c in checks.items()
    )
    remaining_open = all(
        isinstance(c, Mapping) and c.get("status") == "OPEN"
        for name, c in checks.items()
        if name not in _partial_allowed and isinstance(c, Mapping)
    )
    duty = motor.get("fia_duty") or {}
    duty_ok = all(
        duty.get(k) is not None
        for k in (
            "front_regen_electrical_cap_kw",
            "bay_w_mm",
            "bay_d_mm",
            "bay_h_mm",
            "mass_cap_kg",
            "max_rotor_speed_rpm",
        )
    )
    stator_ok = any(
        c.get("component_id") == "stator_lamination_and_winding"
        and c.get("authority_level") == "parametric_family"
        and c.get("cad_family") == "ipmsm_stator_lamination"
        for c in (cad.get("components") or [])
        if isinstance(c, Mapping)
    )
    parametric_count = int(cad.get("parametric_family_count") or 0)
    smoke_tagged = all(
        ((c.get("toolchain_smoke") or {}).get("evidence_class") == "toolchain_smoke_pass")
        for c in checks.values()
        if isinstance(c, Mapping)
    )
    results = {
        "statuses_honest_open_or_allowed_partial": statuses_honest,
        "non_partial_checks_open": remaining_open,
        "ship_ok_false": motor.get("ship_ok") is False and payload.get("ship_ok") is False,
        "all_required_solver_checks_pass_false": (
            motor.get("all_required_solver_checks_pass") is False
        ),
        "fia_duty_fields_present": duty_ok,
        "stator_parametric_family_listed": stator_ok,
        "parametric_family_count_ge_1": parametric_count >= 1,
        "toolchain_smoke_tagged_not_pass": smoke_tagged,
        "release_authority_coverage_zero": cad.get("release_authority_coverage") == 0.0,
        "never_ship_ok_true_on_smoke_only": True,
    }
    # Adversarial: if someone flips a check to PASS without result_ref, fire.
    illicit_pass = any(
        isinstance(c, Mapping)
        and c.get("status") == "PASS"
        and not c.get("result_ref")
        for c in checks.values()
    )
    results["illicit_pass_without_result_ref"] = {
        "fired": illicit_pass,
        "intended_action": "block_greenwash_solver_pass",
    }
    packaging = payload.get("inverterPackaging")
    packaging_ok = True
    if packaging is not None:
        packaging_ok = (
            isinstance(packaging, Mapping)
            and packaging.get("status") in {"PARTIAL", "OPEN"}
            and packaging.get("ship_ok") is False
            and bool(packaging.get("result_ref"))
        )
    results["inverter_packaging_honest_or_absent"] = packaging_ok
    hardware = payload.get("hardwareCorrelation")
    hardware_holds = (
        hardware.get("holds")
        if isinstance(hardware, Mapping)
        and isinstance(hardware.get("holds"), list)
        else []
    )
    open_hardware_holds = [
        row
        for row in hardware_holds
        if isinstance(row, Mapping) and row.get("status") == "OPEN"
    ]
    hardware_ok = (
        isinstance(hardware, Mapping)
        and len(hardware_holds) == len(_HARDWARE_CORRELATION_HOLDS)
        and all(
            isinstance(row, Mapping)
            and row.get("blocks_ship") is True
            and row.get("ship_ok") is False
            for row in hardware_holds
        )
        and (
            not open_hardware_holds
            or (
                hardware.get("ship_ok") is False
                and motor.get("ship_ok") is False
                and payload.get("ship_ok") is False
            )
        )
    )
    results["open_hardware_correlation_holds_honest"] = hardware_ok
    results["open_hardware_correlation_hold_count"] = len(open_hardware_holds)
    # OPEN architecture blockers must never coexist with ship_ok true.
    blockers = payload.get("architectureBlockers") or motor.get("architectureBlockers")
    open_blockers = [
        b
        for b in (blockers if isinstance(blockers, list) else [])
        if isinstance(b, Mapping) and b.get("status") == "OPEN"
    ]
    blockers_ok = True
    if open_blockers:
        blockers_ok = (
            motor.get("ship_ok") is False
            and payload.get("ship_ok") is False
            and all(b.get("cannot_greenwash") is True for b in open_blockers)
            and all(
                isinstance(b.get("permanent_unblock_options"), list)
                and len(b.get("permanent_unblock_options") or []) >= 1
                for b in open_blockers
            )
        )
    results["open_architecture_blockers_honest"] = blockers_ok
    results["open_architecture_blocker_count"] = len(open_blockers)
    results["ok"] = (
        statuses_honest
        and remaining_open
        and results["ship_ok_false"]
        and results["all_required_solver_checks_pass_false"]
        and duty_ok
        and stator_ok
        and smoke_tagged
        and packaging_ok
        and hardware_ok
        and blockers_ok
        and not illicit_pass
    )
    return results


def write_sidecar(twin: Path, payload: Mapping[str, Any]) -> Path:
    """Write motor-multiphysics.json into the twin directory.

    @description Canonical small artefact for Excel / overview (avoids 100MB+ state).
    @param twin Twin out directory
    @param payload Combined stamp
    @returns Path written
    """
    path = twin / "motor-multiphysics.json"
    tmp = twin / f".motor-multiphysics.{os.getpid()}.tmp"
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)
    return path


def write_markdown(twin: Path, payload: Mapping[str, Any]) -> Path:
    """Write JLR-FE-FRONT-FPK-MOTOR-MULTIPHYSICS.md into the twin.

    @param twin Twin out directory
    @param payload Combined stamp
    @returns Path written
    """
    path = twin / "JLR-FE-FRONT-FPK-MOTOR-MULTIPHYSICS.md"
    path.write_text(render_markdown(payload), encoding="utf-8")
    return path


def apply_to_state(
    state: MutableMapping[str, Any],
    payload: Mapping[str, Any],
) -> None:
    """Mutate state with solver, CAD, hardware-correlation, and ship truth.

    @param state Mutable state dict
    @param payload Combined stamp payload
    """
    state["motorMultiphysics"] = payload["motorMultiphysics"]
    state["cadAuthority"] = payload["cadAuthority"]
    if isinstance(payload.get("hardwareCorrelation"), Mapping):
        state["hardwareCorrelation"] = payload["hardwareCorrelation"]
    if isinstance(payload.get("inverterPackaging"), Mapping):
        state["inverterPackaging"] = payload["inverterPackaging"]
    blockers = payload.get("architectureBlockers")
    if isinstance(blockers, list):
        state["architectureBlockers"] = blockers
    elif isinstance(payload.get("motorMultiphysics"), Mapping):
        nested = payload["motorMultiphysics"].get("architectureBlockers")
        if isinstance(nested, list):
            state["architectureBlockers"] = nested
    state["ship_ok"] = False
    # Small pointer so digests / Overview can find the sidecar without re-reading
    # the whole multiphysics block if a later wipe occurs.
    open_n = 0
    listed = state.get("architectureBlockers")
    if isinstance(listed, list):
        open_n = sum(
            1
            for b in listed
            if isinstance(b, Mapping) and b.get("status") == "OPEN"
        )
    state["motorMultiphysicsPointer"] = {
        "sidecar": "motor-multiphysics.json",
        "markdown": "JLR-FE-FRONT-FPK-MOTOR-MULTIPHYSICS.md",
        "assembly_revision": payload.get("assembly_revision"),
        "ship_ok": False,
        "all_required_solver_checks_pass": False,
        "stamped_at": payload.get("stamped_at"),
        "has_inverter_packaging": isinstance(payload.get("inverterPackaging"), Mapping),
        "hardware_correlation_open_count": (
            payload.get("hardwareCorrelation", {}).get("open_count")
            if isinstance(payload.get("hardwareCorrelation"), Mapping)
            else None
        ),
        "architecture_blockers_open_count": open_n,
    }


def write_state_atomic(state_path: Path, state: Mapping[str, Any]) -> None:
    """Atomic write of state.json via pid-scoped temp file.

    @description Same pattern as other FE-front stamps; avoids partial writes.
    @param state_path Path to state.json
    @param state Full state object
    """
    tmp = state_path.with_name(f".state.json.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(state, indent=2, default=str) + "\n", encoding="utf-8")
    os.replace(tmp, state_path)


def selftest() -> int:
    """--selftest: OPEN when smokes-only; never ship_ok true; FIA duty present.

    @returns 0 on pass, 1 on fail
    """
    # Synthetic twin quantities (FIA table) — no need for the 124 MB state.
    fake_state = {
        "orchestratorContract": {
            "quantities": {
                "front_regen_electrical_cap_kw": {"value": 250, "unit": "kW"},
                "front_bay_envelope_w_mm": {"value": 343, "unit": "mm"},
                "front_bay_envelope_d_mm": {"value": 259, "unit": "mm"},
                "front_bay_envelope_h_mm": {"value": 267, "unit": "mm"},
                "fpk_mass_cap_kg": {"value": 32, "unit": "kg"},
                "max_rotor_speed_rpm": {"value": 19500, "unit": "rpm"},
                "dc_bus_voltage_v": {"value": 750, "unit": "V"},
                "coolant_inlet_c": {"value": 60, "unit": "°C"},
                "coolant_flow_l_min": {"value": 12, "unit": "L/min"},
            }
        }
    }
    payload = build_stamp_payload(state=fake_state)
    catch = prove_catch(payload)
    md = render_markdown(payload)

    bad = 0
    if not catch.get("ok"):
        print("FAIL proveCatch:", json.dumps(catch, indent=2))
        bad += 1
    if payload.get("ship_ok") is True:
        print("FAIL: ship_ok must never be true on smoke-only stamp")
        bad += 1
    if "250" not in md or ("19500" not in md and "19,500" not in md):
        print("FAIL: markdown missing FIA duty numbers")
        bad += 1
    if "OPEN" not in md:
        print("FAIL: markdown must show OPEN checks")
        bad += 1
    if "Works in kit context" not in md and "smoke only" not in md:
        print(
            "FAIL: markdown must distinguish kit-context duty screens from smoke-only"
        )
        bad += 1
    hardware = payload.get("hardwareCorrelation")
    expected_hardware_holds = {
        "DYNO_TORQUE_EFFICIENCY_MAP",
        "HIL_POPULATED_INVERTER",
        "FLOW_BENCH_JACKET_AND_COLD_PLATE",
        "HEATER_PLATE_MODULE_TEMPS",
        "OVERSPEED_ROTOR_RETENTION",
        "DOUBLE_PULSE_ESL_SIC",
    }
    actual_hardware_holds = {
        str(row.get("hold_id"))
        for row in ((hardware or {}).get("holds") or [])
        if isinstance(row, Mapping)
    }
    if not isinstance(hardware, Mapping) or actual_hardware_holds != expected_hardware_holds:
        print(
            "FAIL: hardwareCorrelation must register the six required OPEN hardware holds"
        )
        bad += 1
    elif hardware.get("ship_ok") is not False or hardware.get("open_count") != 6:
        print("FAIL: six OPEN hardware holds must force hardwareCorrelation.ship_ok false")
        bad += 1
    if "Hardware correlation" not in md:
        print("FAIL: markdown must render the hardware correlation register")
        bad += 1
    if not catch.get("open_hardware_correlation_holds_honest"):
        print("FAIL: proveCatch must enforce OPEN hardware correlation holds")
        bad += 1
    applied_state: dict[str, Any] = {}
    apply_to_state(applied_state, payload)
    if applied_state.get("hardwareCorrelation") != hardware:
        print("FAIL: apply_to_state must attach hardwareCorrelation")
        bad += 1
    if applied_state.get("ship_ok") is not False:
        print("FAIL: apply_to_state must remain fail-closed with hardware holds OPEN")
        bad += 1

    # Adversarial: illicit PASS without result_ref must fire
    evil = json.loads(json.dumps(payload))
    evil["motorMultiphysics"]["required_checks"]["magnetic"]["status"] = "PASS"
    evil["motorMultiphysics"]["required_checks"]["magnetic"]["result_ref"] = None
    evil_catch = prove_catch(evil)
    if not evil_catch["illicit_pass_without_result_ref"]["fired"]:
        print("FAIL: illicit PASS without result_ref must fire")
        bad += 1
    if evil_catch.get("ok"):
        print("FAIL: proveCatch must fail on illicit PASS")
        bad += 1
    # Adversarial: any OPEN physical-correlation hold forbids ship_ok=true even
    # when all analytical status fields remain untouched.
    evil_hardware = json.loads(json.dumps(payload))
    evil_hardware["hardwareCorrelation"]["ship_ok"] = True
    evil_hardware_catch = prove_catch(evil_hardware)
    if evil_hardware_catch.get("open_hardware_correlation_holds_honest"):
        print("FAIL: OPEN hardware correlation hold must reject hardware ship_ok=true")
        bad += 1
    if evil_hardware_catch.get("ok"):
        print("FAIL: proveCatch must fire on OPEN hardware hold + ship_ok=true")
        bad += 1

    # Twin-bound FIA magnetic + ROSS cases → PARTIAL; other checks stay OPEN.
    import tempfile

    with tempfile.TemporaryDirectory(prefix="fpk-motor-stack-") as tmp:
        twin_tmp = Path(tmp)
        case_dir = twin_tmp / "_motor_stack"
        case_dir.mkdir(parents=True)
        (case_dir / "em_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.em_fia_front_kit_case/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "abc123",
                    "finite_element_point": {
                        "peak_airgap_flux_density_t": 0.28,
                        "rms_airgap_flux_density_t": 0.21,
                    },
                    "analytical_duty_check": {
                        "required_shaft_torque_nm": 125.2,
                        "dc_current_a": 333.3,
                        "electrical_power_check_kw": 250.0,
                        "front_regen_cap_respected": True,
                    },
                    "input_quantities": {
                        "continuous_electrical_power_kw": 250.0,
                        "dc_bus_voltage_v": 750.0,
                        "max_rotor_speed_rpm": 19500.0,
                    },
                    "machine_geometry": {
                        "topology": "48-slot / 8-pole test",
                        "fits_bay": True,
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "em_fia_demag_screen.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.em_fia_demag_screen/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "demag123",
                    "screening_results": {
                        "magnet_grade": "N42UH",
                        "magnet_temp_c": 160.0,
                        "phase_current_rms_a": 535.0,
                        "current_angle_electrical_deg": -45.0,
                        "h_knee_a_per_m": 507450.0,
                        "h_operating_a_per_m": 242000.0,
                        "demagnetisation_margin_ratio": 2.0969,
                        "demagnetisation_margin_headroom": 0.5231,
                        "screen_ok": True,
                    },
                    "margins": {
                        "demagnetisation_margin_ratio": 2.0969,
                        "demagnetisation_margin_headroom": 0.5231,
                        "h_knee_a_per_m": 507450.0,
                        "h_operating_a_per_m": 242000.0,
                        "screen_ok": True,
                        "demag_map_closed": False,
                    },
                    "works_in_kit_context": {
                        "demag_screen_ok": True,
                        "demagnetisation_margin_ratio": 2.0969,
                        "magnet_temp_c": 160.0,
                        "magnet_grade": "N42UH",
                    },
                    "demagnetisation_map": {"status": "OPEN"},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "em_fia_mtpa_screen.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.em_fia_mtpa_screen/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "mtpa456",
                    "grid": {
                        "mode": "default",
                        "n_current_angles": 7,
                        "n_rotor_positions": 5,
                        "n_points": 35,
                        "phase_current_rms_a": 535.0,
                    },
                    "summary": {
                        "n_points": 35,
                        "peak_torque_magnitude_nm": 104.2,
                        "peak_airgap_flux_density_t": 1.41,
                        "best_screened_current_angle_electrical_deg": -45.0,
                        "best_angle_mean_torque_magnitude_nm": 98.6,
                    },
                    "coverage": {
                        "denser_than_smoke": True,
                        "closed_torque_map": False,
                    },
                    "mtpa_screen": {"status": "PARTIAL"},
                    "torque_map": {"status": "OPEN"},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "ross_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.ross_fia_front_kit_case/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "def456",
                    "critical_speeds": {
                        "first_critical_speed_rpm": 42000.0,
                        "operating_speed_rpm": 19500.0,
                    },
                    "margins": {
                        "first_critical_over_operating": 2.15,
                        "clear_of_operating_band": True,
                    },
                    "input_quantities": {"max_rotor_speed_rpm": 19500.0},
                    "rotor_model": {
                        "shaft_length_m": 0.141,
                        "shaft_outer_diameter_m": 0.0927,
                        "disk_outer_diameter_m": 0.122,
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "calculix_fia_rotor_screen.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.calculix_fia_rotor_screen/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "ghi789",
                    "screening_results": {
                        "max_von_mises_mpa": 118.0,
                        "max_principal_stress_mpa": 130.0,
                        "max_abs_displacement_mm": 0.012,
                    },
                    "margins": {
                        "screening_fos_vs_assumed_yield": 3.01,
                        "below_assumed_yield": True,
                        "release_fos_closed": False,
                    },
                    "input_quantities": {"max_rotor_speed_rpm": 19500.0},
                    "ring_mesh": {
                        "rotor_inner_radius_mm": 46.35,
                        "rotor_outer_radius_mm": 61.0,
                        "axial_length_mm": 24.395,
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "calculix_fia_magnet_pocket_screen.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.calculix_fia_magnet_pocket_screen/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "pocket123",
                    "screening_results": {
                        "max_von_mises_mpa": 95.0,
                        "analytical_bridge_stress_mpa": 42.0,
                        "max_principal_stress_mpa": 100.0,
                        "max_abs_displacement_mm": 0.008,
                    },
                    "margins": {
                        "screening_fos_vs_assumed_yield_fea": 3.74,
                        "screening_fos_vs_assumed_yield_analytical": 8.45,
                        "below_assumed_yield": True,
                        "release_fos_closed": False,
                    },
                    "works_in_kit_context": {"bridge_screen_ok": True},
                    "input_quantities": {"max_rotor_speed_rpm": 19500.0},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "analytical_fia_case_mount_screen.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.analytical_fia_case_mount_screen/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "mount456",
                    "screening_results": {
                        "motor_reaction_torque_nm": 125.2,
                        "carrier_output_torque_nm": 1001.6,
                        "flange_bolt_shear_fos": 42.0,
                        "bay_mount_shear_fos": 12.5,
                        "bay_mount_tension_fos": 80.0,
                        "housing_wall_torsion_fos": 55.0,
                        "minimum_screening_fos": 12.5,
                        "below_assumed_allowables": True,
                    },
                    "margins": {
                        "flange_bolt_shear_fos": 42.0,
                        "bay_mount_shear_fos": 12.5,
                        "bay_mount_tension_fos": 80.0,
                        "housing_wall_torsion_fos": 55.0,
                        "minimum_screening_fos": 12.5,
                        "below_assumed_allowables": True,
                        "release_fos_closed": False,
                    },
                    "works_in_kit_context": {"case_mount_screen_ok": True},
                    "input_quantities": {
                        "max_rotor_speed_rpm": 19500.0,
                        "housing_outer_diameter_mm": 176.7,
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "openfoam_fia_cold_plate_case.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.openfoam_fia_cold_plate_case/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "cad_family": "cold_plate_serpentine",
                    "input_quantities_sha256": "jkl012",
                    "pressure_drop": {"headline_delta_p_pa": 24921.0},
                    "channel_geometry": {
                        "channel_width_m": 0.005345,
                        "channel_depth_m": 0.001336,
                        "pass_count": 8,
                        "inlet_velocity_m_s": 3.5,
                        "reynolds_number": 15657.0,
                    },
                    "input_quantities": {
                        "coolant_flow_l_min": 12.0,
                        "coolant_inlet_c": 60.0,
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "openfoam_fia_water_jacket_case.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.openfoam_fia_water_jacket_case/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "cad_family": "motor_water_jacket_helical",
                    "input_quantities_sha256": "wjk789",
                    "pressure_drop": {"headline_delta_p_pa": 18500.0},
                    "channel_geometry": {
                        "channel_width_m": 0.008,
                        "channel_depth_m": 0.0035,
                        "helix_turns": 5.0,
                        "inlet_velocity_m_s": 7.14,
                        "reynolds_number": 72000.0,
                    },
                    "input_quantities": {
                        "coolant_flow_l_min": 12.0,
                        "coolant_inlet_c": 60.0,
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "analytical_fia_cooling_thermal_screen.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.analytical_fia_cooling_thermal_screen/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "thermal456",
                    "screening_results": {
                        "maximum_winding_temperature_c": 91.2,
                        "maximum_magnet_temperature_c": 96.4,
                        "maximum_module_temperature_c": 112.4,
                        "coolant_outlet_temperature_c": 69.1,
                    },
                    "conjugate_heat_transfer": {"status": "OPEN"},
                    "flow_bench": {"status": "OPEN"},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "gear_oil_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.gear_oil_fia_front_kit_case/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "mno345",
                    "screening_results": {
                        "minimum_jet_flow_l_min": 16.3,
                        "churning_loss_w": 820.0,
                        "pickup_charge_adequate": True,
                    },
                    "works_in_kit_context": {"oil_delivery_screen_ok": True},
                    "input_quantities": {
                        "gear_ratio": 8.0,
                        "planet_count": 3,
                        "planet_od_mm": 38.4,
                        "required_shaft_torque_nm": 125.2,
                    },
                    "free_surface_cfd": {"status": "OPEN"},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "iso6336_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.iso6336_fia_front_kit_case/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "stu901",
                    "gear_geometry": {
                        "ratio_from_teeth": 8.0,
                        "sun_teeth": 18,
                        "planet_teeth": 54,
                        "ring_teeth": 126,
                        "module_mm": 0.704,
                        "face_width_mm": 14.0,
                        "planet_count": 3,
                    },
                    "duty_torques": {
                        "motor_shaft_torque_nm": 125.2,
                        "carrier_output_torque_nm": 1001.6,
                    },
                    "strength_screen": {
                        "minimum_bending_fos": 0.35,
                        "minimum_contact_fos": 0.55,
                        "minimum_strength_factor": 0.35,
                    },
                    "margins": {
                        "minimum_bending_fos": 0.35,
                        "minimum_contact_fos": 0.55,
                        "minimum_strength_factor": 0.35,
                    },
                    "works_in_kit_context": {"duty_strength_screen_ok": False},
                    "input_quantities": {"gear_ratio": 8.0},
                    "kisssoft_independent_check": {"status": "OPEN"},
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "iso_bevel_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.iso_bevel_fia_front_kit_case/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "architecture_hold": (
                        "DIFF_NEST_TOO_SMALL_FOR_CARRIER_TORQUE — enlarge nest, "
                        "reduce ratio/torque at diff, or change topology; "
                        "do not claim PASS"
                    ),
                    "bevel_geometry": {
                        "diff_od_mm": 19.2,
                        "spider_pinion_teeth": 10,
                        "side_gear_teeth": 14,
                        "tooth_count_basis": "documented packaging seed",
                    },
                    "duty_torques": {"carrier_input_torque_nm": 1001.6},
                    "strength_screen": {
                        "minimum_bending_fos": 0.01,
                        "minimum_contact_fos": 0.002,
                        "minimum_strength_factor": 0.002,
                    },
                    "margins": {
                        "minimum_bending_fos": 0.01,
                        "minimum_contact_fos": 0.002,
                        "minimum_strength_factor": 0.002,
                    },
                    "works_in_kit_context": {"duty_strength_screen_ok": False},
                    "recommended_geometry": {
                        "diff_od_mm": 120.0,
                        "minimum_strength_factor": 0.60,
                        "clears_duty_screen": False,
                        "architecture_hold": (
                            "DIFF_NEST_TOO_SMALL_FOR_CARRIER_TORQUE — enlarge nest, "
                            "reduce ratio/torque at diff, or change topology; "
                            "do not claim PASS"
                        ),
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        (case_dir / "inverter_packaging_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.inverter_packaging_fia_front_kit_case/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "input_quantities_sha256": "pqr678",
                    "screening_results": {
                        "dc_current_a": 333.333,
                        "power_density_kw_l": 610.0,
                        "bus_esl_nominal_nh": 6.39,
                        "esl_nominal_in_target_band": True,
                        "sic_module_count": 3,
                        "cold_plate_covers_mcu_footprint": True,
                    },
                    "works_in_kit_context": {"packaging_screen_ok": True},
                    "input_quantities": {
                        "dc_bus_voltage_v": 750.0,
                        "continuous_electrical_power_kw": 250.0,
                        "mcu_w_mm": 115.2,
                        "mcu_d_mm": 127.2,
                        "mcu_h_mm": 28.0,
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        partial_payload = build_stamp_payload(state=fake_state, twin_dir=twin_tmp)
        mag = partial_payload["motorMultiphysics"]["required_checks"]["magnetic"]
        if mag.get("status") != "PARTIAL" or not mag.get("result_ref"):
            print("FAIL: twin-bound FIA case must mark magnetic PARTIAL with result_ref")
            bad += 1
        if mag.get("demagnetisation_margin") != 2.0969:
            print(
                "FAIL: magnetic demagnetisation_margin must surface demag screen ratio"
            )
            bad += 1
        mag_twin = mag.get("twin_bound_case") or {}
        demag_cite = mag_twin.get("demag_screen")
        if not isinstance(demag_cite, dict) or demag_cite.get("status") != "PARTIAL":
            print(
                "FAIL: magnetic twin_bound_case must cite demag screen as PARTIAL "
                "when artefact present"
            )
            bad += 1
        elif demag_cite.get("magnet_grade") != "N42UH":
            print("FAIL: demag cite must surface magnet grade")
            bad += 1
        elif demag_cite.get("magnet_temp_c") != 160.0:
            print("FAIL: demag cite must surface magnet temperature")
            bad += 1
        elif demag_cite.get("h_knee_a_per_m") != 507450.0:
            print("FAIL: demag cite must surface knee field")
            bad += 1
        elif demag_cite.get("ship_ok") is not False:
            print("FAIL: demag cite must keep ship_ok false")
            bad += 1
        elif demag_cite.get("demag_map") != "OPEN":
            print("FAIL: demag cite must leave full demag map OPEN")
            bad += 1
        mtpa_cite = mag_twin.get("mtpa_screen")
        if not isinstance(mtpa_cite, dict) or mtpa_cite.get("status") != "PARTIAL":
            print(
                "FAIL: magnetic twin_bound_case must cite MTPA screen as PARTIAL "
                "when artefact present"
            )
            bad += 1
        elif mtpa_cite.get("n_points") != 35:
            print("FAIL: MTPA cite must surface screen point count")
            bad += 1
        elif mtpa_cite.get("peak_torque_magnitude_nm") != 104.2:
            print("FAIL: MTPA cite must surface peak torque magnitude")
            bad += 1
        elif mtpa_cite.get("ship_ok") is not False:
            print("FAIL: MTPA cite must keep ship_ok false")
            bad += 1
        elif mtpa_cite.get("torque_map") != "OPEN":
            print("FAIL: MTPA cite must leave torque map OPEN")
            bad += 1
        if mag.get("status") == "PASS" or mag_twin.get("ship_ok") is True:
            print("FAIL: magnetic must remain PARTIAL with ship_ok false")
            bad += 1
        ross = partial_payload["motorMultiphysics"]["required_checks"]["rotor_dynamics"]
        if ross.get("status") != "PARTIAL" or not ross.get("result_ref"):
            print(
                "FAIL: twin-bound ROSS case must mark rotor_dynamics PARTIAL with result_ref"
            )
            bad += 1
        if ross.get("critical_speed_margin") != 2.15:
            print("FAIL: rotor_dynamics must surface critical_speed_margin from artefact")
            bad += 1
        if ross.get("works_in_kit_context") is not True:
            print("FAIL: rotor_dynamics works_in_kit_context must be true when clear")
            bad += 1
        structural = partial_payload["motorMultiphysics"]["required_checks"]["structural"]
        if structural.get("status") != "PARTIAL" or not structural.get("result_ref"):
            print(
                "FAIL: twin-bound CalculiX case must mark structural PARTIAL with result_ref"
            )
            bad += 1
        if structural.get("minimum_factor_of_safety") != 3.01:
            print("FAIL: structural must surface screening FoS from artefact")
            bad += 1
        if structural.get("works_in_kit_context") is not True:
            print("FAIL: structural works_in_kit_context must be true when below yield")
            bad += 1
        structural_twin = structural.get("twin_bound_case") or {}
        pocket_cite = structural_twin.get("magnet_pocket_burst_fea")
        if not isinstance(pocket_cite, dict) or pocket_cite.get("status") != "PARTIAL":
            print(
                "FAIL: structural twin_bound_case must cite magnet-pocket screen "
                "as PARTIAL evidence when artefact present"
            )
            bad += 1
        elif pocket_cite.get("max_von_mises_mpa") != 95.0:
            print("FAIL: magnet-pocket cite must surface FEA von Mises from artefact")
            bad += 1
        elif pocket_cite.get("ship_ok") is not False:
            print("FAIL: magnet-pocket cite must keep ship_ok false")
            bad += 1
        mount_cite = structural_twin.get("case_mount_screen")
        if not isinstance(mount_cite, dict) or mount_cite.get("status") != "PARTIAL":
            print(
                "FAIL: structural twin_bound_case must cite case/mount screen "
                "as PARTIAL evidence when artefact present"
            )
            bad += 1
        elif mount_cite.get("minimum_screening_fos") != 12.5:
            print("FAIL: case/mount cite must surface minimum_screening_fos")
            bad += 1
        elif mount_cite.get("carrier_output_torque_nm") != 1001.6:
            print("FAIL: case/mount cite must surface carrier output torque")
            bad += 1
        elif mount_cite.get("ship_ok") is not False:
            print("FAIL: case/mount cite must keep ship_ok false")
            bad += 1
        elif mount_cite.get("calculix_full_case") != "OPEN":
            print("FAIL: case/mount cite must leave full-case CalculiX OPEN")
            bad += 1
        if structural.get("status") == "PASS" or structural_twin.get("ship_ok") is True:
            print("FAIL: structural must remain PARTIAL with ship_ok false")
            bad += 1
        cold_chk = partial_payload["motorMultiphysics"]["required_checks"][
            "inverter_cold_plate"
        ]
        if cold_chk.get("status") != "PARTIAL" or not cold_chk.get("result_ref"):
            print(
                "FAIL: twin-bound OpenFOAM case must mark inverter_cold_plate "
                "PARTIAL with result_ref"
            )
            bad += 1
        if cold_chk.get("pressure_drop_kpa") != 24.921:
            print("FAIL: inverter_cold_plate must surface Δp_kPa from artefact")
            bad += 1
        if cold_chk.get("works_in_kit_context") is not True:
            print("FAIL: inverter_cold_plate works_in_kit_context must be true when Δp set")
            bad += 1
        if cold_chk.get("maximum_module_temperature_c") != 112.4:
            print("FAIL: inverter_cold_plate must cite thermal-screen module temperature")
            bad += 1
        cold_thermal = (cold_chk.get("twin_bound_case") or {}).get("thermal_screen")
        if not isinstance(cold_thermal, Mapping) or cold_thermal.get("status") != "PARTIAL":
            print("FAIL: inverter_cold_plate must cite PARTIAL thermal screen")
            bad += 1
        elif cold_thermal.get("conjugate_heat_transfer") != "OPEN":
            print("FAIL: thermal cite must leave conjugate heat transfer OPEN")
            bad += 1
        jacket_chk = partial_payload["motorMultiphysics"]["required_checks"][
            "water_jacket"
        ]
        if jacket_chk.get("status") != "PARTIAL" or not jacket_chk.get("result_ref"):
            print(
                "FAIL: twin-bound OpenFOAM case must mark water_jacket "
                "PARTIAL with result_ref"
            )
            bad += 1
        if jacket_chk.get("pressure_drop_kpa") != 18.5:
            print("FAIL: water_jacket must surface Δp_kPa from artefact")
            bad += 1
        if jacket_chk.get("works_in_kit_context") is not True:
            print("FAIL: water_jacket works_in_kit_context must be true when Δp set")
            bad += 1
        if jacket_chk.get("maximum_winding_temperature_c") != 91.2:
            print("FAIL: water_jacket must cite thermal-screen winding temperature")
            bad += 1
        jacket_thermal = (jacket_chk.get("twin_bound_case") or {}).get("thermal_screen")
        if not isinstance(jacket_thermal, Mapping) or jacket_thermal.get("flow_bench") != "OPEN":
            print("FAIL: water_jacket thermal cite must leave flow bench OPEN")
            bad += 1
        gear_oil = partial_payload["motorMultiphysics"]["required_checks"]["gear_oil"]
        if gear_oil.get("status") != "PARTIAL" or not gear_oil.get("result_ref"):
            print(
                "FAIL: twin-bound gear_oil case must mark gear_oil PARTIAL with result_ref"
            )
            bad += 1
        if gear_oil.get("minimum_jet_flow_l_min") != 16.3:
            print("FAIL: gear_oil must surface minimum_jet_flow_l_min from artefact")
            bad += 1
        if gear_oil.get("churning_loss_w") != 820.0:
            print("FAIL: gear_oil must surface churning_loss_w from artefact")
            bad += 1
        if gear_oil.get("works_in_kit_context") is not True:
            print("FAIL: gear_oil works_in_kit_context must be true when screen ok")
            bad += 1
        gear_strength_chk = partial_payload["motorMultiphysics"]["required_checks"][
            "gear_strength"
        ]
        if gear_strength_chk.get("status") != "PARTIAL" or not gear_strength_chk.get(
            "result_ref"
        ):
            print(
                "FAIL: twin-bound ISO 6336 case must mark gear_strength PARTIAL "
                "with result_ref"
            )
            bad += 1
        if gear_strength_chk.get("minimum_strength_factor") != 0.35:
            print("FAIL: gear_strength must surface minimum_strength_factor from artefact")
            bad += 1
        if gear_strength_chk.get("works_in_kit_context") is not False:
            print(
                "FAIL: gear_strength works_in_kit_context must be false when "
                "duty_strength_screen_ok is false"
            )
            bad += 1
        bevel_cite = (
            (gear_strength_chk.get("twin_bound_case") or {}).get(
                "bevel_differential_screen"
            )
            if isinstance(gear_strength_chk.get("twin_bound_case"), dict)
            else None
        )
        if not isinstance(bevel_cite, dict):
            print("FAIL: bevel_differential_screen cite must be present in fixture")
            bad += 1
        elif BLOCKER_ID_DIFF_NEST not in str(bevel_cite.get("architecture_hold") or ""):
            print("FAIL: bevel cite must surface DIFF_NEST architecture_hold")
            bad += 1
        blockers = partial_payload["motorMultiphysics"].get("architectureBlockers")
        if not isinstance(blockers, list) or not blockers:
            print("FAIL: architectureBlockers must list OPEN holds from bevel case")
            bad += 1
        elif blockers[0].get("blocker_id") != BLOCKER_ID_DIFF_NEST:
            print("FAIL: expected DIFF_NEST_TOO_SMALL_FOR_CARRIER_TORQUE blocker")
            bad += 1
        elif not blockers[0].get("permanent_unblock_options"):
            print("FAIL: blocker must name permanent_unblock_options")
            bad += 1
        elif blockers[0].get("cannot_greenwash") is not True:
            print("FAIL: blocker must set cannot_greenwash")
            bad += 1
        packaging = partial_payload.get("inverterPackaging")
        if not isinstance(packaging, dict) or packaging.get("status") != "PARTIAL":
            print("FAIL: inverterPackaging section must be PARTIAL when artefact exists")
            bad += 1
        if packaging and packaging.get("ship_ok") is True:
            print("FAIL: inverterPackaging must keep ship_ok false")
            bad += 1
        if packaging and packaging.get("dc_current_a") != 333.333:
            print("FAIL: inverterPackaging must surface dc_current_a")
            bad += 1
        md_partial = render_markdown(partial_payload)
        if "Inverter packaging" not in md_partial:
            print("FAIL: markdown must include inverter packaging section")
            bad += 1
        if "Architecture blockers" not in md_partial:
            print("FAIL: markdown must include architecture blockers section")
            bad += 1
        if BLOCKER_ID_DIFF_NEST not in md_partial:
            print("FAIL: markdown must name DIFF_NEST blocker id")
            bad += 1
        if partial_payload["motorMultiphysics"].get("ship_ok") is True:
            print(
                "FAIL: PARTIAL magnetic/ross/calculix/OF/gear_oil/iso6336 "
                "must not set ship_ok"
            )
            bad += 1
        catch_partial = prove_catch(partial_payload)
        if not catch_partial.get("ok"):
            print(
                "FAIL: proveCatch must accept magnetic+ross+calculix+OF+gear_oil+"
                "gear_strength PARTIAL with result_ref (+ inverterPackaging + "
                "architecture blockers)"
            )
            bad += 1
        if int(catch_partial.get("open_architecture_blocker_count") or 0) < 1:
            print("FAIL: proveCatch must count OPEN architecture blockers")
            bad += 1
        # Adversarial: OPEN blocker + ship_ok true must fail proveCatch.
        evil = json.loads(json.dumps(partial_payload))
        evil["ship_ok"] = True
        evil["motorMultiphysics"]["ship_ok"] = True
        if prove_catch(evil).get("ok"):
            print("FAIL: proveCatch must fire when OPEN blockers coexist with ship_ok")
            bad += 1
        if int(partial_payload["cadAuthority"].get("parametric_family_count") or 0) < 5:
            print(
                "FAIL: expected ≥5 parametric families "
                "(stator, rotor, planetary, cold_plate, water_jacket)"
            )
            bad += 1
        cold = next(
            (
                c
                for c in partial_payload["cadAuthority"]["components"]
                if c.get("component_id") == "inverter_cold_plate"
            ),
            None,
        )
        if (
            not cold
            or cold.get("authority_level") != "parametric_family"
            or cold.get("cad_family") != "cold_plate_serpentine"
        ):
            print("FAIL: inverter_cold_plate must list cold_plate_serpentine family")
            bad += 1
        jacket_cad = next(
            (
                c
                for c in partial_payload["cadAuthority"]["components"]
                if c.get("component_id") == "traction_motor_water_jacket"
            ),
            None,
        )
        if (
            not jacket_cad
            or jacket_cad.get("authority_level") != "parametric_family"
            or jacket_cad.get("cad_family") != "motor_water_jacket_helical"
        ):
            print(
                "FAIL: traction_motor_water_jacket must list "
                "motor_water_jacket_helical family"
            )
            bad += 1

        # Regression: an applied torque split clears DIFF_NEST but must replace
        # it with the still-OPEN post-differential final-drive packaging blocker.
        (case_dir / "iso_bevel_fia_front_kit_case.json").write_text(
            json.dumps(
                {
                    "schema": "forgeos.motor_stack.iso_bevel_fia_front_kit_case/v1",
                    "status": "PARTIAL",
                    "ship_ok": False,
                    "bevel_geometry": {
                        "diff_od_mm": 120.0,
                        "spider_pinion_teeth": 10,
                        "side_gear_teeth": 14,
                        "tooth_count_basis": "strength-driven screening geometry",
                    },
                    "duty_torques": {
                        "carrier_input_torque_nm": 250.438538,
                        "ratio_into_diff": 2.0,
                        "ratio_after_diff": 4.0,
                    },
                    "strength_screen": {
                        "minimum_bending_fos": 4.5655,
                        "minimum_contact_fos": 1.2172,
                        "minimum_strength_factor": 1.2172,
                    },
                    "margins": {
                        "minimum_bending_fos": 4.5655,
                        "minimum_contact_fos": 1.2172,
                        "minimum_strength_factor": 1.2172,
                    },
                    "works_in_kit_context": {"duty_strength_screen_ok": True},
                    "architecture_decision": {
                        "selected_option": "cut_torque_at_diff",
                        "status": "APPLIED_FOR_SCREENING",
                        "ratio_into_diff": 2.0,
                        "ratio_after_diff": 4.0,
                        "ship_ok": False,
                    },
                    "residual_blocker": {
                        "blocker_id": "POST_DIFF_FINAL_DRIVE_PACKAGING",
                        "status": "OPEN",
                        "ship_ok": False,
                        "ratio_after_diff": 4.0,
                        "summary": "Post-differential 4:1 stage packaging remains OPEN.",
                    },
                }
            )
            + "\n",
            encoding="utf-8",
        )
        residual_payload = build_stamp_payload(state=fake_state, twin_dir=twin_tmp)
        residual_blockers = residual_payload["motorMultiphysics"].get(
            "architectureBlockers"
        )
        if (
            not isinstance(residual_blockers, list)
            or len(residual_blockers) != 1
            or residual_blockers[0].get("blocker_id")
            != "POST_DIFF_FINAL_DRIVE_PACKAGING"
        ):
            print(
                "FAIL: cleared DIFF_NEST must be replaced by "
                "POST_DIFF_FINAL_DRIVE_PACKAGING"
            )
            bad += 1
        elif not residual_blockers[0].get("permanent_unblock_options"):
            print("FAIL: post-diff blocker must name permanent_unblock_options")
            bad += 1
        elif residual_blockers[0].get("cannot_greenwash") is not True:
            print("FAIL: post-diff blocker must set cannot_greenwash")
            bad += 1
        if BLOCKER_ID_DIFF_NEST in json.dumps(residual_blockers):
            print("FAIL: DIFF_NEST blocker must stop once budgeted FoS clears")
            bad += 1
        if residual_payload["motorMultiphysics"].get("ship_ok") is not False:
            print("FAIL: residual packaging blocker must keep ship_ok false")
            bad += 1
        residual_catch = prove_catch(residual_payload)
        if (
            not residual_catch.get("ok")
            or int(residual_catch.get("open_architecture_blocker_count") or 0) != 1
        ):
            print("FAIL: proveCatch must enforce the post-diff residual blocker")
            bad += 1

    if bad:
        print(f"selftest FAIL ({bad})")
        return 1
    print(
        json.dumps(
            {
                "ok": True,
                "checks": list((payload["motorMultiphysics"]["required_checks"]).keys()),
                "principal_components": payload["cadAuthority"]["principal_components_total"],
                "parametric_family_count": payload["cadAuthority"]["parametric_family_count"],
                "proveCatch": catch,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(selftest())
    print("Use scripts/fe-front-stamp-motor-multiphysics.py --twin <dir>", file=sys.stderr)
    raise SystemExit(2)
