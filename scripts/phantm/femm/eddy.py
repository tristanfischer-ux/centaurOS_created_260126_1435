"""PHANTM — TRANSIENT EDDY-CURRENT gate (the no-laminations claim).

THE CLAIM UNDER TEST. "No laminations needed for 1.5 ms DC pulses — flux
diffusion clears the pulse." It was carried as PROVEN-calc on a hand estimate
(tau ~15-60 us across the stator sections, up to ~0.3-0.6 ms on the deepest
translator return path) with an explicit OPEN GATE: the margin on the thickest
path is under 10x, and a hand estimate that close to the line is not something
to cut tooling against.

WHY THE HAND ESTIMATE ISN'T ENOUGH. The 1D slab formula tau = mu*sigma*d^2/pi^2
needs a single unambiguous thickness d. The actuator has no such thickness: flux
turns corners through the bridge, crosses two working gaps, and returns through
a translator that is 1.549 mm across but slotted on both faces. Which d? The
answer changes the estimate by an order of magnitude, and picking the flattering
one is exactly how a sub-10x margin becomes a surprise. A 2D harmonic solve on
the real geometry has no such freedom — the eddy paths are wherever the geometry
puts them.

WHICH MATERIAL ACTUALLY MATTERS. The brief assumes pressed SMC, whose whole
point is insulated powder particles: bulk resistivity ~400 uOhm*m, so eddy
currents are almost absent and the claim is trivially true. But SMC was KILLED
as a process (it cannot form 232 um teeth), and both surviving routes — micro-MIM
Fe-3%Si and stamped-and-bonded-SOLID electrical steel — are ~850x more
conductive. So the claim has to be re-tested on the material that will actually
be built, not the one the estimate assumed. That is the substance of this gate.

METHOD, AND A METRIC THAT WAS TRIED AND REJECTED. The obvious probe — sweep
frequency and watch the COIL FLUX LINKAGE roll off — does not work here, and the
reason is worth recording because it looks like it should. This is a GAPPED
magnetic circuit: two 20 um working gaps in series dominate the reluctance, so
the terminal flux is set by the gaps almost regardless of what the steel is
doing. Measured on this geometry, the linkage falls only 20% by 100 kHz, long
after the steel has stopped conducting flux at its centre. Terminal linkage is
therefore nearly BLIND to the quantity in question, and a corner frequency
extracted from it is meaningless. (Worse, the first cut of this module treated
"no corner found in the sweep" as "the circuit is infinitely fast" and reported
a 576x margin — a flattering answer produced by a fallback, not by physics.)

What the claim is actually about is whether flux fills the steel CROSS-SECTION
within the pulse. So the metric is measured inside the metal: |B| at the
centreline of the thickest section against |B| just under its surface. At low
frequency the ratio is 1 (fully penetrated); as eddy currents screen the
interior it collapses. The corner where the ratio falls to 1/sqrt(2) is the real
diffusion frequency of that section, tau = 1/(2*pi*f_c), and penetration at the
end of a pulse of length t is 1 - exp(-t/tau). No thickness has to be guessed.

The method is validated first against the closed-form 1D slab solution
|B_centre/B_surface| = 1/|cosh((1+j)*d/(2*delta))| (validate_slab below) — the
same discipline the force loop applies with its gapped C-core gate. A metric
that cannot reproduce a case with a known answer does not get to rule on tooling.

DECLARED LIMITATION. A harmonic solve linearises B-H, so relative permeability
becomes an input rather than an output. It is also the dominant uncertainty
(tau scales linearly with mu). Rather than pick a value, the gate sweeps mu_r
across the plausible band and reports the WORST corner — if the claim survives
mu_r = 4000 it survives anything realistic.

Run:  ~/.venvs/phantm/bin/python -m femm.eddy   ->  out/eddy-fe.json
"""

from __future__ import annotations

import json
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from . import lua_gen
from .lua_gen import _poly_lua
from .fixed_design import BRIDGE_SCALE, FIXED
from .sweep import CASES, run_case
from .variants import apply_variant

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

PULSE_MS = 1.5          # the drive pulse the claim is made against
PM_MM = 0.243           # fixed-design Pm* — the magnet is inert here anyway

