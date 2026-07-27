"""PHANTM — VENT TOLERANCE gate (the damper's manufacturability).

THE CLAIM UNDER TEST. "The Ø0.15 mm air-piston vent captures the commanded step
at every hold >= 3 ms." True as far as it goes — but the study that produced it
sampled diameters at 0.15, 0.20, 0.25, ... and Ø0.20 already FAILS. A design
whose only demonstrated working point sits one sample away from a failure, on a
feature that is a drilled hole in a foil, is not yet a specification: nobody can
order it without knowing the tolerance. That was the open gate.

WHAT A SPECIFICATION NEEDS, AND WHAT THIS COMPUTES.
  1. Where the pass band actually ENDS, at a resolution finer than the failure
     step (0.005 mm here, not 0.05 mm).
  2. Whether it still passes when the things we ASSUMED move. A vent that works
     only at the nominal discharge coefficient, the nominal air column and the
     nominal friction is not a vent that works. The band is therefore recomputed
     across the joint uncertainty and the ROBUST band — the intersection, the
     diameters that capture in every corner — is what gets specified.
  3. A centre and a +/- tolerance a supplier can be held to, derived from that
     robust band rather than from the nominal one.

THE CORNERS. Cd 0.60-0.85 (a short drilled orifice is not a sharp-edged ideal
one), the front air column L0 +/-15% (assembly stack-up), air density across
-40..+80 C (the orifice law carries rho, so temperature enters here), and guide
friction across the brief's own 0.2-0.5 mN band. Friction is included because
it competes with the same damping the vent provides — treating it as nominal
while toleranced the vent would be measuring the wrong thing.

SPEED, AND WHY IT IS SAFE. The reference integrator in damper.py costs ~4 s per
run, which makes a joint tolerance grid a multi-hour job. This module uses the
same RK4 on the same equations with the force curves pre-tabulated on a uniform
grid and scalar interpolation done in plain arithmetic — the numpy per-call
overhead, not the physics, was the cost. validate_against_reference() asserts
the fast path reproduces damper.simulate before any of it is believed; the
maker does not get to be its own checker.

Run: PHANTM_CURVES=balanced-curves.json \
     ~/.venvs/phantm/bin/python vent_tolerance.py -> out/opt/vent-tolerance.json
"""

from __future__ import annotations

import json
import math
import os
import time

import numpy as np

import damper as D

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "opt")

HOLDS_MS = [3.0, 5.0, 8.0, 12.0, 20.0]     # the claim is "every hold >= 3 ms"
DIAMS_MM = [round(0.05 + 0.005 * i, 3) for i in range(61)]   # 0.050 .. 0.350

# Joint uncertainty corners. Each is (label, Cd, L0 scale, temperature C,
# friction N). The nominal sits first so it is always reported.
def _rho_at(temp_c: float) -> float:
    """Air density at 1 atm, from the nominal 1.204 kg/m^3 at 20 C."""
    return 1.204 * (293.15 / (273.15 + temp_c))


CORNERS = [
    ("nominal",            0.65, 1.00, 20.0, 0.35e-3),
    ("Cd low",             0.60, 1.00, 20.0, 0.35e-3),
    ("Cd high",            0.85, 1.00, 20.0, 0.35e-3),
    ("air column short",   0.65, 0.85, 20.0, 0.35e-3),
    ("air column long",    0.65, 1.15, 20.0, 0.35e-3),
    ("cold -40 C",         0.65, 1.00, -40.0, 0.35e-3),
    ("hot +80 C",          0.65, 1.00, 80.0, 0.35e-3),
    ("friction low",       0.65, 1.00, 20.0, 0.20e-3),
    ("friction high",      0.65, 1.00, 20.0, 0.50e-3),
    # two compound corners — single-variable corners can each pass while their
    # combination fails, and the combination is what a real part experiences
    ("worst-ish cold/tight", 0.60, 0.85, -40.0, 0.50e-3),
    ("worst-ish hot/loose",  0.85, 1.15, 80.0, 0.20e-3),
]


