#!/usr/bin/env python3
"""FIA-bound hot demagnetisation SCREEN for the Formula E front-kit IPMSM.

Companion to ``em_fia_front_kit_case.py`` (OC + loaded torque screen).  Full
FE demagnetisation maps (current × rotor position × magnet temperature) remain
OPEN; this case is an analytical knee-point / Hci vs operating-H SCREEN at an
elevated magnet temperature using twin magnet-grade seeds (default N42UH).

Method (screening — not release):
1. Read twin duty / geometry / design current (and EM loaded angle when present).
2. Size V-magnets with the same keep-outs as the EM / magnet-pocket screens.
3. Estimate armature-reaction demagnetising H from Id-projected ampere-turns
   through the magnet thickness at the loaded point (~535 A, −45° elec).
4. Derate N42UH-class Hcj to the hot magnet temperature (default 160 °C;
   band 140–180 °C) and compare against the knee (Hk = 0.85 × Hcj).

SCREENING only — not a full demag map, not supplier BH curves, not three-phase
short-circuit worst corner, not dyno.  Status stays PARTIAL; ``ship_ok`` is
always false.  Optional FE air-gap cross-check from the existing EM artefact
is recorded when present; no new xfemm solve is required.
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
SCHEMA = "forgeos.motor_stack.em_fia_demag_screen/v1"

MU0 = 4.0e-7 * math.pi
STATOR_SLOTS = 48
ROTOR_POLES = 8
MAGNETS_PER_POLE = 2
ROTOR_BRIDGE_MM = 1.0
BRIDGE_KEEPOUT_MM = 2.0
MAGNET_TILT_DEG = 20.0

# Match phantm.materials NDFEB_GRADES + fpk_physics_tree NdFeB_N42UH seed.
DEFAULT_GRADE = "N42UH"
NDFEB_GRADES: dict[str, dict[str, Any]] = {
    "N42": {"br_t": 1.30, "hcj_a_per_m": 955e3, "t_max_c": 80.0, "alpha_hcj": -0.0060},
    "N42M": {"br_t": 1.30, "hcj_a_per_m": 1114e3, "t_max_c": 100.0, "alpha_hcj": -0.0060},
    "N42H": {"br_t": 1.30, "hcj_a_per_m": 1353e3, "t_max_c": 120.0, "alpha_hcj": -0.0060},
    "N42SH": {"br_t": 1.30, "hcj_a_per_m": 1592e3, "t_max_c": 150.0, "alpha_hcj": -0.0050},
    "N42UH": {"br_t": 1.28, "hcj_a_per_m": 1990e3, "t_max_c": 180.0, "alpha_hcj": -0.0050},
    "N42EH": {"br_t": 1.28, "hcj_a_per_m": 2388e3, "t_max_c": 200.0, "alpha_hcj": -0.0050},
}
KNEE_FRACTION = 0.85
MU_R_RECOIL = 1.05
ALPHA_BR_PER_K = -0.0012
T_REF_C = 20.0

# Hot magnet operating screen (UH class — inside 140–180 °C band).
DEFAULT_MAGNET_TEMP_C = 160.0
MAGNET_TEMP_BAND_C = (140.0, 180.0)
WINDING_FACTOR = 0.96
# Current angle for pure-q (Id≈0) in the EM kit convention.
Q_AXIS_ELECTRICAL_DEG = -90.0
DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG = -45.0
DEFAULT_PHASE_CURRENT_RMS_A = 535.0

# Screening floor: knee must exceed operating H (margin_ratio ≥ 1.0).
SCREEN_MARGIN_RATIO_MIN = 1.0


class FiaDemagScreenError(RuntimeError):
    """Raised when twin binding or demagnetisation screening evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this demagnetisation screen."""

    max_rotor_speed_rpm: float
    continuous_electrical_power_kw: float
    front_regen_electrical_cap_kw: float
    dc_bus_voltage_v: float
    phase_current_design_a: float
    turns_per_coil: float
    turns_per_phase: float
    winding_parallel_paths: float
    radial_airgap_mm: float
    rotor_inner_diameter_mm: float
    rotor_outer_diameter_mm: float
    stator_inner_diameter_mm: float
    stator_outer_diameter_mm: float
    active_length_mm: float
    bay_width_mm: float
    bay_depth_mm: float
    bay_height_mm: float
    mass_aspiration_kg: float
    housing_outer_diameter_mm: float
    housing_length_mm: float


@dataclass(frozen=True)
class MagnetGeometry:
    """EM-matched V-pocket magnet dimensions for the demag path length."""

    magnet_length_mm: float
    magnet_thickness_mm: float
    magnet_tilt_deg: float
    magnet_center_radius_mm: float
    outer_bridge_thickness_mm: float
    radial_airgap_mm: float
    poles: int
    magnets_per_pole: int
    fits_twin_rotor: bool


@dataclass(frozen=True)
class ScreenResults:
    """Hot knee vs operating-H screening results for one grade / load / temp."""

    magnet_grade: str
    magnet_temp_c: float
    phase_current_rms_a: float
    phase_current_peak_a: float
    current_angle_electrical_deg: float
    id_fraction: float
    turns_per_phase: float
    winding_factor: float
    armature_mmf_peak_at_per_pole: float
    demagnetising_mmf_at_per_pole: float
    magnet_thickness_m: float
    br_hot_t: float
    hcj_hot_a_per_m: float
    h_knee_a_per_m: float
    h_operating_a_per_m: float
    h_operating_full_armature_a_per_m: float
    demagnetisation_margin_ratio: float
    demagnetisation_margin_headroom: float
    below_knee: bool
    screen_ok: bool
    catalogue_t_max_c: float
    knee_fraction: float


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
    raise FiaDemagScreenError(
        "Missing positive twin quantity; expected one of: " + ", ".join(keys)
    )


def inputs_from_sections(
    quantities: Mapping[str, Any],
    concentric: Mapping[str, Any],
) -> TwinInputs:
    """Build controlled demag inputs from selectively read twin sections.

    INTENT: Demag screening must use kit rotor ring, turns, design current and
    duty — never a generic educational-machine magnet schedule.
    """

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
        dc_bus_voltage_v=_number(
            quantities,
            ("dc_bus_voltage_v", "dc_link_voltage_v"),
            default=750.0,
        ),
        phase_current_design_a=_number(
            quantities,
            ("phase_current_design_a", "phase_current_max_a"),
            default=DEFAULT_PHASE_CURRENT_RMS_A,
        ),
        turns_per_coil=_number(quantities, ("turns_per_coil",), default=4.0),
        turns_per_phase=_number(quantities, ("turns_per_phase",), default=14.0),
        winding_parallel_paths=_number(
            quantities, ("winding_parallel_paths",), default=2.0
        ),
        radial_airgap_mm=_number(
            concentric,
            ("airgap_mm",),
            default=_number(quantities, ("airgap_mm",), default=0.7),
        ),
        rotor_inner_diameter_mm=_number(
            concentric,
            ("rotor_id_mm",),
            default=_number(quantities, ("fpk_rotor_id_mm",), default=92.7),
        ),
        rotor_outer_diameter_mm=_number(
            concentric,
            ("rotor_od_mm",),
            default=_number(
                quantities,
                ("fpk_rotor_od_mm", "rotor_airgap_diameter_mm"),
                default=122.0,
            ),
        ),
        stator_inner_diameter_mm=_number(
            concentric,
            ("stator_id_mm",),
            default=_number(quantities, ("fpk_stator_id_mm",), default=123.4),
        ),
        stator_outer_diameter_mm=_number(
            concentric,
            ("stator_od_mm",),
            default=_number(quantities, ("fpk_stator_od_mm",), default=164.7),
        ),
        active_length_mm=_number(
            concentric,
            ("stack_len_mm",),
            default=_number(
                quantities,
                ("stack_length_mm", "active_length_mm"),
                default=97.58,
            ),
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
        housing_length_mm=_number(
            concentric,
            ("housing_len_mm",),
            default=_number(quantities, ("fpk_housing_len_mm",), default=141.1),
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
        raise FiaDemagScreenError(f"Twin state not found: {state_path}")

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
    raise FiaDemagScreenError(f"{last_error}; rerun on a stable stamp")


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the selected quantities that control this case."""

    payload = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _magnet_matches_shared_rule(inputs, geometry) -> bool:
    """Does this screen's magnet equal the one the torque model builds?

    The invariant the old band check should have been: one machine, one magnet.
    A demag margin computed for a magnet the EM model does not contain is not a
    margin for this machine.
    """
    try:
        import sys as _sys
        _sys.path.insert(0, str(Path(__file__).resolve().parent))
        from em_fia_front_kit_case import solve_v_magnet_dimensions

        t, l = solve_v_magnet_dimensions(
            rotor_inner_diameter_mm=inputs.rotor_inner_diameter_mm,
            rotor_outer_diameter_mm=inputs.rotor_outer_diameter_mm,
            bridge_keepout_mm=BRIDGE_KEEPOUT_MM,
            magnet_tilt_deg=MAGNET_TILT_DEG,
        )
        return (abs(t - geometry.magnet_thickness_mm) < 1e-3
                and abs(l - geometry.magnet_length_mm) < 1e-3)
    except Exception:  # noqa: BLE001
        return False