# Conductivity in MS/m (FEMM's unit). The spread across these three IS the
# finding: the claim was estimated on the first row and will be built in the
# second or third.
MATERIALS = [
    dict(name="SMC (Somaloy-type, the brief's assumption)", sigma_ms=0.0025,
         note="insulated powder, rho ~400 uOhm*m — eddy currents nearly absent, "
              "but this process was KILLED (cannot form 232 um teeth)"),
    dict(name="micro-MIM Fe-3%Si (prototype-to-volume lead)", sigma_ms=2.13,
         note="rho ~0.47 uOhm*m solid; sinter porosity raises it somewhat, so "
              "this is the conservative (worst-eddy) value"),
    dict(name="stamped + bonded SOLID electrical steel (volume co-lead)",
         sigma_ms=2.13,
         note="bonded solid with no interlaminar insulation — magnetically "
              "identical to MIM for this purpose; the route Tony proposed"),
]

# Relative permeability band for the linearised harmonic solve. tau scales
# linearly with mu, so the top of this band is the binding corner — but the top
# is also the LEAST representative of operation. 4000 is the small-signal
# unsaturated figure; in service the bridge and tooth regions run at 1.5-2 T,
# deep into saturation, where the DIFFERENTIAL permeability that governs a flux
# CHANGE is one to two orders lower. Both ends are reported: 4000 is the
# pessimistic cold/low-flux corner, ~100-500 is the working point.
MU_R_BAND = [100, 500, 1500, 4000]

# Log frequency sweep. The bottom decade stands in for DC (a true f=0 would
# switch the solver back to magnetostatic and lose the eddy physics).
FREQS_HZ = [0.1, 1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000]


MU0 = 4e-7 * math.pi


def slab_ratio_analytic(d_m: float, mu_r: float, sigma: float, f_hz: float) -> float:
    """|B_centre / B_surface| for a slab in a uniform tangential AC field.

    Classic 1D solution: B(x) = B_s * cosh(k x)/cosh(k d/2) with
    k = (1+j)/delta and delta = sqrt(2/(omega mu sigma)).
    """
    if f_hz <= 0:
        return 1.0
    omega = 2 * math.pi * f_hz
    delta = math.sqrt(2.0 / (omega * mu_r * MU0 * sigma))
    k = complex(1.0, 1.0) / delta
    return abs(1.0 / np.cosh(k * d_m / 2.0))


def _slab_lua(d_mm: float, mu_r: float, sigma_ms: float, f_hz: float,
              fem_name: str, b_applied: float = 0.1) -> str:
    """A tall conducting slab in a uniform tangential AC field.

    Uniform B_y is imposed by a prescribed-vector-potential boundary of the form
    A = A0 + A1*x + A2*y with A1 = -b_applied, since B_y = -dA/dx. The slab is
    made much taller than it is thick so the centre is genuinely 1D.
    """
    hx, hy = 4.0, 20.0          # air box half-extents (mm)
    half = d_mm / 2.0
    tall = 12.0                 # slab half-height (mm) >> half-thickness
    L = ["show_console()", "newdocument(0)",
         f'mi_probdef({f_hz:g}, "millimeters", "planar", 1e-8, 1.0, 30)',
         'mi_addmaterial("air", 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0)',
         f'mi_addmaterial("steel", {mu_r:g}, {mu_r:g}, 0, 0, {sigma_ms:g}, '
         f'0, 0, 1, 0, 0, 0)']
    L += _poly_lua([(-half, -tall), (half, -tall), (half, tall), (-half, tall)])
    L += ["mi_addblocklabel(0,0)", "mi_selectlabel(0,0)",
          f'mi_setblockprop("steel", 0, {max(d_mm / 40.0, 0.002):.5f}, '
          f'"<None>", 0, 1, 0)', "mi_clearselected()"]
    # prescribed A = -b_applied * x  ->  uniform B_y = b_applied
    L.append(f'mi_addboundprop("Auni", 0, {-b_applied:g}, 0, 0, 0, 0, 0, 0, 0)')
    L += _poly_lua([(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)])
    for px, py in ((0, -hy), (hx, 0), (0, hy), (-hx, 0)):
        L.append(f"mi_selectsegment({px},{py})")
    L += ['mi_setsegmentprop("Auni", 0, 1, 0, 0)', "mi_clearselected()",
          f"mi_addblocklabel({hx-0.5:.3f},{hy-0.5:.3f})",
          f"mi_selectlabel({hx-0.5:.3f},{hy-0.5:.3f})",
          'mi_setblockprop("air", 1, 0, "<None>", 0, 0, 0)', "mi_clearselected()",
          f'mi_saveas("{fem_name}")', "mi_analyze(1)", "mi_loadsolution()"]
    # centre of the slab, and just inside the surface
    for tag, px in (("centre", 0.0), ("surface", half * 0.90)):
        L.append(f"pA,pB1,pB2,pSig,pE,pH1,pH2,pJe,pJs,pMu1,pMu2,pPe,pPh "
                 f"= mo_getpointvalues({px:.6f},0)")
        L.append(f'print("PHANTM_RESULT {tag}_by=" .. pB2)')
    L.append("quit()")
    return "\n".join(L) + "\n"


