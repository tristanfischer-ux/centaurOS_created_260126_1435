"""PHANTM hex-cell wave conformer — single-cell waveguide physics + actuator
integration numbers (work package opened 24 Jul on Tristan's instruction after
the DIANA/UKDI documents defined the antenna's intent).

SCOPE: single-cell physics only — cutoff of the hexagonal guide (2D Helmholtz
eigenproblem, validated against circle/square analytics), guide wavelength,
reflection-phase-vs-depth (the quantity the actuator's stroke delivers), stroke
need and phase quantisation across U/V/E-band. NO beam/array synthesis — array
gain/scan figures are quoted from Tony's own bid documents, never modelled here.

Geometry ground truth (measured from Tony's STLs, 24 Jul): interior across-flats
3.10 mm (the RF aperture), wall 0.15 mm, tiling pitch 3.25 mm, depth 7.75 mm.

Run: ~/.venvs/phantm/bin/python hexcell.py            → out/hexcell.json + figs
     ~/.venvs/phantm/bin/python hexcell.py --selftest → validation gates only
"""
import json
import math
import sys

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla

C0 = 299.792458  # mm·GHz

# --------------------------------------------------------------------------
# 2D Helmholtz Neumann eigensolver (TE modes): -∇²ψ = kc²ψ, ∂ψ/∂n = 0 on wall.
# 5-point FD on a masked grid; Neumann handled by dropping links to outside
# cells (natural/reflecting boundary). First nonzero eigenvalue → dominant TE.
# --------------------------------------------------------------------------


def te_cutoff_wavenumber(mask, h):
    """mask: 2D bool array of interior points; h: grid step. Returns kc (1/len)."""
    idx = -np.ones(mask.shape, dtype=int)
    pts = np.argwhere(mask)
    idx[mask] = np.arange(len(pts))
    rows, cols, vals = [], [], []
    for k, (i, j) in enumerate(pts):
        diag = 0.0
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ni, nj = i + di, j + dj
            if 0 <= ni < mask.shape[0] and 0 <= nj < mask.shape[1] and mask[ni, nj]:
                rows.append(k)
                cols.append(idx[ni, nj])
                vals.append(-1.0)
                diag += 1.0
        rows.append(k)
        cols.append(k)
        vals.append(diag)
    L = sp.csr_matrix((vals, (rows, cols)), shape=(len(pts), len(pts))) / h**2
    # smallest eigenvalues; first is ~0 (constant mode), second is TE dominant
    w = spla.eigsh(L, k=4, sigma=0, which="LM", return_eigenvectors=False)
    w = np.sort(w)
    assert w[0] < 1e-4 * max(w[1], 1e-30), f"constant mode not ~0: {w[:3]}"
    return math.sqrt(w[1])


def hex_mask(af, n):
    """Regular hexagon, across-flats af, flats perpendicular to y. Grid n×n."""
    span = af / math.sqrt(3) * 2  # across-corners
    h = span * 1.02 / n
    x = (np.arange(n) - n / 2 + 0.5) * h
    X, Y = np.meshgrid(x, x, indexing="ij")
    # |y| <= af/2 and the four slanted sides: |y ± tan30-rotated|
    m = (np.abs(Y) <= af / 2)
    m &= (np.abs(Y) + math.sqrt(3) * np.abs(X)) <= af / math.sqrt(3) * math.sqrt(3) * 1.0000001 + (af - np.abs(Y) * 0)  # placeholder
    return m, h


def hex_mask_exact(af, n):
    """Regular hexagon, across-flats af, two flats perpendicular to y."""
    ac = 2 * af / math.sqrt(3)          # across-corners
    h = ac * 1.02 / n
    x = (np.arange(n) - n / 2 + 0.5) * h
    X, Y = np.meshgrid(x, x, indexing="ij")
    # hexagon = |y|<=af/2  AND  |y|/2 + sqrt(3)|x|/2 <= af/2  (edges at 60°)
    m = (np.abs(Y) <= af / 2 + 1e-12) & \
        (np.abs(Y) / 2 + math.sqrt(3) * np.abs(X) / 2 <= af / 2 + 1e-12)
    return m, h


def circle_mask(r, n):
    h = 2 * r * 1.02 / n
    x = (np.arange(n) - n / 2 + 0.5) * h
    X, Y = np.meshgrid(x, x, indexing="ij")
    return (X**2 + Y**2) <= r**2, h


def square_mask(a, n):
    h = a / n
    x = (np.arange(n) - n / 2 + 0.5) * h
    X, Y = np.meshgrid(x, x, indexing="ij")
    return (np.abs(X) <= a / 2) & (np.abs(Y) <= a / 2), h


def lam_g(lam0, lam_c):
    if lam0 >= lam_c:
        return None
    return lam0 / math.sqrt(1 - (lam0 / lam_c) ** 2)


def selftest():
    ok = True
    # gate 1: circular guide TE11: kc·r = 1.8412
    m, h = circle_mask(1.0, 260)
    kc = te_cutoff_wavenumber(m, h)
    err = abs(kc * 1.0 - 1.8412) / 1.8412
    print(f"  circle TE11 kc·r = {kc:.4f} (want 1.8412, err {err*100:.2f}%)")
    ok &= err < 0.01
    # gate 2: square guide TE10: kc·a = π
    m, h = square_mask(1.0, 260)
    kc = te_cutoff_wavenumber(m, h)
    err = abs(kc - math.pi) / math.pi
    print(f"  square TE10 kc·a = {kc:.4f} (want {math.pi:.4f}, err {err*100:.2f}%)")
    ok &= err < 0.01
    # gate 3: hexagon must sit between inscribed- and circumscribed-circle TE11
    af = 3.10
    m, h = hex_mask_exact(af, 260)
    kc = te_cutoff_wavenumber(m, h)
    kc_ins = 1.8412 / (af / 2)                     # inscribed circle r=af/2
    kc_cir = 1.8412 / (af / math.sqrt(3))          # circumscribed r=af/√3
    print(f"  hex kc = {kc:.4f} /mm (bounds: circum {kc_cir:.4f} .. inscr {kc_ins:.4f})")
    ok &= kc_cir < kc < kc_ins
    # gate 4: grid convergence <0.5% between n=200 and n=300
    kc2 = te_cutoff_wavenumber(*hex_mask_exact(af, 300))
    conv = abs(kc2 - kc) / kc
    print(f"  hex convergence 260→300: {conv*100:.3f}%")
    ok &= conv < 0.005
    print("  SELFTEST", "PASS" if ok else "FAIL")
    return ok