def derive_magnet_geometry(inputs: TwinInputs) -> MagnetGeometry:
    """Map twin rotor ring onto EM-matched V-magnet thickness (demag path).

    INTENT: Share magnet sizing with ``em_fia_front_kit_case`` /
    ``calculix_fia_magnet_pocket_screen`` so torque, pocket stress and demag
    screens tell one pocket story.
    """

    ri = inputs.rotor_inner_diameter_mm / 2.0
    ro = inputs.rotor_outer_diameter_mm / 2.0
    if ro <= ri:
        raise FiaDemagScreenError(
            "Rotor outer diameter must exceed inner diameter for the demag screen"
        )
    rotor_ring_mm = ro - ri
    usable_radial_mm = max(4.0, rotor_ring_mm - BRIDGE_KEEPOUT_MM)

    # ⭐⭐ ONE SIZING RULE (2026-08-01). This screen used to size the magnet
    # ITSELF — max(3.5, min(7.0, usable*0.55)) x max(12.0, min(18.0,
    # usable*1.35)) — giving 7.00 x 18.00 mm on the live twin while
    # em_fia_front_kit_case built 8.85 x 14.58 mm. TWO DIFFERENT MAGNETS in two
    # screens of ONE machine, despite this function's own docstring promising to
    # "share magnet sizing with em_fia_front_kit_case ... so torque, pocket
    # stress and demag screens tell one pocket story". The intent was right and
    # the implementation had drifted.
    #
    # It matters because demagnetising H runs through the magnet THICKNESS: the
    # x3.79 margin this screen reported was a margin for a magnet the torque
    # model does not contain, and the magnet A/B override could not reach here
    # at all — so a rebalanced magnet could never be demag-checked.
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent))
    from em_fia_front_kit_case import solve_v_magnet_dimensions  # noqa: PLC0415

    magnet_thickness_mm, magnet_length_mm = solve_v_magnet_dimensions(
        rotor_inner_diameter_mm=inputs.rotor_inner_diameter_mm,
        rotor_outer_diameter_mm=inputs.rotor_outer_diameter_mm,
        bridge_keepout_mm=BRIDGE_KEEPOUT_MM,
        magnet_tilt_deg=MAGNET_TILT_DEG,
    )
    tilt = math.radians(MAGNET_TILT_DEG)
    radial_half_extent_mm = (
        magnet_length_mm / 2.0 * math.sin(tilt)
        + magnet_thickness_mm / 2.0 * math.cos(tilt)
    )
    magnet_center_radius = ro - ROTOR_BRIDGE_MM - radial_half_extent_mm
    if magnet_center_radius - radial_half_extent_mm <= ri + ROTOR_BRIDGE_MM:
        raise FiaDemagScreenError(
            "Twin hollow-rotor ring cannot retain the derived V-magnet with "
            f"{ROTOR_BRIDGE_MM:.1f} mm inner and outer bridges"
        )
    fits = (
        inputs.rotor_outer_diameter_mm < inputs.housing_outer_diameter_mm
        and inputs.active_length_mm <= inputs.housing_length_mm + 1.0e-6
        and abs(
            (inputs.stator_inner_diameter_mm - inputs.rotor_outer_diameter_mm) / 2.0
            - inputs.radial_airgap_mm
        )
        < 0.2
    )
    return MagnetGeometry(
        magnet_length_mm=round(magnet_length_mm, 4),
        magnet_thickness_mm=round(magnet_thickness_mm, 4),
        magnet_tilt_deg=MAGNET_TILT_DEG,
        magnet_center_radius_mm=round(magnet_center_radius, 4),
        outer_bridge_thickness_mm=ROTOR_BRIDGE_MM,
        radial_airgap_mm=inputs.radial_airgap_mm,
        poles=ROTOR_POLES,
        magnets_per_pole=MAGNETS_PER_POLE,
        fits_twin_rotor=fits,
    )


