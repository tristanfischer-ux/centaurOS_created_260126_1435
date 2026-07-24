"""PHANTM Phase 3 — the air-piston damper (Tony item 10), on the OPTIMISED SET.

Model: the reflector piston runs in the closed-front hex bore (interior
across-flats 3.10 mm, area 8.323 mm²). Front chamber = air column between foil
and the sealed front window; a vent orifice (hole in the foil, or the edge
clearance's equivalent area) bleeds it. Behind the foil the cavity is assumed
vented to ambient (stated assumption). Gas: isentropic γ=1.4 from ambient.

Chamber:  V = A·(L0 − x);   dp/dt = −γ·p_abs·(dV/dt + Q_out)/V
Orifice:  Q_out = Cd·Ao·sign(p_g)·√(2|p_g|/ρ)      (Cd = 0.65)
Piston:   F_air = −p_gauge·A
Step ODE: m·ẍ = F_net(x) + F_air ; driven curve for the 1.5 ms pulse, detent
          curve after; RK4, dt 1 µs, 25 ms horizon.

Metrics per vent size: overshoot past target basin, double-step escape,
settle time (|x − x_target| < 10 µm sustained 1 ms), equivalent ζ at transit.
Run: ~/.venvs/phantm/bin/python damper.py   → out/opt/damper.json + fig-damper.png
"""
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "opt")
C = json.load(open(os.path.join(OUT, os.environ.get("PHANTM_CURVES", "winner-curves.json"))))

A = math.sqrt(3) / 2 * 3.1e-3**2            # hex bore area, m²
GAMMA, P0, RHO, CD = 1.4, 101325.0, 1.204, 0.65
F_FRIC = 0.35e-3   # N — guide Coulomb friction, mid of the brief's 0.2–0.5 mN band
M = (C["mass_mg"] + 3.0) * 1e-6             # translator + reflector/standoff, kg
K = C["k_det_n_per_m"]
L0 = 4.0e-3                                  # nominal foil→front-window air column
X = np.array(C["x_mm"]) * 1e-3               # m
F_DET = np.array(C["net_drawn_n"])
PITCH = C["pitch_mm"] * 1e-3
OFFS = [o * 1e-3 for o in C["offsets_drawn"]]

# ---- periodic single-pole force models (PM-only and PM+coil at ±I) ---------
PM_XS = np.array(C["pm_pole"][0]) * 1e-3
PM_FX = np.array(C["pm_pole"][1])
DRV_RAW = {float(k): (np.array(v[0]) * 1e-3, np.array(v[1]))
           for k, v in C["drv_pole_by_current"].items()}


def pole_force(x, xs, fx, off):
    """Periodic interp of a single-pole curve evaluated at (x − off)."""
    rel = np.mod(x - off - xs[0], PITCH) + xs[0]
    return np.interp(rel, xs, fx)


def net_det(x):
    return sum(pole_force(x, PM_XS, PM_FX, o) for o in OFFS)


def make_net_drv(scheme):
    """scheme: dict pole_index -> current (0.0 = PM only)."""
    def f(x):
        tot = 0.0
        for i, o in enumerate(OFFS):
            i_a = scheme.get(i, 0.0)
            if i_a == 0.0:
                tot += pole_force(x, PM_XS, PM_FX, o)
            else:
                xs, fx = DRV_RAW[i_a]
                tot += pole_force(x, xs, fx, o)
        return tot
    return f
F_DRV = None
T_PULSE = 1.5e-3

# basins of the detent curve (stable zeros)
s = np.sign(F_DET)
zc = np.where((s[:-1] > 0) & (s[1:] < 0))[0]
basins = X[zc]
# stepping convention: energising pole 0 pulls TOWARD its alignment — so the
# commanded step starts at the ADJACENT basin and lands at the pole-0 one.
i_tgt = int(np.argmin(np.abs(basins)))
x0, x1 = float(basins[i_tgt + 1]), float(basins[i_tgt])   # start -> target
STEP = abs(x1 - x0)
DIRN = math.copysign(1.0, x1 - x0)

