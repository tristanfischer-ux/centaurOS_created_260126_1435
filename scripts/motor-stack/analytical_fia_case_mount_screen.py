#!/usr/bin/env python3
"""FIA-bound analytical cast-case / bay-mount SCREEN for the Formula E front kit.

Companion to ``calculix_fia_rotor_screen.py`` (rotor ring) and
``calculix_fia_magnet_pocket_screen.py`` (iron bridge).  Full cast-case
CalculiX of the integrated drive housing is too heavy for a screening
self-test path, so this case is analytical-first:

1. Motor reaction torque (~125 N·m) → flange bolt shear + thin-wall torsion.
2. Carrier output torque (~1000 N·m) → bay-mount bolt shear.
3. Mass × assumed bump → mount bolt tension.

SCREENING only — not supplier cast FEA, not fastener FEA, not fatigue, not
release FoS.  Status stays PARTIAL; ``ship_ok`` is always false.  Optional
CalculiX of the full case remains OPEN.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import ijson

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO_ROOT / "out" / "formula-e-front-mgu-20260729-1432"
SCHEMA = "forgeos.motor_stack.analytical_fia_case_mount_screen/v1"

# Match iso6336_fia_front_kit_case torque derivation (~125 N·m @ 250 kW / 19.5k).
ASSUMED_COMBINED_EFFICIENCY = 0.9777
DEFAULT_GEAR_RATIO = 8.0

# Mount / fastener screening assumptions (documented — not team drawings).
N_FLANGE_BOLTS = 6
N_BAY_MOUNTS = 4
M8_STRESS_AREA_MM2 = 36.6  # ISO 898-1 tensile stress area
BOLT_CLASS = "8.8"
BOLT_YIELD_MPA = 640.0  # ISO 898-1 property class 8.8
BOLT_SHEAR_YIELD_MPA = 0.58 * BOLT_YIELD_MPA  # Tresca-ish shear screen
BUMP_G = 5.0  # screening vertical bump / lateral accel (not FIA crash pulse)

# Cast aluminium housing screening (A356-T6 class — labelled, not certified).
AL_CAST_NAME = "FiaFrontKitScreeningCastAluminium"
AL_CAST_YIELD_MPA = 180.0
AL_WALL_THICKNESS_MM = 8.0  # assumed structural wall — not measured casting
FLANGE_BOLT_CIRCLE_FRAC = 0.90  # of housing OD
BAY_MOUNT_PITCH_FRAC = 0.55  # of min(bay_w, bay_d) → pitch radius

# Minimum screening FoS for works_in_kit_context (informational only).
SCREEN_FOS_MIN = 1.20


class FiaCaseMountScreenError(RuntimeError):
    """Raised when twin binding or case/mount screening evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this case/mount screen."""

    max_rotor_speed_rpm: float
    continuous_electrical_power_kw: float
    front_regen_electrical_cap_kw: float
    gear_ratio: float
    bay_width_mm: float
    bay_depth_mm: float
    bay_height_mm: float
    mass_aspiration_kg: float
    housing_outer_diameter_mm: float
    housing_length_mm: float
    rotor_outer_diameter_mm: float
    active_length_mm: float


@dataclass(frozen=True)
class MountGeometry:
    """Assumed flange + bay-mount layout used for screening."""

    housing_outer_radius_mm: float
    housing_inner_radius_mm: float
    wall_thickness_mm: float
    housing_length_mm: float
    flange_bolt_count: int
    flange_bolt_circle_radius_mm: float
    bay_mount_count: int
    bay_mount_pitch_radius_mm: float
    bolt_stress_area_mm2: float
    bolt_class: str
    fits_bay: bool


@dataclass(frozen=True)
class ScreenResults:
    """Analytical bolt + wall screening results vs assumed allowables."""

    motor_reaction_torque_nm: float
    carrier_output_torque_nm: float
    flange_bolt_shear_force_n: float
    flange_bolt_shear_stress_mpa: float
    flange_bolt_shear_fos: float
    bay_mount_shear_force_n: float
    bay_mount_shear_stress_mpa: float
    bay_mount_shear_fos: float
    bay_mount_tension_force_n: float
    bay_mount_tension_stress_mpa: float
    bay_mount_tension_fos: float
    housing_wall_torsion_stress_mpa: float
    housing_wall_torsion_fos: float
    assumed_bolt_shear_yield_mpa: float
    assumed_bolt_yield_mpa: float
    assumed_cast_al_yield_mpa: float
    minimum_screening_fos: float
    below_assumed_allowables: bool


def _number(
    values: Mapping[str, Any],
    keys: Sequence[str],
    *,
    default: float | None = None,
) -> float:
    """Read the first positive finite number from quantity-style mappings."""

    for key in keys:
        raw = values.get(key)
        if isinstance(raw, Mapping):
            raw = raw.get("value")
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if math.isfinite(value) and value > 0.0:
            return value
    if default is not None:
        return default
    raise FiaCaseMountScreenError(
        "Missing positive twin quantity; expected one of: " + ", ".join(keys)
    )


def inputs_from_sections(
    quantities: Mapping[str, Any],
    concentric: Mapping[str, Any],
) -> TwinInputs:
    """Build controlled case inputs from selectively read twin sections.

    INTENT: Case/mount screening must use kit housing OD/length, bay box and
    mass aspiration — never a generic smoke cantilever.
    """

    return TwinInputs(
        max_rotor_speed_rpm=_number(
            quantities,
            ("max_rotor_speed_rpm", "mgu_base_speed_rpm"),
            default=19_500.0,
        ),
        continuous_electrical_power_kw=_number(
            quantities,
            ("continuous_power_kw", "continuous_design_duty_kw"),
            default=250.0,
        ),
        front_regen_electrical_cap_kw=_number(
            quantities,
            (
                "front_regen_electrical_cap_kw",
                "front_regen_power_limit_kw",
                "front_regen_power_kw",
            ),
            default=250.0,
        ),
        gear_ratio=_number(
            quantities,
            ("gear_ratio", "fpk_gear_ratio", "trial_gear_ratio"),
            default=DEFAULT_GEAR_RATIO,
        ),
        bay_width_mm=_number(
            quantities,
            ("front_bay_envelope_w_mm", "design_envelope_width_mm"),
            default=343.0,
        ),
        bay_depth_mm=_number(
            quantities,
            ("front_bay_envelope_d_mm", "design_envelope_depth_mm"),
            default=259.0,
        ),
        bay_height_mm=_number(
            quantities,
            ("front_bay_envelope_h_mm", "design_envelope_height_mm"),
            default=267.0,
        ),
        mass_aspiration_kg=_number(
            quantities,
            ("fpk_mass_cap_kg", "mgu_mcu_mass_cap_kg", "mass_cap_kg"),
            default=32.0,
        ),
        housing_outer_diameter_mm=_number(
            concentric,
            ("housing_od_mm",),
            default=_number(quantities, ("fpk_housing_od_mm",), default=176.7),
        ),
        housing_length_mm=_number(
            concentric,
            ("housing_len_mm",),
            default=_number(quantities, ("fpk_housing_len_mm",), default=141.1),
        ),
        rotor_outer_diameter_mm=_number(
            concentric,
            ("rotor_od_mm",),
            default=_number(
                quantities,
                ("fpk_rotor_od_mm", "rotor_airgap_diameter_mm"),
                default=122.0,
            ),
        ),
        active_length_mm=_number(
            concentric,
            ("stack_len_mm",),
            default=_number(
                quantities,
                ("stack_length_mm", "active_length_mm"),
                default=97.58,
            ),
        ),
    )


def _read_section(state_path: Path, prefix: str) -> Mapping[str, Any]:
    """Read one JSON subtree without materialising the large twin state."""

    with state_path.open("rb") as handle:
        section = next(ijson.items(handle, prefix), None)
    return section if isinstance(section, Mapping) else {}


def _stream_sha256(path: Path) -> str:
    """Hash a file in bounded chunks for exact mutable-twin provenance."""

    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_twin_inputs(state_path: Path) -> tuple[TwinInputs, str]:
    """Selectively read a stable twin snapshot and return its file hash."""

    if not state_path.is_file():
        raise FiaCaseMountScreenError(f"Twin state not found: {state_path}")

    last_error = "Twin state changed during selective-read attempts"
    for attempt in range(5):
        before = state_path.stat()
        quantities = _read_section(state_path, "orchestratorContract.quantities")
        if not quantities:
            quantities = _read_section(state_path, "engineeringContract.quantities")
        concentric = _read_section(state_path, "fpkConcentricGeometry")
        source_hash = _stream_sha256(state_path)
        after = state_path.stat()
        if (
            before.st_size == after.st_size
            and before.st_mtime_ns == after.st_mtime_ns
        ):
            return inputs_from_sections(quantities, concentric), source_hash
        last_error = (
            f"Twin state changed during selective-read attempt {attempt + 1}/5 "
            f"(size {before.st_size}->{after.st_size})"
        )
        time.sleep(0.25 * (attempt + 1))
    raise FiaCaseMountScreenError(f"{last_error}; rerun on a stable stamp")


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the selected quantities that control this case."""

    payload = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def derive_motor_shaft_torque_nm(inputs: TwinInputs) -> float:
    """Shaft / stator-reaction torque for continuous electrical duty.

    INTENT: Same continuous-duty derivation as iso6336_fia_front_kit_case
    (~125 N·m at 250 kW / 19,500 rpm) so gear and case screens share one load.
    """

    omega = inputs.max_rotor_speed_rpm * 2.0 * math.pi / 60.0
    if omega <= 0.0:
        raise FiaCaseMountScreenError("max_rotor_speed_rpm must be positive")
    return (
        inputs.continuous_electrical_power_kw
        * 1000.0
        / (ASSUMED_COMBINED_EFFICIENCY * omega)
    )


