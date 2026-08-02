"""Four-phase geometry ladder + mixed MIM-pole / Fe-Co translator materials.

Builds on tony_v2_fe / tony_v2_matrix. Coil-only reluctance force (magnet
remanence zero). Writes out/tony-phase-material-study.json.

Variants (step fixed at 104 micrometres):
  A  three-phase baseline — pitch 312 um, tooth 125 um, three teeth per pole
  B  four-phase, four teeth per pole — pitch 416 um, tooth ~167 um
  C  four-phase, three teeth per pole — same pitch/tooth as B (Tony: ~25% less
     force than B, shorter pole foot than B)

Materials (at as-drawn 60 um gap, baseline geometry A unless noted):
  all Fe-Co laminated curve
  all micro-injection-moulded Fe-3%Si curve
  mixed: translator Fe-Co, poles+bridge MIM Fe-3%Si

Run: ~/.venvs/phantm/bin/python -m femm.tony_phase_material_study
"""

from __future__ import annotations

import json
import math
import os
import sys
import time

import numpy as np

# force_claim_guards lives one level up (scripts/phantm/)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from force_claim_guards import current_for_force, enrich_study_comparisons  # noqa: E402

from materials import FeCoLaminated, MimFe3Si, SmcMaterial
from . import lua_gen
from .tony_v2_fe import (CURRENTS, DEPTH, N_TURNS, R_COIL_OHM, SUPPLY_V,
                         configure, sweep)
from .sweep import CASES

OUT = os.path.join(os.path.dirname(__file__), "..", "out")

STEP_UM = 104.0
DUTY = 125.0 / 312.0
# lean current set — enough to see linear vs near-rail behaviour
STUDY_CURRENTS = [0.40, 0.70, 1.00, 1.20, 1.40]
GAPS_UM = [60, 40, 30, 20]


def _interp_i(rows, target_mn):
    """Bracket-only: None when target is above the sweep (no silent extrapolate)."""
    # FLOW: honest method labels live in force_claim_guards.current_for_force;
    # this helper stays bracket-only so summary.i_for_* never pretends a
    # linear extension is an in-sweep result.
    est = current_for_force(rows, target_mn)
    if est["method"] != "bracket":
        return None
    return est["current_a"]


def configure_geometry(pitch_um: float, tooth_um: float, gap_um: float,
                       n_pole_teeth: int):
    """Point lua_gen at a pitch / tooth / gap / pole-tooth-count variant."""
    configure()  # v2 defaults, then override
    g = lua_gen
    pitch = pitch_um / 1000.0
    tooth = tooth_um / 1000.0
    gap = gap_um / 1000.0
    g.PITCH = pitch
    g.TOOTH = tooth
    g.GAP = gap
    g.N_POLE_TEETH = n_pole_teeth
    g.SS_TIP_Y = g.HT + gap
    g.SS_BACK_Y0 = g.SS_TIP_Y + g.SS_SLOT_D
    g.SS_BACK_Y1 = g.SS_BACK_Y0 + g.SS_BACK_DRAWN
    # Pole foot: outermost land centre ± tooth/2 + small margin
    centres = g.pole_tooth_centres()
    g.POLE_HALF = abs(centres[0]) + tooth / 2.0 + 0.05
    end_clear = 3.0 * pitch
    g.TRANSL_XR = g.POLE_HALF + end_clear
    g.TRANSL_XL = -g.TRANSL_XR
    g.BRIDGE_X1 = g.TRANSL_XL - g.COND_W - 0.12
    g.BRIDGE_X0 = g.BRIDGE_X1 - g.BRIDGE_T
    g.GAP_STRIP_X = g.POLE_HALF * 0.90
    g.AIR = abs(g.BRIDGE_X0) + 0.8, 1.8
    g.POLE_BH_POINTS = None  # reset unless a material case sets it


def force_row(i_a: float) -> dict:
    xs, fx, lam, bb = sweep(i_a)
    dc = float(np.mean(fx))
    pk = float(np.max(np.abs(fx - dc)))
    L = lam / i_a
    return dict(
        current_a=i_a,
        force_mn=round(pk * 1e3, 4),
        modulation_pct=round(float(L.max() - L.min()) / float(L.mean()) * 100, 2),
        b_bridge_max_t=round(float(np.max(bb)), 3),
        volts=round(i_a * R_COIL_OHM, 2),
        inside_rail=bool(i_a * R_COIL_OHM <= SUPPLY_V),
        pole_foot_mm=round(2 * lua_gen.POLE_HALF, 3),
        n_pole_teeth=int(lua_gen.N_POLE_TEETH),
    )