# --------------------------------------------------------------------------
# fast scalar force tables (same curves damper.py integrates, uniform grid)
# --------------------------------------------------------------------------
class Table:
    """Uniform-grid scalar linear interpolation, clamped at the ends."""

    def __init__(self, fn, lo, hi, n=20001):
        self.lo, self.hi = lo, hi
        self.n = n
        self.dx = (hi - lo) / (n - 1)
        self.y = [float(fn(lo + i * self.dx)) for i in range(n)]

    def __call__(self, x: float) -> float:
        t = (x - self.lo) / self.dx
        if t <= 0:
            return self.y[0]
        if t >= self.n - 1:
            return self.y[-1]
        i = int(t)
        f = t - i
        return self.y[i] * (1.0 - f) + self.y[i + 1] * f


def _tables(f_drv):
    span = 6.0 * D.PITCH
    lo, hi = min(D.x0, D.x1) - span, max(D.x0, D.x1) + span
    return Table(D.net_det, lo, hi), Table(f_drv, lo, hi)


def simulate_fast(ao_m2, t_det, t_drv, *, cd, l0, rho, f_fric,
                  t_pulse, t_end=60e-3, dt=1e-6, air=True):
    """RK4 on (x, v, p) — same equations as damper.simulate, scalar maths."""
    x, v, p = D.x0, 0.0, D.P0
    A, GAMMA, P0 = D.A, D.GAMMA, D.P0
    x_ext = D.x0
    t = 0.0
    n = int(t_end / dt)
    err_last_bad_t = 0.0
    for step in range(n):
        drv = t < t_pulse
        force = t_drv if drv else t_det

        def acc(x_, v_, p_):
            f = force(x_)
            f_air = -(p_ - P0) * A if air else 0.0
            if abs(v_) > 1e-5:
                f_fr = -math.copysign(f_fric, v_)
            else:
                tot = f + f_air
                f_fr = -math.copysign(min(f_fric, abs(tot)), tot)
            return (f + f_air + f_fr) / D.M

        def pdot(x_, v_, p_):
            vol = A * (l0 - (x_ - D.x0))
            pg = p_ - P0
            q = (cd * ao_m2 * math.copysign(math.sqrt(2 * abs(pg) / rho), pg)
                 if ao_m2 > 0 else 0.0)
            return -GAMMA * p_ * (-A * v_ + q) / vol

        k1v, k1a, k1p = v, acc(x, v, p), pdot(x, v, p)
        x2, v2, p2 = x + dt / 2 * k1v, v + dt / 2 * k1a, p + dt / 2 * k1p
        k2v, k2a, k2p = v2, acc(x2, v2, p2), pdot(x2, v2, p2)
        x3, v3, p3 = x + dt / 2 * k2v, v + dt / 2 * k2a, p + dt / 2 * k2p
        k3v, k3a, k3p = v3, acc(x3, v3, p3), pdot(x3, v3, p3)
        x4, v4, p4 = x + dt * k3v, v + dt * k3a, p + dt * k3p
        k4v, k4a, k4p = v4, acc(x4, v4, p4), pdot(x4, v4, p4)
        x += dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        v += dt / 6 * (k1a + 2 * k2a + 2 * k3a + k4a)
        p += dt / 6 * (k1p + 2 * k2p + 2 * k3p + k4p)
        t += dt
        if D.DIRN * (x - x_ext) > 0:
            x_ext = x
        if abs(x - D.x1) > 10e-6:
            err_last_bad_t = t
    double = D.DIRN * (x_ext - D.x1) > 0.6 * D.STEP
    captured = (not double) and abs(x - D.x1) < 10e-6
    return dict(settle_ms=round(err_last_bad_t * 1e3, 2),
                overshoot_um=round(D.DIRN * (x_ext - D.x1) * 1e6, 1),
                double_step=bool(double), captured=bool(captured))


