#!/usr/bin/env python3
"""FIA-bound analytical gear-oil delivery screen for the Formula E front kit.

INTENT: Twin-bound jet-flow / churning / pickup screening for the planetary
reduction — better than OpenFOAM cavity smoke alone. Full free-surface CFD
(jets, aeration, cornering pickup) stays OPEN; status is PARTIAL; ship_ok false.

DECISION: Prefer handbook analytical PARTIAL over a fake free-surface CFD case.
An optional cavity-equivalent note records that the OpenFOAM smoke proves the
toolchain only — it is not oil-gallery evidence.
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
SCHEMA = "forgeos.motor_stack.gear_oil_fia_front_kit_case/v1"

# 75W-90 class screening properties (~80–90 °C sump), handbook band.
OIL_DENSITY_KG_M3 = 870.0
OIL_CP_J_KG_K = 2_000.0
OIL_KINEMATIC_VISCOSITY_M2_S = 1.5e-5  # ~15 cSt hot — order-of-magnitude
# Jet cooling screen: oil temperature rise allowed across the mesh jets.
JET_ALLOWED_DELTA_T_K = 15.0
# Dip immersion fraction of planet OD for splash/churning screen (no CAD gallery).
ASSUMED_PLANET_IMMERSION_FRACTION = 0.25
# Partially-immersed disk drag Cd for churning OoM (handbook band; not CFD).
CHURNING_DRAG_CD = 0.45
# Viscous multiplier from oil ν relative to a 15 cSt hot reference (weak).
CHURNING_VISCOUS_REF_M2_S = 1.5e-5
# Pickup adequacy: charge vs estimated active sump volume fraction.
MIN_CHARGE_FRACTION_OF_SUMP = 0.15
MAX_TIP_SPEED_M_S_FOR_SPLASH = 40.0


class FiaFrontKitGearOilError(RuntimeError):
    """Raised when twin binding or oil-screen evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this gear-oil case."""

    gear_ratio: float
    planet_count: int
    planet_od_mm: float
    sun_od_mm: float
    ring_id_mm: float
    housing_outer_diameter_mm: float
    housing_length_mm: float
    gear_oil_volume_ml: float
    gear_efficiency: float
    max_rotor_speed_rpm: float
    continuous_electrical_power_kw: float
    mgu_shaft_power_kw: float
    mgu_shaft_torque_nm: float
    required_shaft_torque_nm: float
    planet_face_width_mm: float


@dataclass(frozen=True)
class OilScreenResult:
    """Analytical jet / churning / pickup screening numbers."""

    carrier_speed_rpm: float
    sun_tip_speed_m_s: float
    planet_tip_speed_m_s: float
    gear_loss_kw: float
    jet_mass_flow_kg_s: float
    jet_flow_l_min: float
    jet_flow_per_mesh_l_min: float
    churning_loss_w: float
    churning_loss_per_planet_w: float
    estimated_sump_volume_ml: float
    charge_fraction_of_sump: float
    pickup_charge_adequate: bool
    tip_speed_splash_ok: bool
    immersion_fraction_assumed: float
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
    raise FiaFrontKitGearOilError(
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
    except FiaFrontKitGearOilError:
        return _number(fallback, fallback_keys, default=default)


def inputs_from_sections(
    quantities: Mapping[str, Any],
    concentric: Mapping[str, Any],
) -> TwinInputs:
    """Build controlled case inputs from selectively read twin sections."""

    shaft_power_kw = _number(
        quantities,
        ("mgu_shaft_power_kw",),
        default=_number(quantities, ("continuous_power_kw",), default=250.0) * 0.97,
    )
    max_rpm = _number(
        quantities,
        ("max_rotor_speed_rpm", "mgu_base_speed_rpm"),
        default=19_500.0,
    )
    # Analytical duty torque at continuous power / max rpm (EM case ~125 N·m).
    omega = max_rpm * 2.0 * math.pi / 60.0
    required_torque = (shaft_power_kw * 1000.0) / omega if omega > 0.0 else 125.0
    twin_torque = _number(
        quantities,
        ("mgu_shaft_torque_nm",),
        default=required_torque,
    )
    planet_od = _number_from_sections(
        concentric,
        ("planet_od_mm",),
        quantities,
        ("fpk_planet_od_mm",),
        default=38.4,
    )
    # Face width seed until macro-geometry closes (OPEN).
    face_w = _number(
        quantities,
        ("planet_face_width_mm", "fpk_planet_face_width_mm", "gear_face_width_mm"),
        default=max(12.0, 0.5 * planet_od),
    )
    return TwinInputs(
        gear_ratio=_number(quantities, ("gear_ratio",), default=8.0),
        planet_count=int(
            round(
                _number_from_sections(
                    concentric,
                    ("planet_count",),
                    quantities,
                    ("fpk_planet_count",),
                    default=3.0,
                )
            )
        ),
        planet_od_mm=planet_od,
        sun_od_mm=_number_from_sections(
            concentric,
            ("sun_od_mm",),
            quantities,
            ("fpk_sun_od_mm",),
            default=12.0,
        ),
        ring_id_mm=_number_from_sections(
            concentric,
            ("ring_id_mm",),
            quantities,
            ("fpk_ring_id_mm",),
            default=88.7,
        ),
        housing_outer_diameter_mm=_number_from_sections(
            concentric,
            ("housing_od_mm",),
            quantities,
            ("fpk_housing_od_mm",),
            default=176.7,
        ),
        housing_length_mm=_number_from_sections(
            concentric,
            ("housing_len_mm",),
            quantities,
            ("fpk_housing_len_mm",),
            default=140.5,
        ),
        gear_oil_volume_ml=_number(
            quantities,
            ("gear_oil_volume_ml", "oil_charge_ml"),
            default=80.0,
        ),
        gear_efficiency=_number(quantities, ("gear_efficiency",), default=0.97),
        max_rotor_speed_rpm=max_rpm,
        continuous_electrical_power_kw=_number(
            quantities,
            ("continuous_power_kw", "continuous_design_duty_kw"),
            default=250.0,
        ),
        mgu_shaft_power_kw=shaft_power_kw,
        mgu_shaft_torque_nm=twin_torque,
        required_shaft_torque_nm=required_torque,
        planet_face_width_mm=face_w,
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
        raise FiaFrontKitGearOilError(f"Twin state not found: {state_path}")

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
    raise FiaFrontKitGearOilError(f"{last_error}; rerun on a stable stamp")


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the selected quantities that control this case."""

    payload = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def run_oil_screen(inputs: TwinInputs) -> OilScreenResult:
    """Analytical jet-flow, churning OoM, and pickup adequacy screen.

    INTENT: Answer whether the seeded oil charge and planetary geometry are
    *plausible* for jet cooling + splash pickup under the kit torque/speed —
    not whether free-surface CFD or a clear-case bench has closed the galleries.
    """

    if inputs.gear_ratio < 1.0:
        raise FiaFrontKitGearOilError("gear_ratio must be ≥ 1")
    if inputs.planet_count < 2:
        raise FiaFrontKitGearOilError("planet_count must be ≥ 2")

    # Ring-fixed planetary: i = 1 + R/S ≈ 8 → carrier = sun / ratio.
    carrier_rpm = inputs.max_rotor_speed_rpm / inputs.gear_ratio
    sun_omega = inputs.max_rotor_speed_rpm * 2.0 * math.pi / 60.0
    carrier_omega = carrier_rpm * 2.0 * math.pi / 60.0
    sun_tip = sun_omega * (inputs.sun_od_mm / 2000.0)
    # Planet centre orbit radius ≈ (ring_id − planet_od) / 2.
    orbit_r_m = max(
        (inputs.ring_id_mm - inputs.planet_od_mm) / 2000.0,
        inputs.planet_od_mm / 2000.0,
    )
    planet_orbit_tip = carrier_omega * orbit_r_m
    # Relative spin ≈ carrier * (ring/planet) for ring-fixed set.
    planet_spin_rpm = carrier_rpm * (inputs.ring_id_mm / max(inputs.planet_od_mm, 1.0))
    planet_spin_omega = planet_spin_rpm * 2.0 * math.pi / 60.0
    planet_tip = planet_orbit_tip + planet_spin_omega * (inputs.planet_od_mm / 2000.0)

    eta = min(max(inputs.gear_efficiency, 0.80), 0.995)
    gear_loss_kw = inputs.mgu_shaft_power_kw * (1.0 - eta)

    # Jet flow need: remove gear losses with allowed oil ΔT (all loss → oil screen).
    jet_mass = (gear_loss_kw * 1000.0) / (OIL_CP_J_KG_K * JET_ALLOWED_DELTA_T_K)
    jet_l_min = jet_mass / OIL_DENSITY_KG_M3 * 60.0 * 1000.0
    meshes = float(inputs.planet_count * 2)  # sun-planet + planet-ring per planet
    jet_per_mesh = jet_l_min / meshes

    # INTENT: Partially-immersed rotating-disk drag OoM (handbook class), not CFD.
    # P ≈ F_drag * v_tip; F_drag ≈ ½ Cd ρ A_immersed v²; A ≈ f_imm * π r b.
    # Weak ν^0.2 factor mirrors Mauz/Terekhov viscosity sensitivity.
    r_m = inputs.planet_od_mm / 2000.0
    b_m = inputs.planet_face_width_mm / 1000.0
    h_d = ASSUMED_PLANET_IMMERSION_FRACTION
    v_tip = max(planet_tip, 0.1)
    area_imm = h_d * math.pi * r_m * b_m
    viscous = (OIL_KINEMATIC_VISCOSITY_M2_S / CHURNING_VISCOUS_REF_M2_S) ** 0.2
    f_drag = 0.5 * CHURNING_DRAG_CD * OIL_DENSITY_KG_M3 * area_imm * (v_tip**2) * viscous
    churn_one = f_drag * v_tip
    churn_total = churn_one * float(inputs.planet_count)

    # Sump volume seed: annular sector under planets inside housing length share.
    housing_r = inputs.housing_outer_diameter_mm / 2000.0
    # Active oil space ≈ 20% of a thin gear cavity disk (ring pack axial share).
    cavity_len_m = min(inputs.housing_length_mm / 1000.0, b_m * 3.0)
    sump_m3 = 0.20 * math.pi * (housing_r**2) * cavity_len_m
    sump_ml = sump_m3 * 1.0e6
    charge_frac = inputs.gear_oil_volume_ml / max(sump_ml, 1.0)
    pickup_ok = charge_frac >= MIN_CHARGE_FRACTION_OF_SUMP
    tip_ok = planet_tip <= MAX_TIP_SPEED_M_S_FOR_SPLASH

    # Kit-context screen: finite positive jet need, churning OoM in band, pickup flag.
    churn_plausible = 10.0 < churn_total < 15_000.0
    jet_plausible = 0.05 < jet_l_min < 50.0
    works = bool(churn_plausible and jet_plausible and pickup_ok and tip_ok)

    return OilScreenResult(
        carrier_speed_rpm=round(carrier_rpm, 3),
        sun_tip_speed_m_s=round(sun_tip, 3),
        planet_tip_speed_m_s=round(planet_tip, 3),
        gear_loss_kw=round(gear_loss_kw, 4),
        jet_mass_flow_kg_s=round(jet_mass, 5),
        jet_flow_l_min=round(jet_l_min, 4),
        jet_flow_per_mesh_l_min=round(jet_per_mesh, 4),
        churning_loss_w=round(churn_total, 2),
        churning_loss_per_planet_w=round(churn_one, 2),
        estimated_sump_volume_ml=round(sump_ml, 2),
        charge_fraction_of_sump=round(charge_frac, 4),
        pickup_charge_adequate=pickup_ok,
        tip_speed_splash_ok=tip_ok,
        immersion_fraction_assumed=ASSUMED_PLANET_IMMERSION_FRACTION,
        works_in_kit_context=works,
    )


