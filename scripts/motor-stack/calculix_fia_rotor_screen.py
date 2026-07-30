#!/usr/bin/env python3
"""FIA-bound CalculiX centrifugal rotor-retention screen for the Formula E front kit.

This is deliberately separate from ``calculix_smoke_selftest.sh``.  The smoke
test proves ccx on a generic cantilever.  This case reads the Formula E twin,
builds a coarse steel ring sector spanning rotor bore → outer diameter at a
fraction of active length, applies centrifugal body load at the kit max rpm
(~19,500), and records max von Mises / principal stress as a SCREENING check
against assumed steel yield.

It does not model magnet pockets, laminate stack anisotropy, sleeve retention,
interference fits, or burst / fatigue.  Status stays PARTIAL (or OPEN if the
solve fails honestly); ``ship_ok`` is always false.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import ijson


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_TWIN = REPO_ROOT / "out" / "formula-e-front-mgu-20260729-1432"
SCHEMA = "forgeos.motor_stack.calculix_fia_rotor_screen/v1"
CALCULIX_IMAGE = os.environ.get("CALCULIX_IMAGE", "forgeos/calculix:2.21-arm64")
JOB_NAME = "fia_rotor_screen"

# Coarse C3D8 quarter-ring mesh (screening only — not a burst mesh).
N_RADIAL = 2
N_THETA = 4
N_AXIAL = 1
# Axial model length = this fraction of twin active / stack length.
AXIAL_LENGTH_FRACTION = 0.25

# Assumed isotropic steel (not laminate / magnet / sleeve stack).
# Units: mm, N, s, tonne — stress in MPa (CalculiX consistent set).
STEEL_E_MPA = 210_000.0
STEEL_NU = 0.30
STEEL_RHO_TONNE_MM3 = 7.81e-9  # ≈ 7810 kg/m³
STEEL_YIELD_MPA = 355.0  # assumed S355-class screening yield — labelled, not certified
MATERIAL_NAME = "FiaFrontKitScreeningSteel"


class FiaRotorScreenError(RuntimeError):
    """Raised when twin binding or structural screening evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this centrifugal screen."""

    max_rotor_speed_rpm: float
    continuous_electrical_power_kw: float
    front_regen_electrical_cap_kw: float
    bay_width_mm: float
    bay_depth_mm: float
    bay_height_mm: float
    mass_aspiration_kg: float
    housing_outer_diameter_mm: float
    housing_length_mm: float
    rotor_outer_diameter_mm: float
    rotor_inner_diameter_mm: float
    active_length_mm: float


@dataclass(frozen=True)
class RingMeshGeometry:
    """Dimensions of the simplified steel ring sector solid."""

    rotor_inner_radius_mm: float
    rotor_outer_radius_mm: float
    axial_length_mm: float
    sector_angle_deg: float
    n_radial: int
    n_theta: int
    n_axial: int
    element_type: str
    element_count: int
    node_count: int
    material_name: str
    fits_twin_rotor: bool


@dataclass(frozen=True)
class ScreenResults:
    """Parsed CalculiX screening results vs assumed steel yield."""

    operating_speed_rpm: float
    omega_rad_s: float
    omega2_rad2_s2: float
    max_abs_displacement_mm: float
    max_von_mises_mpa: float
    max_principal_stress_mpa: float
    assumed_steel_yield_mpa: float
    screening_fos_vs_yield: float
    below_assumed_yield: bool
    analytical_hoop_outer_mpa: float


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
    raise FiaRotorScreenError(
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
    except FiaRotorScreenError:
        return _number(fallback, fallback_keys, default=default)


def inputs_from_sections(
    quantities: Mapping[str, Any],
    concentric: Mapping[str, Any],
) -> TwinInputs:
    """Build controlled case inputs from selectively read twin sections.

    INTENT: Centrifugal retention screening must use the kit rotor OD/ID,
    active length and max rpm from the twin — never the smoke cantilever.
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
        rotor_outer_diameter_mm=_number_from_sections(
            concentric,
            ("rotor_od_mm",),
            quantities,
            ("fpk_rotor_od_mm", "rotor_airgap_diameter_mm"),
            default=122.0,
        ),
        rotor_inner_diameter_mm=_number_from_sections(
            concentric,
            ("rotor_id_mm",),
            quantities,
            ("fpk_rotor_id_mm",),
            default=92.7,
        ),
        active_length_mm=_number_from_sections(
            concentric,
            ("stack_len_mm",),
            quantities,
            ("stack_length_mm", "active_length_mm"),
            default=97.58,
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
        raise FiaRotorScreenError(f"Twin state not found: {state_path}")

    # GOTCHA: The autonomous twin can be rewritten while this script runs.
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
    raise FiaRotorScreenError(f"{last_error}; rerun on a stable stamp")


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the selected quantities that control this case."""

    payload = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def derive_ring_geometry(inputs: TwinInputs) -> RingMeshGeometry:
    """Map twin rotor dimensions onto a coarse quarter-ring solid mesh."""

    ri = inputs.rotor_inner_diameter_mm / 2.0
    ro = inputs.rotor_outer_diameter_mm / 2.0
    if ro <= ri:
        raise FiaRotorScreenError(
            "Rotor outer diameter must exceed inner diameter for the ring mesh"
        )
    axial = inputs.active_length_mm * AXIAL_LENGTH_FRACTION
    if axial <= 0.0:
        raise FiaRotorScreenError("Active length fraction produced non-positive axial length")
    element_count = N_RADIAL * N_THETA * N_AXIAL
    node_count = (N_RADIAL + 1) * (N_THETA + 1) * (N_AXIAL + 1)
    fits = (
        inputs.rotor_outer_diameter_mm < inputs.housing_outer_diameter_mm
        and inputs.active_length_mm <= inputs.housing_length_mm + 1.0e-6
    )
    return RingMeshGeometry(
        rotor_inner_radius_mm=ri,
        rotor_outer_radius_mm=ro,
        axial_length_mm=axial,
        sector_angle_deg=90.0,
        n_radial=N_RADIAL,
        n_theta=N_THETA,
        n_axial=N_AXIAL,
        element_type="C3D8",
        element_count=element_count,
        node_count=node_count,
        material_name=MATERIAL_NAME,
        fits_twin_rotor=fits,
    )


def _node_id(ir: int, it: int, iz: int) -> int:
    """1-based CalculiX node number for the structured (r, θ, z) grid."""

    return (
        iz * (N_THETA + 1) * (N_RADIAL + 1)
        + it * (N_RADIAL + 1)
        + ir
        + 1
    )


def build_inp(
    geometry: RingMeshGeometry,
    *,
    omega_rad_s: float,
) -> str:
    """Emit a CalculiX input deck for the centrifugal ring screen.

    INTENT: A coarse solid with *DLOAD CENTRIF proves kit-scale hoop stress
    order-of-magnitude under overspeed — not magnet-pocket burst FEA.
    """

    omega2 = omega_rad_s * omega_rad_s
    lines: list[str] = [
        "*HEADING",
        "ForgeOS FIA front-kit rotor centrifugal screen (PARTIAL; ship_ok false)",
        "*NODE",
    ]
    for iz in range(N_AXIAL + 1):
        z = geometry.axial_length_mm * (iz / float(N_AXIAL))
        for it in range(N_THETA + 1):
            theta = (math.pi / 2.0) * (it / float(N_THETA))
            for ir in range(N_RADIAL + 1):
                radius = geometry.rotor_inner_radius_mm + (
                    geometry.rotor_outer_radius_mm - geometry.rotor_inner_radius_mm
                ) * (ir / float(N_RADIAL))
                x = radius * math.cos(theta)
                y = radius * math.sin(theta)
                nid = _node_id(ir, it, iz)
                lines.append(f"{nid}, {x:.6f}, {y:.6f}, {z:.6f}")

    lines.append("*ELEMENT, TYPE=C3D8, ELSET=SOLID")
    eid = 1
    for iz in range(N_AXIAL):
        for it in range(N_THETA):
            for ir in range(N_RADIAL):
                n000 = _node_id(ir, it, iz)
                n100 = _node_id(ir + 1, it, iz)
                n110 = _node_id(ir + 1, it + 1, iz)
                n010 = _node_id(ir, it + 1, iz)
                n001 = _node_id(ir, it, iz + 1)
                n101 = _node_id(ir + 1, it, iz + 1)
                n111 = _node_id(ir + 1, it + 1, iz + 1)
                n011 = _node_id(ir, it + 1, iz + 1)
                lines.append(
                    f"{eid}, {n000}, {n100}, {n110}, {n010}, "
                    f"{n001}, {n101}, {n111}, {n011}"
                )
                eid += 1

    # Symmetry faces: θ=0 (y≈0) → UY=0; θ=90° (x≈0) → UX=0; z=0 → UZ=0.
    sym_theta0: list[int] = []
    sym_theta90: list[int] = []
    fix_z0: list[int] = []
    outer_nodes: list[int] = []
    all_nodes: list[int] = []
    for iz in range(N_AXIAL + 1):
        for it in range(N_THETA + 1):
            for ir in range(N_RADIAL + 1):
                nid = _node_id(ir, it, iz)
                all_nodes.append(nid)
                if it == 0:
                    sym_theta0.append(nid)
                if it == N_THETA:
                    sym_theta90.append(nid)
                if iz == 0:
                    fix_z0.append(nid)
                if ir == N_RADIAL:
                    outer_nodes.append(nid)

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

    _nset("SYM_THETA0", sorted(set(sym_theta0)))
    _nset("SYM_THETA90", sorted(set(sym_theta90)))
    _nset("FIX_Z0", sorted(set(fix_z0)))
    _nset("OUTER", sorted(set(outer_nodes)))
    _nset("ALLNODES", sorted(set(all_nodes)))

    lines.extend(
        [
            f"*MATERIAL, NAME={MATERIAL_NAME}",
            "*ELASTIC",
            f"{STEEL_E_MPA:.1f}, {STEEL_NU:.3f}",
            "*DENSITY",
            f"{STEEL_RHO_TONNE_MM3:.6e}",
            f"*SOLID SECTION, ELSET=SOLID, MATERIAL={MATERIAL_NAME}",
            "*BOUNDARY",
            "SYM_THETA0, 2, 2",
            "SYM_THETA90, 1, 1",
            "FIX_Z0, 3, 3",
            "*STEP",
            "*STATIC",
            "*DLOAD",
            # CENTRIF syntax: Ω², point on axis (x,y,z), then unit direction (nx,ny,nz).
            # GOTCHA: swapping point/direction yields a zero axis vector → NaN fields.
            f"SOLID, CENTRIF, {omega2:.6e}, 0., 0., 0., 0., 0., 1.",
            "*NODE FILE",
            "U",
            "*EL FILE",
            "S",
            "*NODE PRINT, NSET=ALLNODES",
            "U",
            "*EL PRINT, ELSET=SOLID",
            "S",
            "*END STEP",
            "",
        ]
    )
    return "\n".join(lines)


def resolve_runtime() -> dict[str, str]:
    """Prefer native ccx; otherwise Docker + forgeos/calculix ARM64 image."""

    if shutil.which("ccx"):
        return {"runtime": "native", "image": ""}
    if not shutil.which("docker"):
        raise FiaRotorScreenError(
            "ccx and Docker are missing. Install Docker/Colima or CalculiX."
        )
    try:
        subprocess.run(
            ["docker", "info"],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        raise FiaRotorScreenError(
            "Docker is installed but not running. Start Docker Desktop or run: colima start"
        ) from exc
    inspect = subprocess.run(
        ["docker", "image", "inspect", CALCULIX_IMAGE],
        capture_output=True,
        text=True,
    )
    if inspect.returncode != 0:
        raise FiaRotorScreenError(
            f"CalculiX image is missing. Run: docker build --platform linux/arm64 "
            f"-f {SCRIPT_DIR / 'calculix.Dockerfile'} -t {CALCULIX_IMAGE} {SCRIPT_DIR}"
        )
    return {"runtime": "docker", "image": CALCULIX_IMAGE}


def run_ccx(work_dir: Path, runtime: Mapping[str, str]) -> None:
    """Execute CalculiX in work_dir (must be under scripts/motor-stack for Colima)."""

    # GOTCHA: Colima mounts /Users; macOS TMPDIR under /var/folders is invisible.
    try:
        work_dir.resolve().relative_to(SCRIPT_DIR.resolve())
    except ValueError as exc:
        raise FiaRotorScreenError(
            f"Work dir must be under {SCRIPT_DIR} for Colima mounts; got {work_dir}"
        ) from exc

    log_path = work_dir / "solver.log"
    if runtime["runtime"] == "native":
        cmd = ["ccx", "-i", JOB_NAME]
        env = None
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
            JOB_NAME,
        ]
        env = None
    with log_path.open("w", encoding="utf-8") as log_handle:
        completed = subprocess.run(
            cmd,
            cwd=str(work_dir) if runtime["runtime"] == "native" else None,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            text=True,
            env=env,
        )
    if completed.returncode != 0:
        tail = log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-40:]
        raise FiaRotorScreenError(
            "ccx failed; final solver log lines:\n" + "\n".join(tail)
        )


def _von_mises(sxx: float, syy: float, szz: float, sxy: float, syz: float, szx: float) -> float:
    """Von Mises equivalent stress from the six Cauchy components (MPa)."""

    return math.sqrt(
        0.5
        * (
            (sxx - syy) ** 2
            + (syy - szz) ** 2
            + (szz - sxx) ** 2
        )
        + 3.0 * (sxy**2 + syz**2 + szx**2)
    )


def _max_principal(
    sxx: float, syy: float, szz: float, sxy: float, syz: float, szx: float
) -> float:
    """Largest algebraic principal stress via the cubic characteristic equation."""

    # Characteristic polynomial λ³ − I1 λ² + I2 λ − I3 = 0
    i1 = sxx + syy + szz
    i2 = sxx * syy + syy * szz + szz * sxx - sxy**2 - syz**2 - szx**2
    i3 = (
        sxx * syy * szz
        + 2.0 * sxy * syz * szx
        - sxx * syz**2
        - syy * szx**2
        - szz * sxy**2
    )
    # Depressed cubic via Cardano / trigonometric identity for three real roots.
    p = i2 - i1 * i1 / 3.0
    q = 2.0 * i1**3 / 27.0 - i1 * i2 / 3.0 + i3
    discriminant = (q / 2.0) ** 2 + (p / 3.0) ** 3
    if abs(p) < 1.0e-18:
        return i1 / 3.0
    if discriminant > 1.0e-12:
        # One real root (should be rare for real symmetric stress tensors).
        sqrt_d = math.sqrt(discriminant)
        u = math.copysign(abs(-q / 2.0 + sqrt_d) ** (1.0 / 3.0), -q / 2.0 + sqrt_d)
        v = math.copysign(abs(-q / 2.0 - sqrt_d) ** (1.0 / 3.0), -q / 2.0 - sqrt_d)
        return u + v + i1 / 3.0
    r = math.sqrt(max(-p / 3.0, 0.0))
    if r < 1.0e-18:
        return i1 / 3.0
    arg = max(-1.0, min(1.0, (-q / 2.0) / (r**3)))
    phi = math.acos(arg) / 3.0
    roots = [
        2.0 * r * math.cos(phi) + i1 / 3.0,
        2.0 * r * math.cos(phi + 2.0 * math.pi / 3.0) + i1 / 3.0,
        2.0 * r * math.cos(phi + 4.0 * math.pi / 3.0) + i1 / 3.0,
    ]
    return max(roots)


def parse_dat(dat_path: Path) -> tuple[float, float, float]:
    """Parse max |U|, max von Mises, and max principal from a .dat file."""

    text = dat_path.read_text(encoding="utf-8", errors="replace")
    if not re.search(r"displacements", text, re.IGNORECASE):
        raise FiaRotorScreenError("CalculiX .dat contains no displacement field")
    if not re.search(r"stresses", text, re.IGNORECASE):
        raise FiaRotorScreenError("CalculiX .dat contains no stress field")

    max_disp = 0.0
    in_disp = False
    in_stress = False
    max_vm = 0.0
    max_prin = float("-inf")
    for line in text.splitlines():
        lower = line.lower()
        if "displacements" in lower:
            in_disp = True
            in_stress = False
            continue
        if "stresses" in lower:
            in_stress = True
            in_disp = False
            continue
        parts = line.split()
        if in_disp and len(parts) == 4 and parts[0].isdigit():
            for field in parts[1:4]:
                try:
                    value = float(field)
                except ValueError:
                    continue
                if math.isfinite(value):
                    max_disp = max(max_disp, abs(value))
        if in_stress and parts and parts[0].isdigit():
            # CalculiX prints: elem, integ.pnt, sxx, syy, szz, sxy, sxz, syz
            if len(parts) >= 8:
                comp_fields = parts[2:8]
            elif len(parts) >= 7:
                comp_fields = parts[1:7]
            else:
                continue
            try:
                comps = [float(field) for field in comp_fields]
            except ValueError:
                continue
            if not all(math.isfinite(value) for value in comps):
                continue
            vm = _von_mises(*comps)
            prin = _max_principal(*comps)
            max_vm = max(max_vm, vm)
            max_prin = max(max_prin, prin)
    if max_disp <= 0.0:
        raise FiaRotorScreenError("Maximum displacement is not positive")
    if max_vm <= 0.0:
        raise FiaRotorScreenError("Maximum von Mises stress is not positive")
    if not math.isfinite(max_prin):
        raise FiaRotorScreenError("Maximum principal stress is non-finite")
    return max_disp, max_vm, max_prin


def analytical_hoop_outer_mpa(inputs: TwinInputs) -> float:
    """Thin-ring outer hoop estimate ρ ω² r² (MPa) for order-of-magnitude check."""

    omega = inputs.max_rotor_speed_rpm * 2.0 * math.pi / 60.0
    r_m = (inputs.rotor_outer_diameter_mm / 2.0) / 1000.0
    rho = STEEL_RHO_TONNE_MM3 * 1.0e12  # tonne/mm³ → kg/m³
    return rho * (omega**2) * (r_m**2) / 1.0e6  # Pa → MPa


def run_screen(
    inputs: TwinInputs,
    geometry: RingMeshGeometry,
    *,
    work_dir: Path,
    rpm_override: float | None = None,
) -> tuple[ScreenResults, dict[str, str]]:
    """Build deck, run ccx, parse screening stresses."""

    rpm = float(rpm_override if rpm_override is not None else inputs.max_rotor_speed_rpm)
    omega = rpm * 2.0 * math.pi / 60.0
    runtime = resolve_runtime()
    work_dir.mkdir(parents=True, exist_ok=True)
    inp_path = work_dir / f"{JOB_NAME}.inp"
    inp_path.write_text(build_inp(geometry, omega_rad_s=omega), encoding="utf-8")
    run_ccx(work_dir, runtime)
    dat_path = work_dir / f"{JOB_NAME}.dat"
    frd_path = work_dir / f"{JOB_NAME}.frd"
    if not dat_path.is_file() or dat_path.stat().st_size == 0:
        raise FiaRotorScreenError("ccx did not write the requested text results")
    if not frd_path.is_file() or frd_path.stat().st_size == 0:
        raise FiaRotorScreenError("ccx did not write the finite-element result database")
    max_disp, max_vm, max_prin = parse_dat(dat_path)
    yield_mpa = STEEL_YIELD_MPA
    fos = yield_mpa / max_vm if max_vm > 0.0 else float("inf")
    results = ScreenResults(
        operating_speed_rpm=rpm,
        omega_rad_s=round(omega, 6),
        omega2_rad2_s2=round(omega * omega, 3),
        max_abs_displacement_mm=round(max_disp, 6),
        max_von_mises_mpa=round(max_vm, 4),
        max_principal_stress_mpa=round(max_prin, 4),
        assumed_steel_yield_mpa=yield_mpa,
        screening_fos_vs_yield=round(fos, 3),
        below_assumed_yield=max_vm < yield_mpa,
        analytical_hoop_outer_mpa=round(analytical_hoop_outer_mpa(inputs), 4),
    )
    return results, runtime


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: RingMeshGeometry,
    results: ScreenResults,
    runtime: Mapping[str, str],
    source_state_sha256: str,
    source_twin: str,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release structural screen artefact."""

    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "ring_mesh": asdict(geometry),
        "screening_results": asdict(results),
        "margins": {
            "screening_fos_vs_assumed_yield": results.screening_fos_vs_yield,
            "below_assumed_yield": results.below_assumed_yield,
            "release_fos_closed": False,
            "note": (
                "SCREENING only against assumed isotropic steel yield "
                f"({STEEL_YIELD_MPA:.0f} MPa). Not laminate stack, not magnet-pocket "
                "burst, not sleeve retention, not fatigue. Never claim release FoS."
            ),
        },
        "solver": {
            "name": "CalculiX CrunchiX",
            "version": "2.21",
            "runtime": runtime["runtime"],
            "image": runtime.get("image") or None,
        },
        "material_assumptions": {
            "name": MATERIAL_NAME,
            "E_mpa": STEEL_E_MPA,
            "nu": STEEL_NU,
            "rho_tonne_mm3": STEEL_RHO_TONNE_MM3,
            "assumed_yield_mpa": STEEL_YIELD_MPA,
            "label": (
                "Assumed isotropic steel screening properties — not supplier "
                "laminate stack, magnet, or retention-sleeve material cards."
            ),
        },
        "model_assumptions": [
            "Coarse C3D8 quarter-ring solid from rotor ID to OD.",
            f"Axial length = {AXIAL_LENGTH_FRACTION:.0%} of twin active/stack length.",
            "Centrifugal *DLOAD CENTRIF at max_rotor_speed_rpm about the kit axis.",
            "Symmetry on θ=0 (UY) and θ=90° (UX); UZ fixed on z=0 face.",
            "No magnet pockets, bridges, sleeves, interference, or laminate anisotropy.",
            "No case / mount / joint / torque-reaction load cases.",
        ],
        "geometry_provenance": {
            "controlling_dimensions": (
                "state.fpkConcentricGeometry with orchestratorContract quantity fallbacks"
            ),
            "smoke_cantilever_used": False,
            "lucid_or_proprietary_cad_used": False,
            "statement": (
                "Kit-sized CalculiX ring sector from twin rotor OD/ID/active length; "
                "not the generic calculix_smoke_selftest cantilever."
            ),
        },
        "fia_question": (
            f"Does a steel-equivalent rotor ring survive centrifugal load at "
            f"{inputs.max_rotor_speed_rpm:,.0f} rpm as a SCREENING stress check?"
        ),
        "magnet_pocket_burst_fea": {
            "status": "OPEN",
            "reason": "This case is a solid-ring centrifugal screen only.",
        },
        "release_fos": {
            "status": "OPEN",
            "statement": (
                "Screening FoS vs assumed steel yield is informational. Release "
                "factor of safety requires signed material cards, retention "
                "detail, and correlated FEA — not closed here."
            ),
        },
        "release_statement": (
            "Concept evidence only. No FIA homologation, team interface closure, "
            "race evidence or permission to ship. Never claim PASS or closed "
            "release FoS from this screening case."
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
        "front_bay_envelope_w_mm": {"value": 343.0, "unit": "mm"},
        "front_bay_envelope_d_mm": {"value": 259.0, "unit": "mm"},
        "front_bay_envelope_h_mm": {"value": 267.0, "unit": "mm"},
        "fpk_mass_cap_kg": {"value": 32.0, "unit": "kg"},
        "fpk_rotor_od_mm": {"value": 122.0, "unit": "mm"},
        "fpk_rotor_id_mm": {"value": 92.7, "unit": "mm"},
        "stack_length_mm": {"value": 98.0, "unit": "mm"},
    }
    concentric = {
        "housing_od_mm": 176.7,
        "housing_len_mm": 141.1,
        "rotor_od_mm": 122.0,
        "rotor_id_mm": 92.7,
        "stack_len_mm": 98.0,
    }
    return quantities, concentric


def _make_work_dir(prefix: str) -> Path:
    """Create a Colima-visible work directory under scripts/motor-stack/."""

    stamp = time.strftime("%Y%m%d-%H%M%S")
    path = SCRIPT_DIR / f".calculix-fia-{prefix}.{stamp}.{os.getpid()}"
    path.mkdir(parents=True, exist_ok=False)
    return path


def run_selftest() -> int:
    """Prove twin binding, a real ccx centrifugal solve, and release honesty."""

    quantities, concentric = _synthetic_sections()
    inputs = inputs_from_sections(quantities, concentric)
    geometry = derive_ring_geometry(inputs)
    work_dir = _make_work_dir("selftest")
    soft_dir = _make_work_dir("selftest-soft")
    try:
        results, runtime = run_screen(inputs, geometry, work_dir=work_dir)
        # proveCatch: half rpm must drop stress — canned MPa cannot pass both.
        soft_results, _ = run_screen(
            inputs,
            geometry,
            work_dir=soft_dir,
            rpm_override=inputs.max_rotor_speed_rpm * 0.5,
        )
        artifact = build_artifact(
            inputs=inputs,
            geometry=geometry,
            results=results,
            runtime=runtime,
            source_state_sha256="synthetic-selftest",
            source_twin="synthetic-selftest",
        )
        hoop = results.analytical_hoop_outer_mpa
        checks = {
            "synthetic_quantities_control_geometry": (
                abs(geometry.rotor_outer_radius_mm - 61.0) < 1.0e-9
                and abs(geometry.rotor_inner_radius_mm - 46.35) < 1.0e-9
                and abs(geometry.axial_length_mm - 98.0 * AXIAL_LENGTH_FRACTION) < 1.0e-9
            ),
            "geometry_fits_twin_rotor": geometry.fits_twin_rotor,
            "stress_and_disp_positive_finite": (
                results.max_von_mises_mpa > 0.0
                and results.max_abs_displacement_mm > 0.0
                and math.isfinite(results.max_principal_stress_mpa)
            ),
            "stress_in_physical_screening_band": (
                5.0 < results.max_von_mises_mpa < 2000.0
            ),
            # ω² scaling: half rpm → ~¼ stress; allow broad numerical tolerance.
            "rpm_softening_proves_solver_catch": (
                soft_results.max_von_mises_mpa < 0.45 * results.max_von_mises_mpa
            ),
            "order_of_magnitude_vs_analytical_hoop": (
                0.25 * hoop < results.max_von_mises_mpa < 4.0 * hoop
            ),
            "operating_band_is_19500": inputs.max_rotor_speed_rpm == 19_500.0,
            "release_honesty": (
                artifact["status"] in {"OPEN", "PARTIAL"}
                and artifact["ship_ok"] is False
                and artifact["margins"]["release_fos_closed"] is False
                and artifact["magnet_pocket_burst_fea"]["status"] == "OPEN"
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
                    "half_rpm_von_mises_mpa": soft_results.max_von_mises_mpa,
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
        shutil.rmtree(soft_dir, ignore_errors=True)


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist one centrifugal screen against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    geometry = derive_ring_geometry(inputs)
    if not geometry.fits_twin_rotor:
        raise FiaRotorScreenError(
            "Twin-controlled ring mesh does not fit its housing envelope"
        )
    work_dir = _make_work_dir("live")
    try:
        results, runtime = run_screen(inputs, geometry, work_dir=work_dir)
        if not (
            5.0 < results.max_von_mises_mpa < 2000.0
            and math.isfinite(results.screening_fos_vs_yield)
        ):
            raise FiaRotorScreenError(
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
            else twin_dir / "_motor_stack" / "calculix_fia_rotor_screen.json"
        )
        _atomic_write_json(destination, artifact)
        yield_word = "below" if results.below_assumed_yield else "ABOVE"
        print(
            "FIA front-kit rotor centrifugal screen: "
            f"max von Mises ≈ {results.max_von_mises_mpa:.1f} MPa, "
            f"max principal ≈ {results.max_principal_stress_mpa:.1f} MPa, "
            f"|U|_max ≈ {results.max_abs_displacement_mm:.4f} mm "
            f"at {inputs.max_rotor_speed_rpm:,.0f} rpm "
            f"(analytical outer hoop ~{results.analytical_hoop_outer_mpa:.1f} MPa). "
            f"Screening FoS vs assumed {STEEL_YIELD_MPA:.0f} MPa steel ≈ "
            f"×{results.screening_fos_vs_yield:.2f} ({yield_word} yield). "
            f"Mesh: Ø{inputs.rotor_inner_diameter_mm:.1f}–"
            f"{inputs.rotor_outer_diameter_mm:.1f} mm × "
            f"{geometry.axial_length_mm:.2f} mm quarter ring "
            f"({geometry.element_count} {geometry.element_type}). "
            f"Runtime={runtime['runtime']}. "
            "Magnet-pocket burst and release FoS remain OPEN; ship_ok is false."
        )
        print(f"Artefact: {destination}")
        return 0
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description=(
            "Solve the FIA-bound Formula E front-kit CalculiX rotor "
            "centrifugal screening case."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="run synthetic binding plus half-rpm stress proveCatch",
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
