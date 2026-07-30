#!/usr/bin/env python3
"""FIA-bound ISO 6336-style gear-strength screen for the Formula E front kit twin.

INTENT: Answer whether the twin's planetary packaging seeds (module, teeth,
face, sun/planet/ring diameters) can carry ~250 kW / ~125 N·m motor-shaft
torque at trial ratio 8 without tooth-root bending or flank contact stressing
assumed case-hardened steel beyond a screening factor of safety.

This is analytical handbook screening — not a KISSsoft licence run, not a
race load-spectrum fatigue sum, and not CalculiX tooth-contact FEA. Status
stays PARTIAL; ``ship_ok`` is always false. Full ISO 6336 Method B factors,
micropitting, scuffing and spectrum remain OPEN.
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
SCHEMA = "forgeos.motor_stack.iso6336_fia_front_kit_case/v1"
# Packaging envelope for strength-driven resize (bay 343×259×267 — ring tip
# must leave room for case wall / oil / differential; face capped vs stack).
MAX_RING_TIP_DIAMETER_MM = 140.0
MAX_FACE_WIDTH_MM = 60.0
MIN_MODULE_MM = 0.70
MAX_MODULE_MM = 2.20
# Hollow-rotor planetary nest: ring tip must stay inside rotor bore.
ROTOR_RING_RADIAL_CLEARANCE_MM = 2.0
BLOCKER_ID_PLANETARY_VS_ROTOR_BORE = "PLANETARY_STRENGTH_VS_ROTOR_BORE"

# Screening allowables for case-hardened low-alloy gear steel (16MnCr5 / 20MnCr5
# class). Numbers are ISO 6336-5 MQ-order handbook seeds — not a certified
# melt / heat-treat certificate for this revision.
# Refs: ISO 6336-5:2016 Tables (σF lim / σH lim for case-hardened MQ);
#       Niemann/Winter & Dudley handbook ranges for case-hardened flanks.
SIGMA_F_ALLOW_MPA = 450.0  # tooth-root bending allowable (screening)
SIGMA_H_ALLOW_MPA = 1500.0  # flank contact / pitting allowable (screening)
SIGMA_F_ALLOW_BASIS = (
    "ISO 6336-5:2016 MQ case-hardened steel σF lim ≈ 430–500 MPa; "
    "screening allowable 450 MPa (16MnCr5/20MnCr5 class)"
)
SIGMA_H_ALLOW_BASIS = (
    "ISO 6336-5:2016 MQ case-hardened steel σH lim ≈ 1500 MPa; "
    "screening allowable 1500 MPa"
)

# Application / dynamic factors for a race-duty screen (not a closed Method B).
APPLICATION_FACTOR_KA = 1.25
# Pressure angle for involute spur screening.
PRESSURE_ANGLE_DEG = 20.0
# Steel–steel elastic coefficient ZE (ISO 6336-2) for E=206 GPa, ν=0.3.
ZE_STEEL_SQRT_MPA = 189.8
# Zone factor ZH for αn=20° spur (ISO 6336-2, β=0).
ZH_SPUR_20DEG = 2.495
# Minimum bending/contact FoS for works_in_kit_context duty screen.
SCREEN_FOS_MIN = 1.20
# Assumed combined machine+inverter efficiency when deriving shaft torque from
# electrical duty (matches EM FIA case order of magnitude → ~125 N·m).
ASSUMED_COMBINED_EFFICIENCY = 0.9777
DEFAULT_FACE_WIDTH_MM = 14.0
DEFAULT_GEAR_RATIO = 8.0


class FiaFrontKitGearError(RuntimeError):
    """Raised when twin binding or gear-strength evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this gear-strength case."""

    max_rotor_speed_rpm: float
    continuous_electrical_power_kw: float
    front_regen_electrical_cap_kw: float
    gear_ratio: float
    sun_od_mm: float
    planet_od_mm: float
    planet_count: int
    ring_id_mm: float
    sun_teeth: int
    planet_teeth: int
    ring_teeth: int
    gear_module_mm: float
    face_width_mm: float
    active_length_mm: float
    motor_shaft_torque_nm: float | None
    rotor_id_mm: float = 0.0


@dataclass(frozen=True)
class GearGeometry:
    """Resolved spur planetary geometry used for the ISO 6336-style screen."""

    module_mm: float
    pressure_angle_deg: float
    face_width_mm: float
    sun_teeth: int
    planet_teeth: int
    ring_teeth: int
    planet_count: int
    sun_pitch_diameter_mm: float
    planet_pitch_diameter_mm: float
    ring_pitch_diameter_mm: float
    ratio_from_teeth: float
    ratio_matches_twin: bool
    assembly_ok: bool


@dataclass(frozen=True)
class MeshScreen:
    """Bending and contact screen for one mesh (sun–planet or planet–ring)."""

    mesh_name: str
    pinion_teeth: int
    wheel_teeth: int
    pinion_pitch_diameter_mm: float
    wheel_pitch_diameter_mm: float
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
    """Aggregate planetary strength screen vs assumed allowables."""

    motor_shaft_torque_nm: float
    carrier_output_torque_nm: float
    ring_reaction_torque_nm: float
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
    raise FiaFrontKitGearError(
        "Missing positive twin quantity; expected one of: " + ", ".join(keys)
    )


def _optional_number(
    values: Mapping[str, Any],
    keys: Sequence[str],
) -> float | None:
    """Return a positive quantity when present, else None."""

    try:
        return _number(values, keys)
    except FiaFrontKitGearError:
        return None


def _int_number(
    values: Mapping[str, Any],
    keys: Sequence[str],
    *,
    default: int | None = None,
) -> int:
    """Read a positive integer twin quantity."""

    value = _number(values, keys, default=float(default) if default is not None else None)
    return int(round(value))


def inputs_from_sections(
    quantities: Mapping[str, Any],
    concentric: Mapping[str, Any],
) -> TwinInputs:
    """Build controlled case inputs from selectively read twin sections.

    INTENT: Gear strength must use the twin's planetary packaging seeds and
    250 kW duty — never a generic catalogue gearbox or visual-only teeth.
    """

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
    active_length_mm = _number(
        concentric,
        ("stack_len_mm",),
        default=_number(
            quantities,
            ("stack_length_mm", "active_length_mm"),
            default=97.58,
        ),
    )
    # DECISION: Face width prefers explicit twin seed; else packaging default
    # 14 mm; else a small fraction of active stack (never the full stack —
    # that would invent an unrealistically wide gear).
    face_width_mm = _number(
        quantities,
        ("fpk_gear_face_mm", "gear_face_mm"),
        default=_number(
            concentric,
            ("gear_face_mm",),
            default=max(
                DEFAULT_FACE_WIDTH_MM,
                min(DEFAULT_FACE_WIDTH_MM * 1.5, active_length_mm * 0.15),
            ),
        ),
    )
    sun_od_mm = _number(
        concentric,
        ("sun_od_mm",),
        default=_number(quantities, ("fpk_sun_od_mm",), default=12.0),
    )
    planet_od_mm = _number(
        concentric,
        ("planet_od_mm",),
        default=_number(quantities, ("fpk_planet_od_mm",), default=38.4),
    )
    ring_id_mm = _number(
        concentric,
        ("ring_id_mm",),
        default=_number(quantities, ("fpk_ring_id_mm",), default=88.7),
    )
    if "planet_count" in concentric:
        planet_count = int(round(float(concentric["planet_count"])))
    else:
        planet_count = _int_number(
            quantities, ("fpk_planet_count", "planet_count"), default=3
        )

    sun_teeth = _int_number(quantities, ("sun_teeth",), default=18)
    planet_teeth = _int_number(quantities, ("planet_teeth",), default=54)
    ring_teeth = _int_number(quantities, ("ring_teeth",), default=126)
    gear_module_mm = _number(
        quantities,
        ("gear_module_mm",),
        default=ring_id_mm / max(ring_teeth, 1),
    )
    motor_shaft_torque_nm = _optional_number(
        quantities,
        ("mgu_shaft_torque_nm", "envelope_mgu_torque_nm"),
    )
    rotor_id_mm = _number(
        concentric,
        ("rotor_id_mm",),
        default=_number(quantities, ("fpk_rotor_id_mm", "rotor_id_mm"), default=0.0),
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
        sun_od_mm=sun_od_mm,
        planet_od_mm=planet_od_mm,
        planet_count=planet_count,
        ring_id_mm=ring_id_mm,
        sun_teeth=sun_teeth,
        planet_teeth=planet_teeth,
        ring_teeth=ring_teeth,
        gear_module_mm=gear_module_mm,
        face_width_mm=face_width_mm,
        active_length_mm=active_length_mm,
        motor_shaft_torque_nm=motor_shaft_torque_nm,
        rotor_id_mm=rotor_id_mm,
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


def _max_ring_tip_for_rotor_mm(rotor_id_mm: float) -> float:
    """Ring tip diameter that still nests inside the hollow rotor bore."""

    if rotor_id_mm <= 0.0:
        return MAX_RING_TIP_DIAMETER_MM
    return min(
        MAX_RING_TIP_DIAMETER_MM,
        max(0.0, rotor_id_mm - ROTOR_RING_RADIAL_CLEARANCE_MM),
    )


def _apply_gear_geometry_writeback(
    twin_dir: Path,
    quantities: dict[str, Any],
    concentric: dict[str, Any],
) -> None:
    """Overlay strength-driven gear dims when gear_geometry_writeback.json exists.

    INTENT: After the packaging seed failed FoS, the writeback sidecar (and
    patched state quantities) is the controlling packaging seed for re-runs so
    we do not keep rediscovering the same undersized m/face every time.

    GOTCHA: Ignore writebacks whose ring tip cannot fit the rotor bore — the
    2026-07-30 m=1 / ring=126 resize cleared FoS but violated nest_fits_rotor.
    """

    side = twin_dir / "_motor_stack" / "gear_geometry_writeback.json"
    if not side.is_file():
        return
    try:
        payload = json.loads(side.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    rotor_id = _number(
        concentric,
        ("rotor_id_mm",),
        default=_number(quantities, ("fpk_rotor_id_mm", "rotor_id_mm"), default=0.0),
    )
    fpk = payload.get("fpkConcentricGeometry") or {}
    ring_id = float(fpk.get("ring_id_mm") or 0.0)
    module = None
    qty = payload.get("quantities") or {}
    if isinstance(qty.get("gear_module_mm"), Mapping):
        module = qty["gear_module_mm"].get("value")
    ring_teeth = 126
    if isinstance(qty.get("ring_teeth"), Mapping) and qty["ring_teeth"].get("value"):
        ring_teeth = int(qty["ring_teeth"]["value"])
    tip = (
        _ring_tip_diameter_mm(float(module), ring_teeth)
        if module is not None
        else ring_id
    )
    max_tip = _max_ring_tip_for_rotor_mm(rotor_id)
    if rotor_id > 0.0 and tip > max_tip + 1.0e-6:
        # Invalid strength resize — do not re-apply over the packaging seed.
        return
    for key, entry in qty.items():
        if isinstance(entry, Mapping) and entry.get("value") is not None:
            quantities[key] = dict(entry)
    for key, value in fpk.items():
        concentric[key] = value


def load_twin_inputs(state_path: Path) -> tuple[TwinInputs, str]:
    """Selectively read a stable twin snapshot and return its file hash."""

    if not state_path.is_file():
        raise FiaFrontKitGearError(f"Twin state not found: {state_path}")

    last_error = "Twin state changed during selective-read attempts"
    twin_dir = state_path.parent
    for attempt in range(5):
        before = state_path.stat()
        quantities = dict(_read_section(state_path, "orchestratorContract.quantities"))
        if not quantities:
            quantities = dict(
                _read_section(state_path, "engineeringContract.quantities")
            )
        concentric = dict(_read_section(state_path, "fpkConcentricGeometry"))
        _apply_gear_geometry_writeback(twin_dir, quantities, concentric)
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
    raise FiaFrontKitGearError(f"{last_error}; rerun on a stable stamp")


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
    """Shaft torque for the continuous electrical duty at max rotor speed.

    INTENT: Gears see mechanical shaft torque. For regen at the FIA electrical
    cap, shaft power ≈ electrical / η_combined → ~125 N·m at 19,500 rpm /
    250 kW (same order as the EM FIA analytical duty check).
    """

    omega = inputs.max_rotor_speed_rpm * 2.0 * math.pi / 60.0
    if omega <= 0.0:
        raise FiaFrontKitGearError("max_rotor_speed_rpm must be positive")
    # DECISION: Always screen at continuous electrical duty / η / ω (~125 N·m).
    # Twin mgu_shaft_torque_nm may be a different operating seed and must not
    # quietly under-screen the 250 kW FIA case (recorded separately in inputs).
    return (
        inputs.continuous_electrical_power_kw
        * 1000.0
        / (ASSUMED_COMBINED_EFFICIENCY * omega)
    )


def derive_gear_geometry(inputs: TwinInputs) -> GearGeometry:
    """Resolve module / pitch diameters from twin teeth and packaging seeds."""

    module_mm = inputs.gear_module_mm
    sun_z = inputs.sun_teeth
    planet_z = inputs.planet_teeth
    ring_z = inputs.ring_teeth
    if sun_z < 6 or planet_z < 6 or ring_z < 12:
        raise FiaFrontKitGearError("Tooth counts are below screening minima")
    if inputs.planet_count < 2:
        raise FiaFrontKitGearError("planet_count must be at least 2")

    sun_pitch = module_mm * sun_z
    planet_pitch = module_mm * planet_z
    ring_pitch = module_mm * ring_z
    # Fixed-ring carrier-out ratio: i = 1 + R/S
    ratio_teeth = 1.0 + (ring_z / sun_z)
    ratio_ok = abs(ratio_teeth - inputs.gear_ratio) / inputs.gear_ratio <= 0.05
    assembly_ok = (
        (sun_z + planet_z) % inputs.planet_count == 0
        and abs((ring_z - sun_z) / 2.0 - planet_z) <= 1.0
    )
    return GearGeometry(
        module_mm=module_mm,
        pressure_angle_deg=PRESSURE_ANGLE_DEG,
        face_width_mm=inputs.face_width_mm,
        sun_teeth=sun_z,
        planet_teeth=planet_z,
        ring_teeth=ring_z,
        planet_count=inputs.planet_count,
        sun_pitch_diameter_mm=round(sun_pitch, 4),
        planet_pitch_diameter_mm=round(planet_pitch, 4),
        ring_pitch_diameter_mm=round(ring_pitch, 4),
        ratio_from_teeth=round(ratio_teeth, 6),
        ratio_matches_twin=ratio_ok,
        assembly_ok=assembly_ok,
    )


def _tooth_form_factor_yf(teeth: int) -> float:
    """Approximate ISO 6336 / DIN 3990 tooth form factor YF for αn=20° spur.

    Screening curve fitted to handbook YF values (z≈12–100). Not a full
    Method B form-factor table with undercut / profile shift.
    """

    z = max(12.0, float(teeth))
    return 2.15 + 0.55 * math.sqrt(17.0 / z)


def _dynamic_factor_kv(pitch_line_velocity_m_s: float) -> float:
    """Simple AGMA-style dynamic factor seed for screening (not ISO Method B)."""

    v = max(0.0, pitch_line_velocity_m_s)
    # Conservative high-speed screen: KV grows with pitch-line speed.
    return 1.0 + v / 80.0


def _screen_mesh(
    *,
    mesh_name: str,
    pinion_teeth: int,
    wheel_teeth: int,
    pinion_pitch_diameter_mm: float,
    wheel_pitch_diameter_mm: float,
    tangential_force_n: float,
    face_width_mm: float,
    module_mm: float,
    omega_pinion_rad_s: float,
    internal_mesh: bool,
) -> MeshScreen:
    """ISO 6336-style bending + Hertz contact screen for one mesh."""

    b = face_width_mm
    mn = module_mm
    if b <= 0.0 or mn <= 0.0 or tangential_force_n <= 0.0:
        raise FiaFrontKitGearError(f"{mesh_name}: non-positive load or geometry")

    d1 = pinion_pitch_diameter_mm
    u = wheel_teeth / pinion_teeth
    if u <= 0.0:
        raise FiaFrontKitGearError(f"{mesh_name}: invalid gear ratio u")

    v = abs(omega_pinion_rad_s) * (d1 / 2000.0)
    kv = _dynamic_factor_kv(v)
    yf = _tooth_form_factor_yf(pinion_teeth)
    # Simplified ISO 6336-3 nominal root stress with KA·KV screening load:
    # σF ≈ (Ft · KA · KV / (b · mn)) · YF
    sigma_f = (tangential_force_n * APPLICATION_FACTOR_KA * kv / (b * mn)) * yf

    # ISO 6336-2 contact: σH0 = ZH·ZE·√(Ft/(d1·b)·|u±1|/u)
    # External mesh uses (u+1)/u; internal uses (u−1)/u.
    ratio_term = abs(u - 1.0) / u if internal_mesh else (u + 1.0) / u
    sigma_h0 = ZH_SPUR_20DEG * ZE_STEEL_SQRT_MPA * math.sqrt(
        (tangential_force_n / (d1 * b)) * ratio_term
    )
    # Apply KA·KV under the square root (load factors on Ft).
    sigma_h = sigma_h0 * math.sqrt(APPLICATION_FACTOR_KA * kv)

    fos_f = SIGMA_F_ALLOW_MPA / sigma_f if sigma_f > 0.0 else float("inf")
    fos_h = SIGMA_H_ALLOW_MPA / sigma_h if sigma_h > 0.0 else float("inf")
    return MeshScreen(
        mesh_name=mesh_name,
        pinion_teeth=pinion_teeth,
        wheel_teeth=wheel_teeth,
        pinion_pitch_diameter_mm=round(d1, 4),
        wheel_pitch_diameter_mm=round(wheel_pitch_diameter_mm, 4),
        tangential_force_n=round(tangential_force_n, 3),
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


def _ring_tip_diameter_mm(module_mm: float, ring_teeth: int) -> float:
    """Approx tip diameter for packaging screen (addendum ≈ 1.25·m)."""

    return module_mm * (float(ring_teeth) + 2.5)


def propose_strength_feasible_geometry(
    inputs: TwinInputs,
    *,
    motor_shaft_torque_nm: float,
) -> dict[str, Any] | None:
    """Search module / face / planet-count that clears SCREEN_FOS_MIN in bay.

    INTENT: Twin packaging seeds (m≈0.7 mm, face≈14 mm) fail the 250 kW
    screen by ~6× on bending. Fix the *rule* by proposing a strength-feasible
    packaging revision inside the bay — never greenwash the failed seed.

    DECISION: Keep tooth counts (ratio 8) and search module, face width, and
    planet count ∈ {3,4,5}. Prefer the compact volume proxy m·b·ring_tip.

    @description Returns None when no candidate fits envelope + FoS.
    @param inputs Twin packaging / duty seeds
    @param motor_shaft_torque_nm Screen shaft torque (~125 N·m)
    @returns Candidate dict or None
    """

    max_face = min(MAX_FACE_WIDTH_MM, max(inputs.active_length_mm * 0.65, 20.0))
    max_tip = _max_ring_tip_for_rotor_mm(inputs.rotor_id_mm)
    best: dict[str, Any] | None = None
    best_failing: dict[str, Any] | None = None
    m = MIN_MODULE_MM
    while m <= MAX_MODULE_MM + 1.0e-9:
        b = 14.0
        while b <= max_face + 1.0e-9:
            for planet_count in (3, 4, 5):
                if (inputs.sun_teeth + inputs.planet_teeth) % planet_count != 0:
                    continue
                tip = _ring_tip_diameter_mm(m, inputs.ring_teeth)
                if tip > max_tip + 1.0e-9:
                    continue
                trial_inputs = replace(
                    inputs,
                    gear_module_mm=round(m, 3),
                    face_width_mm=round(b, 3),
                    planet_count=planet_count,
                )
                geometry = derive_gear_geometry(trial_inputs)
                if not geometry.assembly_ok or not geometry.ratio_matches_twin:
                    continue
                screen = run_strength_screen(
                    trial_inputs,
                    geometry,
                    motor_shaft_torque_nm=motor_shaft_torque_nm,
                )
                volume_proxy = m * b * tip
                candidate = {
                    "gear_module_mm": round(m, 3),
                    "face_width_mm": round(b, 3),
                    "planet_count": planet_count,
                    "sun_teeth": inputs.sun_teeth,
                    "planet_teeth": inputs.planet_teeth,
                    "ring_teeth": inputs.ring_teeth,
                    "ring_tip_diameter_mm": round(tip, 3),
                    "sun_pitch_diameter_mm": geometry.sun_pitch_diameter_mm,
                    "planet_pitch_diameter_mm": geometry.planet_pitch_diameter_mm,
                    "ring_pitch_diameter_mm": geometry.ring_pitch_diameter_mm,
                    "minimum_bending_fos": screen.minimum_bending_fos,
                    "minimum_contact_fos": screen.minimum_contact_fos,
                    "minimum_strength_factor": screen.minimum_strength_factor,
                    "clears_duty_screen": screen.works_in_kit_context,
                    "volume_proxy_mm3": round(volume_proxy, 1),
                    "rotor_id_mm": inputs.rotor_id_mm,
                    "envelope": {
                        "max_ring_tip_diameter_mm": max_tip,
                        "bay_max_ring_tip_diameter_mm": MAX_RING_TIP_DIAMETER_MM,
                        "max_face_width_mm": max_face,
                        "rotor_bore_limited": inputs.rotor_id_mm > 0.0,
                    },
                }
                if screen.works_in_kit_context:
                    candidate["statement"] = (
                        "Strength-driven packaging resize — clears screening "
                        f"FoS ≥ {SCREEN_FOS_MIN} inside ring-tip ≤ "
                        f"{max_tip:.1f} mm (rotor bore constrained). Not KISSsoft / "
                        "spectrum / FEA; ship_ok stays false."
                    )
                    if (
                        best is None
                        or candidate["volume_proxy_mm3"] < best["volume_proxy_mm3"]
                    ):
                        best = candidate
                else:
                    if (
                        best_failing is None
                        or candidate["minimum_strength_factor"]
                        > best_failing["minimum_strength_factor"]
                    ):
                        best_failing = candidate
            b += 2.0
        m += 0.05
    if best is not None:
        return best
    # Honest residual: strongest nest that fits the rotor still fails FoS.
    if best_failing is not None and inputs.rotor_id_mm > 0.0:
        best_failing["architecture_hold"] = (
            f"{BLOCKER_ID_PLANETARY_VS_ROTOR_BORE} — best nest inside rotor "
            f"ID {inputs.rotor_id_mm:.1f} mm reaches FoS ≈ "
            f"{best_failing['minimum_strength_factor']:.3f} (< {SCREEN_FOS_MIN}); "
            "enlarge rotor bore, change tooth counts/topology, or accept "
            "external planetary; do not claim PASS"
        )
        best_failing["statement"] = best_failing["architecture_hold"]
        best_failing["clears_duty_screen"] = False
    return None if best_failing is None else best_failing


def run_strength_screen(
    inputs: TwinInputs,
    geometry: GearGeometry,
    *,
    motor_shaft_torque_nm: float,
) -> StrengthScreen:
    """Compute sun–planet and planet–ring screening stresses and FoS.

    INTENT: For a fixed-ring planetary, motor torque enters the sun; planets
    share the mesh force; carrier delivers ≈ T·i; ring reacts ≈ T·(i−1).
    The sun–planet mesh is usually critical (small pinion).
    """

    if motor_shaft_torque_nm <= 0.0:
        raise FiaFrontKitGearError("motor_shaft_torque_nm must be positive")

    r_sun_m = geometry.sun_pitch_diameter_mm / 2000.0
    # Total tangential load at sun pitch; shared equally across planets
    # (ideal load sharing — real Kγ stays OPEN).
    ft_total = motor_shaft_torque_nm / r_sun_m
    ft_mesh = ft_total / float(geometry.planet_count)
    omega_sun = inputs.max_rotor_speed_rpm * 2.0 * math.pi / 60.0

    sun_planet = _screen_mesh(
        mesh_name="sun_planet",
        pinion_teeth=geometry.sun_teeth,
        wheel_teeth=geometry.planet_teeth,
        pinion_pitch_diameter_mm=geometry.sun_pitch_diameter_mm,
        wheel_pitch_diameter_mm=geometry.planet_pitch_diameter_mm,
        tangential_force_n=ft_mesh,
        face_width_mm=geometry.face_width_mm,
        module_mm=geometry.module_mm,
        omega_pinion_rad_s=omega_sun,
        internal_mesh=False,
    )
    # Planet–ring: same mesh force magnitude; planet is the pinion for
    # form-factor / contact curvature screening of the planet tooth.
    omega_planet = omega_sun * (
        geometry.sun_teeth / (geometry.sun_teeth + geometry.planet_teeth)
    )
    planet_ring = _screen_mesh(
        mesh_name="planet_ring",
        pinion_teeth=geometry.planet_teeth,
        wheel_teeth=geometry.ring_teeth,
        pinion_pitch_diameter_mm=geometry.planet_pitch_diameter_mm,
        wheel_pitch_diameter_mm=geometry.ring_pitch_diameter_mm,
        tangential_force_n=ft_mesh,
        face_width_mm=geometry.face_width_mm,
        module_mm=geometry.module_mm,
        omega_pinion_rad_s=omega_planet,
        internal_mesh=True,
    )
    meshes = (sun_planet, planet_ring)
    min_bend = min(m.bending_fos for m in meshes)
    min_contact = min(m.contact_fos for m in meshes)
    min_fos = min(min_bend, min_contact)
    works = bool(
        geometry.ratio_matches_twin
        and geometry.assembly_ok
        and min_fos >= SCREEN_FOS_MIN
    )
    return StrengthScreen(
        motor_shaft_torque_nm=round(motor_shaft_torque_nm, 6),
        carrier_output_torque_nm=round(motor_shaft_torque_nm * inputs.gear_ratio, 6),
        ring_reaction_torque_nm=round(
            motor_shaft_torque_nm * (inputs.gear_ratio - 1.0), 6
        ),
        meshes=meshes,
        minimum_bending_fos=round(min_bend, 4),
        minimum_contact_fos=round(min_contact, 4),
        minimum_strength_factor=round(min_fos, 4),
        works_in_kit_context=works,
        screen_fos_required=SCREEN_FOS_MIN,
    )


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: GearGeometry,
    screen: StrengthScreen,
    source_state_sha256: str,
    source_twin: str,
    packaging_seed_screen: StrengthScreen | None = None,
    packaging_seed_geometry: GearGeometry | None = None,
    recommended_geometry: Mapping[str, Any] | None = None,
    controlling_geometry_source: str = "packaging_seed",
    architecture_hold: str | None = None,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release gear-strength artefact."""

    controlling = controlling_geometry_source
    if controlling == "strength_driven_resize":
        provenance_statement = (
            "Controlling geometry is a strength-driven packaging resize that "
            "clears the screening FoS inside the rotor-bore / bay tip envelope. "
            "The failed twin packaging seed is retained under packaging_seed_screen. "
            "Not a licensed KISSsoft run."
        )
        face_note = (
            "Face width / module from strength-driven resize (seed was undersized)."
        )
    elif controlling == "packaging_seed_rotor_bore_hold":
        provenance_statement = (
            "Packaging seed retained: strength-driven nests that clear FoS do not "
            "fit the hollow rotor bore, and bore-limited nests do not clear FoS. "
            "Architecture hold recorded; ship_ok false."
        )
        face_note = "Face width from twin packaging seed (rotor-bore hold active)."
    else:
        provenance_statement = (
            "Twin-bound analytical ISO 6336-style screen on packaging-seed "
            "planetary geometry; not a licensed KISSsoft run."
        )
        face_note = "Face width from twin fpk_gear_face_mm / 14 mm packaging seed."

    hold = architecture_hold or (
        str((recommended_geometry or {}).get("architecture_hold") or "") or None
    )
    tip_mm = _ring_tip_diameter_mm(geometry.module_mm, geometry.ring_teeth)
    nest_fits = (
        inputs.rotor_id_mm <= 0.0
        or tip_mm <= _max_ring_tip_for_rotor_mm(inputs.rotor_id_mm) + 1.0e-6
    )
    # INTENT: Kit-context duty requires FoS AND physical nest fit in the rotor.
    duty_ok = bool(screen.works_in_kit_context) and nest_fits and not hold

    artifact: dict[str, Any] = {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "gear_geometry": asdict(geometry),
        "controlling_geometry_source": controlling,
        "duty_torques": {
            "motor_shaft_torque_nm": screen.motor_shaft_torque_nm,
            "carrier_output_torque_nm": screen.carrier_output_torque_nm,
            "ring_reaction_torque_nm": screen.ring_reaction_torque_nm,
            "assumed_combined_efficiency": ASSUMED_COMBINED_EFFICIENCY,
            "torque_basis": (
                "shaft ≈ P_elec/(η_combined·ω) at max_rotor_speed_rpm "
                "(~125 N·m for 250 kW / 19,500 rpm); twin mgu_shaft_torque_nm "
                "is recorded in input_quantities but does not set the screen load"
            ),
        },
        "strength_screen": {
            "method": "ISO_6336_simplified_screening",
            "meshes": [asdict(m) for m in screen.meshes],
            "minimum_bending_fos": screen.minimum_bending_fos,
            "minimum_contact_fos": screen.minimum_contact_fos,
            "minimum_strength_factor": screen.minimum_strength_factor,
            "screen_fos_required": screen.screen_fos_required,
            "application_factor_ka": APPLICATION_FACTOR_KA,
            "allowables": {
                "sigma_f_allow_mpa": SIGMA_F_ALLOW_MPA,
                "sigma_h_allow_mpa": SIGMA_H_ALLOW_MPA,
                "sigma_f_basis": SIGMA_F_ALLOW_BASIS,
                "sigma_h_basis": SIGMA_H_ALLOW_BASIS,
            },
        },
        "works_in_kit_context": {
            "duty_strength_screen_ok": duty_ok,
            "fos_screen_ok": screen.works_in_kit_context,
            "nest_fits_rotor": nest_fits,
            "minimum_strength_factor": screen.minimum_strength_factor,
            "threshold_fos": SCREEN_FOS_MIN,
            "ratio_matches_twin": geometry.ratio_matches_twin,
            "assembly_ok": geometry.assembly_ok,
            "controlling_geometry_source": controlling,
            "note": (
                f"duty_strength_screen_ok means min(bending, contact) FoS ≥ "
                f"{SCREEN_FOS_MIN} AND nest_fits_rotor, with assumed "
                "case-hardened allowables — NOT KISSsoft, NOT spectrum, "
                "NOT ship_ok."
            ),
        },
        "margins": {
            "minimum_bending_fos": screen.minimum_bending_fos,
            "minimum_contact_fos": screen.minimum_contact_fos,
            "minimum_strength_factor": screen.minimum_strength_factor,
            "required_screen_fos": SCREEN_FOS_MIN,
            "note": (
                "Screening FoS only — simplified ISO 6336 factors, ideal planet "
                "load sharing, no helix/profile-shift/micropitting/scuffing."
            ),
        },
        "model_assumptions": [
            "Spur planetary, fixed ring, sun in / carrier out.",
            f"Pressure angle {PRESSURE_ANGLE_DEG}°, KA={APPLICATION_FACTOR_KA}, "
            "KV=1+v/80 (screening).",
            "Equal mesh-force share across planets (Kγ=1) — real load sharing OPEN.",
            f"σF_allow={SIGMA_F_ALLOW_MPA} MPa, σH_allow={SIGMA_H_ALLOW_MPA} MPa "
            "(case-hardened MQ handbook seeds).",
            "No helix angle, profile shift, tip relief, or crowning.",
            face_note,
            "Differential bevel set not screened here.",
        ],
        "geometry_provenance": {
            "controlling_dimensions": (
                "orchestratorContract teeth/module/ratio + "
                "fpkConcentricGeometry sun/planet/ring diameters"
                if controlling == "packaging_seed"
                else "strength-driven resize of module/face/planet_count "
                "(teeth/ratio frozen from twin)"
            ),
            "cad_family": "planetary_gearset",
            "kisssoft_used": False,
            "calculix_tooth_contact_used": False,
            "statement": provenance_statement,
        },
        "fia_question": (
            f"Does reduction transmit reconciled torque for "
            f"{inputs.continuous_electrical_power_kw:.0f} kW / ratio "
            f"{inputs.gear_ratio:.1f} without tooth failure?"
        ),
        "kisssoft_independent_check": {
            "status": "OPEN",
            "reason": "No KISSsoft licence proven in this repository checkout.",
        },
        "load_spectrum_fatigue": {
            "status": "OPEN",
            "statement": (
                "Race accel/brake/corner torque spectrum and Miner damage sum "
                "are not closed; this case is continuous-duty screening only."
            ),
        },
        "calculix_tooth_contact": {
            "status": "OPEN",
            "statement": "3D tooth contact / carrier deflection FEA not run.",
        },
        "release_statement": (
            "Concept evidence only. No FIA homologation, team interface closure, "
            "race evidence or permission to ship. Never claim PASS without "
            "KISSsoft/spectrum/FEA closure on the current revision."
        ),
    }
    if packaging_seed_screen is not None and packaging_seed_geometry is not None:
        artifact["packaging_seed_screen"] = {
            "gear_geometry": asdict(packaging_seed_geometry),
            "minimum_bending_fos": packaging_seed_screen.minimum_bending_fos,
            "minimum_contact_fos": packaging_seed_screen.minimum_contact_fos,
            "minimum_strength_factor": packaging_seed_screen.minimum_strength_factor,
            "works_in_kit_context": packaging_seed_screen.works_in_kit_context,
            "statement": (
                "As-read twin packaging seed — retained when the controlling "
                "screen uses a strength-driven resize."
            ),
        }
    if recommended_geometry is not None:
        artifact["recommended_geometry"] = dict(recommended_geometry)
    artifact["nest_fits_rotor"] = nest_fits
    if hold:
        artifact["architecture_hold"] = hold
    return artifact


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
        "gear_module_mm": {"value": 0.704, "unit": "mm"},
        "sun_teeth": {"value": 18},
        "planet_teeth": {"value": 54},
        "ring_teeth": {"value": 126},
        "fpk_planet_count": {"value": 3},
        "fpk_sun_od_mm": {"value": 12.0, "unit": "mm"},
        "fpk_planet_od_mm": {"value": 38.4, "unit": "mm"},
        "fpk_ring_id_mm": {"value": 88.7, "unit": "mm"},
        "fpk_gear_face_mm": {"value": 14.0, "unit": "mm"},
        "stack_length_mm": {"value": 97.58, "unit": "mm"},
    }
    concentric = {
        "sun_od_mm": 12.0,
        "planet_od_mm": 38.4,
        "planet_count": 3,
        "ring_id_mm": 88.7,
        "stack_len_mm": 97.58,
        "gear_face_mm": 14.0,
    }
    return quantities, concentric


