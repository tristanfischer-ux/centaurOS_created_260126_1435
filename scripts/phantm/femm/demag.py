"""PHANTM — DEMAGNETISATION FE gate (the gate that blocks dual drive).

THE QUESTION. The optimised force sets cannot be stepped with a single coil:
the detent is too strong, so the step is driven DUAL — one coil PULLS (positive
current, aiding its own magnet) while the neighbour CANCELS (negative current,
driving reverse MMF to collapse its own pole's detent so the translator can
leave the basin). That cancel coil is wound round its OWN magnet. The reverse
MMF it applies is therefore a demagnetising field on that magnet, and if it
pushes the magnet past the knee of its intrinsic curve the loss is
IRREVERSIBLE: the detent comes back weaker every step until the actuator stops
holding. Nothing in the force model would notice — the force sweeps all assume
a fully-magnetised slug.

WHY THE FE MODEL CANNOT ANSWER THIS ON ITS OWN. FEMM's permanent magnet is a
LINEAR recoil line (B = Br + µ0·µr·H) with no knee anywhere in it. Drive the
coil hard enough and the solver reports a serenely converged operating point at
an H that would in reality have wrecked the magnet. So the knee has to be
imposed from OUTSIDE, as an acceptance test on the FE result — the FE supplies
the operating point, materials.NDFEB_GRADES supplies the limit. That split is
the whole design of this gate.

TWO TRAPS, BOTH AVOIDED HERE.

  1. THE AVERAGE IS THE WRONG STATISTIC. A block integral gives mean By over
     the magnet, and the mean is not what demagnetises — the magnet loses flux
     wherever the local reverse field is worst, and that corner then stays lost.
     This module probes a GRID of points inside the slug via mo_getpointvalues
     and takes the worst, reporting the mean alongside purely to show the size
     of the error the mean would have made.

  2. DEMAGNETISATION IS A HOT FAILURE. Intrinsic coercivity falls at about
     -0.6 %/K, five times faster than remanence's -0.12 %/K. A magnet with
     comfortable margin on the bench can be past its knee at 100 C. So the
     answer is never a single number — it is a MAXIMUM OPERATING TEMPERATURE
     per grade, which is also precisely the form Tony's open question 4 (peak
     temperature) needs to be answered against.

METHOD. Three stages, cheap by construction:
  A. locate the worst position + worst probe point over one tooth pitch, at the
     strongest cancel current;
  B. confirm that location does not move when the magnet is hot (if it moved,
     stage C would be probing the wrong place);
  C. at that location, sweep cancel current x temperature to get H_worst, then
     convert to a max reversible temperature per candidate grade.

Run:  ~/.venvs/phantm/bin/python -m femm.demag   ->  out/demag-fe.json
"""

from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from materials import NDFEB_GRADES, KNEE_FRACTION_DEFAULT, NdFeBMaterial
from params import BASELINE
from . import lua_gen
from .fixed_design import BRIDGE_SCALE, FIXED
from .sweep import CASES, run_case
from .variants import apply_variant

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

# The two optimised sets whose stepping needs DUAL drive (out/opt/damper*.json).
# MAX-FORCE is the harder demagnetisation case on BOTH counts at once: it uses
# the highest cancel current AND N52, which has the LOWEST intrinsic coercivity
# of the common grades (high remanence and high coercivity trade against each
# other). That combination is the point of running both.
CONFIGS = [
    dict(name="BALANCED", tag="d40-t150-ss200-Br1.3-g20-Pm0.4",
         gap=0.020, duty=0.40, tslot=1.50, sslot=2.0, br=1.30, pm=0.40,
         i_cancel=-3.35, grades=["N42", "N42M", "N42H", "N42SH", "N42UH", "N42EH"]),
    dict(name="MAX-FORCE", tag="d40-t150-ss200-N52-g20-Pm0.50",
         gap=0.020, duty=0.40, tslot=1.50, sslot=2.0, br=1.45, pm=0.50,
         i_cancel=-5.00, grades=["N52", "N50M"]),
]

# Cancel currents to characterise: the stepping regime, both dual schemes, and
# zero (the magnet's own self-demagnetisation floor — the number that says how
# much of the reverse field is the coil's doing at all).
I_CANCEL_SET = [0.0, -1.8, -3.35, -5.0]

TEMPS_C = [20.0, 40.0, 60.0, 80.0, 100.0, 120.0, 150.0]

N_X_SCAN = 16          # positions over one pitch for the stage-A worst-case scan
PROBE_NX, PROBE_NY = 5, 7
PROBE_INSET = 0.10     # fraction of each side kept clear of the block boundary


