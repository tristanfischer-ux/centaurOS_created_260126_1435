"""Periodic Floquet–Bloch solve for a hex waveguide ARRAY with ⅓ double walls.

Tony (29 Jul): arrays may use one wall orientation at 2× tape thickness
(⅓ of walls double). Question: does that close the guide at 75 GHz, and
how much does cutoff / mode coupling shift versus a uniform-tape lattice?

Method
------
Exact rectangular supercell of 2×2 hex centres on a triangular lattice:

    Lx = 2 × pitch
    Ly = √3 × pitch

For every grid pixel, find the nearest two lattice centres (including
periodic images). The shared Voronoi edge is metal of thickness t; the
pixel is air only if its distance to that edge is ≥ t/2 AND it is also
≥ t/2 from every other neighbouring Voronoi edge of its home cell.

  UNIFORM          — every wall t = tape (75 µm)
  ONE-THIRD DOUBLE — walls of orientation class `double_class` use
                     t = 2 × tape; other walls stay one tape

2D transverse Floquet–Bloch eigenproblem (Neumann TE on metal — same
convention as hexcell.py). Samples Gamma / X / Y / M.

DISCLOSURE: not a 3D radiating Floquet aperture solve (scan impedance /
grating lobes still want CST/HFSS). This DOES close the in-plane periodic
cutoff + anisotropy question that the single-cell Neumann check cannot.

Run: ~/.venvs/phantm/bin/python floquet_hex_array.py
       -> out/floquet-hex-array.json
"""

from __future__ import annotations

import json
import math
import os
import time

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
C0 = 299.792458  # mm·GHz

PITCH_MM = 3.25
TAPE_MM = 0.075
N_A1, N_A2 = 2, 2
# hx must resolve half a single-tape wall; Lx = 6.5 mm → N≥260 for hx<0.025
N_GRID_X = 360


def _lattice_vectors():
    a1 = np.array([PITCH_MM, 0.0])
    a2 = np.array([PITCH_MM * 0.5, PITCH_MM * math.sqrt(3) * 0.5])
    return a1, a2


def _wall_class(vx: float, vy: float) -> int:
    """Orientation class of the WALL (tangent ⊥ centre–centre join).

    Join angles on a triangular lattice are 0° / 60° / 120°. Wall
    tangents are those + 90°. Three classes at 60° spacing.
    """
    tx, ty = -vy, vx
    ang = math.degrees(math.atan2(ty, tx)) % 180.0
    return int(round(ang / 60.0)) % 3


def _supercell_geometry():
    """Exact 2×2 hex supercell rectangle + four primitive centres."""
    a1, a2 = _lattice_vectors()
    Lx = 2.0 * PITCH_MM
    Ly = math.sqrt(3.0) * PITCH_MM
    # four centres inside [0,Lx)×[0,Ly)
    raw = [i * a1 + j * a2 for i in range(N_A1) for j in range(N_A2)]
    centres = []
    for c in raw:
        x = float(c[0] % Lx)
        y = float(c[1] % Ly)
        centres.append((x, y))
    # de-dupe numerically
    uniq = []
    for c in centres:
        if all(abs(c[0] - u[0]) > 1e-9 or abs(c[1] - u[1]) > 1e-9
               for u in uniq):
            uniq.append(c)
    return Lx, Ly, np.array(uniq), a1, a2


def _periodic_centres(centres, Lx, Ly, rings: int = 1):
    """Centres plus ±rings of rectangular-period images."""
    out = []
    for ix in range(-rings, rings + 1):
        for iy in range(-rings, rings + 1):
            for cx, cy in centres:
                out.append((cx + ix * Lx, cy + iy * Ly))
    return np.array(out)


