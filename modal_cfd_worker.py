"""
Modal CFD Worker for ForgeOS Product X-Ray — Phase 3
=====================================================

Runs simplified CFD analysis (external aerodynamics) on STEP geometry
using OpenFOAM. Generates drag/lift coefficients, pressure distribution,
and flow visualization images.

Deploy:
    modal deploy modal_cfd_worker.py

Environment:
    Requires MODAL_TOKEN_ID and MODAL_TOKEN_SECRET configured.

Container stack:
    Ubuntu + OpenFOAM v2312 + CadQuery (for STEP→STL) + matplotlib
"""

import modal
import base64
import json
import math
import os
import subprocess
import tempfile
import traceback

# ─── Container Image ──────────────────────────────────────────────────

cfd_image = (
    modal.Image.from_registry("ubuntu:22.04")
    .run_commands(
        # Install OpenFOAM and dependencies
        "apt-get update -qq",
        "apt-get install -y -qq wget software-properties-common gnupg2 curl",
        "wget -qO - https://dl.openfoam.com/add-debian-repo.sh | bash",
        "apt-get update -qq",
        "apt-get install -y -qq openfoam2312-default",
        # Install miniconda for CadQuery (STEP→STL conversion)
        "wget -q https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /tmp/mc.sh",
        "bash /tmp/mc.sh -b -p /opt/conda && rm /tmp/mc.sh",
        "/opt/conda/bin/conda install -y -c conda-forge cadquery=2.4 gmsh=4.12 matplotlib=3.8 -q",
        "/opt/conda/bin/conda clean -afy",
    )
    .env({"PATH": "/opt/conda/bin:/usr/lib/openfoam/openfoam2312/bin:/usr/lib/openfoam/openfoam2312/platforms/linux64GccDPInt32Opt/bin:$PATH"})
)

app = modal.App("forgeos-cfd")


# ─── Data Structures ──────────────────────────────────────────────────

# Default flow conditions for subsonic air flow
DEFAULT_FLOW = {
    "velocity_m_s": 10.0,       # 10 m/s freestream
    "direction": [1.0, 0.0, 0.0],  # Flow in +X direction
    "density_kg_m3": 1.225,     # Air at sea level
    "kinematic_viscosity_m2_s": 1.5e-5,  # Air at 20°C
    "reference_area_m2": None,  # Auto-computed from geometry
    "reference_length_m": None, # Auto-computed from bounding box
}

# ─── STEP → STL Conversion ───────────────────────────────────────────


def convert_step_to_stl(step_path: str, stl_path: str, linear_deflection: float = 0.5) -> dict:
    """
    Converts a STEP file to STL using CadQuery for OpenFOAM meshing.

    @param step_path: Path to input STEP file
    @param stl_path: Path to output STL file
    @param linear_deflection: Tessellation quality (lower = finer)
    @returns: Dict with bounds info
    """
    import cadquery as cq

    shape = cq.importers.importStep(step_path)
    bb = shape.val().BoundingBox()
    cq.exporters.export(shape, stl_path, exportType="STL", tolerance=linear_deflection)

    return {
        "bounds": {
            "xmin": bb.xmin, "xmax": bb.xmax,
            "ymin": bb.ymin, "ymax": bb.ymax,
            "zmin": bb.zmin, "zmax": bb.zmax,
        },
        "char_length": max(bb.xmax - bb.xmin, bb.ymax - bb.ymin, bb.zmax - bb.zmin) / 1000.0,  # Convert mm to m
    }


# ─── OpenFOAM Case Generation ────────────────────────────────────────