def id_fraction_from_current_angle(current_angle_electrical_deg: float) -> float:
    """Fraction of armature MMF treated as demagnetising Id.

    DECISION: EM kit uses −90° elec as near-pure q (Id≈0).  Advance from that
    q-axis projects Id = I · sin(γ − γ_q).  Absolute fraction in [0, 1].
    """

    delta = math.radians(current_angle_electrical_deg - Q_AXIS_ELECTRICAL_DEG)
    return abs(math.sin(delta))


def hcj_at(grade: str, temp_c: float) -> float:
    """Intrinsic coercivity at temperature (A/m, positive magnitude)."""

    if grade not in NDFEB_GRADES:
        raise FiaDemagScreenError(
            f"Unknown magnet grade {grade!r}; known: {sorted(NDFEB_GRADES)}"
        )
    g = NDFEB_GRADES[grade]
    hcj = g["hcj_a_per_m"] * (1.0 + g["alpha_hcj"] * (temp_c - T_REF_C))
    return max(float(hcj), 0.0)


def br_at(grade: str, temp_c: float) -> float:
    """Remanence at temperature (T) from catalogue Br seed + α_Br."""

    g = NDFEB_GRADES[grade]
    return float(g["br_t"]) * (1.0 + ALPHA_BR_PER_K * (temp_c - T_REF_C))


