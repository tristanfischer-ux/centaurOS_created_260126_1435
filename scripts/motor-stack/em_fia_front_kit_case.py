#!/usr/bin/env python3
"""FIA-bound electromagnetic point cases for the Formula E front kit twin.

This is deliberately separate from ``em_magnetic_selftest.py``.  The smoke
test proves the Pyleecan/xfemm toolchain on an educational Prius-derived
machine.  This case reads the Formula E twin, builds a fresh 48-slot/eight-pole
interior-PM cross-section at the twin's rotor, stator, bore, air-gap and stack
dimensions, and solves open-circuit and loaded magnetic points with native
xfemm.

The loaded point uses the analytical 250 kW phase-current estimate at one
documented current angle and rotor position.  It does not close a
torque/efficiency/demagnetisation map and remains OPEN for winding-detail and
dynamometer correlation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import ijson
import pyleecan
from pyleecan.Functions.load import load


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO_ROOT / "out" / "formula-e-front-mgu-20260729-1432"
MATERIAL_MACHINE_PATH = (
    REPO_ROOT
    / "assets"
    / "edu-training-cad"
    / "pyleecan-ipmsm-b"
    / "IPMSM_B.json"
)
PINNED_PYLEECAN_REVISION = "7937d675fb77701ac8f2c65816b583cb29270e12"
RESULT_PREFIX = "FORGE_FIA_EM_RESULT"
STATOR_SLOTS = 48
ROTOR_POLES = 8
MAGNETS_PER_POLE = 2


class FiaFrontKitCaseError(RuntimeError):
    """Raised when twin binding or magnetic evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this electromagnetic case."""

    continuous_electrical_power_kw: float
    front_regen_electrical_cap_kw: float
    dc_bus_voltage_v: float
    dc_bus_min_voltage_v: float
    dc_bus_max_voltage_v: float
    max_rotor_speed_rpm: float
    bay_width_mm: float
    bay_depth_mm: float
    bay_height_mm: float
    mass_aspiration_kg: float
    housing_outer_diameter_mm: float
    housing_length_mm: float
    stator_outer_diameter_mm: float
    stator_inner_diameter_mm: float
    rotor_outer_diameter_mm: float
    rotor_inner_diameter_mm: float
    radial_airgap_mm: float
    active_length_mm: float
    machine_efficiency_assumption: float
    inverter_efficiency_assumption: float
    # Analytical winding seeds from the twin physics tree (not a hairpin freeze).
    turns_per_coil: float
    turns_per_phase: float
    winding_parallel_paths: float
    twin_stator_slots: float
    phase_current_design_a: float | None


@dataclass(frozen=True)
class FiaMachineGeometry:
    """Dimensions of the direct-xfemm interior-PM point model."""

    topology: str
    stator_slots: int
    rotor_poles: int
    magnet_regions: int
    bay_width_mm: float
    bay_depth_mm: float
    bay_height_mm: float
    housing_outer_diameter_mm: float
    housing_length_mm: float
    stator_outer_diameter_mm: float
    stator_inner_diameter_mm: float
    rotor_outer_diameter_mm: float
    rotor_inner_diameter_mm: float
    radial_airgap_mm: float
    active_length_mm: float
    magnet_length_mm: float
    magnet_thickness_mm: float
    slot_depth_mm: float
    estimated_active_material_mass_kg: float
    fits_housing: bool
    fits_bay: bool


@dataclass(frozen=True)
class DutyCheck:
    """Analytical reconciliation of the point geometry to the FIA duty."""

    required_shaft_torque_nm: float
    shaft_power_kw: float
    electrical_power_check_kw: float
    dc_current_a: float
    estimated_phase_rms_current_a: float
    available_line_line_rms_voltage_v: float
    rotor_surface_speed_m_s: float
    combined_regen_efficiency: float
    duty_power_matches: bool
    bus_inside_assumed_window: bool
    front_regen_cap_respected: bool


@dataclass(frozen=True)
class MagneticResult:
    """Air-gap flux-density statistics from one xfemm solution."""

    peak_airgap_flux_density_t: float
    rms_airgap_flux_density_t: float
    mean_airgap_flux_density_t: float
    minimum_airgap_flux_density_t: float


@dataclass(frozen=True)
class LoadedPointAssumptions:
    """Explicit assumptions for the single loaded magnetic operating point."""

    phase_current_rms_a: float
    phase_current_peak_a: float
    current_angle_electrical_deg: float
    rotor_position_mechanical_deg: float
    phase_a_current_a: float
    phase_b_current_a: float
    phase_c_current_a: float
    effective_turns_per_slot: int
    winding_model: str


@dataclass(frozen=True)
class LoadedMagneticResult(MagneticResult):
    """Flux and weighted-stress torque from one loaded xfemm solution."""

    torque_nm: float


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
    raise FiaFrontKitCaseError(
        "Missing positive twin quantity; expected one of: " + ", ".join(keys)
    )


def _optional_number(
    values: Mapping[str, Any],
    keys: Sequence[str],
) -> float | None:
    """Return a positive quantity when present, else None (no error)."""

    try:
        return _number(values, keys)
    except FiaFrontKitCaseError:
        return None


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
    except FiaFrontKitCaseError:
        return _number(fallback, fallback_keys, default=default)


def inputs_from_sections(
    quantities: Mapping[str, Any],
    concentric: Mapping[str, Any],
) -> TwinInputs:
    """Build controlled case inputs from selectively read twin sections.

    The 600–900 V range and two efficiency values are explicit team-assumed
    seeds from the binding requirements.  Controlling machine dimensions are
    never inherited from the educational smoke machine.
    """

    return TwinInputs(
        continuous_electrical_power_kw=_number(
            quantities,
            ("continuous_power_kw", "continuous_design_duty_kw"),
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
        dc_bus_voltage_v=_number(
            quantities,
            ("dc_bus_voltage_v", "assumed_vdc_nom_v"),
        ),
        dc_bus_min_voltage_v=_number(
            quantities,
            ("dc_bus_min_voltage_v", "dc_bus_voltage_min_v"),
            default=600.0,
        ),
        dc_bus_max_voltage_v=_number(
            quantities,
            ("dc_bus_max_voltage_v", "dc_bus_voltage_max_v"),
            default=900.0,
        ),
        max_rotor_speed_rpm=_number(
            quantities,
            ("max_rotor_speed_rpm", "mgu_base_speed_rpm"),
        ),
        bay_width_mm=_number(
            quantities,
            ("front_bay_envelope_w_mm", "design_envelope_width_mm"),
        ),
        bay_depth_mm=_number(
            quantities,
            ("front_bay_envelope_d_mm", "design_envelope_depth_mm"),
        ),
        bay_height_mm=_number(
            quantities,
            ("front_bay_envelope_h_mm", "design_envelope_height_mm"),
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
        stator_outer_diameter_mm=_number_from_sections(
            concentric,
            ("stator_od_mm",),
            quantities,
            ("fpk_stator_od_mm",),
        ),
        stator_inner_diameter_mm=_number_from_sections(
            concentric,
            ("stator_id_mm",),
            quantities,
            ("fpk_stator_id_mm",),
        ),
        rotor_outer_diameter_mm=_number_from_sections(
            concentric,
            ("rotor_od_mm",),
            quantities,
            ("fpk_rotor_od_mm", "rotor_airgap_diameter_mm"),
        ),
        rotor_inner_diameter_mm=_number_from_sections(
            concentric,
            ("rotor_id_mm",),
            quantities,
            ("fpk_rotor_id_mm",),
        ),
        radial_airgap_mm=_number(
            concentric,
            ("airgap_mm",),
            default=0.7,
        ),
        turns_per_coil=_number(
            quantities,
            ("turns_per_coil",),
            default=4.0,
        ),
        turns_per_phase=_number(
            quantities,
            ("turns_per_phase",),
            default=14.0,
        ),
        winding_parallel_paths=_number(
            quantities,
            ("winding_parallel_paths",),
            default=2.0,
        ),
        twin_stator_slots=_number(
            quantities,
            ("stator_slots",),
            default=24.0,
        ),
        phase_current_design_a=_optional_number(
            quantities,
            ("phase_current_design_a", "phase_current_max_a"),
        ),
        active_length_mm=_number_from_sections(
            concentric,
            ("stack_len_mm",),
            quantities,
            ("stack_length_mm",),
        ),
        machine_efficiency_assumption=_number(
            quantities,
            ("mgu_efficiency", "motor_efficiency"),
            default=0.96,
        ),
        inverter_efficiency_assumption=_number(
            quantities,
            ("inverter_efficiency", "eta_inverter"),
            default=0.98,
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
        raise FiaFrontKitCaseError(f"Twin state not found: {state_path}")

    # GOTCHA: The autonomous twin can be rewritten while this script runs.
    # Retry once unless size and nanosecond mtime remain stable across all
    # selective reads and the streaming provenance hash.
    for _attempt in range(2):
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
    raise FiaFrontKitCaseError(
        "Twin state changed during both selective-read attempts; rerun on a stable stamp"
    )


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the selected quantities that control this case."""

    payload = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _estimate_active_mass_kg(
    *,
    rotor_outer_radius_mm: float,
    rotor_inner_radius_mm: float,
    stator_outer_radius_mm: float,
    stator_inner_radius_mm: float,
    active_length_mm: float,
    magnet_length_mm: float,
    magnet_thickness_mm: float,
    slot_depth_mm: float,
) -> float:
    """Estimate active steel, magnet and slot-copper mass only."""

    mm3_to_m3 = 1.0e-9
    rotor_area_mm2 = math.pi * (
        rotor_outer_radius_mm**2 - rotor_inner_radius_mm**2
    )
    magnet_area_mm2 = (
        ROTOR_POLES * MAGNETS_PER_POLE * magnet_length_mm * magnet_thickness_mm
    )
    slot_pitch_rad = 2.0 * math.pi / STATOR_SLOTS
    slot_width_rad = slot_pitch_rad * 0.46
    slot_outer_radius_mm = stator_inner_radius_mm + slot_depth_mm
    slot_area_each_mm2 = 0.5 * slot_width_rad * (
        slot_outer_radius_mm**2 - (stator_inner_radius_mm + 1.0) ** 2
    )
    slot_area_mm2 = STATOR_SLOTS * slot_area_each_mm2
    stator_area_mm2 = math.pi * (
        stator_outer_radius_mm**2 - stator_inner_radius_mm**2
    )
    steel_volume_m3 = (
        rotor_area_mm2 - magnet_area_mm2 + stator_area_mm2 - slot_area_mm2
    ) * active_length_mm * mm3_to_m3
    magnet_volume_m3 = (
        magnet_area_mm2 * active_length_mm * mm3_to_m3
    )
    copper_volume_m3 = (
        slot_area_mm2 * 0.55 * active_length_mm * mm3_to_m3
    )
    return steel_volume_m3 * 7_650.0 + magnet_volume_m3 * 7_500.0 + copper_volume_m3 * 8_960.0


