#!/usr/bin/env python3
"""FIA-bound ROSS rotor-dynamics case for the Formula E front kit twin.

This is deliberately separate from ``ross_rotor_selftest.py``.  The smoke test
proves ROSS on a generic 1 m shaft.  This case reads the Formula E twin,
builds a kit-sized shaft + laminated-rotor disk + two-bearing beam model from
housing/rotor dimensions, and asks ROSS for the first damped critical speeds
relative to the ~19,500 rpm operating band.

The beam model does not close gyroscopic maps, bearing supplier identity,
unbalance response, or dynamometer / modal correlation.  Status stays PARTIAL
(or OPEN if the solve fails honestly); ``ship_ok`` is always false.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import time
import warnings
from dataclasses import asdict, dataclass
from importlib.metadata import version
from pathlib import Path
from typing import Any, Mapping, Sequence

import ijson

# GOTCHA: ROSS imports a compressor package that probes for the optional,
# proprietary REFPROP library. Rotor dynamics does not use it.
os.environ.setdefault("RPPREFIX", "/tmp/forgeos-no-refprop-é")
warnings.filterwarnings("ignore", message="Unable to set REFPROP path.*")
warnings.filterwarnings("ignore", category=UserWarning, module=r"ccp(\..*)?")

import ross as rs


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO_ROOT / "out" / "formula-e-front-mgu-20260729-1432"
SCHEMA = "forgeos.motor_stack.ross_fia_front_kit_case/v1"
SHAFT_ELEMENTS = 6
# Assumed ceramic-hybrid angular-contact stiffness / light viscous damping.
# Team bearing catalogue + measured support stiffness replace these seeds.
ASSUMED_BEARING_KXX_N_M = 5.0e7
ASSUMED_BEARING_CXX_N_S_M = 5.0e3
# Subcritical screening: first critical should sit above max speed × this factor.
# Supercritical passage and squeeze-film dampers are out of scope for this case.
SUBCRITICAL_MARGIN_FACTOR = 1.20
# Steel shaft / rotor carrier screening properties (not supplier laminate stack).
STEEL_RHO_KG_M3 = 7_810.0
STEEL_E_PA = 211.0e9
STEEL_G_PA = 81.2e9


class FiaFrontKitRossError(RuntimeError):
    """Raised when twin binding or rotor-dynamics evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this rotor-dynamics case."""

    max_rotor_speed_rpm: float
    continuous_electrical_power_kw: float
    front_regen_electrical_cap_kw: float
    bay_width_mm: float
    bay_depth_mm: float
    bay_height_mm: float
    mass_aspiration_kg: float
    housing_outer_diameter_mm: float
    housing_length_mm: float
    rotor_outer_diameter_mm: float
    rotor_inner_diameter_mm: float
    active_length_mm: float
    shaft_outer_diameter_mm: float
    bearing_span_mm: float


@dataclass(frozen=True)
class RotorModelGeometry:
    """Dimensions of the simplified ROSS beam + disk + bearing model."""

    shaft_length_m: float
    shaft_outer_diameter_m: float
    shaft_element_count: int
    disk_outer_diameter_m: float
    disk_inner_diameter_m: float
    disk_width_m: float
    disk_node: int
    bearing_nodes: tuple[int, int]
    bearing_kxx_n_m: float
    bearing_cxx_n_s_m: float
    material_name: str
    fits_housing_length: bool
    fits_bay: bool


@dataclass(frozen=True)
class CriticalSpeedResult:
    """First few damped critical speeds and margin vs operating band."""

    operating_speed_rpm: float
    critical_speeds_rpm: list[float]
    first_critical_speed_rpm: float
    first_critical_speed_hz: float
    first_critical_speed_rad_s: float
    margin_ratio_first_over_operating: float
    subcritical_margin_factor_required: float
    clear_of_operating_band: bool
    operating_regime: str


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
    raise FiaFrontKitRossError(
        "Missing positive twin quantity; expected one of: " + ", ".join(keys)
    )


def _number_from_sections(
    preferred: Mapping[str, Any],
    preferred_keys: Sequence[str],
    fallback: Mapping[str, Any],
    fallback_keys: Sequence[str],
    *,
    default: float | None = None,
) -> float:
    """Read a preferred section and evaluate its fallback only on a miss."""

    try:
        return _number(preferred, preferred_keys)
    except FiaFrontKitRossError:
        return _number(fallback, fallback_keys, default=default)


def inputs_from_sections(
    quantities: Mapping[str, Any],
    concentric: Mapping[str, Any],
) -> TwinInputs:
    """Build controlled case inputs from selectively read twin sections.

    INTENT: Rotor dynamics must answer whether critical speeds clear the
    ~19,500 rpm band inside the kit bay.  Controlling lengths and diameters
    come from the twin — never from the generic 1 m smoke shaft.
    """

    rotor_id_mm = _number_from_sections(
        concentric,
        ("rotor_id_mm",),
        quantities,
        ("fpk_rotor_id_mm",),
        default=92.7,
    )
    housing_len_mm = _number(
        concentric,
        ("housing_len_mm",),
        default=_number(quantities, ("fpk_housing_len_mm",), default=141.1),
    )
    active_length_mm = _number_from_sections(
        concentric,
        ("stack_len_mm",),
        quantities,
        ("stack_length_mm", "active_length_mm"),
        default=97.58,
    )
    # DECISION: Shaft OD defaults to the rotor bore (press-fit carrier ID).
    # Bearing span defaults to housing length (end-bell seats). Both are
    # screening seeds until a signed shaft/bearing drawing replaces them.
    shaft_od_mm = _number(
        quantities,
        ("fpk_shaft_od_mm", "shaft_od_mm"),
        default=rotor_id_mm,
    )
    bearing_span_mm = _number(
        quantities,
        ("fpk_bearing_span_mm", "bearing_span_mm"),
        default=housing_len_mm,
    )
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
        housing_length_mm=housing_len_mm,
        rotor_outer_diameter_mm=_number_from_sections(
            concentric,
            ("rotor_od_mm",),
            quantities,
            ("fpk_rotor_od_mm", "rotor_airgap_diameter_mm"),
            default=122.0,
        ),
        rotor_inner_diameter_mm=rotor_id_mm,
        active_length_mm=active_length_mm,
        shaft_outer_diameter_mm=shaft_od_mm,
        bearing_span_mm=bearing_span_mm,
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
        raise FiaFrontKitRossError(f"Twin state not found: {state_path}")

    # GOTCHA: The autonomous twin can be rewritten while this script runs.
    # Retry with a short pause unless size and nanosecond mtime remain stable
    # across all selective reads and the streaming provenance hash.
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
    raise FiaFrontKitRossError(f"{last_error}; rerun on a stable stamp")


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the selected quantities that control this case."""

    payload = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def derive_rotor_model(inputs: TwinInputs) -> RotorModelGeometry:
    """Map twin dimensions onto a simplified ROSS beam model.

    Assumptions (documented in the artefact; replace with signed drawings):
    - Solid steel shaft OD = rotor bore (or explicit shaft OD quantity).
    - Bearing span = housing length (end-bell seats).
    - One equivalent disk at midspan representing laminated rotor + magnets
      as a steel cylinder of stack length × (rotor OD − shaft OD).
    - Two identical isotropic bearings at the span ends (assumed k/c).
    - No gearstage overhang, resolver stub, or differential side-shafts.
    """

    shaft_length_m = inputs.bearing_span_mm / 1000.0
    shaft_od_m = inputs.shaft_outer_diameter_mm / 1000.0
    disk_od_m = inputs.rotor_outer_diameter_mm / 1000.0
    disk_id_m = shaft_od_m
    disk_width_m = inputs.active_length_mm / 1000.0
    if disk_od_m <= disk_id_m:
        raise FiaFrontKitRossError(
            "Rotor outer diameter must exceed shaft/bore diameter for the disk model"
        )
    if shaft_length_m <= disk_width_m * 0.5:
        raise FiaFrontKitRossError(
            "Bearing span is too short relative to active stack for a beam model"
        )
    disk_node = SHAFT_ELEMENTS // 2
    fits_housing = inputs.active_length_mm <= inputs.housing_length_mm + 1.0e-6
    fits_bay = (
        inputs.housing_length_mm <= inputs.bay_width_mm
        and inputs.housing_outer_diameter_mm
        <= min(inputs.bay_depth_mm, inputs.bay_height_mm)
    )
    return RotorModelGeometry(
        shaft_length_m=shaft_length_m,
        shaft_outer_diameter_m=shaft_od_m,
        shaft_element_count=SHAFT_ELEMENTS,
        disk_outer_diameter_m=disk_od_m,
        disk_inner_diameter_m=disk_id_m,
        disk_width_m=disk_width_m,
        disk_node=disk_node,
        bearing_nodes=(0, SHAFT_ELEMENTS),
        bearing_kxx_n_m=ASSUMED_BEARING_KXX_N_M,
        bearing_cxx_n_s_m=ASSUMED_BEARING_CXX_N_S_M,
        material_name="FiaFrontKitScreeningSteel",
        fits_housing_length=fits_housing,
        fits_bay=fits_bay,
    )


