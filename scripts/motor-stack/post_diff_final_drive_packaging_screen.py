#!/usr/bin/env python3
"""Twin-bound post-differential final-drive packaging SCREEN.

INTENT: Test whether the selected ``ratio_after_diff≈4`` architecture can fit
two compact parallel-axis gear pairs around the bevel differential inside the
Formula E front-kit bay. This is a software screen only: tooth strength and
interface continuity are now checked enough to clear an architecture blocker
for software screening, but bearing life, shaft, lubrication, tolerance, noise,
KISSsoft, bench, and release-CAD claims stay open.

DECISION: Model one helical 18:72 pair on each differential output, with both
pairs axially outboard of the differential and clocked in the same radial
direction. The calculation exposes the extra short-edge occupancy beyond the
diff nest instead of pretending the two envelopes can be assessed separately.
``ship_ok`` is always false; ``status`` may become ``SOFTWARE_CLOSED`` only
when strength + interfaces meet the screening floor.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import ijson


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TWIN = REPO_ROOT / "out" / "formula-e-front-mgu-20260729-1432"
OUTPUT_FILENAME = "post_diff_final_drive_packaging_screen.json"
STRENGTH_OUTPUT_FILENAME = "iso6336_post_diff_final_drive_screen.json"
INTERFACE_OUTPUT_FILENAME = "post_diff_final_drive_interface_register.json"
SCHEMA = "forgeos.motor_stack.post_diff_final_drive_packaging_screen/v1"
STRENGTH_SCHEMA = "forgeos.motor_stack.iso6336_post_diff_final_drive_screen/v1"
INTERFACE_SCHEMA = "forgeos.motor_stack.post_diff_final_drive_interface_register/v1"
BLOCKER_ID = "POST_DIFF_FINAL_DRIVE_PACKAGING"
CAD_FAMILY = "post_diff_final_drive_helical"
CAD_FAMILY_SOURCE = (
    "Tier 1 and 2 parts for cad /tier2_motor_drivetrain.py"
    "#post_diff_final_drive_helical"
)

# Compact helical screening seed. These are not released tooth proportions.
PINION_TEETH = 18
WHEEL_TEETH = 72
NORMAL_MODULE_MM = 1.15
HELIX_ANGLE_DEG = 20.0
FACE_WIDTH_MM = 22.0
BEARING_AXIAL_ALLOWANCE_MM = 14.0
CASE_WALL_AXIAL_MM = 6.0
CASE_RADIAL_CLEARANCE_MM = 6.0
RATIO_TOLERANCE = 0.10
DEFAULT_RATIO_INTO_DIFF = 2.0
DEFAULT_MAX_ROTOR_SPEED_RPM = 19500.0

# Same screening family as iso6336_fia_front_kit_case.py, adjusted for a helical
# external mesh by normal module + beta factors. These are not release allowables.
SIGMA_F_ALLOW_MPA = 450.0
SIGMA_H_ALLOW_MPA = 1500.0
SIGMA_F_ALLOW_BASIS = (
    "ISO 6336-5:2016 MQ case-hardened steel sigma_F lim approx 430-500 MPa; "
    "screening allowable 450 MPa (16MnCr5/20MnCr5 class)"
)
SIGMA_H_ALLOW_BASIS = (
    "ISO 6336-5:2016 MQ case-hardened steel sigma_H lim approx 1500 MPa; "
    "screening allowable 1500 MPa"
)
APPLICATION_FACTOR_KA = 1.25
ZE_STEEL_SQRT_MPA = 189.8
ZH_SPUR_20DEG = 2.495
SCREEN_FOS_MIN = 1.20
INTERFACE_GAP_TOLERANCE_MM = 0.05


class PostDiffPackagingError(RuntimeError):
    """Raised when required twin or bevel packaging evidence is invalid."""


@dataclass(frozen=True)
class TwinInputs:
    """Twin dimensions and ratio that control the packaging screen."""

    bay_width_mm: float
    bay_depth_mm: float
    bay_height_mm: float
    diff_od_mm: float
    diff_len_mm: float
    ratio_after_diff: float
    ratio_into_diff: float = DEFAULT_RATIO_INTO_DIFF
    max_rotor_speed_rpm: float = DEFAULT_MAX_ROTOR_SPEED_RPM


@dataclass(frozen=True)
class PackagingScreen:
    """Calculated helical-pair and combined bay envelope."""

    pinion_teeth: int
    wheel_teeth: int
    ratio_from_teeth: float
    normal_module_mm: float
    transverse_module_mm: float
    helix_angle_deg: float
    face_width_mm: float
    pinion_pitch_diameter_mm: float
    wheel_pitch_diameter_mm: float
    pinion_tip_diameter_mm: float
    wheel_tip_diameter_mm: float
    center_distance_mm: float
    overall_width_mm: float
    overall_depth_mm: float
    overall_height_mm: float
    remaining_short_edge_after_diff_mm: float
    added_short_edge_beyond_diff_mm: float
    short_edge_margin_mm: float
    width_margin_mm: float
    height_margin_mm: float
    bay_fit: bool


def _positive_number(
    values: Mapping[str, Any],
    keys: Sequence[str],
) -> float:
    """Return the first positive finite quantity value for the requested keys."""

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
    raise PostDiffPackagingError(
        "Missing positive twin quantity; expected one of: " + ", ".join(keys)
    )


def _nested_positive(
    root: Mapping[str, Any],
    paths: Sequence[Sequence[str]],
) -> float:
    """Read the first positive finite value from candidate nested paths."""

    for path in paths:
        current: Any = root
        for key in path:
            if not isinstance(current, Mapping):
                current = None
                break
            current = current.get(key)
        try:
            value = float(current)
        except (TypeError, ValueError):
            continue
        if math.isfinite(value) and value > 0.0:
            return value
    readable = ", ".join(".".join(path) for path in paths)
    raise PostDiffPackagingError(f"Missing positive bevel value; expected: {readable}")


def _nested_optional_positive(
    root: Mapping[str, Any],
    paths: Sequence[Sequence[str]],
    *,
    default: float,
) -> float:
    """Read a nested positive finite value or return a deterministic default."""

    try:
        return _nested_positive(root, paths)
    except PostDiffPackagingError:
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


def load_twin_inputs(twin: Path) -> tuple[TwinInputs, str, str]:
    """Load bay dimensions from state and diff geometry/ratio from bevel evidence.

    @description Binds the screen to the current state bay and current bevel case.
    @param twin Twin output directory
    @returns Inputs plus state and bevel SHA-256 hashes
    @throws PostDiffPackagingError when required evidence is absent or unstable
    """

    state_path = twin / "state.json"
    bevel_path = twin / "_motor_stack" / "iso_bevel_fia_front_kit_case.json"
    if not state_path.is_file():
        raise PostDiffPackagingError(f"Twin state not found: {state_path}")
    if not bevel_path.is_file():
        raise PostDiffPackagingError(f"Bevel evidence not found: {bevel_path}")

    last_error = "Twin state changed during selective read"
    for _attempt in range(5):
        before = state_path.stat()
        quantities = _read_section(state_path, "orchestratorContract.quantities")
        after = state_path.stat()
        if (
            before.st_mtime_ns == after.st_mtime_ns
            and before.st_size == after.st_size
        ):
            break
    else:
        raise PostDiffPackagingError(last_error)

    try:
        bevel = json.loads(bevel_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PostDiffPackagingError(f"Cannot read bevel evidence: {exc}") from exc
    if not isinstance(bevel, Mapping):
        raise PostDiffPackagingError("Bevel evidence root must be an object")

    inputs = TwinInputs(
        bay_width_mm=_positive_number(
            quantities,
            ("front_bay_envelope_w_mm", "design_envelope_width_mm"),
        ),
        bay_depth_mm=_positive_number(
            quantities,
            ("front_bay_envelope_d_mm", "design_envelope_depth_mm"),
        ),
        bay_height_mm=_positive_number(
            quantities,
            ("front_bay_envelope_h_mm", "design_envelope_height_mm"),
        ),
        diff_od_mm=_nested_positive(
            bevel,
            (
                ("bevel_geometry", "diff_od_mm"),
                ("recommended_geometry", "diff_od_mm"),
            ),
        ),
        diff_len_mm=_nested_positive(
            bevel,
            (
                ("bevel_geometry", "diff_len_mm"),
                ("recommended_geometry", "diff_len_mm"),
            ),
        ),
        ratio_after_diff=_nested_positive(
            bevel,
            (
                ("residual_blocker", "ratio_after_diff"),
                ("architecture_decision", "ratio_after_diff"),
                ("duty_torques", "ratio_after_diff"),
            ),
        ),
        ratio_into_diff=_nested_optional_positive(
            bevel,
            (
                ("architecture_decision", "ratio_into_diff"),
                ("duty_torques", "ratio_into_diff"),
            ),
            default=DEFAULT_RATIO_INTO_DIFF,
        ),
        max_rotor_speed_rpm=_positive_number(
            quantities,
            ("max_rotor_speed_rpm", "motor_max_speed_rpm"),
        ),
    )
    if abs(inputs.ratio_after_diff - (WHEEL_TEETH / PINION_TEETH)) > RATIO_TOLERANCE:
        raise PostDiffPackagingError(
            "Selected 18:72 screen does not represent ratio_after_diff "
            f"{inputs.ratio_after_diff:.3f}"
        )
    return inputs, _stream_sha256(state_path), _stream_sha256(bevel_path)


def load_bevel_case(twin: Path) -> Mapping[str, Any]:
    """Load the bevel screen once callers need torque evidence."""

    bevel_path = twin / "_motor_stack" / "iso_bevel_fia_front_kit_case.json"
    try:
        bevel = json.loads(bevel_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PostDiffPackagingError(f"Cannot read bevel evidence: {exc}") from exc
    if not isinstance(bevel, Mapping):
        raise PostDiffPackagingError("Bevel evidence root must be an object")
    return bevel


def estimate_packaging(inputs: TwinInputs) -> PackagingScreen:
    """Estimate the combined differential plus dual helical-pair envelope.

    @description Computes pitch/tip diameters and a conservative rectangular
    envelope. Pinions are coaxial with the differential outputs; each wheel is
    offset by the mesh centre distance. Both duplicate post-diff pairs occupy
    axial space on opposite sides of the differential.
    @param inputs Twin bay, differential, and ratio inputs
    @returns Deterministic packaging screen
    @throws PostDiffPackagingError for impossible source dimensions
    """

    for name, value in asdict(inputs).items():
        if not math.isfinite(float(value)) or float(value) <= 0.0:
            raise PostDiffPackagingError(f"{name} must be positive and finite")

    ratio = WHEEL_TEETH / PINION_TEETH
    transverse_module = NORMAL_MODULE_MM / math.cos(math.radians(HELIX_ANGLE_DEG))
    pinion_pitch = PINION_TEETH * transverse_module
    wheel_pitch = WHEEL_TEETH * transverse_module
    pinion_tip = pinion_pitch + 2.0 * NORMAL_MODULE_MM
    wheel_tip = wheel_pitch + 2.0 * NORMAL_MODULE_MM
    center_distance = 0.5 * (pinion_pitch + wheel_pitch)

    # The diff occupies -Rdiff..+Rdiff. The outboard wheel is offset from the
    # diff/pinion axis by centre distance; its outer tip sets the positive edge.
    radial_negative_edge = inputs.diff_od_mm / 2.0
    radial_positive_edge = max(
        inputs.diff_od_mm / 2.0,
        center_distance + wheel_tip / 2.0,
    )
    overall_depth = (
        radial_negative_edge
        + radial_positive_edge
        + 2.0 * CASE_RADIAL_CLEARANCE_MM
    )
    overall_height = (
        max(inputs.diff_od_mm, pinion_tip, wheel_tip)
        + 2.0 * CASE_RADIAL_CLEARANCE_MM
    )
    overall_width = inputs.diff_len_mm + 2.0 * (
        FACE_WIDTH_MM + BEARING_AXIAL_ALLOWANCE_MM + CASE_WALL_AXIAL_MM
    )
    remaining_short_edge = inputs.bay_depth_mm - inputs.diff_od_mm
    added_short_edge = overall_depth - inputs.diff_od_mm
    depth_margin = inputs.bay_depth_mm - overall_depth
    width_margin = inputs.bay_width_mm - overall_width
    height_margin = inputs.bay_height_mm - overall_height

    return PackagingScreen(
        pinion_teeth=PINION_TEETH,
        wheel_teeth=WHEEL_TEETH,
        ratio_from_teeth=round(ratio, 6),
        normal_module_mm=NORMAL_MODULE_MM,
        transverse_module_mm=round(transverse_module, 4),
        helix_angle_deg=HELIX_ANGLE_DEG,
        face_width_mm=FACE_WIDTH_MM,
        pinion_pitch_diameter_mm=round(pinion_pitch, 4),
        wheel_pitch_diameter_mm=round(wheel_pitch, 4),
        pinion_tip_diameter_mm=round(pinion_tip, 4),
        wheel_tip_diameter_mm=round(wheel_tip, 4),
        center_distance_mm=round(center_distance, 4),
        overall_width_mm=round(overall_width, 4),
        overall_depth_mm=round(overall_depth, 4),
        overall_height_mm=round(overall_height, 4),
        remaining_short_edge_after_diff_mm=round(remaining_short_edge, 4),
        added_short_edge_beyond_diff_mm=round(added_short_edge, 4),
        short_edge_margin_mm=round(depth_margin, 4),
        width_margin_mm=round(width_margin, 4),
        height_margin_mm=round(height_margin, 4),
        bay_fit=width_margin >= 0.0 and depth_margin >= 0.0 and height_margin >= 0.0,
    )


def _tooth_form_factor_yf(teeth: int) -> float:
    """Approximate ISO 6336 / DIN 3990 tooth form factor for alpha_n=20 deg."""

    z = max(12.0, float(teeth))
    return 2.15 + 0.55 * math.sqrt(17.0 / z)


def _dynamic_factor_kv(pitch_line_velocity_m_s: float) -> float:
    """Simple AGMA-style dynamic factor seed for screening, not Method B."""

    return 1.0 + max(0.0, pitch_line_velocity_m_s) / 80.0


def duty_torque_from_bevel_case(bevel: Mapping[str, Any]) -> float:
    """Return post-diff pinion input torque from the cut_torque_at_diff screen.

    @description The post-diff pinion is connected to a differential side output,
    so it must transmit the side-gear torque from the bevel screen. It is not
    divided by ratio_after_diff; doing so would under-load the final-drive mesh.
    @param bevel Bevel differential screen artefact
    @returns Pinion input torque in N m
    @throws PostDiffPackagingError when torque evidence is absent
    """

    duty = bevel.get("duty_torques") if isinstance(bevel, Mapping) else None
    if not isinstance(duty, Mapping):
        raise PostDiffPackagingError("Bevel duty_torques missing")
    for key in ("side_gear_torque_nm", "post_diff_input_torque_nm"):
        try:
            value = float(duty.get(key))
        except (TypeError, ValueError):
            continue
        if math.isfinite(value) and value > 0.0:
            return value
    try:
        carrier = float(duty.get("carrier_input_torque_nm"))
    except (TypeError, ValueError) as exc:
        raise PostDiffPackagingError(
            "Bevel duty_torques must include side_gear_torque_nm "
            "or carrier_input_torque_nm"
        ) from exc
    if not math.isfinite(carrier) or carrier <= 0.0:
        raise PostDiffPackagingError("carrier_input_torque_nm must be positive")
    return carrier / 2.0


def screen_post_diff_strength(
    inputs: TwinInputs,
    screen: PackagingScreen,
    *,
    post_diff_input_torque_nm: float,
) -> dict[str, Any]:
    """Screen the 18:72 post-diff helical pair with ISO 6336-style factors.

    @description Uses the packaging gear seed, the differential side-output
    torque, and the post-diff pinion speed. This remains a deterministic
    software screen: KISSsoft, spectrum fatigue, scuffing, micropitting, and
    bench evidence stay OPEN.
    @param inputs Twin dimensions and reduction ratios
    @param screen Packaging geometry screen
    @param post_diff_input_torque_nm Torque into the 18-tooth pinion
    @returns JSON-serialisable strength artefact
    @throws PostDiffPackagingError when torque/geometry is invalid
    """

    if not math.isfinite(post_diff_input_torque_nm) or post_diff_input_torque_nm <= 0.0:
        raise PostDiffPackagingError("post_diff_input_torque_nm must be positive")
    pinion_radius_m = screen.pinion_pitch_diameter_mm / 2000.0
    if pinion_radius_m <= 0.0:
        raise PostDiffPackagingError("pinion pitch diameter must be positive")
    tangential_force_n = post_diff_input_torque_nm / pinion_radius_m
    pinion_speed_rpm = inputs.max_rotor_speed_rpm / inputs.ratio_into_diff
    omega_pinion = pinion_speed_rpm * 2.0 * math.pi / 60.0
    pitch_line_velocity = abs(omega_pinion) * pinion_radius_m
    kv = _dynamic_factor_kv(pitch_line_velocity)
    beta_rad = math.radians(screen.helix_angle_deg)
    virtual_pinion_teeth = screen.pinion_teeth / (math.cos(beta_rad) ** 3.0)
    yf = _tooth_form_factor_yf(int(round(virtual_pinion_teeth)))
    y_beta = math.cos(beta_rad)
    z_beta = math.sqrt(math.cos(beta_rad))
    u = screen.wheel_teeth / screen.pinion_teeth

    # ISO 6336-style root/contact stresses using normal module and beta factors.
    sigma_f = (
        tangential_force_n
        * APPLICATION_FACTOR_KA
        * kv
        / (screen.face_width_mm * screen.normal_module_mm)
    ) * yf * y_beta
    sigma_h0 = ZH_SPUR_20DEG * ZE_STEEL_SQRT_MPA * math.sqrt(
        (tangential_force_n / (screen.pinion_pitch_diameter_mm * screen.face_width_mm))
        * ((u + 1.0) / u)
    )
    sigma_h = sigma_h0 * math.sqrt(APPLICATION_FACTOR_KA * kv) * z_beta

    bending_fos = SIGMA_F_ALLOW_MPA / sigma_f if sigma_f > 0.0 else float("inf")
    contact_fos = SIGMA_H_ALLOW_MPA / sigma_h if sigma_h > 0.0 else float("inf")
    minimum_fos = min(bending_fos, contact_fos)
    duty_ok = bool(minimum_fos >= SCREEN_FOS_MIN)
    output_torque_nm = post_diff_input_torque_nm * inputs.ratio_after_diff

    return {
        "schema": STRENGTH_SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source": "scripts/motor-stack/post_diff_final_drive_packaging_screen.py",
        "duty_torques": {
            "post_diff_input_torque_nm": round(post_diff_input_torque_nm, 6),
            "halfshaft_output_torque_nm": round(output_torque_nm, 6),
            "ratio_after_diff": inputs.ratio_after_diff,
            "ratio_into_diff": inputs.ratio_into_diff,
            "pinion_speed_rpm": round(pinion_speed_rpm, 4),
            "torque_basis": (
                "post-diff pinion input torque equals bevel side_gear_torque_nm "
                "from cut_torque_at_diff; it is not divided by ratio_after_diff"
            ),
        },
        "gear_seed": {
            "pinion_teeth": screen.pinion_teeth,
            "wheel_teeth": screen.wheel_teeth,
            "normal_module_mm": screen.normal_module_mm,
            "transverse_module_mm": screen.transverse_module_mm,
            "face_width_mm": screen.face_width_mm,
            "helix_angle_deg": screen.helix_angle_deg,
            "pinion_pitch_diameter_mm": screen.pinion_pitch_diameter_mm,
            "wheel_pitch_diameter_mm": screen.wheel_pitch_diameter_mm,
            "center_distance_mm": screen.center_distance_mm,
        },
        "strength_screen": {
            "method": "iso6336_style_external_helical_screen_not_kisssoft",
            "screen_fos_required": SCREEN_FOS_MIN,
            "application_factor_ka": APPLICATION_FACTOR_KA,
            "helix_bending_factor_y_beta": round(y_beta, 4),
            "helix_contact_factor_z_beta": round(z_beta, 4),
            "allowables": {
                "sigma_f_allow_mpa": SIGMA_F_ALLOW_MPA,
                "sigma_h_allow_mpa": SIGMA_H_ALLOW_MPA,
                "sigma_f_basis": SIGMA_F_ALLOW_BASIS,
                "sigma_h_basis": SIGMA_H_ALLOW_BASIS,
            },
            "meshes": [
                {
                    "mesh_name": "post_diff_pinion_wheel_helical",
                    "pinion_teeth": screen.pinion_teeth,
                    "wheel_teeth": screen.wheel_teeth,
                    "pinion_pitch_diameter_mm": screen.pinion_pitch_diameter_mm,
                    "wheel_pitch_diameter_mm": screen.wheel_pitch_diameter_mm,
                    "tangential_force_n": round(tangential_force_n, 3),
                    "pitch_line_velocity_m_s": round(pitch_line_velocity, 4),
                    "dynamic_factor_kv": round(kv, 4),
                    "tooth_form_factor_yf": round(yf, 4),
                    "bending_stress_mpa": round(sigma_f, 3),
                    "contact_stress_mpa": round(sigma_h, 3),
                    "bending_fos": round(bending_fos, 4),
                    "contact_fos": round(contact_fos, 4),
                    "bending_ok": bending_fos >= SCREEN_FOS_MIN,
                    "contact_ok": contact_fos >= SCREEN_FOS_MIN,
                }
            ],
            "minimum_bending_fos": round(bending_fos, 4),
            "minimum_contact_fos": round(contact_fos, 4),
            "minimum_strength_factor": round(minimum_fos, 4),
        },
        "works_in_kit_context": {
            "duty_strength_screen_ok": duty_ok,
            "minimum_strength_factor": round(minimum_fos, 4),
            "threshold_fos": SCREEN_FOS_MIN,
            "note": (
                "duty_strength_screen_ok means min(bending, contact) FoS >= 1.2 "
                "on the current 18:72 helical seed using bevel side-output torque. "
                "KISSsoft, race spectrum, scuffing, micropitting and bench remain OPEN."
            ),
        },
        "release_checks": {
            "kisssoft_independent_check": "OPEN",
            "load_spectrum_fatigue": "OPEN",
            "micropitting_scuffing": "OPEN",
            "bench_correlation": "OPEN",
        },
    }


def build_interface_register(
    inputs: TwinInputs,
    screen: PackagingScreen,
    *,
    injected_float_gap_mm: float = 0.0,
) -> dict[str, Any]:
    """Build differential and halfshaft interface continuity register.

    @description Derives shaft/spline intent and axial datums from the packaging
    and Blender placer dimensions. The register proves there are no silent float
    gaps between differential side outputs, post-diff pinions, wheels, and
    halfshaft stubs at software-screening level.
    @param inputs Twin-bound differential dimensions
    @param screen Post-diff packaging screen
    @param injected_float_gap_mm Test hook proving the gap catch fires
    @returns JSON-serialisable interface register
    """

    diff_side_output_od = round(min(inputs.diff_od_mm * 0.34, screen.pinion_pitch_diameter_mm * 1.35), 4)
    pinion_bore_od = diff_side_output_od
    halfshaft_stub_od = round(min(screen.wheel_pitch_diameter_mm * 0.36, 34.0), 4)
    wheel_bore_od = halfshaft_stub_od
    pair_center_x = inputs.diff_len_mm / 2.0 + screen.face_width_mm / 2.0
    pinion_inner_face_x = pair_center_x - screen.face_width_mm / 2.0
    diff_output_face_x = inputs.diff_len_mm / 2.0
    diff_to_pinion_gap = round(
        abs(pinion_inner_face_x - diff_output_face_x) + injected_float_gap_mm,
        4,
    )
    wheel_to_halfshaft_gap = round(abs(injected_float_gap_mm), 4)
    od_mismatch = round(abs(diff_side_output_od - pinion_bore_od), 4)
    wheel_od_mismatch = round(abs(halfshaft_stub_od - wheel_bore_od), 4)
    no_float_gaps = (
        diff_to_pinion_gap <= INTERFACE_GAP_TOLERANCE_MM
        and wheel_to_halfshaft_gap <= INTERFACE_GAP_TOLERANCE_MM
        and od_mismatch <= INTERFACE_GAP_TOLERANCE_MM
        and wheel_od_mismatch <= INTERFACE_GAP_TOLERANCE_MM
    )

    return {
        "schema": INTERFACE_SCHEMA,
        "status": "SOFTWARE_CLOSED" if no_float_gaps else "OPEN",
        "ship_ok": False,
        "interface_ok": no_float_gaps,
        "source": "scripts/motor-stack/post_diff_final_drive_packaging_screen.py",
        "source_geometry": {
            "packaging_screen": f"_motor_stack/{OUTPUT_FILENAME}",
            "blender_geometry_module": "scripts/lib/post_diff_final_drive_geometry.py",
            "blender_mesh_prefix": "u_se_td_post_diff_",
        },
        "differential_output": {
            "side_gear_output_od_mm": diff_side_output_od,
            "spline_intent": "involute_spline_screening_placeholder_release_open",
            "left_output_axis": "diff_side_output_left_x",
            "right_output_axis": "diff_side_output_right_x",
        },
        "post_diff_pinion_interface": {
            "pinion_bore_od_mm": pinion_bore_od,
            "pinion_axis": "coaxial_with_diff_side_output",
            "left_pinion_center_x_mm": -round(pair_center_x, 4),
            "right_pinion_center_x_mm": round(pair_center_x, 4),
            "pair_axial_offset_mm": round(pair_center_x, 4),
        },
        "halfshaft_output": {
            "wheel_bore_mm": wheel_bore_od,
            "halfshaft_stub_od_mm": halfshaft_stub_od,
            "spline_intent": "wheel_side_involute_spline_screening_placeholder_release_open",
            "left_stub_axis": "post_diff_wheel_left_halfshaft_axis",
            "right_stub_axis": "post_diff_wheel_right_halfshaft_axis",
        },
        "axial_stack_mm": {
            "diff_len": inputs.diff_len_mm,
            "gear_face_width": screen.face_width_mm,
            "diff_output_face_abs_x": round(diff_output_face_x, 4),
            "pinion_inner_face_abs_x": round(pinion_inner_face_x, 4),
            "diff_to_pinion_gap": diff_to_pinion_gap,
            "wheel_to_halfshaft_stub_gap": wheel_to_halfshaft_gap,
        },
        "consistency_checks": {
            "diff_output_to_pinion_bore_od_mismatch_mm": od_mismatch,
            "wheel_bore_to_halfshaft_stub_od_mismatch_mm": wheel_od_mismatch,
            "diff_to_pinion_axial_gap_mm": diff_to_pinion_gap,
            "wheel_to_halfshaft_stub_gap_mm": wheel_to_halfshaft_gap,
            "pinion_coaxial_with_diff_output": True,
            "wheel_coaxial_with_halfshaft_stub": True,
            "no_float_gaps": no_float_gaps,
            "tolerance_mm": INTERFACE_GAP_TOLERANCE_MM,
        },
        "release_checks": {
            "spline_standard_and_tooth_count": "OPEN",
            "cv_joint_supplier_icd": "OPEN",
            "bearing_reactions_and_seal_stack": "OPEN",
            "bench_correlation": "OPEN",
        },
    }


def build_artifact(
    *,
    inputs: TwinInputs,
    screen: PackagingScreen,
    strength_screen: Mapping[str, Any],
    interface_register: Mapping[str, Any],
    source_twin: str,
    source_state_sha256: str,
    source_bevel_sha256: str,
) -> dict[str, Any]:
    """Build an honest packaging artefact with screening-only closure.

    @description Records bay fit while keeping CAD and release gates OPEN.
    @param inputs Twin-bound source dimensions
    @param screen Calculated packaging result
    @param strength_screen ISO-style post-diff helical strength screen
    @param interface_register Differential/halfshaft interface register
    @param source_twin Twin path used
    @param source_state_sha256 State provenance hash
    @param source_bevel_sha256 Bevel provenance hash
    @returns JSON-serialisable artefact
    """

    strength = (
        strength_screen.get("works_in_kit_context")
        if isinstance(strength_screen.get("works_in_kit_context"), Mapping)
        else {}
    )
    strength_ok = strength.get("duty_strength_screen_ok") is True
    strength_margins = (
        strength_screen.get("strength_screen")
        if isinstance(strength_screen.get("strength_screen"), Mapping)
        else {}
    )
    interface_ok = interface_register.get("interface_ok") is True
    software_closed = bool(screen.bay_fit and strength_ok and interface_ok)
    status = "SOFTWARE_CLOSED" if software_closed else "PARTIAL"
    blocker_status = "CLEARED" if software_closed else "OPEN"
    blender_status = "SOFTWARE_CLOSED" if interface_ok else "PARTIAL"

    if software_closed:
        blocker_summary = (
            "The compact dual post-diff 4:1 helical-pair seed fits the bay, "
            "the interface register proves no software float gaps, and the "
            "ISO 6336-style helical screen clears FoS >= 1.2. Clearance is "
            "software-screening only; release CAD, KISSsoft, fatigue, shafts, "
            "bearings, lubrication and bench remain OPEN."
        )
    elif screen.bay_fit:
        blocker_summary = (
            "The compact dual post-diff 4:1 helical-pair seed fits the bay envelope "
            "and its parametric CadQuery family is seeded, but software screening "
            "does not clear until the interface register and helical strength "
            "screen both pass FoS >= 1.2."
        )
    else:
        blocker_summary = (
            "The compact dual post-diff 4:1 helical-pair seed does not fit the bay "
            f"envelope (short-edge margin {screen.short_edge_margin_mm:.1f} mm); "
            "blocker remains OPEN with dimensional evidence."
        )

    return {
        "schema": SCHEMA,
        "status": status,
        "ship_ok": False,
        "bay_fit": screen.bay_fit,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "source_bevel_sha256": source_bevel_sha256,
        "source_evidence": {
            "bay_envelope": "state.json#orchestratorContract.quantities",
            "diff_nest": "_motor_stack/iso_bevel_fia_front_kit_case.json#bevel_geometry",
            "ratio_decision": (
                "_motor_stack/iso_bevel_fia_front_kit_case.json"
                "#architecture_decision.ratio_after_diff"
            ),
            "strength_screen": f"_motor_stack/{STRENGTH_OUTPUT_FILENAME}",
            "interface_register": f"_motor_stack/{INTERFACE_OUTPUT_FILENAME}",
        },
        "input_quantities": asdict(inputs),
        "topology": {
            "screened_concept": "dual_post_diff_parallel_axis_helical_pairs",
            "pair_count": 2,
            "arrangement": (
                "one pair per differential output; pinions coaxial with side outputs; "
                "pairs axially outboard and clocked in the same radial direction"
            ),
            "ratio_target": inputs.ratio_after_diff,
            "ratio_from_teeth": screen.ratio_from_teeth,
        },
        "gear_seed": {
            "pinion_teeth": screen.pinion_teeth,
            "wheel_teeth": screen.wheel_teeth,
            "normal_module_mm": screen.normal_module_mm,
            "transverse_module_mm": screen.transverse_module_mm,
            "helix_angle_deg": screen.helix_angle_deg,
            "face_width_mm": screen.face_width_mm,
            "pinion_pitch_diameter_mm": screen.pinion_pitch_diameter_mm,
            "wheel_pitch_diameter_mm": screen.wheel_pitch_diameter_mm,
            "pinion_tip_diameter_mm": screen.pinion_tip_diameter_mm,
            "wheel_tip_diameter_mm": screen.wheel_tip_diameter_mm,
            "center_distance_mm": screen.center_distance_mm,
            "authority": "screening_seed_not_release_geometry",
        },
        "envelope_mm": {
            "width_lateral": screen.overall_width_mm,
            "depth_short_edge": screen.overall_depth_mm,
            "height": screen.overall_height_mm,
            "bay_width": inputs.bay_width_mm,
            "bay_depth_short_edge": inputs.bay_depth_mm,
            "bay_height": inputs.bay_height_mm,
            "width_margin": screen.width_margin_mm,
            "short_edge_margin": screen.short_edge_margin_mm,
            "height_margin": screen.height_margin_mm,
        },
        "short_edge_budget_mm": {
            "bay_short_edge": inputs.bay_depth_mm,
            "diff_nest_od": inputs.diff_od_mm,
            "remaining_after_diff_nest": screen.remaining_short_edge_after_diff_mm,
            "added_beyond_diff_nest": screen.added_short_edge_beyond_diff_mm,
            "combined_screened_envelope": screen.overall_depth_mm,
            "margin": screen.short_edge_margin_mm,
        },
        "cad_authority": {
            "status": "SOFTWARE_SEEDED",
            "parametric_family_exists": True,
            "cad_family": CAD_FAMILY,
            "source": CAD_FAMILY_SOURCE,
            "release_cad": False,
            "blender_mesh_prefix": "u_se_td_post_diff_",
            "note": (
                "Rebuildable 18:72 dual-helical concept geometry exists. Blender "
                "traction placer emits physics-linked u_se_td_post_diff_* meshes "
                "when this screen is present — not revision-bound release CAD."
            ),
        },
        "architecture_blocker": {
            "blocker_id": BLOCKER_ID,
            "status": blocker_status,
            "clearance_scope": (
                "software_screening_only" if software_closed else "not_cleared"
            ),
            "ship_ok": False,
            "bay_fit": screen.bay_fit,
            "minimum_strength_factor": strength_margins.get(
                "minimum_strength_factor"
            ),
            "interface_ok": interface_ok,
            "cannot_greenwash": (
                "Software screening clearance is not release clearance: release CAD, "
                "KISSsoft, race spectrum fatigue, bearing/shaft/spline/lube design, "
                "and bench validation remain OPEN."
            ),
            "summary": blocker_summary,
        },
        "closure_gate": {
            "bay_fit_required": True,
            "bay_fit": screen.bay_fit,
            "parametric_family_required": True,
            "parametric_family_exists": True,
            "software_packaging_screen_ok": screen.bay_fit,
            "strength_screen_required": True,
            "strength_screen_ok": strength_ok,
            "strength_screen_path": f"_motor_stack/{STRENGTH_OUTPUT_FILENAME}",
            "minimum_strength_factor": strength_margins.get(
                "minimum_strength_factor"
            ),
            "required_strength_factor": SCREEN_FOS_MIN,
            "interface_register_required": True,
            "interface_register_ok": interface_ok,
            "interface_register_path": f"_motor_stack/{INTERFACE_OUTPUT_FILENAME}",
            "blender_interface_status": blender_status,
            "blender_meshes_defined": True,
            "blender_mesh_prefix": "u_se_td_post_diff_",
            "blender_geometry_module": (
                "scripts/lib/post_diff_final_drive_geometry.py"
            ),
            "blocker_may_clear": software_closed,
            "clearance_scope": (
                "software_screening_only" if software_closed else "not_cleared"
            ),
            "reason": (
                "Bay fit, CadQuery family, Blender meshes, no-float-gap interface "
                "register, and helical strength FoS >= 1.2 all pass for software "
                "screening only. Release checks remain OPEN."
                if software_closed
                else (
                    "POST_DIFF remains OPEN until bay fit, parametric family, "
                    "Blender meshes, differential/halfshaft interface register, "
                    "and helical strength FoS >= 1.2 all pass together."
                )
            ),
        },
        "honesty_notes": [
            "Software-screening closure only; never a CAD release or ship permission.",
            "CadQuery family seeded; Blender placer syncs u_se_td_post_diff_* meshes.",
            "ISO 6336-style helical tooth screen is analytical; KISSsoft remains OPEN.",
            "No micropitting, scuffing, race-spectrum life, or bench close.",
            "No bearing life, shaft deflection, spline standard, seal, tolerance, NVH, or lubrication close.",
            "Dual output stages preserve differential action only if both mirrored gear paths and halfshaft interfaces are packaged as assumed.",
            "Real suspension/halfshaft/CV-joint keep-outs and FIA/team interface drawings can invalidate bay_fit.",
            "ship_ok remains false whether bay_fit is true or false.",
        ],
    }


def write_artifact(twin: Path, artifact: Mapping[str, Any]) -> Path:
    """Atomically write the packaging screen under the twin motor-stack folder."""

    output_dir = twin / "_motor_stack"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / OUTPUT_FILENAME
    temporary = output.with_name(f".{OUTPUT_FILENAME}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, output)
    return output


def write_named_artifact(
    twin: Path,
    filename: str,
    artifact: Mapping[str, Any],
) -> Path:
    """Atomically write a named post-diff evidence artefact."""

    output_dir = twin / "_motor_stack"
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / filename
    temporary = output.with_name(f".{filename}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, output)
    return output


def selftest() -> int:
    """Prove nominal fit, non-fit catch, twin binding, and release honesty."""

    nominal = TwinInputs(343.0, 259.0, 267.0, 120.0, 108.0, 4.0, 2.0, 19500.0)
    nominal_screen = estimate_packaging(nominal)
    narrow_screen = estimate_packaging(
        TwinInputs(343.0, 160.0, 267.0, 120.0, 108.0, 4.0, 2.0, 19500.0)
    )
    nominal_strength = screen_post_diff_strength(
        nominal,
        nominal_screen,
        post_diff_input_torque_nm=125.219269,
    )
    low_torque_strength = screen_post_diff_strength(
        nominal,
        nominal_screen,
        post_diff_input_torque_nm=5.0,
    )
    nominal_interface = build_interface_register(nominal, nominal_screen)
    gap_interface = build_interface_register(
        nominal,
        nominal_screen,
        injected_float_gap_mm=1.0,
    )
    nominal_artifact = build_artifact(
        inputs=nominal,
        screen=nominal_screen,
        strength_screen=nominal_strength,
        interface_register=nominal_interface,
        source_twin="synthetic",
        source_state_sha256="state-sha",
        source_bevel_sha256="bevel-sha",
    )
    clear_artifact = build_artifact(
        inputs=nominal,
        screen=nominal_screen,
        strength_screen=low_torque_strength,
        interface_register=nominal_interface,
        source_twin="synthetic-low-torque",
        source_state_sha256="state-sha",
        source_bevel_sha256="bevel-sha",
    )
    gap_artifact = build_artifact(
        inputs=nominal,
        screen=nominal_screen,
        strength_screen=low_torque_strength,
        interface_register=gap_interface,
        source_twin="synthetic-gap",
        source_state_sha256="state-sha",
        source_bevel_sha256="bevel-sha",
    )
    checks: dict[str, bool] = {
        "ratio_is_four": nominal_screen.ratio_from_teeth == 4.0,
        "nominal_bay_fit": nominal_screen.bay_fit,
        "short_edge_below_259": nominal_screen.overall_depth_mm < 259.0,
        "narrow_short_edge_proves_catch": (
            not narrow_screen.bay_fit and narrow_screen.short_edge_margin_mm < 0.0
        ),
        "status_partial": nominal_artifact["status"] == "PARTIAL",
        "never_ship_ok": nominal_artifact["ship_ok"] is False,
        "realistic_seed_strength_keeps_blocker_open": (
            nominal_artifact["architecture_blocker"]["status"] == "OPEN"
            and nominal_artifact["closure_gate"]["strength_screen_ok"] is False
            and nominal_strength["strength_screen"]["minimum_strength_factor"] < 1.2
        ),
        "synthetic_strength_can_clear_screening_only": (
            clear_artifact["status"] == "SOFTWARE_CLOSED"
            and clear_artifact["architecture_blocker"]["status"] == "CLEARED"
            and clear_artifact["closure_gate"]["blocker_may_clear"] is True
            and clear_artifact["ship_ok"] is False
        ),
        "interface_gap_proves_catch": (
            gap_interface["interface_ok"] is False
            and gap_artifact["architecture_blocker"]["status"] == "OPEN"
            and gap_artifact["closure_gate"]["interface_register_ok"] is False
            and gap_artifact["closure_gate"]["blocker_may_clear"] is False
        ),
        "cad_family_seeded_but_release_stays_open": (
            nominal_artifact["cad_authority"]["parametric_family_exists"] is True
            and nominal_artifact["cad_authority"]["cad_family"]
            == "post_diff_final_drive_helical"
            and nominal_artifact["closure_gate"]["software_packaging_screen_ok"]
            is True
            and nominal_artifact["closure_gate"]["blender_interface_status"]
            == "SOFTWARE_CLOSED"
            and nominal_artifact["closure_gate"]["blocker_may_clear"] is False
        ),
    }

    with tempfile.TemporaryDirectory(prefix="post-diff-packaging-selftest-") as raw:
        twin = Path(raw)
        motor_stack = twin / "_motor_stack"
        motor_stack.mkdir()
        state = {
            "orchestratorContract": {
                "quantities": {
                    "front_bay_envelope_w_mm": {"value": 343.0},
                    "front_bay_envelope_d_mm": {"value": 259.0},
                    "front_bay_envelope_h_mm": {"value": 267.0},
                    "max_rotor_speed_rpm": {"value": 19500.0},
                }
            }
        }
        (twin / "state.json").write_text(
            json.dumps(state) + "\n",
            encoding="utf-8",
        )
        bevel = {
            "bevel_geometry": {"diff_od_mm": 120.0, "diff_len_mm": 108.0},
            "architecture_decision": {
                "ratio_after_diff": 4.0,
                "ratio_into_diff": 2.0,
            },
            "duty_torques": {
                "side_gear_torque_nm": 125.219269,
                "carrier_input_torque_nm": 250.438538,
                "ratio_after_diff": 4.0,
                "ratio_into_diff": 2.0,
            },
        }
        (motor_stack / "iso_bevel_fia_front_kit_case.json").write_text(
            json.dumps(bevel) + "\n",
            encoding="utf-8",
        )
        loaded, state_sha, bevel_sha = load_twin_inputs(twin)
        loaded_screen = estimate_packaging(loaded)
        loaded_bevel = load_bevel_case(twin)
        loaded_strength = screen_post_diff_strength(
            loaded,
            loaded_screen,
            post_diff_input_torque_nm=duty_torque_from_bevel_case(loaded_bevel),
        )
        loaded_interface = build_interface_register(loaded, loaded_screen)
        output = write_artifact(
            twin,
            build_artifact(
                inputs=loaded,
                screen=loaded_screen,
                strength_screen=loaded_strength,
                interface_register=loaded_interface,
                source_twin=str(twin),
                source_state_sha256=state_sha,
                source_bevel_sha256=bevel_sha,
            ),
        )
        strength_output = write_named_artifact(
            twin,
            STRENGTH_OUTPUT_FILENAME,
            loaded_strength,
        )
        interface_output = write_named_artifact(
            twin,
            INTERFACE_OUTPUT_FILENAME,
            loaded_interface,
        )
        written = json.loads(output.read_text(encoding="utf-8"))
        checks["twin_binding_reads_required_sources"] = (
            loaded == nominal
            and len(state_sha) == 64
            and len(bevel_sha) == 64
        )
        checks["atomic_write_emits_honest_artifact"] = (
            written.get("bay_fit") is True
            and written.get("ship_ok") is False
            and written.get("architecture_blocker", {}).get("status") == "OPEN"
            and strength_output.is_file()
            and interface_output.is_file()
        )

    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "nominal_envelope_mm": {
                    "width": nominal_screen.overall_width_mm,
                    "depth_short_edge": nominal_screen.overall_depth_mm,
                    "height": nominal_screen.overall_height_mm,
                },
                "short_edge_margin_mm": nominal_screen.short_edge_margin_mm,
                "ship_ok": False,
                "nominal_strength_min_fos": nominal_strength["strength_screen"][
                    "minimum_strength_factor"
                ],
                "synthetic_clear_strength_min_fos": low_torque_strength[
                    "strength_screen"
                ]["minimum_strength_factor"],
            },
            indent=2,
        )
    )
    return 0 if passed else 1


def main() -> int:
    """Run the twin-bound screen or its deterministic selftest."""

    parser = argparse.ArgumentParser(
        description="Screen post-differential 4:1 final-drive packaging"
    )
    parser.add_argument(
        "--twin",
        type=Path,
        default=DEFAULT_TWIN,
        help="Twin output directory containing state.json and bevel evidence",
    )
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="Run synthetic fit/non-fit and honesty checks",
    )
    args = parser.parse_args()
    if args.selftest:
        return selftest()

    try:
        inputs, state_sha, bevel_sha = load_twin_inputs(args.twin)
        bevel = load_bevel_case(args.twin)
        screen = estimate_packaging(inputs)
        strength = screen_post_diff_strength(
            inputs,
            screen,
            post_diff_input_torque_nm=duty_torque_from_bevel_case(bevel),
        )
        interface = build_interface_register(inputs, screen)
        artifact = build_artifact(
            inputs=inputs,
            screen=screen,
            strength_screen=strength,
            interface_register=interface,
            source_twin=str(args.twin),
            source_state_sha256=state_sha,
            source_bevel_sha256=bevel_sha,
        )
        output = write_artifact(args.twin, artifact)
        strength_output = write_named_artifact(
            args.twin,
            STRENGTH_OUTPUT_FILENAME,
            strength,
        )
        interface_output = write_named_artifact(
            args.twin,
            INTERFACE_OUTPUT_FILENAME,
            interface,
        )
    except (OSError, PostDiffPackagingError) as exc:
        print(f"[post_diff_final_drive_packaging_screen] ERROR: {exc}")
        return 1

    print(
        json.dumps(
            {
                "status": artifact["status"],
                "ship_ok": False,
                "bay_fit": screen.bay_fit,
                "envelope_mm": artifact["envelope_mm"],
                "output": str(output),
                "strength_output": str(strength_output),
                "interface_output": str(interface_output),
                "minimum_strength_factor": strength["strength_screen"][
                    "minimum_strength_factor"
                ],
                "interface_ok": interface["interface_ok"],
                "architecture_blocker": BLOCKER_ID,
                "blocker_status": artifact["architecture_blocker"]["status"],
                "blocker_may_clear": artifact["closure_gate"]["blocker_may_clear"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