def derive_fia_geometry(inputs: TwinInputs) -> FiaMachineGeometry:
    """Derive a fresh direct-xfemm IPM cross-section from twin dimensions."""

    r_ro = inputs.rotor_outer_diameter_mm / 2.0
    r_ri = inputs.rotor_inner_diameter_mm / 2.0
    r_si = inputs.stator_inner_diameter_mm / 2.0
    r_so = inputs.stator_outer_diameter_mm / 2.0
    measured_gap = r_si - r_ro
    if not (0.2 <= measured_gap <= 2.0):
        raise FiaFrontKitCaseError(
            f"Twin rotor/stator diameters imply invalid radial air gap {measured_gap:.3f} mm"
        )
    if abs(measured_gap - inputs.radial_airgap_mm) > 0.15:
        raise FiaFrontKitCaseError(
            "Concentric air-gap field disagrees with rotor/stator diameters: "
            f"{inputs.radial_airgap_mm:.3f} vs {measured_gap:.3f} mm"
        )
    rotor_ring_mm = r_ro - r_ri
    magnet_thickness_mm = max(3.2, min(4.2, rotor_ring_mm * 0.275))
    magnet_length_mm = max(11.0, min(15.0, rotor_ring_mm * 0.99))
    stator_build_mm = r_so - r_si
    slot_depth_mm = max(8.0, min(15.0, stator_build_mm * 0.66))
    estimated_mass = _estimate_active_mass_kg(
        rotor_outer_radius_mm=r_ro,
        rotor_inner_radius_mm=r_ri,
        stator_outer_radius_mm=r_so,
        stator_inner_radius_mm=r_si,
        active_length_mm=inputs.active_length_mm,
        magnet_length_mm=magnet_length_mm,
        magnet_thickness_mm=magnet_thickness_mm,
        slot_depth_mm=slot_depth_mm,
    )
    fits_housing = (
        inputs.stator_outer_diameter_mm + 8.0
        <= inputs.housing_outer_diameter_mm
        and inputs.active_length_mm <= inputs.housing_length_mm
    )
    fits_bay = (
        inputs.housing_length_mm <= inputs.bay_width_mm
        and inputs.housing_outer_diameter_mm
        <= min(inputs.bay_depth_mm, inputs.bay_height_mm)
    )
    return FiaMachineGeometry(
        topology="48-slot / 8-pole twin-V interior permanent-magnet synchronous machine",
        stator_slots=STATOR_SLOTS,
        rotor_poles=ROTOR_POLES,
        magnet_regions=ROTOR_POLES * MAGNETS_PER_POLE,
        bay_width_mm=inputs.bay_width_mm,
        bay_depth_mm=inputs.bay_depth_mm,
        bay_height_mm=inputs.bay_height_mm,
        housing_outer_diameter_mm=inputs.housing_outer_diameter_mm,
        housing_length_mm=inputs.housing_length_mm,
        stator_outer_diameter_mm=inputs.stator_outer_diameter_mm,
        stator_inner_diameter_mm=inputs.stator_inner_diameter_mm,
        rotor_outer_diameter_mm=inputs.rotor_outer_diameter_mm,
        rotor_inner_diameter_mm=inputs.rotor_inner_diameter_mm,
        radial_airgap_mm=measured_gap,
        active_length_mm=inputs.active_length_mm,
        magnet_length_mm=round(magnet_length_mm, 4),
        magnet_thickness_mm=round(magnet_thickness_mm, 4),
        slot_depth_mm=round(slot_depth_mm, 4),
        estimated_active_material_mass_kg=round(estimated_mass, 4),
        fits_housing=fits_housing,
        fits_bay=fits_bay,
    )