def validate_slab(d_mm: float = 0.465, mu_r: float = 4000,
                  sigma_ms: float = 2.13, tol: float = 0.06):
    """Reproduce the closed-form slab solution before trusting the real geometry."""
    import subprocess
    from .runner import BIN, _CPLX_RE, _RESULT_RE
    os.makedirs(CASES, exist_ok=True)
    sigma = sigma_ms * 1e6
    rows = []
    for f in (100.0, 1000.0, 10000.0):
        path = os.path.join(CASES, f"slabval_{int(f)}.lua")
        with open(path, "w") as fh:
            fh.write(_slab_lua(d_mm, mu_r, sigma_ms, f, f"slabval_{int(f)}.fem"))
        proc = subprocess.run([os.path.abspath(BIN), "-q",
                               f"--lua-script={os.path.abspath(path)}"],
                              capture_output=True, text=True, timeout=120,
                              cwd=CASES)
        res = {k: complex(float(a), (1 if s == "+" else -1) * float(b))
               for k, a, s, b in _CPLX_RE.findall(proc.stdout)}
        for k, v in _RESULT_RE.findall(proc.stdout):
            # membership must be checked BEFORE float(), or the truncated real
            # part of an already-captured complex value is parsed and throws
            if k not in res:
                res[k] = complex(float(v), 0.0)
        if "centre_by" not in res or "surface_by" not in res:
            raise RuntimeError(f"slab validation produced no probes at {f} Hz:\n"
                               f"{proc.stdout[-1500:]}")
        fe = abs(res["centre_by"]) / abs(res["surface_by"])
        an = slab_ratio_analytic(d_mm * 1e-3, mu_r, sigma, f)
        # compare against the analytic ratio taken at the SAME probe offset
        an_surf = abs(1.0 / np.cosh(
            complex(1, 1) / math.sqrt(2.0 / (2 * math.pi * f * mu_r * MU0 * sigma))
            * (d_mm * 1e-3 / 2.0)))
        an_at_probe = an / (abs(np.cosh(
            complex(1, 1) / math.sqrt(2.0 / (2 * math.pi * f * mu_r * MU0 * sigma))
            * (0.90 * d_mm * 1e-3 / 2.0))) * an_surf) if an_surf else an
        err = abs(fe - an_at_probe) / an_at_probe
        rows.append(dict(f_hz=f, fe_ratio=round(fe, 5),
                         analytic_ratio=round(an_at_probe, 5),
                         rel_error=round(err, 4), ok=bool(err < tol)))
        for ext in (".lua", ".fem", ".ans"):
            p = os.path.join(CASES, f"slabval_{int(f)}{ext}")
            if os.path.exists(p):
                os.remove(p)
    return rows


def configure():
    """Fixed-design geometry — the first-hardware build, and what the estimate
    in the report was written against."""
    apply_variant(dict(FIXED))
    lua_gen.BRIDGE_T = 0.232 * (1.162 / 1.55) * BRIDGE_SCALE
    lua_gen.BRIDGE_X0 = lua_gen.BRIDGE_X1 - lua_gen.BRIDGE_T
    lua_gen.SLOT_T = 0.465


