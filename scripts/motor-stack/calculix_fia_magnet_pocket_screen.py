#!/usr/bin/env python3
"""FIA-bound magnet-pocket / iron-bridge centrifugal SCREEN for the Formula E front kit.

Companion to ``calculix_fia_rotor_screen.py`` (solid-ring hoop screen).  This case
reads the same twin rotor OD/ID / active length / max rpm, derives the EM kit's
48-slot / 8-pole V-pocket magnet size and 1 mm outer iron bridge, then:

1. Computes an analytical outer-bridge ligament stress from magnet centrifugal
   force (NdFeB mass hanging on the thin outer iron).
2. Solves a coarse CalculiX C3D8 ligament solid under ``*DLOAD CENTRIF`` plus
   an equivalent magnet-face pressure at kit max rpm (~19,500).

SCREENING only — not laminate anisotropy, not V-pocket fillet mesh, not sleeve
retention, not fatigue, not release FoS.  Status stays PARTIAL; ``ship_ok`` is
always false.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

# Reuse proven twin-load / .dat parsers from the ring screen.
from calculix_fia_rotor_screen import (  # noqa: E402
    STEEL_E_MPA,
    STEEL_NU,
    STEEL_RHO_TONNE_MM3,
    STEEL_YIELD_MPA,
    TwinInputs,
    _atomic_write_json,
    _make_work_dir,
    _synthetic_sections as _ring_synthetic_sections,
    analytical_hoop_outer_mpa,
    input_quantities_sha256,
    inputs_from_sections,
    load_twin_inputs,
    parse_dat,
    resolve_runtime,
)

DEFAULT_TWIN = REPO_ROOT / "out" / "formula-e-front-mgu-20260729-1432"
SCHEMA = "forgeos.motor_stack.calculix_fia_magnet_pocket_screen/v1"
JOB_NAME = "fia_magnet_pocket_screen"

# Coarse ligament mesh (screening — not a burst / fillet mesh).
N_RADIAL = 2
N_WIDTH = 3
N_AXIAL = 1
AXIAL_LENGTH_FRACTION = 0.25

# Match em_fia_front_kit_case._build_fia_lua / derive_fia_geometry keep-outs.
ROTOR_BRIDGE_MM = 1.0
BRIDGE_KEEPOUT_MM = 2.0  # 1 mm OD + 1 mm ID
MAGNET_TILT_DEG = 20.0
MAGNET_RHO_TONNE_MM3 = 7.50e-9  # ≈ 7500 kg/m³ NdFeB screening density
MATERIAL_NAME = "FiaFrontKitScreeningSteel"


class FiaMagnetPocketScreenError(RuntimeError):
    """Raised when twin binding or magnet-pocket screening evidence is incomplete."""


@dataclass(frozen=True)
class PocketBridgeGeometry:
    """Derived V-pocket magnet + outer iron-bridge ligament dimensions."""

    rotor_inner_radius_mm: float
    rotor_outer_radius_mm: float
    magnet_length_mm: float
    magnet_thickness_mm: float
    magnet_tilt_deg: float
    magnet_center_radius_mm: float
    outer_bridge_thickness_mm: float
    ligament_width_mm: float
    axial_length_mm: float
    active_length_mm: float
    n_radial: int
    n_width: int
    n_axial: int
    element_type: str
    element_count: int
    node_count: int
    material_name: str
    fits_twin_rotor: bool


@dataclass(frozen=True)
class ScreenResults:
    """Analytical + CalculiX screening results vs assumed steel yield."""

    operating_speed_rpm: float
    omega_rad_s: float
    omega2_rad2_s2: float
    magnet_mass_one_bar_kg: float
    magnet_centrifugal_force_n: float
    analytical_bridge_stress_mpa: float
    analytical_hoop_outer_mpa: float
    max_abs_displacement_mm: float
    max_von_mises_mpa: float
    max_principal_stress_mpa: float
    assumed_steel_yield_mpa: float
    screening_fos_vs_yield_fea: float
    screening_fos_vs_yield_analytical: float
    below_assumed_yield_fea: bool
    below_assumed_yield_analytical: bool
    below_assumed_yield: bool
    magnet_face_pressure_mpa: float


def derive_pocket_bridge_geometry(inputs: TwinInputs) -> PocketBridgeGeometry:
    """Map twin rotor dimensions onto EM-matched magnet + outer-bridge ligament.

    INTENT: Reuse the same first-principles magnet sizing as
    ``em_fia_front_kit_case.derive_fia_geometry`` / ``_build_fia_lua`` so the
    structural screen and the magnetic mesh share one pocket story.
    """

    ri = inputs.rotor_inner_diameter_mm / 2.0
    ro = inputs.rotor_outer_diameter_mm / 2.0
    if ro <= ri:
        raise FiaMagnetPocketScreenError(
            "Rotor outer diameter must exceed inner diameter for the pocket screen"
        )
    rotor_ring_mm = ro - ri
    usable_radial_mm = max(4.0, rotor_ring_mm - BRIDGE_KEEPOUT_MM)
    # ⭐⭐ THE THIRD MACHINE (2026-08-01). This screen sized the magnet with the
    # same divergent rule as em_fia_demag_screen — 7.00 x 18.00 mm on the live
    # twin — while em_fia_front_kit_case built 8.85 x 14.58 mm. Three screens of
    # ONE machine, two different magnets between them, and the demag screen's
    # docstring named THIS FILE as one of the three that were supposed to "tell
    # one pocket story".
    #
    # It matters here specifically: this screen computes the centrifugal load
    # from the MAGNET BAR MASS and the bridge stress that retains it. A magnet
    # 21% thinner and 23% longer than the modelled one is a different mass and a
    # different lever arm, so the reported factor of safety was for a bar the EM
    # model does not contain.
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent))
    from em_fia_front_kit_case import solve_v_magnet_dimensions  # noqa: PLC0415

    magnet_thickness_mm, magnet_length_mm = solve_v_magnet_dimensions(
        rotor_inner_diameter_mm=inputs.rotor_inner_diameter_mm,
        rotor_outer_diameter_mm=inputs.rotor_outer_diameter_mm,
    )
    tilt = math.radians(MAGNET_TILT_DEG)
    radial_half_extent_mm = (
        magnet_length_mm / 2.0 * math.sin(tilt)
        + magnet_thickness_mm / 2.0 * math.cos(tilt)
    )
    magnet_center_radius = ro - ROTOR_BRIDGE_MM - radial_half_extent_mm
    if magnet_center_radius - radial_half_extent_mm <= ri + ROTOR_BRIDGE_MM:
        raise FiaMagnetPocketScreenError(
            "Twin hollow-rotor ring cannot retain the derived V-magnet with "
            f"{ROTOR_BRIDGE_MM:.1f} mm inner and outer bridges"
        )
    axial = inputs.active_length_mm * AXIAL_LENGTH_FRACTION
    if axial <= 0.0:
        raise FiaMagnetPocketScreenError(
            "Active length fraction produced non-positive axial length"
        )
    element_count = N_RADIAL * N_WIDTH * N_AXIAL
    node_count = (N_RADIAL + 1) * (N_WIDTH + 1) * (N_AXIAL + 1)
    fits = (
        inputs.rotor_outer_diameter_mm < inputs.housing_outer_diameter_mm
        and inputs.active_length_mm <= inputs.housing_length_mm + 1.0e-6
    )
    return PocketBridgeGeometry(
        rotor_inner_radius_mm=ri,
        rotor_outer_radius_mm=ro,
        magnet_length_mm=round(magnet_length_mm, 4),
        magnet_thickness_mm=round(magnet_thickness_mm, 4),
        magnet_tilt_deg=MAGNET_TILT_DEG,
        magnet_center_radius_mm=round(magnet_center_radius, 4),
        outer_bridge_thickness_mm=ROTOR_BRIDGE_MM,
        ligament_width_mm=round(magnet_length_mm, 4),
        axial_length_mm=axial,
        active_length_mm=inputs.active_length_mm,
        n_radial=N_RADIAL,
        n_width=N_WIDTH,
        n_axial=N_AXIAL,
        element_type="C3D8",
        element_count=element_count,
        node_count=node_count,
        material_name=MATERIAL_NAME,
        fits_twin_rotor=fits,
    )


def analytical_bridge_screen(
    inputs: TwinInputs,
    geometry: PocketBridgeGeometry,
    *,
    rpm: float,
) -> tuple[float, float, float, float]:
    """Outer-bridge ligament stress from one magnet bar's centrifugal force.

    DECISION: Idealised resisting section A = t_bridge × L_active (radial
    thickness × full stack).  This is a SCREENING membrane estimate — not a
    fillet / V-pocket burst mesh.  Returns
    (mass_kg, force_n, stress_mpa, face_pressure_mpa).
    """

    omega = rpm * 2.0 * math.pi / 60.0
    volume_mm3 = (
        geometry.magnet_length_mm
        * geometry.magnet_thickness_mm
        * geometry.active_length_mm
    )
    mass_tonne = MAGNET_RHO_TONNE_MM3 * volume_mm3
    mass_kg = mass_tonne * 1000.0
    r_mm = geometry.magnet_center_radius_mm
    force_n = mass_tonne * (omega**2) * r_mm  # tonne·mm/s² = N
    area_mm2 = geometry.outer_bridge_thickness_mm * geometry.active_length_mm
    if area_mm2 <= 0.0:
        raise FiaMagnetPocketScreenError("Bridge resisting area is non-positive")
    stress_mpa = force_n / area_mm2
    # Face pressure on FEA inner face (same p for full or fractional axial).
    face_area = geometry.ligament_width_mm * geometry.active_length_mm
    pressure_mpa = force_n / face_area if face_area > 0.0 else 0.0
    return mass_kg, force_n, stress_mpa, pressure_mpa


def _node_id(ir: int, iw: int, iz: int) -> int:
    """1-based CalculiX node number for the structured (r, width, z) grid."""

    return (
        iz * (N_WIDTH + 1) * (N_RADIAL + 1)
        + iw * (N_RADIAL + 1)
        + ir
        + 1
    )


def build_inp(
    geometry: PocketBridgeGeometry,
    *,
    omega_rad_s: float,
    magnet_face_pressure_mpa: float,
) -> str:
    """Emit a CalculiX deck for the outer iron-bridge ligament screen.

    INTENT: Cheap kit-scale ligament under CENTRIF + magnet-face pressure —
    proves order-of-magnitude bridge stress, not release burst FoS.
    """

    omega2 = omega_rad_s * omega_rad_s
    r_inner = geometry.rotor_outer_radius_mm - geometry.outer_bridge_thickness_mm
    r_outer = geometry.rotor_outer_radius_mm
    half_w = geometry.ligament_width_mm / 2.0
    lines: list[str] = [
        "*HEADING",
        "ForgeOS FIA front-kit magnet-pocket / iron-bridge screen "
        "(PARTIAL; ship_ok false)",
        "*NODE",
    ]
    # Place strip on +X so CENTRIF radius ≈ x (kit rotor OD band).
    for iz in range(N_AXIAL + 1):
        z = geometry.axial_length_mm * (iz / float(N_AXIAL))
        for iw in range(N_WIDTH + 1):
            y = -half_w + geometry.ligament_width_mm * (iw / float(N_WIDTH))
            for ir in range(N_RADIAL + 1):
                x = r_inner + (r_outer - r_inner) * (ir / float(N_RADIAL))
                nid = _node_id(ir, iw, iz)
                lines.append(f"{nid}, {x:.6f}, {y:.6f}, {z:.6f}")

    lines.append("*ELEMENT, TYPE=C3D8, ELSET=BRIDGE")
    eid = 1
    for iz in range(N_AXIAL):
        for iw in range(N_WIDTH):
            for ir in range(N_RADIAL):
                n000 = _node_id(ir, iw, iz)
                n100 = _node_id(ir + 1, iw, iz)
                n110 = _node_id(ir + 1, iw + 1, iz)
                n010 = _node_id(ir, iw + 1, iz)
                n001 = _node_id(ir, iw, iz + 1)
                n101 = _node_id(ir + 1, iw, iz + 1)
                n111 = _node_id(ir + 1, iw + 1, iz + 1)
                n011 = _node_id(ir, iw + 1, iz + 1)
                lines.append(
                    f"{eid}, {n000}, {n100}, {n110}, {n010}, "
                    f"{n001}, {n101}, {n111}, {n011}"
                )
                eid += 1

    # Inner-face elements (ir==0) for magnet pressure; side / z constraints.
    inner_faces: list[tuple[int, str]] = []
    side_neg: list[int] = []
    side_pos: list[int] = []
    fix_z0: list[int] = []
    all_nodes: list[int] = []
    eid = 1
    for iz in range(N_AXIAL):
        for iw in range(N_WIDTH):
            for ir in range(N_RADIAL):
                if ir == 0:
                    # Face 6 of C3D8 (nodes 4-8-5-1 = n010,n011,n001,n000)
                    # has outward normal −X (toward the axis).
                    # GOTCHA: positive P acts along the face outward normal;
                    # magnet push on the bridge is +X → negative pressure.
                    inner_faces.append((eid, "P6"))
                eid += 1
    for iz in range(N_AXIAL + 1):
        for iw in range(N_WIDTH + 1):
            for ir in range(N_RADIAL + 1):
                nid = _node_id(ir, iw, iz)
                all_nodes.append(nid)
                if iw == 0:
                    side_neg.append(nid)
                if iw == N_WIDTH:
                    side_pos.append(nid)
                if iz == 0:
                    fix_z0.append(nid)

    def _nset(name: str, nodes: Sequence[int]) -> None:
        lines.append(f"*NSET, NSET={name}")
        row: list[str] = []
        for node in nodes:
            row.append(str(node))
            if len(row) == 16:
                lines.append(", ".join(row))
                row = []
        if row:
            lines.append(", ".join(row))

    _nset("SIDE_NEG", sorted(set(side_neg)))
    _nset("SIDE_POS", sorted(set(side_pos)))
    _nset("FIX_Z0", sorted(set(fix_z0)))
    _nset("ALLNODES", sorted(set(all_nodes)))

    # Element sets for each pressurized face (one face per element).
    for index, (elem, _face) in enumerate(inner_faces):
        lines.append(f"*ELSET, ELSET=MAGFACE{index}")
        lines.append(str(elem))

    lines.extend(
        [
            f"*MATERIAL, NAME={MATERIAL_NAME}",
            "*ELASTIC",
            f"{STEEL_E_MPA:.1f}, {STEEL_NU:.3f}",
            "*DENSITY",
            f"{STEEL_RHO_TONNE_MM3:.6e}",
            f"*SOLID SECTION, ELSET=BRIDGE, MATERIAL={MATERIAL_NAME}",
            "*BOUNDARY",
            # Circumferential ends built into bulk iron (UX+UY); mid-width may bow.
            # GOTCHA: UY-only left a free +X rigid-body mode → absurd |U|.
            "SIDE_NEG, 1, 2",
            "SIDE_POS, 1, 2",
            "FIX_Z0, 3, 3",
            "*STEP",
            "*STATIC",
            "*DLOAD",
            f"BRIDGE, CENTRIF, {omega2:.6e}, 0., 0., 0., 0., 0., 1.",
        ]
    )
    # Negative P on P4 → traction in +X (magnet pushing the bridge outward).
    pressure = -abs(magnet_face_pressure_mpa)
    for index, (_elem, face) in enumerate(inner_faces):
        lines.append(f"MAGFACE{index}, {face}, {pressure:.6e}")
    lines.extend(
        [
            "*NODE FILE",
            "U",
            "*EL FILE",
            "S",
            "*NODE PRINT, NSET=ALLNODES",
            "U",
            "*EL PRINT, ELSET=BRIDGE",
            "S",
            "*END STEP",
            "",
        ]
    )
    return "\n".join(lines)


def run_screen(
    inputs: TwinInputs,
    geometry: PocketBridgeGeometry,
    *,
    work_dir: Path,
    rpm_override: float | None = None,
) -> tuple[ScreenResults, dict[str, str]]:
    """Build deck, run ccx, combine analytical + FEA screening stresses."""

    # Local JOB_NAME for run_ccx: temporarily patch via writing the expected name.
    rpm = float(rpm_override if rpm_override is not None else inputs.max_rotor_speed_rpm)
    omega = rpm * 2.0 * math.pi / 60.0
    mass_kg, force_n, analytical_mpa, face_p = analytical_bridge_screen(
        inputs, geometry, rpm=rpm
    )
    runtime = resolve_runtime()
    work_dir.mkdir(parents=True, exist_ok=True)
    inp_path = work_dir / f"{JOB_NAME}.inp"
    inp_path.write_text(
        build_inp(
            geometry,
            omega_rad_s=omega,
            magnet_face_pressure_mpa=face_p,
        ),
        encoding="utf-8",
    )
    # run_ccx hard-codes the ring JOB_NAME; invoke ccx with our job via a shim.
    _run_ccx_job(work_dir, runtime, job_name=JOB_NAME)
    dat_path = work_dir / f"{JOB_NAME}.dat"
    frd_path = work_dir / f"{JOB_NAME}.frd"
    if not dat_path.is_file() or dat_path.stat().st_size == 0:
        raise FiaMagnetPocketScreenError("ccx did not write the requested text results")
    if not frd_path.is_file() or frd_path.stat().st_size == 0:
        raise FiaMagnetPocketScreenError(
            "ccx did not write the finite-element result database"
        )
    max_disp, max_vm, max_prin = parse_dat(dat_path)
    yield_mpa = STEEL_YIELD_MPA
    fos_fea = yield_mpa / max_vm if max_vm > 0.0 else float("inf")
    fos_an = yield_mpa / analytical_mpa if analytical_mpa > 0.0 else float("inf")
    below_fea = max_vm < yield_mpa
    below_an = analytical_mpa < yield_mpa
    results = ScreenResults(
        operating_speed_rpm=rpm,
        omega_rad_s=round(omega, 6),
        omega2_rad2_s2=round(omega * omega, 3),
        magnet_mass_one_bar_kg=round(mass_kg, 6),
        magnet_centrifugal_force_n=round(force_n, 3),
        analytical_bridge_stress_mpa=round(analytical_mpa, 4),
        analytical_hoop_outer_mpa=round(analytical_hoop_outer_mpa(inputs), 4),
        max_abs_displacement_mm=round(max_disp, 6),
        max_von_mises_mpa=round(max_vm, 4),
        max_principal_stress_mpa=round(max_prin, 4),
        assumed_steel_yield_mpa=yield_mpa,
        screening_fos_vs_yield_fea=round(fos_fea, 3),
        screening_fos_vs_yield_analytical=round(fos_an, 3),
        below_assumed_yield_fea=below_fea,
        below_assumed_yield_analytical=below_an,
        below_assumed_yield=below_fea and below_an,
        magnet_face_pressure_mpa=round(face_p, 4),
    )
    return results, runtime


def _run_ccx_job(
    work_dir: Path,
    runtime: Mapping[str, str],
    *,
    job_name: str,
) -> None:
    """Execute CalculiX for ``job_name`` (work_dir under scripts/motor-stack)."""

    try:
        work_dir.resolve().relative_to(SCRIPT_DIR.resolve())
    except ValueError as exc:
        raise FiaMagnetPocketScreenError(
            f"Work dir must be under {SCRIPT_DIR} for Colima mounts; got {work_dir}"
        ) from exc

    log_path = work_dir / "solver.log"
    if runtime["runtime"] == "native":
        cmd = ["ccx", "-i", job_name]
        cwd: str | None = str(work_dir)
    else:
        cmd = [
            "docker",
            "run",
            "--rm",
            "--platform",
            "linux/arm64",
            "-v",
            f"{work_dir}:/work",
            "-w",
            "/work",
            runtime["image"],
            "-i",
            job_name,
        ]
        cwd = None
    with log_path.open("w", encoding="utf-8") as log_handle:
        completed = subprocess.run(
            cmd,
            cwd=cwd,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            text=True,
        )
    if completed.returncode != 0:
        tail = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-40:]
        raise FiaMagnetPocketScreenError(
            "ccx failed; final solver log lines:\n" + "\n".join(tail)
        )


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: PocketBridgeGeometry,
    results: ScreenResults,
    runtime: Mapping[str, str],
    source_state_sha256: str,
    source_twin: str,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release magnet-pocket screen artefact."""

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "pocket_bridge_mesh": asdict(geometry),
        "screening_results": asdict(results),
        "margins": {
            "screening_fos_vs_assumed_yield_fea": results.screening_fos_vs_yield_fea,
            "screening_fos_vs_assumed_yield_analytical": (
                results.screening_fos_vs_yield_analytical
            ),
            "below_assumed_yield": results.below_assumed_yield,
            "below_assumed_yield_fea": results.below_assumed_yield_fea,
            "below_assumed_yield_analytical": results.below_assumed_yield_analytical,
            "release_fos_closed": False,
            "note": (
                "SCREENING only against assumed isotropic steel yield "
                f"({STEEL_YIELD_MPA:.0f} MPa). Analytical magnet-on-bridge + "
                "coarse CalculiX ligament. Not laminate stack, not fillet burst "
                "mesh, not sleeve retention, not fatigue. Never claim release FoS."
            ),
        },
        "solver": {
            "name": "CalculiX CrunchiX",
            "version": "2.21",
            "runtime": runtime["runtime"],
            "image": runtime.get("image") or None,
            "analytical_companion": (
                "magnet centrifugal force / (t_bridge × L_active) membrane screen"
            ),
        },
        "material_assumptions": {
            "steel_name": MATERIAL_NAME,
            "E_mpa": STEEL_E_MPA,
            "nu": STEEL_NU,
            "rho_tonne_mm3": STEEL_RHO_TONNE_MM3,
            "assumed_yield_mpa": STEEL_YIELD_MPA,
            "magnet_rho_tonne_mm3": MAGNET_RHO_TONNE_MM3,
            "label": (
                "Assumed isotropic steel bridge + NdFeB magnet density for "
                "centrifugal force — not supplier laminate / magnet / sleeve cards."
            ),
        },
        "model_assumptions": [
            (
                f"Outer iron bridge thickness = {ROTOR_BRIDGE_MM:.1f} mm "
                "(matches em_fia_front_kit_case rotor_bridge_mm)."
            ),
            (
                "Magnet length/thickness from the same usable-ring clamps as "
                "em_fia_front_kit_case.derive_fia_geometry "
                f"(tilt {MAGNET_TILT_DEG:.0f}°)."
            ),
            (
                "Analytical: one magnet bar mass × ω² × r_cg / "
                "(t_bridge × L_active) — idealised membrane ligament."
            ),
            (
                f"CalculiX: coarse C3D8 strip at rotor OD, axial length = "
                f"{AXIAL_LENGTH_FRACTION:.0%} of twin active length; "
                "*DLOAD CENTRIF + magnet-face pressure."
            ),
            "Circumferential ends held in UX+UY (bulk iron); mid-width may bow; UZ fixed on z=0.",
            "No V-pocket fillets, side bridges, sleeve, interference, or laminate anisotropy.",
            "No case / mount / joint / torque-reaction load cases.",
        ],
        "geometry_provenance": {
            "controlling_dimensions": (
                "state.fpkConcentricGeometry with orchestratorContract quantity "
                "fallbacks; magnet size mirrors em_fia_front_kit_case"
            ),
            "smoke_cantilever_used": False,
            "lucid_or_proprietary_cad_used": False,
            "solid_ring_screen_used": False,
            "statement": (
                "Kit-sized outer iron-bridge ligament from twin rotor OD/ID/"
                "active length + EM V-pocket magnet sizing; not the ring screen "
                "and not the calculix_smoke_selftest cantilever."
            ),
        },
        "fia_question": (
            f"Does the outer iron bridge retaining the V-pocket magnets survive "
            f"centrifugal load at {inputs.max_rotor_speed_rpm:,.0f} rpm as a "
            f"SCREENING stress check?"
        ),
        "works_in_kit_context": {
            "bridge_screen_ok": results.below_assumed_yield,
            "fea_below_assumed_yield": results.below_assumed_yield_fea,
            "analytical_below_assumed_yield": results.below_assumed_yield_analytical,
        },
        "release_fos": {
            "status": "OPEN",
            "statement": (
                "Screening FoS vs assumed steel yield is informational. Release "
                "factor of safety requires signed material cards, pocket fillet "
                "detail, and correlated FEA — not closed here."
            ),
        },
        "release_statement": (
            "Concept evidence only. No FIA homologation, team interface closure, "
            "race evidence or permission to ship. Never claim PASS or closed "
            "release FoS from this screening case."
        ),
    }


