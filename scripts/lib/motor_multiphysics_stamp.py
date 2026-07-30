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
ASSEMBLY_REVISION = "front-drive-concept-stub-2026-07-30"

# Last-known-green toolchain smoke notes (README / 2026-07-30 proofs).
# These prove the *tools* run — never that the FIA twin geometry was solved.
_KNOWN_SMOKE: dict[str, dict[str, Any]] = {
    "magnetic": {
        "software": "Pyleecan + xfemm",
        "paths": [
            "scripts/motor-stack/em_magnetic_selftest.py",
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
        "software": "Gmsh + CalculiX",
        "paths": [
            "scripts/motor-stack/calculix_smoke_selftest.sh",
            "scripts/motor-stack/calculix_fia_rotor_screen.py",
            "scripts/motor-stack/calculix.Dockerfile",
        ],
        "versions": {"calculix_ccx": "2.21", "image": "forgeos/calculix:2.21-arm64"},
        "last_known_green": "2026-07-30 — cantilever solid displacement+stress fields (generic)",
        "evidence_class": "toolchain_smoke_pass",
    },
    "water_jacket": {
        "software": "OpenFOAM",
        "paths": ["scripts/motor-stack/openfoam_smoke_selftest.sh"],
        "versions": {
            "openfoam_image": "microfluidica/openfoam:14",
            "digest": "sha256:efba53ae22dc5154114a9dd346c979b3cd7f3e20ebed90e399230c02592aecbf",
        },
        "last_known_green": "2026-07-30 — cavity tutorial residuals (generic; not jacket geometry)",
        "evidence_class": "toolchain_smoke_pass",
    },
    "inverter_cold_plate": {
        "software": "OpenFOAM",
        "paths": ["scripts/motor-stack/openfoam_smoke_selftest.sh"],
        "versions": {
            "openfoam_image": "microfluidica/openfoam:14",
        },
        "last_known_green": "2026-07-30 — same cavity smoke as water_jacket (generic)",
        "evidence_class": "toolchain_smoke_pass",
    },
    "gear_oil": {
        "software": "OpenFOAM",
        "paths": ["scripts/motor-stack/openfoam_smoke_selftest.sh"],
        "versions": {
            "openfoam_image": "microfluidica/openfoam:14",
        },
        "last_known_green": "2026-07-30 — cavity smoke only; free-surface oil not run",
        "evidence_class": "toolchain_smoke_pass",
    },
    "gear_strength": {
        "software": "ISO 6336 + KISSsoft + CalculiX",
        "paths": ["scripts/motor-stack/calculix_smoke_selftest.sh"],
        "versions": {"calculix_ccx": "2.21", "kisssoft": "licence_not_proven_in_repo"},
        "last_known_green": "2026-07-30 — CalculiX structural smoke only; ISO 6336 / KISSsoft not twin-bound",
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
            "Tooth strength / ISO 6336 / twin ratio closure still OPEN."
        ),
    },
    {
        "component_id": "compact_bevel_differential",
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Architecture communication — bevel contact OPEN",
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
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Cooling band intent — OpenFOAM jacket OPEN",
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


def _load_fia_ross_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA ROSS rotor-dynamics case artefact if present."""
    return _load_fia_case_json(twin_dir, "ross_fia_front_kit_case.json")


def _load_fia_calculix_case(twin_dir: Optional[Path]) -> Optional[dict[str, Any]]:
    """Load twin-bound FIA CalculiX rotor centrifugal screen artefact if present."""
    return _load_fia_case_json(twin_dir, "calculix_fia_rotor_screen.json")


def _magnetic_check_from_fia_case(
    duty: Mapping[str, Any],
    case: Mapping[str, Any],
    *,
    twin_dir: Path,
) -> dict[str, Any]:
    """Promote magnetic check to PARTIAL when a twin-bound open-circuit point exists.

    INTENT: Make the FIA front-kit magnetic case visible without claiming a torque
    map, demagnetisation margin, or dynamometer correlation (those stay OPEN).
    """
    fem = case.get("finite_element_point") if isinstance(case.get("finite_element_point"), dict) else {}
    analytical = (
        case.get("analytical_duty_check")
        if isinstance(case.get("analytical_duty_check"), dict)
        else {}
    )
    inputs = case.get("input_quantities") if isinstance(case.get("input_quantities"), dict) else {}
    rel_ref = "_motor_stack/em_fia_front_kit_case.json"
    body = _open_check(
        "magnetic",
        extra={
            "status": "PARTIAL",
            "torque_map_ref": None,
            "loss_map_ref": None,
            "demagnetisation_margin": None,
            "model_revision": str(case.get("schema") or "forgeos.motor_stack.em_fia_front_kit_case/v1"),
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
                "path": rel_ref,
                "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
                "peak_airgap_flux_density_t": fem.get("peak_airgap_flux_density_t"),
                "rms_airgap_flux_density_t": fem.get("rms_airgap_flux_density_t"),
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
                "torque_map": "OPEN",
                "dynamometer_correlation": "OPEN",
                "note": (
                    "Twin-bound open-circuit magnetic point + analytical 250 kW duty "
                    "reconciliation. Not a loaded torque map; not dyno-correlated; "
                    "does not close release."
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
    body = _open_check(
        "rotor_dynamics",
        extra={
            "status": "PARTIAL",
            "critical_speed_margin": margins.get("first_critical_over_operating"),
            "bearing_reaction_ref": None,
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
                    "rotor disk. Assumed bearing stiffness; not modal/dyno-correlated; "
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
) -> dict[str, Any]:
    """Promote structural to PARTIAL when a twin-bound CalculiX screen exists.

    INTENT: Make the FIA front-kit centrifugal ring screen visible without
    claiming magnet-pocket burst FEA or closed release FoS (those stay OPEN).
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
    body = _open_check(
        "structural",
        extra={
            "status": "PARTIAL",
            "load_case_set": "centrifugal_overspeed_ring_screen",
            "minimum_factor_of_safety": margins.get("screening_fos_vs_assumed_yield"),
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
                "path": rel_ref,
                "absolute_path": str((Path(twin_dir) / rel_ref).resolve()),
                "max_von_mises_mpa": screening.get("max_von_mises_mpa"),
                "max_principal_stress_mpa": screening.get("max_principal_stress_mpa"),
                "max_abs_displacement_mm": screening.get("max_abs_displacement_mm"),
                "screening_fos_vs_yield": margins.get("screening_fos_vs_assumed_yield"),
                "below_assumed_yield": margins.get("below_assumed_yield"),
                "release_fos_closed": False,
                "max_rotor_speed_rpm": inputs.get("max_rotor_speed_rpm"),
                "magnet_pocket_burst_fea": "OPEN",
                "note": (
                    "Twin-bound CalculiX steel-ring centrifugal screen at kit rpm. "
                    "Assumed isotropic steel; not magnet-pocket burst; release FoS "
                    "not closed."
                ),
            },
        },
    )
    body["status"] = "PARTIAL"
    return body


def build_motor_multiphysics(
    *,
    state: Optional[Mapping[str, Any]] = None,
    assembly_revision: str = ASSEMBLY_REVISION,
    stamped_at: Optional[str] = None,
    twin_dir: Optional[Path] = None,
) -> dict[str, Any]:
    """Build motorMultiphysics dict per plan schema.

    @description Records FIA duty + toolchain smoke pointers. Magnetic,
    rotor_dynamics, and structural may be PARTIAL when twin-bound FIA case
    artefacts exist; all_required still false.
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
    if fia_mag is not None and twin_dir is not None:
        magnetic = _magnetic_check_from_fia_case(duty, fia_mag, twin_dir=Path(twin_dir))
        notes += (
            " Magnetic check PARTIAL: twin-bound open-circuit point in "
            "_motor_stack/em_fia_front_kit_case.json (torque map / dyno still OPEN)."
        )
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
    if fia_calculix is not None and twin_dir is not None:
        structural = _structural_check_from_fia_case(
            duty, fia_calculix, twin_dir=Path(twin_dir)
        )
        notes += (
            " Structural check PARTIAL: twin-bound CalculiX rotor centrifugal "
            "screen in _motor_stack/calculix_fia_rotor_screen.json "
            "(magnet-pocket burst / release FoS still OPEN)."
        )
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

    required_checks = {
        "magnetic": magnetic,
        "rotor_dynamics": rotor_dynamics,
        "structural": structural,
        "water_jacket": _open_check(
            "water_jacket",
            extra={
                "pressure_drop_kpa": None,
                "maximum_winding_temperature_c": None,
                "fia_question": (
                    f"Does the jacket reject losses at {duty['coolant_flow_l_min']} L/min / "
                    f"{duty['coolant_inlet_c']} °C inlet without boiling or choking?"
                ),
            },
        ),
        "inverter_cold_plate": _open_check(
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
        ),
        "gear_oil": _open_check(
            "gear_oil",
            extra={
                "minimum_jet_flow_l_min": None,
                "churning_loss_w": None,
                "fia_question": "Oil jet / pickup / churning under race accel/brake/corner — OPEN",
            },
        ),
        "gear_strength": _open_check(
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
        ),
    }

    return {
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
            "Toolchain smoke ≠ PASS. ship_ok stays false."
        ),
    }


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
    return {
        "schema_version": "motor-multiphysics-sidecar/v1",
        "stamped_at": stamped,
        "assembly_revision": assembly_revision,
        "motorMultiphysics": motor,
        "cadAuthority": cad,
        "ship_ok": False,
        "all_required_solver_checks_pass": False,
    }


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
        "when a twin-bound artefact exists (magnetic open-circuit point and/or ROSS",
        "critical-speed screen) while torque map, demagnetisation, bearing identity,",
        "modal/dynamometer correlation and the other domains remain **OPEN**. `ship_ok`",
        "stays false.",
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
        "| Check | Status | Software | Toolchain smoke | Twin-bound result |",
        "|---|---|---|---|---|",
    ]
    for name, chk in (motor.get("required_checks") or {}).items():
        smoke = (chk.get("toolchain_smoke") or {}).get("evidence_class", "—")
        lines.append(
            f"| {name} | **{chk.get('status')}** | {chk.get('software')} | "
            f"`{smoke}` | `{chk.get('result_ref')}` |"
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
            "`motorMultiphysics` / `cadAuthority` when state write succeeds.",
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def prove_catch(payload: Mapping[str, Any]) -> dict[str, Any]:
    """proveCatch: stamp must stay fail-closed; twin-bound checks may be PARTIAL with result_ref.

    @description Adversarial guards for the stub / twin-bound-partial stamp.
    Magnetic, rotor_dynamics, and structural may be PARTIAL when they cite a
    twin-bound artefact result_ref; everything else stays OPEN.
    @param payload Combined stamp payload
    @returns Catch dict with ok bool
    """
    motor = payload.get("motorMultiphysics") or {}
    cad = payload.get("cadAuthority") or {}
    checks = motor.get("required_checks") or {}
    _partial_allowed = frozenset({"magnetic", "rotor_dynamics", "structural"})

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
    results["ok"] = (
        statuses_honest
        and remaining_open
        and results["ship_ok_false"]
        and results["all_required_solver_checks_pass_false"]
        and duty_ok
        and stator_ok
        and smoke_tagged
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
    """Mutate state with motorMultiphysics, cadAuthority, and fail-closed ship_ok.

    @param state Mutable state dict
    @param payload Combined stamp payload
    """
    state["motorMultiphysics"] = payload["motorMultiphysics"]
    state["cadAuthority"] = payload["cadAuthority"]
    state["ship_ok"] = False
    # Small pointer so digests / Overview can find the sidecar without re-reading
    # the whole multiphysics block if a later wipe occurs.
    state["motorMultiphysicsPointer"] = {
        "sidecar": "motor-multiphysics.json",
        "markdown": "JLR-FE-FRONT-FPK-MOTOR-MULTIPHYSICS.md",
        "assembly_revision": payload.get("assembly_revision"),
        "ship_ok": False,
        "all_required_solver_checks_pass": False,
        "stamped_at": payload.get("stamped_at"),
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
    if "toolchain_smoke_pass" not in md and "toolchain_smoke" not in md:
        print("FAIL: markdown must disclose toolchain smoke class")
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
        partial_payload = build_stamp_payload(state=fake_state, twin_dir=twin_tmp)
        mag = partial_payload["motorMultiphysics"]["required_checks"]["magnetic"]
        if mag.get("status") != "PARTIAL" or not mag.get("result_ref"):
            print("FAIL: twin-bound FIA case must mark magnetic PARTIAL with result_ref")
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
        structural = partial_payload["motorMultiphysics"]["required_checks"]["structural"]
        if structural.get("status") != "PARTIAL" or not structural.get("result_ref"):
            print(
                "FAIL: twin-bound CalculiX case must mark structural PARTIAL with result_ref"
            )
            bad += 1
        if structural.get("minimum_factor_of_safety") != 3.01:
            print("FAIL: structural must surface screening FoS from artefact")
            bad += 1
        if partial_payload["motorMultiphysics"].get("ship_ok") is True:
            print("FAIL: PARTIAL magnetic/ross/calculix must not set ship_ok")
            bad += 1
        if not prove_catch(partial_payload).get("ok"):
            print(
                "FAIL: proveCatch must accept magnetic+ross+calculix PARTIAL with result_ref"
            )
            bad += 1
        if int(partial_payload["cadAuthority"].get("parametric_family_count") or 0) < 4:
            print(
                "FAIL: expected ≥4 parametric families "
                "(stator, rotor, planetary, cold_plate)"
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
