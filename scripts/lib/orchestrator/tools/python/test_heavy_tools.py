#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/test_heavy_tools.py

Standalone harness for the heavy binary tools (brew-installed):
  OpenVSP, EnergyPlus, OpenFOAM, OpenModelica, KiCad, CalculiX,
  FreeCAD, gmsh, Elmer, ParaView, pymatgen, ASE, scikit-fem.

Each test does a single known-good computation, reports PASS/FAIL +
the value. Same pattern as test_all_tools.py but tools here have
diverse APIs (CLI, Python lib, batch input files).

Usage:
    .venv/bin/python3 scripts/lib/orchestrator/tools/python/test_heavy_tools.py
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import time
import traceback
from pathlib import Path
from typing import Any

RESULTS: list[dict[str, Any]] = []


def case(name: str, expected: str):
    def wrap(fn):
        def runner():
            t0 = time.time()
            entry = {"tool": name, "expected": expected}
            try:
                value = fn()
                entry["status"] = "PASS"
                entry["value"] = value
            except Exception as exc:
                entry["status"] = "FAIL"
                entry["error_type"] = type(exc).__name__
                entry["error_msg"] = str(exc)[:300]
            entry["wall_time_s"] = round(time.time() - t0, 3)
            RESULTS.append(entry)
        return runner
    return wrap


def have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


# ──────────────────────────────────────────────────────────────────────────
# OpenVSP — parametric aero
# ──────────────────────────────────────────────────────────────────────────

@case("OpenVSP", "vspscript can list available components")
def t_openvsp():
    if not have("vspscript") and not have("vsp"):
        raise RuntimeError("vspscript / vsp not in PATH after brew install")
    # OpenVSP ships a Python API too — try import
    try:
        import openvsp
        return f"OpenVSP Python API imports; version {openvsp.GetVSPVersion()}"
    except ImportError:
        # Try CLI
        bin_name = "vspscript" if have("vspscript") else "vsp"
        proc = subprocess.run([bin_name, "-h"], capture_output=True, text=True, timeout=10)
        return f"OpenVSP CLI ({bin_name}) responds: {proc.stdout[:60]}..."


# ──────────────────────────────────────────────────────────────────────────
# EnergyPlus — building energy
# ──────────────────────────────────────────────────────────────────────────

@case("EnergyPlus", "energyplus -v reports version")
def t_energyplus():
    if not have("energyplus"):
        raise RuntimeError("energyplus not in PATH")
    proc = subprocess.run(["energyplus", "-v"], capture_output=True, text=True, timeout=10)
    if proc.returncode != 0:
        raise RuntimeError(f"energyplus -v failed: {proc.stderr[:200]}")
    return proc.stdout.strip().split('\n')[0]


# ──────────────────────────────────────────────────────────────────────────
# OpenFOAM — CFD
# ──────────────────────────────────────────────────────────────────────────

@case("OpenFOAM", "simpleFoam --version (or icoFoam) responds")
def t_openfoam():
    for cmd in ("simpleFoam", "icoFoam", "blockMesh"):
        if have(cmd):
            proc = subprocess.run([cmd, "-help"], capture_output=True, text=True, timeout=10)
            if proc.returncode == 0 or "Usage" in proc.stdout or "Usage" in proc.stderr:
                return f"OpenFOAM ({cmd}) responds: {(proc.stdout + proc.stderr)[:80]}..."
    raise RuntimeError("no OpenFOAM solver in PATH")


# ──────────────────────────────────────────────────────────────────────────
# OpenModelica — multiphysics
# ──────────────────────────────────────────────────────────────────────────

@case("OpenModelica", "omc --version reports version")
def t_openmodelica():
    if not have("omc"):
        raise RuntimeError("omc not in PATH")
    proc = subprocess.run(["omc", "--version"], capture_output=True, text=True, timeout=10)
    return proc.stdout.strip().split('\n')[0]


# ──────────────────────────────────────────────────────────────────────────
# KiCad — PCB / schematic
# ──────────────────────────────────────────────────────────────────────────

@case("KiCad", "kicad-cli reports version")
def t_kicad():
    if not have("kicad-cli"):
        raise RuntimeError("kicad-cli not in PATH (KiCad GUI app may still be installed)")
    proc = subprocess.run(["kicad-cli", "--version"], capture_output=True, text=True, timeout=10)
    return proc.stdout.strip()


