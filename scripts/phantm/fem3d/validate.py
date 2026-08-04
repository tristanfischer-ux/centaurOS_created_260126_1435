"""PHANTM — the 3D magnetostatic stack, and the gate it must pass before use.

WHY THIS FILE EXISTS BEFORE ANY PHANTM GEOMETRY. The reason a 3D model is being
built at all is that a 2D model was trusted, was internally converged, and was
wrong: mesh convergence, boundary convergence and force-method agreement were
all clean while it understated the force about fivefold. So a new solver gets
validated against closed-form cases BEFORE it is allowed near the device.

FORMULATION. Magnetostatics for the magnetic vector potential A:

    curl( nu curl A ) = J,      nu = 1/mu

in H(curl) with Nedelec edge elements. That space is not a stylistic choice: A
is tangentially continuous and normally discontinuous across material
interfaces, which nodal elements get wrong at exactly the iron/air boundaries
that carry this problem. curl has a large nullspace (any gradient), so the
system carries a small mass regularisation eps*(A,v).

TWO GATES, in increasing difficulty:

  1. FINITE SOLENOID IN AIR — validates the source term and the curl operator
     against B_z = mu0.n.I.cos(theta), which is exact. Nothing magnetic in the
     way, so a failure here is purely formulation.

  2. POT CORE — a centre post, an axial working gap, a top plate and an outer
     return shell, with a solenoid coil round the post. This is the gate that
     matters, because it exercises what PHANTM actually is: high-permeability
     iron, a small gap carrying most of the reluctance, and flux that has to be
     driven round a closed circuit.

A WRONG GATE THAT LOOKED RIGHT, recorded because it cost an hour. The first
attempt used a gapped TORUS with the same azimuthal coil. It returned ~0.0003 T
against an analytic 1.06 T and looked like a solver failure. It was not: an
azimuthal coil coaxial with a torus is a solenoid, and drives flux through the
hole, not around the ring. Driving a torus needs a POLOIDAL winding. The pot
core is the topology where a simple azimuthal coil genuinely drives the
circuit. Geometry can fail a validation as convincingly as physics can.

TOLERANCE. The reluctance chain ignores fringing at the gap, which inflates the
true permeance, so a correct solver should read slightly HIGH — and does (1.03
to 1.05). A solver agreeing to 0.1% with a formula that is itself good to a few
percent would be suspicious, not reassuring, so the gate checks BOTH magnitude
and sign of the discrepancy.

Run: ~/.venvs/phantm/bin/python -m fem3d.validate
"""

from __future__ import annotations

import json
import math
import os

from netgen.occ import Cylinder, Glue, OCCGeometry, Pnt, Sphere, Z
from ngsolve import (CF, BilinearForm, GridFunction, HCurl, LinearForm, Mesh,
                     TaskManager, curl, dx, sqrt)
from ngsolve import x as ngx, y as ngy

MU0 = 4e-7 * math.pi
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "out")

# fringing means the solver should read slightly HIGH against the chain
TOL_LO, TOL_HI = 0.97, 1.15


def _solve(geo, mesh_h, coil_area, ni, mu_r, order=2, eps=1e-4):
    """Assemble and solve curl(nu curl A) = J; return the mesh and B."""
    mesh = Mesh(geo.GenerateMesh(maxh=mesh_h))
    j0 = ni / coil_area
    rr = sqrt(ngx * ngx + ngy * ngy) + 1e-12
    sel = CF([1.0 if m == "coil" else 0.0 for m in mesh.GetMaterials()])
    jvec = CF((-ngy / rr * j0 * sel, ngx / rr * j0 * sel, 0))
    nu = CF([1.0 / (mu_r * MU0) if m == "iron" else 1.0 / MU0
             for m in mesh.GetMaterials()])
    fes = HCurl(mesh, order=order, dirichlet="outer")
    u, v = fes.TnT()
    a = BilinearForm(fes)
    a += (nu * curl(u) * curl(v) + eps * u * v) * dx
    f = LinearForm(fes)
    f += jvec * v * dx
    with TaskManager():
        a.Assemble()
        f.Assemble()
        g = GridFunction(fes)
        g.vec.data = a.mat.Inverse(fes.FreeDofs(),
                                   inverse="sparsecholesky") * f.vec
    return mesh, curl(g), fes.ndof


def _probe_bz(mesh, b, x0, y0, z0, spread=2e-4):
    """|B_z| at a point, averaged over a small cloud so one bad sample or a
    point that lands outside the mesh cannot return nan for the whole gate."""
    vals = []
    for dx_ in (-spread, 0.0, spread):
        for dy_ in (-spread, 0.0, spread):
            try:
                vals.append(abs(float(b(mesh(x0 + dx_, y0 + dy_, z0))[2])))
            except Exception:                            # noqa: BLE001
                continue
    return sum(vals) / len(vals) if vals else float("nan")


