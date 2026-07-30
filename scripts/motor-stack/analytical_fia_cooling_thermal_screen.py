#!/usr/bin/env python3
"""Twin-bound lumped cooling/thermal PARTIAL screen for the FIA front motor stack.

INTENT: Bind motor and inverter loss quantities to one steady coolant energy
balance and expose screening winding, magnet, and SiC-module temperatures. This
is not conjugate heat transfer and has no flow-bench correlation; both release
holds remain OPEN and ``ship_ok`` is permanently false.
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
SCHEMA = "forgeos.motor_stack.analytical_fia_cooling_thermal_screen/v1"

# DECISION: Match the existing motor:thermal-lumped tool assumptions so this
# screen can independently re-check its contract writeback. These are model
# seeds, not measured thermal resistances.
DEFAULT_COOLANT_DENSITY_KG_M3 = 1040.5
DEFAULT_COOLANT_CP_J_KGK = 3503.0
DEFAULT_WINDING_TO_COOLANT_K_PER_W = 0.01
DEFAULT_MAGNET_TO_WINDING_K_PER_W = 0.05
DEFAULT_MODULE_TO_COOLANT_K_PER_W = 0.01
DEFAULT_WINDING_LIMIT_C = 180.0
DEFAULT_MAGNET_LIMIT_C = 150.0
DEFAULT_MODULE_LIMIT_C = 175.0


class FiaCoolingThermalScreenError(RuntimeError):
    """Raised when twin binding or the lumped thermal model is invalid."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected orchestratorContract quantities controlling the thermal screen."""

    copper_loss_w: float
    iron_loss_w: float
    magnet_loss_w: float
    inverter_dissipated_kw: float
    coolant_flow_l_min: float
    coolant_inlet_c: float
    coolant_density_kg_m3: float
    coolant_cp_j_kgk: float
    winding_to_coolant_k_per_w: float
    magnet_to_winding_k_per_w: float
    module_to_coolant_k_per_w: float
    winding_limit_c: float
    magnet_limit_c: float
    module_limit_c: float
    contract_winding_temperature_c: float | None
    contract_magnet_temperature_c: float | None
    contract_module_temperature_c: float | None


@dataclass(frozen=True)
class ThermalResults:
    """Steady lumped coolant and component temperature screen results."""

    motor_loss_w: float
    inverter_loss_w: float
    total_loss_w: float
    coolant_mass_flow_kg_s: float
    coolant_temperature_rise_k: float
    coolant_outlet_temperature_c: float
    calculated_winding_temperature_c: float
    calculated_magnet_temperature_c: float
    calculated_module_temperature_c: float
    maximum_winding_temperature_c: float
    maximum_magnet_temperature_c: float
    maximum_module_temperature_c: float
    winding_below_screen_limit: bool
    magnet_below_screen_limit: bool
    module_below_screen_limit: bool
    all_temperatures_below_screen_limits: bool


def _raw_number(values: Mapping[str, Any], keys: Sequence[str]) -> float | None:
    """Return the first finite quantity value, including valid zero values."""

    for key in keys:
        raw = values.get(key)
        if isinstance(raw, Mapping):
            raw = raw.get("value")
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if math.isfinite(value):
            return value
    return None


def _required_positive(values: Mapping[str, Any], keys: Sequence[str]) -> float:
    """Read a required positive quantity from a quantity-style mapping."""

    value = _raw_number(values, keys)
    if value is None or value <= 0.0:
        raise FiaCoolingThermalScreenError(
            "Missing positive twin quantity; expected one of: " + ", ".join(keys)
        )
    return value


def _nonnegative(
    values: Mapping[str, Any],
    keys: Sequence[str],
    *,
    default: float = 0.0,
) -> float:
    """Read an optional non-negative loss quantity."""

    value = _raw_number(values, keys)
    if value is None:
        return default
    if value < 0.0:
        raise FiaCoolingThermalScreenError(
            "Thermal loss quantity must be non-negative: " + ", ".join(keys)
        )
    return value


def _positive_or_default(
    values: Mapping[str, Any],
    keys: Sequence[str],
    default: float,
) -> float:
    """Read a positive value or use one explicitly documented model seed."""

    value = _raw_number(values, keys)
    return value if value is not None and value > 0.0 else default