def run_gap_ladder(pitch_um, tooth_um, n_pole_teeth, gaps=GAPS_UM,
                   currents=STUDY_CURRENTS):
    by_gap = {}
    for gap in gaps:
        configure_geometry(pitch_um, tooth_um, gap, n_pole_teeth)
        rows = []
        for i_a in currents:
            row = force_row(i_a)
            rows.append(row)
            print(f"    gap {gap:3.0f} um  {i_a:.2f} A -> "
                  f"{row['force_mn']:7.3f} mN  mod {row['modulation_pct']:5.2f}%  "
                  f"foot {row['pole_foot_mm']:.2f} mm", flush=True)
        by_gap[str(int(gap))] = rows
    return by_gap


def run_material_cases(pitch_um=312.0, tooth_um=125.0, gap_um=60.0,
                       n_pole_teeth=3, currents=(0.40, 1.00, 1.20)):
    """Compare soft-magnetic curves at one geometry (mixed poles vs strip)."""
    feco = FeCoLaminated().femm_bh_points()
    mim = MimFe3Si().femm_bh_points()
    somaloy = SmcMaterial().femm_bh_points()  # legacy baseline curve
    cases = [
        ("all_somaloy_legacy", somaloy, None),
        ("all_fe_co_laminated", feco, None),
        ("all_mim_fe3si", mim, None),
        ("translator_fe_co__poles_mim", feco, mim),
    ]
    out = {}
    for name, transl_bh, pole_bh in cases:
        configure_geometry(pitch_um, tooth_um, gap_um, n_pole_teeth)
        # inject B-H into actuator_lua via smc_bh_points arg — need sweep to pass it
        # DECISION: temporarily monkey-patch run_case path by setting module
        # defaults used inside actuator_lua when smc_bh_points is None — instead
        # patch tony_v2_fe.run_case... easier: set a thread-local via lua_gen
        # and change actuator_lua to read DEFAULT_BH — already uses SmcMaterial()
        # when smc_bh_points is None. So patch SmcMaterial temporarily? Ugly.
        # Cleaner: pass through sweep → run_case → actuator_lua.
        rows = []
        for i_a in currents:
            configure_geometry(pitch_um, tooth_um, gap_um, n_pole_teeth)
            lua_gen.POLE_BH_POINTS = pole_bh
            # translator curve: temporarily replace via wrapping run_case
            from . import sweep as sweep_mod
            xs = (np.arange(16) / 16 - 0.5) * lua_gen.PITCH

            def one(x, ia=i_a, bh=transl_bh):
                from .runner import run_lua
                tag = f"mat_{sweep_mod._counter[0]:05d}"
                sweep_mod._counter[0] += 1
                path = os.path.join(CASES, f"{tag}.lua")
                from .lua_gen import actuator_lua
                with open(path, "w") as f:
                    f.write(actuator_lua(float(x), ia, 0.05, f"{tag}.fem",
                                         smc_bh_points=bh))
                res = run_lua(path)
                for ext in (".lua", ".fem", ".ans"):
                    p = os.path.join(CASES, f"{tag}{ext}")
                    if os.path.exists(p):
                        os.remove(p)
                return res

            from concurrent.futures import ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=6) as ex:
                res = list(ex.map(one, xs))
            fx = np.array([r["fx"] for r in res])
            bb = np.array([abs(r["bridge_by_int"] / r["bridge_vol"]) for r in res])
            dc = float(np.mean(fx))
            pk = float(np.max(np.abs(fx - dc)))
            rows.append(dict(
                current_a=i_a,
                force_mn=round(pk * 1e3, 4),
                b_bridge_max_t=round(float(np.max(bb)), 3),
            ))
            print(f"    {name:40s}  {i_a:.2f} A -> {pk*1e3:7.3f} mN  "
                  f"B_bridge {float(np.max(bb)):.2f} T", flush=True)
        lua_gen.POLE_BH_POINTS = None
        out[name] = rows
    return out