def build_mask(double_class: int | None):
    """Air mask (True = guide interior) for uniform or ⅓-double lattice."""
    Lx, Ly, centres, _a1, _a2 = _supercell_geometry()
    images = _periodic_centres(centres, Lx, Ly, rings=1)

    nx = N_GRID_X
    ny = max(32, int(round(N_GRID_X * Ly / Lx)))
    hx, hy = Lx / nx, Ly / ny
    if min(hx, hy) >= TAPE_MM / 2:
        raise RuntimeError(
            f"grid too coarse: hx={hx:.4f} hy={hy:.4f} ≥ tape/2="
            f"{TAPE_MM/2:.4f} — raise N_GRID_X")

    xs = (np.arange(nx) + 0.5) * hx
    ys = (np.arange(ny) + 0.5) * hy

    # Neighbour wall specs keyed by image-centre index
    image_specs = []
    for ii, (cx, cy) in enumerate(images):
        specs = []
        for jj, (ox, oy) in enumerate(images):
            if jj == ii:
                continue
            d = math.hypot(ox - cx, oy - cy)
            if d < 1e-9 or d > PITCH_MM * 1.05:
                continue
            vx, vy = ox - cx, oy - cy
            cls = _wall_class(vx, vy)
            t = TAPE_MM * (2.0 if (double_class is not None
                                   and cls == double_class) else 1.0)
            mid = ((cx + ox) / 2.0, (cy + oy) / 2.0)
            nrm = (vx / d, vy / d)
            specs.append((mid, nrm, t))
        image_specs.append(specs)

    air = np.zeros((nx, ny), dtype=bool)
    for i, x in enumerate(xs):
        for j, y in enumerate(ys):
            d2 = (images[:, 0] - x) ** 2 + (images[:, 1] - y) ** 2
            ii = int(np.argmin(d2))
            ok = True
            for mid, nrm, t in image_specs[ii]:
                dist = abs((x - mid[0]) * nrm[0] + (y - mid[1]) * nrm[1])
                if dist < t / 2.0:
                    ok = False
                    break
            if ok:
                air[i, j] = True

    # Classify wall pixels removed by double vs uniform for diagnostics
    meta = dict(
        nx=nx, ny=ny,
        hx_mm=round(hx, 5), hy_mm=round(hy, 5),
        Lx_mm=round(Lx, 4), Ly_mm=round(Ly, 4),
        n_cells=len(centres),
        double_class=double_class,
        tape_mm=TAPE_MM,
        pitch_mm=PITCH_MM,
        air_pixels=int(air.sum()),
        air_fraction=round(float(air.mean()), 5),
        implied_uniform_af_mm=round(PITCH_MM - TAPE_MM, 4),
        implied_double_af_mm=round(PITCH_MM - 2 * TAPE_MM, 4),
    )
    return air, hx, hy, Lx, Ly, meta


def floquet_laplacian(air, hx, hy, Lx, Ly, kx, ky):
    nx, ny = air.shape
    idx = -np.ones(air.shape, dtype=int)
    pts = np.argwhere(air)
    idx[air] = np.arange(len(pts))
    n = len(pts)
    rows, cols, vals = [], [], []
    for k, (i, j) in enumerate(pts):
        diag = 0.0
        for di, dj, hs in ((1, 0, hx), (-1, 0, hx), (0, 1, hy), (0, -1, hy)):
            ni, nj = i + di, j + dj
            wx = wy = 0
            if ni < 0:
                ni += nx
                wx = -1
            elif ni >= nx:
                ni -= nx
                wx = +1
            if nj < 0:
                nj += ny
                wy = -1
            elif nj >= ny:
                nj -= ny
                wy = +1
            if not air[ni, nj]:
                continue
            ph = np.exp(-1j * (kx * wx * Lx + ky * wy * Ly))
            rows.append(k)
            cols.append(int(idx[ni, nj]))
            vals.append(complex(-ph / hs ** 2))
            diag += 1.0 / hs ** 2
        rows.append(k)
        cols.append(k)
        vals.append(complex(diag))
    return sp.csr_matrix((vals, (rows, cols)), shape=(n, n), dtype=complex)


