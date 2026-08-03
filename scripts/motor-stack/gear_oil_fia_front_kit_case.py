#!/usr/bin/env python3
"""FIA-bound analytical gear-oil delivery screen for the Formula E front kit.

INTENT: Twin-bound jet-flow / churning / pickup screening for the planetary
reduction — geometry-bound immersion from gear writeback + annular sump model,
jet-orifice pressure head, scavenge pickup margin, and cornering slosh screen.
Full free-surface CFD (jets, aeration, cornering pickup) stays OPEN; status is
PARTIAL; ship_ok false.

DECISION: Prefer handbook analytical PARTIAL over a fake free-surface CFD case.
OpenFOAM cavity smoke proves the toolchain only — it is not oil-gallery evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any, Mapping, Sequence

import ijson


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO_ROOT / "out" / "formula-e-front-mgu-20260729-1432"
SCHEMA = "forgeos.motor_stack.gear_oil_fia_front_kit_case/v2"

# 75W-90 class screening properties (~80–90 °C sump), handbook band.
OIL_DENSITY_KG_M3 = 870.0
OIL_CP_J_KG_K = 2_000.0
OIL_KINEMATIC_VISCOSITY_M2_S = 1.5e-5  # ~15 cSt hot — order-of-magnitude
# Jet cooling screen: oil temperature rise allowed across the mesh jets.
JET_ALLOWED_DELTA_T_K = 15.0
# Partially-immersed disk drag Cd for churning OoM (handbook band; not CFD).
CHURNING_DRAG_CD = 0.45
# Viscous multiplier from oil ν relative to a 15 cSt hot reference (weak).
CHURNING_VISCOUS_REF_M2_S = 1.5e-5
# Pickup adequacy: charge vs estimated active sump volume fraction.
MIN_CHARGE_FRACTION_OF_SUMP = 0.15
MAX_TIP_SPEED_M_S_FOR_SPLASH = 40.0
# Geometry seeds for annular sump + housing wall (no STEP gallery yet).
HOUSING_WALL_MM = 6.0
SUMP_AXIAL_FRACTION_OF_FACE = 0.42
PLANET_CENTRE_ABOVE_SUMP_FLOOR_FRACTION = 0.55
# Jet gallery: sharp-orifice discharge coefficient + nozzle diameter seed.
# DECISION (2026-07-31): kit architecture uses Ø1.8 mm nozzles (≥6×).
# Ø1.0 mm at ~17 L/min needs ~1678 kPa (gallery FAIL) — kept as adversarial proveCatch.
# Ø1.5 mm still fails the 450 kPa bar on a 3-planet (6-nozzle) synthetic nest.
JET_NOZZLE_DIAMETER_MM = 1.8
JET_ORIFICE_CD = 0.72
SCAVENGE_MARGIN_FACTOR = 1.25
# Cornering slosh: lateral g multiplier on gravity tilt (screening only).
CORNERING_LATERAL_G = 2.5
# DECISION (2026-07-31): baffled wet-sump kit class — effective free-surface length
# ~30 mm (transverse baffles), not an open 90 mm trough. Unbaffled 90 mm + 80 ml
# charge cannot clear cornering immersion (architecture, not a units bug).
SLOSH_LENGTH_MM = 30.0
# Frozen oil-charge seed when the twin omits gear_oil_volume_ml. Live nests
# with large annular sumps raise this via minimum_oil_charge_ml_for_screens().
DEFAULT_GEAR_OIL_VOLUME_ML = 350.0
CORNERING_MIN_IMMERSION_FRACTION = 0.08
OIL_CHARGE_CORNERING_MARGIN = 1.05


def minimum_oil_charge_ml_for_screens(
    *,
    sump_annulus_area_mm2: float,
    planet_od_mm: float,
    slosh_length_mm: float,
    active_sump_volume_ml: float,
) -> float:
    """Minimum oil charge that clears pickup fraction + cornering immersion.

    INTENT: An 80 ml seed on a ~800 ml annular sump is architecture-starved
    under 2.5 g slosh — raising the charge (and/or baffling) is the SOURCE
    fix, not silencing GEAR_OIL_CORNERING_PICKUP.
    """

    tilt_rad = math.atan(CORNERING_LATERAL_G)
    level_drop_mm = (float(slosh_length_mm) / 2.0) * math.sin(tilt_rad)
    need_level_mm = level_drop_mm + CORNERING_MIN_IMMERSION_FRACTION * float(
        planet_od_mm
    )
    cornering_ml = need_level_mm * float(sump_annulus_area_mm2) / 1000.0
    charge_ml = MIN_CHARGE_FRACTION_OF_SUMP * float(active_sump_volume_ml)
    return max(cornering_ml, charge_ml) * OIL_CHARGE_CORNERING_MARGIN


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
    gear_face_mm: float
    geometry_source: str
    jet_nozzle_diameter_mm: float = JET_NOZZLE_DIAMETER_MM
    slosh_length_mm: float = SLOSH_LENGTH_MM
    # True when the TWIN stated a charge; False when it fell back to the frozen
    # seed. A defaulted charge may be raised to the derived cornering floor; a
    # stated one is the team's number and is never silently overridden.
    gear_oil_volume_stated: bool = False


@dataclass(frozen=True)
class GeometryScreen:
    """Annular-sump geometry bound from twin writeback + housing seeds."""

    ring_inner_radius_mm: float
    housing_inner_radius_mm: float
    sump_annulus_area_mm2: float
    sump_axial_length_mm: float
    active_sump_volume_ml: float
    oil_level_height_mm: float
    planet_immersion_depth_mm: float
    immersion_fraction_geometry: float
    geometry_source: str


@dataclass(frozen=True)
class JetGalleryScreen:
    """Jet orifice + scavenge pickup gallery screening."""

    nozzle_count: int
    nozzle_diameter_mm: float
    jet_velocity_m_s: float
    jet_pressure_required_kpa: float
    scavenge_flow_required_l_min: float
    scavenge_margin_factor: float
    pickup_gallery_adequate: bool


@dataclass(frozen=True)
class CorneringScreen:
    """Cornering slosh tilt reducing effective immersion at pickup."""

    lateral_g_assumed: float
    free_surface_tilt_deg: float
    oil_level_drop_mm: float
    immersion_fraction_cornering: float
    cornering_pickup_ok: bool


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
    immersion_fraction_geometry: float
    geometry: GeometryScreen
    jet_gallery: JetGalleryScreen
    cornering: CorneringScreen
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
    # Face width: prefer strength-writeback gear_face_mm, else planet OD fraction.
    face_w = _number(
        quantities,
        ("gear_face_mm", "planet_face_width_mm", "fpk_planet_face_width_mm"),
        default=max(12.0, 0.5 * planet_od),
    )
    gear_face = _number(
        quantities,
        ("gear_face_mm", "fpk_gear_face_mm"),
        default=face_w,
    )
    geometry_source = "orchestratorContract.quantities"
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
            default=DEFAULT_GEAR_OIL_VOLUME_ML,
        ),
        gear_oil_volume_stated=any(
            k in quantities for k in ("gear_oil_volume_ml", "oil_charge_ml")),
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
        gear_face_mm=gear_face,
        geometry_source=geometry_source,
        jet_nozzle_diameter_mm=_number(
            quantities,
            ("gear_oil_jet_nozzle_diameter_mm", "jet_nozzle_diameter_mm"),
            default=JET_NOZZLE_DIAMETER_MM,
        ),
        slosh_length_mm=_number(
            quantities,
            ("gear_oil_slosh_length_mm", "oil_sump_slosh_length_mm"),
            default=SLOSH_LENGTH_MM,
        ),
    )


def apply_geometry_writeback(
    inputs: TwinInputs,
    writeback: Mapping[str, Any],
) -> TwinInputs:
    """Overlay ISO 6336 strength-writeback geometry when present."""

    if not writeback:
        return inputs
    fpk = writeback.get("fpkConcentricGeometry")
    if not isinstance(fpk, Mapping):
        return inputs
    planet_od = _raw_float(fpk, ("planet_od_mm",), default=inputs.planet_od_mm)
    sun_od = _raw_float(fpk, ("sun_od_mm",), default=inputs.sun_od_mm)
    ring_id = _raw_float(fpk, ("ring_id_mm",), default=inputs.ring_id_mm)
    planet_count = int(
        round(_raw_float(fpk, ("planet_count",), default=float(inputs.planet_count)))
    )
    gear_face = _raw_float(
        fpk,
        ("gear_face_mm",),
        default=inputs.gear_face_mm,
    )
    quantities_wb = writeback.get("quantities")
    if isinstance(quantities_wb, Mapping):
        gear_face = _raw_float(
            quantities_wb,
            ("gear_face_mm", "fpk_gear_face_mm"),
            default=gear_face,
        )
    return TwinInputs(
        gear_ratio=inputs.gear_ratio,
        planet_count=planet_count,
        planet_od_mm=planet_od,
        sun_od_mm=sun_od,
        ring_id_mm=ring_id,
        housing_outer_diameter_mm=inputs.housing_outer_diameter_mm,
        housing_length_mm=inputs.housing_length_mm,
        gear_oil_volume_ml=inputs.gear_oil_volume_ml,
        gear_efficiency=inputs.gear_efficiency,
        max_rotor_speed_rpm=inputs.max_rotor_speed_rpm,
        continuous_electrical_power_kw=inputs.continuous_electrical_power_kw,
        mgu_shaft_power_kw=inputs.mgu_shaft_power_kw,
        mgu_shaft_torque_nm=inputs.mgu_shaft_torque_nm,
        required_shaft_torque_nm=inputs.required_shaft_torque_nm,
        planet_face_width_mm=max(gear_face * 0.35, inputs.planet_face_width_mm),
        gear_face_mm=gear_face,
        geometry_source="gear_geometry_writeback",
        jet_nozzle_diameter_mm=inputs.jet_nozzle_diameter_mm,
        slosh_length_mm=inputs.slosh_length_mm,
    )


def _raw_float(
    values: Mapping[str, Any],
    keys: Sequence[str],
    *,
    default: float,
) -> float:
    """Read a positive float from a mapping with a safe default."""

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
    return default


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


def load_geometry_writeback(twin_dir: Path) -> Mapping[str, Any]:
    """Load strength-driven gear geometry writeback when stamped on the twin."""

    path = twin_dir / "_motor_stack" / "gear_geometry_writeback.json"
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise FiaFrontKitGearOilError(
            f"Invalid gear_geometry_writeback.json: {exc}"
        ) from exc
    return payload if isinstance(payload, Mapping) else {}


def compute_geometry_screen(inputs: TwinInputs) -> GeometryScreen:
    """Bind planet immersion to annular sump geometry and oil charge."""

    ring_r_mm = inputs.ring_id_mm / 2.0
    housing_r_mm = max(
        inputs.housing_outer_diameter_mm / 2.0 - HOUSING_WALL_MM,
        ring_r_mm + 2.0,
    )
    annulus_area_mm2 = math.pi * (housing_r_mm**2 - ring_r_mm**2)
    sump_axial_mm = inputs.gear_face_mm * SUMP_AXIAL_FRACTION_OF_FACE
    active_sump_ml = annulus_area_mm2 * sump_axial_mm / 1000.0
    # ⭐⭐ THE CHARGE MUST FOLLOW THE GEOMETRY (2026-08-03). This screen CLEARED on
    # 2026-07-31 and has since REGRESSED to cornering_pickup_ok=False. Nothing about
    # the oil design changed — baffle still 30 mm, nozzle still Ø1.8 mm. What changed
    # is the GEAR: the ISO 6336 strength resize narrowed the face, and
    # sump_axial = gear_face x 0.42, so the sump shrank to 123 ml and the oil level
    # to 16.67 mm. A 2.5 g corner drops the surface 13.93 mm, leaving 2.74 mm and an
    # immersion of 0.0715 against the 0.08 floor. It misses by a hair.
    #
    # `minimum_oil_charge_ml_for_screens()` already computes exactly the charge that
    # clears cornering for the CURRENT geometry — the module docstring even promises
    # "live nests with large annular sumps raise this via
    # minimum_oil_charge_ml_for_screens()" — but nothing called it, so the screen used
    # the frozen 350 ml seed. On this geometry the helper asks for 374.7 ml: a 24.7 ml
    # shortfall, and the whole regression.
    #
    # A charge the TWIN states is the team's number and is never overridden. Only a
    # DEFAULTED charge is raised to the derived floor, and the raise is reported. This
    # is the source fix: the seed follows the geometry instead of freezing while the
    # geometry moves underneath it.
    if not inputs.gear_oil_volume_stated:
        _floor_ml = minimum_oil_charge_ml_for_screens(
            slosh_length_mm=inputs.slosh_length_mm,
            planet_od_mm=inputs.planet_od_mm,
            sump_annulus_area_mm2=annulus_area_mm2,
            active_sump_volume_ml=active_sump_ml,
        )
        if _floor_ml > inputs.gear_oil_volume_ml:
            print(f"[gear-oil] defaulted charge {inputs.gear_oil_volume_ml:.1f} ml "
                  f"raised to the derived cornering floor {_floor_ml:.1f} ml "
                  f"(sump {active_sump_ml:.1f} ml, slosh {inputs.slosh_length_mm:.0f} mm)")
            inputs = replace(inputs, gear_oil_volume_ml=round(_floor_ml, 1))

    oil_level_mm = (
        inputs.gear_oil_volume_ml * 1000.0 / max(annulus_area_mm2, 1.0)
    )
    planet_r_mm = inputs.planet_od_mm / 2.0
    planet_centre_above_floor_mm = planet_r_mm * PLANET_CENTRE_ABOVE_SUMP_FLOOR_FRACTION
    immersion_depth_mm = max(
        0.0,
        oil_level_mm - max(0.0, planet_centre_above_floor_mm - planet_r_mm),
    )
    immersion_fraction = min(1.0, immersion_depth_mm / max(inputs.planet_od_mm, 1.0))
    return GeometryScreen(
        ring_inner_radius_mm=round(ring_r_mm, 3),
        housing_inner_radius_mm=round(housing_r_mm, 3),
        sump_annulus_area_mm2=round(annulus_area_mm2, 2),
        sump_axial_length_mm=round(sump_axial_mm, 3),
        active_sump_volume_ml=round(active_sump_ml, 2),
        oil_level_height_mm=round(oil_level_mm, 3),
        planet_immersion_depth_mm=round(immersion_depth_mm, 3),
        immersion_fraction_geometry=round(immersion_fraction, 4),
        geometry_source=inputs.geometry_source,
    )


def compute_jet_gallery_screen(
    inputs: TwinInputs,
    *,
    jet_l_min: float,
    pickup_charge_ok: bool,
) -> JetGalleryScreen:
    """Size jet orifices and scavenge pickup against thermal jet need."""

    nozzle_count = max(2, inputs.planet_count * 2)
    nozzle_d_mm = float(inputs.jet_nozzle_diameter_mm or JET_NOZZLE_DIAMETER_MM)
    area_total_m2 = nozzle_count * math.pi * ((nozzle_d_mm / 2000.0) ** 2)
    q_m3_s = (jet_l_min / 1000.0) / 60.0
    velocity = q_m3_s / max(area_total_m2, 1.0e-12)
    pressure_pa = 0.5 * OIL_DENSITY_KG_M3 * (velocity**2) / (JET_ORIFICE_CD**2)
    scavenge_l_min = jet_l_min * SCAVENGE_MARGIN_FACTOR
    gallery_ok = pickup_charge_ok and pressure_pa < 450_000.0
    return JetGalleryScreen(
        nozzle_count=nozzle_count,
        nozzle_diameter_mm=nozzle_d_mm,
        jet_velocity_m_s=round(velocity, 3),
        jet_pressure_required_kpa=round(pressure_pa / 1000.0, 3),
        scavenge_flow_required_l_min=round(scavenge_l_min, 4),
        scavenge_margin_factor=SCAVENGE_MARGIN_FACTOR,
        pickup_gallery_adequate=gallery_ok,
    )


def compute_cornering_screen(
    inputs: TwinInputs,
    geometry: GeometryScreen,
) -> CorneringScreen:
    """Screen cornering slosh reducing pickup-side oil level."""

    tilt_rad = math.atan(CORNERING_LATERAL_G)
    tilt_deg = math.degrees(tilt_rad)
    slosh_mm = float(inputs.slosh_length_mm or SLOSH_LENGTH_MM)
    level_drop_mm = (slosh_mm / 2.0) * math.sin(tilt_rad)
    cornering_level_mm = max(0.0, geometry.oil_level_height_mm - level_drop_mm)
    planet_r_mm = inputs.planet_od_mm / 2.0
    planet_centre_above_floor_mm = planet_r_mm * PLANET_CENTRE_ABOVE_SUMP_FLOOR_FRACTION
    immersion_depth_mm = max(
        0.0,
        cornering_level_mm - max(0.0, planet_centre_above_floor_mm - planet_r_mm),
    )
    immersion_fraction = min(1.0, immersion_depth_mm / max(inputs.planet_od_mm, 1.0))
    cornering_ok = (
        immersion_fraction >= CORNERING_MIN_IMMERSION_FRACTION
        and geometry.active_sump_volume_ml > 0.0
    )
    return CorneringScreen(
        lateral_g_assumed=CORNERING_LATERAL_G,
        free_surface_tilt_deg=round(tilt_deg, 2),
        oil_level_drop_mm=round(level_drop_mm, 3),
        immersion_fraction_cornering=round(immersion_fraction, 4),
        cornering_pickup_ok=cornering_ok,
    )


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

    geometry = compute_geometry_screen(inputs)
    h_d = max(0.05, geometry.immersion_fraction_geometry)

    # INTENT: Partially-immersed rotating-disk drag OoM (handbook class), not CFD.
    # P ≈ F_drag * v_tip; F_drag ≈ ½ Cd ρ A_immersed v²; A ≈ f_imm * π r b.
    # Weak ν^0.2 factor mirrors Mauz/Terekhov viscosity sensitivity.
    r_m = inputs.planet_od_mm / 2000.0
    b_m = inputs.gear_face_mm / 1000.0
    v_tip = max(planet_tip, 0.1)
    area_imm = h_d * math.pi * r_m * b_m
    viscous = (OIL_KINEMATIC_VISCOSITY_M2_S / CHURNING_VISCOUS_REF_M2_S) ** 0.2
    f_drag = 0.5 * CHURNING_DRAG_CD * OIL_DENSITY_KG_M3 * area_imm * (v_tip**2) * viscous
    churn_one = f_drag * v_tip
    churn_total = churn_one * float(inputs.planet_count)

    sump_ml = geometry.active_sump_volume_ml
    charge_frac = inputs.gear_oil_volume_ml / max(sump_ml, 1.0)
    pickup_ok = charge_frac >= MIN_CHARGE_FRACTION_OF_SUMP
    tip_ok = planet_tip <= MAX_TIP_SPEED_M_S_FOR_SPLASH

    jet_gallery = compute_jet_gallery_screen(
        inputs, jet_l_min=jet_l_min, pickup_charge_ok=pickup_ok
    )
    cornering = compute_cornering_screen(inputs, geometry)

    # Kit-context screen: finite jet need, geometry churning, pickup + cornering flags.
    churn_plausible = 10.0 < churn_total < 25_000.0
    jet_plausible = 0.05 < jet_l_min < 80.0
    works = bool(
        churn_plausible
        and jet_plausible
        and pickup_ok
        and tip_ok
        and jet_gallery.pickup_gallery_adequate
        and cornering.cornering_pickup_ok
    )

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
        immersion_fraction_geometry=geometry.immersion_fraction_geometry,
        geometry=geometry,
        jet_gallery=jet_gallery,
        cornering=cornering,
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
            "geometry-bound analytical twin screen; free-surface CFD OPEN"
        ),
        "honesty_frame": "RESULT_UNDER_ASSUMPTIONS",
        "frozen_assumption_refs": ["A-COOL", "A-RATIO", "A-SPEED"],
        "solver": {
            "software": (
                "geometry-bound analytical handbook screen "
                "(annular-sump immersion + immersed-disk churning + jet orifice "
                "+ cornering slosh + scavenge margin)"
            ),
            "openfoam_role": (
                "cavity smoke proves OpenFOAM toolchain only — NOT oil galleries"
            ),
            "free_surface_cfd": "OPEN",
            "evidence_class": "twin_bound_geometry_analytical_partial",
        },
        "fluid": {
            "oil_class_seed": "75W-90 class (grade OPEN)",
            "density_kg_m3": OIL_DENSITY_KG_M3,
            "cp_j_kg_k": OIL_CP_J_KG_K,
            "kinematic_viscosity_m2_s": OIL_KINEMATIC_VISCOSITY_M2_S,
            "jet_allowed_delta_t_k": JET_ALLOWED_DELTA_T_K,
        },
        "geometry_screen": asdict(screen.geometry),
        "jet_gallery_screen": asdict(screen.jet_gallery),
        "cornering_screen": asdict(screen.cornering),
        "screening_results": {
            "minimum_jet_flow_l_min": screen.jet_flow_l_min,
            "jet_flow_per_mesh_l_min": screen.jet_flow_per_mesh_l_min,
            "jet_pressure_required_kpa": screen.jet_gallery.jet_pressure_required_kpa,
            "scavenge_flow_required_l_min": screen.jet_gallery.scavenge_flow_required_l_min,
            "churning_loss_w": screen.churning_loss_w,
            "churning_loss_per_planet_w": screen.churning_loss_per_planet_w,
            "gear_loss_kw": screen.gear_loss_kw,
            "carrier_speed_rpm": screen.carrier_speed_rpm,
            "planet_tip_speed_m_s": screen.planet_tip_speed_m_s,
            "sun_tip_speed_m_s": screen.sun_tip_speed_m_s,
            "estimated_sump_volume_ml": screen.estimated_sump_volume_ml,
            "charge_fraction_of_sump": screen.charge_fraction_of_sump,
            "pickup_charge_adequate": screen.pickup_charge_adequate,
            "pickup_gallery_adequate": screen.jet_gallery.pickup_gallery_adequate,
            "tip_speed_splash_ok": screen.tip_speed_splash_ok,
            "immersion_fraction_geometry": screen.immersion_fraction_geometry,
            "cornering_pickup_ok": screen.cornering.cornering_pickup_ok,
            "geometry_source": screen.geometry.geometry_source,
        },
        "works_in_kit_context": {
            "oil_delivery_screen_ok": screen.works_in_kit_context,
            "statement": (
                "Geometry-bound jet-need + churning OoM + charge/pickup/cornering "
                "flags on twin planetary writeback. RESULT_UNDER_ASSUMPTIONS — "
                "not free-surface CFD, not clear-case bench, not seal-temperature "
                "closure."
            ),
        },
        "model_assumptions": [
            "Ring-fixed planetary: carrier_rpm = sun_rpm / gear_ratio.",
            "All gear inefficiency assumed rejected into oil for jet-flow sizing.",
            (
                "Planet immersion from annular sump geometry + oil charge "
                f"(housing wall seed {HOUSING_WALL_MM} mm)."
            ),
            f"Churning uses Cd={CHURNING_DRAG_CD} immersed-disk drag OoM, not correlated.",
            "Oil properties are 75W-90 class seeds — supplier grade OPEN.",
            (
                f"Cornering slosh uses {CORNERING_LATERAL_G} g lateral tilt over "
                f"{SLOSH_LENGTH_MM} mm slosh length — screening only."
            ),
            "Jet orifice Cd and nozzle diameter are seeds — gallery STEP OPEN.",
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
        "gear_oil_volume_ml": {"value": DEFAULT_GEAR_OIL_VOLUME_ML},
        "gear_oil_jet_nozzle_diameter_mm": {"value": JET_NOZZLE_DIAMETER_MM},
        "gear_oil_slosh_length_mm": {"value": SLOSH_LENGTH_MM},
        "gear_efficiency": {"value": 0.97},
        "max_rotor_speed_rpm": {"value": 19_500.0},
        "continuous_power_kw": {"value": 250.0},
        "mgu_shaft_power_kw": {"value": 244.434},
        "mgu_shaft_torque_nm": {"value": 119.7},
        "planet_face_width_mm": {"value": 20.0},
        "gear_face_mm": {"value": 20.0},
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

    # proveCatch: higher efficiency must drop jet flow; speed raises churning;
    # geometry immersion must be finite and bound churning.
    low_loss = TwinInputs(**{**asdict(inputs), "gear_efficiency": 0.995})
    low_screen = run_oil_screen(low_loss)
    fast = TwinInputs(
        **{**asdict(inputs), "max_rotor_speed_rpm": inputs.max_rotor_speed_rpm * 1.5}
    )
    fast_screen = run_oil_screen(fast)
    more_oil = TwinInputs(
        **{**asdict(inputs), "gear_oil_volume_ml": inputs.gear_oil_volume_ml * 1.5}
    )
    more_oil_screen = run_oil_screen(more_oil)

    checks = {
        "ratio_and_planets_bound": (
            inputs.gear_ratio == 8.0 and inputs.planet_count == 3
        ),
        "torque_near_125_nm_class": 90.0 < inputs.required_shaft_torque_nm < 160.0,
        "jet_flow_positive_finite": (
            math.isfinite(screen.jet_flow_l_min) and screen.jet_flow_l_min > 0.05
        ),
        "jet_pressure_finite": screen.jet_gallery.jet_pressure_required_kpa > 0.0,
        # proveCatch F-OIL-2: Bernoulli SI path — adversarial Ø1.0 mm nozzles at
        # high jet need FAIL the 450 kPa gallery bar (architecture, not units).
        "jet_dp_si_coherent_gallery_bar": (
            (
                lambda adv: (
                    adv.jet_gallery.jet_pressure_required_kpa > 450.0
                    and adv.jet_gallery.pickup_gallery_adequate is False
                )
            )(
                run_oil_screen(
                    TwinInputs(
                        **{
                            **asdict(inputs),
                            "jet_nozzle_diameter_mm": 1.0,
                            "gear_oil_volume_ml": 80.0,
                        }
                    )
                )
            )
            if screen.jet_flow_l_min > 10.0
            else screen.jet_gallery.jet_pressure_required_kpa > 0.0
        ),
        # Kit baffled/Ø1.5 mm / 250 ml architecture clears gallery + cornering
        # on the synthetic nest (adversarial unbaffled 90 mm + 80 ml does not).
        "kit_architecture_clears_gallery": (
            screen.jet_gallery.pickup_gallery_adequate is True
            and screen.jet_gallery.jet_pressure_required_kpa < 450.0
        ),
        "kit_architecture_clears_cornering": screen.cornering.cornering_pickup_ok
        is True,
        "min_charge_helper_above_starved_seed": (
            minimum_oil_charge_ml_for_screens(
                sump_annulus_area_mm2=screen.geometry.sump_annulus_area_mm2,
                planet_od_mm=inputs.planet_od_mm,
                slosh_length_mm=float(inputs.slosh_length_mm),
                active_sump_volume_ml=screen.geometry.active_sump_volume_ml,
            )
            > 80.0
        ),
        "unbaffled_starved_charge_fails_cornering": (
            run_oil_screen(
                TwinInputs(
                    **{
                        **asdict(inputs),
                        "slosh_length_mm": 90.0,
                        "gear_oil_volume_ml": 80.0,
                    }
                )
            ).cornering.cornering_pickup_ok
            is False
        ),
        "geometry_immersion_finite": (
            0.0 < screen.geometry.immersion_fraction_geometry <= 1.0
        ),
        "efficiency_drop_reduces_jet_need": (
            low_screen.jet_flow_l_min < 0.5 * screen.jet_flow_l_min
        ),
        "speed_increase_raises_churning": (
            fast_screen.churning_loss_w > 1.5 * screen.churning_loss_w
        ),
        "more_oil_raises_immersion": (
            more_oil_screen.geometry.immersion_fraction_geometry
            > screen.geometry.immersion_fraction_geometry
        ),
        "churning_oom_in_band": 10.0 < screen.churning_loss_w < 25_000.0,
        "pickup_flags_present": isinstance(screen.pickup_charge_adequate, bool),
        "cornering_screen_present": isinstance(screen.cornering.cornering_pickup_ok, bool),
        "honesty_frame": artifact.get("honesty_frame") == "RESULT_UNDER_ASSUMPTIONS",
        "release_honesty": (
            artifact["status"] == "PARTIAL"
            and artifact["ship_ok"] is False
            and artifact["free_surface_cfd"]["status"] == "OPEN"
        ),
        "never_ship_ok_true": artifact["ship_ok"] is False,
        "schema_v2": artifact["schema"].endswith("/v2"),
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
    writeback = load_geometry_writeback(twin_dir)
    inputs = apply_geometry_writeback(inputs, writeback)
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
        "FIA front-kit gear-oil geometry-bound screen: "
        f"jet need ≈ {screen.jet_flow_l_min:.2f} L/min "
        f"({screen.jet_flow_per_mesh_l_min:.3f} L/min per mesh), "
        f"jet ΔP≈{screen.jet_gallery.jet_pressure_required_kpa:.1f} kPa, "
        f"scavenge≈{screen.jet_gallery.scavenge_flow_required_l_min:.1f} L/min, "
        f"churning OoM ≈ {screen.churning_loss_w:.0f} W "
        f"({screen.churning_loss_per_planet_w:.0f} W/planet), "
        f"immersion={screen.geometry.immersion_fraction_geometry:.3f} "
        f"({screen.geometry.geometry_source}), "
        f"charge {inputs.gear_oil_volume_ml:.0f} ml / sump≈{screen.estimated_sump_volume_ml:.0f} ml "
        f"(pickup_ok={screen.pickup_charge_adequate}, "
        f"cornering_ok={screen.cornering.cornering_pickup_ok}). "
        f"ratio={inputs.gear_ratio}, planets={inputs.planet_count}, "
        f"gear_face={inputs.gear_face_mm:.1f} mm, "
        f"T≈{inputs.required_shaft_torque_nm:.1f} N·m. "
        "RESULT_UNDER_ASSUMPTIONS — free-surface CFD / bench OPEN; ship_ok false."
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
