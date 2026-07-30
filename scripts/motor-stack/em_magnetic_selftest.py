#!/usr/bin/env python3
"""Headless electromagnetic finite-element proof for the ForgeOS motor stack.

The proof loads the licensed Pyleecan IPMSM_B machine, asks Pyleecan to build
its full 2D cross-section, translates those exact regions to xfemm's native
``femmcli`` dialect, and solves the open-circuit magnetic field.  A second
near-zero-remanence solve proves the reported field is solver-derived rather
than a canned constant.

Run from the repository root:

    .venv-motor/bin/python scripts/motor-stack/em_magnetic_selftest.py --selftest
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import re
import shutil
import subprocess
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import pyleecan
from pyleecan.Functions.load import load


REPO_ROOT = Path(__file__).resolve().parents[2]
MACHINE_PATH = (
    REPO_ROOT
    / "assets"
    / "edu-training-cad"
    / "pyleecan-ipmsm-b"
    / "IPMSM_B.json"
)
PINNED_PYLEECAN_REVISION = "7937d675fb77701ac8f2c65816b583cb29270e12"
MODEL_SYMMETRY = 8
RESULT_RE = re.compile(
    r"FORGE_MOTOR_RESULT\s+([a-z0-9_]+)\s*=\s*"
    r"([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?\d+)?)"
)
MAGNET_LABEL_RE = re.compile(
    r"Rotor-\d+_HoleMag_R(?P<radial>\d+)-T(?P<tangential>\d+)-S(?P<pole>\d+)"
)


@dataclass(frozen=True)
class MachineEvidence:
    """Pyleecan geometry identity used by the finite-element solve."""

    machine_name: str
    machine_class: str
    stator_slots: int
    rotor_poles: int
    magnet_regions: int
    surface_regions: int
    rotor_outer_radius_mm: float
    stator_inner_radius_mm: float
    active_length_mm: float
    remanence_t: float
    input_sha256: str


@dataclass(frozen=True)
class MagneticResult:
    """Headline xfemm field values from one open-circuit solve."""

    peak_airgap_flux_density_t: float
    rms_airgap_flux_density_t: float
    mean_airgap_flux_density_t: float
    minimum_airgap_flux_density_t: float


class MagneticSelftestError(RuntimeError):
    """Raised when the magnetic proof cannot produce trustworthy evidence."""


def _solver_path() -> Path:
    """Return the native xfemm command-line solver used by this repository."""

    candidates = [
        os.environ.get("FEMMCLI"),
        str(REPO_ROOT / "scripts" / "phantm" / "bin" / "femmcli"),
        shutil.which("femmcli"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return Path(candidate).resolve()
    raise MagneticSelftestError(
        "femmcli not found. Build xfemm/cfemm and set FEMMCLI, or restore "
        "scripts/phantm/bin/femmcli."
    )


def _machine_evidence(machine: object) -> MachineEvidence:
    """Extract the controlled dimensions and identity used by the solve."""

    surfaces = machine.build_geometry(sym=1)
    magnet_regions = sum("HoleMag" in surface.label for surface in surfaces)
    return MachineEvidence(
        machine_name=machine.name,
        machine_class=type(machine).__name__,
        stator_slots=int(machine.stator.slot.Zs),
        rotor_poles=int(machine.rotor.hole[0].Zh),
        magnet_regions=magnet_regions,
        surface_regions=len(surfaces),
        rotor_outer_radius_mm=float(machine.rotor.Rext * 1_000.0),
        stator_inner_radius_mm=float(machine.stator.Rint * 1_000.0),
        active_length_mm=float(machine.comp_length_airgap_active() * 1_000.0),
        remanence_t=float(machine.rotor.hole[0].magnet_0.mat_type.mag.Brm20),
        input_sha256=hashlib.sha256(MACHINE_PATH.read_bytes()).hexdigest(),
    )


def _complex_key(point: complex) -> tuple[float, float]:
    """Create a stable key for deduplicating shared Pyleecan boundaries."""

    return round(float(point.real), 11), round(float(point.imag), 11)


def _line_key(line: object) -> tuple[object, ...]:
    """Create an orientation-independent identity for a Pyleecan line."""

    begin = _complex_key(line.get_begin())
    end = _complex_key(line.get_end())
    endpoints = tuple(sorted((begin, end)))
    if type(line).__name__ == "Segment":
        return ("segment", *endpoints)
    middle = _complex_key(line.get_middle())
    return ("arc", *endpoints, middle, round(abs(float(line.get_angle(is_deg=True))), 9))


def _draw_line_lua(line: object, scale: float = 1_000.0) -> list[str]:
    """Translate one Pyleecan Segment/Arc primitive to FEMM Lua."""

    begin = complex(line.get_begin()) * scale
    end = complex(line.get_end()) * scale
    if type(line).__name__ == "Segment":
        return [
            f"mi_addnode({begin.real:.12g},{begin.imag:.12g})",
            f"mi_addnode({end.real:.12g},{end.imag:.12g})",
            (
                f"mi_addsegment({begin.real:.12g},{begin.imag:.12g},"
                f"{end.real:.12g},{end.imag:.12g})"
            ),
        ]

    angle_deg = float(line.get_angle(is_deg=True))
    middle = complex(line.get_middle()) * scale
    if angle_deg < 0:
        begin, end = end, begin
        angle_deg = -angle_deg

    lines = [
        f"mi_addnode({begin.real:.12g},{begin.imag:.12g})",
        f"mi_addnode({end.real:.12g},{end.imag:.12g})",
    ]
    if angle_deg > 180.0:
        lines.append(f"mi_addnode({middle.real:.12g},{middle.imag:.12g})")
        lines.append(
            f"mi_addarc({begin.real:.12g},{begin.imag:.12g},"
            f"{middle.real:.12g},{middle.imag:.12g},{angle_deg / 2.0:.12g},2)"
        )
        lines.append(
            f"mi_addarc({middle.real:.12g},{middle.imag:.12g},"
            f"{end.real:.12g},{end.imag:.12g},{angle_deg / 2.0:.12g},2)"
        )
    else:
        lines.append(
            f"mi_addarc({begin.real:.12g},{begin.imag:.12g},"
            f"{end.real:.12g},{end.imag:.12g},{angle_deg:.12g},2)"
        )
    return lines


def _iter_unique_lines(surfaces: Iterable[object]) -> Iterable[object]:
    """Yield each shared machine boundary exactly once."""

    seen: set[tuple[object, ...]] = set()
    for surface in surfaces:
        for line in surface.get_lines():
            key = _line_key(line)
            if key not in seen:
                seen.add(key)
                yield line


def _magnetization_angle_deg(machine: object, label: str, point: complex) -> float:
    """Reproduce Pyleecan's parallel V-magnet direction for a labelled region."""

    match = MAGNET_LABEL_RE.fullmatch(label)
    if match is None:
        raise MagneticSelftestError(f"Unrecognised magnet surface label: {label}")
    radial_id = int(match.group("radial"))
    tangential_id = int(match.group("tangential"))
    pole_id = int(match.group("pole"))
    hole = machine.rotor.hole[radial_id]
    pole_pitch_deg = 360.0 / float(hole.Zh)
    point_angle_deg = math.degrees(math.atan2(point.imag, point.real)) % 360.0
    pole_mid_deg = (math.floor(point_angle_deg / pole_pitch_deg) + 0.5) * pole_pitch_deg
    local_angle_rad = hole.comp_magnetization_dict()[f"magnet_{tangential_id}"]
    direction_deg = pole_mid_deg + math.degrees(float(local_angle_rad))
    if pole_id % 2 == 1:
        direction_deg += 180.0
    return direction_deg % 360.0


