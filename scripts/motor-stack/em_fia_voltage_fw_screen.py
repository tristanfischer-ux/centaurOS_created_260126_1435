#!/usr/bin/env python3
"""FIA-bound analytical voltage / field-weakening SCREEN.

This companion advances the electromagnetic evidence beyond torque-only MTPA
by binding the twin's 600/750/900 V DC-link cases to a coarse speed-dependent
back-EMF estimate and one loaded terminal-voltage estimate at the twin design
current. It consumes the existing twin-bound open-circuit FEMM air-gap result;
it does not run another finite-element solve.

The model does not yet contain identified Rs, Ld, Lq, saturation maps, PWM
overmodulation, loss maps, temperature corners, controller limits or dyno
correlation. It therefore remains a PARTIAL screen: ``ship_ok`` is always
false, and both the torque map and field-weakening map remain OPEN.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping

from em_fia_front_kit_case import (
    DEFAULT_TWIN,
    ROTOR_POLES,
    FiaMachineGeometry,
    TwinInputs,
    _atomic_write_json,
    derive_fia_geometry,
    input_quantities_sha256,
    inputs_from_sections,
    load_twin_inputs,
)

SCHEMA = "forgeos.motor_stack.em_fia_voltage_fw_screen/v1"
OUTPUT_FILENAME = "em_fia_voltage_fw_screen.json"
EM_CASE_FILENAME = "em_fia_front_kit_case.json"
POLE_PAIRS = ROTOR_POLES // 2
WINDING_FACTOR = 0.96
POWER_FACTOR_SCREEN = 0.95
VOLTAGE_CONTROL_RESERVE = 0.95
SPEED_FRACTIONS = (0.0, 0.5, 0.75, 1.0)


class FiaVoltageFwScreenError(RuntimeError):
    """Raised when twin-bound voltage screening evidence is incomplete."""


@dataclass(frozen=True)
class VoltageScreenResult:
    """Coarse back-EMF and loaded-voltage results across FIA bus cases."""

    max_speed_rpm: float
    electrical_frequency_hz_at_max_speed: float
    open_circuit_rms_airgap_flux_density_t: float
    estimated_peak_flux_per_pole_wb: float
    estimated_pm_flux_linkage_peak_wb: float
    estimated_back_emf_phase_rms_v_at_max_speed: float
    estimated_back_emf_line_line_rms_v_at_max_speed: float
    estimated_loaded_terminal_line_line_rms_v: float
    phase_current_rms_a: float
    power_factor_screen: float
    voltage_control_reserve: float
    speed_points: tuple[dict[str, float], ...]
    max_speed_bus_cases: tuple[dict[str, Any], ...]
    worst_case_voltage_utilisation: float
    worst_case_voltage_headroom: float
    back_emf_no_fw_speed_rpm_at_min_bus: float
    field_weakening_indicated_at_max_speed: bool
    verdict: str


def available_line_line_rms_voltage_v(dc_bus_voltage_v: float) -> float:
    """Return the sinusoidal-PWM line-line RMS ceiling.

    @description Uses the same ``Vdc·√3/(2√2)`` relation as the existing
        FIA electromagnetic duty check.
    @param dc_bus_voltage_v Positive DC-link voltage.
    @returns Available fundamental line-line RMS voltage.
    @throws FiaVoltageFwScreenError When the bus voltage is not positive.
    """

    if not math.isfinite(dc_bus_voltage_v) or dc_bus_voltage_v <= 0.0:
        raise FiaVoltageFwScreenError("DC bus voltage must be positive and finite")
    return dc_bus_voltage_v * math.sqrt(3.0) / (2.0 * math.sqrt(2.0))


def _estimate_pm_flux_linkage_peak_wb(
    inputs: TwinInputs,
    geometry: FiaMachineGeometry,
    open_circuit_rms_airgap_flux_density_t: float,
) -> tuple[float, float]:
    """Estimate peak pole flux and PM flux linkage from the OC FEMM field.

    @description Treats spatial air-gap RMS flux density as the RMS value of a
        sinusoidal radial wave. Integrating that wave over one pole pitch gives
        ``Φpk≈2√2·B_rms·r_g·L/p``; linkage is ``kw·Nphase·Φpk``.
    @param inputs Twin turns-per-phase seed.
    @param geometry Twin-bound active dimensions.
    @param open_circuit_rms_airgap_flux_density_t FEMM OC spatial RMS field.
    @returns Peak flux per pole and peak PM phase flux linkage.
    @throws FiaVoltageFwScreenError When evidence or geometry is non-positive.
    """

    values = (
        open_circuit_rms_airgap_flux_density_t,
        inputs.turns_per_phase,
        geometry.active_length_mm,
        geometry.rotor_outer_diameter_mm,
        geometry.stator_inner_diameter_mm,
    )
    if any(not math.isfinite(value) or value <= 0.0 for value in values):
        raise FiaVoltageFwScreenError(
            "Open-circuit field, turns and active geometry must be positive and finite"
        )
    airgap_radius_m = (
        geometry.rotor_outer_diameter_mm + geometry.stator_inner_diameter_mm
    ) / 4_000.0
    active_length_m = geometry.active_length_mm / 1_000.0
    pole_flux_peak_wb = (
        2.0
        * math.sqrt(2.0)
        * open_circuit_rms_airgap_flux_density_t
        * airgap_radius_m
        * active_length_m
        / POLE_PAIRS
    )
    flux_linkage_peak_wb = WINDING_FACTOR * inputs.turns_per_phase * pole_flux_peak_wb
    return pole_flux_peak_wb, flux_linkage_peak_wb


def run_voltage_screen(
    inputs: TwinInputs,
    geometry: FiaMachineGeometry,
    *,
    open_circuit_rms_airgap_flux_density_t: float,
) -> VoltageScreenResult:
    """Evaluate coarse speed/back-EMF and max-speed FIA bus cases.

    INTENT: Answer whether the existing OC field and loaded FIA duty clearly
    enter the inverter voltage ceiling at 19,500 rpm, while refusing to infer a
    release field-weakening schedule without Rs/Ld/Lq and saturated dq maps.

    @param inputs Twin duty, winding, current and DC-link quantities.
    @param geometry Twin-bound electromagnetic geometry.
    @param open_circuit_rms_airgap_flux_density_t Existing FEMM OC RMS field.
    @returns Immutable voltage-screen result.
    @throws FiaVoltageFwScreenError On invalid bus ordering or current.
    """

    if not (
        0.0
        < inputs.dc_bus_min_voltage_v
        <= inputs.dc_bus_voltage_v
        <= inputs.dc_bus_max_voltage_v
    ):
        raise FiaVoltageFwScreenError(
            "Twin DC bus must satisfy 0 < minimum <= nominal <= maximum"
        )
    if inputs.phase_current_design_a is None or inputs.phase_current_design_a <= 0.0:
        raise FiaVoltageFwScreenError(
            "Twin phase_current_design_a is required for the loaded voltage screen"
        )
    pole_flux_peak_wb, flux_linkage_peak_wb = _estimate_pm_flux_linkage_peak_wb(
        inputs,
        geometry,
        open_circuit_rms_airgap_flux_density_t,
    )
    max_speed_rpm = float(inputs.max_rotor_speed_rpm)
    electrical_frequency_hz = max_speed_rpm * POLE_PAIRS / 60.0
    electrical_omega_rad_s = 2.0 * math.pi * electrical_frequency_hz
    back_emf_phase_rms_v = (
        electrical_omega_rad_s * flux_linkage_peak_wb / math.sqrt(2.0)
    )
    back_emf_line_line_rms_v = math.sqrt(3.0) * back_emf_phase_rms_v
    phase_current_rms_a = float(inputs.phase_current_design_a)
    loaded_terminal_line_line_rms_v = (
        inputs.continuous_electrical_power_kw
        * 1_000.0
        / inputs.inverter_efficiency_assumption
        / (math.sqrt(3.0) * phase_current_rms_a * POWER_FACTOR_SCREEN)
    )

    speed_points: list[dict[str, float]] = []
    for fraction in SPEED_FRACTIONS:
        speed_rpm = max_speed_rpm * fraction
        speed_points.append(
            {
                "speed_rpm": round(speed_rpm, 6),
                "electrical_frequency_hz": round(
                    speed_rpm * POLE_PAIRS / 60.0,
                    6,
                ),
                "estimated_back_emf_phase_rms_v": round(
                    back_emf_phase_rms_v * fraction,
                    6,
                ),
                "estimated_back_emf_line_line_rms_v": round(
                    back_emf_line_line_rms_v * fraction,
                    6,
                ),
            }
        )

    bus_voltages = (
        float(inputs.dc_bus_min_voltage_v),
        float(inputs.dc_bus_voltage_v),
        float(inputs.dc_bus_max_voltage_v),
    )
    bus_cases: list[dict[str, Any]] = []
    for dc_bus_voltage_v in bus_voltages:
        available_v = available_line_line_rms_voltage_v(dc_bus_voltage_v)
        usable_v = available_v * VOLTAGE_CONTROL_RESERVE
        back_emf_utilisation = back_emf_line_line_rms_v / usable_v
        loaded_utilisation = loaded_terminal_line_line_rms_v / usable_v
        controlling_utilisation = max(back_emf_utilisation, loaded_utilisation)
        bus_cases.append(
            {
                "speed_rpm": max_speed_rpm,
                "dc_bus_voltage_v": dc_bus_voltage_v,
                "available_line_line_rms_voltage_v": round(available_v, 6),
                "usable_line_line_rms_voltage_v_with_reserve": round(
                    usable_v,
                    6,
                ),
                "estimated_back_emf_line_line_rms_v": round(
                    back_emf_line_line_rms_v,
                    6,
                ),
                "estimated_loaded_terminal_line_line_rms_v": round(
                    loaded_terminal_line_line_rms_v,
                    6,
                ),
                "back_emf_voltage_utilisation": round(back_emf_utilisation, 6),
                "loaded_voltage_utilisation": round(loaded_utilisation, 6),
                "controlling_voltage_utilisation": round(
                    controlling_utilisation,
                    6,
                ),
                "voltage_headroom": round(1.0 - controlling_utilisation, 6),
                "field_weakening_indicated": controlling_utilisation >= 1.0,
            }
        )

    worst_case = max(
        bus_cases,
        key=lambda row: float(row["controlling_voltage_utilisation"]),
    )
    worst_utilisation = float(worst_case["controlling_voltage_utilisation"])
    field_weakening_indicated = any(
        bool(row["field_weakening_indicated"]) for row in bus_cases
    )
    min_bus_usable_v = float(
        bus_cases[0]["usable_line_line_rms_voltage_v_with_reserve"]
    )
    no_fw_speed_rpm = (
        max_speed_rpm * min_bus_usable_v / back_emf_line_line_rms_v
        if back_emf_line_line_rms_v > 0.0
        else math.inf
    )
    verdict = (
        "FIELD_WEAKENING_INDICATED_AT_MAX_SPEED"
        if field_weakening_indicated
        else "NOT_INDICATED_BY_COARSE_BACK_EMF_AND_LOADED_VOLTAGE_SCREEN"
    )
    return VoltageScreenResult(
        max_speed_rpm=max_speed_rpm,
        electrical_frequency_hz_at_max_speed=round(electrical_frequency_hz, 6),
        open_circuit_rms_airgap_flux_density_t=round(
            open_circuit_rms_airgap_flux_density_t,
            9,
        ),
        estimated_peak_flux_per_pole_wb=round(pole_flux_peak_wb, 9),
        estimated_pm_flux_linkage_peak_wb=round(flux_linkage_peak_wb, 9),
        estimated_back_emf_phase_rms_v_at_max_speed=round(
            back_emf_phase_rms_v,
            6,
        ),
        estimated_back_emf_line_line_rms_v_at_max_speed=round(
            back_emf_line_line_rms_v,
            6,
        ),
        estimated_loaded_terminal_line_line_rms_v=round(
            loaded_terminal_line_line_rms_v,
            6,
        ),
        phase_current_rms_a=phase_current_rms_a,
        power_factor_screen=POWER_FACTOR_SCREEN,
        voltage_control_reserve=VOLTAGE_CONTROL_RESERVE,
        speed_points=tuple(speed_points),
        max_speed_bus_cases=tuple(bus_cases),
        worst_case_voltage_utilisation=round(worst_utilisation, 6),
        worst_case_voltage_headroom=round(1.0 - worst_utilisation, 6),
        back_emf_no_fw_speed_rpm_at_min_bus=round(no_fw_speed_rpm, 3),
        field_weakening_indicated_at_max_speed=field_weakening_indicated,
        verdict=verdict,
    )


def _read_em_case(twin_dir: Path) -> tuple[dict[str, Any], Path]:
    """Read the existing twin-bound FEMM open-circuit artefact."""

    path = twin_dir / "_motor_stack" / EM_CASE_FILENAME
    if not path.is_file():
        raise FiaVoltageFwScreenError(f"FIA electromagnetic case not found: {path}")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise FiaVoltageFwScreenError(
            f"Cannot read FIA electromagnetic case {path}: {error}"
        ) from error
    if not isinstance(payload, dict):
        raise FiaVoltageFwScreenError(
            f"FIA electromagnetic case must be a JSON object: {path}"
        )
    return payload, path


def _open_circuit_rms_airgap_flux_density_t(
    em_case: Mapping[str, Any],
) -> float:
    """Extract a positive FEMM open-circuit RMS air-gap field."""

    finite_element = em_case.get("finite_element_point")
    if not isinstance(finite_element, Mapping):
        raise FiaVoltageFwScreenError(
            "FIA electromagnetic case has no finite_element_point"
        )
    raw = finite_element.get("rms_airgap_flux_density_t")
    try:
        value = float(raw)
    except (TypeError, ValueError) as error:
        raise FiaVoltageFwScreenError(
            "FIA electromagnetic case has no numeric OC RMS air-gap field"
        ) from error
    if not math.isfinite(value) or value <= 0.0:
        raise FiaVoltageFwScreenError(
            "FIA electromagnetic OC RMS air-gap field must be positive and finite"
        )
    return value


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: FiaMachineGeometry,
    result: VoltageScreenResult,
    source_state_sha256: str,
    source_twin: str,
    em_case_path: str,
    em_case_input_quantities_sha256: str,
) -> dict[str, Any]:
    """Assemble the permanently non-release voltage/FW screening artefact."""

    result_payload = asdict(result)
    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "machine_geometry": asdict(geometry),
        "open_circuit_evidence": {
            "path": em_case_path,
            "input_quantities_sha256": em_case_input_quantities_sha256,
            "rms_airgap_flux_density_t": (
                result.open_circuit_rms_airgap_flux_density_t
            ),
            "evidence_class": "existing twin-bound 2D nonlinear FEMM OC point",
        },
        "screening_results": result_payload,
        "speed_points": list(result.speed_points),
        "max_speed_bus_cases": list(result.max_speed_bus_cases),
        "voltage_fw_screen": {
            "status": "PARTIAL",
            "verdict": result.verdict,
            "field_weakening_indicated_at_max_speed": (
                result.field_weakening_indicated_at_max_speed
            ),
            "max_speed_rpm": result.max_speed_rpm,
            "estimated_back_emf_line_line_rms_v_at_max_speed": (
                result.estimated_back_emf_line_line_rms_v_at_max_speed
            ),
            "estimated_loaded_terminal_line_line_rms_v": (
                result.estimated_loaded_terminal_line_line_rms_v
            ),
            "worst_case_voltage_utilisation": (result.worst_case_voltage_utilisation),
            "worst_case_voltage_headroom": result.worst_case_voltage_headroom,
            "back_emf_no_fw_speed_rpm_at_min_bus": (
                result.back_emf_no_fw_speed_rpm_at_min_bus
            ),
            "note": (
                "A false FW indication means only that this coarse OC back-EMF "
                "and loaded terminal-voltage estimate stays below the FIA bus "
                "ceiling. It does not prove that field weakening is unnecessary."
            ),
        },
        "coverage": {
            "speed_points": len(result.speed_points),
            "dc_bus_cases": len(result.max_speed_bus_cases),
            "twin_dc_bus_min_nominal_max_evaluated": True,
            "back_emf_estimated_from_oc_femm": True,
            "loaded_terminal_voltage_estimated": True,
            "rs_identified": False,
            "ld_lq_maps_identified": False,
            "saturation_map_evaluated": False,
            "pwm_overmodulation_evaluated": False,
            "temperature_corners_evaluated": False,
            "closed_torque_map": False,
            "closed_field_weakening_map": False,
        },
        "model_assumptions": [
            (
                "Spatial OC B_rms is treated as a sinusoidal radial wave; "
                "Φpk≈2√2·B_rms·r_g·L/p."
            ),
            (f"PM phase flux linkage ≈ kw·Nphase·Φpk with kw={WINDING_FACTOR:.2f}."),
            "Back-EMF scales linearly with electrical speed from the OC estimate.",
            (
                "Loaded terminal V_LL estimate uses Pdc/(ηinv·√3·Irms·PF) "
                f"with PF={POWER_FACTOR_SCREEN:.2f}."
            ),
            (
                "Usable inverter voltage applies a "
                f"{VOLTAGE_CONTROL_RESERVE:.2f} control reserve to "
                "Vdc·√3/(2√2)."
            ),
            "No Rs/Ld/Lq voltage vector or saturated dq flux map is claimed.",
        ],
        "torque_map": {
            "status": "OPEN",
            "reason": (
                "Voltage screening does not add current-magnitude, full speed, "
                "loss, temperature, mesh-convergence or dyno torque coverage."
            ),
        },
        "field_weakening_map": {
            "status": "OPEN",
            "reason": (
                "A controller-grade FW schedule requires identified Rs, "
                "saturated Ld/Lq/ψpm maps, current/voltage circles, thermal "
                "limits and dyno correlation."
            ),
        },
        "release_statement": (
            "SCREEN evidence only. No field-weakening calibration, FIA "
            "homologation, dynamometer correlation, race evidence or permission "
            "to ship."
        ),
    }


def _source_twin_label(twin_dir: Path) -> str:
    """Return a stable repository-relative twin label when possible."""

    repo_root = Path(__file__).resolve().parents[2]
    try:
        return str(twin_dir.resolve().relative_to(repo_root))
    except ValueError:
        return str(twin_dir.resolve())


def _synthetic_inputs_and_geometry() -> tuple[TwinInputs, FiaMachineGeometry]:
    """Build the FIA nominal synthetic fixture used by the selftest."""

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
        "housing_od_mm": 176.7,
        "housing_len_mm": 140.5,
        "stator_od_mm": 164.7,
        "stator_id_mm": 123.4,
        "rotor_od_mm": 122.0,
        "rotor_id_mm": 92.7,
        "airgap_mm": 0.7,
        "stack_len_mm": 97.58,
    }
    inputs = inputs_from_sections(quantities, concentric)
    return inputs, derive_fia_geometry(inputs)


def run_selftest() -> int:
    """Prove bus binding, voltage catch and permanent release honesty."""

    inputs, geometry = _synthetic_inputs_and_geometry()
    nominal = run_voltage_screen(
        inputs,
        geometry,
        open_circuit_rms_airgap_flux_density_t=0.2041942345,
    )
    # proveCatch: an absurd OC field must cross the minimum-bus voltage ceiling.
    excessive_flux = run_voltage_screen(
        inputs,
        geometry,
        open_circuit_rms_airgap_flux_density_t=2.5,
    )
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        result=nominal,
        source_state_sha256="synthetic-state",
        source_twin="synthetic-twin",
        em_case_path="synthetic-em-case.json",
        em_case_input_quantities_sha256="synthetic-inputs",
    )
    checks = {
        "twin_bus_window_bound": (
            [row["dc_bus_voltage_v"] for row in nominal.max_speed_bus_cases]
            == [600.0, 750.0, 900.0]
        ),
        "max_speed_bound": nominal.max_speed_rpm == 19_500.0,
        "speed_grid_loaded": (
            len(nominal.speed_points) == len(SPEED_FRACTIONS)
            and nominal.speed_points[-1]["speed_rpm"] == 19_500.0
        ),
        "nominal_back_emf_positive": (
            nominal.estimated_back_emf_line_line_rms_v_at_max_speed > 0.0
        ),
        "nominal_loaded_voltage_positive": (
            nominal.estimated_loaded_terminal_line_line_rms_v > 0.0
        ),
        "absurd_flux_proves_fw_catch": (
            excessive_flux.field_weakening_indicated_at_max_speed
            and excessive_flux.worst_case_voltage_utilisation > 1.0
        ),
        "release_honesty": (
            artifact["status"] == "PARTIAL"
            and artifact["ship_ok"] is False
            and artifact["voltage_fw_screen"]["status"] == "PARTIAL"
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
                "nominal": asdict(nominal),
                "absurd_flux_worst_utilisation": (
                    excessive_flux.worst_case_voltage_utilisation
                ),
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
    """Run and persist the analytical voltage/FW screen against one twin."""

    inputs, state_hash = load_twin_inputs(twin_dir / "state.json")
    geometry = derive_fia_geometry(inputs)
    em_case, em_case_path = _read_em_case(twin_dir)
    current_input_hash = input_quantities_sha256(inputs)
    em_case_input_hash = str(em_case.get("input_quantities_sha256") or "")
    if em_case_input_hash != current_input_hash:
        raise FiaVoltageFwScreenError(
            "Existing FIA electromagnetic case was solved against different "
            "selected input quantities; rerun em_fia_front_kit_case.py first"
        )
    open_circuit_rms_b = _open_circuit_rms_airgap_flux_density_t(em_case)
    result = run_voltage_screen(
        inputs,
        geometry,
        open_circuit_rms_airgap_flux_density_t=open_circuit_rms_b,
    )
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        result=result,
        source_state_sha256=state_hash,
        source_twin=_source_twin_label(twin_dir),
        em_case_path=str(em_case_path.resolve()),
        em_case_input_quantities_sha256=em_case_input_hash,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / OUTPUT_FILENAME
    )
    _atomic_write_json(destination, artifact)
    fw_word = (
        "INDICATED"
        if result.field_weakening_indicated_at_max_speed
        else "not indicated by this coarse screen"
    )
    print(
        "FIA voltage / field-weakening SCREEN complete: "
        f"{result.max_speed_rpm:,.0f} rpm, OC B_rms="
        f"{result.open_circuit_rms_airgap_flux_density_t:.3f} T, "
        f"estimated back-EMF={result.estimated_back_emf_line_line_rms_v_at_max_speed:.1f} "
        "V line-line rms, estimated loaded terminal="
        f"{result.estimated_loaded_terminal_line_line_rms_v:.1f} V line-line rms, "
        f"worst utilisation={result.worst_case_voltage_utilisation:.3f} "
        f"at {inputs.dc_bus_min_voltage_v:.0f} Vdc; FW {fw_word}. "
        "PARTIAL; torque_map OPEN; ship_ok false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse selftest or live-twin mode and run the voltage/FW screen."""

    parser = argparse.ArgumentParser(
        description=(
            "Estimate twin-bound back-EMF and loaded voltage against FIA DC "
            "bus limits (PARTIAL; torque/FW maps remain OPEN)."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic bus-binding and excessive-flux proveCatch",
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