def derive_mount_geometry(inputs: TwinInputs) -> MountGeometry:
    """Map twin housing / bay onto assumed flange + bay-mount layout.

    DECISION: Use housing OD for flange bolt circle and min bay plan for mount
    pitch — team interface drawings are not in-repo, so these are SCREENING
    seeds that scale with the twin envelope rather than fixed millimetres.
    """

    ro = inputs.housing_outer_diameter_mm / 2.0
    ri = ro - AL_WALL_THICKNESS_MM
    if ri <= 0.0:
        raise FiaCaseMountScreenError(
            "Assumed wall thickness exceeds housing outer radius"
        )
    flange_r = ro * FLANGE_BOLT_CIRCLE_FRAC
    bay_plan = min(inputs.bay_width_mm, inputs.bay_depth_mm)
    mount_r = (bay_plan * BAY_MOUNT_PITCH_FRAC) / 2.0
    if mount_r <= 0.0 or flange_r <= 0.0:
        raise FiaCaseMountScreenError("Mount pitch radii must be positive")
    fits = (
        inputs.housing_outer_diameter_mm < inputs.bay_width_mm
        and inputs.housing_outer_diameter_mm < inputs.bay_depth_mm
        and inputs.housing_length_mm < inputs.bay_height_mm + 1.0e-6
        and inputs.rotor_outer_diameter_mm < inputs.housing_outer_diameter_mm
    )
    return MountGeometry(
        housing_outer_radius_mm=ro,
        housing_inner_radius_mm=ri,
        wall_thickness_mm=AL_WALL_THICKNESS_MM,
        housing_length_mm=inputs.housing_length_mm,
        flange_bolt_count=N_FLANGE_BOLTS,
        flange_bolt_circle_radius_mm=round(flange_r, 4),
        bay_mount_count=N_BAY_MOUNTS,
        bay_mount_pitch_radius_mm=round(mount_r, 4),
        bolt_stress_area_mm2=M8_STRESS_AREA_MM2,
        bolt_class=BOLT_CLASS,
        fits_bay=fits,
    )


