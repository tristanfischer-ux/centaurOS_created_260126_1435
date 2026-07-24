"""PHANTM actuator — one-step mechanical dynamics (Increment D).

m·ẍ = F_net(x) − F_fric·sign(ẋ),  m = Mt (+ optional reflector mass, Tony Q1).

Quasi-static electrical assumption (justified): coil rise time ~8 µs on 1 V
(five_numbers task 5) ≪ ms-scale motion, so during the drive pulse the force is
the static curve F(x, Ic); after the pulse it is the detent curve. Both curves
are read from out/curves.npz (network v1 today, FE-calibrated later — same file
contract), periodically extended.

Damping is the honest open issue: SMC eddy damping is small and the guide
friction is unknown until the bearing is chosen; with F_fric → 0 the translator
RINGS at the detent stiffness frequency and settling is friction-limited. We
report step time + settling across a friction band, plus energy/step and the
adiabatic coil ΔT.

Run:  ~/.venvs/phantm/bin/python dynamics.py   (after five_numbers.py)
"""

from __future__ import annotations

import json
import os

import numpy as np

import geometry as geo
from params import BASELINE, G_ACCEL

OUT = os.path.join(os.path.dirname(__file__), "out")
PITCH_MM = 0.464


class CurveSet:
    def __init__(self, npz_path=None):
        if npz_path is None:
            npz_path = os.environ.get("PHANTM_CURVES", os.path.join(OUT, "curves.npz"))
        d = np.load(npz_path)
        self.xs = d["xs_detent"]            # m, one pitch centred on 0
        self.f_det = d["f_detent"]          # N
        self.f_drv = d["f_drive"]           # N (one coil at Ic, all PMs)
        self.ic = float(d["ic_a"])
        self.pitch = self.xs[-1] - self.xs[0]

    def _interp(self, x, ys):
        xp = (np.asarray(x) - self.xs[0]) % self.pitch + self.xs[0]
        return np.interp(xp, self.xs, ys)

    def detent(self, x):
        return self._interp(x, self.f_det)

    def drive(self, x):
        return self._interp(x, self.f_drv)


def find_equilibria(c: CurveSet):
    """Stable zero crossings (+→−) of the detent curve within one pitch."""
    eq = []
    f = c.f_det
    for i in range(len(f) - 1):
        if f[i] > 0 > f[i + 1]:
            x0, x1, f0, f1 = c.xs[i], c.xs[i + 1], f[i], f[i + 1]
            eq.append(x0 + f0 * (x1 - x0) / (f0 - f1))
    return eq


def simulate_step(c: CurveSet, m_kg: float, f_fric_n: float,
                  pulse_ms: float = 3.0, t_end_ms: float = 8.0, dt_us: float = 0.2):
    """Integrate one step from the equilibrium nearest x=0 (semi-implicit Euler)."""
    eqs = find_equilibria(c)
    x = min(eqs, key=abs)                       # start at the detent nearest 0
    # target: next stable equilibrium in +x
    targets = sorted(e for e in eqs + [e + c.pitch for e in eqs] if e > x + 1e-5)
    x_tgt = targets[0]
    v = 0.0
    dt = dt_us * 1e-6
    n = int(t_end_ms * 1e-3 / dt)
    ts = np.arange(n) * dt
    xs = np.empty(n)
    t_reach = None
    for k in range(n):
        drive_on = ts[k] < pulse_ms * 1e-3
        f = c.drive(x) if drive_on else c.detent(x)
        fr = -f_fric_n * np.sign(v) if abs(v) > 1e-6 else -np.clip(f, -f_fric_n, f_fric_n)
        a = (f + fr) / m_kg
        v += a * dt
        x += v * dt
        xs[k] = x
        if t_reach is None and x >= x_tgt - 2e-6:
            t_reach = ts[k]
    # settling: last time |x − x_tgt| exceeded ±5 µm
    err = np.abs(xs - x_tgt)
    out = np.where(err > 5e-6)[0]
    t_settle = ts[out[-1]] + dt if len(out) and out[-1] < n - 1 else None
    x_final = float(np.mean(xs[-int(0.5e-3 / dt):]))
    completed = abs(x_final - x_tgt) < 20e-6
    return {
        "x_start_um": min(eqs, key=abs) * 1e6,
        "x_target_um": x_tgt * 1e6,
        "t_reach_ms": t_reach * 1e3 if t_reach is not None else None,
        "t_settle_ms": t_settle * 1e3 if t_settle is not None else None,
        "completed": bool(completed),
        "x_final_um": x_final * 1e6,
        "ring_hz": ring_frequency(c, m_kg, x_tgt),
    }


