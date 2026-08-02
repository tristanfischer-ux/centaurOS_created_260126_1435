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


# ---------------------------------------------------------------------------
# Sintered-NdFeB grade table — the DEMAGNETISATION side of the magnet model.
#
# The recoil line below (B = Br + µ0·µr·H) is valid ONLY down to the knee of the
# INTRINSIC curve. Past the knee the magnet loses flux irreversibly and never
# recovers on removal of the field. FEMM's linear PM model has no knee, so the
# solver will happily report an operating point far beyond it without complaint
# — the knee has to be imposed as an EXTERNAL acceptance test on the FE result.
# That is exactly what demag_gate.py does.
#
# Hcj values are catalogue MINIMA (the guaranteed floor, not a typical), in A/m.
# t_max_c is the manufacturer's stated maximum operating temperature for a
# moderate permeance coefficient — quoted for orientation only; the real limit
# is the computed knee margin at THIS geometry's operating point, which is the
# whole point of the gate.
#
# alpha_hcj_per_k is the intrinsic-coercivity temperature coefficient. It is
# ~5x worse than Br's (-0.12 %/K), which is why demagnetisation is always a HOT
# failure: the magnet's resistance to reverse field collapses long before its
# remanence does. Band: -0.65..-0.55 %/K for N/M/H, -0.55..-0.45 %/K for SH and
# above (higher-Dy grades derate more slowly).
#
# Sources: standard sintered-NdFeB catalogue data (Arnold/Eclipse/Bunting
# families agree to within a grade step). Swap the table to a chosen supplier's
# datasheet before tooling.
NDFEB_GRADES = {
    #  name      br_min  br_max   hcj_min     t_max_c  alpha_hcj_per_k
    "N42":   dict(br=(1.29, 1.32), hcj=955e3,  t_max_c=80,  alpha_hcj=-0.0060),
    "N42M":  dict(br=(1.29, 1.32), hcj=1114e3, t_max_c=100, alpha_hcj=-0.0060),
    "N42H":  dict(br=(1.29, 1.32), hcj=1353e3, t_max_c=120, alpha_hcj=-0.0060),
    "N42SH": dict(br=(1.29, 1.32), hcj=1592e3, t_max_c=150, alpha_hcj=-0.0050),
    "N42UH": dict(br=(1.29, 1.32), hcj=1990e3, t_max_c=180, alpha_hcj=-0.0050),
    "N42EH": dict(br=(1.29, 1.32), hcj=2388e3, t_max_c=200, alpha_hcj=-0.0050),
    # Br ~1.45 class — note the ceiling: high remanence and high coercivity
    # trade against each other, so there is NO high-temperature N52. N50M is
    # about the limit of the family, and only to 100 C.
    "N50M":  dict(br=(1.40, 1.45), hcj=1114e3, t_max_c=100, alpha_hcj=-0.0060),
    "N52":   dict(br=(1.43, 1.48), hcj=876e3,  t_max_c=80,  alpha_hcj=-0.0060),
}

# Knee field as a fraction of Hcj. Good sintered material is specified with a
# squareness Hk/Hcj >= 0.90; 0.85 is the conservative engineering default used
# here, and the gate reports its sensitivity to this number explicitly.
KNEE_FRACTION_DEFAULT = 0.85