def configure(cfg: dict, temp_c: float = 20.0) -> None:
    """Point lua_gen at one optimised configuration, with Br derated to temp_c."""
    apply_variant(dict(FIXED, gap=cfg["gap"],
                       tooth=round(cfg["duty"] * lua_gen.PITCH, 4),
                       ss_slot_d=round(0.155 * cfg["sslot"], 4)))
    lua_gen.BRIDGE_T = 0.232 * (1.162 / 1.55) * BRIDGE_SCALE
    lua_gen.BRIDGE_X0 = lua_gen.BRIDGE_X1 - lua_gen.BRIDGE_T
    lua_gen.SLOT_T = round(0.465 * cfg["tslot"], 4)
    # The FE magnet is defined by Br, so temperature enters the SOLVE through
    # the remanence derating; the coercivity derating enters later, in the
    # acceptance test. Both are needed — neither alone is the answer.
    mag = NdFeBMaterial(br_t=cfg["br"])
    BASELINE.materials.ndfeb_br_t = mag.br_at(temp_c)


def probe_grid(pm_mm: float):
    """Points strictly inside the PM slug, in mm.

    Inset from the boundary because a point query exactly on a block edge sits
    on a material discontinuity, where the recovered field is whichever side
    the element happens to belong to — an avoidable source of noise in the very
    statistic the gate turns on.
    """
    x0, x1 = lua_gen.BRIDGE_X0, lua_gen.BRIDGE_X1
    y0, y1 = -pm_mm / 2.0, pm_mm / 2.0
    dx, dy = (x1 - x0) * PROBE_INSET, (y1 - y0) * PROBE_INSET
    xs = np.linspace(x0 + dx, x1 - dx, PROBE_NX)
    ys = np.linspace(y0 + dy, y1 - dy, PROBE_NY)
    return [(float(x), float(y)) for y in ys for x in xs]


def _probe_hy(res: dict, n: int) -> np.ndarray:
    """Hy at each probe, A/m. Magnetisation is +y, so Hy IS the demag component."""
    return np.array([res[f"probe{k}_hy"] for k in range(n)])


