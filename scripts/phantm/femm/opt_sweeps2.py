"""PHANTM optimisation — batch 2: stack the batch-1 winners (interactions).

duty 0.40/0.45 × deep translator slots (1.25/1.5×) at gap 20 — the margin push;
plus the V2 rescue: gap 40 µm + N52 + duty + deep slots (does the stack recover
5 g and delete the gauged-gap assembly step?); plus duty 0.30 × deep slots to
test whether the drawn-registration outlier survives with the light translator.

Run:  cd scripts/phantm && python -m femm.opt_sweeps2 → out/opt/opt-sweeps-2.json
"""
from __future__ import annotations

import json
import os
import time

from params import BASELINE
from . import lua_gen
from .fixed_design import FIXED
from .opt_sweeps import OUT, reset_base, run_point
from .variants import apply_variant

POINTS = [
    # (tag, gap, duty, tslot_scale, br)
    ("d.40 t1.25",        0.020, 0.40, 1.25, 1.30),
    ("d.40 t1.50",        0.020, 0.40, 1.50, 1.30),
    ("d.45 t1.25",        0.020, 0.45, 1.25, 1.30),
    ("d.45 t1.50",        0.020, 0.45, 1.50, 1.30),
    ("d.30 t1.50",        0.020, 0.30, 1.50, 1.30),
    ("V2 g40 d.40 t1.50 N52", 0.040, 0.40, 1.50, 1.45),
    ("V2 g40 d.45 t1.50 N52", 0.040, 0.45, 1.50, 1.45),
]


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for tag, gap, duty, ts, br in POINTS:
        reset_base()
        tooth = round(duty * lua_gen.PITCH, 4)
        apply_variant(dict(FIXED, gap=gap, tooth=tooth))
        lua_gen.SLOT_T = round(0.465 * ts, 4)
        BASELINE.materials.ndfeb_br_t = br
        fam = "V2-stack" if gap > 0.03 else "P2-stack"
        rows.append(run_point(tag, fam, tag))
    reset_base()
    json.dump({"rows": rows, "runtime_s": round(time.time() - t0, 1)},
              open(os.path.join(OUT, "opt-sweeps-2.json"), "w"), indent=1)
    print(f"\nwrote out/opt/opt-sweeps-2.json ({time.time()-t0:.0f} s)")


if __name__ == "__main__":
    main()