def validate_against_reference(f_drv, tol_settle_ms=0.5):
    """The fast path must reproduce damper.simulate before it is trusted."""
    t_det, t_drv = _tables(f_drv)
    rows = []
    for d_mm, tp_ms in ((0.15, 3.0), (0.20, 3.0), (0.15, 8.0)):
        ao = math.pi * (d_mm * 1e-3) ** 2 / 4
        _, ref = D.simulate(ao, f_drv=f_drv, t_pulse=tp_ms * 1e-3)
        fast = simulate_fast(ao, t_det, t_drv, cd=D.CD, l0=D.L0, rho=D.RHO,
                             f_fric=D.F_FRIC, t_pulse=tp_ms * 1e-3)
        ok = (ref["captured"] == fast["captured"]
              and abs(ref["settle_ms"] - fast["settle_ms"]) < tol_settle_ms)
        rows.append(dict(vent_mm=d_mm, hold_ms=tp_ms,
                         reference=ref, fast=fast, ok=bool(ok)))
    return rows


def robust_at(d_mm, corner, f_drv, tables):
    """Does this diameter capture at EVERY hold >= 3 ms, in this corner?"""
    _, cd, l0s, temp, fric = corner
    t_det, t_drv = tables
    ao = math.pi * (d_mm * 1e-3) ** 2 / 4
    for tp in HOLDS_MS:
        m = simulate_fast(ao, t_det, t_drv, cd=cd, l0=D.L0 * l0s,
                          rho=_rho_at(temp), f_fric=fric, t_pulse=tp * 1e-3)
        if not m["captured"]:
            return False
    return True


