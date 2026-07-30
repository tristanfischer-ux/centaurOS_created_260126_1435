#!/usr/bin/env python3
"""Post-differential final-drive placement — packaging screen → Blender mm.

INTENT: The ``ratio_after_diff≈4`` helical stage must not be a silent gap between
the bevel differential nest and the output shafts. Mirror ``fpk_concentric_geometry``:
packaging-screen gear seed + diff nest dimensions → deterministic pinion/wheel
placement for ``u_se_td_post_diff_*`` story meshes.

Run: python3 scripts/lib/post_diff_final_drive_geometry.py --selftest
"""
from __future__ import annotations

import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Optional


# Screening seed — must match post_diff_final_drive_packaging_screen.py / CadQuery family.
DEFAULT_PINION_TEETH = 18
DEFAULT_WHEEL_TEETH = 72
DEFAULT_NORMAL_MODULE_MM = 1.15
DEFAULT_HELIX_ANGLE_DEG = 20.0
DEFAULT_FACE_WIDTH_MM = 22.0
DEFAULT_RATIO_AFTER_DIFF = 4.0
DEFAULT_RATIO_TOLERANCE = 0.10
BEARING_AXIAL_ALLOWANCE_MM = 14.0
CASE_WALL_AXIAL_MM = 6.0


@dataclass(frozen=True)
class PostDiffFinalDriveParams:
    """Inputs bound to twin bevel + packaging screen."""

    diff_od_mm: float
    diff_len_mm: float
    ratio_after_diff: float
    pinion_teeth: int
    wheel_teeth: int
    normal_module_mm: float
    helix_angle_deg: float
    face_width_mm: float


@dataclass(frozen=True)
class PostDiffFinalDrivePlacement:
    """Derived mesh placement for one dual-pair stage (both axle outputs)."""

    ratio_from_teeth: float
    transverse_module_mm: float
    center_distance_mm: float
    pinion_pitch_diameter_mm: float
    wheel_pitch_diameter_mm: float
    pinion_tip_diameter_mm: float
    wheel_tip_diameter_mm: float
    face_width_mm: float
    pair_axial_offset_mm: float
    wheel_radial_offset_mm: float
    overall_width_mm: float
    overall_depth_mm: float
    overall_height_mm: float
    cad_family: str = "post_diff_final_drive_helical"


def _num(raw: Any, default: float = 0.0) -> float:
    if isinstance(raw, Mapping):
        raw = raw.get("value")
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    return value if math.isfinite(value) else default


def _int_num(raw: Any, default: int) -> int:
    value = _num(raw, float(default))
    return int(round(value))


def params_from_packaging_screen(
    screen: Mapping[str, Any],
) -> Optional[PostDiffFinalDriveParams]:
    """Build params from a twin-bound packaging screen artefact."""

    inputs = screen.get("input_quantities")
    if not isinstance(inputs, Mapping):
        return None
    gear = screen.get("gear_seed")
    if not isinstance(gear, Mapping):
        gear = {}
    ratio_after_diff = _num(
        inputs.get("ratio_after_diff"),
        DEFAULT_RATIO_AFTER_DIFF,
    )
    if ratio_after_diff <= 1.0:
        return None
    pinion_teeth = _int_num(gear.get("pinion_teeth"), DEFAULT_PINION_TEETH)
    wheel_teeth = _int_num(gear.get("wheel_teeth"), DEFAULT_WHEEL_TEETH)
    return PostDiffFinalDriveParams(
        diff_od_mm=_num(inputs.get("diff_od_mm"), 120.0),
        diff_len_mm=_num(inputs.get("diff_len_mm"), 108.0),
        ratio_after_diff=ratio_after_diff,
        pinion_teeth=pinion_teeth,
        wheel_teeth=wheel_teeth,
        normal_module_mm=_num(gear.get("normal_module_mm"), DEFAULT_NORMAL_MODULE_MM),
        helix_angle_deg=_num(gear.get("helix_angle_deg"), DEFAULT_HELIX_ANGLE_DEG),
        face_width_mm=_num(gear.get("face_width_mm"), DEFAULT_FACE_WIDTH_MM),
    )


