#!/usr/bin/env python3
"""FIA-bound electromagnetic point cases for the Formula E front kit twin.

This is deliberately separate from ``em_magnetic_selftest.py``.  The smoke
test proves the Pyleecan/xfemm toolchain on an educational Prius-derived
machine.  This case reads the Formula E twin, builds a fresh 48-slot/eight-pole
interior-PM cross-section at the twin's rotor, stator, bore, air-gap and stack
dimensions, and solves open-circuit and loaded magnetic points with native
xfemm.

The loaded point uses the analytical 250 kW phase-current estimate after a
coarse current-angle screen, then records a coarse mechanical rotor-position
sweep at that fixed angle.  It does not close a torque/efficiency/
demagnetisation / MTPA map and remains OPEN for winding-detail and
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
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import ijson
import pyleecan
from pyleecan.Functions.load import load

_STACK_DIR = Path(__file__).resolve().parent
if str(_STACK_DIR) not in sys.path:
    sys.path.insert(0, str(_STACK_DIR))
from shaft_torque_identity import (  # noqa: E402
    DUTY_TORQUE_MEAN_CLEAR_RATIO as _DUTY_MEAN_CLEAR,
    DUTY_TORQUE_PEAK_INTEREST_RATIO as _DUTY_PEAK_INTEREST,
    evaluate_duty_torque_screen_ok,
    omega_rad_s as _omega_rad_s,
    required_shaft_torque_nm as _required_shaft_torque_nm,
)

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
# ⭐ SLOT COUNT IS TWIN-DERIVED, NOT HARDCODED (2026-08-01).
# This was `STATOR_SLOTS = 48` while the twin contract said `stator_slots = 24`,
# and the code's own comment admitted it: "Twin analytical stator_slots is 24
# while this point mesh stays 48 for the IPM sector topology. Closing that
# slot-count mismatch is a separate geometry revision." So the FE deck meshed and
# wound a DIFFERENT MACHINE from the one being designed — 48 slots gives implied
# series turns 16 against the contract's stated 14, and 24 gives 8. Both the
# GEOMETRY (slot pitch, slot area) and the WINDING (ampere-turns) keyed off it,
# so every torque number inherited the error.
# DEFAULT_STATOR_SLOTS is now only the fallback when the twin states nothing.
DEFAULT_STATOR_SLOTS = 48


def stator_slots_from_twin(inputs) -> int:
    """Slot count the TWIN specifies. The FE mesh must be the designed machine.

    Must stay a multiple of 3 (three phases) and of the pole count's belt
    structure; a twin value that cannot be wound is rejected back to the default
    rather than silently meshing something unbuildable.
    """
    try:
        raw = int(round(float(getattr(inputs, "twin_stator_slots", 0) or 0)))
    except (TypeError, ValueError):
        return DEFAULT_STATOR_SLOTS
    if raw <= 0 or raw % 3 != 0 or raw % 2 != 0:
        return DEFAULT_STATOR_SLOTS
    # ⭐ WINDING-GENERATOR VALIDITY (2026-08-01, measured). The LUA belt map is a
    # DISTRIBUTED-winding layout: it needs slots-per-pole-per-phase >= 2. Meshing
    # the twin's 24 slots against 8 poles gives SPP = 1, and the generated belts
    # do not form a coherent rotating MMF — a full 360-degree electrical sweep
    # peaked at 4.34 N.m (3.5% of the 125.18 N.m duty) with torque repeating
    # every 120 degrees electrical, the signature of a broken phase layout.
    # Silently returning that would be far worse than the 48-slot mismatch it
    # replaced, so an unsupported combination is REFUSED here and the caller
    # keeps the generator's supported layout. The slot mismatch then remains a
    # VISIBLE, NAMED defect instead of becoming a 4 N.m lie.
    # swat_em now solves the layout for ANY symmetric Zs/2p (it returns a valid
    # q=1 concentrated winding with kw1=1.0 for 24/8), so the old "SPP >= 2"
    # restriction — a limitation of the hand-written belt map, not of the machine
    # — is lifted. Only a genuinely UNBALANCED winding is refused, and swat_em
    # itself decides that via get_is_symmetric().
    poles = ROTOR_POLES
    spp = raw / float(poles * 3)
    _sym = True
    try:
        _sym = bool(_winding_layout(raw, poles))
    except Exception:  # noqa: BLE001
        _sym = False
    if not _sym:
        print(
            f"[em] REFUSING twin stator_slots={raw} (SPP={spp:g}): swat_em could "
            f"not solve a symmetric winding. Keeping {DEFAULT_STATOR_SLOTS}.",
            flush=True,
        )
        return DEFAULT_STATOR_SLOTS
    return raw
ROTOR_POLES = 8
# Single source of truth for the rotor magnet bridge. The sizer and the LUA
# placer MUST use the same value — they drifted (2.0 vs 1.0 mm) and the sizer
# passed magnets the placer then rejected.
MAGNET_ROTOR_BRIDGE_MM = 1.0
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
    stator_slots: int = DEFAULT_STATOR_SLOTS,
) -> float:
    """Estimate active steel, magnet and slot-copper mass only."""

    mm3_to_m3 = 1.0e-9
    rotor_area_mm2 = math.pi * (
        rotor_outer_radius_mm**2 - rotor_inner_radius_mm**2
    )
    magnet_area_mm2 = (
        ROTOR_POLES * MAGNETS_PER_POLE * magnet_length_mm * magnet_thickness_mm
    )
    slot_pitch_rad = 2.0 * math.pi / stator_slots
    slot_width_rad = slot_pitch_rad * 0.46
    slot_outer_radius_mm = stator_inner_radius_mm + slot_depth_mm
    slot_area_each_mm2 = 0.5 * slot_width_rad * (
        slot_outer_radius_mm**2 - (stator_inner_radius_mm + 1.0) ** 2
    )
    slot_area_mm2 = stator_slots * slot_area_each_mm2
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
    # DECISION: Size V-magnets from the hollow-rotor ring with 1 mm inner/outer
    # bridge keep-out (see _build_fia_lua). The earlier 3.2–4.2 × 11–15 mm clamps
    # left ~4 mm of unused radial room and starved open-circuit flux (~0.28 T),
    # so the kit could not approach the ~125 N·m duty even at a good current
    # angle. Fill the usable ring harder while staying first-principles /
    # twin-bound — not a pasted supplier magnet schedule.
    bridge_keepout_mm = 2.0  # 1 mm OD + 1 mm ID
    usable_radial_mm = max(4.0, rotor_ring_mm - bridge_keepout_mm)
    magnet_tilt_rad = math.radians(20.0)
    # DECISION: magnet_length is circumferential (long axis ≈ pole pitch).
    # Absolute 18 mm caps starved flux when planetary bore enlarge grows rotor
    # diameter but not pole arc — size from pole pitch at the magnet centre.
    magnet_thickness_mm = max(4.0, min(12.0, usable_radial_mm * 0.75))
    r_mag_est = max(
        r_ri + bridge_keepout_mm + 2.0,
        r_ro - bridge_keepout_mm - usable_radial_mm * 0.45,
    )
    pole_pitch_mm = (2.0 * math.pi * r_mag_est) / ROTOR_POLES
    magnet_length_mm = max(14.0, min(pole_pitch_mm * 0.38, 44.0))
    # ⭐ SIZER/PLACER AGREEMENT (2026-07-31). This feasibility test counted the
    # radial half-extent ONCE and used a 2 mm keep-out, but `_build_fia_lua`
    # seats the magnet CENTRE at (r_ro - 1 mm - half_extent), so its inner edge
    # lands at (r_ro - 1 mm - 2*half_extent) and must clear (r_ri + 1 mm). The
    # sizer therefore declared magnets feasible that the placer then refused,
    # and the ONE-SHOT shrink below never re-checked. On the live twin's 33.3 mm
    # rotor ring there is room to spare so it never bit; on a 14.65 mm ring
    # (the selftest fixture) the placer raised "cannot retain the derived
    # V-magnet pair" and the harness had NO working proveCatch as a result.
    # Test the geometry the placer actually builds, and shrink until it fits.
    def _radial_half_extent(length_mm: float, thickness_mm: float) -> float:
        return (
            length_mm / 2.0 * math.sin(magnet_tilt_rad)
            + thickness_mm / 2.0 * math.cos(magnet_tilt_rad)
        )

    def _fits(length_mm: float, thickness_mm: float) -> bool:
        # Mirrors _build_fia_lua exactly: centre at r_ro - bridge - half_extent,
        # inner edge one more half_extent below, clearing r_ri + bridge.
        half = _radial_half_extent(length_mm, thickness_mm)
        return (r_ro - MAGNET_ROTOR_BRIDGE_MM - 2.0 * half) > (
            r_ri + MAGNET_ROTOR_BRIDGE_MM)

    # ⭐ A/B OVERRIDE (2026-08-01). The magnet rebalance must be MEASURED, not
    # computed: the flux-focusing screen predicts >=1.53x from face area alone,
    # but the linkage is 3rd-harmonic dominated (3rd = 1.90x the fundamental),
    # so broadening the pole should ALSO convert harmonic energy into
    # fundamental — a gain the area ratio cannot predict. Overriding the two
    # magnet dimensions lets the same deck solve both geometries with
    # everything else held identical, which is the only honest comparison.
    # The fit test below still runs, so an override that will not build is
    # rejected rather than silently shrunk.
    _t_override = os.environ.get("FIA_MAGNET_THICKNESS_MM")
    _l_override = os.environ.get("FIA_MAGNET_LENGTH_MM")
    if _t_override or _l_override:
        cand_t = float(_t_override) if _t_override else magnet_thickness_mm
        cand_l = float(_l_override) if _l_override else magnet_length_mm
        if not _fits(cand_l, cand_t):
            raise FiaFrontKitCaseError(
                f"magnet override {cand_t:.2f} x {cand_l:.2f} mm does not fit "
                f"the {rotor_ring_mm:.2f} mm rotor ring with "
                f"{MAGNET_ROTOR_BRIDGE_MM:.1f} mm bridges — the placer would "
                "refuse it")
        magnet_thickness_mm, magnet_length_mm = cand_t, cand_l
        print(f"[em][magnet] OVERRIDE t={cand_t:.3f} mm L={cand_l:.3f} mm "
              "(A/B rebalance measurement)", flush=True)

    if not _fits(magnet_length_mm, magnet_thickness_mm):
        # Shrink progressively rather than once-and-hope; keep the aspect
        # sensible (thickness drives flux, length drives pole arc).
        for _shrink in (0.90, 0.80, 0.70, 0.60, 0.50, 0.42, 0.35):
            cand_t = max(3.0, usable_radial_mm * 0.75 * _shrink)
            cand_l = max(10.0, min(pole_pitch_mm * 0.38 * _shrink, 44.0))
            if _fits(cand_l, cand_t):
                magnet_thickness_mm, magnet_length_mm = cand_t, cand_l
                break
        else:
            raise FiaFrontKitCaseError(
                "Hollow-rotor ring "
                f"({rotor_ring_mm:.2f} mm radial) cannot retain a V-magnet pair "
                f"at any derived size with {MAGNET_ROTOR_BRIDGE_MM:.1f} mm "
                "bridges — the bore/magnet-volume conflict is REAL for this "
                "geometry (this is the honest EM_TORQUE_VS_ROTOR_BORE case)"
            )
    radial_half_extent_mm = _radial_half_extent(
        magnet_length_mm, magnet_thickness_mm)
    stator_build_mm = r_so - r_si
    slot_depth_mm = max(8.0, min(15.0, stator_build_mm * 0.66))
    _slots = stator_slots_from_twin(inputs)
    estimated_mass = _estimate_active_mass_kg(
        stator_slots=_slots,
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
        topology=(f"{_slots}-slot / {ROTOR_POLES}-pole twin-V interior "
                  "permanent-magnet synchronous machine"),
        stator_slots=_slots,
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

    # FLOW: canonical identity in shaft_torque_identity.py — gear ISO/bevel/mount
    # must use the same T = P/(ηω) rule (F-EM-2).
    omega_rad_s = _omega_rad_s(inputs.max_rotor_speed_rpm)
    combined_efficiency = (
        inputs.machine_efficiency_assumption
        * inputs.inverter_efficiency_assumption
    )
    required_torque_nm = _required_shaft_torque_nm(
        continuous_electrical_power_kw=inputs.continuous_electrical_power_kw,
        max_rotor_speed_rpm=inputs.max_rotor_speed_rpm,
        machine_efficiency=inputs.machine_efficiency_assumption,
        inverter_efficiency=inputs.inverter_efficiency_assumption,
    )
    shaft_power_kw = inputs.continuous_electrical_power_kw / combined_efficiency
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
    """Turns per coil, DERIVED so the winding is self-consistent with the twin.

    ⭐ (2026-08-01) The twin carries THREE winding numbers that disagreed:
    turns_per_phase=14, turns_per_coil=4, winding_parallel_paths=2. With the
    swat_em-solved layout at the contract's 24 slots each phase has 4 coils, so:

        series turns/phase = coils_per_phase * Ntcoil / Npcp
        4 * 4 / 2 =  8   <- what turns_per_coil=4 actually gives
        4 * 7 / 2 = 14   <- EXACTLY the contract's turns_per_phase

    So turns_per_coil=4 is the inconsistent field; 7 is the value the contract's
    own turns_per_phase implies. Running at 4 gave 4/7 of the correct ampere-turns
    and therefore ~57% of the torque, since torque is linear in turns.

    turns_per_phase is the AUTHORITATIVE figure (it is what the voltage/back-EMF
    and current ratings are set from), so the per-coil count is derived from it
    and the solved layout rather than trusted as an independent input. Falls back
    to the stated turns_per_coil only when the derivation is not possible.
    """
    stated = max(1, int(round(inputs.turns_per_coil)))
    try:
        slots = stator_slots_from_twin(inputs)
        layout = _winding_layout(slots, ROTOR_POLES)
        sides = sum(1 for _slot, (circ, _sgn) in layout.items() if circ == "phase_a")
        coils_per_phase = max(1, sides // 2)      # single layer: 2 sides = 1 coil
        npcp = max(1.0, float(inputs.winding_parallel_paths))
        derived = inputs.turns_per_phase * npcp / coils_per_phase
        if derived >= 0.5 and abs(derived - round(derived)) < 1e-6:
            derived_i = int(round(derived))
            if derived_i != stated:
                print(
                    f"[em][winding] turns_per_coil DERIVED as {derived_i} from "
                    f"turns_per_phase={inputs.turns_per_phase:g}, "
                    f"coils/phase={coils_per_phase}, parallel={npcp:g} "
                    f"(twin stated {stated} — inconsistent; stated value would "
                    f"give {coils_per_phase * stated / npcp:g} turns/phase)",
                    flush=True,
                )
            return derived_i
    except Exception as exc:  # noqa: BLE001 — never block the solve
        print(f"[em][winding] turns derivation unavailable ({exc}); "
              f"using stated turns_per_coil={stated}", flush=True)
    return stated


# INTENT: Coarse mechanical rotor positions over half an electrical period for
# an 8-pole machine (pole-pairs=4 -> 45 deg mech = 180 deg elec).
LIVE_ROTOR_POSITION_SWEEP_MECH_DEG = (0.0, 7.5, 15.0, 22.5, 30.0, 37.5, 45.0)
# DECISION: Live twin default used 4 points so the case finishes in a few FE
# solves; the full 7-point table remains selectable.
LIVE_ROTOR_POSITION_SWEEP_FAST_MECH_DEG = (0.0, 15.0, 30.0, 45.0)
# DEC-EM-1 (2026-07-31): 4 points ALIAS the torque ripple, and the duty screen is
# decided on the MEAN — so the mean was an artefact of sample placement, which is
# why torque_reliable was false. 37 points at 1.25 deg resolves it properly.
LIVE_ROTOR_POSITION_SWEEP_DENSE_MECH_DEG = tuple(
    round(i * 1.25, 3) for i in range(37)
)


# GOTCHA: At rotor mechanical 0° the magnet d-axis is NOT aligned with the
# phase-A belt axis. Hardcoding −90° electrical (claimed "Id = 0") lands near a
# torque null (~9 N·m). Diagnostic sweep on the live twin peaked near −45°.
DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG = -45.0
# Coarse regenerative-side sweep for the live twin case (not a full MTPA map).
# ⭐⭐ THE SEARCH SPACE MUST CONTAIN THE ANSWER (2026-08-01). This was
# (-40, -45, -50, -60, -90) — ENTIRELY NEGATIVE. With the advance sign corrected
# to +p*theta_m the best point moved to the other half-plane, and a screen that
# never evaluates a positive angle cannot find it however finely it samples the
# negative one. The screened -60 deg produced a DELIVERED mean of -43.13 N.m:
# the machine was being held at a braking angle and its duty judged on it.
# Span both half-planes; refinement can come later, but never at the cost of
# excluding half the space.
LIVE_CURRENT_ANGLE_SWEEP_DEG = (
    -90.0, -60.0, -45.0, -30.0, -15.0, 0.0, 15.0, 30.0, 45.0, 60.0, 90.0)

# Rotor positions used to CANCEL COGGING inside the angle screen, as fractions
# of one slot pitch. Three points at 0, 1/3, 2/3 of a slot pitch average the
# 3rd-harmonic slot cogging (and its multiples) to exactly zero.
ANGLE_SCREEN_COGGING_CANCEL_FRACTIONS = (0.0, 1.0 / 3.0, 2.0 / 3.0)
# Re-exports for callers/tests that historically imported these from this module.
DUTY_TORQUE_SCREEN_RATIO = _DUTY_PEAK_INTEREST
DUTY_TORQUE_MEAN_CLEAR_RATIO = _DUTY_MEAN_CLEAR

def select_rotor_position_sweep_deg(
    *,
    positions_deg: Sequence[float] | None = None,
    max_points: int | None = None,
) -> tuple[float, ...]:
    """Select coarse mechanical rotor positions for a fixed-angle torque sweep.

    INTENT: Enough points to expose position dependence at one screened current
    angle without claiming a full torque-ripple or MTPA map.

    @description Prefer the canonical half-electrical-period table, optionally
        thinned evenly (always keeping endpoints when max_points ≥ 2).
    @param positions_deg Optional explicit mechanical degrees; defaults to the
        live 7-point table.
    @param max_points Optional cap; when set below the table length, subsample
        evenly including the first and last entries.
    @returns Ordered mechanical rotor positions in degrees.
    @throws FiaFrontKitCaseError when the selection would be empty.
    """

    # GOTCHA: ``positions_deg or DEFAULT`` treats () as missing; require an
    # explicit None check so empty caller input still fails closed.
    source = (
        LIVE_ROTOR_POSITION_SWEEP_MECH_DEG
        if positions_deg is None
        else positions_deg
    )
    base = tuple(float(position) for position in source)
    if not base:
        raise FiaFrontKitCaseError(
            "rotor-position sweep requires at least one mechanical position"
        )
    if max_points is not None and max_points < 1:
        raise FiaFrontKitCaseError("max_points must be >= 1")
    if max_points is None or max_points >= len(base):
        return base
    if max_points == 1:
        return (base[0],)
    indices = [
        int(round(index * (len(base) - 1) / (max_points - 1)))
        for index in range(max_points)
    ]
    selected: list[float] = []
    seen: set[int] = set()
    for index in indices:
        if index in seen:
            continue
        seen.add(index)
        selected.append(base[index])
    return tuple(selected)


def summarize_rotor_position_sweep(
    sweep: Sequence[Mapping[str, float]],
    *,
    required_shaft_torque_nm: float,
) -> dict[str, Any]:
    """Summarise torque vs rotor position without claiming MTPA closure.

    @description Compute min/max/mean torque magnitude and duty ratios from a
        coarse position sweep. Empty sweeps return null metrics.
    @param sweep Rows with at least ``torque_nm``.
    @param required_shaft_torque_nm Analytical shaft torque for ratioing.
    @returns Summary dict safe to embed in the twin artefact / stamp.
    """

    if not sweep:
        return {
            "n_positions": 0,
            "torque_min_nm": None,
            "torque_max_nm": None,
            "torque_mean_nm": None,
            "torque_magnitude_min_nm": None,
            "torque_magnitude_max_nm": None,
            "torque_magnitude_mean_nm": None,
            "torque_vs_required_ratio_min": None,
            "torque_vs_required_ratio_max": None,
            "torque_vs_required_ratio_mean": None,
            "peak_to_peak_torque_nm": None,
            "peak_to_peak_magnitude_nm": None,
        }
    torques = [float(row["torque_nm"]) for row in sweep]
    magnitudes = [abs(torque) for torque in torques]
    mean_torque = sum(torques) / len(torques)
    mean_magnitude = sum(magnitudes) / len(magnitudes)
    required = float(required_shaft_torque_nm)
    ratios = (
        [magnitude / required for magnitude in magnitudes]
        if required > 0.0
        else [0.0 for _ in magnitudes]
    )
    return {
        "n_positions": len(sweep),
        "torque_min_nm": round(min(torques), 6),
        "torque_max_nm": round(max(torques), 6),
        "torque_mean_nm": round(mean_torque, 6),
        "torque_magnitude_min_nm": round(min(magnitudes), 6),
        "torque_magnitude_max_nm": round(max(magnitudes), 6),
        "torque_magnitude_mean_nm": round(mean_magnitude, 6),
        "torque_vs_required_ratio_min": round(min(ratios), 6),
        "torque_vs_required_ratio_max": round(max(ratios), 6),
        "torque_vs_required_ratio_mean": round(sum(ratios) / len(ratios), 6),
        "peak_to_peak_torque_nm": round(max(torques) - min(torques), 6),
        "peak_to_peak_magnitude_nm": round(max(magnitudes) - min(magnitudes), 6),
        # ⭐ DELIVERED torque = |mean of the SIGNED curve| (2026-08-01, Kimi K3
        # panel). The duty screen had been fed `torque_magnitude_mean_nm`, the
        # mean of |T|, which OVERSTATES delivered torque whenever the curve
        # changes sign: a sweep of +38 and -122 gave mean|T| = 57.84 while the
        # true average shaft torque was near zero. A machine cannot deliver the
        # average of the absolute value of its torque.
        "delivered_mean_torque_nm": round(abs(mean_torque), 6),
        # A synchronous machine held at a fixed ROTOR-FRAME current angle must
        # NOT reverse torque. Any reversal means the excitation is not tracking
        # the rotor, and every mean over that sweep is meaningless.
        "sign_reversals": sum(
            1 for a, b in zip(torques, torques[1:]) if a * b < 0),
        "torque_sign_consistent": all(t >= 0 for t in torques) or all(t <= 0 for t in torques),
    }


def loaded_point_assumptions(
    duty: DutyCheck,
    inputs: TwinInputs,
    *,
    current_angle_electrical_deg: float = DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG,
    rotor_position_mechanical_deg: float = 0.0,
) -> LoadedPointAssumptions:
    """Create one-position loaded excitation from duty + twin winding + angle.

    INTENT: Bind coil turns and design current from the twin, and apply a
    current angle that is not the torque-null (−90° was). Rotor position is
    explicit so a coarse position sweep can rotate the IPM without claiming a
    full torque / MTPA map.
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
    current_angle_rad = math.radians(current_angle_electrical_deg)
    phase_a_a = phase_peak_a * math.cos(current_angle_rad)
    phase_b_a = phase_peak_a * math.cos(
        current_angle_rad - 2.0 * math.pi / 3.0
    )
    phase_c_a = phase_peak_a * math.cos(
        current_angle_rad + 2.0 * math.pi / 3.0
    )
    turns = effective_turns_per_slot_from_twin(inputs)
    implied_series = (
        turns * (stator_slots_from_twin(inputs) // 3 // 2)
        / max(inputs.winding_parallel_paths, 1.0)
    )
    return LoadedPointAssumptions(
        phase_current_rms_a=phase_rms_a,
        phase_current_peak_a=phase_peak_a,
        current_angle_electrical_deg=current_angle_electrical_deg,
        rotor_position_mechanical_deg=float(rotor_position_mechanical_deg),
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
            f"Current angle {current_angle_electrical_deg:g}° elec "
            f"(not the −90° torque-null; d-axis alignment still provisional); "
            f"rotor {float(rotor_position_mechanical_deg):g}° mech. "
            "Not a frozen hairpin schedule."
        ),
    )