def analytical_duty_check(inputs: TwinInputs) -> DutyCheck:
    """Reconcile the FIA electrical duty at the maximum rotor-speed point."""

    omega_rad_s = inputs.max_rotor_speed_rpm * 2.0 * math.pi / 60.0
    combined_efficiency = (
        inputs.machine_efficiency_assumption
        * inputs.inverter_efficiency_assumption
    )
    shaft_power_kw = inputs.continuous_electrical_power_kw / combined_efficiency
    required_torque_nm = shaft_power_kw * 1_000.0 / omega_rad_s
    power_check_kw = (
        required_torque_nm * omega_rad_s * combined_efficiency / 1_000.0
    )
    dc_current_a = inputs.continuous_electrical_power_kw * 1_000.0 / inputs.dc_bus_voltage_v
    line_line_rms_v = inputs.dc_bus_voltage_v * math.sqrt(3.0) / (2.0 * math.sqrt(2.0))
    power_factor_assumption = 0.95
    phase_rms_a = (
        inputs.continuous_electrical_power_kw
        * 1_000.0
        / inputs.inverter_efficiency_assumption
        / (math.sqrt(3.0) * line_line_rms_v * power_factor_assumption)
    )
    surface_speed_m_s = (
        math.pi
        * inputs.rotor_outer_diameter_mm
        / 1_000.0
        * inputs.max_rotor_speed_rpm
        / 60.0
    )
    return DutyCheck(
        required_shaft_torque_nm=round(required_torque_nm, 6),
        shaft_power_kw=round(shaft_power_kw, 6),
        electrical_power_check_kw=round(power_check_kw, 9),
        dc_current_a=round(dc_current_a, 6),
        estimated_phase_rms_current_a=round(phase_rms_a, 6),
        available_line_line_rms_voltage_v=round(line_line_rms_v, 6),
        rotor_surface_speed_m_s=round(surface_speed_m_s, 6),
        combined_regen_efficiency=round(combined_efficiency, 6),
        duty_power_matches=abs(power_check_kw - inputs.continuous_electrical_power_kw)
        <= 1.0e-6,
        bus_inside_assumed_window=(
            inputs.dc_bus_min_voltage_v
            <= inputs.dc_bus_voltage_v
            <= inputs.dc_bus_max_voltage_v
        ),
        front_regen_cap_respected=(
            inputs.continuous_electrical_power_kw
            <= inputs.front_regen_electrical_cap_kw + 1.0e-9
        ),
    )


def effective_turns_per_slot_from_twin(inputs: TwinInputs) -> int:
    """Map twin analytical winding seeds onto this 48-slot FEMM belt model.

    DECISION: Use ``turns_per_coil`` as the FEMM slot conductor count.  The
    48-slot belt map gives eight go and eight return sides per phase; with
    ``winding_parallel_paths`` that recovers the twin's ``turns_per_phase``
    order (14 ≈ 4 × 8 / 2).  Do **not** stuff ``turns_per_phase`` into every
    slot — that overstates ampere-turns by about the belt multiplicity.

    GOTCHA: Twin analytical ``stator_slots`` is 24 while this point mesh stays
    48 for the IPM sector topology.  Closing that slot-count mismatch is a
    separate geometry revision; this function only removes the absurd 1-turn
    placeholder.
    """

    turns = max(1, int(round(inputs.turns_per_coil)))
    # Cross-check: series turns implied by belts should stay near turns_per_phase.
    slots_per_phase_go = STATOR_SLOTS // 3 // 2  # 8 for the 48-slot belt map
    implied_series = (
        turns * slots_per_phase_go / max(inputs.winding_parallel_paths, 1.0)
    )
    if abs(implied_series - inputs.turns_per_phase) > max(
        4.0, 0.5 * inputs.turns_per_phase
    ):
        # Prefer coil seed still; document the mismatch in winding_model text.
        pass
    return turns