fn = math.sqrt(K / M) / (2 * math.pi)
c_crit = 2 * math.sqrt(K * M)


def f_of(x, arr):
    return float(np.interp(x, X, arr, left=arr[0], right=arr[-1]))


def simulate(ao_m2, t_end=60e-3, dt=1e-6, air=True, f_drv=None, t_pulse=T_PULSE):
    """Return trajectory + metrics for one commanded step with vent area ao."""
    x, v, p = x0, 0.0, P0            # p = absolute chamber pressure
    t, traj = 0.0, []
    x_ext = x0
    while t < t_end:
        drv = t < t_pulse

        def acc(x_, v_, p_):
            f = f_drv(x_) if drv else net_det(x_)
            f_air = -(p_ - P0) * A if air else 0.0
            f_fric = -math.copysign(min(F_FRIC, abs(f + f_air)), v_) if abs(v_) > 1e-5 else 0.0
            return (f + f_air + f_fric) / M

        def pdot(x_, v_, p_):
            vol = A * (L0 - (x_ - x0))
            pg = p_ - P0
            q = CD * ao_m2 * math.copysign(math.sqrt(2 * abs(pg) / RHO), pg) if ao_m2 > 0 else 0.0
            dvdt = -A * v_
            return -GAMMA * p_ * (dvdt + q) / vol

        # RK4 on (x, v, p)
        k1 = (v, acc(x, v, p), pdot(x, v, p))
        k2 = (v + dt / 2 * k1[1], acc(x + dt / 2 * k1[0], v + dt / 2 * k1[1], p + dt / 2 * k1[2]),
              pdot(x + dt / 2 * k1[0], v + dt / 2 * k1[1], p + dt / 2 * k1[2]))
        k3 = (v + dt / 2 * k2[1], acc(x + dt / 2 * k2[0], v + dt / 2 * k2[1], p + dt / 2 * k2[2]),
              pdot(x + dt / 2 * k2[0], v + dt / 2 * k2[1], p + dt / 2 * k2[2]))
        k4 = (v + dt * k3[1], acc(x + dt * k3[0], v + dt * k3[1], p + dt * k3[2]),
              pdot(x + dt * k3[0], v + dt * k3[1], p + dt * k3[2]))
        x += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
        v += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
        p += dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
        t += dt
        traj.append((t, x))
        if DIRN * (x - x_ext) > 0:
            x_ext = x
    traj = np.array(traj)
    # settle: last time |x - x1| > 10 µm
    err = np.abs(traj[:, 1] - x1)
    bad = np.where(err > 10e-6)[0]
    settle_ms = traj[bad[-1], 0] * 1e3 if len(bad) else 0.0
    double = DIRN * (x_ext - x1) > 0.6 * STEP
    captured = (not double) and err[-1] < 10e-6
    overshoot_um = DIRN * (x_ext - x1) * 1e6
    return traj, dict(settle_ms=round(float(settle_ms), 2),
                      overshoot_um=round(float(overshoot_um), 1),
                      double_step=bool(double), captured=bool(captured))