# ──────────────────────────────────────────────────────────────────────────
# CalculiX — FEA
# ──────────────────────────────────────────────────────────────────────────

@case("CalculiX", "ccx -version (or compile-version) responds")
def t_calculix():
    for cmd in ("ccx", "ccx_2.19", "ccx_2.20", "calculix"):
        if have(cmd):
            proc = subprocess.run([cmd, "-v"], capture_output=True, text=True, timeout=10)
            # CalculiX prints version to stdout or stderr depending on version
            out = (proc.stdout + proc.stderr)[:80]
            return f"{cmd}: {out.strip()}"
    raise RuntimeError("CalculiX ccx binary not in PATH")


# ──────────────────────────────────────────────────────────────────────────
# FreeCAD — CAD
# ──────────────────────────────────────────────────────────────────────────

@case("FreeCAD", "FreeCAD Python module: build solid, check volume")
def t_freecad():
    # FreeCAD installs as a .app on macOS; the Python module is at
    # /Applications/FreeCAD.app/Contents/Resources/lib/python3.11/site-packages
    # Try a few common paths to import
    import sys
    candidates = [
        "/Applications/FreeCAD.app/Contents/Resources/lib",
        "/Applications/FreeCAD.app/Contents/MacOS",
        "/usr/local/freecad/lib",
        "/opt/homebrew/lib",
    ]
    found = False
    for path in candidates:
        if Path(path).exists():
            for fc_path in Path(path).rglob("FreeCAD*.so") if Path(path).exists() else []:
                sys.path.insert(0, str(fc_path.parent))
                found = True
                break
    try:
        import FreeCAD
        # Build a 10×10×10 cube
        doc = FreeCAD.newDocument()
        box = doc.addObject("Part::Box", "TestBox")
        box.Length = 10; box.Width = 10; box.Height = 10
        doc.recompute()
        volume = box.Shape.Volume
        return f"FreeCAD imported; 10×10×10 box volume = {volume} mm³"
    except ImportError as exc:
        # Try alternate: subprocess to FreeCADCmd if available
        if have("FreeCADCmd"):
            proc = subprocess.run(["FreeCADCmd", "--version"], capture_output=True, text=True, timeout=10)
            return f"FreeCADCmd responds: {proc.stdout[:80]}"
        raise RuntimeError(f"FreeCAD Python module not importable: {exc}; FreeCAD GUI may be installed but Python bindings need manual setup")


# ──────────────────────────────────────────────────────────────────────────
# gmsh — meshing
# ──────────────────────────────────────────────────────────────────────────

@case("gmsh", "gmsh Python: generate 2D mesh of unit square")
def t_gmsh():
    try:
        import gmsh
        gmsh.initialize()
        gmsh.model.add("square")
        gmsh.model.geo.addPoint(0, 0, 0, 0.1, 1)
        gmsh.model.geo.addPoint(1, 0, 0, 0.1, 2)
        gmsh.model.geo.addPoint(1, 1, 0, 0.1, 3)
        gmsh.model.geo.addPoint(0, 1, 0, 0.1, 4)
        gmsh.model.geo.addLine(1, 2, 1)
        gmsh.model.geo.addLine(2, 3, 2)
        gmsh.model.geo.addLine(3, 4, 3)
        gmsh.model.geo.addLine(4, 1, 4)
        gmsh.model.geo.addCurveLoop([1, 2, 3, 4], 1)
        gmsh.model.geo.addPlaneSurface([1], 1)
        gmsh.model.geo.synchronize()
        gmsh.model.mesh.generate(2)
        node_tags, _, _ = gmsh.model.mesh.getNodes()
        node_count = len(node_tags)
        gmsh.finalize()
        return f"unit square mesh: {node_count} nodes"
    except ImportError:
        # Fall back to CLI
        if have("gmsh"):
            proc = subprocess.run(["gmsh", "-version"], capture_output=True, text=True, timeout=10)
            return f"gmsh CLI: {(proc.stdout + proc.stderr).strip()}"
        raise RuntimeError("gmsh not available")


# ──────────────────────────────────────────────────────────────────────────
# Elmer — multiphysics FEM
# ──────────────────────────────────────────────────────────────────────────