def params_from_bevel_and_defaults(
    bevel: Mapping[str, Any],
    *,
    diff_od_mm: float,
    diff_len_mm: float,
) -> Optional[PostDiffFinalDriveParams]:
    """Fallback when the packaging screen file is absent but bevel cites ratio."""

    ratio_after_diff = 0.0
    for path in (
        ("residual_blocker", "ratio_after_diff"),
        ("architecture_decision", "ratio_after_diff"),
        ("duty_torques", "ratio_after_diff"),
    ):
        node: Any = bevel
        for key in path:
            if not isinstance(node, Mapping):
                node = None
                break
            node = node.get(key)
        candidate = _num(node, 0.0)
        if candidate > 1.0:
            ratio_after_diff = candidate
            break
    if ratio_after_diff <= 1.0:
        return None
    return PostDiffFinalDriveParams(
        diff_od_mm=diff_od_mm,
        diff_len_mm=diff_len_mm,
        ratio_after_diff=ratio_after_diff,
        pinion_teeth=DEFAULT_PINION_TEETH,
        wheel_teeth=DEFAULT_WHEEL_TEETH,
        normal_module_mm=DEFAULT_NORMAL_MODULE_MM,
        helix_angle_deg=DEFAULT_HELIX_ANGLE_DEG,
        face_width_mm=DEFAULT_FACE_WIDTH_MM,
    )


def derive_placement(p: PostDiffFinalDriveParams) -> PostDiffFinalDrivePlacement:
    """Compute tooth diameters and Blender offsets from screening seed."""

    ratio = p.wheel_teeth / p.pinion_teeth
    if abs(ratio - p.ratio_after_diff) > DEFAULT_RATIO_TOLERANCE:
        raise ValueError(
            f"tooth ratio {ratio:.4f} does not match ratio_after_diff "
            f"{p.ratio_after_diff:.4f}"
        )
    transverse_module = p.normal_module_mm / math.cos(math.radians(p.helix_angle_deg))
    pinion_pitch = p.pinion_teeth * transverse_module
    wheel_pitch = p.wheel_teeth * transverse_module
    pinion_tip = pinion_pitch + 2.0 * p.normal_module_mm
    wheel_tip = wheel_pitch + 2.0 * p.normal_module_mm
    center_distance = 0.5 * (pinion_pitch + wheel_pitch)
    radial_negative_edge = p.diff_od_mm / 2.0
    radial_positive_edge = max(
        p.diff_od_mm / 2.0,
        center_distance + wheel_tip / 2.0,
    )
    overall_depth = radial_negative_edge + radial_positive_edge + 12.0
    overall_height = max(p.diff_od_mm, pinion_tip, wheel_tip) + 12.0
    overall_width = p.diff_len_mm + 2.0 * (
        p.face_width_mm + BEARING_AXIAL_ALLOWANCE_MM + CASE_WALL_AXIAL_MM
    )
    pair_axial_offset = p.diff_len_mm / 2.0 + p.face_width_mm / 2.0
    return PostDiffFinalDrivePlacement(
        ratio_from_teeth=round(ratio, 6),
        transverse_module_mm=round(transverse_module, 4),
        center_distance_mm=round(center_distance, 4),
        pinion_pitch_diameter_mm=round(pinion_pitch, 4),
        wheel_pitch_diameter_mm=round(wheel_pitch, 4),
        pinion_tip_diameter_mm=round(pinion_tip, 4),
        wheel_tip_diameter_mm=round(wheel_tip, 4),
        face_width_mm=p.face_width_mm,
        pair_axial_offset_mm=round(pair_axial_offset, 4),
        wheel_radial_offset_mm=round(center_distance, 4),
        overall_width_mm=round(overall_width, 4),
        overall_depth_mm=round(overall_depth, 4),
        overall_height_mm=round(overall_height, 4),
    )