def loaded_point_assumptions(
    duty: DutyCheck,
    inputs: TwinInputs,
) -> LoadedPointAssumptions:
    """Create the one-position loaded-point excitation from duty + twin winding.

    INTENT: Bind coil turns (and optional design phase current) from the twin
    so the weighted-stress torque is no longer the 1-turn placeholder (~8 N·m).
    Still one rotor position / one current angle — not a torque map.
    """

    # DECISION: Prefer bus/power-derived rms when design current is absent or
    # wildly larger than the analytical estimate; otherwise use the twin's
    # design current seed so the loaded point tracks the physics tree.
    phase_rms_a = duty.estimated_phase_rms_current_a
    if inputs.phase_current_design_a is not None:
        design_a = float(inputs.phase_current_design_a)
        if 0.5 * phase_rms_a <= design_a <= 2.5 * phase_rms_a:
            phase_rms_a = design_a
    phase_peak_a = phase_rms_a * math.sqrt(2.0)
    current_angle_deg = -90.0
    current_angle_rad = math.radians(current_angle_deg)
    phase_a_a = phase_peak_a * math.cos(current_angle_rad)
    phase_b_a = phase_peak_a * math.cos(
        current_angle_rad - 2.0 * math.pi / 3.0
    )
    phase_c_a = phase_peak_a * math.cos(
        current_angle_rad + 2.0 * math.pi / 3.0
    )
    turns = effective_turns_per_slot_from_twin(inputs)
    implied_series = (
        turns * (STATOR_SLOTS // 3 // 2) / max(inputs.winding_parallel_paths, 1.0)
    )
    return LoadedPointAssumptions(
        phase_current_rms_a=phase_rms_a,
        phase_current_peak_a=phase_peak_a,
        current_angle_electrical_deg=current_angle_deg,
        rotor_position_mechanical_deg=0.0,
        phase_a_current_a=phase_a_a,
        phase_b_current_a=phase_b_a,
        phase_c_current_a=phase_c_a,
        effective_turns_per_slot=turns,
        winding_model=(
            f"48-slot/eight-pole integral-slot phase belts "
            f"A+, C-, B+, A-, C+, B-; {turns} conductors/slot from twin "
            f"turns_per_coil={inputs.turns_per_coil:g} "
            f"(twin turns_per_phase={inputs.turns_per_phase:g}, "
            f"parallel_paths={inputs.winding_parallel_paths:g}, "
            f"twin_stator_slots={inputs.twin_stator_slots:g}; "
            f"implied series turns≈{implied_series:.1f} on this 48-slot map). "
            "Not a frozen hairpin schedule."
        ),
    )


def _solver_path() -> Path:
    """Resolve the native xfemm command-line solver."""

    candidates = (
        os.environ.get("FEMMCLI"),
        str(REPO_ROOT / "scripts" / "phantm" / "bin" / "femmcli"),
        shutil.which("femmcli"),
    )
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return Path(candidate).resolve()
    raise FiaFrontKitCaseError(
        "femmcli not found; restore scripts/phantm/bin/femmcli or set FEMMCLI"
    )


def _circle_lua(radius_mm: float) -> list[str]:
    """Draw a full circle as four stable 90-degree FEMM arcs."""

    points = (
        (radius_mm, 0.0),
        (0.0, radius_mm),
        (-radius_mm, 0.0),
        (0.0, -radius_mm),
    )
    lua: list[str] = []
    for x_mm, y_mm in points:
        lua.append(f"mi_addnode({x_mm:.12g},{y_mm:.12g})")
    for index, begin in enumerate(points):
        end = points[(index + 1) % len(points)]
        lua.append(
            f"mi_addarc({begin[0]:.12g},{begin[1]:.12g},"
            f"{end[0]:.12g},{end[1]:.12g},90,2)"
        )
    return lua


def _polygon_points(
    center: complex,
    length_mm: float,
    thickness_mm: float,
    angle_rad: float,
) -> tuple[complex, complex, complex, complex]:
    """Return one rotated rectangular magnet polygon."""

    along = complex(math.cos(angle_rad), math.sin(angle_rad)) * length_mm / 2.0
    across = (
        complex(-math.sin(angle_rad), math.cos(angle_rad))
        * thickness_mm
        / 2.0
    )
    return (
        center - along - across,
        center + along - across,
        center + along + across,
        center - along + across,
    )


def _polygon_lua(points: Sequence[complex]) -> list[str]:
    """Draw a closed polygon in FEMM."""

    lua: list[str] = []
    for point in points:
        lua.append(f"mi_addnode({point.real:.12g},{point.imag:.12g})")
    for index, begin in enumerate(points):
        end = points[(index + 1) % len(points)]
        lua.append(
            f"mi_addsegment({begin.real:.12g},{begin.imag:.12g},"
            f"{end.real:.12g},{end.imag:.12g})"
        )
    return lua


def _cross(origin: complex, first: complex, second: complex) -> float:
    """Return the signed 2D cross product for three points."""

    return (
        (first.real - origin.real) * (second.imag - origin.imag)
        - (first.imag - origin.imag) * (second.real - origin.real)
    )


def _segments_cross(
    first_begin: complex,
    first_end: complex,
    second_begin: complex,
    second_end: complex,
) -> bool:
    """Return whether two finite segments cross away from shared endpoints."""

    first_side_a = _cross(first_begin, first_end, second_begin)
    first_side_b = _cross(first_begin, first_end, second_end)
    second_side_a = _cross(second_begin, second_end, first_begin)
    second_side_b = _cross(second_begin, second_end, first_end)
    return (
        first_side_a * first_side_b < -1.0e-9
        and second_side_a * second_side_b < -1.0e-9
    )


def _polygons_intersect(
    first: Sequence[complex],
    second: Sequence[complex],
) -> bool:
    """Return whether two convex magnet polygons have crossing edges."""

    for first_index, first_begin in enumerate(first):
        first_end = first[(first_index + 1) % len(first)]
        for second_index, second_begin in enumerate(second):
            second_end = second[(second_index + 1) % len(second)]
            if _segments_cross(
                first_begin,
                first_end,
                second_begin,
                second_end,
            ):
                return True
    return False


def _block_label_lua(
    point: complex,
    *,
    material: str,
    mesh_mm: float,
    group: int,
    magnet_angle_deg: float = 0.0,
    circuit: str = "<None>",
    turns: int = 0,
) -> list[str]:
    """Assign one FEMM material block label."""

    return [
        f"mi_addblocklabel({point.real:.12g},{point.imag:.12g})",
        f"mi_selectlabel({point.real:.12g},{point.imag:.12g})",
        (
            f'mi_setblockprop("{material}",0,{mesh_mm:.12g},"{circuit}",'
            f"{magnet_angle_deg:.12g},{group},{turns})"
        ),
        "mi_clearselected()",
    ]


def _slot_winding_assignment(slot_index: int) -> tuple[str, int]:
    """Return the phase circuit and signed turn for one 48-slot winding side."""

    phase_belts = (
        ("phase_a", 1),
        ("phase_c", -1),
        ("phase_b", 1),
        ("phase_a", -1),
        ("phase_c", 1),
        ("phase_b", -1),
    )
    return phase_belts[(slot_index % 12) // 2]


def _build_fia_lua(
    geometry: FiaMachineGeometry,
    *,
    remanence_t: float,
    fem_name: str,
    loaded: LoadedPointAssumptions | None = None,
) -> str:
    """Build the FIA-sized interior-PM xfemm model for one magnetic point."""

    material_machine = load(str(MATERIAL_MACHINE_PATH))
    magnet_material = material_machine.rotor.hole[0].magnet_0.mat_type.mag
    magnet_mu_r = float(magnet_material.mur_lin)
    coercive_field_a_m = remanence_t / (4.0e-7 * math.pi * magnet_mu_r)
    r_ri = geometry.rotor_inner_diameter_mm / 2.0
    r_ro = geometry.rotor_outer_diameter_mm / 2.0
    r_si = geometry.stator_inner_diameter_mm / 2.0
    r_so = geometry.stator_outer_diameter_mm / 2.0
    r_gap = (r_ro + r_si) / 2.0
    r_slot_inner = r_si + 1.0
    r_slot_outer = r_si + geometry.slot_depth_mm

    # INTENT: This is a fresh Formula E-sized cross-section.  Pyleecan supplies
    # only the pinned nonlinear steel and NdFeB material records; no Prius
    # radius, stack length, slot polygon or magnet coordinate enters the mesh.
    lua = [
        "show_console()",
        "newdocument(0)",
        (
            f'mi_probdef(0,"millimeters","planar",1e-8,'
            f"{geometry.active_length_mm:.12g},30)"
        ),
        'mi_addmaterial("air",1,1,0,0,0,0,0,1,0,0,0)',
        'mi_addmaterial("copper",1,1,0,0,0,0,0,1,0,0,0)',
        'mi_addmaterial("m400",2500,2500,0,0,0,0,0,0.95,0,0,0)',
        (
            f'mi_addmaterial("ndfeb",{magnet_mu_r:.12g},{magnet_mu_r:.12g},'
            f"{coercive_field_a_m:.12g},0,0,0,0,1,0,0,0)"
        ),
    ]
    if loaded is not None:
        lua.extend(
            [
                f'mi_addcircprop("phase_a",{loaded.phase_a_current_a:.12g},1)',
                f'mi_addcircprop("phase_b",{loaded.phase_b_current_a:.12g},1)',
                f'mi_addcircprop("phase_c",{loaded.phase_c_current_a:.12g},1)',
            ]
        )
    for h_a_m, b_t in material_machine.stator.mat_type.mag.BH_curve.get_data():
        lua.append(f'mi_addbhpoint("m400",{float(b_t):.12g},{float(h_a_m):.12g})')
    for radius_mm in (r_ri, r_ro, r_si, r_so):
        lua.extend(_circle_lua(radius_mm))

    slot_pitch_rad = 2.0 * math.pi / STATOR_SLOTS
    slot_half_width_rad = slot_pitch_rad * 0.23
    slot_labels: list[tuple[complex, str, int]] = []
    for slot_index in range(STATOR_SLOTS):
        center_angle = slot_index * slot_pitch_rad
        points = (
            complex(
                r_slot_inner * math.cos(center_angle - slot_half_width_rad),
                r_slot_inner * math.sin(center_angle - slot_half_width_rad),
            ),
            complex(
                r_slot_outer * math.cos(center_angle - slot_half_width_rad),
                r_slot_outer * math.sin(center_angle - slot_half_width_rad),
            ),
            complex(
                r_slot_outer * math.cos(center_angle + slot_half_width_rad),
                r_slot_outer * math.sin(center_angle + slot_half_width_rad),
            ),
            complex(
                r_slot_inner * math.cos(center_angle + slot_half_width_rad),
                r_slot_inner * math.sin(center_angle + slot_half_width_rad),
            ),
        )
        lua.extend(_polygon_lua(points))
        label_radius = (r_slot_inner + r_slot_outer) / 2.0
        slot_point = complex(
            label_radius * math.cos(center_angle),
            label_radius * math.sin(center_angle),
        )
        circuit, signed_turn = _slot_winding_assignment(slot_index)
        slot_labels.append(
            (
                slot_point,
                circuit if loaded is not None else "<None>",
                (
                    signed_turn * loaded.effective_turns_per_slot
                    if loaded is not None
                    else 0
                ),
            )
        )

    magnet_labels: list[tuple[complex, float]] = []
    magnet_tilt_rad = math.radians(20.0)
    radial_half_extent_mm = (
        geometry.magnet_length_mm / 2.0 * math.sin(magnet_tilt_rad)
        + geometry.magnet_thickness_mm / 2.0 * math.cos(magnet_tilt_rad)
    )
    rotor_bridge_mm = 1.0
    magnet_center_radius = r_ro - rotor_bridge_mm - radial_half_extent_mm
    if (
        magnet_center_radius - radial_half_extent_mm
        <= r_ri + rotor_bridge_mm
    ):
        raise FiaFrontKitCaseError(
            "Twin hollow-rotor ring cannot retain the derived V-magnet pair "
            "with 1 mm inner and outer bridges"
        )
    pole_pitch_rad = 2.0 * math.pi / ROTOR_POLES
    for pole_index in range(ROTOR_POLES):
        pole_center = pole_index * pole_pitch_rad
        pole_polygons: list[tuple[complex, complex, complex, complex]] = []
        for side in (-1.0, 1.0):
            center_angle = pole_center + side * math.radians(11.0)
            center = complex(
                magnet_center_radius * math.cos(center_angle),
                magnet_center_radius * math.sin(center_angle),
            )
            long_axis_angle = pole_center + math.pi / 2.0 + side * magnet_tilt_rad
            points = _polygon_points(
                center,
                geometry.magnet_length_mm,
                geometry.magnet_thickness_mm,
                long_axis_angle,
            )
            if any(_polygons_intersect(points, other) for other in pole_polygons):
                raise FiaFrontKitCaseError(
                    f"Derived V-magnet polygons intersect in pole {pole_index}"
                )
            pole_polygons.append(points)
            lua.extend(_polygon_lua(points))
            # Magnetisation is through each bar's thickness, pointing toward
            # the pole face; alternating poles reverse the vector by 180°.
            magnetisation_deg = (
                math.degrees(pole_center + side * magnet_tilt_rad)
                + (0.0 if pole_index % 2 == 0 else 180.0)
            )
            magnet_labels.append((center, magnetisation_deg % 360.0))

    lua.append('mi_addboundprop("A0",0,0,0,0,0,0,0,0,0)')
    for angle_deg in (45.0, 135.0, 225.0, 315.0):
        angle_rad = math.radians(angle_deg)
        point = complex(r_so * math.cos(angle_rad), r_so * math.sin(angle_rad))
        lua.extend(
            [
                f"mi_selectarcsegment({point.real:.12g},{point.imag:.12g})",
                'mi_setarcsegmentprop(2,"A0",0,0)',
                "mi_clearselected()",
            ]
        )

    lua.extend(_block_label_lua(0.0j, material="air", mesh_mm=1.5, group=0))
    rotor_label_angle = math.radians(22.5)
    rotor_label = complex(
        ((r_ri + r_ro) / 2.0) * math.cos(rotor_label_angle),
        ((r_ri + r_ro) / 2.0) * math.sin(rotor_label_angle),
    )
    lua.extend(
        _block_label_lua(rotor_label, material="m400", mesh_mm=0.8, group=1)
    )
    lua.extend(
        _block_label_lua(
            complex(r_gap, 0.0),
            material="air",
            mesh_mm=min(0.12, geometry.radial_airgap_mm / 5.0),
            group=2,
        )
    )
    stator_label_radius = r_so - 2.0
    stator_label_angle = slot_pitch_rad / 2.0
    stator_label = complex(
        stator_label_radius * math.cos(stator_label_angle),
        stator_label_radius * math.sin(stator_label_angle),
    )
    lua.extend(
        _block_label_lua(stator_label, material="m400", mesh_mm=0.9, group=3)
    )
    for point, circuit, turns in slot_labels:
        lua.extend(
            _block_label_lua(
                point,
                material="copper",
                mesh_mm=0.7,
                group=4,
                circuit=circuit,
                turns=turns,
            )
        )
    for point, magnet_angle_deg in magnet_labels:
        lua.extend(
            _block_label_lua(
                point,
                material="ndfeb",
                mesh_mm=0.35,
                group=5,
                magnet_angle_deg=magnet_angle_deg,
            )
        )

    probe_count = 720
    lua.extend(
        [
            f'mi_saveas("{fem_name}")',
            "mi_analyze(1)",
            "mi_loadsolution()",
            "b_peak=0",
            "b_sum=0",
            "b_sq_sum=0",
            "b_min=1e30",
        ]
    )
    for probe_index in range(probe_count):
        angle_rad = 2.0 * math.pi * (probe_index + 0.5) / probe_count
        x_mm = r_gap * math.cos(angle_rad)
        y_mm = r_gap * math.sin(angle_rad)
        lua.extend(
            [
                (
                    "pA,pBx,pBy,pSig,pE,pHx,pHy,pJe,pJs,pMu1,pMu2,pPe,pPh="
                    f"mo_getpointvalues({x_mm:.12g},{y_mm:.12g})"
                ),
                "b_here=(pBx*pBx+pBy*pBy)^0.5",
                "if b_here>b_peak then b_peak=b_here end",
                "if b_here<b_min then b_min=b_here end",
                "b_sum=b_sum+b_here",
                "b_sq_sum=b_sq_sum+b_here*b_here",
            ]
        )
    lua.extend(
        [
            f'print("{RESULT_PREFIX} peak_t="..b_peak)',
            f'print("{RESULT_PREFIX} rms_t="..(b_sq_sum/{probe_count})^0.5)',
            f'print("{RESULT_PREFIX} mean_t="..b_sum/{probe_count})',
            f'print("{RESULT_PREFIX} minimum_t="..b_min)',
        ]
    )
    if loaded is not None:
        # DECISION: FEMM's steady-state weighted-stress block integral provides
        # a useful one-position torque estimate without pretending that this
        # provisional winding definition is a converged torque map.
        lua.extend(
            [
                "mo_clearblock()",
                "mo_groupselectblock(1)",
                "mo_groupselectblock(5)",
                f'print("{RESULT_PREFIX} torque_nm="..mo_blockintegral(22))',
                "mo_clearblock()",
            ]
        )
    lua.append("quit()")
    return "\n".join(lua) + "\n"


def _execute_magnetic_point(
    geometry: FiaMachineGeometry,
    solver: Path,
    *,
    remanence_t: float,
    loaded: LoadedPointAssumptions | None,
) -> dict[str, float]:
    """Run one native xfemm magnetic point and return its numeric evidence."""

    with tempfile.TemporaryDirectory(prefix="forge-fia-front-em-") as temp_dir:
        work_dir = Path(temp_dir)
        script_path = work_dir / "fia_front_kit.lua"
        script_path.write_text(
            _build_fia_lua(
                geometry,
                remanence_t=remanence_t,
                fem_name="fia_front_kit.fem",
                loaded=loaded,
            ),
            encoding="utf-8",
        )
        process = subprocess.run(
            [str(solver), "-q", f"--lua-script={script_path}"],
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=240,
            check=False,
        )
    values: dict[str, float] = {}
    for line in process.stdout.splitlines():
        if not line.startswith(RESULT_PREFIX + " "):
            continue
        key, separator, raw_value = line[len(RESULT_PREFIX) + 1 :].partition("=")
        if separator:
            values[key.strip()] = float(raw_value.strip())
    expected = {"peak_t", "rms_t", "mean_t", "minimum_t"}
    if loaded is not None:
        expected.add("torque_nm")
    if process.returncode != 0 or values.keys() != expected:
        raise FiaFrontKitCaseError(
            "xfemm FIA magnetic point failed or returned incomplete evidence: "
            f"exit={process.returncode}, keys={sorted(values)}, "
            f"stdout_tail={process.stdout[-1600:]!r}, "
            f"stderr_tail={process.stderr[-800:]!r}"
        )
    if not all(math.isfinite(value) for value in values.values()):
        raise FiaFrontKitCaseError(
            "xfemm FIA magnetic point returned a non-finite value"
        )
    return values


def run_magnetic_point(
    geometry: FiaMachineGeometry,
    solver: Path,
    *,
    remanence_t: float,
) -> MagneticResult:
    """Run the open-circuit native xfemm point and parse air-gap evidence."""

    values = _execute_magnetic_point(
        geometry,
        solver,
        remanence_t=remanence_t,
        loaded=None,
    )
    return MagneticResult(
        peak_airgap_flux_density_t=values["peak_t"],
        rms_airgap_flux_density_t=values["rms_t"],
        mean_airgap_flux_density_t=values["mean_t"],
        minimum_airgap_flux_density_t=values["minimum_t"],
    )


def run_loaded_magnetic_point(
    geometry: FiaMachineGeometry,
    solver: Path,
    *,
    remanence_t: float,
    assumptions: LoadedPointAssumptions,
) -> LoadedMagneticResult:
    """Run one loaded native xfemm point at the documented excitation."""

    values = _execute_magnetic_point(
        geometry,
        solver,
        remanence_t=remanence_t,
        loaded=assumptions,
    )
    return LoadedMagneticResult(
        peak_airgap_flux_density_t=values["peak_t"],
        rms_airgap_flux_density_t=values["rms_t"],
        mean_airgap_flux_density_t=values["mean_t"],
        minimum_airgap_flux_density_t=values["minimum_t"],
        torque_nm=values["torque_nm"],
    )


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: FiaMachineGeometry,
    duty: DutyCheck,
    magnetic: MagneticResult,
    loaded_assumptions: LoadedPointAssumptions,
    loaded_magnetic: LoadedMagneticResult,
    solver_identity: Mapping[str, str],
    source_state_sha256: str,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release electromagnetic artefact."""

    return {
        "schema": "forgeos.motor_stack.em_fia_front_kit_case/v2",
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": "out/formula-e-front-mgu-20260729-1432",
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "machine_geometry": asdict(geometry),
        "finite_element_point": {
            "kind": "2D nonlinear open-circuit magnetostatic",
            "peak_airgap_flux_density_t": magnetic.peak_airgap_flux_density_t,
            "rms_airgap_flux_density_t": magnetic.rms_airgap_flux_density_t,
            "mean_airgap_flux_density_t": magnetic.mean_airgap_flux_density_t,
            "minimum_airgap_flux_density_t": magnetic.minimum_airgap_flux_density_t,
            "torque_nm": None,
            "torque_status": "OPEN — open-circuit point has no current excitation",
        },
        "loaded_point": {
            "kind": "2D nonlinear loaded magnetostatic at one rotor position",
            "duty_basis": "analytical 250 kW continuous electrical duty check",
            "phase_current_rms_a": loaded_assumptions.phase_current_rms_a,
            "phase_current_peak_a": loaded_assumptions.phase_current_peak_a,
            "phase_instantaneous_current_a": {
                "a": loaded_assumptions.phase_a_current_a,
                "b": loaded_assumptions.phase_b_current_a,
                "c": loaded_assumptions.phase_c_current_a,
            },
            "current_angle_electrical_deg": (
                loaded_assumptions.current_angle_electrical_deg
            ),
            "current_angle_assumption": (
                "Id = 0 nominal q-axis regenerative excitation; no MTPA or "
                "field-weakening schedule has been solved"
            ),
            "rotor_position_mechanical_deg": (
                loaded_assumptions.rotor_position_mechanical_deg
            ),
            "winding_model": loaded_assumptions.winding_model,
            "effective_turns_per_slot": loaded_assumptions.effective_turns_per_slot,
            "peak_airgap_flux_density_t": (
                loaded_magnetic.peak_airgap_flux_density_t
            ),
            "rms_airgap_flux_density_t": loaded_magnetic.rms_airgap_flux_density_t,
            "mean_airgap_flux_density_t": (
                loaded_magnetic.mean_airgap_flux_density_t
            ),
            "minimum_airgap_flux_density_t": (
                loaded_magnetic.minimum_airgap_flux_density_t
            ),
            "torque_nm": loaded_magnetic.torque_nm,
            "torque_magnitude_nm": abs(loaded_magnetic.torque_nm),
            "torque_method": "FEMM steady-state weighted-stress block integral (22)",
            "torque_reliable": False,
            "required_shaft_torque_nm": duty.required_shaft_torque_nm,
            "torque_vs_required_ratio": (
                round(
                    abs(loaded_magnetic.torque_nm) / duty.required_shaft_torque_nm,
                    6,
                )
                if duty.required_shaft_torque_nm > 0.0
                else None
            ),
            "torque_status": (
                "ESTIMATE — solver-derived at twin-bound coil turns, one "
                "current angle and one rotor position"
            ),
            "honesty_note": (
                "This is one rotor position with one assumed current angle and "
                "twin-bound conductors per slot (turns_per_coil). Exact hairpin "
                "schedule, winding factor, MTPA/field-weakening, position sweep, "
                "voltage closure, losses, demagnetisation and dyno correlation "
                "remain OPEN. A large torque_vs_required_ratio miss is a design "
                "signal, not a reason to invent turns."
            ),
        },
        "analytical_duty_check": asdict(duty),
        "solver": dict(solver_identity),
        "geometry_provenance": {
            "controlling_dimensions": (
                "state.fpkConcentricGeometry with orchestratorContract quantity fallbacks"
            ),
            "material_records": (
                "Pyleecan IPMSM_B M400-50A B-H and NdFeB properties only, "
                f"Apache-2.0 source revision {PINNED_PYLEECAN_REVISION}"
            ),
            "training_geometry_used": False,
            "lucid_or_proprietary_cad_used": False,
            "statement": (
                "Fresh direct-xfemm 48-slot/eight-pole twin-V IPM geometry; "
                "no educational-machine or Lucid silhouette coordinates copied."
            ),
        },
        "mass_note": (
            "Active-material estimate excludes housing, end windings, coolant, "
            "resolver, bearings, inverter, gears and differential; the ~32 kg "
            "whole-kit aspiration remains a soft OPEN constraint."
        ),
        "torque_map": {
            "status": "OPEN",
            "reason": (
                "One open-circuit point and one provisional loaded point plus "
                "analytical 250 kW/speed reconciliation are not a rotor-position, "
                "current-angle, voltage, loss, thermal or demagnetisation map."
            ),
        },
        "dynamometer_correlation": {
            "status": "OPEN",
            "statement": (
                "Torque, efficiency, voltage and thermal predictions still "
                "require dynamometer correlation on the current hardware revision."
            ),
        },
        "release_statement": (
            "Concept evidence only. No FIA homologation, team interface closure, "
            "race evidence or permission to ship."
        ),
    }


def _solver_identity(solver: Path) -> dict[str, str]:
    """Read deterministic solver and Pyleecan identity strings."""

    version = subprocess.run(
        [str(solver), "--version"],
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    ).stdout.strip()
    return {
        "name": "xfemm femmcli",
        "path": str(solver),
        "version": version,
        "pyleecan_version": pyleecan.__version__,
        "pyleecan_revision": PINNED_PYLEECAN_REVISION,
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


def run_selftest() -> int:
    """Prove twin binding, a real FEM field, and permanent release honesty."""

    quantities = {
        "continuous_power_kw": {"value": 250.0, "unit": "kW"},
        "front_regen_electrical_cap_kw": {"value": 250.0, "unit": "kW"},
        "dc_bus_voltage_v": {"value": 750.0, "unit": "V"},
        "max_rotor_speed_rpm": {"value": 19_500.0, "unit": "rpm"},
        "front_bay_envelope_w_mm": {"value": 343.0, "unit": "mm"},
        "front_bay_envelope_d_mm": {"value": 259.0, "unit": "mm"},
        "front_bay_envelope_h_mm": {"value": 267.0, "unit": "mm"},
        "fpk_mass_cap_kg": {"value": 32.0, "unit": "kg"},
        "fpk_stator_od_mm": {"value": 164.7, "unit": "mm"},
        "fpk_stator_id_mm": {"value": 123.4, "unit": "mm"},
        "fpk_rotor_od_mm": {"value": 122.0, "unit": "mm"},
        "fpk_rotor_id_mm": {"value": 92.7, "unit": "mm"},
        "stack_length_mm": {"value": 98.0, "unit": "mm"},
        "turns_per_coil": {"value": 4.0, "unit": "-"},
        "turns_per_phase": {"value": 14.0, "unit": "-"},
        "winding_parallel_paths": {"value": 2.0, "unit": "-"},
        "stator_slots": {"value": 24.0, "unit": "-"},
    }
    concentric = {
        "housing_od_mm": 176.7,
        "housing_len_mm": 141.1,
        "stator_od_mm": 164.7,
        "stator_id_mm": 123.4,
        "rotor_od_mm": 122.0,
        "rotor_id_mm": 92.7,
        "airgap_mm": 0.7,
        "stack_len_mm": 98.0,
    }
    inputs = inputs_from_sections(quantities, concentric)
    geometry = derive_fia_geometry(inputs)
    duty = analytical_duty_check(inputs)
    solver = _solver_path()
    material_machine = load(str(MATERIAL_MACHINE_PATH))
    remanence_t = float(
        material_machine.rotor.hole[0].magnet_0.mat_type.mag.Brm20
    )
    solved = run_magnetic_point(geometry, solver, remanence_t=remanence_t)
    loaded_assumptions = loaded_point_assumptions(duty, inputs)
    loaded_solved = run_loaded_magnetic_point(
        geometry,
        solver,
        remanence_t=remanence_t,
        assumptions=loaded_assumptions,
    )
    near_zero = run_magnetic_point(
        geometry,
        solver,
        remanence_t=remanence_t * 1.0e-6,
    )
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        duty=duty,
        magnetic=solved,
        loaded_assumptions=loaded_assumptions,
        loaded_magnetic=loaded_solved,
        solver_identity=_solver_identity(solver),
        source_state_sha256="synthetic-selftest",
    )
    checks = {
        "synthetic_quantities_control_geometry": (
            geometry.rotor_outer_diameter_mm == 122.0
            and geometry.active_length_mm == 98.0
            and geometry.rotor_outer_diameter_mm != 160.4
            and geometry.active_length_mm != 83.82
        ),
        "geometry_fits_twin": geometry.fits_housing and geometry.fits_bay,
        "finite_element_field_is_physical": (
            0.05 < solved.peak_airgap_flux_density_t < 2.5
            and 0.01 < solved.rms_airgap_flux_density_t
            <= solved.peak_airgap_flux_density_t
        ),
        # proveCatch: identical geometry with Br reduced one million-fold must
        # collapse correspondingly. A canned flux result cannot pass.
        "remanence_collapse_proves_solver_catch": (
            near_zero.peak_airgap_flux_density_t < 1.0e-5
            and solved.peak_airgap_flux_density_t
            > 1.0e5 * max(near_zero.peak_airgap_flux_density_t, 1.0e-15)
        ),
        "analytical_250_kw_check": (
            duty.duty_power_matches
            and duty.front_regen_cap_respected
            and duty.bus_inside_assumed_window
        ),
        "loaded_point_uses_twin_coil_turns": (
            loaded_assumptions.effective_turns_per_slot == 4
            and loaded_assumptions.effective_turns_per_slot != 1
        ),
        "loaded_point_uses_duty_current": (
            loaded_assumptions.phase_current_rms_a
            == duty.estimated_phase_rms_current_a
            and abs(
                loaded_assumptions.phase_a_current_a
                + loaded_assumptions.phase_b_current_a
                + loaded_assumptions.phase_c_current_a
            )
            < 1.0e-9
        ),
        "loaded_solver_returns_flux_and_torque": (
            0.01 < loaded_solved.rms_airgap_flux_density_t
            <= loaded_solved.peak_airgap_flux_density_t
            and math.isfinite(loaded_solved.torque_nm)
            and abs(loaded_solved.torque_nm) > 1.0e-3
        ),
        "release_honesty": (
            artifact["status"] in {"OPEN", "PARTIAL"}
            and artifact["ship_ok"] is False
            and artifact["torque_map"]["status"] == "OPEN"
            and artifact["dynamometer_correlation"]["status"] == "OPEN"
            and artifact["loaded_point"]["torque_reliable"] is False
        ),
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "geometry": asdict(geometry),
                "open_circuit_result": asdict(solved),
                "near_zero_remanence_result": asdict(near_zero),
                "loaded_point_assumptions": asdict(loaded_assumptions),
                "loaded_point_result": asdict(loaded_solved),
                "analytical_duty_check": asdict(duty),
                "ship_ok": artifact["ship_ok"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist open-circuit and loaded points against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    geometry = derive_fia_geometry(inputs)
    duty = analytical_duty_check(inputs)
    if not geometry.fits_housing or not geometry.fits_bay:
        raise FiaFrontKitCaseError(
            "Twin-controlled electromagnetic geometry does not fit its housing/bay"
        )
    if not (
        duty.duty_power_matches
        and duty.bus_inside_assumed_window
        and duty.front_regen_cap_respected
    ):
        raise FiaFrontKitCaseError(
            "Analytical duty check violates power, bus-window or front-regen cap"
        )
    solver = _solver_path()
    material_machine = load(str(MATERIAL_MACHINE_PATH))
    remanence_t = float(
        material_machine.rotor.hole[0].magnet_0.mat_type.mag.Brm20
    )
    magnetic = run_magnetic_point(
        geometry,
        solver,
        remanence_t=remanence_t,
    )
    loaded_assumptions = loaded_point_assumptions(duty, inputs)
    loaded_magnetic = run_loaded_magnetic_point(
        geometry,
        solver,
        remanence_t=remanence_t,
        assumptions=loaded_assumptions,
    )
    if not (
        0.05 < magnetic.peak_airgap_flux_density_t < 2.5
        and 0.01 < magnetic.rms_airgap_flux_density_t
        <= magnetic.peak_airgap_flux_density_t
    ):
        raise FiaFrontKitCaseError(
            "Solved air-gap field is outside the point-case plausibility envelope"
        )
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        duty=duty,
        magnetic=magnetic,
        loaded_assumptions=loaded_assumptions,
        loaded_magnetic=loaded_magnetic,
        solver_identity=_solver_identity(solver),
        source_state_sha256=state_hash,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / "em_fia_front_kit_case.json"
    )
    _atomic_write_json(destination, artifact)
    print(
        "FIA front-kit electromagnetic point: "
        f"{inputs.continuous_electrical_power_kw:.0f} kW electrical at "
        f"{inputs.max_rotor_speed_rpm:,.0f} rpm requires "
        f"{duty.required_shaft_torque_nm:.1f} N·m shaft torque under the "
        f"{duty.combined_regen_efficiency:.3f} assumed regen efficiency. "
        f"The {inputs.dc_bus_voltage_v:.0f} V bus is inside "
        f"{inputs.dc_bus_min_voltage_v:.0f}–{inputs.dc_bus_max_voltage_v:.0f} V; "
        f"estimated DC current is {duty.dc_current_a:.1f} A. "
        f"The twin-sized Ø{geometry.rotor_outer_diameter_mm:.1f} × "
        f"{geometry.active_length_mm:.1f} mm IPM point solved at "
        f"{magnetic.peak_airgap_flux_density_t:.3f} T peak air-gap flux. "
        f"One loaded point at {loaded_assumptions.phase_current_rms_a:.1f} A rms "
        f"and {loaded_assumptions.current_angle_electrical_deg:.0f} electrical "
        f"degrees yielded {loaded_magnetic.torque_nm:.2f} N·m weighted-stress "
        "torque as an explicitly provisional estimate. "
        "Torque map, demagnetisation, thermal limits and dyno correlation remain OPEN; "
        "ship_ok is false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description="Solve the FIA-bound Formula E front-kit magnetic point."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic binding plus two-solve proveCatch",
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
