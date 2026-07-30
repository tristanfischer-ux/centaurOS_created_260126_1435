#!/usr/bin/env python3
"""FIA-bound straight-bevel differential strength SCREEN for Formula E front kit.

INTENT: Answer whether the twin's compact bevel differential packaging nest
(diff OD inside the planetary carrier) can carry carrier torque
≈ gear_ratio × ~125 N·m motor shaft (~1001 N·m at ratio 8) without
tooth-root bending or flank contact stressing assumed case-hardened steel
beyond a screening factor of safety.

DECISION: Simplified handbook bending + Hertz contact on straight bevels —
NOT a full ISO 23509 bevel geometry close, NOT KISSsoft, NOT CalculiX tooth
contact, NOT a race load-spectrum fatigue sum. Status stays PARTIAL;
``ship_ok`` is always false.

When twin tooth counts are absent (typical — communication geometry only),
documented packaging seeds are used and labelled as such.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import ijson


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO_ROOT / "out" / "formula-e-front-mgu-20260729-1432"
SCHEMA = "forgeos.motor_stack.iso_bevel_fia_front_kit_case/v1"

# Screening allowables — same MQ case-hardened band as planetary ISO screen.
SIGMA_F_ALLOW_MPA = 450.0
SIGMA_H_ALLOW_MPA = 1500.0
SIGMA_F_ALLOW_BASIS = (
    "ISO 6336-5:2016 MQ case-hardened steel σF lim ≈ 430–500 MPa; "
    "screening allowable 450 MPa (applied to straight-bevel virtual spur)"
)
SIGMA_H_ALLOW_BASIS = (
    "ISO 6336-5:2016 MQ case-hardened steel σH lim ≈ 1500 MPa; "
    "screening allowable 1500 MPa (Hertz at mean pitch)"
)

APPLICATION_FACTOR_KA = 1.25
PRESSURE_ANGLE_DEG = 20.0
ZE_STEEL_SQRT_MPA = 189.8
ZH_SPUR_20DEG = 2.495
# Straight-bevel screening knockdowns vs spur handbook forms (not ISO 23509).
Y_BEVEL_FORM = 0.85
K_BEVEL_CONTACT = 1.15
SCREEN_FOS_MIN = 1.20
ASSUMED_COMBINED_EFFICIENCY = 0.9777
DEFAULT_GEAR_RATIO = 8.0

# Documented packaging seeds when twin lacks bevel tooth counts / face.
# Blender communication cues: side gear r≈0.28·diff_od → pitch≈0.56·OD;
# pinion r≈0.18·diff_od → pitch≈0.36·OD. Tooth counts are typical mini
# open-diff seeds (not a released drawing).
DEFAULT_SPIDER_PINION_TEETH = 10
DEFAULT_SIDE_GEAR_TEETH = 14
DEFAULT_SPIDER_COUNT = 2
SIDE_PITCH_FRACTION_OF_DIFF_OD = 0.55
PINION_PITCH_FRACTION_OF_DIFF_OD = 0.36
PACKAGING_SEED_LABEL = (
    "documented packaging seed (twin tooth counts absent — "
    "communication geometry / Blender cues, not ISO 23509 closed)"
)


class FiaFrontKitBevelError(RuntimeError):
    """Raised when twin binding or bevel-strength evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this bevel differential case."""

    max_rotor_speed_rpm: float
    continuous_electrical_power_kw: float
    front_regen_electrical_cap_kw: float
    gear_ratio: float
    diff_od_mm: float
    diff_len_mm: float
    gear_face_mm: float
    spider_pinion_teeth: int
    side_gear_teeth: int
    spider_count: int
    bevel_face_width_mm: float
    motor_shaft_torque_nm: float | None
    tooth_counts_from_twin: bool
    tooth_count_basis: str


@dataclass(frozen=True)
class BevelGeometry:
    """Resolved straight-bevel open-diff geometry for the handbook screen."""

    diff_od_mm: float
    diff_len_mm: float
    spider_pinion_teeth: int
    side_gear_teeth: int
    spider_count: int
    pinion_pitch_diameter_mm: float
    side_pitch_diameter_mm: float
    outer_module_mm: float
    mean_module_mm: float
    face_width_mm: float
    cone_distance_mm: float
    pressure_angle_deg: float
    shaft_angle_deg: float
    ratio_u: float
    tooth_counts_from_twin: bool
    tooth_count_basis: str


@dataclass(frozen=True)
class MeshScreen:
    """Bending and contact screen for the spider–side bevel mesh."""

    mesh_name: str
    pinion_teeth: int
    wheel_teeth: int
    pinion_mean_pitch_diameter_mm: float
    wheel_mean_pitch_diameter_mm: float
    tangential_force_n: float
    pitch_line_velocity_m_s: float
    dynamic_factor_kv: float
    tooth_form_factor_yf: float
    bending_stress_mpa: float
    contact_stress_mpa: float
    bending_fos: float
    contact_fos: float
    bending_ok: bool
    contact_ok: bool


@dataclass(frozen=True)
class StrengthScreen:
    """Aggregate bevel differential strength screen vs assumed allowables."""

    motor_shaft_torque_nm: float
    carrier_input_torque_nm: float
    side_gear_torque_nm: float
    meshes: tuple[MeshScreen, ...]
    minimum_bending_fos: float
    minimum_contact_fos: float
    minimum_strength_factor: float
    works_in_kit_context: bool
    screen_fos_required: float


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
    raise FiaFrontKitBevelError(
        "Missing positive twin quantity; expected one of: " + ", ".join(keys)
    )


def _optional_number(
    values: Mapping[str, Any],
    keys: Sequence[str],
) -> float | None:
    """Return a positive quantity when present, else None."""

    try:
        return _number(values, keys)
    except FiaFrontKitBevelError:
        return None


def _optional_int(
    values: Mapping[str, Any],
    keys: Sequence[str],
) -> int | None:
    """Return a positive integer quantity when present, else None."""

    value = _optional_number(values, keys)
    if value is None:
        return None
    return int(round(value))


def _parse_box_len_mm(box: Any) -> float | None:
    """Parse leading length from principal-box strings like '19x19x19 mm'."""

    if not isinstance(box, str):
        return None
    match = re.match(r"\s*(\d+(?:\.\d+)?)\s*x", box.strip(), flags=re.IGNORECASE)
    if not match:
        return None
    value = float(match.group(1))
    return value if value > 0.0 else None


def _tooth_seeds_from_physics_tree(
    physics_values: Mapping[str, Any],
) -> tuple[int | None, int | None, int | None]:
    """Pull spider/side tooth counts from physics-tree node values when present."""

    spider_z = _optional_int(
        physics_values,
        (
            "spider_pinion_teeth",
            "diff_pinion_teeth",
            "bevel_pinion_teeth",
            "pinion_teeth",
        ),
    )
    side_z = _optional_int(
        physics_values,
        (
            "side_gear_teeth",
            "bevel_side_gear_teeth",
            "diff_side_gear_teeth",
        ),
    )
    spider_n = _optional_int(
        physics_values,
        ("spider_count", "diff_pinion_count", "bevel_pinion_count"),
    )
    return spider_z, side_z, spider_n


def inputs_from_sections(
    quantities: Mapping[str, Any],
    concentric: Mapping[str, Any],
    physics_values: Mapping[str, Any] | None = None,
) -> TwinInputs:
    """Build controlled case inputs from selectively read twin sections.

    INTENT: Bevel strength must use the twin's mini-diff nest OD and duty —
    never a generic catalogue differential. Missing tooth counts fall back to
    documented packaging seeds and are labelled in the artefact.
    """

    physics_values = physics_values or {}
    max_rpm = _number(
        quantities,
        ("max_rotor_speed_rpm", "mgu_base_speed_rpm"),
        default=19_500.0,
    )
    continuous_kw = _number(
        quantities,
        ("continuous_power_kw", "continuous_design_duty_kw"),
        default=250.0,
    )
    gear_ratio = _number(quantities, ("gear_ratio",), default=DEFAULT_GEAR_RATIO)
    diff_od_mm = _number(
        concentric,
        ("diff_od_mm",),
        default=_number(quantities, ("fpk_diff_od_mm",), default=19.2),
    )
    gear_face_mm = _number(
        concentric,
        ("gear_face_mm",),
        default=_number(
            quantities,
            ("fpk_gear_face_mm", "gear_face_mm"),
            default=14.0,
        ),
    )
    # Length: concentric diff_len when stamped; else principal-box L; else ≈ OD.
    principal = concentric.get("principal_boxes")
    box_len: float | None = None
    if isinstance(principal, Mapping):
        for key in ("mini_diff_in_rotor", "open_bevel_differential"):
            box_len = _parse_box_len_mm(principal.get(key))
            if box_len is not None:
                break
    diff_len_mm = _number(
        concentric,
        ("diff_len_mm",),
        default=_number(
            quantities,
            ("fpk_diff_len_mm",),
            default=box_len if box_len is not None else diff_od_mm,
        ),
    )

    phys_spider_z, phys_side_z, phys_spider_n = _tooth_seeds_from_physics_tree(
        physics_values
    )
    qty_spider_z = _optional_int(
        quantities,
        (
            "spider_pinion_teeth",
            "diff_pinion_teeth",
            "bevel_pinion_teeth",
            "fpk_spider_pinion_teeth",
        ),
    )
    qty_side_z = _optional_int(
        quantities,
        (
            "side_gear_teeth",
            "diff_side_gear_teeth",
            "bevel_side_gear_teeth",
            "fpk_side_gear_teeth",
        ),
    )
    qty_spider_n = _optional_int(
        quantities,
        ("spider_count", "diff_pinion_count", "fpk_spider_count"),
    )

    spider_z = phys_spider_z or qty_spider_z
    side_z = phys_side_z or qty_side_z
    spider_n = phys_spider_n or qty_spider_n
    from_twin = spider_z is not None and side_z is not None
    if spider_z is None:
        spider_z = DEFAULT_SPIDER_PINION_TEETH
    if side_z is None:
        side_z = DEFAULT_SIDE_GEAR_TEETH
    if spider_n is None:
        spider_n = DEFAULT_SPIDER_COUNT

    if from_twin:
        tooth_basis = "twin quantities / physics-tree tooth seeds"
    else:
        tooth_basis = PACKAGING_SEED_LABEL

    # Face: explicit bevel face → else ~0.30·cone proxy capped by nest length.
    side_pitch = SIDE_PITCH_FRACTION_OF_DIFF_OD * diff_od_mm
    pinion_pitch = PINION_PITCH_FRACTION_OF_DIFF_OD * diff_od_mm
    cone_mm = 0.5 * math.sqrt(side_pitch**2 + pinion_pitch**2)
    default_face = max(3.0, min(0.30 * cone_mm, diff_len_mm * 0.55, gear_face_mm * 0.35))
    bevel_face = _number(
        quantities,
        ("bevel_face_width_mm", "fpk_bevel_face_mm", "diff_gear_face_mm"),
        default=_number(concentric, ("bevel_face_mm",), default=default_face),
    )

    return TwinInputs(
        max_rotor_speed_rpm=max_rpm,
        continuous_electrical_power_kw=continuous_kw,
        front_regen_electrical_cap_kw=_number(
            quantities,
            (
                "front_regen_electrical_cap_kw",
                "front_regen_power_limit_kw",
                "front_regen_power_kw",
            ),
            default=250.0,
        ),
        gear_ratio=gear_ratio,
        diff_od_mm=diff_od_mm,
        diff_len_mm=diff_len_mm,
        gear_face_mm=gear_face_mm,
        spider_pinion_teeth=int(spider_z),
        side_gear_teeth=int(side_z),
        spider_count=int(spider_n),
        bevel_face_width_mm=bevel_face,
        motor_shaft_torque_nm=_optional_number(
            quantities,
            ("mgu_shaft_torque_nm", "envelope_mgu_torque_nm"),
        ),
        tooth_counts_from_twin=from_twin,
        tooth_count_basis=tooth_basis,
    )


def _read_section(state_path: Path, prefix: str) -> Mapping[str, Any]:
    """Read one JSON subtree without materialising the large twin state."""

    with state_path.open("rb") as handle:
        section = next(ijson.items(handle, prefix), None)
    return section if isinstance(section, Mapping) else {}


def _collect_physics_tooth_values(state_path: Path) -> dict[str, Any]:
    """Scan physics-tree part_index / tree leaves for bevel tooth seeds.

    INTENT: Prefer twin physics seeds when present; stay silent (empty) when
    the tree only carries torque formulas without teeth — packaging seeds then
    apply and are labelled.
    """

    collected: dict[str, Any] = {}
    part_index = _read_section(state_path, "fpkPhysicsTree.part_index")
    candidates: list[Mapping[str, Any]] = []
    if isinstance(part_index, Mapping):
        for key, node in part_index.items():
            key_l = str(key).lower()
            if any(
                token in key_l
                for token in (
                    "spider",
                    "side_gear",
                    "diff_pinion",
                    "bevel",
                    "mini_diff",
                )
            ) and isinstance(node, Mapping):
                candidates.append(node)
    for node in candidates:
        values = node.get("values")
        if isinstance(values, Mapping):
            for key, raw in values.items():
                if any(
                    token in str(key).lower()
                    for token in ("teeth", "tooth", "spider_count", "pinion_count")
                ):
                    collected[str(key)] = raw
        for key in (
            "spider_pinion_teeth",
            "side_gear_teeth",
            "bevel_pinion_teeth",
            "spider_count",
        ):
            if key in node:
                collected[key] = node[key]
    return collected


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
        raise FiaFrontKitBevelError(f"Twin state not found: {state_path}")

    last_error = "Twin state changed during selective-read attempts"
    for attempt in range(5):
        before = state_path.stat()
        quantities = dict(_read_section(state_path, "orchestratorContract.quantities"))
        if not quantities:
            quantities = dict(
                _read_section(state_path, "engineeringContract.quantities")
            )
        concentric = dict(_read_section(state_path, "fpkConcentricGeometry"))
        physics_values = _collect_physics_tooth_values(state_path)
        source_hash = _stream_sha256(state_path)
        after = state_path.stat()
        if (
            before.st_size == after.st_size
            and before.st_mtime_ns == after.st_mtime_ns
        ):
            return (
                inputs_from_sections(quantities, concentric, physics_values),
                source_hash,
            )
        last_error = (
            f"Twin state changed during selective-read attempt {attempt + 1}/5 "
            f"(size {before.st_size}->{after.st_size})"
        )
        time.sleep(0.25 * (attempt + 1))
    raise FiaFrontKitBevelError(f"{last_error}; rerun on a stable stamp")


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the selected quantities that control this case."""

    payload = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def derive_motor_shaft_torque_nm(inputs: TwinInputs) -> float:
    """Shaft torque for continuous electrical duty at max rotor speed.

    INTENT: Same continuous-duty derivation as iso6336_fia_front_kit_case
    (~125 N·m at 250 kW / 19,500 rpm). Carrier torque is then T × gear_ratio.
    """

    omega = inputs.max_rotor_speed_rpm * 2.0 * math.pi / 60.0
    if omega <= 0.0:
        raise FiaFrontKitBevelError("max_rotor_speed_rpm must be positive")
    return (
        inputs.continuous_electrical_power_kw
        * 1000.0
        / (ASSUMED_COMBINED_EFFICIENCY * omega)
    )