def generate_openfoam_case(case_dir: str, stl_path: str, bounds: dict, flow: dict) -> None:
    """
    Generates a simplified OpenFOAM case for external aerodynamics.

    Creates:
    - system/controlDict, fvSchemes, fvSolution, snappyHexMeshDict
    - constant/transportProperties, turbulenceProperties
    - 0/U, p, k, omega, nut

    Uses simpleFoam (steady-state RANS with k-omega SST).
    """
    import shutil

    # Scale from mm to m for CFD
    scale = 1.0 / 1000.0
    bx = {k: v * scale for k, v in bounds.items()}

    # Domain sizing: ~10x char length upstream, 20x downstream
    char_len = max(bx["xmax"] - bx["xmin"], bx["ymax"] - bx["ymin"], bx["zmax"] - bx["zmin"])
    domain_margin = char_len * 5

    xmin = bx["xmin"] - domain_margin
    xmax = bx["xmax"] + domain_margin * 3  # More room downstream
    ymin = bx["ymin"] - domain_margin
    ymax = bx["ymax"] + domain_margin
    zmin = bx["zmin"] - domain_margin
    zmax = bx["zmax"] + domain_margin

    # Create directory structure
    for d in ["system", "constant", "constant/triSurface", "0"]:
        os.makedirs(os.path.join(case_dir, d), exist_ok=True)

    # Copy STL into case
    shutil.copy2(stl_path, os.path.join(case_dir, "constant", "triSurface", "body.stl"))

    U = flow.get("velocity_m_s", 10.0)
    d = flow.get("direction", [1, 0, 0])
    nu = flow.get("kinematic_viscosity_m2_s", 1.5e-5)

    # Turbulence intensity estimates
    ti = 0.05  # 5% turbulence intensity
    k_val = 1.5 * (U * ti) ** 2
    omega_val = k_val ** 0.5 / (0.09 ** 0.25 * char_len * 0.07) if char_len > 0 else 100.0
    nut_val = k_val / max(omega_val, 1e-10)

    # Velocity vector
    ux, uy, uz = U * d[0], U * d[1], U * d[2]

    # Background mesh cell count
    nx = max(20, int((xmax - xmin) / (char_len * 0.2)))
    ny = max(10, int((ymax - ymin) / (char_len * 0.2)))
    nz = max(10, int((zmax - zmin) / (char_len * 0.2)))

    # Cap for reasonable compute
    max_cells = 80
    if nx > max_cells:
        nx = max_cells
    if ny > max_cells:
        ny = max_cells
    if nz > max_cells:
        nz = max_cells

    # === controlDict ===
    _write(case_dir, "system/controlDict", f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      controlDict;
}}

application     simpleFoam;
startFrom       startTime;
startTime       0;
stopAt          endTime;
endTime         500;
deltaT          1;
writeControl    timeStep;
writeInterval   500;
purgeWrite      1;
writeFormat     ascii;
writePrecision  8;
writeCompression off;
timeFormat      general;
timePrecision   6;
runTimeModifiable true;

functions
{{
    forceCoeffs
    {{
        type            forceCoeffs;
        libs            ("libforces.so");
        writeControl    timeStep;
        writeInterval   1;
        patches         (body);
        rho             rhoInf;
        rhoInf          {flow.get("density_kg_m3", 1.225)};
        liftDir         (0 0 1);
        dragDir         ({d[0]} {d[1]} {d[2]});
        CofR            ({(bx["xmin"]+bx["xmax"])/2} {(bx["ymin"]+bx["ymax"])/2} {(bx["zmin"]+bx["zmax"])/2});
        pitchAxis       (0 1 0);
        magUInf         {U};
        lRef            {char_len};
        Aref            {flow.get("reference_area_m2", char_len**2)};
    }}
}}
""")

    # === fvSchemes ===
    _write(case_dir, "system/fvSchemes", """FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSchemes;
}