def main():
    if not selftest():
        sys.exit(1)
    AF = 3.10                    # interior across-flats, measured from the STL
    m, h = hex_mask_exact(AF, 300)
    kc = te_cutoff_wavenumber(m, h)
    lam_c = 2 * math.pi / kc     # mm
    fc = C0 / lam_c
    # equivalent-area circle cross-check
    r_eq = math.sqrt(math.sqrt(3) / 2 * AF**2 / math.pi)
    fc_eq = C0 * 1.8412 / (2 * math.pi * r_eq)
    print(f"hex TE dominant: λc = {lam_c:.3f} mm, fc = {fc:.2f} GHz "
          f"(equiv-circle {fc_eq:.2f} GHz)")

    rows = []
    for f in (50, 55, 60, 65, 70, 75, 80, 85, 90):
        l0 = C0 / f
        lg = lam_g(l0, lam_c)
        row = {"f_ghz": f, "lam0_mm": round(l0, 3),
               "lamg_mm": round(lg, 3) if lg else None,
               "stroke_need_mm": round(lg / 2, 3) if lg else None,
               "phase_per_ideal_step_deg":
                   round(math.degrees(4 * math.pi * 0.15467 / lg), 1) if lg else None,
               "phase_levels_per_2pi":
                   round(lg / 2 / 0.15467, 1) if lg else None}
        rows.append(row)
    out = {
        "geometry": {"af_interior_mm": AF, "wall_mm": 0.15, "pitch_mm": 3.25,
                     "depth_mm": 7.75, "source": "measured from Tony's STLs 2026-07-24"},
        "cutoff": {"lam_c_mm": round(lam_c, 4), "fc_ghz": round(fc, 3),
                   "fc_equiv_circle_ghz": round(fc_eq, 3),
                   "method": "FD Neumann eigensolver n=300, validated circle+square <1%",
                   "caveat": "perfect-conductor smooth-wall hexagon; Vlad to confirm "
                             "against the real (printed, metallised) cell"},
        "band_table": rows,
        "integration": {
            "stroke_available_single_group_mm": 8.27,
            "cell_depth_travel_mm": 7.75,
            "band_edge_ghz_depth_bound": 56.9,
            "stroke_available_two_group_mm": 3.7,
            "band_edge_ghz_two_group": 67.1,
            "fe_steps_um": [172.6, 146.1, 145.3],
        },
    }
    json.dump(out, open("out/hexcell.json", "w"), indent=1)
    print(json.dumps(rows, indent=0))
    print("wrote out/hexcell.json")

    # ---------------- figure: λg / stroke-need / phase-per-step vs f ---------
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fs = np.linspace(54.5, 92, 300)
    lgs = np.array([lam_g(C0 / f, lam_c) for f in fs], dtype=float)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.2), dpi=170)
    a1.plot(fs, lgs / 2, lw=2, color="#1a5fb4", label="stroke need = λg/2")
    a1.axhline(8.27, color="#26a269", ls="--", lw=1.4)
    a1.text(88, 8.27 + 0.25, "actuator stroke 8.27", color="#26a269", fontsize=8, ha="right")
    a1.axhline(7.75, color="#613583", ls="-.", lw=1.4)
    a1.text(88, 7.75 - 0.55, "cell depth 7.75 (binding)", color="#613583", fontsize=8, ha="right")
    a1.axhline(3.7, color="#c0621d", ls="--", lw=1.4)
    a1.text(88, 3.7 + 0.25, "two groups 3.7", color="#c0621d", fontsize=8, ha="right")
    a1.axvline(fc, color="#a51d2d", ls=":", lw=1.2)
    a1.text(fc + 0.4, 10.5, f"cutoff {fc:.1f} GHz", color="#a51d2d", fontsize=8)
    a1.set_xlabel("frequency (GHz)")
    a1.set_ylabel("mm")
    a1.set_ylim(0, 12.5)
    a1.set_title("Full-2π stroke need vs available stroke", fontsize=10)
    a1.legend(fontsize=8)
    a1.grid(alpha=0.25)
    a2.plot(fs, [math.degrees(4 * math.pi * 0.15467 / g) for g in lgs], lw=2,
            color="#1a5fb4", label="in guide (this cell)")
    a2.plot(fs, [math.degrees(4 * math.pi * 0.15467 / (C0 / f)) for f in fs], lw=1.4,
            ls="--", color="#77767b", label="free-space upper bound")
    a2.set_xlabel("frequency (GHz)")
    a2.set_ylabel("phase per ideal 154.7 µm step (°)")
    a2.set_title("Phase quantisation per detent step", fontsize=10)
    a2.legend(fontsize=8)
    a2.grid(alpha=0.25)
    fig.suptitle("Hex cell 3.10 mm across-flats — λc = 5.598 mm (FD eigensolver)",
                 fontsize=10, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    fig.savefig("out/fig-hexcell.png")
    print("wrote out/fig-hexcell.png")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(0 if selftest() else 1)
    main()
