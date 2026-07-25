"""PHANTM — corner-radius sensitivity for the folded-foil cell route
(Tony via Tristan, 25 Jul: press a stiff metal foil at 60° angles, wind it
into the honeycomb, weld to a grooved base plate).

A pressed foil cannot make sharp hex corners — the bend radius is ≈1–2× the
foil thickness (and tooling adds more). This computes fc for the 3.10 mm
interior hexagon with FILLETED corners of radius r, using the same validated
eigensolver as hexcell.py; the rounded mask is built by morphological
dilation (inner hex offset −r, then dilated by a disc of radius r — exact
rounding within grid resolution).

Run: ~/.venvs/phantm/bin/python foil_corner_check.py → out/foil-corner.json
"""
import json
import math
import os
import sys

import numpy as np
from scipy.ndimage import binary_dilation

sys.path.insert(0, os.path.dirname(__file__))
from hexcell import hex_mask_exact, te_cutoff_wavenumber  # noqa: E402

C0 = 299.792458
AF = 3.10
N = 300


def _seg_dist(px, py, ax, ay, bx, by):
    """Euclidean distance from grid points (px,py) to segment A-B."""
    abx, aby = bx - ax, by - ay
    t = ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)
    t = np.clip(t, 0.0, 1.0)
    return np.hypot(px - (ax + t * abx), py - (ay + t * aby))


def rounded_hex_mask(af, r_mm, n=N):
    """Hexagon across-flats af with corner fillets of radius r (flats kept).

    Exact construction: the rounded hex is the set of points within distance
    r of the INNER hexagon (across-flats af − 2r) — membership computed
    analytically per grid point (inside-inner OR within r of its boundary),
    so there is no integer-disc quantisation. (Two earlier morphological
    versions failed the monotonicity gate: clipped dilation, then a pixel-
    quantised disc radius.) By symmetry, fold to |x|,|y| and use the two
    boundary segments of one sector: top flat (0,ai/2)→(Ri/2,ai/2) and slant
    (Ri/2,ai/2)→(Ri,0), Ri = ai/√3."""
    if r_mm == 0:
        return hex_mask_exact(af, n)
    ac = 2 * af / math.sqrt(3)               # across-corners of the FULL shape
    h = ac * 1.02 / n
    x = (np.arange(n) - n / 2 + 0.5) * h
    X, Y = np.meshgrid(x, x, indexing="ij")
    px, py = np.abs(X), np.abs(Y)
    ai = af - 2 * r_mm
    Ri = ai / math.sqrt(3)
    inside_inner = (py <= ai / 2 + 1e-12) & \
                   (py / 2 + math.sqrt(3) * px / 2 <= ai / 2 + 1e-12)
    d_top = _seg_dist(px, py, 0.0, ai / 2, Ri / 2, ai / 2)
    d_slant = _seg_dist(px, py, Ri / 2, ai / 2, Ri, 0.0)
    near = np.minimum(d_top, d_slant) <= r_mm
    return inside_inner | near, h


def main():
    rows = []
    fc0 = None
    for r in (0.0, 0.1, 0.2, 0.3, 0.5):
        m, h = rounded_hex_mask(AF, r)
        kc = te_cutoff_wavenumber(m, h)
        fc = C0 * kc / (2 * math.pi)
        if fc0 is None:
            fc0 = fc
        rows.append({"corner_r_mm": r, "fc_ghz": round(fc, 3),
                     "shift_mhz": round((fc - fc0) * 1000, 1),
                     "shift_um_equiv": round((fc - fc0) * 1000 / 17.3, 1)})
        print(f"  r = {r:.1f} mm → fc = {fc:.3f} GHz "
              f"(shift {1000*(fc-fc0):+.1f} MHz ≡ {1000*(fc-fc0)/17.3:+.1f} µm of interior)")
    # gates: r=0 must reproduce the pinned cutoff; shifts must be monotonic up
    assert abs(rows[0]["fc_ghz"] - 53.558) < 0.06, rows[0]
    assert all(rows[i]["fc_ghz"] <= rows[i + 1]["fc_ghz"] + 1e-6
               for i in range(len(rows) - 1)), "rounding must raise fc monotonically"
    out = {"interior_af_mm": AF, "rows": rows,
           "note": "fc rises as corners round (low-field regions removed). "
                   "Budget rule: treat corner radius like an interior-tolerance "
                   "consumer via the µm-equivalent column against the ±25 µm gate."}
    path = os.path.join(os.path.dirname(__file__), "out", "foil-corner.json")
    json.dump(out, open(path, "w"), indent=1)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