def run_selftest() -> int:
    """Prove twin binding, stress physics, and release honesty."""

    quantities, concentric = _synthetic_sections()
    inputs = inputs_from_sections(quantities, concentric)
    geometry = derive_gear_geometry(inputs)
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

    checks = {
        "synthetic_teeth_control_geometry": (
            geometry.sun_teeth == 18
            and geometry.planet_teeth == 54
            and geometry.ring_teeth == 126
            and abs(geometry.module_mm - 0.704) < 1.0e-9
            and abs(geometry.face_width_mm - 14.0) < 1.0e-9
        ),
        "ratio_from_teeth_is_8": abs(geometry.ratio_from_teeth - 8.0) < 1.0e-6,
        "assembly_ok": geometry.assembly_ok,
        "motor_torque_near_125nm": 120.0 <= torque <= 130.0,
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
        "packaging_seed_fails_duty_screen": screen.works_in_kit_context is False,
        "strength_resize_clears_duty_screen": (
            (
                propose_strength_feasible_geometry(
                    inputs, motor_shaft_torque_nm=torque
                )
                or {}
            ).get("clears_duty_screen")
            is True
        ),
        "rotor_bore_blocks_invalid_resize": (
            (
                propose_strength_feasible_geometry(
                    replace(inputs, rotor_id_mm=92.7),
                    motor_shaft_torque_nm=torque,
                )
                or {}
            ).get("clears_duty_screen")
            is False
            and BLOCKER_ID_PLANETARY_VS_ROTOR_BORE
            in str(
                (
                    propose_strength_feasible_geometry(
                        replace(inputs, rotor_id_mm=92.7),
                        motor_shaft_torque_nm=torque,
                    )
                    or {}
                ).get("architecture_hold")
                or ""
            )
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
                "minimum_strength_factor": screen.minimum_strength_factor,
                "minimum_bending_fos": screen.minimum_bending_fos,
                "minimum_contact_fos": screen.minimum_contact_fos,
                "works_in_kit_context": screen.works_in_kit_context,
                "hot_torque_minimum_fos": hot.minimum_strength_factor,
                "ship_ok": artifact["ship_ok"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist one ISO 6336-style screen against a live twin.

    When the twin packaging seed fails the FoS screen, propose a strength-
    driven resize inside the bay envelope and make that the controlling
    geometry (seed retained under packaging_seed_screen).
    """

    state_path = twin_dir / "state.json"
    seed_inputs, state_hash = load_twin_inputs(state_path)
    seed_geometry = derive_gear_geometry(seed_inputs)
    if not seed_geometry.assembly_ok:
        raise FiaFrontKitGearError(
            "Twin tooth counts fail planetary assembly / planet-size check"
        )
    torque = derive_motor_shaft_torque_nm(seed_inputs)
    seed_screen = run_strength_screen(
        seed_inputs, seed_geometry, motor_shaft_torque_nm=torque
    )
    if not (
        math.isfinite(seed_screen.minimum_strength_factor)
        and seed_screen.minimum_strength_factor > 0.0
    ):
        raise FiaFrontKitGearError("Strength screen returned non-finite FoS")

    recommended = propose_strength_feasible_geometry(
        seed_inputs, motor_shaft_torque_nm=torque
    )
    controlling = "packaging_seed"
    inputs = seed_inputs
    geometry = seed_geometry
    screen = seed_screen
    packaging_seed_screen: StrengthScreen | None = None
    packaging_seed_geometry: GearGeometry | None = None
    architecture_hold: str | None = None
    seed_tip = _ring_tip_diameter_mm(
        seed_geometry.module_mm, seed_geometry.ring_teeth
    )
    seed_fits_rotor = (
        seed_inputs.rotor_id_mm <= 0.0
        or seed_tip
        <= _max_ring_tip_for_rotor_mm(seed_inputs.rotor_id_mm) + 1.0e-6
    )
    # GOTCHA: FoS can clear on an oversized nest that cannot physically sit in
    # the hollow rotor. That is NOT works_in_kit_context.
    if seed_screen.works_in_kit_context and not seed_fits_rotor:
        architecture_hold = (
            f"{BLOCKER_ID_PLANETARY_VS_ROTOR_BORE} — controlling nest tip "
            f"{seed_tip:.1f} mm exceeds rotor ID {seed_inputs.rotor_id_mm:.1f} mm "
            f"(max tip {_max_ring_tip_for_rotor_mm(seed_inputs.rotor_id_mm):.1f} mm); "
            "FoS alone must not greenwash nest_fits_rotor"
        )
        packaging_seed_screen = seed_screen
        packaging_seed_geometry = seed_geometry
        if recommended and recommended.get("clears_duty_screen"):
            inputs = replace(
                seed_inputs,
                gear_module_mm=float(recommended["gear_module_mm"]),
                face_width_mm=float(recommended["face_width_mm"]),
                planet_count=int(recommended["planet_count"]),
                sun_od_mm=float(recommended["sun_pitch_diameter_mm"]),
                planet_od_mm=float(recommended["planet_pitch_diameter_mm"]),
                ring_id_mm=float(recommended["ring_pitch_diameter_mm"]),
            )
            geometry = derive_gear_geometry(inputs)
            screen = run_strength_screen(
                inputs, geometry, motor_shaft_torque_nm=torque
            )
            controlling = "strength_driven_resize"
            architecture_hold = None
        else:
            controlling = "packaging_seed_rotor_bore_hold"
            if recommended and recommended.get("architecture_hold"):
                architecture_hold = str(recommended["architecture_hold"])
    elif not seed_screen.works_in_kit_context:
        packaging_seed_screen = seed_screen
        packaging_seed_geometry = seed_geometry
        if recommended is None:
            raise FiaFrontKitGearError(
                "Packaging seed fails FoS screen and no strength-feasible "
                f"resize fits ring tip ≤ {_max_ring_tip_for_rotor_mm(seed_inputs.rotor_id_mm):.1f} mm / "
                f"face ≤ {MAX_FACE_WIDTH_MM:.0f} mm"
            )
        architecture_hold = (
            str(recommended.get("architecture_hold") or "") or None
        )
        clears = bool(recommended.get("clears_duty_screen"))
        if clears:
            inputs = replace(
                seed_inputs,
                gear_module_mm=float(recommended["gear_module_mm"]),
                face_width_mm=float(recommended["face_width_mm"]),
                planet_count=int(recommended["planet_count"]),
                # Keep OD seeds consistent with resized pitch diameters (tip≈od).
                sun_od_mm=float(recommended["sun_pitch_diameter_mm"]),
                planet_od_mm=float(recommended["planet_pitch_diameter_mm"]),
                ring_id_mm=float(recommended["ring_pitch_diameter_mm"]),
            )
            geometry = derive_gear_geometry(inputs)
            screen = run_strength_screen(
                inputs, geometry, motor_shaft_torque_nm=torque
            )
            controlling = "strength_driven_resize"
            if not screen.works_in_kit_context:
                raise FiaFrontKitGearError(
                    "Strength-driven resize failed to clear FoS after apply"
                )
        else:
            # Rotor-bore-limited search cannot clear FoS — keep seed, record hold.
            controlling = "packaging_seed_rotor_bore_hold"
            architecture_hold = architecture_hold or (
                f"{BLOCKER_ID_PLANETARY_VS_ROTOR_BORE} — no nest inside rotor "
                f"clears FoS ≥ {SCREEN_FOS_MIN}"
            )

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
        packaging_seed_screen=packaging_seed_screen,
        packaging_seed_geometry=packaging_seed_geometry,
        recommended_geometry=recommended,
        controlling_geometry_source=controlling,
        architecture_hold=architecture_hold,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / "iso6336_fia_front_kit_case.json"
    )
    _atomic_write_json(destination, artifact)
    # Sidecar for CAD / twin quantity writeback consumers.
    if recommended is not None:
        _atomic_write_json(
            twin_dir / "_motor_stack" / "iso6336_recommended_geometry.json",
            {
                "schema": "forgeos.motor_stack.iso6336_recommended_geometry/v1",
                "ship_ok": False,
                "controlling_geometry_source": controlling,
                "recommended": recommended,
                "packaging_seed": {
                    "gear_module_mm": seed_inputs.gear_module_mm,
                    "face_width_mm": seed_inputs.face_width_mm,
                    "planet_count": seed_inputs.planet_count,
                    "minimum_strength_factor": seed_screen.minimum_strength_factor,
                },
            },
        )
        # Only write nest-fitting clearing geometry into the Blender/CAD writeback.
        if recommended.get("clears_duty_screen"):
            _atomic_write_json(
                twin_dir / "_motor_stack" / "gear_geometry_writeback.json",
                {
                    "schema": "forgeos.motor_stack.gear_geometry_writeback/v1",
                    "ship_ok": False,
                    "source": "iso6336_fia_front_kit_case strength_driven_resize",
                    "controlling_geometry_source": controlling,
                    "note": (
                        "Strength-driven gear packaging writeback that fits the "
                        "hollow rotor bore. ship_ok false."
                    ),
                    "fpkConcentricGeometry": {
                        "gear_face_mm": float(recommended["face_width_mm"]),
                        "gear_module_mm": float(recommended["gear_module_mm"]),
                        "planet_count": int(recommended["planet_count"]),
                        "planet_od_mm": float(recommended["planet_pitch_diameter_mm"]),
                        "ring_id_mm": float(recommended["ring_pitch_diameter_mm"]),
                        "sun_od_mm": float(recommended["sun_pitch_diameter_mm"]),
                    },
                    "quantities": {
                        "fpk_gear_face_mm": {
                            "unit": "mm",
                            "value": float(recommended["face_width_mm"]),
                        },
                        "fpk_planet_count": {
                            "unit": "count",
                            "value": int(recommended["planet_count"]),
                        },
                        "fpk_planet_od_mm": {
                            "unit": "mm",
                            "value": float(recommended["planet_pitch_diameter_mm"]),
                        },
                        "fpk_ring_id_mm": {
                            "unit": "mm",
                            "value": float(recommended["ring_pitch_diameter_mm"]),
                        },
                        "fpk_sun_od_mm": {
                            "unit": "mm",
                            "value": float(recommended["sun_pitch_diameter_mm"]),
                        },
                        "gear_face_mm": {
                            "unit": "mm",
                            "value": float(recommended["face_width_mm"]),
                        },
                        "gear_module_mm": {
                            "unit": "mm",
                            "value": float(recommended["gear_module_mm"]),
                        },
                        "planet_count": {
                            "unit": "count",
                            "value": int(recommended["planet_count"]),
                        },
                    },
                },
            )
        else:
            # Invalidate the previous oversized writeback so Blender stops
            # showing a nest that cannot fit the rotor.
            wb_path = twin_dir / "_motor_stack" / "gear_geometry_writeback.json"
            if wb_path.is_file():
                _atomic_write_json(
                    wb_path,
                    {
                        "schema": "forgeos.motor_stack.gear_geometry_writeback/v1",
                        "ship_ok": False,
                        "invalidated": True,
                        "architecture_hold": architecture_hold
                        or recommended.get("architecture_hold"),
                        "note": (
                            "Previous strength resize exceeded rotor bore and was "
                            "invalidated. Controllers must use packaging seed until "
                            "PLANETARY_STRENGTH_VS_ROTOR_BORE is unblocked."
                        ),
                        "fpkConcentricGeometry": {},
                        "quantities": {},
                    },
                )
    works_word = (
        "clears"
        if (
            screen.works_in_kit_context
            and not architecture_hold
            and (
                seed_inputs.rotor_id_mm <= 0.0
                or _ring_tip_diameter_mm(geometry.module_mm, geometry.ring_teeth)
                <= _max_ring_tip_for_rotor_mm(seed_inputs.rotor_id_mm) + 1.0e-6
            )
        )
        else "does NOT clear"
    )
    seed_note = ""
    if packaging_seed_screen is not None and controlling == "strength_driven_resize":
        seed_note = (
            f" Packaging seed FoS ≈ {packaging_seed_screen.minimum_strength_factor:.3f} "
            f"(FAILED) → resized to m={geometry.module_mm:.3f} mm / "
            f"face={geometry.face_width_mm:.1f} mm / n={geometry.planet_count}."
        )
    elif architecture_hold:
        seed_note = f" Architecture hold: {architecture_hold}"
    print(
        "FIA front-kit ISO 6336-style gear screen: "
        f"T_motor ≈ {screen.motor_shaft_torque_nm:.1f} N·m → "
        f"T_out ≈ {screen.carrier_output_torque_nm:.1f} N·m at ratio "
        f"{inputs.gear_ratio:.2f} (teeth i={geometry.ratio_from_teeth:.3f}). "
        f"Module {geometry.module_mm:.3f} mm, face {geometry.face_width_mm:.1f} mm, "
        f"S/P/R={geometry.sun_teeth}/{geometry.planet_teeth}/{geometry.ring_teeth}, "
        f"{geometry.planet_count} planets. "
        f"Min bending FoS ≈ {screen.minimum_bending_fos:.3f}, "
        f"min contact FoS ≈ {screen.minimum_contact_fos:.3f} "
        f"(need ≥ {SCREEN_FOS_MIN:.2f} vs "
        f"σF_allow={SIGMA_F_ALLOW_MPA:.0f} / σH_allow={SIGMA_H_ALLOW_MPA:.0f} MPa). "
        f"Duty screen {works_word} kit context "
        f"(controlling={controlling}).{seed_note} "
        "KISSsoft / load spectrum / tooth-contact FEA remain OPEN; ship_ok is false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description=(
            "Solve the FIA-bound Formula E front-kit ISO 6336-style "
            "gear-strength screening case."
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