class NdFeBMaterial:
    """Fully-magnetised NdFeB on its recoil line: B = Br(T) + µ0·µr·H.

    Carries an optional GRADE, which adds the intrinsic-coercivity / knee model
    needed to judge irreversible demagnetisation. Without a grade the object
    behaves exactly as before (recoil line only) — existing callers are
    unaffected.
    """

    def __init__(self, br_t: float = 1.30, mu_r: float = 1.05,
                 alpha_br_per_k: float = -0.0012, t_ref_c: float = 20.0,
                 grade: str | None = None,
                 knee_fraction: float = KNEE_FRACTION_DEFAULT):
        self.br20 = br_t
        self.mu_r = mu_r
        self.alpha = alpha_br_per_k
        self.t_ref = t_ref_c
        self.grade = grade
        self.knee_fraction = knee_fraction
        if grade is not None and grade not in NDFEB_GRADES:
            raise ValueError(f"unknown NdFeB grade {grade!r}; "
                             f"known: {sorted(NDFEB_GRADES)}")

    def br_at(self, temp_c: float) -> float:
        return self.br20 * (1.0 + self.alpha * (temp_c - self.t_ref))

    def hc_at(self, temp_c: float) -> float:
        """Coercivity Hcb consistent with the recoil line (B=0 intercept), A/m."""
        return self.br_at(temp_c) / (MU0 * self.mu_r)

    def b_of_h(self, h, temp_c: float = 20.0):
        return self.br_at(temp_c) + MU0 * self.mu_r * np.asarray(h, float)

    # --- demagnetisation side (requires a grade) ---------------------------

    def _grade(self) -> dict:
        if self.grade is None:
            raise ValueError("no grade set — hcj_at/h_knee_at need a named "
                             "NdFeB grade (e.g. NdFeBMaterial(grade='N42'))")
        return NDFEB_GRADES[self.grade]

    def hcj_at(self, temp_c: float) -> float:
        """Intrinsic coercivity Hcj at temperature, A/m (positive magnitude).

        Linear derating from the catalogue minimum at 20 C. Clamped at zero:
        above the Curie-approach region the linear fit is meaningless, and a
        negative Hcj would silently invert the gate's comparison.
        """
        g = self._grade()
        hcj = g["hcj"] * (1.0 + g["alpha_hcj"] * (temp_c - self.t_ref))
        return max(hcj, 0.0)

    def h_knee_at(self, temp_c: float) -> float:
        """Knee field magnitude, A/m — the reverse-H limit for reversible use.

        Operating beyond this (i.e. H along the magnetisation axis more
        negative than -h_knee_at) costs irreversible flux.
        """
        return self.knee_fraction * self.hcj_at(temp_c)

    def t_max_reversible(self, h_reverse_a_per_m: float,
                         t_lo: float = -40.0, t_hi: float = 250.0) -> float:
        """Highest temperature at which h_reverse stays inside the knee, C.

        h_reverse is the reverse field MAGNITUDE the magnet actually sees.
        Returns t_lo if the magnet is already past its knee even when cold,
        t_hi if it never crosses within the bracket. Monotone in T (Hcj falls
        with T), so a bisection is exact to the tolerance.
        """
        h = abs(float(h_reverse_a_per_m))
        if self.h_knee_at(t_lo) <= h:
            return t_lo
        if self.h_knee_at(t_hi) > h:
            return t_hi
        lo, hi = t_lo, t_hi
        for _ in range(200):
            mid = 0.5 * (lo + hi)
            if self.h_knee_at(mid) > h:
                lo = mid
            else:
                hi = mid
        return 0.5 * (lo + hi)


def cu_resistivity(temp_c: float, rho20: float = 1.72e-8, alpha: float = 0.00393) -> float:
    return rho20 * (1.0 + alpha * (temp_c - 20.0))


# ---------------------------------------------------------------------------
# Soft-magnetic candidates for mixed translator / pole studies
# (Tony 29 Jul: poles likely MIM; translator may stay laminated Fe-Co).
# Tables are representative datasheet-shaped curves — swap for a named
# vendor grade before tooling. Not Somaloy: that remains SmcMaterial default.
# ---------------------------------------------------------------------------


class FeCoLaminated(SmcMaterial):
    """Hiperco 50 / VACOFLUX-class laminated Fe-Co strip (high Bsat ~2.3 T)."""

    H_TABLE = np.array([0.0, 40, 80, 160, 300, 500, 1000, 2000, 4000,
                        8000, 16000, 40000, 80000, 160000])
    B_TABLE = np.array([0.0, 0.20, 0.55, 1.10, 1.55, 1.85, 2.05, 2.18, 2.25,
                        2.30, 2.33, 2.35, 2.36, 2.38])


class MimFe3Si(SmcMaterial):
    """Micro-injection-moulded Fe-3%Si soft magnet (typical sintered density).

    Saturation and permeability sit BELOW laminated Fe-Co / electrical steel —
    that is the comparison Tony recalled — while still above pressed SMC.
    """

    H_TABLE = np.array([0.0, 50, 100, 200, 400, 800, 1500, 3000, 6000,
                        12000, 25000, 50000, 100000, 200000])
    B_TABLE = np.array([0.0, 0.08, 0.22, 0.50, 0.85, 1.15, 1.35, 1.50, 1.60,
                        1.68, 1.74, 1.78, 1.82, 1.88])