def run_screen(
    inputs: TwinInputs,
    geometry: MagnetGeometry,
    *,
    magnet_grade: str = DEFAULT_GRADE,
    magnet_temp_c: float = DEFAULT_MAGNET_TEMP_C,
    phase_current_rms_a: float | None = None,
    current_angle_electrical_deg: float = DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG,
) -> ScreenResults:
    """Analytical hot knee vs armature-reaction operating-H SCREEN.

    INTENT: Answer whether the twin N42UH-class seed stays above its knee at
    the loaded duty / hot magnet temperature — without claiming a full FE demag
    map or supplier BH curve.
    """

    if magnet_grade not in NDFEB_GRADES:
        raise FiaDemagScreenError(
            f"Unknown magnet grade {magnet_grade!r}; known: {sorted(NDFEB_GRADES)}"
        )
    i_rms = (
        float(phase_current_rms_a)
        if phase_current_rms_a is not None
        else float(inputs.phase_current_design_a)
    )
    if i_rms <= 0.0:
        raise FiaDemagScreenError("phase current must be positive")
    if geometry.magnet_thickness_mm <= 0.0:
        raise FiaDemagScreenError("magnet thickness must be positive")

    i_peak = i_rms * math.sqrt(2.0)
    n_ph = float(inputs.turns_per_phase)
    # Peak fundamental armature MMF (AT/pole) — classic IPMSM screening form.
    f_a = (
        (3.0 * math.sqrt(2.0) / math.pi)
        * (WINDING_FACTOR * n_ph * i_rms)
        / float(ROTOR_POLES)
    )
    id_frac = id_fraction_from_current_angle(current_angle_electrical_deg)
    f_d = f_a * id_frac
    h_m = geometry.magnet_thickness_mm / 1000.0
    # GOTCHA: H = AT / thickness is a pessimistic SCREEN (ignores iron + leakage
    # reluctance).  Full FE corner maps remain OPEN for release.
    h_op = f_d / h_m if h_m > 0.0 else float("inf")
    h_op_full = f_a / h_m if h_m > 0.0 else float("inf")

    hcj = hcj_at(magnet_grade, magnet_temp_c)
    h_knee = KNEE_FRACTION * hcj
    br_hot = br_at(magnet_grade, magnet_temp_c)
    margin_ratio = (h_knee / h_op) if h_op > 0.0 else float("inf")
    headroom = ((h_knee - h_op) / h_knee) if h_knee > 0.0 else -1.0
    below_knee = h_op < h_knee
    screen_ok = margin_ratio >= SCREEN_MARGIN_RATIO_MIN and below_knee

    return ScreenResults(
        magnet_grade=magnet_grade,
        magnet_temp_c=float(magnet_temp_c),
        phase_current_rms_a=round(i_rms, 6),
        phase_current_peak_a=round(i_peak, 6),
        current_angle_electrical_deg=float(current_angle_electrical_deg),
        id_fraction=round(id_frac, 6),
        turns_per_phase=n_ph,
        winding_factor=WINDING_FACTOR,
        armature_mmf_peak_at_per_pole=round(f_a, 4),
        demagnetising_mmf_at_per_pole=round(f_d, 4),
        magnet_thickness_m=round(h_m, 6),
        br_hot_t=round(br_hot, 6),
        hcj_hot_a_per_m=round(hcj, 3),
        h_knee_a_per_m=round(h_knee, 3),
        h_operating_a_per_m=round(h_op, 3),
        h_operating_full_armature_a_per_m=round(h_op_full, 3),
        demagnetisation_margin_ratio=round(margin_ratio, 6),
        demagnetisation_margin_headroom=round(headroom, 6),
        below_knee=below_knee,
        screen_ok=screen_ok,
        catalogue_t_max_c=float(NDFEB_GRADES[magnet_grade]["t_max_c"]),
        knee_fraction=KNEE_FRACTION,
    )


