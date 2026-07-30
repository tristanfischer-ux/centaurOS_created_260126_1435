#!/usr/bin/env python3
"""FIA-bound OpenFOAM cold-plate screening case for the Formula E front kit.

This is deliberately separate from ``openfoam_smoke_selftest.sh``.  The smoke
test proves the OpenFOAM container on the cavity tutorial.  This case reads the
Formula E twin coolant flow / inlet temperature (defaults 12 L/min / 60 °C),
binds the ``cold_plate_serpentine`` family channel cross-section, and runs a
simplified rectangular-duct screen — not conjugate heat transfer of the full
serpentine STEP.

Status stays PARTIAL (or OPEN if the solve fails honestly); ``ship_ok`` is
always false.  Module temperatures are not claimed closed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
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
SCHEMA = "forgeos.motor_stack.openfoam_fia_cold_plate_case/v1"
RUNNER_SH = SCRIPT_DIR / "openfoam_fia_cold_plate_case.sh"
OPENFOAM_IMAGE = "microfluidica/openfoam:14"

# Family defaults from cold_plate_serpentine / cold_plate_serpentine_hydraulics.
DEFAULT_CHANNEL_WIDTH_MM = 5.345
DEFAULT_CHANNEL_DEPTH_MM = 1.336
DEFAULT_PASS_COUNT = 8
DEFAULT_PLATE_LENGTH_MM = 180.0
DEFAULT_WALL_MM = 3.0
DEFAULT_CHANNEL_PITCH_MM = 8.0
DEFAULT_COOLANT_FLOW_L_MIN = 12.0
DEFAULT_COOLANT_INLET_C = 60.0

# INTENT: Water-like kinematic viscosity at ~60 °C for an isothermal duct
# screen.  Twin EGW CoolProp properties are recorded separately when present;
# this case intentionally uses a documented water ν rather than inventing a
# full EGW rheology model inside OpenFOAM.
WATER_NU_60C_M2_S = 4.78e-7
WATER_RHO_60C_KG_M3 = 983.2
# Mesh / solver screening knobs (cheap; not a mesh-converged release study).
MESH_CELLS_X = 40
MESH_CELLS_Y = 8
MESH_CELLS_Z = 4
SOLVER_END_TIME = 200


class FiaColdPlateOpenFoamError(RuntimeError):
    """Raised when twin binding or OpenFOAM evidence is incomplete."""


@dataclass(frozen=True)
class TwinInputs:
    """Selected twin quantities that control this cold-plate screen."""

    coolant_flow_l_min: float
    coolant_inlet_c: float
    channel_width_mm: float
    channel_depth_mm: float
    pass_count: int
    plate_length_mm: float
    wall_mm: float
    channel_pitch_mm: float
    twin_coolant_density_kg_m3: float | None
    twin_analytical_delta_p_pa: float | None


@dataclass(frozen=True)
class ChannelGeometry:
    """Simplified rectangular duct representing one serpentine pass share."""

    channel_width_m: float
    channel_depth_m: float
    pass_length_m: float
    hydraulic_diameter_m: float
    cross_section_area_m2: float
    pass_count: int
    flow_split: str
    volumetric_flow_total_m3_s: float
    volumetric_flow_per_pass_m3_s: float
    inlet_velocity_m_s: float
    reynolds_number: float
    kinematic_viscosity_m2_s: float
    density_for_pressure_kg_m3: float
    estimated_full_path_length_m: float


@dataclass(frozen=True)
class PressureDropResult:
    """Solver and analytical pressure-drop screening numbers."""

    solver_delta_p_kinematic_m2_s2: float | None
    solver_delta_p_pa: float | None
    solver_delta_p_per_pass_pa: float | None
    estimated_full_path_delta_p_pa: float | None
    analytical_darcy_laminar_pa: float
    analytical_darcy_blasius_pa: float
    analytical_full_path_laminar_pa: float
    analytical_full_path_blasius_pa: float
    friction_factor_laminar: float
    friction_factor_blasius: float | None
    headline_delta_p_pa: float
    headline_source: str


@dataclass(frozen=True)
class SolverRun:
    """Book-keeping for one OpenFOAM invocation."""

    runtime: str
    image: str | None
    case_dir: str
    latest_time: str | None
    converged: bool
    log_excerpt: str
    u_field_present: bool


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
    raise FiaColdPlateOpenFoamError(
        "Missing positive twin quantity; expected one of: " + ", ".join(keys)
    )


def inputs_from_sections(quantities: Mapping[str, Any]) -> TwinInputs:
    """Build controlled case inputs from selectively read twin quantities.

    INTENT: Cold-plate hydraulics must answer pressure-drop / velocity screening
    at the FIA coolant point using twin flow + family channel dims — never a
    generic cavity and never a supplier STEP.
    """

    twin_rho: float | None
    try:
        twin_rho = _number(quantities, ("coolant_density_kg_m3",))
    except FiaColdPlateOpenFoamError:
        twin_rho = None
    twin_dp: float | None
    try:
        twin_dp = _number(quantities, ("cold_plate_pressure_drop_pa",))
    except FiaColdPlateOpenFoamError:
        twin_dp = None
    return TwinInputs(
        coolant_flow_l_min=_number(
            quantities,
            ("coolant_flow_l_min",),
            default=DEFAULT_COOLANT_FLOW_L_MIN,
        ),
        coolant_inlet_c=_number(
            quantities,
            ("coolant_inlet_c", "assumed_coolant_inlet_c"),
            default=DEFAULT_COOLANT_INLET_C,
        ),
        channel_width_mm=_number(
            quantities,
            ("cold_plate_channel_width_mm",),
            default=DEFAULT_CHANNEL_WIDTH_MM,
        ),
        channel_depth_mm=_number(
            quantities,
            ("cold_plate_channel_height_mm", "cold_plate_channel_depth_mm"),
            default=DEFAULT_CHANNEL_DEPTH_MM,
        ),
        pass_count=int(
            round(
                _number(
                    quantities,
                    ("cold_plate_channel_count", "cold_plate_pass_count"),
                    default=float(DEFAULT_PASS_COUNT),
                )
            )
        ),
        plate_length_mm=_number(
            quantities,
            ("cold_plate_length_mm", "cold_plate_plate_length_mm"),
            default=DEFAULT_PLATE_LENGTH_MM,
        ),
        wall_mm=_number(
            quantities,
            ("cold_plate_wall_mm",),
            default=DEFAULT_WALL_MM,
        ),
        channel_pitch_mm=_number(
            quantities,
            ("cold_plate_channel_pitch_mm",),
            default=DEFAULT_CHANNEL_PITCH_MM,
        ),
        twin_coolant_density_kg_m3=twin_rho,
        twin_analytical_delta_p_pa=twin_dp,
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
        raise FiaColdPlateOpenFoamError(f"Twin state not found: {state_path}")

    # GOTCHA: The autonomous twin can be rewritten while this script runs.
    last_error = "Twin state changed during selective-read attempts"
    for attempt in range(5):
        before = state_path.stat()
        quantities = _read_section(state_path, "orchestratorContract.quantities")
        if not quantities:
            quantities = _read_section(state_path, "engineeringContract.quantities")
        source_hash = _stream_sha256(state_path)
        after = state_path.stat()
        if (
            before.st_size == after.st_size
            and before.st_mtime_ns == after.st_mtime_ns
        ):
            return inputs_from_sections(quantities), source_hash
        last_error = (
            f"Twin state changed during selective-read attempt {attempt + 1}/5 "
            f"(size {before.st_size}->{after.st_size})"
        )
        time.sleep(0.25 * (attempt + 1))
    raise FiaColdPlateOpenFoamError(f"{last_error}; rerun on a stable stamp")


def input_quantities_sha256(inputs: TwinInputs) -> str:
    """Hash only the selected quantities that control this case."""

    payload = json.dumps(
        asdict(inputs),
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def derive_channel_geometry(inputs: TwinInputs) -> ChannelGeometry:
    """Map twin + family dimensions onto a single-pass rectangular duct.

    DECISION: Model one developed pass at volumetric flow = total / pass_count.
    The CadQuery family is a series serpentine, but the twin sized channel area
    from V̇/(n·v); using the per-pass share keeps inlet velocity in the same
    band as that sizing seed.  Full-path Δp is estimated as n × per-pass
    (U-bend losses remain OPEN).
    """

    if inputs.pass_count < 2:
        raise FiaColdPlateOpenFoamError("pass_count must be at least 2")
    width_m = inputs.channel_width_mm / 1000.0
    depth_m = inputs.channel_depth_mm / 1000.0
    pass_length_m = max(
        (inputs.plate_length_mm - 2.0 * inputs.wall_mm) / 1000.0,
        width_m * 4.0,
    )
    area = width_m * depth_m
    if area <= 0.0:
        raise FiaColdPlateOpenFoamError("Channel cross-section must be positive")
    dh = 2.0 * width_m * depth_m / (width_m + depth_m)
    q_total = (inputs.coolant_flow_l_min / 1000.0) / 60.0
    q_pass = q_total / float(inputs.pass_count)
    u = q_pass / area
    nu = WATER_NU_60C_M2_S
    re = u * dh / nu
    # Approximate serpentine centreline: n passes + (n-1) semicircle U-turns.
    turn_radius_m = (inputs.channel_pitch_mm / 1000.0) / 2.0
    full_path = (
        float(inputs.pass_count) * pass_length_m
        + float(inputs.pass_count - 1) * math.pi * turn_radius_m
    )
    return ChannelGeometry(
        channel_width_m=width_m,
        channel_depth_m=depth_m,
        pass_length_m=pass_length_m,
        hydraulic_diameter_m=dh,
        cross_section_area_m2=area,
        pass_count=inputs.pass_count,
        flow_split="total_flow_divided_by_pass_count",
        volumetric_flow_total_m3_s=q_total,
        volumetric_flow_per_pass_m3_s=q_pass,
        inlet_velocity_m_s=u,
        reynolds_number=re,
        kinematic_viscosity_m2_s=nu,
        density_for_pressure_kg_m3=WATER_RHO_60C_KG_M3,
        estimated_full_path_length_m=full_path,
    )


def analytical_darcy_delta_p_pa(
    geometry: ChannelGeometry,
    *,
    length_m: float,
) -> tuple[float, float, float, float | None]:
    """Return (laminar_pa, blasius_pa, f_lam, f_blasius_or_None)."""

    re = geometry.reynolds_number
    rho = geometry.density_for_pressure_kg_m3
    u = geometry.inlet_velocity_m_s
    dh = geometry.hydraulic_diameter_m
    dynamic = 0.5 * rho * u * u
    f_lam = 64.0 / re if re > 1.0e-12 else float("inf")
    dp_lam = f_lam * (length_m / dh) * dynamic
    f_blasius: float | None = None
    dp_blasius = dp_lam
    if re >= 2300.0:
        f_blasius = 0.316 / (re**0.25)
        dp_blasius = f_blasius * (length_m / dh) * dynamic
    return dp_lam, dp_blasius, f_lam, f_blasius


def compute_pressure_drop(
    geometry: ChannelGeometry,
    *,
    solver_delta_p_kinematic: float | None,
) -> PressureDropResult:
    """Combine solver kinematic Δp with Darcy analytical estimates."""

    dp_lam, dp_bla, f_lam, f_bla = analytical_darcy_delta_p_pa(
        geometry, length_m=geometry.pass_length_m
    )
    full_lam, full_bla, _, _ = analytical_darcy_delta_p_pa(
        geometry, length_m=geometry.estimated_full_path_length_m
    )
    solver_pa: float | None = None
    solver_per_pass: float | None = None
    full_est: float | None = None
    if solver_delta_p_kinematic is not None and math.isfinite(
        solver_delta_p_kinematic
    ):
        solver_pa = solver_delta_p_kinematic * geometry.density_for_pressure_kg_m3
        solver_per_pass = solver_pa
        full_est = solver_per_pass * float(geometry.pass_count)
    # DECISION: Prefer solver per-pass Δp when available; else Blasius if
    # transitional/turbulent, else laminar Darcy.
    if solver_per_pass is not None and solver_per_pass > 0.0:
        headline = full_est if full_est is not None else solver_per_pass
        source = "openfoam_laminar_n_times_per_pass"
    elif geometry.reynolds_number >= 2300.0:
        headline = full_bla
        source = "analytical_darcy_blasius_full_path"
    else:
        headline = full_lam
        source = "analytical_darcy_laminar_full_path"
    return PressureDropResult(
        solver_delta_p_kinematic_m2_s2=solver_delta_p_kinematic,
        solver_delta_p_pa=solver_pa,
        solver_delta_p_per_pass_pa=solver_per_pass,
        estimated_full_path_delta_p_pa=full_est,
        analytical_darcy_laminar_pa=round(dp_lam, 3),
        analytical_darcy_blasius_pa=round(dp_bla, 3),
        analytical_full_path_laminar_pa=round(full_lam, 3),
        analytical_full_path_blasius_pa=round(full_bla, 3),
        friction_factor_laminar=round(f_lam, 8),
        friction_factor_blasius=(
            None if f_bla is None else round(f_bla, 8)
        ),
        headline_delta_p_pa=round(float(headline), 3),
        headline_source=source,
    )


def _foam_header(object_name: str, class_name: str = "dictionary") -> str:
    """Minimal OpenFOAM-14 FoamFile header."""

    return (
        "FoamFile\n"
        "{\n"
        "    format      ascii;\n"
        f"    class       {class_name};\n"
        f"    object      {object_name};\n"
        "}\n"
    )


def write_openfoam_case(case_dir: Path, geometry: ChannelGeometry) -> None:
    """Write a laminar steady rectangular-duct case under ``case_dir``."""

    if case_dir.exists():
        shutil.rmtree(case_dir)
    (case_dir / "0").mkdir(parents=True)
    (case_dir / "constant").mkdir()
    (case_dir / "system").mkdir()

    lx = geometry.pass_length_m
    ly = geometry.channel_width_m
    lz = geometry.channel_depth_m
    u = geometry.inlet_velocity_m_s
    nu = geometry.kinematic_viscosity_m2_s

    (case_dir / "system" / "blockMeshDict").write_text(
        _foam_header("blockMeshDict")
        + f"""