def load_placement_from_twin_motor_stack(
    motor_stack_dir: Path,
    *,
    diff_od_mm: float,
    diff_len_mm: float,
) -> Optional[PostDiffFinalDrivePlacement]:
    """Load packaging screen + bevel evidence from a twin ``_motor_stack`` folder."""

    screen_path = motor_stack_dir / "post_diff_final_drive_packaging_screen.json"
    if screen_path.is_file():
        try:
            screen = json.loads(screen_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            screen = None
        if isinstance(screen, Mapping):
            params = params_from_packaging_screen(screen)
            if params is not None:
                return derive_placement(params)

    bevel_path = motor_stack_dir / "iso_bevel_fia_front_kit_case.json"
    if bevel_path.is_file():
        try:
            bevel = json.loads(bevel_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            bevel = None
        if isinstance(bevel, Mapping):
            geometry = (
                bevel.get("bevel_geometry")
                if isinstance(bevel.get("bevel_geometry"), Mapping)
                else {}
            )
            params = params_from_bevel_and_defaults(
                bevel,
                diff_od_mm=_num(geometry.get("diff_od_mm"), diff_od_mm),
                diff_len_mm=_num(geometry.get("diff_len_mm"), diff_len_mm),
            )
            if params is not None:
                return derive_placement(params)
    return None


def quantity_writeback(
    placement: PostDiffFinalDrivePlacement,
) -> dict[str, dict[str, Any]]:
    """Stamp contract quantities for Excel / motor multiphysics honesty."""

    def q(value: float, unit: str, detail: str) -> dict[str, Any]:
        return {
            "value": value,
            "unit": unit,
            "family": "length" if unit == "mm" else "dimensionless",
            "basis": "rated",
            "scope": "module",
            "source": "calculator",
            "source_detail": detail,
        }

    return {
        "post_diff_ratio_from_teeth": q(
            placement.ratio_from_teeth,
            "",
            "18:72 screening seed for ratio_after_diff≈4",
        ),
        "post_diff_center_distance_mm": q(
            placement.center_distance_mm,
            "mm",
            "helical pair centre distance from packaging screen",
        ),
        "post_diff_face_width_mm": q(
            placement.face_width_mm,
            "mm",
            "axial face width shared by pinion and wheel",
        ),
        "post_diff_envelope_width_mm": q(
            placement.overall_width_mm,
            "mm",
            "combined diff + dual helical-pair lateral envelope",
        ),
        "post_diff_envelope_depth_mm": q(
            placement.overall_depth_mm,
            "mm",
            "short-edge occupancy beyond diff nest OD",
        ),
        "post_diff_blender_mesh_prefix": {
            "value": "u_se_td_post_diff_",
            "unit": "",
            "family": "identifier",
            "basis": "rated",
            "scope": "module",
            "source": "calculator",
            "source_detail": (
                "Blender traction placer story meshes for the post-diff stage"
            ),
        },
    }


def _selftest() -> int:
    checks: dict[str, bool] = {}
    params = PostDiffFinalDriveParams(
        diff_od_mm=120.0,
        diff_len_mm=108.0,
        ratio_after_diff=4.0,
        pinion_teeth=18,
        wheel_teeth=72,
        normal_module_mm=1.15,
        helix_angle_deg=20.0,
        face_width_mm=22.0,
    )
    placement = derive_placement(params)
    checks["ratio_is_four"] = placement.ratio_from_teeth == 4.0
    checks["center_distance_positive"] = placement.center_distance_mm > 0.0
    checks["pair_offset_beyond_diff"] = (
        placement.pair_axial_offset_mm > params.diff_len_mm / 2.0
    )
    checks["wheel_offset_matches_center_distance"] = (
        placement.wheel_radial_offset_mm == placement.center_distance_mm
    )

    screen = {
        "input_quantities": {
            "diff_od_mm": 120.0,
            "diff_len_mm": 108.0,
            "ratio_after_diff": 4.0,
        },
        "gear_seed": {
            "pinion_teeth": 18,
            "wheel_teeth": 72,
            "normal_module_mm": 1.15,
            "helix_angle_deg": 20.0,
            "face_width_mm": 22.0,
        },
    }
    loaded = params_from_packaging_screen(screen)
    checks["screen_params_load"] = loaded == params
    checks["screen_placement_matches"] = derive_placement(loaded) == placement

    bevel = {
        "residual_blocker": {"ratio_after_diff": 4.0},
        "bevel_geometry": {"diff_od_mm": 120.0, "diff_len_mm": 108.0},
    }
    bevel_params = params_from_bevel_and_defaults(
        bevel,
        diff_od_mm=120.0,
        diff_len_mm=108.0,
    )
    checks["bevel_fallback_params"] = bevel_params == params

    wb = quantity_writeback(placement)
    checks["writeback_has_mesh_prefix"] = (
        wb["post_diff_blender_mesh_prefix"]["value"] == "u_se_td_post_diff_"
    )

    try:
        bad = PostDiffFinalDriveParams(
            diff_od_mm=120.0,
            diff_len_mm=108.0,
            ratio_after_diff=3.0,
            pinion_teeth=18,
            wheel_teeth=72,
            normal_module_mm=1.15,
            helix_angle_deg=20.0,
            face_width_mm=22.0,
        )
        derive_placement(bad)
        checks["ratio_mismatch_raises"] = False
    except ValueError:
        checks["ratio_mismatch_raises"] = True

    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "placement": asdict(placement),
            },
            indent=2,
        )
    )
    return 0 if passed else 1


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    print("usage: python3 scripts/lib/post_diff_final_drive_geometry.py --selftest")
    raise SystemExit(1)