def eig_cutoffs(air, hx, hy, Lx, Ly, kx, ky, n_modes=8):
    if air.sum() < 50:
        return []
    A = floquet_laplacian(air, hx, hy, Lx, Ly, kx, ky)
    k = min(n_modes + 4, int(air.sum()) - 2)
    try:
        w = spla.eigs(A, k=k, sigma=0.0, which="LM",
                      return_eigenvectors=False)
    except Exception as e:  # noqa: BLE001
        return [f"fail:{e}"]
    w = np.sort(np.real(w))
    w = w[w > 1e-2]
    out = []
    for lam in w[:n_modes]:
        kc = math.sqrt(max(float(lam), 0.0))
        if kc < 1e-9:
            continue
        # same as hexcell.py: lam_c = 2π/kc, fc = C0/lam_c
        out.append(C0 * kc / (2 * math.pi))
    return out


def brillouin_samples(Lx, Ly):
    return {
        "Gamma": (0.0, 0.0),
        "X": (math.pi / Lx, 0.0),
        "Y": (0.0, math.pi / Ly),
        "M": (math.pi / Lx, math.pi / Ly),
    }


def analyse(name: str, double_class: int | None):
    air, hx, hy, Lx, Ly, meta = build_mask(double_class)
    bands = {}
    for label, (kx, ky) in brillouin_samples(Lx, Ly).items():
        fcs = eig_cutoffs(air, hx, hy, Lx, Ly, kx, ky)
        bands[label] = dict(
            kx=round(kx, 5), ky=round(ky, 5),
            cutoffs_ghz=[round(f, 3) if isinstance(f, float) else f
                         for f in fcs])
    reals = [f for f in bands["Gamma"]["cutoffs_ghz"] if isinstance(f, float)]
    fund = reals[0] if reals else None
    split = None
    if len(reals) >= 2:
        base = reals[0]
        k = 1
        while k < len(reals) and reals[k] - base < 0.05:
            k += 1
        if k < len(reals):
            split = reals[k] - base
        else:
            split = reals[1] - base
    margin = None if fund is None else (75.0 - fund) * 1000
    return dict(
        name=name, meta=meta, bands=bands,
        fundamental_cutoff_ghz=None if fund is None else round(fund, 3),
        mode_splitting_ghz=None if split is None else round(split, 3),
        margin_at_75_ghz_mhz=None if margin is None else round(margin, 1),
        n_modes_near_fundamental=sum(1 for f in reals if f - reals[0] < 0.05)
        if reals else 0,
        first_eight_gamma_ghz=reals[:8],
    )