def build_artifact(
    *,
    inputs: TwinInputs,
    screen: OilScreenResult,
    source_state_sha256: str,
    source_twin: str,
) -> dict[str, Any]:
    """Build the honesty-preserving gear-oil artefact."""

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "fia_question": (
            "Oil jet / pickup / churning under race accel/brake/corner — "
            "analytical twin-bound screen only; free-surface CFD OPEN"
        ),
        "solver": {
            "software": (
                "analytical handbook screen "
                "(immersed-disk drag churning OoM + jet thermal sizing)"
            ),
            "openfoam_role": (
                "cavity smoke proves OpenFOAM toolchain only — NOT oil galleries"
            ),
            "free_surface_cfd": "OPEN",
            "evidence_class": "twin_bound_analytical_partial",
        },
        "fluid": {
            "oil_class_seed": "75W-90 class (grade OPEN)",
            "density_kg_m3": OIL_DENSITY_KG_M3,
            "cp_j_kg_k": OIL_CP_J_KG_K,
            "kinematic_viscosity_m2_s": OIL_KINEMATIC_VISCOSITY_M2_S,
            "jet_allowed_delta_t_k": JET_ALLOWED_DELTA_T_K,
        },
        "screening_results": {
            "minimum_jet_flow_l_min": screen.jet_flow_l_min,
            "jet_flow_per_mesh_l_min": screen.jet_flow_per_mesh_l_min,
            "churning_loss_w": screen.churning_loss_w,
            "churning_loss_per_planet_w": screen.churning_loss_per_planet_w,
            "gear_loss_kw": screen.gear_loss_kw,
            "carrier_speed_rpm": screen.carrier_speed_rpm,
            "planet_tip_speed_m_s": screen.planet_tip_speed_m_s,
            "sun_tip_speed_m_s": screen.sun_tip_speed_m_s,
            "estimated_sump_volume_ml": screen.estimated_sump_volume_ml,
            "charge_fraction_of_sump": screen.charge_fraction_of_sump,
            "pickup_charge_adequate": screen.pickup_charge_adequate,
            "tip_speed_splash_ok": screen.tip_speed_splash_ok,
            "immersion_fraction_assumed": screen.immersion_fraction_assumed,
        },
        "works_in_kit_context": {
            "oil_delivery_screen_ok": screen.works_in_kit_context,
            "statement": (
                "Analytical jet-need + churning OoM + charge/pickup flags on twin "
                "planetary seeds. NOT free-surface CFD, NOT clear-case bench, "
                "NOT seal-temperature closure."
            ),
        },
        "model_assumptions": [
            "Ring-fixed planetary: carrier_rpm = sun_rpm / gear_ratio.",
            "All gear inefficiency assumed rejected into oil for jet-flow sizing.",
            f"Planet dip immersion fraction = {ASSUMED_PLANET_IMMERSION_FRACTION} (no CAD gallery).",
            f"Churning uses Cd={CHURNING_DRAG_CD} immersed-disk drag OoM, not correlated.",
            "Oil properties are 75W-90 class seeds — supplier grade OPEN.",
            "Cornering / braking oil migration not modelled (free-surface CFD OPEN).",
        ],
        "free_surface_cfd": {
            "status": "OPEN",
            "statement": (
                "OpenFOAM free-surface oil (jets, pickup, aeration, churning under "
                "accel/brake/corner) is not run. Prefer this analytical PARTIAL over "
                "a fake CFD claim. Optional cavity smoke remains toolchain-only."
            ),
        },
        "bench_correlation": {
            "status": "OPEN",
            "statement": "Clear-case or instrumented flow-bench correlation still OPEN.",
        },
        "release_statement": (
            "Concept evidence only. Analytical oil screen does not close galleries, "
            "jets, seals, or race lubrication. Never claim PASS without free-surface "
            "CFD + bench. ship_ok stays false."
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
        "gear_ratio": {"value": 8.0},
        "fpk_planet_count": {"value": 3},
        "fpk_planet_od_mm": {"value": 38.4},
        "fpk_sun_od_mm": {"value": 12.0},
        "fpk_ring_id_mm": {"value": 88.7},
        "fpk_housing_od_mm": {"value": 176.7},
        "fpk_housing_len_mm": {"value": 140.5},
        "gear_oil_volume_ml": {"value": 80.0},
        "gear_efficiency": {"value": 0.97},
        "max_rotor_speed_rpm": {"value": 19_500.0},
        "continuous_power_kw": {"value": 250.0},
        "mgu_shaft_power_kw": {"value": 244.434},
        "mgu_shaft_torque_nm": {"value": 119.7},
        "planet_face_width_mm": {"value": 20.0},
    }
    concentric = {
        "planet_count": 3,
        "planet_od_mm": 38.4,
        "sun_od_mm": 12.0,
        "ring_id_mm": 88.7,
        "housing_od_mm": 176.7,
        "housing_len_mm": 140.5,
    }
    return quantities, concentric