def scan_positions(cfg: dict, i_a: float, temp_c: float, n_x: int = N_X_SCAN,
                   workers: int = 6):
    """Worst (most negative) Hy over position x probe, at one current/temperature."""
    configure(cfg, temp_c)
    pts = probe_grid(cfg["pm"])
    xs = (np.arange(n_x) / n_x - 0.5) * lua_gen.PITCH
    with ThreadPoolExecutor(max_workers=workers) as ex:
        results = list(ex.map(
            lambda x: run_case(float(x), i_a, cfg["pm"], probe_pts=pts), xs))
    hy = np.array([_probe_hy(r, len(pts)) for r in results])   # (n_x, n_probe)
    ix, ip = np.unravel_index(np.argmin(hy), hy.shape)
    return dict(xs=xs, hy=hy, pts=pts,
                worst_x_mm=float(xs[ix]), worst_probe=int(ip),
                worst_hy=float(hy[ix, ip]),
                mean_hy_at_worst_x=float(np.mean(hy[ix])))


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    out = dict(knee_fraction=KNEE_FRACTION_DEFAULT, temps_c=TEMPS_C,
               i_cancel_set=I_CANCEL_SET, configs=[])

    for cfg in CONFIGS:
        print(f"\n=== {cfg['name']}  ({cfg['tag']})  cancel {cfg['i_cancel']} A ===",
              flush=True)

        # --- stage A: where is the worst point, cold? ----------------------
        a_cold = scan_positions(cfg, cfg["i_cancel"], 20.0)
        print(f"  A cold : worst Hy {a_cold['worst_hy']/1e3:8.1f} kA/m "
              f"at x={a_cold['worst_x_mm']*1e3:+7.1f} µm probe {a_cold['worst_probe']} "
              f"| mean over slug at that x {a_cold['mean_hy_at_worst_x']/1e3:8.1f} kA/m",
              flush=True)

        # --- stage B: does that location move when hot? --------------------
        a_hot = scan_positions(cfg, cfg["i_cancel"], TEMPS_C[-1])
        moved = (abs(a_hot["worst_x_mm"] - a_cold["worst_x_mm"]) > 1e-9
                 or a_hot["worst_probe"] != a_cold["worst_probe"])
        print(f"  B hot  : worst Hy {a_hot['worst_hy']/1e3:8.1f} kA/m "
              f"at x={a_hot['worst_x_mm']*1e3:+7.1f} µm probe {a_hot['worst_probe']} "
              f"| location {'MOVED' if moved else 'unchanged'}", flush=True)

        # If the worst location moves with temperature, pin stage C to whichever
        # is worse rather than silently probing a location that is no longer the
        # binding one.
        pin = a_hot if a_hot["worst_hy"] < a_cold["worst_hy"] else a_cold
        x_pin, p_pin = pin["worst_x_mm"], pin["worst_probe"]

        # --- stage C: current x temperature at the pinned location ---------
        pts = probe_grid(cfg["pm"])
        grid = []
        for temp in TEMPS_C:
            configure(cfg, temp)
            with ThreadPoolExecutor(max_workers=6) as ex:
                res = list(ex.map(
                    lambda i: run_case(x_pin, i, cfg["pm"], probe_pts=pts),
                    I_CANCEL_SET))
            for i_a, r in zip(I_CANCEL_SET, res):
                hy_all = _probe_hy(r, len(pts))
                grid.append(dict(temp_c=temp, i_a=i_a,
                                 hy_worst=float(np.min(hy_all)),
                                 hy_at_pin=float(hy_all[p_pin]),
                                 hy_mean=float(np.mean(hy_all))))
            row = [g for g in grid if g["temp_c"] == temp]
            print("  C " + f"{temp:5.0f} C : " + "  ".join(
                f"{g['i_a']:+5.2f}A {g['hy_worst']/1e3:8.1f}" for g in row)
                + "  kA/m (worst)", flush=True)

        # --- acceptance test against the knee -------------------------------
        verdicts = []
        for grade in cfg["grades"]:
            mag = NdFeBMaterial(br_t=cfg["br"], grade=grade)
            per_scheme = []
            for i_a in I_CANCEL_SET:
                if i_a == 0.0:
                    continue
                # Reverse field magnitude the magnet sees at this cancel
                # current, taken at the hottest temperature evaluated for a
                # worst-case read, and per-temperature for the margin curve.
                curve = []
                for temp in TEMPS_C:
                    g = next(x for x in grid
                             if x["temp_c"] == temp and x["i_a"] == i_a)
                    h_rev = abs(g["hy_worst"])
                    knee = mag.h_knee_at(temp)
                    curve.append(dict(temp_c=temp,
                                      h_reverse_ka_m=round(h_rev / 1e3, 1),
                                      knee_ka_m=round(knee / 1e3, 1),
                                      margin=round(knee / h_rev, 3) if h_rev > 0 else None,
                                      safe=bool(h_rev < knee)))
                # The headline: the temperature at which the WORST-CASE reverse
                # field first reaches the knee. Uses the hottest-evaluated
                # reverse field, which is conservative (H_reverse itself grows
                # only weakly with T while the knee collapses).
                h_hot = abs(next(x for x in grid
                                 if x["temp_c"] == TEMPS_C[-1]
                                 and x["i_a"] == i_a)["hy_worst"])
                per_scheme.append(dict(
                    i_cancel_a=i_a,
                    t_max_reversible_c=round(mag.t_max_reversible(h_hot), 1),
                    curve=curve))
            verdicts.append(dict(grade=grade,
                                 hcj20_ka_m=round(NDFEB_GRADES[grade]["hcj"] / 1e3),
                                 t_max_catalogue_c=NDFEB_GRADES[grade]["t_max_c"],
                                 schemes=per_scheme))

        # --- the actionable form: a usable temperature ceiling per grade ----
        # A magnet has TWO independent temperature limits and the design is
        # bounded by the lower one:
        #   catalogue Tmax    the grade's own thermal rating (flux stability,
        #                     corrosion, the supplier's warranty)
        #   T_max_reversible  the temperature at which THIS geometry's cancel
        #                     coil pushes it past the knee (what this gate
        #                     computes)
        # Which one binds is not the same for every grade, and that is the
        # result worth reporting. For the ordinary grades the catalogue rating
        # binds with room to spare, so the cancel coil is simply not the
        # constraint. For the exotic high-coercivity grades the ordering
        # inverts: their thermal rating runs so far above the knee curve that
        # demagnetisation becomes the real ceiling. Reporting a single
        # pass/fail would hide that inversion.
        def t_max_rev(grade, i_a, kf, a_hcj):
            g = NDFEB_GRADES[grade]
            h_hot = abs(next(x for x in grid
                             if x["temp_c"] == TEMPS_C[-1]
                             and x["i_a"] == i_a)["hy_worst"])
            knee = lambda T: kf * max(g["hcj"] * (1.0 + a_hcj * (T - 20.0)), 0.0)
            lo, hi = -40.0, 250.0
            if knee(lo) <= h_hot:
                return lo
            if knee(hi) > h_hot:
                return hi
            for _ in range(200):
                mid = 0.5 * (lo + hi)
                lo, hi = (mid, hi) if knee(mid) > h_hot else (lo, mid)
            return 0.5 * (lo + hi)

        ceilings = []
        for grade in cfg["grades"]:
            cat = NDFEB_GRADES[grade]["t_max_c"]
            tmr = t_max_rev(grade, cfg["i_cancel"], KNEE_FRACTION_DEFAULT,
                            NDFEB_GRADES[grade]["alpha_hcj"])
            ceilings.append(dict(
                grade=grade, t_max_catalogue_c=cat,
                t_max_reversible_c=round(tmr, 1),
                usable_ceiling_c=round(min(cat, tmr), 1),
                binding=("demagnetisation" if tmr < cat else "grade thermal rating"),
                headroom_k=round(tmr - cat, 1)))
        for c_ in ceilings:
            print(f"    {c_['grade']:6s} ceiling {c_['usable_ceiling_c']:6.1f} C "
                  f"(catalogue {c_['t_max_catalogue_c']:3d}, demag "
                  f"{c_['t_max_reversible_c']:6.1f}) -> binding: {c_['binding']}",
                  flush=True)

        # --- sensitivity to the two DECLARED assumptions --------------------
        # The verdict rests on a knee fraction (0.85) and a coercivity
        # temperature coefficient (-0.6 %/K), neither measured on Tony's actual
        # magnet. Re-evaluating across their plausible bands costs no FE solves.
        # The question that matters is NOT "does every grade clear" — it is
        # whether the grades one would actually specify for a realistic
        # operating range still have demagnetisation comfortably off the
        # critical path.
        sens = []
        for kf in (0.75, 0.85, 0.95):
            for a_hcj in (-0.0065, -0.0060, -0.0050):
                rows_ = []
                for grade in cfg["grades"]:
                    cat = NDFEB_GRADES[grade]["t_max_c"]
                    tmr = t_max_rev(grade, cfg["i_cancel"], kf, a_hcj)
                    rows_.append(dict(grade=grade,
                                      t_max_reversible_c=round(tmr, 1),
                                      usable_ceiling_c=round(min(cat, tmr), 1),
                                      demag_binds=bool(tmr < cat)))
                sens.append(dict(knee_fraction=kf, alpha_hcj_per_k=a_hcj,
                                 at_design_cancel_a=cfg["i_cancel"],
                                 grades=rows_))
        # Headline robustness statement: across every assumption corner, does
        # the WORKHORSE grade (the lowest-coercivity one in the list, i.e. the
        # one actually specified today) still keep demagnetisation off the
        # critical path?
        work = cfg["grades"][0] if cfg["name"] == "BALANCED" else "N52"
        work_ok = [s for s in sens
                   if not next(g for g in s["grades"]
                               if g["grade"] == work)["demag_binds"]]
        print(f"  SENSITIVITY: for the specified grade {work}, demagnetisation "
              f"stays off the critical path in {len(work_ok)}/{len(sens)} corners "
              f"(knee 0.75-0.95 x alpha -0.65..-0.50 %/K)", flush=True)

        out["configs"].append(dict(
            ceilings=ceilings, sensitivity=sens,
            workhorse_grade=work,
            workhorse_corners_clear=[len(work_ok), len(sens)],
            name=cfg["name"], tag=cfg["tag"], br_t=cfg["br"], pm_mm=cfg["pm"],
            i_cancel_design_a=cfg["i_cancel"],
            worst_location=dict(x_mm=round(x_pin, 6), probe=p_pin,
                                probe_xy_mm=[round(v, 4) for v in pts[p_pin]],
                                moved_with_temperature=bool(moved)),
            worst_vs_mean_cold=dict(
                worst_ka_m=round(a_cold["worst_hy"] / 1e3, 1),
                mean_ka_m=round(a_cold["mean_hy_at_worst_x"] / 1e3, 1),
                ratio=round(a_cold["worst_hy"] / a_cold["mean_hy_at_worst_x"], 3)
                if a_cold["mean_hy_at_worst_x"] != 0 else None),
            grid=grid, verdicts=verdicts))

    out["runtime_s"] = round(time.time() - t0, 1)
    path = os.path.join(OUT, "demag-fe.json")
    json.dump(out, open(path, "w"), indent=1)
    print(f"\nwrote out/demag-fe.json ({out['runtime_s']:.0f} s)")


if __name__ == "__main__":
    main()