def ring_frequency(c: CurveSet, m_kg: float, x_eq: float) -> float:
    dx = 2e-6
    k = -(c.detent(x_eq + dx) - c.detent(x_eq - dx)) / (2 * dx)
    return float(np.sqrt(max(k, 0.0) / m_kg) / (2 * np.pi))


def coil_energetics(pulse_ms: float, ic_a: float, rc_ohm: float = 0.552):
    """Energy per step and adiabatic coil ΔT for a rectangular pulse."""
    e_j = ic_a**2 * rc_ohm * pulse_ms * 1e-3          # resistive (dominant)
    # coil copper mass: 63 mm of 50 µm wire
    m_cu = 8960.0 * 63e-3 * np.pi * (25e-6) ** 2
    dT = e_j / (m_cu * 385.0)
    return e_j, dT


def capture_window(c: CurveSet, m_kg: float, f_fric_n: float,
                   pulses_ms=np.arange(0.2, 4.01, 0.2)):
    """Pulse widths that land the translator in the CORRECT next detent.

    Open-loop single-phase drive can overshoot into the next-next basin (seen
    2026-07-24 with a 3 ms pulse) or under-shoot back; the honest deliverable
    is the window of pulse widths that step reliably, per friction level.
    """
    good = []
    for tc in pulses_ms:
        r = simulate_step(c, m_kg, f_fric_n, pulse_ms=float(tc), t_end_ms=12.0)
        if r["completed"]:
            good.append(float(tc))
    return good


def main():
    p = BASELINE
    s = geo.summarise(p)
    mt = s.translator_mass_kg
    c = CurveSet()
    eqs = find_equilibria(c)
    print(f"curves: {os.environ.get('PHANTM_CURVES', 'out/curves.npz')}  Ic={c.ic:.3f} A")
    print(f"detent equilibria (µm): {[f'{e*1e6:+.1f}' for e in eqs]}")
    print(f"ring frequency at first eq: {ring_frequency(c, mt, min(eqs, key=abs)):.0f} Hz")
    rows = []
    for fric_mn in (0.05, 0.2, 0.5, 1.0):
        win = capture_window(c, mt, fric_mn * 1e-3)
        # representative step at the middle of the window (if any)
        r = (simulate_step(c, mt, fric_mn * 1e-3, pulse_ms=win[len(win) // 2])
             if win else simulate_step(c, mt, fric_mn * 1e-3))
        rows.append({"f_fric_mn": fric_mn, "capture_window_ms": win, **r})
        wtxt = (f"{win[0]:.1f}–{win[-1]:.1f} ms ({len(win)}/20 widths ok)"
                if win else "EMPTY — no reliable open-loop step")
        reach = f"{r['t_reach_ms']:.2f} ms" if r["t_reach_ms"] is not None else "n/a"
        print(f"F_fric={fric_mn:.2f} mN: capture window {wtxt}; reach {reach}, "
              f"final {r['x_final_um']:+.1f} µm (target {r['x_target_um']:+.1f})")
    e_j, dT = coil_energetics(1.5, c.ic)
    print(f"energy/step (1.5 ms pulse @ {c.ic:.2f} A): {e_j*1e3:.2f} mJ; coil ΔT {dT:.1f} K")
    with open(os.path.join(OUT, "dynamics.json"), "w") as f:
        json.dump({"equilibria_um": [e * 1e6 for e in eqs],
                   "steps": rows, "energy_per_step_mj": e_j * 1e3,
                   "coil_dT_per_step_k": dT, "pulse_ms": 1.5, "ic_a": c.ic}, f, indent=2)
    print("wrote out/dynamics.json")


if __name__ == "__main__":
    main()
