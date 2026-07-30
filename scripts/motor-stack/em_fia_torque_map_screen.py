#!/usr/bin/env python3
"""FIA-bound hybrid torque-map SCREEN (FEMM anchors + analytical extension).

This companion densifies electromagnetic evidence beyond the standalone MTPA
(7×5 FEMM) and voltage/FW screens by:

1. Binding to the twin's enlarged rotor geometry (post bore-enlarge writeback).
2. Scaling FEMM torque anchors across current-magnitude fractions.
3. Estimating copper + iron losses at screened operating corners.
4. Building a coarse field-weakening *capability* curve vs speed and FIA bus.

It consumes existing twin artefacts — it does not replace them and does not
run additional finite-element solves unless ``--refresh-femm`` is passed
(optional small anchor refresh only).

Consequently ``ship_ok`` is permanently false and both ``torque_map`` and
``field_weakening_map`` remain ``OPEN``.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from em_fia_front_kit_case import (
    DEFAULT_TWIN,
    ROTOR_POLES,
    DutyCheck,
    FiaFrontKitCaseError,
    FiaMachineGeometry,
    TwinInputs,
    _atomic_write_json,
    analytical_duty_check,
    derive_fia_geometry,
    input_quantities_sha256,
    load_twin_inputs,
)
from em_fia_mtpa_screen import (
    SMOKE_POINT_COUNT,
    summarize_screen,
)
from em_fia_voltage_fw_screen import (
    SPEED_FRACTIONS,
    VOLTAGE_CONTROL_RESERVE,
    available_line_line_rms_voltage_v,
    run_voltage_screen,
)


SCHEMA = "forgeos.motor_stack.em_fia_torque_map_screen/v1"
OUTPUT_FILENAME = "em_fia_torque_map_screen.json"
EM_CASE_FILENAME = "em_fia_front_kit_case.json"
MTPA_FILENAME = "em_fia_mtpa_screen.json"
VOLTAGE_FW_FILENAME = "em_fia_voltage_fw_screen.json"
POLE_PAIRS = ROTOR_POLES // 2

# INTENT: Extend the MTPA FEMM anchor without re-solving every combination.
CURRENT_MAGNITUDE_FRACTIONS = (0.5, 0.75, 1.0)
# Denser speed axis than the voltage screen's four fractions.
FW_SPEED_FRACTIONS = (
    0.0,
    0.25,
    0.5,
    0.625,
    0.75,
    0.875,
    1.0,
)
# Assumed phase resistance for loss SCREEN only — not identified from test.
ASSUMED_PHASE_RESISTANCE_OHM = 0.0085
# Steinmetz-style iron-loss coefficients (W/kg) for SCREEN — not measured.
IRON_LOSS_KH_W_PER_KG = 12.0
IRON_LOSS_KALPHA = 1.6
IRON_LOSS_KE_W_PER_KG = 0.35
STEEL_MASS_KG_SCREEN = 4.2


class FiaTorqueMapScreenError(RuntimeError):
    """Raised when hybrid torque-map screening evidence is incomplete."""


@dataclass(frozen=True)
class LossScreenResult:
    """Coarse copper + iron loss estimates at one operating corner."""

    speed_rpm: float
    phase_current_rms_a: float
    current_fraction: float
    copper_loss_kw: float
    iron_loss_kw: float
    total_electrical_loss_kw: float
    efficiency_screen: float
    peak_airgap_flux_density_t: float
    rms_airgap_flux_density_t: float


@dataclass(frozen=True)
class HybridTorqueMapResult:
    """Immutable hybrid screen summary."""

    femm_anchor_points: int
    current_scaled_points: int
    fw_capability_points: int
    loss_corner_points: int
    total_screen_points: int
    peak_torque_magnitude_nm: float
    peak_torque_current_fraction: float
    peak_torque_current_angle_electrical_deg: float
    peak_torque_rotor_position_mechanical_deg: float
    required_shaft_torque_nm: float
    peak_torque_vs_required_ratio: float
    rotor_outer_diameter_mm: float
    rotor_inner_diameter_mm: float
    geometry_matches_twin: bool


def _read_json(path: Path) -> dict[str, Any]:
    """Load one JSON artefact or raise."""

    if not path.is_file():
        raise FiaTorqueMapScreenError(f"Required artefact not found: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise FiaTorqueMapScreenError(
            f"Cannot read artefact {path}: {error}"
        ) from error
    if not isinstance(payload, dict):
        raise FiaTorqueMapScreenError(f"Artefact must be a JSON object: {path}")
    return payload


def _geometry_matches_twin(
    geometry: FiaMachineGeometry,
    inputs: TwinInputs,
    *,
    tolerance_mm: float = 0.05,
) -> bool:
    """Return whether derived geometry matches twin rotor OD/ID."""

    return (
        abs(geometry.rotor_outer_diameter_mm - inputs.rotor_outer_diameter_mm)
        <= tolerance_mm
        and abs(geometry.rotor_inner_diameter_mm - inputs.rotor_inner_diameter_mm)
        <= tolerance_mm
    )


def _scale_torque_with_current(
    torque_nm: float,
    current_fraction: float,
) -> float:
    """Scale FEMM torque with current magnitude (SCREEN linearisation).

    @description PM-machine first-order: torque ∝ current below saturation.
        This is a comparative screen — not a saturated dq map.
    """

    fraction = max(0.0, float(current_fraction))
    return float(torque_nm) * fraction


def build_current_scaled_grid(
    femm_points: Sequence[Mapping[str, float]],
    *,
    current_fractions: Sequence[float] = CURRENT_MAGNITUDE_FRACTIONS,
    design_current_a: float,
) -> list[dict[str, Any]]:
    """Expand FEMM anchors across current-magnitude fractions."""

    rows: list[dict[str, Any]] = []
    for point in femm_points:
        base_torque = float(point["torque_nm"])
        angle = float(point["current_angle_electrical_deg"])
        position = float(point["rotor_position_mechanical_deg"])
        for fraction in current_fractions:
            current_a = design_current_a * fraction
            scaled_torque = _scale_torque_with_current(base_torque, fraction)
            rows.append(
                {
                    "current_angle_electrical_deg": angle,
                    "rotor_position_mechanical_deg": position,
                    "current_fraction": fraction,
                    "phase_current_rms_a": round(current_a, 3),
                    "torque_nm": round(scaled_torque, 6),
                    "torque_magnitude_nm": round(abs(scaled_torque), 6),
                    "evidence_class": "analytical_current_scale_from_femm_anchor",
                    "femm_anchor_peak_airgap_flux_density_t": float(
                        point.get("peak_airgap_flux_density_t", 0.0)
                    ),
                }
            )
    return rows


def estimate_iron_loss_kw(
    rms_airgap_flux_density_t: float,
    *,
    electrical_frequency_hz: float,
    steel_mass_kg: float = STEEL_MASS_KG_SCREEN,
) -> float:
    """Steinmetz-style iron-loss SCREEN from air-gap RMS flux."""

    b = max(0.0, float(rms_airgap_flux_density_t))
    f = max(0.0, float(electrical_frequency_hz))
    if b <= 0.0 or f <= 0.0:
        return 0.0
    specific_w_per_kg = (
        IRON_LOSS_KH_W_PER_KG * (f / 50.0) ** IRON_LOSS_KALPHA * b**2
        + IRON_LOSS_KE_W_PER_KG * (f / 50.0) ** 2 * b**2
    )
    return specific_w_per_kg * steel_mass_kg / 1_000.0


def estimate_copper_loss_kw(
    phase_current_rms_a: float,
    *,
    phase_resistance_ohm: float = ASSUMED_PHASE_RESISTANCE_OHM,
) -> float:
    """I²R copper-loss SCREEN for a three-phase wye-equivalent."""

    current = max(0.0, float(phase_current_rms_a))
    return 3.0 * current**2 * phase_resistance_ohm / 1_000.0


def build_loss_corners(
    *,
    duty: DutyCheck,
    inputs: TwinInputs,
    peak_point: Mapping[str, float],
    current_fractions: Sequence[float] = CURRENT_MAGNITUDE_FRACTIONS,
) -> list[dict[str, Any]]:
    """Estimate loss corners at max speed and scaled currents."""

    rows: list[dict[str, Any]] = []
    max_speed_rpm = float(inputs.max_rotor_speed_rpm)
    peak_b = float(peak_point.get("peak_airgap_flux_density_t", 0.0))
    rms_b = float(peak_point.get("rms_airgap_flux_density_t", peak_b * 0.58))
    design_current = float(inputs.phase_current_design_a or duty.dc_current_a)
    for fraction in current_fractions:
        current_a = design_current * fraction
        elec_freq_hz = max_speed_rpm * POLE_PAIRS / 60.0
        copper_kw = estimate_copper_loss_kw(current_a)
        iron_kw = estimate_iron_loss_kw(rms_b, electrical_frequency_hz=elec_freq_hz)
        total_kw = copper_kw + iron_kw
        mechanical_kw = duty.shaft_power_kw * fraction
        efficiency = (
            mechanical_kw / (mechanical_kw + total_kw)
            if mechanical_kw + total_kw > 0.0
            else 0.0
        )
        rows.append(
            {
                "speed_rpm": max_speed_rpm,
                "current_fraction": fraction,
                "phase_current_rms_a": round(current_a, 3),
                "copper_loss_kw": round(copper_kw, 6),
                "iron_loss_kw": round(iron_kw, 6),
                "total_electrical_loss_kw": round(total_kw, 6),
                "efficiency_screen": round(efficiency, 6),
                "peak_airgap_flux_density_t": round(peak_b, 6),
                "rms_airgap_flux_density_t": round(rms_b, 6),
                "evidence_class": "analytical_loss_screen",
            }
        )
    return rows


def build_fw_capability_curve(
    inputs: TwinInputs,
    geometry: FiaMachineGeometry,
    *,
    open_circuit_rms_airgap_flux_density_t: float,
    peak_torque_magnitude_nm: float,
    speed_fractions: Sequence[float] = FW_SPEED_FRACTIONS,
) -> list[dict[str, Any]]:
    """Build coarse FW-limited torque vs speed for each FIA bus voltage.

    INTENT: Extend the voltage screen with a speed-resolved capability envelope.
    Below base speed torque is current-limited (FEMM peak); above, voltage
    limits available torque proportional to usable voltage / back-EMF.
    """

    voltage_result = run_voltage_screen(
        inputs,
        geometry,
        open_circuit_rms_airgap_flux_density_t=open_circuit_rms_airgap_flux_density_t,
    )
    max_speed_rpm = float(inputs.max_rotor_speed_rpm)
    base_torque = max(0.0, float(peak_torque_magnitude_nm))
    rows: list[dict[str, Any]] = []
    bus_voltages = (
        float(inputs.dc_bus_min_voltage_v),
        float(inputs.dc_bus_voltage_v),
        float(inputs.dc_bus_max_voltage_v),
    )
    back_emf_at_max = float(
        voltage_result.estimated_back_emf_line_line_rms_v_at_max_speed
    )
    for dc_bus_v in bus_voltages:
        usable_v = (
            available_line_line_rms_voltage_v(dc_bus_v) * VOLTAGE_CONTROL_RESERVE
        )
        for fraction in speed_fractions:
            speed_rpm = max_speed_rpm * fraction
            back_emf_v = back_emf_at_max * fraction
            voltage_limited_torque = (
                base_torque * usable_v / back_emf_v
                if back_emf_v > 1.0e-6
                else base_torque
            )
            available_torque = min(base_torque, voltage_limited_torque)
            field_weakening_active = (
                fraction > 0.0
                and back_emf_v > usable_v
                and available_torque < base_torque * 0.99
            )
            rows.append(
                {
                    "speed_rpm": round(speed_rpm, 3),
                    "speed_fraction": fraction,
                    "dc_bus_voltage_v": dc_bus_v,
                    "usable_line_line_rms_voltage_v": round(usable_v, 6),
                    "estimated_back_emf_line_line_rms_v": round(back_emf_v, 6),
                    "current_limited_peak_torque_nm": round(base_torque, 6),
                    "voltage_limited_peak_torque_nm": round(
                        voltage_limited_torque,
                        6,
                    ),
                    "available_peak_torque_nm": round(available_torque, 6),
                    "field_weakening_active": field_weakening_active,
                    "evidence_class": "analytical_fw_capability_screen",
                }
            )
    return rows


def run_hybrid_screen(
    *,
    inputs: TwinInputs,
    geometry: FiaMachineGeometry,
    duty: DutyCheck,
    femm_points: Sequence[Mapping[str, float]],
    open_circuit_rms_airgap_flux_density_t: float,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    HybridTorqueMapResult,
]:
    """Assemble the hybrid torque-map screen from FEMM anchors + analytics."""

    if len(femm_points) <= SMOKE_POINT_COUNT:
        raise FiaTorqueMapScreenError(
            f"FEMM anchor must exceed {SMOKE_POINT_COUNT} smoke point"
        )
    mtpa_summary = summarize_screen(
        femm_points,
        required_shaft_torque_nm=duty.required_shaft_torque_nm,
    )
    design_current = float(inputs.phase_current_design_a or duty.dc_current_a)
    current_scaled = build_current_scaled_grid(
        femm_points,
        design_current_a=design_current,
    )
    peak_point = max(
        femm_points,
        key=lambda row: abs(float(row["torque_nm"])),
    )
    loss_corners = build_loss_corners(
        duty=duty,
        inputs=inputs,
        peak_point=peak_point,
    )
    fw_curve = build_fw_capability_curve(
        inputs,
        geometry,
        open_circuit_rms_airgap_flux_density_t=open_circuit_rms_airgap_flux_density_t,
        peak_torque_magnitude_nm=float(mtpa_summary["peak_torque_magnitude_nm"]),
    )
    peak_magnitude = float(mtpa_summary["peak_torque_magnitude_nm"])
    required = float(duty.required_shaft_torque_nm)
    summary = HybridTorqueMapResult(
        femm_anchor_points=len(femm_points),
        current_scaled_points=len(current_scaled),
        fw_capability_points=len(fw_curve),
        loss_corner_points=len(loss_corners),
        total_screen_points=(
            len(femm_points)
            + len(current_scaled)
            + len(fw_curve)
            + len(loss_corners)
        ),
        peak_torque_magnitude_nm=peak_magnitude,
        peak_torque_current_fraction=1.0,
        peak_torque_current_angle_electrical_deg=float(
            mtpa_summary["peak_torque_current_angle_electrical_deg"]
        ),
        peak_torque_rotor_position_mechanical_deg=float(
            mtpa_summary["peak_torque_rotor_position_mechanical_deg"]
        ),
        required_shaft_torque_nm=required,
        peak_torque_vs_required_ratio=(
            peak_magnitude / required if required > 0.0 else 0.0
        ),
        rotor_outer_diameter_mm=geometry.rotor_outer_diameter_mm,
        rotor_inner_diameter_mm=geometry.rotor_inner_diameter_mm,
        geometry_matches_twin=_geometry_matches_twin(geometry, inputs),
    )
    return current_scaled, loss_corners, fw_curve, summary


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: FiaMachineGeometry,
    duty: DutyCheck,
    femm_points: Sequence[Mapping[str, float]],
    current_scaled: Sequence[Mapping[str, Any]],
    loss_corners: Sequence[Mapping[str, Any]],
    fw_curve: Sequence[Mapping[str, Any]],
    summary: HybridTorqueMapResult,
    source_state_sha256: str,
    source_twin: str,
    femm_anchor_refs: Mapping[str, str],
) -> dict[str, Any]:
    """Assemble the permanently non-release hybrid torque-map artefact."""

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "machine_geometry": asdict(geometry),
        "geometry_binding": {
            "rotor_outer_diameter_mm": summary.rotor_outer_diameter_mm,
            "rotor_inner_diameter_mm": summary.rotor_inner_diameter_mm,
            "matches_twin_concentric": summary.geometry_matches_twin,
            "note": (
                "Post bore-enlarge writeback geometry (target ID 130.5 / "
                "OD 159.8 mm class). Hybrid screen refuses stale 92.7/122 "
                "artefacts when twin geometry disagrees."
            ),
        },
        "femm_anchor_refs": dict(femm_anchor_refs),
        "femm_anchor_points": [dict(point) for point in femm_points],
        "current_scaled_grid": [dict(row) for row in current_scaled],
        "loss_screen": {
            "status": "PARTIAL",
            "assumed_phase_resistance_ohm": ASSUMED_PHASE_RESISTANCE_OHM,
            "iron_loss_model": (
                f"Steinmetz SCREEN Kh={IRON_LOSS_KH_W_PER_KG} "
                f"α={IRON_LOSS_KALPHA} Ke={IRON_LOSS_KE_W_PER_KG} "
                f"steel_mass_kg={STEEL_MASS_KG_SCREEN}"
            ),
            "corners": [dict(row) for row in loss_corners],
        },
        "fw_capability_curve": {
            "status": "PARTIAL",
            "speed_fractions": list(FW_SPEED_FRACTIONS),
            "speed_points_per_bus": len(FW_SPEED_FRACTIONS),
            "dc_bus_voltages_v": [
                float(inputs.dc_bus_min_voltage_v),
                float(inputs.dc_bus_voltage_v),
                float(inputs.dc_bus_max_voltage_v),
            ],
            "points": [dict(row) for row in fw_curve],
            "note": (
                "Coarse voltage-limited torque envelope — NOT a calibrated "
                "field-weakening schedule."
            ),
        },
        "summary": asdict(summary),
        "coverage": {
            "femm_anchor_points": summary.femm_anchor_points,
            "current_scaled_points": summary.current_scaled_points,
            "fw_capability_points": summary.fw_capability_points,
            "loss_corner_points": summary.loss_corner_points,
            "total_screen_points": summary.total_screen_points,
            "denser_than_mtpa_alone": summary.total_screen_points > 35,
            "speeds_evaluated": len(FW_SPEED_FRACTIONS),
            "current_magnitudes_evaluated": len(CURRENT_MAGNITUDE_FRACTIONS),
            "losses_evaluated": True,
            "fw_capability_evaluated": True,
            "closed_torque_map": False,
            "closed_field_weakening_map": False,
        },
        "torque_map_screen": {
            "status": "PARTIAL",
            "peak_torque_magnitude_nm": summary.peak_torque_magnitude_nm,
            "peak_torque_vs_required_ratio": round(
                summary.peak_torque_vs_required_ratio,
                6,
            ),
            "selection_metric": (
                "FEMM peak |torque| at design current, extended analytically "
                "across current fractions, speed/bus FW envelope and loss corners"
            ),
            "note": (
                "Hybrid denser SCREEN only. Not an optimisation-grade torque "
                "map, loss map, or FW controller calibration."
            ),
        },
        "analytical_duty_check": asdict(duty),
        "torque_map": {
            "status": "OPEN",
            "reason": (
                "Hybrid FEMM+analytical screen does not cover temperature "
                "corners, saturation, mesh convergence, PWM, or dyno "
                "correlation."
            ),
        },
        "field_weakening_map": {
            "status": "OPEN",
            "reason": (
                "FW capability curve is a coarse voltage-limited envelope — "
                "not identified Rs/Ld/Lq or controller FW schedule."
            ),
        },
        "release_statement": (
            "SCREEN evidence only. No FIA homologation, dynamometer "
            "correlation, race evidence, or permission to ship."
        ),
    }


def _source_twin_label(twin_dir: Path) -> str:
    """Return a stable repository-relative twin label when possible."""

    repo_root = Path(__file__).resolve().parents[2]
    try:
        return str(twin_dir.resolve().relative_to(repo_root))
    except ValueError:
        return str(twin_dir.resolve())


def _validate_upstream_artefacts(
    twin_dir: Path,
    inputs: TwinInputs,
) -> tuple[
    dict[str, Any],
    dict[str, Any],
    dict[str, Any],
    list[dict[str, float]],
    float,
]:
    """Load and validate MTPA, voltage/FW and OC FEMM artefacts."""

    current_hash = input_quantities_sha256(inputs)
    em_case = _read_json(twin_dir / "_motor_stack" / EM_CASE_FILENAME)
    mtpa = _read_json(twin_dir / "_motor_stack" / MTPA_FILENAME)
    voltage_fw = _read_json(twin_dir / "_motor_stack" / VOLTAGE_FW_FILENAME)
    for label, artefact in (
        ("em_fia_front_kit_case", em_case),
        ("em_fia_mtpa_screen", mtpa),
        ("em_fia_voltage_fw_screen", voltage_fw),
    ):
        artefact_hash = str(artefact.get("input_quantities_sha256") or "")
        if artefact_hash != current_hash:
            raise FiaTorqueMapScreenError(
                f"{label} was solved against different twin quantities; "
                "rerun upstream EM cases first"
            )
    femm = em_case.get("finite_element_point")
    if not isinstance(femm, Mapping):
        raise FiaTorqueMapScreenError(
            "FIA electromagnetic case has no finite_element_point"
        )
    oc_rms_b = float(femm.get("rms_airgap_flux_density_t") or 0.0)
    if not math.isfinite(oc_rms_b) or oc_rms_b <= 0.0:
        raise FiaTorqueMapScreenError(
            "FIA electromagnetic OC RMS air-gap field must be positive"
        )
    raw_points = mtpa.get("points")
    if not isinstance(raw_points, list) or not raw_points:
        raise FiaTorqueMapScreenError("MTPA screen has no FEMM anchor points")
    femm_points = [dict(point) for point in raw_points if isinstance(point, Mapping)]
    if len(femm_points) <= SMOKE_POINT_COUNT:
        raise FiaTorqueMapScreenError("MTPA FEMM anchor is too sparse")
    mtpa_geometry = mtpa.get("machine_geometry")
    if isinstance(mtpa_geometry, Mapping):
        mtpa_rotor_od = float(mtpa_geometry.get("rotor_outer_diameter_mm") or 0.0)
        mtpa_rotor_id = float(mtpa_geometry.get("rotor_inner_diameter_mm") or 0.0)
        if (
            abs(mtpa_rotor_od - inputs.rotor_outer_diameter_mm) > 0.05
            or abs(mtpa_rotor_id - inputs.rotor_inner_diameter_mm) > 0.05
        ):
            raise FiaTorqueMapScreenError(
                "MTPA screen geometry is stale vs twin concentric writeback "
                f"(MTPA rotor {mtpa_rotor_id}/{mtpa_rotor_od} mm vs twin "
                f"{inputs.rotor_inner_diameter_mm}/"
                f"{inputs.rotor_outer_diameter_mm} mm); rerun MTPA first"
            )
    return em_case, mtpa, voltage_fw, femm_points, oc_rms_b


def run_selftest() -> int:
    """Prove hybrid density and permanent release honesty without live twin."""

    from em_fia_mtpa_screen import run_screen_grid, select_grid

    quantities = {
        "continuous_power_kw": 250.0,
        "front_regen_electrical_cap_kw": 250.0,
        "dc_bus_voltage_v": 750.0,
        "dc_bus_min_voltage_v": 600.0,
        "dc_bus_max_voltage_v": 900.0,
        "max_rotor_speed_rpm": 19_500.0,
        "front_bay_envelope_w_mm": 343.0,
        "front_bay_envelope_d_mm": 259.0,
        "front_bay_envelope_h_mm": 267.0,
        "fpk_mass_cap_kg": 32.0,
        "stack_length_mm": 97.58,
        "turns_per_coil": 4.0,
        "turns_per_phase": 14.0,
        "winding_parallel_paths": 2.0,
        "stator_slots": 24.0,
        "phase_current_design_a": 535.0,
    }
    concentric = {
        "housing_od_mm": 214.5,
        "housing_len_mm": 140.5,
        "stator_od_mm": 202.5,
        "stator_id_mm": 161.2,
        "rotor_od_mm": 159.8,
        "rotor_id_mm": 130.5,
        "airgap_mm": 0.7,
        "stack_len_mm": 97.58,
    }
    from em_fia_front_kit_case import inputs_from_sections

    inputs = inputs_from_sections(quantities, concentric)
    geometry = derive_fia_geometry(inputs)
    duty = analytical_duty_check(inputs)
    grid = select_grid(fast=True)

    def mock_solve(assumptions: Any) -> Any:
        from em_fia_front_kit_case import LoadedMagneticResult

        torque = -(
            120.0
            - 0.1 * abs(assumptions.current_angle_electrical_deg + 45.0)
        )
        return LoadedMagneticResult(
            peak_airgap_flux_density_t=1.35,
            rms_airgap_flux_density_t=0.78,
            mean_airgap_flux_density_t=0.65,
            minimum_airgap_flux_density_t=0.08,
            torque_nm=torque,
        )

    femm_points, _ = run_screen_grid(
        geometry,
        Path("/mock/femmcli"),
        remanence_t=1.2,
        duty=duty,
        inputs=inputs,
        grid=grid,
        solve_point=mock_solve,
    )
    current_scaled, loss_corners, fw_curve, summary = run_hybrid_screen(
        inputs=inputs,
        geometry=geometry,
        duty=duty,
        femm_points=femm_points,
        open_circuit_rms_airgap_flux_density_t=0.42,
    )
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        duty=duty,
        femm_points=femm_points,
        current_scaled=current_scaled,
        loss_corners=loss_corners,
        fw_curve=fw_curve,
        summary=summary,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
        femm_anchor_refs={
            "em_fia_mtpa_screen": "synthetic",
            "em_fia_front_kit_case": "synthetic",
            "em_fia_voltage_fw_screen": "synthetic",
        },
    )
    checks = {
        "geometry_binds_enlarged_bore": (
            summary.rotor_inner_diameter_mm == 130.5
            and summary.rotor_outer_diameter_mm == 159.8
        ),
        "denser_than_mtpa_alone": summary.total_screen_points > 35,
        "current_scaled_is_cartesian": (
            summary.current_scaled_points
            == len(femm_points) * len(CURRENT_MAGNITUDE_FRACTIONS)
        ),
        "fw_curve_covers_buses": (
            summary.fw_capability_points
            == len(FW_SPEED_FRACTIONS) * 3
        ),
        "loss_corners_present": summary.loss_corner_points == len(
            CURRENT_MAGNITUDE_FRACTIONS
        ),
        "release_honesty": (
            artifact["status"] == "PARTIAL"
            and artifact["ship_ok"] is False
            and artifact["torque_map_screen"]["status"] == "PARTIAL"
            and artifact["torque_map"]["status"] == "OPEN"
            and artifact["field_weakening_map"]["status"] == "OPEN"
            and artifact["coverage"]["closed_torque_map"] is False
            and artifact["coverage"]["closed_field_weakening_map"] is False
        ),
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "summary": asdict(summary),
                "ship_ok": artifact["ship_ok"],
                "torque_map": artifact["torque_map"]["status"],
                "field_weakening_map": artifact["field_weakening_map"]["status"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Build hybrid torque-map screen from live twin EM artefacts."""

    inputs, state_hash = load_twin_inputs(twin_dir / "state.json")
    geometry = derive_fia_geometry(inputs)
    duty = analytical_duty_check(inputs)
    if not geometry.fits_housing or not geometry.fits_bay:
        raise FiaTorqueMapScreenError(
            "Twin-bound magnetic geometry does not fit the kit"
        )
    em_case, mtpa, voltage_fw, femm_points, oc_rms_b = _validate_upstream_artefacts(
        twin_dir,
        inputs,
    )
    current_scaled, loss_corners, fw_curve, summary = run_hybrid_screen(
        inputs=inputs,
        geometry=geometry,
        duty=duty,
        femm_points=femm_points,
        open_circuit_rms_airgap_flux_density_t=oc_rms_b,
    )
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        duty=duty,
        femm_points=femm_points,
        current_scaled=current_scaled,
        loss_corners=loss_corners,
        fw_curve=fw_curve,
        summary=summary,
        source_state_sha256=state_hash,
        source_twin=_source_twin_label(twin_dir),
        femm_anchor_refs={
            "em_fia_front_kit_case": str(
                (twin_dir / "_motor_stack" / EM_CASE_FILENAME).resolve()
            ),
            "em_fia_mtpa_screen": str(
                (twin_dir / "_motor_stack" / MTPA_FILENAME).resolve()
            ),
            "em_fia_voltage_fw_screen": str(
                (twin_dir / "_motor_stack" / VOLTAGE_FW_FILENAME).resolve()
            ),
        },
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / OUTPUT_FILENAME
    )
    _atomic_write_json(destination, artifact)
    print(
        "FIA hybrid torque-map SCREEN complete: "
        f"{summary.total_screen_points} total points "
        f"({summary.femm_anchor_points} FEMM + "
        f"{summary.current_scaled_points} current-scaled + "
        f"{summary.fw_capability_points} FW + "
        f"{summary.loss_corner_points} loss); peak |T|="
        f"{summary.peak_torque_magnitude_nm:.2f} N·m "
        f"({summary.peak_torque_vs_required_ratio:.2f}× required); "
        f"rotor ID/OD {summary.rotor_inner_diameter_mm:.1f}/"
        f"{summary.rotor_outer_diameter_mm:.1f} mm. "
        "torque_map OPEN; field_weakening_map OPEN; ship_ok false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse selftest or live-twin mode and run the hybrid torque-map screen."""

    parser = argparse.ArgumentParser(
        description=(
            "Build twin-bound hybrid torque-map SCREEN from FEMM anchors + "
            "analytical extensions (maps remain OPEN)."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic hybrid-density and honesty proveCatch",
    )
    mode.add_argument(
        "--twin",
        type=Path,
        help=f"live twin directory (expected default: {DEFAULT_TWIN})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="optional artefact path; defaults under twin _motor_stack",
    )
    args = parser.parse_args()
    if args.selftest:
        if args.output is not None:
            parser.error("--output is only valid with --twin")
        return run_selftest()
    return run_live_case(args.twin.resolve(), args.output)


if __name__ == "__main__":
    raise SystemExit(main())
