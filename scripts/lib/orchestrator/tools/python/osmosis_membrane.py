#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/osmosis_membrane.py

Hemodialysis membrane clearance — urea / creatinine / phosphate
removal rate from dialyser KoA, blood + dialysate flows.
Stdin JSON -> stdout JSON.

Input:
    {
      "membrane_area_m2": 1.8,
      "KoA_ml_min_per_m2": 1200.0,         # urea KoA — high-flux ≥ 1000
      "blood_flow_ml_min": 350.0,
      "dialysate_flow_ml_min": 500.0,
      "session_minutes": 240.0,
      "patient_v_total_l": 42.0,            # body water volume
      "solute": "urea"                      # urea | creatinine | phosphate | beta2_microglobulin
    }

Output:
    {
      "urea_clearance_ml_min": 250.0,
      "creatinine_clearance_ml_min": 180.0,
      "Kt_V_per_session": 1.3,
      ...
    }

Method:
  - KoA × A_membrane = K (overall mass transfer coefficient × area, ml/min)
  - Counter-current dialyser efficiency (Babb 1971, Michaels 1966):
    K = K_blood_max × [1 - exp(-Z)] / [1 - (Q_b/Q_d) × exp(-Z)]
    where Z = KoA × A × (1/Q_b - 1/Q_d)
  - Kt/V = (K × t) / V_distribution (Kt/V ≥ 1.2 per HD session targets)

Solute-specific KoA (typical high-flux dialyser, Polyflux 17R, F8HPS):
  - Urea (MW 60): KoA = 1000-1300 ml/min
  - Creatinine (MW 113): KoA = 700-900 ml/min
  - Phosphate (MW 97 as PO4): KoA = 500-700 ml/min
  - β2-microglobulin (MW 11.8 kDa): KoA = 50-100 ml/min (with high-flux only)

Reference: Daugirdas/Blake/Ing "Handbook of Dialysis" 5th ed Ch 3, Babb
et al "Engineering aspects of artificial kidneys" Trans ASAIO 1971,
KDOQI Clinical Practice Guidelines for Hemodialysis Adequacy 2015.

License: MIT.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _worked import worked_calc  # noqa: E402


# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'osmosis_membrane (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": "Daugirdas, Blake, Ing eds. (2014), 'Handbook of Dialysis' 5th ed., Wolters Kluwer; Michaels (1966), 'Diffusion in a Restricted Volume', AIChE J. 12(5):1006-1010",
    "physics_basis": 'Dialyser clearance: K = Q_b × (1 - exp(-NTU)) where NTU = K_o × A / Q_b. Kt/V calculation per Daugirdas single-pool model.',
    "confidence_class": 'textbook',
    "last_reviewed_date": "2026-05-22",
}


SOLUTE_KoA_DEFAULTS = {
    "urea": 1200.0,
    "creatinine": 800.0,
    "phosphate": 600.0,
    "beta2_microglobulin": 75.0,
    "vitamin_b12": 200.0,
    "potassium": 1100.0,
    "sodium": 1200.0,
}


def koa_per_m2_for_solute(solute: str) -> float:
    return SOLUTE_KoA_DEFAULTS.get(solute, 800.0)


def clearance_michaels(KoA: float, A: float, Q_b: float, Q_d: float) -> float:
    """
    Michaels (1966) counter-current dialyser clearance equation.
    KoA: ml/min/m² × m² (the input here is already KoA_per_m2 × A, so
        we receive KoA*A as "KoA_eff").
    Returns K (clearance in ml/min)

    K = Q_b × (1 - exp(-NTU(1-Z))) / (1 - Z·exp(-NTU(1-Z)))
       where NTU = KoA / Q_b and Z = Q_b / Q_d
    """
    KoA_eff = KoA * A
    NTU = KoA_eff / max(1e-9, Q_b)
    Z = Q_b / max(1e-9, Q_d)
    if abs(1.0 - Z) < 1e-6:
        # Q_b ≈ Q_d: limiting case
        return (KoA_eff * Q_b) / (KoA_eff + Q_b)
    arg = -NTU * (1.0 - Z)
    exp_arg = math.exp(arg)
    numerator = 1.0 - exp_arg
    denominator = 1.0 - Z * exp_arg
    K = Q_b * (numerator / denominator)
    # Hard cap: clearance cannot exceed inlet flow
    return min(Q_b, max(0.0, K))