def gate_solenoid(ni=1000.0, r=0.020, length=0.100):
    """Finite solenoid in air: B_z at centre against the closed form."""
    coil = (Cylinder(Pnt(0, 0, -length / 2), Z, r=r * 1.15, h=length)
            - Cylinder(Pnt(0, 0, -length / 2), Z, r=r, h=length))
    coil.mat("coil")
    coil.maxh = 0.008
    air = Sphere(Pnt(0, 0, 0), 0.12)
    air.mat("air")
    air.bc("outer")
    geo = OCCGeometry(Glue([air - coil, coil]))
    mesh, b, ndof = _solve(geo, 0.02, (r * 0.15) * length, ni, 1.0, eps=1e-3)
    fe = _probe_bz(mesh, b, 0, 0, 0, spread=1e-3)
    n = ni / length
    closed = MU0 * n * (length / 2) / math.hypot(length / 2, r)
    return dict(case="finite solenoid in air", fe_t=fe, closed_form_t=closed,
                ratio=fe / closed, ndof=ndof,
                ok=abs(fe / closed - 1.0) < 0.05)


def gate_pot_core(gap, ni=1000.0, mu_r=2000.0):
    """Pot core: gap flux density against the reluctance chain."""
    r1, r2, r3 = 0.010, 0.030, 0.038
    hpost, tplate = 0.030, 0.008
    post = Cylinder(Pnt(0, 0, 0), Z, r=r1, h=hpost)
    bot = Cylinder(Pnt(0, 0, -tplate), Z, r=r3, h=tplate)
    tall = hpost + gap + 2 * tplate
    shell = (Cylinder(Pnt(0, 0, -tplate), Z, r=r3, h=tall)
             - Cylinder(Pnt(0, 0, -tplate), Z, r=r2, h=tall))
    top = Cylinder(Pnt(0, 0, hpost + gap), Z, r=r3, h=tplate)
    core = post + bot + shell + top
    core.mat("iron")
    core.maxh = 0.005
    coil = (Cylinder(Pnt(0, 0, 0.004), Z, r=r2 * 0.92, h=hpost - 0.008)
            - Cylinder(Pnt(0, 0, 0.004), Z, r=r1 * 1.25, h=hpost - 0.008))
    coil.mat("coil")
    coil.maxh = 0.006
    air = Sphere(Pnt(0, 0, hpost / 2), 0.10)
    air.mat("air")
    air.bc("outer")
    geo = OCCGeometry(Glue([air - core - coil, core, coil]))
    ca = (r2 * 0.92 - r1 * 1.25) * (hpost - 0.008)
    mesh, b, ndof = _solve(geo, 0.014, ca, ni, mu_r)
    fe = _probe_bz(mesh, b, 0, 0, hpost + gap / 2)

    a_post = math.pi * r1 ** 2
    r_gap = gap / (MU0 * a_post)
    l_iron = hpost + tplate + (r3 - r1) + (hpost + gap + tplate) + (r3 - r1)
    r_iron = l_iron / (mu_r * MU0 * a_post)
    chain = (ni / (r_iron + r_gap)) / a_post
    return dict(case=f"pot core, {gap*1e3:.1f} mm gap", fe_t=fe,
                closed_form_t=chain, ratio=fe / chain,
                gap_reluctance_fraction=r_gap / (r_iron + r_gap), ndof=ndof,
                ok=TOL_LO < fe / chain < TOL_HI)


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = [gate_solenoid()]
    for gap in (0.0005, 0.001):
        rows.append(gate_pot_core(gap))
    print(f"{'case':28s} {'FE (T)':>9} {'closed (T)':>11} {'ratio':>7}  verdict")
    for r in rows:
        print(f"{r['case']:28s} {r['fe_t']:9.4f} {r['closed_form_t']:11.4f} "
              f"{r['ratio']:7.3f}  {'PASS' if r['ok'] else 'FAIL'}")
    json.dump(dict(tolerance=[TOL_LO, TOL_HI], rows=rows,
                   all_pass=all(r["ok"] for r in rows)),
              open(os.path.join(OUT, "fem3d-validation.json"), "w"), indent=1)
    ok = all(r["ok"] for r in rows)
    print(f"\n{'ALL GATES PASS — stack cleared for PHANTM geometry' if ok else 'GATE FAILED — do not use'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
