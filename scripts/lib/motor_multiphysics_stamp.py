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
        "paths": ["scripts/motor-stack/ross_rotor_selftest.py"],
        "versions": {"ross": "2.3.0"},
        "last_known_green": "2026-07-30 — 1 m steel shaft beam model critical speed (generic)",
        "evidence_class": "toolchain_smoke_pass",
    },
    "structural": {
        "software": "Gmsh + CalculiX",
        "paths": [
            "scripts/motor-stack/calculix_smoke_selftest.sh",
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
# Only ipmsm_stator_lamination is a seeded parametric family today.
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
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": "ipmsm_rotor_magnet_carrier",
        "notes": "Family planned (educational CAD plan); Blender magnet blocks only today",
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
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Visual tooth cues / seed counts — ratio strength OPEN",
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
        "authority_level": "communication_only",
        "source_type": "blender_compound",
        "cad_family": None,
        "notes": "Analytical channel seed — CFD OPEN",
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


def build_motor_multiphysics(
    *,
    state: Optional[Mapping[str, Any]] = None,
    assembly_revision: str = ASSEMBLY_REVISION,
    stamped_at: Optional[str] = None,
) -> dict[str, Any]:
    """Build motorMultiphysics dict per plan schema — all checks OPEN.

    @description Records FIA duty + toolchain smoke pointers; never sets ship_ok.
    @param state Optional twin state for quantity readback
    @param assembly_revision Shared CAD/solver/Blender revision label
    @param stamped_at ISO timestamp override
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

    required_checks = {
        "magnetic": _open_check(
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
        ),
        "rotor_dynamics": _open_check(
            "rotor_dynamics",
            extra={
                "critical_speed_margin": None,
                "bearing_reaction_ref": None,
                "fia_question": (
                    f"Are critical speeds clear of the {duty['max_rotor_speed_rpm']} rpm "
                    "operating band with margin?"
                ),
            },
        ),
        "structural": _open_check(
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
        ),
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
) -> dict[str, Any]:
    """Combine motorMultiphysics + cadAuthority into one sidecar payload.

    @description Single artefact Excel / overview can read without the huge state.
    @param state Optional twin state
    @param assembly_revision Shared revision
    @returns Combined payload
    """
    stamped = _iso_now()
    motor = build_motor_multiphysics(
        state=state, assembly_revision=assembly_revision, stamped_at=stamped
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
        "OpenFOAM). Those smokes use **generic** training geometry — they are **not**",
        "revision-matched solves of this Formula E front powertrain kit. Every required",
        "check below stays **OPEN** until a twin-bound result file, geometry revision,",
        "input hash and acceptance limit exist.",
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
            f"(stator lamination family only)",
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
    """proveCatch: smokes-only stamp must keep every check OPEN and ship_ok false.

    @description Adversarial guards for the stub stamp.
    @param payload Combined stamp payload
    @returns Catch dict with ok bool
    """
    motor = payload.get("motorMultiphysics") or {}
    cad = payload.get("cadAuthority") or {}
    checks = motor.get("required_checks") or {}
    all_open = bool(checks) and all(
        isinstance(c, Mapping) and c.get("status") == "OPEN" for c in checks.values()
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
    smoke_tagged = all(
        ((c.get("toolchain_smoke") or {}).get("evidence_class") == "toolchain_smoke_pass")
        for c in checks.values()
        if isinstance(c, Mapping)
    )
    results = {
        "all_required_checks_open": all_open,
        "ship_ok_false": motor.get("ship_ok") is False and payload.get("ship_ok") is False,
        "all_required_solver_checks_pass_false": (
            motor.get("all_required_solver_checks_pass") is False
        ),
        "fia_duty_fields_present": duty_ok,
        "stator_parametric_family_listed": stator_ok,
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
        all_open
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

    if bad:
        print(f"selftest FAIL ({bad})")
        return 1
    print(
        json.dumps(
            {
                "ok": True,
                "checks": list((payload["motorMultiphysics"]["required_checks"]).keys()),
                "principal_components": payload["cadAuthority"]["principal_components_total"],
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