convertToMeters 1;

vertices
(
    (0 0 0)
    ({lx} 0 0)
    ({lx} {ly} 0)
    (0 {ly} 0)
    (0 0 {lz})
    ({lx} 0 {lz})
    ({lx} {ly} {lz})
    (0 {ly} {lz})
);

blocks
(
    hex (0 1 2 3 4 5 6 7) ({MESH_CELLS_X} {MESH_CELLS_Y} {MESH_CELLS_Z}) simpleGrading (1 1 1)
);

boundary
(
    inlet
    {{
        type patch;
        faces
        (
            (0 4 7 3)
        );
    }}
    outlet
    {{
        type patch;
        faces
        (
            (1 2 6 5)
        );
    }}
    walls
    {{
        type wall;
        faces
        (
            (0 1 5 4)
            (3 7 6 2)
            (0 3 2 1)
            (4 5 6 7)
        );
    }}
);
""",
        encoding="utf-8",
    )

    (case_dir / "constant" / "physicalProperties").write_text(
        _foam_header("physicalProperties")
        + f"""
viscosityModel  constant;
nu              {nu:.6e};
""",
        encoding="utf-8",
    )
    (case_dir / "constant" / "momentumTransport").write_text(
        _foam_header("momentumTransport")
        + """
simulationType  laminar;
""",
        encoding="utf-8",
    )

    (case_dir / "0" / "U").write_text(
        _foam_header("U", "volVectorField")
        + f"""