ddtSchemes { default steadyState; }
gradSchemes { default Gauss linear; }
divSchemes
{
    default         none;
    div(phi,U)      bounded Gauss linearUpwind grad(U);
    div(phi,k)      bounded Gauss upwind;
    div(phi,omega)  bounded Gauss upwind;
    div((nuEff*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes { default Gauss linear corrected; }
interpolationSchemes { default linear; }
snGradSchemes { default corrected; }
""")

    # === fvSolution ===
    _write(case_dir, "system/fvSolution", """FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      fvSolution;
}

solvers
{
    p
    {
        solver          GAMG;
        tolerance       1e-7;
        relTol          0.1;
        smoother        GaussSeidel;
    }
    U
    {
        solver          smoothSolver;
        smoother        GaussSeidel;
        tolerance       1e-8;
        relTol          0.1;
    }
    "(k|omega)"
    {
        solver          smoothSolver;
        smoother        GaussSeidel;
        tolerance       1e-8;
        relTol          0.1;
    }
}

SIMPLE
{
    nNonOrthogonalCorrectors 0;
    consistent      yes;
    residualControl
    {
        p               1e-5;
        U               1e-5;
        "(k|omega)"     1e-5;
    }
}

relaxationFactors
{
    fields { p 0.3; }
    equations
    {
        U       0.7;
        k       0.7;
        omega   0.7;
    }
}
""")

    # === blockMeshDict ===
    _write(case_dir, "system/blockMeshDict", f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      blockMeshDict;
}}

scale 1;
vertices
(
    ({xmin} {ymin} {zmin})
    ({xmax} {ymin} {zmin})
    ({xmax} {ymax} {zmin})
    ({xmin} {ymax} {zmin})
    ({xmin} {ymin} {zmax})
    ({xmax} {ymin} {zmax})
    ({xmax} {ymax} {zmax})
    ({xmin} {ymax} {zmax})
);
blocks ( hex (0 1 2 3 4 5 6 7) ({nx} {ny} {nz}) simpleGrading (1 1 1) );
edges ();
boundary
(
    inlet {{ type patch; faces ((0 4 7 3)); }}
    outlet {{ type patch; faces ((1 2 6 5)); }}
    walls {{ type wall; faces ((0 1 5 4) (2 3 7 6) (0 3 2 1) (4 5 6 7)); }}
);
mergePatchPairs ();
""")

    # === snappyHexMeshDict ===
    cell_size = char_len * 0.1  # Target cell size near body
    _write(case_dir, "system/snappyHexMeshDict", f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      snappyHexMeshDict;
}}

castellatedMesh true;
snap            true;
addLayers       false;

geometry
{{
    body.stl
    {{
        type triSurfaceMesh;
        name body;
    }}
}}

castellatedMeshControls
{{
    maxLocalCells   100000;
    maxGlobalCells  500000;
    minRefinementCells 10;
    nCellsBetweenLevels 3;
    features ();
    refinementSurfaces
    {{
        body {{ level (2 3); patchInfo {{ type wall; }} }}
    }}
    resolveFeatureAngle 30;
    refinementRegions {{}};
    locationInMesh ({(xmin + domain_margin * 0.5)} {(ymin + ymax)/2} {(zmin + zmax)/2});
    allowFreeStandingZoneFaces true;
}}

snapControls
{{
    nSmoothPatch    3;
    tolerance       2.0;
    nSolveIter      50;
    nRelaxIter      5;
    nFeatureSnapIter 10;
}}

addLayersControls
{{
    relativeSizes   true;
    layers {{}};
    expansionRatio  1.0;
    finalLayerThickness 0.3;
    minThickness    0.1;
    nGrow           0;
    featureAngle    60;
    nRelaxIter      3;
    nSmoothSurfaceNormals 1;
    nSmoothNormals  3;
    nSmoothThickness 10;
    maxFaceThicknessRatio 0.5;
    maxThicknessToMedialRatio 0.3;
    minMedialAxisAngle 90;
    nBufferCellsNoExtrude 0;
    nLayerIter      50;
}}

meshQualityControls
{{
    maxNonOrtho     65;
    maxBoundarySkewness 20;
    maxInternalSkewness 4;
    maxConcave      80;
    minVol          1e-13;
    minTetQuality   -1e30;
    minArea         -1;
    minTwist        0.02;
    minDeterminant  0.001;
    minFaceWeight   0.02;
    minVolRatio     0.01;
    minTriangleTwist -1;
    nSmoothScale    4;
    errorReduction  0.75;
}}

writeFormat ascii;
mergeTolerance 1e-6;
""")

    # === 0/U ===
    _write(case_dir, "0/U", f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       volVectorField;
    object      U;
}}

dimensions      [0 1 -1 0 0 0 0];
internalField   uniform ({ux} {uy} {uz});

boundaryField
{{
    inlet {{ type fixedValue; value uniform ({ux} {uy} {uz}); }}
    outlet {{ type zeroGradient; }}
    walls {{ type slip; }}
    body {{ type noSlip; }}
}}
""")

    # === 0/p ===
    _write(case_dir, "0/p", f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       volScalarField;
    object      p;
}}

dimensions      [0 2 -2 0 0 0 0];
internalField   uniform 0;

