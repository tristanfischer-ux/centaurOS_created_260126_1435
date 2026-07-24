"""PHANTM actuator — material models.

SMC (Somaloy-700-type pressed pure-iron powder): nonlinear B–H via a tabulated
anhysteretic curve with a µ0-slope extension beyond the last point. The table is a
Somaloy 700 3P-shaped curve (Höganäs datasheet family); it is a MODEL INPUT — swap
the table to match Tony's chosen grade. NdFeB on its recoil line: B = Br + µ0·µr·H
(H negative in the magnet), with linear Br temperature derating.

All SI. Numerically safe: bh_curve() and its inverse are monotone.
"""

from __future__ import annotations

import numpy as np

MU0 = 4e-7 * np.pi


class SmcMaterial:
    """Nonlinear soft-magnetic composite, tabulated B(H) + µ0 extension."""

    # Somaloy-700-3P-shaped anhysteretic curve (H in A/m, B in T).
    H_TABLE = np.array([0.0, 50, 100, 200, 300, 500, 1000, 2000, 4000,
                        10000, 20000, 50000, 100000, 200000])
    B_TABLE = np.array([0.0, 0.05, 0.15, 0.42, 0.62, 0.89, 1.16, 1.33, 1.45,
                        1.57, 1.63, 1.72, 1.80, 1.93])

    def __init__(self, h_table=None, b_table=None):
        self.h = np.asarray(h_table if h_table is not None else self.H_TABLE, float)
        self.b = np.asarray(b_table if b_table is not None else self.B_TABLE, float)
        if not (np.all(np.diff(self.h) > 0) and np.all(np.diff(self.b) > 0)):
            raise ValueError("B-H table must be strictly monotone")

    def b_of_h(self, h):
        """B(H), symmetric in sign, µ0 differential slope beyond the table."""
        h_arr = np.asarray(h, float)
        sign = np.sign(h_arr)
        ha = np.abs(h_arr)
        b = np.interp(ha, self.h, self.b)
        over = ha > self.h[-1]
        b = np.where(over, self.b[-1] + MU0 * (ha - self.h[-1]), b)
        return sign * b if np.ndim(h) else float(sign * b)

    def h_of_b(self, b):
        """Inverse of b_of_h (monotone interp the other way)."""
        b_arr = np.asarray(b, float)
        sign = np.sign(b_arr)
        ba = np.abs(b_arr)
        h = np.interp(ba, self.b, self.h)
        over = ba > self.b[-1]
        h = np.where(over, self.h[-1] + (ba - self.b[-1]) / MU0, h)
        return sign * h if np.ndim(b) else float(sign * h)

    def mu_r_secant(self, b):
        """Secant relative permeability at |B| (for reluctance linearisation seeds)."""
        b = abs(float(b))
        if b < 1e-9:
            # initial slope from the first table segment
            return (self.b[1] / self.h[1]) / MU0
        return b / (MU0 * self.h_of_b(b))

    def femm_bh_points(self):
        """(B, H) pairs for FEMM mi_addbhpoint (skip the origin duplicate)."""
        return [(float(b), float(h)) for b, h in zip(self.b, self.h)]


class NdFeBMaterial:
    """Fully-magnetised NdFeB on its recoil line: B = Br(T) + µ0·µr·H."""

    def __init__(self, br_t: float = 1.30, mu_r: float = 1.05,
                 alpha_br_per_k: float = -0.0012, t_ref_c: float = 20.0):
        self.br20 = br_t
        self.mu_r = mu_r
        self.alpha = alpha_br_per_k
        self.t_ref = t_ref_c

    def br_at(self, temp_c: float) -> float:
        return self.br20 * (1.0 + self.alpha * (temp_c - self.t_ref))

    def hc_at(self, temp_c: float) -> float:
        """Coercivity Hcb consistent with the recoil line (B=0 intercept), A/m."""
        return self.br_at(temp_c) / (MU0 * self.mu_r)

    def b_of_h(self, h, temp_c: float = 20.0):
        return self.br_at(temp_c) + MU0 * self.mu_r * np.asarray(h, float)


def cu_resistivity(temp_c: float, rho20: float = 1.72e-8, alpha: float = 0.00393) -> float:
    return rho20 * (1.0 + alpha * (temp_c - 20.0))