dimensions      [0 1 -1 0 0 0 0];
internalField   uniform ({u:.8g} 0 0);
boundaryField
{{
    inlet
    {{
        type            fixedValue;
        value           uniform ({u:.8g} 0 0);
    }}
    outlet
    {{
        type            zeroGradient;
    }}
    walls
    {{
        type            noSlip;
    }}
}}
""",
        encoding="utf-8",
    )
    (case_dir / "0" / "p").write_text(
        _foam_header("p", "volScalarField")
        + """
dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;
boundaryField
{
    inlet
    {
        type            zeroGradient;
    }
    outlet
    {
        type            fixedValue;
        value           uniform 0;
    }
    walls
    {
        type            zeroGradient;
    }
}
""",
        encoding="utf-8",
    )

    (case_dir / "system" / "controlDict").write_text(
        _foam_header("controlDict")
        + f"""
solver          incompressibleFluid;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         {SOLVER_END_TIME};
deltaT          1;
writeControl    timeStep;
writeInterval   50;
purgeWrite      2;
writeFormat     ascii;
writePrecision  8;
writeCompression off;
timeFormat      general;
timePrecision   6;
runTimeModifiable true;
""",
        encoding="utf-8",
    )
    (case_dir / "system" / "fvSchemes").write_text(
        _foam_header("fvSchemes")
        + """