def run_selftest() -> int:
    """Prove twin binding, analytical+ccx solve, and 10×-rpm stress proveCatch."""

    quantities, concentric = _ring_synthetic_sections()
    inputs = inputs_from_sections(quantities, concentric)
    geometry = derive_pocket_bridge_geometry(inputs)
    work_dir = _make_work_dir("magnet-pocket-selftest")
    hot_dir = _make_work_dir("magnet-pocket-selftest-hot")
    try:
        results, runtime = run_screen(inputs, geometry, work_dir=work_dir)
        # proveCatch: 10× rpm must raise stress — canned MPa cannot pass both.
        hot_results, _ = run_screen(
            inputs,
            geometry,
            work_dir=hot_dir,
            rpm_override=inputs.max_rotor_speed_rpm * 10.0,
        )
        artifact = build_artifact(
            inputs=inputs,
            geometry=geometry,
            results=results,
            runtime=runtime,
            source_state_sha256="synthetic-selftest",
            source_twin="synthetic-selftest",
        )
        checks = {
            "synthetic_quantities_control_geometry": (
                abs(geometry.rotor_outer_radius_mm - 61.0) < 1.0e-9
                and abs(geometry.rotor_inner_radius_mm - 46.35) < 1.0e-9
                and geometry.outer_bridge_thickness_mm == ROTOR_BRIDGE_MM
                and geometry.magnet_length_mm >= 12.0
                and geometry.magnet_thickness_mm >= 3.5
            ),
            "geometry_fits_twin_rotor": geometry.fits_twin_rotor,
            "analytical_and_fea_positive_finite": (
                results.analytical_bridge_stress_mpa > 0.0
                and results.max_von_mises_mpa > 0.0
                and results.max_abs_displacement_mm > 0.0
                and math.isfinite(results.max_principal_stress_mpa)
            ),
            "stress_in_physical_screening_band": (
                1.0 < results.max_von_mises_mpa < 5000.0
                and 1.0 < results.analytical_bridge_stress_mpa < 5000.0
            ),
            "displacement_not_rigid_body": (
                0.0 < results.max_abs_displacement_mm < 1.0
            ),
            # ω² scaling: 10× rpm → ~100× stress; allow broad numerical tolerance.
            "rpm_hardening_proves_solver_catch": (
                hot_results.max_von_mises_mpa > 20.0 * results.max_von_mises_mpa
                and hot_results.analytical_bridge_stress_mpa
                > 50.0 * results.analytical_bridge_stress_mpa
            ),
            "operating_band_is_19500": inputs.max_rotor_speed_rpm == 19_500.0,
            "release_honesty": (
                artifact["status"] in {"OPEN", "PARTIAL"}
                and artifact["ship_ok"] is False
                and artifact["margins"]["release_fos_closed"] is False
                and artifact["release_fos"]["status"] == "OPEN"
            ),
            "never_ship_ok_true": artifact["ship_ok"] is False,
        }
        passed = all(checks.values())
        print(
            json.dumps(
                {
                    "status": "PASS" if passed else "FAIL",
                    "checks": checks,
                    "geometry": asdict(geometry),
                    "screening_results": asdict(results),
                    "ten_x_rpm_von_mises_mpa": hot_results.max_von_mises_mpa,
                    "ten_x_rpm_analytical_mpa": hot_results.analytical_bridge_stress_mpa,
                    "runtime": runtime,
                    "ship_ok": artifact["ship_ok"],
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0 if passed else 1
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)
        shutil.rmtree(hot_dir, ignore_errors=True)


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist one magnet-pocket screen against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    geometry = derive_pocket_bridge_geometry(inputs)
    if not geometry.fits_twin_rotor:
        raise FiaMagnetPocketScreenError(
            "Twin-controlled pocket bridge mesh does not fit its housing envelope"
        )
    work_dir = _make_work_dir("magnet-pocket-live")
    try:
        results, runtime = run_screen(inputs, geometry, work_dir=work_dir)
        if not (
            1.0 < results.max_von_mises_mpa < 5000.0
            and 1.0 < results.analytical_bridge_stress_mpa < 5000.0
            and math.isfinite(results.screening_fos_vs_yield_fea)
        ):
            raise FiaMagnetPocketScreenError(
                "Solved stress is outside the screening plausibility envelope"
            )
        try:
            twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
        except ValueError:
            twin_label = str(twin_dir.resolve())
        artifact = build_artifact(
            inputs=inputs,
            geometry=geometry,
            results=results,
            runtime=runtime,
            source_state_sha256=state_hash,
            source_twin=twin_label,
        )
        destination = (
            output_path
            if output_path is not None
            else twin_dir / "_motor_stack" / "calculix_fia_magnet_pocket_screen.json"
        )
        _atomic_write_json(destination, artifact)
        yield_word = "below" if results.below_assumed_yield else "ABOVE"
        print(
            "FIA front-kit magnet-pocket / iron-bridge screen: "
            f"FEA max von Mises ≈ {results.max_von_mises_mpa:.1f} MPa, "
            f"analytical bridge ≈ {results.analytical_bridge_stress_mpa:.1f} MPa, "
            f"max principal ≈ {results.max_principal_stress_mpa:.1f} MPa, "
            f"|U|_max ≈ {results.max_abs_displacement_mm:.4f} mm "
            f"at {inputs.max_rotor_speed_rpm:,.0f} rpm "
            f"(magnet bar ≈ {results.magnet_mass_one_bar_kg * 1e3:.1f} g, "
            f"F ≈ {results.magnet_centrifugal_force_n:.0f} N). "
            f"Screening FoS FEA ×{results.screening_fos_vs_yield_fea:.2f} / "
            f"analytical ×{results.screening_fos_vs_yield_analytical:.2f} "
            f"vs assumed {STEEL_YIELD_MPA:.0f} MPa ({yield_word} yield). "
            f"Bridge {geometry.outer_bridge_thickness_mm:.1f} mm × "
            f"magnet {geometry.magnet_length_mm:.1f}×{geometry.magnet_thickness_mm:.1f} mm "
            f"({geometry.element_count} {geometry.element_type}). "
            f"Runtime={runtime['runtime']}. "
            "Release FoS remains OPEN; ship_ok is false."
        )
        print(f"Artefact: {destination}")
        return 0
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description=(
            "Solve the FIA-bound Formula E front-kit CalculiX magnet-pocket / "
            "iron-bridge centrifugal screening case."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic binding plus 10×-rpm stress proveCatch",
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