def inputs_from_quantities(quantities: Mapping[str, Any]) -> TwinInputs:
    """Build the thermal screen inputs from orchestratorContract quantities.

    INTENT: Losses and coolant duty come from the twin. Thermal resistances use
    quantity values when present, otherwise the same documented seeds as the
    existing motor:thermal-lumped tool.
    """

    cp_j = _raw_number(quantities, ("coolant_cp_j_kgk",))
    if cp_j is None or cp_j <= 500.0:
        cp_kj = _raw_number(quantities, ("coolant_cp_kj_kgk",))
        cp_j = (
            cp_kj * 1000.0
            if cp_kj is not None and cp_kj > 0.0
            else DEFAULT_COOLANT_CP_J_KGK
        )
    return TwinInputs(
        copper_loss_w=_required_positive(
            quantities, ("mgu_copper_loss_w", "copper_loss_w")
        ),
        iron_loss_w=_nonnegative(
            quantities, ("mgu_iron_loss_w", "iron_loss_w")
        ),
        magnet_loss_w=_nonnegative(
            quantities, ("mgu_magnet_loss_w", "magnet_loss_w")
        ),
        inverter_dissipated_kw=_required_positive(
            quantities,
            ("inverter_dissipated_kw", "total_inverter_loss_kw"),
        ),
        coolant_flow_l_min=_required_positive(
            quantities, ("coolant_flow_l_min",)
        ),
        coolant_inlet_c=_required_positive(
            quantities, ("coolant_inlet_c", "assumed_coolant_inlet_c")
        ),
        coolant_density_kg_m3=_positive_or_default(
            quantities,
            ("coolant_density_kg_m3",),
            DEFAULT_COOLANT_DENSITY_KG_M3,
        ),
        coolant_cp_j_kgk=cp_j,
        winding_to_coolant_k_per_w=_positive_or_default(
            quantities,
            ("thermal_resistance_winding_to_coolant_k_per_w",),
            DEFAULT_WINDING_TO_COOLANT_K_PER_W,
        ),
        magnet_to_winding_k_per_w=_positive_or_default(
            quantities,
            ("thermal_resistance_magnet_to_winding_k_per_w",),
            DEFAULT_MAGNET_TO_WINDING_K_PER_W,
        ),
        module_to_coolant_k_per_w=_positive_or_default(
            quantities,
            (
                "thermal_resistance_module_to_coolant_k_per_w",
                "inverter_module_to_coolant_k_per_w",
            ),
            DEFAULT_MODULE_TO_COOLANT_K_PER_W,
        ),
        winding_limit_c=_positive_or_default(
            quantities,
            ("winding_temperature_limit_c", "maximum_winding_temperature_limit_c"),
            DEFAULT_WINDING_LIMIT_C,
        ),
        magnet_limit_c=_positive_or_default(
            quantities,
            ("magnet_temperature_limit_c", "maximum_magnet_temperature_limit_c"),
            DEFAULT_MAGNET_LIMIT_C,
        ),
        module_limit_c=_positive_or_default(
            quantities,
            ("module_temperature_limit_c", "maximum_module_temperature_limit_c"),
            DEFAULT_MODULE_LIMIT_C,
        ),
        contract_winding_temperature_c=_raw_number(
            quantities,
            (
                "mgu_winding_temp_c",
                "winding_temperature_c",
                "maximum_winding_temperature_c",
            ),
        ),
        contract_magnet_temperature_c=_raw_number(
            quantities,
            (
                "mgu_magnet_temp_c",
                "magnet_temperature_c",
                "maximum_magnet_temperature_c",
            ),
        ),
        contract_module_temperature_c=_raw_number(
            quantities,
            (
                "inverter_module_temp_c",
                "sic_module_temperature_c",
                "maximum_module_temperature_c",
                "inverter_junction_temperature_c",
            ),
        ),
    )


