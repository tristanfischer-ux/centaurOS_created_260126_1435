#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/mrr_chip_load.py

CNC material removal rate (MRR), cutting force, spindle torque, and
tool life from tool diameter + material + cutting parameters.
Stdin JSON -> stdout JSON.

Input:
    {
      "tool_diameter_mm": 10.0,
      "material": "aluminium",            # aluminium | steel | titanium | plastic | stainless | brass
      "cutting_speed_m_min": 200.0,
      "feed_per_tooth_mm": 0.05,
      "num_flutes": 4,
      "axial_depth_mm": 5.0,
      "radial_depth_mm": 5.0
    }

Output:
    {
      "mrr_cm3_min": 25.0,
      "cutting_force_n": 350.0,
      "spindle_torque_nm": 1.75,
      "spindle_power_kw": 1.5,
      "tool_life_minutes": 120.0,
      ...
    }

Method:
  V_c (cutting speed) → spindle rpm = V_c × 1000 / (π × D)
  Feed rate F = N (rpm) × Z (flutes) × f_z (per-tooth)
  MRR = a_p × a_e × F (axial × radial × feed)
  Cutting force F_c = K_s × A_chip (where K_s = specific cutting force)
    Aluminium: K_s ≈ 700-1000 N/mm²
    Steel: K_s ≈ 1800-2500 N/mm²
    Stainless: K_s ≈ 2300-2800 N/mm²
    Titanium: K_s ≈ 1500-2000 N/mm²
    Plastic: K_s ≈ 150-300 N/mm²
  Spindle torque T = F_c × D / 2 (per cutter)
  Tool life via Taylor equation: V × T^n = C
    n ≈ 0.2-0.4 for carbide, C from Sandvik handbook

Reference: Sandvik Coromant "Modern Metal Cutting" 2nd ed Ch 3,
Kennametal "Metal Cutting Technology Guide", Kistler dynamometer
calibration handbook 2018, ASM Machining Vol 16.

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
    "tool_name": 'mrr_chip_load (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'Sandvik Coromant Training Handbook; Kennametal Master Catalog; ASM Handbook Vol 16: Machining',
    "physics_basis": 'Material Removal Rate MRR = a_e × a_p × v_f (radial × axial × feed). Cutting torque T = F_c × D/2 = K_c × MRR / (π × D × n).',
    "confidence_class": 'standard',
    "last_reviewed_date": "2026-05-22",
}


# Specific cutting force K_s (N/mm²) — typical for HSS/carbide end milling
MATERIAL_KS = {
    "aluminium": 850.0,    # 6061-T6 et al
    "aluminum": 850.0,     # spelling tolerance
    "steel": 2100.0,       # 1045 mild steel
    "mild_steel": 1900.0,
    "alloy_steel": 2400.0,
    "stainless": 2500.0,   # 304/316
    "titanium": 1700.0,    # Ti-6Al-4V
    "plastic": 250.0,      # ABS / Delrin
    "brass": 1000.0,
    "copper": 1200.0,
    "cast_iron": 1100.0,
    "carbon_fibre": 400.0, # carbon composite (with PCD tool)
}

# Taylor tool-life constants (Sandvik Coromant — carbide insert in milling)
# n = exponent, C = constant such that V × T^n = C
TAYLOR_CONSTANTS = {
    "aluminium": {"n": 0.30, "C": 600},   # easy material — long life
    "aluminum": {"n": 0.30, "C": 600},
    "steel": {"n": 0.25, "C": 250},
    "mild_steel": {"n": 0.25, "C": 280},
    "alloy_steel": {"n": 0.22, "C": 200},
    "stainless": {"n": 0.20, "C": 180},
    "titanium": {"n": 0.15, "C": 130},     # difficult — short life
    "plastic": {"n": 0.40, "C": 1000},
    "brass": {"n": 0.30, "C": 500},
    "copper": {"n": 0.28, "C": 400},
    "cast_iron": {"n": 0.22, "C": 200},
    "carbon_fibre": {"n": 0.18, "C": 120},
}