def select_best_loaded_point(
    geometry: FiaMachineGeometry,
    solver: Path,
    *,
    remanence_t: float,
    duty: DutyCheck,
    inputs: TwinInputs,
    angles_deg: Sequence[float] = LIVE_CURRENT_ANGLE_SWEEP_DEG,
) -> tuple[LoadedPointAssumptions, LoadedMagneticResult, list[dict[str, float]]]:
    """Solve several current angles and keep the best COGGING-CANCELLED point.

    ⭐⭐ WHY THIS IS NOT A SINGLE-POSITION SCREEN (2026-08-01). It used to solve
    each angle at rotor position 0 ONLY and keep the largest |torque|. Both
    halves of that were wrong, and together they chose a braking angle:

      * At position 0 the measured torque is DC + cogging(0), and cogging here
        is 76.8 N·m against a DC of -43.1. Position 0 read +55.01 N·m while the
        machine's actual delivered mean over a pole pitch was -43.13. The screen
        was reading the cogging, not the machine.
      * Ranking on abs(torque) makes a large BRAKING point win outright.

    Fix: evaluate every angle at three rotor positions spaced a third of a slot
    pitch apart, which averages the 3rd-harmonic slot cogging (and its
    multiples) to EXACTLY zero, and rank on that cogging-cancelled mean. The
    single-position torque is still recorded per angle so the difference between
    the two is visible rather than hidden.

    Still a coarse screen, not MTPA closure or a full map.
    """

    if not angles_deg:
        raise FiaFrontKitCaseError("current-angle sweep requires at least one angle")
    slot_pitch_deg = 360.0 / max(1, stator_slots_from_twin(inputs))
    probe_positions = [f * slot_pitch_deg
                       for f in ANGLE_SCREEN_COGGING_CANCEL_FRACTIONS]
    sweep: list[dict[str, float]] = []
    best_assumptions: LoadedPointAssumptions | None = None
    best_result: LoadedMagneticResult | None = None
    best_mean: float | None = None
    best_angle: float = float(angles_deg[0])
    for angle in angles_deg:
        torques: list[float] = []
        first_assumptions: LoadedPointAssumptions | None = None
        first_result: LoadedMagneticResult | None = None
        for position in probe_positions:
            assumptions = loaded_point_assumptions(
                duty,
                inputs,
                current_angle_electrical_deg=rotor_frame_current_angle_deg(
                    float(angle),
                    rotor_position_mechanical_deg=float(position),
                    stator_slots=stator_slots_from_twin(inputs),
                    rotor_poles=ROTOR_POLES,
                ),
                rotor_position_mechanical_deg=float(position),
            )
            result = run_loaded_magnetic_point(
                geometry,
                solver,
                remanence_t=remanence_t,
                assumptions=assumptions,
            )
            torques.append(float(result.torque_nm))
            if first_result is None:
                first_assumptions, first_result = assumptions, result
        mean_torque = sum(torques) / len(torques)
        assert first_result is not None and first_assumptions is not None
        sweep.append(
            {
                "current_angle_electrical_deg": float(angle),
                # The cogging-cancelled mean is the number the screen RANKS on.
                "cogging_cancelled_mean_torque_nm": round(mean_torque, 6),
                "torque_nm": first_result.torque_nm,
                "torque_magnitude_nm": abs(first_result.torque_nm),
                "single_position_error_nm": round(
                    first_result.torque_nm - mean_torque, 6),
                "probe_positions_mech_deg": [round(p, 4) for p in probe_positions],
                "peak_airgap_flux_density_t":
                    first_result.peak_airgap_flux_density_t,
                "rms_airgap_flux_density_t":
                    first_result.rms_airgap_flux_density_t,
            }
        )
        if best_mean is None or abs(mean_torque) > abs(best_mean):
            best_mean = mean_torque
            best_angle = float(angle)
    # Seat the chosen point at rotor position 0 ONCE, after the scan, so
    # downstream stages (which assume the loaded point is the zero-position
    # reference) keep their contract. Solving it inside the loop re-solved on
    # every improvement — up to one wasted FE solve per angle.
    if best_mean is not None:
        best_assumptions = loaded_point_assumptions(
            duty, inputs, current_angle_electrical_deg=best_angle)
        best_result = run_loaded_magnetic_point(
            geometry, solver, remanence_t=remanence_t,
            assumptions=best_assumptions)
        print(f"[em][angle-screen] best angle by COGGING-CANCELLED mean: "
              f"{best_assumptions.current_angle_electrical_deg:g} deg elec, "
              f"mean {best_mean:.2f} N.m over {len(probe_positions)} positions "
              f"({', '.join(f'{p:.2f}' for p in probe_positions)} deg mech)",
              flush=True)
    assert best_assumptions is not None and best_result is not None
    return best_assumptions, best_result, sweep


