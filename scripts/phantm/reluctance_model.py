"""PHANTM actuator — nonlinear reluctance-network model (Increment B).

One magnetic loop per pole-piece:

    bridge steel (+ NdFeB in series, + 20t coil MMF)
      → slot-section A back → tooth tips A → gap A(x)
      → translator (tip + core + tip) → gap B(x) → tooth tips B
      → slot-section B back → bridge return
    with a LEAKAGE branch in parallel with the gap+translator chain
    (slot-section-to-slot-section air path around the translator + coil-window path).

Poles are modelled independently (each pole-piece is its own closed transverse
loop); net translator force = Σ over the three poles at their phase offsets.
Cross-pole coupling through shared translator steel is NOT modelled here —
quantified against FEMM in Increment C (design-council BLOCK #1).

Force by numerical co-energy: W'(F_s, x) = ∫₀^{F_s} Φ_source dF' (Gauss-Legendre,
48 pt), F = ∂W'/∂x by central difference. The PM is an MMF source Hc·Pm with
x-independent internal reluctance, so its self-term drops out of ∂W'/∂x; the
linear-limit identity F = ½Φ²·dR/dx is asserted in selftest (council BLOCK #3).

Fringing/leakage constants are documented FE-calibratables (FringeConfig).
All SI internally (metres, henries, newtons); params.py speaks mm.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.optimize import brentq

from materials import MU0, NdFeBMaterial, SmcMaterial, cu_resistivity
from params import BASELINE, MM, PhantmParams
import geometry as geo


# ---------------------------------------------------------------------------
# configuration
# ---------------------------------------------------------------------------

@dataclass
class FringeConfig:
    """FE-calibratable fringing/leakage constants (defaults = analytic estimates)."""
    k_corner: float = 1.0     # scales the tooth-corner arc-path log term
    k_edge_width: float = 2.0 # transverse 3D end-fringing: w_eff = w + k·2g (council FIX #6)
    k_leak: float = 1.0       # scales the lumped leakage permeance
    o_min_frac: float = 0.02  # tooth-tip area floor as fraction of tooth width (numerics)
    k_harm3: float = 1.0 / 9.0  # P(x) 3rd-harmonic / fundamental ratio (triangle-wave seed).
    # CRITICAL for the detent: with 3 poles at ~⅓-pitch offsets the FUNDAMENTAL force
    # components cancel — the per-step detent structure is carried by the 3rd
    # harmonic (in phase across poles). Pure-cos permeance gave ONE detent per
    # pitch instead of three (2026-07-24 debug). FE-calibrate from the P(x) sweep.


@dataclass
class OperatingPoint:
    phi_source_wb: float      # flux through the bridge/PM (source branch)
    phi_gap_wb: float         # flux crossing the working gaps
    u_branch_at: float        # MMF across the gap∥leakage branch pair
    b_bridge_t: float
    b_tooth_tip_t: float


class PoleCircuit:
    """Nonlinear magnetic circuit of ONE pole-piece vs translator offset x."""

    def __init__(self, p: PhantmParams = BASELINE, pm_length_m: float = 0.0,
                 smc: SmcMaterial | None = None, magnet: NdFeBMaterial | None = None,
                 fringe: FringeConfig | None = None):
        self.p = p
        self.smc = smc or SmcMaterial()
        self.magnet = magnet or NdFeBMaterial(br_t=p.materials.ndfeb_br_t,
                                              mu_r=p.materials.ndfeb_mu_r,
                                              alpha_br_per_k=p.materials.ndfeb_alpha_br_per_k)
        self.fr = fringe or FringeConfig()
        self.pm_length = pm_length_m
        self.temp_c = 20.0

        t, ss, br = p.translator, p.slot_section, p.bridge
        self.pitch = geo.tooth_pitch_mm(p) * MM
        self.tooth_w = t.land_width_mm * MM          # tooth (land) width along axis
        self.g = geo.magnetic_gap_mm(p) * MM         # single-side working gap
        self.n_teeth = 3                             # per slot-section face
        # transverse flux width: limited by the translator; + 3D end-fringing allowance
        self.w_eff = t.width_side_mm * MM + self.fr.k_edge_width * 2 * self.g
        # steel sections (m²) and path lengths (m)
        self.A_bridge = br.thickness_axial_mm * br.width_transverse_mm * MM**2   # 0.27 mm²
        self.A_ss_back = (ss.depth_mm - ss.slot_depth_mm) * ss.transverse_mm * MM**2
        self.A_transl_core = (t.width_toothed_mm - 2 * t.slot_depth_mm) * MM * t.width_side_mm * MM
        self.A_tooth_full = self.n_teeth * self.tooth_w * t.width_side_mm * MM  # aligned tip area
        # developed bridge steel length incl. the displaced-centre jog, minus the PM
        ramp_ax = (br.centre_displaced_len_mm - br.centre_flat_len_mm) / 2.0
        ramp = math.hypot(ramp_ax, br.displacement_mm) * MM
        self.l_bridge_total = ((br.length_radial_mm - br.centre_displaced_len_mm
                               + br.centre_flat_len_mm) * MM + 2 * ramp)
        self.l_ss_back = (ss.axial_mm / 2.0 + ss.depth_mm / 2.0) * MM  # per slot-section
        self.l_tip_stator = ss.slot_depth_mm * MM       # 0.155 mm
        self.l_tip_transl = t.slot_depth_mm * MM        # 0.465 mm
        self.l_transl_core = (t.width_toothed_mm - 2 * t.slot_depth_mm) * MM
        self.d_slot_stator = ss.slot_depth_mm * MM
        self.d_slot_transl = t.slot_depth_mm * MM

    # --- permeances -------------------------------------------------------

    def overlap(self, x_m: float) -> float:
        """Tooth-on-tooth axial overlap per pitch (triangle wave, equal t = s)."""
        u = abs(x_m) % self.pitch
        u = min(u, self.pitch - u)          # distance to nearest aligned position
        return max(self.tooth_w - u, 0.0)

    def overlap_smooth(self, x_m: float) -> float:
        """Harmonic-smoothed CONSTRICTION width for the tooth-tip steel element.

        Floored at ~2·gap: near zero overlap the flux enters the teeth through
        flank/corner paths whose entry width is gap-scale, not the vanishing
        geometric overlap — an o→0 area drove B_tip to ~4 T and produced narrow
        force bumps near the apex that the Pm root-finder then Goodharted onto
        (2026-07-24 debug). Near-apex tip saturation is FE territory (Increment
        C); this lumped element only needs to be right where flux is large
        (near alignment, where the full overlap area applies).
        """
        o = 0.5 * self.tooth_w * (1.0 + math.cos(2.0 * math.pi * x_m / self.pitch))
        return max(o, 2.0 * self.g, self.fr.o_min_frac * self.tooth_w)

    def _p_aligned_norm(self) -> float:
        """Aligned permeance per tooth, normalised (÷ µ0·w_eff)."""
        d_eff = min(self.d_slot_stator, self.d_slot_transl)
        return (self.tooth_w / self.g
                + self.fr.k_corner * (4.0 / math.pi)
                * math.log1p(math.pi * d_eff / (2.0 * self.g)))

    def _p_unaligned_norm(self) -> float:
        """Anti-aligned (apex) permeance per tooth, normalised (÷ µ0·w_eff)."""
        floor = self.tooth_w * 0.5 * (1.0 / (self.g + self.d_slot_stator)
                                      + 1.0 / (self.g + self.d_slot_transl))
        corner = self.fr.k_corner * (2.0 / math.pi) * math.log(2.0)
        return floor + corner

    def gap_permeance(self, x_m: float) -> float:
        """Permeance of ONE toothed gap interface (3 teeth in parallel).

        Harmonic form P(x) = P0 + P1·cos(2πx/pitch), P0/P1 from analytic
        aligned/unaligned end-points. Chosen over the piecewise-geometric
        overlap model after 2026-07-24 debug: the kinked triangle produced a
        force discontinuity at the apex AND a spurious backward force near
        alignment (the fringing log term's slope cancelled the direct term's).
        The two end-points are exactly what the FEMM stage measures, so FE
        calibration replaces P0/P1 (and can add a cos(4πx/p) harmonic).
        """
        p_max = self._p_aligned_norm()
        p_min = self._p_unaligned_norm()
        p0 = 0.5 * (p_max + p_min)
        p1 = 0.5 * (p_max - p_min)
        theta = 2.0 * math.pi * x_m / self.pitch
        k3 = self.fr.k_harm3
        # shape s(θ): s(0)=1, s(π)=−1 preserved for any k3 (cos3π = −1)
        s = (math.cos(theta) + k3 * math.cos(3.0 * theta)) / (1.0 + k3)
        pnorm = p0 + p1 * s
        return MU0 * self.w_eff * self.n_teeth * pnorm

    def leakage_permeance(self) -> float:
        """Lumped x-independent leakage bypassing the gaps (council BLOCK #2).

        Two paths in parallel: (a) slot-section inner-face to inner-face around the
        translator's un-toothed sides (mean length ≈ separation, area ≈ the side
        clearance strips); (b) across the coil window between bridge and the
        slot-section ends. Rough analytic seeds — k_leak is the FE-calibration knob.
        """
        p = self.p
        sep = p.slot_section.separation_mm * MM
        # (a) side-strip path: two strips (left/right of translator), each
        # width ≈ (stator transverse − translator transverse)/2, depth = ss axial
        strip_w = max((p.slot_section.transverse_mm - p.translator.width_side_mm), 0.0) / 2 * MM
        P_side = 2 * MU0 * (p.slot_section.axial_mm * MM) * strip_w / sep
        # (b) coil-window path: bridge centre to slot-section ends across the window
        P_win = MU0 * (p.bridge.width_transverse_mm * MM) * (p.bridge.centre_flat_len_mm * MM) \
            / max(p.bridge.displacement_mm * MM, 1e-6)
        return self.fr.k_leak * (P_side + P_win)

    # --- nonlinear solve --------------------------------------------------

    def _steel_mmf_series(self, phi: float) -> float:
        """MMF drop in the source-branch steel (bridge minus PM length)."""
        l_bridge_steel = max(self.l_bridge_total - self.pm_length, 0.0)
        return self.smc.h_of_b(phi / self.A_bridge) * l_bridge_steel

    def _steel_mmf_gap_branch(self, phi: float, x_m: float) -> float:
        """MMF drop in the gap-branch steel (slot-section backs, tips, translator).

        The tooth-tip CONSTRICTION zone shrinks with the overlap: flux funnels
        through area ≈ n·o·w over a length ≈ o before spreading into the tooth
        body (full-depth constriction at vanishing o is unphysical and produced
        force spikes at the zero-overlap apex — 2026-07-24 debug).
        """
        o = self.overlap_smooth(x_m)
        A_tip = self.n_teeth * o * self.p.translator.width_side_mm * MM
        l_tip_s = min(self.l_tip_stator, o)
        l_tip_t = min(self.l_tip_transl, o)
        h = self.smc.h_of_b
        return (2 * h(phi / self.A_ss_back) * self.l_ss_back
                + 2 * h(phi / A_tip) * l_tip_s
                + 2 * h(phi / A_tip) * l_tip_t
                + h(phi / self.A_transl_core) * self.l_transl_core)

    def _phi_gap_of_u(self, u_at: float, x_m: float) -> float:
        """Flux in the gap branch for branch MMF u (brentq on the branch balance)."""
        if u_at == 0.0:
            return 0.0
        sign = 1.0 if u_at > 0 else -1.0
        ua = abs(u_at)
        R_gap = 2.0 / self.gap_permeance(x_m)   # two gaps in series

        def resid(phi):
            return phi * R_gap + self._steel_mmf_gap_branch(phi, x_m) - ua

        hi = ua / R_gap                          # steel only adds drop → upper bound
        return sign * brentq(resid, 0.0, hi * (1 + 1e-12), xtol=1e-18, rtol=1e-12)

    def solve(self, x_m: float, coil_current_a: float = 0.0) -> OperatingPoint:
        """Solve the two-branch nonlinear network at (x, i)."""
        F_pm = self.magnet.hc_at(self.temp_c) * self.pm_length
        F_s = F_pm + self.p.coil.n_turns * coil_current_a
        return self._solve_mmf(F_s, x_m)

    def _solve_mmf(self, F_s: float, x_m: float) -> OperatingPoint:
        if F_s == 0.0:
            return OperatingPoint(0.0, 0.0, 0.0, 0.0, 0.0)
        sign = 1.0 if F_s > 0 else -1.0
        Fa = abs(F_s)
        P_leak = self.leakage_permeance()
        R_pm = (self.pm_length / (MU0 * self.magnet.mu_r * self.A_bridge)
                if self.pm_length > 0 else 0.0)

        def resid(u):
            phi_t = self._phi_gap_of_u(u, x_m) + u * P_leak
            return phi_t * R_pm + self._steel_mmf_series(phi_t) + u - Fa

        u = brentq(resid, 0.0, Fa * (1 + 1e-12), xtol=1e-15, rtol=1e-12)
        phi_gap = self._phi_gap_of_u(u, x_m)
        phi_t = phi_gap + u * P_leak
        o = self.overlap_smooth(x_m)
        A_tip = self.n_teeth * o * self.p.translator.width_side_mm * MM
        return OperatingPoint(sign * phi_t, sign * phi_gap, sign * u,
                              sign * phi_t / self.A_bridge, sign * phi_gap / A_tip)

    # --- co-energy force --------------------------------------------------

    _GAUSS_N = 48
    _gauss_nodes, _gauss_weights = np.polynomial.legendre.leggauss(_GAUSS_N)

    def coenergy(self, x_m: float, coil_current_a: float = 0.0) -> float:
        """W'(F_s, x) = ∫₀^{F_s} Φ_source dF' (Gauss-Legendre)."""
        F_pm = self.magnet.hc_at(self.temp_c) * self.pm_length
        F_s = F_pm + self.p.coil.n_turns * coil_current_a
        if F_s == 0.0:
            return 0.0
        half = F_s / 2.0
        Fq = half * (self._gauss_nodes + 1.0)
        phis = [self._solve_mmf(f, x_m).phi_source_wb for f in Fq]
        return float(half * np.dot(self._gauss_weights, phis))

    def force(self, x_m: float, coil_current_a: float = 0.0, dx: float = 1e-6) -> float:
        """Axial force on the translator from THIS pole, +x direction (N)."""
        return (self.coenergy(x_m + dx, coil_current_a)
                - self.coenergy(x_m - dx, coil_current_a)) / (2 * dx)

    # --- coil electrical --------------------------------------------------

    def flux_linkage(self, x_m: float, i_a: float) -> float:
        return self.p.coil.n_turns * self.solve(x_m, i_a).phi_source_wb

    def inductance(self, x_m: float, i_a: float, di: float = 1e-3) -> float:
        """Differential inductance dλ/di at the operating point (H)."""
        return (self.flux_linkage(x_m, i_a + di)
                - self.flux_linkage(x_m, i_a - di)) / (2 * di)

    def coil_resistance(self, temp_c: float = 20.0) -> float:
        s = geo.coil_fit(self.p)
        wire_len = s[5] * MM
        r_wire = self.p.coil.wire_diameter_bare_um * 1e-6 / 2.0
        return cu_resistivity(temp_c) * wire_len / (math.pi * r_wire**2)

    def current_rise(self, x_m: float, v_supply: float, t_end_s: float = 200e-6,
                     n_steps: int = 4000):
        """Integrate dλ/dt = V − i(λ)·R at fixed x. Returns (t, i) arrays."""
        R = self.coil_resistance()
        # build λ(i) lookup once (monotone), then invert by interp
        i_tab = np.linspace(0.0, 1.5 * v_supply / R, 200)
        lam_tab = np.array([self.flux_linkage(x_m, i) for i in i_tab])
        # start from the PM's standing flux linkage at i=0 (λ(0) ≠ 0)
        lam, dt = float(lam_tab[0]), t_end_s / n_steps
        ts, cur = [0.0], [0.0]
        for k in range(n_steps):
            i_now = float(np.interp(lam, lam_tab, i_tab))
            lam += dt * (v_supply - i_now * R)
            ts.append((k + 1) * dt)
            cur.append(float(np.interp(lam, lam_tab, i_tab)))
        return np.asarray(ts), np.asarray(cur)


# ---------------------------------------------------------------------------
# three-pole assembly
# ---------------------------------------------------------------------------

class Actuator:
    """Three phase-offset poles; net translator force curves + the five numbers."""

    def __init__(self, p: PhantmParams = BASELINE, pm_length_m: float = 0.0,
                 fringe: FringeConfig | None = None):
        self.p = p
        self.pitch = geo.tooth_pitch_mm(p) * MM
        spacing, offsets, _ = geo.pole_phasing(p)
        self.offsets = [o * MM for o in offsets]   # tooth-phase offset of each pole
        self.poles = [PoleCircuit(p, pm_length_m, fringe=fringe) for _ in offsets]

    def set_pm_length(self, pm_m: float):
        for pole in self.poles:
            pole.pm_length = pm_m

    def detent_force(self, x_m: float) -> float:
        """Net zero-current PM force at translator position x (pole 0 aligned at 0)."""
        return sum(pole.force(x_m - off) for pole, off in zip(self.poles, self.offsets))

    def detent_curve(self, n: int = 61):
        xs = np.linspace(-self.pitch / 2, self.pitch / 2, n)
        return xs, np.array([self.detent_force(x) for x in xs])

    def breakaway_force(self, n: int = 61) -> float:
        _, f = self.detent_curve(n)
        return float(np.max(np.abs(f)))

    def drive_force(self, x_m: float, i_a: float, drive_pole: int = 1) -> float:
        """Net force with ONE coil energised (all PMs active)."""
        total = 0.0
        for k, (pole, off) in enumerate(zip(self.poles, self.offsets)):
            total += pole.force(x_m - off, i_a if k == drive_pole else 0.0)
        return total

    def drive_curve(self, i_a: float, drive_pole: int = 1, n: int = 61):
        xs = np.linspace(-self.pitch / 2, self.pitch / 2, n)
        return xs, np.array([self.drive_force(x, i_a, drive_pole) for x in xs])

    # --- the solved deliverables -----------------------------------------

    def solve_pm_for_detent(self, fd_target_n: float, pm_lo: float = 5e-6,
                            pm_hi: float = 2e-3) -> float:
        """Pm such that breakaway detent force = Fd (coarse 21-pt curve for speed)."""
        def resid(pm):
            self.set_pm_length(pm)
            return self.breakaway_force(n=21) - fd_target_n
        pm = brentq(resid, pm_lo, pm_hi, xtol=1e-8, rtol=1e-6)
        self.set_pm_length(pm)
        return pm

    def solve_ic_for_drive(self, f_target_n: float, drive_pole: int = 1,
                           i_hi: float = 20.0, n: int = 41) -> float:
        """Ic such that the peak net drive force over one pitch = 2·Fd."""
        def peak(i):
            _, f = self.drive_curve(i, drive_pole, n=n)
            return float(np.max(f))
        return brentq(lambda i: peak(i) - f_target_n, 1e-4, i_hi, xtol=1e-5, rtol=1e-4)

    def solve_ic_for_step(self, margin_n: float, drive_pole: int = 1,
                          i_hi: float = 20.0, n: int = 41) -> float:
        """Ic such that the MINIMUM net force along the one-step path ≥ margin.

        The honest step criterion: the translator must be pulled forward over the
        step path from the current detent (x=0) toward the drive pole's alignment.
        The last 15% is excluded — the force necessarily →0 at the new equilibrium,
        so demanding a margin there is unsatisfiable by construction.
        """
        target = (self.offsets[drive_pole] % self.pitch) * 0.85

        def stall_min(i):
            xs = np.linspace(0.0, target, n)
            return min(self.drive_force(x, i, drive_pole) for x in xs)

        return brentq(lambda i: stall_min(i) - margin_n, 1e-4, i_hi,
                      xtol=1e-5, rtol=1e-4)
