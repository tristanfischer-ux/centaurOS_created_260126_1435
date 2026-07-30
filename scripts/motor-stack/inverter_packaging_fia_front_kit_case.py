#!/usr/bin/env python3
"""FIA-bound analytical inverter packaging screen for the Formula E front kit.

INTENT: Close a packaging *evidence row* (not a CFD/solver row) for the MCU box:
power density, DC bus current, laminated-bus ESL seed vs target band, cold-plate
interface fit, and honest OPEN holds for module MPN / double-pulse. ship_ok false.
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
SCHEMA = "forgeos.motor_stack.inverter_packaging_fia_front_kit_case/v1"

# Laminated SiC DC-bus ESL screening band (nH) — concept target, not measured.
ESL_TARGET_LOW_NH = 3.0
ESL_TARGET_HIGH_NH = 15.0
ESL_PREFERRED_HIGH_NH = 10.0
# Cold-plate family default length when twin has no plate envelope (serpentine).
DEFAULT_COLD_PLATE_LENGTH_MM = 180.0
DEFAULT_COLD_PLATE_WIDTH_MM = 120.0
# Power-density screen band for a compact SiC traction MCU (kW/L of MCU box).
# Upper bound is deliberately high — race front MCU boxes are volume-starved;
# this flags only absurd densities, not a release thermal claim.
POWER_DENSITY_MIN_KW_L = 20.0
POWER_DENSITY_MAX_KW_L = 1_200.0


class FiaFrontKitInverterPackagingError(RuntimeError):
    """Raised when twin binding or packaging evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this packaging case."""

    dc_bus_voltage_v: float
    continuous_electrical_power_kw: float
    front_regen_electrical_cap_kw: float
    mcu_w_mm: float
    mcu_d_mm: float
    mcu_h_mm: float
    bay_w_mm: float
    bay_d_mm: float
    bay_h_mm: float
    bus_esl_low_nh: float
    bus_esl_nominal_nh: float
    bus_esl_high_nh: float
    cold_plate_channel_width_mm: float
    cold_plate_channel_height_mm: float
    cold_plate_channel_count: int
    cold_plate_length_mm: float
    cold_plate_width_mm: float
    cold_plate_delta_p_pa: float | None
    sic_module_count: int
    inverter_dissipated_kw: float
    inverter_efficiency: float
    mass_inverter_kg: float


@dataclass(frozen=True)
class PackagingScreenResult:
    """Analytical packaging screening numbers."""

    dc_current_a: float
    mcu_volume_l: float
    power_density_kw_l: float
    power_density_in_band: bool
    esl_nominal_in_target_band: bool
    esl_high_within_preferred: bool
    esl_band_low_nh: float
    esl_band_high_nh: float
    cold_plate_covers_mcu_footprint: bool
    cold_plate_interface_area_mm2: float
    mcu_footprint_area_mm2: float
    mcu_fits_bay: bool
    current_density_a_per_module: float
    works_in_kit_context: bool


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
    raise FiaFrontKitInverterPackagingError(
        "Missing positive twin quantity; expected one of: " + ", ".join(keys)
    )


def _optional_number(
    values: Mapping[str, Any],
    keys: Sequence[str],
) -> float | None:
    """Read an optional positive number, returning None on miss."""

    try:
        return _number(values, keys)
    except FiaFrontKitInverterPackagingError:
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
    except FiaFrontKitInverterPackagingError:
        return _number(fallback, fallback_keys, default=default)


def inputs_from_sections(
    quantities: Mapping[str, Any],
    concentric: Mapping[str, Any],
) -> TwinInputs:
    """Build controlled case inputs from selectively read twin sections."""

    mcu_w = _number_from_sections(
        concentric, ("mcu_w_mm",), quantities, ("fpk_mcu_w_mm",), default=115.2
    )
    mcu_d = _number_from_sections(
        concentric, ("mcu_d_mm",), quantities, ("fpk_mcu_d_mm",), default=127.2
    )
    mcu_h = _number_from_sections(
        concentric, ("mcu_h_mm",), quantities, ("fpk_mcu_h_mm",), default=28.0
    )
    # DECISION: Default cold-plate land to the MCU footprint. The serpentine
    # family training length (180 mm) is larger than this MCU box and would
    # falsely imply overhang rather than interface coverage.
    plate_len = _number(
        quantities,
        ("cold_plate_length_mm", "cold_plate_plate_length_mm"),
        default=mcu_w,
    )
    plate_w = _number(
        quantities,
        ("cold_plate_width_mm", "cold_plate_plate_width_mm"),
        default=mcu_d,
    )
    return TwinInputs(
        dc_bus_voltage_v=_number(quantities, ("dc_bus_voltage_v",), default=750.0),
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
        mcu_w_mm=mcu_w,
        mcu_d_mm=mcu_d,
        mcu_h_mm=mcu_h,
        bay_w_mm=_number(
            quantities, ("front_bay_envelope_w_mm",), default=343.0
        ),
        bay_d_mm=_number(
            quantities, ("front_bay_envelope_d_mm",), default=259.0
        ),
        bay_h_mm=_number(
            quantities, ("front_bay_envelope_h_mm",), default=267.0
        ),
        bus_esl_low_nh=_number(quantities, ("fpk_bus_esl_low_nh",), default=4.15),
        bus_esl_nominal_nh=_number(
            quantities, ("fpk_bus_esl_nominal_nh",), default=6.39
        ),
        bus_esl_high_nh=_number(quantities, ("fpk_bus_esl_high_nh",), default=9.9),
        cold_plate_channel_width_mm=_number(
            quantities, ("cold_plate_channel_width_mm",), default=5.345
        ),
        cold_plate_channel_height_mm=_number(
            quantities, ("cold_plate_channel_height_mm",), default=1.336
        ),
        cold_plate_channel_count=int(
            round(_number(quantities, ("cold_plate_channel_count",), default=8.0))
        ),
        cold_plate_length_mm=plate_len,
        cold_plate_width_mm=plate_w,
        cold_plate_delta_p_pa=_optional_number(
            quantities, ("cold_plate_pressure_drop_pa",)
        ),
        sic_module_count=int(
            round(_number(quantities, ("sic_module_count",), default=3.0))
        ),
        inverter_dissipated_kw=_number(
            quantities, ("inverter_dissipated_kw",), default=4.318
        ),
        inverter_efficiency=_number(
            quantities, ("inverter_efficiency",), default=0.98766
        ),
        mass_inverter_kg=_number(quantities, ("mass_inverter_kg",), default=8.2),
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
        raise FiaFrontKitInverterPackagingError(f"Twin state not found: {state_path}")

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
    raise FiaFrontKitInverterPackagingError(f"{last_error}; rerun on a stable stamp")


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the selected quantities that control this case."""

    payload = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def run_packaging_screen(inputs: TwinInputs) -> PackagingScreenResult:
    """Analytical packaging screen for MCU box + bus + cold-plate interface."""

    if inputs.dc_bus_voltage_v < 100.0:
        raise FiaFrontKitInverterPackagingError("dc_bus_voltage_v implausibly low")
    dc_current = (
        inputs.continuous_electrical_power_kw * 1000.0
    ) / inputs.dc_bus_voltage_v
    vol_l = (inputs.mcu_w_mm * inputs.mcu_d_mm * inputs.mcu_h_mm) / 1.0e6
    if vol_l <= 0.0:
        raise FiaFrontKitInverterPackagingError("MCU box volume must be positive")
    density = inputs.continuous_electrical_power_kw / vol_l
    density_ok = POWER_DENSITY_MIN_KW_L <= density <= POWER_DENSITY_MAX_KW_L

    esl_in_band = ESL_TARGET_LOW_NH <= inputs.bus_esl_nominal_nh <= ESL_TARGET_HIGH_NH
    esl_pref = inputs.bus_esl_high_nh <= ESL_PREFERRED_HIGH_NH

    mcu_foot = inputs.mcu_w_mm * inputs.mcu_d_mm
    plate_area = inputs.cold_plate_length_mm * inputs.cold_plate_width_mm
    # Interface fit: plate covers ≥85% of MCU footprint (land under modules).
    covers = plate_area >= 0.85 * mcu_foot
    mcu_fits = (
        inputs.mcu_w_mm <= inputs.bay_w_mm
        and inputs.mcu_d_mm <= inputs.bay_d_mm
        and inputs.mcu_h_mm <= inputs.bay_h_mm
    )
    a_per_mod = dc_current / max(float(inputs.sic_module_count), 1.0)
    works = bool(density_ok and esl_in_band and covers and mcu_fits)

    return PackagingScreenResult(
        dc_current_a=round(dc_current, 3),
        mcu_volume_l=round(vol_l, 5),
        power_density_kw_l=round(density, 2),
        power_density_in_band=density_ok,
        esl_nominal_in_target_band=esl_in_band,
        esl_high_within_preferred=esl_pref,
        esl_band_low_nh=ESL_TARGET_LOW_NH,
        esl_band_high_nh=ESL_TARGET_HIGH_NH,
        cold_plate_covers_mcu_footprint=covers,
        cold_plate_interface_area_mm2=round(plate_area, 2),
        mcu_footprint_area_mm2=round(mcu_foot, 2),
        mcu_fits_bay=mcu_fits,
        current_density_a_per_module=round(a_per_mod, 2),
        works_in_kit_context=works,
    )