def derive_bevel_geometry(inputs: TwinInputs) -> BevelGeometry:
    """Resolve straight-bevel pitch / module / face from nest + tooth seeds."""

    if inputs.spider_pinion_teeth < 8 or inputs.side_gear_teeth < 10:
        raise FiaFrontKitBevelError("Bevel tooth counts below screening minima")
    if inputs.spider_count < 2:
        raise FiaFrontKitBevelError("spider_count must be at least 2")

    d_side = SIDE_PITCH_FRACTION_OF_DIFF_OD * inputs.diff_od_mm
    d_pinion = PINION_PITCH_FRACTION_OF_DIFF_OD * inputs.diff_od_mm
    # Outer module from side gear pitch (controlling wheel for packaging nest).
    m_outer = d_side / float(inputs.side_gear_teeth)
    # Re-derive pinion pitch from same module so mesh is conjugate on seeds.
    d_pinion = m_outer * float(inputs.spider_pinion_teeth)
    cone = 0.5 * math.sqrt(d_side**2 + d_pinion**2)
    face = min(inputs.bevel_face_width_mm, 0.30 * cone, inputs.diff_len_mm * 0.90)
    if face <= 0.0 or cone <= 0.0:
        raise FiaFrontKitBevelError("Non-positive bevel face or cone distance")
    mean_factor = max(0.55, (cone - 0.5 * face) / cone)
    m_mean = m_outer * mean_factor
    return BevelGeometry(
        diff_od_mm=round(inputs.diff_od_mm, 4),
        diff_len_mm=round(inputs.diff_len_mm, 4),
        spider_pinion_teeth=inputs.spider_pinion_teeth,
        side_gear_teeth=inputs.side_gear_teeth,
        spider_count=inputs.spider_count,
        pinion_pitch_diameter_mm=round(d_pinion, 4),
        side_pitch_diameter_mm=round(d_side, 4),
        outer_module_mm=round(m_outer, 5),
        mean_module_mm=round(m_mean, 5),
        face_width_mm=round(face, 4),
        cone_distance_mm=round(cone, 4),
        pressure_angle_deg=PRESSURE_ANGLE_DEG,
        shaft_angle_deg=90.0,
        ratio_u=round(inputs.side_gear_teeth / inputs.spider_pinion_teeth, 6),
        tooth_counts_from_twin=inputs.tooth_counts_from_twin,
        tooth_count_basis=inputs.tooth_count_basis,
    )


