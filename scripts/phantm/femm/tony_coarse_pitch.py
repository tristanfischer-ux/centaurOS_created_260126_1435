"""PHANTM — Tony's 3 Aug proposal: keep a big gap, coarsen the tooth pattern.

HIS IDEA, and it is a good one. He does not want a 20-30 um assembled gap. He
observes that if the gap is small compared with the SLOT DEPTH the design is
tolerant, and proposes removing every other tooth so that tooth-to-tooth
fringing has further to reach — recovering the modulation at a 60 um gap.

HIS OWN OBJECTION IS CORRECT, and worth stating precisely because it decides
the right form of the fix. Removing every other tooth doubles the pitch while
leaving the tooth width alone, so the duty falls from 0.40 to 0.20. A
three-phase machine offsets its poles by pitch/3, and a phase can only make
force at its offset position if its tooth still PARTIALLY OVERLAPS a translator
tooth. That needs tooth width > pitch/3, i.e. duty > 1/3. At duty 0.20 the
offset (208 um) exceeds the tooth (125 um), so the energised phase sits
entirely over a slot with nothing to pull on. That is exactly the "teeth facing
gaps" he described.

THE CORRECT FORM. Do not delete teeth — SCALE the whole pattern, tooth and slot
together, holding the duty at 0.40. Then gap/tooth falls (which is what governs
fringing) while the duty condition is preserved.

TWO EFFECTS PULL AGAINST EACH OTHER, which is why this needs finite element and
not intuition:
  + a wider tooth at a fixed gap means deeper permeance modulation
  - a coarser pitch means FEWER teeth in a given pole foot, and force scales
    with the number of teeth
So the study runs both policies: a FIXED pole foot (tooth count falls as the
pitch grows) and a FIXED tooth count (the foot grows, costing actuator length).

Both carry a third cost that is not magnetic at all: the step is pitch/3, so
coarsening the pitch coarsens the positioning resolution proportionally.

Run: ~/.venvs/phantm/bin/python -m femm.tony_coarse_pitch
     -> out/tony-coarse-pitch.json
"""

from __future__ import annotations

import json
import math
import os
import time

import numpy as np

from . import lua_gen
from .sweep import CASES
from .tony_v2_fe import DEPTH, N_TURNS, R_COIL_OHM, SUPPLY_V, configure, sweep

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

BASE_PITCH = 0.312
DUTY = 0.401                    # held constant — this is the whole point
SCALES = [1.0, 1.5, 2.0, 2.5]   # pitch multipliers
GAPS_UM = [60, 80]              # Tony's ask: can we keep a big gap?
CURRENTS = [0.40, 0.70, 1.00, 1.20]
FOOT_BASE = 0.960               # as-drawn pole foot length


def set_case(scale: float, gap_um: float, policy: str):
    """policy 'fixed_foot' keeps the 960 um foot (tooth count falls);
    'fixed_teeth' keeps 3 teeth (the foot grows)."""
    configure()
    g = lua_gen
    pitch = BASE_PITCH * scale
    g.PITCH = pitch
    g.TOOTH = round(DUTY * pitch, 4)
    g.GAP = gap_um / 1000.0
    g.SS_TIP_Y = g.HT + g.GAP
    g.SS_BACK_Y0 = g.SS_TIP_Y + g.SS_SLOT_D
    g.SS_BACK_Y1 = g.SS_BACK_Y0 + g.SS_BACK_DRAWN

    if policy == "fixed_foot":
        # how many whole teeth fit the original foot at this pitch?
        n = max(1, int(math.floor(FOOT_BASE / pitch)))
        foot = FOOT_BASE
    else:
        n = 3
        foot = 3 * pitch
    g.N_POLE_TEETH = n
    g.POLE_HALF = foot / 2.0

    g.TRANSL_XL = -(g.POLE_HALF + 3 * pitch)
    g.TRANSL_XR = -g.TRANSL_XL
    g.BRIDGE_X1 = g.TRANSL_XL - g.COND_W - 0.12
    g.BRIDGE_X0 = g.BRIDGE_X1 - g.BRIDGE_T
    g.GAP_STRIP_X = g.POLE_HALF * 0.90
    g.AIR = abs(g.BRIDGE_X0) + 0.8, 1.8
    return n, foot, pitch


def run(scale, gap_um, policy, i_a):
    n, foot, pitch = set_case(scale, gap_um, policy)
    xs, fx, lam, bb = sweep(i_a)
    dc = float(np.mean(fx))
    pk = float(np.max(np.abs(fx - dc)))
    L = lam / i_a
    return dict(scale=scale, gap_um=gap_um, policy=policy, current_a=i_a,
                pitch_um=round(pitch * 1e3), tooth_um=round(DUTY * pitch * 1e3),
                pole_teeth=n, pole_foot_um=round(foot * 1e3),
                step_um=round(pitch * 1e3 / 3, 1),
                gap_over_tooth=round(gap_um / (DUTY * pitch * 1e3), 3),
                force_mn=round(pk * 1e3, 4),
                modulation_pct=round(float(L.max() - L.min())
                                     / float(L.mean()) * 100, 2),
                volts=round(i_a * R_COIL_OHM, 2),
                inside_rail=bool(i_a * R_COIL_OHM <= SUPPLY_V))


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    rows = []
    for policy in ("fixed_foot", "fixed_teeth"):
        for gap in GAPS_UM:
            for sc in SCALES:
                for i_a in CURRENTS:
                    r = run(sc, gap, policy, i_a)
                    rows.append(r)
                    if i_a == 1.00:
                        print(f"  {policy:12s} gap {gap:2d}  x{sc:.1f}  "
                              f"pitch {r['pitch_um']:4d} tooth {r['tooth_um']:3d}  "
                              f"g/t {r['gap_over_tooth']:.2f}  "
                              f"{r['pole_teeth']}teeth/{r['pole_foot_um']:4d}um  "
                              f"mod {r['modulation_pct']:5.2f}%  "
                              f"F@1.0A {r['force_mn']:7.3f} mN  "
                              f"step {r['step_um']:5.1f} um", flush=True)
    json.dump(dict(base_pitch_um=BASE_PITCH * 1e3, duty=DUTY,
                   scales=SCALES, gaps_um=GAPS_UM, currents_a=CURRENTS,
                   foot_base_um=FOOT_BASE * 1e3, rows=rows,
                   runtime_s=round(time.time() - t0, 1)),
              open(os.path.join(OUT, "tony-coarse-pitch.json"), "w"), indent=1)
    print(f"\nwrote out/tony-coarse-pitch.json ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