def build_artifact(
    *,
    inputs: TwinInputs,
    screen: PackagingScreenResult,
    source_state_sha256: str,
    source_twin: str,
) -> dict[str, Any]:
    """Build the honesty-preserving inverter packaging artefact."""

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "fia_question": (
            f"Can a SiC MCU package {inputs.continuous_electrical_power_kw:.0f} kW at "
            f"{inputs.dc_bus_voltage_v:.0f} V inside the MCU box / cold-plate land "
            "with ESL in the laminated-bus target band?"
        ),
        "evidence_class": "twin_bound_analytical_packaging_partial",
        "screening_results": {
            "dc_current_a": screen.dc_current_a,
            "mcu_volume_l": screen.mcu_volume_l,
            "power_density_kw_l": screen.power_density_kw_l,
            "power_density_in_band": screen.power_density_in_band,
            "bus_esl_low_nh": inputs.bus_esl_low_nh,
            "bus_esl_nominal_nh": inputs.bus_esl_nominal_nh,
            "bus_esl_high_nh": inputs.bus_esl_high_nh,
            "esl_nominal_in_target_band": screen.esl_nominal_in_target_band,
            "esl_high_within_preferred": screen.esl_high_within_preferred,
            "esl_target_band_nh": [ESL_TARGET_LOW_NH, ESL_TARGET_HIGH_NH],
            "esl_preferred_high_nh": ESL_PREFERRED_HIGH_NH,
            "cold_plate_covers_mcu_footprint": screen.cold_plate_covers_mcu_footprint,
            "cold_plate_interface_area_mm2": screen.cold_plate_interface_area_mm2,
            "mcu_footprint_area_mm2": screen.mcu_footprint_area_mm2,
            "mcu_fits_bay": screen.mcu_fits_bay,
            "sic_module_count": inputs.sic_module_count,
            "current_density_a_per_module": screen.current_density_a_per_module,
            "inverter_dissipated_kw": inputs.inverter_dissipated_kw,
            "cold_plate_delta_p_pa_seed": inputs.cold_plate_delta_p_pa,
        },
        "works_in_kit_context": {
            "packaging_screen_ok": screen.works_in_kit_context,
            "statement": (
                "Analytical MCU packaging screen (density / DC current / ESL seed / "
                "cold-plate land / bay fit). Module MPN, supplier STEP, and "
                "double-pulse ESL measurement remain OPEN."
            ),
        },
        "module_mpn_and_step": {
            "status": "OPEN",
            "sic_module_count_seed": inputs.sic_module_count,
            "statement": (
                "Phase-module count is a twin seed only. Supplier MPN, package STEP, "
                "and terminal geometry that drive the laminated bus remain OPEN."
            ),
        },
        "double_pulse_and_measured_esl": {
            "status": "OPEN",
            "statement": (
                "Twin fpk_bus_esl_* values are analytical laminated-bus seeds. "
                "Double-pulse switching energy and measured stray inductance are OPEN."
            ),
        },
        "cold_plate_cfd_note": (
            "Hydraulic Δp may also appear under motorMultiphysics.inverter_cold_plate "
            "when openfoam_fia_cold_plate_case.json exists — packaging screen here is "
            "geometric/electrical, not CHT."
        ),
        "model_assumptions": [
            "DC current = continuous electrical power / DC bus voltage (no ripple).",
            f"ESL target band {ESL_TARGET_LOW_NH}–{ESL_TARGET_HIGH_NH} nH (preferred high ≤{ESL_PREFERRED_HIGH_NH} nH).",
            (
                "Cold-plate land defaults to MCU footprint when plate length is unset "
                f"(serpentine family training length {DEFAULT_COLD_PLATE_LENGTH_MM}×"
                f"{DEFAULT_COLD_PLATE_WIDTH_MM} mm is not forced as the kit land)."
            ),
            "SiC module count from twin quantity seed — not a frozen BOM line.",
        ],
        "release_statement": (
            "Concept packaging evidence only. No module procurement identity, no "
            "measured ESL, no HIL. ship_ok stays false."
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
        "dc_bus_voltage_v": {"value": 750.0},
        "continuous_power_kw": {"value": 250.0},
        "front_regen_electrical_cap_kw": {"value": 250.0},
        "fpk_mcu_w_mm": {"value": 115.2},
        "fpk_mcu_d_mm": {"value": 127.2},
        "fpk_mcu_h_mm": {"value": 28.0},
        "front_bay_envelope_w_mm": {"value": 343.0},
        "front_bay_envelope_d_mm": {"value": 259.0},
        "front_bay_envelope_h_mm": {"value": 267.0},
        "fpk_bus_esl_low_nh": {"value": 4.15},
        "fpk_bus_esl_nominal_nh": {"value": 6.39},
        "fpk_bus_esl_high_nh": {"value": 9.9},
        "cold_plate_channel_width_mm": {"value": 5.345},
        "cold_plate_channel_height_mm": {"value": 1.336},
        "cold_plate_channel_count": {"value": 8},
        "cold_plate_pressure_drop_pa": {"value": 28501.9},
        "sic_module_count": {"value": 3},
        "inverter_dissipated_kw": {"value": 4.318},
        "inverter_efficiency": {"value": 0.98766},
        "mass_inverter_kg": {"value": 8.2},
    }
    concentric = {
        "mcu_w_mm": 115.2,
        "mcu_d_mm": 127.2,
        "mcu_h_mm": 28.0,
    }
    return quantities, concentric