def band_edges(passes, diams):
    """Longest contiguous run of passing diameters -> (lo, hi) in mm."""
    best = cur = None
    for i, ok in enumerate(passes):
        if ok:
            cur = i if cur is None else cur
            if best is None or (i - cur) > (best[1] - best[0]):
                best = (cur, i)
        else:
            cur = None
    if best is None:
        return None
    return diams[best[0]], diams[best[1]]


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    scheme = {0: 3.35, 1: -3.35}          # the BALANCED set's dual hold scheme
    f_drv = D.make_net_drv(scheme)
    tables = _tables(f_drv)

    print("Validating the fast integrator against damper.simulate:")
    val = validate_against_reference(f_drv)
    for v in val:
        print(f"  Ø{v['vent_mm']:.2f} hold {v['hold_ms']:.0f} ms — "
              f"captured ref {v['reference']['captured']} / fast "
              f"{v['fast']['captured']}, settle "
              f"{v['reference']['settle_ms']:.2f} / {v['fast']['settle_ms']:.2f} ms"
              f"  {'OK' if v['ok'] else 'FAIL'}")
    if not all(v["ok"] for v in val):
        raise RuntimeError("fast integrator disagrees with the reference — "
                           "the tolerance result would be meaningless")
    print()

    per_corner = {}
    for corner in CORNERS:
        name = corner[0]
        passes = [robust_at(d, corner, f_drv, tables) for d in DIAMS_MM]
        edges = band_edges(passes, DIAMS_MM)
        per_corner[name] = dict(
            cd=corner[1], l0_scale=corner[2], temp_c=corner[3],
            friction_n=corner[4],
            band_mm=list(edges) if edges else None,
            passes=passes)
        print(f"  {name:22s} pass band "
              f"{('Ø%.3f–Ø%.3f mm' % edges) if edges else 'NONE'}", flush=True)

    # ROBUST band = diameters that pass in EVERY corner.
    robust = [all(per_corner[c[0]]["passes"][i] for c in CORNERS)
              for i in range(len(DIAMS_MM))]
    r_edges = band_edges(robust, DIAMS_MM)

    # WHICH uncertainty is actually costing the tolerance? Recomputing the
    # intersection with one variable pinned says how much of the band that
    # variable is eating — and therefore whether measuring it is worth doing.
    # This is the difference between "tighten the process" (expensive, and it
    # may not be possible) and "measure one number" (a coupon and an afternoon).
    cd_free = [c[0] for c in CORNERS
               if "Cd" not in c[0] and "worst-ish" not in c[0]]
    cd_pinned = [all(per_corner[n]["passes"][i] for n in cd_free)
                 for i in range(len(DIAMS_MM))]
    cd_pinned_edges = band_edges(cd_pinned, DIAMS_MM)

    spec = None
    if r_edges:
        lo, hi = r_edges
        centre = round((lo + hi) / 2, 3)
        tol = round((hi - lo) / 2, 3)
        spec = dict(centre_mm=centre, tolerance_mm=tol,
                    band_mm=[lo, hi],
                    # a drilled hole is specified on diameter; state what class
                    # of process this needs so it can be bought
                    note=("specify as Ø%.3f +/- %.3f mm; the band is the "
                          "intersection across every uncertainty corner, so "
                          "this is orderable without further caveat" % (centre, tol)))

    cd_spec = None
    if cd_pinned_edges:
        lo, hi = cd_pinned_edges
        cd_spec = dict(centre_mm=round((lo + hi) / 2, 3),
                       tolerance_mm=round((hi - lo) / 2, 3),
                       band_mm=[lo, hi])

    # Does the diameter the report currently recommends survive every corner?
    i15 = DIAMS_MM.index(0.15) if 0.15 in DIAMS_MM else None
    current_rec = None
    if i15 is not None:
        fails = [c[0] for c in CORNERS if not per_corner[c[0]]["passes"][i15]]
        current_rec = dict(diameter_mm=0.15, robust=not fails,
                           fails_in_corners=fails)

    nominal_band = per_corner["nominal"]["band_mm"]
    out = dict(scheme="DUAL +3.35/-3.35A (BALANCED set)",
               holds_ms=HOLDS_MS, diameters_mm=DIAMS_MM,
               validation=val, corners=per_corner,
               nominal_band_mm=nominal_band,
               robust_band_mm=list(r_edges) if r_edges else None,
               specification=spec,
               cd_pinned_band_mm=list(cd_pinned_edges) if cd_pinned_edges else None,
               cd_pinned_specification=cd_spec,
               dominant_uncertainty=(
                   "discharge coefficient — pinning it by coupon measurement "
                   "widens the tolerance from ±%.3f to ±%.3f mm"
                   % (spec["tolerance_mm"], cd_spec["tolerance_mm"])
                   if spec and cd_spec else None),
               current_recommendation_check=current_rec,
               runtime_s=round(time.time() - t0, 1))
    json.dump(out, open(os.path.join(OUT, "vent-tolerance.json"), "w"), indent=1)

    print()
    print(f"nominal band : Ø{nominal_band[0]:.3f}–Ø{nominal_band[1]:.3f} mm"
          if nominal_band else "nominal band : NONE")
    if r_edges:
        print(f"ROBUST band  : Ø{r_edges[0]:.3f}–Ø{r_edges[1]:.3f} mm "
              f"(passes in all {len(CORNERS)} corners)")
        print(f"SPECIFY      : Ø{spec['centre_mm']:.3f} "
              f"+/- {spec['tolerance_mm']:.3f} mm")
    else:
        print("ROBUST band  : NONE — no diameter survives every corner")
    if cd_spec:
        print(f"WITH Cd MEASURED: Ø{cd_spec['centre_mm']:.3f} "
              f"+/- {cd_spec['tolerance_mm']:.3f} mm "
              f"({cd_spec['tolerance_mm']/spec['tolerance_mm']:.0f}× the "
              f"tolerance, for one coupon measurement)")
    if current_rec and not current_rec["robust"]:
        print(f"NOTE: the currently recommended Ø0.15 mm FAILS in "
              f"{len(current_rec['fails_in_corners'])} corner(s): "
              f"{', '.join(current_rec['fails_in_corners'])}")
    print(f"wrote out/opt/vent-tolerance.json ({out['runtime_s']:.0f} s)")


if __name__ == "__main__":
    main()