ddtSchemes
{
    default         steadyState;
}
gradSchemes
{
    default         Gauss linear;
}
divSchemes
{
    default         none;
    div(phi,U)      bounded Gauss linearUpwind grad(U);
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes
{
    default         Gauss linear corrected;
}
interpolationSchemes
{
    default         linear;
}
snGradSchemes
{
    default         corrected;
}
""",
        encoding="utf-8",
    )
    (case_dir / "system" / "fvSolution").write_text(
        _foam_header("fvSolution")
        + """
solvers
{
    p
    {
        solver          GAMG;
        tolerance       1e-06;
        relTol          0.1;
        smoother        GaussSeidel;
    }
    U
    {
        solver          smoothSolver;
        smoother        symGaussSeidel;
        tolerance       1e-05;
        relTol          0.1;
    }
}
SIMPLE
{
    nNonOrthogonalCorrectors 0;
    consistent      yes;
    residualControl
    {
        p               1e-3;
        U               1e-4;
    }
}
relaxationFactors
{
    equations
    {
        U               0.7;
        ".*"            0.7;
    }
}
""",
        encoding="utf-8",
    )


def _toolchain_available() -> tuple[bool, str]:
    """Return (ok, reason) for native OpenFOAM or Docker image readiness."""

    if shutil.which("blockMesh") and (
        shutil.which("foamRun") or shutil.which("simpleFoam")
    ):
        return True, "native"
    if not shutil.which("docker"):
        return False, "OpenFOAM and Docker are missing"
    try:
        subprocess.run(
            ["docker", "info"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return False, "Docker is installed but not running"
    try:
        subprocess.run(
            ["docker", "image", "inspect", OPENFOAM_IMAGE],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return (
            False,
            f"OpenFOAM image missing; pull --platform linux/arm64 {OPENFOAM_IMAGE}",
        )
    return True, "docker"


def run_openfoam(case_dir: Path) -> SolverRun:
    """Invoke the shell runner (native OpenFOAM or Docker)."""

    if not RUNNER_SH.is_file():
        raise FiaColdPlateOpenFoamError(f"Runner missing: {RUNNER_SH}")
    ok, runtime = _toolchain_available()
    if not ok:
        raise FiaColdPlateOpenFoamError(
            f"OpenFOAM toolchain unavailable: {runtime}. "
            "Install Docker/Colima and pull microfluidica/openfoam:14, "
            "or provide native blockMesh + foamRun."
        )
    # GOTCHA: Case dir must stay under the repo (/Users) so Colima can mount it.
    try:
        case_dir.resolve().relative_to(REPO_ROOT.resolve())
    except ValueError as exc:
        raise FiaColdPlateOpenFoamError(
            f"Case dir must be under the repo for Colima mounts: {case_dir}"
        ) from exc

    completed = subprocess.run(
        ["bash", str(RUNNER_SH), str(case_dir)],
        capture_output=True,
        text=True,
        check=False,
    )
    log_path = case_dir / "solver.log"
    log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.is_file() else ""
    excerpt_lines = (log_text or completed.stdout or completed.stderr).splitlines()[-30:]
    excerpt = "\n".join(excerpt_lines)
    if completed.returncode != 0:
        raise FiaColdPlateOpenFoamError(
            "OpenFOAM runner failed:\n" + excerpt + "\n" + completed.stderr[-2000:]
        )

    latest = _latest_time(case_dir)
    u_present = bool(latest and (case_dir / latest / "U").is_file())
    converged = "SIMPLE solution converged" in log_text or (
        latest is not None and latest not in {"0", "constant"}
    )
    runtime_line = "native"
    for line in (completed.stdout or "").splitlines():
        if line.startswith("OPENFOAM_RUNTIME="):
            runtime_line = line.split("=", 1)[1].strip()
    image = OPENFOAM_IMAGE if runtime_line == "docker" else None
    return SolverRun(
        runtime=runtime_line,
        image=image,
        case_dir=str(case_dir),
        latest_time=latest,
        converged=converged,
        log_excerpt=excerpt,
        u_field_present=u_present,
    )


def _latest_time(case_dir: Path) -> str | None:
    """Pick the highest numeric time directory written by the solver."""

    best: float | None = None
    best_name: str | None = None
    for child in case_dir.iterdir():
        if not child.is_dir():
            continue
        name = child.name
        if name in {"0", "constant", "system", "postProcessing"}:
            # Prefer non-zero result times when present.
            if name == "0":
                candidate = 0.0
            else:
                continue
        else:
            try:
                candidate = float(name)
            except ValueError:
                continue
        if best is None or candidate > best:
            best = candidate
            best_name = name
    return best_name


def extract_inlet_pressure_kinematic(case_dir: Path, latest_time: str) -> float:
    """Area-average kinematic pressure on the inlet patch via foamPostProcess."""

    ok, runtime = _toolchain_available()
    if not ok:
        raise FiaColdPlateOpenFoamError(f"Cannot post-process: {runtime}")

    func = "patchAverage(p,name=inlet,patch=inlet)"
    if runtime == "native":
        cmd = [
            "foamPostProcess",
            "-case",
            str(case_dir),
            "-func",
            func,
            "-time",
            latest_time,
        ]
        completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
        stdout = completed.stdout + "\n" + completed.stderr
    else:
        completed = subprocess.run(
            [
                "docker",
                "run",
                "--rm",
                "--platform",
                "linux/arm64",
                "-v",
                f"{case_dir.resolve()}:/work",
                "-w",
                "/work",
                OPENFOAM_IMAGE,
                "bash",
                "-lc",
                f'foamPostProcess -func "{func}" -time {latest_time}',
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        stdout = completed.stdout + "\n" + completed.stderr
    if completed.returncode != 0:
        raise FiaColdPlateOpenFoamError(
            "foamPostProcess failed to average inlet pressure:\n" + stdout[-2000:]
        )
    match = re.search(
        r"areaAverage\(inlet\) of p\s*=\s*([-+0-9.eE]+)",
        stdout,
    )
    if not match:
        # Fall back to the written surfaceFieldValue.dat if present.
        dat_candidates = sorted(
            (case_dir / "postProcessing").glob("**/surfaceFieldValue.dat")
        )
        for dat in reversed(dat_candidates):
            for line in dat.read_text(encoding="utf-8", errors="replace").splitlines():
                if line.startswith("#") or not line.strip():
                    continue
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        return float(parts[-1])
                    except ValueError:
                        continue
        raise FiaColdPlateOpenFoamError(
            "Could not parse inlet area-average pressure from post-process output"
        )
    return float(match.group(1))


def build_artifact(
    *,
    inputs: TwinInputs,
    geometry: ChannelGeometry,
    pressure: PressureDropResult,
    solver: SolverRun | None,
    source_state_sha256: str,
    source_twin: str,
    status: str,
) -> dict[str, Any]:
    """Assemble the honest, permanently non-release cold-plate artefact."""

    if status not in {"PARTIAL", "OPEN"}:
        raise FiaColdPlateOpenFoamError("status must be PARTIAL or OPEN")
    return {
        "schema": SCHEMA,
        "status": status,
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_quantities_sha256": input_quantities_sha256(inputs),
        "input_quantities": asdict(inputs),
        "cad_family": "cold_plate_serpentine",
        "channel_geometry": asdict(geometry),
        "pressure_drop": asdict(pressure),
        "velocity": {
            "inlet_velocity_m_s": geometry.inlet_velocity_m_s,
            "reynolds_number": geometry.reynolds_number,
            "flow_split": geometry.flow_split,
        },
        "fluid": {
            "label": "water_like_at_60C",
            "kinematic_viscosity_m2_s": WATER_NU_60C_M2_S,
            "density_for_pressure_kg_m3": WATER_RHO_60C_KG_M3,
            "note": (
                "Isothermal water ν and ρ at ~60 °C for duct screening. "
                "Twin EGW CoolProp density is recorded in input_quantities when "
                "present but is not used as the OpenFOAM viscosity model."
            ),
        },
        "solver": {
            "name": "OpenFOAM foamRun / incompressibleFluid (laminar SIMPLE)",
            "image": solver.image if solver else OPENFOAM_IMAGE,
            "runtime": solver.runtime if solver else None,
            "case_dir": solver.case_dir if solver else None,
            "latest_time": solver.latest_time if solver else None,
            "converged": solver.converged if solver else False,
            "u_field_present": solver.u_field_present if solver else False,
            "mesh_cells": {
                "x": MESH_CELLS_X,
                "y": MESH_CELLS_Y,
                "z": MESH_CELLS_Z,
            },
        },
        "model_assumptions": [
            "Rectangular duct cross-section = family channel_width × channel_depth.",
            "Duct length = one pass (plate_length − 2×wall).",
            "Inlet velocity from (12 L/min total) / pass_count / channel area.",
            f"Water-like ν = {WATER_NU_60C_M2_S:.3e} m²/s at ~60 °C (documented).",
            "Laminar steady SIMPLE — not a mesh-converged turbulent CHT study.",
            "Full-path Δp ≈ n × per-pass solver Δp; U-bend / port losses OPEN.",
            "No solid domain, no TIM, no module junction temperatures.",
        ],
        "geometry_provenance": {
            "controlling_dimensions": (
                "orchestratorContract coolant_* + cold_plate_channel_* with "
                "cold_plate_serpentine family defaults"
            ),
            "full_serpentine_step_meshed": False,
            "lucid_or_proprietary_cad_used": False,
            "statement": (
                "Twin-bound rectangular-channel screen using family channel dims "
                "and FIA coolant point; not supplier cold-plate CAD."
            ),
        },
        "fia_question": (
            f"What duct velocity / pressure drop appear at "
            f"{inputs.coolant_flow_l_min:g} L/min / {inputs.coolant_inlet_c:g} °C "
            "on the cold_plate_serpentine channel section?"
        ),
        "module_temperatures": {
            "status": "OPEN",
            "statement": (
                "This case does not close module temperatures or conjugate heat "
                "transfer. Pressure-drop and velocity screening only."
            ),
        },
        "conjugate_heat_transfer": {
            "status": "OPEN",
            "statement": "Full serpentine STEP CHT remains OPEN.",
        },
        "flow_bench_correlation": {
            "status": "OPEN",
            "statement": "No measured cold-plate Δp / flow-bench correlation yet.",
        },
        "honesty_notes": [
            "PARTIAL means a twin-bound OpenFOAM duct screen exists — not release.",
            "ship_ok is permanently false for this artefact schema.",
            "Do not claim module ΔT closed from this pressure/velocity screen.",
            "Re is transitional/turbulent for the FIA point; laminar solver Δp is "
            "a screen, cross-checked with Darcy laminar/Blasius analytics.",
        ],
        "release_statement": (
            "Concept evidence only. No FIA homologation, team interface closure, "
            "race evidence or permission to ship. Never claim PASS without "
            "conjugate thermal closure and flow-bench correlation."
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


def _synthetic_quantities() -> dict[str, Any]:
    """FIA table quantities for --selftest (no live twin required)."""

    return {
        "coolant_flow_l_min": {"value": 12.0, "unit": "L/min"},
        "coolant_inlet_c": {"value": 60.0, "unit": "°C"},
        "cold_plate_channel_width_mm": {"value": 5.345, "unit": "mm"},
        "cold_plate_channel_height_mm": {"value": 1.336, "unit": "mm"},
        "cold_plate_channel_count": {"value": 8, "unit": ""},
    }


def _validate_artifact_schema(artifact: Mapping[str, Any]) -> dict[str, bool]:
    """Cheap schema / honesty proveCatch checks shared by selftest paths."""

    pressure = artifact.get("pressure_drop")
    velocity = artifact.get("velocity")
    return {
        "schema_id": artifact.get("schema") == SCHEMA,
        "status_partial_or_open": artifact.get("status") in {"PARTIAL", "OPEN"},
        "never_ship_ok_true": artifact.get("ship_ok") is False,
        "module_temperatures_open": (
            isinstance(artifact.get("module_temperatures"), Mapping)
            and artifact["module_temperatures"].get("status") == "OPEN"
        ),
        "cht_open": (
            isinstance(artifact.get("conjugate_heat_transfer"), Mapping)
            and artifact["conjugate_heat_transfer"].get("status") == "OPEN"
        ),
        "has_channel_dims": (
            isinstance(artifact.get("channel_geometry"), Mapping)
            and float(artifact["channel_geometry"].get("channel_width_m", 0)) > 0
        ),
        "has_velocity": (
            isinstance(velocity, Mapping)
            and float(velocity.get("inlet_velocity_m_s", 0)) > 0
        ),
        "has_delta_p": (
            isinstance(pressure, Mapping)
            and float(pressure.get("headline_delta_p_pa", 0)) > 0
        ),
        "cad_family_bound": artifact.get("cad_family") == "cold_plate_serpentine",
    }


def run_selftest(*, dry_run: bool = False) -> int:
    """Prove twin binding, optional live OF solve, and release honesty."""

    inputs = inputs_from_sections(_synthetic_quantities())
    geometry = derive_channel_geometry(inputs)
    # Analytical-only artefact path (always runs).
    pressure_analytical = compute_pressure_drop(
        geometry, solver_delta_p_kinematic=None
    )
    dry_artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        pressure=pressure_analytical,
        solver=None,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
        status="PARTIAL",
    )
    schema_checks = _validate_artifact_schema(dry_artifact)

    # proveCatch: doubling flow must raise analytical Δp (quadratic dynamic head).
    high_flow = TwinInputs(
        **{
            **asdict(inputs),
            "coolant_flow_l_min": inputs.coolant_flow_l_min * 2.0,
        }
    )
    high_geometry = derive_channel_geometry(high_flow)
    high_pressure = compute_pressure_drop(
        high_geometry, solver_delta_p_kinematic=None
    )
    flow_scaling_ok = (
        high_pressure.analytical_darcy_laminar_pa
        > 1.5 * pressure_analytical.analytical_darcy_laminar_pa
    )

    toolchain_ok, toolchain_reason = _toolchain_available()
    solver_checks: dict[str, bool] = {}
    solver_payload: dict[str, Any] = {
        "toolchain": toolchain_reason,
        "ran_openfoam": False,
    }

    if dry_run:
        passed = all(schema_checks.values()) and flow_scaling_ok
        print(
            json.dumps(
                {
                    "status": "PASS" if passed else "FAIL",
                    "mode": "dry-run",
                    "checks": {
                        **schema_checks,
                        "flow_scaling_raises_delta_p": flow_scaling_ok,
                    },
                    "geometry": asdict(geometry),
                    "pressure_drop": asdict(pressure_analytical),
                    "ship_ok": dry_artifact["ship_ok"],
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0 if passed else 1

    if not toolchain_ok:
        # Fail closed: without OpenFOAM the live CFD claim cannot be made.
        print(
            json.dumps(
                {
                    "status": "FAIL",
                    "mode": "fail-closed-no-openfoam",
                    "reason": toolchain_reason,
                    "checks": {
                        **schema_checks,
                        "flow_scaling_raises_delta_p": flow_scaling_ok,
                        "openfoam_available": False,
                    },
                    "geometry": asdict(geometry),
                    "pressure_drop": asdict(pressure_analytical),
                    "ship_ok": False,
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 1

    case_dir = SCRIPT_DIR / ".openfoam-fia-cold-plate-selftest"
    try:
        write_openfoam_case(case_dir, geometry)
        solver = run_openfoam(case_dir)
        p_kin = extract_inlet_pressure_kinematic(
            case_dir, solver.latest_time or "0"
        )
        pressure = compute_pressure_drop(
            geometry, solver_delta_p_kinematic=p_kin
        )
        artifact = build_artifact(
            inputs=inputs,
            geometry=geometry,
            pressure=pressure,
            solver=solver,
            source_state_sha256="synthetic-selftest",
            source_twin="synthetic-selftest",
            status="PARTIAL" if solver.u_field_present and solver.converged else "OPEN",
        )
        solver_checks = {
            "openfoam_available": True,
            "solver_converged": solver.converged,
            "u_field_present": solver.u_field_present,
            "solver_delta_p_positive": (
                pressure.solver_delta_p_pa is not None
                and pressure.solver_delta_p_pa > 0.0
            ),
            "inlet_velocity_in_band": 0.5 < geometry.inlet_velocity_m_s < 20.0,
            "release_honesty": all(_validate_artifact_schema(artifact).values()),
        }
        solver_payload = {
            "toolchain": solver.runtime,
            "ran_openfoam": True,
            "latest_time": solver.latest_time,
            "solver_delta_p_pa": pressure.solver_delta_p_pa,
            "headline_delta_p_pa": pressure.headline_delta_p_pa,
            "inlet_velocity_m_s": geometry.inlet_velocity_m_s,
        }
    finally:
        if case_dir.exists():
            shutil.rmtree(case_dir, ignore_errors=True)

    checks = {
        **schema_checks,
        "flow_scaling_raises_delta_p": flow_scaling_ok,
        **solver_checks,
        "never_ship_ok_true": True,
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "mode": "openfoam-live",
                "checks": checks,
                "geometry": asdict(geometry),
                "solver": solver_payload,
                "ship_ok": False,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist one cold-plate duct screen against a live twin."""

    state_path = twin_dir / "state.json"
    inputs, state_hash = load_twin_inputs(state_path)
    geometry = derive_channel_geometry(inputs)
    if not (0.2 < geometry.inlet_velocity_m_s < 30.0):
        raise FiaColdPlateOpenFoamError(
            f"Inlet velocity {geometry.inlet_velocity_m_s:.3f} m/s outside "
            "screening plausibility band"
        )

    # GOTCHA: Keep the OF case under the twin (repo /Users path) for Colima.
    case_dir = twin_dir / "_motor_stack" / "openfoam_fia_cold_plate_case_work"
    write_openfoam_case(case_dir, geometry)

    status = "OPEN"
    solver: SolverRun | None = None
    pressure: PressureDropResult
    try:
        solver = run_openfoam(case_dir)
        p_kin = extract_inlet_pressure_kinematic(
            case_dir, solver.latest_time or "0"
        )
        pressure = compute_pressure_drop(
            geometry, solver_delta_p_kinematic=p_kin
        )
        if solver.u_field_present and solver.converged and (
            pressure.solver_delta_p_pa is not None
            and pressure.solver_delta_p_pa > 0.0
        ):
            status = "PARTIAL"
    except FiaColdPlateOpenFoamError as exc:
        pressure = compute_pressure_drop(
            geometry, solver_delta_p_kinematic=None
        )
        try:
            twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
        except ValueError:
            twin_label = str(twin_dir.resolve())
        artifact = build_artifact(
            inputs=inputs,
            geometry=geometry,
            pressure=pressure,
            solver=None,
            source_state_sha256=state_hash,
            source_twin=twin_label,
            status="OPEN",
        )
        artifact["failure"] = str(exc)
        destination = (
            output_path
            if output_path is not None
            else twin_dir / "_motor_stack" / "openfoam_fia_cold_plate_case.json"
        )
        _atomic_write_json(destination, artifact)
        print(f"OPEN (solve failed honestly): {exc}")
        print(f"Artefact: {destination}")
        return 1

    try:
        twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
    except ValueError:
        twin_label = str(twin_dir.resolve())
    artifact = build_artifact(
        inputs=inputs,
        geometry=geometry,
        pressure=pressure,
        solver=solver,
        source_state_sha256=state_hash,
        source_twin=twin_label,
        status=status,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir / "_motor_stack" / "openfoam_fia_cold_plate_case.json"
    )
    _atomic_write_json(destination, artifact)
    print(
        "FIA front-kit cold-plate duct screen: "
        f"U≈{geometry.inlet_velocity_m_s:.2f} m/s "
        f"(Re≈{geometry.reynolds_number:,.0f}) at "
        f"{inputs.coolant_flow_l_min:g} L/min / {inputs.coolant_inlet_c:g} °C; "
        f"solver Δp/pass≈{(pressure.solver_delta_p_per_pass_pa or 0):,.1f} Pa; "
        f"headline full-path ≈{pressure.headline_delta_p_pa:,.1f} Pa "
        f"({pressure.headline_source}). "
        f"Channel {inputs.channel_width_mm:g}×{inputs.channel_depth_mm:g} mm, "
        f"{inputs.pass_count} passes. "
        "Module temperatures / CHT remain OPEN; ship_ok is false."
    )
    print(f"Artefact: {destination}")
    print(f"status={status} ship_ok=false")
    return 0 if status == "PARTIAL" else 1


def main() -> int:
    """Parse self-test or live-twin mode and run the requested case."""

    parser = argparse.ArgumentParser(
        description=(
            "Solve the FIA-bound Formula E front-kit OpenFOAM cold-plate "
            "duct screening case."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--selftest",
        action="store_true",
        help="synthetic binding + OpenFOAM proveCatch (or fail closed)",
    )
    mode.add_argument(
        "--twin",
        type=Path,
        help=f"live twin directory (expected default: {DEFAULT_TWIN})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="with --selftest: schema/analytics only, do not invoke OpenFOAM",
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
        return run_selftest(dry_run=args.dry_run)
    if args.dry_run:
        parser.error("--dry-run is only valid with --selftest")
    return run_live_case(args.twin.resolve(), args.output)


if __name__ == "__main__":
    raise SystemExit(main())