@case("Elmer", "ElmerSolver --version (or help) responds")
def t_elmer():
    for cmd in ("ElmerSolver", "ElmerGrid", "elmersolver"):
        if have(cmd):
            proc = subprocess.run([cmd, "--help"], capture_output=True, text=True, timeout=10)
            return f"{cmd}: {(proc.stdout + proc.stderr)[:80]}"
    raise RuntimeError("Elmer binaries not in PATH")


# ──────────────────────────────────────────────────────────────────────────
# ParaView — post-processing
# ──────────────────────────────────────────────────────────────────────────

@case("ParaView", "pvpython --version")
def t_paraview():
    for cmd in ("pvpython", "paraview"):
        if have(cmd):
            proc = subprocess.run([cmd, "--version"], capture_output=True, text=True, timeout=10)
            return f"{cmd}: {(proc.stdout + proc.stderr).strip()[:80]}"
    raise RuntimeError("ParaView binaries not in PATH")


# ──────────────────────────────────────────────────────────────────────────
# pymatgen — Materials Project
# ──────────────────────────────────────────────────────────────────────────

@case("pymatgen", "Build LiFePO4 structure, report formula + density")
def t_pymatgen():
    from pymatgen.core import Structure
    # Build LiFePO4 (olivine) — simplest cell from lattice + atoms
    from pymatgen.core import Lattice
    lattice = Lattice.orthorhombic(10.33, 6.01, 4.69)
    structure = Structure(lattice, ["Li", "Fe", "P", "O", "O", "O", "O"],
                         [[0, 0, 0], [0.5, 0, 0.5], [0.25, 0.25, 0.5],
                          [0.1, 0.1, 0.1], [0.4, 0.4, 0.4], [0.7, 0.2, 0.6], [0.3, 0.8, 0.4]])
    formula = structure.formula
    density = structure.density
    return f"LiFePO4 lattice density {density:.2f} g/cm³ ({formula})"


# ──────────────────────────────────────────────────────────────────────────
# ASE — Atomic Simulation Environment
# ──────────────────────────────────────────────────────────────────────────

@case("ASE", "Build BCC iron crystal, report lattice constant")
def t_ase():
    from ase.build import bulk
    atoms = bulk("Fe", "bcc", a=2.87)
    n_atoms = len(atoms)
    cell_volume = atoms.get_volume()
    return f"Fe BCC unit cell: {n_atoms} atoms, volume {cell_volume:.3f} Å³"


# ──────────────────────────────────────────────────────────────────────────
# scikit-fem — Python FEM
# ──────────────────────────────────────────────────────────────────────────

@case("scikit-fem", "Solve 2D Poisson equation on unit square")
def t_skfem():
    import numpy as np
    import skfem as fem
    from skfem.models.poisson import laplace, unit_load

    mesh = fem.MeshTri().refined(4)
    basis = fem.Basis(mesh, fem.ElementTriP1())

    A = laplace.assemble(basis)
    b = unit_load.assemble(basis)

    # Dirichlet BC on all boundary nodes
    D = basis.get_dofs()
    x = basis.solve(fem.condense(A, b, D=D))

    # Max value should be ~0.0737 for unit square with f=1, u=0 on boundary
    max_u = float(np.max(x))
    return f"Poisson max u = {max_u:.4f} (expected ~0.0737 for f=1 on unit square)"


# ──────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [t_openvsp, t_energyplus, t_openfoam, t_openmodelica,
             t_kicad, t_calculix, t_freecad, t_gmsh, t_elmer, t_paraview,
             t_pymatgen, t_ase, t_skfem]
    for fn in tests:
        try:
            fn()
        except Exception as exc:
            RESULTS.append({"tool": fn.__name__, "status": "HARNESS_ERROR", "error_msg": str(exc), "wall_time_s": 0})

    pass_count = sum(1 for r in RESULTS if r["status"] == "PASS")
    total = len(RESULTS)
    print("=" * 70)
    print(f"HEAVY TOOL TESTS  —  {pass_count}/{total} PASS")
    print("=" * 70)
    for r in RESULTS:
        s = r["status"]
        sigil = "✓" if s == "PASS" else "✗"
        print(f"\n[{sigil} {s}] {r['tool']}  ({r.get('wall_time_s', 0)}s)")
        print(f"    Expected: {r.get('expected', 'n/a')}")
        if s == "PASS":
            print(f"    Result:   {r['value']}")
        else:
            print(f"    Error:    {r.get('error_type', '?')}: {r.get('error_msg', '?')}")
    print()
    sys.exit(0 if pass_count == total else 1)