def load_em_case_hints(twin_dir: Path) -> dict[str, Any]:
    """Optionally read loaded-point angle/current/B from the EM case artefact."""

    path = twin_dir / "_motor_stack" / "em_fia_front_kit_case.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(data, dict):
        return {}
    loaded = data.get("loaded_point") if isinstance(data.get("loaded_point"), dict) else {}
    hints: dict[str, Any] = {"em_case_path": str(path.resolve()), "em_case_present": True}
    if loaded.get("phase_current_rms_a") is not None:
        hints["phase_current_rms_a"] = float(loaded["phase_current_rms_a"])
    if loaded.get("current_angle_electrical_deg") is not None:
        hints["current_angle_electrical_deg"] = float(
            loaded["current_angle_electrical_deg"]
        )
    if loaded.get("peak_airgap_flux_density_t") is not None:
        b_peak = float(loaded["peak_airgap_flux_density_t"])
        hints["loaded_peak_airgap_flux_density_t"] = b_peak
        # Cheap FE cross-check only — air-gap H ≠ magnet operating H.
        hints["loaded_peak_airgap_h_a_per_m"] = b_peak / MU0
    if loaded.get("torque_magnitude_nm") is not None:
        hints["loaded_torque_magnitude_nm"] = float(loaded["torque_magnitude_nm"])
    return hints