def steel_regions():
    """Interior probe points per steel region, in mm (call after configure()).

    Deliberately geometry-derived rather than hand-typed: the thickest
    continuous path is the translator CORE between the two slot bottoms
    (1.549 - 2*slot depth), which is the path the hand estimate flagged as the
    marginal one, and it moves whenever the slot depth is changed by a variant.
    """
    g = lua_gen
    core_half = g.HT - g.SLOT_T                      # translator core half-height
    back_mid = (g.SS_BACK_Y0 + g.SS_BACK_Y1) / 2.0   # slot-section back centre
    back_half = (g.SS_BACK_Y1 - g.SS_BACK_Y0) / 2.0
    br_mid_x = (g.BRIDGE_X0 + g.BRIDGE_X1) / 2.0
    br_half_x = (g.BRIDGE_X1 - g.BRIDGE_X0) / 2.0
    br_y = (PM_MM / 2.0 + g.SS_BACK_Y1) / 2.0        # bridge limb, clear of the PM
    return [
        dict(name="translator core (thickest path)",
             thickness_mm=round(2 * core_half, 4),
             pts=[(0.0, 0.0), (0.0, 0.5 * core_half), (0.15, 0.0),
                  (-0.15, 0.25 * core_half)]),
        dict(name="slot-section back",
             thickness_mm=round(2 * back_half, 4),
             pts=[(0.0, back_mid), (0.2, back_mid), (-0.2, back_mid)]),
        dict(name="bridge limb",
             thickness_mm=round(2 * br_half_x, 4),
             pts=[(br_mid_x, br_y), (br_mid_x, -br_y)]),
    ]


def sweep_frequency(mu_r: float, sigma_ms: float, workers: int = 6):
    """|B| at interior probes vs frequency, plus steel ohmic loss.

    Terminal flux linkage is returned too, but only to EVIDENCE the rejected
    metric in the artefact — it is not what the verdict is computed from.
    """
    regions = steel_regions()
    pts = [p for r in regions for p in r["pts"]]

    def one(f):
        return run_case(0.0, 1.0, PM_MM, probe_pts=pts,
                        harmonic=dict(freq_hz=f, mu_r=mu_r, sigma_ms=sigma_ms))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        res = list(ex.map(one, FREQS_HZ))

    bmag = np.zeros((len(FREQS_HZ), len(pts)))
    for i, r in enumerate(res):
        for k in range(len(pts)):
            bx, by = complex(r[f"probe{k}_bx"]), complex(r[f"probe{k}_by"])
            bmag[i, k] = math.hypot(abs(bx), abs(by))
    lam = np.array([abs(complex(r["flux_linkage"])) for r in res])
    loss = np.array([abs(complex(r.get("steel_loss_w", 0))) for r in res])
    return regions, pts, bmag, lam, loss