def compute(payload: dict) -> dict:
    A_m2 = float(payload.get("membrane_area_m2", 1.8))
    KoA_input = payload.get("KoA_ml_min_per_m2")
    Q_b = float(payload.get("blood_flow_ml_min", 350.0))
    Q_d = float(payload.get("dialysate_flow_ml_min", 500.0))
    t_min = float(payload.get("session_minutes", 240.0))
    V_l = float(payload.get("patient_v_total_l", 42.0))
    solute = str(payload.get("solute", "urea")).strip().lower()

    if KoA_input is None:
        KoA_per_m2 = koa_per_m2_for_solute(solute)
    else:
        KoA_per_m2 = float(KoA_input)

    # Compute clearances for urea + creatinine in parallel for reporting
    KoA_urea = SOLUTE_KoA_DEFAULTS["urea"]
    KoA_creat = SOLUTE_KoA_DEFAULTS["creatinine"]
    K_urea = clearance_michaels(KoA_urea, A_m2, Q_b, Q_d)
    K_creat = clearance_michaels(KoA_creat, A_m2, Q_b, Q_d)
    K_solute = clearance_michaels(KoA_per_m2, A_m2, Q_b, Q_d)

    # Kt/V for urea (the canonical dialysis adequacy metric)
    V_ml = V_l * 1000.0
    Kt_V = (K_urea * t_min) / max(1e-3, V_ml)

    # URR (urea reduction ratio) ≈ 1 - exp(-Kt/V)
    URR_pct = (1.0 - math.exp(-Kt_V)) * 100.0

    # Dialyser efficiency
    eta_dialyser = K_urea / min(Q_b, Q_d)

    # Equilibrated Kt/V (eKt/V) ≈ Kt/V - 0.6 × (Kt/V) / t_hr + 0.03
    t_hr = t_min / 60.0
    if t_hr > 0:
        eKt_V = Kt_V - 0.6 * Kt_V / t_hr + 0.03
    else:
        eKt_V = Kt_V

    # Worked calculations — clean arithmetic steps only.
    # K_urea/K_creat/K_solute use clearance_michaels() which contains exp() — skipped.
    # URR_pct uses exp() — skipped. Pass clearance values as live inputs.
    k_urea_r = round(K_urea, 2)
    kt_v_r = round(Kt_V, 3)
    ekt_v_r = round(eKt_V, 3)
    eta_r = round(eta_dialyser, 3)
    worked = [
        worked_calc(
            label="Kt/V dialysis dose per session",
            formula="Kt_V = (K_urea x t_min) / V_ml",
            values={
                "K_urea": (k_urea_r, "ml/min"),
                "t_min": (t_min, "min"),
                "V_ml": (V_l * 1000.0, "ml"),
            },
            result=kt_v_r, result_unit="",
            assumptions=["single-pool urea model (Daugirdas 2014); V = patient total body water x 1000"],
        ),
        worked_calc(
            label="Equilibrated Kt/V (eKt/V)",
            formula="eKt_V = Kt_V - 0.6 x Kt_V / t_hr + 0.03",
            values={
                "Kt_V": (kt_v_r, ""),
                "t_hr": (round(t_min / 60.0, 3), "h"),
            },
            result=ekt_v_r, result_unit="",
            assumptions=["Daugirdas eKt/V correction for post-dialysis rebound (Daugirdas 2014 Ch 3)"],
        ),
        worked_calc(
            label="Dialyser efficiency",
            formula="eta_dialyser = K_urea / min_Q",
            values={
                "K_urea": (k_urea_r, "ml/min"),
                "min_Q": (min(Q_b, Q_d), "ml/min"),
            },
            result=eta_r, result_unit="",
            assumptions=[
                "min_Q = min(blood_flow, dialysate_flow) — limiting flow rate",
                "efficiency capped by limiting flow (blood or dialysate)",
            ],
        ),
    ]

    return {
        "urea_clearance_ml_min": round(K_urea, 2),
        "creatinine_clearance_ml_min": round(K_creat, 2),
        "solute_clearance_ml_min": round(K_solute, 2),
        "Kt_V_per_session": round(Kt_V, 3),
        "ekt_v_equilibrated": round(eKt_V, 3),
        "URR_pct": round(URR_pct, 1),
        "membrane_area_m2": A_m2,
        "blood_flow_ml_min": Q_b,
        "dialysate_flow_ml_min": Q_d,
        "session_minutes": t_min,
        "patient_v_total_l": V_l,
        "solute": solute,
        "koa_solute_ml_min_per_m2": round(KoA_per_m2, 1),
        "koa_urea_ml_min_per_m2": KoA_urea,
        "dialyser_efficiency": round(eta_dialyser, 3),
        "kdoqi_adequate_kt_v_ge_1_4": Kt_V >= 1.4,
        "urea_KoA_total_ml_min": round(KoA_urea * A_m2, 1),
        "worked": worked,
    }


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        if isinstance(result, dict):
            result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