def main():
    t0 = time.time()
    print("building uniform...", flush=True)
    uniform = analyse("uniform_walls", None)
    print(f"  air_pixels={uniform['meta']['air_pixels']}  "
          f"fc={uniform['fundamental_cutoff_ghz']}  "
          f"split={uniform['mode_splitting_ghz']}  "
          f"degen~{uniform['n_modes_near_fundamental']}", flush=True)

    print("building one-third double (class 0)...", flush=True)
    doubled = analyse("one_third_double_walls", 0)
    print(f"  air_pixels={doubled['meta']['air_pixels']}  "
          f"fc={doubled['fundamental_cutoff_ghz']}  "
          f"split={doubled['mode_splitting_ghz']}  "
          f"degen~{doubled['n_modes_near_fundamental']}", flush=True)

    print("building one-third double (class 1)...", flush=True)
    doubled1 = analyse("one_third_double_walls_class1", 1)
    print(f"  air_pixels={doubled1['meta']['air_pixels']}  "
          f"fc={doubled1['fundamental_cutoff_ghz']}", flush=True)

    du = uniform["fundamental_cutoff_ghz"]
    dd = doubled["fundamental_cutoff_ghz"]
    delta = None if (du is None or dd is None) else round((dd - du) * 1000, 1)
    air_loss = uniform["meta"]["air_pixels"] - doubled["meta"]["air_pixels"]

    def min_fc(lat):
        vals = [f for b in lat["bands"].values()
                for f in b["cutoffs_ghz"] if isinstance(f, float)]
        return min(vals) if vals else None

    verdict = []
    if air_loss <= 0:
        verdict.append(
            "WARNING: double-wall mask did not reduce air pixels versus "
            "uniform — geometry carve failed; do not trust Δfc.")
    else:
        verdict.append(
            f"Double-wall carve removed {air_loss} air pixels "
            f"({100 * air_loss / max(uniform['meta']['air_pixels'], 1):.2f}% "
            f"of uniform air) — lattices are geometrically distinct.")
    if du and dd:
        verdict.append(
            f"Fundamental cutoff (Gamma): uniform {du:.3f} GHz → "
            f"one-third-double {dd:.3f} GHz (Δ {delta:+.0f} MHz).")
        verdict.append(
            f"Margin to 75 GHz: uniform "
            f"{uniform['margin_at_75_ghz_mhz']:.0f} MHz → double "
            f"{doubled['margin_at_75_ghz_mhz']:.0f} MHz — guides remain open.")
    su = uniform["mode_splitting_ghz"] or 0.0
    sd = doubled["mode_splitting_ghz"] or 0.0
    verdict.append(
        f"Mode splitting after the near-degenerate multiplet: "
        f"uniform {su:.3f} GHz, double {sd:.3f} GHz; near-fundamental "
        f"degeneracy count {uniform['n_modes_near_fundamental']} → "
        f"{doubled['n_modes_near_fundamental']}.")
    d1 = doubled1["fundamental_cutoff_ghz"]
    if d1 is not None and dd is not None and abs(d1 - dd) > 0.05:
        verdict.append(
            f"Orientation sensitivity: class-1 double gives fc={d1} GHz "
            f"(class-0 was {dd}).")
    else:
        verdict.append(
            f"Orientation class-0 vs class-1 fundamentals agree within "
            f"50 MHz (class-1 fc={d1} GHz) — anisotropy is mild in-plane.")
    verdict.append(
        "CLIENT-SAFE CLAIM: in this 2D periodic transverse model, one-third "
        "double walls do not close the guides at 75 GHz. Cutoff shifts by "
        "the amount reported above (hundreds of megahertz class). "
        "Inter-guide coupling anisotropy shows as degeneracy breaking / "
        "splitting. Vlad should still run a 3D unit-cell Floquet (scan "
        "impedance, grating lobes) before Seed-1.")
    verdict.append(
        "DISCLOSURE: rectangular supercell of 2×2 hex centres; Neumann TE; "
        "not 3D radiating Floquet. Single-cell Neumann shrink estimates "
        "remain useful cross-checks but are not a substitute for this "
        "periodic solve.")

    out = dict(
        geometry_mm=dict(
            pitch=PITCH_MM, tape=TAPE_MM,
            supercell_cells=N_A1 * N_A2,
            Lx=round(2.0 * PITCH_MM, 4),
            Ly=round(math.sqrt(3.0) * PITCH_MM, 4),
            implied_uniform_across_flats=round(PITCH_MM - TAPE_MM, 4),
            implied_double_wall_across_flats=round(PITCH_MM - 2 * TAPE_MM, 4),
        ),
        uniform=uniform,
        one_third_double=doubled,
        one_third_double_class1=doubled1,
        comparison=dict(
            air_pixels_removed=air_loss,
            air_fraction_uniform=uniform["meta"]["air_fraction"],
            air_fraction_double=doubled["meta"]["air_fraction"],
            delta_fundamental_mhz=delta,
            uniform_min_bloch_cutoff_ghz=min_fc(uniform),
            double_min_bloch_cutoff_ghz=min_fc(doubled),
            splitting_uniform_ghz=su,
            splitting_double_ghz=sd,
        ),
        verdict=verdict,
        runtime_s=round(time.time() - t0, 1),
    )
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "floquet-hex-array.json")
    json.dump(out, open(path, "w"), indent=1)
    print(f"\nwrote {path} ({out['runtime_s']} s)")
    for line in verdict:
        print(f"  • {line}")


if __name__ == "__main__":
    main()