def corner_frequency(freqs, lam):
    """Frequency where |lambda| has fallen to 1/sqrt(2) of its DC value.

    Interpolated in log-frequency. Returns None if the sweep never reaches the
    corner, which is itself the answer: the circuit is faster than the sweep.
    """
    ref = lam[0]
    target = ref / math.sqrt(2.0)
    for i in range(1, len(lam)):
        if lam[i] <= target:
            f0, f1 = math.log10(freqs[i - 1]), math.log10(freqs[i])
            l0, l1 = lam[i - 1], lam[i]
            if l0 == l1:
                return freqs[i]
            frac = (l0 - target) / (l0 - l1)
            return 10 ** (f0 + frac * (f1 - f0))
    return None


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    configure()

    print("Validating the metric against the closed-form slab solution first:")
    val = validate_slab()
    for v in val:
        print(f"  {v['f_hz']:8.0f} Hz  FE {v['fe_ratio']:.5f}  "
              f"analytic {v['analytic_ratio']:.5f}  "
              f"err {v['rel_error']*100:5.2f}%  {'OK' if v['ok'] else 'FAIL'}")
    if not all(v["ok"] for v in val):
        raise RuntimeError("slab validation failed — the metric does not "
                           "reproduce a case with a known answer, so it does "
                           "not get to rule on the geometry")
    print()

    rows = []
    for mat in MATERIALS:
        for mu_r in MU_R_BAND:
            regions, pts, bmag, lam, loss = sweep_frequency(mu_r, mat["sigma_ms"])
            rel = bmag / bmag[0]                     # normalise each probe to DC
            per_region, k0 = [], 0
            for reg in regions:
                n = len(reg["pts"])
                sub = rel[:, k0:k0 + n]
                k0 += n
                # worst (most screened) probe in this region at each frequency
                worst_curve = sub.min(axis=1)
                fc = corner_frequency(FREQS_HZ, worst_curve)
                if fc is None:
                    tau_ms = 1.0 / (2 * math.pi * FREQS_HZ[-1]) * 1e3
                    note = (f"no corner below {FREQS_HZ[-1]:.0f} Hz — this "
                            f"section is faster than the sweep")
                    pen = 1.0 - math.exp(-PULSE_MS / tau_ms)
                else:
                    tau_ms = 1.0 / (2 * math.pi * fc) * 1e3
                    note = None
                    pen = 1.0 - math.exp(-PULSE_MS / tau_ms)
                per_region.append(dict(
                    region=reg["name"], thickness_mm=reg["thickness_mm"],
                    f_corner_hz=round(fc, 3) if fc else None,
                    tau_ms=round(tau_ms, 6), note=note,
                    penetration_at_pulse_end=round(pen, 8),
                    # Force goes as B^2, so a flux shortfall costs roughly twice
                    # as much force. This is the number the step actually feels.
                    force_fraction_at_pulse_end=round(pen ** 2, 8),
                    margin_pulse_over_tau=round(PULSE_MS / tau_ms, 1),
                    b_rel_worst=[round(float(v), 4) for v in worst_curve]))
            slow = max(per_region, key=lambda r: r["tau_ms"])
            rows.append(dict(
                material=mat["name"], sigma_ms=mat["sigma_ms"], mu_r=mu_r,
                regions=per_region, slowest_region=slow["region"],
                tau_ms=slow["tau_ms"],
                penetration_at_pulse_end=slow["penetration_at_pulse_end"],
                force_fraction_at_pulse_end=slow["force_fraction_at_pulse_end"],
                margin_pulse_over_tau=slow["margin_pulse_over_tau"],
                steel_loss_w_at_1khz=round(float(loss[FREQS_HZ.index(1000)]), 6),
                rejected_metric_lam_rel=[round(float(v / lam[0]), 4) for v in lam]))
            print(f"  {mat['name'][:42]:42s} mu_r {mu_r:5d} -> slowest "
                  f"{slow['region'][:26]:26s} tau {slow['tau_ms']*1e3:8.1f} us  "
                  f"flux at pulse end {slow['penetration_at_pulse_end']*100:8.4f}%  "
                  f"margin {slow['margin_pulse_over_tau']:7.1f}x", flush=True)

    # Worst corner across the routes that will actually be BUILT (SMC is
    # excluded: it was killed as a process, so its comfortable margin is not
    # evidence for anything that ships).
    real = [r for r in rows if r["sigma_ms"] > 0.01]
    worst = min(real, key=lambda r: r["margin_pulse_over_tau"])
    out = dict(pulse_ms=PULSE_MS, freqs_hz=FREQS_HZ, mu_r_band=MU_R_BAND,
               slab_validation=val, rows=rows,
               metric="interior |B| vs DC, worst probe per region",
               rejected_metric_note=(
                   "coil flux linkage — rejected: the two 20 um working gaps "
                   "dominate the reluctance, so terminal flux barely responds "
                   "to steel screening (falls only ~20% by 100 kHz)"),
               worst_buildable=dict(
                   material=worst["material"], mu_r=worst["mu_r"],
                   region=worst["slowest_region"], tau_ms=worst["tau_ms"],
                   penetration_at_pulse_end=worst["penetration_at_pulse_end"],
                   force_fraction_at_pulse_end=worst["force_fraction_at_pulse_end"],
                   margin_pulse_over_tau=worst["margin_pulse_over_tau"]),
               runtime_s=round(time.time() - t0, 1))
    json.dump(out, open(os.path.join(OUT, "eddy-fe.json"), "w"), indent=1)
    print(f"\nWORST buildable route: {worst['material']} at mu_r {worst['mu_r']}"
          f"\n  slowest section: {worst['slowest_region']} — "
          f"tau {worst['tau_ms']*1e3:.1f} us, "
          f"{worst['penetration_at_pulse_end']*100:.4f}% of final flux at the "
          f"end of a {PULSE_MS} ms pulse ({worst['margin_pulse_over_tau']:.0f}x margin)")
    print(f"wrote out/eddy-fe.json ({out['runtime_s']:.0f} s)")


if __name__ == "__main__":
    main()