def rotor_frame_current_angle_deg(
    base_angle_electrical_deg: float,
    rotor_position_mechanical_deg: float,
    rotor_poles: int,
    stator_slots: int = 0,
) -> float:
    """Electrical current angle that holds the command constant in the ROTOR frame.

    Under field-oriented control the current vector rotates WITH the rotor, so a
    commanded d-q angle is fixed in the rotor frame and the STATOR excitation
    must advance by pole_pairs × mechanical angle. Holding it fixed in space
    instead sweeps the load angle through its whole range — which is exactly the
    defect that made the 4-point mean (118.748 N·m) and the 37-point mean
    (125.931 N·m) artefacts of an unphysical curve, and kept
    EM_TORQUE_VS_ROTOR_BORE open against a machine with ~43% margin.

    Pure so it can be proveCatch-ed without an FE solve.
    """
    pole_pairs = max(1, int(rotor_poles) // 2)
    # Reference the command to where phase A ACTUALLY is for this winding.
    try:
        axis = _phase_a_axis_electrical_deg(
            stator_slots if stator_slots else DEFAULT_STATOR_SLOTS, rotor_poles)
    except Exception:  # noqa: BLE001
        axis = 0.0
    # ⭐ SIGN (2026-08-01, measured). The advance must be NEGATIVE: the FE rotates
    # the rotor in the OPPOSITE angular sense to the current-phasor convention, so
    # the stator excitation tracks the rotor only when it advances by -p*theta_m.
    # Measured over positions 0/3.75/7.5/11.25/15 deg mech at a fixed rotor-frame
    # command, signed torque:
    #     no advance : mean  -0.02 N.m, spread 300000% (pure out-of-sync)
    #     +p*theta_m : mean  -7.13 N.m, spread   1190%  <- what was implemented
    #     -p*theta_m : mean +26.12 N.m, spread    334%  <- the only coherent one
    # The earlier "rotor-frame fix" advanced the angle but in the wrong direction,
    # so it removed the gross aliasing yet left the machine still walking out of
    # synchronism. The residual 334% swing is at SLOT PITCH and is the separate
    # 46%-of-pitch slot-opening cogging, not a phasing fault.
    # ⭐ THE 5-POINT MEASUREMENT ABOVE WAS ALIASED (2026-08-01). It sampled 5
    # rotor positions over 15 deg mech. With the advance wrong, the relative
    # angle delta sweeps at 2p*theta_m, and a salient machine's RELUCTANCE term
    # goes as sin(2*delta) = 4p*theta_m — 240 deg of phase per 15 deg mech. Five
    # samples cannot resolve that, so the "mean" of each candidate was an alias
    # artefact and the sign it selected is not trustworthy.
    #
    # The 37-point sweep over a full 45 deg mech (360 deg electrical) resolves
    # it properly, and its harmonic content says delta is SWEEPING, not held:
    #     DC   3.75 N.m   <- the useful torque; should dominate
    #     k=1 53.65 N.m   <- PM term, sin(delta),  delta sweeping at 2p*theta_m
    #     k=2 80.17 N.m   <- reluctance term, sin(2*delta)
    #     k=3 31.11 N.m   <- 24-slot cogging (legitimate)
    # A correctly-tracking excitation holds delta constant and leaves k=1 and
    # k=2 near zero.
    #
    # Env override so BOTH signs can be measured at full resolution without
    # editing this constant between runs (the edit-and-rerun loop is what
    # produced the aliased evidence in the first place).
    # ⭐⭐ SETTLED BY MEASUREMENT (2026-08-01): the advance is POSITIVE.
    # 37-point sweep over a full 45 deg pole pitch, both signs, same everything
    # else. The async signature is the whole test:
    #     -p*theta_m :  k=1 53.65   k=2 80.17  N.m   <- delta sweeping
    #     +p*theta_m :  k=1  0.01   k=2  0.01  N.m   <- delta HELD
    # Four orders of magnitude. The excitation tracks the rotor only with +.
    # The earlier "-" was chosen from 5 samples over 15 deg mech, which cannot
    # resolve a reluctance term moving 240 deg of phase across that span.
    sign = 1.0 if os.environ.get("FIA_ADVANCE_SIGN", "+").strip() != "-" else -1.0
    return (float(base_angle_electrical_deg) + axis
            + sign * pole_pairs * float(rotor_position_mechanical_deg))


def run_rotor_position_sweep(
    geometry: FiaMachineGeometry,
    solver: Path,
    *,
    remanence_t: float,
    duty: DutyCheck,
    inputs: TwinInputs,
    current_angle_electrical_deg: float,
    positions_deg: Sequence[float] | None = None,
    seed_result_at_zero: LoadedMagneticResult | None = None,
) -> tuple[list[dict[str, float]], dict[str, Any]]:
    """Solve torque at rotor positions holding the current angle IN THE ROTOR FRAME.

    INTENT: Show position dependence / ripple at the already-screened best
    current angle without running a full MTPA or fine torque map.

    ⭐ FIX (2026-07-31, exposed by the DEC-EM-1 37-point sweep): this previously
    held the stator current angle FIXED IN SPACE while mechanically rotating the
    rotor. That is not a torque map — it is the machine being driven out of
    synchronism, and |T| duly collapsed 214.7 → 6.65 N·m over 13.75° mech
    (min/mean/max = 0.01/1.01/1.71 of required, 213 N·m peak-to-peak). Under
    field-oriented control the current vector rotates WITH the rotor, so the
    commanded angle is constant in the ROTOR frame. The electrical angle must
    therefore advance by pole_pairs × Δmechanical. Without this the "mean over
    rotor positions" is not a duty metric at all — and because the duty screen is
    decided on that mean, BOTH the old 4-point mean (118.748) and the dense
    37-point mean (125.931) were artefacts of sampling an unphysical curve.

    DECISION: Reuse ``seed_result_at_zero`` for the 0° mechanical point when
    that point was already solved during the current-angle screen, avoiding a
    duplicate FE solve. Still valid: at 0° mech the frames coincide.
    """

    positions = select_rotor_position_sweep_deg(positions_deg=positions_deg)
    sweep: list[dict[str, float]] = []
    for position in positions:
        if (
            abs(position) < 1.0e-12
            and seed_result_at_zero is not None
        ):
            result = seed_result_at_zero
        else:
            # Hold the commanded angle in the ROTOR frame: advance the stator
            # excitation electrically with the rotor (θ_e = p · θ_m).
            assumptions = loaded_point_assumptions(
                duty,
                inputs,
                current_angle_electrical_deg=rotor_frame_current_angle_deg(
                    current_angle_electrical_deg,
                    position,
                    geometry.rotor_poles,
                    geometry.stator_slots,
                ),
                rotor_position_mechanical_deg=float(position),
            )
            result = run_loaded_magnetic_point(
                geometry,
                solver,
                remanence_t=remanence_t,
                assumptions=assumptions,
            )
        sweep.append(
            {
                "rotor_position_mechanical_deg": float(position),
                "current_angle_electrical_deg": float(current_angle_electrical_deg),
                "torque_nm": result.torque_nm,
                "torque_magnitude_nm": abs(result.torque_nm),
                "peak_airgap_flux_density_t": result.peak_airgap_flux_density_t,
                "rms_airgap_flux_density_t": result.rms_airgap_flux_density_t,
            }
        )
    summary = summarize_rotor_position_sweep(
        sweep,
        required_shaft_torque_nm=duty.required_shaft_torque_nm,
    )
    return sweep, summary


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


# Winding layouts solved by swat_em, cached per (Zs, poles). Replaces the
# hardcoded 48-slot belt pattern.
_WINDING_LAYOUT_CACHE: dict = {}


def _winding_layout(stator_slots: int, rotor_poles: int) -> dict:
    """Slot -> (circuit, sign) solved by swat_em (via pyleecan), for ANY Zs/2p.

    ⭐ REPLACES THE HARDCODED BELT MAP (Tristan 2026-08-01: "use pyleecan instead
    of the lua belt generator"). The old `phase_belts[(slot_index % 12) // 2]`
    was a 12-slot repeating pattern valid ONLY for 48 slots. Meshing the twin's
    real 24 slots through it produced 4.34 N.m peak over a full 360-degree
    electrical sweep — three phase belts that never formed a rotating MMF.

    swat_em solves the layout properly: for Zs=24 / 2p=8 it returns a SYMMETRIC
    q=1 concentrated winding with fundamental winding factor kw1 = 1.0
    (phase A = slots 1, -4, 7, -10, 13, -16, 19, -22). The machine was always
    windable; the hand-written belt map simply could not express it.

    Falls back to the legacy 48-slot pattern only if swat_em is unavailable, so a
    missing dependency degrades to the previous behaviour rather than crashing.
    """
    key = (int(stator_slots), int(rotor_poles))
    if key in _WINDING_LAYOUT_CACHE:
        return _WINDING_LAYOUT_CACHE[key]
    layout: dict = {}
    try:
        import numpy as _np
        for _o, _n in (("string_", "bytes_"), ("unicode_", "str_")):
            if not hasattr(_np, _o) and hasattr(_np, _n):
                setattr(_np, _o, getattr(_np, _n))
        from swat_em import datamodel  # noqa: PLC0415

        wdg = datamodel()
        wdg.set_machinedata(Q=int(stator_slots), p=int(rotor_poles) // 2, m=3)
        wdg.genwdg(Q=int(stator_slots), P=int(rotor_poles), m=3, layers=1, turns=1)
        if not wdg.get_is_symmetric():
            raise ValueError(
                f"swat_em: Zs={stator_slots}/2p={rotor_poles} is NOT a symmetric "
                "winding — refusing to mesh an unbalanced machine")
        circuits = ("phase_a", "phase_b", "phase_c")
        for phase_index, phase in enumerate(wdg.get_phases()):
            for layer in phase:
                for signed_slot in layer:
                    slot0 = abs(int(signed_slot)) - 1     # swat_em is 1-based
                    layout[slot0] = (circuits[phase_index],
                                     1 if int(signed_slot) > 0 else -1)
    except Exception as exc:  # noqa: BLE001 — degrade, never crash the solve
        print(f"[em][winding] swat_em unavailable/failed ({exc}); "
              "falling back to the legacy 48-slot belt pattern", flush=True)
        legacy = (("phase_a", 1), ("phase_c", -1), ("phase_b", 1),
                  ("phase_a", -1), ("phase_c", 1), ("phase_b", -1))
        layout = {i: legacy[(i % 12) // 2] for i in range(int(stator_slots))}
    _WINDING_LAYOUT_CACHE[key] = layout
    return layout


def _phase_a_axis_electrical_deg(stator_slots: int, rotor_poles: int) -> float:
    """Electrical angle of the phase-A MMF axis for the SOLVED layout.

    ⭐ (2026-08-01) The rotor-frame angle advance (theta_e = p * theta_m) is
    referenced to where phase A actually sits. The old hand-written belt map put
    phase A in one place; the swat_em layout puts it somewhere else
    (slots 1,-4,7,-10,... vs the 12-slot pattern). Changing the winding without
    re-deriving this reference left the current vector misaligned with the rotor
    at theta_m = 0, so the sweep walked in and out of synchronism — reintroducing
    the very fault the rotor-frame fix removed. Symptom: 37-point ripple of
    119.7 N.m peak-to-peak on a 57.83 N.m mean (207%), with min 2.97 N.m.

    The fundamental MMF phasor of phase A is sum(sign_k * exp(j*p*theta_k)) over
    its slots; its argument IS the axis. Derived from the layout, so it tracks any
    winding swat_em produces.
    """
    import cmath  # noqa: PLC0415
    layout = _winding_layout(stator_slots, rotor_poles)
    pole_pairs = max(1, int(rotor_poles) // 2)
    acc = 0j
    for slot, (circuit, sign) in layout.items():
        if circuit != "phase_a":
            continue
        theta_mech = (2.0 * math.pi * int(slot)) / float(stator_slots)
        acc += float(sign) * cmath.exp(1j * pole_pairs * theta_mech)
    if abs(acc) < 1e-9:
        return 0.0
    return math.degrees(cmath.phase(acc))


def _slot_winding_assignment(
    slot_index: int,
    stator_slots: int = DEFAULT_STATOR_SLOTS,
    rotor_poles: int = ROTOR_POLES,
) -> tuple[str, int]:
    """Phase circuit and signed turn for one winding side, from the solved layout."""
    layout = _winding_layout(stator_slots, rotor_poles)
    return layout.get(int(slot_index) % int(stator_slots), ("phase_a", 1))


def _build_fia_lua(
    geometry: FiaMachineGeometry,
    *,
    remanence_t: float,
    fem_name: str,
    loaded: LoadedPointAssumptions | None = None,
    open_circuit_turns_per_slot: int = 1,
) -> str:
    """Build the FIA-sized interior-PM xfemm model for one magnetic point.

    `open_circuit_turns_per_slot` is the turn count assigned to the slot blocks
    when there is no loaded point. It only scales the REPORTED flux linkage (it
    carries no current, so it cannot change the field); pass the machine's real
    turns/slot to read lambda_pm directly in webers.
    """
    # Council review (Sol, 2026-08-01) flagged this as silently coerced. A turn
    # count that is zero, negative or fractional does not describe a winding,
    # and would scale the reported flux linkage into nonsense.
    if (open_circuit_turns_per_slot != int(open_circuit_turns_per_slot)
            or int(open_circuit_turns_per_slot) < 1):
        raise FiaFrontKitCaseError(
            "open_circuit_turns_per_slot must be a positive whole number of "
            f"turns; got {open_circuit_turns_per_slot!r}")
    _oc_turns_per_slot = int(open_circuit_turns_per_slot)

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
    # Stator stays fixed; rotate only rotor steel labels + V-magnets.
    rotor_offset_rad = (
        math.radians(loaded.rotor_position_mechanical_deg)
        if loaded is not None
        else 0.0
    )

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
    # ⭐ CIRCUITS ARE ALWAYS DEFINED, at zero current when unloaded. The winding
    # physically exists whether or not current flows, and FEMM can only report
    # flux linkage for a circuit that EXISTS. Without this, open-circuit
    # lambda_pm is unmeasurable and has to be inferred from the airgap probe —
    # which is exactly the inference that produced this campaign's 5.01x
    # disagreement. Zero-current copper is magnetically identical to
    # unassigned copper, so the OC field itself is unchanged.
    lua.extend(
        [
            f'mi_addcircprop("phase_a",{(loaded.phase_a_current_a if loaded else 0.0):.12g},1)',
            f'mi_addcircprop("phase_b",{(loaded.phase_b_current_a if loaded else 0.0):.12g},1)',
            f'mi_addcircprop("phase_c",{(loaded.phase_c_current_a if loaded else 0.0):.12g},1)',
        ]
    )
    for h_a_m, b_t in material_machine.stator.mat_type.mag.BH_curve.get_data():
        lua.append(f'mi_addbhpoint("m400",{float(b_t):.12g},{float(h_a_m):.12g})')
    # r_gap (mid-airgap) is drawn so the airgap becomes TWO air regions. FEMM's
    # weighted stress tensor requires the selected block's boundary to lie in
    # FREE SPACE — selecting the whole gap makes the boundary abut the stator
    # steel and FEMM refuses with "A valid selection cannot abut a region which
    # is not free space". Splitting the gap puts the boundary mid-air.
    for radius_mm in (r_ri, r_ro, r_gap, r_si, r_so):
        lua.extend(_circle_lua(radius_mm))

    slot_pitch_rad = 2.0 * math.pi / geometry.stator_slots
    # ⭐⭐ THIS IS THE FULL SLOT WIDTH, NOT A SLOT OPENING (corrected 2026-08-01).
    #
    # The polygon below runs from r_slot_inner to r_slot_outer at a CONSTANT
    # angular half-width, so this deck models a straight OPEN slot over its whole
    # radial depth. There is no separate mouth geometry: a semi-closed slot —
    # narrow opening at the bore, wide body behind it — IS NOT MODELLED HERE AT
    # ALL, and no value of this fraction can create one.
    #
    # WHAT WENT WRONG. A model panel advised "real traction IPMSMs use
    # semi-closed slots at roughly 10-20% of pitch", which is TRUE ABOUT REAL
    # MACHINES, and it was applied here by setting this fraction to 0.07. That
    # did not narrow a slot opening. It shrank the ENTIRE SLOT to 14% of pitch,
    # cutting the copper area to under a third while carrying the same current
    # and leaving 86% of the pitch as tooth. The result was a 104 N.m
    # slot-pitch-periodic torque swing on a machine that should make ~55 N.m —
    # a self-inflicted fault that masqueraded as cogging.
    #
    # 0.23 half-width = 46% of pitch full width, i.e. a roughly 46/54 slot/tooth
    # split. That is a NORMAL open-slot proportion and is the correct default.
    # If semi-closed slots are ever wanted, they need real mouth geometry in the
    # LUA, not a smaller number here.
    _slot_width_frac = float(os.environ.get("FIA_SLOT_WIDTH_FRAC", "0.23"))
    slot_half_width_rad = slot_pitch_rad * _slot_width_frac
    slot_labels: list[tuple[complex, str, int]] = []
    for slot_index in range(geometry.stator_slots):
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
        circuit, signed_turn = _slot_winding_assignment(
            slot_index, geometry.stator_slots, geometry.rotor_poles)
        slot_labels.append(
            (
                slot_point,
                circuit,
                (
                    signed_turn * loaded.effective_turns_per_slot
                    if loaded is not None
                    else signed_turn * _oc_turns_per_slot
                ),
            )
        )

    magnet_labels: list[tuple[complex, float]] = []
    magnet_tilt_rad = math.radians(20.0)
    radial_half_extent_mm = (
        geometry.magnet_length_mm / 2.0 * math.sin(magnet_tilt_rad)
        + geometry.magnet_thickness_mm / 2.0 * math.cos(magnet_tilt_rad)
    )
    rotor_bridge_mm = MAGNET_ROTOR_BRIDGE_MM
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
        pole_center = pole_index * pole_pitch_rad + rotor_offset_rad
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
    rotor_label_angle = math.radians(22.5) + rotor_offset_rad
    rotor_label = complex(
        ((r_ri + r_ro) / 2.0) * math.cos(rotor_label_angle),
        ((r_ri + r_ro) / 2.0) * math.sin(rotor_label_angle),
    )
    lua.extend(
        _block_label_lua(rotor_label, material="m400", mesh_mm=0.8, group=1)
    )
    _gap_mesh = min(0.12, geometry.radial_airgap_mm / 5.0)
    # INNER airgap half (rotor side) — travels WITH the rotor selection.
    lua.extend(
        _block_label_lua(
            complex((r_ro + r_gap) / 2.0, 0.0),
            material="air",
            mesh_mm=_gap_mesh,
            group=2,
        )
    )
    # OUTER airgap half (stator side) — stays with the stationary part.
    lua.extend(
        _block_label_lua(
            complex((r_gap + r_si) / 2.0, 0.0),
            material="air",
            mesh_mm=_gap_mesh,
            group=6,
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
        # ⭐ THE TORQUE-INTEGRATION FAULT (2026-08-01). This selected ONLY the
        # rotor steel (group 1) and the magnets (group 5). FEMM's weighted stress
        # tensor, block integral 22, requires the selection to ALSO CONTAIN THE
        # AIRGAP AIR (group 2): the weighting function must transition from 1 on
        # the moving body to 0 on the stationary one, and that transition happens
        # ACROSS THE AIRGAP. With no air selected there is no transition region,
        # so the integral runs over a truncated volume and UNDER-REPORTS.
        #
        # Independently corroborated before the fix was found: the deck's own
        # back-EMF (324.1 V l-l rms) implies ~131 N.m at 477 A rms via
        # T = 1.5*p*lambda_pm*Iq, while the integral returned 57.8 N.m — a 2.27x
        # discrepancy. Grok 4.5 and Sol both independently returned
        # MODEL_ERROR_LIKELY and named the torque integration as the suspect.
        lua.extend(
            [
                "mo_clearblock()",
                "mo_groupselectblock(1)",   # rotor steel
                "mo_groupselectblock(5)",   # magnets
                "mo_groupselectblock(2)",   # INNER airgap half — the
                # selection boundary now sits MID-AIRGAP, i.e. in free space,
                # which is what integral 22 requires.
                f'print("{RESULT_PREFIX} torque_nm="..mo_blockintegral(22))',
                "mo_clearblock()",
            ]
        )
    # ⭐⭐ MEASURE FLUX LINKAGE FROM THE SOLVED FIELD (2026-08-01). This deck has
    # never asked FEMM what the winding actually links; every lambda_pm in this
    # campaign was INFERRED from the airgap B probe through a 1-D sinusoidal
    # relation. That inference is what produced the "two independent routes
    # agree" claim (they were one route) and the unresolved 5.01x disagreement
    # against the flux linkage implied by the measured low-current torque slope.
    #
    # mo_getcircuitproperties returns (current, volts, flux_linkage) for a named
    # circuit, integrated over the ACTUAL coil regions of the ACTUAL solved
    # field. At OPEN CIRCUIT that flux linkage IS lambda_pm, with no geometry
    # assumption, no winding-factor assumption and no sinusoid assumption. It is
    # the independent witness the campaign has been missing.
    #
    # UNIVERSAL: keyed off the circuit NAMES the deck already created, so any
    # machine with named phase circuits gets this for free.
    for circuit in ("phase_a", "phase_b", "phase_c"):
        lua.extend([
            f'ci_{circuit}, vi_{circuit}, fi_{circuit} = '
            f'mo_getcircuitproperties("{circuit}")',
            f'print("{RESULT_PREFIX} flux_linkage_{circuit}_wb="..fi_{circuit})',
            f'print("{RESULT_PREFIX} circuit_current_{circuit}_a="..ci_{circuit})',
        ])
    lua.append("quit()")
    return "\n".join(lua) + "\n"


def _execute_magnetic_point(
    geometry: FiaMachineGeometry,
    solver: Path,
    *,
    remanence_t: float,
    loaded: LoadedPointAssumptions | None,
    open_circuit_turns_per_slot: int = 1,
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
                open_circuit_turns_per_slot=open_circuit_turns_per_slot,
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
    for _c in ("phase_a", "phase_b", "phase_c"):
        expected.add(f"flux_linkage_{_c}_wb")
        expected.add(f"circuit_current_{_c}_a")
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
    current_angle_sweep: Sequence[Mapping[str, float]] | None = None,
    rotor_position_sweep: Sequence[Mapping[str, float]] | None = None,
    rotor_position_sweep_summary: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release electromagnetic artefact."""

    position_points = list(rotor_position_sweep or [])
    position_summary = dict(
        rotor_position_sweep_summary
        or summarize_rotor_position_sweep(
            position_points,
            required_shaft_torque_nm=duty.required_shaft_torque_nm,
        )
    )
    # GOTCHA: torque_reliable stays False until dyno/map close — that alone
    # keeps duty_torque_screen_ok False (honesty). Mean must also clear 1.0×.
    torque_reliable = False
    # Use DELIVERED torque (|mean of signed|), never the mean of |T|.
    mean_mag = position_summary.get("delivered_mean_torque_nm")
    if mean_mag is None:
        mean_mag = position_summary.get("torque_magnitude_mean_nm")
    if position_summary.get("torque_sign_consistent") is False:
        print(
            f"[em][duty] WARNING: torque REVERSES SIGN "
            f"({position_summary.get('sign_reversals')} crossings) across the "
            "rotor sweep at a fixed rotor-frame angle — the excitation is not "
            "tracking the rotor and every mean over this sweep is unreliable.",
            flush=True,
        )
    # ⭐ EXCITATION TRACKING BINDS THE DUTY SCREEN (2026-08-01). The sign-reversal
    # warning above was ADVISORY — it printed and the screen went on comparing a
    # meaningless average against the requirement. Run the harmonic screen and
    # let its verdict BLOCK, so a mis-excited machine can never present a mean.
    excitation_ok: bool | None = None
    excitation_report: dict | None = None
    try:
        sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))
        from machine_excitation_tracking import screen as _excitation_screen

        _pos = [float(r["rotor_position_mechanical_deg"]) for r in position_points]
        _tq = [float(r["torque_nm"]) for r in position_points]
        if len(_pos) >= 3:
            _span = _pos[-1] - _pos[0]
            if abs(_tq[-1] - _tq[0]) <= 1e-3 * max(1.0, abs(_tq[0])):
                _tq = _tq[:-1]            # drop the repeated endpoint sample
            else:
                _span += (_pos[-1] - _pos[0]) / (len(_pos) - 1)
            excitation_report = _excitation_screen(
                _tq, mechanical_span_deg=_span,
                pole_pairs=ROTOR_POLES // 2,
                stator_slots=stator_slots_from_twin(inputs))
            excitation_ok = bool(excitation_report.get("ok"))
            for _f in excitation_report.get("findings", []):
                print(f"[em][excitation] {_f['severity']} {_f['rule']}: "
                      f"{_f['detail']}", flush=True)
    except Exception as exc:  # noqa: BLE001 — never let the screen kill the solve
        print(f"[em][excitation] screen unavailable ({exc}); "
              "duty screen will NOT be bound to tracking", flush=True)

    duty_torque_screen_ok, duty_diag = evaluate_duty_torque_screen_ok(
        required_shaft_torque_nm=duty.required_shaft_torque_nm,
        peak_torque_magnitude_nm=abs(loaded_magnetic.torque_nm),
        mean_torque_magnitude_nm=(
            float(mean_mag) if mean_mag is not None else None
        ),
        torque_reliable=torque_reliable,
        excitation_tracking_ok=excitation_ok,
    )
    torque_ratio = float(duty_diag["peak_torque_vs_required_ratio"])

    return {
        "schema": "forgeos.motor_stack.em_fia_front_kit_case/v2",
        "status": "PARTIAL",
        # The screen's own verdict, recorded so the block is auditable rather
        # than a print that scrolls past. `None` = screen did not run.
        "excitation_tracking": excitation_report,
        "ship_ok": False,
        "works_in_kit_context": {
            "duty_torque_screen_ok": duty_torque_screen_ok,
            "torque_vs_required_ratio": round(torque_ratio, 6),
            "required_shaft_torque_nm": duty.required_shaft_torque_nm,
            "loaded_torque_magnitude_nm": abs(loaded_magnetic.torque_nm),
            "threshold_ratio": DUTY_TORQUE_SCREEN_RATIO,
            "mean_clear_ratio": DUTY_TORQUE_MEAN_CLEAR_RATIO,
            "torque_reliable": torque_reliable,
            "torque_magnitude_mean_nm": duty_diag.get("mean_torque_magnitude_nm"),
            "mean_torque_vs_required_ratio": duty_diag.get(
                "mean_torque_vs_required_ratio"
            ),
            "peak_interest_ok": duty_diag.get("peak_interest_ok"),
            "fail_reasons": duty_diag.get("fail_reasons"),
            "position_sweep_torque_vs_required_ratio_mean": position_summary.get(
                "torque_vs_required_ratio_mean"
            ),
            "note": (
                "duty_torque_screen_ok requires (1) torque_reliable=True and "
                f"(2) position-sweep mean |T| ≥ {DUTY_TORQUE_MEAN_CLEAR_RATIO:.0%} "
                "of analytical 250 kW shaft torque. Peak / best-angle |T| is "
                f"interest-only (bar {DUTY_TORQUE_SCREEN_RATIO:.0%}) and must "
                "never alone mint a PASS. Not MTPA, demag close, dyno, or ship_ok."
            ),
        },
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
                "Screened regenerative current angle near the kit torque peak; "
                "no MTPA or field-weakening schedule has been solved"
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
            "torque_method": "FEMM steady-state weighted-stress block integral (22) over rotor steel + magnets + AIRGAP AIR (the airgap is required for the weighting-function transition; omitting it under-reported by ~2.3x)",
            "torque_reliable": torque_reliable,
            "required_shaft_torque_nm": duty.required_shaft_torque_nm,
            "torque_vs_required_ratio": round(torque_ratio, 6),
            "torque_magnitude_mean_nm": duty_diag.get("mean_torque_magnitude_nm"),
            "mean_torque_vs_required_ratio": duty_diag.get(
                "mean_torque_vs_required_ratio"
            ),
            "duty_torque_screen_ok": duty_torque_screen_ok,
            "duty_screen_fail_reasons": duty_diag.get("fail_reasons"),
            "torque_status": (
                "ESTIMATE — solver-derived at twin-bound coil turns after a "
                "coarse current-angle screen; reference rotor position for the "
                "duty screen (see rotor_position_sweep for position dependence)"
            ),
            "current_angle_sweep": list(current_angle_sweep or []),
            "honesty_note": (
                "Reference loaded point uses a screened current angle and "
                "twin-bound conductors per slot (turns_per_coil). A coarse "
                "rotor-position sweep at that fixed angle may be attached to "
                "show torque ripple / position dependence — it is NOT a full "
                "MTPA, voltage, loss, demagnetisation or dyno map. Exact "
                "hairpin schedule and winding factor remain OPEN. Do not invent "
                "turns to force duty_torque_screen_ok."
            ),
        },
        "rotor_position_sweep": {
            "status": "PARTIAL" if position_points else "OPEN",
            "kind": (
                "coarse mechanical rotor-position sweep at fixed screened "
                "current angle"
            ),
            "current_angle_electrical_deg": (
                loaded_assumptions.current_angle_electrical_deg
            ),
            "positions_mechanical_deg": [
                float(row["rotor_position_mechanical_deg"])
                for row in position_points
                if "rotor_position_mechanical_deg" in row
            ],
            "points": position_points,
            "summary": position_summary,
            "note": (
                "PARTIAL coarse sweep only — enough to show torque vs "
                "mechanical rotor position at one current angle. Not a full "
                "MTPA map, fine ripple study, or ship_ok evidence."
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
                "Open-circuit + screened loaded point + coarse rotor-position "
                "sweep at one current angle are not a closed MTPA, voltage, "
                "loss, thermal or demagnetisation map."
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
    # ⭐ SCREEN THE ANGLE, do not assume it (2026-08-01). The current angle is
    # referenced to the phase-A BELT AXIS, whose position depends on the SLOT
    # COUNT. The old fixed −45° default was calibrated for a 48-slot belt; once
    # the deck meshed the twin's real 24 slots the same −45° sat near the torque
    # null and this selftest correctly FAILED. The default is therefore screened
    # over the coarse regen sweep for WHATEVER winding is meshed, so the check is
    # about the machine, not about one slot count.
    _best_angle, _best_mag = DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG, -1.0
    for _cand in LIVE_CURRENT_ANGLE_SWEEP_DEG:
        if _cand == -90.0:
            continue                      # the null itself is the comparison, not a candidate
        _try = run_loaded_magnetic_point(
            geometry, solver, remanence_t=remanence_t,
            assumptions=loaded_point_assumptions(
                duty, inputs, current_angle_electrical_deg=_cand),
        )
        if abs(_try.torque_nm) > _best_mag:
            _best_angle, _best_mag = _cand, abs(_try.torque_nm)
    loaded_assumptions = loaded_point_assumptions(
        duty, inputs, current_angle_electrical_deg=_best_angle)
    loaded_solved = run_loaded_magnetic_point(
        geometry,
        solver,
        remanence_t=remanence_t,
        assumptions=loaded_assumptions,
    )
    null_assumptions = loaded_point_assumptions(
        duty,
        inputs,
        current_angle_electrical_deg=-90.0,
    )
    null_solved = run_loaded_magnetic_point(
        geometry,
        solver,
        remanence_t=remanence_t,
        assumptions=null_assumptions,
    )
    near_zero = run_magnetic_point(
        geometry,
        solver,
        remanence_t=remanence_t * 1.0e-6,
    )
    # Selftest keeps FE count down: shape-check the position-sweep artefact
    # from the already-solved 0° point; unit tests cover selection/summary.
    selftest_position_sweep = [
        {
            "rotor_position_mechanical_deg": 0.0,
            "current_angle_electrical_deg": (
                loaded_assumptions.current_angle_electrical_deg
            ),
            "torque_nm": loaded_solved.torque_nm,
            "torque_magnitude_nm": abs(loaded_solved.torque_nm),
            "peak_airgap_flux_density_t": (
                loaded_solved.peak_airgap_flux_density_t
            ),
            "rms_airgap_flux_density_t": loaded_solved.rms_airgap_flux_density_t,
        }
    ]
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        duty=duty,
        magnetic=solved,
        loaded_assumptions=loaded_assumptions,
        loaded_magnetic=loaded_solved,
        solver_identity=_solver_identity(solver),
        source_state_sha256="synthetic-selftest",
        current_angle_sweep=[
            {
                "current_angle_electrical_deg": loaded_assumptions.current_angle_electrical_deg,
                "torque_nm": loaded_solved.torque_nm,
                "torque_magnitude_nm": abs(loaded_solved.torque_nm),
            },
            {
                "current_angle_electrical_deg": -90.0,
                "torque_nm": null_solved.torque_nm,
                "torque_magnitude_nm": abs(null_solved.torque_nm),
            },
        ],
        rotor_position_sweep=selftest_position_sweep,
    )
    checks = {
        "synthetic_quantities_control_geometry": (
            geometry.rotor_outer_diameter_mm == 122.0
            and geometry.active_length_mm == 98.0
            and geometry.rotor_outer_diameter_mm != 160.4
            and geometry.active_length_mm != 83.82
        ),
        "geometry_fits_twin": geometry.fits_housing and geometry.fits_bay,
        "magnet_fill_uses_rotor_ring": geometry.magnet_thickness_mm >= 5.0,
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
        # The SCREENED angle must clear the null by 1.5x. Pinning the angle to a
        # constant made this a test of one slot count rather than of the machine.
        "loaded_point_avoids_minus_90_null": (
            loaded_assumptions.current_angle_electrical_deg
            in LIVE_CURRENT_ANGLE_SWEEP_DEG
            and abs(loaded_solved.torque_nm) > abs(null_solved.torque_nm) * 1.5
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
            and artifact["rotor_position_sweep"]["status"] in {"OPEN", "PARTIAL"}
        ),
        # proveCatch (2026-07-31): the sweep MUST hold the commanded angle in the
        # ROTOR frame. A fixed-angle sweep measures the machine falling out of
        # synchronism, and because the duty screen is decided on the MEAN it kept
        # EM_TORQUE_VS_ROTOR_BORE open against a machine with ~43% margin. The
        # first assertion FAILS on the old fixed-angle behaviour.
        "sweep_holds_rotor_frame_angle": (
            rotor_frame_current_angle_deg(-40.0, 0.0, 8) == -40.0
            and rotor_frame_current_angle_deg(-40.0, 45.0, 8) == -40.0 + 180.0
            and rotor_frame_current_angle_deg(-40.0, 1.25, 8) == -40.0 + 5.0
            # 8 poles -> 4 pole pairs; a half electrical period is 45 deg mech.
            and rotor_frame_current_angle_deg(0.0, 45.0, 8) == 180.0
            # Different pole counts scale correctly.
            and rotor_frame_current_angle_deg(0.0, 30.0, 12) == 180.0
            and rotor_frame_current_angle_deg(0.0, 90.0, 4) == 180.0
            # Degenerate pole count must not divide by zero.
            and rotor_frame_current_angle_deg(0.0, 10.0, 1) == 10.0
        ),
        "position_sweep_helpers": (
            select_rotor_position_sweep_deg(max_points=4)
            == LIVE_ROTOR_POSITION_SWEEP_FAST_MECH_DEG
            and summarize_rotor_position_sweep(
                selftest_position_sweep,
                required_shaft_torque_nm=duty.required_shaft_torque_nm,
            )["n_positions"]
            == 1
        ),
        # proveCatch F-EM-1: peak interest OK + mean below required + unreliable
        # must NEVER mint duty_torque_screen_ok (council FATAL on twin).
        "duty_screen_rejects_peak_alone_greenwash": (
            evaluate_duty_torque_screen_ok(
                required_shaft_torque_nm=125.21,
                peak_torque_magnitude_nm=207.12,
                mean_torque_magnitude_nm=118.75,
                torque_reliable=False,
            )[0]
            is False
            and evaluate_duty_torque_screen_ok(
                required_shaft_torque_nm=125.21,
                peak_torque_magnitude_nm=207.12,
                mean_torque_magnitude_nm=118.75,
                torque_reliable=True,
            )[0]
            is False
            and evaluate_duty_torque_screen_ok(
                required_shaft_torque_nm=125.21,
                peak_torque_magnitude_nm=207.12,
                mean_torque_magnitude_nm=130.0,
                torque_reliable=True,
            )[0]
            is True
            and artifact["works_in_kit_context"]["duty_torque_screen_ok"] is False
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
    loaded_assumptions, loaded_magnetic, angle_sweep = select_best_loaded_point(
        geometry,
        solver,
        remanence_t=remanence_t,
        duty=duty,
        inputs=inputs,
    )
    # DEC-EM-1 (2026-07-31): was FOUR positions (0/15/30/45°). Four samples
    # across a half-electrical period ALIAS the torque ripple, and the duty
    # screen is decided on the MEAN — so the mean was an artefact of sample
    # placement, which is exactly why torque_reliable was false. Now the dense
    # 37-point / 1.25° sweep so the mean is defensible. Reuse the 0° solve.
    position_sweep, position_summary = run_rotor_position_sweep(
        geometry,
        solver,
        remanence_t=remanence_t,
        duty=duty,
        inputs=inputs,
        current_angle_electrical_deg=(
            loaded_assumptions.current_angle_electrical_deg
        ),
        positions_deg=LIVE_ROTOR_POSITION_SWEEP_DENSE_MECH_DEG,
        seed_result_at_zero=loaded_magnetic,
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
        current_angle_sweep=angle_sweep,
        rotor_position_sweep=position_sweep,
        rotor_position_sweep_summary=position_summary,
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
        f"Best screened loaded point at {loaded_assumptions.phase_current_rms_a:.1f} A rms "
        f"and {loaded_assumptions.current_angle_electrical_deg:.0f} electrical "
        f"degrees yielded {loaded_magnetic.torque_nm:.2f} N·m weighted-stress "
        f"torque ({artifact['works_in_kit_context']['torque_vs_required_ratio']:.0%} of "
        f"required; duty_torque_screen_ok="
        f"{artifact['works_in_kit_context']['duty_torque_screen_ok']}). "
        f"Coarse rotor-position sweep ({position_summary['n_positions']} pts) "
        f"|T| ratio min/mean/max="
        f"{position_summary['torque_vs_required_ratio_min']:.2f}/"
        f"{position_summary['torque_vs_required_ratio_mean']:.2f}/"
        f"{position_summary['torque_vs_required_ratio_max']:.2f} "
        f"(peak-to-peak |T|="
        f"{position_summary['peak_to_peak_magnitude_nm']:.1f} N·m). "
        "Full MTPA map, demagnetisation, thermal limits and dyno correlation "
        "remain OPEN; ship_ok is false."
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