def run_selftest() -> int:
    """Prove twin binding, packaging catch, and release honesty."""

    quantities, concentric = _synthetic_sections()
    inputs = inputs_from_sections(quantities, concentric)
    screen = run_packaging_screen(inputs)
    artifact = build_artifact(
        inputs=inputs,
        screen=screen,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
    )

    # proveCatch: half voltage must double DC current; huge ESL must fail band.
    half_v = TwinInputs(**{**asdict(inputs), "dc_bus_voltage_v": 375.0})
    half_screen = run_packaging_screen(half_v)
    bad_esl = TwinInputs(**{**asdict(inputs), "bus_esl_nominal_nh": 40.0})
    bad_esl_screen = run_packaging_screen(bad_esl)

    checks = {
        "dc_current_333a_class": abs(screen.dc_current_a - 333.333) < 1.0,
        "half_voltage_doubles_current": abs(
            half_screen.dc_current_a - 2.0 * screen.dc_current_a
        )
        < 1.0,
        "power_density_finite": (
            math.isfinite(screen.power_density_kw_l) and screen.power_density_kw_l > 20.0
        ),
        "esl_seed_in_band": screen.esl_nominal_in_target_band is True,
        "bad_esl_fails_band": bad_esl_screen.esl_nominal_in_target_band is False,
        "mcu_fits_bay": screen.mcu_fits_bay is True,
        "module_count_3": inputs.sic_module_count == 3,
        "mpn_and_double_pulse_open": (
            artifact["module_mpn_and_step"]["status"] == "OPEN"
            and artifact["double_pulse_and_measured_esl"]["status"] == "OPEN"
        ),
        "release_honesty": (
            artifact["status"] == "PARTIAL" and artifact["ship_ok"] is False
        ),
        "never_ship_ok_true": artifact["ship_ok"] is False,
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "screening_results": asdict(screen),
                "ship_ok": artifact["ship_ok"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist one packaging screen against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    screen = run_packaging_screen(inputs)
    if not math.isfinite(screen.dc_current_a):
        raise FiaFrontKitInverterPackagingError("Packaging screen non-finite")
    try:
        twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
    except ValueError:
        twin_label = str(twin_dir.resolve())
    artifact = build_artifact(
        inputs=inputs,
        screen=screen,
        source_state_sha256=state_hash,
        source_twin=twin_label,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / "inverter_packaging_fia_front_kit_case.json"
    )
    _atomic_write_json(destination, artifact)
    print(
        "FIA front-kit inverter packaging screen: "
        f"{inputs.continuous_electrical_power_kw:.0f} kW @ {inputs.dc_bus_voltage_v:.0f} V → "
        f"I_dc≈{screen.dc_current_a:.1f} A; MCU "
        f"{inputs.mcu_w_mm:.1f}×{inputs.mcu_d_mm:.1f}×{inputs.mcu_h_mm:.1f} mm → "
        f"{screen.power_density_kw_l:.1f} kW/L; ESL nominal "
        f"{inputs.bus_esl_nominal_nh:.2f} nH "
        f"(band {ESL_TARGET_LOW_NH}–{ESL_TARGET_HIGH_NH} nH, "
        f"in_band={screen.esl_nominal_in_target_band}); "
        f"SiC modules={inputs.sic_module_count}; "
        f"cold-plate land ok={screen.cold_plate_covers_mcu_footprint}. "
        "MPN / double-pulse remain OPEN; ship_ok is false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description="Analytical FIA-bound Formula E front-kit inverter packaging screen."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic binding plus voltage/ESL proveCatch",
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