def run_screen(
    inputs: TwinInputs,
    geometry: MountGeometry,
    *,
    motor_torque_nm: float | None = None,
    gear_ratio_override: float | None = None,
) -> ScreenResults:
    """Analytical bolt shear/tension + thin-wall torsion SCREEN.

    INTENT: Answer whether assumed M8 flange / bay fasteners and an 8 mm cast
    aluminium wall stay below screening allowables under kit motor and carrier
    torques — without claiming closed cast or fastener FEA.
    """

    t_motor = (
        float(motor_torque_nm)
        if motor_torque_nm is not None
        else derive_motor_shaft_torque_nm(inputs)
    )
    if t_motor <= 0.0:
        raise FiaCaseMountScreenError("motor reaction torque must be positive")
    ratio = (
        float(gear_ratio_override)
        if gear_ratio_override is not None
        else inputs.gear_ratio
    )
    if ratio <= 0.0:
        raise FiaCaseMountScreenError("gear_ratio must be positive")
    t_carrier = t_motor * ratio

    # Flange bolts take motor reaction as pure tangential shear (equal share).
    flange_r_m = geometry.flange_bolt_circle_radius_mm / 1000.0
    f_flange = t_motor / (geometry.flange_bolt_count * flange_r_m)
    tau_flange = f_flange / geometry.bolt_stress_area_mm2  # N/mm² = MPa
    fos_flange = BOLT_SHEAR_YIELD_MPA / tau_flange if tau_flange > 0.0 else float("inf")

    # Bay mounts take carrier output as pure tangential shear (equal share).
    mount_r_m = geometry.bay_mount_pitch_radius_mm / 1000.0
    f_mount_shear = t_carrier / (geometry.bay_mount_count * mount_r_m)
    tau_mount = f_mount_shear / geometry.bolt_stress_area_mm2
    fos_mount_shear = (
        BOLT_SHEAR_YIELD_MPA / tau_mount if tau_mount > 0.0 else float("inf")
    )

    # Tension from mass × bump-g shared equally across bay mounts.
    f_tension = (inputs.mass_aspiration_kg * BUMP_G * 9.80665) / geometry.bay_mount_count
    sigma_tension = f_tension / geometry.bolt_stress_area_mm2
    fos_tension = (
        BOLT_YIELD_MPA / sigma_tension if sigma_tension > 0.0 else float("inf")
    )

    # Thin closed-cylinder torsion under motor reaction (stator→case).
    # τ = T / (2 π r_mean² t)  — Bredt / thin-wall membrane estimate.
    r_mean_m = (
        (geometry.housing_outer_radius_mm + geometry.housing_inner_radius_mm)
        / 2.0
        / 1000.0
    )
    t_m = geometry.wall_thickness_mm / 1000.0
    if r_mean_m <= 0.0 or t_m <= 0.0:
        raise FiaCaseMountScreenError("housing wall geometry invalid for torsion")
    tau_wall_pa = t_motor / (2.0 * math.pi * r_mean_m * r_mean_m * t_m)
    tau_wall_mpa = tau_wall_pa / 1.0e6
    fos_wall = (
        AL_CAST_YIELD_MPA / tau_wall_mpa if tau_wall_mpa > 0.0 else float("inf")
    )

    min_fos = min(fos_flange, fos_mount_shear, fos_tension, fos_wall)
    below = min_fos >= SCREEN_FOS_MIN

    return ScreenResults(
        motor_reaction_torque_nm=round(t_motor, 4),
        carrier_output_torque_nm=round(t_carrier, 4),
        flange_bolt_shear_force_n=round(f_flange, 3),
        flange_bolt_shear_stress_mpa=round(tau_flange, 4),
        flange_bolt_shear_fos=round(fos_flange, 3),
        bay_mount_shear_force_n=round(f_mount_shear, 3),
        bay_mount_shear_stress_mpa=round(tau_mount, 4),
        bay_mount_shear_fos=round(fos_mount_shear, 3),
        bay_mount_tension_force_n=round(f_tension, 3),
        bay_mount_tension_stress_mpa=round(sigma_tension, 4),
        bay_mount_tension_fos=round(fos_tension, 3),
        housing_wall_torsion_stress_mpa=round(tau_wall_mpa, 4),
        housing_wall_torsion_fos=round(fos_wall, 3),
        assumed_bolt_shear_yield_mpa=round(BOLT_SHEAR_YIELD_MPA, 3),
        assumed_bolt_yield_mpa=BOLT_YIELD_MPA,
        assumed_cast_al_yield_mpa=AL_CAST_YIELD_MPA,
        minimum_screening_fos=round(min_fos, 3),
        below_assumed_allowables=below,
    )


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: MountGeometry,
    results: ScreenResults,
    source_state_sha256: str,
    source_twin: str,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release case/mount screen artefact."""

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "mount_geometry": asdict(geometry),
        "screening_results": asdict(results),
        "margins": {
            "flange_bolt_shear_fos": results.flange_bolt_shear_fos,
            "bay_mount_shear_fos": results.bay_mount_shear_fos,
            "bay_mount_tension_fos": results.bay_mount_tension_fos,
            "housing_wall_torsion_fos": results.housing_wall_torsion_fos,
            "minimum_screening_fos": results.minimum_screening_fos,
            "below_assumed_allowables": results.below_assumed_allowables,
            "screen_fos_min": SCREEN_FOS_MIN,
            "release_fos_closed": False,
            "note": (
                "SCREENING only against assumed ISO 898-1 class 8.8 bolt "
                f"allowables and {AL_CAST_YIELD_MPA:.0f} MPa cast-Al yield. "
                "Equal-share bolt shear, thin-wall Bredt torsion, "
                f"{BUMP_G:.0f} g mass tension. Not supplier cast FEA, not "
                "fastener FEA, not fatigue. Never claim release FoS."
            ),
        },
        "solver": {
            "name": "Analytical handbook screen",
            "version": "v1",
            "runtime": "analytical",
            "calculix_full_case": {
                "status": "OPEN",
                "reason": (
                    "Full cast-case / mount CalculiX mesh is deferred — too heavy "
                    "for the screening self-test path; analytical bolt + wall "
                    "screens are the PARTIAL evidence here."
                ),
            },
        },
        "material_assumptions": {
            "bolt_class": BOLT_CLASS,
            "bolt_yield_mpa": BOLT_YIELD_MPA,
            "bolt_shear_yield_mpa": BOLT_SHEAR_YIELD_MPA,
            "bolt_stress_area_mm2": M8_STRESS_AREA_MM2,
            "cast_aluminium_name": AL_CAST_NAME,
            "cast_aluminium_yield_mpa": AL_CAST_YIELD_MPA,
            "assumed_wall_thickness_mm": AL_WALL_THICKNESS_MM,
            "bump_g": BUMP_G,
            "label": (
                "Assumed M8 class 8.8 fasteners + A356-T6-class cast aluminium "
                "screening allowables — not supplier melt / heat-treat / fastener "
                "certificates."
            ),
        },
        "model_assumptions": [
            (
                "Motor reaction torque = continuous electrical power / "
                f"(η={ASSUMED_COMBINED_EFFICIENCY} × ω) — same seed as "
                "iso6336_fia_front_kit_case (~125 N·m)."
            ),
            (
                "Carrier output torque = motor torque × gear_ratio "
                f"(default {DEFAULT_GEAR_RATIO:.0f} → ~1000 N·m)."
            ),
            (
                f"{N_FLANGE_BOLTS} flange bolts on a circle at "
                f"{FLANGE_BOLT_CIRCLE_FRAC:.0%} of housing OD; equal-share "
                "tangential shear from motor reaction."
            ),
            (
                f"{N_BAY_MOUNTS} bay mounts on a pitch circle at "
                f"{BAY_MOUNT_PITCH_FRAC:.0%} of min(bay_w, bay_d); equal-share "
                "tangential shear from carrier output."
            ),
            (
                f"Bay-mount tension from mass_aspiration × {BUMP_G:.0f} g / "
                f"{N_BAY_MOUNTS} mounts (not a homologated crash pulse)."
            ),
            (
                f"Housing wall torsion: thin closed cylinder τ = T / (2π r² t) "
                f"with assumed t = {AL_WALL_THICKNESS_MM:.0f} mm cast Al."
            ),
            "No ribbing, boss local stress, thread strip, preload, or fatigue.",
            "Full cast-case CalculiX remains OPEN (mesh of whole housing deferred).",
        ],
        "geometry_provenance": {
            "controlling_dimensions": (
                "state.fpkConcentricGeometry housing OD/length with "
                "orchestratorContract bay / mass / power / rpm fallbacks"
            ),
            "smoke_cantilever_used": False,
            "lucid_or_proprietary_cad_used": False,
            "full_case_calculix_used": False,
            "statement": (
                "Kit-sized analytical flange + bay-mount + thin-wall torsion "
                "screen from twin housing / bay / duty; not the CalculiX smoke "
                "cantilever and not a supplier cast mesh."
            ),
        },
        "fia_question": (
            f"Do the cast case wall and bay mounts survive motor reaction "
            f"~{results.motor_reaction_torque_nm:.0f} N·m and carrier output "
            f"~{results.carrier_output_torque_nm:.0f} N·m inside the "
            f"{inputs.bay_width_mm:.0f}×{inputs.bay_depth_mm:.0f}×"
            f"{inputs.bay_height_mm:.0f} mm / {inputs.mass_aspiration_kg:.0f} kg "
            "box as a SCREENING check?"
        ),
        "works_in_kit_context": {
            "case_mount_screen_ok": results.below_assumed_allowables,
            "fits_bay": geometry.fits_bay,
            "minimum_screening_fos": results.minimum_screening_fos,
        },
        "release_fos": {
            "status": "OPEN",
            "statement": (
                "Screening FoS vs assumed bolt / cast-Al allowables is "
                "informational. Release factor of safety requires supplier "
                "cast FEA, fastener drawings, preload procedure, and correlated "
                "loads — not closed here."
            ),
        },
        "release_statement": (
            "Concept evidence only. No FIA homologation, team interface closure, "
            "race evidence or permission to ship. Never claim PASS or closed "
            "release FoS from this screening case."
        ),
    }


def _atomic_write_json(path: Path, payload: Mapping[str, Any]) -> None:
    """Atomically write an artefact without exposing a partial JSON file."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _synthetic_sections() -> tuple[dict[str, Any], dict[str, Any]]:
    """FIA table quantities for --selftest (no live twin required)."""

    quantities = {
        "continuous_power_kw": {"value": 250.0, "unit": "kW"},
        "front_regen_electrical_cap_kw": {"value": 250.0, "unit": "kW"},
        "max_rotor_speed_rpm": {"value": 19_500.0, "unit": "rpm"},
        "gear_ratio": {"value": 8.0, "unit": "-"},
        "front_bay_envelope_w_mm": {"value": 343.0, "unit": "mm"},
        "front_bay_envelope_d_mm": {"value": 259.0, "unit": "mm"},
        "front_bay_envelope_h_mm": {"value": 267.0, "unit": "mm"},
        "fpk_mass_cap_kg": {"value": 32.0, "unit": "kg"},
        "fpk_rotor_od_mm": {"value": 122.0, "unit": "mm"},
        "stack_length_mm": {"value": 98.0, "unit": "mm"},
    }
    concentric = {
        "housing_od_mm": 176.7,
        "housing_len_mm": 141.1,
        "rotor_od_mm": 122.0,
        "stack_len_mm": 98.0,
    }
    return quantities, concentric