def main():
    t0 = time.time()
    os.makedirs(CASES, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    pitch3 = 3 * STEP_UM
    tooth3 = DUTY * pitch3
    pitch4 = 4 * STEP_UM
    tooth4 = DUTY * pitch4

    variants = {
        "A_three_phase_3_teeth": dict(
            label="Three-phase baseline (today)",
            phases=3, pitch_um=pitch3, tooth_um=tooth3, n_pole_teeth=3,
            stator_cost_index=1.0,
            note="pitch/3 = 104 um step"),
        "B_four_phase_4_teeth": dict(
            label="Four-phase, four teeth per pole",
            phases=4, pitch_um=pitch4, tooth_um=tooth4, n_pole_teeth=4,
            stator_cost_index=4 / 3,
            note="wider teeth; longer pole foot; ~+33% stator channels"),
        "C_four_phase_3_teeth": dict(
            label="Four-phase, three teeth per pole",
            phases=4, pitch_um=pitch4, tooth_um=tooth4, n_pole_teeth=3,
            stator_cost_index=4 / 3,
            note="Tony: recovers some length vs B; expects ~25% less force than B"),
    }

    results = {"step_um": STEP_UM, "duty": DUTY, "currents_a": STUDY_CURRENTS,
               "gaps_um": GAPS_UM, "variants": {}, "materials": {},
               "targets_mn": {"detent": 11.127, "step_1_5": 16.69}}

    for key, meta in variants.items():
        print(f"\n=== {meta['label']} ===", flush=True)
        by_gap = run_gap_ladder(meta["pitch_um"], meta["tooth_um"],
                                meta["n_pole_teeth"])
        # summary at 0.40 A and currents for targets at each gap
        summary = {}
        for gap, rows in by_gap.items():
            f04 = next(r["force_mn"] for r in rows if r["current_a"] == 0.40)
            summary[gap] = dict(
                force_at_0_40_a_mn=f04,
                i_for_detent_a=_interp_i(rows, 11.127),
                i_for_1_5_detent_a=_interp_i(rows, 16.69),
                pole_foot_mm=rows[0]["pole_foot_mm"],
                gap_over_tooth=round(float(gap) / meta["tooth_um"], 3),
            )
        results["variants"][key] = dict(meta=meta, by_gap=by_gap,
                                        summary=summary)

    # Relative force B vs A and C vs B at 0.40 A / 60 um
    def f040(key, gap="60"):
        return next(r["force_mn"] for r in results["variants"][key]["by_gap"][gap]
                    if r["current_a"] == 0.40)

    results["comparisons"] = {
        "force_ratio_B_over_A_at_0_40A": {
            str(g): round(f040("B_four_phase_4_teeth", str(g)) /
                          f040("A_three_phase_3_teeth", str(g)), 3)
            for g in GAPS_UM},
        "force_ratio_C_over_B_at_0_40A": {
            str(g): round(f040("C_four_phase_3_teeth", str(g)) /
                          f040("B_four_phase_4_teeth", str(g)), 3)
            for g in GAPS_UM},
        "tony_expected_C_over_B": 0.75,
        "stator_cost_index_four_phase": 4 / 3,
    }

    # DECISION: always attach normalised ratios + HARD claim guards so a
    # later PDF writer cannot ship absolute-only "four-phase helps +33%" /
    # "not Tony's 25%" without seeing the coil-count and per-foot story.
    audit = enrich_study_comparisons(results)
    for line in audit["required_client_lines"]:
        print(f"  GUARD: {line}", flush=True)

    print("\n=== Material curves @ 60 um, three-phase geometry ===", flush=True)
    results["materials"] = run_material_cases()

    results["runtime_s"] = round(time.time() - t0, 1)
    path = os.path.join(OUT, "tony-phase-material-study.json")
    json.dump(results, open(path, "w"), indent=1)
    print(f"\nwrote {path} ({results['runtime_s']:.0f} s)")
    print("Comparisons B/A @0.40A:", results["comparisons"]["force_ratio_B_over_A_at_0_40A"])
    print("Comparisons C/B @0.40A:", results["comparisons"]["force_ratio_C_over_B_at_0_40A"])


if __name__ == "__main__":
    main()