def _surface_material(machine: object, surface: object) -> tuple[str, float, int, float]:
    """Return material, mesh size, group, and magnet angle for one region."""

    label = surface.label or ""
    if "HoleMag" in label:
        return (
            "ndfeb",
            0.45,
            4,
            _magnetization_angle_deg(machine, label, complex(surface.point_ref)),
        )
    if "HoleVoid" in label:
        return "air", 0.45, 5, 0.0
    if "Winding" in label:
        return "copper", 0.8, 3, 0.0
    if "Stator" in label:
        return "m400", 1.2, 2, 0.0
    if "Rotor" in label or "Shaft" in label:
        return "m400", 1.0, 1, 0.0
    raise MagneticSelftestError(f"No FEM material mapping for Pyleecan surface: {label}")


def _build_lua(machine: object, remanence_t: float, fem_name: str) -> str:
    """Build a complete native xfemm Lua model from Pyleecan surfaces."""

    # DECISION: Solve one exact pole sector with anti-periodic boundaries.
    # The full 48-slot model is the production torque-map path; a one-pole
    # sector preserves the magnetic solution while keeping this proof quick.
    surfaces = machine.build_geometry(sym=MODEL_SYMMETRY)
    active_length_mm = float(machine.comp_length_airgap_active() * 1_000.0)
    rotor_radius_mm = float(machine.rotor.Rext * 1_000.0)
    stator_inner_mm = float(machine.stator.Rint * 1_000.0)
    stator_outer_mm = float(machine.stator.Rext * 1_000.0)
    airgap_probe_radius_mm = (rotor_radius_mm + stator_inner_mm) / 2.0
    magnet = machine.rotor.hole[0].magnet_0.mat_type.mag
    magnet_mu_r = float(magnet.mur_lin)
    coercive_field_a_m = remanence_t / (4.0e-7 * math.pi * magnet_mu_r)

    # INTENT: The smoke test must exercise the same Pyleecan geometry/material
    # contract intended for later torque maps, while remaining small enough to
    # run on every developer Mac.
    lua = [
        "show_console()",
        "newdocument(0)",
        (
            f'mi_probdef(0,"millimeters","planar",1e-8,'
            f"{active_length_mm:.12g},30)"
        ),
        'mi_addmaterial("air",1,1,0,0,0,0,0,1,0,0,0)',
        'mi_addmaterial("copper",1,1,0,0,0,0,0,1,0,0,0)',
        'mi_addmaterial("m400",2500,2500,0,0,0,0,0,0.95,0,0,0)',
        (
            f'mi_addmaterial("ndfeb",{magnet_mu_r:.12g},{magnet_mu_r:.12g},'
            f"{coercive_field_a_m:.12g},0,0,0,0,1,0,0,0)"
        ),
    ]

    bh_curve = machine.stator.mat_type.mag.BH_curve.get_data()
    for h_a_m, b_t in bh_curve:
        lua.append(f'mi_addbhpoint("m400",{float(b_t):.12g},{float(h_a_m):.12g})')

    for line in _iter_unique_lines(surfaces):
        lua.extend(_draw_line_lua(line))

    lua.append('mi_addboundprop("A0",0,0,0,0,0,0,0,0,0)')
    for boundary_name in ("anti_shaft", "anti_rotor", "anti_airgap", "anti_stator"):
        lua.append(
            f'mi_addboundprop("{boundary_name}",0,0,0,0,0,0,0,0,5)'
        )

    radial_boundaries = {
        "Shaft": "anti_shaft",
        "Rotor": "anti_rotor",
        "Stator": "anti_stator",
    }
    for surface in surfaces:
        boundary_name = next(
            (
                name
                for label_fragment, name in radial_boundaries.items()
                if label_fragment in (surface.label or "")
            ),
            None,
        )
        if boundary_name is None:
            continue
        for line in surface.get_lines():
            if type(line).__name__ != "Segment":
                continue
            begin = complex(line.get_begin())
            end = complex(line.get_end())
            if abs(begin) < 1.0e-12 or abs(end) < 1.0e-12:
                is_radial = True
            else:
                begin_angle = math.atan2(begin.imag, begin.real)
                end_angle = math.atan2(end.imag, end.real)
                is_radial = abs(math.sin(begin_angle - end_angle)) < 1.0e-9
            if is_radial:
                midpoint_mm = (begin + end) * 500.0
                lua.extend(
                    [
                        (
                            f"mi_selectsegment({midpoint_mm.real:.12g},"
                            f"{midpoint_mm.imag:.12g})"
                        ),
                        (
                            f'mi_setsegmentprop("{boundary_name}",0.5,0,0,0)'
                        ),
                        "mi_clearselected()",
                    ]
                )

    # Pyleecan's lamination surfaces stop at the rotor/stator faces. Close the
    # two radial sides of the mechanical air gap and pair them anti-periodically.
    sector_angle_rad = 2.0 * math.pi / MODEL_SYMMETRY
    airgap_radial_midpoints: list[complex] = []
    for side_angle in (0.0, sector_angle_rad):
        begin = complex(
            rotor_radius_mm * math.cos(side_angle),
            rotor_radius_mm * math.sin(side_angle),
        )
        end = complex(
            stator_inner_mm * math.cos(side_angle),
            stator_inner_mm * math.sin(side_angle),
        )
        midpoint = (begin + end) / 2.0
        airgap_radial_midpoints.append(midpoint)
        lua.extend(
            [
                f"mi_addnode({begin.real:.12g},{begin.imag:.12g})",
                f"mi_addnode({end.real:.12g},{end.imag:.12g})",
                (
                    f"mi_addsegment({begin.real:.12g},{begin.imag:.12g},"
                    f"{end.real:.12g},{end.imag:.12g})"
                ),
            ]
        )
    for midpoint in airgap_radial_midpoints:
        lua.extend(
            [
                f"mi_selectsegment({midpoint.real:.12g},{midpoint.imag:.12g})",
                'mi_setsegmentprop("anti_airgap",0.12,0,0,0)',
                "mi_clearselected()",
            ]
        )

    for line in _iter_unique_lines(surfaces):
        if type(line).__name__ == "Segment":
            continue
        begin = complex(line.get_begin())
        middle = complex(line.get_middle())
        end = complex(line.get_end())
        radii = (abs(begin), abs(middle), abs(end))
        if all(abs(radius - machine.stator.Rext) < 1.0e-9 for radius in radii):
            midpoint_mm = middle * 1_000.0
            lua.extend(
                [
                    f"mi_selectarcsegment({midpoint_mm.real:.12g},{midpoint_mm.imag:.12g})",
                    'mi_setarcsegmentprop(2,"A0",0,0)',
                    "mi_clearselected()",
                ]
            )

    for surface in surfaces:
        material, mesh_mm, group, magnet_angle = _surface_material(
            machine, surface
        )
        point = complex(surface.point_ref)
        # GOTCHA: Pyleecan represents the shaft-sector reference at the
        # origin, which is also a geometry node. FEMM cannot place a block
        # label on a node, so move only that label into the shaft interior.
        if abs(point) < 1.0e-12 and "Shaft" in (surface.label or ""):
            point = (
                0.5
                * float(machine.rotor.Rint)
                * complex(
                    math.cos(sector_angle_rad / 2.0),
                    math.sin(sector_angle_rad / 2.0),
                )
            )
        point_mm = point * 1_000.0
        lua.extend(
            [
                f"mi_addblocklabel({point_mm.real:.12g},{point_mm.imag:.12g})",
                f"mi_selectlabel({point_mm.real:.12g},{point_mm.imag:.12g})",
                (
                    f'mi_setblockprop("{material}",0,{mesh_mm:.12g},'
                    f'"<None>",{magnet_angle:.12g},{group},0)'
                ),
                "mi_clearselected()",
            ]
        )

    # The machine geometry intentionally leaves the mechanical air gap as its
    # own closed region between the Pyleecan rotor and stator boundaries.
    airgap_label_angle = sector_angle_rad / 2.0
    airgap_label = complex(
        airgap_probe_radius_mm * math.cos(airgap_label_angle),
        airgap_probe_radius_mm * math.sin(airgap_label_angle),
    )
    lua.extend(
        [
            f"mi_addblocklabel({airgap_label.real:.12g},{airgap_label.imag:.12g})",
            f"mi_selectlabel({airgap_label.real:.12g},{airgap_label.imag:.12g})",
            'mi_setblockprop("air",0,0.12,"<None>",0,6,0)',
            "mi_clearselected()",
            f'mi_saveas("{fem_name}")',
            "mi_analyze(1)",
            "mi_loadsolution()",
            "b_peak=0",
            "b_sum=0",
            "b_sq_sum=0",
            "b_min=1e30",
        ]
    )

    probe_count = 72
    for probe_id in range(probe_count):
        # Stay half a sample away from the anti-periodic side boundaries.
        angle_rad = sector_angle_rad * (probe_id + 0.5) / probe_count
        x_mm = airgap_probe_radius_mm * math.cos(angle_rad)
        y_mm = airgap_probe_radius_mm * math.sin(angle_rad)
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
            f'print("FORGE_MOTOR_RESULT peak_t="..b_peak)',
            f'print("FORGE_MOTOR_RESULT rms_t="..(b_sq_sum/{probe_count})^0.5)',
            f'print("FORGE_MOTOR_RESULT mean_t="..b_sum/{probe_count})',
            'print("FORGE_MOTOR_RESULT minimum_t="..b_min)',
            "quit()",
        ]
    )
    return "\n".join(lua) + "\n"