def run_selftest() -> int:
    """Prove twin binding, analytical FoS, and 10×-torque proveCatch."""

    quantities, concentric = _synthetic_sections()
    inputs = inputs_from_sections(quantities, concentric)
    geometry = derive_mount_geometry(inputs)
    torque = derive_motor_shaft_torque_nm(inputs)
    results = run_screen(inputs, geometry, motor_torque_nm=torque)
    # proveCatch: 10× torque must drop FoS ~10× — canned margins cannot pass both.
    hot = run_screen(inputs, geometry, motor_torque_nm=torque * 10.0)
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        results=results,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
    )
    checks = {
        "synthetic_quantities_control_geometry": (
            abs(geometry.housing_outer_radius_mm - 88.35) < 1.0e-9
            and geometry.flange_bolt_count == N_FLANGE_BOLTS
            and geometry.bay_mount_count == N_BAY_MOUNTS
            and geometry.wall_thickness_mm == AL_WALL_THICKNESS_MM
        ),
        "geometry_fits_bay": geometry.fits_bay,
        "motor_torque_near_125nm": 120.0 <= torque <= 130.0,
        "carrier_torque_near_1000nm": 960.0 <= results.carrier_output_torque_nm <= 1040.0,
        "stresses_positive_finite": (
            results.flange_bolt_shear_stress_mpa > 0.0
            and results.bay_mount_shear_stress_mpa > 0.0
            and results.bay_mount_tension_stress_mpa > 0.0
            and results.housing_wall_torsion_stress_mpa > 0.0
            and math.isfinite(results.minimum_screening_fos)
        ),
        "stress_in_physical_screening_band": (
            0.1 < results.flange_bolt_shear_stress_mpa < 500.0
            and 0.1 < results.bay_mount_shear_stress_mpa < 500.0
            and 0.01 < results.housing_wall_torsion_stress_mpa < 200.0
        ),
        # Linear torque scaling: 10× T → ~10× stress → FoS drops by ~10×.
        "torque_hardening_proves_catch": (
            hot.flange_bolt_shear_stress_mpa
            > 9.0 * results.flange_bolt_shear_stress_mpa
            and hot.bay_mount_shear_stress_mpa
            > 9.0 * results.bay_mount_shear_stress_mpa
            and hot.housing_wall_torsion_stress_mpa
            > 9.0 * results.housing_wall_torsion_stress_mpa
            and hot.minimum_screening_fos < results.minimum_screening_fos / 5.0
        ),
        "operating_band_is_19500": inputs.max_rotor_speed_rpm == 19_500.0,
        "release_honesty": (
            artifact["status"] in {"OPEN", "PARTIAL"}
            and artifact["ship_ok"] is False
            and artifact["margins"]["release_fos_closed"] is False
            and artifact["release_fos"]["status"] == "OPEN"
            and artifact["solver"]["calculix_full_case"]["status"] == "OPEN"
        ),
        "never_ship_ok_true": artifact["ship_ok"] is False,
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "geometry": asdict(geometry),
                "screening_results": asdict(results),
                "ten_x_torque_min_fos": hot.minimum_screening_fos,
                "ship_ok": artifact["ship_ok"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist one case/mount screen against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    geometry = derive_mount_geometry(inputs)
    if not geometry.fits_bay:
        raise FiaCaseMountScreenError(
            "Twin-controlled housing does not fit its bay envelope for the screen"
        )
    torque = derive_motor_shaft_torque_nm(inputs)
    results = run_screen(inputs, geometry, motor_torque_nm=torque)
    if not (
        0.01 < results.housing_wall_torsion_stress_mpa < 500.0
        and 0.1 < results.bay_mount_shear_stress_mpa < 2000.0
        and math.isfinite(results.minimum_screening_fos)
    ):
        raise FiaCaseMountScreenError(
            "Screened stress is outside the screening plausibility envelope"
        )
    try:
        twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
    except ValueError:
        twin_label = str(twin_dir.resolve())
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        results=results,
        source_state_sha256=state_hash,
        source_twin=twin_label,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / "analytical_fia_case_mount_screen.json"
    )
    _atomic_write_json(destination, artifact)
    ok_word = "OK" if results.below_assumed_allowables else "BELOW floor"
    print(
        "FIA front-kit cast-case / bay-mount analytical screen: "
        f"T_motor ≈ {results.motor_reaction_torque_nm:.1f} N·m → "
        f"T_carrier ≈ {results.carrier_output_torque_nm:.1f} N·m. "
        f"Flange shear FoS ×{results.flange_bolt_shear_fos:.2f}, "
        f"bay shear FoS ×{results.bay_mount_shear_fos:.2f}, "
        f"bay tension FoS ×{results.bay_mount_tension_fos:.2f}, "
        f"wall torsion FoS ×{results.housing_wall_torsion_fos:.2f} "
        f"(min ×{results.minimum_screening_fos:.2f} vs floor "
        f"{SCREEN_FOS_MIN:.2f} — {ok_word}). "
        f"Housing Ø{inputs.housing_outer_diameter_mm:.1f}×"
        f"{inputs.housing_length_mm:.1f} mm in "
        f"{inputs.bay_width_mm:.0f}×{inputs.bay_depth_mm:.0f}×"
        f"{inputs.bay_height_mm:.0f} mm bay / {inputs.mass_aspiration_kg:.0f} kg. "
        "Full-case CalculiX remains OPEN; release FoS remains OPEN; "
        "ship_ok is false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description=(
            "Solve the FIA-bound Formula E front-kit analytical cast-case / "
            "bay-mount screening case (CalculiX full-case OPEN)."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic binding plus 10×-torque proveCatch",
    )
    mode.add_argument(
        "--twin",
        type=Path,
        help=f"live twin directory (expected default: {DEFAULT_TWIN})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="optional artefact path; defaults under the twin _motor_stack directory",
    )
    args = parser.parse_args()
    if args.selftest:
        if args.output is not None:
            parser.error("--output is only valid with --twin")
        return run_selftest()
    return run_live_case(args.twin.resolve(), args.output)


if __name__ == "__main__":
    raise SystemExit(main())
