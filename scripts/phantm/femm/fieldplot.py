"""PHANTM — field plots from the headless solver, in FEMM's own visual idiom.

Tony asked whether we can produce field plots as well as numbers, because
"seeing the plots is quite different in how it modifies one's understanding" —
which is right, and is the same reason this project insists on opening the
artefact rather than trusting a build log.

We run the SAME solver he does (FEMM 4.2's core, via xfemm's femmcli) but
headless, so there is no GUI to screenshot. Instead we sample the solution on a
grid through mo_getpointvalues and draw it ourselves:

  |B| as a filled colour map   — the density plot in his screenshots
  flux lines as contours of A  — in 2D planar, lines of constant vector
                                 potential ARE the flux lines, so this is not
                                 an approximation but the same construction
                                 FEMM uses

Sampling cost is one solve plus one probe pass; the probes are batched into the
same Lua script, so a plot costs about what a force point costs.

Run: ~/.venvs/phantm/bin/python -m femm.fieldplot
"""

from __future__ import annotations

import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt          # noqa: E402
import numpy as np                       # noqa: E402

from . import lua_gen                    # noqa: E402
from .runner import run_lua              # noqa: E402
from .sweep import CASES                 # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "out")


def sample(x_mm: float, i_a: float, pm_mm: float, nx: int = 150, ny: int = 150,
           pad: float = 0.05):
    """Solve once and probe |B| and A on a grid over the interesting region."""
    g = lua_gen
    x0, x1 = -g.POLE_HALF - 2 * g.PITCH, g.POLE_HALF + 2 * g.PITCH
    y1 = g.SS_BACK_Y1 + pad
    xs = np.linspace(x0, x1, nx)
    ys = np.linspace(-y1, y1, ny)
    pts = [(float(a), float(b)) for b in ys for a in xs]

    os.makedirs(CASES, exist_ok=True)
    tag = "fieldplot"
    path = os.path.join(CASES, f"{tag}.lua")
    with open(path, "w") as f:
        f.write(lua_gen.actuator_lua(x_mm, i_a, pm_mm, f"{tag}.fem",
                                     probe_pts=pts))
    res = run_lua(path, timeout_s=900)
    for ext in (".lua", ".fem", ".ans"):
        p = os.path.join(CASES, f"{tag}{ext}")
        if os.path.exists(p):
            os.remove(p)

    n = len(pts)
    bx = np.array([res[f"probe{k}_bx"] for k in range(n)]).reshape(ny, nx)
    by = np.array([res[f"probe{k}_by"] for k in range(n)]).reshape(ny, nx)
    # A is not emitted per-probe by the current generator; reconstruct flux
    # lines from B instead by integrating By along x (A_z with dA/dx = -By).
    bmag = np.hypot(bx, by)
    a = -np.cumsum(by, axis=1) * (xs[1] - xs[0])
    return xs, ys, bmag, a


def plot(xs, ys, bmag, a, title: str, path: str, levels: int = 22):
    fig, ax = plt.subplots(figsize=(9.5, 7.2), dpi=150)
    vmax = float(np.percentile(bmag, 99.5))
    cf = ax.contourf(xs, ys, bmag, levels=np.linspace(0, vmax, 24),
                     cmap="turbo", extend="max")
    # flux lines: contours of the reconstructed vector potential
    ax.contour(xs, ys, a, levels=levels, colors="k", linewidths=0.45,
               alpha=0.75)
    cb = fig.colorbar(cf, ax=ax, pad=0.02)
    cb.set_label("|B|  (tesla)")
    ax.set_xlabel("axial position  (mm)")
    ax.set_ylabel("across the gaps  (mm)")
    ax.set_title(title, fontsize=10)
    ax.set_aspect("equal")
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
    return path