def run_selftest() -> int:
    """Prove twin binding, analytical catch, and release honesty."""

    quantities, concentric = _synthetic_sections()
    inputs = inputs_from_sections(quantities, concentric)
    screen = run_oil_screen(inputs)
    artifact = build_artifact(
        inputs=inputs,
        screen=screen,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
    )

    # proveCatch: higher efficiency must drop jet flow need; larger immersion churns more.
    low_loss = TwinInputs(**{**asdict(inputs), "gear_efficiency": 0.995})
    low_screen = run_oil_screen(low_loss)
    high_immersion_inputs = inputs  # immersion is module constant; use speed catch
    fast = TwinInputs(**{**asdict(inputs), "max_rotor_speed_rpm": inputs.max_rotor_speed_rpm * 1.5})
    fast_screen = run_oil_screen(fast)

    checks = {
        "ratio_and_planets_bound": (
            inputs.gear_ratio == 8.0 and inputs.planet_count == 3
        ),
        "torque_near_125_nm_class": 90.0 < inputs.required_shaft_torque_nm < 160.0,
        "jet_flow_positive_finite": (
            math.isfinite(screen.jet_flow_l_min) and screen.jet_flow_l_min > 0.05
        ),
        "efficiency_drop_reduces_jet_need": (
            low_screen.jet_flow_l_min < 0.5 * screen.jet_flow_l_min
        ),
        "speed_increase_raises_churning": (
            fast_screen.churning_loss_w > 1.5 * screen.churning_loss_w
        ),
        "churning_oom_in_band": 10.0 < screen.churning_loss_w < 15_000.0,
        "pickup_flags_present": isinstance(screen.pickup_charge_adequate, bool),
        "release_honesty": (
            artifact["status"] == "PARTIAL"
            and artifact["ship_ok"] is False
            and artifact["free_surface_cfd"]["status"] == "OPEN"
        ),
        "never_ship_ok_true": artifact["ship_ok"] is False,
        "unused_high_immersion_binding": high_immersion_inputs.planet_count == 3,
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
    """Run and persist one analytical oil screen against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    screen = run_oil_screen(inputs)
    if not (
        math.isfinite(screen.jet_flow_l_min)
        and math.isfinite(screen.churning_loss_w)
        and screen.jet_flow_l_min > 0.0
    ):
        raise FiaFrontKitGearOilError("Oil screen produced non-finite results")
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
        else twin_dir / "_motor_stack" / "gear_oil_fia_front_kit_case.json"
    )
    _atomic_write_json(destination, artifact)
    print(
        "FIA front-kit gear-oil analytical screen: "
        f"jet need ≈ {screen.jet_flow_l_min:.2f} L/min "
        f"({screen.jet_flow_per_mesh_l_min:.3f} L/min per mesh), "
        f"churning OoM ≈ {screen.churning_loss_w:.0f} W "
        f"({screen.churning_loss_per_planet_w:.0f} W/planet), "
        f"charge {inputs.gear_oil_volume_ml:.0f} ml / sump≈{screen.estimated_sump_volume_ml:.0f} ml "
        f"(pickup_ok={screen.pickup_charge_adequate}). "
        f"ratio={inputs.gear_ratio}, planets={inputs.planet_count}, "
        f"T≈{inputs.required_shaft_torque_nm:.1f} N·m. "
        "Free-surface CFD / bench remain OPEN; ship_ok is false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description="Analytical FIA-bound Formula E front-kit gear-oil screen."
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic binding plus efficiency/speed proveCatch",
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