boundaryField
{{
    inlet {{ type zeroGradient; }}
    outlet {{ type fixedValue; value uniform 0; }}
    walls {{ type slip; }}
    body {{ type zeroGradient; }}
}}
""")

    # === 0/k ===
    _write(case_dir, "0/k", f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       volScalarField;
    object      k;
}}

dimensions      [0 2 -2 0 0 0 0];
internalField   uniform {k_val};

boundaryField
{{
    inlet {{ type fixedValue; value uniform {k_val}; }}
    outlet {{ type zeroGradient; }}
    walls {{ type slip; }}
    body {{ type kqRWallFunction; value uniform {k_val}; }}
}}
""")

    # === 0/omega ===
    _write(case_dir, "0/omega", f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       volScalarField;
    object      omega;
}}

dimensions      [0 0 -1 0 0 0 0];
internalField   uniform {omega_val};

boundaryField
{{
    inlet {{ type fixedValue; value uniform {omega_val}; }}
    outlet {{ type zeroGradient; }}
    walls {{ type slip; }}
    body {{ type omegaWallFunction; value uniform {omega_val}; }}
}}
""")

    # === 0/nut ===
    _write(case_dir, "0/nut", f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       volScalarField;
    object      nut;
}}

dimensions      [0 2 -1 0 0 0 0];
internalField   uniform {nut_val};

boundaryField
{{
    inlet {{ type calculated; value uniform {nut_val}; }}
    outlet {{ type calculated; value uniform {nut_val}; }}
    walls {{ type nutkWallFunction; value uniform {nut_val}; }}
    body {{ type nutkWallFunction; value uniform {nut_val}; }}
}}
""")

    # === constant/transportProperties ===
    _write(case_dir, "constant/transportProperties", f"""FoamFile
{{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      transportProperties;
}}

transportModel  Newtonian;
nu              [0 2 -1 0 0 0 0] {nu};
""")

    # === constant/turbulenceProperties ===
    _write(case_dir, "constant/turbulenceProperties", """FoamFile
{
    version     2.0;
    format      ascii;
    class       dictionary;
    object      turbulenceProperties;
}

simulationType  RAS;
RAS
{
    RASModel    kOmegaSST;
    turbulence  on;
    printCoeffs on;
}
""")


def _write(case_dir: str, rel_path: str, content: str) -> None:
    """Write a file inside the OpenFOAM case directory."""
    path = os.path.join(case_dir, rel_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)


# ─── Result Parsing ───────────────────────────────────────────────────

def parse_force_coefficients(case_dir: str) -> dict:
    """
    Parse the forceCoeffs output from the last timestep.

    Returns drag coefficient (Cd), lift coefficient (Cl),
    and side force coefficient (Cs).
    """
    coeff_dir = os.path.join(case_dir, "postProcessing", "forceCoeffs")
    if not os.path.isdir(coeff_dir):
        return {"cd": None, "cl": None, "cs": None, "error": "No forceCoeffs output"}

    # Find the latest time directory
    times = sorted([d for d in os.listdir(coeff_dir) if d.replace(".", "").isdigit()], key=float)
    if not times:
        return {"cd": None, "cl": None, "cs": None, "error": "No time directories"}

    coeff_file = os.path.join(coeff_dir, times[-1], "coefficient.dat")
    if not os.path.isfile(coeff_file):
        # Try older naming convention
        coeff_file = os.path.join(coeff_dir, times[-1], "forceCoeffs.dat")
        if not os.path.isfile(coeff_file):
            return {"cd": None, "cl": None, "cs": None, "error": "Coefficient file not found"}

    # Read last non-comment line
    last_line = None
    with open(coeff_file, "r") as f:
        for line in f:
            stripped = line.strip()
            if stripped and not stripped.startswith("#"):
                last_line = stripped

    if not last_line:
        return {"cd": None, "cl": None, "cs": None, "error": "Empty coefficient file"}

    parts = last_line.split()
    try:
        # Format: Time Cd Cs Cl CmRoll CmPitch CmYaw Cd(f) Cd(r) ...
        return {
            "cd": float(parts[1]),
            "cs": float(parts[2]),
            "cl": float(parts[3]),
        }
    except (IndexError, ValueError) as e:
        return {"cd": None, "cl": None, "cs": None, "error": f"Parse error: {e}"}