def _run_case(machine: object, solver: Path, remanence_t: float) -> MagneticResult:
    """Run one xfemm case and parse its field values."""

    with tempfile.TemporaryDirectory(prefix="forge-motor-em-") as temp_dir:
        work_dir = Path(temp_dir)
        script_path = work_dir / "ipmsm.lua"
        script_path.write_text(
            _build_lua(machine, remanence_t, "ipmsm.fem"), encoding="utf-8"
        )
        command = [str(solver), "-q", f"--lua-script={script_path}"]
        process = subprocess.run(
            command,
            cwd=work_dir,
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
        values = {key: float(value) for key, value in RESULT_RE.findall(process.stdout)}
        expected = {"peak_t", "rms_t", "mean_t", "minimum_t"}
        if process.returncode != 0 or values.keys() != expected:
            raise MagneticSelftestError(
                "femmcli magnetic solve failed or returned incomplete evidence: "
                f"exit={process.returncode}, keys={sorted(values)}, "
                f"stdout_tail={process.stdout[-1200:]!r}, "
                f"stderr_tail={process.stderr[-600:]!r}"
            )
    return MagneticResult(
        peak_airgap_flux_density_t=values["peak_t"],
        rms_airgap_flux_density_t=values["rms_t"],
        mean_airgap_flux_density_t=values["mean_t"],
        minimum_airgap_flux_density_t=values["minimum_t"],
    )


def run_selftest() -> int:
    """Load Pyleecan geometry, solve it twice, and enforce physical invariants."""

    solver = _solver_path()
    machine = load(str(MACHINE_PATH))
    evidence = _machine_evidence(machine)
    solver_version = subprocess.run(
        [str(solver), "--version"],
        capture_output=True,
        text=True,
        timeout=10,
        check=True,
    ).stdout.strip()

    solved = _run_case(machine, solver, evidence.remanence_t)
    near_zero_remanence_t = evidence.remanence_t * 1.0e-6
    near_zero = _run_case(machine, solver, near_zero_remanence_t)

    checks = {
        "pyleecan_loaded_ipmsm": (
            evidence.machine_class == "MachineIPMSM"
            and evidence.stator_slots == 48
            and evidence.rotor_poles == 8
            and evidence.magnet_regions == 16
        ),
        "native_arm64_solver": (
            platform.machine() == "arm64"
            and "arm64" in subprocess.run(
                ["file", str(solver)],
                capture_output=True,
                text=True,
                timeout=10,
                check=True,
            ).stdout
        ),
        "finite_element_field_is_physical": (
            0.1 < solved.peak_airgap_flux_density_t < 2.5
            and 0.05 < solved.rms_airgap_flux_density_t
            <= solved.peak_airgap_flux_density_t
        ),
        "field_varies_around_airgap": (
            solved.peak_airgap_flux_density_t
            > 1.05 * solved.minimum_airgap_flux_density_t
        ),
        # proveCatch: the same geometry with Br reduced by 1e6 must collapse by
        # at least 1e5. This fails if the headline is canned or not magnet-driven.
        "near_zero_remanence_proves_catch": (
            near_zero.peak_airgap_flux_density_t < 1.0e-5
            and solved.peak_airgap_flux_density_t
            > 1.0e5 * max(near_zero.peak_airgap_flux_density_t, 1.0e-15)
        ),
    }
    passed = all(checks.values())
    report = {
        "status": "PASS" if passed else "FAIL",
        "pyleecan_version": pyleecan.__version__,
        "pyleecan_revision": PINNED_PYLEECAN_REVISION,
        "xfemm_solver": str(solver),
        "xfemm_version": solver_version,
        "host_architecture": platform.machine(),
        "machine": asdict(evidence),
        "open_circuit_result": asdict(solved),
        "near_zero_remanence_t": near_zero_remanence_t,
        "near_zero_remanence_result": asdict(near_zero),
        "checks": checks,
        "scope": (
            "Toolchain smoke proof only; no torque map, demagnetisation margin, "
            "thermal correlation, dynamometer correlation, or release claim."
        ),
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if passed else 1


def main() -> int:
    """Parse the explicit self-test command and run the proof."""

    parser = argparse.ArgumentParser(
        description="Prove Pyleecan geometry plus native xfemm on an IPMSM."
    )
    parser.add_argument(
        "--selftest",
        action="store_true",
        help="run the magnetic finite-element proof",
    )
    args = parser.parse_args()
    if not args.selftest:
        parser.error("--selftest is required; this command never changes release state")
    return run_selftest()


if __name__ == "__main__":
    raise SystemExit(main())