def main():
    # --- drive-scheme selection (Phase-3 finding: the optimised detent is too
    # strong for single-coil unipolar stepping — test SINGLE vs DUAL schemes) ---
    global F_DRV
    # start basin sits in pole-1's grip; target is pole-0's detent
    schemes = [
        ("SINGLE +3.35A",       {0: 3.35}),
        ("SINGLE +5A",          {0: 5.0}),
        ("DUAL +3.35/-3.35A",   {0: 3.35, 1: -3.35}),
        ("DUAL +3.35/-5A",      {0: 3.35, 1: -5.0}),
        ("DUAL +5/-3.35A",      {0: 5.0, 1: -3.35}),
        ("DUAL +5/-5A",         {0: 5.0, 1: -5.0}),
    ]
    # a usable HOLD scheme = held landscape has a stable equilibrium at the
    # target basin. Print each scheme's held equilibria and pick the one whose
    # equilibrium is nearest the target (then min energy).
    xg = np.linspace(min(x0, x1) - 60e-6, max(x0, x1) + 60e-6, 1200)
    chosen = None
    for name, sch in schemes:
        fd = make_net_drv(sch)
        fv = np.array([fd(x) for x in xg])
        sg = np.sign(fv)
        st = np.where((sg[:-1] > 0) & (sg[1:] < 0))[0]
        eq = xg[st] if len(st) else np.array([])
        d_tgt = float(np.min(np.abs(eq - x1))) * 1e6 if len(eq) else None
        # barrier check: worst backward push along the travel path
        xp = np.linspace(min(x0, x1) + 5e-6, max(x0, x1) - 5e-6, 61)
        barrier = max(DIRN * -fd(x) * -1 for x in xp)  # + = away from target
        barrier = max(-DIRN * -fd(x) for x in xp) if False else max(
            (fd(x) if DIRN < 0 else -fd(x)) for x in xp)
        e_mj = sum(i**2 for i in sch.values()) * 0.552 * T_PULSE * 1e3
        print(f"{name:20s}: eq {[round(float(e)*1e6,1) for e in eq]} µm "
              f"(target {x1*1e6:.1f}); barrier {barrier*1e3:+.2f} mN; {e_mj:.1f} mJ/1.5ms")
        if d_tgt is not None and d_tgt < 60 and barrier < 0.5e-3:
            if chosen is None or e_mj < chosen[2]:
                chosen = (name, sch, e_mj)
    assert chosen is not None, "no scheme holds a stable equilibrium at the target"
    scheme_name, scheme, _ = chosen
    F_DRV = make_net_drv(scheme)
    i_sum_sq = sum(i**2 for i in scheme.values())
    print(f"chosen HOLD scheme (equilibrium at target, min energy): {scheme_name}\n")

    # --- HOLD-then-release grid (§4.4 doctrine): the damper's job is to
    # shorten the hold needed for guaranteed capture ---------------------------
    pulses_ms = [3.0, 5.0, 8.0, 12.0, 20.0, 40.0]
    grid = {}
    for d_mm in [0.0, 0.15, 0.20, 0.25, 0.30, 0.40, 0.60, 99.0]:
        ao = math.pi * (d_mm * 1e-3) ** 2 / 4 if 0 < d_mm < 99 else 0.0
        caps = []
        for tp in pulses_ms:
            if d_mm >= 99:
                _, met = simulate(0.0, air=False, f_drv=F_DRV, t_pulse=tp * 1e-3)
            else:
                _, met = simulate(ao, f_drv=F_DRV, t_pulse=tp * 1e-3)
            caps.append((tp, met))
        good = [tp for tp, m in caps if m["captured"]]
        # robustness = every hold >= the minimum hold must ALSO capture
        min_hold = None
        for tp in pulses_ms:
            tail = [m["captured"] for t2, m in caps if t2 >= tp]
            if tail and all(tail):
                min_hold = tp
                break
        lab = "sealed" if d_mm == 0 else ("open" if d_mm >= 99 else f"Ø{d_mm:.2f}")
        grid[lab] = dict(vent_mm=None if d_mm >= 99 else d_mm,
                         capture_holds_ms=good, min_reliable_hold_ms=min_hold,
                         best_settle_ms=min((m["settle_ms"] for tp, m in caps
                                             if m["captured"]), default=None))
        print(f"vent {lab:7s}: captures at holds {good} ms — min reliable hold "
              f"{min_hold} ms, best settle {grid[lab]['best_settle_ms']}", flush=True)
    e_step_mj = None  # per-pulse-width; computed for the recommendation below
    # recommendation: vented cell with the WIDEST capture window (robustness),
    # tie-break on best settle
    cands = [(lab, g) for lab, g in grid.items()
             if g["vent_mm"] not in (None, 0.0) and g["min_reliable_hold_ms"]]
    best = None
    if cands:
        lab, g = min(cands, key=lambda kv: (kv[1]["min_reliable_hold_ms"],
                                            kv[1]["best_settle_ms"] or 99))
        hold = g["min_reliable_hold_ms"]
        e_step_mj = i_sum_sq * 0.552 * hold * 1e-3 * 1e3
        best = dict(vent=lab, hold_ms=hold, settle_ms=g["best_settle_ms"],
                    e_step_mj=round(e_step_mj, 1))
    rows = [dict(label=lab, **g) for lab, g in grid.items()]
    trajs = {}
    if best:
        ao = math.pi * (float(best["vent"].replace("Ø", "")) * 1e-3) ** 2 / 4
        for lab2, ao2, air2 in (("recommended", ao, True), ("open", 0.0, False)):
            tr, _ = simulate(ao2, air=air2, f_drv=F_DRV, t_pulse=best["hold_ms"] * 1e-3)
            trajs[lab2] = tr
    out = dict(config=C["config"], mass_kg=M, k_det=K, fn_hz=round(fn, 1),
               drive_scheme=scheme_name,
               c_crit=round(c_crit, 4), step_um=round(STEP * 1e6, 1),
               chamber_area_mm2=round(A * 1e6, 3), L0_mm=L0 * 1e3,
               assumptions="back cavity vented; isentropic; Cd 0.65; edge leak "
                           "counts toward vent area; L0 nominal 4 mm",
               rows=rows, recommended=best)
    json.dump(out, open(os.path.join(OUT, os.environ.get("PHANTM_DAMPER_OUT", "damper.json")), "w"), indent=1)

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.2), dpi=170)
    for lab in ("open", "recommended"):
        if lab in trajs:
            tr = trajs[lab]
            a1.plot(tr[:, 0] * 1e3, (tr[:, 1] - x0) * 1e6, lw=1.4, label=lab)
    a1.axhline(STEP * 1e6, color="#666", ls=":", lw=1)
    a1.set_xlabel("time (ms)"); a1.set_ylabel("position (µm)")
    a1.set_title("One commanded step (1.5 ms pulse then release)", fontsize=10)
    a1.legend(fontsize=8); a1.grid(alpha=0.25); a1.set_xlim(0, 15)
    vs = [r["vent_mm"] for r in rows if r["vent_mm"] not in (None, 0.0)]
    wd = [r["min_reliable_hold_ms"] or 25 for r in rows if r["vent_mm"] not in (None, 0.0)]
    a2.plot(vs, wd, "o-", color="#1a5fb4")
    a2.set_xlabel("vent hole Ø (mm)"); a2.set_ylabel("min reliable hold (ms)")
    a2.set_title("The damper's job: shortest hold-then-release that always captures", fontsize=10)
    a2.grid(alpha=0.25)
    fig.suptitle(f"Air-piston damper — optimised set (k={K:.0f} N/m, fn={fn:.0f} Hz, "
                 f"step {STEP*1e6:.0f} µm)", fontsize=10, fontweight="bold")
    fig.tight_layout(rect=(0, 0, 1, 0.92))
    fig.savefig(os.path.join(OUT, "fig-damper.png"))
    print(f"\nfn {fn:.0f} Hz, c_crit {c_crit:.3f}; recommended: "
          f"{best['vent'] if best else 'NONE CAPTURES'}; wrote damper.json + fig")

    # selftest gates
    open_g = grid["open"]
    assert best is not None, "some vent+hold must capture"
    o = open_g["min_reliable_hold_ms"] or 99
    assert best["hold_ms"] <= o, "damper must not lengthen the reliable hold"
    print("SELFTEST PASS")


if __name__ == "__main__":
    main()