def temperature_band_screens(
    inputs: TwinInputs,
    geometry: MagnetGeometry,
    *,
    magnet_grade: str,
    phase_current_rms_a: float,
    current_angle_electrical_deg: float,
) -> list[dict[str, Any]]:
    """Evaluate the screen at band edges + default hot point for sensitivity."""

    temps = sorted(
        {
            MAGNET_TEMP_BAND_C[0],
            DEFAULT_MAGNET_TEMP_C,
            MAGNET_TEMP_BAND_C[1],
        }
    )
    rows: list[dict[str, Any]] = []
    for temp in temps:
        r = run_screen(
            inputs,
            geometry,
            magnet_grade=magnet_grade,
            magnet_temp_c=temp,
            phase_current_rms_a=phase_current_rms_a,
            current_angle_electrical_deg=current_angle_electrical_deg,
        )
        rows.append(
            {
                "magnet_temp_c": r.magnet_temp_c,
                "hcj_hot_a_per_m": r.hcj_hot_a_per_m,
                "h_knee_a_per_m": r.h_knee_a_per_m,
                "h_operating_a_per_m": r.h_operating_a_per_m,
                "demagnetisation_margin_ratio": r.demagnetisation_margin_ratio,
                "demagnetisation_margin_headroom": r.demagnetisation_margin_headroom,
                "screen_ok": r.screen_ok,
            }
        )
    return rows


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: MagnetGeometry,
    results: ScreenResults,
    source_state_sha256: str,
    source_twin: str,
    em_hints: Mapping[str, Any] | None = None,
    band_rows: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release demag screen artefact."""

    hints = dict(em_hints or {})
    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "magnet_geometry": asdict(geometry),
        "screening_results": asdict(results),
        "temperature_band_c": {
            "low": MAGNET_TEMP_BAND_C[0],
            "nominal_screen": DEFAULT_MAGNET_TEMP_C,
            "high": MAGNET_TEMP_BAND_C[1],
            "rows": list(band_rows or []),
        },
        "margins": {
            "demagnetisation_margin_ratio": results.demagnetisation_margin_ratio,
            "demagnetisation_margin_headroom": results.demagnetisation_margin_headroom,
            "h_knee_a_per_m": results.h_knee_a_per_m,
            "h_operating_a_per_m": results.h_operating_a_per_m,
            "below_knee": results.below_knee,
            "screen_ok": results.screen_ok,
            "screen_margin_ratio_min": SCREEN_MARGIN_RATIO_MIN,
            "demag_map_closed": False,
            "release_fos_closed": False,
            "note": (
                "SCREENING only: analytical Hk(T) vs Id-projected armature H "
                f"at {results.magnet_temp_c:.0f} °C for {results.magnet_grade}. "
                "Not a full FE demag map, not supplier BH, not short-circuit "
                "corner. Never claim demag PASS / ship_ok from this screen."
            ),
        },
        "material_assumptions": {
            "magnet_grade": results.magnet_grade,
            "br_seed_t": NDFEB_GRADES[results.magnet_grade]["br_t"],
            "hcj_20c_a_per_m": NDFEB_GRADES[results.magnet_grade]["hcj_a_per_m"],
            "alpha_hcj_per_k": NDFEB_GRADES[results.magnet_grade]["alpha_hcj"],
            "alpha_br_per_k": ALPHA_BR_PER_K,
            "knee_fraction": KNEE_FRACTION,
            "mu_r_recoil": MU_R_RECOIL,
            "catalogue_t_max_c": results.catalogue_t_max_c,
            "label": (
                f"{results.magnet_grade}-class seed (phantm NDFEB_GRADES + "
                "fpk_physics_tree NdFeB_N42UH) — supplier grade / BH curve OPEN."
            ),
        },
        "model_assumptions": [
            (
                "Peak armature MMF F_a = (3√2/π)·(k_w·N_ph·I_rms)/n_poles "
                f"with k_w={WINDING_FACTOR}."
            ),
            (
                f"Id fraction = |sin(γ − {Q_AXIS_ELECTRICAL_DEG:.0f}°)| from the "
                "EM kit q-axis convention (−90° ≈ pure q)."
            ),
            (
                "Operating H ≈ F_d / magnet_thickness (pessimistic SCREEN; "
                "iron + leakage reluctance ignored)."
            ),
            (
                f"H_knee = {KNEE_FRACTION}·Hcj(T); Hcj linear derate from "
                f"catalogue minimum at {T_REF_C:.0f} °C."
            ),
            (
                f"Hot magnet screen at {DEFAULT_MAGNET_TEMP_C:.0f} °C inside "
                f"{MAGNET_TEMP_BAND_C[0]:.0f}–{MAGNET_TEMP_BAND_C[1]:.0f} °C band."
            ),
            "Full FE demagnetisation map (I × θ × T) remains OPEN.",
            "Three-phase short-circuit / inverter-fault demag corner remains OPEN.",
        ],
        "em_case_cross_check": hints,
        "solver": {
            "name": "Analytical knee / Hci demagnetisation screen",
            "version": "v1",
            "runtime": "analytical",
            "xfemm_demag_map": {
                "status": "OPEN",
                "reason": (
                    "Full xfemm demag map deferred; optional cheap FE air-gap "
                    "numbers are read from em_fia_front_kit_case.json when present."
                ),
            },
        },
        "geometry_provenance": {
            "controlling_dimensions": (
                "state.fpkConcentricGeometry rotor/stator + orchestratorContract "
                "turns / phase_current_design_a / duty"
            ),
            "magnet_sizing": (
                "Same V-pocket keep-outs as em_fia_front_kit_case / "
                "calculix_fia_magnet_pocket_screen"
            ),
            "training_geometry_used": False,
            "lucid_or_proprietary_cad_used": False,
            "statement": (
                "Twin-bound analytical hot demag SCREEN on kit magnet thickness "
                "and design current; not educational-machine magnets and not a "
                "release demag map."
            ),
        },
        "fia_question": (
            f"Does the {results.magnet_grade} magnet stay above its knee at "
            f"~{results.magnet_temp_c:.0f} °C under loaded "
            f"~{results.phase_current_rms_a:.0f} A rms / "
            f"{results.current_angle_electrical_deg:.0f}° elec as a SCREENING "
            "check (full demag map still OPEN)?"
        ),
        "works_in_kit_context": {
            "demag_screen_ok": results.screen_ok,
            "demagnetisation_margin_ratio": results.demagnetisation_margin_ratio,
            "magnet_temp_c": results.magnet_temp_c,
            "magnet_grade": results.magnet_grade,
        },
        "demagnetisation_map": {
            "status": "OPEN",
            "statement": (
                "Full current × rotor-position × magnet-temperature demagnetisation "
                "map is not closed. This artefact is a single-point hot knee screen."
            ),
        },
        "release_statement": (
            "Concept evidence only. No FIA homologation, supplier magnet curve, "
            "race evidence or permission to ship. Never claim demag PASS or "
            "ship_ok from this screening case."
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
        "dc_bus_voltage_v": {"value": 750.0, "unit": "V"},
        "phase_current_design_a": {"value": 535.0, "unit": "A"},
        "turns_per_coil": {"value": 4.0, "unit": "-"},
        "turns_per_phase": {"value": 14.0, "unit": "-"},
        "winding_parallel_paths": {"value": 2.0, "unit": "-"},
        "airgap_mm": {"value": 0.7, "unit": "mm"},
        "fpk_rotor_id_mm": {"value": 92.7, "unit": "mm"},
        "fpk_rotor_od_mm": {"value": 122.0, "unit": "mm"},
        "fpk_stator_id_mm": {"value": 123.4, "unit": "mm"},
        "fpk_stator_od_mm": {"value": 164.7, "unit": "mm"},
        "stack_length_mm": {"value": 97.58, "unit": "mm"},
        "front_bay_envelope_w_mm": {"value": 343.0, "unit": "mm"},
        "front_bay_envelope_d_mm": {"value": 259.0, "unit": "mm"},
        "front_bay_envelope_h_mm": {"value": 267.0, "unit": "mm"},
        "fpk_mass_cap_kg": {"value": 32.0, "unit": "kg"},
        "fpk_housing_od_mm": {"value": 176.7, "unit": "mm"},
        "fpk_housing_len_mm": {"value": 140.5, "unit": "mm"},
    }
    concentric = {
        "housing_od_mm": 176.7,
        "housing_len_mm": 140.5,
        "rotor_id_mm": 92.7,
        "rotor_od_mm": 122.0,
        "stator_id_mm": 123.4,
        "stator_od_mm": 164.7,
        "stack_len_mm": 97.58,
        "airgap_mm": 0.7,
    }
    return quantities, concentric


def run_selftest() -> int:
    """Prove twin binding, hot margin, and absurd current/temp proveCatch."""

    quantities, concentric = _synthetic_sections()
    inputs = inputs_from_sections(quantities, concentric)
    geometry = derive_magnet_geometry(inputs)
    results = run_screen(
        inputs,
        geometry,
        magnet_grade=DEFAULT_GRADE,
        magnet_temp_c=DEFAULT_MAGNET_TEMP_C,
        phase_current_rms_a=DEFAULT_PHASE_CURRENT_RMS_A,
        current_angle_electrical_deg=DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG,
    )
    # proveCatch A: absurd current collapses margin (linear in I).
    hot_i = run_screen(
        inputs,
        geometry,
        magnet_grade=DEFAULT_GRADE,
        magnet_temp_c=DEFAULT_MAGNET_TEMP_C,
        phase_current_rms_a=DEFAULT_PHASE_CURRENT_RMS_A * 50.0,
        current_angle_electrical_deg=DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG,
    )
    # proveCatch B: absurd temperature collapses Hcj / knee.
    hot_t = run_screen(
        inputs,
        geometry,
        magnet_grade=DEFAULT_GRADE,
        magnet_temp_c=260.0,
        phase_current_rms_a=DEFAULT_PHASE_CURRENT_RMS_A,
        current_angle_electrical_deg=DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG,
    )
    band = temperature_band_screens(
        inputs,
        geometry,
        magnet_grade=DEFAULT_GRADE,
        phase_current_rms_a=DEFAULT_PHASE_CURRENT_RMS_A,
        current_angle_electrical_deg=DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG,
    )
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        results=results,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
        band_rows=band,
    )
    checks = {
        # ⭐ THE ASSERTION THAT MATTERS, replacing a hardcoded 3.5-7.0 mm band
        # (2026-08-01). That band was calibrated to this screen's OWN sizing
        # rule — so it PASSED for years while the screen sized a 7.00 mm magnet
        # against the EM deck's 8.85 mm. It was validating the divergence, not
        # catching it. What must be true is that BOTH screens describe THE SAME
        # MAGNET; assert that directly against the shared derivation.
        "magnet_matches_the_em_deck": _magnet_matches_shared_rule(
            inputs, geometry),
        "geometry_fits_twin_rotor": geometry.fits_twin_rotor,
        "id_fraction_at_minus_45": abs(results.id_fraction - math.sqrt(0.5)) < 1.0e-6,
        "nominal_fields_positive_finite": (
            results.h_knee_a_per_m > 0.0
            and results.h_operating_a_per_m > 0.0
            and results.hcj_hot_a_per_m > results.h_knee_a_per_m
            and math.isfinite(results.demagnetisation_margin_ratio)
        ),
        "nominal_screen_above_knee": (
            results.screen_ok and results.demagnetisation_margin_ratio >= 1.0
        ),
        "absurd_current_collapses_margin": (
            hot_i.h_operating_a_per_m > 40.0 * results.h_operating_a_per_m
            and hot_i.demagnetisation_margin_ratio
            < results.demagnetisation_margin_ratio / 20.0
            and hot_i.screen_ok is False
        ),
        "absurd_temp_collapses_margin": (
            hot_t.h_knee_a_per_m < 0.25 * results.h_knee_a_per_m
            and hot_t.demagnetisation_margin_ratio
            < results.demagnetisation_margin_ratio / 2.0
            and hot_t.screen_ok is False
        ),
        "temp_band_rows_present": len(band) == 3,
        "release_honesty": (
            artifact["status"] == "PARTIAL"
            and artifact["ship_ok"] is False
            and artifact["margins"]["demag_map_closed"] is False
            and artifact["demagnetisation_map"]["status"] == "OPEN"
            and artifact["solver"]["xfemm_demag_map"]["status"] == "OPEN"
        ),
        "never_ship_ok_true": artifact["ship_ok"] is False,
        "slots_poles_kit": STATOR_SLOTS == 48 and ROTOR_POLES == 8,
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "geometry": asdict(geometry),
                "screening_results": asdict(results),
                "absurd_current_margin_ratio": hot_i.demagnetisation_margin_ratio,
                "absurd_temp_margin_ratio": hot_t.demagnetisation_margin_ratio,
                "ship_ok": artifact["ship_ok"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist one hot demag screen against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    geometry = derive_magnet_geometry(inputs)
    em_hints = load_em_case_hints(twin_dir)
    i_rms = float(
        em_hints.get("phase_current_rms_a", inputs.phase_current_design_a)
    )
    angle = float(
        em_hints.get(
            "current_angle_electrical_deg",
            DEFAULT_CURRENT_ANGLE_ELECTRICAL_DEG,
        )
    )
    results = run_screen(
        inputs,
        geometry,
        magnet_grade=DEFAULT_GRADE,
        magnet_temp_c=DEFAULT_MAGNET_TEMP_C,
        phase_current_rms_a=i_rms,
        current_angle_electrical_deg=angle,
    )
    if not (
        results.h_knee_a_per_m > 0.0
        and results.h_operating_a_per_m > 0.0
        and math.isfinite(results.demagnetisation_margin_ratio)
    ):
        raise FiaDemagScreenError(
            "Screened demag fields are outside the screening plausibility envelope"
        )
    band = temperature_band_screens(
        inputs,
        geometry,
        magnet_grade=DEFAULT_GRADE,
        phase_current_rms_a=i_rms,
        current_angle_electrical_deg=angle,
    )
    try:
        twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
    except ValueError:
        twin_label = str(twin_dir.resolve())
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        results=results,
        source_state_sha256=state_hash,
        source_twin=twin_label,
        em_hints=em_hints,
        band_rows=band,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / "em_fia_demag_screen.json"
    )
    _atomic_write_json(destination, artifact)
    ok_word = "OK" if results.screen_ok else "BELOW knee"
    print(
        "FIA front-kit hot demagnetisation analytical screen: "
        f"{results.magnet_grade} @ {results.magnet_temp_c:.0f} °C, "
        f"I_rms ≈ {results.phase_current_rms_a:.0f} A, "
        f"γ ≈ {results.current_angle_electrical_deg:.0f}° elec "
        f"(Id frac {results.id_fraction:.3f}). "
        f"H_knee ≈ {results.h_knee_a_per_m/1e3:.1f} kA/m, "
        f"H_op ≈ {results.h_operating_a_per_m/1e3:.1f} kA/m, "
        f"margin ratio ×{results.demagnetisation_margin_ratio:.2f} "
        f"(headroom {results.demagnetisation_margin_headroom*100:.1f}% — {ok_word}). "
        f"Magnet t ≈ {geometry.magnet_thickness_mm:.2f} mm. "
        "Full demag map remains OPEN; ship_ok is false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description=(
            "Solve the FIA-bound Formula E front-kit analytical hot "
            "demagnetisation screening case (full demag map OPEN)."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic binding plus absurd current/temp proveCatch",
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