def run_screen(inputs: TwinInputs) -> ThermalResults:
    """Solve one steady coolant and three-node lumped thermal screen.

    DECISION: The shared coolant outlet carries motor plus inverter heat. The
    winding, magnet, and module rises are conservative first-order resistive
    rises above that outlet. If the contract already contains a temperature,
    the reported maximum takes the larger of the independent calculation and
    contract value; this catches stale optimistic writeback without claiming
    validation.
    """

    motor_loss_w = inputs.copper_loss_w + inputs.iron_loss_w + inputs.magnet_loss_w
    inverter_loss_w = inputs.inverter_dissipated_kw * 1000.0
    total_loss_w = motor_loss_w + inverter_loss_w
    mass_flow = (
        inputs.coolant_flow_l_min
        / 60.0
        / 1000.0
        * inputs.coolant_density_kg_m3
    )
    if mass_flow <= 0.0 or inputs.coolant_cp_j_kgk <= 0.0:
        raise FiaCoolingThermalScreenError(
            "Coolant mass flow and specific heat must be positive"
        )
    coolant_rise = total_loss_w / (mass_flow * inputs.coolant_cp_j_kgk)
    coolant_outlet = inputs.coolant_inlet_c + coolant_rise
    winding_calc = coolant_outlet + (
        inputs.copper_loss_w + inputs.iron_loss_w
    ) * inputs.winding_to_coolant_k_per_w
    magnet_calc = (
        winding_calc
        + inputs.magnet_loss_w * inputs.magnet_to_winding_k_per_w
    )
    module_calc = (
        coolant_outlet
        + inverter_loss_w * inputs.module_to_coolant_k_per_w
    )
    winding_max = max(
        winding_calc,
        inputs.contract_winding_temperature_c
        if inputs.contract_winding_temperature_c is not None
        else winding_calc,
    )
    magnet_max = max(
        magnet_calc,
        inputs.contract_magnet_temperature_c
        if inputs.contract_magnet_temperature_c is not None
        else magnet_calc,
    )
    module_max = max(
        module_calc,
        inputs.contract_module_temperature_c
        if inputs.contract_module_temperature_c is not None
        else module_calc,
    )
    winding_ok = winding_max <= inputs.winding_limit_c
    magnet_ok = magnet_max <= inputs.magnet_limit_c
    module_ok = module_max <= inputs.module_limit_c
    return ThermalResults(
        motor_loss_w=round(motor_loss_w, 3),
        inverter_loss_w=round(inverter_loss_w, 3),
        total_loss_w=round(total_loss_w, 3),
        coolant_mass_flow_kg_s=round(mass_flow, 6),
        coolant_temperature_rise_k=round(coolant_rise, 4),
        coolant_outlet_temperature_c=round(coolant_outlet, 3),
        calculated_winding_temperature_c=round(winding_calc, 3),
        calculated_magnet_temperature_c=round(magnet_calc, 3),
        calculated_module_temperature_c=round(module_calc, 3),
        maximum_winding_temperature_c=round(winding_max, 3),
        maximum_magnet_temperature_c=round(magnet_max, 3),
        maximum_module_temperature_c=round(module_max, 3),
        winding_below_screen_limit=winding_ok,
        magnet_below_screen_limit=magnet_ok,
        module_below_screen_limit=module_ok,
        all_temperatures_below_screen_limits=winding_ok and magnet_ok and module_ok,
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
    """Selectively read one stable twin state snapshot."""

    if not state_path.is_file():
        raise FiaCoolingThermalScreenError(f"Twin state not found: {state_path}")
    last_error = "Twin state changed during selective-read attempts"
    for attempt in range(5):
        before = state_path.stat()
        quantities = _read_section(state_path, "orchestratorContract.quantities")
        if not quantities:
            quantities = _read_section(state_path, "engineeringContract.quantities")
        state_hash = _stream_sha256(state_path)
        after = state_path.stat()
        if (
            before.st_size == after.st_size
            and before.st_mtime_ns == after.st_mtime_ns
        ):
            return inputs_from_quantities(quantities), state_hash
        last_error = (
            f"Twin state changed during selective-read attempt {attempt + 1}/5"
        )
        time.sleep(0.25 * (attempt + 1))
    raise FiaCoolingThermalScreenError(f"{last_error}; rerun on a stable stamp")


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the quantities selected by this screen."""

    encoded = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_artifact(
    *,
    inputs: TwinInputs,
    results: ThermalResults,
    source_state_sha256: str,
    source_twin: str,
) -> dict[str, Any]:
    """Build the permanently non-release thermal screen artefact."""

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "screening_results": asdict(results),
        "model": {
            "name": "steady_lumped_coolant_plus_three_temperature_nodes",
            "evidence_class": "analytical_screen",
            "thermal_resistance_basis": (
                "orchestratorContract quantities when present; otherwise explicit "
                "motor:thermal-lumped-compatible screening seeds"
            ),
            "contract_temperature_policy": (
                "maximum = max(independent calculation, contract writeback when present)"
            ),
        },
        "conjugate_heat_transfer": {
            "status": "OPEN",
            "statement": (
                "No solid/fluid conjugate heat-transfer mesh, contact/TIM map, "
                "transient lap duty, or mesh convergence."
            ),
        },
        "flow_bench": {
            "status": "OPEN",
            "statement": (
                "No measured jacket/cold-plate pressure-flow or heater-plate "
                "temperature correlation."
            ),
        },
        "temperature_screen": {
            "status": "PARTIAL",
            "all_below_screen_limits": (
                results.all_temperatures_below_screen_limits
            ),
            "limits_are_release_authority": False,
        },
        "honesty_notes": [
            "PARTIAL is a twin-bound steady lumped screen, not CHT validation.",
            "A below-limit screen does not set PASS or ship_ok.",
            "Hardware flow-bench and heater-plate/module correlation remain OPEN.",
        ],
        "release_statement": (
            "Concept evidence only. Never claim thermal release, FIA race readiness, "
            "or permission to ship from this lumped screen."
        ),
    }


def _atomic_write_json(path: Path, payload: Mapping[str, Any]) -> None:
    """Atomically write the thermal artefact."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _synthetic_quantities() -> dict[str, Any]:
    """Return representative FIA front-kit quantities for proveCatch."""

    return {
        "mgu_copper_loss_w": {"value": 2180.0},
        "mgu_iron_loss_w": {"value": 136.0},
        "mgu_magnet_loss_w": {"value": 120.0},
        "inverter_dissipated_kw": {"value": 4.318},
        "coolant_flow_l_min": {"value": 12.0},
        "coolant_inlet_c": {"value": 60.0},
        "coolant_density_kg_m3": {"value": 1040.5},
        "coolant_cp_j_kgk": {"value": 3503.0},
        "mgu_winding_temp_c": {"value": 90.0},
        "mgu_magnet_temp_c": {"value": 105.0},
    }


def run_selftest() -> int:
    """Prove quantity binding, thermal sensitivity, and OPEN-hold enforcement."""

    inputs = inputs_from_quantities(_synthetic_quantities())
    results = run_screen(inputs)
    artifact = build_artifact(
        inputs=inputs,
        results=results,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
    )
    hot_quantities = _synthetic_quantities()
    hot_quantities["mgu_copper_loss_w"] = {"value": 10_000.0}
    hot_quantities["inverter_dissipated_kw"] = {"value": 10.0}
    hot = run_screen(inputs_from_quantities(hot_quantities))
    checks = {
        "twin_quantities_drive_energy_balance": (
            results.total_loss_w == 6754.0
            and results.coolant_temperature_rise_k > 0.0
            and results.maximum_winding_temperature_c >= 90.0
            and results.maximum_magnet_temperature_c >= 105.0
        ),
        "higher_loss_raises_temperatures": (
            hot.coolant_outlet_temperature_c
            > results.coolant_outlet_temperature_c
            and hot.maximum_winding_temperature_c
            > results.maximum_winding_temperature_c
            and hot.maximum_module_temperature_c
            > results.maximum_module_temperature_c
        ),
        "open_holds_block_shipping": (
            artifact["status"] == "PARTIAL"
            and artifact["ship_ok"] is False
            and artifact["conjugate_heat_transfer"]["status"] == "OPEN"
            and artifact["flow_bench"]["status"] == "OPEN"
        ),
        "temperature_values_are_finite": all(
            math.isfinite(value)
            for value in (
                results.maximum_winding_temperature_c,
                results.maximum_magnet_temperature_c,
                results.maximum_module_temperature_c,
            )
        ),
        "contract_temperature_is_conservative_floor": (
            results.maximum_winding_temperature_c
            >= float(inputs.contract_winding_temperature_c or 0.0)
            and results.maximum_magnet_temperature_c
            >= float(inputs.contract_magnet_temperature_c or 0.0)
        ),
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "screening_results": asdict(results),
                "hot_screening_results": asdict(hot),
                "ship_ok": artifact["ship_ok"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist the thermal screen against one live twin."""

    inputs, state_hash = load_twin_inputs(twin_dir / "state.json")
    results = run_screen(inputs)
    try:
        twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
    except ValueError:
        twin_label = str(twin_dir.resolve())
    artifact = build_artifact(
        inputs=inputs,
        results=results,
        source_state_sha256=state_hash,
        source_twin=twin_label,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir
        / "_motor_stack"
        / "analytical_fia_cooling_thermal_screen.json"
    )
    _atomic_write_json(destination, artifact)
    print(
        "FIA front-kit lumped cooling/thermal screen: "
        f"Q_motor={results.motor_loss_w / 1000.0:.3f} kW + "
        f"Q_inverter={results.inverter_loss_w / 1000.0:.3f} kW; "
        f"coolant {inputs.coolant_inlet_c:.1f}→"
        f"{results.coolant_outlet_temperature_c:.1f} °C; "
        f"T_winding≤{results.maximum_winding_temperature_c:.1f} °C, "
        f"T_magnet≤{results.maximum_magnet_temperature_c:.1f} °C, "
        f"T_module≤{results.maximum_module_temperature_c:.1f} °C. "
        "CHT OPEN; flow bench OPEN; status PARTIAL; ship_ok false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse the self-test or live-twin mode."""

    parser = argparse.ArgumentParser(
        description="Run the FIA-bound lumped cooling/thermal PARTIAL screen."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--selftest", action="store_true")
    mode.add_argument(
        "--twin",
        type=Path,
        help=f"live twin directory (expected default: {DEFAULT_TWIN})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="optional artefact path; defaults under twin/_motor_stack",
    )
    args = parser.parse_args()
    if args.selftest:
        if args.output is not None:
            parser.error("--output is only valid with --twin")
        return run_selftest()
    return run_live_case(args.twin.resolve(), args.output)


if __name__ == "__main__":
    raise SystemExit(main())