def build_ross_rotor(geometry: RotorModelGeometry) -> Any:
    """Assemble the ROSS Rotor object from kit-sized geometry."""

    steel = rs.Material(
        name=geometry.material_name,
        rho=STEEL_RHO_KG_M3,
        E=STEEL_E_PA,
        G_s=STEEL_G_PA,
    )
    element_length = geometry.shaft_length_m / float(geometry.shaft_element_count)
    shaft_elements = [
        rs.ShaftElement(
            L=element_length,
            idl=0.0,
            odl=geometry.shaft_outer_diameter_m,
            material=steel,
        )
        for _ in range(geometry.shaft_element_count)
    ]
    disk = rs.DiskElement.from_geometry(
        n=geometry.disk_node,
        material=steel,
        width=geometry.disk_width_m,
        i_d=geometry.disk_inner_diameter_m,
        o_d=geometry.disk_outer_diameter_m,
    )
    bearings = [
        rs.BearingElement(
            n=node,
            kxx=geometry.bearing_kxx_n_m,
            cxx=geometry.bearing_cxx_n_s_m,
        )
        for node in geometry.bearing_nodes
    ]
    return rs.Rotor(shaft_elements, [disk], bearings)


def run_critical_speeds(
    rotor: Any,
    *,
    operating_speed_rpm: float,
    num_modes: int = 8,
) -> CriticalSpeedResult:
    """Solve damped critical speeds and score margin vs the FIA speed band."""

    critical = rotor.run_critical_speed(num_modes=num_modes)
    wd = [float(value) for value in critical.wd()]
    if not wd or not all(math.isfinite(value) and value > 0.0 for value in wd):
        raise FiaFrontKitRossError("ROSS returned non-finite or empty critical speeds")
    rpm_list = [(rad_s / (2.0 * math.pi)) * 60.0 for rad_s in wd]
    first_rad_s = wd[0]
    first_hz = first_rad_s / (2.0 * math.pi)
    first_rpm = rpm_list[0]
    margin = first_rpm / operating_speed_rpm
    clear = margin >= SUBCRITICAL_MARGIN_FACTOR
    regime = "subcritical_screening" if clear else "operating_near_or_above_first_critical"
    return CriticalSpeedResult(
        operating_speed_rpm=operating_speed_rpm,
        critical_speeds_rpm=[round(v, 3) for v in rpm_list],
        first_critical_speed_rpm=round(first_rpm, 3),
        first_critical_speed_hz=round(first_hz, 6),
        first_critical_speed_rad_s=round(first_rad_s, 6),
        margin_ratio_first_over_operating=round(margin, 4),
        subcritical_margin_factor_required=SUBCRITICAL_MARGIN_FACTOR,
        clear_of_operating_band=clear,
        operating_regime=regime,
    )


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: RotorModelGeometry,
    speeds: CriticalSpeedResult,
    source_state_sha256: str,
    source_twin: str,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release rotor-dynamics artefact."""

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "rotor_model": asdict(geometry),
        "critical_speeds": asdict(speeds),
        "margins": {
            "first_critical_over_operating": speeds.margin_ratio_first_over_operating,
            "required_subcritical_factor": SUBCRITICAL_MARGIN_FACTOR,
            "clear_of_operating_band": speeds.clear_of_operating_band,
            "note": (
                "Screening margin only — assumed bearing stiffness/damping and "
                "steel equivalent disk. Not a supplier Campbell diagram."
            ),
        },
        "solver": {
            "name": "ROSS",
            "package": "ross-rotordynamics",
            "version": version("ross-rotordynamics"),
        },
        "model_assumptions": [
            "Solid steel shaft OD equals rotor bore (or fpk_shaft_od_mm when present).",
            "Bearing span equals housing length (or fpk_bearing_span_mm when present).",
            f"{SHAFT_ELEMENTS} equal beam elements span the bearings.",
            "One midspan DiskElement approximates laminated rotor + magnets as steel.",
            f"Bearing kxx={ASSUMED_BEARING_KXX_N_M:.3e} N/m, "
            f"cxx={ASSUMED_BEARING_CXX_N_S_M:.3e} N·s/m (isotropic, identical ends).",
            "No gear overhang, resolver stub, differential shafts, or housing flexibility.",
            "No gyroscopic speed sweep / unbalance response / squeeze-film dampers.",
        ],
        "geometry_provenance": {
            "controlling_dimensions": (
                "state.fpkConcentricGeometry with orchestratorContract quantity fallbacks"
            ),
            "generic_1m_smoke_shaft_used": False,
            "lucid_or_proprietary_cad_used": False,
            "statement": (
                "Kit-sized ROSS beam model from twin housing/rotor dimensions; "
                "not the generic ross_rotor_selftest 1 m shaft."
            ),
        },
        "fia_question": (
            f"Are critical speeds clear of the {inputs.max_rotor_speed_rpm:,.0f} rpm "
            "operating band with margin?"
        ),
        "bearing_supplier_identity": {
            "status": "OPEN",
            "reason": "Assumed isotropic stiffness/damping; no catalogue part.",
        },
        "modal_or_dynamometer_correlation": {
            "status": "OPEN",
            "statement": (
                "Critical-speed prediction still requires modal test and/or "
                "dynamometer coast-down correlation on the current hardware revision."
            ),
        },
        "release_statement": (
            "Concept evidence only. No FIA homologation, team interface closure, "
            "race evidence or permission to ship. Never claim PASS without dyno "
            "or modal correlation."
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
        "front_bay_envelope_w_mm": {"value": 343.0, "unit": "mm"},
        "front_bay_envelope_d_mm": {"value": 259.0, "unit": "mm"},
        "front_bay_envelope_h_mm": {"value": 267.0, "unit": "mm"},
        "fpk_mass_cap_kg": {"value": 32.0, "unit": "kg"},
        "fpk_rotor_od_mm": {"value": 122.0, "unit": "mm"},
        "fpk_rotor_id_mm": {"value": 92.7, "unit": "mm"},
        "stack_length_mm": {"value": 98.0, "unit": "mm"},
    }
    concentric = {
        "housing_od_mm": 176.7,
        "housing_len_mm": 141.1,
        "rotor_od_mm": 122.0,
        "rotor_id_mm": 92.7,
        "stack_len_mm": 98.0,
    }
    return quantities, concentric


def run_selftest() -> int:
    """Prove twin binding, a real ROSS eigen solve, and release honesty."""

    quantities, concentric = _synthetic_sections()
    inputs = inputs_from_sections(quantities, concentric)
    geometry = derive_rotor_model(inputs)
    rotor = build_ross_rotor(geometry)
    speeds = run_critical_speeds(rotor, operating_speed_rpm=inputs.max_rotor_speed_rpm)
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        speeds=speeds,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
    )

    # proveCatch: a much longer / slender shaft must drop the first critical.
    soft_inputs = TwinInputs(
        **{
            **asdict(inputs),
            "bearing_span_mm": inputs.bearing_span_mm * 4.0,
            "housing_length_mm": inputs.housing_length_mm * 4.0,
        }
    )
    soft_geometry = derive_rotor_model(soft_inputs)
    soft_speeds = run_critical_speeds(
        build_ross_rotor(soft_geometry),
        operating_speed_rpm=inputs.max_rotor_speed_rpm,
    )

    checks = {
        "synthetic_quantities_control_geometry": (
            geometry.disk_outer_diameter_m == 0.122
            and abs(geometry.shaft_length_m - 0.1411) < 1.0e-9
            and abs(geometry.disk_width_m - 0.098) < 1.0e-9
            and abs(geometry.shaft_length_m - 1.0) > 0.5
        ),
        "geometry_fits_twin_box": geometry.fits_housing_length and geometry.fits_bay,
        "critical_speeds_finite_and_ordered": (
            len(speeds.critical_speeds_rpm) >= 1
            and all(math.isfinite(v) and v > 0.0 for v in speeds.critical_speeds_rpm)
            and speeds.first_critical_speed_rpm == speeds.critical_speeds_rpm[0]
        ),
        "first_critical_in_physical_band": (
            1_000.0 < speeds.first_critical_speed_rpm < 200_000.0
        ),
        # Longer span must soften the shaft — canned rpm cannot pass both.
        "span_softening_proves_solver_catch": (
            soft_speeds.first_critical_speed_rpm
            < 0.6 * speeds.first_critical_speed_rpm
        ),
        "operating_band_is_19500": inputs.max_rotor_speed_rpm == 19_500.0,
        "release_honesty": (
            artifact["status"] in {"OPEN", "PARTIAL"}
            and artifact["ship_ok"] is False
            and artifact["modal_or_dynamometer_correlation"]["status"] == "OPEN"
            and artifact["bearing_supplier_identity"]["status"] == "OPEN"
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
                "critical_speeds": asdict(speeds),
                "softened_span_first_critical_rpm": soft_speeds.first_critical_speed_rpm,
                "ship_ok": artifact["ship_ok"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist one critical-speed screen against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    geometry = derive_rotor_model(inputs)
    if not geometry.fits_housing_length or not geometry.fits_bay:
        raise FiaFrontKitRossError(
            "Twin-controlled rotor model does not fit its housing/bay envelope"
        )
    rotor = build_ross_rotor(geometry)
    speeds = run_critical_speeds(rotor, operating_speed_rpm=inputs.max_rotor_speed_rpm)
    if not (
        1_000.0 < speeds.first_critical_speed_rpm < 200_000.0
        and math.isfinite(speeds.margin_ratio_first_over_operating)
    ):
        raise FiaFrontKitRossError(
            "Solved critical speed is outside the screening plausibility envelope"
        )
    try:
        twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
    except ValueError:
        twin_label = str(twin_dir.resolve())
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        speeds=speeds,
        source_state_sha256=state_hash,
        source_twin=twin_label,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / "ross_fia_front_kit_case.json"
    )
    _atomic_write_json(destination, artifact)
    clear_word = "clear of" if speeds.clear_of_operating_band else "NOT clear of"
    print(
        "FIA front-kit rotor-dynamics screen: "
        f"first critical ≈ {speeds.first_critical_speed_rpm:,.1f} rpm "
        f"({speeds.first_critical_speed_hz:.2f} Hz) vs operating "
        f"{inputs.max_rotor_speed_rpm:,.0f} rpm "
        f"(margin ×{speeds.margin_ratio_first_over_operating:.2f}; "
        f"need ≥×{SUBCRITICAL_MARGIN_FACTOR:.2f} for subcritical screen). "
        f"Band is {clear_word} the operating speed under assumed bearings. "
        f"Model: Ø{geometry.shaft_outer_diameter_m * 1000:.1f} mm shaft × "
        f"{geometry.shaft_length_m * 1000:.1f} mm span, "
        f"Ø{geometry.disk_outer_diameter_m * 1000:.1f}×"
        f"{geometry.disk_width_m * 1000:.1f} mm rotor disk. "
        "Bearing identity, modal/dyno correlation remain OPEN; ship_ok is false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description="Solve the FIA-bound Formula E front-kit ROSS rotor-dynamics case."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic binding plus span-softening proveCatch",
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