def _tooth_form_factor_yf(teeth: int) -> float:
    """Approximate tooth form factor YF for αn=20° (virtual spur screen)."""

    z = max(12.0, float(teeth))
    return 2.15 + 0.55 * math.sqrt(17.0 / z)


def _dynamic_factor_kv(pitch_line_velocity_m_s: float) -> float:
    """Simple AGMA-style dynamic factor seed for screening."""

    v = max(0.0, pitch_line_velocity_m_s)
    return 1.0 + v / 80.0


def run_strength_screen(
    inputs: TwinInputs,
    geometry: BevelGeometry,
    *,
    motor_shaft_torque_nm: float,
) -> StrengthScreen:
    """Compute spider–side bevel screening stresses and FoS.

    INTENT: Carrier sees ≈ T_motor·i. Open equal-split: each side gear ≈ T/2.
    Mesh force at side mean pitch is shared across spider pinions. Screen the
    spider pinion (smaller Z) for bending and contact — usually critical.
    """

    if motor_shaft_torque_nm <= 0.0:
        raise FiaFrontKitBevelError("motor_shaft_torque_nm must be positive")

    carrier_nm = motor_shaft_torque_nm * inputs.gear_ratio
    side_nm = carrier_nm / 2.0
    mean_factor = geometry.mean_module_mm / geometry.outer_module_mm
    d_side_mean = geometry.side_pitch_diameter_mm * mean_factor
    d_pinion_mean = geometry.pinion_pitch_diameter_mm * mean_factor
    r_side_m = d_side_mean / 2000.0
    if r_side_m <= 0.0:
        raise FiaFrontKitBevelError("side mean pitch radius must be positive")

    ft_total = side_nm / r_side_m
    ft_mesh = ft_total / float(geometry.spider_count)

    omega_carrier = (
        inputs.max_rotor_speed_rpm / inputs.gear_ratio * 2.0 * math.pi / 60.0
    )
    v = abs(omega_carrier) * (d_side_mean / 2000.0)
    kv = _dynamic_factor_kv(v)
    yf = _tooth_form_factor_yf(geometry.spider_pinion_teeth)
    b = geometry.face_width_mm
    mn = geometry.mean_module_mm
    # Virtual-spur bending with straight-bevel form knockdown.
    sigma_f = (
        (ft_mesh * APPLICATION_FACTOR_KA * kv / (b * mn)) * yf / Y_BEVEL_FORM
    )
    u = geometry.ratio_u
    ratio_term = (u + 1.0) / u
    sigma_h0 = ZH_SPUR_20DEG * ZE_STEEL_SQRT_MPA * math.sqrt(
        (ft_mesh / (d_pinion_mean * b)) * ratio_term
    )
    sigma_h = sigma_h0 * math.sqrt(APPLICATION_FACTOR_KA * kv) * K_BEVEL_CONTACT

    fos_f = SIGMA_F_ALLOW_MPA / sigma_f if sigma_f > 0.0 else float("inf")
    fos_h = SIGMA_H_ALLOW_MPA / sigma_h if sigma_h > 0.0 else float("inf")
    mesh = MeshScreen(
        mesh_name="spider_side_bevel",
        pinion_teeth=geometry.spider_pinion_teeth,
        wheel_teeth=geometry.side_gear_teeth,
        pinion_mean_pitch_diameter_mm=round(d_pinion_mean, 4),
        wheel_mean_pitch_diameter_mm=round(d_side_mean, 4),
        tangential_force_n=round(ft_mesh, 3),
        pitch_line_velocity_m_s=round(v, 4),
        dynamic_factor_kv=round(kv, 4),
        tooth_form_factor_yf=round(yf, 4),
        bending_stress_mpa=round(sigma_f, 3),
        contact_stress_mpa=round(sigma_h, 3),
        bending_fos=round(fos_f, 4),
        contact_fos=round(fos_h, 4),
        bending_ok=fos_f >= SCREEN_FOS_MIN,
        contact_ok=fos_h >= SCREEN_FOS_MIN,
    )
    min_fos = min(fos_f, fos_h)
    works = bool(min_fos >= SCREEN_FOS_MIN)
    return StrengthScreen(
        motor_shaft_torque_nm=round(motor_shaft_torque_nm, 6),
        carrier_input_torque_nm=round(carrier_nm, 6),
        side_gear_torque_nm=round(side_nm, 6),
        meshes=(mesh,),
        minimum_bending_fos=round(fos_f, 4),
        minimum_contact_fos=round(fos_h, 4),
        minimum_strength_factor=round(min_fos, 4),
        works_in_kit_context=works,
        screen_fos_required=SCREEN_FOS_MIN,
    )


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: BevelGeometry,
    screen: StrengthScreen,
    source_state_sha256: str,
    source_twin: str,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release bevel-strength artefact."""

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "bevel_geometry": asdict(geometry),
        "duty_torques": {
            "motor_shaft_torque_nm": screen.motor_shaft_torque_nm,
            "carrier_input_torque_nm": screen.carrier_input_torque_nm,
            "side_gear_torque_nm": screen.side_gear_torque_nm,
            "assumed_combined_efficiency": ASSUMED_COMBINED_EFFICIENCY,
            "torque_basis": (
                "shaft ≈ P_elec/(η_combined·ω) at max_rotor_speed_rpm "
                "(~125 N·m for 250 kW / 19,500 rpm); carrier ≈ T·gear_ratio "
                "(~1001 N·m at ratio 8); open equal-split side ≈ carrier/2"
            ),
        },
        "strength_screen": {
            "method": "straight_bevel_handbook_screening_not_iso23509",
            "meshes": [asdict(m) for m in screen.meshes],
            "minimum_bending_fos": screen.minimum_bending_fos,
            "minimum_contact_fos": screen.minimum_contact_fos,
            "minimum_strength_factor": screen.minimum_strength_factor,
            "screen_fos_required": screen.screen_fos_required,
            "application_factor_ka": APPLICATION_FACTOR_KA,
            "y_bevel_form": Y_BEVEL_FORM,
            "k_bevel_contact": K_BEVEL_CONTACT,
            "allowables": {
                "sigma_f_allow_mpa": SIGMA_F_ALLOW_MPA,
                "sigma_h_allow_mpa": SIGMA_H_ALLOW_MPA,
                "sigma_f_basis": SIGMA_F_ALLOW_BASIS,
                "sigma_h_basis": SIGMA_H_ALLOW_BASIS,
            },
        },
        "works_in_kit_context": {
            "duty_strength_screen_ok": screen.works_in_kit_context,
            "minimum_strength_factor": screen.minimum_strength_factor,
            "threshold_fos": SCREEN_FOS_MIN,
            "note": (
                f"duty_strength_screen_ok means min(bending, contact) FoS ≥ "
                f"{SCREEN_FOS_MIN} on the spider–side bevel mesh with assumed "
                "case-hardened allowables — NOT ISO 23509, NOT KISSsoft, "
                "NOT spectrum, NOT ship_ok."
            ),
        },
        "margins": {
            "minimum_bending_fos": screen.minimum_bending_fos,
            "minimum_contact_fos": screen.minimum_contact_fos,
            "minimum_strength_factor": screen.minimum_strength_factor,
            "required_screen_fos": SCREEN_FOS_MIN,
            "note": (
                "Screening FoS only — simplified straight-bevel handbook "
                "factors on packaging nest; no hypoid, no spiral, no "
                "ISO 23509 cone close, no contact pattern."
            ),
        },
        "model_assumptions": [
            "Open straight-bevel differential, 90° shaft angle, equal torque split.",
            f"Pressure angle {PRESSURE_ANGLE_DEG}°, KA={APPLICATION_FACTOR_KA}, "
            "KV=1+v/80 (screening).",
            f"Y_bevel={Y_BEVEL_FORM}, K_bevel_contact={K_BEVEL_CONTACT} "
            "(handbook knockdowns — not ISO 23509 Method B).",
            f"σF_allow={SIGMA_F_ALLOW_MPA} MPa, σH_allow={SIGMA_H_ALLOW_MPA} MPa "
            "(case-hardened MQ handbook seeds).",
            f"Tooth counts: {geometry.tooth_count_basis}.",
            "Pitch diameters from fractions of twin diff_od "
            f"(side {SIDE_PITCH_FRACTION_OF_DIFF_OD:.2f}×OD, "
            f"pinion from conjugate module).",
            "Ideal spider load share (Kγ=1) — real bias / cross-pin OPEN.",
        ],
        "geometry_provenance": {
            "controlling_dimensions": (
                "fpkConcentricGeometry.diff_od_mm (+ principal-box length) "
                "and twin gear_ratio / duty; tooth counts per tooth_count_basis"
            ),
            "cad_family": "compact_bevel_differential",
            "authority_level": "communication_only",
            "iso23509_used": False,
            "kisssoft_used": False,
            "calculix_tooth_contact_used": False,
            "statement": (
                "Twin-bound analytical straight-bevel handbook screen on "
                "compact_bevel_differential packaging nest; not ISO 23509 / "
                "KISSsoft closure."
            ),
        },
        "fia_question": (
            f"Does the mini bevel differential transmit carrier torque for "
            f"{inputs.continuous_electrical_power_kw:.0f} kW / ratio "
            f"{inputs.gear_ratio:.1f} (~{screen.carrier_input_torque_nm:.0f} N·m) "
            "without tooth failure?"
        ),
        "iso23509_independent_check": {
            "status": "OPEN",
            "reason": (
                "This case is a simplified bending/contact handbook screen — "
                "not a full ISO 23509 bevel geometry / rating close."
            ),
        },
        "kisssoft_independent_check": {
            "status": "OPEN",
            "reason": "No KISSsoft licence proven in this repository checkout.",
        },
        "load_spectrum_fatigue": {
            "status": "OPEN",
            "statement": (
                "Race accel/brake/corner torque spectrum, wheel-speed "
                "difference and Miner damage sum are not closed; continuous-"
                "duty equal-split screening only."
            ),
        },
        "calculix_tooth_contact": {
            "status": "OPEN",
            "statement": "3D bevel tooth contact / carrier deflection FEA not run.",
        },
        "release_statement": (
            "Concept evidence only. No FIA homologation, team interface closure, "
            "race evidence or permission to ship. Never claim PASS without "
            "ISO 23509 / KISSsoft / spectrum / FEA closure on the current revision."
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
        "gear_ratio": {"value": 8.0, "unit": "ratio"},
        "fpk_diff_od_mm": {"value": 19.2, "unit": "mm"},
        "fpk_gear_face_mm": {"value": 58.0, "unit": "mm"},
    }
    concentric = {
        "diff_od_mm": 19.2,
        "gear_face_mm": 58.0,
        "principal_boxes": {
            "mini_diff_in_rotor": "19x19x19 mm",
            "open_bevel_differential": "19x19x19 mm",
        },
    }
    return quantities, concentric


def run_selftest() -> int:
    """Prove twin binding, stress physics, packaging-seed honesty, release honesty."""

    quantities, concentric = _synthetic_sections()
    inputs = inputs_from_sections(quantities, concentric, {})
    geometry = derive_bevel_geometry(inputs)
    torque = derive_motor_shaft_torque_nm(inputs)
    screen = run_strength_screen(inputs, geometry, motor_shaft_torque_nm=torque)
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        screen=screen,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
    )

    # proveCatch: 10× torque must collapse FoS — canned margins cannot pass both.
    hot = run_strength_screen(
        inputs,
        geometry,
        motor_shaft_torque_nm=torque * 10.0,
    )

    # Larger nest must raise FoS (geometry controls stress — not a constant).
    big_inputs = TwinInputs(
        **{
            **asdict(inputs),
            "diff_od_mm": 80.0,
            "diff_len_mm": 40.0,
            "bevel_face_width_mm": 12.0,
        }
    )
    big_geometry = derive_bevel_geometry(big_inputs)
    big_screen = run_strength_screen(
        big_inputs, big_geometry, motor_shaft_torque_nm=torque
    )

    checks = {
        "packaging_tooth_seeds_labelled": (
            inputs.tooth_counts_from_twin is False
            and "packaging seed" in inputs.tooth_count_basis.lower()
            and inputs.spider_pinion_teeth == DEFAULT_SPIDER_PINION_TEETH
            and inputs.side_gear_teeth == DEFAULT_SIDE_GEAR_TEETH
        ),
        "diff_od_controls_geometry": abs(geometry.diff_od_mm - 19.2) < 1.0e-9,
        "diff_len_from_principal_box": abs(inputs.diff_len_mm - 19.0) < 1.0e-9,
        "motor_torque_near_125nm": 120.0 <= torque <= 130.0,
        "carrier_torque_near_1001nm": 990.0 <= screen.carrier_input_torque_nm <= 1015.0,
        "stresses_finite_and_positive": all(
            math.isfinite(m.bending_stress_mpa)
            and m.bending_stress_mpa > 0.0
            and math.isfinite(m.contact_stress_mpa)
            and m.contact_stress_mpa > 0.0
            for m in screen.meshes
        ),
        "torque_scaling_proves_catch": (
            hot.minimum_strength_factor < 0.15 * screen.minimum_strength_factor
        ),
        "geometry_scaling_moves_fos": (
            big_screen.minimum_strength_factor > 2.0 * screen.minimum_strength_factor
        ),
        "packaging_seed_fails_duty_screen": screen.works_in_kit_context is False,
        "method_documents_not_iso23509": (
            "not_iso23509" in artifact["strength_screen"]["method"]
            and artifact["iso23509_independent_check"]["status"] == "OPEN"
        ),
        "allowables_documented": (
            artifact["strength_screen"]["allowables"]["sigma_f_allow_mpa"]
            == SIGMA_F_ALLOW_MPA
            and artifact["strength_screen"]["allowables"]["sigma_h_allow_mpa"]
            == SIGMA_H_ALLOW_MPA
        ),
        "release_honesty": (
            artifact["status"] == "PARTIAL"
            and artifact["ship_ok"] is False
            and artifact["kisssoft_independent_check"]["status"] == "OPEN"
            and artifact["load_spectrum_fatigue"]["status"] == "OPEN"
            and artifact["calculix_tooth_contact"]["status"] == "OPEN"
        ),
        "never_ship_ok_true": artifact["ship_ok"] is False,
        "never_status_pass": artifact["status"] != "PASS",
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "geometry": asdict(geometry),
                "motor_shaft_torque_nm": torque,
                "carrier_input_torque_nm": screen.carrier_input_torque_nm,
                "minimum_strength_factor": screen.minimum_strength_factor,
                "minimum_bending_fos": screen.minimum_bending_fos,
                "minimum_contact_fos": screen.minimum_contact_fos,
                "works_in_kit_context": screen.works_in_kit_context,
                "hot_torque_minimum_fos": hot.minimum_strength_factor,
                "larger_nest_minimum_fos": big_screen.minimum_strength_factor,
                "ship_ok": artifact["ship_ok"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist one straight-bevel handbook screen against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    geometry = derive_bevel_geometry(inputs)
    torque = derive_motor_shaft_torque_nm(inputs)
    screen = run_strength_screen(
        inputs, geometry, motor_shaft_torque_nm=torque
    )
    if not (
        math.isfinite(screen.minimum_strength_factor)
        and screen.minimum_strength_factor > 0.0
    ):
        raise FiaFrontKitBevelError("Strength screen returned non-finite FoS")

    try:
        twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
    except ValueError:
        twin_label = str(twin_dir.resolve())
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        screen=screen,
        source_state_sha256=state_hash,
        source_twin=twin_label,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / "iso_bevel_fia_front_kit_case.json"
    )
    _atomic_write_json(destination, artifact)
    works_word = "clears" if screen.works_in_kit_context else "does NOT clear"
    print(
        "FIA front-kit straight-bevel differential screen: "
        f"T_motor ≈ {screen.motor_shaft_torque_nm:.1f} N·m → "
        f"T_carrier ≈ {screen.carrier_input_torque_nm:.1f} N·m at ratio "
        f"{inputs.gear_ratio:.2f} (side ≈ {screen.side_gear_torque_nm:.1f} N·m). "
        f"Diff OD {geometry.diff_od_mm:.1f} mm, face {geometry.face_width_mm:.2f} mm, "
        f"Z_pinion/Z_side={geometry.spider_pinion_teeth}/{geometry.side_gear_teeth}, "
        f"{geometry.spider_count} spiders, m_mean={geometry.mean_module_mm:.3f} mm. "
        f"Min bending FoS ≈ {screen.minimum_bending_fos:.4f}, "
        f"min contact FoS ≈ {screen.minimum_contact_fos:.4f} "
        f"(need ≥ {SCREEN_FOS_MIN:.2f}). "
        f"Duty screen {works_word} kit context. "
        f"Tooth basis: {geometry.tooth_count_basis}. "
        "ISO 23509 / KISSsoft / spectrum / tooth-contact FEA remain OPEN; "
        "ship_ok is false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description=(
            "Solve the FIA-bound Formula E front-kit straight-bevel "
            "differential strength screening case (not full ISO 23509)."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic binding plus torque-scaling proveCatch",
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
