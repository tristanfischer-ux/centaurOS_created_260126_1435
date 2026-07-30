#!/usr/bin/env python3
"""FIA-bound denser current-angle × rotor-position MTPA SCREEN.

This companion reuses the twin loader, geometry derivation, excitation model,
and native xfemm point solver from ``em_fia_front_kit_case.py``.  The default
campaign is deliberately modest: seven commanded current angles by five
mechanical rotor positions (35 loaded points) at the twin design current.

The result is a denser two-dimensional SCREEN, not a closed torque map.  It
does not cover current magnitude, speed/voltage limits, losses, temperature,
demagnetisation, field weakening, mesh convergence, or dynamometer
correlation.  Consequently ``ship_ok`` is permanently false and
``torque_map.status`` remains ``OPEN``.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from pyleecan.Functions.load import load

from em_fia_front_kit_case import (
    DEFAULT_TWIN,
    MATERIAL_MACHINE_PATH,
    ROTOR_POLES,
    DutyCheck,
    FiaFrontKitCaseError,
    FiaMachineGeometry,
    LoadedMagneticResult,
    LoadedPointAssumptions,
    TwinInputs,
    _atomic_write_json,
    _solver_identity,
    _solver_path,
    analytical_duty_check,
    derive_fia_geometry,
    input_quantities_sha256,
    inputs_from_sections,
    load_twin_inputs,
    loaded_point_assumptions,
    run_loaded_magnetic_point,
)


SCHEMA = "forgeos.motor_stack.em_fia_mtpa_screen/v1"
OUTPUT_FILENAME = "em_fia_mtpa_screen.json"
SMOKE_POINT_COUNT = 1
POLE_PAIRS = ROTOR_POLES // 2

# INTENT: Resolve the broad torque-producing region around the front-kit
# point-case optimum without pretending to be an optimisation-grade MTPA map.
DEFAULT_CURRENT_ANGLES_ELECTRICAL_DEG = (
    -30.0,
    -35.0,
    -40.0,
    -45.0,
    -50.0,
    -55.0,
    -60.0,
)
DEFAULT_ROTOR_POSITIONS_MECHANICAL_DEG = (0.0, 11.25, 22.5, 33.75, 45.0)
FAST_CURRENT_ANGLES_ELECTRICAL_DEG = (-40.0, -50.0)
FAST_ROTOR_POSITIONS_MECHANICAL_DEG = (0.0, 22.5)


class FiaMtpaScreenError(RuntimeError):
    """Raised when the denser screen cannot produce honest finite evidence."""


@dataclass(frozen=True)
class ScreenGrid:
    """Commanded current-angle and rotor-position axes."""

    current_angles_electrical_deg: tuple[float, ...]
    rotor_positions_mechanical_deg: tuple[float, ...]
    mode: str

    @property
    def n_points(self) -> int:
        """Return the Cartesian grid point count."""

        return len(self.current_angles_electrical_deg) * len(
            self.rotor_positions_mechanical_deg
        )


SolvePoint = Callable[[LoadedPointAssumptions], LoadedMagneticResult]
ProgressCallback = Callable[[int, int, Mapping[str, float]], None]


def select_grid(*, fast: bool) -> ScreenGrid:
    """Select the documented default or reduced live/selftest grid.

    @description The default is 7 × 5 (35 points); ``--fast`` is 2 × 2
        (four points). Both are Cartesian screens at one current magnitude.
    @param fast Whether to select the reduced four-point campaign.
    @returns Immutable screen-axis definition.
    """

    if fast:
        return ScreenGrid(
            current_angles_electrical_deg=FAST_CURRENT_ANGLES_ELECTRICAL_DEG,
            rotor_positions_mechanical_deg=FAST_ROTOR_POSITIONS_MECHANICAL_DEG,
            mode="fast",
        )
    return ScreenGrid(
        current_angles_electrical_deg=DEFAULT_CURRENT_ANGLES_ELECTRICAL_DEG,
        rotor_positions_mechanical_deg=DEFAULT_ROTOR_POSITIONS_MECHANICAL_DEG,
        mode="default",
    )


def phase_excitation_angle_electrical_deg(
    commanded_current_angle_electrical_deg: float,
    rotor_position_mechanical_deg: float,
) -> float:
    """Convert a rotor-relative current command into stator phase excitation.

    INTENT: A current angle means one dq command relative to the rotor. When
    the rotor geometry advances mechanically, the stator current phasor must
    advance by pole-pairs × mechanical angle; otherwise a position sweep
    silently changes the dq command and mostly measures phase misalignment.

    @param commanded_current_angle_electrical_deg Rotor-relative command.
    @param rotor_position_mechanical_deg Mechanical FEM rotor position.
    @returns Absolute electrical angle passed to the reused phase-current model.
    """

    return float(commanded_current_angle_electrical_deg) + (
        POLE_PAIRS * float(rotor_position_mechanical_deg)
    )


def _point_row(
    *,
    commanded_angle_deg: float,
    rotor_position_deg: float,
    excitation_angle_deg: float,
    result: LoadedMagneticResult,
) -> dict[str, float]:
    """Build one serialisable finite-element grid row."""

    return {
        "current_angle_electrical_deg": float(commanded_angle_deg),
        "rotor_position_mechanical_deg": float(rotor_position_deg),
        "phase_excitation_angle_electrical_deg": float(excitation_angle_deg),
        "torque_nm": float(result.torque_nm),
        "torque_magnitude_nm": abs(float(result.torque_nm)),
        "peak_airgap_flux_density_t": float(
            result.peak_airgap_flux_density_t
        ),
        "rms_airgap_flux_density_t": float(result.rms_airgap_flux_density_t),
        "mean_airgap_flux_density_t": float(result.mean_airgap_flux_density_t),
        "minimum_airgap_flux_density_t": float(
            result.minimum_airgap_flux_density_t
        ),
    }


def summarize_screen(
    points: Sequence[Mapping[str, float]],
    *,
    required_shaft_torque_nm: float,
) -> dict[str, Any]:
    """Summarise the denser screen by commanded angle and global peak.

    @description Selects the screening angle by mean absolute torque over the
        sampled rotor positions. This is a comparative SCREEN metric, not a
        converged MTPA controller setpoint.
    @param points Cartesian grid rows.
    @param required_shaft_torque_nm Analytical duty torque for context ratios.
    @returns Aggregate and per-angle metrics.
    @throws FiaMtpaScreenError When no complete finite rows are supplied.
    """

    if not points:
        raise FiaMtpaScreenError("MTPA screen requires at least one solved point")
    by_angle: dict[float, list[Mapping[str, float]]] = {}
    for point in points:
        angle = float(point["current_angle_electrical_deg"])
        torque = float(point["torque_nm"])
        if not math.isfinite(angle) or not math.isfinite(torque):
            raise FiaMtpaScreenError("MTPA screen contains non-finite evidence")
        by_angle.setdefault(angle, []).append(point)

    angle_rows: list[dict[str, Any]] = []
    for angle in sorted(by_angle):
        rows = by_angle[angle]
        torques = [float(row["torque_nm"]) for row in rows]
        magnitudes = [abs(torque) for torque in torques]
        mean_magnitude = sum(magnitudes) / len(magnitudes)
        angle_rows.append(
            {
                "current_angle_electrical_deg": angle,
                "n_positions": len(rows),
                "torque_min_nm": round(min(torques), 6),
                "torque_max_nm": round(max(torques), 6),
                "torque_mean_nm": round(sum(torques) / len(torques), 6),
                "torque_magnitude_mean_nm": round(mean_magnitude, 6),
                "torque_magnitude_peak_nm": round(max(magnitudes), 6),
                "mean_torque_vs_required_ratio": round(
                    (
                        mean_magnitude / required_shaft_torque_nm
                        if required_shaft_torque_nm > 0.0
                        else 0.0
                    ),
                    6,
                ),
            }
        )

    best_angle = max(
        angle_rows,
        key=lambda row: float(row["torque_magnitude_mean_nm"]),
    )
    peak_point = max(points, key=lambda row: abs(float(row["torque_nm"])))
    return {
        "n_points": len(points),
        "n_current_angles": len(by_angle),
        "n_rotor_positions_per_angle": min(len(rows) for rows in by_angle.values()),
        "peak_torque_nm": round(float(peak_point["torque_nm"]), 6),
        "peak_torque_magnitude_nm": round(abs(float(peak_point["torque_nm"])), 6),
        "peak_torque_current_angle_electrical_deg": float(
            peak_point["current_angle_electrical_deg"]
        ),
        "peak_torque_rotor_position_mechanical_deg": float(
            peak_point["rotor_position_mechanical_deg"]
        ),
        "peak_airgap_flux_density_t": round(
            max(float(point["peak_airgap_flux_density_t"]) for point in points),
            9,
        ),
        "best_screened_current_angle_electrical_deg": float(
            best_angle["current_angle_electrical_deg"]
        ),
        "best_angle_mean_torque_magnitude_nm": float(
            best_angle["torque_magnitude_mean_nm"]
        ),
        "best_angle_mean_torque_vs_required_ratio": float(
            best_angle["mean_torque_vs_required_ratio"]
        ),
        "required_shaft_torque_nm": float(required_shaft_torque_nm),
        "by_current_angle": angle_rows,
    }


def run_screen_grid(
    geometry: FiaMachineGeometry,
    solver: Path,
    *,
    remanence_t: float,
    duty: DutyCheck,
    inputs: TwinInputs,
    grid: ScreenGrid,
    solve_point: SolvePoint | None = None,
    on_progress: ProgressCallback | None = None,
) -> tuple[list[dict[str, float]], dict[str, Any]]:
    """Solve the Cartesian current-angle × rotor-position screen.

    @description Reuses the front-kit excitation and loaded xfemm point solver.
        A test-only injected solver permits a fast honesty selftest without
        representing mocked values as live evidence.
    @param geometry Twin-bound front-kit FEM geometry.
    @param solver Native femmcli path.
    @param remanence_t NdFeB remanence from the pinned material record.
    @param duty Analytical front-kit duty.
    @param inputs Twin-selected current and winding quantities.
    @param grid Screen axes.
    @param solve_point Optional injected point solver for unit/selftest only.
    @param on_progress Optional callback after each solved point.
    @returns Point rows and aggregate screen summary.
    """

    if grid.n_points <= SMOKE_POINT_COUNT:
        raise FiaMtpaScreenError(
            f"Screen grid must exceed {SMOKE_POINT_COUNT} smoke point"
        )

    def solve_live(assumptions: LoadedPointAssumptions) -> LoadedMagneticResult:
        return run_loaded_magnetic_point(
            geometry,
            solver,
            remanence_t=remanence_t,
            assumptions=assumptions,
        )

    solve = solve_point or solve_live
    points: list[dict[str, float]] = []
    for commanded_angle in grid.current_angles_electrical_deg:
        for rotor_position in grid.rotor_positions_mechanical_deg:
            excitation_angle = phase_excitation_angle_electrical_deg(
                commanded_angle,
                rotor_position,
            )
            assumptions = loaded_point_assumptions(
                duty,
                inputs,
                current_angle_electrical_deg=excitation_angle,
                rotor_position_mechanical_deg=rotor_position,
            )
            result = solve(assumptions)
            row = _point_row(
                commanded_angle_deg=commanded_angle,
                rotor_position_deg=rotor_position,
                excitation_angle_deg=excitation_angle,
                result=result,
            )
            points.append(row)
            if on_progress is not None:
                on_progress(len(points), grid.n_points, row)
    return points, summarize_screen(
        points,
        required_shaft_torque_nm=duty.required_shaft_torque_nm,
    )


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: FiaMachineGeometry,
    duty: DutyCheck,
    grid: ScreenGrid,
    points: Sequence[Mapping[str, float]],
    summary: Mapping[str, Any],
    solver_identity: Mapping[str, str],
    source_state_sha256: str,
    source_twin: str,
    runtime_seconds: float,
) -> dict[str, Any]:
    """Assemble the permanently non-release MTPA screening artefact."""

    design_assumptions = loaded_point_assumptions(duty, inputs)
    denser_than_smoke = grid.n_points > SMOKE_POINT_COUNT
    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "machine_geometry": asdict(geometry),
        "grid": {
            "mode": grid.mode,
            "current_angles_electrical_deg": list(
                grid.current_angles_electrical_deg
            ),
            "rotor_positions_mechanical_deg": list(
                grid.rotor_positions_mechanical_deg
            ),
            "n_current_angles": len(grid.current_angles_electrical_deg),
            "n_rotor_positions": len(grid.rotor_positions_mechanical_deg),
            "n_points": grid.n_points,
            "phase_current_rms_a": design_assumptions.phase_current_rms_a,
            "current_magnitude_basis": (
                "Twin design I_rms selected by em_fia_front_kit_case."
            ),
            "excitation_tracking": (
                "phase excitation angle = rotor-relative commanded current "
                f"angle + {POLE_PAIRS} pole-pairs × rotor mechanical position"
            ),
            "default_campaign": (
                "7 current angles × 5 rotor positions = 35 loaded FEMM points"
            ),
            "fast_campaign": (
                "2 current angles × 2 rotor positions = 4 loaded FEMM points"
            ),
        },
        "points": [dict(point) for point in points],
        "summary": dict(summary),
        "coverage": {
            "smoke_point_count": SMOKE_POINT_COUNT,
            "screen_point_count": grid.n_points,
            "denser_than_smoke": denser_than_smoke,
            "cartesian_current_angle_by_rotor_position": True,
            "current_magnitudes": 1,
            "speeds": 0,
            "temperatures": 0,
            "voltage_limit_evaluated": False,
            "losses_evaluated": False,
            "mesh_convergence_evaluated": False,
            "closed_torque_map": False,
        },
        "mtpa_screen": {
            "status": "PARTIAL",
            "best_screened_current_angle_electrical_deg": summary.get(
                "best_screened_current_angle_electrical_deg"
            ),
            "selection_metric": (
                "largest mean |weighted-stress torque| across sampled rotor "
                "positions at one design current magnitude"
            ),
            "note": (
                "Comparative denser SCREEN only. This is not an optimisation-"
                "grade MTPA schedule and cannot close torque_map."
            ),
        },
        "analytical_duty_check": asdict(duty),
        "solver": dict(solver_identity),
        "runtime": {
            "seconds": round(float(runtime_seconds), 3),
            "seconds_per_point": round(
                float(runtime_seconds) / max(grid.n_points, 1),
                3,
            ),
        },
        "torque_map": {
            "status": "OPEN",
            "reason": (
                "One-current-magnitude current-angle × rotor-position screen "
                "does not cover speed/voltage, current magnitude, losses, "
                "temperature, demagnetisation, field weakening, mesh "
                "convergence, or dynamometer correlation."
            ),
        },
        "release_statement": (
            "SCREEN evidence only. No FIA homologation, team interface close, "
            "dynamometer correlation, race evidence, or permission to ship."
        ),
    }


def _source_twin_label(twin_dir: Path) -> str:
    """Return a stable repository-relative twin label when possible."""

    repo_root = Path(__file__).resolve().parents[2]
    try:
        return str(twin_dir.resolve().relative_to(repo_root))
    except ValueError:
        return str(twin_dir.resolve())


def run_selftest() -> int:
    """Prove fast-grid density and permanent release honesty without FEMM."""

    quantities = {
        "continuous_power_kw": 250.0,
        "front_regen_electrical_cap_kw": 250.0,
        "dc_bus_voltage_v": 750.0,
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
    geometry = derive_fia_geometry(inputs)
    duty = analytical_duty_check(inputs)
    grid = select_grid(fast=True)

    # DECISION: Selftest mocks only the expensive point solve. It exercises the
    # real grid/excitation/summarisation/artefact path and labels the solver
    # mocked; live evidence can only be written by --twin.
    def mock_solve(assumptions: LoadedPointAssumptions) -> LoadedMagneticResult:
        torque = -(
            100.0
            - 0.1 * abs(assumptions.current_angle_electrical_deg + 45.0)
        )
        return LoadedMagneticResult(
            peak_airgap_flux_density_t=1.25,
            rms_airgap_flux_density_t=0.72,
            mean_airgap_flux_density_t=0.61,
            minimum_airgap_flux_density_t=0.08,
            torque_nm=torque,
        )

    points, summary = run_screen_grid(
        geometry,
        Path("/mock/femmcli"),
        remanence_t=1.2,
        duty=duty,
        inputs=inputs,
        grid=grid,
        solve_point=mock_solve,
    )
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        duty=duty,
        grid=grid,
        points=points,
        summary=summary,
        solver_identity={"name": "mocked selftest solver", "version": "test"},
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
        runtime_seconds=0.0,
    )
    checks = {
        "fast_grid_is_2_by_2": (
            len(grid.current_angles_electrical_deg) == 2
            and len(grid.rotor_positions_mechanical_deg) == 2
            and grid.n_points == 4
        ),
        "fast_grid_is_denser_than_smoke": (
            grid.n_points > SMOKE_POINT_COUNT
            and artifact["coverage"]["denser_than_smoke"] is True
        ),
        "cartesian_rows_complete": len(points) == grid.n_points,
        "dq_angle_tracks_rotor": (
            phase_excitation_angle_electrical_deg(-45.0, 15.0) == 15.0
        ),
        "summary_is_finite": (
            summary["n_points"] == 4
            and math.isfinite(summary["peak_torque_magnitude_nm"])
        ),
        "release_honesty": (
            artifact["status"] == "PARTIAL"
            and artifact["ship_ok"] is False
            and artifact["mtpa_screen"]["status"] == "PARTIAL"
            and artifact["torque_map"]["status"] == "OPEN"
            and artifact["coverage"]["closed_torque_map"] is False
        ),
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "grid": asdict(grid),
                "summary": summary,
                "ship_ok": artifact["ship_ok"],
                "torque_map": artifact["torque_map"]["status"],
                "solver": "MOCKED FOR SELFTEST ONLY",
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(
    twin_dir: Path,
    *,
    fast: bool,
    output_path: Path | None = None,
) -> int:
    """Run and persist the live denser screen against one twin."""

    started = time.monotonic()
    inputs, state_hash = load_twin_inputs(twin_dir / "state.json")
    geometry = derive_fia_geometry(inputs)
    duty = analytical_duty_check(inputs)
    if not geometry.fits_housing or not geometry.fits_bay:
        raise FiaMtpaScreenError("Twin-bound magnetic geometry does not fit the kit")
    solver = _solver_path()
    material_machine = load(str(MATERIAL_MACHINE_PATH))
    remanence_t = float(
        material_machine.rotor.hole[0].magnet_0.mat_type.mag.Brm20
    )
    grid = select_grid(fast=fast)

    def report_progress(
        completed: int,
        total: int,
        row: Mapping[str, float],
    ) -> None:
        elapsed = time.monotonic() - started
        print(
            f"MTPA SCREEN {completed}/{total}: "
            f"γ={row['current_angle_electrical_deg']:.1f}° elec, "
            f"θ={row['rotor_position_mechanical_deg']:.2f}° mech, "
            f"T={row['torque_nm']:.2f} N·m, elapsed={elapsed:.1f}s",
            flush=True,
        )

    try:
        points, summary = run_screen_grid(
            geometry,
            solver,
            remanence_t=remanence_t,
            duty=duty,
            inputs=inputs,
            grid=grid,
            on_progress=report_progress,
        )
    except FiaFrontKitCaseError as error:
        raise FiaMtpaScreenError(str(error)) from error
    runtime_seconds = time.monotonic() - started
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        duty=duty,
        grid=grid,
        points=points,
        summary=summary,
        solver_identity=_solver_identity(solver),
        source_state_sha256=state_hash,
        source_twin=_source_twin_label(twin_dir),
        runtime_seconds=runtime_seconds,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / OUTPUT_FILENAME
    )
    _atomic_write_json(destination, artifact)
    print(
        "FIA MTPA denser SCREEN complete: "
        f"{grid.n_points} points ({len(grid.current_angles_electrical_deg)} "
        f"angles × {len(grid.rotor_positions_mechanical_deg)} positions) at "
        f"{artifact['grid']['phase_current_rms_a']:.1f} A rms; peak |T|="
        f"{summary['peak_torque_magnitude_nm']:.2f} N·m, peak B="
        f"{summary['peak_airgap_flux_density_t']:.3f} T, runtime="
        f"{runtime_seconds:.1f}s. torque_map OPEN; ship_ok false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse selftest or live-twin mode and run the MTPA screen."""

    parser = argparse.ArgumentParser(
        description=(
            "Solve a twin-bound current-angle × rotor-position MTPA SCREEN "
            "(torque_map remains OPEN)."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run the mocked 2×2 honesty/density proveCatch",
    )
    mode.add_argument(
        "--twin",
        type=Path,
        help=f"live twin directory (expected default: {DEFAULT_TWIN})",
    )
    parser.add_argument(
        "--fast",
        action="store_true",
        help="use reduced 2×2 grid instead of default 7×5 campaign",
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
    return run_live_case(
        args.twin.resolve(),
        fast=bool(args.fast),
        output_path=args.output,
    )


if __name__ == "__main__":
    raise SystemExit(main())