def compute(payload: dict) -> dict:
    D_mm = float(payload.get("tool_diameter_mm", 10.0))
    material = str(payload.get("material", "aluminium")).strip().lower()
    V_c_m_min = float(payload.get("cutting_speed_m_min", 200.0))
    f_z_mm = float(payload.get("feed_per_tooth_mm", 0.05))
    Z = int(payload.get("num_flutes", 4))
    a_p = float(payload.get("axial_depth_mm", D_mm))
    a_e = float(payload.get("radial_depth_mm", D_mm))

    K_s = MATERIAL_KS.get(material, 1500.0)
    taylor = TAYLOR_CONSTANTS.get(material, {"n": 0.25, "C": 200})

    # Spindle rpm
    rpm = (V_c_m_min * 1000.0) / (math.pi * D_mm)

    # Feed rate (mm/min)
    feed_rate_mm_min = rpm * Z * f_z_mm

    # MRR in cm³/min
    mrr_mm3_min = a_p * a_e * feed_rate_mm_min
    mrr_cm3_min = mrr_mm3_min / 1000.0

    # Chip cross-section per tooth ≈ a_p × f_z (face mill) or a_p × f_z × sin(φ) (peripheral)
    # Use mean chip thickness: h_m = f_z × sin(φ_avg) where φ_avg ≈ 60° for typical slotting
    # For full-slot (a_e = D), avg engagement angle is 90°.
    eng_frac = a_e / D_mm
    if eng_frac >= 0.99:
        sin_avg = 1.0
    else:
        # Average engagement angle
        phi_max_rad = math.acos(max(-1.0, min(1.0, 1.0 - 2.0 * eng_frac)))
        sin_avg = math.sin(phi_max_rad / 2.0)

    h_m_mm = f_z_mm * sin_avg
    A_chip_mm2 = a_p * h_m_mm

    # Cutting force per tooth
    F_c_n = K_s * A_chip_mm2
    # Effective teeth in cut at any moment
    teeth_in_cut = max(1, int(round(Z * eng_frac)))
    F_c_total_n = F_c_n * teeth_in_cut

    # Spindle torque (mean)
    T_spindle_nm = F_c_total_n * (D_mm * 1e-3) / 2.0

    # Spindle power: P = T × ω
    omega = (rpm / 60.0) * 2.0 * math.pi  # rad/s
    P_spindle_kw = (T_spindle_nm * omega) / 1000.0

    # Tool life from Taylor: V × T^n = C → T = (C / V)^(1/n)
    n = taylor["n"]
    C = taylor["C"]
    if V_c_m_min > 0:
        T_life_min = (C / V_c_m_min) ** (1.0 / max(0.01, n))
        T_life_min = max(0.1, min(10000.0, T_life_min))
    else:
        T_life_min = 0.0

    # Worked calculations.
    # rpm uses pi — transcendental; pass as live symbol.
    # feed_rate = rpm × Z × f_z is clean given live rpm.
    # mrr = a_p × a_e × feed_rate / 1000 is clean.
    # Chip thickness h_m uses sin for partial engagement (transcendental);
    # pass h_m and A_chip as live symbols for F_c and T steps.
    # Spindle power uses pi via omega — skip; pass P_spindle_kw as live value.
    # Taylor tool life uses fractional exponent — transcendental; skip.
    rpm_r = round(rpm, 1)
    feed_rate_r = round(feed_rate_mm_min, 1)
    mrr_r = round(mrr_cm3_min, 3)
    A_chip_r = round(A_chip_mm2, 4)
    F_c_n_r = round(F_c_n, 1)
    F_c_total_r = round(F_c_total_n, 1)
    T_spindle_r = round(T_spindle_nm, 4)
    worked = [
        worked_calc(
            label="Table feed rate",
            formula="feed_rate = rpm x Z x f_z",
            values={"rpm": (rpm_r, "rev/min"), "Z": (Z, ""), "f_z": (f_z_mm, "mm")},
            result=feed_rate_r, result_unit="mm/min",
            assumptions=["rpm already corrected for pi×D (transcendental — passed as live value)"],
        ),
        worked_calc(
            label="Material removal rate",
            formula="MRR = a_p x a_e x feed_rate / 1000",
            values={"a_p": (a_p, "mm"), "a_e": (a_e, "mm"), "feed_rate": (feed_rate_r, "mm/min")},
            result=mrr_r, result_unit="cm3/min",
            assumptions=["÷ 1000 converts mm3/min to cm3/min"],
        ),
        worked_calc(
            label="Cutting force per tooth",
            formula="F_c = K_s x A_chip",
            values={"K_s": (K_s, "N/mm2"), "A_chip": (A_chip_r, "mm2")},
            result=F_c_n_r, result_unit="N",
            assumptions=[
                f"K_s = {K_s} N/mm2 for {material} (Sandvik Coromant handbook)",
                "A_chip = a_p × h_m where h_m from engagement geometry (passed as live value)",
            ],
        ),
        worked_calc(
            label="Total cutting force (all teeth in cut)",
            formula="F_c_total = F_c x teeth_in_cut",
            values={"F_c": (F_c_n_r, "N"), "teeth_in_cut": (teeth_in_cut, "")},
            result=F_c_total_r, result_unit="N",
            assumptions=[f"teeth_in_cut = {teeth_in_cut} (engagement fraction {round(eng_frac,3)})"],
        ),
        worked_calc(
            label="Spindle torque",
            formula="T_spindle = F_c_total x (D_mm / 2) / 1000",
            values={"F_c_total": (F_c_total_r, "N"), "D_mm": (D_mm, "mm")},
            result=T_spindle_r, result_unit="N·m",
            assumptions=["÷ 1000 converts mm to m for SI torque"],
        ),
    ]

    return {
        "mrr_cm3_min": round(mrr_cm3_min, 3),
        "cutting_force_n": round(F_c_total_n, 1),
        "spindle_torque_nm": round(T_spindle_nm, 4),
        "spindle_power_kw": round(P_spindle_kw, 4),
        "tool_life_minutes": round(T_life_min, 1),
        "spindle_rpm": round(rpm, 1),
        "feed_rate_mm_min": round(feed_rate_mm_min, 1),
        "chip_thickness_mean_mm": round(h_m_mm, 4),
        "chip_area_per_tooth_mm2": round(A_chip_mm2, 4),
        "cutting_force_per_tooth_n": round(F_c_n, 1),
        "teeth_engaged": teeth_in_cut,
        "engagement_fraction": round(eng_frac, 3),
        "k_s_n_mm2": K_s,
        "material": material,
        "tool_diameter_mm": D_mm,
        "cutting_speed_m_min": V_c_m_min,
        "feed_per_tooth_mm": f_z_mm,
        "num_flutes": Z,
        "axial_depth_mm": a_p,
        "radial_depth_mm": a_e,
        "taylor_n": n,
        "taylor_c": C,
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
