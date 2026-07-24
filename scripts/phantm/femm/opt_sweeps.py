"""PHANTM optimisation campaign — Phase 1 batch 1 (plan v1.1).

Sweeps on the FIXED design (gap 20 µm, bridge ×1.5), variants.py methodology:
per point → detent breakaway (as-drawn AND exact-⅓ registration), per-pole
h1/h3, flux modulation, drive force at quarter-pitch (1.8 A), bridge |B|,
plus ANALYTIC translator mass → detent margin in g (the honest ranking metric:
force alone is not the objective — force per moving weight is).

Families this batch:
  1A duty   — tooth width 0.30–0.50 × pitch (fixed 464 µm pitch)
  1B-t      — translator slot depth 0.5–1.5×
  1B-s      — stator slot depth 0.5–2×
  V2        — gap 40 µm recovery: duty × N52 (Br 1.45)

Run:  cd scripts/phantm && ../../.venv-or-phantm python -m femm.opt_sweeps
Artefacts: out/opt/opt-sweeps-1.json + SCOREBOARD.md rows + fig-opt-*.png
"""
from __future__ import annotations

import json
import os
import time

import numpy as np

import geometry as geo
from params import BASELINE
from . import lua_gen
from .sweep import FeForceModel, breakaway, fourier_fit, net_force, run_case, sweep_pitch
from .variants import apply_variant
from .fixed_design import BRIDGE_SCALE, FIXED

OUT = os.path.join(os.path.dirname(__file__), "..", "out", "opt")
G = 9.80665
PM_STUDY = 0.243     # fixed-design Pm* — realistic operating point for ranking
I_STUDY = 1.8        # stepping current


def reset_base():
    apply_variant(dict(FIXED))
    lua_gen.BRIDGE_T = 0.232 * (1.162 / 1.55) * BRIDGE_SCALE
    lua_gen.BRIDGE_X0 = lua_gen.BRIDGE_X1 - lua_gen.BRIDGE_T
    lua_gen.SLOT_T = 0.465
    BASELINE.materials.ndfeb_br_t = 1.30


def translator_mass_mg():
    slot_w = lua_gen.PITCH - lua_gen.TOOTH
    v = 1.549 * 1.55 * 12.5 - 2 * 26 * lua_gen.SLOT_T * slot_w * 1.55
    return v * 7.4


def run_point(name, family, setting):
    p = lua_gen.PITCH
    offsets_drawn = [o for o in geo.pole_phasing(BASELINE)[1]]
    offsets_exact = [0.0, p / 3, 2 * p / 3]
    xs, fx, wco, lam, bb = sweep_pitch(0.0, PM_STUDY)
    model = FeForceModel(xs, fx)
    bk_drawn = breakaway(lambda x: net_force(x, None, model, offsets_drawn))
    bk_exact = breakaway(lambda x: net_force(x, None, model, offsets_exact))
    _, a, b = fourier_fit(xs, fx)
    amp = np.hypot(a, b)
    r_drv = run_case(-0.116, I_STUDY, PM_STUDY)
    drv = r_drv["fx"] - model(-0.116)
    lam_mod = (np.max(np.abs(lam)) - np.min(np.abs(lam))) / np.max(np.abs(lam))
    m_mg = translator_mass_mg()
    fd_req = 5 * G * m_mg * 1e-6            # N
    row = dict(name=name, family=family, setting=setting,
               tooth_um=round(lua_gen.TOOTH * 1e3, 1),
               tslot_um=round(lua_gen.SLOT_T * 1e3, 1),
               sslot_um=round(lua_gen.SS_SLOT_D * 1e3, 1),
               gap_um=round(lua_gen.GAP * 1e3, 1),
               br_t=BASELINE.materials.ndfeb_br_t,
               mass_mg=round(m_mg, 1),
               bk_drawn_mn=round(bk_drawn * 1e3, 3),
               bk_exact_mn=round(bk_exact * 1e3, 3),
               margin_g_drawn=round(bk_drawn / (G * m_mg * 1e-6), 2),
               h1_mn=round(float(amp[0]) * 1e3, 3),
               h3_mn=round(float(amp[2]) * 1e3, 3),
               flux_mod=round(float(lam_mod), 4),
               drv_quarter_mn=round(float(drv) * 1e3, 3),
               b_bridge_t=round(float(np.max(np.abs(bb))), 2),
               fd_target_mn=round(fd_req * 1e3, 3))
    print(f"{name:26s} bk={row['bk_drawn_mn']:7.3f}/{row['bk_exact_mn']:7.3f} mN "
          f"({row['margin_g_drawn']:5.2f} g)  drv={row['drv_quarter_mn']:7.3f}  "
          f"h1={row['h1_mn']:6.3f} mod={row['flux_mod']:5.1%} m={row['mass_mg']:.0f} mg",
          flush=True)
    return row


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    rows = []

    # ---- 1A duty (tooth width at fixed pitch) --------------------------------
    for duty in (0.30, 0.35, 0.40, 0.45, 0.50):
        reset_base()
        lua_gen.TOOTH = round(duty * lua_gen.PITCH, 4)
        apply_variant(dict(FIXED, tooth=lua_gen.TOOTH))
        lua_gen.SLOT_T = 0.465
        rows.append(run_point(f"duty {duty:.2f}p", "1A-duty", duty))

    # ---- 1B-t translator slot depth ------------------------------------------
    for k in (0.5, 0.75, 1.0, 1.25, 1.5):
        reset_base()
        lua_gen.SLOT_T = round(0.465 * k, 4)
        rows.append(run_point(f"tslot {k:.2f}x", "1B-tslot", k))

    # ---- 1B-s stator slot depth -----------------------------------------------
    for k in (0.5, 0.75, 1.0, 1.5, 2.0):
        reset_base()
        apply_variant(dict(FIXED, ss_slot_d=round(0.155 * k, 4)))
        lua_gen.SLOT_T = 0.465
        rows.append(run_point(f"sslot {k:.2f}x", "1B-sslot", k))

    # ---- V2 gap-40 recovery ----------------------------------------------------
    for tooth, br, tag in ((0.232, 1.30, "g40 base"),
                           (0.186, 1.30, "g40 duty.40"),
                           (0.186, 1.45, "g40 duty.40 N52"),
                           (0.163, 1.45, "g40 duty.35 N52")):
        reset_base()
        apply_variant(dict(FIXED, gap=0.040, tooth=tooth))
        lua_gen.SLOT_T = 0.465
        BASELINE.materials.ndfeb_br_t = br
        rows.append(run_point(f"V2 {tag}", "V2-gap40", tag))

    reset_base()
    json.dump({"pm_study_mm": PM_STUDY, "i_study_a": I_STUDY,
               "rows": rows, "runtime_s": round(time.time() - t0, 1)},
              open(os.path.join(OUT, "opt-sweeps-1.json"), "w"), indent=1)
    print(f"\nwrote out/opt/opt-sweeps-1.json ({time.time()-t0:.0f} s, {len(rows)} rows)")


if __name__ == "__main__":
    main()