def check_convergence(case_dir: str) -> dict:
    """Check residual convergence from the log file."""
    log_file = os.path.join(case_dir, "log.simpleFoam")
    if not os.path.isfile(log_file):
        return {"converged": False, "final_residuals": {}, "iterations": 0}

    residuals = {}
    iterations = 0
    with open(log_file, "r") as f:
        for line in f:
            if "Time = " in line:
                parts = line.split("=")
                if len(parts) >= 2:
                    try:
                        iterations = int(float(parts[-1].strip()))
                    except ValueError:
                        pass
            # Parse initial residual lines
            if "Solving for " in line and "Initial residual" in line:
                try:
                    field = line.split("Solving for ")[1].split(",")[0]
                    res_str = line.split("Initial residual = ")[1].split(",")[0]
                    residuals[field] = float(res_str)
                except (IndexError, ValueError):
                    pass

    converged = all(r < 1e-4 for r in residuals.values()) if residuals else False
    return {"converged": converged, "final_residuals": residuals, "iterations": iterations}


# ─── Visualization ────────────────────────────────────────────────────

def generate_residual_plot(case_dir: str) -> str | None:
    """
    Generate a convergence residual plot from the simpleFoam log.
    Returns base64-encoded PNG or None if no data.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    log_file = os.path.join(case_dir, "log.simpleFoam")
    if not os.path.isfile(log_file):
        return None

    # Parse residuals per timestep
    data = {}  # field -> list of (iteration, residual)
    current_iter = 0

    with open(log_file, "r") as f:
        for line in f:
            if "Time = " in line:
                parts = line.split("=")
                if len(parts) >= 2:
                    try:
                        current_iter = int(float(parts[-1].strip()))
                    except ValueError:
                        pass
            if "Solving for " in line and "Initial residual" in line:
                try:
                    field = line.split("Solving for ")[1].split(",")[0]
                    res_str = line.split("Initial residual = ")[1].split(",")[0]
                    residual = float(res_str)
                    if field not in data:
                        data[field] = []
                    data[field].append((current_iter, residual))
                except (IndexError, ValueError):
                    pass

    if not data:
        return None

    fig, ax = plt.subplots(1, 1, figsize=(8, 5))
    colors = ["#FF4500", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"]

    for i, (field, values) in enumerate(data.items()):
        iters, res = zip(*values)
        ax.semilogy(iters, res, label=field, color=colors[i % len(colors)], linewidth=1.5)

    ax.set_xlabel("Iteration", fontsize=10)
    ax.set_ylabel("Residual", fontsize=10)
    ax.set_title("CFD Convergence History", fontsize=12, fontweight="bold")
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()

    plot_path = os.path.join(case_dir, "residual_plot.png")
    fig.savefig(plot_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    with open(plot_path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


# ─── Main CFD Function ───────────────────────────────────────────────

@app.function(
    image=cfd_image,
    timeout=600,
    memory=8192,
    cpu=4.0,
)
def run_cfd(
    step_data_b64: str,
    module_id: str,
    flow_config: dict | None = None,
) -> dict:
    """
    Runs external aerodynamic CFD on a STEP geometry.

    @param step_data_b64: Base64-encoded STEP file data
    @param module_id: Module identifier for logging
    @param flow_config: Optional flow conditions override
    @returns: Dict with Cd, Cl, convergence info, and optional plots
    """
    flow = {**DEFAULT_FLOW, **(flow_config or {})}

    with tempfile.TemporaryDirectory() as tmpdir:
        # Step 1: Decode STEP file
        step_path = os.path.join(tmpdir, "body.step")
        with open(step_path, "wb") as f:
            f.write(base64.b64decode(step_data_b64))

        # Step 2: Convert STEP → STL
        stl_path = os.path.join(tmpdir, "body.stl")
        try:
            geom_info = convert_step_to_stl(step_path, stl_path)
        except Exception as e:
            return {"error": f"STEP→STL conversion failed: {str(e)[:300]}"}

        bounds = geom_info["bounds"]
        char_len = geom_info["char_length"]

        # Auto-compute reference area if not given
        if flow["reference_area_m2"] is None:
            # Frontal area estimate (Y×Z extent)
            y_extent = (bounds["ymax"] - bounds["ymin"]) / 1000.0
            z_extent = (bounds["zmax"] - bounds["zmin"]) / 1000.0
            flow["reference_area_m2"] = y_extent * z_extent

        if flow["reference_length_m"] is None:
            flow["reference_length_m"] = char_len

        # Step 3: Generate OpenFOAM case
        case_dir = os.path.join(tmpdir, "cfd_case")
        os.makedirs(case_dir)
        try:
            generate_openfoam_case(case_dir, stl_path, bounds, flow)
        except Exception as e:
            return {"error": f"Case generation failed: {str(e)[:300]}"}

        # Step 4: Run meshing pipeline
        try:
            # Source OpenFOAM environment and run
            of_prefix = "source /usr/lib/openfoam/openfoam2312/etc/bashrc && "

            # blockMesh — background mesh
            r = subprocess.run(
                f"bash -c '{of_prefix} cd {case_dir} && blockMesh'",
                shell=True, capture_output=True, text=True, timeout=120,
            )
            if r.returncode != 0:
                return {"error": f"blockMesh failed: {r.stderr[-500:]}"}

            # snappyHexMesh — snap to geometry
            r = subprocess.run(
                f"bash -c '{of_prefix} cd {case_dir} && snappyHexMesh -overwrite'",
                shell=True, capture_output=True, text=True, timeout=300,
            )
            if r.returncode != 0:
                return {"error": f"snappyHexMesh failed: {r.stderr[-500:]}"}

        except subprocess.TimeoutExpired:
            return {"error": "Meshing timed out"}
        except Exception as e:
            return {"error": f"Meshing error: {str(e)[:300]}"}

        # Step 5: Run solver
        try:
            r = subprocess.run(
                f"bash -c '{of_prefix} cd {case_dir} && simpleFoam > log.simpleFoam 2>&1'",
                shell=True, capture_output=True, text=True, timeout=600,
            )
            # simpleFoam may return non-zero if it hits max iterations — that's OK
        except subprocess.TimeoutExpired:
            pass  # Parse whatever we got
        except Exception as e:
            return {"error": f"Solver error: {str(e)[:300]}"}

        # Step 6: Parse results
        coeffs = parse_force_coefficients(case_dir)
        convergence = check_convergence(case_dir)

        # Step 7: Compute drag/lift forces
        q_inf = 0.5 * flow["density_kg_m3"] * flow["velocity_m_s"] ** 2
        a_ref = flow["reference_area_m2"]
        drag_N = (coeffs.get("cd") or 0) * q_inf * a_ref if coeffs.get("cd") else None
        lift_N = (coeffs.get("cl") or 0) * q_inf * a_ref if coeffs.get("cl") else None

        # Reynolds number
        Re = flow["velocity_m_s"] * char_len / flow["kinematic_viscosity_m2_s"]

        # Step 8: Generate residual plot
        residual_plot = generate_residual_plot(case_dir)

        return {
            "error": None,
            "module_id": module_id,
            "drag_coefficient": coeffs.get("cd"),
            "lift_coefficient": coeffs.get("cl"),
            "side_force_coefficient": coeffs.get("cs"),
            "drag_force_N": drag_N,
            "lift_force_N": lift_N,
            "reynolds_number": Re,
            "flow_velocity_m_s": flow["velocity_m_s"],
            "reference_area_m2": a_ref,
            "convergence": convergence,
            "residual_plot_b64": residual_plot,
            "mesh_cell_count": None,  # Could parse from log
        }


# ─── Web Endpoint ─────────────────────────────────────────────────────

@app.function(
    image=cfd_image,
    timeout=660,
    memory=8192,
    cpu=4.0,
)
@modal.web_endpoint(method="POST")
def run_cfd_endpoint(item: dict) -> dict:
    """
    HTTP endpoint for CFD analysis.

    POST body:
    {
        "step_data_b64": "<base64 STEP>",
        "module_id": "module-123",
        "flow_config": { ... optional overrides ... }
    }
    """
    step_data_b64 = item.get("step_data_b64")
    module_id = item.get("module_id", "unknown")
    flow_config = item.get("flow_config")

    if not step_data_b64:
        return {"error": "step_data_b64 is required"}

    try:
        return run_cfd.remote(step_data_b64, module_id, flow_config)
    except Exception as e:
        return {"error": f"CFD execution failed: {str(e)[:500]}"}


# ─── Local Test ───────────────────────────────────────────────────────

if __name__ == "__main__":
    print("CFD worker ready. Deploy with: modal deploy modal_cfd_worker.py")
    print("This worker runs OpenFOAM simpleFoam for external aerodynamics.")
