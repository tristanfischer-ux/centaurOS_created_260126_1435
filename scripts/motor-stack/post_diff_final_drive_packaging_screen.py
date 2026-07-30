#!/usr/bin/env python3
"""Twin-bound post-differential final-drive packaging SCREEN.

INTENT: Test whether the selected ``ratio_after_diff≈4`` architecture can fit
two compact parallel-axis gear pairs around the bevel differential inside the
Formula E front-kit bay. This is an envelope screen only: no tooth strength,
bearing life, shaft, lubrication, tolerance, noise, or release-CAD claim.

DECISION: Model one helical 18:72 pair on each differential output, with both
pairs axially outboard of the differential and clocked in the same radial
direction. The calculation exposes the extra short-edge occupancy beyond the
diff nest instead of pretending the two envelopes can be assessed separately.
``status`` is always PARTIAL and ``ship_ok`` is always false.
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
SCHEMA = "forgeos.motor_stack.post_diff_final_drive_packaging_screen/v1"
BLOCKER_ID = "POST_DIFF_FINAL_DRIVE_PACKAGING"

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
    )
    if abs(inputs.ratio_after_diff - (WHEEL_TEETH / PINION_TEETH)) > RATIO_TOLERANCE:
        raise PostDiffPackagingError(
            "Selected 18:72 screen does not represent ratio_after_diff "
            f"{inputs.ratio_after_diff:.3f}"
        )
    return inputs, _stream_sha256(state_path), _stream_sha256(bevel_path)


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


def build_artifact(
    *,
    inputs: TwinInputs,
    screen: PackagingScreen,
    source_twin: str,
    source_state_sha256: str,
    source_bevel_sha256: str,
) -> dict[str, Any]:
    """Build an honest PARTIAL packaging artefact.

    @description Records bay fit while keeping CAD and release gates OPEN.
    @param inputs Twin-bound source dimensions
    @param screen Calculated packaging result
    @param source_twin Twin path used
    @param source_state_sha256 State provenance hash
    @param source_bevel_sha256 Bevel provenance hash
    @returns JSON-serialisable artefact
    """

    if screen.bay_fit:
        blocker_summary = (
            "The compact dual post-diff 4:1 helical-pair seed fits the bay envelope "
            "as a first packaging screen, but no parametric family or released "
            "gear/bearing/shaft/lubrication design exists; blocker remains OPEN."
        )
    else:
        blocker_summary = (
            "The compact dual post-diff 4:1 helical-pair seed does not fit the bay "
            f"envelope (short-edge margin {screen.short_edge_margin_mm:.1f} mm); "
            "blocker remains OPEN with dimensional evidence."
        )

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
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
            "status": "OPEN",
            "parametric_family_exists": False,
            "cad_family": None,
            "release_cad": False,
            "note": (
                "No CadQuery family is claimed. The dimensions are an analytical "
                "rectangular envelope only."
            ),
        },
        "architecture_blocker": {
            "blocker_id": BLOCKER_ID,
            "status": "OPEN",
            "ship_ok": False,
            "bay_fit": screen.bay_fit,
            "summary": blocker_summary,
        },
        "closure_gate": {
            "bay_fit_required": True,
            "bay_fit": screen.bay_fit,
            "parametric_family_required": True,
            "parametric_family_exists": False,
            "blocker_may_clear": False,
            "reason": (
                "POST_DIFF blocker may clear only after bay_fit=true and a "
                "revision-bound parametric family exists; this artefact supplies "
                "only the first condition."
            ),
        },
        "honesty_notes": [
            "PARTIAL packaging screen only; never a CAD release or ship permission.",
            "No ISO 6336/AGMA tooth-strength, micropitting, scuffing, or spectrum life close.",
            "No bearing life, shaft deflection, spline, seal, tolerance, NVH, or lubrication close.",
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


def selftest() -> int:
    """Prove nominal fit, non-fit catch, twin binding, and release honesty."""

    nominal = TwinInputs(343.0, 259.0, 267.0, 120.0, 108.0, 4.0)
    nominal_screen = estimate_packaging(nominal)
    narrow_screen = estimate_packaging(
        TwinInputs(343.0, 160.0, 267.0, 120.0, 108.0, 4.0)
    )
    nominal_artifact = build_artifact(
        inputs=nominal,
        screen=nominal_screen,
        source_twin="synthetic",
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
        "blocker_stays_open": (
            nominal_artifact["architecture_blocker"]["status"] == "OPEN"
        ),
        "cad_family_stays_open": (
            nominal_artifact["cad_authority"]["parametric_family_exists"] is False
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
                }
            }
        }
        (twin / "state.json").write_text(
            json.dumps(state) + "\n",
            encoding="utf-8",
        )
        bevel = {
            "bevel_geometry": {"diff_od_mm": 120.0, "diff_len_mm": 108.0},
            "architecture_decision": {"ratio_after_diff": 4.0},
        }
        (motor_stack / "iso_bevel_fia_front_kit_case.json").write_text(
            json.dumps(bevel) + "\n",
            encoding="utf-8",
        )
        loaded, state_sha, bevel_sha = load_twin_inputs(twin)
        loaded_screen = estimate_packaging(loaded)
        output = write_artifact(
            twin,
            build_artifact(
                inputs=loaded,
                screen=loaded_screen,
                source_twin=str(twin),
                source_state_sha256=state_sha,
                source_bevel_sha256=bevel_sha,
            ),
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
        screen = estimate_packaging(inputs)
        artifact = build_artifact(
            inputs=inputs,
            screen=screen,
            source_twin=str(args.twin),
            source_state_sha256=state_sha,
            source_bevel_sha256=bevel_sha,
        )
        output = write_artifact(args.twin, artifact)
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
                "architecture_blocker": BLOCKER_ID,
                "blocker_status": "OPEN",
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
